# Sprint 1.5 Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Phase 1 pre-MVP into a verified, secure, resumable foundation without adding product features.

**Architecture:** Preserve the current Next.js/Supabase/OpenAI architecture. Add pure validation/pagination helpers, complete the existing auth journeys, constrain database writes at the RLS/constraint layer, make heartbeat execution timezone-safe and lossless, and finish the already-started AI routing/cost ledger. Use append-only migrations and regression tests for every behavior change.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5, Supabase SSR/PostgreSQL/RLS/Edge Functions, OpenAI SDK 6.47.0, Zod 4.4.3, Vitest 4.1.10, Playwright 1.61.1, pgTAP.

## Global Constraints

- Do not add product features or restart the architecture.
- Read relevant guides under `node_modules/next/dist/docs/` before changing Next.js behavior.
- Use migrations only; never rewrite an already-applied migration.
- Use TDD for behavior changes: failing test, observed failure, minimal fix, observed pass.
- Treat code, database, migrations, then documentation as the source-of-truth order.
- Update `STATE.md`, `DECISIONS.md`, `CHANGELOG.md`, and `TODO.md` with every completed phase or important capability.
- Preserve and finish the existing uncommitted AI Routing and Cost Control work.
- Commit reviewable, verified units and keep unrelated files out of each commit.

---

### Task 1: Permanent project-state ledger

**Files:**
- Create: `docs/STATE.md`
- Create: `docs/DECISIONS.md`
- Create: `docs/CHANGELOG.md`
- Create: `docs/TODO.md`

**Interfaces:**
- Produces: the durable state, decision, change, and backlog contract required by every later task.

- [x] Derive the initial state from the repository, migrations, test evidence, and Git history.
- [x] Validate all required sections exist and run `git diff --check`.
- [x] Commit as `docs: establish permanent project state` (`3aa0946`).

### Task 2: Complete and validate authentication journeys

**Files:**
- Create: `src/features/auth/schema.ts`
- Create: `src/features/auth/schema.test.ts`
- Create: `src/app/[locale]/auth/reset/page.tsx`
- Modify: `src/features/auth/actions.ts`
- Modify: `src/app/[locale]/auth/register/page.tsx`
- Modify: `src/app/[locale]/auth/recover/page.tsx`
- Modify: `src/app/[locale]/auth/login/page.tsx`
- Modify: `src/app/[locale]/auth/callback/route.ts`
- Modify: `src/proxy.ts`
- Modify: `e2e/online-auth.spec.ts`

**Interfaces:**
- Produces: `parseSignUp`, `parseRecovery`, `parsePasswordReset`, completed PKCE callback/reset flow, safe localized auth errors, and hidden Google OAuth.

- [ ] Write schema tests for normalized email, display-name bounds, password length/character classes, matching confirmation, and malformed reset data.
- [ ] Run `npm test -- src/features/auth/schema.test.ts` and confirm failure because the validation module is missing.
- [ ] Implement the Zod schemas and re-run the targeted tests to green.
- [ ] Extend the online Playwright suite with signup redirect, recovery callback/reset, password update, and rejected invalid input expectations.
- [ ] Update server actions to validate before Supabase calls, set explicit signup/recovery callback URLs, map errors to stable localized codes, and add password update/sign-out-on-completion behavior.
- [ ] Add the reset page and allow only callback/reset auth routes for a recovery session in `src/proxy.ts`.
- [ ] Hide the Google action and remove its live server action until the provider is configured and tested.
- [ ] Run targeted Vitest, Playwright public auth rendering, lint, and typecheck.
- [ ] Update the four permanent documents and commit the auth hardening unit.

### Task 3: Make mobile navigation complete

