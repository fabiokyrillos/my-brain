/**
 * The post-2H retention schedule correction — `202608070084`, ADR-091.
 *
 * ## What this file guards that the pgTAP suite cannot
 *
 * `supabase/tests/post_2h_retention_schedule_correction.sql` proves the
 * **outcome**: a database built from the whole chain ends with no user-content
 * sweep scheduled. That is the important half, and it runs against the real
 * reconstructed database in CI.
 *
 * It cannot prove anything about the migration's **bounds**, because a
 * migration that unschedules five sweeps *and* drops a table, deletes rows, or
 * re-grants a sweep would satisfy every assertion in it. The owner authorized
 * exactly one corrective migration doing exactly one thing, so the bounds are a
 * separate claim and this is where it is checked — by reading the migration
 * text, the way `phase-2h-retention-guard.test.ts` reads the Phase 2H ones.
 *
 * ## And it guards the accounting
 *
 * Phase 2H's migration budget was FIVE, allocated per slice, non-transferable,
 * and **fully spent**. This migration is authorized separately as post-2H
 * rollout hardening. The tests below assert it stays outside the phase: the
 * file name must not read `phase_2h`, and the phase's own migration set must
 * still be exactly the five. A sixth `phase_2h` migration appearing is the
 * budget being renegotiated inside a branch, which ADR-091 exists to prevent.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const MIGRATIONS = join(REPO, "supabase/migrations");

const ALL_MIGRATIONS = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();

/** Located by content, not by a hard-coded file name. */
const CORRECTION_NAME = ALL_MIGRATIONS.find((name) =>
  name.includes("post_2h_retention_schedule_correction"),
);

const CORRECTION = CORRECTION_NAME
  ? readFileSync(join(MIGRATIONS, CORRECTION_NAME), "utf8").replace(/\r\n/g, "\n")
  : "";

/**
 * The migration text with comments and string literals removed.
 *
 * Both removals are load-bearing. The header is a long comment that *names*
 * every forbidden operation in order to forbid it, and the postconditions embed
 * the sweep names inside error-message literals. A scan over the raw text would
 * report the documentation as the violation — the "a scan that reads comments
 * reads history as requirement" trap Phase 2H recorded.
 */
const EXECUTABLE = CORRECTION.replace(/^\s*--.*$/gm, "").replace(/'[^']*'/g, "''");

/** The five job names `202608050077` scheduled and this migration removes. */
const FORBIDDEN_JOBS = [
  "sh-prune-terminal-jobs",
  "sh-prune-notifications",
  "sh-prune-product-events",
  "sh-prune-heartbeat-runs",
  "sh-prune-undo-operations",
] as const;

