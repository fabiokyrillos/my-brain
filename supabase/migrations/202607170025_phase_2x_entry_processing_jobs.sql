-- Phase 2X Slice 2X.3: durable entry capture and entry-processing job contracts.
-- The current UI remains synchronous. These RPCs only persist/enqueue and do
-- not invoke AI or an Edge Function.

create or replace function private.is_valid_entry_interpretation_job_payload(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry_id_text text;
  mode_value text;
  operation_key_value text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return false;
  end if;
  if (p_payload - 'entry_id' - 'mode' - 'operation_key') <> '{}'::jsonb then
    return false;
  end if;

  entry_id_text := p_payload ->> 'entry_id';
  mode_value := p_payload ->> 'mode';
  operation_key_value := p_payload ->> 'operation_key';

  if entry_id_text is null
    or entry_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or mode_value not in ('initial', 'reprocess')
  then
    return false;
  end if;

  if mode_value = 'initial' then
    return not (p_payload ? 'operation_key');
  end if;

  return operation_key_value is not null
    and char_length(btrim(operation_key_value)) between 8 and 200;
end;
$$;

alter table public.jobs
  add constraint jobs_interpret_entry_payload_check
  check (
    type <> 'interpret_entry'
    or private.is_valid_entry_interpretation_job_payload(payload)
  );

create index jobs_interpret_entry_entry_idx
  on public.jobs (user_id, (payload ->> 'entry_id'), created_at desc)
  where type = 'interpret_entry';

create unique index jobs_active_interpret_entry_per_entry_idx
  on public.jobs (user_id, (payload ->> 'entry_id'))
  where type = 'interpret_entry'
    and status in ('pending', 'running', 'failed');

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
  created_entry public.entries%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
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

  insert into public.entries (
    user_id,
    original_content,
    source,
    status,
    locale
  ) values (
    current_user_id,
    normalized_content,
    p_source,
    'saved',
    p_locale
  ) returning * into created_entry;

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
    'entry_processing_enqueued',
    'entry',
    created_entry.id,
    'user',
    jsonb_build_object('mode', 'initial'),
    'Entry capture persisted and interpretation queued',
    created_entry.id
  );

  return jsonb_build_object(
    'entry_id', created_entry.id,
    'status', 'saved',
    'replayed', false
  );
end;
$$;

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

revoke all on function private.is_valid_entry_interpretation_job_payload(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.capture_entry_async(text, text, text, text) from public, anon, service_role;
revoke all on function public.enqueue_entry_reprocessing(uuid, text) from public, anon, service_role;
revoke all on function public.claim_entry_interpretation_job(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.claim_next_entry_interpretation_job(text, integer) from public, anon, authenticated;
grant execute on function public.capture_entry_async(text, text, text, text) to authenticated;
grant execute on function public.enqueue_entry_reprocessing(uuid, text) to authenticated;
grant execute on function public.claim_entry_interpretation_job(uuid, uuid, text, integer) to service_role;
grant execute on function public.claim_next_entry_interpretation_job(text, integer) to service_role;
