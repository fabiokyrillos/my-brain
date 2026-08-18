/**
 * `2O-CLOSE-001` / `2O-CLOSE-002` — the traceability generator's mutation proof.
 *
 * A generator that has only ever succeeded is a generator nobody has tested.
 * Each fixture below plants a real way the sources could be wrong into a copy of
 * the tree, asserts the generator **refuses**, and lets the copy be discarded.
 *
 * The repository itself is the positive control, asserted last: without it every
 * negative fixture could pass while the phase's actual matrix was unwritable —
 * and a suite that only proves a thing can fail has not proved it can pass.
 *
 * ## Why the fixtures copy the tree instead of stubbing the parser
 *
 * The most serious defect this generator had was **not** a parsing mistake it
 * refused on. It was a four-column adjudication table whose second cell was
 * `Was` rather than the class, which the positional reader accepted and turned
 * into a **plausible wrong matrix** — 105/3 where the truth was 106/2, with no
 * refusal anywhere. A stubbed parser would have agreed with itself. Only running
 * the whole generator over real files and reading the rendered row caught it,
 * which is why the fixtures below are files.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  CLASSES,
  DECLARED_TOTAL,
  MIGRATION_BUDGET,
  REPOSITORY_ROOT,
  audit,
  counts,
  declaredRequirements,
  evidenceWithoutSubject,
  namesDestination,
  normalizeClass,
  normalizeNewlines,
  readRowKey,
  remainderIsVacuous,
  render,
  resolveClassifications,
} from "../../../scripts/generate-phase-2o-traceability.mjs";

const PRD = "docs/initiatives/phase-2o/PHASE_2O_PRD.md";
const REPORTS = "docs/reports/phase-2o";
const MATRIX = `${REPORTS}/PHASE_2O_TRACEABILITY_MATRIX.md`;

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A disposable copy of everything the generator reads. */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "phase-2o-traceability-"));
  roots.push(root);
  mkdirSync(join(root, "docs/initiatives/phase-2o"), { recursive: true });
  mkdirSync(join(root, "docs/reports/phase-2o"), { recursive: true });
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  cpSync(join(REPOSITORY_ROOT, PRD), join(root, PRD));
  cpSync(join(REPOSITORY_ROOT, REPORTS), join(root, REPORTS), { recursive: true });
  cpSync(join(REPOSITORY_ROOT, "supabase/migrations"), join(root, "supabase/migrations"), {
    recursive: true,
  });
  return root;
}

function read(root: string, relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function write(root: string, relativePath: string, contents: string): void {
  writeFileSync(join(root, relativePath), contents, "utf8");
}

function refusals(root: string): string[] {
  return audit(root).refusals;
}

const SLICE_8 = `${REPORTS}/PHASE_2O_SLICE_08_ACCEPTANCE.md`;

describe("the fixture is a faithful copy, and the copy passes", () => {
  it("refuses nothing when nothing is planted", () => {
    // Without this, every negative fixture below could be passing because the
    // copy is broken rather than because the planted defect was detected.
    expect(refusals(fixtureRoot())).toEqual([]);
  });
});

describe("a declared requirement that nothing classifies", () => {
  it("refuses", () => {
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(root, SLICE_8, record.replace(/^\| `2O-SEC-003` \|.*$/m, ""));
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("`2O-SEC-003` is declared and no acceptance record classifies it"),
    );
  });
});

describe("a classified requirement the PRD does not declare", () => {
  it("refuses", () => {
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(
      root,
      SLICE_8,
      record.replace(
        "| `2O-SEC-003` |",
        "| `2O-GHOST-001` | **built** | a requirement nobody declared |\n| `2O-SEC-003` |",
      ),
    );
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("classifies `2O-GHOST-001`, which the PRD does not declare"),
    );
  });
});

describe("a requirement declared twice", () => {
  it("refuses", () => {
    const root = fixtureRoot();
    const prd = read(root, PRD);
    const declaration = /^- \*\*2O-SEC-003:\*\*[^\n]*/m.exec(prd);
    expect(declaration, "the fixture must find the declaration it duplicates").not.toBeNull();
    write(root, PRD, prd.replace(declaration![0], `${declaration![0]}\n${declaration![0]}`));
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("`2O-SEC-003` is declared more than once"),
    );
  });
});

