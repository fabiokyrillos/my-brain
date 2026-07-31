-- Entity Graph Completion, Slice EGC.1 -- the database posture the new write
-- path stands on (EGC-INVARIANT-002, EGC-AUDIT-001/003/004, gates A2, A5, A7).
--
-- WHAT THIS FILE IS FOR
-- ---------------------------------------------------------------------------
-- EGC.1 gave `public.organizations` and `public.contexts` their first
-- application write path. It added **no migration**, so the claim it has to
-- support is a negative one: nothing about the database changed. A negative
-- claim is the easiest kind to assert vacuously, so every section below asserts
-- a known-present fact first and only then asserts the absence.
--
-- Both tables were created by `202607160003:1-20` and were given forced RLS,
-- four own-row policies, full `authenticated` CRUD and a full `anon` revocation
-- by the `DO` loop at `202607160003:182-199`. Until this slice only
-- `persist_entry_interpretation` (`202607160005`) ever wrote them -- which is
-- the whole reason the Company selector could report emptiness while owning no
-- way to fix it (`EG-04`).
--
-- WHY THE GRANTS ARE ASSERTED AS PRESENT RATHER THAN AS UNCHANGED
-- ---------------------------------------------------------------------------
-- "Byte-identical to the pre-slice catalog" is not directly expressible in
-- pgTAP: there is no pre-slice catalog to compare against inside one
-- transaction. What *is* expressible, and is the same claim, is that the exact
-- posture the migration chain issued is the posture that exists now -- all four
-- privileges for `authenticated`, none for `anon`, forced RLS, and the four
-- named own-row policies. A slice that had widened anything would fail one of
-- these; a slice that had narrowed anything would fail another.
--
-- Written in pure ASCII, following the doctrine of
-- `phase_2f_task_write_grants.sql`.

begin;
select plan(26);

set local timezone to 'UTC';

-- Fixtures -------------------------------------------------------------------
--
-- Two owners, because gate A5 is an isolation claim and an isolation claim over
-- one owner is satisfiable by an empty table.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e6c00001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'egc-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6c00002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'egc-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, user_id, name, description) values
  ('e6c10001-0000-4000-8000-000000000001', 'e6c00001-0000-4000-8000-000000000001',
   'Owner company', 'Belongs to the owner'),
  ('e6c10002-0000-4000-8000-000000000002', 'e6c00002-0000-4000-8000-000000000002',
   'Stranger company', 'Belongs to somebody else');

insert into public.contexts (id, user_id, name, kind) values
  ('e6c20001-0000-4000-8000-000000000001', 'e6c00001-0000-4000-8000-000000000001',
   'Owner context', 'personal'),
  ('e6c20002-0000-4000-8000-000000000002', 'e6c00002-0000-4000-8000-000000000002',
   'Stranger context', 'work');

-- ---------------------------------------------------------------------------
-- Section 1 -- the grants the chain issued are exactly the grants that exist (6)
-- ---------------------------------------------------------------------------
--
-- EGC-INVARIANT-002. Read before anything behavioural, so a privilege drift is
-- reported as itself rather than as a cascade of failing writes.

select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where not pg_catalog.has_table_privilege('authenticated', 'public.organizations', privilege)
  ),
  'authenticated still holds all four privileges on public.organizations, as 202607160003 granted'
);

select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where not pg_catalog.has_table_privilege('authenticated', 'public.contexts', privilege)
  ),
  'authenticated still holds all four privileges on public.contexts, as 202607160003 granted'
);

-- The other direction. EGC.1 revoked nothing and widened nothing, and `anon` is
-- where an accidental widening would hide.
select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where pg_catalog.has_table_privilege('anon', 'public.organizations', privilege)
  ),
  'anon holds no privilege of any kind on public.organizations'
);
select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where pg_catalog.has_table_privilege('anon', 'public.contexts', privilege)
  ),
  'anon holds no privilege of any kind on public.contexts'
);

-- `service_role` is asserted too, because EGC.1 introduced no privileged
-- boundary of any kind: no RPC, no definer function, no worker path. If a later
-- slice reaches for one, this is where the change becomes visible.
select is(
  (select count(*)::integer
     from pg_catalog.pg_proc procedure
     join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and procedure.proname in (
        'create_organization', 'update_organization', 'create_context', 'update_context'
      )),
  0,
  'EGC.1 introduced no SECURITY DEFINER function for either table -- the write path is plain RLS-scoped DML'
);

