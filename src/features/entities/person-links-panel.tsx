"use client";

import { LoaderCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useId } from "react";

import { UniversalStateLine } from "@/features/experience/universal-state";
import { SectionOriginNote } from "@/features/provenance/provenance-note";
import type { Locale } from "@/lib/preferences";

import { idleEntityEditState } from "./edit-state";
import type { EntityEditAction } from "./entity-edit-form";
import { getPersonLinksCopy } from "./person-links-copy";
import type { PersonLink } from "./person-links-projection";
import { describeRelationshipType, personLinkOptions } from "./relationship-vocabulary";

/**
 * Life Brain E.2 (ADR-170) — "Pessoas ligadas": who this person is linked to
 * among the owner's people, each with what they are to this person, and a way
 * to add or end a link. One stored row shows on both people's pages, the
 * other end reading the reciprocal term (`person-links-projection.ts`).
 *
 * `<h3>`, like `RelationshipPanel`: it sits inside the page's "o que o
 * assistente sabe" column, whose heading is the `<h2>`.
 */
export function PersonLinksPanel({
  createAction,
  endAction,
  links,
  locale,
  people,
  personId,
  personName,
}: {
  createAction: EntityEditAction;
  endAction: EntityEditAction;
  links: readonly PersonLink[];
  locale: Locale;
  /** The owner's other people, for the picker. */
  people: readonly { readonly id: string; readonly name: string }[];
  personId: string;
  personName: string;
}) {
  const copy = getPersonLinksCopy(locale);
  const candidates = people.filter((person) => person.id !== personId);

  return (
    <section className="relation-panel">
      <h3>{copy.heading}</h3>
      <p className="relation-explainer">{copy.explainer(personName)}</p>
      <SectionOriginNote locale={locale} origin="persisted" />

      {links.length ? (
        <ul className="relation-list">
          {links.map((link) => (
            <PersonLinkItem endAction={endAction} key={link.id} link={link} locale={locale} personId={personId} />
          ))}
        </ul>
      ) : (
        <UniversalStateLine description={copy.empty} locale={locale} state="empty" />
      )}

      {candidates.length ? (
        <PersonLinkCreate action={createAction} candidates={candidates} locale={locale} personId={personId} personName={personName} />
      ) : (
        <p className="relation-explainer">{copy.noOtherPeople}</p>
      )}
    </section>
  );
}

function PersonLinkItem({
  endAction,
  link,
  locale,
  personId,
}: {
  endAction: EntityEditAction;
  link: PersonLink;
  locale: Locale;
  personId: string;
}) {
  const copy = getPersonLinksCopy(locale);
  const [state, end, ending] = useActionState(endAction, idleEntityEditState);

  return (
    <li className="relation-row">
      <span className="relation-row-main">
        <Link href={`/${locale}/app/people/${link.otherId}`}>{link.otherName}</Link>
        <span className="relation-unknown-note">{describeRelationshipType(locale, link.type)}</span>
      </span>
      <form action={end} className="relation-row-actions">
        <input name="locale" type="hidden" value={locale} />
        <input name="personId" type="hidden" value={personId} />
        <input name="linkId" type="hidden" value={link.id} />
        <button aria-label={copy.end(link.otherName)} className="entity-edit-cancel" disabled={ending} title={copy.end(link.otherName)} type="submit">
          {ending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <X aria-hidden="true" size={16} />}
        </button>
      </form>
      {state.status === "error" ? <p className="entity-edit-feedback error" role="alert">{state.message}</p> : null}
    </li>
  );
}

function PersonLinkCreate({
  action,
  candidates,
  locale,
  personId,
  personName,
}: {
  action: EntityEditAction;
  candidates: readonly { readonly id: string; readonly name: string }[];
  locale: Locale;
  personId: string;
  personName: string;
}) {
  const copy = getPersonLinksCopy(locale);
  const id = useId();
  const [state, create, saving] = useActionState(action, idleEntityEditState);

  return (
    <details className="entity-edit">
      <summary className="entity-edit-open">
        <Plus aria-hidden="true" size={16} />
        {copy.add}
      </summary>
      <form action={create} className="relation-form">
        <input name="locale" type="hidden" value={locale} />
        <input name="personId" type="hidden" value={personId} />
        <label htmlFor={`${id}-other`}>
          {copy.otherLabel}
          <select defaultValue={state.submitted?.otherPersonId ?? ""} disabled={saving} id={`${id}-other`} name="otherPersonId" required>
            <option disabled value="">—</option>
            {candidates.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-type`}>
          {copy.typeLabel(personName)}
          <select defaultValue={state.submitted?.relationshipType ?? "friend"} disabled={saving} id={`${id}-type`} name="relationshipType">
            {personLinkOptions(locale).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button className="entity-edit-save" disabled={saving} type="submit">
          {saving ? copy.saving : copy.save}
        </button>
        <div aria-live="polite" role="status">
          {state.status === "success" ? <p className="entity-edit-feedback success">{state.message}</p> : null}
        </div>
        {state.status === "error" ? <p className="entity-edit-feedback error" role="alert">{state.message}</p> : null}
      </form>
    </details>
  );
}
