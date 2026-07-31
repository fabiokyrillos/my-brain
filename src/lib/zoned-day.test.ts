import { describe, expect, it } from "vitest";

import { localDayEndExclusive, localDayStart, localDayStartFromIsoDate } from "./zoned-day";

describe("localDayStart", () => {
  it("puts midnight in the named zone, not in UTC", () => {
    // São Paulo is UTC-3, so 1 August starts at 03:00Z.
    expect(localDayStart(2026, 8, 1, "America/Sao_Paulo").toISOString()).toBe(
      "2026-08-01T03:00:00.000Z",
    );
    expect(localDayStart(2026, 8, 1, "UTC").toISOString()).toBe("2026-08-01T00:00:00.000Z");
    // Tokyo is UTC+9, so its 1 August began the previous afternoon in UTC.
    expect(localDayStart(2026, 8, 1, "Asia/Tokyo").toISOString()).toBe(
      "2026-07-31T15:00:00.000Z",
    );
  });

  it("rolls an overflowing day into the next month", () => {
    expect(localDayStart(2026, 7, 32, "UTC").toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(localDayStart(2026, 2, 29, "UTC").toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("resolves the offset across a daylight-saving change", () => {
    // The US moves to DST on 8 March 2026; the day before and after have
    // different offsets, and both must still start at local midnight.
    expect(localDayStart(2026, 3, 7, "America/New_York").toISOString()).toBe(
      "2026-03-07T05:00:00.000Z",
    );
    expect(localDayStart(2026, 3, 9, "America/New_York").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
  });
});

describe("localDayStartFromIsoDate", () => {
  it("accepts a well-formed date", () => {
    expect(localDayStartFromIsoDate("2026-08-01", "UTC")?.toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("rejects anything that is not a real calendar day", () => {
    for (const value of ["2026-8-1", "31/07/2026", "2026-13-01", "2026-02-31", "", "yesterday"]) {
      expect(localDayStartFromIsoDate(value, "UTC"), value).toBeNull();
    }
  });
});

describe("localDayEndExclusive", () => {
  it("ends after the chosen day, so the whole of it is included", () => {
    expect(localDayEndExclusive("2026-08-01", "UTC")?.toISOString()).toBe(
      "2026-08-02T00:00:00.000Z",
    );
    expect(localDayEndExclusive("2026-08-01", "America/Sao_Paulo")?.toISOString()).toBe(
      "2026-08-02T03:00:00.000Z",
    );
  });

  it("crosses a month and a year boundary correctly", () => {
    expect(localDayEndExclusive("2026-07-31", "UTC")?.toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
    expect(localDayEndExclusive("2026-12-31", "UTC")?.toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("rejects a malformed date rather than inventing a boundary", () => {
    expect(localDayEndExclusive("2026-02-31", "UTC")).toBeNull();
  });
});
