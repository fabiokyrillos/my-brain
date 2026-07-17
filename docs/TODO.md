# Project Backlog

Last updated: 2026-07-17  
Active milestone: Phase 2X — Product Convergence planned and approved

Items are ordered by execution priority. Completed work moves to `CHANGELOG.md`; decisions move to `DECISIONS.md`; the current snapshot stays in `STATE.md`.

## Active milestone — Phase 2

- [x] Adopt permanent engineering standards in `ENGINEERING_STANDARDS.md`.
- [x] Reconcile existing capture, interpretation, tasks, questions, entity, dates, jobs, and AI capabilities in `PHASE_2_PLAN.md`.
- [x] Complete Phase 2A leased job reliability, recovery, observability, remote validation, documentation, and thematic commits.
- [x] Complete Phase 2B immutable interpretation revisions and the trust/entity-resolution foundation.
- [ ] Complete Phase 2X — Product Convergence according to the approved architecture review, PRD, and implementation plan; implementation is in progress and Slices 2X.1–2X.3 are complete.
- [ ] Complete Phase 2C editable candidate tasks and transactional selective confirmation.
- [ ] Complete Phase 2D conversational pending questions.
- [ ] Complete Phase 2E natural-language updates to existing tasks.
- [ ] Complete Phase 2F retroactive history, mobile/localization/accessibility finish, full gates, and closeout.

### Phase 2X planning checkpoint

- [x] Approve `PHASE_2_ARCHITECTURE_REVIEW.md`, `PHASE_2X_PRD.md`, and `PHASE_2X_IMPLEMENTATION_PLAN.md`.
- [x] Create the reusable `reports/SLICE_REPORT_TEMPLATE.md` for 2X execution evidence.
- [x] Complete Slice 2X.1 — daily-cycle product contracts, typed copy, deterministic fail-closed lifecycle matrix, and architecture guardrails.
- [x] Complete Slice 2X.2 — private product-events foundation: migration `024`, dedicated RPCs, generated types, server-only best-effort boundary, acknowledgement action, pgTAP contract, remote smoke, and retention documentation.
- [x] Complete Slice 2X.3 — immutable, serializable product-projection DTOs and pure fail-closed mappers for CaptureReceipt, Inbox, Needs Attention, and Work; no UI, route, database, RPC, migration, Edge Function, or analytics consumer was added.
- [ ] Begin Slice 2X.4 only after explicit authorization; do not integrate the projection foundation with UI, routes, database loaders, jobs, or workers outside that authorization.

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
- [ ] Add a generic unattended due-job consumer only when a concrete background workflow requires it; current attachment retries are explicit and user-initiated after persisted backoff.
- [ ] Automatic daily/weekly review scheduling and verified delivery.
- [ ] Task editing and richer lifecycle controls.
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

- [ ] Jobs can remain `running` indefinitely after a worker crash.
- [ ] Hosted Supabase email quota is unsuitable for production authentication delivery without custom SMTP.
- [ ] Three moderate transitive PostCSS advisories remain until a compatible Next.js dependency update is available.

## External dependencies

- [ ] Start Docker Desktop and execute the committed pgTAP suite through the Supabase CLI.
- [x] Linked Supabase CLI credentials can run authenticated Playwright and disposable remote smoke without persisted secrets.
- [x] Verified OpenAI and Supabase Edge Function secrets through a disposable real worker call.
- [ ] Custom SMTP credentials and verified real-inbox delivery before production launch.
- [ ] Google OAuth provider configuration if the integration is enabled in a later phase.
