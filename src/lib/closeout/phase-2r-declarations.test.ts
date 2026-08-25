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
 * The assertions come in two directions, and both matter:
 *
 *  - the package is **present and coherent** — eight documents, 73 declarations,
 *    ten families with locked counts and no gaps, every requirement carrying a
 *    slice and an observable criterion;
 *  - everything the phase has **not yet reached** is asserted absent — the
 *    matrix, the closing report, the acceptance records of slices that have not
 *    run, the deployment record, and **the Phase 2R migration**.
 *
 * Phase 2N's equivalent was inverted at closeout rather than deleted, Phase 2P's
 * was flipped rather than relaxed, and Phase 2Q's was inverted slice by slice.
 * This file is inverted **the same way**, not thrown away: an absence nobody
 * asserts is an absence nobody notices disappearing.
 *
 * ## Its posture has moved twice, and the moves are recorded rather than tidied
 *
 * It was written under ADR-131 — planning only, nothing signed, nothing
 * implemented — and every one of those was a checkable property that has since
 * become false:
 *
 *  - **ADR-132** signed all nine decisions and moved the migration budget from
 *    PROPOSED to **ALLOCATED**. The *"no decision is signed"* assertions were
 *    flipped in place; the *"no migration file exists"* assertion was not,
 *    because allocated is not created.
 *  - **ADR-133** authorized implementation, slices 2R.0 … 2R.5. The *"nothing is
 *    implemented"* assertions become *"exactly what the authorized slices
 *    produced, and nothing further"*, one entry crossing over per slice.
 *
 * Neither move loosened anything. Each kept the same subject and the same
 * strictness and changed only the direction, which is the difference between
 * inverting a guard and retiring one.
 *
 * ## The pins this file carries
 *
 * 1. **A signature or an authorization is claimable only where an accepted ADR
 *    names it.** That is `2R-CLOSE-008`, and it is checked in both halves — the
 *    mark in the document, and the ADR that earns it.
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
 * 4. **Allocated is not created.** The budget is 1 allocated; the file count is
 *    still asserted at zero, and moves only in the commit slice 2R.1 spends it.
 */

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const PRD = "docs/initiatives/phase-2r/PHASE_2R_PRD.md";
const PLAN = "docs/initiatives/phase-2r/PHASE_2R_IMPLEMENTATION_PLAN.md";

/** A requirement's row in a PRD table: `| \`2R-FAMILY-001\` | … |`. */
const DECLARATION = /^\| `(2R-[A-Z]+-\d{3})` \|/gm;

/**
 * The A13 detector's own family pattern, reproduced so pin 2 can be tested
 * against it.
 *
 * **Retargeted and widened by ADR-136 Decision 8.** It matched a bullet only,
 * and this repository declares requirements in the PRD table rows this file's
 * own `DECLARATION` parses — so the detector's signal 2 had never once matched
 * a real declaration. The copy here is kept identical to the detector's, which
 * is the whole reason it exists: a control holding its own private pattern is a
 * control that keeps passing while the guard beside it drifts.
 */
