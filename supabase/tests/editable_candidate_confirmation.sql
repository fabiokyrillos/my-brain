begin;

select plan(74);

-- Structural RED: migration 032 does not exist yet. Every lookup is guarded so
-- the file reports contract failures instead of aborting on an undefined RPC.
select has_function(
  'public',
  'confirm_entry_task_candidates_v2',
  array['uuid', 'uuid', 'integer[]', 'jsonb', 'text'],
  'the exact editable candidate confirmation v2 signature exists'
);

select is(
  coalesce((
    select pg_get_function_result(procedure.oid)
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )
  ), 'missing'),
  'jsonb',
  'editable candidate confirmation returns jsonb'
);

select is(
  coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )
  ), false),
  true,
  'editable candidate confirmation is SECURITY DEFINER'
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
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )
  ), false),
  true,
  'editable candidate confirmation has an explicit empty search_path'
);

select ok(
  case
    when to_regprocedure('public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)') is null
      then false
    else has_function_privilege(
      'authenticated',
      to_regprocedure('public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'),
      'execute'
    )
  end,
  'authenticated can execute editable candidate confirmation'
);

select ok(
  case
    when to_regprocedure('public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)') is null
      then false
    else not has_function_privilege(
      'anon',
      to_regprocedure('public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'),
      'execute'
    )
  end,
  'anon cannot execute editable candidate confirmation'
);

select ok(
  coalesce((
    select not exists (
      select 1
      from aclexplode(coalesce(
        procedure.proacl,
        acldefault('f', procedure.proowner)
      )) as privilege
      where privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    )
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )
  ), false),
  'PUBLIC cannot execute editable candidate confirmation'
);

select has_function(
  'public',
  'confirm_entry_task_candidates',
  array['uuid', 'uuid', 'integer[]', 'text'],
  'the legacy candidate confirmation signature remains available during rollout'
);

select has_function(
  'extensions',
  'digest',
  array['bytea', 'text'],
  'the authorized database exposes extensions.digest(bytea, text) for SHA-256 fingerprints'
);

select has_function(
  'extensions',
  'encode',
  array['bytea', 'text'],
  'the authorized database exposes extensions.encode(bytea, text) for hexadecimal fingerprints'
);

select has_column(
  'public',
  'undo_operations',
  'request_fingerprint',
  'undo evidence stores the canonical request fingerprint'
);

select col_type_is(
  'public',
  'undo_operations',
  'request_fingerprint',
  'text',
  'request fingerprints use the bounded text representation'
);

select col_is_null(
  'public',
  'undo_operations',
  'request_fingerprint',
  'legacy undo evidence may leave request_fingerprint null'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.undo_operations'::regclass
      and position('request_fingerprint' in pg_get_constraintdef(constraint_row.oid)) > 0
      and lower(pg_get_constraintdef(constraint_row.oid)) like '%request_fingerprint is null%'
      and lower(pg_get_constraintdef(constraint_row.oid)) like '%^[0-9a-f]{64}$%'
  ),
  'request fingerprints are null or exactly 64 lowercase hexadecimal characters'
);

select ok(
  coalesce(
    pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )) like '%extensions.digest%'
    and pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )) like '%extensions.encode%',
    false
  )
  and coalesce(
    lower(pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    ))) like '%sha256%',
    false
  ),
  'the canonical fingerprint uses schema-qualified helpers with the SHA-256 algorithm'
);

select ok(
  coalesce(
    pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )) like '%confirm-v2:%'
    and pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )) like '%request_fingerprint%'
    and pg_get_functiondef(to_regprocedure(
      'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
    )) like '%for update%',
    false
  ),
  'the RPC declares the reservation and row-lock primitives required by the separate two-session concurrency gate'
);

create or replace function pg_temp.phase2c_confirm_v2(
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
    'public.confirm_entry_task_candidates_v2(uuid,uuid,integer[],jsonb,text)'
  ) is null then
    return jsonb_build_object('__phase_2c_contract_missing__', true);
  end if;

  execute 'select public.confirm_entry_task_candidates_v2($1, $2, $3, $4, $5)'
  into result
  using p_entry_id, p_expected_interpretation_id, p_candidate_indexes,
    p_candidate_edits, p_operation_key;
  return result;
end;
$$;

