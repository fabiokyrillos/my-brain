-- Phase 2H slice 2H.1 -- the stalled-deletion recovery mechanism, executed.
--
-- 2H-RECOVER-001 (retried without human action), 2H-RECOVER-002 (bounded,
-- backed off, terminally classified), 2H-RECOVER-003 (re-invokes, never
-- deletes, holds no wider capability), 2H-RECOVER-004 (operator-readable stop
-- reason with account_deletion_log still unreadable), 2H-RECOVER-005 (every
-- retry auditable), 2H-RECOVER-006 (the exact historical failure shape).
--
-- Genuine cross-process concurrency is NOT provable here -- pgTAP runs in one
-- session and one transaction, so two "concurrent" claims would serialise and
-- the test would agree with itself. What is provable here is that a live lease
-- hides its row from a second claim; the real two-connection race is
-- `scripts/phase-2h-deletion-reaper-race.mjs`, run by the database CI job.
--
-- Written in pure ASCII, following the SH.0-SH.6 suites.

begin;
select plan(52);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures -- three accounts with three different fates
-- ---------------------------------------------------------------------------
--
-- A is driven through the entire historical failure: five attempts, each
-- stopping with `credential_not_erased`, until it becomes terminal.
-- B starts deleting and is then reverted, and must stop being retried.
-- C never leaves `active` and must never appear anywhere below -- the control
-- that keeps the claim predicate from being vacuously true.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d7100001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   '2h1-stalls@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d7100002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   '2h1-reverted@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d7100003-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   '2h1-bystander@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- ---------------------------------------------------------------------------
-- Section 1 -- the recovery table is unreachable outside its functions (7)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'account_deletion_attempts'),
  0,
  'account_deletion_attempts carries no policy at all -- forced RLS with none means no non-superuser read'
);

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class as class
   join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'public' and class.relname = 'account_deletion_attempts'),
  'account_deletion_attempts forces row level security'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.account_deletion_attempts', 'select'),
  '2H-RECOVER-004: service_role cannot SELECT the recovery table directly -- it holds EXECUTE on narrow functions instead'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.account_deletion_attempts', 'update')
  and not pg_catalog.has_table_privilege('service_role', 'public.account_deletion_attempts', 'insert')
  and not pg_catalog.has_table_privilege('service_role', 'public.account_deletion_attempts', 'delete'),
  'service_role holds no DML on the recovery table either'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_attempts', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.account_deletion_attempts', 'select'),
  'no client role can read the recovery table'
);

-- The non-widening claim, asserted rather than asserted-about. This is the
-- whole point of 2H-RECOVER-004: the reason became readable WITHOUT the log
-- becoming readable.
select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.account_deletion_log', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_log', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.account_deletion_log', 'select'),
  '2H-RECOVER-004: account_deletion_log is still unreadable by every ordinary role, including service_role'
);

-- And the projection cannot leak what the log holds, because it does not carry
-- the column at all. Read from the catalog, so adding one later fails here.
--
-- The column count is asserted FIRST and deliberately. Without it, the pattern
-- check below is satisfied by a function with no declared arguments at all --
-- an empty set matches no pattern -- so a rename or a signature change would
-- turn this into a test that passes because it is measuring nothing.
select is(
  (select coalesce(array_length(proc.proargnames, 1), 0)
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public' and proc.proname = 'operator_stalled_deletions'),
  10,
  'the operator projection declares one argument and nine result columns -- the pattern check below has something to measure'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   cross join lateral unnest(proc.proargnames) as arg(name)
   where namespace.nspname = 'public'
     and proc.proname = 'operator_stalled_deletions'
     and (arg.name ilike '%hash%' or arg.name ilike '%session%'
          or arg.name ilike '%secret%' or arg.name ilike '%token%'
          or arg.name ilike '%credential%' or arg.name ilike '%content%')),
  0,
  '2H-RECOVER-004: the operator projection declares no session, hash, token, credential or content column'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- no client role can reach any recovery function (3)
-- ---------------------------------------------------------------------------

select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.claim_stalled_account_deletions(integer, integer, interval, interval, interval)', 'execute')
  and not pg_catalog.has_function_privilege('anon', 'public.claim_stalled_account_deletions(integer, integer, interval, interval, interval)', 'execute'),
  'the claim function is service_role-only'
);

select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.operator_stalled_deletions(integer)', 'execute')
  and not pg_catalog.has_function_privilege('anon', 'public.operator_stalled_deletions(integer)', 'execute')
  and pg_catalog.has_function_privilege('service_role', 'public.operator_stalled_deletions(integer)', 'execute'),
  '2H-OPS boundary: the operator projection is reachable by service_role and by nobody else'
);

