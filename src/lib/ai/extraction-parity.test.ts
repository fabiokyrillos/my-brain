import { describe, expect, it } from "vitest";

import { entryExtractionSchema } from "./extraction-schema";
import {
  describeExtractionIssues,
  validateExtraction,
} from "../../../supabase/functions/_shared/extraction-validation";

// The Deno worker cannot import `src/lib/ai` (the `server-only` guard throws
// outside a bundler), so the extraction contract exists twice: the Zod schema
// here is the source of truth, and
// `supabase/functions/_shared/extraction-validation.ts` is the runtime-neutral
// validator the production worker actually runs.
//
// This suite is the enforcement of that parity. It is behavioural, not
// textual: one corpus goes through both implementations and any disagreement —
// accepted here but rejected there, or a differently normalized value — fails
// the build. It runs in the existing Vitest CI job because the validator is
// deliberately dependency-free.

function baseExtraction() {
  return {
    language: "pt-BR",
    occurredAt: "2026-07-24T15:04:05.000Z",
    isRetroactive: false,
    summary: "Reunião com Ana sobre o relatório trimestral.",
    concepts: ["task", "person_note"],
    contexts: [{ name: "Trabalho", confidence: 0.9, evidence: "reunião", inferred: false }],
    organizations: [],
    projects: [{ name: "Relatório", confidence: 0.6, evidence: "relatório trimestral", inferred: true }],
    people: [{ name: "Ana", confidence: 0.95, evidence: "com Ana", inferred: false }],
    taskCandidates: [
      {
        title: "Enviar o relatório",
        description: "Consolidar os números antes de enviar.",
        dueAt: "2026-07-31T12:00:00-03:00",
        waitingOn: null,
        parentIndex: null,
        confidence: 0.8,
        explicit: true,
      },
      {
        title: "Revisar com Ana",
        description: null,
        dueAt: null,
        waitingOn: "Ana",
        parentIndex: 0,
        confidence: 0.5,
        explicit: false,
      },
    ],
    pendingQuestions: [
      { question: "Qual é o prazo real?", reason: "A data não estava explícita.", confidence: 0.4 },
    ],
    confidence: 0.77,
  } as Record<string, unknown>;
}

function withRoot(patch: Record<string, unknown>) {
  return { ...baseExtraction(), ...patch };
}

function withTaskCandidate(patch: Record<string, unknown>) {
  const base = baseExtraction();
  const candidates = base.taskCandidates as Record<string, unknown>[];
  return { ...base, taskCandidates: [{ ...candidates[0], ...patch }, candidates[1]] };
}

function withEntityCandidate(patch: Record<string, unknown>) {
  const base = baseExtraction();
  const people = base.people as Record<string, unknown>[];
  return { ...base, people: [{ ...people[0], ...patch }] };
}

function withPendingQuestion(patch: Record<string, unknown>) {
  const base = baseExtraction();
  const questions = base.pendingQuestions as Record<string, unknown>[];
  return { ...base, pendingQuestions: [{ ...questions[0], ...patch }] };
}

