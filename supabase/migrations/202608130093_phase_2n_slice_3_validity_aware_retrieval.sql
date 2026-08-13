-- ---------------------------------------------------------------------------
-- Phase 2N · slice 2N.3 · MIGRATION M1 of the three ADR-109 allocated.
--
-- Allocation: M1 — validity-aware retrieval. NON-TRANSFERABLE.
--   M3 stays allocated to slice 2N.3 (transactional deletion) and M2 to slice
--   2N.7 (telemetry vocabulary). A FOURTH IS A STOP CONDITION, not a decision
--   available inside a branch.
--
-- Requirement: `2N-CORRECT-003`.
--
-- WHAT THIS CHANGES, AND WHY IT NEEDED SCHEMA AT ALL
--
-- `public.match_internal_knowledge` (declared in `202607160006_chat_memory.sql`)
-- unions entries and memories, orders by similarity, and applies
--
--     limit least(greatest(coalesce(p_match_count, 8), 1), 20)
--
-- BEFORE anything reads `valid_from` or `valid_until`. Neither column appears in
-- the function at all: the memory arm's only predicate is
-- `user_id = auth.uid() and embedding is not null`.
--
-- Validity was applied afterwards, in TypeScript (`chat/actions.ts`,
-- `conversation-sources/resolve-sources.ts`), through `isMemoryInForce`. That
-- filter removes an archived memory from the CITATION LIST but cannot undo the
-- damage the bound already did: `chat/actions.ts` asks for 8, so an archived
-- memory ranking in the top eight CONSUMES ONE OF THE EIGHT SLOTS and the live
-- memory ranked ninth is never returned. No downstream code can recover a row
-- the database never sent.
--
-- That is why the alternative without a migration -- keep filtering in
-- TypeScript -- cannot satisfy `2N-CORRECT-003` in principle rather than merely
-- in practice, and why the requirement demands the proof be EVICTION AT THE
-- BOUND rather than absence from a citation list.
--
-- THE PREDICATE, AND WHERE IT COMES FROM
--
-- `src/features/memories/lifecycle.ts` is the product's definition of in force,
-- shared by the badge the owner reads and by the chat filter. Restated here
-- exactly, boundaries included:
--
--   * archived when `valid_until is not null and valid_until <= now`;
--   * scheduled when `valid_from  is not null and valid_from  >  now`;
--   * active otherwise -- INCLUDING when both columns are null.
--
-- So `in force` is `(valid_from is null or valid_from <= now())` AND
-- `(valid_until is null or valid_until > now())`. BOTH HALVES ARE REQUIRED. A
-- predicate carrying only the `valid_until` half would still retrieve a
-- SCHEDULED memory -- one the product tells the owner is not in use yet -- which
-- is the same lie in the other direction. `phase-2n-knowledge-guard.test.ts`
-- asserts this SQL against that TypeScript so the two cannot drift.
--
-- `now()` is transaction time, which is what a `stable` function must use: two
-- rows evaluated in one call cannot disagree about whether an instant has
-- passed.
--
-- ENTRIES ARE DELIBERATELY NOT FILTERED. They carry no validity window, and
-- applying one to them would drop every entry.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
-- No table, no column, no policy, no grant change, no new role, no index, no
-- vocabulary, no telemetry, no backfill, no job, no schedule, and no widening of
-- `source_type`. It re-declares ONE function, with the SAME signature, the same
-- return type, the same `security invoker` posture and the same empty
-- `search_path` -- so RLS on `entries`, `entry_embeddings` and `memories`
-- remains the boundary that actually holds, exactly as
-- `phase_2k_knowledge_retrieval_ownership.sql` asserts.
--
-- ROLLBACK: re-declare the prior definition. No data is transformed, so nothing
-- is lost by going back -- the only effect is that archived and scheduled
-- memories resume displacing live ones.
-- ---------------------------------------------------------------------------