create or replace function pg_temp.phase2c_error_code(
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
  perform pg_temp.phase2c_confirm_v2(
    p_entry_id,
    p_expected_interpretation_id,
    p_candidate_indexes,
    p_candidate_edits,
    p_operation_key
  );
  return null;
exception when others then
  return sqlstate;
end;
$$;

create or replace function pg_temp.phase2c_error_detail(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_indexes integer[],
  p_candidate_edits jsonb,
  p_operation_key text
)
returns text
language plpgsql
as $$
declare
  error_detail text;
begin
  perform pg_temp.phase2c_confirm_v2(
    p_entry_id,
    p_expected_interpretation_id,
    p_candidate_indexes,
    p_candidate_edits,
    p_operation_key
  );
  return null;
exception when others then
  get stacked diagnostics error_detail = pg_exception_detail;
  return error_detail;
end;
$$;

create or replace function pg_temp.phase2c_sha256(p_payload jsonb)
returns text
language plpgsql
as $$
declare
  fingerprint text;
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null
    or to_regprocedure('extensions.encode(bytea,text)') is null
  then
    return null;
  end if;

  execute $sha$
    select extensions.encode(
      extensions.digest(convert_to($1::text, 'UTF8'), 'sha256'),
      'hex'
    )
  $sha$
  into fingerprint
  using p_payload;
  return fingerprint;
exception when others then
  return null;
end;
$$;

create or replace function pg_temp.phase2c_undo(p_undo_id uuid)
returns jsonb
language plpgsql
as $$
begin
  if p_undo_id is null then
    return jsonb_build_object('__phase_2c_undo_missing__', true);
  end if;
  return public.undo_operation(p_undo_id);
exception when others then
  return jsonb_build_object('__phase_2c_undo_error__', sqlstate);
end;
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '2c000001-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'phase-2c-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '2c000002-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'phase-2c-other@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

select set_config('request.jwt.claim.sub', '2c000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.entries (id, user_id, original_content, source, status, locale) values
  (
    '2c100001-0000-4000-8000-000000000001',
    '2c000001-0000-4000-8000-000000000001',
    'Phase 2C editable confirmation fixture', 'web', 'saved', 'en'
  ),
  (
    '2c100002-0000-4000-8000-000000000002',
    '2c000001-0000-4000-8000-000000000001',
    'Phase 2C atomicity fixture', 'web', 'saved', 'en'
  ),
  (
    '2c100003-0000-4000-8000-000000000003',
    '2c000001-0000-4000-8000-000000000001',
    'Phase 2C stale interpretation fixture', 'web', 'saved', 'en'
  ),
  (
    '2c100004-0000-4000-8000-000000000004',
    '2c000001-0000-4000-8000-000000000001',
    'Phase 2C record-only fixture', 'web', 'saved', 'en'
  ),
  (
    '2c100005-0000-4000-8000-000000000005',
    '2c000001-0000-4000-8000-000000000001',
    'Phase 2C bounds and effective-value fixture', 'web', 'saved', 'en'
  );

select public.persist_entry_interpretation(
  fixture.entry_id,
  jsonb_build_object(
    'summary', 'Phase 2C fixture ' || fixture.label,
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'people', jsonb_build_array(
      jsonb_build_object(
        'name', 'Phase 2C linked person',
        'evidence', 'Explicit interpretation-level link',
        'confidence', 0.9
      )
    ),
    'taskCandidates', jsonb_build_array(
      jsonb_build_object(
        'title', 'Candidate zero',
        'description', 'Original description',
        'dueAt', '2026-07-20T09:00:00-03:00',
        'waitingOn', 'Legacy waiting state must not be copied',
        'parentIndex', null,
        'confidence', 0.9
      ),
      jsonb_build_object(
        'title', 'Candidate one',
        'description', null,
        'dueAt', null,
        'waitingOn', null,
        'parentIndex', 0,
        'confidence', 0.8
      ),
      jsonb_build_object(
        'title', 'Candidate two',
        'description', null,
        'dueAt', null,
        'waitingOn', null,
        'parentIndex', null,
        'confidence', 0.7
      )
    ),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
)
from (values
  ('2c100001-0000-4000-8000-000000000001'::uuid, 'main'),
  ('2c100002-0000-4000-8000-000000000002'::uuid, 'atomic'),
  ('2c100003-0000-4000-8000-000000000003'::uuid, 'stale'),
  ('2c100004-0000-4000-8000-000000000004'::uuid, 'record-only')
) fixture(entry_id, label);

select public.persist_entry_interpretation(
  '2c100005-0000-4000-8000-000000000005',
  jsonb_build_object(
    'summary', 'Phase 2C bounds fixture',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'taskCandidates', (
      select jsonb_agg(
        jsonb_build_object(
          'title', 'Bounded candidate ' || candidate_index,
          'description', 'Original bounded description ' || candidate_index,
          'dueAt', '2026-07-20T09:00:00-03:00',
          'waitingOn', null,
          'parentIndex', null,
          'confidence', 0.9
        )
        order by candidate_index
      )
      from generate_series(0, 50) as generated(candidate_index)
    ),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
);

-- Move the main fixture to a completed current interpretation while preserving
-- the immutable candidates, so partial confirmation remains Needs Attention.
select public.correct_entry_interpretation(
  '2c100001-0000-4000-8000-000000000001',
  1,
  jsonb_build_object(
    'summary', 'Phase 2C main fixture ready',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'extractedDates', '[]'::jsonb,
    'entityLinks', jsonb_build_array(
      jsonb_build_object(
        'entityType', 'person',
        'entityId', (
          select id
          from public.people
          where user_id = '2c000001-0000-4000-8000-000000000001'
            and name = 'Phase 2C linked person'
        ),
        'mention', 'Phase 2C linked person',
        'confidence', 0.9
      )
    ),
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
  'pgtap:phase2c:main-ready'
);

select public.correct_entry_interpretation(
  '2c100003-0000-4000-8000-000000000003',
  1,
  jsonb_build_object(
    'summary', 'Phase 2C stale fixture v2',
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
  'pgtap:phase2c:stale-v2'
);

select public.correct_entry_interpretation(
  '2c100004-0000-4000-8000-000000000004',
  1,
  jsonb_build_object(
    'summary', 'Phase 2C record-only fixture v2',
    'concepts', jsonb_build_array('note'),
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
    'recordOnly', true
  ),
  'pgtap:phase2c:record-only-v2'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select is(
  pg_temp.phase2c_error_code(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0],
    '[]'::jsonb,
    'pgtap:phase2c:anonymous'
  ),
  '42501',
  'anonymous candidate confirmation is denied'
);

select set_config('request.jwt.claim.sub', '2c000002-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  pg_temp.phase2c_error_code(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0],
    '[]'::jsonb,
    'pgtap:phase2c:cross-owner'
  ),
  'P0002',
  'cross-owner confirmation is denied without disclosing ownership'
);

select set_config('request.jwt.claim.sub', '2c000001-0000-4000-8000-000000000001', true);

select is(
  pg_temp.phase2c_error_code(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0],
    '{}'::jsonb,
    'pgtap:phase2c:malformed-edits'
  ),
  '22023',
  'a non-array edit payload is rejected'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0],
    '[{"candidateIndex":0,"changes":{"priority":"high"}}]'::jsonb,
    'pgtap:phase2c:unknown-field'
  ),
  '22023',
  'an unknown edit field is rejected'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0, 0],
    '[]'::jsonb,
    'pgtap:phase2c:duplicate-selection'
  ),
  '22023',
  'duplicate selected candidate indices are rejected rather than deduplicated'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0],
    '[{"candidateIndex":0,"changes":{"title":"First"}},{"candidateIndex":0,"changes":{"title":"Second"}}]'::jsonb,
    'pgtap:phase2c:duplicate-edits'
  ),
  '22023',
  'duplicate candidate edit indices are rejected'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0],
    '[{"candidateIndex":1,"changes":{"title":"Unselected edit"}}]'::jsonb,
    'pgtap:phase2c:unselected-edit'
  ),
  '22023',
  'an edit for an unselected candidate is rejected'
);

