/**
 * Phase 2K's traceability generator (`2K-CLOSE-001`).
 *
 * Fail-closed: it refuses to emit a matrix when anything is unresolved, and a
 * refusal is a non-zero exit with every finding named — not the first one.
 *
 * ## Three rules it does NOT inherit from Phase 2J's generator
 *
 * Phase 2J's version maps each family to exactly one owning slice and fails
 * when a requirement is evidenced elsewhere. Phase 2K's own contract expects
 * two families to be cross-slice by design — `2K-PRIVACY` is declared
 * "cross-cutting; 2K.1/2K.4/2K.5" and `2K-A11Y` is declared "executed per
 * slice" — so that rule is replaced by a stricter one that does not depend on
 * ownership: **exactly one classifying row per requirement, anywhere.**
 *
 * A row marked as deferred to a later slice is **not** a classification. Slice
 * records written before this generator existed use the words "not claimed
 * here"; that is honoured as a deferral marker rather than failing as an
 * unknown class, because 2K.1's honest statement that `2K-PRIVACY-003/004`
 * land in 2K.4 must not become a refusal.
 *
 * And the class token is **normalized**, because the records qualify it in
 * prose — "baseline, re-proved", "built (contract) / baseline (tasks)". The
 * normalization is declared here rather than applied silently, and anything it
 * cannot resolve is a refusal.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Migration budget: ONE, allocated by OD-2K-C and authorized by ADR-101.
 *
 * The ceiling was never an obligation — `1 allocated · 0 spent` would have been
 * a legitimate close — but telemetry cannot be delivered honestly without a
 * database that names the events.
 */
export const MIGRATION_BUDGET = Object.freeze({
  allocated: 1,
  bySlice: Object.freeze({
    "2K.8": "202608090088_phase_2k_conversation_telemetry.sql",
  }),
});

export const SLICE_FILES = Object.freeze({
  "2K.0": "PHASE_2K_SLICE_00_ACCEPTANCE.md",
  "2K.1": "PHASE_2K_SLICE_01_ACCEPTANCE.md",
  "2K.2": "PHASE_2K_SLICE_02_ACCEPTANCE.md",
  "2K.3": "PHASE_2K_SLICE_03_ACCEPTANCE.md",
  "2K.4": "PHASE_2K_SLICE_04_ACCEPTANCE.md",
  "2K.5": "PHASE_2K_SLICE_05_ACCEPTANCE.md",
  "2K.6": "PHASE_2K_SLICE_06_ACCEPTANCE.md",
  "2K.8": "PHASE_2K_SLICE_08_ACCEPTANCE.md",
});

const CLASSES = new Set(["built", "baseline", "partial", "not-built-by-rule", "undelivered"]);

/**
 * Markers meaning "a later slice owns this", which are not classifications.
 *
 * `not claimed here` is what slices 2K.1–2K.6 wrote before this generator
 * existed. Honoured rather than refused, and named here so the remap is a
 * recorded decision instead of a silent tolerance.
 */
const DEFERRALS = ["not claimed here", "deferred"];

/** A partial or undelivered claim must say where the remainder goes. */
/*
 * What counts as naming where the remainder goes. "later slice" is here
 * because it is the accessibility lane's real answer: `2K-A11Y-001` is
 * extended inside each slice by design, so its remainder at any point is
 * the surfaces the later slices add.
 */
const DESTINATION = /[Dd]estination|[Rr]emainder|deferred to|routed to|see §|successor|later slice|2K\.\d/;

const DECLARATION = /^- \*\*(2K-[A-Z0-9]+-\d{3}):\*\*/gm;
/** `| \`id\` | **class** | evidence |` — the shape every slice record uses. */
/*
 * The first bold token is the classification; anything after it and before
 * the next pipe is the record qualifying it in prose — "(contract) /
 * **baseline** (tasks)". A regex that demanded the pipe immediately after
 * the bold would silently skip those rows, which reads as "classified
 * nowhere" and is the worst possible failure for a completeness check.
 */
const EVIDENCE = /^\|\s*`(2K-[A-Z0-9]+-\d{3})`\s*\|\s*\*\*([^*]+)\*\*[^|]*\|([^|]*(?:\|[^|]*)*?)\|\s*$/gm;

