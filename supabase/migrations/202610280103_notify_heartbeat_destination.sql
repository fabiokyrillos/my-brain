-- `NOTIFY-HEARTBEAT-DESTINATION` — the heartbeat's reminder notice points at
-- the reminder, not at the list.
--
-- ## Why this migration exists at all
--
-- ADR-143 corrected the PUSH path: the payload names the item and the service
-- worker builds the path. It recorded, explicitly, that this half was NOT
-- done, because the heartbeat builds its own destination here in SQL and that
-- needs a migration. ADR-144 authorises the one.
--
-- The need was found by a guard rather than by review. Phase 2S declined a
-- per-reminder destination with a stated reason — no such route existed, so it
-- would have been a link to nothing — and pinned the refusal to FAIL the
-- moment a route appeared. One appeared, and it fired.
--
-- ## What changes, and what deliberately does not
--
-- **One expression.** Everything else in this function is reproduced from
-- `202608240102` unchanged, and it was extracted mechanically rather than
-- retyped: `CREATE OR REPLACE` rewrites the whole body, and a stray edit
-- elsewhere would be a silent regression in the only automatic mechanism this
-- product has. `heartbeat-destination-parity.test.ts` asserts that the set of
-- differing lines is exactly the one expression below.
--
-- A reminder attached to a task opens the TASK — the reminder is about that
-- task's work, and the task surface says more than the reminder row does.
-- Without a task the reminder itself is the subject, and `app/reminders/[reminderId]`
-- now exists to be that subject's page.
--
-- Nothing else moves: no grant is added (`create or replace` keeps the
-- existing ones), `security definer` and the empty `search_path` are preserved
-- verbatim, and quiet hours, the daily cap, the cooldown and consent are
-- untouched. `notifications.action_url` carries no CHECK, so no vocabulary is
-- widened; and the application's `isOwnerScopedDestination` validates SHAPE —
-- a path, a locale segment, then `app` — which both new destinations satisfy,
-- so no application change accompanies this.
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
      -- THE ONE EXPRESSION THIS MIGRATION CHANGES. The task wins when there is
      -- one; otherwise the reminder's own page. Mirrors the shape Phase 2S
      -- already used for task notices rather than inventing a second one.
      case
        when reminder.task_id is not null then
          (case when user_locale = 'en' then '/en/app/work/' else '/pt-BR/app/work/' end)
            || reminder.task_id::text
        else
          (case when user_locale = 'en' then '/en/app/reminders/' else '/pt-BR/app/reminders/' end)
            || reminder.id::text
      end,
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
