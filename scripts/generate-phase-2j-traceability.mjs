/**
 * `2J-CLOSE-001` — the fail-closed Phase 2J traceability generator.
 *
 * It reads the PRD for what was **declared** and the eight slice acceptance
 * records for what was **evidenced**, cross-checks both directions, and either
 * writes the matrix or refuses and says exactly why. It never writes a partial
 * matrix: a document that silently omits the rows it could not verify is worse
 * than no document, because it looks complete.
 *
 * ## What it inherits from Phase 2I, and what it adds
 *
 * The class vocabulary and the destination rule are Phase 2I's, unchanged --
 * `partial` must name where the remainder goes, or it is an undelivered
 * requirement with better wording. Phase 2J adds `undelivered`, which Phase 2I
 * never needed: two metrics requirements could only be delivered by a **third
 * migration**, and ADR-095 names that a stop condition. An undelivered
 * requirement is legitimate; an undelivered requirement with no destination is
 * not, and is refused here.
 *
 * ## Migration reconciliation is per slice, not by count
 *
 * Phase 2H's lesson: five migrations with two belonging to one slice and none to
 * another spends the budget exactly and still breaks the rule. So the generator
 * checks each migration against the slice it was allocated to, by filename.
 *
 * Usage:  node scripts/generate-phase-2j-traceability.mjs
 *         node scripts/generate-phase-2j-traceability.mjs --check
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Migration budget: TWO, non-transferable, one per named slice.
 *
 * ADR-095 allocated these and hoped 2J.4's would stay unspent. ADR-096 records
 * why it could not: `ai_usage_events.operation` has no `other` -- that value
 * belongs to `error_events` -- so no existing value could truthfully carry a
 * transcription.
 */
export const MIGRATION_BUDGET = Object.freeze({
  allocated: 2,
  bySlice: Object.freeze({
    "2J.4": "202608080085_phase_2j_transcription_usage.sql",
    "2J.7": "202608080086_phase_2j_experience_telemetry.sql",
  }),
});

export const SLICE_FILES = Object.freeze({
  "2J.0": "PHASE_2J_SLICE_00_ACCEPTANCE.md",
  "2J.1": "PHASE_2J_SLICE_01_ACCEPTANCE.md",
  "2J.2": "PHASE_2J_SLICE_02_ACCEPTANCE.md",
  "2J.3": "PHASE_2J_SLICE_03_ACCEPTANCE.md",
  "2J.4": "PHASE_2J_SLICE_04_ACCEPTANCE.md",
  "2J.5": "PHASE_2J_SLICE_05_ACCEPTANCE.md",
  "2J.6": "PHASE_2J_SLICE_06_ACCEPTANCE.md",
  "2J.7": "PHASE_2J_SLICE_07_ACCEPTANCE.md",
});

/** Family → owning slice. One owner each, per the traceability contract. */
export const FAMILY_SLICE = Object.freeze({
  "2J-ACCESS": "2J.0",
  "2J-HOJE": "2J.1",
  "2J-ATTN": "2J.2",
  "2J-CAPTURE": "2J.3",
  "2J-VOICE": "2J.4",
  "2J-DAY": "2J.5",
  "2J-PRIVACY": "2J.6",
  "2J-METRICS": "2J.7",
  "2J-CLOSE": "2J.7",
});

const CLASSES = new Set(["built", "baseline", "rename", "not built, by rule", "partial", "undelivered"]);

/** A partial or undelivered claim must say where the remainder goes. */
const DESTINATION = /[Dd]estination|deferred to|routed to|see §|future phase/;

const DECLARATION = /^- \*\*(2J-[A-Z]+-\d{3}):\*\*/gm;
const EVIDENCE = /^\|\s*`(2J-[A-Z]+-\d{3})`\s*\|\s*\*\*([^*]+)\*\*\s*\|([^|]*(?:\|[^|]*)*?)\|\s*$/gm;

