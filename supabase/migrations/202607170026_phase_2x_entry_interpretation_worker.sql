-- Phase 2X Slice 2X.4: entry-interpretation worker and automatic dispatch.
--
-- The Slice 2X.3 interpretation RPCs (begin_entry_interpretation,
-- fail_entry_interpretation, persist_entry_interpretation,
-- begin_entry_reprocessing, persist_reprocessed_entry_interpretation,
-- fail_entry_reprocessing) derive the acting user exclusively from
-- auth.uid(), which is null for a service-role caller with no end-user
-- session. A leased, unattended worker has no user session to attach, so it
-- cannot call these RPCs as originally shaped. This migration extends each
-- one, in place, with an optional trailing p_service_user_id parameter that
-- is honored only when the caller is service_role; the authenticated path
-- (auth.uid()) is completely unchanged for every existing caller. Each
-- function is dropped and recreated with the same name (matching the
-- existing project convention, e.g. migration 019's claim_attachment_job)
-- so there is exactly one overload afterward and no call-signature
-- ambiguity for the synchronous UI path.
--
-- It also adds the infrastructure for unattended scheduled dispatch: the
-- pg_net extension (supabase_vault is already enabled on this project) and
-- a per-minute cron job that invokes the process-jobs Edge Function in
-- "dispatch" mode. The job reads both the target URL and the dispatch
-- secret from Supabase Vault by name; neither value is embedded in this
-- migration or anywhere else in the repository, and the guarded SELECT
-- makes the cron tick a safe no-op until an operator populates both vault
-- secrets after deployment.

create extension if not exists pg_net;

-- 1. begin_entry_interpretation -------------------------------------------
drop function if exists public.begin_entry_interpretation(uuid);

create or replace function public.begin_entry_interpretation(
  p_entry_id uuid,
  p_service_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_entry public.entries%rowtype;
begin
  if p_service_user_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Service role required' using errcode = '42501';
    end if;
    current_user_id := p_service_user_id;
  else
    current_user_id := auth.uid();
  end if;
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into owned_entry from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.status not in ('saved', 'recoverable_error') then
    raise exception 'Entry cannot begin interpretation from its current state' using errcode = '55000';
  end if;
  update public.entries
  set status = 'interpreting', processing_error = null
  where id = p_entry_id and user_id = current_user_id;
  return jsonb_build_object('entry_id', p_entry_id, 'status', 'interpreting');
end;
$$;

revoke all on function public.begin_entry_interpretation(uuid, uuid) from public, anon;
grant execute on function public.begin_entry_interpretation(uuid, uuid) to authenticated, service_role;

-- 2. fail_entry_interpretation ---------------------------------------------
drop function if exists public.fail_entry_interpretation(uuid, text, boolean);

create or replace function public.fail_entry_interpretation(
  p_entry_id uuid,
  p_error text,
  p_terminal boolean default false,
  p_service_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_entry public.entries%rowtype;
  safe_error text := left(regexp_replace(coalesce(nullif(trim(p_error), ''), 'Interpretation unavailable. The original was preserved.'), '[\r\n\t]+', ' ', 'g'), 500);
  next_status text := case when coalesce(p_terminal, false) then 'terminal_error' else 'recoverable_error' end;
begin
  if p_service_user_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Service role required' using errcode = '42501';
    end if;
    current_user_id := p_service_user_id;
  else
    current_user_id := auth.uid();
  end if;
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into owned_entry from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  update public.entries
  set status = next_status, processing_error = safe_error
  where id = p_entry_id and user_id = current_user_id;
  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpretation_failed',
    'entry',
    p_entry_id,
    'system',
    jsonb_build_object('status', next_status),
    'Interpretation failed; bounded user-safe error persisted',
    p_entry_id
  );
  return jsonb_build_object('entry_id', p_entry_id, 'status', next_status, 'error', safe_error);
end;
$$;

revoke all on function public.fail_entry_interpretation(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.fail_entry_interpretation(uuid, text, boolean, uuid) to authenticated, service_role;

-- 3. persist_entry_interpretation -------------------------------------------
drop function if exists public.persist_entry_interpretation(uuid, jsonb, text, text, text, integer, integer);

create or replace function public.persist_entry_interpretation(
  p_entry_id uuid,
  p_extraction jsonb,
  p_model text,
  p_strategy_version text,
  p_prompt_version text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_service_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_entry public.entries%rowtype;
  parent_interpretation public.entry_interpretations%rowtype;
  interpretation_id uuid;
  next_version integer;
  interpreted_occurred_at timestamptz;
  trust jsonb;
  lifecycle_status text;
  overall_confidence numeric;
begin
  if p_service_user_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Service role required' using errcode = '42501';
    end if;
    current_user_id := p_service_user_id;
  else
    current_user_id := auth.uid();
  end if;
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_extraction) <> 'object'
    or jsonb_typeof(p_extraction -> 'concepts') <> 'array'
    or jsonb_typeof(p_extraction -> 'taskCandidates') <> 'array'
    or jsonb_typeof(coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb)) <> 'array'
  then
    raise exception 'Invalid extraction payload';
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;

  if owned_entry.current_interpretation_id is not null then
    select * into parent_interpretation
    from public.entry_interpretations
    where id = owned_entry.current_interpretation_id
      and entry_id = owned_entry.id
      and user_id = current_user_id;
  end if;

  interpreted_occurred_at := (p_extraction ->> 'occurredAt')::timestamptz;
  overall_confidence := least(1, greatest(0, coalesce((p_extraction ->> 'confidence')::numeric, 0)));
  trust := public.model_only_element_trust(overall_confidence);
  lifecycle_status := public.interpretation_lifecycle_status(
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb),
    trust,
    false
  );
  next_version := coalesce(parent_interpretation.version + 1, 1);

  insert into public.entry_interpretations (
    user_id, entry_id, version, parent_interpretation_id, origin,
    summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output,
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence
  ) values (
    current_user_id,
    p_entry_id,
    next_version,
    parent_interpretation.id,
    'ai_generated',
    p_extraction ->> 'summary',
    coalesce(array(select jsonb_array_elements_text(p_extraction -> 'concepts')), array[]::text[]),
    coalesce(p_extraction -> 'contexts', '[]'::jsonb),
    coalesce(p_extraction -> 'organizations', '[]'::jsonb),
    coalesce(p_extraction -> 'projects', '[]'::jsonb),
    coalesce(p_extraction -> 'people', '[]'::jsonb),
    p_extraction -> 'taskCandidates',
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb),
    overall_confidence,
    left(coalesce(nullif(trim(p_model), ''), 'unknown'), 160),
    left(coalesce(nullif(trim(p_strategy_version), ''), 'unknown'), 120),
    left(coalesce(nullif(trim(p_prompt_version), ''), 'unknown'), 120),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_extraction,
    jsonb_build_array(jsonb_build_object('value', interpreted_occurred_at, 'label', 'occurred_at')),
    '{"summary":"interpretation","concepts":"interpretation","occurredAt":"fact","entities":"interpretation"}'::jsonb,
    public.element_trust_scores(trust),
    public.element_trust_policies(trust),
    public.element_trust_evidence(trust)
  ) returning id into interpretation_id;

  perform public.persist_resolved_entry_entities(
    current_user_id, p_entry_id, interpretation_id, p_extraction, interpreted_occurred_at
  );
  perform public.persist_interpretation_questions(
    current_user_id,
    p_entry_id,
    interpretation_id,
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb)
  );

  update public.entries
  set
    current_interpretation_id = interpretation_id,
    status = lifecycle_status,
    occurred_at = interpreted_occurred_at,
    is_retroactive = coalesce((p_extraction ->> 'isRetroactive')::boolean, false),
    processing_error = null,
    reprocessing_key = null,
    reprocessing_started_at = null,
    reprocessing_lease_expires_at = null
  where id = p_entry_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpreted',
    'entry',
    p_entry_id,
    'agent',
    jsonb_build_object(
      'interpretation_id', interpretation_id,
      'version', next_version,
      'origin', 'ai_generated',
      'confidence', overall_confidence,
      'status', lifecycle_status,
      'model', p_model,
      'strategy_version', p_strategy_version
    ),
    'Structured interpretation validated and appended',
    p_entry_id
  );

  return interpretation_id;
