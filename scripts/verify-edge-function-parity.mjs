/**
 * Are the deployed Edge Functions the ones in this repository?
 *
 * Migrations have a parity check — `AUTHORIZED_MIGRATION_HEAD`, a chain, and a
 * hosted readback. Edge Functions had none, and on 2026-08-06 that cost a real
 * account: `delete-account` was deployed once on 2026-08-04 and never again,
 * while migration `202608050077` revoked the grant its deployed code depended
 * on. From that moment every account deletion stopped at `credential_not_erased`
 * and stayed `deleting` **forever**, because nothing re-runs the executor.
 *
 * The repository had already been fixed the same day the migration landed. The
 * commit and the deploy were simply two different acts, and only one of them
 * happened. Nothing could see the gap — which is what this closes.
 *
 * ## What it compares, and why that is the honest comparison
 *
 * The deployed function's `updated_at` against the newest commit touching its
 * **deployable** source — `.ts` and `.json`, never tests or markdown, because a
 * fixture edit changes nothing that runs. Not a content hash: the deployment
 * bundles and transforms
 * the source, so a hash comparison would need to reproduce the platform's build
 * exactly and would drift into false alarms. Timestamps answer the question
 * that actually matters — *is the deployment older than the code?* — and the
 * failure they can produce is a redeploy nobody needed, never a stall nobody
 * noticed.
 *
 * Read-only. It deploys nothing; a redeploy is an operator action, and the
 * command to run is printed rather than executed.
 *
 * Usage: `npm run verify:edge-parity`
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
const NOT_DEPLOYED_BY_DESIGN = Object.freeze({
  heartbeat: "SH-EXPOSURE-005: undeployed on purpose -- pg_cron calls run_all_heartbeats() inside the database, so the HTTP wrapper was an internet-reachable service-role endpoint with no caller. Guarded by src/lib/closeout/heartbeat-disposition.test.ts.",
});

/** Directories that are deployed functions, not shared modules. */
function deployableFunctions() {
  return readdirSync(new URL(`../${FUNCTIONS_DIR}`, import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();
}

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
function lastCommitMs(slug) {
  const iso = execFileSync(
    "git",
    [
      "log", "-1", "--format=%cI", "--",
      `${FUNCTIONS_DIR}/${slug}/*.ts`,
      `${FUNCTIONS_DIR}/${slug}/*.json`,
      `:(exclude)${FUNCTIONS_DIR}/${slug}/*.test.ts`,
    ],
    { cwd: REPO, encoding: "utf8" },
  ).trim();
  return iso ? Date.parse(iso) : null;
}

/**
 * The subject of that commit, so the report says *what* is undeployed rather
 * than only that something is.
 */
function lastCommitSubject(slug) {
  return execFileSync(
    "git",
    [
      "log", "-1", "--format=%h %s", "--",
      `${FUNCTIONS_DIR}/${slug}/*.ts`,
      `${FUNCTIONS_DIR}/${slug}/*.json`,
      `:(exclude)${FUNCTIONS_DIR}/${slug}/*.test.ts`,
    ],
    { cwd: REPO, encoding: "utf8" },
  ).trim();
}

function projectRef() {
  const ref = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error("Linked project reference is invalid");
  return ref;
}

/**
 * The deployed list, tolerating the CLI's post-result telemetry flush the same
 * way `linked-supabase.mjs` does — a failed flush exits non-zero with complete,
 * valid JSON already on stdout.
 */
function deployedFunctions(ref) {
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

function main() {
  const deployed = new Map(deployedFunctions(projectRef()).map((fn) => [fn.slug, fn]));
  const local = deployableFunctions();
  let stale = 0;

  console.log("function          deployed              last commit           state");
  for (const slug of local) {
    const fn = deployed.get(slug);
    const committed = lastCommitMs(slug);

    if (!fn) {
      const reason = NOT_DEPLOYED_BY_DESIGN[slug];
      console.log(
        `${slug.padEnd(17)} ${"(never)".padEnd(21)} `
        + `${new Date(committed).toISOString().slice(0, 16).padEnd(21)} `
        + `${reason ? "not deployed, by design" : "NOT DEPLOYED"}`,
      );
      if (reason) console.log(`  ${reason}`);
      else stale += 1;
      continue;
    }

    const deployedAt = Number(fn.updated_at);
    const behind = committed !== null && committed > deployedAt;
    console.log(
      `${slug.padEnd(17)} ${new Date(deployedAt).toISOString().slice(0, 16).padEnd(21)} `
      + `${new Date(committed).toISOString().slice(0, 16).padEnd(21)} `
      + `${behind ? "STALE" : "ok"}${fn.status !== "ACTIVE" ? ` (${fn.status})` : ""}`,
    );
    if (behind) {
      stale += 1;
      console.log(`  undeployed: ${lastCommitSubject(slug)}`);
    }
  }

  // Deployed functions with no source here: the opposite drift, and just as
  // worth knowing — something is running that nobody can review.
  for (const [slug] of deployed) {
    if (!local.includes(slug)) {
      console.log(`${slug.padEnd(17)} deployed with no source in this repository — ORPHAN`);
      stale += 1;
    }
  }

  if (stale > 0) {
    console.error(
      `\n${stale} function(s) out of parity. A migration that changes a contract an Edge`
      + "\nFunction depends on is only half-deployed until the function is redeployed:"
      + "\n  npx supabase functions deploy <slug>"
      + "\nDeploying is an operator action and is deliberately not performed here.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nevery deployed function is at or ahead of its source");
}

main();
