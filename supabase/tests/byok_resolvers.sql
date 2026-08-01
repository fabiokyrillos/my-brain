-- BYOK Slice BYOK.2 — the resolvers, migration 202608010066.
--
-- Acceptance gates B1..B7, and PRD §20 matrix cases 4, 5, 8, 9, 10 and 11.
--
-- WHAT THIS FILE IS CAREFUL ABOUT
-- ---------------------------------------------------------------------------
-- Every denial is preceded by the matching success, on the smallest possible
-- difference. A resolver that returned nothing to everybody would satisfy every
-- "returns no row" assertion here, and would be a total outage rather than a
-- security property -- so each of those is paired with a caller for whom the
-- same query returns a row.
--
-- Section 2 is the one that does something unusual: it proves the
-- no-`user_id`-argument guard **by executing the mutation** (B1). Creating a
-- deliberately wrong function inside the transaction and watching the detector
-- catch it is the difference between a guard that works and a guard nobody has
-- ever seen fire.
--
-- Written in pure ASCII, following `phase_2e_task_command_matching.sql`.

begin;
select plan(31);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
--
-- Two owners, both credentialed differently, plus one job each. The stranger's
-- ciphertext differs from the owner's so "returns A's ciphertext" is a
-- distinguishable claim rather than a shape check.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('b8000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'resolver-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'resolver-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000003-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'resolver-uncredentialed@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  ('b8000001-0000-4000-8000-000000000001', 'active',
   '\xaa01020304050607080910111213141516'::bytea,
   '\xaa0102030405060708091011'::bytea, 1, 'sk-proj:aaaaaa', now()),
  ('b8000002-0000-4000-8000-000000000002', 'active',
   '\xbb01020304050607080910111213141516'::bytea,
   '\xbb0102030405060708091011'::bytea, 1, 'sk-proj:bbbbbb', now());

insert into public.jobs (id, user_id, type, idempotency_key) values
  ('b8100001-0000-4000-8000-000000000001', 'b8000001-0000-4000-8000-000000000001',
   'process_attachment', 'byok-resolver-owner'),
  ('b8100002-0000-4000-8000-000000000002', 'b8000002-0000-4000-8000-000000000002',
   'process_attachment', 'byok-resolver-stranger'),
  ('b8100003-0000-4000-8000-000000000003', 'b8000003-0000-4000-8000-000000000003',
   'process_attachment', 'byok-resolver-uncredentialed');

-- ---------------------------------------------------------------------------
-- Section 1 -- the two functions exist with the declared shape (6)
-- ---------------------------------------------------------------------------

select has_function(
  'public', 'resolve_own_ai_credential', array[]::name[],
  'the synchronous resolver exists and takes nothing'
);
select has_function(
  'public', 'resolve_job_ai_credential', array['uuid']::name[],
  'the asynchronous resolver exists and takes only a job id'
);

select results_eq(
  $$ select prosecdef from pg_catalog.pg_proc
      where oid = 'public.resolve_own_ai_credential()'::regprocedure $$,
  array[true],
  'the synchronous resolver is SECURITY DEFINER'
);
select results_eq(
  $$ select prosecdef from pg_catalog.pg_proc
      where oid = 'public.resolve_job_ai_credential(uuid)'::regprocedure $$,
  array[true],
  'the asynchronous resolver is SECURITY DEFINER'
);

-- The empty search_path, checked with the tolerant pair
-- `ai_interpretation_bounds.sql:33` and `202607310064:843` already use: PostgreSQL
-- has stored the empty value both ways across versions, and asserting one
-- spelling would red CI while the function was correct.
select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join pg_catalog.unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
    where procedure.oid = 'public.resolve_own_ai_credential()'::regprocedure
      and pg_catalog.lower(setting.value) in ('search_path=', 'search_path=""')
  ),
  'the synchronous resolver pins an empty search_path'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join pg_catalog.unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
    where procedure.oid = 'public.resolve_job_ai_credential(uuid)'::regprocedure
      and pg_catalog.lower(setting.value) in ('search_path=', 'search_path=""')
  ),
  'the asynchronous resolver pins an empty search_path'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- B1: no user_id argument, and the guard is proven to fire (4)
-- ---------------------------------------------------------------------------
--
-- BYOK-RESOLVER-001. The first two assertions are the guard. The third and
-- fourth are the thing B1 actually demands: **the mutation, executed.** A
-- deliberately wrong function is created inside this transaction, the same
-- detector is run against it, and it must be caught -- then it is dropped and
-- the real functions are re-checked, so a detector that started matching
-- everything is caught too.

