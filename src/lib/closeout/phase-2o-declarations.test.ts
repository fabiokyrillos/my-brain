/**
 * Phase 2O's declaration and planning-only guard.
 *
 * The phase is authorized for **planning only** by ADR-115, and **no owner
 * decision is signed**. Those two facts are what this file protects, in both
 * directions:
 *
 * - the declared requirement set is coherent, counted correctly wherever it is
 *   quoted, and shaped so the traceability generator and the phase-start
 *   detector can both see it;
 * - and nothing that would only exist *after* implementation exists yet.
 *
 * ## Why the absences are asserted rather than trusted
 *
 * Phase 2M's equivalent guard forbade its matrix and closing report from
 * existing while the phase was mid-flight, and Phase 2N's had to be **inverted**
 * at closeout rather than deleted. The same shape is used here deliberately: an
 * absence that nobody asserts is an absence nobody notices disappearing, and a
 * planning package that quietly grows an acceptance record has started
 * implementing under an authorization that forbids it.
 *
 * ## The trap this guard is built around
 *
 * An assertion over an empty set passes trivially. Every extraction below is
 * therefore proved non-vacuous — the count is asserted to be the number the PRD
 * really declares, and each extractor is exercised against a fixture that must
 * produce a different answer. A corpus scan that silently starts matching
 * nothing is indistinguishable from a corpus scan that is correct.
 *
 * ## The one this phase adds
 *
 * Phase 2O is the first phase authorized while **every** decision is open. The
 * failure mode that creates is a package that reads its own recommendation as
 * an outcome. `R-2O-5` is asserted here directly: each decision carries options
 * and a recommendation, and the word that would mark it settled is absent.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const exists = (relative: string) => existsSync(join(REPO, relative));

/**
 * The same document with every run of whitespace collapsed to one space.
 *
 * Used for assertions about **prose**, and for those only. These documents are
 * hard-wrapped at 80 columns, so a sentence's line break falls wherever the wrap
 * lands — `**Implementation is NOT\nauthorized.**` and
 * `**Implementation is NOT authorized.**` are the same claim, and a guard that
 * distinguishes them is testing the wrap rather than the statement. Three
 * assertions in this file failed that way on first run, and re-wrapping the
 * documents to satisfy a regex would have been fixing the wrong artifact.
 *
 * Blockquote markers are stripped for the same reason and it is the same
 * defect one step further in: a claim inside a `>` block wraps as
 * `Nothing in the\n> product ever writes …`, so collapsing whitespace alone
 * leaves a stray `>` in the middle of the sentence. That cost a second run to
 * find, which is exactly the argument for normalising once, here, rather than
 * per assertion.
 *
 * This is not a relaxation: a claim that is absent is still absent after
 * normalising, and every assertion below keeps its non-vacuity control.
 * Assertions about **structure** — declaration shape, table rows, file names —
 * deliberately keep reading the raw text, because there a line break is
 * meaningful.
 */
const flat = (relative: string) =>
  read(relative).replace(/^\s*>\s?/gm, "").replace(/\s+/g, " ");

const PRD = "docs/initiatives/phase-2o/PHASE_2O_PRD.md";
const PLAN = "docs/initiatives/phase-2o/PHASE_2O_IMPLEMENTATION_PLAN.md";
const AUDIT = "docs/reports/phase-2o/PHASE_2O_CURRENT_EXPERIENCE_AUDIT.md";
const GAPS = "docs/reports/phase-2o/PHASE_2O_UX_GAPS_AND_OPPORTUNITIES.md";
const THREATS = "docs/reports/phase-2o/PHASE_2O_THREAT_MODEL.md";
const CONTRACT = "docs/reports/phase-2o/PHASE_2O_TRACEABILITY_CONTRACT.md";

/**
 * A *declared* requirement, in this repository's declaration shape — the same
 * shape the phase-start detector and the traceability generator both use. A
 * mention in prose is deliberately not a declaration.
 */
