import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SH-EXPOSURE-005 — the deployed `heartbeat` Edge Function, dispositioned.
 *
 * ## What the repository actually says
 *
 * The heartbeat runs on `pg_cron`, which calls `public.run_all_heartbeats()`
 * directly inside the database (`202607160008`). The Edge Function wraps the
 * same RPC behind an HTTP endpoint guarded by `HEARTBEAT_SECRET` — a second way
 * in, for a job that already has a first one that never leaves the database.
 *
 * That makes it an internet-reachable endpoint holding a service-role client
 * whose only protection is one shared secret, existing for a caller that does
 * not exist. The disposition is therefore **undeploy**, and the owner action is
 * recorded in the SH.6 acceptance report with the readback that proves it.
 *
 * ## Why this is a test and not a sentence
 *
 * "Nothing calls it" is the entire justification, and it is the kind of claim
 * that is true when written and false six weeks later. So it is mechanical: if
 * a caller ever appears, the disposition has to be re-argued rather than
 * silently invalidated.
 */

const REPO = process.cwd();

function filesUnder(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      filesUnder(full, found);
      continue;
    }
    if (/\.(ts|tsx|mjs|sql|ya?ml)$/.test(entry)) found.push(full);
  }
  return found;
}

/** Every file that mentions invoking the heartbeat function over HTTP. */
function httpCallers(): string[] {
  const patterns = [
    /functions\.invoke\(\s*["']heartbeat["']/,
    /functions\/v1\/heartbeat/,
    /x-heartbeat-secret/i,
  ];
  return filesUnder(join(REPO, "src"))
    .concat(filesUnder(join(REPO, "supabase")))
    .concat(filesUnder(join(REPO, "scripts")))
    .filter((file) => {
      // The function's own implementation reads the header it is guarded by;
      // that is not a caller.
      if (file.replace(/\\/g, "/").endsWith("supabase/functions/heartbeat/index.ts")) return false;
      // A test that asserts the absence of callers necessarily names the thing
      // it is asserting the absence of.
      if (file.replace(/\\/g, "/").endsWith("src/lib/closeout/heartbeat-disposition.test.ts")) {
        return false;
      }
      const text = readFileSync(file, "utf8");
      return patterns.some((pattern) => pattern.test(text));
    })
    .map((file) => file.slice(REPO.length + 1).replace(/\\/g, "/"));
}

describe("SH-EXPOSURE-005: the heartbeat Edge Function has no caller", () => {
  it("the scan looks at a real corpus rather than an empty one", () => {
    // Guard against the inversion that makes every absence test worthless: the
    // walk stops matching, finds nothing, and the assertion passes vacuously.
    expect(filesUnder(join(REPO, "src")).length).toBeGreaterThan(100);
  });

  it("nothing in the repository invokes it over HTTP", () => {
    expect(httpCallers()).toEqual([]);
  });

  it("the schedule calls the RPC directly, inside the database", () => {
    // This is the first path, and the reason the second one is redundant rather
    // than merely unused.
    const schedule = readFileSync(
      join(REPO, "supabase/migrations/202607160008_scheduled_heartbeat.sql"),
      "utf8",
    );
    expect(schedule).toContain("cron.schedule('my-brain-hourly-heartbeat'");
    expect(schedule).toContain("select public.run_all_heartbeats()");
    expect(schedule).not.toContain("functions/v1/heartbeat");
  });

  it("the function still exists in the repository, so undeploying is a deployment act", () => {
    // Deleting the source would make the hosted deployment un-auditable: the
    // owner action is to remove the DEPLOYED function and read back its
    // absence, and comparing that against a file that no longer exists proves
    // nothing. It goes when the readback is recorded, not before.
    expect(() =>
      readFileSync(join(REPO, "supabase/functions/heartbeat/index.ts"), "utf8"),
    ).not.toThrow();
  });
});
