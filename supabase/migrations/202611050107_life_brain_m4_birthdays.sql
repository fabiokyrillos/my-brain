-- Life Brain LB-M4 (slice C.5, ADR-156; PRD `LB-C-012`). The FOURTH Life Brain
-- migration: ADR-145 allocated three and made a fourth a stop condition; the
-- owner authorized this one on 2026-11-05 ("Seria bom ter o lembrete e mostrar
-- na página da pessoa" → "Sim, autorizo LB-M4").
--
-- A birthday is a date about a person and a yearly reminder. Neither existed:
-- `people` had no date, and a reminder series could point at a task but not at
-- a person, so a birthday reminder could not be shown on the person's page.
--
-- Four things:
--
--  1. `people.birthday_month`, `birthday_day` (both or neither) and an optional
--     `birthday_year`, checked to be a real date (29 February allowed without a
--     year). A trigger refuses a direct change to them: the only writer is the
--     function below, so the date and its reminder cannot drift apart.
--  2. `reminder_series.person_id`, owned through `(user_id, person_id)`, with at
--     most one ACTIVE series per person.
--  3. `public.set_person_birthday` — the owner sets, changes or clears a
--     person's birthday; the active series is ended (its next occurrence
--     cancelled, history kept, as `apply_reminder_series_command_v1` ends one)
--     and, when a date remains, a yearly series at 09:00 in the owner's zone is
--     created with its first occurrence. Audited. Idempotent: the same date
--     with an active series changes nothing.
--  4. Deleting a person ends their birthday series (a definer trigger), so a
--     reminder never outlives the person it is about.

-- 1. The date on the person --------------------------------------------------------

alter table public.people
  add column birthday_month smallint,
  add column birthday_day smallint,
  add column birthday_year smallint;

alter table public.people
  add constraint people_birthday_pair_check
    check ((birthday_month is null) = (birthday_day is null)),
  add constraint people_birthday_year_needs_date_check
    check (birthday_year is null or birthday_month is not null),
  add constraint people_birthday_range_check
    check (
      birthday_month is null
      or (
        birthday_month between 1 and 12
        and birthday_day between 1 and 31
        and (birthday_year is null or birthday_year between 1900 and 2100)
        -- A real day: 2000 is a leap year, so 29 February passes without a year;
        -- with a year it must exist in that year.
        and birthday_day <= pg_catalog.date_part(
          'day',
          (pg_catalog.make_date(coalesce(birthday_year, 2000), birthday_month, 1)
            + interval '1 month' - interval '1 day')
        )
      )
    );

create or replace function private.people_birthday_write_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.birthday_month, new.birthday_day, new.birthday_year)
       is distinct from (old.birthday_month, old.birthday_day, old.birthday_year)
     and coalesce(pg_catalog.current_setting('my_brain.person_birthday_writer', true), '') <> 'on' then
    raise exception 'A birthday is set through set_person_birthday' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.people_birthday_write_guard() from public, anon, authenticated, service_role;

create trigger people_birthday_write_guard
  before update of birthday_month, birthday_day, birthday_year on public.people
  for each row execute function private.people_birthday_write_guard();

create or replace function private.people_birthday_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birthday_month is not null or new.birthday_year is not null then
    raise exception 'A birthday is set through set_person_birthday' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.people_birthday_insert_guard() from public, anon, authenticated, service_role;

create trigger people_birthday_insert_guard
  before insert on public.people
  for each row execute function private.people_birthday_insert_guard();

-- 2. The series knows whose birthday it is -------------------------------------

alter table public.reminder_series
  add column person_id uuid;

alter table public.reminder_series
  add constraint reminder_series_person_owner_fk
    foreign key (user_id, person_id) references public.people (user_id, id)
    on delete set null (person_id);

create unique index reminder_series_one_active_birthday_idx
  on public.reminder_series (user_id, person_id)
  where person_id is not null and status = 'active';

-- 3. Setting, changing or clearing a birthday ----------------------------------------

