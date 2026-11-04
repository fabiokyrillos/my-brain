/**
 * Life Brain A.4 — the words of the Agenda's shared header.
 *
 * The bar has said "Agenda" since A.2 and the page under it said "Calendário",
 * with a layout chip also called "Agenda": three names for two things
 * (`INFORMATION_ARCHITECTURE.md` §2). The destination is **Agenda**; Calendário,
 * Planejar and Lembretes are its lenses; the list layout of the calendar reads
 * **Lista** — the orientation stays `agenda` in the URL, so no link moves and
 * `phase-2p-reminder-recurrence-guard`'s "Agenda is not Mês" still holds.
 */
import type { Locale } from "@/lib/preferences";

export type AgendaLens = "calendar" | "plan" | "reminders";

export type AgendaHeaderCopy = {
  readonly title: string;
  readonly lensesLabel: string;
  readonly lenses: Record<AgendaLens, string>;
  readonly stepperLabel: string;
};

const AGENDA_HEADER_COPY = {
  "pt-BR": {
    title: "Agenda",
    lensesLabel: "Lentes da agenda",
    lenses: { calendar: "Calendário", plan: "Planejar", reminders: "Lembretes" },
    stepperLabel: "Navegar pelas datas",
  },
  en: {
    title: "Agenda",
    lensesLabel: "Agenda lenses",
    lenses: { calendar: "Calendar", plan: "Plan", reminders: "Reminders" },
    stepperLabel: "Move through dates",
  },
} as const satisfies Record<Locale, AgendaHeaderCopy>;

export function getAgendaHeaderCopy(locale: Locale): AgendaHeaderCopy {
  return AGENDA_HEADER_COPY[locale];
}

/** The lenses' routes, unchanged: every bookmark and notification keeps working. */
export function agendaLensHref(locale: Locale, lens: AgendaLens): string {
  switch (lens) {
    case "calendar":
      return `/${locale}/app/calendar`;
    case "plan":
      return `/${locale}/app/calendar/plan`;
    case "reminders":
      return `/${locale}/app/reminders`;
  }
}
