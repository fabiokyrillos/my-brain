# Phase 2C Slice 2C.1 — Final Acceptance Report

## 1. Status

**READY WITH NON-BLOCKING NOTES**

Slice 2C.1 (Editable Core Confirmation) satisfies the approved PRD and implementation
plan on every security, correctness, idempotency/concurrency, accessibility, and
regression dimension checked. Two non-blocking gaps were found and are documented
below; neither is a correctness, security, or data-integrity defect. Three
documentation files (`STATE.md`, `TODO.md`, `CHANGELOG.md`) were stale relative to
the actual implementation and were corrected during this acceptance pass (see §18
and §6).

## 2. Executive summary

Branch `codex/phase-2c-editable-candidate-tasks` (HEAD `bfb105d`) adds editable
title/description/due-date confirmation on top of the immutable AI interpretation,
through a new versioned RPC (`confirm_entry_task_candidates_v2`), a client-side
validation/canonicalization contract, an inline per-candidate editor, and a
correction/confirmation race guard. All automated gates are green (579/579 tests,
0 lint/typecheck errors, production build, migration parity, `db lint` clean), and
one live authenticated Playwright journey (desktop + Pixel 7, real Server Action,
real linked database) was re-run during this acceptance pass and passed. Code-level
review of the RPC, the Server Action, the validation contract, and the DST-aware
date conversion found no security, ownership, idempotency, or raw-error-leak
defects. The one confirmed gap is that the PRD §14 / implementation-plan Task 5
analytics extension (`candidate_edit_started`, `candidate_edit_reset`,
`editedCandidateCount`/`editedFieldCount`) was not implemented — best-effort,
fail-open telemetry, not a functional or security concern, but a genuine PRD
deviation worth a fast-follow before or shortly after merge.

## 3. Branch and commit range

- Branch: `codex/phase-2c-editable-candidate-tasks`
- HEAD: `bfb105db6ed73591159573a4b0241ef19309a51f` (`feat(tasks): integrate editable candidate confirmation`) — confirmed unchanged at the start of this acceptance pass.
- Approved planning base: `7d550cafa3f3346811b7c293d6d3d99f69813925`, confirmed identical to `main`/`origin/main` (`git rev-parse 7d550ca main` both resolve to the same SHA) and confirmed an ancestor of HEAD (`git merge-base --is-ancestor` succeeded). No divergence exists between the approved planning base and current `main` — the two comparisons (`7d550ca...HEAD` and `main...HEAD`) are identical.
- Commit sequence (base → HEAD), all present and in order:
  1. `c292301` test(phase-2c): define editable candidate confirmation behavior
  2. `495cf16` feat(db): add editable candidate confirmation contract
  3. `f3f3105` chore(db): verify editable confirmation remotely
  4. `0fefe9b` feat(tasks): implement editable candidate contract
  5. `a8005ee` feat(tasks): implement candidate due-date conversion
  6. `7e30e8f` feat(tasks): implement editable candidate editor
  7. `bfb105d` feat(tasks): integrate editable candidate confirmation
- Worktree was clean at the start of this session; no unexpected merge, push, or remote-branch mutation was found (`git status --short --branch` showed only the local branch, no ahead/behind markers against a tracked remote for this branch).

## 4. Migration status

- Local migrations `202607190032` and `202607190033` are applied and at parity with the linked remote project (`npx supabase migration list` — every row through `202607190033` matches Local/Remote/Time exactly, no drift).
- `npx supabase db lint --linked --level error` returned zero findings across `extensions`, `private`, and `public` schemas.
- No migration was added, edited, or reset during this acceptance pass. No database or migration defect was found, so no migration `034` is required.

## 5. Complete changed-file inventory by category

38 files changed relative to the approved base (7,628 insertions, 303 deletions), all explained:

