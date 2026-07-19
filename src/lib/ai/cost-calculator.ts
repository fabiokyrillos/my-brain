export type AIModelPrice = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  longContextThreshold?: number | null;
  longContextInputMultiplier?: number;
  longContextOutputMultiplier?: number;
};

export type AIUsageCostInput = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  price: AIModelPrice;
};

function tokenCount(value: number) {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

function componentCostNanoUsd(tokens: number, usdPerMillion: number, multiplier: number) {
  return Math.round(tokens * usdPerMillion * 1_000 * multiplier);
}

export function calculateAIUsageCost(input: AIUsageCostInput) {
  const inputTokens = tokenCount(input.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, tokenCount(input.cachedInputTokens));
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const outputTokens = tokenCount(input.outputTokens);
  const threshold = input.price.longContextThreshold ?? null;
  const longContextApplied = threshold !== null && inputTokens > threshold;
  const inputMultiplier = longContextApplied ? (input.price.longContextInputMultiplier ?? 1) : 1;
  const outputMultiplier = longContextApplied ? (input.price.longContextOutputMultiplier ?? 1) : 1;
  const costNanoUsd =
    componentCostNanoUsd(uncachedInputTokens, input.price.inputUsdPerMillion, inputMultiplier)
    + componentCostNanoUsd(cachedInputTokens, input.price.cachedInputUsdPerMillion, inputMultiplier)
    + componentCostNanoUsd(outputTokens, input.price.outputUsdPerMillion, outputMultiplier);

  return {
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    longContextApplied,
    costNanoUsd,
    costUsd: costNanoUsd / 1_000_000_000,
  };
}
