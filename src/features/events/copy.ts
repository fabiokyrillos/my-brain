/**
 * Life Brain C.3 (ADR-152) — the words of the event candidates on a record's
 * page. A typed record per locale, the `daily-cycle/copy.ts` shape.
 */
import type { Locale } from "@/lib/preferences";

export type EventCopy = {
  /** Names the list for a screen reader; the rows are the questions. */
  readonly heading: string;
  readonly decision: (title: string) => string;
  readonly question: (title: string) => string;
  /** Sets the suggestion aside for this visit. Nothing is written. */
  readonly notNow: string;
  readonly allDay: string;
  readonly until: (end: string) => string;
  readonly confirm: string;
  readonly confirming: string;
  readonly nothingSelected: string;
  readonly confirmed: (count: number) => string;
  readonly onAgendaHeading: string;
  readonly onAgenda: (title: string) => string;
  readonly cancelShort: string;
  readonly cancel: (title: string) => string;
  readonly cancelled: string;
  readonly undo: string;
  readonly undoing: string;
  readonly undone: string;
  readonly failed: string;
  readonly stale: string;
  readonly unauthenticated: string;
};

const EVENT_COPY = {
  "pt-BR": {
    heading: "Eventos sugeridos",
    decision: (title) => `Evento sugerido: ${title}`,
    question: (title) => `Pôr “${title}” na agenda?`,
    notNow: "Agora não",
    allDay: "dia todo",
    until: (end) => `até ${end}`,
    confirm: "Pôr na agenda",
    confirming: "Pondo na agenda…",
    nothingSelected: "Escolha pelo menos um evento.",
    confirmed: (count) => (count === 1 ? "1 evento na agenda." : `${count} eventos na agenda.`),
    onAgendaHeading: "Na agenda",
    onAgenda: (title) => `“${title}” está na agenda.`,
    cancelShort: "Cancelar",
    cancel: (title) => `Cancelar ${title}`,
    cancelled: "Evento cancelado.",
    undo: "Desfazer",
    undoing: "Desfazendo…",
    undone: "Eventos tirados da agenda.",
    failed: "Não foi possível salvar agora.",
    stale: "A leitura deste registro mudou. Atualize a página.",
    unauthenticated: "Sua sessão expirou. Entre novamente.",
  },
  en: {
    heading: "Suggested events",
    decision: (title) => `Suggested event: ${title}`,
    question: (title) => `Put “${title}” on the agenda?`,
    notNow: "Not now",
    allDay: "all day",
    until: (end) => `until ${end}`,
    confirm: "Put on the agenda",
    confirming: "Putting on the agenda…",
    nothingSelected: "Choose at least one event.",
    confirmed: (count) => (count === 1 ? "1 event on the agenda." : `${count} events on the agenda.`),
    onAgendaHeading: "On the agenda",
    onAgenda: (title) => `“${title}” is on the agenda.`,
    cancelShort: "Cancel",
    cancel: (title) => `Cancel ${title}`,
    cancelled: "Event cancelled.",
    undo: "Undo",
    undoing: "Undoing…",
    undone: "Events taken off the agenda.",
    failed: "This could not be saved right now.",
    stale: "This record's reading changed. Refresh the page.",
    unauthenticated: "Your session expired. Sign in again.",
  },
} as const satisfies Record<Locale, EventCopy>;

export function getEventCopy(locale: Locale): EventCopy {
  return EVENT_COPY[locale];
}
