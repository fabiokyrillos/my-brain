-- Phase 2H, slice 2H.1 -- the stalled-deletion recovery mechanism.
--
-- 2H-RECOVER-001 (a stalled deletion is retried without human action),
-- 2H-RECOVER-002 (the retry is bounded, backs off, and ends in a terminal
-- `stalled` classification), 2H-RECOVER-003 (the reaper re-invokes and never
-- deletes), 2H-RECOVER-004 (an operator-readable stop reason that does not
-- widen `account_deletion_log`), 2H-RECOVER-005 (every retry is auditable).
-- ADR-085 authorizes the phase; ADR-082 governs what a migration may schedule.
--
-- THE DEFECT THIS EXISTS FOR
-- ---------------------------------------------------------------------------
-- On 2026-08-04 the deployed `delete-account` executor began answering
-- `credential_not_erased` for every account, because `202608050077` revoked the
-- grant its step 5 depended on while the narrowing that replaced it existed
-- only in the repository. Every affected account stayed in `deleting` -- every
-- write refused by the SH.1 predicates -- and **nothing re-ran the executor**.
-- What surfaced it was a person trying to delete an account, two days later.
--
-- `re-runnable` had been implemented as a property (the executor is idempotent
-- and resumable) rather than as a mechanism (something that actually re-runs
-- it). This migration is the mechanism.
--
-- WHY THE STATE IS A SEPARATE TABLE AND NOT A LIFECYCLE STATUS
-- ---------------------------------------------------------------------------
-- The obvious design adds `stalled` to `account_lifecycle.status`. It is wrong,
-- and dangerously so: every SH.1 predicate that blocks writes tests for
-- `deleting` (`202608040071`), so an account moved to a new status would
-- silently become writable again mid-deletion. The lifecycle status therefore
-- does not move. `stalled` is a **recovery classification** carried beside it,
-- in a table whose row cascades away with the account it belongs to.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- It schedules nothing. `reap_stalled_account_deletions` is created here and
-- put on `pg_cron` by `scripts/2h1-deletion-reaper-schedule.mjs --enable`,
-- because ADR-082's rule is that scheduling *is* authorization and it belongs
-- in an explicit operator act, not in a file that runs during `db push`. The
-- reaper drives the most destructive operation in the product; that it re-runs
-- only deletions a user already requested, under re-authentication and a typed
-- confirmation, does not make its activation something a migration decides.
--
-- It also grants nothing new to anybody. `account_deletion_log` keeps exactly
-- the posture `202608040072` gave it: forced RLS, no policy, revoked from every
-- role including `service_role`. The operator's stop reason comes from the
-- projection in section 6, which reads the recovery table and the lifecycle
-- table and never the log -- so 2H-RECOVER-004 is satisfied without the session
-- hash ever entering a readable surface.

-- ---------------------------------------------------------------------------
-- 1. The bounded recovery state -- 2H-RECOVER-002, built BEFORE the reaper
-- ---------------------------------------------------------------------------
--
-- The order inside this file is deliberate and is the plan's (2H.1, step 1
-- before step 2): the ceiling, the backoff and the terminal classification
-- exist before anything that retries, because a reaper written before its bound
-- is an unbounded retry loop against account deletion.

