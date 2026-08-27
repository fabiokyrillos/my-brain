/**
 * Phase 2S's delivery matrix — generated, never typed.
 *
 * `docs/reports/phase-2s/PHASE_2S_TRACEABILITY_CONTRACT.md` governs this file
 * and names **twenty-two refusals**. Each is implemented below with the
 * contract's own number beside it, and **a refusal writes nothing at all**: a
 * matrix that is 98 of 99 correct reads as complete, so the failure mode of a
 * partial file is worse than the failure mode of no file.
 *
 * ## Where the classifications come from
 *
 * The PRD declares; the slice acceptance records classify. Nothing here types a
 * class and nothing here edits a count. *A phase that types its own matrix is
 * grading its own homework.*
 *
 * ## The record count
 *
 * Five records — 2S.0 through 2S.4. Phase 2R's generator carried a note
 * correcting its contract, which said "five" when there were six; this
 * contract says "the slice acceptance records" without a number, which is the
 * correction already applied.
 *
 * ## No shebang
 *
 * Deliberate, and the contract says so twice. The local Rolldown transform
 * refuses one — vite's CJS interop prepends an import line, putting `#!` mid
 * line — and Phase 2R's generator test could not load until it was removed.
 * Every sibling generator carries none.
 *
 * ## Usage
 *
 *     node scripts/generate-phase-2s-traceability.mjs
 *     node scripts/generate-phase-2s-traceability.mjs --check
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..");
const read = (relative) => readFileSync(join(REPO, relative), "utf8").replace(/\r\n/g, "\n");
const has = (relative) => existsSync(join(REPO, relative));

const PRD = "docs/initiatives/phase-2s/PHASE_2S_PRD.md";
const COVERAGE = "docs/reports/phase-2s/PHASE_2S_REQUIREMENT_COVERAGE.md";
const MATRIX = "docs/reports/phase-2s/PHASE_2S_TRACEABILITY_MATRIX.md";
const CLOSING = "docs/reports/phase-2s/PHASE_2S_CLOSING_REPORT.md";
const HANDLERS = "src/features/notifications/verb-handlers.ts";
const DECISIONS = "docs/DECISIONS.md";

const RECORDS = [
  "docs/reports/phase-2s/PHASE_2S_SLICE_00_ACCEPTANCE.md",
  "docs/reports/phase-2s/PHASE_2S_SLICE_01_ACCEPTANCE.md",
  "docs/reports/phase-2s/PHASE_2S_SLICE_02_ACCEPTANCE.md",
  "docs/reports/phase-2s/PHASE_2S_SLICE_03_ACCEPTANCE.md",
  "docs/reports/phase-2s/PHASE_2S_SLICE_04_ACCEPTANCE.md",
];

/** Every document this phase produced, for the checks that scan prose. */
const PHASE_DOCUMENTS = () =>
  [
    ...readdirSync(join(REPO, "docs/reports/phase-2s")).map((f) => `docs/reports/phase-2s/${f}`),
    ...readdirSync(join(REPO, "docs/initiatives/phase-2s")).map((f) => `docs/initiatives/phase-2s/${f}`),
  ].filter((f) => f.endsWith(".md"));

/** The contract's vocabulary. Exactly five, and a sixth is a refusal. */
export const CLASSES = ["built", "baseline", "partial", "not-built-by-rule", "undelivered"];

/** The one migration `OD-2S-7` allocated, and the parity it moved to. */
export const MIGRATION_ALLOCATION = 1;
export const PARITY = "202608240102";

/**
 * PRD §7.1's inherited remainders, one stable token per row.
 *
 * Typed once, deliberately — the audit is a prose table and refusal 17 needs a
 * list. The declarations guard asserts these same names against the PRD itself,
 * so a row dropped from §7.1 **and** from here still fails there.
 */
export const INHERITED = [
  "2R-TZ-SECOND-AUTHORITY",
  "2R-UNDO-LEDGER-NOT-CLOSED",
  "2R-OCCURRENCE-CANCEL-IRREVERSIBLE",
  "2R-AXE-MANUAL-LANE",
  "2R-RECURRENCE-LANE-UNRUNNABLE",
  "2R-DRAWER-NOT-LOCKED",
  "2R-TASK-RECURRENCE",
  "OD-2R-9",
  "OD-2R-2",
  "OD-2S-6",
  "2P-ATTENTION-008",
  "RG-DEP-3",
  "2P-CHAT-007-JOURNEY",
  "2P-REVIEW-CITATIONS",
  "2P-ACCESS-005",
  "2P-MOBILE-002",
  "OD-2Q-8",
  "transcription",
  "ADR-055",
];

