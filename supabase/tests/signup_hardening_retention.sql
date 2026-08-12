-- Signup Hardening SH.6 -- retention and the exposure closures, executed.
--
-- SH-RETENTION-002 (product_events), SH-RETENTION-003 (terminal jobs, live rows
-- never touched), SH-RETENTION-004 (notifications, heartbeat_runs),
-- SH-RETENTION-005 (undo_operations, past EXPIRY), SH-RETENTION-007
-- (scheduler-only, bounded, counted), SH-RETENTION-008 (the count-only twins),
-- SH-RETENTION-009 (the boundary, both directions), SH-EXPOSURE-001 (the
-- service_role revokes and the narrow replacements). Migration 202608050077.
--
-- WHAT A BOUNDARY TEST HAS TO DO TO BE WORTH ANYTHING
-- ---------------------------------------------------------------------------
-- Two rows per class, one second apart across the cutoff, and BOTH outcomes
-- asserted. A test that only proves the old row goes passes against a sweep
-- that deletes everything; a test that only proves the new row stays passes
-- against a sweep that deletes nothing. SH-RETENTION-009 says "off-by-one in
-- both directions" and that is exactly why.
--
-- `now()` is transaction time here, so it does not move between the fixture and
-- the assertion and the second is a real second rather than a hopeful one.
--
-- A NOTE ON WHAT IS BEING EXERCISED
-- ---------------------------------------------------------------------------
-- The live sweeps run here, against fixture rows, inside a transaction that
-- rolls back. That is the only place they may run until an owner authorizes the
-- first production purge (amendment P-1). Nothing in this file touches a shared
-- environment, and the dry-run transcript that precedes any production run is a
-- separate artifact produced by `scripts/sh6-retention-dry-run.mjs`.
--
-- Written in pure ASCII.

begin;
select plan(38);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures -- one owner is enough; retention is not per-owner.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d1000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'sh6-retention@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- ---------------------------------------------------------------------------
-- Section 1 -- the windows are the signed schedule (4)
-- ---------------------------------------------------------------------------

select has_table('private', 'retention_windows', 'the windows table exists');

-- SH.6's own seven, by key and value. This is the claim this file owns: the
-- signed schedule of plan sec. 7, unchanged by anything that came after it.
select is(
  (select array_agg(windows.key || '=' || windows.days order by windows.key)
   from private.retention_windows as windows
   where windows.key in (
     'auth_event_attempts', 'credential_validation_attempts', 'heartbeat_runs',
     'jobs_terminal', 'notifications', 'product_events', 'undo_operations_past_expiry'
   )),
  array[
    'auth_event_attempts=30',
    'credential_validation_attempts=30',
    'heartbeat_runs=30',
    'jobs_terminal=90',
    'notifications=180',
    'product_events=180',
    'undo_operations_past_expiry=30'
  ],
  'plan sec. 7, seeded unchanged'
);

-- And the registry holds NOTHING ELSE undeclared.
--
-- The assertion above used to be a whole-table equality, which meant Phase
-- 2H.5 seeding three observability windows broke a test whose subject is SH.6.
-- Splitting it keeps both halves of the original claim and puts each on the
-- right subject: the seven above are SH.6's and must not move, and the total
-- set is enumerated here so a window nobody declared still fails.
--
-- A future phase that retains a new class MUST edit this line. That is the
-- point rather than the cost: adding something the database will one day delete
-- rows for should require touching the list that enumerates what gets deleted.
select is(
  (select array_agg(windows.key order by windows.key)
   from private.retention_windows as windows),
  array[
    -- SH.6, plan sec. 7
    'auth_event_attempts',
    'credential_validation_attempts',
    -- Phase 2H.5, PRD sec. 14.1, all three at the signed 90 days
    'error_events',
    'heartbeat_runs',
    'jobs_terminal',
    -- Phase 2M slice 2M.4b: the content-free push delivery audit. It REUSES the
    -- signed 90-day window rather than minting a new value, and its sweep
    -- `private.prune_notification_deliveries` is executable by no role and
    -- scheduled by nobody -- scheduling is authorization (ADR-082). Declared
    -- here because this list is what makes "the database will one day delete
    -- rows for this" a visible decision.
    'notification_deliveries',
    'notifications',
    'product_events',
    'rate_limit_events',
    'scheduled_job_health',
    'undo_operations_past_expiry'
  ],
  'the registry holds exactly the declared windows and no undeclared one'
);

