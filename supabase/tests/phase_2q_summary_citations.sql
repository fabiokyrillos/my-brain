-- Phase 2Q slice 2Q.1 -- summaries.citations, as Postgres actually built it.
--
-- The third of the three parity proofs ADR-041 established. The migration
-- declares the column, src/features/reviews/citations-types-parity.test.ts
-- compares the migration against the generated types in both directions, and
-- this file asks the real catalog.
--
-- WHAT IT PROVES, AND WHY EACH ONE IS HERE
--
--   1. 2Q-CITE-001 -- the column exists, is jsonb, is not null, and defaults to
--      an empty array, so no existing row reads as NULL and no reader has to
--      tell "no citations" from "column absent".
--   2. 2Q-CITE-002 -- the table's POSTURE IS UNCHANGED. Three policies, all to
--      `authenticated` alone; `authenticated` still holds no DELETE; RLS
--      enabled AND forced. Asserted against the pre-state recorded live from
--      the deployed database at parity 202608190099, in the slice 2Q.0
--      acceptance record -- because a requirement that asserts "unchanged"
--      with no recorded pre-state asserts nothing.
--   3. 2Q-CITE-003 -- the column is NOT a foreign key, proved twice: the
--      catalog carries no FK on it, AND deleting a cited task leaves the stored
--      envelope byte-identical. A review is a historical statement; deleting a
--      record must not edit what it said.
--   4. 2Q-CITE-009 -- upserting twice over one period key leaves ONE envelope,
--      the second, rather than accumulating.
--   5. Isolation -- another owner's review is invisible under RLS, and the
--      citations column adds no route around that.
--
-- WHAT IT DOES NOT PROVE, and may not be cited as proving: anything about a
-- rendered link. A test that reads the column back proves 2Q-CITE-* and proves
-- nothing about 2Q-LINK-*, which is slice 2Q.2's boundary.

begin;

select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures -- two owners, one task each, so isolation has something to isolate.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2c000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   '2q1-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2c000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   '2q1-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (id, user_id, original_content, source, status, locale)
values
  ('2c00e001-0000-4000-8000-000000000001', '2c000001-0000-4000-8000-000000000001',
   'Fechei o contrato e marquei a proxima reuniao', 'web', 'saved', 'pt-BR');

