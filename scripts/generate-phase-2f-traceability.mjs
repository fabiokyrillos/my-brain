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
  "E-MERGE-CI": {
    source: "PRD §6.12",
    artifacts: [".github/workflows/ci.yml", "docs/STATE.md"],
    verification: "each slice's merge-commit CI run read off the exact merge SHA with `gh run view <id> --json headSha,conclusion,event` — the branch-head run at the same PR is a different SHA and does not satisfy the requirement",
    gates: [
      { kind: "ci-step", job: "app", step: "run: npm test" },
      { kind: "ci-step", job: "database", step: "Run the pgTAP suite (post-revocation posture)" },
    ],
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
    // Both, now that both exist. The implementation PR could cite only the report,
    // because merge SHA, merge date and post-merge results are not facts while that
    // PR is open; the acceptance PR adds the acceptance record beside it. The same
    // two-PR shape Slices 2F.4 and 2F.5 used, for the same reason.
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_06_REPORT.md",
      "docs/reports/PHASE_2F_SLICE_06_ACCEPTANCE.md",
    ],
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
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_06_REPORT.md",
      "docs/reports/PHASE_2F_SLICE_06_ACCEPTANCE.md",
    ],
  },
  "E-CENSUS": {
    source: "PRD §6.12; owner decision 2",
    artifacts: ["scripts/phase-2f-reminder-census.mjs"],
    verification: "bucket predicates extracted as pure functions and covered in CI; a case asserts the file still issues no write; paging carries a total order on the primary key with exhaustion asserted",
    gates: [
      { kind: "suite", file: "src/lib/closeout/phase-2f-census.test.ts" },
      { kind: "npm", script: "test:remote:2f:census" },
    ],
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_06_REPORT.md",
      "docs/reports/PHASE_2F_SLICE_06_ACCEPTANCE.md",
    ],
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
    acceptance: [
      "docs/reports/PHASE_2F_SLICE_06_REPORT.md",
      "docs/reports/PHASE_2F_SLICE_06_ACCEPTANCE.md",
    ],
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

/**
 * The distinctive subject of each §10 gate row, as a pattern the owning slice's
 * acceptance record must mention if that row's `●` is to stand.
 *
 * `null` means "no token can distinguish this row" and exempts it — used only for
 * the always-on CI row, whose subject is every slice's whole build. Registering
 * every row is mandatory: an unregistered row fails the run rather than silently
 * skipping, so adding a §10 row forces a decision about how its cells are proven.
 *
 * How discriminating each token actually is, measured rather than asserted
 * ----------------------------------------------------------------------
 * Running every session-row token against all six slices' acceptance-bearing
 * artifacts gives this, and it is recorded because a screen whose reach is unstated
 * invites more confidence than it earns:
 *
 *   - authenticated journeys → matches exactly the three slices marked (2F.2, 2F.3,
 *     2F.6) and **not** 2F.1/2F.4/2F.5. This is the row where the phase's real
 *     defect lived, and the token is tight enough to have caught it;
 *   - reminders UPDATE/DELETE determination → matches 2, close to its 1 marked cell;
 *   - parity re-check → matches exactly the five marked;
 *   - two-owner probe (4), census stop-gate (4), traceability + cleanup (5) and
 *     full remote suite (5) are **loose**: their vocabulary is common enough across
 *     acceptance reports that a false `●` on a slice whose report merely mentions
 *     the word would pass.
 *
 * So this is a **screen, strongest exactly where it needed to be**, not a proof
 * that a session happened. Tightening the loose four was considered and declined:
 * the failure mode that actually bit this slice twice was a guard too strict for
 * correct content, and A14's human cell-by-cell sweep remains the stronger
 * instrument by design (definitive Slice 2F.6 PRD §14).
 */
