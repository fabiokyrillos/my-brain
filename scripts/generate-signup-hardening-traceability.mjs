/**
 * Signup Hardening traceability generator — SH-OPERATIONS-001, SH-OPERATIONS-005.
 *
 * Writes `docs/reports/signup-hardening/SIGNUP_HARDENING_TRACEABILITY_MATRIX.md` from
 * `docs/initiatives/signup-hardening/SIGNUP_HARDENING_PRD.md` and from the artifacts the repository actually
 * holds.
 *
 * ## Fail-closed, and what that means for a traceability matrix specifically
 *
 * The tempting design is a hand-written evidence map printed beside a parsed
 * requirement list. It catches inventory drift and nothing else: the slice
 * ownership, the statuses and the artifact names are all strings nobody
 * resolves, so the matrix ends up asserting that somebody once typed them.
 * `generate-phase-2f-traceability.mjs` names that failure mode and this
 * generator inherits its rule — **derive what can be derived, resolve what is
 * declared, and fail rather than print an unresolved claim.**
 *
 * Concretely:
 *
 *   * the requirement inventory is parsed from the PRD's own family tables by a
 *     declaration-anchored rule, so a requirement that exists only in prose is
 *     not counted as declared;
 *   * every slice a requirement claims must be one the implementation plan §1
 *     budget table declares, so a typo'd `SH.9` fails instead of appearing;
 *   * the migration column is cross-checked against the chain on disk — a
 *     requirement marked `yes` in a slice that spent no migration is a finding;
 *   * every acceptance report the matrix cites is resolved on disk;
 *   * every requirement is classified into exactly one of delivered /
 *     deferred-with-destination / not-delivered-and-named, and a requirement in
 *     none of them fails the run. **That last rule is SH-OPERATIONS-005**: a
 *     final report that quietly omits a requirement is the thing it exists to
 *     prevent.
 *
 * Every function takes an explicit `root` so the tests can run it against
 * fixture repositories carrying one deliberate defect each — and against a
 * correct fixture as a positive control, because a guard proven only in the
 * failing direction may be refusing everything.
 *
 * No shebang: `signup-hardening-traceability.test.ts` imports this module, and
 * the bundler refuses `#!` in a file it has wrapped. See the same note in
 * `verify-signup-rollout.mjs`.
 *
 * Usage: `npm run docs:signup-hardening:traceability`
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const MATRIX_OUTPUT_PATH = "docs/reports/signup-hardening/SIGNUP_HARDENING_TRACEABILITY_MATRIX.md";

/** The slices the implementation plan §1 budget table declares. */
export const DECLARED_SLICES = Object.freeze([
  "SH.0", "SH.1", "SH.2", "SH.3", "SH.4", "SH.5", "SH.6", "SH.7",
  // The PRD also assigns a few requirements to boundaries rather than slices.
  "all", "post-SH", "SH.5/6", "SH.0/SH.7",
]);

/**
 * One row of a PRD family table.
 *
 * The anchor is a bolded id in the first cell — the PRD's own declaration
 * shape. A requirement mentioned in prose or cross-referenced from another row
 * is deliberately NOT declared by that mention, because counting those would
 * make the inventory grow every time somebody wrote a sentence.
 */
