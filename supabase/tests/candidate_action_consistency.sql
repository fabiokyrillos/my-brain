begin;

select plan(33);

select has_column('public', 'entry_interpretations', 'is_record_only', 'interpretation revisions persist record-only status');
select has_column('public', 'tasks', 'source_interpretation_id', 'tasks record which interpretation produced them');
select has_column('public', 'tasks', 'operation_key', 'tasks support idempotent confirmation replay');
select has_function('public', 'confirm_entry_task_candidates', array['uuid', 'uuid', 'integer[]', 'text']);
select has_function('public', 'confirm_entry_tasks', array['uuid', 'integer[]']);

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.confirm_entry_task_candidates(uuid,uuid,integer[],text)'::regprocedure $$,
  array[true],
  'candidate confirmation uses the established SECURITY DEFINER boundary with explicit owner checks'
);
select results_eq(
  $$ select pg_get_functiondef('public.confirm_entry_task_candidates(uuid,uuid,integer[],text)'::regprocedure) like '%set search_path = ''''%' $$,
  array[true],
  'candidate confirmation has an explicit safe search path'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_entry_task_candidates(uuid,uuid,integer[],text)', 'execute'),
  'authenticated users can confirm their own candidates'
);
select ok(
  not has_function_privilege('anon', 'public.confirm_entry_task_candidates(uuid,uuid,integer[],text)', 'execute'),
  'anonymous users cannot confirm candidates'
);

select results_eq(
  $$ select count(*)::bigint from pg_constraint where conrelid = 'public.tasks'::regclass and conname = 'tasks_source_interpretation_owner_fk' $$,
  array[1::bigint],
  'candidate provenance validates composite ownership'
);
select has_index('public', 'tasks', 'tasks_source_interpretation_candidate_key', 'confirmed candidates are unique per interpretation');
select has_index('public', 'tasks', 'tasks_legacy_source_entry_candidate_key', 'legacy provenance-less tasks keep entry-wide uniqueness');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'candidate-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'candidate-other@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.entries (id, user_id, original_content, source, status, locale)
values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'Candidate consistency fixture', 'web', 'saved', 'en'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.persist_entry_interpretation(
  '33333333-3333-4333-8333-333333333333',
  jsonb_build_object(
    'summary', 'Fixture v1',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'taskCandidates', jsonb_build_array(
      jsonb_build_object('title', 'Candidate zero', 'confidence', 0.9),
      jsonb_build_object('title', 'Candidate one', 'confidence', 0.8)
    ),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
);

select results_eq(
  $$ select is_record_only from public.entry_interpretations where entry_id = '33333333-3333-4333-8333-333333333333' and version = 1 $$,
  array[false],
  'AI-generated interpretations are never record-only'
);

select is(
  (public.confirm_entry_task_candidates(
    '33333333-3333-4333-8333-333333333333',
    (select current_interpretation_id from public.entries where id = '33333333-3333-4333-8333-333333333333'),
    array[0],
    'pgtap:confirm:v1-candidate-zero'
  ))->>'idempotent',
  'false',
  'confirming a current candidate creates its first task'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where user_id = '11111111-1111-4111-8111-111111111111'
      and source_interpretation_id = (select current_interpretation_id from public.entries where id = '33333333-3333-4333-8333-333333333333')
      and candidate_index = 0
  $$,
  array[1::bigint],
  'exactly one task is created for the confirmed candidate'
);
select is(
  (public.confirm_entry_task_candidates(
    '33333333-3333-4333-8333-333333333333',
    (select current_interpretation_id from public.entries where id = '33333333-3333-4333-8333-333333333333'),
    array[0],
    'pgtap:confirm:v1-candidate-zero'
  ))->>'idempotent',
  'true',
  'replaying the same operation key does not duplicate the task'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where user_id = '11111111-1111-4111-8111-111111111111'
      and source_interpretation_id = (select current_interpretation_id from public.entries where id = '33333333-3333-4333-8333-333333333333')
      and candidate_index = 0
  $$,
  array[1::bigint],
  'idempotent replay leaves exactly one task'
);

select throws_ok(
  $$ select public.confirm_entry_task_candidates('33333333-3333-4333-8333-333333333333', gen_random_uuid(), array[1], 'pgtap:confirm:stale-expectation') $$,
  '55P03',
  'Interpretation is no longer current',
  'confirming against the wrong interpretation id is rejected'
);
select throws_ok(
  $$ select public.confirm_entry_task_candidates('33333333-3333-4333-8333-333333333333', (select current_interpretation_id from public.entries where id = '33333333-3333-4333-8333-333333333333'), array[5], 'pgtap:confirm:bad-index') $$,
  '22023',
  'Invalid task candidate index',
  'an out-of-range candidate index is rejected'
);

-- A correction appends a new interpretation. Candidate index 0 in the new
-- version is a distinct, not-yet-confirmed candidate even though it carries
-- the same content forward, and the previously confirmed task must survive.
select public.correct_entry_interpretation(
  '33333333-3333-4333-8333-333333333333',
  1,
  jsonb_build_object(
    'summary', 'Fixture v2 corrected',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'extractedDates', '[]'::jsonb,
    'entityLinks', '[]'::jsonb,
    'classifications', jsonb_build_object('summary', 'interpretation', 'concepts', 'interpretation', 'occurredAt', 'fact', 'entities', 'interpretation'),
    'pendingQuestions', '[]'::jsonb,
    'elementTrust', jsonb_build_object(
      'summary', jsonb_build_object('score', 0.9, 'policy', 'auto_apply', 'signals', '{}'::jsonb, 'overrides', '[]'::jsonb, 'evidence', '[]'::jsonb)
    ),
    'recordOnly', false
  ),
  'pgtap:correct:v2'
);

select results_eq(
  $$ select version from public.entries e join public.entry_interpretations i on i.id = e.current_interpretation_id where e.id = '33333333-3333-4333-8333-333333333333' $$,
  array[2],
  'the correction advances the current interpretation to version 2'
);
select is(
  (public.confirm_entry_task_candidates(
    '33333333-3333-4333-8333-333333333333',
    (select current_interpretation_id from public.entries where id = '33333333-3333-4333-8333-333333333333'),
    array[0],
    'pgtap:confirm:v2-candidate-zero'
  ))->>'idempotent',
  'false',
  'the same candidate index in a newer interpretation is independently confirmable'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where user_id = '11111111-1111-4111-8111-111111111111'
      and candidate_index = 0
      and status <> 'cancelled'
  $$,
  array[2::bigint],
  'both interpretation versions now have their own task at candidate index 0'
);
-- The task confirmed under version 1 must still exist untouched.
select results_eq(
  $$
    select count(*)::bigint
    from public.tasks
    where user_id = '11111111-1111-4111-8111-111111111111'
      and operation_key = 'pgtap:confirm:v1-candidate-zero'
      and status <> 'cancelled'
  $$,
  array[1::bigint],
  'a task confirmed before a correction survives the correction'
);

-- Undo the v2 confirmation and prove it does not resurrect anything invalid.
select is(
  (public.undo_operation(
    (select id from public.undo_operations
     where user_id = '11111111-1111-4111-8111-111111111111'
       and operation_key = 'confirm:pgtap:confirm:v2-candidate-zero')
  ))->>'undone',
  'true',
  'undoing the v2 confirmation cancels its task'
);
select results_eq(
  $$
    select status
    from public.tasks
    where user_id = '11111111-1111-4111-8111-111111111111'
      and operation_key = 'pgtap:confirm:v2-candidate-zero'
  $$,
  $$ values ('cancelled'::text) $$,
  'the undone task is cancelled, not deleted'
);
select results_eq(
  $$
    select status
    from public.tasks
    where user_id = '11111111-1111-4111-8111-111111111111'
      and operation_key = 'pgtap:confirm:v1-candidate-zero'
  $$,
  $$ values ('inbox'::text) $$,
  'undo of the v2 confirmation does not touch the unrelated v1 task'
);

-- Record-only interpretations have zero actionable candidates.
select public.correct_entry_interpretation(
  '33333333-3333-4333-8333-333333333333',
  2,
  jsonb_build_object(
    'summary', 'Fixture v3 record only',
    'concepts', jsonb_build_array('note'),
    'occurredAt', now()::text,
    'extractedDates', '[]'::jsonb,
    'entityLinks', '[]'::jsonb,
    'classifications', jsonb_build_object('summary', 'interpretation', 'concepts', 'interpretation', 'occurredAt', 'fact', 'entities', 'interpretation'),
    'pendingQuestions', '[]'::jsonb,
    'elementTrust', jsonb_build_object(
      'summary', jsonb_build_object('score', 0.9, 'policy', 'auto_apply', 'signals', '{}'::jsonb, 'overrides', '[]'::jsonb, 'evidence', '[]'::jsonb)
    ),
    'recordOnly', true
  ),
  'pgtap:correct:v3-record-only'
);
select results_eq(
  $$ select is_record_only from public.entries e join public.entry_interpretations i on i.id = e.current_interpretation_id where e.id = '33333333-3333-4333-8333-333333333333' $$,
  array[true],
  'a record-only correction persists is_record_only on the resulting version'
);
select throws_ok(
  $$ select public.confirm_entry_task_candidates('33333333-3333-4333-8333-333333333333', (select current_interpretation_id from public.entries where id = '33333333-3333-4333-8333-333333333333'), array[0], 'pgtap:confirm:record-only-blocked') $$,
  '55000',
  'Interpretation is record-only; no candidate is actionable',
  'a record-only interpretation has no actionable candidates'
);

-- Undoing the record-only correction restores actionable candidates.
select is(
  (public.undo_operation(
    (select id from public.undo_operations
     where user_id = '11111111-1111-4111-8111-111111111111'
       and operation_key = 'correction:pgtap:correct:v3-record-only')
  ))->>'undone',
  'true',
  'undoing the record-only correction succeeds'
);
select results_eq(
  $$ select is_record_only from public.entries e join public.entry_interpretations i on i.id = e.current_interpretation_id where e.id = '33333333-3333-4333-8333-333333333333' $$,
  array[false],
  'undoing a record-only correction restores the prior actionable status'
);

-- Cross-user isolation.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select throws_ok(
  $$ select public.confirm_entry_task_candidates('33333333-3333-4333-8333-333333333333', gen_random_uuid(), array[0], 'pgtap:confirm:cross-user') $$,
  'P0002',
  'Entry not found',
  'cross-user confirmation is denied without leaking ownership'
);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

-- Conservative backfill logic: only entries with exactly one interpretation
-- ever created are safe to backfill without inventing provenance. This
-- mirrors the migration's guarded UPDATE against fixtures constructed here,
-- since the migration's own one-time backfill already ran against an empty
-- table when this test database was created.
insert into public.entries (id, user_id, original_content, source, status, locale)
values (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'Single interpretation backfill fixture', 'web', 'saved', 'en'
);
select public.persist_entry_interpretation(
  '44444444-4444-4444-8444-444444444444',
  jsonb_build_object(
    'summary', 'Single version fixture',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'taskCandidates', jsonb_build_array(jsonb_build_object('title', 'Legacy candidate', 'confidence', 0.9)),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
);
insert into public.tasks (id, user_id, source_entry_id, candidate_index, title, status, created_by)
values (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  0, 'Legacy task without provenance', 'inbox', 'user'
);
-- A legacy-shaped task (no provenance) on the multi-interpretation entry
-- from earlier in this fixture, at an index none of the RPC-created tasks
-- above used, so it is unambiguous which row the backfill assertion covers.
insert into public.tasks (id, user_id, source_entry_id, candidate_index, title, status, created_by)
values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  9, 'Legacy task on a multi-version entry', 'inbox', 'user'
);

with single_interpretation_entry as (
  select entry_id, user_id, min(id::text)::uuid as interpretation_id
  from public.entry_interpretations
  group by entry_id, user_id
  having count(*) = 1
)
update public.tasks task
set source_interpretation_id = fixture.interpretation_id
from single_interpretation_entry fixture
where task.source_entry_id = fixture.entry_id
  and task.user_id = fixture.user_id
  and task.candidate_index is not null
  and task.source_interpretation_id is null;

select results_eq(
  $$ select source_interpretation_id is not null from public.tasks where id = '55555555-5555-4555-8555-555555555555' $$,
  array[true],
  'a legacy task on an entry with exactly one interpretation is safely backfilled'
);
select results_eq(
  $$ select source_interpretation_id is null from public.tasks where id = '66666666-6666-4666-8666-666666666666' $$,
  array[true],
  'a legacy-shaped task on a multi-interpretation entry is not backfilled and keeps no invented provenance'
);

select * from finish();
rollback;
