import { describe, expect, it, vi } from "vitest";

// F1 regression: Inbox/Home (loadInboxProjection) and the entry-detail Review
// page (loadEntryReviewProjection) must resolve the same productState for the
// same entry — both now derive hasMaterializedTaskForCandidates from the same
// interpretation-scoped candidate-consistency computation
// (computeUnavailableCandidateIndexes / hasUnconfirmedTaskCandidates) instead
// of two independently-diverging entry-wide checks.

vi.mock("server-only", () => ({}));
vi.mock("@/features/interpretations/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/interpretations/data")>();
  return { ...actual, loadInterpretationReview: vi.fn() };
});

const { loadInboxProjection } = await import("./inbox-projection");
const { loadInterpretationReview } = await import("@/features/interpretations/data");
const { loadEntryReviewProjection } = await import("./review-projection");

function queryStub(result: { data: unknown; error: unknown }) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "in", "or", "order", "range", "limit", "maybeSingle"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.then = (onFulfilled: (value: typeof result) => unknown) => Promise.resolve(result).then(onFulfilled);
  return stub;
}

describe("Inbox and Review lifecycle consistency (F1 regression)", () => {
  it("both resolve needs_attention/confirm_existing_candidates for an entry with one confirmed and one unconfirmed current-interpretation candidate", async () => {
    const inboxClient = {
      from: vi.fn((table: string) => {
        if (table === "entries") {
          return queryStub({
            data: [{
              id: "entry-1",
              original_content: "Ligar para a Marina sobre o contrato do Atlas.",
              status: "completed",
              occurred_at: "2026-07-18T09:00:00.000Z",
              created_at: "2026-07-18T09:00:00.000Z",
              current_interpretation_id: "interp-1",
            }],
            error: null,
          });
        }
        if (table === "entry_interpretations") {
          return queryStub({
            data: [{ id: "interp-1", summary: "Ligar para a Marina", task_candidates: [{ title: "Ligar para a Marina" }, { title: "Enviar contrato" }] }],
            error: null,
          });
        }
        if (table === "tasks") {
          return queryStub({
            data: [{ source_entry_id: "entry-1", source_interpretation_id: "interp-1", candidate_index: 0 }],
            error: null,
          });
        }
        return queryStub({ data: [], error: null });
      }),
    };

    const inboxPage = await loadInboxProjection(inboxClient as never, { locale: "pt-BR", page: 1 });

    vi.mocked(loadInterpretationReview).mockResolvedValueOnce({
      entry: { status: "completed", original_content: "Ligar para a Marina sobre o contrato do Atlas.", occurred_at: "2026-07-18T09:00:00.000Z", processing_error: null } as never,
      current: {
        id: "interp-1",
        version: 1,
        summary: "Ligar para a Marina",
        concepts: ["task"],
        occurredAt: "2026-07-18T09:00:00.000Z",
        extractedDates: [],
        entityLinks: [],
        classifications: { summary: "fact", concepts: "interpretation", occurredAt: "fact", entities: "inference" },
        pendingQuestions: [],
        trust: {},
        origin: "ai_generated",
        model: "gpt-test",
        confidence: 0.9,
        correctionReason: null,
        createdAt: "2026-07-18T09:00:00.000Z",
        parentInterpretationId: null,
        isRecordOnly: false,
      },
      revisions: [],
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
    const reviewClient = { from: vi.fn(() => queryStub({ data: null, error: null })) };
    const reviewProjection = await loadEntryReviewProjection(reviewClient as never, { entryId: "entry-1", locale: "pt-BR" });

    expect(inboxPage.items[0]).toMatchObject({ productState: "needs_attention", attentionReason: "confirm_existing_candidates" });
    expect(reviewProjection?.view).toMatchObject({ productState: "needs_attention" });
    expect(reviewProjection?.view.attentionItems[0]?.reason).toBe("confirm_existing_candidates");
    expect(inboxPage.items[0].productState).toBe(reviewProjection?.view.productState);
  });
});
