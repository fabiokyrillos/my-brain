begin;

select plan(25);

select has_column('public', 'jobs', 'locked_at', 'jobs records the lease start');
select has_column('public', 'jobs', 'locked_by', 'jobs records the worker identity');
select has_column('public', 'jobs', 'lease_expires_at', 'jobs records the lease expiry');
select has_column('public', 'jobs', 'failed_at', 'jobs records terminal failure time');

select results_eq(
  $$
    select pg_get_constraintdef(oid) like '%exhausted%'
    from pg_constraint
    where conrelid = 'public.jobs'::regclass and conname = 'jobs_status_check'
  $$,
  array[true],
  'jobs has an explicit exhausted terminal status'
);

select has_function('public', 'claim_attachment_job', array['uuid', 'uuid', 'text', 'integer']);
select has_function('public', 'complete_job', array['uuid', 'text', 'jsonb']);
select has_function('public', 'fail_job', array['uuid', 'text', 'text', 'integer']);
select has_function('public', 'reap_expired_jobs', array['integer']);
select has_function('public', 'get_job_queue_metrics', array[]::text[]);

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.claim_attachment_job(uuid,uuid,text,integer)'::regprocedure $$,
  array[true],
  'leased claim is security definer'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.complete_job(uuid,text,jsonb)'::regprocedure $$,
  array[true],
  'leased completion is security definer'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.fail_job(uuid,text,text,integer)'::regprocedure $$,
  array[true],
  'leased failure is security definer'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.reap_expired_jobs(integer)'::regprocedure $$,
  array[true],
  'reaper is security definer'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.get_job_queue_metrics()'::regprocedure $$,
  array[true],
  'queue metrics are security definer'
);

select results_eq(
  $$ select pg_get_functiondef('public.claim_attachment_job(uuid,uuid,text,integer)'::regprocedure) like '%set search_path = ''''%' $$,
  array[true],
  'leased claim has an explicit safe search path'
);
select results_eq(
  $$ select pg_get_functiondef('public.reap_expired_jobs(integer)'::regprocedure) like '%set search_path = ''''%' $$,
  array[true],
  'reaper has an explicit safe search path'
);
select has_index('public', 'jobs', 'jobs_eligible_idx', 'eligible jobs have a partial scheduling index');
select results_eq(
  $$ select count(*)::bigint from cron.job where jobname = 'my-brain-job-reaper' $$,
  array[1::bigint],
  'expired jobs have one scheduled reaper'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'jobs-owner@example.test',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.jobs (
  id, user_id, type, payload, max_attempts, idempotency_key
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'process_attachment',
  jsonb_build_object('attachment_id', '33333333-3333-4333-8333-333333333333'),
  2,
  'pgtap:leased-completion'
);

select is(
  (public.claim_attachment_job(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'pgtap-worker-a',
    120
  ))->>'status',
  'running',
  'an eligible job is claimed with a lease'
);
select is(
  public.claim_attachment_job(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'pgtap-worker-b',
    120
  ),
  null::jsonb,
  'a leased job cannot be claimed concurrently'
);
select is(
  public.complete_job(
    '22222222-2222-4222-8222-222222222222',
    'pgtap-worker-b',
    '{}'::jsonb
  ),
  null::jsonb,
  'a stale worker cannot complete another worker lease'
);
select is(
  (public.complete_job(
    '22222222-2222-4222-8222-222222222222',
    'pgtap-worker-a',
    jsonb_build_object('ok', true)
  ))->>'status',
  'completed',
  'the active worker can complete its leased job'
);

insert into public.jobs (
  id, user_id, type, payload, max_attempts, idempotency_key
) values (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'process_attachment',
  jsonb_build_object('attachment_id', '55555555-5555-4555-8555-555555555555'),
  1,
  'pgtap:expired-exhausted'
);

select is(
  (public.claim_attachment_job(
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'pgtap-worker-expired',
    120
  ))->>'status',
  'running',
  'an exhaustion fixture receives its first lease'
);

update public.jobs
set lease_expires_at = now() - interval '1 second'
where id = '44444444-4444-4444-8444-444444444444';

select is(
  (public.reap_expired_jobs(100))->>'exhausted',
  '1',
  'reaper reports an exhausted expired job'
);
select results_eq(
  $$
    select status, failed_at is not null, locked_at is null and locked_by is null and lease_expires_at is null
    from public.jobs
    where id = '44444444-4444-4444-8444-444444444444'
  $$,
  $$ values ('exhausted'::text, true, true) $$,
  'reaper makes attempt exhaustion terminal and clears the lease'
);

select * from finish();
rollback;
