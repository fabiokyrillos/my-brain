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
