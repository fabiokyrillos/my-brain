# Phase 2C PRD — Editable Candidate Tasks and Transactional Materialization

## 1. Document metadata

| Field | Value |
| --- | --- |
| Phase identifier | Phase 2C |
| Title | Editable Candidate Tasks and Transactional Materialization |
| Status | Approved product scope; implementation not started |
| Date | 2026-07-19 |
| Predecessor | Phase 2X — Daily Product Convergence, complete through Slice 2X.18 |
| Governing roadmap | [`PHASE_2_PLAN.md`](./PHASE_2_PLAN.md) |
| Owner | My Brain Product and Engineering |
| Implementation status | Planned only; no Phase 2C code, migration, deployment, or remote mutation exists |
| Canonical implementation plan | [`PHASE_2C_IMPLEMENTATION_PLAN.md`](./PHASE_2C_IMPLEMENTATION_PLAN.md) |

Source of truth, in order: current application code; applied and local Supabase migrations; generated database types; permanent current-state documentation; this PRD and its implementation plan. Historical Phase 2X plans and reports remain evidence of their own delivery and must not override the current implementation.

## 2. Executive summary

My Brain already turns an interpretation's task suggestions into real tasks, but confirmation accepts the AI suggestion exactly as stored. A useful suggestion can therefore be almost right and still require the user to create it and edit it later, or decline to materialize it at all. That weakens trust at the moment where an AI proposal becomes durable work.

Phase 2C adds an explicit edit-before-commit boundary. The user may correct a selected suggestion, inspect what changed, and confirm only the candidates they want. The immutable interpretation remains evidence of what the AI proposed; transient form edits are command input; the resulting task is the only persistent edited truth. This separation preserves provenance without creating a second draft system.

Phase 2C follows Phase 2X because Phase 2X established the stable daily-cycle projections, current-interpretation binding, candidate-level provenance, Needs Attention, Work, audit/undo, and fail-open product-event boundary that an editor can now safely extend. The phase must build on those boundaries rather than recreate them.

The first delivery, Phase 2C.1, is intentionally narrow: title, description, and due date only. Planning semantics, priority, relations, dispositions, and graph operations remain later, independently reviewable slices.

## 3. Current baseline

### 3.1 Implemented foundation to preserve

- `entry_interpretations.task_candidates` stores immutable AI-generated task suggestions inside an immutable interpretation revision.
- `entries.current_interpretation_id` selects the owned current revision; stale confirmation is rejected.
- `src/features/daily-cycle/review-projection.ts` maps current, still-actionable candidates into `ActionableCandidateView` DTOs without exposing confidence in the primary flow.
- `TaskCandidateForm` selects all actionable candidates by default and supports selective confirmation.
- `confirm_entry_task_candidates(uuid, uuid, integer[], text)` validates the authenticated owner, current interpretation, candidate existence, record-only status, and operation-key replay before materializing tasks.
- Confirmed tasks carry `source_entry_id`, `source_interpretation_id`, `candidate_index`, and `operation_key` provenance.
- Confirmation, audit evidence, undo registration, and task materialization occur in one PostgreSQL transaction.
- The current compensating undo model cancels materialized tasks and records an immutable audit event; it does not delete task history.
- Partial confirmation leaves remaining candidate indices actionable. Needs Attention and the entry review derive this state from current-interpretation candidate provenance.
- Work reads persisted task values through an owner-scoped projection and profile-timezone semantics.
- `task_candidates_confirmed` and the existing daily-cycle product events use a private allowlisted ledger; telemetry failure is fail-open and never controls lifecycle.
- pgTAP contracts, disposable linked remote smokes, and authenticated desktop/mobile Playwright journeys already exercise current interpretation, record-only, cross-owner, concurrency, undo, and daily-cycle behavior.

### 3.2 Capabilities that do not exist

