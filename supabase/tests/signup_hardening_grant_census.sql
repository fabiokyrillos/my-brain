-- Signup Hardening SH.0 -- the privileged-boundary census skeleton
-- (SH-EXPOSURE-002, gate SH-G0.3), executed.
--
-- WHAT A SKELETON IS, AND WHAT IT IS NOT
-- ---------------------------------------------------------------------------
-- SH.6 pins the FULL role-by-table DML matrix, after its revokes land
-- (SH-EXPOSURE-001/003). Pinning the full matrix now would freeze grants that
-- SH.1-SH.5 legitimately change, so this skeleton pins the census PROPERTIES
-- that must hold through every slice, plus the exposures the census recorded
-- so their later closure is a visible diff rather than a silent drift:
--
--   1. `anon` holds zero explicit table privileges in `public` -- every
--      table-creating migration revokes it, and a future table that forgets
--      fails here by name.
--   2. `anon` carries zero explicit function grants in `public`.
--   3. `service_role` holds platform-default full DML on every public table
--      EXCEPT exactly `product_events` and `task_command_confirmations` --
--      both directions: the exception set cannot shrink silently (a grant
--      appearing on those two) and cannot grow silently (a revoke landing
--      anywhere else). This is also SH-EXPOSURE-001's "grant seen before the
--      revoke" baseline: `user_ai_credentials` and
--      `credential_validation_attempts` are on the full-DML side TODAY, so
--      SH.6's revoke must move them into the exception list here -- a
--      non-vacuous, named change, not a catalog read taken on faith.
--   4. Every user-owned table (runtime-enumerated, the drill's rule) has RLS
--      enabled AND forced -- the multitenant trust boundary, censused rather
--      than assumed, failing by name.
--
-- Recorded exposures, pinned as FACTS so the closing slice flips a named
-- assertion instead of hoping nobody notices:
--
--   5. `authenticated` can still INSERT `audit_logs` directly (census F-18);
--      UPDATE and DELETE are revoked. Dispositioned by SH-EXPOSURE-003 in
--      SH.6 -- when that lands, the INSERT pin below flips with it.
--   6. `handle_new_user` retains default PUBLIC EXECUTE (census F-19), so
--      `anon` can technically EXECUTE it today. SH-EXPOSURE-004 revokes it in
--      SH.1 -- this pin flips there. Property 2 above uses EXPLICIT grants
--      precisely so this PUBLIC-inherited case is carried by its own named
--      assertion instead of hiding property 2's meaning.
--
-- Written in pure ASCII, following `signup_hardening_cascade_drill.sql`.

begin;
select plan(9);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Property 0 -- the census enumerates the whole schema (1)
-- ---------------------------------------------------------------------------
--
-- 42 public base tables at head 202608010069 (41 user-owned + ai_model_pricing).
-- A floor, not a pin: later slices add tables, and the properties below cover
-- them the moment they exist.

select cmp_ok(
  (
    select count(*)::int
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  ),
  '>=',
  42,
  'the census enumerates at least the 42 public base tables the findings recorded'
);

-- ---------------------------------------------------------------------------
-- Property 1 -- anon holds zero explicit table privileges in public (1)
-- ---------------------------------------------------------------------------

select is(
  (
    select coalesce(string_agg(distinct table_name, ', ' order by table_name), '')
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
  ),
  '',
  'anon holds zero explicit table privileges on any public table -- offenders are named'
);

-- ---------------------------------------------------------------------------
-- Property 2 -- anon carries zero explicit function grants in public (1)
-- ---------------------------------------------------------------------------
--
-- Explicit ACL entries only: a function whose acl is NULL (default) grants
-- PUBLIC execute implicitly, and that case is exposure 6 below, carried by
-- name rather than folded in here.

select is(
  (
    select coalesce(string_agg(distinct proc.proname, ', ' order by proc.proname), '')
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = proc.pronamespace
    cross join lateral aclexplode(proc.proacl) as acl
    where namespace.nspname = 'public'
      and acl.grantee = 'anon'::regrole::oid
  ),
  '',
  'no public function carries an explicit grant to anon -- offenders are named'
);

-- ---------------------------------------------------------------------------
-- Property 3 -- the service_role full-DML exception set, both directions (2)
-- ---------------------------------------------------------------------------

create function pg_temp.sh_service_role_gaps()
returns text
language plpgsql
as $gaps$
declare
  scanned record;
  gaps text[] := array[]::text[];
begin
  for scanned in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    if not (
      has_table_privilege('service_role', format('public.%I', scanned.table_name), 'select')
      and has_table_privilege('service_role', format('public.%I', scanned.table_name), 'insert')
      and has_table_privilege('service_role', format('public.%I', scanned.table_name), 'update')
      and has_table_privilege('service_role', format('public.%I', scanned.table_name), 'delete')
    ) then
      gaps := gaps || scanned.table_name;
    end if;
  end loop;

  return array_to_string(gaps, ', ');
end;
$gaps$;

select is(
  pg_temp.sh_service_role_gaps(),
  'product_events, task_command_confirmations',
  'service_role lacks full DML on exactly the two ledgers the census recorded -- the exception set can neither shrink nor grow silently'
);

-- The SH-EXPOSURE-001 baseline, named: the BYOK tables are on the full-DML
-- side today. SH.6's revoke moves them into the exception list above, and
-- this assertion flips in the same commit -- the "grant seen before revoked"
-- half of a non-vacuous revoke proof.
select ok(
  has_table_privilege('service_role', 'public.user_ai_credentials', 'select')
  and has_table_privilege('service_role', 'public.credential_validation_attempts', 'select'),
  'RECORDED EXPOSURE (census sec. 3.5): service_role still reads the BYOK tables -- revoked by SH-EXPOSURE-001 in SH.6'
);

-- ---------------------------------------------------------------------------
-- Property 4 -- RLS enabled and forced on every user-owned table (1)
-- ---------------------------------------------------------------------------

select is(
  (
    select coalesce(string_agg(class.relname, ', ' order by class.relname), '')
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relkind = 'r'
      and exists (
        select 1
        from information_schema.columns as columns
        where columns.table_schema = 'public'
          and columns.table_name = class.relname
          and columns.column_name = 'user_id'
      )
      and not (class.relrowsecurity and class.relforcerowsecurity)
  ),
  '',
  'every runtime-enumerated user-owned table has RLS enabled AND forced -- offenders are named'
);

-- ---------------------------------------------------------------------------
-- Recorded exposures, pinned by name (3)
-- ---------------------------------------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.audit_logs', 'insert'),
  'RECORDED EXPOSURE (census F-18): authenticated can still INSERT audit_logs directly -- dispositioned by SH-EXPOSURE-003 in SH.6'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_logs', 'update')
  and not has_table_privilege('authenticated', 'public.audit_logs', 'delete'),
  'audit_logs stays append-only for clients: authenticated holds neither UPDATE nor DELETE'
);

select ok(
  has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  'RECORDED EXPOSURE (census F-19): handle_new_user retains default PUBLIC execute -- revoked by SH-EXPOSURE-004 in SH.1'
);

select * from finish();
rollback;
