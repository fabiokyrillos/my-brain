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

/**
 * A genuinely sparse array — holes, not explicit `undefined` entries. `delete`
 * is what creates one; an array literal with an elision is normalized away by
 * some tooling, and `[undefined]` is a different value.
 */
function sparse(values: unknown[]): unknown[] {
  const result = [...values];
  for (let index = 0; index < result.length; index += 1) {
    if (result[index] === undefined) delete result[index];
  }
  return result;
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

  // The four divergence classes an independent review of this branch found
  // after the first corpus passed. Each was a real gap where the worker
  // validator and the Zod schema disagreed; none of them can regress silently
  // now. See docs/reports/pre-2e/PRE_2E_FOUNDATION_HARDENING_REPORT.md.

  // 1. Timezone offset range. `[+-]\d{2}:\d{2}` alone accepts nonsense offsets.
  // PostgreSQL caps a timestamptz offset at ±15:59, so the storable bound — not
  // Zod's ±23:59 grammar — is what both implementations must agree on. Without
  // this, an offset of +16:00 would pass the worker and then be refused by
  // 202607250053's `::timestamptz` cast, stranding the entry in `failed`.
  { name: "offset at the storable bound", input: withRoot({ occurredAt: "2026-07-24T15:04:05+15:59" }) },
  { name: "offset one minute past the storable bound", input: withRoot({ occurredAt: "2026-07-24T15:04:05+16:00" }) },
  { name: "negative offset past the storable bound", input: withRoot({ occurredAt: "2026-07-24T15:04:05-16:00" }) },
  { name: "offset within Zod's grammar but unstorable", input: withRoot({ occurredAt: "2026-07-24T15:04:05+23:59" }) },
  { name: "candidate dueAt offset unstorable", input: withTaskCandidate({ dueAt: "2026-07-31T12:00:00+18:00" }) },
  { name: "offset hour 24", input: withRoot({ occurredAt: "2026-07-24T15:04:05+24:00" }) },
  { name: "offset minute 60", input: withRoot({ occurredAt: "2026-07-24T15:04:05+23:60" }) },
  { name: "offset wildly out of range", input: withRoot({ occurredAt: "2026-07-24T15:04:05+99:99" }) },
  { name: "negative zero offset", input: withRoot({ occurredAt: "2026-07-24T15:04:05-00:00" }) },
  { name: "offset without a colon", input: withRoot({ occurredAt: "2026-07-24T15:04:05+0000" }) },
  { name: "offset hours only", input: withRoot({ occurredAt: "2026-07-24T15:04:05+05" }) },
  { name: "candidate dueAt offset out of range", input: withTaskCandidate({ dueAt: "2026-07-31T12:00:00+99:99" }) },

  // 2. Two-digit years. `Date.UTC` maps 0..99 to 1900+year, so a round-trip
  // check through Date rejected years the schema accepts.
  { name: "year 0050", input: withRoot({ occurredAt: "0050-07-24T15:04:05Z" }) },
  { name: "year 0099", input: withRoot({ occurredAt: "0099-07-24T15:04:05Z" }) },
  { name: "year 0000 is a leap year", input: withRoot({ occurredAt: "0000-02-29T15:04:05Z" }) },
  { name: "year 0004 is a leap year", input: withRoot({ occurredAt: "0004-02-29T15:04:05Z" }) },
  { name: "year 0100 is not a leap year", input: withRoot({ occurredAt: "0100-02-29T15:04:05Z" }) },
  { name: "year 2000 is a leap year", input: withRoot({ occurredAt: "2000-02-29T15:04:05Z" }) },
  { name: "year 2100 is not a leap year", input: withRoot({ occurredAt: "2100-02-29T15:04:05Z" }) },
  { name: "five-digit year", input: withRoot({ occurredAt: "12026-07-24T15:04:05Z" }) },
  { name: "signed year", input: withRoot({ occurredAt: "+2026-07-24T15:04:05Z" }) },
  { name: "month zero", input: withRoot({ occurredAt: "2026-00-10T15:04:05Z" }) },
  { name: "day zero", input: withRoot({ occurredAt: "2026-07-00T15:04:05Z" }) },
  { name: "day 32", input: withRoot({ occurredAt: "2026-07-32T15:04:05Z" }) },
  { name: "seconds 60", input: withRoot({ occurredAt: "2026-07-24T15:04:60Z" }) },
  { name: "lowercase separators", input: withRoot({ occurredAt: "2026-07-24t15:04:05z" }) },

  // 3. `.int()` rejects anything outside the safe-integer range, where
  // `Number.isInteger` accepts integral floats of any magnitude.
  { name: "parentIndex at the safe-integer bound", input: withTaskCandidate({ parentIndex: Number.MAX_SAFE_INTEGER }) },
  { name: "parentIndex beyond the safe-integer bound", input: withTaskCandidate({ parentIndex: 2 ** 53 }) },
  { name: "parentIndex 1e21", input: withTaskCandidate({ parentIndex: 1e21 }) },
  { name: "parentIndex 1e300", input: withTaskCandidate({ parentIndex: 1e300 }) },
  { name: "parentIndex Infinity", input: withTaskCandidate({ parentIndex: Number.POSITIVE_INFINITY }) },
  { name: "parentIndex negative zero", input: withTaskCandidate({ parentIndex: -0 }) },

  // 4. Array holes. `Array.prototype.forEach` skips them entirely; the schema
  // sees `undefined` and rejects.
  { name: "sparse concepts array", input: withRoot({ concepts: sparse(["task", undefined, "reminder"]) }) },
  { name: "sparse people array", input: withRoot({ people: sparse([{ name: "Ana", confidence: 0.9, evidence: "com Ana", inferred: false }, undefined]) }) },
  { name: "sparse taskCandidates array", input: withRoot({ taskCandidates: sparse([undefined]) }) },
  { name: "sparse pendingQuestions array", input: withRoot({ pendingQuestions: sparse([undefined]) }) },
  { name: "explicit undefined concept", input: withRoot({ concepts: ["task", undefined] }) },
];

describe("extraction validator parity with the Zod source of truth", () => {
  it("covers a meaningful corpus", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(110);
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
