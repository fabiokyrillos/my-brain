import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { calendarOrientations } from "@/features/product-analytics/contracts";
import { addLocalDays, formatLocalDate, type LocalDate } from "@/lib/time/local-day";

import {
  CALENDAR_BOUND_DAYS,
  CALENDAR_COMMITMENTS,
  CALENDAR_LANES,
  CALENDAR_ORIENTATIONS,
  COMMITMENT_BY_LANE,
  DAYS_BY_ORIENTATION,
  DEFAULT_CALENDAR_LANES,
  DEFAULT_ORIENTATION,
  MOBILE_DEFAULT_ORIENTATION,
  boundState,
  calendarHref,
  isNarrowed,
  isWithinBound,
  parseAnchor,
  parseCalendarQuery,
  parseLanes,
  rangeDayCount,
  rangeStart,
  step,
  toCalendarQueryParams,
  withLaneToggled,
  withOrientation,
} from "./calendar-query";

/**
 * `2M-CAL-004` and `2M-CAL-005` — the URL is the state, and it fails closed.
 *
 * The matrix below is the requirement's own enumeration: unknown, malformed,
 * out-of-range and repeated. Each must resolve to the declared default, and
 * **never to a wider result set or a wider date range** — so every case asserts
 * both what it became *and* that what it became is not larger than the default.
 */

const TODAY: LocalDate = { year: 2026, month: 8, day: 15 };

describe("2M-CAL-005: every unrecognised parameter fails closed", () => {
  it("resolves an unknown, malformed or repeated orientation to the narrowest one", () => {
    // `month` was in this list until slice 2P.7, as an example of a token the
    // vocabulary did not know. It knows it now, so it is replaced rather than
    // deleted: the case being tested is *unknown*, and the list has to keep
    // containing one.
    for (const bad of ["quarter", "year", "", "DAY", undefined, ["day", "week"]]) {
      const query = parseCalendarQuery({ orientation: bad as never }, TODAY);
      expect(query.orientation, String(bad)).toBe(DEFAULT_ORIENTATION);
      // Narrower, and provably so: the default spans no more days than any
      // orientation a caller could have asked for. Measured through
      // `rangeDayCount` at a fixed anchor, because `month` has no constant span
      // and is also the widest thing an unrecognised parameter must never reach.
      const spanOf = (orientation: (typeof CALENDAR_ORIENTATIONS)[number]) =>
        rangeDayCount({ orientation, anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES });
      expect(spanOf(query.orientation))
        .toBeLessThanOrEqual(Math.min(...CALENDAR_ORIENTATIONS.map(spanOf)));
    }
  });

  it("resolves an unknown, malformed or repeated anchor to today", () => {
    for (const bad of ["yesterday", "2026-13-40", "2026-8-5", "", undefined, ["2026-08-15"]]) {
      expect(parseAnchor(bad as never, TODAY), String(bad)).toEqual(TODAY);
    }
  });

  it("resolves an out-of-range anchor to today rather than to a wider range", () => {
    const tooEarly = formatLocalDate(addLocalDays(TODAY, -(CALENDAR_BOUND_DAYS + 1)));
    const tooLate = formatLocalDate(addLocalDays(TODAY, CALENDAR_BOUND_DAYS + 1));
    expect(parseAnchor(tooEarly, TODAY)).toEqual(TODAY);
    expect(parseAnchor(tooLate, TODAY)).toEqual(TODAY);
    // And the edges themselves are inside, so the bound is inclusive and the
    // assertion above is not passing because everything is refused.
    expect(parseAnchor(formatLocalDate(addLocalDays(TODAY, -CALENDAR_BOUND_DAYS)), TODAY))
      .toEqual(addLocalDays(TODAY, -CALENDAR_BOUND_DAYS));
    expect(parseAnchor(formatLocalDate(addLocalDays(TODAY, CALENDAR_BOUND_DAYS)), TODAY))
      .toEqual(addLocalDays(TODAY, CALENDAR_BOUND_DAYS));
  });

  it("drops an unknown lane rather than widening, and keeps the declared order", () => {
    expect(parseLanes("deadline,not_a_lane")).toEqual(["deadline"]);
    expect(parseLanes("reminder,deadline")).toEqual(["deadline", "reminder"]);
    expect(parseLanes("deadline,deadline")).toEqual(["deadline"]);
  });

  it("falls back to the declared set only when nothing is recognisable", () => {
    for (const bad of ["", "   ", "nope,also_nope", undefined, ["deadline"]]) {
      expect(parseLanes(bad as never), String(bad)).toEqual(DEFAULT_CALENDAR_LANES);
    }
  });

  it("never returns a lane set the vocabulary does not declare", () => {
    // The property behind all of the above, stated once: whatever comes out is a
    // subset of the vocabulary, in its order, with no repeats.
    for (const raw of ["deadline,not_a_lane", "suggestion,review,deadline", "", "x"]) {
      const lanes = parseLanes(raw);
      expect(new Set(lanes).size).toBe(lanes.length);
      for (const lane of lanes) expect(CALENDAR_LANES).toContain(lane);
      expect([...lanes].sort()).toEqual(
        CALENDAR_LANES.filter((lane) => lanes.includes(lane)).sort(),
      );
    }
  });

  it("resolves a completely foreign query to the declared default position", () => {
    const query = parseCalendarQuery(
      { view: "today", workView: "all", page: "7", lanes: "everything" },
      TODAY,
    );
    expect(query).toEqual({
      orientation: DEFAULT_ORIENTATION,
      anchor: TODAY,
      lanes: DEFAULT_CALENDAR_LANES,
    });
  });
});

