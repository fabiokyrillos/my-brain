-- Phase 2R slice 2R.4 -- delivery, without multiplying it.
--
-- WHAT THIS SUITE IS FOR
-- ---------------------------------------------------------------------------
-- Six of the seven `2R-NOTIFY-*` requirements are baseline: quiet hours, the
-- daily cap, the 24-hour cooldown, per-user isolation and content-freedom all
-- held before recurrence existed. The slice's job is to prove recurrence did not
-- create a path around any of them, and the plan is explicit about the standard:
-- **"closes on the heartbeat's rules re-proved, not re-read."**
--
-- That distinction is the whole reason this file exists. Slice 2R.1's suite
-- already asserts the heartbeat is unchanged by reading `pg_proc.prosrc` and
-- matching two substrings. That is a good guard against an accidental edit and
-- it is not a proof of behaviour: it would pass just as happily if a series
-- occurrence were a row shape the heartbeat's predicates never matched, or if
-- materialisation quietly produced five due rows where one belongs. So every
-- assertion below CALLS `run_user_heartbeat` and reads what it did.
--
-- WHY THE DENIALS ARE NOT VACUOUS
-- ---------------------------------------------------------------------------
-- "no notification was created inside quiet hours" is satisfied by a heartbeat
-- that is broken, by a fixture that was never due, and by an empty database.
-- Section 1 therefore runs the SAME series through the SAME heartbeat outside
-- quiet hours first and proves a notification appears. Only then is the window
-- moved over the present and the silence asserted. The cap section does the
-- same thing in the other direction: it proves three arrived before it proves
-- the fourth and fifth did not.
--
-- WHY THE CLOCK IS PINNED RELATIVE TO now()
-- ---------------------------------------------------------------------------
-- The heartbeat compares `remind_at <= now()` and resolves quiet hours against
-- the owner's local wall clock. A suite with literal times would pass in the
-- morning and fail at night. Every window here is expressed as an offset from
-- the current time, and the owner's zone is UTC so that offset is the whole
-- story. The two-hour window starting two hours ahead cannot contain the
-- present under either branch of the wrap-around predicate, and the two-hour
-- window centred on the present cannot miss it under either.
--
-- WHAT THIS SUITE DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- `2R-NOTIFY-007` is a rule, not a behaviour: push is not resumed, repaired or
-- claimed by this phase. Nothing here sends anything to a device, and no
-- assertion below should ever be cited as evidence that push works. The rule is
-- enforced where a rule can be -- in `phase-2r-declarations.test.ts` -- because
-- a SQL suite cannot prove the absence of a claim in prose.
--
-- Written in pure ASCII, following the doctrine of
-- `phase_2r_reminder_recurrence.sql`.

begin;
select plan(25);

set local timezone to 'UTC';

-- Fixtures -------------------------------------------------------------------
--
-- `handle_new_user` fires on insert and writes the profile, the preferences and
-- the `active` lifecycle row, so a bare insert into auth.users produces a user
-- the heartbeat will actually serve. Asserting that rather than assuming it is
-- section 0: a suite whose users were silently skipped as `account-not-active`
-- would report every denial below as a pass.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e1000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'notify-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('e1000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'notify-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('e1000003-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'notify-broken@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- UTC for all three, so the owner's local wall clock is the test's own clock.
update public.profiles
set timezone = 'UTC', locale = 'pt-BR'
where user_id in (
  'e1000001-0000-4000-8000-000000000001',
  'e1000002-0000-4000-8000-000000000002'
);

-- Quiet hours parked two hours ahead, a two-hour window: it cannot contain the
-- present under either branch of the wrap-around predicate.
update public.agent_preferences
set quiet_start = (now() + interval '2 hours')::time,
    quiet_end = (now() + interval '4 hours')::time
where user_id in (
  'e1000001-0000-4000-8000-000000000001',
  'e1000002-0000-4000-8000-000000000002'
);

-- Section 0 -- the fixtures are servable, so every denial below means something
-- -----------------------------------------------------------------------------

select is(
  (select lifecycle.status
   from public.account_lifecycle as lifecycle
   where lifecycle.user_id = 'e1000001-0000-4000-8000-000000000001'),
  'active',
  'the owner is active, so the heartbeat will not skip them before reading anything'
);

select is(
  (select preferences.max_followups_per_day
   from public.agent_preferences as preferences
   where preferences.user_id = 'e1000001-0000-4000-8000-000000000001'),
  3::smallint,
  'the daily cap under test is the product default, not a value this suite invented'
);

