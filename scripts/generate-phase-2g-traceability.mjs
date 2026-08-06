/**
 * Phase 2G traceability generator — 2G-CLOSE-001.
 *
 * Writes `docs/reports/phase-2g/PHASE_2G_TRACEABILITY_MATRIX.md` from
 * `docs/initiatives/phase-2g/PHASE_2G_PRD.md` and from the artifacts the
 * repository actually holds.
 *
 * ## Fail-closed, and what that means here
 *
 * It inherits the rule the Phase 2F and Signup Hardening generators set:
 * **derive what can be derived, resolve what is declared, and fail rather than
 * print an unresolved claim.** A traceability matrix that prints a status
 * somebody typed is a document asserting that somebody once typed it.
 *
 * What is derived rather than declared:
 *
 *   * the inventory comes from the PRD's own declaration shape
 *     (`- **2G-FAMILY-000:**`), so a requirement living only in prose is not
 *     counted as declared;
 *   * **delivery is evidenced by citation** — a requirement counts as
 *     delivered when an acceptance record under `docs/reports/phase-2g/` names
 *     its id. That is a real artifact resolved on disk, not a column;
 *   * the migration budget is read from the chain, not restated: Phase 2G is
 *     allocated exactly one, and a second `phase_2g` migration is a finding
 *     even if every other check passes.
 *
 * What must be declared, because no artifact can imply it: a requirement that
 * is **not** delivered. Those live in `UNDELIVERED` below, each with a reason
 * and a destination, and the generator cross-checks them both ways — an id
 * declared undelivered while an acceptance record claims it is a finding, and
 * so is an id that is neither cited nor declared. That pair is the whole point
 * (2G-CLOSE-001): a closeout that quietly omits a requirement is exactly what
 * this exists to prevent.
 *
 * Every function takes an explicit `root` so the tests can run it against
 * fixture repositories carrying one deliberate defect each — and against the
 * real one as a positive control, because a guard proven only in the failing
 * direction may be refusing everything.
 *
 * No shebang: the closeout test imports this module, and the bundler refuses
 * `#!` in a file it has wrapped.
 *
 * Usage: `npm run docs:phase-2g:traceability`
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PRD_PATH = "docs/initiatives/phase-2g/PHASE_2G_PRD.md";
export const REPORTS_DIR = "docs/reports/phase-2g";
export const MATRIX_OUTPUT_PATH = `${REPORTS_DIR}/PHASE_2G_TRACEABILITY_MATRIX.md`;

/** ADR-083's budget, spent by 2G.3. A second one is an owner amendment. */
export const MIGRATION_BUDGET = 1;

/**
 * Requirements this phase did **not** deliver, each with its reason and its
 * destination.
 *
 * Declared here rather than derived, because nothing on disk can evidence an
 * absence. Cross-checked in both directions by `findings`.
 */
export const UNDELIVERED = Object.freeze({});

/**
 * Requirements this phase delivered **in part**, each with what landed, what is
 * still missing, and where the remainder lives.
 *
 * This category exists because the two-way split was lying in both directions.
 * At Phase 2G's close, `2G-ROUTE-008` and `2G-CLOSE-003` were declared *not
 * delivered* on one blocker: hosted CAPTCHA had made every authenticated online
 * journey unrunnable, so nothing could be executed against the deployment. The
 * online-session harness maintenance that followed resolved that blocker — the
 * journeys now run — and a second, unrelated one was found underneath it:
 * SH.4's consent gate had been interposing on every admin-created fixture
 * account since it shipped, independently of Turnstile.
 *
 * With both cleared, calling these two "not delivered" understates what exists,
 * and calling them "delivered" would claim a conversational-creation journey
 * that still cannot make a provider call. **Partial, with the single remaining
 * blocker named**, is the only description that is true — and a partial must
 * still be *cited* by an acceptance record, so it cannot be used to smuggle an
 * unevidenced claim past the citation rule.
 */
export const PARTIAL = Object.freeze({
  "2G-ROUTE-008": {
    delivered:
      "the authenticated online journeys execute against the deployed project again — "
      + "80 of 87 cases pass and none fails, on a session fixture proven in both directions",
    remaining:
      "the conversational-creation journey itself (sentence → preview → confirm → task → undo) "
      + "still cannot run: every turn is a provider call under BYOK and "
      + "BYOK_TEST_USER_A_OPENAI_API_KEY is not provisioned",
    destination: "PHASE_2G_ONLINE_HARNESS_ACCEPTANCE.md — one owner action, a disposable provider credential",
  },
  "2G-CLOSE-003": {
    delivered:
      "the authenticated journey set runs against the deployed project on disposable fixtures "
      + "that are created and deleted per spec, with the funnel statement already recorded",
    remaining:
      "the conversational-creation subset of that set, for the same single credential reason",
    destination: "PHASE_2G_ONLINE_HARNESS_ACCEPTANCE.md — the same owner action",
  },
});

/** The inventory, from the PRD's own declaration shape. */
export function parseRequirements(root) {
  const prd = readFileSync(join(root, PRD_PATH), "utf8");
  const ids = [];
  for (const line of prd.split("\n")) {
    const match = /^- \*\*(2G-[A-Z]+-\d{3}):\*\*/.exec(line.trim());
    if (match) ids.push(match[1]);
  }
  return ids;
}

