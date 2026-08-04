-- Signup Hardening SH.1, migration 1 of 2 -- the account lifecycle foundation.
--
-- SH-LIFECYCLE-001..004, SH-EXPOSURE-004, SH-EXPOSURE-008. ADR-073/ADR-077.
--
-- The census (SIGNUP_HARDENING_FINDINGS.md sec. 2) found no account state
-- anywhere: every auth.users row is a full citizen to requireUser, every RPC,
-- both workers and the heartbeat. Deletion (SH.2) and suspension (SH.3) both
-- need an account that exists but must not act, and the state must live where
-- the trust lives -- this table, read by the database functions themselves --
-- not in React.
--
-- WHAT THIS MIGRATION DOES NOT DO, SAID RATHER THAN IMPLIED
-- ---------------------------------------------------------------------------
-- No existing function changes here: the predicate wiring into capture,
-- reprocessing, the three claim paths and the heartbeat is migration 2
-- (202608040071), declared separately in the plan's sec. 1 precisely because
-- it create-or-replaces several existing functions and the count is honest
-- about that. No admin transition functions -- suspend_account,
-- reactivate_account and begin_account_deletion_admin are SH.3's migration,
-- behind the ADR-075 operator boundary. Nothing here can suspend anyone yet:
-- no role holds UPDATE, and the only writers are the seed trigger and the
-- backfill below.
--
-- GRANT POSTURE, CHOSEN RATHER THAN DEFAULTED
-- ---------------------------------------------------------------------------
-- `authenticated` may SELECT its own row (the app shell's status read) and
-- nothing else; `anon` holds nothing; no client role can INSERT, UPDATE or
-- DELETE. `service_role` keeps whatever the platform's default privileges
-- grant at creation, exactly like every other user-owned table in the chain
-- (deliberate: `signup_hardening_grant_census.sql` pins the zero-grant
-- carve-out to exactly the two RPC-only ledgers, and this table is not one;
-- the platform-defaults layer is SH.6's SH-EXPOSURE-001/002 territory). The
-- SH.3 admin functions will be SECURITY DEFINER and do not need table DML.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table public.account_lifecycle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active',
  reason_code text not null,
  changed_by text not null,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- SH-LIFECYCLE-001: closed status set. `deleted` is not a status -- a
  -- deleted account has no row because it has no auth.users row.
  constraint account_lifecycle_status_check
    check (status in ('active', 'suspended', 'deleting')),

  -- Closed actor set. The operator acts through SH.3's DEFINER functions;
  -- the system is the seed trigger and the backfill; the user is SH.2's
  -- deletion request.
  constraint account_lifecycle_changed_by_check
    check (changed_by in ('system', 'user', 'operator')),

  -- Closed reason vocabulary. Free text is refused by the database, not by
  -- convention (the SH-SUSPEND-007 rule, enforced from the first row). The
  -- set covers the transitions SH.1-SH.3 declare; extending it is a
  -- migration-content change in the owning slice, recorded per ADR-071.
  constraint account_lifecycle_reason_code_check
    check (reason_code in (
      'initial_signup',
      'backfill',
      'user_deletion_request',
      'operator_suspension',
      'operator_reactivation',
      'operator_deletion_start',
      'deletion_reverted'
    ))
);

comment on table public.account_lifecycle is
  'One row per account: active, suspended, or deleting. The single foundation deletion (SH.2) and suspension (SH.3) share. Enforced in database functions and workers, never only in React. No client role writes it; transitions go through the state machine trigger below.';

create index account_lifecycle_status_idx
  on public.account_lifecycle (status)
  where status <> 'active';

alter table public.account_lifecycle enable row level security;
alter table public.account_lifecycle force row level security;

create policy account_lifecycle_select_own on public.account_lifecycle
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.account_lifecycle from public, anon, authenticated;
grant select on public.account_lifecycle to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The state machine, as a trigger -- SH-LIFECYCLE-004
-- ---------------------------------------------------------------------------
--
-- Legal transitions: active <-> suspended, active -> deleting,
-- suspended -> deleting, deleting -> active (SH-DELETE-014's admin-only
-- return path; that it is OPERATOR-only is enforced by SH.3's functions being
-- the only writers, not by this machine). Everything else -- including
-- self-transitions -- is refused with a declared SQLSTATE, so an illegal
-- write fails identically no matter which future writer attempts it.

create or replace function private.enforce_account_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Account lifecycle rows are bound to their account'
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_ILLEGAL_TRANSITION';
  end if;

  if not (
    (old.status = 'active' and new.status in ('suspended', 'deleting'))
    or (old.status = 'suspended' and new.status in ('active', 'deleting'))
    or (old.status = 'deleting' and new.status = 'active')
  ) then
    raise exception 'Illegal account lifecycle transition from % to %', old.status, new.status
      using errcode = 'P0001', detail = 'ACCOUNT_LIFECYCLE_ILLEGAL_TRANSITION';
  end if;

  new.changed_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_account_lifecycle_transition()
  from public, anon, authenticated, service_role;

create trigger account_lifecycle_enforce_transition
before update on public.account_lifecycle
for each row execute function private.enforce_account_lifecycle_transition();

-- Every transition writes the audit row -- unconditionally, in the same
-- statement, so a transition without audit is structurally impossible
-- (the ADR-075 reasoning, applied one slice early). audit_logs.actor has a
-- closed set of user/agent/system; the operator maps to system there, and
-- after_state carries the exact changed_by so nothing is lost.

create or replace function private.audit_account_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    new.user_id,
    'account_lifecycle_transition',
    'account_lifecycle',
    new.user_id,
    case when new.changed_by = 'user' then 'user' else 'system' end,
    jsonb_build_object('status', old.status),
    jsonb_build_object(
      'status', new.status,
      'reason_code', new.reason_code,
      'changed_by', new.changed_by
    ),
    'Account lifecycle transition: ' || old.status || ' -> ' || new.status
  );
  return new;
