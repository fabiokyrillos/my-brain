# Phase 2 — Intelligent Capture Implementation Plan

Status: Phase 2B complete and published; Phase 2X — Product Convergence is planned and approved; implementation has not started
Started: 2026-07-17  
Branch: `codex/phase-2-intelligent-capture`

**Goal:** Consolidate the daily My Brain experience so a user can record natural language, understand and correct the interpretation, safely materialize actions, resolve ambiguity conversationally, and later retrieve the original and derived history.

**Architecture:** Preserve the current Next.js, Supabase, pgvector, OpenAI, RLS, RPC, audit, and undo foundation. Deliver small vertical slices that strengthen existing domain boundaries instead of recreating early features. Database invariants and typed domain operations remain authoritative; the UI renders persisted state and never grants authority.

**Tech stack:** Next.js 16.2.10 App Router, React 19.2.4, strict TypeScript, Supabase/PostgreSQL/RLS/Edge Functions, pgvector, OpenAI structured output, Zod, Vitest, pgTAP, and Playwright.

## Global constraints

- Follow `docs/ENGINEERING_STANDARDS.md` for every slice.
- Migrations are append-only and remote state is validated before and after deployment.
- Do not reimplement complete behavior or rename phases to hide the actual delivery history.
- Do not add external integrations, a new backend, a full redesign, or a generic job platform.
- Each slice follows test-first development, updates permanent documentation, and ends in a small thematic commit.
- The source of truth is current code, linked remote database/migrations, then permanent documentation in the order recorded in `STATE.md`.

## 1. Objective

Make this promise reliable:

> Record any information in natural language and let the agent understand, organize, question, follow up, and turn it into trustworthy actions.

The phase finishes the central daily journey rather than adding new channels or integrations.

## 2. Product problem

The pre-MVP already accepts captures and produces useful extractions, tasks, questions, embeddings, chat, and files, but the experience is still optimistic and coarse. Interpretations cannot be corrected as immutable versions, candidate tasks are selectable but not editable, pending answers do not update the originating interpretation, entity matching is mostly prompt context, task updates are not resolved from natural language, retroactive dates are not consistently materialized, and the queue can strand work in `running`. Users need to see what happened, correct it, control risky actions, and recover from failures without losing the original.

## 3. Current state reconciled with the code

### Complete foundations to preserve

- Original capture text is persisted before AI work and remains visible even after interpretation failure.
- Structured extraction has schema validation, prompt/strategy versions, usage recording, known contexts/organizations/projects/people, task candidates, pending questions, and embeddings.
- Entry detail shows the latest interpretation, original text, extracted entities, overall confidence, candidate tasks, and created tasks.
- Candidate tasks support selective confirmation through a validated transactional RPC.
- Confirmed tasks create audit and a real undo operation.
- Pending questions have an RLS-protected store, a dedicated list, and a basic natural-language answer action.
- People, organizations, projects, contexts, relationship tables, timelines, pgvector search, chat, heartbeat, files, and AI cost control already exist.
- The attachment worker authenticates the caller, claims one owned job atomically, records paid usage, persists results explicitly, and applies a basic retry delay.

### Partial capabilities to extend

- Capture states distinguish processing, interpreted, and failed, but not every requested persisted state, partial completion, or explicit reprocessing.
- Interpretations are versioned in storage but only the latest generated version is rendered; there is no correction workflow that creates a new version.
- Confidence is displayed globally and on extracted items, but it is primarily model-provided rather than a domain score.
- Candidate tasks can be selected, confirmed, and undone, but not edited, split, merged, converted to subtasks, or enriched before confirmation.
- Questions can be answered, but the answer is not linked through a full reinterpretation/audit/undo conversation flow and cannot yet be deferred or dismissed semantically.
- Entity names are supplied as model context, but deterministic resolution does not yet use aliases, history, temporal relations, ambiguity margins, or duplicate detection.
- `occurred_at` exists and historical queries use it, but natural-language retroactive dates are not reliably applied to the entry and affected historical reviews are not invalidated.
- Jobs have idempotency keys, attempt limits, atomic row locking, and persisted backoff time, but no expiring lease, worker identity, reaper, stale-worker protection, or distinct terminal exhaustion state.

### Missing capabilities

