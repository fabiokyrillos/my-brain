# Phase 2C Slice 2C.4 — Candidate Dispositions — Acceptance Report

## 1. Status

**READY WITH NON-BLOCKING NOTES**

The complete branch diff passed independent review with no Critical or Important finding. The linked database is migrated through `202607220043`; the application branch remains local and has not been pushed, merged, or deployed.

## 2. Summary

Branch `codex/phase-2c-slice-4` (base `main`@`cb91d3d`) implements the exact terminal candidate outcomes `confirmed`, `rejected`, `retained`, and `dismissed`. A selected candidate moves from pending to one terminal outcome. Only `confirmed` creates a task; every outcome is preserved as entry-local history, stops being actionable, and does not resurface automatically. The existing undo architecture restores the affected candidates to pending, cancels only tasks created by the same operation, and permits a later confirmation with a new operation key.

The implementation adds no candidate-draft table and copies no candidate content into the disposition ledger. Mixed multi-candidate decisions are one database transaction. Work remains a task surface and therefore contains confirmed outcomes only. No category-level disposition analytics exists.

## 3. Branch and commits

- Branch: `codex/phase-2c-slice-4`
- Base: `cb91d3d` (`main`, merge of Slice 2C.3)
- Local implementation commits, in order:
  - `eddd489 docs(phase-2c): lock slice 2C.4 disposition semantics`
  - `e757baf fix(db): allow candidate reconfirmation after undo`
  - `175ce58 feat(db): add terminal candidate dispositions`
  - `f1172a6 feat(tasks): add candidate dispositions`
  - `4ab38a3 fix(db): harden candidate disposition integrity guards`
  - `80ee1e9 fix(tasks): preserve disposition confirmation guarantees`
  - `414d8d4 fix(db): correct disposition undo affected count`
  - `4b727b0 chore(db): regenerate candidate disposition types`
  - `a2245e2 test(db): make disposition pgTAP production-compatible`
  - `02c729d fix(db): allow linked legacy provenance enrichment`
  - `49d102d test(tasks): cover candidate dispositions end to end`
  - `a6fa2c8 test(inbox): align disposition attention copy`
  - `docs(phase-2c): close slice 2C.4` (this report and permanent closeout state)
- Remote Git actions: none. No push, PR, merge, or force operation was performed.

## 4. Locked scope and delivered behavior

Delivered:

- Exact outcomes: `confirmed`, `rejected`, `retained`, `dismissed`; no `cancelled` candidate outcome.
- Pending-to-terminal transitions only. Unselected candidates remain pending.
- One atomic request can resolve different selected candidates to different outcomes.
- `confirmed` materializes the existing canonical edited task values and owned relations; the other three outcomes create no task.
- Every outcome remains visible in immutable entry-local history with localized human labels.
- All terminal outcomes remove their candidate from review/Inbox/Needs Attention actionability.
- Undo restores pending by removing exactly the operation's resolution rows and preserves unrelated resolutions/tasks.
- Reconfirmation after supported undo preserves cancelled task history and creates one new active task.

Explicitly excluded and untouched:

- Phase 2C.5 subtasks, dependencies, task graphs, split, or merge.
- Reasons, snooze, automatic resurfacing, disposition conversion, new memory behavior, global history, or a surface redesign.
- New category analytics or any event containing disposition, reason, candidate content, entry identity, or relation identity/name.
- Product Audit artifacts or any unrelated untracked file.

## 5. Architecture

### Persistent truth

`entry_interpretations.task_candidates` remains the immutable suggestion source. New table `entry_task_candidate_resolutions` stores only:

- owner, entry, interpretation, and candidate index;
- one closed disposition value;
- optional task provenance for `confirmed`;
- undo-operation provenance and timestamp.

It stores no title, description, dates, labels, reason, or copied candidate JSON. Candidate identity is `(user_id, interpretation_id, candidate_index)` and is unique.

### Transaction boundary

`confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)` receives the expected current interpretation, canonical resolution commands, the existing canonical edit commands, and an operation key. It locks and validates the owned entry/current interpretation, record-only state, every candidate index, every resolution/edit relation, prior task/resolution conflicts, and the canonical request fingerprint before any write.

