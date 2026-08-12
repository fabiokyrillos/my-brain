import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 2M's declaration and count guard, written **during planning** because
 * that is when the count first appears in prose.
 *
 * ## Why this exists before any slice does
 *
 * `R-27` in `docs/reports/phase-2m/PHASE_2M_TRACEABILITY_CONTRACT.md` refuses a
 * count the generator cannot reproduce from the declarations — *including one
 * that happens to be right*. The generator itself is a closeout artifact and
 * deliberately does not exist yet: run against a phase with zero acceptance
 * records it would report every requirement unresolved, which is the lesson
 * Phase 2H recorded.
 *
 * But the **count** is already load-bearing. ADR-104 states it, the PRD states
 * it, the plan states it, `STATE.md`, `TODO.md`, `CHANGELOG.md` and two indexes
 * state it. Phase 2K's count was wrong in **five** documents simultaneously, and
 * it stayed wrong because each was checked against the others — five documents
 * agreeing is not evidence. So the extraction lands with the declarations, and
 * every prose claim is compared to **it**, never to another document.
 *
 * ## Why the family names are asserted
 *
 * `2K-A11Y` does not match `2M-[A-Z]+-\d{3}` — the shape both the A13 detector
 * and every traceability generator here use — because its family name contains
 * digits. That is precisely why Phase 2K's seven accessibility requirements were
 * invisible to every prose count *and* would have been invisible to the
 * phase-start detector's signal 2. This asserts the property directly rather
 * than trusting the next author to remember it.
 *
 * This guard makes no claim about what is *built*. Phase 2M is authorized for
 * planning only, and a declaration is not an implementation.
 */

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

/** The declaration shape, identical to the A13 detector's. */
const DECLARATION = /^- \*\*(2M-[A-Z]+-\d{3}):\*\*/gm;

/** The shape a *family name* must have to be expressible by that pattern. */
const EXPRESSIBLE_FAMILY = /^[A-Z]+$/;

export function declaredRequirements(prd: string): string[] {
  return [...prd.matchAll(DECLARATION)].map((match) => match[1]);
}

export function familyOf(id: string): string {
  return id.slice("2M-".length, id.lastIndexOf("-"));
}

const PRD = "docs/initiatives/phase-2m/PHASE_2M_PRD.md";

describe("Phase 2M: the requirement set, extracted rather than typed", () => {
  const ids = declaredRequirements(read(PRD));

  it("declares 94 requirements", () => {
    expect(ids).toHaveLength(94);
  });

  it("declares each id exactly once", () => {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates, `duplicated: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("declares thirteen families, each expressible by the shared pattern", () => {
    const families = [...new Set(ids.map(familyOf))].sort();
    expect(families).toEqual([
      "ACCESS", "AUDIT", "CAL", "CLOSE", "DEVICE", "METRICS", "MOBILE",
      "NOTIFY", "PLAN", "PRIVACY", "RECUR", "REVIEW", "TIME",
    ]);
    for (const family of families) {
      expect(family, `family '${family}' contains a character the shared pattern cannot express`)
        .toMatch(EXPRESSIBLE_FAMILY);
    }
  });

  it("carries per-family counts that sum to the declared total", () => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(familyOf(id), (counts.get(familyOf(id)) ?? 0) + 1);
    expect(Object.fromEntries([...counts.entries()].sort())).toEqual({
      ACCESS: 7, AUDIT: 8, CAL: 11, CLOSE: 6, DEVICE: 5, METRICS: 6, MOBILE: 5,
      NOTIFY: 11, PLAN: 10, PRIVACY: 6, RECUR: 4, REVIEW: 8, TIME: 7,
    });
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(94);
  });

  it("numbers each family from 001 with no gap", () => {
    // A gap is how a requirement gets quietly removed: the count still looks
    // plausible and no id is duplicated, but something was dropped.
    const byFamily = new Map<string, number[]>();
    for (const id of ids) {
      const family = familyOf(id);
      byFamily.set(family, [...(byFamily.get(family) ?? []), Number(id.slice(-3))]);
    }
    for (const [family, numbers] of byFamily) {
      const sorted = [...numbers].sort((a, b) => a - b);
      expect(sorted, `family ${family} is not 1..n`)
        .toEqual(Array.from({ length: sorted.length }, (_, index) => index + 1));
    }
  });
});

describe("R-27: every document that states this phase's count agrees with the extraction", () => {
  const total = declaredRequirements(read(PRD)).length;

  /*
   * Checked against the *extraction*, never against another document.
   *
   * `STATE.md` is deliberately absent for the reason Phase 2L recorded: it keeps
   * prior paragraphs verbatim, so it legitimately contains superseded counts in
   * its retained history, and asserting over it would demand rewriting a record
   * that is correct about the past.
   */
  const documents = [
    PRD,
    "docs/initiatives/phase-2m/PHASE_2M_IMPLEMENTATION_PLAN.md",
    "docs/DECISIONS.md",
    "docs/CHANGELOG.md",
    "docs/TODO.md",
    "docs/reports/README.md",
  ];

  /**
   * A count claim this phase owns: a line that names **2M and no other lettered
   * phase**, carrying `<n> requirement(s)`.
   *
   * The exclusion is what makes the rule honest rather than clever. These
   * documents legitimately state Phase 2L's 82, Phase 2K's 79 and Phase 2H's 44,
   * and a line that names two phases is ambiguous about which count belongs to
   * which. Ambiguous lines are **not** compared; unambiguous ones must all
   * agree, and at least one must exist, so the rule cannot pass by matching
   * nothing.
   *
   * Markdown emphasis is stripped first: `**94** requirements` is the same claim
   * as `94 requirements`, and a guard that missed the bold form would be blind
   * to the index line most likely to go stale.
   */
  function ownedClaims(source: string): number[] {
    return source
      .replace(/\*/g, "")
      .split("\n")
      .filter((line) => /2M/.test(line) && !/2[HIJKLNO]\b/.test(line))
      .flatMap((line) => [...line.matchAll(/(\d+) requirements?/g)])
      .map((match) => Number(match[1]));
  }

  for (const document of documents) {
    it(`${document} states ${total} wherever it states this phase's count`, () => {
      const claims = ownedClaims(read(document));
      expect(claims.length, "no unambiguous Phase 2M count claim found to compare")
        .toBeGreaterThan(0);
      for (const claim of claims) expect(claim).toBe(total);
    });
  }

  it("fires on a stale count, and ignores another phase's", () => {
    // The mutation that proves the rule. Without this, a rule that matched
    // nothing would pass every document above.
    expect(ownedClaims("Phase 2M declares 88 requirements across thirteen families.")).toEqual([88]);
    expect(ownedClaims("Phase 2L declares 82 requirements across ten families.")).toEqual([]);
    expect(ownedClaims("Phase 2M follows Phase 2L's 82 requirements.")).toEqual([]);
    expect(ownedClaims("Phase 2M declares **94** requirements.")).toEqual([94]);
  });

  it("proves the extraction itself is not returning zero", () => {
    expect(total).toBe(94);
  });
});

