begin;
select plan(19);
select has_column('public', 'agent_preferences', 'ai_profile', 'routing profile exists');
select has_column('public', 'agent_preferences', 'chat_model', 'chat route exists');
select has_column('public', 'agent_preferences', 'extraction_model', 'extraction route exists');
select has_column('public', 'agent_preferences', 'review_model', 'review route exists');
select has_table('public', 'ai_model_pricing', 'pricing catalog exists');
select has_table('public', 'ai_usage_events', 'usage ledger exists');
select row_security_active('public.ai_model_pricing'), 'pricing catalog RLS is active';
select row_security_active('public.ai_usage_events'), 'usage ledger RLS is active';
select policies_are('public', 'ai_model_pricing', array['ai_model_pricing_select_authenticated']);
select policies_are('public', 'ai_usage_events', array['ai_usage_events_select_own']);
select has_function('public', 'record_ai_usage', array['text','text','integer','integer','integer','integer','text','text','uuid','uuid']);
select has_function('public', 'get_ai_cost_summary', array['text']);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.get_ai_cost_summary(text)'::regprocedure $$,
  array[false],
  'cost aggregation runs as the caller under forced RLS'
);
select results_eq(
  $$ select count(*)::bigint from public.ai_model_pricing where provider = 'openai' and service_tier = 'standard' $$,
  array[4::bigint],
  'four standard OpenAI prices are seeded'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'ledger-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'ledger-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.record_ai_usage('chat','gpt-5.6-terra',1,0,1,0,null,'conversation',null,'22222222-2222-4222-8222-222222222222') $$,
  '42501',
  'Cannot record usage for another user',
  'authenticated callers cannot record another user ledger'
);

select lives_ok(
  $$ select public.record_ai_usage('chat','gpt-5.6-terra',1000,200,100,20,'resp-ledger-1','conversation',null,null) $$,
  'authenticated callers can record their own successful provider call'
);

select results_eq(
  $$ select cost_usd from public.ai_usage_events where provider_request_id = 'resp-ledger-1' $$,
  array[0.003550000000::numeric],
  'ledger snapshots cached input and output cost without double-charging reasoning tokens'
);

select public.record_ai_usage('chat','gpt-5.6-terra',9000,0,9000,0,'resp-ledger-1','conversation',null,null);
select results_eq(
  $$ select count(*)::bigint from public.ai_usage_events where provider_request_id = 'resp-ledger-1' $$,
  array[1::bigint],
  'provider request ids keep ledger recording idempotent'
);

reset role;
insert into public.ai_usage_events (
  user_id, operation, model, input_tokens, output_tokens, cost_status, cost_usd
) values (
  '22222222-2222-4222-8222-222222222222', 'chat', 'unpriced-test', 1, 1, 'unpriced', null
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select results_eq(
  $$ select count(*)::bigint from public.ai_usage_events $$,
  array[1::bigint],
  'forced RLS hides every other user usage event'
);
select * from finish();
rollback;
