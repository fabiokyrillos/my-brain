-- Life Brain LB-M3 (slice B.3, ADR-150; PRD `LB-B-007`).
--
-- The chat's retrieval gains a date window. "O que eu falei sobre a viagem em
-- março?" and "o que aconteceu semana passada?" used to retrieve by meaning
-- alone, across every date the owner ever wrote, and leave the model to sort
-- out which rows were from March — with eight rows to work with, the right ones
-- were often not among them.
--
-- Two things, and only these two:
--
--  1. `public.match_internal_knowledge(vector, integer, timestamptz, timestamptz)`
--     — the retrieval with `p_since` (inclusive) and `p_until` (exclusive) on
--     the same instant the row already returns as `occurred_at`. Either bound
--     may be null. The window is applied **inside each union arm**, ahead of
--     the ordering and the bound, for the reason `202608130093` applied the
--     validity window there: a row outside the window must never occupy a slot
--     a row inside it would have taken. No defaults, so a call with two
--     arguments can never be ambiguous between the two signatures.
--  2. The two-argument signature, kept for every existing caller and test, now
--     delegates to the four-argument one with both bounds null. One body, so
--     the validity rule and the window rule cannot drift apart between them.
--
-- Both stay `security invoker` with an empty `search_path`: retrieval is
-- owner-scoped by RLS and by the `auth.uid()` predicate, never by a definer.
-- Recency re-ranking ("última vez", "recente") is the application's: the rows
-- already carry `occurred_at`, and ordering by it needs no new SQL.

create or replace function public.match_internal_knowledge(
  p_query_embedding extensions.vector(1536),
  p_match_count integer,
  p_since timestamptz,
  p_until timestamptz
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
      -- LB-B-007. Inside the arm, so an entry outside the window is gone before
      -- the ordering and the bound see it.
      and (p_since is null or public.entries.occurred_at >= p_since)
      and (p_until is null or public.entries.occurred_at < p_until)
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
      -- LB-B-007. The same instant the row returns as `occurred_at`.
      and (p_since is null or coalesce(public.memories.valid_from, public.memories.created_at) >= p_since)
      and (p_until is null or coalesce(public.memories.valid_from, public.memories.created_at) < p_until)
  ) matches
  order by matches.similarity desc
  limit least(greatest(coalesce(p_match_count, 8), 1), 20);
$$;

revoke all on function public.match_internal_knowledge(extensions.vector, integer, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.match_internal_knowledge(extensions.vector, integer, timestamptz, timestamptz)
  to authenticated;

-- The two-argument signature: unchanged contract, one body.
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
  select windowed.source_type, windowed.source_id, windowed.content, windowed.similarity, windowed.occurred_at
  from public.match_internal_knowledge(p_query_embedding, p_match_count, null::timestamptz, null::timestamptz) as windowed;
$$;

revoke all on function public.match_internal_knowledge(extensions.vector, integer)
  from public, anon;
grant execute on function public.match_internal_knowledge(extensions.vector, integer)
  to authenticated;

-- Post-deploy assertions, against the catalog this migration just wrote.
do $$
declare
  body text;
begin
  select pg_get_functiondef(
           'public.match_internal_knowledge(extensions.vector, integer, timestamptz, timestamptz)'::regprocedure
         )
    into body;
  if body is null then
    raise exception 'LB-M3: the windowed retrieval is not declared';
  end if;
  if position('p_since is null or public.entries.occurred_at >= p_since' in body) = 0
     or position('p_until is null or coalesce(public.memories.valid_from, public.memories.created_at) < p_until' in body) = 0 then
    raise exception 'LB-M3: the window is not applied in both arms';
  end if;
  if position('limit least(' in body) < position('p_until is null or coalesce(public.memories.valid_from' in body) then
    raise exception 'LB-M3: the window is applied after the bound';
  end if;
  if position('valid_until is null' in body) = 0 then
    raise exception 'LB-M3: the validity window was lost';
  end if;
  if exists (
    select 1 from pg_proc
    where proname = 'match_internal_knowledge' and pronamespace = 'public'::regnamespace and prosecdef
  ) then
    raise exception 'LB-M3: a retrieval signature became SECURITY DEFINER, which would bypass RLS';
  end if;
  if has_function_privilege('anon', 'public.match_internal_knowledge(extensions.vector, integer, timestamptz, timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.match_internal_knowledge(extensions.vector, integer, timestamptz, timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.match_internal_knowledge(extensions.vector, integer)', 'execute') then
    raise exception 'LB-M3: the retrieval grants are not authenticated-only';
  end if;
end;
$$;
