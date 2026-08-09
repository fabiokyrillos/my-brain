/**
 * `2L-CLOSE-001` / `-002` / `-003` — the traceability guard.
 *
 * A generator whose failure modes are unasserted is a generator nobody has run.
 * Every refusal below is proved by **executing it** against a mutated copy of
 * the repository, never by reading the generator and believing it.
 *
 * The mutations are the ones a closing report actually gets wrong: a
 * requirement classified nowhere, one classified twice, a citation that
 * resolves to nothing, a partial with no destination, a rule-driven absence
 * that names no rule, and a row that quietly contradicts a decision the owner
 * signed.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  MIGRATION_BUDGET,
  buildPhase2lTraceability,
  normalizeClass,
  renderMatrix,
} from "../../../scripts/generate-phase-2l-traceability.mjs";

const REPO = join(__dirname, "..", "..", "..");
const roots: string[] = [];

/** A throwaway copy of everything the generator reads. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "phase-2l-trace-"));
  roots.push(root);
  for (const path of [
    "docs/initiatives/phase-2l",
    "docs/reports/phase-2l",
    "supabase/migrations",
  ]) {
    cpSync(join(REPO, path), join(root, path), { recursive: true });
  }
  return root;
}

const RECORD = (root: string, slice: string) =>
  join(root, "docs/reports/phase-2l", `PHASE_2L_SLICE_0${slice}_ACCEPTANCE.md`);

/**
 * Replaces one **claims row**, by id.
 *
 * Anchored on the row's own shape rather than on the bare id, because an id
 * appears several times in a record - in the requirements line, in prose, and
 * in a summary table - and a naive replace edits the first of those. The first
 * draft of this harness did exactly that and produced three tests that mutated
 * a paragraph and then asserted the generator was fine with it.
 */
function mutateRow(root: string, slice: string, id: string, replacement: string) {
  const path = RECORD(root, slice);
  const text = readFileSync(path, "utf8");
  const row = new RegExp(String.raw`^\| \x60${id}\x60 \| \*\*[^*]+\*\* \|.*$`, "m");
  if (!row.test(text)) throw new Error(`the fixture has no claims row for ${id}`);
  writeFileSync(path, text.replace(row, replacement), "utf8");
}