- Editable, immutable interpretation revisions with correction provenance.
- A configurable confidence engine combining model, entity, ambiguity, date, impact, reversibility, autonomy, and correction history signals.
- Conversational pending-question resolution that updates the interpretation and applies/audits/undoes the permitted consequence.
- Natural-language updates to existing tasks with hybrid matching and safe disambiguation.
- Explicit task cancellation confirmation and fallback activity creation when no task matches.
- Complete user-facing job failure/recovery visibility.
- End-to-end retroactive date behavior in Portuguese and English across timezones.

## 4. Gaps ordered by risk

1. A job can remain `running` permanently, blocking trustworthy expansion of asynchronous work.
2. The original is safe, but corrections are not immutable interpretation versions.
3. Numeric confidence is not yet a trustworthy action policy.
4. Candidate tasks cannot be corrected before persistence.
5. Question answers stop at storage instead of completing a traceable domain transition.
6. Entity and existing-task resolution lacks deterministic ambiguity handling.
7. Retroactive dates can be extracted without consistently changing historical placement.
8. Mobile, localization, pagination, accessibility, and complete E2E coverage must accompany each flow rather than be postponed to a cosmetic pass.

## 5. Included scope

- Reliable leased processing for the existing `jobs` queue and attachment worker.
- Persisted capture lifecycle and recoverable reprocessing.
- Immutable interpretation correction versions and per-element confidence.
- Editable/selective candidate task confirmation, subtasks, dependencies, no-due reason, transactionality, audit, and undo.
- Conversational pending questions in chat and the questions area.
- Deterministic entity resolution for people, projects, organizations, contexts, aliases, history, duplicates, and temporal relationships.
- Retroactive occurrence handling and invalidation of affected historical reviews.
- Natural-language actions against existing tasks with hybrid matching and confirmation rules.
- Desktop/mobile, `pt-BR`/English, accessibility, pagination, and remote verification for the central journey.

## 6. Explicitly excluded scope

- WhatsApp, Gmail, Google Calendar, push notifications, BYOK, sharing, native apps, bulk history import, social features, global administration, backend replacement, application rewrite, and a full visual redesign.
- Google OAuth except a regression fix.
- New functionality unrelated to capture, interpretation, reliable action, and later consultation.
- A general-purpose orchestration platform or new external queue service.

## 7. Vertical slices and delivery order

### Phase 2A — Operational reliability

Add expiring leases, worker identity, atomic claim, bounded exponential backoff, terminal exhaustion, reaper, stale-worker protection, sanitized errors, basic metrics, user-visible failure state, concurrency tests, and linked remote smoke coverage. This is first because every later asynchronous workflow depends on it.

### Phase 2B — Interpretation revisions and trust foundation

Add persisted lifecycle states, a correction RPC that appends a new interpretation version, editable concepts/dates/entity links, deterministic entity candidates, per-element confidence, policy classification, audit, and undo. Confidence and entity resolution move into this slice because correction decisions cannot be trustworthy without them.

### Phase 2X — Product Convergence

Converge the existing daily cycle before expanding the task domain: asynchronous capture with the existing queue, immediate receipt, product-oriented state and attention projections, simplified review, coherent candidate actions, Home/Inbox/Work convergence, truthful information architecture, and private funnel instrumentation. The approved scope and execution order are defined in `PHASE_2X_PRD.md` and `PHASE_2X_IMPLEMENTATION_PLAN.md`; no 2X slice has started.

### Phase 2C — Editable candidate tasks

Add a typed editor, selective confirmation, title/description/status/priority/due/planned dates, project/context/person links, dependencies, subtasks, no-due reason, split/merge, record-only/reject/cancel choices, transactional creation, audit, and undo.

### Phase 2D — Conversational questions

Render questions in chat and the queue; support natural and suggested answers, defer, ignore, not relevant, source/effect preview, cooldown/quiet-hours enforcement, reinterpretation, permitted action, audit, result, and undo.

### Phase 2E — Natural-language task updates

Combine structured and semantic task search, calculate match margins, apply only unambiguous reversible updates, disambiguate competing matches, create an activity when no task matches, require confirmation for cancellation, and provide audit/undo.

### Phase 2F — Retroactive history and finish

