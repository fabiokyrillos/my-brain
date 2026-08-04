-- Signup Hardening SH.3 -- the administrative boundary, and suspension's edges.
--
-- SH-ADMIN-001 (the three service_role-only transition functions),
-- SH-SUSPEND-001 (no client role and no PostgREST-reachable path sets
-- `suspended`), SH-SUSPEND-005 (no retroactive reminder burst after
-- reactivation), SH-SUSPEND-007 (operator transitions are audited with a closed
-- reason), SH-WORKER-001 (a job claimed before a suspension and executing after
-- it returns to the queue instead of failing), SH-EXPOSURE-008. ADR-075/ADR-077,
-- and ADR-078 for this migration's content beyond the plan's one-line
-- description.
--
-- ONE MIGRATION, WHICH IS SH.3'S WHOLE ALLOCATION
-- ---------------------------------------------------------------------------
-- The plan's sec. 1 gives SH.3 exactly one migration for "admin transition
-- functions + suspension worker/heartbeat predicate finalization". Everything
-- below is inside that description, and the two pieces that stretch it are
-- named rather than folded in (ADR-078):
--
--   * the reason vocabulary grows by two suspension reasons, because
--     SH-COPY-002 requires the suspended surface to show "the closed reason's
--     public label" -- a single reason has no label worth showing, and 070's
--     own comment reserved vocabulary growth for "the owning slice";
--   * `run_user_heartbeat` is replaced a second time, because SH-SUSPEND-005's
--     no-burst rule is a predicate inside its reminder branch and cannot live
--     anywhere else.
--
-- THE ADMINISTRATIVE BOUNDARY, STATED
-- ---------------------------------------------------------------------------
-- ADR-075: there is no product admin UI and no service-role HTTP endpoint. The
-- operator surface is `scripts/account-lifecycle-admin.mjs`, which holds the
-- service-role key it already has and calls exactly the functions below. Each
-- one is `SECURITY DEFINER` with an empty `search_path`, refuses any caller
-- whose JWT role claim is not `service_role`, validates the reason against a
-- per-verb allowlist, and reaches `account_lifecycle` through the SH.1 state
-- machine -- so the audit row of SH-LIFECYCLE-004 is written by the trigger,
-- unconditionally, and an administrative action without audit is structurally
-- impossible rather than procedurally forbidden (SH-ADMIN-004).
--
-- None of them takes a free-text reason. None of them returns or logs user
-- content: the readback is a status, a reason code and timestamps.