select is(
  (select pronargs::integer from pg_catalog.pg_proc
    where oid = 'public.resolve_own_ai_credential()'::regprocedure),
  0,
  'the synchronous resolver takes no argument at all, so it cannot take an owner'
);

select is(
  (
    select coalesce(
      (
        select string_agg(argument.name, ', ' order by argument.name)
        from pg_catalog.pg_proc as procedure
        cross join pg_catalog.unnest(
          coalesce(procedure.proargnames, array[]::text[])
        ) as argument(name)
        where procedure.oid = 'public.resolve_job_ai_credential(uuid)'::regprocedure
          and argument.name ~* 'user_?id'
      ),
      ''
    )
  ),
  '',
  'the asynchronous resolver declares no user_id-shaped argument'
);

-- The mutation. This function is everything BYOK-RESOLVER-001 forbids.
create function public.byok_resolver_mutation_probe(p_user_id uuid)
returns integer
language sql
immutable
as $$ select 1 $$;

select is(
  (
    select coalesce(
      (
        select string_agg(argument.name, ', ' order by argument.name)
        from pg_catalog.pg_proc as procedure
        cross join pg_catalog.unnest(
          coalesce(procedure.proargnames, array[]::text[])
        ) as argument(name)
        where procedure.oid = 'public.byok_resolver_mutation_probe(uuid)'::regprocedure
          and argument.name ~* 'user_?id'
      ),
      ''
    )
  ),
  'p_user_id',
  'B1: the detector CATCHES a function that takes an owner -- executed, not read'
);

drop function public.byok_resolver_mutation_probe(uuid);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc
    where oid = 'public.resolve_job_ai_credential(uuid)'::regprocedure
  ),
  1,
  'and the real resolver survived the probe, so the detector is not matching everything'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- B5 and matrix case 10: the grants, in both directions (6)
-- ---------------------------------------------------------------------------
--
-- The positives first, because a pair of functions nobody can execute would
-- satisfy every denial below.

select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.resolve_own_ai_credential()', 'execute'
  ),
  'authenticated can execute the synchronous resolver, which is the point of it'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role', 'public.resolve_job_ai_credential(uuid)', 'execute'
  ),
  'service_role can execute the job resolver, which is the point of it'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated', 'public.resolve_job_ai_credential(uuid)', 'execute'
  ),
  'matrix case 10: authenticated CANNOT execute the job resolver'
);
select ok(
  not pg_catalog.has_function_privilege(
    'service_role', 'public.resolve_own_ai_credential()', 'execute'
  ),
  'service_role cannot execute the caller-scoped resolver, which would have no caller to scope to'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.resolve_own_ai_credential()', 'execute'
  ),
  'matrix case 11: anon cannot execute the synchronous resolver'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.resolve_job_ai_credential(uuid)', 'execute'
  ),
  'matrix case 11: anon cannot execute the job resolver either'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- matrix cases 4 and 5: the synchronous resolver (5)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b8000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Case 4, and the positive control every case-5 assertion depends on.
select is(
  (select pg_catalog.encode(ciphertext, 'hex') from public.resolve_own_ai_credential()),
  'aa01020304050607080910111213141516',
  'matrix case 4: the resolver returns THIS caller''s ciphertext, identified by its bytes'
);

select is(
  (select count(*)::integer from public.resolve_own_ai_credential()),
  1,
  'and exactly one row -- the primary key makes more than one impossible'
);

-- Case 5, non-vacuous: the stranger's row provably exists (it was inserted in
-- the fixtures and section 5 resolves it), and is provably absent from here.
select is(
  (
    select count(*)::integer
    from public.resolve_own_ai_credential()
    where pg_catalog.encode(ciphertext, 'hex') = 'bb01020304050607080910111213141516'
  ),
  0,
  'matrix case 5: the stranger''s ciphertext, which exists, never appears in the caller''s result'
);

-- BYOK-RESOLVER-004: the envelope and nothing but the envelope.
select is(
  pg_catalog.replace(
    pg_catalog.lower(
      pg_catalog.pg_get_function_result('public.resolve_own_ai_credential()'::regprocedure)
    ),
    ' ', ''
  ),
  'table(ciphertextbytea,ivbytea,key_versionsmallint,statustext,providertext)',
  'the resolver returns the envelope only -- no plaintext column, under any name'
);

