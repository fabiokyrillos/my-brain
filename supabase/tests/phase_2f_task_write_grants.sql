-- Phase 2F Slice 2F.4 — the task/reminder grant posture after revocation
-- (2F-REVOKE-004, 2F-REVOKE-002, 2F-REVOKE-006), migration 202607300063.
--
-- This file is the executable half of the revocation. The migration's own
-- post-deploy block asserts the catalog state at apply time; this suite asserts
-- it again from zero on every CI run, and then does the two things a catalog
-- read cannot: it proves the denial *behaviourally*, and it proves the denial is
-- **caused by the missing privilege** rather than by RLS, a missing row or a
-- broken fixture.
--
-- WHY NON-VACUITY NEEDS ITS OWN SECTION
-- ---------------------------------------------------------------------------
-- A denial test is the easiest thing in this repository to fake. `insert into
-- public.tasks` failing proves nothing on its own — it fails just as readily if
-- the fixture user does not exist, if the row is owned by someone else, or if a
-- policy rejects it. PRD 2F-REVOKE-004 therefore requires the same run to
-- establish the pre-revocation state first.
--
-- The pre-revocation state is reconstructible **exactly**, because it is
-- versioned: `202607160003:185-196` runs a `DO` loop over an array containing
-- 'tasks' issuing `grant select, insert, update, delete on public.%I to
-- authenticated`, and `202607160007:155-163` does the same for 'reminders'.
-- PRD Revision 4 claimed no such grant existed and that the privileges came from
-- Supabase's platform defaults; **Revision 4.2 corrects that** (owner decision
-- A1). Section 5 below re-issues precisely those grants inside this
-- transaction, proves the previously-refused write now succeeds, re-revokes, and
-- proves it is refused again. Everything rolls back.
--
-- That is a stronger proof than the platform-default framing allowed: the
-- privilege under test is one this repository grants and this repository
-- removes, so the experiment is fully determined by the migration chain.
--
-- WHAT THIS SUITE CANNOT PROVE, STATED RATHER THAN IMPLIED
-- ---------------------------------------------------------------------------
-- **Write-side RLS on `public.tasks` is no longer testable from a client role.**
-- The grant check runs before any policy is consulted, so after the revocation
-- no `authenticated` statement can reach `tasks_insert_own`/`_update_own`/
-- `_delete_own` at all. Those policies still exist — deliberately retained, not
-- dropped (owner decision A5) — but they are unreachable by direct client DML.
-- The compensating evidence is in section 4: read-side RLS proven in both
-- directions (the owner sees their row, a stranger's row is absent), plus the
-- RPC-boundary denial that `phase_2e_task_command_apply.sql` already proves by
-- raising `P0002` for another owner's task.
--
-- Written in pure ASCII, following the doctrine of
-- `phase_2e_task_command_matching.sql`.

begin;
select plan(28);

set local timezone to 'UTC';

-- Fixtures -------------------------------------------------------------------
--
-- Two owners, because every denial assertion below would be satisfiable by an
-- empty database and section 4's read-side RLS proof needs a foreign row that
-- provably exists.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2f400001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'grants-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2f400002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'grants-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.tasks (id, user_id, title, status) values
  ('2f410001-0000-4000-8000-000000000001', '2f400001-0000-4000-8000-000000000001',
   'Owner task under grant test', 'todo'),
  ('2f410002-0000-4000-8000-000000000002', '2f400002-0000-4000-8000-000000000002',
   'Stranger task under grant test', 'todo');

insert into public.reminders (id, user_id, task_id, title, remind_at, status) values
  ('2f420001-0000-4000-8000-000000000001', '2f400001-0000-4000-8000-000000000001',
   '2f410001-0000-4000-8000-000000000001', 'Owner reminder under grant test',
   now() + interval '2 days', 'scheduled');

-- The entry and interpretation section 6 confirms through the deployed
-- SECURITY DEFINER materialization family. The candidate carries a due date on
-- purpose: that is what makes `create_due_task_reminder` fire.
--
-- The owner identity is established HERE, before the fixture call, and not at
-- the `set local role authenticated` in section 3. `persist_entry_interpretation`
-- is SECURITY DEFINER and derives its `current_user_id` from `auth.uid()`,
-- raising `Authentication required` when the claim is absent -- so the fixture
-- fails at parse-plan time with zero assertions run if the claim arrives later.
-- Setting it while still running as the owning role is exactly what
-- `phase_2c_slice_5_task_graph.sql:147-148` does for the same call. The role and
-- the claim are independent: `set local role` changes who Postgres thinks is
-- executing, `request.jwt.claims` changes who Supabase's `auth.uid()` reports,
-- and section 3 re-asserts the same value when it switches role.
select set_config(
  'request.jwt.claims',
  '{"sub":"2f400001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.entries (id, user_id, original_content, source, status, locale) values (
  '2f430001-0000-4000-8000-000000000001',
  '2f400001-0000-4000-8000-000000000001',
  'Phase 2F.4 definer-path fixture', 'web', 'saved', 'en'
);

select public.persist_entry_interpretation(
  '2f430001-0000-4000-8000-000000000001',
  jsonb_build_object(
    'summary', 'Phase 2F.4 grant fixture',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    -- A fixed ISO-8601 instant with an explicit offset, not `now() + interval`.
    -- `::text` on a timestamptz renders a space separator rather than `T`, and
    -- the candidate-edit validator's own due-date pattern requires `T`
    -- (`202607220044:373`). Pinning a literal keeps this fixture's shape
    -- identical whichever path reads it, and keeps the instant deterministic.
    'taskCandidates', jsonb_build_array(jsonb_build_object(
      'title', 'Definer path candidate with a due date',
      'description', null,
      'dueAt', '2026-12-01T09:00:00+00:00',
      'waitingOn', null,
      'parentIndex', null,
      'confidence', 0.9
    )),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test', 'strategy-1', 'prompt-1', 100, 50
);

-- ---------------------------------------------------------------------------
-- Section 1 — the catalog posture the migration produced (8)
-- ---------------------------------------------------------------------------
--
-- Read first, so a privilege drift is reported as itself rather than as a
-- cascade of behavioural failures.

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.tasks', 'insert'),
  'authenticated holds no INSERT on public.tasks'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.tasks', 'update'),
  'authenticated holds no UPDATE on public.tasks'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.tasks', 'delete'),
  'authenticated holds no DELETE on public.tasks'
);

-- Asserted positively and separately: a revocation that took SELECT with it
-- would break every projection in the product while all three denials above
-- still passed.
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.tasks', 'select'),
  'authenticated keeps SELECT on public.tasks, which every projection needs'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'update'),
  'authenticated holds no UPDATE on public.reminders (2F-REMINDER-003)'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'delete'),
  'authenticated holds no DELETE on public.reminders (2F-REMINDER-003)'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'select'),
  'authenticated keeps SELECT on public.reminders'
);

