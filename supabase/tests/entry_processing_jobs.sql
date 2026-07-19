begin;

select plan(46);

select has_function('public', 'capture_entry_async', array['text', 'text', 'text', 'text']);
select has_function('public', 'enqueue_entry_reprocessing', array['uuid', 'text']);
select has_function('public', 'claim_entry_interpretation_job', array['uuid', 'uuid', 'text', 'integer']);
select has_function('public', 'claim_next_entry_interpretation_job', array['text', 'integer']);
select has_index('public', 'jobs', 'jobs_interpret_entry_entry_idx', 'entry jobs have a bounded entry lookup index');

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.capture_entry_async(text,text,text,text)'::regprocedure $$,
  array[true],
  'atomic capture is security definer'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.enqueue_entry_reprocessing(uuid,text)'::regprocedure $$,
  array[true],
  'reprocessing enqueue is security definer'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.claim_entry_interpretation_job(uuid,uuid,text,integer)'::regprocedure $$,
  array[true],
  'entry claim is security definer'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.claim_next_entry_interpretation_job(text,integer)'::regprocedure $$,
  array[true],
  'next entry claim is security definer'
);
select results_eq(
  $$ select pg_get_functiondef('public.capture_entry_async(text,text,text,text)'::regprocedure) like '%set search_path = ''''%' $$,
  array[true],
  'atomic capture has a safe search path'
);
select results_eq(
  $$ select pg_get_functiondef('public.claim_next_entry_interpretation_job(text,integer)'::regprocedure) like '%for update skip locked%' $$,
  array[true],
  'next entry claim uses skip locked'
);
select ok(
  has_function_privilege('authenticated', 'public.capture_entry_async(text,text,text,text)', 'execute'),
  'authenticated users can enqueue their own capture'
);
select ok(
  has_function_privilege('authenticated', 'public.enqueue_entry_reprocessing(uuid,text)', 'execute'),
  'authenticated users can enqueue their own reprocessing'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_entry_interpretation_job(uuid,uuid,text,integer)', 'execute'),
  'authenticated users cannot claim entry jobs'
);
select ok(
  has_function_privilege('service_role', 'public.claim_entry_interpretation_job(uuid,uuid,text,integer)', 'execute'),
  'service role can claim entry jobs'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'entry-jobs-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'entry-jobs-other@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (public.capture_entry_async(
    'Atomic capture fixture', 'en', 'web', 'pgtap:entry-capture:initial'
  ))->>'status',
  'saved',
  'atomic capture persists an entry before worker processing'
);
select results_eq(
  $$
    select type, status
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
  $$,
  $$ values ('interpret_entry'::text, 'pending'::text) $$,
  'atomic capture inserts one pending entry interpretation job'
);
select results_eq(
  $$
    select payload
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
  $$,
  $$
    select jsonb_build_object(
      'entry_id', entry_id,
      'mode', 'initial'
    )
    from (
      select payload ->> 'entry_id' as entry_id
      from public.jobs
      where user_id = '11111111-1111-4111-8111-111111111111'
        and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
    ) payload_fixture
  $$,
  'initial job payload has only the entry identifier and mode'
);
select ok(
  not exists (
    select 1
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
      and payload::text like '%Atomic capture fixture%'
  ),
  'initial job payload does not contain original content'
);
select is(
  (public.capture_entry_async(
    'Atomic capture fixture', 'en', 'web', 'pgtap:entry-capture:initial'
  ))->>'replayed',
  'true',
  'capture replay is explicit'
);
select is(
  (
    select count(*)::integer
    from public.entries
    where user_id = '11111111-1111-4111-8111-111111111111'
      and original_content = 'Atomic capture fixture'
  ),
  1,
  'capture replay does not duplicate the entry'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
  ),
  1,
  'capture replay does not duplicate the job'
);

create function public.pgtap_reject_entry_job_insert()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'interpret_entry' then
    raise exception 'pgtap rejected entry job' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger pgtap_reject_entry_job_insert
before insert on public.jobs
for each row execute function public.pgtap_reject_entry_job_insert();

select throws_ok(
  $$ select public.capture_entry_async('Rollback job fixture', 'en', 'web', 'pgtap:entry-capture:rollback-job') $$,
  'P0001',
  'pgtap rejected entry job',
  'job insertion failure aborts atomic capture'
);
select is(
  (
    select count(*)::integer
    from public.entries
    where user_id = '11111111-1111-4111-8111-111111111111'
      and original_content = 'Rollback job fixture'
  ),
  0,
  'job insertion failure rolls back the entry'
);
drop trigger pgtap_reject_entry_job_insert on public.jobs;
drop function public.pgtap_reject_entry_job_insert();

select throws_ok(
  $$ select public.capture_entry_async(' ', 'en', 'web', 'pgtap:entry-capture:invalid-entry') $$,
  '22023',
  'Invalid entry content',
  'invalid entry input is rejected before persistence'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-capture:pgtap:entry-capture:invalid-entry'
  ),
  0,
  'entry validation failure leaves no job'
);
select throws_ok(
  $$ select public.capture_entry_async('Locale validation fixture', null, 'web', 'pgtap:entry-capture:invalid-locale') $$,
  '22023',
  'Invalid entry locale',
  'null entry locale is rejected before persistence'
);

insert into public.entries (
  id, user_id, original_content, source, status, locale
) values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'Reprocessing fixture', 'web', 'completed', 'en'
);

select is(
  (public.enqueue_entry_reprocessing(
    '33333333-3333-4333-8333-333333333333', 'pgtap:entry-reprocess:one'
  ))->>'replayed',
  'false',
  'reprocessing enqueue creates its first job'
);
select results_eq(
  $$
    select type, payload
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-reprocess:33333333-3333-4333-8333-333333333333:pgtap:entry-reprocess:one'
  $$,
  $$ values ('interpret_entry'::text, jsonb_build_object(
    'entry_id', '33333333-3333-4333-8333-333333333333',
    'mode', 'reprocess',
    'operation_key', 'pgtap:entry-reprocess:one'
  )) $$,
  'reprocessing job has the bounded payload contract'
);
select is(
  (public.enqueue_entry_reprocessing(
    '33333333-3333-4333-8333-333333333333', 'pgtap:entry-reprocess:one'
  ))->>'replayed',
  'true',
  'reprocessing enqueue is idempotent'
);
select results_eq(
  $$
    select status, current_interpretation_id is null
    from public.entries
    where id = '33333333-3333-4333-8333-333333333333'
  $$,
  $$ values ('completed'::text, true) $$,
  'reprocessing enqueue preserves the current entry interpretation state'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select throws_ok(
  $$ select public.enqueue_entry_reprocessing('33333333-3333-4333-8333-333333333333', 'pgtap:entry-reprocess:cross-user') $$,
  'P0002',
  'Entry not found',
  'cross-user reprocessing is denied without leaking ownership'
);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select throws_ok(
  $$
    insert into public.jobs (user_id, type, payload, idempotency_key)
    values (
      '11111111-1111-4111-8111-111111111111',
      'interpret_entry',
      jsonb_build_object('entry_id', '33333333-3333-4333-8333-333333333333', 'mode', 'initial', 'original_content', 'forbidden'),
      'pgtap:invalid-entry-payload'
    )
  $$,
  '23514',
  null,
  'interpret entry payload rejects original content and unknown keys'
);

insert into public.jobs (id, user_id, type, payload, idempotency_key)
values (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'process_attachment', jsonb_build_object('attachment_id', '55555555-5555-4555-8555-555555555555'),
  'pgtap:attachment-compatibility'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.claim_entry_interpretation_job(
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'pgtap-entry-worker-wrong-type', 120
  ),
  null::jsonb,
  'entry claim rejects attachment jobs by type'
);
select is(
  (public.claim_entry_interpretation_job(
    (
      select id from public.jobs
      where user_id = '11111111-1111-4111-8111-111111111111'
        and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
    ),
    '11111111-1111-4111-8111-111111111111',
    'pgtap-entry-worker-a', 120
  ))->>'status',
  'running',
  'entry claim leases an eligible entry job by identifier'
);
select is(
  (
    select attempts
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
  ),
  1,
  'entry claim increments attempts'
);
select ok(
  exists (
    select 1
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
      and locked_by = 'pgtap-entry-worker-a'
      and lease_expires_at > now()
  ),
  'entry claim persists a bounded lease'
);
select is(
  public.claim_entry_interpretation_job(
    (
      select id from public.jobs
      where user_id = '11111111-1111-4111-8111-111111111111'
        and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
    ),
    '11111111-1111-4111-8111-111111111111',
    'pgtap-entry-worker-b', 120
  ),
  null::jsonb,
  'concurrent entry claim is denied'
);
select is(
  public.complete_job(
    (
      select id from public.jobs
      where user_id = '11111111-1111-4111-8111-111111111111'
        and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
    ),
    'pgtap-entry-worker-b', '{}'::jsonb
  ),
  null::jsonb,
  'stale entry worker cannot complete another lease'
);
select is(
  (public.fail_job(
    (
      select id from public.jobs
      where user_id = '11111111-1111-4111-8111-111111111111'
        and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
    ),
    'pgtap-entry-worker-a', 'safe retry fixture', 60
  ))->>'status',
  'failed',
  'entry job failure remains retryable before exhaustion'
);
select ok(
  exists (
    select 1
    from public.jobs
    where user_id = '11111111-1111-4111-8111-111111111111'
      and idempotency_key = 'entry-capture:pgtap:entry-capture:initial'
      and next_attempt_at > now()
  ),
  'entry retry receives a future attempt window'
);
select is(
  public.claim_next_entry_interpretation_job('pgtap-entry-worker-next', 120),
  null::jsonb,
  'next claim ignores jobs with a future retry time'
);
update public.jobs
set next_attempt_at = now() - interval '1 second'
where user_id = '11111111-1111-4111-8111-111111111111'
  and idempotency_key = 'entry-capture:pgtap:entry-capture:initial';
select is(
  (public.claim_next_entry_interpretation_job('pgtap-entry-worker-next', 120))->>'status',
  'running',
  'next claim selects the next eligible entry job'
);
update public.jobs
set lease_expires_at = now() - interval '1 second'
where user_id = '11111111-1111-4111-8111-111111111111'
  and idempotency_key = 'entry-capture:pgtap:entry-capture:initial';
select is(
  (public.reap_expired_jobs(100))->>'requeued',
  '1',
  'expired entry lease is requeued by the existing reaper'
);
select is(
  (public.claim_next_entry_interpretation_job('pgtap-entry-worker-after-reap', 120))->>'status',
  'running',
  'entry job can be claimed after expired lease recovery'
);
select is(
  (public.claim_attachment_job(
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'pgtap-attachment-worker', 120
  ))->>'status',
  'running',
  'attachment claim remains compatible with existing jobs'
);

select * from finish();
rollback;
