import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Phase 2R declaration guard.
 *
 * ## What this file is, and what it is not
 *
 * It is a **documentary** guard. It reads `docs/` and asserts properties of
 * documents. It ships no route, no component, no Server Action and no SQL.
 * ADR-131 authorizes exactly this: the planning package, plus the guards that
 * keep it fail-closed.
 *
 * ## The posture it holds
 *
 * ADR-131 authorizes **planning only** and signs **nothing**. So the assertions
 * come in two directions, and both matter:
 *
 *  - the package is **present and coherent** — seven documents, 73 declarations,
 *    ten families with locked counts and no gaps, every requirement carrying a
 *    slice and an observable criterion;
 *  - everything that only exists *after* implementation is **absent** — no
 *    acceptance record, no matrix, no closing report, no deployment record, and
 *    **no Phase 2R migration**.
 *
 * Phase 2N's equivalent was inverted at closeout rather than deleted, Phase 2P's
 * was flipped rather than relaxed, and Phase 2Q's was inverted slice by slice.
 * This file is written to be **inverted the same way**, not thrown away: an
 * absence nobody asserts is an absence nobody notices disappearing.
 *
 * ## The pins this file carries
 *
 * 1. **No decision is signed.** All nine `OD-2R-*` are OPEN, including the theme
 *    itself. A package that reported a recommendation as a signature would be
 *    describing a decision nobody made — which is `2R-CLOSE-008`.
 * 2. **No family name may contain a digit.** `2K-A11Y` did, which made Phase
 *    2K's seven accessibility requirements invisible to every prose count, to
 *    the traceability generator's attribution check, *and* to the A13 detector's
 *    `[A-Z]+` family pattern. The control here is **two-sided**: the positive
 *    half checks the ten declared families, and the negative half proves a
 *    digit-bearing family really would be invisible — because a positive check
 *    alone passes on an empty set.
 * 3. **The count is derived, never typed.** The prose said "fifty-two across
 *    nine families" when the tables held 73 across ten; it was caught by
 *    counting the table rows rather than by reading the sentence. So the
 *    sentence is asserted **against the derived count**, in both directions.
 * 4. **The migration budget is PROPOSED, not allocated.**
 */

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const PRD = "docs/initiatives/phase-2r/PHASE_2R_PRD.md";
const PLAN = "docs/initiatives/phase-2r/PHASE_2R_IMPLEMENTATION_PLAN.md";

/** A requirement's row in a PRD table: `| \`2R-FAMILY-001\` | … |`. */
const DECLARATION = /^\| `(2R-[A-Z]+-\d{3})` \|/gm;

/** The A13 detector's own family pattern, reproduced so pin 2 can be tested against it. */
const DETECTOR_FAMILY = /^- \*\*2S-[A-Z]+-\d{3}/m;

function declarations(): string[] {
  return [...read(PRD).matchAll(DECLARATION)].map((match) => match[1]);
}

function familyOf(id: string): string {
  return id.slice("2R-".length, id.lastIndexOf("-"));
}

function indexOf(id: string): number {
  return Number(id.slice(id.lastIndexOf("-") + 1));
}

