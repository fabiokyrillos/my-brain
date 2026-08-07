-- Phase 2H Slice 2H.3 — the distributed rate limiter.
--
-- **The third of Phase 2H's five migrations** (plan §1: 2H.3 is allocated
-- exactly one, and allocations are not transferable). `AUTHORIZED_MIGRATION_HEAD`
-- in `src/lib/closeout/egc-invariants.test.ts` moves to `202608070081` in the
-- same commit, as every migration in this repository must.
--
-- It schedules nothing. ADR-082's rule is that scheduling is authorization, and
-- this file creates no `cron.job` row, no sweep and no destructive statement of
-- any kind.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS, AND WHAT IT MUST NEVER BECOME
-- ---------------------------------------------------------------------------
--
-- `2H-RATE` bounds **request rate**, per owner, across processes. It is not a
-- spend control and must never become one: BYOK made the user the payer, not
-- the owner (ADR-083 §5 withdrew the per-user USD ceiling), and SH.6 already
-- owns the infrastructure quotas. So there is no cost column, no price column
-- and no token column below, and `phase_2h_rate_limiting.sql`'s pgTAP asserts
-- their absence rather than trusting this comment (`2H-RATE-006`).
--
-- The three ceilings are the owner's signed §14.2 values, and they arrive as
-- **runtime parameters** rather than as literals inside a function body
-- (`2H-RATE-002`, ADR-080's discipline). Two consumers read them by two
-- different routes, deliberately:
--
--   * The application passes them as **required arguments** on every call, from
--     `src/lib/rate-limits.ts`. No argument has a default, so a caller that
--     forgets one fails to compile and to execute rather than silently
--     inheriting a number nobody agreed to.
--   * The drain claim path cannot: `claim_entry_interpretation_job`'s argument
--     list is fixed and Postgres cannot extend it via `create or replace`
--     (ADR-057, the defect 2E-COMMAND-012 recorded). It therefore loads the
--     same values from `private.rate_limit_parameters`, which is the "signed
--     runtime parameters" half of the authorization.
--
-- `rate-limits-parity.test.ts` pins the constants file to this seed and to PRD
-- §14.2 in **both** directions, so the two routes cannot disagree and neither
-- can drift from the signature.
--
-- ---------------------------------------------------------------------------
-- WHY THE WINDOW IS ROLLING AND THE COUNT HAPPENS UNDER A LOCK
-- ---------------------------------------------------------------------------
--
-- PRD §14.2 V-3 forbids the cheap implementation. A fixed clock-hour counter
-- admits 2x the ceiling across a boundary — 120 AI operations in two minutes,
-- at 59 and 01 past. So the predicate is `consumed_at > now() - window`, which
-- makes every row expire exactly one window after it was written, and the
-- pgTAP suite contains a control that a fixed-window implementation fails.
--
-- Under concurrency, a `count` that is not serialized against the `insert` that
-- follows it lets two racers both read `ceiling - 1` and both be admitted. This
-- file reuses SH.5's proven arrangement verbatim rather than inventing a second
-- one (`2H-RATE-001`): a transaction-scoped advisory lock keyed on the bucket
-- and the owner, the count inside it, and the slot **reserved by inserting**
-- inside the same locked transaction — so by the time the lock is released the
-- row exists and the next caller counts it. The key includes the bucket, so an
-- upload never serializes against an AI operation.
--
-- ---------------------------------------------------------------------------
-- WHY A REFUSAL IS RETURNED AND NOT RAISED
-- ---------------------------------------------------------------------------
--
-- `2H-RATE-003` requires a refusal to be a **recorded** outcome. A refusal that
-- raises rolls its own record back: PostgREST runs one RPC in one transaction,
-- so the `refused` row the function had just written would vanish with the
-- exception that reported it. The verdict therefore travels as data —
-- `(admitted, slot_id, refusal)` — and only genuine programming faults (an
-- unknown bucket, a missing ceiling, no session) raise.
--
-- Refused rows do **not** count toward the ceiling. Counting them would mean a
-- refusal storm locks an owner out for a whole window past the point their real
-- usage expired, which is a limiter that punishes the client for having been
-- refused.

-- ---------------------------------------------------------------------------
-- 1. The signed parameters (2H-RATE-002)
-- ---------------------------------------------------------------------------

create table private.rate_limit_parameters (
  key text primary key,

  -- Bounded on both sides, for `quota_ceilings`' reason: zero would refuse
  -- everything (a denial of service delivered by UPDATE), and a value large
  -- enough to be meaningless is indistinguishable from no ceiling at all.
  value bigint not null check (value between 1 and 1000000),

  -- Prose, so `select * from private.rate_limit_parameters` explains itself to
  -- an operator who is about to change a number.
  note text not null,

  updated_at timestamptz not null default now()
);

comment on table private.rate_limit_parameters is
  '2H-RATE-002: the owner-signed PRD sec. 14.2 rate values as runtime parameters. Changing one is an UPDATE, never a migration. Mirrored by src/lib/rate-limits.ts, which rate-limits-parity.test.ts compares against both this seed and the PRD.';

-- The seed IS PRD §14.2, signed 2026-08-06, unchanged.
insert into private.rate_limit_parameters (key, value, note) values
  ('ai_operations_per_hour', 60,
   '2H-RATE V-1: provider-reaching operations one owner may start per rolling hour.'),
  ('uploads_per_hour', 20,
   '2H-RATE V-2: accepted upload requests one owner may make per rolling hour.'),
  ('rolling_window_seconds', 3600,
   '2H-RATE V-3: the window is rolling. Never a fixed clock hour -- a clock-hour counter admits twice the ceiling across its boundary.');

-- Forced RLS on a table no role can reach, the posture 202608040075 and
-- 202608050076 both established: the closed door is written down rather than
-- inferred from a missing grant, so a later `grant select` fails against a rule
-- instead of against nothing. The DEFINER functions below reach it because
-- their owner is BYPASSRLS.
alter table private.rate_limit_parameters enable row level security;
alter table private.rate_limit_parameters force row level security;

create policy rate_limit_parameters_no_client_access
  on private.rate_limit_parameters
  for all
  to anon, authenticated, service_role
  using (false)
  with check (false);

revoke all on table private.rate_limit_parameters from public, anon, authenticated, service_role;

-- STABLE rather than IMMUTABLE, for `quota_ceiling`'s reason: it reads a table,
-- and a planner that cached the value across an operator's UPDATE would defeat
-- the point of putting it in a row.
create or replace function private.rate_limit_parameter(p_key text)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  parameter bigint;
begin
  select parameters.value into parameter
  from private.rate_limit_parameters as parameters
  where parameters.key = p_key;

  -- No default, and no fallback. A limiter that admits when its ceiling is
  -- missing is a limiter nobody agreed to, which is the exact shape
  -- `QUOTA_CEILING_MISSING` exists to refuse.
  if parameter is null then
    raise exception 'Rate limit parameter is missing'
      using errcode = 'P0001', detail = 'RATE_LIMIT_PARAMETER_MISSING';
  end if;

  return parameter;
end;
$$;

comment on function private.rate_limit_parameter(text) is
  '2H-RATE-002: reads one signed PRD sec. 14.2 value. Raises RATE_LIMIT_PARAMETER_MISSING on an absent key -- a rate limiter that fails open is not one.';

revoke all on function private.rate_limit_parameter(text)
  from public, anon, authenticated, service_role;

-- The safety bound on a ceiling a caller passes. Not an operating ceiling: it
-- exists so a hostile or fat-fingered direct caller cannot pass 10^9 and turn
-- the limiter off by argument (ADR-080's `auth_event_ceiling_cap` reasoning).
create or replace function private.rate_limit_ceiling_cap()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10000 $$;

comment on function private.rate_limit_ceiling_cap() is
  '2H-RATE-002: the maximum ceiling consume_rate_limit_slot will honour. A safety bound against a hostile direct caller, not an operating ceiling.';

revoke all on function private.rate_limit_ceiling_cap()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The limiter state (2H-RATE-001)
-- ---------------------------------------------------------------------------
--
-- One row per admission decision. It holds an owner, a bucket, an outcome and a
-- time, and nothing else -- no operation name, no file name, no prompt, no
-- model, no cost. There is nothing here for a leak to be about.
--
-- `on delete cascade` and no refusal trigger, deliberately. 2H.2's cascade
-- defect was an append-only trigger on a table whose rows cascade: the cascade
-- **is** a delete, so the trigger refused it and no account could be deleted at
-- all. This table is not append-only in that sense -- it is expiring state, not
-- evidence -- so the cascade is the whole cleanup story, and
-- `account_owned_row_counts` picks the table up from the catalog unasked.

create table public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  -- The closed set, as a CHECK whose text a parity test can read back -- the
  -- repository's precedent for a small vocabulary (jobs.status, the lifecycle
  -- reasons, auth_event_attempts.kind).
  bucket text not null check (bucket in ('ai', 'upload')),

  -- Every decision is recorded, not only the admitted ones (2H-RATE-003). Only
  -- `admitted` rows count toward a ceiling; see the header.
  outcome text not null check (outcome in ('admitted', 'refused')),

  consumed_at timestamptz not null default now()
);

