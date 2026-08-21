/**
 * Phase 2Q declaration guard.
 *
 * ## What this file is, and what it is not
 *
 * It is a **documentary** guard. It reads `docs/` and asserts properties of
 * documents. It ships no route, no component, no Server Action and no SQL, and
 * ADR-126 authorizes exactly this: the planning package, plus the guards that
 * keep it fail-closed.
 *
 * ## The posture it holds
 *
 * ADR-126 authorizes **planning only**. So the assertions come in two
 * directions, and both matter:
 *
 *  - the package is **present and coherent** — six documents, 39 declarations,
 *    six families with locked counts and no gaps;
 *  - everything that only exists *after* implementation is **absent** — no
 *    acceptance record, no matrix, no closing report, no deployment record, and
 *    **no Phase 2Q migration**.
 *
 * Phase 2N's equivalent was inverted at closeout rather than deleted, and Phase
 * 2P's was flipped rather than relaxed, for the reason both files state: an
 * absence nobody asserts is an absence nobody notices disappearing. This file
 * is written to be flipped the same way when the owner authorizes
 * implementation, not thrown away.
 *
 * ## Three pins this file carries that its predecessors did not
 *
 * 1. **Eight decisions are OPEN**, and a document that reports one as signed —
 *    or that quietly drops a decision — fails. A recommendation is not a
 *    signature, and this repository has already recorded a phase where a
 *    package's own recommendation was read back as an outcome.
 * 2. **No family name may contain a digit.** `2K-A11Y` did, which made Phase
 *    2K's seven accessibility requirements invisible to every prose count *and*
 *    to the A13 detector's declaration signal. The family here is `ACCESS`, and
 *    the property is asserted rather than remembered.
 * 3. **The supersession is narrow and named.** ADR-126 supersedes ADR-125
 *    Decision 6 alone. A future edit that widened it — or that edited ADR-125
 *    itself — would be the failure this series has refused since ADR-108.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const exists = (relative: string) => existsSync(join(REPO, relative));

const PRD = "docs/initiatives/phase-2q/PHASE_2Q_PRD.md";
const PLAN = "docs/initiatives/phase-2q/PHASE_2Q_IMPLEMENTATION_PLAN.md";
const AUDIT = "docs/reports/phase-2q/PHASE_2Q_CURRENT_EXPERIENCE_AUDIT.md";
const GAPS = "docs/reports/phase-2q/PHASE_2Q_GAPS_AND_OPPORTUNITIES.md";
const THREATS = "docs/reports/phase-2q/PHASE_2Q_THREAT_MODEL.md";
const CONTRACT = "docs/reports/phase-2q/PHASE_2Q_TRACEABILITY_CONTRACT.md";
const REQUIRED = [PRD, PLAN, AUDIT, GAPS, THREATS, CONTRACT] as const;

/** The repository's canonical declaration shape — the one the A13 detector reads. */
const DECLARATION = /^- \*\*(2Q-[A-Z]+-\d{3}):\*\*/gm;
const ids = [...read(PRD).matchAll(DECLARATION)].map((match) => match[1]);

const TOTAL = 39;
const FAMILY_COUNTS: Readonly<Record<string, number>> = {
  FOUNDATION: 5,
  CITE: 9,
  LINK: 7,
  TRUST: 8,
  ACCESS: 5,
  CLOSE: 5,
};

const OPEN_DECISIONS = [
  "OD-2Q-1",
  "OD-2Q-2",
  "OD-2Q-3",
  "OD-2Q-4",
  "OD-2Q-5",
  "OD-2Q-6",
  "OD-2Q-7",
  "OD-2Q-8",
] as const;

const familyOf = (id: string): string => id.split("-")[1];
const indexOf = (id: string): number => Number.parseInt(id.split("-")[2], 10);

