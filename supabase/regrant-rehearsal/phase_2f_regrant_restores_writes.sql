-- Phase 2F Slice 2F.4 — the re-grant rehearsal (2F-REVOKE-003).
--
-- **This file is deliberately NOT in `supabase/tests/`.** The normal pgTAP suite
-- runs against the post-revocation posture and must keep doing so; this suite
-- runs only after `scripts/phase-2f-regrant-task-write-grants.sql` has been
-- applied, and it asserts the opposite posture. Putting it beside the others
-- would make one of the two suites fail no matter which posture the stack was
-- in, and — worse — could leave a reader unsure which posture the normal suite
-- had actually exercised. The CI `database` job runs this directory by name, as
-- its own step, after every other database gate has already completed.
--
-- WHAT THIS PROVES
-- ---------------------------------------------------------------------------
-- That the committed rollback SQL applies and restores the versioned
-- migration-chain privileges it names, such that writes refused under the
-- post-revocation posture succeed again.
--
-- WHAT IT DOES NOT PROVE
-- ---------------------------------------------------------------------------
--   * live PostgREST schema-cache convergence;
--   * in-flight session behaviour;
--   * an operational rollback against production.
--
-- Those are observable only in a deployment session against a live project, and
-- the 2F.4 session verifies them there. "Rehearsed in CI" is truthful only with
-- this scope attached, and the slice report states it in the same breath.

begin;
select plan(7);

set local timezone to 'UTC';

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '2f4e0001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'regrant-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.tasks (id, user_id, title, status) values
  ('2f4e1001-0000-4000-8000-000000000001', '2f4e0001-0000-4000-8000-000000000001',
   'Task the restored grant may move', 'todo'),
  ('2f4e1002-0000-4000-8000-000000000002', '2f4e0001-0000-4000-8000-000000000001',
   'Task the restored grant may delete', 'todo');

insert into public.reminders (id, user_id, task_id, title, remind_at, status) values (
  '2f4e2001-0000-4000-8000-000000000001', '2f4e0001-0000-4000-8000-000000000001',
  '2f4e1001-0000-4000-8000-000000000001', 'Reminder the restored grant may move',
  now() + interval '2 days', 'scheduled'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"2f4e0001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- The five writes the revocation refused ------------------------------------

select lives_ok(
  $$ insert into public.tasks (user_id, title)
     values ('2f4e0001-0000-4000-8000-000000000001', 'Task created after the re-grant') $$,
  're-grant restores INSERT on public.tasks for authenticated'
);

select lives_ok(
  $$ update public.tasks set status = 'in_progress'
     where id = '2f4e1001-0000-4000-8000-000000000001' $$,
  're-grant restores UPDATE on public.tasks for authenticated'
);

select lives_ok(
  $$ delete from public.tasks where id = '2f4e1002-0000-4000-8000-000000000002' $$,
  're-grant restores DELETE on public.tasks for authenticated'
);

select lives_ok(
  $$ update public.reminders set remind_at = now() + interval '4 days'
     where id = '2f4e2001-0000-4000-8000-000000000001' $$,
  're-grant restores UPDATE on public.reminders for authenticated'
);

select lives_ok(
  $$ delete from public.reminders where id = '2f4e2001-0000-4000-8000-000000000001' $$,
  're-grant restores DELETE on public.reminders for authenticated'
);

-- What the rollback must not have disturbed ---------------------------------

select is(
  (select count(*)::integer from public.tasks
   where id = '2f4e1001-0000-4000-8000-000000000001'),
  1,
  'SELECT was never revoked and the re-grant did not disturb it'
);

reset role;
select ok(
  not exists (
    select 1
    from unnest(array['public.tasks', 'public.reminders']) as relation,
         unnest(array['select', 'insert', 'update', 'delete']) as privilege
    where pg_catalog.has_table_privilege('anon', relation, privilege)
  ),
  'the rollback restored the owner role''s privileges without widening anything to anon'
);

select * from finish();
rollback;