const DECLARATION = /^- \*\*(2O-[A-Z]+-\d{3}):\*\*/gm;

/** A family name may carry no digit; `2K-A11Y` is why this is asserted. */
const EXPRESSIBLE_FAMILY = /^[A-Z]+$/;

function declaredIds(source: string): string[] {
  return [...source.matchAll(DECLARATION)].map((match) => match[1]);
}

const ids = declaredIds(read(PRD));
const TOTAL = 113;

/**
 * The migration count on the day Phase 2O planning was authorized.
 *
 * Phase 2O may add **at most two** on top of this, one per allocation, and only
 * after implementation is authorized. The baseline is a constant rather than a
 * re-read of the directory precisely so that a spend has to be *attributable*:
 * total minus this must equal the number of files naming the phase, or
 * something arrived that nobody allocated.
 */
const MIGRATIONS_BEFORE_PHASE_2O = 94;

const FAMILY_COUNTS: Readonly<Record<string, number>> = {
  ACTIVATION: 7,
  ENTRY: 8,
  ONBOARD: 11,
  PREF: 12,
  AICONFIG: 9,
  COST: 7,
  PRIVACY: 10,
  CONSENT: 5,
  NOTIFY: 7,
  RECOVER: 7,
  MOBILE: 5,
  ACCESS: 6,
  READY: 5,
  METRICS: 5,
  SEC: 5,
  CLOSE: 4,
};

/** The twelve open decisions, by identifier. None is signed. */
const OPEN_DECISIONS = Array.from({ length: 12 }, (_unused, index) => `OD-2O-${index + 1}`);

describe("Phase 2O declarations: the requirement set is coherent", () => {
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
      // `2K-A11Y` matched neither the detector nor the generator, and seven
      // accessibility requirements went uncounted for a whole phase. Asserted
      // rather than remembered.
      expect(family, `${family} contains a digit and would be invisible`).toMatch(EXPRESSIBLE_FAMILY);
    }
    expect(families.sort()).toEqual(Object.keys(FAMILY_COUNTS).sort());
  });

  it("carries per-family counts that sum to the declared total", () => {
    for (const [family, expected] of Object.entries(FAMILY_COUNTS)) {
      const actual = ids.filter((id) => id.startsWith(`2O-${family}-`)).length;
      expect(actual, `${family} declares ${actual}, not ${expected}`).toBe(expected);
    }
    expect(Object.values(FAMILY_COUNTS).reduce((sum, count) => sum + count, 0)).toBe(TOTAL);
  });

  it("numbers each family from 001 with no gap", () => {
    for (const family of Object.keys(FAMILY_COUNTS)) {
      const numbers = ids
        .filter((id) => id.startsWith(`2O-${family}-`))
        .map((id) => Number(id.slice(-3)))
        .sort((left, right) => left - right);
      expect(numbers, `${family} is not numbered from 001 without a gap`)
        .toEqual(numbers.map((_unused, index) => index + 1));
    }
  });

  it("carries a family table whose rows match the body it describes", () => {
    // The table is the thing a reader trusts and the body is the thing a
    // generator reads. They are extracted separately and compared, because a
    // table that agrees with itself proves nothing.
    const rows = [...read(PRD).matchAll(/^\| `2O-([A-Z]+)` \| (\d+) \|/gm)]
      .map(([, family, count]) => [family, Number(count)] as const);
    expect(rows).toHaveLength(16);
    for (const [family, count] of rows) {
      expect(count, `the table's ${family} row disagrees with the body`).toBe(FAMILY_COUNTS[family]);
    }
  });

  it("proves the extraction itself is not returning zero", () => {
    // Every assertion above would pass against an empty array if the shape ever
    // changed. This is the control.
    expect(ids.length).toBeGreaterThan(0);
    expect(declaredIds("- **2O-ONBOARD-001:** a fixture.\n")).toEqual(["2O-ONBOARD-001"]);
    expect(declaredIds("- 2O-ONBOARD-001: a mention, not a declaration.\n")).toEqual([]);
    expect(declaredIds("- **2N-PERSON-001:** another phase's declaration.\n")).toEqual([]);
  });
});

