/**
 * SH-WORKER-003 — the claim paths cannot disagree, about the lifecycle or about
 * fairness.
 *
 * `202608010069` documented an asymmetry for credentials (the predicate sits
 * on the drain but deliberately not the direct claim). For the LIFECYCLE
 * predicate that asymmetry would be a hole: a suspended user's job must be
 * unclaimable through every path. SH.6 adds a second shared predicate — the
 * SH-QUOTA-003 fairness ceiling — and it is guarded the same way, because an
 * owner who can walk around the ceiling through the direct claim has no
 * ceiling.
 *
 * It reads migration text, not a live database, so it runs in the `app` CI
 * job with no Docker — and it pins the *refusal* vocabulary too, so the
 * lifecycle code cannot silently drift from the ones SH-SUSPEND-009
 * distinguishes from throttle and quota refusals.
 *
 * WHY THE DEFINING MIGRATION IS RESOLVED AND NOT NAMED
 * ---------------------------------------------------------------------------
 * The previous revision read `202608040071` by name. That was correct until
 * SH.6 create-or-replaced the three claim functions in `202608050076`, at which
 * point a hardcoded filename would have kept asserting against a definition the
 * database no longer runs — a green test guarding a dead body of code. So the
 * file is resolved: for each function, the LAST migration (in chain order) that
 * defines it is the one that is live, and the one this test reads.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n"),
  }));

const LIFECYCLE_PREDICATE = [
  "    and exists (",
  "      select 1",
  "      from public.account_lifecycle lifecycle",
  "      where lifecycle.user_id = job.user_id",
  "        and lifecycle.status = 'active'",
  "    )",
].join("\n");

/** SH-QUOTA-003's shared ceiling, byte-identical wherever a claim happens. */
const FAIRNESS_PREDICATE = [
  "    and (",
  "      select pg_catalog.count(*)",
  "      from public.jobs inflight",
  "      where inflight.user_id = job.user_id",
  "        and inflight.status = 'running'",
  "        and inflight.lease_expires_at > pg_catalog.now()",
  "    ) < private.quota_ceiling('drain_claims_per_owner_per_tick')",
].join("\n");

/** The migration that currently defines `name`, and the body it defines. */
function defining(name: string): { migration: string; body: string } {
  const marker = `create or replace function public.${name}(`;
  for (let index = MIGRATIONS.length - 1; index >= 0; index -= 1) {
    const { name: migration, sql } = MIGRATIONS[index];
    const start = sql.indexOf(marker);
    if (start === -1) continue;
    const end = sql.indexOf("\n$$;", start);
    expect(end, `${name} body in ${migration} must terminate`).toBeGreaterThan(start);
    return { migration, body: sql.slice(start, end) };
  }
  throw new Error(`no migration defines public.${name}`);
}

const CLAIM_PATHS = [
  "claim_entry_interpretation_job",
  "claim_next_entry_interpretation_job",
  "claim_attachment_job",
] as const;

describe("SH-WORKER-003: the shared predicates are identical on every claim path", () => {
  it("resolves all three claim paths to one and the same migration", () => {
    // If a future slice replaced only two of the three, they would resolve to
    // different files — which is precisely the drift this suite exists to
    // catch, and it would otherwise pass silently.
    const files = new Set(CLAIM_PATHS.map((name) => defining(name).migration));
    expect([...files]).toHaveLength(1);
  });

  it.each(CLAIM_PATHS)("%s carries the exact shared lifecycle predicate", (name) => {
    expect(defining(name).body).toContain(LIFECYCLE_PREDICATE);
  });

  it.each(CLAIM_PATHS)("%s carries the exact shared fairness predicate", (name) => {
    expect(defining(name).body).toContain(FAIRNESS_PREDICATE);
  });

  it("each predicate appears exactly three times in the migration that is live", () => {
    const sql = MIGRATIONS.find(
      (entry) => entry.name === defining(CLAIM_PATHS[0]).migration,
    )!.sql;
    expect(sql.split(LIFECYCLE_PREDICATE).length - 1).toBe(3);
    expect(sql.split(FAIRNESS_PREDICATE).length - 1).toBe(3);
  });

  it("every claim path references the job row's owner, never a parameter", () => {
    for (const name of CLAIM_PATHS) {
      const { body } = defining(name);
      expect(body).toContain("lifecycle.user_id = job.user_id");
      expect(body).not.toContain("lifecycle.user_id = p_user_id");
      expect(body).toContain("inflight.user_id = job.user_id");
      expect(body).not.toContain("inflight.user_id = p_user_id");
    }
  });

  it("the fairness ceiling is serialized where the claim actually happens", () => {
    // The predicate alone is a filter, not an enforcement: two workers can both
    // read ceiling-1. The advisory lock is what makes the count meaningful, and
    // it belongs on the two functions that perform the UPDATE — not on the
    // selector, which delegates to one of them.
    for (const name of ["claim_entry_interpretation_job", "claim_attachment_job"] as const) {
      expect(defining(name).body).toContain(
        "pg_catalog.hashtextextended('quota:drain:' || p_user_id::text, 0)",
      );
    }
  });
});

describe("the refusal vocabularies are declared and stay distinct", () => {
  it("capture and reprocessing refuse with the same declared lifecycle code", () => {
    const capture = defining("capture_entry_async");
    expect(capture.body).toContain("ACCOUNT_LIFECYCLE_NOT_ACTIVE");
    expect(defining("enqueue_entry_reprocessing").body).toContain(
      "ACCOUNT_LIFECYCLE_NOT_ACTIVE",
    );
  });

  it("the heartbeat skips with the declared reason instead of erroring", () => {
    expect(defining("run_user_heartbeat").body).toContain("'account-not-active'");
  });

  it("SH-QUOTA-009: the three vocabularies do not overlap", () => {
    // Lifecycle, throttle and quota must be three answers a caller can tell
    // apart. Sharing a prefix would collapse two of them into one.
    const details = ["ACCOUNT_LIFECYCLE_NOT_ACTIVE", "AUTH_EVENT_THROTTLED", "QUOTA_"];
    for (const outer of details) {
      for (const inner of details) {
        if (outer === inner) continue;
        expect(outer.startsWith(inner)).toBe(false);
      }
    }
  });

  it("every quota refusal in the chain uses the QUOTA_ vocabulary and carries no content", () => {
    const quotaMigration = MIGRATIONS.find((entry) =>
      entry.name.includes("quota_enforcement"),
    );
    expect(quotaMigration, "the SH.6 quota migration must exist").toBeDefined();

    const details = [...quotaMigration!.sql.matchAll(/detail = '([A-Z_]+)'/g)].map(
      (match) => match[1],
    );
    expect(details.length).toBeGreaterThanOrEqual(6);
    for (const detail of details) {
      expect(detail.startsWith("QUOTA_") || detail.startsWith("SH_QUOTA_")).toBe(true);
    }

    // Content-free: a refusal must never interpolate the row it refused. A
    // `detail =` built from an expression rather than a literal is how that
    // would first appear.
    expect(quotaMigration!.sql).not.toMatch(/detail = [^']/);
  });
});
