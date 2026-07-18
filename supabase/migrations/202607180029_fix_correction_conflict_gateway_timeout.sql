-- Hotfix: correct_entry_interpretation's version-conflict path raises
-- SQLSTATE 40001 (serialization_failure). Slice 2X.7 independently confirmed
-- — via a raw fetch() against the linked project's REST endpoint, with no
-- application code involved on either side — that any RPC raising 40001 on
-- this platform hangs the request until the gateway times out instead of
-- returning a response. This predates 2X.7, was not introduced by it, and
-- was deliberately left unfixed there because the file was outside that
-- slice's scope (see ADR-025, TODO.md, SECURITY.md). This migration is that
-- deferred fix and touches nothing else.
--
-- The only change is the SQLSTATE on the single existing version-conflict
-- raise, replaced with 55P03 (lock_not_available) — the same code Slice
-- 2X.7 already validated as fast and correct in production, used by
-- begin_entry_reprocessing's "already being reprocessed" conflict and by
-- confirm_entry_task_candidates' "interpretation is no longer current"
-- conflict. Every other line of correct_entry_interpretation (signature,
-- ownership checks, optimistic-concurrency comparison itself, patch
-- validation, entity-link validation, insert/update/audit/undo writes, and
-- the idempotent-replay short-circuit) is copied verbatim from its current
-- authoritative definition in migration 202607170028.

