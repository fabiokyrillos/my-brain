import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { TerminalJobFailureCode } from "./job-failure.ts";

/**
 * `SH-WORKER-001` and `SH-WORKER-002` — the lifecycle, re-verified at the
 * worker's own trust boundary.
 *
 * ## Why the claim predicate is not enough
 *
 * `SH-LIFECYCLE-006` puts the same lifecycle predicate on all three claim
 * paths, so a suspended owner's job is never *claimed*. That closes the
 * scheduled case and leaves one window open: a job claimed while the owner was
 * active, still executing when the suspension lands. The claim happened; the
 * predicate has already spoken; nothing else would stop the work.
 *
 * So every handler re-reads the owner's state at its ownership reload — the
 * same place it re-reads the subject rather than trusting the payload — and
 * this module is the single implementation, so the entry path and the
 * attachment path cannot disagree about what a suspended owner means.
 *
 * ## Three outcomes, and why they are not one
 *
 *   * **active** — proceed. The overwhelmingly common case, one indexed read.
 *   * **defer** (`suspended`) — this is *not a failure*. The job goes back to
 *     the queue through `defer_job_for_inactive_owner`: no `jobs.error`, no
 *     `failed` status, no extra attempt burned, and it becomes claimable again
 *     the moment the account is reactivated, with no operator re-enqueue
 *     (`SH-SUSPEND-004`).
 *   * **terminal** (`deleting`, or no lifecycle row at all) — `subject_not_found`,
 *     the existing terminal code for "the thing this job was about is gone".
 *     `SH-WORKER-002` extends the pre-existing absent-subject behaviour to a
 *     `deleting` owner: retrying cannot help, and the deletion executor is
 *     about to remove the rows this job would write to.
 *
 * An unreadable lifecycle row **defers** rather than failing. That is the
 * fail-closed reading: we do not know whether this owner may be worked on, so
 * we do not work on them, and we destroy nothing while not knowing. A
 * transient read error therefore costs a queue round trip, not a job.
 */

/**
 * The deferral's vocabulary member.
 *
 * `SH-SUSPEND-009` requires lifecycle, throttle and quota refusals to share no
 * code. This one is deliberately not in `JOB_FAILURE_CODES`: it never reaches
 * `jobs.error`, because a deferral is not a failure and the Jobs page renders
 * that column verbatim. Naming it here rather than inline is what lets a test
 * assert the three vocabularies are disjoint.
 */
export const OWNER_NOT_ACTIVE_CODE = "owner_not_active";

export type OwnerLifecycleVerdict =
  | { readonly kind: "active" }
  | { readonly kind: "defer"; readonly ownerStatus: string }
  | { readonly kind: "terminal"; readonly code: TerminalJobFailureCode };

/**
 * Read the claimed job owner's lifecycle state.
 *
 * The owner is always the **job row's** `user_id`, never a caller-supplied one
 * — the same rule `resolveJobCredential` follows, and for the same reason.
 */
export async function verifyOwnerLifecycle(
  service: SupabaseClient,
  ownerId: string,
): Promise<OwnerLifecycleVerdict> {
  const { data, error } = await service
    .from("account_lifecycle")
    .select("status")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (error) {
    console.warn("Owner lifecycle unreadable; deferring", { code: error.code ?? "unknown" });
    return { kind: "defer", ownerStatus: "unknown" };
  }

  const status = (data as { status?: unknown } | null)?.status;
  if (status === "active") return { kind: "active" };
  if (status === "suspended") return { kind: "defer", ownerStatus: "suspended" };
  // `deleting`, or no row at all: the account is on its way out or already
  // gone, and no retry brings it back.
  return { kind: "terminal", code: "subject_not_found" };
}

/**
 * Return a claimed job to the queue. Mirrors `failJob`'s null contract: `false`
 * means the lease is no longer held, which is the caller's cue to report 409
 * exactly as a lost lease does today.
 */
export async function deferJobForInactiveOwner(
  service: SupabaseClient,
  input: { readonly jobId: string; readonly workerId: string },
): Promise<boolean> {
  const { data, error } = await service.rpc("defer_job_for_inactive_owner", {
    p_job_id: input.jobId,
    p_worker_id: input.workerId,
  });
  if (error) {
    console.error("Failed to defer job for inactive owner", { code: error.code ?? "unknown" });
    return false;
  }
  return (data as { status?: unknown } | null)?.status === "deferred";
}

/**
 * The deferral's HTTP shape.
 *
 * `202 Accepted` on purpose: the request was understood and the work is
 * pending, which is exactly true. It is neither `ok` in the sense the drain
 * counts as success nor a failure — `runEntryDispatchDrain` reads this status
 * and counts deferrals in their own column, because a summary that called this
 * "failed" would put a suspension into the failure rate.
 */
export const DEFERRED_JOB_HTTP_STATUS = 202;

export function deferredJobResponse(ownerStatus: string): Response {
  return Response.json(
    { deferred: true, code: OWNER_NOT_ACTIVE_CODE, ownerStatus },
    { status: DEFERRED_JOB_HTTP_STATUS },
  );
}
