import { describe, expect, it, vi } from "vitest";

import { loadReviewListProjection } from "./review-list";

vi.mock("server-only", () => ({}));

/**
 * The stub records the calls rather than answering to whatever it is asked.
 *
 * A fake keyed by table name cannot detect a wrong table name — this repository
 * shipped `.from("reviews")` for weeks with a passing unit test, because the
 * stub said `reviews` too and both disagreed with the database. So the
 * assertions below check the **arguments**, and `from` returns the same query
 * object for any name, which means naming the wrong table proves nothing and
 * the `toHaveBeenCalledWith("summaries")` assertion is the only thing keeping it
 * honest.
 */
function harness(rows: readonly unknown[] = []) {
  const calls: Record<string, unknown[][]> = {};
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "neq", "order", "range"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return query;
    });
  }
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(onFulfilled);
  const from = vi.fn(() => query);
  return { calls, from, query };
}

const INPUT = {
  userId: "user-1",
  locale: "en" as const,
  page: 1,
  tab: "week" as const,
  excludePeriodStart: "2026-08-17",
};

describe("loadReviewListProjection", () => {
  it("reads summaries, explicitly owner-scoped", async () => {
    const { from, query } = harness();
    await loadReviewListProjection({ from } as never, INPUT);
    expect(from).toHaveBeenCalledWith("summaries");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("selects no content column, so masked prose never reaches the listing payload", () => {
    // Asserted on the query rather than on the output: a view without a content
    // field still ships the column in the RSC payload if the select asked for it.
    const { from, calls } = harness();
    return loadReviewListProjection({ from } as never, INPUT).then(() => {
      const selected = String(calls.select?.[0]?.[0] ?? "");
      expect(selected).not.toContain("content");
      // …and the control: the columns it does need must really be there, or the
      // check above passes over an empty string.
      expect(selected).toContain("period_type");
      expect(selected).toContain("status");
    });
  });

  it("filters to the tab's own period types", async () => {
    const { from, calls } = harness();
    await loadReviewListProjection({ from } as never, INPUT);
    expect(calls.in?.[0]).toEqual(["period_type", ["weekly_review", "weekly_plan"]]);

    const day = harness();
    await loadReviewListProjection({ from: day.from } as never, { ...INPUT, tab: "day" });
    expect(day.calls.in?.[0]).toEqual(["period_type", ["daily"]]);

    const month = harness();
    await loadReviewListProjection({ from: month.from } as never, { ...INPUT, tab: "month" });
    expect(month.calls.in?.[0]).toEqual(["period_type", ["monthly"]]);
  });

  it("excludes the running period in the query, not after it", async () => {
    // A filter applied after the range would make a page of results silently
    // come back short.
    const { from, calls } = harness();
    await loadReviewListProjection({ from } as never, INPUT);
    expect(calls.neq?.[0]).toEqual(["period_start", "2026-08-17"]);
  });

  it("drops a row the presentation contract refuses rather than rendering it", async () => {
    const good = {
      id: "a",
      title: "Weekly review",
      period_type: "weekly_review",
      period_start: "2026-08-10",
      period_end: "2026-08-16",
      status: "generated",
    };
    const { from } = harness([good, { ...good, id: "b", status: "unknown_status" }]);
    const projection = await loadReviewListProjection({ from } as never, INPUT);
    expect(projection.items.map((item) => item.id)).toEqual(["a"]);
  });
});
