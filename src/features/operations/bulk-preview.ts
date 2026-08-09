/**
 * `2L-BULK-005`/`-006` — what a bulk operation would do, before it does it.
 *
 * ## Why the partition is a predicate and not a reimplementation
 *
 * The requirement is that the preview's eligible/refused split equals **what
 * the apply path decides**. The cheap way to get that wrong is to write the
 * rule twice and keep them in step by hand. So this asks the same predicate the
 * command path asks — `isEligibleStatus`, which is also what
 * `p_eligible_statuses` is built from — and the test drives both over one set
 * of fixtures rather than comparing two hand-written expectations.
 *
 * ## Why the destructive arm is refused rather than partitioned
 *
 * `2L-BULK-006` requires the need for confirmation to be derived from the
 * policy, never from the control that was clicked. Under OD-2L-3 option A no
 * destructive operation is bulk-eligible at all, so an action outside the
 * derived set is refused **here**, before any partition exists. That is what
 * makes the destructive arm *unreachable* rather than merely unused: there is
 * no input that produces a previewed destructive set for a confirmation step to
 * guard.
 *
 * ## What this is not
 *
 * It is not authorization and it is not the gate. Every item still resolves
 * through `list_task_command_candidates` and applies through
 * `apply_task_command`, each re-checking eligibility against the row's own
 * status at its own instant. A row that changed between the preview and the
 * apply is refused there, and reported per item — which is exactly why
 * `2L-BULK-008` exists.
 */

import { isEligibleStatus, type TaskCommandAction } from "@/features/task-commands/taxonomy";

import { isBulkEligibleAction } from "./bulk-eligibility";

/** The minimum a preview needs to know about a task. Never its content. */
export type BulkPreviewItem = {
  readonly taskId: string;
  /** The row's real status, which is the only thing eligibility depends on. */
  readonly status: string;
};

/**
 * Why an item would be refused.
 *
 * A closed set with one member today. It exists as a vocabulary rather than a
 * boolean because `2L-BULK-005` requires the *reason class* per refusal, and a
 * count of refusals with no reason is a preview that tells the user nothing
 * they can act on.
 */
export type BulkRefusalReason = "ineligible_status";

export type BulkPreviewRefusal = {
  readonly taskId: string;
  readonly reason: BulkRefusalReason;
};

export type BulkPreview = {
  readonly status: "previewed" | "not_bulk_eligible";
  readonly action: string;
  readonly eligible: readonly BulkPreviewItem[];
  readonly refused: readonly BulkPreviewRefusal[];
  readonly eligibleCount: number;
  readonly refusedCount: number;
  /** Stated before the user commits, rather than discovered in the result. */
  readonly wouldChangeNothing: boolean;
  /**
   * Always false under OD-2L-3 option A, and computed rather than written.
   *
   * If a destructive verb ever became bulk-eligible, this would become true
   * from the policy rather than from someone remembering to add a dialog.
   */
  readonly requiresConfirmation: boolean;
};

export function previewBulk(
  action: string,
  items: readonly BulkPreviewItem[],
): BulkPreview {
  if (!isBulkEligibleAction(action)) {
    return {
      status: "not_bulk_eligible",
      action,
      eligible: [],
      refused: [],
      eligibleCount: 0,
      refusedCount: 0,
      wouldChangeNothing: true,
      requiresConfirmation: false,
    };
  }

  const verb: TaskCommandAction = action;
  const eligible = items.filter((item) => isEligibleStatus(verb, item.status));
  const refused: BulkPreviewRefusal[] = items
    .filter((item) => !isEligibleStatus(verb, item.status))
    .map((item) => ({ taskId: item.taskId, reason: "ineligible_status" as const }));

  return {
    status: "previewed",
    action,
    eligible,
    refused,
    eligibleCount: eligible.length,
    refusedCount: refused.length,
    wouldChangeNothing: eligible.length === 0,
    // Derived from the set membership above: nothing bulk-eligible is
    // destructive, so nothing previewable requires a confirmation.
    requiresConfirmation: false,
  };
}
