/**
 * Phase 2F traceability generator (PRD `2F-OPERATIONS-003`, Slice 2F.6).
 *
 * Writes `docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md` from `docs/PHASE_2F_PRD.md`
 * and from the repository artifacts the matrix claims as evidence.
 *
 * How this differs from the four generators before it, and why
 * ------------------------------------------------------------
 * `generate-phase-2c/2d/2e/2x-traceability.mjs` each hold a hand-written
 * evidence map and print it beside a parsed requirement inventory. That catches
 * inventory drift and nothing else: the artifact names, the slice ownership and
 * the statuses are all strings nobody resolves. `PHASE_2E_SLICE_08_REPORT.md`
 * §4.2 already named the failure mode this leaves open — a verifier that has
 * never touched the thing it describes — and Slice 2F.5 hit it three times in
 * one slice (`docs/STATE.md:29`: "a guard which reads its own input proves
 * nothing").
 *
 * So this generator **derives** everything it can and **resolves** everything it
 * declares:
 *
 *   * the requirement inventory is parsed from §6 by a stated, declaration-
 *     anchored rule, and every `2F-` ID *referenced* inside §6 must resolve to a
 *     declared one (a typo'd cross-reference is a real class);
 *   * slice ownership is derived from §7's own table as **two relations** —
 *     `owns` (at most one slice) and `owed` (many) — because §7's "Owns" column
 *     covers 61 of the 68 requirements and seven are cross-cutting-only by
 *     design. A single-relation reading fires seven false failures;
 *   * every artifact path in the evidence map is resolved on disk, and every
 *     `npm run` gate is resolved in `package.json`;
 *   * migrations are read out of `supabase/migrations/` and attributed;
 *   * ADR coverage is read out of `docs/DECISIONS.md`;
 *   * per-slice acceptance artifacts are read out of `docs/reports/`;
 *   * CI gates resolve two different ways — a job-level gate to a workflow job
 *     *and step*, a suite-level gate to a file on disk that is *inside a path
 *     the workflow actually executes*. The second leg is what makes ADR-059's
 *     hazard mechanical: a suite swept out of `vitest.config.ts` fails here;
 *   * §10's gate ledger is cross-checked so `2F-PRECOND-003` has a mechanical
 *     partner rather than only a manual sweep.
 *
 * Every function below takes an explicit `root`, so the tests can run it against
 * fixture repositories carrying one deliberate defect each — and against correct
 * fixtures as positive controls, because a guard proven only in the failing
 * direction may be refusing everything.
 *
 * Usage: `npm run docs:phase-2f:traceability`
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The generator's own output, and the one evidence path it cannot require to pre-exist. */
export const MATRIX_OUTPUT_PATH = "docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md";

/** The inventory the phase PRD declares for itself (§6, §14 Revision 4 "B2"). */
export const EXPECTED_REQUIREMENT_TOTAL = 68;

export const EXPECTED_FAMILY_COUNTS = Object.freeze({
  "2F-GUARD": 3,
  "2F-DECISION": 4,
  "2F-PRECOND": 3,
  "2F-SURFACE": 14,
  "2F-CREATE": 6,
  "2F-REMINDER": 4,
  "2F-REVOKE": 8,
  "2F-TESTMIG": 8,
  "2F-MEASURE": 7,
  "2F-OWNERSHIP": 2,
  "2F-ANALYTICS": 3,
  "2F-OPERATIONS": 6,
});

export const SLICES = Object.freeze(["2F.1", "2F.2", "2F.3", "2F.4", "2F.5", "2F.6"]);

/**
 * The two Phase 2F migrations and the slice each belongs to (PRD §7: "Migrations
 * expected in the whole phase: exactly two"). Attribution is checked against the
 * files actually present, so a third migration or a renamed one fails the run.
 */
export const EXPECTED_PHASE_2F_MIGRATIONS = Object.freeze({
  "202607290062_phase_2f_creation_origin.sql": "2F.3",
  "202607300063_phase_2f_task_grant_revocation.sql": "2F.4",
});

/**
 * Non-`2F-` requirement IDs the phase PRD is *allowed* to reference, each with
 * the reason. A reference outside this set fails the run; a *declaration* of any
 * non-`2F-` ID fails regardless (that is the Phase-2G attribution guard, and it
 * has to distinguish the two or it reds the build on merged content).
 */
export const PERMITTED_FOREIGN_REFERENCES = Object.freeze({
  "2E-COMMAND-012": "deferred past Phase 2F by ADR-057; 2F-DECISION-004 records the deferral and its reopening gate",
  "2E-MATCH-018": "its scope caveat is discharged by 2F-MEASURE-007's like-for-like measurement (ADR-059)",
});

/**
 * Evidence per family, keyed as the definitive Slice 2F.6 PRD §27.1 keys them.
 *
 * `artifacts` and `acceptance` are **paths**, resolved on disk. `gates` are
 * resolved by kind. Nothing here is a status: statuses are derived below.
 */
