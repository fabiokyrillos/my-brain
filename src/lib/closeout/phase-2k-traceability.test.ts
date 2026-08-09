/**
 * `2K-CLOSE-001` / `2K-CLOSE-002` / `2K-CLOSE-003` — the traceability guard.
 *
 * A generator whose failure modes are unasserted is a generator nobody has run.
 * Each refusal below is proved by **executing it** against a mutated copy of
 * the repository, never by reading the code and believing it.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  MIGRATION_BUDGET,
  buildPhase2kTraceability,
  normalizeClass,
} from "../../../scripts/generate-phase-2k-traceability.mjs";

const REPO = join(__dirname, "..", "..", "..");
const roots: string[] = [];

/** A throwaway copy of everything the generator reads. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "phase-2k-trace-"));
  roots.push(root);
  for (const path of [
    "docs/initiatives/phase-2k",
    "docs/reports/phase-2k",
    "supabase/migrations",
    "src/features/conversation-cards",
  ]) {
    cpSync(join(REPO, path), join(root, path), { recursive: true });
  }
  return root;
}

function findings(root: string): string[] {
  try {
    buildPhase2kTraceability({ root });
    return [];
  } catch (error) {
    return (error as { failures?: string[] }).failures ?? [(error as Error).message];
  }
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("2K-CLOSE-001: the real repository classifies every declared requirement", () => {
  it("emits a matrix with nothing unresolved", () => {
    const result = buildPhase2kTraceability();
    expect(result.failures).toEqual([]);
    expect(result.evidence.size).toBe(result.declared.length);
  });

  it("classifies 79, which is what the PRD declares — not the 68 four documents state", () => {
    /*
     * A counting error in the authorizing documents, found by extracting the
     * declarations rather than trusting the prose. ADR-097, ADR-098, STATE.md,
     * the reports index and the PRD's own §4 preamble all say 68.
     *
     * Pinned here so the number cannot drift back to the comfortable one: the
     * matrix is complete only if it covers what the PRD actually declares.
     */
    const result = buildPhase2kTraceability();
    expect(result.declared.length).toBe(79);
    expect(new Set(result.declared).size).toBe(79);
  });

  it("reconciles the budget: one allocated, one spent", () => {
    const result = buildPhase2kTraceability();
    expect(MIGRATION_BUDGET.allocated).toBe(1);
    expect(result.migrations).toEqual(["202608090088_phase_2k_conversation_telemetry.sql"]);
  });
});

describe("the class normalizer, which the records depend on", () => {
  it("resolves every qualified form the slice records actually use", () => {
    // What the row regex actually captures: the text between the FIRST pair of
    // asterisks. A row reading `**built** (contract) / **baseline** (tasks)`
    // hands this function `built`, and the qualifier never reaches it.
    expect(normalizeClass("built")).toBe("built");
    expect(normalizeClass("baseline, re-proved")).toBe("baseline");
    expect(normalizeClass("partial, in progress by design")).toBe("partial");
    expect(normalizeClass("built, vacuously — and it says so")).toBe("built");
    expect(normalizeClass("baseline, preserved")).toBe("baseline");
  });

  it("reads a deferral as a deferral, not as a classification", () => {
    // 2K.1's honest statement that `2K-PRIVACY-003/004` land in 2K.4 must not
    // become a refusal, and must not be counted as a classification either.
    expect(normalizeClass("not claimed here")).toBeNull();
    expect(normalizeClass("deferred")).toBeNull();
  });

  it("refuses an invented classification", () => {
    for (const invented of ["done", "complete", "green", "verified", "shipped"]) {
      expect(normalizeClass(invented), invented).toBeUndefined();
    }
  });
});

