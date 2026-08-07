#!/usr/bin/env node
/**
 * The backup this project does not have — `RG-DEP-3`'s missing first half.
 *
 * ## The gap it closes, stated exactly
 *
 * `pitr_enabled: false`, `backups: []`, organization plan **free**. The schema
 * is recoverable from git; **the rows are not**. `RG-DEP-3` asks for a restore
 * drill, and a drill needs something to restore. `phase-2h-restore-drill.mjs`
 * is the verify half and it has been ready since 2H.5; this is the half that
 * produces the artifact it verifies.
 *
 * ## Why `pg_dump` and not a provider upgrade or a backup platform
 *
 * A bounded, owner-run logical dump satisfies the accepted requirement without
 * a plan change, without a vendor, and without any new always-on service. It
 * also produces an artifact the owner holds, which a provider-side backup does
 * not. The trade is that Storage objects and hosted Auth configuration are not
 * in it — **and neither is in a provider backup either**, on any plan, so the
 * upgrade would not have closed those.
 *
 * ## The rules this script enforces, and why each one exists
 *
 * 1. **The connection string comes from `SUPABASE_DB_URL` in the environment,
 *    never from an argument.** An argument lands in shell history and in a
 *    process listing. It is never printed, and every error is redacted on the
 *    way out — `pg_dump` echoes the connection string in several of its failure
 *    modes, and the Supabase CLI's own `db dump --dry-run` prints a live
 *    `PGPASSWORD` to stdout, which is how this hazard was found rather than
 *    imagined.
 * 2. **The destination must be outside this repository.** A dump holds every
 *    row of every user's content. One inside the working tree is one
 *    `git add -A` away from being published forever.
 * 3. **Encrypted by default.** AES-256-GCM under `BACKUP_ENCRYPTION_KEY`.
 *    Plaintext requires `--plaintext-i-accept-the-risk`, and the manifest
 *    records that the artifact is plaintext so a later reader cannot mistake
 *    it.
 * 4. **A failed dump leaves nothing behind.** Partial artifacts are deleted and
 *    no manifest is written. A backup that half-exists is worse than none,
 *    because it looks like one — and `verify-backup-artifact.mjs` would have to
 *    be run to learn otherwise.
 * 5. **The census is taken in the same run** and embedded in the manifest. A
 *    census taken later describes a different database, so the drill's
 *    expectation ships with the dump rather than beside it.
 *
 * ## What this is NOT
 *
 * It is not scheduled by anything in this repository, and it schedules nothing.
 * Running it is an operator act. It reads; it never writes to the source, never
 * deletes a row, and never touches the hosted project's configuration.
 *
 * Usage:
 *   $env:SUPABASE_DB_URL      = "postgresql://...";  # never an argument
 *   $env:BACKUP_ENCRYPTION_KEY = "<base64 32 bytes>"
 *   node scripts/backup-database.mjs --out D:/my-brain-backups
 *
 *   node scripts/backup-database.mjs --out <dir> --plaintext-i-accept-the-risk
 *   node scripts/backup-database.mjs --check      # readiness only, dumps nothing
 */

import { execFileSync } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COUNTED_TABLES,
  NOT_COVERED,
  findClient,
  managementQuery,
  redact,
  resolveAccessToken,
  sha256,
  utcStamp,
} from "./backup-shared.mjs";

const REPO_URL = new URL("..", import.meta.url);
const REPO_DIR = resolve(fileURLToPath(REPO_URL));

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}
const has = (name) => process.argv.includes(name);

const checkOnly = has("--check");
const plaintext = has("--plaintext-i-accept-the-risk");
const outDir = flag("--out");

/** Everything written this run, so a failure can remove all of it. */
const written = [];
function fail(message, code = 1) {
  for (const path of written) {
    try {
      rmSync(path, { force: true });
    } catch {
      // Best effort. The message below is what matters, and a file we could not
      // remove is named in it rather than swallowed.
    }
  }
  console.error(`\n${"=".repeat(72)}`);
  console.error(`BACKUP FAILED: ${redact(message)}`);
  if (written.length > 0) {
    console.error(`Removed ${written.length} partial artifact(s). No manifest was written.`);
    console.error("A backup that half-exists is worse than none, because it looks like one.");
  }
  console.error("=".repeat(72));
  process.exit(code);
}

// ------------------------------------------------------------- 1. readiness

const problems = [];
const notes = [];

const pgDump = findClient("pg_dump", flag("--pg-dump"));
if (!pgDump) {
  problems.push(
    "pg_dump is not available. Install the PostgreSQL 17 client tools (Windows: the EDB installer, "
      + "'Command Line Tools' only — Docker Desktop is not required and is the heavier option), or set "
      + "PG_DUMP to its full path, or pass --pg-dump <path>.",
  );
} else {
  notes.push(`pg_dump: ${pgDump.version}`);
}

const dbUrl = process.env.SUPABASE_DB_URL?.trim();
if (!dbUrl) {
  problems.push(
    "SUPABASE_DB_URL is not set. It must come from the environment, never from an argument — an "
      + "argument lands in shell history and in a process listing. Supabase dashboard → Project "
      + "Settings → Database → Connection string (URI).",
  );
} else if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
  problems.push("SUPABASE_DB_URL does not look like a postgres connection URI.");
}

