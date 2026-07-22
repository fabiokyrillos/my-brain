-- Phase 2C Slice 2C.3: owned relations (project, context, person, waiting-on).
--
-- Focused on the genuinely new risk surface this slice introduces (relation
-- validation, cross-owner denial per relation type, atomic mixed valid/
-- invalid abort, junction-table materialization, fingerprint sensitivity to
-- relation IDs, and the guard-trigger/analytics-bound extensions). The
-- identical title/description/dueAt/plannedAt/... machinery v4 shares with
-- v2/v3 is already exhaustively proved by editable_candidate_confirmation.sql
-- and phase_2c_slice_2_planning_priority_no_due.sql; this file does not
-- re-derive it.

begin;

select plan(29);

select has_function(
  'public',
  'confirm_entry_task_candidates_v4',
  array['uuid', 'uuid', 'integer[]', 'jsonb', 'text'],
  'the owned-relations confirmation v4 signature exists'
);

select is(
  coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v4(uuid,uuid,integer[],jsonb,text)'
    )
  ), false),
  true,
  'confirm_entry_task_candidates_v4 is security definer'
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
      'public.confirm_entry_task_candidates_v4(uuid,uuid,integer[],jsonb,text)'
    )
  ), false),
  true,
  'confirm_entry_task_candidates_v4 has an explicit empty search_path'
);

select ok(
  case
    when to_regprocedure('public.confirm_entry_task_candidates_v4(uuid,uuid,integer[],jsonb,text)') is null
      then false
    else has_function_privilege(
      'authenticated',
      to_regprocedure('public.confirm_entry_task_candidates_v4(uuid,uuid,integer[],jsonb,text)'),
      'execute'
    )
  end,
  'authenticated can execute confirm_entry_task_candidates_v4'
);

select ok(
  case
    when to_regprocedure('public.confirm_entry_task_candidates_v4(uuid,uuid,integer[],jsonb,text)') is null
      then false
    else not has_function_privilege(
      'anon',
      to_regprocedure('public.confirm_entry_task_candidates_v4(uuid,uuid,integer[],jsonb,text)'),
      'execute'
    )
  end,
  'anon cannot execute confirm_entry_task_candidates_v4'
);

select has_function(
  'public',
  'confirm_entry_task_candidates_v3',
  array['uuid', 'uuid', 'integer[]', 'jsonb', 'text'],
  'the legacy v3 confirmation signature remains available and unchanged'
);

create or replace function pg_temp.phase2c3_confirm_v4(
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
  execute 'select public.confirm_entry_task_candidates_v4($1, $2, $3, $4, $5)'
  into result
  using p_entry_id, p_expected_interpretation_id, p_candidate_indexes,
    p_candidate_edits, p_operation_key;
  return result;
end;
$$;

create or replace function pg_temp.phase2c3_error_code(
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
  perform pg_temp.phase2c3_confirm_v4(
    p_entry_id, p_expected_interpretation_id, p_candidate_indexes,
    p_candidate_edits, p_operation_key
  );
  return null;
exception when others then
  return sqlstate;
end;
$$;

-- Fixtures: two distinct owners, so every relation type can be proven both
-- same-owner-success and cross-owner-denied.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('3c300001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase-2c3-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('3c300002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase-2c3-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.projects (id, user_id, name) values
  ('3c310001-0000-4000-8000-000000000001', '3c300001-0000-4000-8000-000000000001', 'Owned project'),
  ('3c310002-0000-4000-8000-000000000002', '3c300002-0000-4000-8000-000000000002', 'Other owner project');
insert into public.contexts (id, user_id, name) values
  ('3c320001-0000-4000-8000-000000000001', '3c300001-0000-4000-8000-000000000001', 'Owned context'),
  ('3c320002-0000-4000-8000-000000000002', '3c300002-0000-4000-8000-000000000002', 'Other owner context');
insert into public.people (id, user_id, name) values
  ('3c330001-0000-4000-8000-000000000001', '3c300001-0000-4000-8000-000000000001', 'Owned person A'),
  ('3c330003-0000-4000-8000-000000000003', '3c300001-0000-4000-8000-000000000001', 'Owned person B'),
  ('3c330002-0000-4000-8000-000000000002', '3c300002-0000-4000-8000-000000000002', 'Other owner person');

select set_config('request.jwt.claim.sub', '3c300001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.entries (id, user_id, original_content, source, status, locale) values (
  '3c340001-0000-4000-8000-000000000001',
  '3c300001-0000-4000-8000-000000000001',
  'Phase 2C.3 relations fixture', 'web', 'saved', 'en'
);

select public.persist_entry_interpretation(
  '3c340001-0000-4000-8000-000000000001',
  jsonb_build_object(
    'summary', 'Phase 2C.3 fixture',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'taskCandidates', jsonb_build_array(
      jsonb_build_object('title', 'Candidate one', 'description', null, 'dueAt', null, 'waitingOn', null, 'parentIndex', null, 'confidence', 0.9),
      jsonb_build_object('title', 'Candidate two', 'description', null, 'dueAt', null, 'waitingOn', null, 'parentIndex', null, 'confidence', 0.8),
      jsonb_build_object('title', 'Candidate three', 'description', null, 'dueAt', null, 'waitingOn', null, 'parentIndex', null, 'confidence', 0.7)
    ),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
);

-- Structural validation --------------------------------------------------------

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[0],
    '[{"candidateIndex":0,"changes":{"projectIds":["not-a-uuid"]}}]'::jsonb,
    'pgtap:phase2c3:malformed-uuid'
  ),
  '22023',
  'a malformed relation UUID is rejected'
);

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[0],
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('projectIds', jsonb_build_array('3c310001-0000-4000-8000-000000000001', '3c310001-0000-4000-8000-000000000001'))
    )),
    'pgtap:phase2c3:duplicate-relation'
  ),
  '22023',
  'a duplicate relation ID within the same field is rejected'
);

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[0],
    '[{"candidateIndex":0,"changes":{"waitingOnPersonIds":["not-an-array-element", 42]}}]'::jsonb,
    'pgtap:phase2c3:non-string-elements'
  ),
  '22023',
  'a non-string relation array element is rejected'
);

