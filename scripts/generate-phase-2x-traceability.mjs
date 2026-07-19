import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prdPath = resolve(repositoryRoot, "docs/PHASE_2X_PRD.md");
const outputPath = resolve(repositoryRoot, "docs/reports/PHASE_2X_TRACEABILITY_MATRIX.md");
const prd = readFileSync(prdPath, "utf8");

const evidenceByFamily = {
  ASY: {
    epic: "Epic 1; Slices 2X.3–2X.5",
    artifacts: "migrations 025–027; capture/reprocessing RPCs; leased entry worker; receipt UI",
    local: "capture/action/receipt tests; entry-worker and dispatch tests; intelligent-capture E2E",
    remote: "jobs, entry-processing, and baseline smokes",
  },
  RET: {
    epic: "Epic 1; Slices 2X.3–2X.5 and 2X.17",
    artifacts: "leased retries, bounded attempts, reaper, safe retry UI/action",
    local: "entry-worker/action tests; recoverable and terminal retry E2E",
    remote: "jobs and entry-processing smokes",
  },
  NY: {
    epic: "Epic 2; Slices 2X.10–2X.11",
    artifacts: "migrations 030–031; list_needs_attention; Home and Inbox projections/UI",
    local: "attention projection/action/list/item tests; intelligent-capture E2E",
    remote: "daily-cycle smoke",
  },
  STA: {
    epic: "Epic 3; Slices 2X.1 and 2X.6",
    artifacts: "daily-cycle lifecycle contract and shared Home/Inbox projection",
    local: "lifecycle and lifecycle-consistency tests; intelligent-capture E2E",
    remote: "daily-cycle smoke",
  },
  REV: {
    epic: "Epic 4; Slices 2X.8–2X.9",
    artifacts: "review/technical projections; decision-first review; progressive disclosure",
    local: "entry-review, review-projection, and technical-details tests; intelligent-capture E2E",
    remote: "interpretations and daily-cycle smokes",
  },
  COH: {
    epic: "Epic 5; Slices 2X.7 and 2X.10",
    artifacts: "migration 028; interpretation-bound candidates; atomic confirmation; record-only guard",
    local: "attention/candidate/action tests; correction-confirmation-undo E2E",
    remote: "interpretations and daily-cycle smokes",
  },
  FLOW: {
    epic: "Epic 6; Slices 2X.6, 2X.11–2X.12, and 2X.17",
    artifacts: "shared Home/Inbox projections; canonical Work; legacy redirects; task action boundary",
    local: "Home/Inbox/Work tests; intelligent-capture and navigation E2E",
    remote: "daily-cycle and baseline smokes",
  },
  IA: {
    epic: "Epic 7; Slice 2X.13",
    artifacts: "capability/route registry; desktop groups; mobile More; locale-preserving links",
    local: "shell capability tests; desktop/mobile navigation E2E",
    remote: "authenticated linked browser matrix",
  },
  TRU: {
    epic: "Epic 8; Slice 2X.14",
    artifacts: "capability inventory; honest Home status; consumer-backed Settings and Reviews",
    local: "component/action tests; authenticated Settings/Home/Reviews E2E",
    remote: "baseline smoke and authenticated linked browser matrix",
  },
  MET: {
    epic: "Epic 9; Slices 2X.2, 2X.15, and 2X.18",
    artifacts: "migration 024; 17-event taxonomy; closed emitters; deployed worker event helper",
    local: "product-analytics and worker-event tests; full Vitest suite",
    remote: "product-events and entry-processing smokes; v13 source parity",
  },
  PROJ: {
    epic: "Epic 10; Slices 2X.1, 2X.6, 2X.8, 2X.10, 2X.12, and 2X.16",
    artifacts: "product DTOs; server-only loaders; projection mappers; architecture guardrails",
    local: "architecture, contract, mapper, and projection tests; full Vitest suite",
    remote: "daily-cycle smoke and authenticated linked browser matrix",
  },
  XG: {
    epic: "Cross-cutting; Slices 2X.1–2X.18",
    artifacts: "owner/RLS boundaries; locale/accessibility contracts; aggregate gates; permanent evidence",
    local: "full Vitest, lint, typecheck, build, and desktop/mobile Playwright matrix",
    remote: "test:remote:2x; migration/type sync; linked lint; cleanup verification",
  },
};