insert into public.tasks (id, user_id, title, status, source_entry_id)
values
  ('2c00d001-0000-4000-8000-000000000001', '2c000001-0000-4000-8000-000000000001',
   'Fechar o contrato', 'completed', '2c00e001-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. The column, as declared.
-- ---------------------------------------------------------------------------

select has_column('public', 'summaries', 'citations', 'summaries carries citations');
select col_type_is('public', 'summaries', 'citations', 'jsonb', 'citations is jsonb');
select col_not_null('public', 'summaries', 'citations', 'citations is not null');
select is(
  (select pg_get_expr(d.adbin, d.adrelid)
     from pg_attrdef d
     join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.summaries'::regclass and a.attname = 'citations'),
  '''[]''::jsonb',
  'citations defaults to an empty array, so no existing row reads as NULL'
);

-- The fifteen columns, pinned. A sixteenth arriving unnoticed is a second
-- migration nobody declared, and OD-2Q-7 allocates one.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'summaries'),
  15,
  'summaries carries exactly fifteen columns -- fourteen plus the allocated one'
);

-- ---------------------------------------------------------------------------
-- 2. 2Q-CITE-002 -- the posture is UNCHANGED.
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.summaries'::regclass),
  'row-level security is still enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.summaries'::regclass),
  'forced row-level security is still enabled -- even the owner role obeys the policies'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'summaries'),
  3,
  'still exactly three policies -- none added, none removed'
);
select is(
  (select string_agg(policyname, ',' order by policyname)
     from pg_policies where schemaname = 'public' and tablename = 'summaries'),
  'summaries_insert_own,summaries_select_own,summaries_update_own',
  'the same three policies, by name'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'summaries'
      and (roles is null or not (roles @> array['authenticated']::name[]))),
  0,
  'every policy is still granted to authenticated alone -- none is PUBLIC'
);
select is(
  (select string_agg(distinct privilege_type, ',' order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'summaries' and grantee = 'authenticated'),
  'INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
  'authenticated holds the same six privileges -- and still no DELETE'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'summaries'
      and grantee = 'authenticated' and privilege_type = 'DELETE'),
  0,
  'authenticated still cannot DELETE a summary'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'summaries' and grantee = 'anon'),
  0,
  'anon holds no privilege on summaries'
);

-- ---------------------------------------------------------------------------
-- 3. 2Q-CITE-003 -- not a foreign key, proved from the catalog and by deletion.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int
     from pg_constraint c
     join lateral unnest(c.conkey) as k(attnum) on true
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.conrelid = 'public.summaries'::regclass
      and c.contype = 'f'
      and a.attname = 'citations'),
  0,
  'citations carries no foreign key'
);
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.summaries'::regclass and contype = 'f'),
  1,
  'the table still has exactly its one pre-existing foreign key (user_id)'
);
select is(
  (select count(*)::int from pg_constraint c
     join lateral unnest(c.conkey) as k(attnum) on true
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.conrelid = 'public.summaries'::regclass
      and c.contype = 'c'
      and a.attname = 'citations'),
  0,
  'citations carries no check constraint, which is what keeps the vocabulary in TypeScript'
);

-- A review that cited the task, written as the owner would write it.
insert into public.summaries (
  user_id, period_type, period_start, period_end, title, content,
  original_content, status, model, citations
) values (
  '2c000001-0000-4000-8000-000000000001', 'daily', date '2026-08-20', date '2026-08-20',
  'Resumo diario', 'Voce fechou o contrato.', 'Voce fechou o contrato.', 'generated', 'pgtap',
  jsonb_build_object(
    'v', '2026-08-09.1',
    'evidence', 'evidenced',
    'reach', jsonb_build_array('entry', 'task'),
    'sources', jsonb_build_array(
      jsonb_build_object(
        'id', 'task:2c00d001-0000-4000-8000-000000000001',
        'type', 'task',
        'sourceId', '2c00d001-0000-4000-8000-000000000001',
        'support', 'product_state'
      )
    )
  )
);

select is(
  (select citations -> 'sources' -> 0 ->> 'type' from public.summaries
    where user_id = '2c000001-0000-4000-8000-000000000001' and period_start = date '2026-08-20'),
  'task',
  'the stored envelope names a TASK, not a memory -- 2Q-CITE-007 at the database'
);

-- Capture the exact bytes, delete the cited task, and compare.
create temporary table envelope_before as
select citations::text as before
  from public.summaries
 where user_id = '2c000001-0000-4000-8000-000000000001' and period_start = date '2026-08-20';

delete from public.tasks where id = '2c00d001-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.tasks where id = '2c00d001-0000-4000-8000-000000000001'),
  0,
  'the cited task really was deleted -- so the assertion below is not vacuous'
);
select is(
  (select citations::text from public.summaries
    where user_id = '2c000001-0000-4000-8000-000000000001' and period_start = date '2026-08-20'),
  (select before from envelope_before),
  'deleting the cited task left the stored envelope BYTE-IDENTICAL -- a review is a historical statement'
);
select is(
  (select count(*)::int from public.summaries
    where user_id = '2c000001-0000-4000-8000-000000000001' and period_start = date '2026-08-20'),
  1,
  'and the review itself survived the deletion, rather than cascading away'
);

-- ---------------------------------------------------------------------------
-- 4. 2Q-CITE-009 -- regenerating replaces, never accumulates.
-- ---------------------------------------------------------------------------

insert into public.summaries (
  user_id, period_type, period_start, period_end, title, content,
  original_content, status, model, citations
) values (
  '2c000001-0000-4000-8000-000000000001', 'daily', date '2026-08-20', date '2026-08-20',
  'Resumo diario', 'Texto regenerado.', 'Texto regenerado.', 'generated', 'pgtap',
  jsonb_build_object(
    'v', '2026-08-09.1',
    'evidence', 'evidenced',
    'reach', jsonb_build_array('entry', 'task'),
    'sources', jsonb_build_array(
      jsonb_build_object(
        'id', 'entry:2c00e001-0000-4000-8000-000000000001',
        'type', 'entry',
        'sourceId', '2c00e001-0000-4000-8000-000000000001',
        'support', 'direct_record'
      )
    )
  )
)
on conflict (user_id, period_type, period_start, period_end) do update set
  content = excluded.content,
  original_content = excluded.original_content,
  citations = excluded.citations;

select is(
  (select count(*)::int from public.summaries
    where user_id = '2c000001-0000-4000-8000-000000000001' and period_start = date '2026-08-20'),
  1,
  'regenerating produced no second row'
);
select is(
  (select jsonb_array_length(citations -> 'sources') from public.summaries
    where user_id = '2c000001-0000-4000-8000-000000000001' and period_start = date '2026-08-20'),
  1,
  'the row holds ONE envelope with one source, not two envelopes merged'
);
select is(
  (select citations -> 'sources' -> 0 ->> 'type' from public.summaries
    where user_id = '2c000001-0000-4000-8000-000000000001' and period_start = date '2026-08-20'),
  'entry',
  'and it is the SECOND envelope -- the first was replaced, not appended to'
);

-- ---------------------------------------------------------------------------
-- 5. A default-carrying row, and isolation.
-- ---------------------------------------------------------------------------

insert into public.summaries (
  user_id, period_type, period_start, period_end, title, content,
  original_content, status, model
) values (
  '2c000002-0000-4000-8000-000000000002', 'daily', date '2026-08-19', date '2026-08-19',
  'Resumo do outro dono', 'Texto.', 'Texto.', 'generated', 'pgtap'
);

select is(
  (select citations from public.summaries
    where user_id = '2c000002-0000-4000-8000-000000000002' and period_start = date '2026-08-19'),
  '[]'::jsonb,
  'a row written without citations gets the empty array, never NULL -- 2Q-CITE-008 at the database'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"2c000001-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.summaries
    where user_id = '2c000002-0000-4000-8000-000000000002'),
  0,
  'the owner cannot read another account''s review -- the new column opens no route around RLS'
);
select is(
  (select count(*)::int from public.summaries
    where user_id = '2c000001-0000-4000-8000-000000000001'),
  1,
  'and the owner CAN read their own -- so the isolation assertion is not passing on a blind read'
);
select is(
  (select citations -> 'sources' -> 0 ->> 'sourceId' from public.summaries
    where user_id = '2c000001-0000-4000-8000-000000000001'),
  '2c00e001-0000-4000-8000-000000000001',
  'the owner reads their own envelope through RLS, identifiers intact'
);

select throws_ok(
  $$delete from public.summaries where user_id = '2c000001-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'authenticated still cannot DELETE a summary -- the grant set did not move'
);

reset role;

select * from finish();
rollback;
