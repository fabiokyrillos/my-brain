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
const TOTAL = 127;
const FAMILY_COUNTS: Readonly<Record<string, number>> = {
  PERSON: 8,
  PROJECT: 7,
  IDENTITY: 9,
  KNOWS: 9,
  CORRECT: 13,
  CONFLICT: 6,
  FILES: 12,
  RELATION: 11,
  PROV: 6,
  PRIVACY: 11,
  TIME: 6,
  MOBILE: 4,
  ACCESS: 6,
  METRICS: 7,
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
    // `still` was added when ADR-109 signed the decisions, and the assertion
    // has to tolerate it without tolerating its absence: signing seventeen
    // decisions is exactly the moment a package is most likely to start
    // reading as an authorization to build.
    expect(read(PRD)).toMatch(/Implementation is (?:still )?not\s+authorized/);
  });

  it("records ADR-109 as an accepted signing decision that authorizes no implementation", () => {
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-109 — The owner signs all seventeen Phase 2N decisions/);
    const block = decisions.slice(decisions.indexOf("## ADR-109"));
    const body = block.slice(0, block.indexOf("\n## ") === -1 ? block.length : block.indexOf("\n## "));
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body).toMatch(/authorizes \*\*no implementation\*\*/i);
    // The property that matters most about this ADR: an allocation is not a
    // permission. Three migrations are named and none may be created.
    expect(body).toMatch(/destinations, not permissions/i);
  });

  it("keeps ADR-108 intact rather than rewritten, and marks what superseded it", () => {
    // An accepted ADR is not edited into agreement with a later one. ADR-108's
    // ceiling of four, its seventeen open questions and its recommendations are
    // the record of what was decided before the owner answered.
    const decisions = read("docs/DECISIONS.md");
    const block = decisions.slice(decisions.indexOf("## ADR-108"), decisions.indexOf("## ADR-109"));
    expect(block).toMatch(/ceiling FOUR/i);
    expect(block).toMatch(/Superseded in part by ADR-109/);
    expect(block).toMatch(/is \*\*not rewritten\*\*/);
  });

  it("carries all seventeen signed decisions in the PRD, each naming what it signed", () => {
    const prd = read(PRD);
    for (let n = 1; n <= 17; n += 1) {
      expect(prd, `OD-2N-${n} is not carried by the PRD`).toMatch(
        new RegExp(`OD-2N-${n}\\b`),
      );
    }
    // Signed, not open. The word this package must never carry again for these.
    expect(prd).not.toMatch(/## 14\. Open owner decisions/);
    expect(prd).toMatch(/all seventeen SIGNED/i);
  });

  it("keeps the declined options visible rather than deleted", () => {
    // R-4b. A decision whose alternatives have been deleted is a decision
    // nobody can review, and the next phase to reopen one needs to see what
    // was already weighed.
    const plan = read(PLAN);
    expect(plan).toMatch(/Declined B:/);
    expect(plan).toMatch(/Refused C:/);
    expect(plan).toMatch(/declined options are preserved/i);
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
  it("states three allocated, obligation zero, none created", () => {
    expect(read(PLAN)).toMatch(/3 allocated · obligation ZERO · 0 spent · NONE CREATED/);
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
    for (const candidate of ["M1", "M2", "M3"]) {
      const heading = plan.split("\n").find((line) => line.includes(`${candidate} — `) && line.startsWith("### "));
      expect(heading, `${candidate} has no destination heading`).toBeDefined();
    }
    expect(plan).toMatch(/non-transferable/i);
    expect(plan).toMatch(/No migration for adjustments/i);
  });

  it("proves each signed capability needs no further migration", () => {
    // `OD-2N-14` requires that no fourth need be hidden. The proof is a section
    // of the plan, and it is asserted to exist and to name each capability that
    // could plausibly have demanded schema — because "no migration needed" is
    // the claim most easily asserted and least easily checked.
    const plan = read(PLAN);
    const proof = plan.slice(plan.indexOf("### 6.5"));
    expect(proof, "the no-migration proof section is missing").not.toBe("");
    for (const capability of ["Aliases", "Sensitivity", "Derived conflicts", "Library option B", "Graph option B"]) {
      expect(proof, `${capability} is not traced to existing schema`)
        .toMatch(new RegExp(`${capability}[^\\n]*no migration`, "i"));
    }
    expect(proof).toMatch(/No fourth need is hidden/i);
  });

  it("makes a fourth migration a stop condition rather than a variance", () => {
    const plan = read(PLAN);
    expect(plan).toMatch(/fourth is a \*\*stop condition\*\*|fourth is a stop condition/i);
    expect(read(CONTRACT)).toMatch(/A fourth migration is refused/i);
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

describe("Phase 2N: the notes posture is unambiguous and costs no schema", () => {
  it("records ADR-110 as an accepted amendment that adds no migration", () => {
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-110 — The owner confirms the field-classification reading/);
    const block = decisions.slice(decisions.indexOf("## ADR-110"));
    const body = block.slice(0, block.indexOf("\n## ") === -1 ? block.length : block.indexOf("\n## "));
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body).toMatch(/no migration/i);
    expect(body).not.toMatch(/2O/i);
  });

  it("keeps ADR-109 intact and marks what amended it", () => {
    // Same property as ADR-108 -> ADR-109: an accepted ADR is not edited into
    // agreement with a later one. ADR-109 left the interpretation flagged, and
    // that is the record of what was true when it was signed.
    const decisions = read("docs/DECISIONS.md");
    const block = decisions.slice(decisions.indexOf("## ADR-109"), decisions.indexOf("## ADR-110"));
    expect(block).toMatch(/Amended by ADR-110/);
    expect(block).toMatch(/is \*\*not rewritten\*\*/);
  });

  it("states the taxonomy as structural-versus-free-text, not owner-authored-versus-derived", () => {
    // The distinction that stops "a name is shown" from generalising into "every
    // field the owner typed is normal". Asserted because it is the exact
    // over-reading this amendment exists to prevent.
    const prd = read(PRD);
    expect(prd).toMatch(/structural identifier versus free text/i);
    expect(prd).toMatch(/does not make every owner-typed field `normal`|not make every field the owner typed/i);
  });

  it("carries the four notes requirements and their prohibitions", () => {
    const prd = read(PRD);
    for (const id of ["2N-PRIVACY-008", "2N-PRIVACY-009", "2N-PRIVACY-010", "2N-PRIVACY-011"]) {
      expect(prd, `${id} is not declared`).toMatch(new RegExp(`- \\*\\*${id}:\\*\\*`));
    }
    expect(prd).toMatch(/masked by default/i);
    expect(prd).toMatch(/never resolves to `normal`/);
    expect(prd).toMatch(/no sensitivity is inferred from the text/i);
    expect(prd).toMatch(/no existing note is deleted or altered/i);
  });

  it("keeps the notes posture free of schema, and says so", () => {
    // The property that made the merge permissible: this decision reaches no
    // database. Asserted against the directory as well as the prose.
    const prd = read(PRD);
    expect(prd).toMatch(/No `sensitivity`\s*\n?\s*column is added to `people`|No `sensitivity` column is added/);
    expect(readdirSync(join(REPO, "supabase", "migrations"))).toHaveLength(92);
    expect(read(PLAN)).toMatch(/may not consume or reallocate \*\*M1\*\*, \*\*M2\*\* or \*\*M3\*\*|may not consume or reallocate M1, M2 or M3/);
  });

  it("records the ADR-093 narrowing as deliberate rather than accidental", () => {
    // 2N-PRIVACY-006 exists to force this distinction. Removing `notes` from the
    // people domain changes behaviour ADR-093 signed; a package that did that
    // without saying so would be the accidental reopening the requirement bans.
    const plan = read(PLAN);
    expect(plan).toMatch(/narrowing of ADR-093/i);
    expect(plan).toMatch(/not an accidental\s*\n?\s*reopening/i);
    expect(read(THREATS)).toMatch(/owner-signed narrowing/i);
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
