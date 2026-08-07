import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DEFERRED_JOB_HTTP_STATUS } from "../_shared/lifecycle-gate.ts";
import { processAttachmentJob } from "./attachment.ts";
import { processEntryJob } from "./entry.ts";

export const SUPPORTED_JOB_TYPES = ["process_attachment", "interpret_entry"] as const;
export type SupportedJobType = (typeof SUPPORTED_JOB_TYPES)[number];

export function isSupportedJobType(value: unknown): value is SupportedJobType {
  return typeof value === "string" && (SUPPORTED_JOB_TYPES as readonly string[]).includes(value);
}

type JobRow = {
  id: string;
  user_id: string;
  attempts: number;
  payload?: Record<string, unknown>;
};

// Fail-closed router: an unrecognized type is rejected without attempting
// any claim or inferring behavior from the payload shape. This function
// only routes an already-claimed job to its processor; type eligibility is
// decided before claiming (see resolveJobType in index.ts) precisely so an
// unknown type never reaches a claim RPC at all.
export async function processClaimedJob(
  service: SupabaseClient,
  type: SupportedJobType,
  job: JobRow,
  workerId: string,
): Promise<Response> {
  switch (type) {
    case "process_attachment":
      return processAttachmentJob(service, job, workerId);
    case "interpret_entry":
      return processEntryJob(service, job, workerId);
  }
}

const DISPATCH_LEASE_SECONDS = 120;
const DISPATCH_MAX_JOBS = 25;
const DISPATCH_BUDGET_MS = 50_000;

export type DispatchDrainSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  /**
   * SH-WORKER-001. Jobs returned to the queue because their owner stopped
   * being active between the claim and the reload. Its own column rather than
   * a share of `failed`, because a suspension is not a failure and folding it
   * into the failure count is how an operator ends up investigating a healthy
   * queue.
   */
  deferred: number;
  /**
   * 2H-DEADMAN-001. The claim RPC itself errored, so the drain stopped without
   * knowing whether the queue was empty.
   *
   * Its own field rather than a share of `failed`, because the two are opposite
   * findings: `failed` means jobs were processed and did not succeed, and this
   * means the drain could not look. Without it, a broken claim path and an
   * empty queue produce the identical summary — `processed: 0` — and the
   * dead-man switch would record the healthiest outcome it has for the one
   * state it exists to catch.
   */
  claimFailed: boolean;
};

// Unattended scheduled drain for interpret_entry jobs only. Attachments
// keep their existing explicit, per-upload invocation (no claim_next
// RPC exists for process_attachment, and adding one is out of scope for
// this slice); this loop is fail-closed by construction since it only
// ever calls claim_next_entry_interpretation_job.
export async function runEntryDispatchDrain(
  service: SupabaseClient,
): Promise<DispatchDrainSummary> {
  const startedAt = Date.now();
  const summary: DispatchDrainSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    deferred: 0,
    claimFailed: false,
  };

  while (summary.processed < DISPATCH_MAX_JOBS && Date.now() - startedAt < DISPATCH_BUDGET_MS) {
    const workerId = `process-jobs:dispatch:${crypto.randomUUID()}`;
    const { data: job, error } = await service.rpc("claim_next_entry_interpretation_job", {
      p_worker_id: workerId,
      p_lease_seconds: DISPATCH_LEASE_SECONDS,
    });
    if (error) {
      console.error("Entry dispatch claim failed", { code: error.code });
      summary.claimFailed = true;
      break;
    }
    if (!job) break;

    summary.processed += 1;
    try {
      const response = await processEntryJob(service, job as JobRow, workerId);
      if (response.status === DEFERRED_JOB_HTTP_STATUS) summary.deferred += 1;
      else if (response.ok) summary.succeeded += 1;
      else summary.failed += 1;
    } catch (processingError) {
      summary.failed += 1;
      console.error("Entry dispatch processing failed", {
        jobId: (job as JobRow).id,
        code: processingError instanceof Error ? processingError.name : "unknown_error",
      });
    }
  }

  return summary;
}

/**
 * 2H-DEADMAN-001. The name this drain reports under.
 *
 * A constant here, resolved from `cron.job` on the database side. This function
 * has no SQL of its own, and an RPC round-trip every minute to ask its own name
 * would be a recurring cost for a string that changes never. The mismatch a
 * constant can cause is not silent: a health row whose name matches no
 * scheduled job is reported by `operator_scheduled_job_findings` as
 * `health_without_cron_job`, so renaming the schedule without renaming this
 * surfaces as a finding rather than as a job that quietly stopped reporting.
 */
export const ENTRY_DISPATCH_JOB_NAME = "my-brain-entry-dispatch";

/**
 * The unattended drain reports its own run — 2H-DEADMAN-001, and the consumer
 * wiring 2H.2 deliberately left for 2H.4.
 *
 * Three outcomes, and the distinction between the first two is the whole point:
 *
 *   * the claim RPC errored  -> a FAILED run. The drain could not look, and
 *                               recording that as "successfully found nothing"
 *                               is exactly how a broken queue reads healthy.
 *   * nothing was claimable  -> a successful run that did no work: the ordinary
 *                               steady state of an idle queue.
 *   * jobs were processed    -> a successful run that did work.
 *
 * `processed` decides useful work rather than `succeeded`, because a job that
 * was claimed and then failed is still evidence the drain is reaching the
 * queue. Whether the work succeeded is the error sink's question, not the
 * dead-man switch's.
 *
 * A failed report never fails the drain — the jobs are already processed and
 * their outcome is durable — but it is logged with its code rather than
 * swallowed, and its absence is visible rather than invisible: a tick that does
 * not report leaves the job classified `stale`, which is the finding.
 */
export async function reportDispatchRun(
  service: SupabaseClient,
  summary: Pick<DispatchDrainSummary, "processed" | "claimFailed">,
): Promise<void> {
  const { error } = summary.claimFailed
    ? await service.rpc("record_scheduled_job_failure", { p_job_name: ENTRY_DISPATCH_JOB_NAME })
    : await service.rpc("record_scheduled_job_run", {
      p_job_name: ENTRY_DISPATCH_JOB_NAME,
      p_did_work: summary.processed > 0,
    });
  if (error) console.error("Scheduled-run report failed", { code: error.code });
}
