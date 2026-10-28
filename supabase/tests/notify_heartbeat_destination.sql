-- `NOTIFY-HEARTBEAT-DESTINATION` -- the reminder notice points at the item.
--
-- WHAT THIS SUITE IS FOR
-- ---------------------------------------------------------------------------
-- ADR-143 corrected the push path and recorded that the heartbeat half was not
-- done. ADR-144 authorised the migration that does it. This proves the result
-- by CALLING `run_user_heartbeat` and reading the `action_url` it wrote --
-- never by matching a substring in `pg_proc.prosrc`, which would pass just as
-- happily if the reminder branch stopped matching any row at all.
--
-- WHY THE ASSERTIONS ARE NOT VACUOUS
-- ---------------------------------------------------------------------------
-- "the action_url is the task's page" is satisfied by a heartbeat that wrote
-- nothing, because there is then no row to disagree. So each owner's count is
-- asserted FIRST: two notices arrived, and only then is each one's destination
-- read. A planted row before the claim, which is the standard this repository
-- settled after a zero count was once mistaken for a control.
--
-- WHY BOTH LOCALES AND BOTH BRANCHES
-- ---------------------------------------------------------------------------
-- The expression under test is a `case` over two independent things: whether
-- the reminder has a task, and which locale the owner reads. Four combinations
-- exist and a test of one would leave three unmeasured.
--
-- WHY THE SHAPE IS ASSERTED HERE TOO
-- ---------------------------------------------------------------------------
-- `isOwnerScopedDestination` decides, in TypeScript, whether a stored
-- `action_url` may become a navigation: a path, not `//`, a locale segment,
-- then `app`. The heartbeat writes that column from SQL and knows nothing
-- about that predicate. The last two assertions are its mirror, so a
-- destination this function invents can never be one the product refuses to
-- follow -- a control cannot live only on the side that reads.
--
-- Written in pure ASCII, following the doctrine of `phase_2r_notify.sql`.

begin;
select plan(10);

set local timezone to 'UTC';

-- Fixtures -------------------------------------------------------------------
--
-- `handle_new_user` fires on insert and writes the profile, the preferences and
-- the `active` lifecycle row, so a bare insert into auth.users produces a user
-- the heartbeat will actually serve.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d2000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'dest-pt@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d2000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'dest-en@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles set timezone = 'UTC', locale = 'pt-BR'
where user_id = 'd2000001-0000-4000-8000-000000000001';

update public.profiles set timezone = 'UTC', locale = 'en'
where user_id = 'd2000002-0000-4000-8000-000000000002';

-- Quiet hours parked two hours ahead, a two-hour window: it cannot contain the
-- present under either branch of the wrap-around predicate.
update public.agent_preferences
set quiet_start = (now() + interval '2 hours')::time,
    quiet_end = (now() + interval '4 hours')::time
where user_id in (
  'd2000001-0000-4000-8000-000000000001',
  'd2000002-0000-4000-8000-000000000002'
);

-- The tasks the linked reminders hang off. `updated_at` defaults to now(), so
-- the heartbeat's OWN task branch -- which needs a row untouched for days --
-- cannot fire and add notices this suite did not ask for.
insert into public.tasks (id, user_id, title) values
  ('d2000011-0000-4000-8000-000000000011',
   'd2000001-0000-4000-8000-000000000001', 'Levar o carro'),
  ('d2000012-0000-4000-8000-000000000012',
   'd2000002-0000-4000-8000-000000000002', 'Take the car in');

