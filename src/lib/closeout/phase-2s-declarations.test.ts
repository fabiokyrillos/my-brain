/**
 * **Phase 2S's planning package holds itself to its own contract.**
 *
 * This guard exists because every one of its assertions is a rule this
 * repository has already paid for, in a phase where the rule was written in
 * prose and nothing read it:
 *
 * 1. **The count is derived, never typed.** Phase 2R's PRD said *"fifty-two
 *    across nine families"* while its tables held 73 across ten, and the
 *    sentence was caught by counting rows rather than by reading it. The prose
 *    is therefore asserted **against the derived count**, in both directions.
 * 2. **No family name may contain a digit.** `2K-A11Y` did, which made seven
 *    accessibility requirements invisible to every prose count, to the
 *    traceability generator's attribution check *and* to the A13 detector's
 *    `[A-Z]+` family pattern. The control is **two-sided**: the positive half
 *    checks the ten declared families, the negative half proves a digit-bearing
 *    family really would be invisible — because a positive check alone passes on
 *    an empty set.
 * 3. **Proposed is not allocated, and allocated is not created.** Three words,
 *    three different facts. Phase 2S's budget is **1 proposed · 0 allocated · 0
 *    created**, and all three are asserted separately so a later package cannot
 *    slide from one to the next without a signature.
 * 4. **A recommendation is not a signature.** Ten decisions are declared OPEN,
 *    and no accepted ADR names any of them as signed. Asserted rather than
 *    remembered, because the whole package is written *for* the
 *    recommendations, which is exactly when the distinction is easiest to lose.
 * 5. **`baseline` may never be recorded as `built`.** Phase 2R's contract said
 *    so from planning and five requirements were misfiled anyway, from its first
 *    slice to its last. Here the rule is asserted to exist as a **refusal** in
 *    the contract rather than as a sentence.
 * 6. **Planning contains no classification, no acceptance record and no
 *    execution matrix.** Those are slice artifacts, and a package that produced
 *    them would be grading its own homework before doing it.
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
  "ATTENTION",
  "TRUST",
  "ACCESS",
  "MOBILE",
  "CLOSE",
] as const;

const EXPECTED_DECISIONS = Array.from({ length: 10 }, (_, index) => `OD-2S-${index + 1}`);

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

const familyOf = (id: string) => id.slice("2S-".length, id.lastIndexOf("-"));
const indexOf = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));

describe("Phase 2S: the package exists and is the pair the ADR names", () => {
  it("ships the governing pair and the five evidence documents", () => {
    for (const path of [PRD, PLAN, THEMES, AUDIT, GAPS, THREATS, CONTRACT, COVERAGE]) {
      expect(existsSync(join(REPO, path)), `${path} is missing`).toBe(true);
    }
  });

  it("is authorized by an accepted ADR that authorizes planning only", () => {
    const decisions = read("docs/DECISIONS.md");
    const at = decisions.indexOf("## ADR-136");
    expect(at, "ADR-136 is missing").toBeGreaterThan(-1);
    const next = decisions.indexOf("\n## ADR-", at + 1);
    const body = next < 0 ? decisions.slice(at) : decisions.slice(at, next);

    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "the authorization must be planning-only")
      .toMatch(/authorizes \*\*planning only\*\*/);
    expect(body, "it must authorize no implementation")
      .toMatch(/authorizes no implementation/i);
    expect(body, "the budget must be proposed rather than allocated")
      .toMatch(/the migration budget is PROPOSED, not signed/);
    expect(body, "a second migration must be a stop condition")
      .toMatch(/second migration of any kind is a stop condition/);
    expect(body, "the waiver must not move").toMatch(/NOT EXECUTED — OWNER WAIVED/);
    expect(body, "an ADR in this series must not name the successor").not.toMatch(/2T/i);
  });

  it("keeps ADR-135 intact rather than rewritten into agreement with ADR-136", () => {
    // The rule since ADR-108: an accepted ADR is never edited to agree with a
    // later one. ADR-136 opens what ADR-135 closed; it does not revise it.
    const decisions = read("docs/DECISIONS.md");
    const at = decisions.indexOf("## ADR-135");
    const next = decisions.indexOf("\n## ADR-", at + 1);
    const body = decisions.slice(at, next);
    expect(body, "ADR-135 must still close Phase 2R").toMatch(/Phase 2R is CLOSED/);
    expect(body, "ADR-135 must still authorize no successor")
      .toMatch(/This ADR authorizes no successor/);
  });
});

