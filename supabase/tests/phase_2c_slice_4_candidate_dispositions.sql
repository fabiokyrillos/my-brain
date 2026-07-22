-- Phase 2C Slice 2C.4: terminal candidate dispositions.
--
-- This file owns the new lifecycle boundary. Earlier v2-v4 edit and owned-
-- relation semantics remain covered by their focused suites; here one mixed
-- confirmation proves that v5 still materializes those values while the rest
-- of the assertions focus on dispositions, replay, undo, legacy exclusion,
-- and Needs Attention convergence.

begin;

select plan(68);

-- Exact schema, RLS, grants, and RPC boundary ---------------------------------

select has_table(
  'public',
  'entry_task_candidate_resolutions',
  'candidate resolutions have one narrow persisted ledger'
);

select columns_are(
  'public',
  'entry_task_candidate_resolutions',
  array[
    'id', 'user_id', 'entry_id', 'interpretation_id', 'candidate_index',
    'disposition', 'task_id', 'undo_operation_id', 'created_at'
  ],
  'the resolution ledger contains provenance only and no candidate content'
);

select ok(
  coalesce((
    select table_row.relrowsecurity
    from pg_class as table_row
    where table_row.oid = 'public.entry_task_candidate_resolutions'::regclass
  ), false),
  'RLS is enabled on candidate resolutions'
);

select is(
  (
    select count(*)::integer
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'entry_task_candidate_resolutions'
      and policy.cmd = 'SELECT'
  ),
  1,
  'candidate resolutions expose exactly one owner-scoped SELECT policy'
);

select ok(
  has_table_privilege('authenticated', 'public.entry_task_candidate_resolutions', 'select')
  and not has_table_privilege('authenticated', 'public.entry_task_candidate_resolutions', 'insert')
  and not has_table_privilege('authenticated', 'public.entry_task_candidate_resolutions', 'update')
  and not has_table_privilege('authenticated', 'public.entry_task_candidate_resolutions', 'delete'),
  'authenticated can read but cannot mutate resolution history directly'
);

select ok(
  not has_table_privilege('anon', 'public.entry_task_candidate_resolutions', 'select'),
  'anon cannot read candidate resolutions'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.entry_task_candidate_resolutions'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) like '%confirmed%'
      and pg_get_constraintdef(constraint_row.oid) like '%rejected%'
      and pg_get_constraintdef(constraint_row.oid) like '%retained%'
      and pg_get_constraintdef(constraint_row.oid) like '%dismissed%'
      and pg_get_constraintdef(constraint_row.oid) not like '%cancelled%'
  ),
  'the database owns the exact four-value disposition enum'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.entry_task_candidate_resolutions'::regclass
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (user_id, interpretation_id, candidate_index)'
  ),
  'candidate identity is unique by owner, interpretation, and candidate index'
);

select has_function(
  'public',
  'confirm_entry_task_candidates_v5',
  array['uuid', 'uuid', 'jsonb', 'jsonb', 'text'],
  'the atomic mixed-disposition v5 signature exists'
);

select is(
  coalesce((
    select procedure.prosecdef
    from pg_proc as procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)'
    )
  ), false),
  true,
  'v5 is SECURITY DEFINER'
);

select is(
  coalesce((
    select exists (
      select 1
      from unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
      where lower(setting.value) in ('search_path=', 'search_path=""')
    )
    from pg_proc as procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)'
    )
  ), false),
  true,
  'v5 has an explicit empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)',
    'execute'
  ),
  'authenticated can execute v5'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)',
    'execute'
  ),
  'anon cannot execute v5'
);

select ok(
  coalesce((
    select not exists (
      select 1
      from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) as privilege
      where privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    )
    from pg_proc as procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)'
    )
  ), false),
  'PUBLIC cannot execute v5'
);

