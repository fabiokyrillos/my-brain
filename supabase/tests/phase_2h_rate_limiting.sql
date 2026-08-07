-- Phase 2H slice 2H.3 -- the distributed rate limiter, executed.
--
-- 2H-RATE-001 (per owner, cross process, database backed, rolling window),
-- 2H-RATE-002 (ceilings are required parameters or signed runtime rows, never
-- silent defaults), 2H-RATE-003 (a refusal is a named recorded outcome),
-- 2H-RATE-005 (unreadable limiter state refuses rather than admits),
-- 2H-RATE-006 (no spend semantics), PRD sec. 14.2 V-3 (rolling, not clock
-- hour), V-4 (automatic retries do not consume), V-5 (background work consumes
-- the owner's slot, admitted once), V-6 (no exemptions).
--
-- WHAT THIS SUITE CANNOT PROVE, AND WHERE IT IS PROVED INSTEAD
--
-- Genuine cross-process concurrency is not provable here: pgTAP runs in one
-- session and one transaction, so two "concurrent" claims would serialise,
-- agree with each other, and say nothing about the advisory lock. The real
-- N-racer proof is `scripts/phase-2h-rate-limit-race.mjs`, run by the database
-- CI job against separate PostgREST connections. What this suite proves that
-- the race cannot is the *stored state* directly -- pgTAP runs as the session
-- superuser and can read a table no role holds a grant on.
--
-- `now()` is transaction time, so every timestamp below shares one frozen
-- boundary. That is what makes the window assertions exact rather than flaky.
--
-- Written in pure ASCII, following the SH.0-SH.6, 2H.1 and 2H.2 suites.

begin;
select plan(63);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures -- two owners, so "per owner" is a property and not a coincidence
-- ---------------------------------------------------------------------------
--
-- A is driven to its ceiling repeatedly. B never claims anything until the very
-- end, where it must still be admitted -- the control that stops every refusal
-- below from being satisfied by a limiter that refuses everybody.
-- C exists only for the drain section.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a3000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   '2h3-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a3000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   '2h3-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a3000003-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   '2h3-drain-c@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- The drain fixture, written here for `byok_awaiting_and_drain.sql`'s reason:
-- `service_role` holds no INSERT on `entries`, so a section that created its own
-- rows after the claim was set would fail on a permission rather than on the
-- property under test.
insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  ('a3000003-0000-4000-8000-000000000003', 'active',
   '\xcc01020304050607080910111213141516'::bytea,
   '\xcc0102030405060708091011'::bytea, 1, 'sk-proj:cccccc', now());

insert into public.entries (id, user_id, original_content, source, status, locale, created_at)
values
  ('a3200001-0000-4000-8000-000000000001', 'a3000003-0000-4000-8000-000000000003',
   'entrada da conta do dreno', 'web', 'saved', 'pt-BR', now() - interval '1 minute'),
  ('a3200002-0000-4000-8000-000000000002', 'a3000003-0000-4000-8000-000000000003',
   'segunda entrada da conta do dreno', 'web', 'saved', 'pt-BR', now() - interval '1 minute');

insert into public.jobs (id, user_id, type, payload, idempotency_key, created_at, next_attempt_at)
values
  ('a3100001-0000-4000-8000-000000000001', 'a3000003-0000-4000-8000-000000000003',
   'interpret_entry',
   jsonb_build_object('entry_id', 'a3200001-0000-4000-8000-000000000001', 'mode', 'initial'),
   '2h3-drain-first-claim', now() - interval '1 minute', now() - interval '1 minute'),
  ('a3100002-0000-4000-8000-000000000002', 'a3000003-0000-4000-8000-000000000003',
   'interpret_entry',
   jsonb_build_object('entry_id', 'a3200002-0000-4000-8000-000000000002', 'mode', 'initial'),
   '2h3-drain-retry-claim', now() - interval '1 minute', now() - interval '1 minute');

-- ---------------------------------------------------------------------------
-- Section 1 -- the limiter state is unreachable outside its functions (10)
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class as class
   join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'public' and class.relname = 'rate_limit_events'),
  'rate_limit_events forces row level security'
);

