-- Phase 2D Slice 2D.4: confirmed consequence / reinterpretation.
--
-- Proves the resolve_pending_question_v3 contract: exact signature and
-- security posture; v1/v2 backward compatibility and namespace isolation; the
-- closed permitted-consequence enum (none, reinterpret) validated at the
-- database, with an unknown value or a consequence key on a non-answer kind
-- rejected before any write; an absent consequence canonicalized to 'none';
-- an explicitly confirmed 'reinterpret' atomically recording the answer AND
-- enqueuing exactly one interpret_entry reprocess job through the existing
-- owner-scoped path; three distinct, non-duplicated audit events; undo that
-- restores the question to open, compensates the un-claimed reprocess job,
-- and preserves the immutable interpretation; the 2C-UNDO-004 forward fix
-- (undo_operation no longer contains SQLSTATE 40001); and the content-free
-- question_reinterpret_applied product-event allowlist.

begin;

select plan(34);

-- Structural guards ----------------------------------------------------------

select has_function(
  'public',
  'resolve_pending_question_v3',
  array['uuid', 'jsonb', 'text'],
  'the exact resolve_pending_question_v3 signature exists'
);

select is(
  coalesce((
    select pg_get_function_result(procedure.oid)
    from pg_proc procedure
    where procedure.oid = to_regprocedure('public.resolve_pending_question_v3(uuid,jsonb,text)')
  ), 'missing'),
  'jsonb',
  'question resolution v3 returns jsonb'
);

select is(
  coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = to_regprocedure('public.resolve_pending_question_v3(uuid,jsonb,text)')
  ), false),
  true,
  'question resolution v3 is SECURITY DEFINER'
);

select is(
  coalesce((
    select exists (
      select 1
      from unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
      where lower(setting.value) in ('search_path=', 'search_path=""')
    )
    from pg_proc procedure
    where procedure.oid = to_regprocedure('public.resolve_pending_question_v3(uuid,jsonb,text)')
  ), false),
  true,
  'question resolution v3 has an explicit empty search_path'
);

select ok(
  case
    when to_regprocedure('public.resolve_pending_question_v3(uuid,jsonb,text)') is null then false
    else has_function_privilege('authenticated', to_regprocedure('public.resolve_pending_question_v3(uuid,jsonb,text)'), 'execute')
  end,
  'authenticated can execute question resolution v3'
);

select ok(
  case
    when to_regprocedure('public.resolve_pending_question_v3(uuid,jsonb,text)') is null then false
    else not has_function_privilege('anon', to_regprocedure('public.resolve_pending_question_v3(uuid,jsonb,text)'), 'execute')
  end,
  'anon cannot execute question resolution v3'
);

select ok(
  coalesce((
    select not exists (
      select 1
      from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) as privilege
      where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
    )
    from pg_proc procedure
    where procedure.oid = to_regprocedure('public.resolve_pending_question_v3(uuid,jsonb,text)')
  ), false),
  'PUBLIC cannot execute question resolution v3'
);

select ok(
  to_regprocedure('public.resolve_pending_question_v1(uuid,jsonb,text)') is not null
    and to_regprocedure('public.resolve_pending_question_v2(uuid,jsonb,text)') is not null,
  'resolve_pending_question_v1 and _v2 remain callable during rollout'
);

-- 2C-UNDO-004 forward fix: undo_operation must no longer raise 40001 ----------

select ok(
  position('errcode = ''40001''' in pg_get_functiondef('public.undo_operation(uuid)'::regprocedure)) = 0,
  'undo_operation no longer contains the gateway-hanging SQLSTATE 40001'
);

select ok(
  position('55P03' in pg_get_functiondef('public.undo_operation(uuid)'::regprocedure)) > 0,
  'undo_operation signals the interpretation-revision conflict with 55P03'
);

-- Product-event allowlist ----------------------------------------------------

select ok(
  (
    select pg_get_constraintdef(constraint_row.oid) like '%question_reinterpret_applied%'
    from pg_constraint constraint_row
    where constraint_row.conname = 'product_events_event_name_check'
  ),
  'the product_events allowlist accepts question_reinterpret_applied'
);

