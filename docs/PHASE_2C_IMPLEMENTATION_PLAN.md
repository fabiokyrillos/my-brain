# Phase 2C — Editable Candidate Tasks and Transactional Materialization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` only after the user authorizes a Phase 2C feature branch and implementation. Steps use checkbox (`- [ ]`) syntax for execution tracking.

**Goal:** Let a user edit an AI task suggestion before selectively materializing it while preserving the immutable suggestion, one persistent task truth, owner scope, deterministic idempotency, atomic audit/undo, and daily-cycle convergence.

**Architecture:** Keep interpretation candidates immutable and keep unconfirmed edits in local form state. Add one strict versioned PostgreSQL RPC for edited materialization, preserve the legacy RPC during rollout, and switch the existing review projection, Server Action, and candidate form only after the remote contract is proved. Later slices add planning semantics, owned relations, dispositions, and graph operations without widening Phase 2C.1.

**Tech Stack:** Next.js 16.2.10 App Router and Server Actions, React 19.2.4 `useActionState`, strict TypeScript, Zod 4.4.3, next-intl 4.13.2, Supabase/PostgreSQL/RLS/RPC, generated Supabase types, Vitest/Testing Library, pgTAP, disposable Node remote smokes, and Playwright 1.61.1.

## Global constraints

- This plan implements [`PHASE_2C_PRD.md`](./PHASE_2C_PRD.md); the PRD wins if wording here is accidentally broader.
- Phase 2C.1 edits only title, description, and due date.
- No candidate-draft table, autosave, local-storage draft, or offline candidate editor is permitted.
- Interpretation candidates remain immutable; `tasks` is the sole persistent edited truth.
- Migrations are append-only. Never edit migration `001`–`031` or another applied migration.
- Preserve `confirm_entry_task_candidates(uuid, uuid, integer[], text)` until removal is separately authorized after all consumers are gone.
- Sensitive writes remain database-owned, authenticated through `auth.uid()`, explicitly owner-scoped, and RLS-protected.
- No arbitrary task object, owner ID, dynamic SQL, raw provider response, or product-event content is accepted.
- Analytics remains allowlisted, content-free, and fail-open.
- Each slice ships PT-BR/English, desktop/mobile, keyboard/focus/live-region, local tests, database evidence where applicable, remote smoke, rollback, cleanup, traceability, and current documentation.
- No Edge Function, queue, worker, scheduler, secret, Auth, email, or provider change is part of Phase 2C.1.
- Before editing any Next.js file during execution, read the relevant installed guides in `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and `node_modules/next/dist/docs/01-app/02-guides/forms.md` as required by `AGENTS.md`.
- This planning task stops before branch creation or implementation. Every slice requires explicit authorization before its feature branch, local implementation, remote mutation, deployment, push, or PR.

---

## 1. Verified baseline at planning time

- Planning preflight passed on `main` at `89af5abad497fd2220ceac22704cf6abc57a20fe`, equal to `origin/main`, clean, 0 ahead and 0 behind.
- Phase 2X is closed through Slice 2X.18; migrations and generated types are synchronized through migration `031` in its closeout evidence.
- `ActionableCandidateView` currently exposes `key`, `title`, optional `description`, and optional `dueAt` through `review-projection.ts`.
- `TaskCandidateForm` currently selects every actionable candidate, submits `candidateIndex[]`, and uses `useActionState` with `confirmEntryTasks`.
- `confirmEntryTasks` validates entry/interpretation/operation/locale, calls `confirm_entry_task_candidates`, emits `task_candidates_confirmed` after success, and revalidates Work, Tasks, Inbox, and entry review routes.
- The existing RPC signature is `confirm_entry_task_candidates(p_entry_id uuid, p_expected_interpretation_id uuid, p_candidate_indexes integer[], p_operation_key text) returns jsonb`.
- The legacy RPC locks the owned entry, validates current interpretation and record-only status, creates interpretation/candidate-provenanced tasks, records audit and undo, and is unique by `(source_interpretation_id, candidate_index)`.
- The legacy RPC deduplicates replay by operation key but does not compare the replay payload. It also applies immutable `waitingOn`, `parentIndex`, and all interpretation person/project/context links; those effects are outside Phase 2C.1.
- `undo_operation` compensates candidate materialization by cancelling the stored task IDs and auditing the result. Its correction-conflict branch still contains an unverified SQLSTATE `40001` risk.
- Work already reads persisted task title/description/due date and profile timezone. Needs Attention and review preserve partial candidates through current-interpretation candidate provenance.
- The existing product ledger allowlists 17 daily-funnel events and fails open; no content may enter event payloads.
- Current quality commands are `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, focused remote scripts, and the Phase 2X aggregate.

## 2. Delivery order and commit policy

Official slices:

1. **2C.1 — Editable Core Confirmation**
2. **2C.2 — Planning, Priority and No-Due Semantics**
3. **2C.3 — Owned Relations**
4. **2C.4 — Candidate Dispositions**
5. **2C.5 — Subtasks, Dependencies and Split/Merge**
6. **2C.6 — Product Convergence and Closeout**

Each slice targets one focused implementation commit. A slice may use two commits only when an additive database contract must be deployed and remotely proved before switching its consumer. Phase 2C.1 has that justified boundary:

1. `feat(db): add editable candidate confirmation contract` — migration, pgTAP, generated types, dedicated remote smoke, and compatibility evidence while the legacy UI remains active;
2. `feat(tasks): edit candidates before confirmation` — typed command, projection, Server Action, form/editor, analytics emitters, local/E2E gates, report, and consumer cutover.

The migration commit must be deployable without the UI commit. The UI commit must be rollback-safe to the old RPC without reverting the migration. Later database-bearing slices must document the same compatibility need before taking a second commit.

