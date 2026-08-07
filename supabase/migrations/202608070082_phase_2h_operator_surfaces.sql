-- Phase 2H, slice 2H.4 -- the operator surfaces, and the wiring that makes
-- 2H.2's producers visible.
--
-- 2H-OPS-001 (a system-health read: queue depth, expired leases, scheduled-job
--             liveness, error-sink volume by class),
-- 2H-OPS-002 (an account-health read: lifecycle distribution and stalled
--             deletions with their reason codes),
-- 2H-OPS-003 (read-only and least-privilege: service_role only, no mutation),
-- 2H-OPS-004 (no user content, no credential material, no session identifier),
-- 2H-SINK-005 (the sink gains a reachable consumer),
-- 2H-DEADMAN-004 (deployment parity is readable beside liveness -- the CLI half
--                 lives in scripts/, because parity is a git-and-platform fact
--                 that no database can compute).
--
-- ADR-075 is the boundary: an operator CLI over narrow `service_role` SQL. No
-- product admin UI and no generic service-role HTTP endpoint. Nothing in this
-- migration can be reached by `anon` or `authenticated`, and nothing in it
-- writes to a product table.
--
-- ADR-082 governs what a migration may schedule: this one schedules NOTHING,
-- arms nothing, and deletes nothing.
--
--
-- THE GAP THIS CLOSES, WHICH 2H.2 LEFT OPEN ON PURPOSE
-- ---------------------------------------------------------------------------
-- 2H.2 built `error_events` and `scheduled_job_health` and deliberately gave
-- them no consumer, because claiming the consumer in the slice that built the
-- producer is ADR-084's failure exactly -- SH.6's quota refusals recorded
-- nothing for weeks while both halves were internally consistent. So this
-- migration is the other half, and it is the half that makes the first one
-- true: without it, `record_scheduled_job_run` had no caller at all and every
-- job in `scheduled_job_liveness` read `never_reported` forever.
--
--
-- WHAT "USEFUL" MEANS HERE, AND WHY IT IS NOT "THE TICK SUCCEEDED"
-- ---------------------------------------------------------------------------
-- The 2H.0 census read `my-brain-entry-dispatch` at 29 042 successful cron
-- ticks while the `jobs` table held four rows, newest five days earlier.
-- `pg_cron` records that the STATEMENT succeeded, not that any work happened.
-- Section 3 therefore reports, for each scheduled path, a `did_work` that is
-- derived from the path's own result -- notifications created, jobs reaped,
-- rows pruned -- and never from the fact that the call returned.
--
-- A run that succeeds having found nothing to do is `success_empty` and is
-- healthy. A run that did something is `success_work`. They are different
-- columns because conflating them hides a dead queue behind a live scheduler.
--
--
-- WHAT THE HEALTH ROW CLAIMS, EXACTLY
-- ---------------------------------------------------------------------------
-- The row says *this maintenance work ran*, not *pg_cron invoked it*. An
-- operator running `prune_auth_event_attempts()` by hand therefore advances
-- the row, and that is deliberate: the work genuinely happened, and the
-- alternative -- inferring the caller from `application_name` -- would make
-- the ledger depend on an undocumented pg_cron detail.
--
-- The schedule's own state is not inferred from this row and never was:
-- `scheduled_job_liveness` reads `cron.job` at run time, so a disabled job
-- classifies `inactive` and a deleted one disappears from the enumeration
-- entirely. Section 4's findings read makes that disappearance visible instead
-- of silent.

-- ---------------------------------------------------------------------------
-- 1. The failure half of the ledger -- 2H-DEADMAN-001
-- ---------------------------------------------------------------------------
--
-- `scheduled_job_health.last_outcome` already permitted 'failed'. Nothing could
-- write it: 2H.2 shipped only `record_scheduled_job_run`, whose two outcomes
-- are both successes. A closed vocabulary with an unreachable member is a
-- promise nothing keeps, so the columns and the writer arrive together.
--
-- `last_failure_at` is separate from `last_success_at` for the reason the whole
-- table exists: a failure must never advance the success clock, or a job that
-- fails every minute reads `current`.

alter table public.scheduled_job_health
  add column last_failure_at timestamptz,
  add column failure_count bigint not null default 0;