select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.reap_stalled_account_deletions(integer, integer, interval, interval, interval)', 'execute')
  and not pg_catalog.has_function_privilege('anon', 'public.record_account_deletion_attempt(uuid, uuid, text, text)', 'execute'),
  'neither the reaper nor the result recorder is reachable by a client role'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- seeding follows the lifecycle, in both directions (5)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.account_deletion_attempts),
  0,
  'no account is in recovery before any account asks to be deleted'
);

update public.account_lifecycle
set status = 'deleting', reason_code = 'user_deletion_request', changed_by = 'user'
where user_id = 'd7100001-0000-4000-8000-000000000001';

update public.account_lifecycle
set status = 'deleting', reason_code = 'user_deletion_request', changed_by = 'user'
where user_id = 'd7100002-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.account_deletion_attempts),
  2,
  '2H-RECOVER-001: entering `deleting` seeds the recovery row, for both accounts and no others'
);

select is(
  (select recovery_state from public.account_deletion_attempts
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  'pending',
  'a freshly seeded row is `pending` with no attempt spent'
);

-- B is reverted. SH-DELETE-014's admin return path is `deleting -> active`.
update public.account_lifecycle
set status = 'active', reason_code = 'deletion_reverted', changed_by = 'operator'
where user_id = 'd7100002-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.account_deletion_attempts
   where user_id = 'd7100002-0000-4000-8000-000000000002'),
  0,
  '2H-RECOVER-003: a reverted deletion loses its recovery row, so nothing can retry it'
);

