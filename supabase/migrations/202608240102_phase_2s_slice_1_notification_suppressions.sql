-- Phase 2S slice 2S.1 -- the owner can tell the Brain to be quiet, the Brain
-- stops repeating itself forever, and a notice points at its subject.
--
-- THE ONE MIGRATION THIS PHASE HAS. OD-2S-7 is signed as option A -- 1
-- allocated -- and this spends it. A SECOND MIGRATION OF ANY KIND IS A STOP
-- CONDITION (ADR-137 Decision 7, ADR-138 Decision 3). Its destination is
-- exclusive: the suppression state chosen by OD-2S-1 A, the cadence rule chosen
-- by OD-2S-4 B, and the notice destination fixed by OD-2S-3. Nothing else.
--
-- WHY THE SCHEMA CANNOT CARRY THIS WITHOUT IT
--
-- public.notifications holds eleven columns -- id, user_id, type, title, body,
-- action_url, priority, status, dedupe_key, read_at, created_at -- and
-- public.tasks holds twenty-three. NEITHER HAS A jsonb COLUMN, so unlike the
-- column an earlier phase was able to repurpose there is not even an unused one
-- to reach for, and no suppress/mute/nudge vocabulary exists anywhere in
-- supabase/migrations/. The asymmetry is in the schema itself:
-- public.pending_questions has snoozed_until and a snoozed status, and so does
-- public.reminders. public.notifications has neither, and its status check
-- allows only unread, read, dismissed. The product built "not now" twice and
-- skipped the one thing that speaks daily.
--
-- WHAT SLICE 2S.0 MEASURED, AND WHY THE DESIGN IS AGAINST THAT AND NOT THE PRD
--
-- The PRD and the handoff both quote ONE suppression clause -- the 24-hour
-- window. Slice 2S.0 read pg_get_functiondef and found THREE layers:
--
--   (A) an exact dedupe_key match with NO time bound;
--   (B) the 24-hour cooldown, scoped to task_overdue and task_stale only;
--   (C) on conflict (user_id, dedupe_key) do nothing, underneath both.
--
-- That is load-bearing. A task dedupe_key carries the owner's LOCAL DATE, so
-- tomorrow's key differs and (A) does not stop it -- which is exactly why 54
-- task_stale rows exist across nineteen unbroken days at three a day. A
-- reminder key carries no date, so (A) makes a reminder notice permanently
-- once-only, which is why not one has ever repeated.
--
-- So a backoff that merely WIDENS (B) would still be defeated by the date
-- inside the key, and one that CHANGES the key would collide with (A) and (C).
-- This migration therefore replaces (B) with a computed gap and leaves (A) and
-- (C) exactly as they are. Neither surviving clause reads `status`, and neither
-- is asked to: `2S-ANSWER-008` requires a dismissal NOT to stop the next notice,
-- and a suppression -- not a disposition -- is what silences a subject.
--
-- WHAT DOES NOT CHANGE, AND IS RE-PROVED BY CALLING THE FUNCTION
--
-- Quiet hours, the daily cap, the 24-hour cooldown's REPLACEMENT being no
-- weaker on day one, the per-user lock, the rank ordering that lets a reminder
-- outrank a stale nudge, and one owner's failure not blocking the batch.
-- 2S-CADENCE-004 ... -007 prove each by CALLING run_user_heartbeat. Slice 2R.1
-- matched substrings against pg_proc.prosrc and it proved nothing about
-- behaviour; slice 2R.4 called the function twenty-six times and found a real
-- defect in its own assertion. This file's pgTAP calls it.
--
-- PUSH IS NOT RESUMED, NOT REPAIRED AND NOT CLAIMED. notification_deliveries
-- held zero rows at slice 2S.0 and this migration does not touch it.

