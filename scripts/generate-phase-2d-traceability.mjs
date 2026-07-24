import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prdPath = resolve(repositoryRoot, "docs/PHASE_2D_PRD.md");
const outputPath = resolve(repositoryRoot, "docs/reports/PHASE_2D_TRACEABILITY_MATRIX.md");
const prd = readFileSync(prdPath, "utf8");

// The Phase 2D PRD states its testable requirements as `2D-<FAMILY>-NNN` bullets in
// section 13, its per-epic acceptance in section 19.1, and its global gates in section
// 19.2 — the same shape Phase 2C used, so this generator mirrors
// `generate-phase-2c-traceability.mjs`. Each requirement is mapped by family to the
// owning slice(s) and durable evidence; the generator fails closed if the PRD inventory
// drifts from the closed expectation, guaranteeing the matrix stays synchronized.

const evidenceByFamily = {
  "2D-ANSWER": {
    slice: "2D.1; extended by 2D.2/2D.4",
    artifacts: "resolve_pending_question_v1–v3 (answer kind); question-resolution-contract; resolvePendingQuestion Action",
    local: "question-resolution-contract and answer-pending-question Action tests; pending-question E2E",
    remote: "question-resolution smoke answer/stale/not-open/replay cases",
  },
  "2D-DISPOSITION": {
    slice: "2D.2",
    artifacts: "resolve_pending_question_v2 (deferred/dismissed/not_relevant); actionablePendingQuestionFilter; list_needs_attention snooze reactivation",
    local: "question-resolution-contract disposition tests; question-visibility tests; disposition form tests",
    remote: "question-resolution smoke defer/dismiss/not-relevant/reactivation/undo cases",
  },
  "2D-SUGGEST": {
    slice: "2D.3",
    artifacts: "question-suggestions (deterministic, no AI schema); question-preview-projection (read-only source/effect DTO)",
    local: "question-suggestions, question-preview-projection, and suggestion-UI tests",
    remote: "question-preview smoke source/effect and event-allowlist cases",
  },
  "2D-ACTION": {
    slice: "2D.4",
    artifacts: "resolve_pending_question_v3 closed consequence enum (none/reinterpret); reused enqueue_entry_reprocessing/worker path",
    local: "question-resolution-contract consequence tests; reinterpret confirm-flow form tests",
    remote: "question-reinterpretation smoke consequence/idempotency/undo-compensation cases",
  },
  "2D-SURFACE": {
    slice: "2D.5",
    artifacts: "conversational-questions region panel (Chat + queue); shared resolvePendingQuestion contract; untrusted-data rendering",
    local: "conversational-questions and surfacing tests; Chat/queue convergence E2E",
    remote: "authenticated Chat↔queue↔/questions convergence journey (desktop + Pixel 7)",
  },
  "2D-COOLDOWN": {
    slice: "2D.5",
    artifacts: "decideQuestionSurfacing (quiet hours/cap/rolling cooldown/override); question-surfacing-data (notifications-ledger budget, fail-closed)",
    local: "question-surfacing and question-surfacing-data tests (heartbeat-aligned discipline)",
    remote: "surfacing gating verified through the authenticated convergence journey",
  },
  "2D-PROVENANCE": {
    slice: "2D.1; suggestion origin in 2D.3",
    artifacts: "append-only audit rows (question/interpretation/kind/fingerprint); server-authenticated origin: typed|suggested",
    local: "question-resolution-contract provenance/origin tests",
    remote: "question-resolution and question-preview smoke audit/origin assertions",
  },
  "2D-IDEMPOTENCY": {
    slice: "2D.1; extended by 2D.2/2D.4",
    artifacts: "canonical request fingerprint on undo_operations; resolve-v1/v2/v3 operation-key namespaces",
    local: "question-resolution-contract canonicalization tests",
    remote: "question-resolution/reinterpretation smoke replay and concurrency single-winner cases",
  },
  "2D-OWNERSHIP": {
    slice: "2D.1; every database-bearing 2D slice",
    artifacts: "SECURITY DEFINER resolve RPCs with search_path=''; auth.uid() identity; closed p_resolution JSON; RLS on pending_questions",
    local: "resolvePendingQuestion Action ownership tests (no client-supplied owner id)",
    remote: "question-resolution smoke anonymous/cross-owner denial (indistinguishable from not-found)",
  },
  "2D-UNDO": {
    slice: "2D.1; reinterpret compensation in 2D.4",
    artifacts: "single-transaction undo_operation restore-to-open; guarded against clobbering a newer resolution; reprocess-job compensation",
    local: "resolvePendingQuestion/undoQuestionResolution Action tests",
    remote: "question-resolution/reinterpretation smoke undo idempotency and reprocess-compensation cases",
  },
  "2D-UX": {
    slice: "every slice; aggregated in 2D.6",
    artifacts: "distinct open/editing/pending/success/deferred/terminal/conflict/failure states; no raw confidence/state name in primary flow",
    local: "question-answer-form and suggestion-UI component tests",
    remote: "desktop/Pixel-7 authenticated question journey",
  },
  "2D-I18N": {
    slice: "every slice; aggregated in 2D.6",
    artifacts: "next-intl PT-BR/en copy for every label/hint/error/status/suggestion/action; locale + profile-timezone deferral copy",
    local: "form copy and defer-time rendering tests",
    remote: "PT-BR/en authenticated browser matrix",
  },
  "2D-A11Y": {
    slice: "every slice; aggregated in 2D.6",
    artifacts: "programmatic labels, field-associated errors, live regions, focus-return, ≥44px targets, keyboard flow, region landmark",
    local: "question-answer-form accessibility assertions",
    remote: "desktop/Pixel-7 keyboard/focus/live-region/target Playwright assertions across Chat and queue",
  },
  "2D-ANALYTICS": {
    slice: "2D.1–2D.5; verified in 2D.6",
    artifacts: "content-free question_answered_basic (bounded origin), question_resolved (bounded kind), question_effect_previewed, question_reinterpret_applied; needs_attention_viewed reuse on questions surface",
    local: "product-analytics allowlist and fail-open Action tests",
    remote: "product-events remote persistence smoke (allowlist/privacy/idempotency/ownership)",
  },
  "2D-OPERATIONS": {
    slice: "every slice; closeout in 2D.6",
    artifacts: "append-only migrations 046–051; regenerated linked types; deterministic suggestions with no AI schema/worker change",
    local: "generated-type parity and full local gate",
    remote: "migration list parity; linked db lint; cleanup verifier; fail-fast test:remote:2d aggregate",
  },
};

