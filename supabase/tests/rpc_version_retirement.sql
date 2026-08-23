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

-- 24 through Phase 2F; Slice G5 adds two — the no-unplanned-v2 probe and the
-- generation count — for the third versioned family.
select plan(28);

-- Retained: every version a governing document says must stay callable -------
-- confirm_entry_task_candidates family — GATE-03,
-- docs/reports/phase-2c/PHASE_2C_TRACEABILITY_MATRIX.md.
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

-- Every mutation RPC keeps the security posture the policy requires ----------
--
-- This array is hardcoded, so it is the one assertion in this file that does not
-- discover its own subjects: a new definer mutation RPC is invisible to it until
-- its signature is added here. `public.apply_task_command` is therefore listed
-- alongside the inventoried versions even though it carries no `_vN` suffix and
-- adds no inventory row (ADR-037 §1 warrants a version only when a closed input
-- shape changes incompatibly, and Slice 2E.4 has no predecessor to supersede).
-- Policy point 7 is about the posture, not about the naming, so the posture is
-- what is checked.

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
      'public.confirm_entry_tasks(uuid, integer[])',
      'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)',
      -- Slice 2E.5. It mutates `public.task_command_confirmations`, which no
      -- client role may write, so it carries the identical posture obligation as
      -- the mutation RPC it authorizes and would otherwise be invisible to this
      -- hardcoded array for the same reason `apply_task_command` was.
      'public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)',
      -- Slice 2E.6 first-generation creation mutation and its server-issued
      -- confirmation sibling follow the same ADR-037/044 posture.
      'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)',
      'public.create_task_command(text, text[], jsonb, text, text, text, text)'
    ]) as signature
    join pg_proc procedure on procedure.oid = signature::regprocedure::oid
    where not procedure.prosecdef
      or not ('search_path=""' = any(coalesce(procedure.proconfig, array[]::text[])))
  ),
  0,
  'every mutation RPC, retained or retired or first-generation, is SECURITY DEFINER with an explicit safe search path'
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
select ok(
  to_regprocedure('public.apply_reminder_command_v2(uuid, jsonb, jsonb, text)') is null,
  'no unplanned reminder command version exists beyond v1'
);
select ok(
  to_regprocedure(
    'public.create_reminder_series_v2(jsonb, text, boolean, uuid, date, integer, integer, text)'
  ) is null,
  'no unplanned series creation version exists beyond v1'
);
select ok(
  to_regprocedure('public.apply_reminder_series_command_v2(uuid, jsonb, text)') is null,
  'no unplanned series command version exists beyond v1'
);

-- The inventory is complete: these are the only versioned mutation families --
--
-- Phase 2R slice 2R.1 (2026-08-23) made it five. `create_reminder_series_v1`
-- and `apply_reminder_series_command_v1` each record their own name as the
-- `action_type` on `public.undo_operations` and each has a row in
-- `private.undo_operation_handlers`, so both meet the same test the three below
-- meet: the version is the compensation namespace. The slice's third new
-- function, `public.reminder_series_preview`, is deliberately NOT versioned --
-- it is `stable`, writes nothing and names itself nowhere, so a suffix would
-- have claimed a namespace it does not use. It was drafted as
-- `reminder_series_preview_v1`; this assertion is what caught it, which is the
-- guard doing the job the paragraph below describes.
--
-- Slice G5 (2026-07-31) made it three. `apply_reminder_command_v1` is versioned
-- for the reason the other two are and `apply_task_command`/`create_task_command`
-- are not: it records its own name as the `action_type` on `public.undo_operations`,
-- so a future v2 would need its own registered handler while v1's rows stayed
-- compensable. ADR-053 rejected a versioned pair for the *creation* contract
-- because that would have left two write paths live; here the version is the
-- compensation namespace, not a second door.
--
-- This assertion failing on a new family is the guard working: a third
-- inventoried family has to be a reviewed edit here, never a silent arrival.

select is(
  (
    select count(*)::int
    from pg_proc procedure
    join pg_namespace space on space.oid = procedure.pronamespace
    where space.nspname = 'public'
      and procedure.proname ~ '_v[0-9]+$'
      and procedure.proname not like 'confirm_entry_task_candidates%'
      and procedure.proname not like 'resolve_pending_question%'
      and procedure.proname not like 'apply_reminder_command%'
      and procedure.proname not like 'create_reminder_series%'
      and procedure.proname not like 'apply_reminder_series_command%'
  ),
  0,
  'no versioned public function exists outside the five inventoried families'
);

select is(
  (
    select count(*)::int
    from pg_proc procedure
    join pg_namespace space on space.oid = procedure.pronamespace
    where space.nspname = 'public'
      and procedure.proname ~ '^apply_reminder_command(_v[0-9]+)?$'
  ),
  1,
  'the reminder command family has exactly the one inventoried generation'
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
