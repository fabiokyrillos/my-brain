# Technical Changelog

All notable technical changes are recorded here. The format follows Keep a Changelog principles without assigning a public semantic version before the product has a release policy.

## 2026-07-21 — Issue #3: editable-candidate analytics fast-follow (branch, not merged)

### Added

- `src/features/product-analytics/contracts.ts`: two new allowlisted events, `candidate_edit_started` (`{ candidateCount: 1 }`) and `candidate_edit_reset` (`{ editedFieldCount: number }`, bounded 0–300); `task_candidates_confirmed` extended with bounded `editedCandidateCount`/`editedFieldCount` alongside the existing `candidateCount`.
- `src/features/product-analytics/interaction-events.tsx`: `recordCandidateEditStarted` (deduplicated once per entry/candidate per tab session, matching the existing `recordOnce` session-storage pattern) and `recordCandidateEditReset` (a new non-deduplicating `recordRepeatable` path, since a user may meaningfully repeat a reset).

### Changed

- `src/features/tasks/candidate-editor.tsx`: takes a new required `entryId` prop; calls `recordCandidateEditStarted` from every real field mutation (title/description/due-date change or explicit clear) — never from expand/collapse, a prop-driven rerender, or a React Strict Mode double-mount, since it is only ever invoked from `emitEdit`, which itself is only reachable from user input handlers; calls `recordCandidateEditReset` only from the explicit "Restaurar sugestão"/"Reset to suggestion" action, with `editedFieldCount` taken from the current canonical normalized edit (`normalizeCandidateEdits` output), never from raw touched-field UI state.
- `src/features/tasks/task-candidate-form.tsx`: passes the new `entryId` prop through to `CandidateEditor`.
- `src/features/tasks/actions.ts` (`confirmEntryTasks`): derives `editedCandidateCount`/`editedFieldCount` server-side from the same validated canonical `candidateEdits` array already sent to `confirm_entry_task_candidates_v2` (a candidate counts as edited only if its canonical `changes` object is non-empty), and includes both in the `task_candidates_confirmed` event; idempotent replay (`confirmation.idempotent`) still skips the event entirely, so replay never double-fires it.

### Known gap (explicit non-goal of Issue #3)

- `public.product_events`'s `event_name` CHECK constraint, `private.record_product_event`'s allowlist, and `private.validate_product_event_properties`'s `task_candidates_confirmed` case (all in migration `202607170024`) do not yet recognize `candidate_edit_started`, `candidate_edit_reset`, or the two new `task_candidates_confirmed` properties. Issue #3 explicitly excluded database migrations from scope, so until a follow-up migration adds them, all three of these analytics calls are rejected by the database's own allowlist and dropped fail-open (`recordProductEvent` returns `invalid_payload`; no crash, no product-flow impact — matching the existing best-effort/fail-open contract). Tracked in `docs/TODO.md`.

### Verification

- 594/594 unit/component tests (up from 579), 0 ESLint errors, 0 `tsc --noEmit` errors, production build green.
- No RPC, migration, or database change; no consumer of `confirm_entry_task_candidates`/`confirm_entry_task_candidates_v2` was touched.

## 2026-07-19 — Phase 2C Slice 2C.1: editable candidate confirmation (branch, not merged)

### Added

- Migration `202607190032`: `confirm_entry_task_candidates_v2` RPC (`SECURITY DEFINER`, `set search_path = ''`, `auth.uid()`-only identity) accepting a bounded, closed-allowlist edit array (`title`/`description`/`dueAt`) per selected candidate index; rejects duplicate/out-of-range/unselected-candidate edits, empty/overlong title, overlong description, and invalid/nonexistent/ambiguous due dates at the database boundary; canonicalizes effective values, stores a SHA-256 request fingerprint on `undo_operations` for same-key/different-payload replay rejection, and atomically materializes all selected tasks with a `2C_ALREADY_MATERIALIZED` guard against double confirmation. The legacy `confirm_entry_task_candidates(uuid, uuid, integer[], text)` RPC is unchanged and remains callable.
- Migration `202607190033`: `guard_v2_confirmed_interpretation_correction` trigger on `entry_interpretations` (`SECURITY DEFINER`, no public/authenticated execute grant) rejecting a `user_corrected` interpretation insert that would supersede an interpretation still backing active tasks from a v2 confirmation, closing a confirmation/correction race.
- `src/features/tasks/candidate-edit-contract.ts`: closed Zod schemas and canonicalization for candidate edit commands, byte-bounded serialization, and unique-index enforcement.
- `src/features/tasks/candidate-due-date.ts`: local wall-time↔offset-instant conversion against the profile IANA timezone, explicitly rejecting nonexistent (DST gap) and ambiguous (DST overlap) local times via a bounded ±24h-minute scan.
- `src/features/tasks/candidate-editor.tsx`: per-candidate inline edit/reset/explicit-clear UI with an "Edited" indicator, visible immutable suggestion, accessible fieldset/legend, keyboard/focus/live-region support, and 44px touch targets.
- `e2e/editable-candidate-confirmation.spec.ts` and `scripts/remote-editable-candidate-confirmation-smoke.mjs`: disposable-fixture live journeys through the real Server Action and linked database.
- `supabase/tests/editable_candidate_confirmation.sql` and `editable_candidate_confirmation_race.sql`: pgTAP coverage for the new RPC and the correction-race guard.

### Changed

- `src/features/tasks/task-candidate-form.tsx`: rewritten to hold an edit map keyed by candidate index (retained across deselect/reselect within the mounted page, excluded from the submitted command while deselected), rotate the operation key only when the canonical payload signature actually changes, and surface stable per-failure result codes instead of raw errors.
- `src/features/tasks/actions.ts` (`confirmEntryTasks`): re-validates every field server-side, never forwards client-supplied ownership or task identifiers, calls `confirm_entry_task_candidates_v2`, and maps every RPC error to a localized, stable code with no raw SQL/PostgREST text reaching the UI.
- `src/features/daily-cycle/review-projection.ts` / `src/app/[locale]/app/inbox/[entryId]/page.tsx`: thread the authenticated profile timezone (server-validated, default `America/Sao_Paulo`) into the editor.

### Known gap

- The PRD §14 / implementation-plan Task 5 analytics extension — `candidate_edit_started`, `candidate_edit_reset` events, and `editedCandidateCount`/`editedFieldCount` on `task_candidates_confirmed` — was not implemented in this slice; `task_candidates_confirmed` currently records only `candidateCount`. See `docs/reports/PHASE_2C_SLICE_01_FINAL_ACCEPTANCE.md`.

### Verification

- 579/579 unit/component tests (83 files), 0 ESLint errors, 0 `tsc --noEmit` errors, production build green, `git diff --check` clean.
- Migrations `202607190032`/`202607190033` at local/remote parity; `supabase db lint --linked --level error` clean.
- Live authenticated Playwright run (desktop + Pixel 7 projects) against the linked development database exercised edit, confirm, audit, and undo through the real production Server Action with a disposable fixture torn down afterward.
- Not pushed; no pull request opened; no hosting deployment occurred.

## 2026-07-19 — Phase 2C planning checkpoint

### Added

- `docs/PHASE_2C_PRD.md`, the canonical product contract for Editable Candidate Tasks and Transactional Materialization, including stable requirement IDs, exact 2C.1 semantics, UX, security/privacy, analytics, acceptance, risks, rollout, rollback, and full-phase Definition of Done.
- `docs/PHASE_2C_IMPLEMENTATION_PLAN.md`, the ordered 2C.1–2C.6 execution plan with an exact versioned RPC direction, transient edit command, atomic transaction, compatibility boundary, test matrix, per-slice gates, and authorization stops.
- ADR-031, accepting transient candidate edits, immutable suggestion provenance, a persistent task as the sole edited truth, and a versioned materialization contract while preserving the legacy RPC.

### Changed

- Current state, backlog, and Phase 2 roadmap now identify Phase 2C planning as approved and implementation as not started; Phase 2C.1 is limited to title, description, and due date, while split/merge remains isolated in Slice 2C.5.

### Verification

- Repository preflight matched clean `main`/`origin/main` at `89af5abad497fd2220ceac22704cf6abc57a20fe` before documentation work.
- Planning was reconciled against current candidate projection/form/action, `confirm_entry_task_candidates`, provenance, audit/undo, Needs Attention, Work, product events, generated types, pgTAP, remote smoke, authenticated Playwright, and installed Next.js 16.2.10 forms/Server Action guides.
- No product code, migration, generated type, Supabase state, Edge Function, secret, schedule, grant, RLS, Auth/email setting, remote infrastructure, feature branch, deployment, push, or PR changed.

## 2026-07-19 — Slice 2X.18: close remote parity and Phase 2X evidence

### Added

- `test:remote:2x`, a sequential fail-fast aggregate covering jobs, interpretation revisions, product events, entry processing, daily-cycle behavior, the complete Supabase baseline, and residual-data cleanup.
- `test:remote:2x:cleanup`, a read-only linked verifier for disposable Auth prefixes, owner-row orphans, and storage leftovers.
- Remote entry-worker assertions for persisted completion events, same-attempt deduplication, distinct reprocessing-attempt events, and unattended scheduled drain when the worker secret is not locally readable.
- A reproducible 283-row PRD traceability annex plus sanitized deployment/parity/Auth/cleanup evidence, alongside `docs/reports/PHASE_2X_SLICE_18_REPORT.md` and the complete `docs/PHASE_2X_REPORT.md` crosswalk.

### Changed

- Deployed only the accumulated committed `process-jobs` runtime from remote v12 to v13 after preserving the complete v12 rollback input. A fresh v13 download matches the local runtime and `_shared` dependencies exactly; the local-only Deno test was not deployed.
- The provider-auth E2E harness now avoids retrying email delivery to the reserved `example.com` domain after redacted linked Auth logs established HTTP 400 `email_address_invalid`; signup remains an explicit external skip and recovery core remains independently verified through a disposable administrative link.
- Shared-project smokes now use job-scoped claims, preflight and single-row reaping for disposable fixtures, rely on the existing scheduled drain instead of manually draining the global queue, and make every cleanup failure process-fatal.
- Permanent architecture, database, agent, security, standards, decision, state, backlog, and Phase 2 plan documents now describe the deployed Phase 2X closeout.

### Verification