- No editable candidate command or edited-candidate RPC payload exists.
- No candidate edit survives navigation, reload, or a new session.
- No candidate-draft table, autosave, offline draft, or second task source of truth exists.
- No candidate disposition model records reject, retain-as-record, dismiss, or cancel decisions.
- No candidate editor can choose owned project, context, person, or waiting-on relations.
- No candidate editor can create subtasks, dependencies, split candidates, or merge candidates.
- The current operation-key replay does not compare an exact canonical request fingerprint; a new edited contract must close that mismatch case.
- The current legacy RPC can materialize `waitingOn`, `parentIndex`, and interpretation-wide entity links from the immutable suggestion. Phase 2C.1 must not expose or silently expand those excluded semantics in its new contract.

## 4. Product principles

1. **Edit before commitment.** The user controls the exact durable task values before materialization.
2. **Immutable suggestion provenance.** Editing never rewrites `entry_interpretations.task_candidates` or provider output.
3. **One materialized task source of truth.** After confirmation, `tasks` is authoritative for edited task values.
4. **No second draft source of truth.** Unconfirmed edits exist only in the current form state.
5. **Owner-scoped access.** Authentication, ownership, RLS, and owned foreign relationships are enforced server-side and in PostgreSQL.
6. **Atomic materialization.** Task creation, provenance, lifecycle effects, audit, and undo registration succeed or fail together.
7. **Deterministic idempotency.** The same owner/key/canonical payload replays the same result; the same key with a different canonical payload fails.
8. **No partial writes.** Invalid or conflicting input creates no task, audit row, undo row, or lifecycle change.
9. **Progressive complexity.** Core fields land before planning semantics, relations, dispositions, and graph operations.
10. **Analytics never controls lifecycle.** Product events observe a persisted outcome or a confirmed interaction and remain fail-open.
11. **Mobile, accessibility, and localization from the beginning.** Every slice includes PT-BR/English, keyboard, focus, live-region, desktop, and mobile gates.

## 5. Personas and jobs to be done

| Persona situation | Job to be done | Expected result |
| --- | --- | --- |
| AI title is close but imprecise | Correct the title before creating the task | Work displays the corrected title; the interpretation still shows the original suggestion as provenance |
| Suggestion lacks useful context | Add or clear a description before confirmation | The exact confirmed description, including an intentional empty value, persists on the task |
| Suggested deadline is wrong | Adjust or clear the due date in the user's configured timezone | The task stores the intended instant or `null`, with no timezone ambiguity |
| Only some suggestions are useful | Select and confirm a subset | Only selected candidates materialize; unresolved candidates remain actionable |
| User leaves without committing | Navigate away from an edited form | Edits are discarded; no draft row or hidden mutation exists |
| User returns later | Revisit the interpretation | The original immutable suggestion is shown; abandoned edits do not reappear |
| User made a wrong commitment | Undo the materialization | Created tasks are cancelled through the existing compensating model and the action is audited |

## 6. Scope by epic

### Epic 2C-A — Editable core confirmation

Edit title, description, and due date in transient form state; selectively confirm through a strict, versioned transactional database contract; preserve provenance, idempotency, audit, undo, Needs Attention, and Work convergence.

### Epic 2C-B — Planning, priority, and no-due semantics

Add explicit planned date, manual priority, intentional-no-due, no-due reason, and the allowed initial task semantics without changing the meaning of Phase 2C.1.

### Epic 2C-C — Owned relations

Allow explicit project, context, person, and waiting-on choices using existing owned domain tables and database-validated same-owner relations.

### Epic 2C-D — Candidate dispositions

Model confirm, reject, retain as record, and dismiss/cancel-suggestion outcomes without copying the immutable candidate into a draft table.

### Epic 2C-E — Structure and graph materialization

Add subtasks, dependencies, and isolated split/merge workflows with selected-candidate references, ownership checks, cycle prevention, and one atomic graph transaction.

### Epic 2C-F — Product convergence and closeout

Reconcile Needs Attention, review, Caixa, Work, analytics, accessibility, localization, remote evidence, traceability, reports, cleanup, and permanent documentation across all preceding slices.

## 7. Explicit non-goals

Phase 2C does not implement:

- conversational effects for pending questions;
- natural-language updates to existing tasks;
- onboarding;
- scheduled reviews;
- push, WhatsApp, Gmail, or other new channel integrations;
- an analytics dashboard or aggregation service;
- a new queue, worker, scheduler, command bus, or provider;
- persistent candidate drafts, autosave, or offline candidate editing;
- a backend rewrite, generic workflow platform, or second task workflow;
- confidence scores in the primary candidate-editing flow.

