-- Signup Hardening SH.2 -- account deletion: the log and the start transition.
--
-- SH-DELETE-003 (the `deleting` transition from an authenticated session),
-- SH-DELETE-009 (a de-identified, append-only deletion record),
-- SH-DELETE-014 (irreversibility stated by construction), SH-EXPOSURE-008.
-- ADR-074/ADR-077.
--
-- The executor itself is NOT here: it is an Edge Function outside `src/`
-- (ADR-074), self-only, resumable, stopping rather than forcing. This
-- migration gives it the two database surfaces it needs -- a way for the user
-- to start deletion, and a place to record what a deletion did after the
-- account it belonged to no longer exists.
--
-- WHY THE LOG HAS NO user_id, AND WHY THAT IS THE POINT
-- ---------------------------------------------------------------------------
-- `account_deletion_log` deliberately carries **no** `user_id`, no email and
-- no display name. A retained log keyed to the person it erased would
-- contradict the privacy claim the deletion makes (T-31), and a `user_id` FK
-- could not survive the `auth.users` delete anyway. What it carries is an
-- opaque event id, per-step timestamps, counts, and the requesting session's
-- hashed identifier under the same 64-hex contract `credential_validation_
-- attempts.ip_hash` uses (`202608010067`) -- the hash is computed outside the
-- database, exactly as that one is, and the CHECK here enforces its shape so a
-- raw identifier cannot land in the column even by accident.
--
-- The Privacy Policy (SH-LEGAL-014, SH.4) states this field list, and the
-- residue verifier proves the enumerated set is all that remains.

-- ---------------------------------------------------------------------------
-- 1. The deletion record
-- ---------------------------------------------------------------------------

create table public.account_deletion_log (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null,
  storage_started_at timestamptz,
  storage_completed_at timestamptz,
  account_deleted_at timestamptz,
  completed_at timestamptz,
  outcome text not null,
  stop_reason text,
  storage_objects_removed integer not null default 0,
  storage_bytes_removed bigint not null default 0,
  table_row_counts jsonb not null default '{}'::jsonb,
  requester_session_hash text,
  created_at timestamptz not null default now(),

  -- Closed outcome vocabulary. `stopped` is a first-class outcome, not a
  -- failure mode bolted on: SH-DELETE-007 requires the executor to halt on
  -- unknown residue, and an outcome set without a word for that would push the
  -- implementer toward forcing.
  constraint account_deletion_log_outcome_check
    check (outcome in ('completed', 'stopped', 'failed')),

  -- A stop must say why; a completion must not carry a stop reason.
  constraint account_deletion_log_stop_reason_shape_check
    check (
      (outcome = 'completed' and stop_reason is null)
      or (outcome <> 'completed' and stop_reason is not null)
    ),

  -- The same closed vocabulary discipline as `jobs.error` under BYOK: free
  -- text cannot land here, so no path, no provider message and no fragment of
  -- user content can be recorded by an executor having a bad day.
  constraint account_deletion_log_stop_reason_vocabulary_check
    check (
      stop_reason is null
      or stop_reason in (
        'unknown_owned_table',
        'unclassifiable_storage_object',
        'cross_owner_reference',
        'storage_residue_remains',
        'credential_not_erased',
        'auth_delete_failed',
        'lifecycle_not_deleting'
      )
    ),

  -- SH-DELETE-009: the identifier is a hash or it is nothing. Same 64-hex
  -- contract as BYOK's ip_hash, computed outside the database under the
  -- rate-limit pepper.
  constraint account_deletion_log_requester_session_hash_check
    check (requester_session_hash is null or requester_session_hash ~ '^[0-9a-f]{64}$'),

  -- Counts are counts.
  constraint account_deletion_log_counts_check
    check (storage_objects_removed >= 0 and storage_bytes_removed >= 0),

  -- The row is a record of one account's deletion, so the per-table counts are
  -- an object of numbers, never a payload.
  constraint account_deletion_log_table_row_counts_check
    check (
      jsonb_typeof(table_row_counts) = 'object'
      and pg_column_size(table_row_counts) <= 4096
    )
);

