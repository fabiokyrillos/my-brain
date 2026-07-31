/**
 * Does this utterance ask the assistant to *remember* something?
 *
 * Deliberately deterministic, and deliberately the first thing the composer
 * checks. DEC-5 forbids a silent memory write, and the safest way to honour that
 * is for the memory branch to be reachable **without a provider call and without
 * a write path behind it** — this function decides, the composer proposes, and
 * there is nothing further to reach until Slice G builds the confirmed-memory
 * contract.
 *
 * Two properties keep it from doing damage when it is wrong:
 *
 * 1. **A false positive costs a proposal, never a write.** The branch it selects
 *    renders a suggestion and persists nothing.
 * 2. **A false negative costs nothing at all.** The utterance simply continues
 *    to the command parse and, failing that, to the knowledge answer — which is
 *    where it would have gone before this slice existed.
 *
 * So the rule is tuned to avoid the *expensive* error, which is stealing a
 * genuine question: the phrase must **open** the sentence, and the sentence must
 * not be interrogative. "Você lembra o que combinei?" is a question about the
 * past and must be answered, not filed.
 *
 * Locale-free on purpose. A bilingual owner types in whichever language the
 * thought arrived in, and routing must not depend on a preference set months
 * ago, so both vocabularies are always live.
 */

/**
 * Imperative openers, unaccented and lowercase — the form `normalize` produces.
 *
 * Each is an instruction to store something. Phrasings that merely *mention*
 * memory ("eu lembro", "I remembered") are absent by design: they narrate.
 */
export const MEMORY_OPENERS = [
  // pt-BR
  "lembre disso",
  "lembre-se disso",
  "lembre se disso",
  "lembre sempre",
  "lembre-se sempre",
  "lembre se sempre",
  "lembre que",
  "lembre-se que",
  "lembre se que",
  "guarde isso",
  "guarde essa",
  "guarde esse",
  "nunca esqueca",
  "nao esqueca",
  // en
  "remember this",
  "remember that",
  "always remember",
  "keep in mind",
  "dont forget",
  "do not forget",
] as const;

/**
 * Lowercase, strip accents and apostrophes, drop leading punctuation, collapse
 * whitespace.
 *
 * Accent stripping is what makes phone typing work: "nunca esqueca" and "nunca
 * esqueça" are the same instruction, and requiring the accent would fail the
 * user for a keyboard setting. NFD splits each accented letter into its base
 * plus a combining mark, and the range below removes only those marks — it
 * never touches a letter.
 *
 * Apostrophes go the same way, and for the same reason: a phone autocorrects
 * "don't" to a curly `’`, a desktop keyboard leaves a straight `'`, and both
 * are the one word the opener list spells `dont`.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/['’‘`]/gu, "")
    .replace(/^[\s\p{P}]+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function looksLikeMemoryIntent(text: string): boolean {
  const normalized = normalize(text);
  if (normalized === "") return false;
  // The question mark wins over any opener. Answering something the user asked
  // is recoverable; swallowing it into a filing suggestion is not.
  if (normalized.endsWith("?")) return false;
  return MEMORY_OPENERS.some((opener) => normalized.startsWith(opener));
}
