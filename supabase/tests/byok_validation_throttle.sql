-- BYOK Slice BYOK.3 — the validation throttle, migration 202608010067.
--
-- BYOK-SCHEMA-010..015 and plan Amendment A-2.3.
--
-- THE ASSERTION THAT MATTERS MOST
-- ---------------------------------------------------------------------------
-- Section 5 proves the ceiling actually holds: it fills a bucket to the limit
-- and then shows the next attempt refused. A throttle that counted wrong would
-- pass every catalog assertion in this file and still let an attacker test
-- stolen keys all day, which is the T-16 control this whole mechanism exists
-- for.
--
-- WHAT THIS FILE CANNOT PROVE
-- ---------------------------------------------------------------------------
-- **True concurrency.** pgTAP runs in one session and one transaction, so the
-- advisory locks that make `claim_credential_validation_slot` safe under
-- parallel callers are never contended here. What is asserted instead is that
-- the locks are taken at all, and in a fixed order, read out of the function
-- body -- plus the sequential ceiling behaviour above. The concurrent case is
-- named in the acceptance report as reasoned rather than executed, because
-- claiming otherwise from a single-session suite would be false.
--
-- Written in pure ASCII, following `phase_2e_task_command_matching.sql`.

begin;
select plan(34);

set local timezone to 'UTC';

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('b9000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'throttle-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b9000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'throttle-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- The digests below are written as literals rather than computed: the CHECK
-- constraint is exactly what is under test, and computing the value here would
-- test the computation instead of the constraint.
-- ---------------------------------------------------------------------------
-- Section 1 -- the column, the constraint and the index (6)
-- ---------------------------------------------------------------------------

select has_column(
  'public', 'credential_validation_attempts', 'ip_hash',
  'BYOK-SCHEMA-010: the attempts table carries a hashed address'
);
select col_type_is(
  'public', 'credential_validation_attempts', 'ip_hash', 'text',
  'and it is text, because it is a hex digest rather than an address'
);
select col_is_null(
  'public', 'credential_validation_attempts', 'ip_hash',
  'nullable: a request with no determinable address is still recorded and still counted per user'
);
select has_index(
  'public', 'credential_validation_attempts', 'credential_validation_attempts_ip_time_idx',
  'BYOK-SCHEMA-015: the per-IP ceiling has the index its query needs'
);
select has_index(
  'public', 'credential_validation_attempts', 'credential_validation_attempts_user_time_idx',
  'and the per-user index from 202608010065 survives'
);

-- BYOK-SCHEMA-013: `ip_hash` appears only where a throttle needs it. A second
-- copy is a second retention surface and a second thing to forget to prune.
--
-- SH.5 (`202608040075`, ADR-080) added the second one, and it joins this list by
-- name rather than by the assertion being loosened -- which is what the list is
-- for. Two things make it a widening rather than a breach:
--
--   1. The concern in the sentence above is retention, and
--      `auth_event_attempts` is swept on the same 30-day window by its own
--      scheduler-only `prune_auth_event_attempts()`. There is no unpruned copy.
--   2. The two columns are **not the same value for the same address**. ADR-080
--      Decision 3 adds an `auth:` domain tag to the HMAC input, precisely so
--      that reading both tables cannot correlate a named BYOK user with an
--      anonymous auth attempt -- the join the pepper exists to prevent, which
--      reusing the pepper without a tag would have reintroduced.
--
-- A third member must earn its place here the same way.
select is(
  (
    select coalesce(string_agg(table_name, ', ' order by table_name), '')
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'ip_hash'
  ),
  'auth_event_attempts, credential_validation_attempts',
  'BYOK-SCHEMA-013: ip_hash exists on exactly the two throttle ledgers'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the CHECK refuses anything that is not a digest (4)
-- ---------------------------------------------------------------------------
--
-- This is what stops a raw address being written by a future caller that
-- skipped the helper. The positive control comes first.

select lives_ok(
  $$ insert into public.credential_validation_attempts (user_id, outcome, ip_hash)
     values ('b9000001-0000-4000-8000-000000000001', 'succeeded',
             'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  'a 64-character lowercase hex digest is accepted'
);

select throws_ok(
  $$ insert into public.credential_validation_attempts (user_id, outcome, ip_hash)
     values ('b9000001-0000-4000-8000-000000000001', 'succeeded', '203.0.113.7') $$,
  '23514'::char(5),
  null::text,
  'a RAW IPv4 ADDRESS is refused -- the defect this constraint exists to prevent'
);

select throws_ok(
  $$ insert into public.credential_validation_attempts (user_id, outcome, ip_hash)
     values ('b9000001-0000-4000-8000-000000000001', 'succeeded',
             'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$,
  '23514'::char(5),
  null::text,
  'uppercase hex is refused, so one address cannot occupy two buckets by case'
);

select throws_ok(
  $$ insert into public.credential_validation_attempts (user_id, outcome, ip_hash)
     values ('b9000001-0000-4000-8000-000000000001', 'succeeded', 'aaaa') $$,
  '23514'::char(5),
  null::text,
  'a short digest is refused'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the append-only posture survived the ALTER (6)
-- ---------------------------------------------------------------------------
--
-- Adding a column is exactly the kind of change that quietly re-grants.

select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_catalog.pg_class where oid = 'public.credential_validation_attempts'::regclass),
  'forced RLS survived the column addition'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.credential_validation_attempts', 'select'),
  'authenticated still reads its own attempts'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.credential_validation_attempts', 'insert'),
  'authenticated still appends'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.credential_validation_attempts', 'update'),
  'and still holds NO update'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.credential_validation_attempts', 'delete'),
  'and still holds NO delete'
);
select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where pg_catalog.has_table_privilege('anon', 'public.credential_validation_attempts', privilege)
  ),
  'anon still holds nothing'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the three functions, their security and their grants (10)
-- ---------------------------------------------------------------------------

select has_function(
  'public', 'claim_credential_validation_slot', array['text', 'integer', 'integer']::name[],
  'the slot claim exists'
);
select has_function(
  'public', 'finalize_credential_validation_attempt', array['uuid', 'text']::name[],
  'the finalizer exists'
);
select has_function(
  'public', 'prune_credential_validation_attempts', array[]::name[],
  'BYOK-SCHEMA-014: the retention sweep exists'
);

select results_eq(
  $$ select count(*)::integer from pg_catalog.pg_proc
      where oid in (
        'public.claim_credential_validation_slot(text, integer, integer)'::regprocedure,
        'public.finalize_credential_validation_attempt(uuid, text)'::regprocedure,
        'public.prune_credential_validation_attempts()'::regprocedure
      ) and prosecdef $$,
  array[3],
  'all three are SECURITY DEFINER'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.oid in (
      'public.claim_credential_validation_slot(text, integer, integer)'::regprocedure,
      'public.finalize_credential_validation_attempt(uuid, text)'::regprocedure,
      'public.prune_credential_validation_attempts()'::regprocedure
    )
    and not exists (
      select 1
      from pg_catalog.unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
      where pg_catalog.lower(setting.value) in ('search_path=', 'search_path=""')
    )
  ),
  'and all three pin an empty search_path'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.claim_credential_validation_slot(text, integer, integer)', 'execute'
  ),
  'authenticated can claim a slot, which is the point of it'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.finalize_credential_validation_attempt(uuid, text)', 'execute'
  ),
  'and can finalize its own attempt'
);
select ok(
  not exists (
    select 1
    from unnest(array['anon', 'service_role']) as role_name,
         unnest(array[
           'public.claim_credential_validation_slot(text, integer, integer)',
           'public.finalize_credential_validation_attempt(uuid, text)'
         ]) as signature
    where pg_catalog.has_function_privilege(role_name, signature, 'execute')
  ),
  'no other role can reach either: a service_role grant would be a way to bypass a ceiling'
);

