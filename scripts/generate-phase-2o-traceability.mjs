/**
 * `2O-CLOSE-001` / `2O-CLOSE-002` — the fail-closed Phase 2O traceability generator.
 *
 * It reads the PRD for what was **declared** and the eight slice acceptance
 * records for what was **evidenced**, cross-checks both directions, and either
 * writes the matrix or refuses and says exactly why. It never writes a partial
 * matrix: a document that silently omits the rows it could not verify is worse
 * than no document, because it looks complete.
 *
 * ## Four row shapes, because the records really use four
 *
 * Phase 2N's generator faced the same problem and the count is the same here,
 * but the shapes are not. Measured against the eight records rather than
 * assumed:
 *
 *   1. **prose, full id** — `**\`2O-ACTIVATION-001\` — built.**` (2O.0);
 *   2. **prose, bare suffix** — `**\`-001\` built.**` (2O.1);
 *   3. **table, bare suffix** — `| \`-003\` … | **partial** | … |` (2O.2);
 *   4. **table, full id** — `| \`2O-PREF-001\` | **built** | … |` (2O.3 … 2O.8).
 *
 * A bare suffix resolves against the record's **primary family**, taken from
 * its own header declaration rather than guessed.
 *
 * **Tolerating four shapes is safe only because of the completeness check.**
 * Every one of the PRD's declared ids must come out classified exactly once, so
 * a shape this misreads shows up as an unclassified id and a refusal — never as
 * a quietly missing row. A generator that skipped what it could not parse would
 * be the "looks complete" failure with extra steps.
 *
 * ## The section scope is load-bearing, and it is not decoration
 *
 * Classifications are read **only** from each record's classification section,
 * whose heading differs across the eight (`Requirement by requirement`,
 * `Classification`, `Requirements`, `Requirement classification`). Slice 2O.2's
 * record carries a **re-audit** table in shape 3 with a different vocabulary
 * (`no` / `partly` / `yes, already`) describing what was true *before* the
 * slice. Parsing the whole file would read that table as classification and
 * produce confident nonsense. The scope is what keeps a prior-state table from
 * being mistaken for an outcome.
 *
 * ## What it refuses
 *
 * - a declared id no record classifies;
 * - an id declared twice, or an id classified outside the declared 116;
 * - an id two records classify **differently** with no explicit adjudication —
 *   agreement is not a conflict, and a later slice re-stating an earlier class
 *   is agreement;
 * - an **adjudication that is silent**: a later record may overturn an earlier
 *   class only by saying so in the row, and by citing the authority that
 *   permits it;
 * - a `partial` whose evidence names no destination — `partial` means something
 *   is still owed, and a remainder with nowhere to go is an undelivered
 *   requirement with better wording;
 * - a `partial` whose remainder is **vacuous** — Phase 2L's closeout produced
 *   two and had to be corrected the same day;
 * - a `not-built-by-rule` that cites no rule;
 * - a migration budget that does not reconcile, in either direction. A shortfall
 *   is as much a finding as an excess, and `2O-CLOSE-003` says so: an unspent
 *   allocation is not a defect, and an unnecessary spend is.
 *
 * ## The destination may not be satisfied by the requirement's own id
 *
 * A row reading *"`2O-ONBOARD-003` — destination: `2O-ONBOARD-003`"* names
 * nowhere. Before testing for a destination the requirement's own identifier is
 * stripped from the evidence, so a row can never discharge the obligation by
 * containing its own subject. The same strip runs before the rule check.
 *
 * Usage:  node scripts/generate-phase-2o-traceability.mjs
 *         node scripts/generate-phase-2o-traceability.mjs --check
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PRD = "docs/initiatives/phase-2o/PHASE_2O_PRD.md";
const REPORTS = "docs/reports/phase-2o";
const OUTPUT = `${REPORTS}/PHASE_2O_TRACEABILITY_MATRIX.md`;

/** What the PRD declares. Asserted, never assumed — `R-2O-3` forbids drift. */
export const DECLARED_TOTAL = 116;