export const GATE_SUBJECT_TOKENS = Object.freeze({
  "lint / typecheck / Vitest / build · `deno check`+`test`": null,
  "Empty-DB chain + full pgTAP + db lint": /pgTAP|database and journey|db lint|plan\(/i,
  "Grammar-trap guard + architecture gate (allowlists per §2)": /allowlist|guard/i,
  "Preserved Gate 3 static suite (`work-surface-reuse.test.ts`)": /work-surface-reuse|Gate 3|static suite/i,
  // Deliberately NOT the bare word "journey": every acceptance report quotes the
  // CI job name "database and journey", which would have matched — and did, until
  // the drift case for this row caught it. A token that fires on boilerplate every
  // report carries is a token that can never fail.
  "Authenticated journeys desktop+mobile, pt-BR+en": /playwright|Pixel 7|authenticated journe|desktop \+ mobile/i,
  "Two-owner disposable probe (mutation / creation incl. user-origin undo)": /two-owner|probe/i,
  "CI re-grant proof (revoke → re-grant → writes restored; **SQL-level only, not a live-ops rehearsal**)": /re-grant|rehearsal/i,
  "Pre-revocation privilege assertion (denial non-vacuous)": /non-vacuou|privilege|denial/i,
  "Full existing remote suite": /remote suite|test:remote/i,
  "Reminders UPDATE/DELETE determination (written)": /2F-REMINDER-003|determina/i,
  "End-to-end baseline + reader exclusion-mechanism proof": /baseline|exclusion/i,
  "**Census stop-gate** (buckets 1/2 blocking; bucket 7 informational)": /census|stop-gate/i,
  "Traceability tamper runs + cleanup verifier": /traceabilit|cleanup verifier/i,
  "Parity re-check before/after": /parity|paridade/i,
});

export const REQUIREMENT_EVIDENCE_OVERRIDES = Object.freeze({
  // Without this the family key gives 2F-OPERATIONS-002 — "all three CI jobs
  // green on the exact merge SHA" — a *parity session* as its gate cell, which is
  // the wrong kind of evidence printed in the row that names the right one.
  "2F-OPERATIONS-002": "E-MERGE-CI",
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
  "2F-OPERATIONS-002": {
    status: "partial",
    note: "green on every implementation-PR merge SHA (8c59c1d/47c555e/48d6a83/c174f8f/2ae2606) and on three of four acceptance merges. **`6628b02` — PR #30, a documentation-only 2F.4 acceptance merge — has never had a green `application` job**: the original run failed on `question-answer-form.test.tsx:162` and this closeout's rerun failed on `task-candidate-form.test.tsx`, two different jsdom timing flakes already recorded in TODO.md. `edge worker` and `database and journey` were green in both runs and the commit changed no source, so no Phase 2F change is implicated — but the requirement says *every* slice PR and one merge SHA does not qualify",
    destination: "the two flaky component tests in docs/TODO.md; neither reproduces on demand, and a fix without a reproduction is a guess",
  },
  "2F-PRECOND-003": {
    status: "complete",
    note: "discharged by Slice 2F.6's A14 sweep of §10's gate ledger, which filed two dispositions: 2F.5's `database` cell was `—` although the slice added three pgTAP assertions, and 2F.4's authenticated-journeys cell claimed an execution its sixteen acceptance gates do not record",
    destination: "none; both cells are corrected in PRD Revision 4.3",
  },
});

/**
 * Requirements this phase did **not** deliver. Empty — and unlike the comment
 * this line used to carry, the emptiness is now actually checked below rather
 * than merely asserted here.
 */
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
  const includes = [...source.matchAll(/include:\s*\[([^\]]*)\]/g)];
  const excludes = [...source.matchAll(/exclude:\s*\[([^\]]*)\]/g)];
  if (includes.length !== 1 || excludes.length !== 1) {
    throw new Error(
      `vitest.config.ts declares ${includes.length} include and ${excludes.length} exclude arrays; `
      + "the suite-level gate check reads one of each and cannot tell which governs `npm test` when "
      + "another (a coverage list, say) shadows it",
    );
  }
  const [includeMatch] = includes;
  const [excludeMatch] = excludes;
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
  // Comments stripped first: a documented or commented-out invocation would
  // otherwise register its path as one the workflow executes, which is the
  // opposite of what this reader is for.
  const executable = workflow
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*#.*$/, ""))
    .join("\n");
  const paths = [...executable.matchAll(/supabase test db --local (\S+)/g)].map((m) => m[1]);
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
  // §13 requires both of these to state the *current* posture, and the closeout
  // edited both, so a stale status in either is exactly the class this scan is for.
  "docs/SECURITY.md",
  "docs/DATABASE.md",
]);

