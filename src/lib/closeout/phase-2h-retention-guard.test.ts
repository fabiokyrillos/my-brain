/**
 * `2H-RETENTION-002` and `2H-RETENTION-004` — the two rules a retention slice
 * can break silently.
 *
 * **`2H-RETENTION-002`: no migration schedules a sweep.** SH.6's migration
 * scheduled its own at apply time, and that silently took the decision the gate
 * existed to hold open — the first live purge would have run at 04:11 UTC the
 * next morning, and the dry-run transcript meant to precede it would have
 * described a deletion that had already happened. ADR-082 generalised the rule:
 * **scheduling IS authorization**, so it belongs in an operator act, never in
 * DDL. This file reads the migration text and fails on a `cron.schedule` in any
 * Phase 2H migration.
 *
 * **`2H-RETENTION-004`: a policy claim and an enforced window cannot diverge.**
 * Every declared window must have a built sweep AND a count-only twin, and
 * "not implemented" must stay distinguishable from "implemented, not
 * scheduled". A window with no sweep is a promise nothing keeps; a sweep with
 * no twin is a purge that can only be learned about by running it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  OBSERVABILITY_RETENTION,
  OBSERVABILITY_RETENTION_EXEMPT,
  PHASE_2H_OBSERVABILITY_RETENTION_DAYS,
  hasUnscheduledObservabilitySweep,
} from "../observability-retention";

const REPO = process.cwd();
const MIGRATIONS = join(REPO, "supabase/migrations");

/** The signed value, from the PRD rather than from memory. */
const PRD = readFileSync(
  join(REPO, "docs/initiatives/phase-2h/PHASE_2H_PRD.md"),
  "utf8",
).replace(/\r\n/g, "\n");

const ALL_MIGRATIONS = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const PHASE_2H_MIGRATIONS = ALL_MIGRATIONS.filter((name) => name.includes("phase_2h"));

function migration(name: string): string {
  return readFileSync(join(MIGRATIONS, name), "utf8").replace(/\r\n/g, "\n");
}

/** The 2H.5 migration, located by content rather than by a hard-coded name. */
const RETENTION_MIGRATION_NAME = PHASE_2H_MIGRATIONS.find((name) =>
  name.includes("phase_2h_retention"),
);
const RETENTION_SQL = RETENTION_MIGRATION_NAME ? migration(RETENTION_MIGRATION_NAME) : "";

describe("2H-RETENTION: the guard has something to read", () => {
  it("finds the Phase 2H migrations and the retention one among them", () => {
    // Non-vacuity. Every check below iterates one of these; an empty scan would
    // make the whole file pass while proving nothing.
    expect(PHASE_2H_MIGRATIONS.length, "no phase_2h migration found").toBeGreaterThanOrEqual(5);
    expect(RETENTION_MIGRATION_NAME, "no phase_2h_retention migration found").toBeDefined();
    expect(RETENTION_SQL.length).toBeGreaterThan(2000);
    expect(OBSERVABILITY_RETENTION.length).toBe(3);
  });
});

