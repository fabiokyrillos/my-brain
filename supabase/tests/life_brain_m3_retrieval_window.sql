-- Life Brain LB-M3 (slice B.3, ADR-150): the chat's retrieval has a date window.
--
-- Pins the four-argument `match_internal_knowledge`: the window on both arms,
-- inclusive since and exclusive until, applied ahead of the bound (a row outside
-- the window never takes a slot), the validity window still in force, owner
-- scoping, invoker security and authenticated-only grants — and that the
-- two-argument signature still answers exactly as before.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Structure ---------------------------------------------------------------------

select ok(
  to_regprocedure('public.match_internal_knowledge(extensions.vector,integer,timestamptz,timestamptz)') is not null,
  'the windowed retrieval exists'
);
select ok(
  to_regprocedure('public.match_internal_knowledge(extensions.vector,integer)') is not null,
  'the two-argument retrieval still exists'
);
select ok(
  not (select prosecdef from pg_proc
       where oid = 'public.match_internal_knowledge(extensions.vector,integer,timestamptz,timestamptz)'::regprocedure),
  'the windowed retrieval is SECURITY INVOKER, so RLS applies to the caller'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc
   where oid = 'public.match_internal_knowledge(extensions.vector,integer,timestamptz,timestamptz)'::regprocedure),
  'the windowed retrieval pins an empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.match_internal_knowledge(extensions.vector,integer,timestamptz,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.match_internal_knowledge(extensions.vector,integer,timestamptz,timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.match_internal_knowledge(extensions.vector,integer)', 'execute')
  and not has_function_privilege('anon', 'public.match_internal_knowledge(extensions.vector,integer)', 'execute'),
  'both signatures are authenticated-only'
);

-- Fixtures ------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('b3000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'window-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b3000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'window-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (id, user_id, original_content, occurred_at, locale, source, status, sensitivity) values
  ('b3e00001-0000-4000-8000-000000000001', 'b3000001-0000-4000-8000-000000000001', 'janelaphrase march entry', '2026-03-10T12:00:00Z', 'pt-BR', 'web', 'completed', 'normal'),
  ('b3e00002-0000-4000-8000-000000000002', 'b3000001-0000-4000-8000-000000000001', 'janelaphrase october entry', '2026-10-20T12:00:00Z', 'pt-BR', 'web', 'completed', 'normal'),
  ('b3e00003-0000-4000-8000-000000000003', 'b3000001-0000-4000-8000-000000000001', 'janelaphrase april first entry', '2026-04-01T00:00:00Z', 'pt-BR', 'web', 'completed', 'normal'),
  ('b3e00004-0000-4000-8000-000000000004', 'b3000002-0000-4000-8000-000000000002', 'janelaphrase other owner march entry', '2026-03-12T12:00:00Z', 'pt-BR', 'web', 'completed', 'normal');

-- The October entry is the closest match, so a window that is applied after the
-- bound would return it and nothing else at a bound of one.
insert into public.entry_embeddings (user_id, entry_id, content, embedding, model)
select owned.user_id, owned.id, owned.original_content,
  (case
     when owned.original_content like '%october%' then '[1,1,1,1' || repeat(',0', 1532) || ']'
     else '[1,1' || repeat(',0', 1534) || ']'
   end)::extensions.vector(1536),
  'text-embedding-3-small'
from public.entries as owned
where owned.original_content like '%janelaphrase%';

insert into public.memories
  (id, user_id, content, kind, confidence, sensitivity, embedding, embedding_model, valid_from, valid_until)
values
  ('b3a00001-0000-4000-8000-0000000000a1', 'b3000001-0000-4000-8000-000000000001',
   'janelaphrase march memory', 'fact', 0.9, 'normal',
   ('[1,1' || repeat(',0', 1534) || ']')::extensions.vector(1536),
   'text-embedding-3-small', '2026-03-15T12:00:00Z', null),
  ('b3a00002-0000-4000-8000-0000000000a2', 'b3000001-0000-4000-8000-000000000001',
   'janelaphrase archived march memory', 'fact', 0.9, 'normal',
   ('[1,1' || repeat(',0', 1534) || ']')::extensions.vector(1536),
   'text-embedding-3-small', '2026-03-20T12:00:00Z', '2026-03-25T12:00:00Z');

select set_config('request.jwt.claims', '{"sub":"b3000001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- The query vector every assertion below uses.
create temporary table probe on commit drop as
select ('[1,1,1,1' || repeat(',0', 1532) || ']')::extensions.vector(1536) as v;

-- Non-vacuity --------------------------------------------------------------------

select is(
  (select count(*)::int from public.match_internal_knowledge((select v from probe), 20)),
  4,
  'non-vacuity: the two-argument retrieval sees the three entries and the live memory'
);
select is(
  (select source_id from public.match_internal_knowledge((select v from probe), 1)),
  'b3e00002-0000-4000-8000-000000000002'::uuid,
  'control: unwindowed, the October entry ranks first'
);

-- The window ------------------------------------------------------------------------

select is(
  (select array_agg(source_id order by source_id) from public.match_internal_knowledge(
     (select v from probe), 20, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')),
  array['b3a00001-0000-4000-8000-0000000000a1', 'b3e00001-0000-4000-8000-000000000001']::uuid[],
  'March: the March entry and the March memory, nothing else'
);
select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select v from probe), 20, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')
   where source_id = 'b3e00003-0000-4000-8000-000000000003'),
  0,
  'until is exclusive: a row at exactly the upper bound is outside'
);
select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select v from probe), 20, '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z')
   where source_id = 'b3e00003-0000-4000-8000-000000000003'),
  1,
  'since is inclusive: a row at exactly the lower bound is inside'
);
select is(
  (select source_id from public.match_internal_knowledge(
     (select v from probe), 1, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')
   order by source_type limit 1)
  in ('b3e00001-0000-4000-8000-000000000001'::uuid, 'b3a00001-0000-4000-8000-0000000000a1'::uuid),
  true,
  'the window is applied before the bound: at one row, March still answers'
);
select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select v from probe), 1, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')),
  1,
  'and the bound still holds inside the window'
);
select is(
  (select array_agg(source_id) from public.match_internal_knowledge(
     (select v from probe), 20, '2026-10-01T00:00:00Z', null)),
  array['b3e00002-0000-4000-8000-000000000002']::uuid[],
  'since alone: from October on'
);
select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select v from probe), 20, null, '2026-04-01T00:00:00Z')),
  2,
  'until alone: everything before April'
);
select is(
  (select count(*)::int from public.match_internal_knowledge((select v from probe), 20, null, null)),
  (select count(*)::int from public.match_internal_knowledge((select v from probe), 20)),
  'no bounds: the same answer as the two-argument signature'
);
select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select v from probe), 20, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')
   where source_id = 'b3a00002-0000-4000-8000-0000000000a2'),
  0,
  'a memory no longer in force stays out, whatever the window'
);
select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select v from probe), 20, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')
   where source_id = 'b3e00004-0000-4000-8000-000000000004'),
  0,
  'another owner''s March entry never appears'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"b3000002-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select array_agg(source_id) from public.match_internal_knowledge(
     (select v from probe), 20, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')),
  array['b3e00004-0000-4000-8000-000000000004']::uuid[],
  'the other owner sees only their own March'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select v from probe), 20, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')),
  0,
  'with no session there is no owner, so nothing'
);

select * from finish();
rollback;
