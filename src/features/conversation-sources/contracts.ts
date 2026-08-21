/**
 * `2K-SRC-001` … `2K-SRC-008`, `2K-PRIVACY-003/004` — what an answer says about
 * where it came from.
 *
 * ## The thing this module removes
 *
 * `sendChatMessage` used to write a 220-character **excerpt** of every cited
 * source into `conversation_messages.citations`. That excerpt is a *copy*: the
 * source row's `sensitivity` does not travel with it, so reclassifying an entry
 * or archiving a memory left the excerpt in the thread, in the clear, forever.
 * The audit called it the sharpest finding in the phase, and it was live.
 *
 * **OD-2K-2 removes the copy rather than managing it.** A new message persists
 * a **structured reference only**, and the source is re-read at render time
 * against its **current** classification. Carrying the classification beside
 * the excerpt was considered and rejected: it keeps two copies of one fact in
 * sync by convention, which is the shape of defect `202608080087` had to
 * delete. There is nothing left to go stale, because there is no second copy.
 *
 * ## Why the envelope is versioned rather than migrated
 *
 * The rows already written are arrays of `{id, type, sourceId, excerpt}`. A
 * backfill is a `jsonb` migration, OD-2K-2 authorizes none, and the single
 * budgeted migration is destined for telemetry. So the column holds **two
 * shapes**, and `parseCitations` normalizes both — dropping the legacy excerpt
 * on the floor rather than reading it. That is the property that stops the
 * residual becoming a live exposure again, and it is a test rather than a
 * promise.
 *
 * ## Support kind, decided server-side
 *
 * The model does not declare it. `chat-schema.ts` is untouched, which keeps the
 * model unable to widen its own authority — it can name source ids and nothing
 * else, exactly as before.
 *
 * ## Insufficiency comes from retrieval, never from the citation count
 *
 * Slice 2K.0 measured why: `citations.length === 0` is produced both by
 * "nothing was retrieved" and by "sources were retrieved and the model cited
 * none". Those are different facts and the user deserves the true one, so the
 * envelope carries what **retrieval** found.
 */

import { z } from "zod";

import { answerExplanationSchema, type AnswerExplanation } from "./explanation";

/**
 * How a source supports an answer.
 *
 * - `direct_record` — the user wrote it. An **entry**.
 * - `product_state` — something the product currently holds as true on the
 *   user's behalf. A **memory**: a standing fact they confirmed, which is a
 *   different kind of claim from a thing they once typed.
 * - `inference` — composed by the Brain. No *source* is ever an inference; the
 *   **answer** is, and that is what the reach statement discloses. Declared
 *   here because it belongs to the same vocabulary, and used by
 *   `ANSWER_SUPPORT_KIND` rather than left as a member nothing produces.
 */