-- The Option C exception. If this ever fails, `createReminder` is broken in
-- production, and it is the one grant Phase 2F deliberately did not remove.
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'insert'),
  'authenticated keeps INSERT on public.reminders, the documented Option C exception'
);

-- ---------------------------------------------------------------------------
-- Section 2 — anon still holds nothing (2)
-- ---------------------------------------------------------------------------
--
-- `202607160003:196` and `202607160007:163` revoked everything from anon at
-- table-creation time. 2F-REVOKE-006 says no grant widens anywhere in this
-- phase, and a revocation migration is exactly where an accidental `to public`
-- would hide.

select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where pg_catalog.has_table_privilege('anon', 'public.tasks', privilege)
  ),
  'anon holds no privilege of any kind on public.tasks'
);
select ok(
  not exists (
    select 1 from unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where pg_catalog.has_table_privilege('anon', 'public.reminders', privilege)
  ),
  'anon holds no privilege of any kind on public.reminders'
);

-- ---------------------------------------------------------------------------
-- Section 3 — the denial, behaviourally, as the real client role (5)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"2f400001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Every statement below targets a row the caller *owns*. That is the point: RLS
-- would have permitted all five before the revocation, so what refuses them now
-- is the grant and nothing else.

select throws_ok(
  $$ insert into public.tasks (user_id, title)
     values ('2f400001-0000-4000-8000-000000000001', 'Task the client may no longer create') $$,
  '42501',
  'permission denied for table tasks',
  'a client-role INSERT on public.tasks is refused after revocation'
);

select throws_ok(
  $$ update public.tasks set status = 'in_progress'
     where id = '2f410001-0000-4000-8000-000000000001' $$,
  '42501',
  'permission denied for table tasks',
  'a client-role UPDATE on its own task is refused -- the legacy persistTaskStatus shape'
);

select throws_ok(
  $$ delete from public.tasks where id = '2f410001-0000-4000-8000-000000000001' $$,
  '42501',
  'permission denied for table tasks',
  'a client-role DELETE on its own task is refused'
);

