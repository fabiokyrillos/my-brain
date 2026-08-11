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
    for (const bad of ["month", "year", "", "DAY", undefined, ["day", "week"]]) {
      const query = parseCalendarQuery({ orientation: bad as never }, TODAY);
      expect(query.orientation, String(bad)).toBe(DEFAULT_ORIENTATION);
      // Narrower, and provably so: the default spans no more days than any
      // orientation a caller could have asked for.
      expect(DAYS_BY_ORIENTATION[query.orientation])
        .toBeLessThanOrEqual(Math.min(...CALENDAR_ORIENTATIONS.map((o) => DAYS_BY_ORIENTATION[o])));
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

describe("the telemetry vocabulary restates this one exactly", () => {
  it("declares the same three orientations, in the same order", () => {
    /*
     * The drift gate. `product-analytics/contracts.ts` cannot import a feature
     * module — it ships to the client and must stay independent — so it restates
     * the orientation vocabulary. A restated list is a second place to drift, and
     * this is what makes it a mirror instead: exact equality, both directions.
     *
     * Migration `202608110090` carries the same three literals into
     * `private.validate_product_event_properties`, so a fourth orientation would
     * have to pass this, the parser, and a deployed CHECK.
     */
    expect([...calendarOrientations]).toEqual([...CALENDAR_ORIENTATIONS]);
  });
});
