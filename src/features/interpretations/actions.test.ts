import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { kickEntryInterpretationWorker } from "@/lib/jobs/entry-worker";
import { recordProductEvent } from "@/features/product-analytics/server";
import { correctInterpretation, reprocessEntry, undoInterpretationCorrection } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/jobs/entry-worker", () => ({ kickEntryInterpretationWorker: vi.fn() }));
vi.mock("@/features/product-analytics/server", () => ({ recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "evt-1", code: "recorded" })) }));

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";
const jobId = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";

function correctionForm() {
  const form = new FormData();
  form.set("entryId", entryId);
  form.set("expectedVersion", "2");
  form.set("operationKey", operationKey);
  form.set("locale", "pt-BR");
  form.set("summary", "Resumo confirmado");
  form.append("concepts", "person_note");
  form.set("occurredAt", "2026-07-17T14:00:00.000Z");
  form.append("entityLink", JSON.stringify({ entityType: "person", entityId: "ea9f441a-aa22-47bc-b8e7-cfe2209f5987", mention: "Marina", confidence: 1 }));
  form.set("summaryClassification", "fact");
  form.set("conceptsClassification", "fact");
  form.set("occurredAtClassification", "fact");
  form.set("entitiesClassification", "fact");
  form.set("correctionReason", "Confirmado com a fonte.");
  return form;
}

function authenticatedClient() {
  const rpc = vi.fn(async () => ({ data: { version: 3, undo_id: "4b3700f0-3300-452a-af18-70427f788ff7" }, error: null }));
  const history = vi.fn(async () => ({ data: null, count: 2, error: null }));
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: history })) })) })),
    },
    rpc,
  };
}

async function flushAfter() {
  const calls = vi.mocked(after).mock.calls;
  await Promise.all(calls.map(([task]) => (typeof task === "function" ? task() : task)));
}

describe("interpretation actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed correction input before creating a privileged client", async () => {
    const result = await correctInterpretation({ status: "idle", message: "" }, new FormData());

    expect(result.status).toBe("error");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("saves an immutable correction with deterministic per-element trust", async () => {
    const { client, rpc } = authenticatedClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await correctInterpretation({ status: "idle", message: "" }, correctionForm());

    expect(result).toEqual({ status: "success", message: "Nova versão salva." });
    expect(rpc).toHaveBeenCalledWith("correct_entry_interpretation", expect.objectContaining({
      p_entry_id: entryId,
      p_expected_version: 2,
      p_operation_key: operationKey,
      p_reason: "Confirmado com a fonte.",
      p_patch: expect.objectContaining({
        summary: "Resumo confirmado",
        elementTrust: expect.objectContaining({
          summary: expect.objectContaining({
            policy: "apply_and_flag",
            signals: expect.objectContaining({ correctionHistoryAgreement: 0.4 }),
          }),
          occurredAt: expect.objectContaining({ evidence: expect.arrayContaining(["explicit_user_confirmation"]) }),
        }),
      }),
    }));
    expect(revalidatePath).toHaveBeenCalledWith(`/pt-BR/app/inbox/${entryId}`);
  });

  it("reports a reload/retry conflict when the interpretation changed concurrently", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "55P03", message: "Interpretation changed; reload before saving" } }));
    const history = vi.fn(async () => ({ data: null, count: 0, error: null }));
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: history })) })) })),
    };
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await correctInterpretation({ status: "idle", message: "" }, correctionForm());

    expect(result).toEqual({
      status: "error",
      message: "A interpretação mudou. Recarregue antes de corrigir novamente.",
    });
  });

  it("uses the existing undo ledger instead of mutating an old interpretation", async () => {
    const { client, rpc } = authenticatedClient();
    vi.mocked(createClient).mockResolvedValue(client as never);
    const form = new FormData();
    form.set("entryId", entryId);
    form.set("undoId", "4b3700f0-3300-452a-af18-70427f788ff7");
    form.set("locale", "en");

    const result = await undoInterpretationCorrection({ status: "idle", message: "" }, form);

    expect(result).toEqual({ status: "success", message: "Correction undone as a new version." });
    expect(rpc).toHaveBeenCalledWith("undo_operation", { p_undo_id: "4b3700f0-3300-452a-af18-70427f788ff7" });
  });

  it("enqueues reprocessing atomically instead of running extraction synchronously", async () => {
    const rpc = vi.fn(async () => ({ data: { entry_id: entryId, status: "queued", replayed: false }, error: null }));
    const jobsQuery = {
      select: vi.fn(function (this: unknown) { return this; }),
      eq: vi.fn(function (this: unknown) { return this; }),
      maybeSingle: vi.fn(async () => ({ data: { id: jobId, status: "pending" }, error: null })),
    };
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
      from: vi.fn(() => jobsQuery),
    };
    vi.mocked(createClient).mockResolvedValue(client as never);
    const form = new FormData();
    form.set("entryId", entryId);
    form.set("operationKey", operationKey);
    form.set("locale", "pt-BR");

    const result = await reprocessEntry({ status: "idle", message: "" }, form);

    expect(result).toEqual({ status: "success", message: "Vou organizar este registro novamente." });
    expect(rpc).toHaveBeenCalledWith("enqueue_entry_reprocessing", {
      p_entry_id: entryId,
      p_operation_key: operationKey,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/pt-BR/app/inbox/${entryId}`);

    expect(kickEntryInterpretationWorker).not.toHaveBeenCalled();
    await flushAfter();
    expect(kickEntryInterpretationWorker).toHaveBeenCalledWith(client, jobId);
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "capture_processing_enqueued",
      properties: { processingMode: "reprocess" },
    }));
  });

  it("preserves the original and reports a sanitized failure when enqueueing fails", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "55P03", message: "already queued detail" } }));
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
      from: vi.fn(),
    };
    vi.mocked(createClient).mockResolvedValue(client as never);
    const form = new FormData();
    form.set("entryId", entryId);
    form.set("operationKey", operationKey);
    form.set("locale", "pt-BR");

    const result = await reprocessEntry({ status: "idle", message: "" }, form);

    expect(result).toEqual({
      status: "error",
      message: "Não foi possível reinterpretar agora. O original foi preservado.",
    });
    expect(client.from).not.toHaveBeenCalled();
  });
});
