import { describe, expect, it } from "vitest";

import { reminderFormatters } from "./formatters";
import { groupReminders, localDayDistance, reminderGroupOf } from "./grouping";
import type { ReminderViewModel } from "./projection";

/**
 * ADR-180 — the list's sections. Presentation only: the projection's rows, in
 * the projection's order, cut by when.
 */

const dayOf = (iso: string) => iso.slice(0, 10);
const TODAY = "2026-11-18";

function reminder(id: string, remindAt: string, overrides: Partial<ReminderViewModel> = {}): ReminderViewModel {
  return {
    id,
    title: id,
    status: "scheduled",
    important: false,
    remindAt,
    sentAt: null,
    hasPendingDelivery: true,
    overdue: false,
    link: null,
    series: null,
    actions: [],
    expectedState: { status: "scheduled", remindAt, title: id, important: false },
    historyHref: "#",
    ...overrides,
  };
}

describe("localDayDistance", () => {
  it("counts whole days, across a month and a year", () => {
    expect(localDayDistance("2026-11-18", "2026-11-18")).toBe(0);
    expect(localDayDistance("2026-11-30", "2026-12-01")).toBe(1);
    expect(localDayDistance("2026-12-31", "2027-01-07")).toBe(7);
    expect(localDayDistance("2026-11-18", "2026-11-17")).toBe(-1);
  });

  it("answers null rather than guessing for a malformed day", () => {
    expect(localDayDistance("2026-11-18", "")).toBeNull();
  });
});

describe("reminderGroupOf", () => {
  it("reads a pending reminder by its distance from today", () => {
    expect(reminderGroupOf(reminder("a", "2026-11-18T20:00:00Z"), TODAY, dayOf)).toBe("today");
    expect(reminderGroupOf(reminder("a", "2026-11-19T01:00:00Z"), TODAY, dayOf)).toBe("tomorrow");
    expect(reminderGroupOf(reminder("a", "2026-11-20T01:00:00Z"), TODAY, dayOf)).toBe("week");
    expect(reminderGroupOf(reminder("a", "2026-11-25T01:00:00Z"), TODAY, dayOf)).toBe("week");
    expect(reminderGroupOf(reminder("a", "2026-11-26T01:00:00Z"), TODAY, dayOf)).toBe("later");
  });

  it("puts a passed hour first, whatever its day", () => {
    expect(reminderGroupOf(reminder("a", "2026-11-18T08:00:00Z", { overdue: true }), TODAY, dayOf)).toBe("late");
    expect(reminderGroupOf(reminder("a", "2026-11-10T08:00:00Z", { overdue: true }), TODAY, dayOf)).toBe("late");
  });

  it("names what will not fire by its state, never by its date", () => {
    const past = "2026-11-18T08:00:00Z";
    expect(reminderGroupOf(reminder("a", past, { status: "sent", hasPendingDelivery: false }), TODAY, dayOf)).toBe("delivered");
    expect(reminderGroupOf(reminder("a", past, { status: "cancelled", hasPendingDelivery: false }), TODAY, dayOf)).toBe("cancelled");
    expect(reminderGroupOf(reminder("a", past, { status: "snoozed", hasPendingDelivery: false }), TODAY, dayOf)).toBe("inactive");
  });

  it("does not guess an unreadable day into today", () => {
    expect(reminderGroupOf(reminder("a", "not a date"), TODAY, () => "")).toBe("later");
  });
});

describe("groupReminders", () => {
  it("keeps the projection's order inside a section and drops empty sections", () => {
    const groups = groupReminders([
      reminder("late", "2026-11-18T08:00:00Z", { overdue: true }),
      reminder("t1", "2026-11-18T16:00:00Z"),
      reminder("t2", "2026-11-18T17:00:00Z"),
      reminder("far", "2027-05-05T12:00:00Z"),
    ], TODAY, dayOf);
    expect(groups.map((group) => [group.key, group.reminders.map((item) => item.id)])).toEqual([
      ["late", ["late"]],
      ["today", ["t1", "t2"]],
      ["later", ["far"]],
    ]);
  });

  it("loses no reminder", () => {
    const all = Array.from({ length: 30 }, (_unused, index) =>
      reminder(`r${index}`, new Date(Date.UTC(2026, 10, 10 + index, 12)).toISOString()));
    const grouped = groupReminders(all, TODAY, dayOf).flatMap((group) => group.reminders);
    expect(grouped).toHaveLength(all.length);
  });
});

describe("the day formatters are bound to the owner's zone", () => {
  const { formatLocalDay, formatDayLabel } = reminderFormatters("pt-BR", "America/Sao_Paulo");

  it("reads the day in the zone, not in UTC", () => {
    // 01:30 UTC on the 19th is still the 18th in São Paulo.
    expect(formatLocalDay("2026-11-19T01:30:00.000Z")).toBe("2026-11-18");
    expect(formatLocalDay("2026-11-19T03:30:00.000Z")).toBe("2026-11-19");
  });

  it("stamps a near day with its weekday and a far one with its year", () => {
    const now = new Date("2026-11-18T15:00:00.000Z");
    expect(formatDayLabel("2026-11-20T17:00:00.000Z", now)).toBe("sex., 20/11");
    expect(formatDayLabel("2027-05-05T12:00:00.000Z", now)).toBe("05/05/2027");
    expect(reminderFormatters("en", "America/Sao_Paulo").formatDayLabel("2026-11-20T17:00:00.000Z", now))
      .toBe("Fri, 11/20");
  });
});
