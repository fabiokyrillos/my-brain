/**
 * The bounded two-key master-key rotation, executed.
 *
 * `BYOK_INCIDENT_RUNBOOK.md` §2a describes two honest shapes for a master-key
 * rotation. This is the first one: a **bounded window** in which the previous
 * key is read-only and temporary, every new write uses the current key, and
 * `key_version` says which key sealed each row so nothing ever has to guess.
 * The second shape — invalidate-and-ask — is right for a compromise and wrong
 * for hygiene, and this script does not implement it.
 *
 * ## What it does, in order
 *
 *   1. resolves the key ring and refuses to run unless a window is genuinely
 *      open (`--status` reports without changing anything);
 *   2. reads every credential row's `key_version` and reports progress;
 *   3. for each row still at the previous version: decrypts with the previous
 *      key, re-encrypts with the current key under the *same* AAD context but
 *      the new version, and writes ciphertext, iv and `key_version` in one
 *      statement;
 *   4. re-reads and reports what remains.
 *
 * ## What it deliberately does not do
 *
 * **It does not touch plaintext beyond the re-seal.** No logging, no file, no
 * echo. The only thing printed is counts and row ids.
 *
 * **It does not trial-decrypt.** The row's own `key_version` selects exactly
 * one key. A row at a version neither key covers is reported as `unreadable`
 * and left alone — never re-sealed from a guess, and never counted as done.
 *
 * **It does not decide when the window closes.** That is
 * `BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT`, and removing the previous key is an
 * owner action after this script reports `remaining: 0`.
 *
 * **It is operator-only.** It reads the master keys, so it runs where they
 * already are. Nothing in the product calls it and no user can reach it.
 *
 * Usage:
 *   node scripts/byok-rotate-master-key.mjs --status
 *   node scripts/byok-rotate-master-key.mjs --apply [--limit N]
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const SEPARATOR = 0x1f;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const MAX_PREVIOUS_KEY_WINDOW_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const apply = process.argv.includes("--apply");
const limitFlag = process.argv.indexOf("--limit");
const limit = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) : Infinity;

function envFile() {
  return readFileSync(new URL("../.env.local", import.meta.url), "utf8");
}

function envValue(name) {
  for (const line of envFile().split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && match[1] === name) return match[2].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function fromStoredBytes(value) {
  if (typeof value === "string" && value.startsWith("\\x")) {
    const hex = value.slice(2);
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }
  return fromBase64(value);
}

function toStoredBytes(bytes) {
  let out = "\\x";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function decodeMasterKey(encoded, name) {
  if (!encoded) throw new Error(`${name} is not configured`);
  const bytes = fromBase64(encoded);
  if (bytes.length !== KEY_BYTES) {
    throw new Error(`${name} must decode to ${KEY_BYTES} bytes`);
  }
  return bytes;
}

/** The same composition as `src/lib/byok/envelope.ts`, byte for byte. */
function composeAad({ userId, keyVersion, provider }) {
  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(userId),
    encoder.encode(String(keyVersion)),
    encoder.encode(provider),
  ];
  const length = parts.reduce((total, part) => total + part.length, 0) + (parts.length - 1);
  const aad = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part, index) => {
    if (index > 0) aad[offset++] = SEPARATOR;
    aad.set(part, offset);
    offset += part.length;
  });
  return aad;
}

/** Mirrors `resolveMasterKeyRing`; the contract's reasoning lives there. */
function resolveRing(now) {
  const current = decodeMasterKey(envValue("BYOK_MASTER_KEY"), "BYOK_MASTER_KEY");
  const rawVersion = envValue("BYOK_MASTER_KEY_VERSION");
  const currentVersion = rawVersion ? Number(rawVersion) : 1;
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new Error("BYOK_MASTER_KEY_VERSION must be a positive integer");
  }

  const previousRaw = envValue("BYOK_PREVIOUS_MASTER_KEY");
  const expiresAt = envValue("BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT");
  if (!previousRaw) {
    if (expiresAt) {
      throw new Error("BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT is set without BYOK_PREVIOUS_MASTER_KEY");
    }
    return { current, currentVersion, previous: null, previousVersion: null };
  }

  const previous = decodeMasterKey(previousRaw, "BYOK_PREVIOUS_MASTER_KEY");
  if (currentVersion < 2) {
    throw new Error("BYOK_PREVIOUS_MASTER_KEY requires BYOK_MASTER_KEY_VERSION of at least 2");
  }
  if (!expiresAt) throw new Error("BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT is not configured");

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    throw new Error("BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT is not a valid instant");
  }
  const remaining = expiry.getTime() - now.getTime();
  if (remaining <= 0) return { current, currentVersion, previous: null, previousVersion: null };
  if (remaining > MAX_PREVIOUS_KEY_WINDOW_DAYS * MILLISECONDS_PER_DAY) {
    throw new Error(
      `BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT is more than ${MAX_PREVIOUS_KEY_WINDOW_DAYS} days away`,
    );
  }

  return { current, currentVersion, previous, previousVersion: currentVersion - 1 };
}

