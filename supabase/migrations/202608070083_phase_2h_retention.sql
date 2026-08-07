-- Phase 2H, slice 2H.5 -- retention for the classes this phase created.
--
-- 2H-RETENTION-001 (a sweep and a count-only twin for every retained class),
-- 2H-RETENTION-002 (this migration schedules NOTHING).
--
-- THE LAST MIGRATION OF PHASE 2H. Budget: five allocated, this is the fifth.
-- 2H.6 spends none. A sixth `phase_2h` migration is an owner amendment, and
-- `phase-2h-retention-guard.test.ts` fails on one.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS BUYS, AND WHAT IT DELIBERATELY DOES NOT
-- ---------------------------------------------------------------------------
--
-- Three classes reach this slice in three different states:
--
--   `error_events`         2H.2 built a sweep and a twin. The window was a
--   `scheduled_job_health` REQUIRED ARGUMENT with no home, so the number a
--                          scheduled statement would use lived in the cron
--                          statement text rather than as data. This migration
--                          gives both a row in `private.retention_windows` and
--                          a zero-argument form that reads it -- the SH.6 shape
--                          (`202608050077`), so one schedule has one home.
--
--   `rate_limit_events`    2H.3 built no sweep at all, and it is the ONE class
--                          in this phase that genuinely accumulates for a live
--                          user: one row per admission decision, forever. It
--                          gets a predicate, a twin and a sweep here.
--
-- `account_deletion_attempts` (2H.1) gets NOTHING, and that is the decision
-- rather than the omission. It is `on delete cascade` from `auth.users`, so a
-- completed deletion removes the rows; and a STALLED row must survive exactly
-- as long as the account it is stuck on, because it is the only evidence that
-- the account is stuck. A window there would delete the finding.
--
-- ---------------------------------------------------------------------------
-- THE WINDOW IS NOT MINTED HERE -- IT IS THE SIGNED ONE
-- ---------------------------------------------------------------------------
--
-- PRD sec. 14.1, adopted by the owner's execution authorization, signs
-- **90 days** for the error sink (`2H-SINK-004`) and **90 days** for dead-man
-- history (`2H-RETENTION-001`). Both are used unchanged.
--
-- `rate_limit_events` is NOT named in sec. 14.1. It therefore reuses the signed
-- 90-day Phase 2H observability window rather than inventing a fourth number,
-- and this comment is the loud part: **no new retention value is minted by this
-- migration.** A genuinely new, unsigned window would be an owner stop, not a
-- judgement call taken inside DDL. Ninety days is also more than safe here for
-- a reason worth writing down: the limiter's own window is ONE ROLLING HOUR
-- (`2H-RATE-001`, V-3), so a 90-day sweep cannot remove a row any ceiling could
-- still be counting -- it is off by three orders of magnitude in the safe
-- direction.
--
-- ---------------------------------------------------------------------------
-- NOTHING HERE IS SCHEDULED, AND THAT IS ADR-082
-- ---------------------------------------------------------------------------
--
-- SH.6's migration scheduled its own sweeps at apply time and thereby took the
-- purge decision the gate existed to hold open; the schedules were removed the
-- same day. Scheduling IS authorization. This migration creates functions that
-- no role can execute and does not put any of them in `cron.job`. Section 6
-- raises if it ever does, so the rule is enforced by the migration against
-- itself and not only by a test that reads it.
--
-- NO EXPLICIT `begin;`/`commit;`, matching every migration in this chain.
-- `supabase db push` already runs each file inside a transaction, so an inner
-- `commit;` would end THAT transaction and leave the statements after it
-- running in autocommit — which would mean the section 6 guard raising after
-- the DDL had already been committed. The self-assertion is only worth
-- anything while it can still roll the DDL back.

