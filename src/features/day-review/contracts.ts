/**
 * `2M-REVIEW-003` — what a review conclusion is *allowed to become*.
 *
 * "A review conclusion becomes a domain change **only** through an explicit,
 * typed, confirmed operation on the existing command path — carry-forward,
 * reschedule, plan, archive or follow-up."
 *
 * ## The mapping is data, and it points at the taxonomy
 *
 * Each of the five review verbs is **a name for an existing taxonomy action
 * plus, where the review decides it, a fixed patch**. Nothing here is a new
 * capability: `applyTaskDetailCommand` resolves through
 * `list_task_command_candidates` and applies through `apply_task_command`, so
 * the operation key, the request fingerprint, the staleness gate, the audit row,
 * the confirmation for a destructive verb and the registered undo are all
 * inherited. This module cannot reach past that action, and
 * `phase-2m-review-authority-guard.test.ts` fails the build if anything under
 * `src/features/day-review/` acquires a client, an RPC, a Server Action or a
 * direct write (`2M-REVIEW-004`).
 *
 * The precedent is `WORK_ACTION_MAPPING`: a surface's verbs, declared as data
 * beside the taxonomy rather than as conditionals inside a component. Two review
 * verbs mapping to one taxonomy action is the same shape `wait_task` and
 * `resume_task` already have — they differ in the patch the surface contributes,
 * not in the authority they reach.
 *
 * ## Why these five, and what each one *is*
 *
 * | verb | taxonomy action | what the surface contributes |
 * |---|---|---|
 * | `carry_forward` | `set_planned` | the **next day**, computed by the surface — the user is saying "not today, tomorrow" and is not picking a date |
 * | `plan` | `set_planned` | a day the user picks |
 * | `reschedule` | `reschedule_due` | a **deadline** the user picks — a different column and a different meaning from `plan` (OD-2M-3 A) |
 * | `archive` | `cancel_task` | nothing; the taxonomy decides the destination |
 * | `follow_up` | `set_status` | `waiting`, the state a thing you are chasing is in |
 *
 * `archive` is the only destructive one, and it is destructive because
 * `cancel_task` is: `requiresConfirmation`, not `oneStepEligible`, and reversible
 * only through the recorded pre-state within the undo window. **That is read from
 * the policy, never restated here** — `2M-REVIEW-005` requires a review action to
 * be undoable where the domain supports undo and explicitly confirmed as
 * irreversible where it is not, and a second declaration of which is which is
 * exactly how a surface ends up promising an undo the database will not honour.
 *
 * ## What is deliberately absent
 *
 * There is no `delete`, no `complete`, no bulk verb and no verb that writes
 * anything but a task. A review that could complete work on the user's behalf
 * would be the product deciding what happened, which is the thing this whole
 * phase refuses.
 */

import type { DayReviewActionKind } from "@/features/product-analytics/contracts";
import { dayReviewActionKinds } from "@/features/product-analytics/contracts";
import { detailControlFor, type DetailControl } from "@/features/task-commands/detail-controls";
import {
  actionPolicy,
  type TaskCommandAction,
  type TaskCommandPatchField,
} from "@/features/task-commands/taxonomy";

export type { DayReviewActionKind };
export { dayReviewActionKinds };

/**
 * What the surface contributes to the command, per verb.
 *
 * `patchSource` is the whole of the difference between `carry_forward` and
 * `plan`, and between either and `reschedule`:
 *
 *  - `next_day` — the surface supplies the day, and the user chooses nothing;
 *  - `user_date` — the user picks a date and the surface supplies no value;
 *  - `fixed` — the surface supplies a constant the taxonomy bounds;
 *  - `none` — the action carries no patch at all.
 */
export type DayReviewPatchSource = "next_day" | "user_date" | "fixed" | "none";

export type DayReviewVerb = {
  readonly kind: DayReviewActionKind;
  readonly taxonomy: TaskCommandAction;
  readonly patchSource: DayReviewPatchSource;
  /** The single patch field this verb fills, or null when it fills none. */
  readonly field: TaskCommandPatchField | null;
  /** The constant, for `fixed` only. */
  readonly value: string | null;
};

