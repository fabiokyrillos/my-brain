import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prdPath = resolve(repositoryRoot, "docs/initiatives/phase-2e/PHASE_2E_PRD.md");
const outputPath = resolve(repositoryRoot, "docs/reports/phase-2e/PHASE_2E_TRACEABILITY_MATRIX.md");
const prd = readFileSync(prdPath, "utf8");

// The Phase 2E PRD states its testable requirements as `2E-<FAMILY>-NNN` bullets in
// section 13, its per-epic acceptance in section 19.1, and its global gates in section
// 19.2 — the same shape Phase 2C and Phase 2D used, so this generator mirrors
// `generate-phase-2d-traceability.mjs`. Each requirement is mapped by family to the
// owning slice(s) and durable evidence; the generator fails closed if the PRD inventory
// drifts from the closed expectation, guaranteeing the matrix stays synchronized.
//
// Two Phase-2E-specific notes on the family regex, both load-bearing:
//
//   * `[A-Z0-9]+` rather than `[A-Z]+`. Phase 2E is the first phase whose family names
//     carry digits — `2E-I18N` and `2E-A11Y`. A letters-only class silently drops seven
//     requirements and still produces a plausible-looking matrix, which is exactly the
//     failure a fail-closed generator exists to prevent. The expected total below is
//     122, not 115, and that difference is the whole reason this comment exists.
//   * `2E-COMMAND-017` is declared out of numeric order in the PRD (between `-008` and
//     `-009`), because revision 3 inserted it beside the requirement it qualifies. The
//     matrix preserves PRD order rather than re-sorting, so a reader can follow the
//     document; the per-family count is what the gate checks.

const expectedRequirementTotal = 122;

const expectedFamilyCounts = {
  "2E-COMMAND": 17,
  "2E-MATCH": 18,
  "2E-DISAMBIG": 5,
  "2E-PREVIEW": 7,
  "2E-UPDATE": 18,
  "2E-DESTRUCTIVE": 9,
  "2E-NOMATCH": 9,
  "2E-PROVENANCE": 3,
  "2E-IDEMPOTENCY": 4,
  "2E-OWNERSHIP": 5,
  "2E-UNDO": 7,
  "2E-UX": 2,
  "2E-I18N": 3,
  "2E-A11Y": 4,
  "2E-ANALYTICS": 6,
  "2E-OPERATIONS": 5,
};

