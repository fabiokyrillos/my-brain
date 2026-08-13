import { describe, expect, it } from "vitest";

import { reviewWindow, type ReviewPeriod } from "./review-period";

/**
 * `LDC-AGENT-002`, proved rather than described.
 *
 * ## What this file is a control for
 *
 * ADR-111 Decision 6 signed **one** intended behaviour change: `generateReview`
 * computes its daily, weekly and monthly periods in the **owner's** calendar
 * instead of the host's. Everything else in the initiative is a rendering fix
 * that a user could see and report; this one changes *what a review contains*,
 * so it is the one that most needs a test able to fail.
 *
 * Unit 4b made the change. Nothing could prove it: the computation lived inside
 * a `"use server"` module, so it could not be called with a fixed `now`. Unit 5
 * extracted it to `review-period.ts` unchanged, and this is the proof.
 *
 * ## The rule every fixture here obeys
 *
 * **No zone in this file may be the host's, and none may be UTC.** The host
 * running this suite resolves to `America/Cayenne` (UTC−3, no DST) — measured,
 * not assumed — and a fixture in the host's zone is a fixture that passes
 * identically whether the code reads the owner's calendar or the host's. That is
 * the failure Phase 2M's daily-cycle row tests shipped with: both pinned noon
 * UTC, the same calendar day in every zone this product supports, so they would
 * have passed however wrong the rendering was.
 *
 * So each case below carries an explicit **`hostWould`** — the answer the
 * replaced arithmetic produced — and asserts the real answer differs from it.
 * A regression to host-zone arithmetic fails on the `hostWould` line, by name.
 *
 * Every instant, offset and transition below was established by execution
 * against this runtime's own `Intl` data before it was written down.
 */