const VERBS: Record<DayReviewActionKind, DayReviewVerb> = {
  carry_forward: {
    kind: "carry_forward",
    taxonomy: "set_planned",
    patchSource: "next_day",
    field: "plannedAt",
    value: null,
  },
  reschedule: {
    kind: "reschedule",
    taxonomy: "reschedule_due",
    patchSource: "user_date",
    field: "dueAt",
    value: null,
  },
  plan: {
    kind: "plan",
    taxonomy: "set_planned",
    patchSource: "user_date",
    field: "plannedAt",
    value: null,
  },
  archive: {
    kind: "archive",
    taxonomy: "cancel_task",
    patchSource: "none",
    field: null,
    value: null,
  },
  follow_up: {
    kind: "follow_up",
    taxonomy: "set_status",
    patchSource: "fixed",
    field: "status",
    value: "waiting",
  },
};

export function dayReviewVerb(kind: DayReviewActionKind): DayReviewVerb {
  return VERBS[kind];
}

export const DAY_REVIEW_VERBS: readonly DayReviewVerb[] =
  dayReviewActionKinds.map((kind) => VERBS[kind]);

/**
 * Whether this verb needs an explicit confirmation before it runs, **derived**.
 *
 * `2M-REVIEW-005`'s second clause. Read from `actionPolicy`, so a taxonomy that
 * made an action destructive would make the review confirm it without a line
 * here changing — and a review that confirmed nothing the taxonomy calls
 * destructive would fail its own test rather than ship a one-click cancellation.
 */
export function dayReviewRequiresConfirmation(kind: DayReviewActionKind): boolean {
  return actionPolicy(VERBS[kind].taxonomy).requiresConfirmation;
}

/** Whether the domain can put this verb back, **derived** from the same policy. */
export function dayReviewIsReversible(kind: DayReviewActionKind): boolean {
  return actionPolicy(VERBS[kind].taxonomy).reversible;
}

/**
 * Which verbs a task in this status can actually be given.
 *
 * Derived from the taxonomy's own eligibility, for the reason
 * `detailControlsFor` exists: a review that offered `archive` on an already
 * cancelled task would be offering a button whose only possible outcome is a
 * refusal (2F-SURFACE-009), and the review's whole claim is that it reports
 * truthfully.
 */
export function dayReviewVerbsFor(status: string): readonly DayReviewVerb[] {
  return DAY_REVIEW_VERBS.filter((verb) =>
    (actionPolicy(verb.taxonomy).eligibleFrom as readonly string[]).includes(status));
}

/**
 * One verb's control, borrowed from the task detail rather than invented.
 *
 * `detailControlFor` is the *shape* function — it answers "which field does this
 * action fill and how is it bounded" without a task to check eligibility
 * against, which is exactly what a review row needs after `dayReviewVerbsFor`
 * has already decided eligibility from the same taxonomy.
 *
 * **`detailControlsFor` could not be used here**, and the reason is worth
 * stating: it excludes `set_status` because the Work list renders that verb
 * through `WorkItemActions`, and rendering it twice on *that* page would put two
 * routes to one transition on one screen. On a review row there is no second
 * route, so the exclusion would silently remove `follow_up` — a verb
 * `2M-REVIEW-003` names.
 */
export function dayReviewControlFor(verb: DayReviewVerb): DetailControl | null {
  return detailControlFor(verb.taxonomy);
}

/**
 * The records a day review reads, named — and therefore nameable when one could
 * **not** be read.
 *
 * `2M-REVIEW-001` requires the flow to state plainly what it could not read. A
 * surface that renders an empty section for a query that failed is telling the
 * user nothing happened that day, which is a different and worse claim than "I
 * could not read this". So every source is enumerated here, each read is scored
 * individually, and `day-review-projection.ts` reports the ones that failed
 * instead of folding them into the emptiness.
 */
export const DAY_REVIEW_SOURCES = [
  /** Tasks whose status reached `completed` inside the day. */
  "completed",
  /** Tasks the user had declared an intention for on the day, still open. */
  "planned",
  /** Tasks whose deadline falls inside the day. */
  "due",
  /** Entries captured inside the day. */
  "captured",
  /** Generated `reviews` rows whose period covers the day. */
  "generated",
] as const;

export type DayReviewSource = (typeof DAY_REVIEW_SOURCES)[number];

export type DayReviewSourceState = "read" | "unavailable";