select has_function('public', 'confirm_entry_task_candidates_v4', array['uuid', 'uuid', 'integer[]', 'jsonb', 'text']);
select has_function('public', 'confirm_entry_task_candidates_v3', array['uuid', 'uuid', 'integer[]', 'jsonb', 'text']);
select has_function('public', 'confirm_entry_task_candidates_v2', array['uuid', 'uuid', 'integer[]', 'jsonb', 'text']);
select has_function('public', 'confirm_entry_task_candidates', array['uuid', 'uuid', 'integer[]', 'text']);
select has_function('public', 'confirm_entry_tasks', array['uuid', 'integer[]']);

select ok(
  coalesce((
    select pg_get_expr(index_row.indpred, index_row.indrelid) ilike '%status <>%cancelled%'
    from pg_index as index_row
    join pg_class as index_class on index_class.oid = index_row.indexrelid
    where index_class.relname = 'tasks_source_interpretation_candidate_key'
  ), false),
  'candidate provenance uniqueness applies only to active tasks'
);

select ok(
  coalesce(
    pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)'
    )) like '%confirm-v5:%'
    and pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)'
    )) like '%confirm_entry_task_candidates_v5%'
    and pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)'
    )) like '%request_fingerprint%',
    false
  ),
  'v5 has an explicit replay namespace, action type, and fingerprint'
);

select ok(
  coalesce(
    pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)'
    )) not ilike '%product_events%'
    and pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v5(uuid,uuid,jsonb,jsonb,text)'
    )) not ilike '%track_product_event%',
    false
  ),
  'v5 emits no disposition category analytics'
);

-- Helpers and fixtures ---------------------------------------------------------