comment on table public.rate_limit_events is
  '2H-RATE-001: the per-owner rolling-window rate limiter state. Owner, bucket, outcome and time -- no operation, no content, and deliberately no cost or token column (2H-RATE-006). Written solely by private.consume_rate_limit_slot.';
comment on column public.rate_limit_events.outcome is
  '2H-RATE-003: every admission decision is recorded. Only admitted rows are counted against a ceiling -- counting refusals would extend a lockout past the point the real usage expired.';

-- The ceiling query, in exactly the shape the count uses. Partial on `admitted`
-- because a refused row is never the subject of a ceiling, so the index holds
-- only rows a ceiling can match -- SH.5's partial-index reasoning, and an index
-- is a retention surface as much as a performance one.
create index rate_limit_events_admitted_idx
  on public.rate_limit_events (user_id, bucket, consumed_at desc)
  where outcome = 'admitted';

-- The operator read (2H.4) and any future bounded sweep scan by time alone.
create index rate_limit_events_consumed_at_idx
  on public.rate_limit_events (consumed_at);

alter table public.rate_limit_events enable row level security;
alter table public.rate_limit_events force row level security;

create policy rate_limit_events_no_client_access
  on public.rate_limit_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on policy rate_limit_events_no_client_access on public.rate_limit_events is
  '2H-RATE-001: no client role reads or writes this table directly, ever. A client that could delete a row could mint itself slots.';

