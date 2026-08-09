/**
 * The Work narrowing controls' copy, typed (ADR-036).
 *
 * A module of its own rather than an addition to `work-view.tsx`'s record,
 * because that record is keyed by *view* and this one is keyed by *filter
 * vocabulary* — and because every key below is exhaustive over a closed set the
 * taxonomy owns, so a new member cannot be added without the type demanding a
 * word for it in both languages.
 *
 * No engineering vocabulary (PRD §5.3): the user reads "Concluídas", never
 * `completed`, and "Mais recentes primeiro", never `updated_desc`.
 */

import type { Locale } from "@/lib/preferences";

import type {
  WorkDueFilter,
  WorkGrouping,
  WorkOrder,
  WorkOriginFilter,
  WorkPriorityFilter,
  WorkState,
} from "./work-query";

export type WorkFiltersCopy = {
  readonly groups: {
    readonly state: string;
    readonly due: string;
    readonly priority: string;
    readonly origin: string;
    readonly order: string;
    readonly group: string;
  };
  readonly state: Record<WorkState, string>;
  readonly due: Record<WorkDueFilter, string>;
  readonly priority: Record<WorkPriorityFilter, string>;
  readonly origin: Record<WorkOriginFilter, string>;
  readonly order: Record<WorkOrder, string>;
  readonly group: Record<WorkGrouping, string>;
  /** Shown when the user arrived by a per-project or per-context link. */
  readonly relationActive: string;
  readonly clearRelation: string;
  /** `2L-VIEW-009` — an empty page that is empty *because of* the narrowing. */
  readonly emptyFiltered: string;
  /** `2L-RETURN-005` — the position moved, and the user is told. */
  readonly positionAdjusted: string;
  /** The label a group of rows carries when grouping is on (`2L-VIEW-006`). */
  readonly groupCount: (count: number) => string;
  readonly ungrouped: string;
};

const ptBR: WorkFiltersCopy = {
  groups: {
    state: "Situação",
    due: "Prazo",
    priority: "Prioridade",
    origin: "Origem",
    order: "Ordem",
    group: "Agrupar",
  },
  state: { open: "Em aberto", completed: "Concluídas", cancelled: "Canceladas" },
  due: { any: "Qualquer", overdue: "Atrasadas", today: "Hoje", upcoming: "A partir de amanhã", none: "Sem prazo" },
  priority: { any: "Qualquer", low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" },
  origin: { any: "Qualquer", you: "Criadas por você", brain: "Sugeridas" },
  order: {
    default: "Padrão da visão",
    due_asc: "Prazo mais próximo",
    due_desc: "Prazo mais distante",
    updated_desc: "Alteradas há menos tempo",
    updated_asc: "Alteradas há mais tempo",
  },
  group: { none: "Sem agrupamento", priority: "Por prioridade", project: "Por projeto", context: "Por contexto" },
  relationActive: "Esta lista está limitada a uma relação.",
  clearRelation: "Ver sem esse limite",
  emptyFiltered: "Nenhuma tarefa corresponde a esses filtros. Ajuste-os para ver mais.",
  positionAdjusted: "A página que você tinha aberto não existe mais aqui. Esta é a mais próxima.",
  groupCount: (count) => `${count} tarefa${count === 1 ? "" : "s"}`,
  ungrouped: "Sem essa relação",
};

const en: WorkFiltersCopy = {
  groups: {
    state: "State",
    due: "Due",
    priority: "Priority",
    origin: "Origin",
    order: "Order",
    group: "Group",
  },
  state: { open: "Open", completed: "Completed", cancelled: "Cancelled" },
  due: { any: "Any", overdue: "Overdue", today: "Today", upcoming: "From tomorrow", none: "No due date" },
  priority: { any: "Any", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" },
  origin: { any: "Any", you: "Created by you", brain: "Suggested" },
  order: {
    default: "The view's default",
    due_asc: "Soonest due first",
    due_desc: "Latest due first",
    updated_desc: "Changed most recently",
    updated_asc: "Changed least recently",
  },
  group: { none: "No grouping", priority: "By priority", project: "By project", context: "By context" },
  relationActive: "This list is limited to one relationship.",
  clearRelation: "See it without that limit",
  emptyFiltered: "No task matches these filters. Adjust them to see more.",
  positionAdjusted: "The page you had open is no longer here. This is the nearest one.",
  groupCount: (count) => `${count} task${count === 1 ? "" : "s"}`,
  ungrouped: "Without that relationship",
};

const BY_LOCALE: Record<Locale, WorkFiltersCopy> = { "pt-BR": ptBR, en };

export function getWorkFiltersCopy(locale: Locale): WorkFiltersCopy {
  return BY_LOCALE[locale];
}
