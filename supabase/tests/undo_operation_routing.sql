-- Pre-Phase-2E hardening: undo handler routing (migration 202607250052).
--
-- The compensation bodies that used to live inside public.undo_operation now
-- live in private handlers, registered in private.undo_operation_handlers.
-- The existing suites already prove each family's compensation *behaviour*
-- end to end through public.undo_operation, so after the split they are also
-- the routing tests: candidate_action_consistency,
-- editable_candidate_confirmation{,_race}, phase_2c_slice_4, phase_2c_slice_5,
-- resolve_pending_question{,_v2,_v3}, interpretation_revisions.
--
-- This file proves the layer those cannot see: the router's own security
-- posture, registry integrity, handler posture, and the structural guarantee
-- that an operation can never be recorded without a handler to reverse it.

begin;

select plan(19);

-- The stable entry point -----------------------------------------------------

select has_function(
  'public',
  'undo_operation',
  array['uuid'],
  'the authenticated undo entry point keeps its exact signature'
);

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.undo_operation(uuid)'::regprocedure $$,
  array[true],
  'the router is security definer and validates the authenticated owner internally'
);

select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.undo_operation(uuid)'::regprocedure $$,
  array[true],
  'the router has an explicit safe search path'
);

select ok(
  has_function_privilege('authenticated', 'public.undo_operation(uuid)', 'execute'),
  'authenticated users can still execute undo'
);

select ok(
  not has_function_privilege('anon', 'public.undo_operation(uuid)', 'execute'),
  'anonymous callers cannot execute undo'
);

select ok(
  position('correct_entry_interpretation' in pg_get_functiondef('public.undo_operation(uuid)'::regprocedure)) = 0,
  'the router carries no operation-specific compensation logic'
);

-- Registry integrity ---------------------------------------------------------

select has_table(
  'private',
  'undo_operation_handlers',
  'the handler registry exists'
);

select is(
  (
    select count(*)::int
    from (select distinct handler_function from private.undo_operation_handlers) as registered
    where to_regprocedure(
      'private.' || quote_ident(registered.handler_function) || '(uuid, uuid)'
    ) is null
  ),
  0,
  'every registered handler exists with the routed signature'
);

-- Each action_type any shipped RPC can record must be routable. The 2C
-- v2/v3/v4 confirmation versions record the unversioned candidate key, so
-- they are covered by that row rather than rows of their own.
select is(
  (
    select count(*)::int
    from private.undo_operation_handlers
    where action_type in (
      'correct_entry_interpretation',
      'confirm_entry_tasks',
      'confirm_entry_task_candidates',
      'confirm_entry_task_candidates_v5',
      'confirm_entry_task_candidates_v6',
      'resolve_entry_person_candidates',
      'resolve_pending_question_v1',
      'resolve_pending_question_v2',
      'resolve_pending_question_v3'
    )
  ),
  9,
  'every recordable operation has a registered handler'
);

select is(
  (
    select count(*)::int
    from public.undo_operations as recorded
    where not exists (
      select 1 from private.undo_operation_handlers as handlers
      where handlers.action_type = recorded.action_type
    )
  ),
  0,
  'no already-recorded undo operation is left without a handler'
);

select has_trigger(
  'public',
  'undo_operations',
  'undo_operations_registered_handler',
  'recording an operation is guarded against an unregistered action_type'
);

-- Handler posture ------------------------------------------------------------

select is(
  (
    select count(*)::int
    from (select distinct handler_function from private.undo_operation_handlers) as registered
    join pg_proc procedure
      on procedure.oid = to_regprocedure(
        'private.' || quote_ident(registered.handler_function) || '(uuid, uuid)'
      )::oid
    where procedure.prosecdef
  ),
  0,
  'handlers are security invoker so an accidental grant cannot become a cross-tenant write'
);

select is(
  (
    select count(*)::int
    from (select distinct handler_function from private.undo_operation_handlers) as registered
    join pg_proc procedure
      on procedure.oid = to_regprocedure(
        'private.' || quote_ident(registered.handler_function) || '(uuid, uuid)'
      )::oid
    where not ('search_path=""' = any(coalesce(procedure.proconfig, array[]::text[])))
  ),
  0,
  'every handler sets an explicit safe search path'
);

select is(
  (
    select count(*)::int
    from (select distinct handler_function from private.undo_operation_handlers) as registered
    cross join unnest(array['public', 'anon', 'authenticated', 'service_role']) as grantee(role_name)
    where has_function_privilege(
      grantee.role_name,
      ('private.' || quote_ident(registered.handler_function) || '(uuid, uuid)')::regprocedure,
      'execute'
    )
  ),
  0,
  'no role can call a compensation handler directly'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated users cannot reach the private schema at all'
);

-- The introspection helper the fail-closed source guards depend on ----------

select is(
  (
    select count(*)::int
    from (select distinct handler_function from private.undo_operation_handlers) as registered
    where position(registered.handler_function in private.undo_operation_definition_bundle()) = 0
  ),
  0,
  'the definition bundle covers the router and every registered handler'
);

-- Structural guarantee: recording requires a handler -------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('7d000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'undo-routing-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

select throws_ok(
  $$
    insert into public.undo_operations (user_id, action_type, entity_type, entity_ids, after_state)
    values (
      '7d000001-0000-4000-8000-000000000001',
      'phase_2e_operation_with_no_handler',
      'task',
      array[]::uuid[],
      '{}'::jsonb
    )
  $$,
  'P0001',
  'Undo operation has no registered handler',
  'an operation with no registered handler cannot be recorded at all'
);

-- A registered handler still refuses an operation it does not own, so a
-- registry mistake can never make one operation compensate another.
insert into public.undo_operations (id, user_id, action_type, entity_type, entity_ids, after_state)
values (
  '7d000002-0000-4000-8000-000000000002',
  '7d000001-0000-4000-8000-000000000001',
  'correct_entry_interpretation',
  'entry_interpretation',
  array[]::uuid[],
  '{}'::jsonb
);

select throws_ok(
  $$
    select private.undo_confirm_entry_tasks(
      '7d000001-0000-4000-8000-000000000001',
      '7d000002-0000-4000-8000-000000000002'
    )
  $$,
  'P0001',
  'Unsupported undo operation',
  'a handler refuses an action_type it does not own'
);

-- Routing rejects an unknown operation with the pre-split contract. The
-- registration trigger makes an unregistered action_type unrecordable, so the
-- only way to reach the router's own fallback is to disable that guard first —
-- proving the runtime guard behind it also fails closed. Both changes are
-- DDL/DML inside this transaction and are reverted by the closing rollback.
alter table public.undo_operations disable trigger undo_operations_registered_handler;
delete from private.undo_operation_handlers where action_type = 'correct_entry_interpretation';

select set_config('request.jwt.claim.sub', '7d000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.undo_operation('7d000002-0000-4000-8000-000000000002') $$,
  'P0001',
  'Unsupported undo operation',
  'the router fails closed when no handler is registered for a recorded operation'
);

select * from finish();
rollback;