const evidenceByFamily = {
  "2E-COMMAND": {
    slice: "2E.1; temporal lexicon extended in 2E.1, consumed from 2E.3",
    artifacts:
      "taxonomy.ts (fifteen actions as data: eligible statuses, allowed target values, changed fields, destructiveness, one-step, confirmation, undo); schema.ts (closed Zod contract, additionalProperties-equivalent rejection); vocabulary.ts (closed bilingual status/priority tables); temporal.ts (versioned bilingual lexicon + fail-closed instant resolution); lib/ai/task-command-schema.ts (response schema + prompt/strategy version constants); migration 202607250055 (ai_usage_events task_command literal in CHECK and record_ai_usage guard)",
    local:
      "schema.test.ts, taxonomy.test.ts, temporal.test.ts, policy-lock.test.ts (taxonomy/vocabulary/lexicon digests pinned to their versions), lib/ai/task-command-schema.test.ts and task-command-contract.test.ts (prompt/schema/version parity in the extraction-contract shape)",
    remote:
      "record_ai_usage task_command literal asserted by remote-supabase-smoke.mjs; phase_2e_task_command_ai_usage pgTAP in CI",
  },
  "2E-MATCH": {
    slice: "2E.2",
    artifacts:
      "migration 202607250056 (list_task_command_candidates: owner-scoped, action-eligibility-filtered, ordered before truncation, limit+1 overflow probe, normalize_entity_alias-backed); match-policy.ts (weights, thresholds, limits, evidence, score bands, TASK_MATCH_POLICY_VERSION); matching.ts (deterministic scorer, margin via calculateCandidateMargin, total ordering, evidence labels); candidates.ts (typed query client)",
    local:
      "matching.test.ts, candidates.test.ts, match-policy digests in policy-lock.test.ts, normalizer-divergence.test.ts (committed corpus characterizing normalize_entity_alias vs normalizeEntityName, incl. U+0178 and NFC/NFD), sql-reachability.test.ts, match-baseline.test.ts (2E-MATCH-018 measured baseline)",
    remote:
      "**Blocked on deployment** — list_task_command_candidates does not exist in the linked project. Specification recorded in PHASE_2E_SLICE_02_REPORT.md §11; pgTAP phase_2e_task_command_matching is the standing proof",
  },
  "2E-DISAMBIG": {
    slice: "2E.3",
    artifacts:
      "disambiguation.ts (deterministic ranked list rendered from owned rows, distinguishing evidence, no model); session.ts (explicit selection carried on the envelope, staleness witness); actions.ts selectTaskCommandCandidate",
    local: "disambiguation.test.ts, session.test.ts, preview.test.ts staleness cases, actions.test.ts selection round",
    remote: "**Blocked on deployment** — same gate as 2E-MATCH",
  },
  "2E-PREVIEW": {
    slice: "2E.3; linked effects extended by 2E.4/2E.5; creation preview in 2E.6",
    artifacts:
      "preview.ts (server-computed, willMutate:false, current/proposed per touched field, reversibility, undo window, confirmation requirement, linked effects, no_change over fields *and* relations, staleness); fingerprint.ts (sha256 over task identity, observed pre-state, canonical patch, policy version, owner, operation key); migration 202607270060 preview_task_command_creation",
    local: "preview.test.ts, fingerprint.test.ts, copy.test.ts linked-effect exhaustiveness, creation.test.ts preview cases",
    remote: "**Blocked on deployment**",
  },
  "2E-UPDATE": {
    slice: "2E.4; re-declared and extended by 2E.5",
    artifacts:
      "migration 202607260058 then 202607260059 (apply_task_command: SECURITY DEFINER, search_path='', owner + expected-pre-state gated, canonical patch, operation-key idempotency, fingerprint replay detection, closed 2E_* DETAIL vocabulary, 55P03 never 40001, reminder close-and-insert, audit actor derived from a transaction-local setting with title/description added to the watched columns, undo row before any task write); private.undo_apply_task_command_fields + registry row; apply.ts; errors.ts (ten declared tokens)",
    local: "apply.test.ts, errors.test.ts, status-vocabulary-parity.test.ts, database-types-parity.test.ts, creation-migration.test.ts AST gates",
    remote:
      "**Blocked on deployment.** CI database job is the authoritative proof: phase_2e_task_command_apply pgTAP plan(132) against a from-zero chain",
  },
  "2E-DESTRUCTIVE": {
    slice: "2E.5; surfaced in 2E.7",
    artifacts:
      "migration 202607260059 (public.task_command_confirmations; public.issue_task_command_confirmation; private.task_creation_undone shared by all three doors; confirmation gate as one guarded UPDATE after the replay branch inside the mutating transaction; grants make single-use a property of the role, not the client); confirmation.ts; recovery.ts + /app/work/cancelled route + cancelled-tasks-view.tsx; confirm-dialog.tsx",
    local: "apply.test.ts destructive cases, recovery.test.ts, command-console.test.tsx dialog semantics/focus trap, copy.test.ts four destructive disclosures",
    remote: "**Blocked on deployment.** phase_2e_task_command_destructive pgTAP plan(91) covers both orderings of the cancel/creation-undo collision",
  },
  "2E-NOMATCH": {
    slice: "2E.6",
    artifacts:
      "migration 202607270060 (canonical creation payload, owned relation resolution, preview_task_command_creation, issue_task_command_creation_confirmation, create_task_command, private.undo_create_task_command, shared creation-family guards, post-deploy assertions); creation.ts (deterministic task-like rule, one bounded clarification with a terminal continuation)",
    local: "creation.test.ts, creation-migration.test.ts, creation-race-gate.test.ts, actions.test.ts clarify round",
    remote:
      "local-task-command-creation-race.mjs runs in the CI database job as a real two-session same-key PostgREST proof; disposable remote smoke **blocked on deployment**",
  },
  "2E-PROVENANCE": {
    slice: "2E.1 (ledger), 2E.4 (audit actor), 2E.7 (caller ordering)",
    artifacts:
      "record_ai_usage task_command literal (202607250055); ledger write strictly before any dependent domain write in actions.ts, including for a parse that is billed and then fails validation; audit_task_change derives its actor from a transaction-local setting defaulting to 'user'; match_policy_version stamped on every match decision and mutation",
    local: "actions.test.ts ordering assertions, apply.test.ts audit-actor cases, policy-lock.test.ts version pinning",
    remote: "phase_2e_task_command_ai_usage and undo_operation_routing pgTAP in CI",
  },
  "2E-IDEMPOTENCY": {
    slice: "2E.4; creation family in 2E.6",
    artifacts:
      "operation_key namespaced per RPC with the unique partial index on undo_operations enforcing uniqueness in the database; canonical request_fingerprint stable under key reordering and insignificant whitespace; replay re-selects the undo row FOR UPDATE and returns the original outcome marked replayed",
    local: "fingerprint.test.ts canonicalization, apply.test.ts replay/mismatch, creation.test.ts replay-after-undo",
    remote: "creation race proof in the CI database job; pgTAP replay sections in apply/destructive/creation",
  },
  "2E-OWNERSHIP": {
    slice: "every database-bearing slice (2E.2, 2E.4, 2E.5, 2E.6)",
    artifacts:
      "owner predicate inside each SECURITY DEFINER RPC, forced RLS on every touched table, owner filtering of ranking input, composite-FK ownership for relations, no widened grant, no anon execute; a command naming another owner's task is indistinguishable from one naming nothing",
    local: "candidates.test.ts owner scoping, apply.test.ts cross-owner cases, architecture boundary gates",
    remote:
      "**Two-owner disposable smoke blocked on deployment** (2E-OWNERSHIP-004's remote half). pgTAP proves cross-owner denial from zero in CI",
  },
  "2E-UNDO": {
    slice: "2E.4; extended 2E.5/2E.6; listed 2E.7",
    artifacts:
      "one registered private handler and one registry row per operation, proven by the fail-closed registry trigger; handlers restore fields *and* linked reminder effects by close-and-insert; refuse when a newer change would be discarded or when the creation-undo premise is invalidated (2E_CREATION_UNDONE); undo-listing.ts task-scoped owner-scoped projection (2E-UNDO-005); 24h window disclosed, expired vs unavailable distinct",
    local: "undo-listing.test.ts, apply.test.ts undo cases, copy.test.ts window disclosure, errors.test.ts undo tokens",
    remote: "undo_operation_routing and the three Phase 2E pgTAP files in CI",
  },
  "2E-UX": {
    slice: "2E.3 declared; 2E.7 presented",
    artifacts:
      "outcomes.ts (TASK_COMMAND_OUTCOMES — the twelve of 2E-UX-001 declared once as a runtime array so the exhaustiveness test can iterate); console-state.ts closed control/intent vocabularies; command-console.tsx explicit, recoverable failure states",
    local: "copy.test.ts exhaustiveness against the declared list, console-state and command-console.test.tsx, actions.test.ts guard paths (no Server Action throws)",
    remote: "e2e/task-command.spec.ts (credential-free) on desktop + mobile in CI",
  },
  "2E-I18N": {
    slice: "2E.1 onward; completed 2E.7",
    artifacts:
      "copy.ts typed feature module per ADR-036 covering pt-BR and en exhaustively — every outcome, every declared 2E_* detail code, every linked effect, every unsupported reason; dates rendered in the caller's own timezone resolved server-side",
    local: "copy.test.ts (drives off the declared code list, not a hand-written key list), preview.test.ts timezone rendering",
    remote: "e2e/task-command.spec.ts across both locales",
  },
  "2E-A11Y": {
    slice: "2E.7",
    artifacts:
      "command-console.tsx (keyboard-operable disambiguation and confirmation, focus moved deterministically after every async action, live-region announcement with an explicit role); confirm-dialog.tsx (hand-rolled modal with dialog role, accessible name and description, and a focus trap that skips hidden inputs — ADR-051 records why a native <dialog> could not be used)",
    local: "command-console.test.tsx and confirm-dialog assertions (both a11y defects this slice shipped were found by these tests)",
    remote: "e2e/task-command.spec.ts desktop + mobile",
  },
  "2E-ANALYTICS": {
    slice: "2E.7",
    artifacts:
      "migration 202607280061 (task_command surface plus four event names in all three allowlists — productSurfaces, the product_events CHECK, and the p_surface guard inside record_product_event — with three new property validators, both private functions re-declared in full); analytics.ts (four content-free payload builders; bands derived from match-policy rather than restated); scripts/product-event-vocabulary.mjs so the remote smoke reads the vocabulary instead of restating it",
    local: "analytics.test.ts (band mapping, content-free import guard, bounded-vocabulary parity), product-analytics/contracts.test.ts",
    remote: "remote-product-events-smoke.mjs now imports the vocabulary (2E-ANALYTICS-006); persistence assertions **blocked on deployment**",
  },
  "2E-OPERATIONS": {
    slice: "every slice; aggregated at 2E.8",
    artifacts:
      "seven additive forward-only migrations 202607250055–202607280061, chain reset from zero proven in CI on every run; hand-written generated types with migration-source, content and executable catalog parity contracts (ADR-041); scripts/verify-phase-2e-cleanup.mjs; scripts/remote-phase-2e-smoke.mjs; per-slice rollback recorded as 'stop routing to the new surface', never a reverted migration",
    local: "database-types-parity.test.ts, creation-migration.test.ts, sql-reachability.test.ts, this generator's own fail-closed inventory gate",
    remote:
      "**2E-OPERATIONS-003/004 blocked on deployment.** The focused per-slice smokes and the aggregate remote smoke are written and wired to npm scripts but cannot run until migrations 202607250055–202607280061 reach the linked project, which is at 202607250054",
  },
};

