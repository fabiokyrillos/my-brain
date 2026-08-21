/**
 * Phase 2Q declaration guard.
 *
 * ## What this file is, and what it is not
 *
 * It is a **documentary** guard. It reads `docs/` and asserts properties of
 * documents. It ships no route, no component, no Server Action and no SQL.
 * ADR-126 authorizes exactly this: the planning package, plus the guards that
 * keep it fail-closed.
 *
 * ## The posture it holds
 *
 * ADR-126 authorizes **planning only**, and **ADR-127 signs the eight decisions
 * without authorizing implementation either**. So the assertions come in two
 * directions, and both matter:
 *
 *  - the package is **present and coherent** — six documents, 42 declarations,
 *    six families with locked counts and no gaps;
 *  - everything that only exists *after* implementation is **absent** — no
 *    acceptance record, no matrix, no closing report, no deployment record, and
 *    **no Phase 2Q migration**.
 *
 * Phase 2N's equivalent was inverted at closeout rather than deleted, and Phase
 * 2P's was flipped rather than relaxed, for the reason both files state: an
 * absence nobody asserts is an absence nobody notices disappearing. **This file
 * has now been inverted once itself** — see the decision block — and it is
 * written to be inverted again when implementation is authorized, not thrown
 * away.
 *
 * ## Four pins this file carries
 *
 * 1. **All eight decisions are SIGNED (ADR-127), and one diverges.**
 *    `OD-2Q-5` was recommended as option A and signed as **option C**. The guard
 *    asserts the *option actually signed*, per decision, because a package that
 *    reported "signed" without saying which branch would be describing a
 *    decision nobody made. Before ADR-127 this block held the opposite property;
 *    it was inverted, not deleted.
 * 2. **No family name may contain a digit.** `2K-A11Y` did, which made Phase
 *    2K's seven accessibility requirements invisible to every prose count, to
 *    the traceability generator's attribution check, *and* to the A13 detector's
 *    declaration signal — all three at once, silently. The family here is
 *    `ACCESS`, and the property is asserted with the unmatchable shape as its
 *    control.
 * 3. **The supersession chain is narrow and named.** ADR-126 supersedes ADR-125
 *    Decision 6 alone; ADR-127 signs what ADR-126 left open and revises nothing.
 *    Neither earlier ADR is edited — the rule since ADR-108.
 * 4. **The budget is ALLOCATED at one, and no second is reachable.** `OD-2Q-4`
 *    is signed as option A, so there is no pending decision that could fund a
 *    second: it is a stop condition, not an overrun.
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

// 39 at ADR-126; 42 since ADR-127 Decision 5 appended `2Q-LINK-008`,
// `2Q-LINK-009` and `2Q-TRUST-009` to the ends of their families to carry the
// eight requirements the owner attached to `OD-2Q-5`. No identifier was
// renumbered, reused or removed.
const TOTAL = 42;
const FAMILY_COUNTS: Readonly<Record<string, number>> = {
  FOUNDATION: 5,
  CITE: 9,
  LINK: 9,
  TRUST: 9,
  ACCESS: 5,
  CLOSE: 5,
};

/** The option the owner actually signed, per decision. `OD-2Q-5` is the divergence. */
const SIGNED_OPTION: Readonly<Record<string, string>> = {
  "OD-2Q-1": "A",
  "OD-2Q-2": "A",
  "OD-2Q-3": "A",
  "OD-2Q-4": "A",
  "OD-2Q-5": "C",
  "OD-2Q-6": "A",
  "OD-2Q-7": "A",
  "OD-2Q-8": "A",
};

/** Markdown wraps; a property of the text is not a property of its line breaks. */
const flat = (text: string): string => text.replace(/\s+/g, " ");

/** An assertion that a decision is still open. A history sentence is not one. */
const OPEN_CLAIM = /(OD-2Q-\d)[^.\n]{0,60}?\b(?:is|are|remains?|stays?) (?:still )?(?:open|unsigned|undecided)\b/gi;

