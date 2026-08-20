import type { Locale } from "@/lib/preferences";

import { tabForPeriodType, type ReviewPeriodType, type ReviewTab } from "./review-periods";

/**
 * What a stored review looks like on a listing, **without its words**.
 *
 * ## Why content is not an optional field on one view
 *
 * The history list renders type, period, state and a link, and nothing else:
 * under OD-2J-1 every summary is masked, so a preview would be exactly the
 * *"conteúdo mascarado exposto por meio de prévias"* the owner's own instruction
 * forbids.
 *
 * A single view with an optional `content` would have made that a matter of the
 * list remembering not to render a field it was holding — and it would still
 * have shipped the prose to the browser inside the RSC payload of a page that
 * never shows it. Two views make the guarantee structural: the list cannot
 * render content because the list never receives content.
 */
export type ReviewSummaryView = Readonly<{
  id: string;
  title: string;
  periodType: ReviewPeriodType;
  /** Which of Dia/Semana/Mês this review files under. */
  tab: ReviewTab;
  periodLabel: string;
  statusLabel: string;
  statusTone: "positive" | "neutral" | "warning";
  periodLabelRange: string;
  /** `YYYY-MM-DD`, as stored — the period this review is *about*. */
  periodStart: string;
  /** `YYYY-MM-DD`, as stored — the day it was *written*, not the period's last day. */
  periodEnd: string;
}>;

/** The same review, with the words. Reached only from its own page. */
export type ReviewDetailView = ReviewSummaryView & Readonly<{ content: string }>;

export type ReviewSourceRow = Readonly<{
  id: unknown;
  title: unknown;
  period_type: unknown;
  period_start: unknown;
  period_end: unknown;
  status: unknown;
}>;

export type ReviewDetailSourceRow = ReviewSourceRow & Readonly<{ content: unknown }>;

const periodCopy = {
  "pt-BR": {
    daily: "Resumo do dia",
    weekly_review: "Revisão da semana",
    weekly_plan: "Planejamento da semana",
    monthly: "Revisão do mês",
  },
  en: {
    daily: "Daily summary",
    weekly_review: "Weekly review",
    weekly_plan: "Weekly plan",
    monthly: "Monthly review",
  },
} as const;

const statusCopy = {
  "pt-BR": {
    generated: { label: "Concluída", tone: "positive" },
    edited: { label: "Editada", tone: "neutral" },
    outdated: { label: "Pode estar desatualizada", tone: "warning" },
  },
  en: {
    generated: { label: "Completed", tone: "positive" },
    edited: { label: "Edited", tone: "neutral" },
    outdated: { label: "May be outdated", tone: "warning" },
  },
} as const;

function dateOnly(value: unknown, locale: Locale) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function toReviewSummaryView(row: ReviewSourceRow, locale: Locale): ReviewSummaryView | null {
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  if (typeof row.period_type !== "string" || !(row.period_type in periodCopy[locale])) return null;
  if (typeof row.status !== "string" || !(row.status in statusCopy[locale])) return null;
  const tab = tabForPeriodType(row.period_type);
  // Unreachable while the vocabulary above and the tab table agree, and checked
  // anyway: a fifth `period_type` would otherwise produce a review filed under no
  // tab, which is a row the owner can never reach from the surface it lives on.
  if (!tab) return null;
  const start = dateOnly(row.period_start, locale);
  const end = dateOnly(row.period_end, locale);
  if (!start || !end) return null;

  return Object.freeze({
    id: row.id,
    title: row.title,
    periodType: row.period_type as ReviewPeriodType,
    tab,
    periodLabel: periodCopy[locale][row.period_type as keyof (typeof periodCopy)[Locale]],
    statusLabel: statusCopy[locale][row.status as keyof (typeof statusCopy)[Locale]].label,
    statusTone: statusCopy[locale][row.status as keyof (typeof statusCopy)[Locale]].tone,
    periodLabelRange: `${start} — ${end}`,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
  });
}

export function toReviewDetailView(
  row: ReviewDetailSourceRow,
  locale: Locale,
): ReviewDetailView | null {
  if (typeof row.content !== "string") return null;
  const summary = toReviewSummaryView(row, locale);
  return summary ? Object.freeze({ ...summary, content: row.content }) : null;
}
