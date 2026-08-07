-- Phase 2H, slice 2H.2 -- the error sink and the cron dead-man switch.
--
-- 2H-SINK-001 (a bounded, append-only record of unhandled failures),
-- 2H-SINK-002 (the shape of a failure, never its payload),
-- 2H-SINK-004 (bounded by an unscheduled sweep),
-- 2H-DEADMAN-001 (every scheduled job records its last successful RUN),
-- 2H-DEADMAN-002 (staleness is a readable classification, not an alert),
-- 2H-DEADMAN-003 (proven in both directions by an executed control).
-- ADR-082 governs what a migration may schedule; ADR-085 authorizes the phase.
--
-- WHY THESE TWO SHARE ONE MIGRATION
-- ---------------------------------------------------------------------------
-- They are the same design twice: two append-only observability tables with the
-- same retention shape and the same rule -- record the SHAPE of what happened,
-- never its payload. Splitting them would spend two of the phase's five
-- allocations on one idea. `2H-SINK-005` and `2H-DEADMAN-004` are deliberately
-- NOT here: a producer's consumer is 2H.4's work, and claiming it in the slice
-- that built the producer is the ADR-084 failure exactly.
--
-- THE TWO DEFECTS THIS ANSWERS, BOTH ALREADY PAID FOR
-- ---------------------------------------------------------------------------
-- 1. On 2026-08-04 every account deletion failed for two days and NOTHING
--    recorded it. There was no server-side error record at all, so the only
--    evidence the failure ever existed was a person noticing.
-- 2. The 2H.0 census read `my-brain-entry-dispatch` at 29 042 successes while
--    the `jobs` table held four rows, newest five days earlier. `pg_cron`
--    records that the STATEMENT succeeded, not that any work happened. A
--    liveness check built on tick counts would have been measuring silence, so
--    2H-DEADMAN-001 records last successful RUN, and section 5 keeps
--    "the tick fired" and "something was done" as different columns.

-- ---------------------------------------------------------------------------
-- 1. The error sink -- 2H-SINK-001, 2H-SINK-002
-- ---------------------------------------------------------------------------
--
-- Every column here is either a timestamp, an id, or a member of a closed set.
-- There is no free-text column, and that is the whole security design: the
-- sink cannot record a provider message, a file name, a prompt, a model
-- response, an API key or a stack trace, because there is nowhere to put one.
-- A writer having a bad day cannot leak what the schema cannot hold.
--
-- `correlation_id` is minted by the caller for the sink and is NOT derived from
-- any session, cookie or token (T-2H-09). Its purpose is to join a user's
-- report ("it failed around 14:20") to a row without the row carrying anything
-- that identifies the session it came from.

create table public.error_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),

  -- Which runtime failed. The census's four, plus the worker, because a
  -- failure in the drain and a failure in a Server Action need different
  -- people looking at them.
  surface text not null,

  -- What was being attempted. Closed, so a new operation is a migration and a
  -- decision rather than a string somebody typed.
  operation text not null,

  -- Why it failed, classified BEFORE storage by the writer. Closed for the
  -- same reason `jobs.error` and `account_deletion_log.stop_reason` are.
  reason text not null,

  correlation_id uuid not null,

  -- Nullable: a failure before sign-in, in a scheduled job, or in an anonymous
  -- route handler has no owner, and inventing one would be worse than leaving
  -- it null.
  --
  -- `ON DELETE SET NULL`, NOT cascade, and the difference matters twice.
  --
  -- Correctness first: an append-only table whose rows cascade cannot coexist
  -- with a trigger that refuses DELETE, because the cascade IS a delete. The
  -- SH.0 drill caught exactly that -- `deleting a ROW-COMPLETE account is not
  -- blocked by any owned row` failed, which in production would have meant no
  -- account could be deleted at all. A sink built to record failures would have
  -- caused the most serious one in the product.
  --
  -- Design second, and it is the better answer rather than a consolation: the
  -- row carries no user content, so de-identifying it preserves the operational
  -- record without preserving the person. `account_deletion_log` set that
  -- precedent deliberately. `account_owned_row_counts` counts rows WHERE
  -- user_id = the owner, so a nulled row is not residue -- zero-residue still
  -- holds, and it now holds without discarding evidence of what failed.
  user_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),

  constraint error_events_surface_check
    check (surface in ('server_action', 'route_handler', 'edge_function', 'scheduled_job', 'worker')),

  constraint error_events_operation_check
    check (operation in (
      'capture_entry',
      'reprocess_entry',
      'interpret_entry',
      'process_attachment',
      'file_upload',
      'chat_answer',
      'embed_text',
      'heartbeat_run',
      'account_deletion',
      'deletion_reap',
      'credential_validation',
      'job_claim',
      'job_drain',
      'product_event',
      'retention_sweep',
      'other'
    )),

  constraint error_events_reason_check
    check (reason in (
      'provider_error',
      'provider_timeout',
      'provider_rate_limited',
      'validation_failed',
      'permission_denied',
      'not_found',
      'conflict',
      'quota_exceeded',
      'throttled',
      'lifecycle_blocked',
      'storage_error',
      'database_error',
      'timeout',
      'unclassified'
    ))
);