const ring = resolveRing(new Date());
console.log(`current key version: ${ring.currentVersion}`);
console.log(`previous key available: ${ring.previous !== null}`);

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const { data: rows, error } = await db
  .from("user_ai_credentials")
  .select("user_id,status,provider,key_version,ciphertext,iv")
  .eq("status", "active");
if (error) throw new Error(`credential read failed: ${error.code ?? error.message}`);

function summarize(all) {
  let atCurrent = 0;
  let atPrevious = 0;
  let unreadable = 0;
  for (const row of all) {
    if (row.key_version === ring.currentVersion) atCurrent += 1;
    else if (ring.previousVersion !== null && row.key_version === ring.previousVersion) {
      atPrevious += 1;
    } else unreadable += 1;
  }
  return { atCurrent, atPrevious, unreadable, remaining: atPrevious + unreadable };
}

const before = summarize(rows);
console.log(
  `rows: ${rows.length} | at current: ${before.atCurrent} | at previous: ${before.atPrevious}`
  + ` | unreadable: ${before.unreadable} | remaining: ${before.remaining}`,
);

if (!apply) {
  console.log(before.remaining === 0 ? "COMPLETE — the previous key can be removed" : "PENDING");
  process.exit(0);
}

if (ring.previous === null) {
  throw new Error("No open rotation window: nothing can be re-sealed");
}

const currentKey = await webcrypto.subtle.importKey("raw", ring.current, "AES-GCM", false, [
  "encrypt",
]);
const previousKey = await webcrypto.subtle.importKey("raw", ring.previous, "AES-GCM", false, [
  "decrypt",
]);

let resealed = 0;
let skipped = 0;
for (const row of rows) {
  if (row.key_version !== ring.previousVersion) continue;
  if (resealed >= limit) break;

  let plaintext;
  try {
    const opened = await webcrypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromStoredBytes(row.iv),
        additionalData: composeAad({
          userId: row.user_id,
          keyVersion: row.key_version,
          provider: row.provider,
        }),
      },
      previousKey,
      fromStoredBytes(row.ciphertext),
    );
    plaintext = new Uint8Array(opened);
  } catch {
    // Left alone, never guessed at, and never counted as done.
    console.log(`  ${row.user_id.slice(0, 8)}… UNREADABLE under the previous key — skipped`);
    skipped += 1;
    continue;
  }

  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await webcrypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: composeAad({
        userId: row.user_id,
        keyVersion: ring.currentVersion,
        provider: row.provider,
      }),
    },
    currentKey,
    plaintext,
  );
  plaintext.fill(0);

  const { error: writeError } = await db
    .from("user_ai_credentials")
    // One statement: a row must never exist with a new ciphertext and an old
    // version, which is the state that would make it permanently unreadable.
    .update({
      ciphertext: toStoredBytes(new Uint8Array(sealed)),
      iv: toStoredBytes(iv),
      key_version: ring.currentVersion,
    })
    .eq("user_id", row.user_id)
    .eq("key_version", row.key_version);
  if (writeError) {
    console.log(`  ${row.user_id.slice(0, 8)}… write refused (${writeError.code}) — skipped`);
    skipped += 1;
    continue;
  }

  resealed += 1;
  console.log(`  ${row.user_id.slice(0, 8)}… re-sealed at version ${ring.currentVersion}`);
}

const { data: after } = await db
  .from("user_ai_credentials")
  .select("user_id,key_version")
  .eq("status", "active");
const progress = summarize(after ?? []);

console.log(`\nre-sealed: ${resealed} | skipped: ${skipped}`);
console.log(
  `remaining: ${progress.remaining} (at previous: ${progress.atPrevious},`
  + ` unreadable: ${progress.unreadable})`,
);
console.log(
  progress.remaining === 0
    ? "COMPLETE — remove BYOK_PREVIOUS_MASTER_KEY and its expiry to close the window"
    : "INCOMPLETE — the previous key must stay until this reaches zero",
);
