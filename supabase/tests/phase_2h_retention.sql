-- Phase 2H slice 2H.5 -- retention, at the boundary.
--
-- 2H-RETENTION-001 (a sweep and a count-only twin per class, identical predicate),
-- 2H-RETENTION-002 (no migration schedules a destructive sweep),
-- 2H-RETENTION-004 (a declared window and an enforced one cannot diverge).
--
-- ---------------------------------------------------------------------------
-- WHAT THIS SUITE IS FOR, AND THE ONE THING IT REFUSES TO DO
-- ---------------------------------------------------------------------------
--
-- A retention count is easy to produce and almost impossible to check. "412
-- rows are prunable" is satisfied equally well by the right predicate and by
-- one off by a day, a timezone or an inclusive bound. So every assertion here
-- is a BOUNDARY assertion: a row one second inside the window must survive, and
-- a row one second outside must be prunable. Two rows, one second apart, and
-- the answer must differ.
--
-- It never executes a destructive sweep against anything but rows it created
-- itself, inside a transaction that is rolled back. `pg_cron` is not involved;
-- the whole point of the slice is that nothing schedules these.
--
-- THE FIXTURE-NAME RULE THIS SUITE INHERITS (handoff sec. 37): a fixture that
-- shares a key with a live writer will flake. `my-brain-job-reaper` really does
-- tick every minute inside the CI container, and 2H.2's suite failed roughly
-- one run in three until its ledger fixture stopped sharing that name. So the
-- scheduled-job rows below use `2h5-retention-control`, which no cron entry and
-- no writer will ever touch.
--
-- Written in pure ASCII, following the SH.0-SH.6 and 2H.1-2H.4 suites.

begin;
select plan(31);

set local timezone to 'UTC';

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e5000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   '2h5-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- Section 1 -- the windows are registered, at the signed value (5)
-- ---------------------------------------------------------------------------

select is(
  (select days from private.retention_windows where key = 'error_events'),
  90,
  '2H-SINK-004: the error sink window is PRD sec. 14.1 signed 90 days'
);

select is(
  (select days from private.retention_windows where key = 'scheduled_job_health'),
  90,
  '2H-DEADMAN-004: dead-man history is PRD sec. 14.1 signed 90 days'
);

select is(
  (select days from private.retention_windows where key = 'rate_limit_events'),
  90,
  '2H-RETENTION-001: rate_limit_events REUSES the signed 90 rather than minting a value'
);

-- The registry read is the only home. A sweep that could not read its window
-- must delete nothing, and SH.6 made that direction explicit; this proves the
-- inherited behaviour still holds for a key this phase did not add.
select throws_ok(
  $$ select private.retention_window('no_such_phase_2h_class') $$,
  'P0001',
  null,
  '2H-RETENTION-004: an unregistered window raises rather than defaulting'
);

-- The SH.6 rows are untouched. This slice extends the registry; it does not
-- edit a window a previous authorization signed.
select is(
  (select count(*)::int from private.retention_windows
   where key in ('jobs_terminal', 'notifications', 'product_events', 'heartbeat_runs',
                 'undo_operations_past_expiry', 'auth_event_attempts',
                 'credential_validation_attempts')),
  7,
  'SH-RETENTION-001: all seven inherited windows survive this migration'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- rate_limit_events: the exact boundary (7)
-- ---------------------------------------------------------------------------
--
-- Two rows one second apart across the cutoff. The class this phase added that
-- genuinely accumulates for a live user, so this is the boundary that matters
-- most.

insert into public.rate_limit_events (id, user_id, bucket, outcome, consumed_at) values
  ('a5000001-0000-4000-8000-000000000001', 'e5000001-0000-4000-8000-000000000001',
   'ai', 'admitted', now() - interval '90 days' + interval '1 second'),
  ('a5000001-0000-4000-8000-000000000002', 'e5000001-0000-4000-8000-000000000001',
   'ai', 'admitted', now() - interval '90 days' - interval '1 second'),
  ('a5000001-0000-4000-8000-000000000003', 'e5000001-0000-4000-8000-000000000001',
   'upload', 'refused', now() - interval '90 days' - interval '1 second'),
  ('a5000001-0000-4000-8000-000000000004', 'e5000001-0000-4000-8000-000000000001',
   'ai', 'admitted', now());

select is(
  (select count(*)::int from private.prunable_rate_limit_event_ids(null::integer) as p(id)
   where p.id = 'a5000001-0000-4000-8000-000000000001'),
  0,
  '2H-RETENTION-001: one second INSIDE the window survives'
);

select is(
  (select count(*)::int from private.prunable_rate_limit_event_ids(null::integer) as p(id)
   where p.id = 'a5000001-0000-4000-8000-000000000002'),
  1,
  '2H-RETENTION-001: one second OUTSIDE the window is prunable'
);

select is(
  (select count(*)::int from private.prunable_rate_limit_event_ids(null::integer) as p(id)
   where p.id = 'a5000001-0000-4000-8000-000000000004'),
  0,
  '2H-RETENTION-001: a row consumed now is never prunable'
);

-- Both outcomes are prunable. A refused row records a refusal that expired out
-- of every ceiling 90 days ago; retaining it longer than an admitted one would
-- keep MORE about a user who was told no.
select is(
  (select count(*)::int from private.prunable_rate_limit_event_ids(null::integer) as p(id)
   where p.id = 'a5000001-0000-4000-8000-000000000003'),
  1,
  '2H-RETENTION-001: a refused row outside the window is prunable too'
);

-- The identical-predicate requirement, proved rather than reviewed: the twin
-- counts exactly what the predicate returns. There is one function, so there is
-- one rule -- and this is what makes that structural claim checkable.
select is(
  public.count_prunable_rate_limit_events(),
  (select count(*) from private.prunable_rate_limit_event_ids(null::integer) as p(id)),
  '2H-RETENTION-001: the count-only twin and the predicate agree exactly'
);

select is(
  public.count_prunable_rate_limit_events(),
  2::bigint,
  '2H-RETENTION-003: the dry run counts the two out-of-window rows and no others'
);

-- The destructive half removes exactly what the twin counted, and stops there.
select is(
  public.prune_rate_limit_events(),
  2::bigint,
  '2H-RETENTION-001: the sweep removes exactly what the twin counted'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the sweep left the live rows alone (2)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'e5000001-0000-4000-8000-000000000001'),
  2,
  '2H-RETENTION-001: both in-window rows survived the sweep'
);

