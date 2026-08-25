-- Phase 2S slice 2S.1 -- the suppression model, the cadence rule and the notice
-- destination. Migration 202608240102.
--
-- WHY EVERY CADENCE ASSERTION CALLS THE FUNCTION
-- ---------------------------------------------------------------------------
-- Slice 2R.1 matched substrings against `pg_proc.prosrc` and proved nothing
-- about behaviour; slice 2R.4 CALLED `run_user_heartbeat` twenty-six times and
-- found a real defect in its own assertion. Sections 5 to 8 call it and read the
-- rows it wrote. Nothing here reads the function's source.
--
-- WHY EVERY ROW-PRODUCING CALL SITS INSIDE AN ASSERTION
-- ---------------------------------------------------------------------------
-- `supabase test db` parses TAP. A bare `select helper()` between assertions
-- emits a result row into that stream, so every helper invocation here is
-- either an argument to an assertion or a statement that returns nothing. The
-- existing suites hold the same line -- `phase_2r_notify.sql` has no bare
-- select anywhere.
--
-- WHY THE DENIALS ARE NOT VACUOUS
-- ---------------------------------------------------------------------------
-- "the stranger cannot read this suppression" is satisfied by an empty table.
-- Section 2 inserts the STRANGER's own suppression first, proves it exists, and
-- only then proves the owner can neither read, lift nor create against it. A
-- zero count over an empty table is not a control.
--
-- WHY THE CLOCK IS NOT MOVED
-- ---------------------------------------------------------------------------
-- `now()` is fixed inside a transaction, so a suite that tried to "wait a day"
-- would compare a candidate against itself. The backoff is exercised by planting
-- PRIOR notices at chosen ages and asking the function whether it speaks --
-- which is what the clause actually reads. Every planted key carries a PAST
-- local date, so the exact-key clause the migration left untouched cannot be
-- what produces the answer.
--
-- WHY QUIET HOURS ARE PINNED AHEAD OF now()
-- ---------------------------------------------------------------------------
-- The window is set two to four hours in the future, the pattern
-- `phase_2r_notify.sql` established. The current time is outside it in BOTH
-- branches of the function's comparison -- when the window wraps midnight and
-- when it does not -- so the suite cannot flake on the hour CI happens to run.
--
-- Written in pure ASCII.

begin;
select plan(59);

set local timezone to 'UTC';

-- Fixtures --------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f1000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'suppression-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f1000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'suppression-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- UPDATE, not INSERT: `auth.users` carries a trigger that writes the profile
-- row, so an explicit insert collides on the primary key. The owner is pinned
-- to UTC so `local_now::time` and this session's clock are the same reading,
-- which is what makes the quiet-hours window provable rather than probable.
update public.profiles set timezone = 'UTC'
  where user_id = 'f1000001-0000-4000-8000-000000000001';
update public.profiles set timezone = 'UTC'
  where user_id = 'f1000002-0000-4000-8000-000000000002';

update public.agent_preferences
set quiet_start = (now() + interval '2 hours')::time,
    quiet_end = (now() + interval '4 hours')::time
where user_id in (
  'f1000001-0000-4000-8000-000000000001',
  'f1000002-0000-4000-8000-000000000002'
);

-- Stale candidates: `inbox` is not an excluded status, no due date, and last
-- touched long enough ago to clear the seven-day default for a task carrying no
-- manual priority.
-- The owner's task is anchored at 400 days, and the number is load-bearing
-- rather than arbitrary. The backoff counts notices sent SINCE `updated_at`, so
-- every planted age in section 5 has to fall on the intended side of this
-- anchor. A first draft anchored it at 60 days, which put the "a year later"
-- assertion's notices BEFORE the anchor -- they would not have counted, the
-- function would have spoken, and the assertion would have failed while the
-- product was behaving correctly. 400 days puts every ladder age after it and
-- leaves room for the reset probe to sit before it.
insert into public.tasks (id, user_id, title, status, updated_at) values
  ('f2000001-0000-4000-8000-000000000001', 'f1000001-0000-4000-8000-000000000001',
   'Uma tarefa parada', 'inbox', now() - interval '400 days'),
  ('f2000002-0000-4000-8000-000000000002', 'f1000002-0000-4000-8000-000000000002',
   'A tarefa do estranho', 'inbox', now() - interval '60 days');

