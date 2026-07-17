import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { extractEntryForUser, persistEntryEmbedding } from "@/features/interpretations/interpret-entry";
import { captureEntry } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/openai-provider", () => ({
  EXTRACTION_PROMPT_VERSION: "2026-07-16.1",
  EXTRACTION_STRATEGY_VERSION: "entry-extraction-v1",
}));
vi.mock("@/features/interpretations/interpret-entry", () => ({ extractEntryForUser: vi.fn(), persistEntryEmbedding: vi.fn() }));

const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function form() {
  const data = new FormData();
  data.set("content", "Conversei com Marina sobre o Atlas.");
  data.set("locale", "pt-BR");
  data.set("source", "web");
  return data;
}

function clientMock() {
  const single = vi.fn(async () => ({ data: { id: entryId }, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const rpc = vi.fn(async () => ({ data: {}, error: null }));
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    from: vi.fn(() => ({ insert })),
    rpc,
  };
  return { client, insert, rpc };
}

const extraction = {
  result: {
    model: "gpt-5.6-luna",
    extraction: {
      language: "pt-BR", occurredAt: "2026-07-17T14:00:00.000Z", isRetroactive: false,
      summary: "Conversa com Marina", concepts: ["person_note"], contexts: [], organizations: [], projects: [], people: [], taskCandidates: [], pendingQuestions: [], confidence: 0.86,
    },
    inputTokens: 100,
    outputTokens: 50,
  },
  provider: {},
  entityResolutions: [],
  priorCorrectionAgreement: 0,
};

describe("captureEntry lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves first, starts interpretation, and uses the shared extraction pipeline", async () => {
    const { client, insert, rpc } = clientMock();
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(extractEntryForUser).mockResolvedValue(extraction as never);
    vi.mocked(persistEntryEmbedding).mockResolvedValue(undefined);

    await captureEntry({ status: "idle", message: "" }, form());

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: "saved", original_content: "Conversei com Marina sobre o Atlas." }));
    expect(rpc).toHaveBeenNthCalledWith(1, "begin_entry_interpretation", { p_entry_id: entryId });
    expect(rpc).toHaveBeenNthCalledWith(2, "persist_entry_interpretation", expect.objectContaining({ p_entry_id: entryId, p_extraction: extraction.result.extraction }));
    expect(extractEntryForUser).toHaveBeenCalledWith(expect.objectContaining({ entryId, userId: "user-1" }));
    expect(revalidatePath).toHaveBeenCalledWith("/pt-BR/app/inbox");
    expect(redirect).toHaveBeenCalledWith(`/pt-BR/app/inbox/${entryId}`);
  });

  it("persists a recoverable sanitized failure without mutating the entry directly", async () => {
    const { client, rpc } = clientMock();
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(extractEntryForUser).mockRejectedValue(new Error("provider secret detail"));

    const result = await captureEntry({ status: "idle", message: "" }, form());

    expect(result).toMatchObject({ status: "error" });
    expect(rpc).toHaveBeenLastCalledWith("fail_entry_interpretation", {
      p_entry_id: entryId,
      p_error: "Interpretation unavailable. The original was preserved.",
      p_terminal: false,
    });
    expect(client.from).toHaveBeenCalledTimes(1);
  });
});