create or replace function pg_temp.phase2c4_confirm_v5(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_resolutions jsonb,
  p_candidate_edits jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  execute 'select public.confirm_entry_task_candidates_v5($1, $2, $3, $4, $5)'
  into result
  using p_entry_id, p_expected_interpretation_id, p_resolutions,
    p_candidate_edits, p_operation_key;
  return result;
end;
$$;

create or replace function pg_temp.phase2c4_error_state(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_resolutions jsonb,
  p_candidate_edits jsonb,
  p_operation_key text
)
returns text
language plpgsql
as $$
begin
  perform pg_temp.phase2c4_confirm_v5(
    p_entry_id, p_expected_interpretation_id, p_resolutions,
    p_candidate_edits, p_operation_key
  );
  return null;
exception when others then
  return sqlstate;
end;
$$;

create or replace function pg_temp.phase2c4_make_entry(
  p_entry_id uuid,
  p_candidate_count integer,
  p_record_only boolean default false
)
returns uuid
language plpgsql
as $$
declare
  candidate_rows jsonb;
  interpretation_id uuid;
begin
  insert into public.entries (
    id, user_id, original_content, source, status, locale
  ) values (
    p_entry_id,
    auth.uid(),
    'Phase 2C.4 fixture ' || p_entry_id::text,
    'web',
    'saved',
    'en'
  );

  select jsonb_agg(
    jsonb_build_object(
      'title', 'Candidate ' || candidate_slot.idx::text,
      'description', 'Immutable description ' || candidate_slot.idx::text,
      'dueAt', null,
      'waitingOn', null,
      'parentIndex', null,
      'confidence', 0.9
    )
    order by candidate_slot.idx
  )
  into candidate_rows
  from generate_series(0, p_candidate_count - 1) as candidate_slot(idx);

  perform public.persist_entry_interpretation(
    p_entry_id,
    jsonb_build_object(
      'summary', 'Phase 2C.4 fixture',
      'concepts', jsonb_build_array('task'),
      'occurredAt', now()::text,
      'confidence', 0.9,
      'taskCandidates', candidate_rows,
      'pendingQuestions', '[]'::jsonb
    ),
    'gpt-test', 'strategy-1', 'prompt-1', 100, 50
  );

  select entry_row.current_interpretation_id
  into interpretation_id
  from public.entries as entry_row
  where entry_row.id = p_entry_id
    and entry_row.user_id = auth.uid();

  update public.entry_interpretations
  set is_record_only = p_record_only
  where id = interpretation_id
    and user_id = auth.uid();

  update public.entries
  set status = 'completed'
  where id = p_entry_id
    and user_id = auth.uid();

  return interpretation_id;
end;
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('4c400001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase-2c4-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('4c400002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase-2c4-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claim.sub', '4c400001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.projects (id, user_id, name) values
  ('4c410001-0000-4000-8000-000000000001', '4c400001-0000-4000-8000-000000000001', 'Owned project');
insert into public.contexts (id, user_id, name) values
  ('4c420001-0000-4000-8000-000000000001', '4c400001-0000-4000-8000-000000000001', 'Owned context');
insert into public.people (id, user_id, name) values
  ('4c430001-0000-4000-8000-000000000001', '4c400001-0000-4000-8000-000000000001', 'Owned person'),
  ('4c430002-0000-4000-8000-000000000002', '4c400001-0000-4000-8000-000000000001', 'Owned waiting person');

create temporary table phase2c4_fixture (
  label text primary key,
  entry_id uuid not null,
  interpretation_id uuid not null
);

insert into phase2c4_fixture values
  ('mixed', '4c440001-0000-4000-8000-000000000001', pg_temp.phase2c4_make_entry('4c440001-0000-4000-8000-000000000001', 4)),
  ('atomic', '4c440002-0000-4000-8000-000000000002', pg_temp.phase2c4_make_entry('4c440002-0000-4000-8000-000000000002', 2)),
  ('legacy', '4c440003-0000-4000-8000-000000000003', pg_temp.phase2c4_make_entry('4c440003-0000-4000-8000-000000000003', 1)),
  ('nonconfirm', '4c440004-0000-4000-8000-000000000004', pg_temp.phase2c4_make_entry('4c440004-0000-4000-8000-000000000004', 1)),
  ('attention', '4c440005-0000-4000-8000-000000000005', pg_temp.phase2c4_make_entry('4c440005-0000-4000-8000-000000000005', 2)),
  ('record', '4c440006-0000-4000-8000-000000000006', pg_temp.phase2c4_make_entry('4c440006-0000-4000-8000-000000000006', 1, true)),
  ('stale', '4c440007-0000-4000-8000-000000000007', pg_temp.phase2c4_make_entry('4c440007-0000-4000-8000-000000000007', 1));

select public.correct_entry_interpretation(
  '4c440007-0000-4000-8000-000000000007',
  1,
  jsonb_build_object(
    'summary', 'Stale fixture corrected',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'extractedDates', '[]'::jsonb,
    'entityLinks', '[]'::jsonb,
    'classifications', jsonb_build_object(
      'summary', 'interpretation',
      'concepts', 'interpretation',
      'occurredAt', 'fact',
      'entities', 'interpretation'
    ),
    'pendingQuestions', '[]'::jsonb,
    'elementTrust', jsonb_build_object(
      'summary', jsonb_build_object(
        'score', 0.9,
        'policy', 'auto_apply',
        'signals', '{}'::jsonb,
        'overrides', '[]'::jsonb,
        'evidence', '[]'::jsonb
      )
    ),
    'recordOnly', false
  ),
  'pgtap:phase2c4:stale-correction'
);

create temporary table phase2c4_result (
  label text primary key,
  result jsonb not null
);

-- Four outcomes and mixed atomicity -------------------------------------------

insert into phase2c4_result values (
  'mixed',
  pg_temp.phase2c4_confirm_v5(
    (select entry_id from phase2c4_fixture where label = 'mixed'),
    (select interpretation_id from phase2c4_fixture where label = 'mixed'),
    '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"rejected"},{"candidateIndex":2,"disposition":"retained"},{"candidateIndex":3,"disposition":"dismissed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object(
        'title', 'Edited confirmed candidate',
        'plannedAt', '2026-08-01T12:00:00Z',
        'manualPriority', 'high',
        'projectIds', jsonb_build_array('4c410001-0000-4000-8000-000000000001'),
        'contextIds', jsonb_build_array('4c420001-0000-4000-8000-000000000001'),
        'personIds', jsonb_build_array('4c430001-0000-4000-8000-000000000001'),
        'waitingOnPersonIds', jsonb_build_array('4c430002-0000-4000-8000-000000000002')
      )
    )),
    'pgtap:phase2c4:mixed'
  )
);