select throws_ok(
  $$ update public.reminders set remind_at = now() + interval '3 days'
     where id = '2f420001-0000-4000-8000-000000000001' $$,
  '42501',
  'permission denied for table reminders',
  'a client-role UPDATE on its own reminder is refused'
);

select throws_ok(
  $$ delete from public.reminders where id = '2f420001-0000-4000-8000-000000000001' $$,
  '42501',
  'permission denied for table reminders',
  'a client-role DELETE on its own reminder is refused'
);

-- ---------------------------------------------------------------------------
-- Section 4 — what survives, and the read-side RLS that compensates (4)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.tasks
   where id = '2f410001-0000-4000-8000-000000000001'),
  1,
  'the owner still reads their own task, so SELECT survived the revocation'
);

-- The compensating half of the evidence 2F-REVOKE-004 names. Write-side RLS on
-- `tasks` is unreachable now; read-side RLS is not, and it is asserted in the
-- non-vacuous direction -- the stranger's row provably exists (it was inserted
-- above as postgres) and is provably absent from this caller's view.
select is(
  (select count(*)::integer from public.tasks
   where id = '2f410002-0000-4000-8000-000000000002'),
  0,
  'the stranger task exists but is absent from the owner''s reads, so RLS still scopes SELECT'
);

-- The Option C exception, exercised rather than asserted from the catalog. This
-- is the exact shape `createReminder` writes: an owner-scoped, task-less row.
select lives_ok(
  $$ insert into public.reminders (user_id, title, remind_at, important)
     values ('2f400001-0000-4000-8000-000000000001',
             'Independent reminder through the retained grant',
             now() + interval '1 day', false) $$,
  'the retained INSERT grant still lets a client author an independent reminder'
);

select is(
  (select count(*)::integer from public.reminders
   where user_id = '2f400001-0000-4000-8000-000000000001'
     and task_id is null),
  1,
  'and that independent reminder is readable by its owner'
);

-- ---------------------------------------------------------------------------
-- Section 5 — non-vacuity: the denial is privilege-caused (4)
-- ---------------------------------------------------------------------------
--
-- Re-issue the exact grants the migration chain issued, inside this
-- transaction, and watch the refusals from section 3 turn into successes. Then
-- re-revoke and watch them refuse again. If any assertion here fails, section 3
-- was proving something other than the privilege -- which is the failure mode
-- 2F-REVOKE-004 exists to exclude.

reset role;
grant insert, update, delete on public.tasks to authenticated;
grant update, delete on public.reminders to authenticated;
set local role authenticated;

select lives_ok(
  $$ update public.tasks set status = 'in_progress'
     where id = '2f410001-0000-4000-8000-000000000001' $$,
  'with the chain-issued grant restored, the same task UPDATE succeeds'
);

select lives_ok(
  $$ update public.reminders set remind_at = now() + interval '3 days'
     where id = '2f420001-0000-4000-8000-000000000001' $$,
  'with the chain-issued grant restored, the same reminder UPDATE succeeds'
);

reset role;
revoke insert, update, delete on public.tasks from authenticated;
revoke update, delete on public.reminders from authenticated;
set local role authenticated;

select throws_ok(
  $$ update public.tasks set status = 'waiting'
     where id = '2f410001-0000-4000-8000-000000000001' $$,
  '42501',
  'permission denied for table tasks',
  'and revoking again refuses it again, so the privilege is the only variable'
);

select throws_ok(
  $$ update public.reminders set important = true
     where id = '2f420001-0000-4000-8000-000000000001' $$,
  '42501',
  'permission denied for table reminders',
  'the same round trip holds for the reminder UPDATE'
);

-- ---------------------------------------------------------------------------
-- Section 6 — the surviving write shape, end to end (3)
-- ---------------------------------------------------------------------------
--
-- 2F-REVOKE-002. `public.create_due_task_reminder` is `security invoker` and
-- fires `after insert on public.tasks`. Before the revocation a client INSERT
-- ran it as `authenticated`; after it, no client INSERT exists at all, so the
-- trigger only ever runs inside a SECURITY DEFINER body and therefore as that
-- function's owner.
--
-- Proven through a deployed contract rather than a synthetic one:
-- `confirm_entry_task_candidates_v6` is SECURITY DEFINER, is granted to
-- `authenticated`, and is one of the writers PRD §2 enumerates. The caller below
-- holds no INSERT on `public.tasks` -- section 3 just proved that -- and the row
-- lands anyway.