-- A sweep that cannot read its window must delete NOTHING. The quota ceilings
-- fail closed by refusing writes; retention fails closed in the other
-- direction, and the two are easy to get backwards.
select throws_ok(
  $$select private.retention_window('a_window_nobody_seeded')$$,
  'P0001',
  null,
  'an absent window refuses rather than defaulting'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- nobody can run a purge, and the operator can run a count (4)
-- ---------------------------------------------------------------------------
-- SH-RETENTION-007. On `auth_event_attempts` a grant here would be worse than a
-- denial of service: deleting rows there RESETS CEILINGS.

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
        unnest(array[
          'public.prune_terminal_jobs()',
          'public.prune_notifications()',
          'public.prune_product_events()',
          'public.prune_heartbeat_runs()',
          'public.prune_undo_operations()',
          'public.prune_auth_event_attempts()',
          'public.prune_credential_validation_attempts()'
        ]) as signature
   where has_function_privilege(role_name::name, signature, 'execute')),
  0,
  'no role at all can execute a sweep'
);

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) as role_name,
        unnest(array[
          'public.count_prunable_terminal_jobs()',
          'public.count_prunable_notifications()',
          'public.count_prunable_product_events()',
          'public.count_prunable_heartbeat_runs()',
          'public.count_prunable_undo_operations()',
          'public.count_prunable_auth_event_attempts()',
          'public.count_prunable_credential_validation_attempts()'
        ]) as signature
   where has_function_privilege(role_name::name, signature, 'execute')),
  0,
  'no browser role can reach a dry-run twin'
);

-- The non-vacuous half: a revoke that also took the operator's access would
-- satisfy everything above and make the SH-RETENTION-008 transcript impossible.
select is(
  (select count(*)::int
   from unnest(array[
     'public.count_prunable_terminal_jobs()',
     'public.count_prunable_notifications()',
     'public.count_prunable_product_events()',
     'public.count_prunable_heartbeat_runs()',
     'public.count_prunable_undo_operations()',
     'public.count_prunable_auth_event_attempts()',
     'public.count_prunable_credential_validation_attempts()'
   ]) as signature
   where has_function_privilege('service_role', signature, 'execute')),
  7,
  'the operator can run every dry-run twin'
);

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
        unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as privilege
   where has_table_privilege(role_name::name, 'private.retention_windows', privilege)),
  0,
  'no client role holds a privilege on the windows'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- terminal jobs, the boundary, and live rows at any age (6)
-- ---------------------------------------------------------------------------

insert into public.jobs
  (id, user_id, type, payload, idempotency_key, status, attempts, max_attempts, created_at)
values
  -- One second past the cutoff: goes.
  ('d1300001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
   'process_attachment', '{}'::jsonb, 'ret-old-completed', 'completed', 1, 5,
   now() - interval '90 days' - interval '1 second'),
  -- Exactly at the cutoff: stays. `<` and not `<=` is the whole assertion.
  ('d1300002-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001',
   'process_attachment', '{}'::jsonb, 'ret-boundary-completed', 'completed', 1, 5,
   now() - interval '90 days'),
  -- Exhausted, and therefore terminal even though its status says `failed`.
  ('d1300003-0000-4000-8000-000000000003', 'd1000001-0000-4000-8000-000000000001',
   'process_attachment', '{}'::jsonb, 'ret-old-exhausted', 'failed', 5, 5,
   now() - interval '400 days'),
  -- Ancient, and LIVE. Never swept at any age -- this is SH-RETENTION-003's
  -- "live rows are never touched", and it is the assertion that catches a sweep
  -- written on age alone.
  ('d1300004-0000-4000-8000-000000000004', 'd1000001-0000-4000-8000-000000000001',
   'process_attachment', '{}'::jsonb, 'ret-old-pending', 'pending', 0, 5,
   now() - interval '400 days'),
  ('d1300005-0000-4000-8000-000000000005', 'd1000001-0000-4000-8000-000000000001',
   'process_attachment', '{}'::jsonb, 'ret-old-retryable', 'failed', 1, 5,
   now() - interval '400 days');

-- The dry-run FIRST, and its number is what the sweep must then remove. A twin
-- that under-reported would be the dangerous failure: an operator authorizes a
-- purge of two and a purge of two thousand runs.
select is(
  public.count_prunable_terminal_jobs(),
  2,
  'the dry-run counts exactly the two terminal rows past the window'
);

select is(
  public.prune_terminal_jobs(),
  2,
  'the sweep removes exactly what the dry-run counted'
);

select is(
  (select count(*)::int from public.jobs where id = 'd1300001-0000-4000-8000-000000000001'),
  0,
  'the row one second past the cutoff is gone'
);

select is(
  (select count(*)::int from public.jobs where id = 'd1300002-0000-4000-8000-000000000002'),
  1,
  'the row exactly at the cutoff survives -- the boundary is strict'
);

select is(
  (select count(*)::int from public.jobs
   where id in ('d1300004-0000-4000-8000-000000000004', 'd1300005-0000-4000-8000-000000000005')),
  2,
  'SH-RETENTION-003: live rows are never touched, at any age'
);