/** `YYYY-MM-DD` in a named zone. Never the runner's. */
function civilDateIn(timeZone: string, iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** The UTC calendar date — what the replaced arithmetic produced on a server. */
function utcDateOf(iso: string): string {
  return civilDateIn("UTC", iso);
}

describe("LDC-AGENT-002: the review period is the owner's, not the host's", () => {
  describe("one instant, two owners, two different periods", () => {
    /*
     * The initiative's whole claim in a single fixture. At this instant
     * `Pacific/Auckland` has already turned over to the 13th while UTC and
     * `America/Los_Angeles` are still on the 12th — so a daily review asked for
     * at this moment covers a different day for each of the two owners, and the
     * old code gave them both the same one.
     */
    const instant = "2026-08-12T23:00:00.000Z";

    it("puts the same instant in two different local days, which is the premise", () => {
      expect(civilDateIn("Pacific/Auckland", instant)).toBe("2026-08-13");
      expect(civilDateIn("America/Los_Angeles", instant)).toBe("2026-08-12");
      expect(utcDateOf(instant)).toBe("2026-08-12");
    });

    it("covers 2026-08-13 for the Auckland owner, which is not the host's day", () => {
      const window = reviewWindow(new Date(instant), "Pacific/Auckland", "daily");
      expect(window.startDate).toBe("2026-08-13");
      expect(window.endDate).toBe("2026-08-13");
      // The host-zone answer, named so a regression fails on this line.
      expect(window.startDate, "regressed to the host's calendar").not.toBe(utcDateOf(instant));
      // The window opens at Auckland's local midnight: 2026-08-12T12:00Z.
      expect(window.start.toISOString()).toBe("2026-08-12T12:00:00.000Z");
    });

    it("covers 2026-08-12 for the Los Angeles owner at the very same instant", () => {
      const window = reviewWindow(new Date(instant), "America/Los_Angeles", "daily");
      expect(window.startDate).toBe("2026-08-12");
      expect(window.endDate).toBe("2026-08-12");
      expect(window.start.toISOString()).toBe("2026-08-12T07:00:00.000Z");
    });

    it("gives the two owners genuinely different windows", () => {
      const auckland = reviewWindow(new Date(instant), "Pacific/Auckland", "daily");
      const losAngeles = reviewWindow(new Date(instant), "America/Los_Angeles", "daily");
      expect(auckland.startDate).not.toBe(losAngeles.startDate);
      expect(auckland.start.getTime()).not.toBe(losAngeles.start.getTime());
    });

    it("puts the western owner behind UTC when the instant is early in the UTC day", () => {
      // The mirror case: 03:00Z is still the 11th in Los Angeles.
      const early = "2026-08-12T03:00:00.000Z";
      expect(utcDateOf(early)).toBe("2026-08-12");
      const window = reviewWindow(new Date(early), "America/Los_Angeles", "daily");
      expect(window.startDate).toBe("2026-08-11");
      expect(window.startDate, "regressed to the host's calendar").not.toBe(utcDateOf(early));
    });
  });

  describe("the week starts on the owner's Monday", () => {
    it("takes the Monday of the owner's local week, not of the host's", () => {
      /*
       * 2026-08-16T23:00Z is Sunday in UTC and already Monday the 17th in
       * Auckland. The old arithmetic took the host's Sunday and walked back to
       * Monday the 10th — a week early — while the owner's week had just begun.
       */
      const instant = "2026-08-16T23:00:00.000Z";
      expect(civilDateIn("UTC", instant)).toBe("2026-08-16");
      expect(civilDateIn("Pacific/Auckland", instant)).toBe("2026-08-17");

      const window = reviewWindow(new Date(instant), "Pacific/Auckland", "weekly_review");
      expect(window.startDate).toBe("2026-08-17");
      expect(window.endDate).toBe("2026-08-17");
      expect(window.startDate, "took the host's week").not.toBe("2026-08-10");
    });

    it("treats weekly_plan exactly as weekly_review, since both start the week", () => {
      const instant = "2026-08-19T09:00:00.000Z";
      const review = reviewWindow(new Date(instant), "Pacific/Auckland", "weekly_review");
      const plan = reviewWindow(new Date(instant), "Pacific/Auckland", "weekly_plan");
      expect(plan).toEqual(review);
    });

    it("starts a Monday on that Monday, not seven days earlier", () => {
      // 2026-08-17 is a Monday. A Monday's week starts on itself.
      const window = reviewWindow(new Date("2026-08-17T20:00:00.000Z"), "America/New_York", "weekly_review");
      expect(civilDateIn("America/New_York", "2026-08-17T20:00:00.000Z")).toBe("2026-08-17");
      expect(window.startDate).toBe("2026-08-17");
    });

    it("walks a Sunday back six days, the far end of the Monday-based rule", () => {
      // 2026-08-23 is a Sunday; its Monday is the 17th.
      const window = reviewWindow(new Date("2026-08-23T20:00:00.000Z"), "America/New_York", "weekly_review");
      expect(civilDateIn("America/New_York", "2026-08-23T20:00:00.000Z")).toBe("2026-08-23");
      expect(window.startDate).toBe("2026-08-17");
    });
  });

  describe("the month is the owner's month", () => {
    it("takes day 1 of the owner's month when UTC is still in the previous one", () => {
      /*
       * 2026-08-31T23:00Z is 2026-09-01 12:00 in Auckland. The owner is asking
       * for September; the host's calendar says August, and used to answer for
       * August.
       */
      const instant = "2026-08-31T23:00:00.000Z";
      expect(utcDateOf(instant)).toBe("2026-08-31");
      expect(civilDateIn("Pacific/Auckland", instant)).toBe("2026-09-01");

      const window = reviewWindow(new Date(instant), "Pacific/Auckland", "monthly");
      expect(window.startDate).toBe("2026-09-01");
      expect(window.endDate).toBe("2026-09-01");
      expect(window.startDate, "took the host's month").not.toBe("2026-08-01");
    });

    it("takes the previous month when the owner is behind UTC across the boundary", () => {
      // 2026-09-01T03:00Z is still 2026-08-31 in Los Angeles.
      const instant = "2026-09-01T03:00:00.000Z";
      expect(utcDateOf(instant)).toBe("2026-09-01");
      expect(civilDateIn("America/Los_Angeles", instant)).toBe("2026-08-31");

      const window = reviewWindow(new Date(instant), "America/Los_Angeles", "monthly");
      expect(window.startDate).toBe("2026-08-01");
      expect(window.endDate).toBe("2026-08-31");
      expect(window.startDate, "took the host's month").not.toBe("2026-09-01");
    });
  });

  /**
   * DST, one case per hemisphere, at transitions established by execution.
   *
   * A fixed-offset zone cannot fail these: what is being checked is that the
   * window opens at the *actual* local midnight on each side of a transition,
   * which is a different UTC instant before and after.
   */
  describe("DST — northern hemisphere (America/New_York)", () => {
    it("opens the day at EST midnight before the spring transition", () => {
      // 2026-03-08 is the 23-hour day: 02:00 does not exist, EST -5 becomes EDT -4.
      const window = reviewWindow(new Date("2026-03-07T20:00:00.000Z"), "America/New_York", "daily");
      expect(window.startDate).toBe("2026-03-07");
      expect(window.start.toISOString()).toBe("2026-03-07T05:00:00.000Z"); // UTC-5
    });

    it("opens the 23-hour day itself at the last EST midnight", () => {
      const window = reviewWindow(new Date("2026-03-08T20:00:00.000Z"), "America/New_York", "daily");
      expect(window.startDate).toBe("2026-03-08");
      // Midnight on the 8th still exists and is still EST; the gap is at 02:00.
      expect(window.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    });

    it("opens the day at EDT midnight after the spring transition", () => {
      const window = reviewWindow(new Date("2026-03-09T20:00:00.000Z"), "America/New_York", "daily");
      expect(window.startDate).toBe("2026-03-09");
      expect(window.start.toISOString()).toBe("2026-03-09T04:00:00.000Z"); // UTC-4
    });

    it("opens the 25-hour autumn day at EDT midnight", () => {
      // 2026-11-01: EDT -4 becomes EST -5 at 01:00 local; midnight is still EDT.
      const window = reviewWindow(new Date("2026-11-01T20:00:00.000Z"), "America/New_York", "daily");
      expect(window.startDate).toBe("2026-11-01");
      expect(window.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    });

    it("keeps a week containing a transition anchored to its own Monday", () => {
      // The week of 2026-03-08 begins Monday 2026-03-02, in EST.
      const window = reviewWindow(new Date("2026-03-08T20:00:00.000Z"), "America/New_York", "weekly_review");
      expect(window.startDate).toBe("2026-03-02");
      expect(window.start.toISOString()).toBe("2026-03-02T05:00:00.000Z");
    });
  });

  describe("DST — southern hemisphere (Pacific/Auckland)", () => {
    it("opens the day at NZST midnight before the spring transition", () => {
      // 2026-09-27 is the 23-hour day: +12 becomes +13 at 02:00 local.
      const window = reviewWindow(new Date("2026-09-26T06:00:00.000Z"), "Pacific/Auckland", "daily");
      expect(window.startDate).toBe("2026-09-26");
      expect(window.start.toISOString()).toBe("2026-09-25T12:00:00.000Z"); // UTC+12
    });

    it("opens the 23-hour day itself at the last NZST midnight", () => {
      const window = reviewWindow(new Date("2026-09-27T06:00:00.000Z"), "Pacific/Auckland", "daily");
      expect(window.startDate).toBe("2026-09-27");
      expect(window.start.toISOString()).toBe("2026-09-26T12:00:00.000Z");
    });

    it("opens the day at NZDT midnight after the spring transition", () => {
      const window = reviewWindow(new Date("2026-09-28T06:00:00.000Z"), "Pacific/Auckland", "daily");
      expect(window.startDate).toBe("2026-09-28");
      expect(window.start.toISOString()).toBe("2026-09-27T11:00:00.000Z"); // UTC+13
    });

    it("opens the 25-hour autumn day at NZDT midnight", () => {
      // 2026-04-05: +13 becomes +12 at 03:00 local; midnight is still NZDT.
      const window = reviewWindow(new Date("2026-04-05T06:00:00.000Z"), "Pacific/Auckland", "daily");
      expect(window.startDate).toBe("2026-04-05");
      expect(window.start.toISOString()).toBe("2026-04-04T11:00:00.000Z");
    });

    it("anchors a month containing a transition to its own first day", () => {
      const window = reviewWindow(new Date("2026-09-28T06:00:00.000Z"), "Pacific/Auckland", "monthly");
      expect(window.startDate).toBe("2026-09-01");
      expect(window.start.toISOString()).toBe("2026-08-31T12:00:00.000Z"); // NZST on 1 Sep
    });
  });

  describe("a local midnight that does not exist", () => {
    /*
     * `America/Santiago` steps from 2026-09-05 23:59 to 2026-09-06 01:00, so
     * **2026-09-06 has no 00:00 at all** — established by walking the transition
     * minute by minute. The contract's rule is that such a day starts at the
     * first instant that exists, and a review must not silently open in the
     * previous day.
     */
    it("starts the day at 01:00 local, the first instant that exists", () => {
      const window = reviewWindow(new Date("2026-09-06T18:00:00.000Z"), "America/Santiago", "daily");
      expect(window.startDate).toBe("2026-09-06");
      expect(window.start.toISOString()).toBe("2026-09-06T04:00:00.000Z");
      expect(civilDateIn("America/Santiago", window.start.toISOString())).toBe("2026-09-06");
    });

    it("does not let the window open in the previous local day", () => {
      const window = reviewWindow(new Date("2026-09-06T18:00:00.000Z"), "America/Santiago", "daily");
      expect(
        civilDateIn("America/Santiago", window.start.toISOString()),
        "the window opened before the day it claims to cover",
      ).not.toBe("2026-09-05");
    });
  });

  describe("the shape of the answer", () => {
    // An explicit budget, because this one case is a property sweep: ~2000
    // windows, each built from several `Intl` formatters. It runs in about two
    // seconds alone and exceeded vitest's 5s default under a full-suite load of
    // 377 files — a fact about scheduling, not about the property.
    it("never opens after the instant it covers, hour by hour across every transition", () => {
      /*
       * Swept where the answers actually change, rather than uniformly across a
       * year: every DST transition these zones have in 2026, each measured from
       * this runtime's own `Intl` data, plus the month boundaries either side.
       * A uniform sweep spends almost all of its time in the middle of ordinary
       * months and crosses each interesting instant exactly once.
       */
      const periods: ReviewPeriod[] = ["daily", "weekly_review", "weekly_plan", "monthly"];
      const transitions = [
        { zone: "Pacific/Auckland", at: "2026-04-04T14:00:00.000Z" },
        { zone: "Pacific/Auckland", at: "2026-09-26T14:00:00.000Z" },
        { zone: "America/New_York", at: "2026-03-08T07:00:00.000Z" },
        { zone: "America/New_York", at: "2026-11-01T06:00:00.000Z" },
        { zone: "America/Los_Angeles", at: "2026-03-08T10:00:00.000Z" },
        { zone: "America/Santiago", at: "2026-09-06T04:00:00.000Z" },
        // A zone with no DST at all, and a half-hour offset: the control that
        // says these properties are not artefacts of a transition.
        { zone: "Asia/Kolkata", at: "2026-09-01T00:00:00.000Z" },
      ];

      for (const { zone, at } of transitions) {
        const centre = Date.parse(at);
        for (const period of periods) {
          for (let hour = -36; hour <= 36; hour += 1) {
            const now = new Date(centre + hour * 3_600_000);
            const window = reviewWindow(now, zone, period);
            const where = `${zone}/${period} at ${now.toISOString()}`;
            // The window may never open after the instant it is summarising.
            expect(window.start.getTime(), where).toBeLessThanOrEqual(now.getTime());
            // Nor may it be labelled backwards.
            expect(window.startDate <= window.endDate, where).toBe(true);
            // The instant the window opens must belong to the day it is labelled
            // with — the property a missing local midnight would break.
            expect(civilDateIn(zone, window.start.toISOString()), where).toBe(window.startDate);
          }
        }
      }
    }, 60_000);

    it("labels the end with the owner's today, at a half-hour offset too", () => {
      // Asia/Kolkata is UTC+5:30 — a zone whose day boundary lands mid-hour.
      const instant = "2026-08-12T18:45:00.000Z";
      expect(civilDateIn("Asia/Kolkata", instant)).toBe("2026-08-13");
      const window = reviewWindow(new Date(instant), "Asia/Kolkata", "daily");
      expect(window.endDate).toBe("2026-08-13");
      expect(window.start.toISOString()).toBe("2026-08-12T18:30:00.000Z");
    });

    it("refuses a zone it cannot compute in, rather than inventing a day", () => {
      expect(() => reviewWindow(new Date("2026-08-12T12:00:00.000Z"), "Mars/Olympus", "daily")).toThrow(
        /unsupported time zone/,
      );
    });
  });
});
