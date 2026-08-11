import { describe, expect, it } from "vitest";

import { parseRenderedInstant } from "./rendered-instant";

/**
 * The exact values `to_char(x, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')` produces, and
 * the one that made the undo control invisible for two phases.
 */
describe("parseRenderedInstant", () => {
  it("reads the whole-hour offset Postgres actually emits", () => {
    // The defect, stated as a value: `Date.parse` answers NaN for this.
    expect(Number.isNaN(Date.parse("2026-08-12T19:30:00.123456+00"))).toBe(true);
    expect(parseRenderedInstant("2026-08-12T19:30:00.123456+00")).toBe(
      Date.parse("2026-08-12T19:30:00.123456Z"),
    );
  });

  it("reads a negative whole-hour offset the same way", () => {
    expect(parseRenderedInstant("2026-08-12T16:30:00.000000-03")).toBe(
      Date.parse("2026-08-12T19:30:00.000Z"),
    );
  });

  it("leaves an offset that already carries minutes alone", () => {
    expect(parseRenderedInstant("2026-08-12T25:00:00.000000+05:30")).toBeNaN();
    expect(parseRenderedInstant("2026-08-13T01:00:00.000000+05:30")).toBe(
      Date.parse("2026-08-12T19:30:00.000Z"),
    );
  });

  it("reads a plain ISO instant, because not every caller comes from the RPC", () => {
    expect(parseRenderedInstant("2026-08-12T19:30:00.000Z")).toBe(
      Date.parse("2026-08-12T19:30:00.000Z"),
    );
  });

  it("answers NaN for what is genuinely unreadable, so callers keep failing closed", () => {
    for (const value of [null, undefined, "", "soon", "2026-13-45T99:99:99+00"]) {
      expect(parseRenderedInstant(value), `${String(value)} was read as an instant`).toBeNaN();
    }
  });
});
