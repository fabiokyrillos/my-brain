import { describe, expect, it } from "vitest";

import {
  isSupportedTimeZone,
  localDayBounds,
  localDayLengthHours,
  startOfNextLocalDay,
} from "./local-day";

/**
 * `2M-TIME-001`/`-002`/`-004` — the local-day contract, proved on days that are
 * not 24 hours long.
 *
 * Every transition date below was **computed from the runtime's own tz
 * database** rather than remembered, because a hand-written DST date is a
 * fixture that quietly stops being true. The dates are asserted here as data —
 * if a future tz update moves one, these fail loudly instead of testing a day
 * that no longer transitions.
 *
 * Both hemispheres, both directions, and the case that motivated the module:
 * `America/Santiago` springs forward **at midnight**, so 2026-09-06 has no local
 * midnight at all.
 */

const HOUR = 60 * 60 * 1000;

/** Noon local, which is inside the day under test in every zone below. */
function noonLocal(timeZone: string, year: number, month: number, day: number): Date {
  // Noon UTC is within ±12h of noon local everywhere, and every assertion below
  // is about the day's *edges*, so the exact instant inside the day is
  // immaterial as long as it is inside it.
  const candidate = Date.UTC(year, month - 1, day, 12);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(candidate));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  // Shift onto the intended local date if noon UTC lands on its neighbour.
  const drift = Date.UTC(value("year"), value("month") - 1, value("day")) - Date.UTC(year, month - 1, day);
  return new Date(candidate - drift);
}

describe("2M-TIME-002: a local day is 23, 24 or 25 hours, and never assumed to be 24", () => {
  const cases = [
    { zone: "America/New_York", hemisphere: "north", date: [2026, 3, 8], hours: 23 },
    { zone: "America/New_York", hemisphere: "north", date: [2026, 11, 1], hours: 25 },
    { zone: "Europe/Lisbon", hemisphere: "north", date: [2026, 3, 29], hours: 23 },
    { zone: "Europe/Lisbon", hemisphere: "north", date: [2026, 10, 25], hours: 25 },
    { zone: "Australia/Sydney", hemisphere: "south", date: [2026, 10, 4], hours: 23 },
    { zone: "Australia/Sydney", hemisphere: "south", date: [2026, 4, 5], hours: 25 },
    { zone: "America/Santiago", hemisphere: "south", date: [2026, 9, 6], hours: 23 },
    { zone: "America/Santiago", hemisphere: "south", date: [2026, 4, 4], hours: 25 },
    { zone: "Pacific/Auckland", hemisphere: "south", date: [2026, 9, 27], hours: 23 },
    { zone: "America/Sao_Paulo", hemisphere: "south", date: [2026, 3, 8], hours: 24 },
    { zone: "UTC", hemisphere: "neither", date: [2026, 3, 8], hours: 24 },
  ] as const;

  for (const { zone, hemisphere, date, hours } of cases) {
    const [year, month, day] = date;
    it(`${zone} (${hemisphere}) on ${year}-${month}-${day} is ${hours} hours`, () => {
      const bounds = localDayBounds(noonLocal(zone, year, month, day), zone);
      expect(localDayLengthHours(bounds)).toBe(hours);
    });
  }

  it("covers both hemispheres, both directions, and an ordinary day", () => {
    // The coverage claim, asserted rather than described. A future edit that
    // deletes the southern cases fails here rather than silently narrowing.
    const lengths = new Set(cases.map((c) => c.hours));
    expect([...lengths].sort()).toEqual([23, 24, 25]);
    expect(new Set(cases.map((c) => c.hemisphere))).toEqual(new Set(["north", "south", "neither"]));
  });
});

describe("2M-TIME-002: the bounds are local midnights, not offsets from one another", () => {
  const localMidnightOf = (instant: number, zone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(instant));

  it("starts and ends at 00:00 local on an ordinary day", () => {
    const bounds = localDayBounds(noonLocal("America/Sao_Paulo", 2026, 5, 20), "America/Sao_Paulo");
    expect(localMidnightOf(bounds.start, "America/Sao_Paulo")).toBe("00:00");
    expect(localMidnightOf(bounds.end, "America/Sao_Paulo")).toBe("00:00");
  });

  it("still ends at 00:00 local on a 23-hour day, where start + 24h would not", () => {
    const zone = "America/New_York";
    const bounds = localDayBounds(noonLocal(zone, 2026, 3, 8), zone);
    expect(localMidnightOf(bounds.end, zone)).toBe("00:00");
    // The defect this replaces, stated as an executable comparison: the old
    // `start + 24h` lands an hour into the *next* local day.
    expect(localMidnightOf(bounds.start + 24 * HOUR, zone)).toBe("01:00");
  });

  it("still ends at 00:00 local on a 25-hour day, where start + 24h would fall short", () => {
    const zone = "Australia/Sydney";
    const bounds = localDayBounds(noonLocal(zone, 2026, 4, 5), zone);
    expect(localMidnightOf(bounds.end, zone)).toBe("00:00");
    expect(localMidnightOf(bounds.start + 24 * HOUR, zone)).toBe("23:00");
  });
});

