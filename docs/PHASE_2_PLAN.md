# Phase 2 — Intelligent Capture Implementation Plan

Status: in progress  
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

### Phase 2C — Editable candidate tasks

Add a typed editor, selective confirmation, title/description/status/priority/due/planned dates, project/context/person links, dependencies, subtasks, no-due reason, split/merge, record-only/reject/cancel choices, transactional creation, audit, and undo.

### Phase 2D — Conversational questions

Render questions in chat and the queue; support natural and suggested answers, defer, ignore, not relevant, source/effect preview, cooldown/quiet-hours enforcement, reinterpretation, permitted action, audit, result, and undo.

### Phase 2E — Natural-language task updates

Combine structured and semantic task search, calculate match margins, apply only unambiguous reversible updates, disambiguate competing matches, create an activity when no task matches, require confirmation for cancellation, and provide audit/undo.

### Phase 2F — Retroactive history and finish

Finalize occurrence/planned/due/completion/reminder date semantics, historical timeline placement, review invalidation, pagination, responsive and accessible UI, localization, complete automated matrices, linked smoke, permanent documentation, and phase closeout.

The suggested A–F shape is retained, but deterministic entity resolution and the confidence policy move into 2B instead of waiting for a later entity-only pass. They are prerequisites for safe corrections, candidate edits, questions, and task updates.

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
