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

import type { DayReviewActionKind, DayReviewSource } from "./contracts";

export type DayReviewLocale = "pt-BR" | "en";

export type DayReviewCopy = {
  readonly eyebrow: string;
  readonly title: (scope: "day" | "next_day") => string;
  readonly description: (scope: "day" | "next_day") => string;
  /** `2M-REVIEW-007`. The promise, restated on this surface, in both locales. */
  readonly nothingScheduled: string;
  readonly scopeLabel: string;
  readonly scopes: Readonly<Record<"day" | "next_day", string>>;
  readonly sections: Readonly<Record<DayReviewSource, string>>;
  readonly empty: Readonly<Record<DayReviewSource, string>>;
  /** What is said instead of an empty section when the read failed. */
  readonly unavailable: (section: string) => string;
  readonly unreadableHeading: string;
  readonly unreadableNone: string;
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
  readonly generatedHeading: string;
  readonly generatedNone: string;
  readonly openReviews: string;
};

const PT_BR: DayReviewCopy = {
  eyebrow: "FECHAMENTO DO DIA",
  title: (scope) => (scope === "day" ? "Revisão do dia" : "Revisão do dia seguinte"),
  description: (scope) => (scope === "day"
    ? "O que este dia realmente conteve, montado a partir dos seus próprios registros."
    : "O que já está comprometido e o que você pretende para amanhã."),
  nothingScheduled: "Nada é executado por horário configurado; esta revisão só existe quando você a abre.",
  scopeLabel: "Período da revisão",
  scopes: { day: "Este dia", next_day: "Dia seguinte" },
  sections: {
    completed: "Concluído",
    planned: "Intenções do dia",
    due: "Prazos do dia",
    captured: "Registros capturados",
    generated: "Revisão gerada",
  },
  empty: {
    completed: "Nada foi concluído neste dia.",
    planned: "Você não declarou nenhuma intenção para este dia.",
    due: "Nenhum prazo cai neste dia.",
    captured: "Nenhum registro foi capturado neste dia.",
    generated: "Nenhuma revisão gerada cobre este dia.",
  },
  unavailable: (section) => `Não foi possível ler: ${section}. Esta seção não está vazia — ela não pôde ser lida.`,
  unreadableHeading: "O que não pôde ser lido",
  unreadableNone: "Todas as fontes desta revisão foram lidas.",
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
  generatedHeading: "Revisão gerada",
  generatedNone: "Nenhuma revisão gerada cobre este dia.",
  openReviews: "Ver todas as revisões",
};

const EN: DayReviewCopy = {
  eyebrow: "CLOSING THE DAY",
  title: (scope) => (scope === "day" ? "Day review" : "Next-day review"),
  description: (scope) => (scope === "day"
    ? "What this day actually contained, composed from your own records."
    : "What is already committed and what you intend for tomorrow."),
  nothingScheduled: "Nothing runs from a configured schedule; this review exists only when you open it.",
  scopeLabel: "Review period",
  scopes: { day: "This day", next_day: "Next day" },
  sections: {
    completed: "Completed",
    planned: "Intentions for the day",
    due: "Deadlines on the day",
    captured: "Captured records",
    generated: "Generated review",
  },
  empty: {
    completed: "Nothing was completed on this day.",
    planned: "You declared no intention for this day.",
    due: "No deadline falls on this day.",
    captured: "No record was captured on this day.",
    generated: "No generated review covers this day.",
  },
  unavailable: (section) => `Could not be read: ${section}. This section is not empty — it could not be read.`,
  unreadableHeading: "What could not be read",
  unreadableNone: "Every source for this review was read.",
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
  generatedHeading: "Generated review",
  generatedNone: "No generated review covers this day.",
  openReviews: "See every review",
};

export function getDayReviewCopy(locale: string): DayReviewCopy {
  return locale === "en" ? EN : PT_BR;
}
