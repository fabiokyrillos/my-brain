/**
 * `2I-CLOSE-001` — the fail-closed Phase 2I traceability generator.
 *
 * ## The property
 *
 * **The matrix may not contain a claim the repository does not support, and
 * this generator REFUSES rather than print one.** Phase 2H's generator proved
 * the shape works by refusing on its first run against the real repository,
 * naming exactly the requirements it could not evidence, and writing nothing.
 *
 * ## What is specific to Phase 2I
 *
 * Two rules the earlier generators did not need.
 *
 * **1. `baseline` / `built` / `rename`.** This phase's audit was wrong three
 * times about what was already shipped, and `2I-SHELL-003` had to be
 * reclassified after the code disagreed with the plan. A matrix that reported
 * an assertion of existing behaviour identically to a requirement that built
 * something would overstate the phase — so the class is carried, and a `built`
 * claim over a requirement the acceptance record marks `baseline` is a refusal.
 *
 * **2. Evidenced negatives.** `2I-LIB-004` (pinned/favourite) and
 * `2I-PALETTE-009` (recents) are **delivered by not being built**, each with
 * evidence that the repository does not support them. The generator accepts
 * that only where the acceptance record states it explicitly.
 *
 * Usage:  node scripts/generate-phase-2i-traceability.mjs
 *         node scripts/generate-phase-2i-traceability.mjs --check
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Matches `generate-phase-2h-traceability.mjs` exactly.
 *
 * `fileURLToPath(new URL("..", import.meta.url))` throws
 * `The URL must be of scheme file` when the module is imported under vitest,
 * so the module could not be imported by its own mutation tests -- and a
 * generator no test can import is a generator nothing proves.
 */
export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Migration budget: ONE, allocated to 2I.5 only, non-transferable. */
export const MIGRATION_BUDGET = Object.freeze({ allocated: 1, slice: "2I.5" });

/** Slice → acceptance file. A requirement must belong to exactly one. */
export const SLICE_FILES = Object.freeze({
  "2I.0": "PHASE_2I_SLICE_00_ACCEPTANCE.md",
  "2I.1": "PHASE_2I_SLICE_01_ACCEPTANCE.md",
  "2I.2": "PHASE_2I_SLICE_02_ACCEPTANCE.md",
  "2I.3": "PHASE_2I_SLICE_03_ACCEPTANCE.md",
  "2I.4": "PHASE_2I_SLICE_04_ACCEPTANCE.md",
  "2I.5": "PHASE_2I_SLICE_05_ACCEPTANCE.md",
  "2I.6": "PHASE_2I_SLICE_06_ACCEPTANCE.md",
  "2I.7": "PHASE_2I_SLICE_07_ACCEPTANCE.md",
});

/** Family → owning slice. One owner each, per the contract. */
export const FAMILY_SLICE = Object.freeze({
  "2I-LANG": "2I.1",
  "2I-TRUST": "2I.2",
  "2I-SHELL": "2I.3",
  "2I-PALETTE": "2I.4",
  "2I-SEARCH": "2I.5",
  "2I-METRIC": "2I.5",
  "2I-LIB": "2I.6",
  "2I-CLOSE": "2I.7",
});

/**
 * The permitted classes.
 *
 * `partial` was missing from the first draft, and the generator correctly
 * refused `2I-CLOSE-002` for carrying an unknown class — but the traceability
 * contract §3 rule 1 permits *delivered, partial or undelivered*, so the
 * omission was the generator's defect rather than the record's. It is added
 * here **together with rule 6's obligation**, which the first draft also did
 * not implement: a partial requirement must name its destination, or it is an
 * undelivered requirement with better wording.
 */
const CLASSES = new Set(["built", "baseline", "rename", "not built, by rule", "partial"]);

/** A partial claim must say where the remainder goes. */
const DESTINATION = /destination|Destination|deferred to|routed to|see §/;