const DETECTOR_FAMILY = /^(?:- \*\*|\| `)2T-[A-Z]+-\d{3}/m;

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

/**
 * `2R-NOTIFY-007`'s two patterns, at module scope so the guard and its mutation
 * control read the SAME ones.
 *
 * A control holding its own copy is a control that keeps passing while the
 * guard beside it drifts — it would prove a regex catches a planted sentence
 * and nothing about whether that regex is the one scanning the documents.
 *
 * `CLAIM` bounds a sentence with `[^.]*` and deliberately does **not** exclude
 * newlines: prose wraps, and cutting a sentence at the line break loses the
 * refusal that follows it.
 */
const PUSH_CLAIM = /[^.]*\bpush\b[^.]*\b(works|working|verified|confirmed|passing|passed|delivered|resumed|repaired|restored|re-enabled)\b[^.]*/gi;
const PUSH_REFUSAL = /\b(not|never|no|nothing|none|without|cannot|refus|withheld|unresolved|still|remains|blocked|outstanding|carried)\b/i;

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
  it("ships the seven documents ADR-131 authorizes, plus the coverage report ADR-132 earned", () => {
    for (const file of [
      PRD,
      PLAN,
      "docs/initiatives/phase-2r/PHASE_2R_THEME_OPTIONS.md",
      "docs/reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md",
      "docs/reports/phase-2r/PHASE_2R_GAPS_AND_OPPORTUNITIES.md",
      "docs/reports/phase-2r/PHASE_2R_THREAT_MODEL.md",
      "docs/reports/phase-2r/PHASE_2R_TRACEABILITY_CONTRACT.md",
      // Added once the decisions were signed: coverage is only meaningful when
      // every requirement's governing decision has an answer.
      "docs/reports/phase-2r/PHASE_2R_REQUIREMENT_COVERAGE.md",
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
    // `2T-A11Y-001` matches nothing, which is exactly what happened to Phase
    // 2K's seven accessibility requirements.
    expect(DETECTOR_FAMILY.test("- **2T-ACCESS-001:** a real declaration."), "the control is inert")
      .toBe(true);
    expect(DETECTOR_FAMILY.test("- **2T-A11Y-001:** invisible."), "a digit-bearing family was seen")
      .toBe(false);

    // **ADR-136 Decision 8.** The detector now also sees the shape this
    // repository actually writes, and the digit rule holds identically there —
    // asserted rather than assumed, because a widened pattern is a new pattern.
    expect(DETECTOR_FAMILY.test("| `2T-ACCESS-001` | x | y | build | — |"), "the table row is seen")
      .toBe(true);
    expect(DETECTOR_FAMILY.test("| `2T-A11Y-001` | x | y | build | — |"), "a digit family was seen")
      .toBe(false);

    // And the same property on this phase's own declaration shape.
    const shaped = (id: string) => new RegExp(`^\\| \`${id}\` \\|`).test(`| \`${id}\` | x | y | build | — |`);
    expect(shaped("2R-ACCESS-001")).toBe(true);
    expect([...("| `2R-A11Y-001` | x |").matchAll(DECLARATION)].length, "a digit family matched the declaration shape")
      .toBe(0);
  });
});

/**
 * **Renamed at slice 2R.0, because the block no longer describes what it holds.**
 *
 * It was *"nothing is signed, and nothing is implemented"*. ADR-132 made the
 * first half false and ADR-133 the second, and a block whose name contradicts
 * its assertions is how a reader stops trusting the assertions. The subject is
 * unchanged: **every claim of a signature or an authorization is earned by an
 * accepted ADR, and everything not yet reached is asserted absent.**
 */
