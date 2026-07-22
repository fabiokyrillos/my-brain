-- Phase 2C Slice 2C.3: owned relations (project, context, person, waiting-on).
--
-- Adds a new versioned confirmation RPC (v4) rather than widening v3 in
-- place, continuing ADR-031's precedent (generated-client/PostgREST overload
-- safety, a clear rollback boundary). confirm_entry_task_candidates_v3
-- remains unchanged and callable; this migration does not touch it.
--
-- Per PRD 2C-RELATIONS-002, this slice reuses the existing task_projects,
-- task_contexts, and task_people junction tables -- not the dormant
-- tasks.waiting_on_person_id scalar column (added in migration
-- 202607160009, never read or written by any application code, including
-- v2/v3, which both hardcode it to null). task_people.role already has a
-- 'waiting_on' enum value alongside 'involved'/'requester'/'assignee', so a
-- single mechanism covers both the generic "person" relation (role
-- 'involved') and the "waiting-on" relation (role 'waiting_on') without a
-- second, redundant column.
--
-- Like plannedAt/manualPriority/intentionalNoDue/noDueReason in Slice 2C.2,
-- the AI extraction schema never suggests relations, so the immutable
-- suggestion baseline for all four new fields is always the neutral empty
-- state; "reset" means "clear", not "restore an AI value".
--
-- The request fingerprint is the lowercase SHA-256 hex digest of the same
-- canonical jsonb shape v3 uses, with candidateEdits.changes additionally
-- allowing four new keys, each a sorted, deduplicated array of owned IDs:
-- {
--   "entryId": uuid,
--   "interpretationId": uuid,
--   "selectedCandidateIndexes": [integer, ...],
--   "candidateEdits": [
--     {
--       "candidateIndex": integer,
--       "changes": {
--         ...v3 keys,
--         "projectIds"?: [uuid, ...], "contextIds"?: [uuid, ...],
--         "personIds"?: [uuid, ...], "waitingOnPersonIds"?: [uuid, ...]
--       }
--     }, ...
--   ]
-- }

