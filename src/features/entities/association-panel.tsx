"use client";

/**
 * The association surface for `person_contexts` and `person_projects`
 * (EGC-ASSOC-001, 002, 003, 005, 006, 008).
 *
 * **One component for three placements**, because the difference between them is
 * which ids travel and whether a role exists — not how associating behaves. The
 * Person page uses it twice (contexts, projects) and the Project page once
 * (people), and all three submit to the same actions in `associations.ts`.
 * `EGC-ASSOC-003` requires exactly that: neither surface owns a private path,
 * and an architecture test asserts it in both directions.
 *
 * `origin` travels with a project association and steers **only** the audit
 * reason and which page is revalidated. It cannot select a table, a predicate or
 * a write.
 *
 * ## Ending, not removing
 *
 * The control says "end the link" rather than "remove", because that is what it
 * does (EGC-ASSOC-005): `valid_until` is set and the row survives. Calling it
 * removal would promise a deletion the product deliberately does not perform,
 * and the owner would have no way to learn otherwise.
 */

import { LoaderCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import { idleEntityEditState, type EntityEditState } from "./edit-state";
import type { EntityEditAction } from "./entity-edit-form";

export type AssociationRow = {
  readonly id: string;
  readonly label: string;
  /** Where the associated thing lives, or `null` when it has no page. */
  readonly href: string | null;
  /** `person_projects.role` — the owner's own words, never localized. */
  readonly role?: string | null;
};

export type AssociationOption = { readonly id: string; readonly label: string };

/**
 * Which association this panel writes.
 *
 * A discriminated union rather than loose props: the three placements need
 * different hidden fields, and a shape that let a project panel omit `projectId`
 * would be a runtime refusal the strict schema could not explain.
 */
export type AssociationTarget =
  | { readonly kind: "person-context"; readonly personId: string }
  | { readonly kind: "person-project"; readonly personId: string }
  | { readonly kind: "project-person"; readonly projectId: string };

function hiddenFields(target: AssociationTarget, selectedId: string) {
  switch (target.kind) {
    case "person-context":
      return { personId: target.personId, contextId: selectedId, origin: null };
    case "person-project":
      return { personId: target.personId, projectId: selectedId, origin: "person" as const };
    case "project-person":
      return { personId: selectedId, projectId: target.projectId, origin: "project" as const };
  }
}

export function AssociationPanel({
  addAction,
  endAction,
  heading,
  locale,
  options,
  roleAction,
  rows,
  target,
}: {
  addAction: EntityEditAction;
  endAction: EntityEditAction;
  heading: string;
  locale: Locale;
  /** Bounded at 200 upstream (EGC-ASSOC-008); only the owner's own rows. */
  options: readonly AssociationOption[];
  /** Present only where the association carries a role. */
  roleAction?: EntityEditAction;
  rows: readonly AssociationRow[];
  target: AssociationTarget;
}) {
  const copy = getEntityCopy(locale);
  const hasRole = target.kind !== "person-context";

  const emptyOptionsHint =
    target.kind === "person-context"
      ? copy.noContextsToAssociate
      : target.kind === "person-project"
        ? copy.noProjectsToAssociate
        : copy.noPeopleToAssociate;

  const addLabel =
    target.kind === "person-context"
      ? copy.addContextAssociation
      : target.kind === "person-project"
        ? copy.addProjectAssociation
        : copy.addPersonAssociation;

  /**
   * "You own none of these" and "you have linked them all" are different facts.
   *
   * The first draft collapsed them, and the Camila journey caught it: linking a
   * person to the owner's only context left the panel saying *create a context
   * first* — advice to make something they already had, printed over the success
   * it had just replaced. That is the same shape as `EG-04`, in a new place.
   */
  const allLinkedHint =
    target.kind === "person-context"
      ? copy.allContextsLinked
      : target.kind === "person-project"
        ? copy.allProjectsLinked
        : copy.allPeopleLinked;

  /** Rows the owner already has, so the selector cannot offer a duplicate. */
  const linkedIds = new Set(rows.map((row) => row.id));
  const selectable = options.filter((option) => !linkedIds.has(option.id));

  return (
    <section className="relation-panel">
      <h2>{heading}</h2>

      {rows.length ? (
        <ul className="relation-list">
          {rows.map((row) => (
            <AssociationRowItem
              endAction={endAction}
              key={row.id}
              locale={locale}
              roleAction={hasRole ? roleAction : undefined}
              row={row}
              target={target}
            />
          ))}
        </ul>
      ) : (
        <p className="quiet-state">
          {target.kind === "person-context" ? copy.contextsEmpty : copy.linkedProjectsEmpty}
        </p>
      )}

      <AssociationCreate
        action={addAction}
        addLabel={addLabel}
        allLinkedHint={allLinkedHint}
        emptyOptionsHint={emptyOptionsHint}
        hasRole={hasRole}
        locale={locale}
        options={selectable}
        ownsNone={options.length === 0}
        target={target}
      />
    </section>
  );
}

function AssociationRowItem({
  endAction,
  locale,
  roleAction,
  row,
  target,
}: {
  endAction: EntityEditAction;
  locale: Locale;
  roleAction?: EntityEditAction;
  row: AssociationRow;
  target: AssociationTarget;
}) {
  const copy = getEntityCopy(locale);
  const fieldId = useId();
  const fields = hiddenFields(target, row.id);
  const [editingRole, setEditingRole] = useState(false);
  const [endState, end, ending] = useActionState(endAction, idleEntityEditState);
  const [roleState, saveRole, savingRole] = useActionState(
    roleAction ?? endAction,
    idleEntityEditState,
  );

  const endLabel =
    target.kind === "person-context"
      ? copy.removeContextAssociation
      : target.kind === "person-project"
        ? copy.removeProjectAssociation
        : copy.removePersonAssociation;

  return (
    <li className="relation-row">
      <div className="relation-row-main">
        {row.href ? <Link href={row.href}><strong>{row.label}</strong></Link> : <strong>{row.label}</strong>}
        {roleAction ? <span>{row.role ?? copy.noRole}</span> : null}
      </div>

      <div className="relation-row-actions">
        {roleAction && !editingRole ? (
          <button onClick={() => setEditingRole(true)} type="button">{copy.roleLabel}</button>
        ) : null}
        <form action={end}>
          <input name="locale" type="hidden" value={locale} />
          <input name="personId" type="hidden" value={fields.personId} />
          {"contextId" in fields ? <input name="contextId" type="hidden" value={fields.contextId} /> : null}
          {"projectId" in fields ? <input name="projectId" type="hidden" value={fields.projectId} /> : null}
          {fields.origin ? <input name="origin" type="hidden" value={fields.origin} /> : null}
          <button disabled={ending} type="submit">
            {ending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <X aria-hidden="true" size={14} />}
            {endLabel}
          </button>
        </form>
      </div>

      {roleAction && editingRole ? (
        <form action={saveRole} className="relation-form">
          <input name="locale" type="hidden" value={locale} />
          <input name="personId" type="hidden" value={fields.personId} />
          {"projectId" in fields ? <input name="projectId" type="hidden" value={fields.projectId} /> : null}
          {fields.origin ? <input name="origin" type="hidden" value={fields.origin} /> : null}
          <label htmlFor={`${fieldId}-role`}>
            {copy.roleLabel}
            <input
              defaultValue={roleState.submitted?.role ?? row.role ?? ""}
              disabled={savingRole}
              id={`${fieldId}-role`}
              maxLength={120}
              name="role"
              placeholder={copy.rolePlaceholder}
              type="text"
            />
          </label>
          <div className="entity-edit-actions">
            <button className="entity-edit-save" disabled={savingRole} type="submit">
              {savingRole ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
              {savingRole ? copy.saving : copy.saveRole}
            </button>
            <button
              className="entity-edit-cancel"
              disabled={savingRole}
              onClick={() => setEditingRole(false)}
              type="button"
            >
              {copy.cancel}
            </button>
          </div>
          {roleState.status === "error" ? (
            <p className="entity-edit-feedback error" role="alert">{roleState.message}</p>
          ) : null}
        </form>
      ) : null}

      {endState.status === "error" ? (
        <p className="entity-edit-feedback error" role="alert">{endState.message}</p>
      ) : null}
    </li>
  );
}

function AssociationCreate({
  action,
  addLabel,
  allLinkedHint,
  emptyOptionsHint,
  hasRole,
  locale,
  options,
  ownsNone,
  target,
}: {
  action: EntityEditAction;
  addLabel: string;
  allLinkedHint: string;
  emptyOptionsHint: string;
  hasRole: boolean;
  locale: Locale;
  /** What is left to choose — the owner's own rows, minus what is already linked. */
  options: readonly AssociationOption[];
  /** Whether the owner has none of this kind at all, which is a different fact. */
  ownsNone: boolean;
  target: AssociationTarget;
}) {
  const copy = getEntityCopy(locale);
  const fieldId = useId();
  const [state, formAction, pending] = useActionState(action, idleEntityEditState);
  const [openedFor, setOpenedFor] = useState<EntityEditState | null>(null);
  const [dismissed, setDismissed] = useState<EntityEditState | null>(null);
  const open = openedFor === state || (state.status === "error" && dismissed !== state);

  /**
   * With nothing to choose, the panel explains instead of offering an empty
   * select (EGC-ASSOC-008).
   *
   * The disclosure is not merely disabled: a control that opens onto one empty
   * dropdown is the same dead end `EG-04` named on the Company selector, and
   * this initiative exists because of that pattern.
   */
  if (ownsNone) {
    return <p className="entity-edit-hint">{emptyOptionsHint}</p>;
  }

  /**
   * Everything is linked already — a *success* state, not a missing-prerequisite
   * one, and it keeps the outcome of the round that produced it.
   *
   * The first draft returned `emptyOptionsHint` here too. The Camila journey
   * caught it: linking a person to the owner's only context printed "create a
   * context first" over the confirmation it had just replaced.
   */
  if (options.length === 0) {
    return (
      <div className="entity-edit">
        <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {state.status === "idle" ? "" : state.message}
        </div>
        {state.status === "success" ? (
          <p className="entity-edit-feedback success">{state.message}</p>
        ) : null}
        <p className="entity-edit-hint">{allLinkedHint}</p>
      </div>
    );
  }

  const selectName =
    target.kind === "person-context" ? "contextId" : target.kind === "person-project" ? "projectId" : "personId";
  const selectLabel =
    target.kind === "person-context"
      ? copy.contextAssociationLabel
      : target.kind === "person-project"
        ? copy.projectAssociationLabel
        : copy.personAssociationLabel;
  const submitLabel =
    target.kind === "person-context"
      ? copy.saveContextAssociation
      : target.kind === "person-project"
        ? copy.saveProjectAssociation
        : copy.savePersonAssociation;

  if (!open) {
    return (
      <div className="entity-edit">
        <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {state.status === "idle" ? "" : state.message}
        </div>
        <button className="entity-edit-open" onClick={() => setOpenedFor(state)} type="button">
          <Plus aria-hidden="true" size={15} />
          {addLabel}
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
      {target.kind === "project-person" ? (
        <input name="projectId" type="hidden" value={target.projectId} />
      ) : (
        <input name="personId" type="hidden" value={target.personId} />
      )}
      {target.kind !== "person-context" ? (
        <input name="origin" type="hidden" value={target.kind === "person-project" ? "person" : "project"} />
      ) : null}

      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.saving : state.status === "idle" ? "" : state.message}
      </div>

      <label htmlFor={`${fieldId}-target`}>
        {selectLabel}
        <select
          defaultValue={state.submitted?.[selectName] ?? options[0]!.id}
          disabled={pending}
          id={`${fieldId}-target`}
          name={selectName}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      {hasRole ? (
        <label htmlFor={`${fieldId}-role`}>
          {copy.roleLabel}
          <input
            defaultValue={state.submitted?.role ?? ""}
            disabled={pending}
            id={`${fieldId}-role`}
            maxLength={120}
            name="role"
            placeholder={copy.rolePlaceholder}
            type="text"
          />
        </label>
      ) : null}

      <div className="entity-edit-actions">
        <button className="entity-edit-save" disabled={pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
          {pending ? copy.saving : submitLabel}
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
