-- Phase 2R slice 2R.1 -- a reminder can repeat, and exactly one occurrence of
-- it is concrete at a time.
--
-- THE ONE MIGRATION THIS PHASE HAS. OD-2R-7 is signed as option A -- 1
-- allocated -- and this spends it. A SECOND MIGRATION OF ANY KIND IS A STOP
-- CONDITION (ADR-132 Decision 8, ADR-133 Decision 3). Its destination is
-- exclusive: the recurrence model, meaning OD-2R-2's rule shape and the
-- series-to-occurrence relation. Nothing else.
--
-- WHY THE SCHEMA CANNOT CARRY THIS WITHOUT IT
--
-- public.reminders holds twelve columns -- id, user_id, task_id, entry_id,
-- title, remind_at, important, status, snoozed_until, sent_at, created_at,
-- updated_at -- re-read live from information_schema at slice 2R.0. `remind_at`
-- is a single timestamptz; there is no column that could hold a rule, no
-- relation between occurrences, and -- unlike the column Phase 2Q was able to
-- repurpose -- there is not even an unused jsonb column on the table to reuse.
-- Repetition cannot be represented without schema.
--
-- (That sentence is deliberately phrased without naming the other phase's
-- column. `phase-2q-foundation.test.ts` asserts by a closed list that exactly
-- ONE migration in the chain mentions it, and a comment here comparing the two
-- would have made this file the second -- an enforcer defeated by a recorder,
-- which slice 2P.7 already recorded as the wrong way round.)
--
-- WHY THE WHOLE 2R.2 SURFACE IS HERE TOO, AND NOT DEFERRED
--
-- Slice 2R.2 delivers occurrence-versus-series semantics and their undo, and
-- the plan gives it NO migration. So every database object 2R.2 needs has to
-- exist when this migration lands or it can never exist at all: the series
-- command boundary, its undo handler, and the registry rows. Shipping a table
-- now and its commands "later" would spend the allocation on half the model and
-- then discover the other half needs a second one -- which is the exact stop
-- condition this budget exists to make visible rather than survivable.
--
-- WHAT THIS DELIBERATELY IS NOT
--
--   1. NOT AN RRULE, AND NOT A PARSER. OD-2R-2 refused RFC 5545 BY NAME. The
--      owner's reason is the failure mode: a rule string the parser reads
--      differently from the writer fires at the wrong time with NO ERROR
--      ANYWHERE. Everything here is a closed enumeration -- five frequencies,
--      validated by an IMMUTABLE predicate that a CHECK constraint calls, so an
--      invalid rule cannot be stored even by a caller that goes around every
--      Server Action.
--   2. NOT A HORIZON. OD-2R-3 is signed as option A: exactly ONE concrete
--      occurrence exists at a time. That is what keeps public.run_user_heartbeat
--      UNCHANGED -- its per-user advisory lock, quiet hours, daily cap and
--      24-hour cooldown all already operate on `reminders` rows and keep
--      operating on exactly one. This migration does not drop, alter or replace
--      it, and the post-deploy block below asserts that.
--   3. NOT A SECOND INSTANT CALCULATOR. 2R-TIME-007 requires occurrence
--      instants to be computed in ONE place. That place is
--      private.reminder_next_instant. TypeScript validates the rule's SHAPE and
--      renders it in the owner's WORDS; it never computes an instant, and the
--      preview surface reads this same function through
--      public.reminder_series_preview_v1. Slice 2R.0 reported a defect whose
--      whole shape is two implementations of one rule, and answering it by
--      writing a second DST resolver would have reproduced the finding inside
--      the fix.
--   4. NOT A CHANGE TO ANY EXISTING GRANT, POLICY OR AUTHORITY. 2R-TRUST-004.
--      public.reminders keeps exactly the privileges Phase 2F left it -- SELECT
--      and INSERT to `authenticated`, no UPDATE and no DELETE -- and the new
--      table is stricter still: SELECT only, with every write going through a
--      SECURITY DEFINER boundary.
--   5. NOT RECURRING TASKS. OD-2R-6 is signed as option A and ADR-132 Decision 1
--      limited the lift to reminders. Nothing here touches public.tasks beyond
--      the composite ownership FK a reminder already has.
--
-- WHY POSTGRES'S OWN `AT TIME ZONE` IS NOT THE DST POLICY
--
-- Measured on the deployed database before this file was written, and it
-- disagrees with BOTH signed edge cases, in opposite directions:
--
--   * spring-forward gap. '2026-03-08 02:30' at time zone 'America/New_York'
--     answers 07:30+00, whose local time is 03:30. OD-2R-5 case 1 signs for the
--     FIRST VALID LOCAL INSTANT, which is 03:00 local = 07:00+00.
--   * fall-back overlap. '2026-11-01 01:30' at time zone 'America/New_York'
--     answers 06:30+00 -- the SECOND occurrence. OD-2R-5 case 2 signs for the
--     FIRST, which is 05:30+00.
--
-- A migration that used the native operator would have shipped the wrong
-- behaviour at both transitions, and it would have read as obviously correct in
-- review. private.reminder_resolve_local implements the signed policy instead,
-- and the pgTAP suite pins all three cases so a change to it fails CI.
--
-- SQL HOUSE RULES OBSERVED HERE (each has cost this repository a CI round)
--
--   * `search_path = ''`, so every reference is schema-qualified.
--   * coalesce / nullif / greatest / least / extract are grammar special forms
--     with no pg_proc entry: written UNQUALIFIED. `pg_catalog.` in front of one
--     raises 42883 under an empty search_path. `date_part` IS a real function
--     and is qualified; `extract(... from ...)` is not used at all here, so the
--     distinction cannot be got wrong later by copy.
--   * a bare `case ... then ... end` may not appear in an `if` condition
--     (42601); parenthesized or hoisted.
--   * staleness raises 55P03, never 40001 -- migration 050: 40001 makes the
--     gateway hang until timeout.
--   * gate conditions use `is distinct from`, not `<>`: jsonb_typeof on an
--     absent key is NULL, and a NULL term makes an or-chain NULL, which plpgsql
--     treats as false. That is how a gate ships fail-open.

-- ---------------------------------------------------------------------------
-- 1. The rule: a closed, enumerated, versioned shape
-- ---------------------------------------------------------------------------

