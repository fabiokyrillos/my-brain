import { describe, expect, it, vi } from "vitest";
import type { InterpretationRevision } from "@/features/interpretations/data";
import { loadInterpretationReview } from "@/features/interpretations/data";
import { loadEntryReviewProjection, toEntryReviewProjection, type EntryReviewProjectionInput } from "./review-projection";

vi.mock("server-only", () => ({}));
vi.mock("@/features/interpretations/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/interpretations/data")>();
  return { ...actual, loadInterpretationReview: vi.fn() };
});

function revision(overrides: Partial<InterpretationRevision> = {}): InterpretationRevision {
  return {
    id: "interp-1",
    version: 1,
    summary: "Ligar para a Marina sobre o contrato do Atlas",
    concepts: ["task"],
    occurredAt: "2026-07-18T09:00:00.000Z",
    extractedDates: [{ value: "2026-07-19", label: "prazo" }],
    entityLinks: [{ entityType: "person", entityId: "person-1", mention: "Marina", name: "Marina Silva", confidence: 0.9 }],
    classifications: { summary: "fact", concepts: "interpretation", occurredAt: "fact", entities: "inference" },
    pendingQuestions: [],
    trust: {
      summary: { score: 0.9, policy: "auto_apply", signals: { normalizedExactName: 1 }, overrides: [], evidence: ["explicit_user_confirmation"] },
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

function baseInput(overrides: Partial<EntryReviewProjectionInput> = {}): EntryReviewProjectionInput {
  const current = revision();
  return {
    entryId: "entry-1",
    originalContent: "Ligar para a Marina sobre o contrato do Atlas amanhã de manhã.",
    errorMessage: null,
    entryOccurredAt: "2026-07-18T09:00:00.000Z",
    isRetroactive: false,
    current,
    revisions: [current],
    extraction: null,
    entityOptions: [],
    tasks: [],
    taskUndoId: null,
    correctionUndoId: null,
    unavailableCandidateIndexes: [],
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    lifecycle: {
      entryLifecycle: "completed",
      hasValidTaskCandidates: false,
      hasOpenQuestion: false,
      recordOnly: false,
      hasMaterializedTaskForCandidates: false,
      hasConsistencyIssue: false,
    },
    ...overrides,
  };
}

describe("toEntryReviewProjection", () => {
  it("fixes the human contract without any score, policy, or evidence field", () => {
    const projection = toEntryReviewProjection(baseInput());
    const serialized = JSON.stringify(projection.view);

    expect(projection.view).toMatchObject({
      entryId: "entry-1",
      productState: "ready",
      understanding: "Ligar para a Marina sobre o contrato do Atlas",
      hasTechnicalDetails: true,
    });
    expect(serialized).not.toMatch(/score|polic|evidence|signal/i);
    expect(projection.timezone).toBe("America/Sao_Paulo");
  });

  it("derives productState/attentionReason from the shared lifecycle mapper, not from a raw internal status", () => {
    const projection = toEntryReviewProjection(baseInput({
      lifecycle: { entryLifecycle: "awaiting_review" },
    }));

    expect(projection.view.productState).toBe("needs_attention");
  });

  it("omits candidates and hides the confirm action once the interpretation is record-only", () => {
    const current = revision({ isRecordOnly: true });
    const projection = toEntryReviewProjection(baseInput({
      current,
      revisions: [current],
      extraction: {
        language: "pt-BR",
        occurredAt: "2026-07-18T09:00:00.000Z",
        isRetroactive: false,
        summary: "Ligar para a Marina",
        concepts: ["task"],
        contexts: [],
        organizations: [],
        projects: [],
        people: [],
        taskCandidates: [{ title: "Ligar para a Marina", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.9, explicit: true }],
        pendingQuestions: [],
        confidence: 0.9,
      },
      lifecycle: { entryLifecycle: "completed", recordOnly: true, hasValidTaskCandidates: true },
    }));

    expect(projection.view.actionableCandidates).toEqual([]);
    expect(projection.view.availableActions.some((action) => action.id === "confirm_existing_candidates")).toBe(false);
  });

  it("excludes unavailable candidate indexes from actionableCandidates", () => {
    const projection = toEntryReviewProjection(baseInput({
      extraction: {
        language: "pt-BR",
        occurredAt: "2026-07-18T09:00:00.000Z",
        isRetroactive: false,
        summary: "Ligar para a Marina",
        concepts: ["task"],
        contexts: [],
        organizations: [],
        projects: [],
        people: [],
        taskCandidates: [
          { title: "Ligar para a Marina", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.9, explicit: true },
          { title: "Enviar contrato", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.8, explicit: true },
        ],
        pendingQuestions: [],
        confidence: 0.9,
      },
      unavailableCandidateIndexes: [0],
      lifecycle: { entryLifecycle: "completed", hasValidTaskCandidates: true },
    }));

    expect(projection.view.actionableCandidates).toEqual([{ key: "1", title: "Enviar contrato" }]);
  });

  it("does not expose a raw task-candidate list or confidence score outside actionableCandidates (PROJ-005/PROJ-017)", () => {
    const projection = toEntryReviewProjection(baseInput({
      extraction: {
        language: "pt-BR",
        occurredAt: "2026-07-18T09:00:00.000Z",
        isRetroactive: false,
        summary: "Ligar para a Marina",
        concepts: ["task"],
        contexts: [],
        organizations: [],
        projects: [],
        people: [],
        taskCandidates: [{ title: "Ligar para a Marina", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.9, explicit: true }],
        pendingQuestions: [],
        confidence: 0.9,
      },
      lifecycle: { entryLifecycle: "completed", hasValidTaskCandidates: true },
    }));

    expect(projection).not.toHaveProperty("taskCandidates");
    expect(JSON.stringify(projection.view.actionableCandidates)).not.toMatch(/confidence/i);
  });

  it("only includes materialized tasks confirmed under the current interpretation", () => {
    const current = revision({ id: "interp-2", version: 2 });
    const projection = toEntryReviewProjection(baseInput({
      current,
      revisions: [revision(), current],
      tasks: [
        { id: "task-1", title: "Tarefa antiga", status: "todo", due_at: null, candidate_index: 0, source_interpretation_id: "interp-1" },
        { id: "task-2", title: "Tarefa atual", status: "todo", due_at: null, candidate_index: 0, source_interpretation_id: "interp-2" },
      ],
    }));

    expect(projection.view.materializedTasks).toEqual([{ taskId: "task-2", title: "Tarefa atual" }]);
  });

  it("offers retry_processing only when the lifecycle mapper resolves could_not_organize", () => {
    const failed = toEntryReviewProjection(baseInput({
      current: null,
      revisions: [],
      lifecycle: { entryLifecycle: "terminal_error" },
    }));
    const ready = toEntryReviewProjection(baseInput());

    expect(failed.view.availableActions.some((action) => action.id === "retry_processing")).toBe(true);
    expect(ready.view.availableActions.some((action) => action.id === "retry_processing")).toBe(false);
  });

  it("preserves the original content and isRetroactive flag even without an interpretation yet", () => {
    const projection = toEntryReviewProjection(baseInput({
      current: null,
      revisions: [],
      isRetroactive: true,
      lifecycle: { entryLifecycle: "recoverable_error" },
    }));

    expect(projection.view.original).toEqual({
      content: "Ligar para a Marina sobre o contrato do Atlas amanhã de manhã.",
      occurredAt: "2026-07-18T09:00:00.000Z",
      isRetroactive: true,
    });
    expect(projection.view.hasTechnicalDetails).toBe(false);
    expect(projection.editableCurrent).toBeNull();
  });

  it("keeps the human view serializable per the daily-cycle contract", async () => {
    const { isDailyCycleSerializable } = await import("./contracts");
    const projection = toEntryReviewProjection(baseInput());

    expect(isDailyCycleSerializable(projection.view)).toBe(true);
  });
});

function queryStub(result: { data: unknown; error: unknown }) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "maybeSingle"]) stub[method] = vi.fn(() => stub);
  stub.then = (onFulfilled: (value: typeof result) => unknown) => Promise.resolve(result).then(onFulfilled);
  return stub;
}