export function buildPhase2jTraceability({ root = REPOSITORY_ROOT } = {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const prdPath = join(root, "docs/initiatives/phase-2j/PHASE_2J_PRD.md");
  if (!existsSync(prdPath)) {
    // Fail-closed: a missing PRD is a refusal, never an empty matrix.
    throw new Error("docs/initiatives/phase-2j/PHASE_2J_PRD.md does not exist");
  }
  const prd = readFileSync(prdPath, "utf8");

  const declared = [...prd.matchAll(DECLARATION)].map((match) => match[1]);
  if (declared.length === 0) {
    throw new Error("the PRD declares no 2J- requirement; extraction produced an empty set");
  }
  const declaredSet = new Set(declared);
  if (declaredSet.size !== declared.length) {
    fail(`the PRD declares a requirement more than once (${declared.length} declarations, ${declaredSet.size} unique)`);
  }

  const foreign = [...prd.matchAll(/^- \*\*(2[A-IK-Z]-[A-Z]+-\d{3}):\*\*/gm)].map((m) => m[1]);
  if (foreign.length > 0) {
    fail(`the Phase 2J PRD declares requirements outside the 2J- namespace: ${foreign.join(", ")}`);
  }

  // ---- evidence, from the slice acceptance records only -------------------
  const evidence = new Map();
  for (const [slice, file] of Object.entries(SLICE_FILES)) {
    const path = join(root, "docs/reports/phase-2j", file);
    if (!existsSync(path)) {
      fail(`slice ${slice}'s acceptance record is missing: ${file}`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(EVIDENCE)) {
      const [, id, rawClass, citation] = match;
      const klass = rawClass.trim();

      if (evidence.has(id)) {
        fail(`${id} is evidenced in two slices (${evidence.get(id).slice} and ${slice})`);
        continue;
      }
      if (!CLASSES.has(klass)) {
        fail(`${id} carries an unknown class "${klass}"`);
        continue;
      }

      const family = id.slice(0, id.lastIndexOf("-"));
      const owner = FAMILY_SLICE[family];
      if (owner === undefined) fail(`${id} belongs to no declared family`);
      else if (owner !== slice) fail(`${id} is evidenced in ${slice} but its family belongs to ${owner}`);

      const cited = citation.trim();
      if (cited.length < 40) {
        fail(`${id}'s citation is too short to resolve: "${cited}"`);
      }
      if ((klass === "partial" || klass === "undelivered") && !DESTINATION.test(cited)) {
        // Rule 6. A partial without a destination is an undelivered requirement
        // with better wording; an undelivered one without a destination is a
        // requirement quietly dropped.
        fail(`${id} is "${klass}" but names no destination`);
      }
      evidence.set(id, { slice, klass, citation: cited });
    }
  }

  // ---- both directions ---------------------------------------------------
  for (const id of declared) {
    if (!evidence.has(id)) fail(`${id} is declared in the PRD and evidenced nowhere`);
  }
  for (const id of evidence.keys()) {
    if (!declaredSet.has(id)) fail(`${id} is evidenced but the PRD does not declare it`);
  }

  // ---- migration reconciliation, per slice --------------------------------
  const migrations = readdirSync(join(root, "supabase/migrations")).filter((name) => /phase_2j/i.test(name));
  const expected = Object.values(MIGRATION_BUDGET.bySlice);
  for (const name of migrations) {
    if (!expected.includes(name)) {
      fail(`an unbudgeted Phase 2J migration exists: ${name}`);
    }
  }
  if (migrations.length > MIGRATION_BUDGET.allocated) {
    fail(`Phase 2J spent ${migrations.length} migrations against a budget of ${MIGRATION_BUDGET.allocated}`);
  }
  for (const [slice, name] of Object.entries(MIGRATION_BUDGET.bySlice)) {
    // An allocation may go UNSPENT -- that is a success, not a shortfall. What
    // must never happen is a migration attributed to a slice that does not own
    // one, which the loop above catches by name.
    if (migrations.includes(name) && FAMILY_SLICE[Object.keys(FAMILY_SLICE).find((f) => FAMILY_SLICE[f] === slice)] !== slice) {
      fail(`${name} is attributed to ${slice}, which owns no family`);
    }
  }

  if (failures.length > 0) {
    const error = new Error(`refusing to write the matrix: ${failures.length} unresolved finding(s)`);
    error.failures = failures;
    throw error;
  }

  const counts = {};
  for (const { klass } of evidence.values()) counts[klass] = (counts[klass] ?? 0) + 1;

  return { declared, evidence, counts, migrations, failures };
}

export function renderMatrix(result) {
  const lines = [
    "# Phase 2J — Traceability Matrix",
    "",
    "**Generated by `scripts/generate-phase-2j-traceability.mjs`. Do not edit by hand.**",
    "",
    "The generator refuses to write this file when any requirement is declared and",
    "unevidenced, evidenced and undeclared, carries an unknown class, cites nothing",
    "that resolves, or is `partial`/`undelivered` without naming a destination.",
    "",
    `**Declared: ${result.declared.length} · Classified: ${result.evidence.size}**`,
    "",
    "| Class | Count |",
    "| --- | --- |",
    ...Object.entries(result.counts)
      .sort((a, b) => b[1] - a[1])
      .map(([klass, count]) => `| ${klass} | ${count} |`),
    "",
    `**Migrations: ${MIGRATION_BUDGET.allocated} allocated · ${result.migrations.length} spent**, reconciled per slice.`,
    "",
    ...Object.entries(MIGRATION_BUDGET.bySlice).map(
      ([slice, name]) =>
        `- \`${slice}\` → \`${name}\` — ${result.migrations.includes(name) ? "**spent**" : "unspent"}`,
    ),
    "",
    "| Requirement | Slice | Class | Evidence |",
    "| --- | --- | --- | --- |",
    ...result.declared.map((id) => {
      const row = result.evidence.get(id);
      return `| \`${id}\` | ${row.slice} | ${row.klass} | ${row.citation} |`;
    }),
    "",
  ];
  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("generate-phase-2j-traceability.mjs");
if (invokedDirectly) {
  try {
    const result = buildPhase2jTraceability();
    const matrix = renderMatrix(result);
    const target = join(REPOSITORY_ROOT, "docs/reports/phase-2j/PHASE_2J_TRACEABILITY_MATRIX.md");
    if (process.argv.includes("--check")) {
      const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
      if (current.trim() !== matrix.trim()) {
        console.error("the committed matrix is stale; run `npm run docs:phase-2j:traceability`");
        process.exit(1);
      }
      console.log(`matrix is current: ${result.declared.length} declared, ${result.evidence.size} classified`);
    } else {
      writeFileSync(target, matrix.replace(/\n/g, "\r\n"), "utf8");
      console.log(`wrote ${target}`);
      console.log(Object.entries(result.counts).map(([k, v]) => `  ${k}: ${v}`).join("\n"));
    }
  } catch (error) {
    console.error(error.message);
    for (const failure of error.failures ?? []) console.error(`  - ${failure}`);
    process.exit(1);
  }
}
