-- Phase 2H slice 2H.4 -- the operator surfaces, executed.
--
-- 2H-OPS-001 (system health: queue depth, expired leases, liveness, sink volume),
-- 2H-OPS-002 (account health: lifecycle distribution and stalled deletions),
-- 2H-OPS-003 (read-only, service_role only, anon and authenticated refused),
-- 2H-OPS-004 (no user content, credential material or session identifier),
-- 2H-SINK-005 (the sink has a reachable consumer that reads STORED events),
-- 2H-DEADMAN-001 (the real scheduled paths report their own runs),
-- 2H-DEADMAN-002 (a failure never advances the success clock).
--
-- The controls here are paired on purpose. Six sentinel refusals are satisfied
-- equally well by a surface that returns nothing at all, and a grant assertion
-- is satisfied by a function that does not exist. So every refusal has a
-- positive twin, every privacy census runs against a catalog shape rather than
-- against the source, and the sink consumer is proved to read a row that was
-- actually written rather than an empty set.
--
-- Written in pure ASCII, following the SH.0-SH.6, 2H.1, 2H.2 and 2H.3 suites.

begin;
select plan(47);

set local timezone to 'UTC';

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e4000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   '2h4-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- Section 1 -- the operator reads exist and are service_role only (12)
-- ---------------------------------------------------------------------------
--
-- Both directions for every one of the five: reachable by the operator, and
-- reachable by nobody else. A grant census that only asserted the refusals
-- would pass against a schema in which none of these functions existed.

select is(
  (select count(*)::int
   from unnest(array[
     'public.operator_job_queue_health()',
     'public.operator_error_event_volume(interval)',
     'public.operator_account_lifecycle_summary()',
     'public.operator_deletion_recovery_summary()',
     'public.operator_scheduled_job_findings(interval)'
   ]) as signature
   where pg_catalog.has_function_privilege('service_role', signature, 'execute')),
  5,
  '2H-OPS-003: all five operator reads are reachable by service_role'
);

select is(
  (select count(*)::int
   from unnest(array[
     'public.operator_job_queue_health()',
     'public.operator_error_event_volume(interval)',
     'public.operator_account_lifecycle_summary()',
     'public.operator_deletion_recovery_summary()',
     'public.operator_scheduled_job_findings(interval)'
   ]) as signature
   where pg_catalog.has_function_privilege('authenticated', signature, 'execute')
      or pg_catalog.has_function_privilege('anon', signature, 'execute')),
  0,
  '2H-OPS-003: and by neither authenticated nor anon'
);

-- The caller check is not the grant. A role that somehow held EXECUTE would
-- still be refused by the body, and that is what these five prove.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"e4000001-0000-4000-8000-000000000001"}', true);

select throws_ok(
  $$select * from public.operator_job_queue_health()$$,
  '42501', 'Service role required',
  '2H-OPS-003: the queue read refuses an authenticated caller in its body'
);

select throws_ok(
  $$select * from public.operator_error_event_volume(interval '1 day')$$,
  '42501', 'Service role required',
  '2H-OPS-003: the sink consumer refuses an authenticated caller in its body'
);

select throws_ok(
  $$select * from public.operator_account_lifecycle_summary()$$,
  '42501', 'Service role required',
  '2H-OPS-003: the lifecycle read refuses an authenticated caller in its body'
);

select throws_ok(
  $$select * from public.operator_deletion_recovery_summary()$$,
  '42501', 'Service role required',
  '2H-OPS-003: the recovery summary refuses an authenticated caller in its body'
);

select throws_ok(
  $$select * from public.operator_scheduled_job_findings(interval '1 day')$$,
  '42501', 'Service role required',
  '2H-OPS-003: the findings read refuses an authenticated caller in its body'
);

