import { beforeEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { answerPendingQuestion, resolvePendingQuestion, undoQuestionResolution } from "./actions";
import { loadQuestionSuggestions } from "./question-preview-projection";
import type { QuestionSuggestion } from "./question-suggestions";

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
vi.mock("./question-preview-projection", () => ({ loadQuestionSuggestions: vi.fn(async () => []) }));

const questionId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const undoId = "9b8ff364-1adf-4f7a-8d40-4fbcbcfc1131";
const operationKey = "3f8e6f0a-95a3-4f0f-a5a6-1af5a7d2b901";

const idleState = {
  status: "idle" as const,
  code: null,
  message: "",
  resolution: null,
  snoozedUntil: null,
  consequence: null,
  consequenceStatus: null,
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

function dispositionForm(kind: string, overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set("locale", "pt-BR");
  data.set("questionId", questionId);
  data.set("kind", kind);
  data.set("operationKey", operationKey);
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

function futureInstant(offsetMs = 86_400_000): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

type RpcOutcome = { data: unknown; error: unknown };

function resolutionClient(outcome: RpcOutcome, user: { id: string } | null = { id: "user-1" }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    rpc: vi.fn(async () => outcome),
  };
}

function successOutcome(
  idempotent = false,
  resolution = "answered",
  snoozedUntil?: string,
  consequence: "none" | "reinterpret" = "none",
): RpcOutcome {
  return {
    data: {
      question_id: questionId,
      resolution,
      consequence,
      consequence_status: consequence === "reinterpret" ? "reinterpretation_queued" : "none",
      undo_id: undoId,
      idempotent,
      ...(snoozedUntil ? { snoozed_until: snoozedUntil } : {}),
    },
    error: null,
  };
}

async function flushAfter() {
  await Promise.all(vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

describe("answerPendingQuestion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves through resolve_pending_question_v3 with the closed payload and operation key", async () => {
    const client = resolutionClient(successOutcome());
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await answerPendingQuestion(idleState, form({ answer: "  Sexta às 14h  " }));

    expect(result.status).toBe("success");
    expect(result.code).toBe("resolution_succeeded");
    expect(result.resolution).toBe("answered");
    expect(result.undoId).toBe(undoId);
    expect(result.replayed).toBe(false);
    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v3", {
      p_question_id: questionId,
      p_resolution: { kind: "answer", answer: "Sexta às 14h", consequence: "none" },
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
      properties: { origin: "typed" },
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
    expect(result.message).toBe("This question's interpretation changed. Refresh the page before resolving.");
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

// Phase 2D Slice 2D.3 — suggestion provenance is authenticated server-side and
// never widens the closed database write shape.
describe("suggestion-originated answers", () => {
  const presented: QuestionSuggestion[] = [
    { id: "person:ana-prado", value: "Ana Prado", label: "Ana Prado", kind: "person" },
    { id: "person:bruno-lima", value: "Bruno Lima", label: "Bruno Lima", kind: "person" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadQuestionSuggestions).mockResolvedValue(presented);
  });

  it("records `suggested` when the submitted id was presented and matches the answer", async () => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient(successOutcome()) as never);

    const result = await answerPendingQuestion(
      idleState,
      form({ answer: "Ana Prado", suggestionId: "person:ana-prado" }),
    );

    expect(result.status).toBe("success");
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "question_answered_basic",
      properties: { origin: "suggested" },
    }));
  });

  it("re-derives the options server-side rather than trusting the browser", async () => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient(successOutcome()) as never);

    await answerPendingQuestion(idleState, form({ answer: "Ana Prado", suggestionId: "person:ana-prado" }));

    expect(loadQuestionSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      questionId,
      "pt-BR",
    );
  });

  it("keeps the closed database payload byte-identical for a suggestion-originated answer", async () => {
    const client = resolutionClient(successOutcome());
    vi.mocked(createClient).mockResolvedValue(client as never);

    await answerPendingQuestion(idleState, form({ answer: "Ana Prado", suggestionId: "person:ana-prado" }));

    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v3", {
      p_question_id: questionId,
      p_resolution: { kind: "answer", answer: "Ana Prado", consequence: "none" },
      p_operation_key: operationKey,
    });
    expect(JSON.stringify(client.rpc.mock.calls[0])).not.toContain("person:ana-prado");
  });

  it("downgrades a forged suggestion id to a typed answer without failing the resolution", async () => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient(successOutcome()) as never);

    const result = await answerPendingQuestion(
      idleState,
      form({ answer: "Carla Souza", suggestionId: "person:carla-souza" }),
    );

    expect(result.status).toBe("success");
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      properties: { origin: "typed" },
    }));
  });

  it("downgrades a presented id whose value no longer matches the submitted answer", async () => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient(successOutcome()) as never);

    const result = await answerPendingQuestion(
      idleState,
      form({ answer: "Ana Prado e o Bruno", suggestionId: "person:ana-prado" }),
    );

    expect(result.status).toBe("success");
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      properties: { origin: "typed" },
    }));
  });

  it("ignores a malformed suggestion id without re-deriving options", async () => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient(successOutcome()) as never);

    const result = await answerPendingQuestion(
      idleState,
      form({ answer: "Ana Prado", suggestionId: "<script>alert(1)</script>" }),
    );

    expect(result.status).toBe("success");
    expect(loadQuestionSuggestions).not.toHaveBeenCalled();
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      properties: { origin: "typed" },
    }));
  });

  it("never re-derives options for a non-answer disposition", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient(successOutcome(false, "dismissed")) as never,
    );

    await resolvePendingQuestion(idleState, dispositionForm("dismissed", { suggestionId: "person:ana-prado" }));

    expect(loadQuestionSuggestions).not.toHaveBeenCalled();
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "question_resolved",
      properties: { kind: "dismissed" },
    }));
  });

  it("emits no analytics at all when the resolution itself did not persist", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient({ data: null, error: { code: "55P03" } }) as never,
    );

    const result = await answerPendingQuestion(
      idleState,
      form({ answer: "Ana Prado", suggestionId: "person:ana-prado" }),
    );

    expect(result.code).toBe("stale_interpretation");
    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });
});

