import { describe, expect, it } from "vitest";

import {
  RECURRENCE_CHOICES,
  deriveRecurrenceRule,
  isRecurrenceChoice,
  ordinalWithinMonth,
  parseLocalAnchor,
} from "./recurrence-derivation";
import { recurrenceRuleSchema } from "./recurrence-rule";

/**
 * `2R-SURFACE-001` — the parameters are already on the screen, so the control is
 * one select.
 *
 * ## What these assert that a snapshot of the dialog cannot
 *
 * The derivation is the whole reason the modal does not become a form, so its
 * correctness is what the requirement rests on. Two properties matter and they
 * pull apart:
 *
 * - **every derived rule is a valid rule** — asserted by parsing each one back
 *   through `recurrenceRuleSchema`, which is the same boundary the RPC uses. A
 *   derivation that produced `ordinal: 5` would typecheck and be refused by the
 *   database, and the owner would meet that refusal after pressing save;
 * - **the derived rule means the date the owner picked** — asserted per
 *   frequency, because "valid" and "what they meant" are different claims.
 */

const anchor = (value: string) => {
  const parsed = parseLocalAnchor(value);
  expect(parsed, `${value} did not parse`).not.toBeNull();
  return parsed!;
};

describe("reading the wall clock the composer already holds", () => {
  it("parses a datetime-local value into its parts", () => {
    // 2026-12-07 is a Monday.
    expect(anchor("2026-12-07T09:00")).toEqual({ year: 2026, month: 12, day: 7, weekday: 1 });
  });

  it("maps Sunday to 7, not to 0", () => {
    // 2026-12-06 is a Sunday. `Date.getUTCDay()` says 0; ISO says 7, and the
    // rule schema and Postgres `isodow` both mean ISO.
    expect(anchor("2026-12-06T09:00").weekday).toBe(7);
  });

  it("refuses a date the calendar does not have", () => {
    // Rolls forward to 1 May if it were constructed naively, which is how the
    // roll is detected rather than by a month-length table.
    expect(parseLocalAnchor("2026-04-31T09:00")).toBeNull();
    expect(parseLocalAnchor("2027-02-29T09:00")).toBeNull();
    expect(parseLocalAnchor("2028-02-29T09:00")).not.toBeNull(); // a real leap day
  });

  it("refuses anything that is not the exact grammar", () => {
    for (const bad of ["", "2026-12-07", "2026-12-07 09:00", "2026-12-07T09:00:00", "nonsense"]) {
      expect(parseLocalAnchor(bad), bad).toBeNull();
    }
  });

  it("reads the digits rather than asking the runtime for a local date", () => {
    /*
      `new Date("2026-12-07T09:00")` is parsed as LOCAL time by the runtime, so
      the weekday it reports depends on the machine's zone — the second timezone
      authority `2R-TIME-006` forbids consulting. The parse here is a property of
      the text, so the same string gives the same answer everywhere.
    */
    const parsed = anchor("2026-12-07T23:59");
    expect(parsed.day).toBe(7);
    expect(parsed.weekday).toBe(1);
  });
});

describe("which occurrence of its weekday a date is", () => {
  it("counts from the start of the month", () => {
    // December 2026: the 7th is the first Monday, the 14th the second.
    expect(ordinalWithinMonth(anchor("2026-12-07T09:00"))).toBe(1);
    expect(ordinalWithinMonth(anchor("2026-12-14T09:00"))).toBe(2);
    expect(ordinalWithinMonth(anchor("2026-12-21T09:00"))).toBe(3);
  });

  it("says `last` rather than `fifth`, and that is the load-bearing case", () => {
    /*
      `RECURRENCE_ORDINALS` has no `5` on purpose: a fifth Monday exists in some
      months and not others, so a rule naming it would silently skip months. The
      28th of December 2026 IS the fifth Monday, and reading it as `last` is the
      meaning that survives every month.
    */
    expect(ordinalWithinMonth(anchor("2026-12-28T09:00"))).toBe(-1);
    // And the 24th of a 31-day month is still the fourth, not the last.
    expect(ordinalWithinMonth(anchor("2026-12-24T09:00"))).toBe(4);
  });

  it("never produces an ordinal the schema refuses", () => {
    // Every day of a long month and of a short one.
    for (const [month, days] of [[1, 31], [2, 28], [12, 31]] as const) {
      for (let day = 1; day <= days; day += 1) {
        const stamp = `2027-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T09:00`;
        const ordinal = ordinalWithinMonth(anchor(stamp));
        expect([1, 2, 3, 4, -1], `${stamp} produced ${ordinal}`).toContain(ordinal);
      }
    }
  });
});

describe("the derived rule is valid, and means what the date said", () => {
  it("returns nothing at all for `none`", () => {
    // Not a rule with an empty pattern — the absence IS the answer.
    expect(deriveRecurrenceRule("none", anchor("2026-12-07T09:00"))).toBeNull();
  });

  it("passes every derived rule back through the schema the RPC uses", () => {
    /*
      The property that keeps a derivation defect from becoming a refusal the
      owner meets after pressing save. A rule that typechecks and is refused by
      the database is exactly what this catches.
    */
    for (const choice of RECURRENCE_CHOICES) {
      for (const stamp of [
        "2026-12-01T09:00", "2026-12-06T09:00", "2026-12-07T09:00",
        "2026-12-28T09:00", "2026-12-31T09:00", "2028-02-29T09:00",
      ]) {
        const rule = deriveRecurrenceRule(choice, anchor(stamp));
        if (rule === null) continue;
        expect(
          recurrenceRuleSchema.safeParse(rule).success,
          `${choice} on ${stamp} produced a rule the schema refuses`,
        ).toBe(true);
      }
    }
  });

  it("weekly repeats on the weekday of the date chosen", () => {
    expect(deriveRecurrenceRule("weekly", anchor("2026-12-06T09:00"))).toEqual({
      version: 1, frequency: "weekly", weekdays: [7],
    });
  });

  it("monthly by day repeats on that day of the month", () => {
    expect(deriveRecurrenceRule("monthlyDay", anchor("2026-12-31T09:00"))).toEqual({
      version: 1, frequency: "monthlyDay", day: 31,
    });
  });

  it("monthly by position carries both the position and the weekday", () => {
    expect(deriveRecurrenceRule("monthlyWeekday", anchor("2026-12-14T09:00"))).toEqual({
      version: 1, frequency: "monthlyWeekday", ordinal: 2, weekday: 1,
    });
  });

  it("yearly carries the month and the day", () => {
    expect(deriveRecurrenceRule("yearly", anchor("2026-12-25T09:00"))).toEqual({
      version: 1, frequency: "yearly", month: 12, day: 25,
    });
  });

  it("derives a different rule for each choice, on one date", () => {
    // A derivation that ignored its choice would satisfy "valid" for all five
    // and mean one thing for all five.
    const one = anchor("2026-12-14T09:00");
    const rules = RECURRENCE_CHOICES.map((choice) =>
      JSON.stringify(deriveRecurrenceRule(choice, one)),
    );
    expect(new Set(rules).size).toBe(RECURRENCE_CHOICES.length);
  });
});

describe("the choice vocabulary is closed", () => {
  it("admits its own members and refuses everything else", () => {
    for (const choice of RECURRENCE_CHOICES) expect(isRecurrenceChoice(choice)).toBe(true);
    for (const bad of ["", "weekly ", "RRULE", "hourly", 3, null, undefined]) {
      expect(isRecurrenceChoice(bad), String(bad)).toBe(false);
    }
  });
});
