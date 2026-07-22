-- Phase 2C Slice 2C.5: subtasks and dependencies (task graph).
--
-- Focused on the genuinely new risk surface this slice introduces (graph
-- reference validation, self-reference/non-confirmed-target rejection,
-- cross-owner/cancelled taskId denial, cycle detection restricted to the
-- intra-batch subgraph, atomic mixed valid/invalid abort, parent/dependency
-- materialization across both reference kinds, fingerprint sensitivity to
-- the graph payload, and undo's affected-count regression fix). The
-- identical title/description/dueAt/.../relation machinery v6 shares with
-- v4/v5 is already exhaustively proved by editable_candidate_confirmation.sql,
-- phase_2c_slice_2_planning_priority_no_due.sql, and
-- phase_2c_slice_3_owned_relations.sql; this file does not re-derive it.

begin;

select plan(34);

select has_function(
  'public',
  'confirm_entry_task_candidates_v6',
  array['uuid', 'uuid', 'jsonb', 'jsonb', 'text'],
  'the task graph confirmation v6 signature exists'
);

select is(
  coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v6(uuid,uuid,jsonb,jsonb,text)'
    )
  ), false),
  true,
  'confirm_entry_task_candidates_v6 is security definer'
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
      'public.confirm_entry_task_candidates_v6(uuid,uuid,jsonb,jsonb,text)'
    )
  ), false),
  true,
  'confirm_entry_task_candidates_v6 has an explicit empty search_path'
);

select ok(
  case
    when to_regprocedure('public.confirm_entry_task_candidates_v6(uuid,uuid,jsonb,jsonb,text)') is null
      then false
    else has_function_privilege(
      'authenticated',
      to_regprocedure('public.confirm_entry_task_candidates_v6(uuid,uuid,jsonb,jsonb,text)'),
      'execute'
    )
  end,
  'authenticated can execute confirm_entry_task_candidates_v6'
);

select ok(
  case
    when to_regprocedure('public.confirm_entry_task_candidates_v6(uuid,uuid,jsonb,jsonb,text)') is null
      then false
    else not has_function_privilege(
      'anon',
      to_regprocedure('public.confirm_entry_task_candidates_v6(uuid,uuid,jsonb,jsonb,text)'),
      'execute'
    )
  end,
  'anon cannot execute confirm_entry_task_candidates_v6'
);

select has_function(
  'public',
  'confirm_entry_task_candidates_v5',
  array['uuid', 'uuid', 'jsonb', 'jsonb', 'text'],
  'the legacy v5 confirmation signature remains available and unchanged'
);

