-- Phase 2M slice 2M.2 - `clear_planned`, migration 202608110091 (ADR-106).
--
-- `2M-PLAN-002`: "A planned day can be removed through the same validated
-- command path that sets it; the asymmetry with `clear_due` is closed."
--
-- WHY A FILE OF ITS OWN, AND WHY IT IS NOT VITEST
--
-- `src/features/task-commands/clear-planned.test.ts` proves the taxonomy, the
-- canonical patch, the derived controls and the TEXT of the migration. None of
-- that is the database. What only this file can prove:
--
--   * the verb is REACHABLE through `public.apply_task_command` as the
--     `authenticated` caller the product uses, rather than merely present in a
--     function definition;
--   * the null asymmetry actually holds in both directions - `clear_planned`
--     refuses an instant and `set_planned` refuses a null - which is what stops
--     the clearing verb becoming a second, differently-audited way to set a day;
--   * the write, the audit row and the undo agree. `restore_fields` restores
--     from `before_state` through the ten-column guard, and a `planned_at`
--     recorded wrong at step 23 makes every clear-undo fail forever while every
--     TypeScript test stays green;
--   * clearing arms and cancels NO reminder. `clear_due` cancels one; an
--     intention never armed one (OD-2M-3 A), and a verb that closed reminders
--     here would silently cancel the one the task's DEADLINE still wants. That
--     is a negative that only a database with a live `tasks_create_due_reminder`
--     trigger can demonstrate.
--
-- Written in pure ASCII, following `phase_2e_task_command_apply.sql`'s doctrine.
-- `9c` is this file's reserved fixture prefix.

begin;
select plan(18);

-- `to_char(..., 'OF')` renders through the session TimeZone, which
-- `set search_path = ''` does not pin. `set local` is transaction-scoped.
set local timezone to 'UTC';

-- Contract, before any call ---------------------------------------------------

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc as candidate
   join pg_catalog.pg_namespace as namespace on namespace.oid = candidate.pronamespace
   where namespace.nspname = 'public'
     and candidate.proname = 'apply_task_command'),
  1,
  'exactly one apply_task_command survives the replacement, under one signature'
);

select is(
  (select count(*)::integer
   from regexp_matches(
     pg_get_functiondef(
       'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure
     ),
     'p_action in \(''set_planned'', ''clear_planned''\)',
     'g'
   )),
  4,
  'all four planned_at sites admit the verb: two deltas, the write and the applied state'
);

-- Fixtures --------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9c111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'clear-planned@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Three subjects, because an applied command is not undone until its own
-- section and a shared subject would make each assertion depend on the last.
--
--   `9c000001` carries a planned day AND a future deadline. The deadline is not
--   decoration: `tasks_create_due_reminder` arms a reminder at insert time, and
--   the reminder still being live after the clear is the assertion that this
--   verb does not reconcile reminders.
--   `9c000002` carries a planned day and is the subject of the refusals.
--   `9c000003` carries none, which is the `no_change` case.
insert into public.tasks (
  id, user_id, title, description, status, manual_priority,
  due_at, planned_at, completed_at, cancelled_at, intentional_no_due, no_due_reason
) values
  ('9c000001-1111-4111-8111-111111111111', '9c111111-1111-4111-8111-111111111111',
   'Escrever o rascunho', null, 'todo', null,
   now() + interval '5 days', now() + interval '2 days', null, null, false, null),
  ('9c000002-1111-4111-8111-111111111111', '9c111111-1111-4111-8111-111111111111',
   'Revisar o orcamento', null, 'todo', null,
   null, now() + interval '3 days', null, null, false, null),
  ('9c000003-1111-4111-8111-111111111111', '9c111111-1111-4111-8111-111111111111',
   'Sem dia planejado', null, 'todo', null,
   null, null, null, null, false, null);

