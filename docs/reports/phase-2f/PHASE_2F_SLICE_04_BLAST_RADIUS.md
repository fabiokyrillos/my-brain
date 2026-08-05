# Phase 2F — Slice 2F.4 revocation blast-radius summary

**Pre-implementation gate. No code, migration, grant, PRD edit or behaviour change was produced.** Owner decisions A1–A7 approved; A8 (early census re-run) deferred and **not** executed.

Scope of the revocation under assessment, per approved A4/A6:

```
revoke insert, update, delete on public.tasks     from authenticated;
revoke        update, delete on public.reminders  from authenticated;
```

`authenticated` **retains** `select` on both tables and `insert` on `public.reminders` (the Option C exception, 2F-REMINDER-001).

---

## 0. Method and reconciliation basis

Four independent scans, all executed 2026-07-29 on HEAD `2a13d07` (working tree clean apart from the two 2F.4 planning documents):

1. `scripts/phase-2f-writer-inventory.mjs` — the PRD's own Gate 2 artifact, re-run per 2F-PRECOND-001. Read-only, credential-free, no network.
2. An independent PostgREST-builder-chain scan over **345** client-side files across `src/`, `scripts/`, `e2e/`, `supabase/functions/`, classifying every `.from("tasks"|"reminders")` chain as read or write by terminal method.
3. A raw-SQL scan for `insert into|update|delete from (public.)?(tasks|reminders)` across the same 345 files, plus all 62 migrations and all 31 pgTAP files.
4. A role-context scan resolving, for every SQL statement, the last preceding `set local role` / `reset role` directive.

**Two blind-spot checks were run explicitly, because the direct-write guard cannot see either:**

| Check | Result |
|---|---|
| `.from(<non-literal>)` against a guarded table — a dynamic table name the guard's regex would miss | **None.** Every `.from()` targeting `tasks`/`reminders` takes a string literal. The 41 dynamic `.from(table)` sites found are all `Array.from(...)` (unrelated) or service-role cleanup/census loops that issue `.select()` only. |
| Raw SQL DML strings in client code — a query the builder-chain scan would miss | **None.** The only three hits are string *assertions* inside `src/features/task-commands/creation-migration.test.ts` (`:181`, `:198`, `:221`), which grep the migration text; they issue no SQL. |

### Reconciliation with the writer inventory

| Population | Writer inventory | Independent scan | Agree? |
|---|---|---|---|
| Client-role writers on guarded tables | 9 | 9 real, + 1 synthetic source *string* inside the guard's own self-test (`direct-write-guard.test.ts:131`, not a Supabase call) | **yes** |
| — of those, executing as `authenticated` | 5 | 5 | **yes** |
| In-database writers (last declaration) | 14 | 14 | **yes** |
| Triggers on the two tables | 6 | 6 | **yes** |
| pgTAP statements touching the two tables | 33 | 33 (13 `authenticated`, 20 session-default `postgres`) | **yes** |

**No previously unidentified caller was found in any population.**

---

## 1. Tasks INSERT — `revoke insert on public.tasks from authenticated`

### Production callers
**None.**

`createRecord`'s task branch (`src/features/operations/actions.ts:122`) was converted in Slice 2F.3 and now reaches `public.create_task_command` (SECURITY DEFINER) via `src/features/task-commands/creation.ts:564`. The candidate-materialization path (`src/features/tasks/actions.ts:174`, `:252`) calls `confirm_entry_task_candidates_v4`/`_v6` (both SECURITY DEFINER). No module issues a direct INSERT.

### Scripts

| Site | Client role | Breaks? | Disposition |
|---|---|---|---|
| `scripts/remote-phase-2e-smoke.mjs:144` | `owner.client` — **authenticated** | **yes** | Re-point to the script's existing `admin` service-role client (2F-TESTMIG-006). Pure fixture; proves nothing about grants. |
| `scripts/remote-editable-candidate-confirmation-smoke.mjs:797` | `otherOwner` — **authenticated** | **yes** | Re-point to `admin`. Pure fixture seeding a second owner's task. |
| `scripts/remote-supabase-smoke.mjs:258` | `first` — **authenticated** | **yes** | **Redesign, not re-point.** See §6 — this row carries a second, unrelated invariant. |
| `scripts/phase-2f-gate3-exact-title-reuse.mjs:137` | `admin` — service_role | no | unchanged |
| `scripts/phase-2f-gate3-exact-title-reuse.mjs:143` | `admin` — service_role | no | unchanged |
| `scripts/remote-product-events-smoke.mjs:165` | `admin` — service_role | no | unchanged |

### pgTAP
**None affected.** Every task INSERT in the suite runs under the session default (`postgres`), never under `set local role authenticated`:

