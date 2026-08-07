/**
 * Phase 2H traceability generator — `2H-CLOSE-001` and `2H-CLOSE-002`.
 *
 * Writes `docs/reports/phase-2h/PHASE_2H_TRACEABILITY_MATRIX.md` from
 * `docs/initiatives/phase-2h/PHASE_2H_PRD.md` and from the artifacts the
 * repository actually holds.
 *
 * ## Fail-closed, and what that means here
 *
 * It inherits the rule every generator in this repository sets: **derive what
 * can be derived, resolve what is declared, and fail rather than print an
 * unresolved claim.** A traceability matrix that prints a status somebody typed
 * is a document asserting that somebody once typed it.
 *
 * What is derived rather than declared:
 *
 *   * the inventory comes from the PRD's own declaration shape
 *     (`- **2H-FAMILY-000:**`) — the same shape the A13 phase-start detector
 *     matches, so the two cannot disagree about what a declaration *is*;
 *   * **delivery is evidenced by citation** — a requirement counts as delivered
 *     when an acceptance record under `docs/reports/phase-2h/` names its id;
 *   * the migration budget is read from the chain, not restated: Phase 2H is
 *     allocated five (ADR-085 §4), each allocated to a named slice, and a sixth
 *     is a finding even if every other check passes.
 *
 * What must be declared, because no artifact can imply it: a requirement that is
 * **not** delivered. Those live in `UNDELIVERED`, each with a reason and a
 * destination, and the generator cross-checks both directions — an id declared
 * undelivered while an acceptance record claims it is a finding, and so is an id
 * that is neither cited nor declared.
 *
 * ## What this generator adds beyond `2G-CLOSE-001`'s
 *
 * **Per-slice migration attribution.** Phase 2G had one migration, so "how many"
 * was the whole question. Phase 2H has five, allocated per slice and
 * **non-transferable**, so a migration existing is not enough — it must be *the*
 * migration its slice was allocated. A chain that spent five migrations with two
 * belonging to one slice and none to another has broken a budget rule that a
 * count cannot see.
 *
 * Every function takes an explicit `root` so the tests can run it against
 * fixture repositories carrying one deliberate defect each — and against the
 * real one as a positive control, because a guard proven only in the failing
 * direction may be refusing everything.
 *
 * No shebang: the closeout test imports this module, and the bundler refuses
 * `#!` in a file it has wrapped.
 *
 * Usage: `npm run docs:phase-2h:traceability`
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PRD_PATH = "docs/initiatives/phase-2h/PHASE_2H_PRD.md";
export const REPORTS_DIR = "docs/reports/phase-2h";
export const MATRIX_OUTPUT_PATH = `${REPORTS_DIR}/PHASE_2H_TRACEABILITY_MATRIX.md`;

/** ADR-085 §4. Five, allocated per slice and non-transferable. */
export const MIGRATION_BUDGET = 5;

/**
 * The allocation, slice by slice.
 *
 * A count alone cannot catch the failure this exists for: five migrations where
 * two belong to 2H.2 and none to 2H.3 spends the budget exactly and breaks the
 * rule that made it per-slice. Each entry pins the version **and** the topic
 * slug its filename must carry, so a migration that landed under the wrong
 * slice's number is visible.
 *
 * 2H.0 and 2H.6 hold none, and their absence is as declared as the others'
 * presence.
 */
export const MIGRATION_ALLOCATION = Object.freeze({
  "2H.1": { version: "202608070079", slug: "phase_2h_deletion_recovery" },
  "2H.2": { version: "202608070080", slug: "phase_2h_error_sink_and_deadman" },
  "2H.3": { version: "202608070081", slug: "phase_2h_rate_limiting" },
  "2H.4": { version: "202608070082", slug: "phase_2h_operator_surfaces" },
  "2H.5": { version: "202608070083", slug: "phase_2h_retention" },
});

/** Slices that were allocated no migration, declared so the zero is a decision. */
export const ZERO_MIGRATION_SLICES = Object.freeze(["2H.0", "2H.6"]);

