/**
 * **Phase 2S's planning package holds itself to its own contract.**
 *
 * This guard exists because every one of its assertions is a rule this
 * repository has already paid for, in a phase where the rule was written in
 * prose and nothing read it:
 *
 * 1. **The count is derived, never typed.** Phase 2R's PRD said *"fifty-two
 *    across nine families"* while its tables held 73 across ten, and the
 *    sentence was caught by counting rows rather than by reading it. **It
 *    happened again inside this very package**: slice 2S.2 was written as 31
 *    requirements and re-deriving from the tables gave 23. The prose is
 *    therefore asserted **against the derived count**, in both directions.
 * 2. **No family name may contain a digit.** `2K-A11Y` did, which made seven
 *    accessibility requirements invisible to every prose count, to the
 *    traceability generator's attribution check *and* to the A13 detector's
 *    `[A-Z]+` family pattern. The control is **two-sided**.
 * 3. **A signature may append, and may never renumber.** ADR-137 added 25
 *    requirements. Every pre-signature identifier is listed here **by name** and
 *    asserted still present, so an edit that renumbers one to make the reading
 *    order tidier fails here rather than silently changing what a reference
 *    written last week resolves to.
 * 4. **Allocated is not created, and signed is not authorized.** Three different
 *    facts, asserted separately, so a package cannot slide from one to the next.
 * 5. **A recommendation that was overridden is preserved, not rewritten.**
 *    `OD-2S-3` was signed B against the recommendation. The recommendation stays
 *    in the PRD exactly as written, and the ADR records the disagreement — a
 *    package that revises its advice once the answer arrives is a package whose
 *    advice carries no information.
 * 6. **`baseline` may never be recorded as `built`**, asserted as a **refusal**
 *    in the contract rather than as a sentence.
 * 7. **Planning contains no classification, no acceptance record and no
 *    execution matrix.** Those are slice artifacts.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const INITIATIVE = "docs/initiatives/phase-2s";
const REPORTS = "docs/reports/phase-2s";
const PRD = `${INITIATIVE}/PHASE_2S_PRD.md`;
const PLAN = `${INITIATIVE}/PHASE_2S_IMPLEMENTATION_PLAN.md`;
const THEMES = `${INITIATIVE}/PHASE_2S_THEME_OPTIONS.md`;
const AUDIT = `${REPORTS}/PHASE_2S_CURRENT_EXPERIENCE_AUDIT.md`;
const GAPS = `${REPORTS}/PHASE_2S_GAPS_AND_OPPORTUNITIES.md`;
const THREATS = `${REPORTS}/PHASE_2S_THREAT_MODEL.md`;
const CONTRACT = `${REPORTS}/PHASE_2S_TRACEABILITY_CONTRACT.md`;
/** Slice 2S.4's closing record, which must exist and must not claim closure. */
const CLOSING_REPORT = `${REPORTS}/PHASE_2S_CLOSING_REPORT.md`;
const COVERAGE = `${REPORTS}/PHASE_2S_REQUIREMENT_COVERAGE.md`;

/** A requirement's row in a PRD table: `| \`2S-FAMILY-001\` | … |`. */
const DECLARATION = /^\| `(2S-[A-Z]+-\d{3})` \|/gm;

/**
 * The A13 detector's family pattern, reproduced so the digit rule can be tested
 * against the same shape the detector uses rather than against a private copy.
 * A control holding its own pattern is a control that keeps passing while the
 * guard beside it drifts.
 */
