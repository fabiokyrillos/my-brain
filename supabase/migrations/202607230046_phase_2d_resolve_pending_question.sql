-- Phase 2D Slice 2D.1: traceable answer transition for pending questions.
--
-- Introduces the single long-lived versioned resolution RPC family
-- (resolve_pending_question_vN, ADR-033). Slice 2D.1 accepts exactly one
-- resolution kind — a trimmed free-text answer — through a closed,
-- discriminated p_resolution payload, so later slices can add kinds by
-- bumping the version inside the same family instead of creating a separate
-- answer/disposition RPC family.
--
-- Guarantees carried by this contract (mirroring the proven Phase 2C
-- confirmation pattern):
--   * SECURITY DEFINER, empty search_path, qualified references, no dynamic
--     SQL, execute granted to authenticated only;
--   * owner identity from auth.uid() only — cross-owner and anonymous calls
--     fail without disclosing whether another owner's question exists;
--   * stale safety — the question's interpretation must still be the entry's
--     current interpretation (SQLSTATE 55P03 otherwise), checked under an
--     owner entry lock;
--   * single-winner concurrency — the losing transaction of two concurrent
--     resolutions observes a non-open question (SQLSTATE 55000);
--   * deterministic idempotency — a canonical SHA-256 request fingerprint
--     stored on the reserved undo operation makes the same key + payload
--     replay the original result and the same key + different payload fail
--     (P0001 / 2D_IDEMPOTENCY_MISMATCH);
--   * atomicity — state transition, audit evidence, and undo registration
--     commit or roll back together;
--   * immutability — entry_interpretations.pending_questions and the
--     extracted question/reason are never touched.
--
-- The legacy owner-scoped plain UPDATE answer path remains grant-compatible
-- during rollout; consumers cut over to this RPC in the application commit.

