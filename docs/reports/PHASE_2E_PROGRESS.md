# Phase 2E — Execution Progress

**Status: IN PROGRESS — Slice 2E.4 ACCEPTED. Slice 2E.5 next.**

This file is the handoff between execution sessions. It is authoritative for *where the work stands*; `docs/PHASE_2E_PRD.md` remains authoritative for *what the work is*.

## Repository state

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` (tracks its remote, in sync) |
| Branch HEAD | `bfa28a1` |
| Phase base | `2e2acfd` |
| Working tree | clean |
| Draft PR | [#18](https://github.com/fabiokyrillos/my-brain/pull/18) — CI evidence only, **must not be merged before Slice 2E.8** |
| CI | **all three jobs green** on `bfa28a1` (run `30227374101`): `application`, `edge worker`, `database and journey`. The pgTAP suite reports `Files=28, Tests=1059, Result: PASS` |
| Merged / tagged / released | nothing |

**Drift corrected on entry to this session** (both docs-only, neither a regression):

1. This file named branch HEAD `4f9aff8` and CI run `30203421883`. Both were stale by two docs-only commits — the true HEAD on entry was `ccf481a`, with a *newer* green run `30204125375`. Same drift class the previous session recorded: this file is written before the docs commits that follow it.
2. Open item 8 said `PHASE_2E_SLICE_03_REPORT.md` "is not yet written". It existed, committed in `0b23ad1`, and closes that item at its own §13.8.

Slices 2E.1–2E.3 remain accepted.

## Deployment state

| Artifact | State |
|---|---|
| Remote migration parity | `202607250054` — unchanged since the pre-2E cutover, verified this session with `npx supabase migration list --linked` |
| `202607250055`–`202607260058` | **local only.** The whole chain applies from an empty database in CI; none is applied to the linked project |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — unchanged. Slices 2E.1–2E.4 touch no worker code |
| Generated types | hand-written (ADR-041). `apply_task_command` parity is proven **three ways** — migration text, content comparison, and `pg_proc` from the real catalog. No claim of regeneration is made anywhere |

**`202607250056`'s amendment window is CLOSED by exhaustion.** Any change to its result columns or argument list costs a `_v2` (`42P13`).

**`202607260058` has no such constraint.** It returns a scalar `jsonb`, so `create or replace` can change its body freely; only an argument-list change would cost a new signature. This is what lets Slice 2E.5 enable `cancel_task`/`restore_task` on the same function.

## Slice status

| Slice | Epic | Status |
|---|---|---|
| 2E.1 — Bounded task command contract | 2E-A | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_01_REPORT.md` |
| 2E.2 — Deterministic matching and margins | 2E-B | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_02_REPORT.md` |
| 2E.3 — Disambiguation and read-only preview | 2E-C | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_03_REPORT.md` |
| 2E.4 — Reversible non-destructive updates | 2E-D | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_04_REPORT.md` |
| 2E.5 — Destructive actions and confirmation | 2E-E | not started |
| 2E.6 — No-match activity creation | 2E-F | not started |
| 2E.7 — Conversational and task-surface integration | 2E-G | not started |
| 2E.8 — Convergence and closeout | 2E-H | not started |

## Slice 2E.4 — what shipped

The first RPC in this codebase that mutates an existing task.

| Artifact | Responsibility |
|---|---|
| `202607260058` (new, 2203 lines) | `public.apply_task_command`; the re-pasted `public.audit_task_change`; `private.undo_apply_task_command_fields`; `private.undo_apply_task_command_relation`; two registry rows; grants; six post-deploy fail-closed DO blocks |
| `supabase/tests/phase_2e_task_command_apply.sql` | `plan(132)` |
| `supabase/tests/rpc_version_retirement.sql` | the new RPC in the `prosecdef`/`search_path` array; `plan(24)` unchanged |
| `errors.ts` | the closed `2E_*` vocabulary as iterable `as const`, outcome/retryable/SQLSTATE as data |
| `apply.ts` | the RPC wrapper: injected client, shared operation-key normalization, validated discriminated union, `(code, details)` mapper |
| `copy.ts` / `copy.test.ts` | the eighth section and eighth `VOCABULARIES` row — **closes Slice 2E.3 open item 3** |
| `agent/actions.ts` | the two `2E_UNDO_*` codes mapped through the shared router |
| `database.types.ts` / `database-types-parity.test.ts` | hand-written entry; parity generalized to a scalar return |

**Thirteen of fifteen actions enabled.** `cancel_task` and `restore_task` refused with `2E_ACTION_NOT_ENABLED` — Slice 2E.5's.

**Still no UI, route, Server Action, product event or model call.** Nothing calls the RPC; its consumer is Slice 2E.7.

## Decisions accepted in Slice 2E.4 — not re-litigable

- **ADR-044 — the RPC is unversioned** (`public.apply_task_command`). ADR-037 §1 warrants a version only when a closed input shape changes incompatibly; there is no predecessor. The contract version lives in the hashed `TASK_COMMAND_POLICY_VERSION` and the `'taskcmd-v1:'` operation-key prefix. It is nonetheless added to `rpc_version_retirement.sql`'s posture array, which is hardcoded and would otherwise never notice a new definer function.
- **ADR-045 — `no_change` returns before the reservation**, computed against the *claimed* pre-state, so 2E-UPDATE-009's "no undo row" is literally true. An unlocked ownership probe runs first, so a non-owned and a nonexistent task both yield `P0002 'Task not found'`. Post-lock, an empty delta is an invariant violation (`2E_TRANSITION_INTEGRITY`), not a `no_change`.
- **ADR-046 — the audit actor is a transaction-local `app.audit_actor`**, read with `missing_ok`, written with `is_local => true`, defaulting to `'user'`, normalizing an out-of-vocabulary value rather than raising. **The apply path sets `'user'`; the undo handlers set `'system'`.** The INSERT branch of `audit_task_change` is untouched. No `update of` column list was added to the trigger.
- **Undo restores reminders by close-and-insert**, per §11.3's "forced, not chosen" — not by un-cancelling the recorded ids, even though that would be safe under the current heartbeat predicate. The recorded `remind_at` is restored verbatim even if now past.
- **`before_state` carries the authoritative locked pre-state; `after_state` carries what undo acts on plus its integrity counts** and is the sole source of the replay return. Both are patched by the mandatory post-write UPDATE, because the row is not locked when the reservation is inserted.
- **`entity_type` is `'task'`** on both the undo row and the audit row.
- **Two `action_type` values, one RPC**: `'apply_task_command'` for the nine column actions, `'apply_task_command_relation'` for the four relation actions, so the registry routes to the right handler without a branch inside one.
- **`reminders` grants are not narrowed** (PRD §5 defers write-path consolidation; §14 forbids only widening). **No product event is emitted** — 2E-ANALYTICS-005 wants the surface value added with the first emitting code, and there is no surface until 2E.7.
- **`ai_usage_events.source_type` stays unwidened.** `'task'` is Phase 2F.
- **WITHDRAWN on evidence: the terminal timestamps are written unconditionally**, mirroring `persistTaskStatus` (`src/features/operations/actions.ts:148-152`), which PRD §11.2 requires by name. An earlier decision to gate them per action was refuted: `changedFields` is a **disclosure list, not a write manifest**, as `updated_at` proves by being written on every UPDATE and named in no action's list. The mirror is pinned by a fixture on the one input that distinguishes the two implementations.
- Everything Slice 2E.3 declared non-re-litigable still holds: fingerprint is replay identity and token binding only; `observedBefore` is hashed as verbatim client text; only the command policy version is hashed; a matching fingerprint is not confirmation evidence; reminder state is absent from the fingerprint's pre-state; `202607250056` is closed.

## Decisions the SECOND review round forced — also not re-litigable

The whole-artifact adversarial round (five lenses, per-finding refutation, 19 findings, 10 survived, 7 distinct defects) changed four things a later slice must not undo:

- **The undo guard is ten columns wide, not one.** Step 23 records `applied_state` — the ten scalars **as the forward write left them** — and `undo_apply_task_command_fields` guards its compensating UPDATE on all ten with `is not distinct from`. An operation whose `after_state` lacks `applied_state` fails closed. This exists because the handler previously restored ten columns while guarding on `status` alone, so undoing an older operation silently discarded every later non-status change and stranded a live reminder against a null due date. **2E-UPDATE-014 was violated, and the slice report had recorded it as met.** Narrowing the SET list instead is not an option — withdrawn decision D17 makes the forward path write both terminal timestamps unconditionally, so a narrowed restore would strand a cleared `completed_at`.
- **The undo reminder check is a post-restore re-query, scoped by a recorded `reminders_reconciled` flag.** An element-shape check over data the forward path can never write malformed made `2E_UNDO_REMINDER_INTEGRITY` unraisable — the same objection this migration's own comment uses to reject the tautological count form. The flag is required: unconditional, the count refuses every undo of a task legitimately holding a reminder the action never touched.
- **`after_state` carries `policy_version`.** A digest is not a record: hashing the version into the fingerprint left no row able to attribute a command to the policy that governed it. **2E-PROVENANCE-001 was violated and had likewise been recorded as met.**
- **Evidence gates use `is distinct from`, never `<>`.** `jsonb_typeof` is strict and `->` on an absent key is SQL NULL, so a `<>` chain yields NULL and plpgsql treats a NULL `if` as false — the gate misses exactly the shapes it documents itself as refusing.

Plus: the RPC's `description` bound reflects what an append can legitimately produce rather than the note bound (`append_note` was unappliable past 2000 characters), and `buildFingerprintPayload` normalizes the operation key itself rather than trusting the caller.

**Three guards were unfalsifiable by the 116-assertion suite** and each now has a case: the `action_touches_reminders` gate, the reminder-insert half's terminal-status guard, and — because every undo fixture was a `complete_task` — the seven-action `expected_status` path and the reminder-cancel block. `plan(116)` → `plan(132)`.

**The lesson worth carrying:** the first round reviewed the migration alone and found two Criticals, but could not have found any of these seven — five live in code it never read, and two require reasoning across the migration and the test suite together. **Scope a review to one artifact and it cannot find a contract two artifacts disagree about.** Slice 2E.5 should review its migration, its tests and its TypeScript together from the start.

## The three defects the FIRST round and CI found, and where

Worth carrying forward, because two are one family.

1. **Critical — `pg_catalog.coalesce(...)` at eleven sites.** COALESCE is a SQL special form with no `pg_proc` entry, like GREATEST/LEAST, so it cannot be schema-qualified under `search_path = ''`. Two sites sat in `audit_task_change`, so the first `public.tasks` UPDATE would have broken `persistTaskStatus`, `undo_confirm_entry_tasks` and two existing pgTAP suites. Found independently by both reviewers; the corpus settles it — 387 bare `coalesce(` and zero qualified. **The post-deploy guard now greps for `pg_catalog.coalesce(` and `pg_catalog.nullif(` too.** `overlay`/`substring`/`position`/`trim`/`extract` are deliberately excluded: they have real catalog entries.
2. **`42601 syntax error at end of input` — the migration would not apply at all.** plpgsql reads an `if` condition by scanning for the first `then` at paren-depth zero, so a bare `case … when … then … end` there ends the condition at the `case`'s own `then`. **Found by CI, not by any local gate.** One site, fixed by parenthesizing.
3. **Three reminder-integrity guards were tautological** — comparing a value against the write that produced it, so a declared member of a closed vocabulary could never be raised. Replaced with a postcondition read back from `public.reminders`, which guards the reachable cause: `authenticated` still holds INSERT/UPDATE there.

One review finding was **refuted with verified reasoning** (the terminal timestamps, above).

## Local gates on HEAD

`lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **2009 passed / 115 files** · focused `src/features/task-commands` **917 passed / 17 files** · `build` clean.

pgTAP cannot run locally — Docker is unavailable, so `supabase db reset`, `supabase test db` and `supabase db lint --local` never execute on this workstation. It ran **in CI**: `Files=28, Tests=1059, Result: PASS`. That is `927 + 132` against Slice 2E.3's baseline and `27 + 1` files, with `phase_2e_task_command_apply.sql ... ok` in the log — so every assertion executed rather than being skipped. **The arithmetic is the evidence, not the pass.**

Because CI is the only place the suite can run, the 16 assertions the second round added were **independently audited before pushing** — plan count, encoding, dollar-quote balance, each assertion traced to a pass against the corrected migration, fixture-collision check against every row-counting assertion, role-switch bracketing, and fault-injection cleanup. CI then confirmed the audit. Budget for that read; it is cheaper than a red `database` job.

## Open items owed by Slice 2E.4

1. ~~A second whole-artifact adversarial round did not run.~~ **CLOSED.** It ran in full and its seven defects are fixed and CI-green. (Its first attempt failed on a session limit and produced no findings; none were claimed from it.)
2. **No dedicated mutation round ran for this slice.** Slice 2E.2's 36-mutation discipline was not repeated as its own pass. The test-adequacy lens was a narrower substitute — it found three surviving mutations and all three are killed — and is **not** claimed as equivalent.
3. **2E-OPERATIONS-003's focused remote smoke — owed, blocked on deployment, and NOT dismissible this time.** Epic 2E-D's acceptance criteria explicitly name "a disposable remote smoke and authenticated desktop/mobile journeys", unlike Epics 2E-B and 2E-C. It must additionally prove: a real two-session concurrency race (2E-UPDATE-008's loser path, unprovable inside one pgTAP transaction); replay across two separate PostgREST requests; that the fingerprint TypeScript computes equals the one the RPC derives, over the wire, for all thirteen actions; and cross-owner denial with two real owners.
4. **Authenticated desktop/mobile Playwright journeys** — same clause, blocked on the same dependency and on there being no surface (ADR-043).
5. **2E-UNDO-005's task-scoped undo listing is not built.** The operations are *recorded* task-scoped (`entity_type = 'task'`, `entity_ids = array[task_id]`), which is what a listing needs; the listing itself is a surface concern. Owed by Slice 2E.7.
6. **`apply.ts` and `errors.ts` have no production caller.** By design; Slice 2E.7.
7. **The pre-existing flaky test** `src/features/tasks/task-candidate-form.test.tsx` still reds CI intermittently. It passed in both runs of this slice. Recorded in `docs/TODO.md` under PRD §20.
8. **Alias-driven relation resolution remains unproven in pgTAP** — but this slice does **not** depend on it: the RPC receives already-resolved ids and re-verifies ownership against the base tables, so `entity_aliases` is off the apply path.

## Next: the continuation point, precisely

**Slice 2E.4 is accepted. Begin Slice 2E.5 — Destructive actions and confirmation (Epic 2E-E).** Read PRD §13.6 (`2E-DESTRUCTIVE-001..009`), §11.2's `cancel_task`/`restore_task` rows, §11.3, §12.3, §19.1 (Epic 2E-E), then `202607260058` — which 2E.5 extends by `create or replace`, not replaces.

**Run the review the way Slice 2E.4 learned to.** Review the migration, the pgTAP suite and the TypeScript together in one round rather than the migration alone: five lenses with per-finding refutation is what found the seven defects a migration-scoped round could not. The workflow scripts are preserved in this session's `workflows/scripts/` directory (`slice-2e4-adversarial-*`, `slice-2e4-correct-*`, `slice-2e4-pgtap-gaps-*`) and their prompts already carry the settled-decision and do-not-re-report lists. Two process notes worth reusing: **attack the slice report's own "MET" claims first** — two of them were false — and **audit any pgTAP change by reading before pushing**, because CI is a ~4-minute round trip and the only executor.

What 2E.5 inherits:

- **Both actions are already refused with a declared, mapped, localized, pgTAP-asserted code.** Enabling them means removing that guard and adding the token gate — not a new function. `create or replace` on `apply_task_command` is the mechanism.
- **A matching fingerprint is not confirmation evidence.** The token must be server-issued, single-use, and bound to fingerprint, owner and operation key.
- **`cancelled_at` is never written by Slice 2E.4.** The shared status UPDATE writes it, but no enabled action can reach `cancelled` — `set_status` is bounded to the six non-terminal values as data, asserted in pgTAP.
- **`app.audit_actor` is already the mechanism 2E-DESTRUCTIVE-007 needs**: apply sets `'user'`, undo sets `'system'`. Do not add a second one.
- **2E-DESTRUCTIVE-008's creation-undo collision is not implemented in either ordering.** One declared code must close undo, `restore_task`, and the recovery affordance.
- **The handler already exists.** `undo_apply_task_command_fields` is registered under `action_type = 'apply_task_command'`; both actions are `restore_fields` and both touch reminders, which it already restores by close-and-insert.

Useful commands:

```powershell
npx vitest run src/features/task-commands           # focused
npm run lint; npm run typecheck; npm test; npm run build
deno check supabase/functions/process-jobs/index.ts supabase/functions/heartbeat/index.ts
npx supabase migration list --linked                # parity
gh pr checks 18                                     # the database gate
```

## Environment constraints that shape the workflow

- **Docker is unavailable.** Every SQL claim is proven only by draft PR #18's `database` job (~4 min/run): full migration reset from zero, the whole pgTAP suite, `db lint` over `public,private`, and the foundation journey on desktop and Pixel 7. **Slice 2E.4 is the proof this matters** — CI caught a defect that stopped the migration applying, which no local gate could see. Budget for the round trip; never report a local pgTAP run.
- `supabase gen types typescript` cannot run here either (ADR-041).
- Remote smokes and authenticated online journeys stay manual.
- Edit SQL with a text editor, never a script: a scripted edit once injected NUL bytes and silently voided an entire pgTAP file while TypeScript stayed green.
- **Subagent work can fail on session limits mid-round.** When it does, say so and carry the round forward as an open item rather than reporting an empty result as a clean one.
