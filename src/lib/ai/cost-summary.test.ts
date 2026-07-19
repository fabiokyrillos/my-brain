import { describe, expect, it } from "vitest";
import { parseAICostSummary, summarizeAIUsage } from "./cost-summary";

const events = [
  { id: "1", operation: "chat", model: "gpt-5.6-terra", input_tokens: 1_000, cached_input_tokens: 100, output_tokens: 200, reasoning_tokens: 50, cost_usd: "0.005250000000", cost_status: "calculated", created_at: "2026-07-16T14:00:00Z" },
  { id: "2", operation: "capture_extraction", model: "gpt-5.6-luna", input_tokens: 500, cached_input_tokens: 0, output_tokens: 100, reasoning_tokens: 20, cost_usd: "0.001100000000", cost_status: "calculated", created_at: "2026-07-15T18:00:00Z" },
  { id: "3", operation: "semantic_search", model: "text-embedding-3-small", input_tokens: 100, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, cost_usd: "0.000002000000", cost_status: "calculated", created_at: "2026-06-30T18:00:00Z" },
  { id: "4", operation: "chat", model: "unknown", input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_tokens: 0, cost_usd: null, cost_status: "unpriced", created_at: "2026-07-16T13:00:00Z" },
] as const;

describe("summarizeAIUsage", () => {
  it("aggregates today, local month, all time, calls, and tokens", () => {
    const summary = summarizeAIUsage(events, { now: new Date("2026-07-16T15:00:00Z"), timezone: "America/Sao_Paulo" });

    expect(summary.todayCostNanoUsd).toBe(5_250_000);
    expect(summary.monthCostNanoUsd).toBe(6_350_000);
    expect(summary.allTimeCostNanoUsd).toBe(6_352_000);
    expect(summary.monthCalls).toBe(3);
    expect(summary.monthTokens).toBe(1_815);
    expect(summary.unpricedCalls).toBe(1);
  });

  it("sorts model and operation breakdowns by calculated cost", () => {
    const summary = summarizeAIUsage(events, { now: new Date("2026-07-16T15:00:00Z"), timezone: "America/Sao_Paulo" });

    expect(summary.byModel.map((item) => item.key)).toEqual(["gpt-5.6-terra", "gpt-5.6-luna", "text-embedding-3-small", "unknown"]);
    expect(summary.byOperation[0]).toMatchObject({ key: "chat", costNanoUsd: 5_250_000, calls: 2 });
  });

  it("validates the database aggregate contract", () => {
    const aggregate = {
      todayCostNanoUsd: 10,
      monthCostNanoUsd: 20,
      allTimeCostNanoUsd: 30,
      monthCalls: 2,
      allTimeCalls: 3,
      monthTokens: 40,
      unpricedCalls: 1,
      byModel: [{ key: "gpt-5.6-terra", costNanoUsd: 30, calls: 3, inputTokens: 20, outputTokens: 20 }],
      byOperation: [{ key: "chat", costNanoUsd: 30, calls: 3, inputTokens: 20, outputTokens: 20 }],
    };

    expect(parseAICostSummary(aggregate)).toEqual(aggregate);
    expect(() => parseAICostSummary({ ...aggregate, monthCalls: -1 })).toThrow();
  });
});