Finalize occurrence/planned/due/completion/reminder date semantics, historical timeline placement, review invalidation, pagination, responsive and accessible UI, localization, complete automated matrices, linked smoke, permanent documentation, and phase closeout.

The approved order is 2A, 2B, 2X, 2C, 2D, 2E, and 2F. Deterministic entity resolution and the confidence policy remain in 2B because they are prerequisites for safe corrections, candidate actions, questions, and task updates.

## 8. Dependencies

- Linked Supabase CLI session and project credentials for migration history, db lint, deployment, and remote smoke.
- OpenAI key in the linked project for paid worker and interpretation smoke tests.
- Docker Desktop or CI for local Supabase/pgTAP execution; until available, structural SQL remains committed and equivalent disposable remote behavior is mandatory.
- Installed Next.js 16.2.10 documentation is authoritative before framework changes.
- Custom SMTP remains a pre-production dependency but does not block Phase 2 flows that use disposable confirmed users.

## 9. Planned database changes

### 2A

- Append migration `202607170019_job_queue_reliability.sql`.
- Add `locked_at`, `locked_by`, `lease_expires_at`, and a terminal failure timestamp to `jobs`; preserve `error` as a bounded sanitized message.
- Replace the pending-job index with an eligibility index that excludes terminal rows.
- Replace the attachment claim RPC with an atomic leased claim that accepts worker identity and lease duration.
- Add lease-validated completion/failure RPCs so stale workers cannot overwrite newer work.
- Add a reaper RPC that atomically requeues expired recoverable jobs or marks exhausted jobs terminal.
- Keep user access select/insert only and service operations least-privileged.

### Later slices

- Append interpretation revision/correction metadata, element-level confidence/policy, aliases and temporal relationship validity, question resolution/audit fields, editable task-candidate payloads, and explicit activity/task-action evidence only when the implementing slice needs them.
- Every relationship carries `user_id`, RLS, ownership constraints, cross-user denial tests, and regenerated TypeScript types.

## 10. Planned interface changes

- Persisted capture progress with truthful saving, interpreting, review, partial, recoverable failure, terminal failure, and reprocessing states.
- Interpretation revision editor that keeps the original and prior versions visible.
- Candidate task editor with selective confirmation and structural task controls.
- Questions in both chat and queue with source, target, consequence, suggested answers, defer/ignore controls, and outcome.
- User-visible failed/exhausted job information and a safe retry path where recovery remains possible.
- Existing visual language remains; changes focus on operational clarity, mobile access, accessibility, and localized copy.

## 11. Agent changes

- Retrieval selects bounded relevant entities/history rather than sending whole history.
- Structured output distinguishes facts, interpretations, inferences, suggestions, task actions, and unanswered ambiguity.
- The resolver supplies ranked candidates and score margins; the model does not create ambiguous people automatically.
- Corrections become new prompt/strategy-versioned interpretations and influence future confidence signals.
- Task-action recognition searches structured fields and embeddings before deciding whether to act, ask, or record only an activity.
- User/file content remains untrusted and cannot override internal instructions.

## 12. Trust rules and initial thresholds

The initial internal score is configurable and combines normalized signals: model confidence (20%), top-vs-second candidate margin (20%), verified entity existence/exactness (15%), semantic similarity (10%), date clarity (10%), context consistency (10%), reversibility (5%), autonomy preference within its allowed ceiling (5%), and correction-history agreement (5%). Impact, ambiguity, missing ownership, irreversibility, and destructive intent are hard overrides, not positive weights.

- `>= 0.90`: apply automatically only for low-impact, reversible, unambiguous actions allowed by the user's autonomy setting.
- `>= 0.78` and `< 0.90`: apply and visibly flag only when reversible and low impact.
- `>= 0.55` and `< 0.78`: request review.
- `< 0.55`: block until confirmation or preserve as an unresolved interpretation.
- Any cancellation, deletion, irreversible action, cross-owner target, material ambiguity, or conflicting date blocks until explicit confirmation regardless of score.
- Implicit task creation always requires confirmation; an explicit “create a task” instruction may auto-create only when every material field and relationship is unambiguous and undo is available.

Threshold behavior and overrides receive direct unit tests before product use.

## 13. Test strategy

### Unit/component

