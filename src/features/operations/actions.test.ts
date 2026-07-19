import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { createClient } from "@/lib/supabase/server";
import { applyWorkItemAction, createRecord, updateTaskStatus } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "55555555-5555-5555-8555-555555555555"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));

const taskId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function taskClient(currentStatus = "waiting", updatedTask: { id: string } | null = { id: taskId }) {
  const insert = vi.fn(async () => ({ error: null }));
  const updateMutation = {
    select: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: updatedTask, error: null })),
    then: (onFulfilled: (value: { data: { id: string } | null; error: null }) => unknown) =>
      Promise.resolve({ data: updatedTask, error: null }).then(onFulfilled),
  };
  const eqUser = vi.fn(() => updateMutation);
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const update = vi.fn(() => ({ eq: eqId }));
  const currentQuery = {
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: { status: currentStatus }, error: null })),
  };
  const from = vi.fn(() => ({ insert, update, ...currentQuery }));
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from,
    },
    insert,
    update,
  };
}

async function flushAfter() {
  await Promise.all(vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("task operation revalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revalidates canonical Work in both locales after manual task creation", async () => {
    const { client } = taskClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createRecord(
      { status: "idle", message: "" },
      form({ kind: "task", locale: "pt-BR", name: "Enviar proposta" }),
    );

    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/work");
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/work");
  });

  it("revalidates canonical Work in both locales after an existing task mutation", async () => {
    const { client } = taskClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await updateTaskStatus(form({ taskId, locale: "en", status: "waiting" }));

    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/work");
    expect(revalidatePath).toHaveBeenCalledWith("/en/app/work");
  });

  it("translates a product action to the persisted task transition inside the Server Action", async () => {
    const { client, update } = taskClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";

    await applyWorkItemAction(form({ taskId, locale: "pt-BR", action: "resume_task", operationKey }));

    expect(update).toHaveBeenCalledWith({
      status: "todo",
      completed_at: null,
      cancelled_at: null,
    });
    expect(recordProductEvent).not.toHaveBeenCalled();
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "task_status_changed",
      subject: { type: "task", id: taskId },
      properties: { fromStatus: "waiting", toStatus: "todo" },
    }));
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith("task_status_changed", operationKey);
  });

  it("does not emit a task transition when the persisted status is unchanged", async () => {
    const { client } = taskClient("todo");
    vi.mocked(createClient).mockResolvedValue(client as never);

    await applyWorkItemAction(form({
      taskId,
      locale: "pt-BR",
      action: "resume_task",
      operationKey: "6118fb25-2f80-432a-aa96-0e76d924862e",
    }));

    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("does not emit a successful transition when the owner-scoped update changed no row", async () => {
    const { client } = taskClient("waiting", null);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await applyWorkItemAction(form({
      taskId,
      locale: "pt-BR",
      action: "resume_task",
      operationKey: "6118fb25-2f80-432a-aa96-0e76d924862e",
    }));

    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });
});
