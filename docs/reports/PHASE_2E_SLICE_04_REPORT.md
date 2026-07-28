# Phase 2E — Slice 2E.4 Report

**Epic 2E-D — Reversible non-destructive updates.**

- **Branch:** `codex/phase-2e-natural-language-task-updates`
- **Slice HEAD:** `bfa28a1`
- **Phase base:** `2e2acfd`
- **Draft PR:** [#18](https://github.com/fabiokyrillos/my-brain/pull/18) — CI evidence only, **must not be merged before Slice 2E.8**
- **Normative contract:** `docs/PHASE_2E_PRD.md` §13.5 (`2E-UPDATE-001..018`), §13.8–§13.11, §11.2, §11.3, §19.1 (Epic 2E-D)
- **New ADRs:** ADR-044, ADR-045, ADR-046
- **Verdict:** **READY WITH NON-BLOCKING NOTES.** See §11.

> **Revision note.** An earlier revision of this report carried the verdict "acceptance pending one owed review round", because the second whole-artifact adversarial pass had failed on a session limit. **That round has since run in full** — five lenses, every finding put to a skeptic — and found seven distinct defects, one of them a Critical that this report had recorded as a met requirement. All seven are fixed, the fixes are CI-green, and §4.2, §7 and §11 below describe the corrected state. Two disposition rows in §7 (2E-UPDATE-014 and 2E-PROVENANCE-001) said **MET** when they were not; both now hold, and the correction is recorded rather than quietly applied.

## 1. What shipped

The first RPC in this codebase that mutates an existing task. Before this slice the only live task-mutation path was a plain client `UPDATE` (`src/features/operations/actions.ts:148-152`) with no undo record, no expected-pre-state check, and an audit trigger that stamped every change as a user action.

| Artifact | Responsibility |
|---|---|
| `202607260058` (new, 2203 lines) | `public.apply_task_command`; the re-pasted `public.audit_task_change`; `private.undo_apply_task_command_fields`; `private.undo_apply_task_command_relation`; two registry rows; grants; six post-deploy fail-closed DO blocks |
| `supabase/tests/phase_2e_task_command_apply.sql` (new) | `plan(132)` — 116 for the original contract, +16 from the second review round |
| `supabase/tests/rpc_version_retirement.sql` | the new RPC added to the `prosecdef` + `search_path=""` array; `plan(24)` unchanged |
| `src/features/task-commands/errors.ts` | the closed `2E_*` failure vocabulary as iterable `as const`, with outcome/retryable/SQLSTATE carried as data |
| `src/features/task-commands/apply.ts` | the RPC wrapper: injected client, shared operation-key normalization, Zod-validated discriminated union, `(code, details)` mapper |
| `src/features/task-commands/copy.ts` + `copy.test.ts` | the eighth section and eighth `VOCABULARIES` row |
| `src/features/agent/actions.ts` | the two `2E_UNDO_*` codes mapped through the shared `undo_operation` router |
| `src/lib/supabase/database.types.ts` + `database-types-parity.test.ts` | hand-written entry (ADR-041), parity generalized to a scalar return, pinned three ways |

**Thirteen of the fifteen actions are enabled.** `cancel_task` and `restore_task` are refused with the declared code `2E_ACTION_NOT_ENABLED`: cancellation is destructive and PRD §23.4 ships `restore_task` with it. Slice 2E.5 admits both by `create or replace` on this same function — additive, forward-only, and **not** a second write path, which is what 2E-UPDATE-001's "one RPC" requires.

**There is still no UI, no route, no Server Action, no product event and no model call.** Nothing in the product calls `apply_task_command`; its consumer is Slice 2E.7 (ADR-043). No user-visible behaviour changes.

## 2. Decisions this slice took, and why

Fifteen questions the precedent investigation surfaced had no repository answer. The load-bearing ones:

**The RPC is unversioned (ADR-044).** ADR-037 §1 warrants a new version only when a closed input shape changes incompatibly, and there is no predecessor to be incompatible with; `list_task_command_candidates` and `task_command_fingerprint` set the unversioned precedent inside this same phase and required no `rpc_version_retirement.sql` edit. 2E-UPDATE-001's word "versioned" is satisfied by the contract carrying a version — the hashed `TASK_COMMAND_POLICY_VERSION` and the `'taskcmd-v1:'` operation-key prefix — not by the identifier. A `_v1` suffix would have red-ed `rpc_version_retirement.sql:186-200` and cost six coordinated literal-array edits to a test whose purpose is policing families that already forked. **The new RPC is nonetheless added to that file's `prosecdef`/`search_path` array**, because that array is hardcoded and would otherwise never notice a new definer function.

**`no_change` returns before the reservation (ADR-045).** 2E-UPDATE-009 requires `no_change` to write no task update, no audit row **and no undo row**. The reservation is the first write, so a `no_change` detected after it cannot satisfy that without deleting a row. The canonical delta is therefore computed against the *claimed* pre-state before the reservation and returns immediately, with nothing written and no lock taken. The claim is unverified at that point, but the outcome writes nothing, so it can only mis-inform — and 2E-UPDATE-009 makes the *preview* the authoritative place `no_change` is decided. A cheap unlocked ownership probe still runs first, so a non-owned or nonexistent task gets `P0002 'Task not found'` and the two stay indistinguishable (2E-OWNERSHIP-002). Post-lock the staleness gate proves claimed == locked, so an empty delta there is an invariant violation and raises `2E_TRANSITION_INTEGRITY`, not a `no_change` return.

**The audit actor is a transaction-local `app.audit_actor` defaulting to `'user'` (ADR-046).** No `set_config`/`current_setting` precedent existed anywhere in `supabase/migrations`. Read with `missing_ok = true`, or the trigger raises `42704` on every `public.tasks` UPDATE that did not come through the RPC — a plain client edit, a pgTAP fixture, the heartbeat. Written with `is_local => true`, or the value leaks across a pooled PgBouncer session into an unrelated later transaction. A value outside `('user','agent','system')` normalizes to `'user'` rather than raising, because a trigger that raises `23514` on an unrelated UPDATE is worse than a mis-attributed row.

- **The apply path sets `'user'`; the undo handlers set `'system'`.** Every apply is user-initiated (PRD §23.7), and setting it explicitly rather than relying on the default makes the RPC's intent legible and pinnable. The undo handler's compensating UPDATE sets `'system'` because the trigger row describes *who performed the column write* — the stored compensating operation — while the handler's own `operation_undone` row describes *who asked for it* (`actor='user'`, reason "User executed the stored compensating operation"). Together they are strictly more informative than either alone, and this is what makes 2E-DESTRUCTIVE-007 provable at the trigger layer in Slice 2E.5 without reopening the trigger.
- **The INSERT branch is untouched.** It already derives `case when new.created_by = 'agent' then 'agent' else 'user' end`, which answers a different question — who authored the task, not who performed this write — and 2E-UPDATE-010 requires `persistTaskStatus` behaviour to stay byte-identical.
- **No `update of <columns>` list was added to `tasks_audit_changes`.** `create or replace function` deploys the watched-column change with zero trigger churn; a column list would have to enumerate all seven and any future addition would silently stop auditing.

**Undo restores reminders by close-and-insert, not by un-cancelling.** §11.3 calls the mechanism "forced, not chosen" and 2E-UPDATE-014 requires undo to restore linked effects "by the same close-and-insert mechanism". Un-cancelling the original ids would in fact be safe under the current heartbeat predicate — a `cancelled` row can never have notified, because every heartbeat path selects `status = 'scheduled'` — but it depends on that predicate never changing, and the PRD's literal mechanism is safe under every ordering. The cost is dead rows, accepted. The recorded `remind_at` is restored **verbatim** even if now in the past: a past-due `scheduled` reminder firing on the next tick is the state that existed, and `202607250056:611-619` deliberately counts it.

**`reminders` grants were not narrowed, and no product event is emitted.** PRD §5 defers write-path consolidation and §16.4 records the residual direct-write risk; `reminders` is the same class of change for a different table, and PRD §14 forbids only *widening*. Recorded in `docs/TODO.md`. 2E-ANALYTICS-005 requires the surface value to be added in the same migration and commit as the first emitting code — there is no Phase 2E surface until Slice 2E.7, so no `surface` value would be truthful and emitting `'server'` would lie about where the command came from.

**One decision was taken and then withdrawn on evidence.** An earlier revision of the contract required each terminal timestamp to be gated on the action, so `set_status` would not write `null` over a `completed_at` its `changedFields` does not name. A review refuted it and the refutation was verified against source: `src/features/operations/actions.ts:148-152` writes both columns unconditionally on every status change, and PRD §11.2 says of exactly these two columns "mirroring `persistTaskStatus` so the two paths cannot disagree". `changedFields` is a **disclosure list, not a write manifest** — proven by `updated_at`, which `tasks_updated_at` writes on every UPDATE and which appears in no action's list. The mirror is now pinned by a fixture on the one input that distinguishes the two implementations (§5).

## 3. The staleness gate, and what it is not

2E-UPDATE-003 is a typed twelve-column `is distinct from` comparison against the `for update`-locked row, `or`-joined into a single `55P03` raise carrying **no detail and no hint** — `src/features/agent/actions.ts` branches on `error.code === '55P03'` alone before any details check.

The claimed instants are cast to `timestamptz` **for comparison** while the same `observedBefore` text is hashed **verbatim** for the fingerprint. That split is the whole inherited decision: conflating them would force the RPC to re-render the locked row's timestamps byte-identically to what PostgREST emitted, which is unwinnable. Every cast sits inside a guarded block, so a malformed claim is a bare `22023` validation failure rather than a `22P02` escaping to a client whose mapper has no case for it.

**Relation arrays are deliberately not compared.** They are not columns on `tasks`, and comparing them would refuse a `complete_task` because an unrelated concurrent `assign_project` landed. What matters for a relation action — does the task already hold this exact relation — is re-checked under the lock by `on conflict do nothing`. **Reminder state is deliberately absent**, inherited: the heartbeat flips `scheduled → sent` hourly with no user act, so gating on it would manufacture a stale refusal on a cron tick.

## 4. Review, and the three defects it found

**One adversarial round ran on the migration** — two independent reviewers on separate lenses, then an adjudicator that re-derived each finding rather than accepting it. Six findings, two of them the same Critical found independently by both reviewers.

1. **Critical — `pg_catalog.coalesce(...)` at eleven sites.** COALESCE is a SQL special form with no `pg_proc` entry, exactly like GREATEST/LEAST, so every one of those calls fails to resolve under `set search_path = ''` with `42883`. Two of the eleven sat in `audit_task_change`'s UPDATE branch, so the **first `public.tasks` update touching any watched column would have broken `persistTaskStatus`, `private.undo_confirm_entry_tasks` and two existing pgTAP suites** — none of which this migration is supposed to touch. Confirmed by counting the corpus: 387 bare `coalesce(` across the prior migrations and **zero** qualified ones, in a corpus that qualifies `pg_catalog.btrim` obsessively. All eleven replaced, and the post-deploy recurrence guard extended to `pg_catalog.coalesce(` and `pg_catalog.nullif(` so the next slice cannot reintroduce the class. `overlay`/`substring`/`position`/`trim`/`extract` were deliberately **excluded** from the guard: they have real catalog entries, so banning the qualified form would red a legal call.
2. **Three reminder-integrity guards were tautological**, which for a declared member of a closed error vocabulary is the same defect as a missing raise — 2E-UPDATE-017 requires a database test to provoke every declared code. `jsonb_agg` emits exactly one element per input row, so `jsonb_array_length(...) <> count(*)` over one CTE could never differ; `returning id into` on a `gen_random_uuid()` primary key could never yield null. Replaced with one postcondition read back from `public.reminders`, which has independent provenance on each side and guards the reachable cause: `authenticated` still holds INSERT and UPDATE on `public.reminders`, so a direct client write committing between the close and the check would leave a live reminder the command never disclosed closing.
3. **One finding was refuted with verified reasoning** — the terminal-timestamp gating described in §2. The refutation was checked against `src/features/operations/actions.ts:148-152` before being accepted.

## 4.2 The second round, and the seven defects it found

The whole-artifact round ran across five lenses — SQL execution, concurrency/replay, undo truthfulness, ownership/security, test adequacy — with **every** finding handed to a separate skeptic instructed to default to refuting it. **19 findings; 10 survived refutation; 7 distinct defects after deduplicating across lenses.** Nine were refuted with reasoning, including three that were technically correct about SQL semantics but had no reachable failure state.

**1. Critical — the undo guard was one column wide while the write was ten.** `undo_apply_task_command_fields` restored all ten scalar columns from `before_state` but guarded only on `status`. Reproduction: rename a task, reschedule it, undo the rename — `expected_status` still matched, so `affected = 1` and the restore wrote `due_at = null`, **silently discarding the reschedule** and returning `{"undone": true}`. Because `after_state.reminder_created_id` is null for a rename, the reminder the reschedule armed was never cancelled, leaving the task with a null due date holding a live `scheduled` reminder the heartbeat would fire. Three lenses found it independently; four skeptics failed to refute it.

The asymmetry was the tell: the forward path gates on **twelve** columns to protect a write of at most three, while the undo path gated on **one** to protect a write of ten. It had no evidence to gate with — `before_state` records the pre-state and nothing recorded what the forward write left behind. Step 23 now records `applied_state`, and the compensating UPDATE guards all ten with `is not distinct from`. An operation lacking `applied_state` fails closed rather than falling back.

**2. Important — `2E_UNDO_REMINDER_INTEGRITY` could not fire from any production state.** The handler had replaced the contract's post-condition with an element-**shape** check over data the forward path can never write malformed — the *exact* objection this migration's own comment uses to reject the tautological count form, so the file contradicted itself. It now re-queries the live scheduled count after the restore, scoped by a recorded `reminders_reconciled` flag (unconditional, it would refuse every undo of a task legitimately holding a reminder the action never touched).

**3. Important — the policy version was durably recorded nowhere**, so no applied command could be attributed to the policy that governed it. **This report recorded 2E-PROVENANCE-001 as MET.** One key on `after_state`, which flows into the undo row and the audit row.

**4. Minor — two fail-closed evidence gates did not fail closed.** `jsonb_typeof(...) <> …` yields SQL NULL for an absent key and plpgsql treats a NULL `if` as false, so the gates missed exactly the two shapes their comments said they refused — while the same file documented `is distinct from` as the fix ninety lines later.

**5. Important — `append_note` was unappliable past 2000 characters.** The RPC bounded the canonical `description` by the *note* bound while the preview produces `description + note`, so a task with a long description could never take another note and the preview offered a one-step apply the RPC would refuse.

**6–8. Important — three guards were unfalsifiable by the suite.** No fixture gave a non-reminder action a reminder-holding subject, so deleting the `action_touches_reminders` gate left all 116 assertions green while every command would churn reminders. Nothing constrained reminders after a *successful* `complete_task`, so the insert half's terminal-status guard could be deleted freely. And every undo fixture was a `complete_task`, so the seven-action path and the reminder-cancel block never executed.

**9. Important — user-facing copy promised a rollback it cannot know about.** `undeclared_failure` said "Nothing was changed", but the mapper also routes there for an error with no SQLSTATE, and `@supabase/postgrest-js` *catches* a client-side fetch failure and resolves rather than rejecting — so a lost response after a successful commit landed on that copy. Reworded to claim only the retry, which is safe by idempotency rather than by rollback.

Also fixed: `buildFingerprintPayload` sent the raw operation key while the apply call sent the normalized one, and the test guarding that invariant asserted the **disagreement**, which documented the divergence as correct and forbade fixing it at the source.

**What this round cost, stated plainly:** the first round reviewed the migration only. It found two Criticals, but it could not have found any of these seven, because five live in code it never read and two require reasoning across the migration and the test suite together. The lesson is the one Slice 2E.3 already recorded and this slice re-learned: a review scoped to one artifact cannot see a contract that two artifacts disagree about.

## 5. Verification

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | 0 errors |
| `npx vitest run` | **2009 passed / 115 files** |
| `npx vitest run src/features/task-commands` | **917 passed / 17 files** (from 786 / 15) |
| `npm run build` | clean |
| CI `application` / `edge worker` / `database and journey` | **all three pass** on `bfa28a1`, run `30227374101` |
| Full pgTAP suite in CI | **`Files=28, Tests=1059, Result: PASS`** |
| Migration chain from zero | **PASS in CI** — `202607260058` applies to an empty database |
| `supabase db lint --schema public,private` | **PASS in CI** |
| `supabase db reset`, `supabase test db`, `db lint --local` | **cannot run on this workstation — Docker is unavailable.** No local result is claimed anywhere in this report |

**The arithmetic is the evidence, not the pass.** `Files=28` is `27 + 1` and `Tests=1059` is `927 + 132` against the Slice 2E.3 baseline, and the CI log shows `phase_2e_task_command_apply.sql ................ ok`. That confirms every one of the 132 assertions **executed** rather than being skipped — a suite that silently skipped a whole file would look identical without the arithmetic, and this repository has already lost a whole pgTAP file to a NUL byte while TypeScript stayed green. It also confirms `rpc_version_retirement.sql` stayed at `plan(24)`, because adding an element to a literal array is not an assertion.

The 132 is itself two numbers: 116 for the original contract, and **16 added after the second adversarial round**, one per guard that round fixed or proved unfalsifiable. The most load-bearing is the Critical's exact reproduction — rename, reschedule, undo the rename — which **silently passed before the fix**. Its companion asserts the same shape must still *succeed* when nothing intervened, because widening the guard to something unsatisfiable would pass the first assertion and break every real undo.

Because Docker is unavailable and CI is the only place this file can execute, the 16 new assertions were **independently audited before pushing**: plan count 132 against 132 counted assertions (verified by a lexer that skips comments, strings and dollar-quoted bodies), pure ASCII with no CRLF or NUL bytes, dollar-quotes balanced, every new assertion traced to a pass against the corrected migration, every row-counting assertion checked against the eight new fixture tasks and one new reminder for collisions, role switches correctly bracketed, and both fault injections confined to the rolled-back transaction. CI then confirmed the audit.

**CI caught a defect no local gate could.** The first push red-ed the `database` job with `42601 syntax error at end of input` — the migration would not apply at all. plpgsql reads an `if` condition with `read_sql_expression(K_THEN)`, which scans for the first `then` at paren-depth zero, so a bare `case … when … then … end` in that position ends the condition at the `case`'s own `then`; the remainder is parsed as statements and the parser reaches the end of the body still expecting `end if`. One site, fixed by parenthesizing, with the rule recorded in a comment. Every other `case` in the file was then audited: three are plpgsql `case` statements closed with `end case;`, and the rest sit in assignments, `values(…)` or `jsonb_build_object(…)` arguments — all at paren-depth one or deeper, where the scanner never reads them as a terminator. The pgTAP file's own `pg_temp` plpgsql helpers were audited for the same trap and are clean.

This is the second member of one family this slice hit, after `pg_catalog.coalesce`: **SQL constructs that look like ordinary function calls but are grammar**, and so cannot be qualified or nested naively. Both are now guarded — one by a post-deploy grep, one by a comment and an audit.

## 6. The pgTAP suite, and the three assertions that are fault-injected

`plan(132)`, pure ASCII, fixtures under the reserved `6xxxxxxx` prefix. The original 116 by area: RPC posture 6, the closed vocabulary read out of `pg_get_functiondef` 3, `audit_task_change` 7, ownership non-disclosure 3, bare-`22023` validation 7, `2E_INVALID_RELATION` 1, the two refused actions 2, staleness 13, `no_change` 3, per-action application 34, `2E_INELIGIBLE_STATUS` 1, due consistency 4, `2E_REMINDER_INTEGRITY` 1, replay 5, undo-fields 7, undo-relation 3, undo integrity 2, handler posture 8, plus the signature pins and the mirror fixture.

**All thirteen declared codes are provoked** (2E-UPDATE-017). `throws_ok`'s third argument matches the exception MESSAGE and never the DETAIL, so the closed-token assertions use the `SQLSTATE:DETAIL`-with-`'accepted'`-sentinel `pg_temp` helper from `ai_interpretation_bounds.sql:134-153` rather than `throws_ok`.

**Three assertions are fault-injected rather than raced, and that is stated rather than hidden.** A single pgTAP transaction cannot stage a concurrent writer. `2E_REMINDER_INTEGRITY` uses a transaction-scoped `before update on public.reminders` trigger that suppresses the close, so the scheduled row survives and the postcondition differs — note this is *not* the `before insert` shape first proposed, which would not provoke the guard at all, because suppressing the insert leaves expected and actual both zero. `2E_UNDO_REMINDER_INTEGRITY` needs a privileged corruption of the recorded evidence, because `authenticated` cannot write `public.undo_operations` at all. Both the trigger and the corruption are discarded by the closing `rollback`.

**The signature is now pinned three ways** (2E-OPERATIONS-002), closing a gap the first implementation left: the migration declares it, `database-types-parity.test.ts` compares the hand-written types against that declaration by content, and pgTAP pins `proargnames` and `pronargdefaults` against `pg_proc` from the real catalog. Without the third, the migration and the hand-maintained types file would only agree with *each other* about a schema neither has seen — which is precisely the risk ADR-041 accepted when it gave up `supabase gen types`.

**The `persistTaskStatus` mirror is pinned on the one input that distinguishes it.** A legacy direct client write leaves a `completed_at` on a non-terminal row; `set_status` then clears it. Without a fixture carrying that state the suite would pass under either candidate implementation and bless whichever happened to be committed.

## 7. Requirement disposition

| Requirement | Status | Evidence |
|---|---|---|
| 2E-UPDATE-001 (one versioned definer RPC, safe `search_path`, least-privilege, no widened grant) | **MET**, with the versioning reading recorded | ADR-044. `prosecdef` + `search_path=""` + grant posture asserted in pgTAP and in `rpc_version_retirement.sql` |
| 2E-UPDATE-002 (validates caller, owner, current state, transition, canonical patch before writing) | **MET** | Write-order steps 1–20; all pure validation and both ownership probes precede the reservation |
| 2E-UPDATE-003 (`55P03` + declared detail on stale pre-state; never `40001`) | **MET**, with the detail deliberately absent | Twelve typed columns, one `55P03`, no detail — the house convention. `40001` appears nowhere; a post-deploy DO block greps the function bodies for it |
| 2E-UPDATE-004 (mutation, reminders, audit and undo in one transaction) | **MET** | One plpgsql function; a partial application is not expressible |
| 2E-UPDATE-005 (DB-enforced idempotency on `(user_id, operation_key)`; replay returns the original marked replayed) | **MET** | The partial unique index with its predicate repeated in `on conflict`; replay asserted with three counts pinned to literals |
| 2E-UPDATE-006 (fingerprint mismatch rejected, not applied) | **MET** | `2E_IDEMPOTENCY_MISMATCH`; vanished-row and mismatch deliberately collapse, per `202607220044:1140-1158` |
| 2E-UPDATE-007 (undo row before any task write; replay re-selects `for update`) | **MET** | Reservation is the first write; the replay branch returns before the task lock is taken |
| 2E-UPDATE-008 (concurrent commands serialize; loser gets a conflict, never a lost update) | **MET** (contract) | The `for update` task lock plus the guarded `status = <locked>` predicate and `affected <> 1` escalation. **A true two-session race is unprovable in pgTAP** and is owed to the remote smoke |
| 2E-UPDATE-009 (`no_change` detected at preview, terminal; RPC carries the check as defence in depth) | **MET**, with the reading recorded | ADR-045 |
| 2E-UPDATE-010 (actor, source, reason, target, resulting state; trigger derives its actor; watched columns extended to title/description) | **MET** | ADR-046. Asserted both ways: a plain client UPDATE still records `'user'` and does not raise, and title-only and description-only updates now produce a `task_updated` row where they previously produced none — closing 2E-MATCH-006's declared blind spot |
| 2E-UPDATE-011 (reminder consistency by close-and-insert, never in place) | **MET** | Every scheduled row cancelled (two-row fixture), fresh row created when a future due date survives, `create_due_task_reminder`'s formula reproduced with `case when a >= b`, `sent`/`snoozed` untouched |
| 2E-UPDATE-012 (due change on an intentionally-undated task clears the flags atomically or is refused with a declared code; never a raw `23514`) | **MET** | `2E_DUE_CONSISTENCY` at two sites — the patch's own self-consistency pre-lock, and the locked row's flag |
| 2E-UPDATE-013 (one registered handler and registry row per operation; the fail-closed trigger proves registration) | **MET** | Two `action_type`s → two handlers. Registration is structurally mandatory: an unregistered `action_type` raises `UNDO_HANDLER_NOT_REGISTERED` at INSERT time |
| 2E-UPDATE-014 (undo restores every field and linked effect, safe twice, refuses to discard newer work) | **MET — after correction. An earlier revision of this row claimed MET while the requirement was violated** | The "refuses to discard newer work" clause was **not** met: the handler restored ten columns while guarding one, so undoing an older operation silently reverted every later non-status change (§4.2 defect 1). Step 23 now records `applied_state` — the ten scalars as the forward write left them — and the compensating UPDATE guards all ten with `is not distinct from`, failing closed when `applied_state` is absent. Proven by the reproduction case *and* its success companion, so the guard is neither absent nor unsatisfiable. The linked-effect clause is likewise now enforced by a post-restore re-query rather than a shape check that could never fire (defect 2) |
| 2E-UPDATE-015 (relation undo removes only the row that operation created) | **MET** | Asserted with a task holding both an `involved` and a `waiting_on` person: only the recorded one is removed |
| 2E-UPDATE-016 (relation assignments prove ownership of both sides; never cross-owner) | **MET** | The composite owner FKs on all three relation tables, plus explicit pre-reservation ownership probes raising `2E_INVALID_RELATION` |
| 2E-UPDATE-017 (closed declared `2E_*` list; a DB test provokes each; a TS test fails if the mapper lacks a case) | **MET** | 13 codes, all provoked. `errors.test.ts` asserts the list describes the migration **in both directions** — every declared token is raised, and every raised token is declared |
| 2E-UPDATE-018 (added to the versioned-RPC inventory and its retirement test) | **MET by the applicable half** | The name carries no `_vN` suffix so it neither joins nor forks an inventoried family (ADR-044); it is nonetheless added to the retirement test's posture array, which is the part that would otherwise never notice it |
| 2E-PROVENANCE-001/003 | **MET — after correction. An earlier revision of this row claimed the policy version was "recorded on the operation" when no row carried it** | The version reached the RPC and was hashed into the fingerprint, but a digest is not a record: nothing could attribute an applied command to the policy that governed it (§4.2 defect 3). `after_state` now carries `'policy_version'`, which flows into both the undo row and the audit row, and pgTAP pins it. `-003` was and remains met via `app.audit_actor` — apply sets `'user'`, undo sets `'system'` |
| 2E-PROVENANCE-002 (tokens and price snapshot before any dependent domain write) | **N/A this slice** | No AI call on the apply path. Command parsing is Slice 2E.1/2E.7; `202607250055` already widened `ai_usage_events.operation` |
| 2E-IDEMPOTENCY-001..004 | **MET** | `'taskcmd-v1:'` namespacing inside the 8..240 caller bound; DB-enforced uniqueness; `jsonb_build_object` canonicalization makes key-order and whitespace stability structural; replay marked |
| 2E-OWNERSHIP-001..003, -005 | **MET** | Every read and write inside the definer function carries its own `user_id` predicate; another owner's task and a nonexistent uuid both yield `P0002 'Task not found'`; nothing executable by `anon` or `PUBLIC`; no grant widened; no model on this path |
| 2E-OWNERSHIP-004 (cross-owner denial proven by DB tests **and** a two-owner remote smoke) | **PARTIAL** | The database half is proven. The remote smoke is owed — §9 |
| 2E-UNDO-001..004, -007 | **MET** | Both handlers; double undo honest; refusal on moved state; expired and unavailable are distinct router outcomes |
| 2E-UNDO-005 (Phase 2E operations need their own owner-scoped task-scoped undo listing) | **NOT MET — owed by Slice 2E.7** | The operations are recorded task-scoped with `entity_type = 'task'` and `entity_ids = array[task_id]`, which is what a listing needs; the listing itself is a surface concern and no surface exists |
| 2E-UNDO-006 (24h window disclosed wherever reversibility is claimed; affordance not rendered when expired) | **MET** (contract half) | `undo_expires_at` returned by the RPC; `TASK_COMMAND_UNDO_WINDOW_HOURS` pinned against `202607160003:153`. The rendering half is Slice 2E.7 |
| 2E-I18N-003 (every declared `2E_*` code maps to localized copy in both locales, asserted against the declared list) | **MET — and this closes Slice 2E.3's open item 3** | The eighth `VOCABULARIES` row. The requirement's literal subject did not exist until this slice raised the codes |
| 2E-OPERATIONS-001 (additive, forward-only, chain resets from zero) | **MET** | Verified in CI on `bfa28a1` |
| 2E-OPERATIONS-002 (generated-type parity by content comparison) | **MET, three ways** | §6 |
| 2E-OPERATIONS-003 (focused disposable remote smoke) | **NOT RUN — blocked on deployment** | §9 |
| 2E-OPERATIONS-005 (rollback documented, no reverted migration) | **MET** | §8 |
| 2E-A11Y-001/002/003, 2E-UX-002 | **DEFERRED to Slice 2E.7** | ADR-043. No surface exists |

## 8. Migrations, deployment, and rollback

**Migrations.** One new file, `202607260058`. It creates or replaces four functions, inserts two registry rows, issues four grant/revoke statements, one `comment on function`, and five post-deploy DO blocks. **No table, column, index, constraint or trigger definition is created or altered.** `audit_task_change` is replaced by re-pasting its whole body with three intended changes, following `202607220045`'s precedent of re-pasting rather than editing the original — migration `202607160014` is left untouched.

**Deployment is deliberately deferred, and the reasons have narrowed to one.** `202607250055`–`202607260058` remain local/branch-only; remote parity stays at `202607250054`. Nothing calls the RPC, so deploying yields no user capability and reduces no risk. Unlike Slice 2E.3, the amendment argument is gone: this function returns a scalar `jsonb`, so `create or replace` can change its body freely and only an argument-list change would cost a new signature. PRD §21's "worker first, then migrations" does not apply — this slice touches no worker code.

**Rollback is routing-level, and there is nothing to route.** No applied migration is reverted (2E-OPERATIONS-005). Nothing calls the RPC, so "stop routing to the new surface" is already the state. If it ever needs disabling after deployment, `revoke execute on function public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text) from authenticated` is sufficient and is itself additive.

**One rollback caveat is genuinely new and must be stated.** This is the first Phase 2E migration that changes an object the *existing* product uses: `public.audit_task_change` fires on every `public.tasks` INSERT and UPDATE, including `persistTaskStatus` and `createRecord`. Reverting it means re-pasting `202607160014`'s body in a further forward migration, not dropping anything. The change is designed to be inert for existing callers — the actor defaults to `'user'` when the GUC is unset, and the two new watched columns only add rows that were previously not written at all — but it is not a no-op on a dormant surface the way `202607250056` and `202607250057` were, and the `database` job's green foundation journey on desktop and Pixel 7 is what evidences that.

## 9. What did not run, and is not claimed

1. **2E-OPERATIONS-003's focused remote smoke — owed, blocked on deployment, not claimed to have passed.** It would exercise `apply_task_command` against the linked project, which does not have it. Epic 2E-D's acceptance criteria (PRD §19.1) **explicitly name** "a disposable remote smoke and authenticated desktop/mobile journeys", unlike Epics 2E-B and 2E-C — so unlike the two previous slices this is **not** dismissible as a phase-level item. It is a genuine gap in Epic 2E-D's acceptance, recorded as such. What it must prove beyond the earlier specifications: a real two-session concurrency race (2E-UPDATE-008's loser path, unprovable inside one pgTAP transaction); replay across two separate PostgREST requests rather than two calls in one transaction; that the fingerprint TypeScript computes through `buildFingerprintPayload` equals the one the RPC derives, over the wire, for all thirteen actions; and cross-owner denial with two real owners.
2. **Authenticated desktop/mobile Playwright journeys — owed by the same clause, blocked on the same dependency and on there being no surface** (ADR-043).
3. ~~A second whole-artifact adversarial round did not run.~~ **CLOSED.** It ran in full — five lenses, 19 findings, every one put to a separate skeptic, 10 survived, 7 distinct defects fixed and CI-green. See §4.2. (It failed on a session limit on first attempt; that attempt produced no findings and none were claimed from it.)
4. **No dedicated mutation-testing round ran for this slice.** Slice 2E.2's 36-mutation discipline was not repeated as its own pass. Partial substitute, stated for what it is: the test-adequacy lens of §4.2 *was* a mutation analysis in effect — it identified three specific mutations that survived all 116 assertions, and all three are now killed. That is narrower than 2E.2's systematic sweep and is not claimed as equivalent.
5. **No local pgTAP, `supabase test db` or `db lint` execution**, and no type regeneration (ADR-041).
6. **`apply.ts` and `errors.ts` have no production caller.** By design; their consumer is Slice 2E.7. Behaviour is proven through an injected client double.

