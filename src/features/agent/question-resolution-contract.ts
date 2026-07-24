import { z } from "zod";

// Phase 2D — closed question-resolution command contract.
//
// The command is a discriminated shape so slices add resolution kinds without
// a new module or a parallel contract. Slice 2D.1 introduced the free-text
// `answer` kind; Slice 2D.2 adds the non-answer dispositions `deferred`,
// `dismissed`, and `not_relevant` (resolved through the same single RPC
// family, bumped to `resolve_pending_question_v2`).
export const QUESTION_ANSWER_MAX_LENGTH = 4000;

// Phase 2D Slice 2D.3 — suggestion provenance.
//
// Provenance is deliberately NOT part of `p_resolution`: the closed database
// write shape (and therefore `resolve_pending_question_v1`/`_v2`) is unchanged,
// and no new RPC version is introduced — ADR-033 reserves `_v3` for Slice
// 2D.4's consequence. The browser may submit only a bounded suggestion *id*;
// the server re-derives the deterministic options for that question and
// records the resulting bounded `origin` enum on the persisted-outcome
// analytics event. A client can never assert its own attribution.
export const questionAnswerOrigins = ["typed", "suggested"] as const;
export type QuestionAnswerOrigin = (typeof questionAnswerOrigins)[number];

export const QUESTION_SUGGESTION_ID_MAX_LENGTH = 64;

// A suggestion id is `<kind>:<slug>` — lowercase letters/underscore, then a
// lowercase alphanumeric-hyphen slug. Nothing else is accepted.
const suggestionIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(QUESTION_SUGGESTION_ID_MAX_LENGTH)
  .regex(/^[a-z_]+:[a-z0-9-]+$/);

/**
 * Parses an untrusted submitted suggestion id. An absent, malformed, or
 * oversized id yields `null`, which the caller records as a typed answer — a
 * UI hint never blocks or fails a resolution.
 */
export function parseSubmittedSuggestionId(input: unknown): string | null {
  const parsed = suggestionIdSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

// Bounded deferral window: a snooze must land strictly in the future and
// within one year (366 days covers leap years); an unbounded far-future defer
// would be an untruthful dismissal. Mirrored by the database contract.
export const QUESTION_DEFER_MAX_DAYS = 366;

const DAY_IN_MS = 86_400_000;

// Closed instant shape: an explicit-offset ISO-8601 instant (Z or ±HH:MM).
// Naive local date-times are rejected — they are ambiguous without the
// profile timezone, which the UI already applies before submission.
const OFFSET_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const snoozedUntilSchema = z
  .string()
  .regex(OFFSET_INSTANT_PATTERN)
  .refine((value) => {
    const instant = Date.parse(value);
    if (!Number.isFinite(instant)) return false;
    const now = Date.now();
    return instant > now && instant <= now + QUESTION_DEFER_MAX_DAYS * DAY_IN_MS;
  })
  .transform((value) => new Date(value).toISOString());

const answerResolutionCommandSchema = z.strictObject({
  questionId: z.string().uuid(),
  kind: z.literal("answer"),
  answer: z.string().trim().min(1).max(QUESTION_ANSWER_MAX_LENGTH),
});

const deferredResolutionCommandSchema = z.strictObject({
  questionId: z.string().uuid(),
  kind: z.literal("deferred"),
  snoozedUntil: snoozedUntilSchema,
});

const dismissedResolutionCommandSchema = z.strictObject({
  questionId: z.string().uuid(),
  kind: z.literal("dismissed"),
});

const notRelevantResolutionCommandSchema = z.strictObject({
  questionId: z.string().uuid(),
  kind: z.literal("not_relevant"),
});

export const questionResolutionCommandSchema = z.discriminatedUnion("kind", [
  answerResolutionCommandSchema,
  deferredResolutionCommandSchema,
  dismissedResolutionCommandSchema,
  notRelevantResolutionCommandSchema,
]);

export type QuestionResolutionCommand = z.infer<typeof questionResolutionCommandSchema>;

export type QuestionResolutionKind = QuestionResolutionCommand["kind"];

// Parses and canonicalizes an untrusted command. Throws on any deviation
// from the closed shape; never returns a partial command.
export function normalizeQuestionResolutionCommand(input: unknown): QuestionResolutionCommand {
  return questionResolutionCommandSchema.parse(input);
}

// Serializes the closed `p_resolution` JSON for `resolve_pending_question_v2`
// (and, for the answer kind, the still-compatible `_v1` shape). The payload
// carries exactly the discriminant and its content — the question id travels
// as the RPC's own `p_question_id` argument, never inside the resolution
// payload.
export function serializeQuestionResolution(command: QuestionResolutionCommand): string {
  const parsed = questionResolutionCommandSchema.parse(command);
  switch (parsed.kind) {
    case "answer":
      return JSON.stringify({ kind: parsed.kind, answer: parsed.answer });
    case "deferred":
      return JSON.stringify({ kind: parsed.kind, snoozedUntil: parsed.snoozedUntil });
    case "dismissed":
    case "not_relevant":
      return JSON.stringify({ kind: parsed.kind });
  }
}