create or replace function public.confirm_entry_task_candidates_v4(
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
  effective_planned_text text;
  effective_planned_at timestamptz;
  effective_manual_priority text;
  effective_intentional_no_due boolean;
  effective_no_due_reason text;
  effective_project_ids jsonb;
  effective_context_ids jsonb;
  effective_person_ids jsonb;
  effective_waiting_on_person_ids jsonb;
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
  edited_planned_at boolean := false;
  edited_manual_priority boolean := false;
  edited_intentional_no_due boolean := false;
  edited_no_due_reason boolean := false;
  edited_project_ids boolean := false;
  edited_context_ids boolean := false;
  edited_person_ids boolean := false;
  edited_waiting_on_person_ids boolean := false;
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
  internal_operation_key := 'confirm-v4:' || normalized_key;

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
        where change_key.key not in (
          'title', 'description', 'dueAt',
          'plannedAt', 'manualPriority', 'intentionalNoDue', 'noDueReason',
          'projectIds', 'contextIds', 'personIds', 'waitingOnPersonIds'
        )
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

    if edit_changes ? 'plannedAt' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'plannedAt') not in ('string', 'null') then
        raise exception 'Invalid candidate planned date' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'plannedAt') = 'string' then
        effective_planned_text := pg_catalog.btrim(edit_changes ->> 'plannedAt');
        if effective_planned_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then
          raise exception 'Invalid candidate planned date' using errcode = '22023';
        end if;
        begin
          perform effective_planned_text::timestamptz;
        exception when others then
          raise exception 'Invalid candidate planned date' using errcode = '22023';
        end;
      end if;
    end if;

    if edit_changes ? 'manualPriority' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'manualPriority') not in ('string', 'null') then
        raise exception 'Invalid candidate priority' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'manualPriority') = 'string'
        and (edit_changes ->> 'manualPriority') not in ('low', 'medium', 'high', 'urgent')
      then
        raise exception 'Invalid candidate priority' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'intentionalNoDue' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'intentionalNoDue') is distinct from 'boolean' then
        raise exception 'Invalid candidate no-due flag' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'noDueReason' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'noDueReason') not in ('string', 'null') then
        raise exception 'Invalid candidate no-due reason' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'noDueReason') = 'string'
        and pg_catalog.char_length(pg_catalog.btrim(edit_changes ->> 'noDueReason')) > 2000
      then
        raise exception 'Invalid candidate no-due reason' using errcode = '22023';
      end if;
    end if;

    -- Four owned-relation arrays: projectIds, contextIds, personIds,
    -- waitingOnPersonIds. Each must be a bounded array of well-formed,
    -- distinct UUID strings; cross-owner/nonexistent targets are validated
    -- later, once every candidate's effective set is known.
    if edit_changes ? 'projectIds' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'projectIds') is distinct from 'array' then
        raise exception 'Invalid candidate project relations' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'projectIds') > 20 then
        raise exception 'Invalid candidate project relations' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'projectIds') as element(value)
        where pg_catalog.jsonb_typeof(element.value) is distinct from 'string'
      ) then
        raise exception 'Invalid candidate project relations' using errcode = '22023';
      end if;
      begin
        perform array(
          select (element.value)::uuid
          from pg_catalog.jsonb_array_elements_text(edit_changes -> 'projectIds') as element(value)
        );
      exception when others then
        raise exception 'Invalid candidate project relations' using errcode = '22023';
      end;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'projectIds') as element(value)
      ) <> (
        select pg_catalog.count(distinct element.value)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'projectIds') as element(value)
      ) then
        raise exception 'Duplicate candidate project relation' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'contextIds' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'contextIds') is distinct from 'array' then
        raise exception 'Invalid candidate context relations' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'contextIds') > 20 then
        raise exception 'Invalid candidate context relations' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'contextIds') as element(value)
        where pg_catalog.jsonb_typeof(element.value) is distinct from 'string'
      ) then
        raise exception 'Invalid candidate context relations' using errcode = '22023';
      end if;
      begin
        perform array(
          select (element.value)::uuid
          from pg_catalog.jsonb_array_elements_text(edit_changes -> 'contextIds') as element(value)
        );
      exception when others then
        raise exception 'Invalid candidate context relations' using errcode = '22023';
      end;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'contextIds') as element(value)
      ) <> (
        select pg_catalog.count(distinct element.value)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'contextIds') as element(value)
      ) then
        raise exception 'Duplicate candidate context relation' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'personIds' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'personIds') is distinct from 'array' then
        raise exception 'Invalid candidate person relations' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'personIds') > 20 then
        raise exception 'Invalid candidate person relations' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'personIds') as element(value)
        where pg_catalog.jsonb_typeof(element.value) is distinct from 'string'
      ) then
        raise exception 'Invalid candidate person relations' using errcode = '22023';
      end if;
      begin
        perform array(
          select (element.value)::uuid
          from pg_catalog.jsonb_array_elements_text(edit_changes -> 'personIds') as element(value)
        );
      exception when others then
        raise exception 'Invalid candidate person relations' using errcode = '22023';
      end;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'personIds') as element(value)
      ) <> (
        select pg_catalog.count(distinct element.value)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'personIds') as element(value)
      ) then
        raise exception 'Duplicate candidate person relation' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'waitingOnPersonIds' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'waitingOnPersonIds') is distinct from 'array' then
        raise exception 'Invalid candidate waiting-on relations' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'waitingOnPersonIds') > 20 then
        raise exception 'Invalid candidate waiting-on relations' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'waitingOnPersonIds') as element(value)
        where pg_catalog.jsonb_typeof(element.value) is distinct from 'string'
      ) then
        raise exception 'Invalid candidate waiting-on relations' using errcode = '22023';
      end if;
      begin
        perform array(
          select (element.value)::uuid
          from pg_catalog.jsonb_array_elements_text(edit_changes -> 'waitingOnPersonIds') as element(value)
        );
      exception when others then
        raise exception 'Invalid candidate waiting-on relations' using errcode = '22023';
      end;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'waitingOnPersonIds') as element(value)
      ) <> (
        select pg_catalog.count(distinct element.value)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'waitingOnPersonIds') as element(value)
      ) then
        raise exception 'Duplicate candidate waiting-on relation' using errcode = '22023';
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
    -- The AI extraction schema never proposes planned date, priority,
    -- no-due metadata, or any relation; the immutable suggestion baseline
    -- for these fields is always the neutral/empty state, so "reset" for
    -- them means "clear".

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

    effective_planned_text := case
      when not (edit_changes ? 'plannedAt') then null
      when pg_catalog.jsonb_typeof(edit_changes -> 'plannedAt') = 'null' then null
      else pg_catalog.btrim(edit_changes ->> 'plannedAt')
    end;
    effective_planned_at := null;
    if effective_planned_text is not null then
      begin
        effective_planned_at := effective_planned_text::timestamptz;
      exception when others then
        raise exception 'Invalid candidate planned date' using errcode = '22023';
      end;
    end if;

    effective_manual_priority := case
      when not (edit_changes ? 'manualPriority') then null
      when pg_catalog.jsonb_typeof(edit_changes -> 'manualPriority') = 'null' then null
      else edit_changes ->> 'manualPriority'
    end;

    effective_intentional_no_due := case
      when not (edit_changes ? 'intentionalNoDue') then false
      else (edit_changes ->> 'intentionalNoDue')::boolean
    end;

    effective_no_due_reason := case
      when not (edit_changes ? 'noDueReason') then null
      when pg_catalog.jsonb_typeof(edit_changes -> 'noDueReason') = 'null' then null
      else nullif(pg_catalog.btrim(edit_changes ->> 'noDueReason'), '')
    end;

    if (effective_no_due_reason is null or effective_intentional_no_due)
        and (not effective_intentional_no_due or effective_due_at is null)
    then
      null;
    else
      raise exception 'Invalid candidate no-due state' using errcode = '22023';
    end if;

    -- Canonicalize each relation array: sorted, deduplicated text UUIDs.
    -- Sorting makes the replay fingerprint stable regardless of the order
    -- the client submitted IDs in.
    effective_project_ids := case
      when not (edit_changes ? 'projectIds') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(id.value order by id.value)
          from (
            select distinct element.value as value
            from pg_catalog.jsonb_array_elements_text(edit_changes -> 'projectIds') as element(value)
          ) as id
        ),
        '[]'::jsonb
      )
    end;
    effective_context_ids := case
      when not (edit_changes ? 'contextIds') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(id.value order by id.value)
          from (
            select distinct element.value as value
            from pg_catalog.jsonb_array_elements_text(edit_changes -> 'contextIds') as element(value)
          ) as id
        ),
        '[]'::jsonb
      )
    end;
    effective_person_ids := case
      when not (edit_changes ? 'personIds') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(id.value order by id.value)
          from (
            select distinct element.value as value
            from pg_catalog.jsonb_array_elements_text(edit_changes -> 'personIds') as element(value)
          ) as id
        ),
        '[]'::jsonb
      )
    end;
    effective_waiting_on_person_ids := case
      when not (edit_changes ? 'waitingOnPersonIds') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(id.value order by id.value)
          from (
            select distinct element.value as value
            from pg_catalog.jsonb_array_elements_text(edit_changes -> 'waitingOnPersonIds') as element(value)
          ) as id
        ),
        '[]'::jsonb
      )
    end;

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
    if edit_changes ? 'plannedAt' and effective_planned_at is distinct from null then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('plannedAt', effective_planned_text);
      edited_planned_at := true;
    end if;
    if edit_changes ? 'manualPriority' and effective_manual_priority is distinct from null then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('manualPriority', effective_manual_priority);
      edited_manual_priority := true;
    end if;
    if edit_changes ? 'intentionalNoDue' and effective_intentional_no_due is distinct from false then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('intentionalNoDue', effective_intentional_no_due);
      edited_intentional_no_due := true;
    end if;
    if edit_changes ? 'noDueReason' and effective_no_due_reason is distinct from null then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('noDueReason', effective_no_due_reason);
      edited_no_due_reason := true;
    end if;
    if effective_project_ids <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('projectIds', effective_project_ids);
      edited_project_ids := true;
    end if;
    if effective_context_ids <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('contextIds', effective_context_ids);
      edited_context_ids := true;
    end if;
    if effective_person_ids <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('personIds', effective_person_ids);
      edited_person_ids := true;
    end if;
    if effective_waiting_on_person_ids <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('waitingOnPersonIds', effective_waiting_on_person_ids);
      edited_waiting_on_person_ids := true;
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
        'plannedAt', effective_planned_text,
        'manualPriority', effective_manual_priority,
        'intentionalNoDue', effective_intentional_no_due,
        'noDueReason', effective_no_due_reason,
        'projectIds', effective_project_ids,
        'contextIds', effective_context_ids,
        'personIds', effective_person_ids,
        'waitingOnPersonIds', effective_waiting_on_person_ids,
        'confidence', effective_confidence
      )
    );
  end loop;

  -- Validate every relation target across every candidate at once: owned by
  -- this user, or the whole materialization aborts atomically (2C-RELATIONS-004).
  -- No relation is ever resolved by label -- only by ID (2C-RELATIONS-003).
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value),
         pg_catalog.jsonb_array_elements_text(candidate_row.value -> 'projectIds') as project_ref(id)
    where not exists (
      select 1
      from public.projects as owned_project
      where owned_project.user_id = current_user_id
        and owned_project.id = project_ref.id::uuid
    )
  ) then
    raise exception 'Invalid or cross-owner project relation'
      using errcode = '22023', detail = '2C_INVALID_RELATION';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value),
         pg_catalog.jsonb_array_elements_text(candidate_row.value -> 'contextIds') as context_ref(id)
    where not exists (
      select 1
      from public.contexts as owned_context
      where owned_context.user_id = current_user_id
        and owned_context.id = context_ref.id::uuid
    )
  ) then
    raise exception 'Invalid or cross-owner context relation'
      using errcode = '22023', detail = '2C_INVALID_RELATION';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value),
         pg_catalog.jsonb_array_elements_text(
           candidate_row.value -> 'personIds' || candidate_row.value -> 'waitingOnPersonIds'
         ) as person_ref(id)
    where not exists (
      select 1
      from public.people as owned_person
      where owned_person.user_id = current_user_id
        and owned_person.id = person_ref.id::uuid
    )
  ) then
    raise exception 'Invalid or cross-owner person relation'
      using errcode = '22023', detail = '2C_INVALID_RELATION';
  end if;

  if edited_title then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('title');
  end if;
  if edited_description then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('description');
  end if;
  if edited_due_at then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('dueAt');
  end if;
  if edited_planned_at then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('plannedAt');
  end if;
  if edited_manual_priority then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('manualPriority');
  end if;
  if edited_intentional_no_due then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('intentionalNoDue');
  end if;
  if edited_no_due_reason then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('noDueReason');
  end if;
  if edited_project_ids then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('projectIds');
  end if;
  if edited_context_ids then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('contextIds');
  end if;
  if edited_person_ids then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('personIds');
  end if;
  if edited_waiting_on_person_ids then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('waitingOnPersonIds');
  end if;

  canonical_request := pg_catalog.jsonb_build_object(
    'entryId', p_entry_id,
    'interpretationId', p_expected_interpretation_id,
    'selectedCandidateIndexes', selected_indexes_json,
    'candidateEdits', canonical_edits
  );
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
      effective_candidate ->> 'manualPriority',
      (effective_candidate ->> 'dueAt')::timestamptz,
      (effective_candidate ->> 'plannedAt')::timestamptz,
      (effective_candidate ->> 'confidence')::numeric,
      'user',
      null,
      null,
      effective_candidate ->> 'noDueReason',
      (effective_candidate ->> 'intentionalNoDue')::boolean
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

    insert into public.task_projects (task_id, project_id, user_id)
    select created_task_id, project_ref.id::uuid, current_user_id
    from pg_catalog.jsonb_array_elements_text(effective_candidate -> 'projectIds') as project_ref(id)
    on conflict do nothing;

    insert into public.task_contexts (task_id, context_id, user_id)
    select created_task_id, context_ref.id::uuid, current_user_id
    from pg_catalog.jsonb_array_elements_text(effective_candidate -> 'contextIds') as context_ref(id)
    on conflict do nothing;

    insert into public.task_people (task_id, person_id, user_id, role)
    select created_task_id, person_ref.id::uuid, current_user_id, 'involved'
    from pg_catalog.jsonb_array_elements_text(effective_candidate -> 'personIds') as person_ref(id)
    on conflict do nothing;

    insert into public.task_people (task_id, person_id, user_id, role)
    select created_task_id, person_ref.id::uuid, current_user_id, 'waiting_on'
    from pg_catalog.jsonb_array_elements_text(effective_candidate -> 'waitingOnPersonIds') as person_ref(id)
    on conflict do nothing;

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

