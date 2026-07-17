# Project Backlog

Last updated: 2026-07-17  
Active milestone: Sprint 1.5 — Foundation hardening

Items are ordered by execution priority. Completed work moves to `CHANGELOG.md`; decisions move to `DECISIONS.md`; the current snapshot stays in `STATE.md`.

## Current sprint

### 1. Permanent project state

- [x] Create `STATE.md` with the current implementation/deployment distinction.
- [x] Create `DECISIONS.md` with the accepted architecture and process decisions.
- [x] Create `CHANGELOG.md` with the Phase 1 baseline and Sprint 1.5 section.
- [x] Create `TODO.md` as the prioritized backlog.

### 2. Critical foundation fixes

- [x] Complete password recovery code: validated request, callback/code exchange, reset form, password update, safe redirect, localized errors, and E2E specification.
- [x] Validate signup server-side with Zod, strong password policy, password confirmation, normalized email, safe error mapping, and E2E specification.
- [ ] Execute the authenticated signup/recovery Playwright journeys against the confirmed remote Supabase project and redirect allowlist.
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
- [ ] Execute the expanded pgTAP suite through the CLI when Docker Desktop is available; linked schema lint and equivalent remote behavioral smoke passed.
- [x] Link and inspect the remote Supabase project and migration history.
- [x] Confirm migration `015` was already deployed and apply incremental migrations `016` through `018`.
- [x] Deploy/validate `process-jobs` configuration and required secrets with a real file-analysis call.
- [x] Smoke-test cost aggregation and ledger with authenticated data; rendered dashboard remains in the Playwright gate.
- [x] Update architecture, database, AI, security, and implementation documentation where behavior changed.
- [ ] Commit the completed phase with an explicit migration/deployment note.

### 4. Full quality gate

- [ ] Run ESLint with zero errors.
- [ ] Run TypeScript typecheck with zero errors.
- [ ] Run the complete Vitest suite with zero failures.
- [ ] Run coverage and record fresh scoped/repository limitations.
- [ ] Run the production Next.js build successfully.
- [ ] Run the complete Playwright suite; distinguish real passes from environment skips.
- [ ] Run Supabase database lint and pgTAP tests against a working database.
- [ ] Resolve regressions before closing the sprint.

### 5. Sprint closeout

- [ ] Refresh `STATE.md` with final deployed/verified state.
- [ ] Append decisions made during hardening to `DECISIONS.md`.
- [ ] Move completed work into `CHANGELOG.md`.
- [ ] Reorganize remaining work in this file.
- [ ] Produce the Sprint 1.5 closing report and Phase 2 recommendation.

## Next milestone candidates — Phase 2

Do not start these during Sprint 1.5.

- [ ] Generic scheduled worker with leases, retries, backoff, and stale-job recovery.
- [ ] Automatic daily/weekly review scheduling and verified delivery.
- [ ] Task editing and richer lifecycle controls.
- [ ] Hybrid semantic/lexical search with measured relevance.
- [ ] Confidence-aware AI materialization and undo-first autonomy rules.
- [ ] Complete operational consumers for currently inert agent preference fields.

## Technical improvements

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

- [ ] Password recovery and signup now have explicit PKCE contracts but still require proof against the remote redirect allowlist.
- [ ] Jobs can remain `running` indefinitely after a worker crash.

## External dependencies

- [ ] Supabase CLI/Docker availability for local database validation.
- [ ] Valid `ONLINE_SUPABASE_*` credentials for authenticated Playwright tests.
- [x] Verified OpenAI and Supabase Edge Function secrets through a disposable real worker call.
- [ ] Google OAuth provider configuration if the integration is enabled in a later phase.
