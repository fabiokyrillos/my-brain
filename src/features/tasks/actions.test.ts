import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
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
    candidateIndex: ["0", "1"],
    ...overrides,
  });
}

function clientWithRpc(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  const rpc = vi.fn(async () => result);
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
    },
    rpc,
  };
}

async function flushAfter() {
  await Promise.all(vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

describe("confirmEntryTasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed input before creating a privileged client", async () => {
    const result = await confirmEntryTasks(
      { status: "idle", message: "", undoId: null },
      form({ entryId, candidateIndex: ["0"] }),
    );

    expect(result.status).toBe("error");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a missing interpretation id before creating a privileged client", async () => {
    const result = await confirmEntryTasks(
      { status: "idle", message: "", undoId: null },
      form({ entryId, operationKey, candidateIndex: ["0"] }),
    );

    expect(result.status).toBe("error");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("binds confirmation to the interpretation the UI declares as current", async () => {
    const { client, rpc } = clientWithRpc({ data: { task_ids: ["task-1", "task-2"], undo_id: undoId, idempotent: false }, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks({ status: "idle", message: "", undoId: null }, confirmForm());

    expect(rpc).toHaveBeenCalledWith("confirm_entry_task_candidates", {
      p_entry_id: entryId,
      p_expected_interpretation_id: interpretationId,
      p_candidate_indexes: [0, 1],
      p_operation_key: operationKey,
    });
    expect(result).toEqual({ status: "success", message: "2 tarefas criadas.", undoId });
    expect(revalidatePath).toHaveBeenCalledWith(`/pt-BR/app/inbox/${entryId}`);
    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/work");
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/work");
    expect(recordProductEvent).not.toHaveBeenCalled();
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "task_candidates_confirmed",
      subject: { type: "entry", id: entryId },
      properties: { candidateCount: 2 },
    }));
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith("task_candidates_confirmed", operationKey);
  });

  it("deduplicates repeated candidate indexes before calling the database", async () => {
    const { client, rpc } = clientWithRpc({ data: { task_ids: ["task-1"], undo_id: undoId, idempotent: false }, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await confirmEntryTasks({ status: "idle", message: "", undoId: null }, confirmForm({ candidateIndex: ["0", "0"] }));

    expect(rpc).toHaveBeenCalledWith("confirm_entry_task_candidates", expect.objectContaining({ p_candidate_indexes: [0] }));
  });

  it("reports a stale interpretation as a version conflict, not a generic failure", async () => {
    const { client, rpc } = clientWithRpc({ data: null, error: { code: "55P03", message: "Interpretation is no longer current" } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks({ status: "idle", message: "", undoId: null }, confirmForm());

    expect(result).toEqual({
      status: "error",
      message: "A interpretação mudou. Atualize a página antes de confirmar.",
      undoId: null,
    });
    expect(rpc).toHaveBeenCalled();
  });

  it("reports a record-only interpretation as having nothing actionable", async () => {
    const { client } = clientWithRpc({ data: null, error: { code: "55000", message: "Interpretation is record-only; no candidate is actionable" } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks({ status: "idle", message: "", undoId: null }, confirmForm());

    expect(result).toEqual({
      status: "error",
      message: "Esta versão é somente registro; não há tarefas para confirmar.",
      undoId: null,
    });
  });

  it("falls back to a generic sanitized message for other database failures", async () => {
    const { client } = clientWithRpc({ data: null, error: { code: "22023", message: "raw internal detail that must not leak" } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await confirmEntryTasks({ status: "idle", message: "", undoId: null }, confirmForm());

    expect(result).toEqual({ status: "error", message: "Não foi possível criar as tarefas.", undoId: null });
    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      rpc: vi.fn(),
    } as never);

    const result = await confirmEntryTasks({ status: "idle", message: "", undoId: null }, confirmForm());

    expect(result.status).toBe("error");
  });
});

describe("undoAgentAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to the shared undo RPC regardless of which confirmation action created the undo record", async () => {
    const { client, rpc } = clientWithRpc({ data: { undone: true, affected: 2 }, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await undoAgentAction({ status: "idle", message: "" }, form({ undoId }));

    expect(rpc).toHaveBeenCalledWith("undo_operation", { p_undo_id: undoId });
    expect(result).toEqual({ status: "success", message: "Criação desfeita." });
    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/work");
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/work");
  });
});
