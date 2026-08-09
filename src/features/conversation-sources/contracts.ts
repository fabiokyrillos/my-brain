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

export type CitedSourceType = "entry" | "memory";

export function supportKindForSource(type: CitedSourceType): SupportKind {
  return type === "entry" ? "direct_record" : "product_state";
}

/**
 * `2K-SRC-006` — what the retrieval actually covers.
 *
 * Two source types, and the product should say so. Today it implies it looked
 * everywhere; ADR-055 and OD-2K-A mean it looks at entries and memories. Making
 * the limit legible costs nothing and teaches the user the shape of the system.
 */
export const ANSWER_REACH = ["entry", "memory"] as const;
export type AnswerReach = (typeof ANSWER_REACH)[number];

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
    type: z.enum(["entry", "memory"]),
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
  type: z.enum(["entry", "memory"]),
  sourceId: z.string().uuid(),
});

export type ParsedCitations = {
  readonly evidence: EvidenceState;
  readonly reach: readonly AnswerReach[];
  readonly sources: readonly PersistedSourceReference[];
  /** True when this row predates the envelope, so the surface can say less. */
  readonly legacy: boolean;
};

export const NO_CITATIONS: ParsedCitations = {
  evidence: "unknown",
  reach: [],
  sources: [],
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
}): CitationsEnvelope {
  return {
    v: CITATIONS_ENVELOPE_VERSION,
    evidence: input.retrievedAnyQualifyingSource ? "evidenced" : "no_qualifying_evidence",
    reach: [...ANSWER_REACH],
    sources: [...input.sources],
  };
}