export const SUPPORT_KINDS = ["direct_record", "product_state", "inference"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

/** The answer itself is composed, never retrieved. */
export const ANSWER_SUPPORT_KIND: SupportKind = "inference";

/**
 * `OD-2Q-1`, signed as option A — **one vocabulary, one resolver, one set of
 * degradation rules.**
 *
 * `task` joined in Phase 2Q because `generateReview` retrieves tasks and
 * labelled them `memory:`. Persisting that verbatim stores a task uuid as a
 * memory, and the resolver looks it up in `memories` — so every task citation
 * degrades to "unavailable" in silence while every entry citation passes.
 * `2Q-FOUNDATION-003` executes that failure before this line fixed it.
 *
 * **This costs no migration.** The deployed columns —
 * `conversation_messages.citations` and, since `202608210100`,
 * `summaries.citations` — are both `jsonb not null default '[]'::jsonb` with no
 * check constraint, no trigger and no deployed validator. The pinning is here,
 * in TypeScript, and this constant is the single place it lives.
 */
export const CITED_SOURCE_TYPES = ["entry", "memory", "task"] as const;
export type CitedSourceType = (typeof CITED_SOURCE_TYPES)[number];

/**
 * How a source of each kind supports an answer.
 *
 * Written as an exhaustive record rather than as a ternary, deliberately: a
 * ternary's `else` arm silently absorbs every type added after it was written,
 * which is the exact shape of the defect this phase exists to remove. Adding a
 * member to `CITED_SOURCE_TYPES` without deciding its support kind is now a
 * type error rather than a wrong answer.
 *
 * A **task** is `product_state`: something the product currently holds as true
 * on the owner's behalf, derived from something they wrote. It is not a
 * `direct_record`, because the owner did not type the task — they typed the
 * entry it came from.
 */
const SUPPORT_BY_TYPE: Readonly<Record<CitedSourceType, SupportKind>> = {
  entry: "direct_record",
  memory: "product_state",
  task: "product_state",
};

export function supportKindForSource(type: CitedSourceType): SupportKind {
  return SUPPORT_BY_TYPE[type];
}

/**
 * `2K-SRC-006` — what a retrieval *may* cover, and what each caller *did*.
 *
 * **These are two different facts, and Phase 2Q separated them.** Until then
 * one constant served as both, because there was one caller. There are now two,
 * and they reach different places: chat retrieves entries and memories
 * (ADR-055, OD-2K-A), while a review retrieves entries and tasks (`OD-2Q-2`,
 * signed as option A).
 *
 * Collapsing them again would make the product lie in one direction or the
 * other — either chat would claim it reads tasks, or a review's envelope would
 * be unparseable for naming one. So `ANSWER_REACH` is the **admissible
 * vocabulary** the envelope schema validates against, and each caller declares
 * its own reach below.
 *
 * `CHAT_REACH` is byte-identical to what the single constant used to be, which
 * is what makes chat's own tests the control that its behaviour did not move.
 */
export const ANSWER_REACH = CITED_SOURCE_TYPES;
export type AnswerReach = (typeof ANSWER_REACH)[number];

/** What `sendChatMessage` retrieves. Unchanged, and its copy still says so. */
export const CHAT_REACH: readonly AnswerReach[] = ["entry", "memory"];

/** What `generateReview` retrieves — `OD-2Q-2`, signed as option A. */
export const REVIEW_REACH: readonly AnswerReach[] = ["entry", "task"];

/** The version stamped on every envelope this module writes. */
export const CITATIONS_ENVELOPE_VERSION = "2026-08-09.1";

/**
 * The persisted reference. **No content-bearing field exists on this type.**
 *
 * `2K-PRIVACY-003` requires the property be enforced by the payload's *shape*
 * rather than by a caller's promise, and this is that shape: there is nowhere
 * here to put an excerpt, a title or a snippet.
 */
const referenceSchema = z
  .object({
    id: z.string().min(1).max(100),
    type: z.enum(CITED_SOURCE_TYPES),
    sourceId: z.string().uuid(),
    support: z.enum(SUPPORT_KINDS),
  })
  .strict();

export type PersistedSourceReference = z.infer<typeof referenceSchema>;

/**
 * `2K-SRC-005` — what retrieval found, as a fact rather than as a count.
 *
 * - `evidenced` — qualifying personal evidence reached the answer.
 * - `no_qualifying_evidence` — retrieval ran and nothing survived the floor and
 *   the lifecycle filter. **This is the honest "I had nothing".**
 * - `unknown` — a legacy row, written before this envelope existed. Not
 *   `no_qualifying_evidence`: claiming the Brain found nothing when nobody
 *   recorded whether it did would be an invention.
 */
export const EVIDENCE_STATES = ["evidenced", "no_qualifying_evidence", "unknown"] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

const envelopeSchema = z
  .object({
    v: z.literal(CITATIONS_ENVELOPE_VERSION),
    evidence: z.enum(["evidenced", "no_qualifying_evidence"]),
    reach: z.array(z.enum(ANSWER_REACH)),
    sources: z.array(referenceSchema).max(20),
    /**
     * `2K-EXPL-002/003/004` — added in slice 2K.5, and **optional** rather than
     * versioned.
     *
     * An envelope written by 2K.4 carries none, and its absence is meaningful:
     * that answer predates the disclosure, so the surface says nothing about
     * exclusions rather than claiming there were none. Bumping the version
     * would have made those rows unparseable and thrown away their references
     * as well, which is a worse answer to a smaller problem.
     */
    explanation: answerExplanationSchema.optional(),
  })
  .strict();

export type CitationsEnvelope = z.infer<typeof envelopeSchema>;

/**
 * The legacy shape, kept only so it can be **recognised and discarded**.
 *
 * `excerpt` is deliberately not read into anything. `.passthrough()` would let
 * it through; this picks the three identifying fields and nothing else, so a
 * legacy row cannot reproduce its stored content by any path the renderer has.
 */
const legacyEntrySchema = z.object({
  id: z.string().min(1),
  /**
   * **Deliberately NOT widened with the vocabulary above.** The legacy shape was
   * written by a code path that retrieved entries and memories and nothing else,
   * so a legacy row can never contain a task. Admitting one here would let a
   * corrupt or hand-edited row claim a type its writer could not have produced,
   * and would describe history that did not happen.
   */
  type: z.enum(["entry", "memory"]),
  sourceId: z.string().uuid(),
});

export type ParsedCitations = {
  readonly evidence: EvidenceState;
  readonly reach: readonly AnswerReach[];
  readonly sources: readonly PersistedSourceReference[];
  /**
   * What retrieval left out (`2K-EXPL-002..004`), or `null` when the answer
   * recorded none — which is different from "nothing was excluded".
   */
  readonly explanation: AnswerExplanation | null;
  /** True when this row predates the envelope, so the surface can say less. */
  readonly legacy: boolean;
};

export const NO_CITATIONS: ParsedCitations = {
  evidence: "unknown",
  reach: [],
  sources: [],
  explanation: null,
  legacy: false,
};

/**
 * Normalizes whatever the column holds.
 *
 * Both shapes are real and both will be for as long as the historical rows
 * exist. Neither branch can produce content: the current one has no field for
 * it, and the legacy one drops it.
 */
export function parseCitations(raw: unknown): ParsedCitations {
  const envelope = envelopeSchema.safeParse(raw);
  if (envelope.success) {
    return {
      evidence: envelope.data.evidence,
      reach: envelope.data.reach,
      sources: envelope.data.sources,
      explanation: envelope.data.explanation ?? null,
      legacy: false,
    };
  }

  if (!Array.isArray(raw)) return NO_CITATIONS;

  const sources: PersistedSourceReference[] = [];
  for (const item of raw) {
    const parsed = legacyEntrySchema.safeParse(item);
    if (!parsed.success) continue;
    sources.push({
      id: parsed.data.id,
      type: parsed.data.type,
      sourceId: parsed.data.sourceId,
      // Derived now, from the type — the legacy row never recorded one, and a
      // support kind is a fact about what the source *is*, so deriving it is
      // honest where inventing an evidence state would not be.
      support: supportKindForSource(parsed.data.type),
    });
  }
  return {
    // Never `no_qualifying_evidence`: nobody recorded what retrieval found for
    // these rows, and saying "I had nothing" about a row that may have had
    // plenty would be an invention.
    evidence: "unknown",
    reach: [],
    sources,
    explanation: null,
    legacy: true,
  };
}

/**
 * Builds the envelope a new message persists.
 *
 * `evidence` is taken from the **retrieval result** the caller measured, never
 * from `sources.length` — the ambiguity slice 2K.0 measured is exactly that a
 * turn with sources whose model cited none produces the identical empty array.
 */
export function buildCitationsEnvelope(input: {
  readonly retrievedAnyQualifyingSource: boolean;
  readonly sources: readonly PersistedSourceReference[];
  readonly explanation?: AnswerExplanation;
  /**
   * What **this** caller retrieved — `CHAT_REACH` or `REVIEW_REACH`.
   *
   * Required rather than defaulted. A default would silently give a new caller
   * chat's reach, and a review stamped with chat's reach would tell the owner
   * the Brain looked in their memories when it looked at their tasks. The
   * caller knows; the constant cannot.
   */
  readonly reach: readonly AnswerReach[];
}): CitationsEnvelope {
  return {
    v: CITATIONS_ENVELOPE_VERSION,
    evidence: input.retrievedAnyQualifyingSource ? "evidenced" : "no_qualifying_evidence",
    reach: [...input.reach],
    sources: [...input.sources],
    ...(input.explanation === undefined ? {} : { explanation: input.explanation }),
  };
}
