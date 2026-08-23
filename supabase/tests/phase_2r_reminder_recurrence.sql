-- Phase 2R slice 2R.1 -- the recurrence model, migration 202608230101.
--
-- WHAT THIS SUITE IS FOR
-- ---------------------------------------------------------------------------
-- The migration's own post-deploy block asserts the catalog state and the three
-- signed daylight-saving cases once, at apply time. This suite asserts them
-- again from an EMPTY DATABASE on every CI run, and then does the things a
-- catalog read cannot: it exercises the closed rule set at the CHECK
-- constraint, the ownership boundary from a SECOND owner's point of view, the
-- one-live-occurrence invariant under a deliberate second insert, the
-- materialisation trigger in both its on-time and its long-overdue shapes, and
-- every series command with its undo.
--
-- WHY THE DENIAL ASSERTIONS ARE NOT VACUOUS
-- ---------------------------------------------------------------------------
-- "insert into public.reminder_series fails as authenticated" proves nothing on
-- its own -- it fails just as readily if the role could not see the table at
-- all. Section 6 therefore proves the owner's own series IS visible to that
-- same role in that same transaction first, so the only remaining explanation
-- for a write refusal is the missing privilege.
--
-- WHY THERE ARE TWO OWNERS
-- ---------------------------------------------------------------------------
-- "a stranger cannot reach this series" is satisfiable by an empty database
-- unless the stranger's series provably exists. It is inserted and asserted
-- present before it is probed.
--
-- WHY THE CLOCK IS PINNED
-- ---------------------------------------------------------------------------
-- Materialisation compares against now(), so a suite that used real dates would
-- pass in August and fail in November. Every fixture instant is expressed
-- relative to now() or is a fixed historical date whose daylight-saving
-- behaviour is a property of the IANA database rather than of today.
--
-- Written in pure ASCII, following the doctrine of
-- `reminder_lifecycle_command.sql`.

begin;
select plan(83);

set local timezone to 'UTC';

-- Fixtures -------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d1000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'series-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d1000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'series-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Profiles, so private.reminder_owner_timezone has a zone to resolve rather
-- than falling through to its default by accident. The owner is deliberately
-- given a zone WITH a daylight-saving rule so the assertions exercise a real
-- transition rather than a fixed offset.
--
-- UPDATE, not INSERT, and the difference is not cosmetic: `auth.users` carries
-- an `on_auth_user_created` trigger that writes the profile row itself, so an
-- explicit insert here collides on `profiles_pkey`. Found by rehearsing this
-- fixture against a real Postgres before pushing; it would otherwise have been
-- a CI cycle spent on a duplicate key.
update public.profiles set timezone = 'America/New_York'
  where user_id = 'd1000001-0000-4000-8000-000000000001';
update public.profiles set timezone = 'America/Sao_Paulo'
  where user_id = 'd1000002-0000-4000-8000-000000000002';

insert into public.tasks (id, user_id, title, status) values
  ('d1100001-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001',
   'A task a series may link to', 'todo');

-- Helpers ---------------------------------------------------------------------
--
-- **Every one is created HERE, before any `set local role`, and that is not
-- tidiness.** Creating a function in `pg_temp` needs TEMP privilege on the
-- database, which `authenticated` is not granted -- so a helper defined after a
-- role switch fails on the CREATE rather than on the thing it was written to
-- test, and the failure names the wrong subject. `reminder_lifecycle_command.sql`
-- puts its helper at the top for the same reason.

create function pg_temp.series_insert_refused(p_rule jsonb) returns boolean
language plpgsql as $$
begin
  insert into public.reminder_series (user_id, title, rule, anchor_date, anchor_hour, anchor_minute)
  values ('d1000001-0000-4000-8000-000000000001', 'probe', p_rule, current_date, 9, 0);
  return false;
exception when check_violation then
  return true;
end;
$$;

create function pg_temp.create_daily(p_key text) returns jsonb
language sql as $$
  select public.create_reminder_series_v1(
    '{"version":1,"frequency":"daily"}'::jsonb,
    'Take the medication',
    false,
    null,
    (now() at time zone 'America/New_York')::date,
    9, 0,
    p_key
  );
$$;

