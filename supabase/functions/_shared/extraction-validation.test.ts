// Deno-side behavioural tests for the extraction validator the production
// worker runs. These execute in the `worker` CI job (`deno test
// supabase/functions/`), which is the first automated gate this runtime has
// ever had. Equivalence with the Node Zod source of truth is proven separately
// and continuously by src/lib/ai/extraction-parity.test.ts.

import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  describeExtractionIssues,
  isIsoInstant,
  validateExtraction,
  type ExtractionIssue,
} from "./extraction-validation.ts";

function validExtraction(): Record<string, unknown> {
  return {
    language: "pt-BR",
    occurredAt: "2026-07-24T15:04:05.000Z",
    isRetroactive: false,
    summary: "Reunião com Ana sobre o relatório.",
    concepts: ["task"],
    contexts: [],
    organizations: [],
    projects: [],
    people: [{ name: "Ana", confidence: 0.9, evidence: "com Ana", inferred: false }],
    taskCandidates: [{
      title: "Enviar o relatório",
      description: null,
      dueAt: "2026-07-31T12:00:00-03:00",
      waitingOn: null,
      parentIndex: null,
      confidence: 0.8,
      explicit: true,
    }],
    pendingQuestions: [{ question: "Qual o prazo?", reason: "Não estava explícito.", confidence: 0.4 }],
    confidence: 0.7,
  };
}

function issuesOf(input: unknown): ExtractionIssue[] {
  const result = validateExtraction(input);
  assertFalse(result.ok, "expected the payload to be rejected");
  return result.ok ? [] : result.issues;
}

Deno.test("a complete, in-range extraction is accepted and normalized", () => {
  const result = validateExtraction({ ...validExtraction(), summary: "  precisa de trim  " });
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.value.summary, "precisa de trim");
  assertEquals(result.value.language, "pt-BR");
  assertEquals(result.value.taskCandidates.length, 1);
  assertEquals(result.value.taskCandidates[0].parentIndex, null);
});

Deno.test("a non-object payload is refused without inspecting fields", () => {
  assertEquals(issuesOf("not an object"), [{ path: "", code: "expected_object" }]);
  assertEquals(issuesOf(null), [{ path: "", code: "expected_object" }]);
  assertEquals(issuesOf([]), [{ path: "", code: "expected_object" }]);
});

Deno.test("root confidence outside 0..1 is refused", () => {
  assertEquals(issuesOf({ ...validExtraction(), confidence: 1.2 }), [
    { path: "confidence", code: "out_of_range" },
  ]);
  assertEquals(issuesOf({ ...validExtraction(), confidence: -0.1 }), [
    { path: "confidence", code: "out_of_range" },
  ]);
  assertEquals(issuesOf({ ...validExtraction(), confidence: Number.NaN }), [
    { path: "confidence", code: "expected_number" },
  ]);
});

Deno.test("an over-length summary is refused rather than truncated", () => {
  assertEquals(issuesOf({ ...validExtraction(), summary: "a".repeat(2001) }), [
    { path: "summary", code: "too_long" },
  ]);
  assertEquals(issuesOf({ ...validExtraction(), summary: "   " }), [
    { path: "summary", code: "too_short" },
  ]);
});

Deno.test("concepts must be a non-empty list of known identifiers", () => {
  assertEquals(issuesOf({ ...validExtraction(), concepts: [] }), [
    { path: "concepts", code: "too_short" },
  ]);
  assertEquals(issuesOf({ ...validExtraction(), concepts: ["task", "invented"] }), [
    { path: "concepts.1", code: "expected_enum" },
  ]);
});

Deno.test("a malformed dueAt is refused at the boundary, not at task materialization", () => {
  const base = validExtraction();
  const candidate = (base.taskCandidates as Record<string, unknown>[])[0];

  for (const dueAt of ["31/07/2026", "2026-07-31T12:00:00", "2026-04-31T12:00:00Z", "amanhã", 17]) {
    assertEquals(
      issuesOf({ ...base, taskCandidates: [{ ...candidate, dueAt }] }),
      [{ path: "taskCandidates.0.dueAt", code: "expected_iso_instant" }],
      `expected ${JSON.stringify(dueAt)} to be refused`,
    );
  }

  const accepted = validateExtraction({
    ...base,
    taskCandidates: [{ ...candidate, dueAt: "2024-02-29T23:59:59Z" }],
  });
  assert(accepted.ok, "a real leap day must remain acceptable");
});

