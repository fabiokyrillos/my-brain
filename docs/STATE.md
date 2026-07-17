# Project State

Last updated: 2026-07-17  
Current phase: Sprint 1.5 — Foundation hardening (critical fixes)
Source of truth order: code, database, migrations, documentation

## Status summary

Phase 1 is implemented as a functional pre-MVP foundation. The current worktree also contains the nearly complete, not-yet-committed "AI Routing and Cost Control" phase. Sprint 1.5 is intentionally limited to hardening, completing that in-progress phase, and proving the foundation before Phase 2.

## Implemented functionality

- Localized public and authenticated Next.js application shell (`pt-BR` and `en`).
- Supabase email/password authentication, session refresh, protected application routes, sign-out, explicit PKCE callback continuations, validated signup, and complete password reset UI/actions.
- User profile and agent preference management.
- Intelligent capture with AI interpretation, confirmations, pending questions, and task materialization.
- Inbox, Today, Tasks, Waiting, Projects, People, Reminders, Reviews, Agent chat, Memories, Files, Notifications, Change history, Settings, and entity detail routes.
- OpenAI-backed extraction, chat, summarization, embeddings, and background job processing.
- Semantic memory infrastructure with `pgvector` and HNSW indexes.
- Undo/audit infrastructure and entity timelines.
- Scheduled heartbeat generation, preference limits, notification delivery state, and background processing primitives.
- AI route selection, pricing catalog, usage ledger, cost aggregation helpers, settings, and cost dashboard are present in the worktree but not yet released.

## Pending or incomplete functionality

- Sprint 1.5 critical fixes: complete mobile navigation, RLS hardening, relationship ownership enforcement, heartbeat corrections, pagination, and consistent Supabase error handling.
- The online signup/recovery Playwright journeys are implemented but still require the remote credentials/redirect allowlist validation gate.
- Google OAuth is hidden until provider configuration and end-to-end validation exist.
- AI Routing and Cost Control requires behavioral SQL tests, remote migration validation/application, dashboard smoke tests, documentation, and a release commit.
- Generic scheduled worker, automatic weekly reviews, task editing, hybrid search, and broader NLP completion remain future roadmap work.
- Some preference fields are stored but do not yet have an operational consumer; they must not be presented as effective behavior until wired.

## Next priorities

1. Complete Sprint 1.5 foundation hardening without adding product scope.
2. Complete and deploy AI Routing and Cost Control.
3. Run the full quality gate and resolve every regression.
4. Reassess readiness for Phase 2 using verified evidence.

## Existing structure

- `src/app`: App Router pages, layouts, styles, auth callback, and localized application routes.
- `src/features`: domain server actions and UI for auth, capture, agent, profile, shell, and operations.
- `src/lib`: Supabase clients, AI provider/routing/usage helpers, validation, i18n, and shared utilities.
- `src/types`: application and generated-compatible database types.
- `supabase/migrations`: append-only schema history (`001` through `015`).
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
- Cost control (migration `015`, pending deployment validation): AI model pricing and AI usage events.
- All 15 migrations describe 36 tables in the projected schema. The remote database state must be verified before this count is treated as deployed state.

## Existing integrations

- Supabase Auth, PostgreSQL, Storage, RPC, Edge Functions, and RLS.
- OpenAI Responses/embedding APIs through the project AI provider abstraction.
- `pgvector` for semantic retrieval.
- Browser service worker for application shell support.
- GitHub Actions for CI.

## Existing jobs

- `ai_jobs` queue for attachment/background AI processing.
- `process-jobs` Edge Function for authenticated job execution.
- Database heartbeat functions and scheduled heartbeat entry points.
- A generic periodic worker and lease/reaper strategy are not yet implemented.

## Existing heartbeats

- Event-based notification generation for overdue tasks, reminders, pending questions, reviews, and inactivity signals.
- Per-user quiet hours, daily caps, cooldown controls, and importance preferences are represented in the schema/functions.
- Sprint 1.5 must correct timezone/locale behavior, failure isolation, concurrency, and delivery-cap semantics so work is delayed rather than discarded.

## Existing tests

- Vitest unit/component tests for auth UI, profile/settings, capture, AI parsing/routing/cost math/usage, and shared behavior.
- Playwright public foundation, online auth, and intelligent capture suites.
- pgTAP tests for foundational RLS, capture RLS, and AI usage schema/RLS.
- CI currently runs lint, typecheck, unit tests, and production build.

## Known coverage

Last verified baseline from the 2026-07-16 review:

- 18 Vitest files, 46 tests passing.
- Statements: 89.20%.
- Branches: 58.39%.
- Functions: 86.11%.
- Lines: 91.80%.
- Playwright: 2 public tests passing; 4 authenticated/online tests skipped without `ONLINE_SUPABASE_*` credentials.

These percentages apply only to modules imported by the test suite; they are not repository-wide coverage. Fresh post-sprint numbers replace this baseline at the final quality gate.

## Important recent commits

- `107a65f` — `feat: deliver intelligent brain pre-mvp` (2026-07-16).
- `7b79b70` — `fix: make profile settings reliably save` (2026-07-16).
- `60adc7b` — `test: verify online supabase auth flow` (2026-07-16).
- `87d7aff` — `feat: deliver my brain phase one foundation` (2026-07-16).

## Technical pending items

- Over-permissive CRUD policies on append-oriented/domain-controlled tables.
- Missing composite ownership constraints for related records.
- Remote verification of the completed recovery/signup flows and callback allowlist.
- Heartbeat date, locale, cap, failure-isolation, and concurrency weaknesses.
- Unbounded queries and N+1 signed URL generation on file listings.
- Inconsistent Supabase result/error handling and multi-write atomicity.
- No job lease/reaper and incomplete background scheduler deployment.
- Generic page metadata and partially localized operational copy.
- CI does not yet enforce Playwright, pgTAP, database lint, audit, or a meaningful coverage threshold.

## External pending items

- Confirm access to the linked Supabase project and remote migration history.
- Confirm remote secrets required by `process-jobs` and OpenAI integrations.
- Provide/use online test credentials for authenticated Playwright smoke tests.
- Keep Google OAuth disabled until a provider, redirect URLs, and secrets are configured and verified.

## Sprint 1.5 checklist

- [x] Establish permanent state, decision, changelog, and backlog documents.
- [x] Fix password recovery and signup validation locally; online proof remains in the deployment gate.
- [ ] Complete mobile navigation.
- [ ] Harden RLS and relationship ownership.
- [ ] Correct heartbeat behavior.
- [ ] Add pagination and consistent Supabase error handling.
- [x] Hide the unconfigured Google OAuth entry point.
- [ ] Finish AI Routing and Cost Control tests and migration.
- [ ] Validate the remote database and deployed worker.
- [ ] Smoke-test the cost dashboard.
- [ ] Run lint, typecheck, unit tests, coverage, build, and Playwright.
- [ ] Update all four permanent project documents with final evidence.
- [ ] Commit the completed sprint in reviewable units.
