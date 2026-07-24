import { describe, expect, it } from "vitest";
import {
  QUESTION_ANSWER_MAX_LENGTH,
  QUESTION_DEFER_MAX_DAYS,
  QUESTION_SUGGESTION_ID_MAX_LENGTH,
  normalizeQuestionResolutionCommand,
  parseSubmittedSuggestionId,
  questionAnswerOrigins,
  questionConsequences,
  questionResolutionCommandSchema,
  serializeQuestionResolution,
} from "./question-resolution-contract";

const questionId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

const DAY_IN_MS = 86_400_000;

function futureInstant(offsetMs = DAY_IN_MS): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

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
    expect(command.kind).toBe("answer");
    if (command.kind === "answer") {
      expect(command.answer).toBe("Sexta-feira às 14h");
    }
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
    expect(command.kind).toBe("answer");
    if (command.kind === "answer") {
      expect(command.answer).toHaveLength(QUESTION_ANSWER_MAX_LENGTH);
    }
  });

  it("rejects an unknown resolution kind", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "reinterpret",
      }).success,
    ).toBe(false);
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answered",
        answer: "amanhã",
      }).success,
    ).toBe(false);
  });

  // Phase 2D Slice 2D.2 — non-answer dispositions.
  it("accepts a deferred command with a future offset instant and canonicalizes it to UTC", () => {
    const snoozedUntil = futureInstant();
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "deferred",
      snoozedUntil,
    });
    expect(command.kind).toBe("deferred");
    if (command.kind === "deferred") {
      expect(command.snoozedUntil).toBe(new Date(snoozedUntil).toISOString());
    }
  });

  it("canonicalizes an offset-bearing deferral instant to the same UTC form", () => {
    const target = new Date(Date.now() + DAY_IN_MS);
    target.setUTCSeconds(0, 0);
    const utc = target.toISOString();
    const offsetForm = `${new Date(target.getTime() - 3 * 3_600_000).toISOString().slice(0, 19)}-03:00`;
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "deferred",
      snoozedUntil: offsetForm,
    });
    if (command.kind === "deferred") {
      expect(command.snoozedUntil).toBe(utc);
    }
  });

  it("rejects a deferred command whose instant is in the past or now", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "deferred",
        snoozedUntil: "2020-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "deferred",
        snoozedUntil: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });

  it("rejects a deferred command beyond the bounded deferral window", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "deferred",
        snoozedUntil: futureInstant((QUESTION_DEFER_MAX_DAYS + 1) * DAY_IN_MS),
      }).success,
    ).toBe(false);
  });

  it("rejects a deferred command with a malformed or offset-less instant", () => {
    for (const snoozedUntil of ["amanhã", "2026-07-30T10:00", "2026-07-30 10:00:00Z", "", 123]) {
      expect(
        questionResolutionCommandSchema.safeParse({
          questionId,
          kind: "deferred",
          snoozedUntil,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a deferred command without snoozedUntil or with foreign keys", () => {
    expect(
      questionResolutionCommandSchema.safeParse({ questionId, kind: "deferred" }).success,
    ).toBe(false);
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "deferred",
        snoozedUntil: futureInstant(),
        answer: "ok",
      }).success,
    ).toBe(false);
  });

  it("accepts the terminal dismissed and not_relevant commands as closed shapes", () => {
    expect(
      questionResolutionCommandSchema.safeParse({ questionId, kind: "dismissed" }).success,
    ).toBe(true);
    expect(
      questionResolutionCommandSchema.safeParse({ questionId, kind: "not_relevant" }).success,
    ).toBe(true);
  });

  it("rejects terminal commands carrying content or deferral keys", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "dismissed",
        answer: "conteúdo",
      }).success,
    ).toBe(false);
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "not_relevant",
        snoozedUntil: futureInstant(),
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answer",
        answer: "ok",
        reinterpret: true,
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

// Phase 2D Slice 2D.3 — suggestion provenance never widens the write shape.
describe("suggestion provenance", () => {
  it("exposes exactly the bounded typed/suggested origin enum", () => {
    expect(questionAnswerOrigins).toEqual(["typed", "suggested"]);
  });

  it("rejects a suggestion id as a resolution-command key", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answer",
        answer: "Ana Prado",
        suggestionId: "person:ana-prado",
      }).success,
    ).toBe(false);
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "answer",
        answer: "Ana Prado",
        origin: "suggested",
      }).success,
    ).toBe(false);
  });

  it("keeps the serialized database payload free of provenance when a suggestion was used", () => {
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: "Ana Prado",
    });
    expect(JSON.parse(serializeQuestionResolution(command))).toEqual({
      kind: "answer",
      answer: "Ana Prado",
      consequence: "none",
    });
    expect(serializeQuestionResolution(command)).not.toContain("origin");
    expect(serializeQuestionResolution(command)).not.toContain("suggestion");
  });

  it("accepts a well-formed suggestion id", () => {
    expect(parseSubmittedSuggestionId("person:ana-prado")).toBe("person:ana-prado");
    expect(parseSubmittedSuggestionId("yes_no:yes")).toBe("yes_no:yes");
    expect(parseSubmittedSuggestionId("  project:aurora  ")).toBe("project:aurora");
  });

  it("downgrades an absent, malformed, or oversized suggestion id to null", () => {
    for (const input of [
      undefined,
      null,
      "",
      "   ",
      42,
      { id: "person:ana" },
      "person",
      "person:",
      ":ana",
      "Person:Ana",
      "person:ana prado",
      "person:<script>",
      `person:${"a".repeat(QUESTION_SUGGESTION_ID_MAX_LENGTH)}`,
    ]) {
      expect(parseSubmittedSuggestionId(input)).toBeNull();
    }
  });
});

