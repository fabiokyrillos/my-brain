import { describe, expect, it } from "vitest";
import {
  QUESTION_ANSWER_MAX_LENGTH,
  normalizeQuestionResolutionCommand,
  questionResolutionCommandSchema,
  serializeQuestionResolution,
} from "./question-resolution-contract";

const questionId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

describe("questionResolutionCommandSchema", () => {
  it("accepts a valid answer command", () => {
    const parsed = questionResolutionCommandSchema.safeParse({
      questionId,
      kind: "answer",
      answer: "Sexta-feira às 14h",
    });
    expect(parsed.success).toBe(true);
  });

  it("trims the answer to its canonical form", () => {
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: "  Sexta-feira às 14h  ",
    });
    expect(command.answer).toBe("Sexta-feira às 14h");
  });

  it("rejects an empty answer", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answer",
        answer: "",
      }).success,
    ).toBe(false);
  });

  it("rejects a whitespace-only answer", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answer",
        answer: "   \n\t  ",
      }).success,
    ).toBe(false);
  });

  it("rejects an answer longer than the 4000-character bound", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answer",
        answer: "a".repeat(QUESTION_ANSWER_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("accepts an answer at exactly the 4000-character bound", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answer",
        answer: "a".repeat(QUESTION_ANSWER_MAX_LENGTH),
      }).success,
    ).toBe(true);
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: "a".repeat(QUESTION_ANSWER_MAX_LENGTH),
    });
    expect(command.answer).toHaveLength(QUESTION_ANSWER_MAX_LENGTH);
  });

  it("rejects an unknown resolution kind", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "deferred",
        answer: "amanhã",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answer",
        answer: "ok",
        consequence: "reinterpret",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed question id", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId: "not-a-uuid",
        kind: "answer",
        answer: "ok",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed command shape", () => {
    expect(questionResolutionCommandSchema.safeParse(null).success).toBe(false);
    expect(questionResolutionCommandSchema.safeParse("answer").success).toBe(false);
    expect(questionResolutionCommandSchema.safeParse({ kind: "answer" }).success).toBe(false);
    expect(
      questionResolutionCommandSchema.safeParse({ questionId, answer: "ok" }).success,
    ).toBe(false);
  });
});

describe("normalizeQuestionResolutionCommand", () => {
  it("throws on invalid input instead of returning a partial command", () => {
    expect(() =>
      normalizeQuestionResolutionCommand({ questionId, kind: "answer", answer: "  " }),
    ).toThrow();
  });
});

describe("serializeQuestionResolution", () => {
  it("serializes the closed resolution payload with exactly kind and answer", () => {
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: " Sexta-feira ",
    });
    const payload = JSON.parse(serializeQuestionResolution(command)) as Record<string, unknown>;
    expect(payload).toEqual({ kind: "answer", answer: "Sexta-feira" });
    expect(Object.keys(payload).sort()).toEqual(["answer", "kind"]);
  });

  it("never includes the question id or any extra key in the resolution payload", () => {
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: "ok",
    });
    expect(serializeQuestionResolution(command)).not.toContain(questionId);
  });
});