describe("the refusals, each executed against a mutation", () => {
  it("R1: refuses when a declared requirement is classified nowhere", () => {
    const root = fixture();
    const prd = join(root, "docs/initiatives/phase-2k/PHASE_2K_PRD.md");
    writeFileSync(prd, `${readFileSync(prd, "utf8")}\n- **2K-CARD-099:** an invented requirement nobody classified.\n`, "utf8");
    expect(findings(root).join("\n")).toContain("R1: 2K-CARD-099");
  });

  it("R2: refuses when one requirement is classified twice", () => {
    const root = fixture();
    const record = join(root, "docs/reports/phase-2k/PHASE_2K_SLICE_05_ACCEPTANCE.md");
    writeFileSync(
      record,
      `${readFileSync(record, "utf8")}\n| \`2K-SUGG-001\` | **built** | a second classification of a requirement slice 2K.6 already classified |\n`,
      "utf8",
    );
    expect(findings(root).join("\n")).toContain("R2: 2K-SUGG-001 is classified twice");
  });

  it("R4: refuses a classification the PRD does not declare", () => {
    const root = fixture();
    const record = join(root, "docs/reports/phase-2k/PHASE_2K_SLICE_05_ACCEPTANCE.md");
    writeFileSync(
      record,
      `${readFileSync(record, "utf8")}\n| \`2K-EXPL-099\` | **built** | an id no requirement family ever declared, which is how scope creeps in at closeout |\n`,
      "utf8",
    );
    expect(findings(root).join("\n")).toContain("R4: 2K-EXPL-099");
  });

  it("R6: refuses an invented classification", () => {
    const root = fixture();
    const record = join(root, "docs/reports/phase-2k/PHASE_2K_SLICE_06_ACCEPTANCE.md");
    writeFileSync(
      record,
      readFileSync(record, "utf8").replace("| `2K-SUGG-001` | **built**", "| `2K-SUGG-001` | **shipped**"),
      "utf8",
    );
    expect(findings(root).join("\n")).toContain("R6: 2K-SUGG-001 carries an unrecognised class");
  });

  it("R8/R10: refuses a partial that names no remainder or destination", () => {
    const root = fixture();
    const record = join(root, "docs/reports/phase-2k/PHASE_2K_SLICE_06_ACCEPTANCE.md");
    writeFileSync(
      record,
      `${readFileSync(record, "utf8")}\n| \`2K-SUGG-002\` | **partial** | it is partly done and this sentence says nothing about what is missing |\n`
        .replace("| `2K-SUGG-002` | **built**", "| `2K-SUGG-002-OLD` | **built**"),
      "utf8",
    );
    expect(findings(root).join("\n")).toContain('R8/R10: 2K-SUGG-002 is "partial"');
  });

  it("R13: refuses an unbudgeted migration", () => {
    const root = fixture();
    writeFileSync(join(root, "supabase/migrations/202608090089_phase_2k_second.sql"), "-- unbudgeted\n", "utf8");
    const found = findings(root).join("\n");
    expect(found).toContain("R13: an unbudgeted Phase 2K migration exists");
    expect(found).toContain("R13: Phase 2K spent 2 migrations");
  });

  it("R15: refuses a row that relitigates a signed decision", () => {
    const root = fixture();
    const record = join(root, "docs/reports/phase-2k/PHASE_2K_SLICE_02_ACCEPTANCE.md");
    writeFileSync(
      record,
      readFileSync(record, "utf8").replace(
        "| `2K-ACT-008` | **built** |",
        "| `2K-ACT-008` | **built** | the memory is deleted and the row is erased, which OD-2K-3 forbids |\n| `2K-ACT-008-OLD` | **built** |",
      ),
      "utf8",
    );
    expect(findings(root).join("\n")).toContain("R15: 2K-ACT-008 describes deletion");
  });

  it("R15 does NOT fire on a row that upholds the decision", () => {
    /*
     * The precision that matters. The real record says the copy "asserts
     * negatively in both locales that none of it says deleted" — a sentence
     * that keeps the decision. A guard firing there would teach the next author
     * to soften the record until the check goes quiet.
     */
    expect(buildPhase2kTraceability().failures).toEqual([]);
  });

  it("R17: refuses a continuity payload that transports a clock", () => {
    const root = fixture();
    const continuity = join(root, "src/features/conversation-cards/continuity.ts");
    writeFileSync(
      continuity,
      readFileSync(continuity, "utf8").replace("    o: z.string().uuid(),", "    o: z.string().uuid(),\n    issuedAt: z.string(),"),
      "utf8",
    );
    expect(findings(root).join("\n")).toContain("R17: the continuity payload declares issuedAt");
  });

  it("throws rather than emitting an empty matrix when the PRD is unreadable", () => {
    const root = fixture();
    rmSync(join(root, "docs/initiatives/phase-2k/PHASE_2K_PRD.md"));
    expect(() => buildPhase2kTraceability({ root })).toThrow(/does not exist/);
  });
});