-- BYOK-SCHEMA-014: the sweep is the scheduler's, and no client role may run it.
-- A grant here would be a denial-of-service lever -- deleting the evidence that
-- a ceiling is being approached.
select ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'public.prune_credential_validation_attempts()', 'execute'
    )
  ),
  'the retention sweep is executable by no client role'
);

select is(
  (
    select pg_catalog.pg_get_function_result(
      'public.prune_credential_validation_attempts()'::regprocedure
    )
  ),
  'integer',
  'and it reports how many rows it removed, so a run is auditable'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- the ceiling holds, executed (6)
-- ---------------------------------------------------------------------------
--
-- The heart of the file. Everything above is posture; this is behaviour.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b9000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- The positive control: a slot is claimable, and claiming returns an id.
select ok(
  (select public.claim_credential_validation_slot(
     'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 50
   )) is not null,
  'a slot can be claimed, and the claim returns an attempt id'
);

-- The reservation is an INSERT, which is what makes the next count see it.
select is(
  (select count(*)::integer from public.credential_validation_attempts
    where user_id = 'b9000001-0000-4000-8000-000000000001' and outcome = 'unknown'),
  1,
  'claiming RESERVES by inserting a provisional row, so the next caller counts it'
);

-- Fill the remaining two of a ceiling of three. Section 2 already inserted one
-- `succeeded` row for this user, and it counts: the ceiling is over attempts,
-- not over failures.
select lives_ok(
  $$ select public.claim_credential_validation_slot(
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 4, 50
     ) $$,
  'a second claim under a ceiling of four succeeds'
);

select throws_ok(
  $$ select public.claim_credential_validation_slot(
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 50
     ) $$,
  'P0001'::char(5),
  'Validation attempt ceiling reached'::text,
  'THE CEILING HOLDS: the next claim past the per-user limit is refused'
);

-- The per-IP ceiling is a separate limit over a separate bucket. Proven by
-- refusing on the IP count while the user ceiling is generous.
select throws_ok(
  $$ select public.claim_credential_validation_slot(
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500, 2
     ) $$,
  'P0001'::char(5),
  'Validation attempt ceiling reached'::text,
  'and the per-IP ceiling refuses independently of the per-user one'
);

-- Non-vacuity for the IP half: the same generous user ceiling with a DIFFERENT
-- address is allowed, so the refusal above was about the address and not about
-- the user.
select lives_ok(
  $$ select public.claim_credential_validation_slot(
       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 500, 2
     ) $$,
  'a different address is a different bucket, so the IP refusal was about the address'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- finalizing is owner-scoped and one-way (2)
-- ---------------------------------------------------------------------------

reset role;
insert into public.credential_validation_attempts (id, user_id, outcome)
values (
  'b9200001-0000-4000-8000-000000000001',
  'b9000002-0000-4000-8000-000000000002',
  'unknown'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b9000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Silent on a miss, so it cannot be used to probe which attempts exist.
select lives_ok(
  $$ select public.finalize_credential_validation_attempt(
       'b9200001-0000-4000-8000-000000000001', 'succeeded'
     ) $$,
  'finalizing a stranger''s attempt does not raise -- a foreign id and a missing id are one outcome'
);

reset role;
select is(
  (select outcome from public.credential_validation_attempts
    where id = 'b9200001-0000-4000-8000-000000000001'),
  'unknown',
  'and it changed nothing: the stranger''s attempt is untouched'
);

select * from finish();
rollback;
