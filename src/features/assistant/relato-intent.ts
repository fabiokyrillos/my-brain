import { normalize } from "./memory-intent";

/**
 * Life Brain B.5 (LB-OD-8 option A, ADR-157) — a RELATO: the owner telling the
 * Brain something that happened, in the chat, without "registre que".
 *
 * It is asked only AFTER the task-command model said the text is not a command
 * (`commandTurnFallsThrough`), so "terminei o relatório" still reaches the
 * command path first; this only decides between "answer it" and "keep it" for
 * text that is neither a command nor a question.
 *
 * A relato is: no question mark, no request to the assistant ("me diga",
 * "liste", "what", "show me"…), and a first-person narrative verb in the past
 * or a narrative time word ("hoje", "ontem") with a first-person verb. Declared
 * and small on purpose — what it does not recognise keeps going to knowledge,
 * which answers and writes nothing.
 */

const REQUEST_OPENERS = [
  // pt-BR
  "me diga", "me diz", "me fala", "me fale", "me mostra", "me mostre", "me lembra", "me lembre",
  "liste", "lista ", "mostre", "mostra ", "resuma", "resume ", "explique", "explica ", "procure", "busque",
  "quais", "qual", "quando", "onde", "como", "quanto", "quantos", "quantas", "por que", "porque", "o que", "quem",
  // en
  "tell me", "show me", "list ", "summarize", "summarise", "explain", "find ", "search", "remind me",
  "what", "when", "where", "how", "why", "who", "which",
] as const;

const NARRATIVE_VERBS = [
  // pt-BR, first person, past
  "fui", "tive", "estive", "comprei", "paguei", "marquei", "falei", "conversei", "recebi", "fiz", "vi", "li",
  "comecei", "terminei", "acabei", "esqueci", "lembrei", "decidi", "combinei", "encontrei", "almocei", "jantei",
  "viajei", "voltei", "cheguei", "saí", "sai", "senti", "dormi", "corri", "treinei", "gastei", "ganhei", "liguei",
  "mandei", "enviei", "assisti", "visitei", "consultei", "tomei",
  // en, first person, past
  "i went", "i had", "i bought", "i paid", "i met", "i talked", "i spoke", "i got", "i did", "i saw", "i read",
  "i started", "i finished", "i decided", "i booked", "i called", "i sent", "i visited", "i watched", "i spent",
  "i felt", "i slept", "i ran", "i took",
] as const;

function wordStart(normalized: string, phrase: string): boolean {
  const escaped = phrase.normalize("NFD").replace(/\p{M}/gu, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "u").test(normalized);
}

export function looksLikeRelato(text: string): boolean {
  const normalized = normalize(text);
  if (normalized === "" || normalized.includes("?")) return false;
  if (normalized.split(" ").length < 3) return false;
  if (REQUEST_OPENERS.some((opener) => normalized.startsWith(opener.trimEnd()))) return false;
  return NARRATIVE_VERBS.some((verb) => wordStart(normalized, verb));
}