`apply.sql:260` · `destructive.sql:245` · `matching.sql:125` · `phase_2f_effective_limit.sql:43` · `candidate_action_consistency.sql:341`, `:351` · `foundation_hardening.sql:162` · `needs_attention_projection.sql:83` · `phase_2c_slice_2_planning_priority_no_due.sql:159` · `phase_2c_slice_4_candidate_dispositions.sql:611`, `:739` · `phase_2c_slice_5_task_graph.sql:142`

**Disposition: all twelve unchanged.**

### E2E
**None.** `e2e/` contains exactly two references to either guarded table — `editable-candidate-confirmation.spec.ts:333` and `:445` — both `.select()` reads. No E2E spec writes `tasks` or `reminders` in any form.

### Migration assertions
**None affected.** No migration in the chain contains `set role`, `set local role` or `set session authorization` — every migration statement executes as the migration owner. The 30 task INSERT statements in migrations are all bodies of SECURITY DEFINER functions (`confirm_entry_tasks`, `confirm_entry_task_candidates` and `_v2`…`_v6`, `create_task_command`), which execute as owner and are unaffected.

### Trigger consequence
`public.create_due_task_reminder` is **SECURITY INVOKER** and fires `after insert on public.tasks`. After this revocation, every surviving task INSERT originates inside a SECURITY DEFINER body, so the trigger can never again execute as `authenticated`. This is the proof obligation 2F-REVOKE-002 names; it is discharged by construction here and must still be asserted, not assumed.

---

## 2. Tasks UPDATE — `revoke update on public.tasks from authenticated`

### Production callers
**None.**

`persistTaskStatus` and `updateTaskStatus` were **deleted** in Slice 2F.2 (2F-SURFACE-012/013); a repository-wide search finds their names only in comments and test prose. All four Work actions route through `list_task_command_candidates` → `public.apply_task_command` (SECURITY DEFINER). Undo routes through `public.undo_operation` (SECURITY DEFINER router) at four call sites: `tasks/actions.ts:334`, `agent/actions.ts:520`, `interpretations/actions.ts:112`, `task-commands/actions.ts:1039`.

### Scripts

| Site | Client role | Breaks? | Disposition |
|---|---|---|---|
| `scripts/phase-2f-gate3-exact-title-reuse.mjs:265` | `admin` — service_role | no | unchanged |

**No `authenticated` task UPDATE exists in any script.**

### pgTAP — 8 statements, all breaking

| # | Site | Statement | §9 class | Disposition |
|---|---|---|---|---|
| 1 | `apply.sql:580` | `update … set status = 'in_progress'` (inside `lives_ok`) | Row 1 — retire and invert | The positive claim "a plain client-side task UPDATE still works" is **retired**; the denial moves to 2F-REVOKE-004. Its protected invariant — `audit_task_change` reads `app.audit_actor` with `missing_ok` and never raises `42704` — is **restaged privileged** (2F-TESTMIG-002). |
| 2 | `apply.sql:598` | `update … set title = 'Titulo alterado pelo cliente'` | Row 2 — vehicle → `postgres` | Keeps: trigger watches `title`; before-state carries the superseded title; actor defaults to `'user'` when unset. **Plus** the added definer-context actor-default assertion (2F-TESTMIG-003). |
| 3 | `apply.sql:643` | `update … set description = 'Nota nova do cliente'` | Row 3 — vehicle → `postgres` | Same, for `description`. |
| 4 | `apply.sql:1385` | `update … set completed_at = …` on a non-terminal row | Row 4 — privileged-interference | Keeps the one-input divergence bless, now writer-agnostic. The stale comment at `:1382-1384` asserting the old grants is corrected in the same edit (2F-TESTMIG-007). |
| 5 | `apply.sql:2436` | `update … set status = 'in_progress'` (post-apply drift) | Row 5 — privileged-interference | Keeps: the ten-column undo guard refuses a task that drifted after apply, regardless of writer. |
| 6 | `creation.sql:1149` *(PRD anchor `:1075`, +74 — A3)* | `update … set title = 'Edited later'` | Row 7 — privileged-interference | Keeps: creation-undo's guard on post-creation drift, writer-agnostic. |
| 7 | `creation.sql:1582` | `update … set created_by = 'agent'` | **New row 12** (A2) — privileged-interference | Keeps: `undo_create_task_command` refuses a user-origin task whose origin drifted to `agent` (`2E_UNDO_RESTORE_INTEGRITY`). Restage vehicle as `postgres`; assertion unchanged. |
| 8 | `creation.sql:1609` | `update … set created_by = 'user'` | **New row 13** (A2) — privileged-interference | Keeps: the mirror case, agent → user. Restage vehicle as `postgres`; assertion unchanged. |

