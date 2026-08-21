/**
 * Phase 2Q slice 2Q.5 — **the generator's own refusals, each with a planted
 * control that makes it fail.**
 *
 * `2Q-CLOSE-001` and `2Q-CLOSE-002`.
 *
 * ## Why the controls are the point
 *
 * A generator that classified everything `built` and refused nothing would
 * satisfy "declared = classified" perfectly. So each refusal below is driven
 * over a fixture built to trip it, **and** over one built not to — because a
 * check that cannot fail is not a check, and a check that always fails is not
 * one either.
 *
 * Phase 2Q produced **no `partial` and no `not-built-by-rule` row**, which would
 * make refusal 6 vacuous against the real records. It is therefore driven over
 * planted fixtures, including the one this repository has already paid for: a
 * row that tries to satisfy "names a remainder" **by containing its own
 * identifier**.
 */
import { describe, expect, it } from "vitest";

import {
  CLASSES,
  RECORDS,
  classificationsIn,
  declaredRequirements,
  evidenceWithoutSubject,
  refusals,
  renderMatrix,
} from "../../../scripts/generate-phase-2q-traceability.mjs";

const PRD_FIXTURE = [
  "- **2Q-DEMO-001:** first. **Observable:** x. **Class:** construction.",
  "- **2Q-DEMO-002:** second. **Observable:** x. **Class:** construction.",
].join("\n");

const row = (id: string, klass: string, evidence: string) =>
  `| Requirement | Class | Evidence |\n|---|---|---|\n| \`${id}\` | **${klass}** | ${evidence} |`;

describe("2Q-CLOSE-001: the generator reads the records rather than being typed", () => {
  it("reads a classification only from the first two cells of a row", () => {
    /*
     * The two traps, in one fixture. The evidence cell names **another**
     * requirement and uses the word `baseline` in prose; neither may become a
     * classification, or the matrix would describe rows nobody wrote.
     */
    const rows = classificationsIn(
      row("2Q-DEMO-001", "built", "unlike `2Q-DEMO-002`, which is baseline, this one shipped"),
    );
    expect(rows).toEqual([
      {
        id: "2Q-DEMO-001",
        klass: "built",
        evidence: "unlike `2Q-DEMO-002`, which is baseline, this one shipped",
      },
    ]);
  });

  it("ignores a prose line that merely mentions a requirement and a class", () => {
    // Not a table row at all — a sentence. It must contribute nothing.
    expect(classificationsIn("`2Q-DEMO-001` is built and proved.")).toEqual([]);
    // A table row whose first cell is prose is not a classification either.
    expect(classificationsIn("| before the slice | `2Q-DEMO-001` | baseline |")).toEqual([]);
  });

  it("admits exactly the contract's vocabulary and nothing else", () => {
    expect(CLASSES).toEqual(["built", "baseline", "partial", "not-built-by-rule", "undelivered"]);
    expect(classificationsIn(row("2Q-DEMO-001", "shipped", "x")), "an invented class was admitted")
      .toEqual([]);
    expect(classificationsIn(row("2Q-DEMO-001", "built", "x"))).toHaveLength(1);
  });

  it("refuses an undeclared identifier, and admits a declared one", () => {
    const undeclared = refusals({ prd: PRD_FIXTURE, records: [row("2Q-GHOST-001", "built", "x")] });
    expect(undeclared.some((problem) => problem.includes("never declared"))).toBe(true);

    const declared = refusals({
      prd: PRD_FIXTURE,
      records: [row("2Q-DEMO-001", "built", "x") + "\n" + row("2Q-DEMO-002", "built", "y")],
    });
    expect(declared).toEqual([]);
  });

  it("refuses a declared identifier nobody classified", () => {
    const problems = refusals({ prd: PRD_FIXTURE, records: [row("2Q-DEMO-001", "built", "x")] });
    expect(problems).toContain("2Q-DEMO-002 is declared and never classified.");
  });

  it("refuses a conflicting classification, and a silent duplicate", () => {
    const conflicting = refusals({
      prd: PRD_FIXTURE,
      records: [
        row("2Q-DEMO-001", "built", "x") + "\n" + row("2Q-DEMO-002", "built", "y"),
        row("2Q-DEMO-001", "baseline", "z"),
      ],
    });
    expect(conflicting.some((problem) => problem.includes("both built and baseline"))).toBe(true);

    const duplicated = refusals({
      prd: PRD_FIXTURE,
      records: [
        row("2Q-DEMO-001", "built", "x") + "\n" + row("2Q-DEMO-002", "built", "y"),
        row("2Q-DEMO-001", "built", "x again"),
      ],
    });
    expect(duplicated.some((problem) => problem.includes("classified twice"))).toBe(true);
  });

  it("refuses a family with a gap, and a family name carrying a digit", () => {
    const gap = refusals({
      prd: "- **2Q-DEMO-001:** a.\n- **2Q-DEMO-003:** c.",
      records: [row("2Q-DEMO-001", "built", "x") + "\n" + row("2Q-DEMO-003", "built", "y")],
    });
    expect(gap.some((problem) => problem.includes("without gaps"))).toBe(true);

    const digits = refusals({
      prd: "- **2Q-A11Y-001:** a.",
      records: [row("2Q-A11Y-001", "built", "x")],
    });
    // The shape that hid Phase 2K's seven accessibility requirements from every
    // scan at once. It must be named, not silently skipped.
    expect(digits.length).toBeGreaterThan(0);
  });
});