select results_eq(
  $$
    with contract_case(label, selected_indexes, candidate_edits, operation_key) as (
      values
        ('candidate index is fractional', array[0], '[{"candidateIndex":0.5,"changes":{"title":"Edited"}}]'::jsonb, 'pgtap:phase2c:fractional-index'),
        ('candidate index is negative', array[0], '[{"candidateIndex":-1,"changes":{"title":"Edited"}}]'::jsonb, 'pgtap:phase2c:negative-index'),
        ('changes is not an object', array[0], '[{"candidateIndex":0,"changes":[]}]'::jsonb, 'pgtap:phase2c:changes-shape'),
        ('description has the wrong scalar type', array[0], '[{"candidateIndex":0,"changes":{"description":42}}]'::jsonb, 'pgtap:phase2c:description-type'),
        ('description is over 2000 characters', array[0], jsonb_build_array(jsonb_build_object('candidateIndex', 0, 'changes', jsonb_build_object('description', repeat('d', 2001)))), 'pgtap:phase2c:long-description'),
        ('due date lacks an offset', array[0], '[{"candidateIndex":0,"changes":{"dueAt":"2026-07-22T09:00:00"}}]'::jsonb, 'pgtap:phase2c:offsetless-due'),
        ('edit has an extra top-level key', array[0], '[{"candidateIndex":0,"changes":{},"ownerId":"2c000002-0000-4000-8000-000000000002"}]'::jsonb, 'pgtap:phase2c:extra-edit-key'),
        ('edit is missing candidateIndex', array[0], '[{"changes":{"title":"Edited"}}]'::jsonb, 'pgtap:phase2c:missing-index'),
        ('edit is missing changes', array[0], '[{"candidateIndex":0}]'::jsonb, 'pgtap:phase2c:missing-changes'),
        ('edit payload is null', array[0], null::jsonb, 'pgtap:phase2c:null-edits'),
        ('operation key is shorter than eight characters', array[0], '[]'::jsonb, 'short'),
        ('operation key is longer than 240 characters', array[0], '[]'::jsonb, repeat('k', 241)),
        ('selected index is out of range', array[99], '[]'::jsonb, 'pgtap:phase2c:out-of-range'),
        ('selection is empty', array[]::integer[], '[]'::jsonb, 'pgtap:phase2c:empty-selection'),
        ('title has the wrong scalar type', array[0], '[{"candidateIndex":0,"changes":{"title":42}}]'::jsonb, 'pgtap:phase2c:title-type'),
        ('title is empty', array[0], '[{"candidateIndex":0,"changes":{"title":""}}]'::jsonb, 'pgtap:phase2c:empty-title'),
        ('title is null', array[0], '[{"candidateIndex":0,"changes":{"title":null}}]'::jsonb, 'pgtap:phase2c:null-title'),
        ('title is over 240 characters', array[0], jsonb_build_array(jsonb_build_object('candidateIndex', 0, 'changes', jsonb_build_object('title', repeat('t', 241)))), 'pgtap:phase2c:long-title'),
        ('title is whitespace only', array[0], '[{"candidateIndex":0,"changes":{"title":"   "}}]'::jsonb, 'pgtap:phase2c:whitespace-title')
    )
    select
      contract_case.label,
      pg_temp.phase2c_error_code(
        '2c100001-0000-4000-8000-000000000001',
        (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
        contract_case.selected_indexes,
        contract_case.candidate_edits,
        contract_case.operation_key
      )
    from contract_case
    order by contract_case.label
  $$,
  $$
    values
      ('candidate index is fractional', '22023'::text),
      ('candidate index is negative', '22023'::text),
      ('changes is not an object', '22023'::text),
      ('description has the wrong scalar type', '22023'::text),
      ('description is over 2000 characters', '22023'::text),
      ('due date lacks an offset', '22023'::text),
      ('edit has an extra top-level key', '22023'::text),
      ('edit is missing candidateIndex', '22023'::text),
      ('edit is missing changes', '22023'::text),
      ('edit payload is null', '22023'::text),
      ('operation key is longer than 240 characters', '22023'::text),
      ('operation key is shorter than eight characters', '22023'::text),
      ('selected index is out of range', '22023'::text),
      ('selection is empty', '22023'::text),
      ('title has the wrong scalar type', '22023'::text),
      ('title is empty', '22023'::text),
      ('title is null', '22023'::text),
      ('title is over 240 characters', '22023'::text),
      ('title is whitespace only', '22023'::text)
  $$,
  'closed edit JSON, scalar types, bounds, and operation-key limits are rejected'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100005-0000-4000-8000-000000000005',
    (select current_interpretation_id from public.entries where id = '2c100005-0000-4000-8000-000000000005'),
    array(select generate_series(0, 50)),
    '[]'::jsonb,
    'pgtap:phase2c:oversized-selection'
  ),
  '22023',
  'a 51-item selection is rejected even when every candidate index exists'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100005-0000-4000-8000-000000000005',
    (select current_interpretation_id from public.entries where id = '2c100005-0000-4000-8000-000000000005'),
    array(select generate_series(0, 50)),
    (
      select jsonb_agg(
        jsonb_build_object(
          'candidateIndex', candidate_index,
          'changes', jsonb_build_object('title', 'Edited bounded candidate ' || candidate_index)
        )
        order by candidate_index
      )
      from generate_series(0, 50) as generated(candidate_index)
    ),
    'pgtap:phase2c:oversized-edits'
  ),
  '22023',
  'a 51-item edit list is rejected with valid unique candidate indices'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100005-0000-4000-8000-000000000005',
    (select current_interpretation_id from public.entries where id = '2c100005-0000-4000-8000-000000000005'),
    array(select generate_series(0, 49)),
    (
      select jsonb_agg(
        jsonb_build_object(
          'candidateIndex', candidate_index,
          'changes', jsonb_build_object('description', repeat(chr(233), 2000))
        )
        order by candidate_index
      )
      from generate_series(0, 49) as generated(candidate_index)
    ),
    'pgtap:phase2c:oversized-utf8-payload'
  ),
  '22023',
  'a structurally valid edit list over 131072 UTF-8 bytes is rejected'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100003-0000-4000-8000-000000000003',
    (select id from public.entry_interpretations where entry_id = '2c100003-0000-4000-8000-000000000003' and version = 1),
    array[0],
    '[]'::jsonb,
    'pgtap:phase2c:stale'
  ),
  '55P03',
  'a stale expected interpretation is rejected with the proved retryable code'
);