select is(
  public.count_prunable_terminal_jobs(),
  0,
  'the dry-run reads zero once the sweep has run -- it is not a constant'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- notifications, product_events, heartbeat_runs (9)
-- ---------------------------------------------------------------------------

insert into public.notifications (id, user_id, type, title, body, created_at) values
  ('d1400001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
   'task_overdue', 't', 'b', now() - interval '180 days' - interval '1 second'),
  ('d1400002-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001',
   'task_overdue', 't', 'b', now() - interval '180 days');

select is(public.count_prunable_notifications(), 1, 'one notification is past the window');
select is(public.prune_notifications(), 1, 'the sweep removes it');
select is(
  (select count(*)::int from public.notifications
   where id = 'd1400002-0000-4000-8000-000000000002'),
  1,
  'the notification exactly at the cutoff survives'
);

insert into public.product_events
  (id, user_id, event_name, surface, locale, viewport_class, app_version, idempotency_key, created_at)
values
  ('d1500001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
   'capture_started', 'capture', 'pt-BR', 'desktop', 'test',
   'd1510001-0000-4000-8000-000000000001',
   now() - interval '180 days' - interval '1 second'),
  ('d1500002-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001',
   'capture_started', 'capture', 'pt-BR', 'desktop', 'test',
   'd1510002-0000-4000-8000-000000000002',
   now() - interval '180 days');

select is(public.count_prunable_product_events(), 1, 'one product event is past the window');
select is(public.prune_product_events(), 1, 'SH-RETENTION-002: the documented purge exists and runs');
select is(
  (select count(*)::int from public.product_events
   where id = 'd1500002-0000-4000-8000-000000000002'),
  1,
  'the product event exactly at the cutoff survives'
);

-- `started_at`, because this table has no `created_at` at all. A sweep written
-- from habit would have failed at apply time; the assertion is that it matches
-- the column that exists.
insert into public.heartbeat_runs (id, user_id, started_at) values
  ('d1600001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
   now() - interval '30 days' - interval '1 second'),
  ('d1600002-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001',
   now() - interval '30 days');

select is(public.count_prunable_heartbeat_runs(), 1, 'one heartbeat run is past the window');
select is(public.prune_heartbeat_runs(), 1, 'the sweep removes it');
select is(
  (select count(*)::int from public.heartbeat_runs
   where id = 'd1600002-0000-4000-8000-000000000002'),
  1,
  'the heartbeat run exactly at the cutoff survives'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- undo_operations: past EXPIRY, and the FK carve-out (6)
-- ---------------------------------------------------------------------------
-- SH-RETENTION-005. Two things are different here and both would be easy to get
-- wrong: the window runs from `expires_at` rather than `created_at`, and a row
-- a candidate resolution still points at cannot be deleted at all -- the
-- composite FK from 202607220041 is NO ACTION, so the delete would raise and
-- take the whole batch with it.

-- `action_type` must be a REGISTERED handler: `202607250052` puts a BEFORE
-- INSERT trigger on this table so an operation can never be recorded without a
-- compensation to reverse it. `confirm_entry_task_candidates` is used
-- throughout, which is also the action_type the FK carve-out below is about.
insert into public.undo_operations
  (id, user_id, action_type, entity_type, after_state, created_at, expires_at)
values
  -- Expired long enough ago: goes.
  ('d1700001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
   'confirm_entry_task_candidates', 'task', '{}'::jsonb, now() - interval '400 days',
   now() - interval '30 days' - interval '1 second'),
  -- Expiry exactly at the cutoff: stays.
  ('d1700002-0000-4000-8000-000000000002', 'd1000001-0000-4000-8000-000000000001',
   'confirm_entry_task_candidates', 'task', '{}'::jsonb, now() - interval '400 days',
   now() - interval '30 days'),
  -- ANCIENT by creation and still live by expiry. Under a created_at window it
  -- would be swept; under the correct one it must not be. This is the assertion
  -- that tells the two windows apart.
  ('d1700003-0000-4000-8000-000000000003', 'd1000001-0000-4000-8000-000000000001',
   'confirm_entry_task_candidates', 'task', '{}'::jsonb, now() - interval '400 days',
   now() + interval '1 hour');

select is(
  public.count_prunable_undo_operations(),
  1,
  'SH-RETENTION-005: exactly one row is past EXPIRY plus the window'
);

select is(
  public.prune_undo_operations(),
  1,
  'the sweep removes it'
);

select is(
  (select count(*)::int from public.undo_operations
   where id = 'd1700003-0000-4000-8000-000000000003'),
  1,
  'a row created 400 days ago but expiring in an hour is untouched -- the window is on expiry'
);

select is(
  (select count(*)::int from public.undo_operations
   where id = 'd1700002-0000-4000-8000-000000000002'),
  1,
  'the row expiring exactly at the cutoff survives'
);

-- The carve-out, proven rather than asserted in prose. The referencing row
-- needs a real entry, interpretation and task, so the fixture is built through
-- the same shapes the product uses.
insert into public.entries (id, user_id, original_content, source, status, locale)
values ('d1800001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
        'registro de teste', 'web', 'saved', 'pt-BR');

insert into public.entry_interpretations
  (id, user_id, entry_id, summary, model, confidence,
   strategy_version, prompt_version, raw_output)
values ('d1900001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
        'd1800001-0000-4000-8000-000000000001', 'resumo', 'test-model', 0.9,
        'test', 'test', '{}'::jsonb);

insert into public.tasks (id, user_id, title, status)
values ('d1a00001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
        'tarefa de teste', 'todo');

insert into public.undo_operations
  (id, user_id, action_type, entity_type, after_state, created_at, expires_at)
values ('d1700004-0000-4000-8000-000000000004', 'd1000001-0000-4000-8000-000000000001',
        'confirm_entry_task_candidates', 'task', '{}'::jsonb, now() - interval '400 days',
        now() - interval '400 days');

insert into public.entry_task_candidate_resolutions
  (user_id, entry_id, interpretation_id, candidate_index, disposition, task_id, undo_operation_id)
values ('d1000001-0000-4000-8000-000000000001', 'd1800001-0000-4000-8000-000000000001',
        'd1900001-0000-4000-8000-000000000001', 0, 'confirmed',
        'd1a00001-0000-4000-8000-000000000001', 'd1700004-0000-4000-8000-000000000004');

select is(
  public.count_prunable_undo_operations(),
  0,
  'an undo row a resolution still points at is not counted as prunable'
);

-- And the reason it matters: without the carve-out this call raises a
-- foreign-key violation and takes the entire batch down with it.
select lives_ok(
  $$select public.prune_undo_operations()$$,
  'the sweep does not break on the composite FK from 202607220041'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- the two pre-existing sweeps, now reading the shared window (4)
-- ---------------------------------------------------------------------------

insert into public.auth_event_attempts (kind, attempted_at) values
  ('signup', now() - interval '30 days' - interval '1 second'),
  ('signup', now() - interval '30 days');

select is(public.count_prunable_auth_event_attempts(), 1, 'one auth attempt is past the window');
select is(public.prune_auth_event_attempts(), 1, 'the sweep removes exactly it');

insert into public.credential_validation_attempts (user_id, outcome, attempted_at) values
  ('d1000001-0000-4000-8000-000000000001', 'invalid_key',
   now() - interval '30 days' - interval '1 second'),
  ('d1000001-0000-4000-8000-000000000001', 'invalid_key', now() - interval '30 days');

select is(
  public.count_prunable_credential_validation_attempts(),
  1,
  'one validation attempt is past the window'
);
select is(public.prune_credential_validation_attempts(), 1, 'the BYOK sweep still removes exactly it');

-- ---------------------------------------------------------------------------
-- Section 7 -- SH-EXPOSURE-001, non-vacuously (5)
-- ---------------------------------------------------------------------------
-- The revoke is only worth asserting if the grant it removed was real. There is
-- no "before" available inside a migrated database, so the non-vacuous evidence
-- is the other direction: the narrow replacements must WORK, and the DEFINER
-- paths the PRD promised were unaffected must still be reachable.

select is(
  (select count(*)::int
   from unnest(array['public.user_ai_credentials', 'public.credential_validation_attempts']) as relation,
        unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as privilege
   where has_table_privilege('service_role', relation, privilege)),
  0,
  'T-26: service_role holds no table privilege on either BYOK table'
);

select is(
  has_function_privilege('authenticated',
    'public.claim_credential_validation_slot(text, integer, integer)', 'execute'),
  true,
  'the DEFINER throttle path the revoke was promised not to break still works'
);

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) as role_name,
        unnest(array[
          'public.admin_credential_status(uuid)',
          'public.admin_list_credential_envelopes(integer, integer)',
          'public.admin_rewrap_credential_envelope(uuid, smallint, bytea, bytea, smallint)'
        ]) as signature
   where has_function_privilege(role_name::name, signature, 'execute')),
  0,
  'the narrow replacements are not a new user-facing surface'
);

-- Executed, not merely granted. A replacement that exists and refuses would
-- have closed the grant and broken deletion, which is worse than either.
insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values ('d1000001-0000-4000-8000-000000000001', 'active',
        '\xd101020304050607080910111213141516'::bytea,
        '\xd10102030405060708091011'::bytea, 1, 'sk-proj:d1d1d1', now());

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  public.admin_credential_status('d1000001-0000-4000-8000-000000000001'),
  'active',
  'the deletion executor''s narrow status read works'
);

select is(
  (select count(*)::int
   from public.admin_list_credential_envelopes(100, 0)),
  1,
  'the rotation read works, and returns the active row'
);

select * from finish();
rollback;
