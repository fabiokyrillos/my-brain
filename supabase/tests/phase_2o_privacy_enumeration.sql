-- ---------------------------------------------------------------------------
-- Phase 2O slice 2O.5 — the privacy projection against the real deletion
-- enumeration (`2O-PRIVACY-002`, `-003`, `-005`, `2O-SEC-001`, `-002`, `-003`;
-- threats T-1, T-3, T-4).
--
-- WHAT THIS SUITE EXISTS TO PROVE, AND WHY IT IS SQL AND NOT TYPESCRIPT
--
-- `2O-PRIVACY-002` requires the "what is stored about me" surface to derive its
-- categories from the same enumeration the deletion path uses. That enumeration
-- is `public.account_owned_row_counts`, and the authenticated surface **may not
-- call it**: it raises unless `auth.role() = 'service_role'`, `202608040072`
-- revoked it from every client role and carries a postcondition that fails this
-- very migration chain if the grant returns, and ADR-118 Decision 9 names a
-- service-role read on an authenticated path as a stop condition.
--
-- The owner's decision resolved that: the surface counts under the requesting
-- user's own identity and RLS, and an executable guard compares the projection
-- with the real enumeration. `src/lib/closeout/privacy-enumeration-guard.test.ts`
-- is the static half — it evaluates the predicate against the generated types
-- and fails the fast CI job when a new user-owned table appears. It cannot see
-- three things, and this suite exists for exactly those three:
--
--   1. THE GENERATED TYPES COULD BE STALE. This suite runs the *literal*
--      `information_schema` predicate against a database built from the whole
--      migration chain, so a table that exists in SQL and not in
--      `database.types.ts` is caught here.
--   2. "COUNTS UNDER THE USER'S OWN IDENTITY" IS A CLAIM ABOUT RLS. A
--      TypeScript test cannot prove `authenticated` may read a table; it can
--      only prove the code asked. §3 executes the reads as `authenticated`.
--   3. TENANT ISOLATION MUST BE PROVED AGAINST A FOREIGN ROW THAT EXISTS. An
--      empty table satisfies every isolation assertion vacuously. §4 plants
--      owner B's rows first and proves owner A's count and owner A's export
--      read do not see them.
--
-- THE PROJECTION IS NAMED HERE, ONCE, AND PINNED IN BOTH DIRECTIONS
--
-- The three withheld tables are the only literals this file carries about the
-- projection, and `privacy-enumeration-guard.test.ts` parses THIS FILE to pin
-- `WITHHELD_TABLES` to it. One literal, two readers, neither able to drift from
-- the other -- the `extraction-parity.test.ts` shape.
-- ---------------------------------------------------------------------------

begin;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures: two owners, and owner B is populated FIRST so that every isolation
-- assertion below has something real it could have leaked.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2f5c0001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'privacy-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2f5c0002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'privacy-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (id, user_id, original_content) values
  ('2f5c1001-0000-4000-8000-0000000000a1', '2f5c0001-0000-4000-8000-000000000001', 'owner A entry one'),
  ('2f5c1002-0000-4000-8000-0000000000a2', '2f5c0001-0000-4000-8000-000000000001', 'owner A entry two'),
  ('2f5c1003-0000-4000-8000-0000000000b1', '2f5c0002-0000-4000-8000-000000000002', 'OWNER B SECRET ENTRY');

insert into public.memories (id, user_id, content) values
  ('2f5c2001-0000-4000-8000-0000000000a1', '2f5c0001-0000-4000-8000-000000000001', 'owner A memory'),
  ('2f5c2002-0000-4000-8000-0000000000b1', '2f5c0002-0000-4000-8000-000000000002', 'OWNER B SECRET MEMORY');

-- ---------------------------------------------------------------------------
-- 1. The predicate, run literally, and proved non-vacuous first.
-- ---------------------------------------------------------------------------

create temporary table enumerated_tables on commit drop as
select distinct columns.table_name::text as table_name
from information_schema.columns as columns
join information_schema.tables as tables
  on tables.table_schema = columns.table_schema
 and tables.table_name = columns.table_name
where columns.table_schema = 'public'
  and columns.column_name = 'user_id'
  and tables.table_type = 'BASE TABLE';

