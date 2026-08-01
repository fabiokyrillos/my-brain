import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { CredentialUnreadableError, decryptCredential, requireMasterKey } from "./crypto";
import { fromBase64, toBase64, type Bytes } from "./envelope";
import { Secret } from "./secret";

/**
 * `BYOK-ADAPTER-001` — the one Node path from a request to a usable credential.
 *
 * resolve → decrypt → hand back a `Secret`. Nothing else in the application may
 * do any of those three, and `BYOK-GUARD-005` asserts it.
 *
 * ## Why the outcomes are declared rather than thrown
 *
 * `BYOK-ADAPTER-007`. "The user has not configured a key" is a **product state**,
 * not an error: it has copy, it has a link to Settings, and it must be
 * distinguishable by the caller from "the provider was down" and from "something
 * broke". A thrown exception flattens all three into a 500 and a toast that says
 * nothing useful.
 *
 * So the adapter returns a discriminated union, and the three failure arms are
 * exactly the three a caller can act on differently:
 *
 *   * `credential_required`    — no active credential. Gate the surface, link to
 *                                Settings. **No provider call happens.**
 *   * `credential_unavailable` — the resolver returned nothing when a row was
 *                                expected. Transient or a race with removal.
 *   * `credential_unreadable`  — the envelope did not open. Terminal, and
 *                                deliberately silent about which of key, tag or
 *                                AAD failed.
 *
 * ## Why `credential_required` and `credential_unavailable` are separate here
 * ## when the resolver collapses them
 *
 * `BYOK-RESOLVER-005` collapses `invalid`, `removed` and absent into one
 * outcome **to the caller of the RPC**, so the database is never an oracle for
 * another account's configuration state. That is about *cross-user* inference.
 *
 * This is a different question: the user asking is the owner, and telling them
 * "you have no key configured" is the entire point of the gated state. The
 * distinction the adapter draws is between *the owner has no key* and *we could
 * not read the key the owner has* — both facts about the caller's own account,
 * neither of them inferable about anybody else's.
 */

export type CredentialFailureCode =
  | "credential_required"
  | "credential_unavailable"
  | "credential_unreadable";

export type ResolvedCredential = {
  readonly outcome: "resolved";
  readonly secret: Secret;
  readonly provider: string;
  readonly keyVersion: number;
};

export type CredentialFailure = {
  readonly outcome: CredentialFailureCode;
};

export type CredentialResolution = ResolvedCredential | CredentialFailure;

/** The envelope columns both resolvers return. */
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
 * This is the seam where a wrong assumption would be invisible until a real
 * decryption failed: the crypto core speaks base64 because that is what the
 * envelope format declares, and the transport speaks hex because that is what
 * PostgREST does with `bytea`. Converting here, in one place, keeps both true.
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
  master: Bytes,
): Promise<CredentialResolution> {
  if (!isUsable(row)) return { outcome: "credential_required" };

  try {
    const plaintext = await decryptCredential(
      {
        iv: byteaToBase64(row.iv),
        ciphertext: byteaToBase64(row.ciphertext),
        keyVersion: row.key_version,
      },
      master,
      { userId, keyVersion: row.key_version, provider: row.provider },
    );
    return {
      outcome: "resolved",
      secret: new Secret(plaintext),
      provider: row.provider,
      keyVersion: row.key_version,
    };
  } catch (error) {
    // Total, and deliberately so. `CredentialUnreadableError` is the expected
    // shape; anything else — a malformed base64 column, a truncated row — is the
    // same fact to a caller and must not be reported differently, because the
    // difference is information an attacker would like and an owner cannot act
    // on.
    if (!(error instanceof CredentialUnreadableError)) {
      // Rethrow nothing, log nothing, echo nothing.
    }
    return { outcome: "credential_unreadable" };
  }
}

/**
 * The synchronous path: the caller's own credential, for a Server Action.
 *
 * The owner comes from `auth.uid()` **inside** `resolve_own_ai_credential`, not
 * from the `userId` argument here — that argument exists only to compose the AAD,
 * and if it disagreed with the session the decryption would fail rather than
 * succeed against the wrong account. The AAD is doing the enforcing;
 * `BYOK-CRYPTO-004` is why passing the wrong id is a cryptographic failure and
 * not a privilege escalation.
 */
export async function resolveOwnCredential(
  supabase: SupabaseClient<Database>,
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CredentialResolution> {
  const { data, error } = await supabase.rpc("resolve_own_ai_credential");

  if (error) return { outcome: "credential_unavailable" };

  const rows = (data ?? []) as ResolverRow[];
  if (rows.length === 0) return { outcome: "credential_required" };

  return openEnvelope(rows[0], userId, requireMasterKey(env));
}

/**
 * Decrypt an envelope the caller already holds.
 *
 * Exists for the rotation path, which reads its own row inside a transaction and
 * must not resolve a second time — and for tests, which is why it takes the
 * envelope rather than fetching one.
 */
export async function openStoredCredential(
  envelope: { ciphertext: string; iv: string; keyVersion: number; provider: string },
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CredentialResolution> {
  return openEnvelope(
    {
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      key_version: envelope.keyVersion,
      status: "active",
      provider: envelope.provider,
    },
    userId,
    requireMasterKey(env),
  );
}

/** Narrowing helper, so call sites read as a decision rather than a cast. */
export function isResolved(resolution: CredentialResolution): resolution is ResolvedCredential {
  return resolution.outcome === "resolved";
}

export { fromBase64 };
