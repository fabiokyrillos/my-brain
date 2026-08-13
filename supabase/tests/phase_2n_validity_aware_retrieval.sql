-- ---------------------------------------------------------------------------
-- Phase 2N slice 2N.3 · M1 — `public.match_internal_knowledge` respects
-- validity BEFORE the bound (`2N-CORRECT-003`).
--
-- WHY THIS SUITE CANNOT BE WRITTEN WITH IDENTICAL EMBEDDINGS
--
-- `phase_2k_knowledge_retrieval_ownership.sql` gives every row the SAME vector
-- on purpose, so that ownership is the only thing that can separate two rows.
-- That design is exactly wrong for this suite. The defect being repaired is
-- DISPLACEMENT -- an out-of-force memory consuming a slot a live one would have
-- taken -- and displacement is only observable when the two rows have DIFFERENT
-- similarities and the loser is the one that should have been kept.
--
-- So the vectors are built to a strict, controlled order. A vector whose first
-- `k` components are 1 and the rest 0, scored against a query of `[1,0,0,…]`,
-- has cosine similarity `1/sqrt(k)`. That gives an exact ranking:
--
--   | row              | k | similarity | in force? |
--   |------------------|---|------------|-----------|
--   | archived memory  | 1 | 1.0000     | no        |
--   | scheduled memory | 1 | 1.0000     | no        |
--   | LIVE memory      | 2 | 0.7071     | YES       |
--   | entry            | 3 | 0.5774     | n/a       |
--   | boundary-from    | 4 | 0.5000     | YES       |
--   | boundary-until   | 5 | 0.4472     | no        |
--
-- `order by similarity desc` CARRIES NO TIEBREAKER, and M1 deliberately does
-- not add one -- ordering was not the requirement. So the fixture must not
-- create a tie it would then depend on: the live memory is the UNIQUE
-- highest-scoring in-force row, which is what makes section 4's single expected
-- id deterministic rather than arbitrary. The two rows that outrank it are both
-- excluded, which is the whole point.
--
-- They are written inline with `repeat()` rather than through a helper
-- function. A `pg_temp` helper would be neater to read and would raise a
-- question this suite must not depend on: the sections below `set local role
-- authenticated`, and whether that role holds USAGE on the session's temporary
-- schema is not a property this test is trying to prove. An expression needs no
-- privilege.
--
-- WHY THE EVICTION ASSERTION IS THE ONE THAT MATTERS
--
-- `2N-CORRECT-003` requires the proof to be eviction AT THE BOUND, not absence
-- from a citation list, because the TypeScript filter that shipped before this
-- migration already produced the latter. Section 4 therefore calls with a bound
-- of ONE against a fixture where the archived memory OUTRANKS the live one:
--
--   * before this migration the single returned row is the ARCHIVED memory and
--     the live one is never sent;
--   * after it, the archived row is gone before the ordering and the live
--     memory is the row that comes back.
--
-- Section 0 asserts the ranking premise directly against the table, so the
-- eviction assertion cannot pass because the archived row merely ranked low.
-- That control is what makes this suite non-vacuous, and it is asserted rather
-- than assumed because this repository has recorded that a control which is not
-- subject to the same mechanism produces a confident wrong verdict.
--
-- BOUNDARIES ARE EXACT HERE, NOT APPROXIMATE
--
-- `now()` is transaction time, so a row stamped `valid_until = now()` is
-- compared against the identical instant inside the function. That makes the
-- two inclusive boundaries `src/features/memories/lifecycle.ts` defines --
-- active AT `valid_from`, archived AT `valid_until` -- testable exactly rather
-- than flakily.
-- ---------------------------------------------------------------------------

begin;

select plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures: one owner with every lifecycle state, and a second owner whose
-- top-ranked memory must never be reachable.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2f300001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'owner-a-2n3@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2f300002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'owner-b-2n3@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Entries carry no validity window and must be untouched by this change.
insert into public.entries (user_id, original_content, occurred_at, locale, source, status, sensitivity)
values ('2f300001-0000-4000-8000-000000000001', 'owner A vigenciaphrase entry', now(),
        'pt-BR', 'web', 'completed', 'normal');

insert into public.entry_embeddings (user_id, entry_id, content, embedding, model)
select
  owned.user_id,
  owned.id,
  owned.original_content,
  ('[1,1,1' || repeat(',0', 1533) || ']')::extensions.vector(1536),
  'text-embedding-3-small'
from public.entries as owned
where owned.original_content like '%vigenciaphrase%';

insert into public.memories
  (id, user_id, content, kind, confidence, sensitivity, embedding, embedding_model, valid_from, valid_until)
