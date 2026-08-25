import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Entity Graph Completion — the invariants, asserted mechanically.
 *
 * `EGC-INVARIANT-001` is the initiative's central claim: **the entity graph the
 * product already stores becomes reachable by its owner with no migration.** That
 * claim is worth exactly as much as the thing enforcing it, and prose enforces
 * nothing. This file is `G-0.3`, and it exists *before* the first product commit
 * for the reason `PHASE_2F_PROPOSAL.md` §15 gives: a gate written after the work
 * it governs is a description, not a check.
 *
 * The risk it answers is named in the PRD's own risk register as R1 — that a
 * "small" schema addition creeps in mid-slice (an `archived` flag, a display
 * order) and the initiative's central claim quietly stops being true. A reviewer
 * reading three slices of diffs would not reliably catch it. A pinned chain head
 * catches it on the first commit that moves.
 */

const REPO = resolve(__dirname, "../../..");

/**
 * The migration-chain head, pinned.
 *
 * **Moved by BYOK.1, deliberately and visibly — which is what the previous
 * revision of this comment instructed.** It read: *"Entity Graph Completion must
 * not move it. **BYOK will** — its plan budgets four migrations — so when that
 * initiative starts, this pin is updated by the slice that adds the first one,
 * deliberately and visibly, rather than deleted."* BYOK.1 was that slice and
 * `202608010065` its migration, the credential store; BYOK.2's resolvers
 * (`202608010066`) moved the pin again under the same rule, in the same commit
 * that added them, and BYOK.3's validation throttle (`202608010067`) after that.
 * BYOK.4 moves it by **two** in one commit — `202608010068`, the awaiting-AI
 * -configuration lifecycle, and `202608010069`, the credential-aware drain —
 * which is the whole of that slice's approved budget.
 *
 * Signup Hardening moves it under the same rule, and its eight-migration budget
 * is tracked here as it is spent: SH.1 by two (`202608040070` the lifecycle
 * table, `202608040071` the predicate wiring), SH.2 by one (`202608040072` the
 * deletion log and start transition), SH.3 by one (`202608040073` the
 * administrative boundary), SH.4 by one (`202608040074` versioned consent),
 * SH.5 by one (`202608040075` the auth abuse ledger and its ceilings), SH.6 by
 * both of its two (`202608050076` the quota and fairness mechanism,
 * `202608050077` retention and the exposure closures) — eight of eight, the
 * budget fully spent and not exceeded.
 *
 * Phase 2G spent its single migration on `202608060078`. Phase 2H's budget is
 * **five**, allocated per slice and not transferable between them (ADR-085,
 * `PHASE_2H_IMPLEMENTATION_PLAN.md` §1), and it is tracked here as it is spent:
 * 2H.1 by one (`202608070079`, the stalled-deletion recovery mechanism),
 * 2H.2 by one (`202608070080`, the error sink and the cron dead-man switch),
 * 2H.3 by one (`202608070081`, the distributed rate limiter), 2H.4 by one
 * (`202608070082`, the operator surfaces and the dead-man wiring) and 2H.5 by
 * one (`202608070083`, retention for the classes this phase created) — **all
 * five of five, and the budget is now spent.** 2H.6 holds none, and a sixth
 * `phase_2h` migration is an owner amendment rather than a judgement call.
 *
 * The pin is not the whole guard any more, because a moving pin cannot by itself
 * prove EGC added nothing. `EGC_FINAL_HEAD` below keeps that claim mechanical:
 * the head Entity Graph Completion ended on is still in the chain, and **no
 * version sits between it and the next one**, so the initiative's central claim
 * — reachable with no schema change — stays checkable after the chain moves on.
 */
