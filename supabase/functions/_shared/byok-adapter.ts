import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  CredentialUnreadableError,
  decryptCredential,
  toBase64,
} from "./byok-envelope.ts";
import { keyForVersion, requireMasterKeyRing, type MasterKeyRing } from "./byok-rotation.ts";
import { JobFailure } from "./job-failure.ts";
import { Secret } from "./byok-secret.ts";

/**
 * `BYOK-ADAPTER-003` — the one Deno path from a claimed job to a usable
 * credential.
 *
 * resolve → decrypt → hand back a `Secret`. No other module in either Edge
 * Function may do any of those three, and `byok-worker-guard.test.ts`
 * (`BYOK-GUARD-003`) asserts it by reading the handlers' sources.
 *
 * ## Why this takes a job id and nothing else
 *
 * The worker is the one place where "whose credential?" and "who asked?" are
 * genuinely different questions. A direct invocation carries an end-user bearer
 * token; the job it names belongs to whoever `jobs.user_id` says it does. If the
 * adapter accepted an owner, every call site would become a place somebody could
 * pass the invoking user instead of the job's — and that substitution is exactly
 * the cross-user leak this whole slice exists to make impossible.
 *
 * So the signature admits **only a job id**, and both facts derived from it come
 * out of the row:
 *
 *   * the envelope, from `resolve_job_ai_credential(p_job_id)`, which reads
 *     `jobs.user_id` itself and takes no owner argument (`BYOK-RESOLVER-003`);
 *   * the AAD owner, from a second read of `jobs.user_id` **here**, rather than
 *     from a `user_id` the caller hands over.
 *
 * The second read is not redundant. The AAD binds the ciphertext to
 * `(user_id, key_version, provider)`; if that owner could be supplied by a
 * caller, a wrong one would produce `credential_unreadable` rather than a wrong
 * decryption — safe, but only by accident. Reading it from the row makes the
 * safety structural, and it costs one indexed primary-key lookup on a path that
 * is about to make an HTTPS call to OpenAI.
 *
 * ## Why the outcomes are the Node vocabulary
 *
 * `BYOK-ADAPTER-004` requires the two adapters to agree on the failure
 * vocabulary, and `src/lib/byok/adapter-parity.test.ts` fails the build if they
 * drift. The Node adapter returns a discriminated union because its caller is a
 * Server Action rendering copy; this one throws a `JobFailure` carrying the same
 * code, because its caller is a job handler whose only next move is to fail the
 * job with that code. Same words, different control flow — asserted, not
 * assumed.
 */

export type WorkerCredentialFailureCode =
  | "credential_required"
  | "credential_unavailable"
  | "credential_unreadable";

export type WorkerCredential = {
  readonly secret: Secret;
  readonly provider: string;
  readonly keyVersion: number;
  /** The authoritative owner, read from `jobs.user_id`. Never from a caller. */
  readonly userId: string;
};

/** The envelope columns `resolve_job_ai_credential` returns. */
type ResolverRow = {
  ciphertext: string | null;
  iv: string | null;
  key_version: number | null;
  status: string | null;
  provider: string | null;
};

/**
 * PostgREST returns `bytea` as a hex string prefixed `\x`, not as base64.
 *
 * Byte-identical to `src/lib/byok/adapter.ts`'s copy, and for the same reason:
 * the crypto core speaks base64 because the envelope format declares it, and the
 * transport speaks hex because that is what PostgREST does with `bytea`.
 */
function byteaToBase64(value: string): string {
  if (!value.startsWith("\\x")) {
    // Already base64 — the shape a direct RPC result or a test fixture uses.
    return value;
  }
  const hex = value.slice(2);
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return toBase64(bytes);
}

function isUsable(row: ResolverRow | undefined | null): row is ResolverRow & {
  ciphertext: string;
  iv: string;
  key_version: number;
  provider: string;
} {
  return Boolean(
    row &&
      row.status === "active" &&
      row.ciphertext &&
      row.iv &&
      row.key_version !== null &&
      row.provider,
  );
}

async function openEnvelope(
  row: ResolverRow,
  userId: string,
  ring: MasterKeyRing,
): Promise<WorkerCredential> {
  if (!isUsable(row)) throw new JobFailure("credential_required");

  // One key, chosen by the row's own declared version -- never a list tried in
  // order. A version neither key seals fails identically to a failed
  // decryption, so nothing reveals whether another key would have worked. The
  // Node half's reasoning applies verbatim.
  const master = keyForVersion(ring, row.key_version);
  if (master === null) throw new JobFailure("credential_unreadable");

  let plaintext: string;
  try {
    plaintext = await decryptCredential(
      {
        iv: byteaToBase64(row.iv),
        ciphertext: byteaToBase64(row.ciphertext),
        keyVersion: row.key_version,
      },
      master,
      { userId, keyVersion: row.key_version, provider: row.provider },
    );
  } catch (error) {
    // Total, and deliberately so — the Node half's comment applies verbatim.
    // `CredentialUnreadableError` is the expected shape; a malformed column or a
    // truncated row is the same fact to a caller and must not be reported
    // differently, because the difference is information an attacker would like
    // and an owner cannot act on.
    if (!(error instanceof CredentialUnreadableError)) {
      // Rethrow nothing, log nothing, echo nothing.
    }
    throw new JobFailure("credential_unreadable");
  }

  return {
    secret: new Secret(plaintext),
    provider: row.provider,
    keyVersion: row.key_version,
    userId,
  };
}

/**
 * The asynchronous path: the **job owner's** credential, for a claimed job.
 *
 * Throws a `JobFailure` carrying one of the three declared codes. It never
 * returns, stringifies or serializes plaintext — the value leaves only through
 * `Secret.expose()` at the provider boundary.
 */
export async function resolveJobCredential(
  service: SupabaseClient,
  jobId: string,
  /**
   * The master key, defaulted from the Edge Function secret store.
   *
   * The Deno mirror of the Node adapter's `env: NodeJS.ProcessEnv = process.env`
   * parameter, and it exists for the same two reasons: tests must be able to
   * supply one, and `deno test` runs with **no `--allow-env`**, so a call that
   * reached `Deno.env.get` would raise a permission error rather than run.
   *
   * Note what it is and is not. It is the operator's master key, the same for
   * every user, defaulted from the environment on every real call. It is **not**
   * a way to choose *whose* credential is resolved — that is `jobs.user_id`, read
   * from the row below, and no argument here can influence it. A wrong master key
   * produces `credential_unreadable`, never somebody else's plaintext, because
   * the AAD binds the ciphertext to the owner regardless.
   */
  ring?: MasterKeyRing,
): Promise<WorkerCredential> {
  // The authoritative owner. `jobs.user_id` is `not null`, so an absent value
  // here means there is no such row — and a job that does not exist has no
  // credential, which is `credential_unavailable` rather than a lie about
  // configuration.
  const { data: jobRow, error: jobError } = await service
    .from("jobs")
    .select("user_id")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !jobRow || typeof jobRow.user_id !== "string") {
    throw new JobFailure("credential_unavailable");
  }

  const { data, error } = await service.rpc("resolve_job_ai_credential", { p_job_id: jobId });
  if (error) throw new JobFailure("credential_unavailable");

  const rows = (data ?? []) as ResolverRow[];
  // `BYOK-RESOLVER-005` collapses `invalid`, `removed` and absent into no row.
  // For the worker all three mean the same next move, so no distinction is
  // reconstructed here.
  if (rows.length === 0) throw new JobFailure("credential_required");

  return openEnvelope(rows[0], jobRow.user_id, ring ?? requireMasterKeyRing());
}
