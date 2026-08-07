-- Phase 2H slice 2H.2 -- the error sink and the cron dead-man switch, executed.
--
-- 2H-SINK-001 (bounded, append-only), 2H-SINK-002 (the shape, never the
-- payload), 2H-SINK-004 (bounded by an unscheduled sweep),
-- 2H-DEADMAN-001 (last successful RUN, not last successful tick),
-- 2H-DEADMAN-002 (staleness is a readable classification),
-- 2H-DEADMAN-003 (proven in BOTH directions by an executed control).
--
-- The sentinel discipline below is deliberate: sections 3 and 4 push
-- content-bearing and credential-shaped strings at the writer and then assert
-- they are nowhere in storage. Reviewing the writer and concluding it is
-- careful is what T-2H-07 and T-2H-08 say is not good enough.
--
-- Written in pure ASCII, following the SH.0-SH.6 and 2H.1 suites.

begin;
select plan(48);

set local timezone to 'UTC';

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e2000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   '2h2-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- ---------------------------------------------------------------------------
-- Section 1 -- the sink is unreachable outside its writer (7)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'error_events'),
  0,
  'error_events carries no policy at all -- forced RLS with none refuses every non-superuser read'
);

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class as class
   join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'public' and class.relname = 'error_events'),
  'error_events forces row level security'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.error_events', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.error_events', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.error_events', 'select'),
  'no role reads the sink directly -- not even service_role'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.error_events', 'insert')
  and not pg_catalog.has_table_privilege('authenticated', 'public.error_events', 'insert'),
  '2H-SINK-001: no role writes the sink directly either; the RPC is the only door'
);

select ok(
  pg_catalog.has_function_privilege('anon', 'public.record_error_event(text, text, text, uuid)', 'execute')
  and pg_catalog.has_function_privilege('authenticated', 'public.record_error_event(text, text, text, uuid)', 'execute'),
  'the writer IS reachable by anon and authenticated -- the failures worth recording happen before a session exists'
);

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class as class
   join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'public' and class.relname = 'scheduled_job_health'),
  'scheduled_job_health forces row level security'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.scheduled_job_health', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.scheduled_job_health', 'select'),
  'the health ledger is reachable only through its functions'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- there is nowhere to put a payload (3)
-- ---------------------------------------------------------------------------
--
-- 2H-SINK-002's strongest available form. Not "the writer is careful" but
-- "the schema has no column that could hold a message", read from the catalog
-- so a later ALTER TABLE fails here.

select is(
  (select count(*)::int
   from pg_catalog.pg_attribute as attribute
   join pg_catalog.pg_class as class on class.oid = attribute.attrelid
   join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'public' and class.relname = 'error_events'
     and attribute.attnum > 0 and not attribute.attisdropped
     and attribute.atttypid in ('text'::regtype, 'jsonb'::regtype, 'json'::regtype, 'bytea'::regtype)),
  3,
  '2H-SINK-002: the sink has exactly three text columns and no json or bytea column at all'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_attribute as attribute
   join pg_catalog.pg_class as class on class.oid = attribute.attrelid
   join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'public' and class.relname = 'error_events'
     and attribute.attnum > 0 and not attribute.attisdropped
     and attribute.atttypid in ('text'::regtype, 'jsonb'::regtype, 'json'::regtype, 'bytea'::regtype)
     and attribute.attname not in ('surface', 'operation', 'reason')),
  0,
  'and all three are the closed-vocabulary columns -- there is no message, detail, payload or context column'
);

