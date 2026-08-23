/**
 * Phase 2R's requirement **coverage** report, generated from the PRD or refused.
 *
 * **No shebang, deliberately.** Every earlier phase's generator omits one for a
 * measured reason: a leading `#!` is what makes Vite's transform fail to parse
 * two `scripts/*.mjs` files on Windows — the repository's recorded local
 * baseline of failed *files* with zero failed tests.
 *
 * ## What this produces, and what it must never be mistaken for
 *
 * A **coverage** classification: every requirement mapped to its family, its
 * slice, its kind and the decision it rests on. It answers *"is anything
 * unassigned?"*
 *
 * **It is not a delivery matrix.** It never emits `built`, `baseline`,
 * `partial`, `not-built-by-rule` or `undelivered` as a *delivery* class, because
 * nothing is implemented and `2R-CLOSE-003` requires the delivery matrix to be
 * generated from the slices' own acceptance records at closeout. A requirement
 * classified before it is built is a claim nobody measured. The delivery matrix
 * — `PHASE_2R_TRACEABILITY_MATRIX.md` — is a *different* artifact that does not
 * exist yet, and `phase-2r-declarations.test.ts` asserts its absence.
 *
 * The `Kind` column is what a requirement **asks for**, not what happened:
 * `build` = new behaviour, `baseline` = an existing property to re-prove,
 * `rule` = deliberately not built.
 *
 * ## It refuses rather than emitting something partly right
 *
 * A coverage report that is 72/73 correct reads as complete, which is worse than
 * none. Every refusal below writes nothing at all.
 *
 *     node scripts/generate-phase-2r-coverage.mjs
 *     node scripts/generate-phase-2r-coverage.mjs --check
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..");

/** Read normalised to LF: `core.autocrlf` checks these files out with CRLF on Windows. */
const read = (relative) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");

export const PRD = "docs/initiatives/phase-2r/PHASE_2R_PRD.md";
export const OUTPUT = "docs/reports/phase-2r/PHASE_2R_REQUIREMENT_COVERAGE.md";

/** What the PRD declares. Pinned, so a family that silently grows fails here. */
export const DECLARED_TOTAL = 73;

/**
 * Family → slice.
 *
 * `2R-TIME` splits deliberately: `-001` … `-004` are the wall-clock semantics
 * the model needs, and land with it in 2R.1; `-005` … `-007` are about two
 * surfaces not disagreeing, which is only observable once a second surface
 * exists, so they land in 2R.2.
 *
 * `2R-TRUST` is carried across every slice and **closed** at 2R.5, so that is
 * where it is counted — counting it in six places would make the per-slice
 * totals sum to more than the declared total.
 */
const SLICE_OF_FAMILY = Object.freeze({
  FOUNDATION: "2R.0",
  MODEL: "2R.1",
  SERIES: "2R.2",
  SURFACE: "2R.3",
  NOTIFY: "2R.4",
  ACCESS: "2R.3",
  MOBILE: "2R.3",
  TRUST: "2R.5",
  CLOSE: "2R.5",
});

export const SLICES = Object.freeze(["2R.0", "2R.1", "2R.2", "2R.3", "2R.4", "2R.5"]);

/** The canonical row shape in the PRD's requirement tables. */
const ROW = /^\| `(2R-[A-Z]+-\d{3})` \|/;

/** A family may carry no digit; `2K-A11Y` is why this is checked rather than assumed. */
const LETTERS_ONLY = /^[A-Z]+$/;

export function familyOf(id) {
  return id.split("-")[1];
}

export function sliceOf(id) {
  const family = familyOf(id);
  if (family === "TIME") return Number(id.split("-")[2]) <= 4 ? "2R.1" : "2R.2";
  return SLICE_OF_FAMILY[family];
}

