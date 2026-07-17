# Project State

Last updated: 2026-07-17  
Current phase: Phase 2X — Product Convergence in progress — official Slice 2X.3 complete
Source of truth order: current code; linked remote database and migrations; `STATE.md`; `TODO.md`; `DECISIONS.md`; `CHANGELOG.md`; `SPRINT_1_5_REPORT.md`; implementation plans; remaining documentation

## Status summary

Phase 1 is implemented as a hardened pre-MVP foundation. Sprint 1.5 remains closed. Phase 2A operational reliability remains deployed. Phase 2B is implemented and deployed through migration `023`: captures use the persisted lifecycle, interpretations are immutable snapshots selected by an owned current pointer, corrections and undo append versions, trust/entity evidence is deterministic and persisted per element, and synchronous reprocessing is protected by an expiring database lease. Desktop/mobile and remote behavior are verified. Phase 2X — Product Convergence has an approved architecture review, PRD, and implementation plan. Slice 2X.1 supplies pure daily-cycle contracts and guardrails. Slice 2X.2 is complete and deployed through migration `024`: a private, allowlisted, idempotent product-events ledger now has distinct user/server RPCs, generated schema types, a server-only best-effort boundary, a thin acknowledgement action, pgTAP coverage, and a disposable remote smoke. The historical product-projection commit `9f0c1e6` is preserved and reclassified as reusable prework. The official Slice 2X.3 is complete and deployed through migration `025`: authenticated capture/reprocessing enqueue RPCs atomically persist only an entry plus a bounded `interpret_entry` job, while service-role claims use the existing leased queue. The current UI remains on the Phase 2B synchronous flow; no entry worker, dispatch, route, action, or UI consumer was added.

## Implemented functionality

- Localized public and authenticated Next.js application shell (`pt-BR` and `en`).
- Supabase email/password authentication, session refresh, protected application routes, sign-out, explicit PKCE callback continuations, validated signup, and complete password reset UI/actions.
- User profile and agent preference management.
- Intelligent capture with AI interpretation, confirmations, pending questions, and task materialization.
- Inbox, Today, Tasks, Waiting, Projects, People, Reminders, Reviews, Agent chat, Memories, Files, Notifications, Change history, Settings, and entity detail routes.
- OpenAI-backed extraction, chat, summarization, embeddings, and background job processing.
- Semantic memory infrastructure with `pgvector` and HNSW indexes.
- Undo/audit infrastructure and entity timelines.
- Scheduled heartbeat generation with user-local dates/locale, quiet hours, rolling cooldown, lossless daily caps, per-user locks, and failure isolation.
- Paginated list routes, batched signed URLs, shared Supabase result contracts, and an authenticated application error boundary.
- AI route selection, pricing catalog, append-only usage ledger, database-side complete cost aggregation, settings, and cost dashboard.
- Remote `process-jobs` version 9 with authenticated ownership, 300-second leases, 120-second external timeout, idempotent reuse of persisted interpretations, lease-validated completion/failure, bounded backoff/exhaustion, and real file-analysis smoke coverage.
- Scheduled per-minute abandoned-job reaper, service-only queue metrics, user-safe recoverable/terminal failure visibility, and a backoff-gated retry Server Action.
- Linked Supabase-generated TypeScript schema with the Phase 2A `jobs` contract used by the Files route.
- Eight-state entry lifecycle with immutable interpretation origin/parent/correction metadata and `entries.current_interpretation_id` as the authoritative current pointer.
- Transactional correction with optimistic concurrency, operation-key idempotency, owned complete-link validation, audit, and compensating append-only undo.
- Deterministic per-element trust weights/policies/evidence plus bounded owned entity ranking across normalized names, aliases, history, organization context, temporal validity, optional semantic input, and candidate margin.
- Shared capture/reprocessing extraction pipeline with paid-usage ordering, 120-second provider bound, persisted reprocessing lease, safe failure recovery, and no duplicate AI implementation.
- Typed interpretation review DAL and localized accessible inbox UI for correction, dates, concepts, entity links, classifications, pending-question retention, record-only mode, trust evidence, history/comparison, undo, and reprocessing.
- Daily-cycle product contracts for five public states, five attention reasons, product DTOs, stable Action results, PT-BR/English copy, and a deterministic lifecycle projection that fails closed on unknown states.
- Private `product_events` funnel ledger with 17 closed event names, event-specific property allowlists, no personal-content fields, owner RLS, per-user idempotency, synthetic-test marking, dedicated authenticated/service-role RPCs, and 180-day retention requirement.
- Durable entry-processing job contracts: `capture_entry_async` atomically persists a saved entry and a minimal `interpret_entry` job; `enqueue_entry_reprocessing` creates an idempotent job without changing the current interpretation; service-only claims use leases, retry eligibility, `SKIP LOCKED`, and ownership guards. Payloads contain only `entry_id`, `mode`, and a reprocess operation key when applicable.
- Pure product-projection mappers for capture receipts, Inbox, Needs Attention, and Work are preserved as prework. They emit immutable, serializable DTOs only; reject invalid or unknown lifecycle/status/action inputs; and have no React, Supabase, database-type, RPC, or table dependency.

