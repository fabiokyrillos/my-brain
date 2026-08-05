-- Signup Hardening SH.0 -- the privileged-boundary census skeleton
-- (SH-EXPOSURE-002, gate SH-G0.3), executed.
--
-- NO LONGER A SKELETON, AS OF SH.6
-- ---------------------------------------------------------------------------
-- Property 5 at the bottom of this file is the FULL role-by-table matrix
-- SH-EXPOSURE-002 asked for, added once SH.6's revokes landed. The
-- service_role carve-out (Property 3) grew from four tables to six, and the
-- `audit_logs` exposure below is now dispositioned rather than merely recorded.
-- Everything above Property 5 is the original skeleton, unchanged.
--
-- WHAT A SKELETON WAS, AND WHAT IT WAS NOT
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
select plan(11);

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

-- SH.5 (`202608040075`, ADR-080) made this list non-empty for the first time,
-- and that is a decision rather than a drift, so the two functions are named.
--
-- Why `anon` at all: every event the auth throttle counts -- signup, recovery,
-- resend, sign-in failure -- happens BEFORE there is a session. The BYOK
-- pattern's `auth.uid()` identity is unavailable, and this application holds no
-- service-role client anywhere; ADR-080 declines to grow one, because removing
-- an anonymous INSERT path by installing an RLS-bypassing credential in the
-- Next.js runtime is a strictly worse trade.
--
-- What keeps it bounded: the identifier and IP hashes are HMAC'd under a pepper
-- that lives in the application environment and NOT in this database, so a
-- direct caller cannot compute the hash of an address it wants to attack. The
-- table itself grants nothing to anyone (Property 1 above still passes for it),
-- these two functions are its only path, and a claimed slot sends no mail,
-- creates no account and authenticates nobody.
--
-- A third name appearing here without an ADR is a finding.
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
  'claim_auth_event_slot, finalize_auth_event_attempt',
  'exactly the two pre-session throttle RPCs carry an explicit anon grant -- offenders are named'
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
  -- `auth_event_attempts` joins in SH.5 (`202608040075`): it is RPC-only in the
  -- strictest sense in this chain -- no role holds ANY table privilege on it,
  -- not even the two that can execute its functions -- and `service_role` is
  -- additionally denied EXECUTE on the claim, because a service-role path to a
  -- ceiling is a way around the ceiling.
  --
  -- `credential_validation_attempts` and `user_ai_credentials` join in SH.6
  -- (`202608050077`, SH-EXPOSURE-001). BYOK left `service_role` with table DML
  -- on both, which was a service key that could read every user's envelope with
  -- one `select *` -- T-26 exactly. The two callers that genuinely needed it are
  -- routed through `admin_credential_status` and
  -- `admin_list_credential_envelopes` instead of the closure being weakened.
  'account_deletion_log, auth_event_attempts, credential_validation_attempts, product_events, task_command_confirmations, user_ai_credentials',
  'exactly the six RPC-only ledgers carry zero service_role grants -- the chain''s revoke carve-out can neither shrink nor grow silently'
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
  'DISPOSITIONED (census F-18, ADR-081): the authenticated INSERT on audit_logs is RETAINED by decision -- append-only still holds, RLS confines every row to its own writer, and the writer inventory is guarded by src/lib/closeout/audit-log-writers.test.ts'
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

