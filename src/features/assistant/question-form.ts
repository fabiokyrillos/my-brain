/**
 * Life Brain B.2 — `LB-B-009`: a question skips the task-command parse.
 *
 * Every turn that was not a memory, capture or agenda sentence used to pay for
 * `parseTaskCommand` first, and only a `not_a_task_command` answer let it reach
 * the knowledge path: two text-model calls for one question
 * (`docs/reports/life-brain/AUDIT_CHAT_RETRIEVAL.md` §1). This reads the two
 * surface facts that decide it without a model:
 *
 *  - **question form** — the sentence ends with "?" or opens with an
 *    interrogative ("quando", "quais", "o que", "what", "is"…);
 *  - **a change verb** — any of the verbs the command vocabulary acts on
 *    (concluir, marcar, adiar, mover, criar… / complete, mark, move, create…).
 *
 * Only *question form without a change verb* goes straight to knowledge. A
 * polite command ("pode concluir a tarefa do exame?") keeps the parse, and so
 * does a statement with no "?" ("preciso comprar leite amanhã"), which the
 * command model may read as an implicit task. The rule fails toward the old
 * path: a sentence it does not recognise costs what it cost before.
 *
 * Pure and deterministic: no model, no I/O.
 */

/** Lowercase, accents removed, whitespace collapsed. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * Openers, compared after `normalize`. Multi-word openers come first in their
 * own list so "o que" is not read as the article "o". The English auxiliaries
 * ("is", "are", "do"…) open a question only at the start of the sentence, which
 * is the only place they are checked.
 */
const INTERROGATIVE_OPENERS = [
  "o que", "por que", "pra que", "para que", "sera que", "e o", "e a", "e os", "e as",
  "quando", "quais", "qual", "quem", "onde", "aonde", "como", "quanto", "quantos", "quantas", "quanta", "porque", "cade",
  "what", "when", "which", "who", "whom", "whose", "where", "why", "how",
  "is", "are", "was", "were", "do", "does", "did", "have", "has", "had",
] as const;

/*
 * The verbs a task command performs, in the forms a sentence uses them —
 * infinitive, imperative, third person and the gerund/participle where they
 * differ. Compared as whole words after `normalize`. The list errs wide: a verb
 * here keeps a sentence on the command path, which is the old behaviour. "pôr"
 * is absent on purpose — normalized it is "por", and "por que…?" is the most
 * common way to open a question.
 */
const CHANGE_VERBS = [
  // pt-BR
  "concluir", "conclua", "conclui", "concluido", "concluida",
  "marcar", "marque", "marca", "marcado",
  "finalizar", "finalize", "finaliza", "terminar", "termine", "termina", "fechar", "feche",
  "adiar", "adie", "adia", "postergar", "posterga", "reagendar", "reagende", "remarcar", "remarque",
  "mover", "mova", "move", "passar", "passe", "jogar", "jogue",
  "cancelar", "cancele", "cancela", "reabrir", "reabra", "reabre",
  "renomear", "renomeie", "renomeia", "mudar", "mude", "muda", "alterar", "altere", "altera", "trocar", "troque", "troca",
  "definir", "defina", "define", "colocar", "coloque", "coloca", "ponha", "bota", "botar",
  "criar", "crie", "cria", "adicionar", "adicione", "adiciona", "incluir", "inclua",
  "aguardar", "aguarde", "esperar", "espere", "retomar", "retome", "retoma",
  "apagar", "apague", "apaga", "excluir", "exclua", "exclui", "remover", "remova", "remove", "deletar", "delete",
  "priorizar", "priorize", "vincular", "vincule", "ligar", "ligue", "desvincular", "desvincule",
  // en
  "complete", "completed", "mark", "finish", "close", "done",
  "postpone", "defer", "reschedule", "move", "push",
  "cancel", "reopen", "rename", "change", "set", "update", "edit",
  "create", "add", "make", "wait", "resume", "delete", "remove", "prioritize", "link", "unlink",
] as const;

const CHANGE_VERB_SET: ReadonlySet<string> = new Set(CHANGE_VERBS);

function opensAsQuestion(normalized: string): boolean {
  return INTERROGATIVE_OPENERS.some((opener) => normalized === opener || normalized.startsWith(`${opener} `));
}

export function hasChangeVerb(text: string): boolean {
  const words = normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.some((word) => CHANGE_VERB_SET.has(word));
}

export function hasQuestionForm(text: string): boolean {
  const normalized = normalize(text);
  if (normalized.length === 0) return false;
  return normalized.endsWith("?") || opensAsQuestion(normalized.replace(/^[¿"'“(]+/u, ""));
}

/** `LB-B-009`: a question that asks for no change needs no command parse. */
export function isPlainQuestion(text: string): boolean {
  return hasQuestionForm(text) && !hasChangeVerb(text);
}
