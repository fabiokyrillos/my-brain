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
 * `origin` travels with a project association and reaches **only** the audit
 * reason, which records which page the owner was on. It cannot select a table, a
 * predicate or a write, and revalidation does not depend on it — both pages
 * render the same row and both are refreshed either way.
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

import { BoundedNotice } from "@/features/bounds/bounded-notice";
import type { Bounded } from "@/features/bounds/contracts";
import { ownerAuthored } from "@/features/provenance/contracts";
import { ProvenanceNote, SectionOriginNote } from "@/features/provenance/provenance-note";

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
  bound,
  endAction,
  heading,
  locale,
  options,
  roleAction,
  rows,
  target,
}: {
  addAction: EntityEditAction;
  /**
   * The bound for `rows`, and **required on purpose** (`2N-PERSON-003`,
   * `2N-PROJECT-006`).
   *
   * The person and project pages already fetched these lists with
   * `withProbe(limit)` and then handed the result straight to this panel, so the
   * probe row was *rendered* and the bound was never reported: at 51 contexts or
   * 101 linked projects the page silently showed one row too many and claimed to
   * be complete. Three lists on the person page and one on the project page were
   * in that state.
   *
   * Optional would have re-created the failure `bounded-notice.tsx` describes -
   * a convergence held together by each caller remembering - and the symptom is
   * silent, because a list that forgets simply looks complete. Required makes
   * the type system the thing that remembers.
   */
  readonly bound: Bounded<unknown>;
  endAction: EntityEditAction;
  heading: string;
  locale: Locale;
  /** Bounded at 200 upstream (EGC-ASSOC-008); only the owner's own rows. */
  options: readonly AssociationOption[];
  /** Present only where the association carries a role. */
  roleAction?: EntityEditAction;
  /** Always `bound.items`, mapped - never the untrimmed query result. */
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
      {/*
        Persisted, and owner-authored by construction: neither `person_contexts`
        nor `person_projects` carries a `source_entry_id` or an
        `interpretation_id`, so there is nothing else the origin could be. Stated
        once for the section rather than on every row — see
        `relationship-panel.tsx` for why.
      */}
      <SectionOriginNote locale={locale} origin="persisted" />
      <ProvenanceNote
        locale={locale}
        provenance={ownerAuthored(target.kind === "person-context" ? "person_contexts" : "person_projects")}
        subject=""
      />

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
          {/*
            Three placements, so three sentences. A two-way ternary here made the
            Project page's People panel say "Nenhum projeto vinculado" under a
            heading reading "Pessoas" — the right copy key existed and was simply
            never reached.
          */}
          {target.kind === "person-context"
            ? copy.contextsEmpty
            : target.kind === "person-project"
              ? copy.linkedProjectsEmpty
              : copy.linkedPeopleEmpty}
        </p>
      )}

      {/*
        Above the create control rather than below it: the notice belongs to the
        list it describes, and a bound printed under "Add a project" reads as a
        statement about the selector instead.
      */}
      <BoundedNotice list={bound} locale={locale} />

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
  const [endState, end, ending] = useActionState(endAction, idleEntityEditState);
  const [roleState, saveRole, savingRole] = useActionState(
    roleAction ?? endAction,
    idleEntityEditState,
  );

  /**
   * The same state-identity derivation the create forms use.
   *
   * A plain boolean never cleared on success left the role editor open after a
   * successful save, showing the value it had just written with no confirmation
   * — the only signal was the spinner stopping, and a screen-reader user got
   * nothing at all.
   */
  const [openedFor, setOpenedFor] = useState<EntityEditState | null>(null);
  const [dismissed, setDismissed] = useState<EntityEditState | null>(null);
  const editingRole = openedFor === roleState
    || (roleState.status === "error" && dismissed !== roleState);

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
        {/*
          Named for what it does and for which row it does it to. `copy.roleLabel`
          alone was both the wrong kind of label — "Papel" is a noun, not an
          action — and a duplicate of the `<label>` of the field it opens.
        */}
        {roleAction && !editingRole ? (
          <button
            aria-label={`${copy.editRole}: ${row.label}`}
            onClick={() => setOpenedFor(roleState)}
            type="button"
          >
            {copy.editRole}
          </button>
        ) : null}
        <form action={end}>
          <input name="locale" type="hidden" value={locale} />
          <input name="personId" type="hidden" value={fields.personId} />
          {"contextId" in fields ? <input name="contextId" type="hidden" value={fields.contextId} /> : null}
          {"projectId" in fields ? <input name="projectId" type="hidden" value={fields.projectId} /> : null}
          {fields.origin ? <input name="origin" type="hidden" value={fields.origin} /> : null}
          <button aria-label={`${endLabel}: ${row.label}`} disabled={ending} type="submit">
            {ending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <X aria-hidden="true" size={14} />}
            {endLabel}
          </button>
        </form>
      </div>

      {roleAction && editingRole ? (
        <form action={saveRole} className="relation-form">
          <input name="locale" type="hidden" value={locale} />
          <input name="personId" type="hidden" value={fields.personId} />
          <div aria-atomic="true" aria-busy={savingRole} aria-live="polite" className="sr-only" role="status">
            {savingRole ? copy.saving : roleState.status === "idle" ? "" : roleState.message}
          </div>
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
              onClick={() => { setDismissed(roleState); setOpenedFor(null); }}
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

      <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {endState.status === "idle" ? "" : endState.message}
      </div>
      {roleState.status === "success" ? (
        <p className="entity-edit-feedback success">{roleState.message}</p>
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
        {/* Keyed on its own default, for the reason every other select in this
            feature records: React applies `defaultValue` to a select only on
            mount, so after a refusal the restored value needs a remount to take.
            Without it, a `foreignTarget` or duplicate refusal would silently
            revert the selection to the first option. */}
        <select
          defaultValue={state.submitted?.[selectName] ?? options[0]!.id}
          disabled={pending}
          id={`${fieldId}-target`}
          key={`target-${state.submitted?.[selectName] ?? options[0]!.id}`}
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
