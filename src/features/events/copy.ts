/**
 * Life Brain C.3 (ADR-152) — the words of the event candidates on a record's
 * page. A typed record per locale, the `daily-cycle/copy.ts` shape.
 */
import type { Locale } from "@/lib/preferences";

export type EventCopy = {
  readonly heading: string;
  readonly lead: string;
  readonly allDay: string;
  readonly until: (end: string) => string;
  readonly confirm: string;
  readonly confirming: string;
  readonly nothingSelected: string;
  readonly confirmed: (count: number) => string;
  readonly onAgendaHeading: string;
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
    heading: "Pôr na agenda?",
    lead: "O Brain encontrou isto com data. Nada entra na agenda sem a sua confirmação.",
    allDay: "dia todo",
    until: (end) => `até ${end}`,
    confirm: "Pôr na agenda",
    confirming: "Pondo na agenda…",
    nothingSelected: "Escolha pelo menos um evento.",
    confirmed: (count) => (count === 1 ? "1 evento na agenda." : `${count} eventos na agenda.`),
    onAgendaHeading: "Na agenda",
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
    heading: "Put on the agenda?",
    lead: "Brain found these with a date. Nothing goes on the agenda until you confirm.",
    allDay: "all day",
    until: (end) => `until ${end}`,
    confirm: "Put on the agenda",
    confirming: "Putting on the agenda…",
    nothingSelected: "Choose at least one event.",
    confirmed: (count) => (count === 1 ? "1 event on the agenda." : `${count} events on the agenda.`),
    onAgendaHeading: "On the agenda",
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