**Files:**
- Modify: `src/features/shell/navigation-links.tsx`
- Modify: `src/features/shell/app-shell.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Produces: an accessible mobile "More" destination menu while preserving four primary links and quick capture.

- [ ] Add a failing component test proving all information-architecture destinations are reachable at mobile size and the overflow control is keyboard-accessible.
- [ ] Run the targeted shell test and confirm it fails because only `items.slice(0, 4)` is rendered.
- [ ] Implement a native details/summary overflow menu with localized labels and active-route state.
- [ ] Add only the CSS needed for touch targets, viewport fit, focus, and menu layering.
- [ ] Re-run the shell test, lint, typecheck, and a mobile Playwright smoke test.
- [ ] Update the four permanent documents and commit the mobile navigation unit.

### Task 4: Harden RLS, ownership, and heartbeat semantics

**Files:**
- Create: `supabase/migrations/202607170016_foundation_hardening.sql`
- Create: `supabase/tests/foundation_hardening.sql`
- Modify: `supabase/tests/phase1_rls.sql`
- Modify: `supabase/tests/intelligent_capture_rls.sql`
- Modify: `src/types/database.ts`
- Modify domain actions only where a hardened RPC replaces a direct table mutation.

**Interfaces:**
- Produces: composite ownership constraints/validation triggers, least-privilege policies/grants for controlled tables, hardened mutation RPCs, and lossless timezone/locale-aware heartbeat execution.

- [ ] Write pgTAP assertions that cross-user relationship references fail, controlled tables have no direct update/delete policy, heartbeats use user-local day/locale, one user failure cannot abort the batch, and over-cap work remains pending.
- [ ] Run the SQL tests against a pre-migration database and confirm the new assertions fail when local Supabase is available; record an environmental skip otherwise.
- [ ] Add composite `(user_id, id)` uniqueness and foreign keys for concrete relationships; add validated ownership triggers for polymorphic relationships.
- [ ] Replace generic policies on audit/interpretation/embedding/message/summary/heartbeat/job/usage-ledger records with the minimum operations required by their domain flow.
- [ ] Add or tighten security-definer RPCs where authenticated application code must mutate a controlled table; fix grants and `search_path`.
- [ ] Rewrite heartbeat evaluation to derive local date/time from profile timezone, localize generated notification content/URLs, isolate per-user failures, use concurrency-safe run keys, preserve cooldown, and leave over-cap notifications queued instead of dismissed.
- [ ] Update database types and affected action calls.
- [ ] Run Supabase reset/lint/pgTAP when local infrastructure is available, plus unit/type/build checks.
- [ ] Update the four permanent documents and commit the database hardening unit.

### Task 5: Bound list reads and standardize Supabase errors

**Files:**
- Create: `src/lib/pagination.ts`
- Create: `src/lib/pagination.test.ts`
- Create: `src/lib/supabase/result.ts`
- Create: `src/lib/supabase/result.test.ts`
- Create: `src/features/shell/pagination-links.tsx`
- Modify: list pages under `src/app/[locale]/app/**/page.tsx`
- Modify: `src/features/profile/actions.ts`
- Modify: domain action files under `src/features/**/actions.ts` where a Supabase error is ignored.

**Interfaces:**
- Produces: `parsePage`, `pageRange`, a reusable pager, `requireSupabaseData`, and consistent localized action failure results.

- [ ] Write failing tests for invalid page input, range boundaries, result unwrapping, and propagated Supabase errors.
- [ ] Implement the pure pagination/result helpers and re-run tests to green.
- [ ] Add bounded `range`/`limit` reads and next/previous navigation to high-growth lists: tasks, waiting, projects, people, reminders, questions, memories, files, chat, reviews, notifications, history, and jobs.
- [ ] Replace the file-page per-row signed URL loop with a bounded/batched or lazy strategy supported by the installed Supabase client.
- [ ] Destructure and handle `error` for every touched query; show an explicit error state rather than a false empty state.
- [ ] Make settings writes atomic through a database RPC or explicit compensation and return the real failing operation.
- [ ] Run targeted tests, lint, typecheck, build, and relevant Playwright list smoke tests.
- [ ] Update the four permanent documents and commit the data-access hardening unit.

### Task 6: Finish AI Routing and Cost Control

**Files:**
- Preserve/finish all current work listed in `docs/superpowers/plans/2026-07-16-ai-routing-cost-control.md`.
- Modify: `supabase/tests/ai_usage_rls.sql`
- Modify: `src/features/capture/actions.ts`
- Modify: `src/features/chat/actions.ts`
- Modify: `src/features/agent/actions.ts`
- Modify: `src/app/[locale]/app/costs/page.tsx`
- Modify: `src/lib/ai/usage.ts` and cost aggregation helpers as needed.
- Modify: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/AI_AGENT.md`, `docs/SECURITY.md`, `docs/IMPLEMENTATION_PLAN.md`.

**Interfaces:**
- Produces: verified model routing, immutable complete usage/cost ledger, database-side complete cost summaries, deployed migration `015`, and a smoke-tested dashboard.

- [ ] Add failing unit/SQL tests for usage recording when downstream persistence fails, immutable pricing/usage, cross-user denial, pricing version selection, long-context math, and complete aggregation beyond 5,000 events.
- [ ] Reorder call sites so usage is recorded immediately after provider success and before fallible downstream persistence.
- [ ] Move all-time/range totals to an RPC or paginated aggregation that cannot silently truncate.
- [ ] Run targeted AI tests and pgTAP assertions.
- [ ] Inspect linked remote migration history, apply migration `015` and `016` only to the confirmed project, then verify schema/policies/functions remotely.
- [ ] Deploy/validate `process-jobs` and required secrets without exposing secret values.
- [ ] Run authenticated cost dashboard and worker smoke tests, including empty/error states.
- [ ] Reconcile architecture/database/AI/security/implementation docs with actual behavior.
- [ ] Update the four permanent documents and commit the completed AI phase.

### Task 7: Full sprint quality gate and closeout

**Files:**
- Modify only files required to fix failures.
- Finalize: `docs/STATE.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md`, `docs/TODO.md`.
- Create: `docs/SPRINT_1_5_REPORT.md`.

**Interfaces:**
- Produces: fresh verification evidence, exact final state, remaining-risk inventory, and a Phase 2 recommendation.

- [ ] Run `npm run lint` and resolve all errors.
- [ ] Run `npm run typecheck` and resolve all errors.
- [ ] Run `npm test` and resolve all failures.
- [ ] Run `npm run test:coverage` and record exact scoped coverage.
- [ ] Run `npm run build` and resolve all failures.
- [ ] Run `npm run test:e2e`; separate verified passes from credential/environment skips and resolve product failures.
- [ ] Run Supabase database lint and all pgTAP suites against the validated database.
- [ ] Run `npm audit --omit=dev` and document remaining dependency risk without unsafe forced downgrades.
- [ ] Review `git diff`, migration order, secrets scan, and permanent-document consistency.
- [ ] Write the closing report: corrected, deferred, remaining risks, coverage, architecture quality, and Phase 2 recommendation.
- [ ] Commit final documentation/verification fixes and leave a clean worktree.

## Self-review

- Every user-ordered sprint stage maps to a sequential task above.
- No task introduces a new product capability; new helpers/RPCs/tests exist only to harden existing behavior.
- Every behavioral change starts with a failing unit, E2E, or pgTAP assertion.
- Remote writes are gated on confirming the linked project and migration history.
- Environmental skips remain visible and cannot be reported as passes.

