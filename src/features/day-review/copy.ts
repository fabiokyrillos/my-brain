/**
 * The day review's words, typed, in the `src/features/daily-cycle/copy.ts`
 * shape — which `ENGINEERING_STANDARDS.md` names as the canonical mechanism for
 * new copy, and which is why there is no locale ternary in the view.
 *
 * The words matter more than usual on this surface. A review that says "nothing
 * happened" when a query failed is lying; a review that says "I could not read
 * your captures" is telling the truth about the same screen. Both sentences are
 * here, and `day-review-projection.ts` is what decides which one is rendered.
 */

import type { ReviewTab } from "@/features/reviews/review-periods";

import type { DayReviewActionKind, DayReviewSource } from "./contracts";

export type DayReviewLocale = "pt-BR" | "en";

export type DayReviewCopy = {
  readonly eyebrow: (tab: ReviewTab) => string;
  readonly title: (scope: "day" | "next_day", tab: ReviewTab) => string;
  readonly description: (scope: "day" | "next_day", tab: ReviewTab) => string;
  /** `2M-REVIEW-007`. The promise, restated on this surface, in both locales. */
  readonly nothingScheduled: string;
  readonly scopeLabel: string;
  readonly scopes: Readonly<Record<"day" | "next_day", string>>;
  /**
   * Section headings, **period-neutral**.
   *
   * They used to say "Intenções do dia" and "Prazos do dia", which was correct
   * while the surface only ever showed a day. The same five sections now render
   * for a week and a month, and a heading that names the wrong span is worse
   * than one that names none: the period is stated once, above, by the header.
   */
  readonly sections: Readonly<Record<DayReviewSource, string>>;
  readonly empty: (tab: ReviewTab) => Readonly<Record<DayReviewSource, string>>;
  /** What is said instead of an empty section when the read failed. */
  readonly unavailable: (section: string) => string;
  readonly unreadableHeading: string;
  /**
   * Said in the synthesis block, **not** as a section of its own.
   *
   * "O que não pôde ser lido" used to render on every visit and fall back to a
   * "nothing was unreadable" empty state — a heading whose whole purpose is to
   * report failure, standing over a page that succeeded. The section is now
   * conditional and this line takes its place when every source was read.
   */
  readonly allSourcesRead: string;
  /**
   * The disclosure that holds a row's actions (owner report of 2026-08-20).
   *
   * Every row used to render all five command forms open, so two tasks produced
   * ten form blocks — 3 000 px of a 4 125 px desktop page and 14 391 px on an
   * iPhone. The review's own content was a few lines at the top and everything
   * below it was controls. The forms are unchanged and one press away; what
   * changed is that a report reads as a report again.
   */
  readonly rowActions: string;
  readonly verbs: Readonly<Record<DayReviewActionKind, string>>;
  readonly verbHints: Readonly<Record<DayReviewActionKind, string>>;
  readonly irreversible: string;
  readonly schedule: {
    readonly heading: string;
    readonly dailyBefore: (at: string) => string;
    readonly dailyAfter: (at: string) => string;
    readonly dailyUnknown: string;
    readonly weekly: (weekday: string, at: string) => string;
    readonly weeklyToday: (at: string) => string;
    readonly weeklyUnknown: string;
  };
  readonly weekdays: readonly [string, string, string, string, string, string, string];
  readonly generatedHeading: (tab: ReviewTab) => string;
  readonly generatedNone: (tab: ReviewTab) => string;
  /** The way into a review's own page. Replaces the self-link this surface had. */
  readonly openReview: string;
  /** The tab strip — Dia · Semana · Mês. */
  readonly tabsLabel: string;
  readonly tabs: Readonly<Record<ReviewTab, string>>;
  /** Part B's heading, naming the kind of review it lists. */
  readonly historyHeading: (tab: ReviewTab) => string;
  readonly historyLead: (tab: ReviewTab) => string;
  readonly historyEmptyTitle: (tab: ReviewTab) => string;
  readonly historyEmptyDescription: (tab: ReviewTab) => string;
  /** The generate controls, above the current period's reviews. */
  readonly generateLead: string;
  /**
   * The closing's one-line reading (`summarizeDayReview`).
   *
   * Every string is a count or a statement about the counts. There is no grade,
   * no proportion and no target: `2M-REVIEW-002` forbids the surface proposing
   * changes the user did not ask for, and a review that scored the day would be
   * proposing the loudest change there is.
   */
  readonly synthesis: {
    readonly heading: (tab: ReviewTab) => string;
    readonly completed: (count: number) => string;
    /** What the day committed to and did not close. */
    readonly open: (count: number) => string;
    readonly captured: (count: number) => string;
    /** Said when nothing happened **and** every source was read. */
    readonly quiet: (tab: ReviewTab) => string;
    /** Said when a count is a floor rather than a total, naming what is missing. */
    readonly partial: (sections: string) => string;
    /**
     * The word a row in "intenções" or "prazos" carries about itself.
     *
     * There is deliberately **no** separate pendências list: every open item is
     * already a row in one of those two sections with the verbs its status
     * admits, and a second list would be `2J-HOJE-004`'s repetition — the same
     * task twice on one screen, the second copy carrying less.
     */
    readonly stateOpen: string;
    readonly stateDone: string;
  };
};