create function pg_temp.second_live_refused() returns boolean
language plpgsql as $$
declare
  target uuid;
begin
  select series.id into target from public.reminder_series as series limit 1;
  insert into public.reminders (user_id, title, remind_at, status, series_id, series_sequence)
  values ('d1000001-0000-4000-8000-000000000001', 'a second live occurrence',
          now() + interval '2 days', 'scheduled', target, 99);
  return false;
exception when unique_violation then
  return true;
end;
$$;

create function pg_temp.direct_series_write_refused() returns boolean
language plpgsql as $$
begin
  insert into public.reminder_series (user_id, title, rule, anchor_date, anchor_hour, anchor_minute)
  values ('d1000001-0000-4000-8000-000000000001', 'direct',
          '{"version":1,"frequency":"daily"}'::jsonb, current_date, 9, 0);
  return false;
exception when insufficient_privilege then
  return true;
end;
$$;

create function pg_temp.live_occurrence() returns public.reminders
language sql stable as $$
  select occurrence.* from public.reminders as occurrence
  where occurrence.series_id is not null
    and occurrence.detached_at is null
    and occurrence.status = 'scheduled'
    and occurrence.user_id = 'd1000001-0000-4000-8000-000000000001'
  limit 1;
$$;

create function pg_temp.owned_series() returns uuid
language sql as $$
  select series.id from public.reminder_series as series
  where series.user_id = 'd1000001-0000-4000-8000-000000000001' limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Section 1 -- the grant and policy posture (11)