describe("POST-2H-CORRECTION: the guard has something to read", () => {
  it("finds the correction migration and it is substantial", () => {
    // Non-vacuity. Every assertion below reads this text; an empty string
    // passes most of them for the wrong reason.
    expect(CORRECTION_NAME, "no post_2h_retention_schedule_correction migration found").toBeDefined();
    expect(CORRECTION.length).toBeGreaterThan(2000);
    expect(EXECUTABLE).toContain("cron.unschedule");
  });

  it("has exactly one authorized successor, so nothing arrived unnoticed", () => {
    /*
     * This asserted "is the chain head" until Phase 2J slice 2J.4 appended
     * `202608080085`. The property it was protecting is not "nothing may ever
     * follow" -- the chain has to be able to grow -- but "nothing follows that
     * somebody did not deliberately account for". So the successor is NAMED.
     *
     * Weakening this to "the correction is still present" would have been the
     * easy edit and the wrong one: it would pass for any number of unreviewed
     * migrations appended after it.
     */
    const index = CORRECTION_NAME ? ALL_MIGRATIONS.indexOf(CORRECTION_NAME) : -1;
    expect(index, "the correction migration left the chain").toBeGreaterThanOrEqual(0);
    expect(ALL_MIGRATIONS.slice(index + 1)).toEqual([
      "202608080085_phase_2j_transcription_usage.sql",
      "202608080086_phase_2j_experience_telemetry.sql",
      // The post-2J correction: `202608080086` widened the event-name CHECK and
      // the property validator, but `private.record_product_event` kept a third
      // copy of the vocabulary that nothing had re-declared since
      // `202607280061`, so the real write path refused the three Phase 2J events
      // and `rate_limit_refused`. Named here rather than tolerated, because the
      // property this assertion protects is "nothing follows that somebody did
      // not deliberately account for".
      "202608080087_post_2j_product_event_writer_deduplication.sql",
      // Phase 2K slice 2K.8: the one migration OD-2K-C budgeted and ADR-101
      // authorized. It widens the same two gates `202608080087` reduced to
      // two, and its own verification block asserts they still agree
      // name-by-name — the check that would have caught that defect a phase
      // earlier.
      "202608090088_phase_2k_conversation_telemetry.sql",
      // The post-2K correction. `202608090088` widened the event-name CHECK
      // and the property validator but not `product_events_surface_check`,
      // and `private.record_product_event` still carried a hardcoded SURFACE
      // list — the copy `202608080087` left behind when it deleted the
      // event-name one. So Phase 2K closed with inert telemetry. Named here
      // rather than tolerated, because the property this assertion protects
      // is "nothing follows that somebody did not deliberately account for".
      "202608090089_post_2k_product_event_surface_deduplication.sql",
      // Phase 2M slice 2M.1: MIGRATION 1 of the two ADR-105 allocated,
      // NON-TRANSFERABLE. It widens the event-name CHECK, the property
      // validator and the surface CHECK in one file — declaring the `calendar`
      // surface OD-2M-2 signed — and it lands BEFORE any producer exists,
      // which is `2M-METRICS-001`. It touches no schedule and no retention job,
      // and it does not re-declare the writer, which is only possible because
      // the two corrections above deleted its vocabulary copies.
      "202608110090_phase_2m_daily_cycle_telemetry.sql",
      // Phase 2M slice 2M.2: MIGRATION 3, which ADR-105 had declared a STOP
      // CONDITION and which the owner authorized in ADR-106 after slice 2M.1
      // raised it as one -- `2M-PLAN-002` was proved unbuildable without
      // schema, because `apply_task_command` carries its own SQL allowlist and
      // `set_planned` refuses a null `plannedAt`. It carries `clear_planned` and
      // nothing else: no table, no column, no policy, no grant, no role, no
      // vocabulary and no second verb. It touches no schedule and no retention
      // job. Named here rather than tolerated, because the property this
      // assertion protects is "nothing follows that somebody did not
      // deliberately account for" -- and an authorized migration is exactly the
      // case where naming it is the whole point.
      "202608110091_phase_2m_clear_planned.sql",
    ]);
  });
});

describe("ADR-091: the correction stays outside Phase 2H's spent budget", () => {
  it("is not named as a phase_2h migration", () => {
    // `phase-2h-traceability.test.ts` and `phase-2h-retention-guard.test.ts`
    // both select the phase's migrations by this substring. A correction named
    // `phase_2h_*` would be silently absorbed into a budget that is fully spent.
    expect(CORRECTION_NAME).not.toContain("phase_2h");
    expect(CORRECTION_NAME).toContain("post_2h");
  });

  it("leaves Phase 2H's migration set at exactly the five it spent", () => {
    const phase2h = ALL_MIGRATIONS.filter((name) => name.includes("phase_2h"));
    expect(phase2h, `Phase 2H holds ${phase2h.length} migrations, not 5`).toHaveLength(5);
  });

  it("declares its post-2H identity and cites the ADR that authorized it", () => {
    expect(CORRECTION).toContain("ADR-091");
    expect(CORRECTION).toMatch(/not\*{0,2}\s+part of Phase 2H/i);
  });
});

