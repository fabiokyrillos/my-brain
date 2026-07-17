import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractEntryForUser, persistEntryEmbedding } from "./interpret-entry";
import { correctInterpretation, reprocessEntry, undoInterpretationCorrection } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/openai-provider", () => ({
  EXTRACTION_PROMPT_VERSION: "2026-07-16.1",
  EXTRACTION_STRATEGY_VERSION: "entry-extraction-v1",
}));
vi.mock("./interpret-entry", () => ({ extractEntryForUser: vi.fn(), persistEntryEmbedding: vi.fn() }));

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const operationKey = "6118fb25-2f80-432a-aa96-0e76d924862e";

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
  return {
    client: { auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) }, rpc },
    rpc,
  };
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
          summary: expect.objectContaining({ policy: "apply_and_flag" }),
          occurredAt: expect.objectContaining({ evidence: expect.arrayContaining(["explicit_user_confirmation"]) }),
        }),
      }),
    }));
    expect(revalidatePath).toHaveBeenCalledWith(`/pt-BR/app/inbox/${entryId}`);
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

  it("reprocesses through the shared extraction pipeline and the persisted lease", async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === "begin_entry_reprocessing" ? { acquired: true } : { version: 4 }, error: null }));
    const maybeSingle = vi.fn(async () => ({ data: { id: entryId, original_content: "Conversei com Marina.", locale: "pt-BR" }, error: null }));
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
    };
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(extractEntryForUser).mockResolvedValue({
      result: {
        model: "gpt-5.6-luna",
        extraction: {
          language: "pt-BR", occurredAt: "2026-07-17T14:00:00.000Z", isRetroactive: false,
          summary: "Conversa com Marina", concepts: ["person_note"], contexts: [], organizations: [], projects: [],
          people: [{ name: "Marina", confidence: 0.9, evidence: "menção explícita", inferred: false }],
          taskCandidates: [], pendingQuestions: [], confidence: 0.88,
        },
        inputTokens: 120,
        outputTokens: 80,
      },
      entityResolutions: [{ query: "Marina", topScore: 0.7, margin: 0.7, ambiguous: false, evidence: ["normalized_exact_name"] }],
      priorCorrectionAgreement: 0.5,
      provider: {} as never,
    } as never);
    vi.mocked(persistEntryEmbedding).mockResolvedValue(undefined);
    const form = new FormData();
    form.set("entryId", entryId);
    form.set("operationKey", operationKey);
    form.set("locale", "pt-BR");

    const result = await reprocessEntry({ status: "idle", message: "" }, form);

    expect(result).toEqual({ status: "success", message: "Entrada reinterpretada." });
    expect(rpc).toHaveBeenNthCalledWith(1, "begin_entry_reprocessing", { p_entry_id: entryId, p_operation_key: operationKey, p_lease_seconds: 180 });
    expect(rpc).toHaveBeenNthCalledWith(2, "persist_reprocessed_entry_interpretation", expect.objectContaining({
      p_entry_id: entryId,
      p_operation_key: operationKey,
      p_element_trust: expect.objectContaining({ entities: expect.objectContaining({ evidence: expect.arrayContaining(["normalized_exact_name"]) }) }),
    }));
  });
});