create or replace function public.correct_entry_interpretation(
  p_entry_id uuid,
  p_expected_version integer,
  p_patch jsonb,
  p_operation_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  current_interpretation public.entry_interpretations%rowtype;
  existing_interpretation public.entry_interpretations%rowtype;
  new_interpretation_id uuid;
  new_version integer;
  undo_id uuid;
  link jsonb;
  link_type text;
  link_id uuid;
  link_count integer;
  distinct_link_count integer;
  interpreted_occurred_at timestamptz;
  overall_confidence numeric;
  element_trust jsonb;
  lifecycle_status text;
  record_only boolean;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_operation_key is null or char_length(trim(p_operation_key)) not between 8 and 240 then
    raise exception 'Invalid operation key';
  end if;

  select * into existing_interpretation
  from public.entry_interpretations
  where user_id = current_user_id
    and entry_id = p_entry_id
    and operation_key = trim(p_operation_key);
  if existing_interpretation.id is not null then
    select id into undo_id
    from public.undo_operations
    where user_id = current_user_id
      and result_interpretation_id = existing_interpretation.id
      and action_type = 'correct_entry_interpretation'
    order by created_at desc
    limit 1;
    return jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', existing_interpretation.id,
      'version', existing_interpretation.version,
      'undo_id', undo_id,
      'status', (select status from public.entries where id = p_entry_id and user_id = current_user_id),
      'idempotent', true
    );
  end if;

  if jsonb_typeof(p_patch) <> 'object'
    or nullif(trim(p_patch ->> 'summary'), '') is null
    or char_length(p_patch ->> 'summary') > 2000
    or jsonb_typeof(p_patch -> 'concepts') <> 'array'
    or jsonb_array_length(p_patch -> 'concepts') not between 1 and 30
    or jsonb_typeof(p_patch -> 'extractedDates') <> 'array'
    or jsonb_array_length(p_patch -> 'extractedDates') > 30
    or jsonb_typeof(p_patch -> 'entityLinks') <> 'array'
    or jsonb_array_length(p_patch -> 'entityLinks') > 100
    or jsonb_typeof(p_patch -> 'classifications') <> 'object'
    or jsonb_typeof(p_patch -> 'pendingQuestions') <> 'array'
    or jsonb_array_length(p_patch -> 'pendingQuestions') > 30
  then
    raise exception 'Invalid interpretation patch';
  end if;
  if exists (
    select 1 from jsonb_each_text(p_patch -> 'classifications')
    where value not in ('fact', 'interpretation', 'inference', 'suggestion')
  ) then
    raise exception 'Invalid element classification';
  end if;
  if (select count(*) from jsonb_object_keys(p_patch -> 'classifications')) > 12 then
    raise exception 'Too many element classifications';
  end if;

  element_trust := p_patch -> 'elementTrust';
  perform public.validate_element_trust(element_trust);
  interpreted_occurred_at := (p_patch ->> 'occurredAt')::timestamptz;
  record_only := coalesce((p_patch ->> 'recordOnly')::boolean, false);
  select round(avg((value ->> 'score')::numeric), 3)
  into overall_confidence
  from jsonb_each(element_trust);

  select count(*), count(distinct (value ->> 'entityType') || ':' || (value ->> 'entityId'))
  into link_count, distinct_link_count
  from jsonb_array_elements(p_patch -> 'entityLinks');
  if link_count <> distinct_link_count then raise exception 'Duplicate entity link'; end if;

  for link in select value from jsonb_array_elements(p_patch -> 'entityLinks')
  loop
    link_type := link ->> 'entityType';
    if link_type not in ('context', 'organization', 'project', 'person') then
      raise exception 'Invalid entity type';
    end if;
    link_id := (link ->> 'entityId')::uuid;
    if not public.entity_is_owned(current_user_id, link_type, link_id) then
      raise exception 'Related entity does not belong to the entry owner' using errcode = '42501';
    end if;
    if nullif(trim(link ->> 'mention'), '') is null
      or char_length(link ->> 'mention') > 500
      or (link ->> 'confidence')::numeric not between 0 and 1
    then
      raise exception 'Invalid entity link evidence';
    end if;
  end loop;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.current_interpretation_id is null then
    raise exception 'Current interpretation not found' using errcode = 'P0002';
  end if;

  select * into current_interpretation
  from public.entry_interpretations
  where id = owned_entry.current_interpretation_id
    and user_id = current_user_id
    and entry_id = p_entry_id;
  if current_interpretation.id is null then raise exception 'Current interpretation not found' using errcode = 'P0002'; end if;
  if current_interpretation.version <> p_expected_version then
    -- Hotfix: the prior serialization-failure SQLSTATE class for this
    -- conflict hung every request on this platform until gateway timeout
    -- instead of returning. This lock-not-available code already returns
    -- promptly in production for the equivalent conflicts in
    -- begin_entry_reprocessing and confirm_entry_task_candidates.
    raise exception 'Interpretation changed; reload before saving' using errcode = '55P03';
  end if;

  new_version := current_interpretation.version + 1;
  lifecycle_status := public.interpretation_lifecycle_status(
    p_patch -> 'pendingQuestions', element_trust, record_only
  );

  insert into public.entry_interpretations (
    user_id, entry_id, version, parent_interpretation_id, origin, corrected_by,
    correction_reason, operation_key, summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output,
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence,
    is_record_only
  ) values (
    current_user_id,
    p_entry_id,
    new_version,
    current_interpretation.id,
    'user_corrected',
    current_user_id,
    nullif(left(trim(coalesce(p_reason, '')), 500), ''),
    trim(p_operation_key),
    trim(p_patch ->> 'summary'),
    array(select jsonb_array_elements_text(p_patch -> 'concepts')),
    current_interpretation.extracted_contexts,
    current_interpretation.extracted_organizations,
    current_interpretation.extracted_projects,
    current_interpretation.extracted_people,
    current_interpretation.task_candidates,
    p_patch -> 'pendingQuestions',
    overall_confidence,
    current_interpretation.model,
    current_interpretation.strategy_version,
    current_interpretation.prompt_version,
    0,
    0,
    current_interpretation.raw_output || jsonb_build_object(
      'summary', trim(p_patch ->> 'summary'),
      'concepts', p_patch -> 'concepts',
      'occurredAt', interpreted_occurred_at,
      'isRetroactive', interpreted_occurred_at < owned_entry.created_at,
      'pendingQuestions', p_patch -> 'pendingQuestions'
    ),
    p_patch -> 'extractedDates',
    p_patch -> 'classifications',
    public.element_trust_scores(element_trust),
    public.element_trust_policies(element_trust),
    public.element_trust_evidence(element_trust),
    record_only
  ) returning id into new_interpretation_id;

  for link in select value from jsonb_array_elements(p_patch -> 'entityLinks')
  loop
    insert into public.entry_entities (
      user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence
    ) values (
      current_user_id,
      p_entry_id,
      new_interpretation_id,
      link ->> 'entityType',
      (link ->> 'entityId')::uuid,
      trim(link ->> 'mention'),
      (link ->> 'confidence')::numeric
    );
  end loop;
  perform public.persist_interpretation_questions(
    current_user_id, p_entry_id, new_interpretation_id, p_patch -> 'pendingQuestions'
  );

  update public.entries
  set
    current_interpretation_id = new_interpretation_id,
    status = lifecycle_status,
    occurred_at = interpreted_occurred_at,
    is_retroactive = interpreted_occurred_at < created_at,
    processing_error = null
  where id = p_entry_id and user_id = current_user_id;

  insert into public.undo_operations (
    user_id, action_type, entity_type, entity_ids, before_state, after_state,
    operation_key, source_entry_id, source_interpretation_id, result_interpretation_id
  ) values (
    current_user_id,
    'correct_entry_interpretation',
    'entry_interpretation',
    array[new_interpretation_id],
    jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', current_interpretation.id,
      'version', current_interpretation.version
    ),
    jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', new_interpretation_id,
      'version', new_version
    ),
    'correction:' || trim(p_operation_key),
    p_entry_id,
    current_interpretation.id,
    new_interpretation_id
  ) returning id into undo_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpretation_corrected',
    'entry_interpretation',
    new_interpretation_id,
    'user',
    jsonb_build_object('interpretation_id', current_interpretation.id, 'version', current_interpretation.version),
    jsonb_build_object(
      'interpretation_id', new_interpretation_id,
      'version', new_version,
      'status', lifecycle_status,
      'record_only', record_only,
      'changed_fields', jsonb_build_array('summary', 'concepts', 'occurredAt', 'extractedDates', 'entityLinks', 'classifications', 'pendingQuestions')
    ),
    coalesce(nullif(left(trim(coalesce(p_reason, '')), 500), ''), 'User corrected an interpretation'),
    p_entry_id
  );

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'interpretation_id', new_interpretation_id,
    'version', new_version,
    'undo_id', undo_id,
    'status', lifecycle_status,
    'idempotent', false
  );
end;
$$;

do $verification$
declare
  definition text := pg_get_functiondef('public.correct_entry_interpretation(uuid,integer,jsonb,text,text)'::regprocedure);
begin
  if position('errcode = ''40001''' in definition) > 0 then
    raise exception 'correct_entry_interpretation still raises the gateway-hanging SQLSTATE 40001';
  end if;
  if position('errcode = ''55P03''' in definition) = 0 then
    raise exception 'correct_entry_interpretation did not adopt the replacement SQLSTATE 55P03';
  end if;
end;
$verification$;