// Requirements NOT delivered by Phase 2E. Every entry is repeated with the same
// justification in the phase report's deferred-work section — this map is the single
// place the matrix and the report agree, and an entry with no justification is a bug.
//
// The distinction from `deliveredWithNote` below is the headline count, so it is drawn
// on the requirement's own text rather than on how satisfying the outcome feels.
const notDelivered = {
  "2E-COMMAND-012":
    "NOT DELIVERED — reclassified to Phase 2F in PRD revision 4 (ADR-053). Prompt and strategy versions travel on the command session and are pinned as build constants by task-command-contract.test.ts, but no Phase 2E RPC and no ai_usage_events column persists them. Closing it requires drop-and-recreate of apply_task_command (~1,460 lines), create_task_command, or record_ai_usage — the last shared by every AI path in the product and pinned by two ::regprocedure casts and a has_function array across two pgTAP files. Attribution today is by ai_usage_events.created_at joined to the deploy history",
};

// Delivered by the 2026-07-28 deployment, having been blocked on it and on nothing
// else. Kept as named entries rather than folded into the default text, because the
// evidence for each is a specific executed gate rather than a shipped artifact — and
// because the first real run of that gate is what proved the tooling wrong (PR #20).
const deliveredOnDeployment = {
  "2E-OWNERSHIP-004":
    "delivered. The database half was already proven by pgTAP from an empty database in CI; the disposable two-owner remote half now executes against the linked project — each owner ranks only its own rows, and the other owner's identically-titled task is absent rather than outranked (remote-phase-2e-smoke.mjs, 23 assertions, exit 0)",
  "2E-OPERATIONS-003":
    "delivered. The focused per-slice coverage is discharged by the aggregate smoke, which executes every slice's remote obligation in one deterministic disposable run against the deployed chain: ownership isolation, matching and ordering, apply and replay, destructive confirmation, undo, and creation",
  "2E-OPERATIONS-004":
    "delivered. The aggregate smoke runs against the linked project and passes 23 assertions, exit 0. It remains drain-safe by construction — it creates no entries, so no interpret_entry job is enqueued and the per-minute pg_cron/pg_net tick has nothing to race — and its fail-closed cleanup is verified by verify-phase-2e-cleanup.mjs reporting zero disposable users and zero orphans",
};

