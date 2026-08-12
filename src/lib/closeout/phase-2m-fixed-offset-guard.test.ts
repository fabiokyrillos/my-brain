/**
 * `2M-TIME-007` — no fixed offset, no fixed day length, no host zone.
 *
 * The requirement asks for three absences **and for the surfaces they apply to
 * to be named**, which is why the corpus below is a list rather than a glob: a
 * guard whose reach nobody can state is a guard whose reach quietly shrinks.
 *
 * ## Why these three, specifically
 *
 * Each has already been a defect in this repository, and none of them announces
 * itself:
 *
 * - **A fixed day length.** `24 * 60 * 60 * 1000` is wrong twice a year in every
 *   zone that observes DST, and wrong in a way that produces a plausible date.
 *   `localDayLengthHours` exists because a local day is 23 or 25 hours twice a
 *   year and the calendar has to say so.
 * - **A fixed offset.** `getTimezoneOffset()` reads the **host's** offset, which
 *   on a server is UTC and on a laptop is whatever the developer's laptop says.
 *   Slice 2M.0 found three implementations of "what local day is it", two of
 *   them wrong in opposite directions.
 * - **The host's zone.** `new Intl.DateTimeFormat(locale, { … })` with no
 *   `timeZone` renders in the host's zone — UTC on the server. That is not a
 *   hypothetical: slice 2M.3 found the notification list doing exactly this
 *   while four neighbouring surfaces had carried the owner's zone since 2M.1,
 *   so changing the timezone in settings moved four surfaces and left one.
 *
 * ## What is exempt, and why that is not a hole
 *
 * `src/lib/time/local-day.ts` is **the** contract. It is the one module allowed
 * to do this arithmetic, and it is excluded here because a guard that forbade it
 * there would forbid the correct implementation along with the incorrect copies.
 * Test files are excluded because a test is entitled to construct the wrong
 * value in order to prove it is refused — several do.
 *
 * One observation recorded rather than changed: `planner-view.tsx` carries its
 * own `shiftDay`, a **second** implementation of calendar-day arithmetic. It is
 * correct — `Date.UTC(y, m, d + delta)` is civil-date arithmetic and DST-safe —
 * and it violates none of the three absences, so `2M-TIME-007` does not reach
 * it and this guard deliberately does not invent a fourth rule to catch it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The surfaces `2M-TIME-007` applies to, named.
 *
 * Every directory Phase 2M shipped a dated surface into, plus the two routes
 * that render one. `daily-cycle` is here because the Work and Hoje projections
 * reduce instants to the owner's local day and 2M.1 moved them onto the
 * contract; leaving them out would exempt the surfaces the defect was found on.
 */
const NAMED_SURFACES = [
  "src/features/calendar",
  "src/features/planning",
  "src/features/day-review",
  "src/features/daily-cycle",
  "src/features/notifications",
  "src/app/[locale]/app/calendar",
  "src/app/[locale]/app/reviews",
  "src/app/[locale]/app/notifications",
] as const;

/** The contract itself, which is the one module entitled to this arithmetic. */
const CONTRACT = "src/lib/time/local-day.ts";

/**
 * Four surfaces that **still render an instant in the host's zone**, found by
 * this guard on 2026-08-12 and recorded rather than repaired.
 *
 * They are the same defect slice 2M.3 fixed on the notification list —
 * `new Intl.DateTimeFormat(locale, { dateStyle, timeStyle })` with no
 * `timeZone`, which on a server is UTC — and they are **not** repaired here
 * because the repair is a product change across two routes, `home-view.tsx`,
 * `needs-attention-list.tsx` and roughly twenty-seven component call sites, in a
 * slice whose authorization is closeout. Doing it quietly inside a closing
 * commit is how a phase's last change becomes its riskiest.
 *
 * **The exemption cannot outlive the defect.** The test below asserts that every
 * entry still contains it, so the day one is fixed this guard fails until the
 * name is removed — the opposite of an allowlist that silently keeps a repaired
 * file exempt.
 *
 * Destination: `docs/initiatives/push-hardware-validation/` §4, and `docs/TODO.md`.
 */
const HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE = [
  "src/features/daily-cycle/entry-review.tsx",
  "src/features/daily-cycle/inbox-item.tsx",
  "src/features/daily-cycle/needs-attention-item.tsx",
  "src/features/daily-cycle/technical-details.tsx",
] as const;

function isCarriedPastClose(path: string): boolean {
  return HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE.some(
    (relative) => path.endsWith(join(...relative.split("/"))),
  );
}

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

/** Comments stripped, so a paragraph describing the defect is not the defect. */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export type TimeHazard = { readonly name: string; readonly pattern: RegExp };