values
  -- In force, and DELIBERATELY THE WEAKER MATCH: it is the row displacement
  -- would have dropped.
  ('2f3a0001-0000-4000-8000-0000000000a1', '2f300001-0000-4000-8000-000000000001',
   'owner A vigenciaphrase live memory', 'fact', 0.9, 'normal',
   ('[1,1' || repeat(',0', 1534) || ']')::extensions.vector(1536),
   'text-embedding-3-small', null, null),
  -- Archived, and the STRONGEST match, so it wins the bound unless evicted.
  ('2f3a0002-0000-4000-8000-0000000000a2', '2f300001-0000-4000-8000-000000000001',
   'owner A vigenciaphrase archived memory', 'fact', 0.9, 'normal',
   ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536),
   'text-embedding-3-small', null, now() - interval '1 day'),
  -- Not yet in force, also a top match. `isMemoryInForce` calls this
  -- `scheduled` and the product tells the owner it is not being used.
  ('2f3a0003-0000-4000-8000-0000000000a3', '2f300001-0000-4000-8000-000000000001',
   'owner A vigenciaphrase scheduled memory', 'fact', 0.9, 'normal',
   ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536),
   'text-embedding-3-small', now() + interval '1 day', null),
  -- Exactly AT `valid_from`: active, because the boundary is inclusive. Ranked
  -- BELOW the live memory on purpose -- it must be retrievable, but it must not
  -- tie with the row section 4 names.
  ('2f3a0004-0000-4000-8000-0000000000a4', '2f300001-0000-4000-8000-000000000001',
   'owner A vigenciaphrase boundary-from memory', 'fact', 0.9, 'normal',
   ('[1,1,1,1' || repeat(',0', 1532) || ']')::extensions.vector(1536),
   'text-embedding-3-small', now(), null),
  -- Exactly AT `valid_until`: archived, because that boundary is inclusive too.
  ('2f3a0005-0000-4000-8000-0000000000a5', '2f300001-0000-4000-8000-000000000001',
   'owner A vigenciaphrase boundary-until memory', 'fact', 0.9, 'normal',
   ('[1,1,1,1,1' || repeat(',0', 1531) || ']')::extensions.vector(1536),
   'text-embedding-3-small', null, now()),
  -- Owner B's best possible match. Nothing owner A does may reach it.
  ('2f3b0001-0000-4000-8000-0000000000b1', '2f300002-0000-4000-8000-000000000002',
   'owner B vigenciaphrase live memory', 'fact', 0.9, 'normal',
   ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536),
   'text-embedding-3-small', null, null);

-- ---------------------------------------------------------------------------
-- Section 0 — non-vacuity and the ranking premise (4)
--
-- Read as the table owner, before any role switch. Without these, every
-- exclusion below is satisfied by a database where the rows were never there,
-- and the eviction assertion is satisfied by a fixture that never competed.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.memories
   where user_id = '2f300001-0000-4000-8000-000000000001' and embedding is not null),
  5,
  'non-vacuity: owner A has five embedded memories across every lifecycle state'
);

select is(
  (select count(*)::int from public.entry_embeddings where content like '%vigenciaphrase%'),
  1,
  'non-vacuity: owner A has an embedded entry, which carries no validity window'
);

select is(
  (select count(*)::int from public.memories
   where user_id = '2f300002-0000-4000-8000-000000000002' and embedding is not null),
  1,
  'non-vacuity: owner B has an embedded memory for the boundary to exclude'
);

-- THE CONTROL THAT MAKES SECTION 4 MEAN ANYTHING.
select ok(
  (select 1 - (embedding operator(extensions.<=>) ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536))
     from public.memories where id = '2f3a0002-0000-4000-8000-0000000000a2')
  >
  (select 1 - (embedding operator(extensions.<=>) ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536))
     from public.memories where id = '2f3a0001-0000-4000-8000-0000000000a1'),
  'control: the ARCHIVED memory outranks the live one, so a bound of one would have returned it'
);

-- ---------------------------------------------------------------------------
-- Section 1 — the function keeps the posture retrieval depends on (1)
-- ---------------------------------------------------------------------------

select is(
  (select prosecdef from pg_proc
   where oid = 'public.match_internal_knowledge(extensions.vector, integer)'::regprocedure),
  false,
  'M1 left match_internal_knowledge SECURITY INVOKER, so RLS still applies to the caller'
);

-- ---------------------------------------------------------------------------
-- Section 2 — POSITIVE CONTROL: what is in force is still retrieved (3)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"2f300001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.source_id = '2f3a0001-0000-4000-8000-0000000000a1'),
  1,
  'a memory in force is retrieved'
);

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.source_id = '2f3a0004-0000-4000-8000-0000000000a4'),
  1,
  'a memory exactly AT valid_from is in force, because that boundary is inclusive'
);

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.source_type = 'entry'),
  1,
  'entries are still retrieved: they carry no validity window and none was invented for them'
);

-- ---------------------------------------------------------------------------
-- Section 3 — what is not in force does not come back at all (3)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.source_id = '2f3a0002-0000-4000-8000-0000000000a2'),
  0,
  'an archived memory is not retrieved, even at the widest bound the function allows'
);

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.source_id = '2f3a0003-0000-4000-8000-0000000000a3'),
  0,
  'a scheduled memory is not retrieved: not yet in force is not in force'
);

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.source_id = '2f3a0005-0000-4000-8000-0000000000a5'),
  0,
  'a memory exactly AT valid_until is archived, because that boundary is inclusive too'
);

-- ---------------------------------------------------------------------------
-- Section 4 — EVICTION AT THE BOUND, which is the requirement itself (2)
--
-- One slot. The archived memory ranks first (asserted in section 0) and the
-- live memory second. Before M1 this returned the archived row and the live one
-- was never sent; after it, the live row is what comes back.
-- ---------------------------------------------------------------------------

select is(
  (select retrieved.source_id from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 1) as retrieved),
  '2f3a0001-0000-4000-8000-0000000000a1'::uuid,
  'at a bound of ONE the live memory is returned: the archived one no longer occupies the slot'
);

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 1) as retrieved),
  1,
  'and the bound is still honoured -- eviction returns the next live row, it does not widen the result'
);

-- ---------------------------------------------------------------------------
-- Section 5 — the owner boundary is unchanged by this migration (2)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.content like '%owner B%'),
  0,
  'owner A still cannot reach owner B''s knowledge, and validity filtering did not open a door'
);

reset role;

select set_config('request.jwt.claims',
  '{"sub":"2f300002-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.match_internal_knowledge(
     ('[1' || repeat(',0', 1535) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.content like '%owner B%'),
  1,
  'positive control: owner B does retrieve its own in-force memory, so the denial above is not vacuous'
);

reset role;

select * from finish();

rollback;