/** "neste dia" / "nesta semana" / "neste mês" — the in-form. */
const PT_IN: Record<ReviewTab, string> = { day: "neste dia", week: "nesta semana", month: "neste mês" };
/** "este dia" / "esta semana" / "este mês" — the bare form. */
const PT_THIS: Record<ReviewTab, string> = { day: "este dia", week: "esta semana", month: "este mês" };

const PT_BR: DayReviewCopy = {
  eyebrow: (tab) => (tab === "day" ? "FECHAMENTO DO DIA" : tab === "week" ? "FECHAMENTO DA SEMANA" : "FECHAMENTO DO MÊS"),
  title: (scope, tab) => {
    if (tab === "week") return "Esta semana";
    if (tab === "month") return "Este mês";
    return scope === "day" ? "Hoje" : "Amanhã";
  },
  description: (scope, tab) => {
    if (tab === "week") return "O que esta semana realmente conteve, montado a partir dos seus próprios registros.";
    if (tab === "month") return "O que este mês realmente conteve, montado a partir dos seus próprios registros.";
    return scope === "day"
      ? "O que este dia realmente conteve, montado a partir dos seus próprios registros."
      : "O que já está comprometido e o que você pretende para amanhã.";
  },
  nothingScheduled: "Nada é executado por horário configurado; esta revisão só existe quando você a abre.",
  scopeLabel: "Dia da revisão",
  scopes: { day: "Hoje", next_day: "Amanhã" },
  sections: {
    completed: "Concluído",
    planned: "Intenções",
    due: "Prazos",
    captured: "Registros capturados",
    generated: "Revisões deste período",
  },
  empty: (tab) => ({
    completed: `Nada foi concluído ${PT_IN[tab]}.`,
    planned: `Você não declarou nenhuma intenção para ${PT_THIS[tab]}.`,
    due: `Nenhum prazo cai ${PT_IN[tab]}.`,
    captured: `Nenhum registro foi capturado ${PT_IN[tab]}.`,
    generated: `Nenhuma revisão foi gerada para ${PT_THIS[tab]}.`,
  }),
  unavailable: (section) => `Não foi possível ler: ${section}. Esta seção não está vazia — ela não pôde ser lida.`,
  unreadableHeading: "O que não pôde ser lido",
  allSourcesRead: "Todas as fontes desta revisão foram lidas.",
  rowActions: "Ações",
  verbs: {
    carry_forward: "Levar para amanhã",
    reschedule: "Mudar o prazo",
    plan: "Planejar para um dia",
    archive: "Arquivar",
    follow_up: "Acompanhar",
  },
  verbHints: {
    carry_forward: "Passa a intenção para o dia seguinte. Não mexe no prazo.",
    reschedule: "Muda o compromisso, não a intenção.",
    plan: "Declara a intenção de trabalhar nisso em um dia.",
    archive: "Cancela a tarefa. Precisa de confirmação.",
    follow_up: "Marca como aguardando, para você cobrar depois.",
  },
  irreversible: "Esta ação pede confirmação antes de acontecer.",
  schedule: {
    heading: "Seu horário de revisão",
    dailyBefore: (at) => `Você escolheu revisar o dia às ${at}. Ainda não chegou — abra quando quiser mesmo assim.`,
    dailyAfter: (at) => `Já passou das ${at}, o horário que você escolheu para revisar o dia.`,
    dailyUnknown: "Você ainda não escolheu um horário para a revisão diária.",
    weekly: (weekday, at) => `A revisão da semana que você escolheu é ${weekday}, às ${at}.`,
    weeklyToday: (at) => `Hoje é o dia que você escolheu para a revisão da semana, às ${at}.`,
    weeklyUnknown: "Você ainda não escolheu um dia para a revisão da semana.",
  },
  weekdays: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  generatedHeading: (tab) => (tab === "day" ? "Revisão deste dia" : tab === "week" ? "Revisões desta semana" : "Revisão deste mês"),
  generatedNone: (tab) => `Nenhuma revisão foi gerada para ${PT_THIS[tab]} ainda.`,
  openReview: "Abrir revisão",
  tabsLabel: "Período",
  tabs: { day: "Dia", week: "Semana", month: "Mês" },
  historyHeading: (tab) => (tab === "day" ? "Dias anteriores" : tab === "week" ? "Semanas anteriores" : "Meses anteriores"),
  historyLead: (tab) => (tab === "day"
    ? "Revisões diárias que você já gerou."
    : tab === "week"
      ? "Revisões e planejamentos semanais que você já gerou."
      : "Revisões mensais que você já gerou."),
  historyEmptyTitle: (tab) => (tab === "day" ? "Nenhum dia anterior" : tab === "week" ? "Nenhuma semana anterior" : "Nenhum mês anterior"),
  historyEmptyDescription: () => "Cada revisão que você gerar aparece aqui depois que o período passa.",
  generateLead: "Cada botão pede ao Brain uma síntese escrita deste período. Nada roda sozinho — e gerar uma revisão não altera nada.",
  synthesis: {
    heading: (tab) => (tab === "day" ? "Como o dia ficou" : tab === "week" ? "Como a semana ficou" : "Como o mês ficou"),
    completed: (count) => (count === 1 ? "1 tarefa concluída" : `${count} tarefas concluídas`),
    open: (count) => (count === 1 ? "1 continua em aberto" : `${count} continuam em aberto`),
    captured: (count) => (count === 1 ? "1 registro capturado" : `${count} registros capturados`),
    quiet: (tab) => `Nada foi concluído, nada ficou em aberto e nada foi capturado ${PT_IN[tab]}.`,
    partial: (sections) => `Estes números estão incompletos: não foi possível ler ${sections}.`,
    stateOpen: "em aberto",
    stateDone: "concluída",
  },
};

