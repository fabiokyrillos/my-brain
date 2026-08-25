-- Phase 2S slice 2S.2 -- the four scopes, proved one at a time, and the two
-- dispositions proved by CALLING the heartbeat rather than by reading its rule.
--
-- NO MIGRATION. This suite adds assertions over the schema slice 2S.1 already
-- deployed; Phase 2S's one migration is spent and a second is a stop condition.
--
-- WHY THIS FILE EXISTS AT ALL
-- ---------------------------------------------------------------------------
-- Three of slice 2S.2's requirements cannot be satisfied by a component test,
-- because they are about what the DATABASE does after the surface has acted:
--
--   2S-ANSWER-004  a dismissed notice is not re-created for the same
--                  subject-day -- "calling the function again after a dismissal
--                  produces no duplicate"
--   2S-ANSWER-008  descartar removes the message and nothing else -- "the
--                  subject still produces a notice when the cadence next
--                  permits one, proved by CALLING run_user_heartbeat rather
--                  than by reading the rule"
--   2S-SILENCE-011 the four scopes are four different things -- "exercised one
--                  at a time; after each, the other three subjects of change
--                  are read and asserted UNCHANGED"
--
-- Every one of those sentences contains a verb the TypeScript suite cannot
-- perform. Slice 2R.1 matched substrings against a function's source and proved
-- nothing about behaviour; this file calls the function.
--
-- WHY THE CLOCK IS NOT MOVED
-- ---------------------------------------------------------------------------
-- now() is fixed inside a transaction, so "wait until tomorrow" is not
-- available. The cadence is exercised by planting notices whose dedupe_key
-- carries a chosen local date, which is exactly what the deployed clauses read:
--
--   (A) notification.dedupe_key = candidate.dedupe_key   -- exact, unbounded
--   (B) a 24-hour cooldown on task_overdue and task_stale
--   (C) the backoff ladder, counting notices since tasks.updated_at
--   (D) the suppression consult slice 2S.1 added
--
-- A notice planted with TODAY's key blocks under (A) whatever its status; one
-- planted with a PAST key and a past created_at clears (A), (B) and (C), so the
-- subject speaks again. That asymmetry is the whole of 2S-ANSWER-004 and
-- 2S-ANSWER-008, and each is the other's control.
--
-- WHY EVERY DENIAL HAS A PLANTED SUBJECT
-- ---------------------------------------------------------------------------
-- "no suppression exists after marking read" is satisfied by an empty table.
-- Section 3 proves the silencing verbs DO create a row, and every "unchanged"
-- assertion reads a row that was planted and proved present first.
--
-- WHY THE TASK IS NEVER UPDATED
-- ---------------------------------------------------------------------------
-- tasks_updated_at is a BEFORE UPDATE trigger, so any write to the task
-- rewrites updated_at to now() and the subject stops being stale. The task is
-- therefore only ever READ, and "unchanged" is a comparison against a baseline
-- captured before the first verb runs.
--
-- WHY THE VOCABULARY IS PROVED BY WRITING, NOT BY PARSING
-- ---------------------------------------------------------------------------
-- 2S-ANSWER-006 asks that every disposition the schema allows be reachable or a
-- named refusal. A first draft read pg_get_constraintdef and counted quoted
-- literals in it -- which measures how this PostgreSQL version happens to
-- deparse a check constraint, not what the constraint does. Section 5 writes
-- each member and then writes a non-member, and reads the refusal.
--
-- WHY EVERY ROW-PRODUCING CALL SITS INSIDE AN ASSERTION
-- ---------------------------------------------------------------------------
-- supabase test db parses TAP, and a bare `select helper()` emits a result row
-- into that stream. Every arrangement below is therefore the argument of an
-- assertion whose expected value is the arrangement's own size.
--
-- WHY EACH ARRANGEMENT IS ONE plpgsql CALL
-- ---------------------------------------------------------------------------
-- A first draft wrote `pg_temp.reset_state() + pg_temp.plant(...)`. SQL does
-- not guarantee the evaluation order of an operator's arguments, so the plant
-- could have run first and been deleted by the reset -- a suite that would have
-- failed for a reason having nothing to do with the product. The order is now
-- inside plpgsql, where it is a sequence of statements.
--
-- Written in pure ASCII.

begin;
select plan(42);