- Remote aggregate passed all seven gates; direct initial/reprocess worker, scheduled drain, attachment compatibility, owner/RLS boundaries, idempotency, and final residual-data cleanup passed against active v13.
- Local Vitest passed 80 files/443 tests; lint, typecheck, Next.js 16.2.10 production build, and `git diff --check` passed.
- Playwright passed Foundation 3/3 per viewport, authenticated daily journey 18/18 per viewport, navigation 1/1 per viewport, sign-in/profile 2/2, and recovery core 2/2; provider signup is 2 explicit skips, not passes.
- Local and linked migrations match through `202607180031`; generated linked types match exactly; linked DB lint has only the two pre-existing `run_user_heartbeat` SQLSTATE `42804` warnings.
- Final cleanup found zero disposable users, zero orphaned entries/jobs/attachments/pending questions/tasks, zero owner-visible disposable product events after Auth deletion, and zero `remote-smoke.txt` storage leftovers.
- Independent final closeout review returned READY with no critical or important finding after shared-queue, cleanup, drain-outcome, and per-ID traceability remediation.
- No Deno or Docker/pgTAP pass is claimed. No migration, secret, schedule, grant, RLS, Auth/email configuration, other Edge Function, branch push, or non-disposable data change occurred.

## 2026-07-19 — Slice 2X.17: cover the converged daily journey

### Added

- Deterministic coverage for basic pending question, recoverable retry, and terminal retry in `e2e/intelligent-capture.spec.ts` — previously entirely absent, since these entry states are not reliably reachable through real, unambiguous AI extraction. Uses already-granted `authenticated` RPCs (`begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`) to force the exact state directly, the same technique the existing suite already used for forcing an unconfirmed candidate.
- Keyboard/focus/live-region/touch-target assertions on the entry-review page's progressive disclosure (native `<details>` technical panel, retry control).
- `docs/reports/PHASE_2X_SLICE_17_REPORT.md` with full scope, RED/GREEN evidence, and rollback.

### Changed

- `e2e/intelligent-capture.spec.ts` reorganized from one 379-line serial test into deterministic, independently-attributable named scenarios across two `test.describe` blocks — the existing real capture→review→confirmation→chat→reviews→files→costs→settings→heartbeat→undo→product-events journey is unchanged in behavior, only reorganized into 13 named tests; a second, new describe adds the 3 tests above.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: the "no interpretation yet" fallback's own retry button is now conditioned on `!canRetry`, removing a duplicate "Reinterpretar entrada"/"Reinterpret entry" button that appeared whenever an entry had never had a successful interpretation and its latest state was `recoverable_error`/`terminal_error` — found by real execution of the new retry scenarios, not by inspection. No capability was removed; retry is still offered exactly once, from whichever location is contextually correct.

### Verification

- Real RED found and fixed via actual online execution, not predicted: an initial wrong button-label assumption, then the duplicate-button defect above, then a flaky assertion on the ephemeral `useActionState` success toast (which races a legitimately fast worker pickup) — replaced with an assertion on the durable recovery signal instead.
- Full Vitest unchanged at 80 files/443 tests (E2E-only slice; the touched page has no render-based test harness in this codebase, only a source-text architecture guardrail — its behavior is validated through Playwright). ESLint, TypeScript, Next.js 16.2.10 production build, and `git diff --check` passed.
- Offline Playwright (`foundation.spec.ts`) desktop and mobile each passed 3/3, unaffected.
- Authenticated online `intelligent-capture.spec.ts` passed 18/18 on both desktop and mobile (full matrix, run twice during RED/GREEN iteration). `online-mobile-navigation.spec.ts` re-run 1/1 both projects to confirm no regression. `online-auth.spec.ts` re-run once (not modified): password recovery now genuinely passes both projects, resolving Slice 2X.16's `recovery-failed` observation as transient rate limiting; signup remains explicitly, traceably skipped on confirmed ongoing hosted-email quota exhaustion.
- Remote daily-cycle smoke and remote product-events smoke both passed against the linked project; linked migration status confirmed synchronized through `202607180031`; `supabase db lint --linked` showed only the same pre-existing, unrelated `run_user_heartbeat` warning.
- No migration, RPC, grant, generated database type, secret, schedule, deployment, or remote infrastructure mutation. No product-event contract changed. Does not close Phase 2X — Slice 2X.18 does.

## 2026-07-19 — Slice 2X.16: close the projection boundary across Home/Caixa/Work/review

### Added

- `src/features/daily-cycle/home-projection.ts` (`loadHomeSupplementalProjection`): a minimal `server-only` module owning Home's waiting-count and newest-open-question queries, explicitly owner-scoped.
- `src/features/daily-cycle/architecture.test.ts`: a table-driven architecture guardrail asserting forbidden/required source patterns (no `database.types`, no raw `.from()` table calls, no raw enum/score rendering) across Home, Caixa, Work, the entry review, and the candidate-confirmation form.
- `docs/reports/PHASE_2X_SLICE_16_REPORT.md` with full scope, evidence, and rollback.

### Changed

- Home's priority panel now reads `loadWorkProjection(..., { view: "today" })` directly — the same due-today/overdue rule, profile timezone, and fallback Work already uses — instead of a raw, divergent `tasks` query that ignored due dates entirely; it links to `/{locale}/app/work?view=today`. This also removes a raw internal-enum fallback (`task.status.replaceAll(...)`) since every `today` item has a `due_at`.
- `TaskCandidateForm` now accepts `ActionableCandidateView[]` (from `@/features/daily-cycle/contracts`) instead of the raw AI-extraction `TaskCandidate[]`: the confidence-score badge is gone, and the component no longer re-filters `unavailableIndexes` on the client — that validity rule is applied once, upstream, in `review-projection.ts`. Each candidate's own `key` (its true original extraction index) is now the submitted `candidateIndex` value.
- `EntryReviewProjection`'s public output no longer exposes the raw `taskCandidates`/`unavailableCandidateIndexes` fields; nothing outside `review-projection.ts` consumed them once the form moved to `actionableCandidates`.
- `src/features/interpretations/data.ts` now imports `server-only`, making its previously-only-conventional server boundary a build-time guarantee.

### Verification

- Strict TDD: focused RED confirmed missing modules/updated contracts before implementation; focused GREEN reached 28 files/196 tests across all touched surfaces.
- Full Vitest passed 80 files/443 tests (up from 78/425). ESLint, TypeScript, Next.js 16.2.10 production build, and `git diff --check` passed.
- Offline Playwright desktop and mobile each passed 3/3 with the same 5 expected credential-gated skips as the Slice 2X.15 baseline.
- Authenticated online Playwright passed 12/16; the 2 failures (`online-auth.spec.ts` signup and password-recovery journeys) are unrelated to this slice's file list and most likely reflect Supabase email-sending rate limits from the remote smoke scripts run immediately beforehand in the same session.
- Remote daily-cycle smoke and remote product-events smoke both passed against the linked project; linked migration status confirmed synchronized through `202607180031`; `supabase db lint --linked` showed only a pre-existing, unrelated warning in `run_user_heartbeat`.
- No migration, RPC, grant, generated database type, secret, schedule, deployment, or remote infrastructure mutation. No product-event contract changed.

## 2026-07-19 — Slice 2X.15: complete daily product funnel instrumentation

### Added

- A closed browser interaction boundary for capture intent, confirmed views, item opens and technical disclosure, with per-tab session identity, logical deduplication and no arbitrary client event names.
- Deterministic UUID idempotency keys for domain and worker outcomes, plus owner-scoped worker emission after persisted completion/failure.
- Complete focused tests, a 17-event authenticated remote smoke, safe bounded conversion/latency checks and owner-token-only Playwright event-name/count assertions.
- The durable trigger/subject/payload/failure inventory in `docs/reports/PHASE_2X_SLICE_15_REPORT.md`.

### Changed

- Capture, correction, candidate confirmation, question answer, processing retry and task-status Actions now record their approved outcome events only after the underlying mutation succeeds and independently of the product response.
- Home/Needs Attention, entry review/candidates/technical details and canonical Work now emit only meaningful visible/open interactions; render, hydration, prefetch, rerender, nested disclosure and no-op task updates do not overcount.
- The entry worker now records completion/failure/retry only after the respective persistence RPC succeeds, using the existing service-role owner-scoped event RPC.
- Event contracts expose an explicit version-1 map and preserve exact content-free payload allowlists.

### Verification

- Strict TDD recorded 18 focused files with 25 failures/60 passes before production changes and reached 18 files/134 tests green after the separate review regressions.
- Full Vitest passed 78 files/425 tests. ESLint, TypeScript, Next.js 16.2.10 production build and `git diff --check` pass. Offline Playwright desktop/mobile passed 6 tests with 10 credential-gated skips.
- Authenticated online Playwright passed intelligent capture on desktop/mobile and navigation on desktop/mobile (4 tests total). The expanded remote product-events smoke passed all 17 names, privacy/allowlist rejection, idempotency/meaningful repeat, ownership/RLS/service-role controls, bounded queries and cleanup.
- No migration, RPC, grant, generated database type, secret, schedule, deployment or remote infrastructure mutation. Local Edge Function source changed but was not deployed.

## 2026-07-19 — Slice 2X.14: visible promises aligned with behavior

### Added

- A static capability registry that records each authenticated product promise as operational, informational, advanced, or future, with its visible surface and consumer evidence.
- Owner-scoped server-only Settings and Reviews projections that return localized product DTOs and fail closed on unsupported persisted values.
- Home operational status derived from the existing Inbox and Needs Attention projections, plus PT-BR/English lexical and product-contract tests.
- The permanent capability inventory in `docs/PHASE_2X_REPORT.md` and execution evidence in `docs/reports/PHASE_2X_SLICE_14_REPORT.md`.

### Changed

- Settings now exposes only controls with real consumers. Proven AI routing and cost transparency use accessible progressive disclosure; identity, persisted locale, automatic review schedules, autonomy, privacy, follow-up intensity, and unused reasoning/background routes remain hidden.
- Saving Settings submits only visible fields, ignores reserved Next.js `$ACTION_` transport metadata, rejects unknown product keys, and preserves every hidden legacy value through owner-scoped server reads before calling the existing full-payload RPC.
- Reviews presents localized product period/status labels and on-demand generation language without exposing raw storage enums or `model_used`.
- Capture and reprocessing copy now distinguishes durable save, enqueue request, organizing, retry, and completion. Home no longer implies an automatic next review.

### Verification

