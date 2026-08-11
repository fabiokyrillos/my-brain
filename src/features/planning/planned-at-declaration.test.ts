import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PLANNED_AT_COLUMN,
  PLANNED_AT_COMMITMENT,
  PLANNED_AT_WRITE_ACTIONS,
  comparePlannedAt,
  formatPlannedDay,
  getPlannedAtCopy,
  isPlannedOnLocalDate,
  plannedDayKey,
  plannedLocalDate,
} from "./planned-at";
import { COMMITMENT_BY_LANE } from "@/features/calendar/calendar-query";
import { parseLocalDate } from "@/lib/time/local-day";

/**
 * `2M-PLAN-001` — the declaration is only worth having if nothing may restate
 * it.
 *
 * Two halves, and the second is the load-bearing one. The behavioural cases pin
 * what the module says; the corpus scan pins that no other module says it too.
 * A "single source of truth" that is merely *available* is how `planned_at`
 * ended up with two independent renderings before this slice — an inline locale
 * ternary on the Work list and a lane classification on the calendar, neither
 * of which knew about the other.
 */

const SRC = path.resolve(process.cwd(), "src");

function walk(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Comments are stripped before the corpus is scanned.
 *
 * Not a convenience: the first run of this file failed on the comment that
 * *documents the removed defect*, in the same commit that removed it — a scan
 * that cannot tell code from prose makes the record of a defect
 * indistinguishable from the defect, and the cheapest way to pass it would have
 * been to delete the explanation. The stripper is deliberately crude; it may
 * mangle a string containing `//`, and none of the patterns below would match
 * such a string anyway.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SOURCES = walk(SRC)
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .map((file) => ({
    file: path.relative(process.cwd(), file).replace(/\\/g, "/"),
    text: withoutComments(readFileSync(file, "utf8")),
  }));

describe("the declaration itself", () => {
  it("says intention, and never commitment", () => {
    expect(PLANNED_AT_COMMITMENT).toBe("intended");
    // The calendar's own lane mapping has to agree, because it is the surface
    // that draws the distinction visually. Compared rather than assumed: two
    // constants that happen to be equal today is exactly the drift this file is
    // about.
    expect(COMMITMENT_BY_LANE.intention).toBe(PLANNED_AT_COMMITMENT);
    expect(COMMITMENT_BY_LANE.deadline).not.toBe(PLANNED_AT_COMMITMENT);
  });

  it("derives its write verbs from the taxonomy rather than listing them", () => {
    // Both, in taxonomy order. `clear_planned` did not exist when the first
    // consumer of this constant was written, which is the argument for deriving.
    expect([...PLANNED_AT_WRITE_ACTIONS]).toEqual(["set_planned", "clear_planned"]);
  });

  it("names the column once", () => {
    expect(PLANNED_AT_COLUMN).toBe("planned_at");
  });
});

describe("the reduction to a local day, which is the part every surface would get wrong", () => {
  const SAO_PAULO = "America/Sao_Paulo";

  it("reads a late-evening intention as the day the user chose, not the UTC day after", () => {
    // 23:00 on the 14th in São Paulo is 02:00 UTC on the 15th. A UTC slice —
    // the implementation every surface writes for itself — reports the 15th.
    const lateEvening = "2026-08-15T02:00:00.000Z";
    expect(lateEvening.slice(0, 10), "the naive answer, stated so the test is not vacuous").toBe("2026-08-15");
    expect(plannedDayKey(lateEvening, SAO_PAULO)).toBe("2026-08-14");
  });

  it("reads an early-morning intention as its own day in a zone ahead of UTC", () => {
    // 08:00 on the 15th in Tokyo is 23:00 UTC on the 14th — the mirror error.
    const earlyMorning = "2026-08-14T23:00:00.000Z";
    expect(plannedDayKey(earlyMorning, "Asia/Tokyo")).toBe("2026-08-15");
  });

  it("answers null for an absent or unreadable value rather than a plausible wrong day", () => {
    expect(plannedLocalDate(null, SAO_PAULO)).toBeNull();
    expect(plannedLocalDate(undefined, SAO_PAULO)).toBeNull();
    expect(plannedLocalDate("", SAO_PAULO)).toBeNull();
    expect(plannedLocalDate("not an instant", SAO_PAULO)).toBeNull();
    expect(plannedDayKey("not an instant", SAO_PAULO)).toBeNull();
  });

  it("decides membership of a day by the same reduction, not by a second one", () => {
    const day = parseLocalDate("2026-08-14")!;
    expect(isPlannedOnLocalDate("2026-08-15T02:00:00.000Z", day, SAO_PAULO)).toBe(true);
    expect(isPlannedOnLocalDate("2026-08-15T04:00:00.000Z", day, SAO_PAULO)).toBe(false);
    expect(isPlannedOnLocalDate(null, day, SAO_PAULO)).toBe(false);
  });
});

describe("the ordering, including the asymmetry that is deliberate", () => {
  const early = "2026-08-14T12:00:00.000Z";
  const late = "2026-08-20T12:00:00.000Z";

  it("puts the earlier intention first ascending, and the later one first descending", () => {
    expect(comparePlannedAt(early, late, "asc")).toBeLessThan(0);
    expect(comparePlannedAt(early, late, "desc")).toBeGreaterThan(0);
    expect(comparePlannedAt(early, early)).toBe(0);
  });

  it("sorts an absent plan last in BOTH directions", () => {
    // The property a naive comparator loses. "No intention" is not a very late
    // intention: a descending sort that floated every unplanned task to the top
    // would bury exactly the rows the ordering was chosen to surface.
    for (const direction of ["asc", "desc"] as const) {
      expect(comparePlannedAt(null, early, direction), direction).toBeGreaterThan(0);
      expect(comparePlannedAt(early, null, direction), direction).toBeLessThan(0);
    }
    expect(comparePlannedAt(null, null)).toBe(0);
  });
});

describe("the words, in both locales", () => {
  it("gives a label, a prefix and a non-empty absence in each", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = getPlannedAtCopy(locale);
      for (const [key, value] of Object.entries(copy)) {
        expect(value.length, `${locale}.${key} must not be empty`).toBeGreaterThan(0);
      }
    }
    expect(getPlannedAtCopy("pt-BR")).not.toEqual(getPlannedAtCopy("en"));
  });

  it("never promises a time, because the intention is a day", () => {
    const rendered = formatPlannedDay("2026-08-15T02:00:00.000Z", "pt-BR", "America/Sao_Paulo");
    expect(rendered).not.toBeNull();
    // The clock component must not appear. `23:00` is what a `timeStyle` would
    // have printed for this instant in this zone.
    expect(rendered).not.toMatch(/\d{1,2}:\d{2}/);
    expect(formatPlannedDay(null, "pt-BR", "America/Sao_Paulo")).toBeNull();
    expect(formatPlannedDay("nonsense", "pt-BR", "America/Sao_Paulo")).toBeNull();
  });
});

