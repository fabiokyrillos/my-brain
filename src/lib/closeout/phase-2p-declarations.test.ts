/**
 * Phase 2P declaration guard.
 *
 * ## Two postures, and why this file changed rather than being deleted
 *
 * ADR-121 authorized the package and signed its direction, not implementation,
 * and this guard asserted that in both directions: the package is complete and
 * coherent, and nothing that only exists *after* implementation exists yet.
 *
 * **ADR-122 authorized implementation**, so one of those absences had to move —
 * a slice acceptance record is now legal. The file is *flipped*, not relaxed,
 * for the reason Phase 2N's equivalent was inverted at closeout rather than
 * deleted: an absence that nobody asserts is an absence nobody notices
 * disappearing. The matrix, the closing report and any Phase 2P migration stay
 * forbidden, and each is now forbidden *by a decision that names when it stops
 * being forbidden* rather than by the phase not having started.
 *
 * ## The pin this file carries
 *
 * The 87/14 counts, the family sequence and the twelve signed decisions are
 * unchanged and still locked. What is added is the authorization chain itself:
 * ADR-122 must exist, must authorize implementation, and must record that the
 * migration candidate was *evaluated and rejected* rather than left pending.
 * A later slice that wants a migration has to pass through this pin
 * consciously, instead of discovering it the way ADR-121's A13 retarget
 * discovered the 2O guard.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const exists = (relative: string) => existsSync(join(REPO, relative));

const PRD = "docs/initiatives/phase-2p/PHASE_2P_PRD.md";
const PLAN = "docs/initiatives/phase-2p/PHASE_2P_IMPLEMENTATION_PLAN.md";
const AUDIT = "docs/reports/phase-2p/PHASE_2P_CURRENT_EXPERIENCE_AUDIT.md";
const GAPS = "docs/reports/phase-2p/PHASE_2P_UX_GAPS_AND_OPPORTUNITIES.md";
const THREATS = "docs/reports/phase-2p/PHASE_2P_THREAT_MODEL.md";
const CONTRACT = "docs/reports/phase-2p/PHASE_2P_TRACEABILITY_CONTRACT.md";
const REQUIRED = [PRD, PLAN, AUDIT, GAPS, THREATS, CONTRACT] as const;

const DECLARATION = /^- \*\*(2P-[A-Z]+-\d{3}):\*\*/gm;
const ids = [...read(PRD).matchAll(DECLARATION)].map((match) => match[1]);
// 86 at ADR-121; 87 since the owner's amendment appended 2P-SETTINGS-008 to
// the end of its family (2026-08-18). No ID was renumbered, reused or removed.
const TOTAL = 87;
const FAMILY_COUNTS: Readonly<Record<string, number>> = {
  FOUNDATION: 7,
  ATTENTION: 8,
  CHAT: 7,
  CAPTURE: 10,
  AUTONOMY: 10,
  SETTINGS: 8,
  PERSON: 4,
  MEMORY: 4,
  RELATION: 4,
  CALENDAR: 5,
  REMINDER: 5,
  MOBILE: 5,
  ACCESS: 5,
  CLOSE: 5,
};