Phase 2C.1 additionally excludes planned date, manual priority, status selection, intentional-no-due metadata, project, context, person, waiting-on, subtasks, dependencies, split, merge, and every rejection/disposition flow.

## 8. Functional requirements

Every requirement below is independently testable.

### 8.1 Editing — `2C-EDIT`

- **2C-EDIT-001:** An actionable current candidate can enter edit mode without a database mutation.
- **2C-EDIT-002:** The editor initializes title, description, and due date from the immutable current candidate.
- **2C-EDIT-003:** A changed field is visibly identified and can be reset to the exact suggestion value.
- **2C-EDIT-004:** A reset field is omitted from the edited command rather than copied as a new value.
- **2C-EDIT-005:** Navigating away, reloading, or revisiting discards every unconfirmed edit.
- **2C-EDIT-006:** Unselecting a candidate may retain its edits only in the current component state; the submitted command omits those edits.
- **2C-EDIT-007:** Title is trimmed, required, and limited to 240 characters; description is limited to 2,000 characters.
- **2C-EDIT-008:** Due-date input identifies the profile timezone and cannot silently use a different timezone.

### 8.2 Confirmation — `2C-CONFIRM`

- **2C-CONFIRM-001:** Confirmation sends entry ID, current interpretation ID, selected candidate indices, a bounded edit list, and one operation key.
- **2C-CONFIRM-002:** Only selected candidate indices can be materialized.
- **2C-CONFIRM-003:** A selected candidate without an edited field uses the immutable candidate's original value for that field.
- **2C-CONFIRM-004:** An empty or whitespace-only edited description is normalized to an intentional clear and persists as `tasks.description = null`.
- **2C-CONFIRM-005:** An explicitly cleared due date persists as `tasks.due_at = null`; an omitted due-date edit preserves the suggestion value.
- **2C-CONFIRM-006:** Invalid, nonexistent, or DST-ambiguous local dates fail before any mutation and identify the due-date field.
- **2C-CONFIRM-007:** An empty title, unknown field, duplicate index, edit for an unselected candidate, or out-of-range index fails atomically.
- **2C-CONFIRM-008:** Phase 2C.1 creates an initial `inbox` task and does not copy `waitingOn`, `parentIndex`, project, context, person, or dependency effects from the suggestion.
- **2C-CONFIRM-009:** Partial confirmation leaves every unselected and unmaterialized current candidate unresolved and actionable.
- **2C-CONFIRM-010:** Work displays the exact persisted title, description, and due date returned by the successful transaction.
- **2C-CONFIRM-011:** A stale interpretation or record-only interpretation fails with no partial write and an actionable localized conflict message.
- **2C-CONFIRM-012:** A telemetry failure cannot change a successful confirmation result or rollback persisted domain data.
- **2C-CONFIRM-013:** Materialized task provenance is the persisted candidate-resolution fact; review and Needs Attention derive lifecycle from those atomic task rows, with no second mutable candidate-status write.

### 8.3 Provenance — `2C-PROVENANCE`

- **2C-PROVENANCE-001:** Editing never updates the interpretation row or candidate JSON.
- **2C-PROVENANCE-002:** Every created task retains entry ID, interpretation ID, candidate index, creator, and operation key.
- **2C-PROVENANCE-003:** Audit evidence identifies selected indices, edited field names, effective-value fingerprint, and created task IDs without becoming task truth.
- **2C-PROVENANCE-004:** The entry review can distinguish original suggestion values from persisted materialized values without exposing raw database rows to the component.

### 8.4 Idempotency — `2C-IDEMPOTENCY`

- **2C-IDEMPOTENCY-001:** The server and database derive the fingerprint from a canonical owner-independent payload order.
- **2C-IDEMPOTENCY-002:** Replaying the same operation key with the same canonical payload returns the original task IDs and undo ID.
- **2C-IDEMPOTENCY-003:** Reusing the operation key with a different entry, interpretation, selection, or edit payload fails deterministically.
- **2C-IDEMPOTENCY-004:** Two concurrent requests cannot create duplicate tasks for one interpretation/candidate index.
- **2C-IDEMPOTENCY-005:** A different operation key targeting an already materialized candidate reports a conflict and never overwrites the first task.

