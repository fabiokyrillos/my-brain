import { describe, expect, it } from "vitest";

import type { CalendarDayView, CalendarItemView } from "./calendar-contracts";
import { spanRows } from "./calendar-spans";

/**
 * Life Brain D.3 (ADR-167) — a multi-day event is one bar across the days it
 * covers, not the same line repeated on each day (C.3's open item: "Week and
 * month draw a multi-day event as one item per day, not as a bar").
 */

function event(rowId: string, date: string, overrides: Partial<CalendarItemView> = {}): CalendarItemView {
  return {
    id: `event:${rowId}:${date}`,
    lane: "event",
    commitment: "committed",
    at: `${date}T12:00:00.000Z`,
    date,
    title: `Evento ${rowId}`,
    sensitivity: { kind: "undetermined" },
    href: null,
    elapsed: false,
    reschedule: null,
    repeats: null,
    joinedReminders: [],
    span: { allDay: true, startsAt: "2026-11-09T03:00:00.000Z", endsAt: "2026-11-12T03:00:00.000Z" },
    ...overrides,
  };
}

function task(date: string): CalendarItemView {
  return { ...event("t", date), id: `deadline:t:${date}`, lane: "deadline", span: null };
}

const DATES = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];

function week(itemsByDate: Record<string, CalendarItemView[]>): CalendarDayView[] {
  return DATES.map((date) => ({ date, isToday: false, inPeriod: true, items: itemsByDate[date] ?? [] }));
}

describe("spanRows", () => {
  it("turns a three-day event into one bar and takes it out of the three cells", () => {
    const days = week({
      "2026-11-10": [event("trip", "2026-11-10"), task("2026-11-10")],
      "2026-11-11": [event("trip", "2026-11-11")],
      "2026-11-12": [event("trip", "2026-11-12")],
    });
    const { lanes, days: cells } = spanRows(days);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toEqual([
      { kind: "gap", columns: 1 },
      { kind: "bar", columns: 3, item: days[1].items[0], continuesBefore: false, continuesAfter: false },
      { kind: "gap", columns: 3 },
    ]);
    expect(cells.map((day) => day.items.map((item) => item.id))).toEqual([[], ["deadline:t:2026-11-10"], [], [], [], [], []]);
  });

  it("says when the bar runs past the row on either side", () => {
    const days = week({ "2026-11-09": [event("trip", "2026-11-09")], "2026-11-10": [event("trip", "2026-11-10")] });
    const all = [{ id: "event:trip:2026-11-08" }, ...days.flatMap((day) => day.items)];
    const { lanes } = spanRows(days, all);
    expect(lanes[0][0]).toMatchObject({ kind: "bar", columns: 2, continuesBefore: true, continuesAfter: false });
  });

  it("stacks bars that overlap, and shares a lane between bars that do not", () => {
    const days = week({
      "2026-11-09": [event("a", "2026-11-09")], "2026-11-10": [event("a", "2026-11-10"), event("b", "2026-11-10")],
      "2026-11-11": [event("b", "2026-11-11")],
      "2026-11-13": [event("c", "2026-11-13")], "2026-11-14": [event("c", "2026-11-14")],
    });
    const { lanes } = spanRows(days);
    expect(lanes).toHaveLength(2);
    expect(lanes[0].filter((cell) => cell.kind === "bar").map((cell) => cell.kind === "bar" && cell.item.id)).toEqual(["event:a:2026-11-09", "event:c:2026-11-13"]);
    expect(lanes[1].filter((cell) => cell.kind === "bar").map((cell) => cell.kind === "bar" && cell.item.id)).toEqual(["event:b:2026-11-10"]);
  });

  it("leaves a one-day event, and every other lane, in its cell", () => {
    const days = week({ "2026-11-11": [event("dentist", "2026-11-11", { span: { allDay: false, startsAt: "x", endsAt: null } }), task("2026-11-11")] });
    const { lanes, days: cells } = spanRows(days);
    expect(lanes).toEqual([]);
    expect(cells[2].items).toHaveLength(2);
  });

  it("covers every column exactly once in each lane", () => {
    const days = week({ "2026-11-14": [event("w", "2026-11-14")], "2026-11-15": [event("w", "2026-11-15")] });
    for (const lane of spanRows(days).lanes) {
      expect(lane.reduce((sum, cell) => sum + cell.columns, 0)).toBe(7);
    }
  });
});