const expectedFamilyCounts = {
  "2D-ANSWER": 7,
  "2D-DISPOSITION": 6,
  "2D-SUGGEST": 5,
  "2D-ACTION": 6,
  "2D-SURFACE": 3,
  "2D-COOLDOWN": 2,
  "2D-PROVENANCE": 3,
  "2D-IDEMPOTENCY": 4,
  "2D-OWNERSHIP": 4,
  "2D-UNDO": 4,
  "2D-UX": 3,
  "2D-I18N": 2,
  "2D-A11Y": 3,
  "2D-ANALYTICS": 3,
  "2D-OPERATIONS": 3,
};

const expectedRequirementTotal = Object.values(expectedFamilyCounts).reduce((sum, count) => sum + count, 0);

// The `unavailable-before-slice-N` requirements (2D-DISPOSITION-001, 2D-SUGGEST-001,
// 2D-ACTION-001) are phasing constraints that gated an *earlier* slice; by closeout
// every capability they gated is delivered, so they are satisfied ("the gate held, then
// the capability shipped"). No Phase 2D requirement is deferred: the deterministic
// suggested-answer path (2D-SUGGEST-002 / 2D-OPERATIONS-003) fully satisfies its
// requirement, and the additive AI extraction-schema field it names is an explicitly
// deferred, separately-authorized *fallback that was not needed*, never an unmet
// obligation. The 2C-UNDO-004 hard gate behind 2D-ACTION-006 / 2D-UNDO-003 is resolved
// (migration 202607230050 forward-fixes undo_operation's own 40001 to 55P03).
const statusOverrides = {};