comment on table public.error_events is
  '2H-SINK-001/002. A bounded, append-only record of unhandled server-side failures: which runtime, which operation, which classified reason, when, and a correlation id minted for this sink alone. It has NO free-text column, so no provider message, file name, prompt, model output, credential or stack trace can be stored in it -- the privacy property is the absence of a place to put one, not a writer being careful. Append-only: no role holds UPDATE or DELETE, and the RPC is the only writer.';

create index error_events_occurred_at_idx on public.error_events (occurred_at desc);
create index error_events_classification_idx on public.error_events (operation, reason, occurred_at desc);
create index error_events_correlation_idx on public.error_events (correlation_id);

alter table public.error_events enable row level security;
alter table public.error_events force row level security;

-- No policy: forced RLS with none refuses every non-superuser read and write.
-- The writer below is a DEFINER function, and it is the only way in.
revoke all on public.error_events from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The writer -- 2H-SINK-001, and reachable by `anon` on purpose
-- ---------------------------------------------------------------------------
--
-- EXECUTE goes to `anon` as well as `authenticated`, and that is a decision
-- rather than an oversight -- the same one ADR-080 recorded for the auth
-- throttle. The failures most worth recording happen before there is a
-- session: a route handler refusing a malformed request, a sign-in that could
-- not reach the provider. The alternative is a service-role client in the
-- Next.js runtime, which trades a function that can only append a row from a
-- closed vocabulary for a credential that ignores RLS on every table.
--
-- What stops that grant from being an abuse surface is the shape: a caller can
-- only insert a row whose every field is already a member of a closed set, and
-- the sweep in section 6 bounds how many such rows can accumulate. Nothing a
-- caller sends is stored verbatim; `p_user_id` is deliberately NOT a parameter,
-- so no caller can attribute a failure to somebody else -- the owner is
-- `auth.uid()` or nothing.

