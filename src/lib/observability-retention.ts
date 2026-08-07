/**
 * Phase 2H's operational retention windows, as data — `2H-RETENTION-001/004`.
 *
 * ## Why this is not `RETENTION_DAYS` in `quotas.ts`
 *
 * `src/lib/quotas.ts` mirrors the **user-facing** schedule: the classes the
 * Privacy Policy enumerates, generated from `src/features/legal/retention.ts`
 * and pinned three ways by `quotas-parity.test.ts` (PRD §20 ↔ constants ↔ the
 * SH.6 migration's seed). Phase 2H's three classes are operational telemetry,
 * not stored user content:
 *
 * - `error_events` carries **no user content at all** (`2H-SINK-002`, asserted
 *   by an executed probe over the writer) and is de-identified rather than
 *   deleted when an account goes, because an append-only failure record cannot
 *   cascade.
 * - `scheduled_job_health` is job names and counters. No person appears in it.
 * - `rate_limit_events` is owner, bucket, outcome and time — no operation, no
 *   content, no cost (`2H-RATE-006`) — and cascades from `auth.users`, so a
 *   deleted account takes its rows with it.
 *
 * They share the SH.6 **registry** (`private.retention_windows`), because one
 * schedule must have one home. They do not share the Privacy Policy's rendered
 * table, because adding a class there changes a published legal document and
 * its version, which forces re-acceptance — an owner and legal act, not a
 * side effect of a retention slice. That question is routed, by name, in
 * `docs/reports/phase-2h/PHASE_2H_BACKUP_AND_RETENTION.md`.
 *
 * ## No value here is minted
 *
 * PRD §14.1, adopted verbatim by the owner's execution authorization, signs
 * **90 days** for the error sink and **90 days** for dead-man history.
 * `rate_limit_events` is not named there, so it **reuses that signed 90-day
 * Phase 2H observability window** rather than inventing a fourth number. A new
 * unsigned window is an owner stop condition, and this module is where such an
 * attempt would have to appear.
 */

/** One retained class: the registry key, its window, and both halves. */
export type ObservabilityRetentionClass = {
  /** The `private.retention_windows.key` this class reads. */
  readonly key: string;
  /** Days. Every one of these is PRD §14.1's signed 90. */
  readonly days: number;
  /** The table the window is measured on, and the column that measures it. */
  readonly table: string;
  readonly column: string;
  /** The destructive sweep. Executable by no role, including `service_role`. */
  readonly sweep: string;
  /** The count-only twin. `service_role` may run it; it cannot delete. */
  readonly twin: string;
  /**
   * Whether a `cron.job` runs the sweep today.
   *
   * `false` for all three, and it stays false until an owner runs
   * `npm run ops:retention-schedule -- --enable`. Enabling **is** the
   * authorization of the first live purge (ADR-082), so this flag is the
   * repository's honest answer to "is this window enforced?" — the same
   * distinction `sweepActive` draws in `src/features/legal/retention.ts`.
   */
  readonly scheduled: boolean;
  /** Which requirement declared it, for the traceability generator to cite. */
  readonly requirement: string;
};

/** The signed Phase 2H observability window. One number, three classes. */
export const PHASE_2H_OBSERVABILITY_RETENTION_DAYS = 90;

export const OBSERVABILITY_RETENTION: readonly ObservabilityRetentionClass[] = [
  {
    key: "error_events",
    days: PHASE_2H_OBSERVABILITY_RETENTION_DAYS,
    table: "error_events",
    column: "occurred_at",
    sweep: "prune_error_events",
    twin: "count_prunable_error_events",
    scheduled: false,
    requirement: "2H-SINK-004",
  },
  {
    key: "scheduled_job_health",
    days: PHASE_2H_OBSERVABILITY_RETENTION_DAYS,
    table: "scheduled_job_health",
    column: "updated_at",
    sweep: "prune_scheduled_job_health",
    twin: "count_prunable_scheduled_job_health",
    scheduled: false,
    requirement: "2H-DEADMAN-004",
  },
  {
    key: "rate_limit_events",
    days: PHASE_2H_OBSERVABILITY_RETENTION_DAYS,
    table: "rate_limit_events",
    column: "consumed_at",
    sweep: "prune_rate_limit_events",
    twin: "count_prunable_rate_limit_events",
    scheduled: false,
    requirement: "2H-RATE-001",
  },
];

/**
 * The class that needs **no** sweep, recorded so the absence is a decision.
 *
 * `2H-RETENTION-004`'s rule cuts both ways: a class with a window and no sweep
 * is a broken promise, and a class with no window and no explanation is a class
 * nobody decided about. This is the second one, answered.
 */
export const OBSERVABILITY_RETENTION_EXEMPT = Object.freeze({
  account_deletion_attempts:
    "on delete cascade from auth.users, so a completed deletion removes the rows; " +
    "and a stalled row must survive as long as the account it is stuck on, because " +
    "it is the only evidence that the account is stuck (2H-RECOVER-002).",
});

/** True while any declared observability window has no scheduled sweep. */
export function hasUnscheduledObservabilitySweep(): boolean {
  return OBSERVABILITY_RETENTION.some((entry) => !entry.scheduled);
}
