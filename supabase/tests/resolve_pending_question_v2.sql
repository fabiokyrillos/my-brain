-- Phase 2D Slice 2D.2: question dispositions (defer, dismiss, not relevant).
--
-- Proves the resolve_pending_question_v2 contract: exact signature and
-- security posture, v1 backward compatibility and namespace isolation,
-- closed discriminated payload for all four kinds, deferral-instant
-- validation, deterministic snooze reactivation (read-time open treatment in
-- list_needs_attention plus RPC-time resolvability), terminal semantics with
-- distinct not_relevant history, owner scoping without cross-owner
-- disclosure, stale rejection, canonical-fingerprint replay and mismatch,
-- atomic state + audit + undo, guarded exact-prior-state undo that can never
-- clobber a newer resolution, and immutability of the interpretation's
-- pending_questions evidence — plus the content-free question_resolved
-- product-event allowlist.

begin;

select plan(76);

-- Structural guards ----------------------------------------------------------

select has_function(
  'public',
  'resolve_pending_question_v2',
  array['uuid', 'jsonb', 'text'],
  'the exact resolve_pending_question_v2 signature exists'
);

select is(
  coalesce((
    select pg_get_function_result(procedure.oid)
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.resolve_pending_question_v2(uuid,jsonb,text)'
    )
  ), 'missing'),
  'jsonb',
  'question resolution v2 returns jsonb'
);

select is(
  coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.resolve_pending_question_v2(uuid,jsonb,text)'
    )
  ), false),
  true,
  'question resolution v2 is SECURITY DEFINER'
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
      'public.resolve_pending_question_v2(uuid,jsonb,text)'
    )
  ), false),
  true,
  'question resolution v2 has an explicit empty search_path'
);

select ok(
  case
    when to_regprocedure('public.resolve_pending_question_v2(uuid,jsonb,text)') is null
      then false
    else has_function_privilege(
      'authenticated',
      to_regprocedure('public.resolve_pending_question_v2(uuid,jsonb,text)'),
      'execute'
    )
  end,
  'authenticated can execute question resolution v2'
);

select ok(
  case
    when to_regprocedure('public.resolve_pending_question_v2(uuid,jsonb,text)') is null
      then false
    else not has_function_privilege(
      'anon',
      to_regprocedure('public.resolve_pending_question_v2(uuid,jsonb,text)'),
      'execute'
    )
  end,
  'anon cannot execute question resolution v2'
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
      'public.resolve_pending_question_v2(uuid,jsonb,text)'
    )
  ), false),
  'PUBLIC cannot execute question resolution v2'
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
  'resolve_pending_question_v1 remains callable during rollout'
);

select ok(
  (
    select pg_get_constraintdef(constraint_row.oid) like '%question_resolved%'
    from pg_constraint constraint_row
    where constraint_row.conname = 'product_events_event_name_check'
  ),
  'the product_events allowlist accepts question_resolved'
);

-- Content-free question_resolved property allowlist ---------------------------

select lives_ok(
  $sql$select private.validate_product_event_properties('question_resolved', '{"kind":"deferred"}'::jsonb)$sql$,
  'question_resolved accepts the bounded deferred kind'
);

select lives_ok(
  $sql$select private.validate_product_event_properties('question_resolved', '{"kind":"not_relevant"}'::jsonb)$sql$,
  'question_resolved accepts the bounded not_relevant kind'
);

select throws_ok(
  $sql$select private.validate_product_event_properties('question_resolved', '{"kind":"answered"}'::jsonb)$sql$,
  '22023',
  null,
  'question_resolved rejects a kind outside the bounded enum'
);

select throws_ok(
  $sql$select private.validate_product_event_properties('question_resolved', '{}'::jsonb)$sql$,
  '22023',
  null,
  'question_resolved requires the kind property'
);

select throws_ok(
  $sql$select private.validate_product_event_properties('question_resolved', '{"kind":"deferred","question":"free text"}'::jsonb)$sql$,
  '22023',
  null,
  'question_resolved rejects any property beyond the bounded kind'
);

