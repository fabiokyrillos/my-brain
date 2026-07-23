-- Phase 2D Slice 2D.1: versioned pending-question answer transition.
--
-- Proves the resolve_pending_question_v1 contract: exact signature and
-- security posture, closed discriminated payload, owner scoping without
-- cross-owner disclosure, stale-interpretation rejection, single-winner
-- sequential conflict, canonical-fingerprint replay and mismatch, atomic
-- state + audit + undo, exact-prior-state undo with idempotent repetition,
-- and immutability of the interpretation's pending_questions evidence.

begin;

select plan(55);

-- Structural guards ----------------------------------------------------------

select has_function(
  'public',
  'resolve_pending_question_v1',
  array['uuid', 'jsonb', 'text'],
  'the exact resolve_pending_question_v1 signature exists'
);

select is(
  coalesce((
    select pg_get_function_result(procedure.oid)
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.resolve_pending_question_v1(uuid,jsonb,text)'
    )
  ), 'missing'),
  'jsonb',
  'question resolution returns jsonb'
);

select is(
  coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.resolve_pending_question_v1(uuid,jsonb,text)'
    )
  ), false),
  true,
  'question resolution is SECURITY DEFINER'
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
      'public.resolve_pending_question_v1(uuid,jsonb,text)'
    )
  ), false),
  true,
  'question resolution has an explicit empty search_path'
);

select ok(
  case
    when to_regprocedure('public.resolve_pending_question_v1(uuid,jsonb,text)') is null
      then false
    else has_function_privilege(
      'authenticated',
      to_regprocedure('public.resolve_pending_question_v1(uuid,jsonb,text)'),
      'execute'
    )
  end,
  'authenticated can execute question resolution'
);

select ok(
  case
    when to_regprocedure('public.resolve_pending_question_v1(uuid,jsonb,text)') is null
      then false
    else not has_function_privilege(
      'anon',
      to_regprocedure('public.resolve_pending_question_v1(uuid,jsonb,text)'),
      'execute'
    )
  end,
  'anon cannot execute question resolution'
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
      'public.resolve_pending_question_v1(uuid,jsonb,text)'
    )
  ), false),
  'PUBLIC cannot execute question resolution'
);

select has_function(
  'extensions',
  'digest',
  array['bytea', 'text'],
  'the database exposes extensions.digest(bytea, text) for SHA-256 fingerprints'
);

select ok(
  has_table_privilege('authenticated', 'public.pending_questions', 'UPDATE'),
  'the legacy owner-scoped answer UPDATE path stays grant-compatible during rollout'
);

-- Helpers --------------------------------------------------------------------

