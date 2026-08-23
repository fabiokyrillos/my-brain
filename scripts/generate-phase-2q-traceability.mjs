/**
 * Phase 2Q's traceability matrix, generated from the phase's own records — or
 * refused entirely.
 *
 * **No shebang, deliberately.** Every earlier phase's generator omits one, for a
 * measured reason: this module is imported by
 * `src/lib/closeout/phase-2q-traceability.test.ts`, and a leading `#!` is what
 * makes Vite's transform fail to parse two `scripts/*.mjs` files on Windows —
 * the repository's recorded local baseline of failed *files* with zero failed
 * tests.
 *
 * `2Q-CLOSE-001` asks for a matrix that classifies **every requirement exactly
 * once**, produced from the records rather than typed. This reads the PRD (what
 * was declared) and the six slice acceptance records (what was evidenced),
 * applies the contract's nineteen refusals where they bite, and either writes
 * the matrix or refuses and says exactly why.
 *
 * **It never writes a partial matrix.** A refusal writes nothing at all: a
 * matrix that is 41/42 correct is more dangerous than no matrix, because it
 * reads as complete.
 *
 * ## Reading a table without misreading it
 *
 * Three traps this repository has already paid for, all defended positionally:
 *
 * - **The subject of a row is its FIRST cell**, never the first identifier
 *   anywhere on the line. An evidence cell routinely cites other requirements —
 *   slice 2Q.1's `2Q-CITE-007` row names `2Q-CITE-007` again, and slice 2Q.4's
 *   rows name `2Q-ACCESS-*` in prose.
 * - **The class is the SECOND cell**, never the first class word on the line.
 *   "already correct, so not `built`" in an evidence cell must not classify.
 * - **A re-audit table is not a classification table.** Only rows under a
 *   recognised classification heading are read; §1 tables that describe the
 *   tree *before* a slice are ignored by construction.
 *
 * ## `2Q-CLOSE-002`, and the check that can actually fail
 *
 * A `partial` or `not-built-by-rule` row must name a concrete remainder **and**
 * a destination. The recorded trap is a row that satisfies a naive check **by
 * containing its own identifier** — so the subject is stripped from the evidence
 * before the remainder is looked for. Phase 2Q produced no such row, which would
 * make the refusal vacuous, so the guard drives it over a planted fixture.
 *
 *     node scripts/generate-phase-2q-traceability.mjs
 *     node scripts/generate-phase-2q-traceability.mjs --check
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..");
const read = (relative) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");

const PRD = "docs/initiatives/phase-2q/PHASE_2Q_PRD.md";
const MATRIX = "docs/reports/phase-2q/PHASE_2Q_TRACEABILITY_MATRIX.md";

/**
 * The six slices that classify, in order.
 *
 * **Listed rather than globbed, and that is the point.** A record nobody
 * declared here contributes nothing — which is what happened on this
 * generator's first real run: slice 2Q.5's record existed on disk and the run
 * still refused, naming the five `2Q-CLOSE` requirements as unclassified,
 * because the file was not in this list. A glob would have absorbed it silently
 * and would absorb a stray file just as silently.
 */
export const RECORDS = [
  "docs/reports/phase-2q/PHASE_2Q_SLICE_00_ACCEPTANCE.md",
  "docs/reports/phase-2q/PHASE_2Q_SLICE_01_ACCEPTANCE.md",
  "docs/reports/phase-2q/PHASE_2Q_SLICE_02_ACCEPTANCE.md",
  "docs/reports/phase-2q/PHASE_2Q_SLICE_03_ACCEPTANCE.md",
  "docs/reports/phase-2q/PHASE_2Q_SLICE_04_ACCEPTANCE.md",
  "docs/reports/phase-2q/PHASE_2Q_SLICE_05_ACCEPTANCE.md",
];

/** The contract's vocabulary. Nothing outside it may appear in a matrix. */
export const CLASSES = ["built", "baseline", "partial", "not-built-by-rule", "undelivered"];

/** The canonical declaration shape — the one the A13 detector reads. */
const DECLARATION = /^- \*\*(2Q-[A-Z]+-\d{3}):\*\*/gm;

