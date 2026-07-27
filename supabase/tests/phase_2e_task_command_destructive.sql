-- Phase 2E Slice 2E.5 - destructive actions and confirmation (PRD 13.6, 11.2,
-- 11.3, 12.3, 19.1 Epic 2E-E), migration 202607260059.
--
-- A separate file from `phase_2e_task_command_apply.sql` on purpose. That file
-- proves the mutation contract shared by every action; this one proves the two
-- things only the destructive verbs have - a server-issued single-use
-- confirmation, and two collisions that make leaving `cancelled` refusable. Its
-- fixtures reserve the `63xxxxxx` prefix, so nothing here can disturb a
-- `61xxxxxx`/`62xxxxxx` subject and no assertion in either file depends on the
-- other having run.
--
-- Four properties can only be proven here:
--
--   * **single use.** The gate is one guarded UPDATE, and its refusal branch is
--     unreachable in production by the design's own argument: a consumed
--     confirmation implies a committed reservation, so a resubmission returns
--     from the replay branch before the gate. That makes the branch exactly the
--     kind of guard Slice 2E.4 learned to distrust - so the suite constructs the
--     consumed state directly, as the superuser fixture role the client roles
--     cannot impersonate, and provokes it;
--   * **both orderings of the creation-undo collision.** Ordering A is a real
--     sequence - cancel, then `public.undo_operation` on the creation, then undo
--     the cancel - not a hand-placed `undone` row. Running the real handler is
--     what also exercises 2E-DESTRUCTIVE-007's third audit route, and the two
--     cannot share a subject: on an already-cancelled task the creation-undo's
--     `where status <> 'cancelled'` matches nothing and writes no audit row at
--     all, so the actor property needs a task that was never cancelled first;
--   * **the exhaustiveness argument behind the collision guard.** The guard is
--     scoped to a recorded `cancel_task` because no other field-undo can pass the
--     ten-column guard on a creation-undone task. That is a claim about the other
--     fourteen actions, and it is asserted rather than trusted;
--   * **the candidate-slot collision.** `202607220040:13-19` made candidate
--     identity unique only over non-cancelled rows, so cancelling frees the slot
--     and a re-confirmed duplicate makes the restore a bare `23505`. Nothing
--     outside a database can observe that.
--
-- Every negative assertion is paired with a positive control. A guard wired to
-- `true` refuses everything and passes every refusal test in this file; the
-- controls are what notice.
--
-- Written in pure ASCII, following `phase_2e_task_command_matching.sql`.

begin;
select plan(96);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Contract and security posture
-- ---------------------------------------------------------------------------
-- Read before any fixture exists, so a signature drift reports as itself.

select has_function(
  'public',
  'issue_task_command_confirmation',
  array['uuid', 'text', 'jsonb', 'jsonb', 'text', 'text', 'text'],
  'the issuance RPC exists with the same seven inputs the apply RPC takes'
);

-- The parity test in `database-types-parity.test.ts` greps this exact literal,
-- which is what makes Postgres the third signatory to a hand-written types file.
select is(
  (select proargnames from pg_proc where oid =
    'public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
  array['p_task_id', 'p_action', 'p_patch', 'p_pre_state', 'p_observed_before', 'p_policy_version', 'p_operation_key'],
  'and the catalog names them exactly as the apply RPC names them, so one payload builder can serve both'
);

select is(
  (select pronargdefaults from pg_proc where oid =
    'public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
  0::smallint,
  'with no defaults, so no half of the binding can be skipped by omission'
);

select is(
  (select prosecdef from pg_proc where oid =
    'public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
  true,
  'it is SECURITY DEFINER, because authenticated cannot write the confirmation ledger itself'
);

select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid =
    'public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
  'search_path=""',
  'and it pins an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure,
    'execute'
  ),
  'authenticated may ask for confirmation'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure,
    'execute'
  ),
  'anon may not (2E-OWNERSHIP-003)'
);

select has_table('public', 'task_command_confirmations', 'the confirmation ledger exists');

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.task_command_confirmations'::regclass),
  'with forced row level security, so the definer functions are not its only boundary'
);

-- "Server-issued" and "single-use" are properties of the grants before they are
-- properties of the two functions that respect them. A client that could INSERT
-- could mint its own confirmation; one that could UPDATE could un-consume one.
select is(
  (
    select coalesce(string_agg(client_role.name || ':' || write_privilege.name, ', '
                    order by client_role.name, write_privilege.name), '')
    from unnest(array['anon', 'authenticated', 'service_role']) as client_role(name)
    cross join unnest(array['insert', 'update', 'delete']) as write_privilege(name)
    where has_table_privilege(client_role.name, 'public.task_command_confirmations', write_privilege.name)
  ),
  '',
  'and no client role may insert, update or delete it - not even service_role'
);

select ok(
  has_table_privilege('authenticated', 'public.task_command_confirmations', 'select'),
  'authenticated may read its own confirmations, which RLS scopes to its own rows'
);

select ok(
  not has_table_privilege('anon', 'public.task_command_confirmations', 'select'),
  'anon may not read them at all'
);

-- ---------------------------------------------------------------------------
-- The closed error vocabulary, read out of the catalog
-- ---------------------------------------------------------------------------
-- 2E-UPDATE-017 in both directions. `phase_2e_task_command_apply.sql` asserts the
-- apply RPC's own token set; this asserts the two properties that are specific to
-- this slice: the retired token is gone from every body, and the shared collision
-- token is raised on both of its doors.

select is(
  (
    select count(*)::integer
    from (values
      ('public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'),
      ('private.undo_apply_task_command_fields(uuid, uuid)'),
      ('private.undo_apply_task_command_relation(uuid, uuid)'),
      ('public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)')
    ) as shipped(signature)
    where position('2E_ACTION_NOT_ENABLED' in pg_get_functiondef(shipped.signature::regprocedure)) > 0
  ),
  0,
  'no shipped body still names 2E_ACTION_NOT_ENABLED, so the retired token has no unreachable declaration'
);

select ok(
  position('detail = ''2E_CREATION_UNDONE''' in pg_get_functiondef(
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure)) > 0
  and position('detail = ''2E_CREATION_UNDONE''' in pg_get_functiondef(
    'private.undo_apply_task_command_fields(uuid, uuid)'::regprocedure)) > 0,
  'restore_task and the cancel-undo raise the SAME declared token, which is what 2E-DESTRUCTIVE-009 asks of every door'
);

