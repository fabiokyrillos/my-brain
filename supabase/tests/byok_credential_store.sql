-- BYOK Slice BYOK.1 — the credential store, migration 202608010065.
--
-- Acceptance gates A1 and A2 of the implementation plan, plus the schema shape
-- BYOK-SCHEMA-001..007 declares.
--
-- WHY THE POSITIVE CONTROLS COME FIRST, EVERYWHERE
-- ---------------------------------------------------------------------------
-- A denial test is the easiest thing in this repository to fake. `insert into
-- public.user_ai_credentials` failing proves nothing on its own -- it fails just
-- as readily if the fixture user does not exist, if a CHECK rejected the row for
-- an unrelated reason, or if the table was never created. So every section that
-- asserts a refusal first asserts the corresponding success, with the smallest
-- possible difference between the two statements. Where the difference is one
-- column, that column is the only thing the refusal can be about.
--
-- Written in pure ASCII, following `phase_2e_task_command_matching.sql`.

begin;
select plan(58);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
--
-- Two owners. Every cross-owner assertion below needs a foreign row that
-- provably exists, or "the stranger's row is absent" is satisfied by an empty
-- table.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('b7000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'byok-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b7000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'byok-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- ---------------------------------------------------------------------------
-- Section 1 -- the schema BYOK-SCHEMA-001/002/007 declares (18)
-- ---------------------------------------------------------------------------

select has_table('public', 'user_ai_credentials', 'the credential table exists');
select has_table('public', 'credential_validation_attempts', 'the attempts table exists');

-- BYOK-SCHEMA-001: a primary key, not a unique index, so "one credential per
-- user" is structural rather than enforced by whoever writes next.
select col_is_pk(
  'public', 'user_ai_credentials', 'user_id',
  'one row per user is the primary key itself'
);

select has_column('public', 'user_ai_credentials', 'provider', 'provider column exists');
select has_column('public', 'user_ai_credentials', 'status', 'status column exists');
select has_column('public', 'user_ai_credentials', 'ciphertext', 'ciphertext column exists');
select has_column('public', 'user_ai_credentials', 'iv', 'iv column exists');
select has_column('public', 'user_ai_credentials', 'key_version', 'key_version column exists');
select has_column('public', 'user_ai_credentials', 'fingerprint', 'fingerprint column exists');
select has_column('public', 'user_ai_credentials', 'validated_at', 'validated_at column exists');
select has_column(
  'public', 'user_ai_credentials', 'last_failure_code', 'last_failure_code column exists'
);

select col_type_is(
  'public', 'user_ai_credentials', 'ciphertext', 'bytea',
  'the sealed value is bytes, never text'
);
select col_type_is('public', 'user_ai_credentials', 'iv', 'bytea', 'the IV is bytes');

-- BYOK-SCHEMA-002, asserted as an absence over the whole column list rather than
-- against a list of names somebody remembered to forbid.
select is(
  (
    select coalesce(string_agg(column_name, ', ' order by column_name), '')
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_ai_credentials'
      and column_name ~ '(plaintext|api_?key|secret|token|raw|clear)'
  ),
  '',
  'no column on the credential table reads like plaintext key material'
);

-- BYOK-SCHEMA-007, as amended by BYOK-SCHEMA-010: the attempts table carries an
-- identity, an outcome and a hashed address -- and nothing that could identify
-- or reconstruct a key.
--
-- **`ip_hash` was added by `202608010067`, and this list moved with it.** The
-- assertion's value is "no key material and no fingerprint", not "exactly these
-- four columns forever"; a slice that legitimately adds a column updates this
-- line in the same commit, deliberately and visibly, exactly as the migration
-- pin and the types-parity check do. What must never appear here is a
-- ciphertext, an IV, a key version, a provider or a fingerprint -- and the next
-- assertion checks that as a property rather than as a spelling, so a future
-- column cannot slip in by editing this list alone.
select is(
  (
    select coalesce(string_agg(column_name, ', ' order by column_name), '')
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'credential_validation_attempts'
  ),
  'attempted_at, id, ip_hash, outcome, user_id',
  'the attempts table holds exactly five columns, none of them key material'
);

-- The property, checked independently of the spelling above. This is the half
-- that survives somebody updating the list without thinking.
select is(
  (
    select coalesce(string_agg(column_name, ', ' order by column_name), '')
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'credential_validation_attempts'
      and column_name in ('ciphertext', 'iv', 'key_version', 'fingerprint', 'provider')
  ),
  '',
  'and none of the credential-bearing column names exists on it, whatever the list above says'
);

select has_index(
  'public', 'credential_validation_attempts', 'credential_validation_attempts_user_time_idx',
  'the throttle has the index its query needs'
);

-- The CHECK inventory, by name, compared in both directions.
--
-- WHY THIS EXISTS RATHER THAN AN ERROR MESSAGE PER REJECTION. Section 6 asserts
-- the SQLSTATE (`23514`) of every refusal but deliberately does **not** assert
-- which constraint produced it, because more than one can be violated by a
-- single statement -- `status = 'expired'` breaks both the closed-set CHECK and
-- the shape CHECK -- and PostgreSQL does not promise which it reports. An
-- assertion resting on that order would be a coin flip that happened to land
-- right in CI once. So the "which constraint" evidence is taken from the catalog
-- here, where it is deterministic, and section 6 proves each rejection
-- behaviourally with a one-column difference from an accepted row.
select is(
  (
    select coalesce(string_agg(constraint_row.conname, ', ' order by constraint_row.conname), '')
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.user_ai_credentials'::regclass
      and constraint_row.contype = 'c'
  ),
  'user_ai_credentials_ciphertext_length_check, '
  || 'user_ai_credentials_fingerprint_check, '
  || 'user_ai_credentials_iv_length_check, '
  || 'user_ai_credentials_key_version_check, '
  || 'user_ai_credentials_last_failure_code_check, '
  || 'user_ai_credentials_provider_check, '
  || 'user_ai_credentials_status_check, '
  || 'user_ai_credentials_status_shape_check',
  'the credential table carries exactly the eight CHECK constraints it declares -- no more, no fewer'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- A1: RLS enabled AND forced on both tables (2)
-- ---------------------------------------------------------------------------
--
-- Both halves matter. `enable` alone leaves the table owner unfiltered, and the
-- owner is `postgres`, which every SECURITY DEFINER function in this database
-- runs as.

select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_catalog.pg_class where oid = 'public.user_ai_credentials'::regclass),
  'credential table RLS is enabled and forced'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_catalog.pg_class where oid = 'public.credential_validation_attempts'::regclass),
  'attempts table RLS is enabled and forced'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- A1: the policy set, compared as a whole (2)
