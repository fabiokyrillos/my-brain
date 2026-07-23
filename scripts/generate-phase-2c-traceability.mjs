import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prdPath = resolve(repositoryRoot, "docs/PHASE_2C_PRD.md");
const outputPath = resolve(repositoryRoot, "docs/reports/PHASE_2C_TRACEABILITY_MATRIX.md");
const prd = readFileSync(prdPath, "utf8");

// Phase 2C PRD does not use the numeric/`-A01` acceptance-ID convention of Phase 2X.
// Its testable requirements are the `2C-<FAMILY>-NNN` bullets in section 8, plus the
// per-epic acceptance bullets (section 15.1) and the global gates (section 15.3).
// Each requirement is mapped by family to the owning slice(s) and durable evidence;
// per-ID status overrides record the two explicitly non-green requirements.

const evidenceByFamily = {
  "2C-EDIT": {
    slice: "2C.1; extended by 2C.2/2C.3/2C.5",
    artifacts: "candidate-edit-contract, candidate-editor, task-candidate-form; immutable-suggestion baseline",
    local: "candidate-edit-contract and candidate-editor tests; desktop/mobile candidate E2E",
    remote: "editable-candidate-confirmation smoke edit/reset/clear cases",
  },
  "2C-CONFIRM": {
    slice: "2C.1; extended by 2C.2–2C.5",
    artifacts: "confirmEntryTasks Action; versioned confirm_entry_task_candidates_v2–v6 transaction",
    local: "tasks Action, candidate-editor, and projection-mapper tests; confirmation E2E",
    remote: "editable-candidate-confirmation smoke selection/clear/stale/partial cases",
  },
  "2C-PROVENANCE": {
    slice: "every database-bearing slice (2C.1–2C.5)",
    artifacts: "tasks.source_interpretation_id/operation_key; append-only audit evidence; review projection",
    local: "review-projection and interpretations/data tests",
    remote: "pgTAP audit-evidence assertions; editable-candidate-confirmation audit checks",
  },
  "2C-IDEMPOTENCY": {
    slice: "every database-bearing slice (2C.1–2C.5)",
    artifacts: "canonical request fingerprint on undo_operations; operation-key replay guard",
    local: "candidate-edit-contract canonicalization tests",
    remote: "pgTAP replay/race assertions; editable-candidate-confirmation replay and concurrency cases",
  },
  "2C-OWNERSHIP": {
    slice: "every database-bearing slice (2C.1–2C.5)",
    artifacts: "SECURITY DEFINER RPCs with search_path=''; auth.uid() identity; closed JSON; composite-owner FKs",
    local: "tasks Action ownership tests (no client-supplied owner/task IDs)",
    remote: "pgTAP anonymous/cross-owner denial; editable-candidate-confirmation cross-owner cases",
  },
  "2C-UNDO": {
    slice: "every database-bearing slice (2C.1–2C.5)",
    artifacts: "single-transaction undo operation; compensating cancellation; immutable-suggestion preservation",
    local: "undo path unit coverage in tasks Action and projection tests",
    remote: "pgTAP undo idempotency; editable-candidate-confirmation undo cases",
  },
  "2C-RELATIONS": {
    slice: "2C.3",
    artifacts: "relation-options projection; task_projects/task_contexts/task_people junctions; owned-ID resolution",
    local: "relation-options and candidate-editor relation tests; Work/review relation display tests",
    remote: "pgTAP owned/cross-owner relation denial; owned-relations remote smoke cases",
  },
  "2C-DISPOSITION": {
    slice: "2C.4",
    artifacts: "entry_task_candidate_resolutions ledger; confirm_entry_task_candidates_v5; lifecycle projection",
    local: "lifecycle, attention-projection, and disposition mapper tests; Needs Attention E2E",
    remote: "pgTAP disposition/race/undo; disposition remote smoke; Needs Attention convergence",
  },
  "2C-STRUCTURE": {
    slice: "2C.5 (split/merge sub-epic deferred — GitHub issue #8)",
    artifacts: "confirm_entry_task_candidates_v6 graph resolution; cycle/ownership validation; parent_task_id/task_dependencies edges",
    local: "candidate-edit-contract graph canonicalization; projection-mapper graph hydration tests",
    remote: "pgTAP cycle/ownership 34/34; graph remote smoke parent/dependency/cycle cases",
  },
  "2C-UX": {
    slice: "every slice; aggregated in 2C.6",
    artifacts: "distinct selection/edit/validation/pending/success/conflict/failure states; no confidence in primary flow",
    local: "candidate-editor and task-candidate-form component tests; architecture guardrail",
    remote: "desktop/Pixel-7 authenticated candidate journey",
  },
  "2C-I18N": {
    slice: "every slice; aggregated in 2C.6",
    artifacts: "next-intl PT-BR/en copy for every label/hint/error/status; locale + profile-timezone date rendering",
    local: "candidate-due-date and copy tests",
    remote: "PT-BR/en authenticated browser matrix",
  },
  "2C-A11Y": {
    slice: "every slice; aggregated in 2C.6",
    artifacts: "programmatic labels, field-associated errors, focus-return, live regions, ≥44px targets, keyboard flow",
    local: "candidate-editor accessibility assertions",
    remote: "desktop/Pixel-7 keyboard/focus/live-region/target Playwright assertions",
  },
  "2C-ANALYTICS": {
    slice: "2C.1 and Issue #3; verified every slice",
    artifacts: "content-free candidate_edit_started/candidate_edit_reset events; bounded task_candidates_confirmed counts",
    local: "product-analytics allowlist and fail-open Action tests",
    remote: "editable-candidate analytics pgTAP; product-events remote persistence smoke",
  },
  "2C-OPERATIONS": {
    slice: "every slice; closeout in 2C.6",
    artifacts: "append-only migrations 032–045; regenerated linked types; forward-only corrections",
    local: "generated-type parity and full local gate",
    remote: "migration list parity; linked db lint; cleanup verifier; fail-fast test:remote:2c aggregate",
  },
};