comment on table public.account_deletion_log is
  'One row per executed account deletion, de-identified by construction: an opaque event id, per-step timestamps, counts, a closed outcome/stop vocabulary and a hashed requesting session. No user_id, no email, no display name -- a log that could re-identify the account it erased would contradict the deletion. Append-only; no client role reaches it, and service_role writes it only through record_account_deletion.';

create index account_deletion_log_created_at_idx
  on public.account_deletion_log (created_at desc);

alter table public.account_deletion_log enable row level security;
alter table public.account_deletion_log force row level security;

-- No policies at all: with forced RLS and no policy, every non-superuser
-- SELECT returns nothing and every write is refused. The RPC below is a
-- DEFINER function and is the only writer.
revoke all on public.account_deletion_log from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The user's deletion request -- SH-DELETE-003
-- ---------------------------------------------------------------------------
--
-- Re-authentication and the typed confirmation phrase are validated in the
-- Server Action (SH-DELETE-002) before this is called: the provider is the
-- only thing that can check a password, and it is not reachable from SQL.
-- What this function owns is the part that must be atomic and auditable --
-- the transition itself, through the SH.1 machine, with its unconditional
-- audit row.
--
-- Idempotent by design: a second call from an account already `deleting`
-- returns the same shape rather than raising, because the request surface may
-- legitimately be retried while the executor is mid-flight.

create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- The row is locked for the duration, so two concurrent requests cannot
  -- both read `active` and both attempt the transition.
  select status into current_status
  from public.account_lifecycle
  where user_id = current_user_id
  for update;

  if current_status is null then
    raise exception 'Account lifecycle state is missing'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_MISSING';
  end if;

  if current_status = 'deleting' then
    return jsonb_build_object('status', 'deleting', 'already_requested', true);
  end if;

  if current_status <> 'active' then
    raise exception 'Account lifecycle does not permit this action'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_NOT_ACTIVE';
  end if;

  update public.account_lifecycle
  set status = 'deleting',
      reason_code = 'user_deletion_request',
      changed_by = 'user'
  where user_id = current_user_id;

  return jsonb_build_object('status', 'deleting', 'already_requested', false);
end;
$$;

revoke all on function public.request_account_deletion() from public, anon, service_role;
grant execute on function public.request_account_deletion() to authenticated;

comment on function public.request_account_deletion() is
  'SH-DELETE-003. Transitions the CALLER''s own account to deleting through the SH.1 lifecycle machine (which writes the audit row). Takes no target parameter: the owner is auth.uid() and nothing else. Re-authentication and the typed confirmation are the Server Action''s (SH-DELETE-002); this owns the atomic, audited transition. Idempotent while already deleting.';

-- ---------------------------------------------------------------------------
-- 3. The executor's write path -- SH-DELETE-009
-- ---------------------------------------------------------------------------
--
-- service_role-only, because the executor is the only caller and it holds no
-- table DML on the log (section 1 revoked it). Validation lives here rather
-- than in the Edge Function so that a future second caller cannot record a
-- weaker row: the CHECKs above are the shape, this is the gate.