/** Every requirement row, split into its cells, so per-row properties are checkable. */
function rows(): { id: string; cells: string[] }[] {
  return read(PRD)
    .split("\n")
    .filter((line) => /^\| `2R-[A-Z]+-\d{3}` \|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return { id: cells[0].replace(/`/g, ""), cells };
    });
}

const EXPECTED_FAMILIES = [
  "FOUNDATION",
  "MODEL",
  "TIME",
  "SERIES",
  "SURFACE",
  "NOTIFY",
  "TRUST",
  "ACCESS",
  "MOBILE",
  "CLOSE",
] as const;

describe("Phase 2R: the planning package is present and coherent", () => {
  it("ships exactly the seven documents ADR-131 authorizes", () => {
    for (const file of [
      PRD,
      PLAN,
      "docs/initiatives/phase-2r/PHASE_2R_THEME_OPTIONS.md",
      "docs/reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md",
      "docs/reports/phase-2r/PHASE_2R_GAPS_AND_OPPORTUNITIES.md",
      "docs/reports/phase-2r/PHASE_2R_THREAT_MODEL.md",
      "docs/reports/phase-2r/PHASE_2R_TRACEABILITY_CONTRACT.md",
    ]) {
      expect(existsSync(join(REPO, file)), `${file} is missing`).toBe(true);
    }
  });

  it("declares 73 requirements across ten families, with no duplicate and no gap", () => {
    const ids = declarations();
    expect(ids.length, "the declared count moved").toBe(73);
    expect(new Set(ids).size, "a requirement is declared twice").toBe(ids.length);

    const byFamily = new Map<string, number[]>();
    for (const id of ids) {
      const family = familyOf(id);
      byFamily.set(family, [...(byFamily.get(family) ?? []), indexOf(id)]);
    }
    expect([...byFamily.keys()].sort()).toEqual([...EXPECTED_FAMILIES].sort());

    for (const [family, indexes] of byFamily) {
      const sorted = [...indexes].sort((a, b) => a - b);
      expect(sorted[0], `${family} does not start at 001`).toBe(1);
      sorted.forEach((value, position) => {
        expect(value, `${family} is not sequential at position ${position}`).toBe(position + 1);
      });
    }
  });

  it("states the count it actually declares, in both directions", () => {
    // Pin 3. The prose said "fifty-two across nine families" while the tables
    // held 73 across ten. A sentence nobody re-derived is how a count drifts, so
    // the sentence is checked against the derived numbers rather than trusted.
    const prd = read(PRD);
    const ids = declarations();
    const families = new Set(ids.map(familyOf));
    expect(prd, "the PRD must state its own derived count").toContain("Seventy-three requirements");
    expect(prd).toContain("ten families");
    expect(ids.length).toBe(73);
    expect(families.size).toBe(10);
    expect(prd, "the corrected count must not have been left alongside the wrong one")
      .not.toContain("Fifty-two requirements");
    expect(read("docs/TODO.md"), "the backlog must carry the same count")
      .toContain("**73 requirements");
  });

  it("gives every requirement a slice and an observable criterion", () => {
    // `2R-CLOSE-004` and `2R-CLOSE-005`, asserted on the package that declares
    // them rather than deferred to a generator that does not exist yet.
    const plan = read(PLAN);
    for (const { id, cells } of rows()) {
      expect(cells.length, `${id}'s row is malformed`).toBeGreaterThanOrEqual(5);
      expect(cells[1].length, `${id} has no requirement text`).toBeGreaterThan(10);
      expect(cells[2].length, `${id} has no observable criterion`).toBeGreaterThan(10);
      expect(["build", "baseline", "rule"], `${id} has an unknown kind`).toContain(cells[3]);
    }
    // Every family is routed to a slice by the PRD's slice table and the plan.
    for (const family of EXPECTED_FAMILIES) {
      expect(plan, `the plan never mentions the ${family} family`).toContain(`2R-${family}-`);
    }
  });

  it("routes every family to one of the six slices", () => {
    const prd = read(PRD);
    for (const slice of ["2R.0", "2R.1", "2R.2", "2R.3", "2R.4", "2R.5"]) {
      expect(prd, `slice ${slice} is missing from the PRD`).toContain(slice);
      expect(read(PLAN), `slice ${slice} is missing from the plan`).toContain(`Slice ${slice}`);
    }
  });
});

describe("Phase 2R: no family name is invisible to the tooling", () => {
  it("declares only letter-only family names", () => {
    // Pin 2, positive half.
    for (const id of declarations()) {
      expect(familyOf(id), `${id}'s family name is not letters-only`).toMatch(/^[A-Z]+$/);
    }
    expect(declarations().some((id) => familyOf(id) === "ACCESS")).toBe(true);
    expect(
      declarations().some((id) => /\d/.test(familyOf(id))),
      "a digit-bearing family name returned",
    ).toBe(false);
  });

  it("proves a digit-bearing family really would be invisible to the detector", () => {
    // Pin 2, **negative half** — and it is the half that matters. Without it the
    // assertion above passes on an empty set, and this repository has already
    // recorded a check that could never fail.
    //
    // The detector's own pattern is reproduced here. `A11Y` contains digits, so
    // `2S-A11Y-001` matches nothing, which is exactly what happened to Phase
    // 2K's seven accessibility requirements.
    expect(DETECTOR_FAMILY.test("- **2S-ACCESS-001:** a real declaration."), "the control is inert")
      .toBe(true);
    expect(DETECTOR_FAMILY.test("- **2S-A11Y-001:** invisible."), "a digit-bearing family was seen")
      .toBe(false);

    // And the same property on this phase's own declaration shape.
    const shaped = (id: string) => new RegExp(`^\\| \`${id}\` \\|`).test(`| \`${id}\` | x | y | build | — |`);
    expect(shaped("2R-ACCESS-001")).toBe(true);
    expect([...("| `2R-A11Y-001` | x |").matchAll(DECLARATION)].length, "a digit family matched the declaration shape")
      .toBe(0);
  });
});

