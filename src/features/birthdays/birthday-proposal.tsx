"use client";

/**
 * ADR-158 — "Guardar o aniversário de Ana: 5 de maio?" on the record page.
 *
 * One proposal per person the record is about and states a birthday for, when
 * that person has none yet. Accepting calls the same writer as the person page
 * (`setPersonBirthday` → `set_person_birthday`), which creates the yearly
 * reminder; not accepting leaves everything as it was. A different date is
 * the person page's job, linked here. The result is announced politely.
 *
 * Drawn as the record page's other suggestions are (ADR-184): the question in
 * the reading face, its answers in one row beside it, no heading of its own and
 * no primary button — a record can ask several things, and the product allows
 * one primary control per view. The form and its fields are the ones it always
 * had; each answer was already one tap.
 */

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import type { Locale } from "@/lib/preferences";

import { getBirthdayCopy } from "./copy";
import type { BirthdayProposal } from "./entry-birthdays";
import { idleBirthdayState, type BirthdayAction, type BirthdayActionState } from "./state";

export function BirthdayProposals({
  action,
  declineAction,
  locale,
  proposals,
}: {
  action: BirthdayAction;
  /** Life Brain D.3: the remembered "não, obrigado". */
  declineAction: BirthdayAction;
  locale: Locale;
  proposals: readonly BirthdayProposal[];
}) {
  const copy = getBirthdayCopy(locale);
  if (proposals.length === 0) return null;
  return (
    <ul aria-label={copy.proposalHeading} className="record-question-list">
      {proposals.map((proposal) => (
        <li key={proposal.personId}>
          <BirthdayProposalRow action={action} declineAction={declineAction} locale={locale} proposal={proposal} />
        </li>
      ))}
    </ul>
  );
}

function BirthdayProposalRow({ action, declineAction, locale, proposal }: { action: BirthdayAction; declineAction: BirthdayAction; locale: Locale; proposal: BirthdayProposal }) {
  const copy = getBirthdayCopy(locale);
  // One state for both answers, routed by the button the owner pressed.
  const [state, formAction, pending] = useActionState(
    (previous: BirthdayActionState, formData: FormData) =>
      formData.get("answer") === "decline" ? declineAction(previous, formData) : action(previous, formData),
    idleBirthdayState,
  );
  const done = state.status === "success";
  return (
    <div aria-label={copy.reminderTitle(proposal.name)} className="record-question" role="group">
      {done ? null : (
        <>
          <p className="record-question-text">
            {copy.proposal(proposal.name, copy.format(proposal.day, proposal.month, proposal.year))}
          </p>
          <form action={formAction} className="record-question-actions">
            <input name="personId" type="hidden" value={proposal.personId} />
            <input name="locale" type="hidden" value={locale} />
            <input name="intent" type="hidden" value="set" />
            <input name="day" type="hidden" value={proposal.day} />
            <input name="month" type="hidden" value={proposal.month} />
            <input name="year" type="hidden" value={proposal.year ?? ""} />
            <Button loading={pending} name="answer" type="submit" value="accept">{pending ? copy.saving : copy.accept}</Button>
            <Button disabled={pending} name="answer" type="submit" value="decline" variant="ghost">{copy.decline}</Button>
            <Link className="record-question-link" href={`/${locale}/app/people/${proposal.personId}`}>{copy.adjust(proposal.name)}</Link>
          </form>
        </>
      )}
      {/* Always in the document, so the answer is announced when it arrives. */}
      <p aria-live="polite" className="birthday-status" data-status={state.status} role="status">
        {state.status === "idle" ? "" : state.message}
      </p>
    </div>
  );
}
