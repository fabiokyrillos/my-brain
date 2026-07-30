"use client";

/**
 * The edit surface Projects and People never had (UX-08, UX-09).
 *
 * One component for both, because the difference between them is which fields
 * exist — not how editing behaves. Two components would be two places to keep
 * the disclosure, the pending state and the announcement in agreement.
 *
 * **It decides nothing.** Which fields to render arrives as `kind`, every
 * sentence arrives already localized, and whether a save succeeded was settled
 * by the Server Action. `ENGINEERING_STANDARDS` keeps domain rules out of React,
 * and "is this name already taken" is a database question with a database
 * answer.
 *
 * Collapsed by default. The detail page's job is to answer "what is this"; the
 * ways to change it sit behind one control so they do not push that answer off
 * the first screen — the same reasoning `task-detail-view.tsx` records for its
 * `controls` slot.
 */

import { LoaderCircle, Pencil } from "lucide-react";
import { useActionState, useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import { idleEntityEditState, type EntityEditState } from "./edit-state";
import { getEntityCopy } from "./copy";
import { PROJECT_STATUSES, type ProjectStatus } from "./schema";

export type EntityEditAction = (
  state: EntityEditState,
  formData: FormData,
) => Promise<EntityEditState>;

export type OrganizationOption = { readonly id: string; readonly name: string };

export type EntityEditFields =
  | {
      readonly kind: "project";
      readonly id: string;
      readonly name: string;
      readonly description: string | null;
      readonly status: ProjectStatus;
      readonly organizationId: string | null;
    }
  | {
      readonly kind: "person";
      readonly id: string;
      readonly name: string;
      readonly notes: string | null;
      readonly organizationId: string | null;
    };

export function EntityEditForm({
  action,
  fields,
  locale,
  organizations,
}: {
  action: EntityEditAction;
  fields: EntityEditFields;
  locale: Locale;
  /** The owner's existing organizations. Never created here — DEC-4 surfaces, it does not add. */
  organizations: readonly OrganizationOption[];
}) {
  const [state, formAction, pending] = useActionState(action, idleEntityEditState);
  const copy = getEntityCopy(locale);
  const fieldId = useId();

  /**
   * Openness is derived from *which state object* is current, not held as a
   * free boolean.
   *
   * `useActionState` returns a fresh object for every round, so a completed save
   * closes the form on its own — with no effect resetting it, which React 19
   * correctly flags as a cascading render (the same reasoning
   * `command-console.tsx` records for its dialog).
   *
   * Two markers rather than one, because the two ways a round can end need
   * opposite defaults. A **success** should close: the page has already
   * re-rendered with the new values, and leaving the form up would invite an
   * accidental second save. An **error** should stay open: the user has
   * something to fix, and closing would discard what they typed. `dismissed` is
   * what lets Cancel still work in that second case — without it, an error would
   * hold the form open against the user.
   */
  const [openedFor, setOpenedFor] = useState<EntityEditState | null>(null);
  const [dismissed, setDismissed] = useState<EntityEditState | null>(null);
  const open = dismissed !== state && (openedFor === state || state.status === "error");

  /**
   * What the last refused round submitted, if anything.
   *
   * React 19 resets an uncontrolled form once the action completes, so after a
   * duplicate-name refusal the field would snap back to the stored name — an
   * error telling the owner to change something they can no longer see. The
   * action echoes its input back on the failures worth recovering, and the
   * fields default to it. `null` on success and at rest, so the stored value
   * wins once there is nothing to restore.
   */
  const restored = (field: string): string | undefined => state.submitted?.[field];

  if (!open) {
    return (
      <div className="entity-edit">
        {/*
          The outcome of the last round stays visible after the form closes.
          Announcing a save and then hiding the only evidence of it would leave
          a screen-reader user with nothing to return to.
        */}
        <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {state.status === "idle" ? "" : state.message}
        </div>
        <button className="entity-edit-open" onClick={() => setOpenedFor(state)} type="button">
          <Pencil aria-hidden="true" size={15} />
          {copy.edit}
        </button>
        {state.status === "success" ? (
          <p className="entity-edit-feedback success">{state.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="entity-edit entity-edit-form">
      <input name="locale" type="hidden" value={locale} />
      <input name={fields.kind === "project" ? "projectId" : "personId"} type="hidden" value={fields.id} />

      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.saving : state.status === "idle" ? "" : state.message}
      </div>

      <label htmlFor={`${fieldId}-name`}>
        {copy.nameLabel}
        <input
          autoComplete="off"
          defaultValue={restored("name") ?? fields.name}
          disabled={pending}
          id={`${fieldId}-name`}
          maxLength={160}
          name="name"
          required
          type="text"
        />
      </label>

      {fields.kind === "project" ? (
        <>
          <label htmlFor={`${fieldId}-description`}>
            {copy.descriptionLabel}
            <textarea
              defaultValue={restored("description") ?? fields.description ?? ""}
              disabled={pending}
              id={`${fieldId}-description`}
              maxLength={4000}
              name="description"
              rows={3}
            />
          </label>
          <label htmlFor={`${fieldId}-status`}>
            {copy.statusLabel}
            {/* Keyed on its own default: React applies `defaultValue` to a
                select only on mount, so a restored value needs a remount to
                take. Without this the two text fields would keep the owner’s
                edit and the status would silently revert. */}
            <select
              defaultValue={restored("status") ?? fields.status}
              disabled={pending}
              id={`${fieldId}-status`}
              key={`status-${restored("status") ?? fields.status}`}
              name="status"
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>{copy.statuses[status]}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label htmlFor={`${fieldId}-notes`}>
          {copy.notesLabel}
          <textarea
            defaultValue={restored("notes") ?? fields.notes ?? ""}
            disabled={pending}
            id={`${fieldId}-notes`}
            maxLength={4000}
            name="notes"
            rows={3}
          />
        </label>
      )}

      {/*
        The hint sits outside the label and is linked by `aria-describedby`.
        Nested inside, it would become part of the control's accessible *name* —
        a screen reader would read "Company No company recorded yet" as the
        field's name rather than as advice about it.

        The control is **not** disabled when the list is empty, and that is a
        correctness point rather than a style one: a disabled control is not
        submitted, so `organizationId` would be absent from the `FormData` and a
        strict schema would refuse the whole save. With no organizations the
        select holds one option anyway — "no company" — so it offers nothing to
        get wrong, and the hint says why.
      */}
      <label htmlFor={`${fieldId}-organization`}>
        {copy.organizationLabel}
        <select
          aria-describedby={organizations.length === 0 ? `${fieldId}-organization-hint` : undefined}
          defaultValue={restored("organizationId") ?? fields.organizationId ?? ""}
          disabled={pending}
          id={`${fieldId}-organization`}
          key={`organization-${restored("organizationId") ?? fields.organizationId ?? ""}`}
          name="organizationId"
        >
          <option value="">{copy.organizationNone}</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>{organization.name}</option>
          ))}
        </select>
      </label>
      {organizations.length === 0 ? (
        <small className="entity-edit-hint" id={`${fieldId}-organization-hint`}>{copy.organizationEmpty}</small>
      ) : null}

      <div className="entity-edit-actions">
        <button className="entity-edit-save" disabled={pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
          {pending ? copy.saving : copy.save}
        </button>
        <button
          className="entity-edit-cancel"
          disabled={pending}
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
  );
}