describe("Phase 2R: nothing is signed, and nothing is implemented", () => {
  it("keeps all nine owner decisions OPEN, including the theme", () => {
    // Pin 1 / `2R-CLOSE-008`. A recommendation is not a signature.
    const prd = read(PRD);
    for (let n = 1; n <= 9; n += 1) {
      expect(prd, `OD-2R-${n} is not declared`).toContain(`\`OD-2R-${n}\``);
    }
    expect(prd, "a decision is marked signed while no ADR signs one")
      .not.toMatch(/\*\*SIGNED/);
    expect(prd, "the decisions must be declared open").toMatch(/Every decision below is \*\*OPEN\*\*/);
    expect(prd, "the theme itself must be one of them").toMatch(/`OD-2R-1` — the theme itself/);
    expect(prd, "a recommendation must not be presented as a decision")
      .toMatch(/A recommendation is not a signature/);
  });

  it("keeps ADR-131 planning-only, and naming no successor", () => {
    const decisions = read("docs/DECISIONS.md");
    const at = decisions.indexOf("## ADR-131");
    expect(at, "ADR-131 is missing").toBeGreaterThan(-1);
    const next = decisions.indexOf("\n## ADR-", at + 1);
    const body = next < 0 ? decisions.slice(at) : decisions.slice(at, next);

    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "the authorization must be planning-only").toMatch(/authorizes \*\*planning only\*\*/);
    expect(body, "it must authorize no implementation").toMatch(/authorizes no implementation/i);
    expect(body, "the migration budget must be proposed rather than allocated")
      .toMatch(/the migration budget is PROPOSED, not signed/);
    expect(body, "a second migration must remain a stop condition")
      .toMatch(/second migration of any kind is a stop condition/);
    expect(body, "the refusal gate must be named").toMatch(/`2P-REMINDER-RECURRENCE`/);
    expect(body, "the waiver must not move").toMatch(/NOT EXECUTED — OWNER WAIVED|WAIVED/);
    expect(body, "an ADR in this series must not name the successor").not.toMatch(/2S/i);
  });

  it("holds the migration budget at PROPOSED, with no Phase 2R migration on disk", () => {
    expect(read(PRD), "the budget must not read as allocated")
      .toMatch(/No migration is allocated by this document/);
    const migrations = readdirSync(join(REPO, "supabase/migrations"));
    expect(migrations.filter((name) => /phase[_-]?2r/i.test(name)), "a Phase 2R migration exists")
      .toEqual([]);
    expect(migrations.length, "the migration count moved during a planning-only phase").toBe(100);
  });

  it("carries none of the artifacts that only exist after implementation", () => {
    // Inverted, slice by slice, as each legitimately appears — never deleted.
    for (const forbidden of [
      "docs/reports/phase-2r/PHASE_2R_TRACEABILITY_MATRIX.md",
      "docs/reports/phase-2r/PHASE_2R_CLOSING_REPORT.md",
      "docs/reports/phase-2r/PHASE_2R_SLICE_00_ACCEPTANCE.md",
      "docs/reports/phase-2r/PHASE_2R_SLICE_01_DEPLOYMENT.md",
      "scripts/generate-phase-2r-traceability.mjs",
    ]) {
      expect(existsSync(join(REPO, forbidden)), `${forbidden} exists before implementation`).toBe(false);
    }
  });

  it("classifies no requirement while the phase is unimplemented", () => {
    const prd = read(PRD);
    expect(prd, "the PRD must say classification has not happened")
      .toMatch(/No requirement below carries a delivery class/);
    expect(prd, "a delivery classification appeared during planning")
      .not.toMatch(/\*\*Class:\*\* (built|baseline|partial|not-built-by-rule|undelivered)/);
  });
});

