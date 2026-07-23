import { describe, expect, it } from "vitest";
import { actionablePendingQuestionFilter } from "./question-visibility";

describe("actionablePendingQuestionFilter", () => {
  it("treats open questions and snoozed questions past their deadline as actionable", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    expect(actionablePendingQuestionFilter(now)).toBe(
      "status.eq.open,and(status.eq.snoozed,snoozed_until.lte.2026-07-23T12:00:00.000Z)",
    );
  });

  it("defaults to the current instant", () => {
    const before = Date.now();
    const filter = actionablePendingQuestionFilter();
    const embedded = Date.parse(filter.slice(filter.indexOf("lte.") + 4, -1));
    expect(embedded).toBeGreaterThanOrEqual(before);
    expect(embedded).toBeLessThanOrEqual(Date.now());
  });
});