end;
$$;

revoke all on function private.audit_account_lifecycle_transition()
  from public, anon, authenticated, service_role;

create trigger account_lifecycle_audit_transition
after update on public.account_lifecycle
for each row execute function private.audit_account_lifecycle_transition();

-- ---------------------------------------------------------------------------
-- 3. The seed -- SH-LIFECYCLE-003, and SH-EXPOSURE-004 riding the change
-- ---------------------------------------------------------------------------
--
-- The same mechanism that seeds profiles seeds the lifecycle row, so no
-- account can exist without a state. This is the one replacement of
-- handle_new_user, and SH-EXPOSURE-004's explicit EXECUTE revoke rides it:
-- the census skeleton's F-19 pin flips in this same slice.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.agent_preferences (user_id) values (new.id);
  insert into public.account_lifecycle (user_id, status, reason_code, changed_by)
  values (new.id, 'active', 'initial_signup', 'system');
  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The backfill, and the migration failing if it left anyone stateless
-- ---------------------------------------------------------------------------

insert into public.account_lifecycle (user_id, status, reason_code, changed_by)
select users.id, 'active', 'backfill', 'system'
from auth.users as users
on conflict (user_id) do nothing;

do $$
declare
  stateless bigint;
begin
  select count(*) into stateless
  from auth.users as users
  where not exists (
    select 1 from public.account_lifecycle as lifecycle
    where lifecycle.user_id = users.id
  );

  if stateless > 0 then
    raise exception 'account_lifecycle backfill left % auth.users row(s) without a state', stateless;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Postconditions -- SH-EXPOSURE-008's catalog assertions
-- ---------------------------------------------------------------------------

do $$
declare
  offender text;
begin
  -- Forced RLS on the new table.
  if not exists (
    select 1 from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'account_lifecycle'
      and class.relrowsecurity
      and class.relforcerowsecurity
  ) then
    raise exception 'account_lifecycle does not force row level security';
  end if;

  -- Every function this migration created or replaced is SECURITY DEFINER
  -- with the empty search_path.
  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where (namespace.nspname, proc.proname) in (
      ('private', 'enforce_account_lifecycle_transition'),
      ('private', 'audit_account_lifecycle_transition'),
      ('public', 'handle_new_user')
    )
    and (
      not proc.prosecdef
      or proc.proconfig is null
      or not (proc.proconfig @> array['search_path=""'])
    )
  loop
    raise exception 'function % is not definer-with-empty-search-path', offender;
  end loop;

  -- SH-EXPOSURE-004 executed: no client role can EXECUTE handle_new_user
  -- (trigger execution is unaffected -- the trigger runs as the function
  -- owner, not the inserting role).
  if pg_catalog.has_function_privilege('anon', 'public.handle_new_user()', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.handle_new_user()', 'execute')
  then
    raise exception 'handle_new_user retains a client-role EXECUTE grant';
  end if;

  -- No client role can write the lifecycle table.
  if pg_catalog.has_table_privilege('authenticated', 'public.account_lifecycle', 'insert')
    or pg_catalog.has_table_privilege('authenticated', 'public.account_lifecycle', 'update')
    or pg_catalog.has_table_privilege('authenticated', 'public.account_lifecycle', 'delete')
    or pg_catalog.has_table_privilege('anon', 'public.account_lifecycle', 'select')
    or pg_catalog.has_table_privilege('anon', 'public.account_lifecycle', 'insert')
  then
    raise exception 'account_lifecycle grants a client role more than select-own';
  end if;
end;
$$;
