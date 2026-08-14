/**
 * `2N-CLOSE-001` — the fail-closed Phase 2N traceability generator.
 *
 * It reads the PRD for what was **declared** and the slice acceptance records
 * for what was **evidenced**, cross-checks both directions, and either writes the
 * matrix or refuses and says exactly why. It never writes a partial matrix: a
 * document that silently omits the rows it could not verify is worse than no
 * document, because it looks complete.
 *
 * ## Four row shapes, because the records really use four
 *
 * Phase 2M's generator expected one row shape and could afford to. Phase 2N
 * cannot: its eight acceptance records were written across six slices and they
 * classify in four different ways. Measured, not assumed:
 *
 *   1. **row-level class** — `| \`2N-X-001\` … | **built** | evidence |`, with the
 *      class in any column (2N.2, 2N.3-M1, 2N.4, 2N.5, 2N.6);
 *   2. **class by heading** — `### Built (17)` over a table of ids (2N.0, 2N.1);
 *   3. **family heading + bare suffix** — `### \`2N-KNOWS\` (9)` over rows keyed
 *      `001, 002, 007` (2N.3);
 *   4. **compound class** — `baseline (words) / made true by M1`, which resolves
 *      to its head token, the rule Phase 2M's `normalizeClass` already used.
 *
 * **Tolerating four shapes is safe only because of the completeness check.**
 * Every one of the PRD's declared ids must come out classified exactly once, so
 * a shape this misreads shows up as an unclassified id and a refusal — never as
 * a quietly missing row. A generator that skipped what it could not parse would
 * be the "looks complete" failure with extra steps.
 *
 * ## What it refuses
 *
 * - a declared id no record classifies;
 * - an id two records classify **differently** (agreement is fine — a later
 *   slice re-stating an inherited `baseline` is not a conflict);
 * - a `partial` whose evidence names no destination — `partial` means something
 *   is still owed, and a remainder with nowhere to go is an undelivered
 *   requirement with better wording;
 * - a `not-built-by-rule` that cites no rule;
 * - a migration budget that does not reconcile, in either direction. A shortfall
 *   is as much a finding as an excess, and `2N-CLOSE-003` says so: an unspent
 *   allocation is not a defect, and an unnecessary spend is.
 *
 * Usage:  node scripts/generate-phase-2n-traceability.mjs
 *         node scripts/generate-phase-2n-traceability.mjs --check
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PRD = "docs/initiatives/phase-2n/PHASE_2N_PRD.md";
const REPORTS = "docs/reports/phase-2n";
const OUTPUT = `${REPORTS}/PHASE_2N_TRACEABILITY_MATRIX.md`;

/**
 * The migration budget, by name.
 *
 * `M2` is **deliberately unspent**. `2N-METRICS-002` made it conditional and
 * `PHASE_2N_SLICE_7_M2_VERDICT.md` is the measurement that closed it that way,
 * so this generator expects **two** files with the phase's prefix and treats a
 * third as the stop condition ADR-112 Decision 2 names.
 */
export const MIGRATION_BUDGET = Object.freeze({
  allocated: 3,
  expectedSpend: 2,
  named: Object.freeze({
    M1: "202608130093_phase_2n_slice_3_memory_retrieval.sql",
    M2: "(UNSPENT — telemetry; see PHASE_2N_SLICE_7_M2_VERDICT.md)",
    M3: "202608140094_phase_2n_slice_3_entity_deletion.sql",
  }),
});

export const CLASSES = new Set(["built", "baseline", "partial", "not-built-by-rule", "undelivered"]);

/** The slice whose record may adjudicate a conflict — the phase's own close. */
export const CLOSEOUT_SLICE = "2N.7";

/** What counts as naming where a remainder goes. */
const DESTINATION =
  /[Dd]estination|[Rr]emainder|deferred|routed to|carried past close|successor|owner|slice 2N\.\d|2N-[A-Z]+(-[A-Z]+)?\b|hardware|stop condition/;

