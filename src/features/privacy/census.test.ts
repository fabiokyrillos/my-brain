import { describe, expect, it, vi } from "vitest";

import { loadPrivacyCensus } from "./census";
import { ENUMERATED_TABLES, PRIVACY_CATEGORIES, WITHHELD_TABLES } from "./enumeration";

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

/**
 * `2O-PRIVACY-001`, re-evaluated in slice 2O.6 after the owner's decision.
 *
 * Slice 2O.5 classified it `partial` for one reason: `product_events` had no
 * page, and the surface said so honestly but nothing recorded whether that was
 * a decision or a gap. **That classification and its record stand untouched.**
 * What changed is that ADR-119 makes it a decision, so the absence is now
 * something the tree can be checked against.
 */
describe("2O-PRIVACY-001 / ADR-119: a category with no page carries a signed decision", () => {
  it("has categories to check, and at least one with no page", () => {
    // Non-vacuity twice: the loop below is trivially true of an empty list,
    // and the decision assertion is trivially true if every category has a page.
    expect(PRIVACY_CATEGORIES.length).toBe(12);
    const pageless = PRIVACY_CATEGORIES.filter((category) => category.surface === null);
    expect(pageless.map((category) => category.key)).toEqual(["usage"]);
  });

  it("refuses a null surface that nobody decided", () => {
    const undecided = PRIVACY_CATEGORIES.filter(
      (category) => category.surface === null && category.noSurface === undefined,
    ).map((category) => category.key);

    expect(
      undecided,
      `categories with no page and no decision: ${undecided.join(", ")}. `
        + "A comment is not a decision — without one, 'the owner decided the "
        + "export is the sufficient view' is indistinguishable from 'nobody has "
        + "built the page yet', and the second becomes the first by sitting there.",
    ).toEqual([]);
  });

  it("refuses a decision attached to a category that HAS a page", () => {
    // The control in the other direction: a decision is a permission, and a
    // permission granted where it is not needed is one nobody re-examines.
    const contradictory = PRIVACY_CATEGORIES.filter(
      (category) => category.surface !== null && category.noSurface !== undefined,
    ).map((category) => category.key);
    expect(contradictory).toEqual([]);
  });

  it("names the governing record and gives a reason, not a token", () => {
    for (const category of PRIVACY_CATEGORIES) {
      if (category.noSurface === undefined) continue;
      expect(category.noSurface.adr).toBe("ADR-119");
      expect(category.noSurface.kind).toBe("export-is-the-view");
      expect(category.noSurface.reason.length).toBeGreaterThan(200);
    }
  });

  it("keeps `product_events` in the census and in the export, which is what makes the decision honest", () => {
    /*
     * The owner's decision removes a PAGE. It does not remove the category
     * from the census and it does not remove the table from the export — the
     * export is what makes "no page" acceptable, so an export that dropped it
     * would turn a considered decision into a disappearance.
     */
    const usage = PRIVACY_CATEGORIES.find((category) => category.key === "usage");
    expect(usage).toBeDefined();
    expect(usage!.tables.map((table) => table.table)).toEqual(["product_events"]);
    // Counted and exported like every other enumerated table. Not withheld —
    // the withheld set is abuse counters and the operator error sink, and this
    // is neither.
    expect(ENUMERATED_TABLES.map((table) => table.table)).toContain("product_events");
    expect(WITHHELD_TABLES.map((entry) => entry.table)).not.toContain("product_events");
  });
});
