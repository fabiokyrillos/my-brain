import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFERRED,
  NOT_DELIVERED,
  REPOSITORY_ROOT,
  classify,
  findings,
  parseRequirements,
  renderMatrix,
} from "../../../scripts/generate-signup-hardening-traceability.mjs";

/**
 * SH-OPERATIONS-001 / SH-OPERATIONS-005 — the traceability generator's own guard.
 *
 * A generator that only ever runs against the real repository proves one thing:
 * that the repository is currently fine. It says nothing about whether the
 * generator would NOTICE if it were not — and a matrix that cannot fail is a
 * document asserting that somebody once typed it correctly.
 *
 * So every case below builds a fixture repository carrying exactly one
 * deliberate defect and asserts the generator finds it, paired with the clean
 * fixture as a positive control. Both directions, or neither is evidence.
 */

const REPO = REPOSITORY_ROOT;

function fixture(mutate: (root: string) => void = () => {}): string {
  const root = mkdtempSync(join(tmpdir(), "sh-trace-"));
  mkdirSync(join(root, "docs/reports"), { recursive: true });
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  cpSync(join(REPO, "docs/SIGNUP_HARDENING_PRD.md"), join(root, "docs/SIGNUP_HARDENING_PRD.md"));
  for (const slice of ["00", "01", "02", "03", "04", "05", "06"]) {
    writeFileSync(join(root, `docs/reports/SIGNUP_HARDENING_SLICE_${slice}_ACCEPTANCE.md`), "# fixture\n");
  }
  writeFileSync(join(root, "supabase/migrations/202608050077_retention_and_exposure.sql"), "-- fixture\n");
  mutate(root);
  return root;
}

function withFixture(mutate: (root: string) => void, assertion: (root: string) => void) {
  const root = fixture(mutate);
  try {
    assertion(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("the generator is clean against a correct repository", () => {
  it("finds nothing wrong with the real one", () => {
    // The positive control. Without it, every case below is satisfied by a
    // generator that refuses everything.
    expect(findings(REPO)).toEqual([]);
  });

  it("parses the whole declared inventory", () => {
    const rows = parseRequirements(REPO);
    expect(rows.length).toBeGreaterThanOrEqual(130);
    expect(new Set(rows.map((r) => r.family)).size).toBeGreaterThanOrEqual(15);
  });

  it("classifies every requirement into exactly one class", () => {
    // SH-OPERATIONS-005 as a program: a requirement in no class is the omission
    // the final report exists to make impossible.
    const rows = parseRequirements(REPO);
    const counts = { delivered: 0, deferred: 0, "not-delivered": 0 };
    for (const row of rows) counts[classify(row).status as keyof typeof counts] += 1;
    expect(counts.delivered + counts.deferred + counts["not-delivered"]).toBe(rows.length);
    expect(counts.deferred).toBe(Object.keys(DEFERRED).length);
    expect(counts["not-delivered"]).toBe(Object.keys(NOT_DELIVERED).length);
  });
});

describe("the generator refuses to print past a defect", () => {
  it("catches a requirement claiming a slice the plan does not declare", () => {
    withFixture(
      (root) => {
        const path = join(root, "docs/SIGNUP_HARDENING_PRD.md");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace("| **SH-QUOTA-001** |", "| **SH-QUOTA-001** |").replace(
            /(\| \*\*SH-QUOTA-001\*\* \|[^|]*\| )SH\.6( \|)/,
            "$1SH.9$2",
          ),
        );
      },
      (root) => {
        expect(findings(root).some((f) => f.includes("SH.9"))).toBe(true);
      },
    );
  });

  it("catches a missing acceptance artifact", () => {
    withFixture(
      (root) => rmSync(join(root, "docs/reports/SIGNUP_HARDENING_SLICE_03_ACCEPTANCE.md")),
      (root) => {
        expect(findings(root).some((f) => f.includes("SLICE_03_ACCEPTANCE"))).toBe(true);
      },
    );
  });

  it("catches a chain head that is not the SH close head", () => {
    withFixture(
      (root) => writeFileSync(join(root, "supabase/migrations/202609010078_something.sql"), "-- x\n"),
      (root) => {
        expect(findings(root).some((f) => f.includes("chain head"))).toBe(true);
      },
    );
  });

  it("catches an inventory that silently stopped parsing", () => {
    // The failure mode every parser-backed guard has: the anchor changes, the
    // list comes back nearly empty, and the report describes nothing while
    // looking complete.
    withFixture(
      (root) => writeFileSync(join(root, "docs/SIGNUP_HARDENING_PRD.md"), "# empty\n"),
      (root) => {
        expect(findings(root).some((f) => f.includes("implausibly small"))).toBe(true);
      },
    );
  });

  it("catches a classification entry the PRD does not declare", () => {
    // The stale-entry direction. A requirement removed from the PRD but left in
    // the not-delivered map would otherwise keep being reported as accounted for.
    withFixture(
      (root) => {
        const path = join(root, "docs/SIGNUP_HARDENING_PRD.md");
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace("| **SH-STORAGE-006**", "| **SH-STORAGE-996**"),
        );
      },
      (root) => {
        expect(findings(root).some((f) => f.includes("SH-STORAGE-006"))).toBe(true);
      },
    );
  });
});

describe("the rendered matrix says what it counted", () => {
  it("states the totals and the three classes", () => {
    const matrix = renderMatrix(REPO);
    const rows = parseRequirements(REPO);
    expect(matrix).toContain(`**${rows.length} requirements**`);
    expect(matrix).toContain("Delivered");
    expect(matrix).toContain("deferred with a destination");
    expect(matrix).toContain("not delivered and named");
  });

  it("lists every requirement exactly once", () => {
    const matrix = renderMatrix(REPO);
    for (const row of parseRequirements(REPO)) {
      const occurrences = matrix.split(`| ${row.id} |`).length - 1;
      expect(occurrences, `${row.id} appears ${occurrences} times`).toBe(1);
    }
  });

  it("names a destination for every requirement that is not delivered", () => {
    // "Not delivered" without a reason is the state SH-OPERATIONS-005 forbids.
    for (const note of [...Object.values(NOT_DELIVERED), ...Object.values(DEFERRED)]) {
      expect(note.length).toBeGreaterThan(30);
    }
  });
});