/**
 * The vocabulary a document uses when it says a slice is not finished.
 *
 * Revision 1 of this scan matched only the literal shapes "not started" /
 * "not begun" / "did not start", which an executed probe showed misses every
 * other natural phrasing — "has not *been* started", "is not yet accepted",
 * "remains outstanding", "is in progress", "awaits authorization", "was never
 * executed", "is incomplete". A scan that catches one wording out of eight is a
 * mechanism in name only, which is what `T4` exists to stop being.
 */
export const UNFINISHED_STATUS_PHRASES = Object.freeze([
  "not (?:yet )?(?:been )?(?:started|begun|executed|run)",
  "did not (?:start|run|execute)",
  // Deliberately NOT "never ran/executed": that phrasing appears in legitimate
  // narrative *about* a gate that was corrected, and it fired on this phase's own
  // PRD §14 entry describing the 2F.4 journeys cell. "not been executed/run"
  // above covers the assertion form without catching the description of one.
  "not (?:yet )?(?:been )?(?:accepted|merged|delivered|applied|deployed)",
  "in progress",
  "awaits? (?:authorization|approval|a decision)",
  "remains? (?:outstanding|pending|open|unstarted)",
  "(?:is|are) (?:still )?(?:incomplete|unfinished|pending|outstanding)",
  "has not (?:been )?(?:started|accepted|merged|deployed)",
  "on (?:a |the )?branch, (?:not|no) (?:merged|pushed|pr)",
]);

/**
 * Statements that assert an accepted slice — or the phase — is unfinished.
 *
 * Two shapes are matched: a slice identifier followed by an unfinished phrase
 * within one sentence, and an unfinished phrase followed by a slice identifier.
 * `subjects` carries the phase name as well as the slice ids, because a document
 * can say "Phase 2F is incomplete" without naming a slice.
 */
/**
 * The marker that takes a heading's section out of the scan.
 *
 * A repository this old necessarily carries point-in-time narrative — the
 * project's own convention is to re-label it rather than delete it (F41). So the
 * scan needs a way to tell "this paragraph is history" from "this paragraph is a
 * stale current claim", and a keyword scan cannot infer that. The convention is
 * an explicit marker in the section's heading or its first lines; anything
 * unmarked is read as a current claim, which is the fail-closed direction.
 */
export const HISTORICAL_SECTION_MARKER = /superseded|point-in-time|historical record|append-only .*record/i;

/**
 * The same convention at line granularity, for the backlog's own idiom: a struck
 * item (`~~…~~`), a dated discharge, or a preserved original quoted inside its
 * own correction. Without this, correcting a stale line by *quoting* the stale
 * sentence inside the correction re-triggers the finding — the scan would be
 * punishing the very labelling it is meant to encourage.
 */
export const HISTORICAL_LINE_MARKER = /\bdischarged\b|\bsuperseded\b/i;

/**
 * Removes the spans a line has already labelled as history, so the rest of the
 * line is still scanned.
 *
 * The first version of this exemption tested the whole line for `~~`, which meant
 * **any** strikethrough anywhere silenced every claim on that line — a genuine
 * "Slice 2F.4 has not started" could hide behind an unrelated struck note. The
 * scan now strips only the struck span and the `(Original: …)` quotation a
 * correction preserves, and keeps reading the remainder. `discharged` and
 * `superseded` remain line-level, because those words label the line's own claim
 * rather than a fragment of it.
 */
