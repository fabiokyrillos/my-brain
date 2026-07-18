# Technical Changelog

All notable technical changes are recorded here. The format follows Keep a Changelog principles without assigning a public semantic version before the product has a release policy.

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
