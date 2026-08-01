-- BYOK Slice BYOK.4, migration 2 of 2 — the credential-aware drain, and
-- terminal configuration failures.
--
-- `BYOK-JOBS-002`, `BYOK-JOBS-003`, `BYOK-JOBS-004`, `BYOK-JOBS-005`.
--
-- A DECLARED EXPANSION OF THIS MIGRATION'S APPROVED CONTENT
-- ---------------------------------------------------------------------------
-- The BYOK.4 budget is **two migrations**, and this is the second. The
-- implementation plan describes it as the `claim_next_entry_interpretation_job`
-- replacement alone; it also contains `fail_job_terminal`, and that is written
-- here rather than discovered in review.
--
-- The reason is `BYOK-JOBS-003`: a job that reaches execution with no active
-- credential must move to a declared terminal state and must not consume a
-- retry. The existing `fail_job` cannot express that. Its terminality is
-- `attempts >= max_attempts` and nothing else, so a credential failure on
-- attempt 1 of 5 is scheduled for four more attempts that will fail identically.
-- The three ways to fix that were:
--
--   1. add a `p_terminal` argument to `fail_job` — impossible with
--      `create or replace` (PostgreSQL cannot extend an argument list that way;
--      `ADR-057` records this codebase learning it the expensive way), so it
--      would mean `drop function` plus recreate, changing a signature four
--      callers and a pgTAP suite depend on;
--   2. teach `fail_job` to read `p_error` and infer terminality from the code —
--      an overload of an error-message parameter with control-flow meaning,
--      which is exactly the kind of implicit coupling this repository files
--      rather than ships;
--   3. a second, explicitly named function with its own grant. One more
--      function in the same migration file, no existing signature touched, and
--      the retry policy visible at the call site.
--
-- Three, and it stays inside the two-file budget. Recorded in the BYOK.4
-- acceptance report and in `ADR-071` rather than folded silently into "the claim
-- replacement".
--
-- WHAT "CONSUMES NO RETRY" MEANS HERE, PRECISELY
-- ---------------------------------------------------------------------------
-- `jobs.attempts` is incremented by the **claim**, not by the failure, so by the
-- time any handler runs, the attempt is already spent and no failure path can
-- give it back. What this function guarantees is the part that is still in
-- reach and the part that actually costs something: **no further attempt is
-- scheduled**. `next_attempt_at` is not moved, `status` goes straight to
-- `exhausted`, and the remaining budget is left for a failure a retry could fix.
-- Stated plainly here because "does not consume a retry" would otherwise read as
-- a promise this cannot keep.

-- ---------------------------------------------------------------------------
-- 1. Terminal failure.
-- ---------------------------------------------------------------------------