select ok(
  position('detail = ''2E_CANDIDATE_REMATERIALIZED''' in pg_get_functiondef(
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure)) > 0
  and position('detail = ''2E_CANDIDATE_REMATERIALIZED''' in pg_get_functiondef(
    'private.undo_apply_task_command_fields(uuid, uuid)'::regprocedure)) > 0,
  'and so do the two doors of the candidate-slot collision'
);

-- The listing is the third door, and it excludes rather than raises. Read from
-- the catalog because the behavioural assertion further down cannot tell a
-- shared predicate from a fourth copy of one.
select ok(
  position('private.task_creation_undone' in pg_get_functiondef(
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure)) > 0,
  'the candidate listing reads the same creation-undone predicate the two raising doors read'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('63111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'destructive-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('63222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'destructive-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- An entry and an interpretation, so the candidate-slot fixtures can carry a
-- real `source_interpretation_id`. The two partial indexes of `202607220040` key
-- on it, and a hand-invented uuid would fail the composite owner FK.
insert into public.entries (id, user_id, original_content) values
  ('63000f01-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Entrada de origem');

-- `confidence` and `raw_output` carry no default and are NOT NULL
-- (`202607160003:76,82`), so both are supplied rather than relying on one.
--
-- **`task_candidates` must be long enough to contain the indexes the fixtures
-- claim.** `tasks_candidate_provenance` (`202607220041:260-272`) refuses an
-- active task whose `candidate_index` is not less than
-- `jsonb_array_length(task_candidates)`, with `2C_INVALID_CANDIDATE_PROVENANCE`.
-- A `cancelled` row is exempt (`:224-226`), which is why the two cancelled
-- candidate-slot fixtures below were accepted while the live duplicate was not -
-- and it is also why the exemption cannot be relied on here: the whole point of
-- that fixture is that `restore_task` takes it back out of `cancelled`, at which
-- point the trigger applies in full. Two elements cover indexes 0 and 1.
insert into public.entry_interpretations (
  id, user_id, entry_id, model, prompt_version, strategy_version, summary,
  confidence, raw_output, task_candidates
) values
  ('63000f02-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111',
   '63000f01-1111-4111-8111-111111111111', 'test-model', 'v1', 'v1', 'Resumo',
   0.900, '{}'::jsonb,
   '[{"title": "Candidato zero"}, {"title": "Candidato um"}]'::jsonb);

insert into public.tasks (
  id, user_id, title, description, status, manual_priority,
  due_at, planned_at, completed_at, cancelled_at, intentional_no_due, no_due_reason,
  source_entry_id, source_interpretation_id, candidate_index
) values
  -- The happy path: cancelled with confirmation, then undone.
  ('63000001-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Cancelar com confirmacao', null, 'todo', null, null, null, null, null, false, null, null, null, null),
  -- Dated, so `tasks_create_due_reminder` arms a reminder the cancellation must
  -- close and record, and the undo must put back.
  ('63000002-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Cancelar com lembrete', null, 'todo', null, now() + interval '5 days', null, null, null, false, null, null, null, null),
  -- Never mutated: every confirmation refusal targets it and each rolls back.
  ('63000003-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Tarefa sem confirmacao', null, 'todo', null, null, null, null, null, false, null, null, null, null),
  -- Ordering A of the creation-undo collision.
  ('63000004-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Colisao ordem A', null, 'todo', null, null, null, null, null, false, null, null, null, null),
  -- Its control: the same shape with no creation operation at all, so the undo
  -- must succeed. Without this a guard wired to `true` would pass ordering A.
  ('63000005-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Controle da ordem A', null, 'todo', null, null, null, null, null, false, null, null, null, null),
  -- Ordering B: creation-undone first, from `todo`, so the handler's UPDATE
  -- really cancels it and really writes the audit row 2E-DESTRUCTIVE-007 needs.
  ('63000006-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Colisao ordem B', null, 'todo', null, null, null, null, null, false, null, null, null, null),
  -- The candidate-slot collision: cancelled, holding candidate 0 of the
  -- interpretation above, with a live duplicate below.
  ('63000007-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Fatia tomada', null, 'cancelled', null, null, null, null, now() - interval '1 hour', false, null, '63000f01-1111-4111-8111-111111111111', '63000f02-1111-4111-8111-111111111111', 0),
  -- The duplicate that took the slot while the row above was cancelled.
  ('63000008-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Duplicata viva', null, 'todo', null, null, null, null, null, false, null, '63000f01-1111-4111-8111-111111111111', '63000f02-1111-4111-8111-111111111111', 0),
  -- The control for that refusal: cancelled, candidate 1, nothing occupying it,
  -- and dated so the restore must re-create the reminder 11.3 requires.
  -- `tasks_create_due_reminder` skips a row inserted as `cancelled`, so the
  -- reminder state here is exactly "none", which is what makes the restore's
  -- insert observable.
  ('63000009-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Fatia livre', null, 'cancelled', null, now() + interval '6 days', null, null, now() - interval '1 hour', false, null, '63000f01-1111-4111-8111-111111111111', '63000f02-1111-4111-8111-111111111111', 1),
  -- Listing subjects. One cancelled and reachable, one cancelled and deleted.
  ('6300000a-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Cancelada visivel', null, 'cancelled', null, null, null, null, now() - interval '2 hours', false, null, null, null, null),
  ('6300000b-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Cancelada apagada', null, 'cancelled', null, null, null, null, now() - interval '3 hours', false, null, null, null, null),
  -- The exhaustiveness subject: a rename is applied to it, then its creation is
  -- undone, then the rename-undo must be refused by the TEN-COLUMN guard rather
  -- than by the collision guard.
  ('6300000c-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Renome de tarefa apagada', null, 'todo', null, null, null, null, null, false, null, null, null, null),
  -- Creation-undone while still `todo`. Synthetic - a real creation-undo cancels
  -- what it compensates - and deliberately so: it is the only shape that can show
  -- the listing exclusion is the creation-undone predicate rather than the
  -- eligible-status filter doing the work. Against a cancelled subject the
  -- non-terminal assertion would pass vacuously.
  ('6300000d-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111', 'Apagada mas ativa', null, 'todo', null, null, null, null, null, false, null, null, null, null),
  -- The second owner's task, for the cross-owner confirmation assertions.
  ('63000021-2222-4222-8222-222222222222', '63222222-2222-4222-8222-222222222222', 'Tarefa do outro dono', null, 'todo', null, null, null, null, null, false, null, null, null, null);

-- Creation operations. `confirm_entry_tasks` is the unversioned member of the
-- family: `undo_confirm_entry_tasks` accepts it and, unlike `_v5`/`_v6`, it skips
-- the resolution-count gate that would otherwise demand an `after_state ->
-- 'resolutions'` array matching the deleted row count exactly. Inserted here as
-- the fixture role, because `authenticated` holds SELECT on this table and
-- nothing more.
insert into public.undo_operations (
  id, user_id, action_type, entity_type, entity_ids, after_state, status
) values
  ('63000101-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111',
   'confirm_entry_tasks', 'task', array['63000004-1111-4111-8111-111111111111'::uuid],
   jsonb_build_object('created_task_ids', array['63000004-1111-4111-8111-111111111111']), 'available'),
  ('63000102-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111',
   'confirm_entry_tasks', 'task', array['63000006-1111-4111-8111-111111111111'::uuid],
   jsonb_build_object('created_task_ids', array['63000006-1111-4111-8111-111111111111']), 'available'),
  ('63000103-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111',
   'confirm_entry_tasks', 'task', array['6300000b-1111-4111-8111-111111111111'::uuid],
   jsonb_build_object('created_task_ids', array['6300000b-1111-4111-8111-111111111111']), 'undone'),
  ('63000104-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111',
   'confirm_entry_tasks', 'task', array['6300000c-1111-4111-8111-111111111111'::uuid],
   jsonb_build_object('created_task_ids', array['6300000c-1111-4111-8111-111111111111']), 'available'),
  ('63000105-1111-4111-8111-111111111111', '63111111-1111-4111-8111-111111111111',
   'confirm_entry_tasks', 'task', array['6300000d-1111-4111-8111-111111111111'::uuid],
   jsonb_build_object('created_task_ids', array['6300000d-1111-4111-8111-111111111111']), 'undone');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Strict ISO-8601, which `to_char(..., 'OF')` is NOT.
--
-- `OF` renders a whole-hour offset as `+00` rather than `+00:00`, and
-- `apply_task_command`'s observed-before regex requires
-- `[Zz]|[+-][0-9]{2}:[0-9]{2}` - so every instant this helper produced was
-- refused with `Invalid observed-before instant` before any gate under test was
-- reached. The RPC uses the `OF` form when it *writes* an instant into
-- `before_state`/`applied_state`, where nothing re-parses it against that regex;
-- a caller sending one is a different matter. `phase_2e_task_command_apply.sql:371-376`
-- had this right and this file did not copy it.
--
-- Used for the pre-state instants too, which are cast rather than matched, so
-- one format serves both and the fingerprint stays byte-stable across the
-- issue/apply pair.
create function pg_temp.dest_iso(p_instant timestamptz)
returns text language sql immutable as $$
  select to_char(p_instant at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z';
$$;

-- Built from the live row rather than from literals, so a pre-state can never
-- drift from the task it claims to describe and every assertion below reaches the
-- gate it is aiming at instead of the staleness gate.
create function pg_temp.dest_row_state(p_task_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'dueAt', pg_temp.dest_iso(t.due_at),
    'plannedAt', pg_temp.dest_iso(t.planned_at),
    'manualPriority', t.manual_priority,
    'completedAt', pg_temp.dest_iso(t.completed_at),
    'cancelledAt', pg_temp.dest_iso(t.cancelled_at),
    'intentionalNoDue', t.intentional_no_due,
    'noDueReason', t.no_due_reason,
    'createdAt', pg_temp.dest_iso(t.created_at),
    'updatedAt', pg_temp.dest_iso(t.updated_at),
    'projectIds', '[]'::jsonb,
    'projectNames', '[]'::jsonb,
    'contextIds', '[]'::jsonb,
    'contextNames', '[]'::jsonb,
    'personIds', '[]'::jsonb,
    'personNames', '[]'::jsonb,
    'personRoles', '[]'::jsonb
  )
  from public.tasks t
  where t.id = p_task_id;
$$;

-- The pre-state a task had when this file FIRST touched it, remembered.
--
-- A replay has to send the identical seven values or its digest differs and the
-- RPC answers `2E_IDEMPOTENCY_MISMATCH` instead of replaying - and re-reading the
-- row after a successful apply returns a pre-state that has moved, because the
-- apply moved it. Every issue/apply/replay triple below therefore reads the
-- snapshot rather than the row. The table is superuser-owned and granted
-- explicitly by its resolved schema name, because `authenticated` may or may not
-- hold TEMP on the database and a CI-only failure is a four-minute round trip.
create table pg_temp.dest_snapshot (task_id uuid primary key, pre jsonb not null);

do $grant_snapshot$
begin
  execute format(
    'grant select, insert on table %I.dest_snapshot to authenticated',
    (select nspname from pg_namespace where oid = pg_my_temp_schema())
  );
end
$grant_snapshot$;

create function pg_temp.dest_snap(p_task_id uuid)
returns jsonb language plpgsql as $$
declare snapped jsonb;
begin
  select stored.pre into snapped from pg_temp.dest_snapshot stored where stored.task_id = p_task_id;
  if snapped is null then
    snapped := pg_temp.dest_row_state(p_task_id);
    -- Guarded: a task the current session cannot see yields NULL, and inserting
    -- that would abort the whole file with a NOT NULL violation instead of
    -- failing the one assertion that asked for it.
    if snapped is not null then
      insert into pg_temp.dest_snapshot (task_id, pre) values (p_task_id, snapped);
    end if;
  end if;
  return snapped;
end;
$$;

-- `accepted`, or `SQLSTATE:DETAIL`. The `exception` block opens a
-- subtransaction, so every refusal rolls back the reservation it had already
-- inserted and several refusals may share one operation key.
create function pg_temp.dest_apply(
  p_task_id uuid, p_action text, p_patch jsonb, p_pre_state jsonb,
  p_observed_before text, p_policy_version text, p_operation_key text
)
returns text language plpgsql as $$
declare failure_detail text;
begin
  perform public.apply_task_command(
    p_task_id, p_action, p_patch, p_pre_state, p_observed_before, p_policy_version, p_operation_key
  );
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

create function pg_temp.dest_issue(
  p_task_id uuid, p_action text, p_patch jsonb, p_pre_state jsonb,
  p_observed_before text, p_policy_version text, p_operation_key text
)
returns text language plpgsql as $$
declare failure_detail text;
begin
  perform public.issue_task_command_confirmation(
    p_task_id, p_action, p_patch, p_pre_state, p_observed_before, p_policy_version, p_operation_key
  );
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

create function pg_temp.dest_undo(p_undo_id uuid)
returns text language plpgsql as $$
declare failure_detail text;
begin
  perform public.undo_operation(p_undo_id);
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

-- The whole cancel gesture as one call, because every assertion that needs a
-- cancelled task needs the confirmation that authorized it, and repeating the
-- pair by hand is how one of them ends up subtly different from the others.
create function pg_temp.dest_cancel(p_task_id uuid, p_key text)
returns text language plpgsql as $$
declare
  pre jsonb := pg_temp.dest_snap(p_task_id);
  failure_detail text;
begin
  -- The issuance is wrapped too. Without this an issuance that raised would
  -- propagate out of a helper with no handler and abort the entire file, so one
  -- unexpected refusal would be reported as a plan mismatch rather than as the
  -- assertion that failed.
  begin
    perform public.issue_task_command_confirmation(
      p_task_id, 'cancel_task', jsonb_build_object('status', 'cancelled'), pre,
      pg_temp.dest_iso(now()), 'task-command-policy-v1', p_key
    );
  exception when others then
    get stacked diagnostics failure_detail = pg_exception_detail;
    return 'issue:' || sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
  end;
  return pg_temp.dest_apply(
    p_task_id, 'cancel_task', jsonb_build_object('status', 'cancelled'), pre,
    pg_temp.dest_iso(now()), 'task-command-policy-v1', p_key
  );
end;
$$;

/** The undo id the RPC recorded for a task, newest first. */
create function pg_temp.dest_undo_id(p_task_id uuid)
returns uuid language sql stable as $$
  select operation.id
  from public.undo_operations operation
  where operation.action_type = 'apply_task_command'
    and p_task_id = any(operation.entity_ids)
  order by operation.created_at desc, operation.id desc
  limit 1;
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"63111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 2E-DESTRUCTIVE-004: the database refuses an unconfirmed destructive action
-- ---------------------------------------------------------------------------

select is(
  pg_temp.dest_apply(
    '63000003-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000003-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-unconfirmed'
  ),
  'P0001:2E_CONFIRMATION_REQUIRED',
  'a perfectly formed cancel_task with no confirmation is refused by the database, not by a surface (2E-DESTRUCTIVE-004)'
);

-- 2E-DESTRUCTIVE-001. The refusal above is what makes "never one step" true at
-- the write layer: a one-step apply is precisely an apply with no preceding
-- confirmation call, and it cannot succeed at any score or margin.
select is(
  (select status from public.tasks where id = '63000003-1111-4111-8111-111111111111'),
  'todo',
  'and the task is untouched, so the refusal rolled back rather than half-applying'
);

select is(
  (select count(*)::integer from public.undo_operations
   where '63000003-1111-4111-8111-111111111111'::uuid = any(entity_ids)),
  0,
  'and no operation key was burned by it'
);

-- restore_task requires no confirmation: PRD 11.2 marks it non-destructive with
-- "Confirmation: no". Asserted as its own case because a gate keyed on the wrong
-- flag would refuse it and nothing else in this file would notice.
select is(
  pg_temp.dest_apply(
    '63000009-1111-4111-8111-111111111111',
    'restore_task',
    jsonb_build_object('status', 'todo'),
    pg_temp.dest_snap('63000009-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-restore-ok'
  ),
  'accepted',
  'restore_task needs no confirmation, because 11.2 marks it non-destructive'
);

select is(
  (select status from public.tasks where id = '63000009-1111-4111-8111-111111111111'),
  'todo',
  'and it lands the task back in todo'
);

select is(
  (select cancelled_at from public.tasks where id = '63000009-1111-4111-8111-111111111111'),
  null,
  'clearing cancelled_at, because 11.2 sets a terminal timestamp when and only when entering its status'
);

-- 11.3: "restore_task does the same: a task returning from cancelled with a
-- future due date gets a fresh reminder, otherwise the escape from cancellation
-- would silently hand back a task that can never remind." The INSERT-only trigger
-- cannot do this - it skipped the row, which was inserted cancelled.
select is(
  (select count(*)::integer from public.reminders
   where task_id = '63000009-1111-4111-8111-111111111111' and status = 'scheduled'),
  1,
  'and re-creates the reminder the INSERT-only trigger could not, because the due date is still in the future'
);

-- ---------------------------------------------------------------------------
-- 2E-DESTRUCTIVE-002: server-issued, single-use, bound to three things
-- ---------------------------------------------------------------------------

select is(
  pg_temp.dest_issue(
    '63000001-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-happy'
  ),
  'accepted',
  'the server issues confirmation for a well-formed destructive request'
);

-- The binding is DERIVED, never asserted by the caller: the stored digest must
-- equal what `public.task_command_fingerprint` produces from the same seven
-- values, with the owner taken from auth.uid(). If issuance ever accepted a
-- digest as an argument this is the assertion that would stop meaning anything.
select is(
  (select request_fingerprint from public.task_command_confirmations
   where operation_key = 'pgtap-2e5-happy'),
  public.task_command_fingerprint(
    '63111111-1111-4111-8111-111111111111',
    '63000001-1111-4111-8111-111111111111',
    pg_temp.dest_iso(now()),
    pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
    jsonb_build_object('status', 'cancelled'),
    'task-command-policy-v1',
    'pgtap-2e5-happy'
  ),
  'and binds it to the fingerprint the server derives from the same seven values, not to one the caller supplied'
);

select is(
  (select status from public.task_command_confirmations where operation_key = 'pgtap-2e5-happy'),
  'issued',
  'the fresh confirmation is unspent'
);

select is(
  (select consumed_at from public.task_command_confirmations where operation_key = 'pgtap-2e5-happy'),
  null,
  'and carries no consumption instant, which the table CHECK ties to the status'
);

-- The operation key is the lookup, so a confirmation issued under one key is no
-- evidence at all under another.
select is(
  pg_temp.dest_apply(
    '63000001-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-otherkey'
  ),
  'P0001:2E_CONFIRMATION_REQUIRED',
  'a confirmation issued under one operation key does not authorize an apply under another'
);

-- 2E-DESTRUCTIVE-003. The digest covers all seven values, so an edited proposal
-- cannot reuse the evidence the user gave for the old one.
--
-- **And it is refused at the confirmation gate, not at the staleness gate.** The
-- gate sits at step 14b, before the task is locked at step 16, so a payload whose
-- digest differs never reaches the twelve-column comparison. Reached here by
-- editing the pre-state, which changes the digest without changing the task.
select is(
  pg_temp.dest_apply(
    '63000001-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    jsonb_set(
      pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
      '{description}',
      '"uma descricao diferente"'::jsonb
    ),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-happy'
  ),
  'P0001:2E_CONFIRMATION_REQUIRED',
  'a changed proposal under the same key is refused: the confirmation is bound to the digest of the proposal that was confirmed (2E-DESTRUCTIVE-003)'
);

-- The same requirement reached through a value that touches no column of
-- `public.tasks` at all, so nothing but the digest can be doing the refusing. The
-- policy version is hashed and compared against nothing on the row.
select is(
  pg_temp.dest_apply(
    '63000001-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v2',
    'pgtap-2e5-happy'
  ),
  'P0001:2E_CONFIRMATION_REQUIRED',
  'and so is one that differs only in the policy version, which no column of the task could have refused'
);

select is(
  (select status from public.task_command_confirmations where operation_key = 'pgtap-2e5-happy'),
  'issued',
  'neither refusal spent the confirmation, because the whole call rolled back with the raise'
);

-- Re-issuance is idempotent on the key, and a DIFFERENT payload under that key is
-- a mismatch rather than a silent re-bind - which would let a client point an
-- outstanding confirmation at a proposal the user never saw.
select is(
  pg_temp.dest_issue(
    '63000001-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v2',
    'pgtap-2e5-happy'
  ),
  'P0001:2E_IDEMPOTENCY_MISMATCH',
  're-issuing the same key for a different payload is refused, never re-bound (2E-DESTRUCTIVE-003)'
);

select is(
  pg_temp.dest_issue(
    '63000001-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-happy'
  ),
  'accepted',
  'while re-issuing the identical request returns the same row rather than failing on the unique index'
);

select is(
  (select count(*)::integer from public.task_command_confirmations
   where operation_key = 'pgtap-2e5-happy'),
  1,
  'and mints no second row for it'
);

-- Issuance refuses an action that needs no confirmation, so a caller cannot leave
-- a row no apply will ever consume.
select is(
  pg_temp.dest_issue(
    '63000003-1111-4111-8111-111111111111',
    'restore_task',
    jsonb_build_object('status', 'todo'),
    pg_temp.dest_snap('63000003-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-notneeded'
  ),
  '22023:Task command action does not require confirmation',
  'confirmation is only issuable for an action PRD 11.2 marks as requiring it'
);

-- 2E-OWNERSHIP-002 on the issuance path: another owner's task and a nonexistent
-- one are the same answer, and neither reaches the composite FK.
select is(
  pg_temp.dest_issue(
    '63000021-2222-4222-8222-222222222222',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000003-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-crossowner'
  ),
  'P0002:Task not found',
  'confirmation cannot be issued against another owner''s task, and the refusal discloses nothing'
);

select is(
  (select count(*)::integer from public.task_command_confirmations
   where operation_key = 'pgtap-2e5-crossowner'),
  0,
  'and no row is left behind by the attempt'
);

-- ---------------------------------------------------------------------------
-- The forward cancellation, and single use
-- ---------------------------------------------------------------------------

select is(
  pg_temp.dest_apply(
    '63000001-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-happy'
  ),
  'accepted',
  'a cancel_task carrying valid confirmation applies'
);

select is(
  (select status from public.tasks where id = '63000001-1111-4111-8111-111111111111'),
  'cancelled',
  'the task is cancelled'
);

select isnt(
  (select cancelled_at from public.tasks where id = '63000001-1111-4111-8111-111111111111'),
  null,
  'and cancelled_at is written by the same shared status UPDATE the other status actions use'
);

select is(
  (select completed_at from public.tasks where id = '63000001-1111-4111-8111-111111111111'),
  null,
  'while completed_at stays null, because 11.2 clears a terminal timestamp on leaving its status'
);

select is(
  (select status from public.task_command_confirmations where operation_key = 'pgtap-2e5-happy'),
  'consumed',
  'the confirmation is spent by the applying transaction (2E-DESTRUCTIVE-002)'
);

select isnt(
  (select consumed_at from public.task_command_confirmations where operation_key = 'pgtap-2e5-happy'),
  null,
  'and records when, which the table CHECK ties to the status'
);

-- 2E-UPDATE-005 across the confirmation gate. The replay branch returns from the
-- stored after_state before the gate is reached, so a resubmission neither
-- refuses nor consumes anything a second time.
select is(
  pg_temp.dest_apply(
    '63000001-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-happy'
  ),
  'accepted',
  'an exact replay of a committed cancellation is accepted rather than refused for a spent confirmation'
);

select is(
  (select (public.apply_task_command(
     '63000001-1111-4111-8111-111111111111',
     'cancel_task',
     jsonb_build_object('status', 'cancelled'),
     pg_temp.dest_snap('63000001-1111-4111-8111-111111111111'),
     pg_temp.dest_iso(now()),
     'task-command-policy-v1',
     'pgtap-2e5-happy'
   ) ->> 'idempotent')::boolean),
  true,
  'and reports itself as replayed (2E-IDEMPOTENCY-004)'
);

select is(
  (select count(*)::integer from public.undo_operations
   where '63000001-1111-4111-8111-111111111111'::uuid = any(entity_ids)),
  1,
  'writing no second operation'
);

-- The applied operation carries the identity of the evidence that authorized it,
-- which is the half of 2E-DESTRUCTIVE-007 the audit actor cannot express.
select is(
  (select (operation.after_state ->> 'confirmation_id')::uuid
   from public.undo_operations operation
   where operation.id = pg_temp.dest_undo_id('63000001-1111-4111-8111-111111111111')),
  (select id from public.task_command_confirmations where operation_key = 'pgtap-2e5-happy'),
  'and the recorded operation names the confirmation it consumed'
);

select is(
  (select after_state ->> 'confirmation_id' from public.audit_logs
   where entity_id = '63000001-1111-4111-8111-111111111111'
     and action_type = 'task_command_applied'),
  (select id::text from public.task_command_confirmations where operation_key = 'pgtap-2e5-happy'),
  'which reaches the audit row through the same object'
);

select is(
  (select after_state ->> 'confirmation_id' from public.undo_operations
   where action_type = 'apply_task_command'
     and '63000009-1111-4111-8111-111111111111'::uuid = any(entity_ids)),
  null,
  'while an action the taxonomy does not gate records no confirmation, rather than an absent key'
);

-- Single use, provoked directly. In production a consumed confirmation implies a
-- committed reservation, so the replay branch returns before this gate - which
-- makes the branch unprovokable by any sequence a client can perform, and a guard
-- nothing can provoke is the defect this phase rejects twice elsewhere. The
-- fixture role can write the ledger no client role can.
reset role;
insert into public.task_command_confirmations (
  user_id, task_id, action, operation_key, request_fingerprint, status, consumed_at
) values (
  '63111111-1111-4111-8111-111111111111',
  '63000003-1111-4111-8111-111111111111',
  'cancel_task',
  'pgtap-2e5-spent',
  public.task_command_fingerprint(
    '63111111-1111-4111-8111-111111111111',
    '63000003-1111-4111-8111-111111111111',
    pg_temp.dest_iso(now()),
    pg_temp.dest_snap('63000003-1111-4111-8111-111111111111'),
    jsonb_build_object('status', 'cancelled'),
    'task-command-policy-v1',
    'pgtap-2e5-spent'
  ),
  'consumed',
  now() - interval '1 minute'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"63111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  pg_temp.dest_apply(
    '63000003-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    pg_temp.dest_snap('63000003-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-spent'
  ),
  'P0001:2E_CONFIRMATION_REQUIRED',
  'a confirmation whose fingerprint and owner both match is still refused once spent, which is what single use means'
);

select is(
  (select status from public.tasks where id = '63000003-1111-4111-8111-111111111111'),
  'todo',
  'and the task it named is untouched'
);

-- ---------------------------------------------------------------------------
-- The cancellation reminder effect, and the undo that puts it back
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.reminders
   where task_id = '63000002-1111-4111-8111-111111111111' and status = 'scheduled'),
  1,
  'the dated fixture starts with the reminder its insert trigger armed'
);

select is(
  pg_temp.dest_cancel('63000002-1111-4111-8111-111111111111', 'pgtap-2e5-reminder'),
  'accepted',
  'and a confirmed cancellation applies to it'
);

select is(
  (select count(*)::integer from public.reminders
   where task_id = '63000002-1111-4111-8111-111111111111' and status = 'scheduled'),
  0,
  'closing every scheduled reminder, because 11.3 makes entering cancelled cancel them'
);

select is(
  (select jsonb_array_length(operation.before_state -> 'reminders_cancelled')
   from public.undo_operations operation
   where operation.id = pg_temp.dest_undo_id('63000002-1111-4111-8111-111111111111')),
  1,
  'and recording the one it closed, which is what the undo re-creates from'
);

select is(
  pg_temp.dest_undo(pg_temp.dest_undo_id('63000002-1111-4111-8111-111111111111')),
  'accepted',
  'undoing the cancellation succeeds'
);

select is(
  (select status from public.tasks where id = '63000002-1111-4111-8111-111111111111'),
  'todo',
  'restoring the status the task held'
);

select is(
  (select cancelled_at from public.tasks where id = '63000002-1111-4111-8111-111111111111'),
  null,
  'clearing the cancelled_at the cancellation wrote'
);

select is(
  (select count(*)::integer from public.reminders
   where task_id = '63000002-1111-4111-8111-111111111111' and status = 'scheduled'),
  1,
  'and putting the reminder back by close-and-insert, which 11.3 makes the only safe mechanism'
);

-- ---------------------------------------------------------------------------
-- 2E-DESTRUCTIVE-007: three cancellation routes, three distinguishable actors
-- ---------------------------------------------------------------------------
-- Route one is the user's own cancel_task, route two is the undo of it, and route
-- three is `private.undo_confirm_entry_tasks` compensating a creation. The third
-- needs its own subject: on an already-cancelled task its UPDATE matches nothing
-- and writes no audit row at all, so it cannot share ordering A's fixture.

select is(
  (select actor from public.audit_logs
   where entity_id = '63000002-1111-4111-8111-111111111111'
     and action_type = 'task_updated'
     and before_state ->> 'status' = 'todo'
     and after_state ->> 'status' = 'cancelled'),
  'user',
  'a user cancellation is attributed to the user at the trigger row'
);

select is(
  (select actor from public.audit_logs
   where entity_id = '63000002-1111-4111-8111-111111111111'
     and action_type = 'task_updated'
     and before_state ->> 'status' = 'cancelled'
     and after_state ->> 'status' = 'todo'),
  'system',
  'and the undo that reversed it to the system, because the system executed the stored operation'
);

select is(
  (select actor from public.audit_logs
   where entity_id = '63000002-1111-4111-8111-111111111111'
     and action_type = 'operation_undone'),
  'user',
  'while the operation_undone row keeps the user, because that is who asked for it'
);

-- Route three. Ordering B's subject doubles as it: the creation-undo runs against
-- a `todo` task, so its UPDATE really fires and really co-fires the trigger.
select is(
  pg_temp.dest_undo('63000102-1111-4111-8111-111111111111'),
  'accepted',
  'undoing a creation compensates by cancelling the task it created'
);

select is(
  (select status from public.tasks where id = '63000006-1111-4111-8111-111111111111'),
  'cancelled',
  'which leaves the task cancelled'
);

select is(
  (select actor from public.audit_logs
   where entity_id = '63000006-1111-4111-8111-111111111111'
     and action_type = 'task_updated'
     and after_state ->> 'status' = 'cancelled'),
  'system',
  'and attributes that cancellation to the system too, so all three routes are separable (2E-DESTRUCTIVE-007)'
);

-- ---------------------------------------------------------------------------
-- 2E-DESTRUCTIVE-009: restore_task cannot resurrect a creation-undone task
-- ---------------------------------------------------------------------------
-- Ordering B, continued: the creation-undo above already ran, so this is the live
-- door in that ordering.

select is(
  pg_temp.dest_apply(
    '63000006-1111-4111-8111-111111111111',
    'restore_task',
    jsonb_build_object('status', 'todo'),
    pg_temp.dest_snap('63000006-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-orderb'
  ),
  '55P03:2E_CREATION_UNDONE',
  'restore_task refuses a task whose creation was undone (2E-DESTRUCTIVE-009)'
);

select is(
  (select status from public.tasks where id = '63000006-1111-4111-8111-111111111111'),
  'cancelled',
  'and leaves it cancelled'
);

-- The other half of ordering B: cancelling it again. The creation-undo left it
-- `cancelled`, so the canonical delta against the claimed pre-state is empty and
-- step 11 returns `no_change` **before** the reservation, the confirmation gate
-- and the eligibility check are ever reached. That is the correct answer and not
-- a gap: 2E-UPDATE-009 makes `no_change` terminal and write-free, so this door
-- cannot resurrect anything either. `2E_INELIGIBLE_STATUS` would only be reached
-- by a caller whose claimed pre-state disagreed with the row, and the staleness
-- gate refuses that first.
select is(
  pg_temp.dest_cancel('63000006-1111-4111-8111-111111111111', 'pgtap-2e5-orderb-cancel'),
  'accepted',
  'cancelling a creation-undone task again is a no_change, decided before any write'
);

select is(
  (select count(*)::integer from public.undo_operations
   where action_type = 'apply_task_command'
     and '63000006-1111-4111-8111-111111111111'::uuid = any(entity_ids)),
  0,
  'and it records no operation at all, which is what makes that outcome terminal rather than a write (2E-UPDATE-009)'
);

select is(
  (select status from public.task_command_confirmations
   where operation_key = 'pgtap-2e5-orderb-cancel'),
  'issued',
  'leaving its confirmation unspent, because no_change returns before the gate that would consume it'
);

-- ---------------------------------------------------------------------------
-- 2E-DESTRUCTIVE-008: ordering A, as a real sequence
-- ---------------------------------------------------------------------------

select is(
  pg_temp.dest_cancel('63000004-1111-4111-8111-111111111111', 'pgtap-2e5-ordera'),
  'accepted',
  'ordering A begins with a confirmed user cancellation'
);

select is(
  pg_temp.dest_undo('63000101-1111-4111-8111-111111111111'),
  'accepted',
  'then the creation operation is undone through the real router'
);

-- The reachability the guard exists for: the creation-undo changed NOTHING,
-- because its UPDATE carries `and status <> 'cancelled'`. So the ten scalars still
-- equal the applied_state the cancellation recorded and the ten-column guard would
-- pass - which is exactly why a second guard is needed.
select is(
  (select cancelled_at from public.tasks where id = '63000004-1111-4111-8111-111111111111'),
  (select (operation.after_state -> 'applied_state' ->> 'cancelled_at')::timestamptz
   from public.undo_operations operation
   where operation.id = pg_temp.dest_undo_id('63000004-1111-4111-8111-111111111111')),
  'and it changes nothing on an already-cancelled task, so the ten-column undo guard would still match'
);

select is(
  pg_temp.dest_undo(pg_temp.dest_undo_id('63000004-1111-4111-8111-111111111111')),
  '55P03:2E_CREATION_UNDONE',
  'so undoing the cancellation is refused with the same declared token (2E-DESTRUCTIVE-008, ordering A)'
);

select is(
  (select status from public.tasks where id = '63000004-1111-4111-8111-111111111111'),
  'cancelled',
  'and the deleted task stays deleted'
);

select is(
  (select status from public.undo_operations
   where id = pg_temp.dest_undo_id('63000004-1111-4111-8111-111111111111')),
  'available',
  'with its operation still available, because the whole undo rolled back rather than half-running'
);

-- The control. Without it a collision predicate wired to `true` would refuse every
-- undo in this file and pass every assertion above.
select is(
  pg_temp.dest_cancel('63000005-1111-4111-8111-111111111111', 'pgtap-2e5-control'),
  'accepted',
  'the control task takes the identical cancellation'
);

select is(
  pg_temp.dest_undo(pg_temp.dest_undo_id('63000005-1111-4111-8111-111111111111')),
  'accepted',
  'and its undo succeeds, because no creation operation of its own was ever undone'
);

select is(
  (select status from public.tasks where id = '63000005-1111-4111-8111-111111111111'),
  'todo',
  'restoring it to the status it held (2E-UNDO-001)'
);

-- ---------------------------------------------------------------------------
-- Why the guard is scoped to a recorded cancel_task, asserted rather than trusted
-- ---------------------------------------------------------------------------
-- The claim is that no OTHER field-undo can pass the ten-column guard on a
-- creation-undone task, because a creation-undo forces the row to `cancelled`
-- while every other action's applied_state.status is something else. A rename is
-- the sharpest case: it is the action whose undo the widened guard was introduced
-- for, and its status never moves.

select is(
  pg_temp.dest_apply(
    '6300000c-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Renomeada antes do apagamento'),
    pg_temp.dest_snap('6300000c-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-rename'
  ),
  'accepted',
  'a rename applies to a task whose creation is still available'
);

select is(
  pg_temp.dest_undo('63000104-1111-4111-8111-111111111111'),
  'accepted',
  'then its creation is undone, which cancels it'
);

select is(
  pg_temp.dest_undo(pg_temp.dest_undo_id('6300000c-1111-4111-8111-111111111111')),
  'P0001:2E_UNDO_RESTORE_INTEGRITY',
  'and the rename-undo is refused by the TEN-COLUMN guard, not by the collision guard - which is why that guard is scoped to cancel_task'
);

-- ---------------------------------------------------------------------------
-- The candidate-slot collision
-- ---------------------------------------------------------------------------
-- `202607220040:13-19` made candidate identity unique only over non-cancelled
-- rows, so a cancelled task releases its slot and a re-confirmed duplicate takes
-- it. Returning the original to an active status is then a bare 23505, which no
-- mapper case covers and which `apply.ts` would report as retryable forever.

select is(
  pg_temp.dest_apply(
    '63000007-1111-4111-8111-111111111111',
    'restore_task',
    jsonb_build_object('status', 'todo'),
    pg_temp.dest_snap('63000007-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-slot'
  ),
  '55P03:2E_CANDIDATE_REMATERIALIZED',
  'restore_task refuses a task whose candidate slot a live duplicate has taken, with a declared code rather than a raw 23505'
);

select is(
  (select status from public.tasks where id = '63000007-1111-4111-8111-111111111111'),
  'cancelled',
  'and leaves it cancelled'
);

-- The way out, which is what makes this a different refusal from a creation-undo:
-- cancel the duplicate and the restore succeeds. Nothing else in this file proves
-- the predicate reads the CURRENT occupancy rather than a permanent verdict.
select is(
  pg_temp.dest_cancel('63000008-1111-4111-8111-111111111111', 'pgtap-2e5-dup'),
  'accepted',
  'cancelling the duplicate releases the slot'
);

select is(
  pg_temp.dest_apply(
    '63000007-1111-4111-8111-111111111111',
    'restore_task',
    jsonb_build_object('status', 'todo'),
    pg_temp.dest_snap('63000007-1111-4111-8111-111111111111'),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-slot2'
  ),
  'accepted',
  'and the restore then succeeds, so the refusal was a condition and not a verdict'
);

select is(
  (select status from public.tasks where id = '63000007-1111-4111-8111-111111111111'),
  'todo',
  'putting the task back'
);

-- ---------------------------------------------------------------------------
-- 2E-DESTRUCTIVE-006: the recovery affordance, and its exclusion
-- ---------------------------------------------------------------------------
-- The affordance is `list_task_command_candidates` called with the cancelled
-- status and no hints, which is what Slice 2E.7 renders. What has to hold here is
-- that it reaches a cancelled task at all, and that it omits one whose creation
-- was undone.

select ok(
  exists (
    select 1 from public.list_task_command_candidates(array['cancelled'])
    where task_id = '6300000a-1111-4111-8111-111111111111'
  ),
  'a cancelled task is reachable through the candidate listing, so a confirmed cancellation is observable (2E-DESTRUCTIVE-006)'
);

select ok(
  not exists (
    select 1 from public.list_task_command_candidates(array['cancelled'])
    where task_id = '6300000b-1111-4111-8111-111111111111'
  ),
  'while one whose creation was undone is omitted, so the recovery surface cannot offer a deleted task (2E-DESTRUCTIVE-009)'
);

-- The exclusion is not scoped to the cancelled listing: a deleted task is not a
-- candidate for anything. Proven against a subject that is still `todo`, so the
-- eligible-status filter cannot be what is hiding it - against a cancelled
-- subject this assertion would pass without the predicate existing at all.
select ok(
  not exists (
    select 1 from public.list_task_command_candidates(
      array['inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred']
    )
    where task_id = '6300000d-1111-4111-8111-111111111111'
  ),
  'and it holds for every action, not only for restore_task'
);

-- The control for that one: an otherwise identical `todo` task with no undone
-- creation is returned by the same call. Without it, an eligible-status filter
-- that silently returned nothing would satisfy the assertion above.
select ok(
  exists (
    select 1 from public.list_task_command_candidates(
      array['inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred']
    )
    where task_id = '63000003-1111-4111-8111-111111111111'
  ),
  'while a todo task whose creation is intact still ranks, so the exclusion is the predicate and not the query'
);

-- The control: the predicate excludes creation-undone rows and nothing else.
select ok(
  exists (
    select 1 from public.list_task_command_candidates(array['cancelled'])
    where task_id = '63000001-1111-4111-8111-111111111111'
  ),
  'a task cancelled by the user, with its creation intact, stays listed'
);

-- 2E-OWNERSHIP-001: the listing is owner-scoped, and the exclusion did not widen
-- it. Asserted from the second owner's session, because a definer function's
-- WHERE clause is its entire tenant boundary.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"63222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_task_command_candidates(array['cancelled'])),
  0,
  'the second owner sees none of the first owner''s cancelled tasks'
);

-- Cross-owner confirmation: the second owner holds no confirmation for the first
-- owner's operation key, and the task is not theirs either.
select is(
  pg_temp.dest_apply(
    '63000003-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object(
      'title', 'Tarefa sem confirmacao', 'description', null, 'status', 'todo',
      'dueAt', null, 'plannedAt', null, 'manualPriority', null,
      'completedAt', null, 'cancelledAt', null, 'intentionalNoDue', false,
      'noDueReason', null, 'createdAt', pg_temp.dest_iso(now()), 'updatedAt', pg_temp.dest_iso(now()),
      'projectIds', '[]'::jsonb, 'projectNames', '[]'::jsonb,
      'contextIds', '[]'::jsonb, 'contextNames', '[]'::jsonb,
      'personIds', '[]'::jsonb, 'personNames', '[]'::jsonb, 'personRoles', '[]'::jsonb
    ),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-happy'
  ),
  'P0002:Task not found',
  'and cannot apply a cancellation to the first owner''s task even by reusing its operation key'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"63111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select status from public.task_command_confirmations where operation_key = 'pgtap-2e5-happy'),
  'consumed',
  'leaving the first owner''s confirmation exactly as it was'
);

-- ---------------------------------------------------------------------------
-- 42501, on both new doors
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;

select is(
  pg_temp.dest_issue(
    '63000003-1111-4111-8111-111111111111',
    'cancel_task',
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object(
      'title', 'x', 'description', null, 'status', 'todo',
      'dueAt', null, 'plannedAt', null, 'manualPriority', null,
      'completedAt', null, 'cancelledAt', null, 'intentionalNoDue', false,
      'noDueReason', null, 'createdAt', pg_temp.dest_iso(now()), 'updatedAt', pg_temp.dest_iso(now()),
      'projectIds', '[]'::jsonb, 'projectNames', '[]'::jsonb,
      'contextIds', '[]'::jsonb, 'contextNames', '[]'::jsonb,
      'personIds', '[]'::jsonb, 'personNames', '[]'::jsonb, 'personRoles', '[]'::jsonb
    ),
    pg_temp.dest_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e5-anon'
  ),
  '42501:Authentication required',
  'a caller with no identity cannot ask for confirmation'
);

reset role;

select * from finish();
rollback;
