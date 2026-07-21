# Project Backlog

Last updated: 2026-07-19
Active milestone: Phase 2C Slice 2C.1 implemented on branch `codex/phase-2c-editable-candidate-tasks` (not pushed/merged/deployed); Slices 2C.2–2C.6 not started

Items are ordered by execution priority. Completed work moves to `CHANGELOG.md`; decisions move to `DECISIONS.md`; the current snapshot stays in `STATE.md`.

## Active milestone — Phase 2

- [x] Adopt permanent engineering standards in `ENGINEERING_STANDARDS.md`.
- [x] Reconcile existing capture, interpretation, tasks, questions, entity, dates, jobs, and AI capabilities in `PHASE_2_PLAN.md`.
- [x] Complete Phase 2A leased job reliability, recovery, observability, remote validation, documentation, and thematic commits.
- [x] Complete Phase 2B immutable interpretation revisions and the trust/entity-resolution foundation.
- [x] Complete Phase 2X — Product Convergence according to the approved architecture review, PRD, and implementation plan; official Slices 2X.1–2X.18 are complete.
- [ ] Complete Phase 2C editable candidate tasks and transactional materialization according to `PHASE_2C_PRD.md` and `PHASE_2C_IMPLEMENTATION_PLAN.md`.
- [ ] Complete Phase 2D conversational pending questions.
- [ ] Complete Phase 2E natural-language updates to existing tasks.
- [ ] Complete Phase 2F retroactive history, mobile/localization/accessibility finish, full gates, and closeout.

### Phase 2X completed slices

