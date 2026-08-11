import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `2M-TIME-001` — **one** definition of the user's local day, and it stays one.
 *
 * ## Why the guard, and not just the module
 *
 * There were three. `today-priorities.ts` computed `end = start + 24h`;
 * `work-projection.ts` computed `startOfToday = startOfNextLocalDay − 24h`; and
 * `run_user_heartbeat` computed both edges from the local calendar and was
 * right. The two TypeScript copies were wrong in **opposite** directions, by the
 * same assumption, and they coexisted for months because each was asked a
 * different question on a different surface.
 *
 * A calendar day column and a notification about that day ask the same question,
 * so a fourth copy is not a style problem — it is the defect returning. This
 * fails the build on one.
 *
 * ## What counts as a copy
 *
 * Deriving one edge of a day from the other by a fixed 24 hours, anywhere that
 * is not the contract module itself. The pattern is narrow on purpose: a
 * 24-hour *duration* is a perfectly ordinary thing (a cooldown, an undo window,
 * a retention bound), and this must not fire on those. What it catches is a
 * 24-hour constant used as a **day boundary**.
 */

const REPO = join(__dirname, "..", "..", "..");
const CONTRACT = "src/lib/time/local-day.ts";
const CONTRACT_TEST = "src/lib/time/local-day.test.ts";
const SELF = "src/lib/closeout/phase-2m-local-day-guard.test.ts";

/** Names that only ever appear where a local day is being computed. */
const BOUNDARY_NAMES = /\b(startOfToday|startOfNextLocalDay|localMidnightUtc|localDayStart|localDayEnd)\b/;

/** A 24-hour constant, in the shapes this repository writes it. */
const FIXED_DAY = /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|\bDAY_MS\b|86_?400_?000/;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, dir))) {
    const relative = `${dir}/${entry}`;
    if (statSync(join(REPO, relative)).isDirectory()) sourceFiles(relative, found);
    else if (/\.(ts|tsx)$/.test(entry)) found.push(relative);
  }
  return found;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

describe("2M-TIME-001: the local day is defined once", () => {
  const offenders = sourceFiles("src")
    .filter((file) => file !== CONTRACT && file !== CONTRACT_TEST && file !== SELF)
    .filter((file) => {
      const code = stripComments(readFileSync(join(REPO, file), "utf8"));
      return BOUNDARY_NAMES.test(code) && FIXED_DAY.test(code);
    });

  it("finds no module deriving a day boundary from a fixed 24 hours", () => {
    expect(
      offenders,
      `these compute a day boundary with a hardcoded 24 hours: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("detects the two implementations it replaced, so the rule is not vacuous", () => {
    // The mutation, expressed against the exact code that used to ship. Both
    // lines are real history: the first was `today-priorities.ts`, the second
    // was `work-projection.ts`.
    const beforeHoje = "const bounds = { start, end: start + 24 * 60 * 60 * 1000 }; const localDayStart = 0;";
    const beforeWork = "const startOfToday = new Date(startOfNextLocalDay(now, tz).getTime() - DAY_MS);";
    for (const historical of [beforeHoje, beforeWork]) {
      expect(BOUNDARY_NAMES.test(historical) && FIXED_DAY.test(historical)).toBe(true);
    }
  });

  it("does not fire on an ordinary 24-hour duration", () => {
    // The control. Undo windows, cooldowns and retention bounds are 24 hours and
    // are not day boundaries; a guard that failed them would be turned off.
    const cooldown = "const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;";
    expect(BOUNDARY_NAMES.test(cooldown) && FIXED_DAY.test(cooldown)).toBe(false);
  });
});

describe("2M-TIME-001: the two former copies now consume the contract", () => {
  const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

  it("has Hoje re-export the contract rather than implement one", () => {
    const hoje = read("src/features/daily-cycle/today-priorities.ts");
    expect(hoje).toMatch(/import \{ localDayBounds \} from "@\/lib\/time\/local-day";/);
    expect(stripComments(hoje)).not.toMatch(/function localDayBounds/);
  });

  it("has the Work projection take both edges from the contract", () => {
    const work = stripComments(read("src/features/daily-cycle/work-projection.ts"));
    expect(work).toMatch(/localDayBounds\(now, timezone\)/);
    expect(work, "the second implementation is back").not.toMatch(/function localMidnightUtc/);
    expect(work, "the zone rule was copied again").not.toMatch(/function validTimezone/);
  });

  it("keeps the SQL side asserted by a test that runs in CI", () => {
    const contract = read("supabase/tests/local_day_contract.sql");
    expect(contract).toMatch(/local_date::timestamp at time zone/);
    expect(contract).toMatch(/run_user_heartbeat still computes the local day/);
    // Both hemispheres and all three day lengths, in the database too.
    for (const zone of ["America/New_York", "Australia/Sydney", "America/Santiago", "Europe/Lisbon"]) {
      expect(contract, `${zone} is missing from the SQL contract test`).toContain(zone);
    }
    for (const hours of ["23::numeric", "24::numeric", "25::numeric"]) {
      expect(contract).toContain(hours);
    }
  });
});
