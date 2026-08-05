#!/usr/bin/env node
/**
 * The retention schedule switch — SH-RETENTION-008's authorization gate.
 *
 * ## Why this exists at all, which is a defect worth reading
 *
 * Migration `202608050077` ends with a `cron.schedule(...)` block for all seven
 * sweeps. Applying it to the hosted project therefore did what the migration
 * said and **scheduled every destructive sweep** — five of which had never run
 * against production and none of which the owner had authorized. The first live
 * purge would have happened at 04:11 UTC the next morning, and the dry-run
 * transcript that is supposed to PRECEDE that decision would have been produced
 * afterwards, describing a deletion that had already happened.
 *
 * Nothing was lost: the dry-run measured zero eligible rows in every class, so
 * the run would have deleted nothing. That is luck rather than design — the
 * oldest `heartbeat_runs` row crosses its 30-day line within a fortnight — and
 * the gap between "approved the schedule" and "authorized the purge" is exactly
 * what amendment P-1 exists to keep open.
 *
 * The five new schedules were removed from the hosted project on 2026-08-05,
 * along with a duplicate of BYOK's own validation sweep that the same block had
 * created under a second name. The two sweeps that pre-date SH.6 and were
 * already authorized — `byok-prune-validation-attempts` and
 * `sh-prune-auth-event-attempts` — were left exactly as they were.
 *
 * ## What this script is
 *
 * The missing gate, as an explicit act. `--status` reads what is scheduled;
 * `--enable` schedules the five SH.6 sweeps; `--disable` removes them again.
 * Enabling IS the authorization of the first live purge, and the script says so
 * before it does anything.
 *
 * It never deletes a row itself. The sweeps remain executable by no role, so
 * even this script cannot purge — it can only hand the decision to pg_cron.
 *
 * Usage:
 *   node scripts/sh6-retention-schedule.mjs             # status
 *   node scripts/sh6-retention-schedule.mjs --enable    # authorize; sweeps begin nightly
 *   node scripts/sh6-retention-schedule.mjs --disable   # remove them again
 */

import { readFileSync } from "node:fs";

const mode = process.argv.includes("--enable")
  ? "enable"
  : process.argv.includes("--disable")
    ? "disable"
    : "status";

/**
 * The five SH.6 sweeps and their approved cadences.
 *
 * `sh-prune-auth-event-attempts` is NOT here: SH.5's `202608040075` scheduled
 * it and the owner accepted it then, so it is not this gate's business and
 * removing it would be undoing a decision that was already made. Nor is BYOK's
 * `byok-prune-validation-attempts`, for the same reason.
 */
const SWEEPS = [
  { job: "sh-prune-terminal-jobs", cadence: "11 4 * * *", fn: "prune_terminal_jobs" },
  { job: "sh-prune-notifications", cadence: "17 4 * * *", fn: "prune_notifications" },
  { job: "sh-prune-product-events", cadence: "23 4 * * *", fn: "prune_product_events" },
  { job: "sh-prune-heartbeat-runs", cadence: "29 4 * * *", fn: "prune_heartbeat_runs" },
  { job: "sh-prune-undo-operations", cadence: "35 4 * * *", fn: "prune_undo_operations" },
];

/**
 * SQL goes over the Management API rather than through the CLI.
 *
 * `supabase db query` would mean building a shell command string, and on
 * Windows the quoting mangles any statement containing quotes -- which is every
 * statement here, because a cron job name is a quoted literal. The endpoint the
 * CLI itself posts to takes JSON, so nothing needs escaping and there is no
 * shell in the path at all.
 *
 * The token is never printed: it is read once and used only as a bearer header.
 */
const REPO = new URL("..", import.meta.url);

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    const text = readFileSync(new URL(".env.local", REPO), "utf8");
    const match = /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/m.exec(text);
    return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const TOKEN = accessToken();
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is unavailable (environment or .env.local).");
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
  if (!response.ok) throw new Error(`query failed: ${response.status} ${body.slice(0, 160)}`);
  return JSON.parse(body);
}

async function scheduled() {
  const rows = await query("select jobname from cron.job order by jobname");
  return rows.map((row) => row.jobname);
}

const before = await scheduled();
console.log("currently scheduled:");
for (const job of before) console.log(`  ${job}`);

if (mode === "status") {
  const on = SWEEPS.filter((s) => before.includes(s.job));
  console.log(
    `\nSH.6 retention sweeps scheduled: ${on.length}/${SWEEPS.length}`
      + (on.length === 0
        ? "\n\nNo SH.6 retention sweep is scheduled. No purge can run, which is the\n"
          + "posture SH.6 closed in: the mechanism exists and the first live deletion\n"
          + "is still an owner decision (amendment P-1).\n\n"
          + "Run with --enable to authorize it. That IS the authorization."
        : "\n\nSH.6 sweeps are scheduled and WILL delete rows at their next cadence."),
  );
  process.exit(0);
}

if (mode === "enable") {
  console.log(
    "\n!! ENABLING THESE SCHEDULES AUTHORIZES THE FIRST LIVE PRODUCTION PURGE.\n"
      + "   Purged rows are unrecoverable; there is no soft delete and no tombstone.\n"
      + "   Run `npm run sh6:retention-dry-run` first and read the counts.\n",
  );
  for (const sweep of SWEEPS) {
    await query(`select cron.schedule('${sweep.job}', '${sweep.cadence}', 'select public.${sweep.fn}();')`);
    console.log(`  scheduled ${sweep.job} at ${sweep.cadence}`);
  }
} else {
  for (const sweep of SWEEPS) {
    if (!before.includes(sweep.job)) continue;
    await query(`select cron.unschedule('${sweep.job}')`);
    console.log(`  unscheduled ${sweep.job}`);
  }
}

const after = await scheduled();
console.log("\nafter:");
for (const job of after) console.log(`  ${job}`);
const on = SWEEPS.filter((s) => after.includes(s.job)).length;
console.log(`\nSH.6 retention sweeps scheduled: ${on}/${SWEEPS.length}`);
process.exit(mode === "enable" ? (on === SWEEPS.length ? 0 : 1) : (on === 0 ? 0 : 1));
