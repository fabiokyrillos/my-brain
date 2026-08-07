#!/usr/bin/env node
/**
 * The pre-backup row census — the number a restore is checked against.
 *
 * ## Why this is a separate script, and why it runs today
 *
 * `scripts/phase-2h-restore-drill.mjs` verifies a restored copy against
 * `--expect census.json`. Nothing produced that file. Without it the drill
 * degrades to "the restore is not empty", which a restore that recovered one
 * table out of twenty also satisfies.
 *
 * This script reads the **source** project through the Supabase Management API
 * `database/query` endpoint, so it needs **no Docker, no pg_dump and no
 * database password** — only `SUPABASE_ACCESS_TOKEN`, which the drill already
 * requires. That matters: the census must be takeable at the moment the backup
 * is taken, and a census that needs the same tooling the backup needs is a
 * census that will not exist when the backup fails.
 *
 * ## What a census is for, stated narrowly
 *
 * It is **not** a backup and it is not evidence that one exists. It is the
 * expectation a restore is measured against, and it is only meaningful when it
 * is taken from the source at the same time as the dump. A census taken a week
 * later describes a different database.
 *
 * The manifest written by `backup-database.mjs` embeds a census taken in the
 * same run, for exactly this reason. This script exists so a census can also be
 * taken on its own — before a provider-side restore, for instance, where there
 * is no local dump to attach it to.
 *
 * Usage:
 *   node scripts/backup-census.mjs                     # source = linked project
 *   node scripts/backup-census.mjs --out ./census.json
 *   node scripts/backup-census.mjs --project <ref>     # explicit source
 */

import { readFileSync, writeFileSync } from "node:fs";

import { COUNTED_TABLES, managementQuery, resolveAccessToken, utcStamp } from "./backup-shared.mjs";

const REPO = new URL("..", import.meta.url);

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const linkedRef = (() => {
  try {
    return readFileSync(new URL("supabase/.temp/project-ref", REPO), "utf8").trim();
  } catch {
    return null;
  }
})();

const project = flag("--project") ?? linkedRef;
if (!project) {
  console.error("No project ref. Pass --project <ref> or link the project (`npx supabase link`).");
  process.exit(2);
}

const token = resolveAccessToken(REPO);
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is required (env or .env.local).");
  process.exit(2);
}

const stamp = utcStamp();
const counts = {};
let unreadable = 0;

for (const table of COUNTED_TABLES) {
  try {
    const rows = await managementQuery(token, project, `select count(*)::bigint as n from public.${table}`);
    counts[table] = Number(rows[0]?.n ?? 0);
  } catch (failure) {
    // A table that cannot be read is recorded as null rather than as zero.
    // Zero is a claim about the database; null is a claim about the census, and
    // conflating them is how a restore of nothing passes a count check.
    counts[table] = null;
    unreadable += 1;
    console.error(`  ! ${table}: ${failure.message}`);
  }
}

const total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);

const census = {
  takenAt: stamp.iso,
  project,
  isLinkedProject: project === linkedRef,
  tables: counts,
  totalRows: total,
  unreadableTables: unreadable,
  // Named in the artifact itself, so a census read a year from now carries its
  // own limitations rather than depending on somebody finding the runbook.
  notCovered: [
    "Storage objects — not in the database, not in any database backup, on any plan.",
    "Hosted Auth configuration (disable_signup, CAPTCHA, redirect allow list, SMTP).",
    "External secrets, including BYOK_MASTER_KEY, without which credential envelopes restore as unreadable ciphertext.",
    "Vault secrets.",
  ],
};

const outPath = flag("--out");
if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(census, null, 2)}\n`, "utf8");
}

console.log(`census of ${project}${census.isLinkedProject ? " (LINKED PRODUCTION)" : ""} at ${stamp.iso}`);
console.log("=".repeat(72));
for (const [table, value] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(32)} ${value === null ? "UNREADABLE" : value}`);
}
console.log("=".repeat(72));
console.log(`  ${"TOTAL".padEnd(32)} ${total}`);
if (outPath) console.log(`\nwrote ${outPath}`);

// A census in which nothing could be read is not a census, and a drill run
// against it would compare a restore to nothing at all.
if (unreadable === COUNTED_TABLES.length) {
  console.error("\nEvery table was unreadable. This is not a census.");
  process.exit(1);
}
if (unreadable > 0) {
  console.error(`\n${unreadable} table(s) unreadable — the census is incomplete and is recorded as such.`);
  process.exit(1);
}
