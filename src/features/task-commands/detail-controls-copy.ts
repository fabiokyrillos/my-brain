/**
 * The task-detail edit controls' copy, typed (ADR-036,
 * `docs/ENGINEERING_STANDARDS.md`).
 *
 * Everything an *outcome* needs — applied, no-change, every declared `2E_*`
 * failure, every schema validation reason and every unsupported reason —
 * already exists in `copy.ts` and is reused from there. Two vocabularies for one
 * contract is how "the task changed since the preview" ends up worded two ways
 * in two places. What lives here is only what is genuinely this surface's: the
 * control labels, the field labels, the closed value labels, the four refusals a
 * *control* can produce, and the destructive dialog.
 *
 * `actions`, `fields` and `choices` are **exhaustive records over the taxonomy's
 * own vocabularies**, not over the subset rendered today. A sixteenth action, a
 * tenth patch field or a ninth status would otherwise reach the surface with no
 * label and render as a database token; here it is a compile error.
 */

import type { Locale } from "@/lib/preferences";

import type { DetailRelationKind, DetailValueRefusal } from "./detail-controls";
import type {
  TaskCommandAction,
  TaskCommandPatchField,
  TaskPriority,
  TaskStatus,
} from "./taxonomy";

type OutcomeCopy = { readonly title: string; readonly description: string };

/** The two refusals `resolveDetailCommand` produces from the row itself. */
type RowRefusal = "unresolvable" | "ineligible";

export type TaskDetailControlsCopy = {
  readonly sectionTitle: string;
  readonly sectionHint: string;
  /** The verb, as a person would say it. Used as the control's accessible name. */
  readonly actions: Record<TaskCommandAction, string>;
  /** The submit control's own label, which is not always the verb. */
  readonly submit: string;
  readonly fields: Record<TaskCommandPatchField, string>;
  readonly choices: Record<TaskStatus | TaskPriority, string>;
  /** The empty option a `<select>` opens on, so nothing is pre-chosen. */
  readonly choosePlaceholder: string;
  readonly relationEmpty: Record<DetailRelationKind, string>;
  readonly valueRefusals: Record<DetailValueRefusal, string>;
  readonly rowRefusals: Record<RowRefusal, OutcomeCopy>;
  /** The destructive dialog (2E-DESTRUCTIVE-005, 2E-A11Y-004). */
  readonly confirm: {
    readonly title: string;
    readonly description: string;
    readonly submit: string;
    readonly cancel: string;
    /** Rendered once confirmation is issued and the user has not spent it. */
    readonly pendingHeading: string;
    readonly pendingDetail: string;
  };
  readonly refresh: string;
  readonly pendingAnnouncement: string;
  readonly resultRegionLabel: string;
  /** A caught precondition fault. Honest, and never the thrown message. */
  readonly unexpected: string;
};

const ptBR: TaskDetailControlsCopy = {
  sectionTitle: "Editar esta tarefa",
  sectionHint: "Cada alteração é registrada e pode ser desfeita por 24 horas.",
  actions: {
    complete_task: "Concluir",
    reopen_task: "Reabrir",
    set_status: "Mudar a situação",
    cancel_task: "Cancelar a tarefa",
    restore_task: "Restaurar a tarefa",
    rename_task: "Renomear",
    append_note: "Acrescentar uma nota",
    reschedule_due: "Mudar o prazo",
    clear_due: "Tirar o prazo",
    set_planned: "Planejar para um dia",
    clear_planned: "Tirar o dia planejado",
    set_priority: "Definir a prioridade",
    assign_project: "Ligar a um projeto",
    assign_context: "Ligar a um contexto",
    assign_person: "Envolver uma pessoa",
    set_waiting_on: "Marcar que aguarda alguém",
  },
  submit: "Aplicar",
  fields: {
    title: "Novo título",
    note: "Nota",
    status: "Situação",
    priority: "Prioridade",
    dueAt: "Prazo",
    plannedAt: "Dia planejado",
    projectRef: "Projeto",
    contextRef: "Contexto",
    personRef: "Pessoa",
  },
  choices: {
    inbox: "Na entrada",
    todo: "A fazer",
    in_progress: "Em andamento",
    waiting: "Aguardando",
    blocked: "Bloqueada",
    deferred: "Adiada",
    completed: "Concluída",
    cancelled: "Cancelada",
    low: "Baixa",
    medium: "Média",
    high: "Alta",
    urgent: "Urgente",
  },
  choosePlaceholder: "Escolha…",
  relationEmpty: {
    project: "Você ainda não tem projetos.",
    context: "Você ainda não tem contextos.",
    person: "Você ainda não tem pessoas.",
  },
  valueRefusals: {
    missing_value: "Preencha este campo antes de aplicar.",
    date_invalid: "Use uma data real, no formato do calendário.",
    date_out_of_range: "Escolha uma data dentro dos próximos ou últimos dois anos.",
    value_not_allowed: "Essa opção não vale para esta ação.",
  },
  rowRefusals: {
    unresolvable: {
      title: "Esta tarefa não está mais aqui",
      description:
        "Ela pode ter sido alterada ou removida em outro lugar. Recarregue a página para ver o estado atual.",
    },
    ineligible: {
      title: "Esta ação não vale mais para esta tarefa",
      description:
        "O estado da tarefa mudou desde que esta página foi carregada. Recarregue para ver o que é possível agora.",
    },
  },
  confirm: {
    title: "Cancelar esta tarefa?",
    description:
      "A tarefa sai das suas listas e passa a constar como cancelada. Você pode restaurá-la depois, por aqui mesmo.",
    submit: "Sim, cancelar a tarefa",
    cancel: "Voltar",
    pendingHeading: "Confirme o cancelamento",
    pendingDetail: "Nada foi alterado ainda. Confirme para cancelar esta tarefa.",
  },
  refresh: "Recarregar a página",
  pendingAnnouncement: "Aplicando…",
  resultRegionLabel: "Resultado da alteração",
  unexpected: "Algo saiu do esperado. Nada foi alterado — tente de novo.",
};