Only the `confirmed` branch inserts a task and its existing owned junction rows. The same transaction inserts every terminal resolution, one audit row, and one undo operation. A failure in any candidate aborts the complete batch.

### Projections and UI

- `CandidateEditor` renders a native fieldset/radio decision control for selected candidates and keeps edit behavior available only where confirmation needs it.
- `TaskCandidateForm` serializes one canonical mixed command, preserves recoverable form state, rotates operation keys with semantic payload changes, and reports success/undo through localized live regions.
- Entry review hydrates resolution rows and shows all four historical outcomes against the immutable candidate title.
- Inbox and Needs Attention compute unavailable/actionable candidates from both active tasks and terminal resolutions. Open-question precedence remains unchanged.
- Work receives no disposition projection and continues to read tasks only.

## 6. Database migrations and compatibility

| Migration | Purpose |
| --- | --- |
| `202607220040_fix_candidate_reconfirmation_after_undo.sql` | Forward-replaces existing confirmation bodies and active-task uniqueness so supported undo can retain cancelled history and permit later reconfirmation. |
| `202607220041_phase_2c_slice_4_candidate_dispositions.sql` | Adds the resolution ledger, forced RLS/owner SELECT policy, integrity triggers, backfill guards, and v5 atomic mixed-disposition RPC. |
| `202607220042_fix_candidate_disposition_undo_affected_count.sql` | Forward-replaces `undo_operation(uuid)` to avoid invalid `pg_catalog.greatest` lookup and return the truthful affected count. |
| `202607220043_allow_linked_legacy_task_provenance_enrichment.sql` | Allows only `NULL → already-linked interpretation` provenance enrichment while rejecting every other identity mutation. |

The old `confirm_entry_tasks` and `confirm_entry_task_candidates` v1–v4 signatures remain present and callable. Relevant legacy suites passed after 043. All applied migrations remain append-only; no applied migration was rewritten after deployment.

Migration parity is exact through `043`. Linked generated TypeScript types were generated twice consecutively, were byte-identical between runs, and exactly match the committed `database.types.ts` (82,603 bytes).

## 7. Security, privacy, and integrity

- v5 is `SECURITY DEFINER`, has `set search_path = ''`, derives identity only from `auth.uid()`, revokes `public`/`anon`, and grants execution only to `authenticated`.
- The resolution table has enabled and forced RLS, one owner-scoped SELECT policy, authenticated SELECT only, and no authenticated direct insert/update/delete grant.
- Composite owner foreign keys bind entry, interpretation, task, and undo provenance.
- Task triggers ensure a confirmed task and its resolution cannot drift in owner/entry/interpretation/candidate identity. The 043 exception is limited to one safe legacy `NULL` enrichment equal to the already-linked interpretation.
- Canonical sorted resolutions and edits participate in the replay fingerprint. Same key/same semantics replays; same key/different semantics rejects without partial writes.
- Audit and undo evidence is bounded and content-free. The ledger contains no candidate text.
- `task_candidates_confirmed` remains fail-open and is emitted only for a non-idempotent batch with at least one confirmation. It records aggregate candidate/edit counts only; non-confirming-only batches emit no confirmation event.

## 8. Verification evidence

### Local application gates

| Gate | Result |
| --- | --- |
| Focused disposition/application suites | 217/217 passed before full-suite closeout |
| Full Vitest | 85 files, 693/693 passed |
| ESLint | passed, zero reported error/warning |
| TypeScript | `tsc --noEmit` passed |
| Next.js production build | passed; optimized build compiled successfully |
| Diff whitespace | `git diff --check` passed at each commit boundary |

The first full Vitest run exposed two stale expectations that still described “confirm tasks” instead of the approved “resolve suggestions” decision model. The two focused files passed 21/21 after their expectations were corrected, and the complete 693-test suite then passed.

### Linked database gates

Docker-backed `supabase test db --linked` could not start because Docker Desktop is unavailable. The authorized fallback temporarily installed pgTAP in the linked project's `extensions` schema, mechanically captured every top-level canonical TAP result into a transaction-local table, failed the query on any `not ok`/plan mismatch, and removed pgTAP afterward. No temporary harness file remains.

