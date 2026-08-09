/**
 * Phase 2L's traceability generator (`2L-CLOSE-001`).
 *
 * Fail-closed: it refuses to emit a matrix when anything is unresolved, and a
 * refusal is a non-zero exit naming **every** finding rather than the first.
 *
 * ## What it inherits, and the one rule it adds
 *
 * The shape is Phase 2K's: extract the declared ids from the PRD, extract one
 * classifying row per id from the slice records, and refuse on anything that
 * does not resolve. Two of Phase 2K's accommodations are deliberately **not**
 * carried over, because Phase 2L does not need them and a tolerance nobody
 * needs is a tolerance that will be used:
 *
 *  - **no deferral markers.** Every 2L slice record classifies the requirements
 *    it owns, in the slice that owns them. "Not claimed here" has no subject.
 *  - **no supersession table.** No 2L requirement is classified twice, so
 *    "the later slice wins" is a rule with nothing to apply to.
 *
 * The rule it **adds** is the budget: OD-2L-2 option A signed the phase's single
 * migration away, so the reconciliation is not "count them against a ceiling"
 * but "there must be none at all" — checked by looking at the directory, which
 * is the only way `2L-CLOSE-003` can be true rather than restated.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Migration budget: **ONE allocated to slice 2L.3, and none spent.**
 *
 * The ceiling was never an obligation. OD-2L-2 option A removed the only reason
 * the migration existed, so `0 spent` is the signed outcome rather than a
 * shortfall — and a Phase 2L migration existing at all is a refusal.
 */
export const MIGRATION_BUDGET = Object.freeze({ allocated: 1, expectedSpend: 0 });

export const SLICE_FILES = Object.freeze({
  "2L.0": "PHASE_2L_SLICE_00_ACCEPTANCE.md",
  "2L.1": "PHASE_2L_SLICE_01_ACCEPTANCE.md",
  "2L.2": "PHASE_2L_SLICE_02_ACCEPTANCE.md",
  "2L.3": "PHASE_2L_SLICE_03_ACCEPTANCE.md",
  "2L.4": "PHASE_2L_SLICE_04_ACCEPTANCE.md",
  "2L.5": "PHASE_2L_SLICE_05_ACCEPTANCE.md",
});

const CLASSES = new Set(["built", "baseline", "partial", "not-built-by-rule", "undelivered"]);

/** What counts as naming where a remainder goes. */
const DESTINATION = /[Dd]estination|[Rr]emainder|deferred to|routed to|carried past close|successor|owner-run/;

/**
 * A remainder that is not a remainder.
 *
 * `partial` means something is still owed: a behaviour, a proof, or a decision.
 * A row that names a remainder of "none", or says nothing is pending, or points
 * only at a record that is already complete, is a `partial` being used to
 * preserve a count — which is the one thing the classification must never be
 * for. The close of Phase 2L shipped exactly that twice, and an independent
 * review caught it, so the rule is mechanical from here.
 *
 * Each pattern matches an **assertion that nothing is owed**. A row that says
 * what *is* owed — "Remainder: a real-device session" — matches none of them.
 */
const VACUOUS_REMAINDER = [
  /[Rr]emainder:?\s*(is\s+)?(none|nothing|n\/a)\b/,
  /\bnone in behaviour\b/i,
  /\bnothing (is )?(outstanding|pending|owed|missing|left)\b/i,
  /\bno (behaviour|behavior|proof|evidence|work|decision)[^.;]*\b(outstanding|pending|owed|missing|remains?|left)\b/i,
  /\bno work outstanding\b/i,
  /\bnothing (in behaviour|further) (is )?required\b/i,
];

/**
 * Whether a `partial` or `undelivered` row actually owes something.
 *
 * Returns the offending phrase, or null. Returning the phrase rather than a
 * boolean is what lets the refusal quote the row back — a failure that says
 * "this row is vacuous" and does not say which words made it so is a failure
 * somebody edits until it goes quiet.
 */
function vacuousRemainder(citation) {
  for (const pattern of VACUOUS_REMAINDER) {
    const match = pattern.exec(citation);
    if (match) return match[0].trim();
  }
  return null;
}

/** A rule-driven absence must name the rule. */
const RULE = /ADR-\d{3}|OD-2L-\d/;

const DECLARATION = /^- \*\*(2L-[A-Z0-9]+-\d{3}):\*\*/gm;

