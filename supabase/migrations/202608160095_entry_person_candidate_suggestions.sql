-- Confirmable person suggestions for unmatched interpretation mentions.

create table public.entry_person_candidate_resolutions (
  interpretation_id uuid not null,
  candidate_index integer not null check (candidate_index >= 0 and candidate_index < 1000),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null,
  disposition text not null check (disposition in ('confirmed', 'rejected')),
  original_name text not null check (char_length(original_name) between 1 and 160),
  resolved_name text check (resolved_name is null or char_length(resolved_name) between 1 and 160),
  person_id uuid,
  person_created boolean not null default false,
  operation_key uuid not null,
  created_at timestamptz not null default now(),
  primary key (interpretation_id, candidate_index),
  foreign key (user_id, entry_id) references public.entries(user_id, id) on delete cascade,
  foreign key (user_id, interpretation_id) references public.entry_interpretations(user_id, id) on delete cascade,
  foreign key (user_id, person_id) references public.people(user_id, id) on delete restrict,
  check (
    (disposition = 'confirmed' and person_id is not null and resolved_name is not null)
    or (disposition = 'rejected' and person_id is null and resolved_name is null and not person_created)
  )
);

create index entry_person_candidate_resolutions_user_entry_idx
  on public.entry_person_candidate_resolutions(user_id, entry_id, created_at desc);
create index entry_person_candidate_resolutions_operation_idx
  on public.entry_person_candidate_resolutions(user_id, operation_key);

alter table public.entry_person_candidate_resolutions enable row level security;
alter table public.entry_person_candidate_resolutions force row level security;

create policy entry_person_candidate_resolutions_select_own
  on public.entry_person_candidate_resolutions
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.entry_person_candidate_resolutions from public, anon, authenticated, service_role;
grant select on table public.entry_person_candidate_resolutions to authenticated;

create or replace function private.undo_resolve_entry_person_candidates(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  link_ids uuid[] := '{}'::uuid[];
  created_person_ids uuid[] := '{}'::uuid[];
  deleted_links integer := 0;
  deleted_resolutions integer := 0;
  candidate_count integer := 0;
  candidate jsonb;
  created_person_id uuid;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;

  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'resolve_entry_person_candidates' then
    raise exception 'Unsupported undo operation' using errcode = '22023';
  end if;

  select coalesce(array_agg(value::text::uuid), '{}'::uuid[])
  into link_ids
  from jsonb_array_elements(coalesce(operation.after_state -> 'entry_entity_ids', '[]'::jsonb));

  delete from public.entry_entities
  where user_id = p_user_id and id = any(link_ids);
  get diagnostics deleted_links = row_count;

  select jsonb_array_length(coalesce(operation.after_state -> 'candidate_indexes', '[]'::jsonb))
  into candidate_count;

  delete from public.entry_person_candidate_resolutions
  where user_id = p_user_id
    and interpretation_id = operation.source_interpretation_id
    and operation_key = operation.operation_key::uuid;
  get diagnostics deleted_resolutions = row_count;

  if deleted_resolutions <> candidate_count then
    raise exception 'Person candidate undo integrity check failed'
      using errcode = 'P0001', detail = 'PERSON_CANDIDATE_UNDO_INTEGRITY';
  end if;

  select coalesce(array_agg(value::text::uuid), '{}'::uuid[])
  into created_person_ids
  from jsonb_array_elements(coalesce(operation.after_state -> 'created_person_ids', '[]'::jsonb));

  foreach created_person_id in array created_person_ids loop
    if not exists (select 1 from public.entry_entities where user_id = p_user_id and entity_type = 'person' and entity_id = created_person_id)
      and not exists (select 1 from public.entity_aliases where user_id = p_user_id and entity_type = 'person' and entity_id = created_person_id)
      and not exists (select 1 from public.task_people where user_id = p_user_id and person_id = created_person_id)
      and not exists (select 1 from public.tasks where user_id = p_user_id and waiting_on_person_id = created_person_id)
      and not exists (select 1 from public.person_relationships where user_id = p_user_id and (person_id = created_person_id or related_person_id = created_person_id))
      and not exists (select 1 from public.person_contexts where user_id = p_user_id and person_id = created_person_id)
      and not exists (select 1 from public.person_projects where user_id = p_user_id and person_id = created_person_id)
      and not exists (select 1 from public.memories where user_id = p_user_id and person_id = created_person_id)
    then
      delete from public.people where user_id = p_user_id and id = created_person_id;
    end if;
  end loop;

  update public.undo_operations
  set status = 'undone', undone_at = now()
  where id = operation.id and user_id = p_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'entry_person_candidates_undone',
    'person',
    'user',
    operation.after_state,
    jsonb_build_object(
      'operation_key', operation.operation_key,
      'resolution_count', deleted_resolutions,
      'entry_link_count', deleted_links
    ),
    'user_undo',
    operation.source_entry_id
  );

  return jsonb_build_object(
    'undone', true,
    'entry_id', operation.source_entry_id,
    'resolution_count', deleted_resolutions,
    'entry_link_count', deleted_links
  );
