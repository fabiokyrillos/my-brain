# Phase 2F — Slice 2F.3 implementation plan and inventory

Branch base: `main` at `08bf5bc` (Slice 2F.2 accepted and closed). Governed by `docs/initiatives/phase-2f/PHASE_2F_PRD.md` Revision 4 and the accepted 2F.1/2F.2 artifacts.

**This plan is complete, and completing it surfaced one blocker that must be resolved before any code is written.** It is stated in §0 and everything after it is written as if the blocker were resolved.

---

## 0. BLOCKER — `create_task_command` cannot express a bare manual creation

2F-CREATE-001 requires `createRecord`'s task branch to route through the validated creation family. **The deployed contract cannot accept what that form produces**, and the contract change 2F-CREATE-002 specifies does not close the gap — it changes only the `created_by` origin.

### The evidence

`public.create_task_command` delegates payload validation to `private.task_command_creation_payload`, which enforces two things the manual form cannot satisfy:

1. **A closed set of seven qualifier actions** (`202607270060:86-95`):
   ```
   if p_action not in (
     'reschedule_due', 'set_planned', 'set_priority',
     'assign_project', 'assign_context', 'assign_person', 'set_waiting_on'
   ) then raise exception 'Invalid task creation action' using errcode = '22023';
   ```
   There is no bare "create a task with this title" action. The TypeScript mirror is `TASK_LIKE_CREATION_ACTIONS` (`creation.ts:16-24`), the same seven.

2. **An exact patch-key match for the chosen action** (`202607270060:128-142`):
   ```
   expected_patch_keys := case p_action
     when 'reschedule_due' then array['dueAt']
     when 'set_planned'    then array['plannedAt']
     when 'set_priority'   then array['priority']
     when 'assign_project' then array['projectRef']
     ...
   if actual_patch_keys is distinct from expected_patch_keys then
     raise exception 'Invalid task creation patch' using errcode = '22023';
   ```
   An empty patch yields `actual_patch_keys = NULL`, which `is distinct from` every expected array — so **every action refuses an empty patch**.

The family exists because a *no-match* natural-language command carries a qualifier ("postpone the invoice task to Friday" → no match → offer to create it *with that due date*). The qualifier is the payload. The manual inline-create form (`inline-create-form.tsx` → `createRecord`) supplies **only a name**, so:

- `decideInitialTaskCommandNoMatch` returns `clarification_requested`, not `creation_offered`;
- `buildTaskCommandCreationPayload` therefore throws `creation_not_offered` (`creation.ts:190-196`);
- and even bypassing that, the RPC refuses with `22023`.

### Why no in-scope workaround exists

| Candidate | Why it is not available |
|---|---|
| Map manual creation to `set_priority` with a default value | Writes a `manual_priority` the user never chose — an invention, and a visible product change |
| Map to `reschedule_due` / `set_planned` | Requires fabricating a date |
| Map to `assign_project` / `assign_context` / `assign_person` | Requires an existing owned entity the user did not name |
| Extend the form to collect a qualifier | **2F-CREATE-006** requires the form's UX be preserved |
| Use the Phase 2C candidate-materialization family | Requires an entry and a candidate index; manual creation has neither |
| Add a `_v2` creation RPC | Explicitly forbidden |

### What this changes about the migration

The PRD mandates **exactly one migration** for this slice, and its content is fully specified by 2F-CREATE-002 (origin parameter + undo-guard widening). Resolving this blocker almost certainly changes that migration's content — so writing it now risks either a second migration (violating the count) or an applied-and-never-reverted migration whose only new capability has no consumer.

**Therefore: no code, and no migration, until the owner decides.** The options are in §11.

---

## 1. Every production file expected to change

| File | Change | Requirement |
|---|---|---|
| `supabase/migrations/<new>_phase_2f_creation_origin.sql` | The slice's single migration (§2) | 2F-CREATE-002 |
| `src/features/operations/actions.ts` | `createRecord`'s **task branch only** routes through the creation family; the direct INSERT is deleted. Project/person/memory branches untouched | 2F-CREATE-001 |
| `src/features/task-commands/creation.ts` | Split the shared `PreviewArgs` type (§5); add the origin to the create payload builder; keep preview/issue unchanged | 2F-CREATE-002 |
| `src/features/operations/work-actions-copy.ts` *or* a sibling copy module | The declared, localized duplicate/failure copy the manual form renders | 2F-CREATE-003 |
| `src/features/operations/inline-create-form.tsx` | Only if the outcome state shape must carry the undo window; **no UX change** | 2F-CREATE-004/006 |
| `src/lib/supabase/database.types.ts` | Regenerated/hand-updated `create_task_command` Args (§5) | 2F-CREATE-002 |
| `docs/SECURITY.md` | The Option C reminder exception, its bounds and reopening condition | 2F-REMINDER-002 |
| `docs/DATABASE.md` | The `snoozed` dormancy note **only** | 2F-REMINDER-004 |
| `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/TODO.md`, two slice reports | Definition of Done | 2F-OPERATIONS-001/002 |