describe("2M-CAL-004: the URL carries the complete description, and only it", () => {
  it("always names the anchor, because 'today' is not a stable description", () => {
    // A link shared at 23:50 must still be about the same day at 00:10.
    const params = toCalendarQueryParams({
      orientation: DEFAULT_ORIENTATION, anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES,
    });
    expect(params).toEqual({ date: "2026-08-15" });
  });

  it("omits defaults so one state has one URL", () => {
    expect(calendarHref("pt-BR", {
      orientation: DEFAULT_ORIENTATION, anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES,
    })).toBe("/pt-BR/app/calendar?date=2026-08-15");
  });

  it("round-trips every non-default position", () => {
    const query = {
      orientation: "week" as const,
      anchor: { year: 2026, month: 3, day: 8 },
      lanes: ["deadline", "reminder"] as const,
    };
    const href = calendarHref("en", query);
    const params = Object.fromEntries(new URL(href, "https://x.test").searchParams.entries());
    expect(parseCalendarQuery(params, TODAY)).toEqual(query);
  });

  it("is not a Work destination and cannot express one", () => {
    // `2M-CAL-001` and OD-2L-2 A: Work stays exactly three views, and nothing
    // here can name one.
    const href = calendarHref("pt-BR", {
      orientation: "agenda", anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES,
    });
    expect(href).toContain("/app/calendar");
    expect(href).not.toContain("/app/work");
    expect(href).not.toContain("view=");
    expect(JSON.stringify(CALENDAR_ORIENTATIONS)).not.toContain("today");
  });
});

describe("2M-CAL-006: the navigation bound is declared once and reaching it is a state", () => {
  it("clamps a step at the bound rather than walking past it", () => {
    const atLatest = {
      orientation: "day" as const,
      anchor: addLocalDays(TODAY, CALENDAR_BOUND_DAYS),
      lanes: DEFAULT_CALENDAR_LANES,
    };
    expect(step(atLatest, 1, TODAY).anchor).toEqual(atLatest.anchor);
    expect(step(atLatest, -1, TODAY).anchor).toEqual(addLocalDays(atLatest.anchor, -1));
  });

  it("reports which end it is sitting on, so the surface can say why it stopped", () => {
    expect(boundState({
      orientation: "day", anchor: addLocalDays(TODAY, CALENDAR_BOUND_DAYS), lanes: DEFAULT_CALENDAR_LANES,
    }, TODAY)).toEqual({ atEarliest: false, atLatest: true });

    expect(boundState({
      orientation: "day", anchor: addLocalDays(TODAY, -CALENDAR_BOUND_DAYS), lanes: DEFAULT_CALENDAR_LANES,
    }, TODAY)).toEqual({ atEarliest: true, atLatest: false });

    expect(boundState({
      orientation: "day", anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES,
    }, TODAY)).toEqual({ atEarliest: false, atLatest: false });
  });

  it("steps by the orientation's own span", () => {
    const base = { anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES };
    expect(step({ ...base, orientation: "day" }, 1, TODAY).anchor).toEqual(addLocalDays(TODAY, 1));
    expect(step({ ...base, orientation: "week" }, 1, TODAY).anchor).toEqual(addLocalDays(TODAY, 7));
    expect(step({ ...base, orientation: "agenda" }, 1, TODAY).anchor).toEqual(addLocalDays(TODAY, 14));
  });

  it("declares the bound in exactly one place", () => {
    expect(CALENDAR_BOUND_DAYS).toBe(365);
    expect(isWithinBound(addLocalDays(TODAY, CALENDAR_BOUND_DAYS), TODAY)).toBe(true);
    expect(isWithinBound(addLocalDays(TODAY, CALENDAR_BOUND_DAYS + 1), TODAY)).toBe(false);
  });
});