select is(
  (
    select public.confirm_entry_task_candidates_v6(
      '2f430001-0000-4000-8000-000000000001',
      (select current_interpretation_id from public.entries
       where id = '2f430001-0000-4000-8000-000000000001'),
      '[{"candidateIndex":0,"disposition":"confirmed"}]'::jsonb,
      '[]'::jsonb,
      'pgtap:2f4:definer-path'
    ) ->> 'idempotent'
  ),
  'false',
  'a caller with no INSERT privilege still materializes a task through the definer contract'
);

select is(
  (select count(*)::integer from public.tasks
   where source_entry_id = '2f430001-0000-4000-8000-000000000001'
     and candidate_index = 0),
  1,
  'the task row exists, written by the definer body rather than by the caller'
);

-- The trigger's own output. `create_due_task_reminder` inserted this row while
-- executing as the definer's owner; the caller could not have written it, and
-- after this slice no caller ever will.
select is(
  (
    select count(*)::integer from public.reminders reminder
    join public.tasks task on task.id = reminder.task_id
    where task.source_entry_id = '2f430001-0000-4000-8000-000000000001'
      and reminder.status = 'scheduled'
  ),
  1,
  'and create_due_task_reminder still fired inside that definer path, creating one scheduled reminder'
);

-- ---------------------------------------------------------------------------
-- Section 7 — the trigger's security context is what makes section 6 true (1)
-- ---------------------------------------------------------------------------
--
-- Asserted rather than assumed: silently promoting the trigger function to
-- SECURITY DEFINER would make section 6 pass for the wrong reason, by working
-- regardless of who inserted the task.

reset role;
select is(
  (select prosecdef from pg_catalog.pg_proc procedure
   join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public' and procedure.proname = 'create_due_task_reminder'),
  false,
  'create_due_task_reminder is still SECURITY INVOKER, so section 6 proves the definer caller and not the trigger'
);

-- ---------------------------------------------------------------------------
-- Section 8 — the cascades the Phase 2F cleanup verifier reasons from (1)
-- ---------------------------------------------------------------------------
--
-- Added by Slice 2F.6 (2F-OPERATIONS-004), read-only, and here rather than in a
-- new file because the closeout slice ships no new SQL artifact.
--
-- WHY IT EXISTS. `scripts/verify-phase-2f-cleanup.mjs` reports that an orphan row
-- is *structurally impossible* in every table it scans, and therefore that its
-- zero orphan count detects only a dropped or NOT VALID foreign key rather than
-- measuring residue. It also proves `product_events` row absence after an
-- owner's deletion as a composition — an asserted service_role refusal, plus
-- zero surviving fixture owners, plus this cascade — because no credential this
-- repository holds can read that table.
--
-- Both claims rest on `user_id references auth.users(id) on delete cascade`. Read
-- from the catalog, that is a fact; written in a comment, it is prose. This
-- assertion is what keeps the verifier's own account of itself true: dropping or
-- weakening one of these keys reds CI instead of silently turning a closeout
-- report into a claim.
--
-- `confdeltype = 'c'` is CASCADE; `convalidated` excludes a key added NOT VALID,
-- which would enforce nothing for rows that already exist.

reset role;
with scanned(table_name) as (
  values
    ('entries'), ('entry_interpretations'), ('jobs'), ('attachments'),
    ('pending_questions'), ('tasks'), ('projects'), ('contexts'), ('people'),
    ('task_projects'), ('task_contexts'), ('task_people'), ('task_dependencies'),
    ('entry_task_candidate_resolutions'), ('reminders'), ('undo_operations'),
    ('ai_usage_events'), ('task_command_confirmations'), ('product_events')
),
cascading as (
  select scanned.table_name
  from scanned
  join pg_catalog.pg_class relation
    on relation.relname = scanned.table_name
   and relation.relnamespace = 'public'::regnamespace
  join pg_catalog.pg_constraint constraint_row
    on constraint_row.conrelid = relation.oid
   and constraint_row.contype = 'f'
   and constraint_row.confrelid = 'auth.users'::regclass
   and constraint_row.confdeltype = 'c'
   and constraint_row.convalidated
   and constraint_row.conkey = array[
         (select attribute.attnum
            from pg_catalog.pg_attribute attribute
           where attribute.attrelid = relation.oid
             and attribute.attname = 'user_id')
       ]::smallint[]
)
select is(
  (select count(distinct table_name)::integer from cascading),
  (select count(*)::integer from scanned),
  'every table the Phase 2F cleanup verifier scans still carries a validated user_id -> auth.users ON DELETE CASCADE, which is what makes its orphan count a foreign-key regression check rather than a residue measurement'
);

select * from finish();
rollback;