-- ---------------------------------------------------------------------------
--
-- 2R-TRUST-004 and 2R-TRUST-005. The new table is STRICTER than public
-- .reminders: select only, with every write behind a SECURITY DEFINER
-- boundary. And Phase 2F's revocation on public.reminders must survive this
-- migration untouched.

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.reminder_series', 'select'),
  'authenticated may read its own series'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminder_series', 'insert'),
  'authenticated holds no INSERT on public.reminder_series -- 2R-TRUST-005'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminder_series', 'update'),
  'authenticated holds no UPDATE on public.reminder_series'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminder_series', 'delete'),
  'authenticated holds no DELETE on public.reminder_series -- ending is a status'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.reminder_series', 'select'),
  'anon holds nothing on public.reminder_series'
);
-- service_role too, and this one is not decoration.
--
-- A table created in `public` inherits this project's DEFAULT PRIVILEGES, which
-- grant every API role everything the moment it exists -- so `grant select` on
-- its own leaves INSERT, UPDATE and DELETE in place and reads exactly like a
-- lock-down. The migration shipped that wording once and the post-deploy block
-- caught it on the first chain run against an empty database. These assertions
-- are the second reader of the same fact.
select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.reminder_series', 'select'),
  'service_role holds nothing on public.reminder_series either -- nothing needs it'
);
select is(
  (select pg_catalog.string_agg(distinct grants.privilege_type::text, ',' order by grants.privilege_type::text)
   from information_schema.role_table_grants as grants
   where grants.table_schema = 'public' and grants.table_name = 'reminder_series'
     and grants.grantee = 'authenticated'),
  'SELECT',
  'authenticated holds EXACTLY select on public.reminder_series, and nothing beside it'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'update'),
  'Phase 2F revocation survives: authenticated still holds no UPDATE on reminders'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'delete'),
  'Phase 2F revocation survives: authenticated still holds no DELETE on reminders'
);
select policies_are(
  'public',
  'reminder_series',
  array['reminder_series_select_own'],
  'the series carries exactly one policy, and it is owner-scoped select'
);
select ok(
  (select relation.relrowsecurity and relation.relforcerowsecurity
   from pg_catalog.pg_class as relation
   join pg_catalog.pg_namespace as space on space.oid = relation.relnamespace
   where space.nspname = 'public' and relation.relname = 'reminder_series'),
  'public.reminder_series has RLS enabled AND forced'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the closed rule set, at the CHECK constraint (11)
-- ---------------------------------------------------------------------------
--
-- 2R-MODEL-002 and -003. Executed against the constraint rather than against
-- the predicate, because the predicate could be correct while nothing called
-- it. Each refusal is driven as a real insert that must fail.

select ok(
  private.reminder_rule_is_valid('{"version":1,"frequency":"daily"}'::jsonb),
  'daily is admitted'
);
select ok(
  private.reminder_rule_is_valid('{"version":1,"frequency":"weekly","weekdays":[1,3,5]}'::jsonb),
  'weekly on chosen weekdays is admitted'
);
select ok(
  private.reminder_rule_is_valid('{"version":1,"frequency":"monthlyDay","day":31}'::jsonb),
  'monthly by day-of-month is admitted, including the 31st'
);
select ok(
  private.reminder_rule_is_valid('{"version":1,"frequency":"monthlyWeekday","ordinal":-1,"weekday":5}'::jsonb),
  'monthly by ordinal weekday is admitted, including last'
);
select ok(
  private.reminder_rule_is_valid('{"version":1,"frequency":"yearly","month":2,"day":29}'::jsonb),
  'yearly is admitted, including 29 February'
);
select ok(
  not private.reminder_rule_is_valid('{"version":2,"frequency":"daily"}'::jsonb),
  '2R-MODEL-003: an unknown version is refused rather than guessed at'
);
select ok(
  not private.reminder_rule_is_valid('{"version":1,"frequency":"hourly"}'::jsonb),
  'a frequency outside the closed set is refused'
);
select ok(
  not private.reminder_rule_is_valid('{"version":1,"frequency":"daily","extra":1}'::jsonb),
  'an unsupported extra field is refused -- exact key-set equality'
);
select ok(
  not private.reminder_rule_is_valid('{"version":1,"frequency":"weekly","weekdays":[3,1]}'::jsonb),
  'a descending weekday list is refused, so one rule has one spelling'
);
select ok(
  not private.reminder_rule_is_valid('{"version":1,"frequency":"monthlyWeekday","ordinal":5,"weekday":5}'::jsonb),
  'a fifth ordinal is refused -- it would silently skip months'
);

-- The constraint itself, driven as an insert. Written as a DO block because a
-- failing statement would abort the whole suite otherwise.

select ok(
  pg_temp.series_insert_refused('{"version":1,"frequency":"hourly"}'::jsonb),
  'the CHECK constraint refuses an invalid rule even from a caller with direct access'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the wall clock, OD-2R-5's three signed cases (7)
-- ---------------------------------------------------------------------------
--
-- Postgres's own AT TIME ZONE disagrees with two of these, in opposite
-- directions, so each assertion is paired with the native answer it must NOT
-- produce. Without that pairing an assertion would pass on the day somebody
-- replaced the resolver with the one-line operator.

select is(
  private.reminder_resolve_local('2026-06-15 09:00'::timestamp, 'America/New_York'),
  '2026-06-15T13:00:00+00'::timestamptz,
  'an ordinary local time resolves exactly'
);
select is(
  private.reminder_resolve_local('2026-03-08 02:30'::timestamp, 'America/New_York'),
  '2026-03-08T07:00:00+00'::timestamptz,
  'OD-2R-5 case 1: a nonexistent local time advances to the FIRST VALID instant'
);
select isnt(
  private.reminder_resolve_local('2026-03-08 02:30'::timestamp, 'America/New_York'),
  ('2026-03-08 02:30'::timestamp at time zone 'America/New_York'),
  'and it is NOT what Postgres answers natively, which would be 03:30 local'
);
select is(
  private.reminder_resolve_local('2026-11-01 01:30'::timestamp, 'America/New_York'),
  '2026-11-01T05:30:00+00'::timestamptz,
  'OD-2R-5 case 2: a doubled local time takes the FIRST occurrence'
);
select isnt(
  private.reminder_resolve_local('2026-11-01 01:30'::timestamp, 'America/New_York'),
  ('2026-11-01 01:30'::timestamp at time zone 'America/New_York'),
  'and it is NOT what Postgres answers natively, which would be the second'
);
select ok(
  private.reminder_rule_matches_date(
    '{"version":1,"frequency":"monthlyDay","day":31}'::jsonb, '2026-02-28'::date),
  'OD-2R-5 case 3: the 31st in February is the 28th'
);
select ok(
  not private.reminder_rule_matches_date(
    '{"version":1,"frequency":"monthlyDay","day":31}'::jsonb, '2026-02-27'::date),
  'and it is not any other February day -- the clamp is exact, not approximate'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- creating a series (9)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select ok(
  (pg_temp.create_daily('phase2r-create-0001') ->> 'series_id') is not null,
  '2R-MODEL-001: a series is created through the validated boundary'
);
select is(
  (select pg_catalog.count(*)::integer from public.reminder_series),
  1,
  'exactly one series exists'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id is not null and occurrence.status = 'scheduled'),
  1,
  '2R-MODEL-005: exactly ONE concrete occurrence exists for it'
);
select is(
  (select occurrence.series_sequence
   from public.reminders as occurrence where occurrence.series_id is not null),
  1,
  'the first occurrence is sequence 1'
);
select ok(
  (select occurrence.remind_at > now()
   from public.reminders as occurrence where occurrence.series_id is not null),
  'the first occurrence is in the future, never in the past'
);
select is(
  pg_temp.create_daily('phase2r-create-0001') ->> 'replayed',
  'true',
  'a replayed operation key answers the same series rather than creating a second'
);
select is(
  (select pg_catalog.count(*)::integer from public.reminder_series),
  1,
  'and no second series was created by the replay'
);
select throws_ok(
  $$select public.create_reminder_series_v1(
      '{"version":1,"frequency":"hourly"}'::jsonb, 'x', false, null,
      current_date, 9, 0, 'phase2r-create-bad1')$$,
  '22023',
  'Invalid recurrence rule',
  '2R-MODEL-002: an invalid rule is refused with a named reason'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.undo_operations as operation
   where operation.action_type = 'create_reminder_series_v1'),
  1,
  'the creation recorded exactly one undoable operation'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- one live occurrence, enforced by the database (4)
-- ---------------------------------------------------------------------------
--
-- 2R-MODEL-007 asks for idempotency enforced BY THE DATABASE rather than by the
-- caller, so the proof is a caller that tries and is refused.

reset role;


select ok(
  pg_temp.second_live_refused(),
  '2R-MODEL-005/-007: a second live occurrence for one series is refused by a unique index'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id is not null and occurrence.status = 'scheduled'),
  1,
  'and the refusal left exactly one, not two'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'reminders_one_live_occurrence_per_series'
  ),
  'the invariant is an index, not a convention'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'reminders_series_sequence_key'
  ),
  'materialisation is idempotent by sequence, enforced by a second unique index'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- ownership, from the stranger's point of view (6)