set local timezone to 'UTC';

-- Fixtures --------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f3000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'disposition-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- UPDATE, not INSERT: auth.users carries a trigger that writes the profile row.
-- UTC so the local date inside a dedupe_key and this session's date are the
-- same reading, which is what makes every planted key predictable.
update public.profiles set timezone = 'UTC'
  where user_id = 'f3000001-0000-4000-8000-000000000001';

-- Pinned AHEAD of now() so the current hour is outside the window in BOTH
-- branches of the function's comparison -- the wrapping one and the plain one --
-- and the suite cannot flake on the hour CI happens to run.
update public.agent_preferences
set quiet_start = (now() + interval '2 hours')::time,
    quiet_end = (now() + interval '4 hours')::time
where user_id = 'f3000001-0000-4000-8000-000000000001';

-- A stale candidate: inbox is not an excluded status, no due date, and last
-- touched far enough back to clear the seven-day default. 400 days puts the
-- backoff anchor before every planted notice, so clause (C) counts them all.
insert into public.tasks (id, user_id, title, status, updated_at) values
  ('f4000001-0000-4000-8000-000000000001', 'f3000001-0000-4000-8000-000000000001',
   'Uma tarefa parada', 'inbox', now() - interval '400 days');

-- The baseline every "the task did not change" assertion compares against,
-- captured before any verb runs.
create temporary table task_baseline as
  select status, title, updated_at, completed_at, cancelled_at, due_at
  from public.tasks
  where id = 'f4000001-0000-4000-8000-000000000001';

-- Helpers, all created BEFORE any role switch: pg_temp needs TEMP privilege on
-- the database and authenticated does not have it, so a helper defined after
-- `set local role` fails on the CREATE and names the wrong subject.

create function pg_temp.reset_state() returns integer language plpgsql as $$
begin
  delete from public.notifications
  where user_id = 'f3000001-0000-4000-8000-000000000001';
  delete from public.notification_suppressions
  where user_id = 'f3000001-0000-4000-8000-000000000001';
  return 0;
end;
$$;

create function pg_temp.plant(p_key text, p_status text, p_age interval)
returns integer language plpgsql as $$
begin
  insert into public.notifications
    (user_id, type, title, body, action_url, priority, status, dedupe_key, created_at)
  values (
    'f3000001-0000-4000-8000-000000000001', 'task_stale', 'Tarefa sem movimento',
    'Uma tarefa parada', '/pt-BR/app/work/f4000001-0000-4000-8000-000000000001',
    'normal', p_status, p_key, now() - p_age
  );
  return (
    select pg_catalog.count(*)::integer from public.notifications
    where user_id = 'f3000001-0000-4000-8000-000000000001'
  );
end;
$$;

create function pg_temp.beat() returns integer language plpgsql as $$
begin
  perform public.run_user_heartbeat('f3000001-0000-4000-8000-000000000001');
  return (
    select pg_catalog.count(*)::integer from public.notifications
    where user_id = 'f3000001-0000-4000-8000-000000000001'
      and type = 'task_stale'
  );
end;
$$;

create function pg_temp.clean_beat() returns integer language plpgsql as $$
begin
  perform pg_temp.reset_state();
  return pg_temp.beat();
end;
$$;

-- Today's key, spelled the way the deployed function spells it:
-- local_date := (now() at time zone user_timezone)::date, and the owner is UTC.
create function pg_temp.today_key() returns text language sql stable as $$
  select 'stale:f4000001-0000-4000-8000-000000000001:'
    || ((now() at time zone 'UTC')::date)::text;
$$;

create function pg_temp.past_key(p_days integer) returns text language sql stable as $$
  select 'stale:f4000001-0000-4000-8000-000000000001:'
    || ((now() at time zone 'UTC')::date - p_days)::text;
$$;

create function pg_temp.arrange_one(p_key text, p_status text, p_age interval)
returns integer language plpgsql as $$
begin
  perform pg_temp.reset_state();
  return pg_temp.plant(p_key, p_status, p_age);
end;
$$;

-- Two notices about ONE subject, both unread, neither carrying today's date --
-- so no section can change another's cadence by accident.
create function pg_temp.arrange_two() returns integer language plpgsql as $$
begin
  perform pg_temp.reset_state();
  perform pg_temp.plant(pg_temp.past_key(30), 'unread', interval '30 days');
  return pg_temp.plant(pg_temp.past_key(31), 'unread', interval '31 days');
