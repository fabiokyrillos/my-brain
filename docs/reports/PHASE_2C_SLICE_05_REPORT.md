# Phase 2C Slice 2C.5 — Subtasks and Dependencies — Acceptance Report

## 1. Status

**READY WITH NON-BLOCKING NOTES**

The complete branch diff passed independent review with no Critical or Important finding. The linked database is migrated through `202607220045`; the application branch remains local and has not been pushed, merged, or deployed.

## 2. Summary

Branch `codex/phase-2c-slice-5` (base `main`@`7fc179a`, the Slice 2C.4 merge) delivers the subtask and dependency half of Phase 2C.5. A user can attach, to any candidate they are confirming, a single parent and any number of dependency targets, where each target is either another confirmed candidate in the same batch or an existing owned task. The database resolves every candidate reference before writing, validates same-owner and non-cancelled targets, rejects self-reference, non-confirmed targets, and cycles, and materializes the tasks plus their `parent_task_id`/`task_dependencies` edges in one atomic transaction with the existing replay, audit, and undo guarantees. Canvas surfaces (entry review, Work) display the resulting parent/dependency relations.

The isolated **split/merge** epic that PRD `2C-STRUCTURE` also names is deliberately excluded from this slice and recorded as a non-blocking follow-up (see §13). The PRD and implementation plan fully specify parent/dependency (reference shape, ownership, cycle-safety) but describe split/merge only structurally, as "an isolated, independently reversible epic that cannot block the rest of 2C.5", with no field-mapping, command shape, or UX specification anywhere. The plan itself frames split/merge as independently shippable and disableable, so delivering subtasks + dependencies now and deferring split/merge honors both the documented scope and the "smallest safe change" and deferral rules.

## 3. Branch and commits

- Branch: `codex/phase-2c-slice-5`
- Base: `7fc179a` (`main`, merge of Slice 2C.4)
- Remote Git actions: none. No push, PR, merge, or force operation was performed.

## 4. Locked scope and delivered behavior

Delivered (`2C-STRUCTURE-002`, `-003`):

- A new versioned RPC `confirm_entry_task_candidates_v6` extends the v5 disposition contract with two optional per-confirmed-candidate keys: `parentRef` and `dependsOn`.
- References are a closed discriminated union: `{type:"candidateIndex",value:int}` (another confirmed candidate in the same batch) or `{type:"taskId",value:uuid}` (an existing owned, non-cancelled task). References are resolved to task ids inside the transaction, never by label.
- Every candidate reference is resolved before edges are written; parent/dependency targets are validated for same-owner and non-cancelled status; self-reference, non-confirmed targets, cross-owner/cancelled targets, duplicate dependency targets, and direct/indirect cycles are all rejected atomically.
- Confirmed candidates materialize their tasks and then their `parent_task_id`/`task_dependencies` edges in one transaction. A forward reference (a candidate whose parent/dependency is a later-indexed sibling) resolves correctly because edges are written in a second pass after every insert.
- The sorted/deduplicated graph payload participates in the canonical replay fingerprint; the existing undo cancels the created tasks and removes the batch's resolution rows.
- Entry review and Work display each task's parent and dependency targets.

Explicitly excluded and untouched:

- Split and merge candidate workflows (deferred; see §13).
- The dormant `tasks.waiting_on_person_id` scalar column (Slice 2C.3 already chose the junction tables instead; untouched).
- Any new candidate-draft table, any new analytics event, and any change to earlier RPC signatures.

## 5. Architecture

### Reference shape and cycle-safety proof

The command adds two keys to `candidateEdits[].changes`, on top of v5's existing 11: `parentRef` (a graph reference or `null`) and `dependsOn` (a bounded ≤20 array of `{target: graph reference, type: 'blocks'|'requires'|'related'}`). `private.is_valid_graph_reference(jsonb)` validates the closed union shape.

Cycle detection is restricted to the intra-batch `candidateIndex` subgraph. The migration header records the proof: every `taskId` reference targets a row that already existed, with its own edges fixed, before this transaction began; those edges can never point at a task created by this same call (its id does not exist yet), so no cycle can span the existing-graph boundary. Only `candidateIndex`-typed references among this batch's own candidates can close a cycle. Two bounded recursive CTEs (parent ancestry and dependency reachability, depth-guarded) detect a returned origin.

### Materialization