alter table public.scheduled_job_health
  add constraint scheduled_job_health_failure_count_check
  check (failure_count >= 0);

comment on column public.scheduled_job_health.last_failure_at is
  '2H-DEADMAN-001. When this job last reported a failed run. Never compared against the staleness threshold and never advanced by a success: it answers "did the last attempt fail?", which is a different question from "has this job run recently?".';

comment on column public.scheduled_job_health.failure_count is
  '2H-DEADMAN-001. How many failed runs this job has reported. A counter, not a message: the reason a run failed belongs in error_events, which has a closed reason vocabulary and no free-text column.';

-- ---------------------------------------------------------------------------
-- 2. The mechanism, split from the door -- 2H-DEADMAN-001, 2H-OPS-003
-- ---------------------------------------------------------------------------
--
-- The upsert moves into `private`, and the `service_role`-guarded RPC becomes a
-- thin wrapper over it. This is not tidiness: the in-database scheduled paths
-- in section 3 run under `pg_cron`, which executes as `postgres`, and
-- `auth.role()` is NULL there. The public RPC would refuse every one of them
-- with 42501 -- the same trap the Management API's `/database/query` sets, and
-- the reason 2H.1's hosted probes had to move to PostgREST.
--
-- `private.*` is executable by NO role. The only ways in are the RPC (guarded,
-- `service_role`) and the DEFINER functions in section 3, which are themselves
-- reachable only by `service_role` and `pg_cron`.

