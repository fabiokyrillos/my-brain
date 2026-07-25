-- Pre-Phase-2E hardening: the RPC version lifecycle as an executable contract
-- (migration 202607250054, ADR-037, docs/DATABASE.md retirement policy).
--
-- Before this, "all prior versions remain callable for rollback" was a claim in
-- a traceability matrix. Nothing checked it, and nothing checked that a retired
-- version stayed retired either. This file makes the inventory machine-checked:
-- every version is either ACTIVE/RETAINED (body present, executable by
-- authenticated, never by anon or public) or RETIRED (body present, executable
-- by no role at all).

begin;

select plan(24);

-- Retained: every version a governing document says must stay callable -------
-- confirm_entry_task_candidates family — GATE-03,
-- docs/reports/PHASE_2C_TRACEABILITY_MATRIX.md.
-- resolve_pending_question family — PHASE_2D_PRD.md §21 item 7 and ADR-034
-- decision 2 defer retirement to a separately authorized step.

select ok(
  has_function_privilege('authenticated', 'public.confirm_entry_task_candidates(uuid, uuid, integer[], text)'::regprocedure, 'execute'),
  'the Phase 2X.7 confirmation RPC remains callable for rollback'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text)'::regprocedure, 'execute'),
  'confirm v2 remains callable for rollback'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_entry_task_candidates_v3(uuid, uuid, integer[], jsonb, text)'::regprocedure, 'execute'),
  'confirm v3 remains callable for rollback'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_entry_task_candidates_v4(uuid, uuid, integer[], jsonb, text)'::regprocedure, 'execute'),
  'confirm v4 remains callable — it is a live application caller'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)'::regprocedure, 'execute'),
  'confirm v5 remains callable for rollback and undo evidence'
);
select ok(
  has_function_privilege('authenticated', 'public.confirm_entry_task_candidates_v6(uuid, uuid, jsonb, jsonb, text)'::regprocedure, 'execute'),
  'confirm v6 remains callable — it is the current application caller'
);
select ok(
  has_function_privilege('authenticated', 'public.resolve_pending_question_v1(uuid, jsonb, text)'::regprocedure, 'execute'),
  'resolve v1 remains callable — retirement is deferred by PRD 21.7'
);
select ok(
  has_function_privilege('authenticated', 'public.resolve_pending_question_v2(uuid, jsonb, text)'::regprocedure, 'execute'),
  'resolve v2 remains callable — retirement is deferred by PRD 21.7'
);
select ok(
  has_function_privilege('authenticated', 'public.resolve_pending_question_v3(uuid, jsonb, text)'::regprocedure, 'execute'),
  'resolve v3 remains callable — it is the current application caller'
);

-- No retained mutation version is reachable anonymously ----------------------

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.confirm_entry_task_candidates(uuid, uuid, integer[], text)',
      'public.confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v3(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v4(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)',
      'public.confirm_entry_task_candidates_v6(uuid, uuid, jsonb, jsonb, text)',
      'public.resolve_pending_question_v1(uuid, jsonb, text)',
      'public.resolve_pending_question_v2(uuid, jsonb, text)',
      'public.resolve_pending_question_v3(uuid, jsonb, text)'
    ]) as signature
    where has_function_privilege('anon', signature::regprocedure, 'execute')
  ),
  0,
  'no retained mutation version is executable anonymously'
);

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.confirm_entry_task_candidates(uuid, uuid, integer[], text)',
      'public.confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v3(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v4(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)',
      'public.confirm_entry_task_candidates_v6(uuid, uuid, jsonb, jsonb, text)',
      'public.resolve_pending_question_v1(uuid, jsonb, text)',
      'public.resolve_pending_question_v2(uuid, jsonb, text)',
      'public.resolve_pending_question_v3(uuid, jsonb, text)'
    ]) as signature
    where has_function_privilege('public', signature::regprocedure, 'execute')
  ),
  0,
  'no retained mutation version is executable by PUBLIC'
);