select is(
  (select count(*)::int from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'rate_limit_events'),
  1,
  'the closed door is written down: exactly one policy, denying rather than absent'
);

select ok(
  (select qual = 'false' and with_check = 'false'
   from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'rate_limit_events'),
  'the policy denies -- using (false) with check (false), not a permissive rule nobody read'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.rate_limit_events', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.rate_limit_events', 'select')
  and not pg_catalog.has_table_privilege('anon', 'public.rate_limit_events', 'select'),
  '2H-RATE-001: no role reads the limiter state directly -- not even service_role'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.rate_limit_events', 'delete')
  and not pg_catalog.has_table_privilege('authenticated', 'public.rate_limit_events', 'delete')
  and not pg_catalog.has_table_privilege('anon', 'public.rate_limit_events', 'delete'),
  'no role may DELETE from the limiter -- a role that could would mint itself slots'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.rate_limit_events', 'insert')
  and not pg_catalog.has_table_privilege('authenticated', 'public.rate_limit_events', 'insert')
  and not pg_catalog.has_table_privilege('anon', 'public.rate_limit_events', 'insert'),
  'no role may INSERT either; the claim functions are the only door'
);

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class as class
   join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'private' and class.relname = 'rate_limit_parameters'),
  'the signed parameters force row level security too'
);

select ok(
  not pg_catalog.has_function_privilege('anon', 'private.consume_rate_limit_slot(uuid, text, integer, interval)', 'execute')
  and not pg_catalog.has_function_privilege('authenticated', 'private.consume_rate_limit_slot(uuid, text, integer, interval)', 'execute')
  and not pg_catalog.has_function_privilege('service_role', 'private.consume_rate_limit_slot(uuid, text, integer, interval)', 'execute'),
  'the core decision takes an owner as an argument and is therefore reachable by nobody'
);

select ok(
  pg_catalog.has_function_privilege('authenticated', 'public.claim_rate_limit_slot(text, integer, interval)', 'execute')
  and not pg_catalog.has_function_privilege('anon', 'public.claim_rate_limit_slot(text, integer, interval)', 'execute')
  and not pg_catalog.has_function_privilege('service_role', 'public.claim_rate_limit_slot(text, integer, interval)', 'execute'),
  'the session claim is the session''s alone: authenticated yes, anon and service_role no'
);

select ok(
  pg_catalog.has_function_privilege('service_role', 'public.claim_rate_limit_slot_for_user(uuid, text, integer, interval)', 'execute')
  and not pg_catalog.has_function_privilege('anon', 'public.claim_rate_limit_slot_for_user(uuid, text, integer, interval)', 'execute')
  and not pg_catalog.has_function_privilege('authenticated', 'public.claim_rate_limit_slot_for_user(uuid, text, integer, interval)', 'execute'),
  'the worker claim is service_role''s alone -- an authenticated caller could otherwise spend another owner''s window'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the ceilings are declared, never defaulted (9)
-- ---------------------------------------------------------------------------

select is(
  (select value from private.rate_limit_parameters where key = 'ai_operations_per_hour'),
  60::bigint,
  '2H-RATE-002: PRD sec. 14.2 V-1 is seeded exactly as signed'
);
select is(
  (select value from private.rate_limit_parameters where key = 'uploads_per_hour'),
  20::bigint,
  'PRD sec. 14.2 V-2 is seeded exactly as signed'
);
select is(
  (select value from private.rate_limit_parameters where key = 'rolling_window_seconds'),
  3600::bigint,
  'PRD sec. 14.2 V-3 is seeded as one hour, in seconds'
);
select is(
  (select count(*)::int from private.rate_limit_parameters),
  3,
  'exactly three signed values and no fourth nobody agreed to'
);

select throws_ok(
  $$select private.rate_limit_parameter('a_key_nobody_signed')$$,
  'P0001',
  'Rate limit parameter is missing',
  'an absent parameter refuses -- a limiter that fails open is not one'
);

select throws_ok(
  $$select * from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', null, interval '1 hour')$$,
  '22023',
  'Rate limit ceiling is required',
  '2H-RATE-002: a null ceiling is a caller that did not decide, and is refused rather than defaulted'
);

select throws_ok(
  $$select * from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 0, interval '1 hour')$$,
  '22023',
  'Invalid rate limit ceiling',
  'a ceiling of zero would be a denial of service delivered by argument'
);

