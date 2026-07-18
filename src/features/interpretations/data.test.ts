import { describe, expect, it } from "vitest";
import { computeUnavailableCandidateIndexes, parseInterpretationRevision, selectCurrentInterpretation } from "./data";

const base = {
  id: "interpretation-1",
  entry_id: "entry-1",
  version: 1,
  summary: "Resumo",
  concepts: ["person_note"],
  raw_output: {},
  extracted_dates: [{ value: "2026-07-18", label: "prazo" }],
  element_classifications: { summary: "fact", concepts: "interpretation", occurredAt: "fact", entities: "inference" },
  element_confidence: { summary: 0.8 },
  element_policy: { summary: "apply_and_flag" },
  resolution_evidence: { summary: { signals: {}, overrides: [], evidence: ["explicit"] } },
  pending_questions: [{ question: "Qual projeto?", reason: "ambíguo", confidence: 0.4 }],
  origin: "user_corrected",
  parent_interpretation_id: null,
  corrected_by: "user-1",
  correction_reason: "confirmado",
  created_at: "2026-07-17T14:00:00.000Z",
  model: "gpt-test",
  confidence: 0.8,
  is_record_only: false,
};

describe("interpretation review data", () => {
  it("honors the entry current pointer instead of assuming the highest version", () => {
    const current = selectCurrentInterpretation(
      { current_interpretation_id: "interpretation-1" },
      [{ ...base, id: "interpretation-2", version: 2 }, base],
    );

    expect(current?.id).toBe("interpretation-1");
  });

  it("parses persisted JSON defensively and resolves owned entity display names", () => {
    const revision = parseInterpretationRevision(
      base,
      [{ interpretation_id: "interpretation-1", entity_type: "person", entity_id: "person-1", mention: "Marina", confidence: 0.9 }],
      new Map([["person:person-1", "Marina Silva"]]),
      "2026-07-17T14:00:00.000Z",
    );

    expect(revision.extractedDates).toEqual([{ value: "2026-07-18", label: "prazo" }]);
    expect(revision.entityLinks).toEqual([{ entityType: "person", entityId: "person-1", mention: "Marina", name: "Marina Silva", confidence: 0.9 }]);
    expect(revision.pendingQuestions[0]?.question).toBe("Qual projeto?");
    expect(revision.trust.summary).toMatchObject({ score: 0.8, policy: "apply_and_flag", evidence: ["explicit"] });
    expect(revision.isRecordOnly).toBe(false);
  });

  it("carries a persisted record-only flag onto the parsed revision", () => {
    const revision = parseInterpretationRevision(
      { ...base, is_record_only: true },
      [],
      new Map(),
      "2026-07-17T14:00:00.000Z",
    );

    expect(revision.isRecordOnly).toBe(true);
  });
});

describe("computeUnavailableCandidateIndexes", () => {
  it("returns nothing when there is no current interpretation", () => {
    expect(computeUnavailableCandidateIndexes(null, [
      { candidate_index: 0, source_interpretation_id: "interpretation-1" },
    ])).toEqual([]);
  });

  it("marks a candidate unavailable when it was confirmed under the current interpretation", () => {
    expect(computeUnavailableCandidateIndexes("interpretation-2", [
      { candidate_index: 0, source_interpretation_id: "interpretation-2" },
      { candidate_index: 1, source_interpretation_id: "interpretation-2" },
    ])).toEqual([0, 1]);
  });

  it("does not mark a candidate unavailable when it belongs to a different, older interpretation", () => {
    expect(computeUnavailableCandidateIndexes("interpretation-2", [
      { candidate_index: 0, source_interpretation_id: "interpretation-1" },
    ])).toEqual([]);
  });

  it("conservatively treats provenance-less legacy tasks as unavailable, since consistency cannot be proven", () => {
    expect(computeUnavailableCandidateIndexes("interpretation-2", [
      { candidate_index: 0, source_interpretation_id: null },
    ])).toEqual([0]);
  });

  it("ignores tasks with no candidate index and de-duplicates indexes", () => {
    expect(computeUnavailableCandidateIndexes("interpretation-2", [
      { candidate_index: null, source_interpretation_id: "interpretation-2" },
      { candidate_index: 2, source_interpretation_id: "interpretation-2" },
      { candidate_index: 2, source_interpretation_id: "interpretation-2" },
    ])).toEqual([2]);
  });
});
