/**
 * Phase 2E display copy, in both locales, keyed by the declared vocabularies
 * (2E-I18N-001, ADR-036).
 *
 * Three deliberate departures from the copy modules already in the tree, each
 * fixing a defect that module has:
 *
 *   - `Locale` is imported from `@/lib/preferences`, never redeclared.
 *     `daily-cycle/copy.ts:8-9` declares its own `dailyCycleLocales`, which
 *     ADR-036 §2 forbids precisely because a second declaration can fall behind
 *     the first without anything failing.
 *   - `satisfies Record<Locale, TaskCommandCopy>` rather than a bare
 *     `as const`. `as const` (used by `question-preview-projection.ts:85` and
 *     `interpretations/copy.ts:25`) infers a shape from the data instead of
 *     checking the data against a shape, so a missing outcome key or a missing
 *     locale compiles.
 *   - `getTaskCommandCopy` indexes directly, with **no** `?? copy["pt-BR"]`
 *     fallback. `question-preview-projection.ts:93` has one, which turns an
 *     unhandled locale into silently-Portuguese text for an English user rather
 *     than into a compile error.
 *
 * Every record here is keyed by a `Record<DeclaredUnion, …>`, so adding a member
 * to any vocabulary is a type error in both locales at once. That is what
 * 2E-I18N-003 means by asserting "against the declared code list rather than
 * against a hand-written key list", and `copy.test.ts` proves it at runtime too,
 * because a `Record` over a union is not iterable at compile time.
 */

import type { Locale } from "@/lib/preferences";

import type { TaskMatchEvidence } from "./match-policy";
import type {
  TaskCommandOutcome,
  TaskCommandPreviewDisposition,
  TaskCommandPreviewRefusal,
} from "./outcomes";
import type { TaskChangedField, TaskCommandAction } from "./taxonomy";

/** The linked effects a preview can disclose (2E-PREVIEW-003). */
export const TASK_COMMAND_LINKED_EFFECTS = [
  /** Scheduled reminders exist and the transition cancels them. */
  "reminders_cancelled",
  /** A fresh reminder is created, because a future due date survives the change. */
  "reminder_created",
  /** The action touches reminders and the task has none scheduled. */
  "reminders_none",
  /**
   * The task already holds a scheduled reminder that PRD §11.3 assumes it
   * cannot have. Real, not defensive: nothing in this repository has ever
   * cancelled a reminder on completion or cancellation, so a task that was
   * completed before Phase 2E can still carry a live one.
   */
  "reminders_already_scheduled",
  /** Cancelling removes the task from the active lists (2E-PREVIEW-003). */
  "leaves_active_lists",
] as const;

export type TaskCommandLinkedEffectKind = (typeof TASK_COMMAND_LINKED_EFFECTS)[number];

type OutcomeCopy = { title: string; description: string };

export type TaskCommandCopy = {
  outcomes: Record<TaskCommandOutcome, OutcomeCopy>;
  dispositions: Record<TaskCommandPreviewDisposition, OutcomeCopy>;
  refusals: Record<TaskCommandPreviewRefusal, OutcomeCopy>;
  actions: Record<TaskCommandAction, string>;
  fields: Record<TaskChangedField, string>;
  evidence: Record<TaskMatchEvidence, string>;
  effects: Record<TaskCommandLinkedEffectKind, string>;
  values: {
    /** A field that is currently empty, on either side of the arrow. */
    empty: string;
    /** `completed_at`/`cancelled_at`: the instant is chosen when you apply. */
    atApply: string;
    /** An instant this process could not render in the caller's zone. */
    unrenderableInstant: string;
  };
  preview: {
    readOnlyNotice: string;
    reversible: string;
    notReversible: string;
    undoWindow: string;
    destructive: string;
    confirmationRequired: string;
    oneStep: string;
    /**
     * The confirm-this-one prompt's own title.
     *
     * Separate from `outcomes.ambiguous.title` deliberately. Reusing "I need
     * you to choose" here contradicted the body text: a `qualifyingCount === 1`
     * result offers nothing to choose *between*, and 2E-UX-001 requires each
     * outcome to have a distinct, truthful presentation. A review caught the
     * two speech acts pointing in different directions.
     */
    ambiguousOneTitle: string;
    ambiguousOne: string;
  };
};