`confirm_entry_task_candidates_v6` reuses the entire v5 pipeline (auth, operation-key normalization, resolution/edit validation, interpretation/entry locking, disposition ledger, task insertion, analytics, audit, undo). It adds graph-reference validation during the edit-validation loop (shape, self-reference, non-confirmed-target), cross-owner/cancelled taskId denial and cycle detection after the effective candidate set is known, and a second pass — after every task insert — that resolves each candidate's parent/dependency references to real task ids and writes `parent_task_id`/`task_dependencies`. The second-pass `UPDATE tasks SET parent_task_id` touches a column outside the disposition guard trigger's watched-column list, so it does not misfire.

### Projections and UI

- `relation-options.ts` additionally loads the user's own bounded (≤200) active tasks as `{id,label}` options.
- `candidate-editor.tsx` renders a native parent `<select>` (grouped into this-review suggestions and existing tasks) and a `<select multiple>` dependency listbox, each with a clear control, disabled when nothing is selectable. Graph references are encoded as `candidate:<index>`/`task:<uuid>` option values and decoded back into the discriminated union.
- `task-candidate-form.tsx` passes each candidate its sibling candidates so intra-batch references can be chosen before any task exists.
- `work-projection.ts`/`projection-mappers.ts`/`contracts.ts`/`task-list.tsx` hydrate and display parent and dependency targets via the existing bounded two-step flat-select join, owner-scoped and fail-closed.

## 6. Database migrations and compatibility

| Migration | Purpose |
| --- | --- |
| `202607220044_phase_2c_slice_5_task_graph.sql` | Adds `private.is_valid_graph_reference`, `confirm_entry_task_candidates_v6`, the undo-path extension for v6, and the analytics edited-field bound raise from 11 to 13. |
| `202607220045_fix_task_graph_undo_affected_count.sql` | Forward-replaces `undo_operation(uuid)` to avoid the `pg_catalog.greatest(integer,integer)` lookup failure under `search_path=''` that migration `044`'s copy reintroduced. |

`confirm_entry_task_candidates_v5` and every earlier confirmation RPC remain present and callable (pgTAP asserts the v5 signature is unchanged). Both migrations are additive/forward-only; migration `044` was left unedited once applied, per this project's append-only convention. Migration parity is exact through `045`. Linked generated types were generated twice consecutively, were byte-identical between runs, and exactly match the committed `database.types.ts`.

## 7. Security, privacy, and integrity

- `confirm_entry_task_candidates_v6` is `SECURITY DEFINER`, has `set search_path = ''`, derives identity only from `auth.uid()`, revokes `public`/`anon`, and grants execution only to `authenticated` (pgTAP 2–5).
- Every `taskId`-typed parent/dependency target is validated to be owned by the caller and non-cancelled; `candidateIndex`-typed targets are validated to be confirmed in the same batch. The composite foreign keys `tasks_parent_owner_fk` and `task_dependencies_dependency_owner_fk` are the defense-in-depth backstop, and made cross-owner edges impossible even before this slice.
- The graph payload is canonicalized (sorted, deduplicated) and participates in the replay fingerprint. Same key/same graph replays; same key/different graph rejects without partial writes.
- `is_valid_graph_reference`, the v6 RPC, and the undo function are all least-privilege granted; the two `private.*` analytics helpers remain revoked from every client role.
- Audit and undo evidence name only field keys (`parentRef`/`dependsOn`) and the created tasks' own ids — never the referenced target ids, titles, or any free text (pgTAP 23).

## 8. Analytics

No new product event was added. The existing generic `task_candidates_confirmed`/`candidate_edit_started`/`candidate_edit_reset` events already record only privacy-safe aggregate counts. The per-candidate editable-field ceiling grew from 11 to 13 (adding `parentRef` and `dependsOn`) in `require_task_candidates_confirmed_edit_counts` and in `candidate_edit_reset`'s own `editedFieldCount` bound. No disposition category, target id, title, or free text enters analytics.

## 9. Verification evidence

### Local application gates

| Gate | Result |
| --- | ---: |
| Full Vitest | 85 files, 714/714 passed (up from 693) |
| ESLint | passed, zero reported error/warning |
| TypeScript `tsc --noEmit` | passed |
| Next.js production build | passed |

New focused unit coverage: `candidate-edit-contract.test.ts` (graph canonicalization/validation), `candidate-editor.test.tsx` (parent/dependency selection, clear, reset), `projection-mappers.test.ts` and `work-projection.test.ts` (parent/dependsOn hydration and fail-closed mapping).

### Linked database gates

Docker-backed `supabase test db --linked` remains unavailable on this workstation. The authorized fallback temporarily installed pgTAP in the linked project's `extensions` schema, mechanically captured every canonical TAP line, and removed pgTAP afterward; no temporary harness file remains in the repo.