describe("2M-TIME-002: a day whose local midnight never happens", () => {
  /*
   * `America/Santiago` springs forward at midnight: on 2026-09-06 the local
   * times 00:00–00:59 do not exist. A fixed-point iteration converges on
   * 2026-09-05T23:00 local — a boundary inside the *previous* day, which is
   * exactly the silent wrong answer this module was written to refuse.
   */
  const zone = "America/Santiago";

  it("starts the day at the first instant that exists, not in the day before", () => {
    const bounds = localDayBounds(noonLocal(zone, 2026, 9, 6), zone);
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(bounds.start));
    expect(local).toBe("2026-09-06, 01:00");
  });

  it("charges the skipped hour to the day that lost it, not to the day before", () => {
    /*
     * The transition is at 24:00 on the 5th, so the 5th keeps a **full** 24
     * hours of wall clock and the 6th is the short day. The naive fixed point
     * gets this exactly backwards — it reports the 5th as 23 hours and starts
     * the 6th inside the 5th — and that inversion is what this asserts against.
     * The fixture was corrected from the runtime's own tz data after the first
     * version of this test encoded the naive answer.
     */
    const fifth = localDayBounds(noonLocal(zone, 2026, 9, 5), zone);
    const sixth = localDayBounds(noonLocal(zone, 2026, 9, 6), zone);
    expect(localDayLengthHours(fifth)).toBe(24);
    expect(localDayLengthHours(sixth)).toBe(23);
    expect(fifth.end).toBe(sixth.start);
  });
});

describe("2M-TIME-002: consecutive days tile without gap or overlap", () => {
  it("holds across every transition under test", () => {
    for (const [zone, year, month, day] of [
      ["America/New_York", 2026, 3, 8],
      ["America/New_York", 2026, 11, 1],
      ["Australia/Sydney", 2026, 10, 4],
      ["Australia/Sydney", 2026, 4, 5],
      ["America/Santiago", 2026, 9, 6],
      ["Pacific/Auckland", 2026, 9, 27],
      ["Europe/Lisbon", 2026, 10, 25],
    ] as const) {
      const today = localDayBounds(noonLocal(zone, year, month, day), zone);
      const tomorrow = localDayBounds(new Date(today.end + 6 * HOUR), zone);
      expect(today.end, `${zone} ${year}-${month}-${day} leaves a gap or overlap`)
        .toBe(tomorrow.start);
      expect(startOfNextLocalDay(noonLocal(zone, year, month, day), zone).getTime()).toBe(today.end);
    }
  });
});

describe("2M-TIME-003: an uncomputable day is reported, never defaulted", () => {
  it("refuses a zone that carries no DST rule", () => {
    // `EST` parses and is a fixed offset. A day computed in it would be silently
    // wrong twice a year, which is worse than refusing.
    expect(isSupportedTimeZone("EST")).toBe(false);
    expect(() => localDayBounds(new Date(), "EST")).toThrow(/unsupported time zone/);
  });

  it("refuses an empty, missing or nonsense zone", () => {
    for (const bad of ["", "   ", "Not/AZone", null, undefined, 42, {}]) {
      expect(isSupportedTimeZone(bad)).toBe(false);
      expect(() => localDayBounds(new Date(), bad as unknown as string)).toThrow();
    }
  });

  it("refuses an invalid instant rather than answering", () => {
    expect(() => localDayBounds(new Date(Number.NaN), "UTC")).toThrow(/invalid Date/);
  });

  it("admits UTC and ordinary region zones", () => {
    for (const good of ["UTC", "America/Sao_Paulo", "Australia/Sydney", "Europe/Lisbon"]) {
      expect(isSupportedTimeZone(good)).toBe(true);
    }
  });
});