describe("loadEntryReviewProjection", () => {
  it("returns null when the underlying entry cannot be loaded (ownership/not-found)", async () => {
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce(null);
    const client = { from: vi.fn(() => queryStub({ data: null, error: null })) };

    const result = await loadEntryReviewProjection(client as never, { entryId: "missing", locale: "pt-BR" });

    expect(result).toBeNull();
  });

  it("loads the authenticated profile timezone through the review projection boundary", async () => {
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: {
        status: "completed",
        original_content: "Texto original",
        occurred_at: "2026-07-18T09:00:00.000Z",
        processing_error: null,
      } as never,
      current: null,
      revisions: [],
      extraction: null,
      entityOptions: [],
      tasks: [],
      taskUndoId: null,
      correctionUndoId: null,
      unavailableCandidateIndexes: [],
    });
    const jobsStub = queryStub({ data: null, error: null });
    const questionsStub = queryStub({ data: [], error: null });
    const profileStub = queryStub({ data: { timezone: "America/New_York" }, error: null });
    const relationStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => {
      if (table === "jobs") return jobsStub;
      if (table === "pending_questions") return questionsStub;
      if (table === "profiles") return profileStub;
      return relationStub;
    });

    const result = await loadEntryReviewProjection(
      { from } as never,
      { entryId: "entry-1", locale: "en", userId: "user-1" },
    );

    expect(from).toHaveBeenCalledWith("profiles");
    expect(profileStub.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(result?.timezone).toBe("America/New_York");
  });

  it("keeps productState at needs_attention when one of two current-interpretation candidates is still unconfirmed (F1 regression)", async () => {
    const current = revision();
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: { status: "completed", original_content: "Texto original", occurred_at: "2026-07-18T09:00:00.000Z", processing_error: null } as never,
      current,
      revisions: [current],
      extraction: {
        language: "pt-BR",
        occurredAt: "2026-07-18T09:00:00.000Z",
        isRetroactive: false,
        summary: "Ligar para a Marina",
        concepts: ["task"],
        contexts: [],
        organizations: [],
        projects: [],
        people: [],
        taskCandidates: [
          { title: "Ligar para a Marina", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.9, explicit: true },
          { title: "Enviar contrato", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.8, explicit: true },
        ],
        pendingQuestions: [],
        confidence: 0.9,
      },
      entityOptions: [],
      tasks: [{ id: "task-1", title: "Ligar para a Marina", status: "todo", due_at: null, candidate_index: 0, source_interpretation_id: "interp-1" }],
      taskUndoId: null,
      correctionUndoId: null,
      unavailableCandidateIndexes: [0],
    });

    const jobsStub = queryStub({ data: null, error: null });
    const questionsStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => (table === "jobs" ? jobsStub : questionsStub));
    const client = { from };

    const result = await loadEntryReviewProjection(client as never, { entryId: "entry-1", locale: "pt-BR" });

    expect(result?.view.productState).toBe("needs_attention");
    expect(result?.view.attentionItems[0]?.reason).toBe("confirm_existing_candidates");
    expect(result?.view.actionableCandidates).toEqual([{ key: "1", title: "Enviar contrato" }]);
  });

  it("resolves productState to ready once both current-interpretation candidates are confirmed", async () => {
    const current = revision();
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: { status: "completed", original_content: "Texto original", occurred_at: "2026-07-18T09:00:00.000Z", processing_error: null } as never,
      current,
      revisions: [current],
      extraction: {
        language: "pt-BR",
        occurredAt: "2026-07-18T09:00:00.000Z",
        isRetroactive: false,
        summary: "Ligar para a Marina",
        concepts: ["task"],
        contexts: [],
        organizations: [],
        projects: [],
        people: [],
        taskCandidates: [
          { title: "Ligar para a Marina", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.9, explicit: true },
          { title: "Enviar contrato", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.8, explicit: true },
        ],
        pendingQuestions: [],
        confidence: 0.9,
      },
      entityOptions: [],
      tasks: [
        { id: "task-1", title: "Ligar para a Marina", status: "todo", due_at: null, candidate_index: 0, source_interpretation_id: "interp-1" },
        { id: "task-2", title: "Enviar contrato", status: "todo", due_at: null, candidate_index: 1, source_interpretation_id: "interp-1" },
      ],
      taskUndoId: null,
      correctionUndoId: null,
      unavailableCandidateIndexes: [0, 1],
    });

    const jobsStub = queryStub({ data: null, error: null });
    const questionsStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => (table === "jobs" ? jobsStub : questionsStub));
    const client = { from };

    const result = await loadEntryReviewProjection(client as never, { entryId: "entry-1", locale: "pt-BR" });

    expect(result?.view.productState).toBe("ready");
    expect(result?.view.actionableCandidates).toEqual([]);
  });

  it("does not let a task from an older interpretation mark the current candidate as handled", async () => {
    const current = revision({ id: "interp-2", version: 2 });
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: { status: "completed", original_content: "Texto original", occurred_at: "2026-07-18T09:00:00.000Z", processing_error: null } as never,
      current,
      revisions: [revision(), current],
      extraction: {
        language: "pt-BR",
        occurredAt: "2026-07-18T09:00:00.000Z",
        isRetroactive: false,
        summary: "Ligar para a Marina",
        concepts: ["task"],
        contexts: [],
        organizations: [],
        projects: [],
        people: [],
        taskCandidates: [
          { title: "Ligar para a Marina", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.9, explicit: true },
        ],
        pendingQuestions: [],
        confidence: 0.9,
      },
      entityOptions: [],
      // Task exists for the entry, but from the older interpretation "interp-1" — must not cover interp-2's candidate.
      tasks: [{ id: "task-1", title: "Ligar para a Marina", status: "todo", due_at: null, candidate_index: 0, source_interpretation_id: "interp-1" }],
      taskUndoId: null,
      correctionUndoId: null,
      unavailableCandidateIndexes: [],
    });

    const jobsStub = queryStub({ data: null, error: null });
    const questionsStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => (table === "jobs" ? jobsStub : questionsStub));
    const client = { from };

    const result = await loadEntryReviewProjection(client as never, { entryId: "entry-1", locale: "pt-BR" });

    expect(result?.view.productState).toBe("needs_attention");
    expect(result?.view.attentionItems[0]?.reason).toBe("confirm_existing_candidates");
  });

  it("does not let a task materialized for a mismatched candidate index mark the remaining candidate as handled", async () => {
    const current = revision();
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: { status: "completed", original_content: "Texto original", occurred_at: "2026-07-18T09:00:00.000Z", processing_error: null } as never,
      current,
      revisions: [current],
      extraction: {
        language: "pt-BR",
        occurredAt: "2026-07-18T09:00:00.000Z",
        isRetroactive: false,
        summary: "Ligar para a Marina",
        concepts: ["task"],
        contexts: [],
        organizations: [],
        projects: [],
        people: [],
        taskCandidates: [
          { title: "Ligar para a Marina", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.9, explicit: true },
          { title: "Enviar contrato", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 0.8, explicit: true },
        ],
        pendingQuestions: [],
        confidence: 0.9,
      },
      entityOptions: [],
      // Only candidate_index 0 is materialized under the current interpretation — index 1 remains uncovered.
      tasks: [{ id: "task-1", title: "Ligar para a Marina", status: "todo", due_at: null, candidate_index: 0, source_interpretation_id: "interp-1" }],
      taskUndoId: null,
      correctionUndoId: null,
      unavailableCandidateIndexes: [0],
    });

    const jobsStub = queryStub({ data: null, error: null });
    const questionsStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => (table === "jobs" ? jobsStub : questionsStub));
    const client = { from };

    const result = await loadEntryReviewProjection(client as never, { entryId: "entry-1", locale: "pt-BR" });

    expect(result?.view.productState).toBe("needs_attention");
    expect(result?.view.actionableCandidates).toEqual([{ key: "1", title: "Enviar contrato" }]);
  });

  it("stays ready when the interpretation has zero task candidates", async () => {
    const current = revision();
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: { status: "completed", original_content: "Texto original", occurred_at: "2026-07-18T09:00:00.000Z", processing_error: null } as never,
      current,
      revisions: [current],
      extraction: null,
      entityOptions: [],
      tasks: [],
      taskUndoId: null,
      correctionUndoId: null,
      unavailableCandidateIndexes: [],
    });

    const jobsStub = queryStub({ data: null, error: null });
    const questionsStub = queryStub({ data: [], error: null });
    const from = vi.fn((table: string) => (table === "jobs" ? jobsStub : questionsStub));
    const client = { from };

    const result = await loadEntryReviewProjection(client as never, { entryId: "entry-1", locale: "pt-BR" });

    expect(result?.view.productState).toBe("ready");
  });

  it("feeds the entry lifecycle, job status, and open question signal into the lifecycle mapper", async () => {
    const current = revision();
    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: { status: "completed", original_content: "Texto original", occurred_at: "2026-07-18T09:00:00.000Z", processing_error: null } as never,
      current,
      revisions: [current],
      extraction: null,
      entityOptions: [],
      tasks: [],
      taskUndoId: null,
      correctionUndoId: null,
      unavailableCandidateIndexes: [],
    });

    const jobsStub = queryStub({ data: null, error: null });
    const questionsStub = queryStub({ data: [{ id: "question-1" }], error: null });
    const from = vi.fn((table: string) => (table === "jobs" ? jobsStub : questionsStub));
    const client = { from };

    const result = await loadEntryReviewProjection(client as never, { entryId: "entry-1", locale: "pt-BR" });

    expect(result?.view.productState).toBe("needs_attention");
    expect(result?.view.attentionItems[0]?.reason).toBe("answer_existing_question");
  });
});
