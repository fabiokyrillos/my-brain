import { describe, expect, it } from "vitest";

import { serializeWorkPosition } from "@/features/operations/work-position";
import { DEFAULT_WORK_QUERY } from "@/features/daily-cycle/work-query";

import {
  CALENDAR_POSITION_VERSION,
  POSITION_FORBIDDEN_FIELDS,
  defaultCalendarQuery,
  parseCalendarPosition,
  serializeCalendarPosition,
} from "./calendar-position";
import { CALENDAR_LANES, type CalendarQuery } from "./calendar-query";

/**
 * `2M-CAL-008` — the calendar's half of Phase 2L's return-continuity contract.
 *
 * Every assertion here is about a property the *mechanism* has, not about the
 * bytes it produces: an encoding test would pass while the payload carried a
 * confirmation, which is the one thing `2L-RETURN-003` exists to stop.
 */

const TODAY = { year: 2026, month: 8, day: 15 };

const query = (overrides: Partial<CalendarQuery> = {}): CalendarQuery => ({
  orientation: "week",
  anchor: { year: 2026, month: 3, day: 9 },
  lanes: ["deadline", "reminder"],
  ...overrides,
});

/** The payload as the wire carries it, so a test can plant a field in it. */
function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeRaw(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("2M-CAL-008: the position round-trips", () => {
  it("returns the user to the orientation, the day and the lanes they were on", () => {
    expect(parseCalendarPosition(serializeCalendarPosition(query()))).toEqual(query());
  });

  it("normalizes the lane order, so two payloads naming the same lanes agree", () => {
    // The same property `parseLanes` has for the URL. Without it, two links to
    // one position produce two hrefs and the "same position" claim is only
    // approximately true.
    const scrambled = encode({
      v: CALENDAR_POSITION_VERSION, o: "day", d: "2026-08-15", l: ["reminder", "deadline"],
    });
    expect(parseCalendarPosition(scrambled)?.lanes).toEqual(["deadline", "reminder"]);
  });

  it("keeps every lane the vocabulary declares expressible", () => {
    const all = query({ lanes: CALENDAR_LANES });
    expect(parseCalendarPosition(serializeCalendarPosition(all))?.lanes).toEqual([...CALENDAR_LANES]);
  });
});

describe("2M-CAL-008: it answers null rather than a default", () => {
  /*
   * The distinction the caller needs. `parseWorkPosition` returns the Work
   * default for anything it cannot read, which is right for Work — but a
   * calendar parser that did the same would turn every Work return into a
   * calendar return pointing at today, and the user would land somewhere they
   * have never been.
   */
  it("refuses a Work position rather than coercing it", () => {
    const work = serializeWorkPosition(DEFAULT_WORK_QUERY);
    expect(parseCalendarPosition(work)).toBeNull();
  });

  it("refuses an absent, empty or repeated parameter", () => {
    expect(parseCalendarPosition(undefined)).toBeNull();
    expect(parseCalendarPosition("")).toBeNull();
    expect(parseCalendarPosition(["a", "b"])).toBeNull();
  });

  it("refuses a payload from another version", () => {
    const stale = encode({ v: "2020-01-01.1", o: "day", d: "2026-08-15", l: ["deadline"] });
    expect(parseCalendarPosition(stale)).toBeNull();
  });

  it("refuses a day that does not exist, rather than repairing it", () => {
    // `2026-02-30` passes the regex. Repairing it to March 2nd would put the
    // user on a date they never chose, which is the failure `isRealCalendarDay`
    // was added to `detail-controls.ts` for, one contract over.
    const impossible = encode({ v: CALENDAR_POSITION_VERSION, o: "day", d: "2026-02-30", l: ["deadline"] });
    expect(parseCalendarPosition(impossible)).toBeNull();
  });

  it("refuses an unknown orientation, an unknown lane and an empty lane list", () => {
    const base = { v: CALENDAR_POSITION_VERSION, d: "2026-08-15" };
    expect(parseCalendarPosition(encode({ ...base, o: "quarter", l: ["deadline"] }))).toBeNull();
    expect(parseCalendarPosition(encode({ ...base, o: "day", l: ["invented"] }))).toBeNull();
    expect(parseCalendarPosition(encode({ ...base, o: "day", l: [] }))).toBeNull();
  });

  it("refuses malformed base64 and malformed JSON without throwing", () => {
    expect(parseCalendarPosition("not-base64-!!")).toBeNull();
    expect(parseCalendarPosition(Buffer.from("{", "utf8").toString("base64url"))).toBeNull();
  });
});

describe("2L-RETURN-003, inherited: it refuses rather than ignores", () => {
  it("refuses every forbidden field, one at a time and by name", () => {
    /*
     * Planted individually rather than all at once: a single payload carrying
     * twelve extra keys would fail on the first one and prove nothing about the
     * other eleven. This is the shape `work-position`'s own guard uses.
     */
    for (const field of POSITION_FORBIDDEN_FIELDS) {
      const smuggled = encode({
        v: CALENDAR_POSITION_VERSION, o: "day", d: "2026-08-15", l: ["deadline"],
        [field]: "anything at all",
      });
      expect(parseCalendarPosition(smuggled), `${field} was tolerated`).toBeNull();
    }
    expect(POSITION_FORBIDDEN_FIELDS.length).toBeGreaterThan(0);
  });

  it("shares one forbidden-field list with Work rather than restating it", () => {
    // The import is the assertion: a second list is a second thing to keep
    // right, and this line fails to compile the day somebody copies it.
    expect(POSITION_FORBIDDEN_FIELDS).toContain("confirmationId");
    expect(POSITION_FORBIDDEN_FIELDS).toContain("operationKey");
    expect(POSITION_FORBIDDEN_FIELDS).toContain("observedBefore");
  });

  it("refuses an unknown key even when it looks harmless", () => {
    const extra = encode({
      v: CALENDAR_POSITION_VERSION, o: "day", d: "2026-08-15", l: ["deadline"], zoom: 2,
    });
    expect(parseCalendarPosition(extra)).toBeNull();
  });

  it("emits only the four navigation keys and never a subject or content", () => {
    const payload = decodeRaw(serializeCalendarPosition(query()));
    expect(Object.keys(payload).sort()).toEqual(["d", "l", "o", "v"]);
  });
});

describe("the declared default", () => {
  it("is today, one day wide, with every lane shown", () => {
    // Narrower and nearer, the same fail-closed direction `2M-CAL-005` declares
    // for the URL — a return that fell back to a fortnight would widen the range
    // in response to a malformed link.
    expect(defaultCalendarQuery(TODAY)).toEqual({
      orientation: "day",
      anchor: TODAY,
      lanes: CALENDAR_LANES,
    });
  });
});
