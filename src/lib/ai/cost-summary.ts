import { z } from "zod";

// Cost aggregation is owned by the database (`get_ai_cost_summary`, which sums
// in `numeric` and rounds once). The TypeScript mirror that used to live here
// — `summarizeAIUsage`, plus its `breakdown`, `dateKey` and `usdToNanoUsd`
// helpers — had no production caller and rounded differently (per-component,
// in float), so it was a second, subtly divergent answer to a question only
// the ledger may answer. It was removed in the pre-2E hardening pass; what
// remains is the parser that validates the database's own aggregate.

export type AIUsageRow = {
  id: string;
  operation: string;
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cost_usd: string | number | null;
  cost_status: string;
  created_at: string;
};

export type BreakdownItem = {
  key: string;
  costNanoUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

const breakdownItemSchema = z.object({
  key: z.string().min(1),
  costNanoUsd: z.number().int().nonnegative(),
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

const aiCostSummarySchema = z.object({
  todayCostNanoUsd: z.number().int().nonnegative(),
  monthCostNanoUsd: z.number().int().nonnegative(),
  allTimeCostNanoUsd: z.number().int().nonnegative(),
  monthCalls: z.number().int().nonnegative(),
  allTimeCalls: z.number().int().nonnegative(),
  monthTokens: z.number().int().nonnegative(),
  unpricedCalls: z.number().int().nonnegative(),
  byModel: z.array(breakdownItemSchema),
  byOperation: z.array(breakdownItemSchema),
});

export type AICostSummary = z.infer<typeof aiCostSummarySchema>;

export function parseAICostSummary(value: unknown) {
  return aiCostSummarySchema.parse(value);
}