Session-default (`postgres`) task UPDATEs — **unaffected, all unchanged**: `candidate_action_consistency.sql:365`, `:398`, `:534` (dynamic `format`), `phase_2c_slice_4_candidate_dispositions.sql:521`, `:524`, `:754`.

### E2E
**None.**

### Migration assertions
**None affected.** All 40+ task UPDATE statements in migrations are bodies of `apply_task_command`, `undo_operation`, `confirm_entry_task_candidates*`, `private.undo_apply_task_command_fields`, `private.undo_confirm_entry_tasks` or `private.undo_create_task_command` — owner or definer-routed context.

One top-level task UPDATE exists in the chain: `202607170028_phase_2x_candidate_action_consistency.sql:109-115`, a one-time historical `source_interpretation_id` backfill. It executed as the migration owner when applied and is not re-executed against a live database. **Unaffected.**

---

## 3. Tasks DELETE — `revoke delete on public.tasks from authenticated`

| Surface | Callers |
|---|---|
| Production | **None** |
| Scripts | **None** |
| pgTAP | **None** |
| E2E | **None** |
| Migration assertions | **None** |

A repository-wide search for a task DELETE — PostgREST `.delete()` chain and raw `delete from (public.)?tasks` alike, across `src/`, `scripts/`, `e2e/`, `supabase/functions/`, `supabase/migrations/` and `supabase/tests/` — returns **zero results of any kind**.

Task rows are removed only by FK cascade (`user_id references auth.users(id) on delete cascade`) and are otherwise retired by state transition to `cancelled`, never deleted (ADR-018: undo appends and cancels, never deletes history).

**Disposition: nothing to migrate. The privilege is dead on arrival and its revocation is unobservable.**

---

## 4. Reminders UPDATE — `revoke update on public.reminders from authenticated`

### Production callers
**None.**

Every reminder UPDATE in production runs in a definer or definer-routed context:

| Writer | Context | Site |
|---|---|---|
| `public.apply_task_command` | **SECURITY DEFINER** | `202607270060:1567` |
| `private.undo_apply_task_command_fields` | invoker, reached only via the definer `undo_operation` | `202607270060:2043` |
| `private.undo_create_task_command` | invoker, reached only via the definer `undo_operation` | `202607290062:777` |
| `public.run_user_heartbeat` | **SECURITY DEFINER**, `execute` granted to `service_role` only | `202607170016:552` |

No user-facing surface cancels, snoozes, edits or reschedules a reminder — that path does not exist in the product (§5 of the planning report, path 7).

### Scripts
**None.** The only script reminder write is `scripts/remote-supabase-smoke.mjs:286`, an **INSERT**, which survives under the retained Option C grant. Its follow-up read at `:296` is a `select`.

### pgTAP — 2 statements, both breaking

| # | Site | Statement | §9 class | Disposition |
|---|---|---|---|---|
| 1 | `creation.sql:1189` *(PRD anchor `:1115`, +74 — A3)* | `update public.reminders set remind_at = remind_at + interval '10 minutes'` | Row 8 — conditional on 2F-REMINDER-003 | A4 approved revocation → **restage vehicle as `postgres`**. Keeps: creation-undo copes with a reminder whose `remind_at` moved after creation, whoever moved it. |
| 2 | `creation.sql:1209` *(PRD anchor `:1135`, +74 — A3)* | `update public.reminders set status = 'snoozed' …` | Row 9 — conditional on 2F-REMINDER-003 | A4 approved revocation → **restage vehicle as `postgres`**. Keeps: creation-undo copes with a reminder in the dormant `snoozed` state, preserving 2F-REMINDER-004's falsifiability of the handlers' snoozed branches. |

### E2E
**None.**

### Migration assertions
**None affected.** All reminder UPDATE statements in migrations are function bodies (`apply_task_command`, `run_user_heartbeat`, the three `private.undo_*` handlers). The one textual match at `202607270060:2983` — `if position('insert into public.reminders' in create_body) > 0` — is a **string assertion over `pg_get_functiondef` output**, not DML.

---

## 5. Reminders DELETE — `revoke delete on public.reminders from authenticated`

| Surface | Callers |
|---|---|
| Production | **None** |
| Scripts | **None** |
| pgTAP | **None** |
| E2E | **None** |
| Migration assertions | **None** |

A repository-wide search for a reminder DELETE returns **zero results of any kind**. Reminder rows are removed only by cascade: `task_id references public.tasks(id) on delete cascade`, `entry_id references public.entries(id) on delete cascade`, `user_id references auth.users(id) on delete cascade`.

**Disposition: nothing to migrate. The privilege is dead on arrival and its revocation is unobservable.**

---

## 6. Control group — privileges deliberately **retained**