describe("Phase 2O declarations: the count does not drift where it is quoted", () => {
  for (const document of [PRD, PLAN]) {
    it(`${document} states ${TOTAL} wherever it states this phase's count`, () => {
      const source = read(document);
      const claims = [...source.matchAll(/\*\*(\d+) requirements/g)].map((match) => Number(match[1]));
      expect(claims.length, `${document} states no count`).toBeGreaterThan(0);
      for (const claim of claims) expect(claim).toBe(TOTAL);
    });
  }

  it("fires on a stale count, and ignores another phase's", () => {
    const stale = "**127 requirements across sixteen families**";
    expect([...stale.matchAll(/\*\*(\d+) requirements/g)].map((match) => Number(match[1]))).toEqual([127]);
  });
});

describe("Phase 2O governance: the authorization is planning-only and says so", () => {
  const adrBody = (): string => {
    const decisions = read("docs/DECISIONS.md");
    const start = decisions.indexOf("## ADR-115");
    expect(start, "ADR-115 is not recorded").toBeGreaterThan(0);
    const next = decisions.indexOf("\n## ADR-", start + 1);
    return decisions.slice(start, next === -1 ? undefined : next);
  };

  it("records ADR-115 as an accepted, planning-only owner decision", () => {
    const body = adrBody();
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body).toMatch(/planning only/i);
    expect(body, "ADR-115 must refuse implementation explicitly")
      .toMatch(/no implementation/i);
    expect(body, "ADR-115 must refuse a migration explicitly").toMatch(/no migration/i);
    expect(body, "ADR-115 must refuse opening signup explicitly").toMatch(/no opening of signup/i);
  });

  it("keeps the governing pair present and the evidence beside it", () => {
    for (const document of [PRD, PLAN, AUDIT, GAPS, THREATS, CONTRACT]) {
      expect(exists(document), `${document} is missing`).toBe(true);
    }
  });

  it("states in the PRD and the plan that implementation is NOT authorized", () => {
    for (const document of [PRD, PLAN]) {
      expect(flat(document), `${document} does not refuse implementation`)
        .toMatch(/\*\*Implementation is NOT authorized\.?\*\*|\*\*No slice below is authorized/i);
      expect(read(document)).toMatch(/ADR-115/);
    }
    // Non-vacuous: the pattern is not one that any prose would satisfy.
    expect("planning only, and busy").not.toMatch(/\*\*Implementation is NOT authorized/i);
  });

  it("keeps ADR-108 through ADR-114 intact rather than rewritten", () => {
    // An accepted ADR is not edited into agreement with a later one. Each of
    // these recorded what was true when it was signed, and ADR-115 does not
    // move any of them.
    const decisions = read("docs/DECISIONS.md");
    for (const [adr, phrase] of [
      ["ADR-108", /ADR-108 — The owner authorizes Phase 2N/],
      ["ADR-112", /ADR-112 — The owner authorizes Phase 2N implementation through closeout/],
      ["ADR-114", /ADR-114 — The owner authorizes the Papel e Console redesign/],
    ] as const) {
      expect(decisions, `${adr} was rewritten or removed`).toMatch(phrase);
    }
  });

  it("keeps the successor unnamed by the authorizing heading", () => {
    // Asserted here as well as in A13, because this is the guard a Phase 2O
    // author reads. A heading that named the successor would start the next
    // phase in the act of authorizing this one.
    const heading = read("docs/DECISIONS.md")
      .split("\n")
      .find((line) => line.startsWith("## ADR-115")) ?? "";
    expect(heading).not.toBe("");
    expect(heading).toMatch(/roadmap successor/);
    expect(heading).not.toMatch(/2P/i);
  });
});