**Not changed:** `src/features/agent/actions.ts` (`createReminder` retained verbatim — 2F-REMINDER-001), any reminder UI, any grant, any Work-surface file, `apply_task_command`.

## 2. Migrations — exactly ONE

One migration, `phase_2f_creation_origin`, containing in a single transaction:

1. `drop function public.create_task_command(text, text[], jsonb, text, text, text);`
2. `create function public.create_task_command(... , p_created_by text default 'agent')` — the same body with the INSERT's literal `'agent'` (`202607270060:2514`) replaced by the parameter, and a bounded-domain guard (`p_created_by in ('user','agent')` else `22023`).
3. `create or replace function private.undo_create_task_command(uuid, uuid)` — **body-only, same signature**; the guard at `202607270060:2722` widens from `target_task.created_by is distinct from 'agent'` to `target_task.created_by not in ('user','agent')`, preserving every other condition and the `2E_UNDO_RESTORE_INTEGRITY` / `P0001` contract.
4. Re-issue `revoke all` + `grant execute` for the new signature, and the `comment on function`.
5. Post-deploy `DO` assertions: exactly **one** `pg_proc` row for `public.create_task_command`; `pronargdefaults = 1`; the undo guard's accepted domain present in `pg_get_functiondef`; grants unchanged (`authenticated` execute, nothing wider).

Drop **must** precede create in the same transaction — two overloads would raise `42725` on every call (the ambiguity ADR-053 documents).

## 3. RPCs affected

| RPC | Change |
|---|---|
| `public.create_task_command` | **Dropped and recreated** with one trailing defaulted parameter. No `_v2`. |
| `public.preview_task_command_creation` | **Unchanged** — signature, body, grants |
| `public.issue_task_command_creation_confirmation` | **Unchanged** |
| `public.apply_task_command` | **Unchanged** |
| `public.list_task_command_candidates` | **Unchanged** |
| `private.task_command_creation_payload` | **Unchanged** unless §11's resolution requires it |

## 4. Undo handlers affected

Exactly one: `private.undo_create_task_command(uuid, uuid)` — body-only widening of a single guard clause. **No new handler**, no change to the `undo_operation` router or its registry, no change to `private.undo_apply_task_command_fields`.

## 5. Generated types that must change

`src/lib/supabase/database.types.ts`:

- `create_task_command.Args` gains `p_created_by?: string`.
- **A consequential split:** `creation.ts:165` aliases `PreviewArgs` from `preview_task_command_creation` and uses it for all three creation RPCs, including `create_task_command`. Once the signatures diverge, `TaskCommandCreationClient` must carry a per-function argument type. This is the one non-obvious type change in the slice.

## 6. Signature assertions that must change

| Site | Count | Change |
|---|---|---|
| `supabase/tests/phase_2e_task_command_creation.sql` | **8** `::regprocedure`-class references to `public.create_task_command(text, text[], jsonb, text, text, text)` | Move to the 7-argument signature |
| `supabase/tests/rpc_version_retirement.sql:134` | **1** | Same |
| `src/features/task-commands/creation-migration.test.ts` | `MIGRATION` constant pinned to `202607270060`, plus `functionStatement`/`functionBody` lookups and the "exactly one `create or replace`" grep | Re-point the superseded-declaration greps at the new migration — the standing supersession hazard `STATE.md` records from Slice 2E.5 |
| `src/features/task-commands/database-types-parity.test.ts:148` | 1 | Args parity for the new signature |

## 7. Test suites expected to change

