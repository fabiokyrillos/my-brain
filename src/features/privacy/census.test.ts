import { describe, expect, it, vi } from "vitest";

import { loadPrivacyCensus } from "./census";
import { PRIVACY_CATEGORIES } from "./enumeration";

/**
 * `2O-PRIVACY-001`, `-003` and `-010` — the census, and the rule the owner's
 * decision states explicitly: **a refused or unreadable count is never turned
 * into a zero.**
 *
 * Both directions are asserted, because that is the only way to know the
 * distinction is real: a category that could be counted reports its number, and
 * a category that could not reports `unreadable` — and the tests would fail if
 * either collapsed into the other.
 */

type Refusal = { table: string };

function clientReturning(counts: Record<string, number>, refusals: readonly Refusal[] = []) {
  const refused = new Set(refusals.map((refusal) => refusal.table));
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(async () =>
        refused.has(table)
          ? { count: null, error: { message: "permission denied" } }
          : { count: counts[table] ?? 0, error: null },
      ),
    })),
  }));
  return { from } as never;
}

const ALL_TABLES = PRIVACY_CATEGORIES.flatMap((category) =>
  category.tables.map((entry) => entry.table),
);

describe("2O-PRIVACY-001: the census counts every category", () => {
  it("reports a number for each category when every table can be read", async () => {
    const counts = Object.fromEntries(ALL_TABLES.map((table) => [table, 2]));
    const census = await loadPrivacyCensus(clientReturning(counts), "owner");

    expect(census.categories).toHaveLength(PRIVACY_CATEGORIES.length);
    expect(census.unreadableCategories).toBe(0);
    expect(census.countedRows).toBe(ALL_TABLES.length * 2);
    for (const category of census.categories) expect(category.status).toBe("counted");
  });

  it("a genuinely empty account counts zero rather than reporting nothing", async () => {
    // The control for the assertion below: zero is a legitimate answer, and the
    // surface must be able to say it. Without this, "unreadable is not zero"
    // could be satisfied by never producing a zero at all.
    const census = await loadPrivacyCensus(clientReturning({}), "owner");
    expect(census.countedRows).toBe(0);
    expect(census.unreadableCategories).toBe(0);
    for (const category of census.categories) {
      expect(category).toEqual({ key: category.key, status: "counted", rows: 0 });
    }
  });
});

describe("2O-PRIVACY-010: a refused read is not a zero", () => {
  it("a category whose table refused is unreadable, not zero", async () => {
    const counts = Object.fromEntries(ALL_TABLES.map((table) => [table, 3]));
    const census = await loadPrivacyCensus(
      clientReturning(counts, [{ table: "memories" }]),
      "owner",
    );

    const memories = census.categories.find((category) => category.key === "memories");
    expect(memories).toEqual({ key: "memories", status: "unreadable" });
    expect(memories).not.toHaveProperty("rows");
    expect(census.unreadableCategories).toBe(1);
  });

  it("one refused table makes the whole category unreadable, not a partial total", async () => {
    // `memories` holds two tables. Reporting the one that succeeded would be a
    // partial presented as a whole — `R-2O-19`'s rule, one surface earlier.
    const counts = Object.fromEntries(ALL_TABLES.map((table) => [table, 5]));
    const census = await loadPrivacyCensus(
      clientReturning(counts, [{ table: "summaries" }]),
      "owner",
    );
    expect(census.categories.find((category) => category.key === "memories")?.status).toBe(
      "unreadable",
    );
  });

  it("an unreadable category is excluded from the total rather than counted as zero", async () => {
    const counts = Object.fromEntries(ALL_TABLES.map((table) => [table, 1]));
    const readable = await loadPrivacyCensus(clientReturning(counts), "owner");
    const withRefusal = await loadPrivacyCensus(
      clientReturning(counts, [{ table: "conversations" }]),
      "owner",
    );

    // Two tables in `chat`, both dropped from the total when one refuses — and
    // the count differs from the all-readable run, so the exclusion is visible.
    expect(withRefusal.countedRows).toBe(readable.countedRows - 2);
    expect(withRefusal.countedRows).not.toBe(readable.countedRows);
  });

  it("a successful read that reports no count is not a zero either", async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(async () => ({ count: null, error: null })) })),
    }));
    const census = await loadPrivacyCensus({ from } as never, "owner");
    for (const category of census.categories) expect(category.status).toBe("unreadable");
  });
});