create or replace function pg_temp.phase2d_resolve(
  p_question_id uuid,
  p_resolution jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
  error_state text;
  error_message text;
  error_detail text;
begin
  result := public.resolve_pending_question_v1(p_question_id, p_resolution, p_operation_key);
  return result;
exception when others then
  get stacked diagnostics
    error_state = returned_sqlstate,
    error_message = message_text,
    error_detail = pg_exception_detail;
  return jsonb_build_object(
    '__error__', true,
    'sqlstate', error_state,
    'message', error_message,
    'detail', coalesce(error_detail, '')
  );
end;
$$;

create or replace function pg_temp.phase2d_undo(p_undo_id uuid)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
  error_state text;
begin
  result := public.undo_operation(p_undo_id);
  return result;
exception when others then
  get stacked diagnostics error_state = returned_sqlstate;
  return jsonb_build_object('__error__', true, 'sqlstate', error_state);
end;
$$;

create or replace function pg_temp.phase2d_sha256(p_payload jsonb)
returns text
language sql
as $$
  select pg_catalog.encode(
    extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function pg_temp.phase2d_trust()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'score', 0.835,
    'policy', 'apply_and_flag',
    'signals', jsonb_build_object(
      'modelConfidence', 0.8, 'candidateMargin', 1, 'entityExactness', 1,
      'semanticSimilarity', 0, 'dateClarity', 1, 'contextConsistency', 1,
      'reversibility', 1, 'autonomyAllowed', 1, 'correctionHistoryAgreement', 0.5
    ),
    'overrides', '[]'::jsonb,
    'evidence', jsonb_build_array('deterministic_pgtap_fixture')
  );
$$;

-- Fixtures -------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '2d000001-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'phase-2d-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '2d000002-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'phase-2d-other@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

select set_config('request.jwt.claim.sub', '2d000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.entries (id, user_id, original_content, source, status, locale) values
  (
    '2d100001-0000-4000-8000-000000000001',
    '2d000001-0000-4000-8000-000000000001',
    'Phase 2D answer transition fixture', 'web', 'saved', 'en'
  ),
  (
    '2d100002-0000-4000-8000-000000000002',
    '2d000001-0000-4000-8000-000000000001',
    'Phase 2D stale interpretation fixture', 'web', 'saved', 'en'
  );

select public.persist_entry_interpretation(
  fixture.entry_id,
  jsonb_build_object(
    'summary', 'Phase 2D fixture ' || fixture.label,
    'concepts', jsonb_build_array('pending_question'),
    'occurredAt', now()::text,
    'confidence', 0.6,
    'taskCandidates', '[]'::jsonb,
    'pendingQuestions', jsonb_build_array(
      jsonb_build_object(
        'question', 'Qual é o prazo final?',
        'reason', 'Nenhum prazo foi mencionado.',
        'confidence', 0.5
      )
    )
  ),
  'pgtap-fixture', 'pgtap', 'pgtap', 0, 0
)
from (values
  ('2d100001-0000-4000-8000-000000000001'::uuid, 'main'),
  ('2d100002-0000-4000-8000-000000000002'::uuid, 'stale')
) fixture(entry_id, label);

create temporary table phase2d_refs on commit drop as
select
  (
    select question_row.id from public.pending_questions as question_row
    where question_row.entry_id = '2d100001-0000-4000-8000-000000000001'
  ) as main_question_id,
  (
    select question_row.interpretation_id from public.pending_questions as question_row
    where question_row.entry_id = '2d100001-0000-4000-8000-000000000001'
  ) as main_interpretation_id,
  (
    select question_row.id from public.pending_questions as question_row
    where question_row.entry_id = '2d100002-0000-4000-8000-000000000002'
  ) as stale_question_id;

select is(
  (
    select count(*)::integer from public.pending_questions
    where entry_id in (
      '2d100001-0000-4000-8000-000000000001',
      '2d100002-0000-4000-8000-000000000002'
    )
      and status = 'open'
  ),
  2,
  'the fixtures materialized exactly one open question per entry'
);

create temporary table phase2d_interpretation_snapshot on commit drop as
select interpretation_row.id, interpretation_row.pending_questions
from public.entry_interpretations as interpretation_row
where interpretation_row.entry_id = '2d100001-0000-4000-8000-000000000001';

-- Supersede the stale fixture's interpretation through the deployed
-- reprocessing path so its question row references a non-current revision.
select public.begin_entry_reprocessing(
  '2d100002-0000-4000-8000-000000000002',
  'phase2d-stale-reprocess-key',
  60
);
select public.persist_reprocessed_entry_interpretation(
  '2d100002-0000-4000-8000-000000000002',
  'phase2d-stale-reprocess-key',
  jsonb_build_object(
    'language', 'en',
    'occurredAt', now()::text,
    'isRetroactive', false,
    'summary', 'Phase 2D stale fixture reprocessed',
    'concepts', jsonb_build_array('raw_record'),
    'contexts', '[]'::jsonb,
    'organizations', '[]'::jsonb,
    'projects', '[]'::jsonb,
    'people', '[]'::jsonb,
    'taskCandidates', '[]'::jsonb,
    'pendingQuestions', '[]'::jsonb,
    'confidence', 0.9
  ),
  'pgtap-fixture', 'pgtap', 'pgtap', 0, 0,
  jsonb_build_object(
    'summary', pg_temp.phase2d_trust(),
    'concepts', pg_temp.phase2d_trust(),
    'occurredAt', pg_temp.phase2d_trust(),
    'extractedDates', pg_temp.phase2d_trust(),
    'entities', pg_temp.phase2d_trust()
  )
);

-- Anonymous denial -----------------------------------------------------------

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'anon'),
      'phase2d-anonymous-key'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '42501',
  'anonymous resolution is denied'
);