## 10. Carried-forward limitations

- **A pre-existing flaky test still reds CI intermittently.** `src/features/tasks/task-candidate-form.test.tsx`. It passed in both runs of this slice; recorded in `docs/TODO.md` under PRD §20.
- **Alias-driven relation resolution remains unproven in pgTAP.** This slice does not rely on it: the RPC receives already-resolved relation ids in the canonical patch and re-verifies ownership against the base tables directly, so `entity_aliases` is not on the apply path. Inherited item, still owed by whoever first depends on it.
- **The 2E-MATCH-018 baseline still measures the scoring layer**, not end-to-end matching.
- **`authenticated` retains `insert/update/delete` on `public.tasks` and on `public.reminders`.** PRD §16.4's residual risk, now with a concrete consequence this slice guards rather than closes: a direct client write to `reminders` between the close and the postcondition is exactly what `2E_REMINDER_INTEGRITY` exists to catch.

## 11. Verdict

**READY WITH NON-BLOCKING NOTES.**

Every `2E-UPDATE` requirement is met — two of them only after the second review round proved this report's own claims about them false. The closed error vocabulary is provoked token by token, the migration chain applies from an empty database, `db lint` is clean over `public,private`, and the foundation journey still passes on desktop and Pixel 7 — which matters more this slice than any before it, because this is the first Phase 2E migration to change an object the existing product already uses.