const requirementPattern = /^- \*\*(2D-[A-Z][A-Z0-9]*-\d{3}):\*\*\s*(.+)$/gm;
const requirements = [...prd.matchAll(requirementPattern)].map((match) => {
  const id = match[1];
  const family = id.replace(/-\d{3}$/, "");
  return { id, description: match[2].trim(), family };
});

if (requirements.length !== expectedRequirementTotal) {
  throw new Error(
    `Unexpected Phase 2D functional requirement inventory: ${requirements.length} (expected ${expectedRequirementTotal})`,
  );
}
const actualFamilyCounts = {};
for (const { family } of requirements) actualFamilyCounts[family] = (actualFamilyCounts[family] ?? 0) + 1;
for (const [family, expected] of Object.entries(expectedFamilyCounts)) {
  if (actualFamilyCounts[family] !== expected) {
    throw new Error(`Family ${family} has ${actualFamilyCounts[family] ?? 0} IDs; expected ${expected}`);
  }
}
for (const family of Object.keys(actualFamilyCounts)) {
  if (!expectedFamilyCounts[family]) throw new Error(`Unexpected requirement family ${family}`);
  if (!evidenceByFamily[family]) throw new Error(`Family ${family} is missing traceability evidence`);
}

const epicPattern = /^- \*\*(Epic 2D-[A-F]):\*\*\s*(.+)$/gm;
const epics = [...prd.matchAll(epicPattern)].map((match) => ({
  id: match[1],
  description: match[2].trim(),
}));
if (epics.length !== 6) throw new Error(`Unexpected epic-acceptance inventory: ${epics.length} (expected 6)`);

const epicEvidence = {
  "Epic 2D-A": "Slice 2D.1 traceable-answer report; resolve_pending_question_v1 pgTAP; question-resolution remote smoke; desktop/mobile E2E.",
  "Epic 2D-B": "Slice 2D.2 dispositions report; resolve_pending_question_v2 and shared actionablePendingQuestionFilter/list_needs_attention reactivation; disposition remote smoke; queue convergence.",
  "Epic 2D-C": "Slice 2D.3 suggested-answers/preview report; deterministic question-suggestions and read-only question-preview-projection; question-preview remote smoke; non-mutating E2E.",
  "Epic 2D-D": "Slice 2D.4 reinterpretation report; resolve_pending_question_v3 closed consequence enum reusing the deployed reprocessing path; 2C-UNDO-004 40001→55P03 resolved; reinterpretation remote smoke.",
  "Epic 2D-E": "Slice 2D.5 conversational-surfacing report; conversational-questions region panel and deterministic decideQuestionSurfacing; Chat↔queue↔/questions convergence journey (desktop + Pixel 7).",
  "Epic 2D-F": "Slice 2D.6 closeout: convergence audit (single shared predicate/resolution/undo, no product fix required), this traceability matrix, cleanup verifier, test:remote:2d aggregate, and permanent-doc reconciliation.",
};
for (const { id } of epics) {
  if (!epicEvidence[id]) throw new Error(`Epic ${id} is missing closeout evidence`);
}

const globalGatesSection = prd.slice(
  prd.indexOf("### 19.2 Global gates"),
  prd.indexOf("### 19.3"),
);
if (!globalGatesSection) throw new Error("Could not locate PRD section 19.2 Global gates");
const globalGates = [...globalGatesSection.matchAll(/^- \*\*([^:*]+):\*\*\s*(.+?)\.?$/gm)].map((match, index) => ({
  id: `GATE-${String(index + 1).padStart(2, "0")}`,
  label: match[1].trim(),
  description: match[2].trim(),
}));
if (globalGates.length !== 5) throw new Error(`Unexpected global-gate inventory: ${globalGates.length} (expected 5)`);

