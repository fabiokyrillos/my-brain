-- Signup Hardening SH.6, migration 1 of 2 -- the quota and fairness mechanism.
--
-- SH-QUOTA-001 (entry creation per UTC day), SH-QUOTA-002 (live-job ceiling),
-- SH-QUOTA-003 (per-owner drain fairness), SH-QUOTA-004/005 (storage bytes,
-- object count, attachments per entry and per day), SH-QUOTA-009 (a refusal
-- vocabulary distinct from lifecycle and throttle), SH-QUOTA-010 (the ceilings
-- are parameters, not DDL). ADR-077 signed the numbers; PRD sec. 20 is the
-- table and `src/lib/quotas.ts` is that table in code.
--
-- WHY TRIGGERS AND NOT CHECKS INSIDE THE RPCs
-- ---------------------------------------------------------------------------
-- `authenticated` holds INSERT on `public.entries`, `public.jobs`,
-- `public.attachments` and `public.entity_attachments` -- granted in bulk by
-- 202607160003 and 202607160007. So a ceiling written only inside
-- `capture_entry_async` would be a ceiling any client can walk around by
-- POSTing to PostgREST directly, which is the same class of mistake as a
-- CAPTCHA enforced only in the browser. The enforcement point is therefore the
-- table, and every path -- the capture RPC, the reprocess RPC, the upload
-- action's direct insert, and a hostile direct call -- meets the identical
-- predicate.
--
-- The trigger functions are SECURITY DEFINER because they read
-- `private.quota_ceilings`, which no client role can reach, and because
-- counting a user's own rows must not depend on the reader's RLS view.
--
-- WHY THEY ARE STATEMENT TRIGGERS AND NOT ROW TRIGGERS
-- ---------------------------------------------------------------------------
-- This is the trap that made the first draft of this file wrong, and it is
-- worth stating plainly so nobody reintroduces it. A BEFORE ... FOR EACH ROW
-- trigger cannot see the rows its own statement inserted before the current
-- one: their cmin equals the executing command id, so MVCC hides them from any
-- query the trigger runs. A ceiling checked that way holds against a hundred
-- separate INSERTs and falls over completely against ONE insert of a hundred
-- rows -- which is a single PostgREST POST with an array body, the cheapest
-- request an attacker could possibly send.
--
-- So enforcement is AFTER ... FOR EACH STATEMENT over a transition table. The
-- rows are in the table by then, the count includes them, and the comparison is
-- therefore `used > ceiling` rather than `used >= ceiling`. Raising still
-- aborts the whole statement, so a refusal still writes nothing.
--
-- Owners are visited in sorted order inside each trigger. Two statements
-- touching the same two owners would otherwise be able to take the same two
-- advisory locks in opposite orders, which is a deadlock.
--
-- WHY THE CEILINGS LIVE IN A TABLE
-- ---------------------------------------------------------------------------
-- SH-QUOTA-010 requires that changing a ceiling is a constants change, not a
-- migration, and ADR-057 is the reason a function signature cannot simply grow
-- a `p_ceiling` argument later. `claim_auth_event_slot` solved the same problem
-- by taking its ceilings from the caller (ADR-080 Decision 2) -- available
-- there because the application calls it directly. It is NOT available here:
-- `capture_entry_async` already has its argument list frozen, and a trigger has
-- no caller to take a parameter from at all.
--
-- So the parameter arrives from a row. `private.quota_ceilings` is seeded below
-- with the owner-signed values, and changing one afterwards is an UPDATE
-- against one row -- a runtime change, no DDL, no migration spent. The table is
-- in `private` (never PostgREST-reachable) and no role holds a privilege on it.
--
-- WHY A MISSING CEILING REFUSES
-- ---------------------------------------------------------------------------
-- `private.quota_ceiling` raises on an absent key rather than returning
-- infinity. A quota system whose failure mode is "no limit" is not a quota
-- system, and a deleted seed row must break loudly, not silently open the door.
--
-- THE REFUSAL VOCABULARY (SH-QUOTA-009)
-- ---------------------------------------------------------------------------
-- Every refusal here is P0001 with a detail beginning `QUOTA_`, deliberately
-- distinct from `ACCOUNT_LIFECYCLE_NOT_ACTIVE` (SH.1) and `AUTH_EVENT_THROTTLED`
-- (SH.5), so the three vocabularies of SH-SUSPEND-009 stay three. Nothing in a
-- refusal carries user content: the detail is a constant, and the message names
-- the class, never the row.
--
-- LOCK ORDER, AND WHY THERE IS ONE
-- ---------------------------------------------------------------------------
-- "Count, then insert if under the ceiling" is wrong under concurrency: two
-- callers read ceiling-1 and both proceed. Each ceiling therefore serializes
-- its own bucket with `pg_advisory_xact_lock`, held to commit, so the next
-- caller counts a committed row. A transaction can take several of these, so
-- they have a fixed global order and it is:
--
--     operation key  ->  quota:entries  ->  quota:attachments  ->  quota:jobs
--
-- which is the order the insert sequence of every writing path already
-- produces. The claim path takes only `quota:drain` and never any of the above,
-- so no cycle exists between the writing and claiming sides.


