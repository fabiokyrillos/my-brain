/**
 * `2J-CLOSE-001` — the traceability generator's mutation proof.
 *
 * A generator that has only ever succeeded is a generator nobody has tested.
 * Each fixture below is a real way the record could be wrong, and each must
 * produce a **refusal** rather than a matrix with a hole in it.
 *
 * The repository itself is the positive control, asserted last: if the real
 * inputs stopped satisfying the generator, every negative fixture below could
 * still pass while the phase's actual matrix was unwritable.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  FAMILY_SLICE,
  MIGRATION_BUDGET,
  REPOSITORY_ROOT,
  SLICE_FILES,
  buildPhase2jTraceability,
} from "../../../scripts/generate-phase-2j-traceability.mjs";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A throwaway copy of exactly what the generator reads. */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "phase-2j-trace-"));
  roots.push(root);
  for (const relative of [
    "docs/initiatives/phase-2j/PHASE_2J_PRD.md",
    ...Object.values(SLICE_FILES).map((file) => `docs/reports/phase-2j/${file}`),
  ]) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPOSITORY_ROOT, relative), target);
  }
  const migrations = join(root, "supabase/migrations");
  mkdirSync(migrations, { recursive: true });
  for (const name of Object.values(MIGRATION_BUDGET.bySlice)) {
    writeFileSync(join(migrations, name), "-- fixture\n");
  }
  return root;
}

function patch(root: string, relative: string, from: string | RegExp, to: string) {
  const path = join(root, relative);
  const before = readFileSync(path, "utf8");
  const after = before.replace(from, to);
  expect(after, `patch of ${relative} changed nothing — the fixture is not exercising the case`)
    .not.toBe(before);
  writeFileSync(path, after, "utf8");
}

function expectRefusal(root: string, matching: RegExp) {
  let thrown: unknown;
  try {
    buildPhase2jTraceability({ root });
  } catch (error) {
    thrown = error;
  }
  expect(thrown, "the generator wrote a matrix when it should have refused").toBeDefined();
  const failures = ((thrown as { failures?: string[] }).failures ?? [
    (thrown as Error).message,
  ]).join("\n");
  expect(failures).toMatch(matching);
}

const FIRST_SLICE = `docs/reports/phase-2j/${SLICE_FILES["2J.0"]}`;