const requirementEvidence = new Map();
const numericIds = (prefix, start, end) => Array.from(
  { length: end - start + 1 },
  (_, index) => `${prefix}-${String(start + index).padStart(3, "0")}`,
);
const acceptanceIds = (prefix, start, end) => Array.from(
  { length: end - start + 1 },
  (_, index) => `${prefix}-A${String(start + index).padStart(2, "0")}`,
);
const addEvidence = (ids, evidence) => {
  for (const id of ids) {
    if (requirementEvidence.has(id)) throw new Error(`Duplicate evidence mapping for ${id}`);
    requirementEvidence.set(id, evidence);
  }
};

addEvidence(numericIds("ASY", 1, 3), {
  artifacts: "migration 025; `capture_entry_async`; atomic entry/job idempotency keys",
  local: "capture Action/receipt tests",
  remote: "entry-processing atomic capture, replay, and bounded-payload assertions",
});
addEvidence(numericIds("ASY", 4, 6), {
  artifacts: "existing Phase 2A jobs; one `entry.ts` extraction path; leased claim/complete/fail RPCs",
  local: "entry-worker, dispatch, usage-order, and retry tests",
  remote: "jobs and entry-processing lease/stale-worker/retry smokes",
});
addEvidence(["ASY-007"], {
  artifacts: "stable capture Action result and `CaptureReceipt` product DTO",
  local: "capture Action and receipt component tests; capture E2E",
  remote: "entry-processing receipt followed by persisted linked entry",
});
addEvidence(numericIds("ASY", 8, 12), {
  artifacts: "`QuickCaptureForm`, safe return target, success/error receipt copy, post-persistence reset",
  local: "quick-capture-form tests; desktop/mobile intelligent-capture E2E",
  remote: "linked authenticated capture journey",
});
addEvidence(numericIds("ASY", 13, 15), {
  artifacts: "recoverable product lifecycle; fail-open embedding; honest unsaved/offline copy",
  local: "lifecycle/copy/entry-worker tests; recoverable-error E2E",
  remote: "entry-processing failure/retry and baseline worker smokes",
});
addEvidence(acceptanceIds("ASY", 1, 3), {
  artifacts: "immediate durable receipt plus idempotent atomic capture contract",
  local: "capture Action/receipt tests and refresh E2E",
  remote: "provider-independent receipt, persisted Inbox row, and operation replay assertions",
});
addEvidence(acceptanceIds("ASY", 4, 5), {
  artifacts: "lease-validated persistence and recoverable atomic enqueue semantics",
  local: "entry-worker stale lease and failure tests",
  remote: "stale-worker denial, retry, and original-preservation smokes",
});
addEvidence(["ASY-A06"], {
  artifacts: "localized receipt/capture UI shared across responsive layouts",
  local: "PT-BR/en desktop/mobile Playwright matrix",
  remote: "authenticated linked browser matrix",
});

addEvidence(numericIds("RET", 1, 4), {
  artifacts: "no-redirect capture Action; allowlisted return target; explicit recent-entry link; Home revalidation",
  local: "quick-capture-form and capture Action tests; Home/FAB E2E",
  remote: "linked Home and dedicated capture journeys",
});
addEvidence(numericIds("RET", 5, 7), {
  artifacts: "rotating idempotency key, persistent recent-entry access, non-focus-stealing receipt",
  local: "consecutive-capture, focus, route, and live-region Playwright assertions",
  remote: "authenticated linked capture journey",
});
addEvidence(acceptanceIds("RET", 1, 4), {
  artifacts: "safe return/no-redirect and non-disruptive completion contract",
  local: "Home/FAB/three-capture/scroll-focus-route E2E assertions",
  remote: "desktop/mobile authenticated capture matrix",
});

