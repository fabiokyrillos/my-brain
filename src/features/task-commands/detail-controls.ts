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

import type { TaskCommandPatch } from "./schema";
import { addLocalDays, formatLocalDate, localDateOf } from "@/lib/time/local-day";
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

/**
 * The shape of one action's control, independent of any task.
 *
 * Exported because the *shape* and the *eligibility* are separate questions and
 * the Server Action needs only the first: it is handed an action name and must
 * know which field to fill and how to bound the value, before it has read any
 * row. Eligibility is then re-decided against the resolved row by
 * `resolveDetailCommand`, which is the only place that has a status to decide
 * it against.
 */
export function detailControlFor(action: TaskCommandAction): DetailControl | null {
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
    const control = detailControlFor(action);
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

/**
 * The picker's `min`/`max`, as the owner's calendar dates.
 *
 * `LDC-MISC-001`. This used to add `MAX_RELATIVE_DAYS * 24h` to an instant and
 * slice the **UTC** date off the result, which is wrong twice over: a day is not
 * always 24 hours, and the UTC calendar date is the owner's only by coincidence.
 * Both errors are at most a day at a ±730-day bound, so no user ever saw a wrong
 * date from it — it is corrected because it was a second implementation of
 * calendar arithmetic, not because it was visibly misbehaving.
 *
 * `addLocalDays` shifts the **date**, never the instant, so a transition inside
 * the two-year window cannot move the bound.
 */
export function dateBounds(now: Date, timeZone: string): { readonly min: string; readonly max: string } {
  const today = localDateOf(now, timeZone);
  return {
    min: formatLocalDate(addLocalDays(today, -MAX_RELATIVE_DAYS)),
    max: formatLocalDate(addLocalDays(today, MAX_RELATIVE_DAYS)),
  };
}

/** `YYYY-MM-DD`, the one temporal shape the lexicon accepts from a control. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether the three numbers name a day that exists.
 *
 * `explicit_date` builds a `WallTime` straight from the capture groups and never
 * asks, so `2026-02-31` resolves — as March 3rd. A date input cannot emit one,
 * but a hand-made POST can, and silently rescheduling a task to a day the user
 * did not name is worse than refusing.
 */
function isRealCalendarDay(match: RegExpExecArray): boolean {
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isSubmittableDate(value: string, now: Date, timeZone: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (match === null || !isRealCalendarDay(match)) return false;
  const bounds = dateBounds(now, timeZone);
  return value >= bounds.min && value <= bounds.max;
}

/**
 * Why a submitted value could not become a patch.
 *
 * Each is a *declared refusal with its own localized sentence*, never a thrown
 * error: these values come from a person filling in a control, so "that date is
 * outside the two years we can schedule" is an ordinary thing to be told. The
 * four are kept distinct because they call for four different corrections.
 */
export type DetailValueRefusal =
  /** A control that fills a field was submitted with nothing in it. */
  | "missing_value"
  /** Not `YYYY-MM-DD`, or a day that does not exist. */
  | "date_invalid"
  /** A real date, outside the lexicon's ±730-day window. */
  | "date_out_of_range"
  /** A choice the policy's `allowedTargetValues` does not contain. */
  | "value_not_allowed";

export type DetailPatchResult =
  | { readonly status: "ok"; readonly patch: TaskCommandPatch }
  | { readonly status: "refused"; readonly reason: DetailValueRefusal };

/**
 * Turns one submitted value into the single-field patch its control declares.
 *
 * **Not a second opinion on `validateTaskCommand`, which remains the gate.** It
 * exists so the two failures a *control* can produce — an empty required field
 * and a date the picker's own bounds exclude — carry a sentence naming the
 * control, rather than arriving at the schema as a generic
 * `missing_patch_field` or, worse, as an unexplained `needs_clarification` from
 * the temporal lexicon. Everything it lets through is validated again.
 */
export function buildDetailPatch(
  control: DetailControl,
  value: string | undefined,
  now: Date,
  timeZone: string,
): DetailPatchResult {
  // An `immediate` control fills nothing, so a value arriving with one is
  // discarded rather than refused: `clear_due` means the same thing whatever
  // the form carried alongside it.
  if (control.field === null) return { status: "ok", patch: {} };

  const trimmed = (value ?? "").trim();
  if (trimmed === "") return { status: "refused", reason: "missing_value" };

  if (control.kind === "date") {
    const match = CALENDAR_DATE.exec(trimmed);
    if (match === null || !isRealCalendarDay(match)) {
      return { status: "refused", reason: "date_invalid" };
    }
    if (!isSubmittableDate(trimmed, now, timeZone)) {
      return { status: "refused", reason: "date_out_of_range" };
    }
  }

  // The closed set comes from the policy through the control, so an action that
  // gains bounded values later is enforced here without a line changing.
  if (control.choices !== null && !control.choices.includes(trimmed)) {
    return { status: "refused", reason: "value_not_allowed" };
  }

  return { status: "ok", patch: { [control.field]: trimmed } };
}