-- ---------------------------------------------------------------------------
-- 1. The state (OD-2S-1 A)
-- ---------------------------------------------------------------------------
-- Polymorphic on purpose: task_stale, task_overdue and the reminder notice all
-- use ONE mechanism, so the next notice type needs no second column. The column
-- names are `entity_type`/`entity_id` rather than `subject_*` for a reason that
-- is reuse rather than taste: public.validate_polymorphic_entity_owner() reads
-- new.user_id, new.entity_type and new.entity_id by name, and
-- public.entity_is_owned already resolves BOTH 'task' and 'reminder'. Naming
-- the columns anything else would have meant writing a second ownership
-- validator for a question the repository already answers -- and a relationship
-- row's own user_id is never sufficient proof of ownership.
--
-- `scope` is what makes "not now" and "never" different sentences rather than
-- one sentence with a nullable field. It is also what gives 2S-SILENCE-002
-- three real refusals instead of one: a temporary suppression with no expiry is
-- UNBOUNDED, a temporary one with a past expiry is PAST-DATED, and a permanent
-- one carrying an expiry is MALFORMED. A nullable column alone can express none
-- of those as an error.

create table public.notification_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('task', 'reminder')),
  entity_id uuid not null,
  -- NULL means "every notice type about this subject". A value narrows it to
  -- one, so an owner who silences the daily nag does not also silence a
  -- genuinely overdue warning unless they say so.
  notice_type text check (notice_type in ('task_overdue', 'task_stale', 'reminder')),
  scope text not null check (scope in ('until', 'forever')),
  suppressed_until timestamptz,
  reason text not null check (char_length(btrim(reason)) between 1 and 400),
  -- The SAME three words public.audit_logs already allows, read from the
  -- deployed `audit_logs_actor_check` rather than invented here. A first draft
  -- of this column said ('user','agent','operator') and would have created a
  -- FOURTH actor vocabulary that silently disagreed with the audit trail its
  -- own rows are written into -- the defect this repository has already paid
  -- for once, where one concept had three copies and they drifted.
  actor text not null default 'user' check (actor in ('user', 'agent', 'system')),
  created_at timestamptz not null default now(),
  -- The scope and the instant cannot disagree. This is the LAST line of
  -- defence, not the first: the RPC refuses each case by name so the owner gets
  -- a sentence rather than a constraint violation, and 2S-SILENCE-002 asserts
  -- that none of the three ever reaches storage.
  constraint notification_suppressions_scope_matches_instant check (
    (scope = 'until' and suppressed_until is not null)
    or (scope = 'forever' and suppressed_until is null)
  ),
  -- The repository's composite-FK convention: a child row proves ownership
  -- against (user_id, id) rather than against id alone.
  constraint notification_suppressions_user_scoped_identity unique (user_id, id),
  -- One live suppression per (owner, subject, notice type). A second is not an
  -- error worth raising at the owner -- it is the same sentence said twice --
  -- so the RPC upserts onto this.
  --
  -- NULLS NOT DISTINCT rather than a `coalesce(notice_type, '')` expression
  -- index, deliberately. A standard unique index treats NULLs as distinct, so
  -- two "silence everything about this subject" rows would BOTH be accepted and
  -- the upsert would never fire. The expression-index alternative works too,
  -- but ON CONFLICT would then have to infer against an expression rather than
  -- a column list -- one more thing that can silently fail to match. Postgres
  -- is 17 in both the local stack (`config.toml:42`) and the deployed project,
  -- so the plain form is available and is the one with fewer moving parts.
  constraint notification_suppressions_one_per_subject
    unique nulls not distinct (user_id, entity_type, entity_id, notice_type)
);

-- The heartbeat's consult is (user_id, entity_type, entity_id) with a liveness
-- test, and it runs once per candidate per hour for every user in the batch.
create index notification_suppressions_live_idx
  on public.notification_suppressions (user_id, entity_type, entity_id, scope, suppressed_until);

comment on table public.notification_suppressions is
  'Phase 2S (OD-2S-1 A): the owner telling the agent to stop speaking about one subject, either until an instant or permanently. Carries no notification content by design -- 2S-TRUST-006.';

