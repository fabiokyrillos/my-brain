-- Signup Hardening SH.6, migration 2 of 2 -- retention and the exposure closures.
--
-- SH-RETENTION-002 (product_events), SH-RETENTION-003 (terminal jobs),
-- SH-RETENTION-004 (notifications, heartbeat_runs), SH-RETENTION-005
-- (undo_operations, measured past EXPIRY), SH-RETENTION-007 (scheduler-only,
-- bounded, counted), SH-RETENTION-008 (a count-only dry-run per sweep),
-- SH-EXPOSURE-001 (service_role loses table DML on the BYOK tables). PRD sec. 20
-- and plan sec. 7 are the signed schedule; ADR-077 approved it.
--
-- APPROVAL OF A SCHEDULE IS NOT AUTHORIZATION FOR A PURGE
-- ---------------------------------------------------------------------------
-- Amendment P-1 says this in as many words, and it is the reason every sweep
-- below ships with a count-only twin. The twins are what runs first against a
-- shared environment; the destructive halves are scheduled but their first live
-- run against production is an owner decision recorded after the dry-run
-- transcript exists (SH-RETENTION-008). Nothing in this migration deletes a row
-- at apply time.
--
-- WHY THE DRY-RUN CANNOT DRIFT FROM THE SWEEP
-- ---------------------------------------------------------------------------
-- A dry-run whose predicate is a copy of the sweep's predicate is a dry-run
-- that will eventually lie -- and it will lie in the worst direction, reporting
-- a small number for a delete that takes a large one. So there is no copy. Each
-- class has ONE function that decides which rows are prunable; the sweep
-- deletes what it returns and the dry-run counts what it returns. They cannot
-- disagree because there is only one predicate.
--
-- The only difference is the limit, and it is declared: the sweep is bounded
-- per invocation (SH-RETENTION-007) so a first run against years of rows cannot
-- hold a lock for minutes, while the dry-run passes `null` and counts the whole
-- backlog -- which is exactly what an operator needs to see before authorizing
-- anything. `limit null` is Postgres for "no limit", so the same function body
-- serves both.
--
-- WHY THE WINDOWS ARE ROWS
-- ---------------------------------------------------------------------------
-- The same reason the quota ceilings are (202608050076): a window frozen into a
-- function body cannot be changed without spending a migration, and the
-- schedule is policy, not structure. `private.retention_windows` mirrors
-- `RETENTION_DAYS` in `src/lib/quotas.ts`, and `quotas-parity.test.ts` compares
-- the two against the PRD in both directions.
--
-- WHAT IS NOT SWEPT, AND WHY THAT IS A DECISION
-- ---------------------------------------------------------------------------
-- `audit_logs` (audit integrity), `ai_usage_events` (billing reconciliation)
-- and the interpretation versions (the user's own record of what the agent
-- understood) are retained deliberately, each with its reason recorded in the
-- constants module and disclosed in the Privacy Policy (SH-RETENTION-006,
-- SH-LEGAL-014). Retained is a decision here, never an omission.


-- ---------------------------------------------------------------------------
-- 1. The windows, as data
-- ---------------------------------------------------------------------------

create table private.retention_windows (
  key text primary key,

  -- A window of zero would delete everything the moment the scheduler ran; the
  -- upper bound is a century, which is "retained" expressed as a number rather
  -- than as a missing row.
  days integer not null check (days between 1 and 36500),

  note text not null,
  updated_at timestamptz not null default now()
);

comment on table private.retention_windows is
  'SH-RETENTION-001: the owner-accepted schedule of plan sec. 7 as runtime parameters. Mirrored by RETENTION_DAYS in src/lib/quotas.ts. Retained classes have no row here -- they are recorded in the constants module, because a window of "never" is not a window.';

insert into private.retention_windows (key, days, note) values
  ('jobs_terminal', 90,
   'SH-RETENTION-003: completed, cancelled and exhausted jobs. The Jobs page history window.'),
  ('notifications', 180,
   'SH-RETENTION-004: delivered notifications. Product history.'),
  ('product_events', 180,
   'SH-RETENTION-002: the funnel ledger, implementing the promise its own table comment already made.'),
  ('heartbeat_runs', 30,
   'SH-RETENTION-004: operational telemetry only.'),
  ('undo_operations_past_expiry', 30,
   'SH-RETENTION-005: measured past expires_at, not past creation. Expiry is 24h.'),
  ('auth_event_attempts', 30,
   'SH-THROTTLE-004: abuse evidence, bounded. Deleting rows here resets ceilings.'),
  ('credential_validation_attempts', 30,
   'BYOK-SCHEMA-014, unchanged. Its window now reads from here so one schedule has one home.');