export function stripHistoricalSpans(text) {
  return text
    .replace(/~~[\s\S]*?~~/g, " ")
    .replace(/\(original:[\s\S]*?\)\s*\*?$/i, " ");
}

/**
 * Splits a document into `## `/`### ` sections and flags the ones a supersession
 * marker covers. A marker in a section's heading or in its first six lines
 * covers that section and — for a `## ` section — its nested `### ` children,
 * because that is how `STATE.md`'s history block is actually written.
 */
export function partitionHistoricalSections(text) {
  const lines = text.split("\n");
  const covered = new Array(lines.length).fill(false);
  let topLevelCovered = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isTop = /^## /.test(line);
    const isSub = /^### /.test(line);
    if (isTop || isSub) {
      const window = lines.slice(index, index + 7).join("\n");
      const marked = HISTORICAL_SECTION_MARKER.test(window);
      if (isTop) topLevelCovered = marked;
      covered[index] = marked || (isSub && topLevelCovered);
    } else {
      covered[index] = index > 0 ? covered[index - 1] : false;
    }
  }
  return covered;
}

export function findStatusContradictions(root, acceptedSlices, { phase = "Phase 2F" } = {}) {
  const findings = [];
  const subjects = [...acceptedSlices, phase];
  const phrases = UNFINISHED_STATUS_PHRASES.join("|");

  for (const relative of CURRENT_STATE_DOCUMENTS) {
    const path = join(root, relative);
    if (!existsSync(path)) {
      findings.push({ document: relative, line: 0, text: "document is missing" });
      continue;
    }
    const source = readFileSync(path, "utf8");
    const lines = source.split("\n");
    const historical = partitionHistoricalSections(source);
    lines.forEach((text, index) => {
      if (historical[index] || HISTORICAL_LINE_MARKER.test(text)) return;
      const scannable = stripHistoricalSpans(text);
      for (const subject of subjects) {
        const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Bounded to one sentence in either direction, and `[^.\n]` stops the
        // window crossing a full stop, so a nearby unrelated sentence cannot
        // manufacture a match.
        const patterns = [
          new RegExp(`${escaped}[^.\\n]{0,90}?\\b(?:${phrases})\\b`, "i"),
          new RegExp(`\\b(?:${phrases})\\b[^.\\n]{0,90}?${escaped}`, "i"),
        ];
        if (patterns.some((pattern) => pattern.test(scannable))) {
          findings.push({ document: relative, line: index + 1, slice: subject, text: text.trim().slice(0, 200) });
          break;
        }
      }
    });
  }
  return findings;
}

/**
 * Phrases a document uses to say a migration has not reached the deployed
 * project. In Portuguese too, because `SECURITY.md` and `DATABASE.md` are
 * written in it and both are §13 reconciliation targets.
 */
export const UNDEPLOYED_MIGRATION_PHRASES = Object.freeze([
  "local only",
  "local/branch only",
  "local[- ]?only",
  "branch[- ]?only",
  "not (?:yet )?(?:been )?applied",
  "not (?:yet )?(?:been )?deployed",
  "does not exist in the linked project",
  "n[ãa]o implantad[oa]",
  "apenas local",
  "local/branch apenas",
  "permanece em",
]);

/**
 * A second contradiction class the slice-status scan cannot see: a current-state
 * document asserting that a migration **in the applied chain** is undeployed, or
 * that parity sits at a version the chain has moved past.
 *
 * This is the class that produced two of the closeout's own findings — a
 * `## Current truth` paragraph still calling `202607250056` local-only, and a
 * `SECURITY.md` section still naming parity `202607250054` thirty-nine lines from
 * the parity line the same slice corrected. Both were invisible to a scan keyed
 * on slice ids, because neither sentence names a slice.
 *
 * Sections carrying `HISTORICAL_SECTION_MARKER` are exempt, on the same
 * fail-closed convention: unmarked prose is read as a current claim.
 */