const globalGateEvidence = {
  "GATE-01": "SECURITY DEFINER + search_path='' + auth.uid() across resolve_pending_question_v1–v3; RLS/grants/cross-owner denial; stale/replay/concurrency safety; untrusted-data Chat boundary; content-free telemetry.",
  "GATE-02": "question-answer-form/conversational-questions a11y assertions; PT-BR/en + profile-timezone copy tests; desktop/Pixel-7 keyboard/focus/live-region/target Playwright including Chat and suggestion chips.",
  "GATE-03": "resolve_pending_question_v1/v2 remain byte-identical and callable; legacy answerPendingQuestion wrapper preserved; additive-only migrations; UI restorable without reversing a migration.",
  "GATE-04": "content-free resolution/preview/consequence events allowlisted, idempotent, and fail-open; product-events remote persistence smoke.",
  "GATE-05": "this traceability matrix maps every requirement to a slice, evidence owner, and closeout report.",
};
for (const { id } of globalGates) {
  if (!globalGateEvidence[id]) throw new Error(`Global gate ${id} is missing evidence`);
}

function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

function requirementRow({ id, description, family }) {
  const evidence = evidenceByFamily[family];
  const status = statusOverrides[id] ?? "complete";
  return `| \`${id}\` | ${escapeCell(description)} | ${escapeCell(evidence.slice)} | ${escapeCell(evidence.artifacts)} | ${escapeCell(evidence.local)} | ${escapeCell(evidence.remote)} | ${escapeCell(status)} |`;
}

const totalRows = requirements.length + epics.length + globalGates.length;

const matrix = [
  "# Phase 2D requirement traceability matrix",
  "",
  "Generated from `docs/PHASE_2D_PRD.md` by `scripts/generate-phase-2d-traceability.mjs` during Slice 2D.6 closeout. Do not edit by hand — run `npm run docs:phase-2d:traceability` to regenerate.",
  "",
  `Inventory: ${requirements.length} functional/non-functional requirement IDs across ${Object.keys(expectedFamilyCounts).length} families, ${epics.length} per-epic acceptance criteria, and ${globalGates.length} global gates: ${totalRows} individually mapped rows. Evidence is referenced by durable artifact and executable gate rather than copied test output.`,
  "",
  `The generator fails closed if the PRD inventory is not exactly ${requirements.length} functional IDs with the expected per-family counts, ${epics.length} epic-acceptance bullets, and ${globalGates.length} global gates, or if any family lacks an evidence mapping. Every Phase 2D requirement is delivered and verified by closeout: the phasing "unavailable-before-slice-N" constraints (2D-DISPOSITION-001, 2D-SUGGEST-001, 2D-ACTION-001) held at their slice boundary and their gated capability then shipped; the deterministic suggested-answer path fully satisfies 2D-SUGGEST-002 / 2D-OPERATIONS-003 (the additive AI extraction-schema field they name is an explicitly deferred, separately-authorized fallback that was not needed, never an unmet obligation); and the 2C-UNDO-004 hard gate behind 2D-ACTION-006 / 2D-UNDO-003 is resolved (migration 202607230050 forward-fixes undo_operation's own SQLSTATE 40001 to 55P03).`,
  "",
  "## Functional and non-functional requirements",
  "",
  "| ID | Required behavior | Owning slice(s) | Delivered artifacts | Local / browser evidence | Remote / linked evidence | Status |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...requirements.map(requirementRow),
  "",
  "## Per-epic acceptance (PRD 19.1)",
  "",
  "| Epic | Acceptance criterion | Closeout evidence |",
  "| --- | --- | --- |",
  ...epics.map(({ id, description }) => `| \`${id}\` | ${escapeCell(description)} | ${escapeCell(epicEvidence[id])} |`),
  "",
  "## Global gates (PRD 19.2)",
  "",
  "| ID | Gate | Required behavior | Evidence |",
  "| --- | --- | --- | --- |",
  ...globalGates.map(({ id, label, description }) => `| \`${id}\` | ${escapeCell(label)} | ${escapeCell(description)} | ${escapeCell(globalGateEvidence[id])} |`),
  "",
  "## Regeneration check",
  "",
  "Run `node scripts/generate-phase-2d-traceability.mjs`. The generator throws if the PRD requirement inventory, family counts, epic-acceptance count, or global-gate count drift from the closed expectation, guaranteeing this matrix stays synchronized with the PRD.",
  "",
].join("\n");

writeFileSync(outputPath, matrix, "utf8");
console.log(
  `Wrote ${outputPath} with ${totalRows} traceability rows `
  + `(${requirements.length} requirements, ${epics.length} epics, ${globalGates.length} global gates).`,
);
