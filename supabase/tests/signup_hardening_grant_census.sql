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
--   3. The migration chain grants `service_role` ZERO table-level DML in
--      `public` -- its every capability is an EXECUTE on a SECURITY DEFINER
--      RPC. Asserted as explicit ACL entries (by name), because the platform
--      posture differs by environment and the chain is what this suite can
--      version: the hosted project's PLATFORM DEFAULTS layer full DML on top
--      (FINDINGS sec. 3.5 measured it; sec. 12.3 records that CI cannot), and
--      THAT layer is what SH-EXPOSURE-001 revokes in SH.6, proven there by a
--      migration postcondition (denial is provable in every posture) plus a
--      hosted readback. The first cut of this file pinned the hosted fact
--      ("full DML everywhere except two ledgers") and CI correctly refused
--      it: in the local stack the defaults never fired and `service_role`
--      holds nothing anywhere. The census now pins the chain's truth, which
--      is the stronger statement.
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
-- Property 3 -- the chain grants service_role zero table-level DML (2)
-- ---------------------------------------------------------------------------
--
-- Explicit ACL entries, not has_table_privilege: the effective posture
-- depends on platform defaults that differ between the local stack and the
-- hosted project, and the chain's own grants are the fact this suite can
-- version. A migration that grants service_role direct DML on any table
-- fails here by name and needs the SH-ADMIN/SH-EXPOSURE reasoning on record.

select is(
  (
    select coalesce(string_agg(distinct table_name, ', ' order by table_name), '')
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'service_role'
  ),
  '',
  'the migration chain grants service_role zero table-level DML in public -- every capability is a DEFINER RPC; offenders are named'
);

-- The two RPC-only ledgers, denied by explicit revoke in their own
-- migrations. Locally this is indistinguishable from never-granted; on the
-- hosted project the revoke is what beats the platform default. Named here so
-- SH.6's full matrix inherits the pins, and so a re-grant on either ledger is
-- a named failure in every environment.
select ok(
  not has_table_privilege('service_role', 'public.product_events', 'select')
  and not has_table_privilege('service_role', 'public.product_events', 'insert')
  and not has_table_privilege('service_role', 'public.task_command_confirmations', 'insert')
  and not has_table_privilege('service_role', 'public.task_command_confirmations', 'update')
  and not has_table_privilege('service_role', 'public.task_command_confirmations', 'delete'),
  'the two RPC-only ledgers deny service_role -- the explicit-revoke posture their migrations declared'
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
