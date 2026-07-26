-- Phase 2E Slice 2E.2 — deterministic task candidate generation (PRD §13.2).
--
-- This migration adds the *read* half of natural-language task matching. It
-- mutates nothing: Epic 2E-B's acceptance criteria end with "no mutation exists
-- in this slice", and the first task-mutation RPC this codebase has ever had
-- arrives in Slice 2E.4.
--
-- Three requirements shape the function below, and each of them is a defect
-- this repository already shipped once in `src/features/interpretations/
-- entity-resolution.ts`:
--
--   2E-MATCH-003  The candidate query orders totally and deterministically
--                 *before* it truncates. `rankEntityCandidates` does
--                 `.slice(0, MAX_ENTITY_CANDIDATES)` on an unordered array and
--                 only then scores, so which candidates survive depends on the
--                 order PostgREST happened to return.
--   2E-MATCH-004  The query asks for one row beyond the limit, so truncation is
--                 *detectable*. Silently dropping the row that would have won
--                 is exactly the "confident wrong match" of PRD §20.
--   2E-MATCH-007  `public.normalize_entity_alias` is the authoritative
--                 normalizer, because it is `immutable` and therefore usable in
--                 an index and in an ORDER BY. Every lexical decision below is
--                 made by it, in SQL. Nothing in TypeScript re-normalizes, so
--                 the divergence characterized by 2E-MATCH-008 cannot reach a
--                 candidacy decision.
--
-- `security definer`, following the `list_needs_attention` read-projection
-- precedent, after `security invoker` was written and rejected.
--
-- Invoker is what 2E-MATCH-001's "and by RLS" clause literally wants, and it
-- cannot be had: `202607170020:314` revokes EXECUTE on
-- `public.normalize_entity_alias` from `public, anon, authenticated`, and that
-- function carries a non-null `proconfig`, so the planner may not inline it and
-- the ACL check reaches the caller. Every lexical decision below would raise
-- `42501` for the only role that will ever call this. Migration `202607170022`
-- exists solely to work around the same revoke, and resolved it the same way:
-- by making the consumer `security definer`.
--
-- Granting `authenticated` EXECUTE would also work — the function is a pure
-- text transform that reads nothing — but 2E-OWNERSHIP-003 and PRD §14 say no
-- grant is widened by this phase, and quietly reversing a deliberate hardening
-- decision from another slice is not this slice's call to make.
--
-- What that costs, stated plainly rather than papered over: inside this
-- function ownership rests on the `auth.uid()` predicate below, not on RLS,
-- because the definer owns these tables. RLS still forces the boundary on every
-- other path to them. So the three layers 2E-MATCH-001 asks for are the
-- predicate here, the owner filter in `rankTaskCandidates`, and the raise in
-- `loadTaskCandidates` — and, more usefully than any of them, cross-owner
-- denial is *proven* through this function by
-- `supabase/tests/phase_2e_task_command_matching.sql` rather than argued from
-- role attributes.
--
-- No index is created here. An expression index on
-- `(user_id, normalize_entity_alias(title))` was written and removed: the
-- candidate query below qualifies on a disjunction of lexical *and* relation
-- signals, so `normalize_entity_alias(title)` never appears in a sargable
-- position and no plan can use it — while index maintenance evaluates the
-- expression as the *writing* role, which would have raised `42501` on
-- `createRecord`'s direct client insert (`src/features/operations/actions.ts:68`)
-- and broken task creation outright. 2E-MATCH-007 designates this normalizer
-- authoritative because it *is* index-expressible; it does not oblige a slice
-- with nothing to index to add one. `tasks_user_status_due_idx` is the access
-- path this query actually uses.
--
-- The projection is wider than ranking needs, deliberately. `create or replace`
-- cannot add, rename or retype a `RETURNS TABLE` column — Postgres raises
-- `42P13` — so every column Slices 2E.3 and 2E.4 will need had to be decided
-- here or bought with a `_v2` in the very next slice, which is the versioned-RPC
-- sprawl ADR-037 exists to contain. So the whole observed pre-state of every
-- field the §11.2 taxonomy can change travels with the candidate: 2E-PREVIEW-002
-- can render before/after without re-reading the task, and 2E-UPDATE-003 can
-- gate on a pre-state observed at the *same* instant that produced the match
-- rather than at a later one. Any column change after this still needs a `_v2`.

