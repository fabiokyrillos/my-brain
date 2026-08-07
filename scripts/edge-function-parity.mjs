/**
 * Edge Function deployment parity, as data — `2H-DEADMAN-004`.
 *
 * The comparison itself is unchanged and its reasoning lives in
 * `verify-edge-function-parity.mjs`, which is still the command an operator
 * runs. This module exists because the parity answer has a second reader now:
 * the operator health surface, where deployment staleness has to appear
 * *beside* scheduled-job liveness rather than in a different tool.
 *
 * That adjacency is the requirement, not a convenience. The 2026-08-06 stall
 * was a parity defect — `delete-account` deployed once and never again, while a
 * migration revoked the grant its deployed code depended on — and no liveness
 * check would ever have caught it, because the schedule was healthy and the
 * code was correct. Only the gap between them was wrong.
 *
 * Read-only. It deploys nothing and prints nothing; the caller decides.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const FUNCTIONS_DIR = "supabase/functions";

/**
 * Functions that are deliberately NOT deployed, with the decision that says so.
 *
 * An allowlist rather than silence: "it is fine that this is missing" is
 * exactly the kind of claim that is true when written and false later, so it
 * has to be stated where a reader trips over it.
 */
export const NOT_DEPLOYED_BY_DESIGN = Object.freeze({
  heartbeat: "SH-EXPOSURE-005: undeployed on purpose -- pg_cron calls run_all_heartbeats() inside the database, so the HTTP wrapper was an internet-reachable service-role endpoint with no caller. Guarded by src/lib/closeout/heartbeat-disposition.test.ts.",
});

/** Directories that are deployed functions, not shared modules. */
export function deployableFunctions() {
  return readdirSync(new URL(`../${FUNCTIONS_DIR}`, import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();
}

const SOURCE_PATHSPEC = (slug) => [
  `${FUNCTIONS_DIR}/${slug}/*.ts`,
  `${FUNCTIONS_DIR}/${slug}/*.json`,
  `:(exclude)${FUNCTIONS_DIR}/${slug}/*.test.ts`,
];

/**
 * The newest commit touching a function's **deployable** source.
 *
 * Tests and markdown are excluded deliberately. The first cut of this check
 * compared the whole directory and immediately reported two false alarms: a
 * docs reorganisation that touched a `.test.ts` file, and a fixture update.
 * Neither changes a byte of what runs in production, and a parity check that
 * cries wolf is one people learn to run with their eyes closed -- which is how
 * the real staleness would have gone unnoticed a second time.
 */
export function lastCommitMs(slug) {
  const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", ...SOURCE_PATHSPEC(slug)], {
    cwd: REPO,
    encoding: "utf8",
  }).trim();
  return iso ? Date.parse(iso) : null;
}

/**
 * The subject of that commit, so the report says *what* is undeployed rather
 * than only that something is.
 */
export function lastCommitSubject(slug) {
  return execFileSync("git", ["log", "-1", "--format=%h %s", "--", ...SOURCE_PATHSPEC(slug)], {
    cwd: REPO,
    encoding: "utf8",
  }).trim();
}

export function projectRef() {
  const ref = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error("Linked project reference is invalid");
  return ref;
}

/**
 * The deployed list, tolerating the CLI's post-result telemetry flush the same
 * way `linked-supabase.mjs` does — a failed flush exits non-zero with complete,
 * valid JSON already on stdout.
 */
export function deployedFunctions(ref) {
  const command = process.platform === "win32" ? process.env.ComSpec : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `npx supabase functions list --project-ref ${ref} --output json`]
    : ["supabase", "functions", "list", "--project-ref", ref, "--output", "json"];
  let raw;
  try {
    raw = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    raw = error?.stdout?.toString() ?? "";
  }
  const parsed = JSON.parse(raw.trim());
  if (!Array.isArray(parsed)) throw new Error("the CLI did not return a function list");
  return parsed;
}

/**
 * One row per function, plus the orphans — deployed code with no source here,
 * which is the opposite drift and just as worth knowing.
 *
 * `state` is a closed vocabulary so a caller can decide without parsing prose:
 *
 *   ok                 the deployment is at or ahead of its source
 *   stale              the source is newer than the deployment
 *   not_deployed       no deployment, and no decision saying that is intended
 *   undeployed_by_design  no deployment, with the decision naming why
 *   orphan             deployed with no source in this repository
 *
 * `undeployed_by_design` is deliberately NOT `ok`. It is healthy evidence and it
 * is a different fact, and flattening the two would mean a function that
 * silently stopped being deployed could hide inside the allowlist's shape.
 */
export function readEdgeFunctionParity() {
  const deployed = new Map(deployedFunctions(projectRef()).map((fn) => [fn.slug, fn]));
  const local = deployableFunctions();
  const rows = [];

  for (const slug of local) {
    const fn = deployed.get(slug);
    const committedAt = lastCommitMs(slug);

    if (!fn) {
      const reason = NOT_DEPLOYED_BY_DESIGN[slug] ?? null;
      rows.push({
        slug,
        state: reason ? "undeployed_by_design" : "not_deployed",
        deployedAt: null,
        committedAt,
        version: null,
        status: null,
        reason,
        undeployedCommit: reason ? null : lastCommitSubject(slug),
      });
      continue;
    }

    const deployedAt = Number(fn.updated_at);
    const behind = committedAt !== null && committedAt > deployedAt;
    rows.push({
      slug,
      state: behind ? "stale" : "ok",
      deployedAt,
      committedAt,
      version: fn.version ?? null,
      status: fn.status ?? null,
      reason: null,
      undeployedCommit: behind ? lastCommitSubject(slug) : null,
    });
  }

  for (const [slug, fn] of deployed) {
    if (local.includes(slug)) continue;
    rows.push({
      slug,
      state: "orphan",
      deployedAt: Number(fn.updated_at),
      committedAt: null,
      version: fn.version ?? null,
      status: fn.status ?? null,
      reason: null,
      undeployedCommit: null,
    });
  }

  return rows;
}

/** The states that mean something needs attention. */
export function parityFindings(rows) {
  return rows.filter((row) => row.state === "stale" || row.state === "not_deployed" || row.state === "orphan");
}
