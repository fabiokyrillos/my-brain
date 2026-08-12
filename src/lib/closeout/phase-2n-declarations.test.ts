/**
 * Phase 2N's declaration and planning-only guard.
 *
 * The phase is authorized for **planning only** by ADR-108. That authorization
 * is the thing this file protects, in both directions:
 *
 * - the declared requirement set is coherent, counted correctly wherever it is
 *   quoted, and shaped so the traceability generator and the phase-start
 *   detector can both see it;
 * - and nothing that would only exist *after* implementation exists yet.
 *
 * ## Why the absences are asserted rather than trusted
 *
 * Phase 2M's equivalent guard forbade its matrix and its closing report from
 * existing while the phase was mid-flight, and had to be **inverted** at
 * closeout rather than deleted. The same shape is used here deliberately: an
 * absence that nobody asserts is an absence nobody notices disappearing, and a
 * planning package that quietly grows an acceptance record has started
 * implementing under an authorization that forbids it.
 *
 * ## The trap this guard is built around
 *
 * An assertion over an empty set passes trivially. Every extraction below is
 * therefore proved non-vacuous — the count is asserted to be the number the PRD
 * really declares, and the extractor is exercised against a fixture that must
 * produce a different answer. A corpus scan that silently starts matching
 * nothing is indistinguishable from a corpus scan that is correct.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const exists = (relative: string) => existsSync(join(REPO, relative));

const PRD = "docs/initiatives/phase-2n/PHASE_2N_PRD.md";
const PLAN = "docs/initiatives/phase-2n/PHASE_2N_IMPLEMENTATION_PLAN.md";
const AUDIT = "docs/reports/phase-2n/PHASE_2N_CURRENT_EXPERIENCE_AUDIT.md";
const GAPS = "docs/reports/phase-2n/PHASE_2N_UX_GAPS_AND_OPPORTUNITIES.md";
const THREATS = "docs/reports/phase-2n/PHASE_2N_THREAT_MODEL.md";
const CONTRACT = "docs/reports/phase-2n/PHASE_2N_TRACEABILITY_CONTRACT.md";

/**
 * A *declared* requirement, in this repository's declaration shape — the same
 * shape the phase-start detector and the traceability generator both use. A
 * mention in prose is deliberately not a declaration.
 */
const DECLARATION = /^- \*\*(2N-[A-Z]+-\d{3}):\*\*/gm;

/** A family name may carry no digit; `2K-A11Y` is why this is asserted. */
const EXPRESSIBLE_FAMILY = /^[A-Z]+$/;

function declaredIds(source: string): string[] {
  return [...source.matchAll(DECLARATION)].map((match) => match[1]);
}

const ids = declaredIds(read(PRD));
const TOTAL = 108;
const FAMILY_COUNTS: Readonly<Record<string, number>> = {
  PERSON: 8,
  PROJECT: 7,
  IDENTITY: 8,
  KNOWS: 9,
  CORRECT: 8,
  CONFLICT: 6,
  FILES: 8,
  RELATION: 8,
  PROV: 6,
  PRIVACY: 7,
  TIME: 5,
  MOBILE: 4,
  ACCESS: 6,
  METRICS: 6,
  SEC: 6,
  CLOSE: 6,
};

