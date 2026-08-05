-- Signup Hardening SH.5 — the auth abuse ledger and its ceilings.
--
-- SH-THROTTLE-001/002/004/006/007. The one migration the plan §1 allocates to
-- SH.5; ADR-080 records the three decisions inside it that the plan leaves open.
--
-- WHAT THIS TABLE IS FOR, AND WHAT IT MUST NEVER BECOME
-- ---------------------------------------------------------------------------
-- It counts attempts so a ceiling can refuse the next one. That is the whole
-- purpose. It is emphatically **not** a record of who tried to sign up: it
-- holds no address, no IP, no user agent and no free text, and SH-THROTTLE-007
-- is the rule that keeps it that way -- the ledger must not become a directory
-- of addresses an attacker guessed at, which is exactly what a well-meaning
-- "store the email so we can investigate" column would turn it into.
--
-- Both hashes are HMAC-SHA256 under a pepper held in the application
-- environment and **never in this database** (BYOK-SCHEMA-010's contract, with
-- a domain tag -- ADR-080 Decision 3). A dump of this table cannot confirm a
-- guessed address, and cannot be joined to the BYOK ledger's ip_hash for the
-- same address either.
--
-- WHY anon CAN EXECUTE THE CLAIM
-- ---------------------------------------------------------------------------
-- Every event here happens BEFORE authentication -- signup, recovery, resend
-- and failed sign-in all arrive with no session -- so the BYOK pattern's
-- auth.uid() identity and its `authenticated` grant are both unavailable. The
-- application holds no service-role credential and ADR-080 declines to give it
-- one. The reasoning for why the anonymous path is bounded, and the residual it
-- leaves, are in ADR-080 rather than repeated here.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table public.auth_event_attempts (
  id uuid primary key default gen_random_uuid(),

  -- SH-THROTTLE-001's closed set. A CHECK rather than an enum: the vocabulary
  -- is small, and the repository's own precedent (jobs.status, the lifecycle
  -- reasons) is a CHECK whose text a parity test can read back.
  kind text not null
    check (kind in ('signup', 'signin_failure', 'recovery', 'resend')),

  -- The normalized identifier's hash. NEVER the address. 64 lowercase hex or
  -- nothing -- a value of any other shape did not come from this system's hash,
  -- and the CHECK is what stops a raw address being written by a future caller
  -- that skipped the helper.
  --
  -- Nullable for the same reason ip_hash is: an attempt that never reached a
  -- parseable identifier must still be counted, and forcing the application to
  -- invent a value would mint a bucket an attacker can aim for.
  identifier_hash text
    check (identifier_hash is null or identifier_hash ~ '^[0-9a-f]{64}$'),

  ip_hash text
    check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),

  attempted_at timestamptz not null default now(),

  -- `unknown` is the provisional outcome a claim reserves with. A reservation
  -- that is never finalized -- the process died mid-call -- stays `unknown` and
  -- still counts against the ceiling, which is the correct failure direction:
  -- a crash must not be a way to earn free attempts.
  outcome text not null default 'unknown'
    check (outcome in ('unknown', 'succeeded', 'refused', 'throttled', 'provider_error'))
);

comment on table public.auth_event_attempts is
  'SH-THROTTLE-001: the pre-authentication abuse ledger. Hashes only -- no address, no IP, no free text. Written solely by claim_auth_event_slot/finalize_auth_event_attempt.';
comment on column public.auth_event_attempts.identifier_hash is
  'HMAC-SHA256 of a normalized identifier under BYOK_RATE_LIMIT_PEPPER with the auth domain tag. Never the address itself.';
comment on column public.auth_event_attempts.ip_hash is
  'HMAC-SHA256 of a canonicalized client IP under BYOK_RATE_LIMIT_PEPPER with the auth domain tag. Never the raw address.';

-- SH-THROTTLE-006's lockout matrix depends on these two indexes existing in
-- exactly the shape the ceilings query, and on nothing more: an index is a
-- retention surface as much as a performance one.
--
-- Partial on `not null` because a null hash is never the subject of its
-- ceiling, so the index holds only rows a ceiling can actually match.
create index auth_event_attempts_identifier_idx
  on public.auth_event_attempts (kind, identifier_hash, attempted_at desc)
  where identifier_hash is not null;