-- Closed-shape rejection -----------------------------------------------------

select set_config('request.jwt.claim.sub', '2d000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'ok'),
      'short'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '22023',
  'a malformed operation key is rejected'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', ''),
      'phase2d-invalid-empty'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '22023',
  'an empty answer is rejected'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', E'   \n\t  '),
      'phase2d-invalid-whitespace'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '22023',
  'a whitespace-only answer is rejected'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', repeat('a', 4001)),
      'phase2d-invalid-overlong'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '22023',
  'an answer longer than 4000 characters is rejected'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'deferred', 'answer', 'tomorrow'),
      'phase2d-invalid-kind'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '22023',
  'an unknown resolution kind is rejected'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'ok', 'consequence', 'reinterpret'),
      'phase2d-invalid-extra-key'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '22023',
  'an unknown resolution key is rejected'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      to_jsonb('answer'::text),
      'phase2d-invalid-non-object'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '22023',
  'a non-object resolution payload is rejected'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer'),
      'phase2d-invalid-missing-answer'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '22023',
  'a resolution without answer content is rejected'
);

-- Ownership without disclosure ------------------------------------------------

create temporary table phase2d_denials on commit drop as
select
  (
    select pg_temp.phase2d_resolve(
      '2d999999-0000-4000-8000-000000000099',
      jsonb_build_object('kind', 'answer', 'answer', 'missing'),
      'phase2d-missing-question-key'
    )
  ) as missing_result;

select is(
  (select missing_result ->> 'sqlstate' from phase2d_denials),
  'P0002',
  'a missing question is rejected as not found'
);

select set_config('request.jwt.claim.sub', '2d000002-0000-4000-8000-000000000002', true);

create temporary table phase2d_cross_owner on commit drop as
select
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'cross owner'),
      'phase2d-cross-owner-key'
    )
    from phase2d_refs as refs
  ) as cross_result;

select is(
  (select cross_result ->> 'sqlstate' from phase2d_cross_owner),
  'P0002',
  'a cross-owner resolution is denied'
);

select is(
  (select cross_result - '__error__' from phase2d_cross_owner),
  (select missing_result - '__error__' from phase2d_denials),
  'cross-owner denial is indistinguishable from a missing question'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where operation_key in (
      'resolve-v1:phase2d-cross-owner-key',
      'resolve-v1:phase2d-missing-question-key'
    )
  ),
  0,
  'denied resolutions reserve no operation evidence'
);

select is(
  (
    select count(*)::integer from public.audit_logs
    where action_type = 'resolve_pending_question_v1'
  ),
  0,
  'denied resolutions write no audit evidence'
);

-- Owner success ---------------------------------------------------------------

select set_config('request.jwt.claim.sub', '2d000001-0000-4000-8000-000000000001', true);

create temporary table phase2d_success on commit drop as
select
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', '  Sexta-feira às 14h  '),
      'phase2d-success-key'
    )
    from phase2d_refs as refs
  ) as result;

select is(
  (select result ->> 'resolution' from phase2d_success),
  'answered',
  'the owner answer transition succeeds'
);

select ok(
  (select (result ->> 'undo_id') is not null from phase2d_success),
  'a successful resolution returns its undo operation id'
);

select is(
  (select (result ->> 'idempotent')::boolean from phase2d_success),
  false,
  'the first resolution is not a replay'
);

