/**
 * Which edit controls a task admits right now, derived from the taxonomy.
 *
 * The list is **computed from `actionPolicy` and the task's own status**, never
 * hand-written. A hand-written list is a second copy of taxonomy knowledge, and
 * the failure mode is the one this whole contract exists to prevent: a control
 * offering a value or a transition the RPC would refuse, so the user is shown a
 * button whose only possible outcome is a refusal (2F-SURFACE-009).
 *
 * Every control's `field` and its permitted values come from the policy, so a
 * future action added to `TASK_COMMAND_ACTIONS` appears here automatically with
 * the right shape, and one whose values are bounded cannot render as free text.
 */

import {
  TASK_COMMAND_ACTIONS,
  actionPolicy,
  isEligibleStatus,
  type TaskCommandAction,
  type TaskCommandPatchField,
} from "./taxonomy";

/**
 * How a control is rendered. Derived, not declared: the shape follows from the
 * action's patch field and whether the policy bounds its values.
 */
export type DetailControlKind =
  /** No patch at all — a single button (`clear_due`, `complete_task`). */
  | "immediate"
  /** One free-text value (`rename_task`, `append_note`). */
  | "text"
  /** A calendar date, submitted as `YYYY-MM-DD` (`reschedule_due`, `set_planned`). */
  | "date"
  /** One of a closed set the policy names (`set_priority`, `set_status`). */
  | "choice"
  /** One of the caller's own owned entities (`assign_*`, `set_waiting_on`). */
  | "relation";

export type DetailRelationKind = "project" | "context" | "person";

export type DetailControl = {
  readonly action: TaskCommandAction;
  readonly kind: DetailControlKind;
  /** The single patch field this control fills, or null for `immediate`. */
  readonly field: TaskCommandPatchField | null;
  /** The closed value set, when the policy bounds it. */
  readonly choices: readonly string[] | null;
  readonly relation: DetailRelationKind | null;
  /** Destructive actions may not apply directly; they must be confirmed first. */
  readonly destructive: boolean;
};

const RELATION_BY_FIELD: Partial<Record<TaskCommandPatchField, DetailRelationKind>> = {
  projectRef: "project",
  contextRef: "context",
  personRef: "person",
};

const TEXT_FIELDS: readonly TaskCommandPatchField[] = ["title", "note"];
const DATE_FIELDS: readonly TaskCommandPatchField[] = ["dueAt", "plannedAt"];

/**
 * The four Work-surface verbs already have buttons on this page through
 * `WorkItemActions`, which is the component both surfaces share. Rendering them
 * again as detail controls would put two routes to one transition on one screen.
 */
const RENDERED_ELSEWHERE: readonly TaskCommandAction[] = [
  "complete_task",
  "reopen_task",
  "set_status",
];

function controlFor(action: TaskCommandAction): DetailControl | null {
  const policy = actionPolicy(action);
  // A control fills exactly one field. An action requiring more than one would
  // need a composite control, and none exists in the taxonomy today — returning
  // null is what stops a future one rendering as a half-filled single input.
  if (policy.requiredPatchFields.length > 1) return null;
  const field = policy.requiredPatchFields[0] ?? null;

  const kind: DetailControlKind = field === null
    ? "immediate"
    : RELATION_BY_FIELD[field]
      ? "relation"
      : DATE_FIELDS.includes(field)
        ? "date"
        : policy.allowedTargetValues && policy.targetValueField === field
          ? "choice"
          : TEXT_FIELDS.includes(field)
            ? "text"
            : "text";

  return {
    action,
    kind,
    field,
    choices: policy.targetValueField === field ? policy.allowedTargetValues : null,
    relation: field ? RELATION_BY_FIELD[field] ?? null : null,
    destructive: policy.destructive,
  };
}

/**
 * Every control the task's current status admits.
 *
 * `isEligibleStatus` is the same predicate `resolveDetailCommand` re-checks
 * before applying, so a control can only be rendered for a transition the
 * command path would also accept.
 */
export function detailControlsFor(status: string): readonly DetailControl[] {
  return TASK_COMMAND_ACTIONS.flatMap((action) => {
    if (RENDERED_ELSEWHERE.includes(action)) return [];
    if (!isEligibleStatus(action, status)) return [];
    const control = controlFor(action);
    return control ? [control] : [];
  });
}

/**
 * The ±730-day bound `explicit_date` enforces in the temporal lexicon.
 *
 * Mirrored here **only to bound the control's own min/max and to refuse early
 * with a localized message**; the lexicon remains the authority, and
 * `validateTaskCommand` refuses independently if this is ever wrong. A picker
 * that offered a date the lexicon will not resolve would turn an ordinary
 * choice into an unexplained `needs_clarification`.
 */
export const MAX_RELATIVE_DAYS = 730;

export function dateBounds(today: Date): { readonly min: string; readonly max: string } {
  const day = 24 * 60 * 60 * 1000;
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return {
    min: iso(new Date(today.getTime() - MAX_RELATIVE_DAYS * day)),
    max: iso(new Date(today.getTime() + MAX_RELATIVE_DAYS * day)),
  };
}

/** `YYYY-MM-DD`, the one temporal shape the lexicon accepts from a control. */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isSubmittableDate(value: string, today: Date): boolean {
  if (!CALENDAR_DATE.test(value)) return false;
  const bounds = dateBounds(today);
  return value >= bounds.min && value <= bounds.max;
}
