-- Life Brain LB-M4 (slice C.5, ADR-156): a person's birthday and its yearly reminder.
--
-- Pins the columns and their checks, the direct-write refusal, the one writer
-- (owner check, validation, idempotence, series ended and re-created, clear),
-- the series' owned link to the person, and the end of the series when the
-- person is deleted.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Structure -------------------------------------------------------------------

select has_column('public', 'people', 'birthday_month', 'people.birthday_month exists');
select has_column('public', 'people', 'birthday_day', 'people.birthday_day exists');
select has_column('public', 'people', 'birthday_year', 'people.birthday_year exists');
select has_column('public', 'reminder_series', 'person_id', 'reminder_series.person_id exists');
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
   where oid = 'public.set_person_birthday(uuid,integer,integer,integer,text)'::regprocedure),
  'the writer is a definer with an empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.set_person_birthday(uuid,integer,integer,integer,text)', 'execute')
  and not has_function_privilege('anon', 'public.set_person_birthday(uuid,integer,integer,integer,text)', 'execute'),
  'the writer is authenticated-only'
);

-- Fixtures ----------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c5000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bday-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c5000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bday-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.people (id, user_id, name) values
  ('c5a00001-0000-4000-8000-000000000001', 'c5000001-0000-4000-8000-000000000001', 'Ana'),
  ('c5a00002-0000-4000-8000-000000000002', 'c5000002-0000-4000-8000-000000000002', 'Bruno');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5000001-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Direct writes are refused -------------------------------------------------------

select throws_ok(
  $$ update public.people set birthday_month = 5, birthday_day = 5 where id = 'c5a00001-0000-4000-8000-000000000001' $$,
  '42501', null,
  'the owner cannot write a birthday directly'
);
select lives_ok(
  $$ update public.people set notes = 'nota' where id = 'c5a00001-0000-4000-8000-000000000001' $$,
  'other columns stay writable'
);

-- Setting -----------------------------------------------------------------------------

create temporary table first_set on commit drop as
select public.set_person_birthday('c5a00001-0000-4000-8000-000000000001', 5, 5, 1990, 'Aniversário de Ana') as result;

select is((select (result ->> 'changed')::boolean from first_set), true, 'setting a birthday changes the person');
select is(
  (select birthday_month::text || '-' || birthday_day::text || '-' || birthday_year::text from public.people where id = 'c5a00001-0000-4000-8000-000000000001'),
  '5-5-1990',
  'the date is stored'
);
select is(
  (select count(*)::int from public.reminder_series
   where person_id = 'c5a00001-0000-4000-8000-000000000001' and status = 'active'
     and rule = '{"version":1,"frequency":"yearly","month":5,"day":5}'::jsonb and anchor_hour = 9),
  1,
  'one active yearly series at 09:00, linked to the person'
);
select is(
  (select count(*)::int from public.reminders r join public.reminder_series s on s.id = r.series_id
   where s.person_id = 'c5a00001-0000-4000-8000-000000000001' and r.status = 'scheduled' and r.title = 'Aniversário de Ana'),
  1,
  'its first occurrence is scheduled'
);
select is(
  (public.set_person_birthday('c5a00001-0000-4000-8000-000000000001', 5, 5, 1990, 'Aniversário de Ana') ->> 'changed')::boolean,
  false,
  'the same date again changes nothing'
);

-- Changing ----------------------------------------------------------------------------

select is(
  (public.set_person_birthday('c5a00001-0000-4000-8000-000000000001', 6, 7, null, 'Aniversário de Ana') ->> 'changed')::boolean,
  true,
  'a new date changes it'
);
select is(
  (select count(*)::int from public.reminder_series where person_id = 'c5a00001-0000-4000-8000-000000000001' and status = 'ended'),
  1,
  'the old series is ended, not deleted'
);
select is(
  (select count(*)::int from public.reminder_series where person_id = 'c5a00001-0000-4000-8000-000000000001' and status = 'active'),
  1,
  'exactly one series is active'
);
select is(
  (select count(*)::int from public.reminders r join public.reminder_series s on s.id = r.series_id
   where s.person_id = 'c5a00001-0000-4000-8000-000000000001' and r.status = 'cancelled'),
  1,
  'the old series'' next occurrence is cancelled'
);

-- Validation --------------------------------------------------------------------------

select throws_ok(
  $$ select public.set_person_birthday('c5a00001-0000-4000-8000-000000000001', 2, 30, null, 'x') $$,
  '22023', null,
  'a day that does not exist is refused'
);
select throws_ok(
  $$ select public.set_person_birthday('c5a00001-0000-4000-8000-000000000001', 2, 29, 2023, 'x') $$,
  '22023', null,
  '29 February in a year that has none is refused'
);
select lives_ok(
  $$ select public.set_person_birthday('c5a00001-0000-4000-8000-000000000001', 2, 29, null, 'Aniversário de Ana') $$,
  '29 February without a year is accepted'
);
select throws_ok(
  $$ select public.set_person_birthday('c5a00002-0000-4000-8000-000000000002', 1, 1, null, 'x') $$,
  'P0002', null,
  'another owner''s person cannot be given a birthday'
);

-- Clearing ----------------------------------------------------------------------------

select is(
  (public.set_person_birthday('c5a00001-0000-4000-8000-000000000001', null, null, null, null) ->> 'changed')::boolean,
  true,
  'clearing changes it'
);
select is(
  (select count(*)::int from public.reminder_series where person_id = 'c5a00001-0000-4000-8000-000000000001' and status = 'active'),
  0,
  'and leaves no active series'
);

-- Deleting the person ends the series -------------------------------------------------

select public.set_person_birthday('c5a00001-0000-4000-8000-000000000001', 3, 3, null, 'Aniversário de Ana');
reset role;
delete from public.people where id = 'c5a00001-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.reminder_series
   where user_id = 'c5000001-0000-4000-8000-000000000001' and status = 'active' and title = 'Aniversário de Ana'),
  0,
  'deleting the person ends their birthday series'
);

select * from finish();
rollback;
