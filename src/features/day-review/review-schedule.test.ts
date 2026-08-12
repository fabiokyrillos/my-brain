/**
 * `2M-REVIEW-006` — the three preferences that were given a consumer, and the
 * boundary that consumer may not cross.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseReviewTime, parseReviewWeekday, readReviewSchedule } from "./review-schedule";

/** 2026-08-11 is a Tuesday. `getUTCDay()` numbers it 2. */
const TUESDAY = { year: 2026, month: 8, day: 11 } as const;

describe("parsing refuses rather than defaults", () => {
  it("accepts both stored shapes of a `time` column", () => {
    expect(parseReviewTime("22:00")).toEqual({ hour: 22, minute: 0 });
    expect(parseReviewTime("22:00:00")).toEqual({ hour: 22, minute: 0 });
  });

  it("returns null for anything else, so an unreadable preference is not claimed", () => {
    for (const bad of [null, undefined, 22, "", "9:00", "24:00", "22:60", "later"]) {
      expect(parseReviewTime(bad), String(bad)).toBeNull();
    }
  });

  it("refuses a weekday outside 0..6 instead of wrapping it into a different day", () => {
    expect(parseReviewWeekday(5)).toBe(5);
    expect(parseReviewWeekday(0)).toBe(0);
    for (const bad of [7, -1, 1.5, "5", null, undefined]) {
      expect(parseReviewWeekday(bad), String(bad)).toBeNull();
    }
  });
});

describe("2M-REVIEW-006: the preferences change what the surface says", () => {
  const base = { weeklyReviewTime: "19:00", weeklyReviewDay: 5, today: TUESDAY };

  it("reports the daily time as not yet reached before it", () => {
    const reading = readReviewSchedule({ ...base, dailyReviewTime: "22:00", nowLocalMinutes: 21 * 60 });
    expect(reading.dailyAt).toBe("22:00");
    expect(reading.dailyTimeReached).toBe(false);
  });

  it("reports it as reached at the minute itself, and after", () => {
    for (const minutes of [22 * 60, 22 * 60 + 1, 23 * 60 + 59]) {
      expect(readReviewSchedule({ ...base, dailyReviewTime: "22:00", nowLocalMinutes: minutes }).dailyTimeReached)
        .toBe(true);
    }
  });

  it("moves when the preference moves — which is what makes it a consumer", () => {
    // `R-24` refuses a control whose consumer does not exist. This is the
    // assertion that the consumer exists: two different stored values produce two
    // different readings at the same instant.
    const at = { ...base, nowLocalMinutes: 21 * 60 };
    expect(readReviewSchedule({ ...at, dailyReviewTime: "22:00" }).dailyTimeReached).toBe(false);
    expect(readReviewSchedule({ ...at, dailyReviewTime: "20:00" }).dailyTimeReached).toBe(true);
  });

  it("recognises the configured weekly day, and only that day", () => {
    const tuesday = readReviewSchedule({ ...base, dailyReviewTime: "22:00", nowLocalMinutes: 0, weeklyReviewDay: 2 });
    expect(tuesday.weeklyDayReached).toBe(true);
    expect(tuesday.weeklyWeekday).toBe(2);
    const friday = readReviewSchedule({ ...base, dailyReviewTime: "22:00", nowLocalMinutes: 0, weeklyReviewDay: 5 });
    expect(friday.weeklyDayReached).toBe(false);
  });

  it("says nothing rather than something wrong when a preference is unreadable", () => {
    const reading = readReviewSchedule({
      dailyReviewTime: "nope",
      weeklyReviewTime: null,
      weeklyReviewDay: 99,
      nowLocalMinutes: 23 * 60,
      today: TUESDAY,
    });
    expect(reading.dailyAt).toBeNull();
    expect(reading.weeklyAt).toBeNull();
    expect(reading.weeklyWeekday).toBeNull();
    // The important half: an unreadable time must not read as "reached", which
    // would be the surface claiming to honour a preference it never read.
    expect(reading.dailyTimeReached).toBe(false);
    expect(reading.weeklyDayReached).toBe(false);
  });
});

describe("2M-REVIEW-007: a consumer, and emphatically not a scheduler", () => {
  it("enqueues nothing, arms nothing and imports no clock", async () => {
    const source = readFileSync(join(__dirname, "review-schedule.ts"), "utf8");
    for (const token of ["setTimeout", "setInterval", "cron", "jobs", "supabase", ".rpc(", "Date.now"]) {
      expect(source, `review-schedule.ts reached for ${token}`).not.toContain(token);
    }
  });
});
