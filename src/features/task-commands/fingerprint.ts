/**
 * The preview fingerprint (PRD 2E-PREVIEW-004), assembled here and hashed in
 * Postgres.
 *
 * **This module hashes nothing, and no module in this directory may.** Every
 * one of the fourteen `request_fingerprint` values this repository computes is
 * computed in SQL, and Slice 2E.4's mutation RPC has to derive the same value
 * to recognize a replay (2E-UPDATE-006) and to bind a confirmation token to it
 * (2E-DESTRUCTIVE-002). A TypeScript implementation would therefore have to
 * agree with `jsonb::text` byte for byte, and it cannot: jsonb sorts object
 * keys by length and then by bytes while `schema.ts`'s `canonicalize` sorts
 * lexicographically, the two disagree on separators, and they render an instant
 * differently. That is the same "two languages, one contract" trap 2E-MATCH-008
 * characterizes for the normalizer one slice earlier, where the answer was also
 * to let SQL be authoritative.
 *
 * What this module owns is the *payload*: which seven values are hashed, in
 * which shape. `public.task_command_fingerprint` is `immutable` and `strict`,
 * reads no table, and is not `security definer` — so obtaining a fingerprint
 * cannot re-read the task and cannot reopen the TOCTOU window `observedBefore`
 * exists to close, which is what keeps 2E-PREVIEW-001 structurally true.
 *
 * **A fingerprint is identity, never authorization.** Its inputs are all values
 * the caller already holds and the function is granted to `authenticated`, so a
 * client can derive it. Slice 2E.5 must not accept a matching fingerprint as
 * evidence of confirmation; 2E-DESTRUCTIVE-002 requires a separate,
 * server-issued, single-use token bound to it.
 */

import type { Database } from "@/lib/supabase/database.types";

import type { TaskCommandPreview } from "./preview";
import type { TaskPreState } from "./matching";

type FingerprintArgs = Database["public"]["Functions"]["task_command_fingerprint"]["Args"];

export type TaskCommandFingerprintClient = {
  rpc(
    fn: "task_command_fingerprint",
    args: FingerprintArgs,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export class TaskCommandFingerprintError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TaskCommandFingerprintError";
    this.code = code;
  }
}

export type TaskCommandFingerprintInput = {
  readonly preview: TaskCommandPreview;
  readonly preState: TaskPreState;
  readonly ownerId: string;
  readonly operationKey: string;
};

/**
 * The seven hashed values, in the shape the SQL function expects.
 *
 * `observedBefore` travels as text and every instant inside `preState` is
 * already text, deliberately. `to_jsonb(timestamptz)` renders through the
 * session's `TimeZone` GUC, which `set search_path = ''` does not pin, so a
 * timestamp crossing the boundary as a typed value would hash differently for
 * two callers in two zones. Migration `202607230051:203` hashes a
 * timestamptz-derived value and carries that latent bug; this does not.
 *
 * Only `TASK_COMMAND_POLICY_VERSION` is hashed, not the match policy version.
 * 2E-PREVIEW-004 says "policy version", singular, and the two answer different
 * questions: the match policy decided *which* task this is about, which the
 * fingerprint already binds by `taskId`, while the command policy decides what
 * the patch is allowed to mean — which is what the preview asserts and what
 * Slice 2E.4 will apply. The match policy version travels in the preview DTO
 * for provenance instead. **This is irreversible once 2E.4 stores fingerprints.**
 */
export function buildFingerprintPayload(input: TaskCommandFingerprintInput): FingerprintArgs {
  const { preview, preState, ownerId, operationKey } = input;
  // `TaskCommandPreview.observedBefore` is nullable, and there is exactly one
  // shape that carries the null: a shell whose match ranked no candidates, so
  // there was no observation to report. That shape is never fingerprintable —
  // `buildTaskCommandPreview` raises `missing_observation` before it can produce
  // a `previewed` or `matched_requires_confirmation` disposition without one, and
  // `loadTaskCommandFingerprint` returns null for every other disposition — so
  // this is unreachable and is a throw rather than a substitution.
  //
  // Substituting anything at all is the failure worth refusing. The value is
  // hashed, and `public.task_command_fingerprint` is `strict`: a null argument
  // yields null instead of a digest, and an empty string yields a *valid* one
  // over a fabricated instant. Two different requests would then share an
  // identity, which is precisely what 2E-UPDATE-006's replay check reads.
  if (preview.observedBefore === null) {
    throw new TaskCommandFingerprintError(
      "a fingerprintable preview must carry the instant its pre-state was observed at",
      "missing_observation",
    );
  }
  return {
    p_owner_id: ownerId,
    p_task_id: preview.task.taskId,
    p_observed_before: preview.observedBefore,
    // Passed as the plain object the RPC will receive as jsonb. Key order is
    // irrelevant on the wire — jsonb re-sorts on arrival, which is what makes
    // 2E-IDEMPOTENCY-003 structural rather than a convention.
    p_pre_state: preState as unknown as FingerprintArgs["p_pre_state"],
    p_patch: preview.canonicalPatch as unknown as FingerprintArgs["p_patch"],
    p_policy_version: preview.policyVersion,
    p_operation_key: operationKey,
  };
}

/**
 * Obtains the fingerprint for a preview.
 *
 * The client is injected rather than constructed, matching `candidates.ts`: a
 * test exercises the whole path from preview to declared arguments without a
 * database and without a network, which is the deferral Slice 2E.1 had to
 * record when it put `parseTaskCommand` inside the `server-only` provider.
 *
 * A preview with nothing to apply is not fingerprinted. `no_change`,
 * `rejected_stale` and `refused` are terminal at preview time — there is no
 * later write for an identity to bind, and manufacturing one would put a
 * fingerprint over an empty patch into a token's scope.
 */
export async function loadTaskCommandFingerprint(
  client: TaskCommandFingerprintClient,
  input: TaskCommandFingerprintInput,
): Promise<string | null> {
  const { preview } = input;
  if (preview.disposition !== "previewed" && preview.disposition !== "matched_requires_confirmation") {
    return null;
  }

  const result = await client.rpc("task_command_fingerprint", buildFingerprintPayload(input));
  if (result.error) {
    throw new TaskCommandFingerprintError(
      "task_command_fingerprint failed",
      result.error.code ?? "rpc_failed",
    );
  }
  // Validated rather than trusted, like every other RPC result here. The
  // function is `strict`, so a null argument yields null instead of a hash —
  // and a null reaching a caller that then stores it as a request identity
  // would make two different requests share one fingerprint.
  if (typeof result.data !== "string" || !/^[0-9a-f]{64}$/.test(result.data)) {
    throw new TaskCommandFingerprintError(
      "task_command_fingerprint returned a value that is not a sha256 hex digest",
      "invalid_fingerprint",
    );
  }
  return result.data;
}