const corpus: { name: string; input: unknown }[] = [
  { name: "the valid baseline", input: baseExtraction() },

  // Root shape
  { name: "not an object", input: "nope" },
  { name: "null", input: null },
  { name: "an array", input: [] },

  // Enums
  { name: "unknown language", input: withRoot({ language: "es" }) },
  { name: "english language", input: withRoot({ language: "en" }) },
  { name: "missing language", input: (() => { const v = baseExtraction(); delete v.language; return v; })() },
  { name: "unknown concept", input: withRoot({ concepts: ["task", "not_a_concept"] }) },
  { name: "empty concepts", input: withRoot({ concepts: [] }) },
  { name: "concepts not an array", input: withRoot({ concepts: "task" }) },
  { name: "every known concept", input: withRoot({
    concepts: [
      "raw_record", "completed_activity", "task", "subtask", "reminder", "appointment",
      "reference", "decision", "idea", "person_note", "project_note", "pending_question",
      "blocker", "dependency", "status_update", "lasting_preference", "personal_memory",
      "request_received", "waiting_for_third_party",
    ],
  }) },

  // Datetime shapes
  { name: "occurredAt with Z", input: withRoot({ occurredAt: "2026-07-24T15:04:05Z" }) },
  { name: "occurredAt with positive offset", input: withRoot({ occurredAt: "2026-07-24T15:04:05+05:30" }) },
  { name: "occurredAt without seconds", input: withRoot({ occurredAt: "2026-07-24T15:04Z" }) },
  { name: "occurredAt without timezone", input: withRoot({ occurredAt: "2026-07-24T15:04:05" }) },
  { name: "occurredAt as a date only", input: withRoot({ occurredAt: "2026-07-24" }) },
  { name: "occurredAt with a space separator", input: withRoot({ occurredAt: "2026-07-24 15:04:05Z" }) },
  { name: "occurredAt natural language", input: withRoot({ occurredAt: "next friday" }) },
  { name: "occurredAt impossible day", input: withRoot({ occurredAt: "2026-02-30T10:00:00Z" }) },
  { name: "occurredAt real leap day", input: withRoot({ occurredAt: "2024-02-29T10:00:00Z" }) },
  { name: "occurredAt non-leap 29 February", input: withRoot({ occurredAt: "2026-02-29T10:00:00Z" }) },
  { name: "occurredAt month 13", input: withRoot({ occurredAt: "2026-13-01T10:00:00Z" }) },
  { name: "occurredAt hour 24", input: withRoot({ occurredAt: "2026-07-24T24:00:00Z" }) },
  { name: "occurredAt fractional seconds", input: withRoot({ occurredAt: "2026-07-24T15:04:05.123456Z" }) },
  { name: "occurredAt as a number", input: withRoot({ occurredAt: 1_700_000_000 }) },
  { name: "occurredAt null", input: withRoot({ occurredAt: null }) },

  // Numbers
  { name: "confidence above one", input: withRoot({ confidence: 1.2 }) },
  { name: "confidence below zero", input: withRoot({ confidence: -0.01 }) },
  { name: "confidence at the bounds", input: withRoot({ confidence: 1 }) },
  { name: "confidence zero", input: withRoot({ confidence: 0 }) },
  { name: "confidence NaN", input: withRoot({ confidence: Number.NaN }) },
  { name: "confidence Infinity", input: withRoot({ confidence: Number.POSITIVE_INFINITY }) },
  { name: "confidence as a string", input: withRoot({ confidence: "0.5" }) },
  { name: "confidence missing", input: (() => { const v = baseExtraction(); delete v.confidence; return v; })() },

  // Booleans
  { name: "isRetroactive as a string", input: withRoot({ isRetroactive: "false" }) },
  { name: "isRetroactive missing", input: (() => { const v = baseExtraction(); delete v.isRetroactive; return v; })() },

  // Summary
  { name: "blank summary", input: withRoot({ summary: "   " }) },
  { name: "summary needing a trim", input: withRoot({ summary: "  precisa de trim  " }) },
  { name: "summary at the limit", input: withRoot({ summary: "a".repeat(2000) }) },
  { name: "summary over the limit", input: withRoot({ summary: "a".repeat(2001) }) },
  { name: "summary padded to the limit", input: withRoot({ summary: `  ${"a".repeat(2000)}  ` }) },
  { name: "summary as a number", input: withRoot({ summary: 12 }) },

  // Entity candidates
  { name: "entity name blank", input: withEntityCandidate({ name: " " }) },
  { name: "entity name over the limit", input: withEntityCandidate({ name: "a".repeat(161) }) },
  { name: "entity name at the limit", input: withEntityCandidate({ name: "a".repeat(160) }) },
  { name: "entity evidence over the limit", input: withEntityCandidate({ evidence: "a".repeat(501) }) },
  { name: "entity confidence out of range", input: withEntityCandidate({ confidence: 4 }) },
  { name: "entity inferred missing", input: (() => {
    const base = baseExtraction();
    const people = base.people as Record<string, unknown>[];
    const person = { ...people[0] };
    delete person.inferred;
    return { ...base, people: [person] };
  })() },
  { name: "entity not an object", input: withRoot({ people: ["Ana"] }) },
  { name: "entity list not an array", input: withRoot({ organizations: {} }) },

  // Task candidates
  { name: "candidate title blank", input: withTaskCandidate({ title: "" }) },
  { name: "candidate title over the limit", input: withTaskCandidate({ title: "a".repeat(241) }) },
  { name: "candidate title at the limit", input: withTaskCandidate({ title: "a".repeat(240) }) },
  { name: "candidate description over the limit", input: withTaskCandidate({ description: "a".repeat(2001) }) },
  { name: "candidate description empty string", input: withTaskCandidate({ description: "" }) },
  { name: "candidate description missing", input: (() => {
    const base = baseExtraction();
    const candidates = base.taskCandidates as Record<string, unknown>[];
    const candidate = { ...candidates[0] };
    delete candidate.description;
    return { ...base, taskCandidates: [candidate] };
  })() },
  { name: "candidate dueAt malformed", input: withTaskCandidate({ dueAt: "31/07/2026" }) },
  { name: "candidate dueAt without timezone", input: withTaskCandidate({ dueAt: "2026-07-31T12:00:00" }) },
  { name: "candidate dueAt impossible", input: withTaskCandidate({ dueAt: "2026-04-31T12:00:00Z" }) },
  { name: "candidate parentIndex negative", input: withTaskCandidate({ parentIndex: -1 }) },
  { name: "candidate parentIndex fractional", input: withTaskCandidate({ parentIndex: 1.5 }) },
  { name: "candidate parentIndex zero", input: withTaskCandidate({ parentIndex: 0 }) },
  { name: "candidate parentIndex as a string", input: withTaskCandidate({ parentIndex: "0" }) },
  { name: "candidate waitingOn over the limit", input: withTaskCandidate({ waitingOn: "a".repeat(161) }) },
  { name: "candidate confidence out of range", input: withTaskCandidate({ confidence: 1.0001 }) },
  { name: "candidate explicit missing", input: (() => {
    const base = baseExtraction();
    const candidates = base.taskCandidates as Record<string, unknown>[];
    const candidate = { ...candidates[0] };
    delete candidate.explicit;
    return { ...base, taskCandidates: [candidate] };
  })() },
  { name: "candidate list not an array", input: withRoot({ taskCandidates: "none" }) },
  { name: "candidate list empty", input: withRoot({ taskCandidates: [] }) },
  { name: "candidate not an object", input: withRoot({ taskCandidates: [null] }) },

  // Pending questions
  { name: "question blank", input: withPendingQuestion({ question: "  " }) },
  { name: "question over the limit", input: withPendingQuestion({ question: "a".repeat(501) }) },
  { name: "reason blank", input: withPendingQuestion({ reason: "" }) },
  { name: "question confidence out of range", input: withPendingQuestion({ confidence: -1 }) },
  { name: "questions list empty", input: withRoot({ pendingQuestions: [] }) },
  { name: "questions list not an array", input: withRoot({ pendingQuestions: null }) },

  // Unknown keys are stripped, not rejected, by the source of truth.
  { name: "unknown root key", input: withRoot({ unexpected: "extra" }) },
  { name: "unknown candidate key", input: withTaskCandidate({ unexpected: "extra" }) },
];