## 3. Cross-slice file and boundary map

| Area | Owner | Responsibility |
| --- | --- | --- |
| Immutable suggestion | `entry_interpretations.task_candidates` | AI evidence; never edited by Phase 2C |
| Review DTO | `src/features/daily-cycle/review-projection.ts` and `contracts.ts` | Current actionable candidate values and profile timezone; no raw rows in UI |
| Typed edit command | `src/features/tasks/candidate-edit-contract.ts` | Closed Zod schema, normalized field semantics, bounded JSON serialization |
| Due-date conversion | `src/features/tasks/candidate-due-date.ts` | Profile-timezone wall-time formatting/parsing and DST ambiguity rejection |
| Candidate card | `src/features/tasks/candidate-editor.tsx` | One candidate's local edit/reset/validation state |
| Form orchestration | `src/features/tasks/task-candidate-form.tsx` | Selection, local command assembly, submission state, success/undo |
| Server boundary | `src/features/tasks/actions.ts` | Auth, FormData parsing, sanitization, versioned RPC call, action-result mapping, revalidation, fail-open event |
| Transaction | migration `032` and versioned RPC | Ownership, locks, closed JSON validation, canonical replay, task/audit/undo/lifecycle atomics |
| Persistent truth | `tasks` | Confirmed title/description/due date and later task-domain fields |
| Operation evidence | `undo_operations`, `audit_logs` | Request fingerprint, created IDs, edited field names, compensating undo |
| Analytics | `src/features/product-analytics/*` plus migration allowlist | Content-free edit interactions and confirmed outcome counts |
| Daily convergence | Needs Attention, review, Work projections | Unresolved candidates remain visible; exact task values appear after confirmation |

## 4. Phase 2C.1 — Editable Core Confirmation

### 4.1 User outcome

The user can edit title, description, and due date for any selected current candidate, reset to the immutable suggestion, confirm a subset, see the exact persisted values in Work, and undo the created tasks. Leaving without confirmation loses the edits and writes nothing.

### 4.2 Included and excluded scope

Included:

- transient per-candidate title, description, and due-date edits;
- original-vs-edited indication and reset;
- selective confirmation;
- strict versioned RPC and canonical replay fingerprint;
- current interpretation, record-only, ownership, range, duplicate, malformed, and concurrency checks;
- atomic tasks, provenance, audit, undo, and lifecycle convergence;
- profile-timezone conversion and DST rejection;
- content-free edit/confirmation analytics;
- local, pgTAP/equivalent, linked remote, and desktop/mobile PT-BR/English gates.

Excluded:

- planned date, priority, status selection, intentional-no-due metadata;
- project, context, person, waiting-on, or any relation selector;
- `parentIndex`, parent task, dependency, split, merge, or disposition behavior;
- candidate draft persistence;
- Edge Function, worker, queue, scheduler, secret, Auth, email, or provider change.

### 4.3 Exact public database contract

Create migration:

`supabase/migrations/202607190032_phase_2c_editable_candidate_confirmation.sql`

If the authorized implementation preflight finds a migration newer than `031` on `origin/main` or linked remote, stop before creating the file and assign the next monotonic number; never reuse or edit an applied number.

Add this exact public RPC name and argument contract:

```sql
public.confirm_entry_task_candidates_v2(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_indexes integer[],
  p_candidate_edits jsonb,
  p_operation_key text
) returns jsonb
```

Use `language plpgsql`, `security definer`, and `set search_path = ''`. Grant execute only to `authenticated`; explicitly revoke from `public` and `anon`. The function derives the owner from `auth.uid()` and uses qualified `public.*`/`extensions.*` names.

`p_candidate_edits` is a JSON array with at most one object per selected candidate:

```json
[
  {
    "candidateIndex": 0,
    "changes": {
      "title": "Send the signed report",
      "description": null,
      "dueAt": "2026-07-21T17:30:00-03:00"
    }
  }
]
```

Closed-shape rules:

- edit object keys: exactly `candidateIndex`, `changes`;
- `changes` keys: subset of `title`, `description`, `dueAt` only;
- empty `changes`: canonicalize away;
- selected index count: 1–50; edit object count: 0–50; serialized edit JSON: at most 131,072 UTF-8 bytes;
- `title`: trimmed non-empty string, maximum 240, never `null`;
- `description`: trimmed string maximum 2,000 or explicit JSON `null`; empty/whitespace canonicalizes to `null`;
- `dueAt`: offset-bearing ISO-8601 timestamp or explicit JSON `null`;
- candidate edit list: unique integer indices, sorted canonically, each present in the selected set;
- selected indices: non-empty, unique at input, sorted canonically; duplicate input is rejected rather than silently deduplicated;
- unknown key, extra nesting, non-array payload, edit for an unselected candidate, duplicate index, or out-of-range index rejects the transaction.

Field meaning:

| State | JSON representation | Effective value |
| --- | --- | --- |
| Unchanged/omitted | key absent | immutable suggestion value |
| Reset to suggestion | key removed before submit | immutable suggestion value |
| Clear description | `"description": null` | `tasks.description = null` |
| Clear due date | `"dueAt": null` | `tasks.due_at = null` |
| Invalid title clear | `"title": null` or empty | reject entire transaction |
| Normalized value equals suggestion | accepted then removed from canonical changes | unchanged for audit/event counts |

Return shape:

```json
{
  "task_ids": ["uuid"],
  "undo_id": "uuid-or-null",
  "idempotent": false
}
```

The task ID array contains only selected materialized tasks, ordered by candidate index. On same-key/same-payload replay it returns the original task IDs and undo ID with `idempotent: true`. Review, Inbox, and Work are revalidated and read the persisted task values; RPC response content never becomes another task truth.