create or replace function public.record_error_event(
  p_surface text,
  p_operation text,
  p_reason text,
  p_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_id uuid;
begin
  if p_correlation_id is null then
    raise exception 'Correlation id is required' using errcode = '22023';
  end if;

  insert into public.error_events (surface, operation, reason, correlation_id, user_id)
  values (p_surface, p_operation, p_reason, p_correlation_id, auth.uid())
  returning id into recorded_id;

  return recorded_id;
end;
$$;

revoke all on function public.record_error_event(text, text, text, uuid) from public;
grant execute on function public.record_error_event(text, text, text, uuid)
  to anon, authenticated, service_role;

comment on function public.record_error_event(text, text, text, uuid) is
  '2H-SINK-001. The sink''s only writer. Takes no owner parameter -- the owner is auth.uid() or null -- so no caller can attribute a failure to another account. Every argument must be a member of a closed set or the CHECKs refuse the row, so free text cannot reach storage through it. Granted to anon deliberately (ADR-080''s reasoning): the failures most worth recording happen before a session exists, and the alternative is a service-role client in the product runtime.';

-- ---------------------------------------------------------------------------
-- 3. Append-only, enforced rather than described -- 2H-SINK-001
-- ---------------------------------------------------------------------------
--
-- The revoke above already means no role can UPDATE or DELETE through the API.
-- This trigger is the second lock, and it exists because the first one is a
-- grant: a future migration that re-grants the table (by accident, or by a
-- platform default returning) would silently make the sink mutable. A trigger
-- refuses regardless of who holds what.

-- One mutation is permitted, and exactly one: the foreign key's own
-- `ON DELETE SET NULL` de-identifying a row when its account is deleted. Every
-- field is compared, so the exemption cannot be used to change anything else
-- while nulling the owner -- "de-identify" is enforced rather than trusted.
create or replace function private.refuse_error_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is not null
    and new.user_id is null
    and new.id is not distinct from old.id
    and new.occurred_at is not distinct from old.occurred_at
    and new.surface is not distinct from old.surface
    and new.operation is not distinct from old.operation
    and new.reason is not distinct from old.reason
    and new.correlation_id is not distinct from old.correlation_id
    and new.created_at is not distinct from old.created_at
  then
    return new;
  end if;

  raise exception 'error_events is append-only'
    using errcode = 'P0001', detail = 'ERROR_SINK_APPEND_ONLY';
end;
$$;

revoke all on function private.refuse_error_event_mutation()
  from public, anon, authenticated, service_role;

create trigger error_events_refuse_update
before update on public.error_events
for each row execute function private.refuse_error_event_mutation();

-- DELETE is refused for everyone EXCEPT the retention sweep, which runs as the
-- table owner inside a DEFINER function. `session_user` is the owner there and
-- the row-level trigger would otherwise make the sweep impossible to write --
-- so the exemption is explicit, narrow, and named, rather than the sweep being
-- given a grant that also lets anything else delete.
create or replace function private.refuse_error_event_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('my_brain.error_sink_sweep', true) = 'on' then
    return old;
  end if;
  raise exception 'error_events rows are removed only by its retention sweep'
    using errcode = 'P0001', detail = 'ERROR_SINK_APPEND_ONLY';
end;
$$;

revoke all on function private.refuse_error_event_delete()
  from public, anon, authenticated, service_role;

create trigger error_events_refuse_delete
before delete on public.error_events
for each row execute function private.refuse_error_event_delete();

-- ---------------------------------------------------------------------------
-- 4. The scheduled-job health ledger -- 2H-DEADMAN-001
-- ---------------------------------------------------------------------------
--
-- The census's finding, made structural: `cron.job_run_details` records that a
-- STATEMENT succeeded. `my-brain-entry-dispatch` had 29 042 such successes
-- against four rows in `jobs`, newest five days old. So this ledger keeps two
-- different timestamps and never conflates them:
--
--   last_success_at -- the job ran and did not error
--   last_useful_at  -- the job ran and DID something
--
-- For a job whose contract makes an empty run meaningful (a drain with nothing
-- to drain is healthy), `last_success_at` is the liveness signal. For a job
-- that should never be idle, the gap between the two is the finding. Keeping
-- both means a later reader can ask either question; keeping one would have
-- forced the choice now, silently, for every job.

create table public.scheduled_job_health (
  job_name text primary key,
  last_success_at timestamptz,
  last_useful_at timestamptz,
  last_outcome text,
  consecutive_empty integer not null default 0,
  success_count bigint not null default 0,
  useful_count bigint not null default 0,
  updated_at timestamptz not null default now(),

  constraint scheduled_job_health_last_outcome_check
    check (last_outcome is null or last_outcome in ('success_empty', 'success_work', 'failed')),
  constraint scheduled_job_health_counts_check
    check (consecutive_empty >= 0 and success_count >= 0 and useful_count >= 0),
  -- A job name is an identifier, not a message.
  constraint scheduled_job_health_job_name_check
    check (job_name ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

comment on table public.scheduled_job_health is
  '2H-DEADMAN-001. One row per scheduled job, recording its last successful RUN and, separately, the last run that actually did something. The two are different columns because the 2H.0 census found a job with 29 042 successful cron ticks and four rows of work: a health claim built on tick counts measures silence. No role reaches this table; the RPCs below are its only access.';

alter table public.scheduled_job_health enable row level security;
alter table public.scheduled_job_health force row level security;
revoke all on public.scheduled_job_health from public, anon, authenticated, service_role;

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

revoke all on function public.record_scheduled_job_run(text, boolean) from public, anon, authenticated;
grant execute on function public.record_scheduled_job_run(text, boolean) to service_role;

comment on function public.record_scheduled_job_run(text, boolean) is
  '2H-DEADMAN-001. A scheduled job reports its own successful run, saying whether it did any work. Both facts are kept separately, because a tick that succeeded and a tick that achieved something are different claims and the census proved conflating them hides a dead queue.';

-- ---------------------------------------------------------------------------
-- 5. The classification -- 2H-DEADMAN-002
-- ---------------------------------------------------------------------------
--
-- Enumerated from `cron.job` AT RUN TIME, never from a list in this file
-- (T-2H-14). A job scheduled tomorrow by an operator appears here tomorrow
-- with no code change; a job silently unscheduled disappears from the
-- enumeration, which is itself the finding.
--
-- The interval comes from the schedule string, parsed for the four shapes this
-- project actually uses. An unrecognised shape yields NULL, and a NULL interval
-- classifies as `unknown` rather than as healthy -- because a staleness check
-- that cannot compute a threshold and answers "fine" is the failure mode
-- 2H-DEADMAN-003 exists to refuse.

create or replace function private.cron_schedule_interval(p_schedule text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case
    when p_schedule ~ '^\*/[0-9]+ \* \* \* \*$'
      then make_interval(mins => (regexp_replace(p_schedule, '^\*/([0-9]+).*$', '\1'))::integer)
    when p_schedule ~ '^\* \* \* \* \*$' then interval '1 minute'
    when p_schedule ~ '^[0-9]+ \* \* \* \*$' then interval '1 hour'
    when p_schedule ~ '^[0-9]+ [0-9]+ \* \* \*$' then interval '1 day'
    else null
  end;
$$;

revoke all on function private.cron_schedule_interval(text)
  from public, anon, authenticated, service_role;

comment on function private.cron_schedule_interval(text) is
  '2H-DEADMAN-002. The expected interval of a pg_cron schedule, for the four shapes this project uses. Returns NULL for anything else, and a NULL interval classifies as `unknown` rather than healthy -- a staleness check that cannot compute its threshold must not answer "fine".';

create or replace function public.scheduled_job_liveness(p_staleness_multiple numeric)
returns table (
  job_name text,
  schedule text,
  active boolean,
  expected_interval interval,
  staleness_threshold interval,
  last_success_at timestamptz,
  last_useful_at timestamptz,
  seconds_since_success numeric,
  consecutive_empty integer,
  liveness text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_staleness_multiple is null or p_staleness_multiple < 1 or p_staleness_multiple > 100 then
    raise exception 'Staleness multiple must be between 1 and 100' using errcode = '22023';
  end if;

  return query
  select
    job.jobname::text,
    job.schedule::text,
    job.active,
    private.cron_schedule_interval(job.schedule),
    private.cron_schedule_interval(job.schedule) * p_staleness_multiple,
    health.last_success_at,
    health.last_useful_at,
    case
      when health.last_success_at is null then null
      else extract(epoch from (now() - health.last_success_at))
    end,
    coalesce(health.consecutive_empty, 0),
    case
      -- An inactive job is not stale; it is switched off, and reporting it as
      -- stale would train a reader to ignore the column.
      when not job.active then 'inactive'
      when private.cron_schedule_interval(job.schedule) is null then 'unknown_interval'
      -- A job in the catalog that has never reported is NOT healthy. It is the
      -- exact state a silently-broken job is in, and the census found three
      -- jobs that have never reported because this ledger did not exist.
      when health.last_success_at is null then 'never_reported'
      when now() - health.last_success_at
             > private.cron_schedule_interval(job.schedule) * p_staleness_multiple
        then 'stale'
      else 'current'
    end::text
  from cron.job as job
  left join public.scheduled_job_health as health
    on health.job_name = job.jobname
  order by job.jobname;
end;
$$;

revoke all on function public.scheduled_job_liveness(numeric) from public, anon, authenticated;
grant execute on function public.scheduled_job_liveness(numeric) to service_role;

comment on function public.scheduled_job_liveness(numeric) is
  '2H-DEADMAN-002. Classifies every job in the pg_cron catalog AT RUN TIME as current, stale, never_reported, unknown_interval or inactive, against a multiple of the job''s own interval taken as a required argument. A job added tomorrow appears tomorrow with no code change; a job that never reports classifies as never_reported rather than as healthy.';

-- ---------------------------------------------------------------------------
-- 6. Retention: built, BOUNDED, and not scheduled -- 2H-SINK-004
-- ---------------------------------------------------------------------------
--
-- The SH.6 shape exactly (`202608050077`): one predicate per class, the sweep
-- deleting what the predicate returns and the count-only twin counting what the
-- predicate returns, so the two cannot diverge -- there is no second copy of
-- the rule. The only difference between them is the limit, which is declared.
--
-- ADR-082: this migration SCHEDULES NOTHING. The window is a required argument
-- for the same reason every other ceiling in this chain is.

create or replace function private.prunable_error_events(p_window interval)
returns table (id uuid)
language sql
stable
set search_path = ''
as $$
  select events.id
  from public.error_events as events
  where events.occurred_at < now() - p_window;
$$;

revoke all on function private.prunable_error_events(interval)
  from public, anon, authenticated, service_role;

create or replace function public.count_prunable_error_events(p_window interval)
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select count(*) from private.prunable_error_events(p_window);
$$;

revoke all on function public.count_prunable_error_events(interval) from public, anon, authenticated;
grant execute on function public.count_prunable_error_events(interval) to service_role;

create or replace function public.prune_error_events(p_window interval, p_limit integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed bigint;
begin
  perform set_config('my_brain.error_sink_sweep', 'on', true);

  with doomed as (
    select id from private.prunable_error_events(p_window)
    order by id
    limit p_limit
  )
  delete from public.error_events as events
  using doomed
  where events.id = doomed.id;

  get diagnostics removed = row_count;

  perform set_config('my_brain.error_sink_sweep', 'off', true);
  return removed;
end;
$$;

-- Executable by NO role, including service_role -- the SH.6 posture. Only the
-- scheduler can reach it, and it is not scheduled. `pg_cron` runs jobs as the
-- database owner, so it does not need a grant; every other caller does, and
-- none has one.
revoke all on function public.prune_error_events(interval, integer)
  from public, anon, authenticated, service_role;

comment on function public.prune_error_events(interval, integer) is
  '2H-SINK-004. Removes error-sink rows older than the declared window. Executable by NO role including service_role: only the scheduler has reason to delete, and THIS MIGRATION DOES NOT SCHEDULE IT (ADR-082). Shares its predicate with count_prunable_error_events, so the dry run and the deletion cannot disagree -- there is no second copy of the rule.';

create or replace function private.prunable_scheduled_job_health(p_window interval)
returns table (job_name text)
language sql
stable
set search_path = ''
as $$
  -- Only rows for jobs that no longer exist in the catalog. A live job's health
  -- row is never prunable however old it is: deleting it would reset the very
  -- history the dead-man switch reads, turning a long-dead job into a
  -- `never_reported` one and losing the finding.
  select health.job_name
  from public.scheduled_job_health as health
  where health.updated_at < now() - p_window
    and not exists (select 1 from cron.job as job where job.jobname = health.job_name);
$$;

revoke all on function private.prunable_scheduled_job_health(interval)
  from public, anon, authenticated, service_role;

create or replace function public.count_prunable_scheduled_job_health(p_window interval)
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select count(*) from private.prunable_scheduled_job_health(p_window);
$$;

revoke all on function public.count_prunable_scheduled_job_health(interval)
  from public, anon, authenticated;
grant execute on function public.count_prunable_scheduled_job_health(interval) to service_role;

create or replace function public.prune_scheduled_job_health(p_window interval, p_limit integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed bigint;
begin
  with doomed as (
    select job_name from private.prunable_scheduled_job_health(p_window)
    order by job_name
    limit p_limit
  )
  delete from public.scheduled_job_health as health
  using doomed
  where health.job_name = doomed.job_name;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_scheduled_job_health(interval, integer)
  from public, anon, authenticated, service_role;

comment on function public.prune_scheduled_job_health(interval, integer) is
  '2H-SINK-004 / 2H-RETENTION-001. Removes health rows for jobs that no longer exist in the pg_cron catalog. A LIVE job''s row is never prunable at any age: deleting it would reset the history the dead-man switch reads and turn a long-dead job into a never_reported one. Executable by no role; NOT SCHEDULED by this migration.';

-- ---------------------------------------------------------------------------
-- 7. Postconditions
-- ---------------------------------------------------------------------------

do $$
declare
  offender text;
begin
  for offender in
    select class.relname
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in ('error_events', 'scheduled_job_health')
      and not (class.relrowsecurity and class.relforcerowsecurity)
  loop
    raise exception 'table % does not force row level security', offender;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in ('error_events', 'scheduled_job_health')
  ) then
    raise exception 'the observability tables must carry no policy: their functions are the only access';
  end if;

  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where (namespace.nspname, proc.proname) in (
      ('public', 'record_error_event'),
      ('private', 'refuse_error_event_mutation'),
      ('private', 'refuse_error_event_delete'),
      ('public', 'record_scheduled_job_run'),
      ('private', 'cron_schedule_interval'),
      ('public', 'scheduled_job_liveness'),
      ('private', 'prunable_error_events'),
      ('public', 'count_prunable_error_events'),
      ('public', 'prune_error_events'),
      ('private', 'prunable_scheduled_job_health'),
      ('public', 'count_prunable_scheduled_job_health'),
      ('public', 'prune_scheduled_job_health')
    )
    and (
      proc.proconfig is null
      or not (proc.proconfig @> array['search_path=""'])
    )
  loop
    raise exception 'function % does not set the empty search_path', offender;
  end loop;

  -- The sink has no free-text column, asserted from the catalog. This is the
  -- 2H-SINK-002 claim in its strongest available form: not "the writer is
  -- careful" but "there is nowhere to put a message".
  if exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_class as class on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'error_events'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.atttypid in ('text'::regtype, 'jsonb'::regtype, 'json'::regtype, 'bytea'::regtype)
      and attribute.attname not in ('surface', 'operation', 'reason')
  ) then
    raise exception 'error_events grew a column that could hold free text';
  end if;

  -- Every text column it does have is constrained to a closed set.
  if (
    select count(*) from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as class on class.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relname = 'error_events'
      and constraint_row.contype = 'c'
  ) < 3 then
    raise exception 'error_events lost one of its closed-vocabulary constraints';
  end if;

  -- No role reaches either table, and no role can execute either sweep.
  if pg_catalog.has_table_privilege('service_role', 'public.error_events', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.error_events', 'select')
    or pg_catalog.has_table_privilege('anon', 'public.error_events', 'insert')
    or pg_catalog.has_table_privilege('service_role', 'public.scheduled_job_health', 'select')
  then
    raise exception 'an observability table is reachable outside its functions';
  end if;

  if pg_catalog.has_function_privilege('service_role', 'public.prune_error_events(interval, integer)', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.prune_scheduled_job_health(interval, integer)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.scheduled_job_liveness(numeric)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.scheduled_job_liveness(numeric)', 'execute')
  then
    raise exception 'a destructive sweep or the liveness read is reachable by a role that must not hold it';
  end if;

  -- ADR-082, asserted by the migration about itself.
  if exists (
    select 1 from cron.job
    where jobname in ('my-brain-prune-error-events', 'my-brain-prune-scheduled-job-health')
  ) then
    raise exception 'a 2H.2 retention sweep was scheduled by a migration, which ADR-082 forbids';
  end if;
end;
$$;
