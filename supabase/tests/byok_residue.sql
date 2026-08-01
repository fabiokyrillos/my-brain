-- BYOK Slice BYOK.6 -- the zero-secret residue verifier, executed.
--
-- `BYOK-DELETE-001`…`006` (the cascade half), `BYOK-QUOTA-004`, and the part of
-- BYOK.6's gate F2 that does not need a deployment.
--
-- WHY THIS IS NOT A LIST OF TABLES
-- ---------------------------------------------------------------------------
-- The obvious verifier names the tables it knows about and asserts they are
-- empty. That verifier is correct on the day it is written and silently wrong
-- the day somebody adds a table -- which is exactly how residue survives a
-- deletion nobody doubted. `byok_credential_store.sql` already asserts the
-- *catalog fact* that both BYOK tables cascade from `auth.users`; a fact about
-- two named tables cannot say anything about a third.
--
-- So the scan below **enumerates `public` at run time**: every base table
-- carrying a `user_id` column is counted, whatever it is called and whenever it
-- arrived. A future table without a cascade fails here, by name, without anybody
-- having remembered to add it.
--
-- That is also the detector the account-deletion work will need. Its requirement
-- is that deletion *"stop rather than force"* when it meets an unknown
-- non-cascading foreign row, and a fixed list cannot tell an unknown row from an
-- absent one.
--
-- THE NEGATIVE CONTROL IS THE POINT
-- ---------------------------------------------------------------------------
-- "Everything is gone" is trivially satisfied by a verifier that deletes too
-- much, and a cascade that reached a second account would be a catastrophe that
-- passes a naive residue test perfectly. So every survivor assertion is paired
-- with a **second account whose identical rows must still be there**, counted in
-- the same statement, after the same delete.
--
-- Written in pure ASCII, following `byok_awaiting_and_drain.sql`.

begin;
select plan(16);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- The scanner
-- ---------------------------------------------------------------------------
--
-- A temporary function rather than a `query_to_xml` expression: `pg_temp` is
-- dropped by the rollback at the end of this file, it needs no privilege the
-- suite does not already have, and it does not depend on the server having been
-- built with libxml. It returns the offenders as text so a failure names the
-- table and the count rather than reporting `false`.

create function pg_temp.byok_residue(p_user uuid)
returns text
language plpgsql
as $residue$
declare
  scanned record;
  survivors bigint;
  offenders text[] := array[]::text[];
begin
  for scanned in
    select columns.table_name
    from information_schema.columns as columns
    join information_schema.tables as tables
      on tables.table_schema = columns.table_schema
     and tables.table_name = columns.table_name
    where columns.table_schema = 'public'
      and columns.column_name = 'user_id'
      and tables.table_type = 'BASE TABLE'
    order by columns.table_name
  loop
    -- A table this cannot scan is itself a finding, not a crash. Every
    -- `user_id` in `public` is a uuid today (all of them reference
    -- `auth.users(id)`), but a future text-typed one would raise here and abort
    -- the whole transaction -- producing "Bad plan, you planned 16 tests but ran
    -- 5", which says nothing about what is wrong. Reported by name instead.
    begin
      execute format('select count(*) from public.%I where user_id = $1', scanned.table_name)
        into survivors
        using p_user;
    exception when others then
      offenders := offenders || (scanned.table_name || '(unscannable)');
      continue;
    end;

    if survivors > 0 then
      offenders := offenders || (scanned.table_name || '(' || survivors || ')');
    end if;
  end loop;

  return array_to_string(offenders, ', ');
end;
$residue$;

-- ---------------------------------------------------------------------------
-- Fixtures -- two accounts, populated identically
-- ---------------------------------------------------------------------------
--
-- `doomed` is deleted. `bystander` is not, and every assertion about the first
-- is paired with the same count for the second.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d8000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'residue-doomed@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d8000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'residue-bystander@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- The credential itself, with real-shaped ciphertext so "no ciphertext remains"
-- is a claim about bytes that existed rather than about a null that always was.
insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  ('d8000001-0000-4000-8000-000000000001', 'active',
   '\xdd01020304050607080910111213141516'::bytea,
   '\xdd0102030405060708091011'::bytea, 1, 'sk-proj:dddddd', now()),
  ('d8000002-0000-4000-8000-000000000002', 'active',
   '\xee01020304050607080910111213141516'::bytea,
   '\xee0102030405060708091011'::bytea, 1, 'sk-proj:eeeeee', now());

-- The throttle rows, including an `ip_hash`, which is the other value BYOK
-- stores that is derived from something sensitive.
insert into public.credential_validation_attempts (user_id, outcome, ip_hash)
values
  ('d8000001-0000-4000-8000-000000000001', 'succeeded', repeat('a', 64)),
  ('d8000001-0000-4000-8000-000000000001', 'invalid_key', repeat('a', 64)),
  ('d8000002-0000-4000-8000-000000000002', 'succeeded', repeat('b', 64));

-- Owned domain rows, so the scan has something to find beyond the two BYOK
-- tables and the "nothing survives" claim is not vacuous.
insert into public.entries (id, user_id, original_content, source, status, locale)
values
  ('d8200001-0000-4000-8000-000000000001', 'd8000001-0000-4000-8000-000000000001',
   'entrada da conta que sera apagada', 'web', 'saved', 'pt-BR'),
  ('d8200002-0000-4000-8000-000000000002', 'd8000002-0000-4000-8000-000000000002',
   'entrada da conta que permanece', 'web', 'saved', 'pt-BR');