/** Every requirement row the PRD declares, in document order. */
export function requirements(prd = read(PRD)) {
  const rows = [];
  for (const line of prd.split("\n")) {
    if (!ROW.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const id = ROW.exec(line)[1];
    rows.push({ id, requirement: cells[1], kind: cells[3], restsOn: cells[4] || "—" });
  }
  return rows;
}

/** Every reason to refuse. Empty means the report may be written. */
export function refusals(rows = requirements()) {
  const found = [];

  if (rows.length !== DECLARED_TOTAL) {
    found.push(`the PRD declares ${rows.length} requirements, not ${DECLARED_TOTAL}.`);
  }

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) found.push(`${row.id} is declared twice.`);
    seen.add(row.id);

    const family = familyOf(row.id);
    if (!LETTERS_ONLY.test(family)) {
      found.push(`${row.id}'s family contains a digit and would be invisible to the detector.`);
    }
    if (!sliceOf(row.id)) found.push(`${row.id} belongs to no slice.`);
    if (!["build", "baseline", "rule"].includes(row.kind)) {
      found.push(`${row.id} has an unknown kind "${row.kind}".`);
    }
    if (row.requirement.length < 10) found.push(`${row.id} has no requirement text.`);
  }

  // Sequential within each family, starting at 001 — a gap means an identifier
  // was removed, which the owner's instruction forbids.
  const byFamily = new Map();
  for (const row of rows) {
    const family = familyOf(row.id);
    byFamily.set(family, [...(byFamily.get(family) ?? []), Number(row.id.split("-")[2])]);
  }
  for (const [family, indexes] of byFamily) {
    const sorted = [...indexes].sort((a, b) => a - b);
    sorted.forEach((value, position) => {
      if (value !== position + 1) found.push(`2R-${family} is not sequential at position ${position + 1}.`);
    });
  }

  return found;
}