select is(
  pg_temp.phase2c_error_code(
    '2c100004-0000-4000-8000-000000000004',
    (select current_interpretation_id from public.entries where id = '2c100004-0000-4000-8000-000000000004'),
    array[0],
    '[]'::jsonb,
    'pgtap:phase2c:record-only'
  ),
  '55000',
  'a record-only interpretation rejects candidate materialization'
);

create temporary table phase2c_atomic_snapshot as
select
  (select count(*) from public.tasks where user_id = '2c000001-0000-4000-8000-000000000001') as task_count,
  (select count(*) from public.audit_logs where user_id = '2c000001-0000-4000-8000-000000000001') as audit_count,
  (select count(*) from public.undo_operations where user_id = '2c000001-0000-4000-8000-000000000001') as undo_count,
  (select count(*) from public.task_people where user_id = '2c000001-0000-4000-8000-000000000001') as task_people_count,
  (select count(*) from public.task_projects where user_id = '2c000001-0000-4000-8000-000000000001') as task_projects_count,
  (select count(*) from public.task_contexts where user_id = '2c000001-0000-4000-8000-000000000001') as task_contexts_count,
  (select count(*) from public.task_dependencies where user_id = '2c000001-0000-4000-8000-000000000001') as dependency_count;

select is(
  pg_temp.phase2c_error_code(
    '2c100002-0000-4000-8000-000000000002',
    (select current_interpretation_id from public.entries where id = '2c100002-0000-4000-8000-000000000002'),
    array[0, 99],
    '[]'::jsonb,
    'pgtap:phase2c:atomic-invalid'
  ),
  '22023',
  'a mixed valid and invalid selection rejects the complete transaction'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where source_entry_id = '2c100002-0000-4000-8000-000000000002'
  $$,
  array[0::bigint],
  'a rejected mixed selection creates no partial task'
);

