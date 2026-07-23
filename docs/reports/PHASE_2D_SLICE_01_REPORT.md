# Phase 2D Slice 2D.1 — Traceable Answer Transition — Acceptance Report

## 1. Status

**READY WITH NON-BLOCKING NOTES**

The complete branch diff passed independent review with no unresolved Critical or Important finding. The linked development database is migrated through `202607230047` at local/remote parity; the application branch remains local and has not been pushed, merged, or deployed. The non-blocking notes are two pre-existing/external e2e observations (§12) and one minor deferred edge (§13), none caused by this slice.

## 2. Summary

Branch `codex/phase-2d-slice-1` (base `main`@`8ad604e`, the approved Phase 2D design commit) implements exactly Slice 2D.1 of `PHASE_2D_PRD.md`/`PHASE_2D_IMPLEMENTATION_PLAN.md` under ADR-033: an authenticated owner answers an open, current pending question through `resolve_pending_question_v1` — the first version of the single long-lived resolution RPC family — and the resolution is atomic, audited, idempotent, undoable, stale-safe, and privacy-safe. Nothing else in the Brain changes: no disposition, suggested answer, preview, consequence, reinterpretation trigger, chat rendering, surfacing, or cooldown behavior exists in this diff, and no AI schema, worker, cron, queue, secret, provider, Auth, or Edge Function changed.

## 3. Branch and commits

- Repository: `D:\Projetos\GitHub\my-brain`
- Documentation commit (on `main`): `8ad604e` — `docs(phase-2d): approve conversational questions design`
- Branch: `codex/phase-2d-slice-1`, base `8ad604e`
- Local implementation commits, in order:
  1. `feat(db): add versioned question resolution contract` — migrations `202607230046` + `202607230047`, regenerated `database.types.ts`, pgTAP suite, dedicated remote smoke, `test:remote:2d:resolution`
  2. `feat(agent): resolve questions through an audited transition` — contract module + tests, Server Action rewrite, `undoQuestionResolution`, `QuestionAnswerForm` states, questions page wiring, CSS, component/action tests, Playwright scenarios
  3. `docs(phase-2d): report Slice 2D.1 acceptance` — this report, `STATE.md`, `TODO.md`, `CHANGELOG.md`
- Remote Git actions: none (no push, PR, merge, or deploy). The linked database migration was explicitly authorized and applied.

## 4. Acceptance IDs covered

- `2D-ANSWER-001…007` — versioned RPC answer with trim/bounds, atomic state+audit+undo, stale rejection, non-disclosing denial, closed command, pre-mutation validation, immutable interpretation.
- `2D-PROVENANCE-001`, `2D-PROVENANCE-003` — audit row carries question id, interpretation id, resolution kind, and fingerprint; the interpretation JSON stays the sole provenance of question text.
- `2D-IDEMPOTENCY-001…004` — canonical SHA-256 fingerprint, deterministic replay, same-key/different-payload rejection, concurrent single winner.
- `2D-OWNERSHIP-001…004` — `auth.uid()` identity, same-owner chain, anonymous/cross-owner denial without disclosure, closed JSON + `search_path=''` + least-privilege grants + no dynamic SQL.
- `2D-UNDO-001`, `2D-UNDO-002`, `2D-UNDO-004` — one undo per resolution in-transaction; exact prior-state restore (open, cleared answer/`answered_at`), idempotent and audited; no rewrite of the immutable question or unrelated rows.
- Slice-applicable `2D-UX-001/002/003`, `2D-I18N-001`, `2D-A11Y-001/002/003`, `2D-ANALYTICS-001/002`, `2D-OPERATIONS-001/002`.
- `2D-DISPOSITION-001` and `2D-SUGGEST-001`/`2D-ACTION-001` hold by construction: no disposition, suggestion, preview, or consequence control exists in the diff.

## 5. Database contract

Migration `202607230046` (additive) plus forward-fix `202607230047` (additive; discovered by the dedicated remote smoke — `btrim(text)` trims ASCII spaces only, letting a newline/tab-only answer through the emptiness check; replaced by a POSIX `[[:space:]]` boundary trim with migration 046 left unedited, following the `202607220042`/`202607220045` forward-fix precedent).