revoke all on function public.confirm_entry_task_candidates_v4(uuid, uuid, integer[], jsonb, text)
  from public, anon;
grant execute on function public.confirm_entry_task_candidates_v4(uuid, uuid, integer[], jsonb, text)
  to authenticated;

-- Extend the correction-race guard (migrations 202607190033/202607210036) to
-- also protect tasks materialized by a v4 confirmation.
create or replace function public.guard_v2_confirmed_interpretation_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origin = 'user_corrected'
    and new.parent_interpretation_id is not null
    and exists (
      select 1
      from public.undo_operations as operation_row
      join public.tasks as task_row
        on task_row.id = any(operation_row.entity_ids)
       and task_row.user_id = operation_row.user_id
      where operation_row.user_id = new.user_id
        and operation_row.source_entry_id = new.entry_id
        and operation_row.source_interpretation_id = new.parent_interpretation_id
        and operation_row.action_type = 'confirm_entry_task_candidates'
        and (
          operation_row.operation_key like 'confirm-v2:%'
          or operation_row.operation_key like 'confirm-v3:%'
          or operation_row.operation_key like 'confirm-v4:%'
        )
        and task_row.status <> 'cancelled'
    )
  then
    raise exception 'Interpretation changed; reload before saving'
      using errcode = '55P03';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_v2_confirmed_interpretation_correction()
  from public, anon, authenticated;