-- Helpers, all created BEFORE any role switch: `pg_temp` needs TEMP privilege
-- on the database and `authenticated` does not have it, so a helper defined
-- after `set local role` fails on the CREATE and names the wrong subject.

-- Plants `p_count` prior notices whose newest is exactly `p_newest_age` old,
-- then asks whether the heartbeat speaks about the stale task. One helper
-- rather than two so no bare call leaks a row into the TAP stream.
create function pg_temp.speaks_after(p_count integer, p_newest_age interval)
returns boolean language plpgsql as $$
declare
  i integer;
  before_count integer;
  after_count integer;
begin
  delete from public.notifications
  where user_id = 'f1000001-0000-4000-8000-000000000001';

  for i in 1..p_count loop
    insert into public.notifications
      (user_id, type, title, body, action_url, priority, dedupe_key, created_at)
    values (
      'f1000001-0000-4000-8000-000000000001', 'task_stale', 'Tarefa sem movimento',
      'Uma tarefa parada', '/pt-BR/app/work/f2000001-0000-4000-8000-000000000001',
      'normal',
      'stale:f2000001-0000-4000-8000-000000000001:'
        || ((now() - p_newest_age - ((i - 1) * interval '1 day'))::date)::text,
      now() - p_newest_age - ((i - 1) * interval '1 day')
    );
  end loop;

  select pg_catalog.count(*) into before_count from public.notifications
  where user_id = 'f1000001-0000-4000-8000-000000000001' and type = 'task_stale';
  perform public.run_user_heartbeat('f1000001-0000-4000-8000-000000000001');
  select pg_catalog.count(*) into after_count from public.notifications
  where user_id = 'f1000001-0000-4000-8000-000000000001' and type = 'task_stale';

  return after_count > before_count;
end;
$$;

-- The same probe with no planting, for the sections that arrange their own state.
create function pg_temp.speaks() returns boolean language sql as $$
  select pg_temp.speaks_after(0, interval '1 day');
$$;

-- NOTE ON WHY NO ASSERTION HERE TOUCHES A TASK
-- ---------------------------------------------------------------------------
-- `tasks_updated_at` is a BEFORE UPDATE trigger running `set_updated_at()`, so
-- ANY update to a task rewrites `updated_at` to now(). A suite that tried to
-- "touch the subject" by backdating that column would silently get now()
-- instead -- and now() is not older than the seven-day staleness threshold, so
-- the task would stop being a candidate at all and every assertion after it
-- would fail for a reason that had nothing to do with the cadence.
--
-- The reset is therefore proved by moving the NOTICES across the anchor rather
-- than the anchor across the notices, which isolates exactly one variable:
-- the same four notices, the same task, ages either side of `updated_at`.
-- Read from the deployed catalog before this suite was written, not discovered
-- in CI.

-- The daily cap: three notices delivered inside the local day leave zero slots,
-- and the stale candidate is withheld for that reason alone.
create function pg_temp.speaks_with_cap_filled() returns boolean language plpgsql as $$
declare i integer; produced integer;
begin
  delete from public.notifications
  where user_id = 'f1000001-0000-4000-8000-000000000001';
  for i in 1..3 loop
    insert into public.notifications
      (user_id, type, title, body, priority, dedupe_key, created_at)
    values ('f1000001-0000-4000-8000-000000000001', 'reminder', 'x', 'y', 'normal',
            'cap-filler:' || i::text, now());
  end loop;
  perform public.run_user_heartbeat('f1000001-0000-4000-8000-000000000001');
  select pg_catalog.count(*) into produced from public.notifications
  where user_id = 'f1000001-0000-4000-8000-000000000001' and type = 'task_stale';
  return produced > 0;
end;
$$;

create function pg_temp.rpc_result(
  p_scope text, p_until timestamptz, p_notice text, p_reason text,
  p_entity_type text default 'task',
  p_entity_id uuid default 'f2000001-0000-4000-8000-000000000001'
) returns text language plpgsql as $$
begin
  perform public.suppress_notification_subject(
    p_entity_type, p_entity_id, p_scope, p_until, p_notice, p_reason);
  return 'ACCEPTED';
exception when others then
  return 'REFUSED';
end;
$$;

-- Section 0 -- the fixtures are servable, so every denial below means something
-- -----------------------------------------------------------------------------

