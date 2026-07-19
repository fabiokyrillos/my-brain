import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyWorkItemAction, createRecord, updateTaskStatus } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const taskId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function taskClient() {
  const insert = vi.fn(async () => ({ error: null }));
  const eqUser = vi.fn(async () => ({ data: null, error: null }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const update = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ insert, update }));
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from,
    },
    insert,
    update,
  };
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

    await applyWorkItemAction(form({ taskId, locale: "pt-BR", action: "resume_task" }));

    expect(update).toHaveBeenCalledWith({
      status: "todo",
      completed_at: null,
      cancelled_at: null,
    });
  });
});
