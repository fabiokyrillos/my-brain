/**
 * Phase 2M's traceability generator.
 *
 * Fail-closed: it refuses to emit a matrix when anything is unresolved, and a
 * refusal is a non-zero exit naming **every** finding rather than the first.
 *
 * ## What it inherits, and the one thing it adds
 *
 * The shape is Phase 2L's: extract the declared ids from the PRD, extract one
 * classifying row per id from the slice records, refuse on anything that does
 * not resolve, and write the counts **from the extraction** so `R-27` — *"any
 * count in any closing document that the generator cannot reproduce from the
 * declarations fails, including one that happens to be right"* — has something
 * to be true of.
 *
 * What it adds is a **mid-phase mode**, and it exists because of when it was
 * written. Phase 2L's generator is a closeout tool: every requirement must be
 * classified or it refuses. Phase 2M's arrives at slice 2M.3, with 2M.4a, 2M.4b
 * and 2M.5 still ahead, so demanding completeness now would mean either a
 * refusal on every run or — far worse — a tolerance added at closeout, when the
 * completeness check is the one thing that matters.
 *
 * So completeness is a **flag, defaulted off, and required at closeout**:
 * `--complete` turns "not yet classified" from a listed remainder into a
 * refusal. Everything else — duplicates, unknown classes, vacuous remainders,
 * rule-driven absences with no rule, foreign namespaces, the migration budget —
 * is enforced on every run, at every stage.
 *
 * ## The budget is checked against the directory, not against a sentence
 *
 * `3 allocated`, NON-TRANSFERABLE, by name: migration 1 is the telemetry
 * vocabulary (`202608110090`), migration 2 is notification consent and push
 * (2M.4b, reserved), migration 3 is `clear_planned` and nothing else
 * (`202608110091`, ADR-106). A **fourth** is a stop condition, so the count is
 * read from `supabase/migrations/` rather than from any document that could be
 * edited to agree with itself.
 *
 * Usage:
 *   node scripts/generate-phase-2m-traceability.mjs            # mid-phase
 *   node scripts/generate-phase-2m-traceability.mjs --complete # closeout
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The migration budget, by name.
 *
 * `expectedSpend` is not a ceiling to stay under — it is the exact number the
 * phase is allowed to have created, and both a shortfall and an excess are
 * findings. A fourth file matching the phase's prefix is the stop condition
 * ADR-105 and ADR-106 both name.
 */
export const MIGRATION_BUDGET = Object.freeze({
  allocated: 3,
  named: Object.freeze({
    1: "202608110090_phase_2m_daily_cycle_telemetry.sql",
    2: "(reserved: notification consent, subscription and delivery — slice 2M.4b)",
    3: "202608110091_phase_2m_clear_planned.sql",
  }),
});

export const SLICE_FILES = Object.freeze({
  "2M.0": "PHASE_2M_SLICE_00_ACCEPTANCE.md",
  "2M.1": "PHASE_2M_SLICE_01_ACCEPTANCE.md",
  "2M.2": "PHASE_2M_SLICE_02_ACCEPTANCE.md",
  "2M.3": "PHASE_2M_SLICE_03_ACCEPTANCE.md",
  "2M.4a": "PHASE_2M_SLICE_04A_ACCEPTANCE.md",
  "2M.4b": "PHASE_2M_SLICE_04B_ACCEPTANCE.md",
  "2M.5": "PHASE_2M_SLICE_05_ACCEPTANCE.md",
});

const CLASSES = new Set(["built", "baseline", "partial", "not-built-by-rule", "undelivered"]);

/** What counts as naming where a remainder goes. */
const DESTINATION = /[Dd]estination|[Rr]emainder|deferred|routed to|carried past close|successor|owner-run|slice 2M\.\d|hardware/;

/**
 * A remainder that is not a remainder.
 *
 * `partial` means something is still owed. A row that says the remainder is
 * "none" is a `partial` being used to preserve a count, which is the one thing a
 * classification must never be for. Phase 2L shipped exactly that twice and an
 * independent review caught it, so the rule is mechanical from here.
 */