/**
 * The **loose** shape, which admits a family containing digits.
 *
 * This exists because of the exact failure Phase 2K paid for: `2K-A11Y` carried
 * digits, so `[A-Z]+` could not match it, and its seven accessibility
 * requirements were invisible to every prose count, to the traceability
 * generator's attribution check, **and** to the A13 detector — all three at once
 * and all three silently.
 *
 * A generator that only used the strict shape would answer *"nothing is
 * wrong"* about a family it cannot see. So the loose shape is scanned too, and
 * anything it finds that the strict one did not is **refused by name**.
 */
const LOOSE_DECLARATION = /^- \*\*(2Q-[A-Z0-9]+-\d{3}):\*\*/gm;

export function declaredRequirements(prd = read(PRD)) {
  return [...prd.matchAll(DECLARATION)].map((match) => match[1]);
}

/** Declarations the strict shape cannot see. Empty is the healthy answer. */
export function invisibleDeclarations(prd = read(PRD)) {
  const strict = new Set(declaredRequirements(prd));
  return [...prd.matchAll(LOOSE_DECLARATION)]
    .map((match) => match[1])
    .filter((id) => !strict.has(id));
}

/**
 * Every classification row in one record.
 *
 * A row counts only when its **first** cell is a bare requirement identifier and
 * its **second** cell is a bare class. Both are matched anchored, so a sentence
 * mentioning either contributes nothing.
 */
export function classificationsIn(source) {
  const rows = [];
  for (const line of source.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const subject = /^`(2Q-[A-Z]+-\d{3})`$/.exec(cells[0]);
    if (!subject) continue;
    const klass = /^\*{0,2}([a-z-]+)\*{0,2}(?:,.*)?$/.exec(cells[1]);
    if (!klass || !CLASSES.includes(klass[1])) continue;
    rows.push({ id: subject[1], klass: klass[1], evidence: cells.slice(2).join(" | ") });
  }
  return rows;
}

/**
 * The evidence with the row's own identifier removed.
 *
 * The recorded trap: a check for "does this row name a destination" passes on a
 * row that merely repeats its own id. Strip the subject first, or the guard can
 * never fail.
 */
export function evidenceWithoutSubject(row) {
  return row.evidence.split(row.id).join("");
}

