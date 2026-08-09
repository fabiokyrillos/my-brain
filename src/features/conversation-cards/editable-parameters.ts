/**
 * `2K-ACT-003` / `2K-ACT-004` — OD-2K-1's closed, per-action editable set.
 *
 * ## The property, stated the way the decision states it
 *
 * A card may let the user correct a parameter **before** confirming. What it
 * may never do is accept an arbitrary patch, a caller-supplied field name, or
 * free-form JSON. OD-2K-1 puts the reason in the same terms ADR-047 used about
 * confirmation tokens: the requirement is that the surface be **incapable** of
 * expressing a bad edit, not that one be unlikely.
 *
 * ## Why the set is derived rather than declared
 *
 * `TASK_COMMAND_TAXONOMY` already carries `allowedPatchFields` per action —
 * the closed set PRD §11.2 gave each row, enforced by the validator and pinned
 * by `policy-lock.test.ts`. Declaring a second list here would be a second
 * declaration of one fact, and the two could disagree; the drift would then
 * show up as a card offering a field the validator refuses, or refusing one it
 * would have accepted. So this module **narrows** the taxonomy and never
 * widens it, and its tests assert the subset relation for every action.
 *
 * ## The one exclusion, and why it is a decision rather than an oversight
 *
 * Relation references — `projectRef`, `contextRef`, `personRef` — are excluded.
 * Editing one means typing a *name*, which needs a name-to-entity resolution
 * whose ambiguous, foreign and non-existent outcomes Phase 2K does not model as
 * card states. OD-2K-1's instruction for that case is explicit: exclude by
 * default anything whose authority and validation are not already proved, and
 * omit rather than widen where a parameter is arguable. The consequence is
 * named rather than hidden: `assign_project`, `assign_context`, `assign_person`
 * and `set_waiting_on` expose no editable parameter at all.
 *
 * ## What this module cannot do
 *
 * It grants nothing. Every edit still travels through `deriveTaskCommand`,
 * which re-runs `validateTaskCommand` over the whole proposal — so a value that
 * passes here and fails there is refused there, exactly as a value the model
 * proposed would be.
 */

import {
  TASK_COMMAND_PATCH_FIELDS,
  actionPolicy,
  type TaskCommandAction,
  type TaskCommandPatchField,
} from "@/features/task-commands/taxonomy";

/**
 * Fields a card may not edit, whatever the action's policy allows.
 *
 * A negative list rather than a positive one, deliberately: a positive list
 * would silently exclude any patch field added later, which is the failure mode
 * where a new capability quietly never becomes editable and nobody notices. A
 * negative list makes the new field editable by default and forces whoever adds
 * it to think about whether it should be.
 */
export const EDITABLE_PARAMETER_EXCLUSIONS = [
  "projectRef",
  "contextRef",
  "personRef",
] as const satisfies readonly TaskCommandPatchField[];

function isExcluded(field: string): boolean {
  return (EDITABLE_PARAMETER_EXCLUSIONS as readonly string[]).includes(field);
}

/** The closed set of parameters this action's card may offer. */
export function editableParametersFor(
  action: TaskCommandAction,
): readonly TaskCommandPatchField[] {
  return actionPolicy(action).allowedPatchFields.filter((field) => !isExcluded(field));
}

/**
 * The single question the edit path asks before touching anything.
 *
 * Takes `string`, not `TaskCommandPatchField`, on purpose: the caller's value
 * comes off a form and is untrusted, so narrowing has to happen **here** rather
 * than at a cast the compiler cannot check.
 */
export function isEditableParameter(action: TaskCommandAction, field: string): boolean {
  if (!(TASK_COMMAND_PATCH_FIELDS as readonly string[]).includes(field)) return false;
  return (editableParametersFor(action) as readonly string[]).includes(field);
}

/**
 * How a parameter may be edited.
 *
 * `choice` carries the legal values **from the policy** rather than from a
 * separate list. That matters most for `set_status`: the taxonomy records that
 * `allowedTargetValues` is load-bearing because a status patched to `cancelled`
 * would otherwise be a non-destructive, one-step, unconfirmed route to the
 * destructive cancel. Offering the policy's own values means the card cannot
 * present one the validator would have to catch.
 */
export type EditableParameterKind = "text" | "instant" | "choice";

export type EditableParameterSpec = {
  readonly field: TaskCommandPatchField;
  readonly kind: EditableParameterKind;
  /** Non-empty exactly when `kind === "choice"`. */
  readonly choices: readonly string[];
};

/** The fields whose value is a temporal phrase rather than a literal. */
const TEMPORAL_FIELDS: readonly TaskCommandPatchField[] = ["dueAt", "plannedAt"];

export function editableParameterSpec(
  action: TaskCommandAction,
  field: string,
): EditableParameterSpec | null {
  if (!isEditableParameter(action, field)) return null;
  const patchField = field as TaskCommandPatchField;
  const policy = actionPolicy(action);

  if (policy.targetValueField === patchField && policy.allowedTargetValues !== null) {
    return { field: patchField, kind: "choice", choices: [...policy.allowedTargetValues] };
  }
  if (TEMPORAL_FIELDS.includes(patchField)) {
    return { field: patchField, kind: "instant", choices: [] };
  }
  return { field: patchField, kind: "text", choices: [] };
}