end;
$$;

revoke all on function public.persist_entry_interpretation(uuid, jsonb, text, text, text, integer, integer, uuid) from public, anon;
grant execute on function public.persist_entry_interpretation(uuid, jsonb, text, text, text, integer, integer, uuid) to authenticated, service_role;

-- 4. begin_entry_reprocessing -------------------------------------------
drop function if exists public.begin_entry_reprocessing(uuid, text, integer);

create or replace function public.begin_entry_reprocessing(
  p_entry_id uuid,
  p_operation_key text,
  p_lease_seconds integer default 300,
  p_service_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_entry public.entries%rowtype;
  bounded_lease integer := least(900, greatest(60, coalesce(p_lease_seconds, 300)));
begin
  if p_service_user_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Service role required' using errcode = '42501';
    end if;
    current_user_id := p_service_user_id;
  else
    current_user_id := auth.uid();
  end if;
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_operation_key is null or char_length(trim(p_operation_key)) not between 8 and 200 then
    raise exception 'Invalid reprocessing operation key';
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.status = 'reprocessing'
    and owned_entry.reprocessing_key = trim(p_operation_key)
    and owned_entry.reprocessing_lease_expires_at > now()
  then
    return jsonb_build_object(
      'entry_id', p_entry_id,
      'status', 'reprocessing',
      'lease_expires_at', owned_entry.reprocessing_lease_expires_at,
      'idempotent', true
    );
  end if;
  if owned_entry.status = 'reprocessing'
    and owned_entry.reprocessing_lease_expires_at > now()
  then
    raise exception 'Entry is already being reprocessed' using errcode = '55P03';
  end if;

  update public.entries
  set
    status = 'reprocessing',
    processing_error = null,
    reprocessing_key = trim(p_operation_key),
    reprocessing_started_at = now(),
    reprocessing_lease_expires_at = now() + make_interval(secs => bounded_lease)
  where id = p_entry_id and user_id = current_user_id
  returning * into owned_entry;

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'status', owned_entry.status,
    'lease_expires_at', owned_entry.reprocessing_lease_expires_at,
    'idempotent', false
  );
