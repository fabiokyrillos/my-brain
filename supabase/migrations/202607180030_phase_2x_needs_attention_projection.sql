-- Phase 2X Slice 2X.10: "Precisa de você" (Needs Attention) query and projection.
--
-- This is a derived queue, not a new source of truth (NY-001): every fact it
-- reads already exists in entries/entry_interpretations/pending_questions/
-- tasks/jobs. The one thing this migration adds is a database-side
-- evaluation of the same five-reason precedence already codified in
-- src/features/daily-cycle/lifecycle.ts (resolveDailyCycleLifecycle), so the
-- filter can run at the database layer instead of scanning every owned
-- entry in application code (XG-025: no unbounded per-user scan).
--
-- Why this can't simply call the TypeScript mapper: Postgres functions can't
-- invoke server-side TypeScript, and Inbox's existing bounded-page approach
-- (compute lifecycle for a fixed page of entries, in any order) does not
-- generalize to "find every entry that currently needs attention" across an
-- unbounded, ever-growing entry history — that decision has to be made by
-- the database so only genuinely-actionable rows are paged over. The CASE
-- expression below is intentionally ordered to match
-- resolveDailyCycleLifecycle's branches one for one (fail-closed unknown
-- state, terminal/exhausted, active-job organizing, interpreting/
-- reprocessing, recoverable_error, awaiting_review/partially_processed,
-- completed sub-branches, saved+completed-job fallback) so the two stay in
-- sync by inspection; supabase/tests/needs_attention_projection.sql exercises
-- the same scenario matrix as lifecycle.test.ts to catch drift.
--
-- Bounding strategy: rather than scanning all of a user's entries, the
-- driving set (candidate_entries) is restricted to entries whose status
-- alone already implies possible attention (awaiting_review,
-- partially_processed, recoverable_error, terminal_error), plus completed
-- entries that structurally could still have an open decision (a non-empty,
-- non-record-only candidate list on the current interpretation, or an open
-- pending question), plus the narrow saved+completed-job / saved+unknown-job
-- fallback used for the same "resolve_consistency" case
-- resolveDailyCycleLifecycle already has. This bounds cost to the user's
-- actual backlog, not their total historical entry count.
--
-- Known, documented limitation: an entry sitting in "interpreting" or
-- "reprocessing" whose job has independently become "exhausted" or an
-- unrecognized status before the entry's own status is updated to reflect
-- that (a transient race that self-corrects on the next dispatch/reaper
-- tick, since fail_entry_interpretation/reap_expired_jobs update both
-- together in the same transaction in every path this schema has) will not
-- surface in this queue until that status settles. This mirrors the same
-- fail-closed philosophy as the rest of Phase 2X without requiring an
-- unbounded scan to catch an already self-correcting race.

create index jobs_interpret_entry_status_idx
  on public.jobs (user_id, status)
  where type = 'interpret_entry';

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
        from generate_series(0, jsonb_array_length(coalesce(ei.task_candidates, '[]'::jsonb)) - 1) as candidate_index
        where not exists (
          select 1 from public.tasks t
          where t.user_id = e.user_id
            and t.source_entry_id = e.id
            and t.candidate_index = candidate_index
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