create or replace function public.record_account_deletion(
  p_requested_at timestamptz,
  p_storage_started_at timestamptz,
  p_storage_completed_at timestamptz,
  p_account_deleted_at timestamptz,
  p_outcome text,
  p_stop_reason text,
  p_storage_objects_removed integer,
  p_storage_bytes_removed bigint,
  p_table_row_counts jsonb,
  p_requester_session_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  insert into public.account_deletion_log (
    requested_at,
    storage_started_at,
    storage_completed_at,
    account_deleted_at,
    completed_at,
    outcome,
    stop_reason,
    storage_objects_removed,
    storage_bytes_removed,
    table_row_counts,
    requester_session_hash
  ) values (
    p_requested_at,
    p_storage_started_at,
    p_storage_completed_at,
    p_account_deleted_at,
    now(),
    p_outcome,
    p_stop_reason,
    coalesce(p_storage_objects_removed, 0),
    coalesce(p_storage_bytes_removed, 0),
    coalesce(p_table_row_counts, '{}'::jsonb),
    p_requester_session_hash
  )
  returning id into recorded_id;

  return recorded_id;
end;
$$;

revoke all on function public.record_account_deletion(
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, integer, bigint, jsonb, text
) from public, anon, authenticated;
grant execute on function public.record_account_deletion(
  timestamptz, timestamptz, timestamptz, timestamptz, text, text, integer, bigint, jsonb, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The executor's owned-table census -- SH-DELETE-007's detector
-- ---------------------------------------------------------------------------
--
-- The executor must "stop rather than force" when it meets a user-owned table
-- the cascade census does not cover. A fixed list in the Edge Function would
-- be wrong the day a table is added, so the enumeration is a database
-- function reading the catalog at run time -- the same shape the SH.0 cascade
-- drill and `byok_residue.sql` use, and the same reason.

create or replace function public.account_owned_row_counts(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  scanned record;
  present bigint;
  counts jsonb := '{}'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;

  for scanned in
    select columns.table_name
    from information_schema.columns as columns
    join information_schema.tables as tables
      on tables.table_schema = columns.table_schema
     and tables.table_name = columns.table_name
    where columns.table_schema = 'public'
      and columns.column_name = 'user_id'
      and tables.table_type = 'BASE TABLE'
    order by columns.table_name
  loop
    -- An unscannable table is a finding, not a crash: it is reported by name
    -- with a sentinel the executor treats as unknown residue and stops on,
    -- rather than aborting the whole census and losing the other counts.
    begin
      execute format('select count(*) from public.%I where user_id = $1', scanned.table_name)
        into present
        using p_user_id;
    exception when others then
      counts := counts || jsonb_build_object(scanned.table_name, -1);
      continue;
    end;

    if present > 0 then
      counts := counts || jsonb_build_object(scanned.table_name, present);
    end if;
  end loop;

  return counts;
end;
$$;

revoke all on function public.account_owned_row_counts(uuid) from public, anon, authenticated;
grant execute on function public.account_owned_row_counts(uuid) to service_role;

comment on function public.account_owned_row_counts(uuid) is
  'Enumerates public base tables carrying a user_id AT RUN TIME and returns the non-zero row counts for one owner, with -1 for a table it could not scan. The deletion executor calls it before and after the cascade: before, for the log''s per-table counts; after, as the zero-residue check that must find nothing. A table added by a later slice joins this census unasked -- the SH-DELETE-007/T-32 property.';

-- ---------------------------------------------------------------------------
-- 5. Postconditions -- SH-EXPOSURE-008
-- ---------------------------------------------------------------------------

do $$
declare
  offender text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'account_deletion_log'
      and class.relrowsecurity
      and class.relforcerowsecurity
  ) then
    raise exception 'account_deletion_log does not force row level security';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'account_deletion_log'
  ) then
    raise exception 'account_deletion_log must carry no policy: the RPC is its only writer';
  end if;

  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in (
        'request_account_deletion',
        'record_account_deletion',
        'account_owned_row_counts'
      )
      and (
        not proc.prosecdef
        or proc.proconfig is null
        or not (proc.proconfig @> array['search_path=""'])
      )
  loop
    raise exception 'function % is not definer-with-empty-search-path', offender;
  end loop;

  -- The request surface is the user's; the recording and census surfaces are
  -- the executor's. Neither set may leak into the other.
  if not pg_catalog.has_function_privilege('authenticated', 'public.request_account_deletion()', 'execute') then
    raise exception 'request_account_deletion is not callable by the account that owns it';
  end if;
  if pg_catalog.has_function_privilege('authenticated', 'public.record_account_deletion(timestamptz, timestamptz, timestamptz, timestamptz, text, text, integer, bigint, jsonb, text)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.account_owned_row_counts(uuid)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.request_account_deletion()', 'execute')
  then
    raise exception 'a deletion-executor function is reachable by a client role';
  end if;

  -- No client role, and not service_role either, writes the log directly.
  if pg_catalog.has_table_privilege('service_role', 'public.account_deletion_log', 'insert')
    or pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_log', 'select')
  then
    raise exception 'account_deletion_log is reachable outside its RPC';
  end if;
end;
$$;