-- Every retained version keeps the security posture the policy requires ------

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.confirm_entry_task_candidates(uuid, uuid, integer[], text)',
      'public.confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v3(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v4(uuid, uuid, integer[], jsonb, text)',
      'public.confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)',
      'public.confirm_entry_task_candidates_v6(uuid, uuid, jsonb, jsonb, text)',
      'public.resolve_pending_question_v1(uuid, jsonb, text)',
      'public.resolve_pending_question_v2(uuid, jsonb, text)',
      'public.resolve_pending_question_v3(uuid, jsonb, text)',
      'public.confirm_entry_tasks(uuid, integer[])'
    ]) as signature
    join pg_proc procedure on procedure.oid = signature::regprocedure::oid
    where not procedure.prosecdef
      or not ('search_path=""' = any(coalesce(procedure.proconfig, array[]::text[])))
  ),
  0,
  'every version, retained or retired, is SECURITY DEFINER with an explicit safe search path'
);

-- Retired: confirm_entry_tasks (migration 202607250054) ----------------------

select has_function(
  'public',
  'confirm_entry_tasks',
  array['uuid', 'integer[]'],
  'the retired function keeps its body: undo rows still name its operation and the audit trail must stay readable'
);

select ok(
  not has_function_privilege('authenticated', 'public.confirm_entry_tasks(uuid, integer[])'::regprocedure, 'execute'),
  'the retired function is no longer an executable write path for authenticated users'
);

select ok(
  not has_function_privilege('anon', 'public.confirm_entry_tasks(uuid, integer[])'::regprocedure, 'execute'),
  'the retired function is not executable anonymously'
);

select ok(
  not has_function_privilege('public', 'public.confirm_entry_tasks(uuid, integer[])'::regprocedure, 'execute'),
  'the retired function is not executable by PUBLIC'
);

select ok(
  not has_function_privilege('service_role', 'public.confirm_entry_tasks(uuid, integer[])'::regprocedure, 'execute'),
  'the retired function was never a service-role path and still is not'
);

select ok(
  coalesce(obj_description('public.confirm_entry_tasks(uuid, integer[])'::regprocedure, 'pg_proc'), '') like '%RETIRED%',
  'the retired function documents its own retirement in the catalog'
);

-- Retiring a grant must not disturb undo routing -----------------------------
-- undo_operation dispatches on the recorded action_type, never by calling the
-- RPC that produced it, so the compensation path is grant-independent.

select is(
  (
    select handler_function
    from private.undo_operation_handlers
    where action_type = 'confirm_entry_tasks'
  ),
  'undo_confirm_entry_tasks',
  'operations recorded by the retired RPC remain undoable'
);

-- Superseded versions must not become the second source of truth ------------
-- Each family shares one canonical replay namespace prefix, so a retained
-- version can never collide with the current one.

select ok(
  to_regprocedure('public.confirm_entry_task_candidates_v7(uuid, uuid, jsonb, jsonb, text)') is null,
  'no unplanned confirmation version exists beyond v6'
);
select ok(
  to_regprocedure('public.resolve_pending_question_v4(uuid, jsonb, text)') is null,
  'no unplanned resolution version exists beyond v3'
);

-- The inventory is complete: these are the only versioned mutation families --

select is(
  (
    select count(*)::int
    from pg_proc procedure
    join pg_namespace space on space.oid = procedure.pronamespace
    where space.nspname = 'public'
      and procedure.proname ~ '_v[0-9]+$'
      and procedure.proname not like 'confirm_entry_task_candidates%'
      and procedure.proname not like 'resolve_pending_question%'
  ),
  0,
  'no versioned public function exists outside the two inventoried families'
);

select is(
  (
    select count(*)::int
    from pg_proc procedure
    join pg_namespace space on space.oid = procedure.pronamespace
    where space.nspname = 'public'
      and procedure.proname ~ '^confirm_entry_task_candidates(_v[0-9]+)?$'
  ),
  6,
  'the confirmation family has exactly the six inventoried generations'
);

select is(
  (
    select count(*)::int
    from pg_proc procedure
    join pg_namespace space on space.oid = procedure.pronamespace
    where space.nspname = 'public'
      and procedure.proname ~ '^resolve_pending_question(_v[0-9]+)?$'
  ),
  3,
  'the resolution family has exactly the three inventoried generations'
);

select * from finish();
rollback;
