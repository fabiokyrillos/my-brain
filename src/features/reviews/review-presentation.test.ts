import { describe, expect, it } from "vitest";

import { toReviewDetailView, toReviewSummaryView } from "./review-presentation";

const row = {
  id: "review-1",
  title: "Resumo diário",
  period_type: "weekly_review",
  period_start: "2026-07-13",
  period_end: "2026-07-19",
  status: "generated",
};

describe("toReviewSummaryView", () => {
  it("localizes persisted period and status without exposing enums or model details", () => {
    expect(toReviewSummaryView(row, "pt-BR")).toEqual({
      id: "review-1",
      title: "Resumo diário",
      periodType: "weekly_review",
      tab: "week",
      periodLabel: "Revisão da semana",
      statusLabel: "Concluída",
      statusTone: "positive",
      periodLabelRange: "13/07/2026 — 19/07/2026",
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
    });
    expect(toReviewSummaryView({ ...row, status: "outdated" }, "en")).toMatchObject({
      periodLabel: "Weekly review",
      statusLabel: "May be outdated",
      statusTone: "warning",
    });
  });

  it("carries no content field at all, so a listing cannot render one", () => {
    // The structural half of the OD-2J-1 promise: the history list does not
    // "remember" not to show a preview — it has nothing to show. A regression
    // that reintroduced the field would fail here rather than at review time.
    const view = toReviewSummaryView({ ...row, content: "segredo" } as never, "pt-BR");
    expect(view).not.toBeNull();
    expect(Object.keys(view!)).not.toContain("content");
    expect(JSON.stringify(view)).not.toContain("segredo");
  });

  it("files each period type under the tab that offers it", () => {
    const tabOf = (periodType: string) => toReviewSummaryView({ ...row, period_type: periodType }, "pt-BR")?.tab;
    expect(tabOf("daily")).toBe("day");
    expect(tabOf("weekly_review")).toBe("week");
    expect(tabOf("weekly_plan")).toBe("week");
    expect(tabOf("monthly")).toBe("month");
  });

  it("fails closed for unknown persisted values", () => {
    expect(toReviewSummaryView({ ...row, status: "future_internal_status" }, "pt-BR")).toBeNull();
    expect(toReviewSummaryView({ ...row, period_type: "quarterly" }, "en")).toBeNull();
    expect(toReviewSummaryView({ ...row, period_start: "13/07/2026" }, "pt-BR")).toBeNull();
    expect(toReviewSummaryView({ ...row, id: 7 }, "pt-BR")).toBeNull();
  });
});

describe("toReviewDetailView", () => {
  it("adds the words, and only on the view a review's own page reads", () => {
    expect(toReviewDetailView({ ...row, content: "## Entregas" }, "pt-BR")).toMatchObject({
      id: "review-1",
      content: "## Entregas",
      tab: "week",
    });
  });

  it("refuses a row whose content is not a string", () => {
    expect(toReviewDetailView({ ...row, content: null }, "pt-BR")).toBeNull();
    expect(toReviewDetailView({ ...row, content: 42 }, "en")).toBeNull();
  });

  it("inherits every refusal the summary makes", () => {
    // The detail view must not become a way around the vocabulary checks.
    expect(toReviewDetailView({ ...row, content: "x", status: "nope" }, "pt-BR")).toBeNull();
    expect(toReviewDetailView({ ...row, content: "x", period_type: "quarterly" }, "pt-BR")).toBeNull();
  });
});