- Strict TDD recorded the focused RED (10 files, 13 failures) and final focused GREEN (43 tests plus the Settings action regression). Full Vitest passes 75 files/404 tests; ESLint, TypeScript, Next.js 16.2.10 production build, and `git diff --check` pass.
- Offline Playwright desktop/mobile passes 6 tests with 10 credential-gated skips. Targeted authenticated Playwright passes 4 tests covering real Settings persistence and Home/Settings/Reviews reachability in PT-BR/English on desktop/mobile.
- No migration, RPC, Edge Function, generated database type, deployment, secret, or infrastructure mutation. Linked local/remote migration histories remain synchronized through `202607180031`.

## 2026-07-19 — Slice 2X.13: converged primary navigation and More grouping

### Added

- `src/features/shell/capabilities.ts` as the pure, tested route/product navigation contract: all authenticated pages are classified into primary, Context, Reflection, Organization, Transparency, Preferences, global, or advanced/context-only destinations; Jobs is never surfaced by common navigation.
- Deterministic active-state mapping for nested Inbox/review and Brain routes, canonical Work query views, and the localized `/today`, `/tasks`, and `/waiting` compatibility aliases. Canonical link and locale-switch helpers preserve locale plus meaningful query state without reading Supabase or persisted-domain state.
- Grouped desktop navigation and the same conceptual hierarchy inside mobile Mais/More, with localized accessible group names, visible focus, 44 px targets, bounded viewport overflow, Escape close/focus restoration, and DOM order aligned with visual/tab order.

### Changed

- Início/Home, Caixa/Inbox, Trabalho/Work, and Brain are now the only primary destinations on desktop and mobile. Capture remains global and visually distinct; Notifications remains the global icon; Projects, People, Memories, Files, Reviews, Questions, Reminders, History, Costs, and Settings remain reachable through their approved groups.
- The locale switch preserves the current localized pathname and supported query string instead of returning to Home.
- The shell no longer presents the static, unobservable "Brain atento" and "Brain ativo" claims. Existing canonical routes, nested routes, query views, legacy redirects, and direct technical access to Jobs remain unchanged.

### Verification

- Strict TDD: the initial focused run failed because `capabilities.ts` and the new hierarchy did not exist; a second RED exposed DOM/visual tab-order drift. Final focused GREEN: 2 files/9 tests. Full Vitest: 69 files/382 tests. ESLint, TypeScript, the Next.js 16.2.10 production build, and `git diff --check` pass.
- Offline Playwright desktop/mobile: 6 passed and 10 credential-gated online tests skipped, as expected for the standard offline command. Targeted authenticated online Playwright obtained all three linked `ONLINE_SUPABASE_*` credentials and passed desktop/mobile in PT-BR and English: 2 passed.
- No migration, RPC, Edge Function, generated type, secret, deployment, or infrastructure change. `supabase migration list --linked` confirms local and remote histories synchronized through `202607180031`.

## 2026-07-18 — Slice 2X.12: canonical Work route and task projection

### Added

- `src/features/daily-cycle/work-projection.ts`: server-only `loadWorkProjection`, the canonical Work page's only `tasks` reader. It scopes both profile and task queries to the authenticated owner, resolves an IANA timezone with the existing `America/Sao_Paulo` fallback, implements Today (overdue + due today, open, `due_at asc/id asc`), All (non-cancelled, `updated_at desc/id asc`) and Waiting (`waiting`, same stable updated ordering), retains the existing 50-item page/lookahead contract, and maps each row through the existing fail-closed `toWorkItemView` mapper.
- `src/features/daily-cycle/work-view.tsx`: localized PT-BR/English canonical Work presentation with accessible view links (`aria-current="page"`, native links, visible focus, 44px touch targets), short criteria copy per view, honest Waiting limitation copy, manual creation on All, DTO-only task rendering, and pagination URLs that preserve `view`.
- `src/app/[locale]/app/work/page.tsx` plus architecture/route tests. The page authenticates, parses the product view/page, calls only `loadWorkProjection`, and passes product DTOs to `WorkView`; it never imports database types or reads `tasks` directly.
- Focused tests for projection filtering/ordering/ownership/pagination/timezone/DTO actions/fail-closed mapping, Work presentation/localization/accessibility/actions/manual creation/pagination, exact route aliases, and canonical Work revalidation after creation/mutation/confirmation/undo. Playwright coverage now includes offline protection for every legacy route and credential-gated authenticated alias plus confirmed-task/undo Work assertions.

### Changed

- Localized `/today`, `/tasks`, and `/waiting` page modules are now safe redirects to `/{locale}/app/work?view=today|all|waiting&page=N`; locale, equivalent filter, and page are retained. Existing primary navigation destinations are deliberately unchanged until Slice 2X.13.
- `TaskList` now consumes `WorkItemView[]` instead of raw task rows/status strings, localizes the complete human-state/origin vocabulary without raw-enum fallback, formats deadlines in the authenticated profile timezone, and renders only actions supplied by `availableActions` (complete, wait, resume, reopen).
- `PaginationLinks` gained an optional product-query map so Work retains `view` while changing pages; all existing callers retain their original `?page=N` URLs.
- Manual task creation, task-status mutation, candidate confirmation, and candidate-creation undo now revalidate canonical Work in both locales while preserving their genuinely affected pre-existing Home/Inbox/legacy surfaces.

### Verification

- Strict TDD: the initial focused suite failed with 18 expected missing-slice failures; a second focused RED proved the product-action translation was still absent from the Server Action. Final focused GREEN: 6 files/29 tests. Full Vitest: 68 files/375 tests. Lint, typecheck, production Next 16.2.10 build, and `git diff --check` pass.
- Offline Playwright desktop/mobile: 6 passing, 10 credential-gated skips. Authenticated online alias/confirmed-task/undo assertions were authored but not run because `ONLINE_SUPABASE_URL`, `ONLINE_SUPABASE_PUBLISHABLE_KEY`, and `ONLINE_SUPABASE_SERVICE_ROLE_KEY` are absent; no online pass is claimed.
- No migration, RPC, Edge Function, generated type, or infrastructure change. `supabase migration list --linked` confirms local and remote histories synchronized through `202607180031`.

### Known limitation

- Primary navigation still points to some legacy task URLs; those destinations now converge through redirects, while reorganizing the navigation itself remains explicitly Slice 2X.13.
- The authenticated online Work journey is skipped in this environment due to absent `ONLINE_SUPABASE_*` credentials. Unit/architecture coverage and offline desktop/mobile route protection passed, but no live authenticated browser result is claimed.

## 2026-07-18 — Slice 2X.11: Needs Attention on Home and Caixa

### Added

