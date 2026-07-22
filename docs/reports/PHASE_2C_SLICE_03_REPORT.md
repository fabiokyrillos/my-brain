# Phase 2C Slice 2C.3 — Owned Relations — Acceptance Report

## 1. Status

**READY WITH NON-BLOCKING NOTES**

## 2. Summary

Branch `codex/phase-2c-slice-3` (base `main`@`f25595a`) adds a new versioned RPC, `confirm_entry_task_candidates_v4`, letting the user attach owned project, context, person, and waiting-on relations to a candidate before confirmation — reusing the pre-existing `task_projects`/`task_contexts`/`task_people` junction tables (PRD `2C-RELATIONS-002`), not the dormant `tasks.waiting_on_person_id` scalar column, which stays untouched and unused. All gates are green (653/653 unit tests, 0 lint/typecheck errors, production build), migration/db-lint parity holds through `202607220039`, a dedicated 29-assertion pgTAP file and an extended 23-case remote smoke both passed for real against the linked development project, and a live authenticated Playwright journey (desktop + Pixel 7) selected and verified every relation type through the real browser UI. One genuine defect was found while writing this slice's own pgTAP coverage (not assumed from a read-through) and fixed in a separate, documented forward-fix migration before any evidence was collected against the buggy version.

## 3. Branch and commits

- Branch: `codex/phase-2c-slice-3`
- Base: `main`@`f25595a` (Slice 2C.2 merged)
- Commits (see Step 9 of the task for exact messages): core implementation (`feat(tasks): implement owned relations for candidate confirmation`), database contract (`feat(db): support owned project/context/person/waiting-on relations`), forward-fix (`fix(db): correct owned-relations person/waiting-on ownership check precedence`), acceptance/documentation (`docs(phase-2c): close slice 2C.3`)

## 4. Scope

**Objective** (PRD Epic 2C-C / `2C-RELATIONS`; implementation plan §6): the user can intentionally relate a candidate to owned project, context, person, and waiting-on records before materialization, and the resulting task displays the same owned relations.

**In scope:** `projectIds`, `contextIds`, `personIds`, `waitingOnPersonIds` edit-before-commit on the existing candidate editor (bounded multi-select, IDs only, never labels); a new versioned RPC; database-enforced same-owner validation with whole-transaction abort on any invalid relation; Work display of the four relation kinds; no new analytics events (existing generic per-field-count events already cover them, extended from 7 to 11 possible fields).

**Explicitly out of scope (not touched):** dispositions, subtasks/dependencies/split/merge, any Phase 2C.4+ work, RPC v2/v3, undo mechanics, idempotency mechanics, timezone-handling library, Needs Attention lifecycle rules, `tasks.waiting_on_person_id` (left dormant).

**One documented design resolution:** PRD `2C-RELATIONS-002` names `task_people` (not the scalar `waiting_on_person_id` column, added in migration `202607160009` and never read/written by any application code including v2/v3) as the reused table for both the generic "person" relation and the "waiting-on" relation. `task_people.role` already has a `waiting_on` enum value alongside `involved`/`requester`/`assignee`; this slice uses `role='involved'` for the generic person relation and `role='waiting_on'` for waiting-on, a single mechanism covering both without a second, redundant column.

## 5. Architecture

`confirm_entry_task_candidates_v4` is byte-for-byte `confirm_entry_task_candidates_v3` (migration `202607210036`) with:
- the `changes` allowlist extended to 11 keys (the 7 from Slice 2C.2 plus `projectIds`, `contextIds`, `personIds`, `waitingOnPersonIds`);
- per-field structural validation for the 4 new fields: each must be a bounded (≤20 elements) array of well-formed, distinct UUID strings;
- canonicalization: each relation array is sorted and deduplicated before entering the replay fingerprint, so submission order never affects idempotency;
- a same-owner validation pass across every candidate's effective relation set at once — one invalid or cross-owner ID anywhere aborts the *entire* multi-candidate materialization, never partially (`2C-RELATIONS-004`);
- relation IDs are resolved by ID only, never by label text (`2C-RELATIONS-003`) — the client never transmits names, only the bounded `{id,label}` options a Server Component projection already validated as owned;
- after each task insert, matching rows are inserted into `task_projects`, `task_contexts`, and `task_people` (twice, once per role) for that candidate's effective relation set — never a blanket copy of `entry_entities`, only explicitly selected IDs.