select lives_ok(
  $sql$select private.validate_product_event_properties('question_reinterpret_applied', '{}'::jsonb)$sql$,
  'question_reinterpret_applied accepts a strictly property-free payload'
);

select throws_ok(
  $sql$select private.validate_product_event_properties('question_reinterpret_applied', '{"consequence":"reinterpret"}'::jsonb)$sql$,
  '22023',
  null,
  'question_reinterpret_applied rejects any property'
);

-- Helpers --------------------------------------------------------------------

create or replace function pg_temp.phase2d4_resolve(
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
  error_detail text;
begin
  result := public.resolve_pending_question_v3(p_question_id, p_resolution, p_operation_key);
  return result;
exception when others then
  get stacked diagnostics error_state = returned_sqlstate, error_detail = pg_exception_detail;
  return jsonb_build_object('__error__', true, 'sqlstate', error_state, 'detail', coalesce(error_detail, ''));
end;
$$;

create or replace function pg_temp.phase2d4_undo(p_undo_id uuid)
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

-- Fixtures -------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2d400001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase-2d4-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2d400002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase-2d4-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claim.sub', '2d400001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.entries (id, user_id, original_content, source, status, locale) values
  ('2d410001-0000-4000-8000-000000000001', '2d400001-0000-4000-8000-000000000001', 'Phase 2D4 plain fixture', 'web', 'saved', 'en'),
  ('2d410002-0000-4000-8000-000000000002', '2d400001-0000-4000-8000-000000000001', 'Phase 2D4 reinterpret fixture', 'web', 'saved', 'en'),
  ('2d410003-0000-4000-8000-000000000003', '2d400001-0000-4000-8000-000000000001', 'Phase 2D4 bad-consequence fixture', 'web', 'saved', 'en');

select public.persist_entry_interpretation(
  fixture.entry_id,
  jsonb_build_object(
    'summary', 'Phase 2D4 fixture ' || fixture.label,
    'concepts', jsonb_build_array('pending_question'),
    'occurredAt', now()::text,
    'confidence', 0.6,
    'taskCandidates', '[]'::jsonb,
    'pendingQuestions', jsonb_build_array(
      jsonb_build_object('question', 'Qual é o prazo final?', 'reason', 'Nenhum prazo foi mencionado.', 'confidence', 0.5)
    )
  ),
  'pgtap-fixture', 'pgtap', 'pgtap', 0, 0
)
from (values
  ('2d410001-0000-4000-8000-000000000001'::uuid, 'plain'),
  ('2d410002-0000-4000-8000-000000000002'::uuid, 'reinterpret'),
  ('2d410003-0000-4000-8000-000000000003'::uuid, 'bad')
) fixture(entry_id, label);

update public.entries
set status = 'completed'
where user_id = '2d400001-0000-4000-8000-000000000001';

create temporary table phase2d4_refs on commit drop as
select
  (select q.id from public.pending_questions q where q.entry_id = '2d410001-0000-4000-8000-000000000001') as plain_question_id,
  (select q.id from public.pending_questions q where q.entry_id = '2d410002-0000-4000-8000-000000000002') as reinterpret_question_id,
  (select q.interpretation_id from public.pending_questions q where q.entry_id = '2d410002-0000-4000-8000-000000000002') as reinterpret_interpretation_id,
  (select q.id from public.pending_questions q where q.entry_id = '2d410003-0000-4000-8000-000000000003') as bad_question_id;

create temporary table phase2d4_interpretation_snapshot on commit drop as
select interpretation_row.id, interpretation_row.pending_questions
from public.entry_interpretations as interpretation_row
where interpretation_row.entry_id = '2d410002-0000-4000-8000-000000000002';

-- Closed consequence enum ----------------------------------------------------

select is(
  (select pg_temp.phase2d4_resolve(refs.bad_question_id,
    jsonb_build_object('kind', 'answer', 'answer', 'amanhã', 'consequence', 'reprocess'),
    'phase2d4-bad-consequence') ->> 'sqlstate' from phase2d4_refs as refs),
  '22023',
  'an unknown consequence value is rejected'
);

select is(
  (select pg_temp.phase2d4_resolve(refs.bad_question_id,
    jsonb_build_object('kind', 'answer', 'answer', 'amanhã', 'consequence', 'REINTERPRET'),
    'phase2d4-bad-consequence-case') ->> 'sqlstate' from phase2d4_refs as refs),
  '22023',
  'the consequence enum is case-sensitive'
);

select is(
  (select pg_temp.phase2d4_resolve(refs.bad_question_id,
    jsonb_build_object('kind', 'dismissed', 'consequence', 'reinterpret'),
    'phase2d4-consequence-on-dismissed') ->> 'sqlstate' from phase2d4_refs as refs),
  '22023',
  'a consequence on a non-answer kind is rejected'
);

select ok(
  (select count(*) = 0 from public.undo_operations
    where operation_key like 'resolve-v3:phase2d4-bad-%'
       or operation_key like 'resolve-v3:phase2d4-consequence-%'),
  'rejected consequence attempts leave no reserved evidence'
);

select is(
  (select status from public.pending_questions p, phase2d4_refs r where p.id = r.bad_question_id),
  'open',
  'a rejected consequence never changes the question state'
);

-- Answer with consequence none applies no reinterpretation --------------------

select is(
  (select pg_temp.phase2d4_resolve(refs.plain_question_id,
    jsonb_build_object('kind', 'answer', 'answer', 'Sexta', 'consequence', 'none'),
    'phase2d4-plain') ->> 'consequence_status' from phase2d4_refs as refs),
  'none',
  'an answer with consequence none reports no consequence'
);

select ok(
  (select count(*) = 0 from public.jobs j, phase2d4_refs r
    where j.user_id = '2d400001-0000-4000-8000-000000000001'
      and j.type = 'interpret_entry'
      and j.payload ->> 'entry_id' = '2d410001-0000-4000-8000-000000000001'
      and j.payload ->> 'mode' = 'reprocess'),
  'an answer with consequence none enqueues no reprocess job'
);

-- Absent consequence canonicalizes to none -----------------------------------

select is(
  (select pg_temp.phase2d4_resolve(refs.plain_question_id,
    jsonb_build_object('kind', 'answer', 'answer', 'Sexta', 'consequence', 'none'),
    'phase2d4-plain') ->> 'idempotent' from phase2d4_refs as refs),
  'true',
  'replaying the same plain answer is idempotent'
);

-- Confirmed reinterpretation: atomic answer + single enqueue ------------------

select is(
  (select pg_temp.phase2d4_resolve(refs.reinterpret_question_id,
    jsonb_build_object('kind', 'answer', 'answer', '30 de julho', 'consequence', 'reinterpret'),
    'phase2d4-reinterpret') ->> 'consequence_status' from phase2d4_refs as refs),
  'reinterpretation_queued',
  'a confirmed reinterpretation reports the queued status'
);

select is(
  (select status from public.pending_questions p, phase2d4_refs r where p.id = r.reinterpret_question_id),
  'answered',
  'the reinterpreted question is recorded answered'
);

select ok(
  (select count(*) = 1 from public.jobs j
    where j.user_id = '2d400001-0000-4000-8000-000000000001'
      and j.type = 'interpret_entry'
      and j.payload ->> 'entry_id' = '2d410002-0000-4000-8000-000000000002'
      and j.payload ->> 'mode' = 'reprocess'),
  'a confirmed reinterpretation enqueues exactly one reprocess job'
);

-- Three distinct, non-duplicated audit events --------------------------------

select is(
  (select count(*)::int from public.audit_logs
    where user_id = '2d400001-0000-4000-8000-000000000001'
      and source_entry_id = '2d410002-0000-4000-8000-000000000002'
      and action_type = 'resolve_pending_question_v3'),
  1,
  'exactly one answer-persisted audit event'
);

select is(
  (select count(*)::int from public.audit_logs
    where user_id = '2d400001-0000-4000-8000-000000000001'
      and source_entry_id = '2d410002-0000-4000-8000-000000000002'
      and action_type = 'question_consequence_confirmed'),
  1,
  'exactly one consequence-confirmed audit event'
);

select is(
  (select count(*)::int from public.audit_logs
    where user_id = '2d400001-0000-4000-8000-000000000001'
      and source_entry_id = '2d410002-0000-4000-8000-000000000002'
      and action_type = 'entry_reprocessing_enqueued'),
  1,
  'exactly one reinterpretation-created audit event'
);

-- Consequence idempotency: replay never double-applies -----------------------

select is(
  (select pg_temp.phase2d4_resolve(refs.reinterpret_question_id,
    jsonb_build_object('kind', 'answer', 'answer', '30 de julho', 'consequence', 'reinterpret'),
    'phase2d4-reinterpret') ->> 'idempotent' from phase2d4_refs as refs),
  'true',
  'replaying the confirmed reinterpretation is idempotent'
);

select ok(
  (select count(*) = 1 from public.jobs j
    where j.user_id = '2d400001-0000-4000-8000-000000000001'
      and j.type = 'interpret_entry'
      and j.payload ->> 'entry_id' = '2d410002-0000-4000-8000-000000000002'
      and j.payload ->> 'mode' = 'reprocess'),
  'the reinterpretation replay never enqueues a second job'
);

-- Same key, different consequence, is a deterministic mismatch ----------------

select is(
  (select pg_temp.phase2d4_resolve(refs.reinterpret_question_id,
    jsonb_build_object('kind', 'answer', 'answer', '30 de julho', 'consequence', 'none'),
    'phase2d4-reinterpret') ->> 'detail' from phase2d4_refs as refs),
  '2D_IDEMPOTENCY_MISMATCH',
  'the same key with a different consequence is a deterministic mismatch'
);

-- Undo restores open, cancels the un-claimed job, preserves interpretation ----

select is(
  (
    select pg_temp.phase2d4_undo(o.id) ->> 'consequence_compensation'
    from public.undo_operations o, phase2d4_refs r
    where o.action_type = 'resolve_pending_question_v3'
      and o.entity_ids = array[r.reinterpret_question_id]
  ),
  'reprocessing_cancelled',
  'undo cancels the un-claimed reprocess job'
);

select is(
  (select status from public.pending_questions p, phase2d4_refs r where p.id = r.reinterpret_question_id),
  'open',
  'undo restores the reinterpreted question to open'
);

select ok(
  (select count(*) = 0 from public.jobs j
    where j.user_id = '2d400001-0000-4000-8000-000000000001'
      and j.type = 'interpret_entry'
      and j.payload ->> 'entry_id' = '2d410002-0000-4000-8000-000000000002'
      and j.payload ->> 'mode' = 'reprocess'),
  'undo removes the queued reprocess job'
);

select is(
  (select interpretation_row.pending_questions
     from public.entry_interpretations interpretation_row, phase2d4_refs r
     where interpretation_row.id = r.reinterpret_interpretation_id),
  (select snapshot.pending_questions from phase2d4_interpretation_snapshot snapshot, phase2d4_refs r where snapshot.id = r.reinterpret_interpretation_id),
  'undo never alters the immutable interpretation evidence'
);

-- Undo is idempotent ---------------------------------------------------------

select is(
  (
    select pg_temp.phase2d4_undo(o.id) ->> 'idempotent'
    from public.undo_operations o, phase2d4_refs r
    where o.action_type = 'resolve_pending_question_v3'
      and o.entity_ids = array[r.reinterpret_question_id]
  ),
  'true',
  'a second undo of the same operation is an idempotent no-op'
);

-- Immutable interpretation stays evidence after the whole cycle --------------

select is(
  (select count(*)::int from public.pending_questions p, phase2d4_refs r where p.id = r.reinterpret_question_id and p.status = 'open'),
  1,
  'the reinterpreted question is resolvable again after undo'
);

select is(
  (select pg_temp.phase2d4_resolve(refs.plain_question_id,
    jsonb_build_object('kind', 'answer', 'answer', 'Nova resposta'),
    'phase2d4-plain-2') ->> 'consequence' from phase2d4_refs as refs),
  'none',
  'an answer omitting the consequence key resolves with consequence none'
);

select * from finish();
rollback;
