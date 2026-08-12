/**
 * `2M-TIME-005` and `2M-TIME-006`, proved rather than asserted.
 *
 * The cross-surface half lives in `src/features/day-review/cross-surface-instant.test.ts`,
 * which drives the four surfaces the requirement names through their **own**
 * code. This file proves the contract those surfaces share.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { formatInstant, instantFormatter } from "./instant-format";

/** 2026-08-11T23:30:00Z — 20:30 on the 11th in São Paulo, 08:30 on the 12th in Auckland. */
const LATE_EVENING = "2026-08-11T23:30:00.000Z";

describe("2M-TIME-005: the zone is the profile's, and changing it changes what is rendered", () => {
  it("renders one instant differently in two zones, on every presentation", () => {
    for (const presentation of ["day", "time", "dayAndTime"] as const) {
      const sp = formatInstant(LATE_EVENING, presentation, "pt-BR", "America/Sao_Paulo");
      const nz = formatInstant(LATE_EVENING, presentation, "pt-BR", "Pacific/Auckland");
      expect(sp, presentation).not.toBeNull();
      expect(nz, presentation).not.toBeNull();
      expect(sp, `${presentation} did not move with the zone`).not.toEqual(nz);
    }
  });

  it("crosses the day boundary rather than shifting the clock only", () => {
    // The whole point of `2M-TIME-005`: a user who moves zones sees a *different
    // day*, not merely a different hour. A formatter built without `timeZone`
    // would return the host's answer for both of these and this would pass by
    // accident — which is why the two zones are on opposite sides of midnight.
    expect(formatInstant(LATE_EVENING, "day", "en", "America/Sao_Paulo")).toContain("11");
    expect(formatInstant(LATE_EVENING, "day", "en", "Pacific/Auckland")).toContain("12");
  });

  it("rewrites no stored value: the input string is untouched by formatting", () => {
    const stored = LATE_EVENING;
    formatInstant(stored, "dayAndTime", "pt-BR", "America/Sao_Paulo");
    formatInstant(stored, "dayAndTime", "en", "Pacific/Auckland");
    expect(stored).toBe("2026-08-11T23:30:00.000Z");
  });

  it("has no writer at all", () => {
    const source = readFileSync(join(__dirname, "instant-format.ts"), "utf8");
    for (const token of ["supabase", ".update(", ".insert(", ".rpc("]) {
      expect(source, `instant-format.ts reached for ${token}`).not.toContain(token);
    }
  });
});

describe("2M-TIME-006: one presentation, one output", () => {
  it("`day` carries no clock component", () => {
    // OD-2M-3 A. A `day` that rendered "20:30" would be presenting an intention
    // as a reserved time, which is the defect slice 2M.2 removed from the task
    // detail.
    const rendered = formatInstant(LATE_EVENING, "day", "pt-BR", "America/Sao_Paulo") ?? "";
    expect(rendered).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("`time` is 24-hour in both locales, so two surfaces cannot disagree on am/pm", () => {
    expect(formatInstant(LATE_EVENING, "time", "en", "America/Sao_Paulo")).toBe("20:30");
    expect(formatInstant(LATE_EVENING, "time", "pt-BR", "America/Sao_Paulo")).toBe("20:30");
  });

  it("the bound formatter and the direct call produce the same characters", () => {
    const bound = instantFormatter("dayAndTime", "pt-BR", "America/Sao_Paulo");
    expect(bound(LATE_EVENING)).toBe(formatInstant(LATE_EVENING, "dayAndTime", "pt-BR", "America/Sao_Paulo"));
  });

  it("refuses an unparseable instant rather than inventing a day", () => {
    for (const bad of [null, undefined, "", "not-a-date"]) {
      expect(formatInstant(bad, "day", "pt-BR", "America/Sao_Paulo"), String(bad)).toBeNull();
      expect(instantFormatter("day", "pt-BR", "America/Sao_Paulo")(bad), String(bad)).toBeNull();
    }
  });
});

describe("LDC-CONTRACT-002: the locale changes the words, never the day", () => {
  /*
   * The property the initiative had to state before touching seventeen call
   * sites, because almost every one of them passes `locale` and none of them
   * passed a zone: **the locale is presentation and the zone is meaning**. A
   * surface that switched languages and moved an item to another day would be
   * answering a different question in Portuguese than in English.
   *
   * Asserted on the instants where it could actually break — inside the last
   * hour of a local day, where the UTC date and the local date disagree.
   */

  /** 2026-08-15T02:30Z is still 2026-08-14 in São Paulo (UTC−3). */
  const AFTER_UTC_MIDNIGHT = "2026-08-15T02:30:00.000Z";
  /** 2026-08-15T23:30Z is already 2026-08-16 in Sydney (UTC+10). */
  const BEFORE_UTC_MIDNIGHT = "2026-08-15T23:30:00.000Z";

  /** The numerals a rendering contains, which is the day stripped of language. */
  const digits = (rendered: string | null) => (rendered ?? "").match(/\d+/g)?.join("-") ?? "";

  it("renders the same calendar day in pt-BR and en, on both sides of UTC midnight", () => {
    for (const [instant, zone] of [
      [AFTER_UTC_MIDNIGHT, "America/Sao_Paulo"],
      [BEFORE_UTC_MIDNIGHT, "Australia/Sydney"],
      [AFTER_UTC_MIDNIGHT, "Australia/Sydney"],
      [BEFORE_UTC_MIDNIGHT, "America/Sao_Paulo"],
    ] as const) {
      const pt = formatInstant(instant, "day", "pt-BR", zone);
      const en = formatInstant(instant, "day", "en", zone);
      expect(digits(pt), `${instant} in ${zone}`).toBe(digits(en));
      // And the words genuinely differ, or the assertion above would be vacuous
      // — two identical strings agree about everything, including nothing.
      expect(pt).not.toBe(en);
    }
  });

  it("is the zone, not the locale, that moves an instant to another day", () => {
    // One instant, one locale, two zones: different days. The same instant, one
    // zone, two locales: the same day. That is the whole contract in two lines.
    const saoPaulo = formatInstant(BEFORE_UTC_MIDNIGHT, "day", "pt-BR", "America/Sao_Paulo");
    const sydney = formatInstant(BEFORE_UTC_MIDNIGHT, "day", "pt-BR", "Australia/Sydney");
    expect(digits(saoPaulo)).not.toBe(digits(sydney));

    const sydneyEnglish = formatInstant(BEFORE_UTC_MIDNIGHT, "day", "en", "Australia/Sydney");
    expect(digits(sydney)).toBe(digits(sydneyEnglish));
  });

  it("keeps `dayAndTime` on the same day as `day` for the same instant", () => {
    // The cross-presentation half of `2M-TIME-006`, at the boundary: a list
    // showing "15 Aug 23:30" beside a detail showing "16 Aug" is the disagreement
    // the notification list shipped once already.
    for (const locale of ["pt-BR", "en"] as const) {
      const day = digits(formatInstant(BEFORE_UTC_MIDNIGHT, "day", locale, "Australia/Sydney"));
      const dayAndTime = digits(formatInstant(BEFORE_UTC_MIDNIGHT, "dayAndTime", locale, "Australia/Sydney"));
      expect(dayAndTime.startsWith(day), `${locale}: ${dayAndTime} should begin with ${day}`).toBe(true);
    }
  });
});