-- ---------------------------------------------------------------------------
-- 1. The three windows get a home
-- ---------------------------------------------------------------------------
--
-- `private.retention_windows` (SH.6) is the one registry, deliberately reused
-- rather than duplicated: a second table would be a second schedule, which is
-- the failure the first one was built to prevent.
--
-- `on conflict ... do update` rather than `do nothing`, and the difference
-- matters in exactly one direction. `do nothing` is idempotent but not
-- AUTHORITATIVE: against a database that already held one of these keys at a
-- different number, it would leave the wrong window in place and report
-- success. The registry is migration-owned data, so the migration's value wins;
-- and `2H-BACKUP-002`'s drill replays the whole chain, so replayability is a
-- requirement rather than a nicety.

insert into private.retention_windows (key, days, note) values
  ('error_events', 90,
   '2H-SINK-004 / 2H-RETENTION-001. PRD sec. 14.1, signed. Operational failure records, no user content (2H-SINK-002). Not a Privacy Policy class: the row is de-identified on account deletion rather than retained against a person.'),
  ('scheduled_job_health', 90,
   '2H-DEADMAN-004 / 2H-RETENTION-001. PRD sec. 14.1, signed. Dead-man history. Only rows for jobs that have LEFT the cron catalog are ever prunable -- see private.prunable_scheduled_job_health.'),
  ('rate_limit_events', 90,
   '2H-RATE-001 / 2H-RETENTION-001. NOT a new value: sec. 14.1 does not name this class, so it reuses the signed 90-day Phase 2H observability window. The limiter reads a ONE HOUR rolling window, so this cannot remove a row a ceiling is counting.')
on conflict (key) do update
  set days = excluded.days,
      note = excluded.note,
      updated_at = pg_catalog.now();

-- ---------------------------------------------------------------------------
-- 2. `rate_limit_events` -- the one class with no sweep at all
-- ---------------------------------------------------------------------------
--
-- The SH.6 shape exactly: ONE predicate, the twin counting what it returns and
-- the sweep deleting what it returns. There is no second copy of the rule, so
-- the dry run and the deletion cannot disagree -- which is the whole of
-- `2H-RETENTION-001`'s "identical predicate" and is a structural property here
-- rather than a reviewed one.
--
-- `p_limit` is null for the twin and the batch bound for the sweep. Ordering
-- oldest-first means a bounded sweep always makes progress on the oldest rows.

create or replace function private.prunable_rate_limit_event_ids(p_limit integer)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select event.id
  from public.rate_limit_events as event
  where event.consumed_at
    < pg_catalog.now() - pg_catalog.make_interval(days => private.retention_window('rate_limit_events'))
  order by event.consumed_at
  limit p_limit
$$;

revoke all on function private.prunable_rate_limit_event_ids(integer)
  from public, anon, authenticated, service_role;

comment on function private.prunable_rate_limit_event_ids(integer) is
  '2H-RETENTION-001. The single predicate behind both halves of the rate_limit_events sweep. Both outcomes are prunable: a refused row is evidence of a refusal that has already expired out of every ceiling, and keeping it longer than an admitted one would retain more about a user who was told no.';

create or replace function public.count_prunable_rate_limit_events()
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select pg_catalog.count(*)
  from private.prunable_rate_limit_event_ids(null::integer) as prunable(id);
$$;

revoke all on function public.count_prunable_rate_limit_events()
  from public, anon, authenticated;
grant execute on function public.count_prunable_rate_limit_events() to service_role;

comment on function public.count_prunable_rate_limit_events() is
  '2H-RETENTION-003. The count-only twin. service_role may run it because a dry run must be possible without the ability to delete; the destructive half below is executable by NO role.';

create or replace function public.prune_rate_limit_events()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed bigint;
begin
  delete from public.rate_limit_events
  where id in (
    select prunable.id
    from private.prunable_rate_limit_event_ids(private.retention_batch_limit()) as prunable(id)
  );

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_rate_limit_events()
  from public, anon, authenticated, service_role;