describe("resolvePendingQuestion dispositions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defers through the closed deferral payload and surfaces the canonical instant", async () => {
    const snoozedUntil = futureInstant();
    const client = resolutionClient(successOutcome(false, "deferred", snoozedUntil));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await resolvePendingQuestion(
      idleState,
      dispositionForm("deferred", { snoozedUntil }),
    );

    expect(result.status).toBe("success");
    expect(result.resolution).toBe("deferred");
    expect(result.snoozedUntil).toBe(snoozedUntil);
    expect(result.message).toBe("Pergunta adiada.");
    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v3", {
      p_question_id: questionId,
      p_resolution: { kind: "deferred", snoozedUntil },
      p_operation_key: operationKey,
    });
  });

  it("rejects a past or malformed deferral before any database call with the deferral copy", async () => {
    const client = resolutionClient(successOutcome(false, "deferred"));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const past = await resolvePendingQuestion(
      idleState,
      dispositionForm("deferred", { snoozedUntil: "2020-01-01T00:00:00Z" }),
    );
    expect(past.code).toBe("validation_error");
    expect(past.message).toBe("Escolha uma data futura, em até um ano, para adiar.");

    const malformed = await resolvePendingQuestion(
      idleState,
      dispositionForm("deferred", { snoozedUntil: "amanhã" }),
    );
    expect(malformed.code).toBe("validation_error");

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("dismisses with a payload carrying only the discriminant", async () => {
    const client = resolutionClient(successOutcome(false, "dismissed"));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await resolvePendingQuestion(idleState, dispositionForm("dismissed"));

    expect(result.resolution).toBe("dismissed");
    expect(result.message).toBe("Pergunta descartada.");
    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v3", {
      p_question_id: questionId,
      p_resolution: { kind: "dismissed" },
      p_operation_key: operationKey,
    });
  });

  it("marks not relevant distinctly", async () => {
    const client = resolutionClient(successOutcome(false, "not_relevant"));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await resolvePendingQuestion(idleState, dispositionForm("not_relevant"));

    expect(result.resolution).toBe("not_relevant");
    expect(result.message).toBe("Pergunta marcada como não relevante.");
    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v3", {
      p_question_id: questionId,
      p_resolution: { kind: "not_relevant" },
      p_operation_key: operationKey,
    });
  });

  it("rejects an unknown kind before any database call", async () => {
    const client = resolutionClient(successOutcome());
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await resolvePendingQuestion(idleState, dispositionForm("reinterpret"));

    expect(result.status).toBe("error");
    expect(result.code).toBe("validation_error");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("emits question_resolved with only the bounded kind for a disposition", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient(successOutcome(false, "dismissed")) as never,
    );

    const result = await resolvePendingQuestion(idleState, dispositionForm("dismissed"));

    expect(result.status).toBe("success");
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "question_resolved",
      subject: { type: "pending_question", id: questionId },
      properties: { kind: "dismissed" },
    }));
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith("question_resolved", operationKey);
  });

  it("never puts the deferral instant, question, or free text into the event payload", async () => {
    const snoozedUntil = futureInstant();
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient(successOutcome(false, "deferred", snoozedUntil)) as never,
    );

    await resolvePendingQuestion(idleState, dispositionForm("deferred", { snoozedUntil }));
    await flushAfter();

    const eventPayload = vi.mocked(recordProductEvent).mock.calls[0][0];
    expect(eventPayload).toMatchObject({ name: "question_resolved", properties: { kind: "deferred" } });
    expect(JSON.stringify(eventPayload)).not.toContain(snoozedUntil);
  });

  it("suppresses the disposition event on an idempotent replay", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient(successOutcome(true, "not_relevant")) as never,
    );

    const result = await resolvePendingQuestion(idleState, dispositionForm("not_relevant"));

    expect(result.replayed).toBe(true);
    expect(result.message).toBe("Esta resolução já estava registrada.");
    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });
});

