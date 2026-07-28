-- Phase 2E Slice 2E.6 - standalone no-match task creation (PRD 13.7).
-- The fixture ids use the 71xxxxxx prefix and are independent of every earlier
-- Phase 2E pgTAP file. Written in ASCII so checkout encoding cannot alter SQL.

begin;
select plan(127);
set local timezone to 'UTC';

-- Contract and security posture ---------------------------------------------

select has_function(
  'public', 'preview_task_command_creation',
  array['text', 'text[]', 'jsonb', 'text', 'text', 'text'],
  'the read-only creation preview RPC exists'
);
select has_function(
  'public', 'issue_task_command_creation_confirmation',
  array['text', 'text[]', 'jsonb', 'text', 'text', 'text'],
  'the creation confirmation issuer exists'
);
select has_function(
  'public', 'create_task_command',
  array['text', 'text[]', 'jsonb', 'text', 'text', 'text'],
  'the standalone creation RPC exists'
);

select is(
  (select proargnames from pg_proc where oid =
    'public.preview_task_command_creation(text, text[], jsonb, text, text, text)'::regprocedure),
  array['p_action', 'p_title_words', 'p_patch', 'p_observed_before', 'p_policy_version', 'p_operation_key'],
  'preview catalog arguments match the shared TypeScript payload'
);
select is(
  (select proargnames from pg_proc where oid =
    'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)'::regprocedure),
  array['p_action', 'p_title_words', 'p_patch', 'p_observed_before', 'p_policy_version', 'p_operation_key'],
  'issuer catalog arguments match the shared TypeScript payload'
);
select is(
  (select proargnames from pg_proc where oid =
    'public.create_task_command(text, text[], jsonb, text, text, text)'::regprocedure),
  array['p_action', 'p_title_words', 'p_patch', 'p_observed_before', 'p_policy_version', 'p_operation_key'],
  'creation catalog arguments match the shared TypeScript payload'
);

select is(
  (select pronargdefaults from pg_proc where oid =
    'public.preview_task_command_creation(text, text[], jsonb, text, text, text)'::regprocedure),
  0::smallint,
  'preview defaults none of its fingerprint binding'
);
select is(
  (select pronargdefaults from pg_proc where oid =
    'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)'::regprocedure),
  0::smallint,
  'issuer defaults none of its fingerprint binding'
);
select is(
  (select pronargdefaults from pg_proc where oid =
    'public.create_task_command(text, text[], jsonb, text, text, text)'::regprocedure),
  0::smallint,
  'creation defaults none of its fingerprint binding'
);

select is(
  (select prosecdef from pg_proc where oid =
    'public.preview_task_command_creation(text, text[], jsonb, text, text, text)'::regprocedure),
  true,
  'preview is SECURITY DEFINER because relation resolution is owner scoped'
);
select is(
  (select prosecdef from pg_proc where oid =
    'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)'::regprocedure),
  true,
  'issuer is SECURITY DEFINER because clients cannot mint confirmation rows'
);
select is(
  (select prosecdef from pg_proc where oid =
    'public.create_task_command(text, text[], jsonb, text, text, text)'::regprocedure),
  true,
  'creation is SECURITY DEFINER because clients cannot reserve undo rows'
);

select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid =
    'public.preview_task_command_creation(text, text[], jsonb, text, text, text)'::regprocedure),
  'search_path=""',
  'preview pins an empty search_path'
);
select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid =
    'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)'::regprocedure),
  'search_path=""',
  'issuer pins an empty search_path'
);
select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid =
    'public.create_task_command(text, text[], jsonb, text, text, text)'::regprocedure),
  'search_path=""',
  'creation pins an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.preview_task_command_creation(text, text[], jsonb, text, text, text)',
    'execute'
  ),
  'authenticated may preview its own standalone creation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)',
    'execute'
  ),
  'authenticated may explicitly confirm its own standalone creation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_task_command(text, text[], jsonb, text, text, text)',
    'execute'
  ),
  'authenticated may create through the guarded RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.preview_task_command_creation(text, text[], jsonb, text, text, text)',
    'execute'
  ),
  'anon may not preview owner-scoped relations'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)',
    'execute'
  ),
  'anon may not mint creation confirmation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_task_command(text, text[], jsonb, text, text, text)',
    'execute'
  ),
  'anon may not create'
);