export function renderCoverage(rows = requirements()) {
  const withPlacement = rows.map((row) => ({ ...row, family: familyOf(row.id), slice: sliceOf(row.id) }));

  const families = [...new Set(withPlacement.map((r) => r.family))];
  const kinds = {};
  for (const row of withPlacement) kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;

  const lines = [];
  const w = (line = "") => lines.push(line);

  w("# Phase 2R — requirement coverage");
  w();
  w("**Generated, never typed.** `node scripts/generate-phase-2r-coverage.mjs`");
  w("reads the PRD and either writes this file or refuses and says why. It never");
  w("writes a partial report: one that is 72/73 correct reads as complete.");
  w();
  w("## What this is, and what it deliberately is not");
  w();
  w("A **coverage** classification: every requirement mapped to its family, its");
  w('slice, its kind and the decision it rests on. It answers *"is anything');
  w('unassigned?"*');
  w();
  w("**It is not a delivery matrix, and must never be read as one.** No");
  w("requirement here carries a *delivery* class. **Nothing is implemented**, so");
  w("none can honestly exist: `2R-CLOSE-003` requires the delivery matrix to be");
  w("generated from the slices' own acceptance records at closeout, and a");
  w("requirement classified before it is built is a claim nobody measured. The");
  w("delivery matrix (`PHASE_2R_TRACEABILITY_MATRIX.md`) does not exist, and the");
  w("declaration guard asserts its absence.");
  w();
  w("**Kind** is what the requirement *asks for*: **build** = new behaviour;");
  w("**baseline** = an existing property this phase must prove still holds;");
  w("**rule** = deliberately not built, whose delivery is the recorded refusal.");
  w();
  w("---");
  w();
  w("## Totals");
  w();
  w("| | |");
  w("|---|---|");
  w(`| Declared | **${withPlacement.length}** |`);
  w(`| Families | **${families.length}** |`);
  w(`| Slices | **${SLICES.length}** |`);
  w("| Unassigned to a slice | **0** |");
  w("| Delivery-classified | **0 — by rule, until closeout** |");
  w();
  w(`**By kind:** ${Object.keys(kinds).sort().map((k) => `${k} **${kinds[k]}**`).join(" · ")}`);
  w();
  w("---");
  w();
  w("## Coverage by slice");
  w();
  w("| slice | requirements | families |");
  w("|---|---|---|");
  for (const slice of SLICES) {
    const inSlice = withPlacement.filter((r) => r.slice === slice);
    const fams = [...new Set(inSlice.map((r) => r.family))].sort();
    w(`| **${slice}** | ${inSlice.length} | ${fams.map((f) => `\`2R-${f}\``).join(", ")} |`);
  }
  w(`| **total** | **${withPlacement.length}** | — |`);
  w();
  w("Every slice has at least one requirement, and **every requirement has exactly");
  w("one slice** — by construction: both tables derive from the same rows, so a");
  w("requirement missing here would be missing below too.");
  w();
  w("---");
  w();
  w("## Coverage by family");
  w();
  w("| family | count | slice(s) | kinds |");
  w("|---|---|---|---|");
  for (const family of families) {
    const inFamily = withPlacement.filter((r) => r.family === family);
    const slices = [...new Set(inFamily.map((r) => r.slice))].sort();
    const perKind = {};
    for (const row of inFamily) perKind[row.kind] = (perKind[row.kind] ?? 0) + 1;
    const kindText = Object.keys(perKind).sort().map((k) => `${k} ${perKind[k]}`).join(", ");
    w(`| \`2R-${family}\` | ${inFamily.length} | ${slices.join(", ")} | ${kindText} |`);
  }
  w(`| **total** | **${withPlacement.length}** | — | — |`);
  w();
  w("**Every family name is letters-only**, and the generator refuses otherwise.");
  w("`2K-A11Y` carried digits and was invisible to every prose count, to the");
  w("traceability generator's attribution check, and to the phase-start detector's");
  w("`[A-Z]+` family pattern — all three at once and all three silently.");
  w();
  w("---");
  w();
  w("## Every requirement");
  w();
  w("| id | slice | kind | rests on | requirement |");
  w("|---|---|---|---|---|");
  for (const row of withPlacement) {
    const text = row.requirement.length > 96 ? `${row.requirement.slice(0, 93).trimEnd()}…` : row.requirement;
    w(`| \`${row.id}\` | ${row.slice} | ${row.kind} | ${row.restsOn} | ${text} |`);
  }
  w();
  w("---");
  w();
  w("## The signed decisions each family rests on");
  w();
  w("All nine signed by **ADR-132**, 2026-08-23, every one taking its recommendation.");
  w();
  w("| decision | signed | families it governs |");
  w("|---|---|---|");
  w("| `OD-2R-8` | **A** — refusal LIFTED, limited to reminders | the whole phase; without it there is no subject |");
  w("| `OD-2R-1` | **A** — Rotina | all ten |");
  w("| `OD-2R-2` | **A** — closed set; `RRULE` refused | `2R-MODEL`, `2R-SURFACE` |");
  w("| `OD-2R-3` | **A** — one occurrence at a time | `2R-MODEL`, `2R-SURFACE`, `2R-NOTIFY`, `2R-TRUST` |");
  w("| `OD-2R-4` | **A** — ask, default narrower | `2R-SERIES`, `2R-ACCESS` |");
  w("| `OD-2R-5` | **A** — wall-clock, three cases signed | `2R-TIME` |");
  w("| `OD-2R-6` | **A** — recurring tasks OUT | none — an exclusion; remainder `2R-TASK-RECURRENCE` |");
  w("| `OD-2R-7` | **A** — 1 migration ALLOCATED | `2R-MODEL-009`, `2R-CLOSE-007` |");
  w("| `OD-2R-9` | **A** — two defects routed out | none — an exclusion |");
  w();
  w("**No requirement was added, renumbered, reused or removed by the signatures**,");
  w("because every decision took the option this package was written for. The");
  w(`count is the same **${DECLARED_TOTAL}** it was before ADR-132 — checkable`);
  w("rather than asserted, since this generator refuses any other number.");
  w();

  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("generate-phase-2r-coverage.mjs");

if (invokedDirectly) {
  const rows = requirements();
  const problems = refusals(rows);
  if (problems.length > 0) {
    console.error("REFUSED — nothing written:");
    for (const problem of problems) console.error(`  · ${problem}`);
    process.exit(1);
  }

  const rendered = renderCoverage(rows);
  if (process.argv.includes("--check")) {
    const onDisk = read(OUTPUT);
    if (onDisk !== rendered) {
      console.error(`${OUTPUT} is stale — regenerate it.`);
      process.exit(1);
    }
    console.log(`${OUTPUT} matches the PRD — ${rows.length} covered, 0 unassigned, 0 delivery-classified.`);
  } else {
    writeFileSync(join(REPO, OUTPUT), rendered, "utf8");
    console.log(`${OUTPUT} written — ${rows.length} covered, 0 unassigned.`);
  }
}