revoke all on table public.rate_limit_events from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The admission decision (2H-RATE-001, 2H-RATE-005)
-- ---------------------------------------------------------------------------
--
-- One implementation, three callers. There is **no exemption branch** here and
-- no owner identifier appears anywhere in this body (PRD §14.2 V-6): the
-- account that signed the ceilings is subject to them, and a control nobody is
-- exempt from is the only control anybody has exercised.

create or replace function private.consume_rate_limit_slot(
  p_user_id uuid,
  p_bucket text,
  p_ceiling integer,
  p_window interval
)
returns table (admitted boolean, slot_id uuid, refusal text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap integer := private.rate_limit_ceiling_cap();
  window_start timestamptz;
  used bigint;
  recorded uuid;
begin
  if p_user_id is null then
    raise exception 'Owner is required' using errcode = '22023';
  end if;
  if p_bucket is null or p_bucket not in ('ai', 'upload') then
    raise exception 'Invalid rate limit bucket' using errcode = '22023';
  end if;

  -- ADR-080 Decision 2, restated: the ceiling is required. A null here is a
  -- caller that did not decide, and defaulting on its behalf would put a number
  -- into production that no signature covers.
  if p_ceiling is null then
    raise exception 'Rate limit ceiling is required' using errcode = '22023';
  end if;
  if p_ceiling < 1 or p_ceiling > cap then
    raise exception 'Invalid rate limit ceiling' using errcode = '22023';
  end if;

  -- A window wide enough to be meaningless turns the limiter off just as
  -- surely as a ceiling high enough to be, so it is bounded on both sides too.
  if p_window is null or p_window <= interval '0' or p_window > interval '30 days' then
    raise exception 'Invalid rate limit window' using errcode = '22023';
  end if;

  -- `now()` is transaction time, so the count and the insert that follows share
  -- one boundary rather than racing the clock between two statements.
  window_start := pg_catalog.now() - p_window;

  begin
    -- SH.5's arrangement. The key is (bucket, owner), so one owner's uploads
    -- never serialize against their AI calls, and two owners never contend.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('rate:' || p_bucket || ':' || p_user_id::text, 0)
    );

    -- Strictly greater than: a slot consumed exactly one window ago has
    -- expired. This is the rolling window; a `date_trunc('hour', ...)`
    -- predicate here would admit twice the ceiling across a clock boundary.
    select pg_catalog.count(*)
    into used
    from public.rate_limit_events as consumed
    where consumed.user_id = p_user_id
      and consumed.bucket = p_bucket
      and consumed.outcome = 'admitted'
      and consumed.consumed_at > window_start;
  exception when others then
    -- 2H-RATE-005. State that cannot be read is a refusal, never an admission.
    -- Nothing is recorded here on purpose: the record lives in the same table
    -- that just proved unreadable, so an attempt to write it would fail too and
    -- the honest outcome is the refusal itself.
    admitted := false;
    slot_id := null;
    refusal := 'RATE_LIMIT_STATE_UNAVAILABLE';
    return next;
    return;
  end;

  -- Defence in depth against a count that came back absent rather than zero.
  if used is null then
    admitted := false;
    slot_id := null;
    refusal := 'RATE_LIMIT_STATE_UNAVAILABLE';
    return next;
    return;
  end if;

  if used >= p_ceiling then
    begin
      insert into public.rate_limit_events (user_id, bucket, outcome)
      values (p_user_id, p_bucket, 'refused')
      returning id into recorded;
    exception when others then
      -- A refusal that could not be recorded is still a refusal. Losing the
      -- telemetry must never turn into admitting the request.
      recorded := null;
    end;

    admitted := false;
    slot_id := recorded;
    refusal := case p_bucket when 'ai' then 'RATE_LIMIT_AI' else 'RATE_LIMIT_UPLOAD' end;
    return next;
    return;
  end if;

  begin
    -- The slot is reserved **by inserting**, inside the same locked transaction
    -- that counted. That is what makes the count meaningful.
    insert into public.rate_limit_events (user_id, bucket, outcome)
    values (p_user_id, p_bucket, 'admitted')
    returning id into recorded;
  exception when others then
    admitted := false;
    slot_id := null;
    refusal := 'RATE_LIMIT_STATE_UNAVAILABLE';
    return next;
    return;
  end;

  admitted := true;
  slot_id := recorded;
  refusal := null;
  return next;
end;
$$;

comment on function private.consume_rate_limit_slot(uuid, text, integer, interval) is
  '2H-RATE-001/002/005: the one admission decision. Counts admitted slots in a rolling window under an advisory lock keyed on (bucket, owner), reserves by inserting, and returns the verdict as data so a refusal survives as a recorded row. Unreadable state refuses. No exemption path exists.';