// Phase 2D Slice 2D.4 — the closed permitted-consequence enum.
describe("permitted consequence", () => {
  it("exposes exactly the approved closed enum", () => {
    expect(questionConsequences).toEqual(["none", "reinterpret"]);
  });

  it("defaults an answer without a consequence to none", () => {
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: "Sexta-feira",
    });
    expect(command.kind).toBe("answer");
    if (command.kind === "answer") expect(command.consequence).toBe("none");
  });

  it("accepts each approved consequence value on the answer kind", () => {
    for (const consequence of questionConsequences) {
      const command = normalizeQuestionResolutionCommand({
        questionId,
        kind: "answer",
        answer: "Sexta-feira",
        consequence,
      });
      if (command.kind === "answer") expect(command.consequence).toBe(consequence);
    }
  });

  it("rejects any consequence outside the closed enum", () => {
    for (const consequence of [
      "reprocess",
      "REINTERPRET",
      "create_task",
      "",
      null,
      1,
      true,
      { kind: "reinterpret" },
      ["reinterpret"],
    ]) {
      expect(
        questionResolutionCommandSchema.safeParse({
          questionId,
          kind: "answer",
          answer: "Sexta-feira",
          consequence,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a consequence on every non-answer resolution kind", () => {
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "deferred",
        snoozedUntil: futureInstant(),
        consequence: "reinterpret",
      }).success,
    ).toBe(false);
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "dismissed",
        consequence: "reinterpret",
      }).success,
    ).toBe(false);
    expect(
      questionResolutionCommandSchema.safeParse({
        questionId,
        kind: "not_relevant",
        consequence: "none",
      }).success,
    ).toBe(false);
  });

  it("serializes the consequence explicitly so replay is unambiguous", () => {
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: "Sexta-feira",
      consequence: "reinterpret",
    });
    const payload = JSON.parse(serializeQuestionResolution(command)) as Record<string, unknown>;
    expect(payload).toEqual({
      kind: "answer",
      answer: "Sexta-feira",
      consequence: "reinterpret",
    });
    expect(Object.keys(payload).sort()).toEqual(["answer", "consequence", "kind"]);
  });

  it("never leaks a consequence into a non-answer serialized payload", () => {
    for (const command of [
      normalizeQuestionResolutionCommand({ questionId, kind: "dismissed" }),
      normalizeQuestionResolutionCommand({ questionId, kind: "not_relevant" }),
      normalizeQuestionResolutionCommand({
        questionId,
        kind: "deferred",
        snoozedUntil: futureInstant(),
      }),
    ]) {
      expect(serializeQuestionResolution(command)).not.toContain("consequence");
    }
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
  it("serializes the closed resolution payload with exactly kind, answer, and consequence", () => {
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: " Sexta-feira ",
    });
    const payload = JSON.parse(serializeQuestionResolution(command)) as Record<string, unknown>;
    expect(payload).toEqual({ kind: "answer", answer: "Sexta-feira", consequence: "none" });
    expect(Object.keys(payload).sort()).toEqual(["answer", "consequence", "kind"]);
  });

  it("never includes the question id or any extra key in the resolution payload", () => {
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "answer",
      answer: "ok",
    });
    expect(serializeQuestionResolution(command)).not.toContain(questionId);
  });

  it("serializes the deferred payload with exactly kind and the canonical instant", () => {
    const snoozedUntil = futureInstant();
    const command = normalizeQuestionResolutionCommand({
      questionId,
      kind: "deferred",
      snoozedUntil,
    });
    const payload = JSON.parse(serializeQuestionResolution(command)) as Record<string, unknown>;
    expect(payload).toEqual({ kind: "deferred", snoozedUntil: new Date(snoozedUntil).toISOString() });
    expect(Object.keys(payload).sort()).toEqual(["kind", "snoozedUntil"]);
  });

  it("serializes the terminal payloads with only the discriminant", () => {
    for (const kind of ["dismissed", "not_relevant"] as const) {
      const command = normalizeQuestionResolutionCommand({ questionId, kind });
      const payload = JSON.parse(serializeQuestionResolution(command)) as Record<string, unknown>;
      expect(payload).toEqual({ kind });
    }
  });
});
