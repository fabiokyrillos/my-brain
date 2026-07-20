# Phase 2C Slice 01 — Integration GREEN

Date: 2026-07-19

Branch: `codex/phase-2c-editable-candidate-tasks`

Starting commit: `7e30e8fb463abb3c1a4db9c67687f722dbb499bf` (`feat(tasks): implement editable candidate editor`)

## Outcome

Phase 2C.1D is GREEN. The production interpretation-review flow now mounts the existing `CandidateEditor`, aggregates selected candidate edits through the shared TypeScript contract, revalidates the complete request in a Server Action, and confirms through `confirm_entry_task_candidates_v2`.

The feature is operational in the linked development environment. No deployment to a separate production hosting environment was performed or claimed.

No migration, database schema, dependency, or generated database-type change was made in this slice.

## Files changed

- `src/app/[locale]/app/inbox/[entryId]/page.tsx`
- `src/app/[locale]/app/inbox/[entryId]/page.architecture.test.ts`
- `src/features/daily-cycle/review-projection.ts`
- `src/features/daily-cycle/review-projection.test.ts`
- `src/features/tasks/task-candidate-form.tsx`
- `src/features/tasks/task-candidate-form.test.tsx`
- `src/features/tasks/candidate-editor.tsx`
- `src/features/tasks/candidate-edit-contract.ts`
- `src/features/tasks/actions.ts`
- `src/features/tasks/actions.test.ts`
- `e2e/editable-candidate-confirmation.spec.ts`
- `scripts/remote-editable-candidate-confirmation-smoke.mjs`
- `docs/reports/PHASE_2C_SLICE_01_INTEGRATION_GREEN.md`

## Production flow

### Previous flow

`EntryDetailPage`
→ `TaskCandidateForm` selection state
→ `confirmEntryTasks`
→ legacy `confirm_entry_task_candidates`
→ product event and route revalidation
→ localized success with the shared undo action

Candidate suggestions were selectable but the isolated editor was not mounted. The review projection also did not provide the authenticated profile timezone to the confirmation form.

### New flow

`EntryDetailPage` and `loadEntryReviewProjection`
→ actionable task candidates plus validated profile timezone
→ existing `TaskCandidateForm` selection state and one stable `CandidateEditor` per actionable candidate
→ immutable edit map and selected-index set
→ `normalizeCandidateEdits`
→ `serializeCandidateEdits`
→ `confirmEntryTasks` strict server revalidation
→ typed `confirm_entry_task_candidates_v2`
→ safe action result, first-execution product event, route revalidation, and shared undo

## Client/server boundary

The page remains a Server Component. Only the existing candidate form and editors are client components. They do not import Supabase or server-only APIs and do not query the DOM to construct edits.

The client owns only presentation state: selection, immutable edit commands, invalid editor indexes, payload signature, and the opaque operation key. Authentication, authorization, payload revalidation, RPC invocation, result interpretation, analytics scheduling, and cache invalidation remain server-side.

Ownership is never accepted from the form. The Server Action obtains the authenticated user through the server Supabase client, while the RPC derives ownership from `auth.uid()`.

## CandidateEditor mounting and state

- Editors are mounted only for `view.actionableCandidates`, the existing task-candidate projection.
- Record-only and no-action branches continue to render their existing non-editable states.
- Candidate order and React keys remain the stable projected candidate order/key.
- Every editor receives the resolved locale and explicit authenticated profile timezone.
- Invalid or missing profile timezone values fall back to the existing profile default, `America/Sao_Paulo`.
- Deselecting a candidate disables its editor and excludes its edit from submission without deleting the local draft.
- Reselecting restores the retained draft.
- Pending submission disables selection, editor controls, and submit without remounting editors or clearing recoverable state.
- `CandidateEditor` reports validity through a deduplicated optional callback; no callback loop or shared mutable store was introduced.

## Edit aggregation and canonical payload

The form stores edits in an immutable `ReadonlyMap<number, CandidateEditCommand>` and invalid indexes in an immutable `ReadonlySet<number>`. At submission it:

1. sorts the currently selected indexes in ascending order;
2. rejects an empty selection or invalid selected editor;
3. excludes edits for deselected candidates;
4. normalizes against the immutable projected suggestions with `normalizeCandidateEdits`;
5. eliminates unchanged fields and unchanged edit objects;
6. serializes with `serializeCandidateEdits`, preserving canonical candidate and field order and enforcing the shared UTF-8 byte limit;
7. overwrites any injected `candidateIndex`, `candidateEdits`, `operationKey`, or locale form value with the controlled submission state.

The submitted semantic payload is:

- `entryId`: UUID;
- `interpretationId`: UUID;
- `candidateIndex`: one canonical decimal form value per selected candidate;
- `candidateEdits`: canonical JSON array, including `[]` for a no-edit confirmation;
- `operationKey`: opaque UUID;
- `locale`: `pt-BR` or `en`, used only for localized feedback.