select is((select result ->> 'idempotent' from phase2c4_result where label = 'mixed'), 'false', 'the mixed request executes once');
select is(jsonb_array_length((select result -> 'task_ids' from phase2c4_result where label = 'mixed')), 1, 'only confirmed creates a task');
select results_eq(
  $$
    select candidate_index, disposition
    from public.entry_task_candidate_resolutions
    where entry_id = '4c440001-0000-4000-8000-000000000001'
    order by candidate_index
  $$,
  $$ values (0, 'confirmed'::text), (1, 'rejected'::text), (2, 'retained'::text), (3, 'dismissed'::text) $$,
  'all four closed terminal outcomes persist in one operation'
);
select results_eq(
  $$
    select title, manual_priority, planned_at
    from public.tasks
    where source_entry_id = '4c440001-0000-4000-8000-000000000001'
      and status <> 'cancelled'
  $$,
  $$ values ('Edited confirmed candidate'::text, 'high'::text, '2026-08-01T12:00:00Z'::timestamptz) $$,
  'confirmed still materializes the v4 edited planning contract'
);
select is((select count(*)::integer from public.task_projects where task_id = ((select result -> 'task_ids' ->> 0 from phase2c4_result where label = 'mixed')::uuid)), 1, 'confirmed still materializes owned projects');
select is((select count(*)::integer from public.task_contexts where task_id = ((select result -> 'task_ids' ->> 0 from phase2c4_result where label = 'mixed')::uuid)), 1, 'confirmed still materializes owned contexts');
select is((select count(*)::integer from public.task_people where task_id = ((select result -> 'task_ids' ->> 0 from phase2c4_result where label = 'mixed')::uuid)), 2, 'confirmed still materializes involved and waiting-on people');
select is((select action_type from public.undo_operations where id = ((select result ->> 'undo_id' from phase2c4_result where label = 'mixed')::uuid)), 'confirm_entry_task_candidates_v5', 'mixed outcomes share one explicit v5 undo action');
select is((select count(*)::integer from public.undo_operations where operation_key = 'confirm-v5:pgtap:phase2c4:mixed'), 1, 'mixed outcomes create exactly one undo operation');
select is((select count(*)::integer from public.audit_logs where action_type = 'confirm_entry_task_candidates_v5' and source_entry_id = '4c440001-0000-4000-8000-000000000001'), 1, 'mixed outcomes create one immutable audit record');
select ok(
  not exists (
    select 1
    from public.audit_logs
    where action_type = 'confirm_entry_task_candidates_v5'
      and source_entry_id = '4c440001-0000-4000-8000-000000000001'
      and after_state::text like '%Immutable description%'
  ),
  'audit evidence copies no candidate content'
);

-- Closed JSON, enum, atomic failure, ownership, and replay --------------------

