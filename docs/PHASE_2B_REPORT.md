# Phase 2B Final Report — Immutable Interpretation Revisions and Trust

Date: 2026-07-17  
Branch: `codex/phase-2-intelligent-capture`  
Status: complete, deployed to the linked Supabase project, verified, and ready for Phase 2C planning

## Outcome

Phase 2B replaced the optimistic “latest model result” interpretation flow with an auditable domain boundary. The original entry remains preserved; every interpretation, user correction, AI reprocessing result, and undo result is an immutable version. `entries.current_interpretation_id` selects the active owned snapshot without rewriting history.

The UI now explains persisted lifecycle state and per-element trust, lets the user correct the structured interpretation, and exposes history, adjacent comparison, undo, and bounded reprocessing in `pt-BR` and English on desktop and mobile.

## Database delivery

Applied append-only migrations:

- `202607170020_interpretation_revisions.sql`: lifecycle migration/backfill, current pointer, immutable revision metadata, temporal `entity_aliases`, forced RLS/least privilege, correction/reprocessing RPCs, audit, and compensating undo.
- `202607170021_fix_interpretation_timestamp_conflict.sql`: explicit timestamp variable names in interpretation persistence functions.
- `202607170022_fix_entity_alias_trigger_privilege.sql`: least-privilege alias trigger execution through a security-definer trigger function.
- `202607170023_fix_model_only_trust_volatility.sql`: truthful `STABLE` volatility for the conservative model-only trust fallback.

Persisted entry states are `saved`, `interpreting`, `awaiting_review`, `partially_processed`, `completed`, `recoverable_error`, `terminal_error`, and `reprocessing`. Legacy `processing`, `interpreted`, and `failed` rows were mapped during deployment.

Authoritative operations:

- `begin_entry_interpretation`
- `persist_entry_interpretation`
- `fail_entry_interpretation`
- `correct_entry_interpretation`
- `begin_entry_reprocessing`
- `persist_reprocessed_entry_interpretation`
- `fail_entry_reprocessing`
- `undo_operation` with append-only interpretation compensation

Correction locks the owned entry, verifies the expected version, enforces an idempotency key, validates the complete desired entity-link set against ownership, appends one snapshot, refreshes derived links/questions, moves the pointer, updates lifecycle state, and records audit/undo atomically. Direct interpretation updates/deletes remain unavailable to authenticated users and are rejected by an immutability trigger.

## Trust and entity resolution

The deterministic trust policy uses centralized normalized signals with weights of 20% model confidence, 20% candidate margin, 15% entity exactness, 10% semantic similarity, 10% date clarity, 10% context consistency, 5% reversibility, 5% allowed autonomy, and 5% correction-history agreement. Policy thresholds are `0.90` auto-apply eligibility, `0.78` apply-and-flag, and `0.55` request review; hard overrides force confirmation.

Missing evidence contributes zero and is persisted as unavailable. Explicit user confirmation is recorded as its own evidence and can produce `apply_and_flag` without pretending that model or semantic evidence exists. Repeated user-correction history is read through owner-scoped RLS and contributes a bounded agreement signal.

Entity ranking is bounded to 50 owner-filtered candidates and five results. It considers normalized exact/partial names, temporally valid aliases, historical recurrence, organization context, temporal validity, optional semantic input, deterministic tie-breaking, and the top-versus-second margin. Cross-owner candidates are filtered before scoring. The application displays resolved owned links and extracted mentions; trust details show persisted evidence and ambiguity overrides without exposing raw provider payloads.

## Application delivery