describe("Phase 2P declarations", () => {
  it("carries the complete planning package", () => {
    for (const file of REQUIRED) expect(exists(file), file).toBe(true);
  });

  it("declares 87 unique requirements across fourteen expressible families", () => {
    expect(ids).toHaveLength(TOTAL);
    expect(new Set(ids).size).toBe(TOTAL);
    const families = [...new Set(ids.map((id) => id.split("-")[1]))];
    expect(families).toHaveLength(14);
    for (const family of families) expect(family).toMatch(/^[A-Z]+$/);
    expect(families.sort()).toEqual(Object.keys(FAMILY_COUNTS).sort());
  });

  it("numbers every family from 001 without gaps and locks its count", () => {
    for (const [family, count] of Object.entries(FAMILY_COUNTS)) {
      const numbers = ids
        .filter((id) => id.startsWith(`2P-${family}-`))
        .map((id) => Number(id.slice(id.lastIndexOf("-") + 1)));
      expect(numbers, family).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    }
    expect(Object.values(FAMILY_COUNTS).reduce((sum, count) => sum + count, 0)).toBe(TOTAL);
  });

  it("records all twelve signed product decisions and planning-only authority", () => {
    const prd = read(PRD);
    const decisions = read("docs/DECISIONS.md");
    for (let index = 1; index <= 12; index += 1) {
      expect(prd).toContain(`OD-2P-${index}`);
    }
    expect(decisions).toContain("`OD-2P-1` … `OD-2P-12`");
    expect(decisions).toMatch(/signs all twelve product decisions/i);
    expect(prd).toMatch(/Implementation is not authorized/i);
    expect(decisions).toMatch(/ADR-121 — The owner authorizes Phase 2P planning/);
    // The 87th requirement exists only because the owner authorized it after
    // ADR-121; the count and its authorization must never drift apart.
    expect(decisions).toMatch(/Amendment \(2026-08-18\) — the owner authorizes appending `2P-SETTINGS-008`/);
    expect(decisions).toMatch(/declares 87 requirements/);
  });

  it("records the implementation authorization and what it does not authorize", () => {
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/ADR-122 — The owner authorizes Phase 2P implementation/);
    // ADR-121 deferred implementation to "a separate decision". ADR-122 is that
    // decision, and the two must never be readable as one: 121 still says it
    // authorizes nothing, and 122 still says the migration budget is one
    // conditional allocation rather than an open door.
    expect(decisions).toMatch(/\*\*It authorizes no migration beyond the single conditional allocation named below/);
    expect(decisions).toMatch(/stop condition\*\* requiring a separate owner authorization/);
  });

  it("keeps closeout-only Phase 2P artifacts absent until slice 2P.8", () => {
    // The slice acceptance record is deliberately NOT in this list any more —
    // ADR-122 Decision 2 made it legal. These two are still forbidden, and the
    // decision names when that stops being true.
    for (const file of [
      "docs/reports/phase-2p/PHASE_2P_TRACEABILITY_MATRIX.md",
      "docs/reports/phase-2p/PHASE_2P_CLOSING_REPORT.md",
    ]) expect(exists(file), file).toBe(false);
    expect(read("docs/DECISIONS.md")).toMatch(/remain \*\*forbidden until slice 2P\.8\*\*/);
  });

  it("spends exactly the one migration slice 2P.1 was authorized", () => {
    /*
      Retargeted, not relaxed, and this is the passage 2P.0 built the pin for.

      ADR-122 Decision 3 funded one conditional allocation and Decision 4
      recorded that its condition failed, so before this slice the correct
      assertion was "zero". The owner then issued a replacement authorization:
      ONE migration for slice 2P.1, covering the twelve resolution functions
      through a central re-derivation contract, written from nothing.

      "Exactly one" is the whole point. A second Phase 2P migration is a stop
      condition, and this is what makes it fail loudly rather than accumulate.
    */
    const migrations = readdirSync(join(REPO, "supabase/migrations"));
    const phaseMigrations = migrations.filter((name) => /phase[_-]?2p/i.test(name));
    expect(phaseMigrations).toEqual(["202608180098_phase_2p_slice_1_entry_lifecycle_rederivation.sql"]);
    // The rejected candidate is not copied forward under any name. Unchanged.
    expect(migrations.filter((name) => name.startsWith("202608170098"))).toEqual([]);
    expect(migrations).toHaveLength(98);
  });

  it("records the candidate as evaluated and rejected, not as pending", () => {
    // Before ADR-122 this asserted the candidate was still merely a candidate.
    // It has now been re-audited, so leaving it "pending" would be the drift:
    // the rejection and its reasons must be recorded where the next slice reads.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toContain("202608170098_confirm_entry_interpretation.sql");
    expect(decisions).toMatch(/\*\*not applied and not copied forward\*\*/);
    const record = read("docs/reports/phase-2p/PHASE_2P_SLICE_00_ACCEPTANCE.md");
    expect(record).toContain("codex/fix-needs-attention-confirmation");
    expect(record).toMatch(/registers no undo/i);
    expect(record).toMatch(/partially_processed/);
  });

  it("is not vacuous: every extractor above answers differently on a fixture", () => {
    // An assertion over an empty read passes trivially, and three of the
    // extractors above are regex reads over prose. Each is exercised against a
    // string that must produce the opposite answer.
    expect(DECLARATION.test("")).toBe(false);
    DECLARATION.lastIndex = 0;
    expect([..."- **2P-X-001:** a\n- **2P-X-002:** b".matchAll(DECLARATION)]).toHaveLength(2);
    expect(/ADR-122 — The owner authorizes Phase 2P implementation/.test("ADR-121 — planning")).toBe(false);
    expect(/phase[_-]?2p/i.test("202608170098_confirm_entry_interpretation.sql")).toBe(false);
    expect(/phase[_-]?2p/i.test("202608180098_phase_2p_lifecycle.sql")).toBe(true);
  });
});