- `creation-migration.test.ts` (re-pointed + new assertions for the origin parameter and the widened guard)
- `database-types-parity.test.ts`
- `creation.test.ts` (payload builder split, origin threading)
- `operations/actions.test.ts` (the task branch's new routing, the declared duplicate error)
- `supabase/tests/phase_2e_task_command_creation.sql` (signature pins + **new** user-origin creation and user-origin undo cases — the exact case the pre-change contract refuses)
- `supabase/tests/rpc_version_retirement.sql`
- `src/lib/supabase/direct-write-guard.test.ts` — **the `tasks` allowlist drops to empty**, and the gate's own comment about 2F.3 is discharged
- New: `e2e`/probe script for 2F-CREATE-005 / 2F-OWNERSHIP-002 (two-owner, disposable, fail-closed cleanup)

## 8. Rollback boundary

- **Code:** one merge commit; `git revert -m 1` restores the prior manual-creation behaviour entirely.
- **Migration:** **not reverted** — standing posture. It persists compatibly because `p_created_by` defaults to `'agent'`, so every pre-existing caller (the chat creation path, `createTaskFromCommand`) is byte-identical.
- **Residual after a code revert:** tasks created with `created_by = 'user'` while the new path was live keep that value. They remain undoable, because the widened guard also persists. No data effect requires compensation.

## 9. Deployment-session gates required for acceptance

| Gate | Where |
|---|---|
| CI, three jobs, exact implementation SHA and exact merge SHA | CI |
| Remote migration parity **before** and **after** | Deployment session |
| Migration applied with all post-deploy `DO` assertions green | Deployment session |
| Exactly one `create_task_command` in `pg_proc`; no `42725` ambiguity on any call | Deployment session |
| Manual creation through the deployed contract → `created_by = 'user'` read back | Deployment session |
| `audit_logs.actor = 'user'` for that creation | Deployment session |
| `undo_operations` row recorded, then **executed undo** returning the task to its previous state | Deployment session |
| Pre-existing caller (chat creation) still functions unchanged through the default | Deployment session |
| Two-owner creation probe, non-vacuous (2F-CREATE-005, 2F-OWNERSHIP-002) | Deployment session |
| Zero fixture residue | Deployment session |

## 10. Requirement map

| Requirement | Delivered by | Status |
|---|---|---|
| 2F-CREATE-001 | `createRecord` task branch → creation family | **BLOCKED — §0** |
| 2F-CREATE-002 | The one migration (§2) | Ready; content depends on §11 |
| 2F-CREATE-003 | Operation-key idempotency + declared localized duplicate error | Depends on 001 |
| 2F-CREATE-004 | Creation-undo handler made satisfiable for user-origin rows | Ready (migration half); UI half depends on 001 |
| 2F-CREATE-005 | Two-owner creation probe incl. user-origin create + undo | Depends on 001 for the manual half |
| 2F-CREATE-006 | UX preserved | Constrains 001 |
| 2F-REMINDER-001 | `createReminder` retained verbatim | Ready — no code |
| 2F-REMINDER-002 | `SECURITY.md` exception entry | Ready |
| 2F-REMINDER-004 | `DATABASE.md` `snoozed` dormancy note | Ready |
| 2F-ANALYTICS-003 | Content-free payloads, asserted | Ready |
| 2F-OWNERSHIP-002 | The creation probe's two-owner half | Depends on 005 |
| 2F-OPERATIONS-001 | Parity before/after | Deployment session |
| 2F-OPERATIONS-002 | CI on both exact SHAs | CI |

## 11. The decision the blocker requires

Three ways forward. All of them keep the slice at **one** migration; they differ in what that migration contains and in whether the PRD's specified content is enough.

**Option A — widen the creation contract to admit a bare creation (one migration, larger).**
The same migration additionally admits a bare action (e.g. `create_task`) in `private.task_command_creation_payload` with an empty expected patch, and the TypeScript vocabulary gains it. Manual creation then routes through the family exactly as 2F-CREATE-001 asks, with no UX change and no invention. **Cost:** this is a contract change the PRD did not specify, i.e. a new requirement — which the owner must authorize explicitly.

**Option B — defer 2F-CREATE-001/003/005/006 and ship the rest.**
The migration carries exactly what 2F-CREATE-002 specifies. `createRecord`'s direct INSERT stays, the `tasks` allowlist does **not** reach empty, and 2F.4's revocation is blocked until this is resolved. **Cost:** the phase's central invariant is not reached on schedule, and the deployed origin parameter has no consumer.

**Option C — re-scope 2F.3 to the reminder/documentation requirements only.**
No migration at all this slice; 2F-CREATE moves to a later slice once the contract question is decided. **Cost:** the phase's migration count and slice order shift.

**Recommendation: Option A.** It is the only one that satisfies 2F-CREATE-001 as written, keeps the migration count at one, preserves the form's UX, and invents nothing — the bare action is the honest representation of what the manual form actually expresses. It requires the owner to authorize a contract change beyond the PRD's text, which is exactly the kind of decision the PRD reserves to the owner.
