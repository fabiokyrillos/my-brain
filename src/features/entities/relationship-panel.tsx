"use client";

/**
 * The relationship surface `person_relationships` never had (EGC-REL).
 *
 * The Person page has read this table since Slice F2 and rendered whatever it
 * found — which was always nothing, because nothing had ever written it. This is
 * the other half: add, correct, and end.
 *
 * **It decides nothing.** The vocabulary arrives already localized, whether a
 * write succeeded was settled by the Server Action, and an unrecognised stored
 * type arrives with `label: null` so the page renders the raw value rather than
 * this component guessing at one (EGC-REL-006).
 *
 * ## Why each row owns its own action state
 *
 * Ending a relationship and editing a different one are independent rounds. One
 * shared `useActionState` would put the outcome of the last click above every
 * row — "Relação encerrada" sitting over a relationship that is still live. So
 * each row is its own form with its own state, and the add form is a third.
 */

import { LoaderCircle, Pencil, Plus, X } from "lucide-react";
import { useActionState, useId, useState } from "react";

import { BoundedNotice } from "@/features/bounds/bounded-notice";
import type { Bounded } from "@/features/bounds/contracts";
import { ownerAuthored } from "@/features/provenance/contracts";
import { ProvenanceNote, SectionOriginNote } from "@/features/provenance/provenance-note";
import type { Locale } from "@/lib/preferences";

import { getEntityCopy } from "./copy";
import { idleEntityEditState, type EntityEditState } from "./edit-state";
import type { EntityEditAction } from "./entity-edit-form";
import { relationshipOptions, type RelationshipType } from "./relationship-vocabulary";

export type RelationshipRow = {
  readonly id: string;
  /** The stored value, always — the raw fallback needs it (EGC-REL-006). */
  readonly storedType: string;
  /** The localized term, or `null` when the stored value is outside the vocabulary. */
  readonly label: string | null;
  /** User content. Never localized, never matched, never an instruction. */
  readonly description: string | null;
  readonly since: string;
};

export function RelationshipPanel({
  bound,
  createAction,
  endAction,
  locale,
  personId,
  relationships,
  updateAction,
}: {
  /**
   * The bound for `relationships`, **required** for the reason
   * `association-panel.tsx` records at length: the person page fetched this list
   * with `withProbe(RELATION_LIMIT)` and handed it straight here, so at 51
   * relationships it rendered the probe row and reported nothing. An optional
   * prop would leave the next caller free to forget, and forgetting is silent.
   */
  readonly bound: Bounded<unknown>;
  createAction: EntityEditAction;
  endAction: EntityEditAction;
  locale: Locale;
  personId: string;
  /** Always `bound.items`, mapped - never the untrimmed query result. */
  relationships: readonly RelationshipRow[];
  updateAction: EntityEditAction;
}) {
  const copy = getEntityCopy(locale);

  return (
    <section className="relation-panel">
      <h2>{copy.relationships}</h2>
      {/*
        EGC-REL-009. Company and relationship-to-owner are two concerns, and the
        page says which is which rather than leaving the owner to work out why
        there are two places that look like they describe the same person.
      */}
      <p className="relation-explainer">{copy.relationshipExplainer}</p>
      {/*
        `2N-PERSON-004`: persisted — the owner adds, corrects and ends these here.
        `2N-RELATION-002`/`-008`: the origin is stated ONCE for the section rather
        than repeated on every row. `person_relationships` carries no
        `source_entry_id` and no `interpretation_id`, so every row has the same
        answer, and printing "informado por você" under each of twelve rows would
        be noise that says nothing a reader could act on. It is the section's
        property, so it is the section that says it.
      */}
      <SectionOriginNote locale={locale} origin="persisted" />
      <ProvenanceNote locale={locale} provenance={ownerAuthored("person_relationships")} subject="" />

      {relationships.length ? (
        <ul className="relation-list">
          {relationships.map((relationship) => (
            <RelationshipRowItem
              endAction={endAction}
              key={relationship.id}
              locale={locale}
              personId={personId}
              relationship={relationship}
              updateAction={updateAction}
            />
          ))}
        </ul>
      ) : (
        <p className="quiet-state">{copy.relationshipsEmpty}</p>
      )}

      <BoundedNotice list={bound} locale={locale} />

      <RelationshipCreate action={createAction} locale={locale} personId={personId} />
    </section>
  );
}

