import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CLASSES,
  classificationsIn,
  criteria,
  declaredRequirements,
  evidenceWithoutSubject,
  invisibleDeclarations,
  kinds,
  refusals,
  renderMatrix,
  slices,
} from "../../../scripts/generate-phase-2r-traceability.mjs";

/**
 * The generator's own guard — `2R-CLOSE-001` … `-012`.
 *
 * ## Why a generator needs a test at all
 *
 * It is the thing that decides whether the phase may be reported as complete, so
 * a generator that silently stopped refusing would let a phase close on a matrix
 * nobody could trust. Every refusal below is exercised against a **planted**
 * defect, because a refusal that has never fired is a refusal nobody has seen
 * work.
 *
 * The real documents are asserted clean at the end, which is the other half: a
 * suite of planted fixtures proves the machinery and says nothing about the
 * phase.
 */

const REPO = join(import.meta.dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");

const PRD = "docs/initiatives/phase-2r/PHASE_2R_PRD.md";
const COVERAGE = "docs/reports/phase-2r/PHASE_2R_REQUIREMENT_COVERAGE.md";
const MATRIX = "docs/reports/phase-2r/PHASE_2R_TRACEABILITY_MATRIX.md";

/** A minimal PRD and coverage pair, so a planted defect is the only variable. */
const onePrd = (row: string) =>
  `# fixture\n\n| Requirement | Title | Criterion | Kind | Depends |\n|---|---|---|---|---|\n${row}\n`;
const oneCoverage = (row: string) =>
  `# fixture\n\n| Requirement | Slice | Kind | Decision | Title |\n|---|---|---|---|---|\n${row}\n`;
const oneRecord = (row: string) =>
  `# fixture\n\n## Classification\n\n| Requirement | Class | Evidence |\n|---|---|---|\n${row}\n`;

const GOOD_PRD = onePrd("| `2R-FIX-001` | a title | an observable criterion here | build | — |");
const GOOD_COVERAGE = oneCoverage("| `2R-FIX-001` | 2R.0 | build | — | a title |");

describe("the generator refuses what the contract says it must", () => {
  it("refuses a classification the PRD never declared", () => {
    const found = refusals({
      prd: GOOD_PRD,
      coverage: GOOD_COVERAGE,
      records: [
        oneRecord("| `2R-FIX-001` | **built** | evidence long enough to count |"),
        oneRecord("| `2R-GHOST-001` | **built** | evidence long enough to count |"),
      ],
    });
    expect(found.join("\n")).toContain("2R-GHOST-001 is classified but never declared");
  });

  it("refuses a declared requirement nobody classified", () => {
    const found = refusals({ prd: GOOD_PRD, coverage: GOOD_COVERAGE, records: [] });
    expect(found.join("\n")).toContain("2R-FIX-001 is declared and never classified");
  });

  it("refuses the same requirement classified twice", () => {
    const row = "| `2R-FIX-001` | **built** | evidence long enough to count |";
    const found = refusals({
      prd: GOOD_PRD,
      coverage: GOOD_COVERAGE,
      records: [oneRecord(row), oneRecord(row)],
    });
    expect(found.join("\n")).toContain("classified twice");
  });

  it("refuses two records that disagree about the class", () => {
    const found = refusals({
      prd: GOOD_PRD,
      coverage: GOOD_COVERAGE,
      records: [
        oneRecord("| `2R-FIX-001` | **built** | evidence long enough to count |"),
        oneRecord("| `2R-FIX-001` | **baseline** | evidence long enough to count |"),
      ],
    });
    expect(found.join("\n")).toMatch(/classified as both (built|baseline) and (baseline|built)/);
  });

  it("refuses a class outside the five-word vocabulary", () => {
    // The real defect this caught: a record reading `**delivered**`, which is
    // prose sitting in the class column.
    const found = refusals({
      prd: GOOD_PRD,
      coverage: GOOD_COVERAGE,
      records: [oneRecord("| `2R-FIX-001` | **delivered** | evidence long enough to count |")],
    });
    expect(found.join("\n")).toContain("begins with no class in the vocabulary");
  });

  it("refuses a requirement with no slice", () => {
    const found = refusals({
      prd: GOOD_PRD,
      coverage: oneCoverage("| `2R-FIX-001` | — | build | — | a title |"),
      records: [oneRecord("| `2R-FIX-001` | **built** | evidence long enough to count |")],
    });
    expect(found.join("\n")).toContain("2R-FIX-001 is declared with no slice");
  });

  it("refuses a requirement with no observable criterion", () => {
    const found = refusals({
      prd: onePrd("| `2R-FIX-001` | a title | — | build | — |"),
      coverage: GOOD_COVERAGE,
      records: [oneRecord("| `2R-FIX-001` | **built** | evidence long enough to count |")],
    });
    expect(found.join("\n")).toContain("no observable criterion");
  });

  it("refuses a family name carrying a digit, and proves the invisibility is real", () => {
    /*
      `2R-CLOSE-006`, two-sided. Phase 2K named a family `2K-A11Y` and it matched
      nothing: the detector's family segment is `[A-Z]+`. The positive half is
      that the refusal fires; the negative half is that the STRICT pattern
      genuinely cannot see it, without which the refusal is guarding a hazard
      that does not exist.
    */
    const prd = onePrd("| `2R-A11Y-001` | a title | an observable criterion here | build | — |");
    expect(declaredRequirements(prd), "the strict pattern saw a digit-bearing family").toEqual([]);
    expect(invisibleDeclarations(prd)).toEqual(["2R-A11Y-001"]);
    expect(refusals({ prd, coverage: GOOD_COVERAGE, records: [] }).join("\n"))
      .toContain("declares a family containing a digit");
  });

  it("refuses a partial that names no remainder or destination", () => {
    const found = refusals({
      prd: GOOD_PRD,
      coverage: GOOD_COVERAGE,
      records: [oneRecord("| `2R-FIX-001` | **partial** | it is mostly done and looks fine |")],
    });
    expect(found.join("\n")).toContain("names no destination or signed rule");
  });

  it("refuses a partial whose evidence only repeats its own identifier", () => {
    // The recorded trap: a destination check passes on a row that says nothing
    // but its own name. `evidenceWithoutSubject` strips the subject first.
    const row = { id: "2R-FIX-001", evidence: "2R-FIX-001 2R-FIX-001 2R-FIX-001" };
    expect(evidenceWithoutSubject(row).trim().length).toBeLessThan(20);
  });

  it("refuses any non-zero count of undelivered", () => {
    const found = refusals({
      prd: GOOD_PRD,
      coverage: GOOD_COVERAGE,
      records: [
        oneRecord("| `2R-FIX-001` | **undelivered** | the owner has not run it, destination: the owner |"),
      ],
    });
    expect(found.join("\n")).toContain("A non-zero count is a phase failure, not a category");
  });

  it("refuses a baseline recorded as built", () => {
    /*
      THE ONE THAT FOUND FIVE REAL ROWS. The contract has said since planning
      that `baseline` may never be recorded as `built`, and nothing read it: five
      `2R-FOUNDATION-*` rows sat misfiled from the phase's first slice until this
      refusal existed.
    */
    const found = refusals({
      prd: onePrd("| `2R-FIX-001` | a title | an observable criterion here | baseline | — |"),
      coverage: GOOD_COVERAGE,
      records: [oneRecord("| `2R-FIX-001` | **built** | evidence long enough to count |")],
    });
    expect(found.join("\n")).toContain("claims a change that did not happen");
  });

  it("permits a build delivered as baseline, which is the honest direction", () => {
    // A phase discovering the property already held must be able to say so.
    // `2R-NOTIFY-005` is exactly this.
    const found = refusals({
      prd: GOOD_PRD,
      coverage: GOOD_COVERAGE,
      records: [oneRecord("| `2R-FIX-001` | **baseline** | evidence long enough to count |")],
    });
    expect(found).toEqual([]);
  });

  it("refuses a rule classified as anything but its recorded refusal", () => {
    const found = refusals({
      prd: onePrd("| `2R-FIX-001` | a title | an observable criterion here | rule | — |"),
      coverage: GOOD_COVERAGE,
      records: [oneRecord("| `2R-FIX-001` | **built** | evidence long enough to count |")],
    });
    expect(found.join("\n")).toContain("a rule's delivery is its recorded refusal");
  });

  it("refuses a successor phase's requirement inside this phase's PRD", () => {
    // **Retargeted by ADR-136 Decision 9**, which authorized Phase 2S. This is
    // the sixth pin on the successor's letter, and the one ADR-131's count of
    // five did not have because this generator did not exist yet.
    const prd = `${GOOD_PRD}\n| \`2T-THING-001\` | a title | a criterion | build | — |\n`;
    expect(refusals({ prd, coverage: GOOD_COVERAGE, records: [] }).join("\n"))
      .toContain("declares a successor phase's requirement");
  });

  it("does not refuse the authorized phase's own letter, so the pin moved rather than widened", () => {
    // The half that makes the retarget checkable. Phase 2S is authorized, so a
    // `2S-` row in this PRD is a misfiling for another guard to catch — not this
    // generator's successor refusal. Without this control a pin that refused
    // every letter would look identical from the passing side.
    const prd = `${GOOD_PRD}\n| \`2S-THING-001\` | a title | a criterion | build | — |\n`;
    expect(refusals({ prd, coverage: GOOD_COVERAGE, records: [] }).join("\n"))
      .not.toContain("declares a successor phase's requirement");
  });
});

describe("the parser reads classifications and nothing that resembles them", () => {
  it("ignores a transition table, whose second column is `Was` and not `Class`", () => {
    /*
      The real defect: slice 2R.3's record carries a `| Requirement | Was | Now |
      Why |` table showing how a class moved between checkpoint runs, and reading
      rows by shape alone counted its `Was` column as a classification. The
      requirement came back classified twice, once as a class it no longer had.
    */
    const transition = [
      "# fixture",
      "",
      "| Requirement | Was | Now | Why |",
      "|---|---|---|---|",
      "| `2R-FIX-001` | undelivered | built | the checkpoint ran |",
      "",
    ].join("\n");
    expect(classificationsIn(transition)).toEqual([]);
  });

  it("reads a table that announces itself", () => {
    const rows = classificationsIn(
      oneRecord("| `2R-FIX-001` | **built** | the evidence |"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "2R-FIX-001", klass: "built" });
  });

  it("keeps a class qualified in prose, because the qualifier is the record explaining itself", () => {
    const rows = classificationsIn(
      oneRecord("| `2R-FIX-001` | **baseline — re-proved** | the evidence |"),
    );
    expect(rows[0].klass).toBe("baseline");
  });
});

describe("the phase's real documents", () => {
  it("classifies all 73 exactly once, with nothing refused", () => {
    expect(refusals()).toEqual([]);
    const declared = declaredRequirements();
    expect(declared).toHaveLength(73);
    expect(new Set(declared).size, "a requirement is declared twice").toBe(73);
  });

  it("assigns every requirement a slice and an observable criterion", () => {
    const assigned = slices();
    const criterion = criteria();
    for (const id of declaredRequirements()) {
      expect(assigned.get(id), `${id} has no slice`).toMatch(/^2R\.\d$/);
      expect((criterion.get(id) ?? "").length, `${id} has no criterion`).toBeGreaterThan(10);
    }
  });

  it("declares ten families, none carrying a digit", () => {
    const families = new Set(
      declaredRequirements().map((id) => /^2R-([A-Z]+)-\d{3}$/.exec(id)?.[1]),
    );
    expect(families.size).toBe(10);
    for (const family of families) expect(family).toMatch(/^[A-Z]+$/);
    expect(invisibleDeclarations()).toEqual([]);
  });

  it("records no requirement as undelivered", () => {
    const counts = Object.fromEntries(CLASSES.map((klass) => [klass, 0]));
    // Read from the generator's own view, not from the matrix file, so a stale
    // matrix cannot make this pass.
    const rendered = renderMatrix();
    for (const klass of CLASSES) {
      const match = new RegExp(`\\| \`${klass}\` \\| (\\d+) \\|`).exec(rendered);
      counts[klass] = Number.parseInt(match?.[1] ?? "0", 10);
    }
    expect(counts.undelivered, "a non-zero undelivered count is a phase failure").toBe(0);
    expect(Object.values(counts).reduce((total, one) => total + one, 0)).toBe(73);
  });

  it("keeps the matrix on disk byte-identical to a fresh generation", () => {
    // `2R-CLOSE-003`. A matrix edited by hand is a matrix nobody generated.
    expect(existsSync(join(REPO, MATRIX))).toBe(true);
    expect(read(MATRIX)).toBe(renderMatrix());
  });

  it("never records a declared baseline as built", () => {
    const asked = kinds();
    for (const line of read(MATRIX).split("\n")) {
      const row = /^\| `(2R-[A-Z]+-\d{3})` \| [^|]+ \| ([a-z-]+) \|/.exec(line);
      if (!row) continue;
      if (asked.get(row[1]) === "baseline") {
        expect(row[2], `${row[1]} is declared baseline`).not.toBe("built");
      }
    }
  });

  it("reads its inputs from the PRD and the records, never from a typed list", () => {
    // The matrix must change when a record changes. Proved by classifying a
    // requirement differently in a fixture and watching the rendered output move.
    const moved = renderMatrix({
      prd: GOOD_PRD,
      coverage: GOOD_COVERAGE,
      records: [oneRecord("| `2R-FIX-001` | **partial** | a remainder, destination: later |")],
    });
    expect(moved).toContain("| `partial` | 1 |");
    expect(moved).toContain("| `built` | 0 |");
  });

  it("has a PRD and a coverage report that agree about which requirements exist", () => {
    expect([...slices().keys()].sort()).toEqual([...declaredRequirements()].sort());
  });

  it("carries no successor requirement anywhere in the PRD", () => {
    expect(read(PRD)).not.toMatch(/2S-[A-Z]+-\d{3}/);
    expect(read(COVERAGE)).not.toMatch(/2S-[A-Z]+-\d{3}/);
  });
});