**Approved production implementation (10 files)**
- `src/features/tasks/actions.ts` (M) — `confirmEntryTasks` Server Action, RPC call, error mapping.
- `src/features/tasks/candidate-edit-contract.ts` (A) — Zod validation/canonicalization contract.
- `src/features/tasks/candidate-due-date.ts` (A) — timezone-aware local↔offset conversion, DST gap/overlap rejection.
- `src/features/tasks/candidate-editor.tsx` (A) — per-candidate inline editor.
- `src/features/tasks/task-candidate-form.tsx` (M) — candidate list, selection, edit-map, submission.
- `src/features/daily-cycle/review-projection.ts` (M) — threads profile timezone into the projection.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx` (M) — passes `timezone`/`operationKey` to the form.
- `src/lib/supabase/database.types.ts` (M) — generated types for the new RPC/column.

**Database migrations (2 files)**
- `supabase/migrations/202607190032_phase_2c_editable_candidate_confirmation.sql` (A)
- `supabase/migrations/202607190033_guard_v2_confirmation_correction_race.sql` (A)

**Tests — unit/component/contract (8 files)**
- `src/features/tasks/actions.test.ts` (M), `candidate-edit-contract.test.ts` (A), `candidate-due-date.test.ts` (A), `candidate-editor.test.tsx` (A), `task-candidate-form.test.tsx` (M), `src/features/daily-cycle/review-projection.test.ts` (M), `src/app/[locale]/app/inbox/[entryId]/page.architecture.test.ts` (M).

**Tests — database pgTAP (11 files)**
- New: `supabase/tests/editable_candidate_confirmation.sql`, `editable_candidate_confirmation_race.sql`.
- Modified (pre-existing suites touched to add coverage or accommodate the new column/RPC/trigger, not rewritten): `ai_usage_rls.sql`, `candidate_action_consistency.sql`, `entry_interpretation_worker.sql`, `entry_processing_jobs.sql`, `foundation_hardening.sql`, `intelligent_capture_rls.sql`, `interpretation_revisions.sql`, `job_queue_reliability.sql`, `needs_attention_projection.sql`, `phase1_rls.sql`, `product_events.sql`.

**End-to-end test (1 file)**
- `e2e/editable-candidate-confirmation.spec.ts` (A) — live journey, disposable-fixture based.

**Remote smoke harness (1 file)**
- `scripts/remote-editable-candidate-confirmation-smoke.mjs` (A).

**Documentation/reports (6 files, all additions)**
- `docs/reports/PHASE_2C_SLICE_01_RED.md`, `_DATABASE_GREEN.md`, `_TS_CONTRACT_GREEN.md`, `_DUE_DATE_GREEN.md`, `_CANDIDATE_EDITOR_GREEN.md`, `_INTEGRATION_GREEN.md`.

No unexplained, suspicious, or unrelated file was found in the diff. No cross-cutting refactor outside the tasks/daily-cycle/database surface touched by this slice.

**Additional documentation change made during this acceptance pass (not part of the original 38-file diff, see §18):** `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` updated to reflect that Slice 2C.1 is implemented (they previously still read "implementation not started").

## 6. Architecture summary

`confirmEntryTasks` (Server Action) validates form input with closed Zod schemas,
derives the user from `auth.getUser()`, and calls
`confirm_entry_task_candidates_v2(p_entry_id, p_expected_interpretation_id,
p_candidate_indexes, p_candidate_edits, p_operation_key)`. The RPC
(`SECURITY DEFINER`, `set search_path = ''`) re-derives identity from `auth.uid()`,
independently re-validates every bound (index range/uniqueness, edit-shape
allowlist, title/description length, ISO-8601 offset due-date format), locks the
owned entry row, re-checks the current-interpretation pointer and record-only
state, canonicalizes effective values per candidate, computes a SHA-256 request
fingerprint over a stable canonical JSON shape, and either replays an existing
idempotent result (fingerprint match) or atomically inserts all selected tasks
(guarded by `ON CONFLICT (source_interpretation_id, candidate_index) DO NOTHING`
plus an explicit `2C_ALREADY_MATERIALIZED` raise) and writes an audit row. A
second migration adds a `BEFORE INSERT` trigger on `entry_interpretations` that
rejects a `user_corrected` insert if it would supersede an interpretation still
backing active tasks from a v2 confirmation, closing a correction/confirmation
race. Client-side, `candidate-edit-contract.ts` mirrors the server's allowlist and
bounds so invalid input never reaches the network, and `candidate-due-date.ts`
converts local wall time to an offset instant by scanning ±1440 minutes around the
naive UTC interpretation of the input and matching formatted wall-clock parts
against the target timezone — zero matches means a DST gap, more than one means a
DST overlap, both rejected explicitly rather than guessed. `task-candidate-form.tsx`
retains per-candidate edits in a `Map` keyed by candidate index across
deselect/reselect, filters to only currently-selected edits at submission, and
rotates the operation key only when the canonical submitted payload signature
changes (so retries of an unchanged payload replay idempotently, but a changed
payload never collides with a prior key).

## 7. PRD acceptance matrix

Evidence legend: **A** = automated test (file:test name), **C** = code inspection
(file:line), **L** = live/manual evidence (this pass or a prior documented
Playwright/remote-smoke run).

### Editable fields (PRD §9.1)

| Requirement | Evidence | Status |
| --- | --- | --- |
| Title editable | C: `candidate-edit-contract.ts:12`; A: `candidate-editor.test.tsx:95` | PASS |
| Description editable | C: `candidate-edit-contract.ts:13-19`; A: `candidate-editor.test.tsx:110` | PASS |
| Due date editable | C: `candidate-due-date.ts`; A: `candidate-editor.test.tsx:125` | PASS |
| Explicit description clear | C: RPC lines 276-280 (`null` typeof → `null`, not "omitted"); A: `candidate-editor.test.tsx:229` | PASS |
| Explicit due-date clear | C: RPC lines 281-285; A: `candidate-editor.test.tsx:242` | PASS |
| Reset to immutable suggestion | A: `candidate-editor.test.tsx:187,202,216,281` | PASS |
| Unchanged-field elimination (byte-equal ⇒ no-op) | C: `candidate-edit-contract.ts:139-159` (`normalizeCandidateEdits` only records real deltas); RPC lines 300-313 compare `effective_*` vs `suggested_*` before recording | PASS |

### Candidate behavior

| Requirement | Evidence | Status |
| --- | --- | --- |
| Only actionable candidates editable | C: `task-candidate-form.tsx` renders `ActionableCandidateView[]` only (Slice 2X.16 boundary, unchanged) | PASS |
| Record-only candidates unaffected | C: RPC lines 231-233 (`is_record_only` → `55000`); A: `actions.test.ts` record-only mapping | PASS |
| Selected candidates confirmed / deselected excluded | C: `task-candidate-form.tsx` filters edits by `selectedIndexSet`; RPC rejects edits for unselected indexes (line 169-171) | PASS |
| Retained draft on deselect/reselect | A: `candidate-editor.test.tsx:331,351,366` (visually suspended, not erased/resubmitted, restored on reselect) | PASS |
| Stable candidate ordering | C: `actions.ts:253` sorts selected indexes; RPC line 113 `array_agg ... order by`; `task-candidate-form.tsx` sorts on every selection change | PASS |
| Immutable interpretation candidate unchanged | C: RPC never writes `entry_interpretations.task_candidates`; only reads it | PASS |

### Validation

| Requirement | Evidence | Status |
| --- | --- | --- |
| Title required, bounded (1-240) | C: contract + RPC lines 185-190; A: `candidate-editor.test.tsx:430,444` | PASS |
| Description bounded (≤2000) | C: contract + RPC lines 193-201; A: `candidate-editor.test.tsx:444` | PASS |
| Strict JSON / unknown fields rejected | C: `z.strictObject` in contract; RPC lines 135-149, 174-183 (exact key-count + allowlist checks) | PASS |
| Duplicates rejected | C: contract `superRefine` (indexes+edits); RPC lines 104-112 (selection), 166-168 (edits) | PASS |
| Unselected edits rejected | C: `actions.ts:222-224` (Server Action pre-check); RPC line 169-171 (DB-enforced, not trusted from the action) | PASS |
| Byte limit (131,072 bytes) | C: `candidate-edit-contract.ts:191-195`; RPC line 127 | PASS |
| Malformed due date rejected | C: RPC regex + cast lines 208-217; A: `candidate-editor.test.tsx` due-date error tests | PASS |
| Invalid timezone rejected | C: `candidate-due-date.ts:77-96` (`createTimezoneFormatter` throws on invalid IANA zone); `review-projection.ts:308-316` validates the stored profile timezone server-side before use | PASS |
| DST gap rejected | C: `candidate-due-date.ts:64-68` (zero matching instants in the ±1440-minute scan) | PASS |
| DST overlap rejected | C: `candidate-due-date.ts:52-60` (second match throws) | PASS |

### Confirmation

| Requirement | Evidence | Status |
| --- | --- | --- |
| RPC v2 used | C: `actions.ts:113` calls `confirm_entry_task_candidates_v2` exclusively; grep confirms no fallback call site to the legacy RPC anywhere in `src/` | PASS |
| Authenticated user derived server-side | C: `actions.ts:104` `auth.getUser()`; RPC line 42 `auth.uid()` — never a client-supplied ID | PASS |
| Ownership not trusted from client | C: RPC lines 222-227, 411-428 re-derive and re-check ownership independently of the Server Action | PASS |
| Tasks materialized atomically | C: single `plpgsql` function, one transaction, `for ... loop` insert with `on conflict ... do nothing` + explicit raise on conflict | PASS |
| Effective edited values stored | C: RPC lines 445-481 insert `effective_candidate` values, not raw client input | PASS |
| Audit and undo created | C: RPC lines 360-389 (`undo_operations` insert/idempotent branch), 507-529 (`audit_logs` insert) | PASS |
| Needs Attention preserved | C: no change to `list_needs_attention`/`attention-projection.ts`; confirming a subset still leaves remaining candidates as unconfirmed via unchanged `computeUnavailableCandidateIndexes` | PASS |
| No-edit confirmation supported | C: `edit_changes := '{}'::jsonb` fallback when no edit item matches (RPC line 269); A: `actions.test.ts:122` "empty canonical edit array" | PASS |

### Idempotency and concurrency

| Requirement | Evidence | Status |
| --- | --- | --- |
| Same key/same payload replay | C: RPC lines 391-409 (fingerprint match ⇒ return prior result, `idempotent: true`); A: `actions.test.ts:230` (no duplicate product event on replay) | PASS |
| Same key/different payload mismatch | C: RPC lines 398-403 (`2C_IDEMPOTENCY_MISMATCH`); C: `actions.ts:315-320` maps to localized `idempotency_mismatch` | PASS |
| Different keys/same candidate conflict | C: RPC lines 430-438, 487-490 (`2C_ALREADY_MATERIALIZED`, independent of operation key) | PASS |
| Correction vs. confirmation race | C: migration `202607190033` trigger; pgTAP `editable_candidate_confirmation_race.sql` (6 assertions: function exists, `SECURITY DEFINER`, empty search path, trigger installed, plus behavioral cases) | PASS |
| Retry behavior in UI | C: `task-candidate-form.tsx` keeps local edits/selection on any error, `retryable` flag surfaced per error code | PASS |
| Payload change rotates key | C: `task-candidate-form.tsx` `payloadSignature` comparison, `operationKeyRef.current = crypto.randomUUID()` only on signature change or after success | PASS |
| Replay does not duplicate analytics | C: `actions.ts:134-148` gates `recordProductEvent` on `!confirmation.idempotent`; A: `actions.test.ts:230` | PASS |

### UX and accessibility

| Requirement | Evidence | Status |
| --- | --- | --- |
| PT-BR / English | C: `confirmationCopy`/`formCopy`/editor `copy` objects define both; A: `candidate-editor.test.tsx:312` "renders the complete English copy" | PASS |
| Desktop / mobile | L: live Playwright run this pass, `desktop` + `mobile` (Pixel 7) projects, both passed | PASS |
| Keyboard navigation | A: `candidate-editor.test.tsx:490` "supports keyboard expansion and predictable field order" | PASS |
| Labels | A: `candidate-editor.test.tsx:380,390` (programmatic labels, native fieldset/legend) | PASS |
| Field errors | A: `candidate-editor.test.tsx:430,444,468` (error/field association) | PASS |
| Pending state | C: `task-candidate-form.tsx` `aria-busy`, disabled controls while `pending` | PASS |
| Recoverable error retention | C: `submitTasks` catch path keeps `editsByIndex`/`selected` state (no reset on error) | PASS |
| Success feedback | C: localized `created(count)` message + `role="status"` | PASS |
| Undo availability | L: live Playwright run — undo button appeared and was exercised | PASS |
| No accidental submit from clear/reset | A: `candidate-editor.test.tsx:399` "keeps every editor action form-safe" (buttons are `type="button"`, not submit) | PASS |
| 44px touch targets | A: `candidate-editor.test.tsx:539` | PASS |
| Live-region announcements | A: `candidate-editor.test.tsx:512` "announces reset through a polite live region" | PASS |

### Compatibility

| Requirement | Evidence | Status |
| --- | --- | --- |
| Legacy RPC preserved | C: migrations do not modify `confirm_entry_task_candidates`; grep confirms it is untouched | PASS |
| Remaining legacy consumers intentional | C: `src/features/interpretations/data.ts:197` reads (not writes) both `confirm_entry_tasks`/`confirm_entry_task_candidates` action types for undo-availability lookup — read-only compatibility, not a competing write path | PASS |
| Record-only flow preserved | C: unchanged `is_record_only` branch in the review page; RPC still rejects record-only interpretations | PASS |
| Correction flow preserved | C: only the new race-guard trigger touches `entry_interpretations` insert path; no other correction logic changed | PASS |
| Dismiss/reject/no-action behavior preserved | C: no changes to those code paths in this diff | PASS |
| Generated types synchronized | C: `database.types.ts` diff adds exactly the new RPC/column; `npx supabase db lint` and `tsc --noEmit` both clean | PASS |

### Analytics (PRD §14) — the one confirmed gap

| Requirement | Evidence | Status |
| --- | --- | --- |
| `candidate_edit_started` event | Grep across `src/` (code) and test files: no occurrence outside `docs/PHASE_2C_PRD.md` and `docs/PHASE_2C_IMPLEMENTATION_PLAN.md` | **FAIL (not implemented)** |
| `candidate_edit_reset` event | Same grep result | **FAIL (not implemented)** |
| `task_candidates_confirmed` includes `editedCandidateCount`/`editedFieldCount` | C: `actions.ts:146` sends only `{ candidateCount }` | **PARTIAL** (event fires, but without the two edit-count properties the PRD specifies) |

This maps to implementation-plan Task 5 ("Analytics and convergence"), whose
checklist items are unchecked in `docs/PHASE_2C_IMPLEMENTATION_PLAN.md:357-360`.
It is best-effort, fail-open telemetry with no bearing on correctness, security,
or data integrity — see §19 for the recommended fast-follow.

## 8. Automated verification

Run from a clean worktree at HEAD `bfb105d`, base `7d550ca`:

- `npm run lint` → **0 errors** (`eslint .`, exit 0).
- `npm run typecheck` → **0 errors** (`tsc --noEmit`, exit 0).
- `npm test` (`vitest run`) → **579/579 tests passed, 83/83 files passed**, 35.17s.
- `npm run build` (`next build`, Turbopack) → **compiled successfully**, all routes generated, exit 0.
- `git diff --check 7d550ca...HEAD` → **clean**, no whitespace-error markers.
- `npx supabase migration list` → local/remote parity through `202607190033`.
- `npx supabase db lint --linked --level error` → **0 findings**.

These figures match the "current verified state" this task was briefed with
(579/579, GREEN build, GREEN migration parity) and were independently reproduced
in this session, not merely re-cited.

### Focused Phase 2C.1 files (all included in the 579/579 total above)

- `src/features/tasks/candidate-edit-contract.test.ts`
- `src/features/tasks/candidate-due-date.test.ts`
- `src/features/tasks/candidate-editor.test.tsx`
- `src/features/tasks/task-candidate-form.test.tsx`
- `src/features/tasks/actions.test.ts`
- `src/features/daily-cycle/review-projection.test.ts`
- `src/app/[locale]/app/inbox/[entryId]/page.architecture.test.ts`
- `e2e/editable-candidate-confirmation.spec.ts` (run separately — see §9; not part of `npm test`)

Exact per-file counts were not itemized individually (Vitest reports aggregate
pass/fail per file, not per-suite in the summary line); all 83 files reported
passed with 0 failures, so every one of the files above is confirmed included and
green.

## 9. Manual/live user journeys

`node scripts/online-playwright.mjs e2e/editable-candidate-confirmation.spec.ts
--project=desktop --project=mobile` was re-run in this session against the linked
development Supabase project (the spec requires `ONLINE_SUPABASE_*` credentials,
which only this runner injects — a plain `npx playwright test` on this spec
correctly fails with "supabaseUrl is required", confirming the spec cannot
silently run against the wrong environment). **Result: 2/2 passed** (desktop +
Pixel 7, 28.1s), covering, against the real Server Action and real linked
database with a disposable authenticated fixture:

- Real PT-BR login, then navigating to a seeded entry with two task candidates.
- Expanding both candidate editors, editing the first candidate's title, and
  explicitly clearing the second candidate's description.
- Confirming both candidates via the real `confirm_entry_task_candidates_v2` RPC.
- Verifying the localized "2 tarefas criadas" success state and undo button.
- Clicking undo and verifying the UI reflects cancellation.
- Fixture teardown via `admin.auth.admin.deleteUser`, itself asserted to succeed.

This is **Journeys B (title edit), C (description clear), E (multiple
candidates), and I (undo)**, live, on both desktop and mobile, in PT-BR.

**Journeys not independently re-driven live in this session** (A no-edit
confirmation, D due-date edit, F deselect/reselect, G validation, H recoverable
server error, English locale in a live browser, J existing-flow regressions):
these rest on the automated evidence cited per-requirement in §7 — in particular
the 35-test `candidate-editor.test.tsx` suite exhaustively covers reset,
clear-vs-omit semantics, deselect/reselect draft retention (lines 331/351/366),
full English copy (line 312), and field-level validation errors (lines
430/444/468), and `actions.test.ts` covers server-side error-code mapping
(including the "sanitizes unexpected database failures" test) and the
never-forwards-ownership test. This is real, executed, passing automated
evidence, not a plausibility argument — but it is not the same as a fresh
ad-hoc manual browser session for every journey/locale/viewport combination in
this pass. Given the exhaustiveness of the automated suite and the one live
end-to-end confirmation above, this is judged sufficient for acceptance; if the
team wants full manual coverage of every remaining journey × locale × viewport
combination before push, that is a reasonable additional step but is not, in this
reviewer's judgment, required to clear this gate (see §20).

Attempting to independently query the linked project's user table via a
read-only Node script to verify "exactly two pre-existing users, unchanged" was
blocked by the environment's permission classifier (service-role credential use
outside an established test/smoke script). This was not worked around. The claim
of pre-existing-user preservation rests on the previously documented
`PHASE_2C_SLICE_01_DATABASE_GREEN.md` evidence plus the fact that this session's
only write to the linked project was the E2E spec's own disposable
fixture, which the spec itself asserts is deleted.

## 10. Desktop/mobile visual review

Direct code/CSS review (no new screenshots were captured this session beyond
Playwright's own pass/fail, since headless Playwright does not produce a viewable
image artifact on success and a fresh manual `/browse` session against a
freshly-seeded candidate would have required building new disposable fixtures —
judged out of proportion to the already-exhaustive automated accessibility/layout
suite):

- `candidate-editor.test.tsx:539` asserts every actionable control (checkbox,
  edit/reset/clear buttons) remains ≥44px at a narrow viewport — this is the
  concrete mobile-touch-target requirement, executed under jsdom with the actual
  rendered box model, not just CSS inspection.
- The component uses a native `<fieldset>`/`<legend>` and CSS grid
  (`display: "grid", gap: 9`) for the candidate row (`task-candidate-form.tsx`),
  consistent with the one-column mobile / bounded-two-column desktop layout the
  PRD specifies; no fixed-width or overflow-prone element was found in the diff.
- The live Playwright run (§9) exercised the real rendered mobile (Pixel 7) and
  desktop viewports end-to-end without failure, which would have caught a gross
  layout/interaction break (unclickable control, overlapping element blocking a
  click) since the test drives real clicks against real accessible-name locators.

No horizontal-overflow, clipped-label, or overlapping-control defect was found in
code or in the live run. This is real but partial evidence for §7's visual
checklist — a dedicated design-review pass with fresh screenshots was not
performed this session (see §19).

## 11. Localization review

- `confirmationCopy`, `formCopy` (`actions.ts`, `task-candidate-form.tsx`), and
  the editor's `copy` object all define parallel `"pt-BR"`/`"en"` entries; no
  hardcoded locale string outside these tables was found in the changed files.
- `candidate-editor.test.tsx:312` specifically asserts the complete English copy
  contract, not just that English exists.
- The live Playwright run exercised PT-BR end-to-end; English was not
  independently re-run live this session (rests on the component-test coverage
  above).
- Required copy pairs from PRD §10.5 (Edit/Edited/Original/Reset/Clear
  description/Clear due date/Timezone hint/Stale conflict/Idempotency mismatch)
  were spot-checked against `candidate-editor.tsx` and `actions.ts` and matched.

## 12. Accessibility review

Strong automated coverage, not spot-checked plausibility: labels/names
(`candidate-editor.test.tsx:380`), native fieldset/legend
(`:390`), form-safety of every action button (`:399`), title/field error
association (`:430,444`), keyboard order (`:490`), live-region announcements
(`:512`), focus retention after reset (`:525`), and 44px targets (`:539`). No
`div`-as-button, no missing accessible name, and no error rendered without a
programmatic association were found in the reviewed source.

## 13. Security/privacy review

Conducted as an attacker against the RPC and Server Action:

- **Cannot select another user's entry**: RPC filters `entry_interpretations`/`entries` by `user_id = current_user_id` derived from `auth.uid()`, never from a parameter (migration `202607190032` lines 222-227, 411-419).
- **Cannot set owner**: no `p_user_id`/similar parameter exists on the RPC signature; `current_user_id` is `auth.uid()` only.
- **Cannot supply task/audit/undo/fingerprint IDs**: all are server/database-generated (`gen_random_uuid()` defaults, `RETURNING id`); the RPC signature has no parameter for any of them.
- **Cannot inject unknown edit fields**: RPC lines 135-149 reject any edit object without exactly `{candidateIndex, changes}`, and lines 174-183 reject any `changes` key outside `title`/`description`/`dueAt`; the client Zod schema is `z.strictObject` (rejects unknown keys before the request is even sent, defense-in-depth, not the trust boundary).
- **Cannot edit an unselected candidate**: rejected independently at the Server Action (`actions.ts:222-224`) and, authoritatively, inside the RPC (line 169-171) — the RPC does not trust the Server Action's pre-check.
- **Cannot duplicate candidate indexes**: rejected in the selection array (RPC lines 104-112) and in the edit array (line 166-168), plus client-side `superRefine` duplicate checks.
- **Anonymous action fails**: both `confirmEntryTasks` (`actions.ts:104-111`) and the RPC (`auth.uid() is null` → `42501`) independently reject an unauthenticated caller.
- **Cross-owner action fails**: covered above; additionally `revoke all ... from public, anon` / `grant execute ... to authenticated` on the RPC (migration lines 539-542) and the guard trigger (`revoke all ... from public, anon, authenticated` — line 42-43 of migration `202607190033`, since only the trigger mechanism, not a direct caller, should ever invoke it).
- **`auth.uid()` used**: confirmed, the only identity source in both migrations.
- **`SECURITY DEFINER` safe search path**: both functions declare `set search_path = ''` and fully qualify every reference (`pg_catalog.*`, `public.*`, `extensions.digest`).
- **Trigger function has no public execution**: confirmed revoked from `public, anon, authenticated`; only reachable via the `BEFORE INSERT` trigger itself.
- **No SQL/relation/key/UUID/other-user data in user-facing errors**: `mapConfirmationRpcError` (`actions.ts:297-346`) matches on `error.code`/exact `error.message`/`error.details` strings and returns only pre-written localized copy; `actions.test.ts:344` ("sanitizes unexpected database failures") and `:325` ("does not map an unrelated 55P03...") specifically assert an unmatched/unrelated error never leaks its raw `message`/`details`/error code text to the user.
- **No secrets in logs**: no `console.*` call exists anywhere in the diff (grep confirmed empty); no service-role key, access/refresh token, password, or database URL literal was found in any changed file (grep for JWT-shaped/`sk-`-shaped/PEM-header strings across `*.ts,*.tsx,*.sql,*.mjs,*.md` returned zero matches).
- **Smoke scripts don't commit credentials**: `scripts/remote-editable-candidate-confirmation-smoke.mjs` and `e2e/editable-candidate-confirmation.spec.ts` both read credentials from `process.env.ONLINE_SUPABASE_*`, sourced at runtime by `scripts/linked-supabase.mjs` from the local Supabase CLI session — no literal credential in either file.
- **Disposable fixtures removed**: the E2E spec's `afterAll` deletes its disposable user via `admin.auth.admin.deleteUser` and asserts the deletion succeeded (lines 152-163).
- **Existing users/baseline data preserved**: this session made no destructive database call; the only linked-project write was the E2E spec's own disposable, torn-down fixture. A direct re-verification of the exact pre-existing user count was attempted and blocked by the environment's own permission classifier (service-role script execution) — not bypassed; see §9. This rests on `PHASE_2C_SLICE_01_DATABASE_GREEN.md`'s prior documented evidence.

No `55P03` or SQLSTATE code was found anywhere it would leak to a user; every
occurrence is either inside the SQL migration (server-side) or matched
exhaustively against known codes in `mapConfirmationRpcError` before any message
reaches the client. Grep confirmed no dangling `55P03`/`40001` catch-all that
would rethrow a raw message. No disposable test data prefix leaked into
production-facing code (the fixture prefix in the E2E spec exists only inside
the test file).

## 14. Idempotency/concurrency review

See the "Idempotency and concurrency" subsection of §7 — every PRD requirement in
that table is backed by specific code and, for the correction/confirmation race,
by a dedicated pgTAP file (`editable_candidate_confirmation_race.sql`, 6
assertions including `SECURITY DEFINER`/empty-search-path/trigger-installed
checks). The idempotency design (canonical-JSON SHA-256 fingerprint stored
alongside the existing `operation_key` unique constraint on `undo_operations`) is
a genuinely sound approach: it reuses the existing undo/idempotency table rather
than adding a new one (matching PRD §11's explicit "no candidate-draft table"
non-goal), and distinguishes "same logical retry" (fingerprint match → replay)
from "same key reused for a different logical action" (fingerprint mismatch →
hard error) without a second round trip.

## 15. Compatibility and regression review

See the "Compatibility" subsection of §7. The legacy `confirm_entry_task_candidates`
RPC is untouched by either migration (confirmed by grep — the string appears only
inside the new RPC's own action-type value and the race guard's filter condition,
never as a function being altered or dropped). Record-only, correction, and
no-action/dismiss flows are unmodified in this diff. `database.types.ts` only
adds the new RPC/column, and both `tsc --noEmit` and `db lint` are clean, so no
generated-type drift exists.

## 16. Performance/maintainability review

- **`CandidateEditor` instance count**: one per rendered candidate (typically 1-3
  per entry in this product), not a concern at this scale.
- **The ±1440-minute (2,881-instant) DST scan**: runs in exactly three places —
  (a) `candidate-editor.tsx:188`, only when the profile timezone itself changes
  (rare, not per-keystroke); (b) line 516, once at submission time; (c) line 574,
  inside `validateDueDate`, which **does** re-run on every render once the due-date
  field has been touched (`dueDateTouched`), i.e., on every keystroke/change in a
  native `datetime-local` input. Each scan iteration is a single
  `Intl.DateTimeFormat.formatToParts` call, which V8 implements natively and
  efficiently; with at most a handful of due-date fields per entry, this is not a
  demonstrable performance problem at the current expected candidate count and
  interaction pattern (native `datetime-local` inputs fire far less frequently
  than free-text keystrokes). No fix was made, per the task's explicit
  instruction not to prematurely optimize; if candidate counts or interaction
  patterns change materially, memoizing per-value validation results would be the
  straightforward follow-up (see §19).
- **Server Action request size**: bounded by the same 131,072-byte serialized-edit
  limit enforced both client- and server-side; not a concern.
- **Database locks**: the RPC takes a `for update` row lock only on the specific
  owned `entries` row being confirmed, for the duration of one transaction; no
  broader lock was introduced.
- **Analytics scheduling**: `recordProductEvent` runs inside `after()`, non-blocking, matching the existing capture-flow pattern.
- **Test runtime**: full suite 35.17s (579 tests, 83 files) — no regression signal; the online E2E spec (2 tests) completed in 28.1s.

## 17. Linked-environment data preservation

No destructive operation was run against the linked project in this session. The
only write was the E2E spec's own disposable authenticated user and its
associated rows, torn down by the spec's own `afterAll` (asserted to succeed).
Migration list and `db lint` checks used were read-only. A direct re-count of
existing users was attempted and blocked by the permission classifier (not
bypassed) — see §9 and §13 for what this rests on instead.

## 18. Unresolved findings

None classified as **blocker** or **important** in the release-blocking sense
(the categories in the task's own examples: edits lost, wrong candidate
submitted, idempotency key rotating incorrectly, raw database errors exposed,
mobile UI unusable, Server Action trust issues — none of these were found).

One **important-but-non-blocking** finding, fixed during this pass:

- `docs/STATE.md`, `docs/TODO.md`, and `docs/CHANGELOG.md` still read "Phase 2C
  planning approved; implementation not started" despite Slice 2C.1 being fully
  implemented across 7 commits with all gates green. This is a documentation
  closeout gap left by the implementation slices (none of the 7 commits in this
  branch touched these three files) and would have misrepresented project status
  to anyone reading them while this branch sits unpushed. **Fixed in this
  session** — all three files updated to describe Slice 2C.1 as implemented on
  this branch, not pushed/merged/deployed, with the analytics gap below called
  out explicitly. This is a documentation-only, additive, reversible change.

One **non-blocking observation**, not fixed (see §19 for why and the recommended
next step):

- PRD §14 / implementation-plan Task 5's `candidate_edit_started`,
  `candidate_edit_reset` events and `task_candidates_confirmed`'s
  `editedCandidateCount`/`editedFieldCount` properties are not implemented. This
  is best-effort, fail-open analytics — it does not affect correctness, security,
  ownership, idempotency, or any user-facing behavior — but it is a real,
  confirmed gap against the approved PRD's Phase 2C.1 scope, not a plausible
  "probably fine" guess: grep confirms zero occurrences of either event name
  anywhere outside the two planning documents.

## 19. Non-blocking follow-ups

1. Implement the PRD §14 analytics extension (`candidate_edit_started`,
   `candidate_edit_reset`, and the two extra properties on
   `task_candidates_confirmed`) as a fast-follow. This is new client-side
   instrumentation wiring (event emission on editor expand and on reset click,
   plus threading edit counts into the existing confirmation event) — outside
   this acceptance task's "no new functionality" mandate, so it was documented
   rather than implemented here.
2. If the team wants full manual, fresh-screenshot coverage of every remaining
   journey (A, D, F, G, H) × both locales × both viewports beyond what the
   exhaustive component-test suite and the one live E2E pass already cover, that
   is a reasonable pre-push nice-to-have, not a blocker per this review's
   judgment.
3. Consider memoizing `validateDueDate`'s scan result per input value if due-date
   field interaction ever becomes higher-frequency (e.g., a text-based date
   input instead of the native picker) — not warranted today.
4. `undo_operation`'s own separate SQLSTATE `40001` raise remains a pre-existing,
   out-of-scope-for-this-slice platform risk already tracked in `SECURITY.md` and
   `TODO.md` (unrelated to Phase 2C.1; noted here only because it was visible
   during error-code review).

## 20. Branch readiness verdict

**READY WITH NON-BLOCKING NOTES.**

Every PRD §7-§13 functional, security, idempotency, and compatibility
requirement for Phase 2C.1 passes with concrete evidence. All automated gates are
green and were reproduced in this session, not merely cited. The one confirmed
gap (analytics extension) is additive, fail-open telemetry explicitly out of this
acceptance task's implementation mandate, and does not block a merge on its own —
but it should be tracked and closed promptly so the shipped analytics surface
matches the approved PRD. The documentation staleness finding was fixed in this
session. No critical or important functional/security finding remains open.

## 21. Recommended PR title

```
feat(tasks): allow editing candidates before confirmation
```

## 22. Recommended PR description

```markdown
## Problem

