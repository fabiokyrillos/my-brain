/**
 * What the composer *offers to file*, given an utterance it recognised (DEC-5).
 *
 * Slice E stopped at recognition: `looksLikeMemoryIntent` decided, and the
 * composer showed a notice that persisted nothing and linked away. This module
 * is the missing half — it turns the recognised sentence into a **proposal** the
 * owner can read, correct and accept, which is the shape DEC-5 requires:
 * "Lembre disso sempre" must produce a proposed memory requiring confirmation
 * before persistence, never a silent write.
 *
 * Three properties keep the proposal honest:
 *
 * 1. **Deterministic.** No provider call, no model, no confidence. The proposal
 *    is a text transformation of what the owner typed, so there is no AI→domain
 *    write contract here to authorize — only the owner's own words, re-shown.
 * 2. **Lossless where it matters.** Stripping the imperative opener is the whole
 *    normalization. `"Lembre disso sempre: prefiro reuniões pela manhã"` is
 *    stored as `"prefiro reuniões pela manhã"`, because the instruction to
 *    remember is not part of the thing remembered. Nothing else is rewritten.
 * 3. **Always overridable.** `kind` is a *suggestion* rendered as a preselected
 *    control, never a decision. A wrong guess costs one dropdown change; the
 *    schema re-validates whatever the owner actually submits.
 *
 * If the opener is the entire utterance — "lembre disso" and nothing else —
 * there is no memory to propose and this returns `null`. The composer then has
 * something specific to ask for rather than filing an empty row.
 */

import { MEMORY_OPENERS, normalize } from "./memory-intent";
import type { MemoryKind } from "@/features/memories/schema";

export type MemoryProposal = {
  readonly content: string;
  readonly kind: MemoryKind;
};

/**
 * Markers that a sentence states a *standing preference* rather than a fact.
 *
 * Kept to first-person preference verbs on purpose. Broader vocabulary
 * ("melhor", "better", "should") would sweep in ordinary statements, and the
 * cost of over-reaching is a mislabelled memory the owner has to notice and
 * correct — worse than the honest default of `fact`.
 */
const PREFERENCE_MARKERS = [
  "prefiro",
  "prefira",
  "gosto de",
  "nao gosto",
  "i prefer",
  "i like",
  "i dont like",
  "i do not like",
] as const;

/**
 * Markers that a sentence forbids something.
 *
 * `restriction` is the one kind worth distinguishing from `fact` automatically,
 * because a rule the assistant must not violate is the kind of memory whose
 * mislabelling is expensive to discover later.
 */
const RESTRICTION_MARKERS = [
  "nunca ",
  "jamais ",
  "nao me ",
  "never ",
  "dont ",
  "do not ",
] as const;

/**
 * Strip the recognised opener from the front of the owner's own text.
 *
 * Matching happens on the normalized form (lowercase, unaccented) but the slice
 * is taken from the **original** string, so the stored memory keeps its accents
 * and capitalisation. Normalization here is a lookup key, never the payload.
 *
 * The two forms can differ in length — NFD decomposition adds a combining mark
 * per accented letter — so the offset is recomputed by walking the original
 * rather than reusing the normalized index, which would cut mid-word on any
 * sentence whose opener contained an accent.
 */
function stripOpener(text: string): string {
  const normalized = normalize(text);
  // Longest match wins. The opener list is ordered for readability, not by
  // length, so `find` would strip "lembre disso" from "lembre disso que" and
  // leave a conjunction at the front of the stored memory.
  const opener = MEMORY_OPENERS.filter((candidate) => normalized.startsWith(candidate)).sort(
    (a, b) => b.length - a.length,
  )[0];
  if (!opener) return text.trim();

  // Walk the original one character at a time, normalizing the prefix as we go,
  // and stop at the first prefix that covers the whole opener. This is O(n) over
  // a bounded composer input and needs no assumption about how the two indexes
  // line up.
  for (let cut = 1; cut <= text.length; cut += 1) {
    if (normalize(text.slice(0, cut)).length >= opener.length) {
      return trimLeadIn(text.slice(cut), opener);
    }
  }
  return "";
}

/**
 * Drop the punctuation, and the intensifier *only when it modifies the
 * instruction rather than the sentence*.
 *
 * DEC-5's canonical phrase is "Lembre disso sempre" — "always remember this" —
 * where `sempre` says how often to remember and is not part of what is
 * remembered. But the same word after a complementizer belongs to the clause:
 * in "Lembre que sempre uso o mesmo banco", `sempre` is the whole point of the
 * fact, and stripping it would store the owner's statement with its meaning
 * reversed in the direction they would be least likely to check.
 *
 * The opener's own grammar decides. A demonstrative opener ("lembre disso",
 * "guarde isso", "remember this") closes its object, so anything following is
 * lead-in. A complementizer opener ("lembre que", "remember that") opens a
 * clause, so nothing following it may be dropped.
 *
 * Punctuation is stripped on both sides of the intensifier, since "Lembre disso,
 * sempre: X" and "Lembre disso sempre — X" are the same sentence.
 */
function trimLeadIn(rest: string, opener: string): string {
  const separators = /^[\s:,;.\-–—]+/u;
  const withoutPunctuation = rest.replace(separators, "");
  const opensAClause = /\b(que|that)$/u.test(opener);
  const withoutIntensifier = opensAClause
    ? withoutPunctuation
    : withoutPunctuation.replace(/^(sempre|always)\b/iu, "");
  return withoutIntensifier.replace(separators, "").trim();
}

function proposeKind(normalizedContent: string): MemoryKind {
  if (RESTRICTION_MARKERS.some((marker) => normalizedContent.includes(marker))) return "restriction";
  if (PREFERENCE_MARKERS.some((marker) => normalizedContent.includes(marker))) return "preference";
  return "fact";
}

export function buildMemoryProposal(text: string): MemoryProposal | null {
  const content = stripOpener(text);
  if (content === "") return null;
  return { content, kind: proposeKind(normalize(content)) };
}
