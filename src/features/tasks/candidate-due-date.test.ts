import { describe, expect, it } from "vitest";
import {
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