create index auth_event_attempts_ip_idx
  on public.auth_event_attempts (kind, ip_hash, attempted_at desc)
  where ip_hash is not null;

-- The sweep scans by time alone.
create index auth_event_attempts_attempted_at_idx
  on public.auth_event_attempts (attempted_at);

-- Forced RLS, and the closed door is written down rather than left as an
-- absence.
--
-- No client role holds a table privilege, so a table with RLS on and no policy
-- would already deny everything. A policy that denies explicitly is better for
-- two reasons: a reader sees the intent instead of inferring it from a missing
-- statement, and "somebody added a grant later" fails against a rule rather
-- than against nothing.
--
-- The two SECURITY DEFINER functions below remain the only path to this table.
-- They reach it because their owner bypasses RLS, which is the same mechanism
-- claim_credential_validation_slot has relied on since 202608010067 -- forced
-- RLS applies to the table owner, so it is BYPASSRLS on the migration role, not
-- a policy, that lets the definer through in both files.
alter table public.auth_event_attempts enable row level security;
alter table public.auth_event_attempts force row level security;

create policy auth_event_attempts_no_client_access
  on public.auth_event_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on policy auth_event_attempts_no_client_access on public.auth_event_attempts is
  'SH-THROTTLE-007: no client role reads or writes this table directly, ever. The claim/finalize functions are the only path.';

revoke all on table public.auth_event_attempts from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The ceilings
-- ---------------------------------------------------------------------------
--
-- WHY THE CEILINGS ARE PARAMETERS AND NOT DEFAULTS (ADR-080 Decision 2)
--
-- SH-THROTTLE-002 requires ceilings changeable without migration, and the
-- binding provider ceiling for resend -- rate_limit_email_sent = 2/hour -- is a
-- **default-SMTP artefact** that changes the day custom SMTP lands. A default
-- in this signature would freeze a provider-dependent value into DDL. So every
-- number arrives from application code, and the only constant here is a safety
-- bound.
--
-- The argument list is fixed on the first attempt on purpose: Postgres cannot
-- extend a function's parameters via `create or replace` (ADR-057), so a
-- signature needing to widen later needs a migration this initiative has not
-- budgeted.
--
-- WHY ADVISORY LOCKS
--
-- "Count today's attempts, and if under the limit proceed" is wrong under any
-- concurrency: two callers both read ceiling-1 and both proceed. Inserting
-- first and counting after does not fix it -- under READ COMMITTED neither
-- transaction sees the other's uncommitted row. Serializing the read-and-write
-- for one bucket is what pg_advisory_xact_lock does, and it is the mechanism
-- run_all_heartbeats and claim_credential_validation_slot already use.
--
-- **Two locks, always in the same order** (identifier, then IP). Two locks
-- taken in different orders by different callers is a deadlock; the fixed order
-- is what makes that impossible.

-- The safety bound of ADR-080 Decision 2. Far above any real operating ceiling,
-- so it constrains a hostile direct caller and never the application.
create or replace function private.auth_event_ceiling_cap()
returns integer
language sql
immutable
set search_path = ''
as $$ select 100 $$;

comment on function private.auth_event_ceiling_cap() is
  'ADR-080: the maximum ceiling claim_auth_event_slot will honour. A safety bound against a hostile direct caller, not an operating ceiling.';

revoke all on function private.auth_event_ceiling_cap()
  from public, anon, authenticated, service_role;