function findings(root: string): string[] {
  try {
    buildPhase2lTraceability({ root });
    return [];
  } catch (error) {
    return (error as { failures?: string[] }).failures ?? [(error as Error).message];
  }
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("2L-CLOSE-001: the real repository classifies every declared requirement", () => {
  it("emits a matrix with nothing unresolved", () => {
    const result = buildPhase2lTraceability();
    expect(result.failures).toEqual([]);
    expect(result.evidence.size).toBe(result.declared.length);
  });

  it("classifies exactly 82, the count the PRD declares", () => {
    // Extracted mechanically, as slice 2L.0's `G-2L.0` required. The number is
    // asserted because the count moved 76 → 82 when the decisions were signed,
    // and a phase that closed on the old number would be closing on a document
    // rather than on its requirements.
    const result = buildPhase2lTraceability();
    expect(result.declared).toHaveLength(82);
    expect(new Set(result.declared).size).toBe(82);
  });

  it("covers all ten families, each numbered from 1 with no gap", () => {
    const result = buildPhase2lTraceability();
    const families = new Map<string, number[]>();
    for (const id of result.declared) {
      const [, family, number] = /^2L-([A-Z]+)-(\d{3})$/.exec(id) ?? [];
      expect(family, `${id} does not match the declared shape`).toBeTruthy();
      families.set(family, [...(families.get(family) ?? []), Number(number)]);
    }
    expect([...families.keys()].sort()).toEqual(
      ["ACCESS", "AUDIT", "BULK", "CLOSE", "EDIT", "METRICS", "MOBILE", "PRIVACY", "RETURN", "VIEW"],
    );
    for (const [family, numbers] of families) {
      const sorted = [...numbers].sort((left, right) => left - right);
      expect(sorted, `${family} is not 1..n with no gap`)
        .toEqual(sorted.map((_, index) => index + 1));
    }
  });

  it("reconciles the budget by looking, and reports the signed zero spend", () => {
    const result = buildPhase2lTraceability();
    expect(MIGRATION_BUDGET.allocated).toBe(1);
    expect(result.migrations).toEqual([]);
    expect(renderMatrix(result)).toContain("1 allocated · 0 spent");
  });
});

describe("2L-CLOSE-001: the generator refuses, and each refusal is executed", () => {
  it("refuses an unclassified requirement", () => {
    const root = fixture();
    mutateRow(root, "4", "2L-MOBILE-001", "| `2L-MOBILE-999` | **built** | a row whose id the PRD has never declared anywhere at all |");
    expect(findings(root).join(" ")).toContain("2L-MOBILE-001 is declared in the PRD and classified nowhere");
  });

  it("refuses a duplicate classification", () => {
    const root = fixture();
    mutateRow(root, "4", "2L-MOBILE-002", "| `2L-MOBILE-001` | **built** | a second classifying row for a requirement another row already classified |");
    expect(findings(root).join(" ")).toContain("2L-MOBILE-001 is classified twice");
  });

  it("refuses a classification the PRD does not declare", () => {
    const root = fixture();
    mutateRow(root, "4", "2L-MOBILE-003", "| `2L-MOBILE-042` | **built** | a classification for an id the PRD declares nowhere at all |");
    expect(findings(root).join(" ")).toContain("2L-MOBILE-042 is classified but the PRD does not declare it");
  });

  it("refuses a citation that resolves to nothing", () => {
    const root = fixture();
    mutateRow(root, "4", "2L-MOBILE-005", "| `2L-MOBILE-005` | **built** | done |");
    expect(findings(root).join(" ")).toContain("2L-MOBILE-005's citation is too short to resolve");
  });

  it("refuses a partial that names no remainder or destination", () => {
    const root = fixture();
    mutateRow(
      root,
      "4",
      "2L-MOBILE-008",
      "| `2L-MOBILE-008` | **partial** | the mobile behaviours are proved at an emulated viewport and nothing more is said |",
    );
    expect(findings(root).join(" ")).toContain('2L-MOBILE-008 is "partial" but names no remainder or destination');
  });

  it("refuses a not-built-by-rule that names no rule", () => {
    const root = fixture();
    mutateRow(
      root,
      "2",
      "2L-BULK-007",
      "| `2L-BULK-007` | **not-built-by-rule** | nothing bulk-eligible requires a confirmation, so this has no subject at all |",
    );
    expect(findings(root).join(" ")).toContain('2L-BULK-007 is "not-built-by-rule" but names no ADR or signed decision');
  });

  it("refuses a row that contradicts a signed decision", () => {
    /*
     * The one that matters most. A closing report can be internally consistent
     * and still describe a phase that did something the owner refused — and the
     * five signed decisions are exactly where that would happen.
     */
    const root = fixture();
    mutateRow(
      root,
      "1",
      "2L-PRIVACY-002",
      "| `2L-PRIVACY-002` | **built** | a sensitivity column was added to tasks and a backfill populated it for every existing row |",
    );
    expect(findings(root).join(" ")).toContain("describes a sensitivity column or a backfill");
  });

  it("refuses a claimed migration spend", () => {
    const root = fixture();
    writeFileSync(
      join(root, "supabase/migrations", "202608100090_phase_2l_saved_views.sql"),
      "-- a migration this phase's budget does not have\n",
      "utf8",
    );
    expect(findings(root).join(" ")).toContain("Phase 2L spent 1 migration(s) against a signed spend of 0");
  });

  it("refuses a missing slice record rather than emitting a shorter matrix", () => {
    const root = fixture();
    rmSync(RECORD(root, "3"));
    const found = findings(root).join(" ");
    expect(found).toContain("slice 2L.3's acceptance record is missing");
    expect(found).toContain("classified nowhere");
  });

  it("upholds a signed decision without firing on it", () => {
    /*
     * The control. Every row in the real repository *states* what the decisions
     * refused — "no sensitivity column", "the allocation lapses unspent" — and
     * a guard that fired on the decision being kept would teach the next author
     * to soften the record until the check went quiet.
     */
    expect(findings(fixture())).toEqual([]);
  });
});

describe("the class vocabulary", () => {
  it("recognises the five and nothing else", () => {
    for (const klass of ["built", "baseline", "partial", "not-built-by-rule", "undelivered"]) {
      expect(normalizeClass(klass)).toBe(klass);
    }
    for (const invented of ["complete", "green", "deployed", "verified", "done"]) {
      // PRD §Global constraints: these are evidence claims, not classes.
      expect(normalizeClass(invented), invented).toBeUndefined();
    }
  });

  it("reads a qualified class down to its head", () => {
    expect(normalizeClass("built (contract)")).toBe("built");
    expect(normalizeClass("baseline, re-proved")).toBe("baseline");
  });
});