create table public.account_deletion_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- The recovery classification. NOT the lifecycle status: the account stays
  -- `deleting` throughout, so its writes stay refused.
  recovery_state text not null default 'pending',

  attempt_count integer not null default 0,

  first_seen_at timestamptz not null default now(),
  last_attempt_at timestamptz,

  -- Null means "never attempted": the claim predicate derives the first due
  -- time from `first_seen_at` plus the caller's declared retry interval, so no
  -- threshold is baked into a column default or a trigger body.
  next_attempt_at timestamptz,

  last_stop_reason text,

  -- The lease. A claim hands out a token; only a caller presenting it may
  -- report a result, and only the database can issue one.
  claim_token uuid,
  claim_expires_at timestamptz,

  updated_at timestamptz not null default now(),

  constraint account_deletion_attempts_recovery_state_check
    check (recovery_state in ('pending', 'retrying', 'stalled')),

  -- A hard ceiling on the ceiling. The caller declares `p_max_attempts`; this
  -- bounds what any caller can declare, so a mistyped argument cannot buy an
  -- unbounded loop.
  constraint account_deletion_attempts_attempt_count_check
    check (attempt_count >= 0 and attempt_count <= 50),

  -- The same closed-vocabulary discipline `account_deletion_log.stop_reason`
  -- uses, extended by exactly the two reasons the recovery path can produce
  -- that an executor run cannot: the invocation never reached the executor, and
  -- the ceiling was reached. Free text cannot land here, so no provider
  -- message, no path and no fragment of user content can be recorded by a
  -- reaper having a bad day.
  constraint account_deletion_attempts_last_stop_reason_check
    check (
      last_stop_reason is null
      or last_stop_reason in (
        'unknown_owned_table',
        'unclassifiable_storage_object',
        'cross_owner_reference',
        'storage_residue_remains',
        'credential_not_erased',
        'auth_delete_failed',
        'lifecycle_not_deleting',
        'invocation_failed',
        'attempt_ceiling_reached'
      )
    ),

  -- A token without an expiry is a lease that never ends.
  constraint account_deletion_attempts_claim_shape_check
    check ((claim_token is null) = (claim_expires_at is null)),

  -- Terminal means terminal: a stalled row holds no live claim.
  constraint account_deletion_attempts_stalled_has_no_claim_check
    check (recovery_state <> 'stalled' or claim_token is null)
);

comment on table public.account_deletion_attempts is
  '2H-RECOVER. One row per account currently in `deleting`, carrying the bounded retry state for the deletion executor: attempt count, backoff, lease and a closed stop-reason vocabulary. Seeded and removed by the lifecycle trigger, so a deletion that is reverted stops being retried. No user content, no session hash, no credential material. Forced RLS with no policy and revoked from every role including service_role -- the DEFINER functions below are its only readers and writers.';

create index account_deletion_attempts_due_idx
  on public.account_deletion_attempts (next_attempt_at)
  where recovery_state <> 'stalled';

alter table public.account_deletion_attempts enable row level security;
alter table public.account_deletion_attempts force row level security;

