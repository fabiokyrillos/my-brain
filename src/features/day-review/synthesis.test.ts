import { describe, expect, it } from "vitest";

import type { DayReviewItem, DayReviewProjection } from "./day-review-projection";
import { summarizeDayReview } from "./synthesis";

function item(overrides: Partial<DayReviewItem> = {}): DayReviewItem {
  return {
    taskId: "t1",
    title: "Entregar o relatório",
    status: "todo",
    dueAt: null,
    plannedAt: null,
    completedAt: null,
    sensitivity: { kind: "undetermined" },
    href: "/pt-BR/app/work/t1",
    verbs: [],
    ...overrides,
  };
}

function projection(overrides: Partial<DayReviewProjection> = {}): DayReviewProjection {
  return {
    scope: "day",
    day: "2026-08-15",
    isToday: true,
    timezone: "America/Sao_Paulo",
    nextDay: "2026-08-16",
    completed: [],
    planned: [],
    due: [],
    captured: [],
    generated: null,
    sourceStates: { completed: "read", planned: "read", due: "read", captured: "read", generated: "read" },
    unreadable: [],
    truncated: [],
    schedule: { dailyAt: null, weeklyAt: null, weeklyWeekday: null, dailyTimeReached: false, weeklyDayReached: false },
    ...overrides,
  } as DayReviewProjection;
}

describe("summarizeDayReview", () => {
  it("counts what closed, what did not, and what was written down", () => {
    const summary = summarizeDayReview(projection({
      completed: [item({ taskId: "done", completedAt: "2026-08-15T20:00:00.000Z" })],
      planned: [item({ taskId: "open-1" })],
      due: [item({ taskId: "open-2" })],
      captured: [
        { entryId: "e1", excerpt: "…", capturedAt: "2026-08-15T12:00:00.000Z", sensitivity: { kind: "undetermined" }, href: "/x" },
      ],
    }));

    expect(summary).toMatchObject({ completed: 1, open: 2, captured: 1, quiet: false });
  });

  /*
    A task planned for today AND due today is one pendência. Counting it twice
    would inflate every day that has both — which is the ordinary case for
    anything with a deadline the owner also intends to work on.
  */
  it("counts a task that is both planned and due once", () => {
    const both = item({ taskId: "same", plannedAt: "2026-08-15", dueAt: "2026-08-15T20:00:00.000Z" });
    const summary = summarizeDayReview(projection({ planned: [both], due: [both] }));

    expect(summary.open).toBe(1);
  });

  it("does not count a completed intention as still open", () => {
    const summary = summarizeDayReview(projection({
      planned: [item({ taskId: "closed", completedAt: "2026-08-15T18:00:00.000Z" })],
    }));

    expect(summary.open).toBe(0);
  });

  /*
    The one that matters. A review that says nothing happened when four queries
    failed is lying about the same screen — `2M-REVIEW-001`'s whole premise.
  */
  it("refuses to call a day quiet when a source could not be read", () => {
    const summary = summarizeDayReview(projection({
      sourceStates: { completed: "unavailable", planned: "read", due: "read", captured: "read", generated: "read" },
    }));

    expect(summary.quiet).toBe(false);
    expect(summary.partial).toEqual(["completed"]);
  });

  it("calls a day quiet only when everything was read and everything is zero", () => {
    expect(summarizeDayReview(projection()).quiet).toBe(true);
  });

  /*
    `generated` is a different table and a different query, and it feeds none of
    the three counts. Naming it in `partial` would tell the reader their numbers
    are incomplete because a stored review could not be fetched, which is not
    true of any of them.
  */
  it("does not blame an unreadable stored review for the counts", () => {
    const summary = summarizeDayReview(projection({
      sourceStates: { completed: "read", planned: "read", due: "read", captured: "read", generated: "unavailable" },
    }));

    expect(summary.partial).toEqual([]);
    expect(summary.quiet).toBe(true);
  });

  it("names every unreadable source in the order they are read", () => {
    const summary = summarizeDayReview(projection({
      sourceStates: { completed: "read", planned: "unavailable", due: "read", captured: "unavailable", generated: "read" },
    }));

    expect(summary.partial).toEqual(["planned", "captured"]);
  });
});