## Pending or incomplete functionality

- Google OAuth is hidden until provider configuration and end-to-end validation exist.
- Phase 2X — Product Convergence is in progress. Slices 2X.1–2X.3 provide daily-cycle contracts, lifecycle guardrails, private analytics, durable but unconsumed entry-processing contracts, and an unconsumed product-projection prework; the delivered user experience remains the Phase 2B baseline until later slices add verified consumers.
- A generic unattended due-job consumer is not deployed because no current flow requires one. Failed attachment retries are explicit, user-initiated, and blocked until persisted `next_attempt_at`; add an unattended consumer only with a concrete background workflow.
- Automatic weekly reviews, task editing, hybrid search, and broader NLP completion remain future roadmap work.
- Some preference fields are stored but do not yet have an operational consumer; they must not be presented as effective behavior until wired.
- The expanded pgTAP suite is committed but cannot execute through the Supabase CLI on this workstation until Docker Desktop and `SUPABASE_DB_PASSWORD` are available; equivalent high-risk paths passed the disposable remote smoke suite.
- Hosted Supabase email delivery is quota-limited. Signup/recovery return a localized throttling message, but production delivery requires custom SMTP before launch.
- Three moderate `npm audit` advisories remain transitively inside the current Next.js/PostCSS dependency graph; the npm-proposed forced fix is an incompatible downgrade and was not applied.

## Next priorities

1. Continue Phase 2X only with explicit authorization for Slice 2X.4; implement the entry worker and automatic dispatch without changing the current UI capture path, and keep product projections unconsumed until an authorized loader or UI slice establishes ownership-scoped data access.
2. Begin Phase 2C only after Phase 2X converges the daily cycle and preserves the Phase 2B revision/trust boundary.
3. Adopt generated Supabase client types incrementally as each legacy preference/vector contract is validated.
4. Add custom SMTP and re-run the non-throttled signup delivery smoke before production launch.
5. Execute pgTAP locally/CI when Docker is available and add the database gate to CI.

## Existing structure

- `src/app`: App Router pages, layouts, styles, auth callback, and localized application routes.
- `src/features`: domain server actions and UI for auth, capture, agent, profile, shell, and operations.
- `src/lib`: Supabase clients, AI provider/routing/usage helpers, validation, i18n, and shared utilities.
- `src/lib/supabase/database.types.ts`: linked Supabase-generated `public` schema used incrementally by typed data boundaries.
- `supabase/migrations`: append-only schema history (`001` through `025`).
- `supabase/functions/process-jobs`: authenticated Edge Function worker for queued AI jobs.
- `supabase/tests`: pgTAP coverage for Phase 1 RLS, intelligent capture, and AI usage.
- `e2e`: public foundation, online auth, and intelligent capture Playwright suites.
- `.github/workflows`: CI quality checks.
- `docs`: product, architecture, database, AI agent, security, implementation, state, decisions, changelog, and backlog documentation.

## Current database

- PostgreSQL on Supabase with `pgcrypto`, `vector`, RLS, triggers, RPCs, and scheduled-job support.
- Identity: profiles and agent preferences.
- Knowledge: entries, interpretations, pending questions, memories, embeddings, summaries, attachments, and entity relationships.
- Work management: tasks, projects, people, reminders, reviews, and waiting-related records.
- Agent operations: conversations, messages, operations, undo records, audit logs, jobs, notifications, heartbeat runs, and delivery state.
- Cost control: AI model pricing, AI usage events, `record_ai_usage`, and `get_ai_cost_summary`.
- Product observability: private `product_events`, `record_product_event`, and service-only `record_product_event_for_user`.
- Entry-processing contract: `capture_entry_async`, `enqueue_entry_reprocessing`, `claim_entry_interpretation_job`, and `claim_next_entry_interpretation_job`.
- All 25 migrations are applied to the linked `my-brain` project; local/remote migration history is synchronized and linked schema lint at level `error` is clean.

