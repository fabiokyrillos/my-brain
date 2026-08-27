import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AUTHORIZED_NEW_WRITER,
  BASELINE_WRITERS,
  CLASSES,
  INHERITED,
  bundledWriters,
  classificationsIn,
  declaredRequirements,
  evidenceWithoutSubject,
  invisibleDeclarations,
  kinds,
  migrationCounts,
  pushClaims,
  refusals,
  renderMatrix,
  slices,
} from "../../../scripts/generate-phase-2s-traceability.mjs";

/**
 * The generator's own guard — `2S-CLOSE-001` … `-013`.
 *
 * ## Why a generator needs a test at all
 *
 * It is the thing that decides whether the phase may be reported as complete, so
 * a generator that silently stopped refusing would let a phase close on a matrix
 * nobody could trust. **Every refusal below is exercised against a planted
 * defect**, because a refusal that has never fired is a refusal nobody has seen
 * work — and this repository has watched a contract stated in prose enforce
 * nothing for a whole phase.
 *
 * The real documents are asserted clean at the end, which is the other half: a
 * suite of planted fixtures proves the machinery and says nothing about the
 * phase.
 */

const REPO = join(import.meta.dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");

const PRD = "docs/initiatives/phase-2s/PHASE_2S_PRD.md";
const COVERAGE = "docs/reports/phase-2s/PHASE_2S_REQUIREMENT_COVERAGE.md";
const MATRIX = "docs/reports/phase-2s/PHASE_2S_TRACEABILITY_MATRIX.md";
const CLOSING = "docs/reports/phase-2s/PHASE_2S_CLOSING_REPORT.md";
const GENERATOR = "scripts/generate-phase-2s-traceability.mjs";

/** A minimal PRD and coverage pair, so a planted defect is the only defect. */
function fixture({
  prdRows = "| `2S-DEMO-001` | a thing | an observable criterion long enough to pass | build | — |",
  coverageRows = "| `2S-DEMO-001` | 2S.0 | build | — |",
  classRows = "| `2S-DEMO-001` | **built** | §1 — the evidence, at length |",
} = {}) {
  return {
    prd: `# PRD\n\n| id | statement | criterion | kind | decision |\n|---|---|---|---|---|\n${prdRows}\n`,
    coverage: `# Coverage\n\n| id | slice | kind | decision |\n|---|---|---|---|\n${coverageRows}\n`,
    records: [`# Record\n\n| Requirement | Class | Evidence |\n|---|---|---|\n${classRows}\n`],
    closing: null,
    handlers: null,
    documents: [],
    migrations: { local: 1, phase: 1 },
  };
}

describe("the generator refuses, and every refusal has been seen to fire", () => {
  it("is clean on a well-formed fixture, so the planted defects below are the only defects", () => {
    expect(refusals(fixture())).toEqual([]);
  });

  it("refusal 1 — a requirement classified twice", () => {
    const found = refusals(
      fixture({
        classRows:
          "| `2S-DEMO-001` | **built** | §1 — the evidence, at length |\n| `2S-DEMO-001` | **built** | §2 — again |",
      }),
    );
    expect(found.join(" ")).toMatch(/classified twice/);
  });

  it("refusal 2 — a declared requirement nobody classified", () => {
    expect(refusals(fixture({ classRows: "" })).join(" ")).toMatch(/declared and never classified/);
  });

  it("refusal 3 — a classification naming an identifier the PRD never declared", () => {
    const found = refusals(
      fixture({
        classRows:
          "| `2S-DEMO-001` | **built** | §1 — the evidence, at length |\n| `2S-GHOST-001` | **built** | §2 — a ghost |",
      }),
    );
    expect(found.join(" ")).toMatch(/2S-GHOST-001 is classified but never declared/);
  });

  it("refusal 4 — a requirement with no slice", () => {
    expect(refusals(fixture({ coverageRows: "" })).join(" ")).toMatch(/declared with no slice/);
  });

  it("refusal 5 — a requirement with no observable criterion", () => {
    const found = refusals(fixture({ prdRows: "| `2S-DEMO-001` | a thing | short | build | — |" }));
    expect(found.join(" ")).toMatch(/no observable criterion/);
  });

  it("refusal 6 — a family name containing a digit, which hides it from three counts at once", () => {
    /*
     * Two-sided, because this is the property that made `2K-A11Y` invisible: the
     * strict pattern must NOT see it, and the loose pattern MUST.
     */
    const prd = "| `2S-A11Y-001` | a thing | an observable criterion long enough | build | — |";
    expect(declaredRequirements(prd), "the strict shape must not see it").toEqual([]);
    expect(invisibleDeclarations(prd)).toEqual(["2S-A11Y-001"]);
    expect(refusals(fixture({ prdRows: prd })).join(" ")).toMatch(/family containing a digit/);
  });

  it("refusal 7 — a partial with no named remainder or destination", () => {
    const found = refusals(fixture({ classRows: "| `2S-DEMO-001` | **partial** | half of it |" }));
    expect(found.join(" ")).toMatch(/partial with no concrete remainder|names no destination/);
  });

  it("refusal 8 — a not-built-by-rule naming no signed rule", () => {
    const found = refusals(
      fixture({
        prdRows: "| `2S-DEMO-001` | a thing | an observable criterion long enough | rule | — |",
        classRows: "| `2S-DEMO-001` | **not-built-by-rule** | it was simply not done at all here |",
      }),
    );
    expect(found.join(" ")).toMatch(/names no destination or signed rule/);
  });

  it("refusal 9 — a non-zero undelivered count is a phase failure, not a category", () => {
    const found = refusals(fixture({ classRows: "| `2S-DEMO-001` | **undelivered** | nobody built it, and the owner was never told |" }));
    expect(found.join(" ")).toMatch(/undelivered[\s\S]*phase failure/);
  });

  it("refusal 10 — a declared baseline delivered as built claims a change that did not happen", () => {
    const found = refusals(
      fixture({
        prdRows: "| `2S-DEMO-001` | a thing | an observable criterion long enough | baseline | — |",
        classRows: "| `2S-DEMO-001` | **built** | §1 — the evidence, at length |",
      }),
    );
    expect(found.join(" ")).toMatch(/declared baseline and classified built/);
  });

  it("2S-CLOSE-004 — the OPPOSITE direction is deliberately not refused", () => {
    /*
     * The protection that keeps a phase honest in the other direction. A `build`
     * requirement delivered `baseline` is a phase discovering the property
     * already held; refusing both directions would push a phase toward
     * manufacturing a change to make a label look right.
     */
    expect(
      refusals(
        fixture({
          prdRows: "| `2S-DEMO-001` | a thing | an observable criterion long enough | build | — |",
          classRows: "| `2S-DEMO-001` | **baseline** | §1 — it already held, and no change was made |",
        }),
      ),
    ).toEqual([]);
  });

  it("refuses a class outside the vocabulary, because five classes are only a contract if a sixth fails", () => {
    const found = refusals(fixture({ classRows: "| `2S-DEMO-001` | **delivered** | §1 — a class nobody agreed |" }));
    expect(found.join(" ")).toMatch(/begins with no class in the vocabulary/);
  });

  it("refusal 12 — more migrations than the allocation", () => {
    expect(refusals({ ...fixture(), migrations: { local: 3, phase: 2 } }).join(" ")).toMatch(
      /2 migrations against an allocation of 1/,
    );
  });

  it("refusal 13 — the closing record's local and hosted counts must agree, and match the disk", () => {
    const base = fixture();
    const clean = "202608240102 — 1 local = 1 hosted. 2S-CLOSE-012 found the cadence stopped. "
      + `${INHERITED.join(" ")} ${BASELINE_WRITERS.join(" ")} ${AUTHORIZED_NEW_WRITER}`;
    expect(refusals({ ...base, closing: clean })).toEqual([]);
    expect(refusals({ ...base, closing: clean.replace("1 local = 1 hosted", "1 local = 2 hosted") }).join(" "))
      .toMatch(/1 local against 2 hosted/);
    expect(refusals({ ...base, closing: clean.replace("1 local = 1 hosted", "9 local = 9 hosted") }).join(" "))
      .toMatch(/states 9 local migrations and 1 are on disk/);
  });

  it("refusal 17 — an inherited remainder dropped from the closing record", () => {
    const dropped = INHERITED.filter((item) => item !== "RG-DEP-3");
    const closing = `202608240102 — 1 local = 1 hosted. 2S-CLOSE-012 said so. ${dropped.join(" ")} `
      + `${BASELINE_WRITERS.join(" ")} ${AUTHORIZED_NEW_WRITER}`;
    expect(refusals({ ...fixture(), closing }).join(" ")).toMatch(/drops the inherited remainder RG-DEP-3/);
  });

  it("refusal 19 — a closing record silent about the re-measurement", () => {
    const closing = `202608240102 — 1 local = 1 hosted. ${INHERITED.join(" ")} `
      + `${BASELINE_WRITERS.join(" ")} ${AUTHORIZED_NEW_WRITER}`;
    expect(refusals({ ...fixture(), closing }).join(" ")).toMatch(/does not state what 2S-CLOSE-012/);
  });

  it("refusal 21 — a closing record that omits one of the authorities a verb dispatches to", () => {
    const closing = "202608240102 — 1 local = 1 hosted. 2S-CLOSE-012 said so. "
      + `${INHERITED.join(" ")} ${BASELINE_WRITERS.filter((w) => w !== "undoWorkOperation").join(" ")} `
      + AUTHORIZED_NEW_WRITER;
    expect(refusals({ ...fixture(), closing }).join(" ")).toMatch(/does not name the authority undoWorkOperation/);
  });
});

describe("refusal 20 — the reuse claim `OD-2S-3` B was signed against", () => {
  const bundle = (writers: string[]) =>
    `export const NOTIFICATION_VERB_HANDLERS = {\n${writers.map((w, i) => `  k${i}: ${w},`).join("\n")}\n}\n`;

  it("reads the bundle from the tree rather than from a list", () => {
    expect(bundledWriters()).toEqual(expect.arrayContaining([AUTHORIZED_NEW_WRITER, ...BASELINE_WRITERS]));
  });

  it("passes for the four pre-existing writers and the one authorized new one", () => {
    expect(refusals({ ...fixture(), handlers: bundle([...BASELINE_WRITERS, AUTHORIZED_NEW_WRITER]) })).toEqual([]);
  });

  it("refuses a writer that did not exist at slice 2S.0's baseline", () => {
    const found = refusals({ ...fixture(), handlers: bundle([...BASELINE_WRITERS, "writeTaskDirectly"]) });
    expect(found.join(" ")).toMatch(/dispatch to writeTaskDirectly, which did not exist/);
  });

  it("refuses a bundle it cannot read, rather than passing over one", () => {
    /*
     * The vacuity control. A parser that returned nothing would make this
     * refusal silently unfireable, which is the failure mode that matters most
     * for a check nobody watches.
     */
    expect(refusals({ ...fixture(), handlers: "export const SOMETHING_ELSE = {}\n" }).join(" ")).toMatch(
      /could not be read, so refusal 20 cannot fire/,
    );
  });
});

describe("refusal 18 — it forbids the CLAIM, never the word", () => {
  it("refuses a sentence saying push works", () => {
    expect(pushClaims("Push delivery was verified end to end.")).toHaveLength(1);
  });

  it("allows the sentence the record most needs", () => {
    /*
     * A guard that banned the word would ban this, and this is the honest
     * sentence. The negation may also arrive after a line break, because prose
     * wraps and a bound that stopped at the newline would lose it.
     */
    expect(pushClaims("Push is still not working, and its HTTP 403 is untouched.")).toEqual([]);
    expect(pushClaims("Push was never delivered:\nnot once, and the 403 remains.")).toEqual([]);
    expect(pushClaims("Nothing here claims push works.")).toEqual([]);
  });

  it("finds no claim in any document this phase produced", () => {
    for (const file of [PRD, COVERAGE, CLOSING, MATRIX]) {
      expect(pushClaims(read(file)), `${file} claims push works`).toEqual([]);
    }
  });
});

describe("the mechanics the contract names twice", () => {
  it("carries no shebang, which the local transform refuses", () => {
    expect(read(GENERATOR).startsWith("#!")).toBe(false);
  });

  it("reads only a table that announces itself with `| Requirement | Class |`", () => {
    /*
     * Phase 2R's generator classified three requirements twice by reading a
     * transition table shaped `| Requirement | Was | Now | Why |`. The second
     * heading decides, and `Was` is not `Class`.
     */
    const transition = "| Requirement | Was | Now | Why |\n|---|---|---|---|\n| `2S-DEMO-001` | built | baseline | corrected |\n";
    expect(classificationsIn(transition)).toEqual([]);
  });

  it("strips a row's own identifier before judging whether it named anything", () => {
    const row = { id: "2S-DEMO-001", evidence: "2S-DEMO-001 2S-DEMO-001", klass: "partial", declared: "partial" };
    expect(evidenceWithoutSubject(row).trim()).toBe("");
  });

  it("accepts `across` as a slice, because a phase-wide property is not an unassigned one", () => {
    const coverage = "| `2S-TRUST-001` | across | build | — |";
    expect(slices(coverage).get("2S-TRUST-001")).toBe("across");
  });
});

describe("the repository as it stands", () => {
  it("produces no finding at all", () => {
    expect(refusals()).toEqual([]);
  });

  it("declares 99 requirements across eleven letters-only families, and classifies every one", () => {
    const declared = declaredRequirements(read(PRD));
    expect(declared).toHaveLength(99);
    expect(invisibleDeclarations(read(PRD))).toEqual([]);
    const classified = new Set(
      ["00", "01", "02", "03", "04"]
        .map((n) => read(`docs/reports/phase-2s/PHASE_2S_SLICE_${n}_ACCEPTANCE.md`))
        .flatMap(classificationsIn)
        .filter((row) => row.klass !== null)
        .map((row) => row.id),
    );
    expect(classified.size).toBe(declared.length);
  });

  it("records zero `undelivered`, which is the only count that is a phase failure", () => {
    const rows = ["00", "01", "02", "03", "04"]
      .map((n) => read(`docs/reports/phase-2s/PHASE_2S_SLICE_${n}_ACCEPTANCE.md`))
      .flatMap(classificationsIn);
    expect(rows.filter((row) => row.klass === "undelivered")).toEqual([]);
    // And the vocabulary is exactly the contract's five.
    expect([...new Set(rows.map((row) => row.klass))].every((k) => CLASSES.includes(k as string))).toBe(true);
  });

  it("delivers no declared `baseline` as `built` — the Phase 2R defect, not repeating", () => {
    const asked = kinds(read(PRD));
    const rows = ["00", "01", "02", "03", "04"]
      .map((n) => read(`docs/reports/phase-2s/PHASE_2S_SLICE_${n}_ACCEPTANCE.md`))
      .flatMap(classificationsIn);
    const misfiled = rows.filter((row) => asked.get(row.id) === "baseline" && row.klass === "built");
    expect(misfiled.map((row) => row.id)).toEqual([]);
  });

  it("spent exactly the one allocated migration", () => {
    expect(migrationCounts().phase).toBe(1);
  });

  it("holds a committed matrix identical to a fresh generation, byte for byte", () => {
    // `--check`'s own assertion, run here so a stale matrix fails the suite and
    // not only the command nobody remembered to run.
    expect(read(MATRIX)).toBe(renderMatrix());
  });
});