-- ---------------------------------------------------------------------------
--
-- `policies_are` compares in both directions: a policy added and not listed
-- fails, and a listed policy that was dropped fails too. That is what makes the
-- absence of a DELETE policy an asserted fact rather than an unstated one.

select policies_are(
  'public', 'user_ai_credentials',
  array[
    'user_ai_credentials_select_own',
    'user_ai_credentials_insert_own',
    'user_ai_credentials_update_own'
  ],
  'the credential table has exactly three own-row policies and no DELETE policy'
);
select policies_are(
  'public', 'credential_validation_attempts',
  array[
    'credential_validation_attempts_select_own',
    'credential_validation_attempts_insert_own'
  ],
  'the attempts table is append-only: select and insert policies, nothing else'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- A1: the grants, in both directions (10)
-- ---------------------------------------------------------------------------
--
-- The positives first. A suite that only asserted the denials would pass just as
-- well against a table nobody can read, which is a different bug and not a
-- better one.

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.user_ai_credentials', 'select'),
  'authenticated can read its own credential row'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.user_ai_credentials', 'insert'),
  'authenticated can create its credential row'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.user_ai_credentials', 'update'),
  'authenticated can rotate and remove its credential'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.user_ai_credentials', 'delete'),
  'BYOK-SCHEMA-004: authenticated holds NO DELETE on the credential table'
);