create or replace function public.claim_auth_event_slot(
  p_kind text,
  p_identifier_hash text,
  p_ip_hash text,
  p_identifier_ceiling integer,
  p_ip_ceiling integer,
  p_window interval
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap integer := private.auth_event_ceiling_cap();
  window_start timestamptz;
  identifier_attempts integer;
  ip_attempts integer;
  attempt_id uuid;
begin
  if p_kind not in ('signup', 'signin_failure', 'recovery', 'resend') then
    raise exception 'Invalid auth event kind' using errcode = '22023';
  end if;

  -- Shape is validated here as well as by the CHECK, because a caller that
  -- passes a raw address must be refused BEFORE it is counted or stored, not
  -- after. SH-THROTTLE-007 is a property of the whole path, not of the column.
  if p_identifier_hash is not null and p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid identifier hash' using errcode = '22023';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid ip hash' using errcode = '22023';
  end if;

  if p_identifier_ceiling is null or p_ip_ceiling is null then
    raise exception 'Ceilings are required' using errcode = '22023';
  end if;
  if p_identifier_ceiling < 1 or p_ip_ceiling < 1
     or p_identifier_ceiling > cap or p_ip_ceiling > cap then
    raise exception 'Invalid ceiling' using errcode = '22023';
  end if;

  -- A window wide enough to be meaningless is the same bypass as a ceiling
  -- high enough to be meaningless, so it is bounded on both sides too.
  if p_window is null or p_window <= interval '0'
     or p_window > interval '30 days' then
    raise exception 'Invalid window' using errcode = '22023';
  end if;

  window_start := pg_catalog.now() - p_window;

  -- Fixed lock order: identifier, then address. `hashtextextended` gives a
  -- stable 64-bit key from a hex digest without a second lookup table. The kind
  -- is part of the lock key so a recovery ceiling and a signup ceiling for the
  -- same identifier do not serialize against each other.
  if p_identifier_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('auth:' || p_kind || ':id:' || p_identifier_hash, 0)
    );
  end if;
  if p_ip_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('auth:' || p_kind || ':ip:' || p_ip_hash, 0)
    );
  end if;

  if p_identifier_hash is not null then
    select pg_catalog.count(*)
    into identifier_attempts
    from public.auth_event_attempts as attempt
    where attempt.kind = p_kind
      and attempt.identifier_hash = p_identifier_hash
      and attempt.attempted_at >= window_start;

    if identifier_attempts >= p_identifier_ceiling then
      raise exception 'Auth event ceiling reached'
        using errcode = 'P0001', detail = 'AUTH_EVENT_THROTTLED';
    end if;
  end if;

  if p_ip_hash is not null then
    select pg_catalog.count(*)
    into ip_attempts
    from public.auth_event_attempts as attempt
    where attempt.kind = p_kind
      and attempt.ip_hash = p_ip_hash
      and attempt.attempted_at >= window_start;

    if ip_attempts >= p_ip_ceiling then
      raise exception 'Auth event ceiling reached'
        using errcode = 'P0001', detail = 'AUTH_EVENT_THROTTLED';
    end if;
  end if;

  -- The slot is reserved **by inserting**, inside the same locked transaction
  -- that counted. That is what makes the count meaningful: by the time the lock
  -- is released the row exists, so the next caller counts it.
  insert into public.auth_event_attempts (kind, identifier_hash, ip_hash)
  values (p_kind, p_identifier_hash, p_ip_hash)
  returning id into attempt_id;

  return attempt_id;
end;
$$;

comment on function public.claim_auth_event_slot(text, text, text, integer, integer, interval) is
  'SH-THROTTLE-002: reserves one auth attempt under per-identifier and per-IP ceilings, serialized by advisory locks. Ceilings and window are caller-supplied (ADR-080). Returns the attempt id to finalize.';

