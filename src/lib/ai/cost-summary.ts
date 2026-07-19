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

function dateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function usdToNanoUsd(value: string | number | null) {
  if (value === null) return 0;
  const normalized = typeof value === "number" ? value.toFixed(12) : value;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2]) * 1_000_000_000;
  const fraction = Number((match[3] ?? "").padEnd(9, "0").slice(0, 9));
  return sign * (whole + fraction);
}

function breakdown(rows: readonly AIUsageRow[], key: "model" | "operation") {
  const grouped = new Map<string, BreakdownItem>();
  for (const row of rows) {
    const groupKey = row[key];
    const current = grouped.get(groupKey) ?? { key: groupKey, costNanoUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
    current.costNanoUsd += usdToNanoUsd(row.cost_usd);
    current.calls += 1;
    current.inputTokens += row.input_tokens;
    current.outputTokens += row.output_tokens;
    grouped.set(groupKey, current);
  }
  return [...grouped.values()].sort((left, right) => right.costNanoUsd - left.costNanoUsd || left.key.localeCompare(right.key));
}

export function summarizeAIUsage(
  events: readonly AIUsageRow[],
  options: { now?: Date; timezone: string },
) {
  const now = options.now ?? new Date();
  const today = dateKey(now, options.timezone);
  const month = today.slice(0, 7);
  const todayRows = events.filter((event) => dateKey(new Date(event.created_at), options.timezone) === today);
  const monthRows = events.filter((event) => dateKey(new Date(event.created_at), options.timezone).startsWith(month));
  const sumCost = (rows: readonly AIUsageRow[]) => rows.reduce((sum, row) => sum + usdToNanoUsd(row.cost_usd), 0);

  return {
    todayCostNanoUsd: sumCost(todayRows),
    monthCostNanoUsd: sumCost(monthRows),
    allTimeCostNanoUsd: sumCost(events),
    monthCalls: monthRows.length,
    allTimeCalls: events.length,
    monthTokens: monthRows.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0),
    unpricedCalls: events.filter((event) => event.cost_status === "unpriced").length,
    byModel: breakdown(events, "model"),
    byOperation: breakdown(events, "operation"),
  };
}
import { z } from "zod";
