import type { Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import type { EntityEditState, EntityEditSubmission } from "./edit-state";

/**
 * The refusal vocabulary and the field filter the two relation writers share.
 *
 * Separate from both `"use server"` modules for the reason `edit-state.ts`
 * already records: such a module may export **only** async functions, because
 * every export becomes a callable server reference and a plain function that
 * returns a value cannot be one. Putting these in `relationships.ts` would fail
 * the build; duplicating them into each writer would be two places for one
 * refusal vocabulary to drift.
 */

/**
 * A refusal, carrying the submission back when the owner can act on it.
 *
 * The same contract `entities/actions.ts` records: React 19 resets an
 * uncontrolled form once a Server Action completes, so a refused save would snap
 * the fields back and leave an error above an edit nobody can see.
 *
 * `duplicateRelation` is its own key rather than a reuse of `duplicateName`,
 * because the two are different facts with different next steps. A duplicate
 * *name* means "pick another name". A duplicate *relation* means "this one
 * already exists, and you are looking at it" — nothing needs renaming.
 */
export type RelationFailure =
  | "invalidInput"
  | "notFound"
  | "saveFailed"
  | "duplicateRelation"
  | "foreignTarget"
  /**
   * `2P-PERSON-001`. Its own key for the same reason `duplicateRelation` is:
   * `task_people`'s primary key is `(task_id, person_id, role)`, so moving a
   * person onto a role they already hold on that task is a `23505` — and the
   * next step is nothing at all, not "try again".
   */
  | "roleAlreadyHeld";

export function failedRelation(
  locale: Locale,
  key: RelationFailure,
  submitted: EntityEditSubmission | null = null,
): EntityEditState {
  return { status: "error", message: getEntityCopy(locale)[key], submitted };
}

/**
 * The submitted fields, without React's own `$ACTION_*` metadata.
 *
 * Every relation schema is `.strict()` — deliberately, so a forged control is a
 * rejection rather than a silent drop — which means the framework's own keys
 * would fail every write without this filter. It is the same filter
 * `entities/actions.ts` and `profile/actions.ts` apply, and it is the only thing
 * separating a strict schema from an unusable form.
 */
export function submittedRelationFields(formData: FormData): EntityEditSubmission {
  return Object.fromEntries(
    Array.from(formData.entries())
      .filter(([key]) => !key.startsWith("$ACTION_"))
      .map(([key, value]) => [key, typeof value === "string" ? value : ""]),
  );
}