select throws_ok(
  $$select public.record_scheduled_job_failure('my-brain-job-reaper')$$,
  '42501', 'Service role required',
  '2H-DEADMAN-001: the failure reporter refuses an authenticated caller'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- The positive twin of all six refusals above, so none of them is satisfied by
-- a function that refuses everyone.
select lives_ok(
  $$select * from public.operator_job_queue_health()$$,
  '2H-OPS-001: and the operator is not refused'
);

select lives_ok(
  $$select * from public.operator_error_event_volume(interval '1 day')$$,
  '2H-SINK-005: and the operator is not refused'
);

select lives_ok(
  $$select * from public.operator_account_lifecycle_summary()$$,
  '2H-OPS-002: and the operator is not refused'
);

select lives_ok(
  $$select * from public.operator_deletion_recovery_summary()$$,
  '2H-OPS-002: and the operator is not refused'
);

select lives_ok(
  $$select * from public.operator_scheduled_job_findings(interval '1 day')$$,
  '2H-DEADMAN-002: and the operator is not refused'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the private mechanism is reachable by no role at all (2)
-- ---------------------------------------------------------------------------
--
-- The upsert moved into `private` so that pg_cron, which runs as postgres with
-- a NULL auth.role(), can reach it through the DEFINER functions. That is a
-- widening if any role can call it directly, so it is asserted closed.

select is(
  (select count(*)::int
   from unnest(array['service_role', 'authenticated', 'anon', 'public']) as grantee
   cross join unnest(array[
     'private.apply_scheduled_job_run(text, boolean)',
     'private.apply_scheduled_job_failure(text)',
     'private.scheduled_job_name(text, text)'
   ]) as signature
   where pg_catalog.has_function_privilege(grantee, signature, 'execute')),
  0,
  '2H-OPS-003: the private mechanism is executable by no role -- the guarded RPC and the DEFINER paths are the only ways in'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'private'
     and proc.proname in ('apply_scheduled_job_run', 'apply_scheduled_job_failure', 'scheduled_job_name')
     and proc.proconfig @> array['search_path=""']),
  3,
  'each private function pins an empty search_path'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- nothing here can mutate product state (4)
-- ---------------------------------------------------------------------------
--
-- Three independent proofs, because each alone is weak. `stable` is enforced by
-- the planner at run time; the source census catches a write a future volatile
-- revision could reintroduce; and the executed control catches both, by reading
-- the state before and after and comparing it.
--
-- 2H.1's `operator_stalled_deletions` is deliberately excluded from the
-- volatility assertion and deliberately included in the other two: it is
-- declared VOLATILE, which is a defect of degree rather than of kind -- it
-- writes nothing, but nothing stops it. Restoring it would need a migration
-- this slice does not own, so the fact is recorded rather than hidden, and the
-- source census below covers it meanwhile.

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname like 'operator\_%'
     and proc.provolatile = 's'),
  5,
  '2H-OPS-003: the five reads this slice adds are declared stable, so the planner refuses a write inside one'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname like 'operator\_%'
     and (proc.prosrc ilike '%delete from%'
       or proc.prosrc ilike '%insert into%'
       or proc.prosrc ilike '%update public.%'
       or proc.prosrc ilike '%truncate%'
       or proc.prosrc ilike '%grant %')),
  0,
  '2H-OPS-003: no operator read -- including 2H.1''s -- contains an INSERT, UPDATE, DELETE, TRUNCATE or GRANT'
);

-- The executed control. A census over source is satisfied by a function that
-- writes through something the census cannot see; this reads the four tables an
-- operator read touches, calls all six, and reads them again.
create temporary table operator_mutation_control as
select
  (select count(*) from public.error_events) as sink_rows,
  (select count(*) from public.jobs) as job_rows,
  (select count(*) from public.account_lifecycle) as lifecycle_rows,
  (select count(*) from public.scheduled_job_health) as health_rows;

select count(*) from public.operator_job_queue_health();
select count(*) from public.operator_error_event_volume(interval '1 day');
select count(*) from public.operator_account_lifecycle_summary();
select count(*) from public.operator_deletion_recovery_summary();
select count(*) from public.operator_scheduled_job_findings(interval '1 day');
select count(*) from public.operator_stalled_deletions(100);

