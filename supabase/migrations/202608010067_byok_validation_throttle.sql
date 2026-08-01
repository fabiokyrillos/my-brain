-- BYOK Slice BYOK.3 — the validation throttle's storage.
--
-- Authorized by ADR-070 / PRD Amendment P-1 / plan Amendment A-2, which raised
-- the initiative's migration budget from four to five and BYOK.3's allocation
-- from zero to one. BYOK.1 raised the conflict that forced this and invented no
-- column; this is the column, with the owner's decision behind it.
--
-- WHAT ip_hash IS, AND WHAT IT IS NOT
-- ---------------------------------------------------------------------------
-- BYOK-SCHEMA-010. It is `HMAC-SHA256` over a **canonicalized** IP, under a
-- third independent secret that lives in the application environment and never
-- in this database. **The raw address is never stored**, never logged and never
-- returned by any read path.
--
-- A throttle needs exactly one property from an address: equality. A keyed hash
-- gives equality and gives nothing else -- and because the key is not here, a
-- database copy cannot even confirm a guessed address.
--
-- Canonicalization is part of the contract rather than an implementation
-- detail: `HMAC` over an un-canonicalized string mints a fresh bucket for every
-- spelling of the same address, which silently defeats the ceiling it exists to
-- enforce. The rule lives in `src/lib/byok/ip.ts` and is asserted there.
--
-- BYOK-SCHEMA-013: `ip_hash` is used **only** for validation throttling and
-- abuse control. It is not a join key, not an analytics dimension, not
-- user-visible, and it appears in no other table.
--
-- WHY THE COLUMN IS NULLABLE
-- ---------------------------------------------------------------------------
-- A request whose address cannot be determined at all -- not merely unparseable,
-- which hashes to a shared `unparseable` bucket, but genuinely absent -- must
-- still be recorded and still be counted against the per-user ceiling. Making
-- the column `not null` would force the application to invent a value, and an
-- invented value is a bucket an attacker can aim for. Null means "no address
-- was available"; the per-user ceiling still applies.

alter table public.credential_validation_attempts
  add column ip_hash text;

comment on column public.credential_validation_attempts.ip_hash is
  'HMAC-SHA256 of a canonicalized client IP under BYOK_RATE_LIMIT_PEPPER. Never the raw address. Throttling and abuse control only.';

-- 64 lowercase hex characters, or nothing. A value of any other shape did not
-- come from this system's hash, and the CHECK is what stops a raw address being
-- written here by a future caller that skipped the helper.
alter table public.credential_validation_attempts
  add constraint credential_validation_attempts_ip_hash_check
  check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$');

-- BYOK-SCHEMA-015. Exactly the two queries the ceilings run, and nothing more:
-- an index is a retention surface as much as a performance one.
--
-- The per-user index already exists (`credential_validation_attempts_user_time_idx`,
-- `202608010065`). This is its per-IP counterpart, partial because a null
-- `ip_hash` is never the subject of an IP ceiling -- so the index holds only rows
-- that an IP ceiling can actually match.
create index credential_validation_attempts_ip_time_idx
  on public.credential_validation_attempts (ip_hash, attempted_at desc)
  where ip_hash is not null;

-- BYOK-SCHEMA-014 — bounded retention, enforced rather than described.
--
-- An attempt record older than the window is not evidence; it is a record of
-- somebody's network location that outlived its purpose. Thirty days is chosen
-- against the thing the data is for: the ceilings are **daily**, so a month
-- leaves ample room to investigate a pattern and no room to accumulate a
-- history.
--
-- SECURITY DEFINER with an empty search_path, granted to nobody. It is called
-- by `pg_cron` as the scheduler's own role, and by no client path -- there is no
-- product reason for a user to trigger a retention sweep, and a grant would be
-- a denial-of-service lever.
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
  where attempted_at < pg_catalog.now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.prune_credential_validation_attempts() is
  'BYOK-SCHEMA-014: deletes validation attempts older than 30 days. Scheduler-only; granted to no client role.';

revoke all on function public.prune_credential_validation_attempts()
  from public, anon, authenticated, service_role;

