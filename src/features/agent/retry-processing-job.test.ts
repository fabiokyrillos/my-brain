import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { kickEntryInterpretationWorker } from "@/lib/jobs/entry-worker";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { retryProcessingJob } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/jobs/entry-worker", () => ({ kickEntryInterpretationWorker: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({
  createProductEventIdempotencyKey: vi.fn(() => "44444444-4444-5444-8444-444444444444"),
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })),
}));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/preferences", () => ({ defaultAgentPreferences: {} }));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn() }));

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const jobId = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";

async function flushAfter() {
  await Promise.all(vi.mocked(after).mock.calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set("locale", "pt-BR");
  data.set("entryId", entryId);
  Object.entries(overrides).forEach(([key, value]) => data.set(key, value));
  return data;
}

function clientMock(jobRow: Record<string, unknown> | null, freshJobRow: Record<string, unknown> | null = null) {
  const jobLookup = {
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    order: vi.fn(function (this: unknown) { return this; }),
    limit: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: jobRow, error: null })),
  };
  const freshJobLookup = {
    select: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: freshJobRow, error: null })),
  };
  let fromCallCount = 0;
  const from = vi.fn(() => {
    fromCallCount += 1;
    return fromCallCount === 1 ? jobLookup : freshJobLookup;
  });
  const rpc = vi.fn(async () => ({ data: { entry_id: entryId, status: "queued", replayed: false }, error: null }));
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from,
      rpc,
    },
    rpc,
  };
}

describe("retryProcessingJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed input before opening a data client", async () => {
    const result = await retryProcessingJob(undefined, form({ entryId: "not-a-uuid" }));

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "validation_failed" }));
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports not_found when no interpret_entry job exists for the entry", async () => {
    const { client } = clientMock(null);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryProcessingJob(undefined, form());

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "not_found" }));
  });

  it("kicks the worker directly for a failed job whose backoff has elapsed", async () => {
    const { client } = clientMock({ id: jobId, status: "failed", attempts: 1, max_attempts: 5, next_attempt_at: "2020-01-01T00:00:00.000Z" });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryProcessingJob(undefined, form());

    expect(result).toEqual(expect.objectContaining({ ok: true, code: "retry_scheduled", entityId: entryId }));
    expect(kickEntryInterpretationWorker).not.toHaveBeenCalled();
    await flushAfter();
    expect(kickEntryInterpretationWorker).toHaveBeenCalledWith(client, jobId);
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "processing_retry_requested",
      subject: { type: "entry", id: entryId },
      properties: { retrySource: "user" },
    }));
    expect(createProductEventIdempotencyKey).toHaveBeenCalledWith("processing_retry_requested", jobId, "1", "user");
  });

  it("honors the persisted backoff instead of kicking a job too early", async () => {
    const { client } = clientMock({ id: jobId, status: "failed", attempts: 1, max_attempts: 5, next_attempt_at: "2100-01-01T00:00:00.000Z" });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryProcessingJob(undefined, form());

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "retry_not_available" }));
    await flushAfter();
    expect(kickEntryInterpretationWorker).not.toHaveBeenCalled();
  });

  it("enqueues a fresh reprocessing job when the original attempt is exhausted", async () => {
    const { client, rpc } = clientMock(
      { id: jobId, status: "exhausted", attempts: 5, max_attempts: 5, next_attempt_at: "2020-01-01T00:00:00.000Z" },
      { id: "b8b0f2b1-3f2e-4b2c-9c3a-1b2c3d4e5f60" },
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryProcessingJob(undefined, form());

    expect(rpc).toHaveBeenCalledWith("enqueue_entry_reprocessing", expect.objectContaining({ p_entry_id: entryId }));
    expect(result).toEqual(expect.objectContaining({ ok: true, code: "retry_scheduled", entityId: entryId }));
    await flushAfter();
    expect(kickEntryInterpretationWorker).toHaveBeenCalledWith(client, "b8b0f2b1-3f2e-4b2c-9c3a-1b2c3d4e5f60");
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "processing_retry_requested",
      properties: { retrySource: "user" },
    }));
  });

  it("reports action_unavailable for a job that is already in flight", async () => {
    const { client } = clientMock({ id: jobId, status: "running", attempts: 1, max_attempts: 5, next_attempt_at: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await retryProcessingJob(undefined, form());

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "action_unavailable" }));
    await flushAfter();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("revalidates the daily-cycle surfaces after successfully scheduling a retry", async () => {
    const { client } = clientMock({ id: jobId, status: "failed", attempts: 1, max_attempts: 5, next_attempt_at: "2020-01-01T00:00:00.000Z" });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await retryProcessingJob(undefined, form());

    expect(revalidatePath).toHaveBeenCalledWith(`/pt-BR/app/inbox/${entryId}`);
  });
});