select throws_ok(
  $$select * from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 999999, interval '1 hour')$$,
  '22023',
  'Invalid rate limit ceiling',
  'a ceiling above the safety cap would turn the limiter off by argument'
);

select throws_ok(
  $$select * from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 3, interval '90 days')$$,
  '22023',
  'Invalid rate limit window',
  'a window wide enough to be meaningless is the same bypass as a ceiling that is'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- admission, the ceiling, and the recorded refusal (12)
-- ---------------------------------------------------------------------------
--
-- Ceiling 3 rather than the signed 60, deliberately: the ceilings are REQUIRED
-- arguments precisely so a test can choose its own without a production default
-- moving. Section 2 asserts the signed values exactly; this section asserts the
-- mechanism.

select ok(
  (select admitted from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 3, interval '1 hour')),
  'the first claim below the ceiling is admitted'
);
select ok(
  (select admitted from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 3, interval '1 hour')),
  'so is the second'
);
select ok(
  (select admitted from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 3, interval '1 hour')),
  'and the third, which fills the ceiling exactly'
);

select is(
  (select refusal from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 3, interval '1 hour')),
  'RATE_LIMIT_AI',
  '2H-RATE-001: the fourth is refused, by name'
);

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'a3000001-0000-4000-8000-000000000001' and bucket = 'ai' and outcome = 'admitted'),
  3,
  'the stored state reflects exactly the three admissions -- the slot is reserved by inserting'
);

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'a3000001-0000-4000-8000-000000000001' and bucket = 'ai' and outcome = 'refused'),
  1,
  '2H-RATE-003: the refusal is a recorded outcome, not a silence'
);

select ok(
  (select slot_id is not null from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 3, interval '1 hour')),
  'a refusal returns the id of the row that recorded it'
);

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'a3000001-0000-4000-8000-000000000001' and bucket = 'ai' and outcome = 'admitted'),
  3,
  'refusals do not become admissions: the admitted count is unchanged after two refusals'
);

select is(
  (select refusal from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'ai', 3, interval '1 hour')),
  'RATE_LIMIT_AI',
  'refused rows do not count against the ceiling either -- a refusal storm does not extend a lockout'
);