revoke all on function private.consume_rate_limit_slot(uuid, text, integer, interval)
  from public, anon, authenticated, service_role;

-- The session's own claim. Identity comes from `auth.uid()` and never from an
-- argument, so no caller can spend another owner's window.
create or replace function public.claim_rate_limit_slot(
  p_bucket text,
  p_ceiling integer,
  p_window interval
)
returns table (admitted boolean, slot_id uuid, refusal text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- `select *` rather than named columns: this function's OUT parameters are
  -- also called `admitted`, `slot_id` and `refusal`, and plpgsql resolves an
  -- unqualified column reference against its variables first. Selecting the
  -- whole row removes the question rather than answering it correctly by
  -- accident.
  return query
  select *
  from private.consume_rate_limit_slot(caller, p_bucket, p_ceiling, p_window) as verdict;
end;
$$;

comment on function public.claim_rate_limit_slot(text, integer, interval) is
  '2H-RATE-001: the session claims one slot in its own window. The owner is auth.uid(), never an argument.';

revoke all on function public.claim_rate_limit_slot(text, integer, interval)
  from public, anon, service_role;
grant execute on function public.claim_rate_limit_slot(text, integer, interval) to authenticated;

-- The worker's claim, for provider-reaching background work (PRD §14.2 V-5).
create or replace function public.claim_rate_limit_slot_for_user(
  p_user_id uuid,
  p_bucket text,
  p_ceiling integer,
  p_window interval
)
returns table (admitted boolean, slot_id uuid, refusal text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  -- `select *` rather than named columns: this function's OUT parameters are
  -- also called `admitted`, `slot_id` and `refusal`, and plpgsql resolves an
  -- unqualified column reference against its variables first. Selecting the
  -- whole row removes the question rather than answering it correctly by
  -- accident.
  return query
  select *
  from private.consume_rate_limit_slot(p_user_id, p_bucket, p_ceiling, p_window) as verdict;
end;
$$;

comment on function public.claim_rate_limit_slot_for_user(uuid, text, integer, interval) is
  '2H-RATE-001: background provider work claims a slot in the OWNING user''s window (PRD sec. 14.2 V-5). service_role only.';

revoke all on function public.claim_rate_limit_slot_for_user(uuid, text, integer, interval)
  from public, anon, authenticated;
grant execute on function public.claim_rate_limit_slot_for_user(uuid, text, integer, interval) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Admission at the drain boundary, once (PRD §14.2 V-5)
-- ---------------------------------------------------------------------------
--
-- V-5 is two rules and the second is the hard one. Background provider work
-- consumes its owner's AI slot, **and** work the drain has already admitted
-- must not be refused a second time at the provider boundary -- otherwise a
-- claimed job dies mid-flight and burns a retry it did not earn. So admission
-- happens exactly here, at the claim, and the worker performs no second check.
--
-- V-4 is why the test is `attempts = 0`. A first claim is a new operation and
-- consumes a slot; an automatic retry of work already admitted does not. A
-- user-initiated reprocess enqueues a **new** job, whose first claim has
-- `attempts = 0`, so it consumes -- which is exactly what V-4 asks for, without
-- a "was this a human" flag the queue does not carry.
--
-- A refusal returns null rather than raising: null is what this function
-- already returns for "nothing claimable", the deployed worker already handles
-- it as an empty drain, and raising would roll back the `refused` row that is
-- the whole record of the decision. **No attempt is burned by a refusal**, so
-- an owner at their ceiling loses no retries to it.
--
-- Everything else below is a verbatim re-declaration of `202608050076`'s body.

create or replace function public.claim_entry_interpretation_job(
  p_job_id uuid,
  p_user_id uuid,
  p_worker_id text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.jobs%rowtype;
  rate_admitted boolean;
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

  -- SH-QUOTA-003. Serializing one owner's claims is what makes the count below
  -- meaningful: without it two workers both read ceiling-1 and both claim. The
  -- key is the owner alone, so claims for different owners never contend --
  -- which is the whole point of a fairness ceiling.
  if p_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('quota:drain:' || p_user_id::text, 0)
    );
  end if;

  select * into claimed
  from public.jobs job
  where job.id = p_job_id
    and job.user_id = p_user_id
    and job.type = 'interpret_entry'
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
    -- SH-LIFECYCLE-006 / SH-WORKER-003: the same lifecycle predicate on every
    -- claim path, so the direct path and the scheduled drain cannot disagree
    -- (the asymmetry 202608010069 documents for credentials, not repeated as
    -- a hole).
    and exists (
      select 1
      from public.account_lifecycle lifecycle
      where lifecycle.user_id = job.user_id
        and lifecycle.status = 'active'
    )
    -- SH-QUOTA-003 / SH-WORKER-003: the same fairness predicate on every claim
    -- path. An expired lease is not in flight, so a dead worker never locks its
    -- owner out.
    and (
      select pg_catalog.count(*)
      from public.jobs inflight
      where inflight.user_id = job.user_id
        and inflight.status = 'running'
        and inflight.lease_expires_at > pg_catalog.now()
    ) < private.quota_ceiling('drain_claims_per_owner_per_tick')
  for update skip locked;

  if claimed.id is null then
    return null;
  end if;

  -- 2H-RATE-001, PRD §14.2 V-4 and V-5. The ceilings come from the signed
  -- runtime parameters because this signature cannot be extended (ADR-057).
  if claimed.attempts = 0 then
    select verdict.admitted into rate_admitted
    from private.consume_rate_limit_slot(
      claimed.user_id,
      'ai',
      private.rate_limit_parameter('ai_operations_per_hour')::integer,
      pg_catalog.make_interval(secs => private.rate_limit_parameter('rolling_window_seconds')::integer)
    ) as verdict;

    if not coalesce(rate_admitted, false) then
      return null;
    end if;
  end if;

  update public.jobs
  set status = 'running',
      attempts = attempts + 1,
      started_at = now(),
      locked_at = now(),
      locked_by = btrim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      failed_at = null
  where id = claimed.id
  returning * into claimed;

  return to_jsonb(claimed);
end;
$$;

comment on function public.claim_entry_interpretation_job(uuid, uuid, text, integer) is
  '2H-RATE-001: the single AI admission point for background work. A first claim (attempts = 0) consumes the owner''s AI slot; an automatic retry does not (PRD sec. 14.2 V-4), and the worker performs no second check (V-5). A rate refusal returns null, burns no attempt, and leaves a recorded refused row.';

-- ---------------------------------------------------------------------------
-- WHY THE OTHER TWO CLAIM PATHS ARE RE-DECLARED VERBATIM HERE
-- ---------------------------------------------------------------------------
--
-- SH-WORKER-003 is the rule that the lifecycle and fairness predicates are
-- **identical on every claim path**, and the mechanism that makes it checkable
-- is that all three live in one file:
-- `signup-hardening-invariants.test.ts` resolves the three names and fails if
-- they land in different migrations, or if either predicate appears other than
-- three times in the one that is live.
--
-- Replacing only `claim_entry_interpretation_job` would leave that invariant
-- true today and unenforceable tomorrow -- the next slice could change one
-- predicate in one file and the guard would have nothing to compare. So the
-- other two are re-declared **byte-identical** to `202608050076`'s bodies. The
-- only difference anywhere in this section is the rate admission above, which
-- `claim_next_entry_interpretation_job` inherits by delegation and
-- `claim_attachment_job` deliberately does not take: an attachment claim is
-- worker retry territory, and the upload it came from was already admitted at
-- the request boundary, before the bytes moved.

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
    -- SH-LIFECYCLE-006 / SH-WORKER-003: the same lifecycle predicate on every
    -- claim path, so the direct path and the scheduled drain cannot disagree
    -- (the asymmetry 202608010069 documents for credentials, not repeated as
    -- a hole).
    and exists (
      select 1
      from public.account_lifecycle lifecycle
      where lifecycle.user_id = job.user_id
        and lifecycle.status = 'active'
    )
    -- SH-QUOTA-003 / SH-WORKER-003: the same fairness predicate on every claim
    -- path. An expired lease is not in flight, so a dead worker never locks its
    -- owner out.
    and (
      select pg_catalog.count(*)
      from public.jobs inflight
      where inflight.user_id = job.user_id
        and inflight.status = 'running'
        and inflight.lease_expires_at > pg_catalog.now()
    ) < private.quota_ceiling('drain_claims_per_owner_per_tick')
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

create or replace function public.claim_attachment_job(
  p_job_id uuid,
  p_user_id uuid,
  p_worker_id text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.jobs%rowtype;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' or length(p_worker_id) > 128 then
    raise exception 'Invalid worker identity' using errcode = '22023';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Lease duration must be between 30 and 900 seconds' using errcode = '22023';
  end if;

  -- SH-QUOTA-003. Same lock, same key: attachment work and interpretation work
  -- share one `jobs` table and therefore one owner's share of it.
  if p_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('quota:drain:' || p_user_id::text, 0)
    );
  end if;

  select * into claimed
  from public.jobs job
  where id = p_job_id
    and user_id = p_user_id
    and type = 'process_attachment'
    and status in ('pending', 'failed')
    and attempts < max_attempts
    and next_attempt_at <= now()
    -- SH-LIFECYCLE-006 / SH-WORKER-003: the same lifecycle predicate on every
    -- claim path, so the direct path and the scheduled drain cannot disagree
    -- (the asymmetry 202608010069 documents for credentials, not repeated as
    -- a hole).
    and exists (
      select 1
      from public.account_lifecycle lifecycle
      where lifecycle.user_id = job.user_id
        and lifecycle.status = 'active'
    )
    -- SH-QUOTA-003 / SH-WORKER-003: the same fairness predicate on every claim
    -- path. An expired lease is not in flight, so a dead worker never locks its
    -- owner out.
    and (
      select pg_catalog.count(*)
      from public.jobs inflight
      where inflight.user_id = job.user_id
        and inflight.status = 'running'
        and inflight.lease_expires_at > pg_catalog.now()
    ) < private.quota_ceiling('drain_claims_per_owner_per_tick')
  for update skip locked;

  if claimed.id is null then
    return null;
  end if;

  update public.jobs
  set status = 'running',
      attempts = attempts + 1,
      started_at = now(),
      locked_at = now(),
      locked_by = btrim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      failed_at = null
  where id = claimed.id
  returning * into claimed;

  return to_jsonb(claimed);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The refusal's telemetry (2H-RATE-003)
-- ---------------------------------------------------------------------------
--
-- `rate_limit_refused` is a new event rather than a `failureKind` folded onto
-- an existing one, because no existing event covers "an operation was refused
-- before it started". Its vocabulary is deliberately distinct from every
-- neighbouring refusal: SH.5's auth throttle is pre-authentication and records
-- to `auth_event_attempts`; SH.6's `quota` failureKind is a storage/usage
-- ceiling; lifecycle, CAPTCHA, storage and provider failures each already have
-- their own names. A reader must be able to tell which control refused.
--
-- The literal `rate_limited` exists here and in
-- `src/features/product-analytics/contracts.ts`, and
-- `rate-limit-telemetry-parity.test.ts` proves the two agree **in both
-- directions** -- ADR-084 exists because a one-directional check let SH.6 ship
-- a producer whose event every validator rejected, silently, for weeks.

alter table public.product_events
  drop constraint product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    'capture_started',
    'capture_save_succeeded',
    'capture_save_failed',
    'capture_processing_enqueued',
    'capture_processing_completed',
    'capture_processing_failed',
    'needs_attention_viewed',
    'needs_attention_item_opened',
    'interpretation_review_viewed',
    'interpretation_corrected',
    'technical_details_opened',
    'task_candidates_presented',
    'task_candidates_confirmed',
    'question_answered_basic',
    'question_resolved',
    'question_effect_previewed',
    'question_reinterpret_applied',
    'processing_retry_requested',
    'work_view_viewed',
    'task_status_changed',
    'candidate_edit_started',
    'candidate_edit_reset',
    'task_command_previewed',
    'task_command_disambiguated',
    'task_command_applied',
    'task_command_undone',
    -- Slice 2H.3.
    'rate_limit_refused'
  ));

