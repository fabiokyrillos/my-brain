/**
 * `2L-BULK-004` — which operations a set may be given, under OD-2L-3 option A.
 *
 * ## Derived, because a list would be a second copy of the taxonomy
 *
 * The owner signed **non-destructive, bounded-value operations only**. That
 * sentence is two predicates the taxonomy already answers, so this asks it:
 *
 *  - `policy.destructive` is false — which is what keeps `cancel_task` out, and
 *    therefore what makes `2L-BULK-006`'s destructive arm *unreachable* rather
 *    than merely unused;
 *  - the derived control's kind is `choice`, `date` or `relation` — the three
 *    shapes whose value the policy or the caller's own entities bound. `text`
 *    is excluded because applying one title or one note to fifty tasks is not
 *    an operation anybody means, and `immediate` because a verb with no value
 *    is a state transition the four Work buttons already own per row.
 *
 * A hand-written list would agree with the decision today and stop agreeing the
 * first time a policy moved. This cannot: a new bounded, non-destructive verb
 * joins automatically, and a verb that became destructive leaves.
 *
 * ## What it is not
 *
 * It is not authorization. Every item still resolves through
 * `list_task_command_candidates` and applies through `apply_task_command`, each
 * of which re-checks eligibility against the row's own status at its own
 * instant. This decides what a *control* may offer, so the user is never shown
 * an operation whose only possible outcome is a refusal.
 */

import { detailControlFor } from "@/features/task-commands/detail-controls";
import {
  TASK_COMMAND_ACTIONS,
  actionPolicy,
  type TaskCommandAction,
} from "@/features/task-commands/taxonomy";

/** The value shapes OD-2L-3 option A calls "bounded". */
const BOUNDED_KINDS = ["choice", "date", "relation"] as const;

export const BULK_ELIGIBLE_ACTIONS: readonly TaskCommandAction[] = TASK_COMMAND_ACTIONS.filter(
  (action) => {
    const control = detailControlFor(action);
    if (control === null) return false;
    if (actionPolicy(action).destructive) return false;
    return (BOUNDED_KINDS as readonly string[]).includes(control.kind);
  },
);

/**
 * Whether an unvalidated string names a bulk-eligible action.
 *
 * Fails closed on anything it does not recognise, including the empty string:
 * this is the boundary a hand-assembled POST arrives at, and "not in the set"
 * has to be the answer for everything that is not provably in it.
 */
export function isBulkEligibleAction(value: string): value is TaskCommandAction {
  return (BULK_ELIGIBLE_ACTIONS as readonly string[]).includes(value);
}
