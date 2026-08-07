-- ---------------------------------------------------------------------------
-- Post-2H rollout hardening -- the fresh-database retention posture.
--
-- WHY THIS FILE IS THE PROOF AND A HOSTED READBACK IS NOT.
--
-- The defect `202608070084` corrects is a property of **the migration chain**,
-- not of the hosted project. Hosted has been safe since 2026-08-05, when an
-- operator act removed the five user-content sweeps `202608050077` had
-- scheduled (ADR-082). What was never safe was every OTHER database: CI's
-- `supabase db reset`, a disposable project restored for the RG-DEP-3 drill,
-- any new environment. Each of those replays the chain, and until
-- `202608070084` the replay ended with five sweeps armed to begin deleting user
-- content at 04:11 UTC the next morning.
--
-- So a check that reads the hosted catalog proves nothing about the defect. The
-- CI `database` job runs `supabase db reset` -- **the whole chain applied from
-- an empty database** -- and then runs this suite against the result. That is
-- the reconstructed database the correction is about, and this file is the only
-- place the claim is testable.
--
-- `supabase/tests/phase_2h_retention.sql` section 7 deliberately did NOT assert
-- this, and its comment says why: at the time, the five WERE scheduled in a
-- chain-built database and were not on hosted, so an assertion either way would
-- have been true of an environment rather than of the product. `202608070084`
-- removes that divergence, which is what makes the assertion meaningful here.
-- ---------------------------------------------------------------------------

begin;

select plan(14);

-- ---------------------------------------------------------------------------
-- Section 0 -- non-vacuity. Every absence assertion below is satisfied for
-- free by a database with no pg_cron, an empty catalog, or no sweep functions.
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron'),
  'non-vacuity: pg_cron is installed, so an empty cron.job would be a finding rather than a default'
);

select cmp_ok(
  (select count(*)::int from cron.job),
  '>=',
  2,
  'non-vacuity: the chain built a real cron catalog, so "the five are absent" is a fact about it'
);

select cmp_ok(
  (select count(*)::int from cron.job where command ~* 'prune_'),
  '>=',
  2,
  'non-vacuity: the command detector matches real prune jobs, so its zeros below are meaningful'
);

-- The functions still EXIST. `202608070084` unschedules; it does not drop, and
-- an absence-of-schedule check would otherwise be satisfiable by deleting the
-- capability -- which would be a different, larger and unauthorized change.
select is(
  (select count(*)::int
   from unnest(array[
     'public.prune_terminal_jobs()',
     'public.prune_notifications()',
     'public.prune_product_events()',
     'public.prune_heartbeat_runs()',
     'public.prune_undo_operations()'
   ]) as signature
   where to_regprocedure(signature) is not null),
  5,
  'non-vacuity: all five user-content sweeps are still BUILT -- unscheduled, not deleted'
);

-- ---------------------------------------------------------------------------
-- Section 1 -- the five are absent from a database built from the chain (2)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from cron.job
   where jobname = any (array[
     'sh-prune-terminal-jobs',
     'sh-prune-notifications',
     'sh-prune-product-events',
     'sh-prune-heartbeat-runs',
     'sh-prune-undo-operations'
   ])),
  0,
  'POST-2H-RETENTION-001: none of 202608050077''s five user-content sweeps is scheduled, by name'
);

-- Stated over the COMMAND as well as the name, so a sweep re-scheduled under an
-- alias is caught. The 2H suite established the reason: the BYOK prune's job
-- NAME differs between a chain-built database and hosted, so a name is an
-- artifact of which environment wrote the catalog; the command is what the
-- authorization was about.
select is(
  (select count(*)::int from cron.job
   where command ~* '(prune_terminal_jobs|prune_notifications|prune_product_events|prune_heartbeat_runs|prune_undo_operations)'),
  0,
  'POST-2H-RETENTION-001: no user-content sweep is scheduled under ANY name'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- all eight built destructive mechanisms stay unscheduled (1)
--
-- Five from SH.6 above, three from Phase 2H. The 2H suite asserts its own
-- three; asserting all eight together here is the posture the rollout gate and
-- the restore drill both read, and it is the statement a restored disposable
-- project must satisfy before anyone trusts it.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from cron.job
   where command ~* '(prune_terminal_jobs|prune_notifications|prune_product_events|prune_heartbeat_runs|prune_undo_operations|prune_error_events|prune_scheduled_job_health|prune_rate_limit_events)'),
  0,
  'POST-2H-RETENTION-002: all eight built destructive retention sweeps are unscheduled'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- preservation. An absence-only suite is satisfied by a
-- correction that emptied the catalog. (4)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from cron.job where command ~* 'prune_auth_event_attempts'),
  1,
  'POST-2H-RETENTION-003: the authorized auth-event attempt prune survives (asserted by command)'
);

select cmp_ok(
  (select count(*)::int from cron.job where command ~* 'prune_credential_validation_attempts'),
  '>=',
  1,
  'POST-2H-RETENTION-003: the authorized credential-validation attempt prune survives (asserted by command)'
);

select ok(
  exists (select 1 from cron.job where command ~* 'run_all_heartbeats'),
  'POST-2H-RETENTION-003: the hourly heartbeat -- an ordinary operational job -- survives'
);

select ok(
  exists (select 1 from cron.job where command ~* 'reap_expired_jobs'),
  'POST-2H-RETENTION-003: the job reaper -- an ordinary operational job -- survives'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the correction did not weaken the grant posture (2)
--
-- A sweep that became executable by a role would be reachable without a
-- schedule at all, which would make every assertion above beside the point.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
   from unnest(array['service_role', 'authenticated', 'anon']) as role_name
   cross join unnest(array[
     'public.prune_terminal_jobs()',
     'public.prune_notifications()',
     'public.prune_product_events()',
     'public.prune_heartbeat_runs()',
     'public.prune_undo_operations()',
     'public.prune_error_events()',
     'public.prune_scheduled_job_health()',
     'public.prune_rate_limit_events()'
   ]) as signature
   where pg_catalog.has_function_privilege(role_name, signature, 'execute')),
  0,
  'POST-2H-RETENTION-004: no destructive sweep is executable by any application role'
);

-- The control for the census above: an always-refusing privilege check would
-- also return zero. A count-only twin IS granted to service_role, on purpose --
-- a dry run must be possible without the ability to delete.
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.count_prunable_error_events()', 'execute'),
  'POST-2H-RETENTION-004: the control -- a count-only twin IS reachable, so the census above is not always-zero'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- no purge has run in this database (1)
--
-- The whole point of the correction is that nothing was deleted. In a
-- chain-built database the sweeps have never been invoked, so every function
-- that records a purge must be silent. `retention_runs` does not exist as a
-- table in this product; the observable proxy is that no scheduled job in the
-- catalog has ever run one, which sections 1 and 2 establish, plus the
-- count-only twin reading zero against an empty database.
-- ---------------------------------------------------------------------------

-- Cast to int deliberately: the twin returns `bigint`, and pgTAP's `is()` is
-- `is(anyelement, anyelement)`, so `is(bigint, 0)` cannot resolve its
-- polymorphic signature against an integer literal and fails as
-- "function is(bigint, integer) does not exist" -- a suite error rather than a
-- test failure, which is the harder kind to read.
select is(
  public.count_prunable_error_events()::int,
  0,
  'POST-2H-RETENTION-005: nothing is prunable in a freshly built database, so no purge is pending or implied'
);

select * from finish();

rollback;