select is(
  (select lifecycle.status from public.account_lifecycle as lifecycle
   where lifecycle.user_id = 'f1000001-0000-4000-8000-000000000001'),
  'active',
  'the owner is active, so the heartbeat will not skip them before reading anything'
);

select is(
  (select preferences.max_followups_per_day from public.agent_preferences as preferences
   where preferences.user_id = 'f1000001-0000-4000-8000-000000000001'),
  3::smallint,
  'the daily cap under test is the product default, not a value this suite invented'
);

select ok(
  pg_temp.speaks(),
  'CONTROL: with nothing suppressed and nothing said before, the heartbeat speaks'
);

-- Section 1 -- the state exists with the boundary it claims (2S-TRUST-003, -004)
-- -----------------------------------------------------------------------------

select has_table('public', 'notification_suppressions',
  '2S-SILENCE-001: the suppression state exists');

select is(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.notification_suppressions'::regclass),
  true,
  '2S-TRUST-004: row level security is enabled'
);

select is(
  (select relforcerowsecurity from pg_catalog.pg_class
   where oid = 'public.notification_suppressions'::regclass),
  true,
  '2S-TRUST-004: FORCE row level security is enabled, so a definer writer is bound too'
);

select is(
  (select pg_catalog.count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'notification_suppressions'
     and column_name in ('title', 'body', 'content', 'message')),
  0,
  '2S-TRUST-006: no notification content can reach this store'
);

select is(
  (select pg_catalog.count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'notification_suppressions'
     and grantee = 'anon'),
  0,
  '2S-TRUST-003: anon holds no privilege on the suppression store'
);

-- The first version of this asserted 'SELECT' and CI answered
-- 'REFERENCES,SELECT,TRIGGER,TRUNCATE': `alter default privileges` in this
-- schema hands those four to service_role on EVERY new table, so omitting a
-- grant is not the same as withholding one -- and one of the four is TRUNCATE.
-- The migration now revokes explicitly and this asserts the result.
select is(
  (select pg_catalog.count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'notification_suppressions'
     and grantee = 'service_role'),
  0,
  '2S-TRUST-003: service_role holds NOTHING -- the heartbeat reads as a definer, not as a role'
);

select is(
  (select pg_catalog.count(*)::integer from pg_catalog.pg_policy
   where polrelid = 'public.notification_suppressions'::regclass
     and polroles = '{0}'),
  0,
  'no policy is PUBLIC: every one names its role list'
);

-- Section 2 -- ownership, proved from a second owner's point of view
-- -----------------------------------------------------------------------------

insert into public.notification_suppressions
  (user_id, entity_type, entity_id, scope, suppressed_until, reason)
values
  ('f1000002-0000-4000-8000-000000000002', 'task',
   'f2000002-0000-4000-8000-000000000002', 'forever', null, 'do estranho');

select is(
  (select pg_catalog.count(*)::integer from public.notification_suppressions
   where user_id = 'f1000002-0000-4000-8000-000000000002'),
  1,
  'CONTROL: the stranger really does have a suppression, so the denials below are not vacuous'
);

select throws_ok(
  $probe$insert into public.notification_suppressions
      (user_id, entity_type, entity_id, scope, suppressed_until, reason)
    values ('f1000001-0000-4000-8000-000000000001', 'task',
            'f2000002-0000-4000-8000-000000000002', 'forever', null, 'roubo')$probe$,
  '42501',
  null,
  '2S-SILENCE-005: ownership is proved by TRIGGER against the subject, not by the row saying so'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"f1000001-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select pg_catalog.count(*)::integer from public.notification_suppressions),
  0,
  '2S-SILENCE-005: the owner cannot read the stranger''s suppression'
);

select is(
  (select pg_catalog.count(*)::integer from public.notification_suppressions
   where user_id = 'f1000002-0000-4000-8000-000000000002'),
  0,
  '2S-SILENCE-005: naming the stranger''s id explicitly does not reach it either'
);

-- Section 3 -- the boundary refuses, and nothing invalid reaches storage
-- -----------------------------------------------------------------------------

select is(
  pg_temp.rpc_result('until', null, null, 'sem prazo'),
  'REFUSED',
  '2S-SILENCE-002: a temporary suppression with no expiry is UNBOUNDED and refused'
);

select is(
  pg_temp.rpc_result('until', now() - interval '1 day', null, 'no passado'),
  'REFUSED',
  '2S-SILENCE-002: a past-dated suppression is refused'
);