create or replace function public.resolve_pending_question_v1(
  p_question_id uuid,
  p_resolution jsonb,
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
  resolution_kind text;
  normalized_answer text;
  question public.pending_questions%rowtype;
  owned_entry public.entries%rowtype;
  canonical_request jsonb;
  canonical_fingerprint text;
  undo_id uuid;
  existing_operation public.undo_operations%rowtype;
  affected integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'resolve-v1:' || normalized_key;

  -- Closed, discriminated resolution payload. Slice 2D.1 accepts exactly
  -- { "kind": "answer", "answer": <text> } — no other key, kind, nesting,
  -- or type is valid. Later versions of this family widen the shape.
  if pg_catalog.jsonb_typeof(p_resolution) is distinct from 'object'
    or pg_catalog.octet_length(p_resolution::text) > 32768
    or not (p_resolution ? 'kind')
    or not (p_resolution ? 'answer')
    or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(p_resolution) as resolution_key(key)
    ) <> 2
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_resolution) as resolution_key(key)
      where resolution_key.key not in ('kind', 'answer')
    )
  then
    raise exception 'Invalid resolution shape' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_resolution -> 'kind') is distinct from 'string' then
    raise exception 'Invalid resolution kind' using errcode = '22023';
  end if;
  resolution_kind := p_resolution ->> 'kind';
  if resolution_kind <> 'answer' then
    raise exception 'Unknown resolution kind' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_resolution -> 'answer') is distinct from 'string' then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;
  normalized_answer := pg_catalog.btrim(p_resolution ->> 'answer');
  if normalized_answer is null
    or pg_catalog.char_length(normalized_answer) not between 1 and 4000
  then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;

  -- Owner-scoped lookup before any evidence is written. A missing or
  -- cross-owner question is indistinguishable (P0002) by design.
  select question_row.*
  into question
  from public.pending_questions as question_row
  where question_row.user_id = current_user_id
    and question_row.id = p_question_id;
  if question.id is null then
    raise exception 'Pending question not found' using errcode = 'P0002';
  end if;

  -- Canonical request fingerprint over the normalized command. jsonb::text
  -- is key-order canonical, so equal commands always hash identically.
  canonical_request := pg_catalog.jsonb_build_object(
    'questionId', p_question_id,
    'kind', resolution_kind,
    'answer', normalized_answer
  );
  canonical_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(canonical_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- Reserve the owner-scoped operation key. On replay the reserved row's
  -- fingerprint decides between deterministic replay and mismatch. A failed
  -- resolution rolls this reservation back atomically, so only successful
  -- operations are replayable.
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
    'resolve_pending_question_v1',
    'pending_question',
    array[question.id],
    pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'entry_id', question.entry_id,
      'interpretation_id', question.interpretation_id,
      'resolution', 'answered',
      'request_fingerprint', canonical_fingerprint
    ),
    internal_operation_key,
    question.entry_id,
    question.interpretation_id,
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
        using errcode = 'P0001', detail = '2D_IDEMPOTENCY_MISMATCH';
    end if;
    return pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'resolution', 'answered',
      'undo_id', existing_operation.id,
      'idempotent', true
    );
  end if;

  -- Owner entry lock serializes concurrent resolutions and interpretation
  -- revisions for this entry; the stale check runs under it.
  select entry_row.*
  into owned_entry
  from public.entries as entry_row
  where entry_row.id = question.entry_id
    and entry_row.user_id = current_user_id
  for update;
  if owned_entry.id is null then
    raise exception 'Pending question not found' using errcode = 'P0002';
  end if;
  if owned_entry.current_interpretation_id is distinct from question.interpretation_id then
    raise exception 'Interpretation is no longer current' using errcode = '55P03';
  end if;

  -- Re-read the question under the entry lock: the pre-reservation read was
  -- unlocked, so the authoritative open check happens here.
  select question_row.*
  into question
  from public.pending_questions as question_row
  where question_row.user_id = current_user_id
    and question_row.id = p_question_id
  for update;
  if question.id is null then
    raise exception 'Pending question not found' using errcode = 'P0002';
  end if;
  if question.status <> 'open' then
    raise exception 'Question is not open' using errcode = '55000';
  end if;

  update public.pending_questions
  set
    status = 'answered',
    answer = normalized_answer,
    answered_at = now()
  where user_id = current_user_id
    and id = question.id
    and status = 'open';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Pending question answer transition failed'
      using errcode = 'P0001', detail = '2D_ANSWER_TRANSITION_INTEGRITY';
  end if;

  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    before_state,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'resolve_pending_question_v1',
    'pending_question',
    question.id,
    'user',
    pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'interpretation_id', question.interpretation_id,
      'status', 'open'
    ),
    pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'interpretation_id', question.interpretation_id,
      'resolution', 'answered',
      'request_fingerprint', canonical_fingerprint
    ),
    'User answered a pending question through the versioned resolution transition',
    question.entry_id
  );

  return pg_catalog.jsonb_build_object(
    'question_id', question.id,
    'resolution', 'answered',
    'undo_id', undo_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.resolve_pending_question_v1(uuid, jsonb, text)
  from public, anon;
grant execute on function public.resolve_pending_question_v1(uuid, jsonb, text)
  to authenticated;

-- Extend undo_operation with the pending-question restore branch. Reproduced
-- byte-for-byte from migration 202607220045 otherwise (same signature, same
-- grants); the only change is the new resolve_pending_question_v1 branch,
-- which restores the exact prior question state (open, cleared answer and
-- answered_at) with an integrity check, immutable audit evidence, and the
-- existing idempotent repeated-undo semantics.

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

  if operation.action_type = 'resolve_pending_question_v1' then
    update public.pending_questions
    set status = 'open', answer = null, answered_at = null
    where user_id = current_user_id
      and id = any(operation.entity_ids)
      and status = 'answered';
    get diagnostics affected = row_count;

    if affected <> pg_catalog.cardinality(operation.entity_ids) then
      raise exception 'Pending question undo integrity check failed'
        using errcode = 'P0001', detail = '2D_UNDO_RESTORE_INTEGRITY';
    end if;

    update public.undo_operations
    set status = 'undone', undone_at = now()
    where id = operation.id;

    insert into public.audit_logs (
      user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
    ) values (
      current_user_id,
      'operation_undone',
      operation.entity_type,
      operation.entity_ids[1],
      'user',
      operation.after_state,
      jsonb_build_object(
        'question_id', operation.entity_ids[1],
        'restored_status', 'open'
      ),
      'User executed the stored compensating operation',
      operation.source_entry_id
    );

    return jsonb_build_object('undone', true, 'affected', affected, 'idempotent', false);
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
