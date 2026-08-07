#!/usr/bin/env node
/**
 * The deletion reaper's arming switch -- 2H-RECOVER-001's authorization act.
 *
 * ## Why the migration does not do this
 *
 * `202608070079` creates `reap_stalled_account_deletions` and schedules
 * nothing. ADR-082 is why: a migration that puts a job on `pg_cron` has already
 * authorized every run of that job, and it does so during `db push`, where
 * nobody is deciding anything. Signup Hardening learned this the expensive way
 * -- `202608050077` scheduled five destructive sweeps that no owner had
 * approved, and the first live purge was thirteen hours away when it was caught.
 *
 * This reaper is not a retention sweep: it re-invokes deletions a user already
 * requested under re-authentication and a typed confirmation, and it deletes
 * nothing itself. It is still the mechanism that drives the most destructive
 * operation in the product, so it is armed by an operator act that says so.
 *
 * ## The two halves of "armed"
 *
 * 1. **The schedule** -- this script's `--enable`. Puts the tick on `pg_cron`
 *    with the signed thresholds as explicit arguments.
 * 2. **The endpoint** -- two Vault secrets, `deletion_reap_url` and
 *    `deletion_reap_secret`, which this script does NOT write. They carry a
 *    deployment URL and a shared secret, and a script that took them as
 *    arguments would put them in a shell history. `--status` reports whether
 *    they are present; setting them is a Supabase dashboard or CLI action.
 *
 * Until both halves are done the tick still runs, still claims, still applies
 * the backoff and still classifies a hopeless deletion as `stalled` -- so
 * `npm run ops:stalled-deletions` answers "is anything stuck?" from the first
 * minute. What it does not do is invoke anything. Half-armed fails quiet, and
 * that is the intended failure direction.
 *
 * Usage:
 *   node scripts/phase-2h-deletion-reaper-schedule.mjs             # status
 *   node scripts/phase-2h-deletion-reaper-schedule.mjs --enable    # schedule the tick
 *   node scripts/phase-2h-deletion-reaper-schedule.mjs --disable   # remove it again
 */

import { readFileSync } from "node:fs";

const mode = process.argv.includes("--enable")
  ? "enable"
  : process.argv.includes("--disable")
    ? "disable"
    : "status";

const JOB_NAME = "my-brain-deletion-reaper";
/**
 * Every five minutes. The signed retry threshold is fifteen, so a tick this
 * often costs at most a third of one threshold in latency and never shortens
 * the threshold itself -- the claim predicate, not the cron cadence, decides
 * when a row is due.
 */
const CADENCE = "*/5 * * * *";

/**
 * PHASE_2H_PRD.md sec. 14.1, passed as explicit arguments.
 *
 * They are written here, in the operator act, rather than defaulted inside the
 * function, so the numbers a running system uses are readable in the thing that
 * armed it. Changing them is editing this file and re-running `--enable`.
 */
const RETRY_INTERVAL = "15 minutes";
const BACKOFF_CAP = "6 hours";
const MAX_ATTEMPTS = 5;
const LEASE = "5 minutes";
const BATCH_LIMIT = 25;

const STATEMENT = `select public.reap_stalled_account_deletions(`
  + `${BATCH_LIMIT}, ${MAX_ATTEMPTS}, interval '${RETRY_INTERVAL}', `
  + `interval '${BACKOFF_CAP}', interval '${LEASE}');`;

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
  if (!response.ok) throw new Error(`query failed: ${response.status} ${body.slice(0, 200)}`);
  return JSON.parse(body);
}

async function scheduled() {
  const rows = await query(
    `select jobname, schedule, active from cron.job where jobname = '${JOB_NAME}'`,
  );
  return rows[0] ?? null;
}

/**
 * Presence only. The secret's VALUE is never selected, printed or returned --
 * a status command that echoed it would be a status command that leaked it.
 */
async function vaultPosture() {
  const rows = await query(
    "select name from vault.secrets where name in ('deletion_reap_url', 'deletion_reap_secret')",
  );
  const names = rows.map((row) => row.name);
  return {
    url: names.includes("deletion_reap_url"),
    secret: names.includes("deletion_reap_secret"),
  };
}

const before = await scheduled();
const vault = await vaultPosture();

console.log(`schedule:  ${before ? `${before.jobname} [${before.schedule}] active=${before.active}` : "not scheduled"}`);
console.log(`endpoint:  deletion_reap_url=${vault.url ? "set" : "ABSENT"}, deletion_reap_secret=${vault.secret ? "set" : "ABSENT"}`);

if (mode === "status") {
  const armed = Boolean(before) && vault.url && vault.secret;
  console.log(
    `\nreaper: ${armed ? "ARMED -- stalled deletions are being retried automatically" : "NOT armed"}`,
  );
  if (!armed) {
    console.log(
      "\nWhile unarmed the tick still classifies, so `npm run ops:stalled-deletions`\n"
        + "still answers whether anything is stuck. Nothing is invoked.\n\n"
        + "To arm it: run this script with --enable, and set both Vault secrets\n"
        + "(deletion_reap_url = the deployed delete-account function URL,\n"
        + " deletion_reap_secret = the DELETION_REAP_SECRET set on that function).\n"
        + "This script deliberately does not write the secrets.",
    );
  }
  process.exit(0);
}

if (mode === "enable") {
  console.log(
    "\n!! SCHEDULING THIS TICK AUTHORIZES AUTOMATIC RE-INVOCATION OF ACCOUNT DELETION.\n"
      + `   It retries at most ${MAX_ATTEMPTS} times per account, backing off from\n`
      + `   ${RETRY_INTERVAL} and capped at ${BACKOFF_CAP}, then classifies the account\n`
      + "   `stalled` and stops. It deletes nothing itself: it re-invokes the executor,\n"
      + "   which still refuses everything it refused before.\n"
      + "   Run `npm run ops:stalled-deletions` first and read what is waiting.\n",
  );
  await query(`select cron.unschedule('${JOB_NAME}')`).catch(() => {});
  await query(`select cron.schedule('${JOB_NAME}', '${CADENCE}', $job$${STATEMENT}$job$)`);
  console.log(`  scheduled ${JOB_NAME} at ${CADENCE}`);
} else {
  if (!before) {
    console.log("\nnothing to remove");
    process.exit(0);
  }
  await query(`select cron.unschedule('${JOB_NAME}')`);
  console.log(`  unscheduled ${JOB_NAME}`);
}

const after = await scheduled();
console.log(`\nafter: ${after ? `${after.jobname} [${after.schedule}] active=${after.active}` : "not scheduled"}`);
process.exit(mode === "enable" ? (after ? 0 : 1) : (after ? 1 : 0));