select is(
  (select count(*)::text || '/' || (select count(*) from public.jobs)::text
     || '/' || (select count(*) from public.account_lifecycle)::text
     || '/' || (select count(*) from public.scheduled_job_health)::text
   from public.error_events),
  (select sink_rows::text || '/' || job_rows::text || '/' || lifecycle_rows::text
     || '/' || health_rows::text
   from operator_mutation_control),
  '2H-OPS-003: calling every operator read left the sink, the queue, the lifecycle table and the health ledger exactly as it found them'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- 2H-OPS-004, from the catalog and not from the source (4)
-- ---------------------------------------------------------------------------
--
-- The census reads `pg_get_function_result`, which is the deployed shape of the
-- output. Reviewing the migration and concluding it is careful is exactly what
-- T-2H-07 says is not good enough, and a `returns jsonb` operator read would
-- defeat this check by having no columns to enumerate -- which is why every one
-- of them declares its columns.

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname like 'operator\_%'
     and pg_catalog.pg_get_function_result(proc.oid) ~* '(hash|session|secret|token|credential|password|payload|content|prompt|message|email|filename|file_name|error_text|stack)'),
  0,
  '2H-OPS-004: no operator read declares a column whose name admits content, a credential or a session'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname like 'operator\_%'
     and pg_catalog.pg_get_function_result(proc.oid) not ilike 'TABLE(%'),
  0,
  '2H-OPS-004: every operator read returns a declared TABLE -- a jsonb return would have no columns to census'
);

-- The two tables that would leak if any operator read touched them: the sink's
-- correlation id, and the deletion log's session hash.
select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname like 'operator\_%'
     and proc.prosrc ilike '%account_deletion_log%'),
  0,
  '2H-OPS-004: no operator read touches account_deletion_log, the one table carrying a session hash'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname = 'operator_error_event_volume'
     and pg_catalog.pg_get_function_result(proc.oid) ~* '(correlation|user_id|\yid\y)'),
  0,
  '2H-SINK-005: the sink consumer returns no correlation id and no owner -- the classification, never the row'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- the sink consumer reads STORED events (4)
-- ---------------------------------------------------------------------------
--
-- ADR-084's rule, made executable: a consumer that returns an empty set for a
-- populated table is the producer-with-no-consumer defect wearing the
-- consumer's name. So the events are written through the real writer first.

select public.record_error_event('worker', 'interpret_entry', 'provider_timeout',
  '44444444-0000-4000-8000-00000000000a'::uuid);
select public.record_error_event('worker', 'interpret_entry', 'provider_timeout',
  '44444444-0000-4000-8000-00000000000b'::uuid);

-- The aged row is INSERTED with an old `occurred_at` rather than written through
-- the RPC and then moved back, because the sink is append-only and refuses the
-- UPDATE. The refusal is asserted below rather than worked around silently.
insert into public.error_events (surface, operation, reason, correlation_id, occurred_at)
values ('scheduled_job', 'retention_sweep', 'database_error',
        '44444444-0000-4000-8000-00000000000c'::uuid, now() - interval '40 days');

select is(
  (select event_count::int from public.operator_error_event_volume(interval '1 day')
   where surface = 'worker' and operation = 'interpret_entry' and reason = 'provider_timeout'),
  2,
  '2H-SINK-005: the consumer counts the events the writer actually stored'
);

-- Scoped to the classifications this section wrote, rather than to the whole
-- table: the consumer must not be asserted against an empty database, or the
-- assertion silently becomes "nothing else has ever failed" and breaks the
-- first time a real event exists.
select is(
  (select count(*)::int from public.operator_error_event_volume(interval '1 day')
   where operation in ('interpret_entry', 'retention_sweep')),
  1,
  'and groups them by classification rather than returning one row per event'
);

-- The window is real: an event outside it is not counted, and the same event is
-- counted when the window reaches it. Without both halves the consumer could be
-- ignoring its argument entirely.
select is(
  (select count(*)::int from public.operator_error_event_volume(interval '1 day')
   where surface = 'scheduled_job'),
  0,
  '2H-SINK-005: an event older than the window is excluded'
);

select is(
  (select count(*)::int from public.operator_error_event_volume(interval '90 days')
   where surface = 'scheduled_job'),
  1,
  'and the same event is included when the window reaches it -- the argument is used, not decorative'
);