// Moved by PHASE 2M SLICE 2M.1, which adds `202608110090` — MIGRATION 1 OF THE
// TWO ADR-105 allocated, NON-TRANSFERABLE. It widens the event-name CHECK,
// `private.validate_product_event_properties` and the surface CHECK in one
// file, declaring the `calendar` surface OD-2M-2 signed, and it lands **before
// any producer exists** (`2M-METRICS-001`). Phase 2M's budget moves to
// `2 allocated · 1 spent`; migration 2 is notification consent, subscription
// and delivery in slice 2M.4b, and a third is a stop condition.
//
// Previously moved by the POST-2K CORRECTION, which added `202608090089` — an
// EXTRAORDINARY migration authorized by the owner OUTSIDE Phase 2K's budget,
// deleting the third copy of the surface vocabulary from
// `private.record_product_event`. Phase 2K's implementation budget stays
// `1 allocated · 1 spent`; this migration is charged to no phase.
//
// Previously moved by PHASE 2K SLICE 2K.8, which added `202608090088` — the ONE migration
// OD-2K-C budgeted and ADR-101 authorized, carrying the Conversar telemetry
// vocabulary into the table CHECK and the property validator. The ceiling was
// never an obligation; it is spent because telemetry cannot be delivered
// honestly without a database that names the events.
//
// Previously moved by the POST-2J CORRECTION, which added `202608080087` to repair the
// product-event writer defect that hosted deployment verification exposed. It is
// an owner-authorized amendment charged to NO phase budget — Phase 2J remains
// `2 allocated · 2 spent`, and the file is named `post_2j_*` so the phase's
// traceability generator (which selects by `/phase_2j/i`) cannot absorb it, the
// same mechanism `202608070084` used for the post-2H correction. Moved
// deliberately and visibly in the same commit that adds the migration, which is
// the only way this pin is allowed to change.
// Moved by Phase 2M slice 2M.2 to `202608110091`, the `clear_planned` migration
// **ADR-106 authorized by owner decision** after slice 2M.1 raised the third
// migration as the stop condition ADR-105 declared it to be. The budget is now
// `3 allocated · 2 spent`, all three non-transferable, and migration 2 stays
// reserved for push in 2M.4b — this move funds nothing else. Moved deliberately
// and visibly in the same commit that adds the migration, which is the only way
// this pin is allowed to change.
//
// Moved by PHASE 2M SLICE 2M.4b to `202608120092`, the push consent,
// subscription and content-free delivery migration. This is the THIRD and LAST
// of the three ADR-105 allocated and ADR-106 confirmed, all non-transferable:
// the budget is now `3 allocated · 3 spent` and **a fourth is a stop
// condition**, not a decision available inside a branch. It creates three
// tables, six functions, forced RLS, a retention window and a sweep armed by no
// role — and deliberately creates NO quiet-hours and NO daily-cap column,
// because `agent_preferences.quiet_start`/`.quiet_end`/`.max_followups_per_day`
// already hold that authority and a second copy is how a user sets quiet hours
// once and is still pushed at 03:00. Moved deliberately and visibly in the same
// commit that adds the migration, which is the only way this pin is allowed to
// change.
// Moved by PHASE 2N SLICE 2N.3 to `202608130093`, validity-aware retrieval.
// This is MIGRATION M1 of the three ADR-109 allocated, all NON-TRANSFERABLE:
// M3 stays with slice 2N.3 for transactional deletion and M2 with slice 2N.7
// for the telemetry vocabulary, and the budget is now `3 allocated · 1 spent`
// with **a fourth a stop condition**. It re-declares ONE function so that
// `valid_from`/`valid_until` are applied inside the union rather than after the
// bound — creating no table, no column, no policy, no grant change and no
// schedule — because filtering after the bound removes an archived memory from
// the citations while it has already displaced a live one, which no downstream
// code can undo. Moved deliberately and visibly in the same commit that adds
// the migration, which is the only way this pin is allowed to change.
// Moved by PHASE 2N SLICE 2N.3 to `202608140094`, transactional deletion.
// This is MIGRATION M3 of the three ADR-109 allocated, all NON-TRANSFERABLE:
// M1 was spent by this same slice at `202608130093` and M2 stays with slice
// 2N.7 for the telemetry vocabulary, so the budget is now `3 allocated · 2
// spent` with **a fourth a stop condition**. It creates ONE table — the
// server-issued, single-use deletion confirmation ADR-113 authorized after the
// intermediate re-audit found that §6.3's "no new table" prediction could not
// hold — plus one census, one fingerprint and three RPCs, and it registers
// three undo handlers in the registry that already ships. The deletion removes
// `entry_entities`, `entity_aliases`, `entity_tags` and `entity_attachments`
// EXPLICITLY, because those four carry `entity_type`/`entity_id` as an
// unconstrained pair and no cascade reaches them: leaving them is the partial
// deletion `2N-CORRECT-012` forbids. Moved deliberately and visibly in the same
// commit that adds the migration, which is the only way this pin is allowed to
// change.
// Chain head moved to 98 by Phase 2P slice 2P.1's single authorized migration (the owner's replacement authorization). This guard's own claim -- that THIS initiative spent nothing -- is unchanged.
// Chain head moved to 99 by Phase 2P slice 2P.4's second authorized migration (ADR-123: per-category automation policy and calibration). Same reasoning: this pin moves in the commit that adds the migration, and this guard's claim about THIS initiative is untouched.
// Chain head moved to 202608210100 by Phase 2Q slice 2Q.1's ONE authorized
// migration (ADR-127 Decision 7 / ADR-128 Decision 3: summaries.citations). Same
// reasoning: this pin moves in the commit that adds the migration, and this
// guard's claim about THIS initiative is untouched.
// Chain head moved to 202608230101 by Phase 2R slice 2R.1's ONE authorized
// migration (ADR-132 Decision 8 / ADR-133 Decision 3: the reminder recurrence
// model). Same reasoning again: Entity Graph Completion still spent nothing, and
// that is the only claim this constant makes.
// Chain head moved to 202608240102 by Phase 2S slice 2S.1's ONE authorized
// migration (OD-2S-7 A; ADR-137, ADR-138 Decision 3). Moved in the commit
// that adds it, deliberately and visibly. EGC still adds none.
const AUTHORIZED_MIGRATION_HEAD = "202608240102";

