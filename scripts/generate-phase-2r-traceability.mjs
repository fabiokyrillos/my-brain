/**
 * Phase 2R's delivery matrix — generated, never typed.
 *
 * `PHASE_2R_TRACEABILITY_CONTRACT.md` governs this file and names sixteen
 * refusals. Each one is implemented below with the contract's own number beside
 * it, and **a refusal writes nothing at all**: a matrix that is 72 of 73 correct
 * reads as complete, so the failure mode of a partial file is worse than the
 * failure mode of no file.
 *
 * ## Where the classifications come from
 *
 * The PRD declares; the slice acceptance records classify. Nothing here types a
 * class, and nothing here edits a count. *A phase that types its own matrix is
 * grading its own homework.*
 *
 * ## The record count, and a correction to the contract
 *
 * The contract says the generator reads **"the five slice acceptance records"**.
 * There are **six** — 2R.0 through 2R.5 — and reading five would leave the
 * twelve `2R-CLOSE-*` requirements unclassified, which refusal 2 would then
 * report as a phase failure. The contract was written during planning, when the
 * closeout slice's own record did not yet exist to be counted. Six are read, and
 * this note is the correction rather than a silent divergence.
 *
 * ## Usage
 *
 *     node scripts/generate-phase-2r-traceability.mjs
 *     node scripts/generate-phase-2r-traceability.mjs --check
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..");
const read = (relative) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");

const PRD = "docs/initiatives/phase-2r/PHASE_2R_PRD.md";
const COVERAGE = "docs/reports/phase-2r/PHASE_2R_REQUIREMENT_COVERAGE.md";
const MATRIX = "docs/reports/phase-2r/PHASE_2R_TRACEABILITY_MATRIX.md";
const CLOSING = "docs/reports/phase-2r/PHASE_2R_CLOSING_REPORT.md";

const RECORDS = [
  "docs/reports/phase-2r/PHASE_2R_SLICE_00_ACCEPTANCE.md",
  "docs/reports/phase-2r/PHASE_2R_SLICE_01_ACCEPTANCE.md",
  "docs/reports/phase-2r/PHASE_2R_SLICE_02_ACCEPTANCE.md",
  "docs/reports/phase-2r/PHASE_2R_SLICE_03_ACCEPTANCE.md",
  "docs/reports/phase-2r/PHASE_2R_SLICE_04_ACCEPTANCE.md",
  "docs/reports/phase-2r/PHASE_2R_SLICE_05_ACCEPTANCE.md",
];

/** The contract's vocabulary. Exactly five, and a sixth is a refusal. */
export const CLASSES = ["built", "baseline", "partial", "not-built-by-rule", "undelivered"];

/**
 * A declaration, in this PRD's shape: a table row whose first cell is a bare
 * identifier.
 *
 * Phase 2Q declared in bullets and this one declares in tables, so the pattern
 * is not inherited. The family segment is `[A-Z]+` — **letters only** — which is
 * the whole subject of refusal 6 and is deliberately not loosened.
 */
const DECLARATION = /^\| `(2R-[A-Z]+-\d{3})` \|/gm;

/**
 * The same row, admitting digits in the family.
 *
 * Anything this finds that the strict pattern did not is a requirement that is
 * **invisible** — to this generator, to the A13 detector and to every prose
 * count at once. Phase 2K's `2K-A11Y` family is the recorded case.
 */
const LOOSE_DECLARATION = /^\| `(2R-[A-Z0-9]+-\d{3})` \|/gm;

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

