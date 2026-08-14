/**
 * `2N-CLOSE-001`…`-006` — the phase close, asserted rather than described.
 *
 * The matrix is **generated**, so the thing worth guarding is not its contents
 * but the two properties that make a generated document trustworthy: that the
 * generator still refuses what it exists to refuse, and that the committed file
 * is what the generator currently produces.
 *
 * A stale matrix is the specific failure this catches. It would still read as a
 * complete, authoritative table while the records beneath it had moved — which
 * is exactly the "looks complete" shape the generator's own header refuses.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMatrix,
  extractClassifications,
  MIGRATION_BUDGET,
  normalizeClass,
  CLOSEOUT_SLICE,
} from "../../../scripts/generate-phase-2n-traceability.mjs";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const MATRIX = "docs/reports/phase-2n/PHASE_2N_TRACEABILITY_MATRIX.md";

describe("2N-CLOSE-001: every declared requirement is classified exactly once", () => {
  const result = buildMatrix(REPO);

  it("refuses nothing — the phase's record reconciles", () => {
    expect(result.problems).toEqual([]);
  });

  it("classifies all 127 declared requirements, and delivers every one of them", () => {
    expect(result.declared).toHaveLength(127);
    expect(result.resolved).toHaveLength(127);
    // The generator is plain JavaScript, so its tally is untyped here. Reading
    // it off `resolved` rather than off `tally` keeps the assertion typed and
    // asserts the same fact from the same source.
    expect(result.resolved.filter((row) => row.class === "undelivered")).toEqual([]);
  });

  it("leaves the committed matrix in step with the generator", () => {
    // `--check` is the operator's form of this; this is the CI form, so a stale
    // matrix cannot reach `main` behind a green suite.
    const committed = read(MATRIX).replace(/\r\n/g, "\n");
    expect(committed).toContain("127 declared · 127 classified · 0 unclassified");
    expect(committed).toContain("Do not edit by hand");
    for (const row of result.resolved) {
      expect(committed, `${row.id} is missing from the committed matrix`).toContain(`\`${row.id}\``);
    }
  });
});

describe("2N-CLOSE-002: every partial carries a destination", () => {
  const result = buildMatrix(REPO);

  it("names three partials and no more", () => {
    const partials = result.resolved.filter((row) => row.class === "partial").map((row) => row.id);
    expect(partials.sort()).toEqual(["2N-FILES-008", "2N-IDENTITY-008", "2N-RELATION-003"]);
  });

  it("gives each of them a destination in the record that classifies it", () => {
    for (const [id, destination] of [
      ["2N-FILES-008", "2N-FILES-WRITER"],
      ["2N-RELATION-003", "2N-RELATION-TRIGGER"],
      ["2N-IDENTITY-008", "2N-IDENTITY-EXTRACTION"],
    ] as const) {
      const corpus = ["0", "1", "2", "3", "4", "5", "6", "7"]
        .map((slice) => {
          try {
            return read(`docs/reports/phase-2n/PHASE_2N_SLICE_${slice}_ACCEPTANCE.md`);
          } catch {
            return "";
          }
        })
        .join("\n");
      expect(corpus, `${id}'s destination is not named anywhere`).toContain(destination);
    }
  });

  it("mutation control: a partial that names nowhere to go is refused", () => {
    /*
     * This control found a real defect in the check it exercises.
     *
     * `DESTINATION` admits a `2N-…` token, and **every row contains its own
     * id** — so the check passed for any `partial` simply because it existed.
     * The generator now strips the subject id before testing, and this asserts
     * the property from the outside: a partial whose only `2N-…` token is its
     * own subject names no destination.
     */
    const line = "| `2N-FILES-008` | **partial** | six of seven capabilities ship |";
    const rows = extractClassifications(line, "2N.x");
    expect(rows).toHaveLength(1);
    expect(rows[0].class).toBe("partial");
    const withoutSubject = rows[0].evidence.split("2N-FILES-008").join(" ");
    expect(/[Dd]estination|[Rr]emainder|2N-[A-Z]+(-[A-Z]+)?\b/.test(withoutSubject)).toBe(false);
  });

  it("mutation control: and the same stripping still ACCEPTS a real destination", () => {
    const line = "| `2N-FILES-008` | **partial** | destination `2N-FILES-WRITER`, an owner decision |";
    const rows = extractClassifications(line, "2N.x");
    const withoutSubject = rows[0].evidence.split("2N-FILES-008").join(" ");
    expect(/[Dd]estination|[Rr]emainder|2N-[A-Z]+(-[A-Z]+)?\b/.test(withoutSubject)).toBe(true);
  });
});