addEvidence(numericIds("NY", 1, 10), {
  artifacts: "`list_needs_attention`; owner-scoped attention projection; supported reason/action union",
  local: "attention projection/action/list/item tests",
  remote: "daily-cycle qualification, exclusion, grouping, ownership, and recalculation smoke",
});
addEvidence(numericIds("NY", 11, 15), {
  artifacts: "Home preview; Inbox `needs-you` view; keyset cursor and deterministic ordering",
  local: "needs-attention UI/pagination tests; Home/Inbox E2E",
  remote: "daily-cycle queue resolution/isolation/pagination smoke",
});
addEvidence(acceptanceIds("NY", 1, 6), {
  artifacts: "closed attention reason/action projection with live recalculation",
  local: "ready/candidate/question/retry/no-false-control tests and E2E",
  remote: "daily-cycle inclusion/exclusion and resolution assertions",
});

addEvidence(numericIds("STA", 1, 7), {
  artifacts: "single `resolveDailyCycleLifecycle` mapper and shared product state DTO",
  local: "complete lifecycle matrix, consistency, Home/Inbox projection tests",
  remote: "daily-cycle current-state and consistency smoke",
});
addEvidence(numericIds("STA", 8, 10), {
  artifacts: "sanitized product errors; separate technical-details projection; typed localized copy",
  local: "copy, entry-review, technical-details, and architecture tests",
  remote: "authenticated PT-BR/en review journey",
});
addEvidence(acceptanceIds("STA", 1, 4), {
  artifacts: "architecture guardrails plus fail-closed localized lifecycle mapping",
  local: "source-text guardrails and full lifecycle/copy matrix",
  remote: "Home/Inbox consistency and bilingual browser assertions",
});

addEvidence(numericIds("REV", 1, 6), {
  artifacts: "decision-first `EntryReview`; collapsed accessible technical details; product-only primary DTO",
  local: "entry-review/review-projection tests; keyboard/focus Playwright assertions",
  remote: "authenticated linked review journey",
});
addEvidence(numericIds("REV", 7, 12), {
  artifacts: "human revision history; original disclosure; distinct retry/reprocess copy; immutable correction provenance",
  local: "review/technical projection and interpretation Action tests; correction/reprocess E2E",
  remote: "interpretation revisions and daily-cycle smokes",
});
addEvidence(acceptanceIds("REV", 1, 3), {
  artifacts: "primary product review separated from technical snapshot",
  local: "initial-view/no-technical-label assertions and details projection tests",
  remote: "authenticated review matrix",
});
addEvidence(acceptanceIds("REV", 4, 5), {
  artifacts: "append-only correction/undo and provenance-aware reprocessing",
  local: "interpretation/action tests and correction/undo/reprocess E2E",
  remote: "interpretation immutability/audit/undo and entry reprocess smokes",
});

addEvidence(numericIds("COH", 1, 4), {
  artifacts: "migration 028 provenance; current-interpretation candidate filter; record-only guard",
  local: "candidate validity, review projection, and task-candidate form tests",
  remote: "daily-cycle stale/current/record-only assertions",
});
addEvidence(numericIds("COH", 5, 9), {
  artifacts: "materialized task provenance; compensating undo; answered-question and reprocess recalculation",
  local: "work/attention/interpretation tests; confirmation-question-undo E2E",
  remote: "daily-cycle correction/confirmation/question/undo and interpretation smokes",
});
addEvidence(numericIds("COH", 10, 11), {
  artifacts: "central domain validity helper and fail-closed needs-attention projection",
  local: "architecture guardrail and projection fallback tests",
  remote: "daily-cycle inconsistency and safe concurrency assertions",
});
addEvidence(acceptanceIds("COH", 1, 3), {
  artifacts: "interpretation-scoped validity and record-only enforcement",
  local: "correction/record-only/stale candidate tests and E2E",
  remote: "daily-cycle stale rejection and record-only smoke",
});
addEvidence(acceptanceIds("COH", 4, 6), {
  artifacts: "durable Work task; provenance-bearing action DTO; atomic confirmation conflict",
  local: "Work persistence and action availability tests; concurrency E2E",
  remote: "daily-cycle task survivability and bounded race smoke",
});

