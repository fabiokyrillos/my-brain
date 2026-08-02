import { describe, expect, it } from "vitest";
import {
  describeInstantForDateTimeLocal,
  formatInstantForDateTimeLocal,
  localDateTimeToOffsetInstant,
} from "./candidate-due-date";

describe("candidate due-date conversion", () => {
  it("formats an offset-bearing instant for a datetime-local control", () => {
    expect(formatInstantForDateTimeLocal(
      "2026-07-21T17:30:00+00:00",
      "America/Sao_Paulo",
    )).toBe("2026-07-21T14:30");
  });

  it("converts a normal Sao Paulo wall time to one offset-bearing instant", () => {
    expect(localDateTimeToOffsetInstant(
      "2026-07-21T14:30",
      "America/Sao_Paulo",
    )).toBe("2026-07-21T14:30:00-03:00");
  });

  it("converts a normal New York wall time to one offset-bearing instant", () => {
    expect(localDateTimeToOffsetInstant(
      "2026-07-21T13:30",
      "America/New_York",
    )).toBe("2026-07-21T13:30:00-04:00");
  });

  it("converts a UTC wall time with an explicit zero offset", () => {
    expect(localDateTimeToOffsetInstant(
      "2026-07-21T17:30",
      "UTC",
    )).toBe("2026-07-21T17:30:00+00:00");
  });

  it("rejects an invalid IANA timezone", () => {
    expect(() => localDateTimeToOffsetInstant(
      "2026-07-21T14:30",
      "GMT-3",
    )).toThrow(/timezone/i);
  });

  it("rejects an invalid IANA timezone while formatting an instant", () => {
    expect(() => formatInstantForDateTimeLocal(
      "2026-07-21T17:30:00+00:00",
      "GMT-3",
    )).toThrow(/timezone/i);
  });

  it("rejects malformed local input", () => {
    expect(() => localDateTimeToOffsetInstant(
      "2026-07-21 14:30",
      "America/Sao_Paulo",
    )).toThrow(/date|time/i);
  });

  it("rejects an impossible Gregorian wall date", () => {
    expect(() => localDateTimeToOffsetInstant(
      "2026-02-30T10:00",
      "America/Sao_Paulo",
    )).toThrow(/date|valid/i);
  });

  it("rejects a DST gap with zero valid instants", () => {
    expect(() => localDateTimeToOffsetInstant(
      "2026-03-08T02:30",
      "America/New_York",
    )).toThrow(/nonexistent|gap|valid instant/i);
  });

  it("rejects a DST overlap with more than one valid instant", () => {
    expect(() => localDateTimeToOffsetInstant(
      "2026-11-01T01:30",
      "America/New_York",
    )).toThrow(/ambiguous|overlap|valid instant/i);
  });

  it.each([
    ["America/Sao_Paulo", "2026-07-21T14:30"],
    ["America/New_York", "2026-07-21T13:30"],
    ["UTC", "2026-07-21T17:30"],
  ])("round-trips a normal date exactly in %s", (timezone, localValue) => {
    const instant = localDateTimeToOffsetInstant(localValue, timezone);

    expect(formatInstantForDateTimeLocal(instant, timezone)).toBe(localValue);
  });

  it("maps null, undefined, and empty instant values to an empty control", () => {
    expect(formatInstantForDateTimeLocal(null, "UTC")).toBe("");
    expect(formatInstantForDateTimeLocal(undefined, "UTC")).toBe("");
    expect(formatInstantForDateTimeLocal("", "UTC")).toBe("");
  });

  it("maps null and empty local values to an explicit due-date clear", () => {
    expect(localDateTimeToOffsetInstant(null, "UTC")).toBeNull();
    expect(localDateTimeToOffsetInstant("", "UTC")).toBeNull();
  });

  it("rejects an instant without an explicit offset", () => {
    expect(() => formatInstantForDateTimeLocal(
      "2026-07-21T17:30:00",
      "UTC",
    )).toThrow(/offset/i);
  });

  it("rejects a malformed or impossible offset-bearing instant", () => {
    expect(() => formatInstantForDateTimeLocal(
      "2026-02-30T10:00:00-03:00",
      "America/Sao_Paulo",
    )).toThrow(/date|instant|valid/i);
  });

  it("does not silently fall back to the workstation timezone", () => {
    const localValue = "2026-07-21T13:30";

    expect(localDateTimeToOffsetInstant(localValue, "America/New_York"))
      .toBe("2026-07-21T13:30:00-04:00");
    expect(localDateTimeToOffsetInstant(localValue, "UTC"))
      .toBe("2026-07-21T13:30:00+00:00");
  });
});