/** A rule-driven absence must name the rule that drove it. */
const RULE = /ADR-\d{3}|OD-2N-\d+|OD-2[A-Z]-\d+|2N-[A-Z]+-\d{3}|by rule|signature/;

const DECLARATION = /^- \*\*(2N-[A-Z0-9]+-\d{3}):\*\*/gm;

/**
 * A class token wherever it appears, bold or code-fenced.
 *
 * Both markups are in use across the records and neither is more authoritative
 * than the other, so both are read rather than one being declared canonical and
 * the other silently dropped.
 */
const CLASS_TOKEN = /(?:\*\*|`)(built|baseline|partial|not-built-by-rule|undelivered)\b/i;

export function normalizeClass(raw) {
  const head = String(raw).trim().toLowerCase().split(/[,(/]/)[0].trim();
  return CLASSES.has(head) ? head : undefined;
}

/** `### Built (17)` and friends — the class carried by an enclosing heading. */
function headingClass(line) {
  const match = /^#{3,4}\s+(Built|Baseline|Partial|Not[- ]built[- ]by[- ]rule|Undelivered)\b/i.exec(line);
  if (!match) return undefined;
  return normalizeClass(match[1].toLowerCase().replace(/\s/g, "-"));
}

/** `### \`2N-KNOWS\` (9) — M1` — the family an id-suffix table belongs to. */
function headingFamily(line) {
  const match = /^#{3,4}\s+`?(2N-[A-Z0-9]+)`?(?:-\d{3}…\d{3})?\b/.exec(line);
  return match ? match[1] : undefined;
}

/**
 * Every `(id, class, evidence)` an acceptance record states.
 *
 * The parser is line-oriented and carries two pieces of state — the class the
 * last class-heading declared and the family the last family-heading declared —
 * because shapes 2 and 3 put the answer above the row rather than in it.
 */
export function extractClassifications(body, source) {
  const rows = [];
  let currentClass;
  let currentFamily;

  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("#")) {
      const asClass = headingClass(line);
      const asFamily = headingFamily(line);
      // A heading resets whichever axis it declares and leaves the other alone:
      // 2N.3 nests id-suffix tables under family headings with the class in the
      // row, and 2N.0 nests id tables under class headings with no family.
      if (asClass) currentClass = asClass;
      if (asFamily) currentFamily = asFamily;
      if (!asClass && !asFamily) currentClass = undefined;
      continue;
    }
    if (!line.startsWith("|")) continue;
    if (/^\|\s*-{2,}/.test(line)) continue;

    const cells = line.split("|").slice(1, -1);
    const inline = CLASS_TOKEN.exec(line);
    const rowClass = inline ? normalizeClass(inline[1]) : currentClass;
    if (!rowClass) continue;

    /*
     * The subject is the id in the FIRST cell, and only the whole row when the
     * first cell names none.
     *
     * Rows routinely cite a second id in their evidence — "no session claimed —
     * `2N-ACCESS-006`" is a citation, not a second subject — and reading the
     * whole row would make those ambiguous and drop both. The table's own
     * structure already says which id a row is about, so it is used.
     */
    const idsIn = (text) => [...new Set([...text.matchAll(/\b(2N-[A-Z0-9]+-\d{3})\b/g)].map((m) => m[1]))];
    const subject = idsIn(cells[0] ?? "");
    const anywhere = idsIn(line);
    const chosen = subject.length === 1 ? subject : anywhere;
    if (chosen.length === 1) {
      rows.push({ id: chosen[0], class: rowClass, evidence: line, source });
      continue;
    }
    if (anywhere.length > 0) continue;

    // Shape 3: bare suffixes in the first cell, under a family heading.
    if (!currentFamily) continue;
    const first = (cells[0] ?? "").trim().replace(/`/g, "");
    if (!/^\d{3}(\s*(,|and|…|\.\.\.)\s*\d{3})*$/.test(first)) continue;
    for (const suffix of first.match(/\d{3}/g) ?? []) {
      rows.push({ id: `${currentFamily}-${suffix}`, class: rowClass, evidence: line, source });
    }
  }
  return rows;
}

function slicePrefix(name) {
  const match = /PHASE_2N_SLICE_([0-9A-Z_]+?)_ACCEPTANCE\.md/.exec(name);
  return match ? `2N.${match[1].replace(/_/g, "-").toLowerCase()}` : name;
}

export function buildMatrix(root = REPOSITORY_ROOT) {
  const read = (relative) => readFileSync(join(root, relative), "utf8");
  const problems = [];

  const declared = [...new Set([...read(PRD).matchAll(DECLARATION)].map((m) => m[1]))];
  if (declared.length === 0) problems.push("the PRD declared no requirement — the parser or the document moved");

  const files = readdirSync(join(root, REPORTS))
    .filter((name) => /^PHASE_2N_SLICE_.*_ACCEPTANCE\.md$/.test(name))
    .sort();

  const byId = new Map();
  for (const file of files) {
    for (const row of extractClassifications(read(`${REPORTS}/${file}`), slicePrefix(file))) {
      if (!byId.has(row.id)) byId.set(row.id, []);
      byId.get(row.id).push(row);
    }
  }

  const declaredSet = new Set(declared);
  for (const id of byId.keys()) {
    if (!declaredSet.has(id)) problems.push(`${id} is classified but the PRD does not declare it`);
  }

  const resolved = [];
  for (const id of declared) {
    const rows = byId.get(id) ?? [];
    if (rows.length === 0) {
      problems.push(`${id} is declared and no acceptance record classifies it`);
      continue;
    }
    /*
     * Adjudication, and its narrow licence.
     *
     * Eight records written across six slices disagree about two ids, and both
     * disagreements are real: a slice that inherited a property called it
     * `baseline` while the slice that delivered it called it `built`. Somebody
     * has to settle that, and the closing slice is where a phase settles its
     * record — so a `2N.7` row **adjudicates a conflict**.
     *
     * The licence is deliberately narrow, or it would be a licence to overwrite.
     * The closeout may settle ids the prior records **disagree** about and may
     * classify ids **no record reached**; it may **not** overturn a class the
     * prior records already agree on. That last case is a refusal, because a
     * closeout quietly re-grading settled work is the failure this whole
     * generator exists to make impossible.
     */
    const priors = rows.filter((row) => row.source !== CLOSEOUT_SLICE);
    const closeouts = rows.filter((row) => row.source === CLOSEOUT_SLICE);
    const priorClasses = [...new Set(priors.map((row) => row.class))];

    if (priorClasses.length > 1 && closeouts.length === 0) {
      problems.push(
        `${id} is classified ${priorClasses.length} different ways and the closeout does not adjudicate: ${priors
          .map((row) => `${row.class} (${row.source})`)
          .join(", ")}`,
      );
      continue;
    }
    if (priorClasses.length === 1 && closeouts.length > 0 && closeouts.some((row) => row.class !== priorClasses[0])) {
      problems.push(
        `${id} was settled as ${priorClasses[0]} and the closeout re-grades it to `
          + `${closeouts.map((row) => row.class).join("/")} — a closeout may adjudicate a conflict, never overturn agreement`,
      );
      continue;
    }

    const adjudicated = priorClasses.length > 1;
    const row = closeouts.length > 0 ? closeouts[closeouts.length - 1] : priors[priors.length - 1];
    if (row.class === "partial" && !DESTINATION.test(row.evidence)) {
      problems.push(`${id} is partial and its evidence names no destination`);
    }
    if (row.class === "not-built-by-rule" && !RULE.test(row.evidence)) {
      problems.push(`${id} is not-built-by-rule and cites no rule`);
    }
    resolved.push({
      id,
      class: row.class,
      source: row.source,
      adjudicated,
      sources: rows.map((entry) => entry.source),
    });
  }

  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((name) => /^\d+_phase_2n_.*\.sql$/.test(name))
    .sort();
  if (migrations.length !== MIGRATION_BUDGET.expectedSpend) {
    problems.push(
      `the phase has ${migrations.length} migration(s) and the budget expects ${MIGRATION_BUDGET.expectedSpend}: ${
        migrations.join(", ") || "none"
      }`,
    );
  }
  if (migrations.length > MIGRATION_BUDGET.allocated) {
    problems.push("a fourth migration exists — that is a STOP CONDITION, not a matrix row");
  }

  const tally = {};
  for (const klass of CLASSES) tally[klass] = resolved.filter((row) => row.class === klass).length;

  return { declared, resolved, tally, migrations, problems };
}

function render({ declared, resolved, tally, migrations }) {
  const families = [...new Set(declared.map((id) => id.replace(/-\d{3}$/, "")))].sort();
  const lines = [];
  lines.push("# Phase 2N — traceability matrix");
  lines.push("");
  lines.push("**Generated by `scripts/generate-phase-2n-traceability.mjs`. Do not edit by hand.**");
  lines.push("");
  lines.push(
    "It reads the PRD for what was declared and the slice acceptance records for what was evidenced,"
      + " and refuses to write anything at all if a declared requirement is unclassified, classified two"
      + " different ways, `partial` without a destination, `not-built-by-rule` without a rule, or if the"
      + " migration budget does not reconcile.",
  );
  lines.push("");
  lines.push(`**${declared.length} declared · ${resolved.length} classified · 0 unclassified.**`);
  lines.push("");
  lines.push("| Class | Count |");
  lines.push("| --- | --- |");
  for (const klass of ["built", "baseline", "partial", "not-built-by-rule", "undelivered"]) {
    lines.push(`| ${klass} | **${tally[klass]}** |`);
  }
  lines.push("");
  lines.push("## Migrations");
  lines.push("");
  lines.push(
    `\`${MIGRATION_BUDGET.allocated} allocated · ${migrations.length} spent\`. `
      + "**M2 closes UNSPENT**, which `2N-CLOSE-003` records as a correct outcome rather than a defect.",
  );
  lines.push("");
  lines.push("| Allocation | File |");
  lines.push("| --- | --- |");
  for (const [name, file] of Object.entries(MIGRATION_BUDGET.named)) lines.push(`| ${name} | \`${file}\` |`);
  lines.push("");

  for (const family of families) {
    const rows = resolved.filter((row) => row.id.startsWith(`${family}-`));
    lines.push(`## ${family} (${rows.length})`);
    lines.push("");
    lines.push("| Requirement | Class | Evidenced by |");
    lines.push("| --- | --- | --- |");
    for (const row of rows) {
      const mark = row.adjudicated ? ` (adjudicated; prior: ${row.sources.join(", ")})` : "";
      lines.push(`| \`${row.id}\` | ${row.class} | ${row.source}${mark} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const result = buildMatrix();
  if (result.problems.length > 0) {
    console.error(`\nREFUSED — ${result.problems.length} problem(s), and no matrix was written:\n`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error("");
    process.exit(1);
  }
  const body = render(result);
  const target = join(REPOSITORY_ROOT, OUTPUT);
  if (process.argv.includes("--check")) {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (current.replace(/\r\n/g, "\n") !== body) {
      console.error(`${OUTPUT} is stale — re-run the generator.`);
      process.exit(1);
    }
    console.log(`${OUTPUT} is current: ${result.declared.length} declared, all classified.`);
  } else {
    writeFileSync(target, body);
    console.log(`${OUTPUT} written: ${result.declared.length} declared, all classified.`);
    console.log(
      Object.entries(result.tally)
        .map(([klass, count]) => `${klass}=${count}`)
        .join(" · "),
    );
  }
}
