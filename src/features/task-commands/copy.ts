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

import type { TaskCommandApplyFailure } from "./errors";
import type { TaskMatchEvidence } from "./match-policy";
import type {
  TaskCommandOutcome,
  TaskCommandPreviewDisposition,
  TaskCommandPreviewRefusal,
  TaskCommandUndoState,
} from "./outcomes";
import type {
  TaskChangedField,
  TaskCommandAction,
  TaskCommandUnsupportedReason,
} from "./taxonomy";
import type { TaskCommandValidationReason } from "./schema";
import type { TaskCommandProviderErrorCode } from "@/lib/ai/task-command-schema";

/** The linked effects a preview can disclose (2E-PREVIEW-003). */
export const TASK_COMMAND_LINKED_EFFECTS = [
  /** Scheduled reminders exist and the transition cancels them. */
  "reminders_cancelled",
  /** A fresh reminder is created, because a future due date survives the change. */
  "reminder_created",
  /** The action touches reminders and the task has none scheduled. */
  "reminders_none",
  /** Cancelling removes the task from the active lists (2E-PREVIEW-003). */
  "leaves_active_lists",
  /**
   * The fourth clause of 2E-DESTRUCTIVE-005, which the other three did not say.
   *
   * "The preview states that a cancelled task leaves the active lists, that its
   * scheduled reminders are cancelled, that it is undoable for 24 hours, **and
   * that it remains restorable afterwards**." The first is
   * `leaves_active_lists`, the second is the reminder pair, the third is
   * `reversible` plus `undoWindowHours` — and until Slice 2E.5 the fourth had no
   * effect kind and no string, so the preview disclosed a 24-hour window and
   * then fell silent about what happens when it closes. That silence is exactly
   * what PRD §3.3 consequence 3 and §23.4 identify as unacceptable: a
   * cancellation the user believes is permanent after a day.
   */
  "restorable_after_undo_window",
] as const;

export type TaskCommandLinkedEffectKind = (typeof TASK_COMMAND_LINKED_EFFECTS)[number];

type OutcomeCopy = { title: string; description: string };