end;
$$;

revoke all on function private.undo_resolve_entry_person_candidates(uuid, uuid)
  from public, anon, authenticated, service_role;

insert into private.undo_operation_handlers(action_type, handler_function, description)
values (
  'resolve_entry_person_candidates',
  'undo_resolve_entry_person_candidates',
  'Remove candidate resolutions and source links; delete only newly created people that remain otherwise unused.'
)
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

create or replace function public.resolve_entry_person_candidates(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_resolutions jsonb,
  p_operation_key uuid
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
  existing_operation public.undo_operations%rowtype;
  canonical_resolutions jsonb;
  request_fingerprint text;
  resolution jsonb;
  candidate_index integer;
  disposition text;
  extracted_candidate jsonb;
  original_name text;
  resolved_name text;
  normalized_name text;
  candidate_confidence numeric(4,3);
  matching_person_ids uuid[];
  resolved_person_id uuid;
  created_person boolean;
  link_id uuid;
  undo_id uuid;
  result_items jsonb := '[]'::jsonb;
  entry_entity_ids jsonb := '[]'::jsonb;
  created_person_ids jsonb := '[]'::jsonb;
  candidate_indexes jsonb := '[]'::jsonb;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501', detail = 'AUTH_REQUIRED';
  end if;
  if p_entry_id is null or p_expected_interpretation_id is null or p_operation_key is null then
    raise exception 'Required identifier is missing' using errcode = '22023', detail = 'INVALID_PERSON_CANDIDATE_REQUEST';
  end if;
  if jsonb_typeof(p_resolutions) <> 'array' or jsonb_array_length(p_resolutions) < 1 or jsonb_array_length(p_resolutions) > 20 then
    raise exception 'Resolution list must contain between 1 and 20 items'
      using errcode = '22023', detail = 'INVALID_PERSON_CANDIDATE_REQUEST';
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then
    raise exception 'Entry not found' using errcode = 'P0002', detail = 'ENTRY_NOT_FOUND';
  end if;
  if owned_entry.current_interpretation_id is distinct from p_expected_interpretation_id then
    raise exception 'Interpretation is stale' using errcode = '40001', detail = 'STALE_INTERPRETATION';
  end if;

  select * into current_interpretation
  from public.entry_interpretations
  where id = p_expected_interpretation_id and entry_id = p_entry_id and user_id = current_user_id
  for share;
  if current_interpretation.id is null then
    raise exception 'Interpretation not found' using errcode = 'P0002', detail = 'CANDIDATE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_resolutions) item
    where jsonb_typeof(item) <> 'object'
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('candidateIndex', 'disposition', 'resolvedName'))
      or not (item ? 'candidateIndex')
      or not (item ? 'disposition')
  ) then
    raise exception 'Malformed person candidate resolution' using errcode = '22023', detail = 'INVALID_PERSON_CANDIDATE_REQUEST';
  end if;

  begin
    select jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'candidateIndex', (item ->> 'candidateIndex')::integer,
        'disposition', item ->> 'disposition',
        'resolvedName', case when item ? 'resolvedName' then btrim(regexp_replace(item ->> 'resolvedName', '\s+', ' ', 'g')) end
      )) order by (item ->> 'candidateIndex')::integer
    ) into canonical_resolutions
    from jsonb_array_elements(p_resolutions) item;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid candidate index' using errcode = '22023', detail = 'INVALID_PERSON_CANDIDATE_REQUEST';
  end;

  if exists (
    select 1 from jsonb_array_elements(canonical_resolutions) item
    where (item ->> 'candidateIndex')::integer < 0
      or item ->> 'disposition' not in ('confirmed', 'rejected')
      or (item ->> 'disposition' = 'rejected' and item ? 'resolvedName')
  ) or (
    select count(*) <> count(distinct (item ->> 'candidateIndex')::integer)
    from jsonb_array_elements(canonical_resolutions) item
  ) then
    raise exception 'Invalid or duplicate person candidate resolution'
      using errcode = '22023', detail = 'INVALID_PERSON_CANDIDATE_REQUEST';
  end if;

  request_fingerprint := md5(
    p_entry_id::text || ':' || p_expected_interpretation_id::text || ':' || canonical_resolutions::text
  );

  select * into existing_operation
  from public.undo_operations
  where user_id = current_user_id and operation_key = p_operation_key::text
  for update;
  if existing_operation.id is not null then
    if existing_operation.action_type <> 'resolve_entry_person_candidates'
      or existing_operation.request_fingerprint is distinct from request_fingerprint
    then
      raise exception 'Operation key already used for different input'
        using errcode = '23505', detail = 'PERSON_CANDIDATE_IDEMPOTENCY_MISMATCH';
    end if;
    return (existing_operation.after_state -> 'result') || jsonb_build_object('idempotent', true);
  end if;

  for resolution in select value from jsonb_array_elements(canonical_resolutions) loop
    candidate_index := (resolution ->> 'candidateIndex')::integer;
    disposition := resolution ->> 'disposition';
    extracted_candidate := current_interpretation.extracted_people -> candidate_index;
    if extracted_candidate is null or jsonb_typeof(extracted_candidate) <> 'object' then
      raise exception 'Candidate not found' using errcode = 'P0002', detail = 'CANDIDATE_NOT_FOUND';
    end if;
    original_name := btrim(regexp_replace(extracted_candidate ->> 'name', '\s+', ' ', 'g'));
    if original_name is null or char_length(original_name) < 1 or char_length(original_name) > 160 then
      raise exception 'Candidate name is invalid' using errcode = '22023', detail = 'INVALID_PERSON_NAME';
    end if;
    candidate_confidence := least(1, greatest(0, coalesce((extracted_candidate ->> 'confidence')::numeric, 0)));
    candidate_indexes := candidate_indexes || jsonb_build_array(candidate_index);

    if disposition = 'rejected' then
      insert into public.entry_person_candidate_resolutions (
        interpretation_id, candidate_index, user_id, entry_id, disposition,
        original_name, operation_key
      ) values (
        current_interpretation.id, candidate_index, current_user_id, p_entry_id, disposition,
        original_name, p_operation_key
      );
      result_items := result_items || jsonb_build_array(jsonb_build_object(
        'candidateIndex', candidate_index, 'disposition', disposition,
        'personId', null, 'outcome', 'ignored'
      ));
      continue;
    end if;

    resolved_name := coalesce(resolution ->> 'resolvedName', original_name);
    resolved_name := btrim(regexp_replace(resolved_name, '\s+', ' ', 'g'));
    if char_length(resolved_name) < 1 or char_length(resolved_name) > 160 then
      raise exception 'Resolved person name is invalid' using errcode = '22023', detail = 'INVALID_PERSON_NAME';
    end if;
    normalized_name := public.normalize_entity_alias(resolved_name);
    if char_length(normalized_name) < 1 then
      raise exception 'Resolved person name is invalid' using errcode = '22023', detail = 'INVALID_PERSON_NAME';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':person:' || normalized_name, 0));
    select coalesce(array_agg(distinct matched.person_id), '{}'::uuid[])
    into matching_person_ids
    from (
      select person.id as person_id
      from public.people person
      where person.user_id = current_user_id
        and public.normalize_entity_alias(person.name) = normalized_name
      union
      select alias.entity_id
      from public.entity_aliases alias
      where alias.user_id = current_user_id
        and alias.entity_type = 'person'
        and alias.normalized_alias = normalized_name
        and (alias.valid_from is null or alias.valid_from <= now())
        and (alias.valid_to is null or alias.valid_to >= now())
    ) matched;

    if cardinality(matching_person_ids) > 1 then
      raise exception 'Person match is ambiguous' using errcode = 'P0003', detail = 'AMBIGUOUS_PERSON_MATCH';
    end if;

    created_person := false;
    if cardinality(matching_person_ids) = 1 then
      resolved_person_id := matching_person_ids[1];
    else
      insert into public.people(user_id, name)
      values (current_user_id, resolved_name)
      on conflict do nothing
      returning id into resolved_person_id;
      if resolved_person_id is null then
        select id into resolved_person_id
        from public.people
        where user_id = current_user_id and lower(name) = lower(resolved_name);
      else
        created_person := true;
        created_person_ids := created_person_ids || jsonb_build_array(resolved_person_id);
      end if;
      if resolved_person_id is null then
        raise exception 'Person could not be resolved' using errcode = 'P0001', detail = 'PERSON_CREATE_RACE';
      end if;
    end if;

    insert into public.entry_entities(
      user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence
    ) values (
      current_user_id, p_entry_id, current_interpretation.id, 'person', resolved_person_id,
      original_name, candidate_confidence
    )
    on conflict (interpretation_id, entity_type, entity_id) do nothing
    returning id into link_id;
    if link_id is null then
      select id into link_id from public.entry_entities
      where interpretation_id = current_interpretation.id
        and entity_type = 'person' and entity_id = resolved_person_id and user_id = current_user_id;
    end if;
    entry_entity_ids := entry_entity_ids || jsonb_build_array(link_id);

    insert into public.entry_person_candidate_resolutions (
      interpretation_id, candidate_index, user_id, entry_id, disposition,
      original_name, resolved_name, person_id, person_created, operation_key
    ) values (
      current_interpretation.id, candidate_index, current_user_id, p_entry_id, disposition,
      original_name, resolved_name, resolved_person_id, created_person, p_operation_key
    );

    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'candidateIndex', candidate_index, 'disposition', disposition,
      'personId', resolved_person_id,
      'outcome', case when created_person then 'created' else 'linked_existing' end
    ));
  end loop;

  result := jsonb_build_object(
    'operationKey', p_operation_key,
    'results', result_items,
    'idempotent', false
  );

  insert into public.undo_operations(
    user_id, action_type, entity_type, entity_ids, before_state, after_state,
    operation_key, request_fingerprint, source_entry_id, source_interpretation_id
  ) values (
    current_user_id, 'resolve_entry_person_candidates', 'person',
    array(select (item ->> 'personId')::uuid from jsonb_array_elements(result_items) item where item ->> 'personId' is not null),
    jsonb_build_object('resolution_count', 0, 'entry_link_count', 0),
    jsonb_build_object(
      'candidate_indexes', candidate_indexes,
      'entry_entity_ids', entry_entity_ids,
      'created_person_ids', created_person_ids,
      'result', result
    ),
    p_operation_key::text, request_fingerprint, p_entry_id, current_interpretation.id
  ) returning id into undo_id;

  result := result || jsonb_build_object('undoId', undo_id);
  update public.undo_operations
  set after_state = jsonb_set(after_state, '{result}', result, true)
  where id = undo_id;

  insert into public.audit_logs(
    user_id, action_type, entity_type, actor, after_state, reason, source_entry_id
  ) values (
    current_user_id, 'entry_person_candidates_resolved', 'person', 'user',
    jsonb_build_object(
      'operation_key', p_operation_key,
      'resolution_count', jsonb_array_length(canonical_resolutions),
      'created_count', jsonb_array_length(created_person_ids),
      'linked_count', jsonb_array_length(entry_entity_ids)
    ),
    'explicit_user_confirmation', p_entry_id
  );

  return result;
exception
  when unique_violation then
    if sqlerrm like '%entry_person_candidate_resolutions%' then
      raise exception 'Candidate already resolved' using errcode = '23505', detail = 'PERSON_CANDIDATE_ALREADY_RESOLVED';
    end if;
    raise;
end;
$$;

revoke all on function public.resolve_entry_person_candidates(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_entry_person_candidates(uuid, uuid, jsonb, uuid)
  to authenticated;