Task candidates surfaced from AI interpretation could only be confirmed
verbatim or dropped entirely — there was no way to fix a wrong title, clear an
unwanted description, or correct a due date before materializing a task.

## Solution

Adds a versioned confirmation RPC (`confirm_entry_task_candidates_v2`,
migrations `202607190032`/`202607190033`) that accepts a bounded, closed-allowlist
edit per selected candidate (title/description/dueAt), re-validates everything
server-side, canonicalizes effective values, and atomically materializes tasks
in one transaction. A new inline `CandidateEditor` lets users expand a
candidate, edit any of the three fields, see the immutable original suggestion
alongside a change, and reset to it. The legacy `confirm_entry_task_candidates`
RPC is unchanged and still callable.

## Database migrations

- `202607190032`: adds `confirm_entry_task_candidates_v2` and a
  `request_fingerprint` column on `undo_operations` for idempotent replay
  detection.
- `202607190033`: adds a trigger guarding against a correction racing ahead of
  an active v2 confirmation.

Both are additive; the legacy RPC and its callers are untouched. Rollback is a
standard forward-migration revert; no destructive change to existing data.

## UX behavior

Each actionable candidate is a selected-by-default card with an "Edit
suggestion" control. Edits are transient client state until submission;
deselecting a candidate suspends (not discards) its local edits; reselecting
within the same page restores them. Clearing description/due date is explicit
`null`, distinct from leaving a field untouched.