select is(
  pg_temp.rpc_result('forever', now() + interval '1 day', null, 'contraditorio'),
  'REFUSED',
  '2S-SILENCE-002: a permanent suppression carrying an expiry is MALFORMED and refused'
);

select is(
  pg_temp.rpc_result('forever', null, null, '   '),
  'REFUSED',
  '2S-SILENCE-003: a suppression with no reason is refused'
);

select is(
  pg_temp.rpc_result('sometimes', null, null, 'escopo invalido'),
  'REFUSED',
  '2S-SILENCE-002: an unknown scope is refused'
);

select is(
  pg_temp.rpc_result('forever', null, null, 'de outro',
                     'task', 'f2000002-0000-4000-8000-000000000002'),
  'REFUSED',
  '2S-SILENCE-005: suppressing a subject the caller does not own is refused'
);

-- Read WITHOUT the role, so a zero here is a real zero rather than a zero RLS
-- produced. The same count under `authenticated` could not tell the two apart.
reset role;

select is(
  (select pg_catalog.count(*)::integer from public.notification_suppressions
   where user_id = 'f1000001-0000-4000-8000-000000000001'),
  0,
  '2S-SILENCE-002: NONE of the six refusals reached storage'
);

-- Section 4 -- the writer, the audit trail and the undo that is real
-- -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"f1000001-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  ((select public.suppress_notification_subject(
      'task', 'f2000001-0000-4000-8000-000000000001', 'until',
      now() + interval '3 days', null, 'agora nao')) ->> 'replaced')::boolean,
  false,
  '2S-SILENCE-001: the first suppression is created rather than replacing one'
);

-- This one deliberately stays under `authenticated`: it is the positive half of
-- section 2's denials, proving the owner CAN see their own row through the very
-- same policies that hid the stranger's.
select is(
  (select suppression.scope from public.notification_suppressions as suppression
   where suppression.user_id = 'f1000001-0000-4000-8000-000000000001'),
  'until',
  '2S-SILENCE-001: the suppression persists and reloads unchanged'
);

reset role;

select is(
  (select suppression.actor from public.notification_suppressions as suppression
   where suppression.user_id = 'f1000001-0000-4000-8000-000000000001'),
  'user',
  '2S-SILENCE-003: the stored row names who suppressed'
);

select is(
  (select log.reason from public.audit_logs as log
   where log.user_id = 'f1000001-0000-4000-8000-000000000001'
     and log.action_type = 'notification_suppressed'),
  'agora nao',
  '2S-TRUST-001: the suppression is auditable -- actor, target, reason and state'
);

select is(
  (select pg_catalog.count(*)::integer from public.undo_operations
   where user_id = 'f1000001-0000-4000-8000-000000000001'
     and action_type = 'suppress_notification_subject'
     and before_state is null),
  1,
  '2S-SILENCE-006: an undo was reserved, and it records that nothing was replaced'
);

-- The undo is EXERCISED through the real router, which resolves its caller from
-- auth.uid() -- so this one has to run as the owner.
set local role authenticated;
set local request.jwt.claims to '{"sub":"f1000001-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  ((select public.undo_operation(
      (select operation.id from public.undo_operations as operation
       where operation.user_id = 'f1000001-0000-4000-8000-000000000001'
         and operation.action_type = 'suppress_notification_subject'))) ->> 'undone')::boolean,
  true,
  '2S-SILENCE-006: the registered handler runs through the router'
);

reset role;

select is(
  (select pg_catalog.count(*)::integer from public.notification_suppressions
   where user_id = 'f1000001-0000-4000-8000-000000000001'),
  0,
  '2S-SILENCE-006: the undo restored the prior state exactly -- no suppression'
);

-- 2S-TRUST-013 and the lesson of 2R-UNDO-LEDGER-NOT-CLOSED: a handler that
-- reports success and leaves the ledger row `available` is a defect, not a
-- finding. This reads the LEDGER as well as the subject.
select is(
  (select operation.status from public.undo_operations as operation
   where operation.user_id = 'f1000001-0000-4000-8000-000000000001'
     and operation.action_type = 'suppress_notification_subject'),
  'undone',
  '2S-TRUST-013: the HANDLER closed the ledger row, which one handler in this repository does not'
);

-- Section 5 -- the cadence, by CALLING the function (2S-CADENCE-001, -002, -003)
-- -----------------------------------------------------------------------------

