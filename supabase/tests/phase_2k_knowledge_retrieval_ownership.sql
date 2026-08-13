-- ---------------------------------------------------------------------------
-- Phase 2K slice 2K.0 — `public.match_internal_knowledge` is owner-scoped.
--
-- WHY THIS SUITE EXISTS
--
-- The Phase 2K current-experience audit (§5.4) recorded a named gap: the RPC
-- that feeds every grounded chat answer is `security invoker` and carries an
-- `auth.uid()` predicate on both arms, and **no database test asserts either
-- property**. Phase 2I built exactly this suite for lexical search
-- (`phase_2i_search_ownership.sql`) because search was the first surface taking
-- an arbitrary string to seven tables. Semantic retrieval is the same class of
-- surface reached by a different door, and it had no equivalent.
--
-- Phase 2K builds no retrieval — ADR-055 and OD-2K-A forbid widening it, and
-- OD-2K-6 retires the widening at the ADR-055 expiry. This suite therefore
-- proves the boundary around what **already ships**, which is the only thing
-- slice 2K.0 is authorized to touch. It adds no column, no function, no grant
-- and no migration.
--
-- WHY IDENTICAL EMBEDDINGS, AND WHY THAT IS THE POINT
--
-- Both owners get the SAME vector and the SAME query vector, so every row
-- scores an identical similarity of 1. Ranking, thresholds and content are
-- removed from the experiment entirely: the only thing that can separate the
-- two owners' rows is ownership. A suite that gave them different vectors could
-- pass because one simply ranked below the limit.
--
-- WHY A POSITIVE CONTROL IS MANDATORY HERE
--
-- "Owner A sees none of owner B's rows" is satisfied by a database in which the
-- call returns nothing at all — a revoked grant, a broken claim, an empty
-- table. Section 2 therefore asserts that the same session, in the same
-- transaction, DOES retrieve its own two rows. Without it the denial is
-- vacuous, which is the failure recorded in this repository as "a control must
-- not be exempt".
--
-- WHAT THIS SUITE DOES NOT CLAIM
--
-- It does not test relevance, ranking quality, or the 0.2 similarity floor
-- applied in TypeScript.
--
-- It also does not test the memory-lifecycle filter, and the reason changed.
-- When this suite was written that filter lived in `chat/actions.ts`, because
-- teaching the RPC `valid_from`/`valid_until` would need a migration and slice
-- 2K.0 spent none. **Phase 2N slice 2N.3 spent one** (`202608130093`, migration
-- M1, `2N-CORRECT-003`): the window is now applied inside the union, ahead of
-- the bound. That behaviour is proved by `phase_2n_validity_aware_retrieval.sql`
-- and is deliberately not duplicated here — this suite's fixtures give every
-- row the same vector so that OWNERSHIP is the only discriminator, which is the
-- opposite of what a displacement test needs.
--
-- The fixtures below leave `valid_from` and `valid_until` NULL, which is
-- `active`, so every assertion here means exactly what it did before M1.
-- ---------------------------------------------------------------------------

begin;

select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures: two owners, one entry-with-embedding and one memory each
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2c000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'owner-a-2k0@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2c000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'owner-b-2k0@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (user_id, original_content, occurred_at, locale, source, status, sensitivity)
values
  ('2c000001-0000-4000-8000-000000000001', 'owner A wombatphrase entry', now(), 'pt-BR', 'web', 'completed', 'normal'),
  ('2c000002-0000-4000-8000-000000000002', 'owner B wombatphrase entry', now(), 'pt-BR', 'web', 'completed', 'normal');

-- One vector, used for both owners and for the query, so similarity is 1
-- everywhere and ownership is the only discriminator.
insert into public.entry_embeddings (user_id, entry_id, content, embedding, model)
select
  owned_entry.user_id,
  owned_entry.id,
  owned_entry.original_content,
  (select ('[' || string_agg('0.05', ',') || ']')::extensions.vector(1536)
     from generate_series(1, 1536)),
  'text-embedding-3-small'
from public.entries as owned_entry
where owned_entry.original_content like '%wombatphrase%';

insert into public.memories (user_id, content, kind, confidence, sensitivity, embedding, embedding_model)
values
  ('2c000001-0000-4000-8000-000000000001', 'owner A wombatphrase memory', 'fact', 0.9, 'normal',
   (select ('[' || string_agg('0.05', ',') || ']')::extensions.vector(1536) from generate_series(1, 1536)),
   'text-embedding-3-small'),
  ('2c000002-0000-4000-8000-000000000002', 'owner B wombatphrase memory', 'fact', 0.9, 'normal',
   (select ('[' || string_agg('0.05', ',') || ']')::extensions.vector(1536) from generate_series(1, 1536)),
   'text-embedding-3-small');