comment on function public.prune_rate_limit_events() is
  '2H-RETENTION-001 / 2H-RETENTION-002. Removes rate-limit rows outside the registry window, bounded by private.retention_batch_limit(). Executable by NO role including service_role -- only the scheduler has reason to delete, and THIS MIGRATION DOES NOT SCHEDULE IT (ADR-082). Enabling the schedule IS the authorization of the first live purge.';

-- ---------------------------------------------------------------------------
-- 3. The 2H.2 classes: a zero-argument form that reads the registry
-- ---------------------------------------------------------------------------
--
-- 2H.2's `prune_error_events(interval, integer)` and
-- `prune_scheduled_job_health(interval, integer)` stay exactly as they are --
-- they are append-only history and the pgTAP boundary suite calls them with an
-- explicit window precisely BECAUSE it needs to test a boundary it chose.
--
-- What is added is the schedulable form. The distinction matters: a cron
-- statement reading `select public.prune_error_events('90 days', 10000)` would
-- put the signed number in a THIRD place (registry, constants module, cron
-- statement text) where nothing compares it to the other two. The zero-argument
-- form takes both values from data, so a scheduled statement carries no number
-- at all and the cron catalog cannot drift from the registry.
--
-- These are thin wrappers over the existing functions. They are not a second
-- copy of any predicate.

create or replace function public.prune_error_events()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select public.prune_error_events(
    pg_catalog.make_interval(days => private.retention_window('error_events')),
    private.retention_batch_limit()
  );
$$;

revoke all on function public.prune_error_events()
  from public, anon, authenticated, service_role;

comment on function public.prune_error_events() is
  '2H-RETENTION-001. The schedulable form of 2H.2''s sweep: window from private.retention_windows, bound from private.retention_batch_limit(), so a cron statement carries no number. Executable by no role; NOT SCHEDULED (ADR-082).';

create or replace function public.count_prunable_error_events()
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select public.count_prunable_error_events(
    pg_catalog.make_interval(days => private.retention_window('error_events'))
  );
$$;

revoke all on function public.count_prunable_error_events()
  from public, anon, authenticated;
grant execute on function public.count_prunable_error_events() to service_role;

comment on function public.count_prunable_error_events() is
  '2H-RETENTION-003. The count-only twin of prune_error_events(), reading the same registry window, so the dry run measures exactly what the schedulable sweep would remove.';

create or replace function public.prune_scheduled_job_health()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select public.prune_scheduled_job_health(
    pg_catalog.make_interval(days => private.retention_window('scheduled_job_health')),
    private.retention_batch_limit()
  );
$$;

revoke all on function public.prune_scheduled_job_health()
  from public, anon, authenticated, service_role;

comment on function public.prune_scheduled_job_health() is
  '2H-DEADMAN-004 / 2H-RETENTION-001. The schedulable form. A LIVE job''s health row is never prunable at any age -- the inherited predicate requires the job to have left the cron catalog -- so this cannot reset the history the dead-man switch reads.';

create or replace function public.count_prunable_scheduled_job_health()
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select public.count_prunable_scheduled_job_health(
    pg_catalog.make_interval(days => private.retention_window('scheduled_job_health'))
  );
$$;

revoke all on function public.count_prunable_scheduled_job_health()
  from public, anon, authenticated;
grant execute on function public.count_prunable_scheduled_job_health() to service_role;

comment on function public.count_prunable_scheduled_job_health() is
  '2H-RETENTION-003. The count-only twin of prune_scheduled_job_health(), reading the same registry window.';

-- ---------------------------------------------------------------------------
-- 4. Every Phase 2H window has both halves -- 2H-RETENTION-004
-- ---------------------------------------------------------------------------
--
-- A declared window with no sweep is a promise nothing keeps; a sweep with no
-- twin is a purge that can only be learned about by running it. Both are
-- asserted here, at apply time, against the catalog rather than against the
-- migration text -- so a wrapper that failed to create is caught by the same
-- transaction that created the window.

do $$
declare
  window_key text;
  sweep text;
  twin text;
