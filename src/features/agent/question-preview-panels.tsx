"use client";

import { TrackedQuestionPreview } from "@/features/product-analytics/interaction-events";
import type { QuestionEffectPreview, QuestionSourceView } from "./question-preview-projection";

// Phase 2D Slice 2D.3 — read-only source and predicted-effect disclosures.
//
// Both panels are pure presentation over bounded server DTOs. Opening or
// closing one performs no domain write, no enqueue, no status change, and no
// resolution; the only side effect is a fail-open, property-free analytics
// observation. Every projected string (question, reason, entry excerpt,
// interpretation summary) is untrusted owner content and is rendered through
// normal React text escaping — never as markup and never as an instruction.

const copy = {
  "pt-BR": {
    sourceSummary: "Por que esta pergunta existe",
    reasonLabel: "Motivo",
    entryLabel: "Registro de origem",
    entryRecordedLabel: "Registrado em",
    entryOccurredLabel: "Aconteceu em",
    interpretationLabel: "Interpretação",
    interpretationValue: (version: number, date: string) => `Versão ${version} · ${date}`,
    candidateLabel: "Item da interpretação",
    candidateValue: (index: number) => `#${index + 1}`,
    currentLabel: "Interpretação atual",
    supersededLabel: "Interpretação substituída",
    truncated: "Trecho abreviado do registro original.",
    readOnly: "Somente leitura. Abrir este painel não altera nada.",
    effectSummary: "O que mudaria se você responder",
  },
  en: {
    sourceSummary: "Why this question exists",
    reasonLabel: "Reason",
    entryLabel: "Source record",
    entryRecordedLabel: "Recorded at",
    entryOccurredLabel: "Happened at",
    interpretationLabel: "Interpretation",
    interpretationValue: (version: number, date: string) => `Version ${version} · ${date}`,
    candidateLabel: "Interpretation item",
    candidateValue: (index: number) => `#${index + 1}`,
    currentLabel: "Current interpretation",
    supersededLabel: "Superseded interpretation",
    truncated: "Shortened excerpt of the original record.",
    readOnly: "Read-only. Opening this panel changes nothing.",
    effectSummary: "What would change if you answer",
  },
} as const;

function formatInstant(value: string, locale: "pt-BR" | "en", timezone: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: timezone,
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(instant);
  }
}

export function QuestionPreviewPanels({ locale, timezone, source, effect }: {
  locale: "pt-BR" | "en";
  timezone: string;
  source: QuestionSourceView;
  effect: QuestionEffectPreview;
}) {
  const labels = copy[locale];

  return (
    <div className="question-previews">
      <TrackedQuestionPreview
        questionId={source.questionId}
        locale={locale}
        className="question-preview"
      >
        <summary>{labels.sourceSummary}</summary>
        <div className="question-preview-body">
          <p className="question-preview-note">{labels.readOnly}</p>
          <dl>
            <div>
              <dt>{labels.reasonLabel}</dt>
              <dd>{source.reason}</dd>
            </div>
            <div>
              <dt>{labels.entryLabel}</dt>
              <dd>
                {source.entryExcerpt}
                {source.entryExcerptTruncated ? <small>{labels.truncated}</small> : null}
              </dd>
            </div>
            <div>
              <dt>{labels.entryRecordedLabel}</dt>
              <dd>{formatInstant(source.entryCreatedAt, locale, timezone)}</dd>
            </div>
            <div>
              <dt>{labels.entryOccurredLabel}</dt>
              <dd>{formatInstant(source.entryOccurredAt, locale, timezone)}</dd>
            </div>
            <div>
              <dt>{labels.interpretationLabel}</dt>
              <dd>
                {labels.interpretationValue(
                  source.interpretationVersion,
                  formatInstant(source.interpretationCreatedAt, locale, timezone),
                )}
                <small>{source.interpretationSummary}</small>
              </dd>
            </div>
            <div>
              <dt>{labels.candidateLabel}</dt>
              <dd>{labels.candidateValue(source.candidateIndex)}</dd>
            </div>
          </dl>
          <p className="question-preview-state" data-current={source.isCurrent}>
            {source.isCurrent ? labels.currentLabel : labels.supersededLabel}
          </p>
        </div>
      </TrackedQuestionPreview>

      <TrackedQuestionPreview
        questionId={source.questionId}
        locale={locale}
        className="question-preview"
      >
        <summary>{labels.effectSummary}</summary>
        <div className="question-preview-body" data-effect={effect.kind}>
          <p className="question-preview-note">{labels.readOnly}</p>
          <strong>{effect.title}</strong>
          <p>{effect.description}</p>
          <p className="question-preview-notice">{effect.notice}</p>
        </div>
      </TrackedQuestionPreview>
    </div>
  );
}