-- The buckets are independent, so an owner who has spent their AI hour can
-- still upload. Folding the two would make one signed ceiling silently govern
-- the other.
select ok(
  (select admitted from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'upload', 2, interval '1 hour')),
  'the upload bucket is not spent by the AI bucket'
);
select ok(
  (select admitted from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'upload', 2, interval '1 hour')),
  'the second upload fills the upload ceiling'
);
select is(
  (select refusal from private.consume_rate_limit_slot('a3000001-0000-4000-8000-000000000001', 'upload', 2, interval '1 hour')),
  'RATE_LIMIT_UPLOAD',
  'the upload refusal has its own name -- an operator can tell which ceiling refused'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the window is rolling, and a fixed window would fail here (7)
-- ---------------------------------------------------------------------------
--
-- WHY THE FIXED-WINDOW CONTROL IS NOT WRITTEN WITH `date_trunc`
--
-- The obvious control -- two slots straddling a real clock-hour boundary -- is
-- timing-fragile: at :59 past, "one minute before the boundary" is exactly
-- sixty minutes ago and falls outside the window, so the test would pass or
-- fail depending on when CI happened to run. A gate that is green at 10:15 and
-- red at 10:59 is worse than no gate.
--
-- The property that actually distinguishes the two implementations is that the
-- **window argument governs**. A `date_trunc('hour', ...)` counter cannot honour
-- a thirty-minute window at all: it would give the same answer for both windows
-- below. The pair of assertions is therefore time-independent and strictly more
-- discriminating than the clock-boundary version.

-- Owner B, untouched so far, gets slots placed at chosen times.
insert into public.rate_limit_events (user_id, bucket, outcome, consumed_at)
values ('a3000002-0000-4000-8000-000000000002', 'ai', 'admitted', now() - interval '30 minutes');

select ok(
  (select admitted from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 1, interval '30 minutes')),
  'a slot consumed exactly one window ago has expired: the predicate is strictly inside the window'
);

-- Clear B and place a slot one second INSIDE the window instead.
delete from public.rate_limit_events where user_id = 'a3000002-0000-4000-8000-000000000002';
insert into public.rate_limit_events (user_id, bucket, outcome, consumed_at)
values ('a3000002-0000-4000-8000-000000000002', 'ai', 'admitted', now() - interval '30 minutes' + interval '1 second');

select is(
  (select refusal from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 1, interval '30 minutes')),
  'RATE_LIMIT_AI',
  'one second inside the window still counts -- the boundary is exact in both directions'
);

-- THE FIXED-WINDOW CONTROL: same rows, same ceiling, two different windows.
delete from public.rate_limit_events where user_id = 'a3000002-0000-4000-8000-000000000002';
insert into public.rate_limit_events (user_id, bucket, outcome, consumed_at)
values
  ('a3000002-0000-4000-8000-000000000002', 'ai', 'admitted', now() - interval '50 minutes'),
  ('a3000002-0000-4000-8000-000000000002', 'ai', 'admitted', now() - interval '10 minutes');

select is(
  (select refusal from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 2, interval '1 hour')),
  'RATE_LIMIT_AI',
  'V-3: both slots are inside a one-hour rolling window, so a third is refused'
);

select ok(
  (select admitted from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 2, interval '30 minutes')),
  'V-3: the SAME rows admit under a thirty-minute window -- a clock-hour counter could not tell the two apart'
);

select ok(
  (select prosrc like '%pg_catalog.now() - p_window%' and prosrc not like '%date_trunc%'
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'private' and proc.proname = 'consume_rate_limit_slot'),
  'V-3: and the predicate is relative to the argument, with no truncation anywhere in it'
);

-- Rolling expiry releases capacity. Move every slot outside the window and the
-- same owner is admitted again, with no operator action and no sweep.
update public.rate_limit_events
set consumed_at = consumed_at - interval '3 hours'
where user_id = 'a3000002-0000-4000-8000-000000000002';

select ok(
  (select admitted from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 2, interval '1 hour')),
  'expiry releases capacity by itself -- the window rolls without anything being deleted'
);

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'a3000002-0000-4000-8000-000000000002' and outcome = 'admitted'),
  4,
  'and the expired rows are still there: expiry is a predicate, not a deletion'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- fail-closed (2H-RATE-005) (5)
-- ---------------------------------------------------------------------------
--
-- The fault is injected rather than described. Renaming the column the count
-- reads invalidates the cached plan, so the SELECT inside the function fails on
-- recompilation -- which is what "the limiter state cannot be read" means in
-- the only way a test can produce it.
--
-- The fault is applied and then undone by a **forward** DDL rather than by a
-- savepoint rollback, deliberately: pgTAP keeps its test counter in a temporary
-- table, and `rollback to savepoint` would roll that counter back too, renumber
-- the remaining assertions and make the plan disagree with the run.
--
-- The control therefore runs BEFORE the fault. Without it, a function that
-- refused unconditionally would pass every assertion in this section, and a
-- limiter that refuses everything has broken the product rather than protected
-- it.