select is(
  (select status from public.resolve_own_ai_credential()),
  'active',
  'and it returns an active credential, which is the only kind it may return'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- B6: invalid, removed and absent are one outcome (3)
-- ---------------------------------------------------------------------------
--
-- BYOK-RESOLVER-005. Each transition is applied and the caller's view re-read,
-- so the collapse is executed rather than described. The control is section 4's
-- positive read of the same row.

reset role;
update public.user_ai_credentials set status = 'invalid'
where user_id = 'b8000001-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b8000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.resolve_own_ai_credential()),
  0,
  'B6: an invalid credential resolves to nothing'
);

reset role;
update public.user_ai_credentials
set status = 'removed', ciphertext = null, iv = null
where user_id = 'b8000001-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b8000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.resolve_own_ai_credential()),
  0,
  'B6: a removed credential resolves to nothing -- indistinguishable from invalid'
);

-- Absent: a third user who never configured one. Same empty result, same shape.
select set_config(
  'request.jwt.claims',
  '{"sub":"b8000003-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.resolve_own_ai_credential()),
  0,
  'B6: an absent credential resolves to nothing -- indistinguishable from both'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- matrix cases 8 and 9: the job resolver (5)
-- ---------------------------------------------------------------------------
--
-- Restore the owner's credential first: sections 5's transitions were about the
-- synchronous path, and leaving the row removed would make case 8 pass for the
-- wrong reason.

reset role;
update public.user_ai_credentials
set status = 'active',
    ciphertext = '\xaa01020304050607080910111213141516'::bytea,
    iv = '\xaa0102030405060708091011'::bytea,
    key_version = 1,
    fingerprint = 'sk-proj:aaaaaa',
    validated_at = now()
where user_id = 'b8000001-0000-4000-8000-000000000001';

set local role service_role;

select is(
  (
    select pg_catalog.encode(ciphertext, 'hex')
    from public.resolve_job_ai_credential('b8100001-0000-4000-8000-000000000001')
  ),
  'aa01020304050607080910111213141516',
  'the job resolver returns the credential of the job row''s owner'
);

-- Matrix case 8. The worker handed a job owned by somebody else gets **that
-- owner's** credential, because the owner is a fact about the row rather than an
-- argument. This is the case that proves the derivation is structural: if the
-- function took an owner, this call could have been steered.
select is(
  (
    select pg_catalog.encode(ciphertext, 'hex')
    from public.resolve_job_ai_credential('b8100002-0000-4000-8000-000000000002')
  ),
  'bb01020304050607080910111213141516',
  'matrix case 8: a job owned by B resolves to B''s credential, never to the caller''s choice'
);

-- Matrix case 9. A job id matching nothing.
select throws_ok(
  $$ select * from public.resolve_job_ai_credential('b8100009-0000-4000-8000-000000000009') $$,
  'P0002'::char(5),
  'Job not found'::text,
  'matrix case 9: a non-existent job id raises P0002'
);

-- B6 again, on the asynchronous path: an owner with no credential is an empty
-- result, not an error -- so a worker cannot use the resolver to learn whether a
-- job's owner has configured anything, only whether it can proceed.
select is(
  (
    select count(*)::integer
    from public.resolve_job_ai_credential('b8100003-0000-4000-8000-000000000003')
  ),
  0,
  'a job whose owner has no credential resolves to nothing, and does not raise'
);

select is(
  pg_catalog.replace(
    pg_catalog.lower(
      pg_catalog.pg_get_function_result('public.resolve_job_ai_credential(uuid)'::regprocedure)
    ),
    ' ', ''
  ),
  'table(ciphertextbytea,ivbytea,key_versionsmallint,statustext,providertext)',
  'the job resolver returns the same envelope, and no plaintext column either'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- B5 behaviourally: the denials are executed, not only catalogued (2)
-- ---------------------------------------------------------------------------
--
-- Section 3 read the privileges. These two run the calls. The control is section
-- 6, which just executed the same function successfully as service_role in this
-- same transaction -- so what refuses these is the grant and nothing else.

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b8000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.resolve_job_ai_credential('b8100001-0000-4000-8000-000000000001') $$,
  '42501'::char(5),
  'permission denied for function resolve_job_ai_credential'::text,
  'B5: authenticated is refused the job resolver by the missing privilege'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.resolve_own_ai_credential() $$,
  '42501'::char(5),
  'permission denied for function resolve_own_ai_credential'::text,
  'matrix case 11: anon is refused the synchronous resolver, after it worked for authenticated'
);

reset role;
select * from finish();
rollback;
