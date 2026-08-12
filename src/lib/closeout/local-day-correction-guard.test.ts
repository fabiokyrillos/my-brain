import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `LDC-GUARD-001` — **the whole tree**, not eight named directories.
 *
 * ## Why a second guard, when `2M-TIME-007` already exists
 *
 * `phase-2m-fixed-offset-guard.test.ts` names a corpus of eight surfaces,
 * deliberately: the requirement it enforces asked for the surfaces to be stated,
 * and a guard whose reach nobody can state is a guard whose reach quietly
 * shrinks. That was right for a phase.
 *
 * It was also, by construction, blind to everything outside those eight
 * directories — and that is where the defect actually lived. The census this
 * initiative ran against `main` found **seventeen** formatters rendering a
 * stored instant with no `timeZone` across sixteen files, and **thirteen of them
 * were outside the Phase 2M corpus**: the person page, the project page, the
 * memory detail, the entry detail, the file list, the conversation list, the
 * question panels, search, conversation sources, and the Home header.
 *
 * Four were inside it, and had been recorded as `HOST_ZONE_FORMATTERS_CARRIED_
 * PAST_CLOSE` — honestly labelled and deferred. The other thirteen were not
 * deferred. They were **invisible**, because nothing looked there.
 *
 * So this guard's corpus is `src/`, minus tests and minus the contract itself.
 *
 * ## The four families, and why each is tree-wide with no false positives
 *
 * Every family below reaches **zero** occurrences by the end of this initiative.
 * That is what makes a tree-wide rule affordable: none of them needs a standing
 * allowlist, so none of them can be widened to make a failure go away.
 *
 * - **A formatter with no zone.** `new Intl.DateTimeFormat(locale, { … })`
 *   renders in the *host's* zone — UTC on a server, the device's zone in a
 *   browser. Detected by reading the call's option object to its matching brace,
 *   so a multi-line call is read whole and a nested option cannot end the search
 *   early.
 * - **A host-zone field read or write.** `.getDate()`, `.setHours(0,0,0,0)` and
 *   their neighbours operate on the *host's* calendar. `getUTC*`/`setUTC*` are
 *   not matched: UTC-anchored civil arithmetic is how the contract itself shifts
 *   a date, and a rule that forbade it would push authors off the contract it
 *   exists to protect. This family is also what catches `new Date()` used as
 *   "today" — a bare `new Date()` is an ordinary instant and perfectly legal;
 *   what makes it a *day* is reading its host-zone fields, which is the thing
 *   actually detected here.
 * - **A UTC date string used as a local day.** `toISOString().slice(0, 10)` is
 *   the UTC calendar date, which is the user's only by coincidence. The pattern
 *   is anchored to the **day-shaped** slice: `slice(0, 19)` canonicalizing an
 *   *instant* and `slice(11, 16)` taking a clock are different operations and
 *   are not matched.
 * - **A zone round-trip through a formatted string.**
 *   `new Date(new Date(ms).toLocaleString("en-US", { timeZone }))` re-parses a
 *   formatted date with the *host's* parser to fake a local `Date`. It carries a
 *   zone and still produces the wrong instant, which is why `timeZone` being
 *   present is not enough to clear it.
 *
 * ## What keeps the exemptions honest
 *
 * Each entry names a file, a family and an **exact count**. The count is
 * asserted in both directions: an entry that no longer holds the defect fails
 * until it is deleted, and an entry that grew a new occurrence fails too. An
 * allowlist that silently kept a repaired file exempt is how a guard's reach
 * shrinks by accident; an allowlist that absorbed a *new* defect into an old
 * exemption is how it shrinks on purpose.
 */

const REPO = process.cwd();

/** The contract modules, which are the ones entitled to this arithmetic. */
const CONTRACT = [
  "src/lib/time/local-day.ts",
  "src/lib/time/instant-format.ts",
  "src/lib/time/owner-timezone.ts",
];

/** Blank comments but keep every newline, so a reported line is a real line. */
export function blankComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead: string) => lead + blank(match.slice(lead.length)));
}

export type HazardFamily =
  | "formatter-without-zone"
  | "host-zone-field"
  | "utc-day-slice"
  | "zone-round-trip";

/**
 * `Intl.DateTimeFormat(` whose options never name a zone.
 *
 * Brace-free and depth-counted on parentheses, because the option object is an
 * argument: reading to the call's own closing paren takes the whole options
 * literal however many lines it spans.
 */