create or replace function public.list_task_command_candidates(
  p_eligible_statuses text[],
  p_title_query text default null,
  p_project_hint text default null,
  p_context_hint text default null,
  p_person_hint text default null,
  p_observed_before timestamptz default null,
  p_limit integer default 25
)
returns table (
  task_id uuid,
  owner_id uuid,
  title text,
  description text,
  status text,
  due_at timestamptz,
  planned_at timestamptz,
  manual_priority text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  intentional_no_due boolean,
  no_due_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  project_ids uuid[],
  project_names text[],
  context_ids uuid[],
  context_names text[],
  person_ids uuid[],
  person_names text[],
  person_roles text[],
  project_hint_matched boolean,
  context_hint_matched boolean,
  person_hint_matched boolean,
  last_audited_at timestamptz,
  observed_before timestamptz,
  prefilter_tier integer,
  token_overlap integer,
  query_token_count integer,
  effective_limit integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  bounds as (
    select
      least(greatest(coalesce(p_limit, 25), 1), 100) as lim,
      -- The recency signal of 2E-MATCH-006 must exclude rows written by the
      -- current command. Matching runs before any write, so the truthful and
      -- testable way to say that is "audit rows strictly older than the
      -- instant this command was resolved against" — which also makes the
      -- signal a pure function of the clock the caller injected, as
      -- 2E-MATCH-017 requires. `now()` is only the fallback for direct SQL and
      -- pgTAP; the application always passes its injected instant, and the
      -- instant actually used is echoed back so the pre-state a later slice
      -- gates on is one this function vouched for.
      coalesce(p_observed_before, now()) as observed_before
  ),
  statuses as (
    -- Eligibility is owned by the TypeScript taxonomy (PRD §11.2 as data), so
    -- it arrives as a parameter rather than being restated here — one taxonomy
    -- is an Epic 2E-H convergence requirement. What this CTE does is fail
    -- closed: an element outside the eight `tasks_status_check` literals is
    -- dropped rather than widening candidacy, and an empty or wholly invalid
    -- array yields no candidates at all.
    --
    -- This list is the third copy of those literals (the CHECK and
    -- `TASK_STATUSES` are the others) and it fails *silently*, so
    -- `status-vocabulary-parity.test.ts` reads this file and reds if it ever
    -- stops matching the taxonomy.
    -- Bounded like every other argument, and for the same reason the hints are
    -- (see below): PostgREST exposes this function directly, and this was the
    -- one input a caller could make arbitrarily large. The bound is on the
    -- *input* rather than the output, because `distinct` over a million-element
    -- array does the work whatever the result size.
    --
    -- 32 against a vocabulary of 8: a legitimate caller sends at most the eight
    -- literals, so the slice cannot drop a value the membership filter would
    -- have kept, and the margin leaves room for duplicates without inventing a
    -- reason for a well-formed command to fail.
    select array(
      select distinct s
      from unnest((coalesce(p_eligible_statuses, '{}'::text[]))[1:32]) as s
      where s in (
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred',
        'completed', 'cancelled'
      )
    ) as eligible
  ),
  hints as (
    -- `normalize_entity_alias` is `strict`, so a null argument returns null;
    -- the coalesce around the argument keeps every hint a string.
    --
    -- Bounded here and not only in TypeScript. The 2E-COMMAND-005 caps live in
    -- the command schema, but PostgREST exposes this function directly to any
    -- authenticated caller, and an unbounded hint turns the token lateral below
    -- into an unbounded number of `LIKE` comparisons per candidate. The lengths
    -- match the columns each hint is compared against: `tasks.title` is capped
    -- at 240, `projects.name` and `people.name` at 160, `contexts.name` at 120.
    --
    -- Normalization also closes a LIKE-metacharacter hole for free: the
    -- function's own `[^a-z0-9]+` replacement means no `%`, `_` or backslash
    -- can survive into the containment tests below, so the model-supplied hint
    -- cannot widen its own pattern.
    select
      public.normalize_entity_alias(left(coalesce(p_title_query, ''), 240)) as q,
      public.normalize_entity_alias(left(coalesce(p_project_hint, ''), 160)) as project_q,
      public.normalize_entity_alias(left(coalesce(p_context_hint, ''), 120)) as context_q,
      public.normalize_entity_alias(left(coalesce(p_person_hint, ''), 160)) as person_q
  ),
  hint_query as (
    select
      h.q,
      h.project_q,
      h.context_q,
      h.person_q,
      -- Ordered before it is bounded, for the same reason the candidate query
      -- is: an arbitrary sixteen of a caller's tokens would make scoring depend
      -- on something no fixture can pin. Sixteen is above MAX_TITLE_WORDS (12),
      -- so a well-formed command never reaches it.
      array(
        select distinct tok
        from unnest(string_to_array(h.q, ' ')) as tok
        where tok <> ''
        order by tok
        limit 16
      ) as tokens
    from hints h
  ),
  scanned as (
    select
      t.id,
      t.user_id,
      t.title,
      t.description,
      t.status,
      t.due_at,
      t.planned_at,
      t.manual_priority,
      t.completed_at,
      t.cancelled_at,
      t.intentional_no_due,
      t.no_due_reason,
      t.created_at,
      t.updated_at,
      public.normalize_entity_alias(t.title) as nt,
      -- A relation hint qualifies a candidate as well as scoring it. Without
      -- that, "mark the Acme task as done" could never reach a task titled
      -- "Send invoice" that lives in project Acme, because no lexical signal
      -- connects the hint to the title.
      (
        q.project_q <> '' and exists (
          select 1
          from public.task_projects tp
          join public.projects p
            on p.id = tp.project_id and p.user_id = tp.user_id
          where tp.task_id = t.id
            and tp.user_id = t.user_id
            and (
              public.normalize_entity_alias(p.name) = q.project_q
              or ' ' || public.normalize_entity_alias(p.name) || ' '
                 like '% ' || q.project_q || ' %'
            )
        )
      ) as project_hit,
      (
        q.context_q <> '' and exists (
          select 1
          from public.task_contexts tc
          join public.contexts c
            on c.id = tc.context_id and c.user_id = tc.user_id
          where tc.task_id = t.id
            and tc.user_id = t.user_id
            and (
              public.normalize_entity_alias(c.name) = q.context_q
              or ' ' || public.normalize_entity_alias(c.name) || ' '
                 like '% ' || q.context_q || ' %'
            )
        )
      ) as context_hit,
      (
        q.person_q <> '' and exists (
          select 1
          from public.task_people tpe
          join public.people pe
            on pe.id = tpe.person_id and pe.user_id = tpe.user_id
          where tpe.task_id = t.id
            and tpe.user_id = t.user_id
            and (
              public.normalize_entity_alias(pe.name) = q.person_q
              or ' ' || public.normalize_entity_alias(pe.name) || ' '
                 like '% ' || q.person_q || ' %'
            )
        )
      ) as person_hit
    from public.tasks t
    cross join caller cl
    cross join hint_query q
    cross join statuses st
    where cl.id is not null
      and t.user_id = cl.id
      and t.status = any (st.eligible)
  ),
  tiered as (
    select
      s.*,
      o.overlap,
      cardinality(q.tokens) as query_tokens,
      case
        -- 0: the normalized title *is* the normalized hint.
        when q.q <> '' and s.nt = q.q then 0
        -- 1: the whole hint appears in the title as complete words. Bounded
        -- below three characters, because a one- or two-letter fragment
        -- containing itself in half the user's tasks is noise, not a signal.
        when q.q <> ''
          and length(q.q) >= 3
          and ' ' || s.nt || ' ' like '% ' || q.q || ' %' then 1
        -- 2: some lexical or relational connection exists.
        when (q.q <> '' and o.overlap > 0)
          or s.project_hit or s.context_hit or s.person_hit then 2
        -- 3: no connection. Only reachable when the command carried no hint at
        -- all, in which case every eligible task is a candidate and the
        -- overflow flag is what tells the caller the truncation was arbitrary.
        else 3
      end as tier
    from scanned s
    cross join hint_query q
    cross join lateral (
      select count(*)::integer as overlap
      from unnest(q.tokens) as tok
      where ' ' || s.nt || ' ' like '% ' || tok || ' %'
    ) o
  ),
  ranked as (
    select tr.*
    from tiered tr
    cross join hint_query q
    where
      (q.q = '' and q.project_q = '' and q.context_q = '' and q.person_q = '')
      or tr.tier <= 2
    -- 2E-MATCH-003: total and deterministic, keyed on the hint-correlated tier
    -- and ending in `id`, which is unique — so no two orderings of the same
    -- rows are possible and truncation is never arbitrary.
    order by
      tr.tier,
      tr.overlap desc,
      (tr.project_hit::integer + tr.context_hit::integer + tr.person_hit::integer) desc,
      tr.created_at desc,
      tr.id
    -- 2E-MATCH-004: one row beyond the limit, so the caller can tell a full
    -- page from a truncated one.
    limit (select b.lim + 1 from bounds b)
  )
  select
    r.id,
    r.user_id,
    r.title,
    r.description,
    r.status,
    r.due_at,
    r.planned_at,
    r.manual_priority,
    r.completed_at,
    r.cancelled_at,
    r.intentional_no_due,
    r.no_due_reason,
    r.created_at,
    r.updated_at,
    coalesce(pn.ids, '{}'::uuid[]),
    coalesce(pn.names, '{}'::text[]),
    coalesce(cn.ids, '{}'::uuid[]),
    coalesce(cn.names, '{}'::text[]),
    coalesce(sn.ids, '{}'::uuid[]),
    coalesce(sn.names, '{}'::text[]),
    coalesce(sn.roles, '{}'::text[]),
    r.project_hit,
    r.context_hit,
    r.person_hit,
    al.last_audited_at,
    b.observed_before,
    r.tier,
    r.overlap,
    r.query_tokens,
    b.lim
  from ranked r
  cross join bounds b
  -- Relations and recency are resolved *after* truncation, over at most
  -- `lim + 1` rows. Neither decides candidacy, so neither is worth paying for
  -- across the whole eligible population.
  --
  -- Ids travel with the names, and every array in a group shares one ORDER BY,
  -- so position `n` of `person_ids`, `person_names` and `person_roles` describes
  -- one row. 2E-PREVIEW-005 has to detect "assigning a relation the task
  -- already has", and comparing names in TypeScript would mean re-normalizing
  -- them there — exactly what 2E-MATCH-007 forbids. The role travels for the
  -- same reason: `assign_person` and `set_waiting_on` write different roles, and
  -- a name alone cannot tell them apart.
  left join lateral (
    select
      array_agg(p.id order by p.name, p.id) as ids,
      array_agg(p.name order by p.name, p.id) as names
    from public.task_projects tp
    join public.projects p on p.id = tp.project_id and p.user_id = tp.user_id
    where tp.task_id = r.id and tp.user_id = r.user_id
  ) pn on true
  left join lateral (
    select
      array_agg(c.id order by c.name, c.id) as ids,
      array_agg(c.name order by c.name, c.id) as names
    from public.task_contexts tc
    join public.contexts c on c.id = tc.context_id and c.user_id = tc.user_id
    where tc.task_id = r.id and tc.user_id = r.user_id
  ) cn on true
  left join lateral (
    -- No DISTINCT here, unlike a name-only projection: `task_people` is keyed
    -- (task_id, person_id, role), so one person legitimately appears twice
    -- under two roles and collapsing them would lose the role that matters.
    select
      array_agg(pe.id order by pe.name, pe.id, tpe.role) as ids,
      array_agg(pe.name order by pe.name, pe.id, tpe.role) as names,
      array_agg(tpe.role order by pe.name, pe.id, tpe.role) as roles
    from public.task_people tpe
    join public.people pe on pe.id = tpe.person_id and pe.user_id = tpe.user_id
    where tpe.task_id = r.id and tpe.user_id = r.user_id
  ) sn on true
  left join lateral (
    -- 2E-MATCH-006. `audit_logs_user_entity_idx (user_id, entity_type,
    -- entity_id)` is the access path. The blind spot is declared rather than
    -- hidden: `audit_task_change` watches only status, due_at, manual_priority,
    -- planned_at and parent_task_id, so a rename or an appended note leaves no
    -- historical row. Slice 2E.4 extends the trigger's watched columns to
    -- title and description (2E-UPDATE-010), after which Phase 2E's own writes
    -- are fully covered.
    --
    -- `tasks.updated_at` is deliberately not the source: it records mutation
    -- time, ties exactly in the canonical two-identical-titles ambiguity case,
    -- and is bumped by Phase 2E's own writes. It is projected above for
    -- staleness detection (2E-PREVIEW-006), which is a different question.
    select max(a.created_at) as last_audited_at
    from public.audit_logs a
    where a.user_id = r.user_id
      and a.entity_type = 'task'
      and a.entity_id = r.id
      and a.created_at < b.observed_before
  ) al on true
  -- Repeated because a CTE's ordering is not guaranteed to survive the joins
  -- above. Identical keys, so the truncated set and the returned set agree.
  order by
    r.tier,
    r.overlap desc,
    (r.project_hit::integer + r.context_hit::integer + r.person_hit::integer) desc,
    r.created_at desc,
    r.id;
$$;

comment on function public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer) is
  'Phase 2E deterministic task candidate generation (PRD 2E-MATCH-001..007). Read-only, owner-scoped, ordered before truncation, returns one row beyond p_limit so overflow is detectable, and projects the full observed pre-state so a preview never has to re-read the task.';

grant execute on function public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer) to authenticated;
revoke all on function public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer) from public, anon;
