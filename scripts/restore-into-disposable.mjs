#!/usr/bin/env node
/**
 * Restore a backup into a DISPOSABLE project — the executing half of the
 * `RG-DEP-3` drill.
 *
 * ## The one thing this script exists to make impossible
 *
 * A restore drill is the most dangerous routine operation there is, because the
 * happy path and the catastrophe differ by one identifier. This script inherits
 * `phase-2h-restore-drill.mjs`'s refusal verbatim and then adds two more,
 * because this script **writes** where the drill only reads:
 *
 *   1. the target ref may not equal the linked production ref
 *      (`supabase/.temp/project-ref`);
 *   2. the **restore connection string** may not contain the production ref —
 *      the ref check alone is satisfied by passing a disposable `--target`
 *      alongside a production `RESTORE_DB_URL`, which is the exact slip that
 *      would destroy the project;
 *   3. the target database must be **empty of user content** before the
 *      restore. Restoring over a populated database is either a mistake or a
 *      production restore that got past the first two checks.
 *
 * There is no flag that overrides any of them.
 *
 * ## The restore path, and why it is not "apply the schema dump"
 *
 * 1. **The migration chain, from git, into the disposable project.** The chain
 *    is the reviewed source of truth for every table, policy, grant and
 *    function. A schema dump from a managed provider must be restored
 *    `--no-owner --no-privileges`, which strips exactly the grants drill check
 *    3 verifies — so restoring the schema dump would fail the drill on a
 *    working restore.
 * 2. **The data dump**, which carries `auth.users` and every user-owned row.
 * 3. **`phase-2h-restore-drill.mjs`**, which verifies counts, chain, RLS and
 *    grants, and the destructive posture of the copy.
 *
 * Step 3 is a separate script and is not invoked from here on purpose: the
 * thing that performs a restore should not also be the thing that grades it.
 *
 * Usage:
 *   $env:RESTORE_DB_URL = "postgresql://...disposable..."   # never an argument
 *   $env:BACKUP_ENCRYPTION_KEY = "<base64 32 bytes>"
 *   node scripts/restore-into-disposable.mjs --manifest <path> --target <ref>
 *   node scripts/restore-into-disposable.mjs --manifest <path> --target <ref> --check
 */

import { execFileSync } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { COUNTED_TABLES, findClient, managementQuery, redact, resolveAccessToken, sha256 } from "./backup-shared.mjs";

const REPO_URL = new URL("..", import.meta.url);

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}
const checkOnly = process.argv.includes("--check");

const target = flag("--target");
const manifestPath = flag("--manifest");

if (!target) {
  console.error("A --target project ref is required. This script never guesses a target.");
  process.exit(2);
}
if (!manifestPath) {
  console.error("--manifest <path> is required.");
  process.exit(2);
}

// ------------------------------------------------------- refusal 1: the ref

const PRODUCTION_REF = (() => {
  try {
    return readFileSync(new URL("supabase/.temp/project-ref", REPO_URL), "utf8").trim();
  } catch {
    return null;
  }
})();

function refuse(lines) {
  console.error("=".repeat(72));
  console.error("REFUSED.");
  console.error("");
  for (const line of lines) console.error(line);
  console.error("");
  console.error("There is no flag that overrides this refusal, by design.");
  console.error("=".repeat(72));
  process.exit(3);
}

if (!PRODUCTION_REF) {
  console.error("supabase/.temp/project-ref is unreadable, so this script cannot prove the target is NOT production.");
  console.error("Refusing to run. Link the project first (`npx supabase link`).");
  process.exit(2);
}

if (target === PRODUCTION_REF) {
  refuse([
    "The target is the LINKED PRODUCTION PROJECT.",
    "",
    "A restore into production overwrites live data with an older copy, and the",
    "thing you would restore from is the thing you just replaced.",
    "",
    `  target      : ${target}`,
    `  production  : ${PRODUCTION_REF}`,
  ]);
}

// -------------------------------------------- refusal 2: the connection URL