/**
 * The head at Entity Graph Completion's close, which nothing may ever change.
 *
 * Unlike the pin above, this constant is historical: EGC is a closed initiative,
 * and the version it ended on is a fact about the past rather than a budget for
 * the future.
 */
const EGC_FINAL_HEAD = "202607310064";

/**
 * The first migration added *after* Entity Graph Completion closed.
 *
 * Also historical, and it exists because the check below needs a fixed upper
 * bound. The previous revision compared against `AUTHORIZED_MIGRATION_HEAD`,
 * which **moves** — so the moment BYOK.2 added a second migration, BYOK.1's own
 * `202608010065` fell inside the window and the assertion failed while nothing
 * was wrong. A boundary that drifts cannot bound anything.
 *
 * With both ends pinned the check is non-vacuous in the way that matters: a
 * migration back-dated into the gap between EGC's close and this one — which is
 * exactly how a retroactively-added EGC migration would have to appear — fails.
 */
const FIRST_POST_EGC_MIGRATION = "202608010065";

function migrationVersions(): string[] {
  return readdirSync(join(REPO, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.slice(0, 12))
    .filter((version) => /^\d{12}$/.test(version))
    .sort();
}

describe("EGC-INVARIANT-001: Entity Graph Completion adds no migration", () => {
  it("keeps the migration chain head at the version authorized for this initiative", () => {
    const versions = migrationVersions();
    expect(
      versions[versions.length - 1],
      "The migration chain head moved without this pin moving with it. The pin is "
        + "updated by the slice that adds a migration, deliberately and visibly, in "
        + "the same commit — never deleted, and never edited by a slice that added "
        + "nothing. If a migration is genuinely required and unbudgeted, the slice "
        + "stops and the plan is amended by owner decision: the invariant is not "
        + "renegotiated inside a branch.",
    ).toBe(AUTHORIZED_MIGRATION_HEAD);
  });

  it("keeps Entity Graph Completion's own claim mechanical after the chain moved on", () => {
    // EGC-INVARIANT-001 says the entity graph became reachable with **no schema
    // change**. Once the head is allowed to move for a later initiative, that
    // claim needs its own check or it quietly becomes unfalsifiable.
    //
    // Three facts, together sufficient: both boundary versions are still in the
    // chain, and nothing sits strictly between them. A migration added by EGC
    // would have to occupy that gap — its slices ran entirely between the two.
    //
    // Both bounds are **historical constants**. An earlier revision used the
    // moving pin as the upper bound, which broke the moment a second BYOK
    // migration arrived: BYOK.1's own migration fell inside the window and the
    // assertion failed while nothing was wrong.
    const versions = migrationVersions();

    expect(versions, "EGC's final head must still be in the chain").toContain(EGC_FINAL_HEAD);
    expect(versions, "the first post-EGC migration must still be in the chain").toContain(
      FIRST_POST_EGC_MIGRATION,
    );

    expect(
      versions.filter(
        (version) => version > EGC_FINAL_HEAD && version < FIRST_POST_EGC_MIGRATION,
      ),
      "a migration sits between Entity Graph Completion's close and the first "
        + "migration added after it, so EGC's zero-migration claim is no longer true",
    ).toEqual([]);
  });

  it("reads the head from the directory rather than trusting a restated constant", () => {
    // The pin is only worth something if it is compared against the real chain.
    // A test that asserted the constant against itself would pass forever.
    const versions = migrationVersions();
    expect(versions.length).toBeGreaterThan(60);
    expect(versions).toContain(AUTHORIZED_MIGRATION_HEAD);
    expect(versions).toEqual([...versions].sort());
  });
});

/**
 * Every `.ts`/`.tsx` under `src/`, excluding tests.
 *
 * Tests are excluded because a test *names* a table in a stub and would count as
 * a writer under any textual rule, which would make the inventory below unable
 * to distinguish a second write path from its own coverage.
 */
function sourceFiles(directory = join(REPO, "src")): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    found.push(path);
  }
  return found;
}

/**
 * The modules that reach a write method through `.from("<table>")`.
 *
 * The window is deliberately generous — a PostgREST write is
 * `.from(t).insert(…)` or `.from(t).update(…)`, sometimes with an intervening
 * newline and indentation — and the reads this repository performs
 * (`.select(...).eq(...).maybeSingle()`) never contain one of these tokens, so a
 * generous window over-reports nothing in practice. Over-reporting would be the
 * safe direction anyway: it fails the exact-set assertion and asks a human.
 */
