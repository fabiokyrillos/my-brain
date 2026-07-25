-- Phase 2E Slice 2E.1 — the command-parsing operation literal.
--
-- PRD 2E-COMMAND-011. Two independent guards decide whether a command-parsing
-- cost can be recorded at all: the table CHECK and the `record_ai_usage`
-- guard list. They were widened in one migration precisely because widening
-- one and not the other is invisible until production, so both are asserted
-- here — the CHECK by a direct privileged insert, the guard by the RPC.

begin;
select plan(13);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('31111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'cmd-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('32222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'cmd-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- The table CHECK, exercised without the RPC so the two guards cannot cover
-- for one another.
select lives_ok(
  $$ insert into public.ai_usage_events (user_id, operation, model, input_tokens, output_tokens, cost_status)
     values ('31111111-1111-4111-8111-111111111111', 'task_command', 'unpriced-test', 1, 1, 'unpriced') $$,
  'the ledger table accepts the task_command operation'
);

select throws_ok(
  $$ insert into public.ai_usage_events (user_id, operation, model, input_tokens, output_tokens, cost_status)
     values ('31111111-1111-4111-8111-111111111111', 'task_matching', 'unpriced-test', 1, 1, 'unpriced') $$,
  '23514',
  null,
  'the ledger table still refuses an undeclared operation'
);

-- Every pre-existing literal must survive the constraint rewrite. Asserted on
-- the constraint definition rather than by a seven-row insert, so a regression
-- names the literal that went missing instead of only failing the statement.
select is(
  (select count(*)::integer
   from unnest(array[
     'capture_extraction','semantic_search','chat','review','file_analysis',
     'advanced_reasoning','background','task_command'
   ]) as op
   where (select pg_get_constraintdef(oid) from pg_constraint
          where conname = 'ai_usage_events_operation_check'
            and conrelid = 'public.ai_usage_events'::regclass) like '%''' || op || '''%'),
  8,
  'the operation CHECK lists all eight literals by name'
);

select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.ai_usage_events'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%operation%'),
  1,
  'the constraint rewrite left exactly one operation CHECK behind'
);

-- The migration `create or replace`s a SECURITY DEFINER function wholesale.
-- Nothing else asserts that the replacement kept its security posture, so a
-- rewrite that silently dropped `security definer` or the empty search_path
-- would ship green.
select results_eq(
  $$ select prosecdef from pg_proc
     where oid = 'public.record_ai_usage(text,text,integer,integer,integer,integer,text,text,uuid,uuid)'::regprocedure $$,
  array[true],
  'record_ai_usage is still SECURITY DEFINER after the rewrite'
);

-- Compared as text: `proconfig` is text[], and a nested-array literal is
-- fragile to write portably in a results_eq expectation.
select is(
  (select array_to_string(proconfig, ',') from pg_proc
   where oid = 'public.record_ai_usage(text,text,integer,integer,integer,integer,text,text,uuid,uuid)'::regprocedure),
  -- Postgres stores the empty value quoted: `search_path=""`.
  'search_path=""',
  'record_ai_usage still pins an empty search_path'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"31111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.record_ai_usage('task_command','gpt-5.6-luna',900,0,120,0,'resp-cmd-1',null,null,null) $$,
  'authenticated callers can record their own command-parsing cost'
);

select results_eq(
  $$ select operation from public.ai_usage_events where provider_request_id = 'resp-cmd-1' $$,
  array['task_command'::text],
  'the RPC guard admits the command-parsing operation'
);

-- The guard list inside the function was re-typed by hand during the
-- `create or replace`. Asserting only the new literal would stay green if the
-- retype had dropped 'review' or 'file_analysis' — the exact asymmetry this
-- file's header claims to close.
select lives_ok(
  $$ select public.record_ai_usage(op,'gpt-5.6-luna',1,0,1,0,null,null,null,null)
     from unnest(array['capture_extraction','semantic_search','chat','review','file_analysis','advanced_reasoning','background']) as op $$,
  'the RPC guard still admits all seven pre-Phase-2E operations'
);

-- Parse time has no persisted subject — no task is selected yet, by
-- construction — so a null source is the truthful classification and 'task'
-- was deliberately not added to the source vocabulary (PRD §22).
select results_eq(
  $$ select source_type is null and source_id is null from public.ai_usage_events where provider_request_id = 'resp-cmd-1' $$,
  array[true],
  'command parsing records no source object'
);

select throws_ok(
  $$ select public.record_ai_usage('task_command','gpt-5.6-luna',1,0,1,0,null,'task',null,null) $$,
  '22023',
  'Unsupported source type',
  'the source vocabulary is unchanged: task is still refused'
);

select throws_ok(
  $$ select public.record_ai_usage('task_matching','gpt-5.6-luna',1,0,1,0,null,null,null,null) $$,
  '22023',
  'Unsupported AI operation',
  'the RPC guard still refuses an undeclared operation'
);

select throws_ok(
  $$ select public.record_ai_usage('task_command','gpt-5.6-luna',1,0,1,0,null,null,null,'32222222-2222-4222-8222-222222222222') $$,
  '42501',
  'Cannot record usage for another user',
  'command-parsing cost cannot be recorded against another owner'
);

select * from finish();
rollback;
