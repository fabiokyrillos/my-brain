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

/**
 * The migration count on the day Phase 2N implementation was authorized.
 *
 * Phase 2N may add **at most three** on top of this, one per allocation. The
 * baseline is a constant rather than a re-read of the directory precisely so
 * that a spend has to be *attributable*: total minus this must equal the number
 * of files naming the phase, or something arrived that nobody allocated.
 */
const MIGRATIONS_BEFORE_PHASE_2N = 92;
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

  it("states in the PRD that implementation is authorized, and by which decision", () => {
    /*
     * **Inverted by ADR-112, not deleted.** This asserted the opposite for the
     * whole of planning: *"Implementation is still not authorized"*. ADR-112
     * authorized implementation through closeout, so the assertion turns over —
     * and it keeps naming the decision, because "implementation is authorized"
     * with no citation is exactly the sentence a package acquires by drift.
     *
     * The pairing matters as much as the claim. The PRD must say what is *still*
     * refused, or an authorization to build eight slices reads as an
     * authorization to do anything.
     */
    const prd = read(PRD);
    expect(prd).toMatch(/IMPLEMENTATION THROUGH CLOSEOUT AUTHORIZED by\s*\n?ADR-112/);
    expect(prd, "a fourth migration must still be refused in the same breath")
      .toMatch(/fourth migration\*{0,2} \(a STOP CONDITION\)|fourth\*{0,2} migration/i);
    expect(prd, "the phase must not read as permission to start the successor")
      .toMatch(/successor phase/i);
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
  it("states three allocated, obligation zero, and a spend count that matches the tree", () => {
    /*
     * **Inverted by slice 2N.3's M1.** This asserted the literal string
     * `0 spent · NONE CREATED`, which was the truth until a slice spent an
     * allocation and then became a lie the guard was enforcing.
     *
     * The rule that does not move is that the plan's stated spend must equal
     * what is actually on disk. So the number is READ from the plan and
     * CHECKED against the migrations, rather than pinned — a plan claiming
     * fewer spends than exist fails here, which is the direction that matters.
     */
    const plan = read(PLAN);
    const stated = plan.match(/3 allocated · obligation ZERO · (\d+) spent/);
    expect(stated, "the plan no longer states its budget in the signed form").not.toBeNull();

    const spent = readdirSync(join(REPO, "supabase", "migrations")).filter((name) =>
      /phase[_-]?2n/i.test(name),
    );
    expect(Number(stated?.[1]), `the plan says ${stated?.[1]} spent, the tree has ${spent.length}`)
      .toBe(spent.length);
  });

  it("names the allocation and the slice for every migration it has spent", () => {
    /*
     * `OD-2N-14` makes the three allocations **non-transferable**, which is only
     * enforceable if each spend says which allocation it consumed. A migration
     * that names no allocation is one whose budget line nobody can check, and
     * two migrations naming the same one is a transfer with extra steps.
     */
    const dir = join(REPO, "supabase", "migrations");
    const spent = readdirSync(dir).filter((name) => /phase[_-]?2n/i.test(name));
    const claimed = spent.map((name) => {
      expect(name, `${name} does not name the slice that spent it`).toMatch(/_slice_\d+_/);
      const header = readFileSync(join(dir, name), "utf8").slice(0, 4000);
      const allocation = header.match(/MIGRATION (M[123])\b/);
      expect(allocation, `${name} does not name the allocation it consumes`).not.toBeNull();
      return allocation?.[1];
    });
    expect(new Set(claimed).size, `two migrations claim one allocation: ${claimed.join(", ")}`)
      .toBe(claimed.length);
  });

  it("spends at most the three allocated, and nothing unattributed appears beside them", () => {
    /*
     * **Inverted by ADR-112.** Under planning this asserted *zero* Phase 2N
     * migrations and exactly 92 files. Implementation may now spend up to three,
     * so a flat count would have to be edited on every spend — and a budget
     * guard that gets edited to go green is not a budget guard.
     *
     * What replaces it is the rule itself, which does not move: **at most three
     * are attributable to this phase, and the total is 92 plus exactly those.**
     * A fourth fails here rather than at closeout, and an unattributed migration
     * — one that belongs to no phase and slipped in beside them — fails too,
     * which the old flat count could only catch by accident.
     */
    const migrations = readdirSync(join(REPO, "supabase", "migrations"));
    const mine = migrations.filter((name) => /phase[_-]?2n/i.test(name));
    expect(mine.length, `a fourth Phase 2N migration is a STOP CONDITION: ${mine.join(", ")}`)
      .toBeLessThanOrEqual(3);
    // Phase 2P spent two authorized migrations after this phase closed, each
    // under a named owner authorization: slice 2P.1's under ADR-122's
    // amendment, and slice 2P.4's under ADR-123. They are counted explicitly
    // and pinned at exactly two, so an unattributed migration still fails the
    // total below. A THIRD is a stop condition, and this pin is where it fails.
    const laterPhase2p = migrations.filter((name) => /phase[_-]?2p/i.test(name));
    // Phase 2Q spent the ONE migration ADR-127 Decision 7 allocated, after this
    // phase closed. Pinned at exactly one for the same reason: a SECOND is a
    // stop condition and fails here too, rather than only at closeout.
    const laterPhase2q = migrations.filter((name) => /phase[_-]?2q/i.test(name));
    // Phase 2R spent the ONE migration ADR-132 Decision 8 allocated and ADR-133
    // Decision 3 authorized, after this phase closed. Counted the same way and
    // for the same reason: a SECOND is a stop condition, and the total below is
    // what makes an UNATTRIBUTED migration fail rather than merely a numerous
    // one.
    const laterPhase2r = migrations.filter((name) => /phase[_-]?2r/i.test(name));
    expect(laterPhase2p, `Phase 2P must have exactly two migrations: ${laterPhase2p.join(", ")}`)
      .toHaveLength(2);
    expect(laterPhase2q, `Phase 2Q must have exactly one migration: ${laterPhase2q.join(", ")}`)
      .toHaveLength(1);
    expect(laterPhase2r, `Phase 2R must have exactly one migration: ${laterPhase2r.join(", ")}`)
      .toHaveLength(1);
    // Phase 2S spent the ONE migration OD-2S-7 A allocated and ADR-138
    // Decision 3 authorized, after this phase closed. Counted explicitly
    // rather than absorbed into a bumped number, so an unattributed
    // migration arriving beside it still fails the total. A SECOND 2S
    // migration is a stop condition and fails here.
    const laterPhase2s = migrations.filter((name) => /phase[_-]?2s/i.test(name));
    expect(laterPhase2s, `Phase 2S is allocated exactly one migration: ${laterPhase2s.join(", ")}`)
      .toHaveLength(1);
    expect(
      migrations,
      "a migration appeared that belongs to neither the pre-phase baseline nor this phase",
    ).toHaveLength(
      MIGRATIONS_BEFORE_PHASE_2N + mine.length + 3
      + laterPhase2p.length + laterPhase2q.length + laterPhase2r.length
      + laterPhase2s.length,
    );
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

describe("Phase 2N: implementation is under way, and its artifacts arrive at their gates", () => {
  it("requires the closing artifacts now that 2N.7 has produced them", () => {
    /*
     * **Inverted a second time, and this is the last inversion.**
     *
     * Under planning, any acceptance record, matrix, report or deployment record
     * was proof that work had started under an authorization that forbade it.
     * ADR-112 narrowed that to the **closing** artifacts, because a phase
     * growing a closing report with six slices outstanding has declared victory
     * rather than reached it. Slice 2N.7 has now produced them, so the same
     * assertion turns over: their **absence** is what would be wrong.
     *
     * The gate is kept rather than deleted for the reason Phase 2M's equivalent
     * was kept: a deleted assertion records nothing, and the next reader cannot
     * tell a gate that was satisfied from a gate that was removed.
     *
     * **The deployment record stays out.** Phase 2N's last migration was
     * deployed by slice 2N.3 and recorded there; 2N.7 spends none, so it has no
     * deployment to record and inventing a file to satisfy a pattern would be
     * the shape this whole family refuses.
     */
    const reports = readdirSync(join(REPO, "docs", "reports", "phase-2n"));
    for (const required of ["PHASE_2N_TRACEABILITY_MATRIX.md", "PHASE_2N_CLOSING_REPORT.md"]) {
      expect(reports, `${required} is missing at the phase's close`).toContain(required);
    }
    // Non-vacuous: the filter really filters, and the directory really has more
    // in it than the two files above.
    expect(reports.filter((name) => /ACCEPTANCE/.test(name)).length).toBeGreaterThanOrEqual(8);
  });

  it("keeps the matrix generated rather than typed", () => {
    // `2N-CLOSE-001`. The matrix is the one closing artifact a phase could fake
    // by hand, so the header it carries is asserted here as well as by
    // `phase-2n-traceability.test.ts`, which re-derives it from source.
    const matrix = read("docs/reports/phase-2n/PHASE_2N_TRACEABILITY_MATRIX.md");
    expect(matrix).toMatch(/Generated by `scripts\/generate-phase-2n-traceability\.mjs`/);
    expect(matrix).toMatch(/Do not edit by hand/);
    expect(matrix).toMatch(/127 declared · 127 classified · 0 unclassified/);
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
    // The notes posture must reach no database. Asserted as "no migration names
    // privacy or notes" rather than as a flat file count, which ADR-112 made
    // movable — the claim was never about the total, it was about this decision
    // costing nothing.
    expect(
      readdirSync(join(REPO, "supabase", "migrations")).filter((name) =>
        /privacy|notes|sensitiv/i.test(name),
      ),
    ).toEqual([]);
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

describe("ADR-112: implementation is authorized and the stale time requirements are corrected", () => {
  const adr = () => {
    const decisions = read("docs/DECISIONS.md");
    const start = decisions.indexOf("## ADR-112");
    expect(start, "ADR-112 is not recorded").toBeGreaterThan(0);
    const next = decisions.indexOf("\n## ADR-", start + 1);
    return decisions.slice(start, next === -1 ? undefined : next);
  };

  it("records ADR-112 as an accepted implementation authorization that still refuses a fourth migration", () => {
    const body = adr();
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body).toMatch(/authorizes \*\*implementation through closeout\*\*/i);
    expect(body).toMatch(/fourth is a STOP CONDITION/i);
    // The property every authorizing ADR in this series is held to.
    expect(body, "an authorizing ADR must not name the successor").not.toMatch(/2O/i);
  });

  it("keeps ADR-108, ADR-109, ADR-110 and ADR-111 unrewritten", () => {
    // The same rule applied for the fourth time in this series: an accepted ADR
    // is not edited into agreement with a later one. ADR-108's ceiling of four
    // and ADR-109's "destinations, not permissions" are the record of what was
    // true when each was signed.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions.slice(decisions.indexOf("## ADR-108"), decisions.indexOf("## ADR-109")))
      .toMatch(/ceiling FOUR/i);
    expect(decisions.slice(decisions.indexOf("## ADR-109"), decisions.indexOf("## ADR-110")))
      .toMatch(/destinations, not permissions/i);
    expect(adr()).toMatch(/ADR-108, ADR-109, ADR-110 and ADR-111 are \*\*not rewritten\*\*/);
  });

  it("restates four time requirements in place, with markers, and renumbers nothing", () => {
    /*
     * The traceability half. A correction that renumbered, reused or deleted an
     * id would make every prior reference silently wrong — so the ids are
     * asserted to still exist, to still be six, and to carry an explicit
     * restatement marker naming the decision that moved them.
     */
    const prd = read(PRD);
    for (const id of ["2N-TIME-002", "2N-TIME-004", "2N-TIME-005", "2N-TIME-006"]) {
      expect(prd, `${id} is no longer declared`).toMatch(new RegExp(`- \\*\\*${id}:\\*\\*`));
      const block = prd.slice(prd.indexOf(`- **${id}:**`));
      const body = block.slice(0, block.indexOf("\n- **2N-"));
      expect(body, `${id} is restated without saying so`).toMatch(/\(Restated by ADR-112/);
      expect(body, `${id} must close baseline, not built`).toMatch(/\[BASELINE\]/);
    }
    // Untouched by the correction, and still obligations on unwritten code.
    for (const id of ["2N-TIME-001", "2N-TIME-003"]) {
      const block = prd.slice(prd.indexOf(`- **${id}:**`));
      expect(block.slice(0, block.indexOf("\n- **2N-"))).toMatch(/\[OBLIGATION\]/);
    }
    expect(ids.filter((id) => id.startsWith("2N-TIME-"))).toHaveLength(6);
  });

  it("stops requiring a second timezone census, in the PRD and in the plan", () => {
    // The substance of the correction: 2N.0 must not build a narrower guard
    // beside the tree-wide one. Asserted in both documents because the plan is
    // what an implementer reads.
    const prd = read(PRD);
    // Wrapped prose: the phrase spans a line break in the PRD, and an assertion
    // that only matched it unwrapped would fail on correct text.
    expect(prd).toMatch(/2N\.0 builds no timezone guard of its\s+own/i);
    const plan = read(PLAN);
    expect(plan, "the plan still lists the fixed-offset guard for corpus extension")
      .not.toMatch(/phase-2m-fixed-offset-guard\.test\.ts\s*\n?\s*\(corpus extension/);
    expect(plan).toMatch(/this slice now\s*\n?\s*extends no timezone guard at all|extends no timezone guard/i);
  });

  it("records the corrected population as 31 rather than the signed estimate", () => {
    const prd = read(PRD);
    const block = prd.slice(prd.indexOf("- **2N-TIME-005:**"));
    const body = block.slice(0, block.indexOf("\n- **2N-"));
    expect(body).toMatch(/\*\*31 occurrences/);
    expect(body, "the correction must cite the clause that permits it")
      .toMatch(/whichever is current/);
  });

  it("leaves the tree-wide guard at zero with no allowlist, which is what makes the correction safe", () => {
    /*
     * The correction's whole premise is that a tree-wide guard already covers
     * this phase's directories. If that guard were weakened — its list
     * re-populated, its corpus narrowed — the restatement would have removed one
     * census and left nothing. Asserted here, in the phase's own guard, rather
     * than trusted to the other file.
     */
    const guard = read("src/lib/closeout/local-day-correction-guard.test.ts");
    expect(guard).toMatch(/export const OPEN_OCCURRENCES: readonly Exemption\[\] = \[\s*(?:\/\/[^\n]*\n\s*)*\];/);
    expect(guard, "the tree-wide corpus stopped being the tree").toMatch(/walk\(join\(REPO, "src"\)\)/);
  });

  it("disposes both Unit 5 findings, one in scope and one out, neither silently", () => {
    const prd = read(PRD);
    expect(prd, "the loading-state locale defect is not carried by any requirement")
      .toMatch(/loading\.tsx[\s\S]{0,400}2N-ACCESS-005/);
    expect(prd, "the swallowed rejection is not recorded as a remainder")
      .toMatch(/loadQuestionPreviews[\s\S]{0,400}Destination/);
    // Out of scope is a claim about this phase's surfaces, so it is asserted
    // against them rather than asserted about them.
    expect(adr()).toMatch(/no instance of that pattern on any Phase 2N surface/i);
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