describe("Phase 2O decisions: twelve are open, and none is signed", () => {
  it("declares all twelve, each with options and a recommendation", () => {
    const prd = read(PRD);
    for (const decision of OPEN_DECISIONS) {
      expect(prd, `${decision} is not declared`).toContain(`**${decision} —`);
    }
    // `OD-2O-9` states a budget rather than lettered options, and `OD-2O-11` is
    // a table of residuals; the other ten carry an explicit recommendation
    // marker. Counted rather than assumed, so a decision that quietly loses its
    // recommendation fails.
    const recommended = [...prd.matchAll(/\(recommended\)/g)].length;
    expect(recommended, "a decision lost its recommendation").toBeGreaterThanOrEqual(9);
    expect(prd).toMatch(/\*\*OD-2O-9 — the migration budget\.\*\*/);
    expect(prd).toMatch(/\*\*Recommended: 2 allocated/);
  });

  it("keeps the declined options visible rather than deleted", () => {
    // A decision whose alternatives have been removed is a decision nobody can
    // review. Every lettered decision keeps at least a B.
    const prd = read(PRD);
    expect([...prd.matchAll(/\*\*B\*\*/g)].length).toBeGreaterThanOrEqual(9);
    expect([...prd.matchAll(/\*\*C\*\*/g)].length).toBeGreaterThanOrEqual(7);
  });

  it("never describes an open decision as signed", () => {
    // `R-2O-5`. The failure this phase is uniquely exposed to: reading a
    // recommendation as an outcome. The words that would mark a signature are
    // asserted absent from every document in the package.
    for (const document of [PRD, PLAN, AUDIT, GAPS, THREATS, CONTRACT]) {
      const source = read(document);
      for (const forbidden of [/OD-2O-\d+ is signed/i, /signed as [ABC]\b/i, /the owner signed/i]) {
        expect(source, `${document} claims a signature`).not.toMatch(forbidden);
      }
    }
    // Non-vacuous: the pattern really does match the shape it forbids.
    expect("OD-2O-4 is signed A").toMatch(/OD-2O-\d+ is signed/i);
  });

  it("says plainly that no decision is signed", () => {
    expect(read(PRD)).toMatch(/None is signed/);
    expect(read(CONTRACT)).toMatch(/none is signed/i);
  });
});

describe("Phase 2O budget: nothing is spent and nothing may be created", () => {
  it("states two allocated, obligation zero, and no spend", () => {
    for (const document of [PRD, PLAN]) {
      const source = flat(document);
      expect(source, `${document} does not state the ceiling`).toMatch(/2 allocated/);
      expect(source, `${document} does not state obligation zero`).toMatch(/obligation ZERO/i);
      expect(source, `${document} does not make a third a stop condition`)
        .toMatch(/third is a STOP CONDITION/i);
      expect(source, `${document} does not fix the allocations as non-transferable`)
        .toMatch(/NON-TRANSFERABLE/i);
    }
  });

  it("has created no migration, and the tree agrees", () => {
    const migrations = readdirSync(join(REPO, "supabase", "migrations"))
      .filter((name) => name.endsWith(".sql"));
    expect(migrations).toHaveLength(MIGRATIONS_BEFORE_PHASE_2O);
    const attributable = migrations.filter((name) => /phase[_-]?2o/i.test(name));
    expect(attributable, "a migration is attributable to Phase 2O during planning").toEqual([]);
    // Non-vacuous: the filter really filters.
    expect(["202610010001_phase_2o_activation.sql"].filter((name) => /phase[_-]?2o/i.test(name)))
      .toHaveLength(1);
  });

  it("gives every proposed allocation an exclusive, conditional destination", () => {
    const plan = flat(PLAN);
    expect(plan).toMatch(/\*\*M1\*\*/);
    expect(plan).toMatch(/\*\*M2\*\*/);
    expect(plan, "M1 must be conditional on a real producer and a real consumer")
      .toMatch(/real producer \*\*and\*\* a real consumer/);
    expect(plan, "M2 must be exactly one of the three signable options")
      .toMatch(/\*\*exactly one\*\* of/);
    expect(plan, "an allocation must be able to close unspent")
      .toMatch(/may close unspent/);
    expect(plan, "an unnecessary spend must be recorded as a defect")
      .toMatch(/unnecessary spend is a defect/);
  });

  it("refuses to pay for another phase's remainders out of either allocation", () => {
    expect(flat(PLAN)).toMatch(/none of the Phase 2N remainders/i);
  });
});

