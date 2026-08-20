import { describe, expect, it } from "vitest";

import {
  addLocalDays,
  addLocalMonths,
  compareLocalDates,
  daysInLocalMonth,
  formatLocalDate,
  isSupportedTimeZone,
  localDateOf,
  localDayBounds,
  localDayBoundsForDate,
  localDayLengthHours,
  localRangeBounds,
  parseLocalDate,
  startOfLocalMonth,
  startOfLocalWeek,
  startOfNextLocalDay,
  type LocalDate,
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

/**
 * `2M-CAL-004`/`-005`, `2M-TIME-002` — the calendar's date arithmetic.
 *
 * The calendar names its days in the URL, so it asks the contract about a
 * **date** rather than about an instant. These are the same properties proved
 * above, asked the other way round: a named 23-hour day is still 23 hours, a
 * named day whose local midnight does not exist still starts when it genuinely
 * starts, and a week containing a transition is not 168 hours.
 */
describe("2M-CAL-004: a named local day, and a run of them", () => {
  it("parses only a real ISO date, and refuses everything else", () => {
    expect(parseLocalDate("2026-08-15")).toEqual({ year: 2026, month: 8, day: 15 });
    // A real leap day, and the fixture error this assertion caught in its own
    // first draft: **2026 is not a leap year**, and the draft asserted that
    // `2026-02-29` parsed. Recorded rather than smoothed, for the same reason
    // slice 2M.0's Santiago fixture error is — a hand-written date fixture is
    // the one input a date test cannot check for you.
    expect(parseLocalDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    for (const bad of [
      "2026-8-5", "2026-13-01", "2026-00-10", "2026-02-30", "2026-04-31",
      // Not a leap year, so the 29th does not exist.
      "2026-02-29",
      "20260815", "2026-08-15T00:00:00Z", "not-a-date", "", "  ", null, undefined, 42, {},
      ["2026-08-15"],
    ]) {
      expect(parseLocalDate(bad), String(bad)).toBeNull();
    }
  });

  it("refuses a year `Date.UTC` would silently move, rather than accepting it", () => {
    /*
     * `Date.UTC(1, 0, 1)` is **1901**, not year 1: the two-digit-year legacy
     * mapping applies to 0–99. The round-trip check refuses those dates instead
     * of returning a year the caller did not write — which is the whole reason
     * the parser round-trips rather than trusting three regex captures.
     */
    for (const iso of ["0001-01-01", "0099-06-15"]) {
      expect(parseLocalDate(iso), iso).toBeNull();
    }
    expect(parseLocalDate("0100-01-01")).toEqual({ year: 100, month: 1, day: 1 });
  });

  it("round-trips through its formatted form", () => {
    for (const iso of ["2026-01-01", "2026-08-15", "2026-12-31", "2024-02-29", "0100-01-01"]) {
      expect(formatLocalDate(parseLocalDate(iso)!)).toBe(iso);
    }
  });

  it("shifts by calendar days across a month, a year and a leap day", () => {
    expect(addLocalDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 1 });
    expect(addLocalDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addLocalDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(addLocalDays({ year: 2024, month: 3, day: 1 }, -1)).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("orders dates without ever building an instant", () => {
    const earlier = { year: 2026, month: 8, day: 15 };
    const later = { year: 2026, month: 8, day: 16 };
    expect(compareLocalDates(earlier, later)).toBeLessThan(0);
    expect(compareLocalDates(later, earlier)).toBeGreaterThan(0);
    expect(compareLocalDates(earlier, { ...earlier })).toBe(0);
    expect(compareLocalDates({ year: 2025, month: 12, day: 31 }, { year: 2026, month: 1, day: 1 }))
      .toBeLessThan(0);
  });

  it("reads the date an instant falls on, in the user's zone and not the host's", () => {
    // 2026-08-15T02:00Z is still the 14th in São Paulo and already the 15th in
    // Sydney. A calendar that read the host's zone would put the same instant on
    // two different days for two users.
    const instant = new Date("2026-08-15T02:00:00Z");
    expect(localDateOf(instant, "America/Sao_Paulo")).toEqual({ year: 2026, month: 8, day: 14 });
    expect(localDateOf(instant, "Australia/Sydney")).toEqual({ year: 2026, month: 8, day: 15 });
    expect(() => localDateOf(instant, "EST")).toThrow(/unsupported time zone/);
  });

  it("agrees with the instant-based contract on an ordinary day", () => {
    // The two entry points must not be two implementations. Same day, same
    // edges, asked both ways.
    const zone = "America/Sao_Paulo";
    const byInstant = localDayBounds(noonLocal(zone, 2026, 8, 15), zone);
    const byDate = localDayBoundsForDate({ year: 2026, month: 8, day: 15 }, zone);
    expect(byDate).toEqual(byInstant);
  });

  it("gives a named 23-hour day 23 hours, and a named 25-hour day 25", () => {
    expect(localDayLengthHours(localDayBoundsForDate({ year: 2026, month: 3, day: 8 }, "America/New_York")))
      .toBe(23);
    expect(localDayLengthHours(localDayBoundsForDate({ year: 2026, month: 11, day: 1 }, "America/New_York")))
      .toBe(25);
    expect(localDayLengthHours(localDayBoundsForDate({ year: 2026, month: 10, day: 4 }, "Australia/Sydney")))
      .toBe(23);
    expect(localDayLengthHours(localDayBoundsForDate({ year: 2026, month: 4, day: 5 }, "Australia/Sydney")))
      .toBe(25);
  });

  it("starts the day that has no local midnight when it genuinely starts", () => {
    // `America/Santiago` springs forward AT midnight on 2026-09-06, so
    // 00:00-00:59 never happens and the day begins at 01:00 local.
    const bounds = localDayBoundsForDate({ year: 2026, month: 9, day: 6 }, "America/Santiago");
    expect(localDayLengthHours(bounds)).toBe(23);
    const startParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(bounds.start));
    expect(startParts.find((part) => part.type === "hour")?.value).toBe("01");
  });

  it("makes a week of days tile with no gap and no overlap, across a transition", () => {
    const zone = "America/New_York";
    const week = localRangeBounds({ year: 2026, month: 3, day: 2 }, 7, zone);
    let cursor = { year: 2026, month: 3, day: 2 };
    let edge = week.start;
    for (let index = 0; index < 7; index += 1) {
      const day = localDayBoundsForDate(cursor, zone);
      expect(day.start).toBe(edge);
      edge = day.end;
      cursor = addLocalDays(cursor, 1);
    }
    expect(edge).toBe(week.end);
  });

  it("makes a week containing a spring-forward 167 hours, not 168", () => {
    // The assertion that would have passed against a `start + 7 * 24h` range and
    // is the reason the range is composed from its two ends.
    const zone = "America/New_York";
    const springWeek = localRangeBounds({ year: 2026, month: 3, day: 2 }, 7, zone);
    expect((springWeek.end - springWeek.start) / (60 * 60 * 1000)).toBe(167);

    const fallWeek = localRangeBounds({ year: 2026, month: 10, day: 26 }, 7, zone);
    expect((fallWeek.end - fallWeek.start) / (60 * 60 * 1000)).toBe(169);

    const ordinary = localRangeBounds({ year: 2026, month: 8, day: 10 }, 7, zone);
    expect((ordinary.end - ordinary.start) / (60 * 60 * 1000)).toBe(168);
  });

  it("refuses a range of zero or a fractional number of days", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => localRangeBounds({ year: 2026, month: 8, day: 15 }, bad, "UTC")).toThrow();
    }
  });

  it("starts a week on Monday, in both locales and every zone", () => {
    // 2026-08-15 is a Saturday.
    expect(startOfLocalWeek({ year: 2026, month: 8, day: 15 })).toEqual({ year: 2026, month: 8, day: 10 });
    // A Sunday belongs to the week that began six days earlier, not to the next.
    expect(startOfLocalWeek({ year: 2026, month: 8, day: 16 })).toEqual({ year: 2026, month: 8, day: 10 });
    // A Monday is its own week start.
    expect(startOfLocalWeek({ year: 2026, month: 8, day: 17 })).toEqual({ year: 2026, month: 8, day: 17 });
    // And it crosses a month boundary without special-casing one.
    expect(startOfLocalWeek({ year: 2026, month: 9, day: 2 })).toEqual({ year: 2026, month: 8, day: 31 });
  });
});

