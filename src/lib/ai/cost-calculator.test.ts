import { describe, expect, it } from "vitest";
import { calculateAIUsageCost } from "./cost-calculator";

const terraPrice = {
  inputUsdPerMillion: 2.5,
  cachedInputUsdPerMillion: 0.25,
  outputUsdPerMillion: 15,
  longContextThreshold: 272_000,
  longContextInputMultiplier: 2,
  longContextOutputMultiplier: 1.5,
};

describe("calculateAIUsageCost", () => {
  it("does not charge cached input twice", () => {
    const result = calculateAIUsageCost({
      inputTokens: 1_000,
      cachedInputTokens: 200,
      outputTokens: 100,
      price: terraPrice,
    });

    expect(result.uncachedInputTokens).toBe(800);
    expect(result.costNanoUsd).toBe(3_550_000);
    expect(result.costUsd).toBe(0.00355);
  });

  it("clamps invalid cached token counts to the total input", () => {
    const result = calculateAIUsageCost({
      inputTokens: 50,
      cachedInputTokens: 80,
      outputTokens: 0,
      price: terraPrice,
    });

    expect(result.cachedInputTokens).toBe(50);
    expect(result.uncachedInputTokens).toBe(0);
  });

  it("applies the model long-context multipliers to the full request", () => {
    const result = calculateAIUsageCost({
      inputTokens: 300_000,
      cachedInputTokens: 0,
      outputTokens: 1_000,
      price: terraPrice,
    });

    expect(result.longContextApplied).toBe(true);
    expect(result.costNanoUsd).toBe(1_522_500_000);
    expect(result.costUsd).toBe(1.5225);
  });

  it("uses standard pricing at the threshold boundary", () => {
    const result = calculateAIUsageCost({
      inputTokens: 272_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      price: terraPrice,
    });

    expect(result.longContextApplied).toBe(false);
    expect(result.costUsd).toBe(0.68);
  });
});
