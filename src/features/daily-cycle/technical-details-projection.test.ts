import { describe, expect, it, vi } from "vitest";
import type { InterpretationRevision } from "@/features/interpretations/data";
import { loadInterpretationReview } from "@/features/interpretations/data";
import { isDailyCycleSerializable } from "./contracts";
import { loadEntryTechnicalDetailsProjection, toEntryTechnicalDetailsView } from "./technical-details-projection";

vi.mock("server-only", () => ({}));
vi.mock("@/features/interpretations/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/interpretations/data")>();
  return { ...actual, loadInterpretationReview: vi.fn() };
});

function revision(overrides: Partial<InterpretationRevision> = {}): InterpretationRevision {
  return {
    id: "interp-1",
    version: 1,
    summary: "Ligar para a Marina",
    concepts: ["task"],
    occurredAt: "2026-07-18T09:00:00.000Z",
    extractedDates: [],
    entityLinks: [{ entityType: "person", entityId: "person-1", mention: "Marina", name: "Marina Silva", confidence: 0.9 }],
    classifications: { summary: "fact", concepts: "interpretation", occurredAt: "fact", entities: "inference" },
    pendingQuestions: [],
    trust: {
      summary: { score: 0.92, policy: "auto_apply", signals: { normalizedExactName: 1 }, overrides: [], evidence: ["explicit_user_confirmation"] },
      entities: { score: 0.4, policy: "request_review", signals: { candidateMargin: 0.1 }, overrides: ["low_candidate_margin"], evidence: [] },
    },
    origin: "ai_generated",
    model: "gpt-test",
    confidence: 0.9,
    correctionReason: null,
    createdAt: "2026-07-18T09:00:00.000Z",
    parentInterpretationId: null,
    isRecordOnly: false,
    ...overrides,
  };
}

describe("toEntryTechnicalDetailsView", () => {
  it("fixes the technical contract with per-element scores, policies, signals, evidence, and overrides", () => {
    const current = revision();
    const view = toEntryTechnicalDetailsView({ entryId: "entry-1", current, revisions: [current], extraction: null, tasks: [] });

    expect(view).toMatchObject({
      entryId: "entry-1",
      model: "gpt-test",
      scores: { summary: 0.92, entities: 0.4 },
      policies: { summary: "auto_apply", entities: "request_review" },
      signals: { summary: { normalizedExactName: 1 }, entities: { candidateMargin: 0.1 } },
      evidence: { summary: ["explicit_user_confirmation"], entities: [] },
      overrides: { summary: [], entities: ["low_candidate_margin"] },
    });
  });

  it("returns null when there is no current interpretation to describe technically", () => {
    const view = toEntryTechnicalDetailsView({ entryId: "entry-1", current: null, revisions: [], extraction: null, tasks: [] });

    expect(view).toBeNull();
  });

  it("computes field-level comparisons between consecutive revisions", () => {
    const first = revision({ id: "interp-1", version: 1, summary: "Ligar para a Marina" });
    const second = revision({ id: "interp-2", version: 2, summary: "Ligar para a Marina Silva", parentInterpretationId: "interp-1" });
    const view = toEntryTechnicalDetailsView({ entryId: "entry-1", current: second, revisions: [first, second], extraction: null, tasks: [] });

    expect(view?.comparisons["1-2"]).toEqual([{ field: "summary", before: "Ligar para a Marina", after: "Ligar para a Marina Silva" }]);
  });

  it("records candidate provenance per materialized task", () => {
    const current = revision();
    const view = toEntryTechnicalDetailsView({
      entryId: "entry-1",
      current,
      revisions: [current],
      extraction: null,
      tasks: [{ id: "task-1", title: "Ligar", status: "todo", due_at: null, candidate_index: 0, source_interpretation_id: "interp-1" }],
    });

    expect(view?.provenance["task-1"]).toEqual({ candidateIndex: 0, sourceInterpretationId: "interp-1" });
  });

  it("produces a fully serializable technical DTO", () => {
    const current = revision();
    const view = toEntryTechnicalDetailsView({
      entryId: "entry-1",
      current,
      revisions: [current],
      extraction: {
        language: "pt-BR", occurredAt: "2026-07-18T09:00:00.000Z", isRetroactive: false, summary: "Ligar", concepts: ["task"],
        contexts: [{ name: "Reunião", confidence: 0.7, evidence: "menção direta", inferred: false }],
        organizations: [], projects: [], people: [], taskCandidates: [], pendingQuestions: [], confidence: 0.9,
      },
      tasks: [],
    });

    expect(isDailyCycleSerializable(view)).toBe(true);
    expect(view?.source).toEqual({ language: "pt-BR", overallConfidence: 0.9 });
  });
});

describe("loadEntryTechnicalDetailsProjection", () => {
  it("returns null when the underlying entry cannot be loaded", async () => {
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce(null);

    const result = await loadEntryTechnicalDetailsProjection({} as never, "missing");

    expect(result).toBeNull();
  });

  it("projects the technical view from the shared interpretation-review load", async () => {
    const current = revision();
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: { status: "completed", original_content: "x", occurred_at: "2026-07-18T09:00:00.000Z", processing_error: null } as never,
      current,
      revisions: [current],
      extraction: null,
      entityOptions: [],
      tasks: [],
      taskUndoId: null,
      correctionUndoId: null,
      unavailableCandidateIndexes: [],
    });

    const result = await loadEntryTechnicalDetailsProjection({} as never, "entry-1");

    expect(result?.model).toBe("gpt-test");
  });
});