/**
 * Requirements this phase did **not** deliver, each with its reason and its
 * destination.
 *
 * Empty, and that is a claim rather than an omission: every one of the 44
 * declared requirements is cited by an acceptance record on disk. The
 * cross-check below is what makes the emptiness checkable — an id that is
 * neither cited nor declared here is a finding, so an empty object cannot hide
 * a missing requirement.
 */
export const UNDELIVERED = Object.freeze({});

/**
 * Requirements delivered **in part**, each with what landed, what is missing,
 * and where the remainder lives.
 *
 * A partial must still be *cited*, so the category cannot smuggle an unevidenced
 * claim past the citation rule.
 */
export const PARTIAL = Object.freeze({});

/** The inventory, from the PRD's own declaration shape. */
export function parseRequirements(root) {
  const prd = readFileSync(join(root, PRD_PATH), "utf8");
  const ids = [];
  for (const line of prd.split("\n")) {
    const match = /^- \*\*(2H-[A-Z]+-\d{3}):\*\*/.exec(line.trim());
    if (match) ids.push(match[1]);
  }
  return ids;
}

/**
 * The documents whose purpose is to record what was **delivered**.
 *
 * Narrower than "every markdown file here", and Phase 2G's first run is why: a
 * blocker report legitimately *names* the requirement it reports as blocked, and
 * a threat model names the ones its mitigations serve. Counting those as
 * delivery evidence would let a document saying "this did not happen" satisfy
 * the requirement it was describing.
 */
export function reportFiles(root) {
  const dir = join(root, REPORTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /_(ACCEPTANCE|DEPLOYMENT|EVIDENCE)\.md$/.test(name))
    .sort();
}

/** Which records cite a given requirement id. Evidence, resolved on disk. */
export function citationsFor(root, id) {
  return reportFiles(root).filter((name) =>
    readFileSync(join(root, REPORTS_DIR, name), "utf8").includes(id),
  );
}

/** Every `2H-*` id an acceptance record names, whether or not the PRD has it. */
export function citedIds(root) {
  const found = new Set();
  for (const name of reportFiles(root)) {
    const text = readFileSync(join(root, REPORTS_DIR, name), "utf8");
    for (const [, id] of text.matchAll(/\b(2H-[A-Z]+-\d{3})\b/g)) found.add(id);
  }
  return [...found].sort();
}

