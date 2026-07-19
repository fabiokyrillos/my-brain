alter table public.jobs
  add column locked_at timestamptz,
  add column locked_by text,
  add column lease_expires_at timestamptz,
  add column failed_at timestamptz;

alter table public.jobs drop constraint jobs_status_check;
alter table public.jobs
  add constraint jobs_status_check
  check (status in ('pending', 'running', 'completed', 'failed', 'exhausted', 'cancelled'));

drop index if exists public.jobs_pending_idx;
create index jobs_eligible_idx
  on public.jobs (next_attempt_at, priority desc, created_at)
  where status in ('pending', 'failed');
create index jobs_expired_lease_idx
  on public.jobs (lease_expires_at)
  where status = 'running';

drop function if exists public.claim_attachment_job(uuid, uuid);

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
  from public.jobs
  where id = p_job_id
    and user_id = p_user_id
    and type = 'process_attachment'
    and status in ('pending', 'failed')
    and attempts < max_attempts
    and next_attempt_at <= now()
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

create or replace function public.complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed public.jobs%rowtype;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;

  update public.jobs
  set status = 'completed',
      result = coalesce(p_result, '{}'::jsonb),
      error = null,
      completed_at = now(),
      failed_at = null,
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = p_job_id
    and status = 'running'
    and locked_by = btrim(p_worker_id)
    and lease_expires_at > now()
  returning * into completed;

  if completed.id is null then
    return null;
  end if;
  return to_jsonb(completed);
end;
$$;

create or replace function public.fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_base_delay_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.jobs%rowtype;
  failed public.jobs%rowtype;
  safe_error text;
  next_status text;
  delay_seconds integer;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;
  if p_base_delay_seconds < 1 or p_base_delay_seconds > 3600 then
    raise exception 'Base retry delay must be between 1 and 3600 seconds' using errcode = '22023';
  end if;

  select * into claimed
  from public.jobs
  where id = p_job_id
    and status = 'running'
    and locked_by = btrim(p_worker_id)
    and lease_expires_at > now()
  for update;

  if claimed.id is null then
    return null;
  end if;

  safe_error := left(
    regexp_replace(
      coalesce(nullif(btrim(p_error), ''), 'Job processing failed'),
      '[[:cntrl:]]+',
      ' ',
      'g'
    ),
    500
  );
  next_status := case when claimed.attempts >= claimed.max_attempts then 'exhausted' else 'failed' end;
  delay_seconds := least(
    3600,
    (p_base_delay_seconds * power(2, greatest(claimed.attempts - 1, 0)))::integer
  );

  update public.jobs
  set status = next_status,
      error = safe_error,
      next_attempt_at = case
        when next_status = 'failed' then now() + make_interval(secs => delay_seconds)
        else next_attempt_at
      end,
      failed_at = case when next_status = 'exhausted' then now() else null end,
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = claimed.id
  returning * into failed;

  return to_jsonb(failed);
end;
$$;

create or replace function public.reap_expired_jobs(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_record public.jobs%rowtype;
  requeued_count integer := 0;
  exhausted_count integer := 0;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'Reaper limit must be between 1 and 1000' using errcode = '22023';
  end if;

  for job_record in
    select *
    from public.jobs
    where status = 'running'
      and (lease_expires_at is null or lease_expires_at <= now())
    order by coalesce(lease_expires_at, started_at, created_at)
    for update skip locked
    limit p_limit
  loop
    if job_record.attempts >= job_record.max_attempts then
      update public.jobs
      set status = 'exhausted',
          error = left(coalesce(error, 'Worker lease expired'), 500),
          failed_at = now(),
          locked_at = null,
          locked_by = null,
          lease_expires_at = null
      where id = job_record.id;
      exhausted_count := exhausted_count + 1;
    else
      update public.jobs
      set status = 'failed',
          error = left(coalesce(error, 'Worker lease expired'), 500),
          next_attempt_at = now(),
          failed_at = null,
          locked_at = null,
          locked_by = null,
          lease_expires_at = null
      where id = job_record.id;
      requeued_count := requeued_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'requeued', requeued_count,
    'exhausted', exhausted_count
  );
end;
$$;

create or replace function public.get_job_queue_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'running', count(*) filter (where status = 'running'),
    'failed', count(*) filter (where status = 'failed'),
    'exhausted', count(*) filter (where status = 'exhausted'),
    'completed', count(*) filter (where status = 'completed'),
    'cancelled', count(*) filter (where status = 'cancelled'),
    'expiredLeases', count(*) filter (
      where status = 'running' and (lease_expires_at is null or lease_expires_at <= now())
    )
  )
  from public.jobs;
$$;

revoke all on function public.claim_attachment_job(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.reap_expired_jobs(integer) from public, anon, authenticated;
revoke all on function public.get_job_queue_metrics() from public, anon, authenticated;
grant execute on function public.claim_attachment_job(uuid, uuid, text, integer) to service_role;
grant execute on function public.complete_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_job(uuid, text, text, integer) to service_role;
grant execute on function public.reap_expired_jobs(integer) to service_role;
grant execute on function public.get_job_queue_metrics() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'my-brain-job-reaper';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'my-brain-job-reaper',
    '* * * * *',
    'select public.reap_expired_jobs(100)'
  );
end;
$$;