-- ---------------------------------------------------------------------------
-- Section 0 — non-vacuity: both owners really do have retrievable rows (2)
--
-- Read as the table owner, before any role switch. Without this section every
-- "A cannot see B" assertion below is satisfied by a database where B has
-- nothing to see.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.entry_embeddings
   where content like '%wombatphrase%'),
  2,
  'non-vacuity: both owners have an embedded entry'
);

select is(
  (select count(*)::int from public.memories
   where content like '%wombatphrase%' and embedding is not null),
  2,
  'non-vacuity: both owners have an embedded memory'
);

-- ---------------------------------------------------------------------------
-- Section 1 — structural: the function's own posture (3)
--
-- Asserted from the catalog rather than from the migration text, so a later
-- `create or replace` that silently changed the posture fails here.
-- ---------------------------------------------------------------------------

select is(
  (select prosecdef from pg_proc
   where oid = 'public.match_internal_knowledge(extensions.vector, integer)'::regprocedure),
  false,
  'match_internal_knowledge is SECURITY INVOKER, so RLS applies to the caller'
);

select is(
  (select count(*)::int from pg_class
   where relname in ('entry_embeddings', 'memories')
     and relnamespace = 'public'::regnamespace
     and relrowsecurity and relforcerowsecurity),
  2,
  'both retrieved tables have RLS ENABLED and FORCED'
);

-- WHERE THE ANON BOUNDARY ACTUALLY IS, AND WHY THE FIRST DRAFT WAS WRONG
--
-- This assertion originally read `has_function_privilege('anon', …, 'execute')
-- is false`, on the strength of `202607160006`'s `revoke all on function … from
-- anon`. CI failed it: the answer is **true**. Postgres grants EXECUTE on a new
-- function to `PUBLIC`, and revoking from `anon` does not remove a grant held
-- through `PUBLIC` -- so `anon` may indeed call this function.
--
-- The hosted probe run in the same slice said the same thing from the other
-- side: `anon` is refused with `42501 permission denied for table
-- entry_embeddings`, naming the **table**, not the function.
--
-- So the boundary is the table grant, and the function-level revoke is not what
-- protects this RPC. That is asserted here. The function-level privilege is
-- deliberately **not** asserted in either direction: pinning it `true` would
-- lock in the weaker state, and pinning it `false` would be a lie.
select is(
  (select count(*)::int
   from (values ('public.entry_embeddings'), ('public.memories')) as retrieved(name)
   where has_table_privilege('anon', retrieved.name, 'select')),
  0,
  'anon cannot SELECT either retrieved table, which is the boundary that actually holds'
);

-- ---------------------------------------------------------------------------
-- Section 2 — POSITIVE CONTROL: owner A retrieves its OWN rows (3)
--
-- This is what makes section 3 mean something. If these fail, every denial
-- below is satisfied by a session that can read nothing at all.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"2c000001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select ('[' || string_agg('0.05', ',') || ']')::extensions.vector(1536)
        from generate_series(1, 1536)),
     20)),
  2,
  'positive control: owner A retrieves exactly its own two rows'
);

select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select ('[' || string_agg('0.05', ',') || ']')::extensions.vector(1536)
        from generate_series(1, 1536)),
     20) as retrieved
   where retrieved.content like '%owner A%'),
  2,
  'positive control: both retrieved rows are owner A''s own content'
);

select is(
  (select count(distinct source_type)::int from public.match_internal_knowledge(
     (select ('[' || string_agg('0.05', ',') || ']')::extensions.vector(1536)
        from generate_series(1, 1536)),
     20)),
  2,
  'positive control: both arms of the union are exercised, entry and memory'
);

-- ---------------------------------------------------------------------------
-- Section 3 — the boundary: owner A retrieves NONE of owner B's rows (2)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select ('[' || string_agg('0.05', ',') || ']')::extensions.vector(1536)
        from generate_series(1, 1536)),
     20) as retrieved
   where retrieved.content like '%owner B%'),
  0,
  'owner A cannot reach owner B''s knowledge through semantic retrieval'
);

reset role;

select set_config('request.jwt.claims',
  '{"sub":"2c000002-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.match_internal_knowledge(
     (select ('[' || string_agg('0.05', ',') || ']')::extensions.vector(1536)
        from generate_series(1, 1536)),
     20) as retrieved
   where retrieved.content like '%owner A%'),
  0,
  'and the boundary holds in the other direction, for owner B'
);

reset role;

select * from finish();

rollback;