const DETECTOR_FAMILY = /^(?:- \*\*|\| `)2S-[A-Z]+-\d{3}/m;

const EXPECTED_FAMILIES = [
  "FOUNDATION",
  "SILENCE",
  "CADENCE",
  "REACH",
  "ANSWER",
  "ACT",
  "ATTENTION",
  "TRUST",
  "ACCESS",
  "MOBILE",
  "CLOSE",
] as const;

/** Family sizes, derived at planning and asserted so a silent edit moves a number here. */
const EXPECTED_SIZES: Readonly<Record<string, number>> = {
  FOUNDATION: 7,
  SILENCE: 11,
  CADENCE: 8,
  REACH: 5,
  ANSWER: 8,
  ACT: 12,
  ATTENTION: 8,
  TRUST: 13,
  ACCESS: 7,
  MOBILE: 7,
  CLOSE: 13,
};

const EXPECTED_TOTAL = 99;

/**
 * **The requirement set as it stood before ADR-137**, listed by name.
 *
 * ADR-137 Decision 4 says every added requirement was *appended* and none was
 * renumbered, reused or removed. That sentence is only worth what checks it, so
 * this is the check: each identifier below must still exist, and still sit in
 * the family it sat in. A future edit that renumbers `2S-ACT` into reading order
 * — the tidy-looking change this list exists to refuse — fails here.
 */
const PRE_SIGNATURE_IDS: readonly string[] = [
  ...Array.from({ length: 7 }, (_, i) => `2S-FOUNDATION-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 10 }, (_, i) => `2S-SILENCE-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 8 }, (_, i) => `2S-CADENCE-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 5 }, (_, i) => `2S-REACH-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 6 }, (_, i) => `2S-ANSWER-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 7 }, (_, i) => `2S-ATTENTION-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 9 }, (_, i) => `2S-TRUST-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 5 }, (_, i) => `2S-ACCESS-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 5 }, (_, i) => `2S-MOBILE-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 12 }, (_, i) => `2S-CLOSE-${String(i + 1).padStart(3, "0")}`),
];

const EXPECTED_DECISIONS = Array.from({ length: 10 }, (_, index) => `OD-2S-${index + 1}`);

/** What ADR-137 signed, so the package and the ADR cannot drift apart. */
const SIGNED: Readonly<Record<string, "A" | "B">> = {
  "OD-2S-1": "A",
  "OD-2S-2": "A",
  "OD-2S-3": "B",
  "OD-2S-4": "B",
  "OD-2S-5": "B",
  "OD-2S-6": "A",
  "OD-2S-7": "A",
  "OD-2S-8": "A",
  "OD-2S-9": "A",
  "OD-2S-10": "A",
};

function declarations(): string[] {
  return [...read(PRD).matchAll(DECLARATION)].map((match) => match[1]);
}

function rows(): { id: string; cells: string[] }[] {
  return read(PRD)
    .split(/\r?\n/)
    .filter((line) => /^\| `2S-[A-Z]+-\d{3}` \|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return { id: cells[0].replace(/`/g, ""), cells };
    });
}

function adrBlock(adr: string): string {
  const decisions = read("docs/DECISIONS.md");
  const at = decisions.indexOf(`## ${adr}`);
  expect(at, `${adr} is missing`).toBeGreaterThan(-1);
  const next = decisions.indexOf("\n## ADR-", at + 1);
  return next < 0 ? decisions.slice(at) : decisions.slice(at, next);
}

const familyOf = (id: string) => id.slice("2S-".length, id.lastIndexOf("-"));
const indexOf = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));

describe("Phase 2S: the package exists and is the pair the ADRs name", () => {
  it("ships the governing pair and the five evidence documents", () => {
    for (const path of [PRD, PLAN, THEMES, AUDIT, GAPS, THREATS, CONTRACT, COVERAGE]) {
      expect(existsSync(join(REPO, path)), `${path} is missing`).toBe(true);
    }
  });

  it("is authorized by an accepted ADR that authorizes planning only", () => {
    const body = adrBlock("ADR-136");
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "the authorization must be planning-only")
      .toMatch(/authorizes \*\*planning only\*\*/);
    expect(body, "it must authorize no implementation")
      .toMatch(/authorizes no implementation/i);
    expect(body, "the waiver must not move").toMatch(/NOT EXECUTED — OWNER WAIVED/);
    expect(body, "an ADR in this series must not name the successor").not.toMatch(/2T/i);
  });

  it("keeps ADR-135 intact rather than rewritten into agreement with ADR-136", () => {
    const body = adrBlock("ADR-135");
    expect(body, "ADR-135 must still close Phase 2R").toMatch(/Phase 2R is CLOSED/);
    expect(body, "ADR-135 must still authorize no successor")
      .toMatch(/This ADR authorizes no successor/);
  });

  it("keeps ADR-136 intact rather than rewritten into agreement with ADR-137", () => {
    // The rule since ADR-108. ADR-137 answers what ADR-136 left open; it does
    // not revise it, and in particular it does not retroactively make ADR-136
    // read as though the decisions had been signed when it was written.
    const body = adrBlock("ADR-136");
    expect(body, "ADR-136 must still declare the ten decisions open")
      .toMatch(/ten decisions are OPEN, and this ADR signs none of them/);
    expect(body, "ADR-136 must still read as budget-proposed")
      .toMatch(/the migration budget is PROPOSED, not signed/);
  });
});