describe("no surface restates the declaration", () => {
  /*
   * The corpus scan. Every non-test module under `src` is read, and the two
   * shapes that would be a second declaration are refused by name.
   */

  const DECLARATION = "src/features/planning/planned-at.ts";

  it("computes the planned day in exactly one module", () => {
    // A UTC slice of the column is the specific wrong implementation, and it is
    // wrong in a way that only shows up for users in a zone behind UTC after
    // 21:00 — which is most of this product's users, most evenings.
    const offenders = SOURCES.filter(({ file, text }) =>
      file !== DECLARATION
      && /planned_?[Aa]t[^;\n]{0,80}\.toISOString\(\)\.slice/.test(text));
    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it("renders a task's own planned day only through the declared copy", () => {
    /*
     * A locale ternary sitting on top of this column is the exact shape the
     * Work list carried before this slice: `pt ? "Planejado: " : "Planned: "`,
     * three files away from a calendar that had decided the same column meant
     * something it named differently.
     */
    // Scoped to the ternary shape rather than to the words. A feature's own
    // `copy.ts` naming this column in a locale record is the sanctioned
    // mechanism and must not be caught; what must be caught is a component
    // choosing between the two languages inline, because that is a declaration
    // no `copy.ts` can see and no reviewer will find twice.
    const offenders = SOURCES.filter(({ file, text }) =>
      file !== DECLARATION
      && /\?\s*["'](Planejado|Planned)[^"']*["']\s*:\s*["'](Planejado|Planned)/.test(text));
    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it("is imported by every surface that renders the column's value", () => {
    // Reading `plannedAt` and rendering it is what makes a module a surface for
    // this purpose. The projection layers that merely carry the value through
    // are excluded by requiring a rendered fragment, not a mention.
    const renderers = SOURCES.filter(({ file, text }) =>
      file !== DECLARATION
      && /\.tsx$/.test(file)
      && /task\.plannedAt|item\.plannedAt/.test(text));
    expect(renderers.length, "the scan must find the surfaces it claims to check")
      .toBeGreaterThan(0);
    for (const { file, text } of renderers) {
      expect(text, `${file} renders planned_at without reading its declaration`)
        .toMatch(/planned-at/);
    }
  });
});