describe("two records that disagree without saying so", () => {
  it("refuses a silent conflict", () => {
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(
      root,
      SLICE_8,
      record.replace(
        "| `2O-SEC-003` |",
        "| `2O-ENTRY-001` | **partial** | a later record quietly disagreeing, with a destination for the owner |\n| `2O-SEC-003` |",
      ),
    );
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("`2O-ENTRY-001` is classified differently by two records"),
    );
  });

  it("accepts the same disagreement once it says it is adjudicating", () => {
    // The pair is the point: the refusal must turn on the marker and on nothing
    // else, or it is testing the sentence rather than the act.
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(
      root,
      SLICE_8,
      record.replace(
        "| `2O-SEC-003` |",
        "| `2O-ENTRY-001` | **partial** | **Re-evaluated at closeout** — remainder named, destination: the owner |\n| `2O-SEC-003` |",
      ),
    );
    expect(refusals(root)).toEqual([]);
  });
});

describe("agreement across records is not a conflict", () => {
  it("accepts a later record re-stating an earlier class", () => {
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(
      root,
      SLICE_8,
      record.replace(
        "| `2O-SEC-003` |",
        "| `2O-ENTRY-001` | **built** | re-stated, unchanged |\n| `2O-SEC-003` |",
      ),
    );
    expect(refusals(root)).toEqual([]);
  });
});

describe("a `partial` that owes something to nowhere", () => {
  it("refuses a remainder with no destination", () => {
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(
      root,
      SLICE_8,
      record.replace(
        /^\| `2O-ACCESS-006` \| \*\*partial\*\* \|.*$/m,
        "| `2O-ACCESS-006` | **partial** | **Re-stated, not promoted.** The screen-reader session is not executed and the script is written and waiting for somebody |",
      ),
    );
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("`2O-ACCESS-006` is `partial` and its remainder names no destination"),
    );
  });

  it("refuses a vacuous remainder", () => {
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(
      root,
      SLICE_8,
      record.replace(
        /^\| `2O-ACCESS-006` \| \*\*partial\*\* \|.*$/m,
        "| `2O-ACCESS-006` | **partial** | not done |",
      ),
    );
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("`2O-ACCESS-006` is `partial` and its remainder says nothing"),
    );
  });
});

describe("a `not-built-by-rule` that cites no rule", () => {
  it("refuses", () => {
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(
      root,
      SLICE_8,
      record.replace(
        /^\| `2O-METRICS-002` \| \*\*not-built-by-rule\*\* \|.*$/m,
        "| `2O-METRICS-002` | **not-built-by-rule** | there is no real producer and no real consumer, so nothing was declared here |",
      ),
    );
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("`2O-METRICS-002` is `not-built-by-rule` and cites no rule"),
    );
  });

  it("refuses the bare word `rule`, which names nothing", () => {
    // The first version of RULE_TOKENS accepted `rule` and `decision`, so a row
    // reading "closes on the same rule" passed while citing no authority — the
    // vacuous-remainder failure wearing a different label.
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(
      root,
      SLICE_8,
      record.replace(
        /^\| `2O-METRICS-002` \| \*\*not-built-by-rule\*\* \|.*$/m,
        "| `2O-METRICS-002` | **not-built-by-rule** | closes on the same rule as the others, by the owner's decision, with nothing further to add here |",
      ),
    );
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("`2O-METRICS-002` is `not-built-by-rule` and cites no rule"),
    );
  });
});

describe("the migration budget", () => {
  it("refuses a migration attributable to this phase", () => {
    const root = fixtureRoot();
    write(root, "supabase/migrations/202608180098_phase_2o_telemetry.sql", "-- planted\n");
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("the migration budget does not reconcile"),
    );
  });

  it("expects zero spent, and says so in the frozen budget", () => {
    expect(MIGRATION_BUDGET.allocated).toBe(2);
    expect(MIGRATION_BUDGET.expectedSpend).toBe(0);
    expect(MIGRATION_BUDGET.named.M1).toMatch(/UNSPENT/);
    expect(MIGRATION_BUDGET.named.M2).toMatch(/UNSPENT/);
  });
});

describe("a record whose classification section this generator cannot find", () => {
  it("refuses rather than reading zero classifications as agreement", () => {
    const root = fixtureRoot();
    const record = read(root, SLICE_8);
    write(root, SLICE_8, record.replace("## 5. Classification", "## 5. How it went"));
    expect(refusals(root)).toContainEqual(
      expect.stringContaining("states no classification section this generator recognises"),
    );
  });
});