**Three review rounds and CI each caught something the others could not**, and that division is the substantive finding of this slice:

- **The migration-scoped adversarial round** caught `pg_catalog.coalesce` at eleven sites — a SQL special form that cannot be schema-qualified — two of them inside `audit_task_change`, so the first `public.tasks` update touching a watched column would have broken `persistTaskStatus`, `undo_confirm_entry_tasks` and two existing pgTAP suites. It also caught three tautological guards.
- **CI** caught `42601`: the migration would not apply at all, because a bare `case … then … end` cannot sit in a plpgsql `if` condition. **No local gate could see this** — which is precisely the division of labour ADR-038 established and the reason draft PR #18 exists.
- **The whole-artifact round** caught seven more, including a Critical this report had recorded as a met requirement: an undo that restored ten columns while guarding one, silently discarding a later command's work and stranding a live reminder against a null due date. Five of the seven live in code the migration-scoped round never read; two require reasoning across the migration and the test suite together.

The honest summary of that sequence is that **scoping a review to one artifact cannot find a contract that two artifacts disagree about**, and that a report claiming a requirement is met is exactly the claim a review should attack first. Two disposition rows in §7 are marked as corrected rather than silently rewritten.

**Non-blocking notes, each owed by a named slice or blocked on a named dependency:**