### 8.5 Ownership and security — `2C-OWNERSHIP`

- **2C-OWNERSHIP-001:** The authenticated owner is derived from `auth.uid()`; no client-controlled owner ID is accepted.
- **2C-OWNERSHIP-002:** Entry, interpretation, candidate, created task, undo row, audit row, and later relation targets must belong to the same owner.
- **2C-OWNERSHIP-003:** Anonymous and cross-owner calls are denied without revealing whether another owner's entry, interpretation, candidate, or relation exists.
- **2C-OWNERSHIP-004:** The RPC accepts a closed JSON shape and rejects unknown keys at every object level.
- **2C-OWNERSHIP-005:** The RPC uses a safe explicit `search_path`, least-privilege grants, no dynamic SQL, and no arbitrary client-supplied task object.

### 8.6 Undo — `2C-UNDO`

- **2C-UNDO-001:** A successful first materialization creates one available undo operation in the same transaction.
- **2C-UNDO-002:** Undo cancels exactly the tasks created by that operation, records immutable audit evidence, and is idempotent.
- **2C-UNDO-003:** Undo never rewrites the immutable suggestion and never resurrects or edits a later task.
- **2C-UNDO-004:** The existing `undo_operation` SQLSTATE `40001` risk is investigated and resolved or explicitly proven safe before Phase 2C.1 remote acceptance.

### 8.7 Later owned relations — `2C-RELATIONS`

- **2C-RELATIONS-001:** Relation editing is unavailable in Phase 2C.1.
- **2C-RELATIONS-002:** Phase 2C.3 reuses existing project, context, person, task-person, task-project, and task-context tables.
- **2C-RELATIONS-003:** A relation target is resolved by owned ID, never by an unvalidated display label.
- **2C-RELATIONS-004:** One invalid or cross-owner relation aborts the whole materialization transaction.

### 8.8 Later dispositions — `2C-DISPOSITION`

- **2C-DISPOSITION-001:** Disposition controls are unavailable in Phase 2C.1.
- **2C-DISPOSITION-002:** Phase 2C.4 distinguishes confirm, reject, retain-as-record, and dismiss/cancel-suggestion semantics.
- **2C-DISPOSITION-003:** Any persisted resolution stores only the narrow decision/provenance needed for lifecycle and does not duplicate candidate content.
- **2C-DISPOSITION-004:** A disposition is owner-scoped, interpretation-scoped, candidate-index-scoped, auditable, and idempotent.

### 8.9 Later structure — `2C-STRUCTURE`

- **2C-STRUCTURE-001:** Subtask, dependency, split, and merge controls are unavailable in Phase 2C.1.
- **2C-STRUCTURE-002:** Phase 2C.5 resolves selected-candidate references before inserting graph edges.
- **2C-STRUCTURE-003:** Parent/dependency targets are owner-scoped and cycle-validated before any graph write.
- **2C-STRUCTURE-004:** Split/merge is an isolated, independently reversible implementation boundary that cannot block Slices 2C.1–2C.4.

### 8.10 UX, localization, accessibility, analytics, and operations

- **2C-UX-001:** Selection, editing, validation, pending, success, conflict, retryable failure, and terminal failure have distinct visible states.
- **2C-UX-002:** The primary flow never renders a confidence score.
- **2C-UX-003:** The editor is usable without horizontal scrolling at the Pixel 7 project viewport.
- **2C-I18N-001:** Every new label, hint, error, status, date, and action has reviewed PT-BR and English copy.
- **2C-I18N-002:** Date rendering uses locale plus the persisted profile timezone.
- **2C-A11Y-001:** Every control has a programmatic label, errors are associated with fields, and aggregate failure focuses an error summary.
- **2C-A11Y-002:** Pending and successful results use appropriate live regions; focus returns to a predictable control after reset, conflict, and undo.
- **2C-A11Y-003:** All pointer targets remain at least 44 by 44 CSS pixels and the full flow is keyboard-operable.
- **2C-ANALYTICS-001:** Product events contain no title, description, due date, names, labels, or free text.
- **2C-ANALYTICS-002:** `task_candidates_confirmed` may add only bounded counts such as edited candidate and edited field counts.
- **2C-ANALYTICS-003:** `candidate_edit_started` and `candidate_edit_reset` are closed, narrow interaction events and remain best-effort.
- **2C-OPERATIONS-001:** Every schema change is append-only, generated types are refreshed from the linked schema, and local/remote migration parity is proved.
- **2C-OPERATIONS-002:** No Phase 2C.1 Edge Function, worker, queue, cron, secret, Auth, email, or provider change is permitted.