-- ---------------------------------------------------------------------------
-- 1. The ceilings, as data
-- ---------------------------------------------------------------------------

create table private.quota_ceilings (
  key text primary key,

  -- Bounded on both sides. Zero would refuse everything (an accidental
  -- denial-of-service via UPDATE), and the upper bound stops a fat-fingered
  -- ceiling from being indistinguishable from no ceiling at all -- the
  -- `auth_event_ceiling_cap` reasoning, applied to a row instead of an argument.
  value bigint not null check (value between 1 and 1000000000000),

  -- Prose, so `select * from private.quota_ceilings` explains itself to an
  -- operator who is about to change a number.
  note text not null,

  updated_at timestamptz not null default now()
);

comment on table private.quota_ceilings is
  'SH-QUOTA-010: the owner-signed ceilings of PRD sec. 20 as runtime parameters. Changing one is an UPDATE, never a migration. Mirrored by src/lib/quotas.ts, which quotas-parity.test.ts compares against both this seed and the PRD.';

-- The seed IS the PRD sec. 20 value sheet, amendment P-1, unchanged.
insert into private.quota_ceilings (key, value, note) values
  ('entries_per_day', 300,
   'SH-QUOTA-001: entries one user may create per UTC day.'),
  ('live_jobs_per_user', 50,
   'SH-QUOTA-002: jobs in pending/running/failed one user may hold at once.'),
  ('drain_claims_per_owner_per_tick', 5,
   'SH-QUOTA-003: jobs one owner may hold under a live lease, so no owner takes the whole drain.'),
  ('storage_bytes_per_user', 524288000,
   'SH-QUOTA-004: 500 MiB of attachment bytes per user.'),
  ('storage_objects_per_user', 200,
   'SH-QUOTA-004: attachment rows per user.'),
  ('attachments_per_entry', 5,
   'SH-QUOTA-005: attachments linked to one entry.'),
  ('attachments_per_day', 50,
   'SH-QUOTA-005: attachments one user may create per UTC day.');

-- Forced RLS on a table no role can reach is belt and braces, and it is the
-- posture 202608040075 established: the closed door is written down rather than
-- inferred from a missing grant, so a later `grant select` fails against a rule
-- instead of against nothing. The DEFINER functions below reach it because
-- their owner is BYPASSRLS, the same mechanism the throttle claim relies on.
alter table private.quota_ceilings enable row level security;
alter table private.quota_ceilings force row level security;

create policy quota_ceilings_no_client_access
  on private.quota_ceilings
  for all
  to anon, authenticated, service_role
  using (false)
  with check (false);

revoke all on table private.quota_ceilings from public, anon, authenticated, service_role;