## Existing integrations

- Supabase Auth, PostgreSQL, Storage, RPC, Edge Functions, and RLS.
- OpenAI Responses/embedding APIs through the project AI provider abstraction.
- `pgvector` for semantic retrieval.
- Browser service worker for application shell support.
- GitHub Actions for CI.

## Existing jobs

- `jobs` queue with idempotency keys, atomic leased claims, worker identity, expiry, bounded attempts/backoff, recoverable `failed`, terminal `exhausted`, sanitized last error, and service metrics.
- `interpret_entry` is a bounded new queue type. Initial capture payloads contain only `{ entry_id, mode: "initial" }`; reprocessing adds a validated operation key. It has no deployed worker or automatic dispatch until Slice 2X.4.
- `process-jobs` Edge Function version 9 for authenticated attachment execution with timeout, persisted-result reuse, and lease-owned completion/failure.
- `my-brain-job-reaper` pg_cron entry runs every minute and recovers expired leases or makes exhausted work terminal.
- The Files route exposes only the current user's failed jobs, attempt state, retry window, terminal state, and authenticated retry action without rendering internal errors.
- Database heartbeat functions and scheduled heartbeat entry points.
- There is intentionally no generic unattended due-job consumer yet; the current attachment retry path is explicit and user-driven after database backoff.

## Existing heartbeats

- Event-based notification generation for overdue/stale tasks and due reminders.
- Per-user quiet hours, locale/timezone day boundaries, daily caps, rolling cooldown, importance override, advisory locks, and failure isolation are active.
- Over-cap candidates remain pending and were verified remotely by withholding then delivering the same reminder after the cap changed.

## Existing tests

- Vitest unit/component tests for auth UI, profile/settings, capture, AI parsing/routing/cost math/usage, daily-cycle contracts/lifecycle/projection-mapper guardrails, and product-analytics contracts/server/action behavior.
- Playwright public foundation, online auth, and intelligent capture suites.
- pgTAP tests for foundational RLS, capture RLS, AI usage schema/RLS, product-events schema/RLS/RPC contracts, and entry-processing queue contracts.
- CI currently runs lint, typecheck, unit tests, and production build.

## Known coverage

Verified on 2026-07-17:

- Vitest: 47 files and 204 tests passing after official Slice 2X.3.
- Statements: 93.66% (266/284).
- Branches: 61.61% (305/495).
- Functions: 90.62% (87/96).
- Lines: 95.88% (233/243).
- Playwright without online credentials: 4 public tests passing and 10 expected online skips.
- Playwright with linked remote credentials: 11 tests passing and 3 explicit skips (desktop-only mobile-nav exclusion, mobile duplicate signup exclusion, and hosted email quota exhaustion).
- Final targeted recovery journey after the harness hardening: 1/1 passing.
- Phase 2A linked intelligent-capture/file journey: 2/2 passing across desktop and mobile.
- Phase 2A remote job smoke: exclusive lease, stale-worker denial, recovery, exhaustion, sanitization, metrics, and RLS passing.
- Phase 2B linked intelligent-capture/revision journey: passing separately on desktop and Pixel 7 mobile, including correction, dates, classifications, record-only mode, immutable history, undo, `pt-BR`/English, and cleanup.
- Phase 2B remote interpretation smoke: immutability, append-only correction, idempotency, concurrency, ownership, rollback, audit, undo, aliases, reprocessing, sanitization, RLS, and cleanup passing.
- Complete remote Supabase regression smoke: auth, atomic settings, RLS, ownership, heartbeat, AI ledger/aggregation, and deployed file worker passing after Phase 2B.
- Slice 2X.2 remote product-events smoke: allowlist, forbidden payloads, idempotency, RLS, service-role worker control, and disposable-user cleanup passing.
- Slice 2X.3 remote entry-processing smoke: atomic capture/replay, bounded payloads, owner isolation, service-only claims, exclusive lease, retry eligibility, stale-worker denial, reaper recovery, reprocess isolation, and cleanup passing.