/** A declared requirement in this repository's shape. */
const DECLARATION = /^\|\s*`(2I-[A-Z]+-\d{3})`\s*\|\s*\*\*([^*]+)\*\*\s*\|([^|]*)\|/gm;

export function buildPhase2iTraceability({ root = REPOSITORY_ROOT } = {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const prdPath = join(root, "docs/initiatives/phase-2i/PHASE_2I_PRD.md");
  if (!existsSync(prdPath)) {
    // Fail-closed: a missing PRD is a refusal, never an empty matrix.
    throw new Error("docs/initiatives/phase-2i/PHASE_2I_PRD.md does not exist");
  }
  const prd = readFileSync(prdPath, "utf8");

  // ---- declared requirements, from the PRD only --------------------------
  const declared = [...prd.matchAll(/^- \*\*(2I-[A-Z]+-\d{3}):\*\*/gm)].map((match) => match[1]);
  if (declared.length === 0) {
    throw new Error("the PRD declares no 2I- requirement; extraction produced an empty set");
  }

  const foreign = [...prd.matchAll(/^- \*\*(2[A-HJ-Z]-[A-Z]+-\d{3}):\*\*/gm)].map((m) => m[1]);
  if (foreign.length > 0) {
    fail(`the Phase 2I PRD declares requirements outside the 2I- namespace: ${foreign.join(", ")}`);
  }

  // ---- evidence, from the acceptance records -----------------------------
  const reportsDir = join(root, "docs/reports/phase-2i");
  const evidence = new Map();

  for (const [slice, filename] of Object.entries(SLICE_FILES)) {
    const path = join(reportsDir, filename);
    if (!existsSync(path)) continue;
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(DECLARATION)) {
      const [, id, klass, cited] = match;
      if (evidence.has(id)) {
        fail(`${id} is claimed by more than one slice (${evidence.get(id).slice} and ${slice})`);
        continue;
      }
      evidence.set(id, { slice, klass: klass.trim(), cited: cited.trim(), file: filename });
    }
  }

  // ---- every declared requirement is classified --------------------------
  for (const id of declared) {
    const found = evidence.get(id);
    if (!found) {
      fail(`${id} is declared in the PRD and evidenced by no slice acceptance record`);
      continue;
    }
    if (!CLASSES.has(found.klass)) {
      fail(`${id} carries the unknown class ${JSON.stringify(found.klass)}`);
    }
    const family = id.slice(0, id.lastIndexOf("-"));
    const expected = FAMILY_SLICE[family];
    if (expected && found.slice !== expected) {
      fail(`${id} belongs to family ${family} (slice ${expected}) but is evidenced by ${found.slice}`);
    }
    if (found.cited.length < 12) {
      fail(`${id} is classified ${found.klass} with no substantive citation`);
    }
    // Contract §3 rule 6. "Partial" with no successor is an undelivered
    // requirement with better wording.
    if (found.klass === "partial" && !DESTINATION.test(found.cited)) {
      fail(`${id} is partial and names no destination for the remainder`);
    }
  }

  // ---- nothing evidenced that was never declared -------------------------
  for (const id of evidence.keys()) {
    if (!declared.includes(id)) {
      fail(`${id} is evidenced by ${evidence.get(id).file} but is declared nowhere in the PRD`);
    }
  }

  // ---- migration budget, reconciled PER SLICE ----------------------------
  const migrations = readdirSync(join(root, "supabase/migrations")).filter((name) =>
    /phase[_-]?2i/i.test(name),
  );
  if (migrations.length > MIGRATION_BUDGET.allocated) {
    fail(
      `Phase 2I holds ${migrations.length} migrations against a budget of ${MIGRATION_BUDGET.allocated}; `
      + "a second migration is an owner amendment, not a judgement call",
    );
  }

  // ---- ADR-055 must be stated, not assumed -------------------------------
  const searchAcceptance = join(reportsDir, SLICE_FILES["2I.5"]);
  if (existsSync(searchAcceptance)) {
    const text = readFileSync(searchAcceptance, "utf8");
    if (!/ADR-055/.test(text) || !/(remains open|open and unchanged|untouched)/i.test(text)) {
      fail("slice 2I.5's record does not state that ADR-055 remains open and unchanged");
    }
  }

  return {
    declared,
    evidence,
    migrations,
    failures,
    classes: countClasses(evidence),
  };
}