- `src/features/daily-cycle/needs-attention-item.tsx` (`NeedsAttentionItemRow`): pure presentational row consuming only `NeedsAttentionItemView` — title, explanation, localized primary-action hint, timestamp, and a full-row link to the canonical `/{locale}/app/inbox/{entryId}` review route. Shared by both the Home preview and the Caixa full queue, mirroring the Slice 2X.6 `InboxItemRow` reuse pattern so both surfaces render the exact same row markup for the same DTO.
- `src/features/daily-cycle/needs-attention-list.tsx` (`NeedsAttentionList`, client component): renders the accumulated `NeedsAttentionItemView[]` for the Caixa `?view=needs-you` filter and owns keyset "load more" state entirely client-side — a "Carregar mais"/"Load more" button (hidden once `hasNext` is false) calls a bound Server Action with the last-seen `{ occurredAt, entryId }` cursor and appends the returned page to existing items. Duplicate clicks are prevented by disabling the button while a request is in flight; a failed page load leaves already-loaded items untouched and shows an inline, localized retry-safe error instead of losing state; there is no automatic retry loop.
- `src/features/daily-cycle/attention-actions.ts` (`loadMoreNeedsAttention`, Server Action): thin authenticated wrapper around `loadAttentionProjection` for the one client-driven pagination call site this slice adds. Returns a discriminated `{ ok: true; page }` / `{ ok: false; code: "session_expired" | "action_failed" }` result instead of letting a Supabase error or an unauthenticated call reject the promise uncaught in the browser.
- Home (`src/features/shell/home-dashboard.tsx`): a new "Precisa de você" panel calls `loadAttentionProjection` with a small bounded limit (3), renders up to three `NeedsAttentionItemRow`s, an honest count badge (`{items.length}` with a `+` suffix only when `hasNext` — never a promised exact total, since the RPC deliberately does not scan the user's full history per XG-025), an empty state, and a "Ver tudo"/"View all" link to `/{locale}/app/inbox?view=needs-you`. Existing panel kickers were renumbered (02 → 06) to make room; no existing panel's behavior changed.
- Caixa (`src/app/[locale]/app/inbox/page.tsx`): a new two-tab `InboxViewTabs` nav ("Todos"/"All" and "Precisa de você"/"Needs you", `aria-current="page"` on the active tab) and a `?view=needs-you` branch that loads the first page via `loadAttentionProjection` (no cursor — a stable, bookmarkable URL) and renders it through `NeedsAttentionList`, with its own empty state. The default (`all`) branch is otherwise unchanged, including its existing offset-based `page` pagination.
- `src/i18n/messages.ts`: new `home.needsAttention`, `home.needsAttentionEmpty`, `home.viewAll` keys (pt-BR/en). Tab labels and empty-state copy inside `daily-cycle`/inbox files follow the existing local `pt ? "…" : "…"` convention already used by every other file in that module, not `messages.ts`.
- CSS (`src/app/operations.css`): `.attention-panel`, `.attention-count`, `.needs-attention-action-hint`, `.panel-view-all`, `.inbox-view-tabs` (with `aria-current` styling and 44px touch targets), `.needs-attention-list`, `.load-more-button`, `.needs-attention-error`, reusing `.list-row`/`.list-stack`/`.count`/`.button-secondary`/`.form-error` wherever the existing shape already matched.
- `e2e/intelligent-capture.spec.ts`: extended the existing authenticated online journey with a Needs Attention detour before candidate confirmation — the Home panel lists the entry, "Ver tudo" navigates to the Caixa `?view=needs-you` filter with the tab marked active, the row's link lands back on the same entry's review page, and the English tab label renders correctly on a direct visit to the localized URL. Not executed in this session (no `ONLINE_SUPABASE_*` credentials on this workstation) — see Known limitation.

### Decisions

- **Client-side accumulation instead of URL-encoded cursor pagination for the Caixa queue.** The general pagination requirements for this slice (preserve already-loaded items on a failed subsequent page, prevent duplicate load-more requests, avoid infinite retry loops) are not achievable with pure server-rendered `Link` navigation, since a failed page load there would replace the whole rendered list. `NeedsAttentionList` is the first client component in this codebase to drive pagination through a bound Server Action; it introduces no new abstraction beyond this one call site (no generic "paginated list" framework). The `?view=needs-you` URL itself stays stable and bookmarkable — only the first page is server-rendered; deeper "load more" state is not reflected in the URL, consistent with XG-027 (a refresh naturally reloads page one of a live queue, which is expected, not a defect).
- **Home's count badge shows only what the bounded page proves, never a promised exact total.** `list_needs_attention` deliberately does not scan a user's full entry history (XG-025), so there is no cheap exact count to show. `{items.length}` plus a `+` suffix when `hasNext` is the honest signal available without a second, unbounded query — consistent with TRU-002/TRU-A04 (no message may claim more than what actually happened/is known).
- **`needs_attention_viewed`/`needs_attention_item_opened` product events are intentionally not emitted by this slice.** Both event names and their property schemas already exist (Slice 2X.2), but wiring client-side view/open emitters is explicitly Slice 2X.15's file list ("adicionar emissores pequenos aos componentes Home/attention/review/work"), and no client-invoked emitter of any kind exists anywhere in this codebase yet (`recordProductInteraction` has zero production callers before this slice). Building that pattern for a single call site now would be exactly the kind of premature, single-consumer abstraction the engineering standards warn against. See the Slice 2X.11 report for the full reasoning.
- **No new filters beyond "Todos"/"Precisa de você".** The PRD's full Caixa filter set (Todos, Precisa de você, Organizando, Prontos, Com problema — FLOW-010) is not this slice's scope; the implementation plan's own file list for 2X.11 authorizes only the one canonical `view=needs-you` filter.

### Verification

- `npm test`: 64 files / 357 tests passing (13 new: 4 `needs-attention-item.test.tsx`, 5 `needs-attention-list.test.tsx`, 3 `attention-actions.test.ts`, plus 5 new/adjusted cases in `home-dashboard.test.tsx`). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing, `/[locale]/app/inbox` and `/[locale]/app` both compile.
- Offline Playwright (`desktop`+`mobile`): 4/4 passing, 10 expected online skips — unchanged from the Slice 2X.10 baseline; this slice's new online assertions are gated behind the same pre-existing `ONLINE_SUPABASE_*` skip. `git diff --check`: clean (pre-existing LF/CRLF advisories only).
- No migration in this slice; local/remote migrations remain synchronized through `031`.

### Known limitation

- The online authenticated Playwright addition described above was authored and reviewed but not executed — this workstation has no `ONLINE_SUPABASE_*` credentials. No claim of online execution is made for it.
- This slice does not assert that a fully-confirmed entry disappears from the Needs Attention queue end-to-end in the online journey: that specific fixture's post-confirmation entry status is not deterministic (the existing spec itself tolerates either `awaiting_review` or `completed`), and if the entry stays `awaiting_review` it correctly remains queued under `review_interpretation` rather than vanishing. That exact removal invariant is already deterministically proven at the unit/RPC level by Slice 2X.10's own `attention-projection.test.ts` and `needs_attention_projection.sql` regression case, under a controlled fixture — this slice does not need to re-prove it under an ambiguous one.
- Home's count badge is a lower bound (`items.length`, `+` when `hasNext`), never an exact total of the user's full Needs Attention backlog, by design (see Decisions).

## 2026-07-18 — Slice 2X.10: Needs Attention query and projection

### Added

- Migration `202607180030_phase_2x_needs_attention_projection.sql`: RPC `list_needs_attention(p_limit, p_cursor_occurred_at, p_cursor_entry_id)` — `SECURITY DEFINER`, owner-scoped via `auth.uid()`, `set search_path = ''` — reimplements the exact five-reason precedence already codified in `src/features/daily-cycle/lifecycle.ts` (`resolveDailyCycleLifecycle`) directly in SQL, since that TypeScript mapper cannot run inside Postgres and Inbox's existing fixed-page approach does not generalize to "every entry that currently qualifies" across an unbounded entry history. Filtering is restricted to a bounded candidate set (entries whose status alone already implies possible attention; `completed` entries with a non-empty, non-record-only current-interpretation candidate list or an open pending question; the narrow `saved`+settled-or-unrecognized-job fallback) so the queue stays paginable without an unbounded per-user scan (XG-025). Returns only ids, reason codes, timestamps, and keys — no copy, no trust. Also adds the supporting partial index `jobs_interpret_entry_status_idx`. Grants execute to `authenticated` only.
- Migration `202607180031_fix_needs_attention_candidate_correlation.sql`: same-session hotfix (applied before either migration was committed) fixing a real defect the extended remote smoke found — see Fixed below.
- `src/features/daily-cycle/attention-projection.ts` (`loadAttentionProjection`, `ATTENTION_PAGE_SIZE`): server-only loader that calls `list_needs_attention`, never recomputes lifecycle, and hydrates only the page actually returned (entry original content / current interpretation summary for the title, minimal additional owner-scoped queries) into `NeedsAttentionItemView` through the existing Slice 2X.1 mapper `toNeedsAttentionItemView`. Its primary action reuses `review-projection.ts`'s `attentionActionId` (now exported) so a queue item's action id always matches the entry-review page's own action for the same reason; `href` always points at the canonical `/{locale}/app/inbox/{entryId}` review route rather than duplicating the review UI inline. Fails closed by dropping (not fabricating) a row whose entry cannot be hydrated or whose reason the current contracts don't recognize. 13 new tests (`attention-projection.test.ts`).
- `supabase/tests/needs_attention_projection.sql` (new, 35 pgTAP assertions): function/grant/security-definer/search-path contract; every reason across a realistic entries/jobs/interpretations/tasks/pending_questions fixture set (including the NY-006/NY-007 automatic-vs-manual-retry distinction and the `answer_existing_question` precedence over `confirm_existing_candidates`); cross-owner isolation; deterministic full-order and keyset-pagination assertions with an explicit same-timestamp tie-break case; response-shape spot checks (`current_interpretation_id`/`job_id`/`open_question_id` populated or left `null`, never invented); a limit-clamping case; and a dedicated regression for the migration-031 defect (confirm one of two candidates, assert still listed; confirm the second, assert resolved) exercised through the real `confirm_entry_task_candidates` RPC.
- `scripts/remote-daily-cycle-smoke.mjs`: extended with needs-attention fixtures — a qualifying entry with unconfirmed candidates is listed; partial confirmation keeps it listed; full confirmation resolves it out of the queue; another owner's entries never leak in either direction; three-page keyset pagination has no overlap/duplication; response time is asserted bounded. A new helper, `moveToCompletedWithSameCandidates`, corrects a freshly-persisted interpretation to `completed`/`auto_apply` (since `persist_entry_interpretation`'s `model_only_element_trust` can never itself reach `auto_apply` — its score ceiling is 0.25, always below the 0.55 threshold, by design) while preserving the same candidates. A new helper, `settleInterpretEntryJob`, claims and completes the fixture's underlying `interpret_entry` job via the service-role client, reproducing what the deployed worker always does in the same cycle it persists an interpretation — without it, the job stays `pending` and the lifecycle mapper (correctly) reports `organizing` regardless of entry status.

### Fixed

- `has_unconfirmed_candidate` (inside `list_needs_attention`) named its `generate_series` output `candidate_index` — identical to `tasks.candidate_index`. Inside the correlated `tasks` subquery, the unqualified `candidate_index` reference on the right-hand side of `t.candidate_index = candidate_index` resolved against the innermost scope (`tasks` itself), making the comparison `t.candidate_index = t.candidate_index` — always true — instead of comparing against the outer loop value. Confirmed live against the linked project before the fix: as soon as any task existed for an entry, the check went false for every candidate index, so confirming one of two current candidates incorrectly removed the entry from the queue entirely instead of leaving it listed until the second candidate was resolved (NY-004/NY-013). Migration `031` (`create or replace function`, identical signature/grants/index) renames the alias to the unambiguous two-part form `candidate_slot(idx)`, referenced explicitly as `candidate_slot.idx`. See `DECISIONS.md` ADR-027.

### Verification

- `npm test`: 61 files / 340 tests passing (13 new). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing.
- `supabase db push` applied `030` (after fixing a `min(uuid)` aggregate error — Postgres has no `min()`/`max()` for `uuid` — before anything committed remotely) and then `031`; `supabase migration list --linked` shows local/remote synchronized through `031`. `supabase db lint --linked --level warning`: only the single pre-existing, unrelated `run_user_heartbeat` finding. `supabase gen types typescript --linked` produced no diff after `031` (unchanged signature from `030`).
- `npm run test:remote:daily-cycle` passed in full after the `031` fix, including every needs-attention scenario above. `npm run test:remote:entry-processing` and `npm run test:remote:jobs` were re-run unchanged and passed, confirming no regression outside this slice's scope.
- Offline Playwright (`desktop`+`mobile`): 4/4 passing, 10 expected online skips — unchanged from the Slice 2X.9 baseline; this slice adds no route or UI. `git diff --check`: clean (pre-existing LF/CRLF advisories only).

### Known limitation

- `supabase/tests/needs_attention_projection.sql` is committed but could not execute locally (Docker unavailable — the same pre-existing environment gap as every other pgTAP file in this project); the remote smoke's real execution against the linked project is the equivalent verification, and is in fact how the migration-031 defect was actually found.
- An entry sitting in `interpreting`/`reprocessing` whose job independently becomes `exhausted` or reaches an unrecognized status before the entry's own status reflects that (a transient, self-correcting race — `fail_entry_interpretation`/`reap_expired_jobs` update both together in every existing path) will not surface in the queue until that status settles. Documented in the migration itself; not a new class of risk this slice introduces.
- No UI consumes `list_needs_attention`/`loadAttentionProjection` yet — Slice 2X.11 wires Home/Caixa onto it.

## 2026-07-18 — Slice 2X.9: decision-first progressive-disclosure entry review

### Added

