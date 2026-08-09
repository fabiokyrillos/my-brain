import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `R-14`/`R-15` groundwork, and gate **G-2L.0**'s own words: *82 requirements
 * extracted mechanically with no duplicate and no unclassifiable family name*.
 *
 * ## Why this exists before the traceability generator does
 *
 * The generator is slice 2L.5's, and deliberately so: a fail-closed generator
 * run against a phase with zero acceptance records reports every requirement
 * unresolved, which is the reason Phase 2H recorded for specifying it during
 * planning and building it at closeout.
 *
 * But the **count** is load-bearing from the first slice. Phase 2K stated 68 in
 * five documents and declared 79; the undercount was `2K-A11Y`, whose family
 * name contains digits and which therefore matched neither the A13 detector's
 * pattern nor any prose extraction. Nobody noticed until closeout, and by then
 * the number had been confirmed four times by documents copying each other.
 *
 * So this file does the one thing that would have caught it, on day one: it
 * extracts the declarations and refuses to agree with the prose unless the
 * prose is right.
 *
 * ## The three properties
 *
 * 1. **The shape is shared.** A declaration matches the same pattern the A13
 *    detector uses, so the guard and the phase-start guard can never disagree
 *    about what a declaration is.
 * 2. **Every family is expressible.** A family name containing a digit is
 *    invisible to that shared pattern. `2L-ACCESS` is named as it is for this
 *    reason, and the property is asserted rather than trusted.
 * 3. **The prose agrees, or the prose is wrong.** Each document stating a count
 *    is checked against the extraction — never against another document.
 */

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

/** The declaration shape, identical to the A13 detector's. */
const DECLARATION = /^- \*\*(2L-[A-Z]+-\d{3}):\*\*/gm;

/** The shape a *family name* must have to be expressible by that pattern. */
const EXPRESSIBLE_FAMILY = /^[A-Z]+$/;

export function declaredRequirements(prd: string): string[] {
  return [...prd.matchAll(DECLARATION)].map((match) => match[1]);
}

export function familyOf(id: string): string {
  return id.slice("2L-".length, id.lastIndexOf("-"));
}

describe("G-2L.0: the Phase 2L requirement set, extracted rather than typed", () => {
  const prd = read("docs/initiatives/phase-2l/PHASE_2L_PRD.md");
  const ids = declaredRequirements(prd);

  it("declares 82 requirements", () => {
    expect(ids).toHaveLength(82);
  });

  it("declares each id exactly once", () => {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates, `duplicated: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("declares ten families, each expressible by the shared pattern", () => {
    const families = [...new Set(ids.map(familyOf))].sort();
    expect(families).toEqual([
      "ACCESS", "AUDIT", "BULK", "CLOSE", "EDIT",
      "METRICS", "MOBILE", "PRIVACY", "RETURN", "VIEW",
    ]);
    for (const family of families) {
      expect(family, `family '${family}' contains a character the shared pattern cannot express`)
        .toMatch(EXPRESSIBLE_FAMILY);
    }
  });

  it("carries the per-family counts the plan's traceability table sums", () => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(familyOf(id), (counts.get(familyOf(id)) ?? 0) + 1);
    expect(Object.fromEntries([...counts.entries()].sort())).toEqual({
      ACCESS: 8, AUDIT: 6, BULK: 12, CLOSE: 7, EDIT: 10,
      METRICS: 7, MOBILE: 10, PRIVACY: 8, RETURN: 5, VIEW: 9,
    });
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(82);
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

describe("R-15: every document that states a count agrees with the extraction", () => {
  const total = declaredRequirements(read("docs/initiatives/phase-2l/PHASE_2L_PRD.md")).length;

  /*
   * Checked against the *extraction*, never against another document. Phase 2K's
   * count was wrong in five places precisely because each was checked against
   * the others, and five documents agreeing is not evidence.
   *
   * `STATE.md` is deliberately absent: it keeps prior paragraphs verbatim, so it
   * legitimately contains the superseded "76" in its retained history. Asserting
   * over it would demand rewriting a record that is correct about the past.
   */
  const documents = [
    "docs/initiatives/phase-2l/PHASE_2L_PRD.md",
    "docs/initiatives/phase-2l/PHASE_2L_IMPLEMENTATION_PLAN.md",
    "docs/reports/README.md",
    "docs/TODO.md",
  ];

  /**
   * A count claim this phase owns: a line that names **2L and no other lettered
   * phase**, carrying `<n> requirement(s)`.
   *
   * The exclusion is what makes the rule honest rather than clever. These
   * documents legitimately state Phase 2K's 79 and Phase 2H's 44, and a line
   * that names two phases — `TODO.md`'s active-milestone line names 2L and its
   * predecessor 2K — is ambiguous about which count belongs to which. Ambiguous
   * lines are **not** compared; unambiguous ones must all agree, and at least
   * one must exist, so the rule cannot pass by matching nothing.
   *
   * Markdown emphasis is stripped first: `**82** requirements` is the same claim
   * as `82 requirements`, and a guard that missed the bold form would be blind
   * to the index line most likely to go stale.
   */
  function ownedClaims(source: string): number[] {
    return source
      .replace(/\*/g, "")
      .split("\n")
      .filter((line) => /2L/.test(line) && !/2[HIJKMNO]\b/.test(line))
      .flatMap((line) => [...line.matchAll(/(\d+) requirements?/g)])
      .map((match) => Number(match[1]));
  }

  for (const document of documents) {
    it(`${document} states ${total} wherever it states this phase's count`, () => {
      const claims = ownedClaims(read(document));
      expect(claims.length, "no unambiguous Phase 2L count claim found to compare")
        .toBeGreaterThan(0);
      for (const claim of claims) expect(claim).toBe(total);
    });
  }

  it("fires on a stale count, and ignores another phase's", () => {
    // The mutation that proves the rule. Without this, a rule that matched
    // nothing would pass every document above.
    expect(ownedClaims("Phase 2L declares 76 requirements across ten families.")).toEqual([76]);
    expect(ownedClaims("Phase 2K declares 79 requirements across eleven families.")).toEqual([]);
    expect(ownedClaims("Phase 2L follows Phase 2K's 79 requirements."))
      .toEqual([]);
    expect(ownedClaims("Phase 2L declares **82** requirements.")).toEqual([82]);
  });

  it("proves the extraction itself is not returning zero", () => {
    expect(total).toBe(82);
  });
});
