# Slice G5 — reminder lifecycle: pre-implementation repository investigation

**Authorized by** DEC-6 Option A (owner, 2026-07-31): one narrow `SECURITY DEFINER` reminder
command boundary; no re-grant of `authenticated` UPDATE/DELETE on `public.reminders`; no
physical deletion.

**Status** — **STOPPED before the migration.** Item 12 of the required investigation
("whether a snoozed reminder automatically returns to an active state") returned an answer that
makes the authorized `snooze_reminder` operation undeliverable as named without a second owner
decision. Recorded below as **DEC-7**. Every other investigation item is answered and carries no
further decision.

Parity head at investigation time: `202607300063`. Working tree clean at `cea24c8`.

---

## 1. Current `reminders` schema

`202607160007_agent_operations.sql:33-48`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `user_id` | `uuid not null` | → `auth.users(id) on delete cascade` |
| `task_id` | `uuid null` | → `public.tasks(id) on delete cascade` |
| `entry_id` | `uuid null` | → `public.entries(id) on delete cascade` |
| `title` | `text not null` | `char_length between 1 and 500` |
| `remind_at` | `timestamptz not null` | the firing instant |
| `important` | `boolean not null default false` | drives quiet-hours override and priority |
| `status` | `text not null default 'scheduled'` | `check in ('scheduled','sent','snoozed','cancelled')` |
| `snoozed_until` | `timestamptz null` | **written by nothing, read by nothing** |
| `sent_at` | `timestamptz null` | stamped by `run_user_heartbeat` |
| `created_at` / `updated_at` | `timestamptz not null` | `reminders_updated_at` trigger on update |

Index: `reminders_user_due_idx (user_id, status, remind_at)` — exactly the shape a status- and
time-scoped owner query needs; no new index is required.

Ownership FKs added by `202607170016:66-70`: composite `(user_id, task_id) → tasks(user_id,id)`
and `(user_id, entry_id) → entries(user_id,id)`. A reminder therefore **cannot** point at another
user's task or entry at the storage layer.

There is **no unique constraint on `task_id`** — several live reminders per task are legal, and
`apply_task_command` depends on that being true.

## 2. All current statuses, and who produces each

| Status | Produced by | Consumed by |
|---|---|---|
| `scheduled` | column default — `createReminder` INSERT, `create_due_task_reminder` trigger, `apply_task_command` insert half, undo restore-by-insert | `run_user_heartbeat` fires on it; `apply_task_command` close half cancels it; `list_task_command_candidates` counts only it |
| `sent` | `run_user_heartbeat` only, together with `sent_at = now()` | nothing |
| `cancelled` | `apply_task_command` close half; undo handlers | nothing (filtered out of the reminders page query) |
| `snoozed` | **nothing, anywhere** | the undo handlers' live set only — see §12 |

## 3. `remind_at` and `snoozed_until` semantics

`remind_at` is the sole firing predicate. `run_user_heartbeat` (`202607170016:508-512`) selects:

```sql
from public.reminders reminder
where reminder.user_id = p_user_id
  and reminder.status = 'scheduled'
  and reminder.remind_at <= now()
  and (not in_quiet_hours or (allow_important and reminder.important))
```

then marks the rows it actually notified as `sent` (`:552-560`), keyed on the notification
`dedupe_key = 'reminder:' || reminder.id`.

`snoozed_until` is a **dead column on this table**. A repository-wide search finds no writer and
no reader outside `pending_questions` (a different table with its own, live, snooze semantics).
Phase 2F's own closeout census names the situation in a test assertion
(`src/lib/closeout/phase-2f-census.test.ts:152`):

> `"5. snoozed rows (never fire; no reactivation path exists)"`

measured at **0 rows** against the deployed project.

## 4. `task_id` and `entry_id` relationships

Both nullable and independent. Three reachable shapes:

- **task-linked** — created by `create_due_task_reminder` (trigger, `after insert on tasks`,
  when `due_at is not null and status not in ('completed','cancelled')`) or by
  `apply_task_command`'s insert half. `entry_id` is null in both.
- **independent** — created by `createReminder`; both `task_id` and `entry_id` null.
- **entry-linked** — the column exists and the composite owner FK is enforced, but **no writer
  in the repository ever sets `entry_id`**. Reachable only by migration or by a future writer.