describe("extraction validator parity with the Zod source of truth", () => {
  it("covers a meaningful corpus", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(70);
    expect(new Set(corpus.map((entry) => entry.name)).size).toBe(corpus.length);
  });

  for (const { name, input } of corpus) {
    it(`agrees on ${name}`, () => {
      const zod = entryExtractionSchema.safeParse(input);
      const deno = validateExtraction(input);

      expect(
        deno.ok,
        `Zod ${zod.success ? "accepted" : "rejected"} but the worker validator ${
          deno.ok ? "accepted" : "rejected"
        } "${name}"`,
      ).toBe(zod.success);

      if (zod.success && deno.ok) {
        expect(deno.value).toEqual(zod.data);
      }
    });
  }

  it("accepts at least one case and rejects at least one case", () => {
    const verdicts = corpus.map((entry) => validateExtraction(entry.input).ok);
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});

describe("issue reporting never leaks model output", () => {
  it("reports field paths and codes only", () => {
    const secret = "conteúdo confidencial que nunca deve aparecer em log";
    const result = validateExtraction(withRoot({ confidence: 5, summary: secret }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const serialized = JSON.stringify(result.issues);
    expect(serialized).not.toContain(secret);
    expect(result.issues).toEqual([{ path: "confidence", code: "out_of_range" }]);
    expect(describeExtractionIssues(result.issues)).toBe("confidence:out_of_range");
  });

  it("truncates long issue lists without leaking values", () => {
    const result = validateExtraction({});
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const described = describeExtractionIssues(result.issues, 2);
    expect(described).toMatch(/, \+\d+ more$/);
    expect(described.split(", ").length).toBe(3);
  });
});
