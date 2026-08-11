import { describe, expect, it } from "vitest";

import { computePlannerCapacity } from "./planner-capacity";

/**
 * `2M-PLAN-006` — overload visible, **without inventing an estimate the user
 * never gave**.
 *
 * The second clause is what these cases are mostly about. The failure this
 * module exists to make impossible is a plausible number: "6h of 8h planned",
 * computed from a per-task duration nobody ever entered, which a user would
 * reasonably plan against.
 */

const DEFAULTS = { defaultQuietStart: "22:30:00", defaultQuietEnd: "07:00:00" };

describe("when the user has declared nothing", () => {
  it("reports no availability and never calls the day overloaded", () => {
    const capacity = computePlannerCapacity({
      plannedCount: 40,
      quietStart: "22:30:00",
      quietEnd: "07:00:00",
      ...DEFAULTS,
    });
    // Forty items and still not "overloaded": there is nothing to compare
    // against, and comparing against a default nobody chose would be the
    // invented estimate the requirement forbids.
    expect(capacity).toEqual({
      plannedCount: 40,
      availableHours: null,
      availabilityDeclared: false,
      overloaded: false,
    });
  });

  it("says the same for a missing or malformed preference", () => {
    for (const value of [null, undefined, "", "not a time", "99:99"]) {
      const capacity = computePlannerCapacity({
        plannedCount: 3,
        quietStart: value,
        quietEnd: value,
        ...DEFAULTS,
      });
      expect(capacity.availableHours, String(value)).toBeNull();
      expect(capacity.availabilityDeclared, String(value)).toBe(false);
      expect(capacity.overloaded, String(value)).toBe(false);
    }
  });

  it("null is not zero, and the two must stay distinguishable", () => {
    const undeclared = computePlannerCapacity({
      plannedCount: 1, quietStart: null, quietEnd: null, ...DEFAULTS,
    });
    const noWakingHour = computePlannerCapacity({
      plannedCount: 1, quietStart: "00:00:00", quietEnd: "23:59:00", ...DEFAULTS,
    });
    expect(undeclared.availableHours).toBeNull();
    expect(noWakingHour.availableHours).toBe(0);
    // A surface rendering "0 hours available" for a user who declared nothing
    // would be asserting something false about them.
    expect(undeclared.availableHours).not.toBe(noWakingHour.availableHours);
  });
});

describe("when the user has declared quiet hours", () => {
  it("reads a wrapping window as the span it is", () => {
    // 23:00 → 06:00 is seven quiet hours, so seventeen available. The wrap is
    // the common case and a subtraction that assumed end > start would report
    // negative seventeen.
    const capacity = computePlannerCapacity({
      plannedCount: 4, quietStart: "23:00:00", quietEnd: "06:00:00", ...DEFAULTS,
    });
    expect(capacity.availableHours).toBe(17);
    expect(capacity.availabilityDeclared).toBe(true);
    expect(capacity.overloaded).toBe(false);
  });

  it("reads a same-day window too", () => {
    const capacity = computePlannerCapacity({
      plannedCount: 1, quietStart: "13:00:00", quietEnd: "15:00:00", ...DEFAULTS,
    });
    expect(capacity.availableHours).toBe(22);
  });

  it("calls a day overloaded only above one item per declared hour", () => {
    const base = { quietStart: "23:00:00", quietEnd: "06:00:00", ...DEFAULTS };
    expect(computePlannerCapacity({ plannedCount: 17, ...base }).overloaded).toBe(false);
    expect(computePlannerCapacity({ plannedCount: 18, ...base }).overloaded).toBe(true);
  });

  it("never reports a negative availability", () => {
    const capacity = computePlannerCapacity({
      plannedCount: 0, quietStart: "00:00:00", quietEnd: "00:00:00", ...DEFAULTS,
    });
    // Start equal to end is a zero-length quiet span, so the whole day is
    // available — the reading that is true rather than the one that is tidy.
    expect(capacity.availableHours).toBe(24);
    expect(capacity.availableHours).toBeGreaterThanOrEqual(0);
  });
});

describe("the count is a count", () => {
  it("passes the planned count through untouched, with no coefficient anywhere", () => {
    for (const plannedCount of [0, 1, 7, 50]) {
      expect(computePlannerCapacity({
        plannedCount, quietStart: "23:00:00", quietEnd: "06:00:00", ...DEFAULTS,
      }).plannedCount).toBe(plannedCount);
    }
  });
});