Explicit `null` is preserved for description and due-date clears. Unknown edit/change keys are rejected by strict schemas.

## Idempotency lifecycle

- The page supplies the first opaque UUID; it contains no PII.
- A semantic payload signature is derived from sorted selected indexes and canonical serialized edits.
- The same payload retry or React resubmission keeps the same key.
- A material payload change after an attempted submission rotates the key with browser `crypto.randomUUID()`.
- A successful terminal result rotates and clears the attempted signature.
- Errors do not silently switch keys, so an idempotency mismatch cannot be bypassed automatically.
- The database remains authoritative for request fingerprint matching and replay.
- An idempotent RPC replay returns the same success/undo result and does not emit a duplicate confirmation product event.

## Server Action validation

Before the RPC, `confirmEntryTasks` validates:

- locale against a closed enum;
- authenticated server session;
- entry, interpretation, and operation identifiers as UUIDs;
- selected indexes as canonical non-negative decimal strings;
- safe-integer conversion;
- the exact shared selected-index minimum, maximum, and uniqueness constraints;
- `candidateEdits` as valid JSON;
- edits through the shared closed `candidateEditArraySchema`;
- edited-index uniqueness and edit count;
- every edit index belonging to the selected set;
- canonical serialization and the shared UTF-8 payload byte limit.

The action does not accept a user/owner ID, task IDs, undo ID, audit ID, request fingerprint, materialized state, or candidate content as authorization evidence. Malformed requests are rejected before Supabase/RPC work.

## RPC mapping

The production action calls only:

`confirm_entry_task_candidates_v2`

with the generated argument names:

- `p_entry_id` ← validated entry UUID;
- `p_expected_interpretation_id` ← validated interpretation UUID;
- `p_candidate_indexes` ← sorted validated indexes;
- `p_candidate_edits` ← parsed canonical JSON;
- `p_operation_key` ← validated UUID.

There is no editable-flow fallback to the legacy RPC and no client-provided user ID.

The successful JSON result is closed over the required `task_ids`, UUID `undo_id`, and boolean `idempotent`. Invalid result shapes become a generic retryable failure.

## Stable result and error mapping

Success returns localized copy, the existing safe undo ID, machine code `confirmed`, and the replay flag. Raw task IDs are not added to the client action state.

Approved mappings are:

| Database/action condition | Machine code | User behavior |
| --- | --- | --- |
| malformed local/server payload | `validation_failed` or `invalid_payload` | localized review message |
| missing authenticated session | `unauthenticated` | localized sign-in message |
| exact stale interpretation token | `stale_interpretation` | localized refresh guidance |
| exact correction guard token | `confirmation_contended` | localized refresh guidance |
| exact fingerprint mismatch detail | `idempotency_mismatch` | stable mismatch guidance |
| exact already-materialized detail | `already_materialized` | stable refresh guidance |
| exact record-only token | `record_only` | localized non-actionable message |
| exact not-found token | `not_found` | localized safe not-found message |
| unexpected database/result/network failure | `operation_failed` | generic localized retryable message |

Only the approved Phase 2C messages distinguish the two `55P03` outcomes. Arbitrary PostgreSQL messages, details, hints, function names, and stack data are never returned to the user.

## Success, refresh, analytics, and undo

First execution and replay both return the existing success/undo experience and revalidate PT-BR and English task, work, inbox, and current entry surfaces.

The existing `task_candidates_confirmed` product event is scheduled only for a first execution, with a content-free candidate count and a stable event idempotency key. Replay skips a duplicate event.

The shared undo action remains authenticated and localized. It revalidates task, work, and inbox surfaces. Linked UI smoke proved the created tasks transition from `inbox` to `cancelled` through the real undo control.

## Record-only, Needs Attention, and legacy behavior

- Record-only interpretations do not expose actionable candidates or mount editors.
- The existing correction and no-action branches remain unchanged.
- Partial confirmation keeps the entry in Needs Attention while unconfirmed candidates remain.
- Completing the remaining candidate removes that confirmation reason.
- Undo reopens the correction path as guaranteed by the database contract.
- The legacy RPC and its existing `remote-daily-cycle-smoke.mjs` consumers remain intact. Only the production editable confirmation action moved to v2.
- Undo-operation discovery continues to recognize the existing confirmation action type stored by the database.

## Localization and accessibility

PT-BR and English copy cover validation, authentication, stale state, contention, mismatch, already materialized, record-only, not found, generic failure, success, pending state, and undo.

The existing editor labels, descriptions, validation alerts, 44-pixel controls, keyboard-native inputs/buttons, and live reset announcement remain intact. Integration adds:

- form `aria-busy` during submission;
- an inline `role="alert"` associated with the form through `aria-describedby`;
- announced success through `role="status"`;
- disabled selection, editor, submit, and undo controls while their actions are pending;
- explicit `type="button"` on editor edit/reset/clear controls, preventing accidental confirmation submit.