select results_eq(
  $$
    select
      (select count(*) from public.tasks where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.audit_logs where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.undo_operations where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.task_people where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.task_projects where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.task_contexts where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.task_dependencies where user_id = '2c000001-0000-4000-8000-000000000001')
  $$,
  $$
    select
      task_count,
      audit_count,
      undo_count,
      task_people_count,
      task_projects_count,
      task_contexts_count,
      dependency_count
    from phase2c_atomic_snapshot
  $$,
  'a rejected transaction leaves task, evidence, relation, and dependency counts unchanged'
);

create temporary table phase2c_clear_result as
select pg_temp.phase2c_confirm_v2(
  '2c100005-0000-4000-8000-000000000005',
  (select current_interpretation_id from public.entries where id = '2c100005-0000-4000-8000-000000000005'),
  array[0],
  '[{"candidateIndex":0,"changes":{"description":"   ","dueAt":null}}]'::jsonb,
  'pgtap:phase2c:bounded-clear'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c_clear_result),
  'false',
  'a whitespace description and explicit due clear form a valid first confirmation'
);

select results_eq(
  $$
    select description is null and due_at is null
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id
      from public.entries
      where id = '2c100005-0000-4000-8000-000000000005'
    )
      and candidate_index = 0
  $$,
  array[true],
  'whitespace-only description canonicalizes to null and explicit dueAt null clears the suggestion'
);

create temporary table phase2c_no_edit_result as
select pg_temp.phase2c_confirm_v2(
  '2c100005-0000-4000-8000-000000000005',
  (select current_interpretation_id from public.entries where id = '2c100005-0000-4000-8000-000000000005'),
  array[1],
  '[]'::jsonb,
  'pgtap:phase2c:no-edits'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c_no_edit_result),
  'false',
  'a selected candidate with no edit objects is a valid first confirmation'
);

select results_eq(
  $$
    select
      title = 'Bounded candidate 1'
      and description = 'Original bounded description 1'
      and due_at = '2026-07-20T09:00:00-03:00'::timestamptz
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id
      from public.entries
      where id = '2c100005-0000-4000-8000-000000000005'
    )
      and candidate_index = 1
  $$,
  array[true],
  'a no-edit confirmation materializes every immutable suggestion value exactly'
);

create temporary table phase2c_first_result as
select pg_temp.phase2c_confirm_v2(
  '2c100001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
  array[0, 1],
  '[{"candidateIndex":0,"changes":{"title":"  Edited candidate zero  ","description":null,"dueAt":"2026-07-22T09:00:00-03:00"}},{"candidateIndex":1,"changes":{"description":"  Reserve projector  "}}]'::jsonb,
  'pgtap:phase2c:main-operation'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c_first_result),
  'false',
  'the first editable confirmation is not reported as a replay'
);

select is(
  (select jsonb_array_length(result -> 'task_ids') from phase2c_first_result),
  2,
  'the result contains exactly the selected materialized tasks'
);

select is(
  coalesce((select result -> 'task_ids' from phase2c_first_result), '["00000000-0000-0000-0000-000000000000"]'::jsonb),
  coalesce((
    select to_jsonb(array_agg(task.id order by task.candidate_index))
    from public.tasks task
    where task.source_interpretation_id = (
      select current_interpretation_id
      from public.entries
      where id = '2c100001-0000-4000-8000-000000000001'
    )
      and task.candidate_index = any(array[0, 1])
  ), '[]'::jsonb),
  'result task IDs are ordered by candidate index'
);

select results_eq(
  $$
    select title
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and candidate_index = 0
  $$,
  array['Edited candidate zero'],
  'the exact normalized edited title is materialized'
);

select results_eq(
  $$
    select description
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and candidate_index = 0
  $$,
  array[null::text],
  'an explicit description clear materializes null'
);

select results_eq(
  $$
    select due_at = '2026-07-22T09:00:00-03:00'::timestamptz
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and candidate_index = 0
  $$,
  array[true],
  'the exact edited offset-bearing due instant is materialized'
);

select results_eq(
  $$
    select title
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and candidate_index = 1
  $$,
  array['Candidate one'],
  'an omitted title uses the immutable suggestion'
);

select results_eq(
  $$
    select description
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and candidate_index = 1
  $$,
  array['Reserve projector'],
  'the exact normalized edited description is materialized'
);

select results_eq(
  $$
    select bool_and(
      status = 'inbox'
      and manual_priority is null
      and planned_at is null
      and intentional_no_due = false
      and no_due_reason is null
      and waiting_on_person_id is null
      and parent_task_id is null
    )
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and candidate_index = any(array[0, 1])
  $$,
  array[true],
  'materialized tasks keep the exact Phase 2C.1 core semantics'
);

select results_eq(
  $$
    select task_candidates -> 0 ->> 'title'
    from public.entry_interpretations
    where id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    )
  $$,
  array['Candidate zero'],
  'the immutable original candidate remains unchanged'
);

select results_eq(
  $$
    select bool_and(
      user_id = '2c000001-0000-4000-8000-000000000001'
      and source_entry_id = '2c100001-0000-4000-8000-000000000001'
      and source_interpretation_id = (
        select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
      )
      and operation_key = 'pgtap:phase2c:main-operation'
    )
    from public.tasks
    where source_entry_id = '2c100001-0000-4000-8000-000000000001'
      and candidate_index = any(array[0, 1])
  $$,
  array[true],
  'materialized tasks preserve owner, entry, interpretation, candidate, and operation provenance'
);