const expectedFamilyCounts = {
  "2C-EDIT": 8,
  "2C-CONFIRM": 13,
  "2C-PROVENANCE": 4,
  "2C-IDEMPOTENCY": 5,
  "2C-OWNERSHIP": 5,
  "2C-UNDO": 4,
  "2C-RELATIONS": 4,
  "2C-DISPOSITION": 12,
  "2C-STRUCTURE": 4,
  "2C-UX": 3,
  "2C-I18N": 2,
  "2C-A11Y": 3,
  "2C-ANALYTICS": 3,
  "2C-OPERATIONS": 2,
};

const statusOverrides = {
  "2C-STRUCTURE-004": "deferred — split/merge is an isolated, independently reversible boundary with no field/command/UX specification; tracked as GitHub issue #8. Non-blocking for the delivered 2C.5 parent/dependency outcome.",
  "2C-UNDO-004": "resolved for correct_entry_interpretation (ADR-026, migration 202607180029: 55P03, ~530ms bounded remote response). undo_operation's own distinct 40001 raise is not confirmed to hang and is recorded as an explicit non-blocking risk in SECURITY.md.",
};

const requirementPattern = /^- \*\*(2C-[A-Z][A-Z0-9]*-\d{3}):\*\*\s*(.+)$/gm;
const requirements = [...prd.matchAll(requirementPattern)].map((match) => {
  const id = match[1];
  const family = id.replace(/-\d{3}$/, "");
  return { id, description: match[2].trim(), family };
});