end;
$$;

create function pg_temp.status_of(p_key text) returns text language sql stable as $$
  select notification.status from public.notifications notification
  where notification.user_id = 'f3000001-0000-4000-8000-000000000001'
    and notification.dedupe_key = p_key;
$$;

create function pg_temp.rows_with(p_key text) returns integer language sql stable as $$
  select pg_catalog.count(*)::integer from public.notifications notification
  where notification.user_id = 'f3000001-0000-4000-8000-000000000001'
    and notification.dedupe_key = p_key;
$$;

create function pg_temp.suppressions() returns integer language sql stable as $$
  select pg_catalog.count(*)::integer from public.notification_suppressions
  where user_id = 'f3000001-0000-4000-8000-000000000001'
    and entity_id = 'f4000001-0000-4000-8000-000000000001';
$$;

create function pg_temp.scope_of() returns text language sql stable as $$
  select suppression.scope from public.notification_suppressions suppression
  where suppression.user_id = 'f3000001-0000-4000-8000-000000000001';
$$;

-- The subject of change the message verbs must never touch.
create function pg_temp.task_unchanged() returns boolean language sql stable as $$
  select exists (
    select 1
    from public.tasks task, pg_temp.task_baseline baseline
    where task.id = 'f4000001-0000-4000-8000-000000000001'
      and task.status = baseline.status
      and task.title = baseline.title
      and task.updated_at = baseline.updated_at
      and task.completed_at is not distinct from baseline.completed_at
      and task.cancelled_at is not distinct from baseline.cancelled_at
      and task.due_at is not distinct from baseline.due_at
  );
$$;

-- Writes one disposition onto the five-day-old notice and reports whether the
-- database accepted it. Section 5's whole method.
create function pg_temp.set_status(p_status text) returns text language plpgsql as $$
begin
  update public.notifications
  set status = p_status
  where user_id = 'f3000001-0000-4000-8000-000000000001'
    and dedupe_key = pg_temp.past_key(5);
  return 'ACCEPTED';
exception when others then
  return 'REFUSED';
end;
$$;

-- Section 0 -- the fixture is servable, so every zero below is a real zero
-- -----------------------------------------------------------------------------

select is(
  (select lifecycle.status from public.account_lifecycle as lifecycle
   where lifecycle.user_id = 'f3000001-0000-4000-8000-000000000001'),
  'active',
  '2S-ANSWER-004: the owner is active, so the heartbeat will not skip them before reading anything'
);

select ok(
  (select preferences.max_followups_per_day from public.agent_preferences as preferences
   where preferences.user_id = 'f3000001-0000-4000-8000-000000000001') >= 1,
  '2S-ANSWER-004: the daily cap leaves at least one slot, so a withheld notice means the CADENCE withheld it'
);

select is(
  pg_temp.clean_beat(),
  1,
  '2S-ANSWER-004: with nothing planted the subject DOES speak -- the probe can be non-zero'
);

select is(
  pg_temp.status_of(pg_temp.today_key()),
  'unread',
  '2S-ANSWER-006: `unread` is reachable, and it is what the heartbeat writes'
);

-- Section 1 -- 2S-ANSWER-004: a dismissed notice is not re-created for the day
-- -----------------------------------------------------------------------------
-- The planted notice carries TODAY's key and is two days old, so clause (B)'s
-- 24-hour cooldown and clause (C)'s one-day rung are both satisfied. Only the
-- exact-key clause can withhold the candidate -- and it reads the key, never
-- the status, which is precisely what makes a dismissal not a reset.

select is(
  pg_temp.arrange_one(pg_temp.today_key(), 'dismissed', interval '2 days'),
  1,
  '2S-ANSWER-004: one dismissed notice for today is planted'
);

select is(
  pg_temp.beat(),
  1,
  '2S-ANSWER-004: calling the heartbeat again after a dismissal produces NO duplicate'
);

select is(
  pg_temp.rows_with(pg_temp.today_key()),
  1,
  '2S-ANSWER-004: exactly one row carries the subject-day key, not two'
);

select is(
  pg_temp.status_of(pg_temp.today_key()),
  'dismissed',
  '2S-ANSWER-004: and the dismissal was not overwritten back to unread'
);

