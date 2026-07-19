import { describe, expect, it } from "vitest";
import { normalizeEmbeddingUsage, normalizeResponseUsage } from "./usage-details";

describe("provider usage normalization", () => {
  it("keeps cached and reasoning token details from a Responses result", () => {
    expect(normalizeResponseUsage({
      id: "resp_123",
      _request_id: "req_123",
      usage: {
        input_tokens: 1_200,
        input_tokens_details: { cached_tokens: 300 },
        output_tokens: 220,
        output_tokens_details: { reasoning_tokens: 80 },
      },
    })).toEqual({
      providerRequestId: "resp_123",
      transportRequestId: "req_123",
      inputTokens: 1_200,
      cachedInputTokens: 300,
      outputTokens: 220,
      reasoningTokens: 80,
    });
  });

  it("returns safe zeroes when usage details are absent", () => {
    expect(normalizeResponseUsage({ id: "resp_empty" })).toEqual({
      providerRequestId: "resp_empty",
      transportRequestId: null,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    });
  });

  it("normalizes embedding prompt tokens and request id", () => {
    expect(normalizeEmbeddingUsage({
      _request_id: "req_embedding",
      usage: { prompt_tokens: 45 },
    })).toEqual({
      providerRequestId: "req_embedding",
      transportRequestId: "req_embedding",
      inputTokens: 45,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    });
  });
});