-- The reader. STABLE rather than IMMUTABLE: it reads a table, and a planner
-- that cached the value across an operator's UPDATE would defeat the entire
-- point of putting it in a row.
create or replace function private.quota_ceiling(p_key text)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  ceiling bigint;
begin
  select ceilings.value into ceiling
  from private.quota_ceilings as ceilings
  where ceilings.key = p_key;

  -- Fail closed. An absent ceiling is a broken deployment, not a licence.
  if ceiling is null then
    raise exception 'Quota ceiling % is not configured', p_key
      using errcode = 'P0001', detail = 'QUOTA_CEILING_MISSING';
  end if;

  return ceiling;
end;
$$;

comment on function private.quota_ceiling(text) is
  'Reads one SH-QUOTA-010 ceiling. Raises QUOTA_CEILING_MISSING on an absent key -- a quota system that fails open is not one.';

revoke all on function private.quota_ceiling(text)
  from public, anon, authenticated, service_role;

-- The UTC day boundary, in one place, because SH-QUOTA-001 says "per UTC day"
-- and three call sites computing it separately is three chances to disagree.
-- `now()` is transaction time, so every check inside one transaction shares one
-- boundary -- which is the behaviour a boundary test can pin.
create or replace function private.utc_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC'
$$;

comment on function private.utc_day_start() is
  'SH-QUOTA-001: the start of the current UTC day. One definition, so the daily ceilings cannot disagree about when a day begins.';

revoke all on function private.utc_day_start()
  from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. SH-QUOTA-001 -- entry creation per user per UTC day
-- ---------------------------------------------------------------------------

create or replace function private.enforce_entry_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ceiling bigint := private.quota_ceiling('entries_per_day');
  owner uuid;
  used bigint;
begin
  for owner in
    select distinct inserted.user_id
    from inserted
    where inserted.user_id is not null
    order by 1
  loop
    -- Serialize this owner's day before counting it. Held to commit, so the
    -- rows this statement inserted are visible to whoever waits behind us.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('quota:entries:' || owner::text, 0)
    );

    select pg_catalog.count(*)
    into used
    from public.entries as entry
    where entry.user_id = owner
      and entry.created_at >= private.utc_day_start();

    -- Strictly greater: the new rows are already counted, so landing exactly on
    -- the ceiling is admitted and the row after it is not.
    if used > ceiling then
      raise exception 'Daily entry quota reached'
        using errcode = 'P0001', detail = 'QUOTA_ENTRIES_PER_DAY';
    end if;
  end loop;

  return null;
end;
$$;

comment on function private.enforce_entry_quota() is
  'SH-QUOTA-001: refuses an entry insert once the owner has passed the daily ceiling. Statement-level over a transition table, so one multi-row INSERT cannot slip past a per-row count.';

revoke all on function private.enforce_entry_quota()
  from public, anon, authenticated, service_role;

create trigger entries_quota_after_insert
  after insert on public.entries
  referencing new table as inserted
  for each statement
  execute function private.enforce_entry_quota();


-- ---------------------------------------------------------------------------
-- 3. SH-QUOTA-002 -- live jobs per user
-- ---------------------------------------------------------------------------
--
-- The live statuses are `pending`, `running` and `failed` -- the same three the
-- claim predicate and `enqueue_entry_reprocessing`'s in-flight check already
-- treat as unfinished work. `completed` and `cancelled` are terminal and never
-- count, so a busy user is bounded by their *backlog*, not by their history.
--
-- Applies to every inserter including `service_role`. Nothing in this system
-- enqueues as the service role today (the five insert sites are the two capture
-- RPCs and the upload action), and if something ever does, being subject to the
-- owner's ceiling is the safe direction for it to fail in.

create or replace function private.enforce_live_job_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ceiling bigint := private.quota_ceiling('live_jobs_per_user');
  owner uuid;
  used bigint;
begin
  for owner in
    select distinct inserted.user_id
    from inserted
    where inserted.user_id is not null
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('quota:jobs:' || owner::text, 0)
    );

    select pg_catalog.count(*)
    into used
    from public.jobs as job
    where job.user_id = owner
      and job.status in ('pending', 'running', 'failed');

    if used > ceiling then
      raise exception 'Queued work quota reached'
        using errcode = 'P0001', detail = 'QUOTA_LIVE_JOBS';
    end if;
  end loop;

  return null;