create or replace function public.match_internal_knowledge(
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8
)
returns table (
  source_type text,
  source_id uuid,
  content text,
  similarity double precision,
  occurred_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select matches.source_type, matches.source_id, matches.content, matches.similarity, matches.occurred_at
  from (
    select
      'entry'::text as source_type,
      public.entries.id as source_id,
      public.entry_embeddings.content,
      1 - (public.entry_embeddings.embedding operator(extensions.<=>) p_query_embedding) as similarity,
      public.entries.occurred_at
    from public.entry_embeddings
    join public.entries on public.entries.id = public.entry_embeddings.entry_id
    where public.entry_embeddings.user_id = (select auth.uid())
    union all
    select
      'memory'::text,
      public.memories.id,
      public.memories.content,
      1 - (public.memories.embedding operator(extensions.<=>) p_query_embedding),
      coalesce(public.memories.valid_from, public.memories.created_at)
    from public.memories
    where public.memories.user_id = (select auth.uid())
      and public.memories.embedding is not null
      -- `2N-CORRECT-003`. Inside the union arm, so an out-of-force memory is
      -- gone before the ordering and the bound ever see it, and cannot occupy a
      -- slot a live memory would have taken.
      and (public.memories.valid_from is null or public.memories.valid_from <= now())
      and (public.memories.valid_until is null or public.memories.valid_until > now())
  ) matches
  order by matches.similarity desc
  limit least(greatest(coalesce(p_match_count, 8), 1), 20);
$$;

-- Re-stated rather than assumed. `create or replace` preserves the existing
-- grants because the signature is unchanged, and re-issuing exactly what
-- `202607160006` issued keeps that visible in this file instead of requiring a
-- reader to go and check. Deliberately NOT revoking from `PUBLIC`: Postgres
-- grants EXECUTE on a new function to `PUBLIC`, `anon` is refused at the TABLE
-- grant rather than at the function, and changing that posture is not this
-- migration's business.
grant execute on function public.match_internal_knowledge(extensions.vector, integer) to authenticated;
revoke all on function public.match_internal_knowledge(extensions.vector, integer) from anon;

-- ---------------------------------------------------------------------------
-- Verification. Raises only on failure, so a migration that did not achieve
-- what its header claims cannot report success.
-- ---------------------------------------------------------------------------
do $$
declare
  body text;
begin
  select pg_get_functiondef(
           'public.match_internal_knowledge(extensions.vector, integer)'::regprocedure
         )
    into body;

  if body is null then
    raise exception 'M1: match_internal_knowledge is not declared after this migration';
  end if;

  if position('valid_from' in body) = 0 or position('valid_until' in body) = 0 then
    raise exception 'M1: the retrieval function does not read both validity columns';
  end if;

  -- The whole point of the migration: the predicate must sit inside the union,
  -- AHEAD of the bound. Both tokens are matched precisely rather than as bare
  -- words -- `pg_get_functiondef` returns the body's own comments too, so a
  -- looser search would compare a sentence against a clause and could pass or
  -- fail on prose.
  if position('valid_until is null' in body) = 0 then
    raise exception 'M1: the validity predicate is not present in the retrieved set';
  end if;

  if position('limit least(' in body) = 0 then
    raise exception 'M1: the bound is no longer expressed as this check can read it';
  end if;

  if position('limit least(' in body) < position('valid_until is null' in body) then
    raise exception 'M1: validity is applied after the bound, which is the defect this migration exists to remove';
  end if;

  if (select prosecdef
        from pg_proc
       where oid = 'public.match_internal_knowledge(extensions.vector, integer)'::regprocedure) then
    raise exception 'M1: match_internal_knowledge became SECURITY DEFINER, which would bypass the RLS this retrieval depends on';
  end if;

  if not has_function_privilege('authenticated',
       'public.match_internal_knowledge(extensions.vector, integer)', 'execute') then
    raise exception 'M1: authenticated lost EXECUTE on the retrieval function';
  end if;
end;
$$;
