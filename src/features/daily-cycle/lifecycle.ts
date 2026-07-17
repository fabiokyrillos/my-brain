import type { AttentionReason, ProductState } from "./contracts";

export const entryLifecycleStates = [
  "saved",
  "interpreting",
  "awaiting_review",
  "partially_processed",
  "completed",
  "recoverable_error",
  "terminal_error",
  "reprocessing",
] as const;

export type EntryLifecycleState = (typeof entryLifecycleStates)[number];

export const jobLifecycleStates = ["pending", "running", "failed", "completed", "exhausted"] as const;
export type JobLifecycleState = (typeof jobLifecycleStates)[number];

export type DailyCycleJobSnapshot = {
  status: string;
  retryAt?: string | null;
};

export type DailyCycleLifecycleInput = {
  entryLifecycle: string;
  job?: DailyCycleJobSnapshot | null;
  hasValidTaskCandidates?: boolean;
  hasOpenQuestion?: boolean;
  recordOnly?: boolean;
  hasMaterializedTaskForCandidates?: boolean;
  hasConsistencyIssue?: boolean;
  now?: string;
};

export type DailyCycleLifecycleProjection = {
  productState: ProductState;
  attentionReason: AttentionReason | null;
  fallback: boolean;
};

function project(
  productState: ProductState,
  attentionReason: AttentionReason | null = null,
  fallback = false,
): DailyCycleLifecycleProjection {
  return { productState, attentionReason, fallback };
}

function isEntryLifecycleState(value: string): value is EntryLifecycleState {
  return entryLifecycleStates.includes(value as EntryLifecycleState);
}

function isJobLifecycleState(value: string): value is JobLifecycleState {
  return jobLifecycleStates.includes(value as JobLifecycleState);
}

function hasActiveRetry(job: DailyCycleJobSnapshot | null | undefined, now: string | undefined) {
  if (job?.status !== "failed" || !job.retryAt || !now) return false;
  const retryAt = Date.parse(job.retryAt);
  const currentTime = Date.parse(now);
  return Number.isFinite(retryAt) && Number.isFinite(currentTime) && retryAt > currentTime;
}

function hasUnknownJobState(job: DailyCycleJobSnapshot | null | undefined) {
  return Boolean(job && !isJobLifecycleState(job.status));
}

export function resolveDailyCycleLifecycle(input: DailyCycleLifecycleInput): DailyCycleLifecycleProjection {
  if (!isEntryLifecycleState(input.entryLifecycle) || hasUnknownJobState(input.job)) {
    return project("could_not_organize", "resolve_consistency", true);
  }

  const { entryLifecycle, job } = input;
  if (input.hasConsistencyIssue) return project("needs_attention", "resolve_consistency");

  if (entryLifecycle === "terminal_error" || job?.status === "exhausted") {
    return project("could_not_organize", "retry_processing");
  }

  if (job?.status === "pending" || job?.status === "running" || hasActiveRetry(job, input.now)) {
    return project("organizing");
  }

  if (entryLifecycle === "interpreting" || entryLifecycle === "reprocessing") return project("organizing");
  if (entryLifecycle === "recoverable_error") return project("could_not_organize", "retry_processing");

  if (entryLifecycle === "awaiting_review" || entryLifecycle === "partially_processed") {
    return project("needs_attention", "review_interpretation");
  }

  if (entryLifecycle === "completed") {
    if (input.hasOpenQuestion) return project("needs_attention", "answer_existing_question");
    const candidateNeedsConfirmation = input.hasValidTaskCandidates
      && !input.recordOnly
      && !input.hasMaterializedTaskForCandidates;
    if (candidateNeedsConfirmation) return project("needs_attention", "confirm_existing_candidates");
    return project("ready");
  }

  if (entryLifecycle === "saved" && job?.status === "completed") {
    return project("could_not_organize", "resolve_consistency", true);
  }

  return project("saved");
}