select ok(
  not pg_temp.speaks_after(1, interval '12 hours'),
  '2S-CADENCE-004: the 24-hour cooldown is the FLOOR and is unchanged -- 12 hours is silent'
);

select ok(
  pg_temp.speaks_after(1, interval '25 hours'),
  '2S-CADENCE-001: after ONE unanswered notice the interval is 1 day, and 25 hours clears it'
);

select ok(
  not pg_temp.speaks_after(2, interval '25 hours'),
  '2S-CADENCE-001: after TWO the interval has grown -- 25 hours is no longer enough'
);

select ok(
  pg_temp.speaks_after(2, interval '4 days'),
  '2S-CADENCE-001: after TWO the interval is 3 days, and 4 days clears it'
);

select ok(
  not pg_temp.speaks_after(3, interval '4 days'),
  '2S-CADENCE-001: after THREE the interval has grown again -- 4 days is not enough'
);

select ok(
  pg_temp.speaks_after(3, interval '8 days'),
  '2S-CADENCE-001: after THREE the interval is 7 days, and 8 days clears it'
);

select ok(
  not pg_temp.speaks_after(4, interval '30 days'),
  '2S-CADENCE-002: the backoff TERMINATES -- after four notices no interval ever clears it'
);

select ok(
  not pg_temp.speaks_after(4, interval '365 days'),
  '2S-CADENCE-002: and the ceiling is not merely long -- a year later it is still silent'
);

-- 2S-CADENCE-003. The pair with the assertions above is the whole proof: FOUR
-- notices and the same subject every time, and the ONLY thing that moves is
-- whether they fall before or after the subject's own `updated_at` (400 days).
-- At 30 and 365 days they are after it, they count, and the backoff has
-- terminated. At 500 days they are before it, they do not count, and the
-- cadence is back at its first interval -- which is precisely what touching the
-- subject does to it.
select ok(
  pg_temp.speaks_after(4, interval '500 days'),
  '2S-CADENCE-003: notices sent BEFORE the subject last changed do not count -- the backoff resets'
);

-- Section 6 -- a suppressed subject falls silent, and an expired one resumes
-- -----------------------------------------------------------------------------

insert into public.notification_suppressions
  (user_id, entity_type, entity_id, scope, suppressed_until, reason)
values
  ('f1000001-0000-4000-8000-000000000001', 'task',
   'f2000001-0000-4000-8000-000000000001', 'until', now() + interval '3 days', 'agora nao');

select ok(
  not pg_temp.speaks(),
  '2S-SILENCE-009: a suppressed subject stops producing notices for the duration'
);

update public.notification_suppressions
set suppressed_until = now() - interval '1 minute'
where user_id = 'f1000001-0000-4000-8000-000000000001';

select ok(
  pg_temp.speaks(),
  '2S-SILENCE-010: an expired suppression resumes notices'
);

update public.notification_suppressions
set scope = 'forever', suppressed_until = null
where user_id = 'f1000001-0000-4000-8000-000000000001';

select ok(
  not pg_temp.speaks(),
  '2S-SILENCE-009: a permanent suppression has no expiry to outlive'
);

update public.notification_suppressions
set notice_type = 'task_overdue'
where user_id = 'f1000001-0000-4000-8000-000000000001';

select ok(
  pg_temp.speaks(),
  'a suppression narrowed to task_overdue leaves task_stale audible'
);

delete from public.notification_suppressions
where user_id = 'f1000001-0000-4000-8000-000000000001';

-- Section 7 -- what did NOT change, re-proved by calling (2S-CADENCE-004 ... -007)
-- -----------------------------------------------------------------------------

update public.agent_preferences
set quiet_start = (now() - interval '1 hour')::time,
    quiet_end = (now() + interval '1 hour')::time
where user_id = 'f1000001-0000-4000-8000-000000000001';

select ok(
  not pg_temp.speaks(),
  '2S-CADENCE-004: quiet hours are unchanged -- inside the window the candidate is withheld'
);

update public.agent_preferences
set quiet_start = (now() + interval '2 hours')::time,
    quiet_end = (now() + interval '4 hours')::time
where user_id = 'f1000001-0000-4000-8000-000000000001';

select ok(
  not pg_temp.speaks_with_cap_filled(),
  '2S-CADENCE-004: the daily cap is unchanged -- with no slots left nothing is created'
);