if (requirements.length !== 72) {
  throw new Error(`Unexpected Phase 2C functional requirement inventory: ${requirements.length} (expected 72)`);
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

const epicPattern = /^- \*\*(Epic 2C-[A-F]):\*\*\s*(.+)$/gm;
const epics = [...prd.matchAll(epicPattern)].map((match) => ({
  id: match[1],
  description: match[2].trim(),
}));
if (epics.length !== 6) throw new Error(`Unexpected epic-acceptance inventory: ${epics.length} (expected 6)`);

const epicEvidence = {
  "Epic 2C-A": "Slice 2C.1 editable-core report and gates; v2 RPC pgTAP; confirmation remote smoke; desktop/mobile E2E.",
  "Epic 2C-B": "Slice 2C.2 planning/priority/no-due report; v3 RPC and tasks_no_due_consistency_check; Work/Needs Attention convergence tests.",
  "Epic 2C-C": "Slice 2C.3 owned-relations report; v4 RPC composite-owner denial pgTAP; relation remote smoke; Work/review E2E.",
  "Epic 2C-D": "Slice 2C.4 dispositions report; resolution ledger and v5 RPC; disposition race/undo pgTAP; Needs Attention convergence.",
  "Epic 2C-E": "Slice 2C.5 subtasks/dependencies report; v6 graph RPC cycle/ownership pgTAP 34/34; graph remote smoke; split/merge deferred (issue #8).",
  "Epic 2C-F": "Slice 2C.6 closeout: convergence audit (projection guardrails green), this traceability matrix, cleanup verifier, test:remote:2c aggregate, and permanent-doc reconciliation.",
};
for (const { id } of epics) {
  if (!epicEvidence[id]) throw new Error(`Epic ${id} is missing closeout evidence`);
}

const globalGatesSection = prd.slice(
  prd.indexOf("### 15.3 Global gates"),
  prd.indexOf("## 16."),
);
const globalGates = [...globalGatesSection.matchAll(/^- ([^:]+):\s*(.+?)\.?$/gm)].map((match, index) => ({
  id: `GATE-${String(index + 1).padStart(2, "0")}`,
  label: match[1].trim(),
  description: match[2].trim(),
}));
if (globalGates.length !== 5) throw new Error(`Unexpected global-gate inventory: ${globalGates.length} (expected 5)`);

const globalGateEvidence = {
  "GATE-01": "SECURITY DEFINER + search_path='' + auth.uid() across v2–v6; pgTAP RLS/grants/cross-owner denial; content-free analytics allowlist tests.",
  "GATE-02": "candidate-editor a11y assertions; PT-BR/en + profile-timezone copy tests; desktop/Pixel-7 keyboard/focus/live-region/target Playwright.",
  "GATE-03": "all prior confirm_entry_task_candidates versions remain callable (pgTAP signature assertions); additive-only migrations; UI restorable without reversing a migration.",
  "GATE-04": "product-analytics allowlist/idempotency/fail-open tests; product-events remote persistence smoke.",
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

const matrix = [
  "# Phase 2C requirement traceability matrix",
  "",
  "Generated from `docs/PHASE_2C_PRD.md` by `scripts/generate-phase-2c-traceability.mjs` during Slice 2C.6 closeout. Do not edit by hand — run `npm run docs:phase-2c:traceability` to regenerate.",
  "",
  `Inventory: ${requirements.length} functional/non-functional requirement IDs across ${Object.keys(expectedFamilyCounts).length} families, ${epics.length} per-epic acceptance criteria, and ${globalGates.length} global gates: ${requirements.length + epics.length + globalGates.length} individually mapped rows. Evidence is referenced by durable artifact and executable gate rather than copied test output.`,
  "",
  "The generator fails closed if the PRD inventory is not exactly 72 functional IDs with the expected per-family counts, 6 epic-acceptance bullets, and 5 global gates, or if any family lacks an evidence mapping. Two requirements carry an explicit non-`complete` status and are never represented as green: `2C-STRUCTURE-004` (deferred split/merge, issue #8) and `2C-UNDO-004` (resolved for `correct_entry_interpretation`; `undo_operation`'s own `40001` raise remains a documented non-blocking risk).",
  "",
  "## Functional and non-functional requirements",
  "",
  "| ID | Required behavior | Owning slice(s) | Delivered artifacts | Local / browser evidence | Remote / linked evidence | Status |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...requirements.map(requirementRow),
  "",
  "## Per-epic acceptance (PRD 15.1)",
  "",
  "| Epic | Acceptance criterion | Closeout evidence |",
  "| --- | --- | --- |",
  ...epics.map(({ id, description }) => `| \`${id}\` | ${escapeCell(description)} | ${escapeCell(epicEvidence[id])} |`),
  "",
  "## Global gates (PRD 15.3)",
  "",
  "| ID | Gate | Required behavior | Evidence |",
  "| --- | --- | --- | --- |",
  ...globalGates.map(({ id, label, description }) => `| \`${id}\` | ${escapeCell(label)} | ${escapeCell(description)} | ${escapeCell(globalGateEvidence[id])} |`),
  "",
  "## Regeneration check",
  "",
  "Run `node scripts/generate-phase-2c-traceability.mjs`. The generator throws if the PRD requirement inventory, family counts, epic-acceptance count, or global-gate count drift from the closed expectation, guaranteeing this matrix stays synchronized with the PRD.",
  "",
].join("\n");

writeFileSync(outputPath, matrix, "utf8");
console.log(
  `Wrote ${outputPath} with ${requirements.length + epics.length + globalGates.length} traceability rows `
  + `(${requirements.length} requirements, ${epics.length} epics, ${globalGates.length} global gates).`,
);