select results_eq(
  $$
    select candidate_index, confidence, created_by
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id
      from public.entries
      where id = '2c100001-0000-4000-8000-000000000001'
    )
      and candidate_index = any(array[0, 1])
    order by candidate_index
  $$,
  $$
    values
      (0, 0.900::numeric, 'user'::text),
      (1, 0.800::numeric, 'user'::text)
  $$,
  'materialized tasks preserve immutable confidence and the explicit user creator provenance'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and candidate_index = 2
  $$,
  array[0::bigint],
  'partial confirmation leaves the unselected candidate unresolved'
);

select is(
  (
    select reason
    from public.list_needs_attention(50, null, null)
    where entry_id = '2c100001-0000-4000-8000-000000000001'
  ),
  'confirm_existing_candidates',
  'partial confirmation keeps the unselected candidate actionable in Needs Attention'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where user_id = '2c000001-0000-4000-8000-000000000001'
      and source_entry_id = '2c100001-0000-4000-8000-000000000001'
      and action_type = 'tasks_confirmed'
  ),
  'editable confirmation creates audit evidence'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.audit_logs
    where user_id = '2c000001-0000-4000-8000-000000000001'
      and source_entry_id = '2c100001-0000-4000-8000-000000000001'
      and action_type = 'tasks_confirmed'
  $$,
  array[1::bigint],
  'editable confirmation creates exactly one domain audit row'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where user_id = '2c000001-0000-4000-8000-000000000001'
      and source_entry_id = '2c100001-0000-4000-8000-000000000001'
      and action_type = 'tasks_confirmed'
      and after_state ? 'request_fingerprint'
      and after_state ? 'edited_fields'
      and after_state -> 'task_ids' = (select result -> 'task_ids' from phase2c_first_result)
      and after_state -> 'candidate_indexes' = '[0,1]'::jsonb
      and after_state ->> 'interpretation_id' = (
        select current_interpretation_id::text
        from public.entries
        where id = '2c100001-0000-4000-8000-000000000001'
      )
      and after_state -> 'edited_fields' = '["title","description","dueAt"]'::jsonb
  ),
  'audit evidence records IDs, edited field names, and the request fingerprint without candidate content'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where user_id = '2c000001-0000-4000-8000-000000000001'
      and source_entry_id = '2c100001-0000-4000-8000-000000000001'
      and action_type = 'tasks_confirmed'
      and after_state ? 'task_ids'
      and after_state ? 'candidate_indexes'
      and after_state ? 'interpretation_id'
      and after_state ? 'request_fingerprint'
      and after_state ? 'edited_fields'
      and (
        select array_agg(audit_key.key order by audit_key.key)
        from jsonb_object_keys(after_state) as audit_key(key)
      ) = array[
        'candidate_indexes',
        'edited_fields',
        'interpretation_id',
        'request_fingerprint',
        'task_ids'
      ]::text[]
      and after_state::text not like '%Edited candidate zero%'
      and after_state::text not like '%Reserve projector%'
      and after_state::text not like '%2026-07-22T09:00:00-03:00%'
  ),
  'audit metadata contains the bounded identifiers but no edited candidate values'
);

select ok(
  exists (
    select 1
    from public.undo_operations operation
    where operation.id = ((select result ->> 'undo_id' from phase2c_first_result)::uuid)
      and operation.user_id = '2c000001-0000-4000-8000-000000000001'
      and operation.operation_key = 'confirm-v2:pgtap:phase2c:main-operation'
      and operation.action_type = 'confirm_entry_task_candidates'
      and operation.entity_type = 'task'
      and operation.source_entry_id = '2c100001-0000-4000-8000-000000000001'
      and operation.source_interpretation_id = (
        select current_interpretation_id
        from public.entries
        where id = '2c100001-0000-4000-8000-000000000001'
      )
      and operation.entity_ids = (
        select array_agg(task.id order by task.candidate_index)
        from public.tasks task
        where task.source_interpretation_id = (
          select current_interpretation_id
          from public.entries
          where id = '2c100001-0000-4000-8000-000000000001'
        )
          and task.candidate_index = any(array[0, 1])
      )
      and operation.after_state ->> 'entry_id' = '2c100001-0000-4000-8000-000000000001'
      and operation.after_state ->> 'interpretation_id' = operation.source_interpretation_id::text
      and operation.after_state -> 'task_ids' = (select result -> 'task_ids' from phase2c_first_result)
      and operation.after_state -> 'candidate_indexes' = '[0,1]'::jsonb
      and operation.after_state -> 'edited_fields' = '["title","description","dueAt"]'::jsonb
      and (
        select array_agg(undo_key.key order by undo_key.key)
        from jsonb_object_keys(operation.after_state) as undo_key(key)
      ) = array[
        'candidate_indexes',
        'edited_fields',
        'entry_id',
        'interpretation_id',
        'task_ids'
      ]::text[]
  ),
  'editable confirmation stores bounded undo evidence for the exact task IDs'
);