describe("the row key is the row's subject, not the first id on the line", () => {
  it("reads the key from the first cell and ignores ids cited in evidence", () => {
    // The real line from slice 2O.2 that produced a phantom conflict.
    const line =
      "| `-003` asked at the point it matters | **partial** | …so `2O-ACTIVATION-001`'s first fact is true from the moment the account exists. **Destination: slice 2O.3** |";
    expect(readRowKey(line, "2O-ONBOARD")).toBe("2O-ONBOARD-003");
  });

  it("reads a full id when the first cell carries one", () => {
    expect(readRowKey("| `2O-PREF-001` | **built** | … |", "2O-ONBOARD")).toBe("2O-PREF-001");
  });

  it("finds no key on a line whose only id is in the evidence", () => {
    expect(readRowKey("| a heading cell | **built** | see `2O-PREF-001` |", null)).toBeNull();
  });
});

describe("the class name survives the separator that precedes it", () => {
  it("keeps `not-built-by-rule` intact", () => {
    // Stripping every dash to handle "`-001` — built" turned this into
    // "not built by rule" and made five requirements unclassifiable at once.
    expect(normalizeClass(" **not-built-by-rule** ")).toBe("not-built-by-rule");
  });

  it("still resolves a prose class introduced by an em dash", () => {
    expect(normalizeClass(" — built.** The row…")).toBe("built");
  });

  it("resolves a compound class to its head token", () => {
    expect(normalizeClass("**baseline** (re-asserted) / made true by M1")).toBe("baseline");
  });

  it("returns null for something that is not a class", () => {
    expect(normalizeClass("**yes, already**")).toBeNull();
  });
});

describe("a requirement may not discharge its own obligation", () => {
  const entry = (id: string, evidence: string) => ({ id, evidence, classification: "partial" });

  it("strips the subject before looking for a destination", () => {
    // A row naming only itself names nowhere, and a check that forgot to strip
    // would pass on it because the id matches a token.
    expect(namesDestination(entry("2O-ONBOARD-003", "| x | partial | see `2O-ONBOARD-003` |"))).toBe(
      false,
    );
  });

  it("accepts a destination that is somewhere else", () => {
    expect(
      namesDestination(entry("2O-ONBOARD-003", "| x | partial | remainder → the owner, see slice 2O.3 |")),
    ).toBe(true);
  });

  it("hands a prose row its own line rather than an empty string", () => {
    // Slicing table cells unconditionally gave prose rows nothing to test, so a
    // prose `partial` would have failed a check it never took.
    const prose = "**`-003` partial.** The remainder goes to the owner.";
    expect(evidenceWithoutSubject(entry("2O-ONBOARD-003", prose))).toContain("owner");
  });

  it("calls a three-word remainder vacuous", () => {
    expect(remainderIsVacuous(entry("2O-ONBOARD-003", "| x | partial | not done yet |"))).toBe(true);
  });
});

describe("resolution", () => {
  const declared = [{ id: "2O-ENTRY-001" }, { id: "2O-ENTRY-002" }];

  it("takes the later class when the records agree", () => {
    const records = [
      { entries: [{ id: "2O-ENTRY-001", classification: "built", slice: "2O.1", adjudicates: false }] },
      { entries: [{ id: "2O-ENTRY-001", classification: "built", slice: "2O.3", adjudicates: false }] },
    ];
    const { resolved, conflicts } = resolveClassifications(declared, records);
    expect(conflicts).toEqual([]);
    expect(resolved.get("2O-ENTRY-001").slice).toBe("2O.3");
  });

  it("reports a disagreement rather than letting the later one win", () => {
    const records = [
      { entries: [{ id: "2O-ENTRY-001", classification: "built", slice: "2O.1", adjudicates: false }] },
      { entries: [{ id: "2O-ENTRY-001", classification: "partial", slice: "2O.3", adjudicates: false }] },
    ];
    const { resolved, conflicts } = resolveClassifications(declared, records);
    expect(resolved.has("2O-ENTRY-001")).toBe(false);
    expect(conflicts).toHaveLength(1);
  });

  it("records which slices an explicit adjudication overturned", () => {
    const records = [
      { entries: [{ id: "2O-ENTRY-001", classification: "partial", slice: "2O.1", adjudicates: false }] },
      { entries: [{ id: "2O-ENTRY-001", classification: "built", slice: "2O.8", adjudicates: true }] },
    ];
    const { resolved, conflicts } = resolveClassifications(declared, records);
    expect(conflicts).toEqual([]);
    expect(resolved.get("2O-ENTRY-001").classification).toBe("built");
    expect(resolved.get("2O-ENTRY-001").adjudicated).toEqual(["2O.1"]);
  });
});