/** Migrations this phase spent, read from the chain rather than restated. */
export function phaseMigrations(root) {
  const dir = join(root, "supabase/migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => /phase_2h/i.test(name)).sort();
}

/**
 * The budget, reconciled slice by slice — `2H-CLOSE-002`.
 *
 * Returns findings rather than throwing, so the caller can report all of them
 * at once instead of the first.
 */
export function migrationFindings(root) {
  const problems = [];
  const migrations = phaseMigrations(root);

  if (migrations.length > MIGRATION_BUDGET) {
    problems.push(
      `Phase 2H spent ${migrations.length} migrations against a budget of ${MIGRATION_BUDGET}: ` +
        `${migrations.join(", ")} — a sixth is an owner amendment, not a judgement call`,
    );
  }
  if (migrations.length < MIGRATION_BUDGET) {
    problems.push(
      `Phase 2H shows ${migrations.length} of ${MIGRATION_BUDGET} allocated migrations in the chain: ` +
        `${migrations.join(", ") || "none"}`,
    );
  }

  const seen = new Map();
  for (const [slice, allocation] of Object.entries(MIGRATION_ALLOCATION)) {
    const expected = `${allocation.version}_${allocation.slug}.sql`;
    if (!migrations.includes(expected)) {
      const byVersion = migrations.find((name) => name.startsWith(allocation.version));
      problems.push(
        byVersion
          ? `slice ${slice} was allocated ${allocation.version} as \`${allocation.slug}\` but the chain holds \`${byVersion}\``
          : `slice ${slice}'s allocated migration ${allocation.version} is absent from the chain`,
      );
      continue;
    }
    if (seen.has(expected)) {
      problems.push(`${expected} is allocated to both ${seen.get(expected)} and ${slice}`);
    }
    seen.set(expected, slice);
  }

  for (const name of migrations) {
    if (!seen.has(name)) {
      problems.push(`${name} is in the chain but is allocated to no slice`);
    }
  }

  return problems;
}

/**
 * The declared exceptions, overridable **only** for the guard's fixtures.
 *
 * `UNDELIVERED` and `PARTIAL` are frozen module constants because production
 * must read exactly one set. But a guard that cannot construct "an id declared
 * undelivered with no destination" cannot prove the generator refuses it, and a
 * refusal nobody has seen fire is a refusal nobody has tested. So every entry
 * point takes the pair as an argument defaulting to the constants: production
 * behaviour is unchanged, and the fixtures can carry one deliberate defect each.
 */
function declarations(overrides) {
  return {
    undelivered: overrides?.undelivered ?? UNDELIVERED,
    partial: overrides?.partial ?? PARTIAL,
  };
}

export function classify(root, id, overrides) {
  const declared = declarations(overrides);
  const cited = citationsFor(root, id);
  const undelivered = declared.undelivered[id];
  if (undelivered) {
    return { id, status: "not delivered", evidence: cited, ...undelivered };
  }
  const partial = declared.partial[id];
  if (partial) {
    // A partial still owes evidence. Without this, "partial" would be a way to
    // assert half a delivery with nothing on disk behind it.
    return {
      id,
      status: cited.length > 0 ? "partially delivered" : "unresolved",
      evidence: cited,
      ...partial,
    };
  }
  if (cited.length > 0) return { id, status: "delivered", evidence: cited };
  return { id, status: "unresolved", evidence: [] };
}

export function findings(root, overrides) {
  const declared_ = declarations(overrides);
  const UNDELIVERED_ = declared_.undelivered;
  const PARTIAL_ = declared_.partial;
  const problems = [];
  const ids = parseRequirements(root);

  if (ids.length === 0) {
    // The failure mode every parser-backed guard has: the anchor changes, the
    // list comes back empty, and the report describes nothing while looking
    // complete.
    problems.push("the PRD yielded no declared requirements — the declaration anchor has drifted");
    return problems;
  }

  const declared = new Set(ids);

  for (const id of ids) {
    const row = classify(root, id, overrides);
    if (row.status === "unresolved") {
      problems.push(
        PARTIAL_[id]
          ? `${id} is declared partially delivered but no acceptance record cites it`
          : `${id} is neither cited by an acceptance record nor declared undelivered`,
      );
    }
    // Deliberately NOT a finding: an acceptance record naming a requirement in
    // order to say it was not delivered. An explicit declaration wins over a
    // mention, because a human wrote the declaration with a reason and a
    // destination attached — and the honest sentence "X is not delivered, here
    // is why" must remain writable in the document whose job is to say it.
  }

  // The other direction: an acceptance record citing an id the PRD does not
  // declare. That is either a typo in a record or a requirement that was
  // implemented and never declared, and both are findings.
  const cited = citedIds(root);
  if (cited.length === 0) {
    problems.push(`no acceptance record under ${REPORTS_DIR} cites any 2H requirement`);
  }
  for (const id of cited) {
    if (!declared.has(id)) {
      problems.push(`${id} is cited by an acceptance record but the PRD does not declare it`);
    }
  }

  // A declared exception for an id the PRD does not declare is a stale entry,
  // and a stale exception is how an inventory quietly shrinks.
  for (const [id, entry] of Object.entries(UNDELIVERED_)) {
    if (!declared.has(id)) {
      problems.push(`${id} is declared undelivered but the PRD does not declare it`);
    }
    if (PARTIAL_[id]) problems.push(`${id} is declared both undelivered and partially delivered`);
    if (!entry?.destination) problems.push(`${id} is declared undelivered with no destination`);
    if (!entry?.reason) problems.push(`${id} is declared undelivered with no reason`);
    // The conflict the contract names explicitly: an id declared undelivered
    // while a record claims it. The declaration and the evidence disagree, and
    // a matrix that silently preferred either one would be asserting something
    // nobody checked.
    if (citationsFor(root, id).length > 0) {
      problems.push(
        `${id} is declared undelivered but ${citationsFor(root, id).join(", ")} claims it — ` +
          "the declaration and the evidence disagree",
      );
    }
  }
  for (const [id, entry] of Object.entries(PARTIAL_)) {
    if (!declared.has(id)) {
      problems.push(`${id} is declared partially delivered but the PRD does not declare it`);
    }
    if (!entry?.destination) problems.push(`${id} is declared partial with no destination`);
    if (!entry?.remaining) problems.push(`${id} is declared partial with no remainder`);
  }

  problems.push(...migrationFindings(root));

  if (reportFiles(root).length === 0) {
    problems.push(`no acceptance record exists under ${REPORTS_DIR}`);
  }

  return problems;
}

export function renderMatrix(root) {
  const ids = parseRequirements(root);
  const rows = ids.map((id) => classify(root, id));
  const delivered = rows.filter((row) => row.status === "delivered");
  const partial = rows.filter((row) => row.status === "partially delivered");
  const undelivered = rows.filter((row) => row.status === "not delivered");
  const migrations = phaseMigrations(root);

  const byFamily = new Map();
  for (const row of rows) {
    const family = row.id.split("-")[1];
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(row);
  }

  const lines = [
    "# Phase 2H traceability matrix",
    "",
    "**Generated — do not edit by hand.** `npm run docs:phase-2h:traceability`",
    "rewrites this file and fails rather than print an unresolved claim, so an",
    "edit here produces a status nothing checked (`2H-CLOSE-001`).",
    "",
    "Delivery is evidenced by **citation**: a requirement is delivered when an",
    `acceptance record under \`${REPORTS_DIR}/\` names its id. A requirement that`,
    "is not delivered must be declared in the generator with a reason and a",
    "destination, and the generator refuses an id that is neither. A requirement",
    "that is **partially delivered** must be declared *and* cited — the",
    "declaration says what is still missing, the citation proves the rest landed.",
    "",
    "Both directions are checked: an id the PRD declares and nothing cites is a",
    "finding, and so is an id an acceptance record cites and the PRD does not",
    "declare.",
    "",
    `- **${ids.length}** requirements declared`,
    `- **${delivered.length}** delivered`,
    `- **${partial.length}** partially delivered`,
    `- **${undelivered.length}** not delivered, each named with a destination`,
    `- **${migrations.length}** of ${MIGRATION_BUDGET} budgeted migrations spent,` +
      " each by the slice it was allocated to",
    "",
    "## Migration budget — `2H-CLOSE-002`",
    "",
    "Allocated per slice and **non-transferable**. A count alone cannot catch the",
    "failure this table exists for: five migrations with two belonging to one",
    "slice and none to another spends the budget exactly and breaks the rule.",
    "",
    "| Slice | Allocated | In the chain |",
    "| --- | --- | --- |",
  ];

  for (const [slice, allocation] of Object.entries(MIGRATION_ALLOCATION)) {
    const expected = `${allocation.version}_${allocation.slug}.sql`;
    lines.push(
      `| ${slice} | 1 — \`${allocation.version}\` | ${migrations.includes(expected) ? `\`${expected}\`` : "**ABSENT**"} |`,
    );
  }
  for (const slice of ZERO_MIGRATION_SLICES) {
    lines.push(`| ${slice} | 0 | — |`);
  }
  lines.push("");

  for (const [family, familyRows] of byFamily) {
    lines.push(`## 2H-${family}`, "", "| Requirement | Status | Evidence |", "| --- | --- | --- |");
    for (const row of familyRows) {
      let evidence;
      if (row.status === "not delivered") {
        evidence = `**${row.reason}** → ${row.destination}`;
      } else if (row.status === "partially delivered") {
        evidence =
          `${row.evidence.map((name) => `\`${name}\``).join(", ")}` +
          ` — delivered: ${row.delivered}; **remaining: ${row.remaining}** → ${row.destination}`;
      } else {
        evidence = row.evidence.map((name) => `\`${name}\``).join(", ");
      }
      lines.push(`| \`${row.id}\` | ${row.status} | ${evidence} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function main(root = REPOSITORY_ROOT) {
  const problems = findings(root);
  if (problems.length > 0) {
    console.error("Phase 2H traceability refused to generate:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(join(root, MATRIX_OUTPUT_PATH), `${renderMatrix(root)}\n`, "utf8");
  console.log(`wrote ${MATRIX_OUTPUT_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