create or replace function pg_temp.phase2c5_confirm_v6(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_resolutions jsonb,
  p_candidate_edits jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  execute 'select public.confirm_entry_task_candidates_v6($1, $2, $3, $4, $5)'
  into result
  using p_entry_id, p_expected_interpretation_id, p_candidate_resolutions,
    p_candidate_edits, p_operation_key;
  return result;
end;
$$;

create or replace function pg_temp.phase2c5_error(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_resolutions jsonb,
  p_candidate_edits jsonb,
  p_operation_key text
)
returns table (sqlstate_code text, message text)
language plpgsql
as $$
begin
  perform pg_temp.phase2c5_confirm_v6(
    p_entry_id, p_expected_interpretation_id, p_candidate_resolutions,
    p_candidate_edits, p_operation_key
  );
  sqlstate_code := null;
  message := null;
  return next;
exception when others then
  sqlstate_code := sqlstate;
  message := sqlerrm;
  return next;
end;
$$;

-- Fixtures: two distinct owners, one pre-existing active task, one
-- cancelled task, and one cross-owner task, so every graph-reference
-- rejection has a real row to point at.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('5c500001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase-2c5-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('5c500002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase-2c5-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.tasks (id, user_id, title, status) values
  ('5c510001-0000-4000-8000-000000000001', '5c500001-0000-4000-8000-000000000001', 'Pre-existing owned task', 'todo'),
  ('5c510002-0000-4000-8000-000000000002', '5c500001-0000-4000-8000-000000000001', 'Cancelled owned task', 'cancelled'),
  ('5c510003-0000-4000-8000-000000000003', '5c500002-0000-4000-8000-000000000002', 'Other owner task', 'todo');

select set_config('request.jwt.claim.sub', '5c500001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.entries (id, user_id, original_content, source, status, locale) values (
  '5c540001-0000-4000-8000-000000000001',
  '5c500001-0000-4000-8000-000000000001',
  'Phase 2C.5 task graph fixture', 'web', 'saved', 'en'
);

select public.persist_entry_interpretation(
  '5c540001-0000-4000-8000-000000000001',
  jsonb_build_object(
    'summary', 'Phase 2C.5 fixture',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'taskCandidates', (
      select jsonb_agg(jsonb_build_object(
        'title', 'Candidate ' || generate_series, 'description', null, 'dueAt', null,
        'waitingOn', null, 'parentIndex', null, 'confidence', 0.9
      ))
      from generate_series(0, 8)
    ),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
);

-- Self-reference and shape validation ------------------------------------------

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'candidateIndex', 'value', 0))
    )),
    'pgtap:phase2c5:self-parent'
  )),
  '22023',
  'a candidate cannot be its own parent'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('dependsOn', jsonb_build_array(jsonb_build_object(
        'target', jsonb_build_object('type', 'candidateIndex', 'value', 0), 'type', 'blocks'
      )))
    )),
    'pgtap:phase2c5:self-depends'
  )),
  '22023',
  'a candidate cannot depend on itself'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'somethingElse', 'value', 0))
    )),
    'pgtap:phase2c5:malformed-type'
  )),
  '22023',
  'a malformed graph reference discriminant is rejected'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"rejected"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'candidateIndex', 'value', 1))
    )),
    'pgtap:phase2c5:parent-not-confirmed'
  )),
  '22023',
  'a parentRef targeting a selected-but-not-confirmed candidate is rejected'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('dependsOn', jsonb_build_array(jsonb_build_object(
        'target', jsonb_build_object('type', 'candidateIndex', 'value', 5), 'type', 'blocks'
      )))
    )),
    'pgtap:phase2c5:depends-not-confirmed'
  )),
  '22023',
  'a dependsOn targeting a never-selected candidate index is rejected'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('dependsOn', jsonb_build_array(
        jsonb_build_object('target', jsonb_build_object('type', 'taskId', 'value', '5c510001-0000-4000-8000-000000000001'), 'type', 'blocks'),
        jsonb_build_object('target', jsonb_build_object('type', 'taskId', 'value', '5c510001-0000-4000-8000-000000000001'), 'type', 'requires')
      ))
    )),
    'pgtap:phase2c5:duplicate-target'
  )),
  '22023',
  'a duplicate dependency target is rejected even with different dependency types'
);

-- Cross-owner and cancelled taskId denial ---------------------------------------

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'taskId', 'value', '5c510003-0000-4000-8000-000000000003'))
    )),
    'pgtap:phase2c5:cross-owner-parent'
  )),
  '22023',
  'a cross-owner parent task reference is denied'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('dependsOn', jsonb_build_array(jsonb_build_object(
        'target', jsonb_build_object('type', 'taskId', 'value', '5c510003-0000-4000-8000-000000000003'), 'type', 'blocks'
      )))
    )),
    'pgtap:phase2c5:cross-owner-depends'
  )),
  '22023',
  'a cross-owner dependency task reference is denied'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'taskId', 'value', '5c510002-0000-4000-8000-000000000002'))
    )),
    'pgtap:phase2c5:cancelled-parent'
  )),
  '22023',
  'a cancelled task cannot be referenced as a parent'
);