| Linked pgTAP suite | Result |
| --- | ---: |
| `candidate_action_consistency.sql` | 36/36 |
| `editable_candidate_confirmation.sql` | 74/74 |
| `editable_candidate_confirmation_race.sql` | 6/6 |
| `needs_attention_projection.sql` | 35/35 |
| `phase_2c_slice_2_planning_priority_no_due.sql` | 25/25 |
| `phase_2c_slice_3_owned_relations.sql` | 29/29 |
| `phase_2c_slice_4_candidate_dispositions.sql` | 85/85 |
| **Total** | **290/290** |

The initial linked execution found and corrected two test-fixture problems: the hosted pgTAP build did not expose the used `unlike` overload, and the record-only fixture tried to update an immutable interpretation. A later regression run found the real 041 legacy-provenance guard incompatibility; forward migration 043 fixed only that safe transition. All seven suites then passed.

`supabase db lint --linked --level error` passed. Warning-level lint still reports two pre-existing `public.run_user_heartbeat` text-to-time assignment warnings (`quiet_start_time` and `quiet_end_time`); no Slice 2C.4 function warning/error remains.

### Remote smoke and browser

| Gate | Result |
| --- | --- |
| Disposable linked remote smoke | 24/24 passed |
| Outcomes/materialization | four outcomes, one confirmed task, four ledger rows |
| Replay/terminal/undo/reconfirmation | passed |
| Cleanup | zero disposable users/fixtures remain |
| Pre-existing preservation | Auth IDs and touched-table counts unchanged |
| Playwright online | 4/4 passed in approximately 1.2 minutes |
| Browser matrix | PT-BR + English × desktop + Pixel 7 |

The browser journey proves decision selection, historical outcome labels, persistence after reload, Needs Attention removal, Work-only-for-confirmed behavior, undo, and pending restoration. Its first run correctly exposed a fixture lifecycle mismatch (`awaiting_review` kept the entry actionable for a separate reason); the fixture now uses the intended completed prerequisite and all four cases pass.

## 9. Independent review

Final independent review of `cb91d3d..a6fa2c8` returned **APPROVED**, with no Critical or Important finding. It specifically rechecked mixed atomicity, ownership/RLS, trigger integrity, v2–v4 compatibility, undo/reconfirmation, fingerprinting, relation ownership, daily-surface convergence, Work isolation, analytics privacy/fail-open behavior, localization/accessibility, remote cleanup, and the three earlier review corrections:

1. v5 preserves the generic confirmed analytics event without disposition/category leakage;
2. `2C_INVALID_RELATION` maps to its own localized action result;
3. linked generated types own the new table and exact v5 argument name, and production queries/RPC calls are direct typed calls.

## 10. Non-blocking notes

- Two `as never` casts remain where typed Supabase result objects enter the existing generic `requireSupabaseData` helper. The table queries themselves are generated-type checked; these casts no longer mask a table/RPC mismatch. Consolidating that generic helper can be considered separately.
- The remote smoke snapshots every pre-existing Auth ID and aggregate counts for every touched table, but not every individual pre-existing row ID per table. Unique fixture prefixes, cascade cleanup, fatal residue checks, and exact before/after count parity make this acceptable for the slice.
- The two pre-existing `run_user_heartbeat` warning-level lint findings are unrelated and unchanged.

None changes the Slice 2C.4 user contract or weakens a required gate.

## 11. Rollback and deployment state

- Database: migrations `040`–`043` are applied to the linked development project and are intentionally forward-only. Do not run a destructive down migration.
- Application rollback: restore the previous v4 UI/Server Action consumer. Earlier RPCs remain available, and older projections safely ignore resolution rows; already-persisted disposition history must not be deleted.
- Branch: local only. No push, PR, merge, or application deployment occurred.
- Next stop: wait for separate authorization before either publishing this branch or implementing Phase 2C.5.

## 12. Verdict

Slice 2C.4 satisfies the locked product decision and Definition of Done. The implementation is owner-safe, atomic, replay-safe, undoable, privacy-safe, localized, responsive, and consistent across entry review, Inbox, Needs Attention, and Work.

**Final verdict: READY WITH NON-BLOCKING NOTES.**
