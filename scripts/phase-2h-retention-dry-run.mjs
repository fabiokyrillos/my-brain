#!/usr/bin/env node
/**
 * `2H-RETENTION-003` — the count-only transcript for Phase 2H's three
 * observability classes.
 *
 * ## What it can and cannot do
 *
 * It calls the three `count_prunable_*` twins against the linked project and
 * prints class, window, cutoff, count and boundary evidence. It **cannot delete
 * a row**: every destructive half is granted to NO role at all, including the
 * service role this script authenticates as. "Run the wrong one by accident" is
 * not a mistake available here.
 *
 * It prints no user content. The output is three integers, three timestamps and
 * three function names.
 *
 * ## A non-zero count is not authorization
 *
 * The same rule SH.6 wrote and the owner restated for this phase: approving a
 * schedule is not approving a purge, and reading a count is not approving one
 * either. This script exists so the size of a first deletion can be seen BEFORE
 * anyone decides. Nothing in the repository can execute the live sweeps; only
 * `pg_cron` can, and only after an owner runs the scheduling script's
 * `--enable`.
 *
 * ## The boundary evidence, and why the transcript is worthless without it
 *
 * A count alone cannot be told apart from a count produced by a broken
 * predicate. For each class the script reports the cutoff instant and the
 * **oldest row still inside the window** — so "the oldest survivor is newer
 * than the cutoff" is checkable months later, by someone who was not here.
 *
 * Usage:
 *   npm run ops:retention-dry-run
 *   npm run ops:retention-dry-run -- --json
 */

import { readFileSync } from "node:fs";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const asJson = process.argv.includes("--json");

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
if (!url || !serviceRoleKey) {
  console.error("A linked Supabase project with a service-role key is required.");
  process.exit(2);
}

/**
 * The classes, read from the constants module rather than retyped.
 *
 * Retyping them here would be a fourth copy of a window that already lives in
 * `private.retention_windows` and in `observability-retention.ts`, and the
 * fourth copy is always the one that drifts.
 */
const CLASSES = (() => {
  const source = readFileSync(new URL("../src/lib/observability-retention.ts", import.meta.url), "utf8");
  const signed = Number(
    /export const PHASE_2H_OBSERVABILITY_RETENTION_DAYS = (\d+)/.exec(source)?.[1] ?? NaN,
  );
  const block = source.slice(source.indexOf("export const OBSERVABILITY_RETENTION"));
  const entry =
    /key: "([a-z_]+)",\s*days: (PHASE_2H_OBSERVABILITY_RETENTION_DAYS|\d+),\s*table: "([a-z_]+)",\s*column: "([a-z_]+)",\s*sweep: "([a-z_]+)",\s*twin: "([a-z_]+)",/g;
  return [...block.matchAll(entry)].map(([, key, days, table, column, sweep, twin]) => ({
    key,
    days: days === "PHASE_2H_OBSERVABILITY_RETENTION_DAYS" ? signed : Number(days),
    table,
    column,
    sweep,
    twin,
  }));
})();

if (CLASSES.length === 0 || CLASSES.some((entry) => !entry.key || !entry.twin || Number.isNaN(entry.days))) {
  // Fail closed on a broken read. A dry run that silently measured zero classes
  // would print "nothing to prune" and read exactly like a clean database.
  console.error("Could not read the retention classes from src/lib/observability-retention.ts.");
  console.error("Refusing to print a transcript that would look like an empty result.");
  process.exit(2);
}

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
 * Timestamps only — no id, no owner, no content.
 *
 * Three outcomes, kept three: readable-with-a-row, readable-and-empty, and
 * NOT readable. Collapsing the third into the second would print "(none in
 * window)" for a table this role is refused on, which reads as evidence and is
 * the absence of it.
 */
async function boundary(entry, cutoff) {
  const query =
    `${url}/rest/v1/${entry.table}` +
    `?select=${entry.column}` +
    `&${entry.column}=gte.${encodeURIComponent(cutoff)}` +
    `&order=${entry.column}.asc&limit=1`;
  const response = await fetch(query, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) return { readable: false, reason: `HTTP ${response.status}`, oldest: null };
  const rows = await response.json();
  return { readable: true, reason: null, oldest: rows?.[0]?.[entry.column] ?? null };
}

const now = new Date();
const report = [];

for (const entry of CLASSES) {
  const cutoff = new Date(now.getTime() - entry.days * 86_400_000).toISOString();
  let count = null;
  let error = null;
  try {
    count = await rpc(entry.twin);
  } catch (failure) {
    error = failure.message;
  }
  report.push({
    class: entry.key,
    windowDays: entry.days,
    cutoff,
    measuredOn: `${entry.table}.${entry.column}`,
    prunable: count,
    boundary:
      count === null
        ? { readable: false, reason: "twin unavailable", oldest: null }
        : await boundary(entry, cutoff),
    twin: entry.twin,
    sweep: entry.sweep,
    error,
  });
}

if (asJson) {
  console.log(
    JSON.stringify({ project: new URL(url).hostname, runAt: now.toISOString(), report }, null, 2),
  );
} else {
  console.log(`project : ${new URL(url).hostname}`);
  console.log(`run at  : ${now.toISOString()}`);
  console.log("mode    : COUNT ONLY -- every destructive half is executable by no role\n");
  for (const row of report) {
    console.log(`${row.class}`);
    console.log(`  window          : ${row.windowDays} days (PRD sec. 14.1, signed)`);
    console.log(`  cutoff          : ${row.cutoff}`);
    console.log(`  measured on     : ${row.measuredOn}`);
    console.log(`  prunable rows   : ${row.error ? `UNAVAILABLE (${row.error})` : row.prunable}`);
    console.log(
      `  oldest surviving: ${
        row.boundary.readable
          ? (row.boundary.oldest ?? "(no row inside the window)")
          : `NOT READABLE (${row.boundary.reason})`
      }`,
    );
    console.log(`  twin            : ${row.twin}`);
    console.log(`  sweep (unscheduled): ${row.sweep}\n`);
  }
  const total = report.reduce((sum, row) => sum + (row.prunable ?? 0), 0);
  console.log(`total prunable across Phase 2H observability classes: ${total}`);
  console.log(
    total === 0
      ? "\nNothing is out of window. No purge is due, and none is authorized either way."
      : "\nA NON-ZERO COUNT IS NOT AUTHORIZATION. Record this transcript and stop; the\n" +
          "first live sweep against production is an owner decision taken after reading it.",
  );
}

process.exit(report.some((row) => row.error) ? 1 : 0);