- [x] Approve `PHASE_2_ARCHITECTURE_REVIEW.md`, `PHASE_2X_PRD.md`, and `PHASE_2X_IMPLEMENTATION_PLAN.md`.
- [x] Create the reusable `reports/SLICE_REPORT_TEMPLATE.md` for 2X execution evidence.
- [x] Complete Slice 2X.1 — daily-cycle product contracts, typed copy, deterministic fail-closed lifecycle matrix, and architecture guardrails.
- [x] Complete Slice 2X.2 — private product-events foundation: migration `024`, dedicated RPCs, generated types, server-only best-effort boundary, acknowledgement action, pgTAP contract, remote smoke, and retention documentation.
- [x] Preserve Product Projections prework from `9f0c1e6` — immutable, serializable DTOs and pure fail-closed mappers for CaptureReceipt, Inbox, Needs Attention, and Work; it is not the official Slice 2X.3 and has no consumer.
- [x] Complete Slice 2X.3 — atomic entry capture and input jobs: migration `025`, bounded `interpret_entry` payload, authenticated capture/reprocessing enqueue RPCs, service-only claims, generated types, pgTAP contract, and disposable remote smoke. No UI, route, Server Action, Edge Function, worker, or dispatch was added.
- [x] Complete Slice 2X.4 — entry-interpretation worker and automatic dispatch: migrations `026` (service-role interpretation access, `pg_net`, scheduled dispatch cron) and `027` (fixes a Slice 2X.3 privilege regression that broke authenticated attachment-job inserts — see `DECISIONS.md` ADR-022); `process-jobs` split into `index.ts`/`dispatch.ts`/`attachment.ts`/`entry.ts`; direct and unattended-drain invocation both remotely verified. No UI, route, or Server Action switched to the async capture path.
- [x] Complete Slice 2X.5 — asynchronous capture cutover: `captureEntry`/`reprocessEntry` call `capture_entry_async`/`enqueue_entry_reprocessing` and return immediately (no migration); a `next/server` `after()` callback nudges the deployed worker and records best-effort product events; `QuickCaptureForm` shows an inline receipt, clears/refocuses for consecutive captures, and rotates its idempotency key; `agent/actions.ts` gained a generalized `retryProcessingJob` for entry jobs (no UI consumer yet); the now-unreachable synchronous Node extraction orchestrator was removed (see `DECISIONS.md` ADR-023). Remote entry-processing/jobs/product-events/full smokes and online Playwright (desktop+mobile) all passed after the cutover.
- [x] Complete Slice 2X.6 — human processing states in Inbox and Home: `src/features/daily-cycle/inbox-projection.ts` owner-scoped query feeds the Slice 2X.1 lifecycle mapper per entry (no migration); `InboxItemRow` renders the resulting DTO; `/inbox` and a new "Atividade recente" Home panel share the same projection and row component, so both surfaces agree on an entry's state. `recordOnly`/`hasConsistencyIssue` remain `false` until Slice 2X.7's `is_record_only` column exists (documented known limitation, not a regression).
- [x] Complete Slice 2X.7 — candidate provenance and safe task confirmation: migration `028` persists `entry_interpretations.is_record_only`, adds `tasks.source_interpretation_id`/`operation_key`, replaces the entry-wide unique constraint with an interpretation-scoped one, and adds `confirm_entry_task_candidates` (only confirms candidates from the entry's actual current interpretation, rejects `record-only`, idempotent by operation key); `confirm_entry_tasks` kept for compatibility with only its `ON CONFLICT` target adjusted. Exercising both as a real `authenticated` role against the linked project (not just pgTAP/`service_role`) surfaced and fixed two pre-existing defects unrelated to this slice's own logic — see `DECISIONS.md` ADR-025: `confirm_entry_tasks` was `SECURITY INVOKER` and had never worked for a real user (`permission denied` on the `entry_interpretations` lock and the `undo_operations`/`audit_logs` inserts), and any RPC raising SQLSTATE `40001` — including the already-shipped `correct_entry_interpretation` — hangs until gateway timeout on the linked project. Both `confirm_*` functions are now `SECURITY DEFINER`; the new RPC signals its version conflict with `55P03` instead of `40001`. `scripts/remote-daily-cycle-smoke.mjs` (new) was executed, not just written, against the linked project and passed.
- [x] Complete Slice 2X.8 — separated review and technical-details projections: `src/features/daily-cycle/review-projection.ts` and `technical-details-projection.ts` (no migration) each pair a pure, tested mapper with a thin `server-only` loader; `loadInterpretationReview` is now internal infrastructure consumed only by these two modules. `src/app/[locale]/app/inbox/[entryId]/page.tsx` loads exclusively through the two new loaders, no longer reads `entries.status`/raw Supabase rows, and derives its status badge/banners/retry visibility from `productState`/`availableActions`; a new `page.architecture.test.ts` enforces that import boundary. The two loaders load independently so a technical-details failure never blocks or misreports the primary review. `InterpretationRevisionEditor`/`TaskCandidateForm` are unchanged, fed from the review projection's editable/candidate fields.
- [x] Complete Slice 2X.9 — decision-first progressive-disclosure entry review (no migration): new `src/features/daily-cycle/entry-review.tsx` (`EntryReview`/`ReviewUnderstanding`/`ReviewAttention`/`ReviewNextActions`/`OriginalRecord`) and `src/features/daily-cycle/technical-details.tsx` (`TechnicalDetails`) reorganize `src/app/[locale]/app/inbox/[entryId]/page.tsx` into four always-visible blocks (understanding — now also rendering the DTO's `humanFields` — attention, next actions gated exclusively by `view.availableActions`, and the original record) plus one collapsed technical block (trust panel, immutable version history/comparisons, and structured extraction), degrading gracefully when the technical-details load fails. `InterpretationRevisionEditor` gained an optional `showSummary` prop to avoid repeating the summary already shown in the understanding block; `TaskCandidateForm` needed no change. No lifecycle/candidate/RPC logic changed. Offline Playwright and the full gate (323 unit tests, lint, typecheck, build) passed; the online authenticated journey (`e2e/intelligent-capture.spec.ts`) was updated line-for-line for the new collapsed-technical-details selectors but could not be re-executed — no `ONLINE_SUPABASE_*` credentials are configured on this workstation.
- [x] Complete Slice 2X.10 — Needs Attention query and projection, no UI consumer yet: migration `030` adds `list_needs_attention` (owner-scoped, SQL, `SECURITY DEFINER`, keyset-paginated) reimplementing `resolveDailyCycleLifecycle`'s five-reason precedence in SQL for bounded-scan pagination (XG-025), plus a supporting partial index; `src/features/daily-cycle/attention-projection.ts` (`loadAttentionProjection`) hydrates the RPC's rows into `NeedsAttentionItemView` via the existing Slice 2X.1 mapper, reusing `review-projection.ts`'s `attentionActionId` (now exported) so the queue's primary action always matches the entry-review page's own. `scripts/remote-daily-cycle-smoke.mjs` was executed (not just written) against the linked project and found a real defect: a `generate_series` alias named identically to `tasks.candidate_index` made the correlated `has_unconfirmed_candidate` check tautological, so confirming one of two current candidates incorrectly removed the entry from the queue entirely. Migration `031` (`create or replace function`, identical signature/grants/index) fixes the alias collision; see `DECISIONS.md` ADR-027. 340 unit tests, lint, typecheck, and production build passed; offline Playwright unchanged at baseline (this slice adds no route/UI). `supabase/tests/needs_attention_projection.sql` (35 pgTAP assertions, committed, not locally executable — same Docker gap as every other pgTAP file here) includes a dedicated regression case for the migration-031 defect.
- [x] Complete Slice 2X.11 — Needs Attention on Home and Caixa, no migration: `src/features/daily-cycle/needs-attention-item.tsx` (`NeedsAttentionItemRow`) is shared by Home's new "Precisa de você" panel (bounded preview of 3, honest `{count}{+ if hasNext}` badge, empty state, "Ver tudo" link) and Caixa's new `?view=needs-you` canonical filter (two-tab `InboxViewTabs`, unchanged default `all` view). Caixa's "load more" is this codebase's first client-driven, Server-Action-backed pagination: `src/features/daily-cycle/needs-attention-list.tsx` (client component) accumulates pages fetched through the new `loadMoreNeedsAttention` action (`src/features/daily-cycle/attention-actions.ts`), preserving already-loaded items and showing a localized error without auto-retry on a failed subsequent page, and disabling its button while in flight. `needs_attention_viewed`/`needs_attention_item_opened` are deliberately not emitted (see `DECISIONS.md`/report — that instrumentation belongs to Slice 2X.15's own file list, and no client-side emitter exists yet anywhere in this codebase). 357 unit tests (13 new), lint, typecheck, and production build passed; offline Playwright unchanged at baseline. The authenticated online journey was extended with a Needs Attention detour but could not be executed (no `ONLINE_SUPABASE_*` credentials on this workstation).
- [x] Complete Slice 2X.12 — canonical Work route and task projection, no migration: new server-only `loadWorkProjection` is explicitly owner-scoped, resolves the profile timezone with a safe fallback, applies deterministic `today`/`all`/`waiting` filters and page-based lookahead, and reuses `toWorkItemView` with fail-closed invalid-row handling. New `/{locale}/app/work` renders only product DTOs through `WorkView`/adapted `TaskList`, with localized human states/origins/dates, manual task creation, existing complete/wait/resume/reopen actions, accessible tabs and filter-preserving pagination. `/today`, `/tasks`, and `/waiting` redirect to the equivalent localized view/page; relevant task Actions revalidate Work in both locales. Full gate: 68 files/375 tests, lint, typecheck, build, offline Playwright desktop/mobile (6 passing/10 online skips), migration sync through `031`; online authenticated assertions authored but not run because `ONLINE_SUPABASE_*` is absent.
- [x] Complete Slice 2X.13 — converged primary navigation and Mais/More grouping, no migration: new pure `src/features/shell/capabilities.ts` classifies every authenticated route, keeps Jobs context-only, maps canonical/nested/alias paths to deterministic active destinations, and builds localized canonical links. Desktop and mobile now share Início/Home, Caixa/Inbox, Trabalho/Work, and Brain as primary; capture remains distinct, notifications remain global, and secondary destinations use the same five ordered groups in the desktop tree/mobile Mais. Locale switching preserves path/query; mobile DOM and visual tab order agree; Escape closes Mais and restores focus; touch targets remain at least 44 px; unobservable "Brain atento/ativo" claims were removed. Strict RED/GREEN produced 9 focused tests; the full suite passed 69 files/382 tests, lint, typecheck, build, offline Playwright desktop/mobile (6 passed/10 credential-gated skips), targeted authenticated online Playwright desktop/mobile in PT-BR and English (2 passed), and linked migration sync through `031`. See ADR-028 and `docs/reports/PHASE_2X_SLICE_13_REPORT.md`.

- [x] Complete Slice 2X.14 — visible promises aligned with real behavior, no migration: a static capability registry classifies operational, informational, advanced, and future capabilities; Home derives observable status from existing projections; Settings hides unconsumed schedules/autonomy/privacy/identity/model routes, preserves their stored values server-side, and exposes proven model routing/cost transparency under accessible progressive disclosure; Reviews uses an owner-scoped localized product projection and on-demand language; lifecycle copy now distinguishes saved, queued, organizing, retry, and complete. Strict TDD, 75 files/404 tests, lint, typecheck, build, offline Playwright (6 passed/10 expected skips), authenticated online desktop/mobile PT-BR/English journeys (4 passed), and linked migration sync through `031` passed. See `docs/PHASE_2X_REPORT.md` and `docs/reports/PHASE_2X_SLICE_14_REPORT.md`.

- [x] Complete Slice 2X.15 — instrument all 17 version-1 daily-funnel events over the existing private ledger, with exact payload allowlists, deterministic domain/worker idempotency, confirmed-visibility session deduplication, owner-scoped subjects, fail-open analytics, safe internal conversion/latency queries, full authenticated remote coverage and desktop/mobile Playwright. No migration, RPC, remote infrastructure action or analytics consumer/dashboard; the local worker source was not deployed in that slice and was later deployed by Slice 2X.18. See ADR-029 and `docs/reports/PHASE_2X_SLICE_15_REPORT.md`.
- [x] Complete Slice 2X.16 — close the projection boundary across Home/Caixa/Work/review, no migration: Home's priority panel now reads `loadWorkProjection(..., { view: "today" })` instead of a raw, divergent `tasks` query (removing both the raw-row access and a second, incorrect "due" rule that ignored `FLOW-003`); Home's waiting-count/open-question panels read the new `loadHomeSupplementalProjection` instead of raw `tasks`/`pending_questions` queries. `TaskCandidateForm` now renders `ActionableCandidateView[]` only — no AI-extraction confidence score, no client-side re-filtering of a validity rule `review-projection.ts` already applies once. `src/features/interpretations/data.ts` is now guarded `server-only`. New `src/features/daily-cycle/architecture.test.ts` locks the no-raw-row/no-raw-enum/no-raw-score boundary across all five touched surfaces. Full gate: 80 files/443 tests, lint, typecheck, build, offline Playwright desktop/mobile (3 passed/5 online-gated skips each), authenticated online Playwright (12/16 passed — 2 unrelated pre-existing signup/recovery-email failures, likely rate-limiting from the smoke runs just executed, in a file this slice never touched), remote daily-cycle and product-events smoke both passed, linked migration sync confirmed through `031`. See `docs/reports/PHASE_2X_SLICE_16_REPORT.md`.
- [x] Complete Slice 2X.17 — converged daily journey E2E, no migration: `e2e/intelligent-capture.spec.ts` reorganized into deterministic per-contract scenarios across two `test.describe` blocks (13 named tests reorganizing the existing real journey unchanged, plus 3 new tests for basic pending question, recoverable retry, and terminal retry via deterministic direct-RPC fixtures, previously entirely uncovered) with added keyboard/focus/live-region/touch-target assertions. `e2e/foundation.spec.ts`, `e2e/online-mobile-navigation.spec.ts`, and `scripts/online-playwright.mjs` reviewed and confirmed sufficient by running them, left unchanged. Real execution found and fixed one in-scope defect: a duplicate retry button on the entry-detail page for `recoverable_error`/`terminal_error` entries with no prior successful interpretation (`page.tsx`, one-line conditional, no capability removed). Its historical auth/provider observations remain in the slice report. Full gate: 80 files/443 tests (unchanged — E2E-only slice), lint, typecheck, build, offline Playwright 3/3 both projects, authenticated online `intelligent-capture.spec.ts` 18/18 both projects, `online-mobile-navigation.spec.ts` 1/1 both projects, remote daily-cycle and product-events smoke both passed, linked migration sync confirmed through `031`. See `docs/reports/PHASE_2X_SLICE_17_REPORT.md`.
- [x] Complete Slice 2X.18 — remote gate and permanent closeout, no migration/product-source change: preserved the deployed v12 rollback bundle; deployed only the complete committed `process-jobs` function as v13; downloaded v13 and proved exact local runtime parity; added the fail-fast `test:remote:2x` aggregate, fail-closed cleanup verifier, safe shared-queue assertions, and a reproducible 283-row PRD traceability annex; passed jobs, interpretations, product-events, entry-processing, daily-cycle, baseline, 80-file/443-test local suite, lint, typecheck, build, desktop/mobile core E2E, migration/type sync, linked lint, and cleanup. Auth logs established the provider's new `email_address_invalid` rejection for the reserved E2E domain; signup remains an explicit external skip, while sign-in/profile and the independently generated recovery-link/password-reset core pass on both projects. Deno/Docker remain explicit unavailable gates. See ADR-030, `docs/PHASE_2X_REPORT.md`, `docs/reports/PHASE_2X_SLICE_18_REPORT.md`, `docs/reports/PHASE_2X_SLICE_18_EVIDENCE.md`, and `docs/reports/PHASE_2X_TRACEABILITY_MATRIX.md`.

### Phase 2C approved plan — implementation in progress

- [x] Approve `PHASE_2C_PRD.md` and `PHASE_2C_IMPLEMENTATION_PLAN.md`, reconcile the current roadmap, and preserve Phase 2X historical evidence unchanged.
- [x] Complete Slice 2C.1 — Editable Core Confirmation: transient edits to title, description, and due date only; versioned transactional RPC (`confirm_entry_task_candidates_v2`, migrations `202607190032`/`202607190033`); generated types; audit/undo; canonical-fingerprint idempotency; correction-vs-confirmation race guard; 579/579 unit tests, 0 lint/typecheck errors, production build green, migration/db-lint parity, and a live authenticated desktop+mobile Playwright journey all passed on branch `codex/phase-2c-editable-candidate-tasks` (not yet pushed/merged/deployed). Known gap: the PRD §14/plan Task 5 `candidate_edit_started`/`candidate_edit_reset` events and `task_candidates_confirmed`'s `editedCandidateCount`/`editedFieldCount` properties were not implemented — tracked below. See `docs/reports/PHASE_2C_SLICE_01_FINAL_ACCEPTANCE.md` and the per-slice `PHASE_2C_SLICE_01_*` reports.
- [x] Complete Issue #3 end-to-end (application layer + database enablement): extend `task_candidates_confirmed` with `editedCandidateCount`/`editedFieldCount` and add the `candidate_edit_started`/`candidate_edit_reset` product events (PRD §14, implementation-plan Task 5), content-free and fail-open. `candidate_edit_started` fires once per entry/candidate/tab-session only from a real field change (title/description/dueAt edit or explicit clear) — never from expand/collapse, rerender, or React Strict Mode remount; `candidate_edit_reset` fires only from the explicit "Restaurar sugestão"/"Reset to suggestion" action (never from "Remover descrição"/"Remover prazo" clear) with `editedFieldCount` computed from the canonical normalized edit payload, not raw touched-field state. `editedCandidateCount`/`editedFieldCount` on `task_candidates_confirmed` are derived server-side in `confirmEntryTasks` from the same validated canonical edits array sent to the RPC (a candidate counts as edited only if its canonical `changes` object is non-empty). Application layer: commit `b2cd44a` on branch `codex/phase-2c-editable-candidate-analytics`. Database enablement: additive migration `202607210034` extends the `product_events.event_name` CHECK constraint with `candidate_edit_started`/`candidate_edit_reset`, extends `private.validate_product_event_properties` with their allowlisted-property validation (`candidateCount` fixed at exactly 1; `editedFieldCount` bounded 1–3, the number of editable candidate fields), and adds a new `private.require_task_candidates_confirmed_edit_counts` helper enforcing `0 ≤ editedCandidateCount ≤ candidateCount` and `0 ≤ editedFieldCount ≤ editedCandidateCount × 3` (both new properties optional together, preserving legacy `{candidateCount}`-only callers; supplying exactly one of the pair is rejected). No RPC signature, task-confirmation, undo, or idempotency change; `confirm_entry_task_candidates(_v2)` untouched; generated types unaffected (function signature and column types unchanged). Verified: local/remote migration parity through `202607210035`, `db lint --level error` clean, a dedicated pgTAP file (`supabase/tests/editable_candidate_analytics_events.sql`, 29 assertions covering both new events, the extended `task_candidates_confirmed` cross-field bounds, legacy-payload compatibility, unknown-property/unknown-event rejection, cross-owner subject denial, RLS, and security-definer/search-path preservation) executed for real online via `npx supabase db query --linked -f ...` (Docker unavailable on this workstation, and `supabase test db --linked` itself requires Docker for its `pg_prove` container even against a remote target — `pgtap` was temporarily installed into the linked project's `extensions` schema to run the file directly, then removed; not committed as a migration), plus a real disposable-fixture remote persistence smoke (`npm run test:remote:product-events`) that asserts actual rows exist in `product_events` for all three analytics changes (not just that the RPC didn't error) plus one deliberately invalid payload rejected — all passed against the linked development project. 594/594 application tests, 0 lint/typecheck errors, production build green. Commits: `feat(db): enable editable candidate analytics events` and a third forward-fix `fix(db): reject product event payloads missing a required allowlisted property` (migration `202607210035` — the first online pgTAP run caught a genuine pre-existing bug in `require_product_event_integer`/`require_product_event_enum` from migration `202607170024`, unrelated to Issue #3's own new code, where a `NULL`-valued PL/pgSQL `IF` condition let a payload missing its required key silently pass; fixed and re-verified 29/29 online). Branch not pushed, no PR opened, not merged or deployed.
- [ ] Complete Slice 2C.2 — Planning, Priority and No-Due Semantics.
- [ ] Complete Slice 2C.3 — Owned Relations for project, context, person, and waiting-on.
- [ ] Complete Slice 2C.4 — Candidate Dispositions without a candidate-draft table.
- [ ] Complete Slice 2C.5 — Subtasks, Dependencies and isolated Split/Merge.
- [ ] Complete Slice 2C.6 — Product Convergence and Closeout.

### Resolved — hotfix outside the slice sequence (2026-07-18)

- [x] ~~`correct_entry_interpretation` (Phase 2B, already shipped) raises SQLSTATE `40001` for its version-conflict check~~ — fixed by migration `202607180029`, which keeps the RPC's exact signature and every non-conflict behavior and switches only the conflict SQLSTATE to `55P03` (matching `confirm_entry_task_candidates` and `begin_entry_reprocessing`). `src/features/interpretations/actions.ts` now keys off `error.code === "55P03"`. Proven with the authenticated remote smoke: ~530ms bounded response, no gateway hang, no partial write, current interpretation not overwritten by the losing correction. See `DECISIONS.md` ADR-026 and `SECURITY.md`.
- [ ] `undo_operation` still raises SQLSTATE `40001` for its own, distinct conflict (`'Cannot undo after a newer interpretation revision'`). Not confirmed to hang the gateway and not exercised by this hotfix (a single-RPC fix, not a schema-wide sweep of `40001`), but the same class of platform risk — worth a dedicated investigation before it is hit in production. See `SECURITY.md`.

### Resolved — F1 candidate-lifecycle hotfix outside the slice sequence (2026-07-18)

- [x] ~~The architecture review of Slices 2X.5–2X.8 (`docs/reports/PHASE_2X_SLICES_2X5_2X8_ARCHITECTURE_REVIEW.md`, finding F1) found `hasMaterializedTaskForCandidates` computed entry-wide ("any non-cancelled task exists for this entry") instead of interpretation/candidate-scoped in both `inbox-projection.ts` and `review-projection.ts`, so `productState` could report `ready` on Inbox/Home/entry-detail while a genuinely unconfirmed candidate from the current interpretation was still shown by `TaskCandidateForm`~~ — fixed by deriving that lifecycle input from the same interpretation-scoped source `actionableCandidates` already used correctly (`computeUnavailableCandidateIndexes`), via a new shared pure helper `hasUnconfirmedTaskCandidates` (`src/features/interpretations/data.ts`). No migration, RPC, or `lifecycle.ts` change was needed. See `docs/reports/PHASE_2X_CANDIDATE_LIFECYCLE_HOTFIX_REPORT.md`.

### Phase 2B evidence

- [x] Apply and synchronize append-only migrations `020` through `023` for lifecycle states, current-version ownership, immutable revisions, aliases, reprocessing leases, runtime fixes, and truthful volatility.
- [x] Deploy correction, initial interpretation failure, leased reprocessing, idempotency, optimistic concurrency, audit, and compensating undo RPC contracts.
- [x] Add deterministic trust scoring/policies and bounded owned entity ranking with exact/alias/history/context/temporal/margin evidence and explicit missing-signal handling.
- [x] Add the typed review DAL, shared extraction pipeline, safe Server Actions, localized editor, per-element trust/evidence, current pointer, immutable history/comparison, undo, and recovery controls.
- [x] Pass 39 Vitest files/147 tests, lint, typecheck, production build, linked desktop/mobile Playwright, migration synchronization, focused interpretation smoke, and complete remote Supabase smoke.
- [x] Keep the 44-assertion pgTAP contract committed while Docker is unavailable; record the two pre-existing heartbeat lint warnings separately from a Phase 2B-clean database lint result.

### Phase 2A evidence

- [x] Apply and synchronize migration `019` with leased claims, stale-worker protection, retry/backoff, terminal exhaustion, metrics, and a per-minute reaper.
- [x] Deploy `process-jobs` version 9 with authenticated ownership, 300-second lease, 120-second timeout, persisted-result reuse, and lease-validated terminal transitions.
- [x] Expose failed/exhausted jobs, attempts, retry window, sanitized state, and a backoff-gated retry action to the owning user.
- [x] Generate the linked Supabase TypeScript schema and use its `jobs` contract in the Phase 2A page.
- [x] Pass lint, typecheck, 29 Vitest files/93 tests, production build, linked desktop/mobile Playwright 2/2, migration sync, db lint, remote job reliability smoke, and complete remote smoke.
- [x] Keep Docker-backed pgTAP execution explicit as an external limitation; structural pgTAP is committed and equivalent remote behavior passed.

## Completed milestone — Sprint 1.5

### 1. Permanent project state

- [x] Create `STATE.md` with the current implementation/deployment distinction.
- [x] Create `DECISIONS.md` with the accepted architecture and process decisions.
- [x] Create `CHANGELOG.md` with the Phase 1 baseline and Sprint 1.5 section.
- [x] Create `TODO.md` as the prioritized backlog.

### 2. Critical foundation fixes

- [x] Complete password recovery code: validated request, callback/code exchange, reset form, password update, safe redirect, localized errors, and E2E specification.
- [x] Validate signup server-side with Zod, strong password policy, password confirmation, normalized email, safe error mapping, and E2E specification.
- [x] Execute authenticated signup/recovery Playwright against the linked remote project; hosted email quota is isolated as an explicit external skip and safe UI state.
- [x] Add complete mobile access to every information-architecture destination without crowding the primary bottom navigation.
- [x] Remove direct user mutations from audit, undo, interpretation, embedding, message, summary, heartbeat, job, and other domain-controlled records.
- [x] Enforce ownership on relationships using composite foreign keys or validated security-definer RPCs; add cross-user denial tests.
- [x] Make heartbeat evaluation user-timezone-aware and locale-aware.
- [x] Isolate heartbeat failures per user and protect evaluation with idempotent/concurrency-safe execution.
- [x] Delay over-cap notifications instead of marking them dismissed; preserve important work and cooldown semantics.
- [x] Paginate potentially unbounded lists and avoid per-row signed URL calls where possible.
- [x] Check and surface every relevant Supabase error; prevent partial multi-write settings updates.
- [x] Hide Google OAuth until provider configuration, secrets, redirect URLs, and E2E validation exist.

### 3. Finish AI Routing and Cost Control

- [x] Complete behavioral pgTAP assertions for pricing, immutability, user isolation, and usage-write boundaries.
- [x] Record provider usage before downstream domain persistence so successful provider calls cannot disappear from cost history.
- [x] Replace the 5,000-row client aggregation ceiling with database-side complete aggregates.
- [x] Re-run targeted routing, cost calculator, summary, usage, and settings tests.
- [x] Expand pgTAP coverage for policies, ownership, pricing, immutability, and user isolation; Docker-backed execution is tracked as an external dependency.
- [x] Link and inspect the remote Supabase project and migration history.
- [x] Confirm migration `015` was already deployed and apply incremental migrations `016` through `018`.
- [x] Deploy/validate `process-jobs` configuration and required secrets with a real file-analysis call.
- [x] Smoke-test cost aggregation, ledger, and rendered dashboard with authenticated data.
- [x] Update architecture, database, AI, security, and implementation documentation where behavior changed.
- [x] Commit the completed phase with explicit migration/deployment notes.

### 4. Full quality gate

- [x] Run ESLint with zero errors.
- [x] Run TypeScript typecheck with zero errors.
- [x] Run the complete Vitest suite with zero failures.
- [x] Run coverage and record fresh scoped/repository limitations.
- [x] Run the production Next.js build successfully.
- [x] Run public and linked Playwright suites; distinguish real passes from explicit environment/scope skips.
- [x] Run linked Supabase database lint and remote behavioral smoke.
- [x] Validate the database through linked schema lint and equivalent disposable remote behavioral smoke; Docker-backed pgTAP execution is tracked below.
- [x] Resolve product regressions before closing the sprint.

### 5. Sprint closeout

- [x] Refresh `STATE.md` with final deployed/verified state.
- [x] Append decisions made during hardening to `DECISIONS.md`.
- [x] Move completed work into `CHANGELOG.md`.
- [x] Reorganize remaining work in this file.
- [x] Produce the Sprint 1.5 closing report and Phase 2 recommendation.

## Current backlog — Phase 2 candidates

Continue with the reconciled slices. Do not restart the architecture.

- [x] Harden the current jobs queue and attachment worker with leases, retries/backoff, stale-job recovery, exhaustion, metrics, and user visibility.
- [ ] Add a generic unattended due-job consumer for attachments only when a concrete background workflow requires it; current attachment retries remain explicit and user-initiated after persisted backoff. (`interpret_entry` jobs already have unattended dispatch as of Slice 2X.4.)
- [ ] Automatic daily/weekly review scheduling and verified delivery.
- [ ] Execute Phase 2C task editing and richer lifecycle controls in the approved 2C.1–2C.6 order; do not restart the architecture.
- [ ] Hybrid semantic/lexical search with measured relevance.
- [ ] Confidence-aware AI materialization and undo-first autonomy rules.
- [ ] Complete operational consumers for currently inert agent preference fields.

## Technical improvements

- [ ] Migrate the remaining Supabase clients to generated `Database` types domain by domain; validate existing preference literal unions and pgvector `number[]`/wire representations instead of casting them away.
- [ ] Add cached/typed data-access helpers to reduce repeated auth and query boilerplate.
- [ ] Use `getClaims()` where appropriate in request protection while retaining authoritative user checks for sensitive mutations.
- [ ] Split monolithic settings and action modules by domain responsibility.
- [ ] Consolidate duplicated project/person detail and task-list page patterns.
- [ ] Centralize localized action result/error messages and preserve locale when changing settings.
- [ ] Add route-specific metadata instead of the generic application title.
- [ ] Remove or adopt unused UI dependencies after verifying the intended design system.
- [ ] Strengthen CSP without `unsafe-eval`, add HSTS at the deployment layer, and document the final header policy.
- [ ] Add upload content validation, file-size/type enforcement, and malware scanning strategy.
- [ ] Add CI jobs for Playwright, database reset/lint/pgTAP, dependency audit, and meaningful coverage gates.

## Known bugs and risks

- [x] ~~`correct_entry_interpretation`'s version-conflict path (SQLSTATE `40001`) hangs until gateway timeout~~ — fixed 2026-07-18 by migration `202607180029` (ADR-026); see the "Resolved" item under Slice 2X.7 above.
- [ ] `undo_operation`'s separate `40001` conflict raise is untouched by that fix and remains the same class of risk; see the item above.
- [x] Worker-crash leases are bounded and expired `running` jobs are recovered or exhausted by migration `019`'s scheduled reaper; a scheduler outage remains an operational monitoring risk.
- [ ] Hosted Supabase email quota is unsuitable for production authentication delivery without custom SMTP.
- [ ] Three moderate transitive PostCSS advisories remain until a compatible Next.js dependency update is available.

## External dependencies

- [ ] Start Docker Desktop and execute the committed pgTAP suite through the Supabase CLI.
- [x] Linked Supabase CLI credentials can run authenticated Playwright and disposable remote smoke without persisted secrets.
- [x] Verified OpenAI and Supabase Edge Function secrets through a disposable real worker call.
- [ ] Custom SMTP credentials, a provider-routable catch-all `ONLINE_AUTH_TEST_EMAIL_DOMAIN`, and verified real-inbox delivery before production launch.
- [ ] Google OAuth provider configuration if the integration is enabled in a later phase.