export function formattersWithoutZone(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(/Intl\.DateTimeFormat\s*\(/g)) {
    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
      if (source[index] === "(") depth += 1;
      else if (source[index] === ")") depth -= 1;
      index += 1;
    }
    if (!/timeZone/.test(source.slice(match.index, index))) {
      lines.push(source.slice(0, match.index).split("\n").length);
    }
  }
  return lines;
}

const PATTERNS: Record<Exclude<HazardFamily, "formatter-without-zone">, RegExp> = {
  // Getters take no argument; setters do. `getUTC*`/`setUTC*` never match,
  // because the capture group is anchored directly after `get`/`set`.
  "host-zone-field":
    /\.\s*get(FullYear|Month|Date|Day|Hours|Minutes|Seconds)\s*\(\s*\)|\.\s*set(FullYear|Month|Date|Hours|Minutes|Seconds)\s*\(/g,
  // The day-shaped slice only: `slice(0, 10)`, `substring(0, 10)`, `split("T")[0]`.
  "utc-day-slice":
    /toISOString\s*\(\s*\)\s*\.\s*(?:slice|substring)\s*\(\s*0\s*,\s*10\s*\)|toISOString\s*\(\s*\)\s*\.\s*split\s*\(\s*["'`]T["'`]\s*\)\s*\[\s*0\s*\]/g,
  "zone-round-trip": /\.toLocale(?:Date|Time)?String\s*\(/g,
};

export function hazardLines(source: string, family: Exclude<HazardFamily, "formatter-without-zone">): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(PATTERNS[family])) {
    lines.push(source.slice(0, match.index).split("\n").length);
  }
  return lines;
}

export function occurrences(source: string, family: HazardFamily): number[] {
  return family === "formatter-without-zone" ? formattersWithoutZone(source) : hazardLines(source, family);
}

export const HAZARD_FAMILIES: readonly HazardFamily[] = [
  "formatter-without-zone",
  "host-zone-field",
  "utc-day-slice",
  "zone-round-trip",
];

/**
 * Every occurrence still standing, by file, family and exact count.
 *
 * This is the initiative's census, transcribed. It is emptied unit by unit —
 * `daily-cycle` first, then the contextual pages, then agent/search/shell — and
 * the initiative does not close while a single row remains.
 */
export type Exemption = {
  readonly file: string;
  readonly family: HazardFamily;
  readonly count: number;
  /** The unit that removes it, so a stalled row has a name attached. */
  readonly unit: 2 | 3 | 4;
};

export const OPEN_OCCURRENCES: readonly Exemption[] = [
  // Unit 2 — DISCHARGED. The four Phase 2M carried past its own close now render
  // in the owner's zone through `formatInstant`, and Phase 2M's
  // `HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE` list is empty and retired with them.

  // Unit 3 — DISCHARGED. The seven contextual call sites now stamp through the
  // contract, six of them from `getOwnerTimeZone()` and the entry detail from
  // the zone its own projection already carried.

  // Unit 4 — agent, search, shell, conversation sources, and the three families
  // the census surfaced beyond the seventeen formatters.
  { file: "src/features/agent/actions.ts", family: "formatter-without-zone", count: 1, unit: 4 },
  { file: "src/features/agent/question-outcome-panel.tsx", family: "formatter-without-zone", count: 1, unit: 4 },
  { file: "src/features/agent/question-preview-panels.tsx", family: "formatter-without-zone", count: 1, unit: 4 },
  { file: "src/features/conversation-sources/source-list.tsx", family: "formatter-without-zone", count: 1, unit: 4 },
  { file: "src/features/search/search-surface.tsx", family: "formatter-without-zone", count: 1, unit: 4 },
  { file: "src/features/shell/home-dashboard.tsx", family: "formatter-without-zone", count: 1, unit: 4 },

  { file: "src/features/agent/actions.ts", family: "host-zone-field", count: 7, unit: 4 },
  { file: "src/features/agent/actions.ts", family: "utc-day-slice", count: 2, unit: 4 },
  { file: "src/features/planning/planner-view.tsx", family: "utc-day-slice", count: 1, unit: 4 },
  { file: "src/features/task-commands/detail-controls.ts", family: "utc-day-slice", count: 1, unit: 4 },

  { file: "src/features/byok/credential-panel.tsx", family: "zone-round-trip", count: 1, unit: 4 },
  { file: "src/features/operations/actions.ts", family: "zone-round-trip", count: 1, unit: 4 },
  { file: "src/features/task-commands/detail-actions.ts", family: "zone-round-trip", count: 1, unit: 4 },
];

/**
 * Every module that decides for itself whether a zone is usable.
 *
 * The census set out to count formatters and found this instead: **four**
 * private answers to "is this zone usable", outside the contract. Three are
 * byte-identical `isValidTimeZone` predicates; the fourth,
 * `resolveProfileTimezone`, is a *resolver* with its own hardcoded default
 * string, and it is looser than all of them.
 *
 * They agree about `America/Sao_Paulo` and disagree about everything that
 * matters, which is why nobody noticed. Unit 4 replaces all four with
 * `resolveOwnerTimeZone`, and this list empties with them — recorded here rather
 * than promised in prose, because a consolidation nothing asserts is a
 * consolidation that half-happens.
 */
export const DUPLICATE_ZONE_RESOLVERS: readonly { readonly file: string; readonly symbol: string }[] = [
  { file: "src/features/operations/actions.ts", symbol: "isValidTimeZone" },
  { file: "src/features/task-commands/actions.ts", symbol: "isValidTimeZone" },
  { file: "src/features/task-commands/detail-actions.ts", symbol: "isValidTimeZone" },
  { file: "src/features/daily-cycle/review-projection.ts", symbol: "resolveProfileTimezone" },
];

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

const corpus = walk(join(REPO, "src"))
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .filter((path) => !/\.test\.tsx?$/.test(path))
  .filter((path) => !CONTRACT.some((contract) => path.endsWith(contract.split("/").join(sep))))
  .map((path) => relative(REPO, path).split(sep).join("/"));

const allowed = new Map<string, number>(
  OPEN_OCCURRENCES.map((entry) => [`${entry.file}::${entry.family}`, entry.count]),
);

const read = (file: string) => blankComments(readFileSync(join(REPO, file), "utf8"));

describe("LDC-GUARD-001: no surface reaches for the host's zone", () => {
  it("takes the whole tree as its corpus, not a named list", () => {
    // The claim that distinguishes this guard from the phase one it supplements.
    // If a future edit narrows the walk, these fail rather than passing quietly
    // on a corpus that no longer contains the files the census found.
    expect(corpus.length).toBeGreaterThan(400);
    for (const area of [
      "src/app/[locale]/app/people",
      "src/app/[locale]/app/projects",
      "src/features/agent",
      "src/features/search",
      "src/features/shell",
      "src/features/conversation-sources",
      "src/features/daily-cycle",
      "src/features/byok",
    ]) {
      expect(corpus.some((file) => file.startsWith(area)), `${area} contributes no file`).toBe(true);
    }
  });

  it.each(corpus)("%s", (file) => {
    const source = read(file);
    for (const family of HAZARD_FAMILIES) {
      const lines = occurrences(source, family);
      const budget = allowed.get(`${file}::${family}`) ?? 0;
      expect(
        lines.length,
        budget === 0
          ? `${file} uses ${family} at line(s) ${lines.join(", ")} — use the contract in src/lib/time/`
          : `${file} has ${lines.length} ${family} occurrence(s) at line(s) ${lines.join(", ")}, `
            + `but the census recorded ${budget}. Update OPEN_OCCURRENCES deliberately, never to go green.`,
      ).toBe(budget);
    }
  });

  it("keeps every open occurrence exactly as long as the defect lasts", () => {
    /*
     * The half that makes the list honest, and the reason it is called
     * OPEN_OCCURRENCES rather than an allowlist. A repaired file fails here
     * until its row is deleted — the opposite of an exemption that outlives what
     * it excused. `2M-TIME-007` learned this the hard way and the rule is
     * carried forward rather than reinvented.
     */
    for (const entry of OPEN_OCCURRENCES) {
      const lines = occurrences(read(entry.file), entry.family);
      expect(
        lines.length,
        `${entry.file} no longer has ${entry.count} ${entry.family} occurrence(s) `
          + `(found ${lines.length}) — remove the row from OPEN_OCCURRENCES`,
      ).toBe(entry.count);
      expect(corpus, `${entry.file} is exempted but is not in the corpus`).toContain(entry.file);
    }
  });

  it("records what the census found, so the list cannot shrink by editing", () => {
    // The seventeen formatters in sixteen files, and the three further families.
    // These totals are the initiative's baseline; they go to zero and the
    // assertions below go with them.
    const formatters = OPEN_OCCURRENCES.filter((e) => e.family === "formatter-without-zone");
    // 17 across 16 files at the census; Units 2 and 3 repaired eleven.
    expect(formatters.reduce((sum, e) => sum + e.count, 0)).toBe(6);
    expect(new Set(formatters.map((e) => e.file)).size).toBe(6);

    const byUnit = (unit: number) =>
      OPEN_OCCURRENCES.filter((e) => e.unit === unit).reduce((sum, e) => sum + e.count, 0);
    expect(byUnit(2), "Unit 2 discharged the four daily-cycle formatters").toBe(0);
    expect(byUnit(3), "Unit 3 discharged the contextual pages").toBe(0);
    // Six formatters, plus the three families the census surfaced beyond them:
    // seven host-zone field operations in one review computation, four UTC day
    // slices, three zone round-trips.
    expect(byUnit(4), "agent, search, shell, sources, plus the three further families").toBe(20);

    const byFamily = (family: HazardFamily) =>
      OPEN_OCCURRENCES.filter((e) => e.family === family).reduce((sum, e) => sum + e.count, 0);
    expect(byFamily("host-zone-field")).toBe(7);
    expect(byFamily("utc-day-slice")).toBe(4);
    expect(byFamily("zone-round-trip")).toBe(3);
    // 31 at the census, less the eleven Units 2 and 3 discharged. This reaches 0.
    expect(OPEN_OCCURRENCES.reduce((sum, e) => sum + e.count, 0), "the initiative's remaining debt").toBe(20);
  });
});

describe("LDC-CONTRACT-001: the zone is decided in one place, and the copies are counted", () => {
  it("finds no zone predicate this list does not already name", () => {
    /*
     * Tree-wide, so a fifth private answer cannot appear while the four known
     * ones are being removed. The contract's own `isSupportedTimeZone` and the
     * resolver built on it are the two allowed to exist.
     */
    const declaration = /(?:function|const)\s+(\w*(?:TimeZone|Timezone|TimeZones)\w*)\s*[(=]/g;
    const found: string[] = [];
    for (const file of corpus) {
      for (const match of read(file).matchAll(declaration)) {
        const symbol = match[1];
        if (!/valid|supported|resolve/i.test(symbol)) continue;
        found.push(`${file}::${symbol}`);
      }
    }
    const expected = DUPLICATE_ZONE_RESOLVERS.map((entry) => `${entry.file}::${entry.symbol}`);
    expect(
      found.sort(),
      "a zone predicate appeared or disappeared — update DUPLICATE_ZONE_RESOLVERS deliberately",
    ).toEqual(expected.sort());
  });

  it("keeps each duplicate listed exactly as long as it exists", () => {
    // The same two-directional honesty the occurrence list has: a copy that is
    // gone fails here until its row is deleted.
    for (const entry of DUPLICATE_ZONE_RESOLVERS) {
      expect(
        read(entry.file),
        `${entry.symbol} is gone from ${entry.file} — remove the row from DUPLICATE_ZONE_RESOLVERS`,
      ).toMatch(new RegExp(`function\\s+${entry.symbol}\\b`));
    }
    expect(DUPLICATE_ZONE_RESOLVERS.length, "four copies, until Unit 4 removes them").toBe(4);
  });

  it("has the fourth copy be the loosest, which is why counting them mattered", () => {
    // `resolveProfileTimezone` is not an `isValidTimeZone` clone: it is a
    // resolver with its own hardcoded default, and it accepts a bare
    // abbreviation that carries no DST rule. Asserted so the difference is not
    // rediscovered during the consolidation.
    const source = read("src/features/daily-cycle/review-projection.ts");
    expect(source).toMatch(/return "America\/Sao_Paulo";/);
    expect(source, "it validates by construction alone, with no IANA-shape rule").not.toMatch(
      /includes\("\/"\)/,
    );
  });
});

describe("LDC-GUARD-001: the detector fires on each family, and stays silent beside it", () => {
  /*
   * The mutation control. Every assertion above is an absence, and an absence
   * passes trivially the moment a pattern stops matching — which is how a corpus
   * scan dies without anybody noticing. Each family is planted here in the exact
   * shape this repository writes it, and the *correct* form beside it must stay
   * silent, or the guard would push authors away from the contract.
   */

  const fires = (source: string, family: HazardFamily) => occurrences(source, family).length;

  it("fires on a formatter with no zone, and not on one that carries it", () => {
    expect(fires('new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(at)', "formatter-without-zone")).toBe(1);
    expect(fires('new Intl.DateTimeFormat(locale, {\n  dateStyle: "short",\n  timeStyle: "short",\n}).format(at)', "formatter-without-zone")).toBe(1);
    expect(fires('new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone }).format(at)', "formatter-without-zone")).toBe(0);
    expect(fires('new Intl.DateTimeFormat(locale, {\n  dateStyle: "short",\n  timeZone: profile.timezone,\n}).format(at)', "formatter-without-zone")).toBe(0);
    // The contract's own helpers are the correct form and must never fire.
    expect(fires('formatInstant(entry.occurredAt, "day", locale, timeZone)', "formatter-without-zone")).toBe(0);
    expect(fires('instantFormatter("dayAndTime", locale, timeZone)', "formatter-without-zone")).toBe(0);
  });

  it("fires on host-zone field access, and not on UTC-anchored civil arithmetic", () => {
    expect(fires("const day = at.getDate();", "host-zone-field")).toBe(1);
    expect(fires("const weekday = now.getDay();", "host-zone-field")).toBe(1);
    expect(fires("start.setHours(0, 0, 0, 0);", "host-zone-field")).toBe(1);
    expect(fires("start.setDate(now.getDate() - day);", "host-zone-field")).toBe(2);
    expect(fires("new Date(now.getFullYear(), now.getMonth(), 1)", "host-zone-field")).toBe(2);

    // The correct forms. `getUTC*`/`setUTC*` are how the contract shifts a civil
    // date, and a bare `new Date()` is an instant, not a day.
    expect(fires("shifted.getUTCFullYear()", "host-zone-field")).toBe(0);
    expect(fires("rounded.setUTCSeconds(0, 0);", "host-zone-field")).toBe(0);
    expect(fires("Date.UTC(year, month - 1, day + delta)", "host-zone-field")).toBe(0);
    expect(fires("const now = new Date();", "host-zone-field")).toBe(0);
    expect(fires("localDayBounds(new Date(), timeZone)", "host-zone-field")).toBe(0);
  });

  it("fires on a UTC day slice, and not on an instant or a clock slice", () => {
    expect(fires("const startDate = start.toISOString().slice(0, 10);", "utc-day-slice")).toBe(1);
    expect(fires("value.toISOString().substring(0, 10)", "utc-day-slice")).toBe(1);
    expect(fires('at.toISOString().split("T")[0]', "utc-day-slice")).toBe(1);

    // Canonicalizing an instant and reading a clock are different operations.
    expect(fires("const canonical = `${rounded.toISOString().slice(0, 19)}Z`;", "utc-day-slice")).toBe(0);
    expect(fires("return now.toISOString().slice(11, 16);", "utc-day-slice")).toBe(0);
    expect(fires("query.lt('due_at', nextDay.toISOString())", "utc-day-slice")).toBe(0);
    // The contract's answer to the same question.
    expect(fires("formatLocalDate(localDateOf(now, timeZone))", "utc-day-slice")).toBe(0);
  });

  it("fires on a zone round-trip, including one that carries a zone", () => {
    expect(fires('new Date(new Date(nowMs).toLocaleString("en-US", { timeZone }))', "zone-round-trip")).toBe(1);
    expect(fires("at.toLocaleDateString(locale)", "zone-round-trip")).toBe(1);
    expect(fires("at.toLocaleTimeString(locale, { timeZone })", "zone-round-trip")).toBe(1);
    expect(fires("formatInstant(at, 'day', locale, timeZone)", "zone-round-trip")).toBe(0);
  });

  it("reads code, not prose, and reports true line numbers", () => {
    // A guard that read its own documentation as code would teach the next
    // author to delete the explanation. Blanking preserves newlines, so the
    // line a failure names is the line a reader opens.
    expect(blankComments('/* was: at.toLocaleDateString(locale) */\nconst x = 1;')).not.toMatch(/toLocaleDateString/);
    expect(blankComments("// at.getDate() was here\nconst x = 1;")).not.toMatch(/getDate/);
    expect(blankComments("const x = at.toLocaleDateString(locale);")).toMatch(/toLocaleDateString/);
    // A URL's `//` must not swallow the rest of the line.
    expect(blankComments('const url = "https://example.test/x"; const d = at.getDate();')).toMatch(/getDate/);

    const planted = "const a = 1;\n\n\nconst day = at.getDate();";
    expect(occurrences(blankComments(planted), "host-zone-field")).toEqual([4]);
  });
});