## 9. Phase 2C.1 detailed requirements

### 9.1 Exact field scope

Phase 2C.1 supports only:

- title;
- description;
- due date.

System-managed provenance (`user_id`, source entry, source interpretation, candidate index, operation key, confidence provenance, creator, timestamps) is still written by the database but is not editable. The created task starts in `inbox`. `planned_at`, `manual_priority`, `intentional_no_due`, `no_due_reason`, relation rows, `parent_task_id`, dependency rows, waiting state, disposition rows, split, and merge are not read from client edits and are not inferred from excluded candidate fields by the new Phase 2C.1 RPC.

### 9.2 Command semantics

For each selected candidate, the command may contain a closed `changes` object:

- omitted field: use the immutable suggestion value;
- field reset to suggestion: remove it from `changes`;
- `title`: non-empty trimmed string; `null` and empty are invalid;
- `description`: trimmed string or explicit `null`; empty/whitespace form input normalizes to `null`;
- `dueAt`: offset-bearing ISO-8601 string or explicit `null`; empty form input normalizes to `null`;
- unknown field: reject the entire command;
- edit supplied for an unselected candidate: reject the entire command at the database boundary.

An unchanged value need not be sent. If a client sends a value byte-for-byte equivalent after normalization, it is canonicalized as unchanged so analytics and audit edited-field counts remain truthful.

### 9.3 Required safe failures

- stale current interpretation;
- entry or interpretation not owned by the caller;
- record-only interpretation;
- duplicate or out-of-range candidate index;
- malformed/unknown edit field;
- edit for an unselected candidate;
- empty or overlong title;
- overlong description;
- invalid, nonexistent, or ambiguous local due date;
- same idempotency key with a different canonical payload;
- candidate already materialized by a different operation;
- correction and confirmation race.

Every failure is atomic, sanitized, localized at the Server Action boundary, and mapped to a stable action-result code rather than raw SQL text.

## 10. UX specification

### 10.1 Default and editing states

- Each actionable candidate appears as a selected card by default, preserving the current selective-confirmation behavior.
- The compact card shows title, optional description, and due date formatted with locale and profile timezone.
- An **Edit suggestion / Editar sugestão** control expands an inline editor for that candidate. No modal is required.
- Inputs are prefilled with the effective suggestion values. The immutable source remains visible as **Original suggestion / Sugestão original** beside or directly below a changed field.
- A candidate with any normalized change shows an **Edited / Editada** indicator.
- **Reset to suggestion / Restaurar sugestão** removes all overrides for that candidate, restores exact original values, announces the reset, and emits only best-effort telemetry.
- Unselecting a candidate visually disables its editor and excludes its edits from the honest submitted command. Reselecting within the same mounted page restores its local values. Navigation or reload discards them.

### 10.2 Validation and date behavior

- Title and description validation appears adjacent to the field and in a focusable aggregate error summary after submit.
- Due date uses a local date-time control labeled with the persisted profile timezone. Conversion to an offset-bearing instant occurs before the RPC call; nonexistent or ambiguous DST wall times are rejected rather than guessed.
- Clearing description means no description. Clearing due date means no due date. Resetting either field means use the immutable suggestion, which may itself be empty.
- Client validation improves feedback but never replaces identical server and database validation.

### 10.3 Submission states