-- ---------------------------------------------------------------------------
-- 1. The reason vocabulary grows by exactly two -- SH-COPY-002's public labels
-- ---------------------------------------------------------------------------
--
-- `operator_suspension` stays and keeps its meaning (the generic "under
-- review"); the two additions let the operator state *why* within a closed set
-- the database enforces. Their public labels live in
-- `src/features/shell/lifecycle-copy.ts` and a unit test pins the two sets to
-- each other, so a code the database accepts can never reach the suspended
-- surface without a label -- and a label can never exist for a code the
-- database refuses.

alter table public.account_lifecycle
  drop constraint account_lifecycle_reason_code_check;

alter table public.account_lifecycle
  add constraint account_lifecycle_reason_code_check
  check (reason_code in (
    'initial_signup',
    'backfill',
    'user_deletion_request',
    'operator_suspension',
    'operator_suspension_abuse',
    'operator_suspension_security',
    'operator_reactivation',
    'operator_deletion_start',
    'deletion_reverted'
  ));

-- ---------------------------------------------------------------------------
-- 2. The readback -- SH-ADMIN-002's before/after, and the email resolution
-- ---------------------------------------------------------------------------
--
-- The CLI names an account by email or by id. Resolving an email needs
-- `auth.users`, which PostgREST does not expose and `service_role` cannot read
-- through the API, so the resolution is a DEFINER function -- service_role-only,
-- like everything else here. It returns the id and the lifecycle triple and
-- **nothing else**: no email, no display name, no product data. The operator
-- typed the email; echoing it back would be the only way this function could
-- print something it was not given.

create or replace function public.admin_account_lifecycle_status(
  p_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_id uuid;
  -- Not named `found`: that is plpgsql's own special variable, and shadowing it
  -- is the kind of cleverness that reads fine and breaks something else.
  lifecycle_row record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if (p_user_id is null) = (btrim(coalesce(p_email, '')) = '') then
    raise exception 'Name the account by exactly one of id or email'
      using errcode = '22023';
  end if;

  if p_user_id is not null then
    select users.id into resolved_id from auth.users as users where users.id = p_user_id;
  else
    select users.id into resolved_id
    from auth.users as users
    where lower(users.email) = lower(btrim(p_email));
  end if;

  if resolved_id is null then
    return jsonb_build_object('found', false);
  end if;

  select lifecycle.status, lifecycle.reason_code, lifecycle.changed_by, lifecycle.changed_at
  into lifecycle_row
  from public.account_lifecycle as lifecycle
  where lifecycle.user_id = resolved_id;

  return jsonb_build_object(
    'found', true,
    'user_id', resolved_id,
    'status', lifecycle_row.status,
    'reason_code', lifecycle_row.reason_code,
    'changed_by', lifecycle_row.changed_by,
    'changed_at', lifecycle_row.changed_at
  );
end;
$$;

revoke all on function public.admin_account_lifecycle_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_account_lifecycle_status(uuid, text) to service_role;

comment on function public.admin_account_lifecycle_status(uuid, text) is
  'SH-ADMIN-002. The operator CLI''s readback: resolves an account by id or email and returns its lifecycle triple. service_role-only. Returns no email, no display name and no product data -- the whole output is the state.';

-- ---------------------------------------------------------------------------
-- 3. Suspension -- SH-ADMIN-001, SH-SUSPEND-001/007
-- ---------------------------------------------------------------------------
--
-- Idempotent when the account is already suspended (a second `--apply` from a
-- retried runbook step is not an error), and it refuses `deleting -> suspended`
-- with the machine's own vocabulary rather than letting the trigger raise from
-- underneath -- so the operator gets a sentence about accounts, not a sentence
-- about triggers.

create or replace function public.suspend_account(
  p_user_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Account is required' using errcode = '22023';
  end if;
  if p_reason_code is null or p_reason_code not in (
    'operator_suspension',
    'operator_suspension_abuse',
    'operator_suspension_security'
  ) then
    raise exception 'Suspension reason is outside the closed set'
      using errcode = '22023', detail = 'ACCOUNT_LIFECYCLE_REASON_NOT_ALLOWED';
  end if;

  select lifecycle.status into before_status
  from public.account_lifecycle as lifecycle
  where lifecycle.user_id = p_user_id
  for update;

  if before_status is null then
    raise exception 'Account lifecycle state is missing'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_MISSING';
  end if;

  if before_status = 'suspended' then
    return jsonb_build_object(
      'user_id', p_user_id, 'before', before_status, 'after', 'suspended', 'changed', false
    );
  end if;

  if before_status <> 'active' then
    raise exception 'Only an active account can be suspended (it is %)', before_status
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_ILLEGAL_TRANSITION';
  end if;

  update public.account_lifecycle
  set status = 'suspended', reason_code = p_reason_code, changed_by = 'operator'
  where user_id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id, 'before', before_status, 'after', 'suspended',
    'reason_code', p_reason_code, 'changed', true
  );
end;
$$;

revoke all on function public.suspend_account(uuid, text) from public, anon, authenticated;
grant execute on function public.suspend_account(uuid, text) to service_role;

comment on function public.suspend_account(uuid, text) is
  'SH-ADMIN-001/SH-SUSPEND-001. Administrative suspension, service_role-only, reason from a closed per-verb set. Writes through the SH.1 machine so the audit row is unconditional. Idempotent when already suspended; refuses a deleting account.';

-- ---------------------------------------------------------------------------
-- 4. Reactivation -- SH-ADMIN-001, and the two returns are not interchangeable
-- ---------------------------------------------------------------------------
--
-- `suspended -> active` and `deleting -> active` are both "reactivation" in
-- English and are very different acts: the second one calls off a deletion the
-- user asked for. The reason code is therefore validated **against the current
-- status**, so an operator reverting a deletion has to say `deletion_reverted`
-- and cannot do it by muscle memory while typing the suspension reason.

create or replace function public.reactivate_account(
  p_user_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_status text;
  required_reason text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Account is required' using errcode = '22023';
  end if;

  select lifecycle.status into before_status
  from public.account_lifecycle as lifecycle
  where lifecycle.user_id = p_user_id
  for update;

  if before_status is null then
    raise exception 'Account lifecycle state is missing'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_MISSING';
  end if;

  if before_status = 'active' then
    return jsonb_build_object(
      'user_id', p_user_id, 'before', before_status, 'after', 'active', 'changed', false
    );
  end if;

  required_reason := case before_status
    when 'suspended' then 'operator_reactivation'
    when 'deleting' then 'deletion_reverted'
  end;

  if p_reason_code is distinct from required_reason then
    raise exception 'Reactivating a % account requires the % reason', before_status, required_reason
      using errcode = '22023', detail = 'ACCOUNT_LIFECYCLE_REASON_NOT_ALLOWED';
  end if;

  update public.account_lifecycle
  set status = 'active', reason_code = p_reason_code, changed_by = 'operator'
  where user_id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id, 'before', before_status, 'after', 'active',
    'reason_code', p_reason_code, 'changed', true
  );
end;
$$;

revoke all on function public.reactivate_account(uuid, text) from public, anon, authenticated;
grant execute on function public.reactivate_account(uuid, text) to service_role;

comment on function public.reactivate_account(uuid, text) is
  'SH-ADMIN-001/SH-SUSPEND-004. Administrative return to active, service_role-only. The reason is validated against the CURRENT status: operator_reactivation from suspended, deletion_reverted from deleting -- calling off a deletion cannot be done with the suspension reason. Queued jobs become claimable again with no operator re-enqueue.';

-- ---------------------------------------------------------------------------
-- 5. Administrative deletion-start -- SH-ADMIN-001
-- ---------------------------------------------------------------------------
--
-- This starts the lifecycle transition and NOTHING ELSE. The executor
-- (ADR-074) is self-only: it authorizes the Bearer token's own account and
-- accepts no target, so an operator cannot drive an erasure on somebody's
-- behalf and this function does not pretend otherwise. What it delivers is the
-- freeze -- every write refused, no job claimable, the surface closed -- with
-- the audit row that says who froze it and why. The runbook states the residual
-- in those words.

create or replace function public.begin_account_deletion_admin(
  p_user_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Account is required' using errcode = '22023';
  end if;
  if p_reason_code is distinct from 'operator_deletion_start' then
    raise exception 'Administrative deletion-start requires the operator_deletion_start reason'
      using errcode = '22023', detail = 'ACCOUNT_LIFECYCLE_REASON_NOT_ALLOWED';
  end if;

  select lifecycle.status into before_status
  from public.account_lifecycle as lifecycle
  where lifecycle.user_id = p_user_id
  for update;

  if before_status is null then
    raise exception 'Account lifecycle state is missing'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_MISSING';
  end if;

  if before_status = 'deleting' then
    return jsonb_build_object(
      'user_id', p_user_id, 'before', before_status, 'after', 'deleting', 'changed', false
    );
  end if;

  update public.account_lifecycle
  set status = 'deleting', reason_code = p_reason_code, changed_by = 'operator'
  where user_id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id, 'before', before_status, 'after', 'deleting',
    'reason_code', p_reason_code, 'changed', true
  );
end;
$$;

revoke all on function public.begin_account_deletion_admin(uuid, text)
  from public, anon, authenticated;
grant execute on function public.begin_account_deletion_admin(uuid, text) to service_role;

comment on function public.begin_account_deletion_admin(uuid, text) is
  'SH-ADMIN-001. Starts the deleting transition administratively from active or suspended. It freezes the account; it does not erase it -- the executor is self-only by ADR-074 and takes no target account. The pre-executor return path is reactivate_account with deletion_reverted (SH-DELETE-014).';

-- ---------------------------------------------------------------------------
-- 6. The worker's deferral -- SH-WORKER-001
-- ---------------------------------------------------------------------------
--
-- The claim predicates (SH-LIFECYCLE-006) keep a suspended owner's jobs
-- unclaimed, so the only way a suspended owner's job can be *executing* is the
-- narrow race: claimed while active, suspended a moment later. The handler
-- re-verifies at its ownership reload and calls this, which returns the row to
-- the queue.
--
-- Deliberately NOT `fail_job`: this is not a failure. `jobs.error` renders
-- verbatim on the Jobs page, `failed` is a state the user is told about, and
-- neither is true of "your account was suspended between two milliseconds".
-- The row goes back to `pending` with its lease cleared and is immediately
-- eligible -- and immediately unclaimable, because the claim predicate now sees
-- the suspension. On reactivation it is claimed with no operator re-enqueue
-- (SH-SUSPEND-004).
--
-- `attempts` is left exactly as the claim set it: the claim's own increment
-- stands and nothing further is burned, which is the whole of the requirement's
-- "no retry burned beyond the claim's own". The race can happen once per
-- suspension, not once per tick, precisely because the predicate stops the next
-- claim.
--
-- It refuses to defer a job whose owner IS active, so it can never be used as a
-- generic "put this back" primitive by a future handler having a bad day.

create or replace function public.defer_job_for_inactive_owner(
  p_job_id uuid,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  held public.jobs%rowtype;
  owner_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;

  select * into held
  from public.jobs as job
  where job.id = p_job_id
    and job.locked_by = btrim(p_worker_id)
    and job.status = 'running'
  for update;

  -- The existing "somebody else owns this row now" signal, unchanged in shape
  -- from `fail_job`: null, not an exception.
  if held.id is null then
    return null;
  end if;

  select lifecycle.status into owner_status
  from public.account_lifecycle as lifecycle
  where lifecycle.user_id = held.user_id;

  if owner_status = 'active' then
    raise exception 'The owner of this job is active; nothing to defer'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_ACTIVE';
  end if;

  update public.jobs
  set status = 'pending',
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      started_at = null,
      next_attempt_at = now()
  where id = held.id;

  -- Auditable, because an automatic decision that moves a user's work is
  -- exactly what ENGINEERING_STANDARDS requires to be auditable. Content-free:
  -- the job id and the owner's state, nothing from the payload.
  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    held.user_id,
    'job_deferred_inactive_owner',
    'job',
    held.id,
    'system',
    jsonb_build_object('status', 'running'),
    jsonb_build_object('status', 'pending', 'owner_status', coalesce(owner_status, 'absent')),
    'Job returned to the queue because its owner is not active'
  );

  return jsonb_build_object(
    'job_id', held.id,
    'status', 'deferred',
    'owner_status', coalesce(owner_status, 'absent'),
    'attempts', held.attempts
  );
end;
$$;

revoke all on function public.defer_job_for_inactive_owner(uuid, text)
  from public, anon, authenticated;
grant execute on function public.defer_job_for_inactive_owner(uuid, text) to service_role;

comment on function public.defer_job_for_inactive_owner(uuid, text) is
  'SH-WORKER-001. Returns a running job to the queue when its owner stopped being active after the claim. Not a failure: no jobs.error, no failed status, no extra attempt burned. Refuses when the owner is active. Returns null when the lease is no longer held, the fail_job signal.';

-- ---------------------------------------------------------------------------
-- 7. No retroactive reminder burst -- SH-SUSPEND-005
-- ---------------------------------------------------------------------------
--
-- SH-LIFECYCLE-007 already skips the heartbeat entirely while an account is not
-- active, so nothing fires during a suspension. The question this answers is
-- what happens on the FIRST heartbeat after reactivation, when every reminder
-- that came due during the suspension is `scheduled` and overdue.
--
-- The declared behavior: **reminders that came due while the account was not
-- active are never delivered retroactively.** They are not cancelled, not
-- rescheduled and not deleted -- the rows are untouched and stay visible in the
-- user's reminders list, where the user can act on them. What changes is only
-- that the heartbeat does not turn them into notifications after the fact.
--
-- The window is read from the lifecycle row itself: after a reactivation,
-- `changed_at` IS the moment the account became active again, and reminders due
-- before it are the ones the suspension swallowed. The predicate is gated on
-- the reason code so it applies to reactivated accounts ONLY -- an account that
-- has never transitioned (including every account the SH.1 backfill seeded,
-- whose `changed_at` is the migration's own run time) is completely unaffected.

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
      case when user_locale = 'en' then '/en/app/tasks' else '/pt-BR/app/tasks' end as action_url,
      case when task.manual_priority in ('urgent', 'high') then 'high' else 'normal' end as priority,
      'overdue:' || task.id::text || ':' || local_date::text as dedupe_key,
      task.due_at as event_time,
      case when task.manual_priority = 'urgent' then 4 when task.manual_priority = 'high' then 3 else 2 end as rank
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
      case when user_locale = 'en' then '/en/app/tasks' else '/pt-BR/app/tasks' end,
      'normal',
      'stale:' || task.id::text || ':' || local_date::text,
      task.updated_at,
      1
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
      case when reminder.important then 3 else 2 end
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

-- ---------------------------------------------------------------------------
-- 8. Postconditions -- SH-EXPOSURE-008, and SH-SUSPEND-001 as a catalog fact
-- ---------------------------------------------------------------------------

do $postcondition$
declare
  offender text;
  admin_function text;
begin
  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'admin_account_lifecycle_status',
        'suspend_account',
        'reactivate_account',
        'begin_account_deletion_admin',
        'defer_job_for_inactive_owner',
        'run_user_heartbeat'
      )
      and (
        not proc.prosecdef
        or proc.proconfig is null
        or not (proc.proconfig @> array['search_path=""'])
      )
  loop
    raise exception 'function % is not definer-with-empty-search-path', offender;
  end loop;

  -- SH-SUSPEND-001 / SH-ADMIN-001: no client role executes any of them, and
  -- service_role executes all of them. Both directions, because a missing grant
  -- would leave the operator with a runbook that cannot run.
  foreach admin_function in array array[
    'public.admin_account_lifecycle_status(uuid, text)',
    'public.suspend_account(uuid, text)',
    'public.reactivate_account(uuid, text)',
    'public.begin_account_deletion_admin(uuid, text)',
    'public.defer_job_for_inactive_owner(uuid, text)'
  ]
  loop
    if pg_catalog.has_function_privilege('anon', admin_function, 'execute')
      or pg_catalog.has_function_privilege('authenticated', admin_function, 'execute')
    then
      raise exception '% is reachable by a client role', admin_function;
    end if;
    if not pg_catalog.has_function_privilege('service_role', admin_function, 'execute') then
      raise exception '% is not executable by the operator boundary', admin_function;
    end if;
  end loop;

  -- The reason vocabulary grew by exactly the two SH.3 declared, and lost none.
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'account_lifecycle_reason_code_check'
      and conrelid = 'public.account_lifecycle'::regclass
      and pg_catalog.pg_get_constraintdef(oid) like '%operator_suspension_abuse%'
      and pg_catalog.pg_get_constraintdef(oid) like '%operator_suspension_security%'
      and pg_catalog.pg_get_constraintdef(oid) like '%initial_signup%'
      and pg_catalog.pg_get_constraintdef(oid) like '%user_deletion_request%'
      and pg_catalog.pg_get_constraintdef(oid) like '%deletion_reverted%'
  ) then
    raise exception 'the account_lifecycle reason vocabulary is not the declared set';
  end if;

  -- The table's client-write posture is unchanged by this migration: still no
  -- INSERT, UPDATE or DELETE for any client role, so the DEFINER functions above
  -- are genuinely the only administrative path (SH-SUSPEND-001).
  if pg_catalog.has_table_privilege('authenticated', 'public.account_lifecycle', 'update')
    or pg_catalog.has_table_privilege('anon', 'public.account_lifecycle', 'update')
  then
    raise exception 'a client role can write account_lifecycle directly';
  end if;
end;
$postcondition$;
