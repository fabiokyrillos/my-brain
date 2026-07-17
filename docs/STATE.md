# Project State

Last updated: 2026-07-17  
Current phase: Phase 2A — operational reliability in progress
Source of truth order: current code; linked remote database and migrations; `STATE.md`; `TODO.md`; `DECISIONS.md`; `CHANGELOG.md`; `SPRINT_1_5_REPORT.md`; implementation plans; remaining documentation

## Status summary

Phase 1 is implemented as a hardened pre-MVP foundation. Critical auth, mobile, RLS, ownership, heartbeat, pagination, error-handling, and atomic-settings corrections are complete. AI Routing and Cost Control is implemented, migrated through `018`, deployed, rendered in Playwright, and remotely smoke-tested. The Sprint 1.5 quality gate is complete. Phase 2 has started with mandatory engineering standards, a reconciled reality-based plan, and operational job reliability as the first implementation slice.

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
- Remote `process-jobs` version 8 with authenticated ownership claim, explicit persistence checks, usage recording, retries, and a real file-analysis smoke pass.

## Pending or incomplete functionality

- Google OAuth is hidden until provider configuration and end-to-end validation exist.
- Generic scheduled worker, automatic weekly reviews, task editing, hybrid search, and broader NLP completion remain future roadmap work.
- Some preference fields are stored but do not yet have an operational consumer; they must not be presented as effective behavior until wired.
- The expanded pgTAP suite is committed but cannot execute through the Supabase CLI on this workstation until Docker Desktop is available; equivalent high-risk paths passed the disposable remote smoke suite.
- Hosted Supabase email delivery is quota-limited. Signup/recovery return a localized throttling message, but production delivery requires custom SMTP before launch.
- Three moderate `npm audit` advisories remain transitively inside the current Next.js/PostCSS dependency graph; the npm-proposed forced fix is an incompatible downgrade and was not applied.

## Next priorities

1. Plan Phase 2 as an incremental vertical slice on the current architecture.
2. Prioritize job leases/reaper/backoff before expanding background automation.
3. Add custom SMTP and re-run the non-throttled signup delivery smoke before production launch.
4. Execute pgTAP locally/CI when Docker is available and add the database gate to CI.

## Existing structure

- `src/app`: App Router pages, layouts, styles, auth callback, and localized application routes.
- `src/features`: domain server actions and UI for auth, capture, agent, profile, shell, and operations.
- `src/lib`: Supabase clients, AI provider/routing/usage helpers, validation, i18n, and shared utilities.
- `src/types`: application and generated-compatible database types.
- `supabase/migrations`: append-only schema history (`001` through `018`).
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
- All 18 migrations are applied to the linked `my-brain` project; local/remote migration history is synchronized and linked schema lint passes at error level.

## Existing integrations

- Supabase Auth, PostgreSQL, Storage, RPC, Edge Functions, and RLS.
- OpenAI Responses/embedding APIs through the project AI provider abstraction.
- `pgvector` for semantic retrieval.
- Browser service worker for application shell support.
- GitHub Actions for CI.

## Existing jobs

- `jobs` queue for attachment/background AI processing.
- `process-jobs` Edge Function for authenticated job execution.
- Database heartbeat functions and scheduled heartbeat entry points.
- A generic periodic worker and lease/reaper strategy are not yet implemented.

## Existing heartbeats

- Event-based notification generation for overdue/stale tasks and due reminders.
- Per-user quiet hours, locale/timezone day boundaries, daily caps, rolling cooldown, importance override, advisory locks, and failure isolation are active.
- Over-cap candidates remain pending and were verified remotely by withholding then delivering the same reminder after the cap changed.

## Existing tests

- Vitest unit/component tests for auth UI, profile/settings, capture, AI parsing/routing/cost math/usage, and shared behavior.
- Playwright public foundation, online auth, and intelligent capture suites.
- pgTAP tests for foundational RLS, capture RLS, and AI usage schema/RLS.
- CI currently runs lint, typecheck, unit tests, and production build.

## Known coverage

Verified on 2026-07-17:

- Vitest: 27 files and 87 tests passing.
- Statements: 93.66% (266/284).
- Branches: 61.61% (305/495).
- Functions: 90.62% (87/96).
- Lines: 95.88% (233/243).
- Playwright without online credentials: 4 public tests passing and 10 expected online skips.
- Playwright with linked remote credentials: 11 tests passing and 3 explicit skips (desktop-only mobile-nav exclusion, mobile duplicate signup exclusion, and hosted email quota exhaustion).
- Final targeted recovery journey after the harness hardening: 1/1 passing.

Coverage percentages apply only to modules imported by Vitest; they are not repository-wide coverage. Remote smoke and Playwright complement, but do not numerically contribute to, these percentages.

## Important recent commits

- `a89210a` — `test: close remote foundation quality gate` (2026-07-17).
- `5099f81` — `feat: harden foundation and complete AI cost control` (2026-07-17).
- `40272ba` — `fix: expose complete mobile navigation` (2026-07-17).
- `0201963` — `fix: complete secure authentication journeys` (2026-07-17).
- `3aa0946` — `docs: establish permanent project state` (2026-07-17).
- `107a65f` — `feat: deliver intelligent brain pre-mvp` (2026-07-16).

## Technical pending items

- No job lease/reaper and incomplete generic background scheduler deployment.
- Generic page metadata and partially localized operational copy.
- CI does not yet enforce Playwright, pgTAP, database lint, audit, or a meaningful coverage threshold.
- Upload malware scanning and stronger content validation remain pre-production work.
- Some server/data-access and page patterns remain duplicated and should be refactored incrementally.

## External pending items

- Start Docker Desktop to execute the expanded pgTAP files through the Supabase CLI.
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
- [ ] Write the Phase 2 vertical-slice plan before implementation.
- [ ] Include job recovery/observability criteria in any new background workflow.