-- The property validator. A verbatim re-declaration of `202608060078`'s body
-- plus one `when` arm in each `case` -- Postgres has no way to extend a `case`
-- arm in place, so a full re-declaration is this repository's convention and
-- the diff against that migration is exactly the lines the new event adds.

create or replace function private.validate_product_event_properties(
  p_event_name text,
  p_properties jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed_keys text[];
  unknown_key text;
begin
  if p_properties is null or jsonb_typeof(p_properties) <> 'object' then
    raise exception 'Product event properties must be an object' using errcode = '22023';
  end if;

  case p_event_name
    when 'capture_started' then
      allowed_keys := array['captureSource'];
    when 'capture_save_succeeded' then
      allowed_keys := array['captureSource', 'durationMs'];
    when 'capture_save_failed' then
      allowed_keys := array['captureSource', 'durationMs', 'failureKind'];
    when 'capture_processing_enqueued' then
      allowed_keys := array['processingMode'];
    when 'capture_processing_completed' then
      allowed_keys := array['processingMode', 'durationMs', 'outcome'];
    when 'capture_processing_failed' then
      allowed_keys := array['processingMode', 'durationMs', 'failureKind'];
    when 'rate_limit_refused' then
      allowed_keys := array['operation', 'failureKind'];
    when 'needs_attention_viewed' then
      allowed_keys := array['itemCount'];
    when 'needs_attention_item_opened' then
      allowed_keys := array['attentionReason'];
    when 'interpretation_review_viewed', 'technical_details_opened',
      'question_effect_previewed', 'question_reinterpret_applied' then
      allowed_keys := array[]::text[];
    when 'question_answered_basic' then
      allowed_keys := array['origin'];
    when 'question_resolved' then
      allowed_keys := array['kind'];
    when 'interpretation_corrected' then
      allowed_keys := array['fieldCount'];
    when 'task_candidates_presented' then
      allowed_keys := array['candidateCount'];
    when 'candidate_edit_started' then
      allowed_keys := array['candidateCount'];
    when 'candidate_edit_reset' then
      allowed_keys := array['editedFieldCount'];
    when 'task_candidates_confirmed' then
      allowed_keys := array['candidateCount', 'editedCandidateCount', 'editedFieldCount'];
    when 'processing_retry_requested' then
      allowed_keys := array['retrySource'];
    when 'work_view_viewed' then
      allowed_keys := array['workView'];
    when 'task_status_changed' then
      allowed_keys := array['fromStatus', 'toStatus'];
    when 'task_command_previewed' then
      allowed_keys := array[
        'commandOrigin', 'outcomeCategory', 'candidateCount', 'scoreBand',
        'marginBand', 'signalCategories', 'oneStep', 'requiresConfirmation',
        'policyVersion'
      ];
    when 'task_command_disambiguated' then
      allowed_keys := array['commandOrigin', 'candidateCount', 'selectedRank', 'policyVersion'];
    when 'task_command_applied' then
      allowed_keys := array[
        'commandOrigin', 'outcomeCategory', 'applyRoute', 'replayed', 'policyVersion'
      ];
    when 'task_command_undone' then
      allowed_keys := array['commandOrigin', 'undoResult', 'policyVersion'];
    else
      raise exception 'Unsupported product event' using errcode = '22023';
  end case;

  select key into unknown_key
  from jsonb_object_keys(p_properties) as key
  where not (key = any(allowed_keys))
  limit 1;

  if unknown_key is not null then
    raise exception 'Unsupported product event property' using errcode = '22023';
  end if;

  case p_event_name
    when 'capture_started' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global', 'composer']);
    when 'capture_save_succeeded' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global', 'composer']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
    when 'capture_save_failed' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global', 'composer']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      -- `'quota'` joins the four SH.6 shipped a producer for and no consumer of
      -- (ADR-084). The other four are unchanged, so no recorded event is
      -- invalidated by this line.
      perform private.require_product_event_enum(p_properties, 'failureKind', array['validation', 'session', 'storage', 'unknown', 'quota']);
    when 'capture_processing_enqueued' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
    when 'capture_processing_completed' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'outcome', array['ready', 'needs_attention']);
    when 'capture_processing_failed' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'failureKind', array['retryable', 'terminal']);
    when 'rate_limit_refused' then
      -- The two buckets PRD §14.2 signs a ceiling for, named exactly as
      -- `rate_limit_events.bucket` names them, so an operator reading the ledger
      -- and an analyst reading the funnel are talking about the same thing.
      perform private.require_product_event_enum(p_properties, 'operation', array['ai', 'upload']);
      -- 2H-RATE-003's literal. Distinct from SH.5's throttle, SH.6's `quota`,
      -- the lifecycle refusals, CAPTCHA and storage -- a reader must be able to
      -- tell which control refused.
      perform private.require_product_event_enum(p_properties, 'failureKind', array['rate_limited']);
    when 'needs_attention_viewed' then
      perform private.require_product_event_integer(p_properties, 'itemCount', 0, 1000);
    when 'needs_attention_item_opened' then
      perform private.require_product_event_enum(p_properties, 'attentionReason', array[
        'review_interpretation',
        'confirm_existing_candidates',
        'answer_existing_question',
        'retry_processing',
        'resolve_consistency'
      ]);
    when 'interpretation_review_viewed', 'technical_details_opened',
      'question_effect_previewed', 'question_reinterpret_applied' then
      null;
    when 'question_answered_basic' then
      -- Optional by design: the pre-cutover application sends {} and must keep
      -- recording. When present, the value is a closed two-item enum.
      if p_properties ? 'origin' then
        perform private.require_product_event_enum(p_properties, 'origin', array['typed', 'suggested']);
      end if;
    when 'question_resolved' then
      perform private.require_product_event_enum(p_properties, 'kind', array['deferred', 'dismissed', 'not_relevant']);
    when 'interpretation_corrected' then
      perform private.require_product_event_integer(p_properties, 'fieldCount', 1, 30);
    when 'task_candidates_presented' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
    when 'candidate_edit_started' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 1, 1);
    when 'candidate_edit_reset' then
      perform private.require_product_event_integer(p_properties, 'editedFieldCount', 1, 13);
    when 'task_candidates_confirmed' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 1, 100);
      perform private.require_task_candidates_confirmed_edit_counts(p_properties);
    when 'processing_retry_requested' then
      perform private.require_product_event_enum(p_properties, 'retrySource', array['user', 'worker']);
    when 'work_view_viewed' then
      perform private.require_product_event_enum(p_properties, 'workView', array['today', 'all', 'waiting']);
    when 'task_status_changed' then
      perform private.require_product_event_enum(p_properties, 'fromStatus', array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled'
      ]);
      perform private.require_product_event_enum(p_properties, 'toStatus', array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled'
      ]);
    when 'task_command_previewed' then
      perform private.require_product_event_enum(p_properties, 'commandOrigin', array['chat', 'work']);
      -- PRD 2E-UX-001's twelve, in the order the requirement lists them, plus
      -- `previewed`. That thirteenth is the one preview *disposition* the
      -- outcome vocabulary deliberately excludes (`outcomes.ts:53-67`), because
      -- a preview waiting for the user has not come to rest -- and it is
      -- precisely where a one-step-eligible match belongs. Folding it onto
      -- another category would make PRD 18's first question, how often a
      -- command matched in one step, unanswerable from this event.
      perform private.require_product_event_enum(p_properties, 'outcomeCategory', array[
        'applied', 'no_change', 'ambiguous', 'ambiguous_overflow',
        'matched_requires_confirmation', 'clarification_requested', 'still_unmatched',
        'creation_offered', 'unsupported', 'rejected_stale', 'rejected_conflict', 'refused',
        'previewed'
      ]);
      -- Ceiling of 100 rather than of `TASK_MATCH_LIMITS.ranked`: the constant
      -- is a presentation cap that a policy change may raise, and a CHECK that
      -- tracked it would start rejecting truthful counts the day it moved.
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
      perform private.require_product_event_enum(p_properties, 'scoreBand', array['none', 'low', 'medium', 'high']);
      perform private.require_product_event_enum(p_properties, 'marginBand', array['none', 'low', 'medium', 'high']);
      -- 2E-MATCH-014's ten evidence labels. Bounded at ten because a set has no
      -- eleventh member to report.
      perform private.require_product_event_enum_array(p_properties, 'signalCategories', array[
        'normalized_exact_title', 'normalized_title_phrase', 'normalized_token_overlap',
        'referenced_project', 'referenced_context', 'referenced_person', 'status_match',
        'temporal_proximity', 'temporal_proximity_near', 'recent_activity'
      ], 10);
      perform private.require_product_event_boolean(p_properties, 'oneStep');
      perform private.require_product_event_boolean(p_properties, 'requiresConfirmation');
      perform private.require_product_event_policy_version(p_properties, 'policyVersion');
    when 'task_command_disambiguated' then
      perform private.require_product_event_enum(p_properties, 'commandOrigin', array['chat', 'work']);
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
      -- Zero means "the pick was not in the ranked list", which is a real state
      -- when a candidate went ineligible between listing and selection
      -- (2E-DISAMBIG-005). A rank is a position, never an identity.
      perform private.require_product_event_integer(p_properties, 'selectedRank', 0, 100);
      perform private.require_product_event_policy_version(p_properties, 'policyVersion');
    when 'task_command_applied' then
      perform private.require_product_event_enum(p_properties, 'commandOrigin', array['chat', 'work']);
      perform private.require_product_event_enum(p_properties, 'outcomeCategory', array[
        'applied', 'no_change', 'ambiguous', 'ambiguous_overflow',
        'matched_requires_confirmation', 'clarification_requested', 'still_unmatched',
        'creation_offered', 'unsupported', 'rejected_stale', 'rejected_conflict', 'refused'
      ]);
      perform private.require_product_event_enum(p_properties, 'applyRoute', array['direct', 'confirmed', 'created']);
      perform private.require_product_event_boolean(p_properties, 'replayed');
      perform private.require_product_event_policy_version(p_properties, 'policyVersion');
    when 'task_command_undone' then
      perform private.require_product_event_enum(p_properties, 'commandOrigin', array['chat', 'work']);
      perform private.require_product_event_enum(p_properties, 'undoResult', array['undone', 'unavailable', 'expired', 'refused']);
      perform private.require_product_event_policy_version(p_properties, 'policyVersion');
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The migration proves its own postconditions
-- ---------------------------------------------------------------------------
--
-- 202607280061 established this: a widening that silently dropped a
-- pre-existing member would be a data-loss bug nobody notices until an already
-- shipped caller starts failing, so the constraint is read back here rather
-- than trusted.

