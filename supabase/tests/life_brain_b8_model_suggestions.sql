-- Life Brain B.8 (ADR-163): the model's pick of today's suggestions, and the
-- `source` telemetry property.
--
-- Pins the table's posture (forced RLS, owner read, no direct write), the one
-- writer (caller from auth.uid(), shape validation that refuses any text, one row
-- per person overwritten by day), isolation between owners, and the optional
-- `source` enum on `conversation_suggestion_shown`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Structure -------------------------------------------------------------------

select has_table('public', 'conversation_suggestion_picks', 'the cache table exists');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
   where oid = 'public.conversation_suggestion_picks'::regclass),
  'row level security is forced'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
   where oid = 'public.record_conversation_suggestion_picks(date,jsonb,text,text)'::regprocedure),
  'the writer is a definer with an empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.record_conversation_suggestion_picks(date,jsonb,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.record_conversation_suggestion_picks(date,jsonb,text,text)', 'execute'),
  'the writer is authenticated-only'
);

-- Fixtures ----------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('b8000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'picks-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'picks-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b8000001-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Direct writes are refused ---------------------------------------------------

select throws_ok(
  $$ insert into public.conversation_suggestion_picks (user_id, local_day, picks, model, prompt_version)
     values ('b8000001-0000-4000-8000-000000000001', '2026-11-09', '[]'::jsonb, 'm', 'v') $$,
  '42501', null,
  'the owner cannot insert directly'
);

-- The writer --------------------------------------------------------------------

select lives_ok(
  $$ select public.record_conversation_suggestion_picks(
       '2026-11-09',
       '[{"category":"overdue_task","id":"b8a00001-0000-4000-8000-000000000001"},{"category":"person","id":"b8a00002-0000-4000-8000-000000000002"}]'::jsonb,
       'gpt-5-mini', '2026-11-09.1') $$,
  'a valid pick is recorded'
);
select is(
  (select jsonb_array_length(picks) from public.conversation_suggestion_picks),
  2,
  'the owner reads their own pick'
);
select lives_ok(
  $$ select public.record_conversation_suggestion_picks(
       '2026-11-10',
       '[{"category":"due_today","id":"b8a00003-0000-4000-8000-000000000003"}]'::jsonb,
       'gpt-5-mini', '2026-11-09.1') $$,
  'the next day overwrites'
);
select is(
  (select count(*)::integer from public.conversation_suggestion_picks),
  1,
  'one row per person'
);
select is(
  (select local_day from public.conversation_suggestion_picks),
  '2026-11-10'::date,
  'the row carries the new day'
);
select lives_ok(
  $$ select public.record_conversation_suggestion_picks('2026-11-10', '[]'::jsonb, 'gpt-5-mini', '2026-11-09.1') $$,
  'an empty pick is a valid answer'
);

select throws_ok(
  $$ select public.record_conversation_suggestion_picks('2026-11-10',
       '[{"category":"person","id":"b8a00002-0000-4000-8000-000000000002","sentence":"Fale com Ana"}]'::jsonb,
       'gpt-5-mini', 'v') $$,
  '22023', null,
  'a pick carrying text is refused'
);
select throws_ok(
  $$ select public.record_conversation_suggestion_picks('2026-11-10',
       '[{"category":"invented","id":"b8a00002-0000-4000-8000-000000000002"}]'::jsonb,
       'gpt-5-mini', 'v') $$,
  '22023', null,
  'an unknown category is refused'
);
select throws_ok(
  $$ select public.record_conversation_suggestion_picks('2026-11-10',
       '[{"category":"person","id":"Ana"}]'::jsonb,
       'gpt-5-mini', 'v') $$,
  '22023', null,
  'an id that is not a uuid is refused'
);
select throws_ok(
  $$ select public.record_conversation_suggestion_picks('2026-11-10',
       '[{"category":"person","id":"b8a00001-0000-4000-8000-000000000001"},{"category":"person","id":"b8a00002-0000-4000-8000-000000000002"},{"category":"person","id":"b8a00003-0000-4000-8000-000000000003"},{"category":"person","id":"b8a00004-0000-4000-8000-000000000004"}]'::jsonb,
       'gpt-5-mini', 'v') $$,
  '22023', null,
  'more than three picks are refused'
);

-- Isolation -----------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"b8000002-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.conversation_suggestion_picks),
  0,
  'another owner reads nothing'
);

-- Telemetry: the optional source --------------------------------------------------

reset role;

select lives_ok(
  $$ select private.validate_product_event_properties('conversation_suggestion_shown', '{"category":"person"}'::jsonb) $$,
  'the pre-B.8 payload still validates'
);
select lives_ok(
  $$ select private.validate_product_event_properties('conversation_suggestion_shown', '{"category":"overdue_task","source":"model"}'::jsonb) $$,
  'source model validates'
);
select throws_ok(
  $$ select private.validate_product_event_properties('conversation_suggestion_shown', '{"category":"person","source":"llm"}'::jsonb) $$,
  '22023', null,
  'an unknown source is refused'
);

select * from finish();
rollback;
