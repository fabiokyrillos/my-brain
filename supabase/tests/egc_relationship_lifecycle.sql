-- Entity Graph Completion, Slice EGC.2 -- the lifecycle semantics the write
-- contracts depend on (gates B2, B3, B5, B6, B9, B10; EGC-REL-007,
-- EGC-ASSOC-005/006/007, EGC-DEC-2).
--
-- WHAT THIS FILE PROVES THAT A UNIT TEST CANNOT
-- ---------------------------------------------------------------------------
-- The TypeScript writers are tested against a stub, which proves they *send*
-- the right statements. This file proves the database *accepts* them and means
-- what the contracts assume: that ending a row leaves it in the table, that the
-- partial unique indexes cover live rows only so a re-add succeeds, and that the
-- composite ownership keys make a cross-owner write structurally impossible
-- rather than merely unlikely.
--
-- THE INDEX ASYMMETRY, MEASURED RATHER THAN ASSUMED
-- ---------------------------------------------------------------------------
-- **The PRD is wrong about one table and this suite records the correction.**
-- EGC-REL-007 describes "the partial unique index" as freeing the pair for a
-- later re-add. That is true of `person_contexts` and `person_projects`
-- (`202607160011:1-2`). `person_relationships` has **no unique index of any
-- kind** -- only the plain `(user_id, person_id, valid_until)` index at
-- `202607160009:12`. Section 4 asserts both halves, so the difference is a
-- measured fact rather than a comment, and the application-only duplicate check
-- in `relationships.ts` is justified by evidence.
--
-- Written in pure ASCII, following the doctrine of
-- `phase_2f_task_write_grants.sql`.

begin;
select plan(25);

set local timezone to 'UTC';

-- Fixtures -------------------------------------------------------------------
--
-- Two owners, because gate B6 is a cross-owner claim and a cross-owner claim
-- over one owner is unfalsifiable.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e6c20001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'egc2-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6c20002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'egc2-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.people (id, user_id, name) values
  ('e6c21001-0000-4000-8000-000000000001', 'e6c20001-0000-4000-8000-000000000001', 'Camila'),
  ('e6c21002-0000-4000-8000-000000000002', 'e6c20002-0000-4000-8000-000000000002', 'Stranger person');

insert into public.contexts (id, user_id, name, kind) values
  ('e6c22001-0000-4000-8000-000000000001', 'e6c20001-0000-4000-8000-000000000001', 'Pessoal', 'personal'),
  ('e6c22002-0000-4000-8000-000000000002', 'e6c20002-0000-4000-8000-000000000002', 'Stranger context', 'work');

insert into public.projects (id, user_id, name, status) values
  ('e6c23001-0000-4000-8000-000000000001', 'e6c20001-0000-4000-8000-000000000001', 'Atlas', 'active'),
  ('e6c23002-0000-4000-8000-000000000002', 'e6c20002-0000-4000-8000-000000000002', 'Stranger project', 'active');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e6c20001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ---------------------------------------------------------------------------
-- Section 1 -- gate B9: nothing about the three tables moved (6)
-- ---------------------------------------------------------------------------
--
-- EGC.2 adds no migration, so its central claim is negative. Every absence
-- below is preceded by a presence, because a negative claim is the easiest kind
-- to assert vacuously.

reset role;

select ok(
  not exists (
    select 1
      from unnest(array['person_relationships', 'person_contexts', 'person_projects']) as table_name,
           unnest(array['select', 'insert', 'update', 'delete']) as privilege
     where not pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, privilege)
  ),
  'authenticated still holds all four privileges on all three relationship tables, as 202607160009 granted'
);

select ok(
  not exists (
    select 1
      from unnest(array['person_relationships', 'person_contexts', 'person_projects']) as table_name,
           unnest(array['select', 'insert', 'update', 'delete']) as privilege
     where pg_catalog.has_table_privilege('anon', 'public.' || table_name, privilege)
  ),
  'anon holds no privilege of any kind on any of the three'
);

select is(
  (select count(*)::integer from pg_catalog.pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('person_relationships', 'person_contexts', 'person_projects')
      and relrowsecurity and relforcerowsecurity),
  3,
  'row level security is enabled AND forced on all three, so the owner cannot bypass their own policies'
);

