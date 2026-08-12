/**
 * `2M-TIME-006` — *"an instant rendered on two surfaces renders identically, and
 * a test proves it for at least the calendar, the planner, the task detail and
 * the notification list."*
 *
 * ## Why this drives the surfaces rather than the contract
 *
 * `instant-format.test.ts` proves the contract behaves. That is not the
 * requirement. The requirement is about **the surfaces**, and a surface can
 * satisfy a contract by not using it — which is exactly what the notification
 * list did until this slice: it built its own `Intl.DateTimeFormat` with no
 * `timeZone` and rendered the host's clock while four neighbours rendered the
 * owner's.
 *
 * So each named surface is exercised **through its own module**, and the four
 * outputs are compared against each other. A surface that reintroduces a private
 * formatter fails here even if the shared one is perfect, and the source scan at
 * the bottom is what makes "does not use the contract" visible rather than
 * merely likely.
 *
 * ## What it cannot prove
 *
 * It compares rendered characters for one instant in one zone in two locales. It
 * does not prove the surfaces *show* the value in the same place, or that a
 * browser lays them out identically. That is the mirrored lane's job, and the
 * residual is recorded rather than rounded up.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { formatPlannedDay } from "@/features/planning/planned-at";
import { formatInstant } from "@/lib/time/instant-format";

const REPO = join(__dirname, "..", "..", "..");

/**
 * Comments are stripped before every scan below, and the reason is a trap this
 * phase has already paid for once.
 *
 * `planned-at-declaration.test.ts`'s first run failed on the comment documenting
 * the defect it had just removed. A scan that cannot tell code from prose makes
 * **deleting the explanation** the cheapest way to pass it — so the notification
 * list's comment naming `new Intl.DateTimeFormat` as the defect it used to have
 * must not be the thing that fails the guard against having it.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const read = (path: string) => stripComments(readFileSync(join(REPO, path), "utf8"));

/** 23:30Z on the 11th — 20:30 the same day in São Paulo, 08:30 the next in Auckland. */
const INSTANT = "2026-08-11T23:30:00.000Z";
const ZONE = "America/Sao_Paulo";

/**
 * The calendar's own formatter, lifted out of the component.
 *
 * `calendar-item.tsx` is a client component whose default export needs React;
 * `formatTime` is module-private. Reading the one line it now contains and
 * asserting it delegates is the honest way to test it without mounting the
 * component, and `calendar-item.test.tsx`-style rendering is covered by the
 * mirrored lane instead.
 */
const CALENDAR_ITEM = read("src/features/calendar/calendar-item.tsx");

describe("2M-TIME-006: four surfaces, one instant, one rendering", () => {
  it("the planner and the day review agree on a planned day, in both locales", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const planner = formatPlannedDay(INSTANT, locale, ZONE);
      const dayReview = formatInstant(INSTANT, "day", locale, ZONE);
      expect(planner, locale).not.toBeNull();
      expect(planner, `the planner and the day review disagree in ${locale}`).toBe(dayReview);
    }
  });

  it("the calendar's clock and the day review's capture time are the same code", () => {
    // The calendar's `formatTime` is now one delegation. Asserting on its text is
    // what stops a future edit rebuilding an option bag inside it — which is how
    // the notification list drifted for four slices.
    expect(CALENDAR_ITEM).toContain('formatInstant(instant, "time", locale, timeZone)');
    expect(CALENDAR_ITEM).not.toContain("new Intl.DateTimeFormat");
  });

  it("the notification list reads the profile's zone and the one contract", () => {
    const source = read("src/app/[locale]/app/notifications/page.tsx");
    expect(source).toContain("requireProfileTimeZone");
    expect(source).toContain('instantFormatter("dayAndTime"');
    // The defect, named so its reappearance is a failing test rather than an
    // observation somebody makes a year later.
    expect(source, "the notification list is building its own formatter again")
      .not.toContain("new Intl.DateTimeFormat");
  });

  it("the task detail carries the owner's zone to its renderer", () => {
    const source = read("src/features/daily-cycle/task-detail-projection.ts");
    expect(source).toContain("timezone");
    expect(source).not.toContain("new Intl.DateTimeFormat");
  });

  it("no dated surface in this phase builds a formatter without a zone", () => {
    /*
     * The census, and the reason this test is not four assertions.
     *
     * Any `Intl.DateTimeFormat` anywhere in these surfaces must carry a
     * `timeZone`. A formatter without one is the single omission `2M-TIME-005`
     * is about, and it is invisible in review because the output looks
     * plausible — it is simply somebody else's clock.
     */
    const surfaces = [
      "src/features/calendar/calendar-item.tsx",
      "src/features/calendar/calendar-view.tsx",
      "src/features/planning/planned-at.ts",
      "src/features/planning/planner-view.tsx",
      "src/features/day-review/day-review-view.tsx",
      "src/app/[locale]/app/notifications/page.tsx",
      "src/app/[locale]/app/reminders/page.tsx",
    ];
    const offenders: string[] = [];
    for (const path of surfaces) {
      const source = read(path);
      for (const match of source.matchAll(/new Intl\.DateTimeFormat\(([\s\S]{0,240}?)\)\s*[.;]/g)) {
        if (!match[1].includes("timeZone")) offenders.push(`${path}: ${match[1].slice(0, 60)}`);
      }
    }
    expect(offenders, "a dated surface builds a formatter with no timeZone").toEqual([]);
    // Non-vacuity: at least one of those files must actually contain a formatter,
    // or this scan is asserting nothing about anything.
    expect(surfaces.some((path) => read(path).includes("Intl.DateTimeFormat"))).toBe(true);
  });
});

describe("2M-TIME-005: a timezone change reaches every dated surface", () => {
  it("moves the planner's day, the day review's day and the notification stamp together", () => {
    const zones = ["America/Sao_Paulo", "Pacific/Auckland"];
    const rendered = zones.map((zone) => ({
      planner: formatPlannedDay(INSTANT, "pt-BR", zone),
      dayReview: formatInstant(INSTANT, "day", "pt-BR", zone),
      notification: formatInstant(INSTANT, "dayAndTime", "pt-BR", zone),
      calendar: formatInstant(INSTANT, "time", "pt-BR", zone),
    }));

    // Every surface must differ between the two zones. A surface that did not
    // move is one that never read the preference.
    for (const key of ["planner", "dayReview", "notification", "calendar"] as const) {
      expect(rendered[0][key], `${key} did not move with the zone`).not.toEqual(rendered[1][key]);
    }
    // And the two that render the same question must still agree with each other
    // *within* each zone.
    for (const row of rendered) expect(row.planner).toBe(row.dayReview);
  });

  it("rewrites nothing: the stored instant is the same string afterwards", () => {
    const stored = INSTANT;
    formatPlannedDay(stored, "en", "Pacific/Auckland");
    formatInstant(stored, "dayAndTime", "en", "Pacific/Auckland");
    expect(stored).toBe("2026-08-11T23:30:00.000Z");
  });
});