const EN_IN: Record<ReviewTab, string> = { day: "on this day", week: "this week", month: "this month" };
const EN_THIS: Record<ReviewTab, string> = { day: "this day", week: "this week", month: "this month" };

const EN: DayReviewCopy = {
  eyebrow: (tab) => (tab === "day" ? "CLOSING THE DAY" : tab === "week" ? "CLOSING THE WEEK" : "CLOSING THE MONTH"),
  title: (scope, tab) => {
    if (tab === "week") return "This week";
    if (tab === "month") return "This month";
    return scope === "day" ? "Today" : "Tomorrow";
  },
  description: (scope, tab) => {
    if (tab === "week") return "What this week actually contained, composed from your own records.";
    if (tab === "month") return "What this month actually contained, composed from your own records.";
    return scope === "day"
      ? "What this day actually contained, composed from your own records."
      : "What is already committed and what you intend for tomorrow.";
  },
  nothingScheduled: "Nothing runs from a configured schedule; this review exists only when you open it.",
  scopeLabel: "Review day",
  scopes: { day: "Today", next_day: "Tomorrow" },
  sections: {
    completed: "Completed",
    planned: "Intentions",
    due: "Deadlines",
    captured: "Captured records",
    generated: "Reviews of this period",
  },
  empty: (tab) => ({
    completed: `Nothing was completed ${EN_IN[tab]}.`,
    planned: `You declared no intention for ${EN_THIS[tab]}.`,
    due: `No deadline falls ${EN_IN[tab]}.`,
    captured: `No record was captured ${EN_IN[tab]}.`,
    generated: `No review has been generated for ${EN_THIS[tab]}.`,
  }),
  unavailable: (section) => `Could not be read: ${section}. This section is not empty — it could not be read.`,
  unreadableHeading: "What could not be read",
  allSourcesRead: "Every source for this review was read.",
  rowActions: "Actions",
  verbs: {
    carry_forward: "Carry to tomorrow",
    reschedule: "Change the deadline",
    plan: "Plan for a day",
    archive: "Archive",
    follow_up: "Follow up",
  },
  verbHints: {
    carry_forward: "Moves the intention to the next day. Leaves the deadline alone.",
    reschedule: "Changes the commitment, not the intention.",
    plan: "Declares the intention to work on this on a day.",
    archive: "Cancels the task. Asks for confirmation.",
    follow_up: "Marks it as waiting, so you can chase it later.",
  },
  irreversible: "This action asks for confirmation before it happens.",
  schedule: {
    heading: "Your review time",
    dailyBefore: (at) => `You chose to review the day at ${at}. It is not that time yet — open it anyway if you want.`,
    dailyAfter: (at) => `It is past ${at}, the time you chose to review the day.`,
    dailyUnknown: "You have not chosen a time for the daily review yet.",
    weekly: (weekday, at) => `The weekly review you chose is ${weekday}, at ${at}.`,
    weeklyToday: (at) => `Today is the day you chose for the weekly review, at ${at}.`,
    weeklyUnknown: "You have not chosen a day for the weekly review yet.",
  },
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  generatedHeading: (tab) => (tab === "day" ? "This day's review" : tab === "week" ? "This week's reviews" : "This month's review"),
  generatedNone: (tab) => `No review has been generated for ${EN_THIS[tab]} yet.`,
  openReview: "Open review",
  tabsLabel: "Period",
  tabs: { day: "Day", week: "Week", month: "Month" },
  historyHeading: (tab) => (tab === "day" ? "Previous days" : tab === "week" ? "Previous weeks" : "Previous months"),
  historyLead: (tab) => (tab === "day"
    ? "Daily reviews you have already generated."
    : tab === "week"
      ? "Weekly reviews and plans you have already generated."
      : "Monthly reviews you have already generated."),
  historyEmptyTitle: (tab) => (tab === "day" ? "No previous day" : tab === "week" ? "No previous week" : "No previous month"),
  historyEmptyDescription: () => "Every review you generate appears here once its period has passed.",
  generateLead: "Each button asks Brain to write up this period. Nothing runs on its own, and generating a review changes nothing.",
  synthesis: {
    heading: (tab) => (tab === "day" ? "How the day turned out" : tab === "week" ? "How the week turned out" : "How the month turned out"),
    completed: (count) => (count === 1 ? "1 task completed" : `${count} tasks completed`),
    open: (count) => (count === 1 ? "1 still open" : `${count} still open`),
    captured: (count) => (count === 1 ? "1 record captured" : `${count} records captured`),
    quiet: (tab) => `Nothing was completed, nothing was left open and nothing was captured ${EN_IN[tab]}.`,
    partial: (sections) => `These numbers are incomplete: ${sections} could not be read.`,
    stateOpen: "open",
    stateDone: "completed",
  },
};

export function getDayReviewCopy(locale: string): DayReviewCopy {
  return locale === "en" ? EN : PT_BR;
}