select is(
  (
    select question_row.status from public.pending_questions as question_row, phase2d_refs as refs
    where question_row.id = refs.main_question_id
  ),
  'answered',
  'the question row moved to answered'
);

select is(
  (
    select question_row.answer from public.pending_questions as question_row, phase2d_refs as refs
    where question_row.id = refs.main_question_id
  ),
  'Sexta-feira às 14h',
  'the stored answer is the trimmed canonical text'
);

select ok(
  (
    select question_row.answered_at is not null
    from public.pending_questions as question_row, phase2d_refs as refs
    where question_row.id = refs.main_question_id
  ),
  'the answered timestamp is set'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs as audit_row, phase2d_refs as refs
    where audit_row.action_type = 'resolve_pending_question_v1'
      and audit_row.entity_type = 'pending_question'
      and audit_row.entity_id = refs.main_question_id
      and audit_row.actor = 'user'
      and audit_row.after_state ->> 'resolution' = 'answered'
      and audit_row.after_state ->> 'interpretation_id' = refs.main_interpretation_id::text
  ),
  1,
  'exactly one audit row records the answer transition'
);

select is(
  (
    select audit_row.after_state ->> 'request_fingerprint'
    from public.audit_logs as audit_row, phase2d_refs as refs
    where audit_row.action_type = 'resolve_pending_question_v1'
      and audit_row.entity_id = refs.main_question_id
  ),
  (
    select pg_temp.phase2d_sha256(
      jsonb_build_object(
        'questionId', refs.main_question_id,
        'kind', 'answer',
        'answer', 'Sexta-feira às 14h'
      )
    )
    from phase2d_refs as refs
  ),
  'the audited fingerprint is the canonical SHA-256 of the normalized command'
);

select is(
  (
    select count(*)::integer
    from public.undo_operations as operation_row, phase2d_refs as refs
    where operation_row.operation_key = 'resolve-v1:phase2d-success-key'
      and operation_row.action_type = 'resolve_pending_question_v1'
      and operation_row.entity_type = 'pending_question'
      and operation_row.entity_ids = array[refs.main_question_id]
      and operation_row.status = 'available'
      and operation_row.request_fingerprint = (
        select audit_row.after_state ->> 'request_fingerprint'
        from public.audit_logs as audit_row
        where audit_row.action_type = 'resolve_pending_question_v1'
          and audit_row.entity_id = refs.main_question_id
      )
  ),
  1,
  'exactly one namespaced undo operation was registered in the same transaction'
);

-- Deterministic replay and mismatch -------------------------------------------

create temporary table phase2d_replay on commit drop as
select
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'Sexta-feira às 14h'),
      'phase2d-success-key'
    )
    from phase2d_refs as refs
  ) as result;

select is(
  (select (result ->> 'idempotent')::boolean from phase2d_replay),
  true,
  'the same key and canonical payload replay deterministically'
);

select is(
  (select result ->> 'undo_id' from phase2d_replay),
  (select result ->> 'undo_id' from phase2d_success),
  'the replay returns the original undo operation id'
);

select is(
  (
    select count(*)::integer from public.audit_logs
    where action_type = 'resolve_pending_question_v1'
  ),
  1,
  'the replay writes no second audit row'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'Uma resposta diferente'),
      'phase2d-success-key'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  'P0001',
  'the same key with a different payload is rejected'
);

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'Uma resposta diferente'),
      'phase2d-success-key'
    ) ->> 'detail'
    from phase2d_refs as refs
  ),
  '2D_IDEMPOTENCY_MISMATCH',
  'the payload mismatch carries the stable idempotency detail'
);

-- Non-open rejection (sequential single-winner proxy) --------------------------

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'Second writer'),
      'phase2d-second-writer-key'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '55000',
  'an already-answered question rejects a second resolution'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where operation_key = 'resolve-v1:phase2d-second-writer-key'
  ),
  0,
  'the losing resolution leaves no reserved operation evidence'
);