addEvidence(numericIds("FLOW", 1, 8), {
  artifacts: "Home capture, Needs Attention preview, real today/waiting/question links, honest empty/mobile layout",
  local: "Home projection/component tests; responsive intelligent-capture E2E",
  remote: "authenticated Home journey",
});
addEvidence(numericIds("FLOW", 9, 14), {
  artifacts: "Inbox product rows, projected filters, original-preserving failure UI, locale-aware pagination",
  local: "Inbox projection/item tests; filter/pagination E2E",
  remote: "daily-cycle and authenticated Inbox journey",
});
addEvidence(numericIds("FLOW", 15, 21), {
  artifacts: "canonical Work views, safe legacy redirects, existing task actions, localized state and honest waiting copy",
  local: "Work projection/view/action/architecture tests; navigation E2E",
  remote: "authenticated Work journey and baseline task behavior",
});
addEvidence(acceptanceIds("FLOW", 1, 2), {
  artifacts: "one-action Home destinations and shared Home/Inbox state projection",
  local: "Home/Inbox consistency and route E2E",
  remote: "authenticated desktop/mobile journey",
});
addEvidence(acceptanceIds("FLOW", 3, 5), {
  artifacts: "canonical Work actions plus shared responsive navigation contract",
  local: "Work action, clickability, desktop/mobile shell tests",
  remote: "authenticated Work/navigation matrix",
});

addEvidence(numericIds("IA", 1, 9), {
  artifacts: "single shell capability registry; four primary destinations; grouped secondary/global capabilities",
  local: "capabilities tests and desktop/mobile navigation E2E",
  remote: "authenticated linked navigation matrix",
});
addEvidence(numericIds("IA", 10, 13), {
  artifacts: "accessible More menu; deterministic active aliases; retained destinations; safe redirects",
  local: "Escape/focus/touch/active-route/locale tests",
  remote: "desktop/mobile PT-BR/en route matrix",
});
addEvidence(acceptanceIds("IA", 1, 2), {
  artifacts: "complete capability inventory and frequency-ranked navigation",
  local: "all-destination and primary-vs-secondary navigation assertions",
  remote: "authenticated desktop/mobile navigation",
});
addEvidence(acceptanceIds("IA", 3, 4), {
  artifacts: "DOM/visual order, 44px targets, and locale-preserving link builder",
  local: "keyboard/touch/locale route assertions",
  remote: "mobile and bilingual linked navigation",
});

addEvidence(numericIds("TRU", 1, 5), {
  artifacts: "observable Home status and consumer-backed Settings capability registry",
  local: "Home status, Settings payload/presentation, and capability tests",
  remote: "authenticated Home/Settings journey",
});
addEvidence(numericIds("TRU", 6, 8), {
  artifacts: "advanced model/cost disclosure with recommended default and secondary cost route",
  local: "Settings/review/cost presentation tests and E2E",
  remote: "authenticated Settings/cost journey and AI ledger baseline",
});
addEvidence(numericIds("TRU", 9, 12), {
  artifacts: "typed lifecycle/error copy and promise-to-consumer evidence inventory",
  local: "copy and capability inventory tests; bilingual E2E",
  remote: "authenticated product journey",
});
addEvidence(acceptanceIds("TRU", 1, 5), {
  artifacts: "visible-capability registry and bilingual promise/copy guardrails",
  local: "consumer-evidence, hidden-future-control, Home, and copy tests",
  remote: "authenticated Home/Settings/Reviews matrix",
});

