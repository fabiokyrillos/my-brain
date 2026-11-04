-- Life Brain LB-M2 (slice C.3, ADR-152): events with a period.
--
-- Pins the table's posture (RLS forced, SELECT-only for the owner, no direct
-- writes), the confirmation (owner and freshness checks, candidate validation,
-- idempotence, one event per candidate, the area context), the registered undo
-- (deletes exactly what it created) and the cancel.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Structure -------------------------------------------------------------------

select has_table('public', 'events', 'events exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.events'::regclass), 'RLS is enabled and forced');
select ok(
  has_table_privilege('authenticated', 'public.events', 'select')
  and not has_table_privilege('authenticated', 'public.events', 'insert')
  and not has_table_privilege('authenticated', 'public.events', 'update')
  and not has_table_privilege('authenticated', 'public.events', 'delete')
  and not has_table_privilege('anon', 'public.events', 'select'),
  'authenticated may only read; anon nothing'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
   where oid = 'public.confirm_entry_event_candidates(uuid,uuid,integer[],uuid)'::regprocedure),
  'the confirmation is a definer with an empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_entry_event_candidates(uuid,uuid,integer[],uuid)', 'execute')
  and not has_function_privilege('anon', 'public.confirm_entry_event_candidates(uuid,uuid,integer[],uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.cancel_event(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cancel_event(uuid)', 'execute'),
  'confirmation and cancel are authenticated-only'
);
select ok(
  not has_function_privilege('authenticated', 'private.undo_confirm_entry_event_candidates(uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.undo_confirm_entry_event_candidates(uuid,uuid)', 'execute'),
  'the undo handler is reachable only through the router'
);
select is(
  (select handler_function from private.undo_operation_handlers where action_type = 'confirm_entry_event_candidates'),
  'undo_confirm_entry_event_candidates',
  'the undo handler is registered'
);

-- Fixtures ----------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c3000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'events-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'events-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (id, user_id, original_content, source, status, locale) values
  ('c3e00001-0000-4000-8000-000000000001', 'c3000001-0000-4000-8000-000000000001', 'Vou viajar pra Lisboa de 3 a 10 de dezembro e tenho dentista dia 12 às 15h', 'web', 'completed', 'pt-BR'),
  ('c3e00002-0000-4000-8000-000000000002', 'c3000002-0000-4000-8000-000000000002', 'Jantar dia 5', 'web', 'completed', 'pt-BR');

insert into public.contexts (id, user_id, name, kind) values
  ('c3c00001-0000-4000-8000-000000000001', 'c3000001-0000-4000-8000-000000000001', 'Viagens', 'travel');

insert into public.entry_interpretations (
  id, user_id, entry_id, version, model, strategy_version, prompt_version, confidence, raw_output, summary
) values
  ('c3f00001-0000-4000-8000-000000000001', 'c3000001-0000-4000-8000-000000000001', 'c3e00001-0000-4000-8000-000000000001', 1, 'pgtap-test', 'v4', 'v4', 0.9,
   jsonb_build_object('eventCandidates', jsonb_build_array(
     jsonb_build_object('title', '  Viagem a Lisboa ', 'startsAt', '2026-12-03T00:00:00-03:00', 'endsAt', '2026-12-10T23:59:59-03:00', 'allDay', true, 'location', 'Lisboa', 'confidence', 0.9, 'explicit', true),
     jsonb_build_object('title', 'Dentista', 'startsAt', '2026-12-12T15:00:00-03:00', 'endsAt', null, 'allDay', false, 'location', null, 'confidence', 0.9, 'explicit', true),
     jsonb_build_object('title', 'Ao contrário', 'startsAt', '2026-12-12T15:00:00-03:00', 'endsAt', '2026-12-12T14:00:00-03:00', 'allDay', false, 'location', null, 'confidence', 0.9, 'explicit', true)
   )), 'Viagem e dentista'),
  ('c3f00002-0000-4000-8000-000000000002', 'c3000002-0000-4000-8000-000000000002', 'c3e00002-0000-4000-8000-000000000002', 1, 'pgtap-test', 'v4', 'v4', 0.9,
   jsonb_build_object('eventCandidates', jsonb_build_array(
     jsonb_build_object('title', 'Jantar', 'startsAt', '2026-12-05T20:00:00-03:00', 'endsAt', null, 'allDay', false, 'location', null, 'confidence', 0.9, 'explicit', true)
   )), 'Jantar');

update public.entries set current_interpretation_id = 'c3f00001-0000-4000-8000-000000000001' where id = 'c3e00001-0000-4000-8000-000000000001';
update public.entries set current_interpretation_id = 'c3f00002-0000-4000-8000-000000000002' where id = 'c3e00002-0000-4000-8000-000000000002';

insert into public.entry_entities (user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence)
values ('c3000001-0000-4000-8000-000000000001', 'c3e00001-0000-4000-8000-000000000001', 'c3f00001-0000-4000-8000-000000000001', 'context', 'c3c00001-0000-4000-8000-000000000001', 'Viagens', 0.9);

-- Direct writes are refused -------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3000001-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.events (user_id, title, starts_at) values ('c3000001-0000-4000-8000-000000000001', 'Direto', now()) $$,
  '42501', null,
  'the owner cannot insert an event directly'
);

-- Confirmation ---------------------------------------------------------------------------