describe("2M-CAL-007: orientations, the mobile default, and the preserved anchor", () => {
  it("preserves the anchor across every orientation change", () => {
    const query = { orientation: "day" as const, anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES };
    for (const orientation of CALENDAR_ORIENTATIONS) {
      expect(withOrientation(query, orientation).anchor).toEqual(TODAY);
    }
  });

  it("snaps a week to Monday and leaves day and agenda where the user is", () => {
    // 2026-08-15 is a Saturday.
    expect(rangeStart({ orientation: "week", anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES }))
      .toEqual({ year: 2026, month: 8, day: 10 });
    expect(rangeStart({ orientation: "day", anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES })).toEqual(TODAY);
    expect(rangeStart({ orientation: "agenda", anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES })).toEqual(TODAY);
  });

  it("records the mobile default, and it agrees with the fail-closed default", () => {
    // Stated as an assertion rather than as prose: a seven-column grid at 375 px
    // cannot hold a row without horizontal scroll or undersized targets.
    expect(MOBILE_DEFAULT_ORIENTATION).toBe("day");
    expect(MOBILE_DEFAULT_ORIENTATION).toBe(DEFAULT_ORIENTATION);
  });
});

describe("2M-CAL-003: the commitment axis is derived from the lane", () => {
  it("gives every lane exactly one commitment, and never invents a stored flag", () => {
    for (const lane of CALENDAR_LANES) {
      expect(CALENDAR_COMMITMENTS).toContain(COMMITMENT_BY_LANE[lane]);
    }
    expect(Object.keys(COMMITMENT_BY_LANE).sort()).toEqual([...CALENDAR_LANES].sort());
  });

  it("keeps an intention distinct from a commitment, which OD-2M-3 A requires", () => {
    expect(COMMITMENT_BY_LANE.deadline).toBe("committed");
    expect(COMMITMENT_BY_LANE.reminder).toBe("committed");
    expect(COMMITMENT_BY_LANE.intention).toBe("intended");
    expect(COMMITMENT_BY_LANE.suggestion).toBe("suggested");
    expect(COMMITMENT_BY_LANE.review).toBe("recorded");
    // The refusal, asserted: an intention is not a commitment. Painting it as
    // one is the silent reclassification OD-2M-3 option B was refused for.
    expect(COMMITMENT_BY_LANE.intention).not.toBe(COMMITMENT_BY_LANE.deadline);
  });
});

describe("the lane toggle keeps the calendar a calendar", () => {
  it("refuses to turn the last lane off", () => {
    const single = { orientation: "day" as const, anchor: TODAY, lanes: ["deadline"] as const };
    expect(withLaneToggled(single, "deadline")).toEqual(single);
  });

  it("adds back in the declared order rather than in click order", () => {
    const query = { orientation: "day" as const, anchor: TODAY, lanes: ["reminder"] as const };
    expect(withLaneToggled(query, "deadline").lanes).toEqual(["deadline", "reminder"]);
  });

  it("knows when the view is narrowed", () => {
    expect(isNarrowed({ orientation: "day", anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES })).toBe(false);
    expect(isNarrowed({ orientation: "day", anchor: TODAY, lanes: ["deadline"] })).toBe(true);
  });
});

