-- Phase 2C.1: editable core candidate confirmation.
--
-- The request fingerprint is the lowercase SHA-256 hex digest of this jsonb
-- value (whose text representation is deterministic in PostgreSQL):
-- {
--   "entryId": uuid,
--   "interpretationId": uuid,
--   "selectedCandidateIndexes": [integer, ...],
--   "candidateEdits": [
--     {
--       "candidateIndex": integer,
--       "changes": {"title"?: text, "description"?: text|null, "dueAt"?: text|null}
--     }, ...
--   ]
-- }
-- Selected indices and edit objects are sorted by candidate index. Values
-- equal to the immutable suggestion and empty changes objects are omitted.

alter table public.undo_operations
  add column request_fingerprint text;

alter table public.undo_operations
  add constraint undo_operations_request_fingerprint_check
  check (
    request_fingerprint is null
    or request_fingerprint ~ '^[0-9a-f]{64}$'
  );

create or replace function public.confirm_entry_task_candidates_v2(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_indexes integer[],
  p_candidate_edits jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text;
  internal_operation_key text;
  selected_indexes integer[];
  selected_indexes_json jsonb;
  edit_count integer;
  edit_item jsonb;
  edit_changes jsonb;
  edit_index_numeric numeric;
  edit_index integer;
  seen_edit_indexes integer[] := array[]::integer[];
  owned_entry public.entries%rowtype;
  interpretation public.entry_interpretations%rowtype;
  candidate jsonb;
  selected_index integer;
  suggested_title text;
  suggested_description text;
  suggested_due_text text;
  suggested_due_at timestamptz;
  effective_title text;
  effective_description text;
  effective_due_text text;
  effective_due_at timestamptz;
  effective_confidence numeric;
  canonical_changes jsonb;
  canonical_edits jsonb := '[]'::jsonb;
  effective_candidates jsonb := '[]'::jsonb;
  effective_candidate jsonb;
  canonical_request jsonb;
  canonical_fingerprint text;
  edited_title boolean := false;
  edited_description boolean := false;
  edited_due_at boolean := false;
  edited_fields jsonb := '[]'::jsonb;
  undo_id uuid;
  existing_operation public.undo_operations%rowtype;
  created_task_id uuid;
  created_task_ids uuid[] := array[]::uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'confirm-v2:' || normalized_key;

  if p_candidate_indexes is null
    or pg_catalog.array_ndims(p_candidate_indexes) <> 1
    or pg_catalog.cardinality(p_candidate_indexes) not between 1 and 50
  then
    raise exception 'Invalid candidate selection' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(p_candidate_indexes) as selected(value)
    where selected.value is null or selected.value < 0
  ) then
    raise exception 'Invalid candidate selection' using errcode = '22023';
  end if;
  if (
    select pg_catalog.count(*)
    from pg_catalog.unnest(p_candidate_indexes) as selected(value)
  ) <> (
    select pg_catalog.count(distinct selected.value)
    from pg_catalog.unnest(p_candidate_indexes) as selected(value)
  ) then
    raise exception 'Duplicate candidate selection' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(selected.value order by selected.value)
  into selected_indexes
  from pg_catalog.unnest(p_candidate_indexes) as selected(value);
  select coalesce(
    pg_catalog.jsonb_agg(selected.value order by selected.value),
    '[]'::jsonb
  )
  into selected_indexes_json
  from pg_catalog.unnest(selected_indexes) as selected(value);

  if pg_catalog.jsonb_typeof(p_candidate_edits) is distinct from 'array' then
    raise exception 'Candidate edits must be an array' using errcode = '22023';
  end if;
  edit_count := pg_catalog.jsonb_array_length(p_candidate_edits);
  if edit_count > 50 or pg_catalog.octet_length(p_candidate_edits::text) > 131072 then
    raise exception 'Candidate edits exceed the allowed bounds' using errcode = '22023';
  end if;

  for edit_item in
    select item.value
    from pg_catalog.jsonb_array_elements(p_candidate_edits) as item(value)
  loop
    if pg_catalog.jsonb_typeof(edit_item) is distinct from 'object'
      or not (edit_item ? 'candidateIndex')
      or not (edit_item ? 'changes')
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(edit_item) as edit_key(key)
      ) <> 2
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(edit_item) as edit_key(key)
        where edit_key.key not in ('candidateIndex', 'changes')
      )
    then
      raise exception 'Invalid candidate edit shape' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(edit_item -> 'candidateIndex') is distinct from 'number' then
      raise exception 'Invalid candidate edit index' using errcode = '22023';
    end if;
    begin
      edit_index_numeric := (edit_item ->> 'candidateIndex')::numeric;
    exception when others then
      raise exception 'Invalid candidate edit index' using errcode = '22023';
    end;
    if edit_index_numeric <> pg_catalog.trunc(edit_index_numeric)
      or edit_index_numeric < 0
      or edit_index_numeric > 2147483647
    then
      raise exception 'Invalid candidate edit index' using errcode = '22023';
    end if;
    edit_index := edit_index_numeric::integer;
    if edit_index = any(seen_edit_indexes) then
      raise exception 'Duplicate candidate edit index' using errcode = '22023';
    end if;
    if not (edit_index = any(selected_indexes)) then
      raise exception 'Edit targets an unselected candidate' using errcode = '22023';
    end if;
    seen_edit_indexes := pg_catalog.array_append(seen_edit_indexes, edit_index);

    edit_changes := edit_item -> 'changes';
    if pg_catalog.jsonb_typeof(edit_changes) is distinct from 'object'
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(edit_changes) as change_key(key)
        where change_key.key not in ('title', 'description', 'dueAt')
      )
    then
      raise exception 'Invalid candidate changes shape' using errcode = '22023';
    end if;

    if edit_changes ? 'title' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'title') is distinct from 'string'
        or pg_catalog.char_length(pg_catalog.btrim(edit_changes ->> 'title')) not between 1 and 240
      then
        raise exception 'Invalid candidate title' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'description' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'description') not in ('string', 'null') then
        raise exception 'Invalid candidate description' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'description') = 'string'
        and pg_catalog.char_length(pg_catalog.btrim(edit_changes ->> 'description')) > 2000
      then
        raise exception 'Invalid candidate description' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'dueAt' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'dueAt') not in ('string', 'null') then
        raise exception 'Invalid candidate due date' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'dueAt') = 'string' then
        effective_due_text := pg_catalog.btrim(edit_changes ->> 'dueAt');
        if effective_due_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then
          raise exception 'Invalid candidate due date' using errcode = '22023';
        end if;
        begin
          perform effective_due_text::timestamptz;
        exception when others then
          raise exception 'Invalid candidate due date' using errcode = '22023';
        end;
      end if;
    end if;
  end loop;

  select interpretation_row.*
  into interpretation
  from public.entry_interpretations as interpretation_row
  where interpretation_row.user_id = current_user_id
    and interpretation_row.entry_id = p_entry_id
    and interpretation_row.id = p_expected_interpretation_id;
  if interpretation.id is null then
    raise exception 'Entry or interpretation not found' using errcode = 'P0002';
  end if;
  if interpretation.is_record_only then
    raise exception 'Interpretation is record-only' using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(selected_indexes) as selected(value)
    where selected.value >= pg_catalog.jsonb_array_length(interpretation.task_candidates)
  ) then
    raise exception 'Invalid task candidate index' using errcode = '22023';
  end if;

  foreach selected_index in array selected_indexes
  loop
    candidate := interpretation.task_candidates -> selected_index;
    suggested_title := pg_catalog.btrim(candidate ->> 'title');
    suggested_description := nullif(pg_catalog.btrim(candidate ->> 'description'), '');
    suggested_due_text := nullif(pg_catalog.btrim(candidate ->> 'dueAt'), '');
    suggested_due_at := null;
    if suggested_title is null or pg_catalog.char_length(suggested_title) not between 1 and 240
      or pg_catalog.char_length(suggested_description) > 2000
    then
      raise exception 'Invalid immutable candidate value' using errcode = '22023';
    end if;
    if suggested_due_text is not null then
      begin
        suggested_due_at := suggested_due_text::timestamptz;
      exception when others then
        raise exception 'Invalid immutable candidate due date' using errcode = '22023';
      end;
    end if;

    select item.value -> 'changes'
    into edit_changes
    from pg_catalog.jsonb_array_elements(p_candidate_edits) as item(value)
    where (item.value ->> 'candidateIndex')::integer = selected_index
    limit 1;
    if not found then
      edit_changes := '{}'::jsonb;
    end if;

    effective_title := case
      when edit_changes ? 'title' then pg_catalog.btrim(edit_changes ->> 'title')
      else suggested_title
    end;
    effective_description := case
      when not (edit_changes ? 'description') then suggested_description
      when pg_catalog.jsonb_typeof(edit_changes -> 'description') = 'null' then null
      else nullif(pg_catalog.btrim(edit_changes ->> 'description'), '')
    end;
    effective_due_text := case
      when not (edit_changes ? 'dueAt') then suggested_due_text
      when pg_catalog.jsonb_typeof(edit_changes -> 'dueAt') = 'null' then null
      else pg_catalog.btrim(edit_changes ->> 'dueAt')
    end;
    effective_due_at := null;
    if effective_due_text is not null then
      begin
        effective_due_at := effective_due_text::timestamptz;
      exception when others then
        raise exception 'Invalid candidate due date' using errcode = '22023';
      end;
    end if;
    effective_confidence := coalesce(
      (candidate ->> 'confidence')::numeric,
      interpretation.confidence
    );

    canonical_changes := '{}'::jsonb;
    if edit_changes ? 'title' and effective_title is distinct from suggested_title then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('title', effective_title);
      edited_title := true;
    end if;
    if edit_changes ? 'description'
      and effective_description is distinct from suggested_description
    then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('description', effective_description);
      edited_description := true;
    end if;
    if edit_changes ? 'dueAt' and effective_due_at is distinct from suggested_due_at then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('dueAt', effective_due_text);
      edited_due_at := true;
    end if;
    if canonical_changes <> '{}'::jsonb then
      canonical_edits := canonical_edits || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'candidateIndex', selected_index,
          'changes', canonical_changes
        )
      );
    end if;

    effective_candidates := effective_candidates || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'candidateIndex', selected_index,
        'title', effective_title,
        'description', effective_description,
        'dueAt', effective_due_text,
        'confidence', effective_confidence
      )
    );
  end loop;

  if edited_title then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('title');
  end if;
  if edited_description then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('description');
  end if;
  if edited_due_at then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('dueAt');
  end if;

  canonical_request := pg_catalog.jsonb_build_object(
    'entryId', p_entry_id,
    'interpretationId', p_expected_interpretation_id,
    'selectedCandidateIndexes', selected_indexes_json,
    'candidateEdits', canonical_edits
  );
  -- pgcrypto installs digest in extensions; encode is a PostgreSQL built-in
  -- in pg_catalog in the deployed schema inspected for this migration.
  canonical_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(canonical_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.undo_operations (
    user_id,
    action_type,
    entity_type,
    entity_ids,
    after_state,
    operation_key,
    source_entry_id,
    source_interpretation_id,
    request_fingerprint
  ) values (
    current_user_id,
    'confirm_entry_task_candidates',
    'task',
    array[]::uuid[],
    pg_catalog.jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', p_expected_interpretation_id,
      'task_ids', '[]'::jsonb,
      'candidate_indexes', selected_indexes_json,
      'edited_fields', edited_fields
    ),
    internal_operation_key,
    p_entry_id,
    p_expected_interpretation_id,
    canonical_fingerprint
  )
  on conflict (user_id, operation_key) where operation_key is not null
  do nothing
  returning id into undo_id;

  if undo_id is null then
    select operation_row.*
    into existing_operation
    from public.undo_operations as operation_row
    where operation_row.user_id = current_user_id
      and operation_row.operation_key = internal_operation_key
    for update;
    if existing_operation.id is null
      or existing_operation.request_fingerprint is distinct from canonical_fingerprint
    then
      raise exception 'Operation key payload mismatch'
        using errcode = 'P0001', detail = '2C_IDEMPOTENCY_MISMATCH';
    end if;
    return pg_catalog.jsonb_build_object(
      'task_ids', pg_catalog.to_jsonb(existing_operation.entity_ids),
      'undo_id', existing_operation.id,
      'idempotent', true
    );
  end if;

  select entry_row.*
  into owned_entry
  from public.entries as entry_row
  where entry_row.id = p_entry_id
    and entry_row.user_id = current_user_id
  for update;
  if owned_entry.id is null then
    raise exception 'Entry or interpretation not found' using errcode = 'P0002';
  end if;
  if owned_entry.current_interpretation_id is distinct from p_expected_interpretation_id then
    raise exception 'Interpretation is no longer current' using errcode = '55P03';
  end if;
  if interpretation.user_id is distinct from owned_entry.user_id
    or interpretation.entry_id is distinct from owned_entry.id
    or interpretation.id is distinct from owned_entry.current_interpretation_id
  then
    raise exception 'Entry or interpretation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.tasks as task_row
    where task_row.source_interpretation_id = interpretation.id
      and task_row.candidate_index = any(selected_indexes)
  ) then
    raise exception 'Candidate already materialized'
      using errcode = 'P0001', detail = '2C_ALREADY_MATERIALIZED';
  end if;

  for effective_candidate in
    select item.value
    from pg_catalog.jsonb_array_elements(effective_candidates) as item(value)
    order by (item.value ->> 'candidateIndex')::integer
  loop
    insert into public.tasks (
      user_id,
      source_entry_id,
      source_interpretation_id,
      candidate_index,
      operation_key,
      title,
      description,
      status,
      manual_priority,
      due_at,
      planned_at,
      confidence,
      created_by,
      parent_task_id,
      waiting_on_person_id,
      no_due_reason,
      intentional_no_due
    ) values (
      current_user_id,
      p_entry_id,
      interpretation.id,
      (effective_candidate ->> 'candidateIndex')::integer,
      normalized_key,
      effective_candidate ->> 'title',
      effective_candidate ->> 'description',
      'inbox',
      null,
      (effective_candidate ->> 'dueAt')::timestamptz,
      null,
      (effective_candidate ->> 'confidence')::numeric,
      'user',
      null,
      null,
      null,
      false
    )
    on conflict (source_interpretation_id, candidate_index)
      where source_interpretation_id is not null
    do nothing
    returning id into created_task_id;

    if created_task_id is null then
      raise exception 'Candidate already materialized'
        using errcode = 'P0001', detail = '2C_ALREADY_MATERIALIZED';
    end if;
    created_task_ids := pg_catalog.array_append(created_task_ids, created_task_id);
    created_task_id := null;
  end loop;

  update public.undo_operations
  set
    entity_ids = created_task_ids,
    after_state = pg_catalog.jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', interpretation.id,
      'task_ids', pg_catalog.to_jsonb(created_task_ids),
      'candidate_indexes', selected_indexes_json,
      'edited_fields', edited_fields
    )
  where id = undo_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    actor,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'tasks_confirmed',
    'task',
    'user',
    pg_catalog.jsonb_build_object(
      'task_ids', pg_catalog.to_jsonb(created_task_ids),
      'candidate_indexes', selected_indexes_json,
      'edited_fields', edited_fields,
      'interpretation_id', interpretation.id,
      'request_fingerprint', canonical_fingerprint
    ),
    'User confirmed edited task candidates from the current interpretation',
    p_entry_id
  );

  return pg_catalog.jsonb_build_object(
    'task_ids', pg_catalog.to_jsonb(created_task_ids),
    'undo_id', undo_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text)
  from public, anon;
grant execute on function public.confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text)
  to authenticated;