const en: TaskDetailControlsCopy = {
  sectionTitle: "Edit this task",
  sectionHint: "Every change is recorded and can be undone for 24 hours.",
  actions: {
    complete_task: "Complete",
    reopen_task: "Reopen",
    set_status: "Change the state",
    cancel_task: "Cancel the task",
    restore_task: "Restore the task",
    rename_task: "Rename",
    append_note: "Add a note",
    reschedule_due: "Change the due date",
    clear_due: "Remove the due date",
    set_planned: "Plan it for a day",
    clear_planned: "Remove the planned day",
    set_priority: "Set the priority",
    assign_project: "Link to a project",
    assign_context: "Link to a context",
    assign_person: "Involve a person",
    set_waiting_on: "Mark as waiting on someone",
  },
  submit: "Apply",
  fields: {
    title: "New title",
    note: "Note",
    status: "State",
    priority: "Priority",
    dueAt: "Due date",
    plannedAt: "Planned day",
    projectRef: "Project",
    contextRef: "Context",
    personRef: "Person",
  },
  choices: {
    inbox: "In the inbox",
    todo: "To do",
    in_progress: "In progress",
    waiting: "Waiting",
    blocked: "Blocked",
    deferred: "Deferred",
    completed: "Completed",
    cancelled: "Cancelled",
    low: "Low",
    medium: "Medium",
    high: "High",
    urgent: "Urgent",
  },
  choosePlaceholder: "Choose…",
  relationEmpty: {
    project: "You have no projects yet.",
    context: "You have no contexts yet.",
    person: "You have no people yet.",
  },
  valueRefusals: {
    missing_value: "Fill this in before applying.",
    date_invalid: "Use a real calendar date.",
    date_out_of_range: "Choose a date within the next or last two years.",
    value_not_allowed: "That option does not apply to this action.",
  },
  rowRefusals: {
    unresolvable: {
      title: "This task is no longer here",
      description:
        "It may have changed or been removed elsewhere. Reload the page to see the current state.",
    },
    ineligible: {
      title: "This action no longer applies to this task",
      description:
        "The task's state changed since this page was loaded. Reload to see what is possible now.",
    },
  },
  confirm: {
    title: "Cancel this task?",
    description:
      "The task leaves your lists and is recorded as cancelled. You can restore it later, from this same page.",
    submit: "Yes, cancel the task",
    cancel: "Go back",
    pendingHeading: "Confirm the cancellation",
    pendingDetail: "Nothing has changed yet. Confirm to cancel this task.",
  },
  refresh: "Reload the page",
  pendingAnnouncement: "Applying…",
  resultRegionLabel: "Change result",
  unexpected: "Something went wrong. Nothing was changed — try again.",
};

export const taskDetailControlsCopy = { "pt-BR": ptBR, en } satisfies Record<
  Locale,
  TaskDetailControlsCopy
>;

export function getTaskDetailControlsCopy(locale: Locale): TaskDetailControlsCopy {
  return taskDetailControlsCopy[locale];
}