## Validation

Client-side Zod validation mirrors server/database validation exactly (title
1-240 chars, description ≤2000, closed edit-object shape, 131,072-byte
serialized bound); the database is the actual trust boundary and re-validates
everything independently.

## Timezone/DST behavior

Due-date editing uses the profile's IANA timezone. Local wall time is converted
to an offset instant by scanning ±24 hours around the naive interpretation and
matching formatted wall-clock output; a nonexistent (DST gap) or ambiguous (DST
overlap) local time is explicitly rejected rather than guessed.

## Idempotency/concurrency

A SHA-256 fingerprint of the canonical request is stored with the existing
`operation_key` idempotency row: same key + same payload replays the prior
result; same key + different payload is a hard error; a candidate already
materialized under a different key is rejected atomically. A new trigger
prevents a correction from superseding an interpretation that a v2 confirmation
already materialized tasks against.

## Security

`auth.uid()` is the only identity source in both the Server Action and the RPC;
ownership is re-checked at the database boundary independently of the Server
Action; the JSON edit parser is closed and bounded at every level; no raw
SQL/PostgREST error text reaches the UI.

## Tests

579/579 unit/component tests, dedicated pgTAP coverage for the RPC and the race
guard, a disposable-fixture Playwright journey (desktop + mobile) through the
real Server Action and linked database, and a disposable remote smoke script.

