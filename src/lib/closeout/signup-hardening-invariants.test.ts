/**
 * SH-WORKER-003 — the claim paths cannot disagree about the lifecycle.
 *
 * `202608010069` documented an asymmetry for credentials (the predicate sits
 * on the drain but deliberately not the direct claim). For the LIFECYCLE
 * predicate that asymmetry would be a hole: a suspended user's job must be
 * unclaimable through every path. This test reads the wiring migration and
 * asserts the predicate is byte-identical across all three claim functions —
 * the SQL-reachability pattern that already guards the command surfaces.
 *
 * It reads migration text, not a live database, so it runs in the `app` CI
 * job with no Docker — and it pins the *refusal* vocabulary too, so the
 * lifecycle code cannot silently drift from the one SH-SUSPEND-009 will
 * distinguish from throttle and quota refusals.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202608040071_account_lifecycle_wiring.sql",
);
const migration = readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

const LIFECYCLE_PREDICATE = [
  "    and exists (",
  "      select 1",
  "      from public.account_lifecycle lifecycle",
  "      where lifecycle.user_id = job.user_id",
  "        and lifecycle.status = 'active'",
  "    )",
].join("\n");

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be replaced by the wiring migration`).toBeGreaterThan(-1);
  const end = migration.indexOf("\n$$;", start);
  expect(end, `${name} body must terminate`).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("SH-WORKER-003: the lifecycle predicate is identical on every claim path", () => {
  const claimPaths = [
    "claim_entry_interpretation_job",
    "claim_next_entry_interpretation_job",
    "claim_attachment_job",
  ] as const;

  it.each(claimPaths)("%s carries the exact shared predicate", (name) => {
    expect(functionBody(name)).toContain(LIFECYCLE_PREDICATE);
  });

  it("the predicate appears exactly three times as a claim filter", () => {
    const occurrences = migration.split(LIFECYCLE_PREDICATE).length - 1;
    expect(occurrences).toBe(3);
  });

  it("every claim path references the job row's owner, never a parameter", () => {
    for (const name of claimPaths) {
      const body = functionBody(name);
      expect(body).toContain("lifecycle.user_id = job.user_id");
      expect(body).not.toContain("lifecycle.user_id = p_user_id");
    }
  });
});

describe("the lifecycle refusal vocabulary is declared and distinct", () => {
  it("capture and reprocessing refuse with the same declared code, twice and only twice", () => {
    const occurrences = migration.split("ACCOUNT_LIFECYCLE_NOT_ACTIVE").length - 1;
    // Once in the header prose, once in each of the two refusal sites.
    expect(occurrences).toBe(3);
    expect(functionBody("capture_entry_async")).toContain("ACCOUNT_LIFECYCLE_NOT_ACTIVE");
    expect(functionBody("enqueue_entry_reprocessing")).toContain("ACCOUNT_LIFECYCLE_NOT_ACTIVE");
  });

  it("the heartbeat skips with the declared reason instead of erroring", () => {
    expect(functionBody("run_user_heartbeat")).toContain("'account-not-active'");
  });
});
