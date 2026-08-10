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

describe("Phase 2M is authorized for planning only, and the documents say so", () => {
  it("records ADR-104 as an accepted, planning-only owner decision", () => {
    const decisions = read("docs/DECISIONS.md");
    const start = decisions.indexOf("## ADR-104 —");
    expect(start, "ADR-104 not found").toBeGreaterThan(0);
    const next = decisions.indexOf("\n## ADR-", start + 1);
    const block = decisions.slice(start, next === -1 ? undefined : next);
    expect(block).toMatch(/\*\*Status:\*\* Accepted/);
    expect(block).toMatch(/authorizes \*\*planning only\*\*/);
    expect(block, "a planning-only ADR must refuse implementation explicitly")
      .toMatch(/does \*\*not\*\* authorize implementation/);
  });

  it("creates no execution or closeout artifact", () => {
    // The gates in the implementation plan forbid these before their time, and
    // the taxonomy is such that they would have to live in this directory.
    const forbidden = [
      "docs/reports/phase-2m/PHASE_2M_TRACEABILITY_MATRIX.md",
      "docs/reports/phase-2m/PHASE_2M_REPORT.md",
      "docs/reports/phase-2m/PHASE_2M_SLICE_00_ACCEPTANCE.md",
    ];
    for (const relative of forbidden) {
      let exists = true;
      try {
        read(relative);
      } catch {
        exists = false;
      }
      expect(exists, `${relative} exists before its gate`).toBe(false);
    }
  });
});
