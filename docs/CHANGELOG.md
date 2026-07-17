# Technical Changelog

All notable technical changes are recorded here. The format follows Keep a Changelog principles without assigning a public semantic version before the product has a release policy.

## 2026-07-17 — Phase 2B immutable interpretation revisions and trust

### Added

- Migrations `020` through `023` with eight persisted entry states, an owned current-interpretation pointer, immutable revision metadata, temporal entity aliases, reprocessing leases, correction/reprocessing RPCs, compensating undo, and two append-only runtime/lint fixes.
- Deterministic trust engine with centralized weights and `0.90`/`0.78`/`0.55` policy thresholds, hard overrides, explicit missing evidence, per-element persisted decisions, and user-confirmed correction handling.
- Bounded owner-filtered entity resolver using normalized exact names, aliases, historical recurrence, organization context, temporal validity, optional semantic similarity, and top-candidate margin.
- Typed interpretation DAL, Zod form parser, correction/undo/reprocessing Server Actions, shared extraction pipeline, localized copy, immutable version comparison, and accessible revision editor.
- Inbox review experience for lifecycle state, original record, current interpretation, dates, concepts, resolved links and extracted mentions, classifications, pending questions, element trust/evidence, history, adjacent comparison, undo, and recovery.
- 44-assertion pgTAP structural contract, disposable remote interpretation smoke, and desktop/mobile linked Playwright correction journey.

### Changed

- Initial capture now persists `saved`, transitions through `begin_entry_interpretation`, and records recoverable failures through a sanitizing RPC instead of legacy direct `processing`/`failed` updates.
- Capture and reprocessing use the same bounded provider, prompt/strategy versions, owned context retrieval, usage ledger ordering, entity evidence, and embedding persistence.
- Inbox summaries follow `entries.current_interpretation_id` instead of assuming the highest returned version.
- User corrections and undo never update/delete interpretation evidence; both append a new snapshot and atomically move the current pointer.
- Online E2E assertions no longer depend on nondeterministic model wording or task extraction; a reprocessing fixture is used only when the real model omits the explicit task candidate.

### Verification

- Vitest passed 39 files and 147 tests; ESLint, TypeScript, and Next.js 16.2.10 production build passed.
- Linked Playwright passed the complete journey on desktop and Pixel 7 mobile, including `pt-BR`, English, correction, date editing, record-only, history, undo, task confirmation, and cleanup.
- Local/remote migrations are synchronized through `023`. Linked database lint has no Phase 2B issue; only two pre-existing heartbeat type warnings remain.
- Focused remote interpretation smoke passed immutability, append-only correction, idempotency, concurrency, ownership, rollback, audit, undo, aliases, reprocessing, sanitization, RLS, and cleanup.
- Complete remote Supabase regression smoke passed auth, settings, RLS, ownership, heartbeat, AI accounting, and deployed file processing.

### Known external limitation

- Docker Desktop remains unavailable, so the committed pgTAP file could not execute locally through the Supabase CLI. Equivalent high-risk behavior passed against disposable remote data.

## 2026-07-17 — Phase 2A operational reliability

### Added

- Migration `019` with worker leases (`locked_at`, `locked_by`, `lease_expires_at`), terminal `exhausted` state, failure timestamp, eligible/expired indexes, leased claim/complete/fail RPCs, queue metrics, and a per-minute expired-job reaper.
- pgTAP contract plus a disposable remote job smoke for exclusive claims, stale-worker denial, expired recovery, bounded exhaustion, error sanitization, metrics, cross-owner denial, and RLS.
- Owning-user Files UI for recoverable/terminal jobs, attempt counts, retry windows, and a validated authenticated retry Server Action.
- Linked Supabase-generated TypeScript schema; the `jobs` row contract is used by the Phase 2A page.

### Changed

- `process-jobs` version 9 now uses a unique worker identity, 300-second lease, 120-second OpenAI timeout, persisted interpretation reuse, lease-validated completion/failure, sanitized bounded errors, backoff, and operational logs.
- Successful or failed attachment processing no longer mutates `jobs` directly from the Edge Function.
- Failed attachment retry is explicit and user-driven after the database `next_attempt_at`; no generic unattended consumer was introduced without a concrete workflow.

### Verification

- ESLint and TypeScript passed with zero errors.
- Vitest passed 29 files and 93 tests.
- Next.js 16.2.10 production build passed.
- Linked intelligent-capture/file Playwright passed 2/2 across desktop and mobile.
- Local/remote migrations are synchronized through `019`; linked database lint passed at error level.
- Remote job smoke and complete remote smoke passed, including RLS, ownership, heartbeat, AI ledger/aggregation, and real deployed file processing.

### Known external limitation

- Docker Desktop remains unavailable, so the new pgTAP file could not execute locally through the Supabase CLI. Equivalent high-risk behavior passed against disposable remote data.

## 2026-07-17 — Phase 2 planning and engineering contract

### Added

- Mandatory permanent engineering standards covering architecture, database, security, AI, jobs, interface, tests, commits, dead code, and external dependencies.
- Reality-based `PHASE_2_PLAN.md` that preserves complete pre-MVP capabilities, identifies partial/missing behavior, defines trust thresholds, and starts with operational queue reliability.

### Changed