describe("Phase 2R: the inherited record is carried, not absorbed", () => {
  it("keeps every inherited remainder named with a destination", () => {
    const audit = read("docs/reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md");
    for (const item of [
      "2P-ACCESS-005",
      "2P-ATTENTION-008",
      "RG-DEP-3",
      "2P-CHAT-007-JOURNEY",
      "2P-REMINDER-RECURRENCE",
      "2P-CALENDAR-MONTH-TELEMETRY",
      "2P-MOBILE-002",
      "2N-RELATION-TRIGGER",
      "ADR-055",
    ]) {
      expect(audit, `${item} is not carried in the audit`).toContain(item);
    }
  });

  it("keeps VoiceOver recorded as waived and never as passing", () => {
    const audit = read("docs/reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md");
    expect(audit).toContain("NOT EXECUTED — OWNER WAIVED");
    expect(audit, "the waiver must never be described as a pass")
      .not.toMatch(/VoiceOver (passed|approved|tested and passing)/i);
    expect(read(PRD), "no screen-reader claim may be made")
      .toMatch(/No screen-reader claim is made anywhere/);
  });

  it("keeps RG-DEP-3 uncloseable by a document, and the restore unexecuted", () => {
    const audit = read("docs/reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md");
    expect(audit).toMatch(/cannot be closed by writing a file/);
    expect(audit, "no restore may be claimed").toMatch(/No restore/);
  });

  it("records the automation correction with its attribution and its real safety mechanism", () => {
    // The finding is only useful if it says *who* and *why it is safe*. A record
    // that said "two categories are wrong" without either would invite both a
    // false attribution and a false repair.
    const audit = read("docs/reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md");
    expect(audit).toContain("automatic_when_eligible");
    expect(audit, "the attribution must be explicit").toMatch(/the owner's own action/i);
    expect(audit, "the real safety mechanism must be named")
      .toMatch(/There is no automatic writer/);
    const decisions = read("docs/DECISIONS.md");
    expect(decisions, "the correction must forbid altering the rows to fit the record")
      .toMatch(/Nothing is changed to make the sentence true/);
  });
});

describe("Phase 2R: the successor of this phase is not started", () => {
  it("retargets every one of the five pins off Phase 2R", () => {
    // ADR-131 Decision 9. `STATE.md` and ADR-130 both said the letter lived
    // "only inside the A13 detector"; there are five, and three are findable
    // only by running the suite. Each is asserted so a future retarget that
    // misses one fails here rather than at the next authorization.
    const detector = read("src/lib/closeout/phase-2f-documentation.test.ts");
    expect(detector).toMatch(/const GOVERNING_ARTIFACT_ROLE = \/\^PHASE_2S_/);
    expect(detector).toMatch(/const DECLARED_SUCCESSOR_REQUIREMENT = \/\^- \\\*\\\*2S-/);
    expect(detector).toMatch(/const IMPLEMENTATION_MARKED_FILE = \/phase\[_-\]\?2s\/i;/);

    const twoO = read("src/lib/closeout/phase-2o-declarations.test.ts");
    expect(twoO, "the 2O pin did not move").toContain("PHASE_2S_");
    expect(twoO, "the 2O pin still names the authorized phase").not.toContain("PHASE_2R_");

    expect(read("scripts/generate-phase-2p-traceability.mjs"))
      .toContain("docs/initiatives/phase-2s");
    expect(read("scripts/generate-phase-2q-traceability.mjs"))
      .toMatch(/2S-\[A-Z\]\+-\\d\{3\}/);

    const twoQ = read("src/lib/closeout/phase-2q-declarations.test.ts");
    expect(twoQ, "the ADR-block helper must bound the slice").toContain("function adrBlock");
    expect(twoQ, "an unbounded ADR slice returned").not.toMatch(/const body = decisions\.slice\(at\);/);
  });

  it("finds no artifact for the phase after this one", () => {
    expect(existsSync(join(REPO, "docs/initiatives/phase-2s"))).toBe(false);
    expect(existsSync(join(REPO, "docs/reports/phase-2s"))).toBe(false);
    expect(read(PRD), "the successor must be declared unstarted")
      .toMatch(/The phase after\s+this one is not started/);
  });
});