end;
$$;

revoke all on function public.begin_entry_reprocessing(uuid, text, integer, uuid) from public, anon;
grant execute on function public.begin_entry_reprocessing(uuid, text, integer, uuid) to authenticated, service_role;

-- 5. persist_reprocessed_entry_interpretation -------------------------------------------
drop function if exists public.persist_reprocessed_entry_interpretation(uuid, text, jsonb, text, text, text, integer, integer, jsonb);

create or replace function public.persist_reprocessed_entry_interpretation(
  p_entry_id uuid,
  p_operation_key text,
  p_extraction jsonb,
  p_model text,
  p_strategy_version text,
  p_prompt_version text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_element_trust jsonb,
  p_service_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_entry public.entries%rowtype;
  parent_interpretation public.entry_interpretations%rowtype;
  existing_interpretation public.entry_interpretations%rowtype;
  new_interpretation_id uuid;
  new_version integer;
  interpreted_occurred_at timestamptz;
  lifecycle_status text;
  overall_confidence numeric;
  stored_operation_key text := 'reprocess:' || trim(coalesce(p_operation_key, ''));
begin
  if p_service_user_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Service role required' using errcode = '42501';
    end if;
    current_user_id := p_service_user_id;
  else
    current_user_id := auth.uid();
  end if;
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_operation_key is null or char_length(trim(p_operation_key)) not between 8 and 200 then
    raise exception 'Invalid reprocessing operation key';
  end if;

  select * into existing_interpretation
  from public.entry_interpretations
  where user_id = current_user_id
    and entry_id = p_entry_id
    and operation_key = stored_operation_key;
  if existing_interpretation.id is not null then
    return jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', existing_interpretation.id,
      'version', existing_interpretation.version,
      'origin', existing_interpretation.origin,
      'status', (select status from public.entries where id = p_entry_id and user_id = current_user_id),
      'idempotent', true
    );
  end if;

  if jsonb_typeof(p_extraction) <> 'object'
    or jsonb_typeof(p_extraction -> 'concepts') <> 'array'
    or jsonb_typeof(p_extraction -> 'taskCandidates') <> 'array'
    or jsonb_typeof(coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb)) <> 'array'
  then
    raise exception 'Invalid extraction payload';
  end if;
  perform public.validate_element_trust(p_element_trust);
  interpreted_occurred_at := (p_extraction ->> 'occurredAt')::timestamptz;
  select round(avg((value ->> 'score')::numeric), 3)
  into overall_confidence
  from jsonb_each(p_element_trust);
  lifecycle_status := public.interpretation_lifecycle_status(
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb), p_element_trust, false
  );

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.status <> 'reprocessing'
    or owned_entry.reprocessing_key is distinct from trim(p_operation_key)
    or owned_entry.reprocessing_lease_expires_at <= now()
  then
    raise exception 'Reprocessing lease is not owned or has expired' using errcode = '55P03';
  end if;
  if owned_entry.current_interpretation_id is not null then
    select * into parent_interpretation
    from public.entry_interpretations
    where id = owned_entry.current_interpretation_id
      and user_id = current_user_id
      and entry_id = p_entry_id;
  end if;
  new_version := coalesce(parent_interpretation.version + 1, 1);

  insert into public.entry_interpretations (
    user_id, entry_id, version, parent_interpretation_id, origin, operation_key,
    summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output,
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence
  ) values (
    current_user_id,
    p_entry_id,
    new_version,
    parent_interpretation.id,
    'ai_reprocessed',
    stored_operation_key,
    p_extraction ->> 'summary',
    coalesce(array(select jsonb_array_elements_text(p_extraction -> 'concepts')), array[]::text[]),
    coalesce(p_extraction -> 'contexts', '[]'::jsonb),
    coalesce(p_extraction -> 'organizations', '[]'::jsonb),
    coalesce(p_extraction -> 'projects', '[]'::jsonb),
    coalesce(p_extraction -> 'people', '[]'::jsonb),
    p_extraction -> 'taskCandidates',
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb),
    overall_confidence,
    left(coalesce(nullif(trim(p_model), ''), 'unknown'), 160),
    left(coalesce(nullif(trim(p_strategy_version), ''), 'unknown'), 120),
    left(coalesce(nullif(trim(p_prompt_version), ''), 'unknown'), 120),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_extraction,
    jsonb_build_array(jsonb_build_object('value', interpreted_occurred_at, 'label', 'occurred_at')),
    '{"summary":"interpretation","concepts":"interpretation","occurredAt":"fact","entities":"interpretation"}'::jsonb,
    public.element_trust_scores(p_element_trust),
    public.element_trust_policies(p_element_trust),
    public.element_trust_evidence(p_element_trust)
  ) returning id into new_interpretation_id;

  perform public.persist_resolved_entry_entities(
    current_user_id, p_entry_id, new_interpretation_id, p_extraction, interpreted_occurred_at
  );
  perform public.persist_interpretation_questions(
    current_user_id,
    p_entry_id,
    new_interpretation_id,
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb)
  );

  update public.entries
  set
    current_interpretation_id = new_interpretation_id,
    status = lifecycle_status,
    occurred_at = interpreted_occurred_at,
    is_retroactive = coalesce((p_extraction ->> 'isRetroactive')::boolean, false),
    processing_error = null,
    reprocessing_key = null,
    reprocessing_started_at = null,
    reprocessing_lease_expires_at = null
  where id = p_entry_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_reprocessed',
    'entry_interpretation',
    new_interpretation_id,
    'agent',
    case when parent_interpretation.id is null then null else jsonb_build_object(
      'interpretation_id', parent_interpretation.id, 'version', parent_interpretation.version
    ) end,
    jsonb_build_object(
      'interpretation_id', new_interpretation_id,
      'version', new_version,
      'origin', 'ai_reprocessed',
      'status', lifecycle_status,
      'model', p_model
    ),
    'User-requested AI reprocessing appended a new interpretation',
    p_entry_id
  );

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'interpretation_id', new_interpretation_id,
    'version', new_version,
    'origin', 'ai_reprocessed',
    'status', lifecycle_status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.persist_reprocessed_entry_interpretation(uuid, text, jsonb, text, text, text, integer, integer, jsonb, uuid) from public, anon;