end;
$$;

comment on function private.enforce_live_job_quota() is
  'SH-QUOTA-002: refuses a job insert once the owner holds more than the ceiling in pending/running/failed. Terminal rows never count.';

revoke all on function private.enforce_live_job_quota()
  from public, anon, authenticated, service_role;

create trigger jobs_quota_after_insert
  after insert on public.jobs
  referencing new table as inserted
  for each statement
  execute function private.enforce_live_job_quota();


-- ---------------------------------------------------------------------------
-- 4. SH-QUOTA-004 -- storage bytes and object count per user
-- ---------------------------------------------------------------------------
--
-- The application refuses BEFORE the storage write (SH-QUOTA-004's "a refused
-- upload leaves no object"), because only the application knows the size before
-- the bytes move and only the application can decline to move them. This
-- trigger is the half that a direct PostgREST insert also meets: it cannot undo
-- an object already written, but it does stop the metadata row, and the upload
-- action's existing compensation removes the orphan.

create or replace function private.enforce_attachment_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bytes_ceiling bigint := private.quota_ceiling('storage_bytes_per_user');
  objects_ceiling bigint := private.quota_ceiling('storage_objects_per_user');
  daily_ceiling bigint := private.quota_ceiling('attachments_per_day');
  owner uuid;
  used_bytes bigint;
  used_objects bigint;
  used_today bigint;
begin
  for owner in
    select distinct inserted.user_id
    from inserted
    where inserted.user_id is not null
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('quota:attachments:' || owner::text, 0)
    );

    -- `coalesce` is a grammar construct, not a pg_catalog function, so it is
    -- the one name here that must NOT be schema-qualified -- the same bare form
    -- 202608040071 uses inside its empty-search_path bodies.
    --
    -- The new rows are already in the table, so their bytes are already in this
    -- sum: an owner whose last upload lands exactly on the ceiling is admitted,
    -- and the one after it is not.
    select
      coalesce(pg_catalog.sum(attachment.size_bytes), 0),
      pg_catalog.count(*),
      pg_catalog.count(*) filter (where attachment.created_at >= private.utc_day_start())
    into used_bytes, used_objects, used_today
    from public.attachments as attachment
    where attachment.user_id = owner;

    if used_bytes > bytes_ceiling then
      raise exception 'Storage quota reached'
        using errcode = 'P0001', detail = 'QUOTA_STORAGE_BYTES';
    end if;

    if used_objects > objects_ceiling then
      raise exception 'Stored file quota reached'
        using errcode = 'P0001', detail = 'QUOTA_STORAGE_OBJECTS';
    end if;

    if used_today > daily_ceiling then
      raise exception 'Daily attachment quota reached'
        using errcode = 'P0001', detail = 'QUOTA_ATTACHMENTS_PER_DAY';
    end if;
  end loop;

  return null;
end;
$$;

comment on function private.enforce_attachment_quota() is
  'SH-QUOTA-004/005: refuses an attachment insert that takes the owner past their byte, object or daily ceiling. The incoming rows'' own bytes are inside the sum.';

revoke all on function private.enforce_attachment_quota()
  from public, anon, authenticated, service_role;

create trigger attachments_quota_after_insert
  after insert on public.attachments
  referencing new table as inserted
  for each statement
  execute function private.enforce_attachment_quota();


-- ---------------------------------------------------------------------------
-- 5. SH-QUOTA-005 -- attachments per entry
-- ---------------------------------------------------------------------------
--
-- `attachments` carries no entry_id; the link is the polymorphic
-- `entity_attachments` row with `entity_type = 'entry'` (202607160007). So the
-- per-entry ceiling belongs on that table, and only for that entity type --
-- attaching a file to a task or a person is a different relationship with no
-- ceiling in the signed sheet, and inventing one here would be a value nobody
-- agreed to.