select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'atomic'),
    (select interpretation_id from phase2c4_fixture where label = 'atomic'),
    '[{"candidateIndex":0,"disposition":"rejected","reason":"not allowed"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:unknown-key'
  ),
  '22023',
  'resolution objects reject unknown keys'
);
select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'atomic'),
    (select interpretation_id from phase2c4_fixture where label = 'atomic'),
    '[{"candidateIndex":0,"disposition":"cancelled"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:bad-enum'
  ),
  '22023',
  'cancelled is not a candidate disposition'
);
select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'atomic'),
    (select interpretation_id from phase2c4_fixture where label = 'atomic'),
    '[{"candidateIndex":0,"disposition":"rejected"},{"candidateIndex":0,"disposition":"dismissed"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:duplicate'
  ),
  '22023',
  'one batch cannot decide the same candidate twice'
);
select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'atomic'),
    (select interpretation_id from phase2c4_fixture where label = 'atomic'),
    '[{"candidateIndex":0,"disposition":"rejected"}]'::jsonb,
    '[{"candidateIndex":0,"changes":{"title":"Must not materialize"}}]'::jsonb,
    'pgtap:phase2c4:edit-nonconfirming'
  ),
  '22023',
  'candidate edits can target only confirmed resolutions'
);
select is((select count(*)::integer from public.entry_task_candidate_resolutions where entry_id = '4c440002-0000-4000-8000-000000000002'), 0, 'invalid mixed requests leave no resolution rows');
select is((select count(*)::integer from public.tasks where source_entry_id = '4c440002-0000-4000-8000-000000000002'), 0, 'invalid mixed requests leave no task rows');
select is((select count(*)::integer from public.undo_operations where source_entry_id = '4c440002-0000-4000-8000-000000000002'), 0, 'invalid mixed requests leave no undo rows');

select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'record'),
    (select interpretation_id from phase2c4_fixture where label = 'record'),
    '[{"candidateIndex":0,"disposition":"retained"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:record-only'
  ),
  '55000',
  'record-only interpretations reject dispositions'
);

select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'stale'),
    (select interpretation_id from phase2c4_fixture where label = 'stale'),
    '[{"candidateIndex":0,"disposition":"rejected"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:stale'
  ),
  '55P03',
  'a stale but owned interpretation is rejected atomically'
);

select set_config('request.jwt.claim.sub', '4c400002-0000-4000-8000-000000000002', true);
select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'atomic'),
    (select interpretation_id from phase2c4_fixture where label = 'atomic'),
    '[{"candidateIndex":0,"disposition":"rejected"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:cross-owner'
  ),
  'P0002',
  'cross-owner calls reveal no candidate state'
);
select set_config('request.jwt.claim.sub', '', true);
select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'atomic'),
    (select interpretation_id from phase2c4_fixture where label = 'atomic'),
    '[{"candidateIndex":0,"disposition":"rejected"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:anonymous'
  ),
  '42501',
  'anonymous calls are denied'
);
select set_config('request.jwt.claim.sub', '4c400001-0000-4000-8000-000000000001', true);

insert into phase2c4_result values (
  'mixed-replay',
  pg_temp.phase2c4_confirm_v5(
    (select entry_id from phase2c4_fixture where label = 'mixed'),
    (select interpretation_id from phase2c4_fixture where label = 'mixed'),
    '[{"candidateIndex":3,"disposition":"dismissed"},{"candidateIndex":2,"disposition":"retained"},{"candidateIndex":1,"disposition":"rejected"},{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'candidateIndex', 0,
      'changes', jsonb_build_object(
        'title', 'Edited confirmed candidate',
        'plannedAt', '2026-08-01T12:00:00Z',
        'manualPriority', 'high',
        'projectIds', jsonb_build_array('4c410001-0000-4000-8000-000000000001'),
        'contextIds', jsonb_build_array('4c420001-0000-4000-8000-000000000001'),
        'personIds', jsonb_build_array('4c430001-0000-4000-8000-000000000001'),
        'waitingOnPersonIds', jsonb_build_array('4c430002-0000-4000-8000-000000000002')
      )
    )),
    'pgtap:phase2c4:mixed'
  )
);

