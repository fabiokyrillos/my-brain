/**
 * What Processamento derives from the rows it already loads.
 *
 * The page answers *está tudo andando?*, and it can only answer from the page of
 * jobs in front of it — so these functions sort those rows by what they ask of
 * the reader and say what state that leaves. Nothing here reads the database.
 */

export type JobGroups<T> = {
  /** Stopped with an error: the only rows that may need the person. */
  readonly failed: T[];
  /** Queued or running: nothing to do but wait. */
  readonly active: T[];
  /** Completed, cancelled, or a status this module was never taught. */
  readonly finished: T[];
};

/** The rows in three groups, each in the order it arrived. Never re-sorted. */
export function groupJobs<T extends { readonly status: string }>(jobs: readonly T[]): JobGroups<T> {
  const groups: JobGroups<T> = { failed: [], active: [], finished: [] };
  for (const job of jobs) {
    if (job.status === "failed") groups.failed.push(job);
    else if (job.status === "pending" || job.status === "running") groups.active.push(job);
    else groups.finished.push(job);
  }
  return groups;
}

export type ProcessingState =
  /** No rows at all: the page's empty state, not a claim that work finished. */
  | { readonly kind: "empty" }
  | { readonly kind: "settled" }
  | { readonly kind: "unsettled"; readonly active: number; readonly failed: number };

/** The one thing the page's opening sentence says. */
export function processingState(groups: JobGroups<unknown>): ProcessingState {
  const { failed, active, finished } = groups;
  if (failed.length === 0 && active.length === 0) {
    return finished.length === 0 ? { kind: "empty" } : { kind: "settled" };
  }
  return { kind: "unsettled", active: active.length, failed: failed.length };
}
