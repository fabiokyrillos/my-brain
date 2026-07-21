-- Issue #3 database enablement: candidate_edit_started, candidate_edit_reset,
-- and task_candidates_confirmed's editedCandidateCount/editedFieldCount
-- (migration 202607210034). Focused, additive to the pre-existing
-- product_events.sql suite (left untouched) rather than editing it.

begin;

select plan(29);

select has_function(
  'private', 'require_task_candidates_confirmed_edit_counts', array['jsonb'],
  'the cross-field edited-count bound helper exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.require_task_candidates_confirmed_edit_counts(jsonb)',
    'execute'
  ),
  'the cross-field bound helper is not directly callable by authenticated'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'candidate-analytics-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'candidate-analytics-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (
  id, user_id, original_content, status, locale
) values
  ('c0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-000000000001', 'Editable candidate analytics owned fixture', 'saved', 'en'),
  ('c0000000-0000-4000-8000-0000000000e2', 'c0000000-0000-4000-8000-000000000002', 'Editable candidate analytics foreign fixture', 'saved', 'en');

-- The event_name CHECK constraint (table boundary) accepts both new events,
-- independent of the RPC's own validation and of the grants exercised below.
select lives_ok(
  $$ insert into public.product_events (
    user_id, event_name, surface, locale, viewport_class, app_version, properties, idempotency_key
  ) values (
    'c0000000-0000-4000-8000-000000000001', 'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 1), 'd0000000-0000-4000-8000-000000000001'
  ) $$,
  'the event_name constraint accepts candidate_edit_started at the table boundary'
);
select lives_ok(
  $$ insert into public.product_events (
    user_id, event_name, surface, locale, viewport_class, app_version, properties, idempotency_key
  ) values (
    'c0000000-0000-4000-8000-000000000001', 'candidate_edit_reset', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('editedFieldCount', 2), 'd0000000-0000-4000-8000-000000000002'
  ) $$,
  'the event_name constraint accepts candidate_edit_reset at the table boundary'
);
delete from public.product_events where idempotency_key in (
  'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- candidate_edit_started ----------------------------------------------------

select public.record_product_event(
  'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
  jsonb_build_object('candidateCount', 1), 'entry', 'c0000000-0000-4000-8000-0000000000e1', null,
  'e0000000-0000-4000-8000-000000000001', true
);
select results_eq(
  $$ select count(*)::bigint from public.product_events
     where idempotency_key = 'e0000000-0000-4000-8000-000000000001'
       and event_name = 'candidate_edit_started'
       and properties = jsonb_build_object('candidateCount', 1) $$,
  array[1::bigint],
  'a valid candidate_edit_started payload persists with its exact properties'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    '{}'::jsonb, null, null, null,
    'e0000000-0000-4000-8000-000000000002', true
  ) $$,
  '22023',
  'Invalid product event property',
  'candidate_edit_started without candidateCount is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 0), null, null, null,
    'e0000000-0000-4000-8000-000000000003', true
  ) $$,
  '22023',
  'Invalid product event property',
  'candidate_edit_started with candidateCount = 0 is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 2), null, null, null,
    'e0000000-0000-4000-8000-000000000004', true
  ) $$,
  '22023',
  'Invalid product event property',
  'candidate_edit_started with candidateCount above the expected bound is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', '1'), null, null, null,
    'e0000000-0000-4000-8000-000000000005', true
  ) $$,
  '22023',
  'Invalid product event property',
  'candidate_edit_started with a string candidateCount is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 1, 'candidateIndex', 0), null, null, null,
    'e0000000-0000-4000-8000-000000000006', true
  ) $$,
  '22023',
  'Unsupported product event property',
  'candidate_edit_started rejects an unknown property'
);

-- candidate_edit_reset --------------------------------------------------------

select public.record_product_event(
  'candidate_edit_reset', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
  jsonb_build_object('editedFieldCount', 3), 'entry', 'c0000000-0000-4000-8000-0000000000e1', null,
  'e0000000-0000-4000-8000-000000000007', true
);
select results_eq(
  $$ select count(*)::bigint from public.product_events
     where idempotency_key = 'e0000000-0000-4000-8000-000000000007'
       and event_name = 'candidate_edit_reset'
       and properties = jsonb_build_object('editedFieldCount', 3) $$,
  array[1::bigint],
  'a valid candidate_edit_reset payload (maximum bound) persists with its exact properties'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_reset', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('editedFieldCount', 0), null, null, null,
    'e0000000-0000-4000-8000-000000000008', true
  ) $$,
  '22023',
  'Invalid product event property',
  'candidate_edit_reset with editedFieldCount = 0 is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_reset', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('editedFieldCount', 4), null, null, null,
    'e0000000-0000-4000-8000-000000000009', true
  ) $$,
  '22023',
  'Invalid product event property',
  'candidate_edit_reset with editedFieldCount above the editable-field bound is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_reset', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('editedFieldCount', 1.5), null, null, null,
    'e0000000-0000-4000-8000-00000000000a', true
  ) $$,
  '22023',
  'Invalid product event property',
  'candidate_edit_reset with a non-integer editedFieldCount is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_reset', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('editedFieldCount', 1, 'title', 'leaked'), null, null, null,
    'e0000000-0000-4000-8000-00000000000b', true
  ) $$,
  '22023',
  'Unsupported product event property',
  'candidate_edit_reset rejects an unknown (privacy-sensitive) property'
);

-- task_candidates_confirmed edit counts ----------------------------------------