-- ---------------------------------------------------------------------------

insert into public.reminder_series (
  id, user_id, title, rule, anchor_date, anchor_hour, anchor_minute
) values (
  'd1200002-0000-4000-8000-000000000002',
  'd1000002-0000-4000-8000-000000000002',
  'The stranger''s series',
  '{"version":1,"frequency":"daily"}'::jsonb,
  current_date, 8, 0
);

select is(
  (select pg_catalog.count(*)::integer from public.reminder_series),
  2,
  'the stranger''s series provably exists, so the probes below are not vacuous'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select pg_catalog.count(*)::integer from public.reminder_series),
  1,
  '2R-MODEL-008: the owner sees only their own series, under forced RLS'
);
select ok(
  (select pg_catalog.count(*)::integer from public.reminder_series
   where public.reminder_series.user_id = 'd1000001-0000-4000-8000-000000000001') = 1,
  'and the one they see is theirs -- the reader is not simply blind'
);
select throws_ok(
  $$select public.apply_reminder_series_command_v1(
      'd1200002-0000-4000-8000-000000000002', '{"kind":"end_series"}'::jsonb,
      'phase2r-stranger-001')$$,
  'P0002',
  'Series not found',
  'a foreign series is indistinguishable from a missing one'
);
select is(
  coalesce(
    (select series.status from public.reminder_series as series
     where series.id = 'd1200002-0000-4000-8000-000000000002'),
    'invisible'
  ),
  'invisible',
  'and the refusal did not change it -- it is still not even readable'
);


