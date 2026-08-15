import type { ReactNode } from "react";
import Link from "next/link";
import { InterpretationReviewViewed } from "@/features/product-analytics/interaction-events";
import { formatInstant } from "@/lib/time/instant-format";
import { AlertTriangle, Clock3, Quote, Sparkles } from "lucide-react";
import type { AttentionItemView, AttentionReason, CandidateOutcomeView, EntryOutcomeView, InterpretationReviewView, OriginalEntryView } from "./contracts";
import { getDailyCycleCopy, getEntryReviewSectionCopy, type DailyCycleLocale } from "./copy";

const errorShapedReasons: readonly AttentionReason[] = ["retry_processing", "resolve_consistency"];

/**
 * The record's own identity, at the top of the page.
 *
 * The `<h1>` is the record's **date and time**, which is what the architecture's
 * screen map names this page (`02-arquitetura-e-rotas.md`: *Detalhe do registro
 * · (data e hora do registro)*). It used to be the model's paraphrase, which put
 * the assistant's reading above the owner's own words in the reading order — the
 * one thing `03-componentes.md` says the InterpretationCard must never do.
 */
export function ReviewIdentity({
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
    <header className="record-detail-head">
      <div>
        <h1>{occurredAtLabel}</h1>
        <p className="record-detail-provenance">
          {pt ? "original preservado" : "original preserved"}
        </p>
      </div>
      <span className={`entry-status entry-status-${view.productState}`}>
        <Clock3 size={16} aria-hidden="true" />{statusCopy.label}
      </span>
    </header>
  );
}

/**
 * What the assistant understood — **below** the original, never above it.
 *
 * An `<h2>` since the Papel e Console recomposition: it is one section of the
 * record, not the record's name. `07-acessibilidade.md` fixes the focus order as
 * *original → interpretação → ações → painel de explicação → técnico*, and a
 * heading level that disagreed with that order would make the reading order and
 * the document outline tell two different stories.
 */
export function ReviewUnderstanding({
  view,
  locale,
  agentName,
}: {
  view: InterpretationReviewView;
  locale: DailyCycleLocale;
  agentName: string;
}) {
  const pt = locale === "pt-BR";
  const statusCopy = getDailyCycleCopy(locale, agentName).productStates[view.productState];

  return (
    <section className="review-understanding" aria-labelledby="review-understanding-title">
      <div className="section-heading">
        <Sparkles size={17} aria-hidden="true" />
        <div>
          <h2 id="review-understanding-title">{pt ? `O que o ${agentName} entendeu` : `What ${agentName} understood`}</h2>
          <p>{pt ? "Uma leitura do seu texto. Nada aqui substitui o original." : "A reading of your text. Nothing here replaces the original."}</p>
        </div>
      </div>
      <p className="review-understanding-body">{view.understanding}</p>
      {view.humanFields.length > 0 && (
        /*
          The labelled field grid (`03-componentes.md`, InterpretationCard). A
          `<dl>` rather than rows of `<span>`s so each label reaches a screen
          reader attached to its own value.
        */
        <dl className="review-facts">
          {view.humanFields.map((field) => (
            <div key={field.key}>
              <dt>{field.label}</dt>
              {/* "não identificado" rather than an empty cell: an empty value
                  reads as missing data, not as *the model found nothing*. */}
              <dd>{field.value ?? (pt ? "não identificado" : "not identified")}</dd>
            </div>
          ))}
        </dl>
      )}
      {view.productState === "organizing" && (
        <p className="review-organizing-note"><Sparkles size={14} aria-hidden="true" />{statusCopy.description}</p>
      )}
    </section>
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
  timeZone,
}: {
  outcomes: readonly CandidateOutcomeView[];
  locale: DailyCycleLocale;
  /** The owner's zone (`LDC-DAILY-001`). Required, never defaulted. */
  timeZone: string;
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
            <time dateTime={outcome.resolvedAt}>{formatInstant(outcome.resolvedAt, "dayAndTime", locale, timeZone)}</time>
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
 * 2. **what did it understand** — the reading and its labelled fields
 * 3. **what still needs me** — attention, then the actions that resolve it
 * 4. **what now exists** — tasks, reminders, memories and recognized entities,
 *    each linked to where it can be inspected
 * 5. **what happened before** — previous decisions on this record
 * 6. **how it was decided** — model, scores and trust policy, behind the
 *    disclosure, which is what that disclosure is for
 *
 * The Papel e Console recomposition splits that sequence into two columns —
 * 1–3 decide, 4–6 explain — and moves the `<h1>` off the model's paraphrase and
 * onto the record's own date and time. Both changes serve the same rule: the
 * assistant's reading may not come before the owner's words, in the layout or in
 * the document outline.
 */
export function EntryReview({
  view,
  outcomes,
  locale,
  agentName,
  occurredAtLabel,
  slots,
  timeZone,
}: {
  view: InterpretationReviewView;
  /** Omitted only by callers that have no database to read — the projection is required in the app. */
  outcomes?: EntryOutcomeView;
  locale: DailyCycleLocale;
  occurredAtLabel: string;
  agentName: string;
  slots: EntryReviewSlots;
  /**
   * The owner's zone (`LDC-DAILY-001`). Threaded rather than resolved here: the
   * entry-detail page already has it on `EntryReviewProjection`, so the review
   * and the page stamp the same instant from the same source.
   */
  timeZone: string;
}) {
  const pt = locale === "pt-BR";

  return (
    <div className="entry-review record-detail">
      <InterpretationReviewViewed entryId={view.entryId} locale={locale} />
      <ReviewIdentity view={view} locale={locale} agentName={agentName} occurredAtLabel={occurredAtLabel} />

      {/*
        Two columns: decide on the left, understand on the right (mockup 03,
        frame 04 — *uma coluna de decisão e uma coluna de explicação*). One DOM
        order serves both layouts, and it is the order `07-acessibilidade.md`
        fixes, so focus order equals visual order on a phone and on a desktop.
      */}
      <div className="record-detail-columns">
        <div className="record-decision">
          <OriginalRecord original={view.original} locale={locale} />
          <ReviewUnderstanding view={view} locale={locale} agentName={agentName} />
          <ReviewAttention items={view.attentionItems} locale={locale} detail={slots.attentionDetail}>
            {slots.attentionAction}
          </ReviewAttention>
          <ReviewNextActions locale={locale}>{slots.nextActions}</ReviewNextActions>
        </div>

        {/*
          The explanation column. `<aside>` is the landmark `07-acessibilidade.md`
          names for it, and everything in it is a reading of the record rather
          than a decision on it — which is exactly why it is not in the left
          column competing with the decision bar.
        */}
        <aside className="record-explanation" aria-label={pt ? "Como este registro foi lido" : "How this record was read"}>
          {outcomes === undefined ? null : <EntryOutcomes outcomes={outcomes} locale={locale} />}
          <CandidateOutcomeHistory outcomes={view.candidateOutcomes} locale={locale} timeZone={timeZone} />
          {/* Last, and collapsed: model ids, versions and policies are the
              answer to "how", asked after "what". */}
          {slots.technicalDetails}
        </aside>
      </div>
    </div>
  );
}