Listed so the summary is exhaustive about what does *not* break, and so an over-reaching migration is detectable.

### `authenticated` INSERT on `public.reminders` — **retained** (Option C, 2F-REMINDER-001)

| Site | Role | Status |
|---|---|---|
| `src/features/agent/actions.ts:126` — `createReminder` | authenticated | **must keep working** — live user surface, the sole documented exception, allowlisted in `direct-write-guard.test.ts:53` |
| `scripts/remote-supabase-smoke.mjs:286` | authenticated | keeps working; unchanged |
| `supabase/tests/phase_2e_task_command_apply.sql:2587` | authenticated | §9 row 6 — **keep as-is**, doubles as living proof the retained grant works |
| `supabase/tests/phase_2e_task_command_creation.sql:1232` *(anchor `:1158`)* | authenticated | §9 row 10 — **keep as-is** |
| `supabase/tests/phase_2e_task_command_creation.sql:1253` *(anchor `:1179`)* | authenticated | §9 row 11 — **keep as-is** |

### `authenticated` SELECT on both tables — **retained**

Eleven production read sites across `src/app/**` and `src/features/daily-cycle/**`, plus `agent/actions.ts:823` (review generation), `interpretations/data.ts:253`, `tasks/relation-options.ts:53`, and the two E2E reads. All continue under RLS. Read-side RLS is the compensating evidence 2F-REVOKE-004 names for the write-side RLS proof the revocation makes unreachable.

### The one caller needing redesign rather than re-pointing

`scripts/remote-supabase-smoke.mjs:258` is listed in §1 as a script fixture, but it is **not** a pure fixture and must not be treated as one. The task it inserts is the required subject of the cross-owner composite-FK denial at `:265-270`, which asserts that `first` inserting a `task_projects` row joining their own task to `second`'s project fails with `23503`. That is a Phase-1 ownership invariant with no Phase 2F relevance.

Re-pointing the insert to the script's `admin` client preserves the denial. Deleting the "broken" insert silently destroys the invariant **while leaving the suite green** — the highest-ranked regression risk in the planning report (§15/Q10). Additionally, `npm run test:remote` — 2F-REVOKE-005's own in-session gate — *is* this file, so this rework is a hard prerequisite of the deployment session rather than a follow-up.

---

## 7. Totals

| Group | Production | Scripts | pgTAP | E2E | Migration assertions | Total breaking |
|---|---|---|---|---|---|---|
| Tasks INSERT | **0** | 3 | 0 | 0 | 0 | **3** |
| Tasks UPDATE | **0** | 0 | 8 | 0 | 0 | **8** |
| Tasks DELETE | **0** | 0 | 0 | 0 | 0 | **0** |
| Reminders UPDATE | **0** | 0 | 2 | 0 | 0 | **2** |
| Reminders DELETE | **0** | 0 | 0 | 0 | 0 | **0** |
| **Total** | **0** | **3** | **10** | **0** | **0** | **13** |

Reconciliation of the pgTAP column against the corrected §9 inventory of **13** `authenticated` statements: 10 break (8 tasks UPDATE + 2 reminders UPDATE) and **3 do not** (the retained reminders INSERTs — §9 rows 6, 10, 11). 10 + 3 = 13. ✔

Reconciliation of the scripts column against the writer inventory's 5 `authenticated` client-role writers: 3 break (tasks INSERT), **2 do not** (`remote-supabase-smoke.mjs:286` and `src/features/agent/actions.ts:125`, both retained reminders INSERTs). 3 + 2 = 5. ✔

---

## 8. Gate verdicts

| Stop condition | Result |
|---|---|
| Any production caller exists in the five revoked groups | **No.** Zero, in all five groups. |
| Any previously unidentified caller exists | **No.** All four scans reconcile exactly with `scripts/phase-2f-writer-inventory.mjs` across all five populations. Both guard blind spots — dynamic table names and raw SQL in client code — were checked explicitly and are empty. |

Neither stop condition fired.

> **This revocation has no production behavioural impact.**

Thirteen non-production statements change vehicle or client. No application source file changes. No user-observable behaviour changes. No data is written or removed by the migration.

---

## 9. Standing constraints carried into implementation

- Scope: **REVOKE 1–8, TESTMIG 1–8, REMINDER 3**, plus the A1–A5 documentation corrections. Nothing else.
- **Exactly one migration.** The re-grant is a committed script, not a migration.
- **No application source changes.** If any `src/` file needs an edit, this inventory was wrong — stop and report (planning report §15, stop condition 6).
- A8 remains deferred: `scripts/phase-2f-reminder-census.mjs` is **not** run early; it stays a 2F.6 closeout gate.
- The nine stop conditions in the planning report §15 remain in force, unchanged.