describe("Phase 2O: the closing artifacts do not exist yet", () => {
  it("carries no acceptance record, matrix, closing report or deployment record", () => {
    /*
     * **This assertion inverts at closeout, and must be kept rather than
     * deleted then.** Under planning, any of these is proof that work started
     * under an authorization that forbade it. At closeout their *absence* is
     * what would be wrong. A deleted assertion records nothing, and the next
     * reader cannot tell a gate that was satisfied from a gate that was removed.
     */
    const directory = join(REPO, "docs", "reports", "phase-2o");
    const reports = existsSync(directory) ? readdirSync(directory) : [];
    for (const forbidden of [/ACCEPTANCE/i, /TRACEABILITY_MATRIX/i, /CLOSING_REPORT/i, /DEPLOYMENT/i]) {
      const offenders = reports.filter((name) => forbidden.test(name));
      expect(offenders, `a closing artifact exists during planning: ${offenders.join(", ")}`).toEqual([]);
    }
    // Non-vacuous: the directory really has the planning evidence in it, and the
    // filter really matches the shape it forbids.
    expect(reports.length).toBeGreaterThanOrEqual(4);
    expect(["PHASE_2O_SLICE_00_ACCEPTANCE.md"].filter((name) => /ACCEPTANCE/i.test(name))).toHaveLength(1);
  });

  it("declares no requirement outside the PRD", () => {
    // `R-2O-1`. A requirement declared in a report is a requirement no matrix
    // will ever classify.
    for (const document of [AUDIT, GAPS, THREATS, CONTRACT, PLAN]) {
      expect(declaredIds(read(document)), `${document} declares a requirement`).toEqual([]);
    }
  });
});

