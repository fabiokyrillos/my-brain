# Phase 2C Slice 2C.2 — Planning, Priority, and No-Due Semantics — Acceptance Report

## 1. Status

**READY WITH NON-BLOCKING NOTES**

## 2. Summary

Branch `codex/phase-2c-slice-2` (base `main`@`f97da3c`) adds a new versioned RPC, `confirm_entry_task_candidates_v3`, letting the user edit `plannedAt`, `manualPriority`, `intentionalNoDue`, and `noDueReason` per candidate before confirmation — reusing `tasks.planned_at`/`manual_priority`/`intentional_no_due`/`no_due_reason`, columns present in the schema since early Phase 2X migrations but never read or written by any application code until this slice (the Slice 2C.1 RPC hardcoded them to `null`/`false`). All gates are green (622/622 unit tests, 0 lint/typecheck errors, production build), migration/db-lint parity holds through `202607210037`, a dedicated pgTAP file and an extended remote smoke both passed for real against the linked development project, and a live authenticated Playwright journey (desktop + Pixel 7) exercised every new field through the real browser UI. One genuine, pre-existing bug — unrelated to this slice's own code but exposed by its new fields — was found by actually running the live Playwright journey, and was fixed in a separate, documented forward-fix migration.

## 3. Branch and commits

- Branch: `codex/phase-2c-slice-2`
- Base: `main`@`f97da3c` (Slice 2C.1 + Issue #3 analytics, both merged)
- Commits (see Step 12 of the task for exact messages): core implementation (`feat(tasks): implement planning, priority, and no-due semantics`), database contract (`feat(db): support planning, priority, and no-due candidate fields`), forward-fix (`fix(db): correct task_candidates_confirmed field bound for Slice 2C.2`), acceptance/documentation (`docs(phase-2c): close slice 2C.2`)

## 4. Scope

**Objective** (PRD Epic 2C-B; implementation plan §5): the user can optionally set a planned date, manual priority, or an intentional absence of due date (with an optional reason) per candidate before confirmation, with unambiguous interaction between those values and Work.

**In scope:** `plannedAt`, `manualPriority`, `intentionalNoDue`, `noDueReason` edit-before-commit on the existing candidate editor; a new versioned RPC; database-enforced due/no-due mutual consistency; Work display of the new fields; no new analytics events (existing generic per-field-count events already cover them).

**Explicitly out of scope (not touched):** relations (project/context/person/waiting-on), dispositions, subtasks/dependencies/split/merge, any Phase 2C.3+ work, RPC v2, undo mechanics, idempotency mechanics, timezone-handling library, Needs Attention lifecycle rules.

**One documented judgment call:** `noDueReason`'s maximum length has no PRD-specified number and no pre-existing database constraint. The `description` field's established bound (2000 characters) was reused for consistency rather than inventing a new arbitrary number.

## 5. Architecture

`confirm_entry_task_candidates_v3` is byte-for-byte `confirm_entry_task_candidates_v2` (migration `202607190032`) with:
- the `changes` allowlist extended to 7 keys (`title`, `description`, `dueAt`, `plannedAt`, `manualPriority`, `intentionalNoDue`, `noDueReason`);
- per-field structural validation for the 4 new fields (`plannedAt`: same offset-instant regex/cast as `dueAt`; `manualPriority`: enum `low|medium|high|urgent`, matching the pre-existing `tasks.manual_priority` CHECK constraint; `intentionalNoDue`: boolean; `noDueReason`: trimmed string ≤2000 chars or explicit null, empty/whitespace normalizes to null);
- a mutual-consistency check per candidate, evaluated on the *effective* (suggestion-merged) values: `(no_due_reason is null or intentional_no_due) and (not intentional_no_due or due_at is null)`;
- the same canonical-fingerprint/replay/audit/undo machinery, now covering all 7 possible edited fields;
- `manual_priority`/`planned_at`/`intentional_no_due`/`no_due_reason` are read from the effective candidate into the `tasks` insert instead of the hardcoded `null`/`null`/`false`/`null` v2 uses.

Because the AI extraction schema never proposes these 4 fields (confirmed by inspection — no occurrence anywhere in `src/lib/ai/` or `ActionableCandidateView`), their immutable "suggestion" baseline is a fixed neutral constant (`null`/`null`/`false`/`null`), not per-candidate data. "Reset to suggestion" for them therefore means "clear," matching the existing reset semantics for title/description/dueAt exactly (restore the immutable baseline) without inventing a new concept.

`candidate-edit-contract.ts`'s `normalizeCandidateEdits` mirrors the RPC's mutual-consistency check client-side (computing effective due/no-due state per candidate and throwing on violation) for fail-fast UX; the database remains the sole trust boundary.

`candidate-editor.tsx` adds: a planned-date `datetime-local` input + explicit clear button (identical DST-aware conversion as due date, via the existing `candidate-due-date.ts`, no new date-handling code); a priority `<select>`; a no-due checkbox that, on check, atomically clears and disables the due-date input and reveals an optional reason textarea (on uncheck, clears the reason and re-enables due-date editing) — this UX choice proactively prevents the one contradiction the database rejects, so the rejection path is exercised only via direct `normalizeCandidateEdits`/RPC tests, never reachable through normal interaction (verified: an attempted component-level test for this turned out to describe an unreachable state, and was corrected before being kept).

`work-projection.ts` now selects `planned_at`/`manual_priority`/`intentional_no_due`/`no_due_reason`; `projection-mappers.ts`'s `toWorkItemView` maps and fail-closed-validates them; `TaskList` renders a planned-date line, a priority badge, and a "No due date" indicator with its reason — all reusing the existing `status-badge` CSS class, no new design-system primitives.

**Analytics:** no new events. `candidate_edit_started`/`candidate_edit_reset`/`task_candidates_confirmed` (Issue #3) are already generic per-field-count events, not content-specific, so they extend to the new fields automatically — `editedFieldCount` naturally grows from at most 3 to at most 7.

## 6. Database

### Migrations (this slice)

| Migration | Purpose |
| --- | --- |
| `202607210036_phase_2c_slice_2_planning_priority_no_due.sql` | `confirm_entry_task_candidates_v3` RPC; `tasks_no_due_consistency_check` table constraint; extends `guard_v2_confirmed_interpretation_correction` for the `confirm-v3:` namespace |
| `202607210037_fix_task_candidates_confirmed_field_bound_for_slice_2c2.sql` | Forward-fix: corrects `private.require_task_candidates_confirmed_edit_counts`'s stale `* 3` bound to `* 7` |

### Security

- `SECURITY DEFINER`, `set search_path = ''` on `confirm_entry_task_candidates_v3`; `revoke all ... from public, anon` + `grant execute ... to authenticated` (identical grant shape to v2).
- Owner derived exclusively from `auth.uid()`; no client-supplied owner ID anywhere in the signature.
- `tasks_no_due_consistency_check` protects every insert path, not just this RPC — defense in depth independent of application code.
- `guard_v2_confirmed_interpretation_correction` (unchanged name, extended body) still `revoke all from public, anon, authenticated`, reachable only via its trigger.
- Cross-owner and anonymous denial re-verified for v3 (pgTAP + remote smoke).

### Backwards compatibility

- `confirm_entry_task_candidates_v2` untouched, verified still callable (pgTAP `lives_ok` + remote smoke "legacy-v2-still-defaults" case) and still leaves the 4 new columns at their Phase 2C.1 defaults.
- `tasks_no_due_consistency_check` is additive and satisfied by every pre-existing row (no prior code path ever set `intentional_no_due`/`no_due_reason`).

### Generated types

`confirm_entry_task_candidates_v3` added to `database.types.ts`; regenerated via `supabase gen types typescript --linked` and diffed byte-identical to the committed file before merging the change in. No other signature changed; no CRLF/LF-only diff committed.

### Linked verification

- `npx supabase migration list --linked`: parity through `202607210037`.
- `npx supabase db lint --linked --level error`: clean, both before and after each migration in this slice.

## 7. Analytics

No new events or properties. Verified that the existing `task_candidates_confirmed` event now correctly accepts and persists `editedFieldCount` up to 7 per candidate (after the forward-fix); confirmed via the live Playwright run that the event fires and persists for a real 7-field, 2-candidate edit.

## 8. Test evidence

| Layer | Result |
| --- | --- |
| Unit/component (Vitest) | 622/622 passed (up from 594), 83 files |
| ESLint | 0 errors |
| `tsc --noEmit` | 0 errors |
| Production build | Compiled successfully, all routes generated |
| pgTAP — `phase_2c_slice_2_planning_priority_no_due.sql` | 25/25 assertions passed, executed for real online |
| pgTAP — `editable_candidate_analytics_events.sql` (re-verified after the bound fix) | 29/29 assertions passed, executed for real online |
| Remote smoke — `remote-editable-candidate-confirmation-smoke.mjs` | 18/18 cases passed (13 pre-existing + 5 new), disposable fixtures cleaned up, pre-existing data preserved |
| Remote smoke — `remote-product-events-smoke.mjs` | Re-passed unaffected |
| Playwright online — `editable-candidate-confirmation.spec.ts` | 2/2 passed (desktop + Pixel 7 mobile) |
| Playwright online — `intelligent-capture.spec.ts` (regression check) | 18/18 passed, including the confirm/Work journey |
| Playwright offline — `foundation.spec.ts` | 3/3 passed |

pgTAP execution method: `supabase test db --linked` requires Docker locally for its `pg_prove` container even against a remote target, and Docker is unavailable on this workstation. Both pgTAP files were instead executed directly via `npx supabase db query --linked -f <file>`, after temporarily installing `pgtap` into the linked project's `extensions` schema (removed again after verification; not committed as a migration, consistent with the same pattern established during the Issue #3 forward-fix work).

### Live-discovered defect

Running the live Playwright journey (not just reading the code) found that `task_candidates_confirmed` was silently failing to persist for the edited-candidate scenario. Root cause: Issue #3's `private.require_task_candidates_confirmed_edit_counts` bounded `editedFieldCount` at `editedCandidateCount * 3`, a number correct only for Phase 2C.1's 3 editable fields; this slice's 4 additional fields made a genuinely valid 2-candidate/7-field edit exceed that stale bound (7 > 2×3). Fixed in a separate, clearly documented forward-fix migration (`202607210037`); the one Issue #3 pgTAP assertion whose test value assumed the old bound was corrected to a value that still genuinely exceeds the new one. Re-verified both online pgTAP suites and the live Playwright journey after the fix — all green.

## 9. Accessibility and responsive behavior

- New controls (planned-date input, priority select, no-due checkbox, reason textarea) reuse the exact `field-label`/44px-target/`aria-describedby`-error pattern already established and tested for title/description/dueAt in Slice 2C.1; no new interaction pattern was introduced.
- Tab order verified via an updated component test: title → description → clear-description → due-date → clear-due-date → planned-date → clear-planned-date → priority → no-due checkbox → (reason, when visible) → reset.
- No hover-only interaction; no desktop-only assumption.

## 10. Known gaps (non-blocking)

1. No dedicated new Playwright test case exists purely for the mutual-consistency *rejection* path in the browser — this is intentional: the UI proactively prevents the contradiction (checking "no due date" auto-clears/disables the due-date field), so that path is genuinely unreachable through the real UI and is instead covered by direct `normalizeCandidateEdits` unit tests and RPC-level pgTAP assertions, which is the correct place for it.
2. Mobile Playwright coverage for Slice 2C.2 specifically comes from `editable-candidate-confirmation.spec.ts`'s Pixel 7 project (which does exercise the new fields); a from-scratch dedicated mobile-only test file was not created, matching the existing Slice 2C.1 convention of one shared spec parameterized by project.
3. `docs/DATABASE.md` and this report were updated for Slice 2C.2; no other permanent-documentation file (`ARCHITECTURE.md`, `SECURITY.md`) required a change, since no new security posture, RLS policy, or architectural boundary was introduced beyond what Slice 2C.1 already established for the versioned-RPC pattern.

## 11. Verdict

**READY WITH NON-BLOCKING NOTES.** Every acceptance criterion traced to the PRD/implementation plan/ADR-031 passes with concrete, live-verified evidence. The one defect found was pre-existing (Issue #3's code, not this slice's), was found by genuinely exercising the new feature rather than assuming success, and was fixed and re-verified before this report was written. No relations/disposition/graph/Phase 2C.3 work exists on this branch. Not pushed, no PR opened, not merged, not deployed.
