"use client";

/**
 * ADR-158 — "Guardar o aniversário de Ana: 5 de maio?" on the record page.
 *
 * One proposal per person the record is about and states a birthday for, when
 * that person has none yet. Accepting calls the same writer as the person page
 * (`setPersonBirthday` → `set_person_birthday`), which creates the yearly
 * reminder; not accepting leaves everything as it was. A different date is
 * the person page's job, linked here. The result is announced politely.
 */

import { CalendarHeart } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import type { Locale } from "@/lib/preferences";

import { getBirthdayCopy } from "./copy";
import type { BirthdayProposal } from "./entry-birthdays";
import { idleBirthdayState, type BirthdayAction } from "./state";

export function BirthdayProposals({
  action,
  locale,
  proposals,
}: {
  action: BirthdayAction;
  locale: Locale;
  proposals: readonly BirthdayProposal[];
}) {
  const copy = getBirthdayCopy(locale);
  if (proposals.length === 0) return null;
  return (
    <section aria-label={copy.proposalHeading} className="birthday-proposals">
      <h3>{copy.proposalHeading}</h3>
      {proposals.map((proposal) => (
        <BirthdayProposalRow action={action} key={proposal.personId} locale={locale} proposal={proposal} />
      ))}
    </section>
  );
}

function BirthdayProposalRow({ action, locale, proposal }: { action: BirthdayAction; locale: Locale; proposal: BirthdayProposal }) {
  const copy = getBirthdayCopy(locale);
  const [state, formAction, pending] = useActionState(action, idleBirthdayState);
  const done = state.status === "success";
  return (
    <div className="birthday-proposal">
      <p className="birthday-line">
        <CalendarHeart aria-hidden="true" size={16} />
        <span>{copy.proposal(proposal.name, copy.format(proposal.day, proposal.month, proposal.year))}</span>
      </p>
      {done ? null : (
        <form action={formAction} className="birthday-proposal-form">
          <input name="personId" type="hidden" value={proposal.personId} />
          <input name="locale" type="hidden" value={locale} />
          <input name="intent" type="hidden" value="set" />
          <input name="day" type="hidden" value={proposal.day} />
          <input name="month" type="hidden" value={proposal.month} />
          <input name="year" type="hidden" value={proposal.year ?? ""} />
          <Button loading={pending} size="sm" type="submit" variant="primary">{pending ? copy.saving : copy.accept}</Button>
          <Link href={`/${locale}/app/people/${proposal.personId}`}>{copy.adjust(proposal.name)}</Link>
        </form>
      )}
      <p aria-live="polite" className="birthday-status" data-status={state.status} role="status">
        {state.status === "idle" ? "" : state.message}
      </p>
    </div>
  );
}