create or replace function public.fail_job_terminal(
  p_job_id uuid,
  p_worker_id text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.jobs%rowtype;
  failed public.jobs%rowtype;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;

  -- BYOK-JOBS-005, enforced by the database rather than trusted to the caller.
  -- The worker already refuses to send anything else; this refuses to store
  -- anything else, so a future handler that reverts to `error.message` fails
  -- loudly here instead of quietly writing a provider message into a column the
  -- Jobs page renders verbatim.
  if p_error is null or p_error not in (
    'credential_required',
    'credential_unavailable',
    'credential_unreadable',
    'invalid_key',
    'revoked',
    'insufficient_quota',
    'invalid_payload',
    'subject_not_found'
  ) then
    raise exception 'Terminal job failure requires a declared terminal code' using errcode = '22023';
  end if;

  -- The same lease check `fail_job` performs, in the same shape: only the worker
  -- that currently holds a live lease may end this job.
  select * into claimed
  from public.jobs
  where id = p_job_id
    and status = 'running'
    and locked_by = btrim(p_worker_id)
    and lease_expires_at > now()
  for update;

  if claimed.id is null then
    return null;
  end if;

  update public.jobs
  -- `next_attempt_at` is deliberately absent from this SET: nothing is
  -- scheduled, so moving it would only describe an attempt that will never
  -- happen. `status = 'exhausted'` is what makes it unreachable.
  set status = 'exhausted',
      error = p_error,
      failed_at = now(),
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = claimed.id
  returning * into failed;

  return to_jsonb(failed);
end;
$$;

comment on function public.fail_job_terminal(uuid, text, text) is
  'Ends a claimed job immediately with a declared terminal failure code and schedules no further attempt (BYOK-JOBS-003/004/005). p_error is restricted to the closed terminal vocabulary. service_role only.';

revoke all on function public.fail_job_terminal(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fail_job_terminal(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. The credential-aware drain.
-- ---------------------------------------------------------------------------
--
-- `BYOK-JOBS-002`. One `not exists` predicate is added to the selection query.
-- Signature, `service_role` gate, argument validation, ordering,
-- `for update skip locked`, the lease delegation to
-- `claim_entry_interpretation_job` and every retry condition outside the
-- credential question are byte-for-byte the `202607170025` original.
--
-- WHY THE PREDICATE IS IN THE DRAIN AND NOT IN THE CLAIM
-- ---------------------------------------------------------------------------
-- `claim_entry_interpretation_job` — the direct, per-job claim — is deliberately
-- left alone. It is reached from an authenticated invocation about one named
-- job, and the handler resolves the credential immediately afterwards and fails
-- the job terminally when there is none. Adding the predicate there would turn
-- "your key is missing" into "this job is not available", which is a worse
-- answer to the same question: the job *is* available, it is the configuration
-- that is not, and only one of those two facts leads the user anywhere useful.
--
-- The unattended drain has no such caller to tell. Its failure mode is spinning:
-- claim, resolve, fail, claim the next one, across every uncredentialed owner in
-- the queue, spending lease churn and attempts on work that cannot succeed. So
-- the predicate belongs exactly here.
--
-- WHY THIS DOES NOT STRAND WORK
-- ---------------------------------------------------------------------------
-- The predicate is evaluated at claim time on live data. A job skipped today
-- because its owner had no key becomes eligible the moment they configure one --
-- no requeue, no repair, no backfill. `status in ('pending', 'failed')` and
-- `attempts < max_attempts` are unchanged, so a skipped job keeps whatever
-- budget it had. And it cannot starve credentialed owners, because a job that is
-- not selected is not locked either: `for update skip locked` never sees it.

create or replace function public.claim_next_entry_interpretation_job(
  p_worker_id text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.jobs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_worker_id is null or btrim(p_worker_id) = '' or char_length(btrim(p_worker_id)) > 128 then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Lease duration must be between 30 and 900 seconds' using errcode = '22023';
  end if;

  select * into selected_job
  from public.jobs job
  where job.type = 'interpret_entry'
    and private.is_valid_entry_interpretation_job_payload(job.payload)
    and job.status in ('pending', 'failed')
    and job.attempts < job.max_attempts
    and job.next_attempt_at <= now()
    and exists (
      select 1
      from public.entries entry
      where entry.id = (job.payload ->> 'entry_id')::uuid
        and entry.user_id = job.user_id
    )
    -- BYOK-JOBS-002. The owner comes from the job row, as everywhere else in
    -- this chain, and `active` is the only status that counts -- `invalid` and
    -- `removed` are the same outcome as absent (BYOK-RESOLVER-005).
    and exists (
      select 1
      from public.user_ai_credentials credential
      where credential.user_id = job.user_id
        and credential.status = 'active'
    )
  order by job.priority desc, job.next_attempt_at, job.created_at
  for update skip locked
  limit 1;

  if selected_job.id is null then
    return null;
  end if;

  return public.claim_entry_interpretation_job(
    selected_job.id,
    selected_job.user_id,
    p_worker_id,
    p_lease_seconds
  );
end;
$$;

comment on function public.claim_next_entry_interpretation_job(text, integer) is
  'Claims the next eligible interpret_entry job across all owners, skipping owners with no ACTIVE AI credential (BYOK-JOBS-002). Signature, grants and lease semantics unchanged from 202607170025. service_role only.';

-- The grant posture is restated rather than assumed. `create or replace`
-- preserves privileges, but a future edit that turns this into `drop` +
-- `create` would silently grant EXECUTE to PUBLIC, and the postcondition below
-- would then be the only thing that noticed.
revoke all on function public.claim_next_entry_interpretation_job(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_entry_interpretation_job(text, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Post-deploy assertions.
-- ---------------------------------------------------------------------------

do $byok_drain_postcondition$
declare
  offending text;
  drain_body text;
begin
  -- The signature the worker calls, unchanged. A drain that grew or lost an
  -- argument would fail at runtime with a PostgREST 404 that reads like a
  -- deployment problem rather than a schema one.
  if (select pronargs from pg_catalog.pg_proc
        where oid = 'public.claim_next_entry_interpretation_job(text, integer)'::regprocedure) <> 2 then
    raise exception 'claim_next_entry_interpretation_job must take exactly two arguments'
      using errcode = 'P0001', detail = 'BYOK_DRAIN_SIGNATURE';
  end if;

  -- The predicate is actually present. Asserted against the stored body rather
  -- than trusted to this file having been applied, because a partially applied
  -- or manually patched function is the case this block exists for.
  select pg_catalog.pg_get_functiondef(
    'public.claim_next_entry_interpretation_job(text, integer)'::regprocedure
  ) into drain_body;

  if drain_body not like '%user_ai_credentials%' or drain_body not like '%active%' then
    raise exception 'claim_next_entry_interpretation_job does not filter on an active credential'
      using errcode = 'P0001', detail = 'BYOK_DRAIN_PREDICATE';
  end if;

  -- The conditions that were already there must survive, or this migration
  -- would have "added a credential filter" while quietly removing the retry
  -- budget or the ownership check.
  if drain_body not like '%attempts < job.max_attempts%'
    or drain_body not like '%for update skip locked%'
    or drain_body not like '%entry.user_id = job.user_id%'
  then
    raise exception 'claim_next_entry_interpretation_job lost a pre-existing selection condition'
      using errcode = 'P0001', detail = 'BYOK_DRAIN_REGRESSION';
  end if;

  if (select prosecdef from pg_catalog.pg_proc
        where oid = 'public.fail_job_terminal(uuid, text, text)'::regprocedure) is distinct from true
  then
    raise exception 'fail_job_terminal must be SECURITY DEFINER'
      using errcode = 'P0001', detail = 'BYOK_TERMINAL_SECURITY';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join pg_catalog.unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
    where procedure.oid = 'public.fail_job_terminal(uuid, text, text)'::regprocedure
      and pg_catalog.lower(setting.value) in ('search_path=', 'search_path=""')
  ) then
    raise exception 'fail_job_terminal must pin an empty search_path'
      using errcode = 'P0001', detail = 'BYOK_TERMINAL_SECURITY';
  end if;

  select coalesce(string_agg(found.label, ', ' order by found.label), '')
  into offending
  from (
    select role_name || ' can execute fail_job_terminal' as label
    from unnest(array['anon', 'authenticated']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'public.fail_job_terminal(uuid, text, text)', 'execute'
    )

    union all

    select role_name || ' can execute claim_next_entry_interpretation_job' as label
    from unnest(array['anon', 'authenticated']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'public.claim_next_entry_interpretation_job(text, integer)', 'execute'
    )
  ) as found;

  if offending <> '' then
    raise exception 'a BYOK.4 job function is reachable by a role it must not be: %', offending
      using errcode = 'P0001', detail = 'BYOK_JOBS_GRANT';
  end if;

  if not (
    pg_catalog.has_function_privilege(
      'service_role', 'public.fail_job_terminal(uuid, text, text)', 'execute'
    )
    and pg_catalog.has_function_privilege(
      'service_role', 'public.claim_next_entry_interpretation_job(text, integer)', 'execute'
    )
  ) then
    raise exception 'a BYOK.4 job function is unreachable by service_role'
      using errcode = 'P0001', detail = 'BYOK_JOBS_MISSING_GRANT';
  end if;
end;
$byok_drain_postcondition$;
