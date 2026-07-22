-- Phase 2C Slice 2C.5: subtasks and dependencies (task graph).
--
-- Adds a new versioned confirmation RPC (v6) rather than widening v5 in
-- place, continuing ADR-031's precedent. confirm_entry_task_candidates_v5
-- remains unchanged and callable; this migration does not touch it.
--
-- Per PRD 2C-STRUCTURE-001..004, this slice reuses the pre-existing
-- tasks.parent_task_id column and task_dependencies table -- both already
-- have composite (user_id, id) ownership foreign keys from migration
-- 202607170016, so cross-owner graph edges are already impossible at the
-- database level. This migration adds only the RPC-level validation needed
-- for a clear, closed error contract (rather than a raw FK violation) and
-- cycle safety, which no FK constraint can express.
--
-- Split/merge (also named in PRD 2C-STRUCTURE) is deliberately NOT part of
-- this migration. Unlike parent/dependency, which the PRD and implementation
-- plan fully specify (exact reference shape, ownership, cycle-safety), split
-- and merge are described only structurally ("an isolated, independently
-- reversible epic that cannot block the rest of 2C.5") with no field-mapping
-- or command-shape specification anywhere in the plan. Inventing that shape
-- now risks contradicting a later, real product decision. This is recorded
-- as an explicit non-blocking follow-up in the slice report.
--
-- Graph reference shape (closed discriminated union, PRD 2C-STRUCTURE-002):
--   { "type": "candidateIndex", "value": integer }  -- another confirmed
--     candidate in the SAME batch; resolved to its newly created task id.
--   { "type": "taskId", "value": uuid }             -- an existing owned,
--     non-cancelled task.
--
-- Command shape adds two optional keys to candidateEdits[].changes, on top
-- of v5's existing 11:
--   "parentRef"?: <graph reference> | null
--   "dependsOn"?: [{ "target": <graph reference>, "type": "blocks"|"requires"|"related" }, ...]
--
-- Cycle safety proof (why only the intra-batch subgraph needs checking):
-- every taskId reference targets a row that already existed, with its own
-- parent_task_id/task_dependencies edges fixed, before this transaction
-- began. Those existing edges can never point at a task created by this
-- same call (its id does not exist yet), so no cycle can span the
-- existing-graph boundary. The only edges that can ever close a cycle are
-- candidateIndex-typed references among this batch's own candidates, so
-- cycle detection is restricted to that subgraph.

create or replace function private.is_valid_graph_reference(p_ref jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_ref) is distinct from 'object' then
    return false;
  end if;
  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_object_keys(p_ref) as ref_key(key)
  ) <> 2
  or not (p_ref ? 'type')
  or not (p_ref ? 'value')
  then
    return false;
  end if;
  if pg_catalog.jsonb_typeof(p_ref -> 'type') is distinct from 'string' then
    return false;
  end if;

  if p_ref ->> 'type' = 'candidateIndex' then
    if pg_catalog.jsonb_typeof(p_ref -> 'value') is distinct from 'number' then
      return false;
    end if;
    if (p_ref ->> 'value')::numeric <> pg_catalog.trunc((p_ref ->> 'value')::numeric)
      or (p_ref ->> 'value')::numeric < 0
      or (p_ref ->> 'value')::numeric > 2147483647
    then
      return false;
    end if;
    return true;
  end if;

  if p_ref ->> 'type' = 'taskId' then
    if pg_catalog.jsonb_typeof(p_ref -> 'value') is distinct from 'string' then
      return false;
    end if;
    perform (p_ref ->> 'value')::uuid;
    return true;
  end if;

  return false;
exception when others then
  return false;
end;
$$;

