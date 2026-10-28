/**
 * The reminder surfaces' one zone authority.
 *
 * `2R-TIME-005` asks for "one timezone authority, not several", and the
 * reminders list made that true inside a single page by building its
 * formatters once and passing the results down. A second surface — the detail
 * page a notification tap now opens — made that no longer enough: two pages
 * each constructing their own `Intl.DateTimeFormat` are two authorities even
 * when both are handed the same zone today.
 *
 * The case worth asserting is the one that costs the owner something: a
 * formatter built without `timeZone` renders in the server's zone and looks
 * entirely plausible while being hours wrong. Every test below would catch
 * that, and the last one catches it even if only one of the three forgot.
 */

import { describe, expect, it } from "vitest";

import { reminderFormatters } from "./formatters";

// 23:30 UTC is the same day in São Paulo (-03:00) but the NEXT day in Tokyo
// (+09:00), so a dropped zone cannot hide behind a matching date.
const INSTANT = "2026-12-05T23:30:00+00:00";
const SAO_PAULO = "America/Sao_Paulo";
const TOKYO = "Asia/Tokyo";

describe("reminderFormatters", () => {
  it("renders the instant in the owner's zone, not the runtime's", () => {
    const sp = reminderFormatters("pt-BR", SAO_PAULO).formatInstant(INSTANT);
    const tokyo = reminderFormatters("pt-BR", TOKYO).formatInstant(INSTANT);
    expect(sp).not.toBe(tokyo);
    expect(sp).toContain("20:30");
  });

  it("gives a datetime-local value in that zone, ISO-ordered", () => {
    const value = reminderFormatters("pt-BR", SAO_PAULO).formatLocalInput(INSTANT);
    expect(value).toBe("2026-12-05T20:30");
  });

  it("crosses the date boundary where the zone says it does", () => {
    // The same instant is already 6 December in Tokyo. A formatter that kept
    // the server's zone would report the 5th here and look fine.
    expect(reminderFormatters("pt-BR", TOKYO).formatLocalInput(INSTANT)).toBe("2026-12-06T08:30");
  });

  it("gives the wall clock alone", () => {
    expect(reminderFormatters("pt-BR", SAO_PAULO).formatLocalTime(INSTANT)).toBe("20:30");
  });

  it("keeps all three in agreement, so one cannot lose the zone alone", () => {
    const { formatInstant, formatLocalInput, formatLocalTime } = reminderFormatters("pt-BR", TOKYO);
    const local = formatLocalInput(INSTANT);
    expect(formatLocalTime(INSTANT)).toBe(local.slice(-5));
    expect(formatInstant(INSTANT)).toContain(local.slice(-5));
  });

  it("uses a 24-hour clock for the input value regardless of locale", () => {
    // `datetime-local` has one grammar; an `en` reader must not get "08:30 PM".
    expect(reminderFormatters("en", SAO_PAULO).formatLocalInput(INSTANT)).toBe("2026-12-05T20:30");
  });
});