-- No policy at all, on purpose: forced RLS with none means every non-superuser
-- read returns nothing and every write is refused, exactly as
-- `account_deletion_log` is protected.
revoke all on public.account_deletion_attempts
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Seeding and unseeding, from the lifecycle machine itself
-- ---------------------------------------------------------------------------
--
-- Every path into `deleting` -- the user's `request_account_deletion` and the
-- operator's `begin_account_deletion_admin` -- updates `account_lifecycle`, so
-- a trigger there covers both without either function changing. A path back out
-- (`deletion_reverted`, SH-DELETE-014's admin return) removes the row, which is
-- how "cancelled or no-longer-deleting accounts are not acted on" is enforced
-- structurally rather than by a predicate somebody could forget.

create or replace function private.track_account_deletion_recovery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'deleting' and old.status is distinct from 'deleting' then
    insert into public.account_deletion_attempts (user_id)
    values (new.user_id)
    on conflict (user_id) do update
    set recovery_state = 'pending',
        attempt_count = 0,
        first_seen_at = now(),
        last_attempt_at = null,
        next_attempt_at = null,
        last_stop_reason = null,
        claim_token = null,
        claim_expires_at = null,
        updated_at = now();
  elsif old.status = 'deleting' and new.status is distinct from 'deleting' then
    delete from public.account_deletion_attempts as attempts
    where attempts.user_id = new.user_id;
  end if;

  return new;
end;
$$;

revoke all on function private.track_account_deletion_recovery()
  from public, anon, authenticated, service_role;

create trigger account_lifecycle_track_deletion_recovery
after update on public.account_lifecycle
for each row execute function private.track_account_deletion_recovery();

-- Accounts already sitting in `deleting` when this migration lands would never
-- fire the trigger, and they are precisely the population this slice exists
-- for. Backfilled at zero attempts; the claim predicate makes them due one
-- retry interval after this moment, not immediately.
insert into public.account_deletion_attempts (user_id)
select lifecycle.user_id
from public.account_lifecycle as lifecycle
where lifecycle.status = 'deleting'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. The bounded claim -- 2H-RECOVER-001, 2H-RECOVER-002, 2H-RECOVER-005
-- ---------------------------------------------------------------------------
--
-- Every threshold is a REQUIRED argument. There is no default anywhere in this
-- signature (ADR-080's discipline, and the reason is not style: a retry bound
-- with a silent default is a bound nobody has agreed to). The values the
-- operator script passes are PHASE_2H_PRD.md sec. 14.1's.
--
-- Concurrency: `for update of attempts skip locked`, plus the lease. Two
-- reapers running at once claim disjoint sets, and a row already claimed under
-- an unexpired lease is invisible to both.

create or replace function public.claim_stalled_account_deletions(
  p_limit integer,
  p_max_attempts integer,
  p_retry_interval interval,
  p_backoff_cap interval,
  p_lease interval
)
returns table (
  user_id uuid,
  claim_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  issued_token uuid;
  next_attempt integer;
  backoff interval;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Claim limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 50 then
    raise exception 'Attempt ceiling must be between 1 and 50' using errcode = '22023';
  end if;
  if p_retry_interval is null or p_retry_interval <= interval '0' then
    raise exception 'Retry interval is required and must be positive' using errcode = '22023';
  end if;
  if p_backoff_cap is null or p_backoff_cap < p_retry_interval then
    raise exception 'Backoff cap is required and cannot be shorter than the retry interval'
      using errcode = '22023';
  end if;
  if p_lease is null or p_lease <= interval '0' then
    raise exception 'Lease is required and must be positive' using errcode = '22023';
  end if;

  for candidate in
    select attempts.user_id as candidate_id, attempts.attempt_count as prior_attempts
    from public.account_deletion_attempts as attempts
    join public.account_lifecycle as lifecycle
      on lifecycle.user_id = attempts.user_id
    where lifecycle.status = 'deleting'
      and attempts.recovery_state <> 'stalled'
      and (attempts.claim_expires_at is null or attempts.claim_expires_at <= now())
      and coalesce(
            attempts.next_attempt_at,
            attempts.first_seen_at + p_retry_interval
          ) <= now()
    order by coalesce(attempts.next_attempt_at, attempts.first_seen_at + p_retry_interval)
    limit p_limit
    for update of attempts skip locked
  loop
    -- The ceiling, applied BEFORE the retry rather than after it. A row that
    -- has already spent its attempts becomes terminal and is not handed back:
    -- it stops being retried and starts being visible.
    if candidate.prior_attempts >= p_max_attempts then
      update public.account_deletion_attempts as attempts
      set recovery_state = 'stalled',
          last_stop_reason = 'attempt_ceiling_reached',
          claim_token = null,
          claim_expires_at = null,
          next_attempt_at = null,
          updated_at = now()
      where attempts.user_id = candidate.candidate_id;

      insert into public.audit_logs (
        user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
      ) values (
        candidate.candidate_id,
        'account_deletion_recovery_stalled',
        'account_lifecycle',
        candidate.candidate_id,
        'system',
        jsonb_build_object('recovery_state', 'retrying', 'attempt_count', candidate.prior_attempts),
        jsonb_build_object(
          'recovery_state', 'stalled',
          'attempt_count', candidate.prior_attempts,
          'last_stop_reason', 'attempt_ceiling_reached'
        ),
        'Deletion recovery reached its attempt ceiling and is now terminal'
      );

      continue;
    end if;

    next_attempt := candidate.prior_attempts + 1;

    -- Exponential, base 2, from the declared retry interval, capped. The
    -- exponent is itself bounded before the multiplication: `interval * 2^49`
    -- overflows, and an overflow raised BEFORE `least()` could apply the cap
    -- would turn the bound into the thing that breaks. Capping the exponent at
    -- 30 keeps the arithmetic finite for every ceiling this signature accepts,
    -- and the cap below still decides the result.
    backoff := least(
      p_retry_interval * (2 ^ least(next_attempt - 1, 30))::double precision,
      p_backoff_cap
    );

    issued_token := gen_random_uuid();

    update public.account_deletion_attempts as attempts
    set recovery_state = 'retrying',
        attempt_count = next_attempt,
        last_attempt_at = now(),
        next_attempt_at = now() + backoff,
        claim_token = issued_token,
        claim_expires_at = now() + p_lease,
        updated_at = now()
    where attempts.user_id = candidate.candidate_id;

    insert into public.audit_logs (
      user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
    ) values (
      candidate.candidate_id,
      'account_deletion_retry_claimed',
      'account_lifecycle',
      candidate.candidate_id,
      'system',
      jsonb_build_object('attempt_count', candidate.prior_attempts),
      jsonb_build_object(
        'attempt_count', next_attempt,
        'recovery_state', 'retrying',
        'backoff_seconds', extract(epoch from backoff)
      ),
      'Deletion recovery claimed a bounded retry of the account-deletion executor'
    );

    user_id := candidate.candidate_id;
    claim_token := issued_token;
    attempt_count := next_attempt;
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.claim_stalled_account_deletions(integer, integer, interval, interval, interval)
  from public, anon, authenticated;
grant execute on function public.claim_stalled_account_deletions(integer, integer, interval, interval, interval)
  to service_role;

comment on function public.claim_stalled_account_deletions(integer, integer, interval, interval, interval) is
  '2H-RECOVER-001/002/005. Claims up to p_limit accounts stuck in `deleting` whose backoff has elapsed, hands each a single-use lease token, and applies the bound: a row that has already spent p_max_attempts becomes terminally `stalled` instead of being retried. Every outcome writes an audit row. service_role-only. Deletes nothing and can delete nothing.';

-- ---------------------------------------------------------------------------
-- 4. The lease check the executor calls before it does anything
-- ---------------------------------------------------------------------------
--
-- 2H-RECOVER-003, structurally. The reaper's HTTP call carries a target account
-- id, which the user-facing entrypoint deliberately does not accept -- so the
-- id alone must not be sufficient. This is what makes it insufficient: the
-- caller must also present a token that only `claim_stalled_account_deletions`
-- issues, that expires, and that is only ever issued for an account already in
-- `deleting`. A caller holding the reap secret and an arbitrary account id gets
-- `false`, and the executor never runs.

-- It returns the ORIGINAL request time along with the verdict, and that is not
-- convenience. `account_deletion_log.requested_at` measures how long a deletion
-- took; a reaper-driven attempt that stamped its own retry time there would
-- report a two-day stall as a two-second one -- understating exactly the number
-- this slice exists because nobody was watching.

create or replace function public.confirm_account_deletion_claim(
  p_user_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_claim_token is null then
    return jsonb_build_object('confirmed', false);
  end if;

  select attempts.first_seen_at into requested
  from public.account_deletion_attempts as attempts
  join public.account_lifecycle as lifecycle
    on lifecycle.user_id = attempts.user_id
  where attempts.user_id = p_user_id
    and attempts.claim_token = p_claim_token
    and attempts.claim_expires_at > now()
    and attempts.recovery_state = 'retrying'
    and lifecycle.status = 'deleting';

  if not found then
    return jsonb_build_object('confirmed', false);
  end if;

  return jsonb_build_object('confirmed', true, 'requested_at', requested);
end;
$$;

revoke all on function public.confirm_account_deletion_claim(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_account_deletion_claim(uuid, uuid) to service_role;

comment on function public.confirm_account_deletion_claim(uuid, uuid) is
  '2H-RECOVER-003. Confirms only when the presented token is the live, unexpired lease this database issued for an account that is still `deleting`, and returns the original request time with it. The reap entrypoint calls it before invoking the executor, so the reaper holds no capability the executor does not: it cannot point the executor at an account the database did not hand it.';

-- ---------------------------------------------------------------------------
-- 5. Recording what the attempt did -- 2H-RECOVER-005
-- ---------------------------------------------------------------------------

create or replace function public.record_account_deletion_attempt(
  p_user_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_stop_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_attempts integer;
  prior_state text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_claim_token is null then
    raise exception 'Account and claim token are required' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('completed', 'stopped', 'failed') then
    raise exception 'Attempt outcome is outside the closed set' using errcode = '22023';
  end if;
  if (p_outcome = 'completed') <> (p_stop_reason is null) then
    raise exception 'A completed attempt carries no stop reason and a stopped one must'
      using errcode = '22023';
  end if;

  select attempts.attempt_count, attempts.recovery_state
  into prior_attempts, prior_state
  from public.account_deletion_attempts as attempts
  where attempts.user_id = p_user_id
    and attempts.claim_token = p_claim_token
  for update;

  -- A completed deletion took `auth.users` with it, and this row cascaded away
  -- with the account. That is the success case, not an error, and it is
  -- reported rather than raised so the executor's own result stands.
  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'attempt_row_absent');
  end if;

  update public.account_deletion_attempts as attempts
  set last_stop_reason = p_stop_reason,
      claim_token = null,
      claim_expires_at = null,
      updated_at = now()
  where attempts.user_id = p_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    p_user_id,
    'account_deletion_retry_result',
    'account_lifecycle',
    p_user_id,
    'system',
    jsonb_build_object('recovery_state', prior_state, 'attempt_count', prior_attempts),
    jsonb_build_object('outcome', p_outcome, 'stop_reason', p_stop_reason),
    'Deletion recovery attempt reported its outcome'
  );

  return jsonb_build_object('recorded', true, 'attempt_count', prior_attempts);
end;
$$;

revoke all on function public.record_account_deletion_attempt(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_account_deletion_attempt(uuid, uuid, text, text) to service_role;

comment on function public.record_account_deletion_attempt(uuid, uuid, text, text) is
  '2H-RECOVER-005. Records one recovery attempt''s outcome against its lease, releases the lease and writes the audit row. Requires the token, so only the caller the database handed the work can report on it. Accepts only the closed stop-reason vocabulary, so no provider message or user content can be stored.';

-- ---------------------------------------------------------------------------
-- 6. The operator projection -- 2H-RECOVER-004
-- ---------------------------------------------------------------------------
--
-- What an operator needed on 2026-08-04 and did not have: which accounts are
-- stuck, how many times each has been retried, why the last attempt stopped,
-- and when the next one is due. Everything it returns is state; nothing it
-- returns is content.
--
-- `account_deletion_log` is NOT read here. That table holds the requesting
-- session's hash, it is revoked from every role including `service_role`, and
-- `signup_hardening_account_deletion.sql` pins that. Widening it to answer
-- "why did this stop?" would have traded a privacy guarantee for an operability
-- one; the recovery table carries the reason instead, and carries only that.

create or replace function public.operator_stalled_deletions(p_limit integer)
returns table (
  user_id uuid,
  lifecycle_status text,
  recovery_state text,
  attempt_count integer,
  first_seen_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  last_stop_reason text,
  claim_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Limit must be between 1 and 500' using errcode = '22023';
  end if;

  return query
  select
    attempts.user_id,
    lifecycle.status,
    attempts.recovery_state,
    attempts.attempt_count,
    attempts.first_seen_at,
    attempts.last_attempt_at,
    attempts.next_attempt_at,
    attempts.last_stop_reason,
    (attempts.claim_token is not null and attempts.claim_expires_at > now())
  from public.account_deletion_attempts as attempts
  join public.account_lifecycle as lifecycle
    on lifecycle.user_id = attempts.user_id
  order by
    case attempts.recovery_state when 'stalled' then 0 else 1 end,
    attempts.attempt_count desc,
    attempts.first_seen_at
  limit p_limit;
end;
$$;

revoke all on function public.operator_stalled_deletions(integer)
  from public, anon, authenticated;
grant execute on function public.operator_stalled_deletions(integer) to service_role;

comment on function public.operator_stalled_deletions(integer) is
  '2H-RECOVER-004. The operator read for stuck deletions: lifecycle status, recovery classification, attempt count, timestamps and the closed stop reason, terminal rows first. Reads the recovery table and the lifecycle table only -- never account_deletion_log -- so the requesting session hash stays unreadable by every role, exactly as SH.2 left it.';

-- ---------------------------------------------------------------------------
-- 7. The reaper tick -- 2H-RECOVER-001, 2H-RECOVER-003
-- ---------------------------------------------------------------------------
--
-- It claims, and it posts. It does not delete, and it holds nothing that could:
-- the whole of its destructive reach is an HTTP request to the deployed
-- executor carrying a lease the database itself issued.
--
-- Inert until an operator populates two Vault secrets, exactly as the entry
-- dispatch tick in `202607170026` is. A database that has not been armed still
-- claims and still classifies -- so staleness still becomes visible -- and
-- invokes nothing. Failing closed here means failing *quiet*, not failing
-- *open*.
--
-- The Vault read and the pg_net call go through `execute` rather than static
-- SQL, and that is not obfuscation. `vault` and `net` are hosted-runtime
-- extensions; a database without them is a legitimate configuration (the CI
-- stack is one), and a static reference would make `plpgsql_check` -- which
-- `supabase db lint --fail-on error` gates on -- fail against a schema that is
-- merely unarmed. `to_regclass`/`to_regnamespace` decide at run time, so the
-- unarmed path is a measured no-op rather than an error.

create or replace function public.reap_stalled_account_deletions(
  p_limit integer,
  p_max_attempts integer,
  p_retry_interval interval,
  p_backoff_cap interval,
  p_lease interval
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed record;
  endpoint text;
  secret text;
  has_vault boolean := pg_catalog.to_regclass('vault.decrypted_secrets') is not null;
  has_net boolean := pg_catalog.to_regnamespace('net') is not null;
  claimed_count integer := 0;
  dispatched_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if has_vault then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
      into endpoint using 'deletion_reap_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
      into secret using 'deletion_reap_secret';
  end if;

  for claimed in
    select *
    from public.claim_stalled_account_deletions(
      p_limit, p_max_attempts, p_retry_interval, p_backoff_cap, p_lease
    )
  loop
    claimed_count := claimed_count + 1;

    if endpoint is null or secret is null or not has_net then
      continue;
    end if;

    execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
      using
        endpoint,
        jsonb_build_object(
          'Content-Type', 'application/json',
          'x-deletion-reap-secret', secret
        ),
        jsonb_build_object(
          'userId', claimed.user_id,
          'claimToken', claimed.claim_token
        );
    dispatched_count := dispatched_count + 1;
  end loop;

  return jsonb_build_object(
    'claimed', claimed_count,
    'dispatched', dispatched_count,
    'armed', endpoint is not null and secret is not null and has_net
  );
end;
$$;

revoke all on function public.reap_stalled_account_deletions(integer, integer, interval, interval, interval)
  from public, anon, authenticated;
grant execute on function public.reap_stalled_account_deletions(integer, integer, interval, interval, interval)
  to service_role;

comment on function public.reap_stalled_account_deletions(integer, integer, interval, interval, interval) is
  '2H-RECOVER-001/003. The scheduled tick: claims due stalled deletions and posts each to the deployed executor with its lease token. Performs no deletion itself and holds no capability the executor lacks. Inert -- claiming and classifying but invoking nothing -- until an operator populates the deletion_reap_url and deletion_reap_secret Vault entries. This migration does NOT schedule it (ADR-082); scripts/2h1-deletion-reaper-schedule.mjs --enable does, and that is the authorization.';

-- ---------------------------------------------------------------------------
-- 8. Postconditions -- asserted here, so a bad apply fails rather than lands
-- ---------------------------------------------------------------------------

do $$
declare
  offender text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'account_deletion_attempts'
      and class.relrowsecurity
      and class.relforcerowsecurity
  ) then
    raise exception 'account_deletion_attempts does not force row level security';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'account_deletion_attempts'
  ) then
    raise exception 'account_deletion_attempts must carry no policy: its DEFINER functions are its only access';
  end if;

  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where (namespace.nspname, proc.proname) in (
      ('private', 'track_account_deletion_recovery'),
      ('public', 'claim_stalled_account_deletions'),
      ('public', 'confirm_account_deletion_claim'),
      ('public', 'record_account_deletion_attempt'),
      ('public', 'operator_stalled_deletions'),
      ('public', 'reap_stalled_account_deletions')
    )
    and (
      not proc.prosecdef
      or proc.proconfig is null
      or not (proc.proconfig @> array['search_path=""'])
    )
  loop
    raise exception 'function % is not definer-with-empty-search-path', offender;
  end loop;

  -- No role reaches the table directly. service_role included: it holds
  -- EXECUTE on the narrow functions and nothing else.
  if pg_catalog.has_table_privilege('service_role', 'public.account_deletion_attempts', 'select')
    or pg_catalog.has_table_privilege('service_role', 'public.account_deletion_attempts', 'update')
    or pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_attempts', 'select')
    or pg_catalog.has_table_privilege('anon', 'public.account_deletion_attempts', 'select')
  then
    raise exception 'account_deletion_attempts is reachable outside its DEFINER functions';
  end if;

  -- SH.2's posture on the deletion log is untouched by this migration. Stated
  -- as an assertion rather than as a comment, because "we did not widen it" is
  -- the kind of claim that should fail if it stops being true.
  if pg_catalog.has_table_privilege('service_role', 'public.account_deletion_log', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_log', 'select')
  then
    raise exception 'account_deletion_log became readable while adding deletion recovery';
  end if;

  -- No client role reaches any recovery function.
  if pg_catalog.has_function_privilege('authenticated', 'public.claim_stalled_account_deletions(integer, integer, interval, interval, interval)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.operator_stalled_deletions(integer)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.operator_stalled_deletions(integer)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.confirm_account_deletion_claim(uuid, uuid)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.record_account_deletion_attempt(uuid, uuid, text, text)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.reap_stalled_account_deletions(integer, integer, interval, interval, interval)', 'execute')
  then
    raise exception 'a deletion-recovery function is reachable by a client role';
  end if;

  -- ADR-082, asserted by the migration about itself: nothing here scheduled a
  -- job. The reaper is armed by an operator script, and a future edit that adds
  -- a `cron.schedule` for it to this file fails its own apply.
  -- `cron.job` is referenced directly rather than behind a to_regclass guard:
  -- `202607170019` and `202607170026` already call `cron.schedule` at migration
  -- time, so a chain that reaches this file has pg_cron. A guard here would
  -- only be able to hide the check, never to save it.
  if exists (select 1 from cron.job where jobname = 'my-brain-deletion-reaper') then
    raise exception 'the deletion reaper was scheduled by a migration, which ADR-082 forbids';
  end if;
end;
$$;
