-- Phase 2C Slice 2C.2: planning, priority, and no-due semantics.
--
-- Focused on the genuinely new risk surface introduced by this slice
-- (plannedAt/manualPriority/intentionalNoDue/noDueReason validation, the
-- due/no-due mutual-consistency rule, the tasks table constraint, and the
-- guard-trigger extension to the confirm-v3 namespace). The identical
-- title/description/dueAt/replay/idempotency/ownership/atomicity machinery
-- v3 shares with v2 is already exhaustively proved by
-- editable_candidate_confirmation.sql and editable_candidate_confirmation_race.sql
-- against v2's own copy of that logic; this file does not re-derive it.

begin;

select plan(25);

select has_function(
  'public',
  'confirm_entry_task_candidates_v3',
  array['uuid', 'uuid', 'integer[]', 'jsonb', 'text'],
  'the exact planning/priority/no-due confirmation v3 signature exists'
);

select is(
  coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v3(uuid,uuid,integer[],jsonb,text)'
    )
  ), false),
  true,
  'confirm_entry_task_candidates_v3 is security definer'
);

select is(
  coalesce((
    select exists (
      select 1
      from unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
      where lower(setting.value) in ('search_path=', 'search_path=""')
    )
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v3(uuid,uuid,integer[],jsonb,text)'
    )
  ), false),
  true,
  'confirm_entry_task_candidates_v3 has an explicit empty search_path'
);

select ok(
  case
    when to_regprocedure('public.confirm_entry_task_candidates_v3(uuid,uuid,integer[],jsonb,text)') is null
      then false
    else has_function_privilege(
      'authenticated',
      to_regprocedure('public.confirm_entry_task_candidates_v3(uuid,uuid,integer[],jsonb,text)'),
      'execute'
    )
  end,
  'authenticated can execute confirm_entry_task_candidates_v3'
);

select ok(
  case
    when to_regprocedure('public.confirm_entry_task_candidates_v3(uuid,uuid,integer[],jsonb,text)') is null
      then false
    else not has_function_privilege(
      'anon',
      to_regprocedure('public.confirm_entry_task_candidates_v3(uuid,uuid,integer[],jsonb,text)'),
      'execute'
    )
  end,
  'anon cannot execute confirm_entry_task_candidates_v3'
);

select has_function(
  'public',
  'confirm_entry_task_candidates_v2',
  array['uuid', 'uuid', 'integer[]', 'jsonb', 'text'],
  'the legacy v2 confirmation signature remains available and unchanged'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.tasks'::regclass
      and constraint_row.conname = 'tasks_no_due_consistency_check'
  ),
  'the tasks table enforces due/no-due consistency at the schema boundary too'
);