describe("Phase 2S: the requirements are declared, sequential and countable", () => {
  it("declares 74 requirements, each exactly once", () => {
    const ids = declarations();
    expect(ids.length).toBe(74);
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

  it("declares exactly the ten families the coverage report names", () => {
    const families = [...new Set(declarations().map(familyOf))];
    expect(families.sort()).toEqual([...EXPECTED_FAMILIES].sort());
  });

  it("proves a digit-bearing family really would be invisible to the detector", () => {
    // The negative half, and the one that matters. Without it the assertion
    // above passes on an empty set, and this repository has already recorded a
    // check that could never fail.
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
    // The Phase 2R defect, made uncatchable-by-reading. The prose must agree
    // with the tables, and the tables are the authority.
    const ids = declarations();
    const families = new Set(ids.map(familyOf));
    const kinds = rows().reduce<Record<string, number>>((counts, { cells }) => {
      counts[cells[3]] = (counts[cells[3]] ?? 0) + 1;
      return counts;
    }, {});

    expect(ids.length).toBe(74);
    expect(families.size).toBe(10);
    expect(kinds.build).toBe(52);
    expect(kinds.baseline).toBe(16);
    expect(kinds.rule).toBe(6);
    expect(kinds.build + kinds.baseline + kinds.rule).toBe(ids.length);

    const prd = read(PRD);
    expect(prd, "the PRD's prose count must match its tables")
      .toContain(`**${"Seventy-four"} requirements across ten families.**`);
    const coverage = read(COVERAGE);
    expect(coverage).toContain("| declared requirements | **74** |");
    expect(coverage).toContain("| `build` | **52** |");
    expect(coverage).toContain("| `baseline` | **16** |");
    expect(coverage).toContain("| `rule` | **6** |");
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

describe("Phase 2S: ten decisions are OPEN, and none is signed", () => {
  it("declares all ten in the PRD, each with options, a recommendation and a consequence", () => {
    const prd = read(PRD);
    for (const decision of EXPECTED_DECISIONS) {
      expect(prd, `${decision} is not declared`).toContain(`### \`${decision}\``);
    }
    expect(prd, "the recommendations must be marked as recommendations")
      .toMatch(/\*\*A recommendation is not a signature\.\*\*/);
    const recommendations = [...prd.matchAll(/\*\*Recommendation: /g)].length;
    expect(recommendations, "every decision needs a recommendation").toBeGreaterThanOrEqual(10);
  });

  it("has no accepted ADR naming any of them as signed", () => {
    // The property that keeps a package written *for* its recommendations from
    // reading as a package whose recommendations were accepted.
    const decisions = read("docs/DECISIONS.md");
    for (const decision of EXPECTED_DECISIONS) {
      expect(
        new RegExp(`\`${decision}\`[^\\n]*\\bsigned\\b`, "i").test(decisions),
        `${decision} is described as signed`,
      ).toBe(false);
    }
  });

  it("keeps the plan blocked on the signatures and on a separate authorization", () => {
    const plan = read(PLAN);
    expect(plan).toMatch(/Sign the ten open decisions/);
    expect(plan).toMatch(/Record an implementation authorization ADR/);
    expect(plan, "the three distinctions must all be stated")
      .toMatch(/Proposed is not allocated, allocated is not created, and signed is not\s+authorized/);
  });
});

describe("Phase 2S: proposed is not allocated, and allocated is not created", () => {
  it("states the budget as proposed everywhere it states it", () => {
    expect(read(PRD)).toContain("**Budget: 1 proposed · 0 allocated · 0 spent · 0 created.**");
    expect(read(CONTRACT)).toContain("**1 proposed · 0 allocated · 0 spent · 0 created.**");
    expect(read(COVERAGE)).toContain("**1 proposed · 0 allocated · 0 spent · 0 created.**");
  });

  it("creates no migration file, and parity is unchanged", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((name) =>
      name.endsWith(".sql"),
    );
    expect(migrations.length, "this package must create no migration").toBe(101);
    expect(migrations.some((name) => /phase[_-]?2s/i.test(name)), "a Phase 2S migration exists")
      .toBe(false);
    expect(read(PRD)).toContain("parity `202608230101`");
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

  it("ships no acceptance record, no traceability matrix and no generator", () => {
    for (const name of readdirSync(join(REPO, REPORTS))) {
      expect(/ACCEPTANCE/i.test(name), `${name} is a slice artifact`).toBe(false);
      expect(/TRACEABILITY_MATRIX/i.test(name), `${name} is a closeout artifact`).toBe(false);
    }
    expect(existsSync(join(REPO, "scripts/generate-phase-2s-traceability.mjs")), "the generator is a 2S.4 artifact")
      .toBe(false);
  });

  it("declares every threat OPEN", () => {
    const threats = read(THREATS);
    const dispositions = [...threats.matchAll(/\*\*Disposition: ([^*]+)\*\*/g)].map((m) => m[1].trim());
    expect(dispositions.length, "the threat model declares no dispositions").toBe(14);
    for (const disposition of dispositions) {
      expect(disposition, "a threat is disposed before anything is built").toMatch(/^OPEN/);
    }
    expect(threats).toContain("**Fourteen threats, all OPEN — planned.");
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

  it("refuses a claim that push works, while permitting a refusal of it", () => {
    // A guard that forbids the word instead of the assertion is a gag, not a
    // guard: the record most needs the sentence "push is still not working".
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
