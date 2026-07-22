-- Forward-fix for Phase 2C Slice 2C.5, discovered by `supabase db lint`
-- immediately after migration 202607220044 was applied (migration 044 itself
-- left unedited, per this project's append-only convention).
--
-- Migration 044's undo_operation(uuid) reused `pg_catalog.greatest(integer,
-- integer)` when extending the v5/v6 result_affected computation to cover
-- v6. `greatest`/`least` are SQL special forms, not real pg_catalog
-- functions, so an explicitly schema-qualified call under this function's
-- empty search_path fails to resolve (the same class of defect migration
-- 202607220042 already fixed once for Slice 2C.4's own v5-only version).
-- Replaced with the same explicit CASE expression 042 used. Reproduced
-- byte-for-byte from migration 044 otherwise (same signature, same grants).

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
        then case
          when affected >= resolution_affected then affected
          else resolution_affected
        end
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
  where user_id = current_user_id and interpretation_id = source_interpretation.id;
  perform public.persist_interpretation_questions(
    current_user_id,
    owned_entry.id,
    undo_interpretation_id,
    source_interpretation.pending_questions
  );

  restored_status := case
    when jsonb_array_length(source_interpretation.pending_questions) > 0 then 'partially_processed'
    when exists (
      select 1 from jsonb_each_text(source_interpretation.element_policy)
      where value in ('request_review', 'block_until_confirmation')
    ) then 'awaiting_review'
    else 'completed'
  end;
  begin
    restored_occurred_at := (source_interpretation.raw_output ->> 'occurredAt')::timestamptz;
  exception when others then
    restored_occurred_at := owned_entry.occurred_at;
  end;

  update public.entries
  set
    current_interpretation_id = undo_interpretation_id,
    status = restored_status,
    occurred_at = restored_occurred_at,
    is_retroactive = coalesce((source_interpretation.raw_output ->> 'isRetroactive')::boolean, false),
    processing_error = null
  where id = owned_entry.id and user_id = current_user_id;

  update public.undo_operations
  set
    status = 'undone',
    undone_at = now(),
    after_state = after_state || jsonb_build_object(
      'undo_interpretation_id', undo_interpretation_id,
      'undo_version', undo_version
    )
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpretation_correction_undone',
    'entry_interpretation',
    undo_interpretation_id,
    'user',
    jsonb_build_object('interpretation_id', current_interpretation.id, 'version', current_interpretation.version),
    jsonb_build_object(
      'interpretation_id', undo_interpretation_id,
      'version', undo_version,
      'restored_from_interpretation_id', source_interpretation.id
    ),
    'User appended a compensating interpretation revision',
    owned_entry.id
  );

  return jsonb_build_object(
    'undone', true,
    'affected', 1,
    'interpretation_id', undo_interpretation_id,
    'version', undo_version,
    'status', restored_status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.undo_operation(uuid) from public, anon;
grant execute on function public.undo_operation(uuid) to authenticated;