/**
 * `2P-CALENDAR-001` — the month, added here rather than in the calendar.
 *
 * `phase-2m-local-day-guard.test.ts` fails the build on a module that derives a
 * day boundary of its own, and a calendar that computed *"the first of the
 * month"* from a `Date` in some zone would be exactly the fourth copy that guard
 * exists to stop. So the month arithmetic lives beside the week arithmetic, in
 * the one module that owns wall-clock dates, and the calendar consumes it.
 */
describe("2P-CALENDAR-001: the month a date belongs to", () => {
  const date = (value: string): LocalDate => {
    const parsed = parseLocalDate(value);
    if (!parsed) throw new Error(`fixture is not a date: ${value}`);
    return parsed;
  };

  it("starts a month on its first day, whatever the anchor was", () => {
    expect(startOfLocalMonth(date("2026-08-19"))).toEqual({ year: 2026, month: 8, day: 1 });
    expect(startOfLocalMonth(date("2026-08-01"))).toEqual({ year: 2026, month: 8, day: 1 });
    expect(startOfLocalMonth(date("2026-08-31"))).toEqual({ year: 2026, month: 8, day: 1 });
  });

  it("counts the days a month actually has, including a leap February", () => {
    expect(daysInLocalMonth(date("2026-02-10"))).toBe(28);
    expect(daysInLocalMonth(date("2028-02-10"))).toBe(29);
    expect(daysInLocalMonth(date("2026-04-10"))).toBe(30);
    expect(daysInLocalMonth(date("2026-12-10"))).toBe(31);
  });

  it("steps whole months and crosses the year boundary in both directions", () => {
    expect(addLocalMonths(date("2026-12-15"), 1)).toEqual({ year: 2027, month: 1, day: 15 });
    expect(addLocalMonths(date("2026-01-15"), -1)).toEqual({ year: 2025, month: 12, day: 15 });
    expect(addLocalMonths(date("2026-08-19"), 0)).toEqual({ year: 2026, month: 8, day: 19 });
  });

  /**
   * The property a naive `setMonth` gets wrong: January 31 plus one month is
   * February 28, never March 3. A calendar whose *next month* control skipped
   * February would be unusable exactly once a year — the kind of defect that
   * ships because nobody presses it on the thirty-first.
   */
  it("clamps a day the target month does not have, rather than overflowing", () => {
    expect(addLocalMonths(date("2026-01-31"), 1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(addLocalMonths(date("2028-01-31"), 1)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(addLocalMonths(date("2026-03-31"), -1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(addLocalMonths(date("2026-05-31"), 1)).toEqual({ year: 2026, month: 6, day: 30 });
  });

  it("never produces a date its own parser would refuse", () => {
    for (let step = -30; step <= 30; step += 1) {
      for (const start of ["2026-01-31", "2026-03-31", "2028-02-29", "2026-08-15"]) {
        const shifted = addLocalMonths(date(start), step);
        expect(parseLocalDate(formatLocalDate(shifted))).toEqual(shifted);
      }
    }
  });
});