select ok(
  pg_temp.direct_series_write_refused(),
  '2R-TRUST-005: a plain client write is refused -- the RPC is the only way in'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- materialisation (8)
-- ---------------------------------------------------------------------------

reset role;

-- STABLE, deliberately: a VOLATILE function in an UPDATE ... WHERE may be
-- re-evaluated per candidate row and observe the statement's own effects, which
-- would make "cancel the live occurrence" cancel whatever the trigger had just
-- created. STABLE pins it to the statement snapshot.

-- The heartbeat's own write: status moves to `sent`. Nothing in this statement
-- knows a series exists, which is the point -- OD-2R-3 option A was signed so
-- run_user_heartbeat would not have to.
create temporary table pg_temp_target (id uuid) on commit drop;
insert into pg_temp_target (id) select (pg_temp.live_occurrence()).id;

update public.reminders
set status = 'sent', sent_at = now()
where id = (select target.id from pg_temp_target as target);

select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id is not null
     and occurrence.user_id = 'd1000001-0000-4000-8000-000000000001'),
  2,
  '2R-MODEL-006: completing an occurrence materialised exactly one more'
);
select is(
  (pg_temp.live_occurrence()).series_sequence,
  2,
  'the new occurrence is sequence 2'
);
select ok(
  (pg_temp.live_occurrence()).remind_at > now(),
  'and it is in the future'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.audit_logs as entry
   where entry.action_type = 'reminder_occurrence_materialised'
     and entry.actor = 'system'),
  1,
  '2R-TRUST-001: the automatic materialisation is audited, with actor `system`'
);

-- Idempotency: a second update that does not leave `scheduled` must not
-- materialise again, and neither must a repeated terminal write.
update public.reminders
set sent_at = now()
where status = 'sent' and series_id is not null;

select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id is not null
     and occurrence.user_id = 'd1000001-0000-4000-8000-000000000001'),
  2,
  '2R-MODEL-007: touching an already-completed occurrence materialises nothing'
);

-- The long-overdue shape. An occurrence a week in the past must not produce
-- yesterday's reminder: the next one is the first instant after now().
truncate pg_temp_target;
insert into pg_temp_target (id) select (pg_temp.live_occurrence()).id;

update public.reminders
set remind_at = now() - interval '7 days'
where id = (select target.id from pg_temp_target as target);
update public.reminders
set status = 'cancelled'
where id = (select target.id from pg_temp_target as target);

select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id is not null
     and occurrence.user_id = 'd1000001-0000-4000-8000-000000000001'),
  3,
  '2R-SERIES-006: cancelling ONE occurrence leaves the next materialised'
);
select ok(
  (pg_temp.live_occurrence()).remind_at > now(),
  '2R-NOTIFY-005: a week-late series skips forward rather than dripping a backlog'
);
select ok(
  (pg_temp.live_occurrence()).remind_at < now() + interval '2 days',
  'and it skips to the NEXT instant, not past the whole rule'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- the series commands and their undo (15)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


-- detach: THIS ONE only.
select is(
  public.apply_reminder_series_command_v1(
    pg_temp.owned_series(), '{"kind":"detach_occurrence"}'::jsonb, 'phase2r-detach-001'
  ) ->> 'scope',
  'occurrence',
  '2R-SERIES-001/-009: the narrower scope is applied and reported back'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id = pg_temp.owned_series() and occurrence.detached_at is not null),
  1,
  '2R-SERIES-002: the occurrence is detached and the series is untouched'
);
select is(
  (select series.rule from public.reminder_series as series where series.id = pg_temp.owned_series()),
  '{"version":1,"frequency":"daily"}'::jsonb,
  'the rule did not change -- THIS ONE means this one'
);
select ok(
  (pg_temp.live_occurrence()).id is not null,
  'and the series kept its place: a replacement occurrence is live'
);