-- Section 2 -- 2S-ANSWER-008: the cadence is untouched, proved by calling
-- -----------------------------------------------------------------------------
-- The same dismissal, five days back and carrying that day's key. (A) no longer
-- matches, (B) is long past and (C)'s first rung is cleared -- so if dismissal
-- had silenced the SUBJECT rather than the MESSAGE, this call would produce
-- nothing. It is section 1's control and a requirement in its own right.

select is(
  pg_temp.arrange_one(pg_temp.past_key(5), 'dismissed', interval '5 days'),
  1,
  '2S-ANSWER-008: one dismissed notice, dated five days back, is planted'
);

select is(
  pg_temp.beat(),
  2,
  '2S-ANSWER-008: the subject speaks again when the cadence next permits -- a dismissal is not a suppression'
);

select is(
  pg_temp.status_of(pg_temp.today_key()),
  'unread',
  '2S-ANSWER-008: and the new notice arrives unread'
);

select is(
  pg_temp.status_of(pg_temp.past_key(5)),
  'dismissed',
  '2S-ANSWER-008: while the dismissed one stays dismissed'
);

select ok(
  pg_temp.task_unchanged(),
  '2S-ANSWER-008: and the task itself was never touched by any of it'
);

-- Section 3 -- 2S-SILENCE-011: four scopes, one at a time
-- -----------------------------------------------------------------------------
-- Each block applies exactly one verb and then reads the other three subjects
-- of change. A control that moved two of them fails here.
--
-- The two message verbs are applied as the OWNER through the same UPDATE the
-- Server Action issues, so RLS is part of the proof rather than bypassed by
-- running as postgres. Every READ is taken after `reset role`, so a zero is a
-- real zero rather than a zero RLS produced.

select is(
  pg_temp.arrange_two(),
  2,
  '2S-SILENCE-011: two notices about ONE subject are planted, both unread'
);

-- 3a -- *Lida*: this message's status, and nothing else.

set local role authenticated;
set local request.jwt.claims to '{"sub":"f3000001-0000-4000-8000-000000000001","role":"authenticated"}';

update public.notifications
set status = 'read', read_at = now()
where user_id = 'f3000001-0000-4000-8000-000000000001'
  and dedupe_key = 'stale:f4000001-0000-4000-8000-000000000001:'
    || ((now() at time zone 'UTC')::date - 30)::text;

reset role;

select is(
  pg_temp.status_of(pg_temp.past_key(30)),
  'read',
  '2S-ANSWER-007: *Lida* moved THIS message, through RLS, as the owner'
);

select is(
  pg_temp.status_of(pg_temp.past_key(31)),
  'unread',
  '2S-ANSWER-007: the other message about the same subject is still unread'
);

select is(
  pg_temp.suppressions(),
  0,
  '2S-ANSWER-007: and no suppression was created'
);

select ok(
  pg_temp.task_unchanged(),
  '2S-ANSWER-007: and the subject task is unchanged in every column that could have moved'
);

-- 3b -- *Descartar*: this message's presence, and nothing else.

select is(
  pg_temp.arrange_two(),
  2,
  '2S-SILENCE-011: re-arranged for the dismissal scope'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"f3000001-0000-4000-8000-000000000001","role":"authenticated"}';

update public.notifications
set status = 'dismissed', read_at = null
where user_id = 'f3000001-0000-4000-8000-000000000001'
  and dedupe_key = 'stale:f4000001-0000-4000-8000-000000000001:'
    || ((now() at time zone 'UTC')::date - 30)::text;

reset role;

select is(
  pg_temp.status_of(pg_temp.past_key(30)),
  'dismissed',
  '2S-ANSWER-003: *descartar* is a different outcome from *lida*, and this is the row that proves it'
);

select is(
  pg_temp.status_of(pg_temp.past_key(31)),
  'unread',
  '2S-SILENCE-011: *descartar* left the other message about the same subject alone'
);

select is(
  pg_temp.suppressions(),
  0,
  '2S-SILENCE-011: *descartar* created no suppression -- it is not a silencing verb'
);

select ok(
  pg_temp.task_unchanged(),
  '2S-SILENCE-011: *descartar* left the task alone'
);