- `src/features/daily-cycle/entry-review.tsx`: `EntryReview` composes four always-visible blocks in order — `ReviewUnderstanding` (the interpretation's `understanding` text, status badge, and the DTO's `humanFields`, rendered for the first time), `ReviewAttention` (`view.attentionItems`, with the retry button and a specific error/pending-question detail injected by the page as slot content — the component itself never branches on internal state or reads Supabase), `ReviewNextActions` (a labeled wrapper around whatever action content the page supplies), and `OriginalRecord` (the existing collapsed-by-default original-entry disclosure). 13 new tests (`entry-review.test.tsx`).
- `src/features/daily-cycle/technical-details.tsx`: `TechnicalDetails` consolidates the former two-column grid — per-element trust/scores/policy/evidence/overrides, the immutable version history with field-by-field comparisons, and the structured extraction (concepts, dates, entity links, mentions, none of which are part of a public DTO but all of which continue to come from the review projection's `editableCurrent`) — behind a single native `<details>`, collapsed by default. When `hasTechnicalDetails` is `false` it renders nothing; when the technical-details load failed but a current interpretation exists, it renders a fallback message instead of blocking or hiding the main review (matching the Slice 2X.8 independent-failure guarantee). 7 new tests (`technical-details.test.tsx`).

### Changed

- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: rewritten to compose `EntryReview`/`TechnicalDetails` instead of rendering the interpretation grid, trust panel, and revision history inline. Visibility of the correction editor, its undo button, and the candidate-confirmation form is now derived exclusively from `view.availableActions` (`correct_interpretation`, `undo_correction`, `confirm_existing_candidates`) instead of ad hoc truthiness checks on raw arrays — `confirm_existing_candidates` in particular now gates on the interpretation-scoped `actionableCandidates` count rather than the unfiltered `taskCandidates.length`, so a fully-covered candidate set never renders a form only to have it immediately report "nothing pending." The page still loads exclusively through the two Slice 2X.8 projections; `page.architecture.test.ts` continues to pass unchanged.
- `src/features/interpretations/revision-editor.tsx`: `InterpretationRevisionEditor` gained an optional `showSummary` prop (default `true`). The entry-detail page now passes `showSummary={false}` because the same summary text is already the page's primary heading (`ReviewUnderstanding`'s `view.understanding`); no other prop or behavior changed. 1 new test.
- `src/app/operations.css`: added styles for `.entry-review`, `.review-facts`, `.review-organizing-note`, `.attention-notice`/`.attention-safety-note`/`.attention-detail`, and `.technical-details`/`.technical-details-body`, including a `max-width:600px` adjustment and a `:focus-visible` outline on the technical-details `<summary>`; no existing selector was renamed or removed.
- `e2e/intelligent-capture.spec.ts`: `waitForOrganized` now polls for the "Ver detalhes técnicos" disclosure summary instead of the (now-collapsed) "Confiança por elemento" heading; the pt-BR and en assertions against the trust panel and immutable-history heading now click that disclosure open first. No other journey step, selector, or assertion changed.

### Known limitation

- The online authenticated Playwright journey (`e2e/intelligent-capture.spec.ts`) was updated to match the new markup but could not be re-executed in this environment — no `ONLINE_SUPABASE_*` credentials are configured. Offline Playwright (desktop+mobile, 4 passed / 10 skipped, unchanged from the pre-slice baseline), the full unit suite (323 tests, 21 new), lint, typecheck, and the production build all passed.

## 2026-07-18 — Hotfix: candidate lifecycle scoped to the current interpretation (F1)

### Fixed

- The architecture review of Slices 2X.5–2X.8 (`docs/reports/PHASE_2X_SLICES_2X5_2X8_ARCHITECTURE_REVIEW.md`, finding F1) found that `hasMaterializedTaskForCandidates` — the lifecycle input that decides whether an entry's `productState` can resolve to `ready` — was computed entry-wide in both `src/features/daily-cycle/inbox-projection.ts` and `src/features/daily-cycle/review-projection.ts` ("does any non-cancelled task exist for this entry") instead of interpretation/candidate-scoped ("does every one of the current interpretation's task candidates already have a matching materialized task"). Confirming only one of two candidates from a single, uncorrected interpretation made the entry read `ready` on Inbox/Home/entry-detail while the still-unconfirmed second candidate remained visible in `TaskCandidateForm` — a status badge, an available-actions list, and a rendered form disagreeing about the same entry. `lifecycle.ts` itself was already correctly specified (verified by its own unit tests); only the two loaders computed its input incorrectly.
- Both loaders now derive `hasMaterializedTaskForCandidates` from the same interpretation-scoped source `review-projection.ts` already used correctly for `actionableCandidates`: a new pure helper `hasUnconfirmedTaskCandidates(candidateCount, unavailableCandidateIndexes)` (`src/features/interpretations/data.ts`, colocated with `computeUnavailableCandidateIndexes`) returns whether any candidate index in `[0, candidateCount)` is missing from the already-covered set. `review-projection.ts`'s `loadEntryReviewProjection` now feeds it the `unavailableCandidateIndexes` `loadInterpretationReview` already computes. `inbox-projection.ts`'s `tasks` query now additionally selects `source_interpretation_id`/`candidate_index` (previously only `source_entry_id`), groups tasks per entry, and runs `computeUnavailableCandidateIndexes` per entry against that entry's `current_interpretation_id` before the same helper decides coverage. Neither `lifecycle.ts`, `resolveDailyCycleLifecycle`'s contract, candidate confirmation semantics, `TaskCandidateForm`, nor any RPC/migration changed.

### Added

- `src/features/interpretations/data.test.ts`: 6 new cases for `hasUnconfirmedTaskCandidates`.
- `src/features/daily-cycle/inbox-projection.test.ts`: 4 new cases — partial confirmation stays `needs_attention`, full confirmation resolves `ready`, a task from an older interpretation doesn't count, a task for a mismatched candidate index doesn't count.
- `src/features/daily-cycle/review-projection.test.ts`: 5 new cases covering the same partial/full/older-interpretation/mismatched-index/zero-candidates matrix at the `loadEntryReviewProjection` level.
- `src/features/daily-cycle/lifecycle-consistency.test.ts` (new file): drives equivalent fixtures through `loadInboxProjection` and `loadEntryReviewProjection` and asserts both resolve the same `productState`/`attentionReason` for the same entry.

### Verification

- `npm test`: 58 files / 302 tests passing (35 new). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing.
- Offline Playwright (`desktop`+`mobile`): 4/4 passing, 10 expected online skips — unchanged from the Slice 2X.8 baseline.
- No migration, RPC, or schema change — `tasks.source_interpretation_id`/`candidate_index` already existed and were already read by `interpretations/data.ts`. Local/remote migrations remain synchronized through `029`.
- `git diff --check`: clean (only pre-existing LF/CRLF advisories).
- Full report: `docs/reports/PHASE_2X_CANDIDATE_LIFECYCLE_HOTFIX_REPORT.md`.

## 2026-07-18 — Phase 2X Slice 2X.8 separated review and technical-details projections

### Added

