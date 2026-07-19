import type { ReactNode } from "react";
import { InterpretationReviewViewed } from "@/features/product-analytics/interaction-events";
import { AlertTriangle, Clock3, Quote, Sparkles } from "lucide-react";
import type { AttentionItemView, AttentionReason, InterpretationReviewView, OriginalEntryView } from "./contracts";
import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";

const errorShapedReasons: readonly AttentionReason[] = ["retry_processing", "resolve_consistency"];

export function ReviewUnderstanding({
  view,
  locale,
  occurredAtLabel,
}: {
  view: InterpretationReviewView;
  locale: DailyCycleLocale;
  occurredAtLabel: string;
}) {
  const pt = locale === "pt-BR";
  const statusCopy = getDailyCycleCopy(locale).productStates[view.productState];

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

export function OriginalRecord({
  original,
  locale,
  defaultOpen = false,
}: {
  original: OriginalEntryView;
  locale: DailyCycleLocale;
  defaultOpen?: boolean;
}) {
  const pt = locale === "pt-BR";
  return (
    <details className="original-entry review-original" open={defaultOpen}>
      <summary><Quote size={17} aria-hidden="true" />{pt ? "Ver registro original" : "View original entry"}</summary>
      <p>{original.content}</p>
    </details>
  );
}

export type EntryReviewSlots = {
  attentionAction?: ReactNode;
  attentionDetail?: string | null;
  nextActions: ReactNode;
  technicalDetails?: ReactNode;
};

export function EntryReview({
  view,
  locale,
  occurredAtLabel,
  originalDefaultOpen = false,
  slots,
}: {
  view: InterpretationReviewView;
  locale: DailyCycleLocale;
  occurredAtLabel: string;
  originalDefaultOpen?: boolean;
  slots: EntryReviewSlots;
}) {
  return (
    <div className="entry-review">
      <InterpretationReviewViewed entryId={view.entryId} locale={locale} />
      <ReviewUnderstanding view={view} locale={locale} occurredAtLabel={occurredAtLabel} />
      <ReviewAttention items={view.attentionItems} locale={locale} detail={slots.attentionDetail}>
        {slots.attentionAction}
      </ReviewAttention>
      <ReviewNextActions locale={locale}>{slots.nextActions}</ReviewNextActions>
      <OriginalRecord original={view.original} locale={locale} defaultOpen={originalDefaultOpen} />
      {slots.technicalDetails}
    </div>
  );
}
