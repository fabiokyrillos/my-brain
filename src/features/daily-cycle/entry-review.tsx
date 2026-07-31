import type { ReactNode } from "react";
import Link from "next/link";
import { InterpretationReviewViewed } from "@/features/product-analytics/interaction-events";
import { AlertTriangle, Clock3, Quote, Sparkles } from "lucide-react";
import type { AttentionItemView, AttentionReason, CandidateOutcomeView, EntryOutcomeView, InterpretationReviewView, OriginalEntryView } from "./contracts";
import { getDailyCycleCopy, getEntryReviewSectionCopy, type DailyCycleLocale } from "./copy";

const errorShapedReasons: readonly AttentionReason[] = ["retry_processing", "resolve_consistency"];

export function ReviewUnderstanding({
  view,
  locale,
  agentName,
  occurredAtLabel,
}: {
  view: InterpretationReviewView;
  locale: DailyCycleLocale;
  agentName: string;
  occurredAtLabel: string;
}) {
  const pt = locale === "pt-BR";
  const statusCopy = getDailyCycleCopy(locale, agentName).productStates[view.productState];

  return (
    <header className="entry-heading review-understanding">
      <div>
        <p className="eyebrow">{pt ? "INTERPRETAÇÃO DO BRAIN" : "BRAIN INTERPRETATION"}</p>
        <h1>{view.understanding}</h1>
        <p>{occurredAtLabel}</p>
        {view.humanFields.length > 0 && (
          <dl className="review-facts">
            {view.humanFields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{field.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        {view.productState === "organizing" && (
          <p className="review-organizing-note"><Sparkles size={14} aria-hidden="true" />{statusCopy.description}</p>
        )}
      </div>
      <span className={`entry-status entry-status-${view.productState}`}>
        <Clock3 size={16} aria-hidden="true" />{statusCopy.label}
      </span>
    </header>
  );
}

export function ReviewAttention({
  items,
  locale,
  detail,
  children,
}: {
  items: readonly AttentionItemView[];
  locale: DailyCycleLocale;
  detail?: string | null;
  children?: ReactNode;
}) {
  if (items.length === 0) return null;
  const [item] = items;
  const pt = locale === "pt-BR";
  const isErrorShaped = errorShapedReasons.includes(item.reason);

  return (
    <section className="review-attention" aria-label={pt ? "Precisa de você" : "Needs your attention"}>
      <div className={`notice-card attention-notice${isErrorShaped ? " error-notice" : ""}`}>
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>{item.title}</strong>
          <p>{item.explanation}</p>
          {isErrorShaped && <p className="attention-safety-note">{pt ? "O original está seguro." : "The original is safe."}</p>}
          {detail && <p className="attention-detail">{detail}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}

export function ReviewNextActions({ locale, children }: { locale: DailyCycleLocale; children: ReactNode }) {
  const pt = locale === "pt-BR";
  return (
    <section className="review-next-actions interpretation-actions phase-2b-task-actions" aria-label={pt ? "Próximas ações" : "Next actions"}>
      <div className="section-heading">
        <span aria-hidden="true">→</span>
        <div>
          <h2>{pt ? "Próximas ações" : "Next actions"}</h2>
          <p>{pt ? "Nada vira tarefa sem sua confirmação." : "Nothing becomes a task without your confirmation."}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * What the owner wrote, always open (UX-04).
 *
 * The audit's first question of this page is "what did I write?", and the
 * answer was behind a `<details>` labelled "Ver registro original" — collapsed
 * unless the interpretation had failed, i.e. shown by default only when there
 * was nothing else to show. The owner's own words are the record; the
 * interpretation is a reading of them. This now sits directly under the heading
 * and cannot be collapsed away.
 */
export function OriginalRecord({
  original,
  locale,
}: {
  original: OriginalEntryView;
  locale: DailyCycleLocale;
}) {
  const copy = getEntryReviewSectionCopy(locale);
  return (
    <section className="original-entry review-original" aria-labelledby="review-original-title">
      <div className="section-heading">
        <Quote size={17} aria-hidden="true" />
        <div>
          <h2 id="review-original-title">{copy.originalTitle}</h2>
          <p>{copy.originalNote}</p>
        </div>
      </div>
      <p className="review-original-content">{original.content}</p>
    </section>
  );
}

/**
 * What now exists because of this entry (UX-04).
 *
 * Reads only. Every row here was created by an action the owner already took —
 * confirming a candidate, answering a question, letting the interpretation link
 * an entity — and this is the page's standing account of it, not the transient
 * success message the candidate form used to show and then forget.
 *
 * An item links when a route can actually receive it and renders as plain text
 * when none exists, which is UX-20's rule rather than a styling choice.
 */
export function EntryOutcomes({
  outcomes,
  locale,
}: {
  outcomes: EntryOutcomeView;
  locale: DailyCycleLocale;
}) {
  const copy = getEntryReviewSectionCopy(locale);

  return (
    <section className="entry-outcomes" aria-labelledby="entry-outcomes-title">
      <div className="section-heading">
        <span aria-hidden="true">◆</span>
        <div>
          <h2 id="entry-outcomes-title">{copy.outcomesTitle}</h2>
          <p>{copy.outcomesNote}</p>
        </div>
      </div>

      {outcomes.isEmpty ? (
        /* Said rather than hidden: "nothing was created" is an answer to the
           owner's question, and an absent section is not. */
        <p className="entry-outcomes-empty">{copy.outcomesEmpty}</p>
      ) : (
        outcomes.groups.map((group) => (
          <div className="entry-outcome-group" key={group.family}>
            <h3>{group.heading}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.key}>
                  {item.href === null ? (
                    <span className="entry-outcome-title">{item.title}</span>
                  ) : (
                    <Link className="entry-outcome-title" href={item.href}>{item.title}</Link>
                  )}
                  {item.detail === null ? null : <span className="entry-outcome-detail">{item.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

export function CandidateOutcomeHistory({
  outcomes,
  locale,
}: {
  outcomes: readonly CandidateOutcomeView[];
  locale: DailyCycleLocale;
}) {
  if (outcomes.length === 0) return null;
  const pt = locale === "pt-BR";
  return (
    <section className="candidate-outcome-history" aria-labelledby="candidate-outcome-history-title">
      <div className="section-heading">
        <span aria-hidden="true">✓</span>
        <div>
          <h2 id="candidate-outcome-history-title">{pt ? "Decisões anteriores" : "Previous decisions"}</h2>
          <p>{pt ? "O histórico deste registro permanece visível." : "This record's history remains visible."}</p>
        </div>
      </div>
      <ul>
        {outcomes.map((outcome) => (
          <li key={outcome.key}>
            <strong>{outcome.title}</strong>
            <span>{outcome.outcomeLabel}</span>
            <time dateTime={outcome.resolvedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(outcome.resolvedAt))}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type EntryReviewSlots = {
  attentionAction?: ReactNode;
  attentionDetail?: string | null;
  nextActions: ReactNode;
  technicalDetails?: ReactNode;
};

/**
 * The order is the finding (UX-04).
 *
 * The audit measured this page against seven owner questions and found it
 * organised around the *interpretation object* instead: the model's paraphrase
 * was the `<h1>`, the owner's own words were collapsed behind a disclosure, the
 * objects the entry created existed only as a success message that disappeared,
 * and the people and projects it recognized were filed under "technical
 * details" beside model ids and trust scores.
 *
 * It now runs in the order the questions are asked:
 *
 * 1. **what did I write** — `OriginalRecord`, open, no click
 * 2. **what did it understand** — the heading and its facts
 * 3. **what still needs me** — attention, then the actions that resolve it
 * 4. **what now exists** — tasks, reminders, memories and recognized entities,
 *    each linked to where it can be inspected
 * 5. **what happened before** — previous decisions on this record
 * 6. **how it was decided** — model, scores and trust policy, behind the
 *    disclosure, which is what that disclosure is for
 *
 * The heading keeps the `<h1>` because a page needs one and the understanding
 * is what names this record in every list that points here; what changed is
 * that it is no longer the only thing above the fold.
 */
export function EntryReview({
  view,
  outcomes,
  locale,
  agentName,
  occurredAtLabel,
  slots,
}: {
  view: InterpretationReviewView;
  /** Omitted only by callers that have no database to read — the projection is required in the app. */
  outcomes?: EntryOutcomeView;
  locale: DailyCycleLocale;
  occurredAtLabel: string;
  agentName: string;
  slots: EntryReviewSlots;
}) {
  return (
    <div className="entry-review">
      <InterpretationReviewViewed entryId={view.entryId} locale={locale} />
      <ReviewUnderstanding view={view} locale={locale} agentName={agentName} occurredAtLabel={occurredAtLabel} />
      <OriginalRecord original={view.original} locale={locale} />
      <ReviewAttention items={view.attentionItems} locale={locale} detail={slots.attentionDetail}>
        {slots.attentionAction}
      </ReviewAttention>
      <ReviewNextActions locale={locale}>{slots.nextActions}</ReviewNextActions>
      {outcomes === undefined ? null : <EntryOutcomes outcomes={outcomes} locale={locale} />}
      <CandidateOutcomeHistory outcomes={view.candidateOutcomes} locale={locale} />
      {slots.technicalDetails}
    </div>
  );
}