-- Finalizing is separate because the outcome is only known after the provider
-- has answered.
--
-- Unlike BYOK's finalize, this one cannot scope by owner -- there is no session.
-- The attempt id is therefore the capability: it is a v4 uuid returned only to
-- the caller that claimed it, the update moves a row only from the provisional
-- `unknown`, and it is silent on a miss. So the worst a guessed id achieves is
-- relabelling one anonymous counting row whose value to an attacker is nil --
-- it cannot delete the row, cannot lower a count, and cannot learn whether the
-- id existed, because a foreign id, a missing id and an already-finalized row
-- are one outcome to the caller.
create or replace function public.finalize_auth_event_attempt(
  p_attempt_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('succeeded', 'refused', 'throttled', 'provider_error') then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;

  update public.auth_event_attempts
  set outcome = p_outcome
  where id = p_attempt_id
    and outcome = 'unknown';
end;
$$;

comment on function public.finalize_auth_event_attempt(uuid, text) is
  'Records the outcome of a reserved auth attempt. One-way from the provisional value, silent on a miss. `unknown` is deliberately not settable here -- it is a starting state, not an outcome.';

-- The grants of ADR-080 Decision 1. `anon` because every event predates
-- authentication; `authenticated` because a signed-in session can still trip a
-- sign-in failure on a second account. `service_role` gets nothing -- it has no
-- reason to claim a slot, and a grant would be a way to bypass a ceiling.
revoke all on function public.claim_auth_event_slot(text, text, text, integer, integer, interval)
  from public, service_role;
grant execute on function public.claim_auth_event_slot(text, text, text, integer, integer, interval)
  to anon, authenticated;

revoke all on function public.finalize_auth_event_attempt(uuid, text)
  from public, service_role;
grant execute on function public.finalize_auth_event_attempt(uuid, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention (SH-THROTTLE-004)
-- ---------------------------------------------------------------------------
--
-- Thirty days, matching BYOK's sweep exactly -- same window, same scheduler-only
-- posture, same reasoning: the ceilings are daily, so a month leaves room to
-- investigate a pattern and no room to accumulate a history.
--
-- SECURITY DEFINER with an empty search_path, granted to nobody. pg_cron calls
-- it as the scheduler's own role. There is no product reason for a client to
-- trigger a retention sweep, and a grant would be a denial-of-service lever --
-- on this table especially, where deleting rows *resets ceilings*.
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
  where attempted_at < pg_catalog.now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.prune_auth_event_attempts() is
  'SH-THROTTLE-004: deletes auth attempts older than 30 days. Scheduler-only; granted to no client role, because deleting rows here resets ceilings.';

revoke all on function public.prune_auth_event_attempts()
  from public, anon, authenticated, service_role;

-- Guarded by an existence check so the chain applies to a database without the
-- extension: CI runs `db reset` from empty, and the retention *rule* is the
-- function, which is now present either way.
do $auth_retention_schedule$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'sh-prune-auth-event-attempts',
      '43 4 * * *',
      $cron$select public.prune_auth_event_attempts();$cron$
    );
  end if;
exception
  when others then
    raise notice 'auth attempt retention schedule not installed: %', sqlerrm;
end;
$auth_retention_schedule$;

-- ---------------------------------------------------------------------------
-- Post-deploy assertions, in the 202608010067 shape: the posture this file
-- claims is read back out of the catalog at apply time, so a deploy that did
-- not achieve it fails loudly instead of looking green.
-- ---------------------------------------------------------------------------

do $auth_throttle_postcondition$
begin
  if not (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.auth_event_attempts'::regclass
  ) then
    raise exception 'auth_event_attempts does not have forced RLS'
      using errcode = 'P0001', detail = 'SH_THROTTLE_RLS';
  end if;

  -- No client role holds ANY table privilege. This is the assertion that makes
  -- the two functions the only path, and it is checked for every privilege
  -- rather than the two that seem likely.
  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as privilege
    where pg_catalog.has_table_privilege(role_name::name, 'public.auth_event_attempts', privilege)
  ) then
    raise exception 'a client role holds a privilege on auth_event_attempts'
      using errcode = 'P0001', detail = 'SH_THROTTLE_GRANT';
  end if;

  -- The claim and finalize are reachable by exactly the two roles ADR-080 names.
  if not (
    pg_catalog.has_function_privilege(
      'anon',
      'public.claim_auth_event_slot(text, text, text, integer, integer, interval)',
      'execute'
    )
    and pg_catalog.has_function_privilege(
      'authenticated',
      'public.claim_auth_event_slot(text, text, text, integer, integer, interval)',
      'execute'
    )
  ) then
    raise exception 'the auth throttle claim is unreachable by anon or authenticated'
      using errcode = 'P0001', detail = 'SH_THROTTLE_MISSING_GRANT';
  end if;

  if pg_catalog.has_function_privilege(
       'service_role',
       'public.claim_auth_event_slot(text, text, text, integer, integer, interval)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.finalize_auth_event_attempt(uuid, text)', 'execute'
     )
  then
    raise exception 'service_role can claim or finalize an auth attempt'
      using errcode = 'P0001', detail = 'SH_THROTTLE_GRANT_WIDE';
  end if;

  -- The sweep, and the cap, are reachable by nobody.
  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'public.prune_auth_event_attempts()', 'execute'
    )
  ) then
    raise exception 'the auth retention sweep is executable by a client role'
      using errcode = 'P0001', detail = 'SH_RETENTION_GRANT';
  end if;

  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'private.auth_event_ceiling_cap()', 'execute'
    )
  ) then
    raise exception 'the ceiling cap is executable by a client role'
      using errcode = 'P0001', detail = 'SH_THROTTLE_CAP_GRANT';
  end if;
end;
$auth_throttle_postcondition$;