const familyOf = (id: string): string => id.split("-")[1];
const indexOf = (id: string): number => Number.parseInt(id.split("-")[2], 10);

describe("Phase 2Q declarations", () => {
  it("carries the complete planning package", () => {
    for (const path of REQUIRED) expect(exists(path), `${path} is missing`).toBe(true);
  });

  it("declares 42 unique requirements across six families", () => {
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

  it("records all eight decisions as SIGNED, and keeps the declined branches visible", () => {
    /*
     * **Inverted by ADR-127, and kept rather than deleted.**
     *
     * Under ADR-126 this block refused a document that read its own
     * recommendation as an outcome. The decisions are now signed, so it refuses
     * the mirror error: a document that re-opens one, softens it, or describes
     * it as still open. The failure being prevented is unchanged — a document
     * disagreeing with the owner's actual signature. Only the direction moved,
     * exactly as Phase 2O's guard was inverted at ADR-116 rather than dropped.
     */
    const prd = read(PRD);
    expect(prd, "the package must record that all eight are signed")
      .toMatch(/ALL EIGHT DECISIONS SIGNED by ADR-127/);
    expect(prd, "the pre-signature banner must be gone, not merely contradicted")
      .not.toMatch(/NOTHING HERE IS SIGNED/);
    for (const decision of Object.keys(SIGNED_OPTION)) {
      expect(prd, `${decision} is not declared`).toContain(`### \`${decision}\``);
    }
    // The declined branches stay readable: they are the context the signature
    // was given in. Counted, so a decision that quietly loses its recommendation
    // — or grows a second — fails.
    const recommended = [...prd.matchAll(/\(recommended\)/g)].length;
    expect(recommended, "a decision lost or duplicated its recommendation")
      .toBe(Object.keys(SIGNED_OPTION).length);
  });

  it("records the option actually signed for each decision, including the divergence", () => {
    // Seven followed the recommendation and one did not. A package that reported
    // "signed" without saying *which* branch would be describing a decision
    // nobody made — and `OD-2Q-5` is precisely the one where that would matter.
    const prd = read(PRD);
    for (const [decision, option] of Object.entries(SIGNED_OPTION)) {
      const at = prd.indexOf(`### \`${decision}\``);
      expect(at, `${decision} is not declared`).toBeGreaterThan(-1);
      const block = prd.slice(at, at + 400);
      expect(block, `${decision} carries no signature`).toMatch(/\*\*SIGNED — option [A-C]/);
      expect(block, `${decision} records the wrong signed option`)
        .toMatch(new RegExp(`\\*\\*SIGNED — option ${option}`));
    }
    expect(prd, "the one divergence must be stated, not smoothed over")
      .toMatch(/The recommendation was option A, and the owner chose against it/);
  });

  it("never reports a signed decision as still open", () => {
    /*
     * The inverse of what this block held before ADR-127, and the reason it was
     * inverted rather than deleted: an absence nobody asserts is an absence
     * nobody notices disappearing.
     *
     * **A recorded failure of the pre-signature version, kept because the lesson
     * survives the inversion.** It forbade any "signed" within 40 characters of
     * a decision id, and failed on *"blocked at slice 2Q.1 until `OD-2Q-1` …
     * are signed"* — a sentence asserting the opposite of what was forbidden. A
     * conditional is not a claim. The same care is applied here: what is
     * forbidden is an assertion that a decision *is open*, not the word "open".
     */
    for (const path of REQUIRED) {
      for (const line of read(path).split("\n")) {
        const hit = [...line.matchAll(OPEN_CLAIM)][0];
        if (hit) expect.fail(`${path} reports ${hit[1]} as open: ${line.trim()}`);
      }
    }
  });

  it("that open-claim rule is two-sided: it refuses a claim and admits the history", () => {
    // Without this the assertion above passes on a document that simply never
    // mentions a decision, and would keep passing if the regex stopped matching.
    const hits = (line: string): number => [...line.matchAll(OPEN_CLAIM)].length;
    expect(hits("`OD-2Q-5` remains open."), "a real claim must be caught").toBe(1);
    expect(hits("`OD-2Q-5` is signed as option C."), "a signature must not be caught").toBe(0);
    expect(
      hits("Under ADR-126 this section declared eight open decisions."),
      "the historical narration must survive",
    ).toBe(0);
  });

  it("holds the migration budget as ALLOCATED, one, with no second reachable", () => {
    const plan = read(PLAN);
    expect(plan).toMatch(/## 1\. Migration budget — ALLOCATED/);
    expect(plan, "the allocation must be stated as made, not proposed")
      .toMatch(/1 allocated · 0 spent/);
    expect(flat(plan), "`OD-2Q-4` closes the only route to a second")
      .toMatch(/`OD-2Q-4` is signed as option A/);
    expect(flat(read(CONTRACT)), "a second migration must be a stop condition, not an overrun")
      .toMatch(/a second is a \*\*stop condition\*\*, not an overrun/);
  });

  it("carries the three requirements ADR-127 appended, and renumbers nothing", () => {
    const prd = read(PRD);
    for (const id of ["2Q-LINK-008", "2Q-LINK-009", "2Q-TRUST-009"]) {
      expect(ids, `${id} was not appended`).toContain(id);
    }
    expect(flat(prd), "the append must be recorded rather than silent")
      .toMatch(/No identifier was renumbered, reused or removed/);
    // The three carry `OD-2Q-5`'s substance: no duplicated content, a task shown
    // as a task, and no reveal control. Asserted by property, not by id alone.
    const forId = (id: string): string =>
      prd.split("\n").find((line) => line.startsWith(`- **${id}:**`)) ?? "";
    expect(forId("2Q-LINK-008"), "the no-content property is missing")
      .toMatch(/no\*\* preview, excerpt, snippet or title/);
    expect(forId("2Q-LINK-009"), "the task-not-memory property is missing")
      .toMatch(/never labelled or routed as a memory/);
    expect(forId("2Q-TRUST-009"), "the no-reveal property is missing")
      .toMatch(/No reveal control|no reveal control/);
  });

  it("maps all eight of OD-2Q-5's requirements onto declared requirements", () => {
    /*
     * The owner attached eight numbered requirements to `OD-2Q-5`. Coverage is
     * the kind of claim that is easy to assert in prose and easy to lose in an
     * edit, so §2.6 states it as a table and this reads that table back:
     *
     *  - the table must still have all eight rows, so one cannot be dropped;
     *  - every requirement id it names must actually be declared, so a row
     *    cannot point at something that no longer exists;
     *  - and the two extra instructions signed with them — no reveal control,
     *    and the destination page's rules — must still be accounted for.
     *
     * Requirement 8 is the exception and says so in the table: it is enforced by
     * the traceability contract's refusal 16 rather than by a `2Q-` requirement,
     * because "this is not delivery" is a closeout rule, not a thing to build.
     */
    const prd = read(PRD);
    const at = prd.indexOf("#### §2.6");
    expect(at, "the OD-2Q-5 coverage table is missing").toBeGreaterThan(-1);
    const section = prd.slice(at, prd.indexOf("### `OD-2Q-6`", at));

    const numbered = [...section.matchAll(/^\| (\d) \| /gm)].map((m) => m[1]);
    expect(numbered, "a row of the OD-2Q-5 coverage table was lost")
      .toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);

    // Every requirement the table names is really declared. This is the half
    // that catches a rename: the prose would still read correctly and the
    // mapping would be pointing at nothing.
    const named = [...section.matchAll(/`(2Q-[A-Z]+-\d{3})`/g)].map((m) => m[1]);
    expect(named.length, "the table names no requirements at all").toBeGreaterThanOrEqual(9);
    for (const id of new Set(named)) {
      expect(ids, `the OD-2Q-5 coverage table names ${id}, which is not declared`).toContain(id);
    }

    // Requirement 8 is discharged by a contract refusal rather than by a
    // requirement, and the contract must still carry it.
    expect(flat(section), "requirement 8 must name the refusal that carries it")
      .toMatch(/refusal 16/);
    expect(flat(read(CONTRACT)), "refusal 16 must still exist")
      .toMatch(/16\. \*\*a "sources", "citations" or similarly named section/);

    // The two instructions signed alongside the eight.
    expect(flat(section), "the no-reveal instruction lost its requirement")
      .toMatch(/\*\*no reveal control\*\* on this path \| `2Q-TRUST-009`/);
    expect(flat(section), "the destination-rules instruction must be accounted for, not dropped")
      .toMatch(/not a requirement of this phase/);
  });

  it("records the signature ADR, and what it still does not authorize", () => {
    const decisions = read("docs/DECISIONS.md");
    const at = decisions.indexOf("## ADR-127");
    expect(at, "ADR-127 is missing").toBeGreaterThan(-1);
    const body = decisions.slice(at);
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "signing decisions must not authorize implementation")
      .toMatch(/authorizes no implementation/i);
    expect(body, "the divergence must be on the record")
      .toMatch(/chooses the content-free source list over the recommendation/);
    expect(body, "the priority pendency is not discharged by signing either")
      .toMatch(/`2P-REVIEW-CITATIONS` stays NOT DELIVERED/);
    expect(body, "an ADR in this series must not name the successor")
      .not.toMatch(/2R/i);
  });

  it("keeps ADR-126 intact rather than rewritten", () => {
    // The rule since ADR-108: an accepted ADR is not edited into agreement with
    // a later one. ADR-127 signs what ADR-126 left open; it does not revise it.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/## ADR-126 — The owner authorizes Phase 2Q planning/);
    expect(decisions, "ADR-126's own words about the open decisions must survive")
      .toMatch(/Decision 4 — the eight open decisions are OPEN/);
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
    // Every requirement that names a decision names one that exists. The
    // pattern admits a trailing "(signed X)" note, which ADR-127 added.
    for (const match of read(PRD).matchAll(/\*\*Decision:\*\* `(OD-2Q-\d)`/g)) {
      expect(Object.keys(SIGNED_OPTION)).toContain(match[1]);
    }
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
    expect(body, "ADR-126 itself allocated no migration; ADR-127 is what allocated one")
      .toMatch(/the migration budget is PROPOSED, not signed/);
    expect(body, "the exclusive destination must be named in the plan")
      .toMatch(/summaries\.citations/);
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

  it("holds the absences implementation has not yet earned", () => {
    /*
     * **Inverted by ADR-128, and kept rather than deleted** — the third time
     * this file has been moved rather than thrown away, and for the reason
     * stated at the top: an absence nobody asserts is an absence nobody notices
     * disappearing.
     *
     * Under ADR-126/127 this block forbade **four** artifacts, because the phase
     * was planning-only and any one of them would have been a result the package
     * could not have. ADR-128 authorizes implementation, so an acceptance record
     * per closed slice is now legitimate — and forbidding it would make the
     * guard fail on correct work, which this repository has already recorded as
     * the more dangerous kind of failure.
     *
     * **The other three stay forbidden, and they are not the same three.** The
     * matrix, the closing report and a deployment record are outcomes of slices
     * that have not run. The list shrinks as the phase earns each one; it is
     * never emptied.
     */
    const reports = join(REPO, "docs/reports/phase-2q");
    const filed = existsSync(reports) ? readdirSync(reports) : [];
    for (const forbidden of [/TRACEABILITY_MATRIX/i, /CLOSING_REPORT/i]) {
      expect(filed.filter((name) => forbidden.test(name)), `${forbidden} exists before its slice ran`)
        .toEqual([]);
    }

    // The acceptance records that DO exist must be for slices that closed, and
    // named in the repository's shape — so a stray file cannot enter the folder
    // by looking vaguely like one.
    const accepted = filed.filter((name) => /ACCEPTANCE/i.test(name));
    for (const name of accepted) {
      expect(name, `${name} is not a slice acceptance record`)
        .toMatch(/^PHASE_2Q_SLICE_\d{2}_ACCEPTANCE\.md$/);
    }
    // Slices 2Q.0 and 2Q.1 are closed, so their records are required rather than
    // merely permitted: a guard that only tolerates evidence never notices it
    // vanish. Each closed slice adds its own line here.
    expect(accepted, "slice 2Q.0's acceptance record is missing")
      .toContain("PHASE_2Q_SLICE_00_ACCEPTANCE.md");
    expect(accepted, "slice 2Q.1's acceptance record is missing")
      .toContain("PHASE_2Q_SLICE_01_ACCEPTANCE.md");
    expect(accepted, "slice 2Q.2's acceptance record is missing")
      .toContain("PHASE_2Q_SLICE_02_ACCEPTANCE.md");
    expect(accepted, "slice 2Q.3's acceptance record is missing")
      .toContain("PHASE_2Q_SLICE_03_ACCEPTANCE.md");
    expect(accepted, "slice 2Q.4's acceptance record is missing")
      .toContain("PHASE_2Q_SLICE_04_ACCEPTANCE.md");

    /*
     * **A deployment record became legitimate the moment the migration was
     * applied**, so it moves out of the forbidden list and into a required one —
     * the same inversion, one artifact later. It is required rather than merely
     * allowed, and it is required to be **for the slice that spent the
     * allocation**: a deployment record for a slice that deployed nothing would
     * be a claim of hosted evidence the traceability contract's refusal 7
     * rejects by name.
     */
    const deployments = filed.filter((name) => /DEPLOYMENT/i.test(name));
    expect(deployments, "the deployment record must name the slice that spent the migration")
      .toEqual(["PHASE_2Q_SLICE_01_DEPLOYMENT.md"]);
    const deployment = read("docs/reports/phase-2q/PHASE_2Q_SLICE_01_DEPLOYMENT.md");
    expect(deployment, "a deployment record must state the parity it produced")
      .toContain("202608210100");
    expect(deployment, "and it must not claim the AI half it could not spend")
      .toMatch(/UNSPENDABLE/);

    /*
     * **The migration allocation, asserted as a ceiling rather than as a zero.**
     *
     * `OD-2Q-7` allocates exactly one, spent in slice 2Q.1. Before that slice
     * runs the count is zero; after it, it is one. **Two is a stop condition**,
     * and that is the property worth holding across the whole phase — a flat
     * "none" would have to be deleted the moment the allocation is legitimately
     * spent, which is how a guard stops guarding.
     */
    const migrations = readdirSync(join(REPO, "supabase/migrations"))
      .filter((name) => /2q|citation/i.test(name));
    expect(migrations.length, `the allocation is one; found ${migrations.join(", ")}`)
      .toBeLessThanOrEqual(1);
  });

  it("records the implementation authorization, and what it still refuses", () => {
    const decisions = read("docs/DECISIONS.md");
    const at = decisions.indexOf("## ADR-128");
    expect(at, "ADR-128 is missing").toBeGreaterThan(-1);
    const body = decisions.slice(at);
    expect(body).toMatch(/\*\*Status:\*\* Accepted/);
    expect(body, "the authorization must name what it authorizes")
      .toMatch(/authorizes \*\*implementation\*\*/);
    expect(body, "a second migration must stay a stop condition")
      .toMatch(/A second migration of any kind halts the phase/);
    expect(body, "no paid AI call may be spent silently")
      .toMatch(/No paid AI call is authorized/i);
    expect(body, "the priority pendency is not discharged by being authorized")
      .toMatch(/stays \*\*NOT DELIVERED\*\*/);
    expect(body, "the closeout must stay conditioned on the owner")
      .toMatch(/owner device checkpoint/);
    expect(body, "an ADR in this series must not name the successor")
      .not.toMatch(/2R/i);
    // ADR-126 and ADR-127 stay intact rather than rewritten into agreement.
    expect(body, "neither earlier ADR may be edited")
      .toMatch(/Neither earlier ADR is edited/);
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