select col_is_null(
  'public', 'task_command_confirmations', 'task_id',
  'the shared confirmation ledger permits a subjectless creation row'
);
select ok(
  exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.task_command_confirmations'::regclass
      and c.conname = 'task_command_confirmations_action_check'
      and pg_get_constraintdef(c.oid) like '%cancel_task%'
      and pg_get_constraintdef(c.oid) like '%create_task%'
  ),
  'the ledger action vocabulary contains cancellation and creation only'
);
select ok(
  exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.task_command_confirmations'::regclass
      and c.conname = 'task_command_confirmations_subject_check'
      and pg_get_constraintdef(c.oid) like '%task_id IS NOT NULL%'
      and pg_get_constraintdef(c.oid) like '%task_id IS NULL%'
  ),
  'the subject check requires a cancellation task and forbids a creation task'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.task_command_confirmations'::regclass),
  'the widened confirmation ledger still forces RLS'
);
select is(
  (
    select coalesce(string_agg(r.name || ':' || p.name, ', ' order by r.name, p.name), '')
    from unnest(array['anon', 'authenticated', 'service_role']) as r(name)
    cross join unnest(array['insert', 'update', 'delete']) as p(name)
    where has_table_privilege(r.name, 'public.task_command_confirmations', p.name)
  ),
  '',
  'no client role can mint, spend or rewrite confirmation evidence'
);
select is(
  (select handler_function from private.undo_operation_handlers
   where action_type = 'create_task_command'),
  'undo_create_task_command',
  'standalone creation is registered with its dedicated undo handler'
);
select ok(
  position('create_task_command' in pg_get_functiondef(
    'private.is_task_creation_action(text)'::regprocedure)) > 0,
  'the shared creation family recognizes standalone creation'
);
select ok(
  position('private.is_task_creation_action' in pg_get_functiondef(
    'private.task_creation_undone(uuid, uuid)'::regprocedure)) > 0,
  'the shared resurrection predicate reads the centralized family'
);
select ok(
  position('on conflict (user_id, operation_key) where operation_key is not null' in
    lower(pg_get_functiondef(
      'public.create_task_command(text, text[], jsonb, text, text, text)'::regprocedure))) > 0
  and position('for update' in lower(pg_get_functiondef(
    'public.create_task_command(text, text[], jsonb, text, text, text)'::regprocedure))) > 0,
  'same-key concurrency is serialized by the unique reservation and locked replay read'
);
select has_trigger(
  'public', 'tasks', 'tasks_create_due_reminder',
  'standalone creation reuses the existing task INSERT reminder trigger'
);
select is(
  (select count(*)::integer from pg_trigger
   where tgrelid = 'public.tasks'::regclass
     and not tgisinternal
     and pg_get_triggerdef(oid) like '%create_due_task_reminder%'),
  1,
  'there is exactly one due-reminder trigger path'
);