-- Cross-owner denial per relation type, mixed valid/invalid atomic abort ------

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[0],
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('projectIds', jsonb_build_array('3c310002-0000-4000-8000-000000000002'))
    )),
    'pgtap:phase2c3:cross-owner-project'
  ),
  '22023',
  'a cross-owner project relation is denied'
);

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[0],
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('contextIds', jsonb_build_array('3c320002-0000-4000-8000-000000000002'))
    )),
    'pgtap:phase2c3:cross-owner-context'
  ),
  '22023',
  'a cross-owner context relation is denied'
);

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[0],
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('personIds', jsonb_build_array('3c330002-0000-4000-8000-000000000002'))
    )),
    'pgtap:phase2c3:cross-owner-person'
  ),
  '22023',
  'a cross-owner person relation is denied'
);

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[0],
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('waitingOnPersonIds', jsonb_build_array('3c330002-0000-4000-8000-000000000002'))
    )),
    'pgtap:phase2c3:cross-owner-waiting-on'
  ),
  '22023',
  'a cross-owner waiting-on relation is denied'
);

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[1, 2],
    jsonb_build_array(
      jsonb_build_object('candidateIndex', 1, 'changes', jsonb_build_object('projectIds', jsonb_build_array('3c310001-0000-4000-8000-000000000001'))),
      jsonb_build_object('candidateIndex', 2, 'changes', jsonb_build_object('projectIds', jsonb_build_array('3c310002-0000-4000-8000-000000000002')))
    ),
    'pgtap:phase2c3:mixed-valid-invalid'
  ),
  '22023',
  'one invalid relation aborts the whole multi-candidate materialization'
);

select results_eq(
  $$
    select count(*)::int from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'
    )
  $$,
  array[0],
  'the mixed valid/invalid attempt created no tasks at all (fully atomic)'
);

-- Successful materialization across all four relation kinds -------------------

create temporary table phase2c3_relations_result as
select pg_temp.phase2c3_confirm_v4(
  '3c340001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
  array[0],
  jsonb_build_array(jsonb_build_object(
    'candidateIndex', 0,
    'changes', jsonb_build_object(
      'projectIds', jsonb_build_array('3c310001-0000-4000-8000-000000000001'),
      'contextIds', jsonb_build_array('3c320001-0000-4000-8000-000000000001'),
      'personIds', jsonb_build_array('3c330001-0000-4000-8000-000000000001'),
      'waitingOnPersonIds', jsonb_build_array('3c330003-0000-4000-8000-000000000003')
    )
  )),
  'pgtap:phase2c3:full-relations'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c3_relations_result),
  'false',
  'a full owned-relation edit is a valid first confirmation'
);

select results_eq(
  $$
    select project_id from public.task_projects
    where task_id = (select (result -> 'task_ids' ->> 0)::uuid from phase2c3_relations_result)
  $$,
  array['3c310001-0000-4000-8000-000000000001'::uuid],
  'the selected project relation is materialized'
);

select results_eq(
  $$
    select context_id from public.task_contexts
    where task_id = (select (result -> 'task_ids' ->> 0)::uuid from phase2c3_relations_result)
  $$,
  array['3c320001-0000-4000-8000-000000000001'::uuid],
  'the selected context relation is materialized'
);

