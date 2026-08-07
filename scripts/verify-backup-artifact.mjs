#!/usr/bin/env node
/**
 * Verify a backup artifact before anyone trusts it.
 *
 * ## The failure this exists to catch
 *
 * A backup is a file that sits untouched until the day it is the only copy. On
 * that day it is too late to discover the dump was truncated, the encryption
 * key was wrong, or the disk lied. Every check here is cheap, and running it on
 * a schedule is the difference between having a backup and having a file.
 *
 * ## What it checks, and why the checksum alone is not enough
 *
 * 1. **Every artifact named in the manifest exists.**
 * 2. **It decrypts** — under `BACKUP_ENCRYPTION_KEY`, with the GCM auth tag
 *    verified. A wrong key fails here rather than at 03:00 during a recovery.
 * 3. **SHA-256 of the PLAINTEXT matches the manifest.** The manifest records
 *    the checksum of the decrypted bytes on purpose: checksumming the
 *    ciphertext proves the file survived, not that the content did.
 * 4. **The dump is structurally a dump.** A file of the right size with the
 *    right checksum can still be an error page. So: the schema artifact must
 *    contain `CREATE TABLE` statements, and the data artifact must contain
 *    `COPY` statements for the tables the census counted. A dump that
 *    checksums perfectly and restores an empty database passes 1–3 and fails
 *    here, which is the whole point.
 * 5. **The census is non-trivial** — a manifest recording zero rows across
 *    every table is a backup of nothing.
 *
 * Usage:
 *   node scripts/verify-backup-artifact.mjs --manifest <path>
 *   node scripts/verify-backup-artifact.mjs --manifest <path> --quiet
 */

import { createDecipheriv } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { COUNTED_TABLES, redact, sha256 } from "./backup-shared.mjs";

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}
const quiet = process.argv.includes("--quiet");

const manifestPath = flag("--manifest");
if (!manifestPath) {
  console.error("--manifest <path> is required.");
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

const dir = dirname(resolve(manifestPath));
const findings = [];
function check(name, ok, detail) {
  if (!quiet || !ok) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
  if (!ok) findings.push(name);
}

console.log(`verifying backup taken ${manifest.takenAt} from ${manifest.sourceProject ?? "(unrecorded)"}`);
console.log(`migration head at backup time: ${manifest.migrationHead ?? "(unrecorded)"}`);
console.log("=".repeat(72));

const key = (() => {
  if (!manifest.encrypted) return null;
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!raw) return undefined; // distinguishable from "not needed"
  try {
    const buffer = Buffer.from(raw, "base64");
    return buffer.length === 32 ? buffer : undefined;
  } catch {
    return undefined;
  }
})();

if (manifest.encrypted && key === undefined) {
  console.error("BACKUP_ENCRYPTION_KEY is required to verify an encrypted backup, and is missing or not 32 base64 bytes.");
  process.exit(2);
}

const plaintexts = new Map();

for (const artifact of manifest.artifacts ?? []) {
  const path = join(dir, artifact.file);

  if (!existsSync(path)) {
    check(`${artifact.file} exists`, false, "named in the manifest, absent on disk");
    continue;
  }
  check(`${artifact.file} exists`, true);

  const onDisk = readFileSync(path);
  let plain;
  if (manifest.encrypted) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(artifact.encryption.iv, "base64"));
      decipher.setAuthTag(Buffer.from(artifact.encryption.authTag, "base64"));
      plain = Buffer.concat([decipher.update(onDisk), decipher.final()]);
      check(`${artifact.file} decrypts and its auth tag verifies`, true);
    } catch (error) {
      // GCM's tag failing IS the tamper/wrong-key signal; there is no partial
      // success to report and nothing below can run.
      check(`${artifact.file} decrypts and its auth tag verifies`, false, redact(error.message));
      continue;
    }
  } else {
    plain = onDisk;
  }

  const actual = sha256(plain);
  check(
    `${artifact.file} plaintext checksum matches`,
    actual === artifact.sha256Plaintext,
    actual === artifact.sha256Plaintext ? undefined : `got ${actual.slice(0, 16)}…, expected ${String(artifact.sha256Plaintext).slice(0, 16)}…`,
  );
  check(`${artifact.file} plaintext size matches`, plain.length === artifact.bytes, `${plain.length} vs ${artifact.bytes}`);

  plaintexts.set(artifact.label, plain.toString("utf8"));
}

// ------------------------------------------------- structure, not just bytes

const schema = plaintexts.get("schema");
if (schema !== undefined) {
  const tables = (schema.match(/CREATE TABLE/gi) ?? []).length;
  check("the schema artifact contains CREATE TABLE statements", tables >= 20, `${tables} found`);
}

const data = plaintexts.get("data");
if (data !== undefined) {
  const copies = (data.match(/^COPY /gim) ?? []).length;
  check("the data artifact contains COPY statements", copies >= 10, `${copies} found`);

  // The tables the drill will compare. A dump missing one of them restores a
  // database that is missing it too, and the drill would report that as a
  // restore failure rather than as a backup failure.
  const missing = COUNTED_TABLES.filter(
    (table) => !new RegExp(`COPY "?(public)"?\\."?${table}"?`, "i").test(data),
  );
  check(
    "every censused table appears in the data dump",
    missing.length === 0,
    missing.length === 0 ? undefined : `absent: ${missing.join(", ")}`,
  );

  check("auth.users is in the data dump", /COPY "?auth"?\."?users"?/i.test(data),
    "without it, every restored user-owned row is an orphan");
}

// ------------------------------------------------------------------- census

const census = manifest.census;
if (!census) {
  check("the manifest carries a row census", false, "no census — the drill has nothing to compare against");
} else {
  check("the manifest carries a row census", true, `${census.totalRows} rows`);
  check("the census is not empty", (census.totalRows ?? 0) > 0, "a backup of zero rows is a backup of nothing");
  check("every censused table was readable", (census.unreadableTables ?? 0) === 0, `${census.unreadableTables} unreadable`);
}

check("the manifest records what the backup does NOT cover", Array.isArray(manifest.notCovered) && manifest.notCovered.length >= 3);

if (!manifest.encrypted) {
  console.log("\n!! This backup is PLAINTEXT and contains every row of every user's content.");
}

console.log("=".repeat(72));
if (findings.length === 0) {
  console.log("VERIFIED. Every artifact is present, intact, and structurally a dump.");
  console.log("This does NOT prove it restores. Only the drill proves that:");
  console.log("  node scripts/restore-into-disposable.mjs --manifest <path> --target <disposable-ref>");
  process.exit(0);
}
console.log(`NOT VERIFIED — ${findings.length} finding(s):`);
for (const finding of findings) console.log(`  - ${finding}`);
console.log("\nDo not treat this artifact as a backup.");
process.exit(1);
