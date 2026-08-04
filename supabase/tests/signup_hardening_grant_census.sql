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
--   3. Exactly three public tables carry ZERO grants of any kind to
--      `service_role`: the RPC-only ledgers whose migrations revoke it
--      explicitly (`product_events` at `202607170024:76`,
--      `task_command_confirmations` at `202607260059`, and
--      `account_deletion_log` at `202608040072` -- SH.2's own table joined the
--      set, and this assertion is what forced it to be declared rather than
--      arriving unnoticed). Pinned in both
--      directions on explicit-grant PRESENCE, because presence is what is
--      stable across environments: platform defaults grant `service_role`
--      privileges on every chain table (run `30904179153` measured 40 of 42
--      carrying grants in the CI stack), while WHICH privileges differ
--      between the local stack and the hosted project (run `30903589273`
--      measured that no local table gives it the full four-DML set, where
--      FINDINGS sec. 3.5 measured full DML on the hosted project -- the
--      sec. 12.3 divergence, live). The chain-versioned fact is the revoke
--      carve-out, so that is the pin; the per-privilege matrix is SH.6's
--      (SH-EXPOSURE-002 full form), proven beside the SH-EXPOSURE-001 revoke
--      with its hosted readback. Two earlier cuts of this assertion pinned an
--      environment-specific posture and CI refused both -- recorded in the
--      SH.0 acceptance report, kept here so nobody restores either.
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
--   6. `handle_new_user` retained default PUBLIC EXECUTE at SH.0 (census
--      F-19). SH-EXPOSURE-004 revoked it in SH.1 (`202608040070`), and the
--      pin below now asserts the CLOSED state. Property 2 above uses EXPLICIT
--      grants precisely so this PUBLIC-inherited case is carried by its own
--      named assertion instead of hiding property 2's meaning.
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
-- Property 3 -- the service_role revoke carve-out, both directions (2)
-- ---------------------------------------------------------------------------
--
-- Explicit-grant PRESENCE, not has_table_privilege: which privileges the
-- platform grants by default differs by environment, but a table carrying
-- zero service_role ACL entries is a table whose migration revoked it, and
-- that set is chain-versioned. Both directions: a re-grant on either ledger
-- shrinks the set (named failure), and a future RPC-only table must join the
-- expected list by name in its own slice.

select is(
  (
    select coalesce(string_agg(tables.table_name, ', ' order by tables.table_name), '')
    from information_schema.tables as tables
    where tables.table_schema = 'public'
      and tables.table_type = 'BASE TABLE'
      and not exists (
        select 1
        from information_schema.role_table_grants as grants
        where grants.table_schema = 'public'
          and grants.table_name = tables.table_name
          and grants.grantee = 'service_role'
      )
  ),
  'account_deletion_log, product_events, task_command_confirmations',
  'exactly the three RPC-only ledgers carry zero service_role grants -- the chain''s revoke carve-out can neither shrink nor grow silently'
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
  and not has_table_privilege('service_role', 'public.task_command_confirmations', 'delete')
  and not has_table_privilege('service_role', 'public.account_deletion_log', 'insert')
  and not has_table_privilege('service_role', 'public.account_deletion_log', 'select'),
  'the three RPC-only ledgers deny service_role -- the explicit-revoke posture their migrations declared'
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
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'F-19 CLOSED by SH-EXPOSURE-004 (202608040070): handle_new_user is executable by no client role; the trigger still fires as owner'
);

select * from finish();
rollback;