Because the AI extraction schema never proposes relations, their immutable "suggestion" baseline is always the empty set; "reset" for them means "clear," matching the exact pattern Slice 2C.2 established for `plannedAt`/`manualPriority`/`intentionalNoDue`/`noDueReason`.

A new server-only projection, `src/features/tasks/relation-options.ts` (`loadCandidateRelationOptions`), loads the user's own projects/contexts/people bounded to 200 rows each, ordered by name, and maps them to plain `{id,label}` pairs before they ever reach a Client Component — `candidate-editor.tsx` never receives or handles a raw Supabase row. `review-projection.ts`'s `loadEntryReviewProjection` calls it alongside the existing job/questions/profile-timezone queries and threads the result through `EntryReviewProjection.relationOptions` to the entry-detail page, then to `TaskCandidateForm`, then to each `CandidateEditor`.

`candidate-editor.tsx` adds four native `<select multiple>` listboxes (Projetos/Projects, Contextos/Contexts, Pessoas/People, Aguardando por/Waiting on) plus matching clear buttons, disabled when the user owns nothing of that kind (so an empty relation type never clutters tab order). Native multi-select gives correct keyboard/listbox semantics for free — no custom combobox widget was built, avoiding the accessibility risk and code volume of one for a scope this narrow.

`work-projection.ts` hydrates relations for a page of tasks via a bounded, two-step flat-select join (never a Supabase embedded-resource `table:other(...)` select) — one query per junction table filtered by the page's own task IDs, then one query per target table filtered by the distinct IDs actually referenced, matching the established pattern already used by `src/app/[locale]/app/projects/[projectId]/page.tsx`. `contracts.ts` gains `RelationSummary` and four new non-optional `WorkItemView` fields (`projects`, `contexts`, `people`, `waitingOnPeople`, always present as possibly-empty arrays); `projection-mappers.ts`'s `toWorkItemView` fail-closed-validates each. `TaskList` renders relation badges reusing the existing `status-badge` CSS class — no new design-system primitive.

**Analytics:** no new events. `candidate_edit_started`/`candidate_edit_reset`/`task_candidates_confirmed` are already generic per-field-count events; `editedFieldCount` naturally grows from at most 7 to at most 11, satisfying the plan's "relation-type counts only, never IDs or names" boundary without any new schema.

## 6. Database

### Migrations (this slice)

| Migration | Purpose |
| --- | --- |
| `202607220038_phase_2c_slice_3_owned_relations.sql` | `confirm_entry_task_candidates_v4` RPC; extends `guard_v2_confirmed_interpretation_correction` for the `confirm-v4:` namespace; raises the `require_task_candidates_confirmed_edit_counts` bound from `*7` to `*11`; raises `candidate_edit_reset`'s own `editedFieldCount` bound from `[1,3]` to `[1,11]` |
| `202607220039_fix_owned_relations_person_waiting_on_precedence.sql` | Forward-fix: corrects an operator-precedence bug in the person/waiting-on ownership check (see §8) |

### Security