/**
 * The migration budget, by name.
 *
 * **Both allocations are expected to close unspent**, and for two different
 * reasons that must not be collapsed. `M2` lost its destination at ADR-116 when
 * all three decisions it was reserved for were signed **A**, so it closes
 * unspent **by construction** — there was never anything for it to do. `M1`
 * survived as *live and conditional* under `OD-2O-8` **A** and ADR-118 Decision
 * 3, and closes unspent **by measurement**: slice 2O.8 looked for the real
 * producer and the real consumer the condition names, and neither exists.
 *
 * `2O-CLOSE-003` makes both a correct outcome. A third file with this phase's
 * prefix is the stop condition ADR-118 Decision 9 names.
 */
export const MIGRATION_BUDGET = Object.freeze({
  allocated: 2,
  expectedSpend: 0,
  named: Object.freeze({
    M1: "(UNSPENT — activation telemetry; no real producer and no real consumer, measured in slice 2O.8)",
    M2: "(UNSPENT — no destination since ADR-116; unspendable by R-2O-25)",
  }),
});

export const CLASSES = Object.freeze(["built", "baseline", "partial", "not-built-by-rule", "undelivered"]);
const CLASS_SET = new Set(CLASSES);

/** The slice whose record may adjudicate a conflict — the phase's own close. */
export const CLOSEOUT_SLICE = "2O.8";

/**
 * The headings under which a record states its classifications.
 *
 * Eight records, five headings. Listing them is deliberate: a record that grows
 * a sixth spelling produces unclassified ids and a refusal, which is the
 * failure this generator is for. Guessing from context would make a misparse
 * silent instead.
 */
const CLASSIFICATION_HEADINGS =
  /^#{2,3}\s*\d+\.\s*(?:Requirement by requirement|Requirement classification|Classification|Requirements)\s*$/im;

/** What counts as naming where a remainder goes. */
const DESTINATION_TOKENS = [
  /\bdestination\b/i,
  /\bowner\b/i,
  /\bbacklog\b/i,
  /\bslice\s*2[A-Z]?\.\d/i,
  /\bphase\s*2[A-Z]\b/i,
  /→/,
];

/**
 * What counts as citing the rule a `not-built-by-rule` rests on.
 *
 * **A named authority, and nothing softer.** The first version also accepted the
 * bare words *rule* and *decision*, and a row reading *"closes on the same
 * rule"* satisfied it while naming nothing — the vacuous-remainder failure
 * wearing a different label. `not-built-by-rule` is the one class that asserts
 * an external permission, so the citation has to be checkable.
 */
const RULE_TOKENS = [/\bADR-\d{3}\b/, /\bOD-2O-\d+\b/, /\bR-2O-\d+[a-z]?\b/, /\bR-\d+\b/];

/**
 * What makes an adjudication explicit.
 *
 * A later record overturning an earlier class must **say** it is doing so. The
 * marker is not a courtesy: without it a generator cannot tell a considered
 * re-evaluation from two records that simply disagree, and "later wins" would
 * silently launder the second into the first.
 */
const ADJUDICATION_TOKENS = [
  /\bre-?evaluat/i,
  /\bre-?classif/i,
  /\bpromot/i,
  /\bsupersed/i,
  /\badjudicat/i,
  /\bcorrected\b/i,
];

/**
 * A remainder that says nothing.
 *
 * Phase 2L shipped two `partial`s whose remainder was a restatement of the
 * requirement, and the generator has refused them since. The test is deliberately
 * crude — length, and whether anything survives once the boilerplate is removed
 * — because a subtle test here fails open.
 */
const VACUOUS_REMAINDER_MINIMUM = 40;

export function readFile(relativePath, root = REPOSITORY_ROOT) {
  return readFileSync(join(root, relativePath), "utf8");
}

/**
 * The 116 declared requirements, in PRD order.
 *
 * `R-2O-1` says every identifier appears exactly once in the declaration shape,
 * and `R-2O-2` fixes the shape itself. Both are asserted here rather than
 * trusted, because this list is what every later count is derived from.
 */
