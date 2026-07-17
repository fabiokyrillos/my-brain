begin;

select plan(36);

select policies_are(
  'public',
  'audit_logs',
  array['audit_logs_insert_own', 'audit_logs_select_own'],
  'audit logs are append-only for authenticated users'
);
select policies_are(
  'public',
  'undo_operations',
  array['undo_operations_select_own'],
  'undo records can only be read directly'
);
select policies_are(
  'public',
  'entry_interpretations',
  array['entry_interpretations_select_own'],
  'interpretations can only be read directly'
);
select policies_are(
  'public',
  'entry_entities',
  array['entry_entities_select_own'],
  'interpreted entity links can only be read directly'
);
select policies_are(
  'public',
  'conversation_messages',
  array['conversation_messages_insert_own', 'conversation_messages_select_own'],
  'conversation messages are append-only'
);
select policies_are(
  'public',
  'summaries',
  array['summaries_insert_own', 'summaries_select_own', 'summaries_update_own'],
  'summaries cannot be deleted directly'
);
select policies_are(
  'public',
  'heartbeat_runs',
  array['heartbeat_runs_select_own'],
  'heartbeat runs can only be read directly'
);
select policies_are(
  'public',
  'jobs',
  array['jobs_insert_own', 'jobs_select_own'],
  'users can enqueue and inspect jobs but cannot mutate worker state'
);
select policies_are(
  'public',
  'attachments',
  array['attachments_insert_own', 'attachments_select_own'],
  'users can register and inspect attachments but cannot mutate processor state'
);
select policies_are(
  'public',
  'attachment_interpretations',
  array['attachment_interpretations_select_own'],
  'attachment interpretations are worker-controlled'
);
select policies_are(
  'public',
  'notifications',
  array['notifications_select_own', 'notifications_update_own'],
  'users can read and acknowledge notifications but cannot forge or delete them'
);
select policies_are(
  'public',
  'pending_questions',
  array['pending_questions_select_own', 'pending_questions_update_own'],
  'users can answer questions but cannot forge or delete them'
);

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.persist_entry_interpretation(uuid,jsonb,text,text,text,integer,integer)'::regprocedure $$,
  array[true],
  'interpretation persistence executes through its validated definer RPC'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.confirm_entry_tasks(uuid,integer[])'::regprocedure $$,
  array[true],
  'task confirmation executes through its validated definer RPC'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.undo_operation(uuid)'::regprocedure $$,
  array[true],
  'undo executes through its validated definer RPC'
);
select has_function('public', 'save_profile_settings', array['jsonb', 'jsonb']);

select has_constraint('public', 'task_projects', 'task_projects_task_owner_fk');
select has_constraint('public', 'task_projects', 'task_projects_project_owner_fk');
select has_constraint('public', 'person_projects', 'person_projects_person_owner_fk');
select has_constraint('public', 'person_projects', 'person_projects_project_owner_fk');
select has_constraint('public', 'conversation_messages', 'conversation_messages_conversation_owner_fk');
select has_constraint('public', 'pending_questions', 'pending_questions_interpretation_owner_fk');
select has_trigger('public', 'entity_attachments', 'entity_attachments_validate_owner');
select has_trigger('public', 'entity_tags', 'entity_tags_validate_owner');

select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) not like '%current_date%' $$,
  array[true],
  'heartbeat dedupe no longer uses the database session date'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) not like '%status = ''dismissed''%' $$,
  array[true],
  'heartbeat caps do not discard notifications'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) like '%at time zone user_timezone%' $$,
  array[true],
  'heartbeat derives the user-local date boundary'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) like '%user_locale%' $$,
  array[true],
  'heartbeat localizes generated content and destinations'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) like '%pg_try_advisory_xact_lock%' $$,
  array[true],
  'heartbeat rejects concurrent evaluation for the same user'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) like '%available_slots%' $$,
  array[true],
  'heartbeat limits candidates before insertion instead of discarding rows'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) like '%interval ''24 hours''%' $$,
  array[true],
  'task follow-ups observe a rolling cooldown across local midnight'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) like '%left join public.profiles%' $$,
  array[true],
  'heartbeat keeps safe defaults when profile or preference rows are missing'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_user_heartbeat(uuid)'::regprocedure) like '%failure_code%' $$,
  array[true],
  'heartbeat persists a sanitized failure run after rolling back partial work'
);
select results_eq(
  $$ select pg_get_functiondef('public.run_all_heartbeats()'::regprocedure) like '%exception when others%' $$,
  array[true],
  'batch heartbeat isolates one user failure from the remaining users'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'owner-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'owner-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.tasks (id, user_id, title)
values ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'Owned task');
insert into public.projects (id, user_id, name)
values ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444', 'Foreign project');
insert into public.tags (id, user_id, name)
values ('77777777-7777-4777-8777-777777777777', '33333333-3333-4333-8333-333333333333', 'Owned tag');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select throws_ok(
  $$ insert into public.task_projects (task_id, project_id, user_id) values ('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333') $$,
  '23503',
  'insert or update on table "task_projects" violates foreign key constraint "task_projects_project_owner_fk"',
  'composite ownership keys reject a cross-user concrete relationship'
);

reset role;
select throws_ok(
  $$ insert into public.entity_tags (user_id, tag_id, entity_type, entity_id) values ('33333333-3333-4333-8333-333333333333','77777777-7777-4777-8777-777777777777','project','66666666-6666-4666-8666-666666666666') $$,
  '42501',
  'Referenced entity does not belong to the relationship owner',
  'polymorphic ownership trigger rejects a cross-user entity reference'
);

select * from finish();
rollback;