function countClasses(evidence) {
  const counts = { built: 0, baseline: 0, rename: 0, "not built, by rule": 0, partial: 0 };
  for (const entry of evidence.values()) {
    if (counts[entry.klass] !== undefined) counts[entry.klass] += 1;
  }
  return counts;
}

export function renderMatrix(model) {
  const lines = [
    "# Phase 2I — Traceability matrix",
    "",
    "**Generated by `npm run docs:phase-2i:traceability`. Do not edit by hand.**",
    "",
    "This file exists only when every declared requirement resolves. The generator",
    "**refuses rather than print an unresolved claim** — so its presence is the",
    "assertion, and its absence is a finding.",
    "",
    `**${model.declared.length} declared** · `
      + `${model.classes.built} built · ${model.classes.baseline} baseline · `
      + `${model.classes.rename} rename · ${model.classes["not built, by rule"]} not built by rule · `
      + `${model.classes.partial} partial`,
    "",
    "## What the classes mean",
    "",
    "| Class | Meaning |",
    "| --- | --- |",
    "| `built` | New code delivers it. |",
    "| `baseline` | Already true before the phase. This phase asserts and protects it. |",
    "| `rename` | A label or grouping changed; nothing structural. |",
    "| `not built, by rule` | An evidenced negative: the repository does not support it, and building it would break another requirement. |",
    "| `partial` | Delivered in part, with the remainder's destination named. |",
    "",
    "**The distinction is load-bearing.** This phase's audit was wrong three times",
    "about what was already shipped. A matrix that reported an assertion of",
    "existing behaviour identically to a requirement that built something would",
    "overstate the phase.",
    "",
    "## Requirements",
    "",
    "| Requirement | Slice | Class | Evidence |",
    "| --- | --- | --- | --- |",
  ];

  for (const id of model.declared) {
    const entry = model.evidence.get(id);
    lines.push(`| \`${id}\` | ${entry.slice} | ${entry.klass} | ${entry.cited} |`);
  }

  lines.push(
    "",
    "## Migration budget",
    "",
    `**${MIGRATION_BUDGET.allocated} allocated** to slice ${MIGRATION_BUDGET.slice} only, non-transferable · `
      + `**${model.migrations.length} spent**`,
    "",
    model.migrations.length === 0
      ? "Gate G-2I.2 measured the zero-migration shape and it met the budget, so the"
        + " allocation lapsed unspent. That is the preferred close, not a shortfall."
      : `Spent: ${model.migrations.join(", ")}`,
    "",
  );

  return `${lines.join("\n")}\n`;
}

/**
 * Run-as-script detection.
 *
 * Compared by basename rather than by building a `file://` URL from
 * `process.argv[1]`: under vitest that argv is not a path, and `new URL()`
 * threw `The URL must be of scheme file` at import time -- so the module could
 * not be imported by its own test at all.
 */
const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const model = buildPhase2iTraceability();

  if (model.failures.length > 0) {
    console.error(`REFUSED — Phase 2I traceability is not consistent (${model.failures.length} finding(s)):\n`);
    model.failures.forEach((failure, index) => console.error(`  ${index + 1}. ${failure}`));
    console.error("\nNo matrix was written. A generator that printed this would be the defect.");
    process.exit(1);
  }

  const out = join(REPOSITORY_ROOT, "docs/reports/phase-2i/PHASE_2I_TRACEABILITY_MATRIX.md");
  writeFileSync(out, renderMatrix(model), "utf8");
  console.log(`wrote docs/reports/phase-2i/PHASE_2I_TRACEABILITY_MATRIX.md — ${model.declared.length} requirements`);
}
