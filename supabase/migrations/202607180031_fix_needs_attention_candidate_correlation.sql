-- Phase 2X Slice 2X.10 hotfix: fix a name-collision bug in
-- list_needs_attention's has_unconfirmed_candidate check.
--
-- Migration 202607180030 computed has_unconfirmed_candidate as:
--
--   exists (
--     select 1
--     from generate_series(0, ... - 1) as candidate_index
--     where not exists (
--       select 1 from public.tasks t
--       where ... and t.candidate_index = candidate_index and ...
--     )
--   )
--
-- The outer generate_series alias is named candidate_index — the same name
-- as public.tasks's own candidate_index column. Inside the inner correlated
-- subquery (from public.tasks t), the bare, unqualified candidate_index on
-- the right-hand side of "t.candidate_index = candidate_index" resolves
-- against the *innermost* scope first, i.e. tasks itself, not the outer
-- generate_series value. The comparison silently became
-- "t.candidate_index = t.candidate_index" (always true) instead of
-- "t.candidate_index = <the outer loop's index>".
--
-- Effect, confirmed live against the linked project before this fix: as soon
-- as ANY task existed for an entry, the inner NOT EXISTS became false for
-- *every* generate_series value, so has_unconfirmed_candidate went false
-- even when a different candidate index on the same current interpretation
-- was still genuinely unconfirmed. Confirming one of two candidates
-- incorrectly removed the entry from the Needs Attention queue entirely,
-- instead of leaving it listed until the remaining candidate was resolved
-- (NY-004/NY-013).
--
-- Fix: name the generate_series output as a two-part alias
-- (candidate_slot(idx)) that cannot collide with any table's own column
-- name, and reference it explicitly as candidate_slot.idx. Every other
-- predicate, the function signature, security definer, search_path, grants,
-- and the supporting index from migration 030 are unchanged.

create or replace function public.list_needs_attention(
  p_limit integer default 21,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_entry_id uuid default null
)
returns table (
  entry_id uuid,
  reason text,
  occurred_at timestamptz,
  current_interpretation_id uuid,
  job_id uuid,
  open_question_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with scoped_user as (
    select auth.uid() as id
  ),
  bound as (
    select least(greatest(coalesce(p_limit, 21), 1), 200) as lim
  ),
  candidate_entries as (
    select e.id
    from public.entries e, scoped_user u
    where e.user_id = u.id
      and e.status in ('awaiting_review', 'partially_processed', 'recoverable_error', 'terminal_error')
    union
    select e.id
    from public.entries e
    join public.entry_interpretations ei on ei.id = e.current_interpretation_id
    cross join scoped_user u
    where e.user_id = u.id
      and e.status = 'completed'
      and ei.is_record_only = false
      and jsonb_array_length(coalesce(ei.task_candidates, '[]'::jsonb)) > 0
    union
    select e.id
    from public.entries e
    cross join scoped_user u
    where e.user_id = u.id
      and e.status = 'completed'
      and exists (
        select 1 from public.pending_questions pq
        where pq.user_id = u.id and pq.entry_id = e.id and pq.status = 'open'
      )
    union
    select e.id
    from public.entries e
    cross join scoped_user u
    where e.user_id = u.id
      and e.status = 'saved'
      and exists (
        select 1
        from public.jobs j
        where j.user_id = u.id
          and j.type = 'interpret_entry'
          and (j.payload ->> 'entry_id')::uuid = e.id
          and (
            j.status = 'completed'
            or j.status not in ('pending', 'running', 'failed', 'completed', 'exhausted')
          )
      )
  ),
  latest_job as (
    select distinct on (j.user_id, (j.payload ->> 'entry_id'))
      (j.payload ->> 'entry_id')::uuid as entry_id,
      j.id as job_id,
      j.status as job_status,
      j.next_attempt_at as job_retry_at
    from public.jobs j, scoped_user u
    where j.user_id = u.id
      and j.type = 'interpret_entry'
      and (j.payload ->> 'entry_id')::uuid in (select id from candidate_entries)
    order by j.user_id, (j.payload ->> 'entry_id'), j.created_at desc
  ),
  facts as (
    select
      e.id as entry_id,
      e.status as entry_status,
      e.updated_at as entry_updated_at,
      e.current_interpretation_id,
      lj.job_id,
      lj.job_status,
      lj.job_retry_at,
      coalesce(ei.is_record_only, false) as record_only,
      jsonb_array_length(coalesce(ei.task_candidates, '[]'::jsonb)) as candidate_count,
      exists (
        select 1 from public.pending_questions pq
        where pq.user_id = e.user_id and pq.entry_id = e.id and pq.status = 'open'
      ) as has_open_question,
      (
        -- uuid has no min() aggregate; order+limit picks the oldest open
        -- question deterministically instead.
        select pq.id from public.pending_questions pq
        where pq.user_id = e.user_id and pq.entry_id = e.id and pq.status = 'open'
        order by pq.created_at, pq.id
        limit 1
      ) as open_question_id,
      exists (
        select 1
        from generate_series(0, jsonb_array_length(coalesce(ei.task_candidates, '[]'::jsonb)) - 1) as candidate_slot(idx)
        where not exists (
          select 1 from public.tasks t
          where t.user_id = e.user_id
            and t.source_entry_id = e.id
            and t.candidate_index = candidate_slot.idx
            and t.status <> 'cancelled'
            and (t.source_interpretation_id = e.current_interpretation_id or t.source_interpretation_id is null)
        )
      ) as has_unconfirmed_candidate
    from public.entries e
    left join public.entry_interpretations ei on ei.id = e.current_interpretation_id
    left join latest_job lj on lj.entry_id = e.id
    where e.id in (select id from candidate_entries)
  ),
  resolved as (
    select
      f.entry_id,
      f.current_interpretation_id,
      f.job_id,
      f.open_question_id,
      f.entry_updated_at as occurred_at,
      case
        when f.job_status is not null and f.job_status not in ('pending', 'running', 'failed', 'completed', 'exhausted')
          then 'resolve_consistency'
        when f.entry_status = 'terminal_error' or f.job_status = 'exhausted'
          then 'retry_processing'
        when f.job_status in ('pending', 'running')
          then null
        when f.job_status = 'failed' and f.job_retry_at is not null and f.job_retry_at > now()
          then null
        when f.entry_status in ('interpreting', 'reprocessing')
          then null
        when f.entry_status = 'recoverable_error'
          then 'retry_processing'
        when f.entry_status in ('awaiting_review', 'partially_processed')
          then 'review_interpretation'
        when f.entry_status = 'completed' and f.has_open_question
          then 'answer_existing_question'
        when f.entry_status = 'completed'
          and f.candidate_count > 0
          and not f.record_only
          and f.has_unconfirmed_candidate
          then 'confirm_existing_candidates'
        when f.entry_status = 'saved' and f.job_status = 'completed'
          then 'resolve_consistency'
        else null
      end as reason
    from facts f
  )
  select r.entry_id, r.reason, r.occurred_at, r.current_interpretation_id, r.job_id, r.open_question_id
  from resolved r, bound b
  where r.reason is not null
    and (
      p_cursor_occurred_at is null
      or (r.occurred_at, r.entry_id) < (p_cursor_occurred_at, p_cursor_entry_id)
    )
  order by r.occurred_at desc, r.entry_id desc
  limit (select lim from bound);
$$;

grant execute on function public.list_needs_attention(integer, timestamptz, uuid) to authenticated;
revoke all on function public.list_needs_attention(integer, timestamptz, uuid) from public, anon;