- `SECURITY DEFINER`, `set search_path = ''` on `confirm_entry_task_candidates_v4`; `revoke all ... from public, anon` + `grant execute ... to authenticated` (identical grant shape to v2/v3).
- Owner derived exclusively from `auth.uid()`; no client-supplied owner ID anywhere in the signature.
- Every relation ID is validated against `(user_id, id)` ownership on `projects`/`contexts`/`people` before any write; the composite foreign keys `task_projects_project_owner_fk`/`task_contexts_context_owner_fk`/`task_people_person_owner_fk` back this up as defense in depth (and, before the forward-fix, were the only thing actually enforcing it for personIds/waitingOnPersonIds — see §8).
- Cross-owner and anonymous denial re-verified for v4 (pgTAP + remote smoke), for all four relation types independently.

### Backwards compatibility

- `confirm_entry_task_candidates_v3` untouched, verified still callable (pgTAP `has_function` + remote smoke "v3-still-no-relations" case) and still materializes zero relations for every task.
- `tasks.waiting_on_person_id` remains dormant and unused, as before this slice.

### Generated types

`confirm_entry_task_candidates_v4` added to `database.types.ts`; regenerated via `supabase gen types typescript --linked` and diffed byte-identical to the committed file both after migration `038` and again after the forward-fix `039` (which changes no signature). No other signature changed; no CRLF/LF-only diff committed.

### Linked verification

- `npx supabase migration list --linked`: parity through `202607220039`.
- `npx supabase db lint --linked --level warning`: clean before and after each migration in this slice (only the pre-existing, unrelated `run_user_heartbeat` warning remains).

## 7. Analytics

No new events or properties. Verified that `task_candidates_confirmed` now correctly accepts and persists `editedFieldCount` up to 11 per candidate, and that `candidate_edit_reset`'s own bound (independently discovered stale at `[1,3]` — see §8) now correctly accepts up to 11. Confirmed via the live Playwright run that `task_candidates_confirmed` fires and persists for a real 11-field, 2-candidate edit including all four relation types, and that the audit trail records only field names, never the underlying project/context/person IDs or names.

## 8. Test evidence

| Layer | Result |
| --- | --- |
| Unit/component (Vitest) | 653/653 passed (up from 622), 84 files |
| ESLint | 0 errors |
| `tsc --noEmit` | 0 errors |
| Production build | Compiled successfully, all routes generated |
| pgTAP — `phase_2c_slice_3_owned_relations.sql` | 29/29 assertions passed, executed for real online (after the forward-fix) |
| Remote smoke — `remote-editable-candidate-confirmation-smoke.mjs` | 23/23 cases passed (18 pre-existing + 5 new), disposable fixtures cleaned up, pre-existing data preserved |
| Playwright online — `editable-candidate-confirmation.spec.ts` | 2/2 passed (desktop + Pixel 7 mobile), selecting real owned project/context/person/waiting-on relations through the actual listbox controls |
| Playwright online — `intelligent-capture.spec.ts` (regression check) | Partial: the deterministic-fixture describe block (basic question, recoverable retry, terminal retry) passed 4/4; the real-AI-capture describe block's first serial test ("organizes into a reviewable interpretation") timed out waiting for the deployed worker, blocking its serially-dependent successors — a pre-existing external dependency on worker/OpenAI latency, not touched by this slice (confirmed via `git status`: no changes anywhere in `supabase/functions/`, capture actions, or job/worker code) |
| Playwright offline — `foundation.spec.ts` | 6/6 passed (desktop + mobile) |

pgTAP execution method: `supabase test db --linked` requires Docker locally for its `pg_prove` container even against a remote target, and Docker is unavailable on this workstation. The pgTAP file was instead executed directly via `npx supabase db query --linked -f <file>`, after temporarily installing `pgtap` into the linked project's `extensions` schema (removed again after verification; not committed as a migration, consistent with the pattern established during Issue #3/Slice 2C.2). Because this CLI path only surfaces the last statement's result set, a disposable debug copy that logged each assertion into a temporary table was used to see the full 29-line breakdown before removing the copy; the committed pgTAP file itself is unmodified from the plain style used by every other file in `supabase/tests/`.

### Live-discovered defect