-- Stale interpretation ---------------------------------------------------------

select is(
  (
    select pg_temp.phase2d_resolve(
      refs.stale_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'Stale answer'),
      'phase2d-stale-key'
    ) ->> 'sqlstate'
    from phase2d_refs as refs
  ),
  '55P03',
  'answering a question whose interpretation is no longer current is rejected as stale'
);

select is(
  (
    select question_row.status
    from public.pending_questions as question_row, phase2d_refs as refs
    where question_row.id = refs.stale_question_id
  ),
  'open',
  'the stale rejection wrote nothing to the question row'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where operation_key = 'resolve-v1:phase2d-stale-key'
  ),
  0,
  'the stale rejection rolled back its reserved operation atomically'
);

-- Undo ------------------------------------------------------------------------

create temporary table phase2d_undo_result on commit drop as
select pg_temp.phase2d_undo(
  (select (result ->> 'undo_id')::uuid from phase2d_success)
) as result;

select is(
  (select (result ->> 'undone')::boolean from phase2d_undo_result),
  true,
  'the stored compensating operation undoes the answer'
);

select is(
  (select (result ->> 'affected')::integer from phase2d_undo_result),
  1,
  'the undo restored exactly one question'
);

select is(
  (select (result ->> 'idempotent')::boolean from phase2d_undo_result),
  false,
  'the first undo execution is not a replay'
);

select is(
  (
    select question_row.status
    from public.pending_questions as question_row, phase2d_refs as refs
    where question_row.id = refs.main_question_id
  ),
  'open',
  'the undone question returned to open'
);

select ok(
  (
    select question_row.answer is null and question_row.answered_at is null
    from public.pending_questions as question_row, phase2d_refs as refs
    where question_row.id = refs.main_question_id
  ),
  'the undo cleared the answer and answered_at'
);

select is(
  (
    select operation_row.status from public.undo_operations as operation_row
    where operation_row.operation_key = 'resolve-v1:phase2d-success-key'
  ),
  'undone',
  'the undo operation is marked undone'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs as audit_row, phase2d_refs as refs
    where audit_row.action_type = 'operation_undone'
      and audit_row.entity_type = 'pending_question'
      and audit_row.entity_id = refs.main_question_id
      and audit_row.after_state ->> 'restored_status' = 'open'
  ),
  1,
  'the undo recorded immutable audit evidence'
);

create temporary table phase2d_undo_repeat on commit drop as
select pg_temp.phase2d_undo(
  (select (result ->> 'undo_id')::uuid from phase2d_success)
) as result;

select is(
  (select (result ->> 'idempotent')::boolean from phase2d_undo_repeat),
  true,
  'a repeated undo is an idempotent no-op'
);

select is(
  (select (result ->> 'affected')::integer from phase2d_undo_repeat),
  0,
  'a repeated undo touches no rows'
);

-- Post-undo resolvability ------------------------------------------------------

create temporary table phase2d_reanswer on commit drop as
select
  (
    select pg_temp.phase2d_resolve(
      refs.main_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'Resposta definitiva'),
      'phase2d-reanswer-key'
    )
    from phase2d_refs as refs
  ) as result;

select is(
  (select result ->> 'resolution' from phase2d_reanswer),
  'answered',
  'a restored question can be answered again under a new operation key'
);

select is(
  (select (result ->> 'idempotent')::boolean from phase2d_reanswer),
  false,
  'the post-undo resolution is a fresh operation'
);

-- Immutable interpretation evidence -------------------------------------------

select is(
  (
    select interpretation_row.pending_questions
    from public.entry_interpretations as interpretation_row
    join phase2d_interpretation_snapshot as snapshot
      on snapshot.id = interpretation_row.id
  ),
  (select snapshot.pending_questions from phase2d_interpretation_snapshot as snapshot),
  'the immutable interpretation pending_questions JSON is byte-identical after answer, replay, and undo'
);

select * from finish();

rollback;