create or replace function pg_temp.phase2c2_confirm_v3(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_indexes integer[],
  p_candidate_edits jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  if to_regprocedure(
    'public.confirm_entry_task_candidates_v3(uuid,uuid,integer[],jsonb,text)'
  ) is null then
    return jsonb_build_object('__phase_2c2_contract_missing__', true);
  end if;

  execute 'select public.confirm_entry_task_candidates_v3($1, $2, $3, $4, $5)'
  into result
  using p_entry_id, p_expected_interpretation_id, p_candidate_indexes,
    p_candidate_edits, p_operation_key;
  return result;
end;
$$;

create or replace function pg_temp.phase2c2_error_code(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_indexes integer[],
  p_candidate_edits jsonb,
  p_operation_key text
)
returns text
language plpgsql
as $$
begin
  perform pg_temp.phase2c2_confirm_v3(
    p_entry_id, p_expected_interpretation_id, p_candidate_indexes,
    p_candidate_edits, p_operation_key
  );
  return null;
exception when others then
  return sqlstate;
end;
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '2c200001-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'phase-2c2-owner@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

select set_config('request.jwt.claim.sub', '2c200001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Direct proof of the table-level constraint, independent of the RPC: even a
-- privileged direct insert bypassing the RPC cannot create an inconsistent
-- due/no-due row.
select throws_ok(
  $$
    insert into public.tasks (user_id, title, status, intentional_no_due, due_at)
    values ('2c200001-0000-4000-8000-000000000001', 'Direct constraint probe', 'inbox', true, now())
  $$,
  '23514',
  null,
  'the no-due consistency check rejects a direct insert with both a due date and the no-due flag'
);

insert into public.entries (id, user_id, original_content, source, status, locale) values (
  '2c210001-0000-4000-8000-000000000001',
  '2c200001-0000-4000-8000-000000000001',
  'Phase 2C.2 planning fixture', 'web', 'saved', 'en'
);

select public.persist_entry_interpretation(
  '2c210001-0000-4000-8000-000000000001',
  jsonb_build_object(
    'summary', 'Phase 2C.2 fixture',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'taskCandidates', jsonb_build_array(
      jsonb_build_object(
        'title', 'Candidate with a due date',
        'description', null,
        'dueAt', '2026-08-01T09:00:00-03:00',
        'waitingOn', null,
        'parentIndex', null,
        'confidence', 0.9
      ),
      jsonb_build_object(
        'title', 'Candidate without a due date',
        'description', null,
        'dueAt', null,
        'waitingOn', null,
        'parentIndex', null,
        'confidence', 0.8
      )
    ),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
);

-- Structural validation of the new fields ------------------------------------

select is(
  pg_temp.phase2c2_error_code(
    '2c210001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
    array[0],
    '[{"candidateIndex":0,"changes":{"plannedAt":"2026-08-01T09:00:00"}}]'::jsonb,
    'pgtap:phase2c2:offsetless-planned'
  ),
  '22023',
  'a plannedAt without an explicit UTC offset is rejected'
);

select results_eq(
  $$
    with contract_case(label, candidate_edits) as (
      values
        ('unknown priority value', '[{"candidateIndex":1,"changes":{"manualPriority":"asap"}}]'::jsonb),
        ('priority has the wrong scalar type', '[{"candidateIndex":1,"changes":{"manualPriority":1}}]'::jsonb),
        ('intentionalNoDue has the wrong scalar type', '[{"candidateIndex":1,"changes":{"intentionalNoDue":"yes"}}]'::jsonb),
        ('no-due reason has the wrong scalar type', '[{"candidateIndex":1,"changes":{"noDueReason":42}}]'::jsonb),
        ('no-due reason is over 2000 characters', jsonb_build_array(jsonb_build_object('candidateIndex', 1, 'changes', jsonb_build_object('intentionalNoDue', true, 'noDueReason', repeat('r', 2001))))),
        ('changes carries a still-unknown field', '[{"candidateIndex":1,"changes":{"waitingOn":"someone"}}]'::jsonb)
    )
    select
      contract_case.label,
      pg_temp.phase2c2_error_code(
        '2c210001-0000-4000-8000-000000000001',
        (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
        array[1],
        contract_case.candidate_edits,
        'pgtap:phase2c2:' || replace(contract_case.label, ' ', '-')
      )
    from contract_case
    order by contract_case.label
  $$,
  $$
    values
      ('changes carries a still-unknown field', '22023'::text),
      ('intentionalNoDue has the wrong scalar type', '22023'::text),
      ('no-due reason has the wrong scalar type', '22023'::text),
      ('no-due reason is over 2000 characters', '22023'::text),
      ('priority has the wrong scalar type', '22023'::text),
      ('unknown priority value', '22023'::text)
  $$,
  'the closed changes allowlist and new field types/bounds are enforced'
);

-- Mutual consistency of due/no-due --------------------------------------------

select is(
  pg_temp.phase2c2_error_code(
    '2c210001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
    array[0],
    '[{"candidateIndex":0,"changes":{"intentionalNoDue":true}}]'::jsonb,
    'pgtap:phase2c2:no-due-with-suggested-due'
  ),
  '22023',
  'intentionalNoDue true is rejected while the suggested due date is still effective'
);

select is(
  pg_temp.phase2c2_error_code(
    '2c210001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
    array[1],
    '[{"candidateIndex":1,"changes":{"intentionalNoDue":true,"dueAt":"2026-08-02T09:00:00-03:00"}}]'::jsonb,
    'pgtap:phase2c2:no-due-with-explicit-due'
  ),
  '22023',
  'intentionalNoDue true is rejected together with an explicitly edited due date'
);

select is(
  pg_temp.phase2c2_error_code(
    '2c210001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
    array[1],
    '[{"candidateIndex":1,"changes":{"noDueReason":"Waiting on scope"}}]'::jsonb,
    'pgtap:phase2c2:reason-without-flag'
  ),
  '22023',
  'a no-due reason without the intentional-no-due flag is rejected'
);

create temporary table phase2c2_no_due_result as
select pg_temp.phase2c2_confirm_v3(
  '2c210001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
  array[1],
  '[{"candidateIndex":1,"changes":{"intentionalNoDue":true,"noDueReason":"Someday, not now"}}]'::jsonb,
  'pgtap:phase2c2:valid-no-due'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c2_no_due_result),
  'false',
  'a valid intentional-no-due edit (candidate already had no due date) is a valid first confirmation'
);

select results_eq(
  $$
    select intentional_no_due, no_due_reason, due_at
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'
    ) and candidate_index = 1
  $$,
  $$ values (true, 'Someday, not now'::text, null::timestamptz) $$,
  'the exact intentional-no-due state and reason are materialized'
);

-- Planned date and priority materialization -----------------------------------

create temporary table phase2c2_planning_result as
select pg_temp.phase2c2_confirm_v3(
  '2c210001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
  array[0],
  '[{"candidateIndex":0,"changes":{"plannedAt":"2026-07-28T09:00:00-03:00","manualPriority":"urgent"}}]'::jsonb,
  'pgtap:phase2c2:planning'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c2_planning_result),
  'false',
  'a planned-date and priority edit is a valid first confirmation'
);

select results_eq(
  $$
    select planned_at = '2026-07-28T09:00:00-03:00'::timestamptz, manual_priority, due_at is not null
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'
    ) and candidate_index = 0
  $$,
  $$ values (true, 'urgent'::text, true) $$,
  'planned date and priority materialize while the suggested due date is preserved unedited'
);