function RelationshipRowItem({
  endAction,
  locale,
  personId,
  relationship,
  updateAction,
}: {
  endAction: EntityEditAction;
  locale: Locale;
  personId: string;
  relationship: RelationshipRow;
  updateAction: EntityEditAction;
}) {
  const copy = getEntityCopy(locale);
  const fieldId = useId();
  const [updateState, update, updating] = useActionState(updateAction, idleEntityEditState);
  const [endState, end, ending] = useActionState(endAction, idleEntityEditState);

  /**
   * Openness derived from *which state object* is current, not held free.
   *
   * A plain `useState` boolean never cleared on success left this form open
   * after a successful correction, showing the values it had just saved with no
   * confirmation of any kind — the only signal was the spinner stopping. The
   * derivation below is the one the create forms use: a success closes because
   * the row above has already re-rendered with the new term, an error stays open
   * because there is something to fix, and `dismissed` guards only the error
   * clause so an explicit reopen always wins.
   */
  const [openedFor, setOpenedFor] = useState<EntityEditState | null>(null);
  const [dismissed, setDismissed] = useState<EntityEditState | null>(null);
  const editing = openedFor === updateState
    || (updateState.status === "error" && dismissed !== updateState);

  /**
   * A type outside the vocabulary renders its stored value, in a muted style,
   * with a neutral label beside it (EGC-REL-006).
   *
   * The column carries no CHECK on purpose, so a future extraction pass writing
   * `godparent` must leave a row that reads oddly rather than one that fails to
   * insert. Rendering blank would be worse than rendering the token: the owner
   * would see a relationship that appears to say nothing.
   */
  const known = relationship.label !== null;
  /** What each control names, so two rows never share an accessible name. */
  const subject = known ? relationship.label! : relationship.storedType;

  if (editing) {
    return (
      <li className="relation-row">
        <form action={update} className="relation-form">
          <input name="locale" type="hidden" value={locale} />
          <input name="personId" type="hidden" value={personId} />
          <input name="relationshipId" type="hidden" value={relationship.id} />

          <div aria-atomic="true" aria-busy={updating} aria-live="polite" className="sr-only" role="status">
            {updating ? copy.saving : updateState.status === "idle" ? "" : updateState.message}
          </div>

          <label htmlFor={`${fieldId}-type`}>
            {copy.relationshipTypeLabel}
            <select
              defaultValue={
                (updateState.submitted?.relationshipType as RelationshipType | undefined)
                ?? (known ? relationship.storedType : "other")
              }
              disabled={updating}
              id={`${fieldId}-type`}
              name="relationshipType"
            >
              {relationshipOptions(locale).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label htmlFor={`${fieldId}-description`}>
            {copy.relationshipDescriptionLabel}
            <input
              defaultValue={updateState.submitted?.description ?? relationship.description ?? ""}
              disabled={updating}
              id={`${fieldId}-description`}
              maxLength={500}
              name="description"
              type="text"
            />
          </label>

          <div className="entity-edit-actions">
            <button className="entity-edit-save" disabled={updating} type="submit">
              {updating ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
              {updating ? copy.saving : copy.saveRelationship}
            </button>
            <button
              className="entity-edit-cancel"
              disabled={updating}
              onClick={() => { setDismissed(updateState); setOpenedFor(null); }}
              type="button"
            >
              {copy.cancel}
            </button>
          </div>

          {updateState.status === "error" ? (
            <p className="entity-edit-feedback error" role="alert">{updateState.message}</p>
          ) : null}
        </form>
      </li>
    );
  }

  return (
    <li className="relation-row">
      <div className="relation-row-main">
        <strong className={known ? undefined : "relation-unknown"}>
          {known ? relationship.label : relationship.storedType}
        </strong>
        {known ? null : <small className="relation-unknown-note">{copy.unknownRelationship}</small>}
        <span>{relationship.description ?? `${copy.since} ${relationship.since}`}</span>
      </div>
      {/*
        Both controls carry an `aria-label` naming the relationship they act on.
        Without it a person with a spouse and a sibling gives a screen-reader
        user two buttons called "Editar relação" and two called "Encerrar
        relação", with nothing to tell them apart — the same duplicate-name
        problem `cancelInline` exists to prevent elsewhere in this feature.
      */}
      <div className="relation-row-actions">
        <button
          aria-label={`${copy.editRelationship}: ${subject}`}
          onClick={() => setOpenedFor(updateState)}
          type="button"
        >
          <Pencil aria-hidden="true" size={14} />
          {copy.editRelationship}
        </button>
        <form action={end}>
          <input name="locale" type="hidden" value={locale} />
          <input name="personId" type="hidden" value={personId} />
          <input name="relationshipId" type="hidden" value={relationship.id} />
          <button aria-label={`${copy.endRelationship}: ${subject}`} disabled={ending} type="submit">
            {ending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <X aria-hidden="true" size={14} />}
            {copy.endRelationship}
          </button>
        </form>
      </div>
      <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {endState.status === "idle" ? "" : endState.message}
      </div>
      {updateState.status === "success" ? (
        <p className="entity-edit-feedback success">{updateState.message}</p>
      ) : null}
      {endState.status === "error" ? (
        <p className="entity-edit-feedback error" role="alert">{endState.message}</p>
      ) : null}
    </li>
  );
}

function RelationshipCreate({
  action,
  locale,
  personId,
}: {
  action: EntityEditAction;
  locale: Locale;
  personId: string;
}) {
  const copy = getEntityCopy(locale);
  const fieldId = useId();
  const [state, formAction, pending] = useActionState(action, idleEntityEditState);
  const [openedFor, setOpenedFor] = useState<EntityEditState | null>(null);
  const [dismissed, setDismissed] = useState<EntityEditState | null>(null);
  // `dismissed` guards only the error clause — the correction EGC.1's review
  // made, for the reason recorded in `entity-edit-form.tsx`: guarding the whole
  // expression makes Cancel-after-a-refusal permanent.
  const open = openedFor === state || (state.status === "error" && dismissed !== state);

  if (!open) {
    return (
      <div className="entity-edit">
        <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {state.status === "idle" ? "" : state.message}
        </div>
        <button className="entity-edit-open" onClick={() => setOpenedFor(state)} type="button">
          <Plus aria-hidden="true" size={15} />
          {copy.addRelationship}
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
      <input name="personId" type="hidden" value={personId} />

      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.saving : state.status === "idle" ? "" : state.message}
      </div>

      <label htmlFor={`${fieldId}-type`}>
        {copy.relationshipTypeLabel}
        <select
          defaultValue={state.submitted?.relationshipType ?? "spouse"}
          disabled={pending}
          id={`${fieldId}-type`}
          key={`type-${state.submitted?.relationshipType ?? "spouse"}`}
          name="relationshipType"
        >
          {relationshipOptions(locale).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label htmlFor={`${fieldId}-description`}>
        {copy.relationshipDescriptionLabel}
        <input
          aria-describedby={`${fieldId}-description-hint`}
          defaultValue={state.submitted?.description ?? ""}
          disabled={pending}
          id={`${fieldId}-description`}
          maxLength={500}
          name="description"
          type="text"
        />
      </label>
      <small className="entity-edit-hint" id={`${fieldId}-description-hint`}>
        {copy.relationshipDescriptionHint}
      </small>

      <div className="entity-edit-actions">
        <button className="entity-edit-save" disabled={pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
          {pending ? copy.saving : copy.saveRelationship}
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