export function findStaleDeploymentClaims(root) {
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .map((name) => name.slice(0, 12))
    .filter((version) => /^\d{12}$/.test(version));
  if (migrations.length === 0) throw new Error("supabase/migrations yielded no versioned files");
  const head = migrations.slice().sort().at(-1);
  const applied = new Set(migrations);
  const phrases = UNDEPLOYED_MIGRATION_PHRASES.join("|");
  const findings = [];

  for (const relative of CURRENT_STATE_DOCUMENTS) {
    const path = join(root, relative);
    if (!existsSync(path)) continue;
    const source = readFileSync(path, "utf8");
    const historical = partitionHistoricalSections(source);
    source.split("\n").forEach((text, index) => {
      if (historical[index] || HISTORICAL_LINE_MARKER.test(text)) return;
      const scannable = stripHistoricalSpans(text);
      for (const version of [...new Set([...text.matchAll(/\b(\d{12})\b/g)].map((m) => m[1]))]) {
        if (!applied.has(version)) continue;
        // A version that IS the chain head cannot be the subject of a stale
        // parity claim, so only versions the chain has moved past are suspect.
        const isHead = version === head;
        const near = new RegExp(
          `(?:${phrases})[^.\\n]{0,90}?${version}|${version}[^.\\n]{0,90}?(?:${phrases})`,
          "i",
        );
        if (near.test(scannable) && !isHead) {
          findings.push({ document: relative, line: index + 1, version, text: text.trim().slice(0, 200) });
          break;
        }
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
  // Attribution derived, not declared. Revision 1 of this check compared
  // EXPECTED_PHASE_2F_MIGRATIONS against SLICES — two constants in this file — so
  // re-attributing a migration to the wrong slice produced no failure and
  // silently rewrote the matrix's "Owning slice" column. The external source is
  // each slice's own acceptance-bearing artifact, which names the migration it
  // applied; exactly one slice must claim each migration, and it must be the one
  // declared here.
  // The external source is each migration's own header line, which names the
  // slice that wrote it — `-- Phase 2F Slice 2F.3 — manual task-creation
  // convergence.` A slice-report prose scan was tried first and is too weak:
  // a later slice's parity line names the migration it moved *from*, so both
  // migrations resolved to two claimants. The header is unambiguous, lives in the
  // artifact being attributed, and cannot drift from it.
  for (const [file, slice] of Object.entries(EXPECTED_PHASE_2F_MIGRATIONS)) {
    if (!SLICES.includes(slice)) fail(`migration ${file} is attributed to unknown slice ${slice}`);
    const path = join(root, "supabase/migrations", file);
    if (!existsSync(path)) continue; // already reported by the inventory check above
    const header = readFileSync(path, "utf8").split(/\r?\n/).slice(0, 3).join("\n");
    const declared = header.match(/Phase 2F Slice (2F\.\d)/);
    if (!declared) {
      fail(
        `migration ${file} does not name its slice in its first three lines, so its attribution to `
        + `${slice} has no source outside this generator. Every Phase 2F migration opens with `
        + "`-- Phase 2F Slice 2F.N — …`.",
      );
    } else if (declared[1] !== slice) {
      fail(`migration ${file} declares itself Slice ${declared[1]} but is attributed to ${slice}`);
    }
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
  // The emptiness the declaration claims, checked. Phase 2F delivered all 68; if
  // a future edit records a non-delivery here it must also update the phase
  // report's headline count, so this refuses to pass silently.
  if (Object.keys(NOT_DELIVERED).length > 0) {
    fail(
      `NOT_DELIVERED holds ${Object.keys(NOT_DELIVERED).length} entr(y|ies), but Phase 2F closed with `
      + "68 of 68 delivered. Either the phase report's count is stale or this map is.",
    );
  }

  // ---- §10 gate ledger (F11) ----
  const gateMatrix = parseGateMatrix(prd);
  const ledger = [];
  for (const row of gateMatrix) {
    const subject = GATE_SUBJECT_TOKENS[row.gate];
    if (subject === undefined) {
      fail(
        `§10 declares gate ${JSON.stringify(row.gate)}, for which no subject token is registered. `
        + "Every ledger row needs one, or its ● cells cannot be checked against the session that ran them.",
      );
      continue;
    }
    for (const slice of SLICES) {
      const cell = row.cells[slice];
      if (!cell || !cell.includes("●")) continue;
      const bearing = (sliceArtifacts.get(slice) ?? []).filter((n) => ACCEPTANCE_BEARING_SUFFIXES.includes(n));
      if (bearing.length === 0) {
        fail(
          `§10 marks gate ${JSON.stringify(row.gate)} executed (${cell}) for ${slice}, which has no `
          + "acceptance-bearing artifact to name the session it ran in (2F-PRECOND-003)",
        );
        continue;
      }
      // The check that has teeth. Revision 1 stopped at "the slice has some
      // acceptance file", which is a strict subset of the artifact-resolution
      // check and therefore never fired alone — and, decisively, would NOT have
      // caught the defect it was added for: Slice 2F.4 has four acceptance-bearing
      // artifacts and its journeys cell was still false.
      //
      // Which cells need a named session is **derived from §10's own "Executes in"
      // column**, not hand-declared. A row that executes in CI is proven by that
      // slice's merge-SHA CI run, so demanding its subject appear in an acceptance
      // narrative would fail on correct content — the continuous static-suite row
      // is the clearest case. A row that executes in a *session* has no other
      // witness than the record of that session, which is precisely what
      // 2F-PRECOND-003 requires and where the 2F.4 defect lived.
      //
      // What this proves and what it does not: a keyword present is weaker than "a
      // session named". It catches a cell whose subject appears nowhere in the
      // record — exactly the 2F.4 case — and cannot catch one mentioned only in
      // passing. That limit is stated rather than papered over, and A14's human
      // sweep remains the stronger instrument.
      const provenByCi = /\bCI\b/.test(row.executesIn);
      const ordinal = String(Number(slice.split(".")[1])).padStart(2, "0");
      const named = provenByCi || subject === null || bearing.some((suffix) => {
        const path = join(root, `docs/reports/PHASE_2F_SLICE_${ordinal}_${suffix}.md`);
        return existsSync(path) && subject.test(readFileSync(path, "utf8"));
      });
      if (!named) {
        fail(
          `§10 marks gate ${JSON.stringify(row.gate)} executed (${cell}) for ${slice}, but none of that `
          + `slice's acceptance-bearing artifacts (${bearing.join(", ")}) mentions its subject. `
          + "2F-PRECOND-003: an unexecuted gate may not be cited as evidence anywhere in the phase.",
        );
      }
      ledger.push({ gate: row.gate, slice, cell, artifacts: bearing, subjectNamed: named });
    }
  }

  // ---- cross-document status contradictions (T4) ----
  const contradictions = findStatusContradictions(root, acceptedSlices);
  for (const finding of contradictions) {
    fail(
      `${finding.document}:${finding.line} asserts ${finding.slice ?? "a slice"} is unfinished, `
      + `contradicting its acceptance artifact: ${JSON.stringify(finding.text)}`,
    );
  }
  const staleDeployments = findStaleDeploymentClaims(root);
  for (const finding of staleDeployments) {
    fail(
      `${finding.document}:${finding.line} says migration ${finding.version} is undeployed or that parity `
      + `sits there, but it is in the applied chain: ${JSON.stringify(finding.text)}`,
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
      + ` | ${cell(row.evidence.verification)} | ${cell(gates)}`
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