-- 3c -- *Silenciar por um tempo*: the cadence, and nothing else.

select is(
  pg_temp.arrange_two(),
  2,
  '2S-SILENCE-011: re-arranged for the temporary silence scope'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"f3000001-0000-4000-8000-000000000001","role":"authenticated"}';

select ok(
  (public.suppress_notification_subject(
     'task', 'f4000001-0000-4000-8000-000000000001', 'until',
     now() + interval '3 days', null, 'silencio temporario'
   ) ->> 'suppression_id') is not null,
  '2S-SILENCE-007: the owner can suppress from a notice, through the RPC slice 2S.1 deployed'
);

reset role;

select is(
  pg_temp.suppressions(),
  1,
  '2S-SILENCE-011: *silenciar por um tempo* created exactly one suppression'
);

select is(
  pg_temp.scope_of(),
  'until',
  '2S-SILENCE-011: and it is the bounded one'
);

select is(
  pg_temp.status_of(pg_temp.past_key(30)) || '/' || pg_temp.status_of(pg_temp.past_key(31)),
  'unread/unread',
  '2S-SILENCE-011: neither message moved -- silencing the subject is not answering the notice'
);

select ok(
  pg_temp.task_unchanged(),
  '2S-SILENCE-011: and the task did not move either'
);

-- 3d -- *Silenciar este assunto*: the cadence, permanently, and nothing else.

select is(
  pg_temp.arrange_two(),
  2,
  '2S-SILENCE-011: re-arranged for the permanent scope -- and the prior suppression is gone with it'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"f3000001-0000-4000-8000-000000000001","role":"authenticated"}';

select ok(
  (public.suppress_notification_subject(
     'task', 'f4000001-0000-4000-8000-000000000001', 'forever',
     null, null, 'silencio permanente'
   ) ->> 'suppression_id') is not null,
  '2S-SILENCE-008: the same call the attention surface makes -- one authority, two surfaces'
);

reset role;

select is(
  pg_temp.suppressions(),
  1,
  '2S-SILENCE-011: *silenciar este assunto* created exactly one suppression'
);

select is(
  pg_temp.scope_of(),
  'forever',
  '2S-SILENCE-011: and it is the unbounded one, which is a different sentence'
);

select is(
  pg_temp.status_of(pg_temp.past_key(30)) || '/' || pg_temp.status_of(pg_temp.past_key(31)),
  'unread/unread',
  '2S-SILENCE-011: neither message moved'
);

select ok(
  pg_temp.task_unchanged(),
  '2S-SILENCE-011: and neither did the task'
);

-- Section 4 -- the silence reached the source, from the state this slice leaves
-- -----------------------------------------------------------------------------
-- 3d's permanent suppression is still in place, and the subject has NO notice
-- for today -- so clause (A) cannot be what withholds it. Section 2 already
-- proved that exact arrangement produces a notice. Only (D) differs.

select is(
  pg_temp.beat(),
  2,
  '2S-SILENCE-011: with the subject silenced the heartbeat adds nothing -- the silencing verb reached the SOURCE, which is what it claims to change'
);

-- Section 5 -- 2S-ANSWER-006: every disposition reachable, and nothing else is
-- -----------------------------------------------------------------------------

select is(
  pg_temp.arrange_one(pg_temp.past_key(5), 'unread', interval '5 days'),
  1,
  '2S-ANSWER-006: one notice to write dispositions onto'
);

select is(
  pg_temp.set_status('unread'),
  'ACCEPTED',
  '2S-ANSWER-006: `unread` is writable'
);

select is(
  pg_temp.set_status('read'),
  'ACCEPTED',
  '2S-ANSWER-006: `read` is writable -- the disposition *Lida* sends'
);

select is(
  pg_temp.set_status('dismissed'),
  'ACCEPTED',
  '2S-ANSWER-006: `dismissed` is writable -- the disposition slice 2S.0 measured as unreachable'
);

select is(
  pg_temp.set_status('archived'),
  'REFUSED',
  '2S-ANSWER-006: a fourth disposition is refused BY NAME, so the vocabulary is closed at three'
);

select is(
  pg_temp.status_of(pg_temp.past_key(5)),
  'dismissed',
  '2S-ANSWER-006: and the refusal left the row where the last accepted write put it'
);

select * from finish();
rollback;