Deno.test("parentIndex must be a non-negative integer or null", () => {
  const base = validExtraction();
  const candidate = (base.taskCandidates as Record<string, unknown>[])[0];

  for (const parentIndex of [-1, 1.5, "0", Number.NaN]) {
    assertEquals(
      issuesOf({ ...base, taskCandidates: [{ ...candidate, parentIndex }] }),
      [{ path: "taskCandidates.0.parentIndex", code: "expected_non_negative_integer" }],
    );
  }
});

Deno.test("an over-length candidate title is refused before it can break tasks.title", () => {
  const base = validExtraction();
  const candidate = (base.taskCandidates as Record<string, unknown>[])[0];
  assertEquals(
    issuesOf({ ...base, taskCandidates: [{ ...candidate, title: "a".repeat(241) }] }),
    [{ path: "taskCandidates.0.title", code: "too_long" }],
  );
  const accepted = validateExtraction({
    ...base,
    taskCandidates: [{ ...candidate, title: "a".repeat(240) }],
  });
  assert(accepted.ok, "the tasks.title upper bound itself must stay acceptable");
});

Deno.test("entity candidate evidence and confidence are bounded", () => {
  const base = validExtraction();
  assertEquals(
    issuesOf({ ...base, people: [{ name: "Ana", confidence: 0.9, evidence: "a".repeat(501), inferred: false }] }),
    [{ path: "people.0.evidence", code: "too_long" }],
  );
  assertEquals(
    issuesOf({ ...base, people: [{ name: "", confidence: 0.9, evidence: "com Ana", inferred: false }] }),
    [{ path: "people.0.name", code: "too_short" }],
  );
});

Deno.test("pending question text is bounded on both fields", () => {
  const base = validExtraction();
  assertEquals(
    issuesOf({ ...base, pendingQuestions: [{ question: " ", reason: "porque", confidence: 0.2 }] }),
    [{ path: "pendingQuestions.0.question", code: "too_short" }],
  );
  assertEquals(
    issuesOf({ ...base, pendingQuestions: [{ question: "por que?", reason: "a".repeat(501), confidence: 0.2 }] }),
    [{ path: "pendingQuestions.0.reason", code: "too_long" }],
  );
});

// Regression lock for the forEach -> indexed-loop conversion. Inside a
// `forEach` callback `return` means "skip this element"; inside a `for` loop it
// means "exit the function". A missed conversion would silently stop validating
// the rest of an array after the first bad element — invisible in a
// single-element fixture, so every collection is checked with a bad element
// FOLLOWED by a second bad element, and both must be reported.
Deno.test("a bad element never stops the loop: entity candidates", () => {
  const base = validExtraction();
  const issues = issuesOf({
    ...base,
    people: [
      { name: "", confidence: 0.9, evidence: "trecho", inferred: false },
      { name: "Ana", confidence: 5, evidence: "trecho", inferred: false },
    ],
  });
  assertEquals(issues, [
    { path: "people.0.name", code: "too_short" },
    { path: "people.1.confidence", code: "out_of_range" },
  ]);
});

Deno.test("a bad element never stops the loop: task candidates", () => {
  const base = validExtraction();
  const candidate = (base.taskCandidates as Record<string, unknown>[])[0];
  const issues = issuesOf({
    ...base,
    taskCandidates: [
      { ...candidate, title: "" },
      { ...candidate, dueAt: "amanha" },
    ],
  });
  assertEquals(issues, [
    { path: "taskCandidates.0.title", code: "too_short" },
    { path: "taskCandidates.1.dueAt", code: "expected_iso_instant" },
  ]);
});

Deno.test("a bad element never stops the loop: pending questions", () => {
  const base = validExtraction();
  const issues = issuesOf({
    ...base,
    pendingQuestions: [
      { question: "", reason: "Motivo", confidence: 0.2 },
      { question: "Por que?", reason: "", confidence: 0.2 },
    ],
  });
  assertEquals(issues, [
    { path: "pendingQuestions.0.question", code: "too_short" },
    { path: "pendingQuestions.1.reason", code: "too_short" },
  ]);
});

Deno.test("a bad element never stops the loop: concepts", () => {
  assertEquals(issuesOf({ ...validExtraction(), concepts: ["nope", "task", "also_nope"] }), [
    { path: "concepts.0", code: "expected_enum" },
    { path: "concepts.2", code: "expected_enum" },
  ]);
});

Deno.test("a valid element after an invalid one is still collected", () => {
  // Proves the loop continues rather than returning: element 1 is well formed,
  // so the only issue reported must be element 0's.
  const base = validExtraction();
  const candidate = (base.taskCandidates as Record<string, unknown>[])[0];
  assertEquals(
    issuesOf({ ...base, taskCandidates: [{ ...candidate, title: "" }, candidate] }),
    [{ path: "taskCandidates.0.title", code: "too_short" }],
  );
});

