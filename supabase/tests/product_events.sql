begin;

select plan(23);

select has_table('public', 'product_events', 'private product-events ledger exists');
select has_column('public', 'product_events', 'user_id', 'ledger event has an owner');
select has_column('public', 'product_events', 'event_name', 'ledger event has an allowlisted name');
select has_column('public', 'product_events', 'properties', 'ledger event stores bounded allowlisted properties');
select has_column('public', 'product_events', 'idempotency_key', 'ledger event has an idempotency key');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.product_events'::regclass),
  'product-events RLS is active and forced'
);
select policies_are('public', 'product_events', array['product_events_select_own']);
select has_index('public', 'product_events', 'product_events_user_created_idx', 'owner timeline index exists');
select has_index('public', 'product_events', 'product_events_user_name_created_idx', 'owner funnel index exists');
select has_function('public', 'record_product_event', array['text','text','text','text','text','jsonb','text','uuid','uuid','uuid','boolean']);
select has_function('public', 'record_product_event_for_user', array['uuid','text','text','text','text','text','jsonb','text','uuid','uuid','uuid','boolean']);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.record_product_event(text,text,text,text,text,jsonb,text,uuid,uuid,uuid,boolean)'::regprocedure $$,
  array[true],
  'authenticated product event RPC is security definer'
);
select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.record_product_event(text,text,text,text,text,jsonb,text,uuid,uuid,uuid,boolean)'::regprocedure $$,
  array[true],
  'authenticated product event RPC has a safe search path'
);
select results_eq(
  $$ select obj_description('public.product_events'::regclass) like '%180 days%' $$,
  array[true],
  'ledger retention purpose is documented at the table boundary'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'events-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'events-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (
  id, user_id, original_content, status, locale
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'Foreign product-event subject fixture',
  'saved',
  'en'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.record_product_event(
    'capture_started', 'capture', 'pt-BR', 'desktop', '2x-test-1',
    jsonb_build_object('captureSource', 'home'), null, null, null,
    '33333333-3333-4333-8333-333333333333', false
  ) $$,
  'authenticated callers can record their own allowlisted event'
);
select throws_ok(
  $$ select public.record_product_event(
    'unknown_event', 'capture', 'pt-BR', 'desktop', '2x-test-1',
    jsonb_build_object('captureSource', 'home'), null, null, null,
    '44444444-4444-4444-8444-444444444444', false
  ) $$,
  '22023',
  'Unsupported product event',
  'unknown events are denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'capture_started', 'capture', 'pt-BR', 'desktop', '2x-test-1',
    jsonb_build_object('original', 'private content'), null, null, null,
    '55555555-5555-4555-8555-555555555555', false
  ) $$,
  '22023',
  'Unsupported product event property',
  'free capture content is denied'
);
select throws_ok(
  $$ select public.record_product_event(
    'capture_started', 'capture', 'pt-BR', 'desktop', '2x-test-1',
    jsonb_build_object('captureSource', 'home'), 'entry', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
    'abababab-abab-4bab-8bab-abababababab', false
  ) $$,
  '42501',
  'Product event subject is not owned by caller',
  'opaque subjects must be owned by the effective user'
);
select throws_ok(
  $$ insert into public.product_events (
    user_id, event_name, surface, locale, viewport_class, app_version, properties, idempotency_key
  ) values (
    '11111111-1111-4111-8111-111111111111', 'capture_started', 'capture', 'pt-BR', 'desktop', '2x-test-1',
    jsonb_build_object('captureSource', 'home'), '66666666-6666-4666-8666-666666666666'
  ) $$,
  '42501',
  null,
  'authenticated callers cannot bypass the validated ledger RPC'
);
select public.record_product_event(
  'capture_started', 'capture', 'pt-BR', 'desktop', '2x-test-1',
  jsonb_build_object('captureSource', 'home'), null, null, null,
  '77777777-7777-4777-8777-777777777777', false
);
select results_eq(
  $$ select count(*)::bigint from public.product_events where user_id = '11111111-1111-4111-8111-111111111111' and idempotency_key = '77777777-7777-4777-8777-777777777777' $$,
  array[1::bigint],
  'idempotent events are recorded once'
);

reset role;
insert into public.product_events (
  user_id, event_name, surface, locale, viewport_class, app_version, properties, idempotency_key
) values (
  '22222222-2222-4222-8222-222222222222', 'work_view_viewed', 'work', 'en', 'desktop', '2x-test-1',
  jsonb_build_object('workView', 'today'), '88888888-8888-4888-8888-888888888888'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select results_eq(
  $$ select count(*)::bigint from public.product_events where user_id = '22222222-2222-4222-8222-222222222222' $$,
  array[0::bigint],
  'RLS hides another user product events'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_product_event_for_user(uuid,text,text,text,text,text,jsonb,text,uuid,uuid,uuid,boolean)',
    'execute'
  ),
  'authenticated callers cannot record events for another user'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$ select public.record_product_event_for_user(
    '22222222-2222-4222-8222-222222222222', 'capture_processing_completed', 'server', 'en', 'desktop', '2x-test-1',
    jsonb_build_object('processingMode', 'initial', 'durationMs', 1, 'outcome', 'ready'), null, null, null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true
  ) $$,
  'service role can record a controlled worker event'
);

select * from finish();
rollback;