do $$
declare
  definition text;
  missing text;
begin
  select pg_catalog.pg_get_constraintdef(constraints.oid)
  into definition
  from pg_catalog.pg_constraint as constraints
  where constraints.conrelid = 'public.product_events'::regclass
    and constraints.conname = 'product_events_event_name_check';

  if definition is null then
    raise exception 'product_events_event_name_check is missing';
  end if;

  if position('''rate_limit_refused''' in definition) = 0 then
    raise exception 'product_events_event_name_check does not admit rate_limit_refused';
  end if;

  foreach missing in array array[
    'capture_started', 'capture_save_succeeded', 'capture_save_failed',
    'capture_processing_enqueued', 'capture_processing_completed',
    'capture_processing_failed', 'needs_attention_viewed',
    'needs_attention_item_opened', 'interpretation_review_viewed',
    'interpretation_corrected', 'technical_details_opened',
    'task_candidates_presented', 'task_candidates_confirmed',
    'question_answered_basic', 'question_resolved', 'question_effect_previewed',
    'question_reinterpret_applied', 'processing_retry_requested',
    'work_view_viewed', 'task_status_changed', 'candidate_edit_started',
    'candidate_edit_reset', 'task_command_previewed',
    'task_command_disambiguated', 'task_command_applied', 'task_command_undone'
  ]
  loop
    if position('''' || missing || '''' in definition) = 0 then
      raise exception 'product_events_event_name_check lost the pre-existing event %', missing;
    end if;
  end loop;
end;
$$;

-- 2H-RATE-006. The scope boundary is asserted, not promised: a column whose
-- name looks like money means this limiter became a spend control, and the
-- migration that introduced it should fail rather than the review that missed
-- it.
do $$
declare
  offending text;
begin
  select columns.column_name
  into offending
  from information_schema.columns as columns
  where columns.table_schema = 'public'
    and columns.table_name = 'rate_limit_events'
    and (
      columns.column_name ilike '%cost%'
      or columns.column_name ilike '%usd%'
      or columns.column_name ilike '%spend%'
      or columns.column_name ilike '%price%'
      or columns.column_name ilike '%token%'
    )
  limit 1;

  if offending is not null then
    raise exception '2H-RATE-006: rate_limit_events must carry no spend semantics, found %', offending;
  end if;
end;
$$;