- `src/features/daily-cycle/review-projection.ts`: pure `toEntryReviewProjection` mapper producing the Slice 2X.1 `InterpretationReviewView` (understanding, human fields, attention items, actionable candidates, materialized tasks, available actions, original record, no scores/policies/evidence) plus the non-frozen editable/candidate data the still-unchanged `InterpretationRevisionEditor`/`TaskCandidateForm` components require; `productState`/`availableActions` are computed through the shared `resolveDailyCycleLifecycle` mapper (Slice 2X.1/2X.6), never a raw `entries.status` read. A thin `server-only` `loadEntryReviewProjection` wrapper reuses `loadInterpretationReview` plus an owner-scoped `interpret_entry` job lookup and `pending_questions` check (mirroring `inbox-projection.ts`'s Slice 2X.6 query shape) to feed the mapper.
- `src/features/daily-cycle/technical-details-projection.ts`: pure `toEntryTechnicalDetailsView` mapper producing the complete Slice 2X.1 `InterpretationTechnicalDetailsView` (per-element scores/policies/signals/evidence/overrides, version-to-version field comparisons, per-task candidate provenance, model/source) plus a thin `loadEntryTechnicalDetailsProjection` wrapper performing its own independent `loadInterpretationReview` call — deliberately separate from the review loader so a technical-detail failure can never block or misreport the primary review.
- `src/app/[locale]/app/inbox/[entryId]/page.architecture.test.ts` (new): forbids `database.types`, `Database["public"]`, `@/lib/supabase/server`, and raw `entry.status` reads in the page file, and asserts it only loads data through the two new daily-cycle projections.
- 19 new Vitest cases across `review-projection.test.ts` (10), `technical-details-projection.test.ts` (7), and `page.architecture.test.ts` (2) covering: the human contract never containing a score/policy/evidence/signal key; lifecycle-driven `productState` instead of a raw internal status; record-only interpretations hiding candidates and the confirm action; unavailable-candidate-index exclusion; materialized tasks scoped to the current interpretation only; `retry_processing` gated strictly by `could_not_organize`; original content/`isRetroactive` preserved even with no interpretation yet; full `isDailyCycleSerializable` conformance of both DTOs; per-element score/policy/signal/evidence/override extraction; version-to-version comparisons; per-task provenance; loader-level null/ownership propagation; and the page's import boundary.

### Changed

- `src/features/interpretations/data.ts`: `loadInterpretationReview` is now internal infrastructure — its new exported `InterpretationReviewData` type documents that only the two daily-cycle projection modules above are its intended consumers, not page components.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: rewritten to load exclusively through `loadEntryReviewProjection`/`loadEntryTechnicalDetailsProjection`. No Supabase row or `Database` type is imported by the page. The status badge, the error/organizing notice cards, and the retry button's visibility are now driven by `productState`/`availableActions` instead of `entries.status`/`entry.processing_error`. Two small, deliberate consequences of centralizing lifecycle through the shared mapper: `recoverable_error` and `terminal_error` (previously only the former offered a retry button) both now map to `could_not_organize`/`retry_processing` and both offer retry; and the old `reprocessing`-only "reinterpretation in progress" banner is now the same shared `organizing` banner already used by Caixa/Início since Slice 2X.6, also shown for a first-ever interpretation still in flight (previously silent). All existing Playwright-load-bearing text and selectors (`.entry-heading h1`, the exact "Confiança por elemento"/"Trust by element" and "Immutable history" headings, `.revision-timeline` version/origin text, the original-record `<details>`, correction/reprocess/undo/confirm button labels) are unchanged.
- `src/app/operations.css`: `.entry-status-*` modifier classes now key off the five `ProductState` values (`saved`, `organizing`, `needs_attention`, `could_not_organize`, `ready`) instead of the eight internal `entries.status` values, reusing the same colors already established for `.status-badge.*` (Slice 2X.6).

### Verification

- `npm test`: 57 files / 286 tests passing (19 new). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing.
- Offline Playwright (`desktop`+`mobile`, public foundation only): 4/4 passing, 10 expected online skips — this workstation has no `ONLINE_SUPABASE_*` credentials, so `intelligent-capture.spec.ts` (the load-bearing regression for this page, including the trust-panel heading, revision-timeline text, and record-only/undo journey) could not be re-run live here; the rewrite was designed against its exact assertions (selectors and copy) rather than left unverified.
- No migration in this slice (`Nenhuma exclusiva` per the implementation plan); local/remote migrations remain synchronized through `029` from the prior hotfix, unaffected by this change.
- `git diff --check`: clean (only pre-existing LF/CRLF advisories, no whitespace errors); `git status` shows only the files listed above.

### Known limitation

- `src/features/daily-cycle/review-projection.ts` and `technical-details-projection.ts` each independently call `loadInterpretationReview`, so the entry-detail page now issues two parallel sets of Supabase reads instead of one. This keeps the two projections genuinely independent (a technical-detail failure literally cannot affect the review query), matching the slice's fail-closed requirement, at the cost of roughly doubling read volume for this page. Not a regression target of this slice; a future slice could share one load between both projections if this becomes measurably significant.

## 2026-07-18 — Hotfix: correction conflict no longer hangs until gateway timeout

### Fixed

- `correct_entry_interpretation` (Phase 2B, already shipped) signaled its optimistic-concurrency version conflict with SQLSTATE `40001`. Slice 2X.7 independently confirmed — via a raw `fetch()` against the linked project's REST endpoint, no application code involved — that any RPC raising `40001` on this platform hangs the request until the gateway times out instead of returning an error, and deliberately left this specific already-shipped path unfixed because `interpretations/actions.ts` and this function were outside that slice's file list (see ADR-025). Migration `202607180029` closes that follow-up: `correct_entry_interpretation` is redefined (`create or replace`, identical signature `(uuid, integer, jsonb, text, text)`) with the single version-conflict raise now using `errcode = '55P03'` instead of `'40001'`. Every other line — ownership checks, the idempotent-replay short-circuit, patch/entity-link validation, and all inserts/updates/audit/undo writes — is unchanged. `src/features/interpretations/actions.ts`'s `correctInterpretation` conflict detection now checks `error.code === "55P03"` instead of `"40001"`; the reload/retry message shown to the user is unchanged. See ADR-026.

### Added

- `src/features/interpretations/actions.test.ts`: a new case asserting the `55P03` conflict maps to the same localized "reload and retry" message.
- `supabase/tests/interpretation_revisions.sql`: two new pgTAP assertions (plan raised to 46) confirming `correct_entry_interpretation`'s published body raises `55P03` for the version-conflict message and no longer contains an `errcode = '40001'` raise.
- `scripts/remote-interpretation-revisions-smoke.mjs`: the existing concurrent-correction race now asserts a bounded elapsed time (< 15s, actually observed ~530ms), the `55P03` SQLSTATE on the losing call, that the interpretation-row count advanced by exactly one (no partial write from the rejected side), and that the current-interpretation pointer was not overwritten by the losing correction.
- `docs/reports/PHASE_2X_CORRECTION_CONFLICT_HOTFIX_REPORT.md`: official hotfix report.

### Verification

- `npm test`: 54 files / 267 tests passing (1 new). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing.
- `supabase db push` applied migration `029` to the linked project; `supabase migration list --linked` shows local/remote in sync through `029`. `supabase db lint --linked --level warning`: unchanged, only the pre-existing unrelated `run_user_heartbeat` finding.
- `npm run test:remote:interpretations` (extended) executed against the linked project with disposable users and passed: the version-conflict correction returned in ~530ms with SQLSTATE `55P03` (no gateway hang), no partial interpretation row was left by the rejected side, and the current interpretation pointer still reflected the winning correction.
- `supabase gen types typescript --linked` regenerated with no diff (beyond a BOM artifact from the shell redirect used to compare), confirming the RPC signature was fully preserved.
- pgTAP (`interpretation_revisions.sql`) could not be executed locally — Docker unavailable on this workstation, the same pre-existing environment gap documented elsewhere in this file. The two new assertions are committed and correct syntactically/logically; the authenticated remote smoke is the equivalent, and in this case stronger, verification (it caught a genuine issue on the first migration attempt — see Known limitation).

### Known limitation

- The first version of migration `029` failed its own post-deploy verification: an inline PL/pgSQL comment explaining the fix happened to contain the literal digits `40001`, and PostgreSQL stores a function's body as literal source text, so `pg_get_functiondef()` returned that comment verbatim and tripped a naive substring check. The whole migration (including the otherwise-correct `create or replace`) rolled back as one transaction — confirmed via `supabase migration list --linked` showing no partial application — before being fixed (reworded comment; verification narrowed to inspect the literal `errcode = '40001'`/`errcode = '55P03'` assignment instead of an arbitrary numeric substring) and re-pushed successfully.
- `undo_operation` raises a separate SQLSTATE `40001` for its own conflict (`'Cannot undo after a newer interpretation revision'`). It was not touched by this hotfix — a single-RPC fix, not a schema-wide sweep — and is not confirmed to hang the gateway, but is the same class of platform risk. See `TODO.md`/`SECURITY.md`.

## 2026-07-18 — Phase 2X Slice 2X.7 candidate provenance and safe task confirmation

### Added

- Migration `202607170028_phase_2x_candidate_action_consistency.sql`: `entry_interpretations.is_record_only` (persisted at creation/correction/reprocess/undo instead of only ever existing as a transient correction input); `tasks.source_interpretation_id` (FK-composite-proven `(user_id, id)` against `entry_interpretations`) and `tasks.operation_key`; two partial unique indexes replacing the old entry-wide `(source_entry_id, candidate_index)` constraint (`tasks_legacy_source_entry_candidate_key` for provenance-less rows, `tasks_source_interpretation_candidate_key` as the new authoritative interpretation-scoped uniqueness); a conservative backfill that only sets `source_interpretation_id` for tasks on entries with exactly one interpretation ever created. New RPC `confirm_entry_task_candidates(entry_id, expected_interpretation_id, candidate_indexes, operation_key)`: confirms only candidates belonging to `entries.current_interpretation_id`, rejects `record-only` interpretations, is idempotent per operation key, and preserves the existing person/project/context linking and `parentIndex` chaining behavior (now scoped by interpretation). `confirm_entry_tasks` is preserved for compatibility with no new consumer.
- `src/features/interpretations/data.ts`: `computeUnavailableCandidateIndexes` (new, pure, tested) — a candidate index is unavailable when its task belongs to the current interpretation, or, conservatively, when its provenance is unproven (legacy rows with `source_interpretation_id = null`), since consistency cannot be verified either way. `InterpretationRevision` gained `isRecordOnly`; `loadInterpretationReview` returns `unavailableCandidateIndexes` and scopes `taskUndoId`'s lookup to both `confirm_entry_tasks` and `confirm_entry_task_candidates` action types.
- `src/features/tasks/actions.test.ts` (new, 9 cases) and 5 new `task-candidate-form.test.tsx` cases covering interpretation binding, unavailable-index filtering, and the record-only empty state.
- `scripts/remote-daily-cycle-smoke.mjs` (new; `npm run test:remote:daily-cycle`): executed, not just written, against the linked project with disposable users. Covers current-interpretation binding, stale/out-of-range rejection, idempotent replay, a task confirmed under an older version surviving a later correction, a concurrent confirmation race for the same candidate producing exactly one task, record-only rejection, cross-user isolation, and undo scoped to the correct task.
- `supabase/tests/candidate_action_consistency.sql` (33 pgTAP assertions; committed, not executed locally — see Known limitation).

### Changed

- `src/features/tasks/actions.ts` (`confirmEntryTasks`): now validates and forwards `interpretationId`/`operationKey`, calls `confirm_entry_task_candidates`, and maps `55P03`/`55000` to distinct sanitized messages instead of one generic failure string.
- `src/features/tasks/task-candidate-form.tsx`: new required `interpretationId`/`operationKey` props (sent as hidden fields) and optional `unavailableIndexes` prop; renders neither a checkbox nor a submit button for an unavailable index, and shows an explicit "nothing pending" state when every candidate is unavailable, instead of an empty-but-interactive form.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: the confirmed-task count driving the pre-filled success state is now scoped to the current interpretation's own tasks, not every task ever confirmed for the entry; a record-only current interpretation shows an explicit "record only" message instead of the confirmation form; `TaskCandidateForm` receives `interpretationId`, a fresh `operationKey`, and `unavailableIndexes`.

### Fixed

- `confirm_entry_tasks` — pre-existing, unrelated to this slice's own candidate-provenance work — was `SECURITY INVOKER` and took `SELECT ... FOR UPDATE` on `entry_interpretations` (no `UPDATE` grant for `authenticated`) and inserted into `undo_operations`/`audit_logs` (no `INSERT` grant for `authenticated`). It had never successfully completed for a real signed-in user; every call failed with `permission denied`. Both `confirm_entry_tasks` and the new `confirm_entry_task_candidates` are now `SECURITY DEFINER`, matching every other RPC in this schema that writes to those tables. `confirm_entry_tasks` also gained the `grant ... to authenticated` / `revoke ... from public, anon` pair it was missing (it had been reachable, harmlessly, by `anon`).
- The first version of `confirm_entry_task_candidates` signaled a stale interpretation with SQLSTATE `40001`, mirroring `correct_entry_interpretation`. Direct testing against the linked project's live REST gateway showed any request raising `40001` — including calls to the already-shipped `correct_entry_interpretation` — hangs until the platform gateway times out. `confirm_entry_task_candidates` now uses `55P03`. See `DECISIONS.md` ADR-025 and the urgent, explicitly out-of-scope-for-this-slice follow-up recorded in `TODO.md`/`SECURITY.md` for `correct_entry_interpretation`'s own equivalent path.

### Known limitation

- `supabase/tests/candidate_action_consistency.sql` could not be executed locally (Docker unavailable on this workstation, the same pre-existing environment gap documented elsewhere in this file). The migration itself was applied to and verified against the linked project directly (`supabase db push`, `supabase db lint --linked`), and the equivalent behavior was proven by actually running `scripts/remote-daily-cycle-smoke.mjs` against real authenticated users on that same project — which is how the two SECURITY DEFINER/grant defects and the `40001` gateway hang above were found in the first place.
- `ActionableCandidateView`/`InterpretationReviewView` (Slice 2X.1 prework) still have no consumer; `/inbox/{entryId}` remains the broad Phase 2B revision page for this slice, only adapted enough (`isRecordOnly`, `unavailableCandidateIndexes`) to stop offering an unconfirmable or already-confirmed candidate. The full projection split is Slice 2X.8.

## 2026-07-17 — Phase 2X Slice 2X.6 human processing states in Inbox and Home

### Added

- `src/features/daily-cycle/inbox-projection.ts` (`loadInboxProjection`): owner-scoped, paginated query that reads a page of `entries`, each entry's latest `interpret_entry` job (matched by `payload->>entry_id`), its current interpretation's `task_candidates`, open `pending_questions`, and non-cancelled materialized `tasks`, then feeds `resolveDailyCycleLifecycle` (Slice 2X.1) per entry to produce `InboxItemView[]`. When the mapper returns `null` for an unrecognized internal combination, the loader builds an explicit `could_not_organize`/`resolve_consistency` item instead of dropping the entry — the original is always preserved, so it is always shown.
- `src/features/daily-cycle/inbox-item.tsx` (`InboxItemRow`): presentational component that renders an `InboxItemView` — title, original preview, localized product-state badge, and attention-reason hint — through `getDailyCycleCopy`. Receives only the DTO, never a Supabase row or an internal lifecycle string.
- Tests: `inbox-projection.test.ts` (12 cases covering every product-state/attention-reason combination reachable from real query data, the fail-closed fallback, pagination, and the locale-scoped safe href), `inbox-item.test.tsx` (4 cases), `home-dashboard.test.tsx` (4 cases — first test coverage for this component).

### Changed

- `src/app/[locale]/app/inbox/page.tsx`: now calls `loadInboxProjection` and renders `InboxItemRow` instead of reading `entries.status` directly through `lifecycleLabels`; pagination is driven by the projection's own `hasNext`.
- `src/features/shell/home-dashboard.tsx`: adds a fifth "05 / RECENTE" panel that calls the same `loadInboxProjection` and renders the same `InboxItemRow`, so Home and Inbox are guaranteed to agree on an entry's state. Wires up the previously-unused `home.recent` copy key.
- `src/app/operations.css`: `.status-badge` modifiers for the Caixa list changed from the eight internal `entries.status` values (`awaiting_review`, `partially_processed`, `recoverable_error`, `terminal_error`, `interpreting`, `reprocessing`, ...) to the five product states (`saved`, `organizing`, `needs_attention`, `ready`, `could_not_organize`). The entry-detail page's separate `.entry-status-*` rules (Slice 2X.8/2X.9 scope) are untouched.
- `docs/ARCHITECTURE.md`: documents the daily-cycle vertical slice and the Slice 2X.6 projection wiring, including the known limitation that `recordOnly`/`hasConsistencyIssue` are conservatively `false` until Slice 2X.7's `is_record_only` column exists.

### Known limitation

- A candidate corrected as record-only still has its original `task_candidates` JSON on the interpretation row (the correction RPC does not clear it), and there is no persisted `is_record_only` column yet. Until Slice 2X.7 lands, such an entry is shown as `needs_attention`/`confirm_existing_candidates` rather than `ready`. This is a known, documented gap, not a regression — `2X.6`'s own dependency list is `2X.1` and `2X.5` only.

## 2026-07-17 — Phase 2X Slice 2X.5 asynchronous capture cutover

### Added

- `src/lib/jobs/entry-worker.ts` (`kickEntryInterpretationWorker`): shared, fire-and-forget nudge that invokes the deployed `process-jobs` worker for a given job id using the caller's own authenticated session (same `{ jobId }` contract as existing direct invocation); every internal error is swallowed since the `pg_cron` drain (Slice 2X.4) is the correctness backstop, not this nudge.
- `src/features/daily-cycle/capture-receipt.tsx` (`CaptureReceiptView`): renders a `CaptureReceipt` as a `role="status"` region with the localized save/replay message and, when the Action supplied one, a safe "Ver registro"/"View record" link. First production consumer of the previously-unconsumed `toCaptureReceipt` projection mapper.
- `retryProcessingJob` in `src/features/agent/actions.ts`: generalizes manual retry to `interpret_entry` jobs. A `failed` job whose backoff has elapsed only gets a worker kick (it is still automatically re-claimed by the dispatch drain); an `exhausted` job gets a fresh `enqueue_entry_reprocessing` job, since exhausted work is never re-claimed. `retryAttachmentJob` is untouched. No UI consumes this Action yet — it lands with the Needs-Attention slices (2X.10–2X.11).
- Official Slice 2X.5 evidence report at `docs/reports/PHASE_2X_SLICE_05_REPORT.md`.
- `docs/DECISIONS.md` ADR-023: the `after()` mechanism, the entry-retry generalization, and the `interpret-entry.ts` removal.

### Changed

- `src/features/capture/actions.ts` (`captureEntry`): calls `capture_entry_async` and returns as soon as it (plus one lightweight indexed lookup for job/entry state) settles — no redirect, no synchronous AI call. Builds a `CaptureReceipt` through `toCaptureReceipt`, only including a `safeHref` when captured from the dedicated `/capture` page (not Home), and schedules the worker nudge plus best-effort `capture_save_succeeded`/`capture_save_failed`/`capture_processing_enqueued` product events inside `next/server`'s `after()` so neither adds latency to the response.
- `src/features/capture/quick-capture-form.tsx`: `CaptureState` is now a discriminated `idle | success (receipt) | error (code, message)` union. The button reads "Salvando…"/"Saving…" while pending (not "Interpretando…"/"Interpreting…"); on success the form resets and the field regains focus so consecutive captures do not wait on interpretation, and a client-generated idempotency key rotates only after a confirmed success so a failed-attempt retry cannot create a duplicate entry.
- `src/features/shell/home-dashboard.tsx` and `src/app/[locale]/app/capture/page.tsx` pass the new required `captureSource` prop (`"home"` / `"capture_page"`) so the Action knows which surface to attribute analytics to and whether to include the receipt's record link.
- `src/features/interpretations/actions.ts` (`reprocessEntry`): calls `enqueue_entry_reprocessing` instead of running extraction synchronously; returns the honest "Vou organizar este registro novamente."/"I will organize this record again." message instead of claiming completion, and schedules the same worker-nudge/analytics pattern as `captureEntry`.
- `src/features/interpretations/copy.ts`: the reprocess button's pending label changed from "Reinterpretando…"/"Reinterpreting…" to "Enfileirando…"/"Queueing…", matching what the click now actually does (an enqueue, not a live AI call).
- `e2e/intelligent-capture.spec.ts`: the capture step now asserts the immediate receipt, the cleared/refocused field, and an enabled submit button — proving the UI is interactive before interpretation completes — then polls the entry-detail route until the worker finishes before continuing into the existing correction/task-confirmation journey.

### Removed

- `src/features/interpretations/interpret-entry.ts`: the synchronous Node extraction orchestrator, now unreachable since neither `captureEntry` nor `reprocessEntry` calls it. All production entry-interpretation extraction now runs exclusively in the Deno worker (`supabase/functions/process-jobs/entry.ts`, Slice 2X.4).
- Two now-superseded assertions in `src/lib/ai/usage-order.test.ts` that checked the deleted Node synchronous ordering; the two Deno-worker ordering assertions are unchanged and still pass.

### Fixed

- `src/test/setup.ts` now registers Testing Library's `cleanup()` in a global `afterEach`. Vitest's config never enabled `globals: true`, so the library's automatic cleanup had never been active in this project — a render from one `it()` block could leak into the next within the same file. Caught while writing the `CaptureReceiptView` test; fixed once, project-wide, rather than worked around locally.

### Verification

- Vitest: 50 files / 228 tests passing (up from 47/205), ESLint, TypeScript, and the Next.js 16.2.10 production build all clean.
- `npm run test:remote:entry-processing`, `test:remote:jobs`, `test:remote:product-events`, and `test:remote` all re-run against the linked project after the cutover and passed unchanged.
- Online Playwright (`intelligent-capture.spec.ts`) passed on both `desktop` (~1.1 min) and `mobile` (~1.0 min) against the linked project, including the full downstream journey (correction, undo, task confirmation, chat, reviews, files, settings, heartbeat, final undo).

## 2026-07-17 — Phase 2X Slice 2X.4 entry-interpretation worker and automatic dispatch

### Added

- Migration `026`: extends `begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, and `fail_entry_reprocessing` with an optional `p_service_user_id` parameter honored only for `service_role`, so an unattended worker can call the same RPCs the synchronous UI path already uses; the `auth.uid()` path is unchanged. Enables `pg_net` and schedules `my-brain-entry-dispatch` (`pg_cron`, every minute), reading the dispatch URL and secret from Supabase Vault by name — no value lives in the migration or the repository.
- `supabase/functions/process-jobs/entry.ts`: a single pipeline for `interpret_entry` jobs in both `initial` and `reprocess` modes. Never trusts the job payload beyond `entry_id`/`mode`/`operation_key`; reloads the entry, calls `begin_entry_interpretation`/`begin_entry_reprocessing`, runs the OpenAI extraction and (for reprocessing) the same deterministic entity-resolution/trust computation as the synchronous path, persists via the service-role-extended RPCs, and independently records AI usage and a best-effort `capture_processing_completed`/`capture_processing_failed` product event.
- `supabase/functions/_shared/entity-resolution.ts`, `trust-builders.ts`, `trust-policy.ts`: Deno-runtime copies of the corresponding `src/features/interpretations/` modules, genuinely reused (not reimplemented) because those Node modules have no Node/Next.js-specific imports; kept in sync manually and flagged in each file's header.
- `supabase/functions/process-jobs/dispatch.ts`: a fail-closed type router (`process_attachment` | `interpret_entry`; unknown types are rejected before any claim) and the unattended dispatch-drain loop for `interpret_entry` jobs only.
- `supabase/functions/process-jobs/attachment.ts`: the existing attachment-processing behavior, extracted verbatim from `index.ts` with no behavioral change (payload, model, usage, lease, and messages all unchanged).
- `supabase/functions/process-jobs/dispatch.test.ts`: a Deno test file for the type-routing guard; written for `deno test` but not executable on this workstation (no Deno runtime installed).
- `supabase/tests/entry_interpretation_worker.sql`: pgTAP contract for the migration `026` signature/privilege surface and a full service-role initial/reprocess/failure round trip.
- Extended `scripts/remote-entry-processing-smoke.mjs` with real end-to-end worker coverage: direct invocation (initial and reprocess), an incorrect-dispatch-secret denial, and the unattended dispatch drain processing a fixture job with no `jobId` supplied.
- Migration `027`: fixes a Slice 2X.3 regression (see below) by replacing a CHECK constraint with a `SECURITY DEFINER` trigger, gated by `WHEN (new.type = 'interpret_entry')`.
- Official Slice 2X.4 evidence report at `docs/reports/PHASE_2X_SLICE_04_REPORT.md`.

### Fixed

- **Slice 2X.3 regression (broke every real file upload since migration `025`):** the `jobs` CHECK constraint added in migration `025` referenced `private.is_valid_entry_interpretation_job_payload`, whose `EXECUTE` privilege had been revoked from every role. PostgreSQL checks a referenced function's ACL when the executor initializes the CHECK constraint's expression tree, not only when the branch that calls it is actually evaluated — so even a `process_attachment` insert, where the constraint's `OR` should short-circuit on `type`, failed with `permission denied for function is_valid_entry_interpretation_job_payload`. Migration `027` replaces the CHECK constraint with trigger `jobs_interpret_entry_payload_trigger` (`before insert or update ... when (new.type = 'interpret_entry')`) backed by a `SECURITY DEFINER` function; trigger firing does not require the writing role to hold `EXECUTE` on the function it calls, so the private validator keeps its original `revoke all` — no privilege was broadened. See `DECISIONS.md` ADR-022.

### Changed

- `supabase/functions/process-jobs/index.ts`: reduced to authentication, job-type lookup, claim, and routing (via `dispatch.ts`); no longer contains attachment- or entry-specific logic directly.
- Direct invocation keeps its exact existing request contract (`{ jobId }`) for both job types; no Server Action, route, or UI consumer changed.

### Verification

- Migrations `026` and `027` are synchronized with the linked project; linked database lint at level `error` is clean and Supabase types were regenerated from the remote schema.
- `npm run test:remote:entry-processing` (extended) passed: 2X.3's atomic-capture/lease/retry/reaper assertions plus real direct worker invocation (initial and reprocess), dispatch-secret denial, and unattended dispatch-drain processing.
- `npm run test:remote:jobs` (attachment regression) failed before the migration `027` fix and passed after it.
- `npm run test:remote` (full regression, including the deployed attachment worker over HTTP) passed after the fix.
- An ad hoc disposable-user check confirmed the worker's best-effort `capture_processing_completed` product event is actually persisted with the expected properties.
- The committed pgTAP contract (`entry_interpretation_worker.sql`) could not run on this workstation because Supabase CLI requires Docker Desktop; the Deno test file could not run because no Deno runtime is installed. Deployment (`supabase functions deploy`, which bundles/resolves the full Deno module graph including the `_shared` imports) plus the remote smokes above served as the equivalent real verification.
- Vitest (47 files/205 tests — one new AI-usage-ordering assertion for `entry.ts`, and the existing attachment-worker assertion repointed from `index.ts` to `attachment.ts`), ESLint, TypeScript, the Next.js 16.2.10 production build, and `git diff --check` passed.

## 2026-07-17 — Phase 2X Slice 2X.3 atomic entry capture and input jobs

### Added

- Migration `025` with a bounded `interpret_entry` payload contract, lookup/active-job indexes, and atomic authenticated RPCs `capture_entry_async` and `enqueue_entry_reprocessing`.
- Service-role-only `claim_entry_interpretation_job` and `claim_next_entry_interpretation_job` contracts with type/payload/ownership guards, retry eligibility, attempts, leases, and `SKIP LOCKED` concurrency control; existing attachment claim, completion, failure, and reaper contracts remain unchanged.
- Linked Supabase-generated types, pgTAP contract at `supabase/tests/entry_processing_jobs.sql`, and disposable remote smoke at `npm run test:remote:entry-processing`.
- Official Slice 2X.3 evidence report at `docs/reports/PHASE_2X_SLICE_03_REPORT.md`.

### Changed

- The historical projection commit `9f0c1e6` is preserved and reclassified as prework; it is not credited as the official database Slice 2X.3.
- Permanent architecture, database, security, state, backlog, and decision documentation now distinguish durable entry jobs from the future worker/dispatch and the current synchronous UI path.

### Verification

- Migration `025` is synchronized with the linked project; linked database lint at level `error` is clean and Supabase types were regenerated from the remote schema.
- Disposable remote smoke passed atomic capture, bounded payloads, replay, ownership denial, exclusive lease, retry eligibility, stale-worker denial, lease recovery, and reprocessing isolation.
- The committed pgTAP contract could not run on this workstation because Supabase CLI requires Docker Desktop; the exact limitation is recorded in the Slice 2X.3 report.
- Vitest (47 files/204 tests), ESLint, TypeScript, the Next.js 16.2.10 production build, and `git diff --check` passed.

## 2026-07-17 — Phase 2X Product Projections prework (historical commit `9f0c1e6`)

### Added

- Pure mappers in `daily-cycle` for `CaptureReceipt`, `InboxItemView`, `NeedsAttentionItemView`, and `WorkItemView`, plus serializable source contracts for future server-side adapters.
- Immutable product DTO outputs with cloned/frozen action data, strict required-field validation, safe local destinations, internal task-status-to-human-state conversion, and `null` fail-closed results for invalid or unknown inputs.
- Focused architecture tests that prohibit React, Supabase, `database.types`, direct table access, and RPC calls in the projection mapper boundary.
- Prework evidence report at `docs/reports/PHASE_2X_PROJECTIONS_PREWORK_REPORT.md`.

### Changed

- The four existing product DTO contracts and nested available actions are now explicitly readonly, so future UI consumers cannot mutate their public shape through TypeScript.
- The original prework documentation is retained for historical evidence; planning/status documents now distinguish it from the official Slice 2X.3.

### Verification

- Focused projection/lifecycle/contract Vitest: 3 files and 23 tests passing.
- Full Vitest: 47 files and 204 tests passing.
- ESLint, TypeScript, the Next.js 16.2.10 production build, and `git diff --check` passed.
- No migration, RPC, Edge Function, route, UI, analytics integration, Playwright, or remote smoke was required or executed because this slice has no runtime consumer.

## 2026-07-17 — Phase 2X Slice 2X.2 private product-events foundation

### Added

- Migration `024` with the private `product_events` ledger, forced owner RLS, minimum read grant, per-owner idempotency, bounded indexes, synthetic-test marker, and documented 180-day retention requirement.
- Dedicated security-definer RPCs: `record_product_event` derives the authenticated owner; `record_product_event_for_user` accepts only service-role callers. Both validate the closed taxonomy, event-specific property allowlists, opaque subject ownership, and forbidden free-content fields.
- Pure serializable TypeScript contracts for all 17 events, closed surfaces/properties, safe parser, and discriminated telemetry result; a server-only best-effort boundary and thin acknowledgement Server Action expose no raw Supabase errors.
- Focused Vitest suites, pgTAP contract at `supabase/tests/product_events.sql`, generated `Database` schema, and a disposable remote product-events smoke command.
- Slice evidence report at `docs/reports/PHASE_2X_SLICE_02_REPORT.md`.

### Changed

- Permanent architecture, database, security, state, backlog, and decision documentation now distinguish product-behavior telemetry from audit, jobs, and AI-cost ledgers.

### Verification

- Migration `024` is synchronized with the linked project; linked database lint at level `error` is clean and Supabase types were regenerated from the remote schema.
- Focused contract/server/action Vitest and disposable remote product-events smoke passed. Full quality-gate counts are recorded in the Slice 2X.2 report.
- The committed pgTAP contract could not run on this workstation: Supabase CLI requires Docker Desktop and the remote runner also reported missing `SUPABASE_DB_PASSWORD`; the remote smoke covers the same high-risk RLS, privilege, allowlist, idempotency, ownership, and cleanup paths.

## 2026-07-17 — Phase 2X Slice 2X.1 daily-cycle product contracts

### Added

- Pure `daily-cycle` contracts for the five public product states, five attention reasons, product-oriented DTOs, and user-available action identifiers.
- Stable discriminated Action-result codes and safe runtime guards that keep localized copy, provider details, and database errors outside the contract.
- Typed PT-BR and English product copy for states, attention reasons, actions, and Action-result messages.
- One deterministic, fail-closed internal-lifecycle-to-product-state mapper covering the eight known entry states, job status, retry scheduling, questions, candidates, record-only entries, materialized tasks, and consistency fallbacks.
- Four colocated Vitest suites, including an architectural source guard that prevents React, Supabase, database types, and UI-module imports in the new boundary.
- Slice evidence report at `docs/reports/PHASE_2X_SLICE_01_REPORT.md`.

### Changed

- Permanent state and backlog now record that Phase 2X implementation is in progress, Slice 2X.1 is complete, and Slice 2X.2 has not started.

### Verification

- Focused daily-cycle Vitest: 4 files and 24 tests passing.
- Full Vitest: 43 files and 171 tests passing.
- ESLint, TypeScript, and the Next.js 16.2.10 production build passed.
- No migration, RPC, Edge Function, route, UI, telemetry, remote smoke, or Playwright work was required or executed because this slice has no runtime consumer.

## 2026-07-17 — Phase 2X — Product Convergence planning checkpoint

### Added

- Approved architecture review, PRD, and detailed implementation plan for Phase 2X, positioned between Phase 2B and Phase 2C.
- Reusable slice report template at `docs/reports/SLICE_REPORT_TEMPLATE.md`.

### Changed

- Project state, backlog, and Phase 2 roadmap now identify Phase 2X — Product Convergence as the approved next phase; implementation has not started.

### Verification

- The three Phase 2X planning documents were checked for internal Markdown links, cross-references, heading numbering, naming consistency, roadmap references, and unexpected placeholders.
- No production code, migration, RPC, Edge Function, or Phase 2X slice was created or executed in this checkpoint.

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