-- ---------------------------------------------------------------------------
-- Property 5 -- the full role-by-table matrix, as norm plus named exceptions (2)
-- ---------------------------------------------------------------------------
-- SH-EXPOSURE-002.
--
-- WHY NOT ONE ENORMOUS LITERAL
--
-- "Pin the full matrix" read literally means aggregating roughly four hundred
-- grant rows into one string and comparing it. That artifact is unreviewable,
-- and an unreviewable pin is one people regenerate rather than read -- which
-- makes it worse than nothing, because it converts a real drift into a diff
-- nobody looks at.
--
-- The matrix is instead expressed as it was actually designed: a NORM plus the
-- exceptions. `authenticated` holds SELECT, INSERT, UPDATE, DELETE on a
-- user-owned table, granted in bulk by 202607160003 and 202607160007, and every
-- deviation from that is a deliberate revoke in a named migration. The
-- assertion compares the deviation set, so a re-grant, a new revoke or a new
-- table with the wrong shape all fail BY TABLE AND BY PRIVILEGE, which is what
-- the requirement is actually for.
--
-- DML ONLY, AND THE FIRST CUT OF THIS ASSERTION IS WHY
--
-- The first version compared the whole privilege set and CI refused it, exactly
-- as it refused two earlier cuts of Property 3 (see the note there). The
-- measured reality is that `authenticated` also carries REFERENCES, TRIGGER and
-- TRUNCATE on most tables — not from anything in this chain, but from the
-- platform's default privileges, which is precisely the FINDINGS sec. 12.3
-- local/hosted divergence. Pinning those would produce an assertion that is
-- green in CI and says nothing true about production, which is the failure mode
-- Property 3's history is a monument to.
--
-- So the filter is `SELECT, INSERT, UPDATE, DELETE` — which is also what
-- SH-EXPOSURE-002 asks for in its own words ("which of the four roles holds
-- which DML"). Every revoke in this chain is a DML revoke, so nothing
-- chain-versioned is lost by ignoring the other three.
--
-- `anon` is covered by Property 1 (it must hold nothing anywhere).
-- `service_role` is covered by Property 3 by grant PRESENCE rather than by
-- privilege set, deliberately: which privileges the platform grants it by
-- default differs between a local `db reset` and the hosted project, so an
-- exact-set assertion would be green in CI and meaningless about production,
-- while "this table carries zero service_role ACL entries" is true in both.

select is(
  (
    select coalesce(string_agg(deviation, E'\n' order by deviation), '')
    from (
      select tables.table_name || ' -> ' || held.privileges as deviation
      from information_schema.tables as tables
      cross join lateral (
        select coalesce(
          (
            select string_agg(grants.privilege_type, ',' order by grants.privilege_type)
            from information_schema.role_table_grants as grants
            where grants.table_schema = 'public'
              and grants.table_name = tables.table_name
              and grants.grantee = 'authenticated'
              -- DML ONLY, and the reason is in the note above.
              and grants.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
          ),
          '(none)'
        ) as privileges
      ) as held
      where tables.table_schema = 'public'
        and tables.table_type = 'BASE TABLE'
        and held.privileges <> 'DELETE,INSERT,SELECT,UPDATE'
    ) as deviations
  ),
  -- Twenty-seven of the forty-six public base tables deviate from the norm, and
  -- every one of them deviates because a named migration said so. The five
  -- shapes, so a reader can check a line against an intent rather than against
  -- a memory:
  --
  --   (none)                 RPC-only: no client touches the table at all --
  --                          account_deletion_log, auth_event_attempts
  --   SELECT                 read-only to the client: it is written by an RPC,
  --                          a trigger or the platform -- account_lifecycle,
  --                          ai_model_pricing, ai_usage_events,
  --                          attachment_interpretations, entity_attachments,
  --                          entry_entities, entry_interpretations,
  --                          entry_task_candidate_resolutions, heartbeat_runs,
  --                          product_events, task_command_confirmations, tasks,
  --                          undo_operations
  --   INSERT,SELECT          append-only to the client -- attachments,
  --                          audit_logs (ADR-081's retained grant),
  --                          conversation_messages,
  --                          credential_validation_attempts, jobs,
  --                          policy_acceptances, reminders
  --   SELECT,UPDATE          the client may change state but not create or
  --                          destroy -- notifications, pending_questions
  --   no DELETE              everything else the client owns, minus the right
  --                          to erase history -- entry_embeddings, summaries,
  --                          user_ai_credentials (which additionally lost every
  --                          service_role grant in SH.6)
  --
  -- `entries` is deliberately NOT here: the original is protected by the
  -- `protect_entry_original` trigger rather than by a revoke, so its grant is
  -- the norm and the immutability lives one layer down. A line appearing for it
  -- would mean that trigger had been replaced by a grant change.
  E'account_deletion_log -> (none)\n'
  || E'account_lifecycle -> SELECT\n'
  || E'ai_model_pricing -> SELECT\n'
  || E'ai_usage_events -> SELECT\n'
  || E'attachment_interpretations -> SELECT\n'
  || E'attachments -> INSERT,SELECT\n'
  || E'audit_logs -> INSERT,SELECT\n'
  || E'auth_event_attempts -> (none)\n'
  || E'conversation_messages -> INSERT,SELECT\n'
  || E'credential_validation_attempts -> INSERT,SELECT\n'
  || E'entity_attachments -> SELECT\n'
  || E'entry_embeddings -> INSERT,SELECT,UPDATE\n'
  || E'entry_entities -> SELECT\n'
  || E'entry_interpretations -> SELECT\n'
  || E'entry_task_candidate_resolutions -> SELECT\n'
  || E'heartbeat_runs -> SELECT\n'
  || E'jobs -> INSERT,SELECT\n'
  || E'notifications -> SELECT,UPDATE\n'
  || E'pending_questions -> SELECT,UPDATE\n'
  || E'policy_acceptances -> INSERT,SELECT\n'
  || E'product_events -> SELECT\n'
  || E'reminders -> INSERT,SELECT\n'
  || E'summaries -> INSERT,SELECT,UPDATE\n'
  || E'task_command_confirmations -> SELECT\n'
  || E'tasks -> SELECT\n'
  || E'undo_operations -> SELECT\n'
  || E'user_ai_credentials -> INSERT,SELECT,UPDATE',
  'SH-EXPOSURE-002: the authenticated matrix is the norm plus exactly these named exceptions -- drift fails by table and by privilege'
);

-- The narrow replacements SH-EXPOSURE-001 introduced, so the closure cannot be
-- read as "the capability went away". It did not; it became three named
-- functions, and this is where their reachability is pinned.
select is(
  (
    select count(*)::int
    from unnest(array[
      'public.admin_credential_status(uuid)',
      'public.admin_list_credential_envelopes(integer, integer)',
      'public.admin_rewrap_credential_envelope(uuid, smallint, bytea, bytea, smallint)'
    ]) as signature
    where has_function_privilege('service_role', signature, 'execute')
      and not has_function_privilege('anon', signature, 'execute')
      and not has_function_privilege('authenticated', signature, 'execute')
  ),
  3,
  'SH-EXPOSURE-001: the three narrow replacements are reachable by the operator and by nobody else'
);

select * from finish();
rollback;