export const TIME_HAZARDS: readonly TimeHazard[] = [
  { name: "a fixed day length", pattern: /\b24\s*\*\s*60\s*\*\s*60\s*\*\s*1_?000\b|\b1_?000\s*\*\s*60\s*\*\s*60\s*\*\s*24\b|\b86_?400_?000\b/ },
  { name: "the host's offset", pattern: /getTimezoneOffset\s*\(/ },
  {
    name: "the host's zone, through a local Date reader",
    pattern: /\.\s*get(FullYear|Month|Date|Day|Hours|Minutes|Seconds)\s*\(\s*\)/,
  },
  { name: "the host's zone, through toLocale*", pattern: /\.toLocale(Date|Time)?String\s*\(/ },
];

/**
 * `Intl.DateTimeFormat(` whose options do not name a zone.
 *
 * The options object is taken up to its closing brace by depth, so a nested
 * option cannot end the search early and a multi-line call is read whole.
 */
export function formattersWithoutZone(source: string): number {
  let found = 0;
  for (const match of source.matchAll(/Intl\.DateTimeFormat\s*\(/g)) {
    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
      if (source[index] === "(") depth += 1;
      else if (source[index] === ")") depth -= 1;
      index += 1;
    }
    if (!/timeZone/.test(source.slice(match.index, index))) found += 1;
  }
  return found;
}

const corpus = NAMED_SURFACES.flatMap((surface) => walk(join(process.cwd(), surface)))
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .filter((path) => !/\.test\.tsx?$/.test(path))
  .filter((path) => !path.endsWith(join(...CONTRACT.split("/"))));

describe("2M-TIME-007: the phase's dated surfaces use no fixed offset, day length or host zone", () => {
  it("names a corpus, and finds it", () => {
    // Every one of the eight surfaces must contribute, or the list has drifted
    // from the tree and the guard is narrower than the sentence describing it.
    for (const surface of NAMED_SURFACES) {
      const prefix = join(process.cwd(), surface);
      expect(corpus.some((path) => path.startsWith(prefix)), `${surface} contributes no file`).toBe(true);
    }
    expect(corpus.length).toBeGreaterThan(30);
  });

  it.each(corpus)("%s reaches for none of the three", (path) => {
    const source = withoutComments(readFileSync(path, "utf8"));
    for (const hazard of TIME_HAZARDS) {
      expect(hazard.pattern.test(source), `${path} uses ${hazard.name}`).toBe(false);
    }
    if (isCarriedPastClose(path)) return;
    expect(formattersWithoutZone(source), `${path} formats an instant with no timeZone`).toBe(0);
  });

  it("keeps the carried-past-close list exactly as long as the defect lasts", () => {
    /*
     * The half that makes an exemption honest. Each named file must STILL format
     * an instant without a zone; the moment one is repaired this fails and the
     * name has to come out. An allowlist that keeps a fixed file exempt is how a
     * guard's reach shrinks by accident.
     */
    for (const relative of HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE) {
      const source = withoutComments(readFileSync(join(process.cwd(), relative), "utf8"));
      expect(
        formattersWithoutZone(source),
        `${relative} no longer formats without a zone — remove it from the carried-past-close list`,
      ).toBeGreaterThan(0);
      expect(corpus.some((path) => isCarriedPastClose(path)), "the list names no file in the corpus")
        .toBe(true);
    }
    // The count is asserted so a fifth surface cannot join quietly.
    expect(HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE.length).toBe(4);
  });

  it("fires on each hazard, and not on the correct forms beside them", () => {
    /*
     * The mutation control. Every assertion above is an absence, and an absence
     * passes trivially the moment a pattern stops matching — which is how a
     * corpus scan dies without anybody noticing.
     */
    const fires = (source: string) => TIME_HAZARDS.filter((hazard) => hazard.pattern.test(source)).map((h) => h.name);

    expect(fires("const tomorrow = now + 24 * 60 * 60 * 1000;")).toEqual(["a fixed day length"]);
    expect(fires("const tomorrow = now + 86_400_000;")).toEqual(["a fixed day length"]);
    expect(fires("const offset = new Date().getTimezoneOffset();")).toEqual(["the host's offset"]);
    expect(fires("const day = at.getDate();")).toEqual(["the host's zone, through a local Date reader"]);
    expect(fires("at.toLocaleDateString(locale)")).toEqual(["the host's zone, through toLocale*"]);

    // The correct forms, which must stay silent or the guard would push authors
    // off the contract it exists to protect.
    expect(fires("const parts = zonedParts(instant, timeZone);")).toEqual([]);
    expect(fires("shifted.getUTCFullYear()")).toEqual([]);
    expect(fires("addLocalDays(parsed, 1)")).toEqual([]);
    expect(fires("localDayBoundsForDate(date, timeZone)")).toEqual([]);

    // And the formatter check, both ways.
    expect(formattersWithoutZone('new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(at)')).toBe(1);
    expect(
      formattersWithoutZone('new Intl.DateTimeFormat(locale, {\n  dateStyle: "short",\n  timeZone,\n}).format(at)'),
    ).toBe(0);
  });

  it("strips comments before reading, so describing a defect is not committing one", () => {
    // `page.tsx` under `app/notifications` documents the exact call that was
    // wrong, in prose. A guard that read its own documentation as code would
    // teach the next author to delete the explanation.
    expect(withoutComments('/* was: at.toLocaleDateString(locale) */\nconst x = 1;'))
      .not.toMatch(/toLocaleDateString/);
    expect(withoutComments("const x = at.toLocaleDateString(locale);")).toMatch(/toLocaleDateString/);
  });
});