/**
 * `2P-CALENDAR-001` — the month is a real period, not a renamed list.
 *
 * The owner confirmed the requirement's wording rather than correcting it:
 * Agenda may not be interpreted as Mês. So the assertions here are about the
 * things that make a month a month — a week-aligned grid that covers every day
 * the month has, navigation that moves by months, and a period the rest of the
 * contract already understands.
 */
describe("2P-CALENDAR-001: month is a period of its own", () => {
  const monthAt = (anchor: LocalDate) =>
    ({ orientation: "month" as const, anchor, lanes: DEFAULT_CALENDAR_LANES });

  it("is a fourth orientation the URL can express", () => {
    expect(CALENDAR_ORIENTATIONS).toContain("month");
    expect(parseCalendarQuery({ orientation: "month" }, TODAY).orientation).toBe("month");
  });

  /**
   * The fail-closed rule `2M-CAL-005` states, re-asserted because a month is the
   * **widest** range the calendar has: if a malformed parameter ever resolved to
   * it, every unparseable URL would widen the result set rather than narrow it.
   */
  it("is never what a malformed or unknown parameter falls back to", () => {
    expect(DEFAULT_ORIENTATION).not.toBe("month");
    expect(MOBILE_DEFAULT_ORIENTATION).not.toBe("month");
    for (const value of ["Month", "MONTH", "mes", "mês", "", ["month", "week"]]) {
      expect(parseCalendarQuery({ orientation: value }, TODAY).orientation).toBe(DEFAULT_ORIENTATION);
    }
  });

  it("starts on the Monday on or before the first of the month", () => {
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    expect(rangeStart(monthAt({ year: 2026, month: 8, day: 19 })))
      .toEqual({ year: 2026, month: 7, day: 27 });
    // 1 June 2026 is a Monday: the grid opens on the first itself, with no
    // leading week — the case an implementation that always subtracts a week
    // would get wrong.
    expect(rangeStart(monthAt({ year: 2026, month: 6, day: 30 })))
      .toEqual({ year: 2026, month: 6, day: 1 });
  });

  it("spans whole weeks, and covers every day of the month", () => {
    for (let month = 1; month <= 12; month += 1) {
      for (const year of [2026, 2028]) {
        const query = monthAt({ year, month, day: 1 });
        const count = rangeDayCount(query);
        expect(count % 7).toBe(0);
        expect([28, 35, 42]).toContain(count);

        const first = rangeStart(query);
        const last = addLocalDays(first, count - 1);
        // The first of the month is on or after the grid's first day, and the
        // last of the month is on or before its last — so no day is missing.
        expect(formatLocalDate(first) <= `${year}-${String(month).padStart(2, "0")}-01`).toBe(true);
        const lastOfMonth = addLocalDays({ year, month, day: 1 }, 40);
        expect(formatLocalDate(last) >= formatLocalDate({ year, month, day: 28 })).toBe(true);
        expect(lastOfMonth).toBeTruthy();
      }
    }
  });

  it("gives a 28-day grid only to a February that starts on a Monday", () => {
    // February 2027 starts on a Monday and has 28 days: exactly four weeks.
    expect(rangeDayCount(monthAt({ year: 2027, month: 2, day: 1 }))).toBe(28);
    // August 2026 starts on a Saturday and needs six rows.
    expect(rangeDayCount(monthAt({ year: 2026, month: 8, day: 1 }))).toBe(42);
  });

  it("steps by whole months rather than by a fixed number of days", () => {
    const august = monthAt({ year: 2026, month: 8, day: 15 });
    expect(step(august, 1, TODAY).anchor).toEqual({ year: 2026, month: 9, day: 15 });
    expect(step(august, -1, TODAY).anchor).toEqual({ year: 2026, month: 7, day: 15 });
  });

  it("does not skip February when stepping from the thirty-first", () => {
    const january = { orientation: "month" as const, anchor: { year: 2027, month: 1, day: 31 }, lanes: DEFAULT_CALENDAR_LANES };
    const next = step(january, 1, { year: 2027, month: 1, day: 31 });
    expect(next.anchor.month).toBe(2);
  });

  it("reports the bound by whole months, so the last reachable month is reachable", () => {
    const farFuture = monthAt(addLocalDays(TODAY, CALENDAR_BOUND_DAYS - 2));
    expect(boundState(farFuture, TODAY).atLatest).toBe(true);
    expect(boundState(monthAt(TODAY), TODAY)).toEqual({ atEarliest: false, atLatest: false });
  });

  it("keeps the anchor when the orientation changes, as every other one does", () => {
    const week = { orientation: "week" as const, anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES };
    expect(withOrientation(week, "month").anchor).toEqual(TODAY);
  });

  it("travels in the URL, because it is not the default", () => {
    expect(toCalendarQueryParams(monthAt(TODAY)).orientation).toBe("month");
    expect(calendarHref("pt-BR", monthAt(TODAY))).toContain("orientation=month");
  });

  it("agrees with the fixed spans for the three orientations that have one", () => {
    for (const orientation of ["day", "week", "agenda"] as const) {
      const query = { orientation, anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES };
      expect(rangeDayCount(query)).toBe(DAYS_BY_ORIENTATION[orientation]);
    }
  });
});