export const EVIDENCE_KEYS = Object.freeze({
  "E-GUARD": {
    source: "PRD §6.1",
    artifacts: [
      "src/lib/supabase/sql-grammar-guard.test.ts",
      "src/lib/supabase/direct-write-guard.test.ts",
    ],
    verification: "red-first defective fixtures; tasks/reminders allowlists compared by exact equality in both directions",
    gates: [{ kind: "suite", file: "src/lib/supabase/direct-write-guard.test.ts" }],
    acceptance: ["docs/reports/PHASE_2F_SLICE_01_REPORT.md"],
  },
  "E-DECISION": {
    source: "PRD §6.2",
    artifacts: ["docs/DECISIONS.md", "docs/TODO.md"],
    verification: "ADR headings and requirement-ID citations derived from DECISIONS.md; the dated expiry entry re-computed by expiryDateFromGoLive",
    gates: [{ kind: "suite", file: "src/lib/closeout/phase-2f-documentation.test.ts" }],
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_01_REPORT.md",
      "docs/reports/PHASE_2F_SLICE_05_ACCEPTANCE.md",
    ],
  },
  "E-PRECOND": {
    source: "PRD §6.3",
    artifacts: [
      "scripts/phase-2f-writer-inventory.mjs",
      "scripts/phase-2f-reminder-census.mjs",
      "scripts/phase-2f-gate3-exact-title-reuse.mjs",
      "scripts/phase-2f-gate1-record-ai-usage-dry-run.sql",
      "src/features/task-commands/work-surface-reuse.test.ts",
      "supabase/tests/phase_2f_effective_limit.sql",
    ],
    verification: "the four gate artifacts resolved on disk; the static suite runs continuously in CI; effective_limit clamping pinned by pgTAP; §10 cell-to-session sweep (A14)",
    gates: [
      { kind: "suite", file: "src/features/task-commands/work-surface-reuse.test.ts" },
      { kind: "pgtap", file: "supabase/tests/phase_2f_effective_limit.sql" },
    ],
    acceptance: ["docs/reports/PHASE_2F_SLICE_01_REPORT.md"],
  },
  "E-SURFACE": {
    source: "PRD §6.4, §5",
    artifacts: [
      "src/features/task-commands/work-command.ts",
      "src/features/operations/task-list.tsx",
      "src/features/operations/work-action-state.ts",
      "src/features/operations/work-actions-copy.ts",
    ],
    verification: "work-command.test.ts; task-list.test.tsx (keyboard, focus, live region); work-surface-reuse.test.ts static mapping/eligibility/vocabulary proofs",
    gates: [
      { kind: "suite", file: "src/features/task-commands/work-command.test.ts" },
      { kind: "suite", file: "src/features/operations/task-list.test.tsx" },
      { kind: "session", slice: "2F.2", note: "authenticated journeys 32/32, desktop+mobile × pt-BR+en" },
    ],
    acceptance: ["docs/reports/PHASE_2F_SLICE_02_ACCEPTANCE.md"],
  },
  "E-CREATE": {
    source: "PRD §6.5, §6.5a",
    artifacts: [
      "supabase/migrations/202607290062_phase_2f_creation_origin.sql",
      "src/features/task-commands/creation.ts",
      "src/features/tasks/actions.ts",
      "e2e/manual-task-creation.spec.ts",
    ],
    verification: "phase_2e_task_command_creation.sql; the two-owner creation probe against the deployed contract, including a user-origin creation and its executed undo",
    gates: [
      { kind: "pgtap", file: "supabase/tests/phase_2e_task_command_creation.sql" },
      { kind: "session", slice: "2F.3", note: "21 deployment-session gates" },
    ],
    acceptance: ["docs/reports/PHASE_2F_SLICE_03_ACCEPTANCE.md"],
  },
  "E-REMINDER": {
    source: "PRD §6.6",
    artifacts: [
      "docs/SECURITY.md",
      "docs/DATABASE.md",
      "supabase/migrations/202607300063_phase_2f_task_grant_revocation.sql",
      "src/features/agent/actions.ts",
    ],
    verification: "the reminders allowlist holds exactly the Option C exception by exact equality; phase_2f_task_write_grants.sql proves the retained INSERT and the revoked UPDATE/DELETE; census buckets 5–7 measure the dormancy and the independent population",
    gates: [
      { kind: "suite", file: "src/lib/supabase/direct-write-guard.test.ts" },
      { kind: "pgtap", file: "supabase/tests/phase_2f_task_write_grants.sql" },
      { kind: "npm", script: "test:remote:2f:census" },
    ],
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_03_ACCEPTANCE.md",
      "docs/reports/PHASE_2F_SLICE_04_ACCEPTANCE.md",
    ],
  },
  "E-REVOKE": {
    source: "PRD §6.7, §12",
    artifacts: [
      "supabase/migrations/202607300063_phase_2f_task_grant_revocation.sql",
      "scripts/phase-2f-regrant-task-write-grants.sql",
      "supabase/regrant-rehearsal/phase_2f_regrant_restores_writes.sql",
      ".github/workflows/ci.yml",
    ],
    verification: "phase_2f_task_write_grants.sql proves the denial non-vacuously by re-issuing the chain's own grants inside its transaction, watching the refusals succeed, re-revoking and watching them refuse again",
    gates: [
      { kind: "pgtap", file: "supabase/tests/phase_2f_task_write_grants.sql" },
      {
        kind: "ci-step",
        job: "database",
        step: "Rehearse the re-grant rollback (SQL-level only; not a live-ops rehearsal)",
      },
      { kind: "session", slice: "2F.4", note: "16 deployment-acceptance gates" },
    ],
    acceptance: ["docs/reports/PHASE_2F_SLICE_04_ACCEPTANCE.md"],
  },
  "E-TESTMIG": {
    source: "PRD §6.8, §9",
    artifacts: [
      "supabase/tests/phase_2e_task_command_apply.sql",
      "supabase/tests/phase_2e_task_command_creation.sql",
      "supabase/tests/phase_2c_slice_5_task_graph.sql",
      "supabase/tests/phase_2f_task_write_grants.sql",
      "scripts/remote-supabase-smoke.mjs",
      "scripts/remote-phase-2e-smoke.mjs",
      "scripts/remote-editable-candidate-confirmation-smoke.mjs",
    ],
    verification: "all 13 §9 dispositions landed — 10 changed vehicle, 3 reminder INSERTs stayed authenticated under Option C; the full pgTAP suite green on the chain applied from an empty database",
    gates: [
      { kind: "pgtap", file: "supabase/tests/phase_2e_task_command_apply.sql" },
      { kind: "ci-step", job: "database", step: "Run the pgTAP suite (post-revocation posture)" },
      { kind: "session", slice: "2F.4", note: "full remote suite, exit 0 from merged content" },
    ],
    acceptance: ["docs/reports/PHASE_2F_SLICE_04_ACCEPTANCE.md"],
  },
  "E-MEASURE": {
    source: "PRD §6.9",
    artifacts: [
      "scripts/phase-2f-command-funnel.mjs",
      "scripts/phase-2f-command-funnel-reader.mjs",
      "src/features/task-commands/end-to-end-match-baseline.remote.test.ts",
      "vitest.remote.config.ts",
    ],
    verification: "command-funnel.test.ts derives the unreachable preview set from the emitters in actions.ts rather than restating it; the funnel proof executed 32 assertions at exit 0; the baseline 9/9, stable across three runs",
    gates: [
      { kind: "suite", file: "src/features/product-analytics/command-funnel.test.ts" },
      { kind: "npm", script: "test:remote:2f:funnel" },
      { kind: "npm", script: "test:remote:2f:baseline" },
    ],
    acceptance: ["docs/reports/PHASE_2F_SLICE_05_ACCEPTANCE.md"],
  },
  "E-OWNERSHIP": {
    source: "PRD §6.10",
    artifacts: [
      "scripts/phase-2f-gate3-exact-title-reuse.mjs",
      "scripts/phase-2f3-creation-probe.mjs",
    ],
    verification: "the owner's own positive row count is asserted before the stranger's absence, in both directions, so no isolation half can pass vacuously",
    gates: [
      { kind: "session", slice: "2F.2", note: "two-owner mutation probe" },
      { kind: "session", slice: "2F.3", note: "two-owner creation probe" },
    ],
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_02_ACCEPTANCE.md",
      "docs/reports/PHASE_2F_SLICE_03_ACCEPTANCE.md",
    ],
  },
  "E-ANALYTICS": {
    source: "PRD §6.11",
    artifacts: [
      "src/features/task-commands/analytics.ts",
      "src/features/product-analytics/contracts.ts",
    ],
    verification: "commandOrigin 'work' was already allowlisted, so no migration exists; the content-free import guard and the bounded-vocabulary parity cases run in CI",
    gates: [
      { kind: "suite", file: "src/features/task-commands/analytics.test.ts" },
      { kind: "suite", file: "src/features/product-analytics/contracts.test.ts" },
    ],
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_02_ACCEPTANCE.md",
      "docs/reports/PHASE_2F_SLICE_03_ACCEPTANCE.md",
    ],
  },
  "E-OPERATIONS": {
    source: "PRD §6.12",
    artifacts: ["docs/STATE.md", "docs/CHANGELOG.md"],
    verification: "parity recorded before and after every deploying slice by `npx supabase migration list --linked`; CI conclusions read off the exact merge SHA with `gh run view`",
    gates: [{ kind: "session", slice: "2F.4", note: "parity 202607290062 → 202607300063" }],
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_02_ACCEPTANCE.md",
      "docs/reports/PHASE_2F_SLICE_03_ACCEPTANCE.md",
      "docs/reports/PHASE_2F_SLICE_04_ACCEPTANCE.md",
      "docs/reports/PHASE_2F_SLICE_05_ACCEPTANCE.md",
    ],
  },
  "E-TRACE": {
    source: "PRD §6.12",
    artifacts: [
      "scripts/generate-phase-2f-traceability.mjs",
      "docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md",
    ],
    verification: "fixture-root drift runs, one per declared failure class, each with a positive control proving the guard passes on correct content",
    gates: [
      { kind: "suite", file: "src/lib/closeout/phase-2f-traceability.test.ts" },
      { kind: "npm", script: "docs:phase-2f:traceability" },
    ],
    // Slice 2F.6's acceptance record cannot exist while its implementation PR is
    // open — merge SHA, merge date and post-merge results are not facts yet — so
    // the implementation PR cites the implementation report and the acceptance PR
    // adds the acceptance record beside it. The same two-PR shape Slices 2F.4 and
    // 2F.5 used, for the same reason.
    acceptance: ["docs/reports/PHASE_2F_SLICE_06_REPORT.md"],
  },
  "E-CLEAN": {
    source: "PRD §6.12; Slice 2F.5 PRD §22 handover",
    artifacts: [
      "scripts/verify-phase-2f-cleanup.mjs",
      "supabase/tests/phase_2f_task_write_grants.sql",
    ],
    verification: "the orphan predicate is an exported pure function proven over injected rows including a known orphan; the live run reports per-table row counts, scans user-files storage, asserts the two service-role refusals, and asserts the deferred objects absent",
    gates: [
      { kind: "suite", file: "src/lib/closeout/phase-2f-cleanup.test.ts" },
      { kind: "pgtap", file: "supabase/tests/phase_2f_task_write_grants.sql" },
      { kind: "npm", script: "test:remote:2f:cleanup" },
    ],
    acceptance: ["docs/reports/PHASE_2F_SLICE_06_REPORT.md"],
  },
  "E-CENSUS": {
    source: "PRD §6.12; owner decision 2",
    artifacts: ["scripts/phase-2f-reminder-census.mjs"],
    verification: "bucket predicates extracted as pure functions and covered in CI; a case asserts the file still issues no write; paging carries a total order on the primary key with exhaustion asserted",
    gates: [
      { kind: "suite", file: "src/lib/closeout/phase-2f-census.test.ts" },
      { kind: "npm", script: "test:remote:2f:census" },
    ],
    acceptance: ["docs/reports/PHASE_2F_SLICE_06_REPORT.md"],
  },
  "E-DOCS": {
    source: "PRD §6.12",
    artifacts: [
      "docs/STATE.md",
      "docs/TODO.md",
      "docs/CHANGELOG.md",
      "docs/DECISIONS.md",
      "docs/SECURITY.md",
      "docs/DATABASE.md",
      "docs/PHASE_2_PLAN.md",
      "docs/PHASE_2F_PRD.md",
      "docs/reports/PHASE_2F_REPORT.md",
    ],
    verification: "documentation-convergence cases that read the documents they assert about, including the dated expiry recomputed from go-live and the cross-document status contradiction scan",
    gates: [{ kind: "suite", file: "src/lib/closeout/phase-2f-documentation.test.ts" }],
    acceptance: ["docs/reports/PHASE_2F_SLICE_06_REPORT.md"],
  },
});