-- Helpers --------------------------------------------------------------------

create or replace function pg_temp.phase2d2_resolve(
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
  result := public.resolve_pending_question_v2(p_question_id, p_resolution, p_operation_key);
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

create or replace function pg_temp.phase2d2_resolve_v1(
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
begin
  result := public.resolve_pending_question_v1(p_question_id, p_resolution, p_operation_key);
  return result;
exception when others then
  get stacked diagnostics error_state = returned_sqlstate;
  return jsonb_build_object('__error__', true, 'sqlstate', error_state);
end;
$$;

create or replace function pg_temp.phase2d2_undo(p_undo_id uuid)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
  error_state text;
  error_detail text;
begin
  result := public.undo_operation(p_undo_id);
  return result;
exception when others then
  get stacked diagnostics
    error_state = returned_sqlstate,
    error_detail = pg_exception_detail;
  return jsonb_build_object(
    '__error__', true,
    'sqlstate', error_state,
    'detail', coalesce(error_detail, '')
  );
end;
$$;

create or replace function pg_temp.phase2d2_sha256(p_payload jsonb)
returns text
language sql
as $$
  select pg_catalog.encode(
    extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function pg_temp.phase2d2_trust()
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
    '2d200001-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'phase-2d2-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '2d200002-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'phase-2d2-other@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

select set_config('request.jwt.claim.sub', '2d200001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.entries (id, user_id, original_content, source, status, locale) values
  (
    '2d210001-0000-4000-8000-000000000001',
    '2d200001-0000-4000-8000-000000000001',
    'Phase 2D2 defer fixture', 'web', 'saved', 'en'
  ),
  (
    '2d210002-0000-4000-8000-000000000002',
    '2d200001-0000-4000-8000-000000000001',
    'Phase 2D2 dismiss fixture', 'web', 'saved', 'en'
  ),
  (
    '2d210003-0000-4000-8000-000000000003',
    '2d200001-0000-4000-8000-000000000001',
    'Phase 2D2 not relevant fixture', 'web', 'saved', 'en'
  ),
  (
    '2d210004-0000-4000-8000-000000000004',
    '2d200001-0000-4000-8000-000000000001',
    'Phase 2D2 stale fixture', 'web', 'saved', 'en'
  ),
  (
    '2d210005-0000-4000-8000-000000000005',
    '2d200001-0000-4000-8000-000000000001',
    'Phase 2D2 v1 compatibility fixture', 'web', 'saved', 'en'
  );

select public.persist_entry_interpretation(
  fixture.entry_id,
  jsonb_build_object(
    'summary', 'Phase 2D2 fixture ' || fixture.label,
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
  ('2d210001-0000-4000-8000-000000000001'::uuid, 'defer'),
  ('2d210002-0000-4000-8000-000000000002'::uuid, 'dismiss'),
  ('2d210003-0000-4000-8000-000000000003'::uuid, 'not relevant'),
  ('2d210004-0000-4000-8000-000000000004'::uuid, 'stale'),
  ('2d210005-0000-4000-8000-000000000005'::uuid, 'v1 compat')
) fixture(entry_id, label);

-- The queue-reactivation checks need completed entries whose only attention
-- reason can be the open question (fixture manipulation, superuser).
update public.entries
set status = 'completed'
where user_id = '2d200001-0000-4000-8000-000000000001'
  and id in (
    '2d210001-0000-4000-8000-000000000001',
    '2d210002-0000-4000-8000-000000000002',
    '2d210003-0000-4000-8000-000000000003',
    '2d210005-0000-4000-8000-000000000005'
  );

create temporary table phase2d2_refs on commit drop as
select
  (select q.id from public.pending_questions q where q.entry_id = '2d210001-0000-4000-8000-000000000001') as defer_question_id,
  (select q.interpretation_id from public.pending_questions q where q.entry_id = '2d210001-0000-4000-8000-000000000001') as defer_interpretation_id,
  (select q.id from public.pending_questions q where q.entry_id = '2d210002-0000-4000-8000-000000000002') as dismiss_question_id,
  (select q.id from public.pending_questions q where q.entry_id = '2d210003-0000-4000-8000-000000000003') as not_relevant_question_id,
  (select q.id from public.pending_questions q where q.entry_id = '2d210004-0000-4000-8000-000000000004') as stale_question_id,
  (select q.id from public.pending_questions q where q.entry_id = '2d210005-0000-4000-8000-000000000005') as v1_question_id;

create temporary table phase2d2_interpretation_snapshot on commit drop as
select interpretation_row.id, interpretation_row.pending_questions
from public.entry_interpretations as interpretation_row
where interpretation_row.entry_id = '2d210001-0000-4000-8000-000000000001';

-- Supersede the stale fixture's interpretation through the deployed
-- reprocessing path so its question row references a non-current revision.
select public.begin_entry_reprocessing(
  '2d210004-0000-4000-8000-000000000004',
  'phase2d2-stale-reprocess-key',
  60
);
select public.persist_reprocessed_entry_interpretation(
  '2d210004-0000-4000-8000-000000000004',
  'phase2d2-stale-reprocess-key',
  jsonb_build_object(
    'language', 'en',
    'occurredAt', now()::text,
    'isRetroactive', false,
    'summary', 'Phase 2D2 stale fixture reprocessed',
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
    'summary', pg_temp.phase2d2_trust(),
    'concepts', pg_temp.phase2d2_trust(),
    'occurredAt', pg_temp.phase2d2_trust(),
    'extractedDates', pg_temp.phase2d2_trust(),
    'entities', pg_temp.phase2d2_trust()
  )
);

-- Anonymous denial -----------------------------------------------------------

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'dismissed'),
      'phase2d2-anonymous-key'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '42501',
  'anonymous disposition is denied'
);

-- Closed-shape rejection -----------------------------------------------------

select set_config('request.jwt.claim.sub', '2d200001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'dismissed'),
      'short'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'a malformed operation key is rejected'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'reinterpret'),
      'phase2d2-invalid-kind'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'an unknown resolution kind is rejected'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'deferred'),
      'phase2d2-invalid-missing-instant'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'a deferral without snoozedUntil is rejected'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object(
        'kind', 'deferred',
        'snoozedUntil', to_char((now() + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'answer', 'extra'
      ),
      'phase2d2-invalid-defer-extra'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'a deferral with a foreign key is rejected'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'deferred', 'snoozedUntil', '2020-01-01T00:00:00Z'),
      'phase2d2-invalid-defer-past'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'a past deferral instant is rejected'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'deferred', 'snoozedUntil', '2027-01-01 10:00:00'),
      'phase2d2-invalid-defer-naive'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'a naive offset-less deferral instant is rejected'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object(
        'kind', 'deferred',
        'snoozedUntil', to_char((now() + interval '400 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
      'phase2d2-invalid-defer-beyond'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'a deferral beyond the bounded window is rejected'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'deferred', 'snoozedUntil', 12345),
      'phase2d2-invalid-defer-type'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'a non-string deferral instant is rejected'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.dismiss_question_id,
      jsonb_build_object('kind', 'dismissed', 'answer', 'conteúdo'),
      'phase2d2-invalid-dismiss-extra'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '22023',
  'a terminal disposition carrying content is rejected'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where operation_key like 'resolve-v2:phase2d2-invalid-%'
  ),
  0,
  'rejected payloads reserve no operation evidence'
);

-- Ownership without disclosure -------------------------------------------------

create temporary table phase2d2_denials on commit drop as
select
  (
    select pg_temp.phase2d2_resolve(
      '2d299999-0000-4000-8000-000000000099',
      jsonb_build_object('kind', 'dismissed'),
      'phase2d2-missing-question-key'
    )
  ) as missing_result;

select is(
  (select missing_result ->> 'sqlstate' from phase2d2_denials),
  'P0002',
  'a missing question is rejected as not found'
);

select set_config('request.jwt.claim.sub', '2d200002-0000-4000-8000-000000000002', true);

create temporary table phase2d2_cross_owner on commit drop as
select
  (
    select pg_temp.phase2d2_resolve(
      refs.dismiss_question_id,
      jsonb_build_object('kind', 'dismissed'),
      'phase2d2-cross-owner-key'
    )
    from phase2d2_refs as refs
  ) as cross_result;

select is(
  (select cross_result ->> 'sqlstate' from phase2d2_cross_owner),
  'P0002',
  'a cross-owner disposition is denied'
);

select is(
  (select cross_result - '__error__' from phase2d2_cross_owner),
  (select missing_result - '__error__' from phase2d2_denials),
  'cross-owner denial is indistinguishable from a missing question'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where operation_key in (
      'resolve-v2:phase2d2-cross-owner-key',
      'resolve-v2:phase2d2-missing-question-key'
    )
  ),
  0,
  'denied dispositions reserve no operation evidence'
);

-- Queue baseline: the completed defer entry is listed for its open question --

select set_config('request.jwt.claim.sub', '2d200001-0000-4000-8000-000000000001', true);

select is(
  (
    select queue.reason
    from public.list_needs_attention(50, null, null) as queue, phase2d2_refs as refs
    where queue.entry_id = '2d210001-0000-4000-8000-000000000001'
  ),
  'answer_existing_question',
  'an open question keeps its completed entry in the Needs Attention queue'
);

-- Defer -----------------------------------------------------------------------

create temporary table phase2d2_defer as
select
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object(
        'kind', 'deferred',
        'snoozedUntil', to_char((now() + interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
      'phase2d2-defer-key'
    )
    from phase2d2_refs as refs
  ) as result;

select is(
  (select result ->> 'resolution' from phase2d2_defer),
  'deferred',
  'the owner deferral transition succeeds'
);

select is(
  (select result ->> 'snoozed_until' from phase2d2_defer),
  (select to_char((now() + interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  'the deferral result echoes the canonical UTC instant'
);

select is(
  (
    select question_row.status from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.defer_question_id
  ),
  'snoozed',
  'the question row moved to snoozed'
);

select is(
  (
    select question_row.snoozed_until from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.defer_question_id
  ),
  -- The canonical wire form carries millisecond precision, so the stored
  -- instant is the canonical round-trip of the submitted string.
  (to_char((now() + interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::timestamptz,
  'the stored snoozed_until is the validated instant'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs as audit_row, phase2d2_refs as refs
    where audit_row.action_type = 'resolve_pending_question_v2'
      and audit_row.entity_id = refs.defer_question_id
      and audit_row.actor = 'user'
      and audit_row.after_state ->> 'resolution' = 'deferred'
      and audit_row.after_state ? 'snoozed_until'
      and audit_row.before_state ->> 'status' = 'open'
  ),
  1,
  'exactly one audit row records the deferral with its instant'
);

select is(
  (
    select audit_row.after_state ->> 'request_fingerprint'
    from public.audit_logs as audit_row, phase2d2_refs as refs
    where audit_row.action_type = 'resolve_pending_question_v2'
      and audit_row.entity_id = refs.defer_question_id
      and audit_row.after_state ->> 'resolution' = 'deferred'
  ),
  (
    select pg_temp.phase2d2_sha256(
      jsonb_build_object(
        'questionId', refs.defer_question_id,
        'kind', 'deferred',
        'snoozedUntil', to_char((now() + interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    )
    from phase2d2_refs as refs
  ),
  'the audited deferral fingerprint is the canonical SHA-256 of the normalized command'
);

select is(
  (
    select count(*)::integer
    from public.undo_operations as operation_row, phase2d2_refs as refs
    where operation_row.operation_key = 'resolve-v2:phase2d2-defer-key'
      and operation_row.action_type = 'resolve_pending_question_v2'
      and operation_row.entity_ids = array[refs.defer_question_id]
      and operation_row.status = 'available'
      and operation_row.after_state ->> 'resolution' = 'deferred'
  ),
  1,
  'exactly one namespaced undo operation was registered for the deferral'
);

-- Deferral replay and mismatch -------------------------------------------------

create temporary table phase2d2_defer_replay as
select
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object(
        'kind', 'deferred',
        'snoozedUntil', to_char((now() + interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
      'phase2d2-defer-key'
    )
    from phase2d2_refs as refs
  ) as result;

select is(
  (select (result ->> 'idempotent')::boolean from phase2d2_defer_replay),
  true,
  'the same key and canonical deferral payload replay deterministically'
);

select is(
  (select result ->> 'undo_id' from phase2d2_defer_replay),
  (select result ->> 'undo_id' from phase2d2_defer),
  'the deferral replay returns the original undo operation id'
);

select is(
  (select result ->> 'snoozed_until' from phase2d2_defer_replay),
  (select result ->> 'snoozed_until' from phase2d2_defer),
  'the deferral replay echoes the original instant'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object(
        'kind', 'deferred',
        'snoozedUntil', to_char((now() + interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
      'phase2d2-defer-key'
    ) ->> 'detail'
    from phase2d2_refs as refs
  ),
  '2D_IDEMPOTENCY_MISMATCH',
  'the same key with a different deferral instant is rejected as a mismatch'
);

-- Still-snoozed questions are not resolvable ------------------------------------

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'dismissed'),
      'phase2d2-early-dismiss-key'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '55000',
  'a still-snoozed question rejects a new resolution before its deadline'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where operation_key = 'resolve-v2:phase2d2-early-dismiss-key'
  ),
  0,
  'the early resolution left no reserved operation evidence'
);

select ok(
  not exists (
    select 1
    from public.list_needs_attention(50, null, null) as queue
    where queue.entry_id = '2d210001-0000-4000-8000-000000000001'
  ),
  'a deferred question leaves the Needs Attention queue until its deadline'
);

-- Deterministic reactivation ----------------------------------------------------

-- Fixture manipulation: now() is frozen inside this transaction, so the
-- deadline is moved into the past directly instead of waiting for it.
update public.pending_questions
set snoozed_until = now() - interval '1 hour'
where id = (select refs.defer_question_id from phase2d2_refs as refs);

select is(
  (
    select queue.open_question_id
    from public.list_needs_attention(50, null, null) as queue
    where queue.entry_id = '2d210001-0000-4000-8000-000000000001'
  ),
  (select refs.defer_question_id from phase2d2_refs as refs),
  'a snoozed question past its deadline deterministically returns to the queue'
);

create temporary table phase2d2_reactivated_answer as
select
  (
    select pg_temp.phase2d2_resolve(
      refs.defer_question_id,
      jsonb_build_object('kind', 'answer', 'answer', E'  Resposta reçativada  '),
      'phase2d2-reactivated-answer-key'
    )
    from phase2d2_refs as refs
  ) as result;

select is(
  (select result ->> 'resolution' from phase2d2_reactivated_answer),
  'answered',
  'a reactivated question is resolvable again through the same contract'
);

select is(
  (
    select question_row.status from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.defer_question_id
  ),
  'answered',
  'the reactivated resolution moved the question to answered'
);

select ok(
  (
    select question_row.snoozed_until is null
    from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.defer_question_id
  ),
  'resolving a reactivated question clears the stale snooze deadline'
);

select is(
  (
    select audit_row.before_state ->> 'status'
    from public.audit_logs as audit_row, phase2d2_refs as refs
    where audit_row.action_type = 'resolve_pending_question_v2'
      and audit_row.entity_id = refs.defer_question_id
      and audit_row.after_state ->> 'resolution' = 'answered'
  ),
  'snoozed',
  'the audit evidence truthfully records the automatic snoozed-to-open reactivation'
);

-- Guarded undo: a superseded deferral cannot clobber the newer answer ----------

select is(
  (
    select pg_temp.phase2d2_undo((select (result ->> 'undo_id')::uuid from phase2d2_defer)) ->> 'detail'
  ),
  '2D_UNDO_RESTORE_INTEGRITY',
  'undoing the superseded deferral fails instead of overwriting the newer answer'
);

select is(
  (
    select question_row.status from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.defer_question_id
  ),
  'answered',
  'the guarded undo left the newer answer untouched'
);

create temporary table phase2d2_answer_undo as
select pg_temp.phase2d2_undo(
  (select (result ->> 'undo_id')::uuid from phase2d2_reactivated_answer)
) as result;

select is(
  (select (result ->> 'undone')::boolean from phase2d2_answer_undo),
  true,
  'the stored compensating operation undoes the v2 answer'
);

select ok(
  (
    select question_row.status = 'open'
      and question_row.answer is null
      and question_row.answered_at is null
      and question_row.snoozed_until is null
    from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.defer_question_id
  ),
  'the undone question returned to open with cleared answer and snooze state'
);

-- Dismiss -----------------------------------------------------------------------

create temporary table phase2d2_dismiss as
select
  (
    select pg_temp.phase2d2_resolve(
      refs.dismiss_question_id,
      jsonb_build_object('kind', 'dismissed'),
      'phase2d2-dismiss-key'
    )
    from phase2d2_refs as refs
  ) as result;

select is(
  (select result ->> 'resolution' from phase2d2_dismiss),
  'dismissed',
  'the owner dismissal transition succeeds'
);

select is(
  (
    select question_row.status from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.dismiss_question_id
  ),
  'dismissed',
  'the dismissed question row is terminal'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs as audit_row, phase2d2_refs as refs
    where audit_row.action_type = 'resolve_pending_question_v2'
      and audit_row.entity_id = refs.dismiss_question_id
      and audit_row.after_state ->> 'resolution' = 'dismissed'
      and audit_row.after_state ->> 'request_fingerprint' = pg_temp.phase2d2_sha256(
        jsonb_build_object('questionId', refs.dismiss_question_id, 'kind', 'dismissed')
      )
  ),
  1,
  'the dismissal audit row carries the canonical terminal fingerprint'
);

select ok(
  not exists (
    select 1
    from public.list_needs_attention(50, null, null) as queue
    where queue.entry_id = '2d210002-0000-4000-8000-000000000002'
  ),
  'a dismissed question leaves the Needs Attention queue terminally'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.dismiss_question_id,
      jsonb_build_object('kind', 'not_relevant'),
      'phase2d2-terminal-to-terminal-key'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '55000',
  'a terminal question rejects a direct terminal-to-terminal transition'
);

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.dismiss_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'tarde demais'),
      'phase2d2-terminal-answer-key'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '55000',
  'a terminal question rejects a late answer'
);

select is(
  (
    select (pg_temp.phase2d2_resolve(
      refs.dismiss_question_id,
      jsonb_build_object('kind', 'dismissed'),
      'phase2d2-dismiss-key'
    ) ->> 'idempotent')::boolean
    from phase2d2_refs as refs
  ),
  true,
  'the dismissal replays deterministically under its original key'
);

create temporary table phase2d2_dismiss_undo as
select pg_temp.phase2d2_undo(
  (select (result ->> 'undo_id')::uuid from phase2d2_dismiss)
) as result;

select is(
  (select (result ->> 'affected')::integer from phase2d2_dismiss_undo),
  1,
  'the dismissal undo restored exactly one question'
);

select is(
  (
    select question_row.status from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.dismiss_question_id
  ),
  'open',
  'the undone dismissal returned the question to open'
);

select is(
  (
    select (pg_temp.phase2d2_undo(
      (select (result ->> 'undo_id')::uuid from phase2d2_dismiss)
    ) ->> 'idempotent')::boolean
  ),
  true,
  'a repeated dismissal undo is an idempotent no-op'
);

create temporary table phase2d2_redismiss as
select
  (
    select pg_temp.phase2d2_resolve(
      refs.dismiss_question_id,
      jsonb_build_object('kind', 'dismissed'),
      'phase2d2-redismiss-key'
    )
    from phase2d2_refs as refs
  ) as result;

select is(
  (select result ->> 'resolution' from phase2d2_redismiss),
  'dismissed',
  'a restored question can be dismissed again under a new operation key'
);

-- Not relevant ------------------------------------------------------------------

create temporary table phase2d2_not_relevant as
select
  (
    select pg_temp.phase2d2_resolve(
      refs.not_relevant_question_id,
      jsonb_build_object('kind', 'not_relevant'),
      'phase2d2-not-relevant-key'
    )
    from phase2d2_refs as refs
  ) as result;

select is(
  (select result ->> 'resolution' from phase2d2_not_relevant),
  'not_relevant',
  'the not-relevant transition reports its distinct resolution kind'
);

select is(
  (
    select question_row.status from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.not_relevant_question_id
  ),
  'dismissed',
  'not_relevant reuses the dismissed status per ADR-033'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs as audit_row, phase2d2_refs as refs
    where audit_row.action_type = 'resolve_pending_question_v2'
      and audit_row.entity_id = refs.not_relevant_question_id
      and audit_row.after_state ->> 'resolution' = 'not_relevant'
  ),
  1,
  'history labels the not-relevant outcome distinctly from a dismissal'
);

select is(
  (
    select operation_row.after_state ->> 'resolution'
    from public.undo_operations as operation_row
    where operation_row.operation_key = 'resolve-v2:phase2d2-not-relevant-key'
  ),
  'not_relevant',
  'the undo evidence preserves the distinct not-relevant kind'
);

create temporary table phase2d2_not_relevant_undo as
select pg_temp.phase2d2_undo(
  (select (result ->> 'undo_id')::uuid from phase2d2_not_relevant)
) as result;

select is(
  (
    select question_row.status from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.not_relevant_question_id
  ),
  'open',
  'the undone not-relevant resolution returned the question to open'
);

-- Stale interpretation -----------------------------------------------------------

select is(
  (
    select pg_temp.phase2d2_resolve(
      refs.stale_question_id,
      jsonb_build_object(
        'kind', 'deferred',
        'snoozedUntil', to_char((now() + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
      'phase2d2-stale-key'
    ) ->> 'sqlstate'
    from phase2d2_refs as refs
  ),
  '55P03',
  'deferring a question whose interpretation is no longer current is rejected as stale'
);

select is(
  (
    select question_row.status
    from public.pending_questions as question_row, phase2d2_refs as refs
    where question_row.id = refs.stale_question_id
  ),
  'open',
  'the stale rejection wrote nothing to the question row'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where operation_key = 'resolve-v2:phase2d2-stale-key'
  ),
  0,
  'the stale rejection rolled back its reserved operation atomically'
);

-- v1 compatibility and namespace isolation ---------------------------------------

create temporary table phase2d2_v1_result as
select
  (
    select pg_temp.phase2d2_resolve_v1(
      refs.v1_question_id,
      jsonb_build_object('kind', 'answer', 'answer', 'Resposta pelo contrato v1'),
      'phase2d2-defer-key'
    )
    from phase2d2_refs as refs
  ) as result;

select is(
  (select result ->> 'resolution' from phase2d2_v1_result),
  'answered',
  'resolve_pending_question_v1 still answers an open question after the v2 migration'
);

select is(
  (select (result ->> 'idempotent')::boolean from phase2d2_v1_result),
  false,
  'the shared raw key is a fresh operation under the v1 namespace — v1 and v2 reservations never collide'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where operation_key in ('resolve-v1:phase2d2-defer-key', 'resolve-v2:phase2d2-defer-key')
  ),
  2,
  'the v1 and v2 namespaces hold independent reservations for the same raw key'
);

-- Immutable interpretation evidence ----------------------------------------------

select is(
  (
    select interpretation_row.pending_questions
    from public.entry_interpretations as interpretation_row
    join phase2d2_interpretation_snapshot as snapshot
      on snapshot.id = interpretation_row.id
  ),
  (select snapshot.pending_questions from phase2d2_interpretation_snapshot as snapshot),
  'the immutable interpretation pending_questions JSON is byte-identical after defer, reactivation, dismissal, and undo'
);

select * from finish();

rollback;
