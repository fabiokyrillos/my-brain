import type { BreakdownItem } from "@/lib/ai/cost-summary";
import type { Locale } from "@/lib/preferences";

/**
 * What Custos derives from the aggregate it already loads — nothing here reads
 * the database, and nothing here adds up money: `get_ai_cost_summary` is the
 * only place a total is computed. These are the page's presentation rules, kept
 * out of the route so they can be tested without rendering it.
 */

const NANO = 1_000_000_000;

/** An amount in USD, in the reader's own number format. */
export function formatUsd(nanoUsd: number, locale: Locale): string {
  const value = nanoUsd / NANO;
  const format = (amount: number, minimum: number, maximum: number) =>
    new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: minimum,
      maximumFractionDigits: maximum,
    }).format(amount);
  // Smaller than the smallest figure the page prints: said as a bound, never
  // rounded down to a zero that would read as "this cost nothing".
  if (value > 0 && value < 0.0001) return `< ${format(0.0001, 4, 4)}`;
  return value > 0 && value < 0.01 ? format(value, 4, 6) : format(value, 2, 2);
}

/** A ledger row's `cost_usd` (a numeric string) in the unit the page formats. */
export function usdToNano(costUsd: string | number | null): number {
  return Math.round(Number(costUsd ?? 0) * NANO);
}

export type ShareRow = BreakdownItem & {
  /** The part of the total this row is, as the caption says it. */
  readonly percent: string;
  /** The same part as the width of the row's rule, in percent. */
  readonly width: number;
};

/**
 * Each row of a breakdown with its part of the whole.
 *
 * The order is the database's and is not changed. A row that cost something is
 * never drawn as nothing: its rule has a floor of one percent and its caption
 * reads "<1%". A total of zero gives every row an empty rule rather than a
 * division by zero.
 */
export function withShares(items: readonly BreakdownItem[], totalNanoUsd: number): ShareRow[] {
  return items.map((item) => {
    const share = totalNanoUsd > 0 ? Math.min(item.costNanoUsd / totalNanoUsd, 1) : 0;
    const rounded = Math.round(share * 100);
    const percent = share > 0 && rounded < 1 ? "<1%" : `${rounded}%`;
    const width = share > 0 ? Math.max(share * 100, 1) : 0;
    return { ...item, percent, width: Math.round(width * 10) / 10 };
  });
}

/** A catalogue price per million tokens, without the zeros it does not need. */
export function formatRate(value: string | number): string {
  return `$${Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}