select ok(
  pg_catalog.has_table_privilege(
    'authenticated', 'public.credential_validation_attempts', 'select'
  ),
  'authenticated can read its own attempt history'
);
select ok(
  pg_catalog.has_table_privilege(
    'authenticated', 'public.credential_validation_attempts', 'insert'
  ),
  'authenticated can append an attempt'
);
select ok(
  not pg_catalog.has_table_privilege(
    'authenticated', 'public.credential_validation_attempts', 'update'
  ),
  'the attempts table is append-only: no UPDATE grant'
);
select ok(
  not pg_catalog.has_table_privilege(
    'authenticated', 'public.credential_validation_attempts', 'delete'
  ),
  'the attempts table is append-only: no DELETE grant'
);

-- `anon` is checked across every privilege at once rather than one assertion per
-- privilege: what matters is that the set is empty, and naming the offender is
-- more useful than four booleans.
select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where pg_catalog.has_table_privilege('anon', 'public.user_ai_credentials', privilege)
  ),
  'anon holds no privilege of any kind on the credential table'
);
select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where pg_catalog.has_table_privilege('anon', 'public.credential_validation_attempts', privilege)
  ),
  'anon holds no privilege of any kind on the attempts table'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- the cascade is the only way a row disappears (1)
-- ---------------------------------------------------------------------------
--
-- BYOK-SCHEMA-004 says row deletion happens only by `auth.users` cascade. With
-- no DELETE grant anywhere, that claim rests entirely on these two foreign keys
-- existing, cascading, and being validated -- which is a catalog fact, not a
-- comment. `confdeltype = 'c'` is CASCADE; `convalidated` excludes a key added
-- NOT VALID, which would enforce nothing for rows that already exist.

select is(
  (
    select coalesce(string_agg(scanned.table_name, ', ' order by scanned.table_name), '')
    from (values ('user_ai_credentials'), ('credential_validation_attempts')) as scanned(table_name)
    where not exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      join pg_catalog.pg_class relation on relation.oid = constraint_row.conrelid
      where relation.relname::text = scanned.table_name
        and relation.relnamespace = 'public'::regnamespace
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = 'auth.users'::regclass
        and constraint_row.confdeltype = 'c'
        and constraint_row.convalidated
    )
  ),
  '',
  'both tables cascade from auth.users, which is the only path that removes a row'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- A2: the status-consistency CHECK, executed in both directions (13)
-- ---------------------------------------------------------------------------
--
-- Run as the migration owner, before any role switch: these are CHECK
-- constraints, and a refusal caused by RLS instead of by the constraint would
-- prove the wrong thing. Every rejection below differs from an accepted row by
-- exactly one column.