- Loading disables selection, editors, reset controls, and submit; the current values remain visible.
- Success replaces the form with a localized created-task count and the existing undo control, then refreshed Work/Inbox/review projections show persisted values.
- A stale-interpretation conflict keeps local edits visible, focuses the alert, and offers **Reload latest suggestion / Recarregar sugestão atual**; it does not auto-submit against the new revision.
- A record-only or already-materialized conflict is terminal for the displayed candidate set and asks the user to reload.
- A transient Server Action or network failure keeps local edits and offers an explicit retry.
- No failure automatically retries a mutation or rotates the operation key for the same logical submission.

### 10.4 Accessibility and responsive layout

- Candidate cards use semantic fieldsets/legends; edit/reset buttons and selection checkboxes have candidate-specific accessible names.
- Tab order follows selection, edit control, title, description, due date, reset, then submit.
- Focus moves to the first invalid field after validation, to the conflict alert after a stale response, and to the undo result after undo.
- Status and success messages use polite live regions; blocking failures use alerts without repeated announcements.
- Mobile uses one column, full-width fields/buttons, no horizontal scrolling, and 44-pixel targets. Desktop may use a bounded two-column field layout inside one candidate card.

### 10.5 Required copy

| Meaning | PT-BR | English |
| --- | --- | --- |
| Edit | Editar sugestão | Edit suggestion |
| Edited state | Editada | Edited |
| Original value | Sugestão original | Original suggestion |
| Reset | Restaurar sugestão | Reset to suggestion |
| Clear description | Remover descrição | Clear description |
| Clear due date | Remover prazo | Clear due date |
| Timezone hint | Horário em {timezone} | Time in {timezone} |
| Stale conflict | A sugestão mudou. Recarregue a versão atual antes de confirmar. | The suggestion changed. Reload the current version before confirming. |
| Idempotency mismatch | Esta confirmação já foi usada com outros valores. Recarregue e tente novamente. | This confirmation was already used with different values. Reload and try again. |

## 11. Domain model and source-of-truth rules

| Concept | Lifetime | Authority |
| --- | --- | --- |
| Interpretation candidate | Immutable revision history | Evidence of the AI suggestion, never edited in place |
| Form edit | Current mounted page only | Transient command data, never a read model |
| Materialized task | Persistent until normal task/undo operations change it | Sole durable truth for the confirmed edited task |
| Audit | Append-only operation evidence | Explains who/what/when; never drives task state |
| Undo | Stored compensating operation | Cancels the tasks created by one materialization operation |
| Product event | Best-effort observation | Measures interaction/outcome; never drives lifecycle or authorization |

No candidate-draft table, candidate-draft JSON column, local-storage draft, autosave endpoint, or offline draft is part of the approved Phase 2C design.

## 12. Database and RPC expectations

- Add one append-only migration for Phase 2C.1.
- Preserve `confirm_entry_task_candidates(uuid, uuid, integer[], text)` unchanged while the old UI can still call it.
- Add a separate versioned RPC rather than accepting arbitrary task JSON or changing the legacy signature in place. The implementation plan defines the exact inspected signature.
- Accept edits only as a bounded JSON array keyed by selected candidate index, with a strict allowlist for `title`, `description`, and `dueAt`.
- Reject duplicate indices, unknown fields, edits for unselected candidates, and any client owner ID.
- Lock the owned entry, verify the current interpretation, validate immutable candidate existence and record-only state, canonicalize effective values, compare the operation fingerprint, and materialize all selected tasks in one transaction.
- Store a canonical request fingerprint with the existing undo/idempotency evidence so same-key/different-payload replay can be rejected without a second candidate state table.
- Create tasks with explicit core semantics only; do not silently materialize legacy `waitingOn`, `parentIndex`, or interpretation-wide entity links in Phase 2C.1.
- Keep `SECURITY DEFINER`, `set search_path = ''`, qualified object references, least-privilege grants, RLS, composite ownership constraints, and no dynamic SQL.
- Return a bounded typed result containing task IDs, undo ID, and idempotent replay status. The Server Action revalidates review, Inbox, and Work; those projections read the persisted task values rather than treating RPC response content as a second task truth.

## 13. Security and privacy