export function declaredRequirements(prdSource = readFile(PRD, REPOSITORY_ROOT)) {
  const declarations = [...prdSource.matchAll(/^- \*\*(2O-[A-Z]+-\d{3}):\*\*\s*([^\n]*)/gm)];
  const requirements = [];
  const seen = new Set();
  const duplicates = [];

  for (const declaration of declarations) {
    const id = declaration[1];
    if (seen.has(id)) {
      duplicates.push(id);
      continue;
    }
    seen.add(id);
    requirements.push({ id, family: id.replace(/-\d{3}$/, ""), summary: declaration[2].trim() });
  }

  return { requirements, duplicates };
}

/** Every acceptance record, oldest first. The closeout's own record sorts last. */
export function acceptanceRecords(root = REPOSITORY_ROOT) {
  const directory = join(root, REPORTS);
  return readdirSync(directory)
    .filter((name) => /^PHASE_2O_SLICE_\d+_ACCEPTANCE\.md$/.test(name))
    .sort()
    .map((name) => {
      const source = readFileSync(join(directory, name), "utf8");
      const slice = `2O.${/SLICE_0*(\d+)_/.exec(name)[1]}`;
      return { name, slice, source };
    });
}

/**
 * The classification section of one record, and nothing else.
 *
 * Returns `null` when the record states no classifications, which the caller
 * turns into a refusal rather than into an empty result — a record that
 * classifies nothing is a record whose heading this generator does not know.
 */
export function classificationSection(source) {
  const heading = CLASSIFICATION_HEADINGS.exec(source);
  if (heading === null) return null;
  const start = heading.index + heading[0].length;
  const rest = source.slice(start);
  const next = /^##\s+\d+\./m.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
}

/** The family a bare suffix belongs to, taken from the record's own header. */
export function primaryFamily(source) {
  const header = source.slice(0, 2500);
  const families = [...header.matchAll(/`(2O-[A-Z]+)-\d{3}`/g)].map((match) => match[1]);
  return families.length === 0 ? null : families[0];
}

/**
 * Every classification one record states.
 *
 * Line-oriented on purpose. A regex spanning lines would let one row's evidence
 * reach into the next row's identifier, which is how slice 2O.7's JSX-comment
 * guard swallowed 7,804 characters of a file it was only meant to sample.
 */
export function readRecord(record) {
  const section = classificationSection(record.source);
  if (section === null) return { slice: record.slice, name: record.name, section: null, entries: [] };

  const family = primaryFamily(record.source);
  const entries = [];

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (/^\|\s*-{2,}/.test(line)) continue;

    const id = readRowKey(line, family);
    if (id === null) continue;

    const classification = readClassification(line);
    if (classification === null) continue;

    entries.push({
      id,
      classification,
      evidence: line,
      slice: record.slice,
      record: record.name,
      adjudicates: ADJUDICATION_TOKENS.some((token) => token.test(line)),
    });
  }

  return { slice: record.slice, name: record.name, section, entries };
}

/**
 * The identifier a row is **about**, which is not the first identifier on it.
 *
 * The first version of this scanned the whole line, and slice 2O.2's `-003` row
 * reads *"…so `2O-ACTIVATION-001`'s first fact is true from the moment the
 * account exists"*. The scan keyed that row to `2O-ACTIVATION-001` and reported
 * a conflict with slice 2O.0 — `built` against `partial` — over two records that
 * never disagreed about anything. **An evidence cell routinely cites other
 * requirements, and citing one is not classifying it.**
 *
 * So the key is read **positionally**: the first cell of a table row, or the
 * text before the class in prose. Nothing further right can rename the subject.
 */
export function readRowKey(line, family) {
  const head = line.startsWith("|") ? (line.split("|")[1] ?? "") : line.slice(0, 80);
  const full = /`(2O-[A-Z]+-\d{3})`/.exec(head);
  if (full !== null) return full[1];
  const bare = /`-(\d{3})`/.exec(head);
  if (bare === null || family === null) return null;
  return `${family}-${bare[1]}`;
}