describe("ADR-091: the correction schedules nothing", () => {
  it("contains no cron.schedule call", () => {
    // ADR-082's rule, applied to the migration written to enforce ADR-082. The
    // failure mode is not hypothetical: the obvious "fix" for a wrong schedule
    // is a right one, and a right schedule is still a migration authorizing the
    // first live purge.
    expect(/\bcron\.schedule\s*\(/.test(EXECUTABLE)).toBe(false);
  });

  it("carries a transaction-local postcondition against cron.job", () => {
    // The rule travels with the DDL rather than only with this repository — a
    // test in `src/` cannot stop a migration applied by hand from a branch.
    expect(EXECUTABLE).toContain("from cron.job");
    expect(CORRECTION).toMatch(/raise exception/);
    expect(CORRECTION).toMatch(/postcondition failed/);
  });

  it("does not manage its own transaction", () => {
    // An inner `commit;` would end the transaction `supabase db push` opened,
    // leaving the postconditions unable to roll the unschedules back. 2H.5's
    // migration carried exactly this defect and the pre-flight harness hid it.
    expect(/^\s*(begin|commit|rollback)\s*;/im.test(CORRECTION)).toBe(false);
  });
});

describe("ADR-091: the correction is bounded to unscheduling five jobs", () => {
  it("unschedules exactly the five, and names each one", () => {
    for (const job of FORBIDDEN_JOBS) {
      expect(CORRECTION, `${job} is not named in the correction`).toContain(job);
    }
  });

  it("executes no destructive statement of its own", () => {
    // The whole point of ADR-091 is that removing a schedule is not the same
    // act as running the sweep it removed. A `delete`, `truncate` or a direct
    // call to a sweep here would make the correction itself the first purge.
    const destructive = [
      /\bdelete\s+from\b/i,
      /\btruncate\b/i,
      /\bdrop\s+(table|function|schema|type|index)\b/i,
      /\bselect\s+public\.prune_/i,
      /\bperform\s+public\.prune_/i,
    ];
    for (const pattern of destructive) {
      expect(
        pattern.test(EXECUTABLE),
        `the correction contains a destructive statement matching ${pattern}`,
      ).toBe(false);
    }
  });

  it("grants nothing and revokes nothing", () => {
    // The eight sweeps stay executable by no role. A grant here would make one
    // reachable without any schedule at all, which is a larger hole than the
    // one being closed.
    expect(/\bgrant\b/i.test(EXECUTABLE)).toBe(false);
    expect(/\brevoke\b/i.test(EXECUTABLE)).toBe(false);
  });

  it("creates and alters nothing", () => {
    expect(/\bcreate\s+(or\s+replace\s+)?(table|function|type|index|schema|trigger|policy)\b/i.test(EXECUTABLE)).toBe(
      false,
    );
    expect(/\balter\s+(table|function|schema|type)\b/i.test(EXECUTABLE)).toBe(false);
  });

  it("guards cron.unschedule with a membership check, which is the idempotency", () => {
    // `cron.unschedule(name)` raises when the name does not exist. Applying the
    // chain to a database where the five are already gone — the hosted project
    // today — must be a no-op, not an error.
    expect(EXECUTABLE).toMatch(/=\s*any\s*\(\s*before_jobs\s*\)/);
  });

  it("tolerates a database with no pg_cron at all", () => {
    // `202608050077` returns early under the same condition, so such a database
    // never had the five. Referencing `cron.job` unguarded would turn a correct
    // posture into an apply-time failure.
    expect(EXECUTABLE).toMatch(/pg_catalog\.pg_extension/);
    expect(EXECUTABLE).toMatch(/extname\s*=\s*''/);
  });
});

describe("POST-2H-CORRECTION: the chain-built proof exists and is wired into CI", () => {
  it("the pgTAP regression suite is present in supabase/tests", () => {
    // It only means anything because CI's `database` job runs `supabase db
    // reset` — the whole chain from empty — before `supabase test db`. That is
    // the reconstructed database the defect lives in, and a hosted readback
    // would have passed before this migration existed.
    const suite = readFileSync(
      join(REPO, "supabase/tests/post_2h_retention_schedule_correction.sql"),
      "utf8",
    );
    expect(suite).toContain("pg_cron");
    for (const job of FORBIDDEN_JOBS) {
      expect(suite, `the regression suite does not assert on ${job}`).toContain(job);
    }
    // Preservation, not only absence: a suite that checked absence alone is
    // satisfied by a correction that emptied the catalog.
    expect(suite).toContain("prune_auth_event_attempts");
    expect(suite).toContain("run_all_heartbeats");
  });

  it("CI applies the whole chain from empty before running that suite", () => {
    const ci = readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("supabase db reset");
    expect(ci).toContain("supabase test db --local supabase/tests");
  });
});
