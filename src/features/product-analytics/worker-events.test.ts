import { describe, expect, it, vi } from "vitest";

type WorkerEventsModule = {
  createProcessingEventIdempotencyKey?: (...scope: string[]) => Promise<string>;
  recordEntryProcessingEvent?: (client: { rpc: ReturnType<typeof vi.fn> }, input: Record<string, unknown>) => Promise<boolean>;
  toProcessingOutcome?: (status: string | null | undefined) => "ready" | "needs_attention" | null;
};

const workerEventsPath = "../../../supabase/functions/process-jobs/product-events.ts";
const workerEvents = await vi.importActual<WorkerEventsModule>(workerEventsPath).catch(() => ({})) as WorkerEventsModule;

describe("entry-worker product events", () => {
  it("maps only persisted terminal product states to the completed outcome allowlist", () => {
    expect(workerEvents.toProcessingOutcome).toBeTypeOf("function");
    expect(workerEvents.toProcessingOutcome?.("completed")).toBe("ready");
    expect(workerEvents.toProcessingOutcome?.("partially_processed")).toBe("needs_attention");
    expect(workerEvents.toProcessingOutcome?.("awaiting_review")).toBe("needs_attention");
    expect(workerEvents.toProcessingOutcome?.("unexpected_state")).toBeNull();
  });

  it("records an owner-scoped subject with deterministic job-attempt idempotency", async () => {
    expect(workerEvents.recordEntryProcessingEvent).toBeTypeOf("function");
    const rpc = vi.fn(async (name: string, payload: Record<string, unknown>) => {
      void name;
      void payload;
      return { data: [{ event_id: "event-1", recorded: true }], error: null };
    });
    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      entryId: "22222222-2222-4222-8222-222222222222",
      locale: "pt-BR",
      event: "capture_processing_completed",
      properties: { processingMode: "initial", durationMs: 12, outcome: "ready" },
      idempotencyScope: ["job-1", "attempt-1", "completed"],
    };

    await expect(workerEvents.recordEntryProcessingEvent?.({ rpc }, input)).resolves.toBe(true);
    await expect(workerEvents.recordEntryProcessingEvent?.({ rpc }, input)).resolves.toBe(true);

    const firstPayload = rpc.mock.calls[0][1];
    expect(firstPayload).toMatchObject({
      p_user_id: input.userId,
      p_event_name: input.event,
      p_locale: "pt-BR",
      p_subject_type: "entry",
      p_subject_id: input.entryId,
      p_properties: input.properties,
    });
    expect(firstPayload.p_idempotency_key).toBe(rpc.mock.calls[1][1].p_idempotency_key);
    expect(firstPayload.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("contains RPC rejection so analytics never fails the job", async () => {
    expect(workerEvents.recordEntryProcessingEvent).toBeTypeOf("function");
    const rpc = vi.fn(async (name: string, payload: Record<string, unknown>) => {
      void name;
      void payload;
      return { data: null, error: { code: "42501", message: "raw detail" } };
    });

    await expect(workerEvents.recordEntryProcessingEvent?.({ rpc }, {
      userId: "11111111-1111-4111-8111-111111111111",
      entryId: "22222222-2222-4222-8222-222222222222",
      locale: "en",
      event: "capture_processing_failed",
      properties: { processingMode: "initial", durationMs: 12, failureKind: "terminal" },
      idempotencyScope: ["job-1", "attempt-1", "failed"],
    })).resolves.toBe(false);
  });
});
