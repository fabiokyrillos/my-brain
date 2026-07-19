import type { Locale } from "@/lib/preferences";

export type ReviewListItemView = Readonly<{
  id: string;
  title: string;
  content: string;
  periodLabel: string;
  statusLabel: string;
  statusTone: "positive" | "neutral" | "warning";
  periodLabelRange: string;
}>;

export type ReviewSourceRow = Readonly<{
  id: unknown;
  title: unknown;
  content: unknown;
  period_type: unknown;
  period_start: unknown;
  period_end: unknown;
  status: unknown;
}>;

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

export function toReviewListItemView(row: ReviewSourceRow, locale: Locale): ReviewListItemView | null {
  if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.content !== "string") return null;
  if (typeof row.period_type !== "string" || !(row.period_type in periodCopy[locale])) return null;
  if (typeof row.status !== "string" || !(row.status in statusCopy[locale])) return null;
  const start = dateOnly(row.period_start, locale);
  const end = dateOnly(row.period_end, locale);
  if (!start || !end) return null;
  const period = periodCopy[locale][row.period_type as keyof (typeof periodCopy)[Locale]];
  const status = statusCopy[locale][row.status as keyof (typeof statusCopy)[Locale]];

  return Object.freeze({
    id: row.id,
    title: row.title,
    content: row.content,
    periodLabel: period,
    statusLabel: status.label,
    statusTone: status.tone,
    periodLabelRange: `${start} — ${end}`,
  });
}