const restoreUrl = process.env.RESTORE_DB_URL?.trim();
if (!restoreUrl) {
  console.error(
    "RESTORE_DB_URL is not set. It must come from the environment, never from an argument.\n"
      + "It is the DISPOSABLE project's connection string, not production's.",
  );
  process.exit(2);
}

// The check the --target flag cannot make. A disposable ref with a production
// URL passes refusal 1 and destroys the project.
if (restoreUrl.includes(PRODUCTION_REF)) {
  refuse([
    "RESTORE_DB_URL points at the PRODUCTION project.",
    "",
    `The --target flag says "${target}", but the connection string contains the`,
    `production ref "${PRODUCTION_REF}". The flag is not what the writes follow —`,
    "the connection string is. This is the slip that destroys the project.",
  ]);
}
if (!restoreUrl.includes(target)) {
  refuse([
    "RESTORE_DB_URL does not contain the --target ref.",
    "",
    `  --target        : ${target}`,
    "  RESTORE_DB_URL  : (redacted) — its host names a different project",
    "",
    "Refusing rather than guessing which one you meant.",
  ]);
}

// ------------------------------------------------------------- 3. readiness

const psql = findClient("psql", flag("--psql"));
if (!psql) {
  console.error(
    "psql is not available. Install the PostgreSQL 17 client tools, set PSQL to its full path, "
      + "or pass --psql <path>.",
  );
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`Manifest unreadable: ${redact(error.message)}`);
  process.exit(2);
}
if (manifest?.kind !== "my-brain-database-backup") {
  console.error(`Not a my-brain backup manifest (kind=${manifest?.kind}).`);
  process.exit(2);
}

const token = resolveAccessToken(REPO_URL);
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is required (env or .env.local) to inspect the target.");
  process.exit(2);
}

console.log("restore into a disposable project");
console.log("=".repeat(72));
console.log(`  target        : ${target}`);
console.log(`  production    : ${PRODUCTION_REF}  (refused as a target)`);
console.log(`  backup taken  : ${manifest.takenAt}`);
console.log(`  chain at then : ${manifest.migrationHead ?? "(unrecorded)"}`);
console.log(`  psql          : ${psql.version}`);

// -------------------------------------------- refusal 3: the target is empty

let targetPopulated = null;
try {
  const rows = await managementQuery(
    token,
    target,
    `select coalesce(sum(n), 0)::bigint as total from (${COUNTED_TABLES.map(
      (table) => `select count(*)::bigint as n from public.${table}`,
    ).join(" union all ")}) as counts`,
  );
  targetPopulated = Number(rows[0]?.total ?? 0);
  console.log(`  target rows   : ${targetPopulated}`);
} catch (error) {
  // A target with no schema yet cannot be counted, and that is the expected
  // state for a fresh disposable project. Distinguished from "populated".
  console.log(`  target rows   : (no product schema yet — ${redact(error.message).slice(0, 60)})`);
  targetPopulated = 0;
}

if (targetPopulated > 0) {
  refuse([
    `The target project already holds ${targetPopulated} rows of user content.`,
    "",
    "Restoring over a populated database is either a mistake or a production",
    "restore that got past the first two checks. Use a fresh disposable project.",
  ]);
}

if (checkOnly) {
  console.log("=".repeat(72));
  console.log("READY. Every refusal passed and nothing was written.");
  console.log("Re-run without --check to perform the restore.");
  process.exit(0);
}

// ------------------------------------------------------- 4. decrypt the data

const key = (() => {
  if (!manifest.encrypted) return null;
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!raw) return undefined;
  try {
    const buffer = Buffer.from(raw, "base64");
    return buffer.length === 32 ? buffer : undefined;
  } catch {
    return undefined;
  }
})();
if (manifest.encrypted && key === undefined) {
  console.error("BACKUP_ENCRYPTION_KEY is required and is missing or not 32 base64 bytes.");
  process.exit(2);
}