revoke all on function private.is_valid_graph_reference(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.confirm_entry_task_candidates_v6(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_resolutions jsonb,
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
  confirmed_indexes integer[] := array[]::integer[];
  resolution_count integer;
  resolution_item jsonb;
  resolution_index_numeric numeric;
  resolution_index integer;
  resolution_disposition text;
  seen_resolution_indexes integer[] := array[]::integer[];
  canonical_resolutions jsonb := '[]'::jsonb;
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
  effective_parent_ref jsonb;
  effective_depends_on jsonb;
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
  edited_parent_ref boolean := false;
  edited_depends_on boolean := false;
  edited_fields jsonb := '[]'::jsonb;
  undo_id uuid;
  existing_operation public.undo_operations%rowtype;
  created_task_id uuid;
  created_task_ids uuid[] := array[]::uuid[];
  task_id_by_candidate_index jsonb := '{}'::jsonb;
  dependency_item jsonb;
  resolved_parent_task_id uuid;
  resolved_dependency_task_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'confirm-v6:' || normalized_key;

  if pg_catalog.jsonb_typeof(p_candidate_resolutions) is distinct from 'array' then
    raise exception 'Candidate resolutions must be an array' using errcode = '22023';
  end if;
  resolution_count := pg_catalog.jsonb_array_length(p_candidate_resolutions);
  if resolution_count not between 1 and 50
    or pg_catalog.octet_length(p_candidate_resolutions::text) > 131072
  then
    raise exception 'Candidate resolutions exceed the allowed bounds' using errcode = '22023';
  end if;

  for resolution_item in
    select item.value
    from pg_catalog.jsonb_array_elements(p_candidate_resolutions) as item(value)
  loop
    if pg_catalog.jsonb_typeof(resolution_item) is distinct from 'object'
      or not (resolution_item ? 'candidateIndex')
      or not (resolution_item ? 'disposition')
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(resolution_item) as resolution_key(key)
      ) <> 2
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(resolution_item) as resolution_key(key)
        where resolution_key.key not in ('candidateIndex', 'disposition')
      )
    then
      raise exception 'Invalid candidate resolution shape' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(resolution_item -> 'candidateIndex') is distinct from 'number' then
      raise exception 'Invalid candidate resolution index' using errcode = '22023';
    end if;
    begin
      resolution_index_numeric := (resolution_item ->> 'candidateIndex')::numeric;
    exception when others then
      raise exception 'Invalid candidate resolution index' using errcode = '22023';
    end;
    if resolution_index_numeric <> pg_catalog.trunc(resolution_index_numeric)
      or resolution_index_numeric < 0
      or resolution_index_numeric > 2147483647
    then
      raise exception 'Invalid candidate resolution index' using errcode = '22023';
    end if;
    resolution_index := resolution_index_numeric::integer;
    if resolution_index = any(seen_resolution_indexes) then
      raise exception 'Duplicate candidate resolution index' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(resolution_item -> 'disposition') is distinct from 'string'
      or (resolution_item ->> 'disposition') not in (
        'confirmed', 'rejected', 'retained', 'dismissed'
      )
    then
      raise exception 'Invalid candidate disposition' using errcode = '22023';
    end if;
    resolution_disposition := resolution_item ->> 'disposition';

    seen_resolution_indexes := pg_catalog.array_append(seen_resolution_indexes, resolution_index);
    if resolution_disposition = 'confirmed' then
      confirmed_indexes := pg_catalog.array_append(confirmed_indexes, resolution_index);
    end if;
  end loop;

  select pg_catalog.array_agg(selected.value order by selected.value)
  into selected_indexes
  from pg_catalog.unnest(seen_resolution_indexes) as selected(value);
  select coalesce(
    pg_catalog.array_agg(confirmed.value order by confirmed.value),
    array[]::integer[]
  )
  into confirmed_indexes
  from pg_catalog.unnest(confirmed_indexes) as confirmed(value);
  select coalesce(
    pg_catalog.jsonb_agg(selected.value order by selected.value),
    '[]'::jsonb
  )
  into selected_indexes_json
  from pg_catalog.unnest(selected_indexes) as selected(value);
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'candidateIndex', (item.value ->> 'candidateIndex')::integer,
      'disposition', item.value ->> 'disposition'
    )
    order by (item.value ->> 'candidateIndex')::integer
  )
  into canonical_resolutions
  from pg_catalog.jsonb_array_elements(p_candidate_resolutions) as item(value);

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
    if not (edit_index = any(confirmed_indexes)) then
      raise exception 'Edit targets a non-confirmed candidate' using errcode = '22023';
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
          'projectIds', 'contextIds', 'personIds', 'waitingOnPersonIds',
          'parentRef', 'dependsOn'
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

    -- Parent reference: null clears, an object must be a well-formed graph
    -- reference, and self-reference is rejected immediately (no need to wait
    -- for interpretation load -- edit_index is already known).
    if edit_changes ? 'parentRef' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'parentRef') = 'null' then
        null;
      elsif not private.is_valid_graph_reference(edit_changes -> 'parentRef') then
        raise exception 'Invalid candidate parent reference' using errcode = '22023';
      elsif (edit_changes -> 'parentRef' ->> 'type') = 'candidateIndex'
        and (edit_changes -> 'parentRef' ->> 'value')::integer = edit_index
      then
        raise exception 'Candidate cannot be its own parent' using errcode = '22023';
      elsif (edit_changes -> 'parentRef' ->> 'type') = 'candidateIndex'
        and not ((edit_changes -> 'parentRef' ->> 'value')::integer = any(confirmed_indexes))
      then
        raise exception 'Graph reference targets a non-confirmed candidate'
          using errcode = '22023', detail = '2C_INVALID_GRAPH_REFERENCE';
      end if;
    end if;

    -- Dependency references: a bounded array of {target, type}. Each target
    -- must be a well-formed graph reference; self-reference and duplicate
    -- targets are rejected here, before any interpretation/ownership lookup.
    if edit_changes ? 'dependsOn' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'dependsOn') is distinct from 'array' then
        raise exception 'Invalid candidate dependencies' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'dependsOn') > 20 then
        raise exception 'Invalid candidate dependencies' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'dependsOn') as dep(value)
        where pg_catalog.jsonb_typeof(dep.value) is distinct from 'object'
          or (
            select pg_catalog.count(*)
            from pg_catalog.jsonb_object_keys(dep.value) as dep_key(key)
          ) <> 2
          or not (dep.value ? 'target')
          or not (dep.value ? 'type')
          or pg_catalog.jsonb_typeof(dep.value -> 'type') is distinct from 'string'
          or (dep.value ->> 'type') not in ('blocks', 'requires', 'related')
          or not private.is_valid_graph_reference(dep.value -> 'target')
      ) then
        raise exception 'Invalid candidate dependencies' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'dependsOn') as dep(value)
        where (dep.value -> 'target' ->> 'type') = 'candidateIndex'
          and (dep.value -> 'target' ->> 'value')::integer = edit_index
      ) then
        raise exception 'Candidate cannot depend on itself' using errcode = '22023';
      end if;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(edit_changes -> 'dependsOn') as dep(value)
      ) <> (
        select pg_catalog.count(distinct dep.value -> 'target')
        from pg_catalog.jsonb_array_elements(edit_changes -> 'dependsOn') as dep(value)
      ) then
        raise exception 'Duplicate candidate dependency target' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'dependsOn') as dep(value)
        where (dep.value -> 'target' ->> 'type') = 'candidateIndex'
          and not ((dep.value -> 'target' ->> 'value')::integer = any(confirmed_indexes))
      ) then
        raise exception 'Graph reference targets a non-confirmed candidate'
          using errcode = '22023', detail = '2C_INVALID_GRAPH_REFERENCE';
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

  foreach selected_index in array confirmed_indexes
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
    -- no-due metadata, any relation, or any graph reference; the immutable
    -- suggestion baseline for these fields is always the neutral/empty
    -- state, so "reset" for them means "clear".

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

    effective_parent_ref := case
      when not (edit_changes ? 'parentRef') then null
      when pg_catalog.jsonb_typeof(edit_changes -> 'parentRef') = 'null' then null
      else edit_changes -> 'parentRef'
    end;
    effective_depends_on := case
      when not (edit_changes ? 'dependsOn') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('target', dep.target, 'type', dep.dep_type)
            order by dep.target::text, dep.dep_type
          )
          from (
            select distinct
              (dep_elem.value -> 'target') as target,
              (dep_elem.value ->> 'type') as dep_type
            from pg_catalog.jsonb_array_elements(edit_changes -> 'dependsOn') as dep_elem(value)
          ) as dep
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
    if effective_parent_ref is not null then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('parentRef', effective_parent_ref);
      edited_parent_ref := true;
    end if;
    if effective_depends_on <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('dependsOn', effective_depends_on);
      edited_depends_on := true;
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
        'parentRef', effective_parent_ref,
        'dependsOn', effective_depends_on,
        'confidence', effective_confidence
      )
    );
  end loop;

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
           (candidate_row.value -> 'personIds') || (candidate_row.value -> 'waitingOnPersonIds')
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

  -- Graph reference ownership: any taskId-typed parent/dependency target
  -- must be an existing, owned, non-cancelled task. candidateIndex-typed
  -- targets were already confirmed to be members of confirmed_indexes above.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value)
    where pg_catalog.jsonb_typeof(candidate_row.value -> 'parentRef') = 'object'
      and (candidate_row.value -> 'parentRef' ->> 'type') = 'taskId'
      and not exists (
        select 1
        from public.tasks as owned_task
        where owned_task.user_id = current_user_id
          and owned_task.id = (candidate_row.value -> 'parentRef' ->> 'value')::uuid
          and owned_task.status <> 'cancelled'
      )
  ) then
    raise exception 'Invalid or cross-owner parent task reference'
      using errcode = '22023', detail = '2C_INVALID_GRAPH_REFERENCE';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value),
         pg_catalog.jsonb_array_elements(candidate_row.value -> 'dependsOn') as dep(value)
    where (dep.value -> 'target' ->> 'type') = 'taskId'
      and not exists (
        select 1
        from public.tasks as owned_task
        where owned_task.user_id = current_user_id
          and owned_task.id = (dep.value -> 'target' ->> 'value')::uuid
          and owned_task.status <> 'cancelled'
      )
  ) then
    raise exception 'Invalid or cross-owner dependency task reference'
      using errcode = '22023', detail = '2C_INVALID_GRAPH_REFERENCE';
  end if;

  -- Cycle safety (2C-STRUCTURE-003), restricted to the intra-batch
  -- candidateIndex subgraph -- see the header comment for the proof that no
  -- other edge can ever participate in a genuine cycle.
  if exists (
    with recursive parent_edges as (
      select
        (candidate_row.value ->> 'candidateIndex')::integer as child_index,
        (candidate_row.value -> 'parentRef' ->> 'value')::integer as parent_index
      from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value)
      where pg_catalog.jsonb_typeof(candidate_row.value -> 'parentRef') = 'object'
        and (candidate_row.value -> 'parentRef' ->> 'type') = 'candidateIndex'
    ),
    ancestry as (
      select child_index as origin, parent_index as ancestor, 1 as depth
      from parent_edges
      union all
      select ancestry.origin, parent_edges.parent_index, ancestry.depth + 1
      from ancestry
      join parent_edges on parent_edges.child_index = ancestry.ancestor
      where ancestry.depth < 51
    )
    select 1 from ancestry where ancestry.origin = ancestry.ancestor
  ) then
    raise exception 'Cycle detected in parent graph'
      using errcode = '22023', detail = '2C_GRAPH_CYCLE';
  end if;

  if exists (
    with recursive dependency_edges as (
      select
        (candidate_row.value ->> 'candidateIndex')::integer as from_index,
        (dep.value -> 'target' ->> 'value')::integer as to_index
      from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value),
           pg_catalog.jsonb_array_elements(candidate_row.value -> 'dependsOn') as dep(value)
      where (dep.value -> 'target' ->> 'type') = 'candidateIndex'
    ),
    reachability as (
      select from_index as origin, to_index as reached, 1 as depth
      from dependency_edges
      union all
      select reachability.origin, dependency_edges.to_index, reachability.depth + 1
      from reachability
      join dependency_edges on dependency_edges.from_index = reachability.reached
      where reachability.depth < 51
    )
    select 1 from reachability where reachability.origin = reachability.reached
  ) then
    raise exception 'Cycle detected in dependency graph'
      using errcode = '22023', detail = '2C_GRAPH_CYCLE';
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
  if edited_parent_ref then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('parentRef');
  end if;
  if edited_depends_on then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('dependsOn');
  end if;

  canonical_request := pg_catalog.jsonb_build_object(
    'entryId', p_entry_id,
    'interpretationId', p_expected_interpretation_id,
    'resolutions', canonical_resolutions,
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
    'confirm_entry_task_candidates_v6',
    'entry_task_candidate_resolution',
    array[]::uuid[],
    pg_catalog.jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', p_expected_interpretation_id,
      'task_ids', '[]'::jsonb,
      'candidate_indexes', selected_indexes_json,
      'resolutions', canonical_resolutions,
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
    from public.entry_task_candidate_resolutions as resolution_row
    where resolution_row.user_id = current_user_id
      and resolution_row.entry_id = p_entry_id
      and resolution_row.interpretation_id = interpretation.id
      and resolution_row.candidate_index = any(selected_indexes)
  ) then
    raise exception 'Candidate already has a terminal disposition'
      using errcode = 'P0001', detail = '2C_TERMINAL_DISPOSITION';
  end if;

  if exists (
    select 1
    from public.tasks as task_row
    where task_row.user_id = current_user_id
      and task_row.source_entry_id = p_entry_id
      and task_row.status <> 'cancelled'
      and task_row.candidate_index = any(selected_indexes)
      and (
        task_row.source_interpretation_id = interpretation.id
        or task_row.source_interpretation_id is null
      )
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
      where source_interpretation_id is not null and status <> 'cancelled'
    do nothing
    returning id into created_task_id;

    if created_task_id is null then
      raise exception 'Candidate already materialized'
        using errcode = 'P0001', detail = '2C_ALREADY_MATERIALIZED';
    end if;
    created_task_ids := pg_catalog.array_append(created_task_ids, created_task_id);
    task_id_by_candidate_index := task_id_by_candidate_index
      || pg_catalog.jsonb_build_object(effective_candidate ->> 'candidateIndex', created_task_id);

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

  -- Second pass: resolve parent/dependency graph references once every
  -- candidate in this batch has a real task id, then write the edges. This
  -- must happen after every insert above so a candidateIndex reference to a
  -- later-indexed sibling (created after the referencing candidate) still
  -- resolves correctly.
  for effective_candidate in
    select item.value
    from pg_catalog.jsonb_array_elements(effective_candidates) as item(value)
    order by (item.value ->> 'candidateIndex')::integer
  loop
    created_task_id := (
      task_id_by_candidate_index ->> (effective_candidate ->> 'candidateIndex')
    )::uuid;

    if pg_catalog.jsonb_typeof(effective_candidate -> 'parentRef') = 'object' then
      if (effective_candidate -> 'parentRef' ->> 'type') = 'candidateIndex' then
        resolved_parent_task_id := (
          task_id_by_candidate_index ->> (effective_candidate -> 'parentRef' ->> 'value')
        )::uuid;
      else
        resolved_parent_task_id := (effective_candidate -> 'parentRef' ->> 'value')::uuid;
      end if;
      update public.tasks
      set parent_task_id = resolved_parent_task_id
      where id = created_task_id and user_id = current_user_id;
    end if;

    for dependency_item in
      select dep.value
      from pg_catalog.jsonb_array_elements(effective_candidate -> 'dependsOn') as dep(value)
    loop
      if (dependency_item -> 'target' ->> 'type') = 'candidateIndex' then
        resolved_dependency_task_id := (
          task_id_by_candidate_index ->> (dependency_item -> 'target' ->> 'value')
        )::uuid;
      else
        resolved_dependency_task_id := (dependency_item -> 'target' ->> 'value')::uuid;
      end if;

      insert into public.task_dependencies (
        user_id, task_id, depends_on_task_id, dependency_type
      ) values (
        current_user_id, created_task_id, resolved_dependency_task_id, dependency_item ->> 'type'
      )
      on conflict (task_id, depends_on_task_id) do nothing;
    end loop;

    created_task_id := null;
  end loop;

  update public.entry_task_candidate_resolutions
  set undo_operation_id = undo_id
  where user_id = current_user_id
    and task_id = any(created_task_ids);

  insert into public.entry_task_candidate_resolutions (
    user_id,
    entry_id,
    interpretation_id,
    candidate_index,
    disposition,
    task_id,
    undo_operation_id
  )
  select
    current_user_id,
    p_entry_id,
    interpretation.id,
    (resolution_row.value ->> 'candidateIndex')::integer,
    resolution_row.value ->> 'disposition',
    null,
    undo_id
  from pg_catalog.jsonb_array_elements(canonical_resolutions) as resolution_row(value)
  where resolution_row.value ->> 'disposition' <> 'confirmed';

  update public.undo_operations
  set
    entity_ids = created_task_ids,
    after_state = pg_catalog.jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', interpretation.id,
      'task_ids', pg_catalog.to_jsonb(created_task_ids),
      'candidate_indexes', selected_indexes_json,
      'resolutions', canonical_resolutions,
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
    'confirm_entry_task_candidates_v6',
    'entry_task_candidate_resolution',
    'user',
    pg_catalog.jsonb_build_object(
      'task_ids', pg_catalog.to_jsonb(created_task_ids),
      'candidate_indexes', selected_indexes_json,
      'resolutions', canonical_resolutions,
      'edited_fields', edited_fields,
      'interpretation_id', interpretation.id,
      'request_fingerprint', canonical_fingerprint
    ),
    'User resolved task candidates from the current interpretation',
    p_entry_id
  );

  return pg_catalog.jsonb_build_object(
    'task_ids', pg_catalog.to_jsonb(created_task_ids),
    'undo_id', undo_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.confirm_entry_task_candidates_v6(uuid, uuid, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.confirm_entry_task_candidates_v6(uuid, uuid, jsonb, jsonb, text)
  to authenticated;

-- Extend the generic undo path to also cover v6. Graph edges
-- (parent_task_id, task_dependencies rows) are intentionally NOT cleared on
-- undo, consistent with the existing precedent for project/context/person
-- relation rows: they simply stay attached to the now-cancelled task rather
-- than being cascaded/cleaned up, since nothing reads relations of a
-- cancelled task as live product state.
create or replace function public.undo_operation(p_undo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  operation public.undo_operations%rowtype;
  owned_entry public.entries%rowtype;
  source_interpretation public.entry_interpretations%rowtype;
  current_interpretation public.entry_interpretations%rowtype;
  undo_interpretation_id uuid;
  undo_version integer;
  affected integer := 0;
  resolution_affected integer := 0;
  expected_resolution_count integer := 0;
  result_affected integer := 0;
  restored_status text;
  restored_occurred_at timestamptz;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = current_user_id
  for update;
  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;

  if operation.status = 'undone' then
    return jsonb_build_object(
      'undone', true,
      'affected', 0,
      'interpretation_id', operation.after_state ->> 'undo_interpretation_id',
      'idempotent', true
    );
  end if;
  if operation.status <> 'available' then raise exception 'Undo operation is no longer available'; end if;
  if operation.expires_at < now() then
    update public.undo_operations set status = 'expired' where id = operation.id;
    raise exception 'Undo operation expired';
  end if;

  if operation.action_type in (
    'confirm_entry_tasks',
    'confirm_entry_task_candidates',
    'confirm_entry_task_candidates_v5',
    'confirm_entry_task_candidates_v6'
  ) then
    update public.tasks
    set status = 'cancelled', cancelled_at = now()
    where user_id = current_user_id
      and id = any(operation.entity_ids)
      and status <> 'cancelled';
    get diagnostics affected = row_count;

    delete from public.entry_task_candidate_resolutions as resolution_row
    where resolution_row.user_id = current_user_id
      and (
        resolution_row.undo_operation_id = operation.id
        or (
          pg_catalog.cardinality(operation.entity_ids) > 0
          and resolution_row.task_id = any(operation.entity_ids)
        )
    );
    get diagnostics resolution_affected = row_count;

    if operation.action_type in (
      'confirm_entry_task_candidates_v5',
      'confirm_entry_task_candidates_v6'
    ) then
      if pg_catalog.jsonb_typeof(operation.after_state -> 'resolutions') is distinct from 'array' then
        raise exception 'Candidate resolution undo integrity check failed'
          using errcode = 'P0001', detail = '2C_UNDO_RESOLUTION_INTEGRITY';
      end if;
      expected_resolution_count := pg_catalog.jsonb_array_length(
        operation.after_state -> 'resolutions'
      );
      if resolution_affected <> expected_resolution_count then
        raise exception 'Candidate resolution undo integrity check failed'
          using errcode = 'P0001', detail = '2C_UNDO_RESOLUTION_INTEGRITY';
      end if;
    end if;

    result_affected := case
      when operation.action_type in (
        'confirm_entry_task_candidates_v5',
        'confirm_entry_task_candidates_v6'
      )
        then pg_catalog.greatest(affected, resolution_affected)
      else affected
    end;

    update public.undo_operations
    set status = 'undone', undone_at = now()
    where id = operation.id;
    insert into public.audit_logs (
      user_id, action_type, entity_type, actor, before_state, after_state, reason
    ) values (
      current_user_id,
      'operation_undone',
      operation.entity_type,
      'user',
      operation.after_state,
      jsonb_build_object(
        'cancelled_entity_ids', to_jsonb(operation.entity_ids),
        'removed_candidate_resolution_count', resolution_affected
      ),
      'User executed the stored compensating operation'
    );
    return jsonb_build_object('undone', true, 'affected', result_affected, 'idempotent', false);
  end if;

  if operation.action_type <> 'correct_entry_interpretation' then
    raise exception 'Unsupported undo operation';
  end if;

  select * into owned_entry
  from public.entries
  where id = operation.source_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.current_interpretation_id is distinct from operation.result_interpretation_id then
    raise exception 'Cannot undo after a newer interpretation revision' using errcode = '40001';
  end if;

  select * into source_interpretation
  from public.entry_interpretations
  where id = operation.source_interpretation_id
    and entry_id = owned_entry.id
    and user_id = current_user_id;
  select * into current_interpretation
  from public.entry_interpretations
  where id = owned_entry.current_interpretation_id
    and entry_id = owned_entry.id
    and user_id = current_user_id;
  if source_interpretation.id is null or current_interpretation.id is null then
    raise exception 'Undo interpretation snapshot not found' using errcode = 'P0002';
  end if;

  undo_version := current_interpretation.version + 1;
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
    owned_entry.id,
    undo_version,
    current_interpretation.id,
    'user_corrected',
    current_user_id,
    'Undo interpretation correction',
    'undo:' || operation.id::text,
    source_interpretation.summary,
    source_interpretation.concepts,
    source_interpretation.extracted_contexts,
    source_interpretation.extracted_organizations,
    source_interpretation.extracted_projects,
    source_interpretation.extracted_people,
    source_interpretation.task_candidates,
    source_interpretation.pending_questions,
    source_interpretation.confidence,
    source_interpretation.model,
    source_interpretation.strategy_version,
    source_interpretation.prompt_version,
    0,
    0,
    source_interpretation.raw_output,
    source_interpretation.extracted_dates,
    source_interpretation.element_classifications,
    source_interpretation.element_confidence,
    source_interpretation.element_policy,
    source_interpretation.resolution_evidence,
    source_interpretation.is_record_only
  ) returning id into undo_interpretation_id;

  insert into public.entry_entities (
    user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence
  )
  select
    current_user_id,
    owned_entry.id,
    undo_interpretation_id,
    entity_type,
    entity_id,
    mention,
    confidence
  from public.entry_entities
  where interpretation_id = source_interpretation.id
    and user_id = current_user_id;

  update public.entries
  set current_interpretation_id = undo_interpretation_id, updated_at = now()
  where id = owned_entry.id and user_id = current_user_id;

  update public.undo_operations
  set status = 'undone', undone_at = now()
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'operation_undone',
    'entry_interpretation',
    'user',
    jsonb_build_object('interpretation_id', current_interpretation.id),
    jsonb_build_object('interpretation_id', undo_interpretation_id),
    'User executed the stored compensating operation',
    owned_entry.id
  );

  return jsonb_build_object(
    'undone', true,
    'affected', 1,
    'interpretation_id', undo_interpretation_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.undo_operation(uuid) from public, anon;
grant execute on function public.undo_operation(uuid) to authenticated;

-- Analytics: extend the edited-field-count ceiling to 13 (the 11 from Slice
-- 2C.3 plus parentRef/dependsOn). Reproduced byte-for-byte from migration
-- 202607220039 otherwise (same signature, same grants).
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

  -- 13 editable candidate fields as of Slice 2C.5: the 11 from Slice 2C.3
  -- plus parentRef and dependsOn.
  if edited_field_count < 0 or edited_field_count > edited_candidate_count * 13 then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_task_candidates_confirmed_edit_counts(jsonb)
  from public, anon, authenticated, service_role;

-- Forward-fix, same class as migration 202607220039's fix for Slice 2C.3:
-- candidate_edit_reset's own editedFieldCount bound must also grow to 13.
-- Reproduced byte-for-byte from migration 202607220039 otherwise.
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
      perform private.require_product_event_integer(p_properties, 'editedFieldCount', 1, 13);
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