delete from public.notifications
where user_id = 'f1000001-0000-4000-8000-000000000001';

-- One owner's suppression never affects another owner's batch.
--
-- THE STRANGER'S OWN SUPPRESSION IS LIFTED FIRST, and that is not tidying up.
-- Section 2 planted a permanent suppression on the STRANGER'S task to prove the
-- ownership boundary. It was still live here, so the first version of this
-- assertion asked the stranger's heartbeat to speak about a subject this suite
-- had itself silenced -- and it failed for that reason rather than for the one
-- it was written to test. A fixture that survives into a later section is a
-- fixture that answers a question nobody asked.
delete from public.notification_suppressions
where user_id = 'f1000002-0000-4000-8000-000000000002';

insert into public.notification_suppressions
  (user_id, entity_type, entity_id, scope, suppressed_until, reason)
values ('f1000001-0000-4000-8000-000000000001', 'task',
        'f2000001-0000-4000-8000-000000000001', 'forever', null, 'silencio total');

select ok(
  ((select public.run_user_heartbeat('f1000002-0000-4000-8000-000000000002'))
    ->> 'notifications_created')::integer > 0,
  '2S-CADENCE-006: one owner''s suppression never silences another owner''s batch'
);

select ok(
  not pg_temp.speaks(),
  '2S-CADENCE-006: and the suppressed owner is still suppressed in the same batch'
);

-- 2S-CADENCE-007, and the first version of this tested the wrong thing.
--
-- It called the heartbeat for a NON-EXISTENT user and expected P0002. CI
-- answered `23503 heartbeat_runs_user_id_fkey`, and the reason is worth keeping:
-- the function DOES raise P0002, its own `exception when others` handler catches
-- it, and the handler's insert into `heartbeat_runs` then violates the foreign
-- key -- so the failure the caller sees comes from the failure LOGGER, not from
-- the check. That is real behaviour and it is harmless, because
-- `run_all_heartbeats` only ever iterates rows of `auth.users`; but it means an
-- absent user is not a model of the failure this requirement is about.
--
-- What the requirement is actually about is slice 2R.4's case: one REAL owner
-- whose data makes their own heartbeat fail, and a batch that carries on. So the
-- stranger is given an unresolvable timezone -- `profiles.timezone` carries no
-- CHECK, which is `2R-TZ-SECOND-AUTHORITY` and is used here rather than repaired
-- -- and the whole batch is run through `run_all_heartbeats()`.
delete from public.notifications
where user_id = 'f1000002-0000-4000-8000-000000000002';
update public.profiles set timezone = 'Not/AZone'
  where user_id = 'f1000002-0000-4000-8000-000000000002';

select lives_ok(
  $probe$select public.run_all_heartbeats()$probe$,
  '2S-CADENCE-007: one owner''s broken data does not raise out of the batch'
);

-- `exists`, not `order by created_at desc limit 1`: now() is fixed inside a
-- transaction, so every heartbeat_runs row this suite produces carries the SAME
-- created_at and "the latest one" is not a thing the ordering can decide.
select ok(
  exists (
    select 1 from public.heartbeat_runs as run
    where run.user_id = 'f1000002-0000-4000-8000-000000000002'
      and run.status = 'failed'
  ),
  '2S-CADENCE-007: the failing owner''s run is RECORDED as failed rather than lost'
);

select is(
  (select pg_catalog.count(*)::integer from public.notifications
   where user_id = 'f1000002-0000-4000-8000-000000000002'),
  0,
  'CONTROL: the failing owner really did produce nothing, so the batch had something to survive'
);

update public.profiles set timezone = 'UTC'
  where user_id = 'f1000002-0000-4000-8000-000000000002';

delete from public.notification_suppressions
where user_id = 'f1000001-0000-4000-8000-000000000001';

-- Section 8 -- the destination points at the subject (2S-REACH-001 ... -005)
-- -----------------------------------------------------------------------------

select ok(
  pg_temp.speaks(),
  'CONTROL: a fresh notice is produced, so the destination assertions read a real row'
);

select is(
  (select notification.action_url from public.notifications as notification
   where notification.user_id = 'f1000001-0000-4000-8000-000000000001'
     and notification.type = 'task_stale'
   order by notification.created_at desc limit 1),
  '/pt-BR/app/work/f2000001-0000-4000-8000-000000000001',
  '2S-REACH-001: a task notice links to THAT task, not to the list'
);