/** Family → evidence key, overridden per-ID where a requirement has its own artifact. */
export const FAMILY_EVIDENCE = Object.freeze({
  "2F-GUARD": "E-GUARD",
  "2F-DECISION": "E-DECISION",
  "2F-PRECOND": "E-PRECOND",
  "2F-SURFACE": "E-SURFACE",
  "2F-CREATE": "E-CREATE",
  "2F-REMINDER": "E-REMINDER",
  "2F-REVOKE": "E-REVOKE",
  "2F-TESTMIG": "E-TESTMIG",
  "2F-MEASURE": "E-MEASURE",
  "2F-OWNERSHIP": "E-OWNERSHIP",
  "2F-ANALYTICS": "E-ANALYTICS",
  "2F-OPERATIONS": "E-OPERATIONS",
});

export const REQUIREMENT_EVIDENCE_OVERRIDES = Object.freeze({
  "2F-OPERATIONS-003": "E-TRACE",
  "2F-OPERATIONS-004": "E-CLEAN",
  "2F-OPERATIONS-005": "E-CENSUS",
  "2F-OPERATIONS-006": "E-DOCS",
});

/**
 * Statuses that are not the plain `complete`. Every entry must carry a
 * `destination` when it is `partial` or `deferred`, because a deferral with no
 * destination is a disappearance. `note` records a scope the reader must carry
 * forward; a note alone does not make a requirement incomplete.
 */
