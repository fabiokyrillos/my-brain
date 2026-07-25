import { describe, expect, it } from "vitest";
import { parseAICostSummary } from "./cost-summary";

// The `summarizeAIUsage` tests were removed with the function itself in the
// pre-2E hardening pass: it had no production caller and rounded differently
// from `get_ai_cost_summary`, the database aggregate that actually answers this
// question. What remains under test is the parser that validates that
// aggregate before the costs page trusts it.
describe("parseAICostSummary", () => {
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

  it("rejects an aggregate with a malformed breakdown entry", () => {
    const aggregate = {
      todayCostNanoUsd: 0,
      monthCostNanoUsd: 0,
      allTimeCostNanoUsd: 0,
      monthCalls: 0,
      allTimeCalls: 0,
      monthTokens: 0,
      unpricedCalls: 0,
      byModel: [{ key: "", costNanoUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }],
      byOperation: [],
    };

    expect(() => parseAICostSummary(aggregate)).toThrow();
  });
});