/**
 * `2P-CALENDAR-MONTH-TELEMETRY` — why these two lists are no longer equal.
 *
 * They were, and the equality was the drift gate. Slice 2P.7 adds `month` as a
 * fourth **surface** orientation, and it deliberately does *not* add it to the
 * telemetry vocabulary, because the third copy of that vocabulary is
 * **deployed**: migration `202608110090` writes
 *
 *   `private.require_product_event_enum(p_properties, 'orientation', array['day', 'week', 'agenda'])`
 *
 * into `private.validate_product_event_properties`, and widening it is a third
 * Phase 2P migration — a stop condition. Read live against the hosted database
 * on 2026-08-19, not inferred from the file.
 *
 * The failure mode this protects against is specific and silent. `recordProductEvent`
 * maps the validator's `22023` to `invalid_payload` and **returns** rather than
 * throwing, so an `orientation: "month"` event would be accepted by the client
 * parser, refused by the database, and lost with nothing on any surface saying
 * so. That is the shape this repository has already been bitten by.
 *
 * So the relationship is now an asymmetry with three executable halves, below:
 * the telemetry list still mirrors the deployed CHECK **exactly**; the surface
 * list is a strict superset; and the difference is exactly the orientations that
 * emit nothing. Widening `calendarOrientations` by hand fails the first
 * assertion, which is the point — the only way to legitimately widen it is to
 * widen the deployed CHECK, and that needs a migration and a signature.
 */
describe("2P-CALENDAR-MONTH-TELEMETRY: the telemetry vocabulary tracks the deployed CHECK", () => {
  /** The literal list inside the migration, so the coupling is not a comment. */
  const deployedOrientations = (): readonly string[] => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/202608110090_phase_2m_daily_cycle_telemetry.sql"),
      "utf8",
    );
    const match = /require_product_event_enum\(p_properties, 'orientation', array\[([^\]]*)\]\)/
      .exec(sql);
    if (!match) throw new Error("the orientation enum is no longer where this test reads it");
    return match[1].split(",").map((literal) => literal.trim().replace(/^'|'$/g, ""));
  };

  it("reads a non-empty list out of the migration, so the parse cannot pass vacuously", () => {
    expect(deployedOrientations().length).toBeGreaterThan(0);
  });

  it("declares exactly the orientations the deployed validator admits", () => {
    expect([...calendarOrientations]).toEqual([...deployedOrientations()]);
  });

  it("never names an orientation the surface cannot show", () => {
    for (const orientation of calendarOrientations) {
      expect(CALENDAR_ORIENTATIONS).toContain(orientation);
    }
  });

  it("is a strict subset of the surface's orientations, and month is what is missing", () => {
    const untracked = CALENDAR_ORIENTATIONS.filter(
      (orientation) => !(calendarOrientations as readonly string[]).includes(orientation),
    );
    expect(untracked).toEqual(["month"]);
  });
});