// Delivered, with a scope the reader must carry forward. Counted as delivered, because
// the requirement's own text is satisfied — recording it here rather than silently is
// what stops a Phase 2F comparison being made against the wrong thing.
const deliveredWithNote = {
  "2E-MATCH-018":
    "delivered, with its measurement scope stated: the baseline covers the scoring layer against declared SQL verdicts, not end-to-end matching, because the corpus supplies prefilterTier/tokenOverlap/queryTokenCount by hand. A sibling assertion proves every hand-written triple is one list_task_command_candidates could actually produce, so the rates are not measured over impossible inputs. Any Phase 2F comparison must use this scope or re-measure",
};

const statusOverrides = { ...notDelivered, ...deliveredOnDeployment, ...deliveredWithNote };

const requirementPattern = /^- \*\*(2E-[A-Z0-9]+-\d{3}):\*\*\s*(.+)$/gm;
const requirements = [...prd.matchAll(requirementPattern)].map((match) => ({
  id: match[1],
  description: match[2].trim(),
  family: match[1].replace(/-\d{3}$/, ""),
}));

if (requirements.length !== expectedRequirementTotal) {
  throw new Error(
    `Unexpected Phase 2E functional requirement inventory: ${requirements.length} (expected ${expectedRequirementTotal})`,
  );
}
const seen = new Set();
for (const { id } of requirements) {
  if (seen.has(id)) throw new Error(`Duplicate requirement id ${id}`);
  seen.add(id);
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
for (const id of Object.keys(statusOverrides)) {
  if (!seen.has(id)) throw new Error(`statusOverrides names ${id}, which is not a PRD requirement`);
}

const epicPattern = /^- \*\*(Epic 2E-[A-H]):\*\*\s*(.+)$/gm;
const epics = [...prd.matchAll(epicPattern)].map((match) => ({
  id: match[1],
  description: match[2].trim(),
}));
if (epics.length !== 8) throw new Error(`Unexpected epic-acceptance inventory: ${epics.length} (expected 8)`);

const epicEvidence = {
  "Epic 2E-A":
    "Slice 2E.1 report; taxonomy/schema/vocabulary/temporal as data with digests pinned to their versions; prompt/schema/version parity test; migration 202607250055 widens the ai_usage_events CHECK and the record_ai_usage guard together. No search and no mutation exist in this slice.",
  "Epic 2E-B":
    "Slice 2E.2 report; migration 202607250056 list_task_command_candidates — owner-scoped, action-eligibility-filtered, ordered before truncation, limit+1 overflow probe; one versioned policy module; adversarial fixtures for identical titles, near-equal candidates, cross-owner rows, ineligible statuses, overflow and injection strings; measured baseline in match-baseline.test.ts. No mutation.",
  "Epic 2E-C":
    "Slice 2E.3 report; read-only server-computed preview with willMutate:false, linked effects, undo-window disclosure, fingerprint, no_change over fields and relations, staleness; deterministic disambiguation rendered without a model. No mutation.",
  "Epic 2E-D":
    "Slice 2E.4 report; migration 202607260058 apply_task_command — the first RPC in this codebase that mutates a task — with expected-pre-state gating, operation-key idempotency, fingerprint replay detection, the closed 2E_* vocabulary, real-actor audit, reminder close-and-insert, and a registered undo handler. pgTAP plan(132).",
  "Epic 2E-E":
    "Slice 2E.5 report; migration 202607260059 — server-issued single-use confirmation enforced by grants and one guarded UPDATE inside the mutating transaction; restore_task; the cancelled-task affordance; both orderings of the cancel/creation-undo collision closed by one shared predicate at all three doors. pgTAP plan(91). ADR-047/048/049.",
  "Epic 2E-F":
    "Slice 2E.6 report; migration 202607270060 creation family sharing the mutation primitives, previewed and confirmed, replay-safe, audited, undoable; deterministic task-like rule and a one-shot terminal clarification. pgTAP plan(127) plus a real two-session PostgREST race in the CI database job.",
  "Epic 2E-G":
    "Slice 2E.7 report; one command console on Chat (list and conversation) and the task surface behind a single runTaskCommand dispatcher; /app/work/cancelled recovery route; migration 202607280061 adds the surface to all three allowlists; content-free analytics; a11y and both locales proven by component tests and a credential-free Playwright spec. ADR-050/051/052. **Authenticated online journeys remain blocked on deployment.**",
  "Epic 2E-H":
    "Slice 2E.8 closeout: this traceability matrix and its fail-closed generator, the cleanup verifier, the aggregate remote smoke, the convergence audit (which found and fixed an orphaned vocabulary version and an uncalled self-check), permanent-doc reconciliation, and the phase report. **Tag and release are withheld: nothing is merged or deployed.**",
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
  "GATE-01":
    "SECURITY DEFINER + search_path='' + auth.uid() on every Phase 2E RPC; forced RLS and unwidened grants; cross-owner denial without disclosure; closed command schema; confirmation evidence the client cannot mint; stale/replay/concurrency safety; command text fenced as data with no task row in any prompt; content-free telemetry. Proven by pgTAP from an empty database in CI.",
  "GATE-02":
    "Candidate generation, ordering, scoring, margins, thresholds, temporal resolution and the apply decision are pure over owned rows plus an injected clock and timezone, unit-tested without a model, and version-pinned by digest. No destructive action is one-step eligible — asserted per action, not once.",
  "GATE-03":
    "Every reversible action has a registered private handler proven to restore pre-state and linked reminder effects, safe under repetition, refusing to discard newer work; the 24h window is disclosed wherever reversibility is claimed; restore_task is the escape beyond it.",
  "GATE-04":
    "Keyboard operation, deterministic focus movement, live-region announcement and dialog semantics asserted in component tests; pt-BR/en copy driven by the declared code list; timezone-correct dates. Desktop and Pixel 7 in CI via the credential-free spec; **authenticated journeys blocked on deployment**.",
  "GATE-05":
    "This matrix maps all 122 requirements, 8 epics and 5 gates to a slice, an evidence owner and a closeout report, and its generator fails closed when the PRD inventory changes without the matrix being regenerated.",
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

const notDeliveredCount = Object.keys(notDelivered).length;
const notedCount = Object.keys(deliveredWithNote).length;
const deliveredCount = requirements.length - notDeliveredCount;
const totalRows = requirements.length + epics.length + globalGates.length;

const matrix = [
  "# Phase 2E requirement traceability matrix",
  "",
  "Generated from `docs/initiatives/phase-2e/PHASE_2E_PRD.md` by `scripts/generate-phase-2e-traceability.mjs` during Slice 2E.8 closeout. Do not edit by hand — run `npm run docs:phase-2e:traceability` to regenerate.",
  "",
  `Inventory: ${requirements.length} functional/non-functional requirement IDs across ${Object.keys(expectedFamilyCounts).length} families, ${epics.length} per-epic acceptance criteria, and ${globalGates.length} global gates: ${totalRows} individually mapped rows. Evidence is referenced by durable artifact and executable gate rather than copied test output.`,
  "",
  `The generator fails closed if the PRD inventory is not exactly ${requirements.length} functional IDs with the expected per-family counts, ${epics.length} epic-acceptance bullets, and ${globalGates.length} global gates; if any family lacks an evidence mapping; or if a status override names an ID the PRD does not declare.`,
  "",
  `**${deliveredCount} of ${requirements.length} requirements are delivered. ${notDeliveredCount} is not**, and it is repeated with the same justification in \`PHASE_2E_FINAL_REPORT.md\` §7: \`2E-COMMAND-012\`, a deliberate reclassification to Phase 2F (PRD revision 4, ADR-053).`,
  "",
  `The three requirements this matrix previously recorded as blocked on deployment authorization — \`2E-OPERATIONS-003\`, \`2E-OPERATIONS-004\` and \`2E-OWNERSHIP-004\`'s remote half — are **delivered**. The chain was deployed on 2026-07-28, remote parity is \`202607280061\`, and each is now proven by an executed gate rather than by a written one.`,
  "",
  `A further ${notedCount} requirement is delivered but carries a scope note the reader must carry forward (\`2E-MATCH-018\`). It is counted as delivered because its own text is satisfied; the note exists so a Phase 2F comparison is not made against the wrong measurement.`,
  "",
  "Phase 2E is merged (`5d22400`), deployed (parity `202607280061`), validated remotely and tagged `phase-2e-complete`.",
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
  "Run `npm run docs:phase-2e:traceability`. The generator throws if the PRD requirement inventory, family counts, epic-acceptance count, or global-gate count drift from the closed expectation, or if a status override names an unknown ID — guaranteeing this matrix stays synchronized with the PRD.",
  "",
].join("\n");

writeFileSync(outputPath, matrix, "utf8");
console.log(
  `Wrote ${outputPath} with ${totalRows} traceability rows `
  + `(${requirements.length} requirements, ${epics.length} epics, ${globalGates.length} global gates; `
  + `${deliveredCount} delivered, ${notDeliveredCount} not delivered, ${notedCount} delivered with a scope note).`,
);