-- edit_future: THIS AND FUTURE.
--
-- The two refusals come FIRST, and the partial edit that follows them is what
-- makes them meaningful. `edit_future` carries five optional fields and the
-- body reads each through `coalesce(..., the stored value)`, so the gate has to
-- be closed in one direction only: no key outside the set, and not "every key
-- of the set". A gate that demanded all six made the command unreachable, and
-- the success below -- which sends `rule` and `hour` and nothing else -- is the
-- assertion that would have caught it.
select throws_ok(
  $$select public.apply_reminder_series_command_v1(
      (select series.id from public.reminder_series as series limit 1),
      '{"kind":"edit_future","hour":7,"colour":"red"}'::jsonb,
      'phase2r-future-bad1')$$,
  '22023',
  'Unsupported series command field',
  '2R-MODEL-002: a key outside the command set is refused with a named reason'
);
select throws_ok(
  $$select public.apply_reminder_series_command_v1(
      (select series.id from public.reminder_series as series limit 1),
      '{"kind":"edit_future"}'::jsonb,
      'phase2r-future-bad2')$$,
  '22023',
  'An edit must change something',
  'and an edit that changes nothing is refused rather than recorded as an undoable no-op'
);
select is(
  public.apply_reminder_series_command_v1(
    pg_temp.owned_series(),
    '{"kind":"edit_future","rule":{"version":1,"frequency":"weekly","weekdays":[1]},"hour":7}'::jsonb,
    'phase2r-future-001'
  ) ->> 'scope',
  'future',
  '2R-SERIES-003: the wider scope is applied and reported back'
);
select is(
  (select series.rule ->> 'frequency' from public.reminder_series as series
   where series.id = pg_temp.owned_series()),
  'weekly',
  'the rule changed from this point'
);
select is(
  (select pg_catalog.date_part('isodow',
     ((pg_temp.live_occurrence()).remind_at at time zone 'America/New_York')::date::timestamp)::integer),
  1,
  'and the live occurrence moved to the new rule -- a Monday'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id = pg_temp.owned_series() and occurrence.detached_at is not null),
  1,
  '2R-SERIES-004: the detached occurrence stays detached across a series edit'
);

-- end_series: history survives.
select is(
  public.apply_reminder_series_command_v1(
    pg_temp.owned_series(), '{"kind":"end_series"}'::jsonb, 'phase2r-end-001'
  ) ->> 'scope',
  'series',
  'ending the series is its own scope'
);
select is(
  (select series.status from public.reminder_series as series where series.id = pg_temp.owned_series()),
  'ended',
  'the series is ended'
);
select ok(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id = pg_temp.owned_series()) >= 3,
  '2R-SERIES-005: ending destroyed no history -- every past occurrence is still there'
);
/*
 * Scoped to the ATTACHED occurrence, and the scope is the assertion.
 *
 * The detached one from the previous block is still `scheduled` -- detaching
 * changes `detached_at`, not `status` -- and ending the series deliberately
 * leaves it alone: a detached occurrence is the owner's one-off, no longer
 * governed by the rule, so ending the rule must not silently cancel it
 * (`2R-SERIES-004`). Counting every scheduled row here would have asserted the
 * opposite behaviour, and the first draft of this suite did exactly that.
 */
select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id = pg_temp.owned_series()
     and occurrence.detached_at is null
     and occurrence.status = 'scheduled'),
  0,
  'and it stopped the future one rather than leaving it armed'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id = pg_temp.owned_series()
     and occurrence.detached_at is not null
     and occurrence.status = 'scheduled'),
  1,
  '2R-SERIES-004: and the detached occurrence survived the series ending'
);

-- ---------------------------------------------------------------------------
-- Section 9 -- undo really restores (7)
-- ---------------------------------------------------------------------------
--
-- 2R-SERIES-007 asks for an undo that is EXERCISED rather than asserted, so
-- each of these runs the real router and then reads the row back.

-- The registry is read as the OWNER OF THE SCHEMA, not as the client, and that
-- is a property rather than a convenience: `authenticated` has no `usage` on
-- `private`, so this assertion is only reachable from outside the client role.
-- The suite ran it under `set local role authenticated` in its first version
-- and got `permission denied for schema private` -- the boundary asserting
-- itself against the test that forgot it.
reset role;

select is(
  (select pg_catalog.count(*)::integer
   from private.undo_operation_handlers
   where action_type in ('create_reminder_series_v1', 'apply_reminder_series_command_v1')),
  2,
  'both series operations have a registered compensation handler'
);

