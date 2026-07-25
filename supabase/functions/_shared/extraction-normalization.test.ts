import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { normalizeExtractionInstants } from "./extraction-normalization.ts";
import { validateExtraction } from "./extraction-validation.ts";

// Why this module exists at all: the response schema handed to the provider
// declares `dueAt: { type: ["string","null"] }` — a bare string — and OpenAI
// Structured Outputs does not enforce JSON Schema `format`. Sampling the
// production model against the production prompt returned a bare
// `"2026-07-27"` for three of five non-null deadlines ("by next Monday",
// "amanhã", "end of the month"). The validator requires a full instant, so
// those entries failed permanently: the same input reproduces the same output,
// so every retry burns the budget on an error retrying cannot fix.
//
// A bare local date IS unambiguous once the IANA timezone is known — the same
// timezone the prompt already supplies — so it is normalized deterministically
// rather than rejected. Anything still not an instant afterwards stays
// unchanged and fails validation: normalization only widens the two shapes
// below, never rescues genuinely malformed output.

const SAO_PAULO = "America/Sao_Paulo";

function extractionWith(fields: {
  occurredAt?: unknown;
  dueAt?: unknown;
}): Record<string, unknown> {
  return {
    language: "pt-BR",
    occurredAt: fields.occurredAt ?? "2026-07-25T12:00:00Z",
    isRetroactive: false,
    summary: "Resumo.",
    concepts: ["task"],
    contexts: [],
    organizations: [],
    projects: [],
    people: [],
    taskCandidates: [
      {
        title: "Enviar o relatório",
        description: null,
        dueAt: "dueAt" in fields ? fields.dueAt : null,
        waitingOn: null,
        parentIndex: null,
        confidence: 0.8,
        explicit: true,
      },
    ],
    pendingQuestions: [],
    confidence: 0.7,
  };
}

function normalizedDueAt(input: unknown, timeZone = SAO_PAULO): unknown {
  const result = normalizeExtractionInstants(
    extractionWith({ dueAt: input }),
    timeZone,
  ) as { taskCandidates: { dueAt: unknown }[] };
  return result.taskCandidates[0].dueAt;
}

function normalizedOccurredAt(input: unknown, timeZone = SAO_PAULO): unknown {
  const result = normalizeExtractionInstants(
    extractionWith({ occurredAt: input }),
    timeZone,
  ) as { occurredAt: unknown };
  return result.occurredAt;
}

Deno.test("a bare-date dueAt becomes the end of that day in the supplied timezone", () => {
  assertEquals(normalizedDueAt("2026-07-27"), "2026-07-27T23:59:59-03:00");
});

Deno.test("a bare-date occurredAt becomes the start of that day in the supplied timezone", () => {
  assertEquals(normalizedOccurredAt("2026-07-27"), "2026-07-27T00:00:00-03:00");
});

Deno.test("a timezone-less local datetime is resolved in the supplied timezone", () => {
  assertEquals(normalizedDueAt("2026-07-27T14:30:00"), "2026-07-27T14:30:00-03:00");
});

Deno.test("a timezone-less local datetime without seconds is resolved too", () => {
  assertEquals(normalizedDueAt("2026-07-27T14:30"), "2026-07-27T14:30:00-03:00");
});

Deno.test("an already-valid instant is returned byte-for-byte unchanged", () => {
  assertEquals(normalizedDueAt("2026-07-26T23:59:59-03:00"), "2026-07-26T23:59:59-03:00");
});

Deno.test("an already-valid UTC instant keeps its Z designator", () => {
  assertEquals(normalizedDueAt("2026-07-26T23:59:59.250Z"), "2026-07-26T23:59:59.250Z");
});

Deno.test("null dueAt stays null — normalization never invents a deadline", () => {
  assertEquals(normalizedDueAt(null), null);
});

Deno.test("the offset is computed for that date, not for today, so DST zones stay correct", () => {
  // New York is UTC-05:00 in January and UTC-04:00 in July. A fixed
  // current-offset shortcut would put one of these an hour out.
  assertEquals(normalizedDueAt("2026-01-15", "America/New_York"), "2026-01-15T23:59:59-05:00");
  assertEquals(normalizedDueAt("2026-07-15", "America/New_York"), "2026-07-15T23:59:59-04:00");
});

Deno.test("a UTC zone renders the Z designator rather than +00:00", () => {
  assertEquals(normalizedDueAt("2026-07-15", "UTC"), "2026-07-15T23:59:59Z");
});

Deno.test("a local time that does not exist in the zone is left unchanged to fail closed", () => {
  // Lord Howe springs forward 30 minutes at 02:00 on 2026-10-04, so
  // 02:15 local never occurs. Inventing an instant would silently move a
  // deadline; leaving it lets validation reject it.
  assertEquals(
    normalizedDueAt("2026-10-04T02:15:00", "Australia/Lord_Howe"),
    "2026-10-04T02:15:00",
  );
});

Deno.test("a non-calendar date is left unchanged to fail closed", () => {
  assertEquals(normalizedDueAt("2026-02-30"), "2026-02-30");
});

Deno.test("an unknown timezone leaves every value unchanged rather than guessing UTC", () => {
  assertEquals(normalizedDueAt("2026-07-27", "Not/AZone"), "2026-07-27");
});

Deno.test("free text is left unchanged to fail closed", () => {
  assertEquals(normalizedDueAt("next monday"), "next monday");
});

Deno.test("a non-string dueAt is left unchanged to fail closed", () => {
  assertEquals(normalizedDueAt(42), 42);
});

Deno.test("normalization never rewrites a field other than the two instants", () => {
  const input = extractionWith({ dueAt: "2026-07-27" });
  const output = normalizeExtractionInstants(input, SAO_PAULO) as Record<string, unknown>;
  const stripDates = (value: Record<string, unknown>) => {
    const clone = structuredClone(value);
    delete clone.occurredAt;
    (clone.taskCandidates as { dueAt?: unknown }[]).forEach((c) => delete c.dueAt);
    return clone;
  };
  assertEquals(stripDates(output), stripDates(input));
});

Deno.test("normalization does not mutate the parsed input in place", () => {
  const input = extractionWith({ dueAt: "2026-07-27" });
  normalizeExtractionInstants(input, SAO_PAULO);
  assertEquals((input.taskCandidates as { dueAt: unknown }[])[0].dueAt, "2026-07-27");
});

Deno.test("a non-object payload is returned unchanged", () => {
  assertEquals(normalizeExtractionInstants("nope", SAO_PAULO), "nope");
  assertEquals(normalizeExtractionInstants(null, SAO_PAULO), null);
});

Deno.test("the exact production payload that failed now passes validation", () => {
  // Reproduces the linked-project failure observed during the Pre-2E cutover:
  // `Entry extraction output failed validation (taskCandidates.0.dueAt:expected_iso_instant)`.
  const raw = extractionWith({ dueAt: "2026-07-27" });
  assertEquals(validateExtraction(raw).ok, false);
  const normalized = normalizeExtractionInstants(raw, SAO_PAULO);
  const validated = validateExtraction(normalized);
  assertEquals(validated.ok, true);
  if (validated.ok) {
    assertEquals(validated.value.taskCandidates[0].dueAt, "2026-07-27T23:59:59-03:00");
  }
});