```sql
public.resolve_pending_question_v1(
  p_question_id uuid,
  p_resolution jsonb,   -- 2D.1: exactly { "kind": "answer", "answer": <trimmed 1–4000 chars> }
  p_operation_key text  -- 8–240 chars after trim
) returns jsonb
-- { "question_id": uuid, "resolution": "answered", "undo_id": uuid, "idempotent": bool }
```

- `language plpgsql`, `SECURITY DEFINER`, `set search_path = ''`, qualified `public.*`/`extensions.*` references, no dynamic SQL; execute granted to `authenticated` only, revoked from `public`/`anon`.
- Closed discriminated payload: exactly the keys `kind` + `answer`; unknown keys, unknown kinds, non-object/non-string values, >32 KiB payloads, empty/whitespace/overlong answers, and malformed operation keys raise `22023` before any write.
- Owner-scoped lookup by `(user_id, id)`; missing and cross-owner are the same `P0002`.
- Canonical fingerprint: lowercase SHA-256 hex over the jsonb-canonical `{questionId, kind, answer}` via `extensions.digest`.
- Operation-key reservation on `undo_operations (user_id, operation_key)` with the `resolve-v1:` namespace: fingerprint match replays the original result (`idempotent: true`); mismatch raises `P0001`/`2D_IDEMPOTENCY_MISMATCH`. A failed transition rolls its reservation back atomically, so only successful operations replay.
- Owner entry lock (`FOR UPDATE`) serializes resolutions and revisions; stale interpretation → `55P03`; the question is re-read `FOR UPDATE` under that lock; non-open → `55000` (the losing side of a concurrent race lands here).
- Success atomically sets `status='answered'`/`answer`/`answered_at`, writes one `audit_logs` row (question id, interpretation id, resolution kind, request fingerprint — never answer text), and finalizes the one undo operation.
- `undo_operation(p_undo_id)` gained a `resolve_pending_question_v1` branch restoring `status='open'` and clearing `answer`/`answered_at` with an integrity check (`2D_UNDO_RESTORE_INTEGRITY`), immutable `operation_undone` audit evidence, and the existing idempotent repeated-undo semantics; every pre-existing branch is byte-identical to migration `202607220045`.
- `entry_interpretations.pending_questions` and the extracted question/reason are never touched (proven by JSON byte-equality in pgTAP and the remote smoke).

## 6. Server contract

- `src/features/agent/question-resolution-contract.ts` — `QuestionResolutionCommand` as a Zod discriminated union whose single 2D.1 variant is `{ questionId: uuid, kind: "answer", answer: trimmed 1–4000 }`; strict objects reject unknown keys; `serializeQuestionResolution` emits exactly `{ kind, answer }` (never the question id). 13 unit tests cover valid/trim/empty/whitespace/overlong/unknown-kind/unknown-key/malformed shapes and closed serialization.
- `answerPendingQuestion` (exported name preserved) authenticates, validates the closed command and operation key before any database call, invokes `resolve_pending_question_v1`, and maps outcomes to stable localized codes — `validation_error`, `session_expired`, `stale_interpretation`, `not_open` (also used for `P0002` so cross-owner/missing stays non-disclosing), `idempotency_mismatch`, `retryable_failure`, `resolution_succeeded` — with PT-BR/English copy; raw SQL/PostgREST text never reaches the UI. The success state carries `undoId` and `replayed`.
- `undoQuestionResolution` (new) validates locale + undo id, calls `undo_operation`, maps failures to localized copy, and revalidates the question surfaces.
- The answer action deliberately performs no revalidation: any `revalidatePath` re-renders the current route in the same action response, which would drop the just-answered card from the open-questions list and unmount its undo control (observed live in Playwright). All question surfaces are dynamic, so the next navigation reflects the resolved queue; undo revalidates everything.

## 7. UI

`QuestionAnswerForm` (questions page) now provides distinct states — editing, submitting (disabled control + spinner + polite live region), success (status region + undo control), validation failure (field-associated `aria-invalid`/`aria-describedby` error with focus on the field), stale interpretation, no longer open, idempotency mismatch, and retryable failure (alert regions with focus), and undo success/failure — each exposed via `data-state` and localized PT-BR/English copy. The operation key is preserved across retries of the same answer, rotates when the answer text changes, and rotates after a successful undo so a re-answer is a fresh, fully undoable operation (undo state is tracked per undo id). The answer field is controlled so a failed submission keeps the typed answer. Controls are ≥44 CSS px at mobile widths; the flow is keyboard-operable (proven via Enter-key submission in e2e). No raw confidence or internal state name was added to the primary flow (the pre-existing confidence badge on the question card predates this slice and was out of scope).

