/**
 * Entity Graph Completion cleanup verifier (EGC-OPERATIONS-002, Slice EGC.3).
 *
 * Reports fixture residue across the five entity-graph tables and classifies the
 * accounts that own it.
 *
 * ## Why this one does not classify by prefix alone
 *
 * The Phase 2C…2F verifiers define a fixture user as one whose email starts with
 * a known prefix. That rule is correct for what those scripts mint, and it
 * **failed in production**: an account generated on 2026-07-16, confirmed, used
 * for three minutes and then abandoned, was classified as a real user by two
 * acceptance artifacts, because no fixture creator in this repository emits that
 * prefix. It had accumulated 358 `heartbeat_runs` rows — one per hour for three
 * weeks — and `SECURITY.md` records its removal. The proxy was narrower than the
 * property, which is the same class ADR-067 corrected in the A13 guard.
 *
 * So this verifier scores each account on **independent signals** and prints the
 * evidence rather than a verdict derived from a name:
 *
 *   1. a known fixture prefix — the old rule, retained as one signal among many;
 *   2. a reserved or disposable email domain (RFC 2606/6761);
 *   3. a generated-looking local part — a uuid, or a long hex run, which is what
 *      every fixture creator in this repository produces;
 *   4. an embedded unix timestamp in the local part;
 *   5. **ownership of rows this initiative writes, with no product activity** —
 *      the signal that actually matters, since an account holding entity-graph
 *      rows and nothing else is residue whatever it is called;
 *   6. a lifecycle signature: scheduled machinery still running on behalf of an
 *      account that has produced nothing. This is the one that would have caught
 *      the account the prefix rule missed.
 *
 * ## What it will and will not do
 *
 * **It reports. It never deletes, and it holds no delete path.** Detection and
 * reporting come first; automated deletion requires an explicit manifest or
 * strong ownership proof and a human decision. An account is labelled
 * `likely-fixture`, `possible-fixture` or `unclassified`, with the signals that
 * produced the label printed beside it.
 *
 * A naming heuristic alone never reaches `likely-fixture`: that label requires a
 * **behavioural** signal plus at least one more. This is the direct lesson of
 * the account the prefix rule got wrong — and of the risk in the other
 * direction, which is treating a real person as residue because their address
 * looks generated.
 *
 * It also exits 0 on residue, deliberately. A non-zero exit would make this a
 * gate whose obvious fix is to delete rows, which is the opposite of what a
 * detection-first verifier is for.
 *
 * Usage: `npm run verify:egc:cleanup`
 */

import { createClient } from "@supabase/supabase-js";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/** The five tables this initiative gave an application write path. */
export const EGC_TABLES = Object.freeze([
  "organizations",
  "contexts",
  "person_relationships",
  "person_contexts",
  "person_projects",
]);

/**
 * Fixture email prefixes, read off the creators rather than remembered.
 *
 * Retained as **one signal**, explicitly not as the definition of a fixture.
 */
export const FIXTURE_PREFIXES = Object.freeze([
  "codex-",
  "playwright-",
  "e2e-",
  "smoke-",
  "remote-",
]);

/** Domains reserved by RFC 2606/6761, or conventionally disposable here. */
export const DISPOSABLE_DOMAINS = Object.freeze([
  "example.com",
  "example.test",
  "example.org",
  "example.net",
  "test",
  "invalid",
  "localhost",
]);

const UUID_RUN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LONG_HEX_RUN = /[0-9a-f]{12,}/i;
/** A unix-seconds or unix-millis stamp embedded in an identifier. */
const EMBEDDED_TIMESTAMP = /(?:^|[^0-9])(1[6-9]\d{8}|1[6-9]\d{11})(?:[^0-9]|$)/;

/**
 * The signals one account exhibits.
 *
 * Pure and synchronous — no clock, no I/O — so the classification is testable
 * against fixtures instead of against production.
 */