-- Fixtures ------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('71111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'creation-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('71222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'creation-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.projects (id, user_id, name) values
  ('71000101-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'Acme'),
  ('71000102-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'Beta'),
  ('71000103-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'Twin!'),
  ('71000104-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'Twin?'),
  ('71000106-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', '123'),
  ('71000107-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'true'),
  ('71000108-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'name object ref'),
  ('71000109-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'array ref'),
  ('71000105-2222-4222-8222-222222222222', '71222222-2222-4222-8222-222222222222', 'Other owner');

insert into public.contexts (id, user_id, name) values
  ('71000201-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'Office');

insert into public.people (id, user_id, name) values
  ('71000301-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'Maria');

insert into public.entity_aliases (
  id, user_id, entity_type, entity_id, alias, normalized_alias, valid_from, valid_to
) values
  ('71000401-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111',
   'project', '71000102-1111-4111-8111-111111111111', 'Apollo', 'apollo',
   now() - interval '1 day', null),
  ('71000402-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111',
   'context', '71000201-1111-4111-8111-111111111111', 'HQ', 'hq',
   now() - interval '1 day', null),
  ('71000403-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111',
   'person', '71000301-1111-4111-8111-111111111111', 'Boss', 'boss',
   now() - interval '1 day', null),
  ('71000404-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111',
   'project', '71000102-1111-4111-8111-111111111111', 'Old Apollo', 'old apollo',
   now() - interval '2 days', now() - interval '1 day'),
  ('71000405-2222-4222-8222-222222222222', '71222222-2222-4222-8222-222222222222',
   'project', '71000105-2222-4222-8222-222222222222', 'Private alias', 'private alias',
   now() - interval '1 day', null);

create function pg_temp.creation_iso(p_instant timestamptz)
returns text language sql immutable as $$
  select to_char(p_instant at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z';
$$;

create function pg_temp.creation_try(
  p_kind text,
  p_action text,
  p_title_words text[],
  p_patch jsonb,
  p_observed_before text,
  p_operation_key text
)
returns text language plpgsql as $$
declare failure_detail text;
begin
  case p_kind
    when 'preview' then
      perform public.preview_task_command_creation(
        p_action, p_title_words, p_patch, p_observed_before,
        'task-command-policy-v1', p_operation_key
      );
    when 'issue' then
      perform public.issue_task_command_creation_confirmation(
        p_action, p_title_words, p_patch, p_observed_before,
        'task-command-policy-v1', p_operation_key
      );
    when 'create' then
      perform public.create_task_command(
        p_action, p_title_words, p_patch, p_observed_before,
        'task-command-policy-v1', p_operation_key
      );
    else
      raise exception 'unknown helper kind';
  end case;
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

create function pg_temp.creation_key(
  p_kind text,
  p_action text,
  p_title_words text[],
  p_patch jsonb,
  p_observed_before text,
  p_operation_key text,
  p_key text
)
returns text language plpgsql as $$
declare
  result jsonb;
  failure_detail text;
begin
  if p_kind = 'preview' then
    result := public.preview_task_command_creation(
      p_action, p_title_words, p_patch, p_observed_before,
      'task-command-policy-v1', p_operation_key
    );
  elsif p_kind = 'issue' then
    result := public.issue_task_command_creation_confirmation(
      p_action, p_title_words, p_patch, p_observed_before,
      'task-command-policy-v1', p_operation_key
    );
  elsif p_kind = 'create' then
    result := public.create_task_command(
      p_action, p_title_words, p_patch, p_observed_before,
      'task-command-policy-v1', p_operation_key
    );
  else
    raise exception 'unknown helper kind';
  end if;
  return result ->> p_key;
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

create function pg_temp.creation_confirm_and_create(
  p_action text,
  p_title_words text[],
  p_patch jsonb,
  p_observed_before text,
  p_operation_key text,
  p_key text
)
returns text language plpgsql as $$
declare
  result jsonb;
  failure_detail text;
begin
  perform public.issue_task_command_creation_confirmation(
    p_action, p_title_words, p_patch, p_observed_before,
    'task-command-policy-v1', p_operation_key
  );
  result := public.create_task_command(
    p_action, p_title_words, p_patch, p_observed_before,
    'task-command-policy-v1', p_operation_key
  );
  return result ->> p_key;
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

create function pg_temp.creation_undo(p_undo_id uuid)
returns text language plpgsql as $$
declare
  result jsonb;
  failure_detail text;
begin
  result := public.undo_operation(p_undo_id);
  return result::text;
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

create function pg_temp.creation_row_state(p_task_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'dueAt', pg_temp.creation_iso(t.due_at),
    'plannedAt', pg_temp.creation_iso(t.planned_at),
    'manualPriority', t.manual_priority,
    'completedAt', pg_temp.creation_iso(t.completed_at),
    'cancelledAt', pg_temp.creation_iso(t.cancelled_at),
    'intentionalNoDue', t.intentional_no_due,
    'noDueReason', t.no_due_reason,
    'createdAt', pg_temp.creation_iso(t.created_at),
    'updatedAt', pg_temp.creation_iso(t.updated_at),
    'projectIds', coalesce((
      select jsonb_agg(tp.project_id order by tp.project_id)
      from public.task_projects tp where tp.user_id = t.user_id and tp.task_id = t.id
    ), '[]'::jsonb),
    'projectNames', coalesce((
      select jsonb_agg(p.name order by p.id)
      from public.task_projects tp join public.projects p on p.id = tp.project_id
      where tp.user_id = t.user_id and tp.task_id = t.id
    ), '[]'::jsonb),
    'contextIds', coalesce((
      select jsonb_agg(tc.context_id order by tc.context_id)
      from public.task_contexts tc where tc.user_id = t.user_id and tc.task_id = t.id
    ), '[]'::jsonb),
    'contextNames', coalesce((
      select jsonb_agg(c.name order by c.id)
      from public.task_contexts tc join public.contexts c on c.id = tc.context_id
      where tc.user_id = t.user_id and tc.task_id = t.id
    ), '[]'::jsonb),
    'personIds', coalesce((
      select jsonb_agg(tp.person_id order by tp.person_id, tp.role)
      from public.task_people tp where tp.user_id = t.user_id and tp.task_id = t.id
    ), '[]'::jsonb),
    'personNames', coalesce((
      select jsonb_agg(p.name order by p.id, tp.role)
      from public.task_people tp join public.people p on p.id = tp.person_id
      where tp.user_id = t.user_id and tp.task_id = t.id
    ), '[]'::jsonb),
    'personRoles', coalesce((
      select jsonb_agg(tp.role order by tp.person_id, tp.role)
      from public.task_people tp where tp.user_id = t.user_id and tp.task_id = t.id
    ), '[]'::jsonb)
  )
  from public.tasks t
  where t.id = p_task_id;
$$;

create function pg_temp.creation_cancel(p_task_id uuid, p_key text)
returns text language plpgsql as $$
declare
  pre jsonb := pg_temp.creation_row_state(p_task_id);
  observed text := pg_temp.creation_iso(now());
  failure_detail text;
begin
  perform public.issue_task_command_confirmation(
    p_task_id, 'cancel_task', jsonb_build_object('status', 'cancelled'),
    pre, observed, 'task-command-policy-v1', p_key
  );
  perform public.apply_task_command(
    p_task_id, 'cancel_task', jsonb_build_object('status', 'cancelled'),
    pre, observed, 'task-command-policy-v1', p_key
  );
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

create function pg_temp.creation_restore(p_task_id uuid, p_key text)
returns text language plpgsql as $$
declare
  pre jsonb := pg_temp.creation_row_state(p_task_id);
  observed text := pg_temp.creation_iso(now());
  failure_detail text;
begin
  perform public.apply_task_command(
    p_task_id, 'restore_task', jsonb_build_object('status', 'todo'),
    pre, observed, 'task-command-policy-v1', p_key
  );
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

-- Preview and task-like validation ------------------------------------------

select is(
  (
    select count(*)::integer from public.tasks
    where user_id = '71111111-1111-4111-8111-111111111111'
  ),
  0,
  'the fixture owner starts with no task'
);
select is(
  pg_temp.creation_key(
    'preview', 'reschedule_due', array['  book', 'the ', ' flights  '],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-preview', 'will_mutate'
  ),
  'false',
  'preview is explicitly read only'
);
select is(
  (
    select count(*)::integer from public.tasks
    where user_id = '71111111-1111-4111-8111-111111111111'
  ),
  0,
  'and preview inserted no task'
);
select is(
  pg_temp.creation_key(
    'preview', 'reschedule_due', array['  book', 'the ', ' flights  '],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-preview-title', 'title'
  ),
  'book the flights',
  'the server derives the same single-space title as TypeScript'
);
select is(
  pg_temp.creation_try(
    'preview', 'complete_task', array['report'], '{}'::jsonb,
    pg_temp.creation_iso(now()), 'pgtap-2e6-not-task-like'
  ),
  '22023:Invalid task creation action',
  'an action that adds no positive creation data cannot reach a preview'
);
select is(
  pg_temp.creation_try(
    'preview', 'set_priority', array[]::text[], jsonb_build_object('priority', 'high'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-no-title'
  ),
  '22023:Invalid task creation title',
  'empty title words cannot become standalone work'
);

-- Reminder preview truth -----------------------------------------------------

select is(
  pg_temp.creation_key(
    'preview', 'reschedule_due', array['past due'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() - interval '1 day')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-past-preview', 'reminder'
  )::jsonb ->> 'timing',
  'at_creation',
  'a past due date previews the trigger reminder at creation time'
);
select is(
  pg_temp.creation_key(
    'preview', 'reschedule_due', array['present due'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now())),
    pg_temp.creation_iso(now()), 'pgtap-2e6-present-preview', 'reminder'
  )::jsonb ->> 'timing',
  'at_creation',
  'a present due date previews the trigger reminder at creation time'
);
select is(
  pg_temp.creation_key(
    'preview', 'reschedule_due', array['future due'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-future-preview', 'reminder'
  )::jsonb ->> 'timing',
  'one_hour_before_due',
  'a future due date previews the one-hour lead'
);
select is(
  pg_temp.creation_key(
    'preview', 'set_planned', array['planned only'],
    jsonb_build_object('plannedAt', pg_temp.creation_iso(now() + interval '2 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-planned-preview', 'reminder'
  )::jsonb ->> 'timing',
  'none',
  'planned-only work truthfully previews no reminder'
);

-- Relation resolution and owner collapse -----------------------------------

select is(
  pg_temp.creation_key(
    'preview', 'assign_project', array['direct project'],
    jsonb_build_object('projectRef', 'Acme'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-project-direct-preview', 'canonical_payload'
  )::jsonb ->> 'relationId',
  '71000101-1111-4111-8111-111111111111',
  'a direct project name resolves to its canonical id'
);
select is(
  pg_temp.creation_key(
    'preview', 'assign_project', array['alias project'],
    jsonb_build_object('projectRef', 'Apollo'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-project-alias-preview', 'canonical_payload'
  )::jsonb ->> 'relationName',
  'Beta',
  'an active alias returns the canonical stored name'
);
select is(
  pg_temp.creation_key(
    'preview', 'assign_context', array['alias context'],
    jsonb_build_object('contextRef', 'HQ'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-context-alias-preview', 'canonical_payload'
  )::jsonb ->> 'relationId',
  '71000201-1111-4111-8111-111111111111',
  'context aliases use the same exact resolver'
);
select is(
  pg_temp.creation_key(
    'preview', 'set_waiting_on', array['waiting task'],
    jsonb_build_object('personRef', 'Boss'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-person-alias-preview', 'canonical_payload'
  )::jsonb ->> 'personRole',
  'waiting_on',
  'waiting-on creation fixes the positive relation role server-side'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['missing project'],
    jsonb_build_object('projectRef', 'Missing'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-missing'
  ),
  '22023:2E_INVALID_RELATION',
  'a missing relation is refused with the declared collapsed token'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['expired project'],
    jsonb_build_object('projectRef', 'Old Apollo'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-expired'
  ),
  '22023:2E_INVALID_RELATION',
  'an expired alias is refused identically'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['ambiguous project'],
    jsonb_build_object('projectRef', 'Twin'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-ambiguous'
  ),
  '22023:2E_INVALID_RELATION',
  'an ambiguous normalized relation is refused identically'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['foreign alias'],
    jsonb_build_object('projectRef', 'Private alias'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-foreign'
  ),
  '22023:2E_INVALID_RELATION',
  'another owner relation collapses to the same answer as nonexistent'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['numeric relation'],
    '{"projectRef":123}'::jsonb,
    pg_temp.creation_iso(now()), 'pgtap-2e6-relation-number'
  ),
  '22023:2E_INVALID_RELATION',
  'a numeric relation reference is rejected before text coercion can resolve it'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['boolean relation'],
    '{"projectRef":true}'::jsonb,
    pg_temp.creation_iso(now()), 'pgtap-2e6-relation-boolean'
  ),
  '22023:2E_INVALID_RELATION',
  'a boolean relation reference is rejected before text coercion can resolve it'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['object relation'],
    '{"projectRef":{"name":"object ref"}}'::jsonb,
    pg_temp.creation_iso(now()), 'pgtap-2e6-relation-object'
  ),
  '22023:2E_INVALID_RELATION',
  'an object relation reference is rejected before JSON text can resolve it'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['array relation'],
    '{"projectRef":["array ref"]}'::jsonb,
    pg_temp.creation_iso(now()), 'pgtap-2e6-relation-array'
  ),
  '22023:2E_INVALID_RELATION',
  'an array relation reference is rejected before JSON text can resolve it'
);

-- Explicit confirmation, creation, replay and provenance --------------------

select is(
  pg_temp.creation_try(
    'create', 'reschedule_due', array['book flights'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy'
  ),
  'P0001:2E_CONFIRMATION_REQUIRED',
  'creation cannot happen in one step'
);
select is(
  pg_temp.creation_try(
    'issue', 'reschedule_due', array['book flights'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy'
  ),
  'accepted',
  'the server issues explicit confirmation for the exact creation payload'
);
select results_eq(
  $$ select action, task_id, status
     from public.task_command_confirmations
     where operation_key = 'pgtap-2e6-happy' $$,
  $$ values ('create_task'::text, null::uuid, 'issued'::text) $$,
  'creation confirmation is subjectless and unconsumed before mutation'
);
select is(
  pg_temp.creation_key(
    'create', 'reschedule_due', array['book flights'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy', 'outcome'
  ),
  'applied',
  'confirmed standalone work is created'
);
select is(
  (select status from public.task_command_confirmations
   where operation_key = 'pgtap-2e6-happy'),
  'consumed',
  'the confirmation is consumed in the creation transaction'
);
select is(
  (select due_at from public.tasks where operation_key = 'pgtap-2e6-happy'),
  now() + interval '5 days',
  'reschedule_due applies only its positive due value to the new task'
);
select results_eq(
  $$ select source_entry_id, source_interpretation_id, candidate_index, created_by, status
     from public.tasks
     where operation_key = 'pgtap-2e6-happy' $$,
  $$ values (null::uuid, null::uuid, null::integer, 'agent'::text, 'inbox'::text) $$,
  'standalone provenance is exactly three nulls, created_by agent and inbox'
);
select is(
  (select count(*)::integer from public.audit_logs a
   join public.tasks t on t.id = a.entity_id
   where t.operation_key = 'pgtap-2e6-happy'
     and a.action_type = 'task_created' and a.actor = 'agent'),
  1,
  'the existing INSERT trigger records task_created by the agent'
);
select is(
  (select count(*)::integer from public.audit_logs a
   join public.tasks t on t.id = a.entity_id
   where t.operation_key = 'pgtap-2e6-happy'
     and a.action_type = 'task_command_created' and a.actor = 'user'),
  1,
  'the command audit separately records the confirming user and creation action'
);
select is(
  (select action_type from public.undo_operations
   where operation_key = 'taskcmd-v1:pgtap-2e6-happy'),
  'create_task_command',
  'the creation reserves the registered standalone undo action'
);
select is(
  (select entity_ids[1] from public.undo_operations
   where operation_key = 'taskcmd-v1:pgtap-2e6-happy'),
  (select id from public.tasks where operation_key = 'pgtap-2e6-happy'),
  'and patches the reservation with the created task id'
);
select is(
  (select count(*)::integer from public.reminders r
   join public.tasks t on t.id = r.task_id
   where t.operation_key = 'pgtap-2e6-happy' and r.status = 'scheduled'),
  1,
  'the existing trigger creates exactly one future-due reminder'
);
select is(
  (
    select r.remind_at = t.due_at - interval '1 hour'
    from public.reminders r join public.tasks t on t.id = r.task_id
    where t.operation_key = 'pgtap-2e6-happy'
  ),
  true,
  'the future reminder uses the trigger one-hour lead'
);

select is(
  pg_temp.creation_key(
    'create', 'reschedule_due', array['book flights'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy', 'idempotent'
  ),
  'true',
  'an exact replay returns the stored result'
);
select is(
  (select count(*)::integer from public.tasks where operation_key = 'pgtap-2e6-happy'),
  1,
  'exact replay creates no second task'
);
select is(
  (select count(*)::integer from public.reminders r
   join public.tasks t on t.id = r.task_id
   where t.operation_key = 'pgtap-2e6-happy'),
  1,
  'exact replay creates no second reminder'
);
select is(
  pg_temp.creation_try(
    'create', 'reschedule_due', array['changed title'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy'
  ),
  'P0001:2E_IDEMPOTENCY_MISMATCH',
  'the same operation key cannot be rebound to a changed canonical payload'
);
select is(
  pg_temp.creation_try(
    'issue', 'reschedule_due', array['changed title'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy'
  ),
  'P0001:2E_IDEMPOTENCY_MISMATCH',
  'and changed payload cannot inherit the previous confirmation'
);

select is(
  pg_temp.creation_try(
    'issue', 'reschedule_due', array['consumed confirmation'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '6 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-consumed'
  ),
  'accepted',
  'a second fixture receives a server-issued confirmation'
);
reset role;
update public.task_command_confirmations
set status = 'consumed', consumed_at = now()
where user_id = '71111111-1111-4111-8111-111111111111'
  and operation_key = 'pgtap-2e6-consumed';
set local role authenticated;
select is(
  pg_temp.creation_try(
    'create', 'reschedule_due', array['consumed confirmation'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '6 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-consumed'
  ),
  'P0001:2E_CONFIRMATION_REQUIRED',
  'a consumed confirmation cannot authorize a creation with no committed reservation'
);

-- Reminder variants ---------------------------------------------------------

select is(
  pg_temp.creation_confirm_and_create(
    'reschedule_due', array['past reminder'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() - interval '1 day')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-past', 'outcome'
  ),
  'applied',
  'past-due creation succeeds'
);
select is(
  (
    select r.remind_at = now()
    from public.reminders r join public.tasks t on t.id = r.task_id
    where t.operation_key = 'pgtap-2e6-past'
  ),
  true,
  'past-due reminder is clamped to transaction now'
);
select is(
  pg_temp.creation_confirm_and_create(
    'reschedule_due', array['present reminder'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now())),
    pg_temp.creation_iso(now()), 'pgtap-2e6-present', 'outcome'
  ),
  'applied',
  'present-due creation succeeds'
);
select is(
  (
    select r.remind_at = now()
    from public.reminders r join public.tasks t on t.id = r.task_id
    where t.operation_key = 'pgtap-2e6-present'
  ),
  true,
  'present-due reminder is also clamped to transaction now'
);
select is(
  pg_temp.creation_confirm_and_create(
    'set_planned', array['planned no reminder'],
    jsonb_build_object('plannedAt', pg_temp.creation_iso(now() + interval '2 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-planned', 'outcome'
  ),
  'applied',
  'planned-only creation succeeds'
);
select is(
  (select planned_at from public.tasks where operation_key = 'pgtap-2e6-planned'),
  now() + interval '2 days',
  'set_planned applies its positive planning value'
);
select is(
  (select count(*)::integer from public.reminders r
   join public.tasks t on t.id = r.task_id
   where t.operation_key = 'pgtap-2e6-planned'),
  0,
  'planned-only creation has no reminder'
);

-- Relation writes -----------------------------------------------------------

select is(
  pg_temp.creation_confirm_and_create(
    'assign_project', array['project direct task'], jsonb_build_object('projectRef', 'Acme'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-project-direct', 'outcome'
  ),
  'applied',
  'direct project creation succeeds'
);
select is(
  (select project_id from public.task_projects tp join public.tasks t on t.id = tp.task_id
   where t.operation_key = 'pgtap-2e6-project-direct'),
  '71000101-1111-4111-8111-111111111111'::uuid,
  'direct project writes only the resolved project relation'
);
select is(
  pg_temp.creation_confirm_and_create(
    'assign_context', array['context alias task'], jsonb_build_object('contextRef', 'HQ'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-context-alias', 'outcome'
  ),
  'applied',
  'context alias creation succeeds'
);
select is(
  (select context_id from public.task_contexts tc join public.tasks t on t.id = tc.task_id
   where t.operation_key = 'pgtap-2e6-context-alias'),
  '71000201-1111-4111-8111-111111111111'::uuid,
  'context alias writes the canonical context relation'
);
select is(
  pg_temp.creation_confirm_and_create(
    'assign_person', array['person direct task'], jsonb_build_object('personRef', 'Maria'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-person-direct', 'outcome'
  ),
  'applied',
  'direct person creation succeeds'
);
select results_eq(
  $$ select tp.person_id, tp.role
     from public.task_people tp join public.tasks t on t.id = tp.task_id
     where t.operation_key = 'pgtap-2e6-person-direct' $$,
  $$ values ('71000301-1111-4111-8111-111111111111'::uuid, 'involved'::text) $$,
  'assign_person writes only the involved relation'
);
select is(
  pg_temp.creation_confirm_and_create(
    'set_waiting_on', array['person waiting task'], jsonb_build_object('personRef', 'Boss'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-person-waiting', 'outcome'
  ),
  'applied',
  'waiting-on alias creation succeeds'
);
select results_eq(
  $$ select tp.person_id, tp.role
     from public.task_people tp join public.tasks t on t.id = tp.task_id
     where t.operation_key = 'pgtap-2e6-person-waiting' $$,
  $$ values ('71000301-1111-4111-8111-111111111111'::uuid, 'waiting_on'::text) $$,
  'set_waiting_on writes only the waiting_on relation'
);

-- Undo, edited-state refusal and replay after undo ---------------------------

select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-happy'
  ))::jsonb ->> 'affected',
  '1',
  'creation undo succeeds through the shared router'
);
select is(
  (select status from public.tasks where operation_key = 'pgtap-2e6-happy'),
  'cancelled',
  'creation undo cancels rather than deletes the task, preserving history'
);
select is(
  (select r.status from public.reminders r join public.tasks t on t.id = r.task_id
   where t.operation_key = 'pgtap-2e6-happy'),
  'cancelled',
  'creation undo cancels the exact still-live reminder'
);
select is(
  (select status from public.undo_operations
   where operation_key = 'taskcmd-v1:pgtap-2e6-happy'),
  'undone',
  'creation undo marks the originating operation undone'
);
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-happy'
  ))::jsonb ->> 'idempotent',
  'true',
  'repeated undo is idempotent'
);
select is(
  pg_temp.creation_key(
    'create', 'reschedule_due', array['book flights'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy', 'creation_undone'
  ),
  'true',
  'exact replay after undo reports that creation is no longer active'
);
select is(
  pg_temp.creation_key(
    'create', 'reschedule_due', array['book flights'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy', 'task_id'
  ),
  (select id::text from public.tasks where operation_key = 'pgtap-2e6-happy'),
  'replay after undo returns the original task id'
);
select is(
  pg_temp.creation_key(
    'create', 'reschedule_due', array['book flights'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy', 'undo_id'
  ),
  (select id::text from public.undo_operations
   where operation_key = 'taskcmd-v1:pgtap-2e6-happy'),
  'replay after undo also returns the original undo id'
);
select is(
  (select count(*)::integer from public.tasks where operation_key = 'pgtap-2e6-happy'),
  1,
  'replay after undo never recreates the task'
);

select is(
  pg_temp.creation_confirm_and_create(
    'set_priority', array['edited scalar task'], jsonb_build_object('priority', 'high'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-edited-scalar', 'outcome'
  ),
  'applied',
  'edited-scalar undo fixture is created'
);
select is(
  (select manual_priority from public.tasks
   where operation_key = 'pgtap-2e6-edited-scalar'),
  'high',
  'set_priority applies its positive priority value'
);
select is(
  (select count(*)::integer from public.reminders r
   join public.tasks t on t.id = r.task_id
   where t.operation_key = 'pgtap-2e6-edited-scalar'),
  0,
  'a positive priority with no due date creates no reminder'
);
update public.tasks set title = 'Edited later'
where operation_key = 'pgtap-2e6-edited-scalar';
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-edited-scalar'
  )),
  'P0001:2E_UNDO_RESTORE_INTEGRITY',
  'undo refuses a task whose recorded scalar state was edited'
);

select is(
  pg_temp.creation_confirm_and_create(
    'assign_project', array['edited relation task'], jsonb_build_object('projectRef', 'Acme'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-edited-relation', 'outcome'
  ),
  'applied',
  'edited-relation undo fixture is created'
);
insert into public.task_contexts (user_id, task_id, context_id)
select user_id, id, '71000201-1111-4111-8111-111111111111'
from public.tasks where operation_key = 'pgtap-2e6-edited-relation';
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-edited-relation'
  )),
  'P0001:2E_UNDO_RESTORE_INTEGRITY',
  'undo refuses a task whose recorded relation set was edited'
);

select is(
  pg_temp.creation_confirm_and_create(
    'reschedule_due', array['edited reminder task'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '4 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-edited-reminder', 'outcome'
  ),
  'applied',
  'edited-reminder undo fixture is created'
);
update public.reminders set remind_at = remind_at + interval '10 minutes'
where task_id = (select id from public.tasks where operation_key = 'pgtap-2e6-edited-reminder');
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-edited-reminder'
  )),
  'P0001:2E_UNDO_REMINDER_INTEGRITY',
  'undo refuses a still-live reminder whose recorded state was edited'
);

select is(
  pg_temp.creation_confirm_and_create(
    'reschedule_due', array['snoozed original reminder'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '4 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-snoozed-original', 'outcome'
  ),
  'applied',
  'snoozed-original undo fixture is created'
);
update public.reminders
set status = 'snoozed', snoozed_until = now() + interval '1 day'
where task_id = (
  select id from public.tasks where operation_key = 'pgtap-2e6-snoozed-original'
);
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-snoozed-original'
  ))::jsonb ->> 'reminders_cancelled',
  '1',
  'creation undo cancels its exact recorded reminder after it is snoozed'
);

select is(
  pg_temp.creation_confirm_and_create(
    'reschedule_due', array['extra scheduled reminder'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '4 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-extra-scheduled', 'outcome'
  ),
  'applied',
  'extra-scheduled undo fixture is created'
);
insert into public.reminders (user_id, task_id, title, remind_at, important, status)
select user_id, id, 'Extra scheduled reminder', now() + interval '2 days', false, 'scheduled'
from public.tasks where operation_key = 'pgtap-2e6-extra-scheduled';
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-extra-scheduled'
  )),
  'P0001:2E_UNDO_REMINDER_INTEGRITY',
  'creation undo refuses an additional scheduled live reminder'
);

select is(
  pg_temp.creation_confirm_and_create(
    'reschedule_due', array['extra snoozed reminder'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '4 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-extra-snoozed', 'outcome'
  ),
  'applied',
  'extra-snoozed undo fixture is created'
);
insert into public.reminders (
  user_id, task_id, title, remind_at, important, status, snoozed_until
)
select
  user_id, id, 'Extra snoozed reminder', now() + interval '2 days',
  false, 'snoozed', now() + interval '3 days'
from public.tasks where operation_key = 'pgtap-2e6-extra-snoozed';
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-extra-snoozed'
  )),
  'P0001:2E_UNDO_REMINDER_INTEGRITY',
  'creation undo refuses an additional snoozed live reminder'
);

-- Cancel/creation-undo collision and every resurrection door ----------------

select is(
  pg_temp.creation_confirm_and_create(
    'set_priority', array['collision task'], jsonb_build_object('priority', 'urgent'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-collision', 'outcome'
  ),
  'applied',
  'collision fixture is created'
);
select is(
  pg_temp.creation_cancel(
    (select id from public.tasks where operation_key = 'pgtap-2e6-collision'),
    'pgtap-2e6-collision-cancel'
  ),
  'accepted',
  'the user can cancel the active command-created task'
);
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-collision'
  ))::jsonb ->> 'affected',
  '0',
  'creation undo after user cancellation succeeds without resurrecting or rewriting it'
);
select is(
  pg_temp.creation_undo((
    select id from public.undo_operations
    where operation_key = 'taskcmd-v1:pgtap-2e6-collision-cancel'
  )),
  '55P03:2E_CREATION_UNDONE',
  'cancel undo refuses after the originating creation was undone'
);
select is(
  (
    select count(*)::integer
    from public.list_task_command_candidates(
      array['cancelled'], 'collision task', null, null, null, now(), 25,
      null, null, null
    )
    where task_id = (select id from public.tasks where operation_key = 'pgtap-2e6-collision')
  ),
  0,
  'the candidate door excludes a command-created task after creation undo'
);
select is(
  pg_temp.creation_restore(
    (select id from public.tasks where operation_key = 'pgtap-2e6-collision'),
    'pgtap-2e6-collision-restore'
  ),
  '55P03:2E_CREATION_UNDONE',
  'the restore door refuses to resurrect the command-created task'
);
reset role;
select is(
  (
    select position('private.is_task_creation_action' in pg_get_functiondef(
      'private.undo_apply_task_command_fields(uuid, uuid)'::regprocedure)) > 0
  ),
  true,
  'the cancel-undo locking door uses the centralized creation family'
);
set local role authenticated;
select is(
  pg_temp.creation_cancel(
    (select id from public.tasks where operation_key = 'pgtap-2e6-happy'),
    'pgtap-2e6-after-creation-undo-cancel'
  ),
  'accepted',
  'the opposite collision ordering treats cancellation after creation undo as a terminal no-change'
);
select is(
  (select status from public.tasks where operation_key = 'pgtap-2e6-happy'),
  'cancelled',
  'cancellation after creation undo leaves the historical task cancelled'
);

-- Other owner and unauthenticated -------------------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"71222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  pg_temp.creation_try(
    'create', 'reschedule_due', array['book flights'],
    jsonb_build_object('dueAt', pg_temp.creation_iso(now() + interval '5 days')),
    pg_temp.creation_iso(now()), 'pgtap-2e6-happy'
  ),
  'P0001:2E_CONFIRMATION_REQUIRED',
  'a second owner cannot consume the first owner confirmation under the same raw key'
);
select is(
  pg_temp.creation_try(
    'preview', 'assign_project', array['foreign hidden'],
    jsonb_build_object('projectRef', 'Acme'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-owner-two'
  ),
  '22023:2E_INVALID_RELATION',
  'a second owner cannot resolve the first owner direct relation name'
);
select is(
  (
    select count(*)::integer from public.tasks
    where operation_key = 'pgtap-2e6-happy'
  ),
  0,
  'RLS discloses no first-owner task to the second owner'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;

select is(
  pg_temp.creation_try(
    'preview', 'set_priority', array['no identity'], jsonb_build_object('priority', 'high'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-no-auth-preview'
  ),
  '42501:Authentication required',
  'preview requires an authenticated owner'
);
select is(
  pg_temp.creation_try(
    'issue', 'set_priority', array['no identity'], jsonb_build_object('priority', 'high'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-no-auth-issue'
  ),
  '42501:Authentication required',
  'confirmation issuance requires an authenticated owner'
);
select is(
  pg_temp.creation_try(
    'create', 'set_priority', array['no identity'], jsonb_build_object('priority', 'high'),
    pg_temp.creation_iso(now()), 'pgtap-2e6-no-auth-create'
  ),
  '42501:Authentication required',
  'creation requires an authenticated owner'
);

reset role;
select * from finish();
rollback;