- Initial capture persists `saved`, enters interpretation through an RPC, uses the shared bounded extraction pipeline, records paid usage before domain persistence, and records sanitized recoverable failure without directly mutating lifecycle state.
- Reprocessing uses the same provider, prompt/strategy versions, known context, usage ledger, entity ranking, trust builder, and embedding persistence. A 180-second persisted lease and 120-second provider bound prevent concurrent or unbounded execution.
- The typed interpretation DAL uses the linked generated Supabase schema, follows `current_interpretation_id`, bounds history/entity reads, and parses persisted JSON defensively.
- Server Actions validate form input with Zod, validate the session, rely on RLS/RPC ownership, handle expected-version conflicts safely, sanitize errors, and immediately revalidate affected routes.
- The editor supports summary, concepts, occurrence, extracted dates, entity add/remove/replace from owned options, per-element classifications, pending-question retention, correction reason, record-only mode, save, and cancel.
- The review page renders lifecycle, original content, current structured data, extracted mentions, trust score/policy/signals/evidence, immutable timeline, adjacent comparison, undo, reprocessing, and existing task confirmation.
- The inbox list follows the explicit current pointer and renders localized lifecycle labels.

## Verification evidence

- Phase 2B-focused Vitest: 9 files/52 tests passing.
- Complete Vitest: 39 files/147 tests passing.
- ESLint: passing.
- TypeScript `tsc --noEmit`: passing.
- Next.js 16.2.10 production build: passing.
- Linked Playwright desktop: complete intelligent-capture/revision regression passing in 54.2 seconds.
- Linked Playwright Pixel 7 mobile: complete intelligent-capture/revision regression passing in 53.1 seconds.
- Linked migrations: local and remote synchronized through `202607170023`.
- Linked database lint: no Phase 2B issue.
- Remote interpretation smoke: immutability, append-only correction, idempotency, concurrency, ownership, rollback, audit, undo, aliases, reprocessing, sanitization, RLS, and cleanup passing.
- Complete remote Supabase smoke: auth, atomic settings, RLS, ownership, heartbeat, AI ledger/aggregation, and deployed file worker passing.

The online E2E keeps capture genuinely model-backed. Because model wording and task-candidate extraction are nondeterministic, assertions target stable domain/UI contracts. If the real model omits the explicitly requested task candidate, the test adds a clearly evidenced deterministic reprocessing fixture so the pre-existing task-confirmation/undo regression remains testable.

## Limitations and risks

- Docker Desktop is unavailable on this workstation. The 44-assertion pgTAP file is committed but was not executed locally through the Supabase CLI; equivalent high-risk behavior was exercised against disposable remote data.
- Database lint still reports two pre-existing `run_user_heartbeat` text-to-time warnings. Phase 2B introduced no remaining lint issue; changing the heartbeat was outside this slice.
- Semantic similarity is optional in entity ranking. When no semantic score is available, the trust record explicitly stores that absence and assigns zero rather than synthesizing a value.
- Reprocessing is intentionally synchronous. If a future product flow detaches it from the request, it must move behind the existing leased queue rather than introduce a second provider/prompt implementation.
- Global Supabase client typing remains incremental because legacy preference literals and pgvector representations require domain-by-domain validation.

## Implementation commits

- `c0f038c` — `docs(phase-2b): define revision and trust execution design`
- `981b39e` — `test(interpretations): specify revision and trust contracts`
- `9a87c54` — `feat(interpretations): add deterministic trust and entity contracts`
- `ae0be18` — `feat(db): add immutable interpretation revision operations`
- `91c1722` — `chore(supabase): generate interpretation revision contract`
- `8331e68` — `feat(interpretations): add correction and reprocessing actions`
- `8fbd615` — `feat(inbox): add immutable interpretation review`
- `9e894de` — `fix(db): align trust fallback volatility`
- `00eabe5` — `test(e2e): stabilize interpretation revision journey`
- `80bb233` — `fix(interpretations): include correction history trust signal`

## Phase 2C recommendation

Proceed to Phase 2C on the same architectural line: represent candidate-task edits as a typed desired state and confirm them through one transactional RPC. The editor should support title, description, priority/status intent, due/planned dates, project/context/person links, dependencies/subtasks, split/merge, record-only/reject/cancel, and per-field trust evidence before materialization.

Phase 2C should reuse the current interpretation version and trust metadata as its source, preserve explicit user confirmation, and append audit/undo evidence. It should not create a second task workflow, write domain-controlled task state directly from the UI, or broaden the job platform unless a concrete asynchronous task operation requires it.
