/**
 * Life Brain B.1 — the deterministic agenda answer's copy, both locales.
 *
 * The canonical mechanism (ADR-036, the `daily-cycle/copy.ts` shape):
 * `satisfies Record<Locale, AgendaCopy>` makes a missing key or a missing locale
 * a compile error. Every sentence the answer can contain is here, so
 * `agenda-answer.ts` composes and never phrases.
 *
 * No sentence carries a number it was not handed: the counts are the
 * projection's own (`itemCount`, `2M-PRIVACY-006`, masked rows included), so the
 * answer can never say a day holds fewer things than the Agenda shows.
 */

import type { CalendarLane } from "@/features/calendar/calendar-query";
import type { Locale } from "@/lib/preferences";

/** The two ways a period is said: opening a sentence, and closing one. */
export type AgendaPeriodPhrase = { readonly lead: string; readonly after: string };

/** The lanes an agenda answer reads (`agendaQueryFor`). */
export type AgendaLane = Extract<CalendarLane, "deadline" | "intention" | "reminder">;

export type AgendaCopy = {
  readonly periods: {
    readonly day: readonly [AgendaPeriodPhrase, AgendaPeriodPhrase, AgendaPeriodPhrase];
    readonly week: readonly [AgendaPeriodPhrase, AgendaPeriodPhrase];
    readonly month: readonly [AgendaPeriodPhrase, AgendaPeriodPhrase];
    /** `date` is already formatted ("12 de novembro" / "November 12"). */
    readonly dayOfMonth: (date: string) => AgendaPeriodPhrase;
  };
  readonly found: (lead: string, count: number) => string;
  readonly empty: (after: string) => string;
  /** One item's kind, after its title. */
  readonly lanes: Record<AgendaLane, string>;
  /** What a lane is called when it could not be read. */
  readonly laneNames: Record<AgendaLane, string>;
  readonly joinLanes: (names: readonly string[]) => string;
  readonly partial: (lanes: string) => string;
  /** The title of a highly sensitive item, withheld in position (`calendar` rule). */
  readonly maskedItem: string;
  readonly maskedNote: string;
  readonly overflow: (more: number) => string;
};

function joinWith(conjunction: string) {
  return (names: readonly string[]) =>
    names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} ${conjunction} ${names[names.length - 1]}`;
}

const AGENDA_COPY = {
  "pt-BR": {
    periods: {
      day: [
        { lead: "Hoje", after: "hoje" },
        { lead: "Amanhã", after: "amanhã" },
        { lead: "Depois de amanhã", after: "depois de amanhã" },
      ],
      week: [
        { lead: "Esta semana", after: "esta semana" },
        { lead: "Na próxima semana", after: "na próxima semana" },
      ],
      month: [
        { lead: "Este mês", after: "este mês" },
        { lead: "No próximo mês", after: "no próximo mês" },
      ],
      dayOfMonth: (date) => ({ lead: `No dia ${date}`, after: `no dia ${date}` }),
    },
    found: (lead, count) => `${lead}, você tem ${count} ${count === 1 ? "item" : "itens"} na agenda:`,
    empty: (after) => `Não encontrei nada na sua agenda ${after}.`,
    lanes: { deadline: "prazo", intention: "planejado", reminder: "lembrete" },
    laneNames: { deadline: "os prazos", intention: "as tarefas planejadas", reminder: "os lembretes" },
    joinLanes: joinWith("e"),
    partial: (lanes) => `Não consegui ler ${lanes} agora, então pode haver mais.`,
    maskedItem: "item protegido",
    maskedNote: "Itens protegidos ficam ocultos aqui; a Agenda mostra cada um.",
    overflow: (more) => `…e mais ${more}. A Agenda mostra tudo.`,
  },
  en: {
    periods: {
      day: [
        { lead: "Today", after: "today" },
        { lead: "Tomorrow", after: "tomorrow" },
        { lead: "The day after tomorrow", after: "the day after tomorrow" },
      ],
      week: [
        { lead: "This week", after: "this week" },
        { lead: "Next week", after: "next week" },
      ],
      month: [
        { lead: "This month", after: "this month" },
        { lead: "Next month", after: "next month" },
      ],
      dayOfMonth: (date) => ({ lead: `On ${date}`, after: `on ${date}` }),
    },
    found: (lead, count) => `${lead}, you have ${count} ${count === 1 ? "item" : "items"} on your agenda:`,
    empty: (after) => `I found nothing on your agenda ${after}.`,
    lanes: { deadline: "deadline", intention: "planned", reminder: "reminder" },
    laneNames: { deadline: "the deadlines", intention: "the planned tasks", reminder: "the reminders" },
    joinLanes: joinWith("and"),
    partial: (lanes) => `I could not read ${lanes} right now, so there may be more.`,
    maskedItem: "protected item",
    maskedNote: "Protected items stay hidden here; the Agenda shows each one.",
    overflow: (more) => `…and ${more} more. The Agenda shows everything.`,
  },
} satisfies Record<Locale, AgendaCopy>;

export function getAgendaCopy(locale: Locale): AgendaCopy {
  return AGENDA_COPY[locale];
}