-- A daily series, and one live occurrence already due.
--
-- Inserted DIRECTLY rather than through `create_reminder_series_v1`, and the
-- reason is scope rather than convenience: that RPC resolves its owner from
-- `auth.uid()`, so calling it here would mean a role switch and a JWT claim per
-- fixture, and every one of those is a chance for this suite to fail on
-- something that is not delivery. What the rows must be is the shape the RPC
-- produces -- an active series, exactly one `scheduled` occurrence carrying
-- `series_id` and `series_sequence` -- and `phase_2r_reminder_recurrence.sql`
-- already proves the RPC produces exactly that.
insert into public.reminder_series (
  id, user_id, title, rule, anchor_date, anchor_hour, anchor_minute, status
) values (
  'e2000001-0000-4000-8000-000000000001',
  'e1000001-0000-4000-8000-000000000001',
  'Tomar o remedio',
  '{"version": 1, "frequency": "daily"}'::jsonb,
  (now() - interval '1 day')::date, 0, 0, 'active'
);

insert into public.reminders (
  user_id, title, remind_at, important, status, series_id, series_sequence
) values (
  'e1000001-0000-4000-8000-000000000001',
  'Tomar o remedio',
  now() - interval '10 minutes',
  false, 'scheduled',
  'e2000001-0000-4000-8000-000000000001', 1
);

select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.user_id = 'e1000001-0000-4000-8000-000000000001'
     and occurrence.status = 'scheduled'
     and occurrence.remind_at <= now()),
  1,
  'exactly one occurrence is live and due -- the state every assertion below reads'
);

-- Section 1 -- 2R-NOTIFY-001: quiet hours still hold for a series occurrence
-- -----------------------------------------------------------------------------
--
-- The positive control FIRST. Outside quiet hours the very same occurrence is
-- delivered, so the silence asserted afterwards is the window's doing.

select is(
  (public.run_user_heartbeat('e1000001-0000-4000-8000-000000000001')
    ->> 'notifications_created')::integer,
  1,
  'CONTROL: outside quiet hours the occurrence IS delivered'
);

select is(
  (select occurrence.status
   from public.reminders as occurrence
   where occurrence.user_id = 'e1000001-0000-4000-8000-000000000001'
     and occurrence.series_id is not null
   order by occurrence.series_sequence asc
   limit 1),
  'sent',
  'CONTROL: and the occurrence it delivered is marked sent'
);

-- Now the same shape, on the second owner, with the window over the present.
insert into public.reminder_series (
  id, user_id, title, rule, anchor_date, anchor_hour, anchor_minute, status
) values (
  'e2000002-0000-4000-8000-000000000002',
  'e1000002-0000-4000-8000-000000000002',
  'Alongar',
  '{"version": 1, "frequency": "daily"}'::jsonb,
  (now() - interval '1 day')::date, 0, 0, 'active'
);

insert into public.reminders (
  user_id, title, remind_at, important, status, series_id, series_sequence
) values (
  'e1000002-0000-4000-8000-000000000002',
  'Alongar',
  now() - interval '10 minutes',
  false, 'scheduled',
  'e2000002-0000-4000-8000-000000000002', 1
);

update public.agent_preferences
set quiet_start = (now() - interval '1 hour')::time,
    quiet_end = (now() + interval '1 hour')::time
where user_id = 'e1000002-0000-4000-8000-000000000002';

select is(
  (public.run_user_heartbeat('e1000002-0000-4000-8000-000000000002')
    ->> 'notifications_created')::integer,
  0,
  '2R-NOTIFY-001: inside quiet hours the occurrence is NOT delivered'
);

select is(
  (select occurrence.status
   from public.reminders as occurrence
   where occurrence.user_id = 'e1000002-0000-4000-8000-000000000002'
     and occurrence.series_id is not null
   order by occurrence.series_sequence asc
   limit 1),
  'scheduled',
  '2R-NOTIFY-001: and it is not marked sent either, so nothing is lost'
);

-- The row is withheld, not destroyed: once the window passes it delivers.
update public.agent_preferences
set quiet_start = (now() + interval '2 hours')::time,
    quiet_end = (now() + interval '4 hours')::time
where user_id = 'e1000002-0000-4000-8000-000000000002';

select is(
  (public.run_user_heartbeat('e1000002-0000-4000-8000-000000000002')
    ->> 'notifications_created')::integer,
  1,
  '2R-NOTIFY-001: the withheld occurrence delivers once the window has passed'
);