begin
  for window_key, sweep, twin in
    select *
    from (values
      ('error_events',        'public.prune_error_events()',        'public.count_prunable_error_events()'),
      ('scheduled_job_health','public.prune_scheduled_job_health()','public.count_prunable_scheduled_job_health()'),
      ('rate_limit_events',   'public.prune_rate_limit_events()',   'public.count_prunable_rate_limit_events()')
    ) as pairs(k, s, t)
  loop
    -- Existence is not enough. A window that exists at the wrong number is the
    -- failure this whole slice is about -- a policy claim and an enforced
    -- window that silently disagree -- so the SIGNED value is asserted, not the
    -- presence of a row. Ninety is PRD sec. 14.1, and a different number here
    -- would mean someone changed a signed value without an amendment.
    if not exists (
      select 1 from private.retention_windows as w
      where w.key = window_key and w.days = 90
    ) then
      raise exception
        'Phase 2H window % is missing or is not the signed 90 days (PRD sec. 14.1)', window_key;
    end if;

    if pg_catalog.to_regprocedure(sweep) is null then
      raise exception 'window % has no schedulable sweep (%)', window_key, sweep;
    end if;

    if pg_catalog.to_regprocedure(twin) is null then
      raise exception 'sweep % has no count-only twin (%)', sweep, twin;
    end if;

    -- The destructive half is reachable by no role at all. The twin is
    -- reachable by service_role only. Asserted per pair rather than once,
    -- because a single missed `revoke` is exactly the shape of this defect.
    if pg_catalog.has_function_privilege('service_role', sweep, 'execute')
      or pg_catalog.has_function_privilege('authenticated', sweep, 'execute')
      or pg_catalog.has_function_privilege('anon', sweep, 'execute')
    then
      raise exception 'destructive sweep % is executable by a role that must not hold it', sweep;
    end if;

    if not pg_catalog.has_function_privilege('service_role', twin, 'execute') then
      raise exception 'count-only twin % is not executable by service_role, so no dry run is possible', twin;
    end if;

    if pg_catalog.has_function_privilege('authenticated', twin, 'execute')
      or pg_catalog.has_function_privilege('anon', twin, 'execute')
    then
      raise exception 'count-only twin % is readable by a client role', twin;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The predicate is genuinely shared -- proven, not asserted
-- ---------------------------------------------------------------------------
--
-- `2H-RETENTION-001` requires the count-only twin and the destructive sweep to
-- use an IDENTICAL predicate. The structure already guarantees it (one
-- function, two callers), and this proves the structure is what shipped: the
-- twin's count must equal the number of rows the predicate returns unbounded.
-- Cheap, runs against whatever the database actually holds, and would catch a
-- future edit that gave one half its own `where`.

do $$
declare
  from_twin bigint;
  from_predicate bigint;
begin
  select public.count_prunable_rate_limit_events() into from_twin;

  select pg_catalog.count(*) into from_predicate
  from private.prunable_rate_limit_event_ids(null::integer) as prunable(id);

  if from_twin is distinct from from_predicate then
    raise exception 'the rate_limit_events twin (%) and its predicate (%) disagree', from_twin, from_predicate;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. This migration scheduled nothing -- 2H-RETENTION-002
-- ---------------------------------------------------------------------------
--
-- ADR-082, enforced by the migration against itself. The two attempt-prune jobs
-- that predate Phase 2H (`byok-prune-validation-attempts`,
-- `sh-prune-auth-event-attempts`) were authorized separately and are untouched;
-- what is forbidden is a NEW schedule for anything this phase built.

do $$
declare
  offender text;
begin
  select job.jobname into offender
  from cron.job as job
  where job.command ~* '(prune_error_events|prune_scheduled_job_health|prune_rate_limit_events)'
  limit 1;

  if offender is not null then
    raise exception
      'a Phase 2H retention sweep is scheduled as "%", which ADR-082 forbids a migration to do: scheduling IS the authorization of the first live purge',
      offender;
  end if;
end;
$$;