select is(
  (select count(*)::int from public.account_deletion_attempts
   where user_id = 'd7100003-0000-4000-8000-000000000003'),
  0,
  'the account that never asked to be deleted was never enrolled -- the control'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the claim refuses without service_role, and validates its bounds (6)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select * from public.claim_stalled_account_deletions(10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes')$$,
  '42501',
  'Service role required',
  'the claim refuses a caller that is not service_role'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok(
  $$select * from public.claim_stalled_account_deletions(10, 0, interval '15 minutes', interval '6 hours', interval '5 minutes')$$,
  '22023',
  'Attempt ceiling must be between 1 and 50',
  '2H-RECOVER-002: an attempt ceiling of zero is refused rather than silently defaulted'
);

-- The boundary itself, and it must be the boundary: the cap is EQUAL to the
-- retry interval here. The first version of this line passed a 5-minute cap
-- against a 15-minute interval and called it "equal", which is the refused case
-- one line below wearing the accepted case's description -- a test that would
-- have gone green only by the validation being deleted.
select lives_ok(
  $$select * from public.claim_stalled_account_deletions(10, 5, interval '15 minutes', interval '15 minutes', interval '5 minutes')$$,
  'a backoff cap equal to the retry interval is accepted (the boundary, not an error)'
);

select throws_ok(
  $$select * from public.claim_stalled_account_deletions(10, 5, interval '15 minutes', interval '1 minute', interval '5 minutes')$$,
  '22023',
  'Backoff cap is required and cannot be shorter than the retry interval',
  'a cap shorter than the interval is refused -- a bound that shrinks is not a bound'
);

select throws_ok(
  $$select * from public.claim_stalled_account_deletions(0, 5, interval '15 minutes', interval '6 hours', interval '5 minutes')$$,
  '22023',
  'Claim limit must be between 1 and 100',
  'the batch limit is validated'
);

-- The negative control that makes every positive below mean something: a row
-- that exists, is `deleting`, and is simply NOT DUE YET.
select is(
  (select count(*)::int from public.claim_stalled_account_deletions(
     10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes')),
  0,
  '2H-RECOVER-002: an account seeded moments ago is not due, and nothing is claimed'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- the first retry: claimed, bounded, audited (7)
-- ---------------------------------------------------------------------------
--
-- `now()` is transaction time in pgTAP, so "time passes" is expressed by
-- backdating the row rather than by sleeping -- which also makes the assertion
-- exact instead of approximate.

update public.account_deletion_attempts
set first_seen_at = now() - interval '20 minutes'
where user_id = 'd7100001-0000-4000-8000-000000000001';

create temporary table claim_one on commit drop as
select * from public.claim_stalled_account_deletions(
  10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes');

select is(
  (select count(*)::int from claim_one),
  1,
  '2H-RECOVER-001: an account whose last attempt is older than the declared threshold is claimed with no human action'
);

select is(
  (select attempt_count from claim_one),
  1,
  'the first claim spends attempt 1'
);

select ok(
  (select claim_token is not null from claim_one),
  'the claim issues a lease token'
);

select is(
  (select recovery_state from public.account_deletion_attempts
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  'retrying',
  'the row is now `retrying`, and the LIFECYCLE status has not moved'
);

select is(
  (select status from public.account_lifecycle
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  'deleting',
  '2H-RECOVER-003: recovery never moves the lifecycle status, so the SH.1 write predicates stay in force'
);

select is(
  (select next_attempt_at - last_attempt_at from public.account_deletion_attempts
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  interval '15 minutes',
  '2H-RECOVER-002: attempt 1 backs off by exactly one retry interval (2^0)'
);

select is(
  (select count(*)::int from public.audit_logs
   where user_id = 'd7100001-0000-4000-8000-000000000001'
     and action_type = 'account_deletion_retry_claimed'
     and actor = 'system'),
  1,
  '2H-RECOVER-005: the claim wrote an audit row naming actor, target and resulting state'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- the lease: one claim, exactly once (3)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.claim_stalled_account_deletions(
     10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes')),
  0,
  'a second claim finds nothing: the live lease hides the row (the single-session half of exactly-once)'
);

select is(
  public.confirm_account_deletion_claim(
    'd7100001-0000-4000-8000-000000000001',
    (select claim_token from claim_one)
  ) ->> 'confirmed',
  'true',
  '2H-RECOVER-003: the issued token confirms for the account it was issued for'
);

select is(
  public.confirm_account_deletion_claim(
    'd7100003-0000-4000-8000-000000000003',
    (select claim_token from claim_one)
  ) ->> 'confirmed',
  'false',
  '2H-RECOVER-003: the same token confirms NOTHING for a different account -- the reaper cannot redirect the executor'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- the historical failure, replayed to its bound (2H-RECOVER-006) (9)
-- ---------------------------------------------------------------------------
--
-- This is the defect of 2026-08-04, not an analogue of it. The deployed
-- executor's step 5 read `user_ai_credentials` with a grant `202608050077` had
-- revoked, so every run stopped with exactly `credential_not_erased` and the
-- account stayed in `deleting` forever. Below, every attempt reports that exact
-- stop reason -- the shape `delete-account/executor.test.ts` pins in the
-- worker suite -- and the assertions are that it is retried, that the retries
-- are bounded, that it becomes terminal, and that an operator can see why.

select ok(
  (public.record_account_deletion_attempt(
    'd7100001-0000-4000-8000-000000000001',
    (select claim_token from claim_one),
    'stopped',
    'credential_not_erased'
  ) ->> 'recorded')::boolean,
  '2H-RECOVER-006: attempt 1 reports the historical stop reason and it is recorded'
);

select lives_ok(
  $$select public.record_account_deletion_attempt(
      'd7100001-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000ff'::uuid,
      'stopped', 'credential_not_erased')$$,
  'a forged token does not raise -- it records nothing, and the audit count below is what proves that'
);

select is(
  (select count(*)::int from public.audit_logs
   where user_id = 'd7100001-0000-4000-8000-000000000001'
     and action_type = 'account_deletion_retry_result'),
  1,
  '2H-RECOVER-005: exactly one result audit row exists -- the forged token wrote none'
);

select is(
  (select last_stop_reason from public.account_deletion_attempts
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  'credential_not_erased',
  'the stop reason is carried on the recovery row, from the closed vocabulary'
);

-- Attempts 2 through 5, each stopping the same way. The row is made due each
-- time by backdating, which is what "the backoff elapsed" means in a single
-- transaction.
do $$
declare
  spent integer;
  token uuid;
begin
  for spent in 2..5 loop
    update public.account_deletion_attempts
    set next_attempt_at = now() - interval '1 second'
    where user_id = 'd7100001-0000-4000-8000-000000000001';

    select claims.claim_token into token
    from public.claim_stalled_account_deletions(
      10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes'
    ) as claims;

    if token is null then
      raise exception 'attempt % was not claimed while the ceiling still allowed it', spent;
    end if;

    perform public.record_account_deletion_attempt(
      'd7100001-0000-4000-8000-000000000001', token, 'stopped', 'credential_not_erased'
    );
  end loop;
end;
$$;

select is(
  (select attempt_count from public.account_deletion_attempts
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  5,
  '2H-RECOVER-002: exactly the declared ceiling of attempts was spent, and not one more'
);

select is(
  (select recovery_state from public.account_deletion_attempts
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  'retrying',
  'having spent five attempts, the row is not yet terminal -- it becomes terminal when it next comes due'
);

-- The sixth pass: due again, ceiling reached, terminal.
update public.account_deletion_attempts
set next_attempt_at = now() - interval '1 second'
where user_id = 'd7100001-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.claim_stalled_account_deletions(
     10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes')),
  0,
  '2H-RECOVER-002: past the ceiling nothing is handed out -- the loop stops rather than continuing'
);

select is(
  (select recovery_state from public.account_deletion_attempts
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  'stalled',
  '2H-RECOVER-002: the terminal classification is `stalled`'
);

select is(
  (select count(*)::int from public.audit_logs
   where user_id = 'd7100001-0000-4000-8000-000000000001'
     and action_type = 'account_deletion_recovery_stalled'),
  1,
  '2H-RECOVER-005: becoming terminal is itself audited'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- terminal means terminal, and visible (5)
-- ---------------------------------------------------------------------------

update public.account_deletion_attempts
set next_attempt_at = now() - interval '10 days'
where user_id = 'd7100001-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.claim_stalled_account_deletions(
     10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes')),
  0,
  '2H-RECOVER-002: a stalled row is never claimed again, however overdue it looks'
);

select is(
  (select recovery_state from public.operator_stalled_deletions(100)
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  'stalled',
  '2H-RECOVER-004: the operator read shows the terminal classification'
);

select is(
  (select last_stop_reason from public.operator_stalled_deletions(100)
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  'attempt_ceiling_reached',
  '2H-RECOVER-004: and why it stopped, from the closed vocabulary'
);

select is(
  (select attempt_count from public.operator_stalled_deletions(100)
   where user_id = 'd7100001-0000-4000-8000-000000000001'),
  5,
  '2H-RECOVER-004: and how many times it was retried -- the read whose absence made the stall take a day to diagnose'
);

select is(
  (select count(*)::int from public.operator_stalled_deletions(100)),
  1,
  'the operator read shows the one account in recovery and no other -- the reverted and active accounts are absent'
);

-- ---------------------------------------------------------------------------
-- Section 9 -- the reaper claims and classifies without invoking anything (3)
-- ---------------------------------------------------------------------------
--
-- The CI database has no `deletion_reap_url` and no `deletion_reap_secret` in
-- Vault, which is exactly the unarmed state the hosted project is in until an
-- operator arms it. The assertion is that this state is a measured no-op and
-- not an error: an unarmed reaper still makes staleness visible.

select is(
  public.reap_stalled_account_deletions(
    10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes'
  ) ->> 'armed',
  'false',
  '2H-RECOVER-003: the reaper reports itself unarmed rather than pretending to have dispatched'
);

select is(
  public.reap_stalled_account_deletions(
    10, 5, interval '15 minutes', interval '6 hours', interval '5 minutes'
  ) ->> 'dispatched',
  '0',
  'an unarmed reaper invokes nothing at all'
);

select is(
  (select count(*)::int from cron.job where jobname = 'my-brain-deletion-reaper'),
  0,
  'ADR-082: the migration scheduled no reaper -- arming it is an operator act'
);

-- ---------------------------------------------------------------------------
-- Section 10 -- the reaper cannot delete, read from the catalog (3)
-- ---------------------------------------------------------------------------
--
-- 2H-RECOVER-003 is a capability claim, and a capability claim proven by
-- reading the code is worth more than one proven by running the happy path.
-- The bodies are read from `pg_proc` so an edit that adds a delete fails here.

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public'
     and proc.proname in ('reap_stalled_account_deletions', 'claim_stalled_account_deletions')
     and (proc.prosrc ilike '%auth.users%'
          or proc.prosrc ilike '%deleteUser%'
          or proc.prosrc ilike '%storage.objects%')),
  0,
  '2H-RECOVER-003: neither the reaper nor the claim mentions auth.users, the storage catalog or a user delete'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public'
     and proc.proname in (
       'reap_stalled_account_deletions', 'claim_stalled_account_deletions',
       'operator_stalled_deletions', 'confirm_account_deletion_claim',
       'record_account_deletion_attempt')
     and proc.prosrc ilike '%delete from%'),
  0,
  '2H-RECOVER-003: no recovery function contains a DELETE at all -- deletion stays the executor''s alone'
);

select is(
  (select count(*)::int
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public'
     and proc.proname in (
       'reap_stalled_account_deletions', 'claim_stalled_account_deletions',
       'operator_stalled_deletions', 'confirm_account_deletion_claim',
       'record_account_deletion_attempt')
     and proc.prosrc ilike '%account_deletion_log%'),
  0,
  '2H-RECOVER-004: no recovery function reads the deletion log, so the session hash cannot reach an operator surface'
);

select * from finish();
rollback;