export const STATUS_OVERRIDES = Object.freeze({
  "2F-MEASURE-001": {
    status: "complete",
    note: "refusal outcome classes ship; reason-level granularity is out of scope for this phase (the reason codes are not in the property allowlist)",
    destination: "reason-level refusal granularity — post-Phase-2F, requires a product-event allowlist widening",
  },
  "2F-MEASURE-002": {
    status: "complete",
    note: "ADR-058 adds `is_synthetic` as a fourth mechanism and classifies it as hygiene rather than a trust boundary; the orphan-event residual from a run that died before its cleanup is owned, not claimed away",
    destination: "the orphan residual is mitigated by 2F-OPERATIONS-004's verifier, delivered in Slice 2F.6",
  },
  "2F-MEASURE-003": {
    status: "complete",
    note: "the tier is computable and pinned; it is **not met** — the real owner's funnel is empty, which is evidence rather than a gap",
    destination: "the ≤3-day offline replay spike is authorized only if the tier is later met, before 2026-10-27",
  },
  "2F-MEASURE-004": {
    status: "complete",
    note: "computable to its ceiling `met_pending_privileged_read`; the distinct-user count is out of an owner-scoped reader's range by construction, and the tier is **not met**",
    destination: "the privileged distinct-user read is performed at ADR-055 evaluation time, not at closeout",
  },
  "2F-MEASURE-005": {
    status: "complete",
    note: "complete as to its normative claim — ADR-055 states the permanently non-authorizing list in the same breath as the thresholds — **with a recorded measurement partial**: the unsupported-refusal volume it names is not measurable this phase, because no deployed code path emits `unsupported`, `applied` or `rejected_conflict` on a preview event",
    destination: "an emitter for the three unreachable preview categories — post-Phase-2F",
  },
  "2F-MEASURE-006": {
    status: "complete",
    note: "dated 2026-10-27 from go-live 2026-07-29 by `expiryDateFromGoLive`, carried in docs/TODO.md and verified at closeout",
    destination: "the expiry ADR itself falls due 2026-10-27 if neither tier is met",
  },
  "2F-REVOKE-003": {
    status: "complete",
    note: "the CI rehearsal proves the committed rollback SQL applies and restores the versioned migration-chain privileges; it does **not** prove PostgREST schema-cache convergence, in-flight session behaviour, or an operational production rollback",
    destination: "an operational live-ops rehearsal is not planned; the live schema-cache residual was closed by measurement in the 2F.4 deployment session instead",
  },
  "2F-REVOKE-004": {
    status: "complete",
    note: "the evidence loss is stated rather than implied — write-side RLS on public.tasks became untestable from a client role, because the grant check precedes any policy; the compensating evidence is read-side RLS proven in both directions plus RPC-boundary denial",
    destination: "none; the loss is permanent and accepted (owner decision A5)",
  },
  "2F-REMINDER-004": {
    status: "complete",
    note: "the requirement asks for the dormancy to be recorded and deferred, not retired; DATABASE.md carries it and the undo handlers' snoozed branches stay covered so they remain falsifiable",
    destination: "retiring the `snoozed` literal — post-Phase-2F, requires a migration and proof that no row carries it",
  },
  "2F-PRECOND-003": {
    status: "complete",
    note: "discharged by Slice 2F.6's A14 sweep of §10's gate ledger, which filed two dispositions: 2F.5's `database` cell was `—` although the slice added three pgTAP assertions, and 2F.4's authenticated-journeys cell claimed an execution its sixteen acceptance gates do not record",
    destination: "none; both cells are corrected in PRD Revision 4.3",
  },
});

/** Requirements this phase did **not** deliver. Empty, and the emptiness is checked. */
export const NOT_DELIVERED = Object.freeze({});

// ---------------------------------------------------------------------------
// Parsing — every rule stated, because an unstated parsing rule is a number
// fitted to an expectation rather than derived from a document.
// ---------------------------------------------------------------------------

/**
 * A requirement is a §6 bullet whose bold lead is an ID, optionally followed by
 * a parenthetical qualifier before the colon:
 *
 *   `- **2F-GUARD-001:** …`
 *   `- **2F-CREATE-002 (owner decision 5 — the B1 resolution, fully specified):** …`
 *
 * A `2F-` ID appearing anywhere else in §6 is a **reference**, not a
 * declaration. Conflating the two is how a generator arrives at a count by
 * tuning its regex.
 */
export function sectionBetween(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  if (start < 0) throw new Error(`Could not locate section heading ${JSON.stringify(startHeading)}`);
  const end = text.indexOf(endHeading, start + startHeading.length);
  if (end < 0) throw new Error(`Could not locate section heading ${JSON.stringify(endHeading)}`);
  return text.slice(start, end);
}

export function parseRequirements(prd) {
  const section = sectionBetween(prd, "## 6. Requirement families", "## 7. Epic and slice mapping");
  const declared = [...section.matchAll(/^- \*\*(2[A-Z]-[A-Z0-9]+-\d{3})(?:[^:]*)?:\*\*\s*(.+)$/gm)]
    .map((match) => ({
      id: match[1],
      family: match[1].replace(/-\d{3}$/, ""),
      description: match[2].trim(),
    }));
  const referenced = [...new Set(
    [...section.matchAll(/\b(2[A-Z]-[A-Z0-9]+-\d{3})\b/g)].map((match) => match[1]),
  )];
  return { section, declared, referenced };
}

/**
 * §7's family-range cells, e.g. `GUARD 1–3, DECISION 1–4, PRECOND 1–3` or
 * `CREATE 1–6, REMINDER 1–2, 4` (where the bare `4` continues the previous
 * family) or `OPERATIONS 3–6 + whole-phase convergence audit` (where the `+`
 * clause is prose).
 */
export function parseFamilyRangeCell(cell) {
  const cleaned = cell.replace(/\+.*$/, "").replace(/—/g, "").trim();
  if (cleaned === "") return [];
  const ids = [];
  let family = null;
  for (const part of cleaned.split(",")) {
    const token = part.trim();
    if (token === "") continue;
    const match = token.match(/^([A-Z]+)?\s*(\d+)(?:[\u2013-](\d+))?$/);
    if (!match) throw new Error(`Unparsable §7 ownership segment ${JSON.stringify(token)}`);
    if (match[1]) family = match[1];
    if (!family) throw new Error(`§7 ownership segment ${JSON.stringify(token)} names no family`);
    const low = Number(match[2]);
    const high = match[3] ? Number(match[3]) : low;
    if (high < low) throw new Error(`§7 ownership range ${JSON.stringify(token)} runs backwards`);
    for (let n = low; n <= high; n += 1) {
      ids.push(`2F-${family}-${String(n).padStart(3, "0")}`);
    }
  }
  return ids;
}

export function parseOwnership(prd) {
  const section = sectionBetween(prd, "## 7. Epic and slice mapping", "## 8. Acceptance criteria");
  const rows = [...section.matchAll(/^\|\s*(2F-[A-F])\s*\|\s*\*\*(2F\.\d)[^|]*\|\s*([^|]*)\|\s*([^|]*)\|\s*$/gm)];
  if (rows.length !== SLICES.length) {
    throw new Error(`§7 declares ${rows.length} epic rows; expected ${SLICES.length}`);
  }
  const owns = new Map();
  const owed = new Map();
  const epics = [];
  for (const row of rows) {
    const [, epic, slice, ownsCell, owedCell] = row;
    epics.push({ epic, slice });
    for (const id of parseFamilyRangeCell(ownsCell)) {
      if (owns.has(id)) {
        throw new Error(`${id} is owned by both ${owns.get(id)} and ${slice}; §7's Owns column must name one slice`);
      }
      owns.set(id, slice);
    }
    for (const id of parseFamilyRangeCell(owedCell)) {
      owed.set(id, [...(owed.get(id) ?? []), slice]);
    }
  }
  return { epics, owns, owed };
}

/** §10's validation-gate matrix, as rows of `●`/`—`/annotated cells per slice. */
export function parseGateMatrix(prd) {
  const section = sectionBetween(prd, "## 10. Validation-gate matrix", "## 11. Rollback evidence model");
  const rows = [];
  for (const line of section.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 2 + SLICES.length) continue;
    if (/^-+$/.test(cells[0]) || cells[0] === "Gate") continue;
    rows.push({
      gate: cells[0],
      executesIn: cells[1],
      cells: Object.fromEntries(SLICES.map((slice, index) => [slice, cells[2 + index]])),
    });
  }
  if (rows.length === 0) throw new Error("§10 yielded no gate rows");
  return rows;
}