select lives_ok(
  $$ insert into public.user_ai_credentials
       (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
     values ('b7000001-0000-4000-8000-000000000001', 'active',
             '\x0102030405060708090a0b0c0d0e0f1011'::bytea,
             '\x0102030405060708090a0b0c'::bytea,
             1, 'sk-proj:a3f9c1', now()) $$,
  'a complete active credential is accepted -- the control every rejection below is measured against'
);

select throws_ok(
  $$ insert into public.user_ai_credentials
       (user_id, status, iv, key_version, fingerprint, validated_at)
     values ('b7000002-0000-4000-8000-000000000002', 'active',
             '\x0102030405060708090a0b0c'::bytea, 1, 'sk-proj:a3f9c1', now()) $$,
  '23514'::char(5),
  null::text,
  'A2: active without ciphertext is refused by the CHECK'
);

select throws_ok(
  $$ insert into public.user_ai_credentials
       (user_id, status, ciphertext, key_version, fingerprint, validated_at)
     values ('b7000002-0000-4000-8000-000000000002', 'active',
             '\x0102030405060708090a0b0c0d0e0f1011'::bytea, 1, 'sk-proj:a3f9c1', now()) $$,
  '23514'::char(5),
  null::text,
  'A2: active without an IV is refused by the CHECK'
);

select throws_ok(
  $$ insert into public.user_ai_credentials
       (user_id, status, ciphertext, iv, key_version, fingerprint)
     values ('b7000002-0000-4000-8000-000000000002', 'active',
             '\x0102030405060708090a0b0c0d0e0f1011'::bytea,
             '\x0102030405060708090a0b0c'::bytea, 1, 'sk-proj:a3f9c1') $$,
  '23514'::char(5),
  null::text,
  'A2: active without validated_at is refused -- an unvalidated key is never active'
);

select throws_ok(
  $$ insert into public.user_ai_credentials (user_id, status, ciphertext, iv)
     values ('b7000002-0000-4000-8000-000000000002', 'removed',
             '\x0102030405060708090a0b0c0d0e0f1011'::bytea,
             '\x0102030405060708090a0b0c'::bytea) $$,
  '23514'::char(5),
  null::text,
  'A2: removed WITH ciphertext is refused -- removal erases key material, it does not flag it'
);

select lives_ok(
  $$ insert into public.user_ai_credentials (user_id, status, fingerprint)
     values ('b7000002-0000-4000-8000-000000000002', 'removed', 'sk-proj:b4e8d2') $$,
  'A2: removed with the ciphertext and IV nulled is accepted'
);

-- The `invalid` arm is deliberately permissive, and that deliberateness is what
-- is asserted here: a key the provider rejected keeps its ciphertext so a
-- rotation can recognise a re-paste without asking the user to retype it. It is
-- never resolvable -- BYOK-RESOLVER-005 returns rows only for `active`.
select lives_ok(
  $$ update public.user_ai_credentials
     set status = 'invalid',
         ciphertext = '\x0102030405060708090a0b0c0d0e0f1011'::bytea,
         iv = '\x0102030405060708090a0b0c'::bytea,
         last_failure_code = 'invalid_key'
     where user_id = 'b7000002-0000-4000-8000-000000000002' $$,
  'A2: invalid retains its ciphertext, which is what makes re-paste detection possible'
);

select throws_ok(
  $$ update public.user_ai_credentials set status = 'expired'
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '23514'::char(5),
  null::text,
  'BYOK-SCHEMA-003: a status outside the closed set is refused'
);

select throws_ok(
  $$ update public.user_ai_credentials set last_failure_code = 'Rate limit exceeded for gpt-4'
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '23514'::char(5),
  null::text,
  'BYOK-SCHEMA-006: a provider message cannot land in last_failure_code'
);

select throws_ok(
  $$ update public.user_ai_credentials set iv = '\x0102030405'::bytea
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '23514'::char(5),
  null::text,
  'BYOK-CRYPTO-002: an IV that is not 96 bits could not have come from the crypto core'
);

select throws_ok(
  $$ update public.user_ai_credentials set fingerprint = 'sk-openai:a3f9c1'
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '23514'::char(5),
  null::text,
  'BYOK-FINGERPRINT-004: the prefix vocabulary is closed in the database, not only in code'
);

select throws_ok(
  $$ update public.user_ai_credentials set fingerprint = 'sk-proj:1234567890abcdef'
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '23514'::char(5),
  null::text,
  'BYOK-FINGERPRINT-003: a longer digest is refused, so no key substring can be smuggled in'
);

select throws_ok(
  $$ update public.user_ai_credentials set key_version = 0
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '23514'::char(5),
  null::text,
  'BYOK-MASTER-009: version zero is not a version'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- updated_at is the database's job (1)
-- ---------------------------------------------------------------------------
--
-- `now()` is the transaction timestamp and is constant inside this transaction,
-- so the row is planted with an explicitly old value and the trigger's own write
-- is what moves it. A rotation that forgot to set `updated_at` would otherwise
-- leave Settings reporting a stale time for a credential that just changed.

update public.user_ai_credentials
set updated_at = 'epoch'::timestamptz
where user_id = 'b7000001-0000-4000-8000-000000000001';

select is(
  (select updated_at from public.user_ai_credentials
    where user_id = 'b7000001-0000-4000-8000-000000000001'),
  now(),
  'the touch trigger maintains updated_at even when the writer planted an old one'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- A1 behaviourally, as the real client role (9)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b7000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.user_ai_credentials
    where user_id = 'b7000001-0000-4000-8000-000000000001'),
  1,
  'the owner reads its own credential row'
);

-- Non-vacuous: the stranger's row provably exists -- section 6 inserted it as
-- the migration owner -- and is provably absent from this caller's view.
select is(
  (select count(*)::integer from public.user_ai_credentials
    where user_id = 'b7000002-0000-4000-8000-000000000002'),
  0,
  'and the stranger row, which exists, is absent from the owner reads'
);

select lives_ok(
  $$ update public.user_ai_credentials set last_failure_code = 'rate_limited'
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  'the owner can update its own row -- the control for the refusals below'
);

-- The cross-owner UPDATE is refused by the policy rather than by a privilege, so
-- it affects zero rows instead of raising. Asserted as a count for exactly that
-- reason: `lives_ok` here would be true and meaningless.
update public.user_ai_credentials set last_failure_code = 'revoked'
where user_id = 'b7000002-0000-4000-8000-000000000002';

reset role;
select is(
  (select last_failure_code from public.user_ai_credentials
    where user_id = 'b7000002-0000-4000-8000-000000000002'),
  'invalid_key',
  'a cross-owner UPDATE changed nothing: RLS scoped it to zero rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b7000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$ delete from public.user_ai_credentials
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '42501'::char(5),
  'permission denied for table user_ai_credentials'::text,
  'A1: a client DELETE on its OWN row is refused -- by the missing privilege, not by RLS'
);

select throws_ok(
  $$ insert into public.user_ai_credentials (user_id, status)
     values ('b7000002-0000-4000-8000-000000000002', 'invalid') $$,
  '42501'::char(5),
  null::text,
  'a client cannot create a credential row for another user'
);

select lives_ok(
  $$ insert into public.credential_validation_attempts (user_id, outcome)
     values ('b7000001-0000-4000-8000-000000000001', 'invalid_key') $$,
  'the owner can append its own validation attempt'
);

select throws_ok(
  $$ update public.credential_validation_attempts set outcome = 'succeeded'
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '42501'::char(5),
  'permission denied for table credential_validation_attempts'::text,
  'an appended attempt cannot be edited: evidence that can be rewritten is not evidence'
);

select throws_ok(
  $$ delete from public.credential_validation_attempts
     where user_id = 'b7000001-0000-4000-8000-000000000001' $$,
  '42501'::char(5),
  'permission denied for table credential_validation_attempts'::text,
  'and it cannot be deleted either'
);

-- ---------------------------------------------------------------------------
-- Section 9 -- anon reaches nothing, after a positive control (2)
-- ---------------------------------------------------------------------------
--
-- The control is the authenticated read in section 8: the same table, the same
-- transaction, a role that can see one row. What changes below is only the role.

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.user_ai_credentials $$,
  '42501'::char(5),
  'permission denied for table user_ai_credentials'::text,
  'anon cannot read the credential table at all'
);

select throws_ok(
  $$ select count(*) from public.credential_validation_attempts $$,
  '42501'::char(5),
  'permission denied for table credential_validation_attempts'::text,
  'anon cannot read the attempts table at all'
);

reset role;
select * from finish();
rollback;