select is(
  (select count(*)::integer
     from pg_catalog.pg_class relation
    where relation.relnamespace = 'public'::regnamespace
      and relation.relname in ('organizations', 'contexts')
      and relation.relrowsecurity
      and relation.relforcerowsecurity),
  2,
  'both tables still have row level security enabled AND forced, so the owner cannot bypass their own policies'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the four own-row policies, by name, on both tables (2)
-- ---------------------------------------------------------------------------
--
-- Named rather than counted: four policies with the right count and the wrong
-- commands would pass a count and fail the product.

select is(
  (select string_agg(policyname, ', ' order by policyname)
     from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'organizations'),
  'organizations_delete_own, organizations_insert_own, organizations_select_own, organizations_update_own',
  'public.organizations still carries exactly its four own-row policies, unchanged by EGC.1'
);

select is(
  (select string_agg(policyname, ', ' order by policyname)
     from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'contexts'),
  'contexts_delete_own, contexts_insert_own, contexts_select_own, contexts_update_own',
  'public.contexts still carries exactly its four own-row policies, unchanged by EGC.1'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the column bounds the Zod schemas mirror (4)
-- ---------------------------------------------------------------------------
--
-- `schema.ts` claims its bounds "mirror a column constraint rather than a UI
-- preference, so a value this accepts is a value the database accepts". These
-- are the database half of that claim, and the 120-vs-160 split is the one most
-- likely to be got wrong by reusing a shared constant.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e6c00001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$ insert into public.contexts (user_id, name, kind)
     values ('e6c00001-0000-4000-8000-000000000001', repeat('x', 120), 'work') $$,
  'a 120-character context name is accepted, which is the bound contextName mirrors'
);

select throws_ok(
  $$ insert into public.contexts (user_id, name, kind)
     values ('e6c00001-0000-4000-8000-000000000001', repeat('x', 121), 'work') $$,
  '23514',
  null::text,
  'a 121-character context name is refused -- reusing the 160 bound would send this refusal to the user unexplained'
);

select lives_ok(
  $$ insert into public.organizations (user_id, name)
     values ('e6c00001-0000-4000-8000-000000000001', repeat('y', 160)) $$,
  'a 160-character organization name is accepted, which is a different bound from the context one'
);

select throws_ok(
  $$ insert into public.contexts (user_id, name, kind)
     values ('e6c00001-0000-4000-8000-000000000001', 'Bad kind', 'family') $$,
  '23514',
  null::text,
  'a kind outside the three the CHECK allows is refused, which is what contextCreateSchema turns into a sentence'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- gate A5: two owners, the positive count asserted first (6)
-- ---------------------------------------------------------------------------
--
-- The ordering is the point. "The stranger's row is absent" is satisfied by an
-- empty result set, a broken fixture or a failed connection. Asserting the
-- owner's own row present first is what makes the absence mean isolation.

select is(
  (select count(*)::integer from public.organizations
    where id = 'e6c10001-0000-4000-8000-000000000001'),
  1,
  'the owner reads their own organization'
);

select is(
  (select count(*)::integer from public.organizations
    where id = 'e6c10002-0000-4000-8000-000000000002'),
  0,
  'and the stranger organization, which provably exists, is absent from the owner reads'
);

select is(
  (select count(*)::integer from public.contexts
    where id = 'e6c20001-0000-4000-8000-000000000001'),
  1,
  'the owner reads their own context'
);

select is(
  (select count(*)::integer from public.contexts
    where id = 'e6c20002-0000-4000-8000-000000000002'),
  0,
  'and the stranger context is absent from the owner reads'
);

-- The write side of the same claim. `updateOrganization` adds an explicit
-- `user_id` predicate on top of RLS; this proves the policy refuses the write
-- even with that predicate removed, which is what makes the predicate a belt to
-- RLS braces rather than the only control.
select is(
  (with attempted as (
     update public.organizations set name = 'Hijacked'
      where id = 'e6c10002-0000-4000-8000-000000000002'
      returning 1
   )
   select count(*)::integer from attempted),
  0,
  'an UPDATE aimed at the stranger organization with no user_id predicate changes nothing -- RLS is the boundary'
);

-- And it is still there, read back as the role that can see it. Without this the
-- assertion above would also pass if the UPDATE had deleted the row.
reset role;
select is(
  (select name from public.organizations
    where id = 'e6c10002-0000-4000-8000-000000000002'),
  'Stranger company',
  'and the stranger row still holds its own name, so the refused UPDATE changed nothing rather than partially applying'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- gate A7: the audit rows the actions write (5)
-- ---------------------------------------------------------------------------
--
-- `entities/actions.ts` writes `audit_logs` as the client role through the plain
-- table, not through an RPC. That is only sound while `authenticated` holds
-- INSERT on it and the insert policy scopes rows to the writer -- both asserted
-- here, because an audit row the caller could forge for somebody else would make
-- the whole ledger untrustworthy rather than merely incomplete.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e6c00001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.audit_logs', 'insert'),
  'authenticated holds INSERT on public.audit_logs, which is what lets the four actions write their own audit row'
);

select lives_ok(
  $$ insert into public.audit_logs
       (user_id, action_type, entity_type, entity_id, actor, after_state, reason)
     values ('e6c00001-0000-4000-8000-000000000001', 'create_organization', 'organization',
             'e6c10001-0000-4000-8000-000000000001', 'user',
             '{"name":"Owner company"}'::jsonb, 'Owner created an organization') $$,
  'the exact audit row createOrganization writes is accepted'
);

select throws_ok(
  $$ insert into public.audit_logs
       (user_id, action_type, entity_type, entity_id, actor, reason)
     values ('e6c00002-0000-4000-8000-000000000002', 'create_organization', 'organization',
             'e6c10002-0000-4000-8000-000000000002', 'user', 'Forged on another owner') $$,
  '42501',
  null::text,
  'and an audit row forged for another owner is refused by the insert policy, not merely unlikely'
);

select throws_ok(
  $$ insert into public.audit_logs
       (user_id, action_type, entity_type, entity_id, actor, reason)
     values ('e6c00001-0000-4000-8000-000000000001', 'create_context', 'context',
             'e6c20001-0000-4000-8000-000000000001', 'robot', 'Actor outside the check') $$,
  '23514',
  null::text,
  'the actor column is still closed at the database, so actor = user is a constraint rather than a convention'
);

-- Append-only, which is what makes an audit row evidence rather than a note.
-- `202607170016:194-196` dropped `audit_logs_update_own` and
-- `audit_logs_delete_own` and revoked both privileges; EGC.1 restored neither,
-- and this is where a restoration would become visible. Asserted from the
-- catalog because the client role cannot even reach a statement to test
-- behaviourally once the grant is gone.
reset role;
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.audit_logs', 'update')
  and not pg_catalog.has_table_privilege('authenticated', 'public.audit_logs', 'delete')
  and not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'audit_logs'
       and policyname in ('audit_logs_update_own', 'audit_logs_delete_own')
  ),
  'audit_logs is still append-only for authenticated -- no UPDATE or DELETE grant, and neither dropped policy came back'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- EGC-DEC-1: why no delete control was shipped (3)
-- ---------------------------------------------------------------------------
--
-- The PRD keeps deletion out of this initiative rather than ship a destructive
-- control over a cascade. That reasoning is only true while the cascades are
-- real, so it is read from the catalog instead of asserted in prose.
-- `confdeltype`: 'c' is CASCADE, 'n' is SET NULL.

select is(
  (select confdeltype::text from pg_catalog.pg_constraint
    where conrelid = 'public.person_contexts'::regclass
      and contype = 'f'
      and confrelid = 'public.contexts'::regclass),
  'c',
  'person_contexts still cascades from contexts, so a delete control would silently destroy associations'
);

select is(
  (select confdeltype::text from pg_catalog.pg_constraint
    where conrelid = 'public.task_contexts'::regclass
      and contype = 'f'
      and confrelid = 'public.contexts'::regclass),
  'c',
  'task_contexts cascades from contexts too, which is the second half of the EGC-DEC-1 reasoning'
);

select is(
  (select string_agg(distinct confdeltype::text, ',') from pg_catalog.pg_constraint
    where contype = 'f'
      and confrelid = 'public.organizations'::regclass
      and conrelid in ('public.people'::regclass, 'public.projects'::regclass)),
  'n',
  'people and projects only SET NULL from organizations, so an organization delete would quietly unlink rather than destroy -- still a change this slice does not make'
);

select * from finish();
rollback;