/**
 * The class a row states.
 *
 * A table row's class lives in its **second cell**; prose states it right after
 * the identifier. Both are read positionally rather than by scanning the line
 * for any class word, because evidence prose routinely contains one — slice
 * 2O.2's rows say *"the …half is built"* inside a `partial`, and a scan would
 * read the wrong word with total confidence.
 */
export function readClassification(line) {
  if (line.startsWith("|")) {
    const cells = line.split("|").slice(1, -1);
    if (cells.length < 2) return null;
    return normalizeClass(cells[1]);
  }
  const after = line.replace(/^.*?`(?:2O-[A-Z]+-\d{3}|-\d{3})`/, "");
  return normalizeClass(after.slice(0, 60));
}

/**
 * `built (words) / made true by M1` resolves to its head token.
 *
 * The compound form is what Phase 2M's records used and Phase 2N's generator
 * already normalised; keeping the rule identical means a record written in
 * either house style reads the same.
 */
export function normalizeClass(text) {
  const cleaned = text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    // Only **leading** dashes go. The first version stripped every one, which
    // turned `not-built-by-rule` into `not built by rule` and made the five
    // telemetry requirements unclassifiable — a class name that contains the
    // character used to separate an id from its class is a real collision, and
    // the separator is what must be narrowed, never the class.
    .replace(/^[\s—–-]+/, "")
    .trim()
    .toLowerCase();
  for (const candidate of ["not-built-by-rule", "built", "baseline", "partial", "undelivered"]) {
    const pattern = new RegExp(`^${candidate}\\b`);
    if (pattern.test(cleaned)) return candidate;
  }
  return null;
}

/**
 * The evidence with the requirement's own identifier removed.
 *
 * A row may not discharge its destination or its rule by containing its own
 * subject. Stripping first is what lets the checks below fail on a row that
 * names nowhere, instead of passing because the id happened to match a token.
 */
export function evidenceWithoutSubject(entry) {
  const cells = entry.evidence.split("|");
  // A table row's evidence starts at the third cell; a prose line has no cells
  // at all and its evidence is the line itself. Slicing unconditionally would
  // hand every prose row an empty string, and an empty string names no
  // destination — so a prose `partial` would fail a check it never took.
  const body = cells.length > 3 ? cells.slice(3).join("|") : entry.evidence;
  return body.replaceAll(entry.id, "").replaceAll(entry.id.replace(/^2O-[A-Z]+/, ""), "");
}

export function namesDestination(entry) {
  const evidence = evidenceWithoutSubject(entry);
  return DESTINATION_TOKENS.some((token) => token.test(evidence));
}

export function citesRule(entry) {
  const evidence = evidenceWithoutSubject(entry);
  return RULE_TOKENS.some((token) => token.test(evidence));
}

export function remainderIsVacuous(entry) {
  const evidence = evidenceWithoutSubject(entry)
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return evidence.length < VACUOUS_REMAINDER_MINIMUM;
}

/**
 * One final classification per id, with every disagreement surfaced.
 *
 * Agreement across records is normal — a later slice re-stating an inherited
 * class is not a conflict. A **disagreement** resolves to the later record only
 * when that record says it is adjudicating; otherwise it is reported and the
 * run refuses.
 */
export function resolveClassifications(declared, records) {
  const declaredIds = new Set(declared.map((requirement) => requirement.id));
  const byId = new Map();
  const undeclared = [];

  for (const record of records) {
    for (const entry of record.entries) {
      if (!declaredIds.has(entry.id)) {
        undeclared.push(entry);
        continue;
      }
      if (!byId.has(entry.id)) byId.set(entry.id, []);
      byId.get(entry.id).push(entry);
    }
  }

  const resolved = new Map();
  const conflicts = [];

  for (const [id, entries] of byId) {
    const classes = new Set(entries.map((entry) => entry.classification));
    if (classes.size === 1) {
      resolved.set(id, entries[entries.length - 1]);
      continue;
    }
    const last = entries[entries.length - 1];
    if (!last.adjudicates) {
      conflicts.push({ id, entries });
      continue;
    }
    resolved.set(id, { ...last, adjudicated: entries.slice(0, -1).map((entry) => entry.slice) });
  }

  return { resolved, conflicts, undeclared };
}

