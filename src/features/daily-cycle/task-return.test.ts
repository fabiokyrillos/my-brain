import { describe, expect, it } from "vitest";

import { serializeCalendarPosition } from "@/features/calendar/calendar-position";
import { POSITION_FORBIDDEN_FIELDS, serializeWorkPosition } from "@/features/operations/work-position";
import { DEFAULT_WORK_QUERY } from "./work-query";

import { resolveTaskBackHref } from "./task-return";

/**
 * `2M-CAL-008` — a task opened from the calendar returns to the calendar, and a
 * task opened from Work returns to Work, through **one** parameter.
 *
 * The property that matters is that neither payload can be read as the other and
 * that nothing throws, because a return position is what a user reaches by
 * pressing Back.
 */

const CALENDAR = serializeCalendarPosition({
  orientation: "week",
  anchor: { year: 2026, month: 3, day: 9 },
  lanes: ["deadline", "intention"],
});

describe("resolveTaskBackHref", () => {
  it("returns to the exact calendar position, orientation and lanes included", () => {
    const href = resolveTaskBackHref("pt-BR", CALENDAR);
    expect(href.startsWith("/pt-BR/app/calendar?")).toBe(true);
    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("date")).toBe("2026-03-09");
    expect(params.get("orientation")).toBe("week");
    expect(params.get("lanes")).toBe("deadline,intention");
  });

  it("returns to Work for a Work position, unchanged from before this slice", () => {
    const href = resolveTaskBackHref("pt-BR", serializeWorkPosition(DEFAULT_WORK_QUERY));
    expect(href.startsWith("/pt-BR/app/work")).toBe(true);
    expect(href).not.toContain("/app/calendar");
  });

  it("falls back to Work — not to a calendar pointing at today — when nothing parses", () => {
    /*
     * The failure this ordering was chosen to avoid. If the calendar parser
     * answered a default instead of `null`, every unparseable `from` would send
     * the user to a calendar they may never have opened. Work is the
     * pre-existing default and stays the default.
     */
    const hostile: (string | string[] | undefined)[] = [undefined, "", "not-base64-!!", ["a", "b"]];
    for (const value of hostile) {
      const href = resolveTaskBackHref("en", value);
      expect(href.startsWith("/en/app/work")).toBe(true);
    }
  });

  it("refuses a calendar position carrying an authorization and lands on Work", () => {
    // `2L-RETURN-003`, inherited. A smuggled field must not be *ignored* — the
    // whole position is refused, which here means it stops being a calendar
    // return at all rather than becoming one with the field dropped.
    for (const field of POSITION_FORBIDDEN_FIELDS) {
      const payload = JSON.parse(Buffer.from(CALENDAR, "base64url").toString("utf8")) as Record<string, unknown>;
      payload[field] = "smuggled";
      const smuggled = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
      expect(resolveTaskBackHref("en", smuggled), `${field} was tolerated`)
        .not.toContain("/app/calendar");
    }
  });

  it("never throws, whatever it is handed", () => {
    const hostile = [
      Buffer.from("{", "utf8").toString("base64url"),
      Buffer.from("null", "utf8").toString("base64url"),
      Buffer.from("[]", "utf8").toString("base64url"),
      "%%%",
      "a".repeat(5000),
    ];
    for (const value of hostile) {
      expect(() => resolveTaskBackHref("pt-BR", value)).not.toThrow();
    }
  });

  it("keeps the locale it was given", () => {
    expect(resolveTaskBackHref("en", CALENDAR).startsWith("/en/app/calendar")).toBe(true);
    expect(resolveTaskBackHref("pt-BR", CALENDAR).startsWith("/pt-BR/app/calendar")).toBe(true);
  });
});