create or replace function private.apply_scheduled_job_run(
  p_job_name text,
  p_did_work boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_job_name is null or p_did_work is null then
    raise exception 'Job name and outcome are required' using errcode = '22023';
  end if;

  insert into public.scheduled_job_health as health (
    job_name, last_success_at, last_useful_at, last_outcome,
    consecutive_empty, success_count, useful_count, updated_at
  ) values (
    p_job_name,
    now(),
    case when p_did_work then now() end,
    case when p_did_work then 'success_work' else 'success_empty' end,
    case when p_did_work then 0 else 1 end,
    1,
    case when p_did_work then 1 else 0 end,
    now()
  )
  on conflict (job_name) do update
  set last_success_at = now(),
      last_useful_at = case when p_did_work then now() else health.last_useful_at end,
      last_outcome = case when p_did_work then 'success_work' else 'success_empty' end,
      consecutive_empty = case when p_did_work then 0 else health.consecutive_empty + 1 end,
      success_count = health.success_count + 1,
      useful_count = health.useful_count + case when p_did_work then 1 else 0 end,
      updated_at = now();
end;
$$;

revoke all on function private.apply_scheduled_job_run(text, boolean)
  from public, anon, authenticated, service_role;

comment on function private.apply_scheduled_job_run(text, boolean) is
  '2H-DEADMAN-001. The mechanism behind record_scheduled_job_run, callable by no role. It exists separately because pg_cron executes as postgres with a NULL auth.role(), so the guarded RPC would refuse every in-database scheduled path this phase wires.';

create or replace function private.apply_scheduled_job_failure(p_job_name text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_job_name is null then
    raise exception 'Job name is required' using errcode = '22023';
  end if;

  -- `last_success_at` and `last_useful_at` are absent from both the INSERT and
  -- the UPDATE. That absence IS 2H-DEADMAN-001: a failure that advanced the
  -- success clock would make a job failing every minute read `current`, which
  -- is the precise shape of health-check theatre this phase exists to refuse.
  insert into public.scheduled_job_health as health (
    job_name, last_outcome, last_failure_at, failure_count, updated_at
  ) values (
    p_job_name, 'failed', now(), 1, now()
  )
  on conflict (job_name) do update
  set last_outcome = 'failed',
      last_failure_at = now(),
      failure_count = health.failure_count + 1,
      updated_at = now();
end;
$$;

revoke all on function private.apply_scheduled_job_failure(text)
  from public, anon, authenticated, service_role;

comment on function private.apply_scheduled_job_failure(text) is
  '2H-DEADMAN-001. Records a failed run WITHOUT advancing last_success_at or last_useful_at. The omission is the requirement.';

-- The 2H.2 door, re-pointed at the mechanism. Signature, guard and grant are
-- unchanged, so its pgTAP coverage still holds and no caller moves.
create or replace function public.record_scheduled_job_run(
  p_job_name text,
  p_did_work boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform private.apply_scheduled_job_run(p_job_name, p_did_work);
end;
$$;

revoke all on function public.record_scheduled_job_run(text, boolean) from public, anon, authenticated;
grant execute on function public.record_scheduled_job_run(text, boolean) to service_role;

create or replace function public.record_scheduled_job_failure(p_job_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform private.apply_scheduled_job_failure(p_job_name);
end;
$$;

revoke all on function public.record_scheduled_job_failure(text) from public, anon, authenticated;
grant execute on function public.record_scheduled_job_failure(text) to service_role;

comment on function public.record_scheduled_job_failure(text) is
  '2H-DEADMAN-001. A scheduled path OUTSIDE the database reports that its run failed. It exists for the Edge Function drain: an in-database path cannot record its own death, because pg_cron runs each statement in one transaction and a re-raise would roll the record back with it. Section 4 reads cron.job_run_details for that case instead.';

-- ---------------------------------------------------------------------------
-- 3. Wiring the real scheduled paths -- 2H-DEADMAN-001
-- ---------------------------------------------------------------------------
--
-- The job NAME is resolved from `cron.job` at call time rather than hard-coded,
-- for the reason T-2H-14 gives for the liveness enumeration: an operator who
-- renames a job must not silently split the ledger in two. The needle is the
-- statement the schedule runs, which is the one thing a rename cannot change.
--
-- A fallback is required rather than optional, and it is used when the needle
-- matches no job or more than one -- because a reporter that stayed silent on
-- ambiguity would be a dead-man switch with a hole in it. A health row whose
-- name matches no cron job is then surfaced by section 4 as a finding, so the
-- fallback landing is visible rather than assumed correct.

create or replace function private.scheduled_job_name(
  p_command_needle text,
  p_fallback text
)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case when pg_catalog.count(*) = 1 then pg_catalog.min(job.jobname)::text end
     from cron.job as job
     where job.command like ('%' || p_command_needle || '%')),
    p_fallback
  );
$$;

revoke all on function private.scheduled_job_name(text, text)
  from public, anon, authenticated, service_role;

comment on function private.scheduled_job_name(text, text) is
  '2H-DEADMAN-001. The cron job name that runs a given statement, or the declared fallback when the catalog holds no unambiguous answer. Resolved at call time so a renamed job keeps one ledger row; a fallback that does not match any job surfaces as an operator finding rather than as silence.';

-- 3.1 The hourly heartbeat.
--
-- `did_work` is the number of notifications actually created, NOT the number of
-- users iterated. The batch iterates every user every hour regardless, so a
-- user count would report `success_work` on a system that produced nothing --
-- which is the census defect written back into the ledger meant to catch it.
--
-- A batch in which every user failed and none succeeded is a FAILED run. A
-- batch with some failures and some successes is a successful run: one user's
-- failure has never blocked this batch, and reporting the whole hour as failed
-- because of one account would train a reader to ignore the column.
create or replace function public.run_all_heartbeats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_record record;
  heartbeat_result jsonb;
  processed integer := 0;
  failed integer := 0;
  created_total integer := 0;
begin
  for user_record in select id from auth.users
  loop
    begin
      heartbeat_result := public.run_user_heartbeat(user_record.id);
      if coalesce((heartbeat_result ->> 'failed')::boolean, false) then
        failed := failed + 1;
        raise warning 'Heartbeat failed for user % with code %', user_record.id, heartbeat_result ->> 'failure_code';
      else
        processed := processed + 1;
        created_total := created_total
          + coalesce((heartbeat_result ->> 'notifications_created')::integer, 0);
      end if;
    exception when others then
      failed := failed + 1;
      raise warning 'Heartbeat failed for user %: %', user_record.id, sqlerrm;
    end;
  end loop;

  if failed > 0 and processed = 0 then
    perform private.apply_scheduled_job_failure(
      private.scheduled_job_name('run_all_heartbeats', 'my-brain-hourly-heartbeat'));
  else
    perform private.apply_scheduled_job_run(
      private.scheduled_job_name('run_all_heartbeats', 'my-brain-hourly-heartbeat'),
      created_total > 0);
  end if;

  return processed;
end;
$$;

revoke all on function public.run_all_heartbeats() from public, anon, authenticated;
grant execute on function public.run_all_heartbeats() to service_role;

comment on function public.run_all_heartbeats() is
  '2H-DEADMAN-001. The hourly batch, now reporting its own run. Useful work is notifications CREATED, not users iterated -- the batch touches every user every hour, so a user count would report health on a system that produced nothing.';

-- 3.2 The job-lease reaper.
--
-- `did_work` is a requeue or an exhaustion having actually happened. An empty
-- queue with no expired lease is the healthy steady state and reports
-- `success_empty`.
create or replace function public.reap_expired_jobs(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_record public.jobs%rowtype;
  requeued_count integer := 0;
  exhausted_count integer := 0;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'Reaper limit must be between 1 and 1000' using errcode = '22023';
  end if;

  for job_record in
    select *
    from public.jobs
    where status = 'running'
      and (lease_expires_at is null or lease_expires_at <= now())
    order by coalesce(lease_expires_at, started_at, created_at)
    for update skip locked
    limit p_limit
  loop
    if job_record.attempts >= job_record.max_attempts then
      update public.jobs
      set status = 'exhausted',
          error = left(coalesce(error, 'Worker lease expired'), 500),
          failed_at = now(),
          locked_at = null,
          locked_by = null,
          lease_expires_at = null
      where id = job_record.id;
      exhausted_count := exhausted_count + 1;
    else
      update public.jobs
      set status = 'failed',
          error = left(coalesce(error, 'Worker lease expired'), 500),
          next_attempt_at = now(),
          failed_at = null,
          locked_at = null,
          locked_by = null,
          lease_expires_at = null
      where id = job_record.id;
      requeued_count := requeued_count + 1;
    end if;
  end loop;

  perform private.apply_scheduled_job_run(
    private.scheduled_job_name('reap_expired_jobs', 'my-brain-job-reaper'),
    requeued_count + exhausted_count > 0);

  return jsonb_build_object(
    'requeued', requeued_count,
    'exhausted', exhausted_count
  );
end;
$$;

comment on function public.reap_expired_jobs(integer) is
  '2H-DEADMAN-001. The lease reaper, now reporting its own run. Useful work is a lease actually requeued or exhausted; an empty queue is the healthy steady state and reports success_empty.';

-- 3.3 and 3.4 The two pre-authorized attempt prunes.
--
-- The DELETE and its predicate are unchanged, byte for byte -- these are
-- destructive sweeps and this slice has no authority over what they remove.
-- Only the report is added, and `did_work` is the row count the delete already
-- produced, so no second read decides it.
create or replace function public.prune_auth_event_attempts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.auth_event_attempts
  where id in (select prunable.id from private.prunable_auth_event_attempt_ids(private.retention_batch_limit()) as prunable(id));
  get diagnostics removed = row_count;

  perform private.apply_scheduled_job_run(
    private.scheduled_job_name('prune_auth_event_attempts', 'sh-prune-auth-event-attempts'),
    removed > 0);

  return removed;
end;
$$;

create or replace function public.prune_credential_validation_attempts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.credential_validation_attempts
  where id in (select prunable.id from private.prunable_credential_validation_attempt_ids(private.retention_batch_limit()) as prunable(id));
  get diagnostics removed = row_count;

  perform private.apply_scheduled_job_run(
    private.scheduled_job_name('prune_credential_validation_attempts', 'byok-prune-validation-attempts'),
    removed > 0);

  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The operator reads -- 2H-OPS-001, 2H-OPS-002, 2H-SINK-005
-- ---------------------------------------------------------------------------
--
-- Every one of them is:
--
--   * `service_role` only, by explicit revoke plus a single grant;
--   * read-only -- no INSERT, UPDATE, DELETE or DDL appears in any body, and
--     they are declared `stable`, so the planner refuses a write in one;
--   * shaped from declared columns, never `jsonb`, so a privacy census can read
--     the output shape out of the catalog instead of out of the source. A
--     `returns jsonb` operator read is unauditable by construction: it has no
--     columns to enumerate.
--
-- 2H-OPS-004 is a property of the column list. There is no column here that can
-- hold entry text, task text, a file name, a prompt, a model response, a
-- provider message, a stack trace, a token, a session identifier or a session
-- hash. Identifiers are: a user id (already the operator's join key in
-- `operator_stalled_deletions`), a job name, and members of closed vocabularies
-- the chain already declared.

-- 4.1 Queue depth, expired leases and the shape of what is stuck.
create or replace function public.operator_job_queue_health()
returns table (
  job_type text,
  status text,
  job_count bigint,
  expired_lease_count bigint,
  due_now_count bigint,
  oldest_created_at timestamptz,
  newest_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  select
    job.type::text,
    job.status::text,
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where job.status = 'running'
        and job.lease_expires_at is not null
        and job.lease_expires_at <= now()),
    -- Claimable now, which is NOT "next_attempt_at is in the past". A completed
    -- job keeps the attempt time it was last scheduled for, so the naive form
    -- reported every finished job as backlog -- a queue-depth read that inflates
    -- with age is worse than none, because it looks like a growing problem.
    pg_catalog.count(*) filter (
      where job.status in ('pending', 'failed')
        and (job.next_attempt_at is null or job.next_attempt_at <= now())),
    pg_catalog.min(job.created_at),
    pg_catalog.max(job.created_at)
  from public.jobs as job
  group by job.type, job.status
  order by job.type, job.status;
end;
$$;

revoke all on function public.operator_job_queue_health() from public, anon, authenticated;
grant execute on function public.operator_job_queue_health() to service_role;

comment on function public.operator_job_queue_health() is
  '2H-OPS-001. Queue depth by type and status, with expired leases and due-now backlog counted in the same pass. Counts and timestamps only: no payload, no error text, no owner.';

-- 4.2 The error sink's consumer -- 2H-SINK-005.
--
-- This is the requirement ADR-084 turned into a rule: the sink had a writer and
-- no reader, which is the state SH.6's quota refusals sat in for weeks while
-- both halves looked correct on their own.
--
-- It reads the CLASSIFICATION and never a row. `id`, `correlation_id` and
-- `user_id` are absent from the output on purpose: a per-row operator read
-- would re-introduce exactly the identifiability the sink's schema was designed
-- to exclude, and no operator question needs it. `has_owner_count` answers
-- "did these failures happen to signed-in people?" without saying who.
create or replace function public.operator_error_event_volume(p_window interval)
returns table (
  surface text,
  operation text,
  reason text,
  event_count bigint,
  has_owner_count bigint,
  first_seen_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_window is null or p_window <= interval '0' or p_window > interval '365 days' then
    raise exception 'Window must be between 0 and 365 days' using errcode = '22023';
  end if;

  return query
  select
    event.surface,
    event.operation,
    event.reason,
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where event.user_id is not null),
    pg_catalog.min(event.occurred_at),
    pg_catalog.max(event.occurred_at)
  from public.error_events as event
  where event.occurred_at > now() - p_window
  group by event.surface, event.operation, event.reason
  order by pg_catalog.count(*) desc, event.surface, event.operation, event.reason;
end;
$$;

revoke all on function public.operator_error_event_volume(interval) from public, anon, authenticated;
grant execute on function public.operator_error_event_volume(interval) to service_role;

comment on function public.operator_error_event_volume(interval) is
  '2H-SINK-005. The error sink''s operator consumer: volume by surface, operation and classified reason over a required window. Aggregates only -- no id, no correlation id and no owner leaves this function, because a per-row read would restore the identifiability the sink''s schema exists to exclude.';

-- 4.3 Account lifecycle distribution -- 2H-OPS-002, first half.
create or replace function public.operator_account_lifecycle_summary()
returns table (
  lifecycle_status text,
  account_count bigint,
  oldest_changed_at timestamptz,
  newest_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  select
    lifecycle.status::text,
    pg_catalog.count(*),
    pg_catalog.min(lifecycle.changed_at),
    pg_catalog.max(lifecycle.changed_at)
  from public.account_lifecycle as lifecycle
  group by lifecycle.status
  order by lifecycle.status;
end;
$$;

revoke all on function public.operator_account_lifecycle_summary() from public, anon, authenticated;
grant execute on function public.operator_account_lifecycle_summary() to service_role;

comment on function public.operator_account_lifecycle_summary() is
  '2H-OPS-002. How many accounts are in each lifecycle state. No email, no identifier, no reason text -- the suspension reason is a moderator note and stays where it is.';

-- 4.4 Deletion recovery, aggregated -- 2H-OPS-002, second half.
--
-- The per-account detail already exists: `operator_stalled_deletions` (2H.1)
-- returns attempt count, last attempt, next attempt and the declared stop
-- reason, and deliberately never touches `account_deletion_log`, whose rows
-- carry the requesting session's hash. This adds the distribution, so
-- "is anything stuck?" is one row rather than a scan, and it inherits the same
-- refusal to read that table.
create or replace function public.operator_deletion_recovery_summary()
returns table (
  recovery_state text,
  account_count bigint,
  max_attempt_count integer,
  oldest_first_seen_at timestamptz,
  next_attempt_due_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  select
    stalled.recovery_state,
    pg_catalog.count(*),
    pg_catalog.max(stalled.attempt_count),
    pg_catalog.min(stalled.first_seen_at),
    pg_catalog.min(stalled.next_attempt_at)
  from public.operator_stalled_deletions(500) as stalled
  group by stalled.recovery_state
  order by stalled.recovery_state;
end;
$$;

revoke all on function public.operator_deletion_recovery_summary() from public, anon, authenticated;
grant execute on function public.operator_deletion_recovery_summary() to service_role;

comment on function public.operator_deletion_recovery_summary() is
  '2H-OPS-002. The distribution of accounts in deletion recovery by state, over 2H.1''s own operator read so there is one definition of "stalled" rather than two. Carries no session hash, because the read it is built on refuses to read the table that holds one.';

-- 4.5 Scheduled-job findings -- the states an enumeration cannot show.
--
-- `scheduled_job_liveness` left-joins `cron.job` to `scheduled_job_health`, so
-- it can only report jobs the catalog still holds. Two states are invisible to
-- it, and both are exactly what a dead-man switch is for:
--
--   * `health_without_cron_job` -- a job that reported and is no longer
--     scheduled. Either it was unscheduled (a finding) or a reporter is using a
--     name the catalog does not have (also a finding, and the failure mode
--     `private.scheduled_job_name`'s fallback could otherwise hide).
--   * `duplicate_cron_job_name` -- two schedules with one name, so one ledger
--     row is shared by two jobs and the liveness read shows the same row twice.
--
-- The third is not silence but its opposite: `cron.job_run_details` is the only
-- place an in-database tick failure can be recorded, because pg_cron runs each
-- statement in one transaction and a function cannot durably record its own
-- abort. `detail` is built from identifiers and counts, never from
-- `return_message`, which carries the raw error text.
create or replace function public.operator_scheduled_job_findings(p_window interval)
returns table (
  finding text,
  job_name text,
  occurrence_count bigint,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_window is null or p_window <= interval '0' or p_window > interval '365 days' then
    raise exception 'Window must be between 0 and 365 days' using errcode = '22023';
  end if;

  return query
  select
    'health_without_cron_job'::text,
    health.job_name,
    1::bigint,
    health.updated_at
  from public.scheduled_job_health as health
  where not exists (
    select 1 from cron.job as job where job.jobname = health.job_name
  )

  union all

  select
    'duplicate_cron_job_name'::text,
    job.jobname::text,
    pg_catalog.count(*),
    null::timestamptz
  from cron.job as job
  group by job.jobname
  having pg_catalog.count(*) > 1

  union all

  select
    'cron_run_failed'::text,
    job.jobname::text,
    pg_catalog.count(*),
    pg_catalog.max(detail.end_time)
  from cron.job_run_details as detail
  join cron.job as job on job.jobid = detail.jobid
  where detail.status <> 'succeeded'
    and detail.end_time > now() - p_window
  group by job.jobname

  order by 1, 2;
end;
$$;

revoke all on function public.operator_scheduled_job_findings(interval) from public, anon, authenticated;
grant execute on function public.operator_scheduled_job_findings(interval) to service_role;

comment on function public.operator_scheduled_job_findings(interval) is
  '2H-DEADMAN-002. The three scheduled-job states an enumeration of cron.job cannot show: a health row whose job is no longer scheduled, two schedules sharing one name, and a tick that pg_cron recorded as failed. It reads cron.job_run_details for counts and times only -- return_message carries raw error text and never leaves this function.';
