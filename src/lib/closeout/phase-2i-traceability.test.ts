/**
 * `2I-CLOSE-001` — the generator is mutation-proved.
 *
 * ## Why fixtures rather than only the real repository
 *
 * A generator that passes against a correct repository has demonstrated
 * nothing: so would a generator that returns success unconditionally. The
 * property under test is **that it refuses**, and the only way to test a
 * refusal is to build a repository worth refusing.
 *
 * **One fixture, one defect.** A fixture producing two findings proves less,
 * not more, because it cannot say which rule fired — the discipline Phase 2H
 * recorded across its thirteen fixtures.
 *
 * The real repository is the **positive control**: if it ever fails to produce
 * a clean model, every negative below could be passing for the wrong reason.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { buildPhase2iTraceability } from "../../../scripts/generate-phase-2i-traceability.mjs";

const REPO = process.cwd();
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/**
 * A throwaway repository carrying only what the generator reads: one declared
 * requirement, one evidencing acceptance record, and an empty migrations
 * directory. Each fixture below mutates exactly one thing.
 */
function fixture(options: {
  prd?: string;
  acceptance?: Record<string, string>;
  migrations?: string[];
  omitPrd?: boolean;
}): string {
  const root = mkdtempSync(join(tmpdir(), "2i-trace-"));
  roots.push(root);
  mkdirSync(join(root, "docs/initiatives/phase-2i"), { recursive: true });
  mkdirSync(join(root, "docs/reports/phase-2i"), { recursive: true });
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });

  if (!options.omitPrd) {
    writeFileSync(
      join(root, "docs/initiatives/phase-2i/PHASE_2I_PRD.md"),
      options.prd ?? "# PRD\n\n- **2I-LANG-001:** the tokens.\n",
    );
  }

  const acceptance = options.acceptance ?? {
    "PHASE_2I_SLICE_01_ACCEPTANCE.md":
      "# 2I.1\n\n| Id | Class | Evidence |\n| --- | --- | --- |\n"
      + "| `2I-LANG-001` | **built** | src/features/experience/state-vocabulary.ts declares six tones |\n",
  };
  for (const [name, body] of Object.entries(acceptance)) {
    writeFileSync(join(root, "docs/reports/phase-2i", name), body);
  }

  for (const name of options.migrations ?? []) {
    writeFileSync(join(root, "supabase/migrations", name), "-- x\n");
  }

  return root;
}

describe("2I-CLOSE-001: the positive control", () => {
  it("produces a clean model against the real repository", () => {
    // If this ever fails, every negative below could be passing for the wrong
    // reason — a generator that refuses everything refuses correct input too.
    const model = buildPhase2iTraceability({ root: REPO });
    expect(model.failures, `real repository findings: ${model.failures.join(" | ")}`).toEqual([]);
    expect(model.declared.length).toBeGreaterThan(30);
  });

  it("classifies every declared requirement", () => {
    const model = buildPhase2iTraceability({ root: REPO });
    for (const id of model.declared) {
      expect(model.evidence.has(id), `${id} is unclassified`).toBe(true);
    }
  });

  it("closes the migration budget at zero spent", () => {
    const model = buildPhase2iTraceability({ root: REPO });
    expect(model.migrations).toEqual([]);
  });

  it("accepts the fixture shape, so the negatives differ by one thing only", () => {
    // The baseline fixture must be CLEAN. Otherwise each negative below is
    // asserting a refusal that the fixture would have produced anyway.
    const model = buildPhase2iTraceability({ root: fixture({}) });
    expect(model.failures).toEqual([]);
  });
});