select ok(
  (select admitted from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 99, interval '1 hour')),
  'the control: with a ceiling of 99 and the table intact, this owner is admitted'
);

alter table public.rate_limit_events rename column outcome to outcome_broken;

select is(
  (select refusal from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 99, interval '1 hour')),
  'RATE_LIMIT_STATE_UNAVAILABLE',
  '2H-RATE-005: unreadable state names its own fault'
);

select is(
  (select admitted from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 99, interval '1 hour')),
  false,
  '2H-RATE-005: and refuses, at the identical ceiling that admitted a moment ago'
);

select ok(
  (select slot_id is null from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 99, interval '1 hour')),
  'nothing is recorded when the table that would record it is the broken one'
);

alter table public.rate_limit_events rename column outcome_broken to outcome;

select ok(
  (select admitted from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 99, interval '1 hour')),
  'and the same call admits again once the fault is undone'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- no owner is exempt (PRD sec. 14.2 V-6) (3)
-- ---------------------------------------------------------------------------

select ok(
  (select prosrc !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'private' and proc.proname = 'consume_rate_limit_slot'),
  'V-6: the decision contains no account identifier -- there is no exemption to widen later'
);

select ok(
  (select prosrc !~* '\mexempt\M|\munlimited\M|\mis_owner\M'
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'private' and proc.proname = 'consume_rate_limit_slot'),
  'V-6: and no exemption vocabulary either'
);

-- Owner B is now at three admitted slots inside the window. A ceiling of 1
-- refuses it exactly as it refused A, which is the behavioural half of V-6:
-- two different accounts, one rule.
select is(
  (select refusal from private.consume_rate_limit_slot('a3000002-0000-4000-8000-000000000002', 'ai', 1, interval '1 hour')),
  'RATE_LIMIT_AI',
  'V-6: a second account meets the identical rule'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- admission at the drain, exactly once (V-4, V-5) (9)
-- ---------------------------------------------------------------------------
--
-- `auth.role()` reads the JWT CLAIM, never the PostgreSQL role, and
-- `set local role service_role` would additionally lose the SELECT on
-- `public.jobs` these assertions need. So: the claim, and no role switch --
-- the pattern `byok_awaiting_and_drain.sql:377` records.

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'a3000003-0000-4000-8000-000000000003'),
  0,
  'the drain account has spent nothing yet'
);

select is(
  (select public.claim_entry_interpretation_job(
     'a3100001-0000-4000-8000-000000000001',
     'a3000003-0000-4000-8000-000000000003',
     'pgtap-2h3-worker', 120) ->> 'status'),
  'running',
  'a first claim succeeds'
);

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'a3000003-0000-4000-8000-000000000003'
     and bucket = 'ai' and outcome = 'admitted'),
  1,
  'V-5: background provider work consumed the OWNING user''s AI slot'
);

-- The retry. The job is put back to `failed` with its attempt already spent,
-- which is exactly the state a bounded automatic retry arrives in.
update public.jobs
set status = 'failed', attempts = 1, next_attempt_at = now() - interval '1 minute',
    lease_expires_at = null, locked_by = null
where id = 'a3100001-0000-4000-8000-000000000001';

select is(
  (select public.claim_entry_interpretation_job(
     'a3100001-0000-4000-8000-000000000001',
     'a3000003-0000-4000-8000-000000000003',
     'pgtap-2h3-worker', 120) ->> 'status'),
  'running',
  'the automatic retry is claimed'
);

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'a3000003-0000-4000-8000-000000000003'
     and bucket = 'ai' and outcome = 'admitted'),
  1,
  'V-4: and it consumed NOTHING -- a bounded automatic retry is not a new operation'
);