describe("2H-RETENTION-002: no migration schedules a destructive sweep", () => {
  it("no Phase 2H migration calls cron.schedule at all", () => {
    // Deliberately broader than "does not schedule a SWEEP". A migration that
    // scheduled anything would be a migration taking an operational decision,
    // and the two attempt-prune jobs that legitimately exist were scheduled by
    // earlier, separately authorized migrations.
    const offenders = PHASE_2H_MIGRATIONS.filter((name) => {
      const sql = migration(name);
      // Ignore the guard blocks that MENTION the name in order to forbid it.
      const executable = sql
        .replace(/^\s*--.*$/gm, "")
        .replace(/'[^']*'/g, "''");
      return /\bcron\.schedule\s*\(/.test(executable);
    });
    expect(offenders, `Phase 2H migrations that schedule: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the retention migration carries its own refusal, not only ours", () => {
    // A test in `src/` cannot stop a migration applied by hand from a branch.
    // The migration asserts against `cron.job` itself, so the rule travels with
    // the DDL rather than with the repository that happened to contain it.
    expect(RETENTION_SQL).toMatch(/from cron\.job/);
    expect(RETENTION_SQL).toMatch(/ADR-082 forbids/);
  });

  it("nothing in the repository is recorded as scheduled", () => {
    for (const entry of OBSERVABILITY_RETENTION) {
      expect(entry.scheduled, `${entry.key} is recorded as scheduled`).toBe(false);
    }
    expect(hasUnscheduledObservabilitySweep()).toBe(true);
  });
});

describe("2H-RETENTION-001/004: every window has both halves", () => {
  it("each declared class is seeded into private.retention_windows", () => {
    for (const entry of OBSERVABILITY_RETENTION) {
      expect(
        RETENTION_SQL.includes(`('${entry.key}', ${entry.days},`),
        `${entry.key} is declared at ${entry.days} days but not seeded at that value`,
      ).toBe(true);
    }
  });

  it("each declared class has a destructive sweep in the chain", () => {
    for (const entry of OBSERVABILITY_RETENTION) {
      const built = PHASE_2H_MIGRATIONS.some((name) =>
        migration(name).includes(`create or replace function public.${entry.sweep}()`),
      );
      expect(built, `${entry.key} declares a window with no zero-argument sweep`).toBe(true);
    }
  });

  it("each destructive sweep has a count-only twin", () => {
    for (const entry of OBSERVABILITY_RETENTION) {
      const built = PHASE_2H_MIGRATIONS.some((name) =>
        migration(name).includes(`create or replace function public.${entry.twin}()`),
      );
      expect(built, `${entry.sweep} has no count-only twin`).toBe(true);
    }
  });

  it("no destructive sweep is granted to any role", () => {
    // `service_role` included. Only `pg_cron`, running as the database owner,
    // can execute one — which is why enabling a schedule IS the authorization.
    for (const entry of OBSERVABILITY_RETENTION) {
      expect(
        RETENTION_SQL,
        `${entry.sweep} is not revoked from every role`,
      ).toMatch(
        new RegExp(
          `revoke all on function public\\.${entry.sweep}\\(\\)\\s*\\n?\\s*from public, anon, authenticated, service_role`,
        ),
      );
      expect(
        RETENTION_SQL.includes(`grant execute on function public.${entry.sweep}() to`),
        `${entry.sweep} is granted to a role`,
      ).toBe(false);
    }
  });

  it("every count-only twin is granted to service_role and to nobody else", () => {
    // A dry run must be possible without the ability to delete. That asymmetry
    // is the mechanism, not a convenience.
    for (const entry of OBSERVABILITY_RETENTION) {
      expect(
        RETENTION_SQL.includes(`grant execute on function public.${entry.twin}() to service_role`),
        `${entry.twin} is not runnable by service_role, so no dry run is possible`,
      ).toBe(true);
      expect(RETENTION_SQL).toMatch(
        new RegExp(
          `revoke all on function public\\.${entry.twin}\\(\\)\\s*\\n?\\s*from public, anon, authenticated`,
        ),
      );
    }
  });

  it("a class with no sweep carries a recorded reason", () => {
    // The other direction of 2H-RETENTION-004: a class nobody decided about is
    // the state the requirement exists to forbid.
    const exempt = Object.entries(OBSERVABILITY_RETENTION_EXEMPT);
    expect(exempt.length).toBeGreaterThan(0);
    for (const [name, reason] of exempt) {
      expect(reason.length, `${name} is exempt with no reason`).toBeGreaterThan(40);
    }
  });
});

describe("2H-RETENTION: the window is the signed one, not a new one", () => {
  it("every class uses PRD sec. 14.1's signed 90 days", () => {
    expect(PHASE_2H_OBSERVABILITY_RETENTION_DAYS).toBe(90);
    for (const entry of OBSERVABILITY_RETENTION) {
      expect(entry.days, `${entry.key} uses an unsigned window`).toBe(90);
    }
  });

  it("the PRD value sheet still signs 90 days for both named classes", () => {
    // Read from the PRD, so a future edit that changed the signed value without
    // an owner amendment breaks here rather than silently in a function body.
    expect(PRD).toMatch(/\|\s*Error-sink retention window\s*\|\s*90 days\s*\|/);
    expect(PRD).toMatch(/\|\s*Dead-man history retention\s*\|\s*90 days\s*\|/);
  });

  it("the reuse for rate_limit_events is stated in the migration, loudly", () => {
    // The one class sec. 14.1 does not name. Reusing a signed value is
    // acceptable; doing so quietly is not — an unsigned window is an owner stop.
    expect(RETENTION_SQL).toMatch(/NOT a new value/);
    expect(RETENTION_SQL).toMatch(/no new retention value is minted/i);
  });
});

describe("2H-RETENTION-003: scheduling requires an explicit act", () => {
  const SCHEDULE = readFileSync(
    join(REPO, "scripts/phase-2h-retention-schedule.mjs"),
    "utf8",
  );
  const DRY_RUN = readFileSync(join(REPO, "scripts/phase-2h-retention-dry-run.mjs"), "utf8");

  it("the default mode changes nothing", () => {
    expect(SCHEDULE).toMatch(/\bmode = process\.argv\.includes\("--enable"\)/);
    expect(SCHEDULE).toMatch(/: "read"/);
  });

  it("enabling prints the count-only dry run first", () => {
    // An owner who has not seen the counts cannot enable by accident, because
    // the counts arrive in the same transcript as the act.
    expect(SCHEDULE).toMatch(/phase-2h-retention-dry-run\.mjs/);
    expect(SCHEDULE).toMatch(/refusing to enable a purge whose size is unknown/);
  });

  it("the dry run cannot delete: it calls only twins", () => {
    for (const entry of OBSERVABILITY_RETENTION) {
      expect(DRY_RUN.includes(entry.sweep), `the dry run must not call ${entry.sweep}`).toBe(
        DRY_RUN.includes(`sweep (unscheduled): ${entry.sweep}`),
      );
    }
    // It reads the class list from the constants module; it does not retype it.
    expect(DRY_RUN).toMatch(/observability-retention\.ts/);
    expect(DRY_RUN).toMatch(/Refusing to print a transcript/);
  });

  it("the scheduler refuses to touch jobs owned by another authorization", () => {
    // The two attempt-prune schedules that predate this phase, plus the four
    // operational jobs. A schedule script that quietly removed one of those
    // would be the destructive act this slice exists to make impossible.
    for (const name of ["byok-prune-validation-attempts", "sh-prune-auth-event-attempts"]) {
      expect(SCHEDULE, `${name} must be named as not-ours`).toContain(name);
    }
    expect(SCHEDULE).toMatch(/belongs to a different authorization/);
    expect(SCHEDULE).toMatch(/jobs owned by another authorization disappeared/);
  });
});

describe("2H-RETENTION: the guards can fail", () => {
  // Mutation controls over the same predicates the real checks use, so a
  // rewritten regex that stopped matching is caught here rather than passing
  // quietly on the real repository.
  it("the schedule detector fires on a migration that schedules", () => {
    const fixture = "select cron.schedule('x', '0 4 * * *', 'select public.prune_error_events();');";
    const executable = fixture.replace(/^\s*--.*$/gm, "").replace(/'[^']*'/g, "''");
    expect(/\bcron\.schedule\s*\(/.test(executable)).toBe(true);
  });

  it("the schedule detector ignores a comment that merely names it", () => {
    const fixture = "-- this migration must never call cron.schedule(...)\nselect 1;";
    const executable = fixture.replace(/^\s*--.*$/gm, "").replace(/'[^']*'/g, "''");
    expect(/\bcron\.schedule\s*\(/.test(executable)).toBe(false);
  });

  it("the grant detector fires on a sweep granted to service_role", () => {
    const fixture = "grant execute on function public.prune_error_events() to service_role;";
    expect(fixture.includes("grant execute on function public.prune_error_events() to")).toBe(true);
  });

  it("the seed detector fires on a window seeded at the wrong value", () => {
    const fixture = "insert into private.retention_windows (key, days, note) values\n  ('error_events', 30, 'x');";
    expect(fixture.includes("('error_events', 90,")).toBe(false);
    expect(fixture.includes("('error_events', 30,")).toBe(true);
  });
});
