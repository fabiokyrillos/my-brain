begin;

select plan(35);

select has_function('public', 'list_needs_attention', array['integer', 'timestamptz', 'uuid']);
select has_index('public', 'jobs', 'jobs_interpret_entry_status_idx', 'entry jobs support a bounded per-user status lookup');

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.list_needs_attention(integer,timestamptz,uuid)'::regprocedure $$,
  array[true],
  'needs-attention listing is security definer'
);
select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.list_needs_attention(integer,timestamptz,uuid)'::regprocedure $$,
  array[true],
  'needs-attention listing has an explicit safe search path'
);
select ok(
  has_function_privilege('authenticated', 'public.list_needs_attention(integer,timestamptz,uuid)', 'execute'),
  'authenticated users can list their own needs-attention queue'
);
select ok(
  not has_function_privilege('anon', 'public.list_needs_attention(integer,timestamptz,uuid)', 'execute'),
  'anonymous users cannot list any needs-attention queue'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'needs-attention-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'needs-attention-other@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

-- e1/e2: review_interpretation, driven by entry status alone.
insert into public.entries (id, user_id, original_content, source, status, locale, updated_at) values
  ('a1111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-111111111111', 'Awaiting review fixture', 'web', 'awaiting_review', 'en', now() - interval '1 minute'),
  ('a1111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-111111111111', 'Partially processed fixture', 'web', 'partially_processed', 'en', now() - interval '2 minutes'),
  ('a1111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-111111111111', 'Recoverable error, no job row', 'web', 'recoverable_error', 'en', now() - interval '3 minutes'),
  ('a1111111-1111-4111-8111-000000000004', '11111111-1111-4111-8111-111111111111', 'Recoverable error, active auto-retry', 'web', 'recoverable_error', 'en', now() - interval '3 minutes'),
  ('a1111111-1111-4111-8111-000000000005', '11111111-1111-4111-8111-111111111111', 'Recoverable error, auto-retry window elapsed', 'web', 'recoverable_error', 'en', now() - interval '4 minutes'),
  ('a1111111-1111-4111-8111-000000000006', '11111111-1111-4111-8111-111111111111', 'Terminal error fixture', 'web', 'terminal_error', 'en', now() - interval '5 minutes'),
  ('a1111111-1111-4111-8111-000000000007', '11111111-1111-4111-8111-111111111111', 'Completed, unconfirmed candidate', 'web', 'completed', 'en', now() - interval '6 minutes'),
  ('a1111111-1111-4111-8111-000000000008', '11111111-1111-4111-8111-111111111111', 'Completed, candidate already confirmed', 'web', 'completed', 'en', now() - interval '6 minutes'),
  ('a1111111-1111-4111-8111-000000000009', '11111111-1111-4111-8111-111111111111', 'Completed, record-only with candidates', 'web', 'completed', 'en', now() - interval '6 minutes'),
  ('a1111111-1111-4111-8111-000000000010', '11111111-1111-4111-8111-111111111111', 'Completed, open question and unconfirmed candidate', 'web', 'completed', 'en', now() - interval '7 minutes'),
  ('a1111111-1111-4111-8111-000000000011', '11111111-1111-4111-8111-111111111111', 'Saved but its job already completed', 'web', 'saved', 'en', now() - interval '8 minutes'),
  ('a1111111-1111-4111-8111-000000000012', '11111111-1111-4111-8111-111111111111', 'Saved with a job still pending', 'web', 'saved', 'en', now() - interval '8 minutes'),
  ('a1111111-1111-4111-8111-000000000013', '11111111-1111-4111-8111-111111111111', 'Saved with an unrecognized job status', 'web', 'saved', 'en', now() - interval '9 minutes'),
  ('a1111111-1111-4111-8111-000000000015', '11111111-1111-4111-8111-111111111111', 'Tie-break fixture A', 'web', 'awaiting_review', 'en', now() - interval '10 minutes'),
  ('a1111111-1111-4111-8111-000000000016', '11111111-1111-4111-8111-111111111111', 'Tie-break fixture B', 'web', 'awaiting_review', 'en', now() - interval '10 minutes'),
  ('b2222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-222222222222', 'Another owner''s awaiting-review fixture', 'web', 'awaiting_review', 'en', now() - interval '1 minute');

insert into public.jobs (id, user_id, type, status, idempotency_key, payload, next_attempt_at) values
  ('f4444444-4444-4444-8444-000000000004', '11111111-1111-4111-8111-111111111111', 'interpret_entry', 'failed', 'pgtap-attn-j4', jsonb_build_object('entry_id', 'a1111111-1111-4111-8111-000000000004', 'mode', 'initial'), now() + interval '1 hour'),
  ('f5555555-5555-4555-8555-000000000005', '11111111-1111-4111-8111-111111111111', 'interpret_entry', 'failed', 'pgtap-attn-j5', jsonb_build_object('entry_id', 'a1111111-1111-4111-8111-000000000005', 'mode', 'initial'), now() - interval '1 hour'),
  ('f1111111-1111-4111-8111-000000000011', '11111111-1111-4111-8111-111111111111', 'interpret_entry', 'completed', 'pgtap-attn-j11', jsonb_build_object('entry_id', 'a1111111-1111-4111-8111-000000000011', 'mode', 'initial'), now()),
  ('f1212121-1212-4121-8121-000000000012', '11111111-1111-4111-8111-111111111111', 'interpret_entry', 'pending', 'pgtap-attn-j12', jsonb_build_object('entry_id', 'a1111111-1111-4111-8111-000000000012', 'mode', 'initial'), now()),
  ('f1313131-1313-4131-8131-000000000013', '11111111-1111-4111-8111-111111111111', 'interpret_entry', 'cancelled', 'pgtap-attn-j13', jsonb_build_object('entry_id', 'a1111111-1111-4111-8111-000000000013', 'mode', 'initial'), now());

insert into public.entry_interpretations (
  id, user_id, entry_id, version, model, strategy_version, prompt_version, confidence, raw_output, summary, task_candidates, is_record_only
) values
  ('c7777777-7777-4777-8777-000000000007', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-000000000007', 1, 'pgtap-test', 'v1', 'v1', 0.9, '{}'::jsonb, 'Unconfirmed candidate fixture', '[{"title":"Candidate"}]'::jsonb, false),
  ('c7777777-7777-4777-8777-000000000008', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-000000000008', 1, 'pgtap-test', 'v1', 'v1', 0.9, '{}'::jsonb, 'Confirmed candidate fixture', '[{"title":"Candidate"}]'::jsonb, false),
  ('c7777777-7777-4777-8777-000000000009', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-000000000009', 1, 'pgtap-test', 'v1', 'v1', 0.9, '{}'::jsonb, 'Record-only fixture', '[{"title":"Candidate"}]'::jsonb, true),
  ('c7777777-7777-4777-8777-000000000010', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-000000000010', 1, 'pgtap-test', 'v1', 'v1', 0.9, '{}'::jsonb, 'Open question fixture', '[{"title":"Candidate"}]'::jsonb, false);

alter table public.entries disable trigger entries_updated_at;
update public.entries set current_interpretation_id = 'c7777777-7777-4777-8777-000000000007', updated_at = now() - interval '6 minutes' where id = 'a1111111-1111-4111-8111-000000000007';
update public.entries set current_interpretation_id = 'c7777777-7777-4777-8777-000000000008', updated_at = now() - interval '6 minutes' where id = 'a1111111-1111-4111-8111-000000000008';
update public.entries set current_interpretation_id = 'c7777777-7777-4777-8777-000000000009', updated_at = now() - interval '6 minutes' where id = 'a1111111-1111-4111-8111-000000000009';
update public.entries set current_interpretation_id = 'c7777777-7777-4777-8777-000000000010', updated_at = now() - interval '7 minutes' where id = 'a1111111-1111-4111-8111-000000000010';
alter table public.entries enable trigger entries_updated_at;

insert into public.tasks (id, user_id, source_entry_id, source_interpretation_id, candidate_index, title, status) values
  ('d8888888-8888-4888-8888-000000000008', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-000000000008', 'c7777777-7777-4777-8777-000000000008', 0, 'Already confirmed', 'inbox');

insert into public.pending_questions (id, user_id, entry_id, interpretation_id, candidate_index, question, reason, confidence) values
  ('e1010101-0101-4101-8101-000000000010', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-000000000010', 'c7777777-7777-4777-8777-000000000010', 0, 'Fixture question?', 'Fixture reason', 0.5);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000001'),
  'review_interpretation',
  'awaiting_review surfaces as review_interpretation'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000002'),
  'review_interpretation',
  'partially_processed surfaces as review_interpretation'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000003'),
  'retry_processing',
  'recoverable_error with no job row still surfaces as retry_processing'
);
select ok(
  not exists (select 1 from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000004'),
  'recoverable_error with an active automatic retry window is excluded (NY-007)'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000005'),
  'retry_processing',
  'recoverable_error whose automatic retry window elapsed surfaces as retry_processing (NY-006)'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000006'),
  'retry_processing',
  'terminal_error surfaces as retry_processing'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000007'),
  'confirm_existing_candidates',
  'an unconfirmed current-interpretation candidate surfaces as confirm_existing_candidates'
);
select ok(
  not exists (select 1 from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000008'),
  'a fully confirmed candidate is excluded'
);
select ok(
  not exists (select 1 from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000009'),
  'a record-only interpretation with candidates is excluded (COH-004)'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000010'),
  'answer_existing_question',
  'an open question takes precedence over an unconfirmed candidate on the same entry'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000011'),
  'resolve_consistency',
  'a saved entry whose job already completed is a fail-closed inconsistency'
);
select ok(
  not exists (select 1 from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000012'),
  'a saved entry with a still-pending job is excluded (it is organizing, not needing attention)'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000013'),
  'resolve_consistency',
  'an unrecognized job status is a fail-closed inconsistency'
);
select ok(
  not exists (select 1 from public.list_needs_attention(50, null, null) where entry_id = 'b2222222-2222-4222-8222-000000000001'),
  'another owner''s entry is never returned'
);

select is(
  (select array_agg(entry_id order by occurred_at desc, entry_id desc) from public.list_needs_attention(50, null, null)),
  array[
    'a1111111-1111-4111-8111-000000000001',
    'a1111111-1111-4111-8111-000000000002',
    'a1111111-1111-4111-8111-000000000003',
    'a1111111-1111-4111-8111-000000000005',
    'a1111111-1111-4111-8111-000000000006',
    'a1111111-1111-4111-8111-000000000007',
    'a1111111-1111-4111-8111-000000000010',
    'a1111111-1111-4111-8111-000000000011',
    'a1111111-1111-4111-8111-000000000013',
    'a1111111-1111-4111-8111-000000000016',
    'a1111111-1111-4111-8111-000000000015'
  ]::uuid[],
  'ordering is deterministic: most recent first, tied timestamps break by entry id descending'
);

select is(
  (select array_agg(entry_id order by occurred_at desc, entry_id desc) from public.list_needs_attention(4, null, null)),
  array[
    'a1111111-1111-4111-8111-000000000001',
    'a1111111-1111-4111-8111-000000000002',
    'a1111111-1111-4111-8111-000000000003',
    'a1111111-1111-4111-8111-000000000005'
  ]::uuid[],
  'first keyset page returns the four most recent items'
);
select is(
  (
    select array_agg(entry_id order by occurred_at desc, entry_id desc) from public.list_needs_attention(
      4,
      (select occurred_at from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000005'),
      'a1111111-1111-4111-8111-000000000005'::uuid
    )
  ),
  array[
    'a1111111-1111-4111-8111-000000000006',
    'a1111111-1111-4111-8111-000000000007',
    'a1111111-1111-4111-8111-000000000010',
    'a1111111-1111-4111-8111-000000000011'
  ]::uuid[],
  'second keyset page continues immediately after the cursor with no gap or duplicate'
);
select is(
  (
    select array_agg(entry_id order by occurred_at desc, entry_id desc) from public.list_needs_attention(
      4,
      (select occurred_at from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000011'),
      'a1111111-1111-4111-8111-000000000011'::uuid
    )
  ),
  array[
    'a1111111-1111-4111-8111-000000000013',
    'a1111111-1111-4111-8111-000000000016',
    'a1111111-1111-4111-8111-000000000015'
  ]::uuid[],
  'final keyset page returns the remaining items, tie-break included, with no duplication across pages'
);

select is(
  (select current_interpretation_id from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000007'),
  'c7777777-7777-4777-8777-000000000007'::uuid,
  'the current interpretation id is surfaced for candidate confirmation binding'
);
select is(
  (select job_id from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000005'),
  'f5555555-5555-4555-8555-000000000005'::uuid,
  'the job id is surfaced for retry binding'
);
select is(
  (select open_question_id from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000010'),
  'e1010101-0101-4101-8101-000000000010'::uuid,
  'the open question id is surfaced for answer binding'
);
select results_eq(
  $$
    select current_interpretation_id is null and job_id is null and open_question_id is null
    from public.list_needs_attention(50, null, null)
    where entry_id = 'a1111111-1111-4111-8111-000000000001'
  $$,
  array[true],
  'an entry with no interpretation, job, or question leaves those keys null rather than inventing a value'
);

select is(
  (select count(*)::bigint from public.list_needs_attention(0, null, null)),
  1::bigint,
  'a non-positive limit is clamped to at least one row instead of returning everything or erroring'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is(
  (select array_agg(entry_id) from public.list_needs_attention(50, null, null)),
  array['b2222222-2222-4222-8222-000000000001']::uuid[],
  'the other owner sees only their own entry, never the first owner''s queue'
);

-- Regression for the migration-031 hotfix: a name collision between the
-- generate_series alias and tasks.candidate_index made confirming ONE of two
-- current candidates incorrectly remove the entry from the queue entirely.
-- This exercises the real confirm_entry_task_candidates RPC, not injected
-- booleans, so it would have failed against the original migration 030 body.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into public.entries (id, user_id, original_content, source, status, locale) values
  ('a1111111-1111-4111-8111-000000000017', '11111111-1111-4111-8111-111111111111', 'Partial-confirmation regression fixture', 'web', 'completed', 'en');

insert into public.entry_interpretations (
  id, user_id, entry_id, version, model, strategy_version, prompt_version, confidence, raw_output, summary, task_candidates, is_record_only
) values (
  'c7777777-7777-4777-8777-000000000017', '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-000000000017', 1, 'pgtap-test', 'v1', 'v1', 0.9, '{}'::jsonb, 'Partial-confirmation regression fixture', '[{"title":"Candidate zero"},{"title":"Candidate one"}]'::jsonb, false
);

update public.entries set current_interpretation_id = 'c7777777-7777-4777-8777-000000000017'
where id = 'a1111111-1111-4111-8111-000000000017';

select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000017'),
  'confirm_existing_candidates',
  'regression fixture starts with both candidates unconfirmed and needs attention'
);
select is(
  (public.confirm_entry_task_candidates(
    'a1111111-1111-4111-8111-000000000017',
    'c7777777-7777-4777-8777-000000000017',
    array[0],
    'pgtap:attention-regression:candidate-zero'
  ))->>'idempotent',
  'false',
  'confirming the first candidate creates its task'
);
select is(
  (select reason from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000017'),
  'confirm_existing_candidates',
  'confirming only one of two current candidates keeps the entry listed (migration 031 regression)'
);
select is(
  (public.confirm_entry_task_candidates(
    'a1111111-1111-4111-8111-000000000017',
    'c7777777-7777-4777-8777-000000000017',
    array[1],
    'pgtap:attention-regression:candidate-one'
  ))->>'idempotent',
  'false',
  'confirming the second candidate creates its task'
);
select ok(
  not exists (select 1 from public.list_needs_attention(50, null, null) where entry_id = 'a1111111-1111-4111-8111-000000000017'),
  'confirming every current candidate finally resolves the entry out of the queue'
);

select * from finish();
rollback;