alter table private.retention_windows enable row level security;
alter table private.retention_windows force row level security;

create policy retention_windows_no_client_access
  on private.retention_windows
  for all
  to anon, authenticated, service_role
  using (false)
  with check (false);

revoke all on table private.retention_windows from public, anon, authenticated, service_role;

create or replace function private.retention_window(p_key text)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  window_days integer;
begin
  select windows.days into window_days
  from private.retention_windows as windows
  where windows.key = p_key;

  -- Fail closed, and note which direction closed means here: a sweep that
  -- cannot read its window must DELETE NOTHING, not fall back to a default.
  -- The quota ceilings fail closed by refusing writes; a retention sweep fails
  -- closed by refusing to delete.
  if window_days is null then
    raise exception 'Retention window % is not configured', p_key
      using errcode = 'P0001', detail = 'RETENTION_WINDOW_MISSING';
  end if;

  return window_days;
end;
$$;

comment on function private.retention_window(text) is
  'Reads one SH-RETENTION-001 window. Raises RETENTION_WINDOW_MISSING on an absent key -- a sweep that cannot read its window must delete nothing.';

revoke all on function private.retention_window(text)
  from public, anon, authenticated, service_role;

-- How many rows one scheduled invocation may remove.
--
-- SH-RETENTION-007's "bounded per invocation". Ten thousand is large enough
-- that steady-state retention finishes in one tick and small enough that the
-- FIRST run against an unswept backlog does not hold locks on a hot table for
-- minutes. A backlog larger than the bound simply takes several ticks, which is
-- the correct behaviour: retention is not urgent, and an unavailable product is.
create or replace function private.retention_batch_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10000 $$;

comment on function private.retention_batch_limit() is
  'SH-RETENTION-007: the per-invocation bound on every retention sweep. A backlog larger than this takes several ticks by design.';

revoke all on function private.retention_batch_limit()
  from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. One predicate per class
-- ---------------------------------------------------------------------------
--
-- Each returns the ids that are out of window, oldest first. `p_limit` is null
-- for the dry-run and the batch bound for the sweep; ordering oldest-first
-- means a bounded sweep always makes progress on the oldest rows rather than
-- sampling arbitrarily.