## 5. Existing reminder creation paths

| Path | Context | Sets |
|---|---|---|
| `createReminder` (`src/features/agent/actions.ts:125-132`) | client INSERT as `authenticated` — the documented **Option C** exception | `user_id`, `title`, `remind_at`, `important` |
| `public.create_due_task_reminder` (`202607160007:195-209`) | `security invoker` trigger on `tasks` INSERT | `user_id`, `task_id`, `title`, `remind_at = greatest(now(), due_at - 1h)` |
| `apply_task_command` insert half (`202607270060:1600-1615`) | `security definer` | `user_id`, `task_id`, effective `title`, `remind_at` |
| `private.undo_apply_task_command` / `undo_create_task_command` | `security definer`, via the `undo_operation` router | restore-by-insert from `before_state.reminders_cancelled`, including `important` |

## 6. Reminder side effects from `apply_task_command`

Six actions set `action_touches_reminders := true`: `complete_task`, `reopen_task`,
`cancel_task`, `restore_task`, `set_status` (terminal branch), `reschedule_due`.

**Close half** (`202607270060:1566-1589`):

```sql
update public.reminders set status = 'cancelled'
where task_id = p_task_id and user_id = current_user_id and status = 'scheduled'
```

Every scheduled row, deliberately — there is no unique constraint, and a `limit 1` would strand
orphans that still fire. The closed rows' `id/title/remind_at/important` are recorded on the undo
row for restore-by-insert.

**Insert half** — exactly one fresh row when the effective due date survives the patch and is in
the future. Title is the *effective* task title, so a rename cannot leave the reminder
contradicting the task.

**Post-condition** (`:1640-1652`) — the task must hold exactly one `scheduled` row afterwards, or
zero when no row was armed; otherwise `2E_UNDO_REMINDER_INTEGRITY` / reconciliation failure.

**Load-bearing consequence for G5:** any user-initiated change to the `remind_at` of a
**task-linked** reminder is silently discarded by the next task command on that task — the close
half cancels it and the insert half re-derives from `due_at`. This is inherent to the existing
contract, not a defect, and the UI must disclose it rather than pretend otherwise.

## 7. Current grants and policies

Migration `202607300063` (parity head) — and it *asserts* the posture at deploy time, raising if
it drifts (`:133-146`).

| Object | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `public.reminders` | nothing | `select`, `insert` | platform default |

RLS `enable` **and** `force`. Four owner-scoped policies survive; `reminders_update_own` and
`reminders_delete_own` are **present but unreachable by direct client DML** (the grant check
precedes policy evaluation). Retaining them is recorded owner decision A5 — the re-grant
rollback script must restore the prior posture exactly.

**G5 does not touch any of this.** A `SECURITY DEFINER` RPC writes as its owner; the revocation
stays, the assertions stay, the policies stay.

## 8. Existing audit conventions

`public.audit_logs` (`202607160003:128-142`):

`id, user_id, action_type text not null, entity_type text not null, entity_id uuid,
actor text not null check in ('user','agent','system'), before_state jsonb, after_state jsonb,
reason text not null, source_entry_id uuid, created_at`.

`entity_type` on `audit_logs` carries **no CHECK constraint** — `'reminder'` is writable today.
(The `check (entity_type in (…,'reminder',…))` at `202607160007:122` is on `entity_attachments`,
a different table.)

Convention: `SECURITY DEFINER` command RPCs `insert into public.audit_logs (…)` inline, in the
same transaction as the state write. `actor = 'user'` for owner-initiated transitions;
`'system'` for compensation. `reason` is English prose and — since Slice G4 — is **never
rendered**; the History surface derives localized text from `action_type`/`entity_type`
(UX-28). `authenticated` retains `insert` on `audit_logs` (`202607170016:196` revoked only
`update, delete`).

**Integration point:** `src/features/history/vocabulary.ts`, `copy.ts` and `subject-route.ts`
(shipped in G4) contain **no reminder entries at all**. G5 must add the new `action_type`
members, the `reminder` `entity_type`, and the `/[locale]/app/reminders` subject route, or the
new rows render through G4's safe fallback instead of localized prose. Ordinary implementation
detail; named here so it is not missed.