## Test evidence

### Integration RED baseline

Before production implementation, the four integration files demonstrated the gap with 39 failing and 26 passing tests (65 total).

### Focused GREEN

Command covered the edit contract, due-date contract, isolated editor, production form integration, Server Action, review projection, and entry-page architecture:

- Test files: **7 passed / 7**
- Tests: **171 passed / 171**

The production integration subset is **65 passed / 65** across the form, action, review-projection, and page-architecture files.

### Full repository GREEN

- Test files: **83 passed / 83**
- Tests: **579 passed / 579**
- No intentional Phase 2C.1D RED remains.

### Static and production checks

- `npm run lint`: passed with no warning or error.
- `npm run typecheck`: passed.
- `npm run build`: passed with Next.js 16.2.10; compilation, TypeScript, static page generation, and route finalization completed.
- `git diff --check`: passed; only Git's existing Windows LF/CRLF notices were emitted.

## Linked remote integration smoke

`scripts/remote-editable-candidate-confirmation-smoke.mjs` passed **13 linked scenarios** using one uniquely prefixed disposable authenticated user:

1. no edit;
2. title edit;
3. description clear;
4. due-date edit;
5. multiple selected candidates with partial edits;
6. same-key replay with the same task IDs;
7. same-key changed-payload mismatch;
8. stale interpretation;
9. correction contention;
10. undo;
11. post-undo correction;
12. partial and complete Needs Attention projection;
13. effective task values, immutable candidates, and content-safe audit evidence.

Final linked result: `status: passed`, `cases: 13`.

The authenticated Playwright smoke also passed **1/1** on the desktop project through the actual application path. It verified production login, profile timezone propagation (`America/New_York`), two mounted editors, title/due-date editing, explicit description clear, the real Server Action, v2 materialization, canonical audit fields without candidate-content leakage, operation fingerprinting, immutable interpretation candidates, first-execution analytics, localized success, and UI undo.

## Cleanup and pre-existing-data proof

The final direct linked run used prefix `phase-2c-integration-1784513814096-be152e63` and reported:

- remaining prefixed Auth users: **0**;
- remaining prefixed entries: **0**;
- Auth users preserved: **true**;
- table counts preserved: **true**.

The verified pre-existing baseline and final counts were unchanged:

| Resource | Count |
| --- | ---: |
| Auth users | 2 |
| profiles | 2 |
| entries | 2 |
| entry_interpretations | 2 |
| tasks | 3 |
| undo_operations | 1 |
| audit_logs | 6 |
| pending_questions | 0 |
| jobs | 0 |

The Playwright smoke deletes its disposable Auth user in `afterAll`, verifies the user is absent, and verifies no private product-event rows remain visible to its former owner token. Its cleanup ID is captured immediately after user creation so partial setup failures are also recoverable.

## Independent review findings

### Next.js Server Action

GREEN. All untrusted inputs are revalidated, authentication is server-derived, the generated typed v2 RPC is the only production confirmation call, result/error states are stable and safe, and affected routes are revalidated. The implementation follows the repository's Next.js 16 Server Action and `after` patterns.

### React integration

GREEN. The client boundary remains narrow; editor keys are stable; candidate props are not mutated; edit maps/sets use copy-on-write updates; selection and canonical aggregation cannot submit deselected edits; pending state prevents double clicks; recoverable failures retain drafts; callbacks deduplicate emissions and do not loop.

### Authentication and authorization

GREEN. No form ownership field is accepted, no service-role client is used by the production action, normal confirmation uses the authenticated server session, and database RLS/RPC ownership remains authoritative. Service-role credentials appear only as runtime environment input to disposable remote test infrastructure and are not hardcoded.

### Idempotency and deterministic serialization

GREEN. Same semantic attempts retain a key, changed attempts rotate it, successful replay is one semantic result, mismatch is surfaced rather than bypassed, selected indexes and edits are sorted, change fields use canonical order, unchanged fields are eliminated, and the shared UTF-8 limit is enforced on client and server.

### Accessibility

GREEN. Native controls and labels remain keyboard-operable, status/error announcements are present, errors are associated with the form, editor buttons cannot submit the parent form, and pending controls are disabled consistently.

### Regression and privacy

GREEN. Full-suite, build, direct linked, and real application smoke checks passed. Record-only, correction, undo, Needs Attention, localization, and legacy test consumers remain intact. Audit and analytics assertions confirm no candidate description/content leakage. No critical or important finding remains.

## Remaining Phase 2C work

Exact next task:

> perform the Phase 2C.1 final acceptance review, UX smoke, documentation closeout, and branch readiness assessment.

This slice stops here. It does not push, open a PR, deploy, edit already-created tasks, add scheduling, redesign analytics, or modify the database contract.