describe("2N-CLOSE-003: the budget is restated, and M2 closes unspent", () => {
  const result = buildMatrix(REPO);

  it("spent exactly two of three allocations", () => {
    expect(MIGRATION_BUDGET.allocated).toBe(3);
    expect(MIGRATION_BUDGET.expectedSpend).toBe(2);
    expect(result.migrations).toHaveLength(2);
  });

  it("names M2 as unspent rather than leaving the gap unexplained", () => {
    expect(MIGRATION_BUDGET.named.M2).toMatch(/UNSPENT/);
    expect(read("docs/reports/phase-2n/PHASE_2N_SLICE_7_M2_VERDICT.md")).toContain(
      "M2 CLOSES UNSPENT",
    );
  });

  it("mutation control: a third phase migration is a stop condition, not a row", () => {
    // The generator compares against `expectedSpend` in BOTH directions, so a
    // shortfall is as much a finding as an excess — which is what stops a slice
    // deleting a migration to make the number fit.
    expect(MIGRATION_BUDGET.expectedSpend).toBeLessThan(MIGRATION_BUDGET.allocated);
  });
});

describe("2N-CLOSE-004 / -005: the inherited residuals are restated, never approved", () => {
  const acceptance = read("docs/reports/phase-2n/PHASE_2N_SLICE_7_ACCEPTANCE.md");

  it("restates push and Android exactly as inherited", () => {
    expect(acceptance).toMatch(/HTTP 403/);
    expect(acceptance).toMatch(/NEVER VALIDATED ON ANDROID/i);
    expect(acceptance).toMatch(/neither is approved by this close/i);
  });

  it("restates ADR-055 as neither satisfied nor superseded, with its expiry", () => {
    expect(acceptance).toMatch(/ADR-055/);
    expect(acceptance).toMatch(/neither satisfied nor superseded/i);
    expect(acceptance).toMatch(/2026-10-27/);
  });

  it("claims no screen-reader run", () => {
    expect(acceptance).toMatch(/[Nn]o screen-reader run has been executed/);
  });
});

describe("2N-SEC-001: the threat model is dispositioned, and the live ones are named", () => {
  const acceptance = read("docs/reports/phase-2n/PHASE_2N_SLICE_7_ACCEPTANCE.md");

  it("carries a row for every threat the model declares", () => {
    const model = read("docs/reports/phase-2n/PHASE_2N_THREAT_MODEL.md");
    const threats = [...new Set([...model.matchAll(/^## (T-\d+) —/gm)].map((match) => match[1]))];
    expect(threats.length).toBeGreaterThanOrEqual(23);
    for (const threat of threats) {
      expect(acceptance, `${threat} has no disposition`).toMatch(new RegExp(`\\| ${threat} `));
    }
  });

  it("says T-3 is live rather than describing it as closed", () => {
    // The signature `OD-2N-8` A says inferred relations are not persisted; slice
    // 2N.6 measured that premise false. A close that repeated the signature
    // instead of the measurement would be the smoothing this phase refuses.
    expect(acceptance).toMatch(/\| T-3 [^|]*\|[^|]*LIVE/);
    expect(acceptance).toMatch(/2N-RELATION-TRIGGER/);
  });
});

describe("the generator's own vocabulary is closed", () => {
  it("normalizes a compound class to its head token", () => {
    expect(normalizeClass("baseline (words) / made true by M1")).toBe("baseline");
    expect(normalizeClass("built (guard)")).toBe("built");
    expect(normalizeClass("nonsense")).toBeUndefined();
  });

  it("reads a class from an enclosing heading, not only from a row", () => {
    const rows = extractClassifications("### Built (17)\n\n| id | delivered as |\n| `2N-PERSON-003` | bounds |", "2N.1");
    expect(rows).toEqual([expect.objectContaining({ id: "2N-PERSON-003", class: "built" })]);
  });

  it("reads a family heading over bare numeric suffixes", () => {
    const rows = extractClassifications(
      "### `2N-KNOWS` (9) — M1\n\n| Id | Class | Evidence |\n| 001, 002 | `baseline` | shipped earlier |",
      "2N.3",
    );
    expect(rows.map((row) => row.id)).toEqual(["2N-KNOWS-001", "2N-KNOWS-002"]);
  });

  it("takes the FIRST cell's id as the subject, so a cited id is not a second subject", () => {
    const rows = extractClassifications(
      "| `2N-RELATION-007` complete text equivalent | **built** | no session claimed — `2N-ACCESS-006` |",
      "2N.6",
    );
    expect(rows).toEqual([expect.objectContaining({ id: "2N-RELATION-007", class: "built" })]);
  });

  it("keeps adjudication to the closing slice", () => {
    expect(CLOSEOUT_SLICE).toBe("2N.7");
  });
});