create or replace function public.set_person_birthday(
  p_person_id uuid,
  p_month integer,
  p_day integer,
  p_year integer,
  p_reminder_title text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  person public.people%rowtype;
  active_series public.reminder_series%rowtype;
  live_reminder_id uuid;
  normalized_title text;
  owner_timezone text;
  local_today date;
  v_rule jsonb;
  first_instant timestamptz;
  new_series_id uuid;
  new_reminder_id uuid;
  clearing boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501', detail = 'AUTH_REQUIRED';
  end if;
  if p_person_id is null then
    raise exception 'Person is required' using errcode = '22023', detail = 'INVALID_BIRTHDAY_REQUEST';
  end if;

  clearing := p_month is null and p_day is null;
  if clearing then
    if p_year is not null then
      raise exception 'A year needs a day and a month' using errcode = '22023', detail = 'INVALID_BIRTHDAY';
    end if;
  else
    if p_month is null or p_day is null or p_month not between 1 and 12 or p_day not between 1 and 31
       or (p_year is not null and p_year not between 1900 and 2100)
       or p_day > pg_catalog.date_part('day',
            (pg_catalog.make_date(coalesce(p_year, 2000), p_month, 1) + interval '1 month' - interval '1 day')) then
      raise exception 'Invalid birthday' using errcode = '22023', detail = 'INVALID_BIRTHDAY';
    end if;
    normalized_title := pg_catalog.btrim(coalesce(p_reminder_title, ''));
    if pg_catalog.char_length(normalized_title) not between 1 and 500 then
      raise exception 'Invalid reminder title' using errcode = '22023', detail = 'INVALID_BIRTHDAY';
    end if;
  end if;

  select * into person
  from public.people
  where id = p_person_id and user_id = current_user_id
  for update;
  if person.id is null then
    raise exception 'Person not found' using errcode = 'P0002', detail = 'PERSON_NOT_FOUND';
  end if;

  select * into active_series
  from public.reminder_series
  where user_id = current_user_id and person_id = person.id and status = 'active'
  for update;

  -- Idempotent: the same date, already reminded (or already clear), is a no-op.
  if (person.birthday_month, person.birthday_day, person.birthday_year)
       is not distinct from (p_month::smallint, p_day::smallint, p_year::smallint)
     and (clearing or active_series.id is not null) then
    return pg_catalog.jsonb_build_object('changed', false, 'series_id', active_series.id);
  end if;

  -- End the current series: history stays, the next occurrence is cancelled.
  if active_series.id is not null then
    update public.reminder_series
    set status = 'ended', ended_at = pg_catalog.now()
    where id = active_series.id and user_id = current_user_id and status = 'active';

    select id into live_reminder_id
    from public.reminders
    where user_id = current_user_id and series_id = active_series.id and status = 'scheduled'
    limit 1;
    if live_reminder_id is not null then
      update public.reminders set status = 'cancelled'
      where id = live_reminder_id and user_id = current_user_id and status = 'scheduled';
    end if;
  end if;

  perform pg_catalog.set_config('my_brain.person_birthday_writer', 'on', true);
  update public.people
  set birthday_month = p_month::smallint,
      birthday_day = p_day::smallint,
      birthday_year = p_year::smallint
  where id = person.id and user_id = current_user_id;
  perform pg_catalog.set_config('my_brain.person_birthday_writer', 'off', true);

  if not clearing then
    owner_timezone := private.reminder_owner_timezone(current_user_id);
    local_today := (pg_catalog.now() at time zone owner_timezone)::date;
    v_rule := pg_catalog.jsonb_build_object('version', 1, 'frequency', 'yearly', 'month', p_month, 'day', p_day);
    first_instant := private.reminder_next_instant(v_rule, local_today, 9, 0, owner_timezone, pg_catalog.now());
    if first_instant is null then
      raise exception 'The rule reaches no occurrence within the horizon' using errcode = '22023', detail = 'INVALID_BIRTHDAY';
    end if;

    insert into public.reminder_series (
      user_id, title, important, task_id, person_id, rule, anchor_date, anchor_hour, anchor_minute
    ) values (
      current_user_id, normalized_title, false, null, person.id, v_rule, local_today, 9, 0
    )
    returning id into new_series_id;

    insert into public.reminders (
      user_id, task_id, title, remind_at, important, status, series_id, series_sequence
    ) values (
      current_user_id, null, normalized_title, first_instant, false, 'scheduled', new_series_id, 1
    )
    returning id into new_reminder_id;
  end if;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    current_user_id,
    case when clearing then 'person_birthday_cleared' else 'person_birthday_set' end,
    'person',
    person.id,
    'user',
    pg_catalog.jsonb_build_object(
      'month', person.birthday_month, 'day', person.birthday_day, 'year', person.birthday_year,
      'series_id', active_series.id, 'cancelled_reminder_id', live_reminder_id
    ),
    pg_catalog.jsonb_build_object(
      'month', p_month, 'day', p_day, 'year', p_year,
      'series_id', new_series_id, 'reminder_id', new_reminder_id, 'remind_at', first_instant
    ),
    'owner_choice'
  );

  return pg_catalog.jsonb_build_object(
    'changed', true,
    'series_id', new_series_id,
    'reminder_id', new_reminder_id,
    'remind_at', first_instant
  );
end;
$$;

revoke all on function public.set_person_birthday(uuid, integer, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_person_birthday(uuid, integer, integer, integer, text)
  to authenticated;

-- 4. A reminder never outlives its person ---------------------------------------

create or replace function private.end_birthday_series_of_deleted_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An account being deleted takes its reminders with it (the cascade from
  -- `auth.users`); there is nothing to end, and touching rows the same cascade
  -- is removing would only race it.
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  update public.reminders
  set status = 'cancelled'
  where user_id = old.user_id
    and status = 'scheduled'
    and series_id in (
      select id from public.reminder_series
      where user_id = old.user_id and person_id = old.id and status = 'active'
    );
  update public.reminder_series
  set status = 'ended', ended_at = pg_catalog.now()
  where user_id = old.user_id and person_id = old.id and status = 'active';
  return old;
end;
$$;

revoke all on function private.end_birthday_series_of_deleted_person() from public, anon, authenticated, service_role;

create trigger people_end_birthday_series
  before delete on public.people
  for each row execute function private.end_birthday_series_of_deleted_person();