select is((select result ->> 'idempotent' from phase2c4_result where label = 'mixed-replay'), 'true', 'same semantic payload replays regardless of resolution order');
select is((select result -> 'task_ids' from phase2c4_result where label = 'mixed-replay'), (select result -> 'task_ids' from phase2c4_result where label = 'mixed'), 'replay returns the original task IDs');
select is((select result ->> 'undo_id' from phase2c4_result where label = 'mixed-replay'), (select result ->> 'undo_id' from phase2c4_result where label = 'mixed'), 'replay returns the original undo ID');
select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'mixed'),
    (select interpretation_id from phase2c4_fixture where label = 'mixed'),
    '[{"candidateIndex":0,"disposition":"confirmed"},{"candidateIndex":1,"disposition":"dismissed"},{"candidateIndex":2,"disposition":"retained"},{"candidateIndex":3,"disposition":"rejected"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:mixed'
  ),
  'P0001',
  'same key with a different canonical payload is rejected'
);
select is(
  pg_temp.phase2c4_error_state(
    (select entry_id from phase2c4_fixture where label = 'mixed'),
    (select interpretation_id from phase2c4_fixture where label = 'mixed'),
    '[{"candidateIndex":1,"disposition":"rejected"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:terminal-conflict'
  ),
  'P0001',
  'a terminal disposition cannot transition directly to another terminal operation'
);

-- Legacy guard, mixed/non-confirming undo, idempotency, and reconfirmation ----

insert into phase2c4_result values (
  'legacy-rejected',
  pg_temp.phase2c4_confirm_v5(
    (select entry_id from phase2c4_fixture where label = 'legacy'),
    (select interpretation_id from phase2c4_fixture where label = 'legacy'),
    '[{"candidateIndex":0,"disposition":"rejected"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:legacy-rejected'
  )
);
select is(
  (
    select sqlstate
    from (
      select pg_temp.phase2c4_error_state(
        (select entry_id from phase2c4_fixture where label = 'legacy'),
        (select interpretation_id from phase2c4_fixture where label = 'legacy'),
        '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
        '[]'::jsonb,
        'pgtap:phase2c4:v5-terminal-guard'
      ) as sqlstate
    ) as result
  ),
  'P0001',
  'v5 itself rejects a terminal candidate'
);
select is(
  (
    select pg_temp.phase2c4_error_state(
      (select entry_id from phase2c4_fixture where label = 'legacy'),
      (select interpretation_id from phase2c4_fixture where label = 'legacy'),
      '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
      '[]'::jsonb,
      'pgtap:phase2c4:v5-terminal-guard-two'
    )
  ),
  'P0001',
  'terminal state remains immutable across different operation keys'
);
select throws_ok(
  $$
    select public.confirm_entry_task_candidates_v4(
      '4c440003-0000-4000-8000-000000000003',
      (select interpretation_id from phase2c4_fixture where label = 'legacy'),
      array[0],
      '[]'::jsonb,
      'pgtap:phase2c4:legacy-v4-blocked'
    )
  $$,
  'P0001',
  'Candidate already has a terminal disposition',
  'the database guard stops a legacy RPC from materializing a non-confirmed terminal candidate'
);

insert into phase2c4_result values (
  'nonconfirm',
  pg_temp.phase2c4_confirm_v5(
    (select entry_id from phase2c4_fixture where label = 'nonconfirm'),
    (select interpretation_id from phase2c4_fixture where label = 'nonconfirm'),
    '[{"candidateIndex":0,"disposition":"dismissed"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:nonconfirm'
  )
);
select is((select count(*)::integer from public.tasks where source_entry_id = '4c440004-0000-4000-8000-000000000004'), 0, 'a non-confirming-only batch creates no task');
select is(
  (public.undo_operation((select result ->> 'undo_id' from phase2c4_result where label = 'nonconfirm')::uuid))->>'undone',
  'true',
  'a non-confirming-only operation is undoable'
);
select is((select count(*)::integer from public.entry_task_candidate_resolutions where entry_id = '4c440004-0000-4000-8000-000000000004'), 0, 'non-confirming undo restores pending by removing only its resolution');