select ok(
  exists (
    select 1
    from public.undo_operations operation
    where operation.id = ((select result ->> 'undo_id' from phase2c_first_result)::uuid)
      and operation.request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  'the persisted canonical request fingerprint is lowercase SHA-256 hex'
);

select results_eq(
  $$
    select operation.request_fingerprint
    from public.undo_operations operation
    where operation.id = ((select result ->> 'undo_id' from phase2c_first_result)::uuid)
  $$,
  $$
    select pg_temp.phase2c_sha256(
      jsonb_build_object(
        'entryId', '2c100001-0000-4000-8000-000000000001'::uuid,
        'interpretationId', (
          select current_interpretation_id
          from public.entries
          where id = '2c100001-0000-4000-8000-000000000001'
        ),
        'selectedCandidateIndexes', jsonb_build_array(0, 1),
        'candidateEdits', jsonb_build_array(
          jsonb_build_object(
            'candidateIndex', 0,
            'changes', jsonb_build_object(
              'title', 'Edited candidate zero',
              'description', null,
              'dueAt', '2026-07-22T09:00:00-03:00'
            )
          ),
          jsonb_build_object(
            'candidateIndex', 1,
            'changes', jsonb_build_object('description', 'Reserve projector')
          )
        )
      )
    )
  $$,
  'the persisted fingerprint is the SHA-256 of the exact canonical effective request'
);

select ok(
  exists (
    select 1
    from public.audit_logs audit
    join public.undo_operations operation
      on operation.id = ((select result ->> 'undo_id' from phase2c_first_result)::uuid)
    where audit.user_id = '2c000001-0000-4000-8000-000000000001'
      and audit.source_entry_id = '2c100001-0000-4000-8000-000000000001'
      and audit.action_type = 'tasks_confirmed'
      and audit.after_state ->> 'request_fingerprint' = operation.request_fingerprint
  ),
  'audit and undo evidence identify the same canonical request fingerprint'
);

create temporary table phase2c_replay_snapshot as
select
  (select count(*) from public.tasks where user_id = '2c000001-0000-4000-8000-000000000001') as task_count,
  (select count(*) from public.audit_logs where user_id = '2c000001-0000-4000-8000-000000000001') as audit_count,
  (select count(*) from public.undo_operations where user_id = '2c000001-0000-4000-8000-000000000001') as undo_count,
  (select count(*) from public.task_people where user_id = '2c000001-0000-4000-8000-000000000001') as task_people_count,
  (select count(*) from public.task_projects where user_id = '2c000001-0000-4000-8000-000000000001') as task_projects_count,
  (select count(*) from public.task_contexts where user_id = '2c000001-0000-4000-8000-000000000001') as task_contexts_count,
  (select count(*) from public.task_dependencies where user_id = '2c000001-0000-4000-8000-000000000001') as dependency_count;

create temporary table phase2c_replay_result as
select pg_temp.phase2c_confirm_v2(
  '2c100001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
  array[1, 0],
  '[{"candidateIndex":1,"changes":{"title":"Candidate one","description":" Reserve projector ","dueAt":null}},{"candidateIndex":0,"changes":{"dueAt":"2026-07-22T09:00:00-03:00","description":null,"title":" Edited candidate zero "}}]'::jsonb,
  '  pgtap:phase2c:main-operation  '
) as result;

select is(
  (select result ->> 'idempotent' from phase2c_replay_result),
  'true',
  'same key and canonically equal payload is an idempotent replay'
);

select is(
  (select result -> 'task_ids' from phase2c_replay_result),
  (select result -> 'task_ids' from phase2c_first_result),
  'same-payload replay returns the exact original task IDs'
);

select is(
  (select result ->> 'undo_id' from phase2c_replay_result),
  (select result ->> 'undo_id' from phase2c_first_result),
  'same-payload replay returns the exact original undo ID'
);

select is(
  pg_temp.phase2c_error_detail(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0, 1],
    '[{"candidateIndex":0,"changes":{"title":"Different payload"}}]'::jsonb,
    'pgtap:phase2c:main-operation'
  ),
  '2C_IDEMPOTENCY_MISMATCH',
  'same key and different canonical payload returns the closed mismatch token'
);

