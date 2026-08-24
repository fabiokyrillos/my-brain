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

/**
 * The owner device checkpoint's first finding, reproduced — slice 2R.3 fix.
 *
 * ## What was reported
 *
 * *"Para repetir segunda, quarta e sexta, eu teria de criar tres lembretes."*
 *
 * ## What the model actually supports
 *
 * Everything. Proved by execution against the deployed database before a line
 * was changed: `create_reminder_series_v1` with `weekdays: [1,3,5]` stores the
 * rule verbatim, materialises **one** occurrence, and picks the first matching
 * weekday rather than the anchor's own -- and `edit_future` moves it to `[2,4]`.
 * The three malformations the schema promises to refuse (empty, descending,
 * duplicated) are all refused at the CHECK constraint.
 *
 * So the gap was entirely in the surface, and specifically here: `weekly`
 * collapsed to `[anchor.weekday]`. **No migration, no contract change.**
 *
 * These cases fail against that collapse and pass against a derivation that
 * carries the days the owner chose.
 */
describe("weekly carries every weekday the owner chose", () => {
  const monday = anchor("2026-12-07T09:00");

  it("keeps three chosen days in one rule", () => {
    // The reported case: Monday, Wednesday, Friday, as ONE series.
    expect(deriveRecurrenceRule("weekly", monday, [1, 3, 5])).toEqual({
      version: 1, frequency: "weekly", weekdays: [1, 3, 5],
    });
  });

  it("sorts what it is given, because one rule gets one stored spelling", () => {
    /*
      The schema demands strictly ascending weekdays, and the reason is not
      tidiness: two byte-different rules meaning the same thing would make "did
      the series change?" unanswerable by comparison, which `2R-SERIES-003`
      needs. A checkbox group emits its values in DOM order, so the sort belongs
      here rather than in the caller.
    */
    expect(deriveRecurrenceRule("weekly", monday, [5, 1, 3])).toEqual({
      version: 1, frequency: "weekly", weekdays: [1, 3, 5],
    });
  });

  it("removes duplicates, which a double-submitted control can produce", () => {
    expect(deriveRecurrenceRule("weekly", monday, [3, 1, 3])).toEqual({
      version: 1, frequency: "weekly", weekdays: [1, 3],
    });
  });

  it("falls back to the anchor's own weekday when none was chosen", () => {
    // `2R-SURFACE-001`'s property survives: the date on the screen still
    // supplies the parameter when the owner touches nothing.
    expect(deriveRecurrenceRule("weekly", monday, [])).toEqual({
      version: 1, frequency: "weekly", weekdays: [1],
    });
    expect(deriveRecurrenceRule("weekly", monday)).toEqual({
      version: 1, frequency: "weekly", weekdays: [1],
    });
  });

  it("ignores days outside the ISO range rather than storing them", () => {
    // The CHECK constraint would refuse them, and a refusal the owner meets
    // after pressing save is worse than one this side never sends.
    expect(deriveRecurrenceRule("weekly", monday, [0, 1, 8, 7])).toEqual({
      version: 1, frequency: "weekly", weekdays: [1, 7],
    });
  });

  it("keeps every derived multi-day rule valid at the schema the RPC uses", () => {
    for (const chosen of [[1], [1, 3, 5], [7], [1, 2, 3, 4, 5, 6, 7], [6, 7]]) {
      const rule = deriveRecurrenceRule("weekly", monday, chosen);
      expect(
        recurrenceRuleSchema.safeParse(rule).success,
        `${chosen.join(",")} produced a rule the schema refuses`,
      ).toBe(true);
    }
  });

  it("leaves the other four frequencies untouched by the new argument", () => {
    // The chosen days mean nothing to `daily`, `monthlyDay`, `monthlyWeekday`
    // or `yearly`, and passing them must not change what those derive.
    for (const choice of ["daily", "monthlyDay", "monthlyWeekday", "yearly"] as const) {
      expect(deriveRecurrenceRule(choice, monday, [1, 3, 5]))
        .toEqual(deriveRecurrenceRule(choice, monday));
    }
  });
});