describe("Phase 2S: the requirements are declared, sequential and countable", () => {
  it("declares 99 requirements, each exactly once", () => {
    const ids = declarations();
    expect(ids.length).toBe(EXPECTED_TOTAL);
    expect(new Set(ids).size, "a requirement is declared twice").toBe(ids.length);
  });

  it("numbers every family from 001, without a gap, in document order", () => {
    const byFamily = new Map<string, number[]>();
    for (const id of declarations()) {
      const list = byFamily.get(familyOf(id)) ?? [];
      list.push(indexOf(id));
      byFamily.set(familyOf(id), list);
    }
    for (const [family, indices] of byFamily) {
      expect(indices, `${family} is not sequential from 001 in document order`)
        .toEqual(indices.map((_, position) => position + 1));
    }
  });

  it("declares exactly the eleven families, at exactly the derived sizes", () => {
    const sizes: Record<string, number> = {};
    for (const id of declarations()) sizes[familyOf(id)] = (sizes[familyOf(id)] ?? 0) + 1;
    expect(Object.keys(sizes).sort()).toEqual([...EXPECTED_FAMILIES].sort());
    expect(sizes).toEqual(EXPECTED_SIZES);
    expect(Object.values(EXPECTED_SIZES).reduce((a, b) => a + b, 0)).toBe(EXPECTED_TOTAL);
  });

  it("appended every requirement the signature added, and renumbered none", () => {
    // ADR-137 Decision 4, asserted rather than believed. Each pre-signature
    // identifier must still exist and still belong to its original family.
    const declared = new Set(declarations());
    const missing = PRE_SIGNATURE_IDS.filter((id) => !declared.has(id));
    expect(missing, "a pre-signature identifier was renumbered or removed").toEqual([]);
    expect(PRE_SIGNATURE_IDS.length, "the pre-signature set was 74").toBe(74);
    expect(declared.size - PRE_SIGNATURE_IDS.length, "the signature added 25").toBe(25);
  });

  it("proves a digit-bearing family really would be invisible to the detector", () => {
    for (const family of EXPECTED_FAMILIES) {
      expect(/^[A-Z]+$/.test(family), `${family} contains a character the detector cannot see`)
        .toBe(true);
    }
    expect(DETECTOR_FAMILY.test("| `2S-ACCESS-001` | x | y | build | — |"), "the control is inert")
      .toBe(true);
    expect(DETECTOR_FAMILY.test("| `2S-A11Y-001` | x | y | build | — |"), "a digit family was seen")
      .toBe(false);
    expect([...("| `2S-A11Y-001` | x |").matchAll(DECLARATION)].length).toBe(0);
  });

  it("gives every requirement an observable criterion, a kind and a dependency cell", () => {
    for (const { id, cells } of rows()) {
      expect(cells.length, `${id} has the wrong column count`).toBe(5);
      expect(cells[1].length, `${id} has no requirement text`).toBeGreaterThan(10);
      expect(cells[2].length, `${id} has no observable criterion`).toBeGreaterThan(10);
      expect(["build", "baseline", "rule"], `${id} declares an unknown kind`).toContain(cells[3]);
      expect(cells[4].length, `${id} has no dependency cell`).toBeGreaterThan(0);
    }
  });

  it("states its own totals against the derived counts, in both directions", () => {
    const ids = declarations();
    const families = new Set(ids.map(familyOf));
    const kinds = rows().reduce<Record<string, number>>((counts, { cells }) => {
      counts[cells[3]] = (counts[cells[3]] ?? 0) + 1;
      return counts;
    }, {});

    expect(ids.length).toBe(EXPECTED_TOTAL);
    expect(families.size).toBe(11);
    expect(kinds.build).toBe(75);
    expect(kinds.baseline).toBe(18);
    expect(kinds.rule).toBe(6);
    expect(kinds.build + kinds.baseline + kinds.rule).toBe(ids.length);

    expect(read(PRD), "the PRD's prose count must match its tables")
      .toContain("**Ninety-nine requirements across eleven families.**");
    const coverage = read(COVERAGE);
    expect(coverage).toContain("| declared requirements | **99** |");
    expect(coverage).toContain("| `build` | **75** |");
    expect(coverage).toContain("| `baseline` | **18** |");
    expect(coverage).toContain("| `rule` | **6** |");
    expect(read(CONTRACT), "the contract's count must match too").toContain("**99** must get one");
  });

  it("names every requirement in the coverage report, and names nothing it did not declare", () => {
    const declared = new Set(declarations());
    const covered = new Set(
      [...read(COVERAGE).matchAll(/^\| `(2S-[A-Z]+-\d{3})` \|/gm)].map((match) => match[1]),
    );
    expect([...declared].filter((id) => !covered.has(id)), "declared but not covered").toEqual([]);
    expect([...covered].filter((id) => !declared.has(id)), "covered but not declared").toEqual([]);
  });
});