select is(
  public.count_prunable_rate_limit_events(),
  0::bigint,
  '2H-RETENTION-003: a second dry run counts nothing -- the sweep converged'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- error_events: the boundary, and the append-only exemption (5)
-- ---------------------------------------------------------------------------
--
-- `error_events` refuses DELETE for everyone by trigger EXCEPT the sweep, which
-- sets a narrow named session flag. So this section proves two things at once:
-- the window is right, and the exemption is genuinely narrow.

insert into public.error_events (id, occurred_at, surface, operation, reason, correlation_id, user_id) values
  ('b5000001-0000-4000-8000-000000000001', now() - interval '90 days' + interval '1 second',
   'server_action', 'other', 'unclassified', gen_random_uuid(), null),
  ('b5000001-0000-4000-8000-000000000002', now() - interval '90 days' - interval '1 second',
   'server_action', 'other', 'unclassified', gen_random_uuid(), null);

select is(
  (select count(*)::int from private.prunable_error_events(interval '90 days') as p(id)
   where p.id = 'b5000001-0000-4000-8000-000000000001'),
  0,
  '2H-SINK-004: one second inside the error-sink window survives'
);

select is(
  (select count(*)::int from private.prunable_error_events(interval '90 days') as p(id)
   where p.id = 'b5000001-0000-4000-8000-000000000002'),
  1,
  '2H-SINK-004: one second outside the error-sink window is prunable'
);

-- The zero-argument form reads the registry, so it must agree with the explicit
-- 90-day call. If it did not, the number a scheduled statement uses and the
-- number the tests exercise would be two different numbers.
select is(
  public.count_prunable_error_events(),
  public.count_prunable_error_events(interval '90 days'),
  '2H-RETENTION-001: the registry-reading twin equals the explicit 90-day twin'
);

-- The append-only refusal is still in force for everyone who is not the sweep.
select throws_ok(
  $$ delete from public.error_events where id = 'b5000001-0000-4000-8000-000000000002' $$,
  null,
  null,
  '2H-SINK-003: a direct DELETE on the sink is still refused'
);

select is(
  public.prune_error_events(),
  1::bigint,
  '2H-SINK-004: the registry-reading sweep removes the out-of-window row'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- scheduled_job_health: a LIVE job is never prunable (4)
-- ---------------------------------------------------------------------------
--
-- The predicate 2H.2 wrote requires the job to have LEFT the cron catalog,
-- whatever the row's age. Deleting a live job's row would reset the very
-- history the dead-man switch reads and turn a long-dead job into a
-- `never_reported` one -- losing the finding rather than the data.
--
-- `2h5-retention-control` shares its name with no cron entry and no writer.

insert into public.scheduled_job_health
  (job_name, last_success_at, last_useful_at, last_outcome, success_count, useful_count, updated_at)
values
  ('2h5-retention-control', now() - interval '400 days', now() - interval '400 days',
   'success_empty', 1, 1, now() - interval '400 days');

select is(
  (select count(*)::int from private.prunable_scheduled_job_health(interval '90 days') as p(job_name)
   where p.job_name = '2h5-retention-control'),
  1,
  '2H-DEADMAN-004: a health row for a job that has left the catalog is prunable'
);

-- The live control: a job that IS in the catalog, with a row far older than any
-- window. `my-brain-job-reaper` is asserted by NAME here and not by a fixture
-- this suite writes, precisely so the concurrent tick cannot move the answer --
-- catalog membership is not something a tick changes.
select is(
  (select count(*)::int from private.prunable_scheduled_job_health(interval '1 second') as p(job_name)
   where p.job_name in (select jobname from cron.job)),
  0,
  '2H-DEADMAN-004: no LIVE job is prunable at any age, even a one-second window'
);

select is(
  public.count_prunable_scheduled_job_health(),
  public.count_prunable_scheduled_job_health(interval '90 days'),
  '2H-RETENTION-001: the registry-reading twin equals the explicit 90-day twin'
);

select ok(
  public.prune_scheduled_job_health() >= 1,
  '2H-DEADMAN-004: the registry-reading sweep removes the catalog-less row'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- grants: no role can purge, every role can be refused (4)
-- ---------------------------------------------------------------------------
--
-- The asymmetry IS the mechanism. A dry run must be possible without the
-- ability to delete, so the twins are granted to `service_role` and the
-- destructive halves are granted to nobody -- `service_role` included. Only
-- `pg_cron`, running as the database owner, can execute one, which is why
-- enabling a schedule is the authorization of the first live purge.

select is(
  (select count(*)::int
   from unnest(array['service_role', 'authenticated', 'anon']) as role_name
   cross join unnest(array[
     'public.prune_error_events()',
     'public.prune_scheduled_job_health()',
     'public.prune_rate_limit_events()'
   ]) as signature
   where pg_catalog.has_function_privilege(role_name, signature, 'execute')),
  0,
  '2H-RETENTION-002: no role at all can execute a destructive sweep'
);

select is(
  (select count(*)::int
   from unnest(array[
     'public.count_prunable_error_events()',
     'public.count_prunable_scheduled_job_health()',
     'public.count_prunable_rate_limit_events()'
   ]) as signature
   where pg_catalog.has_function_privilege('service_role', signature, 'execute')),
  3,
  '2H-RETENTION-003: all three count-only twins are reachable by the operator'
);

select is(
  (select count(*)::int
   from unnest(array['authenticated', 'anon']) as role_name
   cross join unnest(array[
     'public.count_prunable_error_events()',
     'public.count_prunable_scheduled_job_health()',
     'public.count_prunable_rate_limit_events()'
   ]) as signature
   where pg_catalog.has_function_privilege(role_name, signature, 'execute')),
  0,
  '2H-RETENTION-003: no client role can read a prunable count'
);

-- The predicates themselves are private and reachable by nobody. A twin that
-- leaked its predicate would be a second, ungranted read of the same data.
select is(
  (select count(*)::int
   from unnest(array['service_role', 'authenticated', 'anon']) as role_name
   cross join unnest(array[
     'private.prunable_rate_limit_event_ids(integer)',
     'private.prunable_error_events(interval)',
     'private.prunable_scheduled_job_health(interval)'
   ]) as signature
   where pg_catalog.has_function_privilege(role_name, signature, 'execute')),
  0,
  '2H-RETENTION-001: the shared predicates are reachable by no role'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- nothing is scheduled, and the catalog says so (3)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from cron.job
   where command ~* '(prune_error_events|prune_scheduled_job_health|prune_rate_limit_events)'),
  0,
  '2H-RETENTION-002: no Phase 2H retention sweep is scheduled'
);

-- The two attempt-prune jobs that predate this phase are untouched. Asserting
-- their PRESENCE matters as much as asserting the absence above: a slice that
-- removed somebody else's authorized schedule would pass an absence-only check.
select is(
  (select count(*)::int from cron.job
   where jobname in ('byok-prune-validation-attempts', 'sh-prune-auth-event-attempts')),
  2,
  '2H-RETENTION-002: both previously authorized attempt-prune jobs survive'
);

-- SH.6's five user-content sweeps are still built and still unscheduled. This
-- slice must not have enabled one as a side effect of touching the registry.
select is(
  (select count(*)::int from cron.job
   where command ~* '(prune_terminal_jobs|prune_notifications|prune_product_events|prune_heartbeat_runs|prune_undo_operations)'),
  0,
  'ADR-082: SH.6 user-content sweeps remain unscheduled'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- the controls are subject to the mechanism (1)
-- ---------------------------------------------------------------------------
--
-- Sections 6 and 7 are satisfied equally well by a schema in which none of
-- these functions exists. An always-passing control published two wrong
-- verdicts in this repository once; every refusal census above therefore needs
-- a positive existence twin, and this is it.

select is(
  (select count(*)::int
   from unnest(array[
     'public.prune_error_events()',
     'public.prune_scheduled_job_health()',
     'public.prune_rate_limit_events()',
     'public.count_prunable_error_events()',
     'public.count_prunable_scheduled_job_health()',
     'public.count_prunable_rate_limit_events()'
   ]) as signature
   where pg_catalog.to_regprocedure(signature) is not null),
  6,
  '2H-RETENTION-004: all six halves exist, so the refusal censuses are not vacuous'
);

select * from finish();
rollback;