-- The schedule. `pg_cron` is already this database's scheduler -- the heartbeat
-- runs on it hourly -- so retention uses the mechanism that is already proven
-- here rather than introducing a second one.
--
-- Guarded by an existence check on the extension so the migration applies to a
-- database that has not installed it: the retention *rule* is the function, and
-- a chain that refused to apply without a scheduler would block CI, where the
-- suite runs `db reset` from empty. A missing schedule is visible -- the pgTAP
-- suite asserts the function exists, and `BYOK.6`'s runbook owns the deployed
-- schedule.
do $byok_retention_schedule$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'byok-prune-validation-attempts',
      '17 4 * * *',
      $cron$select public.prune_credential_validation_attempts();$cron$
    );
  end if;
exception
  when others then
    -- A scheduler that refuses the job must not fail the chain. The function is
    -- the enforceable half and it is now present; the schedule is operational
    -- state, re-asserted by BYOK.6's runbook.
    raise notice 'BYOK retention schedule not installed: %', sqlerrm;
end;
$byok_retention_schedule$;

-- ---------------------------------------------------------------------------
-- The ceilings, made concurrency-safe (plan Amendment A-2.3)
-- ---------------------------------------------------------------------------
--
-- WHY THIS IS AN RPC AND NOT APPLICATION CODE
--
-- The obvious implementation is "count today's attempts, and if it is under the
-- limit, proceed". Under any concurrency at all that is wrong: two requests both
-- read `count = ceiling - 1`, both conclude they may proceed, and the ceiling is
-- exceeded by however many requests arrived together. Inserting first and
-- counting afterwards does not fix it either -- under READ COMMITTED neither
-- transaction sees the other's uncommitted row, so both still count low.
--
-- The fix is to serialize the read-and-write for one bucket, which is what
-- `pg_advisory_xact_lock` does. It is the mechanism `run_all_heartbeats` already
-- uses for its per-user lock, so this is the database's existing answer to the
-- same question rather than a new one.
--
-- **Two locks, always taken in the same order** (user first, then IP). Two locks
-- taken in different orders by different callers is a deadlock; a fixed order is
-- what makes that impossible.
create or replace function public.claim_credential_validation_slot(
  p_ip_hash text,
  p_user_ceiling integer default 10,
  p_ip_ceiling integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  window_start timestamptz := pg_catalog.date_trunc('day', pg_catalog.now());
  user_attempts integer;
  ip_attempts integer;
  attempt_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid ip hash' using errcode = '22023';
  end if;

  if p_user_ceiling < 1 or p_ip_ceiling < 1 then
    raise exception 'Invalid ceiling' using errcode = '22023';
  end if;

  -- Fixed lock order: owner, then address. `hashtextextended` gives a stable
  -- 64-bit key from a uuid or a hex digest without a second lookup table.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('byok:validation:user:' || current_user_id::text, 0)
  );
  if p_ip_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('byok:validation:ip:' || p_ip_hash, 0)
    );
  end if;

  select pg_catalog.count(*)
  into user_attempts
  from public.credential_validation_attempts as attempt
  where attempt.user_id = current_user_id
    and attempt.attempted_at >= window_start;

  if user_attempts >= p_user_ceiling then
    raise exception 'Validation attempt ceiling reached'
      using errcode = 'P0001', detail = 'BYOK_VALIDATION_THROTTLED';
  end if;

  if p_ip_hash is not null then
    select pg_catalog.count(*)
    into ip_attempts
    from public.credential_validation_attempts as attempt
    where attempt.ip_hash = p_ip_hash
      and attempt.attempted_at >= window_start;

    if ip_attempts >= p_ip_ceiling then
      raise exception 'Validation attempt ceiling reached'
        using errcode = 'P0001', detail = 'BYOK_VALIDATION_THROTTLED';
    end if;
  end if;

  -- The slot is **reserved by inserting**, inside the same locked transaction
  -- that counted. That is what makes the count meaningful: by the time the lock
  -- is released the row exists, so the next caller counts it.
  --
  -- `unknown` is the provisional outcome. A reservation that is never finalized
  -- -- the process died mid-call -- stays `unknown` and still counts against the
  -- ceiling, which is the correct failure direction: a crash must not be a way
  -- to get free attempts.
  insert into public.credential_validation_attempts (user_id, outcome, ip_hash)
  values (current_user_id, 'unknown', p_ip_hash)
  returning id into attempt_id;

  return attempt_id;
end;
$$;

comment on function public.claim_credential_validation_slot(text, integer, integer) is
  'BYOK-VALIDATE-004: reserves one validation attempt under per-user and per-IP daily ceilings, serialized by advisory locks. Returns the attempt id to finalize.';