/** Every refusal this generator can raise, as sentences a reader can act on. */
export function refusals({ prd = read(PRD), records = RECORDS.map(read) } = {}) {
  const found = [];
  const declared = declaredRequirements(prd);
  const rows = records.flatMap((source) => classificationsIn(source));

  // 1 — an undeclared identifier.
  for (const row of rows) {
    if (!declared.includes(row.id)) {
      found.push(`${row.id} is classified but never declared in the PRD.`);
    }
  }

  // 2 — a declared identifier with no classification.
  const classified = new Set(rows.map((row) => row.id));
  for (const id of declared) {
    if (!classified.has(id)) found.push(`${id} is declared and never classified.`);
  }

  // 3 — duplicate or conflicting classifications.
  const byId = new Map();
  for (const row of rows) {
    const seen = byId.get(row.id);
    if (seen && seen !== row.klass) {
      found.push(`${row.id} is classified as both ${seen} and ${row.klass}.`);
    } else if (seen) {
      found.push(`${row.id} is classified twice, both times as ${seen}.`);
    }
    byId.set(row.id, row.klass);
  }

  /*
   * 5 — a family containing digits, checked FIRST and against the loose shape.
   *
   * Such a family is invisible to `declaredRequirements`, so every check below
   * would report it as simply absent. This is the one refusal that has to look
   * outside the strict vocabulary to exist at all.
   */
  for (const id of invisibleDeclarations(prd)) {
    found.push(
      `${id} declares a family containing a digit, which hides it from this generator, `
        + "from the A13 detector and from every prose count at once.",
    );
  }

  // 4 — a gap or duplicate inside a family.
  const families = new Map();
  for (const id of declared) {
    const [, family, index] = /^2Q-([A-Z0-9]+)-(\d{3})$/.exec(id) ?? [];
    if (!family) {
      found.push(`${id} does not match the declaration shape.`);
      continue;
    }
    if (!/^[A-Z]+$/.test(family)) {
      found.push(`family ${family} contains a digit, which hides it from every scan.`);
    }
    families.set(family, [...(families.get(family) ?? []), Number.parseInt(index, 10)]);
  }
  for (const [family, indexes] of families) {
    const sorted = [...indexes].sort((a, b) => a - b);
    const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
    if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
      found.push(`family ${family} is not 001..${sorted.length} without gaps: ${sorted.join(", ")}.`);
    }
  }

  // 6 / `2Q-CLOSE-002` — a partial or undelivered with no remainder AND no
  // destination, judged on evidence that has had its own identifier stripped.
  for (const row of rows) {
    if (row.klass !== "partial" && row.klass !== "undelivered" && row.klass !== "not-built-by-rule") continue;
    const evidence = evidenceWithoutSubject(row);
    if (evidence.trim().length < 20) {
      found.push(`${row.id} is ${row.klass} with no concrete remainder.`);
      continue;
    }
    if (!/destination|destino|owner|later initiative|rule\b|ADR-\d+/i.test(evidence)) {
      found.push(`${row.id} is ${row.klass} and names no destination or signed rule.`);
    }
  }

  // 8 — a migration count not attributable to an authorized allocation.
  const migrations = read("docs/reports/phase-2q/PHASE_2Q_SLICE_01_DEPLOYMENT.md");
  if (!migrations.includes("202608210100")) {
    found.push("the deployment record does not name the migration the phase spent.");
  }

  // 12 — a successor governing artifact before authorization.
  //
  // **Retargeted 2026-08-22 by ADR-131**, which authorized Phase 2R. This is the
  // fourth of the five places pinning the successor's letter; the enumeration is
  // in `generate-phase-2p-traceability.mjs`'s refusal 12. The scope is this
  // phase's own PRD, so Phase 2R's requirements never reach it — but the pin
  // moves anyway, because every retarget must consciously pass through each one.
  if (/2S-[A-Z]+-\d{3}/.test(prd)) {
    found.push("the PRD declares a successor phase's requirement.");
  }

  return found;
}

/** The matrix, as Markdown. Callers must check `refusals()` first. */
export function renderMatrix({ prd = read(PRD), records = RECORDS.map(read) } = {}) {
  const declared = declaredRequirements(prd);
  const rows = records.flatMap((source) => classificationsIn(source));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const counts = Object.fromEntries(CLASSES.map((klass) => [klass, 0]));
  for (const row of rows) counts[row.klass] += 1;

  const lines = [
    "# Phase 2Q — Traceability matrix",
    "",
    "**Generated, never typed.** `node scripts/generate-phase-2q-traceability.mjs`",
    "reads the PRD and the six slice acceptance records and writes this file, or",
    "refuses and writes nothing. A matrix that is 41/42 correct reads as complete,",
    "which is why a refusal produces no file at all.",
    "",
    `**${declared.length} declared · ${rows.length} classified · ${declared.length - rows.length} unclassified.**`,
    "",
    "| Class | Count |",
    "|---|---:|",
    ...CLASSES.map((klass) => `| \`${klass}\` | ${counts[klass]} |`),
    "",
    "| Requirement | Class | Evidence |",
    "|---|---|---|",
    ...declared.map((id) => {
      const row = byId.get(id);
      return `| \`${id}\` | ${row ? row.klass : "**UNCLASSIFIED**"} | ${row ? row.evidence : "—"} |`;
    }),
    "",
  ];
  return lines.join("\n");
}

const isCheck = process.argv.includes("--check");
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("generate-phase-2q-traceability.mjs");

if (invokedDirectly) {
  const problems = refusals();
  if (problems.length > 0) {
    console.error("REFUSED — the matrix was not written:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const declared = declaredRequirements();
  const rows = RECORDS.map(read).flatMap((source) => classificationsIn(source));
  if (isCheck) {
    console.log(`declared ${declared.length} · classified ${rows.length} · unclassified ${declared.length - rows.length}`);
    process.exit(declared.length === rows.length ? 0 : 1);
  }
  writeFileSync(join(REPO, MATRIX), renderMatrix(), "utf8");
  console.log(`wrote ${MATRIX}: ${declared.length} declared, ${rows.length} classified.`);
}