select is(
  (select count(*)::int from pg_catalog.pg_constraint as c
   join pg_catalog.pg_class as class on class.oid = c.conrelid
   join pg_catalog.pg_namespace as ns on ns.oid = class.relnamespace
   where ns.nspname = 'public' and class.relname = 'error_events' and c.contype = 'c'),
  3,
  'each of the three carries its own closed-vocabulary CHECK'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- content-bearing and credential-shaped sentinels are refused (7)
-- ---------------------------------------------------------------------------
--
-- Executed, not reviewed. Each of these is a plausible thing a careless writer
-- would pass through: a provider message quoting the user's own words, a file
-- name, an API key, a session token, a stack trace.

select throws_ok(
  $$select public.record_error_event('server_action', 'capture_entry',
      'OpenAI said: could not process "reuniao com a Maria sobre o orcamento"',
      '11111111-0000-4000-8000-000000000001'::uuid)$$,
  '23514',
  null,
  'T-2H-07: a provider message quoting user content is refused by the CHECK, not stored'
);

select throws_ok(
  $$select public.record_error_event('server_action', 'file_upload',
      'fatura-marco.pdf', '11111111-0000-4000-8000-000000000002'::uuid)$$,
  '23514',
  null,
  'T-2H-07: a file name is refused'
);

select throws_ok(
  $$select public.record_error_event('worker', 'interpret_entry',
      'sk-proj-AAAABBBBCCCCDDDDEEEEFFFF', '11111111-0000-4000-8000-000000000003'::uuid)$$,
  '23514',
  null,
  'T-2H-08: a credential-shaped string is refused'
);

select throws_ok(
  $$select public.record_error_event('route_handler', 'chat_answer',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.session', '11111111-0000-4000-8000-000000000004'::uuid)$$,
  '23514',
  null,
  'T-2H-09: a session-token-shaped string is refused'
);

-- The surface and operation columns are closed too, so the sentinel cannot be
-- smuggled in through a different field.
select throws_ok(
  $$select public.record_error_event('reuniao com a Maria', 'capture_entry',
      'provider_error', '11111111-0000-4000-8000-000000000005'::uuid)$$,
  '23514',
  null,
  'user content cannot be smuggled through the surface column either'
);

select throws_ok(
  $$select public.record_error_event('server_action', '/home/runner/secrets/.env',
      'provider_error', '11111111-0000-4000-8000-000000000006'::uuid)$$,
  '23514',
  null,
  'nor through the operation column'
);

-- THE CALIBRATION. Without it the six refusals above are satisfied by a writer
-- that refuses everything, which would be a sink that records nothing.
select lives_ok(
  $$select public.record_error_event('server_action', 'capture_entry', 'provider_error',
      '11111111-0000-4000-8000-00000000000a'::uuid)$$,
  'CALIBRATION: a fully declared failure IS recorded -- the refusals above are the vocabulary, not a broken writer'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- nothing sentinel-shaped reached storage (2)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.error_events
   where surface || ' ' || operation || ' ' || reason ilike any (array[
     '%Maria%', '%fatura%', '%sk-proj%', '%eyJhbG%', '%secrets%', '%orcamento%'
   ])),
  0,
  '2H-SINK-002: no sentinel from section 3 appears anywhere in the sink'
);

select is(
  (select count(*)::int from public.error_events),
  1,
  'exactly the one calibration row exists -- six refusals wrote nothing'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- the owner is auth.uid(), never a caller-supplied parameter (3)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   cross join lateral unnest(proc.proargnames) as arg(name)
   where ns.nspname = 'public' and proc.proname = 'record_error_event'
     and arg.name ilike '%user%'),
  0,
  'T-2H-01 shape: the writer takes no owner parameter, so no caller can attribute a failure to another account'
);

select is(
  (select user_id from public.error_events limit 1),
  null,
  'a call with no session records a null owner rather than inventing one'
);

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"e2000001-0000-4000-8000-000000000001"}', true);

select public.record_error_event('server_action', 'chat_answer', 'provider_timeout',
  '11111111-0000-4000-8000-00000000000b'::uuid);