select results_eq(
  $$
    select person_id, role from public.task_people
    where task_id = (select (result -> 'task_ids' ->> 0)::uuid from phase2c3_relations_result)
    order by role
  $$,
  $$ values ('3c330001-0000-4000-8000-000000000001'::uuid, 'involved'::text), ('3c330003-0000-4000-8000-000000000003'::uuid, 'waiting_on'::text) $$,
  'the selected person and waiting-on relations are each materialized with the correct role'
);

select results_eq(
  $$
    select array_agg(edited_field order by edited_field)
    from (
      select jsonb_array_elements_text(after_state -> 'edited_fields') as edited_field
      from public.audit_logs
      where source_entry_id = '3c340001-0000-4000-8000-000000000001'
        and action_type = 'tasks_confirmed'
        and after_state -> 'task_ids' = (select result -> 'task_ids' from phase2c3_relations_result)
    ) audit_fields
  $$,
  $$ values (array['contextIds', 'personIds', 'projectIds', 'waitingOnPersonIds']::text[]) $$,
  'audit evidence names exactly the four edited relation fields, never IDs or names'
);

-- Idempotency/replay is sensitive to the exact (sorted) relation set ----------

create temporary table phase2c3_replay_result as
select pg_temp.phase2c3_confirm_v4(
  '3c340001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
  array[0],
  jsonb_build_array(jsonb_build_object(
    'candidateIndex', 0,
    'changes', jsonb_build_object(
      'contextIds', jsonb_build_array('3c320001-0000-4000-8000-000000000001'),
      'personIds', jsonb_build_array('3c330001-0000-4000-8000-000000000001'),
      'projectIds', jsonb_build_array('3c310001-0000-4000-8000-000000000001'),
      'waitingOnPersonIds', jsonb_build_array('3c330003-0000-4000-8000-000000000003')
    )
  )),
  'pgtap:phase2c3:full-relations'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c3_replay_result),
  'true',
  'same key and a canonically-equal (differently-ordered-keys) relation payload is an idempotent replay'
);

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[0],
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('projectIds', jsonb_build_array('3c310001-0000-4000-8000-000000000001'))
    )),
    'pgtap:phase2c3:full-relations'
  ),
  'P0001',
  'the same operation key with a genuinely different relation set is rejected as a fingerprint mismatch'
);

-- Guard-trigger extension to the confirm-v4 namespace --------------------------

select ok(
  coalesce(
    pg_get_functiondef(to_regprocedure(
      'public.guard_v2_confirmed_interpretation_correction()'
    )) like '%confirm-v4:%',
    false
  ),
  'the correction-race guard now also checks the confirm-v4 operation namespace'
);

select throws_ok(
  $$
    select public.correct_entry_interpretation(
      '3c340001-0000-4000-8000-000000000001',
      1,
      jsonb_build_object(
        'summary', 'Racing correction after a v4 confirmation',
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
      'pgtap:phase2c3:racing-correction'
    )
  $$,
  '55P03',
  'Interpretation changed; reload before saving',
  'a correction cannot supersede an interpretation with active tasks from a v4 confirmation'
);

-- Analytics bound extension (11 fields as of this slice) -----------------------

select lives_ok(
  $$select private.require_task_candidates_confirmed_edit_counts(
    jsonb_build_object('candidateCount', 1, 'editedCandidateCount', 1, 'editedFieldCount', 11)
  )$$,
  'editedFieldCount of 11 for a single edited candidate is now valid (7 Slice 2C.2 fields + 4 relation fields)'
);

select throws_ok(
  $$select private.require_task_candidates_confirmed_edit_counts(
    jsonb_build_object('candidateCount', 1, 'editedCandidateCount', 1, 'editedFieldCount', 12)
  )$$,
  '22023',
  null,
  'editedFieldCount of 12 for a single edited candidate still exceeds the bound'
);

select lives_ok(
  $$select private.validate_product_event_properties('candidate_edit_reset', jsonb_build_object('editedFieldCount', 11))$$,
  'candidate_edit_reset editedFieldCount of 11 is valid after the pre-existing bound was raised from 3'
);

select throws_ok(
  $$select private.validate_product_event_properties('candidate_edit_reset', jsonb_build_object('editedFieldCount', 12))$$,
  '22023',
  null,
  'candidate_edit_reset editedFieldCount of 12 still exceeds the bound'
);

-- Cross-owner and unauthenticated denial (not trusted from any client layer) --

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  pg_temp.phase2c3_error_code(
    '3c340001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '3c340001-0000-4000-8000-000000000001'),
    array[1],
    '[]'::jsonb,
    'pgtap:phase2c3:anonymous'
  ),
  '42501',
  'anonymous v4 confirmation is denied'
);

select set_config('request.jwt.claim.sub', '3c300001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select * from finish();
rollback;
