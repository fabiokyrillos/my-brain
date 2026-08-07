#!/usr/bin/env node
/**
 * The operator account-health read — `2H-OPS-002`.
 *
 * Lifecycle distribution, plus the deletion-recovery state of every account
 * that is stuck: how many attempts each has spent, when the last one ran, when
 * the next one is due, and the declared reason the last one stopped.
 *
 * This is the read whose absence made the 2026-08-04 stall take a day to
 * diagnose. There was no way to ask "is anything stuck?" — the only evidence
 * the failure existed was a person noticing a screen that never changed.
 *
 * ## What it deliberately cannot show
 *
 * No email, no session identifier, no session hash, no user content. The
 * per-account detail comes from 2H.1's `operator_stalled_deletions`, which
 * refuses to read `account_deletion_log` at all — that table holds the
 * requesting session's hash, and answering "why did this stop?" by widening it
 * would have traded a privacy guarantee for an operability one. The stop reason
 * lives on the recovery row instead, from a closed vocabulary.
 *
 * A user id does appear, because an operator who cannot name the stuck account
 * cannot act on it, and that identifier is the join key 2H.1 already chose.
 *
 * ADR-075 is the boundary: an operator CLI over narrow `service_role` SQL. No
 * product admin UI, no service-role HTTP endpoint, no mutation.
 *
 * Usage: node scripts/phase-2h-account-health.mjs [--limit N] [--json]
 *
 * Exits 1 when an account has gone terminal, so it is usable as a check.
 */

import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const limitFlag = process.argv.indexOf("--limit");
const limit = limitFlag === -1 ? 100 : Number.parseInt(process.argv[limitFlag + 1] ?? "100", 10);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  console.error("--limit must be an integer between 1 and 500");
  process.exit(2);
}
const asJson = process.argv.includes("--json");

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function call(name, args) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name} failed (${error.code ?? "unknown"}): ${error.message}`);
  return data ?? [];
}

const [lifecycle, recovery, stalled] = await Promise.all([
  call("operator_account_lifecycle_summary", {}),
  call("operator_deletion_recovery_summary", {}),
  call("operator_stalled_deletions", { p_limit: limit }),
]);

const terminal = stalled.filter((row) => row.recovery_state === "stalled");

if (asJson) {
  console.log(JSON.stringify({ lifecycle, recovery, stalled }, null, 2));
  process.exit(terminal.length > 0 ? 1 : 0);
}

console.log("ACCOUNT LIFECYCLE");
for (const row of lifecycle) {
  console.log(
    `  ${String(row.lifecycle_status).padEnd(12)} ${String(row.account_count).padStart(6)}`
    + `  oldest change ${row.oldest_changed_at}`,
  );
}
console.log("");

console.log("DELETION RECOVERY");
if (recovery.length === 0) {
  console.log("  no account is in deletion recovery: nothing is stuck, and nothing is being retried\n");
} else {
  for (const row of recovery) {
    console.log(
      `  ${String(row.recovery_state).padEnd(12)} ${String(row.account_count).padStart(6)}`
      + `  max attempts ${row.max_attempt_count}`
      + `  oldest ${row.oldest_first_seen_at}`
      + `  next due ${row.next_attempt_due_at ?? "-- none: terminal"}`,
    );
  }
  console.log("");

  for (const row of stalled) {
    console.log(`  ${row.user_id}`);
    console.log(`    lifecycle       ${row.lifecycle_status}`);
    console.log(`    recovery        ${row.recovery_state}${row.claim_active ? " (attempt in flight)" : ""}`);
    console.log(`    attempts        ${row.attempt_count}`);
    console.log(`    stopped because ${row.last_stop_reason ?? "-- no attempt has reported yet"}`);
    console.log(`    last attempt    ${row.last_attempt_at ?? "-- never"}`);
    console.log(`    next attempt    ${row.next_attempt_at ?? "-- none: terminal"}`);
    console.log("");
  }
}

if (terminal.length === 0) process.exit(0);

console.log(
  `${terminal.length} account(s) are TERMINAL: they spent their retry ceiling and are no longer\n`
  + "being retried. They need a person. Nothing about them is silent any more, which is\n"
  + "the whole of what this mechanism buys.",
);
process.exit(1);