### 4.4 Idempotency and operation evidence

Extend `public.undo_operations` additively with nullable `request_fingerprint text` and a check accepting exactly 64 lower-case hexadecimal characters when non-null. Do not add a confirmation-operation table.

For the new RPC:

1. normalize operation key whitespace and validate length 8–240;
2. structurally validate the bounded selection/edit input, then load the expected owner-scoped immutable interpretation by `(user_id, entry_id, id)` without requiring it to still be current;
3. resolve normalized edits against those immutable candidate values so an omitted field and an explicitly supplied value equal to the suggestion canonicalize identically; canonicalize `{entryId, interpretationId, selectedCandidateIndexes, candidateEdits}` with sorted arrays and normalized strings/nulls;
4. compute lowercase SHA-256 hex with the schema-qualified installed `extensions.digest`/`extensions.encode` functions;
5. atomically reserve the existing `undo_operations(user_id, operation_key)` unique key by inserting the eventual undo row with operation key `confirm-v2:` plus the normalized public key, the fingerprint, empty entity IDs, and bounded request metadata; use the existing partial unique index as the cross-entry/concurrent serialization point;
6. if the reservation conflicts, lock/read the existing owner-scoped operation: same fingerprint returns its exact original result and a different fingerprint raises the sanitized idempotency mismatch;
7. if the reservation is new, lock the entry and require that the same expected interpretation is still current before materialization; update the reserved row with final entity IDs and after-state before commit; any later exception rolls back the reservation with the entire transaction, so no placeholder row can persist;
8. if `extensions.digest(bytea,text)` is absent in the authorized environment, stop before migration execution and request an explicit database design decision; do not substitute MD5 or a collision-prone hash silently.

Same owner/key/same fingerprint is always a replay, including after the undo operation is used or expires: it returns the original IDs and never rematerializes. Same owner/key/different fingerprint always fails. A genuinely new confirmation intent requires a new public operation key.

The audit row stores created task IDs, selected candidate indices, edited field names, interpretation ID, and request fingerprint. It does not store product-event content and does not become task state.

### 4.5 Transaction sequence

Implement the transaction in this order:

1. require `auth.uid()`;
2. validate operation key, selection/edit counts, JSON byte size, unique selected indices, and closed edit JSON structure without writes;
3. load the expected owner-scoped immutable interpretation by `(user_id, entry_id, id)`; reject not-found and `is_record_only` without cross-owner disclosure;
4. reject out-of-range selected indices and any duplicate/edit for an unselected index;
5. resolve and validate effective title/description/due date, remove normalized values equal to the suggestion, canonicalize the request, and compute its fingerprint;
6. reserve or resolve the unique owner-scoped `confirm-v2:` undo operation as described above; return exact replay or reject fingerprint mismatch;
7. for a new operation, lock the owner-scoped entry `for update`;
8. require `entries.current_interpretation_id = p_expected_interpretation_id` and map stale conflict to SQLSTATE `55P03`, matching the proved current platform behavior;
9. reassert that the loaded immutable interpretation belongs to the locked entry/owner; its candidate payload cannot change;
10. check whether any selected `(source_interpretation_id, candidate_index)` is already materialized by a different operation; return a deterministic conflict and never overwrite it;
11. create tasks with `status = 'inbox'`, `manual_priority = null`, `planned_at = null`, `intentional_no_due = false`, no relation rows, no parent, and no dependency rows; preserve system provenance/confidence/creator fields;
12. collect materialized task IDs in selected-index order;
13. finalize the reserved undo row with entity IDs, source entry/interpretation, fingerprint, and bounded after-state evidence;
14. create one audit row with IDs/indices/edited field names/fingerprint;
15. leave unselected candidates unresolved; task provenance rows are the persisted resolution fact and the existing projection derives lifecycle from them, so no separate mutable candidate-status write is added;
16. return task rows and undo ID;
17. only after the RPC succeeds, emit fail-open analytics from the Server Action and revalidate review/Inbox/Work/legacy Tasks routes.

Stable database failure contract:

- SQLSTATE `42501`: unauthenticated/forbidden;
- SQLSTATE `P0002`: owner-scoped entry or interpretation not found, without cross-owner disclosure;
- SQLSTATE `55P03`: expected interpretation is stale;
- SQLSTATE `55000`: current interpretation is record-only;
- SQLSTATE `22023`: malformed selection/edit/value input;
- SQLSTATE `P0001` with detail token `2C_IDEMPOTENCY_MISMATCH`: same key, different canonical request;
- SQLSTATE `P0001` with detail token `2C_ALREADY_MATERIALIZED`: a different operation already materialized a selected candidate.

The Server Action may inspect only the code plus these closed detail tokens and must map them to localized action-result codes. It never returns the database message, detail, hint, or stack to the client.

The new RPC must not copy legacy `waitingOn`, `parentIndex`, or blanket `entry_entities` into created tasks. Those behaviors remain only in the preserved legacy RPC until their explicit later slices.

### 4.6 Server/client command and result contracts

Create `src/features/tasks/candidate-edit-contract.ts` with:

- `CandidateEditableField = "title" | "description" | "dueAt"`;
- `CandidateChanges = { title?: string; description?: string | null; dueAt?: string | null }`;
- `CandidateEditCommand = { candidateIndex: number; changes: CandidateChanges }`;
- a strict Zod schema for a bounded edit array;
- a pure normalizer that removes unchanged values, trims strings, converts empty description to `null`, preserves explicit due-date `null`, sorts by index, and returns edited candidate/field counts;
- a serializer consumed by the hidden `candidateEdits` form field;
- unit tests for every omitted/reset/clear/invalid/unknown/duplicate/unselected state.

Create `src/features/tasks/candidate-due-date.ts` with pure functions to:

- format an offset-bearing candidate instant into an HTML `datetime-local` value in a validated IANA profile timezone;
- convert one local wall time plus IANA timezone into one offset-bearing ISO instant;
- reject malformed input, invalid timezone, DST gap with zero matching instants, and DST overlap with more than one matching instant;
- round-trip normal dates in `America/Sao_Paulo`, `America/New_York`, and UTC in tests.

Extend the action result to a discriminated code, while preserving `status`, localized message, and `undoId` for the component boundary:

- `validation_error`;
- `session_expired`;
- `stale_interpretation`;
- `record_only`;
- `idempotency_mismatch`;
- `already_materialized`;
- `retryable_failure`;
- `confirmation_succeeded`.

The Server Action parses `candidateEdits` from FormData with the strict schema, verifies that edits reference selected indices, converts due-date wall values using the profile timezone, calls `confirm_entry_task_candidates_v2`, maps database failures to stable codes/copy, and never forwards raw SQL text.

### 4.7 UI composition

Create `src/features/tasks/candidate-editor.tsx` for one candidate and keep `task-candidate-form.tsx` responsible for the candidate list, selection set, aggregate command, submission, success, and undo.

The editor must:

- start collapsed with original title/description/due date;
- expand inline from **Edit suggestion / Editar sugestão**;
- use controlled local state only;
- show an edited badge when normalized changes exist;
- show original values beside changed fields;
- reset all three fields to the suggestion and remove overrides;
- associate validation text with inputs;
- label due date with the profile timezone;
- preserve local edits when temporarily unselected but serialize edits only for selected candidates;
- never use local storage, autosave, or a database read/write for drafts;
- never render confidence in the primary flow.

`review-projection.ts` must return the actionable candidate values and validated profile timezone through a product DTO. The page continues to receive only the projection and may pass `projection.timezone` to the form; it must not query `profiles` or raw task rows directly.

### 4.8 Likely Phase 2C.1 files

Create:

- `supabase/migrations/202607190032_phase_2c_editable_candidate_confirmation.sql`;
- `supabase/tests/editable_candidate_confirmation.sql`;
- `scripts/remote-editable-candidate-confirmation-smoke.mjs`;
- `src/features/tasks/candidate-edit-contract.ts`;
- `src/features/tasks/candidate-edit-contract.test.ts`;
- `src/features/tasks/candidate-due-date.ts`;
- `src/features/tasks/candidate-due-date.test.ts`;
- `src/features/tasks/candidate-editor.tsx`;
- `src/features/tasks/candidate-editor.test.tsx`;
- `docs/reports/PHASE_2C_SLICE_01_REPORT.md`.

Modify:

- `src/features/tasks/actions.ts` and `actions.test.ts`;
- `src/features/tasks/task-candidate-form.tsx` and `task-candidate-form.test.tsx`;
- `src/features/daily-cycle/contracts.ts`, `review-projection.ts`, and focused tests;
- `src/app/[locale]/app/inbox/[entryId]/page.tsx` and its architecture test only as needed to pass the projection timezone and action;
- `src/features/product-analytics/contracts.ts`, `contracts.test.ts`, `interaction-events.tsx`, and `interaction-events.test.tsx`;
- `src/lib/supabase/database.types.ts` after linked migration application;
- `supabase/tests/candidate_action_consistency.sql` only for legacy-regression assertions, not to replace the new focused file;
- `scripts/remote-supabase-smoke.mjs` only to add the focused 2C aggregate after the dedicated smoke is independently green;
- `e2e/intelligent-capture.spec.ts`;
- `src/app/operations.css` for candidate-editor responsive/error/edited states;
- `package.json` with `test:remote:2c:confirmation` and, at closeout, `test:remote:2c`;
- `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `docs/PHASE_2_PLAN.md`, `docs/DATABASE.md`, and `docs/SECURITY.md` after implementation evidence exists.

No Edge Function file is expected to change.

### 4.9 Test-first execution tasks

#### Task 1 — Authorized preflight and contract RED

- [ ] Obtain explicit authorization to create the Phase 2C implementation branch; create it with the `codex/` prefix only then.
- [ ] Repeat branch/HEAD/worktree/migration-tail checks and read current Next.js forms/Server Action guides.
- [ ] Add failing typed-contract tests for omitted, unchanged, reset, explicit description clear, explicit due clear, empty title, overlong fields, unknown keys, duplicate indices, and edits for unselected candidates.
- [ ] Add failing timezone tests for normal round trip, invalid timezone, DST gap, and DST overlap.
- [ ] Run only the new tests and record the expected missing-contract failures.

#### Task 2 — Database contract RED/GREEN

- [ ] Add failing pgTAP assertions for the exact v2 signature, `SECURITY DEFINER`, empty `search_path`, grants, fingerprint column/check, legacy signature preservation, and no anonymous execute.
- [ ] Add behavioral pgTAP cases for all effective-value, ownership, stale, record-only, replay, mismatch, concurrency, conflict, atomicity, provenance, audit, undo, and unresolved-candidate cases.
- [ ] Confirm `extensions.digest(bytea,text)` exists in the target validation environment; stop for a database design decision if it does not.
- [ ] Implement migration `032` minimally until the focused database contract passes.
- [ ] Run the complete existing candidate/interpretation/Needs Attention pgTAP set to prove legacy behavior is unchanged.
- [ ] Commit the database boundary as `feat(db): add editable candidate confirmation contract` after local review.

#### Task 3 — Authorized linked migration and remote contract

- [ ] Before any remote mutation, report the migration, grant, table-column, RPC, and event-allowlist delta and obtain explicit authorization.
- [ ] Apply the additive migration, verify local/remote migration parity, run linked DB lint, and regenerate `database.types.ts` from the linked schema.
- [ ] Run the dedicated disposable authenticated remote smoke, including two users and race clients, then fail closed on cleanup.
- [ ] Verify the old RPC still works for the old UI after migration deployment.
- [ ] Stop and forward-fix with a new migration if remote behavior differs; never edit the applied migration.

#### Task 4 — Typed server boundary and UI GREEN

- [ ] Implement the command/date utilities until their focused tests pass.
- [ ] Extend review DTO/tests with profile timezone and exact original candidate values.
- [ ] Implement `CandidateEditor` from failing component tests for expand/edit/indicator/reset/selection/keyboard/focus/live-region/mobile semantics.
- [ ] Update `TaskCandidateForm` to own selection/local edits and submit only normalized selected edits.
- [ ] Update `confirmEntryTasks` to call v2, map stable result codes, preserve operation key on retry, revalidate current surfaces, and keep telemetry outside domain authority.
- [ ] Update action/component/architecture tests and run the focused Vitest files.

#### Task 5 — Analytics and convergence

- [ ] Extend the closed product-event contract with `candidate_edit_started`, `candidate_edit_reset`, and bounded edit counts on `task_candidates_confirmed`.
- [ ] Prove title, description, due date, names, field values, and free text are rejected from event payloads.
- [ ] Emit start/reset only from confirmed client interactions and confirmation only after RPC success; make every call fail-open.
- [ ] Test that partial confirmation keeps remaining candidates in review/Needs Attention and that Work renders exact persisted title/description/due date.

#### Task 6 — Complete verification and cutover

- [ ] Extend the authenticated Playwright journey for title-only, all-fields, clear values, partial confirmation, undo, keyboard/focus/live regions, PT-BR/English, desktop/mobile.
- [ ] Use pgTAP/remote smoke for invalid payload, stale, record-only, cross-owner, replay mismatch, concurrent confirmation, correction race, and telemetry failure that UI cannot safely force.
- [ ] Run focused tests, full Vitest, lint, typecheck, production build, offline Playwright, authorized authenticated online Playwright, focused remote smoke, migration/type parity, and cleanup.
- [ ] Switch the UI consumer only after the deployed v2 contract is green; verify no production consumer changed to an unproved RPC.
- [ ] Commit the consumer boundary as `feat(tasks): edit candidates before confirmation`.

#### Task 7 — Report and review

- [ ] Write the Slice 2C.1 report with RED/GREEN evidence, applied migration, generated-type parity, remote cleanup, rollback, limitations, and exact commit SHAs.
- [ ] Update permanent docs only with behavior actually implemented and remotely proved.
- [ ] Run an independent product review and database/security review; fix every critical or important finding before closeout.
- [ ] Search for obsolete v2 placeholders, raw content analytics, accidental draft persistence, excluded fields, and unapproved Edge Function/worker changes.
- [ ] Stop after the slice report and wait for authorization before Phase 2C.2.

### 4.10 Phase 2C.1 test matrix

| Case | Vitest/component | pgTAP | Remote smoke | Playwright |
| --- | --- | --- | --- | --- |
| Edit title only | yes | yes | yes | yes |
| Edit description only | yes | yes | yes | targeted |
| Edit due date only | yes | yes | yes | targeted |
| Edit all fields | yes | yes | yes | yes |
| Confirm without edits | yes | yes | yes | regression |
| Clear description | yes | yes | yes | yes |
| Clear due date | yes | yes | yes | yes |
| Invalid/nonexistent/ambiguous date | yes | yes for invalid ISO | yes | yes for inline feedback |
| Empty title | yes | yes | yes | yes |
| Overlong title/description | yes | yes | yes | targeted |
| Partial selection | yes | yes | yes | yes |
| Edit for unselected candidate | yes | yes | yes | serializer regression |
| Duplicate/out-of-range/unknown field | yes | yes | yes | not required |
| Stale interpretation | action mapping | yes | yes | yes |
| Record-only | action mapping | yes | yes | regression |
| Cross-owner | not trusted to UI | yes | yes | not required |
| Same key/same payload | action mapping | yes | yes | retry regression |
| Same key/different payload | action mapping | yes | yes | targeted conflict copy |
| Concurrent confirmation | not sufficient | yes | yes | not required |
| Correction racing confirmation | not sufficient | yes | yes | not required |
| Different key/already materialized | action mapping | yes | yes | targeted conflict copy |
| Audit/provenance/result values | projection tests | yes | yes | Work assertion |
| Undo | action/component | yes | yes | yes |
| Telemetry failure | action/component | not applicable | product-event smoke | yes |
| Mobile and 44-pixel targets | component/source | not applicable | not applicable | yes |
| Keyboard/focus/live regions | component | not applicable | not applicable | yes |
| PT-BR and English | copy/action/component | not applicable | not applicable | yes |

### 4.11 Deployment, cleanup, rollback, and Definition of Done

Deployment:

1. additive migration and old-RPC regression;
2. generated types and linked contract proof;
3. UI/Action cutover;
4. full local/browser/remote gate;
5. report and permanent docs.

Cleanup requires zero disposable Auth users, entries, interpretations, tasks, audit/undo rows, events, jobs, and storage fixtures created by the smoke. Cleanup failure fails the smoke.

Rollback restores the previous UI/Server Action call to `confirm_entry_task_candidates`; the additive migration and v2 RPC remain dormant. Database correction is forward-only. No destructive down migration is used.

Phase 2C.1 is done only when every PRD requirement assigned to 2C.1 maps to an implementation owner and executed evidence; the linked migration/types agree; old and new contracts coexist; local and authorized remote/browser gates pass; undo and replay are proved; no excluded field is materialized; no content enters analytics; no fixture remains; permanent docs/report are current; independent product and database/security review are clear; and no Phase 2C.2 work has started.

## 5. Phase 2C.2 — Planning, Priority and No-Due Semantics

### User outcome

The user can optionally set a planned date, manual priority, or an intentional absence of due date before confirmation, with unambiguous interaction between those values and Work.

### Included/excluded/dependencies

- Include `planned_at`, `manual_priority`, `intentional_no_due`, `no_due_reason`, and explicitly allowed initial task semantics.
- Exclude relations, dispositions, subtasks, dependencies, split, and merge.
- Depend on a closed, remotely proved Phase 2C.1 v2 command/replay boundary.

### Likely files and contract work

- Add a new append-only migration that versions the RPC again rather than widening v2 in place if old generated clients are deployed.
- Extend `candidate-edit-contract.ts`, `candidate-editor.tsx`, `TaskCandidateForm`, actions, review/Work/Needs Attention projections, generated types, product-event allowlists, focused pgTAP, remote smoke, E2E, and `docs/reports/PHASE_2C_SLICE_02_REPORT.md`.
- Reuse existing `tasks.planned_at`, `manual_priority`, `intentional_no_due`, and `no_due_reason`; do not create a draft table.

### Boundaries, security, idempotency, and analytics

- Server/client command distinguishes omitted, explicit clear, and selected value for every field.
- Database validates priority enum, no-due reason length, mutual consistency of due/no-due, timezone, current interpretation, owner, and replay fingerprint.
- Work projection remains authoritative for planned/due/priority display; lifecycle rules are defined once and tested before UI.
- Analytics contains only bounded booleans/counts, never dates, reasons, or free text.

### Verification, deployment, rollback, documentation, and DoD

- Local: schema/normalizer/editor/action/projection/Work tests plus full gates.
- Database/remote: every null/omitted combination, priority enum, due/no-due contradictions, replay, ownership, concurrency, audit, undo, and exact Work values.
- Playwright: PT-BR/English desktop/mobile, keyboard/focus, planned/due/no-due/priority display.
- Deploy migration before UI cutover; preserve the prior Phase 2C.1 RPC/UI rollback path.
- Clean disposable fixtures; update permanent docs and Slice 2 report only with executed evidence.
- DoD: all semantics are explicit and converged across editor/task/Work/Needs Attention; no relation/disposition/graph field exists.
- Stop before branch creation, remote mutation, or implementation until separately authorized; stop again before Phase 2C.3.

## 6. Phase 2C.3 — Owned Relations

### User outcome

The user can intentionally relate a candidate to owned project, context, person, and waiting-on records before materialization, and the resulting task displays the same owned relations.

### Included/excluded/dependencies

- Include explicit project, context, person, and waiting-on selection using existing domain tables.
- Exclude dispositions, subtasks, dependencies, split, and merge.
- Depend on Phase 2C.1 and the planning semantics selected for Phase 2C.2.

### Likely files and contract work

- Reuse `projects`, `contexts`, `people`, `task_projects`, `task_contexts`, `task_people`, and the existing waiting/task domain representation after verifying its current source of truth.
- Add versioned RPC/migration only if the prior signature cannot evolve compatibly; update generated types, edit contract/editor, owner-scoped relation projection, action, Work/review display, pgTAP, remote smoke, E2E, analytics allowlist, and `docs/reports/PHASE_2C_SLICE_03_REPORT.md`.
- Do not copy every `entry_entities` row to every task; accept only explicit owned IDs selected for that candidate.

### Boundaries, security, idempotency, and analytics

- Server Components load bounded owned relation options through typed projections; Client Components receive IDs/labels only.
- Database validates every `(user_id, entity_id)` relationship and rejects the whole command if one target is missing or cross-owner.
- Canonical relation IDs are sorted into the replay fingerprint; same key/different relation fails.
- Analytics records relation-type counts only, never IDs or names.

### Verification, deployment, rollback, documentation, and DoD

- Local: option projection, selection/reset, action/result, Work/review relation display.
- Database/remote: same-owner success, cross-owner denial per relation type, mixed valid/invalid atomic abort, replay, concurrency, audit, undo cleanup of relation rows.
- Playwright: PT-BR/English desktop/mobile selection, keyboard combobox/listbox behavior, focus/errors, exact post-confirm display.
- Deploy additively before UI cutover; rollback to Phase 2C.2 UI/RPC; forward-fix database defects.
- DoD: no label-based implicit relation, no cross-owner leak, no blanket interpretation linking, exact persisted/displayed relations, clean fixtures/docs/report.
- Stop before implementation authorization and again before Phase 2C.4.

## 7. Phase 2C.4 — Candidate Dispositions

### User outcome

The user can explicitly confirm, reject, retain as record, or dismiss a suggestion so unresolved work is truthful across Needs Attention and review. `Dismiss` is persisted as `dismissed`; there is no separate `cancelled` state.

### Included/excluded/dependencies

- Include exactly four terminal candidate outcomes: `confirmed`, `rejected`, `retained`, and `dismissed`; candidate-scoped historical display; atomic lifecycle projection; and bounded undo through the existing undo architecture.
- `confirmed` keeps using the existing versioned confirmation path and materializes a task with all prior edit/relation guarantees. `rejected`, `retained`, and `dismissed` create no task or other domain object and persist decision/provenance only.
- A candidate is unresolved only until one terminal disposition exists. An entry leaves Needs Attention only when no candidate, blocking clarification question, or other documented blocker remains unresolved.
- Permit only `pending -> confirmed|rejected|retained|dismissed`. Direct terminal-to-terminal transitions, indefinite history editing, and automatic resurfacing are excluded.
- Exclude subtasks, dependencies, split, merge, mandatory reasons, category analytics, temporary snoozing, retained-to-task conversion, new memory/note entities, a global disposition-history page, broad Review redesign, Phase 2C.5, and Product Audit recommendations.
- Depend on current-interpretation provenance and earlier materialization contracts.

### Likely files and contract work

- Prove whether existing task/audit/undo rows can represent non-materializing decisions. If lifecycle needs persisted non-task resolution, add one narrow owner/entry/interpretation/candidate-index resolution table containing only the closed disposition enum, operation provenance, and timestamps — never copied title, description, due date, labels, or candidate text.
- Preserve deployed confirmation RPCs. Add a new versioned confirmation RPC only if persisting `confirmed` cannot be composed safely with the current version, and add a separate closed non-confirming disposition RPC only when that keeps confirmation from being reimplemented or weakened.
- Add generated types, disposition contract/control, review/Needs Attention/Inbox projections, actions, bounded audit/undo evidence, pgTAP, remote smoke, E2E, and `docs/reports/PHASE_2C_SLICE_04_REPORT.md`.
- Never introduce a candidate draft or duplicate candidate content.

### Boundaries, security, idempotency, and analytics

- Decision enum and transitions are closed and database-owned. Identity is the owned current interpretation plus candidate index, never label or candidate text.
- Ownership derives only from `auth.uid()`. Current interpretation, owner, candidate existence, record-only state, conflicting materialization/disposition, canonical replay fingerprint, and undo/compensation are validated atomically for the complete multi-candidate request.
- Additive migrations and versioned RPCs preserve prior signatures. Every new `SECURITY DEFINER` function uses `set search_path = ''`, revokes `public`/`anon`, grants only `authenticated`, and keeps RLS/composite ownership boundaries intact.
- Category analytics are not approved. Emit no disposition category, candidate/entry content or identity, rejection reason, or relation identity/name. Reuse an existing generic event only if it records privacy-safe aggregate counts without revealing the chosen disposition; otherwise add no event. Recheck every candidate/edit-count ceiling touched by the slice.

### Verification, deployment, rollback, documentation, and DoD

- Local: RED/GREEN coverage for the closed disposition contract, lifecycle mapping, concise localized copy/supporting text, accessible controls, action results, historical display, and projection convergence.
- Database/remote: all four dispositions; mixed multi-candidate atomicity; invalid/direct terminal transitions; stale/current interpretation; record-only behavior; cross-owner/anonymous denial; same-payload replay and mismatch; races with confirmation/correction; bounded undo restoring pending without touching unrelated artifacts; and cleanup/pre-existing-data checks.
- Playwright: deterministic authenticated journeys across PT-BR/English desktop and Pixel 7 mobile, keyboard/focus/live regions, historical outcome labels, Work-only-for-confirmed behavior, persistence after refresh, and exact Needs Attention removal/reappearance rules.
- Additive deployment; old projections ignore new rows safely; UI rollback does not delete resolution history.
- Rollback preserves every earlier RPC/UI path. Non-confirming undo removes only its disposition state; confirmed undo preserves the already-documented task cancellation semantics. If the existing undo system cannot support non-confirming dispositions without a new cross-cutting architecture, stop before creating a separate undo system and document the exact incompatibility.
- DoD: one explicit terminal resolution per current candidate, no content duplication/category analytics, truthful daily surfaces and history, Work containing confirmed tasks only, clean fixtures/docs/report, and all earlier slice guarantees still green.
- Stop before implementation authorization and again before Phase 2C.5.

## 8. Phase 2C.5 — Subtasks, Dependencies and Split/Merge

### User outcome

The user can materialize a reviewed task graph — including parents, dependencies, and intentionally split or merged suggestions — without partial graphs, cross-owner edges, or cycles.

### Included/excluded/dependencies

- Include `parent_task_id`, `task_dependencies`, selected-candidate references, subtasks, dependencies, and isolated split/merge commands.
- Keep split/merge as an isolated epic inside the slice and independently reviewable/reversible; it must not retroactively block or redefine Slices 2C.1–2C.4.
- Depend on explicit core fields, planning semantics, relations, and dispositions.

### Likely files and contract work

- Reuse `tasks.parent_task_id` and `task_dependencies`; add only constraints/indexes/RPC versions needed for atomic graph materialization and cycle safety.
- Add dedicated graph command/schema modules and components rather than expanding `candidate-editor.tsx` into a monolith.
- Update generated types, task graph projections, actions, audit/undo, pgTAP, remote smoke, Playwright, product-event counts, and `docs/reports/PHASE_2C_SLICE_05_REPORT.md`.

### Boundaries, security, idempotency, and analytics

- References identify selected candidate indices or owned persisted task IDs through a closed discriminated union.
- Database resolves all candidate references before writes, validates same owner, rejects self/cycles/missing targets, inserts tasks and edges atomically, and fingerprints the canonical graph.
- Undo cancels created tasks and removes/compensates edges without touching pre-existing unrelated tasks.
- Analytics contains graph counts only, never titles, edge labels, or IDs.

### Verification, deployment, rollback, documentation, and DoD

- Local: graph normalizer, editor isolation, cycle feedback, projections, action results.
- Database/remote: valid tree/DAG, self-cycle, indirect cycle, missing/unselected/cross-owner reference, replay/mismatch, concurrent graph confirmation, partial-write denial, audit/undo.
- Playwright: create subtask/dependency/split/merge across PT-BR/English desktop/mobile with keyboard/focus/live regions.
- Additive deployment and prior-RPC rollback; split/merge consumer can be disabled independently from basic graph materialization.
- DoD: every graph is atomic, owner-safe, cycle-safe, replay-safe, independently reversible, cleanly documented, and earlier slices still pass unchanged.
- Stop before implementation authorization and again before Phase 2C.6.

## 9. Phase 2C.6 — Product Convergence and Closeout

### User outcome

Editable candidates and every later Phase 2C decision behave consistently in Needs Attention, entry review, Caixa, and Work, with complete privacy-safe observability and trustworthy release evidence.

### Included/excluded/dependencies

- Include convergence, cleanup, accessibility, localization, analytics, remote aggregate, traceability, reports, and closeout.
- Exclude new task-domain capability, Phase 2D questions, Phase 2E NLP updates, integrations, and launch-only Phase 2F work.
- Depend on accepted reports and green gates for Slices 2C.1–2C.5.

### Likely files and contract work

- Update daily-cycle projections/components only where cross-surface drift is found; add no new lifecycle source.
- Create `scripts/generate-phase-2c-traceability.mjs`, `scripts/verify-phase-2c-cleanup.mjs`, `docs/reports/PHASE_2C_TRACEABILITY_MATRIX.md`, `docs/reports/PHASE_2C_SLICE_06_REPORT.md`, and `docs/PHASE_2C_REPORT.md` if the established Phase 2X closeout pattern remains current.
- Add a fail-fast `test:remote:2c` aggregate after every focused smoke is independently green.
- Update permanent current-state/architecture/database/security docs only with deployed, verified behavior; never rewrite historical Phase 2X evidence.

### Boundaries, security, idempotency, and analytics

- Audit all four daily surfaces for raw rows, duplicate lifecycle rules, raw enums/confidence, unbounded reads, content analytics, and inconsistent task values.
- Re-run RLS/grants/ownership/replay/concurrency/undo/cleanup coverage across every Phase 2C RPC version.
- Produce privacy-safe internal event queries only; no dashboard or lifecycle dependency.

### Verification, deployment, rollback, documentation, and DoD

- Local: full Vitest, lint, typecheck, build, architecture guardrails, traceability generation.
- Database/remote: migration/type parity, linked lint, every focused smoke, fail-fast aggregate, final fail-closed cleanup.
- Playwright: complete authenticated daily journey in PT-BR/English on desktop/mobile, including accessibility and all Phase 2C branches.
- Deployment is evidence/closeout only unless a separately reviewed defect requires a corrective slice. Never hide a product defect inside documentation.
- Rollback references every deployed migration/RPC/UI boundary and preserves forward-only database correction.
- DoD: every PRD requirement has code and executed evidence; current docs/report agree; no disposable fixture remains; independent product and database/security reviews are clear; no Phase 2D/2E capability is present; Phase 2C is explicitly closed.
- Stop before closeout implementation authorization and, after closeout, wait for separate Phase 2D authorization.

## 10. Cross-slice verification commands

Run only commands applicable to the authorized slice and never execute remote commands during this planning task.

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Database/linked gates after explicit remote authorization:

```powershell
npx supabase migration list --linked
npx supabase db lint --linked --level error
npm run test:remote:2c:confirmation
npm run test:remote:2c
```

Focused Vitest and Playwright commands must name the touched test files/projects so RED/GREEN evidence is attributable before the full suites run. Remote smokes must create unique disposable users/data, never claim the shared global queue, and make cleanup failure fatal.

## 11. Traceability ownership

| PRD family | Primary slices | Evidence owners |
| --- | --- | --- |
| `2C-EDIT`, `2C-CONFIRM` | 2C.1; extended by 2C.2/2C.3 | command/editor/action tests, v2+ RPC contracts, remote smoke, E2E |
| `2C-PROVENANCE`, `2C-IDEMPOTENCY`, `2C-OWNERSHIP`, `2C-UNDO` | every database-bearing slice | pgTAP, remote race/denial/replay/undo, audit queries |
| `2C-RELATIONS` | 2C.3 | owned relation projection, database denial, remote smoke, Work/review E2E |
| `2C-DISPOSITION` | 2C.4 | lifecycle projection, resolution RPC, race/undo, Needs Attention E2E |
| `2C-STRUCTURE` | 2C.5 | graph normalizer, cycle/ownership pgTAP, remote graph smoke, E2E |
| `2C-UX`, `2C-I18N`, `2C-A11Y` | every slice; aggregate in 2C.6 | component tests, copy tests, desktop/mobile Playwright |
| `2C-ANALYTICS` | 2C.1–2C.6 | allowlist tests, fail-open action/worker tests, remote event smoke |
| `2C-OPERATIONS` | every slice; closeout in 2C.6 | migration/types, linked lint, cleanup, reports, traceability |

## 12. Planning review checklist

- [x] Current code, migrations, generated types, docs, pgTAP, remote smoke, and Playwright structure were inspected before fixing the design.
- [x] Phase 2C.1 contains only title, description, and due date.
- [x] No persistent draft, autosave, offline editor, new queue, worker, scheduler, provider, or Edge Function is proposed for 2C.1.
- [x] The legacy RPC remains unchanged during rollout; the exact v2 name/signature is defined.
- [x] Omitted, unchanged, reset, explicit clear, invalid field, and unselected-edit semantics are distinct.
- [x] Same-key/same-payload replay and same-key/different-payload rejection are explicit.
- [x] Atomic transaction contents, ownership, current interpretation, record-only, concurrency, audit, undo, and telemetry order are explicit.
- [x] Legacy hidden waiting/parent/relation effects are excluded from the new 2C.1 RPC.
- [x] Split/merge remains isolated in 2C.5 and cannot block earlier value.
- [x] Each slice documents outcome, scope, dependencies, files, database/types, boundaries, security/idempotency, analytics, tests, deployment, cleanup, rollback, docs, DoD, and authorization stop.
- [x] Remote mutation, feature branch creation, implementation, push, and PR remain unauthorized by this planning document.