describe("2I-CLOSE-001: it refuses, and for the stated reason", () => {
  it("1. a requirement declared and never evidenced", () => {
    const root = fixture({ acceptance: { "PHASE_2I_SLICE_01_ACCEPTANCE.md": "# 2I.1\n\nnothing here\n" } });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/2I-LANG-001.*evidenced by no slice/);
  });

  it("2. a citation too thin to be evidence", () => {
    const root = fixture({
      acceptance: {
        "PHASE_2I_SLICE_01_ACCEPTANCE.md":
          "| Id | Class | Evidence |\n| --- | --- | --- |\n| `2I-LANG-001` | **built** | yes |\n",
      },
    });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/no substantive citation/);
  });

  it("3. a requirement evidenced but never declared", () => {
    const root = fixture({
      acceptance: {
        "PHASE_2I_SLICE_01_ACCEPTANCE.md":
          "| Id | Class | Evidence |\n| --- | --- | --- |\n"
          + "| `2I-LANG-001` | **built** | src/features/experience/state-vocabulary.ts |\n"
          + "| `2I-LANG-999` | **built** | a requirement nobody declared anywhere at all |\n",
      },
    });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/2I-LANG-999.*declared nowhere/);
  });

  it("4. a wrong-phase requirement declared in the 2I PRD", () => {
    const root = fixture({
      prd: "# PRD\n\n- **2I-LANG-001:** the tokens.\n- **2H-DEPLOY-001:** the runbook.\n",
    });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/outside the 2I- namespace/);
  });

  it("5. a requirement claimed by two slices", () => {
    const body =
      "| Id | Class | Evidence |\n| --- | --- | --- |\n"
      + "| `2I-LANG-001` | **built** | src/features/experience/state-vocabulary.ts |\n";
    const root = fixture({
      acceptance: {
        "PHASE_2I_SLICE_01_ACCEPTANCE.md": body,
        "PHASE_2I_SLICE_02_ACCEPTANCE.md": body,
      },
    });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/claimed by more than one slice/);
  });

  it("6. a requirement evidenced by the wrong owning slice", () => {
    const root = fixture({
      acceptance: {
        "PHASE_2I_SLICE_02_ACCEPTANCE.md":
          "| Id | Class | Evidence |\n| --- | --- | --- |\n"
          + "| `2I-LANG-001` | **built** | src/features/experience/state-vocabulary.ts |\n",
      },
    });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/family 2I-LANG \(slice 2I.1\) but is evidenced by 2I.2/);
  });

  it("7. an unknown class", () => {
    const root = fixture({
      acceptance: {
        "PHASE_2I_SLICE_01_ACCEPTANCE.md":
          "| Id | Class | Evidence |\n| --- | --- | --- |\n"
          + "| `2I-LANG-001` | **mostly done** | src/features/experience/state-vocabulary.ts |\n",
      },
    });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/unknown class/);
  });

  it("8. two migrations against a budget of one", () => {
    const root = fixture({
      migrations: ["202609010001_phase_2i_a.sql", "202609010002_phase_2i_b.sql"],
    });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/2 migrations against a budget of 1/);
  });

  it("9. slice 2I.5 not stating that ADR-055 remains open", () => {
    const root = fixture({
      acceptance: {
        "PHASE_2I_SLICE_01_ACCEPTANCE.md":
          "| Id | Class | Evidence |\n| --- | --- | --- |\n"
          + "| `2I-LANG-001` | **built** | src/features/experience/state-vocabulary.ts |\n",
        "PHASE_2I_SLICE_05_ACCEPTANCE.md": "# 2I.5\n\nsearch shipped and it is lovely\n",
      },
    });
    const model = buildPhase2iTraceability({ root });
    expect(model.failures.join(" ")).toMatch(/ADR-055 remains open/);
  });

  it("10. a missing PRD throws rather than returning an empty matrix", () => {
    // Fail-closed. The dangerous failure is not a refusal, it is a generator
    // that finds nothing and reports success.
    expect(() => buildPhase2iTraceability({ root: fixture({ omitPrd: true }) })).toThrow(
      /PHASE_2I_PRD\.md does not exist/,
    );
  });

  it("11. a PRD that declares nothing throws rather than printing an empty matrix", () => {
    expect(() => buildPhase2iTraceability({ root: fixture({ prd: "# PRD\n\nno requirements here\n" }) })).toThrow(
      /declares no 2I- requirement/,
    );
  });
});

describe("2I-CLOSE-001: the classes are carried, not flattened", () => {
  it("counts baseline separately from built", () => {
    const model = buildPhase2iTraceability({ root: REPO });
    // This phase's audit was wrong three times about what was already shipped.
    // A matrix that reported an assertion identically to a build would
    // overstate the phase, so `baseline` must actually be in use.
    expect(model.classes.baseline).toBeGreaterThan(0);
    expect(model.classes.built).toBeGreaterThan(0);
  });

  it("accepts the two evidenced negatives this phase produced", () => {
    const model = buildPhase2iTraceability({ root: REPO });
    // 2I-LIB-004 (no pin column exists) and 2I-PALETTE-009 (recents would need
    // state that 2I-PALETTE-010 forbids). Both are delivered by NOT being
    // built, with evidence — the contract's rule 10.
    expect(model.classes["not built, by rule"]).toBeGreaterThanOrEqual(2);
  });
});
