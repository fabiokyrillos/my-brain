-- ---------------------------------------------------------------------------
-- Post-2H rollout hardening -- correct the fresh-database scheduling defect
-- left by `202608050077`.
--
-- IDENTITY. This migration is **not** part of Phase 2H. Phase 2H's budget was
-- FIVE migrations, all five spent (`202608070079`..`202608070083`), each by the
-- slice it was allocated to, and the budget is non-transferable. This one is
-- authorized separately by the owner on 2026-08-07 as a **post-2H rollout
-- hardening** correction, recorded in ADR-091. It must not be counted against,
-- or reconciled into, the Phase 2H budget.
--
-- THE DEFECT (F-2H.5-7, high, latent). `202608050077`'s `do
-- $retention_schedule$` block calls `cron.schedule` for seven jobs. Five of
-- them are **user-content** sweeps:
--
--     sh-prune-terminal-jobs      04:11  select public.prune_terminal_jobs();
--     sh-prune-notifications      04:17  select public.prune_notifications();
--     sh-prune-product-events     04:23  select public.prune_product_events();
--     sh-prune-heartbeat-runs     04:29  select public.prune_heartbeat_runs();
--     sh-prune-undo-operations    04:35  select public.prune_undo_operations();
--
-- Those five were removed from the **hosted** project on 2026-08-05 by an
-- operator act (`scripts/sh6-retention-schedule.mjs`, ADR-082). The migration
-- was not, and could not be, edited afterwards -- migrations are append-only.
--
-- So the hosted project is safe and **any database built from the chain is
-- not**: CI's `supabase db reset`, a disposable project restored for a drill,
-- any new environment. Each of them schedules all five and begins **deleting
-- user content at 04:11 UTC the next morning**, with nobody having authorized a
-- purge. That is precisely the failure ADR-082 was written about, still live in
-- the chain, and reachable by anyone standing up an environment.
--
-- WHAT THIS MIGRATION DOES, AND THE FULL LIST OF WHAT IT DOES NOT.
--
-- Does:  unschedules those five job names if they are present.
-- Does NOT: schedule anything -- and asserts that about itself below.
-- Does NOT: execute any sweep, any prune, or any DELETE.
-- Does NOT: delete, de-identify or modify one row of user data.
-- Does NOT: drop, alter or re-grant any function. The eight built destructive
--           retention mechanisms are left exactly as they are: **built and
--           unscheduled**, executable by no role, which is the posture ADR-082
--           requires and the state the rollout gate reads.
-- Does NOT: touch the two separately authorized attempt-ledger prunes
--           (`prune_auth_event_attempts`, `prune_credential_validation_attempts`)
--           or any other operational cron job. The postcondition proves it.
--
-- IDEMPOTENT. Applying it to a database where the five are already absent --
-- the hosted project today, or a second application of the chain -- unschedules
-- nothing, raises nothing, and still asserts the postcondition. `cron.unschedule`
-- raises when the job name does not exist, so membership is checked first;
-- that check is the idempotency, not a convenience.
--
-- TRANSACTION-LOCAL POSTCONDITION. `supabase db push` runs each migration
-- inside a transaction and this file **does not manage its own** (see
-- `phase-2h-retention-guard.test.ts`, which asserts exactly that for the same
-- reason: an inner `commit;` would end the outer transaction and leave the
-- assertion below unable to roll anything back). `cron.unschedule` is ordinary
-- DML on `cron.job`, so a raise here rolls the unschedules back with it.
-- ---------------------------------------------------------------------------

do $post_2h_retention_schedule_correction$
declare
  -- The five, by the exact names `202608050077` scheduled them under. Named
  -- literally rather than derived, because the set this migration is authorized
  -- to remove is a closed list decided by the owner, not a pattern that could
  -- widen when somebody adds a sweep later.
  forbidden constant text[] := array[
    'sh-prune-terminal-jobs',
    'sh-prune-notifications',
    'sh-prune-product-events',
    'sh-prune-heartbeat-runs',
    'sh-prune-undo-operations'
  ];

  -- Every destructive sweep this product has built, all eight. The absence
  -- check below is stated over the COMMAND, so it also catches one of these
  -- scheduled under a name nobody here anticipated. `2H-RETENTION`'s own suite
  -- learned this the hard way: the BYOK prune's job NAME differs between a
  -- chain-built database and the hosted project, so a name is an artifact of
  -- which environment wrote the catalog. The command is what the authorization
  -- was about.
  destructive constant text :=
    '(prune_terminal_jobs|prune_notifications|prune_product_events'
    || '|prune_heartbeat_runs|prune_undo_operations'
    || '|prune_error_events|prune_scheduled_job_health|prune_rate_limit_events)';

  before_jobs text[];
  after_jobs  text[];
  lost        text[];
  added       text[];
  offender    text;
  job_name    text;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    -- `202608050077`'s own block returns early under the same condition, so a
    -- database without the extension never had the five in the first place and
    -- the posture this migration exists to produce is already true.
    raise notice
      'pg_cron is absent: 202608050077 scheduled nothing here, so there is nothing to unschedule';
    return;
  end if;

  select coalesce(array_agg(job.jobname order by job.jobname), array[]::text[])
    into before_jobs
    from cron.job as job;

  foreach job_name in array forbidden loop
    if job_name = any (before_jobs) then
      perform cron.unschedule(job_name);
      raise notice 'unscheduled the user-content sweep "%" left by 202608050077', job_name;
    end if;
  end loop;

  select coalesce(array_agg(job.jobname order by job.jobname), array[]::text[])
    into after_jobs
    from cron.job as job;

  -- Postcondition 1 -- none of the five is present, by name.
  select candidate into offender
    from unnest(after_jobs) as candidate
   where candidate = any (forbidden)
   limit 1;

  if offender is not null then
    raise exception
      'postcondition failed: the user-content sweep "%" is still scheduled after this migration ran',
      offender;
  end if;

  -- Postcondition 2 -- and no destructive sweep of ANY of the eight is
  -- scheduled under any name at all. Strictly stronger than postcondition 1,
  -- and it is the one that would catch a sweep re-scheduled under an alias.
  select job.jobname into offender
    from cron.job as job
   where job.command ~* destructive
   limit 1;

  if offender is not null then
    raise exception
      'postcondition failed: "%" schedules a destructive retention sweep, which ADR-082 forbids: scheduling IS the authorization of the first live purge',
      offender;
  end if;

  -- Postcondition 3 -- preservation. Every job that existed before and is not
  -- one of the five still exists. This is what protects the two authorized
  -- attempt-ledger prunes and every ordinary operational job
  -- (`my-brain-heartbeat`, `my-brain-job-reaper`, the per-minute drain), and an
  -- absence-only check would be satisfied by a migration that removed all of
  -- them.
  select coalesce(array_agg(candidate order by candidate), array[]::text[])
    into lost
    from unnest(before_jobs) as candidate
   where not (candidate = any (after_jobs))
     and not (candidate = any (forbidden));

  if array_length(lost, 1) is not null then
    raise exception
      'postcondition failed: this migration removed cron jobs it was not authorized to touch: %',
      lost;
  end if;

  -- Postcondition 4 -- this migration schedules NOTHING. ADR-082's rule
  -- travelling with the DDL rather than only with the repository, in the shape
  -- `202608070083` established.
  select coalesce(array_agg(candidate order by candidate), array[]::text[])
    into added
    from unnest(after_jobs) as candidate
   where not (candidate = any (before_jobs));

  if array_length(added, 1) is not null then
    raise exception
      'postcondition failed: this migration scheduled %, and it is authorized to schedule nothing',
      added;
  end if;

  raise notice
    'post-2H retention schedule correction: % cron jobs before, % after, five user-content sweeps forbidden and absent',
    coalesce(array_length(before_jobs, 1), 0),
    coalesce(array_length(after_jobs, 1), 0);
end;
$post_2h_retention_schedule_correction$;
