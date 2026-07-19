import { describe, expect, it } from "vitest";
import { toReviewListItemView } from "./review-presentation";

const row = {
  id: "review-1",
  title: "Resumo diário",
  content: "Decisões e próximos passos.",
  period_type: "weekly_review",
  period_start: "2026-07-13",
  period_end: "2026-07-19",
  status: "generated",
};

describe("toReviewListItemView", () => {
  it("localizes persisted period and status without exposing enums or model details", () => {
    expect(toReviewListItemView(row, "pt-BR")).toEqual({
      id: "review-1",
      title: "Resumo diário",
      content: "Decisões e próximos passos.",
      periodLabel: "Revisão da semana",
      statusLabel: "Concluída",
      statusTone: "positive",
      periodLabelRange: "13/07/2026 — 19/07/2026",
    });
    expect(toReviewListItemView({ ...row, status: "outdated" }, "en")).toMatchObject({
      periodLabel: "Weekly review",
      statusLabel: "May be outdated",
      statusTone: "warning",
    });
  });

  it("fails closed for unknown persisted values", () => {
    expect(toReviewListItemView({ ...row, status: "future_internal_status" }, "pt-BR")).toBeNull();
    expect(toReviewListItemView({ ...row, period_type: "quarterly" }, "en")).toBeNull();
  });
});