- `auth.uid()` is the only caller identity. The owner ID never appears in the public RPC arguments.
- Ownership is validated before candidate data, operation evidence, or conflict detail is returned.
- RLS remains enabled and forced where established; a `SECURITY DEFINER` RPC still performs explicit owner predicates.
- Later relation editing must reject a single cross-owner target atomically and without leaking the target's existence.
- The JSON edit parser is closed at every level, bounded in count and length, and rejects unknown keys.
- Audit and undo evidence is owner-scoped and contains the minimum deterministic fingerprint/field-name evidence required for replay and support.
- Product events contain no candidate content, title, description, due date, person/project/context name, provider response, secret, or free text.
- Raw SQL errors, provider output, secrets, and internal policy/confidence values are never rendered in the primary flow.
- Replay, concurrency, stale interpretation, and correction races are database-tested and remotely exercised as an authenticated user.

## 14. Analytics

Phase 2C.1 uses the existing private product-event ledger and its server/client ownership rules:

| Event | Meaning | Allowed properties | Idempotency/repeat behavior |
| --- | --- | --- | --- |
| `candidate_edit_started` | User begins editing at least one candidate in the visible review | `candidateCount: 1` only | Once per entry/candidate per tab session; candidate index stays in the client dedupe key, not the payload |
| `candidate_edit_reset` | User explicitly resets edited values to the suggestion | `editedFieldCount` before reset | Meaningful user repeats may count; no field values or names |
| `task_candidates_confirmed` | Existing successful domain outcome, now with optional edit counts | `candidateCount`, `editedCandidateCount`, `editedFieldCount` | Deterministic from the confirmation operation key |

No separate analytics dashboard, aggregation job, queue, or lifecycle dependency is introduced. Invalid analytics payloads are rejected by the allowlist; unavailable telemetry remains fail-open.

## 15. Acceptance criteria

### 15.1 By epic

- **Epic 2C-A:** All `2C-EDIT`, `2C-CONFIRM`, `2C-PROVENANCE`, `2C-IDEMPOTENCY`, `2C-OWNERSHIP`, `2C-UNDO`, and transverse 2C.1 requirements pass locally, in database contracts, in disposable remote smoke, and in authenticated desktop/mobile journeys.
- **Epic 2C-B:** Planning/priority/no-due fields have explicit null/omitted/reset semantics, do not alter 2C.1 replay fingerprints, and pass Work/Needs Attention convergence.
- **Epic 2C-C:** Every relation is an existing owned row, cross-owner input aborts atomically, and no label-based implicit relation is accepted.
- **Epic 2C-D:** Every candidate can reach one explicit owner-scoped resolution without copying candidate content or hiding unresolved work.
- **Epic 2C-E:** Graph materialization is atomic, cycle-safe, owner-safe, selected-reference-safe, isolated from earlier slices, and independently reversible.
- **Epic 2C-F:** All daily surfaces, copy, analytics, remote gates, cleanup, reports, traceability, and permanent documentation agree on the completed behavior.

### 15.2 Phase 2C.1

- Edit title only, description only, due date only, or all three and see exact values in Work.
- Confirm without edits and obtain the original core candidate values.
- Clear description and due date with explicit `null` semantics.
- Reject invalid/ambiguous dates, empty/overlong title, and overlong description before mutation.
- Confirm a subset while remaining candidates stay visible in Needs Attention and the review.
- Reject edits for an unselected candidate, duplicate/out-of-range indices, unknown fields, stale interpretation, record-only state, cross-owner access, and same-key/different-payload replay.
- Same-key/same-payload and concurrent confirmation return one materialization result with no duplicate task.
- Correction racing confirmation yields one valid winner and no partial state.
- Undo cancels the exact created tasks and records audit evidence.
- Telemetry failure does not fail or roll back confirmation.
- PT-BR and English pass on desktop and Pixel 7 mobile with keyboard, focus, live-region, and 44-pixel target assertions.

### 15.3 Global gates