select results_eq(
  $$
    with mismatch_case(label, entry_id, interpretation_id, selected_indexes, candidate_edits) as (
      values
        (
          'different edit',
          '2c100001-0000-4000-8000-000000000001'::uuid,
          (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
          array[0, 1],
          '[{"candidateIndex":0,"changes":{"title":"Different payload"}}]'::jsonb
        ),
        (
          'different entry',
          '2c100002-0000-4000-8000-000000000002'::uuid,
          (select current_interpretation_id from public.entries where id = '2c100002-0000-4000-8000-000000000002'),
          array[0, 1],
          '[{"candidateIndex":0,"changes":{"title":"Edited candidate zero","description":null,"dueAt":"2026-07-22T09:00:00-03:00"}},{"candidateIndex":1,"changes":{"description":"Reserve projector"}}]'::jsonb
        ),
        (
          'different interpretation',
          '2c100001-0000-4000-8000-000000000001'::uuid,
          (select id from public.entry_interpretations where entry_id = '2c100001-0000-4000-8000-000000000001' and version = 1),
          array[0, 1],
          '[{"candidateIndex":0,"changes":{"title":"Edited candidate zero","description":null,"dueAt":"2026-07-22T09:00:00-03:00"}},{"candidateIndex":1,"changes":{"description":"Reserve projector"}}]'::jsonb
        ),
        (
          'different selection',
          '2c100001-0000-4000-8000-000000000001'::uuid,
          (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
          array[0],
          '[{"candidateIndex":0,"changes":{"title":"Edited candidate zero","description":null,"dueAt":"2026-07-22T09:00:00-03:00"}}]'::jsonb
        )
    )
    select
      mismatch_case.label,
      pg_temp.phase2c_error_detail(
        mismatch_case.entry_id,
        mismatch_case.interpretation_id,
        mismatch_case.selected_indexes,
        mismatch_case.candidate_edits,
        'pgtap:phase2c:main-operation'
      )
    from mismatch_case
    order by mismatch_case.label
  $$,
  $$
    values
      ('different edit', '2C_IDEMPOTENCY_MISMATCH'::text),
      ('different entry', '2C_IDEMPOTENCY_MISMATCH'::text),
      ('different interpretation', '2C_IDEMPOTENCY_MISMATCH'::text),
      ('different selection', '2C_IDEMPOTENCY_MISMATCH'::text)
  $$,
  'same-key reuse rejects every fingerprint dimension with the closed mismatch token'
);

select is(
  pg_temp.phase2c_error_detail(
    '2c100001-0000-4000-8000-000000000001',
    (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
    array[0],
    '[]'::jsonb,
    'pgtap:phase2c:different-operation'
  ),
  '2C_ALREADY_MATERIALIZED',
  'a different operation cannot rematerialize an already resolved candidate'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    )
  $$,
  array[2::bigint],
  'replay and conflict paths create no partial or duplicate tasks'
);

select results_eq(
  $$
    select
      (select count(*) from public.tasks where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.audit_logs where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.undo_operations where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.task_people where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.task_projects where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.task_contexts where user_id = '2c000001-0000-4000-8000-000000000001'),
      (select count(*) from public.task_dependencies where user_id = '2c000001-0000-4000-8000-000000000001')
  $$,
  $$
    select
      task_count,
      audit_count,
      undo_count,
      task_people_count,
      task_projects_count,
      task_contexts_count,
      dependency_count
    from phase2c_replay_snapshot
  $$,
  'replay, mismatch, and already-materialized paths create no additional domain or evidence rows'
);

create temporary table phase2c_undo_result as
select pg_temp.phase2c_undo(
  (select (result ->> 'undo_id')::uuid from phase2c_first_result)
) as result;

select is(
  (select result ->> 'undone' from phase2c_undo_result),
  'true',
  'undo cancels an editable candidate confirmation'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and status = 'cancelled'
  $$,
  array[2::bigint],
  'undo cancels every task stored in the confirmation evidence'
);

select is(
  (pg_temp.phase2c_undo(
    (select (result ->> 'undo_id')::uuid from phase2c_first_result)
  )) ->> 'idempotent',
  'true',
  'repeated undo is idempotent'
);

create temporary table phase2c_post_undo_replay as
select pg_temp.phase2c_confirm_v2(
  '2c100001-0000-4000-8000-000000000001',
  (select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'),
  array[0, 1],
  '[{"candidateIndex":0,"changes":{"title":"Edited candidate zero","description":null,"dueAt":"2026-07-22T09:00:00-03:00"}},{"candidateIndex":1,"changes":{"description":"Reserve projector"}}]'::jsonb,
  'pgtap:phase2c:main-operation'
) as result;

select is(
  (select result ->> 'idempotent' from phase2c_post_undo_replay),
  'true',
  'same-payload replay remains idempotent after undo'
);

select is(
  (select result -> 'task_ids' from phase2c_post_undo_replay),
  (select result -> 'task_ids' from phase2c_first_result),
  'replay after undo returns original IDs and never rematerializes'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where source_interpretation_id = (
      select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
    ) and parent_task_id is not null
  $$,
  array[0::bigint],
  'Phase 2C.1 does not copy legacy parentIndex relationships'
);

select results_eq(
  $$
    select (
      (select count(*) from public.task_people where task_id = any(task_ids))
      + (select count(*) from public.task_projects where task_id = any(task_ids))
      + (select count(*) from public.task_contexts where task_id = any(task_ids))
    )::bigint
    from (
      select array_agg(id) as task_ids
      from public.tasks
      where source_interpretation_id = (
        select current_interpretation_id from public.entries where id = '2c100001-0000-4000-8000-000000000001'
      )
    ) selected_tasks
  $$,
  array[0::bigint],
  'Phase 2C.1 does not copy blanket interpretation person, project, or context links'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.task_dependencies dependency
    where dependency.task_id in (
      select id
      from public.tasks
      where source_interpretation_id = (
        select current_interpretation_id
        from public.entries
        where id = '2c100001-0000-4000-8000-000000000001'
      )
    )
      or dependency.depends_on_task_id in (
        select id
        from public.tasks
        where source_interpretation_id = (
          select current_interpretation_id
          from public.entries
          where id = '2c100001-0000-4000-8000-000000000001'
        )
      )
  $$,
  array[0::bigint],
  'Phase 2C.1 does not infer dependencies from candidate parentIndex metadata'
);

select * from finish();
rollback;