select throws_ok(
  $$update public.error_events set occurred_at = now()
    where correlation_id = '44444444-0000-4000-8000-00000000000c'::uuid$$,
  'P0001',
  'error_events is append-only',
  '2H-SINK-005: and the consumer cannot be fed by rewriting history -- the sink still refuses UPDATE'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- a failure never advances the success clock (5)
-- ---------------------------------------------------------------------------
--
-- `now()` is transaction time in pgTAP, so comparing two timestamps written in
-- the same transaction proves nothing. The success clock is pinned to a fixed
-- literal first, exactly as 2H.2's suite had to.

select public.record_scheduled_job_run('2h4-control-job', true);

update public.scheduled_job_health
set last_success_at = timestamptz '2026-01-01 00:00:00+00',
    last_useful_at = timestamptz '2026-01-01 00:00:00+00'
where job_name = '2h4-control-job';

select lives_ok(
  $$select public.record_scheduled_job_failure('2h4-control-job')$$,
  'the failure reporter accepts a service_role caller'
);

select is(
  (select last_outcome from public.scheduled_job_health where job_name = '2h4-control-job'),
  'failed',
  '2H-DEADMAN-001: a failed run is recorded as failed'
);

select is(
  (select last_success_at from public.scheduled_job_health where job_name = '2h4-control-job'),
  timestamptz '2026-01-01 00:00:00+00',
  '2H-DEADMAN-001: and it leaves last_success_at exactly where it was -- the omission IS the requirement'
);

select is(
  (select failure_count::int || '/' || success_count::int
   from public.scheduled_job_health where job_name = '2h4-control-job'),
  '1/1',
  'failures and successes are counted separately'
);

-- The positive half: a success after a failure does move the clock, so the
-- assertion above is not passing because nothing ever moves it.
select public.record_scheduled_job_run('2h4-control-job', false);

select is(
  (select last_success_at = now() and last_outcome = 'success_empty' and failure_count = 1
   from public.scheduled_job_health where job_name = '2h4-control-job'),
  true,
  'a later success moves the clock forward and leaves the failure count standing'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- the real scheduled paths report themselves (7)
-- ---------------------------------------------------------------------------
--
-- 2H.2 shipped the ledger with no caller: every job read `never_reported`,
-- which was the honest answer and an open gap. These are the callers.
--
-- WHY THESE ASSERTIONS SURVIVE A CONCURRENT REAL TICK, WHICH IS NOT OBVIOUS
-- ---------------------------------------------------------------------------
-- Migration `202607170019` schedules `my-brain-job-reaper` every minute, and
-- that cron job is ACTIVE inside the CI container. Once this slice instrumented
-- `reap_expired_jobs`, a real tick began committing a row under the very key
-- asserted below. That made 2H.2's suite flake -- see its section 9 -- and the
-- same hazard applies here, so it is answered rather than hoped away:
--
--   * `last_outcome` is asserted, never `success_count`. A concurrent tick
--     commits `success_empty`, which is what the first assertion expects
--     anyway, and the second assertion's own call overwrites it.
--   * `useful_count` IS asserted absolutely, and it holds because a real tick
--     can never do useful work here: reaping requires a COMMITTED expired
--     lease, and the fixture below is inserted inside this transaction, so no
--     other session can see it. The CI database has no other job rows.
--   * once this transaction's first `reap_expired_jobs` touches the row, it
--     holds the lock, so no tick can interleave with the rest of the section.
--
-- The window is therefore only *before* the first call, where a tick can add a
-- `success_empty` with `useful_count = 0` and change nothing that is asserted.

select public.reap_expired_jobs(100);

select is(
  (select last_outcome from public.scheduled_job_health
   where job_name = 'my-brain-job-reaper'),
  'success_empty',
  '2H-DEADMAN-001: the lease reaper reports an empty run as EMPTY -- a successful tick is not work'
);

-- The useful half, with a job whose lease has genuinely expired. Without this,
-- the assertion above is satisfied by a reporter hard-coded to say "empty".
insert into public.jobs (
  id, user_id, type, status, payload, attempts, max_attempts,
  idempotency_key, lease_expires_at, started_at
) values (
  '44444444-1111-4000-8000-00000000000a', 'e4000001-0000-4000-8000-000000000001',
  'interpret_entry', 'running',
  jsonb_build_object('entry_id', '44444444-2222-4000-8000-00000000000a', 'mode', 'initial'),
  0, 3,
  '2h4-expired-lease-control', now() - interval '1 hour', now() - interval '2 hours'
);

select public.reap_expired_jobs(100);

select is(
  (select last_outcome || ':' || useful_count::text from public.scheduled_job_health
   where job_name = 'my-brain-job-reaper'),
  'success_work:1',
  '2H-DEADMAN-001: and a run that actually requeued a lease reports WORK'
);

select is(
  (select status from public.jobs where id = '44444444-1111-4000-8000-00000000000a'),
  'failed',
  'the reaper''s own behaviour is unchanged by the instrumentation'
);

select public.run_all_heartbeats();

select is(
  (select job_name from public.scheduled_job_health
   where job_name = 'my-brain-hourly-heartbeat'),
  'my-brain-hourly-heartbeat',
  '2H-DEADMAN-001: the hourly batch reports under the scheduled job''s name'
);

select public.prune_auth_event_attempts();
select public.prune_credential_validation_attempts();

select is(
  (select count(*)::int from public.scheduled_job_health
   where job_name in ('sh-prune-auth-event-attempts', 'byok-prune-validation-attempts')),
  2,
  '2H-DEADMAN-001: both pre-authorized prunes report their own runs'
);

-- The name is resolved from the cron catalog, not from a literal, so a rename
-- keeps one ledger row. In the CI database no cron job exists, which is exactly
-- the fallback case -- and the fallback landing where a job does not exist is
-- what section 8's finding is for.
select is(
  private.scheduled_job_name('no_statement_matches_this_needle', 'declared-fallback'),
  'declared-fallback',
  '2H-DEADMAN-001: an unmatched needle falls back to the declared name rather than reporting nothing'
);

select is(
  (select count(*)::int from public.scheduled_job_health where job_name is null),
  0,
  'and no run is ever recorded under a null name'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- the findings an enumeration cannot show (4)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.operator_scheduled_job_findings(interval '7 days')
   where finding = 'health_without_cron_job' and job_name = '2h4-control-job'),
  1,
  '2H-DEADMAN-002: a health row whose job is not in the cron catalog is a FINDING, not silence'
);

select is(
  (select count(*)::int from public.operator_scheduled_job_findings(interval '7 days')
   where finding not in ('health_without_cron_job', 'duplicate_cron_job_name', 'cron_run_failed')),
  0,
  'the finding vocabulary is closed'
);

select throws_ok(
  $$select * from public.operator_scheduled_job_findings(interval '400 days')$$,
  '22023', 'Window must be between 0 and 365 days',
  'the window is validated rather than defaulted'
);

select throws_ok(
  $$select * from public.operator_error_event_volume(interval '0')$$,
  '22023', 'Window must be between 0 and 365 days',
  'and so is the sink consumer''s'
);

-- ---------------------------------------------------------------------------
-- Section 9 -- ADR-082 and the destructive posture (4)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from cron.job
   where jobname in ('my-brain-deletion-reaper', 'my-brain-prune-error-events',
                     'my-brain-prune-scheduled-job-health')),
  0,
  'ADR-082: this slice scheduled nothing and armed nothing'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname in ('public', 'private')
     and proc.proname like '%scheduled_job%'
     and proc.prosrc ilike '%cron.schedule%'),
  0,
  'and no function this slice touched can schedule one either'
);

-- The two prune functions were re-declared to add their reports. Their DELETE
-- and its predicate are the thing that must not have moved.
select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname = 'prune_auth_event_attempts'
     and proc.prosrc like '%private.prunable_auth_event_attempt_ids(private.retention_batch_limit())%'),
  1,
  'the auth-attempt sweep still deletes exactly what its own predicate returns'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as ns on ns.oid = proc.pronamespace
   where ns.nspname = 'public'
     and proc.proname = 'prune_credential_validation_attempts'
     and proc.prosrc like '%private.prunable_credential_validation_attempt_ids(private.retention_batch_limit())%'),
  1,
  'and so does the credential-validation sweep'
);

select * from finish();
rollback;