export type TaskCommandCopy = {
  outcomes: Record<TaskCommandOutcome, OutcomeCopy>;
  dispositions: Record<TaskCommandPreviewDisposition, OutcomeCopy>;
  refusals: Record<TaskCommandPreviewRefusal, OutcomeCopy>;
  /**
   * Why an apply did not happen, keyed by `errors.ts`'s declared vocabulary
   * (2E-I18N-003, 2E-UPDATE-017).
   *
   * This closes Slice 2E.3's third open item and is the literal subject of
   * 2E-I18N-003: "Every declared `2E_*` detail code maps to localized copy in
   * both locales, asserted exhaustively against the declared code list rather
   * than against a hand-written key list."
   *
   * One sentence rather than an `OutcomeCopy` pair, on purpose: the title is
   * already supplied by `outcomes[result.outcome]`, and the fourteen failures
   * collapse onto three outcomes (2E-UX-001 declares no more), so a per-failure
   * title would either repeat the outcome's or contradict it. What the failure
   * adds is the *reason*, which is exactly one sentence long.
   *
   * The keys are not 1:1 with the outcomes and never will be — `2E_INVALID_RELATION`
   * and `2E_ACTION_NOT_ENABLED` both present as `refused`, the same collapse the
   * 2C vocabulary makes when three `2C_*` details share one code. The database
   * vocabulary and the UI vocabulary answer different questions.
   *
   * None of these names a task, a title or an id. A failure sentence is rendered
   * on a surface that may have been reached without ownership ever being
   * established — `task_not_found` is precisely that case — and 2E-OWNERSHIP-002
   * requires another owner's task to be indistinguishable from a nonexistent one.
   */
  failures: Record<TaskCommandApplyFailure, string>;
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
  creation: {
    readOnlyNotice: string;
    confirmationRequired: string;
    reversible: string;
    reminderScheduled: string;
    reminderAtCreation: string;
    noReminder: string;
  };
  /**
   * Why a command is outside what the product does (2E-COMMAND-007/017).
   *
   * `outcomes.unsupported` supplies the title; this supplies the reason, and
   * the reason is the whole value of the outcome. "This request is outside what
   * I can do with tasks" told to someone who asked for a recurring task is
   * true, unhelpful, and indistinguishable from the answer they would get for a
   * typo.
   */
  unsupportedReasons: Record<TaskCommandUnsupportedReason, string>;
  /**
   * Why a proposal failed the closed schema (2E-COMMAND-013).
   *
   * These are reached when the model returns something the deterministic
   * validator refuses. None of them names a value — 2E-COMMAND-013 requires a
   * "classified, content-free error", and echoing the offending value back
   * would put model output the schema already rejected in front of the user.
   */
  validation: Record<TaskCommandValidationReason, string>;
  /** Why the parse could not happen at all. A code, never the provider's prose. */
  provider: Record<TaskCommandProviderErrorCode, string>;
  /**
   * 2E-UNDO-007: "Expired and no-longer-available undo are distinct, localized
   * outcomes carrying declared detail codes."
   *
   * Distinct sentences for distinct facts, both read from the operation row
   * rather than from a `P0001` message — see `undo-listing.ts`. `available` is
   * present so the record is exhaustive over the declared vocabulary; it is the
   * label the affordance itself carries.
   */
  undoStates: Record<TaskCommandUndoState, OutcomeCopy>;
  /** The console's own chrome. Free-form: no declared vocabulary behind it. */
  console: {
    eyebrow: string;
    title: string;
    description: string;
    inputLabel: string;
    inputPlaceholder: string;
    submit: string;
    pending: string;
    pendingAnnouncement: string;
    apply: string;
    confirm: string;
    create: string;
    choose: string;
    chooseSubmit: string;
    candidateLegend: string;
    dismiss: string;
    undo: string;
    undone: string;
    retry: string;
    clarifyLabel: string;
    clarifyPlaceholder: string;
    clarifySubmit: string;
    dialogTitle: string;
    dialogCancel: string;
    resultRegionLabel: string;
    previewedState: string;
    sessionExpired: string;
    unauthenticated: string;
    unexpected: string;
    scoreLabel: string;
    evidenceLabel: string;
  };
  /** The cancelled-task recovery surface (2E-DESTRUCTIVE-006). */
  recovery: {
    eyebrow: string;
    title: string;
    description: string;
    empty: string;
    entryPoint: string;
    restore: string;
    cancelledAtLabel: string;
    dueAtLabel: string;
    hasMore: string;
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
  failures: {
    "2E_IDEMPOTENCY_MISMATCH":
      "Esta tentativa reaproveita a identificação de outro pedido. Veja a previsão atualizada e tente de novo.",
    // Names the remedy, and names it as a fresh act rather than as a retry: this
    // failure is not retryable, and "tente de novo" would send the user in a
    // loop that cannot terminate.
    "2E_CONFIRMATION_REQUIRED":
      "Esta ação precisa da sua confirmação. Confira a previsão atualizada e confirme para continuar.",
    // Deliberately does not offer restoration: restoring is the door this refusal
    // closes. It also avoids the word "excluída", because nothing was deleted -
    // the task's criação foi desfeita, which is what the sentence says.
    "2E_CREATION_UNDONE":
      "Esta tarefa saiu das suas listas quando você desfez a criação dela, então não dá mais para trazê-la de volta.",
    "2E_INELIGIBLE_STATUS": "O status atual da tarefa não permite esta ação.",
    "2E_TRANSITION_INTEGRITY":
      "Outra alteração chegou a esta tarefa primeiro, então nada foi alterado. Tente novamente.",
    "2E_REMINDER_INTEGRITY":
      "Os lembretes desta tarefa mudaram durante a alteração, então nada foi alterado. Tente novamente.",
    "2E_INVALID_RELATION": "O item que você citou não é seu ou não existe.",
    "2E_DUE_CONSISTENCY":
      "Esta tarefa está marcada como sem prazo por decisão, então o prazo não pode ser definido deste jeito.",
    "2E_UNDO_RESTORE_INTEGRITY":
      "A tarefa mudou depois desta operação, então desfazer descartaria essa alteração mais recente.",
    "2E_UNDO_REMINDER_INTEGRITY":
      "Não foi possível recriar os lembretes desta operação, então nada foi desfeito.",
    unauthenticated: "Sua sessão expirou. Entre novamente.",
    task_not_found: "Não encontramos esta tarefa.",
    stale_pre_state: "A tarefa mudou desde a previsão, então nada foi aplicado.",
    invalid_payload: "Este pedido chegou fora do formato esperado. Refaça a previsão e tente de novo.",
    // Deliberately does not say "nada foi alterado". This member also catches an
    // error carrying no SQLSTATE — a lost response, which `postgrest-js` reports
    // as a caught fetch failure rather than a rejection — where the write may
    // well have committed. What is safe to promise is the retry, because the
    // operation key makes a replay return the original outcome (2E-UPDATE-005).
    undeclared_failure:
      "Não foi possível confirmar esta alteração. Tente de novo — reenviar não duplica nada.",
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
    leaves_active_lists: "A tarefa sai das suas listas ativas.",
    restorable_after_undo_window:
      "Depois que a janela de desfazer fechar, você ainda pode restaurar esta tarefa.",
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
  creation: {
    readOnlyNotice: "Nada foi criado ainda. Esta é apenas uma previsão.",
    confirmationRequired: "A nova tarefa só será criada depois da sua confirmação explícita.",
    reversible: "Você poderá desfazer a criação por 24 horas.",
    reminderScheduled: "Um lembrete será agendado para esta tarefa.",
    reminderAtCreation: "Um lembrete será agendado assim que a tarefa for criada.",
    noReminder: "Esta tarefa não criará um lembrete.",
  },
  unsupportedReasons: {
    unsupported_action: "Ainda não tenho esse verbo para tarefas.",
    multiple_actions: "Essa frase pede duas mudanças diferentes. Peça uma de cada vez.",
    multiple_targets: "Um comando muda uma tarefa por vez. Diga qual é a tarefa.",
    integration_requested: "Não me conecto a e-mail, calendário ou aplicativos de mensagem.",
    recurrence_requested: "Ainda não trabalho com agendas que se repetem.",
    retroactive_requested: "Não consigo reescrever algo que já aconteceu.",
    not_a_task_command: "Isso não parece uma mudança em uma tarefa.",
    value_not_allowed_for_action:
      "Esse valor existe, mas não para esta ação. Concluir e cancelar têm comandos próprios.",
  },
  validation: {
    invalid_shape: "Não consegui ler isso como um comando. Tente dizer de outro jeito.",
    unknown_field: "Não consegui ler isso como um comando. Tente dizer de outro jeito.",
    value_too_long: "Um dos detalhes é longo demais. Tente uma frase mais curta.",
    value_too_short: "Um dos detalhes chegou vazio. Tente dizer de outro jeito.",
    invalid_value: "Um dos detalhes não é algo que eu consiga usar aqui.",
    target_hints_too_large: "Essa descrição é longa demais para eu buscar. Seja mais específico.",
    forbidden_patch_field: "Essa mudança não pertence a esta ação.",
    missing_patch_field: "Falta uma informação neste comando. Diga para o que mudar.",
    unrecognized_value: "Não tenho um status ou uma prioridade com esse nome.",
  },
  provider: {
    empty_command_text: "Escreva o que você quer mudar.",
    command_text_too_long: "Isso é longo demais. Diga em uma frase.",
    provider_unavailable: "Não consegui ler seu comando agora. Tente de novo.",
    no_structured_output: "Não consegui ler seu comando agora. Tente de novo.",
    invalid_model_output: "Não consegui ler seu comando agora. Tente de novo.",
  },
  undoStates: {
    available: {
      title: "Dá para desfazer",
      description: "Você pode desfazer isto por 24 horas.",
    },
    expired: {
      title: "A janela para desfazer fechou",
      description:
        "Passaram-se mais de 24 horas, então isto não pode mais ser desfeito. Uma tarefa cancelada ainda pode ser restaurada.",
    },
    unavailable: {
      title: "Não há mais nada para desfazer",
      description: "Esta mudança já foi desfeita.",
    },
  },
  console: {
    eyebrow: "COMANDOS",
    title: "Mude uma tarefa com suas palavras",
    description: "Diga o que mudou. Eu mostro exatamente o que acontece antes de acontecer.",
    inputLabel: "O que mudou?",
    inputPlaceholder: "ex.: marque a tarefa do relatório como feita",
    submit: "Enviar",
    pending: "Lendo…",
    pendingAnnouncement: "Lendo seu comando.",
    apply: "Aplicar",
    confirm: "Sim, cancelar esta tarefa",
    create: "Criar a tarefa",
    choose: "Qual delas você quis dizer?",
    chooseSubmit: "Usar esta",
    candidateLegend: "Tarefas correspondentes",
    dismiss: "Descartar",
    undo: "Desfazer",
    undone: "Desfeito.",
    retry: "Tentar de novo",
    clarifyLabel: "Qual tarefa você quis dizer?",
    clarifyPlaceholder: "ex.: a nota fiscal da Acme",
    clarifySubmit: "Responder",
    dialogTitle: "Confirme este cancelamento",
    dialogCancel: "Manter a tarefa",
    resultRegionLabel: "Resultado do comando",
    previewedState: "Previsão pronta.",
    sessionExpired: "Sua sessão expirou. Entre de novo e tente outra vez.",
    unauthenticated: "Sua sessão expirou. Entre de novo e tente outra vez.",
    unexpected: "Algo deu errado e nada foi alterado. Tente de novo.",
    scoreLabel: "Pontuação",
    evidenceLabel: "Por que esta",
  },
  recovery: {
    eyebrow: "RECUPERAÇÃO",
    title: "Tarefas canceladas",
    description:
      "Tarefas que você cancelou. Restaurar uma devolve ela às suas listas ativas e reagenda o lembrete, se ainda houver um prazo futuro.",
    empty: "Você não cancelou nenhuma tarefa.",
    entryPoint: "Tarefas canceladas",
    restore: "Restaurar",
    cancelledAtLabel: "Cancelada",
    dueAtLabel: "Prazo",
    hasMore: "Há mais tarefas canceladas do que cabem aqui.",
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
  failures: {
    "2E_IDEMPOTENCY_MISMATCH":
      "This attempt reuses another request's identifier. Check the fresh preview and try again.",
    "2E_CONFIRMATION_REQUIRED":
      "This action needs your confirmation. Check the fresh preview and confirm to continue.",
    "2E_CREATION_UNDONE":
      "This task left your lists when you undid its creation, so it can no longer be brought back.",
    "2E_INELIGIBLE_STATUS": "The task's current status does not allow this action.",
    "2E_TRANSITION_INTEGRITY":
      "Another change reached this task first, so nothing was changed. Try again.",
    "2E_REMINDER_INTEGRITY":
      "This task's reminders changed while it was being updated, so nothing was changed. Try again.",
    "2E_INVALID_RELATION": "The item you named is not yours, or does not exist.",
    "2E_DUE_CONSISTENCY":
      "This task is marked as intentionally undated, so a due date cannot be set this way.",
    "2E_UNDO_RESTORE_INTEGRITY":
      "The task changed after this operation, so undoing it would discard that newer change.",
    "2E_UNDO_REMINDER_INTEGRITY":
      "This operation's reminders could not be re-created, so nothing was undone.",
    unauthenticated: "Your session expired. Sign in again.",
    task_not_found: "We could not find this task.",
    stale_pre_state: "The task changed since the preview, so nothing was applied.",
    invalid_payload: "This request did not arrive in the expected shape. Build a fresh preview and try again.",
    // See the pt-BR entry: this must not claim nothing changed.
    undeclared_failure:
      "We could not confirm this change. Try again — resubmitting will not duplicate it.",
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
    leaves_active_lists: "The task leaves your active lists.",
    restorable_after_undo_window:
      "After the undo window closes, you can still restore this task.",
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
  creation: {
    readOnlyNotice: "Nothing has been created yet. This is only a preview.",
    confirmationRequired: "The new task will be created only after your explicit confirmation.",
    reversible: "You will be able to undo the creation for 24 hours.",
    reminderScheduled: "A reminder will be scheduled for this task.",
    reminderAtCreation: "A reminder will be scheduled as soon as the task is created.",
    noReminder: "This task will not create a reminder.",
  },
  unsupportedReasons: {
    unsupported_action: "I do not have that verb for tasks yet.",
    multiple_actions: "That sentence asks for two different changes. Ask for one at a time.",
    multiple_targets: "A command changes one task at a time. Name a single task.",
    integration_requested: "I do not connect to email, calendar or messaging apps.",
    recurrence_requested: "I do not handle repeating schedules yet.",
    retroactive_requested: "I cannot rewrite something that already happened.",
    not_a_task_command: "That does not look like a change to a task.",
    value_not_allowed_for_action:
      "That value exists, but not for this action. Completing and cancelling have their own commands.",
  },
  validation: {
    invalid_shape: "I could not read that as a command. Try phrasing it differently.",
    unknown_field: "I could not read that as a command. Try phrasing it differently.",
    value_too_long: "One of the details is too long. Try a shorter phrasing.",
    value_too_short: "One of the details came through empty. Try phrasing it differently.",
    invalid_value: "One of the details is not something I can use here.",
    target_hints_too_large: "That description is too long for me to search on. Be more specific.",
    forbidden_patch_field: "That change does not belong to this action.",
    missing_patch_field: "That command is missing something it needs. Say what to change it to.",
    unrecognized_value: "I do not have a status or priority by that name.",
  },
  provider: {
    empty_command_text: "Write what you want to change.",
    command_text_too_long: "That is too long. Say it in a sentence.",
    provider_unavailable: "I could not read your command right now. Try again.",
    no_structured_output: "I could not read your command right now. Try again.",
    invalid_model_output: "I could not read your command right now. Try again.",
  },
  undoStates: {
    available: {
      title: "Undo available",
      description: "You can undo this for 24 hours.",
    },
    expired: {
      title: "The undo window has closed",
      description:
        "More than 24 hours have passed, so this can no longer be undone. A cancelled task can still be restored.",
    },
    unavailable: {
      title: "Nothing left to undo",
      description: "This change was already undone.",
    },
  },
  console: {
    eyebrow: "COMMANDS",
    title: "Change a task in your own words",
    description: "Say what changed. I will show you exactly what happens before anything does.",
    inputLabel: "What changed?",
    inputPlaceholder: "e.g. mark the report task as done",
    submit: "Send",
    pending: "Reading…",
    pendingAnnouncement: "Reading your command.",
    apply: "Apply",
    confirm: "Yes, cancel this task",
    create: "Create the task",
    choose: "Which one did you mean?",
    chooseSubmit: "Use this one",
    candidateLegend: "Matching tasks",
    dismiss: "Discard",
    undo: "Undo",
    undone: "Undone.",
    retry: "Try again",
    clarifyLabel: "Which task did you mean?",
    clarifyPlaceholder: "e.g. the invoice for Acme",
    clarifySubmit: "Answer",
    dialogTitle: "Confirm this cancellation",
    dialogCancel: "Keep the task",
    resultRegionLabel: "Command result",
    previewedState: "Preview ready.",
    sessionExpired: "Your session expired. Sign in and try again.",
    unauthenticated: "Your session expired. Sign in and try again.",
    unexpected: "Something went wrong and nothing was changed. Try again.",
    scoreLabel: "Match score",
    evidenceLabel: "Why this one",
  },
  recovery: {
    eyebrow: "RECOVERY",
    title: "Cancelled tasks",
    description:
      "Tasks you cancelled. Restoring one puts it back in your active lists and schedules its reminder again if it still has a future due date.",
    empty: "You have not cancelled any task.",
    entryPoint: "Cancelled tasks",
    restore: "Restore",
    cancelledAtLabel: "Cancelled",
    dueAtLabel: "Due",
    hasMore: "There are more cancelled tasks than fit here.",
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
