import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { kickEntryInterpretationWorker } from "@/lib/jobs/entry-worker";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { captureEntry } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/jobs/entry-worker", () => ({ kickEntryInterpretationWorker: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "11111111-1111-5111-8111-111111111111"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const jobId = "6118fb25-2f80-432a-aa96-0e76d924862e";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set("content", "Conversei com Marina sobre o Atlas.");
  data.set("locale", "pt-BR");
  data.set("source", "web");
  data.set("captureSource", "home");
  data.set("idempotencyKey", "9b1f6a2a-9d0e-4a3f-8f9a-1a2b3c4d5e6f");
  Object.entries(overrides).forEach(([key, value]) => data.set(key, value));
  return data;
}

async function flushAfter() {
  const calls = vi.mocked(after).mock.calls;
  await Promise.all(calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

function clientMock(options: {
  rpc?: { data: unknown; error: unknown };
  entryRow?: { status: string } | null;
  jobRow?: { id: string; status: string; next_attempt_at: string | null } | null;
  authenticated?: boolean;
} = {}) {
  const {
    rpc: rpcResult = { data: { entry_id: entryId, status: "saved", replayed: false }, error: null },
    entryRow = { status: "saved" },
    jobRow = { id: jobId, status: "pending", next_attempt_at: null },
    authenticated = true,
  } = options;

  const entriesQuery = {
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: entryRow, error: null })),
  };
  const jobsQuery = {
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: jobRow, error: null })),
  };
  const from = vi.fn((table: string) => (table === "entries" ? entriesQuery : jobsQuery));
  const rpc = vi.fn(async () => rpcResult);
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: authenticated ? { id: "user-1" } : null } })),
    },
    from,
    rpc,
  };
  return { client, rpc, from, entriesQuery, jobsQuery };
}

describe("captureEntry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid content before opening a data client", async () => {
    const result = await captureEntry({ status: "idle" }, form({ content: "" }));

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.code).toBe("validation_failed");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports an expired session without touching the database", async () => {
    const { client } = clientMock({ authenticated: false });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await captureEntry({ status: "idle" }, form());

    expect(result).toEqual({ status: "error", code: "unauthenticated", message: "Sua sessão expirou. Entre novamente." });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("persists through the atomic RPC and returns an organizing receipt without a redirect", async () => {
    const { client, rpc } = clientMock();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await captureEntry({ status: "idle" }, form());

    expect(rpc).toHaveBeenCalledWith("capture_entry_async", {
      p_original_content: "Conversei com Marina sobre o Atlas.",
      p_locale: "pt-BR",
      p_source: "web",
      p_idempotency_key: "9b1f6a2a-9d0e-4a3f-8f9a-1a2b3c4d5e6f",
    });
    expect(result).toEqual({
      status: "success",
      receipt: {
        entryId,
        persisted: true,
        productState: "organizing",
        messageKey: "capture_saved",
        replayed: false,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app");
    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/inbox");
  });

  it("never returns a redirect and omits safeHref when captured from Home", async () => {
    const { client } = clientMock();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await captureEntry({ status: "idle" }, form({ captureSource: "home" }));

    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.receipt.safeHref).toBeUndefined();
  });

  it("includes a safe link to the record when captured from the dedicated capture page", async () => {
    const { client } = clientMock();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await captureEntry({ status: "idle" }, form({ captureSource: "capture_page" }));

    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.receipt.safeHref).toBe(`/pt-BR/app/inbox/${entryId}`);
  });

  it("kicks the worker and records analytics after the response, without blocking it", async () => {
    const { client } = clientMock();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await captureEntry({ status: "idle" }, form());

    expect(kickEntryInterpretationWorker).not.toHaveBeenCalled();
    expect(recordProductEvent).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);

    await flushAfter();

    expect(kickEntryInterpretationWorker).toHaveBeenCalledWith(client, jobId);
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "capture_save_succeeded",
      surface: "capture",
      properties: expect.objectContaining({ captureSource: "home" }),
    }));
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "capture_processing_enqueued",
      properties: { processingMode: "initial" },
    }));
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith(
      "capture_save_succeeded",
      "9b1f6a2a-9d0e-4a3f-8f9a-1a2b3c4d5e6f",
    );
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith(
      "capture_processing_enqueued",
      "9b1f6a2a-9d0e-4a3f-8f9a-1a2b3c4d5e6f",
    );
  });

  it("reflects the true current state on an idempotent replay instead of always claiming organizing", async () => {
    const { client } = clientMock({
      rpc: { data: { entry_id: entryId, status: "saved", replayed: true }, error: null },
      entryRow: { status: "completed" },
      jobRow: { id: jobId, status: "completed", next_attempt_at: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await captureEntry({ status: "idle" }, form());

    expect(result).toEqual({
      status: "success",
      receipt: {
        entryId,
        persisted: true,
        productState: "ready",
        messageKey: "capture_replayed",
        replayed: true,
      },
    });

    await flushAfter();
    expect(kickEntryInterpretationWorker).not.toHaveBeenCalled();
    expect(recordProductEvent).not.toHaveBeenCalledWith(expect.objectContaining({ name: "capture_processing_enqueued" }));
  });

  it("reports a sanitized failure when the atomic RPC itself fails", async () => {
    const { client } = clientMock({ rpc: { data: null, error: { code: "XXNEW", message: "db secret detail" } } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await captureEntry({ status: "idle" }, form());

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("operation_failed");
      expect(result.message).not.toContain("db secret detail");
    }

    expect(recordProductEvent).not.toHaveBeenCalled();
    await flushAfter();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "capture_save_failed",
      idempotencyKey: "11111111-1111-5111-8111-111111111111",
      properties: expect.objectContaining({ failureKind: "storage" }),
    }));
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith(
      "capture_save_failed",
      "9b1f6a2a-9d0e-4a3f-8f9a-1a2b3c4d5e6f",
    );
  });

  it("records successful outcomes even when the non-critical worker nudge rejects", async () => {
    const { client } = clientMock();
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(kickEntryInterpretationWorker).mockRejectedValueOnce(new Error("worker unavailable"));

    await captureEntry({ status: "idle" }, form());

    await expect(flushAfter()).resolves.toBeUndefined();
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({ name: "capture_save_succeeded" }));
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({ name: "capture_processing_enqueued" }));
  });
});