-- Analytics: extend the edited-field-count model to the four new relation
-- fields (title/description/dueAt/plannedAt/manualPriority/intentionalNoDue/
-- noDueReason = 7 as of Slice 2C.2, + projectIds/contextIds/personIds/
-- waitingOnPersonIds = 11 total as of this slice). Relation analytics records
-- counts only (via this same generic edited-field-count mechanism), never
-- the underlying IDs or names, satisfying 2C-ANALYTICS' privacy boundary.
create or replace function private.require_task_candidates_confirmed_edit_counts(
  p_properties jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_edited_candidate_count boolean := p_properties ? 'editedCandidateCount';
  has_edited_field_count boolean := p_properties ? 'editedFieldCount';
  candidate_count numeric;
  edited_candidate_count numeric;
  edited_field_count numeric;
begin
  if not has_edited_candidate_count and not has_edited_field_count then
    return;
  end if;

  if has_edited_candidate_count <> has_edited_field_count then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if jsonb_typeof(p_properties -> 'candidateCount') <> 'number'
    or jsonb_typeof(p_properties -> 'editedCandidateCount') <> 'number'
    or jsonb_typeof(p_properties -> 'editedFieldCount') <> 'number' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if (p_properties ->> 'candidateCount') !~ '^[0-9]+$'
    or (p_properties ->> 'editedCandidateCount') !~ '^[0-9]+$'
    or (p_properties ->> 'editedFieldCount') !~ '^[0-9]+$' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  candidate_count := (p_properties ->> 'candidateCount')::numeric;
  edited_candidate_count := (p_properties ->> 'editedCandidateCount')::numeric;
  edited_field_count := (p_properties ->> 'editedFieldCount')::numeric;

  if edited_candidate_count < 0 or edited_candidate_count > candidate_count then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  -- 11 editable candidate fields as of Slice 2C.3: the 7 from Slice 2C.2 plus
  -- projectIds, contextIds, personIds, waitingOnPersonIds.
  if edited_field_count < 0 or edited_field_count > edited_candidate_count * 11 then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_task_candidates_confirmed_edit_counts(jsonb)
  from public, anon, authenticated, service_role;

-- Forward-fix, discovered while designing this slice's own edited-field-count
-- bound (a genuine pre-existing defect, unrelated to relations themselves):
-- candidate_edit_reset's own editedFieldCount property was still bounded
-- [1,3] by migration 202607210034 (written for Phase 2C.1's 3 fields).
-- Slice 2C.2 already raised the maximum possible reset-time edited-field
-- count to 7 (resetSuggestion() in candidate-editor.tsx counts every
-- currently-edited field, which can include any of the 7 2C.2 fields) but
-- never updated this specific bound, so a real reset of more than 3 edited
-- fields would have been silently rejected by the database's own analytics
-- allowlist -- the same class of defect migration 202607210037 fixed for
-- task_candidates_confirmed. Fixed here to 11, matching this slice's own
-- newly-completed field count; reproduced byte-for-byte from migration
-- 202607210034 otherwise (create or replace, same signature).
create or replace function private.validate_product_event_properties(
  p_event_name text,
  p_properties jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed_keys text[];
  unknown_key text;
begin
  if p_properties is null or jsonb_typeof(p_properties) <> 'object' then
    raise exception 'Product event properties must be an object' using errcode = '22023';
  end if;

  case p_event_name
    when 'capture_started' then
      allowed_keys := array['captureSource'];
    when 'capture_save_succeeded' then
      allowed_keys := array['captureSource', 'durationMs'];
    when 'capture_save_failed' then
      allowed_keys := array['captureSource', 'durationMs', 'failureKind'];
    when 'capture_processing_enqueued' then
      allowed_keys := array['processingMode'];
    when 'capture_processing_completed' then
      allowed_keys := array['processingMode', 'durationMs', 'outcome'];
    when 'capture_processing_failed' then
      allowed_keys := array['processingMode', 'durationMs', 'failureKind'];
    when 'needs_attention_viewed' then
      allowed_keys := array['itemCount'];
    when 'needs_attention_item_opened' then
      allowed_keys := array['attentionReason'];
    when 'interpretation_review_viewed', 'technical_details_opened', 'question_answered_basic' then
      allowed_keys := array[]::text[];
    when 'interpretation_corrected' then
      allowed_keys := array['fieldCount'];
    when 'task_candidates_presented' then
      allowed_keys := array['candidateCount'];
    when 'candidate_edit_started' then
      allowed_keys := array['candidateCount'];
    when 'candidate_edit_reset' then
      allowed_keys := array['editedFieldCount'];
    when 'task_candidates_confirmed' then
      allowed_keys := array['candidateCount', 'editedCandidateCount', 'editedFieldCount'];
    when 'processing_retry_requested' then
      allowed_keys := array['retrySource'];
    when 'work_view_viewed' then
      allowed_keys := array['workView'];
    when 'task_status_changed' then
      allowed_keys := array['fromStatus', 'toStatus'];
    else
      raise exception 'Unsupported product event' using errcode = '22023';
  end case;

  select key into unknown_key
  from jsonb_object_keys(p_properties) as key
  where not (key = any(allowed_keys))
  limit 1;

  if unknown_key is not null then
    raise exception 'Unsupported product event property' using errcode = '22023';
  end if;

  case p_event_name
    when 'capture_started' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
    when 'capture_save_succeeded' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
    when 'capture_save_failed' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'failureKind', array['validation', 'session', 'storage', 'unknown']);
    when 'capture_processing_enqueued' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
    when 'capture_processing_completed' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'outcome', array['ready', 'needs_attention']);
    when 'capture_processing_failed' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'failureKind', array['retryable', 'terminal']);
    when 'needs_attention_viewed' then
      perform private.require_product_event_integer(p_properties, 'itemCount', 0, 1000);
    when 'needs_attention_item_opened' then
      perform private.require_product_event_enum(p_properties, 'attentionReason', array[
        'review_interpretation',
        'confirm_existing_candidates',
        'answer_existing_question',
        'retry_processing',
        'resolve_consistency'
      ]);
    when 'interpretation_review_viewed', 'technical_details_opened', 'question_answered_basic' then
      null;
    when 'interpretation_corrected' then
      perform private.require_product_event_integer(p_properties, 'fieldCount', 1, 30);
    when 'task_candidates_presented' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
    when 'candidate_edit_started' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 1, 1);
    when 'candidate_edit_reset' then
      perform private.require_product_event_integer(p_properties, 'editedFieldCount', 1, 11);
    when 'task_candidates_confirmed' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 1, 100);
      perform private.require_task_candidates_confirmed_edit_counts(p_properties);
    when 'processing_retry_requested' then
      perform private.require_product_event_enum(p_properties, 'retrySource', array['user', 'worker']);
    when 'work_view_viewed' then
      perform private.require_product_event_enum(p_properties, 'workView', array['today', 'all', 'waiting']);
    when 'task_status_changed' then
      perform private.require_product_event_enum(p_properties, 'fromStatus', array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled'
      ]);
      perform private.require_product_event_enum(p_properties, 'toStatus', array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled'
      ]);
  end case;
end;
$$;

revoke all on function private.validate_product_event_properties(text, jsonb)
  from public, anon, authenticated, service_role;