- §9.1's focused remote smoke and §9.2's authenticated journeys are named in **Epic 2E-D's own** acceptance criteria, not merely at phase level — unlike the two slices before it. Both are blocked on deployment and on Slice 2E.7's surface, and are recorded as gaps rather than argued away. The smoke must prove what pgTAP structurally cannot: a real two-session race, replay across two PostgREST requests, and TypeScript/RPC fingerprint agreement over the wire.
- §9.4: no dedicated mutation round; the test-adequacy lens is a narrower substitute and is not claimed as equivalent.
- §7: 2E-UNDO-005's task-scoped undo listing and every `2E-A11Y` requirement are Slice 2E.7's, per ADR-043.
- §10: the deferred split of `undeclared_failure` into database-raised and transport variants.

**What is deliberately not claimed:** no local pgTAP or `db lint` execution, no type regeneration, no remote smoke, no authenticated journey, and no dedicated mutation round.

## 12. Next

**Slice 2E.5 — Destructive actions and confirmation (Epic 2E-E)**, after the owed review round closes.

Read PRD §13.6 (`2E-DESTRUCTIVE-001..009`), §11.2's `cancel_task`/`restore_task` rows, §11.3, §12.3, §19.1 (Epic 2E-E), then `202607260058` — which 2E.5 extends by `create or replace` rather than replacing.