-- Finalizing is a separate call because the outcome is only known after the
-- provider has answered, and the client must not be able to rewrite history:
-- `authenticated` holds no UPDATE on this table, so the only path is here, and
-- this function will only move a row **it can prove the caller owns** and only
-- from the provisional `unknown`.
create or replace function public.finalize_credential_validation_attempt(
  p_attempt_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_outcome not in (
    'succeeded', 'invalid_key', 'insufficient_quota', 'rate_limited', 'revoked', 'unknown'
  ) then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;

  update public.credential_validation_attempts
  set outcome = p_outcome
  where id = p_attempt_id
    and user_id = current_user_id
    and outcome = 'unknown';
  -- Silent when nothing matched. A foreign id, a missing id and an
  -- already-finalized row are one outcome to the caller, so this cannot be used
  -- to probe which attempts exist.
end;
$$;

comment on function public.finalize_credential_validation_attempt(uuid, text) is
  'Records the outcome of a reserved validation attempt. Owner-scoped, one-way from the provisional value, silent on a miss.';

revoke all on function public.claim_credential_validation_slot(text, integer, integer)
  from public, anon, service_role;
grant execute on function public.claim_credential_validation_slot(text, integer, integer)
  to authenticated;

revoke all on function public.finalize_credential_validation_attempt(uuid, text)
  from public, anon, service_role;
grant execute on function public.finalize_credential_validation_attempt(uuid, text)
  to authenticated;

-- Post-deploy assertion, in the `202608010065` shape: the posture this file
-- claims is read back out of the catalog at apply time.
do $byok_throttle_postcondition$
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.credential_validation_attempts'::regclass
      and attname = 'ip_hash'
      and not attisdropped
  ) then
    raise exception 'credential_validation_attempts.ip_hash was not added'
      using errcode = 'P0001', detail = 'BYOK_THROTTLE_COLUMN';
  end if;

  -- The append-only posture BYOK.1 established must survive this migration.
  -- Adding a column is exactly the kind of change that quietly re-grants.
  if pg_catalog.has_table_privilege(
       'authenticated', 'public.credential_validation_attempts', 'update'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', 'public.credential_validation_attempts', 'delete'
     )
     or exists (
       select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
       where pg_catalog.has_table_privilege(
         'anon', 'public.credential_validation_attempts', privilege
       )
     )
  then
    raise exception 'the attempts table stopped being append-only, or anon gained a privilege'
      using errcode = 'P0001', detail = 'BYOK_THROTTLE_GRANT';
  end if;

  if not (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.credential_validation_attempts'::regclass
  ) then
    raise exception 'the attempts table lost forced RLS'
      using errcode = 'P0001', detail = 'BYOK_THROTTLE_RLS';
  end if;

  -- The retention function exists and is reachable by nobody.
  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'public.prune_credential_validation_attempts()', 'execute'
    )
  ) then
    raise exception 'the retention sweep is executable by a client role'
      using errcode = 'P0001', detail = 'BYOK_RETENTION_GRANT';
  end if;

  -- The throttle RPCs: reachable by the one role that needs them, and by no
  -- other. A `service_role` grant here would be a way to bypass a ceiling.
  if not (
    pg_catalog.has_function_privilege(
      'authenticated',
      'public.claim_credential_validation_slot(text, integer, integer)',
      'execute'
    )
    and pg_catalog.has_function_privilege(
      'authenticated',
      'public.finalize_credential_validation_attempt(uuid, text)',
      'execute'
    )
  ) then
    raise exception 'the throttle RPCs are unreachable by authenticated'
      using errcode = 'P0001', detail = 'BYOK_THROTTLE_MISSING_GRANT';
  end if;

  if exists (
    select 1
    from unnest(array['anon', 'service_role']) as role_name,
         unnest(array[
           'public.claim_credential_validation_slot(text, integer, integer)',
           'public.finalize_credential_validation_attempt(uuid, text)'
         ]) as signature
    where pg_catalog.has_function_privilege(role_name, signature, 'execute')
  ) then
    raise exception 'a throttle RPC is reachable by a role that must not have it'
      using errcode = 'P0001', detail = 'BYOK_THROTTLE_GRANT_WIDE';
  end if;
end;
$byok_throttle_postcondition$;