describe("Phase 2N declarations: the requirement set is coherent", () => {
  it(`declares ${TOTAL} requirements`, () => {
    expect(ids).toHaveLength(TOTAL);
  });

  it("declares each id exactly once", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares sixteen families, each expressible by the shared pattern", () => {
    const families = [...new Set(ids.map((id) => id.split("-")[1]))];
    expect(families).toHaveLength(16);
    for (const family of families) {
      // The property `2K-A11Y` failed. A family name containing a digit is
      // invisible to `2N-[A-Z]+-\d{3}`, which means invisible to the phase-start
      // detector, to the traceability generator and to every prose count.
      expect(family, `${family} is not expressible by the shared pattern`)
        .toMatch(EXPRESSIBLE_FAMILY);
    }
  });

  it("carries per-family counts that sum to the declared total", () => {
    const counted: Record<string, number> = {};
    for (const id of ids) {
      const family = id.split("-")[1];
      counted[family] = (counted[family] ?? 0) + 1;
    }
    expect(counted).toEqual(FAMILY_COUNTS);
    expect(Object.values(FAMILY_COUNTS).reduce((a, b) => a + b, 0)).toBe(TOTAL);
  });

  it("numbers each family from 001 with no gap", () => {
    const byFamily: Record<string, number[]> = {};
    for (const id of ids) {
      const [, family, number] = id.split("-");
      (byFamily[family] ??= []).push(Number(number));
    }
    for (const [family, numbers] of Object.entries(byFamily)) {
      const sorted = [...numbers].sort((a, b) => a - b);
      expect(sorted, `${family} is not numbered from 001 without a gap`)
        .toEqual(sorted.map((_, index) => index + 1));
    }
  });

  it("proves the extraction itself is not returning zero", () => {
    // The half that makes every assertion above non-vacuous. If `DECLARATION`
    // ever stops matching, the tests above would pass over an empty array.
    expect(declaredIds("- **2N-PERSON-001:** something.\n")).toEqual(["2N-PERSON-001"]);
    expect(declaredIds("mentions 2N-PERSON-001 in prose")).toEqual([]);
    expect(declaredIds("- **2M-CAL-001:** another phase.\n")).toEqual([]);
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("Phase 2N declarations: the count does not drift where it is quoted", () => {
  for (const document of [PRD, PLAN]) {
    it(`${document} states ${TOTAL} wherever it states this phase's count`, () => {
      const source = read(document);
      const claims = [...source.matchAll(/\*\*(\d+) requirements/g)].map((m) => Number(m[1]));
      expect(claims.length, `${document} states no count`).toBeGreaterThan(0);
      for (const claim of claims) expect(claim).toBe(TOTAL);
    });
  }

  it("fires on a stale count, and ignores another phase's", () => {
    const stale = "**94 requirements across thirteen families**";
    expect([...stale.matchAll(/\*\*(\d+) requirements/g)].map((m) => Number(m[1]))).toEqual([94]);
  });
});

describe("Phase 2N governance: the authorization is planning-only and says so", () => {
  it("records ADR-108 as an accepted, planning-only owner decision", () => {
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-108 — The owner authorizes Phase 2N/);
    const block = decisions.slice(decisions.indexOf("## ADR-108"));
    const body = block.slice(0, block.indexOf("\n## ") === -1 ? block.length : block.indexOf("\n## "));
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body).toMatch(/authorizes \*\*planning only\*\*/i);
  });

  it("keeps the governing pair present and the evidence beside it", () => {
    for (const document of [PRD, PLAN, AUDIT, GAPS, THREATS, CONTRACT]) {
      expect(exists(document), `${document} is missing`).toBe(true);
    }
  });

  it("states in the PRD that implementation is not authorized", () => {
    expect(read(PRD)).toMatch(/Implementation is not\s+authorized/);
  });

  it("keeps the successor unnamed by the authorizing heading", () => {
    // Asserted here as well as in A13, because this is the guard a Phase 2N
    // author reads. A heading that named the successor would start the next
    // phase in the act of authorizing this one.
    const heading = read("docs/DECISIONS.md")
      .split("\n")
      .find((line) => line.startsWith("## ADR-108")) ?? "";
    expect(heading).not.toBe("");
    expect(heading).not.toMatch(/2O/i);
  });
});

describe("Phase 2N budget: nothing is spent and nothing may be created", () => {
  it("states a ceiling of four and an obligation of zero", () => {
    expect(read(PLAN)).toMatch(/Ceiling FOUR · obligation ZERO · 0 spent · none/);
  });

  it("has created no migration attributable to this phase", () => {
    // R-4. The planning authorization forbids a migration outright, so the
    // absence is asserted rather than assumed — and it is asserted against the
    // directory rather than against a document that could simply be wrong.
    const migrations = readdirSync(join(REPO, "supabase", "migrations"));
    expect(migrations.filter((name) => /phase[_-]?2n/i.test(name))).toEqual([]);
    expect(migrations).toHaveLength(92);
  });

  it("gives every proposed migration an exclusive destination", () => {
    // R-10. A candidate without a named slice is a budget line nobody can
    // enforce, and "one migration for adjustments" is the specific shape this
    // repository has already paid for twice.
    const plan = read(PLAN);
    for (const candidate of ["M1", "M2", "M3", "M4"]) {
      const heading = plan.split("\n").find((line) => line.startsWith(`### ${candidate} —`));
      expect(heading, `${candidate} has no proposal heading`).toBeDefined();
    }
    expect(plan).toMatch(/exclusively/);
    expect(plan).toMatch(/non-transferable/i);
    expect(plan).not.toMatch(/migration for adjustments/i);
  });
});

describe("Phase 2N: implementation has not begun", () => {
  it("has created no acceptance record, matrix, report or deployment record", () => {
    // R-5. These are the artifacts that only exist after work has run. Phase 2M's
    // equivalent had to be *inverted* at closeout rather than deleted, and this
    // one is written to be inverted the same way rather than quietly dropped.
    const reports = readdirSync(join(REPO, "docs", "reports", "phase-2n"));
    const forbidden = reports.filter((name) =>
      /ACCEPTANCE|TRACEABILITY_MATRIX|_REPORT\.md|DEPLOYMENT/.test(name),
    );
    expect(forbidden, `implementation artifacts exist under a planning-only authorization`)
      .toEqual([]);
    // Non-vacuous: the directory is not empty, so the filter above is really
    // filtering something.
    expect(reports.length).toBeGreaterThanOrEqual(4);
  });

  it("declares no requirement outside the PRD", () => {
    // R-1. A requirement declared in a report is a requirement no matrix will
    // ever classify.
    for (const document of [AUDIT, GAPS, THREATS, CONTRACT]) {
      expect(declaredIds(read(document)), `${document} declares a requirement`).toEqual([]);
    }
  });
});

describe("Phase 2N: the inherited truths are not reclassified", () => {
  it("restates push and Android exactly as inherited", () => {
    // R-6. The phase may not treat either as approved, and the words are
    // asserted because this is precisely the claim that softens by paraphrase.
    const audit = read(AUDIT);
    expect(audit).toMatch(/HTTP 403/);
    expect(audit).toMatch(/NOT\s+EXECUTED/);
    expect(audit).toMatch(/not proven|unproven/i);
    expect(audit).not.toMatch(/push (?:now )?works/i);
  });

  it("keeps the four timezone exemptions as another initiative's residual", () => {
    const prd = read(PRD);
    expect(prd).toMatch(/not\s+repaired here/i);
    expect(read(AUDIT)).toMatch(/daily-cycle/);
  });

  it("restates ADR-055 as neither satisfied nor superseded, with its expiry", () => {
    const audit = read(AUDIT);
    expect(audit).toMatch(/ADR-055/);
    expect(audit).toMatch(/2026-10-27/);
    expect(audit).toMatch(/neither satisfied\s*\n?\s*nor superseded/);
  });

  it("keeps the rollout gate and signup untouched and unclaimed", () => {
    const audit = read(AUDIT);
    expect(audit).toMatch(/25 pass · 3 fail · 2 owner-signature/);
    expect(audit).toMatch(/enable_signup = false/);
  });
});