describe("2Q-CLOSE-002: a partial names a remainder AND a destination", () => {
  it("refuses a row that satisfies the check BY CONTAINING ITS OWN IDENTIFIER", () => {
    /*
     * **The recorded trap.** A naive "does the evidence say anything?" passes on
     * `| 2Q-DEMO-001 | partial | 2Q-DEMO-001 |`. The subject is stripped before
     * the remainder is looked for, so the row has to say something real.
     */
    const selfReferential = {
      id: "2Q-DEMO-001",
      klass: "partial",
      evidence: "2Q-DEMO-001 2Q-DEMO-001 2Q-DEMO-001",
    };
    expect(evidenceWithoutSubject(selfReferential).trim()).toBe("");

    const problems = refusals({
      prd: PRD_FIXTURE,
      records: [
        row("2Q-DEMO-001", "partial", "2Q-DEMO-001 2Q-DEMO-001 2Q-DEMO-001")
          + "\n" + row("2Q-DEMO-002", "built", "y"),
      ],
    });
    expect(problems.some((problem) => problem.includes("no concrete remainder"))).toBe(true);
  });

  it("refuses a partial that describes a remainder but names no destination", () => {
    const problems = refusals({
      prd: PRD_FIXTURE,
      records: [
        row("2Q-DEMO-001", "partial", "the browser half of this was never executed anywhere")
          + "\n" + row("2Q-DEMO-002", "built", "y"),
      ],
    });
    expect(problems.some((problem) => problem.includes("names no destination"))).toBe(true);
  });

  it("admits a partial that names both — so the refusal is not simply always on", () => {
    const problems = refusals({
      prd: PRD_FIXTURE,
      records: [
        row("2Q-DEMO-001", "partial", "the browser half was never executed. Destination: the owner")
          + "\n" + row("2Q-DEMO-002", "built", "y"),
      ],
    });
    expect(problems).toEqual([]);
  });

  it("holds the same rule for not-built-by-rule, which must name the signed rule", () => {
    const unnamed = refusals({
      prd: PRD_FIXTURE,
      records: [
        row("2Q-DEMO-001", "not-built-by-rule", "deliberately absent from this phase entirely")
          + "\n" + row("2Q-DEMO-002", "built", "y"),
      ],
    });
    expect(unnamed.some((problem) => problem.includes("names no destination or signed rule"))).toBe(true);

    const named = refusals({
      prd: PRD_FIXTURE,
      records: [
        row("2Q-DEMO-001", "not-built-by-rule", "refused by ADR-129 Decision 3, which forbids it by name")
          + "\n" + row("2Q-DEMO-002", "built", "y"),
      ],
    });
    expect(named).toEqual([]);
  });
});

describe("the generator refuses to write anything at all when it refuses", () => {
  it("produces a matrix only for a complete, coherent input", () => {
    const matrix = renderMatrix({
      prd: PRD_FIXTURE,
      records: [row("2Q-DEMO-001", "built", "x") + "\n" + row("2Q-DEMO-002", "baseline", "y")],
    });
    expect(matrix).toContain("**2 declared · 2 classified · 0 unclassified.**");
    expect(matrix).toContain("| `2Q-DEMO-001` | built |");
    expect(matrix).toContain("| `2Q-DEMO-002` | baseline |");
    expect(matrix, "a complete matrix must carry no UNCLASSIFIED row")
      .not.toContain("UNCLASSIFIED");
  });

  it("marks an unclassified requirement rather than quietly omitting the row", () => {
    /*
     * The half that matters most: a matrix that dropped an unclassified
     * requirement would read as complete. It must be present and loud — and the
     * `refusals()` gate means such a matrix is never written to disk at all.
     */
    const matrix = renderMatrix({ prd: PRD_FIXTURE, records: [row("2Q-DEMO-001", "built", "x")] });
    expect(matrix).toContain("| `2Q-DEMO-002` | **UNCLASSIFIED** | — |");
    expect(matrix).toContain("**2 declared · 1 classified · 1 unclassified.**");
  });
});

describe("the real phase, read from the real records", () => {
  it("declares 42 requirements across six families", () => {
    const declared = declaredRequirements();
    expect(declared).toHaveLength(42);
    expect(new Set(declared).size).toBe(42);
  });

  it("names the six acceptance records that classify, and no more", () => {
    /*
     * A record appearing on disk must be declared here rather than absorbed, so
     * a slice cannot classify from a file nobody listed. **Observed, not
     * assumed:** the generator's first real run refused with slice 2Q.5's
     * record already written, because it was not yet in this list.
     */
    expect(RECORDS).toHaveLength(6);
    for (const record of RECORDS) {
      expect(record).toMatch(/^docs\/reports\/phase-2q\/PHASE_2Q_SLICE_\d{2}_ACCEPTANCE\.md$/);
    }
  });

  it("refuses nothing, which is the phase's own closing criterion", () => {
    /*
     * `2Q-CLOSE-001`: declared = classified, zero unclassified. If this fails,
     * the message names exactly which requirement and why — and no matrix is
     * written until it passes.
     */
    expect(refusals()).toEqual([]);
  });
});
