import { describe, expect, it } from "vitest";

import {
  RECURRENCE_FREQUENCIES,
  RECURRENCE_ORDINALS,
  RECURRENCE_RULE_VERSION,
  parseRecurrenceRule,
  recurrenceRuleSchema,
  weekdayFromJsDay,
} from "./recurrence-rule";

/**
 * `2R-MODEL-002` and `-003` at the TypeScript boundary.
 *
 * Every refusal below is driven through `parseRecurrenceRule`, which is what a
 * Server Action actually calls, rather than through the bare Zod union — the
 * union could be correct while the version gate in front of it was not, and
 * that gate is the whole of `2R-MODEL-003`.
 */

const daily = { version: 1, frequency: "daily" } as const;

describe("2R-MODEL-001: the five signed patterns are admitted, and only five exist", () => {
  it("declares exactly the closed set OD-2R-2 signed", () => {
    expect([...RECURRENCE_FREQUENCIES]).toEqual([
      "daily",
      "weekly",
      "monthlyDay",
      "monthlyWeekday",
      "yearly",
    ]);
  });

  it.each([
    ["daily", daily],
    ["weekly on chosen weekdays", { version: 1, frequency: "weekly", weekdays: [1, 3, 5] }],
    ["monthly on a day of the month", { version: 1, frequency: "monthlyDay", day: 31 }],
    ["monthly on an ordinal weekday", { version: 1, frequency: "monthlyWeekday", ordinal: 2, weekday: 3 }],
    ["monthly on the LAST weekday", { version: 1, frequency: "monthlyWeekday", ordinal: -1, weekday: 5 }],
    ["yearly", { version: 1, frequency: "yearly", month: 2, day: 29 }],
  ])("admits %s", (_label, rule) => {
    const parsed = parseRecurrenceRule(rule);
    expect(parsed.ok, JSON.stringify(rule)).toBe(true);
  });

  it("keeps the 31st sayable, because the clamp is the generator's job", () => {
    // OD-2R-5 case 3. Refusing 31 here would make the intention unsayable, and
    // storing 30 would silently rewrite it. Both are worse than accepting it.
    expect(parseRecurrenceRule({ version: 1, frequency: "monthlyDay", day: 31 }).ok).toBe(true);
    expect(parseRecurrenceRule({ version: 1, frequency: "yearly", month: 2, day: 29 }).ok).toBe(true);
  });

  it("admits no fifth ordinal, because a fifth weekday skips months", () => {
    expect([...RECURRENCE_ORDINALS]).toEqual([1, 2, 3, 4, -1]);
    expect(parseRecurrenceRule({ version: 1, frequency: "monthlyWeekday", ordinal: 5, weekday: 5 }).ok)
      .toBe(false);
  });
});

describe("2R-MODEL-003: an unknown version is refused rather than guessed at", () => {
  it("refuses a newer version as unknown-version, not as malformed", () => {
    // The distinction is unrecoverable once a version 2 exists: "malformed"
    // reads as "the owner wrote something wrong" when the truth is "this build
    // is older than the rule".
    const parsed = parseRecurrenceRule({ version: 2, frequency: "daily" });
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toBe("unknown-version");
  });

  it("refuses a missing version the same way", () => {
    const parsed = parseRecurrenceRule({ frequency: "daily" });
    expect(parsed.ok === false && parsed.reason).toBe("unknown-version");
  });

  it("stamps every admitted rule with the declared version", () => {
    expect(RECURRENCE_RULE_VERSION).toBe(1);
    const parsed = parseRecurrenceRule(daily);
    expect(parsed.ok === true && parsed.rule.version).toBe(1);
  });
});

describe("2R-MODEL-002: an invalid rule is refused with a NAMED reason", () => {
  it.each([
    ["a scalar", "daily", "not-an-object"],
    ["an array", [1], "not-an-object"],
    ["null", null, "not-an-object"],
    ["an unknown frequency", { version: 1, frequency: "hourly" }, "unknown-frequency"],
    ["a missing frequency", { version: 1 }, "unknown-frequency"],
    ["an extra field", { version: 1, frequency: "daily", every: 2 }, "malformed"],
    ["a missing required field", { version: 1, frequency: "weekly" }, "malformed"],
    ["an empty weekday list", { version: 1, frequency: "weekly", weekdays: [] }, "malformed"],
    ["a duplicate weekday", { version: 1, frequency: "weekly", weekdays: [1, 1] }, "malformed"],
    ["a descending weekday list", { version: 1, frequency: "weekly", weekdays: [3, 1] }, "malformed"],
    ["weekday zero", { version: 1, frequency: "weekly", weekdays: [0] }, "malformed"],
    ["weekday eight", { version: 1, frequency: "weekly", weekdays: [8] }, "malformed"],
    ["day zero", { version: 1, frequency: "monthlyDay", day: 0 }, "malformed"],
    ["day thirty-two", { version: 1, frequency: "monthlyDay", day: 32 }, "malformed"],
    ["a fractional day", { version: 1, frequency: "monthlyDay", day: 1.5 }, "malformed"],
    ["month thirteen", { version: 1, frequency: "yearly", month: 13, day: 1 }, "malformed"],
  ])("refuses %s as %s", (_label, rule, reason) => {
    const parsed = parseRecurrenceRule(rule);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toBe(reason);
  });

  it("refuses an interval, because OD-2R-2 signed five patterns and none of them has one", () => {
    // "a cada trimestre" appears in the PRD's motivation and is NOT expressible
    // by the signed set. It is refused here rather than quietly enabled by a
    // field nobody signed -- see the slice 2R.1 acceptance record, which records
    // the gap with a destination instead of closing it.
    expect(parseRecurrenceRule({ version: 1, frequency: "monthlyDay", day: 1, interval: 3 }).ok)
      .toBe(false);
  });

  it("is not vacuous: the same shapes without the defect are admitted", () => {
    expect(parseRecurrenceRule({ version: 1, frequency: "weekly", weekdays: [1] }).ok).toBe(true);
    expect(parseRecurrenceRule({ version: 1, frequency: "monthlyDay", day: 1 }).ok).toBe(true);
    expect(parseRecurrenceRule({ version: 1, frequency: "yearly", month: 12, day: 25 }).ok).toBe(true);
  });
});

describe("the union is strict, so a surface cannot smuggle a field", () => {
  it("refuses a field belonging to another frequency", () => {
    expect(recurrenceRuleSchema.safeParse({ version: 1, frequency: "daily", weekdays: [1] }).success)
      .toBe(false);
    expect(recurrenceRuleSchema.safeParse({ version: 1, frequency: "monthlyDay", day: 1, weekday: 1 }).success)
      .toBe(false);
  });
});

describe("weekday numbering is ISO, converted in one named place", () => {
  it("maps JavaScript's Sunday-zero onto ISO's Monday-one", () => {
    // The off-by-one this prevents only shows up on Sundays, which is exactly
    // the kind that reaches production.
    expect(weekdayFromJsDay(0)).toBe(7);
    expect(weekdayFromJsDay(1)).toBe(1);
    expect(weekdayFromJsDay(6)).toBe(6);
  });

  it("agrees with a real Date, so the mapping is not merely self-consistent", () => {
    // 2026-02-02 is a Monday; 2026-02-08 is a Sunday.
    expect(weekdayFromJsDay(new Date("2026-02-02T12:00:00Z").getUTCDay())).toBe(1);
    expect(weekdayFromJsDay(new Date("2026-02-08T12:00:00Z").getUTCDay())).toBe(7);
  });
});