/**
 * Every source file, read **once**.
 *
 * `writersOf` is called four times, and it used to redo the whole recursive
 * `readdirSync`/`statSync` walk plus a `readFileSync` of every `.ts`/`.tsx`
 * file on each call. On Windows under full-suite parallel load that pushed a
 * single call past vitest's **5 s default timeout** — one call was measured at
 * 5242 ms — so the file passed 9/9 in isolation and intermittently failed in a
 * full run. Exactly the shape of the `project-key-guard.test.ts` flake fixed in
 * the same session: **the time was going into I/O, not into the property under
 * test.**
 *
 * Memoised lazily rather than at import, so a file that never calls it pays
 * nothing. This changes no assertion: the same paths, the same contents, the
 * same regex. ADR-090 makes a flake a defect with an owner, so it is fixed at
 * its cause instead of being absorbed by a rerun.
 */
let sourceCache: ReadonlyArray<{ path: string; source: string }> | null = null;

function sourcesOnce(): ReadonlyArray<{ path: string; source: string }> {
  sourceCache ??= sourceFiles().map((path) => ({ path, source: readFileSync(path, "utf8") }));
  return sourceCache;
}

function writersOf(table: string): string[] {
  const writers = new Set<string>();
  const anchor = new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)`, "g");

  for (const { path, source } of sourcesOnce()) {
    for (const match of source.matchAll(anchor)) {
      const window = source.slice(match.index ?? 0, (match.index ?? 0) + 260);
      if (/\.(insert|update|upsert|delete)\s*\(/.test(window)) {
        writers.add(relative(REPO, path).replace(/\\/g, "/"));
      }
    }
  }
  return [...writers].sort();
}

/**
 * EGC-ASSOC-003 and PRD risk R3: one application writer per relationship table.
 *
 * Asserted as an **exact set in both directions**, which is the part that
 * matters. "The expected module is among the writers" would pass with a second
 * path beside it — and a second path is precisely how a soft-end contract
 * acquires a hard delete on the surface that forgot about it. The Person page
 * and the Project page associate the same row, so the temptation to give each
 * its own writer is real and the PRD names it as a medium-likelihood risk.
 */
describe("EGC-ASSOC-003: one application writer per relationship table", () => {
  const expected: Readonly<Record<string, string>> = {
    person_relationships: "src/features/entities/relationships.ts",
    person_contexts: "src/features/entities/associations.ts",
    person_projects: "src/features/entities/associations.ts",
  };

  for (const [table, module] of Object.entries(expected)) {
    it(`is written by ${module} and by nothing else: ${table}`, () => {
      expect(
        writersOf(table),
        `${table} has more than one application write path, or has moved. `
          + "EGC-ASSOC-003 requires exactly one contract per table: the Person and "
          + "Project surfaces both call the same module, and neither owns a private "
          + "path. If this is a deliberate move, update the expectation here in the "
          + "same commit.",
      ).toEqual([module]);
    });
  }

  it("detects a writer at all, so the assertion above is not vacuous", () => {
    // If the anchor regex ever stopped matching — a rename, a formatting change,
    // a different client shape — every assertion above would pass with an empty
    // set and the invariant would be silently unguarded. This is the control.
    expect(writersOf("person_relationships").length).toBe(1);
    expect(writersOf("organizations")).toContain("src/features/entities/actions.ts");
  });

  it("has no delete path on any of the three, because ending is not deleting", () => {
    // EGC-DEC-2 and EGC-REL-007. Soft-end is the contract: `valid_until` is set
    // and the row survives, which is what lets the product still hold "we were
    // married until 2019". A `.delete()` anywhere on these tables would make
    // that contract a suggestion.
    for (const table of Object.keys(expected)) {
      const anchor = new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)`, "g");
      for (const path of sourceFiles()) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(anchor)) {
          const window = source.slice(match.index ?? 0, (match.index ?? 0) + 260);
          expect(
            /\.delete\s*\(/.test(window),
            `${relative(REPO, path)} deletes from ${table}`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("EGC-INVARIANT-003: Phase 2F's write-path invariant is untouched", () => {
  it("keeps the direct-write guard present, so EGC cannot silently become its exception", () => {
    // The guard itself asserts the allowlists; this asserts the guard still
    // exists to do so. Deleting it would make `tasks` writable with a green
    // suite, which is the one failure mode the guard cannot report about itself.
    const guards = readdirSync(join(REPO, "src/lib/supabase"));
    expect(guards).toContain("direct-write-guard.test.ts");
  });
});