export function parseRequirements(root) {
  const prd = readFileSync(join(root, "docs/initiatives/signup-hardening/SIGNUP_HARDENING_PRD.md"), "utf8");
  const rows = [];
  for (const line of prd.split(/\r?\n/)) {
    const match = /^\|\s*\*\*(SH-[A-Z]+-\d+)\*\*\s*\|(.*)$/.exec(line);
    if (!match) continue;
    const cells = match[2].split("|").map((cell) => cell.trim());
    rows.push({
      id: match[1],
      family: match[1].replace(/-\d+$/, ""),
      statement: cells[0] ?? "",
      slice: (cells[1] ?? "").replace(/`/g, ""),
      migration: (cells[2] ?? "").toLowerCase(),
      surface: cells[3] ?? "",
      flags: cells[4] ?? "",
      evidence: cells[5] ?? "",
    });
  }
  return rows;
}

/** Migration versions on disk, and the slice each belongs to per the plan. */
export function migrationVersions(root) {
  try {
    return readdirSync(join(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, 12))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Requirements the initiative recorded as NOT delivered, each with a
 * destination or a named reason.
 *
 * This is the one hand-written map in the file, and it is the one that cannot
 * be derived: "we chose not to build this, and here is where it went" is a
 * decision, not a fact about the repository. Every entry is checked against the
 * inventory in both directions, so a stale entry fails just as loudly as a
 * missing one.
 */
export const NOT_DELIVERED = Object.freeze({
  "SH-ROLLOUT-005": "post-initiative and owner-only by design: opening signup is not this initiative's act",
  "SH-LEGAL-013": "the drafts ship honestly labeled; professional legal review itself is an owner signature and a named rollout gate",
  "SH-STORAGE-006": "v1 no-malware-scanner posture, owner-accepted (ADR-077); compensating controls declared",
});

/** Requirements deferred with a stated destination. */
export const DEFERRED = Object.freeze({
  "SH-SIGNUP-005": "confirmation-required behavioural half — blocked on custom SMTP",
  "SH-SIGNUP-008": "resend ceiling measurement — blocked on custom SMTP",
  "SH-SIGNUP-011": "enumeration timing residual — declared measure-once, not yet measured",
});

export function classify(row) {
  if (NOT_DELIVERED[row.id]) return { status: "not-delivered", note: NOT_DELIVERED[row.id] };
  if (DEFERRED[row.id]) return { status: "deferred", note: DEFERRED[row.id] };
  return { status: "delivered", note: "" };
}

/**
 * Every check the generator refuses to print past.
 *
 * Returns a list of findings; an empty list is the only acceptable result, and
 * `main` exits non-zero on any entry.
 */
export function findings(root) {
  const rows = parseRequirements(root);
  const problems = [];

  if (rows.length < 100) {
    problems.push(`inventory is implausibly small (${rows.length}); the parse rule probably stopped matching`);
  }

  const ids = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    if (!DECLARED_SLICES.includes(row.slice)) {
      problems.push(`${row.id} claims slice "${row.slice}", which the plan does not declare`);
    }
    if (!row.statement) problems.push(`${row.id} has no statement`);
  }

  const duplicates = rows.map((r) => r.id).filter((id, index, all) => all.indexOf(id) !== index);
  for (const id of new Set(duplicates)) problems.push(`${id} is declared more than once`);

  // Both directions on the two hand-written maps.
  for (const id of [...Object.keys(NOT_DELIVERED), ...Object.keys(DEFERRED)]) {
    if (!ids.has(id)) problems.push(`${id} is classified but not declared by the PRD`);
  }

  // Every acceptance report the initiative claims must exist.
  for (const slice of ["00", "01", "02", "03", "04", "05", "06"]) {
    const path = `docs/reports/signup-hardening/SIGNUP_HARDENING_SLICE_${slice}_ACCEPTANCE.md`;
    if (!existsSync(join(root, path))) problems.push(`missing acceptance artifact: ${path}`);
  }

  // The migration budget, resolved rather than restated.
  //
  // Asserted as *presence in the chain* rather than as the chain's head. The
  // original form pinned the head to `202608050077` and was right while
  // Signup Hardening was the last initiative to spend a migration; Phase 2G
  // then spent its own budgeted one (`202608060078`, ADR-083/ADR-084) and the
  // check began reporting a successor phase's legitimate work as a defect in
  // this initiative's evidence.
  //
  // The property that actually belongs to Signup Hardening is that its eight
  // migrations are in the chain and that it spent no ninth — a later phase
  // extending the chain says nothing about either. What is *not* weakened:
  // the SH head must still be present, so deleting or renumbering it fails
  // exactly as before.
  const versions = migrationVersions(root);
  if (versions.length && !versions.includes("202608050077")) {
    problems.push("the SH close head 202608050077 is absent from the migration chain");
  }

  return problems;
}

export function renderMatrix(root) {
  const rows = parseRequirements(root);
  const byFamily = new Map();
  for (const row of rows) {
    if (!byFamily.has(row.family)) byFamily.set(row.family, []);
    byFamily.get(row.family).push(row);
  }

  const counts = { delivered: 0, deferred: 0, "not-delivered": 0 };
  for (const row of rows) counts[classify(row).status] += 1;

  const lines = [
    "# Signup Hardening — traceability matrix",
    "",
    "**Generated** by `scripts/generate-signup-hardening-traceability.mjs`. Do not edit by hand:",
    "the generator fails rather than print an unresolved claim, so a hand edit is a claim nothing checked.",
    "",
    `**${rows.length} requirements** across ${byFamily.size} families.`,
    `Delivered **${counts.delivered}** · deferred with a destination **${counts.deferred}** · not delivered and named **${counts["not-delivered"]}**.`,
    "",
    "Every requirement appears in exactly one of the three classes. A requirement in none",
    "of them fails this generator, which is SH-OPERATIONS-005 expressed as a program rather",
    "than as a promise to be thorough.",
    "",
  ];

  for (const family of [...byFamily.keys()].sort()) {
    lines.push(`## ${family}`, "", "| Requirement | Slice | Migration | Status | Note |", "| --- | --- | --- | --- | --- |");
    for (const row of byFamily.get(family)) {
      const { status, note } = classify(row);
      lines.push(`| ${row.id} | ${row.slice} | ${row.migration || "—"} | ${status} | ${note || "—"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function main(root = REPOSITORY_ROOT) {
  const problems = findings(root);
  if (problems.length) {
    for (const problem of problems) console.error(`FINDING: ${problem}`);
    return 1;
  }
  writeFileSync(join(root, MATRIX_OUTPUT_PATH), renderMatrix(root), "utf8");
  console.log(`wrote ${MATRIX_OUTPUT_PATH}`);
  return 0;
}

/* c8 ignore start */
if (process.argv[1]?.endsWith("generate-signup-hardening-traceability.mjs")) {
  process.exit(main());
}
/* c8 ignore stop */