Coverage percentages are the last explicit coverage measurement from the Phase 2B baseline and were not recomputed for this contracts-only slice. They apply only to modules imported by Vitest; they are not repository-wide coverage. Remote smoke and Playwright complement, but do not numerically contribute to these percentages.

## Important recent commits

- `80bb233` — `fix(interpretations): include correction history trust signal` (2026-07-17).
- `00eabe5` — `test(e2e): stabilize interpretation revision journey` (2026-07-17).
- `9e894de` — `fix(db): align trust fallback volatility` (2026-07-17).
- `8fbd615` — `feat(inbox): add immutable interpretation review` (2026-07-17).
- `8331e68` — `feat(interpretations): add correction and reprocessing actions` (2026-07-17).
- `91c1722` — `chore(supabase): generate interpretation revision contract` (2026-07-17).
- `ae0be18` — `feat(db): add immutable interpretation revision operations` (2026-07-17).
- `9a87c54` — `feat(interpretations): add deterministic trust and entity contracts` (2026-07-17).
- `ac9f08e` — `chore(supabase): generate typed job queue contract` (2026-07-17).
- `86fa041` — `feat(files): expose recoverable and terminal job failures` (2026-07-17).
- `ab902e9` — `feat(worker): enforce lease ownership and bounded retries` (2026-07-17).
- `fe2f464` — `feat(jobs): add leased claims and abandoned job recovery` (2026-07-17).
- `c8365b8` — `test(jobs): specify lease and recovery invariants` (2026-07-17).
- `437b626` — `docs(phase-2): adopt engineering standards and reconciled plan` (2026-07-17).
- `a89210a` — `test: close remote foundation quality gate` (2026-07-17).
- `5099f81` — `feat: harden foundation and complete AI cost control` (2026-07-17).
- `40272ba` — `fix: expose complete mobile navigation` (2026-07-17).
- `0201963` — `fix: complete secure authentication journeys` (2026-07-17).
- `3aa0946` — `docs: establish permanent project state` (2026-07-17).
- `107a65f` — `feat: deliver intelligent brain pre-mvp` (2026-07-16).

## Technical pending items

- Generated Supabase types are active for the Phase 2A job boundary and Phase 2B interpretation DAL; legacy global client typing still exposes preference-literal and pgvector representation mismatches and must be migrated domain by domain.
- A generic unattended worker remains intentionally absent until a concrete background flow requires due-job pickup.
- Generic page metadata and partially localized operational copy.
- CI does not yet enforce Playwright, pgTAP, database lint, audit, or a meaningful coverage threshold.
- Upload malware scanning and stronger content validation remain pre-production work.
- Some server/data-access and page patterns remain duplicated and should be refactored incrementally.

## External pending items

- Start Docker Desktop and provide `SUPABASE_DB_PASSWORD` to execute the expanded pgTAP files through the Supabase CLI.
- Configure custom SMTP and verify real inbox delivery before production launch.
- Wait for a compatible Next.js/PostCSS dependency release that resolves the moderate audit advisories without a forced downgrade.
- Keep Google OAuth disabled until a provider, redirect URLs, and secrets are configured and verified.

## Sprint 1.5 checklist

- [x] Establish permanent state, decision, changelog, and backlog documents.
- [x] Fix password recovery and signup validation locally; online proof remains in the deployment gate.
- [x] Complete mobile navigation with an accessible overflow menu.
- [x] Harden RLS and relationship ownership.
- [x] Correct heartbeat behavior.
- [x] Add pagination and consistent Supabase error handling.
- [x] Hide the unconfigured Google OAuth entry point.
- [x] Finish AI Routing and Cost Control tests and migrations.
- [x] Validate the remote database and deployed worker.
- [x] Smoke-test cost aggregation, rendered dashboard, and the deployed AI worker.
- [x] Run lint, typecheck, unit tests, coverage, build, and Playwright.
- [x] Update all four permanent project documents with final evidence.
- [x] Commit the completed sprint in reviewable units.

## Phase 2 entry checklist

- [x] Foundation quality gate is green.
- [x] Remote schema, migration history, worker, RLS, ownership, heartbeat, and AI cost paths are verified.
- [x] Remaining risks are explicit and do not require an architectural restart.
- [x] Write the Phase 2 vertical-slice plan before implementation.
- [x] Include and implement job recovery/observability criteria before expanding background workflows.
