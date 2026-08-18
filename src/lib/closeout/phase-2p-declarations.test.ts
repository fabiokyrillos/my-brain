/**
 * Phase 2P planning-only declaration guard.
 *
 * ADR-121 authorizes the package and signs its direction, not implementation.
 * This file therefore protects both halves: the package is complete and
 * coherent, and implementation-only artifacts do not exist yet.
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

  it("keeps implementation-only Phase 2P artifacts absent", () => {
    for (const file of [
      "docs/reports/phase-2p/PHASE_2P_TRACEABILITY_MATRIX.md",
      "docs/reports/phase-2p/PHASE_2P_CLOSING_REPORT.md",
      "docs/reports/phase-2p/PHASE_2P_SLICE_00_ACCEPTANCE.md",
    ]) expect(exists(file), file).toBe(false);

    const migrations = readdirSync(join(REPO, "supabase/migrations"));
    expect(migrations.filter((name) => /phase[_-]?2p/i.test(name))).toEqual([]);
  });

  it("keeps the migration candidate a candidate rather than a spend", () => {
    const corpus = `${read(PRD)}\n${read(PLAN)}\n${read(AUDIT)}`;
    expect(corpus).toContain("codex/fix-needs-attention-confirmation");
    expect(corpus).toMatch(/re-audit|required/i);
    expect(corpus).not.toMatch(/098[^\n]*(deployed|applied|spent)/i);
  });
});