select is(
  (select string_agg(distinct policyname, ', ' order by policyname)
     from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'person_relationships'),
  'person_relationships_delete_own, person_relationships_insert_own, person_relationships_select_own, person_relationships_update_own',
  'person_relationships still carries exactly its four own-row policies, unchanged by EGC.2'
);

-- EGC.2 introduced no privileged boundary either: no RPC, no definer function,
-- no worker path.
--
-- **Matched against all three table names, and paired with a presence control.**
-- The first draft matched `'%person_relationship%'` alone, which would have
-- stayed at zero through the exact violation it claims to guard: a definer
-- named `associate_person_context` or `end_person_project` contains no such
-- substring. And a count of zero proves nothing unless the same query shape can
-- produce a non-zero, which is what the second assertion establishes.
select is(
  (select coalesce(string_agg(procedure.proname, ', ' order by procedure.proname), '')
     from pg_catalog.pg_proc procedure
     join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and (procedure.proname like '%person_relationship%'
        or procedure.proname like '%person_context%'
        or procedure.proname like '%person_project%')),
  '',
  'EGC.2 introduced no SECURITY DEFINER function over any of the three tables -- the write path is plain RLS-scoped DML'
);

select ok(
  (select count(*)::integer
     from pg_catalog.pg_proc procedure
     join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.prosecdef) > 0,
  'while SECURITY DEFINER functions do exist in this schema, so the empty result above is a measurement rather than a query that finds nothing'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e6c20001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ---------------------------------------------------------------------------
-- Section 2 -- gate B2: ending preserves the row (5)
-- ---------------------------------------------------------------------------
--
-- EGC-REL-007 and EGC-DEC-2. "It disappeared from the page" and "it was deleted"
-- look identical from the UI, so the row's survival is asserted directly.

insert into public.person_relationships (id, user_id, person_id, related_person_id, relationship_type, confidence)
values ('e6c24001-0000-4000-8000-000000000001', 'e6c20001-0000-4000-8000-000000000001',
        'e6c21001-0000-4000-8000-000000000001', null, 'spouse', 1);

select is(
  (select count(*)::integer from public.person_relationships
    where person_id = 'e6c21001-0000-4000-8000-000000000001' and valid_until is null),
  1,
  'the relationship is live before it is ended, so the assertions below are not vacuous'
);

-- EGC-REL-001, asserted rather than commented: the null is the schema's way of
-- saying "related to the owner", and it needs no backfill.
select is(
  (select related_person_id from public.person_relationships
    where id = 'e6c24001-0000-4000-8000-000000000001'),
  null,
  'related_person_id is null, which is what related-to-the-owner means in this schema'
);

update public.person_relationships set valid_until = now()
 where id = 'e6c24001-0000-4000-8000-000000000001' and valid_until is null;

select is(
  (select count(*)::integer from public.person_relationships
    where person_id = 'e6c21001-0000-4000-8000-000000000001' and valid_until is null),
  0,
  'ending it removes it from every live-row reader, which is what the page shows'
);

select is(
  (select count(*)::integer from public.person_relationships
    where id = 'e6c24001-0000-4000-8000-000000000001'),
  1,
  'and THE ROW STILL EXISTS -- gate B2. Ending is not deleting, so "we were married until 2019" survives'
);

select isnt(
  (select valid_until from public.person_relationships
    where id = 'e6c24001-0000-4000-8000-000000000001'),
  null,
  'with valid_until set rather than the row removed'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- gates B3 and B5: the association lifecycle (6)
-- ---------------------------------------------------------------------------

-- EVERY INSERT BELOW CARRIES AN EXPLICIT `valid_from`, AND THAT IS LOAD-BEARING.
--
-- These tables carry **two** unique constraints each, not one: the partial
-- `person_contexts_current_idx` over the live pair (`202607160011:2`) and the
-- base `unique (person_id, context_id, valid_from)` declared inline at
-- `202607160009:18`. `valid_from` defaults to `now()`, which is
-- `transaction_timestamp()` -- **constant for this whole file**, since it is one
-- `begin … rollback`.
--
-- Leaving the default would break both assertions below in opposite ways. The
-- duplicate would raise `23505` from the *base* key rather than from the partial
-- index -- passing while proving nothing, and continuing to pass if the partial
-- index were dropped outright. And the re-add after the end would raise `23505`
-- too, failing a `lives_ok` that describes real production behaviour correctly:
-- there, the end and the re-add are separate transactions with different
-- timestamps.
--
-- Distinct timestamps isolate the constraint under test.

insert into public.person_contexts (user_id, person_id, context_id, valid_from, confidence)
values ('e6c20001-0000-4000-8000-000000000001', 'e6c21001-0000-4000-8000-000000000001',
        'e6c22001-0000-4000-8000-000000000001', now() - interval '2 days', 1);

-- Gate B5. With a different `valid_from`, the base key is satisfied and the only
-- constraint that can refuse this is the partial index over the live pair. The
-- application turns it into a sentence before the owner ever sees the code.
select throws_ok(
  $$ insert into public.person_contexts (user_id, person_id, context_id, valid_from, confidence)
     values ('e6c20001-0000-4000-8000-000000000001', 'e6c21001-0000-4000-8000-000000000001',
             'e6c22001-0000-4000-8000-000000000001', now() - interval '1 day', 1) $$,
  '23505',
  null::text,
  'a duplicate LIVE person-context association is refused by person_contexts_current_idx, and by that index specifically -- the base (person_id, context_id, valid_from) key is satisfied here'
);

update public.person_contexts set valid_until = now()
 where person_id = 'e6c21001-0000-4000-8000-000000000001'
   and context_id = 'e6c22001-0000-4000-8000-000000000001'
   and valid_until is null;

-- Gate B3. The index is partial, so ending frees the pair. Without
-- `where valid_until is null` on it, re-adding a context somebody had left would
-- be impossible.
select lives_ok(
  $$ insert into public.person_contexts (user_id, person_id, context_id, valid_from, confidence)
     values ('e6c20001-0000-4000-8000-000000000001', 'e6c21001-0000-4000-8000-000000000001',
             'e6c22001-0000-4000-8000-000000000001', now(), 1) $$,
  'and re-adding after the end succeeds, because the unique index covers live rows only'
);

select is(
  (select count(*)::integer from public.person_contexts
    where person_id = 'e6c21001-0000-4000-8000-000000000001'
      and context_id = 'e6c22001-0000-4000-8000-000000000001'
      and valid_until is null),
  1,
  'leaving EXACTLY ONE live row -- gate B3, which is the assertion that matters'
);

select is(
  (select count(*)::integer from public.person_contexts
    where person_id = 'e6c21001-0000-4000-8000-000000000001'
      and context_id = 'e6c22001-0000-4000-8000-000000000001'),
  2,
  'and two rows in total, so the ended association is still readable history'
);

-- The same shape for `person_projects`, including the role that travels with it,
-- and the same explicit timestamps for the same reason.
insert into public.person_projects (user_id, person_id, project_id, role, valid_from, confidence)
values ('e6c20001-0000-4000-8000-000000000001', 'e6c21001-0000-4000-8000-000000000001',
        'e6c23001-0000-4000-8000-000000000001', 'revisora do contrato', now() - interval '2 days', 1);

select throws_ok(
  $$ insert into public.person_projects (user_id, person_id, project_id, role, valid_from, confidence)
     values ('e6c20001-0000-4000-8000-000000000001', 'e6c21001-0000-4000-8000-000000000001',
             'e6c23001-0000-4000-8000-000000000001', 'outro papel', now() - interval '1 day', 1) $$,
  '23505',
  null::text,
  'a duplicate LIVE person-project association is refused by person_projects_current_idx, whatever the role says'
);

-- EGC-ASSOC-004: the role is free text at the database, with no CHECK and no
-- length bound. The 120 in `schema.ts` is a product ceiling, and this is the
-- assertion that keeps that claim honest.
select lives_ok(
  $$ update public.person_projects set role = repeat('x', 400)
      where person_id = 'e6c21001-0000-4000-8000-000000000001'
        and valid_until is null $$,
  'the role column accepts 400 characters, so schema.ts 120 is a product ceiling and not a column mirror'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the index asymmetry the PRD gets wrong (3)
-- ---------------------------------------------------------------------------
--
-- The correction this suite exists to record. `relationships.ts` performs an
-- application-only duplicate check and says in its header that no constraint
-- backs it; these three assertions are the evidence for that sentence.

select is(
  (select count(*)::integer from pg_catalog.pg_indexes
    where schemaname = 'public' and tablename = 'person_contexts'
      and indexdef like '%UNIQUE%' and indexdef like '%valid_until IS NULL%'),
  1,
  'person_contexts carries a partial unique index over live rows'
);

select is(
  (select count(*)::integer from pg_catalog.pg_indexes
    where schemaname = 'public' and tablename = 'person_projects'
      and indexdef like '%UNIQUE%' and indexdef like '%valid_until IS NULL%'),
  1,
  'person_projects carries one too'
);

-- The primary key on `id` is itself a unique index, so it is excluded by name
-- rather than by hoping it does not match: a bare `indexdef like '%UNIQUE%'`
-- would count `person_relationships_pkey` and report the opposite of the truth.
-- What is being claimed is that no unique index constrains the *pair* -- which
-- is what a duplicate refusal would need.
select is(
  (select coalesce(string_agg(indexname, ', ' order by indexname), '')
     from pg_catalog.pg_indexes
    where schemaname = 'public' and tablename = 'person_relationships'
      and indexdef like '%UNIQUE%'
      and indexname <> 'person_relationships_pkey'),
  '',
  'person_relationships carries NO unique index beyond its primary key -- so its duplicate refusal is application-only, with no 23505 behind it, and the PRD sentence describing "the partial unique index" does not apply to this table'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- gate B6: cross-owner, refused twice over (5)
-- ---------------------------------------------------------------------------
--
-- The gate requires **both** halves: the application check and the composite
-- foreign key. The application half is unit-tested; this is the structural half,
-- and it is what makes the application check a message rather than the only
-- control.

select throws_ok(
  $$ insert into public.person_contexts (user_id, person_id, context_id, confidence)
     values ('e6c20001-0000-4000-8000-000000000001', 'e6c21001-0000-4000-8000-000000000001',
             'e6c22002-0000-4000-8000-000000000002', 1) $$,
  '23503',
  null::text,
  'linking to a stranger context is refused by the composite ownership key, not merely by the application'
);

select throws_ok(
  $$ insert into public.person_projects (user_id, person_id, project_id, confidence)
     values ('e6c20001-0000-4000-8000-000000000001', 'e6c21001-0000-4000-8000-000000000001',
             'e6c23002-0000-4000-8000-000000000002', 1) $$,
  '23503',
  null::text,
  'and linking to a stranger project is refused the same way'
);

select throws_ok(
  $$ insert into public.person_relationships (user_id, person_id, relationship_type, confidence)
     values ('e6c20001-0000-4000-8000-000000000001', 'e6c21002-0000-4000-8000-000000000002', 'friend', 1) $$,
  '23503',
  null::text,
  'and a relationship about a stranger person is refused too'
);

-- Claiming another owner's id outright is refused by the insert policy rather
-- than by a key -- a different control, asserted separately.
select throws_ok(
  $$ insert into public.person_relationships (user_id, person_id, relationship_type, confidence)
     values ('e6c20002-0000-4000-8000-000000000002', 'e6c21002-0000-4000-8000-000000000002', 'friend', 1) $$,
  '42501',
  null::text,
  'and writing a row under the stranger user_id is refused by the insert policy'
);

-- The positive control, last: everything above must fail for the reason claimed
-- and not because these inserts are broken in general.
select lives_ok(
  $$ insert into public.person_relationships (user_id, person_id, relationship_type, confidence)
     values ('e6c20001-0000-4000-8000-000000000001', 'e6c21001-0000-4000-8000-000000000001', 'friend', 1) $$,
  'while the owner writing about their own person succeeds -- so the four refusals above are about ownership'
);

select * from finish();
rollback;