select is(
  (public.undo_operation((select result ->> 'undo_id' from phase2c4_result where label = 'mixed')::uuid))->>'undone',
  'true',
  'one undo compensates the complete mixed operation'
);
select is((select count(*)::integer from public.entry_task_candidate_resolutions where entry_id = '4c440001-0000-4000-8000-000000000001'), 0, 'mixed undo restores every candidate in that operation to pending');
select is((select status from public.tasks where source_entry_id = '4c440001-0000-4000-8000-000000000001'), 'cancelled', 'mixed undo cancels only its confirmed task');
select is((select count(*)::integer from public.entry_task_candidate_resolutions where entry_id = '4c440003-0000-4000-8000-000000000003'), 1, 'mixed undo leaves another operation''s terminal resolution untouched');
select is((select count(*)::integer from public.audit_logs where action_type = 'confirm_entry_task_candidates_v5' and source_entry_id = '4c440001-0000-4000-8000-000000000001'), 1, 'undo preserves historical v5 audit evidence');
select is(
  (public.undo_operation((select result ->> 'undo_id' from phase2c4_result where label = 'mixed')::uuid))->>'idempotent',
  'true',
  'mixed undo is idempotent'
);

insert into phase2c4_result values (
  'reconfirm',
  pg_temp.phase2c4_confirm_v5(
    (select entry_id from phase2c4_fixture where label = 'mixed'),
    (select interpretation_id from phase2c4_fixture where label = 'mixed'),
    '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:reconfirm'
  )
);
select is((select result ->> 'idempotent' from phase2c4_result where label = 'reconfirm'), 'false', 'a supported undo permits later reconfirmation with a new key');
select results_eq(
  $$
    select status, count(*)::bigint
    from public.tasks
    where source_entry_id = '4c440001-0000-4000-8000-000000000001'
      and candidate_index = 0
    group by status
    order by status
  $$,
  $$ values ('cancelled'::text, 1::bigint), ('inbox'::text, 1::bigint) $$,
  'reconfirmation preserves cancelled history and creates one active task'
);

-- Needs Attention partial, all-resolved, and undo convergence ----------------

select is(
  (select reason from public.list_needs_attention(200, null, null) where entry_id = '4c440005-0000-4000-8000-000000000005'),
  'confirm_existing_candidates',
  'an entry with pending candidates needs attention'
);
insert into phase2c4_result values (
  'attention-first',
  pg_temp.phase2c4_confirm_v5(
    (select entry_id from phase2c4_fixture where label = 'attention'),
    (select interpretation_id from phase2c4_fixture where label = 'attention'),
    '[{"candidateIndex":0,"disposition":"rejected"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:attention-first'
  )
);
select is(
  (select reason from public.list_needs_attention(200, null, null) where entry_id = '4c440005-0000-4000-8000-000000000005'),
  'confirm_existing_candidates',
  'a partially resolved entry remains in Needs Attention'
);
insert into phase2c4_result values (
  'attention-second',
  pg_temp.phase2c4_confirm_v5(
    (select entry_id from phase2c4_fixture where label = 'attention'),
    (select interpretation_id from phase2c4_fixture where label = 'attention'),
    '[{"candidateIndex":1,"disposition":"retained"}]'::jsonb,
    '[]'::jsonb,
    'pgtap:phase2c4:attention-second'
  )
);
select ok(
  not exists (
    select 1
    from public.list_needs_attention(200, null, null)
    where entry_id = '4c440005-0000-4000-8000-000000000005'
  ),
  'an entry leaves Needs Attention when every candidate is terminal'
);
select is(
  (public.undo_operation((select result ->> 'undo_id' from phase2c4_result where label = 'attention-second')::uuid))->>'undone',
  'true',
  'undoing one terminal resolution succeeds'
);
select is(
  (select reason from public.list_needs_attention(200, null, null) where entry_id = '4c440005-0000-4000-8000-000000000005'),
  'confirm_existing_candidates',
  'Needs Attention reappears after undo restores one candidate to pending'
);

select * from finish();

rollback;
