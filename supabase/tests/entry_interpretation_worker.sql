begin;

select plan(25);

-- Extension and scheduled dispatch infrastructure.
select ok(
  exists (select 1 from pg_extension where extname = 'pg_net'),
  'pg_net is enabled for scheduled dispatch'
);
select ok(
  exists (select 1 from cron.job where jobname = 'my-brain-entry-dispatch'),
  'the entry-dispatch cron job is scheduled'
);
select is(
  (select schedule from cron.job where jobname = 'my-brain-entry-dispatch'),
  '* * * * *',
  'the entry-dispatch cron job runs every minute'
);

-- Signature and privilege surface: exactly one overload per function, plus service_role access.
select has_function('public', 'begin_entry_interpretation', array['uuid', 'uuid']);
select has_function('public', 'fail_entry_interpretation', array['uuid', 'text', 'boolean', 'uuid']);
select has_function('public', 'persist_entry_interpretation', array['uuid', 'jsonb', 'text', 'text', 'text', 'int4', 'int4', 'uuid']);
select has_function('public', 'begin_entry_reprocessing', array['uuid', 'text', 'int4', 'uuid']);
select has_function('public', 'persist_reprocessed_entry_interpretation', array['uuid', 'text', 'jsonb', 'text', 'text', 'text', 'int4', 'int4', 'jsonb', 'uuid']);
select has_function('public', 'fail_entry_reprocessing', array['uuid', 'text', 'text', 'uuid']);
select hasnt_function(
  'public',
  'begin_entry_interpretation',
  array['uuid'],
  'the original single-argument overload no longer exists'
);
select ok(
  has_function_privilege('service_role', 'public.begin_entry_interpretation(uuid,uuid)', 'execute'),
  'service role can begin interpretation on behalf of an owner'
);
select ok(
  has_function_privilege('service_role', 'public.persist_entry_interpretation(uuid,jsonb,text,text,text,integer,integer,uuid)', 'execute'),
  'service role can persist an initial interpretation on behalf of an owner'
);
select ok(
  has_function_privilege('service_role', 'public.begin_entry_reprocessing(uuid,text,integer,uuid)', 'execute'),
  'service role can begin reprocessing on behalf of an owner'
);
select ok(
  has_function_privilege('service_role', 'public.persist_reprocessed_entry_interpretation(uuid,text,jsonb,text,text,text,integer,integer,jsonb,uuid)', 'execute'),
  'service role can persist a reprocessed interpretation on behalf of an owner'
);
select ok(
  has_function_privilege('service_role', 'public.fail_entry_reprocessing(uuid,text,text,uuid)', 'execute'),
  'service role can fail reprocessing on behalf of an owner'
);
select ok(
  has_function_privilege('authenticated', 'public.begin_entry_interpretation(uuid,uuid)', 'execute'),
  'authenticated users keep their existing execute privilege'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '66666666-6666-4666-8666-666666666666',
  'authenticated', 'authenticated', 'entry-worker-owner@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.entries (
  id, user_id, original_content, source, status, locale
) values (
  '77777777-7777-4777-8777-777777777777',
  '66666666-6666-4666-8666-666666666666',
  'Worker fixture entry', 'web', 'saved', 'en'
);

-- Authenticated callers cannot impersonate another user via p_service_user_id.
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$ select public.begin_entry_interpretation('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666') $$,
  '42501',
  'Service role required',
  'an authenticated caller cannot pass a service user id'
);

-- A service-role caller without an explicit service user id has no session to attach to.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$ select public.begin_entry_interpretation('77777777-7777-4777-8777-777777777777') $$,
  '42501',
  'Authentication required',
  'service role without an explicit owner cannot begin interpretation'
);

-- Full service-role initial pipeline: begin, persist, and independently fail.
select is(
  (public.begin_entry_interpretation(
    '77777777-7777-4777-8777-777777777777',
    '66666666-6666-4666-8666-666666666666'
  ))->>'status',
  'interpreting',
  'service role begins interpretation on behalf of the owner'
);
select ok(
  (public.persist_entry_interpretation(
    '77777777-7777-4777-8777-777777777777',
    jsonb_build_object(
      'summary', 'Worker fixture summary',
      'occurredAt', now(),
      'isRetroactive', false,
      'confidence', 0.8,
      'concepts', jsonb_build_array('raw_record'),
      'contexts', '[]'::jsonb,
      'organizations', '[]'::jsonb,
      'projects', '[]'::jsonb,
      'people', '[]'::jsonb,
      'taskCandidates', '[]'::jsonb,
      'pendingQuestions', '[]'::jsonb
    ),
    'gpt-5.6-luna', 'entry-extraction-v1', 'pgtap-worker', 10, 10,
    '66666666-6666-4666-8666-666666666666'
  )) is not null,
  'service role persists an initial interpretation on behalf of the owner'
);
select is(
  (select status from public.entries where id = '77777777-7777-4777-8777-777777777777'),
  'awaiting_review',
  'the owned entry reflects the service-persisted interpretation'
);

insert into public.entries (
  id, user_id, original_content, source, status, locale
) values (
  '88888888-8888-4888-8888-888888888888',
  '66666666-6666-4666-8666-666666666666',
  'Worker reprocess fixture entry', 'web', 'completed', 'en'
);
select is(
  (public.begin_entry_reprocessing(
    '88888888-8888-4888-8888-888888888888', 'pgtap:worker-reprocess', 180,
    '66666666-6666-4666-8666-666666666666'
  ))->>'status',
  'reprocessing',
  'service role begins reprocessing on behalf of the owner'
);
select is(
  (public.persist_reprocessed_entry_interpretation(
    '88888888-8888-4888-8888-888888888888', 'pgtap:worker-reprocess',
    jsonb_build_object(
      'summary', 'Worker reprocess fixture summary',
      'occurredAt', now(),
      'isRetroactive', false,
      'confidence', 0.8,
      'concepts', jsonb_build_array('raw_record'),
      'contexts', '[]'::jsonb,
      'organizations', '[]'::jsonb,
      'projects', '[]'::jsonb,
      'people', '[]'::jsonb,
      'taskCandidates', '[]'::jsonb,
      'pendingQuestions', '[]'::jsonb
    ),
    'gpt-5.6-luna', 'entry-extraction-v1', 'pgtap-worker', 10, 10,
    public.model_only_element_trust(0.8),
    '66666666-6666-4666-8666-666666666666'
  ))->>'origin',
  'ai_reprocessed',
  'service role persists a reprocessed interpretation on behalf of the owner'
);

insert into public.entries (
  id, user_id, original_content, source, status, locale
) values (
  '99999999-9999-4999-8999-999999999999',
  '66666666-6666-4666-8666-666666666666',
  'Worker failure fixture entry', 'web', 'saved', 'en'
);
select is(
  (public.begin_entry_interpretation(
    '99999999-9999-4999-8999-999999999999',
    '66666666-6666-4666-8666-666666666666'
  ))->>'status',
  'interpreting',
  'service role begins interpretation before a failure fixture'
);
select is(
  (public.fail_entry_interpretation(
    '99999999-9999-4999-8999-999999999999', 'provider timed out', false,
    '66666666-6666-4666-8666-666666666666'
  ))->>'status',
  'recoverable_error',
  'service role can fail interpretation on behalf of the owner'
);

select * from finish();
rollback;