- Confidence aggregation and action classification boundaries.
- Relative/absolute/retroactive dates in `pt-BR` and English across timezones.
- People/project/organization resolution, alias ranking, duplicate ambiguity, and semantic margins.
- Existing-task matching and act-versus-ask decisions.
- Retry delay, attempt exhaustion, lease expiry, stale-worker denial, quiet hours, and cooldown.
- Editors, selective confirmation, question controls, persisted progress, and mobile interaction.

### Database/integration

- Original capture immutability and append-only interpretation revisions.
- Entity corrections, transactional task confirmation, task updates, question/answer/result, audit, and undo.
- Atomic job claim, concurrent claim denial, active lease protection, expired lease recovery, terminal exhaustion, idempotency, and cross-user denial.
- Every new relationship rejects mixed ownership.

### Playwright/remote

- Capture, interpretation/original, person/date correction, editable selective tasks, question answer, textual task completion, undo, retroactive entry, failed-job recovery, mobile, `pt-BR`, and English.
- Linked migration synchronization, db lint, Edge Function deployment, disposable remote users/data, real worker processing, RLS/ownership, and cleanup.

## 14. Acceptance criteria

The phase is accepted only when all 20 Definition of Done items in the initiating brief are evidenced. In particular: the linked remote flow works, originals cannot be lost, corrections append versions, implicit tasks require confirmation, candidates are editable, automatic actions are audited and reversible, jobs cannot remain permanently stuck, dates respect timezone, RLS/ownership denial is proven, desktop/mobile and both locales work, no false controls remain, all local gates and remote smoke pass, and permanent documentation matches deployment reality.

Each slice has the same smaller gate for its affected surface and cannot be marked complete from code inspection alone.

## 15. Risks and mitigations

- **Queue migration races:** deploy additive columns/RPCs before the worker and keep old fields compatible during rollout.
- **Duplicate paid calls after lease expiry:** use domain idempotency/provider request evidence; a lease prevents concurrent claims but cannot prove a timed-out provider did not finish.
- **Stale workers:** completion/failure RPCs require the current `locked_by` and unexpired lease.
- **Overconfident matching:** hard safety overrides and top-vs-second margins force review.
- **Interpretation schema expansion:** version schemas and preserve old raw output for rendering/migration compatibility.
- **Large UI scope:** deliver one complete correction/action path per slice and hide unfinished controls.
- **Hosted email quota and missing Docker:** keep them explicit external gates; use confirmed disposable users and remote behavioral equivalents without claiming pgTAP execution.
- **AI cost growth:** keep bounded retrieval, economic route defaults, idempotent usage recording, and smoke datasets small.

## 16. Rollout strategy

1. Commit standards and this reconciled plan before production code.
2. Implement 2A test-first against additive migration `019`.
3. Run local static/unit/build gates; run SQL structural checks even when Docker-backed execution is unavailable.
4. Apply migration to the linked project, confirm migration sync and db lint, then deploy the compatible Edge Function.
5. Run disposable remote lease/reaper/RLS/worker smoke and inspect user-visible failure behavior.
6. Update permanent docs with exact deployed versions, evidence, limitations, and commit.
7. Repeat the same expand → validate → deploy → smoke → document cycle for each later slice.
8. Do not delete old schema fields or compatibility paths until all consumers have moved and a separate reviewed migration authorizes contraction.

## 17. Commit plan

1. `docs(phase-2): adopt engineering standards and reconciled plan`
2. `test(jobs): specify lease and recovery invariants`
3. `feat(jobs): add leased claims and abandoned job recovery`
4. `feat(worker): enforce lease ownership and bounded retries`
5. `feat(files): expose recoverable and terminal processing failures`
6. `test(jobs): add remote concurrency and recovery smoke`
7. `docs(phase-2a): record operational reliability evidence`
8. Later slices use separate database/domain/UI/test/documentation commits and never combine unrelated Phase 2 work.

## Phase 2A implementation file map and execution checklist

