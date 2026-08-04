#!/usr/bin/env node
/**
 * The storage-orphan scanner (SH-STORAGE-001, SH-STORAGE-003, SH-DELETE-015).
 *
 * ## It REPORTS. It never deletes.
 *
 * This file holds no destructive call of any kind, and a test asserts their
 * absence by name over the comment-stripped source. That is not caution for
 * its own sake: a scanner that could destroy would eventually be pointed at
 * production by somebody trying to make a red gate go green, which is the
 * reasoning `verify-egc-cleanup.mjs` already carries. Removing an orphan is a
 * separate, owner-authorized, irreversible step (SH-DELETE-015) performed only
 * after the manifest this script prints has been recorded.
 *
 * (The test strips comments before scanning, because a guard that forbade
 * naming the calls it forbids would make this paragraph impossible to write —
 * the fourth time this initiative's family of guards has hit that, and the
 * established answer.)
 *
 * ## What it classifies, and how
 *
 * Every object in `user-files` is keyed `<user_id>/<uuid>-<name>` by
 * construction (`agent/actions.ts`), so ownership is readable from the prefix
 * — structurally, never from the file's own name (the `codex.cost`
 * misclassification is why). Each object lands in exactly one class:
 *
 *   `live`             — prefix is a real `auth.users` id AND a live
 *                        `attachments` row of that same owner references the
 *                        exact path. Nothing to do.
 *   `absent-owner`     — the prefix uuid is not in `auth.users`. The account is
 *                        gone and its bytes stayed: the six 2026-07-16 objects
 *                        are expected here.
 *   `absent-row`       — the owner exists but no `attachments` row references
 *                        the path. The residue of a failed upload
 *                        compensation (SH-STORAGE-003).
 *   `cross-owner`      — a live `attachments` row of a DIFFERENT owner
 *                        references it. Should be impossible; if it ever
 *                        appears, no deletion may proceed on that prefix.
 *   `unparseable`      — the first path segment is not a uuid at all.
 *
 * Exit code is 0 when it ran, whatever it found: this is an instrument, and a
 * non-zero exit is reserved for the rollout gate that consumes it
 * (SH-STORAGE-002), not for the act of finding an orphan that is already known
 * and manifested.
 */

import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "user-files";
const PAGE_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ORPHAN_CLASSES = Object.freeze([
  "live",
  "absent-owner",
  "absent-row",
  "cross-owner",
  "unparseable",
]);

/**
 * Pure classification, exported so its own tests need no network.
 *
 * `owners` is the set of live `auth.users` ids; `attachmentsByPath` maps an
 * exact storage path to the `user_id` of the live row referencing it.
 */
export function classifyObject(path, owners, attachmentsByPath) {
  const separator = path.indexOf("/");
  const prefix = separator === -1 ? "" : path.slice(0, separator);
  if (!UUID.test(prefix)) return "unparseable";

  const referencedBy = attachmentsByPath.get(path);
  if (referencedBy !== undefined && referencedBy !== prefix) return "cross-owner";
  if (!owners.has(prefix)) return "absent-owner";
  if (referencedBy === undefined) return "absent-row";
  return "live";
}

async function listPrefix(service, prefix) {
  const found = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await service.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (error) throw new Error(`storage list failed at ${prefix || "<root>"}`);
    const entries = data ?? [];
    for (const entry of entries) found.push(entry);
    if (entries.length < PAGE_SIZE) break;
  }
  return found;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 2;
    return;
  }
  const service = createClient(url, key, { auth: { persistSession: false } });

  // Storage lists folders at the root and objects inside them; the two-level
  // walk is what the `<uid>/<file>` layout requires.
  const roots = await listPrefix(service, "");
  const paths = [];
  for (const root of roots) {
    const entries = await listPrefix(service, root.name);
    for (const entry of entries) {
      paths.push({
        path: `${root.name}/${entry.name}`,
        size: entry.metadata?.size ?? 0,
        createdAt: entry.created_at ?? null,
      });
    }
  }

  const { data: attachmentRows, error: attachmentsError } = await service
    .from("attachments")
    .select("storage_path,user_id");
  if (attachmentsError) throw new Error("attachments read failed");
  const attachmentsByPath = new Map(
    (attachmentRows ?? []).map((row) => [row.storage_path, row.user_id]),
  );

  const prefixes = [...new Set(paths.map((entry) => entry.path.split("/")[0]))];
  const owners = new Set();
  for (const prefix of prefixes) {
    if (!UUID.test(prefix)) continue;
    // One call per distinct prefix; the population is small and this keeps the
    // read to a documented admin API rather than a join over auth.
    const { data, error } = await service.auth.admin.getUserById(prefix);
    if (!error && data?.user) owners.add(prefix);
  }

  const classified = paths.map((entry) => ({
    ...entry,
    class: classifyObject(entry.path, owners, attachmentsByPath),
  }));

  const counts = Object.fromEntries(ORPHAN_CLASSES.map((name) => [name, 0]));
  for (const entry of classified) counts[entry.class] += 1;

  console.log("Storage orphan scan");
  console.log(`  bucket:  ${BUCKET}`);
  console.log(`  objects: ${classified.length}`);
  for (const name of ORPHAN_CLASSES) console.log(`  ${name.padEnd(14)} ${counts[name]}`);

  const manifest = classified.filter((entry) => entry.class !== "live");
  if (manifest.length > 0) {
    console.log("");
    console.log("Manifest (nothing below has been touched):");
    for (const entry of manifest) {
      console.log(
        `  ${entry.class.padEnd(14)} ${entry.path}  ${entry.size} bytes  created ${entry.createdAt ?? "unknown"}`,
      );
    }
    console.log("");
    console.log(
      "Deleting any of these is a separate, owner-authorized step (SH-DELETE-015).",
    );
  }
}

// Only when invoked as a script: the classification above is imported by its
// tests, and a module that scanned on import would make a unit test reach for
// a live project (the `byok-verify-runtime-parity.mjs` pattern).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