/**
 * The documents whose purpose is to record what was **delivered**.
 *
 * Narrower than "every markdown file here", and the first run of this
 * generator is why: a blocker report legitimately *names* the requirement it
 * reports as blocked, and a threat model names the ones its mitigations serve.
 * Counting those as delivery evidence would let a document saying "this did
 * not happen" satisfy the requirement it was describing — the exact inversion
 * a traceability matrix exists to prevent.
 */
export function reportFiles(root) {
  const dir = join(root, REPORTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /_(ACCEPTANCE|DEPLOYMENT)\.md$/.test(name))
    .sort();
}

/** Which records cite a given requirement id. Evidence, resolved on disk. */
export function citationsFor(root, id) {
  return reportFiles(root).filter((name) =>
    readFileSync(join(root, REPORTS_DIR, name), "utf8").includes(id),
  );
}

/** Migrations this phase spent, read from the chain rather than restated. */
export function phaseMigrations(root) {
  const dir = join(root, "supabase/migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => /phase_2g/i.test(name)).sort();
}

export function classify(root, id) {
  const cited = citationsFor(root, id);
  const undelivered = UNDELIVERED[id];
  if (undelivered) {
    return { id, status: "not delivered", evidence: cited, ...undelivered };
  }
  const partial = PARTIAL[id];
  if (partial) {
    // A partial still owes evidence. Without this, "partial" would be a way to
    // assert half a delivery with nothing on disk behind it — which is exactly
    // the unevidenced claim the citation rule exists to refuse.
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

export function findings(root) {
  const problems = [];
  const ids = parseRequirements(root);

  if (ids.length === 0) {
    // The failure mode every parser-backed guard has: the anchor changes, the
    // list comes back empty, and the report describes nothing while looking
    // complete.
    problems.push("the PRD yielded no declared requirements — the declaration anchor has drifted");
    return problems;
  }

  for (const id of ids) {
    const row = classify(root, id);
    if (row.status === "unresolved") {
      problems.push(
        PARTIAL[id]
          ? `${id} is declared partially delivered but no acceptance record cites it`
          : `${id} is neither cited by an acceptance record nor declared undelivered`,
      );
    }
    // Deliberately NOT a finding: an acceptance record naming a requirement in
    // order to say it was not delivered. The first cut treated any mention as
    // a contradiction, which made the honest sentence — "2G-ROUTE-008 is not
    // delivered, here is why" — impossible to write in the document whose job
    // is to say it. An explicit declaration wins over a mention, because a
    // human wrote the declaration with a reason and a destination attached.
  }

  // A declared exception for an id the PRD does not declare is a stale entry,
  // and a stale exception is how an inventory quietly shrinks.
  for (const id of Object.keys(UNDELIVERED)) {
    if (!ids.includes(id)) problems.push(`${id} is declared undelivered but the PRD does not declare it`);
    if (PARTIAL[id]) problems.push(`${id} is declared both undelivered and partially delivered`);
  }
  for (const id of Object.keys(PARTIAL)) {
    if (!ids.includes(id)) {
      problems.push(`${id} is declared partially delivered but the PRD does not declare it`);
    }
  }

  const migrations = phaseMigrations(root);
  if (migrations.length > MIGRATION_BUDGET) {
    problems.push(
      `Phase 2G spent ${migrations.length} migrations against a budget of ${MIGRATION_BUDGET}: ${migrations.join(", ")}`,
    );
  }

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
    "# Phase 2G traceability matrix",
    "",
    "**Generated — do not edit by hand.** `npm run docs:phase-2g:traceability`",
    "rewrites this file and fails rather than print an unresolved claim, so an",
    "edit here produces a status nothing checked (2G-CLOSE-001).",
    "",
    `Delivery is evidenced by **citation**: a requirement is delivered when an`,
    `acceptance record under \`${REPORTS_DIR}/\` names its id. A requirement that`,
    "is not delivered must be declared in the generator with a reason and a",
    "destination, and the generator refuses an id that is neither. A requirement",
    "that is **partially delivered** must be declared *and* cited — the",
    "declaration says what is still missing, the citation proves the rest landed.",
    "",
    `- **${ids.length}** requirements declared`,
    `- **${delivered.length}** delivered`,
    `- **${partial.length}** partially delivered, each with its single remaining blocker named`,
    `- **${undelivered.length}** not delivered, each named with a destination`,
    `- **${migrations.length}** of ${MIGRATION_BUDGET} budgeted migrations spent`
      + (migrations.length ? `: \`${migrations.join("`, `")}\`` : ""),
    "",
  ];

  for (const [family, familyRows] of byFamily) {
    lines.push(`## 2G-${family}`, "", "| Requirement | Status | Evidence |", "| --- | --- | --- |");
    for (const row of familyRows) {
      let evidence;
      if (row.status === "not delivered") {
        evidence = `**${row.reason}** → ${row.destination}`;
      } else if (row.status === "partially delivered") {
        evidence = `${row.evidence.map((name) => `\`${name}\``).join(", ")}`
          + ` — delivered: ${row.delivered}; **remaining: ${row.remaining}** → ${row.destination}`;
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
    console.error("Phase 2G traceability refused to generate:");
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