export function accountSignals(user, ownership = { egcRows: 0, productRows: 0, scheduledRuns: 0 }) {
  const email = (user.email ?? "").toLowerCase();
  const [local = "", domain = ""] = email.split("@");
  const signals = [];

  if (FIXTURE_PREFIXES.some((prefix) => local.startsWith(prefix))) {
    signals.push({ kind: "name", signal: "known-fixture-prefix" });
  }
  if (DISPOSABLE_DOMAINS.includes(domain)) {
    signals.push({ kind: "name", signal: `reserved-domain:${domain}` });
  }
  if (UUID_RUN.test(local)) signals.push({ kind: "name", signal: "uuid-in-local-part" });
  else if (LONG_HEX_RUN.test(local)) signals.push({ kind: "name", signal: "generated-hex-local-part" });
  if (EMBEDDED_TIMESTAMP.test(local)) signals.push({ kind: "name", signal: "timestamp-in-local-part" });

  // The signals that are not about the name at all.
  if (ownership.egcRows > 0 && ownership.productRows === 0) {
    signals.push({ kind: "behaviour", signal: "owns-entity-graph-rows-with-no-product-activity" });
  }
  if (ownership.scheduledRuns > 0 && ownership.productRows === 0) {
    signals.push({ kind: "behaviour", signal: "scheduled-activity-without-product-activity" });
  }

  return signals;
}

/**
 * The label, and the rule that produces it.
 *
 * `likely-fixture` requires a **behavioural** signal plus at least one more, so
 * a generated-looking address on its own can never reach it. That ceiling is
 * what keeps a real person with an unusual address out of the deletion
 * conversation entirely.
 */
export function classify(signals) {
  const names = signals.filter((entry) => entry.kind === "name").length;
  const behaviours = signals.filter((entry) => entry.kind === "behaviour").length;

  if (behaviours > 0 && names + behaviours >= 2) return "likely-fixture";
  if (names >= 1 || behaviours > 0) return "possible-fixture";
  return "unclassified";
}

async function countOwnedRows(admin, table, userId) {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return { count: 0, unreadable: true };
  return { count: count ?? 0, unreadable: false };
}

export async function run() {
  const credentials = getLinkedSupabaseCredentials();
  const admin = createClient(credentials.url, credentials.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: listed, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`Could not list users: ${error.message}`);

  const report = [];
  let residueRows = 0;

  for (const user of listed.users) {
    let egcRows = 0;
    const unreadable = [];
    for (const table of EGC_TABLES) {
      const result = await countOwnedRows(admin, table, user.id);
      if (result.unreadable) unreadable.push(table);
      egcRows += result.count;
    }

    const entries = await countOwnedRows(admin, "entries", user.id);
    const tasks = await countOwnedRows(admin, "tasks", user.id);
    const heartbeats = await countOwnedRows(admin, "heartbeat_runs", user.id);

    const ownership = {
      egcRows,
      productRows: entries.count + tasks.count,
      scheduledRuns: heartbeats.count,
    };
    const signals = accountSignals(user, ownership);
    const label = classify(signals);

    if (label === "likely-fixture") residueRows += egcRows;

    report.push({
      email: user.email,
      label,
      egcRows,
      productRows: ownership.productRows,
      scheduledRuns: ownership.scheduledRuns,
      unreadable,
      signals: signals.map((entry) => `${entry.kind}:${entry.signal}`),
    });
  }

  report.sort((a, b) => a.label.localeCompare(b.label) || (a.email ?? "").localeCompare(b.email ?? ""));

  console.log("Entity Graph Completion — cleanup report\n");
  console.log(`Accounts scanned: ${report.length}`);
  console.log(`Entity-graph rows owned by likely fixtures: ${residueRows}\n`);

  for (const row of report) {
    console.log(`  ${row.label.padEnd(18)} ${row.email}`);
    console.log(
      `      entity-graph rows: ${row.egcRows}   product rows: ${row.productRows}   scheduled runs: ${row.scheduledRuns}`,
    );
    if (row.signals.length > 0) console.log(`      signals: ${row.signals.join(", ")}`);
    if (row.unreadable.length > 0) console.log(`      unreadable to service_role: ${row.unreadable.join(", ")}`);
  }

  const likely = report.filter((row) => row.label === "likely-fixture");
  console.log("");
  if (likely.length === 0) {
    console.log("No account reaches `likely-fixture`. Zero residue by this verifier's rule.");
  } else {
    console.log(`${likely.length} account(s) reach \`likely-fixture\`. **This script does not delete.**`);
    console.log("Deletion needs an explicit manifest or strong ownership proof, and a human decision.");
  }

  return { report, residueRows, likely: likely.length };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("verify-egc-cleanup.mjs");
if (invokedDirectly) {
  run().catch((cause) => {
    console.error(cause.message);
    process.exit(1);
  });
}