-- Fill the drain account to its signed ceiling and prove the refusal shape.
-- Sixty rows, because this path reads the signed runtime parameter rather than
-- taking a ceiling as an argument: its signature cannot be extended (ADR-057),
-- which is precisely why the parameter table exists.
insert into public.rate_limit_events (user_id, bucket, outcome, consumed_at)
select 'a3000003-0000-4000-8000-000000000003', 'ai', 'admitted', now() - interval '5 minutes'
from generate_series(1, 60);

select ok(
  public.claim_entry_interpretation_job(
    'a3100002-0000-4000-8000-000000000002',
    'a3000003-0000-4000-8000-000000000003',
    'pgtap-2h3-worker', 120) is null,
  'V-5: at the signed ceiling, a first claim is refused -- and returns null, the shape the deployed worker already handles'
);

select is(
  (select attempts from public.jobs where id = 'a3100002-0000-4000-8000-000000000002'),
  0,
  'the refused job burned NO attempt -- an owner at their ceiling loses no retries to it'
);

select is(
  (select status from public.jobs where id = 'a3100002-0000-4000-8000-000000000002'),
  'pending',
  'and it is still claimable once the window rolls'
);

select is(
  (select count(*)::int from public.rate_limit_events
   where user_id = 'a3000003-0000-4000-8000-000000000003'
     and bucket = 'ai' and outcome = 'refused'),
  1,
  '2H-RATE-003: the drain refusal is recorded too, so a queue that stops moving says why'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- the vocabulary and the scope boundary (8)
-- ---------------------------------------------------------------------------

select ok(
  pg_catalog.pg_get_constraintdef(oid) like '%rate_limit_refused%',
  '2H-RATE-003: product_events admits the refusal event'
) from pg_catalog.pg_constraint
where conname = 'product_events_event_name_check' and conrelid = 'public.product_events'::regclass;

select ok(
  pg_catalog.pg_get_constraintdef(oid) like '%capture_save_failed%',
  'and still admits every event it admitted before'
) from pg_catalog.pg_constraint
where conname = 'product_events_event_name_check' and conrelid = 'public.product_events'::regclass;

select lives_ok(
  $$select private.validate_product_event_properties(
      'rate_limit_refused',
      '{"operation":"ai","failureKind":"rate_limited"}'::jsonb)$$,
  'the declared payload validates'
);

select throws_ok(
  $$select private.validate_product_event_properties(
      'rate_limit_refused',
      '{"operation":"ai","failureKind":"quota"}'::jsonb)$$,
  '22023',
  'Invalid product event property',
  'and SH.6''s quota literal does NOT -- the two controls keep separate names'
);

select throws_ok(
  $$select private.validate_product_event_properties(
      'rate_limit_refused',
      '{"operation":"chat","failureKind":"rate_limited"}'::jsonb)$$,
  '22023',
  'Invalid product event property',
  'an operation outside the two signed buckets is refused'
);

select throws_ok(
  $$select private.validate_product_event_properties(
      'rate_limit_refused',
      '{"operation":"ai","failureKind":"rate_limited","note":"anything"}'::jsonb)$$,
  '22023',
  'Unsupported product event property',
  'and no extra property may ride along -- the event carries no free text'
);

select is(
  (select count(*)::int
   from information_schema.columns
   where table_schema = 'public' and table_name = 'rate_limit_events'
     and (column_name ilike '%cost%' or column_name ilike '%usd%'
          or column_name ilike '%spend%' or column_name ilike '%price%'
          or column_name ilike '%token%')),
  0,
  '2H-RATE-006: the limiter carries no spend semantics -- it bounds rate, not money'
);

select is(
  (select count(*)::int
   from information_schema.columns
   where table_schema = 'public' and table_name = 'rate_limit_events'),
  5,
  'and exactly five columns: id, owner, bucket, outcome, time -- nothing to leak'
);

select * from finish();
rollback;