-- Cycle detection, restricted to the intra-batch candidateIndex subgraph --------

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('candidateIndex', 0, 'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'candidateIndex', 'value', 1))),
      jsonb_build_object('candidateIndex', 1, 'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'candidateIndex', 'value', 0)))
    ),
    'pgtap:phase2c5:direct-cycle'
  )),
  '22023',
  'a direct two-candidate parent cycle is rejected'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"confirmed"},{"candidateIndex":2,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('candidateIndex', 0, 'changes', jsonb_build_object('dependsOn', jsonb_build_array(jsonb_build_object('target', jsonb_build_object('type', 'candidateIndex', 'value', 1), 'type', 'blocks')))),
      jsonb_build_object('candidateIndex', 1, 'changes', jsonb_build_object('dependsOn', jsonb_build_array(jsonb_build_object('target', jsonb_build_object('type', 'candidateIndex', 'value', 2), 'type', 'blocks')))),
      jsonb_build_object('candidateIndex', 2, 'changes', jsonb_build_object('dependsOn', jsonb_build_array(jsonb_build_object('target', jsonb_build_object('type', 'candidateIndex', 'value', 0), 'type', 'blocks'))))
    ),
    'pgtap:phase2c5:indirect-cycle'
  )),
  '22023',
  'an indirect three-candidate dependency cycle is rejected'
);

select results_eq(
  $$
    select count(*)::int from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'
    )
  $$,
  array[0],
  'every failed validation/cycle attempt created no tasks at all (fully atomic)'
);

-- Successful materialization: intra-batch parent/child -------------------------

create temporary table phase2c5_parent_child_result as
select pg_temp.phase2c5_confirm_v6(
  '5c540001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
  '[{"candidateIndex":2,"disposition":"confirmed"},{"candidateIndex":3,"disposition":"confirmed"}]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'candidateIndex', 3,
    'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'candidateIndex', 'value', 2))
  )),
  'pgtap:phase2c5:parent-child'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c5_parent_child_result),
  'false',
  'the intra-batch parent/child materialization is a valid first confirmation'
);

select results_eq(
  $$
    select parent_task_id from public.tasks
    where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001')
      and candidate_index = 3
  $$,
  $$
    select id from public.tasks
    where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001')
      and candidate_index = 2
  $$,
  'the child candidate''s parent_task_id resolves to the sibling candidate''s own new task id'
);

-- Successful materialization: taskId-typed parent -------------------------------

create temporary table phase2c5_taskid_parent_result as
select pg_temp.phase2c5_confirm_v6(
  '5c540001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
  '[{"candidateIndex":4,"disposition":"confirmed"}]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'candidateIndex', 4,
    'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'taskId', 'value', '5c510001-0000-4000-8000-000000000001'))
  )),
  'pgtap:phase2c5:taskid-parent'
) as result;

select results_eq(
  $$
    select parent_task_id from public.tasks
    where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001')
      and candidate_index = 4
  $$,
  array['5c510001-0000-4000-8000-000000000001'::uuid],
  'a taskId-typed parentRef resolves to the existing owned task'
);

-- Successful materialization: intra-batch dependency and taskId dependency -----

create temporary table phase2c5_dependency_result as
select pg_temp.phase2c5_confirm_v6(
  '5c540001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
  '[{"candidateIndex":5,"disposition":"confirmed"},{"candidateIndex":6,"disposition":"confirmed"}]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'candidateIndex', 6,
    'changes', jsonb_build_object('dependsOn', jsonb_build_array(
      jsonb_build_object('target', jsonb_build_object('type', 'candidateIndex', 'value', 5), 'type', 'requires'),
      jsonb_build_object('target', jsonb_build_object('type', 'taskId', 'value', '5c510001-0000-4000-8000-000000000001'), 'type', 'blocks')
    ))
  )),
  'pgtap:phase2c5:dependency'
) as result;

