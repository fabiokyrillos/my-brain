import { describe, expect, it } from "vitest";

import { birthdayFormSchema, isRealBirthday } from "./schema";

const PERSON = "11111111-1111-4111-8111-111111111111";

describe("isRealBirthday — the same date the database accepts", () => {
  it.each([
    [5, 5, null, true],
    [29, 2, null, true],
    [29, 2, 2024, true],
    [29, 2, 2023, false],
    [31, 4, null, false],
    [30, 2, null, false],
    [0, 1, null, false],
    [1, 13, null, false],
    [1, 1, 1899, false],
  ] as const)("day %i, month %i, year %s → %s", (day, month, year, expected) => {
    expect(isRealBirthday(day, month, year)).toBe(expected);
  });
});

describe("birthdayFormSchema", () => {
  it("accepts a date without a year, reading empty fields as null", () => {
    const parsed = birthdayFormSchema.safeParse({ personId: PERSON, intent: "set", day: "5", month: "5", year: "" });
    expect(parsed.success && parsed.data).toEqual({ personId: PERSON, intent: "set", day: 5, month: 5, year: null });
  });

  it("refuses a date that does not exist", () => {
    expect(birthdayFormSchema.safeParse({ personId: PERSON, intent: "set", day: "31", month: "4", year: "" }).success).toBe(false);
  });

  it("lets a clear through with no date", () => {
    expect(birthdayFormSchema.safeParse({ personId: PERSON, intent: "clear", day: null, month: null, year: null }).success).toBe(true);
  });

  it("refuses an id that is not a uuid", () => {
    expect(birthdayFormSchema.safeParse({ personId: "x", intent: "clear", day: null, month: null, year: null }).success).toBe(false);
  });
});
