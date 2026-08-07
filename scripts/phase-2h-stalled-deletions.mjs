#!/usr/bin/env node
/**
 * The operator read for stuck deletions -- 2H-RECOVER-004.
 *
 * This is the read whose absence made the 2026-08-04 stall take a day to
 * diagnose. It answers, in one command: which accounts are stuck in `deleting`,
 * how many times each has been retried, why the last attempt stopped, when the
 * next one is due, and which have gone terminal.
 *
 * Read-only, and narrow by construction. It calls exactly one function --
 * `operator_stalled_deletions`, `service_role`-only and `SECURITY DEFINER` --
 * which reads the recovery table and the lifecycle table. It never touches
 * `account_deletion_log`: that table holds the requesting session's hash, no
 * role can read it, and answering "why did this stop?" by widening it would
 * have traded a privacy guarantee for an operability one. The reason lives on
 * the recovery row instead, from a closed vocabulary, and nothing else does.
 *
 * ADR-075 is the boundary: an operator CLI over `service_role` SQL, no product
 * admin UI and no service-role HTTP endpoint.
 *
 * Usage: node scripts/phase-2h-stalled-deletions.mjs [--limit N] [--json]
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";
import { createClient } from "@supabase/supabase-js";

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

const { data, error } = await admin.rpc("operator_stalled_deletions", { p_limit: limit });
if (error) {
  console.error(`operator_stalled_deletions failed (${error.code ?? "unknown"}): ${error.message}`);
  process.exit(1);
}

const rows = data ?? [];

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(rows.some((row) => row.recovery_state === "stalled") ? 1 : 0);
}

if (rows.length === 0) {
  console.log("no account is in deletion recovery: nothing is stuck, and nothing is being retried");
  process.exit(0);
}

console.log(`${rows.length} account(s) in deletion recovery (terminal first)\n`);
for (const row of rows) {
  console.log(`  ${row.user_id}`);
  console.log(`    lifecycle       ${row.lifecycle_status}`);
  console.log(`    recovery        ${row.recovery_state}${row.claim_active ? " (attempt in flight)" : ""}`);
  console.log(`    attempts        ${row.attempt_count}`);
  console.log(`    stopped because ${row.last_stop_reason ?? "-- no attempt has reported yet"}`);
  console.log(`    first seen      ${row.first_seen_at}`);
  console.log(`    last attempt    ${row.last_attempt_at ?? "-- never"}`);
  console.log(`    next attempt    ${row.next_attempt_at ?? "-- none: terminal"}`);
  console.log("");
}

const stalled = rows.filter((row) => row.recovery_state === "stalled");
if (stalled.length > 0) {
  console.log(
    `${stalled.length} account(s) are TERMINAL: they spent their retry ceiling and are no longer\n`
      + "being retried. They need a person. Nothing about them is silent any more, which is\n"
      + "the whole of what this mechanism buys.",
  );
}

// A non-zero exit when something is terminal, so this is usable as a check and
// not only as a report.
process.exit(stalled.length > 0 ? 1 : 0);