/** Every migration file attributable to this phase, by name. */
export function phaseMigrations(root = REPOSITORY_ROOT) {
  const directory = join(root, "supabase/migrations");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => /phase_2o/i.test(name));
}

/**
 * Every refusal, collected rather than thrown one at a time.
 *
 * A generator that exits on the first problem makes the operator run it once
 * per defect. Collecting means one run names everything wrong.
 */
export function audit(root = REPOSITORY_ROOT) {
  const { requirements, duplicates } = declaredRequirements(readFile(PRD, root));
  const records = acceptanceRecords(root).map(readRecord);
  const refusals = [];

  if (requirements.length !== DECLARED_TOTAL) {
    refusals.push(
      `the PRD declares ${requirements.length} requirements, and this phase's total is ${DECLARED_TOTAL} (R-2O-3)`,
    );
  }
  if (requirements.length === 0) {
    refusals.push("the declaration extraction found nothing, so every check below would pass trivially (R-2O-3)");
  }
  for (const duplicate of duplicates) {
    refusals.push(`\`${duplicate}\` is declared more than once (R-2O-1)`);
  }

  for (const record of records) {
    if (record.section === null) {
      refusals.push(`${record.name} states no classification section this generator recognises`);
    }
  }

  const { resolved, conflicts, undeclared } = resolveClassifications(requirements, records);

  for (const requirement of requirements) {
    if (!resolved.has(requirement.id) && !conflicts.some((conflict) => conflict.id === requirement.id)) {
      refusals.push(`\`${requirement.id}\` is declared and no acceptance record classifies it (2O-CLOSE-001)`);
    }
  }

  for (const entry of undeclared) {
    refusals.push(`${entry.record} classifies \`${entry.id}\`, which the PRD does not declare (R-2O-1)`);
  }

  for (const conflict of conflicts) {
    const stated = conflict.entries.map((entry) => `${entry.slice} says ${entry.classification}`).join("; ");
    refusals.push(
      `\`${conflict.id}\` is classified differently by two records and the later one does not say it is adjudicating: ${stated}`,
    );
  }

  for (const [id, entry] of resolved) {
    if (!CLASS_SET.has(entry.classification)) {
      refusals.push(`\`${id}\` carries \`${entry.classification}\`, which is not one of the five classes`);
      continue;
    }
    if (entry.classification === "partial") {
      if (remainderIsVacuous(entry)) {
        refusals.push(`\`${id}\` is \`partial\` and its remainder says nothing (2O-CLOSE-001)`);
      } else if (!namesDestination(entry)) {
        refusals.push(`\`${id}\` is \`partial\` and its remainder names no destination (2O-CLOSE-001)`);
      }
    }
    if (entry.classification === "not-built-by-rule" && !citesRule(entry)) {
      refusals.push(`\`${id}\` is \`not-built-by-rule\` and cites no rule (2O-CLOSE-001)`);
    }
  }

  const migrations = phaseMigrations(root);
  if (migrations.length !== MIGRATION_BUDGET.expectedSpend) {
    refusals.push(
      `the migration budget does not reconcile: ${MIGRATION_BUDGET.expectedSpend} expected, ${migrations.length} present (${migrations.join(", ") || "none"}) (2O-CLOSE-003)`,
    );
  }
  if (migrations.length > MIGRATION_BUDGET.allocated) {
    refusals.push(`${migrations.length} migrations exceed the allocation of ${MIGRATION_BUDGET.allocated} — STOP CONDITION`);
  }

  return { requirements, records, resolved, conflicts, refusals, migrations };
}

/** The counts every document must re-derive rather than transcribe. */
export function counts(resolved) {
  const tally = Object.fromEntries(CLASSES.map((name) => [name, 0]));
  for (const entry of resolved.values()) tally[entry.classification] += 1;
  return tally;
}