/**
 * Normalizes a qualified class token to one of the five.
 *
 * Returns `null` for a deferral and `undefined` for anything unrecognised, so
 * the caller can tell "a later slice owns this" from "somebody invented a
 * classification".
 */
export function normalizeClass(raw) {
  const text = raw.trim().toLowerCase();
  if (DEFERRALS.some((marker) => text.startsWith(marker))) return null;
  // Cut at the first qualifier: "baseline, re-proved" → "baseline";
  // "built (contract) / baseline (tasks)" → "built".
  const head = text.split(/[,(/]/)[0].trim();
  return CLASSES.has(head) ? head : undefined;
}

/**
 * Requirements whose evidence lives in slice 2K.0's record, which predates the
 * claims-table format every later slice uses.
 *
 * Declared here rather than parsed, and each cites the section of that record
 * carrying the evidence. This is a **remap of a format**, not an assertion of a
 * classification the record does not support: 2K.0 measured all six and its
 * acceptance report states each outcome in prose.
 */
export const SLICE_00_CLASSIFICATIONS = Object.freeze({
  "2K-AUDIT-001": ["built", "PHASE_2K_CURRENT_EXPERIENCE_AUDIT.md — every claim cites a file, line, migration, constraint, guard or executed command"],
  "2K-AUDIT-002": ["partial", "PHASE_2K_SLICE_00_ACCEPTANCE.md — M1 and M3 measured; M2's structural half measured and its provider-prose half recorded NOT PROVED. Remainder: the prose a zero-source answer produces, which needs a credential ADR-101 does not authorize spending. Destination: narrowed by 2K.4 and carried past close"],
  "2K-AUDIT-003": ["built", "PHASE_2K_SLICE_00_ACCEPTANCE.md — `migration list --linked` executed, local = remote = 202608080087 across 87 migrations; re-proved again at the start of every slice"],
  "2K-AUDIT-004": ["built", "docs/DECISIONS.md ADR-099 — the widening retires; today's retrieval over entries and memories is untouched"],
  "2K-AUDIT-005": ["built", "docs/DECISIONS.md ADR-099 — the closed list of resumption conditions, and no renewal date, deliberately"],
  "2K-AUDIT-006": ["built", "docs/DECISIONS.md ADR-099 — the spike is permitted by ADR-055, is not a 2K deliverable, authorizes no infrastructure and needs its own authorization"],
});

export function buildPhase2kTraceability({ root = REPOSITORY_ROOT } = {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const prdPath = join(root, "docs/initiatives/phase-2k/PHASE_2K_PRD.md");
  if (!existsSync(prdPath)) {
    // Fail-closed: a missing PRD is a refusal, never an empty matrix.
    throw new Error("docs/initiatives/phase-2k/PHASE_2K_PRD.md does not exist");
  }
  const prd = readFileSync(prdPath, "utf8");

  const declared = [...prd.matchAll(DECLARATION)].map((match) => match[1]);
  if (declared.length === 0) {
    throw new Error("the PRD declares no 2K- requirement; extraction produced an empty set");
  }
  const declaredSet = new Set(declared);
  if (declaredSet.size !== declared.length) {
    fail(`R2: the PRD declares a requirement more than once (${declared.length} declarations, ${declaredSet.size} unique)`);
  }

  // R14: no successor-phase requirement may appear.
  const foreign = [...prd.matchAll(/^- \*\*(2[A-JL-Z]-[A-Z0-9]+-\d{3}):\*\*/gm)].map((m) => m[1]);
  if (foreign.length > 0) {
    fail(`R14: the Phase 2K PRD declares requirements outside the 2K- namespace: ${foreign.join(", ")}`);
  }

  const evidence = new Map();
  const deferred = new Map();

  /*
   * A requirement re-classified by a later slice, declared rather than tolerated.
   *
   * `2K-CARD-008` was classified in 2K.1 and re-classified in 2K.3, which
   * extended the rule: `mayRenderMutatingControl` moved from re-deriving
   * mutability off the card type to reading the card's own field, because a
   * memory reached as a REFERENCE is read-only even though a memory card may
   * mutate.
   *
   * R2 forbids one id appearing twice, and it is right to. What it did not
   * anticipate is a later slice legitimately superseding an earlier
   * classification of the same requirement. Resolving that silently by "last
   * wins" would make R2 unenforceable; refusing would make correct work
   * unclosable. So the supersession is DECLARED here, the later slice wins, and
   * the matrix says so in the row itself.
   */
  const SUPERSEDED = new Map([
    ["2K-CARD-008", { by: "2K.3", from: "2K.1" }],
    /*
     * `2K-A11Y-001` is declared "extended as each slice lands, **not** at
     * closeout". Slice 2K.1 classified it `partial, in progress by design`,
     * which was true of 2K.1 and is the honest thing for a requirement that
     * completes by accretion. Slice 2K.8 runs the final sweep, so it is where
     * the requirement actually resolves — and where its true classification
     * belongs.
     */
    ["2K-A11Y-001", { by: "2K.8", from: "2K.1" }],
  ]);

  for (const [id, [klass, citation]] of Object.entries(SLICE_00_CLASSIFICATIONS)) {
    evidence.set(id, { slice: "2K.0", klass, citation });
  }

  for (const [slice, file] of Object.entries(SLICE_FILES)) {
    const path = join(root, "docs/reports/phase-2k", file);
    if (!existsSync(path)) {
      fail(`R16: slice ${slice}'s acceptance record is missing: ${file}`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(EVIDENCE)) {
      const [, id, rawClass, citation] = match;
      const klass = normalizeClass(rawClass);

      if (klass === null) {
        deferred.set(id, [...(deferred.get(id) ?? []), slice]);
        continue;
      }
      if (klass === undefined) {
        fail(`R6: ${id} carries an unrecognised class "${rawClass.trim()}" in ${slice}`);
        continue;
      }
      const supersession = SUPERSEDED.get(id);
      if (evidence.has(id) && !(supersession !== undefined && supersession.by === slice)) {
        fail(`R2: ${id} is classified twice (${evidence.get(id).slice} and ${slice})`);
        continue;
      }

      /*
       * A row that a later slice supersedes is recorded and then replaced, so
       * only the row that WINS is validated.
       *
       * Validating the loser too is how `2K-A11Y-001` failed R8: 2K.1 classified
       * it `partial` — correctly, for 2K.1 — and 2K.8 reclassifies it `built`
       * once the lane's final sweep runs. Demanding a destination from a
       * classification that no longer stands would refuse the matrix over a row
       * the matrix does not contain.
       */
      const isSuperseded = supersession !== undefined && supersession.by !== slice;
      if (isSuperseded) {
        evidence.set(id, { slice, klass, citation: citation.trim() });
        continue;
      }

      const cited = citation.trim();
      if (cited.length < 30) {
        fail(`R5: ${id}'s citation is too short to resolve: "${cited}"`);
      }
      if ((klass === "partial" || klass === "undelivered") && !DESTINATION.test(cited)) {
        // R8/R10. A partial without a destination is an undelivered requirement
        // with better wording; an undelivered one without a destination is a
        // requirement quietly dropped.
        fail(`R8/R10: ${id} is "${klass}" but names no remainder or destination`);
      }
      if (klass === "not-built-by-rule" && !/ADR-\d{3}|OD-2K-[A-Z0-9]/.test(cited)) {
        fail(`R9: ${id} is "not-built-by-rule" but names no ADR or signed decision`);
      }
      evidence.set(id, {
        slice,
        klass,
        citation: supersession !== undefined && supersession.by === slice
          ? `${cited} *(supersedes the ${supersession.from} classification)*`
          : cited,
      });
    }
  }

  // R1, both directions.
  for (const id of declared) {
    if (!evidence.has(id)) {
      const where = deferred.get(id);
      fail(where
        ? `R1: ${id} is deferred by ${where.join(", ")} and classified nowhere`
        : `R1: ${id} is declared in the PRD and classified nowhere`);
    }
  }
  for (const id of evidence.keys()) {
    if (!declaredSet.has(id)) fail(`R4: ${id} is classified but the PRD does not declare it`);
  }

  // R13: budget reconciliation, per slice.
  const migrations = readdirSync(join(root, "supabase/migrations")).filter((name) => /phase_2k/i.test(name));
  const expected = Object.values(MIGRATION_BUDGET.bySlice);
  for (const name of migrations) {
    if (!expected.includes(name)) fail(`R13: an unbudgeted Phase 2K migration exists: ${name}`);
  }
  if (migrations.length > MIGRATION_BUDGET.allocated) {
    fail(`R13: Phase 2K spent ${migrations.length} migrations against a budget of ${MIGRATION_BUDGET.allocated}`);
  }

  // R15: a signed decision may not be quietly relitigated by a matrix row.
  /*
   * R15 fires on an ASSERTION, never on its denial.
   *
   * The first draft flagged `2K-ACT-009` for the words "never states that it
   * was deleted" and `2K-AUDIT-005` for "no renewal date, deliberately" —
   * sentences that keep the signed decision rather than relitigate it. A guard
   * that fires on the decision being upheld is worse than no guard, because it
   * teaches the next author to soften the record until the check goes quiet.
   *
   * So each pattern is stripped of negated clauses first, and only what
   * survives is tested.
   */
  const withoutDenials = (text) => text
    .replace(/\b(never|not|no|none|nunca|rather than|instead of|neither|negatively)\b[^.;]*/gi, " ");

  for (const [id, row] of evidence) {
    const asserted = withoutDenials(row.citation);
    if (/^2K-ACT-00[89]$/.test(id) && /\bdeleted\b|\berased\b|physically removes/i.test(asserted)) {
      fail(`R15: ${id} describes deletion; OD-2K-3 signed archival`);
    }
    if (/^2K-PRIVACY-00[34]$/.test(id) && /persists an excerpt|stored classification/i.test(asserted)) {
      fail(`R15: ${id} cites a persisted excerpt or a stored classification; OD-2K-2 removed both`);
    }
    if (/^2K-AUDIT-00[45]$/.test(id) && /renewed|renewal date is written/i.test(asserted)) {
      fail(`R15: ${id} describes an ADR-055 renewal; OD-2K-6 retired the widening`);
    }
  }

  // R17: continuity may never transport a reusable authorization.
  const continuity = readFileSync(join(root, "src/features/conversation-cards/continuity.ts"), "utf8");
  const schema = continuity.match(/const handleSchema = z[\s\S]*?\.strict\(\);/)?.[0] ?? "";
  if (schema === "") fail("R17: the continuity payload schema could not be located");
  for (const forbidden of ["issuedAt", "observedBefore", "confirmationId", "operationKey", "requestFingerprint"]) {
    if (new RegExp(`${forbidden}\\s*:`).test(schema)) {
      fail(`R17: the continuity payload declares ${forbidden}`);
    }
  }

  if (failures.length > 0) {
    const error = new Error(`refusing to write the matrix: ${failures.length} unresolved finding(s)`);
    error.failures = failures;
    throw error;
  }

  const counts = {};
  for (const { klass } of evidence.values()) counts[klass] = (counts[klass] ?? 0) + 1;

  return { declared, evidence, deferred, counts, migrations, failures };
}

export function renderMatrix(result) {
  const lines = [];
  lines.push("# Phase 2K — Traceability matrix");
  lines.push("");
  lines.push("**Generated** by `scripts/generate-phase-2k-traceability.mjs`, which refuses to emit");
  lines.push("anything when a requirement is unclassified, classified twice, classified without a");
  lines.push("resolvable citation, or classified in a way that contradicts a signed decision.");
  lines.push("");
  lines.push(`**${result.declared.length} requirements declared · ${result.evidence.size} classified · 0 unclassified.**`);
  lines.push("");
  const order = ["built", "baseline", "partial", "not-built-by-rule", "undelivered"];
  lines.push(order.map((k) => `${result.counts[k] ?? 0} ${k}`).join(" · "));
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

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("generate-phase-2k-traceability.mjs");
if (invokedDirectly) {
  try {
    const result = buildPhase2kTraceability();
    const out = join(REPOSITORY_ROOT, "docs/reports/phase-2k/PHASE_2K_TRACEABILITY_MATRIX.md");
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