Writing this slice's own pgTAP coverage (not assumed from a local read-through) found that the cross-owner ownership check for `personIds`/`waitingOnPersonIds` never actually rejected a cross-owner ID: the expression `candidate_row.value -> 'personIds' || candidate_row.value -> 'waitingOnPersonIds'` relies on `->` and `||` having the same precedence and left-to-right associativity in PostgreSQL, so it silently parsed as `(candidate_row.value -> 'personIds' || candidate_row.value) -> 'waitingOnPersonIds'` — concatenating the personIds array with the *entire candidate object* as one extra element, then applying `->` with a text key to the resulting array (always `NULL`). `jsonb_array_elements_text(NULL)` in a `FROM` clause yields zero rows, so the `not exists` check always found nothing to reject. The composite foreign key `task_people_person_owner_fk` still correctly rejected the resulting `INSERT` with SQLSTATE `23503` — no cross-owner row was ever actually persisted — but the application-level check degraded into a confusing raw FK violation instead of the intended `2C_INVALID_RELATION` rejection. `project`/`context` checks (no `||` concatenation) were unaffected. Fixed by migration `202607220039` (parenthesizing both operands); re-ran the pgTAP file after the fix — 29/29 pass, including the previously-failing cross-owner person/waiting-on cases.

A second, independent pre-existing defect was found while designing this slice's own analytics bound: `candidate_edit_reset`'s `editedFieldCount` property was still bounded `[1,3]` by migration `202607210034` (written for Phase 2C.1's 3 fields). Slice 2C.2 already raised the maximum possible reset-time edited-field count to 7 but never updated this specific bound — the same class of defect migration `202607210037` fixed for `task_candidates_confirmed`, just never applied to this sibling property. Fixed in the same migration `202607220038` that raises it to 11 for this slice's own fields.

## 9. Accessibility and responsive behavior

- The four relation controls are native `<select multiple>` elements, giving standards-compliant keyboard (arrow keys, Home/End, type-ahead) and screen-reader listbox semantics without any custom widget code.
- Each control's clear button is disabled (not merely inert) when the user owns nothing of that relation type, so tab order never includes a control with nothing meaningful to do — verified by an updated component test asserting the existing tab-order sequence is unchanged when no relation options are supplied, and covered by five new tests exercising the fields when options *are* present.
- Minimum 44px targets preserved on every new control, matching the established pattern.

## 10. Known gaps (non-blocking)

1. The real-AI-capture Playwright journey in `intelligent-capture.spec.ts` could not be exercised this session (see §8) due to what appears to be worker/OpenAI dispatch latency exceeding the test's 90-second organizing timeout — an external dependency this slice does not touch. The Slice-2C.3-specific relation-selection journey (`editable-candidate-confirmation.spec.ts`), which uses the established deterministic direct-RPC-fixture pattern instead of depending on real AI extraction, passed in full on both desktop and mobile and is the correct, sufficient verification for this slice's own new behavior.
2. No dedicated Playwright case exists for the mixed valid/invalid atomic-abort path in the browser (only via pgTAP + remote smoke) — the UI has no way to submit an invalid cross-owner ID today (the multi-select only ever lists the user's own owned records), so this path is genuinely unreachable through real interaction and is correctly covered at the RPC layer instead.
3. `docs/DATABASE.md` was not updated: `task_projects`/`task_contexts`/`task_people` were already documented from earlier phases; this slice only adds a new writer to already-documented tables, not a new table or column.

## 11. Verdict

**READY WITH NON-BLOCKING NOTES.** Every acceptance criterion traced to the PRD/implementation plan passes with concrete, live-verified evidence, including the two genuine pre-existing/newly-introduced defects found by actually running the new pgTAP coverage rather than assuming success, both fixed and re-verified before this report was written. No disposition/subtask/dependency/split/merge/Phase 2C.4 work exists on this branch. Not pushed, no PR opened, not merged, not deployed.
