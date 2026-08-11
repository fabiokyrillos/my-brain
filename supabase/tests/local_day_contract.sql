begin;

select plan(16);

-- `2M-TIME-001` — the SQL half of the local-day contract, proved on the same
-- days `src/lib/time/local-day.test.ts` proves the TypeScript half on.
--
-- WHY THIS FILE EXISTS
--
-- Before Phase 2M there were three implementations of "the user's local day":
-- two in TypeScript, both wrong by a fixed-24-hour assumption in opposite
-- directions, and this one, which is correct. The application now mirrors this
-- one. A mirror that nobody compares is a second implementation with extra
-- steps, so the comparison is executed here, in the database, over the exact
-- instants the TypeScript test uses.
--
-- THE CONTRACT, QUOTED FROM `202608040071_account_lifecycle_wiring.sql`
--
--   local_now       := now() at time zone user_timezone;
--   local_date      := local_now::date;
--   local_day_start := local_date::timestamp at time zone user_timezone;
--   local_day_end   := (local_date + 1)::timestamp at time zone user_timezone;
--
-- A local day therefore runs from the instant of local midnight today to the
-- instant of local midnight tomorrow. Its length is whatever that is.
--
-- WHY THE EXPRESSION IS REPEATED RATHER THAN CALLED
--
-- `run_user_heartbeat` inlines it and takes a user id, a lock, a cap and three
-- candidate queries. Calling it to ask what a day is would test the heartbeat,
-- not the boundary, and would make this file depend on rows it does not need.
-- The expression is repeated verbatim and `local_day_contract_is_still_inlined`
-- below asserts that the function still contains it, so a divergence between
-- this test and the thing it describes fails rather than passing quietly.

create or replace function pg_temp.local_day_hours(p_local_date date, p_zone text)
returns numeric
language sql
immutable
as $$
  select extract(epoch from (
    ((p_local_date + 1)::timestamp at time zone p_zone)
    - (p_local_date::timestamp at time zone p_zone)
  )) / 3600;
$$;

create or replace function pg_temp.local_day_start(p_local_date date, p_zone text)
returns text
language sql
immutable
as $$
  select to_char((p_local_date::timestamp at time zone p_zone) at time zone p_zone, 'YYYY-MM-DD HH24:MI');
$$;

-- ---------------------------------------------------------------------------
-- Northern hemisphere, both directions.
-- ---------------------------------------------------------------------------

select is(
  pg_temp.local_day_hours('2026-03-08', 'America/New_York'), 23::numeric,
  'New York springs forward on 2026-03-08 and the local day is 23 hours'
);
select is(
  pg_temp.local_day_hours('2026-11-01', 'America/New_York'), 25::numeric,
  'New York falls back on 2026-11-01 and the local day is 25 hours'
);
select is(
  pg_temp.local_day_hours('2026-03-29', 'Europe/Lisbon'), 23::numeric,
  'Lisbon springs forward on 2026-03-29 and the local day is 23 hours'
);
select is(
  pg_temp.local_day_hours('2026-10-25', 'Europe/Lisbon'), 25::numeric,
  'Lisbon falls back on 2026-10-25 and the local day is 25 hours'
);

-- ---------------------------------------------------------------------------
-- Southern hemisphere, both directions.
-- ---------------------------------------------------------------------------

select is(
  pg_temp.local_day_hours('2026-10-04', 'Australia/Sydney'), 23::numeric,
  'Sydney springs forward on 2026-10-04 and the local day is 23 hours'
);
select is(
  pg_temp.local_day_hours('2026-04-05', 'Australia/Sydney'), 25::numeric,
  'Sydney falls back on 2026-04-05 and the local day is 25 hours'
);
select is(
  pg_temp.local_day_hours('2026-09-27', 'Pacific/Auckland'), 23::numeric,
  'Auckland springs forward on 2026-09-27 and the local day is 23 hours'
);
select is(
  pg_temp.local_day_hours('2026-04-04', 'America/Santiago'), 25::numeric,
  'Santiago falls back on 2026-04-04 and the local day is 25 hours'
);

-- ---------------------------------------------------------------------------
-- The day whose local midnight never happens.
--
-- Santiago springs forward AT midnight, so 2026-09-06 00:00-00:59 does not
-- exist. Postgres resolves the non-existent wall clock forward to the first
-- instant that does, which is 01:00 -- so the day is 23 hours and it starts an
-- hour late. The naive fixed-point the TypeScript side used to run resolved the
-- same date BACKWARDS, into 2026-09-05 23:00, and that inversion is the reason
-- both sides are asserted rather than one.
-- ---------------------------------------------------------------------------

select is(
  pg_temp.local_day_hours('2026-09-06', 'America/Santiago'), 23::numeric,
  'Santiago 2026-09-06 is 23 hours because its first hour never happens'
);
select is(
  pg_temp.local_day_start('2026-09-06', 'America/Santiago'), '2026-09-06 01:00',
  'Santiago 2026-09-06 starts at 01:00 local, not inside the previous day'
);
select is(
  pg_temp.local_day_hours('2026-09-05', 'America/Santiago'), 24::numeric,
  'the skipped hour is charged to the day that lost it, not to the day before'
);

-- ---------------------------------------------------------------------------
-- Ordinary days, so a rule that reported 23 everywhere would fail.
-- ---------------------------------------------------------------------------

select is(
  pg_temp.local_day_hours('2026-03-08', 'America/Sao_Paulo'), 24::numeric,
  'Sao Paulo has observed no DST since 2019 and every day is 24 hours'
);
select is(
  pg_temp.local_day_hours('2026-03-08', 'UTC'), 24::numeric,
  'UTC never transitions'
);

-- ---------------------------------------------------------------------------
-- Consecutive days tile: no gap, no overlap, across a transition.
-- ---------------------------------------------------------------------------

select is(
  ('2026-03-09'::date::timestamp at time zone 'America/New_York'),
  (('2026-03-08'::date + 1)::timestamp at time zone 'America/New_York'),
  'the end of one local day is the start of the next, across a spring forward'
);
select is(
  ('2026-11-02'::date::timestamp at time zone 'America/New_York'),
  (('2026-11-01'::date + 1)::timestamp at time zone 'America/New_York'),
  'the end of one local day is the start of the next, across a fall back'
);

-- ---------------------------------------------------------------------------
-- The mirror is still a mirror.
--
-- If `run_user_heartbeat` ever stops computing its day this way, the expression
-- above stops describing the product and this file becomes a test of itself.
-- ---------------------------------------------------------------------------

select ok(
  (select prosrc like '%local_date::timestamp at time zone user_timezone%'
     and prosrc like '%(local_date + 1)::timestamp at time zone user_timezone%'
   from pg_proc where oid = 'public.run_user_heartbeat(uuid)'::regprocedure),
  'run_user_heartbeat still computes the local day the way this contract describes'
);

select * from finish();
rollback;
