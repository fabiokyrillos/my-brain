import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "./taxonomy";

/**
 * The declared bilingual vocabulary for the two enumerable target values.
 *
 * PRD Goal 1 is that a user acts on a task "in their own words, in pt-BR or
 * English". `status` and `priority` are the only patch values drawn from a
 * closed database vocabulary, and that vocabulary is English — so without this
 * module a Portuguese-first product refuses "marque como bloqueada" and
 * "prioridade alta", which are ordinary sentences in the product's primary
 * language.
 *
 * The phase already accepted this obligation for time (2E-COMMAND-014 mandates
 * a declared closed bilingual lexicon with an explicit version). Status and
 * priority have the identical shape of problem and get the identical treatment:
 * a declared, closed, versioned table — not a model translation. Asking the
 * model to translate would put a domain decision back inside the thing PRD §6.1
 * says only proposes.
 *
 * Closed by construction: every entry maps to a literal the database CHECK
 * already accepts, and an unrecognized word resolves to null rather than to a
 * guess.
 */

/** Bumped with the policy version whenever an entry is added or re-pointed. */
export const TASK_VOCABULARY_VERSION = "2026-07-25.1";

/** Accent-folded, lowercased, punctuation-collapsed — the temporal module's rule. */
export function normalizeVocabularyTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STATUS_TERMS: Record<string, TaskStatus> = {
  // English — the canonical literals themselves, so a model that obeys the
  // prompt round-trips unchanged.
  inbox: "inbox",
  todo: "todo",
  "to do": "todo",
  "not started": "todo",
  in_progress: "in_progress",
  "in progress": "in_progress",
  started: "in_progress",
  doing: "in_progress",
  waiting: "waiting",
  "waiting on": "waiting",
  blocked: "blocked",
  deferred: "deferred",
  postponed: "deferred",
  // The two terminal statuses are in the vocabulary even though no action may
  // *patch* them: they are legitimate target hints ("the completed report
  // task"), and — load-bearing — `set_status` carrying "cancelled" must be
  // refused as `value_not_allowed_for_action`, the reason that says "this
  // action may not reach that state". Leaving them out would refuse it as
  // `unrecognized_value`, which claims this product has no such status and
  // hides the destructive guard behind a false statement.
  completed: "completed",
  done: "completed",
  finished: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  // pt-BR
  caixa: "inbox",
  entrada: "inbox",
  "a fazer": "todo",
  pendente: "todo",
  "nao iniciada": "todo",
  "nao iniciado": "todo",
  "em andamento": "in_progress",
  "em progresso": "in_progress",
  fazendo: "in_progress",
  iniciada: "in_progress",
  iniciado: "in_progress",
  aguardando: "waiting",
  esperando: "waiting",
  bloqueada: "blocked",
  bloqueado: "blocked",
  adiada: "deferred",
  adiado: "deferred",
  postergada: "deferred",
  postergado: "deferred",
  concluida: "completed",
  concluido: "completed",
  finalizada: "completed",
  finalizado: "completed",
  feita: "completed",
  feito: "completed",
  cancelada: "cancelled",
  cancelado: "cancelled",
};

const PRIORITY_TERMS: Record<string, TaskPriority> = {
  low: "low",
  medium: "medium",
  normal: "medium",
  high: "high",
  urgent: "urgent",
  critical: "urgent",
  // pt-BR
  baixa: "low",
  baixo: "low",
  media: "medium",
  medio: "medium",
  normalidade: "medium",
  alta: "high",
  alto: "high",
  urgente: "urgent",
  critica: "urgent",
  critico: "urgent",
};

/**
 * `term` as a database status literal, or null when it names none.
 *
 * Null is a real answer — "the word the user used is not a status we have" —
 * and the caller reports it as its own reason. Guessing the nearest status
 * would silently move a task to a state the user never asked for.
 */
export function resolveStatusTerm(term: string): TaskStatus | null {
  return STATUS_TERMS[normalizeVocabularyTerm(term)] ?? null;
}

export function resolvePriorityTerm(term: string): TaskPriority | null {
  return PRIORITY_TERMS[normalizeVocabularyTerm(term)] ?? null;
}

/** Every canonical literal is reachable from at least its own name. */
export function vocabularyCoversEveryLiteral(): boolean {
  return (
    TASK_STATUSES.every((status) => resolveStatusTerm(status) === status)
    && TASK_PRIORITIES.every((priority) => resolvePriorityTerm(priority) === priority)
  );
}
