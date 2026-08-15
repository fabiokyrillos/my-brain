/**
 * The calendar's copy, typed (ADR-036, PRD §5.3).
 *
 * A typed record keyed by the vocabularies the feature owns, so a sixth lane or
 * a fourth orientation cannot be added without the type demanding a word for it
 * in both languages. No engineering vocabulary reaches the user: they read
 * "Prazos", never `deadline`, and "Intenção", never `planned_at`.
 *
 * ## Why the lane names read the way they do
 *
 * The hardest word here is `intention`. OD-2M-3 A says `planned_at` is *"the
 * intention to work on something that day"* and explicitly **not** a commitment,
 * so the copy has to carry that distinction on a grid where everything looks
 * like a commitment. "Pretendo trabalhar nisso" says it plainly; "Agendado"
 * would say the opposite, and it is the word a calendar invites.
 */

import type { Locale } from "@/lib/preferences";

import type { CalendarCommitment, CalendarLane, CalendarOrientation } from "./calendar-query";

export type CalendarCopy = {
  readonly title: string;
  readonly description: string;
  readonly orientation: {
    readonly label: string;
    readonly options: Record<CalendarOrientation, string>;
  };
  readonly lanes: {
    readonly label: string;
    readonly names: Record<CalendarLane, string>;
    readonly descriptions: Record<CalendarLane, string>;
    /**
     * The lane's on/off state, as a word inside the link's accessible name.
     *
     * The chip used `aria-pressed`, which is invalid on a link and which axe
     * flagged on the live page. A visually hidden word needs no ARIA at all and
     * says the same thing to a screen reader.
     */
    readonly stateShown: string;
    readonly stateHidden: string;
  };
  readonly commitment: Record<CalendarCommitment, string>;
  readonly navigation: {
    readonly previous: string;
    readonly next: string;
    readonly today: string;
    readonly atEarliest: string;
    readonly atLatest: string;
    /**
     * The only unconditional way into Lembretes.
     *
     * Named as a destination rather than as a filter, because it leaves the
     * calendar rather than narrowing it — a control band word that behaved
     * differently from every other word in the band would be the band lying
     * about what it is.
     */
    readonly allReminders: string;
  };
  readonly states: {
    readonly empty: string;
    readonly emptyNarrowed: string;
    readonly loading: string;
    readonly error: string;
    readonly partial: (lanes: string) => string;
    readonly offline: string;
  };
  readonly item: {
    readonly elapsed: string;
    readonly open: (label: string) => string;
    readonly at: (time: string) => string;
  };
  /**
   * `2M-CAL-009`/`-010` — rescheduling in place.
   *
   * The disclosure's label names **what it opens**, not what it does: "Reagendar"
   * on a closed `<details>` would promise a single action and open three. The
   * unavailable sentence exists because a task whose status admits no scheduling
   * verb must say so rather than render nothing, which reads as a loading state
   * — `2M-CAL-011`'s empty-versus-failed distinction, one control down.
   */
  readonly reschedule: {
    readonly summary: string;
    readonly hint: string;
    readonly unavailable: string;
  };
  readonly summary: (count: number) => string;
  readonly todayLabel: string;
};

const PT_BR: CalendarCopy = {
  title: "Calendário",
  description: "O que os seus dias contêm, reunido a partir do que você já registrou.",
  orientation: {
    label: "Formato",
    options: { day: "Dia", week: "Semana", agenda: "Agenda" },
  },
  lanes: {
    label: "O que mostrar",
    stateShown: ", mostrando",
    stateHidden: ", oculto",
    names: {
      deadline: "Prazos",
      intention: "Intenções",
      reminder: "Lembretes",
      review: "Revisões",
      suggestion: "Datas sugeridas",
    },
    descriptions: {
      deadline: "Tarefas com data-limite.",
      intention: "Tarefas que você pretende fazer nesse dia.",
      reminder: "Lembretes marcados para um horário.",
      review: "Períodos que você já revisou.",
      suggestion: "Datas que o Brain identificou e você ainda não confirmou.",
    },
  },
  commitment: {
    committed: "Compromisso",
    intended: "Intenção",
    suggested: "Sugestão",
    recorded: "Registro",
  },
  navigation: {
    previous: "Período anterior",
    next: "Próximo período",
    today: "Hoje",
    atEarliest: "Este é o começo do período que o calendário cobre.",
    atLatest: "Este é o fim do período que o calendário cobre.",
    allReminders: "Todos os lembretes",
  },
  states: {
    empty: "Nada marcado para este período.",
    emptyNarrowed: "Nada marcado para este período com os filtros atuais.",
    loading: "Carregando o período…",
    error: "Não foi possível carregar este período.",
    partial: (lanes) => `Não foi possível carregar: ${lanes}. O restante está aqui.`,
    offline: "Você está sem conexão. Este é o último período carregado.",
  },
  item: {
    elapsed: "Já passou",
    open: (label) => `Abrir ${label}`,
    at: (time) => `às ${time}`,
  },
  reschedule: {
    summary: "Datas",
    hint: "Altere o prazo ou o dia que você pretende trabalhar nisso. Nada muda até você confirmar.",
    unavailable: "Este item não tem datas que possam ser alteradas aqui.",
  },
  summary: (count) => (count === 1 ? "1 item neste período" : `${count} itens neste período`),
  todayLabel: "Hoje",
};

const EN: CalendarCopy = {
  title: "Calendar",
  description: "What your days actually contain, gathered from what you have already recorded.",
  orientation: {
    label: "Layout",
    options: { day: "Day", week: "Week", agenda: "Agenda" },
  },
  lanes: {
    label: "What to show",
    stateShown: ", showing",
    stateHidden: ", hidden",
    names: {
      deadline: "Deadlines",
      intention: "Intentions",
      reminder: "Reminders",
      review: "Reviews",
      suggestion: "Suggested dates",
    },
    descriptions: {
      deadline: "Tasks with a due date.",
      intention: "Tasks you mean to work on that day.",
      reminder: "Reminders set for a time.",
      review: "Periods you have already reviewed.",
      suggestion: "Dates the Brain found and you have not confirmed.",
    },
  },
  commitment: {
    committed: "Commitment",
    intended: "Intention",
    suggested: "Suggestion",
    recorded: "Record",
  },
  navigation: {
    previous: "Previous period",
    next: "Next period",
    today: "Today",
    atEarliest: "This is the start of the period the calendar covers.",
    atLatest: "This is the end of the period the calendar covers.",
    allReminders: "All reminders",
  },
  states: {
    empty: "Nothing scheduled for this period.",
    emptyNarrowed: "Nothing scheduled for this period with the current filters.",
    loading: "Loading this period…",
    error: "This period could not be loaded.",
    partial: (lanes) => `Could not load: ${lanes}. Everything else is here.`,
    offline: "You are offline. This is the last period that loaded.",
  },
  item: {
    elapsed: "Already passed",
    open: (label) => `Open ${label}`,
    at: (time) => `at ${time}`,
  },
  reschedule: {
    summary: "Dates",
    hint: "Change the deadline or the day you intend to work on this. Nothing changes until you confirm.",
    unavailable: "This item has no dates that can be changed here.",
  },
  summary: (count) => (count === 1 ? "1 item in this period" : `${count} items in this period`),
  todayLabel: "Today",
};

export function getCalendarCopy(locale: Locale): CalendarCopy {
  return locale === "pt-BR" ? PT_BR : EN;
}
