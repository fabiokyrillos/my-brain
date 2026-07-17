import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
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
  openaiKey: string,
  type: SupportedJobType,
  job: JobRow,
  workerId: string,
): Promise<Response> {
  switch (type) {
    case "process_attachment":
      return processAttachmentJob(service, openaiKey, job, workerId);
    case "interpret_entry":
      return processEntryJob(service, openaiKey, job, workerId);
  }
}

const DISPATCH_LEASE_SECONDS = 120;
const DISPATCH_MAX_JOBS = 25;
const DISPATCH_BUDGET_MS = 50_000;

export type DispatchDrainSummary = {
  processed: number;
  succeeded: number;
  failed: number;
};

// Unattended scheduled drain for interpret_entry jobs only. Attachments
// keep their existing explicit, per-upload invocation (no claim_next
// RPC exists for process_attachment, and adding one is out of scope for
// this slice); this loop is fail-closed by construction since it only
// ever calls claim_next_entry_interpretation_job.
export async function runEntryDispatchDrain(
  service: SupabaseClient,
  openaiKey: string,
): Promise<DispatchDrainSummary> {
  const startedAt = Date.now();
  const summary: DispatchDrainSummary = { processed: 0, succeeded: 0, failed: 0 };

  while (summary.processed < DISPATCH_MAX_JOBS && Date.now() - startedAt < DISPATCH_BUDGET_MS) {
    const workerId = `process-jobs:dispatch:${crypto.randomUUID()}`;
    const { data: job, error } = await service.rpc("claim_next_entry_interpretation_job", {
      p_worker_id: workerId,
      p_lease_seconds: DISPATCH_LEASE_SECONDS,
    });
    if (error) {
      console.error("Entry dispatch claim failed", { code: error.code });
      break;
    }
    if (!job) break;

    summary.processed += 1;
    try {
      const response = await processEntryJob(service, openaiKey, job as JobRow, workerId);
      if (response.ok) summary.succeeded += 1;
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
