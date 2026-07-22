import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  createProductEventIdempotencyKey,
  recordProductEvent,
} from "@/features/product-analytics/server";
import { createClient } from "@/lib/supabase/server";
import { confirmEntryTasks, undoAgentAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "33333333-3333-5333-8333-333333333333"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const interpretationId = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";
const undoId = "4b3700f0-3300-452a-af18-70427f788ff7";
const idleState = { status: "idle" as const, message: "", undoId: null };

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) data.append(key, item);
    } else {
      data.set(key, value);
    }
  }
  return data;
}

function confirmForm(overrides: Partial<Record<string, string | string[]>> = {}) {
  return form({
    entryId,
    interpretationId,
    operationKey,
    locale: "pt-BR",
    candidateIndex: ["0", "1"],
    candidateEdits: "[]",
    ...overrides,
  });
}

function clientWithRpc(result: { data: unknown; error: RpcError | null }) {
  const rpc = vi.fn(async (name: string, args: unknown) => {
    void name;
    void args;
    return result;
  });
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
    },
    rpc,
  };
}

async function flushAfter() {
  await Promise.all(
    vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)),
  );
}

describe("confirmEntryTasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed input before creating a server Supabase client", async () => {
    const result = await confirmEntryTasks(
      idleState,
      form({ entryId, candidateIndex: ["0"], candidateEdits: "[]" }),
    );

    expect(result).toMatchObject({ status: "error", code: "validation_failed", retryable: false });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires a UUID idempotency key", async () => {
    const result = await confirmEntryTasks(idleState, confirmForm({ operationKey: "predictable-key" }));

    expect(result).toMatchObject({ status: "error", code: "validation_failed" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate selection", { candidateIndex: ["0", "0"] }],
    ["negative selection", { candidateIndex: ["-1"] }],
    ["non-canonical number", { candidateIndex: ["1e2"] }],
    ["empty selection", { candidateIndex: [] }],
  ])("rejects %s before RPC", async (_label, overrides) => {
    const result = await confirmEntryTasks(idleState, confirmForm(overrides));

    expect(result).toMatchObject({ status: "error", code: "validation_failed" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["non-array JSON", "{}"],
    ["unknown edit field", '[{"candidateIndex":0,"changes":{"ownerId":"user-2"}}]'],
    ["duplicate edit index", '[{"candidateIndex":0,"changes":{"title":"A"}},{"candidateIndex":0,"changes":{"title":"B"}}]'],
    ["unselected edit", '[{"candidateIndex":2,"changes":{"title":"A"}}]'],
  ])("rejects %s before RPC", async (_label, candidateEdits) => {
    const result = await confirmEntryTasks(idleState, confirmForm({ candidateEdits }));

    expect(result).toMatchObject({ status: "error", code: "validation_failed" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("calls the typed v2 RPC with sorted selected indices and an empty canonical edit array", async () => {
    const { client, rpc } = clientWithRpc({
      data: { task_ids: ["task-1", "task-2"], undo_id: undoId, idempotent: false },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks(
      idleState,
      confirmForm({ candidateIndex: ["1", "0"] }),
    );

    expect(rpc).toHaveBeenCalledWith("confirm_entry_task_candidates_v4", {
      p_entry_id: entryId,
      p_expected_interpretation_id: interpretationId,
      p_candidate_indexes: [0, 1],
      p_candidate_edits: [],
      p_operation_key: operationKey,
    });
    expect(result).toEqual({
      status: "success",
      code: "confirmed",
      message: "2 tarefas criadas.",
      undoId,
      replayed: false,
      retryable: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/pt-BR/app/inbox/${entryId}`);
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/work");
  });

  it("parses, validates, and canonicalizes edit JSON again on the server", async () => {
    const { client, rpc } = clientWithRpc({
      data: { task_ids: ["task-1", "task-2"], undo_id: undoId, idempotent: false },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const candidateEdits = JSON.stringify([
      { candidateIndex: 1, changes: { dueAt: null, description: "  Nova descrição  " } },
      { candidateIndex: 0, changes: { description: null, title: "  Relatório final  " } },
    ]);

    await confirmEntryTasks(idleState, confirmForm({ candidateEdits }));

    expect(rpc).toHaveBeenCalledWith("confirm_entry_task_candidates_v4", expect.objectContaining({
      p_candidate_edits: [
        { candidateIndex: 0, changes: { title: "Relatório final", description: null } },
        { candidateIndex: 1, changes: { description: "Nova descrição", dueAt: null } },
      ],
    }));
  });

  it("forwards planned date, priority, and no-due edits to the v3 RPC", async () => {
    const { client, rpc } = clientWithRpc({
      data: { task_ids: ["task-1"], undo_id: undoId, idempotent: false },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const candidateEdits = JSON.stringify([
      {
        candidateIndex: 0,
        changes: {
          plannedAt: "2026-08-01T09:00:00-03:00",
          manualPriority: "urgent",
          intentionalNoDue: true,
          noDueReason: "Someday",
          dueAt: null,
        },
      },
    ]);

    await confirmEntryTasks(idleState, confirmForm({ candidateIndex: ["0"], candidateEdits }));

    expect(rpc).toHaveBeenCalledWith("confirm_entry_task_candidates_v4", expect.objectContaining({
      p_candidate_edits: [
        {
          candidateIndex: 0,
          changes: {
            dueAt: null,
            plannedAt: "2026-08-01T09:00:00-03:00",
            manualPriority: "urgent",
            intentionalNoDue: true,
            noDueReason: "Someday",
          },
        },
      ],
    }));
  });

  it("never forwards client-provided ownership or task identifiers", async () => {
    const { client, rpc } = clientWithRpc({
      data: { task_ids: ["task-1", "task-2"], undo_id: undoId, idempotent: false },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await confirmEntryTasks(idleState, confirmForm({
      ownerId: "user-2",
      userId: "user-2",
      taskId: "task-attacker",
      undoId: "undo-attacker",
    }));

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0]?.[1]).toEqual({
      p_entry_id: entryId,
      p_expected_interpretation_id: interpretationId,
      p_candidate_indexes: [0, 1],
      p_candidate_edits: [],
      p_operation_key: operationKey,
    });
  });

  it("requires an authenticated session independently of the form locale", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      rpc: vi.fn(),
    } as never);

    const result = await confirmEntryTasks(idleState, confirmForm({ locale: "en" }));

    expect(result).toEqual({
      status: "error",
      code: "unauthenticated",
      message: "Your session expired. Sign in again.",
      undoId: null,
      retryable: false,
    });
  });

  it("localizes English success feedback", async () => {
    const { client } = clientWithRpc({
      data: { task_ids: ["task-1"], undo_id: undoId, idempotent: false },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks(
      idleState,
      confirmForm({ locale: "en", candidateIndex: ["0"] }),
    );

    expect(result).toMatchObject({ status: "success", message: "1 task created." });
  });

  it("does not duplicate the product event for an idempotent replay", async () => {
    const { client } = clientWithRpc({
      data: { task_ids: ["task-1"], undo_id: undoId, idempotent: true },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks(idleState, confirmForm({ candidateIndex: ["0"] }));

    expect(result).toMatchObject({ status: "success", replayed: true, undoId });
    expect(after).not.toHaveBeenCalled();
    expect(recordProductEvent).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("records one content-free product event after a first successful execution", async () => {
    const { client } = clientWithRpc({
      data: { task_ids: ["task-1", "task-2"], undo_id: undoId, idempotent: false },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await confirmEntryTasks(idleState, confirmForm());

    expect(recordProductEvent).not.toHaveBeenCalled();
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "task_candidates_confirmed",
      subject: { type: "entry", id: entryId },
      properties: { candidateCount: 2, editedCandidateCount: 0, editedFieldCount: 0 },
    }));
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith(
      "task_candidates_confirmed",
      operationKey,
    );
  });

  it("derives editedCandidateCount and editedFieldCount from the canonical edit payload, not raw indices", async () => {
    const { client } = clientWithRpc({
      data: { task_ids: ["task-1", "task-2"], undo_id: undoId, idempotent: false },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const candidateEdits = JSON.stringify([
      { candidateIndex: 0, changes: { title: "Relatório final" } },
      { candidateIndex: 1, changes: { description: null, dueAt: null, title: "Conversa" } },
    ]);

    await confirmEntryTasks(idleState, confirmForm({ candidateEdits }));

    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "task_candidates_confirmed",
      properties: { candidateCount: 2, editedCandidateCount: 2, editedFieldCount: 4 },
    }));
  });

  it("counts only candidates with a non-empty canonical changes object as edited", async () => {
    const { client } = clientWithRpc({
      data: { task_ids: ["task-1", "task-2"], undo_id: undoId, idempotent: false },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const candidateEdits = JSON.stringify([
      { candidateIndex: 0, changes: {} },
      { candidateIndex: 1, changes: { title: "Conversa com Maria" } },
    ]);

    await confirmEntryTasks(idleState, confirmForm({ candidateEdits }));

    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "task_candidates_confirmed",
      properties: { candidateCount: 2, editedCandidateCount: 1, editedFieldCount: 1 },
    }));
  });

  it.each([
    [
      "stale interpretation",
      { code: "55P03", message: "Interpretation is no longer current" },
      "stale_interpretation",
      "A interpretação mudou. Atualize a página antes de confirmar.",
    ],
    [
      "correction contention",
      { code: "55P03", message: "Interpretation changed; reload before saving" },
      "confirmation_contended",
      "A interpretação está sendo alterada. Atualize a página antes de confirmar.",
    ],
    [
      "idempotency mismatch",
      { code: "P0001", message: "Operation key payload mismatch", details: "2C_IDEMPOTENCY_MISMATCH" },
      "idempotency_mismatch",
      "Esta tentativa não corresponde mais às edições atuais. Revise e tente novamente.",
    ],
    [
      "already materialized",
      { code: "P0001", message: "Candidate already materialized", details: "2C_ALREADY_MATERIALIZED" },
      "already_materialized",
      "Uma destas tarefas já foi criada. Atualize a página antes de confirmar.",
    ],
    [
      "invalid selection",
      { code: "22023", message: "Invalid task candidate index" },
      "invalid_payload",
      "Revise as tarefas selecionadas e as edições.",
    ],
    [
      "invalid or cross-owner relation",
      { code: "22023", message: "Invalid or cross-owner project relation", details: "2C_INVALID_RELATION" },
      "invalid_relation",
      "Um dos projetos, contextos ou pessoas selecionados não está mais disponível. Atualize a página e tente novamente.",
    ],
    [
      "record-only",
      { code: "55000", message: "Interpretation is record-only" },
      "record_only",
      "Esta versão é somente registro; não há tarefas para confirmar.",
    ],
    [
      "not found",
      { code: "P0002", message: "Entry or interpretation not found" },
      "not_found",
      "Não encontramos este registro para confirmação.",
    ],
  ])("maps %s to stable sanitized feedback", async (_label, error, code, message) => {
    const { client } = clientWithRpc({ data: null, error });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks(idleState, confirmForm());

    expect(result).toEqual({
      status: "error",
      code,
      message,
      undoId: null,
      retryable: false,
    });
  });

  it("does not map an unrelated 55P03 as a Phase 2C version conflict", async () => {
    const { client } = clientWithRpc({
      data: null,
      error: { code: "55P03", message: "Unrelated lock unavailable", details: "raw detail" },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks(idleState, confirmForm({ locale: "en" }));

    expect(result).toEqual({
      status: "error",
      code: "operation_failed",
      message: "The tasks could not be created right now.",
      undoId: null,
      retryable: true,
    });
    expect(result.message).not.toMatch(/lock|detail|55P03|confirm_entry/i);
  });

  it("sanitizes unexpected database failures", async () => {
    const { client } = clientWithRpc({
      data: null,
      error: { code: "XX000", message: "raw SQL internals", details: "secret table detail" },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks(idleState, confirmForm());

    expect(result).toEqual({
      status: "error",
      code: "operation_failed",
      message: "Não foi possível criar as tarefas agora.",
      undoId: null,
      retryable: true,
    });
    expect(after).not.toHaveBeenCalled();
  });
});

describe("undoAgentAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to the shared undo RPC for a v2 confirmation result", async () => {
    const { client, rpc } = clientWithRpc({ data: { undone: true, affected: 2 }, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await undoAgentAction(
      { status: "idle", message: "" },
      form({ undoId }),
    );

    expect(rpc).toHaveBeenCalledWith("undo_operation", { p_undo_id: undoId });
    expect(result).toEqual({ status: "success", message: "Criação desfeita." });
    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/work");
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/work");
  });
});