- Security: authenticated ownership, RLS/grants, cross-owner denial, closed JSON, replay safety, and no content telemetry pass.
- Accessibility/localization: WCAG-oriented labels, focus, live regions, target size, responsive layout, PT-BR/English, and timezone copy pass.
- Rollback: old RPC remains callable during rollout; old UI can be restored without reverting the additive migration.
- Observability: content-free edit/confirmation events are allowlisted, idempotent as specified, and fail-open.
- Documentation/traceability: each requirement maps to a slice, test/evidence owner, and closeout report.

## 16. Risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Duplicate task creation | Conflicting durable work | Entry lock, interpretation/candidate uniqueness, operation fingerprint, concurrency pgTAP and remote race |
| Stale interpretation race | Task based on obsolete suggestion | Expected current interpretation under entry lock; bounded conflict code; no auto-resubmit |
| Edited payload mismatch | Wrong field applied to wrong candidate | Index-keyed closed edits, selected-index cross-check, canonical sort, database validation |
| RPC/schema compatibility | Old UI breaks during deployment | Add versioned RPC, preserve old signature/grants, deploy migration before UI cutover |
| Undo behavior | Wrong tasks cancelled or gateway conflict | Reuse exact entity IDs, test repeated/cross-owner undo, investigate remaining `40001` path before acceptance |
| Timezone/date ambiguity | Wrong due instant | Profile timezone displayed, strict local-to-offset conversion, reject DST gaps/overlaps, round-trip tests |
| UI complexity | Core confirmation becomes harder | Collapsed inline edit per candidate, three fields only, one-column mobile, progressive disclosure |
| Second source of truth | Draft and task drift | No draft table/storage/autosave; immutable candidate + transient form + persistent task only |
| Node/database contract drift | Client accepts payload DB interprets differently | Shared typed schema, mirrored pgTAP assertions, generated types, exact remote smoke payloads |
| Untested pgTAP environment | Structural regressions escape local gate | Keep pgTAP committed; run in Docker/CI when available; require equivalent linked remote behavior meanwhile |
| Hidden legacy semantics | Excluded relations/status materialize unexpectedly | New RPC explicitly ignores `waitingOn`, `parentIndex`, and entity-link inference; legacy RPC remains isolated |

## 17. Rollout and rollback strategy

1. Implement and locally test the additive migration and new versioned RPC while the old UI/RPC remain unchanged.
2. Apply the migration only after explicit remote authorization; regenerate linked database types and run focused pgTAP/equivalent contracts plus disposable authenticated remote smoke.
3. Cut the UI and Server Action to the new RPC only after the linked contract passes.
4. Run focused Vitest, full local gates, Work/Needs Attention regression, and authenticated desktop/mobile PT-BR/English Playwright.
5. Preserve the old RPC throughout Phase 2C.1 rollout. Roll back the UI/Action to the old contract if needed; do not reverse an applied migration destructively.
6. Correct database defects with a forward-only migration. Do not edit or delete applied migrations.
7. Consider old-RPC removal only in a separately authorized later slice after repository search, deployed-client compatibility, remote telemetry/evidence, and rollback review prove it has no consumer.

No Phase 2C.1 Edge Function deployment, worker deployment, queue/cron change, secret change, Auth/email change, or provider change is expected.

## 18. Definition of Done for Phase 2C

Phase 2C is complete only when:

- Slices 2C.1 through 2C.6 are implemented and independently reviewed;
- code, applied migrations, generated types, linked schema, and documented contracts agree;
- migrations are append-only and synchronized locally/remotely;
- focused and full Vitest, ESLint, TypeScript, and production build gates pass;
- structural/behavioral database tests pass in pgTAP or the approved equivalent environment, including denial, concurrency, idempotency, rollback, and recovery;
- disposable authenticated remote smokes pass with fail-closed cleanup;
- authenticated Playwright passes desktop and mobile in PT-BR and English;
- keyboard, focus, live regions, target sizes, responsive layout, and timezone behavior pass;
- product-event privacy, allowlists, idempotency, and fail-open behavior pass;
- no disposable Auth/data/storage fixture remains;
- permanent state, backlog, decisions, changelog, architecture/database/security references where applicable, traceability, reports, and closeout evidence are current;
- every PRD requirement maps to implementation and executed evidence;
- an independent product review and database/security review find no unresolved critical or important issue;
- no historical Phase 2X report or evidence is rewritten.