describe("Phase 2S: the ten decisions are signed, and the override is on the record", () => {
  it("declares all ten in the PRD, each with options, a recommendation and a signature", () => {
    const prd = read(PRD);
    for (const decision of EXPECTED_DECISIONS) {
      expect(prd, `${decision} is not declared`).toContain(`### \`${decision}\``);
    }
    for (const [decision, option] of Object.entries(SIGNED)) {
      const at = prd.indexOf(`### \`${decision}\``);
      const nextHeading = prd.indexOf("\n### ", at + 1);
      const nextSection = prd.indexOf("\n## ", at + 1);
      const end = Math.min(...[nextHeading, nextSection].filter((n) => n > -1));
      const body = prd.slice(at, Number.isFinite(end) ? end : undefined);
      expect(body, `${decision} carries no signature`).toMatch(
        new RegExp(`\\*\\*SIGNED: ${option}\\b`),
      );
      expect(body, `${decision} lost its recommendation`).toMatch(/\*\*Recommendation: /);
    }
  });

  it("has an accepted ADR signing every one of them, by name and by option", () => {
    const body = adrBlock("ADR-137");
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    for (const [decision, option] of Object.entries(SIGNED)) {
      expect(body, `${decision} is not signed by ADR-137`).toMatch(
        new RegExp(`\`${decision}\` \\*\\*${option}\\*\\*`),
      );
    }
    expect(body, "signing must not authorize implementation")
      .toMatch(/authorizes no implementation/i);
    expect(body, "an ADR in this series must not name the successor").not.toMatch(/2T/i);
  });

  it("records the override as an override, in the ADR and in the PRD", () => {
    // The property this repository would otherwise lose: a recommendation that
    // was not taken, quietly rewritten to match the answer. Both documents must
    // say the two disagreed.
    const adr = adrBlock("ADR-137");
    expect(adr, "the ADR must name the contradiction")
      .toMatch(/signed B, and it CONTRADICTS the recommendation/);
    expect(adr, "the ADR must carry the owner's own reason")
      .toMatch(/agir no próprio aviso/);
    expect(adr, "the ADR must say the recommendation is not rewritten")
      .toMatch(/The recommendation is not rewritten into agreement/);

    const prd = read(PRD);
    expect(prd, "the PRD must mark the disagreement in its decision table")
      .toMatch(/\*\*NO — the owner's deliberate override\*\*/);
    expect(prd, "the PRD must keep the recommendation it lost")
      .toContain("**Recommendation: A.** **Consequence:** the owner still leaves the notification");
  });

  it("turns the overridden objection into a requirement and a stop condition", () => {
    // An objection that loses a decision and then vanishes is an objection
    // nobody has to answer. This is where it survives.
    const prd = read(PRD);
    expect(prd, "the new-writer refusal must exist as a requirement")
      .toContain("`2S-TRUST-010`");
    expect(prd, "and it must be a stop condition, not a review note")
      .toMatch(/A requirement that needs a new writer is a stop condition/);
    const plan = read(PLAN);
    expect(plan, "the stop condition must be in the consolidated list")
      .toMatch(/An inline verb needs a NEW WRITE AUTHORITY/);
    expect(read(THREATS), "and it must be modelled as a threat")
      .toMatch(/`T-2S-15` — a second authority over a task's status/);
  });

  it("proves the reuse rather than asserting it, naming each authority and where it lives", () => {
    const plan = read(PLAN);
    for (const authority of [
      "work-item-actions.tsx:38",
      "detail-actions.ts:208",
      "agent/actions.ts:501",
      "undo-affordance.tsx:54",
      "detail-controls.ts:113",
    ]) {
      expect(plan, `the plan does not name ${authority}`).toContain(authority);
    }
    expect(plan, "the plan must name the cost the reuse carries")
      .toMatch(/takes a `WorkItemView`/);
  });

  it("keeps the plan blocked on a separate implementation authorization", () => {
    const plan = read(PLAN);
    expect(plan).toMatch(/Record an implementation authorization ADR/);
    expect(plan, "signed must not read as authorized")
      .toMatch(/signed is not\s+authorized/);
  });
});

/*
 * **Added by ADR-138, in the commit that recorded it.**
 *
 * The block above asserts that the *plan* still names the blocker, and it keeps
 * asserting that, because the plan is a planning artifact and is not rewritten
 * once its blocker clears — the rule since ADR-108. What that block cannot say
 * is whether the blocker was ever answered, and a document that goes on naming
 * a blocker nobody cleared reads identically to one whose blocker was cleared
 * yesterday. This block is the other half: the authorization exists, it is an
 * accepted owner decision, it authorizes exactly the five slices, it spends the
 * allocation in one of them, and it stops short of closure.
 */
describe("Phase 2S: implementation is authorized, and the authorization stops where it says", () => {
  it("has an accepted ADR authorizing the construction of the five slices", () => {
    const body = adrBlock("ADR-138");
    expect(body, "the authorization must be accepted").toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "it must be an owner decision").toMatch(/owner decision/);
    for (const slice of ["2S.0", "2S.1", "2S.2", "2S.3", "2S.4"]) {
      expect(body, `${slice} is not authorized by name`).toContain(slice);
    }
  });

  it("spends the allocation in slice 2S.1 alone, and keeps a second migration a stop condition", () => {
    const body = adrBlock("ADR-138");
    expect(body, "the allocation must be tied to one slice")
      .toMatch(/slice 2S\.1 and nowhere else|slice 2S\.1 alone/);
    expect(body, "a second migration must still halt the phase")
      .toMatch(/second migration of any kind remains a stop condition/);
  });

  it("does not authorize closure, and names the two owner checkpoints", () => {
    const body = adrBlock("ADR-138");
    expect(body, "closure must stay a separate owner decision")
      .toMatch(/does not authorize the phase to close/);
    expect(body, "the device checkpoint must be named")
      .toContain("2S-MOBILE-003");
    expect(body, "an automated lane must not be allowed to stand in for the device")
      .toMatch(/no automated lane substitutes/);
  });

  it("reopens none of the signatures and names no successor", () => {
    const body = adrBlock("ADR-138");
    expect(body, "the signatures must stay closed")
      .toMatch(/not one of ADR-137's signatures is reopened/);
    expect(body, "the override must stand as signed").toMatch(/`OD-2S-3` stays \*\*B\*\*/);
    expect(body, "the refusal the owner restated must stand").toMatch(/`OD-2S-8` stays \*\*A\*\*/);
    expect(body, "an authorizing ADR must not name its successor")
      .toMatch(/names no successor/);
    expect(/2T/.test(body), "the successor letter must not appear in the authorization")
      .toBe(false);
  });

  it("keeps ADR-136 and ADR-137 intact rather than rewritten into agreement with it", () => {
    // The rule since ADR-108, applied a third time in this phase's own life.
    expect(adrBlock("ADR-136"), "ADR-136 must still declare the ten decisions open")
      .toMatch(/OPEN/);
    expect(adrBlock("ADR-137"), "ADR-137 must still read as allocated, never as spent")
      .toMatch(/ALLOCATED at exactly one/);
    expect(adrBlock("ADR-137"), "ADR-137 must still say the allocation is not a file")
      .toMatch(/Allocated is not created/);
  });
});

describe("Phase 2S: allocated is not created, and the ceiling did not move", () => {
  it("states the budget as allocated everywhere it states it", () => {
    for (const path of [PRD, CONTRACT, COVERAGE]) {
      expect(read(path), `${path} does not state the allocation`)
        .toContain("1 allocated · 0 spent · 0 created");
      expect(read(path), `${path} still describes the budget as proposed`)
        .not.toContain("1 proposed · 0 allocated");
    }
  });

  it("keeps the ceiling at one despite the override", () => {
    const prd = read(PRD);
    expect(prd, "the override must be recorded as not raising the ceiling")
      .toMatch(/`OD-2S-3` B does not raise the ceiling/);
    expect(prd, "a surface needing its own schema must be a stop condition")
      .toMatch(/that is a second migration and therefore a stop\s+condition/);
  });

  /*
   * **Inverted by slice 2S.1, in the commit that spends the allocation.**
   *
   * This asserted ZERO Phase 2S migrations and a chain of 101, because during
   * planning the distinction that mattered was *allocated is not created*.
   * Slice 2S.1 created it under ADR-138 Decision 3, so keeping the old form
   * would force the guard to deny a file the owner authorized.
   *
   * The distinction the assertion exists for does not go away -- it moves to
   * the next one. The ceiling is now what is pinned: EXACTLY ONE Phase 2S
   * migration, named, so a second of any kind fails here rather than merely
   * being disapproved of in prose. That is the stop condition, expressed as a
   * check.
   */
  it("creates exactly the one migration allocated, by name", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((name) =>
      name.endsWith(".sql"),
    );
    const mine = migrations.filter((name) => /phase[_-]?2s/i.test(name));
    expect(mine, "a SECOND Phase 2S migration is a stop condition").toEqual([
      "202608240102_phase_2s_slice_1_notification_suppressions.sql",
    ]);
    expect(migrations.length, "an unattributed migration arrived beside the allocated one")
      .toBe(102);
    // The migration names the allocation it consumes, so a budget line nobody
    // can trace back to a signature cannot exist.
    const header = read(`supabase/migrations/${mine[0]}`).slice(0, 4000);
    expect(header, "the migration does not name the decision that allocated it")
      .toMatch(/OD-2S-7 is signed as option A/);
    expect(header, "the migration does not carry its own stop condition")
      // `[\s-]+` rather than `\s+`: the sentence wraps across two SQL comment
      // lines, so what separates STOP from CONDITION is a newline AND a `--`.
      .toMatch(/SECOND MIGRATION OF ANY KIND IS A STOP[\s-]+CONDITION/);
  });

  it("keeps a second migration a stop condition rather than a ceiling alone", () => {
    for (const path of [PRD, PLAN, CONTRACT]) {
      expect(read(path), `${path} does not carry the stop condition`)
        .toMatch(/second migration of any kind/i);
    }
  });
});

describe("Phase 2S: planning contains no classification and no execution record", () => {
  it("classifies nothing", () => {
    for (const { id, cells } of rows()) {
      for (const forbidden of ["built", "partial", "undelivered", "not-built-by-rule"]) {
        expect(cells[3], `${id} carries a delivery class`).not.toBe(forbidden);
      }
    }
    expect(read(CONTRACT), "the contract must say it classifies nothing")
      .toMatch(/\*\*It classifies nothing now\*\*/);
  });

  /*
   * **Inverted by slice 2S.0, in the commit that made its premise false.**
   *
   * This assertion refused **every** acceptance record, because during planning
   * there were none and an artifact appearing without an authorization is the
   * thing it existed to catch. ADR-138 authorized the slices, so refusing the
   * records outright would now force the guard to deny work the owner
   * authorized — the mirror-image error, and the same one the milestone guard
   * has now made in both directions eleven times.
   *
   * **The distinction the assertion exists for does not move**, and it is the
   * only reason to keep it rather than delete it: a record may exist **only for
   * a slice that has run**. So the set is closed against the slices actually
   * delivered, an unnumbered or out-of-order record still refuses, and the
   * closeout artifacts — the matrix and the generator — stay refused until 2S.4
   * builds them. An absence nobody asserts is an absence nobody notices
   * disappearing.
   */
  it("ships only the acceptance records of slices that have run, and the closeout artifacts 2S.4 owes", () => {
    /*
     * **Inverted a second time, by slice 2S.4, exactly as the note above said it
     * would be.** The closeout artifacts were refused *until 2S.4 builds them*;
     * 2S.4 built them, so refusing them now would deny the work the same
     * authorization required — the mirror-image error this guard has already
     * been corrected for once.
     *
     * The distinction still does not move: a record may exist **only for a slice
     * that has run**, and the set stays closed, so an unnumbered or out-of-order
     * record still refuses. What changed is which side of the line the matrix
     * and the generator sit on, and they are now asserted **present** rather
     * than merely permitted — an artifact nobody asserts is an artifact nobody
     * notices disappearing.
     */
    const DELIVERED = [
      "PHASE_2S_SLICE_00_ACCEPTANCE.md",
      "PHASE_2S_SLICE_01_ACCEPTANCE.md",
      "PHASE_2S_SLICE_02_ACCEPTANCE.md",
      "PHASE_2S_SLICE_03_ACCEPTANCE.md",
      "PHASE_2S_SLICE_04_ACCEPTANCE.md",
    ];
    const records = readdirSync(join(REPO, REPORTS)).filter((name) => /ACCEPTANCE/i.test(name));
    expect(records.sort(), "a record exists for a slice that has not run, or one is missing")
      .toEqual(DELIVERED);

    for (const artifact of ["PHASE_2S_TRACEABILITY_MATRIX.md", "PHASE_2S_CLOSING_REPORT.md"]) {
      expect(existsSync(join(REPO, REPORTS, artifact)), `${artifact} is a 2S.4 artifact and is missing`)
        .toBe(true);
    }
    expect(existsSync(join(REPO, "scripts/generate-phase-2s-traceability.mjs")), "the generator is a 2S.4 artifact")
      .toBe(true);

    /*
     * And the one thing 2S.4 must still NOT ship: closure. `2S-CLOSE-010` keeps
     * it an owner decision recorded as an ADR after a closing device checkpoint,
     * so a closing ADR appearing without one is exactly what this half refuses.
     */
    expect(read(CLOSING_REPORT), "the closing report must not claim the phase is closed")
      .toMatch(/THIS REPORT DOES NOT CLOSE THE PHASE/);
  });

  it("classifies only what its own slices delivered, and never a baseline as built", () => {
    /*
     * `2S-CLOSE-003`, applied at the phase's FIRST slice rather than discovered
     * at its last. Phase 2R wrote the same rule in prose before its first slice
     * and nothing read it: five requirements were misfiled from 2R.0 onward and
     * survived five slices, three device checkpoints and every green CI run.
     *
     * The kinds come from the PRD's own declaration column, so this cannot
     * drift from what was declared.
     */
    const declared = new Map(rows().map(({ id, cells }) => [id, cells[3]]));
    let classified = 0;
    for (const name of readdirSync(join(REPO, REPORTS)).filter((n) => /ACCEPTANCE/i.test(n))) {
      const record = read(`${REPORTS}/${name}`);
      for (const [, id, cls] of record.matchAll(/^\| `(2S-[A-Z]+-\d{3})` \| \*\*([a-z-]+)\*\* \|/gm)) {
        expect(declared.has(id), `${name} classifies ${id}, which the PRD never declared`).toBe(true);
        /*
         * The contract's refusal 10 is narrow on purpose and this mirrors it
         * exactly: a declared `baseline` may never be recorded as **`built`**.
         * It may still be `partial`, `not-built-by-rule` or `undelivered` —
         * those say the property was NOT re-proved, which is an admission
         * rather than a claim, and refusing them would push a phase toward
         * over-claiming to satisfy a guard.
         *
         * An earlier version of this line demanded `toBe("baseline")` and would
         * have refused an honest `partial`.
         */
        if (declared.get(id) === "baseline") {
          expect(cls, `${id} is declared baseline and ${name} records it as built`).not.toBe("built");
        }
        classified += 1;
      }
    }
    // Non-vacuity: a reconciliation over zero rows agrees with everything.
    expect(classified, "the reconciliation must have read some classifications").toBeGreaterThan(0);
  });

  it("declares every threat OPEN, including the five the override added", () => {
    const threats = read(THREATS);
    const dispositions = [...threats.matchAll(/\*\*Disposition: ([^*]+)\*\*/g)].map((m) => m[1].trim());
    expect(dispositions.length, "the threat model declares the wrong number of dispositions").toBe(19);
    for (const disposition of dispositions) {
      expect(disposition, "a threat is disposed before anything is built").toMatch(/^OPEN/);
    }
    expect(threats).toContain("**Nineteen threats, all OPEN — planned.");
    for (const threat of ["T-2S-15", "T-2S-16", "T-2S-17", "T-2S-18", "T-2S-19"]) {
      expect(threats, `${threat} is missing`).toContain(threat);
    }
  });
});

describe("Phase 2S: the contract turns the rules into refusals rather than sentences", () => {
  it("refuses a baseline recorded as built, and does not refuse the reverse", () => {
    const contract = read(CONTRACT);
    expect(contract).toContain("a requirement declared **`baseline`** is classified **`built`**");
    expect(contract, "the opposite direction must stay sayable")
      .toMatch(/The opposite direction stays sayable/);
    expect(contract, "the Phase 2R failure must be named rather than implied")
      .toMatch(/five requirements were misfiled|five had been wrong|\*\*five\*\*/i);
  });

  it("refuses a writer that did not exist at the phase's own baseline", () => {
    const contract = read(CONTRACT);
    expect(contract).toContain("writer that did not exist at slice 2S.0's baseline");
    expect(contract, "the refusal needs its own reasoning section")
      .toMatch(/Refusal 20, and why `OD-2S-3` B needs a refusal of its own/);
    expect(contract, "and its own mutation control")
      .toMatch(/naming a writer absent from the 2S.0 baseline must make/);
  });

  it("refuses a claim that push works, while permitting a refusal of it", () => {
    const contract = read(CONTRACT);
    expect(contract).toContain("a document produced by this phase **claims push works**");
    expect(contract).toMatch(/forbids an assertion rather than a word/i);
    expect(read(PRD), "the phase must refuse push by name")
      .toMatch(/not resumed, not repaired, and \*\*not claimed\*\*/);
  });

  it("keeps the waiver verbatim and unclaimable", () => {
    for (const path of [PRD, AUDIT, COVERAGE]) {
      expect(read(path), `${path} lost the waiver`).toContain("NOT EXECUTED — OWNER WAIVED");
    }
  });
});

describe("Phase 2S: the four scopes are declared as four different things", () => {
  it("gives each verb its own requirement and its own subject of change", () => {
    const prd = read(PRD);
    expect(prd, "the scope-separation requirement is missing").toContain("`2S-SILENCE-011`");
    expect(prd, "Lida's scope is not pinned").toMatch(/\*Lida\* acts on the current message and nothing else/);
    expect(prd, "Descartar's scope is not pinned")
      .toMatch(/\*Descartar\* removes the current message from the experience and nothing else/);
    expect(prd, "an action that changes the task must say so")
      .toMatch(/An action that changes the task says so; an action that changes only the message says that/);
    expect(prd, "a purely visual action must be refused")
      .toMatch(/No action hides an item without changing state/);
  });

  it("states the four scopes as a table in the plan, so the slice cannot blur them", () => {
    const plan = read(PLAN);
    expect(plan).toMatch(/The four scopes, which is the whole of what this slice must not blur/);
    for (const verb of ["*Lida*", "*Descartar*", "*Silenciar por um tempo*", "*Silenciar este assunto*"]) {
      expect(plan, `${verb} is absent from the scope table`).toContain(verb);
    }
  });

  it("requires the same verbs with the same meanings on both surfaces", () => {
    expect(read(PRD)).toMatch(/The two surfaces offer the same verbs with the same meanings/);
    expect(read(THREATS)).toMatch(/`T-2S-19` — the two surfaces diverging/);
  });
});

describe("Phase 2S: every remainder that stays out is named with a destination", () => {
  const CARRIED = [
    "2R-TZ-SECOND-AUTHORITY",
    "2R-UNDO-LEDGER-NOT-CLOSED",
    "2R-OCCURRENCE-CANCEL-IRREVERSIBLE",
    "2R-AXE-MANUAL-LANE",
    "2R-RECURRENCE-LANE-UNRUNNABLE",
    "2R-DRAWER-NOT-LOCKED",
    "2R-TASK-RECURRENCE",
    "OD-2R-9",
    "2P-ATTENTION-008",
    "RG-DEP-3",
    "2P-CHAT-007-JOURNEY",
    "2P-REVIEW-CITATIONS",
    "2P-ACCESS-005",
    "ADR-055",
  ];

  it("reproduces every inherited item in the PRD's exclusion table", () => {
    const prd = read(PRD);
    for (const item of CARRIED) {
      expect(prd, `${item} was dropped rather than carried`).toContain(item);
    }
  });

  it("reproduces every one of them in the audit too, so neither document alone can lose one", () => {
    const audit = read(AUDIT);
    for (const item of CARRIED) {
      expect(audit, `${item} is absent from the audit`).toContain(item);
    }
  });

  it("keeps the attention defect out even though the phase now edits its file", () => {
    // The one the override made harder to hold. Slice 2S.3 does more work in
    // `needs-attention-list.tsx` than the pre-signature plan intended, so the
    // exclusion is restated rather than assumed.
    const adr = adrBlock("ADR-137");
    expect(adr, "the restatement must be on the record")
      .toMatch(/não absorva agora/);
    expect(read(GAPS), "the gaps report must carry it too")
      .toMatch(/not discharged by this phase editing their file|are not discharged by this phase editing their file/);
  });

  it("names the dated one with its date, because nothing here fires on a date", () => {
    for (const path of [PRD, AUDIT, GAPS]) {
      expect(read(path), `${path} lost ADR-055's date`).toContain("2026-10-27");
    }
  });

  it("records the three corrections as corrections rather than as discoveries", () => {
    const audit = read(AUDIT);
    expect(audit, "the credential correction").toMatch(/no longer unspendable/i);
    expect(audit, "the voice correction").toMatch(/Never once completed end to end/i);
    expect(audit, "the guard correction").toMatch(/has never matched the shape this repository/i);
  });
});