/**
 * The authorization chain, asserted rather than remembered.
 *
 * ADR-104 authorized planning; ADR-105 authorized implementation through
 * closeout and signed all seven decisions. Both must be present and both must
 * be accepted, because a package that describes signed decisions while the
 * signature has been removed is exactly the "unexplained phase start" the A13
 * guard refuses one level up.
 */
describe("Phase 2M's authorization chain is recorded, not assumed", () => {
  const decisions = read("docs/DECISIONS.md");

  function adrBlock(adr: string): string {
    const start = decisions.indexOf(`## ${adr} —`);
    expect(start, `${adr} not found`).toBeGreaterThan(0);
    const next = decisions.indexOf("\n## ADR-", start + 1);
    return decisions.slice(start, next === -1 ? undefined : next);
  }

  it("records ADR-104 as an accepted, planning-only owner decision", () => {
    const block = adrBlock("ADR-104");
    expect(block).toMatch(/\*\*Status:\*\* Accepted/);
    expect(block).toMatch(/authorizes \*\*planning only\*\*/);
    expect(block, "a planning-only ADR must refuse implementation explicitly")
      .toMatch(/does \*\*not\*\* authorize implementation/);
  });

  it("records ADR-105 as the accepted implementation authorization", () => {
    const block = adrBlock("ADR-105");
    expect(block).toMatch(/\*\*Status:\*\* Accepted/);
    expect(block).toMatch(/authorizes slices \*\*2M\.0–2M\.5\*\*/);
    expect(block, "the budget must be stated as non-transferable")
      .toMatch(/NON-TRANSFERABLE/);
    expect(block, "a third migration is a stop condition, not a judgement call")
      .toMatch(/third migration/i);
  });

  it("carries all seven signed decisions in the PRD, each naming what it signed", () => {
    const prd = read(PRD);
    for (const decision of [
      "OD-2M-1", "OD-2M-2", "OD-2M-3", "OD-2M-4", "OD-2M-5", "OD-2M-6", "OD-2M-7",
    ]) {
      expect(prd, `${decision} is not marked signed in the PRD`)
        .toMatch(new RegExp(`### ${decision} —[^\\n]*\\*\\*SIGNED`));
    }
  });

  it("states the migration budget as three allocated, non-transferable, and one spent", () => {
    const prd = read(PRD);
    // The authorization-time figure is a historical fact and stays readable:
    // ADR-105 fixed `2 allocated · 0 spent`, and rewriting that sentence would
    // make the budget look as though it had always been three.
    expect(prd).toMatch(/\*\*`2 allocated · 0 spent` at authorization/);
    expect(prd, "the current budget must be stated, not only the original one")
      .toMatch(/\*\*`3 allocated · 1 spent` after ADR-106/);
    expect(prd).toMatch(/NON-TRANSFERABLE/);
    expect(prd, "a third migration was a stop condition, and it was raised as one")
      .toMatch(/third migration is a stop condition/i);
    expect(prd, "the rule must move up rather than dissolve: a fourth is now the stop")
      .toMatch(/\*\*a fourth migration is a stop condition\*\*/i);
  });

  /*
   * ADR-106 is the one place a Phase 2M migration was added after
   * authorization, and the risk it carries is precedent: "a migration may be
   * added when the work is hard" is a different rule from the one the owner
   * signed. These assertions pin the three properties that keep it narrow —
   * exclusivity to `clear_planned`, non-substitution for migration 2, and no
   * scope or successor expansion — so a later reading cannot widen it silently.
   */
  it("records ADR-106 as an accepted, single-purpose migration authorization", () => {
    const block = adrBlock("ADR-106");
    expect(block).toMatch(/\*\*Status:\*\* Accepted/);
    expect(block, "the third migration must be exclusive to clear_planned")
      .toMatch(/`clear_planned` and nothing else/);
    expect(block, "it must not reallocate the push migration")
      .toMatch(/does not substitute for, reallocate or reduce migration 2/);
    expect(block, "it must not widen the phase or start the successor")
      .toMatch(/does not widen Phase 2M's functional scope/);
    expect(block, "the budget must be restated in full")
      .toMatch(/`3 allocated · 1 spent`/);
    expect(block, "the stop condition must move up rather than disappear")
      .toMatch(/A fourth migration remains a stop condition/);
  });

  it("keeps the traceability contract's budget refusal in step with ADR-106", () => {
    const contract = read("docs/reports/phase-2m/PHASE_2M_TRACEABILITY_CONTRACT.md");
    expect(contract).toMatch(/\*\*`3 allocated`, NON-TRANSFERABLE\*\* after ADR-106/);
    expect(contract, "a fourth migration must be the refusal now").toMatch(/a \*\*fourth\*\* migration, in any form/);
    expect(contract, "migration 3 must be refused any content but clear_planned")
      .toMatch(/other than\s+`clear_planned`/);
  });

  it("keeps recurrence out by rule rather than as a partial", () => {
    const prd = read(PRD);
    expect(prd).toMatch(/2M-RECUR-001:\*\* Recurrence is \*\*out of scope by rule\*\*/);
    expect(prd, "the family must close not-built-by-rule, never partial")
      .toMatch(/closes \*\*not-built-by-rule\*\* against OD-2M-7 rather than as a partial/);
  });

  it("requires both closeout artifacts, and requires the matrix to be generated", async () => {
    /*
     * This assertion used to be its own inverse.
     *
     * While the phase was mid-flight it forbade
     * `PHASE_2M_TRACEABILITY_MATRIX.md` and `PHASE_2M_REPORT.md` from existing
     * at all, because *a matrix written early is a classification of work that
     * has not happened*. That was right then and is exactly wrong at closeout,
     * where the same two artifacts are the deliverable.
     *
     * **Inverted rather than deleted, in ADR-107's own unit**, and the
     * replacement is the stronger contract: the matrix must be byte-identical
     * to what `scripts/generate-phase-2m-traceability.mjs` produces from the
     * slice records, so it cannot be typed, hand-edited, or left behind when a
     * record changes. `2M-CLOSE-001` asks for exactly that — *"classified
     * exactly once, from the slice records, by a generator — never typed into a
     * report"* — and until now nothing enforced the "never typed" half.
     *
     * Slice acceptance records were removed from the forbidden list earlier, for
     * the same reason in the other direction: ADR-105 authorized execution, so a
     * slice that has run is *required* to have one.
     */
    const matrixPath = "docs/reports/phase-2m/PHASE_2M_TRACEABILITY_MATRIX.md";
    const reportPath = "docs/reports/phase-2m/PHASE_2M_REPORT.md";
    for (const relative of [matrixPath, reportPath]) {
      expect(() => read(relative), `${relative} is missing at closeout`).not.toThrow();
    }

    const { buildPhase2mTraceability, renderMatrix } = await import(
      "../../../scripts/generate-phase-2m-traceability.mjs"
    );
    const result = buildPhase2mTraceability({ complete: true });
    expect(result.failures, "the generator refuses the slice records it was given").toEqual([]);
    expect(
      read(matrixPath).replace(/\r\n/g, "\n"),
      "the committed matrix is not what the generator produces — it was edited, or a record moved under it",
    ).toBe(renderMatrix(result).replace(/\r\n/g, "\n"));
  });

  it("requires an acceptance record for every slice that has run", () => {
    // The mirror of the rule above: an executed slice with no record is work
    // nobody can classify, which `R-01` refuses at close. Slice 2M.0 has run.
    expect(() => read("docs/reports/phase-2m/PHASE_2M_SLICE_00_ACCEPTANCE.md")).not.toThrow();
  });
});