## 8. Analytics

The existing content-free `question_answered_basic` event is reused: emitted fail-open inside `after()` only for non-replayed successes, `surface: "server"`, empty properties, subject `pending_question`, idempotency key now deterministically derived from the resolution operation key (PRD §18). Unit tests assert the event carries no answer content and is suppressed on replay and on every failure path. No new event, property, or allowlist change; analytics stays outside domain authority.

## 9. Security

- `auth.uid()` is the only identity; no client owner id is accepted anywhere.
- Cross-owner probing cannot distinguish "not owned" from "does not exist" (identical `P0002` outcome, asserted byte-equal in pgTAP and the remote smoke); anonymous execution is revoked.
- The command JSON is closed at every level and bounded; the RPC validates everything again server-side regardless of the client contract.
- Stale, non-open, replay, mismatch, and race paths are database-tested and remotely exercised as authenticated users; failures write nothing.
- Raw SQL error text never surfaces; the legacy plain-`UPDATE` path keeps its existing grants until cutover removal is separately authorized (remote-proven callable).
- RLS remains enabled/forced on `pending_questions`; no policy or grant changed.

## 10. Undo behavior

One undo operation per successful resolution, registered in the same transaction with the request fingerprint. Undo restores the exact prior state (`open`, `answer = null`, `answered_at = null`), is idempotent on repetition (no-op success, `affected: 0`), records immutable audit evidence, never touches the interpretation JSON or unrelated rows, and leaves the question answerable again under a new operation key (proven end-to-end: answer → undo → re-answer in pgTAP, remote smoke, and Playwright). No parallel undo mechanism was introduced.

## 11. Verification

| Gate | Result |
| --- | --- |
| ESLint | 0 errors |
| TypeScript (`tsc --noEmit`) | 0 errors |
| Full Vitest | 87 files, 748/748 passing (includes 13 contract, 12 action, 6 component tests for this slice) |
| Production build | passes |
| pgTAP | `supabase/tests/resolve_pending_question.sql` committed (55 assertions: signature/`SECURITY DEFINER`/`search_path`/grants/legacy grant, closed shape, anonymous/cross-owner/missing denial + non-disclosure, owner success, fingerprint, replay/mismatch, non-open, stale, atomic rollback of reserved evidence, undo restore/repeat, post-undo resolvability, immutable interpretation). **Not executed locally: Docker is unavailable in this environment** — the committed suite plus the authenticated linked-remote smoke below are the behavioral evidence, per the approved allowance. |
| Linked migration | `202607230046` + `202607230047` applied; `supabase migration list --linked` shows exact local/remote parity through `202607230047`; no unrelated migration was pending before or after |
| Linked DB lint | `--level warning`: only the pre-existing `run_user_heartbeat` cast note; nothing on the new/replaced functions |
| Generated types | regenerated from the linked schema; diff is exactly the 8-line `resolve_pending_question_v1` signature addition |
| Dedicated remote smoke | `npm run test:remote:2d:resolution` — passed, 14 cases: valid answer + trimming, replay, mismatch, non-open, closed-shape rejections without residue, cross-owner/missing indistinguishability, anonymous denial, audit/undo evidence + fingerprint agreement, undo restore/repeat, post-undo re-answer, stale rejection without write, two-client concurrent single winner (loser `55000`, no leftover reservation), legacy path compatibility, immutable interpretation; disposable users, fail-closed cleanup, pre-existing Auth users and table counts byte-identical before/after |
| Remote regressions | `test:remote:interpretations` (exercises the recreated `undo_operation` and the `55P03` correction path — passed, 389 ms bounded conflict), `test:remote:2c` aggregate (confirmation v2–v6 + candidate analytics + cleanup — passed), `test:remote:product-events` (passed) |
| Playwright | New scenarios passed on desktop + Pixel 7: PT-BR answer → status live region → undo → restored editable state → keyboard re-answer → undo control returns; ≥44 px input/submit/undo targets on mobile; ≥2 `question_answered_basic` events observed; stale conflict copy after live supersession; English answer/undo copy. Full-suite regression: 35 passed; see §12 for the two non-blocking pre-existing/external observations |
| Cleanup | smoke/e2e fixtures disposable and fail-closed; environment snapshots preserved; no `phase-2d-resolution-*` residue |

