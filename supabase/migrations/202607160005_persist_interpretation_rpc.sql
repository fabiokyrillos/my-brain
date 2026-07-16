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
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  interpretation_id uuid;
  entity_item jsonb;
  entity_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;

  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_extraction -> 'taskCandidates') <> 'array' then raise exception 'Invalid extraction payload'; end if;

  insert into public.entry_interpretations (
    user_id, entry_id, version, summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output
  ) values (
    current_user_id,
    p_entry_id,
    coalesce((select max(version) + 1 from public.entry_interpretations where entry_id = p_entry_id), 1),
    p_extraction ->> 'summary',
    coalesce(array(select jsonb_array_elements_text(p_extraction -> 'concepts')), array[]::text[]),
    coalesce(p_extraction -> 'contexts', '[]'::jsonb),
    coalesce(p_extraction -> 'organizations', '[]'::jsonb),
    coalesce(p_extraction -> 'projects', '[]'::jsonb),
    coalesce(p_extraction -> 'people', '[]'::jsonb),
    p_extraction -> 'taskCandidates',
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb),
    (p_extraction ->> 'confidence')::numeric,
    p_model,
    p_strategy_version,
    p_prompt_version,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_extraction
  ) returning id into interpretation_id;

  for entity_item in select value from jsonb_array_elements(coalesce(p_extraction -> 'contexts', '[]'::jsonb))
  loop
    insert into public.contexts (user_id, name, kind)
    values (
      current_user_id,
      entity_item ->> 'name',
      case lower(entity_item ->> 'name') when 'trabalho' then 'work' when 'work' then 'work' when 'pessoal' then 'personal' when 'personal' then 'personal' else 'custom' end
    )
    on conflict (user_id, lower(name)) do update set name = excluded.name
    returning id into entity_id;

    insert into public.entry_entities (user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence)
    values (current_user_id, p_entry_id, interpretation_id, 'context', entity_id, entity_item ->> 'evidence', (entity_item ->> 'confidence')::numeric);
  end loop;

  for entity_item in select value from jsonb_array_elements(coalesce(p_extraction -> 'organizations', '[]'::jsonb))
  loop
    insert into public.organizations (user_id, name)
    values (current_user_id, entity_item ->> 'name')
    on conflict (user_id, lower(name)) do update set name = excluded.name
    returning id into entity_id;

    insert into public.entry_entities (user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence)
    values (current_user_id, p_entry_id, interpretation_id, 'organization', entity_id, entity_item ->> 'evidence', (entity_item ->> 'confidence')::numeric);
  end loop;

  for entity_item in select value from jsonb_array_elements(coalesce(p_extraction -> 'projects', '[]'::jsonb))
  loop
    insert into public.projects (user_id, name)
    values (current_user_id, entity_item ->> 'name')
    on conflict (user_id, lower(name)) do update set name = excluded.name
    returning id into entity_id;

    insert into public.entry_entities (user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence)
    values (current_user_id, p_entry_id, interpretation_id, 'project', entity_id, entity_item ->> 'evidence', (entity_item ->> 'confidence')::numeric);
  end loop;

  for entity_item in select value from jsonb_array_elements(coalesce(p_extraction -> 'people', '[]'::jsonb))
  loop
    insert into public.people (user_id, name)
    values (current_user_id, entity_item ->> 'name')
    on conflict (user_id, lower(name)) do update set name = excluded.name
    returning id into entity_id;

    insert into public.entry_entities (user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence)
    values (current_user_id, p_entry_id, interpretation_id, 'person', entity_id, entity_item ->> 'evidence', (entity_item ->> 'confidence')::numeric);
  end loop;

  update public.entries
  set
    status = 'interpreted',
    occurred_at = (p_extraction ->> 'occurredAt')::timestamptz,
    is_retroactive = coalesce((p_extraction ->> 'isRetroactive')::boolean, false),
    processing_error = null
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
      'confidence', p_extraction -> 'confidence',
      'model', p_model,
      'strategy_version', p_strategy_version
    ),
    'Structured interpretation validated and persisted',
    p_entry_id
  );

  return interpretation_id;
end;
$$;

grant execute on function public.persist_entry_interpretation(uuid, jsonb, text, text, text, integer, integer) to authenticated;
revoke all on function public.persist_entry_interpretation(uuid, jsonb, text, text, text, integer, integer) from anon;