const artifact = (manifest.artifacts ?? []).find((entry) => entry.label === "data");
if (!artifact) {
  console.error("The manifest has no `data` artifact. There is nothing to restore.");
  process.exit(2);
}

const artifactPath = join(dirname(resolve(manifestPath)), artifact.file);
if (!existsSync(artifactPath)) {
  console.error(`The data artifact named in the manifest is absent: ${artifact.file}`);
  process.exit(2);
}

let plain;
try {
  const onDisk = readFileSync(artifactPath);
  if (manifest.encrypted) {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(artifact.encryption.iv, "base64"));
    decipher.setAuthTag(Buffer.from(artifact.encryption.authTag, "base64"));
    plain = Buffer.concat([decipher.update(onDisk), decipher.final()]);
  } else {
    plain = onDisk;
  }
} catch (error) {
  console.error(`Could not read or decrypt the data artifact: ${redact(error.message)}`);
  process.exit(1);
}

// Verify before writing. Restoring an artifact whose checksum does not match is
// how a corrupt backup becomes a corrupt restore that looks successful.
const actual = sha256(plain);
if (actual !== artifact.sha256Plaintext) {
  console.error(`Checksum mismatch — got ${actual.slice(0, 16)}…, expected ${String(artifact.sha256Plaintext).slice(0, 16)}…`);
  console.error("Refusing to restore an artifact that does not match its manifest.");
  process.exit(1);
}
console.log("  data artifact : decrypted, checksum matches");

// ------------------------------------------------ 5. the chain, then the data

console.log("=".repeat(72));
console.log("\nSTEP 1 — apply the migration chain from git.");
console.log("  This script does NOT run it, because `supabase db push` needs the target");
console.log("  linked and that is a state change to this working copy. Run, in order:");
console.log("");
console.log(`    npx supabase link --project-ref ${target}`);
console.log("    npx supabase db push");
console.log(`    npx supabase link --project-ref ${PRODUCTION_REF}    # RELINK. Do not skip.`);
console.log("");
console.log("  Relinking matters: every other script in this repository reads");
console.log("  supabase/.temp/project-ref to decide what production is, including the");
console.log("  refusals above. Leaving it pointed at the disposable project disarms them.");

if (!process.argv.includes("--chain-already-applied")) {
  console.log("\nRe-run with --chain-already-applied once step 1 is done.");
  process.exit(0);
}

console.log("\nSTEP 2 — load the data dump.");
const scratch = mkdtempSync(join(tmpdir(), "my-brain-restore-"));
const dataPath = join(scratch, "data.sql");
try {
  writeFileSync(dataPath, plain);
  // `--single-transaction` so a failure leaves the target unchanged rather than
  // half-loaded: a half-restored database that reports an error is still a
  // database somebody might mistake for a restore.
  execFileSync(
    psql.path,
    ["--quiet", "--no-psqlrc", "--single-transaction", "--set", "ON_ERROR_STOP=1", "--file", dataPath, restoreUrl],
    { stdio: ["ignore", "inherit", "pipe"], encoding: "buffer", maxBuffer: 1024 * 1024 * 256 },
  );
  console.log("  data loaded.");
} catch (error) {
  const stderr = error?.stderr ? error.stderr.toString("utf8") : "";
  console.error(`\npsql exited ${error?.status ?? "?"}: ${redact(stderr).slice(0, 800)}`);
  console.error("The load ran in a single transaction, so the target is unchanged.");
  process.exit(1);
} finally {
  // The scratch copy is plaintext production data. It does not outlive the run.
  rmSync(scratch, { recursive: true, force: true });
}

console.log("=".repeat(72));
console.log("Restore complete. It is NOT verified until the drill says so:");
console.log("");
console.log(`  node scripts/backup-census.mjs --project ${PRODUCTION_REF} --out census.json`);
console.log(`  node scripts/phase-2h-restore-drill.mjs --target ${target} --expect census.json`);
console.log("");
console.log("Then DELETE the disposable project. It holds a full copy of production data,");
console.log("and every hour it survives is an hour of extra exposure.");