// ---------------------------------------------------------------------------
// Repository readers
// ---------------------------------------------------------------------------

export function readPhase2fMigrations(root) {
  const dir = join(root, "supabase/migrations");
  if (!existsSync(dir)) throw new Error("supabase/migrations does not exist");
  return readdirSync(dir).filter((name) => /phase_2f/.test(name)).sort();
}

export function readAdrCoverage(root) {
  const decisions = readFileSync(join(root, "docs/DECISIONS.md"), "utf8");
  const headings = [...decisions.matchAll(/^## (ADR-\d{3})\s*[—-]\s*(.+)$/gm)];
  const coverage = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const id = headings[index][1];
    const start = headings[index].index ?? 0;
    const end = index + 1 < headings.length ? (headings[index + 1].index ?? decisions.length) : decisions.length;
    const body = decisions.slice(start, end);
    const ids = [...new Set([...body.matchAll(/\b(2[A-Z]-[A-Z0-9]+-\d{3})\b/g)].map((m) => m[1]))];
    coverage.set(id, { title: headings[index][2].trim(), requirementIds: ids });
  }
  return coverage;
}

export const ACCEPTANCE_BEARING_SUFFIXES = Object.freeze(["ACCEPTANCE", "REPORT"]);

/**
 * Per-slice artifact inventory, read off `docs/reports/`. A slice needs **at
 * least one** acceptance-bearing artifact; requiring a file named
 * `…_ACCEPTANCE.md` specifically would fail on Slice 2F.1 (which has only a
 * report) and, symmetrically, Slice 2F.3 has no report — a naming asymmetry
 * already dispositioned in `PHASE_2F_SLICE_04_PLAN.md:99` with no action
 * proposed. The inventory is reported as fact rather than normalised away.
 */
export function readSliceArtifacts(root) {
  const dir = join(root, "docs/reports");
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const bySlice = new Map();
  for (const slice of SLICES) {
    const ordinal = String(Number(slice.split(".")[1])).padStart(2, "0");
    const prefix = `PHASE_2F_SLICE_${ordinal}_`;
    const found = names
      .filter((name) => name.startsWith(prefix))
      .map((name) => name.slice(prefix.length).replace(/\.md$/, ""))
      .sort();
    bySlice.set(slice, found);
  }
  return bySlice;
}

export function readNpmScripts(root) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

/**
 * `vitest.config.ts`'s include/exclude globs, reduced to the only question this
 * generator asks: is `file` swept into the CI `app` job's `npm test`? The parse
 * is deliberately narrow — it reads the two literal arrays — and it throws if
 * their shape changes, rather than guessing.
 */
export function readVitestScope(root) {
  const source = readFileSync(join(root, "vitest.config.ts"), "utf8");
  const includeMatch = source.match(/include:\s*\[([^\]]*)\]/);
  const excludeMatch = source.match(/exclude:\s*\[([^\]]*)\]/);
  if (!includeMatch || !excludeMatch) {
    throw new Error("vitest.config.ts no longer declares literal include/exclude arrays; the suite-level gate check cannot be trusted");
  }
  const globs = (body) => [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { include: globs(includeMatch[1]), exclude: globs(excludeMatch[1]) };
}

function escapeLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The narrow glob subset `vitest.config.ts` actually uses: `**`, `**` + `/`, `*`
 * and `{a,b}`. Written as a scanner rather than a chain of `replace` calls,
 * because a chain has to escape its own metacharacters and then match them
 * again, which gets `{ts,tsx}` wrong — and a broken brace group would make the
 * suite-level gate check silently refuse every `.tsx` suite while appearing to
 * work.
 */