- Create `supabase/migrations/202607170019_job_queue_reliability.sql` for schema, RPCs, grants, and indexes.
- Create `supabase/tests/job_queue_reliability.sql` with structural, concurrency, recovery, exhaustion, and cross-user assertions.
- Modify `supabase/functions/process-jobs/index.ts` to generate a worker ID, claim with a bounded lease, set external-call timeouts, and finish/fail only through lease-validated RPCs.
- Modify `scripts/remote-supabase-smoke.mjs` to prove exclusive claim, expired recovery, terminal exhaustion, RLS visibility, and successful real processing with disposable data.
- Modify `src/app/[locale]/app/files/page.tsx` and the smallest necessary localized UI/data-access modules to show current attempts, recoverability, and terminal failure without exposing internal errors.
- Add focused Vitest/component coverage for any TypeScript helper or UI behavior introduced.
- Run, in order: focused red tests, focused green tests, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, relevant Playwright, `npx supabase db lint --linked --level error`, migration synchronization, Edge Function deployment, and `npm run test:remote`.
- Update `STATE.md`, `TODO.md`, `CHANGELOG.md`, `DECISIONS.md` if the implemented design differs from ADR-016, and this plan with exact evidence and commit hashes after the slice.

## Phase 2A execution record

Delivered on 2026-07-17:

- Migration `202607170019_job_queue_reliability.sql` is synchronized locally/remotely. It adds leased claims, worker identity, expiry, lease-owned completion/failure, exponential backoff, terminal exhaustion, sanitized errors, metrics, eligible/expired indexes, and the scheduled `my-brain-job-reaper`.
- `process-jobs` version 9 is active with a 300-second lease, 120-second OpenAI timeout, persisted-interpretation reuse, no direct job mutations, and bounded operational logs.
- The Files route shows the owning user's recoverable and terminal jobs, attempts, retry window, and no raw internal error. The retry Server Action validates Zod input, session, ownership, state, backoff, and the persisted post-invocation result.
- `src/lib/supabase/database.types.ts` was generated from the linked `public` schema and its `jobs` row type is used by the Phase 2A page. Remaining global client typing is tracked because existing preference literals and pgvector representations require domain validation rather than casts.
- The original plan's `scripts/remote-supabase-smoke.mjs` remained the complete regression smoke; the focused lease/concurrency coverage was isolated in `scripts/remote-job-reliability-smoke.mjs` so it stays deterministic and does not require an extra paid provider call.

Verification evidence:

- ESLint: passed, zero errors.
- TypeScript: passed, zero errors.
- Vitest: 29 files, 93 tests passed.
- Build: Next.js 16.2.10 production build passed.
- Playwright: linked intelligent-capture/file journey passed 2/2 on desktop and mobile.
- Database: migrations `001`–`019` synchronized; linked db lint passed at error level.
- Remote jobs: exclusive lease, stale-worker denial, expired recovery, exhaustion, sanitization, metrics, cross-owner denial, and RLS passed.
- Complete remote smoke: auth, atomic settings, RLS, ownership, heartbeat, AI ledger, aggregation, and deployed file worker passed.
- pgTAP: `supabase/tests/job_queue_reliability.sql` is committed; CLI execution remains blocked only by unavailable Docker Desktop and is not claimed as run.

Implementation commits:

- `437b626` — engineering standards and reconciled plan.
- `c8365b8` — failing-first lease/recovery contracts and remote smoke.
- `fe2f464` — migration `019` leased state machine and reaper.
- `ab902e9` — leased worker, timeout, idempotent persisted-result reuse.
- `86fa041` — owning-user failure visibility and retry action.
- `ac9f08e` — generated Supabase job contract.

## Phase 2B design and execution checklist

### Selected design

Phase 2B keeps `entry_interpretations` append-only. The current version is identified by a mutable `entries.current_interpretation_id` pointer instead of an `is_current` flag on interpretation rows, so selecting a new current version never rewrites historical evidence. Every correction locks the owned entry, validates the expected current version and complete desired entity links, appends one interpretation snapshot, moves the pointer, refreshes derived links/questions, records audit and undo, and returns the same result for a repeated operation key.

Trust is calculated from explicit normalized signals by a small deterministic TypeScript domain module with centralized weights, thresholds, policies, and hard overrides. The database stores the per-element score, policy, signals, and bounded user-facing evidence on the immutable interpretation snapshot; ownership and relationship validity remain database-enforced. Entity ranking is a separate deterministic module over a bounded owned candidate set and considers normalized exact name, alias, history, organization/context consistency, temporal validity, optional semantic similarity, and the top-versus-second margin. Missing signals contribute zero and are reported as unavailable rather than fabricated.