/**
 * `| \`id\` | **class** | evidence |`.
 *
 * The evidence column is allowed to contain pipes escaped or not, so the row is
 * matched to the end of the line rather than to the next pipe — a stricter
 * pattern silently skips rows, which reads as "classified nowhere" and is the
 * worst failure a completeness check can have.
 */
const EVIDENCE = /^\|\s*`(2L-[A-Z0-9]+-\d{3})`\s*\|\s*\*\*([^*]+)\*\*\s*\|(.*)\|\s*$/gm;

export function normalizeClass(raw) {
  const head = raw.trim().toLowerCase().split(/[,(/]/)[0].trim();
  return CLASSES.has(head) ? head : undefined;
}

/**
 * Rows that would contradict a signed decision.
 *
 * Each fires on an **assertion**, never on its denial: a record that says "no
 * sensitivity column was added" is upholding OD-2L-1 B, and a guard that fired
 * on that would teach the next author to soften the record until it went quiet.
 */
function contradictsSignedDecision(id, citation) {
  const asserted = citation.replace(
    /\b(never|not|no|none|rather than|instead of|neither|without|cannot|refuses|forbids|excluded|lapse[sd]?|unspent)\b[^.;]*/gi,
    " ",
  );
  const findings = [];
  if (/sensitivity column|backfill/i.test(asserted)) {
    findings.push(`${id} describes a sensitivity column or a backfill; OD-2L-1 option B refused both`);
  }
  if (/fourth view|new view|widen(ed|s)? `?workView/i.test(asserted)) {
    findings.push(`${id} describes a widened view vocabulary; OD-2L-2 option A signed three`);
  }
  if (/bulk cancel|cancel_task is bulk|destructive bulk/i.test(asserted)) {
    findings.push(`${id} describes a destructive bulk operation; OD-2L-3 option A excluded cancel_task`);
  }
  if (/gesture (is|was) (added|shipped)|swipe handler ships/i.test(asserted)) {
    findings.push(`${id} describes a shipped gesture; OD-2L-5 option A signed none`);
  }
  if (/migration (was )?spent|spent a migration/i.test(asserted)) {
    findings.push(`${id} describes a spent migration; the allocation lapsed under OD-2L-2 option A`);
  }
  return findings;
}

export function buildPhase2lTraceability({ root = REPOSITORY_ROOT } = {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const prdPath = join(root, "docs/initiatives/phase-2l/PHASE_2L_PRD.md");
  if (!existsSync(prdPath)) {
    // Fail-closed: a missing PRD is a refusal, never an empty matrix.
    throw new Error("docs/initiatives/phase-2l/PHASE_2L_PRD.md does not exist");
  }
  const prd = readFileSync(prdPath, "utf8");

  const declared = [...prd.matchAll(DECLARATION)].map((match) => match[1]);
  if (declared.length === 0) {
    throw new Error("the PRD declares no 2L- requirement; extraction produced an empty set");
  }
  const declaredSet = new Set(declared);
  if (declaredSet.size !== declared.length) {
    fail(`R2: the PRD declares a requirement more than once (${declared.length} declarations, ${declaredSet.size} unique)`);
  }

  // No successor-phase requirement may appear in this PRD.
  const foreign = [...prd.matchAll(/^- \*\*(2[A-KM-Z]-[A-Z0-9]+-\d{3}):\*\*/gm)].map((m) => m[1]);
  if (foreign.length > 0) {
    fail(`R14: the Phase 2L PRD declares requirements outside the 2L- namespace: ${foreign.join(", ")}`);
  }

  const evidence = new Map();

  for (const [slice, file] of Object.entries(SLICE_FILES)) {
    const path = join(root, "docs/reports/phase-2l", file);
    if (!existsSync(path)) {
      fail(`R16: slice ${slice}'s acceptance record is missing: ${file}`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(EVIDENCE)) {
      const [, id, rawClass, rawCitation] = match;
      const klass = normalizeClass(rawClass);
      const citation = rawCitation.trim();

      if (klass === undefined) {
        fail(`R6: ${id} carries an unrecognised class "${rawClass.trim()}" in ${slice}`);
        continue;
      }
      if (evidence.has(id)) {
        fail(`R2: ${id} is classified twice (${evidence.get(id).slice} and ${slice})`);
        continue;
      }
      if (citation.length < 30) {
        fail(`R5: ${id}'s citation is too short to resolve: "${citation}"`);
      }
      if ((klass === "partial" || klass === "undelivered") && !DESTINATION.test(citation)) {
        // A partial with no destination is an undelivered requirement with
        // better wording; an undelivered one with none is a requirement dropped.
        fail(`R8/R10: ${id} is "${klass}" but names no remainder or destination`);
      }
      if (klass === "partial" || klass === "undelivered") {
        /*
         * R18 — a partial has to owe something.
         *
         * Naming a destination is not enough: a row can point at a record that
         * is already complete and still be a `partial` kept for the count. So
         * the citation is also checked for the shape that says *nothing is
         * owed*, and a row that says it is refused rather than printed.
         */
        const vacuous = vacuousRemainder(citation);
        if (vacuous !== null) {
          fail(`R18: ${id} is "${klass}" but its remainder is vacuous ("${vacuous}"); a partial must owe a behaviour, a proof or a decision`);
        }
      }
      if (klass === "not-built-by-rule" && !RULE.test(citation)) {
        fail(`R9: ${id} is "not-built-by-rule" but names no ADR or signed decision`);
      }
      for (const finding of contradictsSignedDecision(id, citation)) fail(`R15: ${finding}`);

      evidence.set(id, { slice, klass, citation });
    }
  }

  for (const id of declared) {
    if (!evidence.has(id)) fail(`R1: ${id} is declared in the PRD and classified nowhere`);
  }
  for (const id of evidence.keys()) {
    if (!declaredSet.has(id)) fail(`R4: ${id} is classified but the PRD does not declare it`);
  }

  /*
   * R13 — the budget, by looking.
   *
   * OD-2L-2 option A signed the allocation away, so the reconciliation is not a
   * count against a ceiling: **any** Phase 2L migration is a refusal. Checked
   * against the directory rather than against a restated number, which is the
   * only way `2L-CLOSE-003` is a fact.
   */
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((name) => /phase_2l|_2l_/i.test(name));
  if (migrations.length !== MIGRATION_BUDGET.expectedSpend) {
    fail(`R13: Phase 2L spent ${migrations.length} migration(s) against a signed spend of ${MIGRATION_BUDGET.expectedSpend}: ${migrations.join(", ")}`);
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
  const lines = [];
  lines.push("# Phase 2L — Traceability matrix");
  lines.push("");
  lines.push("**Generated** by `scripts/generate-phase-2l-traceability.mjs`, which refuses to emit");
  lines.push("anything when a requirement is unclassified, classified twice, classified without a");
  lines.push("resolvable citation, classified as partial with no destination, classified as");
  lines.push("not-built-by-rule with no rule, or classified in a way that contradicts a signed");
  lines.push("decision — and which reconciles the migration budget by looking at the directory.");
  lines.push("");
  lines.push(`**${result.declared.length} requirements declared · ${result.evidence.size} classified · 0 unclassified.**`);
  lines.push("");
  const order = ["built", "baseline", "partial", "not-built-by-rule", "undelivered"];
  lines.push(order.map((klass) => `${result.counts[klass] ?? 0} ${klass}`).join(" · "));
  lines.push("");
  lines.push(`**Migration budget: ${MIGRATION_BUDGET.allocated} allocated · ${result.migrations.length} spent.**`);
  lines.push("");
  lines.push("| id | slice | classification | evidence |");
  lines.push("|---|---|---|---|");
  for (const id of result.declared) {
    const row = result.evidence.get(id);
    lines.push(`| \`${id}\` | ${row.slice} | ${row.klass} | ${row.citation.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("generate-phase-2l-traceability.mjs");
if (invokedDirectly) {
  try {
    const result = buildPhase2lTraceability();
    const out = join(REPOSITORY_ROOT, "docs/reports/phase-2l/PHASE_2L_TRACEABILITY_MATRIX.md");
    writeFileSync(out, renderMatrix(result), "utf8");
    console.log(`wrote ${out}`);
    console.log(`${result.declared.length} declared · ${result.evidence.size} classified`);
    for (const [klass, count] of Object.entries(result.counts)) console.log(`  ${klass}: ${count}`);
  } catch (error) {
    console.error(error.message);
    for (const failure of error.failures ?? []) console.error(`  - ${failure}`);
    process.exit(1);
  }
}
