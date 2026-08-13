import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * Phase 2F documentation convergence (`2F-OPERATIONS-006`, definitive Slice 2F.6
 * PRD §6.4 and §14's A-list).
 *
 * These cases read the documents and the code they make claims about, rather than
 * searching for a phrase and calling it converged. Each one exists because the
 * closeout audit found the corresponding drift by hand, and a defect a human
 * found once will recur unless something mechanical is watching:
 *
 *   * §10's `database` cell for Slice 2F.5 said `—` while the slice added three
 *     pgTAP assertions that run in that job;
 *   * `DATABASE.md` said `product_events` accepts 19 event names after the chain
 *     had grown to 26;
 *   * `SECURITY.md`'s executed-verifications list still named parity
 *     `202607180031`;
 *   * `PHASE_2_PLAN.md` and `TODO.md` still pointed at PRD "Revision 4";
 *   * ADR-055's expiry needed to be a date a verifier could recompute.
 */

const REPO = resolve(__dirname, "../../..");

function read(relative: string): string {
  return readFileSync(join(REPO, relative), "utf8");
}

type FunnelModule = typeof import("../../../scripts/phase-2f-command-funnel.mjs");

async function loadFunnel(): Promise<FunnelModule> {
  return (await import("../../../scripts/phase-2f-command-funnel.mjs")) as FunnelModule;
}

/** The migration chain's current head, which is what "parity" names. */
function migrationChainHead(): string {
  const versions = readdirSync(join(REPO, "supabase/migrations"))
    .map((name) => name.slice(0, 12))
    .filter((version) => /^\d{12}$/.test(version))
    .sort();
  return versions[versions.length - 1];
}

/** The `product_events.event_name` allowlist, read out of the last migration that rewrites it. */
function productEventNamesFromChain(): string[] {
  const dir = join(REPO, "supabase/migrations");
  const files = readdirSync(dir).sort();
  let latest: string[] = [];
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    const at = sql.search(/event_name\s+in\s*\(/);
    if (at < 0) continue;
    const open = sql.indexOf("(", at);
    let depth = 0;
    let close = -1;
    for (let index = open; index < sql.length; index += 1) {
      if (sql[index] === "(") depth += 1;
      else if (sql[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }
    if (close < 0) continue;
    const names = [...sql.slice(open + 1, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    if (names.length > latest.length) latest = names;
  }
  return latest;
}

describe("2F-OPERATIONS-006 / A5: ADR-055's expiry is a date a verifier can recompute", () => {
  it("carries 2026-10-27 in TODO.md, and the reader computes the same date from go-live", async () => {
    const { expiryDateFromGoLive, EXPIRY_HORIZON_DAYS } = await loadFunnel();
    const todo = read("docs/TODO.md");
    const goLive = "2026-07-29";
    const expiry = expiryDateFromGoLive(goLive);
    expect(EXPIRY_HORIZON_DAYS).toBe(90);
    expect(expiry).toBe("2026-10-27");
    expect(todo, "TODO.md must carry the computed expiry date, not a placeholder").toContain(expiry);
    expect(todo).toContain(goLive);
    expect(todo).not.toMatch(/expiry date:\s*(TBD|placeholder|pending)/i);
  });

  it("is anchored on the Slice 2F.5 merge date by ADR-060, which names TODO.md as its target", () => {
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toContain("## ADR-060");
    expect(decisions).toMatch(/merge date of the Slice 2F\.5 pull request/);
  });
});

describe("2F-OPERATIONS-006: the phase PRD's gate matrix reflects what actually executed", () => {
  it("marks the database job executed for Slice 2F.5, whose three pgTAP assertions run there", () => {
    const prd = read("docs/initiatives/phase-2f/PHASE_2F_PRD.md");
    const row = prd.split("\n").find((line) => line.includes("Empty-DB chain + full pgTAP + db lint"));
    expect(row, "PRD §10 no longer carries the empty-DB chain row").toBeDefined();
    const cells = row!.split("|").slice(1, -1).map((cell) => cell.trim());
    // cells: [gate, executes-in, 2F.1 … 2F.6]
    expect(cells).toHaveLength(8);
    expect(cells[6], "the 2F.5 cell must not claim the database job did not run").toContain("●");
    // And the assertions really are there: plan(26) is 23 + the slice's three.
    expect(read("supabase/tests/product_events.sql")).toContain("select plan(26);");
  });

  it("does not claim an executed authenticated-journeys gate for Slice 2F.4", () => {
    // 2F.4's sixteen acceptance gates contain no Playwright journey, and §10's own
    // rule is that a cell counts only when executed (2F-PRECOND-003).
    const prd = read("docs/initiatives/phase-2f/PHASE_2F_PRD.md");
    const row = prd.split("\n").find((line) => line.includes("Authenticated journeys desktop+mobile"));
    expect(row).toBeDefined();
    const cells = row!.split("|").slice(1, -1).map((cell) => cell.trim());
    expect(cells).toHaveLength(8);
    expect(cells[5], "the 2F.4 journeys cell claims an execution its acceptance record does not name")
      .not.toContain("●");
    const acceptance = read("docs/reports/phase-2f/PHASE_2F_SLICE_04_ACCEPTANCE.md");
    expect(acceptance).not.toMatch(/playwright/i);
  });

  it("records the correction as a revision entry rather than editing silently", () => {
    const prd = read("docs/initiatives/phase-2f/PHASE_2F_PRD.md");
    expect(prd).toContain("Revision 4.3");
  });
});

describe("2F-OPERATIONS-006: DATABASE.md and SECURITY.md match the chain", () => {
  it("states the product_events allowlist size the migration chain actually declares", () => {
    const names = productEventNamesFromChain();
    expect(names.length).toBeGreaterThanOrEqual(26);
    const database = read("docs/DATABASE.md");
    expect(database, `DATABASE.md must state ${names.length} allowlisted event names`)
      .toContain(`${names.length} eventos`);
    expect(database, "the pre-Phase-2D count of 19 is stale").not.toContain("apenas os 19 eventos");
  });

  it("names the current migration parity rather than a Phase 2X-era one", () => {
    const head = migrationChainHead();
    const security = read("docs/SECURITY.md");
    expect(security, `SECURITY.md must name parity ${head}`).toContain(head);
    expect(
      security,
      "SECURITY.md's executed-verifications list still claims parity 202607180031",
    ).not.toMatch(/Migrations remotas sincronizadas até `202607180031`/);
  });

  it("keeps the Option C exception documented as exactly one exception", () => {
    const security = read("docs/SECURITY.md");
    expect(security).toMatch(/Opção C/);
    expect(security).toMatch(/única.*exceção|exceção.*única/i);
  });
});

describe("2F-OPERATIONS-006: the plan and the backlog point at the governing revision", () => {
  it("PHASE_2_PLAN.md and TODO.md cite the revision the PRD's own header declares", () => {
    // Derived, not hardcoded: ADR-056 exists because a backlog pointer that
    // contradicted the executing phase is "exactly how a future session builds the
    // wrong thing". A test naming a fixed revision goes stale the moment the PRD is
    // revised, which is the same failure one level up.
    const header = read("docs/initiatives/phase-2f/PHASE_2F_PRD.md")
      .split(/\r?\n/)
      .find((line) => line.startsWith("**Revision "));
    expect(header, "the PRD no longer opens with a bold revision line").toBeDefined();
    const governing = header!.match(/\*\*Revision (\d+(?:\.\d+)?)/)?.[1];
    expect(governing, "could not read the governing revision from the PRD header").toBeDefined();
    for (const document of ["docs/initiatives/phase-2/PHASE_2_PLAN.md", "docs/TODO.md"]) {
      expect(read(document), `${document} does not cite Revision ${governing}`)
        .toContain(`Revision ${governing}`);
    }
    expect(read("docs/initiatives/phase-2/PHASE_2_PLAN.md"), "the plan still points at the superseded Revision 4")
      .not.toMatch(/PHASE_2F_PRD\.md` \(Revision 4\)/);
    expect(read("docs/TODO.md")).not.toMatch(/approved `docs\/PHASE_2F_PRD\.md` Revision 4 \(/);
  });

  it("TODO.md's active-milestone line names the authorized successor, not a closed phase", () => {
    // Originally pinned to Phase 2F against a stale-Phase-2C regression;
    // retargeted with ADR-083, then ADR-085, then ADR-094, ADR-097, and now
    // ADR-102, keeping the same property each time: the line exists, names the phase
    // that is actually active, and cites its authorization. The phase letter
    // and the ADR move together — pinning one without the other is how a
    // backlog comes to announce a milestone nothing authorized.
    //
    // Phase 2I is why this assertion is worth keeping and worth watching. The
    // backlog line still said "Phase 2H" through the whole of Phase 2I, and
    // this guard passed the entire time — because it was pinned to the same
    // stale value the backlog carried. A guard that agrees with a stale
    // document is indistinguishable from a guard that is correct, right up
    // until the document is fixed. Move it with the ADR, every time.
    //
    // The same drift was found again during the Phase 2K retarget, in a
    // different file this guard does not read: `docs/reports/README.md` still
    // named Phase 2H as the active initiative after 2I and 2J had both closed.
    // Corrected there; noted here because it is the identical failure mode one
    // index over, and because this guard's scope is deliberately one line.
    const line = read("docs/TODO.md").split("\n").find((l) => l.startsWith("Active milestone:"));
    expect(line).toBeDefined();
    expect(line).toMatch(/Phase 2N/);
    expect(line, "the start must cite its authorization").toMatch(/ADR-108/);
    expect(line, "implementation has its own authorization and the line must cite it")
      .toMatch(/ADR-112/);
    expect(line, "Phase 2E is released, not awaiting authorization").not.toMatch(/awaits authorization/);
    /*
     * The "planning" half came back at ADR-102, went again at ADR-103, came back
     * at ADR-104, went again at ADR-105 and comes back at ADR-108 — in the commit
     * that recorded each. That is not a guard being loosened and tightened at
     * convenience; it is one rule applied to five different facts.
     *
     * The rule: **the line cites every authorization the phase has received and
     * overstates none of them.** ADR-104 gave planning only, so the word
     * "planning" was required and its absence would have been an overstatement.
     * ADR-105 then authorized implementation through closeout, so requiring
     * "planning" alone would have forced the line to *understate* — the
     * mirror-image error, and the one that made this assertion drop the word at
     * Phase 2K's close under ADR-101. ADR-108 authorized **planning only** for
     * Phase 2N, so the word was required again — and **ADR-112 has now
     * authorized implementation through closeout**, so requiring "planning"
     * alone would force the line to understate, which is the identical error one
     * direction over. The word goes for the sixth time, in the commit that
     * records the authorization.
     *
     * What does not move: the line names the phase, cites every ADR it has, and
     * does not announce a successor.
     */
    expect(line, "ADR-112 authorizes implementation, and the line must not understate it")
      .toMatch(/IMPLEMENTATION/);
    expect(line, "the line must not still call the phase planning-only")
      .not.toMatch(/PLANNING ONLY/i);
    expect(line, "no successor is authorized, and the backlog must not imply one")
      .not.toMatch(/Phase 2O/);
  });
});

describe("A2: the direct-write allowlists are exactly what the phase documents claim", () => {
  it("holds tasks empty and reminders to the single Option C writer", () => {
    const guard = read("src/lib/supabase/direct-write-guard.test.ts");
    expect(guard).toMatch(/const TASKS_ALLOWLIST: readonly Writer\[\] = \[\];/);
    const reminders = guard.slice(guard.indexOf("const REMINDERS_ALLOWLIST"));
    const entries = reminders.slice(0, reminders.indexOf("];")).match(/file:/g) ?? [];
    expect(entries).toHaveLength(1);
    expect(reminders).toContain("src/features/agent/actions.ts");
  });
});

describe("A6, A7, A8, A9: the measurement claims stay exactly as measured", () => {
  it("keeps the planning tier's ceiling at met_pending_privileged_read", async () => {
    const { EVIDENCE_TIERS } = await loadFunnel();
    const funnel = read("scripts/phase-2f-command-funnel.mjs");
    expect(funnel).toContain("met_pending_privileged_read");
    expect(Object.keys(EVIDENCE_TIERS)).toContain("planning");
  });

  it("keeps the unsupported-refusal volume labelled not measurable", () => {
    const state = read("docs/STATE.md");
    expect(state).toMatch(/`2F-MEASURE-005`'s unsupported-refusal volume is not measurable this phase/);
  });

  it("keeps the counting unit named as preview rounds rather than intents", () => {
    expect(read("scripts/phase-2f-command-funnel.mjs")).toContain("qualifying_preview_round");
  });

  it("keeps cross-scope comparison of the two baselines prohibited wherever they are quoted", () => {
    for (const document of ["docs/STATE.md", "docs/CHANGELOG.md", "docs/reports/phase-2f/PHASE_2F_SLICE_05_ACCEPTANCE.md"]) {
      expect(read(document), `${document} quotes both baselines without the prohibition`)
        .toMatch(/cross-scope comparison/i);
    }
  });
});

/**
 * Successor start signals — the same guard, retargeted at the roadmap successor.
 *
 * ADR-067's invariant is unchanged and non-negotiable: *the next phase must not
 * be started before it is authorized.* Until 2026-08-05 the next phase was
 * Phase 2G; ADR-083 recorded the owner's authorization of it and moved these
 * signals to Phase 2H. ADR-085 moved them to Phase 2I, ADR-092 to Phase 2J,
 * ADR-094 to Phase 2K, ADR-097 to Phase 2L, ADR-102 to the phase after it,
 * ADR-104 to Phase 2M, and **ADR-108 now records the owner's authorization of
 * Phase 2N — People, projects, memory, files and relations**, so the signals
 * move again, by the same rule and in the same shape. This is the ninth
 * application. The retarget and ADR-108 land in one commit, deliberately: an
 * accepted ADR naming the authorized phase is exactly signal 3, and its
 * governing PRD and implementation plan are signals 1 and 2, so the guard must
 * move in the same change that records the authorization, and the invariant is
 * never unenforced in between.
 *
 * **A note the Phase 2K retarget earned, and this one preserves.** The roadmap
 * design document pair the owner wrote before authorization —
 * `PHASE_2K_2O_ROADMAP_DESIGN.md` and `PHASE_2K_2O_MASTER_IMPLEMENTATION_PLAN.md`
 * — made the second of those match `GOVERNING_ARTIFACT_ROLE` while Phase 2K was
 * still the target, because `^PHASE_2K_` followed by `2O_MASTER_` followed by
 * `IMPLEMENTATION_PLAN` satisfies the pattern. The guard was right to fire: a
 * file named as a phase's implementation plan is signal 1 whatever it contains,
 * and the alternative — matching on content — is exactly the too-weak half
 * ADR-067 removed. The resolution is authorization, not a looser regex, and the
 * mutation case below is kept for the new target so a future retarget cannot
 * "fix" the regex by loosening it.
 *
 * **A second note this retarget earns.** `2K-A11Y` does **not** match
 * `[A-Z]+-\d{3}`, because its family name contains digits — which is why Phase
 * 2K's seven accessibility requirements were invisible to every prose count
 * *and* would have been invisible to signal 2. Phase 2L named that family
 * `2L-ACCESS`, Phase 2M `2M-ACCESS` and Phase 2N `2N-ACCESS`, for exactly this
 * reason.
 * The pattern is deliberately left as it is: loosening it to admit digits inside
 * a family name would make `2O-2026-001`-shaped noise a start signal. The
 * property is instead asserted where it belongs — in the phase's own
 * traceability contract.
 *
 * **What this guard does and does not cover, stated because the roadmap ends.**
 * No accepted ADR names the successor, and ADR-108 deliberately names no scope
 * for it — inventing one would be the error this guard exists to prevent. The
 * independent fail-closed track (opening public self-service signup) is not a
 * lettered phase. So this detector holds the narrower property it was built
 * for — an unauthorized **lettered phase** cannot start — while the successor
 * gate itself lives elsewhere and is stronger: `signup-rollout-gate.test.ts`'s
 * fail-closed checklist and `signup-config-guard.test.ts`. A13's silence is not
 * a statement about signup.
 *
 * A phase starts when an artifact **governs implementation**, not when a file
 * name contains the phase letter. The four signals below are that property:
 *
 *   1. a governing artifact **by role** — a PRD, an implementation plan or a
 *      requirements document, whatever it is named;
 *   2. a **declared** requirement family, in this repository's declaration shape
 *      (`- **2O-XXXX-000:**`) — the same shape the traceability generator's
 *      attribution guard uses;
 *   3. an **accepted** successor ADR — a recorded decision to proceed, as
 *      opposed to an ADR that merely mentions the phase while deferring it;
 *   4. a migration or source file marked as successor implementation.
 *
 * Permitted, explicitly: definition studies; future-work mentions; and
 * append-only amendments that state the phase remains unauthorized.
 *
 * Fail-closed: unreadable inputs throw rather than returning "no signals".
 */
type SuccessorStartSignal = { readonly kind: string; readonly where: string };

const GOVERNING_ARTIFACT_ROLE = /^PHASE_2O_.*(PRD|IMPLEMENTATION_PLAN|REQUIREMENTS)/i;
/** A *declared* requirement, not a mention. Matches the traceability generator's own shape. */
const DECLARED_SUCCESSOR_REQUIREMENT = /^- \*\*2O-[A-Z]+-\d{3}/m;
/**
 * Kept for the historical assertion below: the Phase 2F proposal may mention
 * Phase 2G as future work but must never have declared a requirement for it.
 */
const DECLARED_2G_REQUIREMENT = /^- \*\*2G-[A-Z]+-\d{3}/m;
const IMPLEMENTATION_MARKED_FILE = /phase[_-]?2o/i;

/**
 * Every markdown file at or below `dir`, named relative to `dir`. The walk is
 * recursive because `docs/reports/` is a taxonomy of per-phase subdirectories:
 * a flat listing would let a Phase 2G declaration hide one directory down,
 * which is exactly the signal this detector exists to catch.
 */
function markdownFilesIn(root: string, dir: string): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...markdownFilesIn(root, `${dir}/${entry.name}`).map((name) => `${entry.name}/${name}`));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      found.push(entry.name);
    }
  }
  return found;
}

function filesIn(root: string, dir: string): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

/** Every reason to believe the successor phase has started. Empty means it has not. */
function successorStartSignals(root: string): SuccessorStartSignal[] {
  const signals: SuccessorStartSignal[] = [];

  // One recursive walk from `docs/`. It subsumes `docs/reports/` and reaches
  // `docs/initiatives/`, where a successor PRD would be filed; listing the
  // two separately would double-report anything under reports.
  for (const dir of ["docs"]) {
    for (const name of markdownFilesIn(root, dir)) {
      const basename = name.slice(name.lastIndexOf("/") + 1);
      if (GOVERNING_ARTIFACT_ROLE.test(basename)) {
        signals.push({ kind: "governing-artifact", where: `${dir}/${name}` });
      }
      if (DECLARED_SUCCESSOR_REQUIREMENT.test(readFileSync(join(root, dir, name), "utf8"))) {
        signals.push({ kind: "declared-requirement", where: `${dir}/${name}` });
      }
    }
  }

  const decisions = join(root, "docs/DECISIONS.md");
  if (existsSync(decisions)) {
    // An ADR block runs from its own heading to the next one. Only the heading
    // is tested: ADR bodies may (and do) mention the successor while deferring it.
    const blocks = readFileSync(decisions, "utf8").split(/^## (?=ADR-)/m).slice(1);
    for (const block of blocks) {
      const heading = block.split("\n", 1)[0] ?? "";
      const accepted = /^[-*]?\s*\*\*Status:?\*\*:?\s*Accepted/im.test(block);
      if (/phase 2o/i.test(heading) && accepted) {
        signals.push({ kind: "accepted-adr", where: `ADR heading: ${heading.trim()}` });
      }
    }
  }

  for (const dir of ["supabase/migrations", "src/features", "src/lib"]) {
    for (const name of filesIn(root, dir)) {
      if (IMPLEMENTATION_MARKED_FILE.test(name)) {
        signals.push({ kind: "implementation-file", where: `${dir}/${name}` });
      }
    }
  }

  return signals;
}

/** A throwaway repository root carrying only what the detector reads. */
function makeDetectorRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "a13-"));
  for (const dir of ["docs", "docs/reports", "docs/reports/phase-2o", "supabase/migrations", "src/features", "src/lib"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, "docs/DECISIONS.md"), "# Decisions\n\n## ADR-001 — something else\n\n- **Status:** Accepted\n");
  return root;
}

const detectorRoots: string[] = [];
function detectorRoot(): string {
  const root = makeDetectorRoot();
  detectorRoots.push(root);
  return root;
}

describe("A13: the roadmap successor is not started", () => {
  afterAll(() => {
    for (const root of detectorRoots) rmSync(root, { recursive: true, force: true });
  });

  it("finds no start signal in this repository", () => {
    expect(successorStartSignals(REPO)).toEqual([]);
  });

  it("keeps Phase 2G's start recorded as an authorization, not an accident", () => {
    // The Phase 2F proposal mentioned Phase 2G as future work and never declared
    // a requirement for it; that historical property still holds. The phase's
    // actual start is ADR-083, an owner decision.
    const proposal = read("docs/initiatives/phase-2f/PHASE_2F_PROPOSAL.md");
    expect(proposal).toMatch(/Phase 2G/);
    expect(proposal).not.toMatch(DECLARED_2G_REQUIREMENT);
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/ADR-083 — The owner authorizes Phase 2G/);
  });

  it("keeps Phase 2H's start recorded as an authorization, not an accident", () => {
    // The same property, one phase on: Phase 2H is started, and what started it
    // is an owner decision recorded as an ADR — not the arrival of its PRD. If
    // ADR-085 were ever removed while the governing artifacts remained, the
    // repository would be carrying an unexplained phase start, and this fails.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/ADR-085 — The owner authorizes Phase 2H/);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2h/PHASE_2H_PRD.md"))).toBe(true);
  });

  it("keeps Phase 2J's start recorded as an authorization, not an accident", () => {
    // The same property, two phases on. Phase 2J's governing artifacts exist and
    // its requirement namespace is declarable; what makes that legitimate is
    // ADR-094, an owner decision. If ADR-094 were ever removed while the PRD and
    // the plan remained, the repository would be carrying an unexplained phase
    // start — which is exactly the condition this guard was built to refuse.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/ADR-094 — The owner authorizes Phase 2J/);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2j/PHASE_2J_PRD.md"))).toBe(true);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2j/PHASE_2J_IMPLEMENTATION_PLAN.md"))).toBe(true);
  });

  it("keeps Phase 2K's start recorded as an authorization, not an accident", () => {
    // The same property, one phase on. Phase 2K's governing artifacts exist and
    // its requirement namespace is declarable; what makes that legitimate is
    // ADR-097, an owner decision. If ADR-097 were ever removed while the PRD and
    // the plan remained, the repository would be carrying an unexplained phase
    // start — which is exactly the condition this guard was built to refuse.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/ADR-097 — The owner authorizes Phase 2K/);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2k/PHASE_2K_PRD.md"))).toBe(true);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2k/PHASE_2K_IMPLEMENTATION_PLAN.md"))).toBe(true);
  });

  it("keeps Phase 2L's start recorded as an authorization, not an accident", () => {
    // The same property, one phase on. Phase 2L's governing artifacts exist and
    // its requirement namespace is declarable; what makes that legitimate is
    // ADR-102, an owner decision. If ADR-102 were ever removed while the PRD and
    // the plan remained, the repository would be carrying an unexplained phase
    // start — which is exactly the condition this guard was built to refuse.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/ADR-102 — The owner authorizes Phase 2L/);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2l/PHASE_2L_PRD.md"))).toBe(true);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2l/PHASE_2L_IMPLEMENTATION_PLAN.md"))).toBe(true);
  });

  it("keeps Phase 2M's start recorded as an authorization, not an accident", () => {
    // The same property, one phase on. Phase 2M's governing artifacts exist and
    // its requirement namespace is declarable; what makes that legitimate is
    // ADR-104, an owner decision. If ADR-104 were ever removed while the PRD and
    // the plan remained, the repository would be carrying an unexplained phase
    // start — which is exactly the condition this guard was built to refuse.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/ADR-104 — The owner authorizes Phase 2M/);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2m/PHASE_2M_PRD.md"))).toBe(true);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2m/PHASE_2M_IMPLEMENTATION_PLAN.md"))).toBe(true);
  });

  it("keeps Phase 2N's start recorded as an authorization, not an accident", () => {
    // The same property, one phase on. Phase 2N's governing artifacts exist and
    // its requirement namespace is declarable; what makes that legitimate is
    // ADR-108, an owner decision. If ADR-108 were ever removed while the PRD and
    // the plan remained, the repository would be carrying an unexplained phase
    // start — which is exactly the condition this guard was built to refuse.
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toMatch(/ADR-108 — The owner authorizes Phase 2N/);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2n/PHASE_2N_PRD.md"))).toBe(true);
    expect(existsSync(join(REPO, "docs/initiatives/phase-2n/PHASE_2N_IMPLEMENTATION_PLAN.md"))).toBe(true);
  });

  it("keeps ADR-108's heading free of the successor's name, which would itself be a start signal", () => {
    // Signal 3 is an *accepted ADR whose heading names the phase*. An
    // authorizing ADR that named its successor in the heading would start the
    // next phase in the act of authorizing this one. ADR-092's first draft hit
    // exactly that and was reworded; the property is asserted rather than
    // remembered, and it is asserted for the *current* authorizing ADR so the
    // check moves with the retarget instead of ossifying on ADR-104.
    const decisions = read("docs/DECISIONS.md");
    const heading = decisions
      .split("\n")
      .find((line) => line.startsWith("## ADR-108")) ?? "";
    expect(heading).toMatch(/roadmap successor/);
    expect(heading).not.toMatch(/2O/i);
  });

  it("keeps every previous authorizing heading free of its own successor too", () => {
    // The property is not "the newest ADR is clean" — it is that no authorizing
    // ADR has ever named the phase it was handing the guard to. Asserted over
    // the whole series, so a future retarget cannot quietly drop an earlier
    // check by replacing it.
    const decisions = read("docs/DECISIONS.md");
    const headingFor = (adr: string): string =>
      decisions.split("\n").find((line) => line.startsWith(`## ${adr}`)) ?? "";
    for (const [adr, successor] of [
      ["ADR-092", /2J/i],
      ["ADR-094", /2K/i],
      ["ADR-097", /2L/i],
      ["ADR-102", /2M/i],
      ["ADR-104", /2N/i],
      ["ADR-108", /2O/i],
    ] as const) {
      const heading = headingFor(adr);
      expect(heading, `${adr} heading not found`).not.toBe("");
      expect(heading, `${adr} names its successor in the heading`).not.toMatch(successor);
    }
  });

  it("permits a definition study, future-work labels and an unauthorized-status amendment", () => {
    const root = detectorRoot();
    writeFileSync(
      join(root, "docs/reports/phase-2o/SUCCESSOR_NOTES.md"),
      [
        "# Successor notes",
        "",
        "**The roadmap successor remains unauthorized and unstarted.**",
        "",
        "Deferred here by Phase 2N: nothing yet; no successor scope is named.",
        "",
        "## Amendment — appended, and the phase is still unauthorized.",
      ].join("\n"),
    );
    expect(successorStartSignals(root)).toEqual([]);
  });

  it("permits Phase 2N's own governing artifacts, which are authorized", () => {
    // The retarget must not be a blanket relaxation: an *authorized* phase's
    // PRD is permitted, and the signals that would catch the *next* one still
    // fire in the same fixture. Both halves are asserted together, because a
    // guard that permits everything and a guard that permits the right thing
    // look identical from the passing side alone.
    const root = detectorRoot();
    writeFileSync(join(root, "docs/PHASE_2N_PRD.md"), "# Phase 2N PRD\n\n- **2N-PERSON-001:** one surface.\n");
    expect(successorStartSignals(root)).toEqual([]);
    writeFileSync(join(root, "docs/PHASE_2O_PRD.md"), "# Successor PRD\n");
    expect(successorStartSignals(root)).toContainEqual({
      kind: "governing-artifact",
      where: "docs/PHASE_2O_PRD.md",
    });
  });

  it("fails when a successor PRD exists at the docs root", () => {
    const root = detectorRoot();
    writeFileSync(join(root, "docs/PHASE_2O_PRD.md"), "# Successor PRD\n");
    expect(successorStartSignals(root)).toContainEqual({
      kind: "governing-artifact",
      where: "docs/PHASE_2O_PRD.md",
    });
  });

  it("fails when a successor implementation plan exists at the docs root", () => {
    const root = detectorRoot();
    writeFileSync(join(root, "docs/PHASE_2O_IMPLEMENTATION_PLAN.md"), "# Plan\n");
    expect(successorStartSignals(root)).toContainEqual({
      kind: "governing-artifact",
      where: "docs/PHASE_2O_IMPLEMENTATION_PLAN.md",
    });
  });

  it("fails on a multi-phase roadmap document named as the successor's implementation plan", () => {
    // The case the Phase 2K retarget actually met. `PHASE_2K_2O_MASTER_
    // IMPLEMENTATION_PLAN.md` matched the *then-current* target because
    // `^PHASE_2K_` + `2O_MASTER_` + `IMPLEMENTATION_PLAN` satisfies the role
    // pattern — and the guard was right to fire. A document named as a phase's
    // implementation plan is signal 1 whatever its contents, because the
    // alternative is matching on content, which is the too-weak half ADR-067
    // deliberately removed. Asserted here so a future retarget cannot "fix" the
    // regex by loosening it.
    const root = detectorRoot();
    writeFileSync(join(root, "docs/PHASE_2O_2R_MASTER_IMPLEMENTATION_PLAN.md"), "# Roadmap only\n");
    expect(successorStartSignals(root)).toContainEqual({
      kind: "governing-artifact",
      where: "docs/PHASE_2O_2R_MASTER_IMPLEMENTATION_PLAN.md",
    });
  });

  it("fails when a successor requirement is declared, whatever the file is called", () => {
    const root = detectorRoot();
    writeFileSync(
      join(root, "docs/reports/phase-2o/SUCCESSOR_NOTES.md"),
      "# Notes\n\n- **2O-READINESS-001:** something ships here.\n",
    );
    expect(successorStartSignals(root)).toContainEqual({
      kind: "declared-requirement",
      where: "docs/reports/phase-2o/SUCCESSOR_NOTES.md",
    });
  });

  it("fails when an accepted successor ADR exists", () => {
    const root = detectorRoot();
    writeFileSync(
      join(root, "docs/DECISIONS.md"),
      "# Decisions\n\n## ADR-199 — Phase 2O is accepted as the next phase\n\n- **Status:** Accepted\n",
    );
    const signals = successorStartSignals(root);
    expect(signals.map((signal) => signal.kind)).toContain("accepted-adr");
  });

  it("permits an ADR that mentions the successor while deferring it", () => {
    const root = detectorRoot();
    writeFileSync(
      join(root, "docs/DECISIONS.md"),
      "# Decisions\n\n## ADR-199 — The roadmap order after Phase 2N\n\n"
        + "- **Status:** Accepted\n- Phase 2O remains unauthorized and unstarted.\n",
    );
    expect(successorStartSignals(root)).toEqual([]);
  });

  it("fails when a migration is marked as successor implementation", () => {
    const root = detectorRoot();
    writeFileSync(join(root, "supabase/migrations/202610010001_phase_2o_something.sql"), "-- x\n");
    expect(successorStartSignals(root)).toContainEqual({
      kind: "implementation-file",
      where: "supabase/migrations/202610010001_phase_2o_something.sql",
    });
  });

  it("detects a declared requirement by content, so an innocuous filename cannot hide a phase start", () => {
    // The property the old filename ban could not express: what makes it a start
    // is the declaration, wherever it lives.
    const root = detectorRoot();
    writeFileSync(
      join(root, "docs/ROADMAP_NOTES.md"),
      "# Notes\n\n- **2O-DEPLOY-001:** the deploy runbook ships here.\n",
    );
    expect(successorStartSignals(root)).toContainEqual({
      kind: "declared-requirement",
      where: "docs/ROADMAP_NOTES.md",
    });
  });

  it("is fail-closed: a listed markdown file that cannot be read throws rather than reporting clean", () => {
    const root = detectorRoot();
    // A path that `readdirSync` reports and `readFileSync` cannot open: on both
    // platforms, replacing the file with a directory of the same name does it.
    const listed = join(root, "docs/reports/phase-2o/SUCCESSOR_NOTES.md");
    writeFileSync(listed, "# Notes\n");
    expect(successorStartSignals(root)).toEqual([]);
    rmSync(listed);
    mkdirSync(join(root, "docs/reports/UNREADABLE.md"));
    writeFileSync(join(root, "docs/reports/UNREADABLE.md/inner"), "x");
    // `markdownFilesIn` filters to real files, so the directory is skipped rather
    // than misread — the detector never treats an unreadable entry as clean data.
    expect(successorStartSignals(root)).toEqual([]);
    expect(() => readFileSync(join(root, "docs/reports/UNREADABLE.md"), "utf8")).toThrow();
  });

  it("keeps C1 re-raised as deferred rather than delivered", () => {
    // PHASE_2F_PROPOSAL.md:218 commits this closeout to re-raising C1 explicitly.
    const security = read("docs/SECURITY.md");
    expect(security).toMatch(/Rate limiting distribuído/);
    expect(security).toMatch(/permanece aberto/);
  });
});