insert into public.jobs (id, user_id, type, payload, idempotency_key)
values
  ('d8100001-0000-4000-8000-000000000001', 'd8000001-0000-4000-8000-000000000001',
   'interpret_entry',
   jsonb_build_object('entry_id', 'd8200001-0000-4000-8000-000000000001', 'mode', 'initial'),
   'byok6-residue-doomed'),
  ('d8100002-0000-4000-8000-000000000002', 'd8000002-0000-4000-8000-000000000002',
   'interpret_entry',
   jsonb_build_object('entry_id', 'd8200002-0000-4000-8000-000000000002', 'mode', 'initial'),
   'byok6-residue-bystander');

-- ---------------------------------------------------------------------------
-- Section 1 -- the scanner sees something before it sees nothing (5)
-- ---------------------------------------------------------------------------
--
-- Every assertion after the delete is worthless if the scanner cannot find a row
-- it should. These five are the calibration.

select isnt(
  pg_temp.byok_residue('d8000001-0000-4000-8000-000000000001'),
  '',
  'the scanner finds rows for a live account, so its silence later means something'
);

select ok(
  pg_temp.byok_residue('d8000001-0000-4000-8000-000000000001') like '%user_ai_credentials%',
  'the scanner reaches the credential table'
);
select ok(
  pg_temp.byok_residue('d8000001-0000-4000-8000-000000000001') like '%credential_validation_attempts%',
  'the scanner reaches the validation-attempt table'
);
select ok(
  pg_temp.byok_residue('d8000001-0000-4000-8000-000000000001') like '%jobs%',
  'the scanner reaches the job queue'
);

-- And it enumerates rather than hardcodes: the count of `public` base tables
-- carrying a `user_id` is well past the handful this file inserts into, so the
-- sweep is over the schema and not over a list.
select cmp_ok(
  (
    select count(*)::int
    from information_schema.columns as columns
    join information_schema.tables as tables
      on tables.table_schema = columns.table_schema
     and tables.table_name = columns.table_name
    where columns.table_schema = 'public'
      and columns.column_name = 'user_id'
      and tables.table_type = 'BASE TABLE'
  ),
  '>=',
  20,
  'the sweep covers every owned table in public, not a list somebody maintains'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- deletion is not blocked (2)
-- ---------------------------------------------------------------------------
--
-- If any owned table ever gains a `RESTRICT` or `NO ACTION` foreign key, this is
-- where it surfaces -- as a failed delete naming the constraint, rather than as
-- a support ticket. That is the same signal the account-deletion path will need.

select lives_ok(
  $$ delete from auth.users where id = 'd8000001-0000-4000-8000-000000000001' $$,
  'deleting the account is not blocked by any owned row'
);

select is(
  (select count(*)::int from auth.users where id = 'd8000001-0000-4000-8000-000000000001'),
  0,
  'the account itself is gone'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- zero survivors, anywhere (5)
-- ---------------------------------------------------------------------------

select is(
  pg_temp.byok_residue('d8000001-0000-4000-8000-000000000001'),
  '',
  'gate F2: no table in public retains a row for the deleted account'
);

-- The three that matter most, named individually as well -- so a failure reads
-- as "the credential survived" rather than only as a table list.
select is(
  (
    select count(*)::int from public.user_ai_credentials
    where user_id = 'd8000001-0000-4000-8000-000000000001'
  ),
  0,
  'no credential row survives'
);
select is(
  (
    select count(*)::int from public.credential_validation_attempts
    where user_id = 'd8000001-0000-4000-8000-000000000001'
  ),
  0,
  'no validation attempt survives, so no ip_hash does either'
);
select is(
  (
    select count(*)::int from public.jobs
    where user_id = 'd8000001-0000-4000-8000-000000000001'
  ),
  0,
  'no queued job survives to be claimed on behalf of an account that is gone'
);

-- Ciphertext, asked as a question about bytes rather than about rows: a row
-- that survived with its material nulled would still be residue, and a table
-- scan for the exact fixture bytes catches a copy anywhere in the column.
select is(
  (
    select count(*)::int from public.user_ai_credentials
    where ciphertext = '\xdd01020304050607080910111213141516'::bytea
       or iv = '\xdd0102030405060708091011'::bytea
  ),
  0,
  'the deleted account''s ciphertext and IV exist nowhere in the credential table'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the negative control (4)
-- ---------------------------------------------------------------------------
--
-- A cascade that reached the wrong account would satisfy every assertion above
-- perfectly. These four are what make the section above mean "the right rows
-- went" rather than "rows went".

select isnt(
  pg_temp.byok_residue('d8000002-0000-4000-8000-000000000002'),
  '',
  'the bystander account still has rows -- the delete was scoped'
);
select is(
  (
    select count(*)::int from public.user_ai_credentials
    where user_id = 'd8000002-0000-4000-8000-000000000002' and status = 'active'
  ),
  1,
  'the bystander''s credential is untouched and still active'
);
select is(
  (
    select count(*)::int from public.credential_validation_attempts
    where user_id = 'd8000002-0000-4000-8000-000000000002'
  ),
  1,
  'the bystander''s validation history is untouched'
);
select is(
  (
    select encode(ciphertext, 'hex') from public.user_ai_credentials
    where user_id = 'd8000002-0000-4000-8000-000000000002'
  ),
  'ee01020304050607080910111213141516',
  'the bystander''s ciphertext is byte-for-byte what it was'
);

select * from finish();
rollback;