## 9. Existing command/RPC idempotency conventions

The `resolve_pending_question_v*` family (`202607230046:33-185`) is the exact reference shape,
and it is the one G5 should follow:

1. `auth.uid()` null → `42501`.
2. `p_operation_key` trimmed, length 8..240 → else `22023`.
3. Namespaced internally: `internal_operation_key := '<rpc-name>:' || normalized_key`.
4. Canonical request JSON → `sha256` hex → `request_fingerprint`.
5. Reserve by `insert into public.undo_operations (…) on conflict (user_id, operation_key)
   where operation_key is not null do nothing returning id`.
6. On conflict: re-read `for update`; fingerprint match → **deterministic replay** returning
   `{"idempotent": true}`; mismatch → `P0001` with `detail = '…_IDEMPOTENCY_MISMATCH'`.
7. A failed operation rolls the reservation back atomically, so only successes are replayable.

Staleness convention: an expected pre-state mismatch raises `55P03`
(**never `40001`** — see memory `undo-operation-40001-resolved`; `40001` triggers a gateway
hang).

## 10. How cancellation is represented

By `status = 'cancelled'`. There is no `cancelled_at` column on `reminders` and no soft-delete
flag. No `delete` against `public.reminders` exists **anywhere in the repository** — rows are
removed only by the `tasks` / `entries` / `auth.users` cascades.

## 11. Whether rescheduling updates `remind_at`, `snoozed_until` or both

**`remind_at`, and only `remind_at`.** It is the sole firing predicate (§3); `snoozed_until` is
inert (§3, §12). Writing `snoozed_until` alone would produce a reminder that visibly claims a new
time and never fires.

## 12. Whether a snoozed reminder automatically returns to an active state — **NO**

This is the finding that stops the slice.

- `run_user_heartbeat` selects `status = 'scheduled'` **only**. It has no `snoozed` branch and
  never reads `reminders.snoozed_until`.
- Phase 2F recorded the dormancy deliberately (`docs/DATABASE.md:155`, finding
  **2F-REMINDER-004**): *"nada em produção o escreve e nada dispara a partir dele … Ele é
  diferido, não aposentado."* Retiring the CHECK member was deferred for want of evidence that no
  row carries it; the closeout census then measured **0 `snoozed` rows** in the deployed project.
- The closeout census names the gap in an executable assertion:
  `"5. snoozed rows (never fire; no reactivation path exists)"`.

### The asymmetry that makes this more than a missing branch

The two halves of the Phase 2E/2F reminder contract **disagree about whether `snoozed` is live**:

| Site | Live set |
|---|---|
| `apply_task_command` close half (`202607270060:1570`) | `status = 'scheduled'` |
| `list_task_command_candidates` (`matching.ts:164`) | `status = 'scheduled'` |
| `private.undo_apply_task_command` (`202607270060:2047`) | `status in ('scheduled','snoozed')` |
| `private.undo_create_task_command` (`202607290062:753,767,780`) | `status in ('scheduled','snoozed')` |

Today the disagreement is inert because no `snoozed` row can exist. **A user-facing snooze that
writes `status = 'snoozed'` activates it in production:** completing a task would no longer
cancel that task's snoozed reminder (the close half cannot see it), while the undo handlers
would count it as live — and the forward path's own post-condition check would then be reasoning
about a set the close half never touched. Introducing the first real `snoozed` rows is therefore
not a local change to a reminder RPC; it changes the observable behaviour of four Phase 2E/2F
`SECURITY DEFINER` bodies that the owner has not authorized touching.

## 13. Whether restore/reactivate already has a defined semantic — partially, and it forbids one case

`apply_task_command`'s undo restores cancelled reminders by **close-and-insert — never by
un-cancelling** (`202607260058:141-150`). The rationale is recorded: un-cancelling original ids
is safe only while the heartbeat keeps selecting `status = 'scheduled'`, whereas fresh rows are
safe under every ordering *because only a new id gets a fresh `dedupe_key`.* The restored
`remind_at` is kept verbatim even when now in the past — a past-due `scheduled` reminder firing
on the next tick is the state that existed, and that is deliberate.

Two consequences, both decidable from repository truth without an owner call:

- **`cancelled → scheduled` is coherent.** The row's `dedupe_key` (`'reminder:' || id`) was never
  consumed, so the reminder genuinely fires again. A past `remind_at` firing on the next tick is
  the precedent the undo path already sets.
- **`sent → scheduled` is NOT coherent and must be refused.** The notification for that id
  already exists, so `on conflict (user_id, dedupe_key) do nothing` suppresses it forever
  (`202607270060:2038` states this outright). The row would sit `scheduled` and permanently
  silent. Re-arming a delivered reminder is a *new* reminder, not a restore.

So `restore_reminder` is supported **from `cancelled` only**.

## 14. Whether title / `important` editing belongs in this boundary

For **independent** reminders (`task_id is null`) — yes, safely. They are authored by
`createReminder`, no derived writer maintains them, and physical deletion is unavailable, so a
mistyped title is otherwise permanent. `important` is a genuine lifecycle lever: it decides
quiet-hours override and notification priority (`202607170016:497-512`).

For **task-linked** reminders — no. `apply_task_command`'s insert half copies the *effective task
title* precisely so the reminder cannot contradict the task; a user edit would be silently
overwritten by the next task command. Editing the title of a task-linked reminder is really
"rename the task", which already has a command.

**Constraint:** `edit_reminder` admits only rows with `task_id is null`. This is a repository-truth
constraint, not a new decision.

---

# DEC-7 — owner decision required (the meaning of `snooze`)

**DEC-6 Option A authorizes `snooze_reminder` as a named operation. The repository cannot deliver
a firing snooze under the name's obvious implementation.** Writing `status = 'snoozed'` produces
a reminder that never fires again (§12) and activates a live-set disagreement across four Phase
2E/2F `SECURITY DEFINER` bodies. The decision is which of these G5 ships.

### (a) Snooze is `remind_at` movement — *recommended*

`snooze_reminder` sets `remind_at := <future instant>` and leaves `status = 'scheduled'`;
`snoozed_until` is written as **provenance evidence only** (it stays non-firing, which is its
current truth) or left null. The reminder actually fires at the new time.

- Zero change to `run_user_heartbeat`, to `apply_task_command`, or to any undo handler.
- `status = 'snoozed'` stays dormant; 2F-REMINDER-004 is untouched; the census stays at 0.
- Snooze and reschedule become the same physical write, distinguished by audit `action_type`,
  by validation (snooze: bounded relative offsets from *now*; reschedule: an absolute instant),
  and by UI affordance. Both remain separate named operations with separate fields, as
  DEC-6 requires.
- **Cost:** the word "snooze" no longer means "enter the `snoozed` state". The dormant CHECK
  member remains dormant and unretired.

### (b) Snooze writes `status = 'snoozed'`, and the heartbeat gains reactivation

Mirrors the live `pending_questions` pattern (`202607230048` — automatic `snoozed → open` at
read time).

- Requires modifying **`run_user_heartbeat`**, the Phase 1 delivery engine, which is outside the
  reminder command boundary DEC-6 scoped.
- Requires reconciling the `scheduled`-only close half of `apply_task_command` with the
  `scheduled|snoozed` live set of the undo handlers — or accepting, in writing, that completing a
  task leaves that task's snoozed reminders alive.
- Reverses a recorded Phase 2F determination (2F-REMINDER-004) and a measured-at-zero census
  bucket.
- **Cost:** materially larger blast radius than DEC-6 described; G5 stops being narrow.

### (c) Drop `snooze` as a distinct operation

Ship `reschedule_reminder`, `cancel_reminder`, `restore_reminder`, `edit_reminder`, and give the
reschedule UI relative quick-presets ("+1 hour", "tomorrow morning"). Honest and smallest; the
`snoozed` literal stays dormant.

- **Cost:** DEC-6 named snooze explicitly, so this narrows the authorized scope.

**Recommendation: (a).** It delivers the user-visible capability DEC-6 asked for, preserves every
constraint DEC-6 imposed (no re-grant, no second authority over task-derived reconciliation, no
dynamic SQL, narrow named operations), and touches no existing production body. (b) is the only
option that makes `snoozed` mean what it says, and it is the only one that reopens Phase 2F.

Everything else in the G5 design is settled by the investigation above and needs no further
owner input.