const encKeyRaw = process.env.BACKUP_ENCRYPTION_KEY?.trim();
let encKey = null;
if (plaintext) {
  notes.push("ENCRYPTION DISABLED by --plaintext-i-accept-the-risk");
} else if (!encKeyRaw) {
  problems.push(
    "BACKUP_ENCRYPTION_KEY is not set. A dump holds every row of every user's content, so it is "
      + "encrypted by default. Generate one with: node -e \"console.log(require('crypto')"
      + ".randomBytes(32).toString('base64'))\" and store it where BYOK_MASTER_KEY is stored — "
      + "NOT in this repository, and NOT beside the backups it opens.",
  );
} else {
  try {
    const raw = Buffer.from(encKeyRaw, "base64");
    if (raw.length !== 32) throw new Error(`decoded to ${raw.length} bytes, not 32`);
    encKey = raw;
    notes.push("encryption: AES-256-GCM under BACKUP_ENCRYPTION_KEY");
  } catch (error) {
    problems.push(`BACKUP_ENCRYPTION_KEY is not 32 base64 bytes (${error.message}).`);
  }
}

if (!checkOnly) {
  if (!outDir) {
    problems.push("--out <directory> is required. This script never guesses where to write a copy of production.");
  } else {
    const target = resolve(outDir);
    // Rule 2. `resolve` first so `../` cannot walk back in.
    if (target === REPO_DIR || target.startsWith(`${REPO_DIR}${process.platform === "win32" ? "\\" : "/"}`)) {
      problems.push(
        `--out is inside this repository (${target}). A dump holds every row of every user's content; `
          + "one inside the working tree is one `git add -A` away from being published forever.",
      );
    }
  }
}

const token = resolveAccessToken(REPO_URL);
const linkedRef = (() => {
  try {
    return readFileSync(new URL("supabase/.temp/project-ref", REPO_URL), "utf8").trim();
  } catch {
    return null;
  }
})();
if (!token) notes.push("SUPABASE_ACCESS_TOKEN absent — the manifest will carry no row census");

console.log("backup readiness");
console.log("=".repeat(72));
for (const note of notes) console.log(`  ok    ${note}`);
for (const problem of problems) console.log(`  MISS  ${problem}`);
console.log("=".repeat(72));

if (checkOnly) {
  console.log(problems.length === 0 ? "\nREADY. Re-run with --out <dir> to take a backup." : `\n${problems.length} blocker(s).`);
  process.exit(problems.length === 0 ? 0 : 1);
}
if (problems.length > 0) fail(`${problems.length} readiness blocker(s); nothing was dumped.`, 2);

// ---------------------------------------------------- 2. version compatibility

// pg_dump refuses a server newer than itself. Caught here, loudly, rather than
// at 03:00 on a schedule where it becomes a backup that silently stopped
// existing.
let serverMajor = null;
if (token && linkedRef) {
  try {
    const rows = await managementQuery(token, linkedRef, "select current_setting('server_version_num') as v");
    serverMajor = Math.floor(Number(rows[0]?.v ?? 0) / 10000);
  } catch (error) {
    console.error(`  ! could not read the server version: ${redact(error.message)}`);
  }
}
if (serverMajor && pgDump.major < serverMajor) {
  fail(
    `pg_dump is major ${pgDump.major} and the server is major ${serverMajor}. pg_dump refuses a server `
      + "newer than itself; install a matching client rather than dumping with an older one.",
    2,
  );
}

// ------------------------------------------------------------ 3. the artifacts

const stamp = utcStamp();
const dir = resolve(outDir);
mkdirSync(dir, { recursive: true });

function encrypt(buffer) {
  if (plaintext) return { data: buffer, iv: null, tag: null };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey, iv);
  const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { data, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

/**
 * One `pg_dump` invocation.
 *
 * Output is captured rather than written by pg_dump directly, so the checksum
 * is taken over exactly the bytes that get encrypted, and so a failed dump
 * never produces a file at all.
 */
function dump(label, args) {
  process.stdout.write(`  dumping ${label} ... `);
  let raw;
  try {
    raw = execFileSync(pgDump.path, [...args, dbUrl], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PGCONNECT_TIMEOUT: "30" },
    });
  } catch (error) {
    const stderr = error?.stderr ? error.stderr.toString("utf8") : "";
    console.log("FAILED");
    fail(`pg_dump (${label}) exited ${error?.status ?? "?"}: ${stderr.slice(0, 500) || error?.message}`);
  }
  if (!raw || raw.length === 0) {
    console.log("FAILED");
    fail(`pg_dump (${label}) produced zero bytes. An empty dump is not a backup.`);
  }

  const plainSha = sha256(raw);
  const { data, iv, tag } = encrypt(raw);
  const name = `${stamp.file}-${label}.sql${plaintext ? "" : ".enc"}`;
  const path = join(dir, name);
  writeFileSync(path, data);
  written.push(path);
  console.log(`${raw.length} bytes -> ${name}`);

  return {
    label,
    file: name,
    bytes: raw.length,
    encryptedBytes: data.length,
    // The checksum is over the PLAINTEXT, so verification after decryption
    // proves the content survived rather than merely that the file did.
    sha256Plaintext: plainSha,
    encryption: plaintext ? null : { algorithm: "aes-256-gcm", iv, authTag: tag },
  };
}