update public.profiles set locale = 'en'
  where user_id = 'f1000001-0000-4000-8000-000000000001';

select ok(
  pg_temp.speaks(),
  'CONTROL: the English owner also gets a notice, so the next assertion is not empty'
);

-- 2S-REACH-002 is a property this phase PRESERVES rather than builds: slice
-- 2S.0 found the producer was already locale-correct and the PRD's "hardcoded
-- to /pt-BR/app/tasks" was wrong.
select is(
  (select notification.action_url from public.notifications as notification
   where notification.user_id = 'f1000001-0000-4000-8000-000000000001'
     and notification.type = 'task_stale'
   order by notification.created_at desc limit 1),
  '/en/app/work/f2000001-0000-4000-8000-000000000001',
  '2S-REACH-002: the destination is locale-correct, and was before this phase touched it'
);

update public.profiles set locale = 'pt-BR'
  where user_id = 'f1000001-0000-4000-8000-000000000001';

delete from public.notifications
where user_id = 'f1000001-0000-4000-8000-000000000001';

insert into public.reminders (user_id, title, remind_at, important, status)
values ('f1000001-0000-4000-8000-000000000001', 'Um lembrete',
        now() - interval '10 minutes', false, 'scheduled');

-- 2S-REACH-005: no `reminder` notification has ever existed in this product.
-- This is the first one, so the route is exercised rather than assumed.
select ok(
  ((select public.run_user_heartbeat('f1000001-0000-4000-8000-000000000001'))
    ->> 'notifications_created')::integer > 0,
  '2S-REACH-005: a reminder notice is produced for the first time rather than assumed'
);

select is(
  (select notification.action_url from public.notifications as notification
   where notification.user_id = 'f1000001-0000-4000-8000-000000000001'
     and notification.type = 'reminder'),
  '/pt-BR/app/reminders',
  '2S-REACH-003: the reminder destination is the list, because no per-reminder route exists'
);

-- Section 9 -- a reminder outranks a stale nudge for a capped slot
-- -----------------------------------------------------------------------------
-- `2S-CADENCE-005`. The rank literal says `task_stale` is 1 and a reminder is 2,
-- and reading the literal is what this assertion exists NOT to do: the ordering
-- is `order by rank desc, event_time asc, dedupe_key` and it is applied AFTER
-- the two new clauses, so a backoff or a suppression bug could change which
-- candidate survives to be truncated. The only honest proof is a day that holds
-- both and exactly one slot.

delete from public.notifications
where user_id = 'f1000001-0000-4000-8000-000000000001';

update public.agent_preferences
set max_followups_per_day = 1
where user_id = 'f1000001-0000-4000-8000-000000000001';

-- A second reminder: the first was marked `sent` by the heartbeat in section 8,
-- and a `sent` reminder is not a candidate. Reusing it would have made this
-- section pass by having nothing to compete with -- the vacuity this suite
-- refuses everywhere else.
insert into public.reminders (user_id, title, remind_at, important, status)
values ('f1000001-0000-4000-8000-000000000001', 'Outro lembrete',
        now() - interval '5 minutes', false, 'scheduled');

select is(
  (select pg_catalog.count(*)::integer from public.reminders as reminder
   where reminder.user_id = 'f1000001-0000-4000-8000-000000000001'
     and reminder.status = 'scheduled'
     and reminder.remind_at <= now()),
  1,
  'CONTROL: exactly one reminder is live and due, so the contention below is real'
);

select ok(
  ((select public.run_user_heartbeat('f1000001-0000-4000-8000-000000000001'))
    ->> 'notifications_created')::integer = 1,
  '2S-CADENCE-005: with a cap of one, exactly one notice is created'
);

select is(
  (select notification.type from public.notifications as notification
   where notification.user_id = 'f1000001-0000-4000-8000-000000000001'),
  'reminder',
  '2S-CADENCE-005: and the one that survived the cap is the REMINDER, not the stale nudge'
);

-- The other half, so the assertion above cannot be passing because the stale
-- task had stopped being a candidate: raise the cap and it appears.
update public.agent_preferences
set max_followups_per_day = 3
where user_id = 'f1000001-0000-4000-8000-000000000001';

select ok(
  pg_temp.speaks(),
  'CONTROL: the stale nudge was a real competitor -- with slots free, it is produced'
);

select * from finish();
rollback;
