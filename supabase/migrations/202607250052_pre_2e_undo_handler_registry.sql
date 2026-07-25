-- Pre-Phase-2E hardening: split public.undo_operation into a thin router over
-- registered per-operation compensation handlers.
--
-- WHY (architecture review July 2026, finding H2)
-- Because migrations are append-only, every slice that added an undoable
-- operation re-created the entire ~470-line dispatcher body. Ten migrations
-- had done so by Phase 2D, and the same defect class shipped twice: the
-- `pg_catalog.greatest(` lookup that cannot resolve under `search_path = ''`
-- was fixed by 202607220042 and then re-introduced verbatim by 202607220044
-- (re-fixed by 202607220045). Phase 2E adds undoable operations, so the
-- authoring pattern is fixed here, before the next one lands.
--
-- WHAT CHANGES
--   * public.undo_operation(uuid) keeps its exact signature, security posture,
--     grants, shared preamble (auth → owner lock → replay short-circuit →
--     status → expiry), error codes, and per-branch return shapes.
--   * Each operation family's compensation body moves, verbatim, into a
--     private handler. The only edit is `current_user_id` → `p_user_id`.
--   * private.undo_operation_handlers maps action_type → handler. Adding an
--     operation in Phase 2E is now one handler plus one registry row; the
--     router is never re-pasted again.
--
-- WHAT DOES NOT CHANGE
--   No RLS, grant, ownership proof, lock order, replay fingerprint, audit
--   action_type, integrity check, SQLSTATE, or returned key is altered. Undo
--   still appends and cancels, never deletes history (ADR-018), and the
--   interpretation-revision conflict still signals 55P03, never the
--   gateway-hanging 40001 (ADR-026, hard gate 2C-UNDO-004).
--
-- SECURITY POSTURE OF THE SPLIT
--   Handlers are SECURITY INVOKER *on purpose*. Reached only through the
--   SECURITY DEFINER router they run with the router's definer privileges, so
--   behaviour is identical; but they take the owner as an explicit parameter,
--   so if a future migration ever granted one by mistake, an authenticated
--   caller would still be refused by the table grants it lacks (no INSERT on
--   audit_logs/undo_operations, no UPDATE on entry_interpretations — ADR-025)
--   instead of gaining a cross-tenant write. Every handler additionally
--   refuses an action_type it does not own, so a registry mistake cannot make
--   one operation compensate another.
--
-- ROLLBACK
--   Forward-only, like every fix in this project. To revert behaviour,
--   re-create public.undo_operation with the body from 202607230050 lines
--   593–1006 in a new migration and drop the registration guard
--   (`drop trigger undo_operations_registered_handler on
--   public.undo_operations`); the handlers and registry may stay in place
--   unused. No data is migrated, so nothing needs restoring.