Deno.test("an array hole is refused rather than skipped", () => {
  // `Array.prototype.forEach` skips holes entirely, which silently accepted a
  // sparse array as a shorter valid one and defeated the non-empty concepts
  // rule. Indexed loops see the hole as undefined, matching the Zod schema.
  const holed: unknown[] = ["task", "reminder"];
  delete holed[1];
  assertEquals(holed.length, 2);
  assertEquals(1 in holed, false);
  assertEquals(issuesOf({ ...validExtraction(), concepts: holed }), [
    { path: "concepts.1", code: "expected_enum" },
  ]);

  const onlyHole: unknown[] = [undefined];
  delete onlyHole[0];
  assertEquals(issuesOf({ ...validExtraction(), concepts: onlyHole }), [
    { path: "concepts.0", code: "expected_enum" },
  ]);
});

Deno.test("the timezone offset is bounded to what PostgreSQL can store", () => {
  const base = validExtraction();
  const candidate = (base.taskCandidates as Record<string, unknown>[])[0];

  assert(validateExtraction({ ...base, occurredAt: "2026-07-24T15:04:05+15:59" }).ok);
  assert(validateExtraction({ ...base, occurredAt: "2026-07-24T15:04:05-15:59" }).ok);

  for (const occurredAt of ["2026-07-24T15:04:05+16:00", "2026-07-24T15:04:05-16:00", "2026-07-24T15:04:05+23:59"]) {
    assertEquals(issuesOf({ ...base, occurredAt }), [
      { path: "occurredAt", code: "expected_iso_instant" },
    ]);
  }

  assertEquals(
    issuesOf({ ...base, taskCandidates: [{ ...candidate, dueAt: "2026-07-31T12:00:00+18:00" }] }),
    [{ path: "taskCandidates.0.dueAt", code: "expected_iso_instant" }],
  );
});

Deno.test("two-digit years are calendar-validated without Date's 1900 offset", () => {
  const base = validExtraction();
  for (const occurredAt of ["0050-07-24T15:04:05Z", "0099-07-24T15:04:05Z", "0000-02-29T15:04:05Z", "0004-02-29T15:04:05Z"]) {
    assert(validateExtraction({ ...base, occurredAt }).ok, `${occurredAt} must be accepted`);
  }
  for (const occurredAt of ["0100-02-29T15:04:05Z", "2100-02-29T15:04:05Z", "2026-02-29T15:04:05Z"]) {
    assertFalse(validateExtraction({ ...base, occurredAt }).ok, `${occurredAt} must be refused`);
  }
});

Deno.test("every issue reports a path and a code and never the offending value", () => {
  const secret = "conteudo-confidencial-do-usuario";
  const issues = issuesOf({ ...validExtraction(), summary: secret.repeat(200), confidence: 9 });

  const serialized = JSON.stringify(issues);
  assertFalse(serialized.includes(secret), "issue payloads must not contain model or user content");
  assertFalse(describeExtractionIssues(issues).includes(secret));
  for (const issue of issues) {
    assertEquals(typeof issue.path, "string");
    assert(issue.code.length > 0);
  }
});

Deno.test("issue descriptions stay bounded", () => {
  const issues = issuesOf({});
  assert(issues.length > 4, "an empty payload should report several issues");
  const described = describeExtractionIssues(issues, 2);
  assertStringIncludes(described, " more");
  assertEquals(described.split(", ").length, 3);
});

Deno.test("unknown properties are ignored, matching the source-of-truth schema", () => {
  const result = validateExtraction({ ...validExtraction(), unexpected: "extra" });
  assert(result.ok);
  if (!result.ok) return;
  assertFalse("unexpected" in result.value);
});

Deno.test("isIsoInstant requires a calendar-real instant with a timezone", () => {
  assert(isIsoInstant("2026-07-24T15:04:05Z"));
  assert(isIsoInstant("2026-07-24T15:04Z"));
  assert(isIsoInstant("2026-07-24T15:04:05+05:30"));
  assertFalse(isIsoInstant("2026-07-24T15:04:05"));
  assertFalse(isIsoInstant("2026-02-30T10:00:00Z"));
  assertFalse(isIsoInstant("2026-13-01T10:00:00Z"));
  assertFalse(isIsoInstant("2026-07-24T24:00:00Z"));
  assertFalse(isIsoInstant("2026-07-24"));
  assertFalse(isIsoInstant(17));
});
