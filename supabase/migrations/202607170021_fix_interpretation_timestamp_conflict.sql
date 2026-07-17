-- Fix the Phase 2B PL/pgSQL timestamp variable/column ambiguity without
-- changing the applied migration 020. Each definition is identical to 020
-- except that the local value is named interpreted_occurred_at.

create or replace function public.persist_entry_interpretation(
  p_entry_id uuid,
  p_extraction jsonb,
  p_model text,
  p_strategy_version text,
  p_prompt_version text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  parent_interpretation public.entry_interpretations%rowtype;
  interpretation_id uuid;
  next_version integer;
  interpreted_occurred_at timestamptz;
  trust jsonb;
  lifecycle_status text;
  overall_confidence numeric;
begin
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
    raise exception 'Interpretation changed; reload before saving' using errcode = '40001';
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
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence
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
    public.element_trust_evidence(element_trust)
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

create or replace function public.persist_reprocessed_entry_interpretation(
  p_entry_id uuid,
  p_operation_key text,
  p_extraction jsonb,
  p_model text,
  p_strategy_version text,
  p_prompt_version text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_element_trust jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
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

do $verification$
declare signature regprocedure;
begin
  for signature in
    select unnest(array[
      'public.persist_entry_interpretation(uuid,jsonb,text,text,text,integer,integer)'::regprocedure,
      'public.correct_entry_interpretation(uuid,integer,jsonb,text,text)'::regprocedure,
      'public.persist_reprocessed_entry_interpretation(uuid,text,jsonb,text,text,text,integer,integer,jsonb)'::regprocedure
    ])
  loop
    if position('occurred_at = occurred_at' in pg_get_functiondef(signature)) > 0 then
      raise exception 'Timestamp ambiguity remains in %', signature;
    end if;
  end loop;
end;
$verification$;