-- Back to the owner for the undo itself: 2R-SERIES-007 asks for the real router
-- exercised by the person entitled to call it, not by a superuser.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d1000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select ok(
  (public.undo_operation(
    (select operation.id from public.undo_operations as operation
     where operation.action_type = 'apply_reminder_series_command_v1'
       and operation.after_state ->> 'scope' = 'series'
     limit 1)
  )) is not null,
  'the end-series operation is undoable through the real router'
);
select is(
  (select series.status from public.reminder_series as series where series.id = pg_temp.owned_series()),
  'active',
  'and the undo restored the series to active'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.reminders as occurrence
   where occurrence.series_id = pg_temp.owned_series()
     and occurrence.detached_at is null
     and occurrence.status = 'scheduled'),
  1,
  'and re-armed the occurrence it had cancelled -- exactly one live again'
);
select is(
  (select pg_catalog.count(*)::integer
   from public.audit_logs as entry
   where entry.action_type = 'reminder_series_command_undone'),
  1,
  'and the compensating write is itself audited'
);
/*
 * The ledger row is CLOSED, and the replay proves why that matters.
 *
 * `public.undo_operation` reads `status` and never writes it: an already-undone
 * row short-circuits to the idempotent answer, but only if some handler set it.
 * A handler that skips the update leaves its operation `available` for the full
 * 24 hours, so pressing undo twice re-enters the compensating path -- which for
 * this operation means a second `55P03` at the staleness check, an error where
 * the contract says "already done".
 */
select ok(
  (select operation.status = 'undone' and operation.undone_at is not null
   from public.undo_operations as operation
   where operation.action_type = 'apply_reminder_series_command_v1'
     and operation.after_state ->> 'scope' = 'series'),
  '2R-SERIES-007: the handler closed its own ledger row, status and timestamp'
);
select is(
  public.undo_operation(
    (select operation.id from public.undo_operations as operation
     where operation.action_type = 'apply_reminder_series_command_v1'
       and operation.after_state ->> 'scope' = 'series'
     limit 1)
  ) ->> 'idempotent',
  'true',
  'so a second undo answers "already done" instead of compensating twice'
);

-- ---------------------------------------------------------------------------
-- Section 10 -- what this migration promised NOT to change (5)
-- ---------------------------------------------------------------------------

reset role;

select ok(
  exists (
    select 1 from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as space on space.oid = proc.pronamespace
    where space.nspname = 'public' and proc.proname = 'run_user_heartbeat'
      and proc.prosrc like '%coalesce(preferences.max_followups_per_day, 3)%'
      and proc.prosrc like '%notification.created_at > now() - interval ''24 hours''%'
  ),
  'the heartbeat''s cap and cooldown are byte-for-byte what they were'
);
select ok(
  (select proc.prosrc not like '%series_id%'
     and proc.prosrc not like '%reminder_series%'
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as space on space.oid = proc.pronamespace
   where space.nspname = 'public' and proc.proname = 'run_user_heartbeat'),
  'and it still knows nothing about a series -- OD-2R-3 option A, kept'
);

-- 2R-MODEL-004, asserted as an EQUALITY rather than as a passing test: a
-- reminder with no series behaves exactly as it did, and creating one
-- materialises nothing.
insert into public.reminders (id, user_id, title, remind_at, status)
values ('d1300001-0000-4000-8000-000000000001',
        'd1000001-0000-4000-8000-000000000001',
        'An ordinary reminder', now() + interval '1 day', 'scheduled');

update public.reminders set status = 'sent', sent_at = now()
where id = 'd1300001-0000-4000-8000-000000000001';

select is(
  (select pg_catalog.count(*)::integer from public.reminders as occurrence
   where occurrence.series_id is null
     and occurrence.user_id = 'd1000001-0000-4000-8000-000000000001'),
  1,
  '2R-MODEL-004: a reminder without a series completes and materialises nothing'
);
select is(
  (select occurrence.series_sequence from public.reminders as occurrence
   where occurrence.id = 'd1300001-0000-4000-8000-000000000001'),
  null::integer,
  'and it carries no sequence -- the columns are null, not zero'
);
select is(
  (select pg_catalog.count(*)::integer from public.reminders as occurrence
   where occurrence.status = 'snoozed'),
  0,
  'and nothing in this suite produced a snoozed row -- 2F-REMINDER-004 still holds'
);

select * from finish();
rollback;
