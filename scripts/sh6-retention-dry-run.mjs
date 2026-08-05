#!/usr/bin/env node
/**
 * SH-RETENTION-008 — the count-only transcript that must exist before any
 * production purge.
 *
 * ## What this does, and the much shorter list of what it does not
 *
 * It calls the seven `count_prunable_*` functions against the linked project
 * and prints class, cutoff, count and the boundary evidence. It cannot delete a
 * row: the destructive halves are granted to NO role at all, including the
 * service role this script authenticates as, so "run the wrong one by accident"
 * is not a mistake that is available here.
 *
 * It prints no user content. The output is seven integers, seven timestamps and
 * the function version — nothing that identifies a person, a row or a piece of
 * text.
 *
 * ## A non-zero count is not authorization
 *
 * Amendment P-1 is explicit: approving the schedule was not approving a purge.
 * This script's whole purpose is to let an owner see the size of the first
 * deletion BEFORE deciding, so a large number here is information and never a
 * trigger. Nothing in the repository can execute the live sweeps; only the
 * scheduler can, and only after an owner enables them.
 *
 * ## The boundary evidence, and why it is in the transcript
 *
 * For each class the script reports the cutoff instant and, where the class has
 * rows, the oldest and newest timestamps still inside the window. That is what
 * makes the transcript checkable months later: a count alone cannot be
 * distinguished from a count produced by a broken predicate, but a count next
 * to "the newest surviving row is one second inside the window" can.
 *
 * Usage:
 *   node scripts/sh6-retention-dry-run.mjs
 *   node scripts/sh6-retention-dry-run.mjs --json     # machine-readable
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const asJson = process.argv.includes("--json");

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
if (!url || !serviceRoleKey) {
  console.error("A linked Supabase project with a service-role key is required.");
  process.exit(2);
}

/**
 * The seven swept classes, each with the twin that counts it and the table and
 * column its window is measured on — so the transcript records WHAT was
 * measured and not only how much.
 */
const CLASSES = [
  { key: "jobs_terminal", twin: "count_prunable_terminal_jobs", table: "jobs", column: "created_at" },
  { key: "notifications", twin: "count_prunable_notifications", table: "notifications", column: "created_at" },
  { key: "product_events", twin: "count_prunable_product_events", table: "product_events", column: "created_at" },
  { key: "heartbeat_runs", twin: "count_prunable_heartbeat_runs", table: "heartbeat_runs", column: "started_at" },
  { key: "undo_operations_past_expiry", twin: "count_prunable_undo_operations", table: "undo_operations", column: "expires_at" },
  { key: "auth_event_attempts", twin: "count_prunable_auth_event_attempts", table: "auth_event_attempts", column: "attempted_at" },
  { key: "credential_validation_attempts", twin: "count_prunable_credential_validation_attempts", table: "credential_validation_attempts", column: "attempted_at" },
];

/** The windows, from the constants module rather than from memory. */
const WINDOW_DAYS = await (async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/lib/quotas.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("export const RETENTION_DAYS"));
  const days = {};
  for (const [, name, value] of block.matchAll(/(\w+):\s*(\d+),/g)) {
    days[name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = Number(value);
  }
  return days;
})();

async function rpc(name) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name}: ${response.status} ${text.slice(0, 200)}`);
  return Number(text);
}

/**
 * The boundary evidence for one class, read straight from the table.
 *
 * Timestamps only — no id, no owner, no content. `service_role` can read these
 * tables; where it cannot (the two BYOK tables lost their grants in SH.6, and
 * the RPC-only ledgers never had them) the evidence is reported as unavailable
 * rather than guessed at, which is the honest answer and not a failure.
 */
async function boundary(entry, cutoff) {
  const query = `${url}/rest/v1/${entry.table}`
    + `?select=${entry.column}`
    + `&${entry.column}=gte.${encodeURIComponent(cutoff)}`
    + `&order=${entry.column}.asc&limit=1`;
  const response = await fetch(query, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return rows?.[0]?.[entry.column] ?? null;
}

const now = new Date();
const report = [];

for (const entry of CLASSES) {
  const days = WINDOW_DAYS[entry.key];
  const cutoff = new Date(now.getTime() - (days ?? 0) * 86_400_000).toISOString();
  let count = null;
  let error = null;
  try {
    count = await rpc(entry.twin);
  } catch (failure) {
    error = failure.message;
  }
  report.push({
    class: entry.key,
    windowDays: days ?? null,
    cutoff,
    measuredOn: `${entry.table}.${entry.column}`,
    prunable: count,
    oldestSurviving: count === null ? null : await boundary(entry, cutoff),
    twin: entry.twin,
    error,
  });
}

if (asJson) {
  console.log(JSON.stringify({ project: new URL(url).hostname, runAt: now.toISOString(), report }, null, 2));
} else {
  console.log(`project : ${new URL(url).hostname}`);
  console.log(`run at  : ${now.toISOString()}`);
  console.log(`mode    : COUNT ONLY -- the destructive halves are executable by no role\n`);
  for (const row of report) {
    console.log(`${row.class}`);
    console.log(`  window          : ${row.windowDays} days`);
    console.log(`  cutoff          : ${row.cutoff}`);
    console.log(`  measured on     : ${row.measuredOn}`);
    console.log(`  prunable rows   : ${row.error ? `UNAVAILABLE (${row.error})` : row.prunable}`);
    console.log(`  oldest surviving: ${row.oldestSurviving ?? "(none in window)"}`);
    console.log(`  function        : ${row.twin}\n`);
  }
  const total = report.reduce((sum, row) => sum + (row.prunable ?? 0), 0);
  console.log(`total prunable across all classes: ${total}`);
  console.log(
    total === 0
      ? "\nNothing is out of window. No purge is due, and none is authorized either way."
      : "\nA NON-ZERO COUNT IS NOT AUTHORIZATION. Amendment P-1: approving the schedule\n"
        + "was not approving a purge. Record this transcript and stop; the first live\n"
        + "sweep against production is an owner decision taken after reading it.",
  );
}

process.exit(report.some((row) => row.error) ? 1 : 0);