| Linked pgTAP suite | Result |
| --- | ---: |
| `phase_2c_slice_5_task_graph.sql` (new) | 34/34 |
| `phase_2c_slice_3_owned_relations.sql` | 29/29 (after correcting two stale-bound assertions) |
| `editable_candidate_analytics_events.sql` | 29/29 (after correcting two stale-bound assertions) |
| `candidate_action_consistency.sql` | passed |
| `editable_candidate_confirmation.sql` | passed |
| `editable_candidate_confirmation_race.sql` | passed |
| `needs_attention_projection.sql` | passed |
| `phase_2c_slice_2_planning_priority_no_due.sql` | passed |
| `phase_2c_slice_4_candidate_dispositions.sql` | passed |

`supabase db lint --linked --level warning` reports only the two pre-existing, unrelated `run_user_heartbeat` text-to-time warnings; error level is clean. The first `044` push exposed a real `pg_catalog.greatest` lookup failure, fixed forward-only by migration `045` and re-verified clean.

### Remote smoke and browser

- Disposable linked remote smoke (`scripts/remote-editable-candidate-confirmation-smoke.mjs`, extended from 24 to 29 cases) passed 29/29 as a real authenticated user: intra-batch parent/child resolution, taskId-typed dependency materialization, atomic cycle rejection, cross-owner reference denial, and undo. Zero disposable users/fixtures remained; pre-existing Auth IDs and every touched-table count (now including `task_dependencies`) were preserved exactly.
- The deterministic disposition Playwright spec (`e2e/editable-candidate-confirmation.spec.ts`), updated to assert the v6 operation namespace it now exercises, passed 4/4 (PT-BR/en × desktop/Pixel 7).

## 10. Independent review

Final independent review of the complete branch diff returned no Critical or Important finding. It specifically rechecked ownership/RLS/`SECURITY DEFINER`/`search_path`, graph-reference validation, cross-owner/cancelled denial, the cycle-safety proof and its bounded implementation, the second-pass parent-update trigger interaction, atomicity, replay fingerprint sensitivity to the graph payload, undo correctness and retained edges, v5/earlier compatibility, projection fail-closed behavior, analytics/privacy, and migration compatibility.

## 11. Non-blocking notes

- The candidate editor's dependency picker always submits dependency type `blocks` (the RPC accepts `blocks`/`requires`/`related`). A dependency-type selector is a reasonable later UX addition; the database contract already supports all three.
- The two pre-existing `run_user_heartbeat` warning-level lint findings are unrelated and unchanged.

## 12. Rollback and deployment state

- Database: migrations `044`–`045` are applied to the linked development project and are intentionally forward-only. Do not run a destructive down migration.
- Application rollback: restore the previous v5 UI/Server Action consumer. Earlier RPCs remain available, and older projections safely ignore `parent_task_id`/`task_dependencies` rows.
- Branch: local only. No push, PR, merge, or application deployment occurred.
- Next stop: wait for separate authorization before publishing this branch or implementing the split/merge follow-up or Phase 2C.6.

## 13. Deferred follow-ups

- **Split/merge candidate workflows (`2C-STRUCTURE-004`)** — the isolated, independently reversible split/merge epic named in the PRD/implementation plan is not implemented in this slice. It has no field-mapping, command shape, or UX specification in the current documentation, and the plan explicitly frames it as an isolated boundary that cannot block the rest of 2C.5. Blocking: no (2C.5's core parent/dependency user outcome is delivered). Recommended next step: a product decision defining the exact split/merge command shape and UX before implementation, then a dedicated additive slice. Tracked as GitHub issue #8.
- **Dedicated graph browser journey** — the graph editor controls are covered by unit tests, and full v6 materialization/cycle/undo by pgTAP (34/34) and the real-authenticated remote smoke (29/29). A dedicated end-to-end Playwright journey that selects a parent and dependency through the browser controls would add direct UI coverage. Blocking: no. Recommended next step: extend the deterministic disposition spec with owned-task fixtures and graph selections.

## 14. Verdict

Slice 2C.5's subtask/dependency scope satisfies the documented `2C-STRUCTURE-002`/`-003` contract and the Definition of Done. The implementation is owner-safe, atomic, cycle-safe, replay-safe, undoable, privacy-safe, and consistent across entry review and Work, with all earlier slice guarantees still green.

**Final verdict: READY WITH NON-BLOCKING NOTES.**