describe("the declaration extraction is not vacuous", () => {
  it("finds nothing in a document with no declarations", () => {
    // An extraction that silently returns [] would make every count below pass
    // trivially, which is `R-2O-3`'s stated failure mode.
    expect(declaredRequirements("# nothing here\n\nsome prose.\n").requirements).toEqual([]);
  });

  it("finds exactly what a two-declaration document declares", () => {
    const source = "- **2O-ENTRY-001:** first\n- **2O-ENTRY-002:** second\n";
    expect(declaredRequirements(source).requirements.map((r) => r.id)).toEqual([
      "2O-ENTRY-001",
      "2O-ENTRY-002",
    ]);
  });

  it("reports a duplicate rather than silently collapsing it", () => {
    const source = "- **2O-ENTRY-001:** first\n- **2O-ENTRY-001:** again\n";
    expect(declaredRequirements(source).duplicates).toEqual(["2O-ENTRY-001"]);
  });
});

describe("the repository itself — the positive control", () => {
  const result = audit();

  it("refuses nothing", () => {
    expect(result.refusals).toEqual([]);
  });

  it("declares 116 and classifies 116, with none left over", () => {
    expect(result.requirements).toHaveLength(DECLARED_TOTAL);
    expect(result.resolved.size).toBe(DECLARED_TOTAL);
    expect(result.conflicts).toEqual([]);
  });

  it("creates no migration", () => {
    expect(result.migrations).toEqual([]);
  });

  it("locks the counts every other document must re-derive", () => {
    // These five numbers appear in STATE.md, TODO.md, CHANGELOG.md and the
    // closing report. Locking them here is what makes those documents derived
    // rather than transcribed: a classification that moves fails this first.
    expect(counts(result.resolved)).toEqual({
      built: 106,
      baseline: 3,
      partial: 2,
      "not-built-by-rule": 5,
      undelivered: 0,
    });
  });

  it("delivers no requirement as `undelivered`", () => {
    expect(counts(result.resolved).undelivered).toBe(0);
  });

  it("uses only the five classes the contract names", () => {
    for (const entry of result.resolved.values()) {
      expect(CLASSES).toContain(entry.classification);
    }
  });

  it("matches its sources through --check, on a working copy git may have converted", () => {
    /*
     * The gap that let a real defect through. This suite asserted the matrix
     * *contained* some markers, which is not what `--check` does — `--check`
     * compares the whole document, and it was comparing raw bytes.
     *
     * The repository stores LF and the generator writes LF, but `core.autocrlf`
     * checks the file out with **CRLF on Windows**, so `--check` refused a tree
     * that was completely correct and passed in CI, where nothing converts. It
     * only surfaced when `--check` ran after a `git checkout` rather than after
     * the generator's own write.
     *
     * Both directions, because normalising is a narrowing and a narrowing needs
     * a control: a CRLF copy of the right document matches, and a copy with one
     * real change does not.
     */
    const rendered = render(audit());
    const asCheckedOutOnWindows = rendered.replace(/\n/g, "\r\n");

    expect(normalizeNewlines(asCheckedOutOnWindows)).toBe(normalizeNewlines(rendered));

    const handEdited = rendered.replace("| `built` | 106 |", "| `built` | 107 |");
    expect(handEdited, "the control must actually change the document").not.toBe(rendered);
    expect(normalizeNewlines(handEdited)).not.toBe(normalizeNewlines(rendered));
  });

  it("still refuses a matrix whose content moved, whatever its line endings", () => {
    // The narrowing must not become "any difference is a line ending".
    const rendered = render(audit());
    const plantedRow = "| `2O-GHOST-001` | `built` | 2O.8 | planted |";
    const reordered = `${rendered.replace(/\n/g, "\r\n")}${plantedRow}\r\n`;
    expect(normalizeNewlines(reordered)).not.toBe(normalizeNewlines(rendered));
  });

  it("keeps the generated matrix in step with its sources", () => {
    // `--check` compares byte for byte; this asserts the committed file is the
    // one the sources produce, so a hand edit to the matrix fails CI.
    const matrix = readFileSync(join(REPOSITORY_ROOT, MATRIX), "utf8");
    expect(matrix).toContain("Do not edit by hand");
    expect(matrix).toContain("**116 declared · 116 classified · 0 unclassified.**");
  });
});