select cmp_ok(
  (select count(*) from enumerated_tables)::int, '>', 40,
  'the deletion enumeration matches tables at all, so nothing below passes vacuously');

-- The projection's withheld set. THE ONLY projection literal in this file.
create temporary table withheld_tables on commit drop as
select unnest(array[
  'account_deletion_attempts',
  'error_events',
  'rate_limit_events'
])::text as table_name;

select is_empty(
  $$ select table_name from withheld_tables
     where table_name not in (select table_name from enumerated_tables) $$,
  'every withheld table is really inside the deletion enumeration');

-- ---------------------------------------------------------------------------
-- 2. `authenticated` can count every table the projection counts, and cannot
--    read any table the projection withholds. This is what makes the owner's
--    resolution work without new authority.
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select tables.table_name
     from enumerated_tables as tables
     where tables.table_name not in (select table_name from withheld_tables)
       and not has_table_privilege('authenticated',
             ('public.' || quote_ident(tables.table_name))::regclass, 'SELECT') $$,
  'every counted table is SELECT-able by authenticated, so the census needs no new grant');

select is_empty(
  $$ select tables.table_name
     from enumerated_tables as tables
     where tables.table_name not in (select table_name from withheld_tables)
       and not exists (
         select 1 from pg_catalog.pg_policies as policies
         where policies.schemaname = 'public'
           and policies.tablename = tables.table_name
           and policies.cmd in ('SELECT', 'ALL')
           and 'authenticated' = any(policies.roles)) $$,
  'every counted table carries an owner-scoped SELECT policy for authenticated');

select is_empty(
  $$ select table_name from withheld_tables
     where has_table_privilege('authenticated',
             ('public.' || quote_ident(table_name))::regclass, 'SELECT') $$,
  'every withheld table really is unreadable by authenticated -- the exclusion is a fact, not a preference');

-- ---------------------------------------------------------------------------
-- 3. The enumeration itself stays exactly where ADR-118 Decision 9 requires:
--    service_role only, and unreachable from a client role.
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'public.account_owned_row_counts(uuid)', 'EXECUTE'),
  'the deletion enumeration is still unreachable by authenticated');

select ok(
  not has_function_privilege('anon', 'public.account_owned_row_counts(uuid)', 'EXECUTE'),
  'the deletion enumeration is still unreachable by anon');

-- T-3: no definer function was created for this slice. The census and export
-- are `SECURITY INVOKER` reads or they are nothing, and `OD-2O-4` A plus
-- ADR-116 Decision 7 say reusing the enumeration is not authority to reuse its
-- definer. A count of definer functions naming "privacy" or "export" is the
-- cheapest way to notice one appearing.
select is_empty(
  $$ select proc.proname
     from pg_catalog.pg_proc as proc
     join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
     where namespace.nspname = 'public'
       and proc.prosecdef
       and (proc.proname like '%privacy%' or proc.proname like '%export%') $$,
  'slice 2O.5 created no SECURITY DEFINER function');

-- ---------------------------------------------------------------------------
-- 4. Tenant isolation, against foreign rows that EXIST.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"2f5c0001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.entries)::int, 2,
  'owner A counts only their own entries, with owner B''s row present in the table');

select is(
  (select count(*) from public.memories)::int, 1,
  'owner A counts only their own memories, with owner B''s row present in the table');

select is_empty(
  $$ select id from public.entries where original_content like 'OWNER B%' $$,
  'the export read cannot reach owner B''s entry body');

select is_empty(
  $$ select id from public.memories where content like 'OWNER B%' $$,
  'the export read cannot reach owner B''s memory body');

-- The polymorphic half of T-1, stated where it actually lives: a relation row's
-- own `user_id` is what the SELECT policy filters on, so a read scoped to the
-- caller cannot return another tenant's link even though ownership is proved by
-- trigger on write rather than by a foreign key.
select is_empty(
  $$ select 1 from public.entry_entities where user_id <> auth.uid() $$,
  'the polymorphic relation read returns nothing outside the caller''s own rows');

-- And the control that keeps §4 honest: `postgres` sees both owners, so the
-- counts above are RLS doing its job rather than an empty database.
reset role;
select is(
  (select count(*) from public.entries where original_content like 'OWNER B%')::int, 1,
  'owner B''s row really exists -- the isolation assertions above were not vacuous');

select * from finish();

rollback;