-- 2S-TRUST-006, structurally: there is no column here capable of holding a
-- title or a body. `reason` is the owner's own sentence about their own
-- subject, bounded at 400 characters, and is the audit trail rather than a copy
-- of the message.

alter table public.notification_suppressions enable row level security;
alter table public.notification_suppressions force row level security;

-- Every policy names its role list. A policy with no role list is PUBLIC, and a
-- definer writer would pass FORCE RLS through it.
create policy notification_suppressions_select_own on public.notification_suppressions
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_suppressions_insert_own on public.notification_suppressions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_suppressions_update_own on public.notification_suppressions
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notification_suppressions_delete_own on public.notification_suppressions
  for delete to authenticated using (user_id = (select auth.uid()));

-- 2S-TRUST-003: least privilege, enumerated. `anon` gets nothing. `authenticated`
-- gets exactly what the owner's own reads and the undo's compensation need.
-- `service_role` is granted NOTHING, and the explicit revoke is required rather
-- than assumed: `alter default privileges` in this schema hands every new table
-- REFERENCES, SELECT, TRIGGER and TRUNCATE to that role, so a table that merely
-- omits a grant still carries four -- including TRUNCATE, which is destructive.
-- The heartbeat reads suppressions as a SECURITY DEFINER function running as its
-- owner, so it needs no grant at all. `public.reminder_series`, the newest table
-- in the chain, holds exactly this posture.
revoke all on table public.notification_suppressions from public, anon, service_role;
grant select, insert, update, delete on table public.notification_suppressions to authenticated;

-- Ownership is proved by TRIGGER, reusing the validator that already exists.
create trigger notification_suppressions_validate_owner
before insert or update of user_id, entity_type, entity_id on public.notification_suppressions
for each row execute function public.validate_polymorphic_entity_owner();

-- ---------------------------------------------------------------------------
-- 2. The writer (2S-SILENCE-001 ... -003, -006)
-- ---------------------------------------------------------------------------
-- The only new write authority Phase 2S creates. Every other verb the phase
-- offers routes to a Server Action that already existed at slice 2S.0's
-- baseline -- 2S-TRUST-010 censuses them and a new one is a stop condition.

