#!/usr/bin/env node
/**
 * The operator system-health read — `2H-OPS-001`, `2H-SINK-005`,
 * `2H-DEADMAN-004`.
 *
 * One command that answers, without a dashboard and without a session: is the
 * queue moving, are the scheduled jobs alive, is the deployed code the code in
 * this repository, and what has been failing.
 *
 * ## Why these four are one command
 *
 * They are one command because the failure this phase exists to prevent lives
 * *between* them. On 2026-08-06 every account deletion had been stalling for
 * two days: the schedule was healthy, the queue was empty, the code was
 * correct, and the deployed function was two days behind a migration that
 * revoked the grant it depended on. Each surface, read alone, said fine.
 *
 * ## The boundary — ADR-075
 *
 * An operator CLI over narrow `service_role` SQL. No product admin UI, no
 * generic service-role HTTP endpoint, and no mutation: every RPC it calls is
 * declared `stable`, granted to `service_role` alone, and returns aggregates
 * and classifications. Nothing here can write, and nothing here returns entry
 * text, task text, a file name, a prompt, model output, a provider message, a
 * stack trace, a credential, a token or a session identifier.
 *
 * The one identifier this file can print is a user id, and only via
 * `--stalled`, which is 2H.1's existing operator read for accounts stuck in
 * deletion. That read already refuses to touch `account_deletion_log`, whose
 * rows carry the requesting session's hash.
 *
 * Usage:
 *   node scripts/phase-2h-operator-health.mjs [--window 7d] [--staleness 3] [--json]
 *
 * Exit code is 0 when nothing needs attention and 1 when something does, so it
 * is usable as a check and not only as a report.
 */

import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";
import { parityFindings, readEdgeFunctionParity } from "./edge-function-parity.mjs";

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const asJson = process.argv.includes("--json");

/**
 * The error-sink window, as a Postgres interval. Bounded here as well as in the
 * function, so a typo produces a refusal rather than a year of rows.
 */
const windowFlag = String(flag("window", "7d"));
const windowMatch = /^([0-9]{1,3})([hd])$/.exec(windowFlag);
if (!windowMatch) {
  console.error("--window must look like 24h or 7d (max 365d)");
  process.exit(2);
}
const errorWindow = `${windowMatch[1]} ${windowMatch[2] === "h" ? "hours" : "days"}`;

/**
 * How many of its own intervals a job may miss before it is stale. A required
 * argument of the liveness function for the reason every ceiling in this chain
 * is required: a default is a number nobody chose.
 */
const staleness = Number(flag("staleness", "3"));
if (!Number.isFinite(staleness) || staleness < 1 || staleness > 100) {
  console.error("--staleness must be between 1 and 100");
  process.exit(2);
}

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function call(name, args) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name} failed (${error.code ?? "unknown"}): ${error.message}`);
  return data ?? [];
}

const [queue, liveness, findings, sink] = await Promise.all([
  call("operator_job_queue_health", {}),
  call("scheduled_job_liveness", { p_staleness_multiple: staleness }),
  call("operator_scheduled_job_findings", { p_window: errorWindow }),
  call("operator_error_event_volume", { p_window: errorWindow }),
]);

// Parity is a git-and-platform fact, so it is read here rather than in SQL. It
// is in the same report because `2H-DEADMAN-004` says the deployment gap has to
// be visible beside the liveness state, not in a second tool nobody runs.
let parity;
let parityError = null;
try {
  parity = readEdgeFunctionParity();
} catch (error) {
  parity = [];
  parityError = error instanceof Error ? error.message : "unknown error";
}

const expiredLeases = queue.reduce((total, row) => total + Number(row.expired_lease_count ?? 0), 0);
const unhealthyJobs = liveness.filter(
  (row) => row.liveness === "stale" || row.liveness === "never_reported" || row.liveness === "unknown_interval",
);
const staleFunctions = parityFindings(parity);

const attention = expiredLeases > 0
  || unhealthyJobs.length > 0
  || findings.length > 0
  || staleFunctions.length > 0
  || parityError !== null;

if (asJson) {
  console.log(JSON.stringify(
    { queue, liveness, findings, sink, parity, parityError, window: errorWindow, staleness },
    null,
    2,
  ));
  process.exit(attention ? 1 : 0);
}

console.log(`system health — error window ${errorWindow}, staleness ${staleness}x each job's own interval\n`);

console.log("JOB QUEUE");
if (queue.length === 0) console.log("  the queue is empty\n");
else {
  for (const row of queue) {
    console.log(
      `  ${String(row.job_type).padEnd(20)} ${String(row.status).padEnd(11)} `
      + `${String(row.job_count).padStart(6)}  claimable now ${String(row.due_now_count).padStart(4)}`
      + `  expired leases ${String(row.expired_lease_count).padStart(4)}`,
    );
  }
  console.log("");
}

console.log("SCHEDULED JOBS");
for (const row of liveness) {
  const since = row.seconds_since_success === null
    ? "never reported"
    : `${Math.round(Number(row.seconds_since_success) / 60)} min since last success`;
  console.log(
    `  ${String(row.job_name).padEnd(32)} ${String(row.liveness).padEnd(17)} ${row.schedule}  ${since}`,
  );
  if (row.last_useful_at === null && row.last_success_at !== null) {
    console.log("      succeeding, but has never reported useful work");
  }
}
console.log("");

if (findings.length > 0) {
  console.log("SCHEDULED-JOB FINDINGS");
  for (const row of findings) {
    console.log(
      `  ${String(row.finding).padEnd(26)} ${String(row.job_name).padEnd(32)} `
      + `x${row.occurrence_count}${row.last_seen_at ? `  last ${row.last_seen_at}` : ""}`,
    );
  }
  console.log("");
}

console.log("EDGE FUNCTION PARITY");
if (parityError) console.log(`  unreadable: ${parityError}`);
for (const row of parity) {
  console.log(`  ${row.slug.padEnd(17)} ${row.state}${row.version ? ` (v${row.version})` : ""}`);
  if (row.undeployedCommit) console.log(`      undeployed: ${row.undeployedCommit}`);
}
console.log("");

console.log(`ERROR SINK (last ${errorWindow})`);
if (sink.length === 0) console.log("  nothing recorded in the window");
else {
  for (const row of sink) {
    console.log(
      `  ${String(row.surface).padEnd(15)} ${String(row.operation).padEnd(22)} `
      + `${String(row.reason).padEnd(22)} x${String(row.event_count).padStart(5)}`
      + `  ${row.has_owner_count} with an owner  last ${row.last_seen_at}`,
    );
  }
}
console.log("");

if (!attention) {
  console.log("nothing needs attention: no expired lease, every scheduled job current,");
  console.log("every deployed function at or ahead of its source.");
  process.exit(0);
}

console.log("NEEDS ATTENTION");
if (expiredLeases > 0) console.log(`  ${expiredLeases} job(s) holding an expired lease`);
for (const row of unhealthyJobs) console.log(`  ${row.job_name} is ${row.liveness}`);
for (const row of findings) console.log(`  ${row.finding}: ${row.job_name}`);
for (const row of staleFunctions) console.log(`  Edge Function ${row.slug} is ${row.state}`);
if (parityError) console.log("  Edge Function parity could not be read");
process.exit(1);