What Slice 2E.5 inherits and must not re-litigate:

- **The two actions are already refused with a declared code.** `2E_ACTION_NOT_ENABLED` is in the closed vocabulary, mapped, localized in both locales, and asserted in pgTAP. Enabling them means removing that guard and adding the token gate, not inventing a new function.
- **A matching fingerprint is not confirmation evidence.** `task_command_fingerprint` is granted to `authenticated` and all its inputs are client-held. 2E-DESTRUCTIVE-002's token must be server-issued, single-use, and bound to fingerprint, owner and operation key.
- **`cancelled_at` is never written by Slice 2E.4.** The shared status UPDATE writes it, but no enabled action can reach `cancelled` — `set_status` is bounded to the six non-terminal values as data, asserted in pgTAP. 2E.5 is where that column first carries a value.
- **`app.audit_actor` is the mechanism 2E-DESTRUCTIVE-007 needs.** The apply path sets `'user'` and the undo handlers set `'system'`, so user cancellation and undo-driven cancellation are already distinguishable at the trigger layer. Do not add a second mechanism.
- **2E-DESTRUCTIVE-008's creation-undo collision is not yet implemented**, in either ordering, and is Slice 2E.5's. The guard must cover undo, `restore_task`, and the recovery affordance with one declared code.
- **The undo handler for `cancel_task`/`restore_task` is `undo_apply_task_command_fields`**, already registered under `action_type = 'apply_task_command'`. Both actions' `undoStrategy` is `restore_fields` and both touch reminders, which that handler already restores by close-and-insert.
- **SQL constructs that are grammar, not functions.** Two of this slice's three defects were in that family: `coalesce`/`nullif`/`greatest`/`least` cannot be schema-qualified, and a bare `case … then … end` cannot appear in a plpgsql `if` condition. The post-deploy guard now greps for the first; the second is a comment and an audit.
