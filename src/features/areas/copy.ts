import type { Locale } from "@/lib/preferences";

/** Life Brain C.4 — an area of life's page. Typed, both locales, no ternary. */
export type AreaCopy = {
  readonly eventsHeading: string;
  readonly eventsEmpty: string;
  readonly eventsFailed: string;
  readonly allDay: string;
  readonly until: (end: string) => string;
  /** `LB-C-010` — the records that fall inside an event's period. */
  readonly inPeriod: (count: number) => string;
  readonly timelineHeading: string;
  readonly timelineCount: (count: number) => string;
  readonly timelineEmpty: string;
  readonly timelineFailed: string;
  readonly timelineMore: string;
  readonly pendingHeading: string;
  readonly pendingEmpty: string;
  readonly pendingFailed: string;
  readonly peopleHeading: string;
  readonly peopleEmpty: string;
  readonly peopleFailed: string;
  readonly openRecord: string;
};

const copy: Record<Locale, AreaCopy> = {
  "pt-BR": {
    eventsHeading: "Próximos eventos",
    eventsEmpty: "Nenhum evento marcado nesta área.",
    eventsFailed: "Não foi possível ler os eventos agora. Isso não quer dizer que não existam.",
    allDay: "dia todo",
    until: (end) => `até ${end}`,
    inPeriod: (count) => (count === 1 ? "1 registro neste período" : `${count} registros neste período`),
    timelineHeading: "Linha do tempo",
    timelineCount: (count) => (count === 1 ? "1 registro" : `${count} registros`),
    timelineEmpty: "Nada registrado nesta área ainda. Quando você contar algo sobre ela, aparece aqui.",
    timelineFailed: "Não foi possível ler os registros agora. Isso não quer dizer que não existam.",
    timelineMore: "Há registros mais antigos do que os mostrados aqui.",
    pendingHeading: "Pendências",
    pendingEmpty: "Nada pendente nesta área.",
    pendingFailed: "Não foi possível ler as pendências agora.",
    peopleHeading: "Pessoas",
    peopleEmpty: "Ninguém ligado a esta área ainda.",
    peopleFailed: "Não foi possível ler as pessoas agora.",
    openRecord: "Abrir registro",
  },
  en: {
    eventsHeading: "Upcoming events",
    eventsEmpty: "No event scheduled in this area.",
    eventsFailed: "Could not read the events right now. That does not mean there are none.",
    allDay: "all day",
    until: (end) => `until ${end}`,
    inPeriod: (count) => (count === 1 ? "1 record in this period" : `${count} records in this period`),
    timelineHeading: "Timeline",
    timelineCount: (count) => (count === 1 ? "1 record" : `${count} records`),
    timelineEmpty: "Nothing recorded in this area yet. When you tell Brain about it, it shows up here.",
    timelineFailed: "Could not read the records right now. That does not mean there are none.",
    timelineMore: "There are older records than the ones shown here.",
    pendingHeading: "Open items",
    pendingEmpty: "Nothing open in this area.",
    pendingFailed: "Could not read the open items right now.",
    peopleHeading: "People",
    peopleEmpty: "No one linked to this area yet.",
    peopleFailed: "Could not read the people right now.",
    openRecord: "Open record",
  },
};

export function getAreaCopy(locale: Locale): AreaCopy {
  return copy[locale];
}