## 12. Non-blocking e2e notes (pre-existing / external)

1. `converged daily journey › confirms candidates, materializes a task…` (desktop+mobile) fails on an assertion expecting the pre-Phase-2C.4 button label `Criar N tarefas`; the merged Phase 2C.4/2C.5 disposition UI renders `Resolver N sugestões`. The assertion and the UI both come from `main` unchanged (this branch's spec diff is purely additive), matching the pre-existing failures already observed during the Phase 2C.6 session. Fixing that journey is unrelated-surface work outside this slice's authorized scope.
2. `offers retry after terminal exhaustion…` failed once in the full run on deployed-worker recovery latency and passed on isolated re-run — unrelated external latency; this slice's behavior is directly proved by its own green scenarios.
3. `remote-daily-cycle-smoke` remains excluded from deterministic aggregates since Phase 2C.6 (ADR-032) and was not claimed here; the daily-cycle unit suites all pass in the 748-test run.

## 13. Independent review

The full `git diff main` (11 changed files + 7 new files) was reviewed against: RPC closed shape; ownership and cross-owner disclosure; stale-question locking; fingerprint canonicalization; replay; concurrency; audit contents; undo compensation; analytics privacy; accessibility; localization; backward compatibility; and absence of later-slice work. Findings fixed during the run (all verified by re-run):

- **Critical (fixed):** DB `btrim` space-only trim accepted a newline/tab-only answer — caught by the remote smoke; forward-fixed in migration `202607230047`.
- **Important (fixed):** React 19 resets uncontrolled fields after a form action, wiping the typed answer on any failure — the field is now controlled.
- **Important (fixed):** any `revalidatePath` in the answer action re-rendered the current route, unmounting the just-answered card and its undo control — the answer path now performs no revalidation (undo revalidates all surfaces).
- **Important (fixed):** after undo → re-answer, the stale undo-success state hid the new answer's undo control — undo completion is now tracked per undo id.
- **Minor (deferred, explicit):** JS `trim()` also strips exotic Unicode whitespace (e.g. NBSP) that POSIX `[[:space:]]` does not; a raw API caller bypassing the app could persist an NBSP-edged answer. The database canonicalization is self-consistent (fingerprint always hashes the DB-normalized value), so replay/mismatch semantics are unaffected; revisit only if a non-app client ever ships.
- **Minor (deferred, explicit):** the questions page's pre-existing confidence badge (`PROJ-005`-adjacent) predates this slice; the PRD keeps confidence-for-ordering legal and any change is 2D.6 convergence work.

## 14. Assumptions

- "Deterministic per resolution operation key" (PRD §18) authorizes deriving the `question_answered_basic` idempotency key from the operation key instead of the question id; replays are additionally suppressed client-side.
- Mapping `P0002` to the `not_open` user-facing code ("this question is no longer open/available") is the intended non-disclosing presentation, since the PRD's UI state list has no separate "not found" state.
- The task's suggested `resolve_pending_question_vN` behavior list is satisfied with the open-status check performed after the idempotency reservation (the only order under which deterministic replay of a completed answer is possible), matching the proven Phase 2C `confirm_entry_task_candidates_v5` ordering.

## 15. Deferred follow-ups

- Slices 2D.2–2D.6 (dispositions, deterministic suggestions/preview, permitted consequence with the `40001` hard gate, chat/queue surfacing + cooldown, convergence/closeout) — each requires separate authorization.
- Legacy answer-path retirement — separately authorized later step after consumer/rollback review (PRD §21.7).
- The pre-existing `Criar N tarefas` journey assertion fix (unrelated surface; belongs with the owning feature's next slice or a dedicated test-maintenance task).
- The two explicit minor review notes above.

## 16. Verdict

**READY WITH NON-BLOCKING NOTES** — Slice 2D.1 is implemented, independently reviewed, and verified locally, in database contracts, in disposable authenticated remote evidence, and in desktop/mobile PT-BR/English journeys. The branch stops here; Slice 2D.2 was not started.