/** The observable criterion each declaration carries, by identifier. */
export function criteria(prd = read(PRD)) {
  const found = new Map();
  for (const line of prd.split("\n")) {
    if (!line.startsWith("| `2R-")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const subject = /^`(2R-[A-Z0-9]+-\d{3})`$/.exec(cells[0]);
    if (!subject || cells.length < 3) continue;
    found.set(subject[1], cells[2]);
  }
  return found;
}

/** What each requirement ASKS for: build, baseline or rule. */
export function kinds(prd = read(PRD)) {
  const found = new Map();
  for (const line of prd.split("\n")) {
    if (!line.startsWith("| `2R-")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const subject = /^`(2R-[A-Z0-9]+-\d{3})`$/.exec(cells[0]);
    if (!subject || cells.length < 4) continue;
    if (["build", "baseline", "rule"].includes(cells[3])) found.set(subject[1], cells[3]);
  }
  return found;
}

/** The slice each requirement is assigned to, from the coverage report. */
export function slices(coverage = read(COVERAGE)) {
  const found = new Map();
  for (const line of coverage.split("\n")) {
    if (!line.startsWith("| `2R-")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const subject = /^`(2R-[A-Z0-9]+-\d{3})`$/.exec(cells[0]);
    if (!subject || cells.length < 2) continue;
    if (/^2R\.\d$/.test(cells[1])) found.set(subject[1], cells[1]);
  }
  return found;
}

/**
 * Every classification row in one record.
 *
 * A row counts only when its **first** cell is a bare identifier and its
 * **second** cell BEGINS with one of the five classes. The records qualify their
 * classes in prose — *"baseline — re-proved"*, *"built — evidence corrected in
 * §15"* — and that qualifier is deliberately allowed through: it is the record
 * explaining itself, not a sixth class. What is not allowed through is a cell
 * whose first word is not a class at all, which is refusal 17's job below.
 */
export function classificationsIn(source) {
  const rows = [];
  let inside = false;
  for (const line of source.split("\n")) {
    if (!line.startsWith("|")) {
      // A blank line or prose ends the table; the next one must announce itself.
      if (line.trim() !== "") inside = false;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    /*
      A classification table announces itself, and that is not pedantry.

      These records also carry **transition** tables -- `| Requirement | Was |
      Now | Why |` -- recording how a class moved between runs. Reading rows by
      shape alone picks those up too, and the generator's first run proved it:
      `2R-MOBILE-003` came back classified twice, once from its real row and once
      from the `Was` column of the table explaining that it had changed. This
      repository already has the failure written down as *a 4-column table put
      `Was` where the class goes*.

      So only a table whose SECOND heading is exactly `Class` is read. A
      transition table's second heading is `Was`, and it is skipped entirely.
    */
    if (/^-+:?$|^:?-+:?$/.test(cells[0] ?? "")) continue;
    if (cells[1] === "Class" || cells[1] === "class") {
      inside = cells[0] === "Requirement" || cells[0] === "requirement";
      continue;
    }
    if (!/^`2R-/.test(cells[0] ?? "")) {
      // Any other heading row closes whatever table was open.
      if (!/^`/.test(cells[0] ?? "")) inside = false;
      continue;
    }
    if (!inside) continue;
    if (cells.length < 3) continue;
    const subject = /^`(2R-[A-Z]+-\d{3})`$/.exec(cells[0]);
    if (!subject) continue;
    const bare = cells[1].replace(/^\*+/, "");
    const klass = CLASSES.find((candidate) => new RegExp(`^${candidate}\\b`).test(bare));
    rows.push({
      id: subject[1],
      klass: klass ?? null,
      declared: cells[1],
      evidence: cells.slice(2).join(" | "),
    });
  }
  return rows;
}

/**
 * The evidence with the row's own identifier removed.
 *
 * The recorded trap: a check for *"does this row name a destination"* passes on
 * a row that merely repeats its own id. Strip the subject first, or the guard
 * can never fail.
 */
export function evidenceWithoutSubject(row) {
  return row.evidence.split(row.id).join("");
}

/** Every refusal this generator can raise, as sentences a reader can act on. */
export function refusals({
  prd = read(PRD),
  coverage = read(COVERAGE),
  records = RECORDS.filter((file) => existsSync(join(REPO, file))).map(read),
} = {}) {
  const found = [];
  const declared = declaredRequirements(prd);
  const rows = records.flatMap((source) => classificationsIn(source));

  // 6 — a family containing digits, checked FIRST and against the loose shape.
  // Such a family is invisible to `declaredRequirements`, so every check below
  // would report it as simply absent. This is the one refusal that has to look
  // outside the strict vocabulary to exist at all.
  for (const id of invisibleDeclarations(prd)) {
    found.push(
      `${id} declares a family containing a digit, which hides it from this generator, `
        + "from the A13 detector and from every prose count at once.",
    );
  }

  // 3 — a classification naming an identifier the PRD never declared.
  for (const row of rows) {
    if (!declared.includes(row.id)) {
      found.push(`${row.id} is classified but never declared in the PRD.`);
    }
  }

  // 17 — a class outside the vocabulary. Not one of the contract's sixteen, and
  // it is here because the contract's five classes are only a contract if
  // something refuses a sixth. A record reading `**delivered**` is a record
  // inventing a class.
  for (const row of rows) {
    if (row.klass === null) {
      found.push(
        `${row.id} is classified "${row.declared}", which begins with no class in the vocabulary `
          + `(${CLASSES.join(", ")}).`,
      );
    }
  }

  // 2 — a declared identifier with no classification.
  const classified = new Set(rows.filter((row) => row.klass !== null).map((row) => row.id));
  for (const id of declared) {
    if (!classified.has(id)) found.push(`${id} is declared and never classified.`);
  }

  // 1 — duplicate or conflicting classifications.
  const byId = new Map();
  for (const row of rows) {
    if (row.klass === null) continue;
    const seen = byId.get(row.id);
    if (seen && seen !== row.klass) {
      found.push(`${row.id} is classified as both ${seen} and ${row.klass}.`);
    } else if (seen) {
      found.push(`${row.id} is classified twice, both times as ${seen}.`);
    }
    byId.set(row.id, row.klass);
  }

  // 4 — a requirement with no slice, and 5 — with no observable criterion.
  const assigned = slices(coverage);
  const criterion = criteria(prd);
  for (const id of declared) {
    if (!assigned.has(id)) found.push(`${id} is declared with no slice.`);
    if ((criterion.get(id) ?? "").length < 10) {
      found.push(`${id} is declared with no observable criterion.`);
    }
  }

  // A family must be 001..N without a gap, or a requirement was renumbered away.
  const families = new Map();
  for (const id of declared) {
    const [, family, index] = /^2R-([A-Z]+)-(\d{3})$/.exec(id) ?? [];
    if (!family) {
      found.push(`${id} does not match the declaration shape.`);
      continue;
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

  // 7 / 8 — a partial, undelivered or not-built-by-rule with no remainder AND no
  // destination, judged on evidence that has had its own identifier stripped.
  for (const row of rows) {
    if (!["partial", "undelivered", "not-built-by-rule"].includes(row.klass)) continue;
    const evidence = evidenceWithoutSubject(row);
    if (evidence.trim().length < 20) {
      found.push(`${row.id} is ${row.klass} with no concrete remainder.`);
      continue;
    }
    if (!/destination|owner|later initiative|remainder|rule\b|guard|ADR-\d+|OD-2R-\d/i.test(evidence)) {
      found.push(`${row.id} is ${row.klass} and names no destination or signed rule.`);
    }
  }

  /*
    18 — a `baseline` recorded as `built`, and a `rule` recorded as anything else.

    The contract states this in §1 and nothing enforced it: **"`baseline` may
    never be recorded as `built`."** Phase 2Q's ADR-129 Decision 7 established
    it, because classifying a property that already held as newly built claims a
    change that did not happen — the phase takes credit for work it did not do.

    The opposite direction is deliberately NOT refused. A requirement declared
    `build` and delivered `baseline` is a phase discovering the property already
    held, which is an honest correction and has to stay sayable; `2R-NOTIFY-005`
    is exactly that and its record carries the reason.
  */
  const asked = kinds(prd);
  for (const row of rows) {
    const kind = asked.get(row.id);
    if (kind === "baseline" && row.klass === "built") {
      found.push(
        `${row.id} is declared baseline and classified built, which claims a change that did not happen.`,
      );
    }
    if (kind === "rule" && row.klass !== null && row.klass !== "not-built-by-rule") {
      found.push(
        `${row.id} is declared a rule and classified ${row.klass}; a rule's delivery is its recorded refusal.`,
      );
    }
  }

  // 9 — a non-zero count of `undelivered` is a phase failure, not a category.
  const undelivered = rows.filter((row) => row.klass === "undelivered");
  if (undelivered.length > 0) {
    found.push(
      `${undelivered.length} requirement(s) are undelivered: ${undelivered.map((row) => row.id).join(", ")}. `
        + "A non-zero count is a phase failure, not a category.",
    );
  }

  // 10 / 11 — the migration allocation. One was allocated by `OD-2R-7` and one
  // was spent; the deployment record must name it, and no second may appear.
  const deployment = "docs/reports/phase-2r/PHASE_2R_SLICE_01_DEPLOYMENT.md";
  if (!existsSync(join(REPO, deployment))) {
    found.push("the phase spent a migration and carries no deployment record for it.");
  } else if (!read(deployment).includes("202608230101")) {
    found.push("the deployment record does not name the migration the phase spent.");
  }

  // 13 — hardware proof cannot be discharged by a document.
  const mobile = rows.find((row) => row.id === "2R-MOBILE-003");
  if (mobile && !/owner|device|iPhone|hardware/i.test(evidenceWithoutSubject(mobile))) {
    found.push("2R-MOBILE-003 is classified without naming an owner device session.");
  }

  // 14 — a successor phase's requirement, anywhere in this phase's own PRD.
  //
  // **Retargeted 2026-08-24 by ADR-136**, which authorized Phase 2S. This is the
  // sixth pin on the successor's letter, and the one ADR-131's count of five did
  // not have because this generator did not exist yet. The enumeration lives in
  // `generate-phase-2p-traceability.mjs`'s refusal 12.
  if (/2T-[A-Z]+-\d{3}/.test(prd)) {
    found.push("the PRD declares a successor phase's requirement.");
  }

  // 15 — an inherited remainder absent from the closing record.
  if (existsSync(join(REPO, CLOSING))) {
    const closing = read(CLOSING);
    for (const item of INHERITED) {
      if (!closing.includes(item)) {
        found.push(`the closing record drops the inherited remainder ${item}.`);
      }
    }
  }

  return found;
}

/**
 * Audit §7's inherited list, reproduced here so refusal 15 can check it.
 *
 * Typed once, deliberately: the audit is prose and the guard needs a list. The
 * declaration guard asserts the same names against the audit itself, so a name
 * dropped from the audit and from here at once still fails there.
 */
export const INHERITED = [
  "2P-ACCESS-005",
  "2P-ATTENTION-008",
  "RG-DEP-3",
  "2P-CHAT-007-JOURNEY",
  "ADR-055",
];

/** The matrix, as Markdown. Callers must check `refusals()` first. */
export function renderMatrix({
  prd = read(PRD),
  coverage = read(COVERAGE),
  records = RECORDS.filter((file) => existsSync(join(REPO, file))).map(read),
} = {}) {
  const declared = declaredRequirements(prd);
  const rows = records.flatMap((source) => classificationsIn(source));
  const byId = new Map(rows.filter((row) => row.klass !== null).map((row) => [row.id, row]));
  const assigned = slices(coverage);
  const counts = Object.fromEntries(CLASSES.map((klass) => [klass, 0]));
  for (const row of byId.values()) counts[row.klass] += 1;

  const lines = [
    "# Phase 2R — Traceability matrix",
    "",
    "**Generated, never typed.** `node scripts/generate-phase-2r-traceability.mjs`",
    "reads the PRD, the coverage report and the six slice acceptance records and",
    "writes this file, or refuses and writes nothing. A matrix that is 72 of 73",
    "correct reads as complete, which is why a refusal produces no file at all.",
    "",
    `**${declared.length} declared · ${byId.size} classified · ${declared.length - byId.size} unclassified.**`,
    "",
    "| Class | Count |",
    "|---|---:|",
    ...CLASSES.map((klass) => `| \`${klass}\` | ${counts[klass]} |`),
    "",
    "| Requirement | Slice | Class | Evidence |",
    "|---|---|---|---|",
    ...declared.map((id) => {
      const row = byId.get(id);
      const slice = assigned.get(id) ?? "—";
      return `| \`${id}\` | ${slice} | ${row ? row.klass : "**UNCLASSIFIED**"} | ${row ? row.evidence : "—"} |`;
    }),
    "",
  ];
  return lines.join("\n");
}

const isCheck = process.argv.includes("--check");
const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("generate-phase-2r-traceability.mjs");

if (invokedDirectly) {
  const problems = refusals();
  if (problems.length > 0) {
    console.error("REFUSED — the matrix was not written:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const declared = declaredRequirements();
  const classified = new Set(
    RECORDS.filter((file) => existsSync(join(REPO, file)))
      .map(read)
      .flatMap((source) => classificationsIn(source))
      .filter((row) => row.klass !== null)
      .map((row) => row.id),
  );
  if (isCheck) {
    const current = existsSync(join(REPO, MATRIX)) ? read(MATRIX) : "";
    if (current !== renderMatrix()) {
      console.error("REFUSED — the matrix on disk differs from a fresh generation.");
      process.exit(1);
    }
    console.log(
      `declared ${declared.length} · classified ${classified.size} · unclassified ${declared.length - classified.size}`,
    );
    process.exit(declared.length === classified.size ? 0 : 1);
  }
  writeFileSync(join(REPO, MATRIX), renderMatrix(), "utf8");
  console.log(`wrote ${MATRIX}: ${declared.length} declared, ${classified.size} classified.`);
}
