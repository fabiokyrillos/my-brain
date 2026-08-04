-- Signup Hardening SH.1, migration 2 of 2 -- the lifecycle predicate, wired.
--
-- SH-LIFECYCLE-005 (capture and reprocessing refuse), SH-LIFECYCLE-006 (all
-- three job-claim paths carry the identical predicate), SH-LIFECYCLE-007 (the
-- heartbeat skips before reading), SH-WORKER-003 (predicate identity is
-- asserted by a repository test over this file's text). ADR-073/ADR-077.
--
-- A second migration rather than a rider on the first, because it
-- create-or-replaces SIX existing functions and the plan's sec. 1 said the
-- count would be honest about that (the ADR-071 discipline). Every body below
-- is the previous definition reproduced in full with the lifecycle check
-- added -- capture_entry_async from 202608010068, enqueue_entry_reprocessing
-- and claim_entry_interpretation_job from 202607170025,
-- claim_next_entry_interpretation_job from 202608010069, claim_attachment_job
-- from 202607170019 (its FROM gains the alias 'job' so the shared predicate
-- text is identical across the three claim paths), run_user_heartbeat from
-- 202607170016. No signature changes (ADR-057: PostgreSQL cannot extend an
-- argument list with create-or-replace).
--
-- The refusal vocabulary: P0001 with detail ACCOUNT_LIFECYCLE_NOT_ACTIVE --
-- deliberately distinct from the throttle (SH.5) and quota (SH.6)
-- vocabularies to come, per SH-SUSPEND-009.


-- ---------------------------------------------------------------------------
-- 1. capture_entry_async -- SH-LIFECYCLE-005
-- ---------------------------------------------------------------------------

create or replace function public.capture_entry_async(
  p_original_content text,
  p_locale text,
  p_source text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_content text := btrim(coalesce(p_original_content, ''));
  normalized_key text := btrim(coalesce(p_idempotency_key, ''));
  job_key text;
  existing_job public.jobs%rowtype;
  existing_entry public.entries%rowtype;
  created_entry public.entries%rowtype;
  has_active_credential boolean;
  entry_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- SH-LIFECYCLE-005. The lifecycle refusal comes straight after
  -- authentication and before any other check or write: a non-active account
  -- gets the declared code and nothing else -- no partial write, no probe of
  -- the payload.
  if not exists (
    select 1
    from public.account_lifecycle lifecycle
    where lifecycle.user_id = current_user_id
      and lifecycle.status = 'active'
  ) then
    raise exception 'Account lifecycle does not permit this action'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_NOT_ACTIVE';
  end if;
  if char_length(normalized_content) not between 1 and 12000 then
    raise exception 'Invalid entry content' using errcode = '22023';
  end if;
  if p_locale is null or p_locale not in ('pt-BR', 'en') then
    raise exception 'Invalid entry locale' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('web', 'chat', 'whatsapp', 'gmail', 'calendar', 'import', 'api') then
    raise exception 'Invalid entry source' using errcode = '22023';
  end if;
  if char_length(normalized_key) not between 8 and 200 then
    raise exception 'Invalid capture idempotency key' using errcode = '22023';
  end if;

  job_key := 'entry-capture:' || normalized_key;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':' || job_key, 0)
  );

  select * into existing_job
  from public.jobs
  where user_id = current_user_id and idempotency_key = job_key;

  if existing_job.id is not null then
    if existing_job.type <> 'interpret_entry'
      or not private.is_valid_entry_interpretation_job_payload(existing_job.payload)
      or existing_job.payload ->> 'mode' <> 'initial'
    then
      raise exception 'Capture idempotency key conflicts with another operation' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'entry_id', existing_job.payload ->> 'entry_id',
      'status', 'saved',
      'replayed', true
    );
  end if;

  -- The second replay path, and the reason the column above exists. A capture
  -- that stored an entry without a job leaves no `jobs` row to recognise, so the
  -- entry is what carries the key.
  select * into existing_entry
  from public.entries
  where user_id = current_user_id and capture_idempotency_key = normalized_key;

  if existing_entry.id is not null then
    return jsonb_build_object(
      'entry_id', existing_entry.id,
      'status', 'saved',
      'replayed', true
    );
  end if;

  -- BYOK-CAPTURE-003. Read once, inside the transaction, and decide both the
  -- status and the job from the same answer -- so a key that is removed between
  -- the two would have to break this transaction's isolation to produce an
  -- entry that claims to be processing with no job behind it.
  select exists (
    select 1
    from public.user_ai_credentials as credential
    where credential.user_id = current_user_id
      and credential.status = 'active'
  ) into has_active_credential;

  entry_status := case when has_active_credential then 'saved' else 'awaiting_ai_configuration' end;

  insert into public.entries (
    user_id,
    original_content,
    source,
    status,
    locale,
    capture_idempotency_key
  ) values (
    current_user_id,
    normalized_content,
    p_source,
    entry_status,
    p_locale,
    normalized_key
  ) returning * into created_entry;

  if has_active_credential then
    insert into public.jobs (
      user_id,
      type,
      payload,
      idempotency_key
    ) values (
      current_user_id,
      'interpret_entry',
      jsonb_build_object(
        'entry_id', created_entry.id,
        'mode', 'initial'
      ),
      job_key
    );
  end if;

  -- The audit row is written in both branches, because "the entry was captured
  -- and nothing was queued" is exactly the kind of automatic decision
  -- ENGINEERING_STANDARDS requires to be auditable. Only the action type and the
  -- reason differ.
  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    case when has_active_credential
      then 'entry_processing_enqueued'
      else 'entry_awaiting_ai_configuration'
    end,
    'entry',
    created_entry.id,
    'user',
    jsonb_build_object('mode', 'initial', 'enqueued', has_active_credential),
    case when has_active_credential
      then 'Entry capture persisted and interpretation queued'
      else 'Entry capture persisted; no interpretation queued because the account has no active AI credential'
    end,
    created_entry.id
  );

  return jsonb_build_object(
    'entry_id', created_entry.id,
    'status', 'saved',
    'replayed', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. enqueue_entry_reprocessing -- SH-LIFECYCLE-005
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_entry_reprocessing(
  p_entry_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_operation_key text := btrim(coalesce(p_operation_key, ''));
  job_key text;
  owned_entry public.entries%rowtype;
  existing_job public.jobs%rowtype;
  active_job public.jobs%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- SH-LIFECYCLE-005. The lifecycle refusal comes straight after
  -- authentication and before any other check or write: a non-active account
  -- gets the declared code and nothing else -- no partial write, no probe of
  -- the payload.
  if not exists (
    select 1
    from public.account_lifecycle lifecycle
    where lifecycle.user_id = current_user_id
      and lifecycle.status = 'active'
  ) then
    raise exception 'Account lifecycle does not permit this action'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_NOT_ACTIVE';
  end if;
  if p_entry_id is null then
    raise exception 'Entry is required' using errcode = '22023';
  end if;
  if char_length(normalized_operation_key) not between 8 and 200 then
    raise exception 'Invalid reprocessing operation key' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':entry-reprocess:' || p_entry_id::text, 0)
  );

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;

  job_key := 'entry-reprocess:' || p_entry_id::text || ':' || normalized_operation_key;
  select * into existing_job
  from public.jobs
  where user_id = current_user_id and idempotency_key = job_key;
  if existing_job.id is not null then
    if existing_job.type <> 'interpret_entry'
      or not private.is_valid_entry_interpretation_job_payload(existing_job.payload)
      or existing_job.payload ->> 'mode' <> 'reprocess'
      or existing_job.payload ->> 'entry_id' <> p_entry_id::text
      or existing_job.payload ->> 'operation_key' <> normalized_operation_key
    then
      raise exception 'Reprocessing idempotency key conflicts with another operation' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'entry_id', p_entry_id,
      'status', 'queued',
      'replayed', true
    );
  end if;

  select * into active_job
  from public.jobs
  where user_id = current_user_id
    and type = 'interpret_entry'
    and payload ->> 'entry_id' = p_entry_id::text
    and status in ('pending', 'running', 'failed')
  for update;
  if active_job.id is not null then
    raise exception 'Entry processing is already queued' using errcode = '55P03';
  end if;

  insert into public.jobs (
    user_id,
    type,
    payload,
    idempotency_key
  ) values (
    current_user_id,
    'interpret_entry',
    jsonb_build_object(
      'entry_id', p_entry_id,
      'mode', 'reprocess',
      'operation_key', normalized_operation_key
    ),
    job_key
  );

  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'entry_reprocessing_enqueued',
    'entry',
    p_entry_id,
    'user',
    jsonb_build_object('mode', 'reprocess'),
    'Entry reprocessing queued without changing the current interpretation',
    p_entry_id
  );

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'status', 'queued',
    'replayed', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. claim_entry_interpretation_job -- SH-LIFECYCLE-006
