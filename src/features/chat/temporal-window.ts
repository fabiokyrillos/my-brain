/**
 * Life Brain B.3 (`LB-B-007`, ADR-150) — which stretch of time a question is
 * about, and whether it asks for the most recent thing.
 *
 * Deterministic and declared, like `agenda-intent.ts`: the rule is data in this
 * module, never a heuristic inside a prompt. Two steps, both pure:
 *
 * 1. `readTemporalQuestion(question)` reads the words — no clock, no zone — and
 *    returns a *relative* span ("last week", "in March") and a recency flag.
 * 2. `temporalWindowFor(span, today, timeZone)` turns the span into the two
 *    instants `match_internal_knowledge` filters on (`p_since` inclusive,
 *    `p_until` exclusive), with the owner's local days and months, so a week
 *    with a clock change is still exactly that week.
 *
 * ## The error costs, and why every doubt returns no span
 *
 * A span **narrows** retrieval: a wrong one hides the right rows and the answer
 * says "não encontrei" about something the owner did write. No span costs only
 * what the turn cost before this slice — retrieval by meaning across every
 * date. So two spans in one sentence, a month name used as a noun ("a viagem de
 * março" is still March, but "Março" as a person's name is not something this
 * module can tell apart, and it does not try beyond the preposition), or
 * anything it cannot place, returns no span.
 *
 * Recency ("última vez", "recentemente", "quando foi") never narrows: it
 * re-orders what was retrieved by `occurred_at`, newest first, which cannot
 * hide a row.
 *
 * Locale-free, for the reason `memory-intent.ts` gives: a bilingual owner types
 * in whichever language the thought arrived in.
 */

import { normalize } from "@/features/assistant/memory-intent";
import {
  addLocalDays,
  addLocalMonths,
  daysInLocalMonth,
  localDayBoundsForDate,
  localRangeBounds,
  startOfLocalMonth,
  startOfLocalWeek,
  type LocalDate,
} from "@/lib/time/local-day";

export type TemporalSpan =
  | { readonly kind: "day"; readonly offset: 0 | -1 | -2 }
  | { readonly kind: "week"; readonly offset: 0 | -1 }
  | { readonly kind: "month"; readonly offset: 0 | -1 }
  | { readonly kind: "year"; readonly offset: 0 | -1 }
  | { readonly kind: "named_month"; readonly month: number; readonly year: number | null }
  | { readonly kind: "year_number"; readonly year: number }
  | { readonly kind: "last_days"; readonly days: number };

export type TemporalQuestion = {
  readonly span: TemporalSpan | null;
  readonly recency: boolean;
};

export type TemporalWindow = {
  /** Inclusive, ISO-8601. */
  readonly since: string;
  /** Exclusive, ISO-8601. */
  readonly until: string;
};

/** Longer than any question with one period in it; past this, no span is read. */
export const MAX_TEMPORAL_QUESTION_LENGTH = 240;

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_WORD = Object.keys(MONTHS).join("|");

/** Each rule reads one kind of span. Order does not matter: two matches is doubt. */
const RULES: readonly { readonly pattern: RegExp; readonly read: (match: RegExpMatchArray) => TemporalSpan | null }[] = [
  { pattern: /\b(hoje|today)\b/u, read: () => ({ kind: "day", offset: 0 }) },
  { pattern: /\b(anteontem|day before yesterday)\b/u, read: () => ({ kind: "day", offset: -2 }) },
  { pattern: /\b(?<!before )(ontem|yesterday)\b/u, read: () => ({ kind: "day", offset: -1 }) },
  { pattern: /\b[nd]?(esta|essa) semana\b|\bthis week\b/u, read: () => ({ kind: "week", offset: 0 }) },
  { pattern: /\bsemana passada\b|\b(last|previous) week\b/u, read: () => ({ kind: "week", offset: -1 }) },
  { pattern: /\b[nd]?(este|esse) mes\b|\bthis month\b/u, read: () => ({ kind: "month", offset: 0 }) },
  { pattern: /\bmes passado\b|\b(last|previous) month\b/u, read: () => ({ kind: "month", offset: -1 }) },
  { pattern: /\b[nd]?(este|esse) ano\b|\bthis year\b/u, read: () => ({ kind: "year", offset: 0 }) },
  { pattern: /\bano passado\b|\b(last|previous) year\b/u, read: () => ({ kind: "year", offset: -1 }) },
  {
    // "em março", "no mês de março", "in March", "março de 2025", "March 2025".
    pattern: new RegExp(`\\b(?:em|no mes de|de|in|during|since|desde)\\s+(${MONTH_WORD})(?:\\s+(?:de\\s+)?((?:19|20)\\d{2}))?\\b|\\b(${MONTH_WORD})\\s+(?:de\\s+)?((?:19|20)\\d{2})\\b`, "u"),
    read: (match) => {
      const word = match[1] ?? match[3];
      const year = match[2] ?? match[4];
      const month = word ? MONTHS[word] : undefined;
      return month === undefined ? null : { kind: "named_month", month, year: year ? Number(year) : null };
    },
  },
  {
    pattern: /\b(?:em|no ano de|in|during)\s+((?:19|20)\d{2})\b/u,
    read: (match) => ({ kind: "year_number", year: Number(match[1]) }),
  },
  {
    // "nos últimos 10 dias", "últimas 2 semanas", "in the last 3 weeks", "past 30 days".
    pattern: /\b(?:ultim[oa]s|last|past)\s+(\d{1,3})\s+(dias|days|semanas|weeks)\b/u,
    read: (match) => {
      const count = Number(match[1]);
      const days = /^(semanas|weeks)$/u.test(match[2] ?? "") ? count * 7 : count;
      return days >= 1 && days <= 366 ? { kind: "last_days", days } : null;
    },
  },
];

