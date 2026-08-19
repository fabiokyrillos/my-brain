"use client";

/**
 * The one role editor (`2P-PERSON-001`).
 *
 * ## Why it was extracted rather than written a second time
 *
 * A role belongs to a **relationship**, not to either of the things it joins —
 * that is the correction the owner signed when `2P-PERSON-001`'s original
 * wording named a `people.role` column the product does not have. So there are
 * two of them, on two relations, and slice 2P.6 needed to add the second:
 *
 *   * `person_projects.role` — free text, the owner's own words, never
 *     translated, edited from the projects panel that already existed;
 *   * `task_people.role` — a closed four-value vocabulary fixed by
 *     `task_people_role_check`, edited from the task's own row on the person
 *     page, and new in this slice.
 *
 * Writing a second editor would have put the open/close derivation, the
 * announcement, the restored submission and the cancel semantics in two places
 * for one behaviour. The difference between the two is **one prop**: whether the
 * role comes from a list.
 *
 * ## What it decides
 *
 * Nothing. Which hidden fields travel is the caller's business, the vocabulary
 * arrives already localized, and whether a save succeeded was settled by the
 * Server Action. `ENGINEERING_STANDARDS` keeps domain rules out of React.
 */

import { LoaderCircle } from "lucide-react";
import { useActionState, useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import { idleEntityEditState, type EntityEditState } from "./edit-state";
import type { EntityEditAction } from "./entity-edit-form";

export type RoleOption = { readonly value: string; readonly label: string };

export function RoleEditor({
  action,
  fields,
  locale,
  options,
  subject,
  value,
}: {
  action: EntityEditAction;
  /**
   * The hidden inputs this relation needs to identify its own row.
   *
   * A record rather than named props because the two relations are keyed
   * differently — `(personId, projectId)` against `(personId, taskId,
   * previousRole)` — and a union of the two shapes would put a `switch` in a
   * component whose whole point is that it does not know which relation it is
   * editing.
   */
  fields: Readonly<Record<string, string>>;
  locale: Locale;
  /** A closed vocabulary renders a `select`; its absence renders free text. */
  options?: readonly RoleOption[];
  /** The row's own label, for an accessible name that says which row. */
  subject: string;
  value: string | null;
}) {
  const copy = getEntityCopy(locale);
  const fieldId = useId();
  const [state, save, saving] = useActionState(action, idleEntityEditState);

  /**
   * The same state-identity derivation every form in this feature uses, and for
   * the reason `association-panel.tsx` recorded when it was fixed: a plain
   * boolean never cleared on success left the editor open after a successful
   * save, showing the value it had just written, with the spinner stopping as
   * the only signal and nothing at all for a screen reader.
   *
   * `dismissed` guards only the error clause. Guarding the whole expression made
   * Cancel-after-a-refusal permanent — see `entity-edit-form.tsx`.
   */
  const [openedFor, setOpenedFor] = useState<EntityEditState | null>(null);
  const [dismissed, setDismissed] = useState<EntityEditState | null>(null);
  const open = openedFor === state || (state.status === "error" && dismissed !== state);

  const restored = state.submitted?.role;
  const current = restored ?? value ?? "";

  return (
    <>
      {open ? null : (
        <button
          aria-label={`${copy.editRole}: ${subject}`}
          onClick={() => setOpenedFor(state)}
          type="button"
        >
          {copy.editRole}
        </button>
      )}

      {open ? (
        <form action={save} className="relation-form">
          <input name="locale" type="hidden" value={locale} />
          {Object.entries(fields).map(([name, fieldValue]) => (
            <input key={name} name={name} type="hidden" value={fieldValue} />
          ))}

          <div aria-atomic="true" aria-busy={saving} aria-live="polite" className="sr-only" role="status">
            {saving ? copy.saving : state.status === "idle" ? "" : state.message}
          </div>

          <label htmlFor={`${fieldId}-role`}>
            {copy.roleLabel}
            {options ? (
              /* Keyed on its own default, for the reason every select in this
                 feature records: React applies `defaultValue` to a select only
                 on mount, so a restored value needs a remount to take. */
              <select
                defaultValue={current}
                disabled={saving}
                id={`${fieldId}-role`}
                key={`role-${current}`}
                name="role"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                defaultValue={current}
                disabled={saving}
                id={`${fieldId}-role`}
                maxLength={120}
                name="role"
                placeholder={copy.rolePlaceholder}
                type="text"
              />
            )}
          </label>

          <div className="entity-edit-actions">
            <button className="entity-edit-save" disabled={saving} type="submit">
              {saving ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
              {saving ? copy.saving : copy.saveRole}
            </button>
            <button
              className="entity-edit-cancel"
              disabled={saving}
              onClick={() => { setDismissed(state); setOpenedFor(null); }}
              type="button"
            >
              {copy.cancel}
            </button>
          </div>

          {state.status === "error" ? (
            <p className="entity-edit-feedback error" role="alert">{state.message}</p>
          ) : null}
        </form>
      ) : null}

      {state.status === "success" ? (
        <p className="entity-edit-feedback success">{state.message}</p>
      ) : null}
    </>
  );
}