select is(
  (select user_id from public.error_events
   where correlation_id = '11111111-0000-4000-8000-00000000000b'::uuid),
  'e2000001-0000-4000-8000-000000000001'::uuid,
  'a call inside a session records that session''s owner, taken from auth.uid()'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- Section 6 -- append-only, enforced by a trigger and not only by a grant (3)
-- ---------------------------------------------------------------------------
--
-- The grant is the first lock. The trigger is the second, and it exists because
-- a grant is exactly the kind of thing a future migration or a returning
-- platform default can quietly restore.

select throws_ok(
  $$update public.error_events set reason = 'timeout' where reason = 'provider_error'$$,
  'P0001',
  'error_events is append-only',
  '2H-SINK-001: the sink refuses UPDATE even to the table owner'
);

select throws_ok(
  $$delete from public.error_events where reason = 'provider_error'$$,
  'P0001',
  'error_events rows are removed only by its retention sweep',
  'and refuses DELETE outside its sweep'
);

select is(
  (select count(*)::int from public.error_events),
  2,
  'both refusals left the sink exactly as it was'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- retention: built, bounded, executable by nobody, unscheduled (7)
-- ---------------------------------------------------------------------------

select ok(
  not pg_catalog.has_function_privilege('service_role', 'public.prune_error_events(interval, integer)', 'execute')
  and not pg_catalog.has_function_privilege('authenticated', 'public.prune_error_events(interval, integer)', 'execute'),
  '2H-SINK-004: the sweep is executable by NO role, service_role included'
);

select ok(
  pg_catalog.has_function_privilege('service_role', 'public.count_prunable_error_events(interval)', 'execute')
  and not pg_catalog.has_function_privilege('authenticated', 'public.count_prunable_error_events(interval)', 'execute'),
  'the count-only twin is service_role-only, so a dry run is possible and a purge is not'
);

select is(
  public.count_prunable_error_events(interval '90 days'),
  0::bigint,
  'nothing in the sink is older than the declared 90-day window yet'
);

-- The boundary rows are INSERTED at their timestamps rather than backdated by
-- UPDATE, and that is not a workaround -- it is section 6's guarantee holding
-- against its own test suite. The append-only trigger refuses an UPDATE from
-- the table owner too, so a test that needed to backdate a row would have been
-- a test asking for the property to be weakened. Superuser INSERT is available
-- to a fixture and to nobody the product exposes.
insert into public.error_events (surface, operation, reason, correlation_id, occurred_at)
values ('worker', 'job_drain', 'timeout',
        '22222222-0000-4000-8000-000000000001'::uuid, now() - interval '90 days');

select is(
  public.count_prunable_error_events(interval '90 days'),
  0::bigint,
  '2H-SINK-004: a row at EXACTLY the window is retained -- the predicate is strictly older-than'
);

insert into public.error_events (surface, operation, reason, correlation_id, occurred_at)
values ('worker', 'job_drain', 'timeout',
        '22222222-0000-4000-8000-000000000002'::uuid,
        now() - interval '90 days' - interval '1 second');

select is(
  public.count_prunable_error_events(interval '90 days'),
  1::bigint,
  'and one second past it is prunable -- the boundary is exact in both directions'
);

select is(
  (select count(*)::int from public.error_events),
  4,
  'counting is not deleting: the dry run removed nothing'
);

select is(
  (select count(*)::int from cron.job
   where jobname in ('my-brain-prune-error-events', 'my-brain-prune-scheduled-job-health')),
  0,
  'ADR-082: this migration scheduled no sweep'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- the health ledger records RUNS, not ticks (6)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.record_scheduled_job_run('my-brain-job-reaper', true)$$,
  'the reporter accepts a service_role caller'
);

select is(
  (select last_outcome from public.scheduled_job_health where job_name = 'my-brain-job-reaper'),
  'success_work',
  '2H-DEADMAN-001: a run that did work is recorded as work'
);

select lives_ok(
  $$select public.record_scheduled_job_run('my-brain-job-reaper', false)$$,
  'an empty run is also a successful run'
);

select is(
  (select last_outcome || ':' || consecutive_empty::text
   from public.scheduled_job_health where job_name = 'my-brain-job-reaper'),
  'success_empty:1',
  'and it is recorded as EMPTY, with the empty streak counted'
);

-- The census's exact finding, made unmissable: 29 042 successful ticks against
-- four rows of work. Both numbers survive here, separately.
select is(
  (select success_count::text || '/' || useful_count::text
   from public.scheduled_job_health where job_name = 'my-brain-job-reaper'),
  '2/1',
  '2H-DEADMAN-001: successes and useful runs are counted SEPARATELY -- a tick that achieved nothing cannot masquerade as work'
);

select ok(
  (select last_useful_at < last_success_at
   from public.scheduled_job_health where job_name = 'my-brain-job-reaper'),
  'the last useful run stays where it was while the last success moves forward'
);

-- ---------------------------------------------------------------------------
-- Section 9 -- the dead-man switch, in BOTH directions (2H-DEADMAN-003) (7)
-- ---------------------------------------------------------------------------
--
-- A control that agrees with its positive has measured nothing. The same job,
-- the same threshold, the same function -- only the timestamp differs.

select is(
  (select liveness from public.scheduled_job_liveness(3)
   where job_name = 'my-brain-job-reaper'),
  'current',
  '2H-DEADMAN-003 (direction 1): a job that reported a moment ago reads CURRENT'
);

update public.scheduled_job_health
set last_success_at = now() - interval '10 minutes'
where job_name = 'my-brain-job-reaper';

select is(
  (select liveness from public.scheduled_job_liveness(3)
   where job_name = 'my-brain-job-reaper'),
  'stale',
  '2H-DEADMAN-003 (direction 2): backdated past 3x its own 1-minute interval, the SAME job reads STALE'
);

-- And the threshold is the job's own interval, not a global constant: the same
-- backdated row is current again under a multiple that covers it.
select is(
  (select liveness from public.scheduled_job_liveness(30)
   where job_name = 'my-brain-job-reaper'),
  'current',
  '2H-DEADMAN-002: the multiple is a required argument and it actually decides -- 30x covers ten minutes'
);

select is(
  (select liveness from public.scheduled_job_liveness(3)
   where job_name = 'my-brain-hourly-heartbeat'),
  'never_reported',
  'a job in the catalog that has never reported is NEVER_REPORTED -- not healthy, which is the state a silently broken job is in'
);

select is(
  (select expected_interval from public.scheduled_job_liveness(3)
   where job_name = 'my-brain-hourly-heartbeat'),
  interval '1 hour',
  'the interval is derived from the schedule string, so the threshold is per-job'
);

-- T-2H-14: enumerated from the catalog at run time. A job scheduled now appears
-- now, with no change to any function.
select cron.schedule('my-brain-2h2-probe-job', '*/7 * * * *', 'select 1');

select is(
  (select liveness from public.scheduled_job_liveness(3)
   where job_name = 'my-brain-2h2-probe-job'),
  'never_reported',
  'T-2H-14: a job added to the catalog appears in the switch immediately, classified never_reported'
);

select is(
  (select expected_interval from public.scheduled_job_liveness(3)
   where job_name = 'my-brain-2h2-probe-job'),
  interval '7 minutes',
  'and its interval is parsed from its own schedule'
);

select cron.unschedule('my-brain-2h2-probe-job');

-- ---------------------------------------------------------------------------
-- Section 10 -- the liveness read is service_role-only and says nothing (3)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select * from public.scheduled_job_liveness(0)$$,
  '22023',
  'Staleness multiple must be between 1 and 100',
  'the multiple is validated rather than defaulted'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   cross join lateral unnest(proc.proargnames) as arg(name)
   where ns.nspname = 'public' and proc.proname = 'scheduled_job_liveness'
     and (arg.name ilike '%hash%' or arg.name ilike '%session%' or arg.name ilike '%secret%'
          or arg.name ilike '%token%' or arg.name ilike '%credential%' or arg.name ilike '%content%')),
  0,
  '2H-OPS-004 shape: the liveness read declares no session, secret or content column'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname in ('scheduled_job_liveness', 'record_scheduled_job_run', 'record_error_event')
     and proc.prosrc ilike '%delete from%'),
  0,
  'none of the 2H.2 read or write functions contains a DELETE'
);

select * from finish();
rollback;
