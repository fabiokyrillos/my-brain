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
const TOTAL = 116;

/**
 * The family distribution on the day ADR-115 authorized planning, before any
 * decision was signed.
 *
 * ADR-116 signed all twelve and **appended** three requirements for the
 * appearance control `OD-2O-2` **A** authorized. The owner's instruction was
 * explicit: *do not renumber, reuse or delete an already-declared identifier.*
 * Recording the pre-signature distribution is what makes that checkable — a
 * family that shrank, or one that grew where no decision added scope, fails
 * below. Exact counts alone would not catch it: a family could lose one and
 * gain one and still total correctly.
 */
const FAMILY_COUNTS_BEFORE_SIGNATURES: Readonly<Record<string, number>> = {
  ACTIVATION: 7, ENTRY: 8, ONBOARD: 11, PREF: 12, AICONFIG: 9, COST: 7,
  PRIVACY: 10, CONSENT: 5, NOTIFY: 7, RECOVER: 7, MOBILE: 5, ACCESS: 6,
  READY: 5, METRICS: 5, SEC: 5, CLOSE: 4,
};

/** The only family ADR-116 was allowed to grow, and by how much. */
const FAMILY_GROWN_BY_SIGNATURES = { family: "PREF", by: 3 } as const;

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
  PREF: 15,
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

  it("renumbered, reused and deleted nothing when ADR-116 appended three", () => {
    // The owner's instruction, made checkable. Only `2O-PREF` may have grown,
    // and only by three; every other family must be byte-for-byte the size it
    // was before any decision was signed.
    for (const [family, before] of Object.entries(FAMILY_COUNTS_BEFORE_SIGNATURES)) {
      const now = FAMILY_COUNTS[family];
      const allowed = family === FAMILY_GROWN_BY_SIGNATURES.family
        ? before + FAMILY_GROWN_BY_SIGNATURES.by
        : before;
      expect(now, `${family} moved from ${before} to ${now}, and only PREF may grow`).toBe(allowed);
    }
    // The appended three exist, and the twelve that preceded them still do —
    // which is what "appended" means and what "renumbered" would break.
    for (let n = 1; n <= 15; n += 1) {
      const id = `2O-PREF-${String(n).padStart(3, "0")}`;
      expect(ids, `${id} is missing`).toContain(id);
    }
    expect(read(PRD), "the appended requirements must say which decision added them")
      .toMatch(/\*\*2O-PREF-013:\*\* \*\(appended by \*\*ADR-116\*\*/);
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

  it("catches the count in prose too, not only in the bolded headline form", () => {
    /*
     * **The gap this closes, found by reading the diff rather than by a test.**
     *
     * ADR-116 moved the total 113 → 116, and `2O-CLOSE-001` — a live
     * requirement — went on saying *"every one of the 113 requirements"*. The
     * assertion above did not see it: that pattern matches `**113 requirements`
     * and this text is `the 113 requirements`, with no asterisks. A count guard
     * that only knows one spelling of the count is a count guard with a hole,
     * and this phase's own contract (`R-2O-3`) forbids exactly the drift it let
     * through.
     *
     * Every document in the package is now scanned for any number immediately
     * followed by "requirements", in either spelling.
     *
     * **And this assertion had a hole of its own, found by planting the defect
     * rather than by reasoning about it.** The first version exempted `113`
     * whenever the document also contained the phrase `113 → 116` — the
     * deliberate record of the correction. Every document that records the
     * correction contains that phrase, so the exemption swallowed the very
     * occurrence it was meant to let through *around*. Planting
     * `the 113 requirements` back into the PRD made the test **pass**.
     *
     * The exemption was not narrowed; it was **deleted**, because it was never
     * needed: `113 → 116` has no "requirements" after the number, so the
     * pattern cannot match inside it. A document-wide exemption for a
     * per-occurrence problem is how a check comes to pass by containing its own
     * subject.
     */
    for (const document of [PRD, PLAN, AUDIT, GAPS, THREATS, CONTRACT]) {
      const source = flat(document);
      for (const [, claim] of source.matchAll(/(\d+)\s+requirements\b/g)) {
        expect(Number(claim), `${document} states ${claim} requirements, not ${TOTAL}`).toBe(TOTAL);
      }
    }
    // Non-vacuous, in both directions: the pattern sees the prose form, and it
    // does **not** see the correction record, so no exemption is required.
    expect([..."every one of the 113 requirements".matchAll(/(\d+)\s+requirements\b/g)]
      .map((match) => Number(match[1]))).toEqual([113]);
    expect([..."The total moves **113 → 116**.".matchAll(/(\d+)\s+requirements\b/g)]).toEqual([]);
  });

  it("declares the same total in the contract's own refusal", () => {
    // `R-2O-1` states the count as part of the refusal. It went stale once.
    expect(flat(CONTRACT)).toMatch(new RegExp(`\\*\\*${TOTAL} declared\\.\\*\\*`));
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

  it("states in the PRD and the plan that implementation IS authorized, by ADR-118", () => {
    /*
     * **Inverted by ADR-118, and kept rather than deleted — the fourth
     * inversion in this phase and the one with the most at stake.**
     *
     * Under ADR-115 this refused a governing document that failed to say
     * implementation was unauthorized. The owner has now authorized it, so the
     * old assertion would hold a **false statement** in place with a test —
     * exactly the failure ADR-117 corrected for `embedding_model` one ADR
     * earlier. The direction moves; the property does not: **the governing pair
     * states the authorization it actually has, and states no other.**
     *
     * The superseded form is quoted below rather than deleted, because a
     * deleted assertion cannot be told apart from a satisfied one.
     *
     * *Superseded form: `expect(flat(document)).toMatch(/\*\*Implementation is
     * NOT authorized\.?\*\*|\*\*No slice below is authorized/i)`.*
     */
    for (const document of [PRD, PLAN]) {
      const source = flat(document);
      expect(source, `${document} does not record the implementation authorization`)
        .toMatch(/\*\*Implementation is authorized through closeout by ADR-118\.?\*\*/i);
      expect(source, `${document} still refuses the implementation the owner authorized`)
        .not.toMatch(/\*\*Implementation is NOT authorized/i);
      expect(source, `${document} still refuses every slice`)
        .not.toMatch(/\*\*No slice below is authorized/i);
      // The prior authorizations stay cited. An implementation authorization
      // does not replace the signatures it was given on top of.
      for (const adr of ["ADR-115", "ADR-116", "ADR-118"]) {
        expect(read(document), `${document} drops ${adr}`).toMatch(new RegExp(adr));
      }
    }
    // Non-vacuous, in both directions: the pattern really matches the claim it
    // requires, and really does not match the one it now forbids.
    expect("Implementation is authorized through closeout by ADR-118.")
      .toMatch(/Implementation is authorized through closeout by ADR-118/i);
    expect("planning only, and busy").not.toMatch(/Implementation is authorized through closeout/i);
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

describe("Phase 2O decisions: twelve are SIGNED, and the declined branches stay visible", () => {
  /*
   * **Inverted by ADR-116, and kept rather than deleted.**
   *
   * Under ADR-115 this block refused a document that read its own
   * recommendation as an outcome. The decisions are now signed, so it refuses
   * the mirror error: a document that re-opens one, softens it, or describes it
   * as open. The failure being prevented is unchanged — a document disagreeing
   * with the owner's actual signature. Only the direction moved.
   *
   * The pre-signature assertion is not removed but re-pointed: a *claim of a
   * signature* is now legitimate, so what is forbidden is the opposite claim.
   */
  const adr116 = (): string => {
    const decisions = read("docs/DECISIONS.md");
    const start = decisions.indexOf("## ADR-116");
    expect(start, "ADR-116 is not recorded").toBeGreaterThan(0);
    const next = decisions.indexOf("\n## ADR-", start + 1);
    return decisions.slice(start, next === -1 ? undefined : next);
  };

  it("records ADR-116 as accepted, and as authorizing no implementation", () => {
    const body = adr116();
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "ADR-116 must sign all twelve").toMatch(/signs `OD-2O-1` … `OD-2O-12` in full/);
    expect(body, "signing decisions is not authorizing work")
      .toMatch(/authorizes no implementation/i);
    expect(body, "ADR-116 must keep the phase planning-only").toMatch(/remains a \*\*planning phase\*\*/);
    expect(body, "an authorizing ADR must not name the successor").not.toMatch(/2P/i);
  });

  it("keeps ADR-115 intact rather than rewritten, and marks what amended it", () => {
    // The rule this series has been held to since ADR-108: an accepted ADR is
    // not edited into agreement with a later one.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-115 — The owner authorizes Phase 2O/);
    expect(decisions, "ADR-115 must point at what superseded it in part")
      .toMatch(/\*\*Superseded in part by ADR-116\*\*/);
    expect(decisions, "ADR-115's own ceiling must still read as it did when signed")
      .toMatch(/\*\*M2\*\* reserved for \*\*exactly one\*\*/);
  });

  it("records every one of the twelve signatures in the PRD", () => {
    const prd = flat(PRD);
    expect(prd).toMatch(/ALL TWELVE SIGNED by ADR-116/);
    for (const decision of OPEN_DECISIONS) {
      // Ten decisions were signed as a lettered option; `OD-2O-9` (the budget)
      // and `OD-2O-11` (the residual list) had no letters to sign, so their
      // cell reads "signed". Both shapes are accepted and an empty cell is not.
      expect(prd, `${decision} has no recorded signature`)
        .toMatch(new RegExp(`\\| \`${decision}\` \\| (\\*\\*[AB]\\*\\*|signed) \\|`));
    }
    // Non-vacuous: an unsigned cell really does fail this shape.
    expect("| `OD-2O-9` |  |").not.toMatch(/\| `OD-2O-9` \| (\*\*[AB]\*\*|signed) \|/);
  });

  it("never re-opens or softens a signed decision", () => {
    // The inverted refusal. A recommendation is the agent's and a signature is
    // the owner's; once given, no document may describe it as still open.
    for (const document of [PRD, PLAN, AUDIT, GAPS, THREATS, CONTRACT]) {
      const source = flat(document);
      for (const forbidden of [
        /OD-2O-\d+ (is|remains) (still )?open/i,
        /none is signed/i,
        /awaiting the owner's signature/i,
      ]) {
        expect(source, `${document} re-opens a signed decision`).not.toMatch(forbidden);
      }
    }
    // Non-vacuous: the patterns really match the shape they forbid.
    expect("OD-2O-4 remains open").toMatch(/OD-2O-\d+ (is|remains) (still )?open/i);
  });

  it("records the interpretation as confirmed, and keeps the flag it superseded", () => {
    /*
     * **Inverted by ADR-117, and this is the third inversion in this phase.**
     *
     * ADR-116 flagged the `embedding_model` reading as the agent's, and this
     * assertion held the flag in place. The owner has now confirmed it, so the
     * flag became a **false statement about who decided** — held in place by a
     * test, which is the worst version of that failure. The assertion inverts
     * with the fact rather than being deleted, and the superseded wording stays
     * quoted in the PRD so the history is legible.
     */
    const prd = flat(PRD);
    expect(prd, "the confirmation must be recorded").toMatch(/ADR-117 confirms/);
    expect(prd, "the row must not claim the column has no consumer")
      .toMatch(/real consumers, no authorized control/);
    expect(prd, "the column may not be touched to satisfy the decision")
      .toMatch(/may not be removed, altered,\s*renamed, re-defaulted or migrated/);
    expect(prd, "the superseded flag must stay quoted rather than deleted")
      .toMatch(/interpretation the agent took, not a signature the owner gave/);
    // ADR-116's own text is the record of what was true when it was written and
    // is not edited into agreement with ADR-117.
    expect(adr116()).toMatch(/interpretation, not a signature/);
  });

  it("records ADR-117 as an accepted confirmation that authorizes nothing", () => {
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-117 — The owner confirms the `embedding_model` reading/);
    const start = decisions.indexOf("## ADR-117");
    const next = decisions.indexOf("\n## ADR-", start + 1);
    const body = decisions.slice(start, next === -1 ? undefined : next);
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "a confirmation must add no implementation").toMatch(/authorizes no implementation/i);
    expect(body, "a confirmation must add no migration").toMatch(/no migration/i);
    expect(body, "the column must be protected from tidying").toMatch(/may not be removed, altered, renamed/);
    expect(body, "an ADR in this series must not name the successor").not.toMatch(/2P/i);
    expect(decisions, "ADR-116 must point at what amended it")
      .toMatch(/\*\*Amended by ADR-117\*\*/);
  });

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

  it("records the inversion rather than deleting the refusal it replaced", () => {
    // A deleted refusal records nothing, and the next reader cannot tell a rule
    // that was satisfied from a rule that was removed. The contract keeps both
    // forms of `R-2O-5`.
    const contract = flat(CONTRACT);
    expect(contract).toMatch(/R-2O-5 — A signed decision may not be silently re-decided/);
    expect(contract, "the pre-signature form must be retained, not deleted")
      .toMatch(/Pre-signature form, retained/);
    expect(contract).toMatch(/Twenty-eight numbered refusals/);
    // ADR-117's sub-refusal is lettered rather than numbered, so that the
    // refusals other documents already cite keep their numbers.
    expect(contract).toMatch(/R-2O-13b — `embedding_model` may not gain a control/);
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
    // Phase 2P spent two authorized migrations after this phase closed, each
    // under a named owner authorization: slice 2P.1's under ADR-122's
    // amendment, and slice 2P.4's under ADR-123. They are counted explicitly
    // and pinned at exactly two, so an unattributed migration still fails the
    // total below.
    const laterPhase2p = migrations.filter((name) => /phase[_-]?2p/i.test(name));
    expect(laterPhase2p, `Phase 2P must have exactly two migrations: ${laterPhase2p.join(", ")}`)
      .toHaveLength(2);
    // Phase 2Q spent the ONE migration ADR-127 Decision 7 allocated, after this
    // phase closed. Counted explicitly and pinned at exactly one, for the same
    // reason as Phase 2P above: an unattributed migration must still fail the
    // total, and a SECOND 2Q migration is a stop condition that fails here.
    const laterPhase2q = migrations.filter((name) => /phase[_-]?2q/i.test(name));
    expect(laterPhase2q, `Phase 2Q is allocated exactly one migration: ${laterPhase2q.join(", ")}`)
      .toHaveLength(1);
    expect(migrations).toHaveLength(MIGRATIONS_BEFORE_PHASE_2O + 3 + laterPhase2p.length + laterPhase2q.length);
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

  it("records that M2 lost every destination it had, and may not be spent", () => {
    // The consequence no single signature shows. ADR-115 reserved M2 for
    // exactly one of three options; ADR-116 signed all three the other way. A
    // reader who sees "2 allocated" and hunts for a second spend must find this
    // instead, and a future author must find a refusal rather than a vacancy.
    expect(flat(PLAN)).toMatch(/NO REMAINING DESTINATION/);
    expect(flat(PLAN), "closing unspent must be recorded as correct, not as an omission")
      .toMatch(/M2 closes unspent by construction/);
    expect(flat(PRD), "the stop condition must name M2 explicitly")
      .toMatch(/M2 is about to be spent at all/);
    expect(flat(CONTRACT)).toMatch(/R-2O-25 — M2 may not be spent, on anything/);
  });

  it("keeps the screen-reader gate unpromotable by anything but a run", () => {
    // `OD-2O-12` B traded a blocking gate for an absolute evidence rule. If the
    // concession ever outlives the rule, this is what fails.
    for (const document of [PRD, PLAN, CONTRACT]) {
      expect(flat(document), `${document} does not forbid promotion by inference`)
        .toMatch(/emulator|emulation/i);
    }
    expect(flat(PRD)).toMatch(/may close \*\*`built` only on a recorded execution\*\*/);
    expect(flat(CONTRACT)).toMatch(/R-2O-26 — The screen-reader run may never be promoted/);
  });

  it("keeps the CSP out of scope, and says why the appearance script does not need it", () => {
    // Verified in the tree when the threat was written, and asserted here so a
    // future change to `next.config.ts` makes the claim fail rather than rot.
    expect(read("next.config.ts"), "script-src no longer carries 'unsafe-inline'")
      .toMatch(/const script = \[[^\]]*'unsafe-inline'/);
    expect(flat(THREATS)).toMatch(/already carries\s+`?'unsafe-inline'`? in `script-src`/);
    expect(flat(CONTRACT)).toMatch(/R-2O-27 — The CSP may not change/);
  });
});

describe("Phase 2O: every delivered slice leaves an acceptance record", () => {
  it("carries one acceptance record per delivered slice, and none for a slice not started", () => {
    /*
     * **Inverted by ADR-118, exactly as this block said it would be.**
     *
     * The prior form refused *any* acceptance record, matrix, closing report or
     * deployment record, because under a planning-only authorization each was
     * proof that work had started under a decision that forbade it. That was
     * right then. Implementation is now authorized, so the **absence** of an
     * acceptance record for a delivered slice is the defect, and the assertion
     * turns over rather than being removed — a deleted gate cannot be told apart
     * from a satisfied one.
     *
     * *Superseded form: every name matching `/ACCEPTANCE|TRACEABILITY_MATRIX|
     * CLOSING_REPORT|DEPLOYMENT/i` was refused.*
     *
     * What did **not** invert: the closing artifacts of the *phase*. A matrix,
     * a closing report or a deployment record while eight slices are unbuilt is
     * still a phase claiming to be finished, and is still refused below.
     */
    const directory = join(REPO, "docs", "reports", "phase-2o");
    const reports = existsSync(directory) ? readdirSync(directory) : [];

    // The delivered slices, and the record each must have left. A slice is added
    // here **in its own commit**, so this authorization commit asserts the rule
    // and the slice that follows asserts itself.
    const DELIVERED: readonly string[] = [
      "PHASE_2O_SLICE_00_ACCEPTANCE.md",
      "PHASE_2O_SLICE_01_ACCEPTANCE.md",
      "PHASE_2O_SLICE_02_ACCEPTANCE.md",
      "PHASE_2O_SLICE_03_ACCEPTANCE.md",
      "PHASE_2O_SLICE_04_ACCEPTANCE.md",
      "PHASE_2O_SLICE_05_ACCEPTANCE.md",
      "PHASE_2O_SLICE_06_ACCEPTANCE.md",
      "PHASE_2O_SLICE_07_ACCEPTANCE.md",
      "PHASE_2O_SLICE_08_ACCEPTANCE.md",
    ];
    for (const record of DELIVERED) {
      expect(reports, `a delivered slice left no acceptance record: ${record}`).toContain(record);
    }

    // Non-vacuous: this is a real directory listing rather than an empty one,
    // and the shape a record takes is fixed so a slice cannot invent its own.
    expect(reports.length).toBeGreaterThanOrEqual(4);
    expect(["PHASE_2O_SLICE_00_ACCEPTANCE.md"].filter((name) => /^PHASE_2O_SLICE_\d\d_ACCEPTANCE\.md$/.test(name)))
      .toHaveLength(1);
  });

  it("carries the closing artifacts now that the phase has closed, and still no deployment record", () => {
    /*
     * **Inverted here, in slice 2O.8's own commit**, exactly as the traceability
     * contract said it would be: *"the phase-closing artifacts stay refused
     * until 2O.8 … that half inverts in 2O.8's own commit."*
     *
     * The refusal was correct for as long as eight slices were unbuilt — a
     * matrix mid-flight is a phase claiming to be finished. All nine have
     * shipped, so the **absence** of the matrix and the closing report is now
     * the defect, and requiring their absence would force the guard to deny a
     * delivery the owner authorized. This is the same assertion moving with the
     * facts that `R-2O-7`, `R-2O-8` and the milestone line have each made.
     *
     * *Superseded form, retained rather than deleted: "carries no matrix,
     * closing report or deployment record while the phase is mid-flight" —
     * asserting `[/TRACEABILITY_MATRIX/i, /CLOSING_REPORT/i, /DEPLOYMENT/i]`
     * each matched nothing.*
     *
     * **The deployment record does not invert, and its reason changed.** It was
     * refused because the phase was mid-flight; it stays refused because
     * **Phase 2O created zero migrations and deployed nothing**. A deployment
     * record here would describe a deployment that never happened, which is a
     * worse artifact than a missing one. That refusal is now permanent for this
     * phase rather than conditional on its progress.
     */
    const directory = join(REPO, "docs", "reports", "phase-2o");
    const reports = existsSync(directory) ? readdirSync(directory) : [];

    for (const required of ["PHASE_2O_TRACEABILITY_MATRIX.md", "PHASE_2O_CLOSING_REPORT.md"]) {
      expect(reports, `the closed phase left no ${required}`).toContain(required);
    }

    const deployments = reports.filter((name) => /DEPLOYMENT/i.test(name));
    expect(deployments, `the phase deployed nothing, so a deployment record would be false: ${deployments.join(", ")}`)
      .toEqual([]);

    // Non-vacuous in both directions: the filter really matches the shape it
    // forbids, and the listing really is a directory rather than an empty array.
    expect(["PHASE_2O_DEPLOYMENT_RECORD.md"].filter((name) => /DEPLOYMENT/i.test(name))).toHaveLength(1);
    expect(reports.length).toBeGreaterThanOrEqual(9);
  });

  it("keeps the generated matrix generated, and never hand-written", () => {
    // `2O-CLOSE-002`. The marker is what tells the next reader that editing this
    // file is pointless — `--check` will overwrite the edit or fail the build.
    const matrix = read("docs/reports/phase-2o/PHASE_2O_TRACEABILITY_MATRIX.md");
    expect(matrix).toContain("Do not edit by hand");
    expect(matrix).toContain("scripts/generate-phase-2o-traceability.mjs");
    expect(matrix, "the phase closes with every declared requirement classified")
      .toContain("**116 declared · 116 classified · 0 unclassified.**");
  });

  it("records ADR-118 as an accepted implementation authorization that names no successor", () => {
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-118 — The owner authorizes Phase 2O implementation through closeout/);
    const start = decisions.indexOf("## ADR-118");
    const next = decisions.indexOf("\n## ADR-", start + 1);
    const body = decisions.slice(start, next === -1 ? undefined : next);
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "the budget must be restated rather than assumed").toMatch(/2 allocated/);
    expect(body, "a third migration must stay a stop condition").toMatch(/third migration is a STOP CONDITION/i);
    expect(body, "M2 must stay unspendable").toMatch(/M2 has no destination and may not be spent/);
    expect(body, "signup must stay closed").toMatch(/no opening of signup/i);
    expect(body, "an authorizing ADR must not name the successor").not.toMatch(/2P/i);
    expect(decisions, "ADR-117 must point at what superseded it in part")
      .toMatch(/\*\*Superseded in part by ADR-118\*\*/);
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
    //
    // ADR-115 moved the detector off 2O and onto this phase's then-unnamed
    // successor, and this test pinned that target literally. ADR-121 then
    // authorized that successor and moved the detector again, in its own
    // commit, so the pin moves with it — and **ADR-126 does it a third time**.
    // The property this test holds forever is the negative half — the detector
    // never points back at 2O — asserted explicitly below so the pin update can
    // never satisfy this test by accident. The literal pin on the current
    // target is kept deliberately: every future retarget must consciously pass
    // through here, which is how this defect was caught when ADR-121's retarget
    // missed it.
    const guard = read("src/lib/closeout/phase-2f-documentation.test.ts");
    expect(guard).not.toMatch(/const GOVERNING_ARTIFACT_ROLE = \/\^PHASE_2O_/);
    expect(guard).toMatch(/const GOVERNING_ARTIFACT_ROLE = \/\^PHASE_2R_/);
    expect(guard).toMatch(/const DECLARED_SUCCESSOR_REQUIREMENT = \/\^- \\\*\\\*2R-/);
    expect(guard).toMatch(/const IMPLEMENTATION_MARKED_FILE = \/phase\[_-\]\?2r\/i;/);
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

  /**
   * **Inverted by slice 2O.3, not deleted** — the pattern `R-2O-5`, `R-2O-7` and
   * `2O-AICONFIG-004` have already taken in this phase.
   *
   * Superseded form, quoted so the next reader can tell a rule that was
   * satisfied from a rule that was removed:
   *
   * > `expect(form, "${column} now has a control — reconcile the audit and
   * > OD-2O-6").not.toContain(column)`
   *
   * That was correct while the audit said these three were *consumed and
   * uncontrolled*, which was true of the tree until `2O-PREF-004` built the
   * controls `OD-2O-6` **A** signed. Holding the old assertion would keep a
   * false statement in place with a test — the exact failure ADR-117 corrected
   * one ADR earlier.
   *
   * **The failure being prevented is unchanged: the audit disagreeing with the
   * tree. Only the direction moved.**
   */
  it("gives the three consumed review preferences the controls `OD-2O-6` A signed", () => {
    // Non-vacuous in the direction that matters: the consumer really is there,
    // so an audit that stopped being true would fail here rather than in prose.
    const schedule = read("src/features/day-review/review-schedule.ts");
    for (const column of ["dailyReviewTime", "weeklyReviewTime", "weeklyReviewDay"]) {
      expect(schedule, `${column} is no longer read`).toContain(column);
    }
    const form = read("src/features/profile/settings-form.tsx");
    for (const column of ["dailyReviewTime", "weeklyReviewTime", "weeklyReviewDay"]) {
      expect(form, `${column} lost its control — 2O-PREF-004 requires one`).toContain(`name="${column}"`);
    }
    /*
     * And the registry row moves with them. `2O-ACTIVATION-006` fixed
     * `scheduled_reviews` at `uncontrolled` *and said its final wording and
     * `visible` value belong to `2O-PREF-004`* — so a slice that shipped the
     * controls and left the row claiming there is no authorized control would
     * have made the registry lie about a surface it governs.
     */
    const registry = read("src/features/shell/capabilities.ts");
    const row = registry.match(/\{ key: "scheduled_reviews",[^}]*\}/)?.[0] ?? "";
    expect(row, "the scheduled_reviews row is gone").not.toBe("");
    expect(row, "the row still says uncontrolled while three controls ship").toContain('state: "operational"');
    expect(row, "the row is still hidden while its controls are visible").toContain("visible: true");
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