create function pg_temp.cp_iso(p_instant timestamptz)
returns text
language sql
as $$
  select to_char(p_instant at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z';
$$;

-- The pre-state the RPC demands: EXACTLY nineteen keys, no more and no fewer
-- (`202608110091:460`), with the instants rendered the way the deployed reader
-- renders them - `USOF`, not a hand-written `Z`. The relation arrays are empty
-- literals rather than subqueries because these fixtures hold no relations, and
-- an empty array is what the real builder would have produced for them; the
-- `personIds`/`personRoles` pair must stay the same length or step 6 refuses
-- the payload before any of this file's assertions can mean anything.
create function pg_temp.cp_pre_state(p_task_id uuid)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'title', task.title,
    'description', task.description,
    'status', task.status,
    'dueAt', to_char(task.due_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'plannedAt', to_char(task.planned_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'manualPriority', task.manual_priority,
    'completedAt', to_char(task.completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'cancelledAt', to_char(task.cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'intentionalNoDue', task.intentional_no_due,
    'noDueReason', task.no_due_reason,
    'createdAt', to_char(task.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'updatedAt', to_char(task.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'projectIds', '[]'::jsonb,
    'projectNames', '[]'::jsonb,
    'contextIds', '[]'::jsonb,
    'contextNames', '[]'::jsonb,
    'personIds', '[]'::jsonb,
    'personNames', '[]'::jsonb,
    'personRoles', '[]'::jsonb
  )
  from public.tasks as task
  where task.id = p_task_id;
$$;

-- Returns 'accepted', or `SQLSTATE:DETAIL` with `sqlerrm` as the fallback, so a
-- guard that STOPPED refusing fails loudly rather than passing quietly. The
-- exception block opens a subtransaction, so each refusal rolls back the
-- reservation it had already inserted and several may share one operation key.
create function pg_temp.cp_apply(
  p_task_id uuid,
  p_action text,
  p_patch jsonb,
  p_pre_state jsonb,
  p_observed_before text,
  p_operation_key text
)
returns text
language plpgsql
as $$
declare
  failure_detail text;
begin
  perform public.apply_task_command(
    p_task_id, p_action, p_patch, p_pre_state,
    p_observed_before, 'task-command-policy-v1', p_operation_key
  );
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"9c111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

-- The refusals, before the successful path -------------------------------------
--
-- Deliberately first. Running them after the apply would leave a reader unable
-- to tell a guard that refuses everything from a guard that refuses correctly,
-- because the successful case would already have passed.

select is(
  pg_temp.cp_apply(
    '9c000002-1111-4111-8111-111111111111',
    'clear_planned',
    jsonb_build_object('plannedAt', pg_temp.cp_iso(now() + interval '9 days')),
    pg_temp.cp_pre_state('9c000002-1111-4111-8111-111111111111'),
    pg_temp.cp_iso(now()),
    'pgtap-2m2-cp-instant'
  ),
  '22023:Invalid task command planned date',
  'clear_planned refuses a valid instant: it clears, and clearing is all it does'
);

select is(
  pg_temp.cp_apply(
    '9c000002-1111-4111-8111-111111111111',
    'set_planned',
    jsonb_build_object('plannedAt', null),
    pg_temp.cp_pre_state('9c000002-1111-4111-8111-111111111111'),
    pg_temp.cp_iso(now()),
    'pgtap-2m2-sp-null'
  ),
  '22023:Invalid task command planned date',
  'and set_planned still refuses a null, so it never became a second way to clear'
);

select is(
  pg_temp.cp_apply(
    '9c000002-1111-4111-8111-111111111111',
    'clear_planned',
    '{}'::jsonb,
    pg_temp.cp_pre_state('9c000002-1111-4111-8111-111111111111'),
    pg_temp.cp_iso(now()),
    'pgtap-2m2-cp-empty'
  ),
  '22023:Task command patch is missing a required field',
  'the plannedAt key is required even though its only legal value is null'
);

select is(
  pg_temp.cp_apply(
    '9c000002-1111-4111-8111-111111111111',
    'clear_planned',
    jsonb_build_object('plannedAt', null, 'dueAt', null),
    pg_temp.cp_pre_state('9c000002-1111-4111-8111-111111111111'),
    pg_temp.cp_iso(now()),
    'pgtap-2m2-cp-extra'
  ),
  '22023:Task command patch carries a field this action does not allow',
  'and it cannot smuggle a second column in beside the one it declares'
);

select is(
  pg_temp.cp_apply(
    '9c000002-1111-4111-8111-111111111111',
    'clear_planned',
    jsonb_build_object('plannedAt', null),
    pg_temp.cp_pre_state('9c000002-1111-4111-8111-111111111111')
      || jsonb_build_object('title', 'Um titulo que a linha nao tem'),
    pg_temp.cp_iso(now()),
    'pgtap-2m2-cp-stale'
  ),
  '55P03:Task changed since the preview',
  'the twelve-column staleness gate governs this verb like every other'
);

select is(
  (select planned_at from public.tasks where id = '9c000002-1111-4111-8111-111111111111'),
  (select now() + interval '3 days'),
  'and after five refusals the planned day is exactly where it was'
);

-- The successful path -----------------------------------------------------------

select is(
  public.apply_task_command(
    '9c000001-1111-4111-8111-111111111111',
    'clear_planned',
    jsonb_build_object('plannedAt', null),
    pg_temp.cp_pre_state('9c000001-1111-4111-8111-111111111111'),
    pg_temp.cp_iso(now()),
    'task-command-policy-v1',
    'pgtap-2m2-cp-applied'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '9c000001-1111-4111-8111-111111111111',
    'action', 'clear_planned',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'clear_planned applies and touches no reminder: an intention never armed one'
);

select results_eq(
  $$ select
       (select planned_at from public.tasks where id = '9c000001-1111-4111-8111-111111111111'),
       (select due_at is not null from public.tasks where id = '9c000001-1111-4111-8111-111111111111'),
       (select count(*)::integer from public.reminders
          where task_id = '9c000001-1111-4111-8111-111111111111' and status = 'scheduled') $$,
  $$ values (null::timestamptz, true, 1) $$,
  'the planned day is gone, the deadline is untouched, and its reminder is still live'
);

-- The one that would have been invisible: a `clear_due` on this task would have
-- closed that reminder. The count above is 1 and not 0 precisely because the
-- taxonomy declares no reminder effect for this verb.

select is(
  (select after_state -> 'applied_state' ->> 'planned_at'
   from public.audit_logs
   where user_id = '9c111111-1111-4111-8111-111111111111'
     and action_type = 'task_command_applied'
     and entity_id = '9c000001-1111-4111-8111-111111111111'
   order by created_at desc
   limit 1),
  null::text,
  'the recorded applied_state says planned_at is null, which is what the undo guard reads back'
);

select isnt(
  (select before_state ->> 'planned_at'
   from public.audit_logs
   where user_id = '9c111111-1111-4111-8111-111111111111'
     and action_type = 'task_command_applied'
     and entity_id = '9c000001-1111-4111-8111-111111111111'
   order by created_at desc
   limit 1),
  null::text,
  'and the before_state still carries the day it removed, or nothing could restore it'
);

-- Idempotency and no_change ------------------------------------------------------

select is(
  public.apply_task_command(
    '9c000001-1111-4111-8111-111111111111',
    'clear_planned',
    jsonb_build_object('plannedAt', null),
    pg_temp.cp_pre_state('9c000001-1111-4111-8111-111111111111'),
    pg_temp.cp_iso(now()),
    'task-command-policy-v1',
    'pgtap-2m2-cp-again'
  ) ->> 'outcome',
  'no_change',
  'clearing an already-clear day writes nothing and says so'
);

select is(
  public.apply_task_command(
    '9c000003-1111-4111-8111-111111111111',
    'clear_planned',
    jsonb_build_object('plannedAt', null),
    pg_temp.cp_pre_state('9c000003-1111-4111-8111-111111111111'),
    pg_temp.cp_iso(now()),
    'task-command-policy-v1',
    'pgtap-2m2-cp-never'
  ) ->> 'outcome',
  'no_change',
  'and so does clearing a day that was never set - no reservation, no audit row'
);

select is(
  (select count(*)::integer
   from public.audit_logs
   where user_id = '9c111111-1111-4111-8111-111111111111'
     and action_type = 'task_command_applied'
     and entity_id = '9c000003-1111-4111-8111-111111111111'),
  0,
  'a no_change leaves no trace at all, which is what makes it different from an apply'
);

-- Undo ---------------------------------------------------------------------------

select is(
  public.undo_operation((
    select operation.id from public.undo_operations as operation
    where operation.user_id = '9c111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2m2-cp-applied'
  )) ->> 'undone',
  'true',
  'the removal is undoable through the deployed handler, which was not re-declared'
);

select is(
  (select planned_at from public.tasks where id = '9c000001-1111-4111-8111-111111111111'),
  (select now() + interval '2 days'),
  'and the day comes back exactly as it was, from the recorded before_state'
);

select is(
  (select count(*)::integer from public.reminders
     where task_id = '9c000001-1111-4111-8111-111111111111' and status = 'scheduled'),
  1,
  'with the deadline reminder still untouched on the way back, as it was on the way out'
);

select * from finish();
rollback;