const metricEventEvidence = {
  "MET-001": ["closed capture-start interaction emitter", "interaction/event contract tests", "product-events taxonomy and capture E2E"],
  "MET-002": ["post-persistence capture success Action emitter", "capture Action event-order tests", "product-events idempotency and capture E2E"],
  "MET-003": ["capture failure Action emitter", "capture Action failure/event tests", "product-events allowlist smoke"],
  "MET-004": ["capture enqueue outcome emitter", "capture Action event-order tests", "entry-processing plus product-events smokes"],
  "MET-005": ["worker persisted-completion emitter", "worker-events and usage-order tests", "entry-processing persisted outcome/dedup smoke"],
  "MET-006": ["worker persisted-failure emitter", "worker-events and entry-worker tests", "entry-processing failure outcome smoke"],
  "MET-007": ["confirmed-visible Needs Attention view emitter", "interaction visibility/dedupe tests", "product-events taxonomy and attention E2E"],
  "MET-008": ["closed Needs Attention item-open emitter", "attention interaction tests", "product-events taxonomy and attention E2E"],
  "MET-009": ["confirmed-visible interpretation-review emitter", "review interaction tests", "product-events taxonomy and review E2E"],
  "MET-010": ["post-correction Action emitter", "interpretation Action event-order tests", "product-events taxonomy and correction E2E"],
  "MET-011": ["technical-details disclosure emitter", "technical details interaction tests", "product-events taxonomy and review E2E"],
  "MET-012": ["visible task-candidate presentation emitter", "candidate interaction tests", "product-events taxonomy and candidate E2E"],
  "MET-013": ["post-confirmation Action emitter", "task Action event-order tests", "product-events taxonomy and confirmation E2E"],
  "MET-014": ["post-answer pending-question emitter", "answer Action event-order tests", "product-events taxonomy and question E2E"],
  "MET-015": ["recoverable retry request emitter", "retry Action and worker-event tests", "product-events taxonomy and retry E2E"],
  "MET-016": ["confirmed-visible Work view emitter", "Work interaction tests", "product-events taxonomy and Work E2E"],
  "MET-017": ["post-task-status Action emitter", "task-status Action event tests", "product-events taxonomy and task E2E"],
};
for (const [id, [artifacts, local, remote]] of Object.entries(metricEventEvidence)) {
  addEvidence([id], { artifacts, local, remote });
}
addEvidence(numericIds("MET", 18, 21), {
  artifacts: "best-effort analytics boundary and deterministic operation/session idempotency",
  local: "analytics-boundary, Action-order, interaction-dedupe, and worker-event tests",
  remote: "product-events fail-open/idempotency/repeat and entry dedup smokes",
});
addEvidence(numericIds("MET", 22, 24), {
  artifacts: "forced-RLS private ledger, documented purpose/retention, `is_synthetic` classification",
  local: "privacy/allowlist/security contract tests",
  remote: "product-events ownership/RLS/service-role/payload/synthetic-cleanup smoke",
});
addEvidence(acceptanceIds("MET", 1, 5), {
  artifacts: "content-free funnel contract with idempotent fail-open synthetic-aware emitters",
  local: "complete product-analytics and worker-event test set",
  remote: "17-event product smoke, linked E2E event rows, and post-delete cascade check",
});

addEvidence(numericIds("PROJ", 1, 6), {
  artifacts: "product DTOs and separate review/technical contracts; no raw rows/scores in central components",
  local: "architecture source guards and projection/component tests",
  remote: "authenticated Home/Inbox/Review/Work matrix",
});
addEvidence(numericIds("PROJ", 7, 13), {
  artifacts: "server-only feature loaders, stable discriminated Actions, localized copy boundary, validated fail-closed mappers",
  local: "Action-result, architecture, contract, mapper, and fallback tests",
  remote: "daily-cycle and authenticated surface smokes",
});
addEvidence(numericIds("PROJ", 14, 20), {
  artifacts: "provenance-bearing serializable DTOs; reused lifecycle/candidate rules; owner-scoped loaders/RPCs",
  local: "architecture, lifecycle consistency, candidate validity, and serialization tests",
  remote: "daily-cycle ownership/concurrency/undo plus browser matrix",
});
addEvidence(acceptanceIds("PROJ", 1, 4), {
  artifacts: "product-only surface DTOs and explicitly separate technical payload",
  local: "five-surface architecture guardrail and projection tests",
  remote: "authenticated Home/Inbox/Review/Work journeys",
});
addEvidence(acceptanceIds("PROJ", 5, 8), {
  artifacts: "contract matrices, isolated status mapper, shared candidate-validity boundary, concrete loaders only",
  local: "contract/fallback/architecture/domain-validity tests",
  remote: "daily-cycle consistency and full local/linked gate",
});