const ptBR: TaskCommandCopy = {
  outcomes: {
    applied: { title: "Feito", description: "A alteração foi aplicada." },
    no_change: {
      title: "Nada a mudar",
      description: "A tarefa já está exatamente como você pediu, então nada foi alterado.",
    },
    ambiguous: {
      title: "Preciso que você escolha",
      description: "Encontrei mais de uma tarefa que pode ser esta.",
    },
    ambiguous_overflow: {
      title: "Tarefas demais",
      description: "Encontrei tarefas demais para comparar com segurança. Descreva a tarefa com mais detalhes.",
    },
    matched_requires_confirmation: {
      title: "Confirme antes de aplicar",
      description: "Identifiquei a tarefa. Esta ação precisa da sua confirmação explícita.",
    },
    clarification_requested: {
      title: "Uma pergunta",
      description: "Preciso de um detalhe a mais para encontrar a tarefa certa.",
    },
    still_unmatched: {
      title: "Ainda não encontrei",
      description: "Mesmo com a sua resposta, não encontrei essa tarefa.",
    },
    creation_offered: {
      title: "Posso registrar isto",
      description: "Não encontrei uma tarefa correspondente, mas posso registrar este trabalho novo.",
    },
    unsupported: {
      title: "Isso eu ainda não faço",
      description: "Este pedido está fora do que consigo fazer com tarefas.",
    },
    rejected_stale: {
      title: "Isto mudou enquanto você olhava",
      description: "A tarefa mudou desde a previsão, então nada foi aplicado. Veja a previsão atualizada.",
    },
    rejected_conflict: {
      title: "Outra alteração chegou primeiro",
      description: "Outra alteração nesta tarefa chegou antes. Nada foi aplicado.",
    },
    refused: { title: "Não consegui fazer isso", description: "Entendi o pedido, mas não pude aplicá-lo." },
  },
  dispositions: {
    previewed: {
      title: "Previsão",
      description: "Isto é o que aconteceria. Nada foi aplicado ainda.",
    },
    matched_requires_confirmation: {
      title: "Confirme antes de aplicar",
      description: "Identifiquei a tarefa. Esta ação precisa da sua confirmação explícita.",
    },
    no_change: {
      title: "Nada a mudar",
      description: "A tarefa já está exatamente como você pediu, então nada foi alterado.",
    },
    rejected_stale: {
      title: "Isto mudou enquanto você olhava",
      description: "A tarefa mudou desde a previsão. Veja a previsão atualizada antes de aplicar.",
    },
    refused: { title: "Não consegui fazer isso", description: "Entendi o pedido, mas não pude aplicá-lo." },
  },
  refusals: {
    relation_reference_unresolved: {
      title: "Não identifiquei esse item",
      description:
        "Não encontrei exatamente um item seu com esse nome — ou ele não existe, ou você tem mais de um com o mesmo nome.",
    },
  },
  actions: {
    complete_task: "concluir a tarefa",
    reopen_task: "reabrir a tarefa",
    set_status: "mudar o status",
    cancel_task: "cancelar a tarefa",
    restore_task: "restaurar a tarefa",
    rename_task: "renomear a tarefa",
    append_note: "adicionar uma nota",
    reschedule_due: "mudar o prazo",
    clear_due: "remover o prazo",
    set_planned: "mudar o dia planejado",
    set_priority: "mudar a prioridade",
    assign_project: "vincular a um projeto",
    assign_context: "vincular a um contexto",
    assign_person: "vincular a uma pessoa",
    set_waiting_on: "marcar como aguardando alguém",
  },
  fields: {
    status: "Status",
    completed_at: "Concluída em",
    cancelled_at: "Cancelada em",
    title: "Título",
    description: "Descrição",
    due_at: "Prazo",
    intentional_no_due: "Sem prazo por decisão",
    no_due_reason: "Motivo de não ter prazo",
    planned_at: "Planejada para",
    manual_priority: "Prioridade",
    task_projects: "Projeto",
    task_contexts: "Contexto",
    "task_people:involved": "Pessoa envolvida",
    "task_people:waiting_on": "Aguardando",
    reminders: "Lembretes",
  },
  evidence: {
    normalized_exact_title: "o título é exatamente o que você disse",
    normalized_title_phrase: "o título contém o que você disse",
    normalized_token_overlap: "o título tem palavras em comum",
    referenced_project: "está no projeto que você citou",
    referenced_context: "está no contexto que você citou",
    referenced_person: "envolve a pessoa que você citou",
    status_match: "está no status que você citou",
    temporal_proximity: "a data bate com a que você citou",
    temporal_proximity_near: "a data fica perto da que você citou",
    recent_activity: "você mexeu nela recentemente",
  },
  effects: {
    reminders_cancelled: "Os lembretes agendados desta tarefa serão cancelados.",
    reminder_created: "Um novo lembrete será agendado.",
    reminders_none: "Esta tarefa não tem lembretes agendados, então nenhum será afetado.",
    reminders_already_scheduled: "Esta tarefa já tem lembretes agendados.",
    leaves_active_lists: "A tarefa sai das suas listas ativas.",
  },
  values: {
    empty: "vazio",
    atApply: "no momento em que você aplicar",
    unrenderableInstant: "data inválida",
  },
  preview: {
    readOnlyNotice: "Nada foi aplicado ainda. Esta é apenas uma previsão.",
    reversible: "Dá para desfazer.",
    notReversible: "Não dá para desfazer.",
    undoWindow: "Você pode desfazer por 24 horas.",
    destructive: "Esta ação é destrutiva.",
    confirmationRequired: "Esta ação precisa da sua confirmação explícita.",
    oneStep: "Um toque aplica.",
    ambiguousOneTitle: "É esta?",
    ambiguousOne: "Encontrei uma tarefa, mas não tenho certeza de que é esta.",
  },
};