-- ---------------------------------------------------------------------------
-- Handler registry
-- ---------------------------------------------------------------------------
-- Not a user-owned table: no user_id, no user content, no RLS (forcing RLS
-- here would make the router's own lookup return zero rows). It is
-- unreachable instead — `private` usage is revoked and so is every grant on
-- the table, exactly like the private validator functions since 202607170024.

create table if not exists private.undo_operation_handlers (
  action_type text primary key,
  handler_function text not null,
  description text not null
);

revoke all on table private.undo_operation_handlers from public, anon, authenticated, service_role;

comment on table private.undo_operation_handlers is
  'action_type -> private compensation handler for public.undo_operation. One row per undoable operation; writes to public.undo_operations are trigger-checked against it, so an operation can never be recorded without a handler to reverse it.';

-- ---------------------------------------------------------------------------
-- Handler 1 — resolve_pending_question_v1
-- Body copied verbatim from 202607230050 lines 641–674.
-- ---------------------------------------------------------------------------

create or replace function private.undo_resolve_pending_question_v1(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;
  if operation.action_type <> 'resolve_pending_question_v1' then
    raise exception 'Unsupported undo operation';
  end if;

  update public.pending_questions
  set status = 'open', answer = null, answered_at = null
  where user_id = p_user_id
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
    p_user_id,
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
end;
$$;

revoke all on function private.undo_resolve_pending_question_v1(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Handler 2 — resolve_pending_question_v2 / _v3
-- Body copied verbatim from 202607230050 lines 678–779.
-- Lock order preserved: entries is locked BEFORE the pending_questions
-- update, and jobs after it (202607230051 depends on that ordering).
-- ---------------------------------------------------------------------------

create or replace function private.undo_resolve_pending_question_v2_v3(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  owned_entry public.entries%rowtype;
  affected integer := 0;
  expected_question_status text;
  consequence_kind text;
  consequence_compensation text := 'not_applicable';
  consequence_job public.jobs%rowtype;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;
  if operation.action_type not in ('resolve_pending_question_v2', 'resolve_pending_question_v3') then
    raise exception 'Unsupported undo operation';
  end if;

  -- The resolution evidence names the state the transition left behind;
  -- restoring is only legal from exactly that state.
  expected_question_status := case operation.after_state ->> 'resolution'
    when 'answered' then 'answered'
    when 'deferred' then 'snoozed'
    when 'dismissed' then 'dismissed'
    when 'not_relevant' then 'dismissed'
    else null
  end;
  if expected_question_status is null then
    raise exception 'Pending question undo integrity check failed'
      using errcode = 'P0001', detail = '2D_UNDO_RESTORE_INTEGRITY';
  end if;

  consequence_kind := coalesce(operation.after_state ->> 'consequence', 'none');

  -- Serialize consequence compensation against a concurrent resolution or
  -- reinterpretation of the same entry. v1/v2 operations carry no
  -- consequence and keep their existing lock-free restore path.
  if consequence_kind = 'reinterpret' and operation.source_entry_id is not null then
    select * into owned_entry
    from public.entries
    where id = operation.source_entry_id and user_id = p_user_id
    for update;
    if owned_entry.id is null then
      raise exception 'Entry not found' using errcode = 'P0002';
    end if;
  end if;

  update public.pending_questions
  set status = 'open', answer = null, answered_at = null, snoozed_until = null
  where user_id = p_user_id
    and id = any(operation.entity_ids)
    and status = expected_question_status;
  get diagnostics affected = row_count;

  if affected <> pg_catalog.cardinality(operation.entity_ids) then
    raise exception 'Pending question undo integrity check failed'
      using errcode = 'P0001', detail = '2D_UNDO_RESTORE_INTEGRITY';
  end if;

  -- Compensate the confirmed consequence. The reinterpretation work item
  -- is addressed by the deterministic idempotency key the resolution
  -- recorded, so compensation can never touch an unrelated job.
  if consequence_kind = 'reinterpret' then
    if coalesce(operation.after_state ->> 'reprocess_job_key', '') = '' then
      raise exception 'Pending question undo integrity check failed'
        using errcode = 'P0001', detail = '2D_UNDO_CONSEQUENCE_INTEGRITY';
    end if;

    select * into consequence_job
    from public.jobs
    where user_id = p_user_id
      and idempotency_key = operation.after_state ->> 'reprocess_job_key'
    for update;

    if consequence_job.id is null then
      consequence_compensation := 'reprocessing_missing';
    elsif consequence_job.status in ('pending', 'failed') then
      -- Never claimed (or failed without producing a revision): removing
      -- the queued work item restores the exact pre-consequence state.
      -- jobs is an operational work queue, not append-only evidence; the
      -- audit and undo rows remain the durable history.
      delete from public.jobs where id = consequence_job.id;
      consequence_compensation := 'reprocessing_cancelled';
    elsif consequence_job.status = 'running' then
      consequence_compensation := 'reprocessing_in_progress';
    else
      consequence_compensation := 'reprocessing_' || consequence_job.status;
    end if;
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = now()
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    operation.entity_ids[1],
    'user',
    operation.after_state,
    jsonb_build_object(
      'question_id', operation.entity_ids[1],
      'restored_status', 'open',
      'consequence', consequence_kind,
      'consequence_compensation', consequence_compensation
    ),
    'User executed the stored compensating operation',
    operation.source_entry_id
  );

  return jsonb_build_object(
    'undone', true,
    'affected', affected,
    'consequence', consequence_kind,
    'consequence_compensation', consequence_compensation,
    'idempotent', false
  );
end;
$$;

revoke all on function private.undo_resolve_pending_question_v2_v3(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Handler 3 — candidate confirmation family
-- Body copied verbatim from 202607230050 lines 788–852. The v5/v6-only
-- resolution-count integrity gate stays v5/v6-only: the unversioned key is
-- also recorded by confirm_entry_task_candidates_v2/_v3/_v4, whose undo
-- evidence carries no `resolutions` array.
-- The affected-count nested `case` is the 202607220042/045 fix — it must
-- never become `pg_catalog.greatest(`, which cannot resolve under an empty
-- search_path.
-- ---------------------------------------------------------------------------

create or replace function private.undo_confirm_entry_tasks(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  affected integer := 0;
  resolution_affected integer := 0;
  expected_resolution_count integer := 0;
  result_affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;
  if operation.action_type not in (
    'confirm_entry_tasks',
    'confirm_entry_task_candidates',
    'confirm_entry_task_candidates_v5',
    'confirm_entry_task_candidates_v6'
  ) then
    raise exception 'Unsupported undo operation';
  end if;

  update public.tasks
  set status = 'cancelled', cancelled_at = now()
  where user_id = p_user_id
    and id = any(operation.entity_ids)
    and status <> 'cancelled';
  get diagnostics affected = row_count;

  delete from public.entry_task_candidate_resolutions as resolution_row
  where resolution_row.user_id = p_user_id
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
    p_user_id,
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
end;
$$;

revoke all on function private.undo_confirm_entry_tasks(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Handler 4 — correct_entry_interpretation
-- Body copied verbatim from 202607230050 lines 859–1004, including the
-- 2C-UNDO-004 forward fix (55P03, never 40001).
-- ---------------------------------------------------------------------------

create or replace function private.undo_correct_entry_interpretation(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  owned_entry public.entries%rowtype;
  source_interpretation public.entry_interpretations%rowtype;
  current_interpretation public.entry_interpretations%rowtype;
  undo_interpretation_id uuid;
  undo_version integer;
  restored_status text;
  restored_occurred_at timestamptz;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;
  if operation.action_type <> 'correct_entry_interpretation' then
    raise exception 'Unsupported undo operation';
  end if;

  select * into owned_entry
  from public.entries
  where id = operation.source_entry_id and user_id = p_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.current_interpretation_id is distinct from operation.result_interpretation_id then
    -- 2C-UNDO-004 forward fix (ADR-026 pattern): SQLSTATE 40001 hangs the
    -- request until the platform gateway timeout. 55P03 is the conflict
    -- signal every other RPC in this project already uses.
    raise exception 'Cannot undo after a newer interpretation revision' using errcode = '55P03';
  end if;

  select * into source_interpretation
  from public.entry_interpretations
  where id = operation.source_interpretation_id
    and entry_id = owned_entry.id
    and user_id = p_user_id;
  select * into current_interpretation
  from public.entry_interpretations
  where id = owned_entry.current_interpretation_id
    and entry_id = owned_entry.id
    and user_id = p_user_id;
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
    p_user_id,
    owned_entry.id,
    undo_version,
    current_interpretation.id,
    'user_corrected',
    p_user_id,
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
    p_user_id,
    owned_entry.id,
    undo_interpretation_id,
    entity_type,
    entity_id,
    mention,
    confidence
  from public.entry_entities
  where user_id = p_user_id and interpretation_id = source_interpretation.id;
  perform public.persist_interpretation_questions(
    p_user_id,
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
  where id = owned_entry.id and user_id = p_user_id;

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
    p_user_id,
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

revoke all on function private.undo_correct_entry_interpretation(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Registration
-- ---------------------------------------------------------------------------
-- Exactly the seven action_type values any shipped RPC can record. The
-- unversioned candidate key is what confirm_entry_task_candidates_v2/_v3/_v4
-- record as well, which is why they need no separate row.

insert into private.undo_operation_handlers (action_type, handler_function, description) values
  ('resolve_pending_question_v1', 'undo_resolve_pending_question_v1',
   'Phase 2D.1 answer transition: reopen the answered question.'),
  ('resolve_pending_question_v2', 'undo_resolve_pending_question_v2_v3',
   'Phase 2D.2 dispositions: reopen from the exact status the resolution recorded.'),
  ('resolve_pending_question_v3', 'undo_resolve_pending_question_v2_v3',
   'Phase 2D.4 dispositions plus confirmed consequence: reopen and compensate the queued reinterpretation.'),
  ('confirm_entry_tasks', 'undo_confirm_entry_tasks',
   'Phase 1 compatibility confirmation: cancel the materialized tasks.'),
  ('confirm_entry_task_candidates', 'undo_confirm_entry_tasks',
   'Phase 2X.7 confirmation and the 2C v2/v3/v4 editable versions, which record this same key.'),
  ('confirm_entry_task_candidates_v5', 'undo_confirm_entry_tasks',
   'Phase 2C.4 dispositions: cancel tasks and remove the recorded resolution rows under a fail-closed count check.'),
  ('confirm_entry_task_candidates_v6', 'undo_confirm_entry_tasks',
   'Phase 2C.5 task graph: same as v5, including parent/child cancellation.'),
  ('correct_entry_interpretation', 'undo_correct_entry_interpretation',
   'Phase 2B correction: append a compensating interpretation revision and restore the entry pointer.')
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- Introspection helper
-- ---------------------------------------------------------------------------
-- The router plus every registered handler, as one text blob. The fail-closed
-- source assertions that used to inspect the monolith (2C-UNDO-004's "no
-- 40001", the "no pg_catalog.greatest(" recurrence guard) stay meaningful
-- after the split — and automatically cover handlers added later — by
-- inspecting this bundle instead of one function body.

create or replace function private.undo_operation_definition_bundle()
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.concat_ws(
    E'\n',
    pg_catalog.pg_get_functiondef('public.undo_operation(uuid)'::pg_catalog.regprocedure),
    (
      select pg_catalog.string_agg(
        pg_catalog.pg_get_functiondef(
          ('private.' || pg_catalog.quote_ident(handlers.handler_function) || '(uuid, uuid)')::pg_catalog.regprocedure
        ),
        E'\n'
        order by handlers.handler_function
      )
      from (
        select distinct handler_function from private.undo_operation_handlers
      ) as handlers
    )
  );
$$;

revoke all on function private.undo_operation_definition_bundle() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The router
-- ---------------------------------------------------------------------------

create or replace function public.undo_operation(p_undo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  operation public.undo_operations%rowtype;
  resolved_handler text;
  handler_result jsonb;
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

  select handlers.handler_function into resolved_handler
  from private.undo_operation_handlers as handlers
  where handlers.action_type = operation.action_type;

  -- Fail closed. An unregistered operation is refused with the same message
  -- the monolith used, so no caller sees a new contract.
  if resolved_handler is null then
    raise exception 'Unsupported undo operation';
  end if;

  -- The handler name is not user input: it comes from a private, fully
  -- revoked registry written only by migrations, and %I quotes it as an
  -- identifier. The handler runs in this same transaction, so a failed
  -- integrity check still rolls the whole undo back and leaves the row
  -- 'available'.
  execute pg_catalog.format('select private.%I($1, $2)', resolved_handler)
  into handler_result
  using current_user_id, operation.id;

  if handler_result is null then
    raise exception 'Unsupported undo operation';
  end if;

  return handler_result;
end;
$$;

revoke all on function public.undo_operation(uuid) from public, anon;
grant execute on function public.undo_operation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Structural guarantee: an operation can never be recorded without a handler
-- ---------------------------------------------------------------------------
-- Reported first, so a pre-existing violating row names itself rather than
-- surfacing later as an opaque insert failure. On a database built from zero
-- there is no data and this passes vacuously; against the linked project it is
-- a real check that every recorded operation is reversible.

do $$
declare
  unregistered text;
begin
  select string_agg(distinct existing.action_type, ', ' order by existing.action_type)
  into unregistered
  from public.undo_operations as existing
  where not exists (
    select 1 from private.undo_operation_handlers as handlers
    where handlers.action_type = existing.action_type
  );

  if unregistered is not null then
    raise exception
      'undo_operation handler registry is incomplete: recorded action_type(s) with no handler: %',
      unregistered;
  end if;
end
$$;

-- A trigger, not a foreign key, for two reasons. (1) An FK from an exposed
-- table to a table in the unexposed `private` schema is metadata the Supabase
-- type generator reads, so it could perturb
-- src/lib/supabase/database.types.ts in a way this repository cannot verify
-- without applying the migration first; `pg_trigger` metadata never appears in
-- generated types. (2) It matches the 202607170027 precedent, where a trigger
-- replaced a constraint for the same class of reason. The guarantee is
-- identical: a write naming an unregistered operation fails closed.

create or replace function private.enforce_registered_undo_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.undo_operation_handlers as handlers
    where handlers.action_type = new.action_type
  ) then
    raise exception 'Undo operation has no registered handler'
      using errcode = 'P0001', detail = 'UNDO_HANDLER_NOT_REGISTERED';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_registered_undo_operation() from public, anon, authenticated, service_role;

drop trigger if exists undo_operations_registered_handler on public.undo_operations;
create trigger undo_operations_registered_handler
before insert or update of action_type on public.undo_operations
for each row
execute function private.enforce_registered_undo_operation();

-- ---------------------------------------------------------------------------
-- Fail-closed post-deploy assertions
-- ---------------------------------------------------------------------------

do $$
declare
  missing text;
  bundle text;
begin
  -- Every registered handler exists with the exact routed signature.
  select string_agg(handlers.handler_function, ', ' order by handlers.handler_function)
  into missing
  from (select distinct handler_function from private.undo_operation_handlers) as handlers
  where to_regprocedure('private.' || quote_ident(handlers.handler_function) || '(uuid, uuid)') is null;

  if missing is not null then
    raise exception 'undo_operation registry points at missing handler(s): %', missing;
  end if;

  bundle := private.undo_operation_definition_bundle();

  -- 2C-UNDO-004 (ADR-026): the gateway-hanging SQLSTATE must not survive the
  -- split, and the conflict signal must still be present.
  if position('errcode = ''40001''' in bundle) > 0 then
    raise exception 'undo compensation still raises the gateway-hanging SQLSTATE 40001';
  end if;
  if position('55P03' in bundle) = 0 then
    raise exception 'undo compensation lost the 55P03 interpretation-revision conflict signal';
  end if;

  -- 202607220042/045 recurrence guard: greatest/least are SQL special forms
  -- and cannot be resolved as pg_catalog functions under search_path = ''.
  if position('pg_catalog.greatest(' in lower(bundle)) > 0
    or position('pg_catalog.least(' in lower(bundle)) > 0 then
    raise exception 'undo compensation reintroduced an unresolvable pg_catalog.greatest/least lookup';
  end if;

  -- The router must be a router: no operation-specific compensation left.
  if position('correct_entry_interpretation' in pg_get_functiondef('public.undo_operation(uuid)'::regprocedure)) > 0 then
    raise exception 'undo_operation still contains operation-specific compensation logic';
  end if;
  if position('correct_entry_interpretation' in bundle) = 0 then
    raise exception 'undo compensation lost interpretation-correction support';
  end if;
end
$$;

comment on function public.undo_operation(uuid) is
  'Authenticated undo entry point. Owns authentication, owner locking, replay short-circuit, status and expiry validation, then routes to the private handler registered for the operation''s action_type. Compensation logic lives in private.undo_* handlers; adding an undoable operation means one handler plus one private.undo_operation_handlers row.';