// Phase 2D Slice 2D.4 — the confirmed consequence.
describe("resolvePendingQuestion confirmed consequence", () => {
  beforeEach(() => vi.clearAllMocks());

  function answerForm(overrides = {}) {
    return form({ kind: "answer", ...overrides });
  }

  it("never asks for a consequence when the form did not submit one", async () => {
    const client = resolutionClient(successOutcome());
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await resolvePendingQuestion(idleState, answerForm());

    expect(result.consequence).toBe("none");
    expect(result.consequenceStatus).toBe("none");
    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v3", {
      p_question_id: questionId,
      p_resolution: expect.objectContaining({ consequence: "none" }),
      p_operation_key: operationKey,
    });
  });

  it("forwards an explicitly confirmed reinterpretation and reports the truthful result", async () => {
    const client = resolutionClient(successOutcome(false, "answered", undefined, "reinterpret"));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await resolvePendingQuestion(
      idleState,
      answerForm({ answer: "Sexta às 14h", consequence: "reinterpret" }),
    );

    expect(result.status).toBe("success");
    expect(result.consequence).toBe("reinterpret");
    expect(result.consequenceStatus).toBe("reinterpretation_queued");
    expect(result.message).toBe("Resposta registrada. A reinterpretação deste registro foi enfileirada.");
    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v3", {
      p_question_id: questionId,
      p_resolution: { kind: "answer", answer: "Sexta às 14h", consequence: "reinterpret" },
      p_operation_key: operationKey,
    });
  });

  it("rejects a consequence outside the closed enum before any database call", async () => {
    const client = resolutionClient(successOutcome());
    vi.mocked(createClient).mockResolvedValue(client as never);

    for (const consequence of ["reprocess", "REINTERPRET", "create_task", ""]) {
      const result = await resolvePendingQuestion(idleState, answerForm({ consequence }));
      expect(result.status).toBe("error");
      expect(result.code).toBe("validation_error");
    }
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects a consequence smuggled onto a non-answer disposition", async () => {
    const client = resolutionClient(successOutcome(false, "dismissed"));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await resolvePendingQuestion(
      idleState,
      dispositionForm("dismissed", { consequence: "reinterpret" }),
    );

    expect(result.status).toBe("success");
    expect(client.rpc).toHaveBeenCalledWith("resolve_pending_question_v3", {
      p_question_id: questionId,
      p_resolution: { kind: "dismissed" },
      p_operation_key: operationKey,
    });
  });

  it("emits the property-free reinterpretation event only when the consequence applied", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient(successOutcome(false, "answered", undefined, "reinterpret")) as never,
    );

    await resolvePendingQuestion(idleState, answerForm({ consequence: "reinterpret" }));
    await flushAfter();

    const names = vi.mocked(recordProductEvent).mock.calls.map(([payload]) => (payload as { name: string }).name);
    expect(names).toContain("question_answered_basic");
    expect(names).toContain("question_reinterpret_applied");
    const applied = vi.mocked(recordProductEvent).mock.calls
      .map(([payload]) => payload as { name: string })
      .find((payload) => payload.name === "question_reinterpret_applied");
    expect(applied).toMatchObject({
      properties: {},
      subject: { type: "pending_question", id: questionId },
      surface: "server",
    });
    expect(JSON.stringify(applied)).not.toContain("Resposta privada");
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith("question_reinterpret_applied", operationKey);
  });

  it("never emits the reinterpretation event for an answer without a consequence", async () => {
    vi.mocked(createClient).mockResolvedValue(resolutionClient(successOutcome()) as never);

    await resolvePendingQuestion(idleState, answerForm());
    await flushAfter();

    const names = vi.mocked(recordProductEvent).mock.calls.map(([payload]) => (payload as { name: string }).name);
    expect(names).not.toContain("question_reinterpret_applied");
  });

  it("suppresses the reinterpretation event on an idempotent replay", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient(successOutcome(true, "answered", undefined, "reinterpret")) as never,
    );

    const result = await resolvePendingQuestion(idleState, answerForm({ consequence: "reinterpret" }));
    await flushAfter();

    expect(result.replayed).toBe(true);
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("maps an unavailable consequence to a distinct retryable code without leaking raw text", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient({
        data: null,
        error: {
          code: "P0001",
          message: "Reinterpretation is not available for this record",
          details: "2D_CONSEQUENCE_UNAVAILABLE",
        },
      }) as never,
    );

    const result = await resolvePendingQuestion(idleState, answerForm({ consequence: "reinterpret" }));

    expect(result.status).toBe("error");
    expect(result.code).toBe("consequence_unavailable");
    expect(result.retryable).toBe(true);
    expect(result.message).toBe(
      "Este registro já está sendo reinterpretado. Nada foi alterado — tente novamente depois.",
    );
    expect(result.consequence).toBeNull();
    expect(result.consequenceStatus).toBeNull();
  });

  it("rejects a result missing the consequence contract instead of assuming none", async () => {
    vi.mocked(createClient).mockResolvedValue(
      resolutionClient({
        data: { question_id: questionId, resolution: "answered", undo_id: undoId, idempotent: false },
        error: null,
      }) as never,
    );

    const result = await resolvePendingQuestion(idleState, answerForm());

    expect(result.status).toBe("error");
    expect(result.code).toBe("retryable_failure");
  });
});

describe("undoQuestionResolution", () => {
  beforeEach(() => vi.clearAllMocks());

  function undoForm(locale = "pt-BR", resolution?: string) {
    const data = new FormData();
    data.set("locale", locale);
    data.set("questionId", questionId);
    data.set("undoId", undoId);
    if (resolution) data.set("resolution", resolution);
    return data;
  }

  it("executes the stored compensating operation", async () => {
    const client = resolutionClient({ data: { undone: true, affected: 1, idempotent: false }, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await undoQuestionResolution({ status: "idle", message: "" }, undoForm());

    expect(result.status).toBe("success");
    expect(result.message).toBe("Resposta desfeita. A pergunta voltou para a fila.");
    expect(client.rpc).toHaveBeenCalledWith("undo_operation", { p_undo_id: undoId });
  });

  it("localizes the undo confirmation for a non-answer resolution", async () => {
    const client = resolutionClient({ data: { undone: true, affected: 1, idempotent: false }, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await undoQuestionResolution({ status: "idle", message: "" }, undoForm("pt-BR", "deferred"));

    expect(result.status).toBe("success");
    expect(result.message).toBe("Resolução desfeita. A pergunta voltou para a fila.");
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