/**
 * The writers that existed at slice 2S.0's baseline — **measured, not assumed.**
 *
 * Read at commit `39bb4b8` (slice 2S.0's merge, PR #310) with
 * `git grep -l "export async function <name>"`. Four were found; the fifth,
 * `suppressNotificationSubject`, was **absent**, which is exactly what makes it
 * the phase's one new authority rather than a claim about one.
 *
 * `2S-TRUST-010` forbids a second write authority over a task's status, and
 * `OD-2S-3` B was signed against this package's recommendation on that very
 * point. Refusal 20 is the objection turned into an exit code.
 */
export const BASELINE_WRITERS = [
  "markNotification",
  "applyWorkItemAction",
  "applyTaskDetailCommand",
  "undoWorkOperation",
];

/**
 * The one authority this phase adds, and the only name refusal 20 admits
 * beyond the baseline. It rides the single allocated migration.
 */
export const AUTHORIZED_NEW_WRITER = "suppressNotificationSubject";

/** `2S-CLOSE-013`: every inline verb, and the action it must be shown to use. */
export const VERB_AUTHORITIES = [
  "markNotification",
  "suppressNotificationSubject",
  "applyWorkItemAction",
  "applyTaskDetailCommand",
  "undoWorkOperation",
];

const DECLARATION = /^\| `(2S-[A-Z]+-\d{3})` \|/gm;
/**
 * The same row, admitting digits in the family.
 *
 * Anything this finds that the strict pattern did not is a requirement
 * **invisible** to this generator, to the A13 detector and to every prose count
 * at once. Phase 2K's `2K-A11Y` family is the recorded case, and refusal 6 is
 * the only check that has to look outside the strict vocabulary to exist.
 */
const LOOSE_DECLARATION = /^\| `(2S-[A-Z0-9]+-\d{3})` \|/gm;

export function declaredRequirements(prd = read(PRD)) {
  return [...prd.matchAll(DECLARATION)].map((match) => match[1]);
}

/** Declarations the strict shape cannot see. Empty is the healthy answer. */
export function invisibleDeclarations(prd = read(PRD)) {
  const strict = new Set(declaredRequirements(prd));
  return [...prd.matchAll(LOOSE_DECLARATION)].map((m) => m[1]).filter((id) => !strict.has(id));
}