grant execute on function public.persist_reprocessed_entry_interpretation(uuid, text, jsonb, text, text, text, integer, integer, jsonb, uuid) to authenticated, service_role;

-- 6. fail_entry_reprocessing -------------------------------------------
drop function if exists public.fail_entry_reprocessing(uuid, text, text);

create or replace function public.fail_entry_reprocessing(
  p_entry_id uuid,
  p_operation_key text,
  p_error text,
  p_service_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_entry public.entries%rowtype;
  safe_error text := left(regexp_replace(coalesce(nullif(trim(p_error), ''), 'Reprocessing unavailable. The original was preserved.'), '[\r\n\t]+', ' ', 'g'), 500);
begin
  if p_service_user_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Service role required' using errcode = '42501';
    end if;
    current_user_id := p_service_user_id;
  else
    current_user_id := auth.uid();
  end if;
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.status = 'recoverable_error' and owned_entry.reprocessing_key = trim(p_operation_key) then
    return jsonb_build_object('entry_id', p_entry_id, 'status', 'recoverable_error', 'idempotent', true);
  end if;
  if owned_entry.status <> 'reprocessing'
    or owned_entry.reprocessing_key is distinct from trim(p_operation_key)
    or owned_entry.reprocessing_lease_expires_at <= now()
  then
    raise exception 'Reprocessing lease is not owned or has expired' using errcode = '55P03';
  end if;

  update public.entries
  set
    status = 'recoverable_error',
    processing_error = safe_error,
    reprocessing_key = null,
    reprocessing_started_at = null,
    reprocessing_lease_expires_at = null
  where id = p_entry_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_reprocessing_failed',
    'entry',
    p_entry_id,
    'system',
    jsonb_build_object('status', 'recoverable_error'),
    'Reprocessing failed; bounded user-safe error persisted',
    p_entry_id
  );

  return jsonb_build_object('entry_id', p_entry_id, 'status', 'recoverable_error', 'error', safe_error, 'idempotent', false);
end;
$$;

revoke all on function public.fail_entry_reprocessing(uuid, text, text, uuid) from public, anon;
grant execute on function public.fail_entry_reprocessing(uuid, text, text, uuid) to authenticated, service_role;

-- 7. Scheduled dispatch: pg_net + Vault, no secret embedded in this repository.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'my-brain-entry-dispatch';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'my-brain-entry-dispatch',
    '* * * * *',
    $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'entry_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'entry_dispatch_secret')
      ),
      body := '{"mode":"dispatch"}'::jsonb,
      timeout_milliseconds := 55000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'entry_dispatch_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'entry_dispatch_secret');
    $cron$
  );
end;
$$;