create or replace function private.enforce_entry_attachment_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ceiling bigint := private.quota_ceiling('attachments_per_entry');
  target uuid;
  used bigint;
begin
  for target in
    select distinct inserted.entity_id
    from inserted
    where inserted.entity_type = 'entry'
      and inserted.user_id is not null
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('quota:entry-attachments:' || target::text, 0)
    );

    select pg_catalog.count(*)
    into used
    from public.entity_attachments as link
    where link.entity_type = 'entry'
      and link.entity_id = target;

    if used > ceiling then
      raise exception 'Entry attachment quota reached'
        using errcode = 'P0001', detail = 'QUOTA_ATTACHMENTS_PER_ENTRY';
    end if;
  end loop;

  return null;
end;
$$;

comment on function private.enforce_entry_attachment_quota() is
  'SH-QUOTA-005: refuses linking more than the ceiling of attachments to one entry. Other entity types are out of scope by decision, not by omission.';

revoke all on function private.enforce_entry_attachment_quota()
  from public, anon, authenticated, service_role;

create trigger entity_attachments_quota_after_insert
  after insert on public.entity_attachments
  referencing new table as inserted
  for each statement
  execute function private.enforce_entry_attachment_quota();


-- ---------------------------------------------------------------------------
-- 6. SH-QUOTA-003 -- per-owner drain fairness
-- ---------------------------------------------------------------------------
--
-- WHAT "PER TICK" MEANS HERE, STATED RATHER THAN IMPLIED
--
-- The drain has no transaction that spans a tick -- it claims one job per call,
-- in its own transaction, and loops. There is therefore no "invocation" a
-- counter could be scoped to, and a counter that tried would be a process
-- counter of exactly the kind the threat model's T-21 says must not exist.
--
-- The mechanism is instead a ceiling on jobs the owner already holds IN FLIGHT
-- under a live lease. It delivers the property SH-QUOTA-003 asks for and is
-- strictly stronger: not merely "at most five claims this minute" but "at most
-- five of the drain's slots at any instant", so an owner with a thousand
-- pending jobs can never occupy more than five of twenty-five, and twenty other
-- owners keep making progress.
--
-- `lease_expires_at > now()` and not merely `status = 'running'`: a worker that
-- died holds rows in `running` until the reaper runs, and counting those would
-- let one crash lock an owner out of their own queue. An expired lease is not
-- in flight.
--
-- The predicate below is byte-identical in all three claim functions
-- (SH-WORKER-003's discipline, now covering fairness as well as lifecycle), and
-- the authoritative serialized check is the advisory lock inside
-- `claim_entry_interpretation_job` -- the single funnel every entry claim
-- passes through, including `claim_next_...`, which delegates to it. The
-- predicate in `claim_next_...` is what makes the drain *choose a different
-- owner* rather than merely fail on this one.
--
-- Every function below is its previous definition (202608040071) reproduced in
-- full with the fairness predicate added. No signature changes -- ADR-057.

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
-- Postconditions -- SH-EXPOSURE-008, read back out of the catalog at apply time
-- ---------------------------------------------------------------------------

do $quota_postcondition$
declare
  offender text;
  seeded integer;
begin
  -- Every ceiling the mechanism reads must exist, or the first insert after
  -- deploy fails closed and captures stop. Checking it here turns that into a
  -- failed deploy instead.
  select pg_catalog.count(*) into seeded from private.quota_ceilings;
  if seeded <> 7 then
    raise exception 'expected 7 seeded quota ceilings, found %', seeded
      using errcode = 'P0001', detail = 'SH_QUOTA_SEED';
  end if;

  for offender in
    select unnest(array[
      'entries_per_day',
      'live_jobs_per_user',
      'drain_claims_per_owner_per_tick',
      'storage_bytes_per_user',
      'storage_objects_per_user',
      'attachments_per_entry',
      'attachments_per_day'
    ])
    except
    select ceilings.key from private.quota_ceilings as ceilings
  loop
    raise exception 'quota ceiling % was not seeded', offender
      using errcode = 'P0001', detail = 'SH_QUOTA_SEED';
  end loop;

  -- Every function this migration created or replaced is DEFINER with an empty
  -- search_path.
  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    -- The outer parentheses are load-bearing: `and` binds tighter than `or`,
    -- so without them the public functions would be the only ones checked and
    -- the private trigger functions would pass by parsing accident.
    where (
        (namespace.nspname = 'private' and proc.proname in (
          'enforce_entry_quota',
          'enforce_live_job_quota',
          'enforce_attachment_quota',
          'enforce_entry_attachment_quota'
        ))
        or (namespace.nspname = 'public' and proc.proname in (
          'claim_entry_interpretation_job',
          'claim_next_entry_interpretation_job',
          'claim_attachment_job'
        ))
      )
      and (
        not proc.prosecdef
        or proc.proconfig is null
        or not (proc.proconfig @> array['search_path=""'])
      )
  loop
    raise exception 'function % is not definer-with-empty-search-path', offender
      using errcode = 'P0001', detail = 'SH_QUOTA_DEFINER';
  end loop;

  -- No client role reaches the ceilings table or any enforcement function.
  -- Trigger execution does not consult EXECUTE privilege, so revoking from
  -- everyone costs the mechanism nothing and closes a direct-call surface.
  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as privilege
    where pg_catalog.has_table_privilege(role_name::name, 'private.quota_ceilings', privilege)
  ) then
    raise exception 'a client role holds a privilege on private.quota_ceilings'
      using errcode = 'P0001', detail = 'SH_QUOTA_GRANT';
  end if;

  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
         unnest(array[
           'private.quota_ceiling(text)',
           'private.utc_day_start()',
           'private.enforce_entry_quota()',
           'private.enforce_live_job_quota()',
           'private.enforce_attachment_quota()',
           'private.enforce_entry_attachment_quota()'
         ]) as function_signature
    where pg_catalog.has_function_privilege(role_name::name, function_signature, 'execute')
  ) then
    raise exception 'a client role can execute a quota enforcement function'
      using errcode = 'P0001', detail = 'SH_QUOTA_FUNCTION_GRANT';
  end if;

  -- The four triggers exist and are AFTER INSERT *statement* triggers with a
  -- transition table. Asserting the shape and not merely the name is the point:
  -- a well-meaning future change to FOR EACH ROW would keep every test name
  -- intact while reopening the multi-row bypass this file exists to close.
  for offender in
    select unnest(array[
      'entries_quota_after_insert',
      'jobs_quota_after_insert',
      'attachments_quota_after_insert',
      'entity_attachments_quota_after_insert'
    ])
    except
    -- Scoped to the four tables, so a same-named trigger somewhere else could
    -- never satisfy this by coincidence.
    select trigger.tgname
    from pg_catalog.pg_trigger as trigger
    where not trigger.tgisinternal
      and trigger.tgrelid in (
        'public.entries'::regclass,
        'public.jobs'::regclass,
        'public.attachments'::regclass,
        'public.entity_attachments'::regclass
      )
      -- TRIGGER_TYPE_ROW = 1, BEFORE = 2, INSERT = 4. An AFTER INSERT statement
      -- trigger is INSERT and neither of the other two.
      and (trigger.tgtype & 7) = 4
      and trigger.tgnewtable is not null
  loop
    raise exception 'quota trigger % is missing, or is not an AFTER INSERT statement trigger with a transition table', offender
      using errcode = 'P0001', detail = 'SH_QUOTA_TRIGGER';
  end loop;

  -- The claim functions keep the posture 202608040071 asserted for them.
  if pg_catalog.has_function_privilege('authenticated', 'public.claim_entry_interpretation_job(uuid, uuid, text, integer)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.claim_next_entry_interpretation_job(text, integer)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.claim_attachment_job(uuid, uuid, text, integer)', 'execute')
  then
    raise exception 'a worker-only function is executable by authenticated'
      using errcode = 'P0001', detail = 'SH_QUOTA_CLAIM_GRANT';
  end if;
end;
$quota_postcondition$;