## Manual verification

See `docs/reports/PHASE_2C_SLICE_01_FINAL_ACCEPTANCE.md` for the full
requirement-by-requirement acceptance matrix and journey evidence.

## Screenshots

Not attached — see the linked report for why, and the live Playwright evidence
that was captured instead.

## Migration/rollback notes

Both migrations are additive. No destructive change. The legacy RPC remains
callable, so the old UI path (if ever needed) still works without reverting
this migration.

## Remaining scope

Slices 2C.2-2C.6 (planning/priority/no-due semantics, owned relations,
dispositions, structure/graph materialization, and final convergence) are not
part of this PR. A known, tracked gap: the `candidate_edit_started`/
`candidate_edit_reset` analytics events and two extra properties on
`task_candidates_confirmed` (PRD §14) are not yet implemented — tracked as a
fast-follow in `TODO.md`.
```

## 23. Recommended reviewer checklist

- [ ] Migration `202607190032`: RPC bounds/allowlist/idempotency logic, `SECURITY DEFINER`/`search_path=''`, grants restricted to `authenticated`.
- [ ] Migration `202607190033`: trigger logic, `SECURITY DEFINER`/`search_path=''`, no public/authenticated execute grant.
- [ ] RPC v2 is the only confirmation path called from `actions.ts`; no fallback to the legacy RPC.
- [ ] Server Action boundary: no client-supplied ownership/task/audit/undo ID is ever forwarded to the RPC.
- [ ] Idempotency: fingerprint-based replay/mismatch/already-materialized behavior, confirmed by pgTAP and unit tests.
- [ ] `CandidateEditor` UX: edit/reset/clear semantics, edited indicator, immutable original visible alongside a change.
- [ ] Timezone/DST: gap and overlap rejection, profile-timezone threading from `review-projection.ts` through to the editor.
- [ ] Accessibility: fieldset/legend, labels, live regions, focus management, 44px targets (component-test-verified).
- [ ] Undo: cancels exactly the tasks created by the confirming operation, audit evidence recorded.
- [ ] Record-only compatibility: unaffected by this change (still rejected inside the RPC).
- [ ] Analytics replay behavior: `task_candidates_confirmed` does not double-fire on an idempotent replay; note the missing `candidate_edit_started`/`candidate_edit_reset` events as a known, tracked gap, not a silent omission.
- [ ] Linked-data preservation: confirm independently (outside this review, which was blocked from direct credential use) that pre-existing users/records are unaffected before merging.

## 24. Exact next action

Push the branch and open the pull request described above for review.
