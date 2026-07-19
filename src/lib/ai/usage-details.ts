export type AIUsageDetails = {
  providerRequestId: string | null;
  transportRequestId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

type ResponseUsageLike = {
  id?: string | null;
  _request_id?: string | null;
  usage?: {
    input_tokens?: number | null;
    input_tokens_details?: { cached_tokens?: number | null } | null;
    output_tokens?: number | null;
    output_tokens_details?: { reasoning_tokens?: number | null } | null;
  } | null;
};

type EmbeddingUsageLike = {
  _request_id?: string | null;
  usage?: { prompt_tokens?: number | null } | null;
};

export function normalizeResponseUsage(response: ResponseUsageLike): AIUsageDetails {
  return {
    providerRequestId: response.id ?? response._request_id ?? null,
    transportRequestId: response._request_id ?? null,
    inputTokens: response.usage?.input_tokens ?? 0,
    cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

export function normalizeEmbeddingUsage(response: EmbeddingUsageLike): AIUsageDetails {
  return {
    providerRequestId: response._request_id ?? null,
    transportRequestId: response._request_id ?? null,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
}
