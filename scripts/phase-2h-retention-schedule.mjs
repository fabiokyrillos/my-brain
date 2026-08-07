#!/usr/bin/env node
/**
 * `2H-RETENTION-002/003` — the only way a Phase 2H sweep can ever be scheduled,
 * and it is deliberately not a migration.
 *
 * ## Why this exists at all
 *
 * `202608050077` scheduled its own sweeps at apply time. That silently took the
 * decision the gate existed to hold open: the first live purge would have run
 * at 04:11 UTC the next morning, and the dry-run transcript meant to PRECEDE
 * that decision would have described a deletion that had already happened. The
 * schedules were removed the same day and ADR-082 made the rule general:
 * **scheduling IS authorization**, so it belongs in an operator act with a
 * name and a timestamp, never in DDL.
 *
 * `202608070083` therefore creates three sweeps and schedules none of them.
 * This script is the gap between "built" and "running", and crossing it is the
 * owner's decision.
 *
 * ## Default is a read
 *
 * With no flag it reads the catalog and reports. `--enable` schedules the three
 * sweeps; `--disable` removes them again. Even `--enable` cannot purge — it can
 * only hand the decision to `pg_cron`, which is the only principal in the
 * system that can execute a destructive half.
 *
 * ## It refuses to enable blind
 *
 * `--enable` runs the count-only dry run first and prints it. An owner who has
 * not seen the counts cannot enable by accident, because the counts arrive in
 * the same transcript as the act.
 *
 * ## What it must never touch
 *
 * The two attempt-prune jobs that predate this phase
 * (`byok-prune-validation-attempts`, `sh-prune-auth-event-attempts`) were
 * authorized separately and are **not** this script's business. Neither are
 * SH.6's five still-unscheduled user-content sweeps, which have their own
 * script. This one owns exactly three job names and asserts so before writing.
 *
 * Usage:
 *   npm run ops:retention-schedule                # read the catalog, change nothing
 *   npm run ops:retention-schedule -- --enable    # OWNER ACT: authorize the first live purge
 *   npm run ops:retention-schedule -- --disable   # remove the three schedules again
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = new URL("..", import.meta.url);

const mode = process.argv.includes("--enable")
  ? "enable"
  : process.argv.includes("--disable")
    ? "disable"
    : "read";

/**
 * The three jobs this script owns, and nothing else.
 *
 * Cadences are staggered off the 04:00 hour the SH.6 script uses and off each
 * other, so that enabling everything one day would not put six deletes on the
 * same minute. The statement carries NO number: the zero-argument sweeps read
 * their window from `private.retention_windows` and their bound from
 * `private.retention_batch_limit()`, so the cron catalog cannot drift from the
 * registry.
 */
const SWEEPS = [
  { job: "phase-2h-prune-error-events", cadence: "23 3 * * *", fn: "prune_error_events" },
  { job: "phase-2h-prune-scheduled-job-health", cadence: "31 3 * * *", fn: "prune_scheduled_job_health" },
  { job: "phase-2h-prune-rate-limit-events", cadence: "39 3 * * *", fn: "prune_rate_limit_events" },
];

/** Jobs owned by other authorizations. Named so they are never collateral. */
const NOT_OURS = [
  "byok-prune-validation-attempts",
  "sh-prune-auth-event-attempts",
  "sh-prune-notifications",
  "my-brain-job-reaper",
  "my-brain-entry-dispatch",
  "my-brain-hourly-heartbeat",
];

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    const text = readFileSync(new URL(".env.local", REPO), "utf8");
    return /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/m.exec(text)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

const TOKEN = accessToken();
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is required (env or .env.local).");
  process.exit(2);
}

const PROJECT_REF = readFileSync(new URL("supabase/.temp/project-ref", REPO), "utf8").trim();

async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

async function catalog() {
  const rows = await query("select jobname, schedule, active from cron.job order by jobname");
  return rows.map((row) => ({ name: row.jobname, schedule: row.schedule, active: row.active }));
}

const before = await catalog();
console.log(`project: ${PROJECT_REF}`);
console.log(`\ncron catalog BEFORE (${before.length} jobs)`);
for (const job of before) console.log(`  ${job.name.padEnd(38)} ${job.schedule}  active=${job.active}`);

const ours = new Set(SWEEPS.map((sweep) => sweep.job));
const scheduledNow = before.filter((job) => ours.has(job.name)).map((job) => job.name);

if (mode === "read") {
  console.log(
    scheduledNow.length === 0
      ? "\nNone of the three Phase 2H retention sweeps is scheduled.\n" +
          "The functions exist, no role can execute them, and nothing runs them.\n\n" +
          "Enabling them AUTHORIZES THE FIRST LIVE PURGE of these classes.\n" +
          "Run `npm run ops:retention-dry-run` first and read the counts, then run\n" +
          "this script with --enable. That IS the authorization."
      : `\nSCHEDULED: ${scheduledNow.join(", ")}`,
  );
  process.exit(0);
}

// A guard, not a formality: if this script is ever edited to name a job it does
// not own, it must fail before it writes rather than after.
for (const sweep of SWEEPS) {
  if (NOT_OURS.includes(sweep.job)) {
    console.error(`refusing: "${sweep.job}" belongs to a different authorization`);
    process.exit(2);
  }
}

if (mode === "enable") {
  console.log(
    "\n!! ENABLING THESE SCHEDULES AUTHORIZES THE FIRST LIVE PRODUCTION PURGE\n" +
      "!! of error_events, scheduled_job_health and rate_limit_events.\n",
  );
  console.log("count-only dry run, printed here so no one enables without seeing it:\n");
  try {
    console.log(
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL("phase-2h-retention-dry-run.mjs", import.meta.url))],
        { encoding: "utf8" },
      ),
    );
  } catch (failure) {
    console.error("the dry run failed; refusing to enable a purge whose size is unknown");
    console.error(failure.stdout ?? failure.message);
    process.exit(1);
  }

  for (const sweep of SWEEPS) {
    await query(`select cron.schedule('${sweep.job}', '${sweep.cadence}', 'select public.${sweep.fn}();')`);
    console.log(`scheduled ${sweep.job}  ${sweep.cadence}  -> public.${sweep.fn}()`);
  }
} else {
  for (const sweep of SWEEPS) {
    if (!scheduledNow.includes(sweep.job)) continue;
    await query(`select cron.unschedule('${sweep.job}')`);
    console.log(`unscheduled ${sweep.job}`);
  }
}

const after = await catalog();
console.log(`\ncron catalog AFTER (${after.length} jobs)`);
for (const job of after) console.log(`  ${job.name.padEnd(38)} ${job.schedule}  active=${job.active}`);

// Nothing that was not ours may have changed. A schedule script that quietly
// removed somebody else's job would be the destructive act this whole slice is
// built to make impossible.
const untouched = NOT_OURS.filter((name) => before.some((job) => job.name === name));
const lost = untouched.filter((name) => !after.some((job) => job.name === name));
if (lost.length > 0) {
  console.error(`\nFAILURE: jobs owned by another authorization disappeared: ${lost.join(", ")}`);
  process.exit(1);
}

const on = SWEEPS.filter((sweep) => after.some((job) => job.name === sweep.job)).length;
console.log(`\nPhase 2H retention sweeps scheduled: ${on}/${SWEEPS.length}`);
process.exit(mode === "enable" ? (on === SWEEPS.length ? 0 : 1) : on === 0 ? 0 : 1);
