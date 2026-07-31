import { withAgentName } from "@/lib/agent-name";
import type { Locale } from "@/lib/preferences";
import type {
  HistoryActionType,
  HistoryActor,
  HistoryCategory,
  HistoryEntityType,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "./vocabulary";

/**
 * The History surface's copy (UX-13, UX-21, UX-22, UX-28).
 *
 * ## What this replaces
 *
 * `history/page.tsx` previously rendered `action_type.replaceAll("_", " ")` as
 * the heading, `audit_logs.reason` as the body, and `actor · entity_type · date`
 * beneath. Three of those four are raw database vocabulary and the fourth is
 * English prose authored in SQL, so a pt-BR reader saw:
 *
 *     task updated
 *     Task state changed
 *     user · task · 30 de jul. de 2026 21:14
 *
 * Everything visible there came out of a column verbatim. This module gives each
 * of those tokens a sentence in both locales, and `reason` stops being rendered.
 *
 * ## Why `reason` is not here
 *
 * UX-28 asks that `reason` be shown only when it "contributes distinct, safe and
 * meaningful context". Every value any writer in this build can produce was read
 * and compared against the localized sentence that replaces it:
 *
 * | `reason` | the sentence it would sit beneath |
 * | --- | --- |
 * | `Task created` | "Você criou a tarefa …" |
 * | `Task state changed` | "Você alterou a tarefa …" |
 * | `User confirmed task candidates from an interpreted entry` | "Você confirmou a tarefa a partir de um registro" |
 * | `User executed the stored compensating operation` | "Você desfez uma alteração" |
 * | `Grounded answer generated from internal knowledge` | "O {agent} respondeu a uma conversa" |
 * | `Owner edited the project from its detail page` | "Você alterou o projeto …" |
 * | `Owner archived the memory, ending its validity` | "Você arquivou a memória …" |
 *
 * Not one of them carries a fact the sentence does not. So the honest answer to
 * "when does `reason` add distinct context" is **never, for any value any writer
 * currently produces**, and rendering it would be exposing internal wording
 * solely because it exists. It stays in the table, where the audit trail wants
 * it, and out of the page. `copy.test.ts` pins that conclusion to the writers it
 * was drawn from, so a future writer with a genuinely informative `reason`
 * fails the test rather than silently inheriting this decision.
 */

/** A field inside `before_state`/`after_state` worth describing to a person. */
export const HISTORY_CHANGE_FIELDS = [
  "status",
  "priority",
  "due_at",
  "planned_at",
  "title",
  "description",
  "content",
  "name",
] as const;
export type HistoryChangeField = (typeof HISTORY_CHANGE_FIELDS)[number];

export type HistoryCopy = {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  /** Who acted. `{agent}` is substituted with the configured assistant name. */
  readonly actors: Readonly<Record<HistoryActor, string>>;
  /** What the change was about, used for the filter menu and the subject link. */
  readonly entityTypes: Readonly<Record<HistoryEntityType, string>>;
  /**
   * The verb phrase, already carrying its object noun.
   *
   * Each is a small template. `{subject}` is the object's own name, and a
   * `[…]` segment is kept when that name is known and dropped whole when it is
   * not — which is what lets the name sit in the right place instead of being
   * appended to the end. "confirmou a tarefa “Preparar relatório” a partir de um
   * registro" is a sentence; "confirmou a tarefa a partir de um registro
   * “Preparar relatório”" says the *record* is called that.
   *
   * Actions whose entity type has no detail route carry no `[…]` segment at
   * all, because their subject is never resolved.
   *
   * ## UX-27 — why `task_created` is not "criou a tarefa"
   *
   * One task creation writes **two** rows, and they are not a mistake:
   *
   * - `tasks_audit_changes`, the `AFTER INSERT` trigger on `public.tasks`
   *   (`202607160014:30`), writes `task_created` with the row's initial state.
   *   Every writer of `public.tasks` produces it.
   * - the RPC that performed the creation writes its own row naming the
   *   operation — `task_command_created`, or `tasks_confirmed` when the task
   *   came from confirming a candidate.
   *
   * `202607260058:1552-1558` states the pairing outright: one row "names the
   * operation and carries the whole before/after payload", the other is "what
   * every other writer of `public.tasks` already produces". Distinct action
   * types, distinct meanings, one transaction.
   *
   * The first draft of this map gave both "criou a tarefa", which reproduced
   * UX-27 exactly — the live journey found the same sentence twice on the page.
   * They now read at the two altitudes they actually occupy: the operation the
   * owner performed, and the task entering the list. No row is hidden, and no
   * row is deduplicated by a timestamp heuristic.
   *
   * This is presentation, not a root fix. Collapsing the pair into one event
   * needs a shared operation key on `audit_logs`, which is a migration and is
   * outside this slice's read-only authorization — recorded in the slice report.
   */
  readonly actions: Readonly<Record<HistoryActionType, string>>;
  /** For an `action_type` written after this build shipped. */
  readonly unknownAction: string;
  readonly categories: Readonly<Record<HistoryCategory, string>>;
  /** The field as a standalone list label — "Prioridade". */
  readonly fields: Readonly<Record<HistoryChangeField, string>>;
  /**
   * The field as it appears inside `changeSentence` — "a prioridade", "o prazo".
   *
   * Separate from `fields` because Portuguese needs the definite article and
   * its gender varies by noun, while a `<dt>` label wants the bare noun. Folding
   * the two produced "Você alterou prazo", which is not a sentence.
   */
  readonly fieldsInSentence: Readonly<Record<HistoryChangeField, string>>;
  readonly taskStatuses: Readonly<Record<TaskStatus, string>>;
  readonly projectStatuses: Readonly<Record<ProjectStatus, string>>;
  readonly taskPriorities: Readonly<Record<TaskPriority, string>>;
  /** A single-field change, read as one sentence. */
  readonly changeSentence: string;
  /** The same, when the object's own name could not be resolved. */
  readonly changeSentenceWithoutSubject: string;
  /** A value that was absent before or is absent now. */
  readonly noValue: string;
  readonly subject: {
    readonly open: string;
    /** The row is kept; only the link is withheld. */
    readonly unavailable: string;
    readonly noRoute: string;
  };
  readonly filters: {
    readonly legend: string;
    readonly toggle: string;
    readonly from: string;
    readonly to: string;
    readonly actor: string;
    readonly entityType: string;
    readonly category: string;
    readonly anyActor: string;
    readonly anyEntityType: string;
    readonly anyCategory: string;
    readonly apply: string;
    readonly clear: string;
    readonly activeLegend: string;
    readonly subjectFilter: string;
    readonly ignored: string;
  };
  readonly empty: {
    readonly title: string;
    readonly body: string;
    readonly filteredTitle: string;
    readonly filteredBody: string;
  };
};

const ptBR: HistoryCopy = {
  eyebrow: "TRANSPARÊNCIA",
  title: "Histórico de alterações",
  intro: "Quem fez o quê, quando e sobre qual objeto.",
  actors: { user: "Você", agent: "O {agent}", system: "O sistema" },
  entityTypes: {
    task: "tarefa",
    entry: "registro",
    entry_interpretation: "interpretação",
    entry_task_candidate_resolution: "sugestão de tarefa",
    pending_question: "pergunta",
    conversation: "conversa",
    project: "projeto",
    person: "pessoa",
    memory: "memória",
  },
  actions: {
    archive_memory: "arquivou a memória[ “{subject}”]",
    chat_answered: "respondeu à conversa[ “{subject}”]",
    confirm_entry_task_candidates_v5: "confirmou tarefas sugeridas em um registro",
    confirm_entry_task_candidates_v6: "confirmou tarefas sugeridas em um registro",
    create_memory: "criou a memória[ “{subject}”]",
    entry_interpretation_corrected: "corrigiu a interpretação de um registro",
    entry_interpretation_correction_undone: "desfez a correção de uma interpretação",
    entry_interpretation_failed: "não conseguiu interpretar o registro[ “{subject}”]",
    entry_interpreted: "interpretou o registro[ “{subject}”]",
    entry_processing_enqueued: "enviou o registro[ “{subject}”] para interpretação",
    entry_reprocessed: "reinterpretou um registro",
    entry_reprocessing_enqueued: "pediu a reinterpretação do registro[ “{subject}”]",
    entry_reprocessing_failed: "não conseguiu reinterpretar o registro[ “{subject}”]",
    operation_undone: "desfez uma alteração[ em “{subject}”]",
    question_consequence_confirmed: "confirmou a consequência de uma resposta",
    resolve_pending_question_v1: "respondeu a uma pergunta pendente",
    resolve_pending_question_v2: "respondeu a uma pergunta pendente",
    resolve_pending_question_v3: "respondeu a uma pergunta pendente",
    restore_memory: "reativou a memória[ “{subject}”]",
    task_command_applied: "alterou a tarefa[ “{subject}”]",
    task_command_created: "criou a tarefa[ “{subject}”]",
    // Not "criou a tarefa": see the UX-27 note above the `actions` type.
    task_created: "adicionou a tarefa[ “{subject}”] à lista",
    task_updated: "atualizou a tarefa[ “{subject}”]",
    tasks_confirmed: "confirmou a tarefa[ “{subject}”] a partir de um registro",
    update_memory: "alterou a memória[ “{subject}”]",
    update_person: "alterou a pessoa[ “{subject}”]",
    update_project: "alterou o projeto[ “{subject}”]",
  },
  unknownAction: "registrou uma alteração[ em “{subject}”]",
  categories: {
    created: "Criação",
    changed: "Alteração",
    lifecycle: "Arquivamento",
    interpreted: "Interpretação",
    answered: "Resposta",
    undone: "Desfazer",
    failed: "Falha",
  },
  fields: {
    status: "Situação",
    priority: "Prioridade",
    due_at: "Prazo",
    planned_at: "Data planejada",
    title: "Título",
    description: "Descrição",
    content: "Conteúdo",
    name: "Nome",
  },
  fieldsInSentence: {
    status: "a situação",
    priority: "a prioridade",
    due_at: "o prazo",
    planned_at: "a data planejada",
    title: "o título",
    description: "a descrição",
    content: "o conteúdo",
    name: "o nome",
  },
  taskStatuses: {
    inbox: "Caixa de entrada",
    todo: "A fazer",
    in_progress: "Em andamento",
    waiting: "Aguardando",
    blocked: "Bloqueada",
    deferred: "Adiada",
    completed: "Concluída",
    cancelled: "Cancelada",
  },
  projectStatuses: {
    active: "Ativo",
    paused: "Pausado",
    completed: "Concluído",
    archived: "Arquivado",
  },
  taskPriorities: { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" },
  changeSentence: "{actor} alterou {field} de “{subject}” de {from} para {to}",
  changeSentenceWithoutSubject: "{actor} alterou {field} de {from} para {to}",
  noValue: "sem valor",
  subject: {
    open: "Abrir",
    unavailable: "Este item não está mais disponível.",
    noRoute: "Este tipo de item não tem página própria.",
  },
  filters: {
    legend: "Filtrar histórico",
    toggle: "Filtros",
    from: "De",
    to: "Até",
    actor: "Quem",
    entityType: "Tipo de item",
    category: "Tipo de ação",
    anyActor: "Qualquer pessoa",
    anyEntityType: "Qualquer item",
    anyCategory: "Qualquer ação",
    apply: "Aplicar filtros",
    clear: "Limpar filtros",
    activeLegend: "Filtros ativos",
    subjectFilter: "Um item específico",
    ignored: "Alguns filtros do endereço não foram reconhecidos e foram ignorados.",
  },
  empty: {
    title: "Nenhuma alteração",
    body: "Ações suas, do assistente e do sistema aparecem aqui.",
    filteredTitle: "Nada encontrado",
    filteredBody: "Nenhuma alteração corresponde a estes filtros. Tente ampliar o período.",
  },
};

const en: HistoryCopy = {
  eyebrow: "TRANSPARENCY",
  title: "Change history",
  intro: "Who did what, when, and to which object.",
  actors: { user: "You", agent: "{agent}", system: "The system" },
  entityTypes: {
    task: "task",
    entry: "record",
    entry_interpretation: "interpretation",
    entry_task_candidate_resolution: "suggested task",
    pending_question: "question",
    conversation: "conversation",
    project: "project",
    person: "person",
    memory: "memory",
  },
  actions: {
    archive_memory: "archived the memory[ “{subject}”]",
    chat_answered: "answered the conversation[ “{subject}”]",
    confirm_entry_task_candidates_v5: "confirmed tasks suggested in a record",
    confirm_entry_task_candidates_v6: "confirmed tasks suggested in a record",
    create_memory: "created the memory[ “{subject}”]",
    entry_interpretation_corrected: "corrected a record's interpretation",
    entry_interpretation_correction_undone: "undid an interpretation correction",
    entry_interpretation_failed: "could not interpret the record[ “{subject}”]",
    entry_interpreted: "interpreted the record[ “{subject}”]",
    entry_processing_enqueued: "sent the record[ “{subject}”] for interpretation",
    entry_reprocessed: "reinterpreted a record",
    entry_reprocessing_enqueued: "asked for the record[ “{subject}”] to be reinterpreted",
    entry_reprocessing_failed: "could not reinterpret the record[ “{subject}”]",
    operation_undone: "undid a change[ to “{subject}”]",
    question_consequence_confirmed: "confirmed the consequence of an answer",
    resolve_pending_question_v1: "answered a pending question",
    resolve_pending_question_v2: "answered a pending question",
    resolve_pending_question_v3: "answered a pending question",
    restore_memory: "reactivated the memory[ “{subject}”]",
    task_command_applied: "changed the task[ “{subject}”]",
    task_command_created: "created the task[ “{subject}”]",
    // Not "created the task": see the UX-27 note above the `actions` type.
    task_created: "added the task[ “{subject}”] to the list",
    task_updated: "updated the task[ “{subject}”]",
    tasks_confirmed: "confirmed the task[ “{subject}”] from a record",
    update_memory: "changed the memory[ “{subject}”]",
    update_person: "changed the person[ “{subject}”]",
    update_project: "changed the project[ “{subject}”]",
  },
  unknownAction: "recorded a change[ to “{subject}”]",
  categories: {
    created: "Created",
    changed: "Changed",
    lifecycle: "Archiving",
    interpreted: "Interpretation",
    answered: "Answered",
    undone: "Undone",
    failed: "Failed",
  },
  fields: {
    status: "State",
    priority: "Priority",
    due_at: "Due date",
    planned_at: "Planned date",
    title: "Title",
    description: "Description",
    content: "Content",
    name: "Name",
  },
  fieldsInSentence: {
    status: "the state",
    priority: "the priority",
    due_at: "the due date",
    planned_at: "the planned date",
    title: "the title",
    description: "the description",
    content: "the content",
    name: "the name",
  },
  taskStatuses: {
    inbox: "Inbox",
    todo: "To do",
    in_progress: "In progress",
    waiting: "Waiting",
    blocked: "Blocked",
    deferred: "Deferred",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  projectStatuses: {
    active: "Active",
    paused: "Paused",
    completed: "Completed",
    archived: "Archived",
  },
  taskPriorities: { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" },
  changeSentence: "{actor} changed {field} of “{subject}” from {from} to {to}",
  changeSentenceWithoutSubject: "{actor} changed {field} from {from} to {to}",
  noValue: "no value",
  subject: {
    open: "Open",
    unavailable: "This item is no longer available.",
    noRoute: "This kind of item has no page of its own.",
  },
  filters: {
    legend: "Filter history",
    toggle: "Filters",
    from: "From",
    to: "To",
    actor: "Who",
    entityType: "Item type",
    category: "Action type",
    anyActor: "Anyone",
    anyEntityType: "Any item",
    anyCategory: "Any action",
    apply: "Apply filters",
    clear: "Clear filters",
    activeLegend: "Active filters",
    subjectFilter: "One specific item",
    ignored: "Some filters in the address were not recognised and were ignored.",
  },
  empty: {
    title: "No changes",
    body: "Your actions, the assistant's, and the system's appear here.",
    filteredTitle: "Nothing found",
    filteredBody: "No change matches these filters. Try widening the date range.",
  },
};

export const historyCopy = { "pt-BR": ptBR, en } as const satisfies Record<Locale, HistoryCopy>;

/**
 * @param agentName the assistant's configured name (UX-06). Required, so the
 * compiler finds any surface that would otherwise render a hardcoded one.
 */
export function getHistoryCopy(locale: Locale, agentName: string): HistoryCopy {
  return withAgentName(historyCopy[locale], agentName);
}