// The upstream contract for a candidate due date is `storableInstant` in
// `src/lib/ai/extraction-schema.ts` and `dueAtSchema` in
// `./candidate-edit-contract.ts` — both `z.string().datetime({ offset: true })`,
// which permits any seconds value and optional fractional seconds. The reader
// below has to accept exactly that grammar and nothing wider: an instant the
// model was allowed to produce must never take the entry detail route down, and
// a value outside the grammar must never be guessed at.
describe("candidate due-date instant contract", () => {
  it("reads a whole-minute UTC instant", () => {
    expect(describeInstantForDateTimeLocal("2026-07-21T17:30:00Z", "America/Sao_Paulo"))
      .toEqual({ status: "valid", localValue: "2026-07-21T14:30" });
  });

  it("reads a UTC instant carrying seconds", () => {
    expect(describeInstantForDateTimeLocal("2026-07-21T17:30:45Z", "America/Sao_Paulo"))
      .toEqual({ status: "valid", localValue: "2026-07-21T14:30" });
  });

  it("reads a UTC instant carrying fractional seconds", () => {
    expect(describeInstantForDateTimeLocal("2026-07-21T17:30:45.123Z", "America/Sao_Paulo"))
      .toEqual({ status: "valid", localValue: "2026-07-21T14:30" });
  });

  it("reads a positive-offset instant", () => {
    expect(describeInstantForDateTimeLocal("2026-07-21T20:30:00+03:00", "UTC"))
      .toEqual({ status: "valid", localValue: "2026-07-21T17:30" });
  });

  it("reads a negative-offset instant", () => {
    expect(describeInstantForDateTimeLocal("2026-07-21T14:30:00-03:00", "UTC"))
      .toEqual({ status: "valid", localValue: "2026-07-21T17:30" });
  });

  // The exact shape stored for entry bdf48c06-5ceb-4c27-a7c7-ddc901e366b2: a
  // valid negative-offset end-of-day instant whose seconds are not zero.
  it("reads the end-of-day negative-offset instant that crashed the entry route", () => {
    expect(describeInstantForDateTimeLocal("2026-08-08T23:59:59-03:00", "America/Sao_Paulo"))
      .toEqual({ status: "valid", localValue: "2026-08-08T23:59" });
  });

  it("truncates sub-minute precision instead of rounding the wall clock forward", () => {
    expect(describeInstantForDateTimeLocal("2026-07-21T17:30:59.999Z", "UTC"))
      .toEqual({ status: "valid", localValue: "2026-07-21T17:30" });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
  ])("reports %s as an absent due date", (_label, value) => {
    expect(describeInstantForDateTimeLocal(value, "America/Sao_Paulo"))
      .toEqual({ status: "absent" });
  });

  it.each([
    ["a date-only value", "2026-08-08"],
    ["a local date-time without an offset", "2026-08-08T23:59:00"],
    ["a SQL-style timestamp", "2026-08-08 23:59:00+00"],
  ])("reports %s as unreadable for want of an offset", (_label, value) => {
    expect(describeInstantForDateTimeLocal(value, "America/Sao_Paulo"))
      .toEqual({ status: "unreadable", reason: "missing-offset" });
  });

  it.each([
    ["a malformed offset", "2026-08-08T23:59:00+3:00"],
    ["an out-of-range offset", "2026-08-08T23:59:00+99:00"],
    ["an impossible Gregorian date", "2026-02-30T10:00:00-03:00"],
    ["an out-of-range seconds field", "2026-08-08T23:59:75-03:00"],
    ["a truncated instant", "2026-08-08T23Z"],
  ])("reports %s as unreadable for malformation", (_label, value) => {
    expect(describeInstantForDateTimeLocal(value, "America/Sao_Paulo"))
      .toEqual({ status: "unreadable", reason: "malformed-instant" });
  });

  it("never silently reinterprets an unreadable value as a wall time", () => {
    for (const value of ["2026-08-08", "2026-08-08T23:59:00", "2026-08-08 23:59:00+00"]) {
      const state = describeInstantForDateTimeLocal(value, "America/Sao_Paulo");

      expect(state.status).toBe("unreadable");
      expect(JSON.stringify(state)).not.toContain("2026-08-08T23:59");
    }
  });

  // An unusable timezone is a configuration defect, not a candidate-data
  // defect: it must stay loud rather than be absorbed into the typed state.
  it("still refuses an invalid IANA timezone", () => {
    expect(() => describeInstantForDateTimeLocal("2026-07-21T17:30:00Z", "GMT-3"))
      .toThrow(/timezone/i);
  });

  it("formats an instant carrying seconds through the throwing reader too", () => {
    expect(formatInstantForDateTimeLocal(
      "2026-08-08T23:59:59-03:00",
      "America/Sao_Paulo",
    )).toBe("2026-08-08T23:59");
  });

  it("round-trips an edited whole-minute value out of an instant with seconds", () => {
    const state = describeInstantForDateTimeLocal(
      "2026-08-08T23:59:59-03:00",
      "America/Sao_Paulo",
    );

    expect(state.status).toBe("valid");
    if (state.status !== "valid") return;
    expect(localDateTimeToOffsetInstant(state.localValue, "America/Sao_Paulo"))
      .toBe("2026-08-08T23:59:00-03:00");
  });
});