-- ---------------------------------------------------------------------------

create or replace function public.claim_entry_interpretation_job(
  p_job_id uuid,
  p_user_id uuid,
  p_worker_id text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.jobs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_worker_id is null or btrim(p_worker_id) = '' or char_length(btrim(p_worker_id)) > 128 then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Lease duration must be between 30 and 900 seconds' using errcode = '22023';
  end if;

  select * into claimed
  from public.jobs job
  where job.id = p_job_id
    and job.user_id = p_user_id
    and job.type = 'interpret_entry'
    and private.is_valid_entry_interpretation_job_payload(job.payload)
    and job.status in ('pending', 'failed')
    and job.attempts < job.max_attempts
    and job.next_attempt_at <= now()
    and exists (
      select 1
      from public.entries entry
      where entry.id = (job.payload ->> 'entry_id')::uuid
        and entry.user_id = job.user_id
    )
    -- SH-LIFECYCLE-006 / SH-WORKER-003: the same lifecycle predicate on every
    -- claim path, so the direct path and the scheduled drain cannot disagree
    -- (the asymmetry 202608010069 documents for credentials, not repeated as
    -- a hole).
    and exists (
      select 1
      from public.account_lifecycle lifecycle
      where lifecycle.user_id = job.user_id
        and lifecycle.status = 'active'
    )
  for update skip locked;

  if claimed.id is null then
    return null;
  end if;

  update public.jobs
  set status = 'running',
      attempts = attempts + 1,
      started_at = now(),
      locked_at = now(),
      locked_by = btrim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      failed_at = null
  where id = claimed.id
  returning * into claimed;

  return to_jsonb(claimed);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. claim_next_entry_interpretation_job -- SH-LIFECYCLE-006
-- ---------------------------------------------------------------------------

create or replace function public.claim_next_entry_interpretation_job(
  p_worker_id text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.jobs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_worker_id is null or btrim(p_worker_id) = '' or char_length(btrim(p_worker_id)) > 128 then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Lease duration must be between 30 and 900 seconds' using errcode = '22023';
  end if;

  select * into selected_job
  from public.jobs job
  where job.type = 'interpret_entry'
    and private.is_valid_entry_interpretation_job_payload(job.payload)
    and job.status in ('pending', 'failed')
    and job.attempts < job.max_attempts
    and job.next_attempt_at <= now()
    and exists (
      select 1
      from public.entries entry
      where entry.id = (job.payload ->> 'entry_id')::uuid
        and entry.user_id = job.user_id
    )
    -- BYOK-JOBS-002. The owner comes from the job row, as everywhere else in
    -- this chain, and `active` is the only status that counts -- `invalid` and
    -- `removed` are the same outcome as absent (BYOK-RESOLVER-005).
    and exists (
      select 1
      from public.user_ai_credentials credential
      where credential.user_id = job.user_id
        and credential.status = 'active'
    )
    -- SH-LIFECYCLE-006 / SH-WORKER-003: the same lifecycle predicate on every
    -- claim path, so the direct path and the scheduled drain cannot disagree
    -- (the asymmetry 202608010069 documents for credentials, not repeated as
    -- a hole).
    and exists (
      select 1
      from public.account_lifecycle lifecycle
      where lifecycle.user_id = job.user_id
        and lifecycle.status = 'active'
    )
  order by job.priority desc, job.next_attempt_at, job.created_at
  for update skip locked
  limit 1;

  if selected_job.id is null then
    return null;
  end if;

  return public.claim_entry_interpretation_job(
    selected_job.id,
    selected_job.user_id,
    p_worker_id,
    p_lease_seconds
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. claim_attachment_job -- SH-LIFECYCLE-006
-- ---------------------------------------------------------------------------

create or replace function public.claim_attachment_job(
  p_job_id uuid,
  p_user_id uuid,
  p_worker_id text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.jobs%rowtype;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' or length(p_worker_id) > 128 then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Lease duration must be between 30 and 900 seconds' using errcode = '22023';
  end if;

  select * into claimed
  from public.jobs job
  where id = p_job_id
    and user_id = p_user_id
    and type = 'process_attachment'
    and status in ('pending', 'failed')
    and attempts < max_attempts
    and next_attempt_at <= now()
    -- SH-LIFECYCLE-006 / SH-WORKER-003: the same lifecycle predicate on every
    -- claim path, so the direct path and the scheduled drain cannot disagree
    -- (the asymmetry 202608010069 documents for credentials, not repeated as
    -- a hole).
    and exists (
      select 1
      from public.account_lifecycle lifecycle
      where lifecycle.user_id = job.user_id
        and lifecycle.status = 'active'
    )
  for update skip locked;

  if claimed.id is null then
    return null;
  end if;

  update public.jobs
  set status = 'running',
      attempts = attempts + 1,
      started_at = now(),
      locked_at = now(),
      locked_by = btrim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      failed_at = null
  where id = claimed.id
  returning * into claimed;

  return to_jsonb(claimed);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. run_user_heartbeat -- SH-LIFECYCLE-007
-- ---------------------------------------------------------------------------

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
begin
  if not pg_try_advisory_xact_lock(hashtextextended('my-brain-heartbeat:' || p_user_id::text, 0)) then
    return jsonb_build_object('skipped', true, 'reason', 'already-running');
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  -- SH-LIFECYCLE-007: a non-active user is skipped before any read of their
  -- data, and run_all_heartbeats therefore does no work for them. A skip, not
  -- an error: one user's suspension never breaks the batch.
  if not exists (
    select 1
    from public.account_lifecycle lifecycle
    where lifecycle.user_id = p_user_id
      and lifecycle.status = 'active'
  ) then
    return jsonb_build_object('skipped', true, 'reason', 'account-not-active');
  end if;

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
-- Postconditions -- SH-EXPOSURE-008's catalog assertions for every function
-- this migration replaced
-- ---------------------------------------------------------------------------

do $postcondition$
declare
  offender text;
begin
  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'capture_entry_async',
        'enqueue_entry_reprocessing',
        'claim_entry_interpretation_job',
        'claim_next_entry_interpretation_job',
        'claim_attachment_job',
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

  -- The claim functions and the heartbeat stay service_role-only; capture and
  -- reprocessing stay authenticated. Replacing a function preserves its ACL,
  -- but that is exactly the kind of fact a postcondition states rather than
  -- trusts.
  if pg_catalog.has_function_privilege('authenticated', 'public.claim_entry_interpretation_job(uuid, uuid, text, integer)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.claim_next_entry_interpretation_job(text, integer)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.claim_attachment_job(uuid, uuid, text, integer)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.run_user_heartbeat(uuid)', 'execute')
  then
    raise exception 'a worker-only function is executable by authenticated';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.capture_entry_async(text, text, text, text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.enqueue_entry_reprocessing(uuid, text)', 'execute')
  then
    raise exception 'a capture surface lost its authenticated EXECUTE';
  end if;
end;
$postcondition$;
