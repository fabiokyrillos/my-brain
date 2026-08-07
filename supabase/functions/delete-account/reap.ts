/**
 * The reaper's entrypoint into the deletion executor (2H-RECOVER-001/003).
 *
 * ## Why a second door exists at all
 *
 * `index.ts`'s user door derives the account from a Bearer token and accepts no
 * target parameter, which is what makes it structurally self-only. That
 * property is also why it cannot be re-run automatically: an account stuck in
 * `deleting` has nobody holding a session, so nothing can present the token
 * that door requires. The deletion that stalled on 2026-08-04 sat there for two
 * days for exactly that reason -- the executor was idempotent and resumable,
 * and no caller existed to resume it.
 *
 * ## Why this door does not undo that property
 *
 * It does take a target account id. Three things make the id insufficient:
 *
 *   1. a shared secret that is **absent from this repository** and, when unset,
 *      disables the door entirely rather than opening it;
 *   2. a `claimToken` that only `claim_stalled_account_deletions` mints, that
 *      expires, and that the database only ever issues for an account already
 *      in `deleting` and already past its backoff;
 *   3. `executeDeletion`'s own step 1, which stops with `lifecycle_not_deleting`
 *      for anything else -- unchanged, and still the last word.
 *
 * So the reaper holds no capability the executor does not (2H-RECOVER-003): a
 * caller with the secret and an arbitrary account id gets `409` from the
 * database's own verdict, and a caller with neither gets `401`. Deletion
 * remains something a user asks for and the executor performs.
 *
 * Kept out of `index.ts` for the reason that file already documents:
 * `Deno.serve` binds a port at module scope, and the worker suite runs with no
 * `--allow-*` flags, so anything that must be executed by a test lives in a
 * module the test can import.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { executeDeletion, type StopReason } from "./executor.ts";

/**
 * A secret shorter than this is treated as unset.
 *
 * Not a style rule: the failure it prevents is a deployment that sets the
 * variable to an empty string or a placeholder, which would otherwise turn a
 * disabled door into one openable by guessing.
 */
const MINIMUM_SECRET_LENGTH = 32;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReapResponse = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Length-checked, constant-time-ish byte comparison.
 *
 * `a === b` on secrets leaks length and prefix through timing. The comparison
 * below always walks the full width of the configured secret, and the length
 * check is done on the digest-free byte arrays rather than by returning early
 * on the string length -- which is the mistake that makes most hand-rolled
 * versions of this no better than `===`.
 */
function secretsMatch(presented: string, configured: string): boolean {
  const left = new TextEncoder().encode(presented);
  const right = new TextEncoder().encode(configured);
  let difference = left.length ^ right.length;
  const width = Math.max(left.length, right.length);
  for (let index = 0; index < width; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Handles one reaper invocation. Pure of HTTP so the worker suite drives it.
 *
 * `configuredSecret` is passed in rather than read from `Deno.env` here, so the
 * tests can exercise the disabled path without the suite needing `--allow-env`.
 */
export async function handleReapRequest(
  service: SupabaseClient,
  payload: unknown,
  presentedSecret: string | null,
  configuredSecret: string | null | undefined,
): Promise<ReapResponse> {
  // Fail closed, and fail closed FIRST. An unconfigured deployment refuses
  // every reap request, including one presenting a correct-looking secret,
  // because there is no correct secret to present.
  if (!configuredSecret || configuredSecret.length < MINIMUM_SECRET_LENGTH) {
    return { status: 401, body: { error: "Unauthorized", code: "reap_disabled" } };
  }
  if (presentedSecret === null || !secretsMatch(presentedSecret, configuredSecret)) {
    return { status: 401, body: { error: "Unauthorized", code: "reap_secret_mismatch" } };
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const userId = typeof body.userId === "string" && UUID.test(body.userId) ? body.userId : null;
  const claimToken =
    typeof body.claimToken === "string" && UUID.test(body.claimToken) ? body.claimToken : null;
  if (userId === null || claimToken === null) {
    return { status: 400, body: { error: "Bad request", code: "malformed_reap_payload" } };
  }

  // The database's verdict, not this function's. It is the only thing that can
  // say whether this account was handed to this caller.
  const claim = await service.rpc("confirm_account_deletion_claim", {
    p_user_id: userId,
    p_claim_token: claimToken,
  });
  const confirmed = (claim.data ?? null) as { confirmed?: boolean; requested_at?: string } | null;
  if (claim.error || confirmed?.confirmed !== true) {
    return { status: 409, body: { outcome: "not_claimed", code: "claim_not_recognised" } };
  }

  // The reaper has no session, so the log's requester hash is null -- which is
  // the truth about who asked, not a gap. `requested_at` is the account's
  // ORIGINAL request time, carried back by the claim check, so a retried
  // deletion still records how long it actually took.
  const requestedAt = confirmed.requested_at ?? new Date().toISOString();
  const result = await executeDeletion(service, userId, requestedAt, null);

  const stopReason: StopReason | null = result.outcome === "stopped" ? result.stopReason : null;
  // Best-effort by design: the attempt already happened, and a bookkeeping
  // failure must not turn a completed deletion into a reported failure. A
  // completed deletion also takes its own attempt row with it, which the RPC
  // reports as `attempt_row_absent` rather than raising.
  await service.rpc("record_account_deletion_attempt", {
    p_user_id: userId,
    p_claim_token: claimToken,
    p_outcome: result.outcome === "completed" ? "completed" : "stopped",
    p_stop_reason: stopReason,
  });

  if (result.outcome === "stopped") {
    return {
      status: 409,
      body: { outcome: "stopped", code: result.stopReason, objectsRemoved: result.objectsRemoved },
    };
  }
  return {
    status: 200,
    body: {
      outcome: "completed",
      objectsRemoved: result.objectsRemoved,
      bytesRemoved: result.bytesRemoved,
    },
  };
}

export const REAP_SECRET_HEADER = "x-deletion-reap-secret";
export const REAP_SECRET_ENV = "DELETION_REAP_SECRET";