function cellsOf(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function bareId(cell) {
  return /^`(2S-[A-Z0-9]+-\d{3})`$/.exec(cell ?? "")?.[1] ?? null;
}

/** The observable criterion each declaration carries, by identifier. */
export function criteria(prd = read(PRD)) {
  const found = new Map();
  for (const line of prd.split("\n")) {
    if (!line.startsWith("| `2S-")) continue;
    const cells = cellsOf(line);
    const id = bareId(cells[0]);
    if (!id || cells.length < 3) continue;
    found.set(id, cells[2]);
  }
  return found;
}

/** What each requirement ASKS for: build, baseline or rule. */
export function kinds(prd = read(PRD)) {
  const found = new Map();
  for (const line of prd.split("\n")) {
    if (!line.startsWith("| `2S-")) continue;
    const cells = cellsOf(line);
    const id = bareId(cells[0]);
    if (!id || cells.length < 4) continue;
    const kind = cells[3].replace(/\*/g, "");
    if (["build", "baseline", "rule"].includes(kind)) found.set(id, kind);
  }
  return found;
}

/**
 * The slice each requirement is assigned to, from the coverage report.
 *
 * `across` is a first-class answer, not a missing one: `2S-TRUST`'s thirteen are
 * properties every slice carries, and the coverage report says so. Reading only
 * `2S.N` would make refusal 4 fire on all thirteen and report a phase-wide
 * property as an unassigned requirement.
 */
export function slices(coverage = read(COVERAGE)) {
  const found = new Map();
  for (const line of coverage.split("\n")) {
    if (!line.startsWith("| `2S-")) continue;
    const cells = cellsOf(line);
    const id = bareId(cells[0]);
    if (!id || cells.length < 2) continue;
    if (/^2S\.\d$/.test(cells[1]) || cells[1] === "across") found.set(id, cells[1]);
  }
  return found;
}

/**
 * Every classification row in one record.
 *
 * A row counts only when its **first** cell is a bare identifier and its
 * **second** cell begins with one of the five classes — and only inside a table
 * that announced itself with `| Requirement | Class | …`.
 *
 * That announcement is not pedantry. These records also carry tables shaped
 * `| Requirement | Was | Now | Why |` and `| item | state | why |`, and reading
 * rows by shape alone picks those up too. Phase 2R's generator classified three
 * requirements twice from exactly that, and this repository already has the
 * failure written down as *a 4-column table put `Was` where the class goes*.
 */
export function classificationsIn(source) {
  const rows = [];
  let inside = false;
  for (const line of source.split("\n")) {
    if (!line.startsWith("|")) {
      if (line.trim() !== "") inside = false;
      continue;
    }
    const cells = cellsOf(line);
    if (/^:?-+:?$/.test(cells[0] ?? "")) continue;
    if (cells[1] === "Class" || cells[1] === "class") {
      inside = cells[0] === "Requirement" || cells[0] === "requirement";
      continue;
    }
    const id = bareId(cells[0]);
    if (!id) {
      if (!/^`/.test(cells[0] ?? "")) inside = false;
      continue;
    }
    if (!inside || cells.length < 3) continue;
    const bare = cells[1].replace(/^\*+/, "");
    const klass = CLASSES.find((candidate) => new RegExp(`^${candidate}\\b`).test(bare));
    rows.push({ id, klass: klass ?? null, declared: cells[1], evidence: cells.slice(2).join(" | ") });
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

/**
 * Refusal 18 — a sentence claiming push works.
 *
 * It forbids the **act**, never the word. A guard that banned *push* would ban
 * the honest sentence *"push is still not working"*, which is the sentence the
 * record most needs. So it matches a claim and then looks for a refusal inside
 * the same sentence. Sentence bounds do **not** exclude newlines: prose wraps,
 * and cutting at the line break loses the refusal that follows it.
 */
const PUSH_CLAIM = /\bpush\b[^.!?]*\b(works|working|verified|delivered|resumed|repaired|restored)\b/gi;
const PUSH_REFUSAL = /\b(not|never|no|cannot|refus|unresolved|still|remains|blocked|outstanding|carried|zero)/i;

export function pushClaims(source) {
  const found = [];
  for (const sentence of source.split(/(?<=[.!?])\s/)) {
    PUSH_CLAIM.lastIndex = 0;
    if (!PUSH_CLAIM.test(sentence)) continue;
    if (!PUSH_REFUSAL.test(sentence)) found.push(sentence.replace(/\s+/g, " ").trim().slice(0, 160));
  }
  return found;
}

/** The handler names the one shared bundle actually dispatches to. */
export function bundledWriters(source = read(HANDLERS)) {
  const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const block = /NOTIFICATION_VERB_HANDLERS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(body);
  if (!block) return [];
  return [...block[1].matchAll(/:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
}

/** Local migration files, and the ones this phase is responsible for. */
export function migrationCounts() {
  const files = readdirSync(join(REPO, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  return { local: files.length, phase: files.filter((f) => /phase_2s/i.test(f)).length };
}

/** Every refusal this generator can raise, as sentences a reader can act on. */
export function refusals({
  prd = read(PRD),
  coverage = read(COVERAGE),
  records = RECORDS.filter(has).map(read),
  closing = has(CLOSING) ? read(CLOSING) : null,
  handlers = has(HANDLERS) ? read(HANDLERS) : null,
  documents = PHASE_DOCUMENTS().map((f) => [f, read(f)]),
  migrations = migrationCounts(),
} = {}) {
  const found = [];
  const declared = declaredRequirements(prd);
  const rows = records.flatMap((source) => classificationsIn(source));

  // 6 — a family containing digits, checked FIRST and against the loose shape.
  // Such a family is invisible to `declaredRequirements`, so every check below
  // would report it as simply absent.
  for (const id of invisibleDeclarations(prd)) {
    found.push(
      `${id} declares a family containing a digit, which hides it from this generator, `
        + "from the A13 detector and from every prose count at once.",
    );
  }

  // 3 — a classification naming an identifier the PRD never declared.
  for (const row of rows) {
    if (!declared.includes(row.id)) found.push(`${row.id} is classified but never declared in the PRD.`);
  }

  // A class outside the vocabulary. The five classes are only a contract if
  // something refuses a sixth; a record reading `**delivered**` is inventing one.
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
    if (seen && seen !== row.klass) found.push(`${row.id} is classified as both ${seen} and ${row.klass}.`);
    else if (seen) found.push(`${row.id} is classified twice, both times as ${seen}.`);
    byId.set(row.id, row.klass);
  }

  // 4 — no slice, and 5 — no observable criterion.
  const assigned = slices(coverage);
  const criterion = criteria(prd);
  for (const id of declared) {
    if (!assigned.has(id)) found.push(`${id} is declared with no slice.`);
    if ((criterion.get(id) ?? "").length < 10) found.push(`${id} is declared with no observable criterion.`);
  }

  // A family must be 001..N without a gap, or a requirement was renumbered away.
  const families = new Map();
  for (const id of declared) {
    const [, family, index] = /^2S-([A-Z]+)-(\d{3})$/.exec(id) ?? [];
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
    if (!/destination|owner|later|remainder|rule\b|guard|waived|carried|ADR-\d+|OD-2[A-Z]-\d/i.test(evidence)) {
      found.push(`${row.id} is ${row.klass} and names no destination or signed rule.`);
    }
  }

  /*
    10 — a `baseline` recorded as `built`, and a `rule` recorded as anything
    other than its recorded refusal.

    The contract states this in §1 and Phase 2R proved that stating it enforces
    nothing: its closeout found 57 `built` against 55 declared `build`, and five
    of the six named rows had been wrong since that phase's FIRST slice. The
    evidence in each was correct; the column it was filed under was not.

    The opposite direction is deliberately NOT refused — `2S-CLOSE-004`. A
    requirement declared `build` and delivered `baseline` is a phase discovering
    the property already held, and refusing both directions would push a phase
    toward manufacturing a change to make a label look right.
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
      `${undelivered.length} requirement(s) are undelivered: ${undelivered.map((r) => r.id).join(", ")}. `
        + "A non-zero count is a phase failure, not a category.",
    );
  }

  // 11 / 12 / 13 — the migration budget, against the files on disk and the live
  // parity the closing record must state. A generator cannot reach the network,
  // so the hosted half is a recorded reading and this compares the two.
  if (migrations.phase > MIGRATION_ALLOCATION) {
    found.push(
      `the phase carries ${migrations.phase} migrations against an allocation of ${MIGRATION_ALLOCATION}.`,
    );
  }
  if (migrations.phase === 1 && !has("docs/reports/phase-2s/PHASE_2S_SLICE_01_DEPLOYMENT.md")) {
    found.push("the phase spent a migration and carries no deployment record for it.");
  }
  if (closing !== null) {
    if (!closing.includes(PARITY)) {
      found.push(`the closing record does not name the parity ${PARITY} the phase's migration moved to.`);
    }
    const stated = /(\d+)\s+local\s*=\s*(\d+)\s+hosted/.exec(closing);
    if (!stated) {
      found.push("the closing record does not state the local and hosted migration counts.");
    } else if (stated[1] !== stated[2]) {
      found.push(`the closing record states ${stated[1]} local against ${stated[2]} hosted; they must agree.`);
    } else if (Number.parseInt(stated[1], 10) !== migrations.local) {
      found.push(
        `the closing record states ${stated[1]} local migrations and ${migrations.local} are on disk.`,
      );
    }
  }

  // 14 — an `OD-2S-*` called signed with no accepted ADR naming it.
  if (closing !== null && has(DECISIONS)) {
    const decisions = read(DECISIONS);
    for (const match of closing.matchAll(/`(OD-2S-\d+)`[^.\n]{0,80}\bsigned\b/gi)) {
      if (!new RegExp(`${match[1]}\\b`).test(decisions)) {
        found.push(`${match[1]} is called signed and no accepted ADR names it.`);
      }
    }
  }

  // 15 — a hardware proof cannot be discharged by a document.
  const mobile = rows.find((row) => row.id === "2S-MOBILE-003");
  if (mobile && !/owner|device|iPhone|hardware/i.test(evidenceWithoutSubject(mobile))) {
    found.push("2S-MOBILE-003 is classified without naming an owner device session.");
  }

  // 16 — a successor, in any of the three shapes it can take.
  if (/2T-[A-Z]+-\d{3}/.test(prd)) found.push("the PRD declares a successor phase's requirement.");
  for (const directory of ["docs/initiatives/phase-2t", "docs/reports/phase-2t"]) {
    if (has(directory)) found.push(`a successor directory exists: ${directory}.`);
  }

  // 17 — an inherited remainder absent from the closing record.
  if (closing !== null) {
    for (const item of INHERITED) {
      if (!closing.includes(item)) found.push(`the closing record drops the inherited remainder ${item}.`);
    }
  }

  // 18 — a document produced by this phase claiming push works.
  for (const [file, source] of documents) {
    for (const sentence of pushClaims(source)) {
      found.push(`${file} claims push works: "${sentence}"`);
    }
  }

  // 19 — the closing record must state what the re-measurement found.
  if (closing !== null && !/2S-CLOSE-012/.test(closing)) {
    found.push("the closing record does not state what 2S-CLOSE-012's re-measurement found.");
  }

  // 20 — an inline verb dispatching to a writer absent from slice 2S.0's
  // baseline. `OD-2S-3` B was signed against the recommendation on exactly this
  // point, and this is the objection turned into an exit code.
  if (handlers !== null) {
    const allowed = new Set([...BASELINE_WRITERS, AUTHORIZED_NEW_WRITER]);
    const bundled = bundledWriters(handlers);
    if (bundled.length === 0) {
      found.push("the verb handler bundle could not be read, so refusal 20 cannot fire and is not passing.");
    }
    for (const writer of bundled) {
      if (!allowed.has(writer)) {
        found.push(
          `the inline verbs dispatch to ${writer}, which did not exist at slice 2S.0's baseline `
            + "and is not the one authority this phase was allocated.",
        );
      }
    }
  }

  // 21 — the closing record must name the action each inline verb dispatched to.
  if (closing !== null) {
    for (const writer of VERB_AUTHORITIES) {
      if (!closing.includes(writer)) {
        found.push(`the closing record does not name the authority ${writer} that an inline verb dispatches to.`);
      }
    }
  }

  return found;
}

/** The matrix, as Markdown. Callers must check `refusals()` first. */
export function renderMatrix({
  prd = read(PRD),
  coverage = read(COVERAGE),
  records = RECORDS.filter(has).map(read),
} = {}) {
  const declared = declaredRequirements(prd);
  const rows = records.flatMap((source) => classificationsIn(source));
  const byId = new Map(rows.filter((row) => row.klass !== null).map((row) => [row.id, row]));
  const assigned = slices(coverage);
  const counts = Object.fromEntries(CLASSES.map((klass) => [klass, 0]));
  for (const row of byId.values()) counts[row.klass] += 1;

  return [
    "# Phase 2S — Traceability matrix",
    "",
    "**Generated, never typed.** `node scripts/generate-phase-2s-traceability.mjs`",
    "reads the PRD, the coverage report and the five slice acceptance records and",
    "writes this file, or refuses and writes nothing. A matrix that is 98 of 99",
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
      return `| \`${id}\` | ${assigned.get(id) ?? "—"} | ${row ? row.klass : "**UNCLASSIFIED**"} | ${row ? row.evidence : "—"} |`;
    }),
    "",
  ].join("\n");
}

const isCheck = process.argv.includes("--check");
const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("generate-phase-2s-traceability.mjs");

if (invokedDirectly) {
  const problems = refusals();
  if (problems.length > 0) {
    console.error("REFUSED — the matrix was not written:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const declared = declaredRequirements();
  const classified = new Set(
    RECORDS.filter(has)
      .map(read)
      .flatMap((source) => classificationsIn(source))
      .filter((row) => row.klass !== null)
      .map((row) => row.id),
  );
  if (isCheck) {
    // 22 — the matrix on disk must equal a fresh generation, byte for byte.
    const current = has(MATRIX) ? read(MATRIX) : "";
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