describe("Phase 2R: every signature and every authorization is earned by an ADR", () => {
  /**
   * **Inverted by ADR-132, not deleted.**
   *
   * This case used to assert the opposite — that no decision was marked signed
   * and that the package said so. That property was true and is now false, so
   * the assertion is **flipped in place**, keeping the same subject and the same
   * strictness. Phase 2N's guard was inverted at closeout, Phase 2P's was
   * flipped rather than relaxed, and Phase 2Q's was inverted slice by slice; the
   * reason is always the same one: an absence nobody asserts is an absence
   * nobody notices disappearing, and the same is true of a signature.
   *
   * `2R-CLOSE-008` is the requirement: **a decision may be marked signed only
   * where an accepted ADR names it.** Both halves are checked — the mark in the
   * PRD, and the ADR that earns it.
   */
  it("holds all nine owner decisions SIGNED, each named by an accepted ADR", () => {
    const prd = read(PRD);
    const decisions = read("docs/DECISIONS.md");

    for (let n = 1; n <= 9; n += 1) {
      expect(prd, `OD-2R-${n} is not declared`).toContain(`\`OD-2R-${n}\``);
      expect(decisions, `ADR-132 does not name OD-2R-${n}`).toContain(`\`OD-2R-${n}\``);
    }

    // Nine signatures, one per decision — counted, so a copy-paste that stamped
    // one decision twice and another not at all fails here.
    const stamps = [...prd.matchAll(/^\*\*SIGNED — option A\*\*/gm)];
    expect(stamps, "expected exactly nine signature stamps").toHaveLength(9);

    expect(prd, "the package must say all nine are signed")
      .toMatch(/ALL NINE SIGNED \(ADR-132/);
    expect(prd, "the theme itself must be one of the signed decisions")
      .toMatch(/`OD-2R-1` — the theme itself/);
    expect(prd, "signing must not be presented as authorizing implementation")
      .toMatch(/Signing is not authorizing implementation/);
    expect(prd, "the original options must survive the signature")
      .toMatch(/exactly as they were written before/);
  });

  it("keeps ADR-132 an owner signature that authorizes no implementation", () => {
    const decisions = read("docs/DECISIONS.md");
    const at = decisions.indexOf("## ADR-132");
    expect(at, "ADR-132 is missing").toBeGreaterThan(-1);
    const next = decisions.indexOf("\n## ADR-", at + 1);
    const body = next < 0 ? decisions.slice(at) : decisions.slice(at, next);

    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "it must authorize no implementation").toMatch(/authorizes no implementation/i);
    expect(body, "it must not authorize a migration file")
      .toMatch(/no migration file/i);
    expect(body, "the refusal lift must be limited to reminders")
      .toMatch(/limited to reminders/i);
    expect(body, "a second migration must remain a stop condition")
      .toMatch(/second migration of any kind is a stop condition/);
    expect(body, "the waiver must not move").toMatch(/NOT EXECUTED — OWNER WAIVED/);
    expect(body, "an ADR in this series must not name the successor").not.toMatch(/2S/i);
  });

  it("keeps ADR-131 intact rather than rewritten into agreement with ADR-132", () => {
    // The rule since ADR-108: an accepted ADR is never edited to agree with a
    // later one. ADR-132 signs what ADR-131 left open; it does not revise it.
    const decisions = read("docs/DECISIONS.md");
    const at = decisions.indexOf("## ADR-131");
    const next = decisions.indexOf("\n## ADR-", at + 1);
    const body = decisions.slice(at, next);
    expect(body, "ADR-131 must still declare the decisions open")
      .toMatch(/the eight open decisions|nine decisions are OPEN|are OPEN/i);
    expect(body, "ADR-131 must still read as planning-only")
      .toMatch(/authorizes \*\*planning only\*\*/);
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

  /**
   * **Inverted by ADR-132 Decision 8: the budget moved from PROPOSED to
   * ALLOCATED — and the file count did not.**
   *
   * This is the distinction the whole case exists for. *Allocated* is a
   * decision; *created* is a file. Conflating them is how a phase spends a
   * budget nobody authorized it to spend, so both are asserted, in opposite
   * directions, in the same test.
   */
  /**
   * **Inverted by slice 2R.1: the allocation is SPENT, and the ceiling is now
   * the only thing left to guard.**
   *
   * This asserted 1 allocated and 0 created, and the distinction between those
   * two was the whole reason the case existed. Slice 2R.1 created the file
   * under ADR-133, so "0 created" is false by authorization — and the assertion
   * flips rather than relaxes: **exactly one**, named, and a second is the stop
   * condition ADR-132 Decision 8 made it. The PRD's own sentences are still
   * asserted, because the record of what was allocated does not stop mattering
   * once it is spent.
   */
  it("holds the migration budget at 1 ALLOCATED and exactly 1 CREATED", () => {
    const prd = read(PRD);
    expect(prd, "the allocation must be recorded").toMatch(/One migration is ALLOCATED/);
    expect(prd, "the stale 'not allocated' wording must be gone")
      .not.toMatch(/No migration is allocated by this document/);
    expect(prd, "allocated must not be read as permission to create")
      .toMatch(/Allocated is not created/);
    expect(prd, "a second must remain a stop condition")
      .toMatch(/second migration\s+of any kind is a stop condition/);

    const contract = read("docs/reports/phase-2r/PHASE_2R_TRACEABILITY_CONTRACT.md");
    expect(contract, "the contract must carry the allocation").toMatch(/\*\*Allocated\*\* \| \*\*1/);

    const migrations = readdirSync(join(REPO, "supabase/migrations"));
    expect(
      migrations.filter((name) => /phase[_-]?2r/i.test(name)),
      "a SECOND Phase 2R migration is a stop condition",
    ).toEqual(["202608230101_phase_2r_slice_1_reminder_recurrence.sql"]);
        // Chain head moved to 102 by Phase 2S slice 2S.1's ONE authorized migration (ADR-137 OD-2S-7 A / ADR-138 Decision 3: the suppression model, the cadence rule and the notice destination). Same reasoning as every move before it: this pin moves in the commit that adds the migration, visibly, and this guard's own claim about THIS initiative is untouched. A SECOND 2S migration is a stop condition and fails here.
expect(migrations.length, "an unattributed migration arrived beside the allocated one").toBe(102);
  });

  it("covers every requirement with a slice, and classifies none for delivery", () => {
    // `2R-CLOSE-004`. The coverage report is derived from the PRD, so a
    // requirement missing a slice cannot be hidden by editing one of them.
    const coverage = read("docs/reports/phase-2r/PHASE_2R_REQUIREMENT_COVERAGE.md");
    expect(coverage, "the declared total must match the PRD").toContain("| Declared | **73** |");
    expect(coverage, "nothing may be left unassigned").toContain("| Unassigned to a slice | **0** |");
    expect(coverage, "delivery classification must not have happened")
      .toContain("| Delivery-classified | **0 — by rule, until closeout** |");
    expect(coverage, "the coverage report must refuse to be read as a delivery matrix")
      .toMatch(/It is not a delivery matrix/);

    // Per-slice counts sum to the declared total, derived rather than trusted.
    const perSlice = [...coverage.matchAll(/^\| \*\*(2R\.\d)\*\* \| (\d+) \|/gm)]
      .map((m) => Number(m[2]));
    expect(perSlice, "expected six slice rows").toHaveLength(6);
    expect(perSlice.reduce((a, b) => a + b, 0)).toBe(73);
  });

  it("keeps the coverage report generated rather than typed, and not stale", async () => {
    // The report claims it is generated. That claim is only worth anything if
    // the generator exists and the file on disk still matches it — otherwise a
    // hand-edit would read exactly like a regeneration.
    const generator = (await import(
      "../../../scripts/generate-phase-2r-coverage.mjs"
    )) as typeof import("../../../scripts/generate-phase-2r-coverage.mjs");

    const rows = generator.requirements();
    expect(rows).toHaveLength(73);
    expect(generator.refusals(rows), "the generator refuses this package").toEqual([]);
    expect(
      generator.renderCoverage(rows),
      "the coverage report on disk differs from a fresh generation — regenerate it",
    ).toBe(read("docs/reports/phase-2r/PHASE_2R_REQUIREMENT_COVERAGE.md").replace(/\r\n/g, "\n"));

    // Non-vacuity: the generator must refuse a corpus it should refuse.
    const broken = [...rows.slice(0, 72), { ...rows[72], id: "2R-A11Y-001" }];
    expect(generator.refusals(broken).length, "a digit-bearing family was accepted")
      .toBeGreaterThan(0);
  });

  /**
   * **Inverted at slice 2R.0 by ADR-133, not deleted.**
   *
   * The list was the whole of it while nothing was authorized. Slice 2R.0 has
   * now shipped, so its acceptance record has moved from the forbidden column
   * to the required one — **in place**, keeping the same subject and the same
   * strictness. Everything the phase has not yet reached is still asserted
   * absent, and each entry moves across as, and only as, its slice lands.
   *
   * The reason is the one this file has given three times: an absence nobody
   * asserts is an absence nobody notices disappearing.
   */
  it("carries exactly the artifacts its authorized slices have produced, and no others", () => {
    for (const present of [
      "docs/reports/phase-2r/PHASE_2R_SLICE_00_ACCEPTANCE.md",
      "docs/reports/phase-2r/PHASE_2R_SLICE_01_ACCEPTANCE.md",
      /*
       * Moved across IN PLACE, and the order it moved in is the whole reason it
       * was on the other list. The record was forbidden while the migration was
       * merged but not applied, because a deployment record existing then would
       * have been a record of something nobody did. It is required now because
       * the migration IS applied: merged as `ac5af97` with CI green 3/3 at that
       * exact merge SHA, then applied, parity `202608210100` -> `202608230101`,
       * 101 local = 101 hosted. The strictness did not move with it -- what was
       * an assertion of absence is now an assertion of presence, and the
       * remaining entries below still cannot appear early.
       */
      "docs/reports/phase-2r/PHASE_2R_SLICE_01_DEPLOYMENT.md",
      /*
       * Two more, moved across in place as their slices landed.
       *
       * 2R.2 merged as `8c13c7b` with CI green 3/3 at that exact merge SHA;
       * 2R.3 merged as `30df320`. Both created zero migrations, so neither
       * brings a deployment record with it — parity stays `202608230101` and
       * `PHASE_2R_SLICE_02_DEPLOYMENT.md` would be a record of something nobody
       * did, which is why no such entry appears on either list.
       *
       * **2R.2's record is late and says so in its own first paragraph.** The
       * slice merged without one, which this assertion could not catch: it
       * refuses a record that arrives EARLY, and nothing here refused one that
       * never arrived. The traceability contract requires five, and the count is
       * asserted at closeout rather than per slice — a gap worth naming, since
       * the next author will meet it in the same order.
       */
      "docs/reports/phase-2r/PHASE_2R_SLICE_02_ACCEPTANCE.md",
      "docs/reports/phase-2r/PHASE_2R_SLICE_03_ACCEPTANCE.md",
      /*
       * Moved across in place as 2R.4 landed. Zero migrations again, so no
       * deployment record accompanies it and parity stays `202608230101` --
       * a `PHASE_2R_SLICE_04_DEPLOYMENT.md` would be a record of something
       * nobody did, which is why no such entry appears on either list.
       */
      "docs/reports/phase-2r/PHASE_2R_SLICE_04_ACCEPTANCE.md",
      /*
       * The last four, moved across in place as slice 2R.5 landed.
       *
       * The list is never deleted and never shortened to nothing: what was an
       * assertion of ABSENCE is now an assertion of PRESENCE, so the artifacts
       * that may only exist at closeout are still pinned to closeout -- a
       * future phase copying this file inherits the discipline rather than an
       * empty array.
       *
       * The matrix is generated and the generator refuses rather than emitting
       * a partial one, so its presence here is also the claim that a refusal
       * did not happen.
       */
      "docs/reports/phase-2r/PHASE_2R_SLICE_05_ACCEPTANCE.md",
      "docs/reports/phase-2r/PHASE_2R_TRACEABILITY_MATRIX.md",
      "docs/reports/phase-2r/PHASE_2R_CLOSING_REPORT.md",
      "scripts/generate-phase-2r-traceability.mjs",
    ]) {
      expect(existsSync(join(REPO, present)), `${present} is missing`).toBe(true);
    }
    for (const forbidden of [
      /*
       * Nothing left to forbid by name, and that is a statement rather than an
       * omission: the phase's own closing ADR is the one artifact that may not
       * exist yet, and it is asserted absent below against `DECISIONS.md`
       * rather than as a file.
       */
      "docs/initiatives/phase-2t",
      "docs/reports/phase-2t",
    ]) {
      expect(existsSync(join(REPO, forbidden)), `${forbidden} exists before its phase`).toBe(false);
    }
  });

  /**
   * **`2R-CLOSE-008`'s shape, applied to the authorization rather than to a
   * signature.**
   *
   * ADR-131 and ADR-132 both said, in terms, that signing is not authorizing
   * implementation and that allocated is not created. That made "implementation
   * is not authorized" a checkable property, and it was checked. It is now
   * false, so the check is **flipped rather than dropped**: implementation may
   * be claimed only where an accepted ADR authorizes it, and the two facts the
   * earlier ADRs were careful to separate must stay separate in this one.
   */
  it("holds implementation AUTHORIZED, by an accepted ADR that still refuses to close the phase", () => {
    const decisions = read("docs/DECISIONS.md");
    const at = decisions.indexOf("## ADR-133");
    expect(at, "ADR-133 is missing").toBeGreaterThan(-1);
    const next = decisions.indexOf("\n## ADR-", at + 1);
    const body = next < 0 ? decisions.slice(at) : decisions.slice(at, next);

    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "it must authorize construction").toMatch(/authorizes the \*\*construction\*\*/);
    expect(body, "every slice must be named").toMatch(/2R\.0 … 2R\.5/);
    expect(body, "it must not authorize closure").toMatch(/does not authorize the phase to close/i);
    expect(body, "a second migration must remain a stop condition")
      .toMatch(/second migration of any kind (is|remains) a stop condition/);
    expect(body, "the lift must not reach tasks").toMatch(/2R-TASK-RECURRENCE/);
    /*
     * The refusal `OD-2R-2` signed, checked without writing the four letters as
     * a string literal. `phase-2m-recurrence-guard.test.ts` scans this tree for
     * exactly that token and does not exempt this file, so naming it here would
     * report this guard as the artifact it exists to forbid — the collision
     * slice 2P.7 already paid for once.
     */
    expect(body, "the open recurrence language must stay refused by name")
      .toMatch(/refused by name/);
    expect(body, "the waiver must not move").toMatch(/NOT EXECUTED — OWNER WAIVED/);
    expect(body, "merge-SHA CI must be distinguished from a green pull-request head")
      .toMatch(/exact merge SHA/);
    expect(body, "hardware must not be dischargeable by a document")
      .toMatch(/emulator, a viewport, a document or an automated test/);
    expect(body, "an ADR in this series must not name the successor").not.toMatch(/2S/i);

    // The ceiling ADR-133 Decision 3 authorized this phase to reach, and no
    // further: authorized to create ONE is not authorized to create two.
    const migrations = readdirSync(join(REPO, "supabase/migrations"));
    expect(migrations.filter((name) => /phase[_-]?2r/i.test(name))).toHaveLength(1);
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

  /**
   * `2R-NOTIFY-007` — the one requirement in its family that is a **rule**.
   *
   * *"Push is not resumed, repaired or claimed by this phase. No requirement,
   * test or record asserts push delivery on a device."*
   *
   * ## Why this forbids the CLAIM and not the word
   *
   * These documents talk about push constantly and must keep doing so: the HTTP
   * 403 is a carried remainder, and a remainder nobody may name is a remainder
   * nobody can discharge. A guard that banned the word would force the records
   * to go quiet about the exact thing they are supposed to keep visible — this
   * repository has the lesson written down as *an authority guard must forbid
   * the act, not the word*.
   *
   * So the scan looks for **push paired with a success verb**, and then removes
   * the sentences that negate it. What is left is a document saying push works,
   * which is the only thing `-007` actually prohibits.
   */
  it("never claims push delivery works anywhere in the phase's records", () => {
    // A sentence that negates the verb is a refusal, which is what -007 wants.

    for (const file of [
      PRD,
      PLAN,
      "docs/reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md",
      "docs/reports/phase-2r/PHASE_2R_THREAT_MODEL.md",
      "docs/reports/phase-2r/PHASE_2R_SLICE_04_ACCEPTANCE.md",
    ]) {
      /*
        Whitespace is collapsed FIRST, and that is a repair rather than a
        flourish. The pattern bounds a sentence with `[^.]*`, and the first
        version also excluded newlines -- so a sentence that wrapped, which in
        prose is most of them, was cut at the line break and its refusal was
        left on the next line. This guard's own slice record was the first
        thing it accused, and it was right about the words and wrong about
        where the sentence ended.
      */
      const prose = read(file).replace(/\s+/g, " ");
      const claims = (prose.match(PUSH_CLAIM) ?? []).filter(
        (sentence) => !PUSH_REFUSAL.test(sentence),
      );
      expect(claims, `${file} claims push delivery works`).toEqual([]);
    }
  });

  /**
   * The mutation control for the guard above, kept beside it.
   *
   * A regex that matches nothing passes every file, and a scan whose subject
   * has drifted is indistinguishable from a scan that found nothing. This
   * plants the sentence `-007` forbids and proves the pattern catches it — and
   * plants the refusal shape and proves the pattern lets it through.
   */
  it("catches a planted push claim for every verb it names, and lets a refusal through", () => {
    /*
      Every verb, not one of them.

      The first version planted a single sentence using `verified`, and a
      mutation control run against it found the hole immediately: deleting
      `repaired` from the pattern left this test green. A control that proves
      the regex catches ONE forbidden sentence proves nothing about the other
      nine, and narrowing the list is exactly how a guard stops guarding
      without anybody noticing.
    */
    const VERBS = [
      "works", "working", "verified", "confirmed", "passing",
      "passed", "delivered", "resumed", "repaired", "restored", "re-enabled",
    ];

    for (const verb of VERBS) {
      const planted = `Push delivery was ${verb} on the device during this slice`;
      expect(
        (planted.match(PUSH_CLAIM) ?? []).filter((one) => !PUSH_REFUSAL.test(one)),
        `a push claim using "${verb}" is not caught`,
      ).toHaveLength(1);
    }

    // And the refusal shape the records actually use goes through untouched.
    for (const refusal of [
      "Push delivery is not resumed and the HTTP 403 is still outstanding",
      "Nothing about push was repaired by this slice",
      "No assertion here may be cited as evidence that push works",
    ]) {
      expect(
        (refusal.match(PUSH_CLAIM) ?? []).filter((one) => !PUSH_REFUSAL.test(one)),
        `a refusal was mistaken for a claim: ${refusal}`,
      ).toHaveLength(0);
    }
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
  it("retargets every one of the SIX pins off Phase 2S", () => {
    /*
     * ADR-131 Decision 9 counted five and five was right when it was written.
     * **ADR-136 Decision 9 counts six**, because Phase 2R then shipped a
     * generator of its own whose refusal 14 is the sixth. `STATE.md` and
     * ADR-130 once said the letter lived "only inside the A13 detector"; that
     * was wrong, ADR-131 corrected it to five, and this corrects it to six.
     *
     * Three of the six are findable only by running the suite. Each is asserted
     * so a future retarget that misses one fails here rather than at the next
     * authorization — which is exactly how ADR-121's missed retarget was caught.
     */
    const detector = read("src/lib/closeout/phase-2f-documentation.test.ts");
    expect(detector).toMatch(/const GOVERNING_ARTIFACT_ROLE = \/\^PHASE_2T_/);
    expect(detector, "pin 2 must carry the repaired both-shapes pattern").toContain(
      "const DECLARED_SUCCESSOR_REQUIREMENT = /^(?:- \\*\\*|\\| `)2T-[A-Z]+-\\d{3}/m;",
    );
    expect(detector).toMatch(/const IMPLEMENTATION_MARKED_FILE = \/phase\[_-\]\?2t\/i;/);

    const twoO = read("src/lib/closeout/phase-2o-declarations.test.ts");
    expect(twoO, "the 2O pin did not move").toContain("PHASE_2T_");
    expect(twoO, "the 2O pin still names the authorized phase").not.toContain("PHASE_2R_");

    expect(read("scripts/generate-phase-2p-traceability.mjs"))
      .toContain("docs/initiatives/phase-2t");
    expect(read("scripts/generate-phase-2q-traceability.mjs"))
      .toMatch(/2T-\[A-Z\]\+-\\d\{3\}/);
    expect(read("scripts/generate-phase-2r-traceability.mjs"), "the sixth pin did not move")
      .toMatch(/2T-\[A-Z\]\+-\\d\{3\}/);

    const twoQ = read("src/lib/closeout/phase-2q-declarations.test.ts");
    expect(twoQ, "the ADR-block helper must bound the slice").toContain("function adrBlock");
    expect(twoQ, "an unbounded ADR slice returned").not.toMatch(/const body = decisions\.slice\(at\);/);
  });

  it("finds no artifact for the phase after the one now authorized", () => {
    expect(existsSync(join(REPO, "docs/initiatives/phase-2t"))).toBe(false);
    expect(existsSync(join(REPO, "docs/reports/phase-2t"))).toBe(false);
    expect(read(PRD), "the successor must be declared unstarted")
      .toMatch(/The phase after\s+this one is not started/);
  });

  it("records Phase 2S's start as an authorization rather than an accident", () => {
    // The half that makes this retarget legal rather than merely mechanical.
    // Phase 2S's artifacts exist *because* an owner decision says they may.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-136 — The owner authorizes Phase 2S planning/);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2s/PHASE_2S_PRD.md"))).toBe(true);
    expect(existsSync(join(REPO, "docs/reports/phase-2s"))).toBe(true);
  });
});