- Project state and backlog now identify Phase 2A as the active milestone instead of treating the original roadmap as unimplemented.
- Permanent source-of-truth precedence is explicit from current code and linked database through the project documents.

## 2026-07-17 — Sprint 1.5 foundation hardening

### Added

- Permanent project state documentation: `STATE.md`, `DECISIONS.md`, `CHANGELOG.md`, and `TODO.md`.
- Completed password-recovery journey with PKCE callback continuation, reset page, validated password update, session close, and fresh-login confirmation.
- Zod authentication schemas and regression tests for signup, sign-in, recovery, password strength, and confirmation.
- Public and online Playwright coverage for signup/reset form contracts and remote signup/recovery journeys.
- Complete mobile navigation overflow with localized access to every authenticated destination and a dedicated online mobile smoke test.
- Lookahead pagination, shared pagination links, batched storage URL signing, and a safe authenticated error boundary.
- Composite ownership constraints, polymorphic ownership triggers, least-privilege grants/policies, and behavioral denial tests.
- AI routing profiles, normalized usage metadata, versioned pricing, append-only ledger, complete database-side aggregates, and the AI cost dashboard.
- Disposable remote Supabase smoke runner covering auth, atomic settings, RLS, ownership, heartbeat, ledger, cost aggregation, and real file processing.
- Linked-environment Playwright runner that obtains credentials in process without persisting or printing privileged keys.

### Changed

- Sprint scope is now explicitly limited to foundation hardening and completion of the already-started AI Routing and Cost Control phase.
- Signup now normalizes and validates names/emails, enforces a strong confirmed password, and supplies an explicit email callback URL.
- Authentication proxy validation uses verified claims and preserves only callback/reset continuation routes for an authenticated recovery session.
- Provider errors are mapped to stable localized messages instead of being exposed in URLs.
- Hosted email throttling is classified explicitly and shown as a safe localized retry-later message.
- Heartbeat now uses user-local dates/locale, advisory locks, rolling cooldown, lossless caps, sanitized failure records, and per-user batch isolation.
- Profile/settings writes are atomic through `save_profile_settings`; application and Edge Function Supabase failures are checked explicitly.
- Successful provider calls are recorded before downstream domain persistence so later failures do not erase usage cost.
- Cost totals are aggregated in PostgreSQL and recent calls remain bounded to 20 rows.
- Remote migrations are synchronized through `202607170018`; `process-jobs` is deployed with the final result-handling bundle.
- The final gate passes ESLint, TypeScript, 87 Vitest tests, production build, public Playwright, linked online Playwright, remote Supabase smoke, and linked schema lint.

### Database

- Added migrations `016` through `018` for foundation/RLS hardening, complete AI cost aggregation, and incremental AI ledger validation.

### Removed

- Hid the Google OAuth action until the provider, redirect URLs, and end-to-end journey are configured.

### Verification

- Vitest: 27 files, 87 tests passing.
- Scoped coverage: 93.66% statements, 61.61% branches, 90.62% functions, and 95.88% lines.
- Playwright public matrix: 4 passing, 10 expected online skips without credentials.
- Playwright linked matrix: 11 passing, 3 explicit environment/scope skips; final targeted recovery journey 1/1 passing.
- Remote smoke: auth, settings, RLS, ownership, lossless heartbeat, AI ledger/aggregation, dashboard data, and real deployed file worker passing.
- Supabase: local/remote migrations synchronized through `018`, schema lint clean, `process-jobs` active at version 8.

### Known external limitations

- Expanded pgTAP execution remains dependent on Docker Desktop, while equivalent high-risk behaviors passed against the disposable remote project.
- Hosted Auth email quota prevented a final non-throttled delivery assertion; custom SMTP is required before production launch.
- Three moderate transitive PostCSS advisories remain in the current Next.js dependency graph; the incompatible forced downgrade proposed by npm was rejected.

## 2026-07-16 — Intelligent brain pre-MVP

### Added

- Intelligent capture interpretation, confirmations, pending questions, and entity materialization.
- Agent chat, memory retrieval, summaries, embeddings, and attachment processing.
- Tasks, Today, Waiting, Projects, People, Reminders, Reviews, Files, Memories, Notifications, and Change History experiences.
- Entity relationships and timelines.
- Agent operations, undo records, and task change auditing.
- Scheduled heartbeat database functions, preference limits, and notification generation.
- Durable AI job queue and `process-jobs` Edge Function.
- Unit/component, Playwright, and pgTAP test foundations.

### Changed

- Profile settings save behavior was made more reliable.
- Online Supabase authentication received a dedicated Playwright validation flow.

### Database

- Added migrations `003` through `014` for intelligent capture, chat/memory, agent operations, heartbeat, relationships, timelines, attachments, preference limits, and audit behavior.

## 2026-07-16 — Phase 1 foundation

### Added

- Next.js 16 App Router foundation with TypeScript, Tailwind CSS 4, Vitest, and Playwright.
- Supabase SSR authentication, profiles, agent preferences, localized routes, protected shell, and user-scoped RLS.
- `pt-BR` and English message catalogs.
- Core product, architecture, database, AI agent, security, and implementation documentation.

### Database

- Added identity/profile migrations `001` and `002` with signup trigger, timestamps, indexes, grants, and RLS.