describe("Phase 2O: A13 has moved off this phase, in this same commit", () => {
  it("no longer treats Phase 2O's own artifacts as a start signal", () => {
    // The retarget is what makes this package legal. If A13 still targeted 2O,
    // the PRD and the plan above would each be signal 1 and every declared
    // requirement signal 2 — so this assertion and the package are the same
    // change by construction.
    const guard = read("src/lib/closeout/phase-2f-documentation.test.ts");
    expect(guard).toMatch(/const GOVERNING_ARTIFACT_ROLE = \/\^PHASE_2P_/);
    expect(guard).toMatch(/const DECLARED_SUCCESSOR_REQUIREMENT = \/\^- \\\*\\\*2P-/);
    expect(guard).toMatch(/const IMPLEMENTATION_MARKED_FILE = \/phase\[_-\]\?2p\/i;/);
  });

  it("records Phase 2O's start as an authorization rather than an accident", () => {
    const guard = read("src/lib/closeout/phase-2f-documentation.test.ts");
    expect(guard).toMatch(/keeps Phase 2O's start recorded as an authorization/);
    expect(guard).toMatch(/ADR-115 — The owner authorizes Phase 2O/);
  });

  it("keeps the whole authorizing series held to the same heading rule", () => {
    const guard = read("src/lib/closeout/phase-2f-documentation.test.ts");
    for (const adr of ["ADR-092", "ADR-094", "ADR-097", "ADR-102", "ADR-104", "ADR-108", "ADR-115"]) {
      expect(guard, `${adr} dropped out of the heading series`).toContain(`"${adr}"`);
    }
  });
});

describe("Phase 2O: the inherited truths are not reclassified", () => {
  it("restates push and Android exactly as inherited", () => {
    for (const document of [PRD, AUDIT, THREATS]) {
      const source = flat(document);
      expect(source, `${document} softens the push failure`).toMatch(/403/);
      expect(source, `${document} does not say Android was never executed`)
        .toMatch(/never (been )?(executed|run) on Android|never executed on Android|Android/i);
    }
  });

  it("keeps the screen-reader run unclaimed until it is executed", () => {
    expect(flat(AUDIT)).toMatch(/No screen-reader session has ever been executed/i);
    expect(flat(PRD), "the PRD must require the run rather than claim it")
      .toMatch(/A real screen-reader session is executed/);
  });

  it("restates ADR-055 as neither satisfied nor superseded, with its expiry", () => {
    expect(flat(CONTRACT)).toMatch(/ADR-055 neither satisfied nor superseded, expiring \*\*2026-10-27\*\*/);
  });

  it("keeps the rollout gate and signup untouched and unclaimed", () => {
    for (const document of [PRD, PLAN, AUDIT, CONTRACT]) {
      expect(flat(document), `${document} does not restate the gate`)
        .toMatch(/25\s*(pass\s*)?[·]\s*3/);
    }
    expect(flat(PRD)).toMatch(/does not open signup/i);
  });

  it("names each Phase 2N remainder and absorbs none", () => {
    const prd = flat(PRD);
    for (const remainder of [
      "2N-RELATION-TRIGGER",
      "2N-IDENTITY-EXTRACTION",
      "2N-FILES-WRITER",
      "2N-MOBILE",
      "2N-PRIVACY-FREETEXT",
      "2N-RELATION-END-ANNOUNCEMENT",
    ]) {
      expect(prd, `${remainder} is not named`).toContain(remainder);
    }
    expect(prd, "the residuals must not be absorbed by default")
      .toMatch(/None is absorbed by default/);
  });
});

describe("Phase 2O: the audit's own claims stay falsifiable", () => {
  it("keeps the divergence between ADR-114's decision and the tree recorded", () => {
    // The one finding in this package that is a *contradiction* rather than an
    // unbuilt roadmap item. If a theme control ever ships, this assertion is
    // what forces the audit and the ADR to be reconciled rather than left.
    const setsTheme = readdirSync(join(REPO, "src", "features"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .some((entry) => {
        const directory = join(REPO, "src", "features", entry.name);
        return readdirSync(directory)
          .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
          .some((name) => readFileSync(join(directory, name), "utf8").includes("data-theme"));
      });
    expect(setsTheme, "a theme control now exists — reconcile the audit and OD-2O-2").toBe(false);
    expect(flat(AUDIT)).toMatch(/Nothing in the product ever writes `data-theme`/);
  });

  it("keeps the three consumed review preferences named as consumed and uncontrolled", () => {
    // Non-vacuous in the direction that matters: the consumer really is there,
    // so an audit that stopped being true would fail here rather than in prose.
    const schedule = read("src/features/day-review/review-schedule.ts");
    for (const column of ["dailyReviewTime", "weeklyReviewTime", "weeklyReviewDay"]) {
      expect(schedule, `${column} is no longer read`).toContain(column);
    }
    const form = read("src/features/profile/settings-form.tsx");
    for (const column of ["dailyReviewTime", "weeklyReviewTime", "weeklyReviewDay"]) {
      expect(form, `${column} now has a control — reconcile the audit and OD-2O-6`).not.toContain(column);
    }
  });

  it("keeps `planning_day` and `planning_time` retired, as `2M-AUDIT-005` decided", () => {
    expect(read(PRD)).toMatch(/`planning_day` and `planning_time` gain \*\*no\*\* control/);
    const form = read("src/features/profile/settings-form.tsx");
    expect(form).not.toContain("planningDay");
    expect(form).not.toContain("planningTime");
    // Non-vacuous: the corpus is the real form.
    expect(form.length).toBeGreaterThan(2000);
    expect(form).toContain("timezone");
  });
});