describe("Phase 2Q declarations", () => {
  it("carries the complete planning package", () => {
    for (const path of REQUIRED) expect(exists(path), `${path} is missing`).toBe(true);
  });

  it("declares 39 unique requirements across six families", () => {
    expect(ids.length).toBe(TOTAL);
    expect(new Set(ids).size, "a requirement is declared twice").toBe(TOTAL);
    expect([...new Set(ids.map(familyOf))].sort()).toEqual(Object.keys(FAMILY_COUNTS).sort());
  });

  it("numbers every family from 001 without gaps and locks its count", () => {
    for (const [family, count] of Object.entries(FAMILY_COUNTS)) {
      const members = ids.filter((id) => familyOf(id) === family).map(indexOf).sort((a, b) => a - b);
      expect(members.length, `${family} changed size`).toBe(count);
      expect(members, `${family} is not 001..${count} without gaps`)
        .toEqual(Array.from({ length: count }, (_, i) => i + 1));
    }
  });

  it("uses no family name containing a digit, which is what hid 2K-A11Y", () => {
    // Not a style rule. `[A-Z]+-\d{3}` cannot match a family with digits in it,
    // so such a family is invisible to this guard, to the traceability
    // generator's attribution check, and to the A13 detector's declaration
    // signal — all three at once, and all three silently.
    for (const family of Object.keys(FAMILY_COUNTS)) {
      expect(/^[A-Z]+$/.test(family), `${family} contains a character that hides it`).toBe(true);
    }
    // The control: the shape that hid Phase 2K's family really is unmatchable.
    expect(/^- \*\*(2Q-[A-Z]+-\d{3}):\*\*/m.test("- **2Q-A11Y-001:** x")).toBe(false);
  });

  it("gives every requirement an observable criterion and a class", () => {
    // The owner's contract: a requirement without a checkable criterion is not a
    // requirement. Counted rather than spot-checked, so one that quietly loses
    // its criterion fails.
    const prd = read(PRD);
    const declarations = prd.split("\n").filter((line) => /^- \*\*2Q-[A-Z]+-\d{3}:\*\*/.test(line));
    expect(declarations.length).toBe(TOTAL);
    for (const line of declarations) {
      const id = /^- \*\*(2Q-[A-Z]+-\d{3})/.exec(line)?.[1] ?? "?";
      expect(line, `${id} has no observable criterion`).toMatch(/\*\*Observable:\*\*/);
      expect(line, `${id} has no class`).toMatch(/\*\*Class:\*\* (baseline|construction|not-built-by-rule)/);
    }
  });

  it("classifies nothing as delivered while the phase is unimplemented", () => {
    // `built`, `partial` and `undelivered` are outcomes of execution. A planning
    // package that used one would be reporting a result it cannot have.
    const prd = read(PRD);
    for (const verdict of ["**Class:** built", "**Class:** partial", "**Class:** undelivered"]) {
      expect(prd, `a planning document claims ${verdict}`).not.toContain(verdict);
    }
  });

  it("declares all eight owner decisions as OPEN, each with options and a recommendation", () => {
    const prd = read(PRD);
    expect(prd, "the decisions section must say nothing is signed")
      .toMatch(/NOTHING HERE IS SIGNED/);
    for (const decision of OPEN_DECISIONS) {
      expect(prd, `${decision} is not declared`).toContain(`### \`${decision}\``);
    }
    // Every decision carries exactly one recommendation. Counted, so a decision
    // that loses its recommendation — or grows a second — fails.
    const recommended = [...prd.matchAll(/\(recommended\)/g)].length;
    expect(recommended, "a decision lost or duplicated its recommendation")
      .toBe(OPEN_DECISIONS.length);
  });

  it("never reports an open decision as signed", () => {
    /*
     * The mirror error of Phase 2O's guard, which after ADR-116 had to refuse a
     * document that *re-opened* a signed decision. Here nothing is signed, so
     * what is forbidden is the opposite claim.
     *
     * **The first version of this assertion was wrong and is worth recording.**
     * It forbade any "signed" within 40 characters of a decision id, and so it
     * failed on *"blocked at slice 2Q.1 until `OD-2Q-1`, `OD-2Q-3` and
     * `OD-2Q-7` are signed"* — a sentence that says the opposite of the thing
     * being forbidden. A conditional is not a claim, and a guard that cannot
     * tell them apart forces the document to be written around the guard.
     *
     * So the rule is narrowed to the affirmative forms, and a conditional lead
     * disarms them.
     */
    const CONDITIONAL = /\b(until|unless|if|before|once|when|after|require[sd]?|must be|needs? to be|awaiting)\b/i;
    const CLAIM = /(OD-2Q-\d)([^.\n]{0,60}?)\b(is|are|was|were|has been|have been) signed\b/gi;
    for (const path of REQUIRED) {
      const text = read(path);
      for (const line of text.split("\n")) {
        for (const match of line.matchAll(CLAIM)) {
          const lead = line.slice(0, match.index ?? 0) + match[2];
          expect(CONDITIONAL.test(lead), `${path} claims ${match[1]} is signed: ${line.trim()}`).toBe(true);
        }
      }
      expect(text, `${path} uses the "all N signed" shape a signed phase uses`)
        .not.toMatch(/ALL (EIGHT|8) (OF THE )?DECISIONS? SIGNED/i);
    }
  });

  it("that signed-claim rule is two-sided: it admits a conditional and refuses a claim", () => {
    // Without this, the assertion above passes on a document that simply never
    // mentions a decision — and would keep passing if it started claiming one
    // was signed in a shape the regex missed.
    const CONDITIONAL = /\b(until|unless|if|before|once|when|after|require[sd]?|must be|needs? to be|awaiting)\b/i;
    const CLAIM = /(OD-2Q-\d)([^.\n]{0,60}?)\b(is|are|was|were|has been|have been) signed\b/gi;
    const verdict = (line: string): "claim" | "conditional" | "none" => {
      const matches = [...line.matchAll(CLAIM)];
      if (matches.length === 0) return "none";
      const first = matches[0];
      const lead = line.slice(0, first.index ?? 0) + first[2];
      return CONDITIONAL.test(lead) ? "conditional" : "claim";
    };
    expect(verdict("blocked until `OD-2Q-1` and `OD-2Q-7` are signed.")).toBe("conditional");
    expect(verdict("`OD-2Q-1` is signed and the vocabulary widens.")).toBe("claim");
    expect(verdict("`OD-2Q-1` remains open.")).toBe("none");
  });

  it("names a slice, and a dependency where one exists, for every requirement", () => {
    // Refusal: a requirement with no slice. Asserted by requiring each family's
    // heading to name its slice, and each decision-blocked requirement to name
    // the decision inline.
    const prd = read(PRD);
    for (const family of Object.keys(FAMILY_COUNTS)) {
      const heading = prd.split("\n").find((line) => line.includes(`\`2Q-${family}\``) && line.startsWith("### "));
      expect(heading, `family ${family} has no section heading`).toBeDefined();
      expect(heading, `family ${family} names no slice`).toMatch(/slice 2Q\.\d/);
    }
    // Every requirement that names a decision names one that exists.
    for (const match of read(PRD).matchAll(/\*\*Decision:\*\* `(OD-2Q-\d)`/g)) {
      expect(OPEN_DECISIONS as readonly string[]).toContain(match[1]);
    }
  });

  it("proposes exactly one migration, allocates none, and makes a second a stop condition", () => {
    const plan = read(PLAN);
    expect(plan).toMatch(/\*\*Proposed: exactly one\.\*\*/);
    expect(plan, "the migration must name its exclusive destination").toMatch(/2Q-CITE-001/);
    expect(plan, "a second migration must be a stop condition").toMatch(/stop condition/i);
    const decisions = read("docs/DECISIONS.md");
    expect(decisions, "ADR-126 must allocate no migration")
      .toMatch(/the migration budget is PROPOSED, not signed/);
  });

  it("records the authorization, its narrow supersession, and what it refuses", () => {
    const decisions = read("docs/DECISIONS.md");
    const start = decisions.indexOf("## ADR-126");
    expect(start, "ADR-126 is missing").toBeGreaterThan(-1);
    const body = decisions.slice(start);
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "the authorization must be planning-only").toMatch(/authorizes \*\*planning only\*\*/);
    expect(body, "the supersession must be narrow and named in the heading")
      .toMatch(/supersedes ADR-125 Decision 6 alone/);
    expect(body, "and it must be narrow in the decision that carries it")
      .toMatch(/ADR-125 Decision 6 is superseded, and nothing else in ADR-125 is/);
    expect(body, "the priority pendency must not be discharged by being planned")
      .toMatch(/`2P-REVIEW-CITATIONS` is not discharged by being planned/);
    expect(body, "an ADR in this series must not name the successor")
      .not.toMatch(/2R/i);
  });

  it("leaves ADR-125 intact rather than rewritten", () => {
    // The rule this series has been held to since ADR-108: an accepted ADR is
    // not edited into agreement with a later one. ADR-125's own words must still
    // read as they did when signed, including the decision ADR-126 supersedes.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-125 — The owner closes Phase 2P/);
    expect(decisions, "ADR-125 Decision 6 must still say what it said")
      .toMatch(/Decision 6 — no successor phase is started or planned/);
    expect(decisions, "ADR-125's VoiceOver waiver must still read as a waiver, never a pass")
      .toMatch(/Decision 2 — VoiceOver is WAIVED, not passed/);
  });

  it("keeps the inherited remainders classified rather than absorbed", () => {
    const audit = read(AUDIT);
    for (const remainder of [
      "RG-DEP-3",
      "2P-CHAT-007-JOURNEY",
      "2P-MOBILE-002",
      "2P-ACCESS-005",
      "A11Y-WEBKIT-DARK-CONTRAST",
      "2P-REMINDER-RECURRENCE",
      "2P-CALENDAR-MONTH-TELEMETRY",
    ]) {
      expect(audit, `${remainder} is not classified anywhere`).toContain(remainder);
    }
    expect(audit, "RG-DEP-3 must not be closable by writing a file")
      .toMatch(/cannot be closed by writing a file/);
    expect(read(PRD), "VoiceOver must stay waived, never reported as passed")
      .toMatch(/WAIVED, NOT PASSED/);
  });

  it("holds the planning-only absences", () => {
    const reports = join(REPO, "docs/reports/phase-2q");
    const filed = existsSync(reports) ? readdirSync(reports) : [];
    for (const forbidden of [/ACCEPTANCE/i, /TRACEABILITY_MATRIX/i, /CLOSING_REPORT/i, /DEPLOYMENT/i]) {
      expect(filed.filter((name) => forbidden.test(name)), `${forbidden} exists before implementation`)
        .toEqual([]);
    }
    // No Phase 2Q migration, and no product-code file named for it.
    const migrations = readdirSync(join(REPO, "supabase/migrations"));
    expect(migrations.filter((name) => /2q/i.test(name)), "a Phase 2Q migration exists").toEqual([]);
  });

  it("is not vacuous: every extractor above answers differently on a fixture", () => {
    // A guard that would pass on the wrong document is not a guard. Each
    // extractor is driven once over text it must reject.
    expect([..."- **2Q-CITE-001:** x".matchAll(DECLARATION)].length).toBe(1);
    expect([..."- **2Q-CITE-1:** x".matchAll(DECLARATION)].length).toBe(0);
    expect(familyOf("2Q-TRUST-004")).toBe("TRUST");
    expect(indexOf("2Q-TRUST-004")).toBe(4);
    expect(/\*\*Class:\*\* (baseline|construction|not-built-by-rule)/.test("**Class:** built")).toBe(false);
  });
});