create temporary table confirmed on commit drop as
select public.confirm_entry_event_candidates(
  'c3e00001-0000-4000-8000-000000000001', 'c3f00001-0000-4000-8000-000000000001',
  array[1, 0], 'c3d00001-0000-4000-8000-000000000001'
) as result;

select is(jsonb_array_length((select result -> 'eventIds' from confirmed)), 2, 'two candidates become two events');
select is(
  (select string_agg(title || '|' || all_day || '|' || coalesce(location, '-'), ', ' order by starts_at) from public.events
   where source_entry_id = 'c3e00001-0000-4000-8000-000000000001'),
  'Viagem a Lisboa|true|Lisboa, Dentista|false|-',
  'titles are trimmed, the period and the place are kept'
);
select is(
  (select ends_at from public.events where title = 'Viagem a Lisboa'),
  '2026-12-10T23:59:59-03:00'::timestamptz,
  'a trip keeps its end'
);
select is(
  (select count(*)::int from public.events where source_entry_id = 'c3e00001-0000-4000-8000-000000000001' and context_id = 'c3c00001-0000-4000-8000-000000000001'),
  2,
  'the events are filed under the entry''s area'
);
select is(
  (select public.confirm_entry_event_candidates(
     'c3e00001-0000-4000-8000-000000000001', 'c3f00001-0000-4000-8000-000000000001',
     array[0, 1], 'c3d00001-0000-4000-8000-000000000001') ->> 'idempotent')::boolean,
  true,
  'replaying the same request is idempotent'
);
select is((select count(*)::int from public.events where source_entry_id = 'c3e00001-0000-4000-8000-000000000001'), 2, 'and creates nothing more');
select throws_ok(
  $$ select public.confirm_entry_event_candidates('c3e00001-0000-4000-8000-000000000001', 'c3f00001-0000-4000-8000-000000000001', array[0], 'c3d00001-0000-4000-8000-000000000001') $$,
  '23505', null,
  'the same key for different input is refused'
);
select throws_ok(
  $$ select public.confirm_entry_event_candidates('c3e00001-0000-4000-8000-000000000001', 'c3f00001-0000-4000-8000-000000000001', array[0], 'c3d00002-0000-4000-8000-000000000002') $$,
  '23505', null,
  'a candidate becomes at most one event'
);
select throws_ok(
  $$ select public.confirm_entry_event_candidates('c3e00001-0000-4000-8000-000000000001', 'c3f00001-0000-4000-8000-000000000001', array[2], 'c3d00003-0000-4000-8000-000000000003') $$,
  '22023', null,
  'an event that ends before it starts is refused'
);
select throws_ok(
  $$ select public.confirm_entry_event_candidates('c3e00001-0000-4000-8000-000000000001', 'c3f00001-0000-4000-8000-000000000001', array[7], 'c3d00004-0000-4000-8000-000000000004') $$,
  'P0002', null,
  'a candidate that does not exist is refused'
);
select throws_ok(
  $$ select public.confirm_entry_event_candidates('c3e00001-0000-4000-8000-000000000001', 'c3f00002-0000-4000-8000-000000000002', array[0], 'c3d00005-0000-4000-8000-000000000005') $$,
  '55P03', null,
  'a stale or foreign interpretation is refused'
);
select throws_ok(
  $$ select public.confirm_entry_event_candidates('c3e00002-0000-4000-8000-000000000002', 'c3f00002-0000-4000-8000-000000000002', array[0], 'c3d00006-0000-4000-8000-000000000006') $$,
  'P0002', null,
  'another owner''s entry cannot be confirmed'
);
select throws_ok(
  $$ select public.confirm_entry_event_candidates('c3e00001-0000-4000-8000-000000000001', 'c3f00001-0000-4000-8000-000000000001', array[0, 0], 'c3d00007-0000-4000-8000-000000000007') $$,
  '22023', null,
  'duplicate indexes are refused'
);
select is(
  (select count(*)::int from public.audit_logs where action_type = 'entry_event_candidates_confirmed' and actor = 'user'
     and source_entry_id = 'c3e00001-0000-4000-8000-000000000001'),
  1,
  'the confirmation is audited once, as the owner''s'
);

-- Reading ------------------------------------------------------------------------------------

select is((select count(*)::int from public.events), 2, 'the owner sees their own events');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3000002-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.events), 0, 'another owner sees none of them');
select throws_ok(
  $$ select public.cancel_event((select id from public.events limit 1)) $$,
  '22023', null,
  'cancel needs an event id the caller can see'
);
reset role;

-- Cancel -----------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3000001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select public.cancel_event((select id from public.events where title = 'Dentista')) ->> 'status'),
  'cancelled',
  'the owner can cancel an event'
);
select is((select status from public.events where title = 'Dentista'), 'cancelled', 'the row stays, cancelled');

-- Undo ---------------------------------------------------------------------------------------

select is(
  (public.undo_operation((select (result ->> 'undoId')::uuid from confirmed)) ->> 'undone')::boolean,
  true,
  'the confirmation can be undone through the router'
);
select is(
  (select count(*)::int from public.events where source_entry_id = 'c3e00001-0000-4000-8000-000000000001'),
  0,
  'the undo deletes exactly the events it created'
);
reset role;

select is(
  (select count(*)::int from public.audit_logs where action_type = 'entry_event_candidates_undone'),
  1,
  'the undo is audited'
);

select * from finish();
rollback;