addEvidence(numericIds("XG", 1, 10), {
  artifacts: "immutable original/revisions; append-only migrations; RLS/ownership; undo; AI ledger; leased single extraction path",
  local: "foundation, interpretation, worker, architecture, and security tests",
  remote: "jobs, interpretations, entry-processing, baseline, migration sync, and linked lint",
});
addEvidence(numericIds("XG", 11, 17), {
  artifacts: "semantic progressive disclosure, live regions, focus-visible keyboard flow, 44px targets, accessible More",
  local: "desktop/mobile keyboard/focus/live-region/touch Playwright assertions",
  remote: "authenticated responsive browser matrix",
});
addEvidence(numericIds("XG", 18, 21), {
  artifacts: "typed PT-BR/en copy, profile-timezone formatting, enum-free fallbacks, distinct error phases",
  local: "copy/date/lifecycle tests and bilingual E2E",
  remote: "PT-BR/en authenticated browser matrix",
});
addEvidence(["XG-022"], {
  artifacts: "atomic capture RPC returns before the queued worker/provider path",
  local: "capture Action no-provider dependency and receipt tests",
  remote: "entry receipt verified before asynchronous scheduled completion",
});
addEvidence(numericIds("XG", 23, 25), {
  artifacts: "bounded Home/Inbox loaders, separate technical payload, keyset Needs Attention query",
  local: "projection pagination/architecture tests",
  remote: "daily-cycle deterministic pagination smoke",
});
addEvidence(["XG-026"], {
  artifacts: "reference latency target retained in PRD; duration telemetry is instrumented",
  local: "capture timing and analytics contract tests",
  remote: "remote event latency samples only; no percentile/SLO dataset",
  status: "documented limitation — client/server p95 targets were not measured and are not claimed green",
});
addEvidence(numericIds("XG", 27, 30), {
  artifacts: "server-reconstructed projections, post-persistence receipts, operation idempotency, fail-closed lifecycle",
  local: "refresh/receipt/idempotency/fallback tests and E2E",
  remote: "entry replay, worker event dedup, and daily-cycle failure-state smokes",
});
addEvidence(numericIds("XG", 31, 35), {
  artifacts: "owner-scoped loaders/RPCs, technical-route isolation, telemetry allowlist, sanitized details, safe return URLs",
  local: "security/architecture/return-target/product-analytics tests",
  remote: "RLS/cross-owner/payload smokes and authenticated route matrix",
});

const requirementPattern = /^- \*\*([A-Z]+-(?:\d{3}|A\d{2})):\*\*\s*(.+)$/gm;
const requirements = [...prd.matchAll(requirementPattern)].map((match) => ({
  id: match[1],
  description: match[2].trim(),
  family: match[1].split("-")[0],
}));

const functionalCount = requirements.filter(({ id }) => !/-A\d{2}$/.test(id)).length;
const familyAcceptanceCount = requirements.length - functionalCount;
if (requirements.length !== 253 || functionalCount !== 195 || familyAcceptanceCount !== 58) {
  throw new Error(`Unexpected PRD requirement inventory: ${requirements.length}/${functionalCount}/${familyAcceptanceCount}`);
}
if (requirements.some(({ family }) => !evidenceByFamily[family])) {
  throw new Error("A PRD family is missing traceability evidence");
}
const missingEvidence = requirements.filter(({ id }) => !requirementEvidence.has(id)).map(({ id }) => id);
const extraEvidence = [...requirementEvidence.keys()].filter((id) => !requirements.some((requirement) => requirement.id === id));
if (missingEvidence.length > 0 || extraEvidence.length > 0) {
  throw new Error(`Per-ID evidence mismatch; missing=${missingEvidence.join(",")}; extra=${extraEvidence.join(",")}`);
}

const globalSection = prd.slice(prd.indexOf("## 18. Critérios globais de aceitação"), prd.indexOf("## 19. Métricas de sucesso da fase"));
const globalCriteria = [...globalSection.matchAll(/^(\d+)\.\s+(.+?);?$/gm)].map((match) => ({
  id: `GAC-${match[1].padStart(2, "0")}`,
  description: match[2].replace(/;$/, "").trim(),
  number: Number(match[1]),
}));
if (globalCriteria.length !== 30) throw new Error(`Unexpected global acceptance inventory: ${globalCriteria.length}`);