function globToRegExp(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          pattern += "(?:.*/)?";
          index += 2;
        } else {
          pattern += ".*";
          index += 1;
        }
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else if (char === "{") {
      const close = glob.indexOf("}", index);
      if (close < 0) throw new Error(`Unbalanced brace in glob ${JSON.stringify(glob)}`);
      pattern += `(?:${glob.slice(index + 1, close).split(",").map(escapeLiteral).join("|")})`;
      index = close;
    } else {
      pattern += escapeLiteral(char);
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function isSweptIntoVitest(file, scope) {
  const included = scope.include.some((glob) => globToRegExp(glob).test(file));
  const excluded = scope.exclude.some((glob) => globToRegExp(glob).test(file));
  return included && !excluded;
}

/** The workflow's jobs and the step names each declares. */
export function readWorkflowSteps(root) {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const jobs = new Map();
  let currentJob = null;
  // `on:` also nests two-space keys (`pull_request:`, `push:`), so the scan only
  // treats them as jobs once it is inside the `jobs:` block. Without this the
  // trigger names arrive as jobs and a `ci-step` gate could resolve against one.
  let insideJobs = false;
  for (const line of workflow.split("\n")) {
    if (/^[a-z]/.test(line)) {
      insideJobs = /^jobs:\s*$/.test(line);
      currentJob = null;
      continue;
    }
    if (!insideJobs) continue;
    const jobMatch = line.match(/^ {2}([a-z][a-z0-9_-]*):\s*$/);
    if (jobMatch) {
      currentJob = jobMatch[1];
      jobs.set(currentJob, []);
      continue;
    }
    const nameMatch = line.match(/^\s*- name:\s*(.+?)\s*$/);
    if (nameMatch && currentJob) jobs.get(currentJob).push(nameMatch[1]);
    const runMatch = line.match(/^\s*- run:\s*(.+?)\s*$/);
    if (runMatch && currentJob) jobs.get(currentJob).push(`run: ${runMatch[1]}`);
  }
  if (jobs.size === 0) throw new Error("ci.yml yielded no jobs");
  return { workflow, jobs };
}

/**
 * The paths the workflow actually hands to `supabase test db`. A pgTAP file
 * outside them is committed but never executed, which is the same defect class
 * as a suite excluded from `vitest.config.ts`.
 */
export function readPgTapPaths(root) {
  const { workflow } = readWorkflowSteps(root);
  const paths = [...workflow.matchAll(/supabase test db --local (\S+)/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error("ci.yml runs no `supabase test db --local` step");
  return [...new Set(paths)];
}

// ---------------------------------------------------------------------------
// Cross-document status contradiction (T4)
// ---------------------------------------------------------------------------

/**
 * Documents that describe the **current** state and must therefore agree with
 * the acceptance record. `CHANGELOG.md` is deliberately absent: it is an
 * append-only dated history, where a past "not started" sentence is a correct
 * record rather than a contradiction.
 */
export const CURRENT_STATE_DOCUMENTS = Object.freeze([
  "docs/STATE.md",
  "docs/TODO.md",
  "docs/PHASE_2_PLAN.md",
  "docs/PHASE_2F_PRD.md",
]);

export function findStatusContradictions(root, acceptedSlices) {
  const findings = [];
  for (const relative of CURRENT_STATE_DOCUMENTS) {
    const path = join(root, relative);
    if (!existsSync(path)) {
      findings.push({ document: relative, line: 0, text: "document is missing" });
      continue;
    }
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((text, index) => {
      for (const slice of acceptedSlices) {
        const escaped = slice.replace(".", "\\.");
        const patterns = [
          new RegExp(`${escaped}[^.\\n]{0,80}?(?:has |have )?not (?:yet )?(?:started|begun)`, "i"),
          new RegExp(`${escaped}[^.\\n]{0,80}?did not start`, "i"),
          new RegExp(`(?:slices?|slice)\\s+[^.\\n]{0,40}${escaped}[^.\\n]{0,40}(?:has |have )?not (?:yet )?started`, "i"),
        ];
        if (patterns.some((pattern) => pattern.test(text))) {
          findings.push({ document: relative, line: index + 1, slice, text: text.trim().slice(0, 200) });
        }
      }
      if (/the migration is not applied/i.test(text)) {
        findings.push({ document: relative, line: index + 1, slice: "2F.4", text: text.trim().slice(0, 200) });
      }
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

export function buildPhase2fTraceability({ root = REPOSITORY_ROOT } = {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const prdPath = join(root, "docs/PHASE_2F_PRD.md");
  if (!existsSync(prdPath)) throw new Error("docs/PHASE_2F_PRD.md does not exist");
  const prd = readFileSync(prdPath, "utf8");

  // ---- inventory (F2) ----
  const { declared, referenced } = parseRequirements(prd);
  const foreignDeclared = declared.filter((r) => !r.id.startsWith("2F-"));
  if (foreignDeclared.length > 0) {
    fail(
      `§6 declares ${foreignDeclared.length} requirement(s) outside the 2F- namespace `
      + `(${foreignDeclared.map((r) => r.id).join(", ")}). A Phase 2F PRD may reference another `
      + "phase's requirement but may never declare one — that is how another phase's work gets "
      + "attributed to this one.",
    );
  }
  const requirements = declared.filter((r) => r.id.startsWith("2F-"));

  if (requirements.length !== EXPECTED_REQUIREMENT_TOTAL) {
    fail(`§6 declares ${requirements.length} Phase 2F requirements; expected ${EXPECTED_REQUIREMENT_TOTAL}`);
  }
  const seen = new Set();
  for (const { id } of requirements) {
    if (seen.has(id)) fail(`${id} is declared more than once in §6`);
    seen.add(id);
  }
  const familyCounts = {};
  for (const { family } of requirements) familyCounts[family] = (familyCounts[family] ?? 0) + 1;
  for (const [family, expected] of Object.entries(EXPECTED_FAMILY_COUNTS)) {
    if (familyCounts[family] !== expected) {
      fail(`family ${family} declares ${familyCounts[family] ?? 0} requirements; expected ${expected}`);
    }
  }
  for (const family of Object.keys(familyCounts)) {
    if (!(family in EXPECTED_FAMILY_COUNTS)) fail(`unexpected requirement family ${family}`);
    if (!(family in FAMILY_EVIDENCE)) fail(`family ${family} has no evidence mapping`);
  }

  // A referenced ID must resolve: to a declared Phase 2F requirement, or to a
  // permitted foreign reference with a recorded reason.
  for (const id of referenced) {
    if (seen.has(id)) continue;
    if (id in PERMITTED_FOREIGN_REFERENCES) continue;
    fail(
      `§6 references ${id}, which is neither a declared Phase 2F requirement nor a permitted `
      + "foreign reference. A cross-reference that resolves to nothing is either a typo or another "
      + "phase's work arriving without a decision.",
    );
  }

  // ---- ownership (F3) ----
  const { epics, owns, owed } = parseOwnership(prd);
  for (const id of [...owns.keys(), ...owed.keys()]) {
    if (!seen.has(id)) fail(`§7 claims ${id}, which §6 does not declare`);
  }
  const crossCuttingOnly = [];
  for (const { id } of requirements) {
    const owner = owns.get(id);
    const owedTo = owed.get(id) ?? [];
    if (!owner && owedTo.length === 0) {
      fail(`${id} is claimed by no slice in §7 — neither owned nor owed`);
    }
    if (!owner && owedTo.length > 0) crossCuttingOnly.push(id);
  }

  // ---- migrations (F5) ----
  const migrations = readPhase2fMigrations(root);
  const expectedMigrations = Object.keys(EXPECTED_PHASE_2F_MIGRATIONS).sort();
  if (migrations.join("|") !== expectedMigrations.join("|")) {
    fail(
      `supabase/migrations holds Phase 2F migrations [${migrations.join(", ")}]; the PRD declares `
      + `exactly two, [${expectedMigrations.join(", ")}]. A third migration, a rename or a deletion `
      + "changes what this phase did to the database.",
    );
  }
  for (const [file, slice] of Object.entries(EXPECTED_PHASE_2F_MIGRATIONS)) {
    if (!SLICES.includes(slice)) fail(`migration ${file} is attributed to unknown slice ${slice}`);
  }

  // ---- ADR coverage (F6) ----
  const adrs = readAdrCoverage(root);
  const decisionRequirements = requirements.filter((r) => r.family === "2F-DECISION").map((r) => r.id);
  const adrByRequirement = new Map();
  for (const [adrId, { requirementIds }] of adrs) {
    for (const id of requirementIds) {
      if (id.startsWith("2F-") && !seen.has(id)) {
        fail(`${adrId} names ${id}, which the Phase 2F PRD does not declare`);
      }
      adrByRequirement.set(id, [...(adrByRequirement.get(id) ?? []), adrId]);
    }
  }
  for (const id of decisionRequirements) {
    if (!(adrByRequirement.get(id) ?? []).length) {
      fail(`${id} is a decision requirement with no ADR in docs/DECISIONS.md naming it`);
    }
  }

  // ---- slice artifacts (F7) ----
  const sliceArtifacts = readSliceArtifacts(root);
  const acceptedSlices = [];
  for (const slice of SLICES) {
    const found = sliceArtifacts.get(slice) ?? [];
    const bearing = found.filter((name) => ACCEPTANCE_BEARING_SUFFIXES.includes(name));
    if (bearing.length === 0) {
      fail(
        `slice ${slice} has no acceptance-bearing artifact in docs/reports/ `
        + `(found: ${found.length ? found.join(", ") : "nothing"}). One of `
        + `${ACCEPTANCE_BEARING_SUFFIXES.join(" or ")} is required.`,
      );
    } else if (slice !== "2F.6") {
      acceptedSlices.push(slice);
    }
  }

  // ---- gates and artifacts (F4, F8) ----
  const npmScripts = readNpmScripts(root);
  const vitestScope = readVitestScope(root);
  const { jobs } = readWorkflowSteps(root);
  const pgTapPaths = readPgTapPaths(root);

  for (const [key, evidence] of Object.entries(EVIDENCE_KEYS)) {
    for (const relative of [...evidence.artifacts, ...evidence.acceptance]) {
      // The generator's own output is the one path it may not require: demanding
      // it would mean this generator can never produce it a first time. It stays
      // in the evidence list because it *is* the artifact `2F-OPERATIONS-003`
      // names, and every other path — including the generator itself — is
      // resolved.
      if (relative === MATRIX_OUTPUT_PATH) continue;
      if (!existsSync(join(root, relative))) {
        fail(`${key} names ${relative} as evidence, and it does not exist. An unresolvable artifact is prose, not traceability.`);
      }
    }
    for (const gate of evidence.gates) {
      if (gate.kind === "npm") {
        if (!npmScripts.has(gate.script)) {
          fail(`${key} cites gate \`npm run ${gate.script}\`, which package.json does not declare`);
        }
      } else if (gate.kind === "suite") {
        if (!existsSync(join(root, gate.file))) {
          fail(`${key} cites suite ${gate.file}, which does not exist`);
        } else if (!isSweptIntoVitest(gate.file, vitestScope)) {
          fail(
            `${key} cites ${gate.file} as a CI suite, but vitest.config.ts does not sweep it into `
            + "`npm test` — it is committed and never executed",
          );
        }
      } else if (gate.kind === "pgtap") {
        if (!existsSync(join(root, gate.file))) {
          fail(`${key} cites pgTAP file ${gate.file}, which does not exist`);
        } else if (!pgTapPaths.some((path) => gate.file.startsWith(`${path}/`))) {
          fail(
            `${key} cites pgTAP file ${gate.file}, which sits outside the paths ci.yml runs `
            + `(${pgTapPaths.join(", ")}) — it is committed and never executed`,
          );
        }
      } else if (gate.kind === "ci-step") {
        const steps = jobs.get(gate.job);
        if (!steps) fail(`${key} cites CI job ${gate.job}, which ci.yml does not declare`);
        else if (!steps.includes(gate.step)) {
          fail(`${key} cites step ${JSON.stringify(gate.step)} in CI job ${gate.job}, which does not exist`);
        }
      } else if (gate.kind === "session") {
        if (!SLICES.includes(gate.slice)) fail(`${key} cites a session for unknown slice ${gate.slice}`);
        else if (!(sliceArtifacts.get(gate.slice) ?? []).some((n) => ACCEPTANCE_BEARING_SUFFIXES.includes(n))) {
          fail(`${key} cites a ${gate.slice} deployment session, but that slice has no acceptance-bearing artifact to name it`);
        }
      } else {
        fail(`${key} declares gate of unknown kind ${JSON.stringify(gate.kind)}`);
      }
    }
  }

  // ---- statuses (F9) ----
  for (const [id, override] of Object.entries(STATUS_OVERRIDES)) {
    if (!seen.has(id)) fail(`STATUS_OVERRIDES names ${id}, which the PRD does not declare`);
    if (!id.startsWith("2F-")) fail(`STATUS_OVERRIDES names non-Phase-2F requirement ${id}`);
    if ((override.status === "partial" || override.status === "deferred") && !override.destination) {
      fail(`${id} is ${override.status} with no destination. A deferral without a destination is a disappearance.`);
    }
  }
  for (const id of Object.keys(NOT_DELIVERED)) {
    if (!seen.has(id)) fail(`NOT_DELIVERED names ${id}, which the PRD does not declare`);
  }

  // ---- §10 gate ledger (F11) ----
  const gateMatrix = parseGateMatrix(prd);
  const ledger = [];
  for (const row of gateMatrix) {
    for (const slice of SLICES) {
      const cell = row.cells[slice];
      if (!cell || !cell.includes("●")) continue;
      const bearing = (sliceArtifacts.get(slice) ?? []).filter((n) => ACCEPTANCE_BEARING_SUFFIXES.includes(n));
      if (bearing.length === 0) {
        fail(
          `§10 marks gate ${JSON.stringify(row.gate)} executed (${cell}) for ${slice}, which has no `
          + "acceptance-bearing artifact to name the session it ran in (2F-PRECOND-003)",
        );
      }
      ledger.push({ gate: row.gate, slice, cell, artifacts: bearing });
    }
  }

  // ---- cross-document status contradictions (T4) ----
  const contradictions = findStatusContradictions(root, acceptedSlices);
  for (const finding of contradictions) {
    fail(
      `${finding.document}:${finding.line} asserts ${finding.slice ?? "a slice"} has not started, `
      + `contradicting its acceptance artifact: ${JSON.stringify(finding.text)}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Phase 2F traceability is not consistent — ${failures.length} finding(s):\n`
      + failures.map((message, index) => `  ${index + 1}. ${message}`).join("\n"),
    );
  }

  const rows = requirements.map((requirement) => {
    const key = REQUIREMENT_EVIDENCE_OVERRIDES[requirement.id] ?? FAMILY_EVIDENCE[requirement.family];
    const evidence = EVIDENCE_KEYS[key];
    const override = STATUS_OVERRIDES[requirement.id];
    const notDelivered = NOT_DELIVERED[requirement.id];
    const owner = owns.get(requirement.id);
    const owedTo = owed.get(requirement.id) ?? [];
    return {
      ...requirement,
      evidenceKey: key,
      evidence,
      owner,
      owedTo,
      slice: owner ?? `cross-cutting: ${owedTo.join(" / ")}`,
      status: notDelivered ? "NOT DELIVERED" : (override?.status ?? "complete"),
      note: notDelivered ?? override?.note ?? "",
      destination: override?.destination ?? "",
      adrs: adrByRequirement.get(requirement.id) ?? [],
    };
  });

  return {
    rows,
    epics,
    migrations,
    sliceArtifacts,
    crossCuttingOnly,
    ledger,
    gateMatrix,
    pgTapPaths,
    counts: {
      total: rows.length,
      families: Object.keys(EXPECTED_FAMILY_COUNTS).length,
      delivered: rows.filter((row) => row.status !== "NOT DELIVERED").length,
      notDelivered: rows.filter((row) => row.status === "NOT DELIVERED").length,
      noted: rows.filter((row) => row.note !== "" && row.status !== "NOT DELIVERED").length,
      crossCuttingOnly: crossCuttingOnly.length,
      ledgerCells: ledger.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function cell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

export function renderPhase2fTraceability(model) {
  const { rows, counts, migrations, sliceArtifacts, crossCuttingOnly, ledger, pgTapPaths } = model;
  const lines = [
    "# Phase 2F requirement traceability matrix",
    "",
    "Generated from `docs/PHASE_2F_PRD.md` and the repository artifacts it names, by",
    "`scripts/generate-phase-2f-traceability.mjs` during Slice 2F.6 closeout. **Do not edit by hand** —",
    "run `npm run docs:phase-2f:traceability` to regenerate.",
    "",
    `Inventory: **${counts.total}** requirement IDs across **${counts.families}** families, mapped individually.`,
    `**${counts.delivered} delivered, ${counts.notDelivered} not delivered**, ${counts.noted} carrying a recorded`,
    "scope note or measurement partial the reader must carry forward.",
    "",
    "## What this generator checks, and how",
    "",
    "Unlike the four generators before it, this one resolves what it declares rather than printing it:",
    "",
    "1. **Inventory** parsed from §6 by a declaration-anchored rule (`- **<ID>[ (qualifier)]:**`). A `2F-`",
    "   ID appearing elsewhere in §6 is a *reference*; every reference must resolve to a declared",
    "   requirement or to a permitted foreign reference with a recorded reason.",
    "2. **Ownership** derived from §7 as two relations — `owns` (at most one slice) and `owed` (many).",
    `   ${crossCuttingOnly.length} requirements are cross-cutting-only by §7's design and are labelled as such`,
    "   rather than given an invented owner.",
    "3. **Every artifact and acceptance path resolved on disk.** An unresolvable path fails the run.",
    "4. **Every `npm run` gate resolved in `package.json`.**",
    "5. **Migrations** read out of `supabase/migrations/` and attributed; a third fails the run.",
    "6. **ADR coverage** read out of `docs/DECISIONS.md`; an ADR naming an undeclared `2F-` ID fails.",
    "7. **Per-slice acceptance artifacts** read out of `docs/reports/`.",
    "8. **CI gates resolved two ways** — a job-level gate to a workflow job *and step*; a suite-level gate",
    "   to a file that is inside a path the workflow actually executes (`vitest.config.ts`'s include minus",
    `   its exclude for Vitest; ${pgTapPaths.map((p) => `\`${p}\``).join(", ")} for pgTAP). A committed-but-unexecuted suite fails.`,
    "9. **§10's gate ledger** cross-checked: every `●` cell's slice must have an acceptance-bearing",
    "   artifact to name the session it ran in (`2F-PRECOND-003`).",
    "10. **Cross-document status contradiction**: no current-state document may assert an accepted slice",
    "    has not started. `CHANGELOG.md` is excluded deliberately — it is dated history, where a past",
    "    \"not started\" sentence is a correct record.",
    "11. **Phase-2G attribution guard**: no non-`2F-` ID may be *declared* as a Phase 2F requirement, or",
    "    named by a status override. References to another phase's requirement are permitted only with a",
    "    recorded reason, which is what keeps the ADR-053/ADR-057 and 2E-MATCH-018 chains intact.",
    "",
    "## Requirements",
    "",
    "| ID | Required behaviour | Authoritative source | Owning / owed slice | Implementation artifacts | Verification mechanism | CI or remote gate | Acceptance evidence | Status | Note / deferred destination |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    const gates = row.evidence.gates.map((gate) => {
      if (gate.kind === "npm") return `\`npm run ${gate.script}\``;
      if (gate.kind === "suite") return `CI \`app\` → \`${gate.file}\``;
      if (gate.kind === "pgtap") return `CI \`database\` → \`${gate.file}\``;
      if (gate.kind === "ci-step") return `CI \`${gate.job}\` → "${gate.step}"`;
      return `${gate.slice} deployment session (${gate.note})`;
    }).join("; ");
    const trailer = [row.note, row.destination ? `**Destination:** ${row.destination}` : ""]
      .filter(Boolean).join(" — ") || "—";
    lines.push(
      `| \`${row.id}\` | ${cell(row.description)} | ${cell(row.evidence.source)}`
      + ` | ${cell(row.slice)} | ${cell(row.evidence.artifacts.map((a) => `\`${a}\``).join("; "))}`
      + ` | ${cell(row.verificationOverride ?? row.evidence.verification)} | ${cell(gates)}`
      + ` | ${cell(row.evidence.acceptance.map((a) => `\`${a}\``).join("; "))}`
      + ` | ${cell(row.status)} | ${cell(trailer)} |`,
    );
  }

  lines.push(
    "",
    "## Cross-cutting-only requirements",
    "",
    "These appear in §7's *Cross-cutting owed* column and in no *Owns* cell. That is §7's design, not a",
    "gap: they are obligations every touching slice carries rather than deliverables one slice ships.",
    "",
    ...crossCuttingOnly.map((id) => {
      const row = rows.find((candidate) => candidate.id === id);
      return `- \`${id}\` — owed by ${row.owedTo.join(", ")}`;
    }),
    "",
    "## Phase 2F migrations",
    "",
    "| Migration | Owning slice |",
    "| --- | --- |",
    ...migrations.map((file) => `| \`${file}\` | ${EXPECTED_PHASE_2F_MIGRATIONS[file]} |`),
    "",
    `Exactly ${migrations.length}, which is what PRD §7 declares. No Phase 2F slice added a third.`,
    "",
    "## Per-slice artifact inventory",
    "",
    "Reported as fact rather than normalised. Slice 2F.1 has a report and no acceptance file; Slice 2F.3",
    "has an acceptance file and no report — a naming asymmetry dispositioned in",
    "`PHASE_2F_SLICE_04_PLAN.md:99` with no action proposed. The gate requires at least one",
    "acceptance-bearing artifact per slice, not a particular filename.",
    "",
    "| Slice | Artifacts in `docs/reports/` |",
    "| --- | --- |",
    ...SLICES.map((slice) => `| ${slice} | ${(sliceArtifacts.get(slice) ?? []).join(", ") || "—"} |`),
    "",
    "## §10 gate ledger",
    "",
    `${ledger.length} cells in PRD §10 claim an executed gate. Each is listed with the artifact that must`,
    "name the session it ran in (`2F-PRECOND-003`); a cell whose slice has no such artifact fails the run.",
    "",
    "| Gate | Slice | Cell | Session named in |",
    "| --- | --- | --- | --- |",
    ...ledger.map((entry) => `| ${cell(entry.gate)} | ${entry.slice} | ${cell(entry.cell)} | ${entry.artifacts.join(", ")} |`),
    "",
    "## Regeneration",
    "",
    "Run `npm run docs:phase-2f:traceability`. The generator throws — it never emits a partial matrix —",
    "when any of the eleven checks above fails, and `src/lib/closeout/phase-2f-traceability.test.ts`",
    "proves each of them detects its own drift class **and** passes on correct content.",
    "",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const model = buildPhase2fTraceability();
  const outputPath = join(REPOSITORY_ROOT, MATRIX_OUTPUT_PATH);
  writeFileSync(outputPath, renderPhase2fTraceability(model), "utf8");
  console.log(
    `Wrote ${outputPath}: ${model.counts.total} requirements across ${model.counts.families} families `
    + `(${model.counts.delivered} delivered, ${model.counts.notDelivered} not delivered, `
    + `${model.counts.noted} with a recorded note), ${model.counts.crossCuttingOnly} cross-cutting-only, `
    + `${model.migrations.length} migrations, ${model.counts.ledgerCells} §10 gate cells.`,
  );
}
