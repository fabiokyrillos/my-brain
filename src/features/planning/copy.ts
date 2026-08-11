/**
 * The planner's words, in the shape `ENGINEERING_STANDARDS` names as canonical:
 * a typed per-feature `copy.ts`, one record per locale, no ternaries at the
 * point of use.
 *
 * Two rules run through every string here and both come from OD-2M-3 A.
 *
 * **Nothing is a reprimand.** A day that went by with a plan still on it is a
 * fact (`2M-PLAN-007`), so the conflict sentences state what is true and stop.
 * There is no "you should", no "overdue", and no exclamation.
 *
 * **Nothing claims a duration.** `2M-PLAN-006` forbids an invented estimate, so
 * the overload sentence names its own assumption in the sentence a user reads,
 * rather than hiding it in a coefficient.
 */

import type { Locale } from "@/lib/preferences";

import type { PlannerConflictKind } from "./planner-conflicts";

export type PlannerCopy = {
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  /** The two lists this surface has, and nothing else. */
  readonly planned: string;
  readonly available: string;
  readonly plannedEmpty: string;
  readonly availableEmpty: string;
  readonly backToCalendar: string;
  readonly dayLabel: string;
  readonly previousDay: string;
  readonly nextDay: string;
  readonly today: string;
  /** `2M-PLAN-006`. */
  readonly capacity: {
    readonly heading: string;
    readonly count: (count: number) => string;
    readonly available: (hours: number) => string;
    readonly undeclared: string;
    readonly noDuration: string;
    readonly overloaded: string;
  };
  /** `2M-PLAN-007`/`-008`. */
  readonly conflicts: {
    readonly heading: string;
    readonly none: string;
    readonly count: (count: number) => string;
    readonly statement: Record<PlannerConflictKind, string>;
    readonly notResolved: string;
  };
  /** `2M-ACCESS-004` — the live region every outcome is announced through. */
  readonly outcome: string;
  /** `2M-PLAN-004` — this surface creates nothing. */
  readonly createsNothing: string;
};

const ptBR: PlannerCopy = {
  title: "Planejar o dia",
  eyebrow: "CICLO DIÁRIO",
  description: "Escolha o que você pretende fazer, entre o que já existe.",
  planned: "Planejado para este dia",
  available: "Disponível para planejar",
  plannedEmpty: "Você ainda não planejou nada para este dia.",
  availableEmpty: "Não há tarefas em aberto sem dia planejado.",
  backToCalendar: "Voltar para o calendário",
  dayLabel: "Dia",
  previousDay: "Dia anterior",
  nextDay: "Próximo dia",
  today: "Hoje",
  capacity: {
    heading: "Quanto você planejou",
    count: (count) => `${count} ${count === 1 ? "item planejado" : "itens planejados"}`,
    available: (hours) => `${hours} ${hours === 1 ? "hora declarada" : "horas declaradas"} como disponíveis`,
    undeclared: "Você não declarou suas horas disponíveis, então não há com o que comparar.",
    noDuration: "Nenhuma tarefa tem duração registrada, então não dá para dizer se cabe no dia.",
    overloaded: "Há mais itens do que horas declaradas, contando um item por hora.",
  },
  conflicts: {
    heading: "O que vale notar",
    none: "Nada a notar neste dia.",
    count: (count) => `${count} ${count === 1 ? "observação" : "observações"}`,
    statement: {
      double_booking: "Dois compromissos marcados para o mesmo instante.",
      intention_after_deadline: "A intenção é para depois do prazo da tarefa.",
      intention_in_the_past: "O dia planejado já passou.",
    },
    notResolved: "Nada foi alterado. Você decide o que fazer com cada uma.",
  },
  outcome: "Resultado da alteração",
  createsNothing: "Esta tela não cria tarefas. Ela só organiza o que já existe.",
};

const en: PlannerCopy = {
  title: "Plan the day",
  eyebrow: "DAILY CYCLE",
  description: "Choose what you mean to do, from what already exists.",
  planned: "Planned for this day",
  available: "Available to plan",
  plannedEmpty: "You have not planned anything for this day yet.",
  availableEmpty: "There are no open tasks without a planned day.",
  backToCalendar: "Back to the calendar",
  dayLabel: "Day",
  previousDay: "Previous day",
  nextDay: "Next day",
  today: "Today",
  capacity: {
    heading: "How much you planned",
    count: (count) => `${count} planned ${count === 1 ? "item" : "items"}`,
    available: (hours) => `${hours} ${hours === 1 ? "hour" : "hours"} declared as available`,
    undeclared: "You have not declared your available hours, so there is nothing to compare against.",
    noDuration: "No task carries a duration, so this cannot say whether it fits in the day.",
    overloaded: "There are more items than declared hours, counting one item per hour.",
  },
  conflicts: {
    heading: "Worth noticing",
    none: "Nothing to notice on this day.",
    count: (count) => `${count} ${count === 1 ? "note" : "notes"}`,
    statement: {
      double_booking: "Two commitments are set for the same instant.",
      intention_after_deadline: "The intention is for after the task's deadline.",
      intention_in_the_past: "The planned day has already passed.",
    },
    notResolved: "Nothing was changed. What to do about each is yours to decide.",
  },
  outcome: "Result of the change",
  createsNothing: "This screen creates no tasks. It only arranges what already exists.",
};

const BY_LOCALE: Record<Locale, PlannerCopy> = { "pt-BR": ptBR, en };

export function getPlannerCopy(locale: Locale): PlannerCopy {
  return BY_LOCALE[locale];
}