select public.record_product_event(
  'task_candidates_confirmed', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
  jsonb_build_object('candidateCount', 2), 'entry', 'c0000000-0000-4000-8000-0000000000e1', null,
  'e0000000-0000-4000-8000-00000000000c', true
);
select results_eq(
  $$ select count(*)::bigint from public.product_events
     where idempotency_key = 'e0000000-0000-4000-8000-00000000000c'
       and properties = jsonb_build_object('candidateCount', 2) $$,
  array[1::bigint],
  'a legacy task_candidates_confirmed payload with only candidateCount still persists'
);
select public.record_product_event(
  'task_candidates_confirmed', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
  jsonb_build_object('candidateCount', 2, 'editedCandidateCount', 0, 'editedFieldCount', 0), 'entry', 'c0000000-0000-4000-8000-0000000000e1', null,
  'e0000000-0000-4000-8000-00000000000d', true
);
select results_eq(
  $$ select count(*)::bigint from public.product_events
     where idempotency_key = 'e0000000-0000-4000-8000-00000000000d'
       and properties = jsonb_build_object('candidateCount', 2, 'editedCandidateCount', 0, 'editedFieldCount', 0) $$,
  array[1::bigint],
  'a task_candidates_confirmed payload with zero edits persists'
);
select public.record_product_event(
  'task_candidates_confirmed', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
  jsonb_build_object('candidateCount', 2, 'editedCandidateCount', 2, 'editedFieldCount', 4), 'entry', 'c0000000-0000-4000-8000-0000000000e1', null,
  'e0000000-0000-4000-8000-00000000000e', true
);
select results_eq(
  $$ select count(*)::bigint from public.product_events
     where idempotency_key = 'e0000000-0000-4000-8000-00000000000e'
       and properties = jsonb_build_object('candidateCount', 2, 'editedCandidateCount', 2, 'editedFieldCount', 4) $$,
  array[1::bigint],
  'a task_candidates_confirmed payload with edits persists with its exact properties'
);
select throws_ok(
  $$ select public.record_product_event(
    'task_candidates_confirmed', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 2, 'editedCandidateCount', 3, 'editedFieldCount', 3), null, null, null,
    'e0000000-0000-4000-8000-00000000000f', true
  ) $$,
  '22023',
  'Invalid product event property',
  'editedCandidateCount above candidateCount is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'task_candidates_confirmed', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 2, 'editedCandidateCount', 1, 'editedFieldCount', 4), null, null, null,
    'e0000000-0000-4000-8000-000000000010', true
  ) $$,
  '22023',
  'Invalid product event property',
  'editedFieldCount above editedCandidateCount times three is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'task_candidates_confirmed', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 2, 'editedCandidateCount', 0, 'editedFieldCount', 1), null, null, null,
    'e0000000-0000-4000-8000-000000000011', true
  ) $$,
  '22023',
  'Invalid product event property',
  'a zero editedCandidateCount with a nonzero editedFieldCount is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'task_candidates_confirmed', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 2, 'editedCandidateCount', 1), null, null, null,
    'e0000000-0000-4000-8000-000000000012', true
  ) $$,
  '22023',
  'Invalid product event property',
  'supplying editedCandidateCount without editedFieldCount is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'task_candidates_confirmed', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 1, 'editedCandidateCount', 1, 'editedFieldCount', 1, 'title', 'leaked'), null, null, null,
    'e0000000-0000-4000-8000-000000000013', true
  ) $$,
  '22023',
  'Unsupported product event property',
  'task_candidates_confirmed rejects an unknown (privacy-sensitive) property'
);

-- Contract/security -------------------------------------------------------------

select throws_ok(
  $$ select public.record_product_event(
    'unknown_event', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 1), null, null, null,
    'e0000000-0000-4000-8000-000000000014', true
  ) $$,
  '22023',
  'Unsupported product event',
  'an unrelated/unknown event name remains rejected after the allowlist extension'
);
select throws_ok(
  $$ select public.record_product_event(
    'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 1), 'entry', 'c0000000-0000-4000-8000-0000000000e2', null,
    'e0000000-0000-4000-8000-000000000015', true
  ) $$,
  '42501',
  'Product event subject is not owned by caller',
  'a candidate_edit_started subject owned by another user is denied'
);
select throws_ok(
  $$ insert into public.product_events (
    user_id, event_name, surface, locale, viewport_class, app_version, properties, idempotency_key
  ) values (
    'c0000000-0000-4000-8000-000000000001', 'candidate_edit_started', 'interpretation_review', 'pt-BR', 'desktop', '2c-test-1',
    jsonb_build_object('candidateCount', 1), 'e0000000-0000-4000-8000-000000000016'
  ) $$,
  '42501',
  null,
  'authenticated callers still cannot bypass the validated ledger RPC for the new events'
);

reset role;
insert into public.product_events (
  user_id, event_name, surface, locale, viewport_class, app_version, properties, idempotency_key
) values (
  'c0000000-0000-4000-8000-000000000002', 'candidate_edit_reset', 'interpretation_review', 'en', 'desktop', '2c-test-1',
  jsonb_build_object('editedFieldCount', 1), 'e0000000-0000-4000-8000-000000000017'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$ select count(*)::bigint from public.product_events where user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  array[0::bigint],
  'RLS still hides another user candidate-analytics event'
);

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.record_product_event(text,text,text,text,text,jsonb,text,uuid,uuid,uuid,boolean)'::regprocedure $$,
  array[true],
  'record_product_event remains security definer after the allowlist extension'
);
select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.record_product_event(text,text,text,text,text,jsonb,text,uuid,uuid,uuid,boolean)'::regprocedure $$,
  array[true],
  'record_product_event keeps a safe search path after the allowlist extension'
);

select * from finish();
rollback;