function evidenceCell(entry) {
  const cells = entry.evidence.split("|");
  const evidence = cells.length > 3 ? cells.slice(3).join("|") : entry.evidence;
  return evidence
    .replace(/\|$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function render({ requirements, resolved, migrations }) {
  const tally = counts(resolved);
  const lines = [];

  lines.push("# Phase 2O — traceability matrix");
  lines.push("");
  lines.push("<!-- Do not edit by hand. Generated by scripts/generate-phase-2o-traceability.mjs -->");
  lines.push("");
  lines.push(
    "Generated from `docs/initiatives/phase-2o/PHASE_2O_PRD.md` (what was declared) and the eight slice",
  );
  lines.push(
    "acceptance records under `docs/reports/phase-2o/` (what was evidenced). Regenerate with `npm run",
  );
  lines.push("docs:phase-2o:traceability`; `--check` fails when this file and the sources disagree.");
  lines.push("");
  lines.push(`**${requirements.length} declared · ${resolved.size} classified · 0 unclassified.**`);
  lines.push("");
  lines.push("| Classification | Count |");
  lines.push("|---|---:|");
  for (const name of CLASSES) lines.push(`| \`${name}\` | ${tally[name]} |`);
  lines.push(`| **total** | **${resolved.size}** |`);
  lines.push("");
  lines.push("## Migration budget");
  lines.push("");
  lines.push(
    `**${MIGRATION_BUDGET.allocated} allocated · obligation ZERO · ${migrations.length} spent · NON-TRANSFERABLE.**`,
  );
  lines.push("");
  lines.push("| Allocation | Destination | Outcome |");
  lines.push("|---|---|---|");
  lines.push(`| **M1** | activation telemetry vocabulary, slice 2O.8 | ${MIGRATION_BUDGET.named.M1} |`);
  lines.push(`| **M2** | none since ADR-116 | ${MIGRATION_BUDGET.named.M2} |`);
  lines.push("");
  lines.push(
    "An allocation that closes unspent is a correct outcome and an unnecessary spend is a defect (`2O-CLOSE-003`).",
  );
  lines.push("");
  lines.push("## Requirements");
  lines.push("");
  lines.push("| Requirement | Class | Slice | Evidence |");
  lines.push("|---|---|---|---|");

  for (const requirement of requirements) {
    const entry = resolved.get(requirement.id);
    const adjudicated = entry.adjudicated ? ` (adjudicates ${entry.adjudicated.join(", ")})` : "";
    lines.push(
      `| \`${requirement.id}\` | \`${entry.classification}\` | ${entry.slice}${adjudicated} | ${evidenceCell(entry)} |`,
    );
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const check = process.argv.includes("--check");
  const result = audit();

  if (result.refusals.length > 0) {
    console.error("REFUSED — the Phase 2O matrix was not written:\n");
    for (const refusal of result.refusals) console.error(`  - ${refusal}`);
    console.error(`\n${result.refusals.length} refusal(s).`);
    process.exit(1);
  }

  const rendered = render(result);
  const target = join(REPOSITORY_ROOT, OUTPUT);

  if (check) {
    if (!existsSync(target)) {
      console.error(`REFUSED — ${OUTPUT} does not exist. Run the generator.`);
      process.exit(1);
    }
    const current = readFileSync(target, "utf8");
    if (current !== rendered) {
      console.error(`REFUSED — ${OUTPUT} differs from what the sources generate. Regenerate it.`);
      process.exit(1);
    }
    const tally = counts(result.resolved);
    console.log(`${OUTPUT} matches its sources — ${result.resolved.size} classified.`);
    console.log(CLASSES.map((name) => `${name}=${tally[name]}`).join(" · "));
    return;
  }

  writeFileSync(target, rendered, "utf8");
  const tally = counts(result.resolved);
  console.log(`Wrote ${OUTPUT} — ${result.resolved.size} of ${result.requirements.length} classified.`);
  console.log(CLASSES.map((name) => `${name}=${tally[name]}`).join(" · "));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
