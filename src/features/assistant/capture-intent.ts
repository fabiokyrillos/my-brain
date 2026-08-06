/**
 * Does this utterance ask the assistant to *file* something as an entry?
 *
 * Deterministic and declared, exactly like `memory-intent.ts` — 2G-CAPTURE-001
 * requires the routing decision to be data in this module rather than a
 * heuristic inside a prompt, because the branch it selects **writes**. That is
 * the one way capture differs from every other composer route: the memory
 * branch proposes, the command branch previews, and this one persists the
 * owner's own words the moment it fires.
 *
 * The error costs are therefore not symmetric, and the rule is tuned for it:
 *
 * 1. **A false positive costs a stored entry and one interpretation** — the
 *    owner's own sentence, in their Inbox, deletable. Not free, so the openers
 *    are explicit imperatives and nothing else.
 * 2. **A false negative costs nothing** — the utterance continues to the
 *    command parse and then to the knowledge answer, which is where it went
 *    before this slice existed.
 *
 * **The ambiguity rule is the substance of 2G-CAPTURE-002** (study R6): a
 * sentence that opens with a filing imperative *and* names a task is asking
 * for two different objects, and this module refuses to choose between them.
 * "Registre que preciso enviar o relatório" files an entry; "registre uma
 * tarefa para revisar os números" asks, because guessing there means the owner
 * wanted a task and got a note, or the reverse — silently, with a write
 * already done.
 *
 * Locale-free, for the reason `memory-intent.ts` gives: a bilingual owner
 * types in whichever language the thought arrived in.
 */

import { normalize } from "./memory-intent";

/**
 * Imperative openers that mean "file this", unaccented and lowercase — the
 * form `normalize` produces.
 *
 * Every entry is an instruction to record. Phrasings that merely narrate
 * ("eu registrei", "I noted") are absent by design, on `MEMORY_OPENERS`' own
 * reasoning, and so are the openers that belong to a neighbouring route:
 * "lembre…" is memory's, and "adicione uma tarefa…" is the model's create
 * classification.
 */
export const CAPTURE_OPENERS = [
  // pt-BR
  "registre que",
  "registre isso",
  "registre:",
  "anote que",
  "anote isso",
  "anote:",
  "apenas registre",
  "so registre",
  // en
  "capture that",
  "capture this",
  "note that",
  "make a note",
  "take a note",
  "jot down",
  "log that",
] as const;

/**
 * Words that name a task explicitly, in either language.
 *
 * Deliberately narrow. A broad list ("fazer", "do", "todo") would make the
 * ambiguity branch swallow ordinary filing — "registre que preciso fazer o
 * relatório" is a note about work, not a request for a task row — and an
 * ambiguity prompt for every second capture is a worse product than the
 * occasional wrong object the confirmation step can undo.
 */
export const CAPTURE_TASK_WORDS = ["tarefa", "tarefas", "task", "tasks"] as const;

export type CaptureIntentDecision = "capture" | "ambiguous" | "none";

export function classifyCaptureIntent(text: string): CaptureIntentDecision {
  const normalized = normalize(text);
  if (normalized === "") return "none";
  // A question is answered, never filed — `memory-intent.ts`'s rule, for the
  // same reason and with more at stake, because this branch writes.
  if (normalized.endsWith("?")) return "none";
  if (!CAPTURE_OPENERS.some((opener) => normalized.startsWith(opener))) return "none";
  // Word-boundary matched: "tarefas" must count and "multitarefa" must not
  // decide anything about a sentence that never mentioned a task.
  const namesATask = CAPTURE_TASK_WORDS.some((word) =>
    new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, "u").test(normalized),
  );
  return namesATask ? "ambiguous" : "capture";
}