const globalFamily = [
  "ASY", "ASY", "RET", "ASY", "STA", "NY", "REV", "REV", "COH", "COH",
  "COH", "FLOW", "FLOW", "IA", "IA", "TRU", "PROJ", "PROJ", "PROJ", "PROJ",
  "MET", "XG", "XG", "XG", "XG", "XG", "XG", "XG", "TRU", "TRU",
];
const globalEvidenceSource = [
  "ASY-001", "RET-001", "XG-001", "ASY-006", "STA-003", "NY-003", "REV-001", "REV-A03", "REV-010", "COH-A03",
  "COH-A02", "FLOW-001", "FLOW-015", "IA-002", "IA-009", "TRU-A01", "PROJ-002", "PROJ-005", "PROJ-001", "PROJ-009",
  "MET-A01", "XG-018", "XG-018", "XG-011", "XG-003", "XG-002", "XG-001", null, null, "TRU-A01",
];
const globalEvidenceOverrides = {
  "GAC-27": {
    artifacts: "complete Slice 2X.18 gate manifest",
    local: "80 files/443 tests, lint, typecheck, build, diff check, and desktop/mobile Playwright",
    remote: "fail-fast test:remote:2x, linked DB gates, types, and cleanup verifier",
  },
  "GAC-28": {
    artifacts: "permanent state/decision/changelog/report plus 283-row annex and sanitized evidence manifest",
    local: "traceability generator inventory assertions and documentation diff check",
    remote: "v12/v13 version, parity, Auth classification, and cleanup evidence recorded",
  },
  "GAC-29": {
    artifacts: "Slice 2X.18 diff contains closeout harness/docs only; no Phase 2C–2F product source",
    local: "git name/status and scope audit",
    remote: "only authorized process-jobs deployment; no migration or other infrastructure mutation",
  },
};

function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

function statusFor(id, evidence) {
  if (evidence.status) return evidence.status;
  if (id === "REV-A02") return "complete — executable UI assertion; no static screenshot retained";
  return "complete";
}

function rowFor({ id, description, family }, evidenceSourceId = id, evidenceOverride = null) {
  const evidence = {
    ...evidenceByFamily[family],
    ...(evidenceSourceId ? requirementEvidence.get(evidenceSourceId) : {}),
    ...(evidenceOverride ?? {}),
  };
  return `| \`${id}\` | ${escapeCell(description)} | ${evidence.epic} | ${evidence.artifacts} | ${evidence.local} | ${evidence.remote} | ${statusFor(id, evidence)} |`;
}

const matrix = [
  "# Phase 2X requirement traceability matrix",
  "",
  "Generated from `docs/PHASE_2X_PRD.md` by `scripts/generate-phase-2x-traceability.mjs` during Slice 2X.18 closeout.",
  "",
  "Inventory: 195 functional/non-functional requirement IDs, 58 family acceptance IDs, and all 30 numbered global acceptance criteria (given stable `GAC-01`–`GAC-30` traceability labels here): 283 individually mapped rows. Evidence is intentionally referenced by durable artifact and executable gate rather than copied test output.",
  "",
  "Each ID is mapped at requirement/subfamily granularity; the generator fails if any PRD ID lacks a specific evidence mapping. The status `complete` means the behavior is present and covered by the cited current evidence. Explicit limitations remain visible: provider-delivered email, Deno, Docker/pgTAP, two pre-existing DB lint warnings, absent static screenshots, and the unmeasured XG-026 percentile target are not represented as green gates.",
  "",
  "## PRD requirement and family-acceptance IDs",
  "",
  "| ID | Required behavior | Epic / official slices | Delivered artifacts | Local / browser evidence | Remote / linked evidence | Status |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...requirements.map((requirement) => rowFor(requirement)),
  "",
  "## Global acceptance criteria",
  "",
  "| ID | Required behavior | Primary family / delivery | Delivered artifacts | Local / browser evidence | Remote / linked evidence | Status |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...globalCriteria.map((criterion, index) => rowFor(
    { ...criterion, family: globalFamily[index] },
    globalEvidenceSource[index],
    globalEvidenceOverrides[criterion.id],
  )),
  "",
  "## Regeneration check",
  "",
  "Run `node scripts/generate-phase-2x-traceability.mjs`. The generator fails if the PRD inventory is no longer exactly 195 functional/non-functional IDs, 58 family acceptance IDs, and 30 global criteria, or if any ID lacks exactly one specific evidence mapping.",
  "",
].join("\n");

writeFileSync(outputPath, matrix, "utf8");
console.log(`Wrote ${outputPath} with ${requirements.length + globalCriteria.length} traceability rows.`);