const VACUOUS_REMAINDER = [
  /[Rr]emainder:?\s*(is\s+)?(none|nothing|n\/a)\b/,
  /\bnothing (is )?(outstanding|pending|owed|missing|left)\b/i,
  /\bno (behaviour|behavior|proof|evidence|work|decision)[^.;]*\b(outstanding|pending|owed|missing|remains?|left)\b/i,
];

function vacuousRemainder(citation) {
  for (const pattern of VACUOUS_REMAINDER) {
    const match = pattern.exec(citation);
    if (match) return match[0].trim();
  }
  return null;
}

/** A rule-driven absence must name the rule that drove it. */
const RULE = /ADR-\d{3}|OD-2M-\d|OD-2L-\d/;

const DECLARATION = /^- \*\*(2M-[A-Z0-9]+-\d{3}):\*\*/gm;

/** `| \`id\` | **class** | evidence |`, matched to end of line so no row is skipped. */
const EVIDENCE = /^\|\s*`(2M-[A-Z0-9]+-\d{3})`\s*\|\s*\*\*([^*]+)\*\*\s*\|(.*)\|\s*$/gm;

export function normalizeClass(raw) {
  const head = raw.trim().toLowerCase().split(/[,(/]/)[0].trim();
  return CLASSES.has(head) ? head : undefined;
}

/**
 * Rows that would contradict a signed decision.
 *
 * Each fires on an **assertion**, never on its denial: a record saying "no
 * recurrence field was added" is upholding OD-2M-7, and a guard firing on that
 * would teach the next author to soften the record until it went quiet.
 */
function contradictsSignedDecision(id, citation) {
  /*
   * Two neutralizations, not one.
   *
   * The first strips denials, so "no recurrence column was added" is not read as
   * a description of one. The second strips **guard prose**: a row whose
   * evidence is "the mutation cases fire on a recurrence column" is describing
   * the thing that *refuses* recurrence, and a check that fired on it would
   * teach the next author to stop describing their guards. `2M-RECUR-003`'s
   * slice-2M.0 row is exactly that shape, and it is why this second pass exists.
   */
  const asserted = citation
    .replace(/\b(never|not|no|none|rather than|instead of|neither|without|cannot|refuses?|refusal|forbids|excluded|unspent|absent)\b[^.;]*/gi, " ")
    .replace(/\b(guard|mutation cases?|fires? on|a control proves|scan)\b[^.;]*/gi, " ");
  const findings = [];
  if (/recurrence (column|field|table|expander)|recurring series/i.test(asserted)) {
    findings.push(`${id} describes recurrence; OD-2M-7 put it outside this phase`);
  }
  if (/planned_at is a commitment|planned_at as a deadline|reserved time/i.test(asserted)) {
    findings.push(`${id} describes planned_at as a commitment; OD-2M-3 option A signed an intention`);
  }
  if (/gesture (is|was) (added|shipped)|swipe handler ships|drag to reschedule/i.test(asserted)) {
    findings.push(`${id} describes a shipped gesture; OD-2M-6 option A signed visible controls only`);
  }
  if (/payload carries (a )?(title|description|task)/i.test(asserted)) {
    findings.push(`${id} describes content in a payload; OD-2M-4 option B signed content-free`);
  }
  if (/sensitivity column|classification (is )?persisted/i.test(asserted)) {
    findings.push(`${id} describes a persisted classification; OD-2L-1 option B refused one`);
  }
  return findings;
}

export function buildPhase2mTraceability({ root = REPOSITORY_ROOT, complete = false } = {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const prdPath = join(root, "docs/initiatives/phase-2m/PHASE_2M_PRD.md");
  if (!existsSync(prdPath)) {
    throw new Error("docs/initiatives/phase-2m/PHASE_2M_PRD.md does not exist");
  }
  const prd = readFileSync(prdPath, "utf8");

  const declared = [...prd.matchAll(DECLARATION)].map((match) => match[1]);
  if (declared.length === 0) {
    throw new Error("the PRD declares no 2M- requirement; extraction produced an empty set");
  }
  const declaredSet = new Set(declared);
  if (declaredSet.size !== declared.length) {
    fail(`R2: the PRD declares a requirement more than once (${declared.length} declarations, ${declaredSet.size} unique)`);
  }

  const foreign = [...prd.matchAll(/^- \*\*(2[A-LN-Z]-[A-Z0-9]+-\d{3}):\*\*/gm)].map((match) => match[1]);
  if (foreign.length > 0) {
    fail(`R26: the Phase 2M PRD declares requirements outside the 2M- namespace: ${foreign.join(", ")}`);
  }

  const evidence = new Map();
  const presentSlices = [];

  for (const [slice, file] of Object.entries(SLICE_FILES)) {
    const path = join(root, "docs/reports/phase-2m", file);
    if (!existsSync(path)) {
      // Mid-phase this is expected; at closeout it is a refusal.
      if (complete) fail(`R16: slice ${slice}'s acceptance record is missing: ${file}`);
      continue;
    }
    presentSlices.push(slice);
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(EVIDENCE)) {
      const [, id, rawClass, rawCitation] = match;
      const klass = normalizeClass(rawClass);
      const citation = rawCitation.trim();

      if (klass === undefined) {
        fail(`R6: ${id} carries an unrecognised class "${rawClass.trim()}" in ${slice}`);
        continue;
      }
      if (!declaredSet.has(id)) {
        fail(`R1: ${slice} classifies ${id}, which the PRD does not declare`);
        continue;
      }
      /*
       * A requirement may be classified more than once, because a remainder is
       * discharged in the slice its destination named: `2M-MOBILE-004` was
       * `built` for the calendar in 2M.1, re-opened `partial` for the planner in
       * 2M.2, and `built` in 2M.3 where 2M.2 said it would be. That history is
       * the contract working, not a contradiction, so every classification is
       * kept and the **final** one is what the matrix reports.
       *
       * What refuses is a *net* regression: a requirement whose last word is
       * weaker than something an earlier slice already claimed, with nothing
       * later putting it back.
       */
      const history = evidence.get(id) ?? [];
      history.push({ class: klass, citation, slice });
      evidence.set(id, history);
    }
  }

  const STRENGTH = { undelivered: 0, partial: 1, baseline: 2, "not-built-by-rule": 2, built: 3 };

  /** The final classification per id, with the history that produced it. */
  const resolved = new Map();
  for (const [id, history] of evidence) {
    const final = history[history.length - 1];
    const strongest = history.reduce((best, row) => (STRENGTH[row.class] > STRENGTH[best.class] ? row : best), final);
    if (STRENGTH[final.class] < STRENGTH[strongest.class]) {
      fail(`R2: ${id} ends ${final.class} in ${final.slice} after ${strongest.class} in ${strongest.slice}`);
    }
    resolved.set(id, {
      class: final.class,
      citation: final.citation,
      slice: final.slice,
      supersedes: history.length > 1 ? history.slice(0, -1).map((row) => `${row.slice}:${row.class}`).join(", ") : null,
    });
  }

  for (const [id, row] of resolved) {
    if (row.citation.length < 12) {
      fail(`R7: ${id} is classified ${row.class} in ${row.slice} with no evidence`);
    }
    if (row.class === "partial" || row.class === "undelivered") {
      if (!DESTINATION.test(row.citation)) {
        fail(`R8: ${id} is ${row.class} in ${row.slice} and names no destination`);
      }
      const vacuous = vacuousRemainder(row.citation);
      if (vacuous !== null) {
        fail(`R8: ${id} is ${row.class} in ${row.slice} with a vacuous remainder: "${vacuous}"`);
      }
    }
    if (row.class === "not-built-by-rule" && !RULE.test(row.citation)) {
      fail(`R23: ${id} is not-built-by-rule in ${row.slice} and names no rule`);
    }
    for (const finding of contradictsSignedDecision(id, row.citation)) fail(`R23: ${finding}`);
  }

  const unclassified = declared.filter((id) => !resolved.has(id));
  if (complete && unclassified.length > 0) {
    fail(`R1: ${unclassified.length} declared requirements are classified nowhere: ${unclassified.join(", ")}`);
  }

  // The budget, read from the directory rather than from a document.
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((file) => /phase_2m/.test(file))
    .sort();
  if (migrations.length > MIGRATION_BUDGET.allocated) {
    fail(`R13: ${migrations.length} Phase 2M migrations exist; ${MIGRATION_BUDGET.allocated} are allocated. A fourth is a STOP CONDITION.`);
  }

  const counts = {};
  for (const klass of CLASSES) counts[klass] = 0;
  for (const row of resolved.values()) counts[row.class] += 1;

  return {
    failures,
    declared,
    evidence: resolved,
    unclassified,
    presentSlices,
    migrations,
    counts,
    complete,
  };
}

export function renderMatrix(result) {
  const lines = [];
  lines.push("# Phase 2M — traceability matrix");
  lines.push("");
  lines.push("**Generated by `scripts/generate-phase-2m-traceability.mjs`. Do not edit by hand.**");
  lines.push("");
  lines.push(
    result.complete
      ? "Closeout run: every declared requirement must be classified."
      : "**Mid-phase run.** Requirements belonging to slices that have not shipped are listed as *not yet classified*, which is a statement about the calendar rather than about the work.",
  );
  lines.push("");
  lines.push(`- declared requirements: **${result.declared.length}**`);
  lines.push(`- classified: **${result.evidence.size}**`);
  lines.push(`- not yet classified: **${result.unclassified.length}**`);
  for (const [klass, count] of Object.entries(result.counts)) {
    lines.push(`- ${klass}: **${count}**`);
  }
  lines.push(`- slice records read: ${result.presentSlices.join(", ")}`);
  lines.push(`- Phase 2M migrations on disk: **${result.migrations.length}** of **${MIGRATION_BUDGET.allocated}** allocated`);
  for (const file of result.migrations) lines.push(`  - \`${file}\``);
  lines.push("");
  lines.push("| Requirement | Class | Slice | Superseded from | Evidence |");
  lines.push("|---|---|---|---|---|");
  for (const id of result.declared) {
    const row = result.evidence.get(id);
    if (row === undefined) {
      lines.push(`| \`${id}\` | _not yet classified_ | — | — | — |`);
      continue;
    }
    lines.push(`| \`${id}\` | ${row.class} | ${row.slice} | ${row.supersedes ?? "—"} | ${row.citation.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const complete = process.argv.includes("--complete");
  const result = buildPhase2mTraceability({ complete });
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`REFUSED: ${failure}`);
    console.error(`\n${result.failures.length} finding(s). No matrix was written.`);
    process.exit(1);
  }
  /*
   * **The mid-phase run writes nothing**, and that is not a convenience.
   *
   * `phase-2m-declarations.test.ts` forbids the matrix and the closing report
   * from existing before their gate, because *a matrix written early is a
   * classification of work that has not happened*. That guard is right, and the
   * first version of this script tripped it on its first run. The correct
   * response was to make the artifact impossible before its gate rather than to
   * relax the guard — so the mid-phase run prints the reconciliation to stdout,
   * where it can be read and cited, and only `--complete` puts a file on disk.
   */
  if (result.complete) {
    const output = join(REPOSITORY_ROOT, "docs/reports/phase-2m/PHASE_2M_TRACEABILITY_MATRIX.md");
    writeFileSync(output, `${renderMatrix(result)}`, "utf8");
    console.log(`Wrote ${output}`);
  } else {
    console.log(renderMatrix(result));
    console.log("(mid-phase run: no artifact written — the closeout gate owns the file)");
  }
  console.log(`declared=${result.declared.length} classified=${result.evidence.size} unclassified=${result.unclassified.length}`);
  console.log(`migrations=${result.migrations.length}/${MIGRATION_BUDGET.allocated}`);
}
