/**
 * The Phase 2P traceability generator, guarded — `2P-CLOSE-001`.
 *
 * ## Why a guard over a generator at all
 *
 * The matrix is only worth what its generator refuses. A generator that reads
 * the sources and writes a plausible table without checking anything produces a
 * document that *looks* like evidence and is not, which is worse than no
 * matrix — and every check below is over the **real** repository, so it also
 * fails if the tree drifts away from the matrix that is committed.
 *
 * ## Every refusal is exercised in both directions
 *
 * A refusal asserted only in the passing direction is untested: it would still
 * pass if the check were deleted. So each one below is fed a fixture that must
 * produce the opposite answer. This is the "not vacuous" discipline the earlier
 * phases' guards established, applied to the twelve refusals the traceability
 * contract enumerates.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLASSES,
  DECLARED_TOTAL,
  FAMILY_SIZES,
  MIGRATION_BUDGET,
  REGISTERED_REMAINDERS,
  audit,
  citesRule,
  counts,
  declaredRequirements,
  evidenceWithoutSubject,
  namesDestination,
  normalizeClass,
  normalizeNewlines,
  readClassification,
  readRowKey,
  remainderIsVacuous,
  render,
  telemetryVocabulary,
} from "../../../scripts/generate-phase-2p-traceability.mjs";

const REPO = join(__dirname, "..", "..", "..");
const MATRIX = "docs/reports/phase-2p/PHASE_2P_TRACEABILITY_MATRIX.md";

describe("Phase 2P traceability", () => {
  it("classifies all 87 declared requirements exactly once, with no refusal", () => {
    const result = audit(REPO);
    expect(result.refusals, result.refusals.join("\n")).toEqual([]);
    expect(result.requirements).toHaveLength(DECLARED_TOTAL);
    expect(result.resolved.size).toBe(DECLARED_TOTAL);
    expect(result.conflicts).toEqual([]);
  });

  it("the fourteen pinned families sum to 87, and there is no eighty-eighth", () => {
    // The owner's amendment of 2026-08-20 fixes this. A generator fed 88 could
    // not produce a matrix classifying each of 87 exactly once, and one fed 86
    // would silently drop a family.
    const sum = Object.values(FAMILY_SIZES).reduce((total, size) => total + size, 0);
    expect(sum).toBe(87);
    expect(DECLARED_TOTAL).toBe(87);
    const { requirements } = declaredRequirements(
      readFileSync(join(REPO, "docs/initiatives/phase-2p/PHASE_2P_PRD.md"), "utf8"),
    );
    for (const [family, size] of Object.entries(FAMILY_SIZES)) {
      expect(requirements.filter((entry) => entry.family === family)).toHaveLength(size);
    }
  });

  it("the committed matrix is byte-identical to what the sources generate", () => {
    // Refusal 10. Newlines are normalised because `core.autocrlf` checks the
    // file out as CRLF on Windows while the generator writes LF — a gate that
    // fails on correct code is the one that gets weakened later. Every other
    // difference still fails, which the next test proves.
    const result = audit(REPO);
    const committed = readFileSync(join(REPO, MATRIX), "utf8");
    expect(normalizeNewlines(committed)).toBe(normalizeNewlines(render(result)));
  });

  it("a hand edit to the matrix is detected", () => {
    const result = audit(REPO);
    const rendered = render(result);
    const tampered = rendered.replace("| **total** |", "| **TOTAL** |");
    expect(normalizeNewlines(tampered)).not.toBe(normalizeNewlines(rendered));
  });

  it("the migration budget is pinned by name, and a third would be a stop condition", () => {
    const result = audit(REPO);
    expect(result.migrations).toEqual(Object.values(MIGRATION_BUDGET.named).sort());
    expect(result.migrations).toHaveLength(MIGRATION_BUDGET.expectedSpend);
    expect(MIGRATION_BUDGET.allocated).toBe(2);
  });

  it("the class tally reconciles with the total", () => {
    const result = audit(REPO);
    const tally = counts(result.resolved);
    expect(CLASSES.reduce((total, name) => total + tally[name], 0)).toBe(DECLARED_TOTAL);
  });

  /* ------------------------------------------------------------------ *
   * Refusal 9, and the carve-out the owner signed.
   * ------------------------------------------------------------------ */

  it("the client emits no calendar orientation the deployed validator refuses", () => {
    const { deployed, client } = telemetryVocabulary(REPO);
    expect(deployed).not.toBeNull();
    expect(client).not.toBeNull();
    for (const orientation of client!) expect(deployed).toContain(orientation);
  });

  it("the month's absence is a remainder, not a broken event", () => {
    /*
      ADR-122's amendment of 2026-08-20, asserted rather than trusted. The month
      is absent from BOTH lists — that is precisely what makes it an unfunded
      remainder instead of an event the database silently refuses. If it ever
      appeared in the client list alone, the test above is what fires; if it
      appeared in the deployed enum, that is a third migration.
    */
    const { deployed, client } = telemetryVocabulary(REPO);
    expect(deployed).not.toContain("month");
    expect(client).not.toContain("month");
    expect(REGISTERED_REMAINDERS).toContain("2P-CALENDAR-MONTH-TELEMETRY");
  });

  /* ------------------------------------------------------------------ *
   * Every reader, exercised in both directions.
   * ------------------------------------------------------------------ */

  it("reads a row's subject from its first cell, never from a citation in its evidence", () => {
    // The 2O generator's recorded defect: an evidence cell that mentions another
    // requirement was keyed to that other requirement and reported a conflict
    // between two records that never disagreed.
    expect(
      readRowKey("| `2P-CHAT-001` | built | fixed, which also makes `2P-CHAT-004` true |", null),
    ).toBe("2P-CHAT-001");
    // A bare suffix resolves through the record's own primary family…
    expect(readRowKey("| `-003` calibration | partial | … |", "2P-AUTONOMY")).toBe("2P-AUTONOMY-003");
    // …and resolves to nothing when there is no family to resolve it against,
    // rather than guessing.
    expect(readRowKey("| `-003` | partial | … |", null)).toBeNull();
    expect(readRowKey("just prose about `2P-CHAT-001`", null)).toBe("2P-CHAT-001");
  });

  it("reads the class from the second cell, never from a class word in the prose", () => {
    // Slice 2P.2's rows say "the … half is built" inside a `partial`, and a scan
    // for any class word would read the wrong one with total confidence.
    expect(readClassification("| `2P-X-001` | partial | the read half is built |")).toBe("partial");
    expect(readClassification("| `2P-X-001` | **built** | … |")).toBe("built");
    expect(readClassification("| `2P-X-001` | baseline, extended | … |")).toBe("baseline");
    expect(readClassification("| `2P-X-001` | closed | a remainder, not a class |")).toBeNull();
  });

  it("keeps `not-built-by-rule` intact while stripping a leading separator", () => {
    // Stripping every dash turns the class into `not built by rule` and makes
    // the four autonomy refusals unclassifiable. The separator is what must be
    // narrowed, never the class.
    expect(normalizeClass("— not-built-by-rule")).toBe("not-built-by-rule");
    expect(normalizeClass("not-built-by-rule")).toBe("not-built-by-rule");
    expect(normalizeClass("nonsense")).toBeNull();
  });

  it("a row cannot discharge its destination or its rule by containing its own id", () => {
    // Strip the subject first, or the check can never fail: the identifier
    // itself matches the family-shaped rule token.
    const selfReferential = {
      id: "2P-ATTENTION-008",
      evidence: "| `2P-ATTENTION-008` | partial | 2P-ATTENTION-008 |",
    };
    expect(evidenceWithoutSubject(selfReferential).includes("2P-ATTENTION-008")).toBe(false);
    expect(namesDestination(selfReferential)).toBe(false);
    expect(remainderIsVacuous(selfReferential)).toBe(true);

    const real = {
      id: "2P-ATTENTION-008",
      evidence:
        "| `2P-ATTENTION-008` | partial | refresh and back navigation proved only at the data layer. Destination: the owner |",
    };
    expect(namesDestination(real)).toBe(true);
    expect(remainderIsVacuous(real)).toBe(false);
  });

  it("`not-built-by-rule` needs a named authority, not the word `rule`", () => {
    // The softer version accepted "closes on the same rule", which names nothing
    // checkable — the vacuous-remainder failure wearing a different label.
    expect(
      citesRule({ id: "2P-AUTONOMY-005", evidence: "| `2P-AUTONOMY-005` | x | the rule is in the contract |" }),
    ).toBe(false);
    expect(
      citesRule({ id: "2P-AUTONOMY-005", evidence: "| `2P-AUTONOMY-005` | x | ADR-123 Decision 3 |" }),
    ).toBe(true);
  });

  it("every partial and undelivered in the committed matrix names a remainder and a destination", () => {
    // 2P-CLOSE-002, read off the artifact rather than off the intent.
    const result = audit(REPO);
    for (const [id, entry] of result.resolved) {
      if (entry.classification !== "partial" && entry.classification !== "undelivered") continue;
      expect(remainderIsVacuous(entry), `${id} has an empty remainder`).toBe(false);
      expect(namesDestination(entry), `${id} names no destination`).toBe(true);
    }
  });

  it("no successor artifact or requirement exists", () => {
    // Refusal 12. The A13 guard owns this too; the generator refuses on it so a
    // matrix can never be produced for a tree that has quietly started one.
    const result = audit(REPO);
    expect(result.refusals.filter((refusal) => refusal.includes("refusal 12"))).toEqual([]);
  });
});