const en: TaskCommandCopy = {
  outcomes: {
    applied: { title: "Done", description: "The change was applied." },
    no_change: {
      title: "Nothing to change",
      description: "The task is already exactly how you asked for it, so nothing was changed.",
    },
    ambiguous: {
      title: "I need you to choose",
      description: "I found more than one task this could be.",
    },
    ambiguous_overflow: {
      title: "Too many tasks",
      description: "I found too many tasks to compare safely. Describe the task in more detail.",
    },
    matched_requires_confirmation: {
      title: "Confirm before applying",
      description: "I identified the task. This action needs your explicit confirmation.",
    },
    clarification_requested: {
      title: "One question",
      description: "I need one more detail to find the right task.",
    },
    still_unmatched: {
      title: "I still could not find it",
      description: "Even with your answer, I could not find that task.",
    },
    creation_offered: {
      title: "I can record this",
      description: "I found no matching task, but I can record this as new work.",
    },
    unsupported: {
      title: "I cannot do that yet",
      description: "This request is outside what I can do with tasks.",
    },
    rejected_stale: {
      title: "This changed since you looked",
      description: "The task changed after the preview, so nothing was applied. Here is a fresh preview.",
    },
    rejected_conflict: {
      title: "Another change got there first",
      description: "Another change to this task arrived first. Nothing was applied.",
    },
    refused: { title: "I could not do that", description: "I understood the request but could not apply it." },
  },
  dispositions: {
    previewed: { title: "Preview", description: "This is what would happen. Nothing has been applied yet." },
    matched_requires_confirmation: {
      title: "Confirm before applying",
      description: "I identified the task. This action needs your explicit confirmation.",
    },
    no_change: {
      title: "Nothing to change",
      description: "The task is already exactly how you asked for it, so nothing was changed.",
    },
    rejected_stale: {
      title: "This changed since you looked",
      description: "The task changed since the preview. Check the fresh preview before applying.",
    },
    refused: { title: "I could not do that", description: "I understood the request but could not apply it." },
  },
  refusals: {
    relation_reference_unresolved: {
      title: "I could not identify that item",
      description:
        "I did not find exactly one of your items with that name — either it does not exist, or you have more than one with the same name.",
    },
  },
  actions: {
    complete_task: "complete the task",
    reopen_task: "reopen the task",
    set_status: "change the status",
    cancel_task: "cancel the task",
    restore_task: "restore the task",
    rename_task: "rename the task",
    append_note: "add a note",
    reschedule_due: "change the due date",
    clear_due: "remove the due date",
    set_planned: "change the planned day",
    set_priority: "change the priority",
    assign_project: "link it to a project",
    assign_context: "link it to a context",
    assign_person: "link it to a person",
    set_waiting_on: "mark it as waiting on someone",
  },
  fields: {
    status: "Status",
    completed_at: "Completed at",
    cancelled_at: "Cancelled at",
    title: "Title",
    description: "Description",
    due_at: "Due",
    intentional_no_due: "Intentionally undated",
    no_due_reason: "Reason for no due date",
    planned_at: "Planned for",
    manual_priority: "Priority",
    task_projects: "Project",
    task_contexts: "Context",
    "task_people:involved": "Person involved",
    "task_people:waiting_on": "Waiting on",
    reminders: "Reminders",
  },
  evidence: {
    normalized_exact_title: "the title is exactly what you said",
    normalized_title_phrase: "the title contains what you said",
    normalized_token_overlap: "the title shares words with what you said",
    referenced_project: "it is in the project you named",
    referenced_context: "it is in the context you named",
    referenced_person: "it involves the person you named",
    status_match: "it is in the status you named",
    temporal_proximity: "the date matches the one you named",
    temporal_proximity_near: "the date is close to the one you named",
    recent_activity: "you touched it recently",
  },
  effects: {
    reminders_cancelled: "This task's scheduled reminders will be cancelled.",
    reminder_created: "A new reminder will be scheduled.",
    reminders_none: "This task has no scheduled reminders, so none are affected.",
    reminders_already_scheduled: "This task already has scheduled reminders.",
    leaves_active_lists: "The task leaves your active lists.",
  },
  values: {
    empty: "empty",
    atApply: "when you apply",
    unrenderableInstant: "invalid date",
  },
  preview: {
    readOnlyNotice: "Nothing has been applied yet. This is only a preview.",
    reversible: "This can be undone.",
    notReversible: "This cannot be undone.",
    undoWindow: "You can undo this for 24 hours.",
    destructive: "This action is destructive.",
    confirmationRequired: "This action needs your explicit confirmation.",
    oneStep: "One tap applies it.",
    ambiguousOneTitle: "Is this the one?",
    ambiguousOne: "I found one task, but I am not sure it is this one.",
  },
};

export const taskCommandCopy = { "pt-BR": ptBR, en } satisfies Record<Locale, TaskCommandCopy>;

/**
 * Direct index, no fallback.
 *
 * `Locale` is a closed union, so every value is a key here and the lookup
 * cannot miss. Adding a `?? taskCommandCopy["pt-BR"]` would not make it safer;
 * it would only convert a future compile error into an English speaker silently
 * reading Portuguese.
 */
export function getTaskCommandCopy(locale: Locale): TaskCommandCopy {
  return taskCommandCopy[locale];
}