-- Two reminders each: one attached to a task, one standing alone. Both due.
insert into public.reminders (id, user_id, task_id, title, remind_at, important, status) values
  ('d2000021-0000-4000-8000-000000000021',
   'd2000001-0000-4000-8000-000000000001',
   'd2000011-0000-4000-8000-000000000011',
   'Ligar para a oficina', now() - interval '10 minutes', false, 'scheduled'),
  ('d2000022-0000-4000-8000-000000000022',
   'd2000001-0000-4000-8000-000000000001',
   null,
   'Comprar pao', now() - interval '9 minutes', false, 'scheduled'),
  ('d2000023-0000-4000-8000-000000000023',
   'd2000002-0000-4000-8000-000000000002',
   'd2000012-0000-4000-8000-000000000012',
   'Call the garage', now() - interval '10 minutes', false, 'scheduled'),
  ('d2000024-0000-4000-8000-000000000024',
   'd2000002-0000-4000-8000-000000000002',
   null,
   'Buy bread', now() - interval '9 minutes', false, 'scheduled');

-- Section 0 -- the fixtures are servable, so what follows means something
-- -----------------------------------------------------------------------------

select is(
  (select lifecycle.status from public.account_lifecycle as lifecycle
   where lifecycle.user_id = 'd2000001-0000-4000-8000-000000000001'),
  'active',
  'the pt-BR owner is active, so the heartbeat will not skip them before reading anything'
);

select is(
  (select lifecycle.status from public.account_lifecycle as lifecycle
   where lifecycle.user_id = 'd2000002-0000-4000-8000-000000000002'),
  'active',
  'the en owner is active, so the heartbeat will not skip them before reading anything'
);

-- Section 1 -- pt-BR: the heartbeat ran, and where each notice points
-- -----------------------------------------------------------------------------

select public.run_user_heartbeat('d2000001-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.notifications as notification
   where notification.user_id = 'd2000001-0000-4000-8000-000000000001'
     and notification.type = 'reminder'),
  2,
  'both pt-BR reminders produced a notice, so the destinations below exist to be wrong'
);

select is(
  (select notification.action_url from public.notifications as notification
   where notification.dedupe_key = 'reminder:d2000021-0000-4000-8000-000000000021'),
  '/pt-BR/app/work/d2000011-0000-4000-8000-000000000011',
  'a pt-BR reminder with a task points at the task, because that is what it is about'
);

select is(
  (select notification.action_url from public.notifications as notification
   where notification.dedupe_key = 'reminder:d2000022-0000-4000-8000-000000000022'),
  '/pt-BR/app/reminders/d2000022-0000-4000-8000-000000000022',
  'a pt-BR reminder with no task points at its own page'
);

-- Section 2 -- en: the same two branches, in the other locale
-- -----------------------------------------------------------------------------

select public.run_user_heartbeat('d2000002-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.notifications as notification
   where notification.user_id = 'd2000002-0000-4000-8000-000000000002'
     and notification.type = 'reminder'),
  2,
  'both en reminders produced a notice'
);

select is(
  (select notification.action_url from public.notifications as notification
   where notification.dedupe_key = 'reminder:d2000023-0000-4000-8000-000000000023'),
  '/en/app/work/d2000012-0000-4000-8000-000000000012',
  'an en reminder with a task points at the task under the en prefix'
);

select is(
  (select notification.action_url from public.notifications as notification
   where notification.dedupe_key = 'reminder:d2000024-0000-4000-8000-000000000024'),
  '/en/app/reminders/d2000024-0000-4000-8000-000000000024',
  'an en reminder with no task points at its own page under the en prefix'
);

-- Section 3 -- the shape the product will refuse to follow if it is wrong
-- -----------------------------------------------------------------------------

select ok(
  not exists (
    select 1 from public.notifications as notification
    where notification.type = 'reminder'
      and (notification.action_url not like '/%'
           or notification.action_url like '//%'
           or notification.action_url like '/\\%')
  ),
  'every destination is a path and none is protocol-relative, which isOwnerScopedDestination refuses'
);

select ok(
  not exists (
    select 1 from public.notifications as notification
    where notification.type = 'reminder'
      and (split_part(notification.action_url, '/', 2) not in ('pt-BR', 'en')
           or split_part(notification.action_url, '/', 3) <> 'app')
  ),
  'every destination names a served locale and then the authenticated tree'
);

select * from finish();
rollback;