select results_eq(
  $$
    select array_agg(edited_field order by edited_field)
    from (
      select jsonb_array_elements_text(after_state -> 'edited_fields') as edited_field
      from public.audit_logs
      where source_entry_id = '2c210001-0000-4000-8000-000000000001'
        and action_type = 'tasks_confirmed'
        and after_state -> 'task_ids' = (select result -> 'task_ids' from phase2c2_planning_result)
    ) audit_fields
  $$,
  $$ values (array['manualPriority', 'plannedAt']::text[]) $$,
  'audit evidence names exactly the edited planning/priority fields, not the untouched ones'
);

-- Idempotency and replay (one happy path, not the full v2-proven matrix) ------

create temporary table phase2c2_replay_result as
select pg_temp.phase2c2_confirm_v3(
  '2c210001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
  array[0],
  '[{"candidateIndex":0,"changes":{"manualPriority":"urgent","plannedAt":"2026-07-28T09:00:00-03:00"}}]'::jsonb,
  'pgtap:phase2c2:planning'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c2_replay_result),
  'true',
  'same key and canonically equal planning payload is an idempotent replay'
);

select is(
  (select result -> 'task_ids' from phase2c2_replay_result),
  (select result -> 'task_ids' from phase2c2_planning_result),
  'replay of a planning edit returns the exact original task ID'
);

-- Guard-trigger extension to the confirm-v3 namespace -------------------------

select ok(
  coalesce(
    pg_get_functiondef(to_regprocedure(
      'public.guard_v2_confirmed_interpretation_correction()'
    )) like '%confirm-v2:%'
    and pg_get_functiondef(to_regprocedure(
      'public.guard_v2_confirmed_interpretation_correction()'
    )) like '%confirm-v3:%',
    false
  ),
  'the correction-race guard now checks both the confirm-v2 and confirm-v3 operation namespaces'
);

select throws_ok(
  $$
    select public.correct_entry_interpretation(
      '2c210001-0000-4000-8000-000000000001',
      1,
      jsonb_build_object(
        'summary', 'Racing correction after a v3 confirmation',
        'concepts', jsonb_build_array('task'),
        'occurredAt', now()::text,
        'extractedDates', '[]'::jsonb,
        'entityLinks', '[]'::jsonb,
        'classifications', jsonb_build_object(
          'summary', 'interpretation', 'concepts', 'interpretation',
          'occurredAt', 'fact', 'entities', 'interpretation'
        ),
        'pendingQuestions', '[]'::jsonb,
        'elementTrust', jsonb_build_object(
          'summary', jsonb_build_object(
            'score', 0.9, 'policy', 'auto_apply',
            'signals', '{}'::jsonb, 'overrides', '[]'::jsonb, 'evidence', '[]'::jsonb
          )
        ),
        'recordOnly', false
      ),
      'pgtap:phase2c2:racing-correction'
    )
  $$,
  '55P03',
  'Interpretation changed; reload before saving',
  'a correction cannot supersede an interpretation with active tasks from a v3 confirmation'
);

-- Legacy v2 remains fully functional and untouched ----------------------------

insert into public.entries (id, user_id, original_content, source, status, locale) values (
  '2c210002-0000-4000-8000-000000000002',
  '2c200001-0000-4000-8000-000000000001',
  'Phase 2C.2 legacy-v2-compatibility fixture', 'web', 'saved', 'en'
);

select public.persist_entry_interpretation(
  '2c210002-0000-4000-8000-000000000002',
  jsonb_build_object(
    'summary', 'Legacy v2 compatibility fixture',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'taskCandidates', jsonb_build_array(
      jsonb_build_object(
        'title', 'Legacy candidate', 'description', null, 'dueAt', null,
        'waitingOn', null, 'parentIndex', null, 'confidence', 0.9
      )
    ),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
);

select lives_ok(
  $$
    select public.confirm_entry_task_candidates_v2(
      '2c210002-0000-4000-8000-000000000002',
      (select current_interpretation_id from public.entries where id = '2c210002-0000-4000-8000-000000000002'),
      array[0],
      '[]'::jsonb,
      'pgtap:phase2c2:legacy-v2-still-works'
    )
  $$,
  'the unchanged legacy v2 RPC still confirms a candidate after the Slice 2C.2 migration'
);

select results_eq(
  $$
    select manual_priority is null and planned_at is null and intentional_no_due = false and no_due_reason is null
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c210002-0000-4000-8000-000000000002'
    )
  $$,
  array[true],
  'a v2 confirmation still leaves the planning/priority/no-due fields at their Phase 2C.1 defaults'
);

-- Cross-owner and unauthenticated denial (not trusted from any client layer) --

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  pg_temp.phase2c2_error_code(
    '2c210001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c210001-0000-4000-8000-000000000001'),
    array[0],
    '[]'::jsonb,
    'pgtap:phase2c2:anonymous'
  ),
  '42501',
  'anonymous v3 confirmation is denied'
);

select set_config('request.jwt.claim.sub', '2c200001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select * from finish();
rollback;
