#!/usr/bin/env node
/**
 * SH-DELETE-015 — the one-time, owner-authorized removal of the historical
 * orphaned storage objects.
 *
 * ## Why this is a separate file from the scanner
 *
 * `verify-storage-orphans.mjs` holds no destructive call of any kind, and a
 * test asserts their absence by name over its comment-stripped source. That
 * property is worth keeping: a scanner that could destroy would eventually be
 * pointed at production by somebody trying to make a red gate go green. So the
 * capability lives here instead, in a file whose entire purpose is one act,
 * and which refuses to perform it unless the world still looks exactly like the
 * manifest says it does.
 *
 * ## The manifest is the authority, and it is read rather than trusted
 *
 * The committed manifest (`docs/reports/signup-hardening/SH_DELETE_015_ORPHAN_MANIFEST.md`) is
 * parsed at run time and its path set must match the live bucket **exactly** —
 * no extra object, no missing one. That is deliberate: the alternative is a
 * hard-coded list in this file, which would let the document and the act drift
 * apart, and the document is what the owner authorized.
 *
 * Age and filename are explicitly NOT criteria. Every object is re-classified
 * structurally, immediately before deletion, by the scanner's own
 * `classifyObject` — imported, not reimplemented, so the two cannot disagree.
 *
 * ## Dry run by default
 *
 * Prints what it would remove and exits. `--apply` performs the removal. Same
 * posture as `account-lifecycle-admin.mjs` and `byok-rotate-master-key.mjs`,
 * applied to the one irreversible act in this initiative.
 *
 * Usage:
 *   node scripts/sh-delete-015-remove-orphans.mjs
 *   node scripts/sh-delete-015-remove-orphans.mjs --apply
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { classifyObject } from "./verify-storage-orphans.mjs";
import { manifestPaths } from "./sh-delete-015-manifest.mjs";

const BUCKET = "user-files";
const PAGE_SIZE = 100;
const MANIFEST = new URL("../docs/reports/signup-hardening/SH_DELETE_015_ORPHAN_MANIFEST.md", import.meta.url);

async function listPrefix(service, prefix) {
  const found = [];
  for (let page = 0; page < 200; page += 1) {
    const { data, error } = await service.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (error) throw new Error(`storage list failed for "${prefix}"`);
    const entries = data ?? [];
    found.push(...entries);
    if (entries.length < PAGE_SIZE) break;
  }
  return found;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 1;
    return;
  }
  const apply = process.argv.includes("--apply");
  const service = createClient(url, key, { auth: { persistSession: false } });

  // ---- the live world -----------------------------------------------------
  const prefixes = await listPrefix(service, "");
  const objects = [];
  for (const prefix of prefixes) {
    for (const entry of await listPrefix(service, prefix.name)) {
      objects.push({ path: `${prefix.name}/${entry.name}`, prefix: prefix.name, entry });
    }
  }

  const { data: attachmentRows, error: attachmentsError } = await service
    .from("attachments")
    .select("storage_path,user_id");
  if (attachmentsError) throw new Error("attachments read failed");
  const attachmentsByPath = new Map(
    (attachmentRows ?? []).map((row) => [row.storage_path, row.user_id]),
  );

  // Every live auth user. These are the accounts that must be excluded, and the
  // set is discovered rather than named: a protected account listed by uuid in
  // this file would be a protected account somebody could edit out.
  const liveOwners = new Set();
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("listUsers failed");
    for (const user of data.users) liveOwners.add(user.id);
    if (data.users.length < 200) break;
  }

  const classified = objects.map((object) => ({
    ...object,
    class: classifyObject(object.path, liveOwners, attachmentsByPath),
  }));

  // ---- the preconditions, all of them, immediately before the act ---------
  const expected = manifestPaths(readFileSync(MANIFEST, "utf8"));
  const measured = classified.map((object) => object.path);
  const failures = [];

  if (expected.length === 0) failures.push("the manifest yielded no paths");
  const missing = expected.filter((path) => !measured.includes(path));
  const extra = measured.filter((path) => !expected.includes(path));
  if (missing.length) failures.push(`manifest paths absent from the bucket: ${missing.join(", ")}`);
  if (extra.length) failures.push(`bucket holds objects the manifest does not: ${extra.join(", ")}`);

  for (const object of classified) {
    if (object.class !== "absent-owner") {
      failures.push(`${object.path} is ${object.class}, not absent-owner`);
    }
    if (liveOwners.has(object.prefix)) {
      failures.push(`${object.path} belongs to a LIVE account — protected`);
    }
    if (attachmentsByPath.has(object.path)) {
      failures.push(`${object.path} is referenced by a live attachment`);
    }
  }

  console.log("SH-DELETE-015 orphan removal");
  console.log(`  bucket:            ${BUCKET}`);
  console.log(`  objects measured:  ${measured.length}`);
  console.log(`  manifest expects:  ${expected.length}`);
  console.log(`  live auth users:   ${liveOwners.size} (all excluded — none owns a listed object)`);
  console.log("");
  for (const object of classified) {
    console.log(`  ${object.class.padEnd(14)} ${object.path}  ${object.entry.metadata?.size ?? "?"} bytes`);
  }

  if (failures.length > 0) {
    console.log("\nREFUSED. The world does not match the manifest:");
    for (const failure of failures) console.log(`  - ${failure}`);
    console.log("\nNothing was removed.");
    process.exitCode = 1;
    return;
  }

  console.log("\nAll preconditions hold:");
  console.log("  - every object re-classified absent-owner, structurally, just now");
  console.log("  - no object's prefix is a live auth user");
  console.log("  - no object is referenced by any live attachment row");
  console.log("  - the measured set equals the committed manifest exactly");

  if (!apply) {
    console.log(`\nDRY RUN. This would remove ${measured.length} object(s).`);
    console.log("Re-run with --apply to perform it. The removal is irreversible.");
    return;
  }

  const { error: removeError } = await service.storage.from(BUCKET).remove(measured);
  if (removeError) {
    console.log(`\nRemoval failed: ${removeError.message}`);
    process.exitCode = 1;
    return;
  }

  // ---- the postcondition --------------------------------------------------
  const remaining = [];
  for (const prefix of await listPrefix(service, "")) {
    for (const entry of await listPrefix(service, prefix.name)) {
      remaining.push(`${prefix.name}/${entry.name}`);
    }
  }
  const survivors = remaining.filter((path) => measured.includes(path));

  console.log(`\nRemoved ${measured.length} object(s).`);
  console.log(`  objects remaining in bucket: ${remaining.length}`);
  console.log(`  of the manifest set still present: ${survivors.length}`);
  if (survivors.length > 0) {
    console.log("POSTCONDITION FAILED — objects survived the removal:");
    for (const path of survivors) console.log(`  - ${path}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
