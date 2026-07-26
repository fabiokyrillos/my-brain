-- Phase 2E Slice 2E.4 — the task-command mutation RPC, its two undo handlers and
-- the audit-trigger change they depend on (PRD §13.5, §11.2, §11.3).
--
-- 2E-UPDATE-001: "All Phase 2E task mutations go through one versioned
-- `SECURITY DEFINER` RPC with an explicit safe `search_path`, least-privilege
-- grants, and no widening of any existing grant."
-- 2E-UPDATE-004: "The mutation, its linked reminder effects, its audit row and
-- its undo row are written in one transaction; a partial application is
-- impossible."
-- 2E-UPDATE-010: "Because `audit_task_change` co-fires and hardcodes
-- `actor='user'` on UPDATE, the phase makes that trigger derive its actor from a
-- transaction-local setting the RPC sets, defaulting to `'user'` so
-- `persistTaskStatus` behaviour is byte-identical; the same migration extends the
-- trigger's watched columns to `title` and `description`."
--
-- This is the first RPC in this repository that mutates an existing task. Slices
-- 2E.1–2E.3 shipped the taxonomy, the candidate projection
-- (`202607250056`) and the request fingerprint (`202607250057`) and mutated
-- nothing; every acceptance criterion up to here ends with "no mutation exists in
-- this slice". The shape below is `public.confirm_entry_task_candidates_v6`
-- (`202607220044:97-1403`) — the codebase's only idempotent, undoable, audited,
-- replay-safe definer mutation — applied to a task instead of an entry.
--
-- **The name carries no `_v1`, deliberately.** ADR-037 §1 warrants a new version
-- only when a closed input shape changes incompatibly, and there is no
-- predecessor to supersede. `list_task_command_candidates` and
-- `task_command_fingerprint` set the unversioned precedent inside this same
-- phase and required no `supabase/tests/rpc_version_retirement.sql` edit; a
-- `_v1` suffix would immediately red that file's `proname ~ '_v[0-9]+$'`
-- assertion (`rpc_version_retirement.sql:186-200`) and cost six coordinated
-- literal-array edits to a test whose purpose is policing families that already
-- forked. 2E-UPDATE-001's word "versioned" is satisfied by the *contract*
-- carrying a version — the hashed `TASK_COMMAND_POLICY_VERSION` and the
-- `'taskcmd-v1:'` operation-key prefix — not by the identifier. The slice still
-- adds `apply_task_command` to that file's `prosecdef` + `search_path=""`
-- array, because that array is hardcoded and would otherwise never notice a new
-- definer RPC.
--
-- **Thirteen actions are enabled here; `cancel_task` and `restore_task` are
-- refused with `2E_ACTION_NOT_ENABLED`.** 2E-UPDATE-001 requires *one* RPC for
-- every Phase 2E task mutation, and 2E-DESTRUCTIVE-004 requires the database
-- itself to refuse a destructive action with no confirmation evidence — which
-- does not exist until Slice 2E.5 issues it. Refusing the two destructive verbs
-- inside the single RPC is what keeps them from acquiring a second write path:
-- Slice 2E.5 admits them by `create or replace` on this same function,
-- additively and forward-only. `restore_task` is refused alongside `cancel_task`
-- because PRD §23.4 ships cancellation's escape with cancellation.
--
-- **The reservation is still the first write, and the replay branch still returns
-- before any task lock** (`202607220044:1108-1158`). Getting that order wrong
-- destroys replay safety: the `undo_operations` row must exist before any domain
-- write so a concurrent duplicate collides on
-- `undo_operations_operation_key_idx` (`202607170020:90-92`) instead of
-- double-writing, and a replay must reconstruct its answer from the stored
-- `after_state` rather than re-reading a row whose state is now post-hoc. The
-- `on conflict` clause repeats `where operation_key is not null` because that
-- index is partial and a bare column list would not match it.
--
-- **`no_change` is decided before the reservation, from the claimed pre-state.**
-- 2E-UPDATE-009 requires `no_change` to write no task update, no audit row and no
-- undo row; a post-lock decision cannot satisfy that once the reservation has
-- landed. A cheap unlocked ownership probe runs first, so a non-owned or
-- nonexistent task still gets `P0002 'Task not found'` and the two stay
-- indistinguishable (2E-OWNERSHIP-002). The claim is unverified at that point,
-- but the outcome writes nothing, so it can only mis-inform — and 2E-UPDATE-009
-- makes the *preview* the authoritative place `no_change` is decided. Post-lock
-- the staleness gate has proven claimed == locked, so an empty delta there is an
-- invariant violation and raises `2E_TRANSITION_INTEGRITY`, never `no_change`.
--
-- **The staleness gate compares twelve scalar columns typed, not as text.** There
-- is no multi-column expected-pre-state comparison anywhere in this repository —
-- `202607220044:1160-1177` and `202607230047:179-192` each compare exactly one —
-- so this extends the precedent rather than copying it: lock the owner-scoped row
-- `for update`, `or`-join `locked.col is distinct from claimed_col`, raise one
-- `55P03`. The claimed instants are cast to `timestamptz` for that comparison
-- while the *same* text is hashed verbatim for the fingerprint. That split is the
-- whole accepted decision: conflating them would force this function to
-- re-render the locked row's timestamps byte-identically to whatever PostgREST
-- emitted, which is unwinnable. The `55P03` raise carries no detail and no hint,
-- because `src/features/agent/actions.ts` branches on `error.code === '55P03'`
-- alone before any details check.
--
-- Relation arrays are deliberately absent from that gate. They are not columns on
-- `public.tasks`, and comparing them would refuse a `complete_task` because an
-- unrelated concurrent `assign_project` landed; what actually matters for a
-- relation action — "does the task already hold this exact relation" — is
-- re-probed under the lock. Reminder state is absent for the reason
-- `202607250056:115-117` already recorded: the heartbeat flips `scheduled` to
-- `sent` hourly with no user act, so gating a write on it would manufacture a
-- stale refusal on a cron tick.
--
-- **The patch's `description` is bounded by what an append can produce, not by the
-- note's own 2000.** `append_note`'s canonical patch is the *concatenation*
-- `pre.description || E'\n\n' || note` (`preview.ts:429-437`), and PRD
-- 2E-COMMAND-008's "description ≤ 2000" governs the fragment the model may emit,
-- which `MAX_NOTE_LENGTH` already enforces in `schema.ts`. Bounding the RPC at
-- 2000 therefore bounded the accumulated notes of a whole task, so the first task
-- to reach 2000 characters of notes could never take another one — and the
-- preview would still offer a one-step apply the RPC then refuses. The ceiling is
-- stated at the validation site with the number and the reason.
--
-- **Reminder reconciliation lives in this function, not in a trigger.** An
-- `after update on public.tasks` trigger would fire for `persistTaskStatus`
-- (`src/features/operations/actions.ts:140-152`) and for `createRecord` too,
-- changing behaviour outside Phase 2E's contract, and PRD §21 requires the
-- pre-existing path to stay callable and unchanged. The preview discloses the
-- reminder effect from observed state (2E-PREVIEW-003) and this RPC must produce
-- exactly what the preview disclosed, which requires this RPC to own it. The
-- close half cancels **every** `scheduled` row: there is no unique constraint on
-- `reminders.task_id` (`202607160007:33-48`), multiple scheduled rows are legal,
-- and a `limit 1` would leave orphans that still fire. The insert half reproduces
-- `create_due_task_reminder`'s formula (`202607160007:195-209`) with
-- `case when a >= b then a else b end` and never `pg_catalog.greatest(` — that
-- lookup cannot resolve under `search_path = ''`, shipped three times already
-- (`202607220042`, re-introduced by `202607220044:1506`, re-fixed by
-- `202607220045`), and is grepped for below. Its condition is only that the
-- effective due date is in the future; a full hour of lead is *not* required,
-- because "move it to 5pm" typed at 4:30pm must still produce a reminder at
-- `now()`.
--
-- **`coalesce` is written unqualified, deliberately, in a file that qualifies
-- everything else.** COALESCE, NULLIF, GREATEST and LEAST are the four SQL
-- special forms the grammar turns into dedicated expression nodes; none of them
-- has a `pg_proc` entry, so `pg_catalog.coalesce(...)` parses as an ordinary
-- two-part function call and then fails to resolve with `42883` — the identical
-- defect `202607220045:5-11` describes for `greatest`/`least`, in the identical
-- grammar production. This was written the qualified way first and an adversarial
-- review caught all eleven sites: the worst of them sat in `audit_task_change`'s
-- UPDATE branch, where it would have broken every existing `public.tasks` update
-- in the product — `persistTaskStatus` included, the one path PRD §21 requires to
-- stay byte-identical. plpgsql parse-analyses an expression at first execution
-- rather than at definition, so `create or replace` and `supabase db reset` both
-- succeed and the failure surfaces only when a caller reaches the line. All 42
-- earlier migrations write `coalesce(` bare for exactly this reason, including
-- bodies that pin `set search_path = ''` (`202607250052:178`,
-- `202607250056:208-218`, `202607230051:290`); `pg_catalog` is implicitly searched
-- regardless of `search_path`, so the bare form is not a hole. The post-deploy
-- guard below greps for the whole family rather than the two members
-- `202607250052:802-803` knew about.
--
-- **Undo restores reminders by close-and-insert, not by un-cancelling.** §11.3 and
-- 2E-UPDATE-011 state the mechanism is forced, not chosen, and 2E-UPDATE-014
-- requires undo to restore linked effects by that same mechanism. Un-cancelling
-- the original ids was written and rejected: it is safe only while the heartbeat
-- keeps selecting `status = 'scheduled'` (`202607170016:494-512`), whereas
-- inserting fresh rows is safe under every ordering because only a new id gets a
-- fresh `dedupe_key`. The recorded `remind_at` is restored verbatim even when it
-- is now in the past — a past-due `scheduled` reminder firing on the next tick is
-- the state that existed, and `202607250056:611-619` counts it deliberately. The
-- cost is dead rows; that is accepted.
--
-- **The undo guard is as wide as the undo write: ten columns, not one.** The
-- compensating UPDATE sets all ten scalars from `before_state`, so an optimistic
-- guard on `status` alone lets a second command's whole effect be discarded in
-- silence. The reachable sequence is two commands and one undo: rename a `todo`
-- task with no due date (U1), `reschedule_due` it (U2, which sets `due_at` and
-- arms a reminder), then undo U1. The status never moved, so a status-only guard
-- matches, the restore also writes `due_at = null`, and the reminder U2 armed
-- stays `scheduled` on a task with no due date — with `{"undone": true}`
-- returned. Guarding one column while writing ten is exactly what 2E-UPDATE-014
-- and 2E-UNDO-004 ("undo refuses when a newer change would be silently
-- discarded") forbid. So step 23 records `applied_state` — the ten columns **as
-- the forward UPDATE left them**, from the `effective_*` values it computed and
-- `locked_task` for the rest — and the handler compares every one of them with
-- `is not distinct from`, mirroring the forward path's twelve-column staleness
-- gate in shape and in intent. Narrowing the SET list to the columns each action
-- touches was the other candidate fix and is rejected: withdrawn decision D17
-- makes the status branch write both terminal timestamps unconditionally, so a
-- narrowed restore would strand a `completed_at` the forward path cleared. An
-- operation recorded without `applied_state` fails closed with
-- `2E_UNDO_RESTORE_INTEGRITY` rather than falling back to the status-only guard;
-- nothing in this migration has ever been applied to the linked project, so no
-- such row exists anywhere except a hand-edited fixture.
--
-- **The undo's reminder post-condition is read back from the table too**, and the
-- pre-insert element-shape gate stays alongside it. They refuse different things:
-- the shape gate refuses malformed *evidence* before it can surface as a raw
-- `23502` or `22007`, and is cheap input validation; the count refuses a *state*
-- the restore did not produce, whose one reachable cause is the concurrent direct
-- client write `authenticated` can still perform because it keeps INSERT and
-- UPDATE on `public.reminders` (`202607160007:152-166`, PRD §14 permits it and
-- §16.4 records it as residual risk). Shipping only the shape gate left
-- `2E_UNDO_REMINDER_INTEGRITY` unraisable from any state the forward path can
-- produce — which is the identical objection this file uses to reject the
-- tautological count form a few lines further down, so the file contradicted
-- itself. The count is scoped to operations that actually reconciled reminders,
-- recorded as `after_state.reminders_reconciled`: unconditional, it would refuse
-- the undo of a rename on a task legitimately holding a live reminder the rename
-- never touched, because a rename records an empty `reminders_cancelled` array.
--
-- **`p_policy_version` is recorded on the operation, not only hashed into the
-- fingerprint.** 2E-PROVENANCE-001 requires every Phase 2E decision to record the
-- policy version that governed it, and a fingerprint is a one-way digest that
-- attributes nothing: given a stored operation there was no way to say which
-- policy decided it. One key on `after_state`, which the mandatory step-23 UPDATE
-- also copies into `audit_logs.after_state`, so the same value lands on both the
-- undo row and the audit row. No new column, and the alternative was considered:
-- `undo_operations` is shared by every action_type in the project, so a
-- `policy_version` column would be null on every row every other feature writes,
-- and a Phase 2E provenance key does not warrant widening a table that shared.
--
-- **Two `action_type` values, one RPC, two handlers.** The nine column actions
-- record `'apply_task_command'` and the four relation actions record
-- `'apply_task_command_relation'`, chosen from the taxonomy's `undoStrategy`.
-- That is how `private.undo_operation_handlers` (`202607250052:57-63`) routes to
-- the right compensation without a branch inside a handler, and multiple
-- action_types segregating handlers is the existing pattern — four `confirm_*`
-- action_types already share one. A single branching handler was written and
-- rejected: it hides which contract is being enforced, and 2E-UPDATE-015's
-- "removes only the row it added" is a different obligation from
-- 2E-UPDATE-014's "restores every field it changed".
--
-- **`entity_type` is `'task'` on the undo row and on both audit rows.** It is the
-- entity being mutated, `audit_task_change` already uses `'task'`, and
-- `audit_logs_user_entity_idx (user_id, entity_type, entity_id)`
-- (`202607160003:142`) makes the operation discoverable alongside the
-- trigger-written rows. The handler echoes `operation.entity_type` into its own
-- audit row, so it stays `'task'` there too.
--
-- **`before_state` is populated, unlike `confirm_entry_task_candidates_v6`.** v6
-- leaves it NULL because it is create-only and no before-state exists; this RPC
-- mutates, so undo restores from it. Both states are written by the mandatory
-- post-write UPDATE (`202607220044:1360-1371`), because at reservation time the
-- task row has not been locked yet and the reservation therefore carries
-- placeholders. That UPDATE's WHERE clause re-asserts `user_id` even though
-- `undo_id` came from this transaction: inside a definer function the WHERE
-- clause is the only tenant boundary, RLS is bypassed, and it must never be
-- dropped as redundant. Every instant inside either state is rendered with
-- `pg_catalog.to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.USOF')` rather than
-- `to_jsonb(timestamptz)`, which renders through the session `TimeZone` GUC that
-- `set search_path = ''` does not pin — the same reason `202607250057:34-39`
-- takes its instant as text.
--
-- **The transaction-local audit actor is `app.audit_actor`, read with
-- `missing_ok => true`.** No `set_config`/`current_setting` precedent exists in
-- `supabase/migrations`; `app.` is the conventional custom-GUC prefix and cannot
-- collide with the Supabase-owned `request.*`. It is written with
-- `is_local => true` so it cannot leak across a pooled PgBouncer session into an
-- unrelated later transaction, and read with `missing_ok` so the trigger does not
-- raise `42704` on every UPDATE that did *not* come through this RPC — a plain
-- client edit, a pgTAP fixture, the heartbeat. A value outside
-- `('user','agent','system')` normalizes to `'user'` rather than raising, because
-- a trigger raising `23514` on an unrelated UPDATE is worse than a mis-attributed
-- row, and the only writer is this RPC. The apply path sets `'user'` explicitly
-- rather than relying on the default, so the intent is legible and pinnable; the
-- undo handlers set `'system'`, because the trigger row describes *who performed
-- the column write* (the stored compensating operation, executed by the system)
-- while the handler's own `operation_undone` row describes *who asked for it*
-- (`actor = 'user'`). Together they are strictly more informative than either
-- alone, and that is what makes 2E-DESTRUCTIVE-007 provable at the trigger layer
-- in Slice 2E.5 without reopening the trigger.
--
-- **No `update of <columns>` list is added to `tasks_audit_changes`, and the
-- trigger itself is not recreated.** `create or replace function` alone deploys
-- the watched-column change with zero trigger churn. A column list would have to
-- enumerate all seven watched columns, and any future addition would silently
-- stop being audited. No measured performance problem exists. The INSERT branch
-- is left untouched: it already derives `case when new.created_by = 'agent' then
-- 'agent' else 'user' end`, which is truthful and answers a *different* question
-- (who authored the task, not who performed this write), and 2E-UPDATE-010
-- requires `persistTaskStatus` behaviour to stay byte-identical.
--
-- **No product event and no `ai_usage_events` change.** 2E-ANALYTICS-005 requires
-- a surface value to be added in the same migration and commit as the first
-- emitting code; there is no Phase 2E surface until Slice 2E.7, so no `surface`
-- value would be truthful and emitting `'server'` would lie about where the
-- command came from. `ai_usage_events.source_type` stays unwidened — `'task'` is
-- Phase 2F (PRD §22), and null is the truthful classification at command-parse
-- time. `202607250055` already widened `operation` to include `'task_command'`;
-- nothing more is owed here.
--
-- `reminders` grants are deliberately not narrowed. PRD §5 defers write-path
-- consolidation and §16.4 records the residual direct-write risk; PRD §14 forbids
-- *widening* and says nothing about narrowing, so narrowing is permitted but not
-- required — and doing it here could break an unrelated existing surface.
-- Recorded in `docs/TODO.md` instead.
--
-- Rollback: forward-only, like every fix in this project. To retract the mutation
-- path, `revoke execute on function public.apply_task_command(uuid, text, jsonb,
-- jsonb, text, text, text) from authenticated;` in a new migration — the
-- pre-existing `persistTaskStatus` path stays callable, so the Work surface is
-- unaffected (PRD §21). To retract the audit-trigger change, re-create
-- `public.audit_task_change()` from `202607160014:1-29` in a new migration; the
-- trigger definition is untouched here, so nothing needs re-creating alongside
-- it. The two handlers and their registry rows may stay in place unused; leaving
-- them is safer than dropping them, because an already-recorded
-- `undo_operations` row with no handler reds
-- `supabase/tests/undo_operation_routing.sql:97-108`. No data is migrated, so
-- nothing needs restoring.

-- ---------------------------------------------------------------------------
-- The shared audit trigger (2E-UPDATE-010, 2E-PROVENANCE-003)
-- ---------------------------------------------------------------------------
-- Re-pasted whole from `202607160014:1-29` with exactly three changes, because
-- migrations are append-only and `202607220045` set the precedent of re-pasting a
-- function with a single edit and leaving the earlier migration unedited:
--
--   1. the UPDATE branch's watched-column predicate gains `title` and
--      `description`, which it ignored entirely, so a rename or an appended note
--      left no historical row at all;
--   2. both jsonb objects gain `'title'` and `'description'`. Note that the
--      existing objects write `manual_priority` under the key `'priority'` — key
--      names are not required to match column names — and that adding two keys
--      changes the shape of every future `task_updated` row;
--   3. the UPDATE branch's hardcoded `'user'` becomes the transaction-local
--      derivation, defaulting to `'user'` so an UPDATE that never went through
--      `apply_task_command` records exactly what it recorded before.
--
-- The function stays `security invoker`. It must: `authenticated` retains its
-- `audit_logs` INSERT grant (`202607170016:194-196` revoked only UPDATE and
-- DELETE), and that is what keeps a plain client-side task UPDATE working. The
-- legacy body's unqualified `jsonb_build_object` is preserved verbatim rather
-- than modernized, so the diff against `202607160014` is only the three changes
-- above. The new actor expression qualifies `current_setting` and leaves
-- `coalesce` bare, for the reason the header records: the first is a real
-- `pg_proc` function, the second is a SQL special form that has no entry to
-- qualify. Getting that backwards here is the one place in this migration where
-- the mistake would have broken a pre-existing product path rather than only the
-- new one.

create or replace function public.audit_task_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (user_id, action_type, entity_type, entity_id, actor, after_state, reason, source_entry_id)
    values (
      new.user_id, 'task_created', 'task', new.id,
      case when new.created_by = 'agent' then 'agent' else 'user' end,
      jsonb_build_object('status', new.status, 'due_at', new.due_at, 'priority', new.manual_priority, 'source_entry_id', new.source_entry_id),
      'Task created', new.source_entry_id
    );
  elsif old.status is distinct from new.status or old.due_at is distinct from new.due_at
    or old.manual_priority is distinct from new.manual_priority or old.planned_at is distinct from new.planned_at
    or old.parent_task_id is distinct from new.parent_task_id
    or old.title is distinct from new.title
    or old.description is distinct from new.description then
    insert into public.audit_logs (user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id)
    values (
      new.user_id, 'task_updated', 'task', new.id,
      case
        when coalesce(pg_catalog.current_setting('app.audit_actor', true), 'user')
             in ('user', 'agent', 'system')
          then coalesce(pg_catalog.current_setting('app.audit_actor', true), 'user')
        else 'user'
      end,
      jsonb_build_object('status', old.status, 'due_at', old.due_at, 'priority', old.manual_priority, 'planned_at', old.planned_at, 'parent_task_id', old.parent_task_id, 'title', old.title, 'description', old.description),
      jsonb_build_object('status', new.status, 'due_at', new.due_at, 'priority', new.manual_priority, 'planned_at', new.planned_at, 'parent_task_id', new.parent_task_id, 'title', new.title, 'description', new.description),
      'Task state changed', new.source_entry_id
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The mutation RPC
-- ---------------------------------------------------------------------------

create or replace function public.apply_task_command(
  p_task_id uuid,
  p_action text,
  p_patch jsonb,
  p_pre_state jsonb,
  p_observed_before text,
  p_policy_version text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- One regex for every instant this function validates. `202607220044:367-399`
  -- repeats the literal at each site; a single constant cannot drift between the
  -- pre-state gate and the patch bounds, which have to agree or a value accepted
  -- by one is refused by the other.
  iso_instant_pattern constant text :=
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$';
  non_terminal_statuses constant text[] :=
    array['inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred'];

  current_user_id uuid := auth.uid();
  normalized_key text;
  internal_operation_key text;
  canonical_fingerprint text;

  -- The §11.2 taxonomy for this action, resolved once. `taxonomy.ts` is the
  -- executable form of that table in TypeScript; these five values are the part
  -- of it the write path needs, and they are set in one place so no branch below
  -- re-derives "can this action touch this task".
  action_eligible_statuses text[];
  allowed_patch_keys text[];
  required_patch_keys text[];
  allowed_status_values text[];
  action_target_status text;
  action_touches_reminders boolean := false;
  action_undo_strategy text;
  action_undo_action_type text;

  claimed_title text;
  claimed_description text;
  claimed_status text;
  claimed_due_at timestamptz;
  claimed_planned_at timestamptz;
  claimed_manual_priority text;
  claimed_completed_at timestamptz;
  claimed_cancelled_at timestamptz;
  claimed_intentional_no_due boolean;
  claimed_no_due_reason text;
  claimed_created_at timestamptz;
  claimed_updated_at timestamptz;

  patch_status text;
  patch_title text;
  patch_description text;
  patch_due_at timestamptz;
  patch_planned_at timestamptz;
  patch_manual_priority text;
  patch_intentional_no_due boolean;
  patch_no_due_reason text;
  patch_project_id uuid;
  patch_context_id uuid;
  patch_person_id uuid;
  patch_person_role text;

  has_delta boolean := false;
  locked_task public.tasks%rowtype;
  existing_operation public.undo_operations%rowtype;
  undo_id uuid;
  undo_expires_at timestamptz;
  undo_before_state jsonb;
  undo_after_state jsonb;
  -- The ten scalar columns as step 21 left them, which is what the undo handler
  -- guards its compensating UPDATE on. Built at step 23 rather than declared with
  -- a value, because every input to it is only known once the row is locked.
  undo_applied_state jsonb;

  effective_status text;
  effective_title text;
  effective_due_at timestamptz;

  reminders_cancelled_count integer := 0;
  reminders_cancelled_json jsonb := '[]'::jsonb;
  reminder_created_id uuid;

  relation_table text;
  relation_target_id uuid;
  relation_role text;
  affected integer := 0;
begin
  -- 1. Caller ------------------------------------------------------------------
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- 2. Action ------------------------------------------------------------------
  -- The closed enum first (2E-COMMAND-002), then the taxonomy. The two
  -- destructive verbs raise inside the same `case`, so `2E_ACTION_NOT_ENABLED`
  -- has exactly one site and Slice 2E.5 removes exactly one branch.
  if p_action is null or p_action not in (
    'complete_task', 'reopen_task', 'set_status', 'cancel_task', 'restore_task',
    'rename_task', 'append_note', 'reschedule_due', 'clear_due', 'set_planned',
    'set_priority', 'assign_project', 'assign_context', 'assign_person',
    'set_waiting_on'
  ) then
    raise exception 'Invalid task command action' using errcode = '22023';
  end if;

  -- `complete_task` and `reopen_task` carry `status` in their patch even though
  -- the destination is read from the taxonomy and never from the patch, and it is
  -- required rather than merely allowed. Two independent reasons, both load-bearing:
  --
  --   * The canonical patch is what `task_command_fingerprint` hashed at preview
  --     time, and `buildCanonicalPatch`
  --     (`src/features/task-commands/preview.ts:413-426`) writes
  --     `draft.status = policy.targetStatus` whenever the taxonomy declares one.
  --     Refusing the key would make the fingerprint the preview computed
  --     unreachable and both actions unappliable; accepting a patch *without* it
  --     would hash a different object and never match a stored replay.
  --   * `applied_patch` is the only record of what the caller *asked for*, as
  --     against `applied_state`, which records what the row ended up holding. An
  --     absent `status` would leave the first silent about a transition that
  --     demonstrably happened, and the two are read for different questions in
  --     Slice 2E.5's destructive-confirmation audit. (This bullet used to say the
  --     undo handler guards on `applied_patch ->> 'status'`; it does not any more.
  --     A one-column guard over a ten-column restore discarded a newer change in
  --     silence, so the guard now reads all ten columns out of `applied_state`.)
  --
  -- The key is admitted with a single allowed value — the taxonomy's own
  -- destination, resolved below — so it cannot become a second route to a
  -- transition another action guards. `set_status` is the only action whose
  -- destination is genuinely taken from the patch, and its allowed values are the
  -- six non-terminal, so `cancelled` and `completed` stay reachable only through
  -- the actions that declare them.
  case p_action
    when 'complete_task' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'completed';
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'reopen_task' then
      action_eligible_statuses := array['completed'];
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'todo';
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'set_status' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_undo_strategy := 'restore_fields';
    when 'rename_task' then
      action_eligible_statuses := array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed'
      ];
      allowed_patch_keys := array['title'];
      required_patch_keys := array['title'];
      action_undo_strategy := 'restore_fields';
    when 'append_note' then
      action_eligible_statuses := array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed'
      ];
      allowed_patch_keys := array['description'];
      required_patch_keys := array['description'];
      action_undo_strategy := 'restore_fields';
    when 'reschedule_due' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['dueAt', 'intentionalNoDue', 'noDueReason'];
      required_patch_keys := array['dueAt'];
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'clear_due' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['dueAt'];
      required_patch_keys := array['dueAt'];
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'set_planned' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['plannedAt'];
      required_patch_keys := array['plannedAt'];
      action_undo_strategy := 'restore_fields';
    when 'set_priority' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['manualPriority'];
      required_patch_keys := array['manualPriority'];
      action_undo_strategy := 'restore_fields';
    when 'assign_project' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['projectId'];
      required_patch_keys := array['projectId'];
      action_undo_strategy := 'remove_added_relation';
    when 'assign_context' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['contextId'];
      required_patch_keys := array['contextId'];
      action_undo_strategy := 'remove_added_relation';
    when 'assign_person' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['personId', 'personRole'];
      required_patch_keys := array['personId', 'personRole'];
      patch_person_role := 'involved';
      action_undo_strategy := 'remove_added_relation';
    when 'set_waiting_on' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['personId', 'personRole'];
      required_patch_keys := array['personId', 'personRole'];
      patch_person_role := 'waiting_on';
      action_undo_strategy := 'remove_added_relation';
    else
      raise exception 'Action is not enabled yet'
        using errcode = 'P0001', detail = '2E_ACTION_NOT_ENABLED';
  end case;

  if action_target_status is not null then
    allowed_status_values := array[action_target_status];
  else
    allowed_status_values := non_terminal_statuses;
  end if;

  action_undo_action_type := case
    when action_undo_strategy = 'remove_added_relation' then 'apply_task_command_relation'
    else 'apply_task_command'
  end;

  -- 3. Operation key -----------------------------------------------------------
  -- `undo_operations_operation_key_check` bounds the stored key at 8..260
  -- (`202607170020:81-82`), and the prefix is 11 characters, so the caller bound
  -- is 240 exactly as `202607220044:182-190` reserves the difference for
  -- `'confirm-v6:'`. `btrim` is correct here and only here: the POSIX form
  -- `202607230047:85-90` forward-fixed is for free text, and an operation key is
  -- not free text.
  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'taskcmd-v1:' || normalized_key;

  -- 4. Policy version ----------------------------------------------------------
  -- Validated through `btrim` but hashed raw: `buildFingerprintPayload`
  -- (`src/features/task-commands/fingerprint.ts:79-154`) sends
  -- `preview.policyVersion` verbatim, and normalizing it here would make the
  -- value this function hashes differ from the value the preview hashed.
  if p_policy_version is null
    or pg_catalog.char_length(pg_catalog.btrim(p_policy_version)) not between 1 and 64
  then
    raise exception 'Invalid task command policy version' using errcode = '22023';
  end if;

  -- 5. Observed-before ---------------------------------------------------------
  -- Regex first, then a guarded cast, following `202607220044:367-399`. The cast
  -- is *validation only* — the text is what reaches the fingerprint, verbatim.
  -- Casting it back to `timestamptz` for hashing would make two callers in two
  -- zones derive two identities for one request and every replay look new, which
  -- is precisely the latent bug `202607250057:34-39` declines to copy.
  if p_observed_before is null or p_observed_before !~ iso_instant_pattern then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end if;
  begin
    perform p_observed_before::timestamptz;
  exception when others then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end;

  -- 6. Pre-state ---------------------------------------------------------------
  -- Closed-object validation in the `202607220044:206-220` shape: an object, an
  -- exact key count, and an EXISTS for any key outside the allow-list. Unknown
  -- keys are rejected, never ignored — the nineteen keys are `TaskPreState`
  -- (`src/features/task-commands/matching.ts:61-81`), which is what the preview
  -- observed and what the fingerprint hashed.
  if p_pre_state is null or pg_catalog.jsonb_typeof(p_pre_state) <> 'object' then
    raise exception 'Task command pre-state must be an object' using errcode = '22023';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_pre_state)) <> 19
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_pre_state) as pre_state_key(key_name)
      where not (pre_state_key.key_name = any(array[
        'title', 'description', 'status', 'dueAt', 'plannedAt', 'manualPriority',
        'completedAt', 'cancelledAt', 'intentionalNoDue', 'noDueReason',
        'createdAt', 'updatedAt', 'projectIds', 'projectNames', 'contextIds',
        'contextNames', 'personIds', 'personNames', 'personRoles'
      ]))
    )
  then
    raise exception 'Task command pre-state must carry exactly the observed fields'
      using errcode = '22023';
  end if;

  -- Every cast is guarded, so a malformed claim is a validation failure rather
  -- than a `22P02` escaping to a client whose mapper has no case for it.
  begin
    claimed_title := p_pre_state ->> 'title';
    claimed_description := p_pre_state ->> 'description';
    claimed_status := p_pre_state ->> 'status';
    claimed_due_at := (p_pre_state ->> 'dueAt')::timestamptz;
    claimed_planned_at := (p_pre_state ->> 'plannedAt')::timestamptz;
    claimed_manual_priority := p_pre_state ->> 'manualPriority';
    claimed_completed_at := (p_pre_state ->> 'completedAt')::timestamptz;
    claimed_cancelled_at := (p_pre_state ->> 'cancelledAt')::timestamptz;
    claimed_intentional_no_due := (p_pre_state ->> 'intentionalNoDue')::boolean;
    claimed_no_due_reason := p_pre_state ->> 'noDueReason';
    claimed_created_at := (p_pre_state ->> 'createdAt')::timestamptz;
    claimed_updated_at := (p_pre_state ->> 'updatedAt')::timestamptz;
  exception when others then
    raise exception 'Task command pre-state carries a value of the wrong type'
      using errcode = '22023';
  end;

  if claimed_title is null
    or claimed_status is null
    or claimed_intentional_no_due is null
    or claimed_created_at is null
    or claimed_updated_at is null
  then
    raise exception 'Task command pre-state is missing a required value'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_pre_state -> 'projectIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'contextIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'personIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'personRoles') <> 'array'
    or pg_catalog.jsonb_array_length(p_pre_state -> 'personIds')
       <> pg_catalog.jsonb_array_length(p_pre_state -> 'personRoles')
  then
    raise exception 'Task command pre-state relation arrays are malformed'
      using errcode = '22023';
  end if;

  -- 7. Patch key set -----------------------------------------------------------
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Task command patch must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_patch) as patch_key(key_name)
    where not (patch_key.key_name = any(allowed_patch_keys))
  ) then
    raise exception 'Task command patch carries a field this action does not allow'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(required_patch_keys) as required_key(key_name)
    where not (p_patch ? required_key.key_name)
  ) then
    raise exception 'Task command patch is missing a required field'
      using errcode = '22023';
  end if;

  -- 8. Patch values, against the ACTION's own allowed targets -------------------
  -- 2E-COMMAND-008 validates against the action's declared set, not the
  -- table-wide domain. The table CHECKs are the floor, not the contract.
  if p_patch ? 'status' then
    patch_status := p_patch ->> 'status';
    if pg_catalog.jsonb_typeof(p_patch -> 'status') <> 'string'
      or not (patch_status = any(allowed_status_values))
    then
      raise exception 'Invalid task command status' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'title' then
    patch_title := p_patch ->> 'title';
    if pg_catalog.jsonb_typeof(p_patch -> 'title') <> 'string'
      or pg_catalog.char_length(patch_title) not between 1 and 240
    then
      raise exception 'Invalid task command title' using errcode = '22023';
    end if;
  end if;

  -- `append_note` writes this verbatim. The concatenation is computed by
  -- `buildTaskCommandPreview`, which is what the user saw and what the
  -- fingerprint hashed, so re-deriving it here would be a second copy of a
  -- domain rule that could disagree with the preview.
  --
  -- **100000, not the note's 2000.** This value is not a note — it is
  -- `pre.description || E'\n\n' || note`, built by `buildCanonicalPatch`
  -- (`src/features/task-commands/preview.ts:429-437`). 2E-COMMAND-008's
  -- "description ≤ 2000" governs the fragment the model may emit, and
  -- `MAX_NOTE_LENGTH` (`src/features/task-commands/schema.ts:34`) already refuses a
  -- longer one at the parse boundary. Bounding the *result* at 2000 was written and
  -- is the defect this replaces: it made a task whose notes already totalled 2000
  -- characters unable to take another legal note ever again, and it did so after
  -- the preview had already offered a one-step apply — the RPC then refused a
  -- payload the user was told would land. The alternative fix, refusing the append
  -- in the preview with a new declared refusal, was rejected: silently making a
  -- legal note unappliable on a long task is a worse product outcome than an
  -- unbounded description.
  --
  -- And it is genuinely unbounded: `tasks.description` is bare `text` with no CHECK
  -- (`202607160003:110`), unlike `title`, so this is the only ceiling that exists on
  -- the column and repeated appends accumulate without one. 100000 is kept finite
  -- only so a definer function cannot be turned into a way to write megabyte rows —
  -- it is about fifty maximum-length notes, past any plausible note history, and the
  -- request already carries this text twice, here and inside `p_pre_state`.
  if p_patch ? 'description' then
    patch_description := p_patch ->> 'description';
    if pg_catalog.jsonb_typeof(p_patch -> 'description') <> 'string'
      or pg_catalog.char_length(patch_description) > 100000
    then
      raise exception 'Invalid task command description' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'dueAt' then
    if p_action = 'clear_due' then
      if pg_catalog.jsonb_typeof(p_patch -> 'dueAt') <> 'null' then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end if;
    else
      if pg_catalog.jsonb_typeof(p_patch -> 'dueAt') <> 'string'
        or (p_patch ->> 'dueAt') !~ iso_instant_pattern
      then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end if;
      begin
        patch_due_at := (p_patch ->> 'dueAt')::timestamptz;
      exception when others then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end;
    end if;
  end if;

  if p_patch ? 'plannedAt' then
    if pg_catalog.jsonb_typeof(p_patch -> 'plannedAt') <> 'string'
      or (p_patch ->> 'plannedAt') !~ iso_instant_pattern
    then
      raise exception 'Invalid task command planned date' using errcode = '22023';
    end if;
    begin
      patch_planned_at := (p_patch ->> 'plannedAt')::timestamptz;
    exception when others then
      raise exception 'Invalid task command planned date' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'manualPriority' then
    patch_manual_priority := p_patch ->> 'manualPriority';
    if pg_catalog.jsonb_typeof(p_patch -> 'manualPriority') <> 'string'
      or not (patch_manual_priority = any(array['low', 'medium', 'high', 'urgent']))
    then
      raise exception 'Invalid task command priority' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'intentionalNoDue' then
    if pg_catalog.jsonb_typeof(p_patch -> 'intentionalNoDue') <> 'boolean' then
      raise exception 'Invalid task command no-due flag' using errcode = '22023';
    end if;
    patch_intentional_no_due := (p_patch ->> 'intentionalNoDue')::boolean;
  end if;

  if p_patch ? 'noDueReason' then
    if pg_catalog.jsonb_typeof(p_patch -> 'noDueReason') not in ('null', 'string') then
      raise exception 'Invalid task command no-due reason' using errcode = '22023';
    end if;
    patch_no_due_reason := p_patch ->> 'noDueReason';
  end if;

  -- 2E-UPDATE-012, first half: the canonical patch must be internally consistent
  -- before it ever reaches `tasks_no_due_consistency_check`
  -- (`202607210036:36-41`), so the user gets a declared reason code rather than a
  -- raw `23514` they cannot act on.
  if (patch_due_at is not null and coalesce(patch_intentional_no_due, false))
    or (patch_no_due_reason is not null and not coalesce(patch_intentional_no_due, false))
  then
    raise exception 'Due date conflicts with the intentional no-due flag'
      using errcode = '22023', detail = '2E_DUE_CONSISTENCY';
  end if;

  if p_patch ? 'projectId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'projectId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_project_id := (p_patch ->> 'projectId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'contextId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'contextId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_context_id := (p_patch ->> 'contextId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'personId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'personId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_person_id := (p_patch ->> 'personId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  -- The role is not the caller's to choose: `assign_person` and `set_waiting_on`
  -- are otherwise byte-identical policies, and the role is the only thing that
  -- distinguishes them. It was set from the taxonomy above; the patch may only
  -- restate it.
  if p_patch ? 'personRole' then
    if (p_patch ->> 'personRole') is distinct from patch_person_role then
      raise exception 'Invalid task command person role' using errcode = '22023';
    end if;
  end if;

  -- 9. Unlocked ownership probe -------------------------------------------------
  -- Before the reservation and before any lock, so `no_change` and a
  -- cross-owner payload both resolve without burning an operation key.
  -- 2E-OWNERSHIP-002: a command naming another owner's task is indistinguishable
  -- from one naming a nonexistent task, so both land on this single message.
  if not exists (
    select 1
    from public.tasks as owned_task
    where owned_task.id = p_task_id
      and owned_task.user_id = current_user_id
  ) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  -- 10. Relation-reference ownership -------------------------------------------
  -- `202607220044:919-1001` proves ownership of every referenced entity with an
  -- EXISTS probe rather than trusting the caller or relying on the composite FK's
  -- error, and it does so *before* the reservation: a payload naming another
  -- owner's project must not burn an operation key. The composite owner FKs
  -- (`task_projects_project_owner_fk` and siblings, `202607170016:90-101`) remain
  -- the structural backstop that satisfies 2E-UPDATE-016 by construction.
  if patch_project_id is not null and not exists (
    select 1
    from public.projects as owned_project
    where owned_project.id = patch_project_id
      and owned_project.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;
  if patch_context_id is not null and not exists (
    select 1
    from public.contexts as owned_context
    where owned_context.id = patch_context_id
      and owned_context.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;
  if patch_person_id is not null and not exists (
    select 1
    from public.people as owned_person
    where owned_person.id = patch_person_id
      and owned_person.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;

  -- 11. Canonical delta against the CLAIMED pre-state --------------------------
  -- 2E-UPDATE-009 requires `no_change` to write nothing at all, and the
  -- reservation is the first write, so this decision has to happen here — before
  -- it, and before any lock. The claim is unverified at this point; the outcome
  -- writes nothing, so the worst case is a mis-informed answer to a caller whose
  -- own preview already decided `no_change` authoritatively.
  effective_status := coalesce(action_target_status, patch_status, claimed_status);
  effective_due_at := case when p_patch ? 'dueAt' then patch_due_at else claimed_due_at end;

  case
    when p_action in ('complete_task', 'reopen_task', 'set_status') then
      has_delta := claimed_status is distinct from effective_status;
    when p_action = 'rename_task' then
      has_delta := claimed_title is distinct from patch_title;
    when p_action = 'append_note' then
      has_delta := claimed_description is distinct from patch_description;
    when p_action in ('reschedule_due', 'clear_due') then
      has_delta := claimed_due_at is distinct from effective_due_at
        or (p_patch ? 'intentionalNoDue'
            and claimed_intentional_no_due is distinct from patch_intentional_no_due)
        or (p_patch ? 'noDueReason'
            and claimed_no_due_reason is distinct from patch_no_due_reason);
    when p_action = 'set_planned' then
      has_delta := claimed_planned_at is distinct from patch_planned_at;
    when p_action = 'set_priority' then
      has_delta := claimed_manual_priority is distinct from patch_manual_priority;
    when p_action = 'assign_project' then
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'projectIds') as held(project_id)
        where held.project_id = patch_project_id::text
      ) into has_delta;
    when p_action = 'assign_context' then
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'contextIds') as held(context_id)
        where held.context_id = patch_context_id::text
      ) into has_delta;
    else
      -- `assign_person` and `set_waiting_on`. The pre-state carries `personIds`
      -- and `personRoles` as parallel arrays, so "already held" is a positional
      -- join, not a membership test: the same person may be linked twice under
      -- two different roles.
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'personIds')
          with ordinality as held(person_id, held_position)
        join pg_catalog.jsonb_array_elements_text(p_pre_state -> 'personRoles')
          with ordinality as held_role(person_role, role_position)
          on held_role.role_position = held.held_position
        where held.person_id = patch_person_id::text
          and held_role.person_role = patch_person_role
      ) into has_delta;
  end case;

  if not has_delta then
    return pg_catalog.jsonb_build_object(
      'outcome', 'no_change',
      'task_id', p_task_id,
      'action', p_action,
      'undo_id', null,
      'idempotent', false,
      'request_fingerprint', null,
      'reminders_cancelled', 0,
      'reminder_created_id', null,
      'undo_expires_at', null
    );
  end if;

  -- 12. Fingerprint ------------------------------------------------------------
  -- Never hand-rolled here: `public.task_command_fingerprint`
  -- (`202607250057:59-94`) is the one canonicalizer, and TypeScript never hashes.
  -- The seven arguments must be exactly what `buildFingerprintPayload` sent, or
  -- replay detection breaks. Two of them are traps: `p_owner_id` is *not* a
  -- caller argument and comes from `auth.uid()`, and the last argument is the
  -- BTRIMMED caller key — not `internal_operation_key`. TypeScript hashes its own
  -- `operationKey`, so this function must hash the same value it received, and
  -- the `'taskcmd-v1:'` prefix exists only to namespace the stored row.
  canonical_fingerprint := public.task_command_fingerprint(
    current_user_id,
    p_task_id,
    p_observed_before,
    p_pre_state,
    p_patch,
    p_policy_version,
    normalized_key
  );

  -- 13. Reservation — the FIRST write ------------------------------------------
  -- `after_state` is a placeholder in its final shape, patched by the mandatory
  -- UPDATE at step 23 once the task has been locked and the write has happened.
  -- `before_state`, `expires_at`, `status` and the `source_*` columns are left to
  -- the table defaults, exactly as `202607220044:1108-1138` leaves them.
  insert into public.undo_operations (
    user_id,
    action_type,
    entity_type,
    entity_ids,
    after_state,
    operation_key,
    request_fingerprint
  ) values (
    current_user_id,
    action_undo_action_type,
    'task',
    array[p_task_id],
    pg_catalog.jsonb_build_object(
      'task_id', p_task_id,
      'action', p_action,
      'undo_strategy', action_undo_strategy,
      'policy_version', p_policy_version,
      'request_fingerprint', canonical_fingerprint,
      'applied_patch', p_patch,
      'reminders_cancelled_count', 0,
      'reminders_reconciled', action_touches_reminders,
      'reminder_created_id', null,
      -- The one key that cannot carry even a placeholder value: it describes the
      -- ten columns after step 21, and the row is not locked yet. Recorded null so
      -- the reservation keeps the same key set as the patched row, and so a row
      -- that somehow reached a handler unpatched fails that handler's closed
      -- evidence gate instead of being restored against a state nobody observed.
      'applied_state', null,
      'relation', null
    ),
    internal_operation_key,
    canonical_fingerprint
  )
  on conflict (user_id, operation_key) where operation_key is not null
  do nothing
  returning id, expires_at into undo_id, undo_expires_at;

  -- 14. Replay -----------------------------------------------------------------
  -- Reconstructed entirely from the stored `after_state`: re-reading the task
  -- would return post-hoc state and make the replay untruthful, which is why
  -- every field the success return needs was persisted up front. Returns before
  -- any task lock, so a replay neither serializes against a concurrent command
  -- nor re-evaluates the staleness gate. Vanished-row and fingerprint-mismatch
  -- collapse into one error on purpose (`202607220044:1140-1158`): the caller
  -- learns that this key does not describe this payload, and nothing more.
  if undo_id is null then
    select operation_row.*
    into existing_operation
    from public.undo_operations as operation_row
    where operation_row.user_id = current_user_id
      and operation_row.operation_key = internal_operation_key
    for update;
    if existing_operation.id is null
      or existing_operation.request_fingerprint is distinct from canonical_fingerprint
    then
      raise exception 'Operation key payload mismatch'
        using errcode = 'P0001', detail = '2E_IDEMPOTENCY_MISMATCH';
    end if;
    return pg_catalog.jsonb_build_object(
      'outcome', 'applied',
      'task_id', existing_operation.after_state -> 'task_id',
      'action', existing_operation.after_state -> 'action',
      'undo_id', existing_operation.id,
      'idempotent', true,
      'request_fingerprint', existing_operation.after_state -> 'request_fingerprint',
      'reminders_cancelled', existing_operation.after_state -> 'reminders_cancelled_count',
      'reminder_created_id', existing_operation.after_state -> 'reminder_created_id',
      'undo_expires_at', pg_catalog.to_char(
        existing_operation.expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.USOF'
      )
    );
  end if;

  -- 15. Audit actor ------------------------------------------------------------
  -- Set before the task write so `audit_task_change` reads it when it co-fires.
  -- `'user'` is truthful for every apply: PRD §23.7 records that "one-step apply"
  -- is the least-friction outcome, not an unattended write. Set explicitly
  -- rather than relying on the trigger's default, so this function's intent is
  -- legible and a test can pin it. `is_local => true` keeps it from leaking
  -- across a pooled connection into an unrelated later transaction.
  perform pg_catalog.set_config('app.audit_actor', 'user', true);

  -- 16. Lock -------------------------------------------------------------------
  select task_row.*
  into locked_task
  from public.tasks as task_row
  where task_row.id = p_task_id
    and task_row.user_id = current_user_id
  for update;
  if locked_task.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  -- 17. Typed staleness gate (2E-UPDATE-003) -----------------------------------
  if locked_task.title is distinct from claimed_title
    or locked_task.description is distinct from claimed_description
    or locked_task.status is distinct from claimed_status
    or locked_task.due_at is distinct from claimed_due_at
    or locked_task.planned_at is distinct from claimed_planned_at
    or locked_task.manual_priority is distinct from claimed_manual_priority
    or locked_task.completed_at is distinct from claimed_completed_at
    or locked_task.cancelled_at is distinct from claimed_cancelled_at
    or locked_task.intentional_no_due is distinct from claimed_intentional_no_due
    or locked_task.no_due_reason is distinct from claimed_no_due_reason
    or locked_task.created_at is distinct from claimed_created_at
    or locked_task.updated_at is distinct from claimed_updated_at
  then
    raise exception 'Task changed since the preview' using errcode = '55P03';
  end if;

  -- 18. Eligibility against the LOCKED status ----------------------------------
  if not (locked_task.status = any(action_eligible_statuses)) then
    raise exception 'Action is not allowed from the current status'
      using errcode = 'P0001', detail = '2E_INELIGIBLE_STATUS';
  end if;

  -- 19. Delta against the locked row -------------------------------------------
  -- Defence in depth for the scalar actions: step 17 has proven claimed ==
  -- locked, so this cannot differ. It is *not* redundant for the four relation
  -- actions, whose state is not on `public.tasks` and is therefore absent from
  -- the gate by design; for them this is the authoritative locked re-check, and a
  -- relation that appeared since the observation is a conflict rather than a
  -- silent success.
  effective_status := coalesce(action_target_status, patch_status, locked_task.status);
  effective_title := coalesce(patch_title, locked_task.title);
  effective_due_at := case when p_patch ? 'dueAt' then patch_due_at else locked_task.due_at end;

  case
    when p_action in ('complete_task', 'reopen_task', 'set_status') then
      has_delta := locked_task.status is distinct from effective_status;
    when p_action = 'rename_task' then
      has_delta := locked_task.title is distinct from patch_title;
    when p_action = 'append_note' then
      has_delta := locked_task.description is distinct from patch_description;
    when p_action in ('reschedule_due', 'clear_due') then
      has_delta := locked_task.due_at is distinct from effective_due_at
        or (p_patch ? 'intentionalNoDue'
            and locked_task.intentional_no_due is distinct from patch_intentional_no_due)
        or (p_patch ? 'noDueReason'
            and locked_task.no_due_reason is distinct from patch_no_due_reason);
    when p_action = 'set_planned' then
      has_delta := locked_task.planned_at is distinct from patch_planned_at;
    when p_action = 'set_priority' then
      has_delta := locked_task.manual_priority is distinct from patch_manual_priority;
    when p_action = 'assign_project' then
      select not exists (
        select 1
        from public.task_projects as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.project_id = patch_project_id
      ) into has_delta;
    when p_action = 'assign_context' then
      select not exists (
        select 1
        from public.task_contexts as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.context_id = patch_context_id
      ) into has_delta;
    else
      -- `assign_person` and `set_waiting_on`, the only two branches step 2's
      -- exhaustive taxonomy `case` can still leave here.
      select not exists (
        select 1
        from public.task_people as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.person_id = patch_person_id
          and held.role = patch_person_role
      ) into has_delta;
  end case;

  if not has_delta then
    raise exception 'Task command transition failed'
      using errcode = 'P0001', detail = '2E_TRANSITION_INTEGRITY';
  end if;

  -- 20. Due consistency against the LOCKED row (2E-UPDATE-012) -----------------
  -- The patch was already proven internally consistent at step 8. What is left
  -- is the row's own flag: a due date landing on an intentionally-undated task
  -- requires the canonical patch to clear both flags atomically, and if it does
  -- not, the caller gets a declared code instead of `tasks_no_due_consistency_check`
  -- surfacing as a raw `23514`.
  if effective_due_at is not null
    and locked_task.intentional_no_due
    and not (
      p_patch ? 'intentionalNoDue'
      and patch_intentional_no_due = false
      and p_patch ? 'noDueReason'
      and pg_catalog.jsonb_typeof(p_patch -> 'noDueReason') = 'null'
    )
  then
    raise exception 'Due date conflicts with the intentional no-due flag'
      using errcode = '22023', detail = '2E_DUE_CONSISTENCY';
  end if;

  -- 21. The domain write --------------------------------------------------------
  -- Every column UPDATE is guarded on the status the evidence recorded, and the
  -- affected count is escalated rather than ignored — the `202607230047:209-221`
  -- optimistic-guard shape. `completed_at` and `cancelled_at` are written on
  -- every status transition, set when and only when entering that status and
  -- cleared when leaving it, mirroring `persistTaskStatus`
  -- (`src/features/operations/actions.ts:148-152`) so the two paths cannot
  -- disagree. One statement serves `complete_task`, `reopen_task` and
  -- `set_status`, which is also how Slice 2E.5 admits `cancel_task` and
  -- `restore_task` without adding a write path.
  if p_action in ('complete_task', 'reopen_task', 'set_status') then
    update public.tasks
    set
      status = effective_status,
      completed_at = case when effective_status = 'completed' then pg_catalog.now() else null end,
      cancelled_at = case when effective_status = 'cancelled' then pg_catalog.now() else null end
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'rename_task' then
    update public.tasks
    set title = patch_title
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'append_note' then
    update public.tasks
    set description = patch_description
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action in ('reschedule_due', 'clear_due') then
    update public.tasks
    set
      due_at = effective_due_at,
      intentional_no_due = case
        when p_patch ? 'intentionalNoDue' then patch_intentional_no_due
        else locked_task.intentional_no_due
      end,
      no_due_reason = case
        when p_patch ? 'noDueReason' then patch_no_due_reason
        else locked_task.no_due_reason
      end
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'set_planned' then
    update public.tasks
    set planned_at = patch_planned_at
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'set_priority' then
    update public.tasks
    set manual_priority = patch_manual_priority
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  else
    -- The relation actions. `user_id` is written on the row and the composite
    -- owner FKs make a cross-owner relation unrepresentable, so 2E-UPDATE-016
    -- holds by construction rather than by this predicate. The
    -- `on conflict do nothing` is the second idempotency layer
    -- (`202607220044:1249-1257`) and its silent miss is escalated: the
    -- already-linked case is `no_change`, decided at step 11 and re-proven at
    -- step 19, so reaching a conflict here means a row appeared between them.
    if p_action = 'assign_project' then
      relation_table := 'task_projects';
      relation_role := null;
      insert into public.task_projects (task_id, project_id, user_id)
      values (p_task_id, patch_project_id, current_user_id)
      on conflict (task_id, project_id) do nothing
      returning project_id into relation_target_id;
    elsif p_action = 'assign_context' then
      relation_table := 'task_contexts';
      relation_role := null;
      insert into public.task_contexts (task_id, context_id, user_id)
      values (p_task_id, patch_context_id, current_user_id)
      on conflict (task_id, context_id) do nothing
      returning context_id into relation_target_id;
    else
      relation_table := 'task_people';
      relation_role := patch_person_role;
      insert into public.task_people (task_id, person_id, user_id, role)
      values (p_task_id, patch_person_id, current_user_id, patch_person_role)
      on conflict (task_id, person_id, role) do nothing
      returning person_id into relation_target_id;
    end if;
    affected := case when relation_target_id is null then 0 else 1 end;
  end if;

  if affected <> 1 then
    raise exception 'Task command transition failed'
      using errcode = 'P0001', detail = '2E_TRANSITION_INTEGRITY';
  end if;

  -- 22. Reminder reconciliation (§11.3, 2E-UPDATE-011) --------------------------
  if action_touches_reminders then
    -- Close EVERY scheduled row, not one. `reminders` has no unique constraint on
    -- `task_id`, so several scheduled rows are legal, and Slice 2E.3 verified
    -- that a task written before Phase 2E may already hold a live one — which is
    -- why the close half runs first for `reopen_task` too, or reopening could
    -- leave two live reminders. `remind_at` is recorded as an explicitly
    -- formatted string rather than `to_jsonb(timestamptz)`, which renders through
    -- the session `TimeZone` GUC that `set search_path = ''` does not pin.
    with closed as (
      update public.reminders
      set status = 'cancelled'
      where task_id = p_task_id
        and user_id = current_user_id
        and status = 'scheduled'
      returning id, title, remind_at, important
    )
    select
      pg_catalog.count(*)::integer,
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', closed.id,
            'title', closed.title,
            'remind_at', pg_catalog.to_char(closed.remind_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
            'important', closed.important
          )
          order by closed.id
        ),
        '[]'::jsonb
      )
    into reminders_cancelled_count, reminders_cancelled_json
    from closed;

    -- Insert exactly one fresh row when a future due date survives the patch.
    -- The condition is only that the due date is in the future: a full hour of
    -- lead is deliberately NOT required, because "move it to 5pm" typed at
    -- 4:30pm must still produce a reminder, at `now()`. The title is the
    -- *effective* one, so a rename cannot leave the reminder text contradicting
    -- the task; `reminders.title` allows 1..500 against `tasks.title`'s 240, so
    -- copying is always safe. `case when a >= b then a else b end` reproduces
    -- `create_due_task_reminder`'s `greatest(...)` — that special form cannot be
    -- resolved as a `pg_catalog` function under an empty search_path.
    if effective_due_at is not null
      and effective_due_at > pg_catalog.now()
      and effective_status not in ('completed', 'cancelled')
    then
      insert into public.reminders (user_id, task_id, title, remind_at)
      values (
        current_user_id,
        p_task_id,
        effective_title,
        case
          when pg_catalog.now() >= effective_due_at - interval '1 hour'
            then pg_catalog.now()
          else effective_due_at - interval '1 hour'
        end
      )
      returning id into reminder_created_id;
    end if;

    -- One postcondition read back from the table, rather than two comparisons of
    -- a value against itself. Both earlier forms were written and rejected as
    -- structurally unprovokable, which for a declared member of a closed error
    -- vocabulary is the same defect as a missing raise: `jsonb_agg` emits exactly
    -- one element per input row, so `jsonb_array_length(...) <> count(*)` over
    -- that single `closed` CTE could never differ, and `returning id into` on a
    -- plain INSERT against a `gen_random_uuid()` primary key
    -- (`202607160007:33-48`) could never yield NULL.
    --
    -- This has independent provenance on each side: after reconciliation the task
    -- must hold exactly the one reminder this command created, or none when it
    -- created none. The reachable cause is a direct client write —
    -- `authenticated` still holds INSERT and UPDATE on `public.reminders`
    -- (`202607160007:152-166`), which PRD §14 permits and §16.4 records as
    -- residual risk — committing between the close and here, which would leave
    -- the task holding a live reminder this command never disclosed closing.
    -- `rejected_conflict`, retryable, is the truthful answer to that: a retry
    -- closes the newcomer too.
    -- The `case` is parenthesized because plpgsql reads an `if` condition by
    -- scanning for the first `then` at paren-depth zero
    -- (`read_sql_expression(K_THEN)`), so a bare `case … when … then … end` in
    -- this position ends the condition at the `case`'s own `then`. The rest of
    -- the expression is then parsed as statements and the function fails to
    -- create with `42601 syntax error at end of input` — which is exactly how
    -- this line first reached CI. The parentheses put the inner `then` at
    -- depth one, where the scanner ignores it.
    if (
      select pg_catalog.count(*)::integer
      from public.reminders as live_reminder
      where live_reminder.task_id = p_task_id
        and live_reminder.user_id = current_user_id
        and live_reminder.status = 'scheduled'
    ) <> (case when reminder_created_id is null then 0 else 1 end) then
      raise exception 'Task command reminder reconciliation failed'
        using errcode = 'P0001', detail = '2E_REMINDER_INTEGRITY';
    end if;
  end if;

  -- 23. Patch the reservation — mandatory ---------------------------------------
  -- The reservation carried placeholders because the task had not been locked
  -- yet. Forget this UPDATE and undo restores nothing while the recorded
  -- `after_state` claims otherwise. Whatever is recorded here becomes a hard
  -- contract the handlers enforce (`202607220045:85-96` is the precedent), so
  -- under-recording makes undo unconditionally fail. The WHERE clause re-asserts
  -- `user_id`: inside a definer function it is the only tenant boundary.
  undo_before_state := pg_catalog.jsonb_build_object(
    'task_id', p_task_id,
    'action', p_action,
    'status', locked_task.status,
    'title', locked_task.title,
    'description', locked_task.description,
    'due_at', pg_catalog.to_char(locked_task.due_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'planned_at', pg_catalog.to_char(locked_task.planned_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'manual_priority', locked_task.manual_priority,
    'completed_at', pg_catalog.to_char(locked_task.completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'cancelled_at', pg_catalog.to_char(locked_task.cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'intentional_no_due', locked_task.intentional_no_due,
    'no_due_reason', locked_task.no_due_reason,
    'reminders_cancelled', reminders_cancelled_json
  );

  -- The post-forward scalar state, which is the evidence the undo guard needs and
  -- the one thing `before_state` cannot supply. Every value here is what step 21
  -- actually wrote, re-derived from the same inputs rather than read back with a
  -- second SELECT: a re-read would also pick up a concurrent committed write and
  -- record it as this command's own effect, which is the opposite of what the guard
  -- is for. Each branch mirrors the matching branch of step 21 term for term, so
  -- adding an action there means adding it here — `completed_at` is the trap: a
  -- `rename_task` on a completed task leaves `effective_status = 'completed'` while
  -- the timestamp is untouched, so the guard is the action, not the status.
  --
  -- `pg_catalog.now()` is `transaction_timestamp()`, fixed for the whole
  -- transaction, so re-evaluating it here yields the identical instant step 21
  -- stored. Instants are formatted exactly as `before_state` formats them and never
  -- with `to_jsonb(timestamptz)`, which renders through the session `TimeZone` GUC
  -- that `set search_path = ''` does not pin; `timestamptz` is microsecond-resolution
  -- and `US` renders all six digits, so the text round-trips back to the stored value
  -- bit for bit and the handler can compare it against a typed column.
  --
  -- Recorded for the relation actions too, where every key falls through to
  -- `locked_task` because their patch touches no column of `public.tasks`. That is
  -- truthful — the relation handler restores no scalar and never reads this — and it
  -- keeps step 23 free of a branch that would have to be kept in step with step 21.
  undo_applied_state := pg_catalog.jsonb_build_object(
    'status', effective_status,
    'title', effective_title,
    'description', case
      when p_action = 'append_note' then patch_description
      else locked_task.description
    end,
    'due_at', pg_catalog.to_char(effective_due_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'planned_at', pg_catalog.to_char(
      case when p_action = 'set_planned' then patch_planned_at else locked_task.planned_at end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    'manual_priority', case
      when p_action = 'set_priority' then patch_manual_priority
      else locked_task.manual_priority
    end,
    'completed_at', pg_catalog.to_char(
      case
        when p_action not in ('complete_task', 'reopen_task', 'set_status')
          then locked_task.completed_at
        when effective_status = 'completed' then pg_catalog.now()
        else null::timestamptz
      end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    'cancelled_at', pg_catalog.to_char(
      case
        when p_action not in ('complete_task', 'reopen_task', 'set_status')
          then locked_task.cancelled_at
        when effective_status = 'cancelled' then pg_catalog.now()
        else null::timestamptz
      end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    -- These two repeat step 21's own expressions verbatim, keyed on the patch and
    -- not on the action, because that is how step 21 writes them and only
    -- `reschedule_due` may carry either key.
    'intentional_no_due', case
      when p_patch ? 'intentionalNoDue' then patch_intentional_no_due
      else locked_task.intentional_no_due
    end,
    'no_due_reason', case
      when p_patch ? 'noDueReason' then patch_no_due_reason
      else locked_task.no_due_reason
    end
  );

  undo_after_state := pg_catalog.jsonb_build_object(
    'task_id', p_task_id,
    'action', p_action,
    'undo_strategy', action_undo_strategy,
    -- 2E-PROVENANCE-001: the policy version that governed this decision, durably
    -- recorded rather than only hashed into the fingerprint. It reaches
    -- `audit_logs.after_state` through the same object at step 24.
    'policy_version', p_policy_version,
    'request_fingerprint', canonical_fingerprint,
    'applied_patch', p_patch,
    'reminders_cancelled_count', reminders_cancelled_count,
    -- Whether step 22 ran at all, which is what scopes the undo's reminder
    -- post-condition. Derived from the taxonomy here so the handler does not have to
    -- carry a second copy of "which actions touch reminders".
    'reminders_reconciled', action_touches_reminders,
    'reminder_created_id', reminder_created_id,
    'applied_state', undo_applied_state,
    'relation', case
      when relation_table is null then null::jsonb
      else pg_catalog.jsonb_build_object(
        'table', relation_table,
        'id', relation_target_id,
        'role', relation_role
      )
    end
  );

  update public.undo_operations
  set
    before_state = undo_before_state,
    after_state = undo_after_state
  where id = undo_id and user_id = current_user_id;

  -- 24. audit_logs — the last write ---------------------------------------------
  -- `audit_task_change` co-fires on step 21's UPDATE and writes its own
  -- `task_updated` row with the actor set at step 15, so an applied column
  -- command leaves two rows: this one, which names the operation and carries the
  -- whole before/after payload, and the trigger's, which is what every other
  -- writer of `public.tasks` already produces. That is exactly the pair
  -- `confirm_entry_task_candidates_v6` produces with its trigger `task_created`
  -- row. `reason` is NOT NULL and `source_entry_id` is genuinely absent: a
  -- Phase 2E command has no originating entry (2E-UNDO-005).
  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    before_state,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'task_command_applied',
    'task',
    p_task_id,
    'user',
    undo_before_state,
    undo_after_state,
    'User applied a natural-language task command',
    null
  );

  -- 25. Return -----------------------------------------------------------------
  return pg_catalog.jsonb_build_object(
    'outcome', 'applied',
    'task_id', p_task_id,
    'action', p_action,
    'undo_id', undo_id,
    'idempotent', false,
    'request_fingerprint', canonical_fingerprint,
    'reminders_cancelled', reminders_cancelled_count,
    'reminder_created_id', reminder_created_id,
    'undo_expires_at', pg_catalog.to_char(undo_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo handler: the nine column actions (2E-UPDATE-014, 2E-UNDO-001)
-- ---------------------------------------------------------------------------
-- The calling convention is exact and not negotiable: the router does
-- `execute format('select private.%I($1, $2)', resolved_handler) using
-- current_user_id, operation.id` (`202607250052:689-691`), and four pgTAP files
-- plus this migration's own assertion resolve handlers through
-- `to_regprocedure('private.' || quote_ident(handler_function) || '(uuid, uuid)')`.
-- Anything else resolves NULL and hard-fails deployment.
--
-- SECURITY INVOKER, by omitting the clause. Reached only through the definer
-- router it runs with the router's privileges, so behaviour is identical; but if
-- a future migration ever granted it by mistake, an authenticated caller would
-- still be refused by the table grants it lacks instead of gaining a
-- cross-tenant write. `undo_operation_routing.sql:119-131` asserts
-- `prosecdef = false` for every registered handler.
--
-- The re-select is deliberately NOT `for update`: the router already holds the
-- row lock. The action_type gate is not redundant with the registry either —
-- `undo_operation_routing.sql:215-225` calls a handler directly on a foreign row
-- to prove a registry mistake can never make one operation compensate another.
-- Marking the operation `'undone'` and writing `audit_logs` are the handler's
-- job: the router does neither, and omitting the first leaves the row
-- `'available'` and the undo silently replayable.

create or replace function private.undo_apply_task_command_fields(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  -- Never named `task_id`: `public.reminders` and the three relation tables all
  -- carry a column of that name, and plpgsql's default `variable_conflict =
  -- error` turns such a reference into a runtime ambiguity failure rather than
  -- silently preferring one meaning.
  target_task_id uuid;
  -- The ten scalar columns as the forward UPDATE left them, recorded at the RPC's
  -- step 23. This is the evidence the compensating UPDATE is guarded on; there is no
  -- `expected_status` any more, because guarding one column while writing ten let a
  -- second command's effect be discarded in silence.
  applied_state jsonb;
  recorded_reminders jsonb;
  reminders_restored integer := 0;
  live_reminders integer := 0;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'apply_task_command' then
    raise exception 'Unsupported undo operation' using errcode = 'P0001';
  end if;

  -- Fail closed on the recorded evidence before touching a row. Everything below
  -- restores *from* `before_state` and guards *on* `after_state -> 'applied_state'`,
  -- so an absent or non-object either one means the forward operation's step-23
  -- patch never ran and there is nothing truthful to restore — refusing is the only
  -- honest answer (`202607220045:85-96`).
  --
  -- Every term is `is distinct from`, never `<>`. `jsonb_typeof` is strict and `->`
  -- on an absent key is SQL NULL, so `jsonb_typeof(x -> 'k') <> 'array'` evaluates
  -- to NULL for precisely the shape it is written to refuse; one NULL term makes the
  -- whole `or`-chain NULL unless some other term is already true, and plpgsql treats
  -- a NULL `if` condition as false. That is how this gate first shipped fail-open
  -- for a null `before_state` and for a missing `reminders_cancelled` — the two
  -- shapes the paragraph above claims it refuses — while the element-shape gate
  -- further down already used the correct idiom for the identical reason.
  -- `cardinality(NULL)` is NULL as well, so that term needs it too.
  --
  -- `applied_state` and `reminders_reconciled` are *required*, not defaulted. An
  -- operation recorded before they existed can be neither guarded nor reconciled
  -- truthfully, and refusing it is strictly better than silently falling back to a
  -- status-only guard over a ten-column write. No such row exists anywhere: this
  -- migration has never been applied to the linked project, so this is a contract
  -- statement rather than a compatibility shim.
  if pg_catalog.jsonb_typeof(operation.before_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.before_state -> 'reminders_cancelled')
       is distinct from 'array'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'applied_state')
       is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'reminders_reconciled')
       is distinct from 'boolean'
    or pg_catalog.cardinality(operation.entity_ids) is distinct from 1
  then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  target_task_id := operation.entity_ids[1];
  applied_state := operation.after_state -> 'applied_state';
  recorded_reminders := operation.before_state -> 'reminders_cancelled';

  -- The compensating column write is performed by the system executing a stored
  -- operation, which is what the trigger row describes; the `operation_undone`
  -- row below describes who *asked* for it (`actor = 'user'`). Together they make
  -- user-driven and undo-driven transitions distinguishable in audit at the
  -- trigger layer, which is what 2E-DESTRUCTIVE-007 needs in Slice 2E.5 without
  -- reopening `audit_task_change` again.
  perform pg_catalog.set_config('app.audit_actor', 'system', true);

  -- Guarded on all ten columns this SET list writes, against the state the forward
  -- operation *produced* — not on `status` alone. Undo must refuse when a newer
  -- change would be silently discarded (2E-UPDATE-014, 2E-UNDO-004), and a
  -- status-only guard did not: two commands on one task (a rename, then a
  -- `reschedule_due`) followed by an undo of the *first* left the status untouched,
  -- so the guard matched, the restore wrote `due_at = null` on top of the second
  -- command, and the reminder that command armed stayed `scheduled` on a task with
  -- no due date — reported as `{"undone": true}`.
  --
  -- This is the forward path's twelve-column staleness gate (step 17) in the
  -- compensating direction, and the same shape for the same reason: every term is
  -- `is not distinct from`, because nine of the ten columns are nullable and `=`
  -- would make a NULL column never match and refuse every undo of a task that has
  -- one. `created_at` and `updated_at` are the two the forward gate has and this one
  -- does not: neither is restored here, and `updated_at` moves for any write to any
  -- column outside these ten (`tasks_updated_at`, `202607160003:180`), so guarding
  -- on it would refuse undos that would discard nothing at all.
  --
  -- Narrowing the SET list to the columns the recorded action touches is the other
  -- way to close the same hole, and it is rejected: withdrawn decision D17 makes the
  -- forward status branch write `completed_at` and `cancelled_at` unconditionally,
  -- so a narrowed restore would strand a `completed_at` the forward path cleared.
  update public.tasks
  set
    status = operation.before_state ->> 'status',
    title = operation.before_state ->> 'title',
    description = operation.before_state ->> 'description',
    due_at = (operation.before_state ->> 'due_at')::timestamptz,
    planned_at = (operation.before_state ->> 'planned_at')::timestamptz,
    manual_priority = operation.before_state ->> 'manual_priority',
    completed_at = (operation.before_state ->> 'completed_at')::timestamptz,
    cancelled_at = (operation.before_state ->> 'cancelled_at')::timestamptz,
    intentional_no_due = coalesce(
      (operation.before_state ->> 'intentional_no_due')::boolean,
      false
    ),
    no_due_reason = operation.before_state ->> 'no_due_reason'
  where user_id = p_user_id
    and id = target_task_id
    and status is not distinct from applied_state ->> 'status'
    and title is not distinct from applied_state ->> 'title'
    and description is not distinct from applied_state ->> 'description'
    and due_at is not distinct from (applied_state ->> 'due_at')::timestamptz
    and planned_at is not distinct from (applied_state ->> 'planned_at')::timestamptz
    and manual_priority is not distinct from applied_state ->> 'manual_priority'
    and completed_at is not distinct from (applied_state ->> 'completed_at')::timestamptz
    and cancelled_at is not distinct from (applied_state ->> 'cancelled_at')::timestamptz
    and intentional_no_due
        is not distinct from (applied_state ->> 'intentional_no_due')::boolean
    and no_due_reason is not distinct from applied_state ->> 'no_due_reason';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  -- Reminders are restored by the same close-and-insert mechanism the forward
  -- path used (2E-UPDATE-014). Un-cancelling the recorded ids would be safe only
  -- while the heartbeat keeps selecting `status = 'scheduled'`; inserting fresh
  -- rows is safe under every ordering, because a notification keyed
  -- `'reminder:' || id` makes an id that has already fired unable to fire again.
  -- The recorded `remind_at` is restored verbatim even when it is now past: a
  -- past-due scheduled reminder firing on the next tick is the state that
  -- existed. The cost is dead rows, and that is accepted.
  if operation.after_state ->> 'reminder_created_id' is not null then
    update public.reminders
    set status = 'cancelled'
    where user_id = p_user_id
      and id = (operation.after_state ->> 'reminder_created_id')::uuid
      and status in ('scheduled', 'snoozed');
    -- Deliberately no count check: the heartbeat may already have sent this row,
    -- and a sent reminder is history that undo does not rewrite (ADR-018).
  end if;

  -- Fail closed on the recorded element *shape* before inserting. This is not the
  -- reminder post-condition — that one is below, read back from the table — and the
  -- two are kept apart because they refuse different things. `jsonb_array_elements`
  -- yields exactly one row per element and the evidence gate above already proved
  -- the value is an array, so `reminders_restored <> jsonb_array_length(recorded_reminders)`
  -- compared the array's length against itself: it was written, and rejected as
  -- structurally unprovokable, which for a declared member of the closed `2E_*`
  -- vocabulary is the same defect as no raise at all.
  --
  -- What is genuinely reachable is a recorded element that does not carry the four
  -- fields the forward path writes. `->>` yields NULL for a non-object and for an
  -- absent key, so `public.reminders` would surface a raw `23502` — or a `22007`
  -- out of the instant cast — that no mapper case covers, instead of this slice's
  -- declared code. Whatever the forward path records becomes a hard contract the
  -- undo enforces (`202607220045:85-96`); this states that contract where it can
  -- still refuse cheaply. `is distinct from` on every term, for the reason the
  -- evidence gate above now spells out at length: `jsonb_typeof` of an absent key is
  -- SQL NULL and `NULL <> 'string'` is NULL, so `<>` would let exactly the malformed
  -- element this exists to catch pass straight through. This gate had that idiom
  -- right from the first commit, which is how the evidence gate above — written with
  -- `<>` and documented as fail-closed — was found not to be.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(recorded_reminders) as recorded(value)
    where pg_catalog.jsonb_typeof(recorded.value) is distinct from 'object'
      or pg_catalog.jsonb_typeof(recorded.value -> 'title') is distinct from 'string'
      or pg_catalog.jsonb_typeof(recorded.value -> 'remind_at') is distinct from 'string'
      or pg_catalog.jsonb_typeof(recorded.value -> 'important') is distinct from 'boolean'
  ) then
    raise exception 'Task command undo reminder integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
  end if;

  insert into public.reminders (user_id, task_id, title, remind_at, important)
  select
    p_user_id,
    target_task_id,
    recorded.value ->> 'title',
    (recorded.value ->> 'remind_at')::timestamptz,
    coalesce((recorded.value ->> 'important')::boolean, false)
  from pg_catalog.jsonb_array_elements(recorded_reminders) as recorded(value);
  get diagnostics reminders_restored = row_count;

  -- The reminder post-condition, read back from the table — the forward path's own
  -- shape (its step 22), which this handler was missing. The element gate above
  -- refuses malformed *evidence*, and the forward path cannot write malformed
  -- evidence, so on its own it left `2E_UNDO_REMINDER_INTEGRITY` unraisable from any
  -- state a real operation can reach. That is the identical objection step 22 uses
  -- to reject its own tautological count form, so the file was inconsistent with
  -- itself: a declared member of a closed error vocabulary that no reachable state
  -- can provoke is the same defect as a missing raise.
  --
  -- The expected count is exact, not approximate. The forward reconciliation closed
  -- EVERY `scheduled` row and recorded each one, this handler cancelled the single
  -- row that reconciliation created and re-inserted exactly the recorded ones, and
  -- nothing else in the product inserts a reminder for an existing task —
  -- `create_due_task_reminder` is `after insert on public.tasks` only
  -- (`202607160007:209`), so neither UPDATE above can have added one. What is
  -- reachable on the other side is the direct client write `authenticated` can still
  -- perform, because it keeps INSERT and UPDATE on `public.reminders`
  -- (`202607160007:152-166`, permitted by PRD §14 and recorded as residual risk in
  -- §16.4), committing between the forward close and here: that leaves the task
  -- holding a live reminder no operation in this chain ever disclosed, on top of a
  -- pre-state the undo has just restored. Refusing is retryable and truthful.
  --
  -- Scoped to operations that actually reconciled reminders, from the recorded
  -- `reminders_reconciled` rather than from a second copy of the taxonomy. Run
  -- unconditionally it would refuse the undo of a `rename_task` or an `append_note`
  -- on a task legitimately holding a live reminder neither ever touched: those
  -- actions record an empty array, so the comparison would be against zero.
  if (operation.after_state ->> 'reminders_reconciled')::boolean then
    select pg_catalog.count(*)::integer
    into live_reminders
    from public.reminders as live_reminder
    where live_reminder.task_id = target_task_id
      and live_reminder.user_id = p_user_id
      and live_reminder.status = 'scheduled';
    if live_reminders
      is distinct from pg_catalog.jsonb_array_length(recorded_reminders)
    then
      raise exception 'Task command undo reminder integrity check failed'
        using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
    end if;
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = pg_catalog.now()
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    target_task_id,
    'user',
    operation.after_state,
    pg_catalog.jsonb_build_object(
      'task_id', target_task_id,
      'restored_status', operation.before_state ->> 'status',
      'reminders_restored', reminders_restored
    ),
    'User executed the stored compensating operation',
    operation.source_entry_id
  );

  return pg_catalog.jsonb_build_object(
    'undone', true,
    'affected', affected,
    'reminders_restored', reminders_restored,
    'idempotent', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo handler: the four relation actions (2E-UPDATE-015)
-- ---------------------------------------------------------------------------
-- A separate handler rather than a branch, because "remove only the row this
-- operation created" is a different contract from "put the recorded fields
-- back", and one function enforcing both hides which one is in force. It
-- restores no scalar column and touches no reminder: neither appears in these
-- actions' `changedFields`, so restoring either would be undo inventing an
-- effect the forward operation never had.

create or replace function private.undo_apply_task_command_relation(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  -- `target_task_id`, never `task_id`: all three relation tables have a column
  -- of that name, so `where task_id = task_id` would be either a plpgsql
  -- ambiguity failure or a tautology that deletes every owner's row for the
  -- relation. Naming it apart is what makes the predicate readable as a
  -- predicate.
  target_task_id uuid;
  recorded_relation jsonb;
  relation_table text;
  relation_target_id uuid;
  relation_role text;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'apply_task_command_relation' then
    raise exception 'Unsupported undo operation' using errcode = 'P0001';
  end if;

  -- `is distinct from`, not `<>`, on every term, for the reason the fields handler
  -- records at length: `jsonb_typeof` is strict, `->` on an absent key is SQL NULL,
  -- and a NULL term makes an `or`-chain NULL, which plpgsql reads as false. Written
  -- with `<>` this gate did not fire for the absent `relation` it exists to refuse.
  -- `cardinality(NULL)` is NULL as well.
  --
  -- The recorded table name is checked *here*, at the gate, and not left to the
  -- `else` of the delete chain below. Both raise the same code, but a fail-closed
  -- gate that in fact fails closed one screen later has already run
  -- `set_config('app.audit_actor', …)` and the `::uuid` cast, and reads to a
  -- maintainer as though an unknown table were an expected branch. `coalesce(…, '')`
  -- makes the comparison total: `->>` is NULL for an absent key, for a JSON null and
  -- for a non-object, and `NULL not in (…)` is NULL, which is the same fail-open the
  -- paragraph above describes.
  if pg_catalog.jsonb_typeof(operation.after_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'relation') is distinct from 'object'
    or coalesce(operation.after_state -> 'relation' ->> 'table', '')
       not in ('task_projects', 'task_contexts', 'task_people')
    or pg_catalog.cardinality(operation.entity_ids) is distinct from 1
  then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  target_task_id := operation.entity_ids[1];
  recorded_relation := operation.after_state -> 'relation';
  relation_table := recorded_relation ->> 'table';
  relation_role := recorded_relation ->> 'role';
  begin
    relation_target_id := (recorded_relation ->> 'id')::uuid;
  exception when others then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end;

  -- Set even though nothing here writes `public.tasks`, so the setting cannot be
  -- missing if a future column restoration is ever added to this handler and the
  -- co-firing trigger would then attribute it to the wrong actor.
  perform pg_catalog.set_config('app.audit_actor', 'system', true);

  -- Scoped on the owner, the task, the recorded target id and — for
  -- `task_people` — the recorded role, so exactly the row this operation created
  -- is removed and never one the user established earlier under another role.
  if relation_table = 'task_projects' then
    delete from public.task_projects
    where user_id = p_user_id
      and task_id = target_task_id
      and project_id = relation_target_id;
  elsif relation_table = 'task_contexts' then
    delete from public.task_contexts
    where user_id = p_user_id
      and task_id = target_task_id
      and context_id = relation_target_id;
  elsif relation_table = 'task_people' then
    delete from public.task_people
    where user_id = p_user_id
      and task_id = target_task_id
      and person_id = relation_target_id
      and role = relation_role;
  else
    -- Unreachable: the evidence gate proved the recorded name is one of the three
    -- above. Kept as the chain's terminator anyway — without it, an unknown name
    -- would fall through to `get diagnostics`, which would then report the row count
    -- of whatever statement ran last and pass a check designed to catch exactly this.
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = pg_catalog.now()
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    target_task_id,
    'user',
    operation.after_state,
    pg_catalog.jsonb_build_object(
      'task_id', target_task_id,
      'relation_removed', recorded_relation
    ),
    'User executed the stored compensating operation',
    operation.source_entry_id
  );

  return pg_catalog.jsonb_build_object(
    'undone', true,
    'affected', affected,
    'reminders_restored', 0,
    'relation_removed', recorded_relation,
    'idempotent', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Registration (2E-UPDATE-013)
-- ---------------------------------------------------------------------------
-- Structurally mandatory: `undo_operations_registered_handler`
-- (`202607250052:744-769`) raises `UNDO_HANDLER_NOT_REGISTERED` on any insert
-- naming an unregistered `action_type`, so without these two rows the RPC's
-- reservation — its first write — could never land. `handler_function` stores the
-- BARE name; a `'private.'` prefix would produce
-- `select private."private.undo_..."($1, $2)`.

insert into private.undo_operation_handlers (action_type, handler_function, description) values
  ('apply_task_command', 'undo_apply_task_command_fields',
   'Phase 2E.4 task command, column actions: restore the recorded scalar pre-state and re-create the reminders the transition closed.'),
  ('apply_task_command_relation', 'undo_apply_task_command_relation',
   'Phase 2E.4 task command, relation actions: remove only the task_projects/task_contexts/task_people row the operation created.')
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- The RPC follows `202607220044:1406-1409` exactly: revoked from `public` and
-- `anon` (2E-OWNERSHIP-003), granted to `authenticated`, and `service_role` is
-- neither granted nor revoked — no worker calls a user-initiated command. The
-- handlers use the stricter private form and are executable by nobody: they are
-- reachable only through the definer router.

revoke all on function public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)
  from public, anon;
grant execute on function public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)
  to authenticated;

revoke all on function private.undo_apply_task_command_fields(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.undo_apply_task_command_relation(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text) is
  'Phase 2E task command apply (PRD 2E-UPDATE-001..017). The single mutation path for the thirteen non-destructive actions of PRD 11.2: owner-scoped, idempotent on (user_id, operation_key), replay-safe from the stored after_state, gated on a typed twelve-column pre-state comparison that raises 55P03, reconciling reminders by close-and-insert, audited with a transaction-local actor, recording the governing policy version (2E-PROVENANCE-001) and the post-write scalar state on the undo row so the compensating write is guarded on all ten columns it restores (2E-UNDO-004), and undoable through a registered private handler. cancel_task and restore_task are refused with 2E_ACTION_NOT_ENABLED until Slice 2E.5 supplies the server-issued confirmation evidence 2E-DESTRUCTIVE-004 requires.';

-- ---------------------------------------------------------------------------
-- Fail-closed post-deploy assertions
-- ---------------------------------------------------------------------------
-- The `202607250052:774-815` and `202607230050:1011-1019` posture, narrowed to
-- what this migration creates. `create or replace` and `insert ... on conflict`
-- are both fail-open on their own, so every invariant this slice depends on is
-- re-proven here against the catalog rather than assumed from the text above.

do $$
declare
  bundle text;
  missing text;
  is_definer boolean;
  definer_config text;
begin
  -- Every registered handler — including the two added above — resolves at the
  -- one signature the router routes through.
  select string_agg(handlers.handler_function, ', ' order by handlers.handler_function)
  into missing
  from (select distinct handler_function from private.undo_operation_handlers) as handlers
  where to_regprocedure('private.' || quote_ident(handlers.handler_function) || '(uuid, uuid)') is null;

  if missing is not null then
    raise exception 'undo_operation registry points at missing handler(s): %', missing
      using errcode = 'P0001';
  end if;

  -- Both action_types this RPC can record route somewhere. The registration
  -- trigger enforces this at insert time, but that is a runtime failure on a
  -- user's first command; this is the same guarantee at deploy time.
  select string_agg(required.action_type, ', ' order by required.action_type)
  into missing
  -- Cast explicitly: an `unknown`-typed VALUES column reaching `string_agg` is
  -- the kind of resolution PostgreSQL only sometimes performs for you.
  from (values ('apply_task_command'::text), ('apply_task_command_relation'::text))
    as required(action_type)
  where not exists (
    select 1 from private.undo_operation_handlers as handlers
    where handlers.action_type = required.action_type
  );

  if missing is not null then
    raise exception 'apply_task_command records action_type(s) with no registered handler: %', missing
      using errcode = 'P0001';
  end if;

  bundle := concat_ws(
    E'\n',
    pg_get_functiondef('public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
    pg_get_functiondef('private.undo_apply_task_command_fields(uuid, uuid)'::regprocedure),
    pg_get_functiondef('private.undo_apply_task_command_relation(uuid, uuid)'::regprocedure),
    pg_get_functiondef('public.audit_task_change()'::regprocedure)
  );

  -- 2C-UNDO-004 (ADR-026): the gateway-hanging SQLSTATE must never appear in a
  -- body this project ships. 202607230050 remediated the one occurrence to
  -- 55P03; this slice's conflict signal is that same code.
  if position('errcode = ''40001''' in bundle) > 0 then
    raise exception 'apply_task_command raises the gateway-hanging SQLSTATE that ADR-026 retired'
      using errcode = 'P0001';
  end if;
  if position('55P03' in bundle) = 0 then
    raise exception 'apply_task_command lost the 55P03 stale-pre-state signal 2E-UPDATE-003 requires'
      using errcode = 'P0001';
  end if;

  -- 202607220042/044/045 recurrence guard, widened from the two members those
  -- migrations happened to hit to the whole defect class. COALESCE, NULLIF,
  -- GREATEST and LEAST are the SQL special forms the grammar turns into dedicated
  -- expression nodes with no `pg_proc` entry behind them, so any explicitly
  -- qualified call fails to resolve with `42883` under `search_path = ''` — and,
  -- because plpgsql defers parse-analysis to first execution, does so at call time
  -- rather than at deploy, which is what lets a body ship green. Narrowing this to
  -- greatest/least as `202607250052:802-803` does is what let an adversarial review
  -- find eleven `pg_catalog` COALESCE calls in this very file passing the gate that
  -- exists to stop them.
  --
  -- `overlay`, `substring`, `position`, `trim` and `extract` are deliberately NOT
  -- listed. They read like members of the same class because they have SQL-standard
  -- call syntax, but each has real catalog entries, so banning the qualified form
  -- would refuse a legal call.
  if position('pg_catalog.coalesce(' in lower(bundle)) > 0
    or position('pg_catalog.nullif(' in lower(bundle)) > 0
    or position('pg_catalog.greatest(' in lower(bundle)) > 0
    or position('pg_catalog.least(' in lower(bundle)) > 0 then
    raise exception 'apply_task_command schema-qualified a SQL special form (coalesce/nullif/greatest/least), which cannot resolve under an empty search_path'
      using errcode = 'P0001';
  end if;

  -- The undo guard is only ever as wide as the evidence the apply records, and the
  -- RPC and its handler are `create or replace`-able independently of each other. So
  -- both keys the handler's closed evidence gate now requires are re-proven from the
  -- catalog: a later revision that drops either one reds here, at deploy, instead of
  -- at a user's first undo, where the gate would refuse every compensation for
  -- operations that were applied perfectly well. `policy_version` is the same
  -- guarantee for 2E-PROVENANCE-001, which nothing else in the schema can enforce —
  -- it is a key in a jsonb payload, not a column with a NOT NULL.
  if position('''applied_state'', undo_applied_state' in bundle) = 0
    or position('''policy_version'', p_policy_version' in bundle) = 0
  then
    raise exception 'apply_task_command no longer records the applied_state its undo handler guards on, or the policy version 2E-PROVENANCE-001 requires'
      using errcode = 'P0001';
  end if;

  -- 2E-UPDATE-001's security posture, read from the catalog. `proconfig` is
  -- text[] and Postgres stores the empty search_path quoted.
  select procedure.prosecdef, array_to_string(procedure.proconfig, ',')
  into is_definer, definer_config
  from pg_proc procedure
  where procedure.oid = 'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure;

  if not is_definer then
    raise exception 'apply_task_command is not SECURITY DEFINER, so its ownership predicates run as the caller'
      using errcode = 'P0001';
  end if;
  if definer_config is distinct from 'search_path=""' then
    raise exception 'apply_task_command does not pin an empty search_path: %', coalesce(definer_config, '<null>')
      using errcode = 'P0001';
  end if;
end
$$;
