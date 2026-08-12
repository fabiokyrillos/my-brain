import { ArrowRight, CircleCheck, CircleSlash, Clock } from "lucide-react";
import Link from "next/link";

import { withAgentName } from "@/lib/agent-name";
import type { Locale } from "@/lib/preferences";

import { formatInstant } from "@/lib/time/instant-format";
import { getQuestionOutcomeCopy } from "./question-outcome-copy";
import type { QuestionOutcomeView } from "./question-outcome-projection";

/**
 * One resolved question, and what it changed (UX-11).
 *
 * The four things the surface never said, in order: **what you wrote**, **what
 * it changed**, **whether anything is still waiting on you**, and **where it is
 * recorded**. Each is a separate line rather than one sentence, because they
 * are separately actionable — the link is the only one that leads anywhere.
 *
 * Reads nothing and writes nothing. The disposition and the effect both arrive
 * decided from the projection, so "did this re-interpret the record" is
 * answered in one place, from the audit row that proves it.
 */
export function QuestionOutcomeCard({
  agentName,
  locale,
  outcome,
  timeZone,
}: {
  agentName: string;
  locale: Locale;
  outcome: QuestionOutcomeView;
  /** The owner's zone (`LDC-AGENT-001`). Required, never defaulted. */
  timeZone: string;
}) {
  const copy = withAgentName(getQuestionOutcomeCopy(locale), agentName);
  const date = (value: string) => formatInstant(value, "dayAndTime", locale, timeZone) ?? "";

  const effect = outcome.disposition === "dismissed"
    ? copy.effectDismissed
    : outcome.disposition === "deferred"
      ? copy.effectDeferred
      : outcome.reinterpreted
        ? copy.effectReinterpreted
        : copy.effectRecorded;

  const Icon = outcome.disposition === "dismissed"
    ? CircleSlash
    : outcome.disposition === "deferred"
      ? Clock
      : CircleCheck;

  return (
    <article className="question-outcome" data-disposition={outcome.disposition}>
      <header>
        <span className="question-outcome-disposition">
          <Icon aria-hidden="true" size={14} />
          {copy.dispositions[outcome.disposition]}
        </span>
        {outcome.answeredAt ? (
          <span className="question-outcome-when">{copy.answeredOn} {date(outcome.answeredAt)}</span>
        ) : null}
        {outcome.deferredUntil ? (
          <span className="question-outcome-when">{copy.returnsOn} {date(outcome.deferredUntil)}</span>
        ) : null}
      </header>

      <h3>{outcome.question}</h3>
      <p className="question-outcome-reason">{outcome.reason}</p>

      {/*
        Owner content, rendered as text. The answer is quoted so it reads as
        theirs rather than as the product's own words.
      */}
      {outcome.answer === null ? null : (
        <p className="question-outcome-answer">
          <span>{copy.youAnswered}</span>
          <q>{outcome.answer}</q>
        </p>
      )}

      <p className="question-outcome-effect">{effect}</p>

      <Link className="question-outcome-link" href={`/${locale}/app/inbox/${outcome.entryId}`}>
        {copy.openEntry}
        <ArrowRight aria-hidden="true" size={14} />
      </Link>
    </article>
  );
}