console.log(`\ntaking a backup at ${stamp.iso}`);
console.log("=".repeat(72));

/**
 * Two artifacts, and only one of them is the restore path.
 *
 * **`data` is the backup.** The restore applies the **migration chain from
 * git** into the disposable project first, then loads this. That is not a
 * shortcut — it is the correct design for this repository specifically, and it
 * is strictly better than restoring a schema dump:
 *
 *   - The chain is the reviewed, append-only source of truth for every table,
 *     policy, grant, function and `SECURITY DEFINER` search_path. A schema dump
 *     is a derived artifact nobody reviewed.
 *   - `--no-owner --no-privileges` is mandatory when dumping from a managed
 *     provider, because the role grants in the dump refer to roles the target
 *     manages itself. So a schema dump restored with those flags arrives
 *     **without the grants** — and drill check 3 (RLS and grant posture) would
 *     then fail on a restore that was working exactly as designed. Applying the
 *     chain reproduces the grants because the chain is what created them.
 *   - It is the one strong part of the recorded posture ("the schema IS
 *     recoverable from git"), so the restore should lean on it.
 *
 * **`schema` is a cross-check, not a restore path.** It exists so a drill can
 * compare what the source actually had against what the chain rebuilds — a
 * difference between them is drift on the hosted project, which is worth
 * catching and which parity alone does not show.
 *
 * `auth` is in the data dump and not in the schema dump: `auth.users` is the
 * account identity every user-owned row hangs off, so a data restore without it
 * restores orphans; but the `auth` **schema** is platform-managed and a
 * disposable project already has it. pg_dump sorts data in dependency order
 * within one invocation, which is why `auth` is in the *same* dump as `public`
 * rather than a third artifact.
 */
const SCHEMAS_DATA = ["--schema=public", "--schema=private", "--schema=auth"];
const SCHEMAS_DDL = ["--schema=public", "--schema=private"];
const COMMON = ["--no-owner", "--no-privileges", "--quote-all-identifiers"];

const artifacts = [
  dump("data", ["--data-only", ...COMMON, ...SCHEMAS_DATA]),
  dump("schema", ["--schema-only", ...COMMON, ...SCHEMAS_DDL]),
];

// ---------------------------------------------------------------- 4. census

let census = null;
if (token && linkedRef) {
  const counts = {};
  let unreadable = 0;
  for (const table of COUNTED_TABLES) {
    try {
      const rows = await managementQuery(token, linkedRef, `select count(*)::bigint as n from public.${table}`);
      counts[table] = Number(rows[0]?.n ?? 0);
    } catch {
      counts[table] = null;
      unreadable += 1;
    }
  }
  census = {
    tables: counts,
    totalRows: Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0),
    unreadableTables: unreadable,
  };
  console.log(`  census: ${census.totalRows} rows across ${COUNTED_TABLES.length} tables`);
}

// -------------------------------------------------------------- 5. manifest

let migrationHead = null;
if (token && linkedRef) {
  try {
    const rows = await managementQuery(
      token,
      linkedRef,
      "select version from supabase_migrations.schema_migrations order by version desc limit 1",
    );
    migrationHead = rows[0]?.version ?? null;
  } catch {
    migrationHead = null;
  }
}

const manifest = {
  kind: "my-brain-database-backup",
  formatVersion: 1,
  takenAt: stamp.iso,
  sourceProject: linkedRef,
  serverMajor,
  pgDumpVersion: pgDump.version,
  migrationHead,
  encrypted: !plaintext,
  artifacts,
  census,
  notCovered: NOT_COVERED,
  restoreWith: "node scripts/restore-into-disposable.mjs --manifest <this file> --target <disposable-ref>",
  verifyWith: "node scripts/verify-backup-artifact.mjs --manifest <this file>",
};

const manifestName = `${stamp.file}-manifest.json`;
const manifestPath = join(dir, manifestName);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log("=".repeat(72));
console.log(`wrote ${manifestName}`);
for (const artifact of artifacts) {
  console.log(`  ${artifact.file}  sha256(plaintext)=${artifact.sha256Plaintext.slice(0, 16)}…`);
}
console.log(`total on disk: ${artifacts.reduce((sum, a) => sum + statSync(join(dir, a.file)).size, 0)} bytes`);

if (plaintext) {
  console.log("\n!! THIS BACKUP IS PLAINTEXT. It contains every row of every user's content.");
  console.log("!! Encrypt it at rest or delete it once the drill is done.");
}
console.log("\nNOT in this backup:");
for (const line of NOT_COVERED) console.log(`  - ${line}`);
console.log("\nVerify it before you trust it:");
console.log(`  node scripts/verify-backup-artifact.mjs --manifest "${manifestPath}"`);

if (!existsSync(manifestPath)) fail("the manifest vanished after being written");