Reprocessing remains a typed synchronous domain operation in this slice because the existing Next.js provider is the only extraction implementation. It uses a persisted entry-level expiring lease to prevent concurrent reprocessing, reuses the same extraction provider and usage ledger, and appends an `ai_reprocessed` version. The Phase 2A job worker is therefore not duplicated or expanded into a second AI extraction implementation; if reprocessing becomes detached/asynchronous later, it must move behind the leased queue contract before release.

Alternatives rejected for this slice:

- An `is_current` flag on interpretations would require updating historical rows on every correction and weaken the immutability promise.
- A separate editable interpretation table plus snapshot table would duplicate the current model and add synchronization failure modes.
- A new generic reprocessing worker would duplicate the existing extraction prompt/provider or broaden the job platform before a detached consumer is required.

### File map

- Create `supabase/migrations/202607170020_interpretation_revisions.sql` for lifecycle expansion, the current-version pointer, immutable revision metadata, entity aliases, reprocessing lease fields, correction/reprocessing RPCs, audit, undo, ownership constraints, RLS, grants, and compatible evolution of the existing persistence RPC.
- Create `supabase/tests/interpretation_revisions.sql` for immutability, append-only revisions, one current pointer, ownership, cross-user denial, aliases, idempotency, concurrency, undo, reprocessing, and rollback behavior.
- Create `src/features/interpretations/trust-policy.ts` and its Vitest contract for weighted scores, centralized thresholds, hard overrides, correction history, date clarity, and final policy.
- Create `src/features/interpretations/entity-resolution.ts` and its Vitest contract for normalization, exact/alias ranking, recurrence/context/temporal signals, bounded retrieval, margins, ambiguity, and owner filtering.
- Create `src/features/interpretations/schema.ts`, `version-comparison.ts`, `copy.ts`, `data.ts`, `actions.ts`, `revision-editor.tsx`, and focused tests so validation, reads, mutations, localized copy, comparison, and interaction remain independently understandable.
- Refactor `src/features/capture/actions.ts` only enough to use the persisted lifecycle and shared interpretation operation without duplicating extraction behavior.
- Modify `src/app/[locale]/app/inbox/[entryId]/page.tsx` and `src/app/operations.css` to render persisted status, immutable version metadata, per-element trust/evidence, ranked candidates, an accessible editor, adjacent-version comparison, undo, and reprocessing on desktop/mobile in both locales.
- Extend `e2e/intelligent-capture.spec.ts`; create `scripts/remote-interpretation-revisions-smoke.mjs`; add the focused remote script to `package.json`; regenerate `src/lib/supabase/database.types.ts` from the linked schema after migration deployment.
- Update `STATE.md`, `TODO.md`, `CHANGELOG.md`, `DECISIONS.md`, and this plan with deployed behavior, evidence, limitations, commit hashes, and the Phase 2C recommendation.

### Test-first implementation checklist