describe("2J-CLOSE-001: the generator refuses rather than writing a hole", () => {
  it("refuses a requirement declared in the PRD and evidenced nowhere", () => {
    const root = fixtureRoot();
    patch(root, FIRST_SLICE, /^\| `2J-ACCESS-005`.*$/m, "");
    expectRefusal(root, /2J-ACCESS-005 is declared in the PRD and evidenced nowhere/);
  });

  it("refuses a requirement evidenced but never declared", () => {
    const root = fixtureRoot();
    patch(root, FIRST_SLICE, "| `2J-ACCESS-005`", "| `2J-ACCESS-901`");
    expectRefusal(root, /2J-ACCESS-901 is evidenced but the PRD does not declare it/);
  });

  it("refuses an unknown class", () => {
    const root = fixtureRoot();
    patch(root, FIRST_SLICE, "| `2J-ACCESS-005` | **built**", "| `2J-ACCESS-005` | **probably fine**");
    expectRefusal(root, /carries an unknown class "probably fine"/);
  });

  it("refuses a partial that names no destination", () => {
    const root = fixtureRoot();
    patch(
      root,
      FIRST_SLICE,
      /\| `2J-ACCESS-004` \| \*\*partial\*\* \|[^\n]*\|/,
      "| `2J-ACCESS-004` | **partial** | Mostly works and we will finish it at some point soon. |",
    );
    expectRefusal(root, /2J-ACCESS-004 is "partial" but names no destination/);
  });

  it("refuses an undelivered requirement that names no destination", () => {
    const root = fixtureRoot();
    patch(
      root,
      `docs/reports/phase-2j/${SLICE_FILES["2J.7"]}`,
      /\| `2J-METRICS-001` \| \*\*undelivered\*\* \|[^\n]*\|/,
      "| `2J-METRICS-001` | **undelivered** | We did not get to this one during the phase at all. |",
    );
    expectRefusal(root, /2J-METRICS-001 is "undelivered" but names no destination/);
  });

  it("refuses a citation too short to resolve", () => {
    const root = fixtureRoot();
    patch(root, FIRST_SLICE, /\| `2J-ACCESS-007` \| \*\*built\*\* \|[^\n]*\|/, "| `2J-ACCESS-007` | **built** | Done. |");
    expectRefusal(root, /2J-ACCESS-007's citation is too short to resolve/);
  });

  it("refuses a requirement evidenced in the wrong slice", () => {
    const root = fixtureRoot();
    patch(
      root,
      `docs/reports/phase-2j/${SLICE_FILES["2J.1"]}`,
      "| `2J-HOJE-003`",
      "| `2J-ACCESS-003`",
    );
    expectRefusal(root, /evidenced in two slices|its family belongs to/);
  });

  it("refuses a missing acceptance record", () => {
    const root = fixtureRoot();
    rmSync(join(root, `docs/reports/phase-2j/${SLICE_FILES["2J.6"]}`));
    expectRefusal(root, /slice 2J\.6's acceptance record is missing/);
  });

  it("refuses an unbudgeted third migration", () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, "supabase/migrations/202609010001_phase_2j_extra.sql"),
      "-- a third migration nobody authorized\n",
    );
    expectRefusal(root, /an unbudgeted Phase 2J migration exists/);
  });

  it("throws rather than returning an empty set when the PRD is absent", () => {
    const root = fixtureRoot();
    rmSync(join(root, "docs/initiatives/phase-2j/PHASE_2J_PRD.md"));
    expect(() => buildPhase2jTraceability({ root })).toThrow(/does not exist/);
  });

  it("throws when the PRD declares nothing, rather than writing an empty matrix", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "docs/initiatives/phase-2j/PHASE_2J_PRD.md"), "# Empty\n");
    expect(() => buildPhase2jTraceability({ root })).toThrow(/declares no 2J- requirement/);
  });
});

describe("2J-CLOSE-002: the migration budget is reconciled per slice", () => {
  it("accepts an unspent allocation, because unspent is a success", () => {
    const root = fixtureRoot();
    rmSync(join(root, "supabase/migrations", MIGRATION_BUDGET.bySlice["2J.4"]));
    const result = buildPhase2jTraceability({ root });
    expect(result.migrations).toHaveLength(1);
  });

  it("allocates each migration to exactly one slice", () => {
    expect(Object.keys(MIGRATION_BUDGET.bySlice).sort()).toEqual(["2J.4", "2J.7"]);
    expect(MIGRATION_BUDGET.allocated).toBe(2);
  });

  it("gives every family exactly one owning slice", () => {
    for (const [family, slice] of Object.entries(FAMILY_SLICE)) {
      expect(Object.keys(SLICE_FILES), `${family} points at an unknown slice`).toContain(slice);
    }
  });
});

describe("the real repository is the positive control", () => {
  it("builds without a single refusal", () => {
    const result = buildPhase2jTraceability();
    expect(result.failures).toEqual([]);
    expect(result.declared.length).toBe(74);
    expect(result.evidence.size).toBe(74);
  });

  it("classifies every declared requirement, with no class left over", () => {
    const result = buildPhase2jTraceability();
    const total = Object.values(result.counts).reduce((sum, count) => sum + (count as number), 0);
    expect(total).toBe(result.declared.length);
  });

  it("keeps the committed matrix in step with the generator", () => {
    // A stale matrix is the failure mode a generator invites: it runs once,
    // the record drifts, and the document keeps saying what was true in August.
    const matrix = readFileSync(
      join(REPOSITORY_ROOT, "docs/reports/phase-2j/PHASE_2J_TRACEABILITY_MATRIX.md"),
      "utf8",
    );
    const result = buildPhase2jTraceability();
    expect(matrix).toContain(`**Declared: ${result.declared.length} · Classified: ${result.evidence.size}**`);
    for (const id of result.declared) expect(matrix).toContain(`\`${id}\``);
  });
});
