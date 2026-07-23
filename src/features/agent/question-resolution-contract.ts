import { z } from "zod";

// Phase 2D Slice 2D.1 — closed question-resolution command contract.
//
// The command is a discriminated shape so later slices can add resolution
// kinds (deferred / dismissed / not_relevant, then an optional consequence)
// without a new module or a parallel contract. Slice 2D.1 accepts exactly
// one kind: a trimmed free-text answer.
export const QUESTION_ANSWER_MAX_LENGTH = 4000;

const answerResolutionCommandSchema = z.strictObject({
  questionId: z.string().uuid(),
  kind: z.literal("answer"),
  answer: z.string().trim().min(1).max(QUESTION_ANSWER_MAX_LENGTH),
});

export const questionResolutionCommandSchema = z.discriminatedUnion("kind", [
  answerResolutionCommandSchema,
]);

export type QuestionResolutionCommand = z.infer<typeof questionResolutionCommandSchema>;

// Parses and canonicalizes an untrusted command. Throws on any deviation
// from the closed shape; never returns a partial command.
export function normalizeQuestionResolutionCommand(input: unknown): QuestionResolutionCommand {
  return questionResolutionCommandSchema.parse(input);
}

// Serializes the closed `p_resolution` JSON for `resolve_pending_question_v1`.
// The payload carries exactly the discriminant and its content — the question
// id travels as the RPC's own `p_question_id` argument, never inside the
// resolution payload.
export function serializeQuestionResolution(command: QuestionResolutionCommand): string {
  const parsed = questionResolutionCommandSchema.parse(command);
  return JSON.stringify({ kind: parsed.kind, answer: parsed.answer });
}