const RECENCY =
  /\b(ultima vez|ultimas vezes|mais recente|recentemente|ultimamente|quando foi|quando (eu )?(fui|fiz|falei|tive|vi|comprei|paguei|marquei)|last time|most recent|recently|lately|when did i|when was)\b/u;

/** Reads the words. No clock, no zone. */
export function readTemporalQuestion(question: string): TemporalQuestion {
  const text = normalize(question);
  if (text.length === 0 || text.length > MAX_TEMPORAL_QUESTION_LENGTH) {
    return { span: null, recency: false };
  }
  const recency = RECENCY.test(text);

  const spans: TemporalSpan[] = [];
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const span = rule.read(match);
    if (span) spans.push(span);
  }
  // Two spans are doubt — except "em março, em 2025", where the bare year only
  // repeats the year the named month already carries.
  const distinct = spans.filter((span, index) => !(
    span.kind === "year_number"
    && spans.some((other, at) => at !== index && other.kind === "named_month" && other.year === span.year)
  ));
  return { span: distinct.length === 1 ? distinct[0] : null, recency };
}

/** The window a span names, in the owner's local days. `today` is the owner's. */
export function temporalWindowFor(span: TemporalSpan, today: LocalDate, timeZone: string): TemporalWindow {
  const range = (first: LocalDate, dayCount: number) => {
    const bounds = localRangeBounds(first, dayCount, timeZone);
    return { since: new Date(bounds.start).toISOString(), until: new Date(bounds.end).toISOString() };
  };
  const monthOf = (first: LocalDate) => range(first, daysInLocalMonth(first));
  const yearOf = (year: number) => {
    const first = { year, month: 1, day: 1 };
    const next = { year: year + 1, month: 1, day: 1 };
    return {
      since: new Date(localDayBoundsForDate(first, timeZone).start).toISOString(),
      until: new Date(localDayBoundsForDate(next, timeZone).start).toISOString(),
    };
  };

  switch (span.kind) {
    case "day":
      return range(addLocalDays(today, span.offset), 1);
    case "week":
      return range(addLocalDays(startOfLocalWeek(today), 7 * span.offset), 7);
    case "month":
      return monthOf(startOfLocalMonth(addLocalMonths(today, span.offset)));
    case "year":
      return yearOf(today.year + span.offset);
    case "named_month": {
      // Without a year, the most recent March that has begun: in November,
      // "em março" is this year's; in February, last year's.
      const year = span.year ?? (span.month <= today.month ? today.year : today.year - 1);
      return monthOf({ year, month: span.month, day: 1 });
    }
    case "year_number":
      return yearOf(span.year);
    case "last_days":
      return range(addLocalDays(today, -(span.days - 1)), span.days);
  }
}

/**
 * Newest first, for a question that asks for the most recent thing.
 *
 * Stable for rows with the same instant, and a row without a readable instant
 * keeps its place at the end rather than jumping ahead of dated ones.
 */
export function byRecency<T extends { readonly occurredAt: string | null }>(sources: readonly T[]): T[] {
  const at = (value: string | null) => {
    const time = value === null ? Number.NaN : new Date(value).getTime();
    return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
  };
  return sources
    .map((source, index) => ({ source, index }))
    .sort((left, right) => at(right.source.occurredAt) - at(left.source.occurredAt) || left.index - right.index)
    .map((entry) => entry.source);
}