-- SH-RETENTION-003. Terminal means finished for good, and this schema has no
-- `exhausted` status: a job that burned every attempt sits in `failed` forever
-- and is as finished as a completed one. A live job -- pending, running, or
-- failed with attempts remaining -- is never swept, at any age.
create or replace function private.prunable_job_ids(p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select job.id
  from public.jobs as job
  where (
      job.status in ('completed', 'cancelled')
      or (job.status = 'failed' and job.attempts >= job.max_attempts)
    )
    and job.created_at
      < pg_catalog.now() - pg_catalog.make_interval(days => private.retention_window('jobs_terminal'))
  order by job.created_at
  limit p_limit
$$;

create or replace function private.prunable_notification_ids(p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select notification.id
  from public.notifications as notification
  where notification.created_at
    < pg_catalog.now() - pg_catalog.make_interval(days => private.retention_window('notifications'))
  order by notification.created_at
  limit p_limit
$$;

create or replace function private.prunable_product_event_ids(p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select event.id
  from public.product_events as event
  where event.created_at
    < pg_catalog.now() - pg_catalog.make_interval(days => private.retention_window('product_events'))
  order by event.created_at
  limit p_limit
$$;

-- `started_at`, not `created_at`. This table has no `created_at` column at all,
-- and a sweep written from habit would have failed at apply time -- which is the
-- good outcome; the bad one is a sweep that silently matched nothing.
create or replace function private.prunable_heartbeat_run_ids(p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select run.id
  from public.heartbeat_runs as run
  where run.started_at
    < pg_catalog.now() - pg_catalog.make_interval(days => private.retention_window('heartbeat_runs'))
  order by run.started_at
  limit p_limit
$$;

-- SH-RETENTION-005, and the two things that make it different from every other
-- sweep here.
--
-- FIRST: the window is measured past `expires_at`, not past `created_at`. The
-- lazy-expiry contract of `undo_operation` is unchanged -- a row is expired when
-- its expiry passed, and this sweep only removes rows that have been expired
-- for the whole window on top of that.
--
-- SECOND, and this one would have broken the sweep in production rather than in
-- review: `entry_task_candidate_resolutions.undo_operation_id` is a composite
-- FK to this table with NO ACTION (202607220041). Deleting a referenced row
-- raises a foreign-key violation and takes the whole batch down with it. So a
-- referenced undo row is retained, deliberately: it is part of a resolution's
-- record of what happened and how it could have been reversed, and nulling the
-- pointer to make the delete succeed would quietly rewrite product history to
-- suit a retention job. The carve-out is bounded -- only confirmed candidates
-- create these rows -- and it is stated here, in the retention document, and in
-- the pgtap that proves both halves.
create or replace function private.prunable_undo_operation_ids(p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select undo.id
  from public.undo_operations as undo
  where undo.expires_at
      < pg_catalog.now() - pg_catalog.make_interval(days => private.retention_window('undo_operations_past_expiry'))
    and not exists (
      select 1
      from public.entry_task_candidate_resolutions as resolution
      where resolution.undo_operation_id = undo.id
    )
  order by undo.expires_at
  limit p_limit
$$;

create or replace function private.prunable_auth_event_attempt_ids(p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select attempt.id
  from public.auth_event_attempts as attempt
  where attempt.attempted_at
    < pg_catalog.now() - pg_catalog.make_interval(days => private.retention_window('auth_event_attempts'))
  order by attempt.attempted_at
  limit p_limit
$$;

create or replace function private.prunable_credential_validation_attempt_ids(p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select attempt.id
  from public.credential_validation_attempts as attempt
  where attempt.attempted_at
    < pg_catalog.now() - pg_catalog.make_interval(days => private.retention_window('credential_validation_attempts'))
  order by attempt.attempted_at
  limit p_limit
$$;

do $revoke_predicates$
declare
  signature text;
begin
  foreach signature in array array[
    'private.prunable_job_ids(integer)',
    'private.prunable_notification_ids(integer)',
    'private.prunable_product_event_ids(integer)',
    'private.prunable_heartbeat_run_ids(integer)',
    'private.prunable_undo_operation_ids(integer)',
    'private.prunable_auth_event_attempt_ids(integer)',
    'private.prunable_credential_validation_attempt_ids(integer)'
  ]
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role', signature
    );
  end loop;
end;
$revoke_predicates$;


-- ---------------------------------------------------------------------------
-- 3. The sweeps and their count-only twins
-- ---------------------------------------------------------------------------
--
-- Sweeps: SECURITY DEFINER, empty search_path, granted to NOBODY. pg_cron calls
-- them as the scheduler's own role. There is no product reason for a client to
-- trigger a purge, and on `auth_event_attempts` especially a grant would be a
-- denial-of-service lever, because deleting rows there *resets ceilings*.
--
-- Twins: the same posture except that `service_role` may execute them, because
-- the operator script is how the transcript of SH-RETENTION-008 gets recorded
-- and there is no other way to run one. They cannot delete, cannot name a row
-- and return a single integer -- which is the narrowest surface that answers
-- "how many would go?" and the reason this is not a new generic service-role
-- endpoint (ADR-075's boundary is unchanged).

create or replace function public.prune_terminal_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.jobs
  where id in (select prunable.id from private.prunable_job_ids(private.retention_batch_limit()) as prunable(id));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.count_prunable_terminal_jobs()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select pg_catalog.count(*)::integer from private.prunable_job_ids(null::integer) $$;

create or replace function public.prune_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.notifications
  where id in (select prunable.id from private.prunable_notification_ids(private.retention_batch_limit()) as prunable(id));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.count_prunable_notifications()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select pg_catalog.count(*)::integer from private.prunable_notification_ids(null::integer) $$;

create or replace function public.prune_product_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.product_events
  where id in (select prunable.id from private.prunable_product_event_ids(private.retention_batch_limit()) as prunable(id));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.count_prunable_product_events()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select pg_catalog.count(*)::integer from private.prunable_product_event_ids(null::integer) $$;

create or replace function public.prune_heartbeat_runs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.heartbeat_runs
  where id in (select prunable.id from private.prunable_heartbeat_run_ids(private.retention_batch_limit()) as prunable(id));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.count_prunable_heartbeat_runs()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select pg_catalog.count(*)::integer from private.prunable_heartbeat_run_ids(null::integer) $$;

create or replace function public.prune_undo_operations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.undo_operations
  where id in (select prunable.id from private.prunable_undo_operation_ids(private.retention_batch_limit()) as prunable(id));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.count_prunable_undo_operations()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select pg_catalog.count(*)::integer from private.prunable_undo_operation_ids(null::integer) $$;

-- The two that already existed. Replaced rather than left alone, so that the
-- schedule has one home: their windows were literals in their own bodies, which
-- meant the plan sec. 7 table and the database agreed only by coincidence.
-- Behaviour is unchanged -- both windows are still 30 days, now read from the
-- row that says 30.
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
  return removed;
end;
$$;

create or replace function public.count_prunable_auth_event_attempts()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select pg_catalog.count(*)::integer from private.prunable_auth_event_attempt_ids(null::integer) $$;

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
  return removed;
end;
$$;

create or replace function public.count_prunable_credential_validation_attempts()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select pg_catalog.count(*)::integer from private.prunable_credential_validation_attempt_ids(null::integer) $$;

-- The grant matrix for the fourteen functions above, applied in one place so
-- the pattern is visible rather than repeated fourteen times with one typo in
-- it.
do $retention_grants$
declare
  sweep text;
  twin text;
begin
  foreach sweep in array array[
    'public.prune_terminal_jobs()',
    'public.prune_notifications()',
    'public.prune_product_events()',
    'public.prune_heartbeat_runs()',
    'public.prune_undo_operations()',
    'public.prune_auth_event_attempts()',
    'public.prune_credential_validation_attempts()'
  ]
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role', sweep
    );
  end loop;

  foreach twin in array array[
    'public.count_prunable_terminal_jobs()',
    'public.count_prunable_notifications()',
    'public.count_prunable_product_events()',
    'public.count_prunable_heartbeat_runs()',
    'public.count_prunable_undo_operations()',
    'public.count_prunable_auth_event_attempts()',
    'public.count_prunable_credential_validation_attempts()'
  ]
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated', twin
    );
    execute pg_catalog.format('grant execute on function %s to service_role', twin);
  end loop;
end;
$retention_grants$;

comment on function public.prune_terminal_jobs() is
  'SH-RETENTION-003: removes completed, cancelled and exhausted jobs past the window. Live jobs are never touched. Scheduler-only, bounded per invocation, returns the count removed.';
comment on function public.count_prunable_terminal_jobs() is
  'SH-RETENTION-008: the dry-run twin. Identical predicate, no limit, counts only. Executable by service_role so the operator transcript can exist.';
comment on function public.prune_undo_operations() is
  'SH-RETENTION-005: removes undo rows expired for the whole window. An undo row a candidate resolution still points at is retained -- deleting it would violate the composite FK and rewriting the pointer would rewrite product history.';


-- ---------------------------------------------------------------------------
-- 4. The schedules
-- ---------------------------------------------------------------------------
--
-- Guarded by an existence check so the chain applies to a database without the
-- extension: CI runs `db reset` from empty, and the retention *rule* is the
-- function, which is present either way. Staggered times so seven sweeps never
-- contend on the same minute.
--
-- `sh-prune-auth-event-attempts` is re-scheduled rather than left alone because
-- 202608040075 created it; re-running `cron.schedule` with the same job name
-- replaces the entry rather than duplicating it.

do $retention_schedule$
declare
  entry record;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is absent; retention functions exist but are not scheduled';
    return;
  end if;

  for entry in
    select * from (values
      ('sh-prune-terminal-jobs', '11 4 * * *', 'select public.prune_terminal_jobs();'),
      ('sh-prune-notifications', '17 4 * * *', 'select public.prune_notifications();'),
      ('sh-prune-product-events', '23 4 * * *', 'select public.prune_product_events();'),
      ('sh-prune-heartbeat-runs', '29 4 * * *', 'select public.prune_heartbeat_runs();'),
      ('sh-prune-undo-operations', '35 4 * * *', 'select public.prune_undo_operations();'),
      ('sh-prune-auth-event-attempts', '43 4 * * *', 'select public.prune_auth_event_attempts();'),
      ('byok-prune-credential-validation-attempts', '49 4 * * *', 'select public.prune_credential_validation_attempts();')
    ) as schedules(job_name, cadence, statement)
  loop
    begin
      perform cron.schedule(entry.job_name, entry.cadence, entry.statement);
    exception when others then
      raise notice 'retention schedule % not installed: %', entry.job_name, sqlerrm;
    end;
  end loop;
end;
$retention_schedule$;


-- ---------------------------------------------------------------------------
-- 5. SH-EXPOSURE-001 -- service_role loses table DML on the BYOK tables
-- ---------------------------------------------------------------------------
--
-- BYOK left `service_role` with table-level DML on `user_ai_credentials` and
-- `credential_validation_attempts`. That grant is exactly the capability T-26
-- describes: a service-role key that reads every user's envelope in one
-- statement.
--
-- THE PRD SAID NOTHING USED IT. THE REPOSITORY SAYS OTHERWISE.
--
-- SH-EXPOSURE-001 was written expecting the resolvers and the throttle -- both
-- DEFINER, both unaffected -- to be the only paths. Two real callers are not:
--
--   * `supabase/functions/delete-account/executor.ts` selects `status` to prove
--     the credential was erased before the cascade runs. It never reads
--     ciphertext.
--   * `scripts/byok-rotate-master-key.mjs` selects ciphertext, iv and
--     key_version and writes them back re-sealed. Master-key rotation cannot
--     exist without this: the key lives in the operator's environment and never
--     in this database, so the envelope must leave the database to be rewrapped.
--
-- Weakening the closure to keep them working would be the wrong trade, so they
-- are routed through the narrowest functions that serve each purpose instead.
--
-- WHAT THIS CLOSES, AND WHAT IT HONESTLY DOES NOT
--
-- It closes generic table access: after this, `service_role` cannot select,
-- update, insert or delete these tables at all, so a leaked service key no
-- longer reads every envelope with one `select *`, and no future code can
-- casually reach for the table because the table is not there for it.
--
-- It does NOT eliminate T-26 outright, and pretending otherwise would be the
-- more dangerous outcome. `admin_list_credential_envelopes` still returns
-- ciphertext to a service-role caller, because rotation requires it. What
-- changes is that the capability is now ONE named function with a stated
-- purpose -- greppable, separately revocable, and impossible to use by accident
-- -- rather than an ambient property of a table grant. The residual is recorded
-- in SECURITY.md rather than closed.
--
-- The DEFINER paths are unaffected either way: a definer function executes as
-- its owner, and the owner's access has nothing to do with service_role's
-- grants. The postcondition proves one of them still works rather than assuming.

create or replace function public.admin_credential_status(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  credential_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select credential.status into credential_status
  from public.user_ai_credentials as credential
  where credential.user_id = p_user_id;

  -- Null means "no row", which is a legitimate answer for the deletion
  -- executor: an account that never configured a credential has nothing to
  -- erase. It is distinguishable from 'removed' precisely because the caller
  -- needs to tell those apart.
  return credential_status;
end;
$$;

comment on function public.admin_credential_status(uuid) is
  'SH-EXPOSURE-001: the deletion executor''s residue check, narrowed to one column. Returns a status and never ciphertext, iv, fingerprint or key version.';

create or replace function public.admin_list_credential_envelopes(
  p_limit integer,
  p_offset integer
)
returns table (
  user_id uuid,
  provider text,
  key_version smallint,
  ciphertext bytea,
  iv bytea
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid page size' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Invalid offset' using errcode = '22023';
  end if;

  -- Active rows only. An `invalid` or `removed` row has no material worth
  -- rewrapping, and returning it would widen the exposure for no purpose.
  -- Ordered by user_id so paging is stable across calls.
  return query
    select
      credential.user_id,
      credential.provider,
      credential.key_version,
      credential.ciphertext,
      credential.iv
    from public.user_ai_credentials as credential
    where credential.status = 'active'
    order by credential.user_id
    limit p_limit
    offset p_offset;
end;
$$;

comment on function public.admin_list_credential_envelopes(integer, integer) is
  'SH-EXPOSURE-001: the ONLY remaining path by which service_role reads ciphertext. Exists solely for master-key rotation, which cannot work without it because the key never lives in this database. Paged, active rows only. The residual it leaves is recorded in SECURITY.md rather than closed.';

create or replace function public.admin_rewrap_credential_envelope(
  p_user_id uuid,
  p_expected_key_version smallint,
  p_ciphertext bytea,
  p_iv bytea,
  p_key_version smallint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_ciphertext is null or p_iv is null or p_key_version is null then
    raise exception 'A rewrap must carry ciphertext, iv and version' using errcode = '22023';
  end if;

  -- One statement, and a compare-and-set on the version. A row must never exist
  -- with a new ciphertext and an old version -- that is the state that would
  -- make it permanently unreadable -- and the expected-version predicate is
  -- what makes a concurrent rotation attempt a no-op rather than a corruption.
  --
  -- The status is pinned to 'active' as well: a credential removed between the
  -- read and the write must not be resurrected by a rewrap.
  update public.user_ai_credentials as credential
  set ciphertext = p_ciphertext,
      iv = p_iv,
      key_version = p_key_version
  where credential.user_id = p_user_id
    and credential.key_version = p_expected_key_version
    and credential.status = 'active';

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

comment on function public.admin_rewrap_credential_envelope(uuid, smallint, bytea, bytea, smallint) is
  'SH-EXPOSURE-001: the rotation write, as a compare-and-set on key_version. Returns false rather than raising when the row moved, so a concurrent rotation is a skip and never a corruption.';

do $credential_admin_grants$
declare
  signature text;
begin
  foreach signature in array array[
    'public.admin_credential_status(uuid)',
    'public.admin_list_credential_envelopes(integer, integer)',
    'public.admin_rewrap_credential_envelope(uuid, smallint, bytea, bytea, smallint)'
  ]
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated', signature
    );
    execute pg_catalog.format('grant execute on function %s to service_role', signature);
  end loop;
end;
$credential_admin_grants$;

revoke all on table public.user_ai_credentials from service_role;
revoke all on table public.credential_validation_attempts from service_role;


-- ---------------------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------------------

do $retention_postcondition$
declare
  offender text;
  seeded integer;
begin
  select pg_catalog.count(*) into seeded from private.retention_windows;
  if seeded <> 7 then
    raise exception 'expected 7 retention windows, found %', seeded
      using errcode = 'P0001', detail = 'SH_RETENTION_SEED';
  end if;

  -- Every sweep and every twin is DEFINER with an empty search_path.
  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and (proc.proname like 'prune\_%' or proc.proname like 'count\_prunable\_%')
      and (
        not proc.prosecdef
        or proc.proconfig is null
        or not (proc.proconfig @> array['search_path=""'])
      )
  loop
    raise exception 'retention function % is not definer-with-empty-search-path', offender
      using errcode = 'P0001', detail = 'SH_RETENTION_DEFINER';
  end loop;

  -- No role can execute a sweep. This is the assertion that matters most: a
  -- purge reachable by a client is a denial-of-service lever, and on the
  -- throttle ledger it is a ceiling reset.
  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
         unnest(array[
           'public.prune_terminal_jobs()',
           'public.prune_notifications()',
           'public.prune_product_events()',
           'public.prune_heartbeat_runs()',
           'public.prune_undo_operations()',
           'public.prune_auth_event_attempts()',
           'public.prune_credential_validation_attempts()'
         ]) as signature
    where pg_catalog.has_function_privilege(role_name::name, signature, 'execute')
  ) then
    raise exception 'a retention sweep is executable by a client role'
      using errcode = 'P0001', detail = 'SH_RETENTION_SWEEP_GRANT';
  end if;

  -- The twins are reachable by service_role and by nobody else.
  if exists (
    select 1
    from unnest(array['anon', 'authenticated']) as role_name,
         unnest(array[
           'public.count_prunable_terminal_jobs()',
           'public.count_prunable_notifications()',
           'public.count_prunable_product_events()',
           'public.count_prunable_heartbeat_runs()',
           'public.count_prunable_undo_operations()',
           'public.count_prunable_auth_event_attempts()',
           'public.count_prunable_credential_validation_attempts()'
         ]) as signature
    where pg_catalog.has_function_privilege(role_name::name, signature, 'execute')
  ) then
    raise exception 'a dry-run twin is reachable by a browser role'
      using errcode = 'P0001', detail = 'SH_RETENTION_TWIN_GRANT';
  end if;

  -- And reachable BY service_role, which is the non-vacuous half: a revoke that
  -- also took the operator's access would pass every assertion above and make
  -- the dry-run transcript impossible to produce.
  for offender in
    select signature
    from unnest(array[
      'public.count_prunable_terminal_jobs()',
      'public.count_prunable_notifications()',
      'public.count_prunable_product_events()',
      'public.count_prunable_heartbeat_runs()',
      'public.count_prunable_undo_operations()',
      'public.count_prunable_auth_event_attempts()',
      'public.count_prunable_credential_validation_attempts()'
    ]) as signature
    where not pg_catalog.has_function_privilege('service_role', signature, 'execute')
  loop
    raise exception 'dry-run twin % is not executable by the operator', offender
      using errcode = 'P0001', detail = 'SH_RETENTION_TWIN_MISSING';
  end loop;

  -- The private predicates are reachable by nobody, and the windows table by
  -- no role at all.
  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
         unnest(array[
           'private.retention_window(text)',
           'private.retention_batch_limit()',
           'private.prunable_job_ids(integer)',
           'private.prunable_notification_ids(integer)',
           'private.prunable_product_event_ids(integer)',
           'private.prunable_heartbeat_run_ids(integer)',
           'private.prunable_undo_operation_ids(integer)',
           'private.prunable_auth_event_attempt_ids(integer)',
           'private.prunable_credential_validation_attempt_ids(integer)'
         ]) as signature
    where pg_catalog.has_function_privilege(role_name::name, signature, 'execute')
  ) then
    raise exception 'a retention predicate is executable by a client role'
      using errcode = 'P0001', detail = 'SH_RETENTION_PREDICATE_GRANT';
  end if;

  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as privilege
    where pg_catalog.has_table_privilege(role_name::name, 'private.retention_windows', privilege)
  ) then
    raise exception 'a client role holds a privilege on private.retention_windows'
      using errcode = 'P0001', detail = 'SH_RETENTION_WINDOW_GRANT';
  end if;

  -- SH-EXPOSURE-001, read back rather than assumed.
  if exists (
    select 1
    from unnest(array['public.user_ai_credentials', 'public.credential_validation_attempts']) as relation,
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as privilege
    where pg_catalog.has_table_privilege('service_role', relation, privilege)
  ) then
    raise exception 'service_role still holds a table privilege on a BYOK table'
      using errcode = 'P0001', detail = 'SH_EXPOSURE_BYOK_GRANT';
  end if;

  -- And the DEFINER paths that must keep working, proven to still be reachable
  -- by the roles that call them. Revoking a table grant is only safe if the
  -- functions that replaced it are intact, and asserting that here is what
  -- makes the revoke above something other than a hopeful statement.
  if not pg_catalog.has_function_privilege(
       'authenticated',
       'public.claim_credential_validation_slot(text, integer, integer)',
       'execute')
  then
    raise exception 'the BYOK validation claim is no longer reachable by authenticated'
      using errcode = 'P0001', detail = 'SH_EXPOSURE_BYOK_PATH';
  end if;

  for offender in
    select signature
    from unnest(array[
      'public.admin_credential_status(uuid)',
      'public.admin_list_credential_envelopes(integer, integer)',
      'public.admin_rewrap_credential_envelope(uuid, smallint, bytea, bytea, smallint)'
    ]) as signature
    where not pg_catalog.has_function_privilege('service_role', signature, 'execute')
  loop
    raise exception 'the narrow replacement % is unreachable by the operator', offender
      using errcode = 'P0001', detail = 'SH_EXPOSURE_REPLACEMENT_UNREACHABLE';
  end loop;

  -- The replacements must not be reachable by a browser role. They are the
  -- narrowed form of a service-role capability, not a new user-facing one.
  if exists (
    select 1
    from unnest(array['anon', 'authenticated']) as role_name,
         unnest(array[
           'public.admin_credential_status(uuid)',
           'public.admin_list_credential_envelopes(integer, integer)',
           'public.admin_rewrap_credential_envelope(uuid, smallint, bytea, bytea, smallint)'
         ]) as signature
    where pg_catalog.has_function_privilege(role_name::name, signature, 'execute')
  ) then
    raise exception 'a credential admin function is reachable by a browser role'
      using errcode = 'P0001', detail = 'SH_EXPOSURE_REPLACEMENT_WIDE';
  end if;
end;
$retention_postcondition$;