create or replace function public.suppress_notification_subject(
  p_entity_type text,
  p_entity_id uuid,
  p_scope text,
  p_suppressed_until timestamptz default null,
  p_notice_type text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  -- COALESCE and NULLIF are PARSER CONSTRUCTS, not functions in pg_catalog, so
  -- they are spelled bare even under `search_path = ''` -- qualifying them is
  -- the trap `sql-grammar-guard` allowlists exactly two historical instances
  -- of and refuses to let grow. `btrim` is a real function and stays qualified.
  clean_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  previous public.notification_suppressions%rowtype;
  saved public.notification_suppressions%rowtype;
  undo_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- 2S-SILENCE-002. Each refusal is named, and none of them reaches storage.
  -- The table's CHECK constraint would catch two of these, but a constraint
  -- violation is not a sentence an owner can act on.
  if p_entity_type is null or p_entity_type not in ('task', 'reminder') then
    raise exception 'Unsupported suppression subject'
      using errcode = 'P0001', detail = 'SUPPRESSION_SUBJECT_UNSUPPORTED';
  end if;
  if p_entity_id is null then
    raise exception 'A suppression needs a subject'
      using errcode = 'P0001', detail = 'SUPPRESSION_SUBJECT_MISSING';
  end if;
  if p_scope is null or p_scope not in ('until', 'forever') then
    raise exception 'A suppression needs a scope'
      using errcode = 'P0001', detail = 'SUPPRESSION_SCOPE_UNSUPPORTED';
  end if;
  if p_notice_type is not null
     and p_notice_type not in ('task_overdue', 'task_stale', 'reminder') then
    raise exception 'Unsupported notice type'
      using errcode = 'P0001', detail = 'SUPPRESSION_NOTICE_TYPE_UNSUPPORTED';
  end if;
  if p_scope = 'until' and p_suppressed_until is null then
    raise exception 'A temporary suppression needs an expiry'
      using errcode = 'P0001', detail = 'SUPPRESSION_UNBOUNDED';
  end if;
  if p_scope = 'until' and p_suppressed_until <= pg_catalog.now() then
    raise exception 'A suppression cannot expire in the past'
      using errcode = 'P0001', detail = 'SUPPRESSION_PAST_DATED';
  end if;
  if p_scope = 'forever' and p_suppressed_until is not null then
    raise exception 'A permanent suppression cannot carry an expiry'
      using errcode = 'P0001', detail = 'SUPPRESSION_MALFORMED';
  end if;
  if clean_reason = '' then
    raise exception 'A suppression records why'
      using errcode = 'P0001', detail = 'SUPPRESSION_REASON_MISSING';
  end if;

  -- Ownership is proved here AND by the trigger. Here so the owner gets a
  -- sentence; there so no path can bypass it.
  if not public.entity_is_owned(current_user_id, p_entity_type, p_entity_id) then
    raise exception 'Subject does not belong to the caller'
      using errcode = '42501', detail = 'SUPPRESSION_SUBJECT_NOT_OWNED';
  end if;

  select * into previous
  from public.notification_suppressions existing
  where existing.user_id = current_user_id
    and existing.entity_type = p_entity_type
    and existing.entity_id = p_entity_id
    and existing.notice_type is not distinct from p_notice_type
  for update;

  insert into public.notification_suppressions as target
    (user_id, entity_type, entity_id, notice_type, scope, suppressed_until, reason, actor)
  values
    (current_user_id, p_entity_type, p_entity_id, p_notice_type, p_scope,
     p_suppressed_until, clean_reason, 'user')
  on conflict (user_id, entity_type, entity_id, notice_type)
  do update set
    scope = excluded.scope,
    suppressed_until = excluded.suppressed_until,
    reason = excluded.reason,
    actor = excluded.actor,
    created_at = pg_catalog.now()
  returning target.* into saved;

  -- 2S-SILENCE-006 and 2S-TRUST-002. `before_state` is null when the owner had
  -- no prior suppression, and the handler reads that to tell "delete the row I
  -- created" from "restore the one I replaced".
  insert into public.undo_operations
    (user_id, action_type, entity_type, entity_ids, before_state, after_state)
  values (
    current_user_id,
    'suppress_notification_subject',
    p_entity_type,
    array[p_entity_id],
    case when previous.id is null then null else pg_catalog.to_jsonb(previous) end,
    pg_catalog.to_jsonb(saved)
  )
  returning id into undo_id;

  -- 2S-TRUST-001: actor, source, reason, target, time and resulting state.
  insert into public.audit_logs
    (user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason)
  values (
    current_user_id,
    'notification_suppressed',
    p_entity_type,
    p_entity_id,
    'user',
    case when previous.id is null then null else pg_catalog.to_jsonb(previous) end,
    pg_catalog.to_jsonb(saved),
    clean_reason
  );

  return pg_catalog.jsonb_build_object(
    'suppression_id', saved.id,
    'undo_id', undo_id,
    'scope', saved.scope,
    'suppressed_until', saved.suppressed_until,
    'replaced', previous.id is not null
  );
end;
$$;

revoke all on function public.suppress_notification_subject(text, uuid, text, timestamptz, text, text)
  from public, anon, service_role;
grant execute on function public.suppress_notification_subject(text, uuid, text, timestamptz, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The undo handler (2S-SILENCE-006, 2S-TRUST-002, 2S-TRUST-013)
-- ---------------------------------------------------------------------------
-- THE HANDLER closes the ledger, not the router. 2R-UNDO-LEDGER-NOT-CLOSED is
-- the live counter-example in this repository: one handler of twenty never sets
-- status = 'undone', so its undo reports success and leaves an operation that
-- looks available forever. This handler sets it, writes the audit row, and
-- returns a result the router will not accept as null.

-- SECURITY INVOKER, and the omission of `security definer` is the decision.
-- `undo_operation_routing.sql` refuses a definer handler by name: the router is
-- already definer, so a handler that is definer TOO gains nothing and turns any
-- accidental grant on it into a cross-tenant write. Every one of the twenty
-- registered handlers is invoker with an empty search_path, and this is the
-- twenty-first. Written definer in the first draft and caught by that guard.
create or replace function private.undo_suppress_notification_subject_v1(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  restored jsonb;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;

  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;

  if operation.before_state is null then
    -- The owner had no suppression before. Undo means the row goes away.
    delete from public.notification_suppressions
    where user_id = p_user_id
      and id = (operation.after_state ->> 'id')::uuid;
    get diagnostics affected = row_count;
    restored := null;
  else
    -- The owner had one and it was replaced. Undo means EXACTLY the prior row,
    -- field for field, including the instant it was created.
    update public.notification_suppressions as target
    set notice_type = nullif(operation.before_state ->> 'notice_type', ''),
        scope = operation.before_state ->> 'scope',
        suppressed_until = (operation.before_state ->> 'suppressed_until')::timestamptz,
        reason = operation.before_state ->> 'reason',
        actor = operation.before_state ->> 'actor',
        created_at = (operation.before_state ->> 'created_at')::timestamptz
    where target.user_id = p_user_id
      and target.id = (operation.before_state ->> 'id')::uuid;
    get diagnostics affected = row_count;
    restored := operation.before_state;
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = pg_catalog.now()
  where id = operation.id;

  insert into public.audit_logs
    (user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason)
  values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    operation.entity_ids[1],
    'user',
    operation.after_state,
    restored,
    'User reversed a notification suppression'
  );

  return pg_catalog.jsonb_build_object('undone', true, 'affected', affected);
end;
$$;

revoke all on function private.undo_suppress_notification_subject_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Structurally mandatory: undo_operations_registered_handler raises
-- UNDO_HANDLER_NOT_REGISTERED on any insert naming an unregistered action_type,
-- so without this row the RPC's own undo reservation could never land. The
-- handler_function is the BARE name -- a 'private.' prefix would produce
-- select private."private.undo_...".
insert into private.undo_operation_handlers (action_type, handler_function, description) values
  ('suppress_notification_subject', 'undo_suppress_notification_subject_v1',
   'Phase 2S slice 2S.1: remove the suppression the command created, or restore field-for-field the one it replaced.')
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- 4. The rule at the source (OD-2S-9 A, OD-2S-4 B, OD-2S-3)
-- ---------------------------------------------------------------------------
-- run_user_heartbeat has been deliberately untouched since Phase 2M, and this
-- is the phase's principal risk. It is reproduced below in full from
-- 202608040073:490-746 with exactly THREE changes, so a reader can diff the two
-- and see that nothing else moved:
--
--   1. Each task branch's action_url points at the SUBJECT rather than at the
--      list (2S-REACH-001). The locale branch is UNCHANGED -- slice 2S.0 found
--      that the destination was already locale-correct and that the PRD's
--      "hardcoded to /pt-BR/app/tasks" was wrong, so 2S-REACH-002 is a property
--      this phase PRESERVES rather than one it builds. The reminder branch's
--      destination is unchanged because no per-reminder route exists: that is a
--      recorded refusal under 2S-REACH-003, not an omission.
--   2. Every branch carries a subject triple -- subject_type, subject_id,
--      subject_changed_at -- so the suppression consult and the backoff can
--      address the subject directly instead of parsing it back out of a string.
--   3. The `pending` CTE gains two clauses, both of which can only ever REMOVE
--      a candidate: the backoff and the suppression consult. THE 24-HOUR
--      COOLDOWN ABOVE THEM IS BYTE-IDENTICAL, which is how 2S-CADENCE-004 is
--      satisfied literally rather than by argument.
--
-- Unchanged and re-proved by CALLING this function in the pgTAP beside it:
-- quiet hours, the daily cap, `available_slots`, the per-user advisory lock,
-- the lifecycle skip, SH-SUSPEND-005's window, the rank ordering that lets a
-- reminder outrank a stale nudge, the reminders-marked-sent update, and the
-- exception handler that keeps one owner's failure from breaking the batch.

create or replace function public.run_user_heartbeat(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
  created_count integer := 0;
  analyzed_count integer := 0;
  delivered_today integer := 0;
  available_slots integer := 0;
  user_timezone text := 'America/Sao_Paulo';
  user_locale text := 'pt-BR';
  quiet_start_time time := '22:30';
  quiet_end_time time := '07:00';
  daily_cap integer := 3;
  allow_important boolean := true;
  local_now timestamp;
  local_date date;
  local_day_start timestamptz;
  local_day_end timestamptz;
  in_quiet_hours boolean;
  lifecycle_status text;
  lifecycle_reason text;
  lifecycle_changed_at timestamptz;
  reactivated_at timestamptz;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('my-brain-heartbeat:' || p_user_id::text, 0)) then
    return jsonb_build_object('skipped', true, 'reason', 'already-running');
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  -- SH-LIFECYCLE-007: a non-active user is skipped before any read of their
  -- data, and run_all_heartbeats therefore does no work for them. A skip, not
  -- an error: one user's suspension never breaks the batch. The same read
  -- carries SH-SUSPEND-005's window, so this costs no extra query.
  select lifecycle.status, lifecycle.reason_code, lifecycle.changed_at
  into lifecycle_status, lifecycle_reason, lifecycle_changed_at
  from public.account_lifecycle lifecycle
  where lifecycle.user_id = p_user_id;

  if lifecycle_status is distinct from 'active' then
    return jsonb_build_object('skipped', true, 'reason', 'account-not-active');
  end if;

  -- SH-SUSPEND-005. Null for every account that reached `active` any other way,
  -- so the predicate below is a no-op unless a reactivation actually happened.
  reactivated_at := case
    when lifecycle_reason in ('operator_reactivation', 'deletion_reverted')
      then lifecycle_changed_at
  end;

  select
    coalesce(profile.timezone, 'America/Sao_Paulo'),
    coalesce(profile.locale, 'pt-BR'),
    coalesce(preferences.quiet_start, '22:30'),
    coalesce(preferences.quiet_end, '07:00'),
    coalesce(preferences.max_followups_per_day, 3),
    coalesce(preferences.important_reminder_override, true)
  into
    user_timezone,
    user_locale,
    quiet_start_time,
    quiet_end_time,
    daily_cap,
    allow_important
  from auth.users heartbeat_user
  left join public.profiles profile on profile.user_id = heartbeat_user.id
  left join public.agent_preferences preferences on preferences.user_id = heartbeat_user.id
  where heartbeat_user.id = p_user_id;

  local_now := now() at time zone user_timezone;
  local_date := local_now::date;
  local_day_start := local_date::timestamp at time zone user_timezone;
  local_day_end := (local_date + 1)::timestamp at time zone user_timezone;
  in_quiet_hours := case
    when quiet_start_time < quiet_end_time
      then local_now::time >= quiet_start_time and local_now::time < quiet_end_time
    else local_now::time >= quiet_start_time or local_now::time < quiet_end_time
  end;

  insert into public.heartbeat_runs (user_id, metadata)
  values (
    p_user_id,
    jsonb_build_object(
      'quiet_hours', in_quiet_hours,
      'timezone', user_timezone,
      'locale', user_locale,
      'local_date', local_date
    )
  )
  returning id into run_id;

  select count(*) into analyzed_count
  from public.tasks
  where user_id = p_user_id and status not in ('completed', 'cancelled');

  select count(*) into delivered_today
  from public.notifications
  where user_id = p_user_id
    and created_at >= local_day_start
    and created_at < local_day_end;
  available_slots := greatest(daily_cap - delivered_today, 0);

  with candidates as (
    select
      'task_overdue'::text as type,
      case when user_locale = 'en' then 'Overdue task' else 'Tarefa atrasada' end as title,
      task.title as body,
      case when user_locale = 'en' then '/en/app/work/' else '/pt-BR/app/work/' end || task.id::text as action_url,
      case when task.manual_priority in ('urgent', 'high') then 'high' else 'normal' end as priority,
      'overdue:' || task.id::text || ':' || local_date::text as dedupe_key,
      task.due_at as event_time,
      case when task.manual_priority = 'urgent' then 4 when task.manual_priority = 'high' then 3 else 2 end as rank,
      'task'::text as subject_type,
      task.id as subject_id,
      task.updated_at as subject_changed_at
    from public.tasks task
    where not in_quiet_hours
      and task.user_id = p_user_id
      and task.status not in ('completed', 'cancelled', 'deferred')
      and task.due_at < now()

    union all

    select
      'task_stale',
      case when user_locale = 'en' then 'Task without movement' else 'Tarefa sem movimento' end,
      task.title,
      case when user_locale = 'en' then '/en/app/work/' else '/pt-BR/app/work/' end || task.id::text,
      'normal',
      'stale:' || task.id::text || ':' || local_date::text,
      task.updated_at,
      1,
      'task',
      task.id,
      task.updated_at
    from public.tasks task
    where not in_quiet_hours
      and task.user_id = p_user_id
      and task.status not in ('completed', 'cancelled', 'deferred', 'waiting')
      and task.due_at is null
      and task.updated_at < now() - make_interval(
        days => case task.manual_priority when 'urgent' then 0 when 'high' then 2 when 'low' then 15 else 7 end
      )

    union all

    select
      'reminder',
      case
        when user_locale = 'en' and reminder.important then 'Important reminder'
        when user_locale = 'en' then 'Reminder'
        when reminder.important then 'Lembrete importante'
        else 'Lembrete'
      end,
      reminder.title,
      case when user_locale = 'en' then '/en/app/reminders' else '/pt-BR/app/reminders' end,
      case when reminder.important then 'high' else 'normal' end,
      'reminder:' || reminder.id::text,
      reminder.remind_at,
      case when reminder.important then 3 else 2 end,
      'reminder',
      reminder.id,
      null::timestamptz
    from public.reminders reminder
    where reminder.user_id = p_user_id
      and reminder.status = 'scheduled'
      and reminder.remind_at <= now()
      -- SH-SUSPEND-005: what came due while the account was not active is not
      -- delivered after the fact. The row is untouched; only the notification
      -- is withheld.
      and (reactivated_at is null or reminder.remind_at >= reactivated_at)
      and (not in_quiet_hours or (allow_important and reminder.important))
  ), pending as (
    select candidate.*
    from candidates candidate
    where not exists (
      select 1 from public.notifications notification
      where notification.user_id = p_user_id
        and notification.dedupe_key = candidate.dedupe_key
    )
    and not exists (
      select 1 from public.notifications notification
      where candidate.type in ('task_overdue', 'task_stale')
        and notification.user_id = p_user_id
        and notification.created_at > now() - interval '24 hours'
        and notification.dedupe_key like
          split_part(candidate.dedupe_key, ':', 1) || ':' ||
          split_part(candidate.dedupe_key, ':', 2) || ':%'
    )
    -- OD-2S-4 B: the Brain backs off instead of repeating itself daily forever.
    --
    -- STRICTLY ADDITIVE, and that is the safety argument rather than a
    -- description. The 24-hour cooldown above is left BYTE-IDENTICAL, so it
    -- remains the floor and 2S-CADENCE-004 is satisfied literally rather than
    -- by reinterpretation. This clause can only ever REMOVE a candidate, so no
    -- input exists on which the product speaks MORE than it did before.
    --
    -- The ladder is 1 day, then 3, then 7, then silence: a subject left
    -- untouched produces at most four notices, at roughly day 0, 1, 4 and 11.
    -- `else false` is the ceiling and it is why 2S-CADENCE-002 can be proved --
    -- the recursion terminates because the count only grows.
    --
    -- `subject_changed_at` is the reset (2S-CADENCE-003): the count is of
    -- notices sent SINCE the subject last moved, so touching the task returns
    -- the cadence to its first interval. It is null for reminders, whose key
    -- carries no date and which are therefore already once-only under the
    -- exact-key clause above -- so this clause deliberately does not apply to
    -- them, and a null there means "no backoff", never "no suppression".
    and (
      candidate.subject_changed_at is null
      or (
        select case count(*)
          when 0 then true
          when 1 then max(sent.created_at) <= now() - interval '1 day'
          when 2 then max(sent.created_at) <= now() - interval '3 days'
          when 3 then max(sent.created_at) <= now() - interval '7 days'
          else false
        end
        from public.notifications sent
        where sent.user_id = p_user_id
          and sent.type = candidate.type
          and sent.dedupe_key like
            split_part(candidate.dedupe_key, ':', 1) || ':' || candidate.subject_id::text || ':%'
          and sent.created_at > candidate.subject_changed_at
      )
    )
    -- OD-2S-1 A: an owner who said "not now" or "not this" is obeyed at the
    -- SOURCE. Nothing is filtered at read time, so the count the owner sees
    -- keeps matching the rows that exist -- which is the whole reason OD-2S-9
    -- was signed A rather than B.
    --
    -- A null notice_type suppresses every notice about the subject; a value
    -- narrows it to one, so silencing the daily nag need not also silence a
    -- genuinely overdue warning.
    and not exists (
      select 1 from public.notification_suppressions suppression
      where suppression.user_id = p_user_id
        and suppression.entity_type = candidate.subject_type
        and suppression.entity_id = candidate.subject_id
        and (suppression.notice_type is null or suppression.notice_type = candidate.type)
        and (suppression.scope = 'forever' or suppression.suppressed_until > now())
    )
  ), limited as (
    select pending.*
    from pending
    order by rank desc, event_time asc, dedupe_key
    limit available_slots
  ), inserted as (
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      action_url,
      priority,
      dedupe_key
    )
    select p_user_id, type, title, body, action_url, priority, dedupe_key
    from limited
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    returning dedupe_key
  )
  select count(*) into created_count from inserted;

  -- Unchanged, and correct under the new predicate for the reason that matters:
  -- a reminder is marked `sent` only when a notification carrying ITS dedupe key
  -- exists, so a reminder the predicate withheld is not marked sent either.
  update public.reminders reminder
  set status = 'sent', sent_at = now()
  where reminder.user_id = p_user_id
    and reminder.status = 'scheduled'
    and exists (
      select 1 from public.notifications notification
      where notification.user_id = p_user_id
        and notification.dedupe_key = 'reminder:' || reminder.id::text
    );

  update public.heartbeat_runs
  set
    status = 'completed',
    analyzed_items = analyzed_count,
    notifications_created = created_count,
    silent = created_count = 0,
    completed_at = now()
  where id = run_id;

  return jsonb_build_object(
    'run_id', run_id,
    'silent', created_count = 0,
    'notifications_created', created_count,
    'remaining_slots', greatest(available_slots - created_count, 0),
    'local_date', local_date
  );
exception when others then
  insert into public.heartbeat_runs (
    user_id,
    status,
    error,
    completed_at,
    metadata
  ) values (
    p_user_id,
    'failed',
    'heartbeat execution failed (' || sqlstate || ')',
    now(),
    jsonb_build_object('failure_code', sqlstate)
  );
  return jsonb_build_object(
    'failed', true,
    'failure_code', sqlstate
  );
end;
$$;
