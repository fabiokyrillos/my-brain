import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUsageRpcArgs, recordAIUsage } from "./usage";

afterEach(() => vi.restoreAllMocks());

describe("buildUsageRpcArgs", () => {
  it("maps safe provider metadata without prompt content", () => {
    expect(buildUsageRpcArgs({
      operation: "chat",
      model: "gpt-5.6-terra",
      userId: "c127d3ee-87af-43bf-bf8d-04a8474bdc46",
      sourceType: "conversation",
      sourceId: "dbb96c5e-29e6-4af8-b5b8-142b788a68af",
      usage: {
        providerRequestId: "resp_123",
        transportRequestId: "req_123",
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 30,
        reasoningTokens: 10,
      },
    })).toEqual({
      p_operation: "chat",
      p_model: "gpt-5.6-terra",
      p_input_tokens: 100,
      p_cached_input_tokens: 20,
      p_output_tokens: 30,
      p_reasoning_tokens: 10,
      p_provider_request_id: "resp_123",
      p_source_type: "conversation",
      p_source_id: "dbb96c5e-29e6-4af8-b5b8-142b788a68af",
      p_user_id: "c127d3ee-87af-43bf-bf8d-04a8474bdc46",
    });
  });

  it("logs only non-sensitive metadata when ledger recording fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ error: { code: "42501", message: "sensitive database detail" } }),
    } as unknown as SupabaseClient;

    const recorded = await recordAIUsage(supabase, {
      operation: "chat",
      model: "gpt-5.6-terra",
      userId: "c127d3ee-87af-43bf-bf8d-04a8474bdc46",
      usage: {
        providerRequestId: "resp_123",
        transportRequestId: "req_123",
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 30,
        reasoningTokens: 10,
      },
    });

    expect(recorded).toBe(false);
    expect(errorLog).toHaveBeenCalledWith("AI usage recording failed", {
      operation: "chat",
      model: "gpt-5.6-terra",
      code: "42501",
    });
  });
});