-- IMMUTABLE because a CHECK constraint calls it, and because it inspects JSON
-- only -- no clock, no timezone database, no table.
create or replace function private.reminder_rule_is_valid(p_rule jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  frequency text;
  weekdays jsonb;
  element jsonb;
  previous integer;
  current_day integer;
  allowed_keys text[];
begin
  if pg_catalog.jsonb_typeof(p_rule) is distinct from 'object' then
    return false;
  end if;

  -- 2R-MODEL-003. An unknown version is refused rather than guessed at, and it
  -- is checked before the shape so that a future version 2 is refused as
  -- "newer than this build" rather than as "malformed".
  if pg_catalog.jsonb_typeof(p_rule -> 'version') is distinct from 'number'
    or (p_rule ->> 'version')::numeric is distinct from 1
  then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(p_rule -> 'frequency') is distinct from 'string' then
    return false;
  end if;
  frequency := p_rule ->> 'frequency';

  -- Exact key-set equality per frequency, in both directions. A missing
  -- required field and an unsupported extra one are the same refusal, which is
  -- what "a closed set" has to mean to be enforceable -- the same discipline
  -- apply_reminder_command_v1 applies to its five commands.
  case frequency
    when 'daily' then allowed_keys := array['version', 'frequency'];
    when 'weekly' then allowed_keys := array['version', 'frequency', 'weekdays'];
    when 'monthlyDay' then allowed_keys := array['version', 'frequency', 'day'];
    when 'monthlyWeekday' then allowed_keys := array['version', 'frequency', 'ordinal', 'weekday'];
    when 'yearly' then allowed_keys := array['version', 'frequency', 'month', 'day'];
    else return false;
  end case;

  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_object_keys(p_rule) as rule_key(key)
  ) is distinct from pg_catalog.cardinality(allowed_keys)
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_rule) as rule_key(key)
      where not (rule_key.key = any (allowed_keys))
    )
  then
    return false;
  end if;

  if frequency = 'weekly' then
    weekdays := p_rule -> 'weekdays';
    if pg_catalog.jsonb_typeof(weekdays) is distinct from 'array'
      or pg_catalog.jsonb_array_length(weekdays) < 1
      or pg_catalog.jsonb_array_length(weekdays) > 7
    then
      return false;
    end if;
    -- Strictly ascending, which enforces uniqueness at the same time. One rule
    -- gets exactly one stored spelling, so "did the series change?" stays
    -- answerable by comparison -- which 2R-SERIES-003 needs.
    previous := null;
    for element in select * from pg_catalog.jsonb_array_elements(weekdays) loop
      if pg_catalog.jsonb_typeof(element) is distinct from 'number' then
        return false;
      end if;
      current_day := (element #>> '{}')::numeric::integer;
      if (element #>> '{}')::numeric is distinct from current_day::numeric then
        return false;
      end if;
      if current_day < 1 or current_day > 7 then
        return false;
      end if;
      if previous is not null and current_day <= previous then
        return false;
      end if;
      previous := current_day;
    end loop;
    return true;
  end if;

  if frequency = 'monthlyDay' then
    return private.reminder_rule_integer_between(p_rule -> 'day', 1, 31);
  end if;

  if frequency = 'monthlyWeekday' then
    if not private.reminder_rule_integer_between(p_rule -> 'weekday', 1, 7) then
      return false;
    end if;
    -- 1..4 and -1 for "last". Deliberately no 5: a fifth weekday exists in some
    -- months and not others, so a rule naming it would silently skip months.
    return private.reminder_rule_integer_between(p_rule -> 'ordinal', 1, 4)
      or private.reminder_rule_integer_between(p_rule -> 'ordinal', -1, -1);
  end if;

  if frequency = 'yearly' then
    return private.reminder_rule_integer_between(p_rule -> 'month', 1, 12)
      and private.reminder_rule_integer_between(p_rule -> 'day', 1, 31);
  end if;

  -- 'daily' has no further fields, and the key-set check above already proved
  -- it carries none.
  return true;
end;
$$;

-- Extracted because the same four-line check appears five times, and a JSON
-- number that is not an integer (1.5) or is out of range must be refused the
-- same way each time.
create or replace function private.reminder_rule_integer_between(
  p_value jsonb,
  p_low integer,
  p_high integer
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  numeric_value numeric;
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'number' then
    return false;
  end if;
  numeric_value := (p_value #>> '{}')::numeric;
  if numeric_value is distinct from pg_catalog.trunc(numeric_value) then
    return false;
  end if;
  return numeric_value >= p_low and numeric_value <= p_high;
end;
$$;

comment on function private.reminder_rule_is_valid(jsonb) is
  'OD-2R-2 option A: the closed, enumerated, versioned recurrence shape. Called by a CHECK constraint, so an invalid rule cannot be stored even by a caller that bypasses every Server Action. Its TypeScript twin is src/features/reminders/recurrence-rule.ts, held to it by recurrence-rule-parity.test.ts.';

-- ---------------------------------------------------------------------------
-- 2. Wall-clock resolution -- OD-2R-5, all three cases
-- ---------------------------------------------------------------------------

create or replace function private.reminder_resolve_local(
  p_local timestamp,
  p_timezone text
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  naive timestamptz;
  offset_before interval;
  offset_after interval;
  candidate_one timestamptz;
  candidate_two timestamptz;
  one_matches boolean;
  two_matches boolean;
  window_low timestamptz;
  window_high timestamptz;
  target_offset interval;
  resolved timestamptz;
begin
  -- The wall clock read as if it were UTC. Every candidate instant is this
  -- value minus a real offset, which is what makes the search finite.
  naive := p_local at time zone 'UTC';

  -- The offsets in force a day either side. Sampling both is what finds the
  -- SECOND instant of a doubled wall clock: at a fall-back, the offset in force
  -- at the nominal moment produces only the first, and the repository would
  -- have shipped "ambiguity resolved to whichever one we happened to find".
  offset_before := (((naive - interval '1 day') at time zone p_timezone)
                    - ((naive - interval '1 day') at time zone 'UTC'));
  offset_after := (((naive + interval '1 day') at time zone p_timezone)
                   - ((naive + interval '1 day') at time zone 'UTC'));

  candidate_one := naive - offset_before;
  candidate_two := naive - offset_after;
  one_matches := (candidate_one at time zone p_timezone) = p_local;
  two_matches := (candidate_two at time zone p_timezone) = p_local;

  if one_matches or two_matches then
    -- OD-2R-5 case 2: a doubled local time takes the FIRST occurrence. `least`
    -- ignores NULLs, so the ordinary single-match case falls out of the same
    -- expression instead of needing a branch that could disagree with it.
    return least(
      case when one_matches then candidate_one end,
      case when two_matches then candidate_two end
    );
  end if;

  -- OD-2R-5 case 1: the local time does not exist. The two candidates bracket
  -- the transition, and the first valid local instant IS the transition -- the
  -- moment the clock jumps. Note this is NOT `greatest(candidate_one,
  -- candidate_two)`: for 02:30 on a one-hour spring-forward that would answer
  -- 03:30 local, overshooting the first valid instant by the requested
  -- minute-of-hour. The bracket is one DST shift wide, so the scan is bounded
  -- by the size of the shift rather than by the calendar.
  window_low := least(candidate_one, candidate_two);
  window_high := greatest(candidate_one, candidate_two);
  target_offset := ((window_high at time zone p_timezone)
                    - (window_high at time zone 'UTC'));

  select min(step.instant) into resolved
  from pg_catalog.generate_series(window_low, window_high, interval '1 minute') as step(instant)
  where ((step.instant at time zone p_timezone) - (step.instant at time zone 'UTC'))
      = target_offset;

  return resolved;
end;
$$;

comment on function private.reminder_resolve_local(timestamp, text) is
  'OD-2R-5: a recurrence is a wall-clock intention. An ordinary local time resolves exactly; a doubled one takes the FIRST occurrence; a nonexistent one advances to the FIRST VALID LOCAL INSTANT. Postgres''s own AT TIME ZONE disagrees with both edge cases, in opposite directions, which is why this exists.';

-- ---------------------------------------------------------------------------
-- 3. Which local dates a rule falls on -- OD-2R-5 case 3 lives here
-- ---------------------------------------------------------------------------

create or replace function private.reminder_rule_matches_date(
  p_rule jsonb,
  p_date date
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_rule ->> 'frequency'
    when 'daily' then true
    when 'weekly' then exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(p_rule -> 'weekdays') as chosen(day)
      where chosen.day::integer = pg_catalog.date_part('isodow', p_date::timestamp)::integer
    )
    -- OD-2R-5 case 3. "The 31st" in a month that has thirty days is the
    -- thirtieth, and in February the twenty-eighth. Clamping here rather than
    -- in the validator is deliberate: refusing 31 would make the intention
    -- unsayable, and storing 30 would silently rewrite it.
    when 'monthlyDay' then
      pg_catalog.date_part('day', p_date::timestamp)::integer
        = least(
            (p_rule ->> 'day')::integer,
            pg_catalog.date_part('day', private.reminder_month_end(p_date)::timestamp)::integer
          )
    when 'monthlyWeekday' then
      pg_catalog.date_part('isodow', p_date::timestamp)::integer = (p_rule ->> 'weekday')::integer
      and (
        case
          when (p_rule ->> 'ordinal')::integer = -1
            then (p_date + 7) > private.reminder_month_end(p_date)
          else ((pg_catalog.date_part('day', p_date::timestamp)::integer - 1) / 7) + 1
                 = (p_rule ->> 'ordinal')::integer
        end
      )
    when 'yearly' then
      pg_catalog.date_part('month', p_date::timestamp)::integer = (p_rule ->> 'month')::integer
      and pg_catalog.date_part('day', p_date::timestamp)::integer
        = least(
            (p_rule ->> 'day')::integer,
            pg_catalog.date_part('day', private.reminder_month_end(p_date)::timestamp)::integer
          )
    else false
  end;
$$;

create or replace function private.reminder_month_end(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (pg_catalog.date_trunc('month', p_date::timestamp)
          + interval '1 month' - interval '1 day')::date;
$$;

-- ---------------------------------------------------------------------------
-- 4. The one place an occurrence instant is computed -- 2R-TIME-007
-- ---------------------------------------------------------------------------

-- 400 days: enough for `yearly` including the February clamp, and small enough
-- that a rule nothing matches answers NULL in bounded time rather than
-- scanning the calendar. A NULL answer is 2R-TRUST-006's "say so instead of
-- showing a guess", not an error.
create or replace function private.reminder_next_instant(
  p_rule jsonb,
  p_from_date date,
  p_hour integer,
  p_minute integer,
  p_timezone text,
  p_after timestamptz
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  scan_date date;
  candidate timestamptz;
  step integer := 0;
begin
  if p_rule is null or p_from_date is null or p_timezone is null or p_after is null then
    return null;
  end if;

  scan_date := p_from_date;
  while step < 400 loop
    if private.reminder_rule_matches_date(p_rule, scan_date) then
      candidate := private.reminder_resolve_local(
        scan_date::timestamp + pg_catalog.make_interval(hours => p_hour, mins => p_minute),
        p_timezone
      );
      if candidate is not null and candidate > p_after then
        return candidate;
      end if;
    end if;
    scan_date := scan_date + 1;
    step := step + 1;
  end loop;

  return null;
end;
$$;

comment on function private.reminder_next_instant(jsonb, date, integer, integer, text, timestamptz) is
  '2R-TIME-007: the ONE place an occurrence instant is computed. The materialisation trigger and the preview RPC both call it, so two surfaces showing the same occurrence cannot disagree. TypeScript never computes an instant.';

-- The owner's zone, resolved by the SAME rule as the TypeScript contract
-- `resolveOwnerTimeZone`: the value must contain '/' or be exactly 'UTC', and
-- must construct -- a bare abbreviation such as EST constructs happily and
-- carries NO daylight-saving rule. Slice 2R.0 reported eight call sites that
-- apply a laxer rule (2R-TZ-SECOND-AUTHORITY); this one does not join them, and
-- `recurrence-rule-parity.test.ts` asserts this fallback equals
-- `defaultAgentPreferences.timezone` so the pair cannot drift.
create or replace function private.reminder_owner_timezone(p_user_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  stored text;
  probe timestamp;
begin
  select profile.timezone into stored
  from public.profiles as profile
  where profile.user_id = p_user_id;

  if stored is null or stored = '' then
    return 'America/Sao_Paulo';
  end if;
  if pg_catalog.strpos(stored, '/') = 0 and stored is distinct from 'UTC' then
    return 'America/Sao_Paulo';
  end if;
  begin
    probe := (('2026-01-01 00:00'::timestamp) at time zone stored) at time zone 'UTC';
  exception when others then
    return 'America/Sao_Paulo';
  end;
  if probe is null then
    return 'America/Sao_Paulo';
  end if;
  return stored;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The series
-- ---------------------------------------------------------------------------

create table if not exists public.reminder_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  important boolean not null default false,
  task_id uuid,
  rule jsonb not null,
  -- The wall-clock intention, stored as the owner wrote it. NOT an instant:
  -- an instant would freeze the offset in force on the day it was created, and
  -- OD-2R-5 signed the opposite.
  anchor_date date not null,
  anchor_hour smallint not null,
  anchor_minute smallint not null,
  status text not null default 'active',
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_series_title_check
    check (pg_catalog.char_length(title) >= 1 and pg_catalog.char_length(title) <= 500),
  constraint reminder_series_status_check
    check (status = any (array['active', 'ended'])),
  constraint reminder_series_ended_at_check
    check ((status = 'ended') = (ended_at is not null)),
  constraint reminder_series_hour_check check (anchor_hour >= 0 and anchor_hour <= 23),
  constraint reminder_series_minute_check check (anchor_minute >= 0 and anchor_minute <= 59),
  -- The closed set, enforced by the database and not only by a Server Action.
  constraint reminder_series_rule_check check (private.reminder_rule_is_valid(rule)),
  -- The composite ownership key every relationship in this repository proves
  -- itself through.
  constraint reminder_series_user_id_id_key unique (user_id, id)
);

alter table public.reminder_series
  add constraint reminder_series_task_owner_fk
  foreign key (user_id, task_id) references public.tasks (user_id, id);

create index if not exists reminder_series_user_status_idx
  on public.reminder_series (user_id, status);

drop trigger if exists reminder_series_updated_at on public.reminder_series;
create trigger reminder_series_updated_at
  before update on public.reminder_series
  for each row execute function public.set_updated_at();

alter table public.reminder_series enable row level security;
alter table public.reminder_series force row level security;

-- SELECT only, and deliberately stricter than public.reminders.
--
-- 2R-TRUST-005: recurrence writes are never plain client writes. `reminders`
-- still carries an INSERT grant for the single-reminder path Phase 2P shipped;
-- the series has none, so the SECURITY DEFINER boundary below is the ONLY way a
-- series is created, changed or ended. There is no UPDATE grant, no DELETE
-- grant and no DELETE policy -- ending a series is a status, never a deletion,
-- which is what 2R-SERIES-005 means by "without destroying its history".
create policy reminder_series_select_own on public.reminder_series
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.reminder_series to authenticated;
revoke all on public.reminder_series from anon;

comment on table public.reminder_series is
  'Phase 2R: the rule a repeating reminder follows. Exactly one concrete public.reminders row exists for the next occurrence at any time (OD-2R-3 option A), which is what leaves run_user_heartbeat unchanged.';

-- ---------------------------------------------------------------------------
-- 6. The occurrence's link back
-- ---------------------------------------------------------------------------

alter table public.reminders
  add column if not exists series_id uuid,
  add column if not exists series_sequence integer,
  add column if not exists detached_at timestamptz;

alter table public.reminders
  add constraint reminders_series_owner_fk
  foreign key (user_id, series_id) references public.reminder_series (user_id, id)
  on delete cascade;

alter table public.reminders
  add constraint reminders_series_sequence_check
  check ((series_id is null) = (series_sequence is null));

alter table public.reminders
  add constraint reminders_detached_requires_series
  check (detached_at is null or series_id is not null);

-- 2R-MODEL-005 and 2R-MODEL-007, enforced BY THE DATABASE rather than by the
-- caller. At most one live occurrence per series: a second materialisation of
-- the same series cannot insert, so the trigger's `on conflict do nothing` is a
-- consequence of the constraint rather than a substitute for it.
create unique index if not exists reminders_one_live_occurrence_per_series
  on public.reminders (series_id)
  where series_id is not null and detached_at is null and status = 'scheduled';

-- Materialisation is idempotent by sequence: running it twice for the same
-- completed occurrence produces one row, whatever the second caller believed.
create unique index if not exists reminders_series_sequence_key
  on public.reminders (series_id, series_sequence)
  where series_id is not null;

create index if not exists reminders_series_idx
  on public.reminders (series_id, remind_at)
  where series_id is not null;

comment on column public.reminders.series_id is
  'The series this occurrence belongs to, or NULL for the ordinary single reminder Phase 2P shipped. 2R-MODEL-004: a reminder without a series behaves exactly as it did.';
comment on column public.reminders.detached_at is
  'Set when the owner edits THIS OCCURRENCE ONLY. A detached occurrence keeps its series_id for provenance but is no longer governed by the rule, and 2R-SERIES-004 requires that a later series edit never silently reclaims it.';

-- ---------------------------------------------------------------------------
-- 7. Materialisation -- one occurrence completes, the next appears
-- ---------------------------------------------------------------------------

-- WHY A TRIGGER AND NOT A CALLER
--
-- 2R-MODEL-006 must hold however an occurrence completes, and there are two
-- ways: the hourly heartbeat stamps `sent`, and the owner cancels through
-- apply_reminder_command_v1. Putting materialisation in either caller would
-- mean the other did not do it -- and teaching run_user_heartbeat about series
-- is exactly what OD-2R-3 option A was signed to avoid. A trigger is the only
-- place that sees both without either knowing it exists.
--
-- WHY IT SKIPS FORWARD
--
-- The next occurrence is the rule's first instant after
-- greatest(the completed occurrence, now()). For an occurrence completing on
-- time those are the same thing, so 2R-MODEL-006's "at the rule's next instant"
-- holds exactly. For a series nobody processed for a week they are not, and the
-- alternative -- the strict next instant -- would deliver last Tuesday's
-- reminder today and Wednesday's tomorrow, dripping a stale backlog at the
-- daily cap's pace for as long as the outage lasted. 2R-NOTIFY-005 forbids the
-- burst; this forbids the drip as well, and the pgTAP suite asserts both
-- directions so the choice cannot be reverted by accident.
create or replace function private.reminder_series_materialise_next()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  series public.reminder_series%rowtype;
  owner_timezone text;
  next_instant timestamptz;
  boundary timestamptz;
  inserted_id uuid;
begin
  -- Only a live, attached occurrence of a series leaving `scheduled`.
  if new.series_id is null
    or new.detached_at is not null
    or old.status is distinct from 'scheduled'
    or new.status = 'scheduled'
  then
    return new;
  end if;

  select * into series
  from public.reminder_series as candidate
  where candidate.id = new.series_id and candidate.user_id = new.user_id
  for update;

  if series.id is null or series.status is distinct from 'active' then
    return new;
  end if;

  owner_timezone := private.reminder_owner_timezone(new.user_id);
  boundary := greatest(new.remind_at, pg_catalog.now());
  next_instant := private.reminder_next_instant(
    series.rule,
    (boundary at time zone owner_timezone)::date,
    series.anchor_hour,
    series.anchor_minute,
    owner_timezone,
    boundary
  );

  -- 2R-TRUST-006: a horizon the rule never reaches produces no row and no
  -- guess. The series stays active and the next completion tries again.
  if next_instant is null then
    return new;
  end if;

  insert into public.reminders (
    user_id, task_id, title, remind_at, important, status, series_id, series_sequence
  ) values (
    new.user_id, series.task_id, series.title, next_instant, series.important,
    'scheduled', series.id, new.series_sequence + 1
  )
  on conflict do nothing
  returning id into inserted_id;

  -- 2R-TRUST-001: actor, source, reason, target, time and resulting state.
  -- Written only when a row actually appeared, so the audit is a record of
  -- writes rather than of attempts.
  if inserted_id is not null then
    insert into public.audit_logs (
      user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
    ) values (
      new.user_id,
      'reminder_occurrence_materialised',
      'reminder',
      inserted_id,
      'system',
      pg_catalog.jsonb_build_object(
        'completed_reminder_id', new.id,
        'completed_status', new.status,
        'completed_remind_at', new.remind_at,
        'series_sequence', new.series_sequence
      ),
      pg_catalog.jsonb_build_object(
        'series_id', series.id,
        'remind_at', next_instant,
        'series_sequence', new.series_sequence + 1,
        'timezone', owner_timezone,
        'skipped_forward', next_instant > private.reminder_next_instant(
          series.rule,
          (new.remind_at at time zone owner_timezone)::date,
          series.anchor_hour,
          series.anchor_minute,
          owner_timezone,
          new.remind_at
        )
      ),
      'Automatic materialisation of the next occurrence after one completed'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reminders_materialise_next_occurrence on public.reminders;
create trigger reminders_materialise_next_occurrence
  after update on public.reminders
  for each row
  execute function private.reminder_series_materialise_next();

-- ---------------------------------------------------------------------------
-- 8. Creating a series
-- ---------------------------------------------------------------------------

create or replace function public.create_reminder_series_v1(
  p_rule jsonb,
  p_title text,
  p_important boolean,
  p_task_id uuid,
  p_anchor_date date,
  p_anchor_hour integer,
  p_anchor_minute integer,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text;
  internal_operation_key text;
  normalized_title text;
  owner_timezone text;
  first_instant timestamptz;
  series_id uuid;
  reminder_id uuid;
  existing_operation public.undo_operations%rowtype;
  canonical_request jsonb;
  canonical_fingerprint text;
  undo_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null
    or pg_catalog.char_length(normalized_key) not between 8 and 240
  then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'series-v1:' || normalized_key;

  if not private.reminder_rule_is_valid(p_rule) then
    raise exception 'Invalid recurrence rule' using errcode = '22023';
  end if;

  normalized_title := pg_catalog.btrim(coalesce(p_title, ''));
  if pg_catalog.char_length(normalized_title) < 1
    or pg_catalog.char_length(normalized_title) > 500
  then
    raise exception 'Invalid reminder title' using errcode = '22023';
  end if;

  if p_anchor_date is null
    or p_anchor_hour is null or p_anchor_hour < 0 or p_anchor_hour > 23
    or p_anchor_minute is null or p_anchor_minute < 0 or p_anchor_minute > 59
  then
    raise exception 'Invalid recurrence anchor' using errcode = '22023';
  end if;

  -- The link is verified as THE OWNER'S before it is stored. The composite FK
  -- would refuse a task that does not exist, but a task belonging to somebody
  -- else does exist, so the check is an owner-scoped read.
  if p_task_id is not null and not exists (
    select 1 from public.tasks as owned
    where owned.user_id = current_user_id and owned.id = p_task_id
  ) then
    raise exception 'Unknown task' using errcode = '22023';
  end if;

  canonical_request := pg_catalog.jsonb_build_object(
    'rule', p_rule,
    'title', normalized_title,
    'important', coalesce(p_important, false),
    'task_id', p_task_id,
    'anchor_date', p_anchor_date,
    'anchor_hour', p_anchor_hour,
    'anchor_minute', p_anchor_minute
  );
  -- The idiom migration 064 established: `digest` lives in `extensions`, not
  -- `pg_catalog`, and the payload is converted explicitly rather than relying on
  -- an implicit cast under an empty search_path.
  canonical_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(canonical_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Replay, not a second series. A double-submitted form is one series.
  select * into existing_operation
  from public.undo_operations
  where user_id = current_user_id and operation_key = internal_operation_key;

  if existing_operation.id is not null then
    if existing_operation.request_fingerprint is distinct from canonical_fingerprint then
      raise exception 'Operation key reused with a different request'
        using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
      'replayed', true,
      'series_id', existing_operation.after_state ->> 'series_id',
      'reminder_id', existing_operation.after_state ->> 'reminder_id',
      'remind_at', existing_operation.after_state ->> 'remind_at',
      'undo_id', existing_operation.id
    );
  end if;

  owner_timezone := private.reminder_owner_timezone(current_user_id);
  first_instant := private.reminder_next_instant(
    p_rule,
    p_anchor_date,
    p_anchor_hour,
    p_anchor_minute,
    owner_timezone,
    greatest(
      pg_catalog.now(),
      private.reminder_resolve_local(
        (p_anchor_date - 1)::timestamp
          + pg_catalog.make_interval(hours => p_anchor_hour, mins => p_anchor_minute),
        owner_timezone
      )
    )
  );

  if first_instant is null then
    raise exception 'The rule reaches no occurrence within the horizon'
      using errcode = '22023';
  end if;

  insert into public.reminder_series (
    user_id, title, important, task_id, rule, anchor_date, anchor_hour, anchor_minute
  ) values (
    current_user_id, normalized_title, coalesce(p_important, false), p_task_id,
    p_rule, p_anchor_date, p_anchor_hour, p_anchor_minute
  )
  returning id into series_id;

  insert into public.reminders (
    user_id, task_id, title, remind_at, important, status, series_id, series_sequence
  ) values (
    current_user_id, p_task_id, normalized_title, first_instant,
    coalesce(p_important, false), 'scheduled', series_id, 1
  )
  returning id into reminder_id;

  insert into public.undo_operations (
    user_id, action_type, operation_key, request_fingerprint,
    entity_type, entity_ids, before_state, after_state, description
  ) values (
    current_user_id,
    'create_reminder_series_v1',
    internal_operation_key,
    canonical_fingerprint,
    'reminder_series',
    array[series_id],
    pg_catalog.jsonb_build_object('existed', false),
    pg_catalog.jsonb_build_object(
      'series_id', series_id,
      'reminder_id', reminder_id,
      'remind_at', first_instant,
      'timezone', owner_timezone,
      'request_fingerprint', canonical_fingerprint
    ),
    'Owner created a repeating reminder'
  )
  returning id into undo_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    current_user_id,
    'reminder_series_created',
    'reminder_series',
    series_id,
    'user',
    pg_catalog.jsonb_build_object('existed', false),
    pg_catalog.jsonb_build_object(
      'rule', p_rule,
      'remind_at', first_instant,
      'timezone', owner_timezone,
      'reminder_id', reminder_id
    ),
    'Owner created a repeating reminder through the validated series boundary'
  );

  return pg_catalog.jsonb_build_object(
    'replayed', false,
    'series_id', series_id,
    'reminder_id', reminder_id,
    'remind_at', first_instant,
    'undo_id', undo_id
  );
end;
$$;

revoke all on function public.create_reminder_series_v1(jsonb, text, boolean, uuid, date, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_reminder_series_v1(jsonb, text, boolean, uuid, date, integer, integer, text)
  to authenticated;

comment on function public.create_reminder_series_v1(jsonb, text, boolean, uuid, date, integer, integer, text) is
  '2R-MODEL-001/-005, 2R-TRUST-005: create a rule and its FIRST and ONLY concrete occurrence atomically. Idempotent by operation key; a reused key with a different request is refused rather than applied.';

-- ---------------------------------------------------------------------------
-- 9. The series command boundary -- what slice 2R.2 needs, shipped now
-- ---------------------------------------------------------------------------

create or replace function public.apply_reminder_series_command_v1(
  p_series_id uuid,
  p_command jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text;
  internal_operation_key text;
  command_kind text;
  allowed_command_keys text[];
  series public.reminder_series%rowtype;
  live_occurrence public.reminders%rowtype;
  owner_timezone text;
  new_rule jsonb;
  new_title text;
  new_important boolean;
  new_hour integer;
  new_minute integer;
  next_instant timestamptz;
  detached_id uuid;
  before_state jsonb;
  after_state jsonb;
  audit_action text;
  existing_operation public.undo_operations%rowtype;
  canonical_request jsonb;
  canonical_fingerprint text;
  undo_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null
    or pg_catalog.char_length(normalized_key) not between 8 and 240
  then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'series-cmd-v1:' || normalized_key;

  if pg_catalog.jsonb_typeof(p_command) is distinct from 'object'
    or pg_catalog.octet_length(p_command::text) > 8192
    or pg_catalog.jsonb_typeof(p_command -> 'kind') is distinct from 'string'
  then
    raise exception 'Invalid series command' using errcode = '22023';
  end if;
  command_kind := p_command ->> 'kind';

  case command_kind
    when 'detach_occurrence' then
      allowed_command_keys := array['kind'];
      audit_action := 'reminder_occurrence_detached';
    when 'edit_future' then
      allowed_command_keys := array['kind', 'rule', 'title', 'important', 'hour', 'minute'];
      audit_action := 'reminder_series_edited';
    when 'end_series' then
      allowed_command_keys := array['kind'];
      audit_action := 'reminder_series_ended';
    else
      raise exception 'Unsupported series command' using errcode = '22023';
  end case;

  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_object_keys(p_command) as command_key(key)
  ) is distinct from pg_catalog.cardinality(allowed_command_keys)
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_command) as command_key(key)
      where not (command_key.key = any (allowed_command_keys))
    )
  then
    raise exception 'Unsupported series command field' using errcode = '22023';
  end if;

  canonical_request := pg_catalog.jsonb_build_object('series_id', p_series_id, 'command', p_command);
  -- The idiom migration 064 established: `digest` lives in `extensions`, not
  -- `pg_catalog`, and the payload is converted explicitly rather than relying on
  -- an implicit cast under an empty search_path.
  canonical_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(canonical_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into existing_operation
  from public.undo_operations
  where user_id = current_user_id and operation_key = internal_operation_key;

  if existing_operation.id is not null then
    if existing_operation.request_fingerprint is distinct from canonical_fingerprint then
      raise exception 'Operation key reused with a different request' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
      'replayed', true,
      'scope', existing_operation.after_state ->> 'scope',
      'undo_id', existing_operation.id
    );
  end if;

  select * into series
  from public.reminder_series as candidate
  where candidate.id = p_series_id and candidate.user_id = current_user_id
  for update;

  -- A foreign series is indistinguishable from a missing one.
  if series.id is null then
    raise exception 'Series not found' using errcode = 'P0002';
  end if;
  if series.status is distinct from 'active' then
    raise exception 'Series is not active' using errcode = '55P03';
  end if;

  select * into live_occurrence
  from public.reminders as occurrence
  where occurrence.series_id = series.id
    and occurrence.user_id = current_user_id
    and occurrence.detached_at is null
    and occurrence.status = 'scheduled'
  for update;

  owner_timezone := private.reminder_owner_timezone(current_user_id);
  before_state := pg_catalog.jsonb_build_object(
    'rule', series.rule,
    'title', series.title,
    'important', series.important,
    'anchor_hour', series.anchor_hour,
    'anchor_minute', series.anchor_minute,
    'status', series.status,
    'live_reminder_id', live_occurrence.id,
    'live_remind_at', live_occurrence.remind_at
  );

  if command_kind = 'detach_occurrence' then
    -- 2R-SERIES-002 and -004: THIS ONE leaves the series untouched, and the
    -- occurrence stops being governed by the rule. The next occurrence is
    -- materialised immediately so the series does not lose its place -- which
    -- is what makes "edit only this one" different from "cancel this one".
    if live_occurrence.id is null then
      raise exception 'No live occurrence to detach' using errcode = 'P0002';
    end if;

    update public.reminders
    set detached_at = pg_catalog.now()
    where id = live_occurrence.id and user_id = current_user_id and detached_at is null;
    detached_id := live_occurrence.id;

    next_instant := private.reminder_next_instant(
      series.rule,
      (live_occurrence.remind_at at time zone owner_timezone)::date,
      series.anchor_hour,
      series.anchor_minute,
      owner_timezone,
      greatest(live_occurrence.remind_at, pg_catalog.now())
    );

    if next_instant is not null then
      insert into public.reminders (
        user_id, task_id, title, remind_at, important, status, series_id, series_sequence
      ) values (
        current_user_id, series.task_id, series.title, next_instant, series.important,
        'scheduled', series.id, coalesce(live_occurrence.series_sequence, 0) + 1
      )
      on conflict do nothing;
    end if;

    after_state := pg_catalog.jsonb_build_object(
      'scope', 'occurrence',
      'detached_reminder_id', detached_id,
      'next_remind_at', next_instant
    );

  elsif command_kind = 'edit_future' then
    -- 2R-SERIES-003: THIS AND FUTURE changes the rule from this point. Earlier
    -- occurrences keep their recorded values because nothing rewrites them --
    -- the only row touched is the one that has not happened yet.
    new_rule := coalesce(p_command -> 'rule', series.rule);
    if not private.reminder_rule_is_valid(new_rule) then
      raise exception 'Invalid recurrence rule' using errcode = '22023';
    end if;
    new_title := pg_catalog.btrim(coalesce(p_command ->> 'title', series.title));
    if pg_catalog.char_length(new_title) < 1 or pg_catalog.char_length(new_title) > 500 then
      raise exception 'Invalid reminder title' using errcode = '22023';
    end if;
    new_important := coalesce((p_command ->> 'important')::boolean, series.important);
    new_hour := coalesce((p_command ->> 'hour')::integer, series.anchor_hour);
    new_minute := coalesce((p_command ->> 'minute')::integer, series.anchor_minute);
    if new_hour < 0 or new_hour > 23 or new_minute < 0 or new_minute > 59 then
      raise exception 'Invalid recurrence anchor' using errcode = '22023';
    end if;

    update public.reminder_series
    set rule = new_rule,
        title = new_title,
        important = new_important,
        anchor_hour = new_hour,
        anchor_minute = new_minute
    where id = series.id and user_id = current_user_id;

    -- The scan starts at TODAY in the owner's zone, not at the live
    -- occurrence's date. Starting later would skip a new rule that matches
    -- today -- "this and future" has to be able to mean "starting today" --
    -- and `p_after = now()` is what keeps it from landing in the past.
    next_instant := private.reminder_next_instant(
      new_rule,
      (pg_catalog.now() at time zone owner_timezone)::date,
      new_hour,
      new_minute,
      owner_timezone,
      pg_catalog.now()
    );

    if live_occurrence.id is not null then
      if next_instant is null then
        raise exception 'The rule reaches no occurrence within the horizon'
          using errcode = '22023';
      end if;
      update public.reminders
      set remind_at = next_instant,
          title = new_title,
          important = new_important
      where id = live_occurrence.id and user_id = current_user_id;
    end if;

    after_state := pg_catalog.jsonb_build_object(
      'scope', 'future',
      'rule', new_rule,
      'title', new_title,
      'important', new_important,
      'anchor_hour', new_hour,
      'anchor_minute', new_minute,
      'live_reminder_id', live_occurrence.id,
      'next_remind_at', next_instant
    );

  else
    -- 2R-SERIES-005: ending a series stops future occurrences and destroys no
    -- history. The rule row stays, every past occurrence stays readable, and
    -- the one row that had not happened yet is cancelled rather than deleted.
    update public.reminder_series
    set status = 'ended', ended_at = pg_catalog.now()
    where id = series.id and user_id = current_user_id and status = 'active';

    if live_occurrence.id is not null then
      update public.reminders
      set status = 'cancelled'
      where id = live_occurrence.id and user_id = current_user_id and status = 'scheduled';
    end if;

    after_state := pg_catalog.jsonb_build_object(
      'scope', 'series',
      'status', 'ended',
      'cancelled_reminder_id', live_occurrence.id
    );
  end if;

  insert into public.undo_operations (
    user_id, action_type, operation_key, request_fingerprint,
    entity_type, entity_ids, before_state, after_state, description
  ) values (
    current_user_id,
    'apply_reminder_series_command_v1',
    internal_operation_key,
    canonical_fingerprint,
    'reminder_series',
    array[series.id],
    before_state,
    after_state || pg_catalog.jsonb_build_object('request_fingerprint', canonical_fingerprint),
    'Owner changed a repeating reminder'
  )
  returning id into undo_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    current_user_id, audit_action, 'reminder_series', series.id, 'user',
    before_state, after_state,
    'Owner applied a series command through the validated boundary'
  );

  return pg_catalog.jsonb_build_object(
    'replayed', false,
    'scope', after_state ->> 'scope',
    'undo_id', undo_id
  );
end;
$$;

revoke all on function public.apply_reminder_series_command_v1(uuid, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_reminder_series_command_v1(uuid, jsonb, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Undo -- registered, because the ledger refuses an operation without one
-- ---------------------------------------------------------------------------

create or replace function private.undo_create_reminder_series_v1(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  target_series uuid;
  target_reminder uuid;
  live_count integer;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'create_reminder_series_v1' then
    raise exception 'Unsupported undo operation'
      using errcode = 'P0001', detail = 'PHASE_2R_SERIES_UNDO_UNSUPPORTED';
  end if;
  if pg_catalog.jsonb_typeof(operation.after_state -> 'series_id') is distinct from 'string'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'reminder_id') is distinct from 'string'
  then
    raise exception 'Series undo integrity check failed'
      using errcode = 'P0001', detail = 'PHASE_2R_SERIES_UNDO_INTEGRITY';
  end if;

  target_series := (operation.after_state ->> 'series_id')::uuid;
  target_reminder := (operation.after_state ->> 'reminder_id')::uuid;

  -- Refuse when a newer change would be silently discarded. The series was
  -- created with exactly one occurrence; if it now has a different number, or
  -- the first one has already fired, undoing the creation would erase something
  -- the owner did afterwards.
  select pg_catalog.count(*) into live_count
  from public.reminders as occurrence
  where occurrence.series_id = target_series and occurrence.user_id = p_user_id;

  if live_count is distinct from 1 then
    raise exception 'Series changed since it was created'
      using errcode = '55P03', detail = 'PHASE_2R_SERIES_UNDO_STALE';
  end if;

  delete from public.reminders
  where id = target_reminder and user_id = p_user_id and status = 'scheduled';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Series changed since it was created'
      using errcode = '55P03', detail = 'PHASE_2R_SERIES_UNDO_STALE';
  end if;

  delete from public.reminder_series
  where id = target_series and user_id = p_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    p_user_id, 'reminder_series_creation_undone', 'reminder_series', target_series, 'system',
    operation.after_state - 'request_fingerprint',
    pg_catalog.jsonb_build_object('existed', false),
    'Compensating removal of a repeating reminder that had not started'
  );

  return pg_catalog.jsonb_build_object('series_id', target_series, 'affected', affected);
end;
$$;

revoke all on function private.undo_create_reminder_series_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.undo_apply_reminder_series_command_v1(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  target_series uuid;
  scope text;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'apply_reminder_series_command_v1' then
    raise exception 'Unsupported undo operation'
      using errcode = 'P0001', detail = 'PHASE_2R_SERIES_UNDO_UNSUPPORTED';
  end if;
  if pg_catalog.cardinality(operation.entity_ids) is distinct from 1
    or pg_catalog.jsonb_typeof(operation.before_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'scope') is distinct from 'string'
  then
    raise exception 'Series undo integrity check failed'
      using errcode = 'P0001', detail = 'PHASE_2R_SERIES_UNDO_INTEGRITY';
  end if;

  target_series := operation.entity_ids[1];
  scope := operation.after_state ->> 'scope';

  -- Every branch restores the recorded prior state and refuses if the row is no
  -- longer the one the forward path produced.
  if scope = 'occurrence' then
    /*
     * **The order here is load bearing, and the other order does not work.**
     *
     * Detaching materialised a replacement, so the series currently has one
     * detached occurrence and one live one. Un-detaching FIRST would give it two
     * live ones for the duration of the statement, and
     * `reminders_one_live_occurrence_per_series` refuses exactly that -- the undo
     * would fail on the invariant it is restoring. So the replacement is removed
     * first, and only then is the original returned to the live slot it used to
     * hold.
     *
     * Found by re-reading this handler against the index rather than by running
     * it, which is why the index is a database constraint and not a convention.
     */
    delete from public.reminders
    where user_id = p_user_id
      and series_id = target_series
      and detached_at is null
      and status = 'scheduled'
      and id is distinct from (operation.after_state ->> 'detached_reminder_id')::uuid;

    update public.reminders
    set detached_at = null
    where user_id = p_user_id
      and id = (operation.after_state ->> 'detached_reminder_id')::uuid
      and detached_at is not null;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Occurrence changed since it was detached'
        using errcode = '55P03', detail = 'PHASE_2R_SERIES_UNDO_STALE';
    end if;

  elsif scope = 'future' then
    update public.reminder_series
    set rule = operation.before_state -> 'rule',
        title = operation.before_state ->> 'title',
        important = (operation.before_state ->> 'important')::boolean,
        anchor_hour = (operation.before_state ->> 'anchor_hour')::integer,
        anchor_minute = (operation.before_state ->> 'anchor_minute')::integer
    where id = target_series and user_id = p_user_id
      and rule = (operation.after_state -> 'rule');
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Series changed since it was edited'
        using errcode = '55P03', detail = 'PHASE_2R_SERIES_UNDO_STALE';
    end if;
    if pg_catalog.jsonb_typeof(operation.before_state -> 'live_reminder_id') = 'string' then
      update public.reminders
      set remind_at = (operation.before_state ->> 'live_remind_at')::timestamptz,
          title = operation.before_state ->> 'title',
          important = (operation.before_state ->> 'important')::boolean
      where user_id = p_user_id
        and id = (operation.before_state ->> 'live_reminder_id')::uuid;
    end if;

  else
    update public.reminder_series
    set status = 'active', ended_at = null
    where id = target_series and user_id = p_user_id and status = 'ended';
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Series changed since it was ended'
        using errcode = '55P03', detail = 'PHASE_2R_SERIES_UNDO_STALE';
    end if;
    if pg_catalog.jsonb_typeof(operation.after_state -> 'cancelled_reminder_id') = 'string' then
      update public.reminders
      set status = 'scheduled'
      where user_id = p_user_id
        and id = (operation.after_state ->> 'cancelled_reminder_id')::uuid
        and status = 'cancelled';
    end if;
  end if;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    p_user_id, 'reminder_series_command_undone', 'reminder_series', target_series, 'system',
    operation.after_state - 'request_fingerprint',
    operation.before_state,
    'Compensating restore of a repeating reminder command'
  );

  return pg_catalog.jsonb_build_object('series_id', target_series, 'scope', scope);
end;
$$;

revoke all on function private.undo_apply_reminder_series_command_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

insert into private.undo_operation_handlers (action_type, handler_function, description) values
  ('create_reminder_series_v1', 'undo_create_reminder_series_v1',
   'Phase 2R: remove a repeating reminder that has not started, refusing if anything happened since.'),
  ('apply_reminder_series_command_v1', 'undo_apply_reminder_series_command_v1',
   'Phase 2R: restore the series state a detach, a this-and-future edit or an end replaced.')
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- 11. The preview -- the same function the trigger uses, read-only
-- ---------------------------------------------------------------------------

-- 2R-SURFACE-002 needs the next occurrences BEFORE saving, so this takes a rule
-- rather than a series id and writes nothing. It is the second caller of
-- private.reminder_next_instant, which is what makes 2R-TIME-007 checkable:
-- the preview and the materialiser cannot disagree because they are the same
-- code.
create or replace function public.reminder_series_preview_v1(
  p_rule jsonb,
  p_anchor_date date,
  p_anchor_hour integer,
  p_anchor_minute integer,
  p_count integer
)
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owner_timezone text;
  boundary timestamptz;
  scan_from date;
  produced integer := 0;
  next_instant timestamptz;
  wanted integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.reminder_rule_is_valid(p_rule) then
    raise exception 'Invalid recurrence rule' using errcode = '22023';
  end if;
  wanted := least(greatest(coalesce(p_count, 3), 1), 12);

  owner_timezone := private.reminder_owner_timezone(current_user_id);
  boundary := greatest(
    pg_catalog.now(),
    private.reminder_resolve_local(
      (p_anchor_date - 1)::timestamp
        + pg_catalog.make_interval(hours => p_anchor_hour, mins => p_anchor_minute),
      owner_timezone
    )
  );
  scan_from := p_anchor_date;

  while produced < wanted loop
    next_instant := private.reminder_next_instant(
      p_rule, scan_from, p_anchor_hour, p_anchor_minute, owner_timezone, boundary
    );
    exit when next_instant is null;
    return next query select next_instant;
    produced := produced + 1;
    boundary := next_instant;
    scan_from := (next_instant at time zone owner_timezone)::date;
  end loop;
end;
$$;

revoke all on function public.reminder_series_preview_v1(jsonb, date, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reminder_series_preview_v1(jsonb, date, integer, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Postconditions -- asserted at apply time, not only in CI
-- ---------------------------------------------------------------------------

do $postcondition$
declare
  offender text;
begin
  -- 2R-MODEL-009: the destination is exclusive. The heartbeat is not touched,
  -- and the assertion is that it still exists with the body the chain gave it
  -- rather than that this file did not mention it.
  if not exists (
    select 1 from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public' and proc.proname = 'run_user_heartbeat'
      and proc.prosrc like '%pg_try_advisory_xact_lock(hashtextextended(''my-brain-heartbeat:''%'
      and proc.prosrc like '%coalesce(preferences.max_followups_per_day, 3)%'
      and proc.prosrc like '%notification.created_at > now() - interval ''24 hours''%'
  ) then
    raise exception 'Phase 2R must not change the heartbeat, and it has changed';
  end if;

  -- 2R-TRUST-004: public.reminders keeps the Phase 2F posture exactly.
  for offender in
    select privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'reminders'
      and grantee = 'authenticated'
      and privilege_type in ('UPDATE', 'DELETE')
  loop
    raise exception 'Phase 2R re-granted % on public.reminders to authenticated', offender;
  end loop;

  -- The new table is stricter than the old one, and stays that way.
  for offender in
    select privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'reminder_series'
      and grantee = 'authenticated'
      and privilege_type <> 'SELECT'
  loop
    raise exception 'public.reminder_series granted % to authenticated', offender;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_class as rel
    join pg_catalog.pg_namespace as namespace on namespace.oid = rel.relnamespace
    where namespace.nspname = 'public' and rel.relname = 'reminder_series'
      and rel.relrowsecurity and rel.relforcerowsecurity
  ) then
    raise exception 'public.reminder_series must have RLS enabled AND forced';
  end if;

  -- Both new operations have a registered compensation handler. The ledger's
  -- own trigger enforces this at write time; asserting it here means a
  -- registry row lost to a bad merge fails the deploy rather than the first
  -- owner action.
  if (
    select pg_catalog.count(*) from private.undo_operation_handlers
    where action_type in ('create_reminder_series_v1', 'apply_reminder_series_command_v1')
  ) is distinct from 2 then
    raise exception 'Phase 2R recorded an operation with no registered undo handler';
  end if;

  -- OD-2R-5, all three cases, asserted against the deployed function at apply
  -- time. A migration that shipped Postgres's native behaviour by accident
  -- fails here rather than at the first daylight-saving boundary.
  if private.reminder_resolve_local('2026-03-08 02:30'::timestamp, 'America/New_York')
     is distinct from '2026-03-08T07:00:00+00'::timestamptz then
    raise exception 'The spring-forward policy is not the one OD-2R-5 signed';
  end if;
  if private.reminder_resolve_local('2026-11-01 01:30'::timestamp, 'America/New_York')
     is distinct from '2026-11-01T05:30:00+00'::timestamptz then
    raise exception 'The fall-back policy is not the one OD-2R-5 signed';
  end if;
  if not private.reminder_rule_matches_date(
       '{"version":1,"frequency":"monthlyDay","day":31}'::jsonb, '2026-02-28'::date) then
    raise exception 'The day-of-month clamp is not the one OD-2R-5 signed';
  end if;
end;
$postcondition$;