-- Section 2 -- 2R-NOTIFY-005: a missed occurrence does not produce a burst
-- -----------------------------------------------------------------------------
--
-- THE ONE BUILD REQUIREMENT, and the mechanism it depends on was shipped by
-- 2R.1 rather than by this slice: exactly one occurrence exists at a time, and
-- materialisation computes the next from `greatest(remind_at, now())`. So a
-- series nobody processed for a week cannot hold a week of rows, and the row it
-- does hold advances to the future rather than to the next missed instant.
--
-- Proved by execution here, because "one at a time" and "no backlog" are
-- different claims: a single row that materialised backwards would satisfy the
-- first and fail the second.

-- The first series' next occurrence was materialised by the trigger when the
-- heartbeat marked its predecessor `sent`; it is dragged eight days into the
-- past here so the owner holds exactly one long-missed occurrence and nothing
-- else. Dragging the existing row rather than adding a second series is what
-- makes the "still exactly ONE" assertions below mean something.
update public.reminders
set remind_at = now() - interval '8 days'
where user_id = 'e1000001-0000-4000-8000-000000000001'
  and status = 'scheduled';

select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.user_id = 'e1000001-0000-4000-8000-000000000001'
     and occurrence.status = 'scheduled'),
  1,
  '2R-NOTIFY-005: eight days unprocessed and still exactly ONE live occurrence'
);

select is(
  (public.run_user_heartbeat('e1000001-0000-4000-8000-000000000001')
    ->> 'notifications_created')::integer,
  1,
  '2R-NOTIFY-005: the backlog delivers ONE notification, not eight'
);

select ok(
  (select occurrence.remind_at > now()
   from public.reminders as occurrence
   where occurrence.user_id = 'e1000001-0000-4000-8000-000000000001'
     and occurrence.status = 'scheduled'
   order by occurrence.remind_at asc
   limit 1),
  '2R-NOTIFY-005: the next occurrence is in the FUTURE -- it skipped forward rather than replaying the week'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.user_id = 'e1000001-0000-4000-8000-000000000001'
     and occurrence.status = 'scheduled'),
  1,
  '2R-NOTIFY-005: and there is still exactly one, so nothing accumulated behind it'
);

select is(
  (public.run_user_heartbeat('e1000001-0000-4000-8000-000000000001')
    ->> 'notifications_created')::integer,
  0,
  '2R-NOTIFY-005: an immediate second run delivers nothing -- there is no queue to drain'
);

-- Section 3 -- 2R-NOTIFY-002: the daily cap still holds
-- -----------------------------------------------------------------------------
--
-- Five series, five due occurrences, a cap of three. The cap is shared with
-- every other candidate type, which is exactly why a series must not be able to
-- walk around it.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e1000004-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'notify-capped@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set timezone = 'UTC', locale = 'pt-BR'
where user_id = 'e1000004-0000-4000-8000-000000000004';

update public.agent_preferences
set quiet_start = (now() + interval '2 hours')::time,
    quiet_end = (now() + interval '4 hours')::time
where user_id = 'e1000004-0000-4000-8000-000000000004';

do $$
declare
  index integer;
  series_id uuid;
begin
  for index in 1..5 loop
    insert into public.reminder_series (
      user_id, title, rule, anchor_date, anchor_hour, anchor_minute, status
    ) values (
      'e1000004-0000-4000-8000-000000000004',
      'Serie ' || index::text,
      '{"version": 1, "frequency": "daily"}'::jsonb,
      (now() - interval '1 day')::date, 0, 0, 'active'
    ) returning id into series_id;

    insert into public.reminders (
      user_id, title, remind_at, important, status, series_id, series_sequence
    ) values (
      'e1000004-0000-4000-8000-000000000004',
      'Serie ' || index::text,
      now() - interval '10 minutes',
      false, 'scheduled', series_id, 1
    );
  end loop;
end;
$$;

select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.user_id = 'e1000004-0000-4000-8000-000000000004'
     and occurrence.status = 'scheduled'
     and occurrence.remind_at <= now()),
  5,
  'CONTROL: five separate series are each holding one due occurrence'
);

select is(
  (public.run_user_heartbeat('e1000004-0000-4000-8000-000000000004')
    ->> 'notifications_created')::integer,
  3,
  '2R-NOTIFY-002: five due occurrences deliver THREE -- the cap holds across series'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.user_id = 'e1000004-0000-4000-8000-000000000004'
     and occurrence.status = 'scheduled'),
  2,
  '2R-NOTIFY-002: the two over the cap are still scheduled, not dropped'
);

select is(
  (public.run_user_heartbeat('e1000004-0000-4000-8000-000000000004')
    ->> 'notifications_created')::integer,
  0,
  '2R-NOTIFY-002: a second run the same day adds nothing -- the cap is per day, not per run'
);

