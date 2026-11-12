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
  /** Life Brain D.1 — the period label opens a date picker. */
  readonly datePicker: {
    readonly open: (period: string) => string;
    readonly label: string;
    readonly previousMonth: string;
    readonly nextMonth: string;
    /** Monday first, as every grid in the Agenda. */
    readonly weekdays: readonly string[];
    readonly outsideBound: string;
  };
};

const AGENDA_HEADER_COPY = {
  "pt-BR": {
    title: "Agenda",
    lensesLabel: "Lentes da agenda",
    lenses: { calendar: "Calendário", plan: "Planejar", reminders: "Lembretes" },
    stepperLabel: "Navegar pelas datas",
    datePicker: {
      open: (period) => `${period}. Escolher uma data`,
      label: "Escolher uma data",
      previousMonth: "Mês anterior",
      nextMonth: "Próximo mês",
      weekdays: ["S", "T", "Q", "Q", "S", "S", "D"],
      outsideBound: "fora do período que a agenda cobre",
    },
  },
  en: {
    title: "Agenda",
    lensesLabel: "Agenda lenses",
    lenses: { calendar: "Calendar", plan: "Plan", reminders: "Reminders" },
    stepperLabel: "Move through dates",
    datePicker: {
      open: (period) => `${period}. Choose a date`,
      label: "Choose a date",
      previousMonth: "Previous month",
      nextMonth: "Next month",
      weekdays: ["M", "T", "W", "T", "F", "S", "S"],
      outsideBound: "outside the range the agenda covers",
    },
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
