import { beforeEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { answerPendingQuestion, undoQuestionResolution } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "66666666-6666-5666-8666-666666666666"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));
vi.mock("@/lib/jobs/entry-worker", () => ({ kickEntryInterpretationWorker: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/preferences", () => ({ defaultAgentPreferences: {} }));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn() }));

const questionId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const undoId = "9b8ff364-1adf-4f7a-8d40-4fbcbcfc1131";
const operationKey = "3f8e6f0a-95a3-4f0f-a5a6-1af5a7d2b901";

const idleState = {
  status: "idle" as const,
  code: null,
  message: "",
  undoId: null,
  replayed: false,
  retryable: false,
};

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set("locale", "pt-BR");
  data.set("questionId", questionId);
  data.set("answer", "Resposta privada que nunca entra no evento");
  data.set("operationKey", operationKey);
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

type RpcOutcome = { data: unknown; error: unknown };

function resolutionClient(outcome: RpcOutcome, user: { id: string } | null = { id: "user-1" }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    rpc: vi.fn(async () => outcome),
  };
}

function successOutcome(idempotent = false): RpcOutcome {
  return {
    data: { question_id: questionId, resolution: "answered", undo_id: undoId, idempotent },
    error: null,
  };
}

async function flushAfter() {
  await Promise.all(vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

describe("answerPendingQuestion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves through resolve_pending_question_v1 with the closed payload and operation key", async () => {
    const client = resolutionClient(successOutcome());
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await answerPendingQuestion(idleState, form({ answer: "  Sexta às 14h  " }));

    expect(result.status).toBe("success");
    expect(result.code).toBe("resolution_succeeded");
    expect(result.undoId).toBe(undoId);
    expect(result.replayed).toBe(false);
    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v1", {
      p_question_id: questionId,
      p_resolution: { kind: "answer", answer: "Sexta às 14h" },
      p_operation_key: operationKey,
    });
  });

  it("emits only a content-free event keyed by the operation key after success", async () => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient(successOutcome()) as never);

    const result = await answerPendingQuestion(idleState, form());

    expect(result.status).toBe("success");
    expect(recordProductEvent).not.toHaveBeenCalled();
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "question_answered_basic",
      subject: { type: "pending_question", id: questionId },
      properties: {},
    }));
    expect(JSON.stringify(vi.mocked(recordProductEvent).mock.calls[0][0])).not.toContain("Resposta privada");
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith("question_answered_basic", operationKey);
  });

  it("does not re-emit the event on an idempotent replay", async () => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient(successOutcome(true)) as never);

    const result = await answerPendingQuestion(idleState, form());

    expect(result.status).toBe("success");
    expect(result.replayed).toBe(true);
    expect(result.undoId).toBe(undoId);
    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid command before calling the database", async () => {
    const client = resolutionClient(successOutcome());
    vi.mocked(createClient).mockResolvedValue(client as never);

    const missingKey = new FormData();
    missingKey.set("locale", "pt-BR");
    missingKey.set("questionId", questionId);
    missingKey.set("answer", "ok");
    const keyResult = await answerPendingQuestion(idleState, missingKey);
    expect(keyResult.status).toBe("error");
    expect(keyResult.code).toBe("validation_error");

    const blankResult = await answerPendingQuestion(idleState, form({ answer: "   " }));
    expect(blankResult.code).toBe("validation_error");

    const overlongResult = await answerPendingQuestion(idleState, form({ answer: "a".repeat(4001) }));
    expect(overlongResult.code).toBe("validation_error");

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("maps the session boundary before any database call", async () => {
    const client = resolutionClient(successOutcome(), null);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await answerPendingQuestion(idleState, form());

    expect(result.status).toBe("error");
    expect(result.code).toBe("session_expired");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "55P03", message: "Interpretation is no longer current" }, "stale_interpretation", false],
    [{ code: "55000", message: "Question is not open" }, "not_open", false],
    [{ code: "P0002", message: "Pending question not found" }, "not_open", false],
    [{ code: "P0001", message: "Operation key payload mismatch", details: "2D_IDEMPOTENCY_MISMATCH" }, "idempotency_mismatch", false],
    [{ code: "22023", message: "Invalid answer" }, "validation_error", false],
    [{ code: "42501", message: "Authentication required" }, "session_expired", false],
    [{ code: "XX000", message: "internal" }, "retryable_failure", true],
  ] as const)("maps the database failure %o to a stable code", async (error, code, retryable) => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient({ data: null, error }) as never);

    const result = await answerPendingQuestion(idleState, form());

    expect(result.status).toBe("error");
    expect(result.code).toBe(code);
    expect(result.retryable).toBe(retryable);
    expect(result.message).not.toContain(error.message);
    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("localizes the stable codes in English", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient({ data: null, error: { code: "55P03", message: "Interpretation is no longer current" } }) as never,
    );

    const result = await answerPendingQuestion(idleState, form({ locale: "en" }));

    expect(result.code).toBe("stale_interpretation");
    expect(result.message).toBe("This question's interpretation changed. Refresh the page before answering.");
  });

  it("treats an unreadable result shape as retryable", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient({ data: { unexpected: true }, error: null }) as never,
    );

    const result = await answerPendingQuestion(idleState, form());

    expect(result.status).toBe("error");
    expect(result.code).toBe("retryable_failure");
    expect(result.retryable).toBe(true);
  });
});

describe("undoQuestionResolution", () => {
  beforeEach(() => vi.clearAllMocks());

  function undoForm(locale = "pt-BR") {
    const data = new FormData();
    data.set("locale", locale);
    data.set("questionId", questionId);
    data.set("undoId", undoId);
    return data;
  }

  it("executes the stored compensating operation", async () => {
    const client = resolutionClient({ data: { undone: true, affected: 1, idempotent: false }, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await undoQuestionResolution({ status: "idle", message: "" }, undoForm());

    expect(result.status).toBe("success");
    expect(client.rpc).toHaveBeenCalledWith("undo_operation", { p_undo_id: undoId });
  });

  it("maps undo failures without leaking raw error text", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient({ data: null, error: { code: "P0002", message: "Undo operation not found" } }) as never,
    );

    const result = await undoQuestionResolution({ status: "idle", message: "" }, undoForm("en"));

    expect(result.status).toBe("error");
    expect(result.message).toBe("Could not undo.");
  });

  it("rejects a malformed undo reference without calling the database", async () => {
    const client = resolutionClient({ data: null, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const data = new FormData();
    data.set("locale", "pt-BR");
    data.set("undoId", "not-a-uuid");
    const result = await undoQuestionResolution({ status: "idle", message: "" }, data);

    expect(result.status).toBe("error");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