select results_eq(
  $$
    select dependency.depends_on_task_id, dependency.dependency_type
    from public.task_dependencies dependency
    where dependency.task_id = (
      select id from public.tasks
      where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001')
        and candidate_index = 6
    )
    order by dependency.dependency_type
  $$,
  $$
    values
      ('5c510001-0000-4000-8000-000000000001'::uuid, 'blocks'::text),
      ((select id from public.tasks where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001') and candidate_index = 5), 'requires'::text)
  $$,
  'both candidateIndex- and taskId-typed dependency targets are materialized with the correct dependency type'
);

select results_eq(
  $$
    select array_agg(edited_field order by edited_field)
    from (
      select jsonb_array_elements_text(after_state -> 'edited_fields') as edited_field
      from public.audit_logs
      where source_entry_id = '5c540001-0000-4000-8000-000000000001'
        and action_type = 'confirm_entry_task_candidates_v6'
        and after_state -> 'candidate_indexes' = jsonb_build_array(5, 6)
    ) audit_fields
  $$,
  $$ values (array['dependsOn']::text[]) $$,
  'audit evidence names only the edited graph field, never the referenced task IDs'
);

-- Idempotency/replay is sensitive to the exact graph payload --------------------

select is(
  (select (pg_temp.phase2c5_confirm_v6(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":4,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 4,
      'changes', jsonb_build_object('parentRef', jsonb_build_object('type', 'taskId', 'value', '5c510001-0000-4000-8000-000000000001'))
    )),
    'pgtap:phase2c5:taskid-parent'
  )) ->> 'idempotent'),
  'true',
  'the same operation key and canonically-equal graph payload is an idempotent replay'
);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":4,"disposition":"confirmed"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c5:taskid-parent'
  )),
  'P0001',
  'the same operation key with a genuinely different (but individually valid) graph payload is rejected as a fingerprint mismatch'
);

-- Undo restores pending state without touching unrelated graph edges -----------

select is(
  (
    select public.undo_operation((phase2c5_parent_child_result.result ->> 'undo_id')::uuid) ->> 'affected'
    from phase2c5_parent_child_result
  ),
  '2',
  'undo reports both cancelled tasks as affected (regression proof for the greatest() fix)'
);

select results_eq(
  $$
    select status from public.tasks
    where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001')
      and candidate_index in (2, 3)
    order by candidate_index
  $$,
  array['cancelled', 'cancelled'],
  'undo cancels both the parent and child tasks from the same operation'
);

select results_eq(
  $$
    select parent_task_id from public.tasks
    where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001')
      and candidate_index = 3
  $$,
  $$
    select id from public.tasks
    where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001')
      and candidate_index = 2
  $$,
  'undo does not clear parent_task_id -- it stays attached to the now-cancelled parent, matching the existing relation-row precedent'
);

select results_eq(
  $$
    select count(*)::int from public.task_dependencies
    where task_id = (
      select id from public.tasks
      where source_interpretation_id = (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001')
        and candidate_index = 6
    )
  $$,
  array[2],
  'undoing an unrelated operation does not remove this task''s own dependency rows'
);

-- Analytics bound extension (13 fields as of this slice) ------------------------

select lives_ok(
  $$select private.require_task_candidates_confirmed_edit_counts(
    jsonb_build_object('candidateCount', 1, 'editedCandidateCount', 1, 'editedFieldCount', 13)
  )$$,
  'editedFieldCount of 13 for a single edited candidate is now valid (11 Slice 2C.3 fields + parentRef + dependsOn)'
);

select throws_ok(
  $$select private.require_task_candidates_confirmed_edit_counts(
    jsonb_build_object('candidateCount', 1, 'editedCandidateCount', 1, 'editedFieldCount', 14)
  )$$,
  '22023',
  null,
  'editedFieldCount of 14 for a single edited candidate still exceeds the bound'
);

select lives_ok(
  $$select private.validate_product_event_properties('candidate_edit_reset', jsonb_build_object('editedFieldCount', 13))$$,
  'candidate_edit_reset editedFieldCount of 13 is valid after the pre-existing bound was raised from 11'
);

select throws_ok(
  $$select private.validate_product_event_properties('candidate_edit_reset', jsonb_build_object('editedFieldCount', 14))$$,
  '22023',
  null,
  'candidate_edit_reset editedFieldCount of 14 still exceeds the bound'
);

-- Cross-owner and unauthenticated denial (not trusted from any client layer) ---

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (select sqlstate_code from pg_temp.phase2c5_error(
    '5c540001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '5c540001-0000-4000-8000-000000000001'),
    '[{"candidateIndex":7,"disposition":"confirmed"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c5:anonymous'
  )),
  '42501',
  'anonymous v6 confirmation is denied'
);

select set_config('request.jwt.claim.sub', '5c500001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select * from finish();
rollback;