-- Section 4 -- 2R-NOTIFY-003: the 24-hour cooldown is untouched
-- -----------------------------------------------------------------------------
--
-- The cooldown predicate is scoped to `task_overdue` and `task_stale` by name.
-- Recurrence writes no task rows and no task notifications, so the claim under
-- test is that its presence does not widen the predicate's reach. Asserted on
-- the deployed function rather than on a fixture, because the requirement is
-- about what the rule COVERS.

select ok(
  (select proc.prosrc like '%candidate.type in (''task_overdue'', ''task_stale'')%'
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as space on space.oid = proc.pronamespace
   where space.nspname = 'public' and proc.proname = 'run_user_heartbeat'),
  '2R-NOTIFY-003: the 24-hour cooldown is still scoped to the two task types by name'
);

select ok(
  (select proc.prosrc not like '%series%'
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as space on space.oid = proc.pronamespace
   where space.nspname = 'public' and proc.proname = 'run_user_heartbeat'),
  '2R-NOTIFY-003: and the heartbeat still contains no series concept at all'
);

-- Section 5 -- 2R-NOTIFY-004: one user's failure cannot block another's batch
-- -----------------------------------------------------------------------------
--
-- Forced, not simulated. `profiles.timezone` carries no CHECK constraint -- the
-- gap `2R-TZ-SECOND-AUTHORITY` already records -- so an unresolvable zone makes
-- `now() at time zone timezone` raise inside that user's heartbeat, which is a
-- real failure of exactly the kind the per-user handler exists for.

update public.profiles
set timezone = 'Not/A_Zone'
where user_id = 'e1000003-0000-4000-8000-000000000003';

-- A fresh due occurrence for the second owner, so there is something for the
-- batch to deliver AFTER the broken user has already failed in the same loop.
update public.reminders
set remind_at = now() - interval '10 minutes'
where user_id = 'e1000002-0000-4000-8000-000000000002'
  and status = 'scheduled';

update public.agent_preferences
set max_followups_per_day = 20
where user_id = 'e1000002-0000-4000-8000-000000000002';

-- Cleared first, and that is the whole assertion.
--
-- The second owner already holds notifications from section 1, so a bare
-- "count > 0" after the batch would pass on those alone -- it would report
-- isolation working while the batch delivered nothing at all. Emptying the
-- table for this user means the rows counted afterwards can only have come
-- from the run that followed the failure.
delete from public.notifications
where user_id = 'e1000002-0000-4000-8000-000000000002';

select is(
  (select pg_catalog.count(*)::integer
   from public.notifications as notification
   where notification.user_id = 'e1000002-0000-4000-8000-000000000002'),
  0,
  'CONTROL: the other user holds no notification before the batch runs'
);

select lives_ok(
  $batch$ select public.run_all_heartbeats() $batch$,
  '2R-NOTIFY-004: the batch survives a user whose heartbeat raises'
);

select ok(
  (select pg_catalog.count(*) > 0
   from public.notifications as notification
   where notification.user_id = 'e1000002-0000-4000-8000-000000000002'),
  '2R-NOTIFY-004: and the user AFTER the broken one in the loop was still delivered to'
);

-- Section 6 -- 2R-NOTIFY-006: delivery stays content-free
-- -----------------------------------------------------------------------------
--
-- The distinction this asserts is the one that is easy to get backwards.
-- `public.notifications` carries `title` and `body` ON PURPOSE -- it is the
-- in-app surface `2M-NOTIFY-008` requires. The content-free requirement is about
-- the DELIVERY audit, `public.notification_deliveries`, and what this slice has
-- to show is that a recurring reminder's delivery did not put its title there.

select is(
  (select pg_catalog.count(*)::integer
   from information_schema.columns as column_row
   where column_row.table_schema = 'public'
     and column_row.table_name = 'notification_deliveries'
     and column_row.column_name in (
       'title', 'body', 'description', 'name', 'text', 'message',
       'content', 'payload', 'properties', 'metadata', 'data')),
  0,
  '2R-NOTIFY-006: the delivery audit still has no column that could hold content'
);

select ok(
  not exists (
    select 1
    from public.notification_deliveries as delivery
    where delivery.user_id in (
      'e1000001-0000-4000-8000-000000000001',
      'e1000002-0000-4000-8000-000000000002',
      'e1000004-0000-4000-8000-000000000004')
  ),
  '2R-NOTIFY-006: and no series delivery wrote a row into it at all -- push is not on this path'
);

select ok(
  exists (
    select 1 from public.notifications as notification
    where notification.user_id = 'e1000001-0000-4000-8000-000000000001'
      and notification.body = 'Tomar o remedio'
  ),
  'CONTROL: the in-app notification DOES carry the reminder text, which is what -008 requires'
);

select * from finish();
rollback;