- [x] Confirm remote migration sequence still ends at `019`, linked branch SHA matches local Phase 2A, and no schema drift exists.
- [x] Add failing trust-policy tests for every weight, the `0.90`, `0.78`, and `0.55` boundaries, all hard overrides, low candidate margin, date conflict, missing evidence, recurring correction, and policy output.
- [x] Add failing entity-resolution tests for exact name, normalized name, alias, historical/context/temporal signals, semantic input, cross-owner filtering, duplicate ambiguity, margin, and result bounds.
- [x] Add failing patch/comparison tests for summary, concepts, occurrence, extracted dates, entity add/remove/replace, element classification, pending questions, invalid IDs/dates, and adjacent immutable snapshots.
- [x] Add failing structural/behavioral SQL tests and a disposable remote smoke before the migration exists; prove the failure is the missing Phase 2B contract.
- [x] Append migration `020`; map `processing` to `interpreting`, `interpreted` to `completed`, and `failed` to `recoverable_error` while accepting only the eight Phase 2B lifecycle states.
- [x] Backfill `entries.current_interpretation_id` to the latest owned interpretation and add the composite ownership foreign key without mutating prior interpretation payloads.
- [x] Add immutable revision origin, parent, corrected-by/reason, operation key, extracted dates, element classifications, confidence, policy, and bounded resolution evidence.
- [x] Add owned `entity_aliases` with temporal validity, forced RLS, least privilege, polymorphic ownership validation, and cross-user denial.
- [x] Implement the correction RPC with entry locking, expected-version concurrency control, idempotency, complete-link ownership validation, append-only snapshot creation, derived entity/question refresh, current pointer update, lifecycle update, audit, and undo creation.
- [x] Extend undo so an interpretation correction appends a compensating version based on the prior snapshot, never deletes/reactivates history, audits the result, denies cross-user access, and returns the same result when repeated.
- [x] Implement leased begin/complete/fail reprocessing transitions; append `ai_reprocessed` results through the same persistence invariants and reject a stale operation key.
- [x] Make the focused Vitest and remote database contracts green, apply migrations `020` through `023` to the linked project, confirm local/remote synchronization, run linked db lint, and regenerate Supabase types.
- [x] Implement the typed DAL and Server Actions with Zod validation, session validation, bounded reads, sanitized errors, immediate route revalidation, and no direct UI mutation of append-only tables.
- [x] Implement the localized accessible review UI with only working controls: edit/cancel/save, entity add/remove/replace, concepts, occurrence/extracted dates, classifications, pending-question retention, record-only mode, history, comparison, undo, and reprocess.
- [x] Add component/action tests and Playwright coverage for the complete desktop/mobile, `pt-BR`/English correction journey.
- [x] Run focused tests, full Vitest, lint, TypeScript, production build, linked Playwright, migration synchronization, db lint, RLS/ownership/correction/undo/reprocessing remote smoke, full regression smoke, and disposable-data cleanup.
- [x] Review every Phase 2B requirement and engineering standard, remove dead paths/false controls, update permanent documentation, commit thematically, and push all Phase 2B commits to the same branch without merging `main`.

### Phase 2B completion evidence

Completed on 2026-07-17 on `codex/phase-2-intelligent-capture`.

- Migrations `020` through `023` are applied and local/remote history is synchronized. `020` adds the lifecycle/revision/entity/reprocessing contract; `021` fixes timestamp name resolution; `022` fixes least-privilege alias trigger execution; `023` declares truthful `STABLE` volatility for the model-only fallback.
- The deployed operation boundary includes `begin_entry_interpretation`, `fail_entry_interpretation`, `correct_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, `fail_entry_reprocessing`, and compensating `undo_operation` behavior.
- The shared extraction pipeline records paid usage before domain persistence, bounds provider work to 120 seconds, ranks only owned candidates, persists missing semantic evidence as unavailable, and reuses the same strategy/prompt for capture and reprocessing.
- Vitest passes 39 files/147 tests; ESLint, TypeScript, and the Next.js 16.2.10 production build pass.
- Linked Playwright passes the complete intelligent-capture/revision regression separately on desktop (54.2 s) and Pixel 7 mobile (53.1 s), including `pt-BR`, English, correction, date editing, record-only, history, undo, task confirmation, and cleanup.
- The focused remote interpretation smoke passes immutability, append-only correction, idempotency, concurrency, ownership, rollback, audit, undo, aliases, reprocessing, sanitization, RLS, and cleanup. The complete remote Supabase smoke also passes auth, atomic settings, ownership, heartbeat, AI accounting, and the deployed file worker.
- Linked database lint has no Phase 2B issue. Two pre-existing `run_user_heartbeat` text-to-time warnings remain outside this slice. Docker-backed pgTAP execution remains unavailable on this workstation; the 44-assertion structural contract is committed and equivalent high-risk behavior passed remotely.
- Implementation commits: `c0f038c`, `981b39e`, `9a87c54`, `ae0be18`, `91c1722`, `8331e68`, `8fbd615`, `9e894de`, `00eabe5`, and `80bb233`. The final documentation/push commit follows this record.
- Phase 2X precedes Phase 2C and must converge the current daily cycle without expanding the task domain. After 2X is complete, Phase 2C should extend the stable task-candidate contract into an editable desired-state editor and one transactional confirmation RPC; it should not create a second task workflow or weaken the revision/trust boundary completed here.
