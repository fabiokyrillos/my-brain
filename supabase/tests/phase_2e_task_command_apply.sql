-- Phase 2E Slice 2E.4 - the task-command mutation RPC, its two undo handlers and
-- the audit-trigger change they depend on (PRD 13.5, 11.2, 11.3), migration
-- 202607260058.
--
-- This is the first RPC in this repository that mutates an existing task, and
-- almost nothing it promises is observable from Vitest. The write order is the
-- correctness argument: the reservation lands before any task lock, the replay
-- branch returns before one is taken, `no_change` happens before the reservation,
-- and the audit row is the last write. A regression in that order leaves
-- TypeScript green and the ledger lying.
--
-- Four properties in particular can only be proven here:
--
--   * the closed error vocabulary. 2E-UPDATE-017 requires a database test to
--     provoke each declared code, and `throws_ok`'s third argument matches the
--     exception MESSAGE, never the DETAIL - so every token below is asserted
--     through the `SQLSTATE:DETAIL` helper of `ai_interpretation_bounds.sql:134-153`,
--     which returns 'accepted' on success so a guard that stopped refusing is a
--     failure rather than a silent pass. The vocabulary is *also* read out of the
--     catalog, so a token this file never exercises cannot be added unnoticed;
--   * the typed twelve-column staleness gate. There is no multi-column
--     expected-pre-state comparison anywhere else in this repository, so each
--     column is varied alone: an `or` branch dropped from that chain is invisible
--     to every other test and silently applies a command to a task the user never
--     saw;
--   * reminder reconciliation. `create_due_task_reminder` fires only
--     `after insert on public.tasks` (`202607160007:195-209`), so every Phase 2E
--     due-date command has to create its own reminder, and `reminders` has no
--     unique constraint on `task_id` - a close half that cancelled one row would
--     leave orphans that still fire;
--   * the transaction-local audit actor. `app.audit_actor` is read with
--     `missing_ok => true` precisely so an UPDATE that never went through the RPC
--     keeps working, and the only way to prove that is a plain client-side UPDATE
--     under `authenticated` with the setting unset. That is why the trigger block
--     runs FIRST: `set_config(..., is_local => true)` survives to the end of the
--     transaction, so the moment the RPC runs once, no later statement in this
--     file can observe the unset default again.
--
-- Written in pure ASCII, following the doctrine of
-- `phase_2e_task_command_matching.sql`. Nothing here needs a non-ASCII value -
-- the Portuguese fixture strings are deliberately spelled without diacritics -
-- and an editor re-encoding one would change what is being asserted.

begin;
select plan(132);

-- `to_char(..., 'OF')` and the reminder round-trip below both render through the
-- session TimeZone, which `set search_path = ''` does not pin. Fixing it makes
-- the recorded instants byte-stable, and `set local` is transaction-scoped so the
-- rollback restores nothing that needed restoring.
set local timezone to 'UTC';

-- Contract and security posture of the RPC ------------------------------------
--
-- Read before any fixture exists, so a signature drift is reported as itself
-- rather than as a cascade of behavioural failures.

select has_function(
  'public',
  'apply_task_command',
  array['uuid', 'text', 'jsonb', 'jsonb', 'text', 'text', 'text'],
  'the mutation RPC exists with the seven inputs the contract declares'
);

-- SECURITY DEFINER is not optional here: `authenticated` has SELECT only on
-- `public.undo_operations` (`202607170016:198-201`) and RLS is forced, so
-- recording an operation is impossible any other way. The consequence is that
-- inside this function the `auth.uid()` predicate is the entire ownership wall,
-- which is why the cross-owner case below is asserted as an error rather than as
-- an empty result.
select is(
  (select prosecdef from pg_proc where oid =
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
  true,
  'the mutation RPC is SECURITY DEFINER, because authenticated cannot write the undo ledger itself'
);

-- Compared as text for the reason `phase_2e_task_command_ai_usage.sql` records:
-- `proconfig` is text[] and Postgres stores the empty value quoted.
select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid =
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
  'search_path=""',
  'and it pins an empty search_path, so every function it calls is schema-qualified'
);

-- 2E-OPERATIONS-002, the third party -----------------------------------------
--
-- `src/lib/supabase/database.types.ts` is hand-maintained (ADR-041), so without
-- this the migration and the types file would only agree with *each other*
-- about a schema neither has seen. `database-types-parity.test.ts` derives the
-- argument names from the migration text and asserts this exact `array[...]`
-- literal appears in this file; this assertion makes Postgres itself the third
-- signatory. `list_task_command_candidates` is pinned the same way at
-- `phase_2e_task_command_matching.sql:78-83`.
--
-- Unlike that function, `proargnames` here is the seven inputs and nothing
-- more: `apply_task_command` returns a scalar jsonb, so there are no RETURNS
-- TABLE column names appended.
select is(
  (select proargnames from pg_proc where oid =
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
  array['p_task_id', 'p_action', 'p_patch', 'p_pre_state', 'p_observed_before', 'p_policy_version', 'p_operation_key'],
  'the catalog signature is the one the migration declares and the generated types describe'
);

-- Every argument is load-bearing, so none may acquire a default: a defaulted
-- `p_pre_state` would make the twelve-column staleness gate satisfiable by
-- omission (2E-UPDATE-003), and a defaulted `p_operation_key` would make the
-- idempotency reservation optional (2E-IDEMPOTENCY-001).
-- `confirm_entry_task_candidates_v6` defaults nothing either
-- (`202607220044:97-108`).
select is(
  (select pronargdefaults from pg_proc where oid =
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
  0::smallint,
  'and not one of the seven carries a default, so no gate can be skipped by omission'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure,
    'execute'
  ),
  'authenticated may apply its own task command'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure,
    'execute'
  ),
  'anon may not (2E-OWNERSHIP-003)'
);

select ok(
  not has_function_privilege(
    'public',
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure,
    'execute'
  ),
  'and neither may PUBLIC, so the revoke is real rather than shadowed by a default grant'
);

-- The closed error vocabulary, read out of the catalog ------------------------
--
-- 2E-UPDATE-017 makes the declared list a contract in both directions: every
-- token must be provokable (each one is, below) and nothing outside the list may
-- be raised. Exercising paths proves the first half only - a token added on a
-- branch no test reaches would ship silently, and the TypeScript mapper would
-- degrade it to the generic retryable branch.
--
-- Asserted as the exact sorted set rather than as "count of unexpected tokens is
-- zero": that form is also satisfied by a body that raises nothing at all, which
-- is precisely the regression worth catching.

select is(
  (
    select array_agg(distinct found.token[1] order by found.token[1])
    from regexp_matches(
      pg_get_functiondef(
        'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure
      ),
      'detail = ''([A-Z0-9_]+)''',
      'g'
    ) as found(token)
  ),
  array[
    '2E_ACTION_NOT_ENABLED',
    '2E_DUE_CONSISTENCY',
    '2E_IDEMPOTENCY_MISMATCH',
    '2E_INELIGIBLE_STATUS',
    '2E_INVALID_RELATION',
    '2E_REMINDER_INTEGRITY',
    '2E_TRANSITION_INTEGRITY'
  ],
  'the RPC raises exactly the seven apply-path DETAIL tokens the contract declares, and no others'
);

-- The SQLSTATE half of the same contract. This is also the structural guard
-- against the gateway-hanging code ADR-026 retired: it is not in this list, so a
-- body that reintroduced it would fail here as well as in the migration's own
-- post-deploy block.
select is(
  (
    select array_agg(distinct found.code[1] order by found.code[1])
    from regexp_matches(
      pg_get_functiondef(
        'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure
      ),
      'errcode = ''([0-9A-Z]+)''',
      'g'
    ) as found(code)
  ),
  array['22023', '42501', '55P03', 'P0001', 'P0002'],
  'and exactly the five SQLSTATEs, so the mapper in src/features/agent/actions.ts has a case for every one'
);

select is(
  (
    select array_agg(distinct found.token[1] order by found.token[1])
    from regexp_matches(
      pg_get_functiondef('private.undo_apply_task_command_fields(uuid, uuid)'::regprocedure)
        || pg_get_functiondef('private.undo_apply_task_command_relation(uuid, uuid)'::regprocedure),
      'detail = ''([A-Z0-9_]+)''',
      'g'
    ) as found(token)
  ),
  array['2E_UNDO_REMINDER_INTEGRITY', '2E_UNDO_RESTORE_INTEGRITY'],
  'and the two handlers raise exactly the two undo-path tokens, so compensation failures are distinguishable from apply failures'
);

-- Fixtures --------------------------------------------------------------------
--
-- One task per action, because an applied command is not undone until its own
-- section and a shared subject would make the pre-state of the next assertion
-- depend on the previous one. `6xxxxxxx` is this slice's reserved prefix.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('61111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'apply-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('62222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'apply-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.projects (id, user_id, name) values
  ('61000091-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Acme'),
  -- Owned only by the second user. A patch naming it must be refused before the
  -- reservation, so a cross-owner payload cannot burn an operation key.
  ('62000091-2222-4222-8222-222222222222', '62222222-2222-4222-8222-222222222222', 'Initech');

insert into public.contexts (id, user_id, name) values
  ('61000092-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Casa');

insert into public.people (id, user_id, name) values
  ('61000093-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Bruno Silva');

-- Tasks carrying a `due_at` and a non-terminal status get a scheduled reminder
-- from `tasks_create_due_reminder` at insert time; every reminder count below
-- accounts for it, and the two tasks whose reminder must pre-exist rely on it
-- rather than on a hand-written row.
insert into public.tasks (
  id, user_id, title, description, status, manual_priority,
  due_at, planned_at, completed_at, cancelled_at, intentional_no_due, no_due_reason
) values
  ('61000001-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Concluir relatorio', null, 'todo', null, null, null, null, null, false, null),
  ('61000002-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa finalizada', null, 'completed', null, now() + interval '5 days', null, now() - interval '1 day', null, false, null),
  ('61000003-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Mudar status', null, 'todo', null, null, null, null, null, false, null),
  ('61000004-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Renomear tarefa', null, 'todo', null, null, null, null, null, false, null),
  ('61000005-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Anotar tarefa', 'Nota original', 'todo', null, null, null, null, null, false, null),
  ('61000006-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Reagendar tarefa', null, 'todo', null, now() + interval '5 days', null, null, null, false, null),
  ('61000007-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Limpar prazo', null, 'todo', null, now() + interval '5 days', null, null, null, false, null),
  ('61000008-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Planejar tarefa', null, 'todo', null, null, null, null, null, false, null),
  ('61000009-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Priorizar tarefa', null, 'todo', null, null, null, null, null, false, null),
  ('6100000a-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Vincular projeto', null, 'todo', null, null, null, null, null, false, null),
  ('6100000b-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Vincular contexto', null, 'todo', null, null, null, null, null, false, null),
  ('6100000c-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Vincular pessoa', null, 'todo', null, null, null, null, null, false, null),
  ('6100000d-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Aguardar pessoa', null, 'todo', null, null, null, null, null, false, null),
  -- Cancelled, so a non-destructive action has a genuinely ineligible locked
  -- status to be refused against.
  ('6100000e-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa cancelada', null, 'cancelled', null, null, null, null, now() - interval '1 day', false, null),
  -- Intentionally undated, which is the only state in which 2E-UPDATE-012's
  -- consistency rule has anything to say.
  ('6100000f-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa sem prazo', null, 'todo', null, null, null, null, null, true, 'Sem data definida'),
  ('61000011-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa inalterada', null, 'todo', 'high', null, null, null, null, false, null),
  -- Every column the staleness gate compares is set to something a variation can
  -- differ from. `cancelled_at` and `no_due_reason` are left null on purpose: a
  -- null-to-value variation is the direction a gate written with `<>` instead of
  -- `is distinct from` would miss.
  ('61000012-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa de comparacao', 'Descricao original', 'todo', 'medium', now() + interval '4 days', now() + interval '2 days', now() - interval '3 days', null, false, null),
  ('61000013-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa de replay', null, 'todo', null, null, null, null, null, false, null),
  ('61000014-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa com lembrete travado', null, 'todo', null, now() + interval '5 days', null, null, null, false, null),
  ('61000015-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa deslocada', null, 'todo', null, null, null, null, null, false, null),
  ('61000016-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa com lembrete corrompido', null, 'todo', null, now() + interval '5 days', null, null, null, false, null),
  ('61000017-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Prazo iminente', null, 'todo', null, null, null, null, null, false, null),
  -- Never mutated: every pure-validation refusal targets it, and each of those
  -- rolls back, so its pre-state stays the one the literal constructor describes.
  ('61000018-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa de validacao', null, 'todo', null, null, null, null, null, false, null),
  ('61000021-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa cliente status', null, 'todo', null, null, null, null, null, false, null),
  ('61000022-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa cliente titulo', null, 'todo', null, null, null, null, null, false, null),
  ('61000023-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa cliente nota', 'Nota antiga', 'todo', null, null, null, null, null, false, null),
  -- Two commands land on this one and the OLDER is then undone. It starts with no
  -- due date on purpose: the second command sets one, which is the column the
  -- widened undo guard refuses on while the status - the only column the guard
  -- used to read - never moves.
  ('61000024-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa de dois comandos', null, 'todo', null, null, null, null, null, false, null),
  -- The control for that refusal: one command, no interference, and its undo must
  -- succeed. Widening the guard to something unsatisfiable would pass every undo
  -- refusal in this file and break every real undo, and this is the only assertion
  -- that notices.
  ('61000025-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa de renome desfeito', null, 'todo', null, null, null, null, null, false, null),
  -- Dated, so `tasks_create_due_reminder` arms a reminder the completion below
  -- closes and records; an ordinary client INSERT then adds a live one before the
  -- undo, which is the state the undo's reminder post-condition refuses.
  ('61000026-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa com lembrete intruso', null, 'todo', null, now() + interval '5 days', null, null, null, false, null),
  -- Its stored operation has its `before_state` emptied afterwards, which is the
  -- shape the undo handler's evidence gate is documented to refuse.
  ('61000027-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa sem evidencia', null, 'todo', null, null, null, null, null, false, null),
  -- 1995 characters of existing notes, so one more legal note pushes the canonical
  -- `description` past 2000. Built with `repeat` rather than written out, so the
  -- number under test is legible.
  ('61000028-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa de nota longa', repeat('x', 1995), 'todo', null, null, null, null, null, false, null),
  -- Dated, so it holds a live reminder while a NON-reminder action runs against
  -- it. Nothing else in this file pairs those two, which is what left
  -- `action_touches_reminders` unfalsifiable.
  ('61000029-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa priorizada com lembrete', null, 'todo', null, now() + interval '5 days', null, null, null, false, null),
  -- Dated and completed below, which is the only state in which the reminder
  -- insert half's terminal-status guard is load-bearing: the completion that
  -- already exists above has no due date, so that guard is never reached there.
  ('6100002a-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa concluida com prazo', null, 'todo', null, now() + interval '5 days', null, null, null, false, null),
  -- Carries the one assertion that pins the return's whole key set, which no
  -- assertion that strips a key can do.
  ('6100002b-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'Tarefa de chaves do retorno', null, 'todo', null, null, null, null, null, false, null),
  ('62000001-2222-4222-8222-222222222222', '62222222-2222-4222-8222-222222222222', 'Tarefa do outro dono', null, 'todo', null, null, null, null, null, false, null);

-- The person is already linked under a role the command below does not write.
-- 2E-UPDATE-015's "removes only the row it added" is unfalsifiable without a row
-- the operation did not add.
insert into public.task_people (task_id, person_id, user_id, role) values
  ('6100000d-1111-4111-8111-111111111111', '61000093-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 'involved');

-- Two scheduled rows, because there is no unique constraint on `reminders.task_id`
-- and a close half that cancelled one would leave the other firing. The `sent`
-- and `snoozed` rows are the control: neither is `scheduled`, so neither may be
-- touched, and ADR-018 says a sent reminder is history undo does not rewrite.
insert into public.reminders (id, user_id, task_id, title, remind_at, important, status, snoozed_until) values
  ('61000041-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', '61000001-1111-4111-8111-111111111111', 'Lembrete um', now() + interval '2 hours', false, 'scheduled', null),
  ('61000042-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', '61000001-1111-4111-8111-111111111111', 'Lembrete dois', now() + interval '5 hours', true, 'scheduled', null),
  ('61000043-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', '61000001-1111-4111-8111-111111111111', 'Lembrete enviado', now() - interval '1 hour', false, 'sent', null),
  ('61000044-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', '61000001-1111-4111-8111-111111111111', 'Lembrete adiado', now() + interval '1 hour', false, 'snoozed', now() + interval '3 hours'),
  -- Slice 2E.3 verified that a task written before Phase 2E may already hold a
  -- live scheduled row. This is that row, on the task `reopen_task` will touch.
  ('61000045-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', '61000002-1111-4111-8111-111111111111', 'Lembrete do reaberto', now() + interval '6 hours', false, 'scheduled', null),
  -- A second live row on the task a NON-reminder action runs against. Its subject
  -- already holds the one the insert trigger armed for its due date, whose id is
  -- `gen_random_uuid()` and therefore unnameable; this one carries a literal id so
  -- the assertion can say "that exact row is still scheduled" rather than only
  -- counting rows. Both must survive `set_priority` untouched.
  ('61000049-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', '61000029-1111-4111-8111-111111111111', 'Lembrete preservado', now() + interval '7 hours', false, 'scheduled', null);

-- Helpers ---------------------------------------------------------------------
--
-- Created before the first role switch, as the privileged fixture role, and
-- callable afterwards through the default PUBLIC execute grant. They die with the
-- session.

-- The `Z`-suffixed rendering the RPC's ISO-instant regex accepts. `to_char(...,
-- 'OF')` renders a whole-hour offset as `-03` rather than `-03:00`, which the
-- regex refuses - so a patch instant or an observed-before built that way would
-- be reported as malformed input rather than as the thing under test.
create function pg_temp.taskcmd_iso(p_instant timestamptz)
returns text
language sql
as $$
  select to_char(p_instant at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z';
$$;

-- The nineteen `TaskPreState` keys, read from the row the way the preview would
-- have observed them. Instants are rendered with an explicit format rather than
-- `to_jsonb(timestamptz)` for the reason `202607250057:34-39` records.
create function pg_temp.taskcmd_pre_state(p_task_id uuid)
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
    'projectIds', coalesce((
      select jsonb_agg(link.project_id order by link.project_id)
      from public.task_projects link
      where link.task_id = task.id and link.user_id = task.user_id
    ), '[]'::jsonb),
    'projectNames', coalesce((
      select jsonb_agg(owned.name order by link.project_id)
      from public.task_projects link
      join public.projects owned
        on owned.id = link.project_id and owned.user_id = link.user_id
      where link.task_id = task.id and link.user_id = task.user_id
    ), '[]'::jsonb),
    'contextIds', coalesce((
      select jsonb_agg(link.context_id order by link.context_id)
      from public.task_contexts link
      where link.task_id = task.id and link.user_id = task.user_id
    ), '[]'::jsonb),
    'contextNames', coalesce((
      select jsonb_agg(owned.name order by link.context_id)
      from public.task_contexts link
      join public.contexts owned
        on owned.id = link.context_id and owned.user_id = link.user_id
      where link.task_id = task.id and link.user_id = task.user_id
    ), '[]'::jsonb),
    -- `personIds` and `personRoles` are parallel arrays, so both aggregations
    -- must order by the same key or "already held under this role" becomes a
    -- positional lie.
    'personIds', coalesce((
      select jsonb_agg(link.person_id order by link.role, link.person_id)
      from public.task_people link
      where link.task_id = task.id and link.user_id = task.user_id
    ), '[]'::jsonb),
    'personNames', coalesce((
      select jsonb_agg(owned.name order by link.role, link.person_id)
      from public.task_people link
      join public.people owned
        on owned.id = link.person_id and owned.user_id = link.user_id
      where link.task_id = task.id and link.user_id = task.user_id
    ), '[]'::jsonb),
    'personRoles', coalesce((
      select jsonb_agg(link.role order by link.role, link.person_id)
      from public.task_people link
      where link.task_id = task.id and link.user_id = task.user_id
    ), '[]'::jsonb)
  )
  from public.tasks task
  where task.id = p_task_id;
$$;

-- A well-formed pre-state built from nothing at all, for the two cases the
-- reader above cannot serve: a task the caller does not own (RLS hides it, and
-- the assertion is about `P0002`, not about a null argument), and a claim that
-- has to stay reproducible after the row it describes has been mutated. `now()`
-- is the transaction timestamp, so a task inserted with the column defaults has
-- exactly these two instants.
create function pg_temp.taskcmd_new_pre_state(p_title text, p_status text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'title', p_title,
    'description', null,
    'status', p_status,
    'dueAt', null,
    'plannedAt', null,
    'manualPriority', null,
    'completedAt', null,
    'cancelledAt', null,
    'intentionalNoDue', false,
    'noDueReason', null,
    'createdAt', pg_temp.taskcmd_iso(now()),
    'updatedAt', pg_temp.taskcmd_iso(now()),
    'projectIds', '[]'::jsonb,
    'projectNames', '[]'::jsonb,
    'contextIds', '[]'::jsonb,
    'contextNames', '[]'::jsonb,
    'personIds', '[]'::jsonb,
    'personNames', '[]'::jsonb,
    'personRoles', '[]'::jsonb
  );
$$;

-- Returns 'accepted', or `SQLSTATE:DETAIL`, so each assertion names the exact
-- guard that refused the payload rather than just "it failed" - and so a guard
-- that stopped refusing fails loudly instead of passing. Falling back to `sqlerrm`
-- when there is no DETAIL is what makes the bare-SQLSTATE cases assertable in the
-- same form: `55P03:Task changed since the preview` is itself the proof that the
-- stale raise carries no detail, which the mapper in
-- `src/features/agent/actions.ts` depends on.
--
-- The `exception` block opens a subtransaction, so every refusal below rolls back
-- the reservation it had already inserted. That is why several refusals can reuse
-- one operation key without colliding.
create function pg_temp.taskcmd_apply(
  p_task_id uuid,
  p_action text,
  p_patch jsonb,
  p_pre_state jsonb,
  p_observed_before text,
  p_policy_version text,
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
    p_observed_before, p_policy_version, p_operation_key
  );
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

-- The raw DETAIL, with no fallback. `pg_exception_detail` yields the empty string
-- when a raise carried none, which is the only direct way to assert the absence
-- the 55P03 contract requires.
create function pg_temp.taskcmd_detail(
  p_task_id uuid,
  p_action text,
  p_patch jsonb,
  p_pre_state jsonb,
  p_observed_before text,
  p_policy_version text,
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
    p_observed_before, p_policy_version, p_operation_key
  );
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return failure_detail;
end;
$$;

create function pg_temp.taskcmd_undo(p_undo_id uuid)
returns text
language plpgsql
as $$
declare
  failure_detail text;
begin
  perform public.undo_operation(p_undo_id);
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

-- 2E-UPDATE-010: the shared audit trigger, before any RPC call ----------------
--
-- The ordering is load-bearing and cannot be relaxed. `apply_task_command` sets
-- `app.audit_actor` with `is_local => true`, which lasts to the end of the
-- transaction - so once any command has run, no later statement in this file can
-- observe the unset default, and the property PRD 21 actually requires (the
-- pre-existing `persistTaskStatus` path stays byte-identical) becomes unprovable.
--
-- The first assertion is the one that would have caught the worst available
-- mistake: reading the setting without `missing_ok` raises `42704` on every task
-- UPDATE in the product, and `create or replace function` deploys that happily
-- because plpgsql parse-analyses an expression at first execution.

select lives_ok(
  $$ update public.tasks set status = 'in_progress'
     where id = '61000021-1111-4111-8111-111111111111' $$,
  'a plain client-side task UPDATE still works with app.audit_actor unset, rather than raising 42704'
);

select is(
  (
    select actor from public.audit_logs
    where entity_id = '61000021-1111-4111-8111-111111111111'
      and action_type = 'task_updated'
  ),
  'user',
  'and it still records actor=user, so persistTaskStatus behaviour is byte-identical'
);

-- Title and description were unwatched: `202607250056:578-590` recorded that a
-- rename or an appended note left no historical row at all. These two are the
-- blind spot 2E-UPDATE-010 closes, and neither is observable from any other test.
update public.tasks set title = 'Titulo alterado pelo cliente'
where id = '61000022-1111-4111-8111-111111111111';

select is(
  (
    select count(*)::integer from public.audit_logs
    where entity_id = '61000022-1111-4111-8111-111111111111'
      and action_type = 'task_updated'
  ),
  1,
  'a title-only UPDATE now leaves a task_updated row where it previously left none'
);

-- The whole payload, not one key: adding `title` and `description` changes the
-- shape of every future `task_updated` row, and the existing object writes
-- `manual_priority` under the key `priority`, so the seven keys are worth pinning
-- exactly once.
select is(
  (
    select after_state from public.audit_logs
    where entity_id = '61000022-1111-4111-8111-111111111111'
      and action_type = 'task_updated'
  ),
  jsonb_build_object(
    'status', 'todo',
    'due_at', null,
    'priority', null,
    'planned_at', null,
    'parent_task_id', null,
    'title', 'Titulo alterado pelo cliente',
    'description', null
  ),
  'and that row carries the two new keys alongside the five it always watched'
);

select is(
  (
    select before_state ->> 'title' from public.audit_logs
    where entity_id = '61000022-1111-4111-8111-111111111111'
      and action_type = 'task_updated'
  ),
  'Tarefa cliente titulo',
  'with the superseded title on the before side, so a rename is reconstructible'
);

update public.tasks set description = 'Nota nova do cliente'
where id = '61000023-1111-4111-8111-111111111111';

select is(
  (
    select count(*)::integer from public.audit_logs
    where entity_id = '61000023-1111-4111-8111-111111111111'
      and action_type = 'task_updated'
  ),
  1,
  'a description-only UPDATE now leaves a task_updated row too'
);

select is(
  (
    select after_state ->> 'description' from public.audit_logs
    where entity_id = '61000023-1111-4111-8111-111111111111'
      and action_type = 'task_updated'
  ),
  'Nota nova do cliente',
  'and the appended note is what the row records'
);

-- 2E-OWNERSHIP-002: not-found and not-yours are one answer ---------------------
--
-- The unlocked ownership probe runs before the reservation, so neither case burns
-- an operation key. Both assertions expect the identical string: that identity is
-- the requirement, not a coincidence of these two calls.

select is(
  pg_temp.taskcmd_apply(
    '62000001-2222-4222-8222-222222222222',
    'rename_task',
    jsonb_build_object('title', 'Titulo roubado'),
    pg_temp.taskcmd_new_pre_state('Tarefa do outro dono', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-notfound'
  ),
  'P0002:Task not found',
  'a command naming another owner''s task is refused as not found, disclosing nothing about its existence'
);

select is(
  pg_temp.taskcmd_apply(
    '69999999-9999-4999-8999-999999999999',
    'rename_task',
    jsonb_build_object('title', 'Titulo roubado'),
    pg_temp.taskcmd_new_pre_state('Tarefa inexistente', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-notfound'
  ),
  'P0002:Task not found',
  'and a nonexistent task is refused with the same code and the same message, so the two are indistinguishable'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Titulo anonimo'),
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-validation'
  ),
  '42501:Authentication required',
  'a caller with no identity is refused before anything else is even parsed'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"61111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

-- Pure validation: the bare 22023 family --------------------------------------
--
-- Every one of these targets the never-mutated validation task and rolls back, so
-- they may share an operation key. A bare 22023 is the mapper's `refused`
-- catch-all, and the messages are what distinguish the guards for a human reading
-- a log.

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'archive_task',
    '{}'::jsonb,
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-validation'
  ),
  '22023:Invalid task command action',
  'an action outside the closed fifteen is refused rather than treated as a no-op'
);

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Titulo novo'),
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'short7'
  ),
  '22023:Invalid operation key',
  'a key below the eight-character floor is refused, because the stored key carries an eleven-character prefix on top of it'
);

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Titulo novo'),
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    '2026-07-26 12:00:00',
    'task-command-policy-v1',
    'pgtap-2e4-validation'
  ),
  '22023:Invalid observed-before instant',
  'an observed instant that is not an ISO instant is refused by the regex before any cast can raise 22P02'
);

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Titulo novo'),
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo')
      || jsonb_build_object('extraKey', 'valor'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-validation'
  ),
  '22023:Task command pre-state must carry exactly the observed fields',
  'the pre-state is validated closed: an unknown key is rejected, never ignored'
);

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Titulo novo', 'dueAt', null),
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-validation'
  ),
  '22023:Task command patch carries a field this action does not allow',
  'and so is the patch: rename_task may not smuggle a due date through a field another action owns'
);

-- The action's own allowed targets, not the table's. `tasks_status_check` accepts
-- `completed`, so this is the assertion that keeps the terminal transitions
-- reachable only through the actions that declare them - and, in this slice,
-- refuse them.
select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'set_status',
    jsonb_build_object('status', 'completed'),
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-validation'
  ),
  '22023:Invalid task command status',
  'set_status is bounded to the six non-terminal statuses, so it cannot become a second route into completed'
);

-- The role is not the caller's to choose: `assign_person` and `set_waiting_on`
-- are otherwise byte-identical policies and the role is the only thing that
-- distinguishes them.
select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'set_waiting_on',
    jsonb_build_object(
      'personId', '61000093-1111-4111-8111-111111111111',
      'personRole', 'involved'
    ),
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-validation'
  ),
  '22023:Invalid task command person role',
  'and the person role may only restate what the taxonomy already fixed for the action'
);

-- 2E-UPDATE-016: a relation reference is proven owned before the reservation ---

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'assign_project',
    jsonb_build_object('projectId', '62000091-2222-4222-8222-222222222222'),
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-validation'
  ),
  '22023:2E_INVALID_RELATION',
  'a patch naming another owner''s project is refused with the declared code, before the reservation burns a key'
);

-- The two destructive verbs are refused, not absent ---------------------------
--
-- 2E-UPDATE-001 requires one RPC for every Phase 2E task mutation, and
-- 2E-DESTRUCTIVE-004 requires the database itself to refuse a destructive action
-- with no confirmation evidence - which does not exist until Slice 2E.5. Refusing
-- them inside the single RPC is what stops them acquiring a second write path.

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'cancel_task',
    '{}'::jsonb,
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-refused'
  ),
  'P0001:2E_ACTION_NOT_ENABLED',
  'cancel_task is a declared action of the taxonomy and is refused with the declared code, not with an unknown-action error'
);

select is(
  pg_temp.taskcmd_apply(
    '61000018-1111-4111-8111-111111111111',
    'restore_task',
    '{}'::jsonb,
    pg_temp.taskcmd_new_pre_state('Tarefa de validacao', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-refused'
  ),
  'P0001:2E_ACTION_NOT_ENABLED',
  'and so is restore_task, because PRD 23.4 ships cancellation''s escape with cancellation'
);

-- 2E-UPDATE-003: the typed twelve-column staleness gate ------------------------
--
-- There is no other multi-column expected-pre-state comparison in this
-- repository, so nothing else can notice an `or` branch going missing from that
-- chain - and the consequence of one going missing is that a command applies to a
-- task whose relevant column moved after the user saw it. Each column is
-- therefore varied alone, against the same base pre-state, with the same action
-- and the same patch.
--
-- `rename_task` is the carrier because its delta is computed from `title` against
-- the *patch*, so varying any other claimed column still reaches the gate rather
-- than short-circuiting into `no_change`. Every attempt below raises, and the
-- helper's exception block rolls back the reservation each one had inserted, so
-- all thirteen share one operation key without colliding.
--
-- The claimed instants are cast to `timestamptz` for this comparison while the
-- same text is hashed verbatim for the fingerprint. Conflating them would force
-- the RPC to re-render the locked row's timestamps byte-identically to whatever
-- PostgREST emitted, which is unwinnable - which is why the base pre-state here
-- is read with an explicit format and the overrides use a different one, and both
-- still compare equal.

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('title', 'Titulo divergente'),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'a claimed title that no longer matches the locked row is refused as stale'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('description', 'Descricao divergente'),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'and so is a stale description, which no other test could observe because it was unwatched until this slice'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('status', 'in_progress'),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'a stale status is stale even when the locked status is still eligible for the action'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('dueAt', pg_temp.taskcmd_iso(now() + interval '9 days')),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'a stale due date is refused, compared as an instant rather than as text'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('plannedAt', pg_temp.taskcmd_iso(now() + interval '9 days')),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'and a stale planned date, likewise'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('manualPriority', 'urgent'),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'a stale manual priority is refused, and the claim is not validated against the four legal values first'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('completedAt', pg_temp.taskcmd_iso(now() - interval '9 days')),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'a stale completed_at is refused, which is what makes a concurrent completion detectable'
);

-- The locked value is null and the claim is not. A gate written with `<>` instead
-- of `is distinct from` would evaluate to NULL here and let the command through,
-- so this direction is the one worth asserting for the two nullable columns.
select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('cancelledAt', pg_temp.taskcmd_iso(now() - interval '9 days')),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'a claimed cancelled_at against a null one is stale, so the comparison is IS DISTINCT FROM and not <>'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('intentionalNoDue', true),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'a stale intentional-no-due flag is refused, so 2E-UPDATE-012 never reasons from a flag the user did not see'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('noDueReason', 'Motivo divergente'),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'and a claimed no-due reason against a null one is stale for the same reason'
);

select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('createdAt', pg_temp.taskcmd_iso(now() - interval '9 days')),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'created_at is compared too: a claim describing a different row entirely is refused rather than applied'
);

-- The column that actually moves. `set_updated_at` stamps it on every UPDATE, so
-- this is the branch that catches a concurrent write to a column the gate does
-- not enumerate.
select is(
  pg_temp.taskcmd_apply(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('updatedAt', pg_temp.taskcmd_iso(now() - interval '9 days')),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '55P03:Task changed since the preview',
  'and updated_at is the backstop, so a write to any column outside the eleven above still refuses the command'
);

-- The raise carries no DETAIL and no HINT, deliberately:
-- `src/features/agent/actions.ts` branches on `error.code === '55P03'` alone
-- before it ever looks at details, so attaching a token would break the mapper
-- convention rather than enrich it. `pg_exception_detail` yields the empty string
-- when a raise carried none, which is the only direct way to assert an absence.
select is(
  pg_temp.taskcmd_detail(
    '61000012-1111-4111-8111-111111111111', 'rename_task',
    jsonb_build_object('title', 'Titulo pos-staleness'),
    pg_temp.taskcmd_pre_state('61000012-1111-4111-8111-111111111111')
      || jsonb_build_object('title', 'Titulo divergente'),
    pg_temp.taskcmd_iso(now()), 'task-command-policy-v1', 'pgtap-2e4-stale'
  ),
  '',
  'the stale raise carries no DETAIL at all, which is what the 55P03-only mapper branch depends on'
);

-- 2E-UPDATE-009: no_change writes nothing at all -------------------------------
--
-- The reservation is the first write, so this decision has to happen before it.
-- A post-lock `no_change` would already have burned an operation key and left an
-- undo row describing an operation that never happened.

select is(
  public.apply_task_command(
    '61000011-1111-4111-8111-111111111111',
    'set_priority',
    jsonb_build_object('manualPriority', 'high'),
    pg_temp.taskcmd_pre_state('61000011-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-nochange'
  ),
  jsonb_build_object(
    'outcome', 'no_change',
    'task_id', '61000011-1111-4111-8111-111111111111',
    'action', 'set_priority',
    'undo_id', null,
    'idempotent', false,
    'request_fingerprint', null,
    'reminders_cancelled', 0,
    'reminder_created_id', null,
    'undo_expires_at', null
  ),
  'a patch that already describes the task returns the whole declared no_change shape, with no undo id and no fingerprint'
);

select is(
  (
    select count(*)::integer from public.undo_operations
    where user_id = '61111111-1111-4111-8111-111111111111'
      and operation_key = 'taskcmd-v1:pgtap-2e4-nochange'
  ),
  0,
  'and it reserved nothing, so the key is still free for a later real command'
);

select is(
  (
    select count(*)::integer from public.audit_logs
    where entity_id = '61000011-1111-4111-8111-111111111111'
      and action_type in ('task_command_applied', 'task_updated')
  ),
  0,
  'and wrote neither an operation audit row nor a trigger row'
);

-- Per-action application (PRD 11.2) -------------------------------------------
--
-- Each command is issued once, and the volatile parts of its answer - the undo
-- id, the fingerprint, the expiry, and the created reminder id where there is one
-- - are removed before comparison, because they are asserted against the ledger
-- rows they came from further down rather than against themselves. Everything
-- else is pinned as a whole object, so any key outside those four appearing or
-- disappearing from the return is a failure and not a silent contract change for
-- `src/features/task-commands`.
--
-- The stripped keys are the exception, and the operator is why: `jsonb -
-- array[...]` removes a key when it is present and does nothing at all when it is
-- not. A return that stopped carrying `undo_id`, `request_fingerprint` or
-- `undo_expires_at` would therefore strip nothing and still compare equal, and the
-- two assertions below that also strip `reminder_created_id` cannot tell its null
-- value from its absence either. This comment used to claim the stripped form
-- caught a key appearing or disappearing; for those keys it never did. So the full
-- key set is pinned once, immediately below, on a fresh applied return, and the
-- per-action assertions are left to pin the values.

select is(
  (
    select array_agg(returned_key.key_name order by returned_key.key_name)
    from jsonb_object_keys(
      public.apply_task_command(
        '6100002b-1111-4111-8111-111111111111',
        'set_planned',
        jsonb_build_object('plannedAt', pg_temp.taskcmd_iso(now() + interval '4 days')),
        pg_temp.taskcmd_pre_state('6100002b-1111-4111-8111-111111111111'),
        pg_temp.taskcmd_iso(now()),
        'task-command-policy-v1',
        'pgtap-2e4-keyset'
      )
    ) as returned_key(key_name)
  ),
  array[
    'action', 'idempotent', 'outcome', 'reminder_created_id', 'reminders_cancelled',
    'request_fingerprint', 'task_id', 'undo_expires_at', 'undo_id'
  ],
  'a fresh applied return carries exactly the nine declared keys and no others, which no assertion that strips a key can prove'
);

-- complete_task ---------------------------------------------------------------

select is(
  public.apply_task_command(
    '61000001-1111-4111-8111-111111111111',
    'complete_task',
    jsonb_build_object('status', 'completed'),
    pg_temp.taskcmd_pre_state('61000001-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-complete'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000001-1111-4111-8111-111111111111',
    'action', 'complete_task',
    'idempotent', false,
    'reminders_cancelled', 2,
    'reminder_created_id', null
  ),
  'complete_task applies, reports both reminders it closed, and truthfully claims it created none'
);

select results_eq(
  $$ select status, completed_at = now(), cancelled_at
     from public.tasks where id = '61000001-1111-4111-8111-111111111111' $$,
  $$ values ('completed'::text, true, null::timestamptz) $$,
  'the terminal status lands and completed_at is stamped at the transaction instant'
);

-- The close half cancels EVERY scheduled row, and only scheduled rows. There is
-- no unique constraint on `reminders.task_id`, so a `limit 1` would leave the
-- second one firing; and the heartbeat flips `scheduled` to `sent` with no user
-- act, so touching a sent row would be undo rewriting history (ADR-018).
select results_eq(
  $$ select
       (count(*) filter (where status = 'scheduled'))::integer,
       (count(*) filter (where status = 'cancelled'))::integer,
       (count(*) filter (where status = 'sent'))::integer,
       (count(*) filter (where status = 'snoozed'))::integer
     from public.reminders where task_id = '61000001-1111-4111-8111-111111111111' $$,
  $$ values (0, 2, 1, 1) $$,
  'both scheduled reminders are cancelled and the sent and snoozed rows are left exactly as they were'
);

select results_eq(
  $$ select action_type, entity_type, actor, reason, source_entry_id
     from public.audit_logs
     where entity_id = '61000001-1111-4111-8111-111111111111'
       and action_type = 'task_command_applied' $$,
  $$ values (
       'task_command_applied'::text, 'task'::text, 'user'::text,
       'User applied a natural-language task command'::text, null::uuid
     ) $$,
  'the operation audit row names the command, the task entity and the user, with no originating entry'
);

-- The trigger row co-fired on the same UPDATE, with the actor the RPC set at step
-- 15. `'user'` is the value the unset default also produces, deliberately - PRD 21
-- requires `persistTaskStatus` to stay byte-identical - so this assertion pins the
-- pairing, and the `'system'` row the undo writes further down is what makes the
-- setting observable at all.
select is(
  (
    select count(*)::integer from public.audit_logs
    where entity_id = '61000001-1111-4111-8111-111111111111'
      and action_type = 'task_updated'
      and actor = 'user'
  ),
  1,
  'and the co-firing trigger leaves exactly one task_updated row carrying the actor the RPC set'
);

-- The same action against a task whose due date is still in the future ----------
--
-- This is the only state in which the reminder insert half's terminal-status guard
-- is load-bearing, and nothing above reaches it. The subject above has no due date
-- at all, so `effective_due_at is not null` short-circuits first and
-- `effective_status not in ('completed', 'cancelled')` could be deleted from the
-- migration without reddening a single assertion; `reopen_task` reaches the guard
-- only in the direction that passes it. Here both earlier conditions hold, so that
-- clause is the only thing between a completion and a reminder armed for a task
-- nobody will look at again - which would also make the return's
-- `reminder_created_id` contradict what the preview disclosed.

select is(
  public.apply_task_command(
    '6100002a-1111-4111-8111-111111111111',
    'complete_task',
    jsonb_build_object('status', 'completed'),
    pg_temp.taskcmd_pre_state('6100002a-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-complete-dated'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '6100002a-1111-4111-8111-111111111111',
    'action', 'complete_task',
    'idempotent', false,
    'reminders_cancelled', 1,
    'reminder_created_id', null
  ),
  'completing a task whose due date is still in the future closes its reminder and truthfully claims it armed no replacement'
);

select results_eq(
  $$ select
       (count(*) filter (where status = 'scheduled'))::integer,
       (count(*) filter (where status = 'cancelled'))::integer,
       count(*)::integer
     from public.reminders where task_id = '6100002a-1111-4111-8111-111111111111' $$,
  $$ values (0, 1, 1) $$,
  'and the completed task is left holding no live reminder, even though the future due date it was armed from survives the transition'
);

-- reopen_task -----------------------------------------------------------------
--
-- `create_due_task_reminder` fires only after INSERT, so nothing but this function
-- can re-create the reminder a completion closed. The subject already holds a live
-- scheduled row - the state Slice 2E.3 verified a pre-Phase-2E task can be in - so
-- the close half has to run first or reopening ends with two live reminders.

select is(
  public.apply_task_command(
    '61000002-1111-4111-8111-111111111111',
    'reopen_task',
    jsonb_build_object('status', 'todo'),
    pg_temp.taskcmd_pre_state('61000002-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-reopen'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at', 'reminder_created_id'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000002-1111-4111-8111-111111111111',
    'action', 'reopen_task',
    'idempotent', false,
    'reminders_cancelled', 1
  ),
  'reopen_task applies and closes the live reminder the task was already holding'
);

select results_eq(
  $$ select status, completed_at, cancelled_at
     from public.tasks where id = '61000002-1111-4111-8111-111111111111' $$,
  $$ values ('todo'::text, null::timestamptz, null::timestamptz) $$,
  'the task returns to todo and completed_at is cleared'
);

select results_eq(
  $$ select
       (count(*) filter (where status = 'scheduled'))::integer,
       (count(*) filter (where status = 'cancelled'))::integer
     from public.reminders where task_id = '61000002-1111-4111-8111-111111111111' $$,
  $$ values (1, 1) $$,
  'and it ends with exactly one live reminder, not two, because the surviving future due date is re-armed after the close'
);

-- set_status ------------------------------------------------------------------

select is(
  public.apply_task_command(
    '61000003-1111-4111-8111-111111111111',
    'set_status',
    jsonb_build_object('status', 'in_progress'),
    pg_temp.taskcmd_pre_state('61000003-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-status'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000003-1111-4111-8111-111111111111',
    'action', 'set_status',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'set_status applies and touches no reminder, because its taxonomy changedFields does not name them'
);

select results_eq(
  $$ select status, completed_at, cancelled_at
     from public.tasks where id = '61000003-1111-4111-8111-111111111111' $$,
  $$ values ('in_progress'::text, null::timestamptz, null::timestamptz) $$,
  'and it moves the status while both terminal timestamps stay null'
);

-- The `persistTaskStatus` mirror, pinned on the one input that distinguishes it
-- ----------------------------------------------------------------------------
--
-- PRD 11.2 says of these two columns "mirroring `persistTaskStatus` so the two
-- paths cannot disagree", and `src/features/operations/actions.ts:148-152`
-- writes both unconditionally on every status change. So `set_status` clears a
-- stale `completed_at` rather than preserving it, even though its taxonomy
-- `changedFields` names only `status` -- `changedFields` is a disclosure list,
-- not a write manifest, which `updated_at` already proves by being written on
-- every UPDATE and named in no action's list.
--
-- A review proposed the opposite behaviour and it was refused on that evidence.
-- The assertion exists because the two implementations differ on exactly one
-- input, and without a fixture carrying it the suite would pass under either --
-- blessing whichever happened to be committed. The stale row is produced by a
-- direct client UPDATE, which is how it occurs in production: `authenticated`
-- retains insert/update/delete on `public.tasks` (PRD 3.2) and the legacy path
-- can leave a `completed_at` on a non-terminal row.
update public.tasks
set completed_at = '2026-07-20T10:00:00+00:00'::timestamptz
where id = '61000003-1111-4111-8111-111111111111';

select results_eq(
  $$ select status, completed_at
     from public.tasks where id = '61000003-1111-4111-8111-111111111111' $$,
  $$ values ('in_progress'::text, '2026-07-20T10:00:00+00:00'::timestamptz) $$,
  'a legacy direct write can leave a completed_at on a non-terminal task'
);

select is(
  public.apply_task_command(
    '61000003-1111-4111-8111-111111111111',
    'set_status',
    jsonb_build_object('status', 'blocked'),
    pg_temp.taskcmd_pre_state('61000003-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-status-mirror'
  ) -> 'outcome',
  to_jsonb('applied'::text),
  'set_status applies against that row'
);

select results_eq(
  $$ select status, completed_at
     from public.tasks where id = '61000003-1111-4111-8111-111111111111' $$,
  $$ values ('blocked'::text, null::timestamptz) $$,
  'and clears the stale completed_at, mirroring persistTaskStatus rather than preserving a value no status justifies'
);

select is(
  (select before_state ->> 'completed_at'
   from public.undo_operations
   where operation_key = 'taskcmd-v1:pgtap-2e4-status-mirror'),
  '2026-07-20T10:00:00.000000+00',
  'and the cleared value is recorded in before_state, so the undo can put it back'
);

-- rename_task -----------------------------------------------------------------

select is(
  public.apply_task_command(
    '61000004-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Renomear tarefa em outro nome'),
    pg_temp.taskcmd_pre_state('61000004-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-rename'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000004-1111-4111-8111-111111111111',
    'action', 'rename_task',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'rename_task applies'
);

select is(
  (select title from public.tasks where id = '61000004-1111-4111-8111-111111111111'),
  'Renomear tarefa em outro nome',
  'and the title is the patch value'
);

-- append_note -----------------------------------------------------------------
--
-- The RPC writes the description verbatim. The append itself is computed by
-- `buildTaskCommandPreview`, which is what the user saw and what the fingerprint
-- hashed, so re-deriving it here would be a second copy of a domain rule that
-- could disagree with the preview. The newline is built with `chr(10)` rather than
-- written as a JSON escape, following the `chr(92)` doctrine of
-- `phase_2e_task_command_matching.sql`.

select is(
  public.apply_task_command(
    '61000005-1111-4111-8111-111111111111',
    'append_note',
    jsonb_build_object(
      'description',
      'Nota original' || chr(10) || chr(10) || 'Nota acrescentada'
    ),
    pg_temp.taskcmd_pre_state('61000005-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-note'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000005-1111-4111-8111-111111111111',
    'action', 'append_note',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'append_note applies'
);

select is(
  (select description from public.tasks where id = '61000005-1111-4111-8111-111111111111'),
  'Nota original' || chr(10) || chr(10) || 'Nota acrescentada',
  'and the description is the patch text verbatim, never re-concatenated inside the database'
);

-- The append whose RESULT passes 2000 characters --------------------------------
--
-- `MAX_NOTE_LENGTH` bounds the fragment the model may emit, at the parse boundary.
-- The canonical patch is the concatenation `pre.description || E'\n\n' || note`, so
-- bounding the RPC at the note's own 2000 bounded the accumulated notes of a whole
-- task instead: the first task to reach 2000 characters of notes could never take
-- another one, and the preview had already offered a one-step apply the RPC then
-- refused. The remaining ceiling is about stopping a definer function from writing
-- megabyte rows, not about note length.
--
-- The pre-state's 1995 characters are built with `repeat` rather than written out,
-- so the number under test is legible: 1995 + two newlines + a 26-character note is
-- 2023. Under the old bound this call returned `22023:Invalid task command
-- description`.

select is(
  public.apply_task_command(
    '61000028-1111-4111-8111-111111111111',
    'append_note',
    jsonb_build_object(
      'description',
      repeat('x', 1995) || chr(10) || chr(10) || 'Nota que passa de dois mil'
    ),
    pg_temp.taskcmd_pre_state('61000028-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-longnote'
  ) ->> 'outcome',
  'applied',
  'an append_note whose result exceeds 2000 characters applies, because the RPC bounds the concatenation and not the note'
);

select is(
  (select char_length(description) from public.tasks where id = '61000028-1111-4111-8111-111111111111'),
  2023,
  'and all 2023 characters land, so a long note history never makes the next legal note unappliable'
);

-- reschedule_due --------------------------------------------------------------
--
-- The subject was inserted with a due date, so `tasks_create_due_reminder` gave it
-- one scheduled reminder. Moving the date has to close that row and arm a new one:
-- updating `remind_at` in place would be silently broken, because the heartbeat's
-- dedupe key is `'reminder:' || id` with no date component, so only a new id can
-- notify again.

select is(
  public.apply_task_command(
    '61000006-1111-4111-8111-111111111111',
    'reschedule_due',
    jsonb_build_object('dueAt', pg_temp.taskcmd_iso(now() + interval '3 days')),
    pg_temp.taskcmd_pre_state('61000006-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-reschedule'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at', 'reminder_created_id'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000006-1111-4111-8111-111111111111',
    'action', 'reschedule_due',
    'idempotent', false,
    'reminders_cancelled', 1
  ),
  'reschedule_due applies and reports closing the reminder the insert trigger had created'
);

select is(
  (select due_at from public.tasks where id = '61000006-1111-4111-8111-111111111111'),
  now() + interval '3 days',
  'the due date is the patch instant, round-tripped through text without losing a microsecond'
);

-- One fresh row, an hour before the new date, carrying the *effective* title so a
-- rename can never leave the reminder text contradicting the task. Reproduced from
-- `create_due_task_reminder`'s formula with `case when a >= b then a else b end`,
-- because `greatest` is a SQL special form with no `pg_proc` entry and cannot be
-- resolved as `pg_catalog.greatest(` under an empty search_path.
select results_eq(
  $$ select title, remind_at, important
     from public.reminders
     where task_id = '61000006-1111-4111-8111-111111111111'
       and status = 'scheduled' $$,
  $$ values (
       'Reagendar tarefa'::text,
       now() + interval '3 days' - interval '1 hour',
       false
     ) $$,
  'and exactly one fresh reminder is armed one hour before the new date, under the task''s own title'
);

-- The lead-time floor. "Move it to 5pm" typed at 4:30pm must still produce a
-- reminder, at `now()` - the condition is that the due date is in the future, not
-- that a full hour of lead remains. A review of Slice 2E.3 already caught that
-- misreading once.
select public.apply_task_command(
  '61000017-1111-4111-8111-111111111111',
  'reschedule_due',
  jsonb_build_object('dueAt', pg_temp.taskcmd_iso(now() + interval '30 minutes')),
  pg_temp.taskcmd_pre_state('61000017-1111-4111-8111-111111111111'),
  pg_temp.taskcmd_iso(now()),
  'task-command-policy-v1',
  'pgtap-2e4-shortlead'
);

select results_eq(
  $$ select remind_at
     from public.reminders
     where task_id = '61000017-1111-4111-8111-111111111111'
       and status = 'scheduled' $$,
  $$ values (now()) $$,
  'a due date less than an hour away still arms a reminder, floored at now() rather than skipped'
);

-- clear_due -------------------------------------------------------------------

select is(
  public.apply_task_command(
    '61000007-1111-4111-8111-111111111111',
    'clear_due',
    jsonb_build_object('dueAt', null),
    pg_temp.taskcmd_pre_state('61000007-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-cleardue'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000007-1111-4111-8111-111111111111',
    'action', 'clear_due',
    'idempotent', false,
    'reminders_cancelled', 1,
    'reminder_created_id', null
  ),
  'clear_due applies, closes the reminder and truthfully claims it armed none'
);

select results_eq(
  $$ select
       (select due_at from public.tasks where id = '61000007-1111-4111-8111-111111111111'),
       (select count(*)::integer from public.reminders
          where task_id = '61000007-1111-4111-8111-111111111111' and status = 'scheduled') $$,
  $$ values (null::timestamptz, 0) $$,
  'and the task is left with no due date and no live reminder at all'
);

-- set_planned -----------------------------------------------------------------

select is(
  public.apply_task_command(
    '61000008-1111-4111-8111-111111111111',
    'set_planned',
    jsonb_build_object('plannedAt', pg_temp.taskcmd_iso(now() + interval '2 days')),
    pg_temp.taskcmd_pre_state('61000008-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-planned'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000008-1111-4111-8111-111111111111',
    'action', 'set_planned',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'set_planned applies and arms no reminder: planning is not a deadline'
);

select is(
  (select planned_at from public.tasks where id = '61000008-1111-4111-8111-111111111111'),
  now() + interval '2 days',
  'and the planned instant is the patch value'
);

-- set_priority ----------------------------------------------------------------

select is(
  public.apply_task_command(
    '61000009-1111-4111-8111-111111111111',
    'set_priority',
    jsonb_build_object('manualPriority', 'urgent'),
    pg_temp.taskcmd_pre_state('61000009-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-priority'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000009-1111-4111-8111-111111111111',
    'action', 'set_priority',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'set_priority applies'
);

select is(
  (select manual_priority from public.tasks where id = '61000009-1111-4111-8111-111111111111'),
  'urgent',
  'and the manual priority is the patch value, which the trigger records under the key it has always used'
);

-- The same action against a subject that HOLDS live reminders --------------------
--
-- This is what makes `action_touches_reminders` falsifiable at all. Every reminder
-- assertion above pairs a reminder-touching action with a reminder-holding task, or
-- a non-touching action with a task that holds nothing and has no due date - and in
-- that second pairing the whole reconciliation block is a no-op, so flipping a
-- non-reminder action's taxonomy flag to true would change no observable outcome.
-- This subject has a future due date, so it holds the row the insert trigger armed
-- plus one fixture row carrying a literal id, and `set_priority` must leave both
-- exactly as they are.

select is(
  public.apply_task_command(
    '61000029-1111-4111-8111-111111111111',
    'set_priority',
    jsonb_build_object('manualPriority', 'high'),
    pg_temp.taskcmd_pre_state('61000029-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-priority-reminder'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000029-1111-4111-8111-111111111111',
    'action', 'set_priority',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'set_priority on a task holding two live reminders still reports closing none and arming none'
);

select results_eq(
  $$ select
       (count(*) filter (where status = 'scheduled'))::integer,
       (count(*) filter (where status = 'cancelled'))::integer,
       count(*)::integer
     from public.reminders where task_id = '61000029-1111-4111-8111-111111111111' $$,
  $$ values (2, 0, 2) $$,
  'and that report is true against the table: nothing was cancelled and no third row was armed from the surviving due date'
);

-- The close half cancels in place and the insert half adds a row, so naming a
-- pre-existing id and finding it still `scheduled` is what separates "untouched"
-- from "closed and replaced by an identical-looking row": a replacement armed from
-- the same unchanged due date would carry the same title and the same `remind_at`,
-- and only the id would differ.
select results_eq(
  $$ select id, status from public.reminders
     where task_id = '61000029-1111-4111-8111-111111111111'
       and id = '61000049-1111-4111-8111-111111111111' $$,
  $$ values (
       '61000049-1111-4111-8111-111111111111'::uuid,
       'scheduled'::text
     ) $$,
  'and the row the task already held is still that same row under its original id, not a fresh one wearing its values'
);

-- assign_project --------------------------------------------------------------
--
-- The pre-state here is the literal constructor rather than the row reader, on
-- purpose: a relation action writes no column on `public.tasks`, so the claim
-- stays true afterwards and the two follow-up assertions can reuse it - one with
-- the stale claim and one with the current one - to separate a genuine conflict
-- from the ordinary already-linked case.

select is(
  public.apply_task_command(
    '6100000a-1111-4111-8111-111111111111',
    'assign_project',
    jsonb_build_object('projectId', '61000091-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_new_pre_state('Vincular projeto', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-project'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '6100000a-1111-4111-8111-111111111111',
    'action', 'assign_project',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'assign_project applies and touches no reminder and no column'
);

-- `user_id` is written on the relation row and the composite owner FKs make a
-- cross-owner link unrepresentable, so 2E-UPDATE-016 holds by construction; what
-- is observable here is that the row is the caller's own project and nobody else's.
select results_eq(
  $$ select project_id, user_id
     from public.task_projects
     where task_id = '6100000a-1111-4111-8111-111111111111' $$,
  $$ values (
       '61000091-1111-4111-8111-111111111111'::uuid,
       '61111111-1111-4111-8111-111111111111'::uuid
     ) $$,
  'and the link carries the caller''s project and the caller''s own user_id'
);

-- The same command again with the *observed* pre-state, which still claims the
-- relation is absent. The staleness gate cannot see this, deliberately: relation
-- arrays are not columns on `public.tasks`, and comparing them would refuse a
-- completion because an unrelated concurrent assignment landed. So the locked
-- re-check is the authoritative one, and a relation that appeared since the
-- observation is a retryable conflict rather than a silent success.
select is(
  pg_temp.taskcmd_apply(
    '6100000a-1111-4111-8111-111111111111',
    'assign_project',
    jsonb_build_object('projectId', '61000091-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_new_pre_state('Vincular projeto', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-project-stale'
  ),
  'P0001:2E_TRANSITION_INTEGRITY',
  'a relation that appeared between the observation and the lock is a conflict, caught by the locked re-check the staleness gate cannot perform'
);

-- And the ordinary case it must not be confused with: the caller observed the
-- relation, so there is nothing to do, and that is decided before the reservation.
select is(
  public.apply_task_command(
    '6100000a-1111-4111-8111-111111111111',
    'assign_project',
    jsonb_build_object('projectId', '61000091-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_pre_state('6100000a-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-project-again'
  ) ->> 'outcome',
  'no_change',
  'while an observed already-linked relation is no_change, not a conflict'
);

-- assign_context --------------------------------------------------------------

select is(
  public.apply_task_command(
    '6100000b-1111-4111-8111-111111111111',
    'assign_context',
    jsonb_build_object('contextId', '61000092-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_pre_state('6100000b-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-context'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '6100000b-1111-4111-8111-111111111111',
    'action', 'assign_context',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'assign_context applies'
);

select results_eq(
  $$ select context_id, user_id
     from public.task_contexts
     where task_id = '6100000b-1111-4111-8111-111111111111' $$,
  $$ values (
       '61000092-1111-4111-8111-111111111111'::uuid,
       '61111111-1111-4111-8111-111111111111'::uuid
     ) $$,
  'and links the caller''s own context'
);

-- assign_person ---------------------------------------------------------------

select is(
  public.apply_task_command(
    '6100000c-1111-4111-8111-111111111111',
    'assign_person',
    jsonb_build_object(
      'personId', '61000093-1111-4111-8111-111111111111',
      'personRole', 'involved'
    ),
    pg_temp.taskcmd_pre_state('6100000c-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-person'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '6100000c-1111-4111-8111-111111111111',
    'action', 'assign_person',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'assign_person applies'
);

select results_eq(
  $$ select person_id, role
     from public.task_people
     where task_id = '6100000c-1111-4111-8111-111111111111' $$,
  $$ values ('61000093-1111-4111-8111-111111111111'::uuid, 'involved'::text) $$,
  'under the role its taxonomy fixes, which is the only thing separating it from set_waiting_on'
);

-- set_waiting_on --------------------------------------------------------------
--
-- The subject already holds this same person under `involved`. `task_people` is
-- keyed `(task_id, person_id, role)`, so the same person legitimately appears
-- twice, and "already held" is a positional join over the pre-state's parallel
-- arrays rather than a membership test.

select is(
  public.apply_task_command(
    '6100000d-1111-4111-8111-111111111111',
    'set_waiting_on',
    jsonb_build_object(
      'personId', '61000093-1111-4111-8111-111111111111',
      'personRole', 'waiting_on'
    ),
    pg_temp.taskcmd_pre_state('6100000d-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-waiting'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '6100000d-1111-4111-8111-111111111111',
    'action', 'set_waiting_on',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'set_waiting_on applies even though the same person is already linked under another role'
);

select results_eq(
  $$ select role from public.task_people
     where task_id = '6100000d-1111-4111-8111-111111111111'
     order by role $$,
  $$ values ('involved'::text), ('waiting_on'::text) $$,
  'and the task now holds both roles, so the command added rather than replaced'
);

-- 2E-UPDATE-002: eligibility is checked against the LOCKED status ---------------
--
-- Reached only because the claim matches the locked row: the staleness gate runs
-- first, so an ineligible status is a genuine policy refusal and never a disguised
-- stale-preview failure.

select is(
  pg_temp.taskcmd_apply(
    '6100000e-1111-4111-8111-111111111111',
    'complete_task',
    jsonb_build_object('status', 'completed'),
    pg_temp.taskcmd_pre_state('6100000e-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-ineligible'
  ),
  'P0001:2E_INELIGIBLE_STATUS',
  'completing a cancelled task is refused against the action''s own eligible set, not against the table CHECK'
);

-- 2E-UPDATE-012: due consistency, at both of its two sites ---------------------
--
-- `tasks_no_due_consistency_check` (`202607210036:36-41`) would refuse both of the
-- payloads below with a raw 23514 the caller cannot act on. Both are intercepted
-- with a declared reason code instead: the first from the patch's own internal
-- consistency, the second from the locked row's flag.

select is(
  pg_temp.taskcmd_apply(
    '6100000f-1111-4111-8111-111111111111',
    'reschedule_due',
    jsonb_build_object(
      'dueAt', pg_temp.taskcmd_iso(now() + interval '6 days'),
      'intentionalNoDue', true
    ),
    pg_temp.taskcmd_pre_state('6100000f-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-duecheck'
  ),
  '22023:2E_DUE_CONSISTENCY',
  'a patch that sets a due date and asserts the intentional no-due flag at once is refused with the declared code, never as a raw 23514'
);

select is(
  pg_temp.taskcmd_apply(
    '6100000f-1111-4111-8111-111111111111',
    'reschedule_due',
    jsonb_build_object('dueAt', pg_temp.taskcmd_iso(now() + interval '6 days')),
    pg_temp.taskcmd_pre_state('6100000f-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-duecheck'
  ),
  '22023:2E_DUE_CONSISTENCY',
  'and dating an intentionally-undated task without clearing both flags is refused the same way'
);

select is(
  public.apply_task_command(
    '6100000f-1111-4111-8111-111111111111',
    'reschedule_due',
    jsonb_build_object(
      'dueAt', pg_temp.taskcmd_iso(now() + interval '6 days'),
      'intentionalNoDue', false,
      'noDueReason', null
    ),
    pg_temp.taskcmd_pre_state('6100000f-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-duefix'
  ) ->> 'outcome',
  'applied',
  'while the same date with both flags cleared in the same canonical patch applies'
);

select results_eq(
  $$ select due_at, intentional_no_due, no_due_reason
     from public.tasks where id = '6100000f-1111-4111-8111-111111111111' $$,
  $$ values (now() + interval '6 days', false, null::text) $$,
  'and lands the date with the intentional no-due flag and its reason both cleared atomically'
);

-- 2E_REMINDER_INTEGRITY, by transaction-local fault injection -------------------
--
-- The guard compares a value read back from the table against what the command
-- claims it created, so its reachable cause is a direct client write landing
-- between the close and the read: `authenticated` still holds INSERT and UPDATE on
-- `public.reminders` (`202607160007:152-166`), which PRD 14 permits and 16.4
-- records as residual risk. That race cannot be staged inside one transaction, so
-- the close is suppressed instead by a trigger created and dropped here. This
-- proves the guard fires without pretending a race occurred - and a declared member
-- of a closed error vocabulary that no test can provoke is the same defect as a
-- missing raise.
--
-- Both the function and the trigger need the fixture role's privileges, and both
-- are reverted by the closing rollback in any case.

reset role;

create function public.pgtap_taskcmd_block_reminder_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' then
    return null;
  end if;
  return new;
end;
$$;

create trigger pgtap_taskcmd_block_reminder_close
before update on public.reminders
for each row execute function public.pgtap_taskcmd_block_reminder_close();

set local role authenticated;

select is(
  pg_temp.taskcmd_apply(
    '61000014-1111-4111-8111-111111111111',
    'complete_task',
    jsonb_build_object('status', 'completed'),
    pg_temp.taskcmd_pre_state('61000014-1111-4111-8111-111111111111'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-reminders'
  ),
  'P0001:2E_REMINDER_INTEGRITY',
  'a live reminder surviving reconciliation is a retryable conflict, because the effect the preview disclosed would otherwise be false'
);

reset role;
drop trigger pgtap_taskcmd_block_reminder_close on public.reminders;
drop function public.pgtap_taskcmd_block_reminder_close();
set local role authenticated;

-- 2E-IDEMPOTENCY: replay, and the fingerprint that decides it -------------------
--
-- The pre-state is the literal constructor because the replay has to send the
-- *same* payload, and the row reader would return the post-apply state after the
-- first call - which is a different fingerprint and therefore a mismatch rather
-- than a replay. That is not a quirk of the test: it is why the client has to
-- retry with the payload it previewed.

select is(
  public.apply_task_command(
    '61000013-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Tarefa de replay renomeada'),
    pg_temp.taskcmd_new_pre_state('Tarefa de replay', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-replay'
  ) - array['undo_id', 'request_fingerprint', 'undo_expires_at'],
  jsonb_build_object(
    'outcome', 'applied',
    'task_id', '61000013-1111-4111-8111-111111111111',
    'action', 'rename_task',
    'idempotent', false,
    'reminders_cancelled', 0,
    'reminder_created_id', null
  ),
  'the first attempt applies and reports itself as the original, not as a replay'
);

-- Reconstructed entirely from the stored row: re-reading the task would return
-- post-hoc state and make the replay untruthful, which is why every field the
-- success return needs was persisted up front. The expiry is the stored one rather
-- than a recomputed `now() + 24 hours`, so a replay tells the caller how long the
-- *original* undo window still has.
select is(
  public.apply_task_command(
    '61000013-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Tarefa de replay renomeada'),
    pg_temp.taskcmd_new_pre_state('Tarefa de replay', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-replay'
  ),
  (
    select jsonb_build_object(
      'outcome', 'applied',
      'task_id', '61000013-1111-4111-8111-111111111111',
      'action', 'rename_task',
      'undo_id', operation.id,
      'idempotent', true,
      'request_fingerprint', operation.request_fingerprint,
      'reminders_cancelled', 0,
      'reminder_created_id', null,
      'undo_expires_at', to_char(operation.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')
    )
    from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-replay'
  ),
  'the same key and the same payload returns the stored result marked idempotent, down to the recorded undo id and expiry'
);

select results_eq(
  $$ select
       (select count(*)::integer from public.undo_operations
          where user_id = '61111111-1111-4111-8111-111111111111'
            and operation_key = 'taskcmd-v1:pgtap-2e4-replay'),
       (select count(*)::integer from public.audit_logs
          where entity_id = '61000013-1111-4111-8111-111111111111'
            and action_type = 'task_command_applied'),
       (select count(*)::integer from public.audit_logs
          where entity_id = '61000013-1111-4111-8111-111111111111'
            and action_type = 'task_updated') $$,
  $$ values (1, 1, 1) $$,
  'and it wrote no second undo row, no second operation audit row and no second trigger row'
);

-- Vanished-row and fingerprint mismatch collapse into one error deliberately: the
-- caller learns that this key does not describe this payload, and nothing more.
select is(
  pg_temp.taskcmd_apply(
    '61000013-1111-4111-8111-111111111111',
    'rename_task',
    jsonb_build_object('title', 'Titulo divergente do replay'),
    pg_temp.taskcmd_new_pre_state('Tarefa de replay', 'todo'),
    pg_temp.taskcmd_iso(now()),
    'task-command-policy-v1',
    'pgtap-2e4-replay'
  ),
  'P0001:2E_IDEMPOTENCY_MISMATCH',
  'the same key with a different payload is refused rather than replayed, so one key can only ever mean one command'
);

-- The stored fingerprint is the canonical digest over the BTRIMMED CALLER key, not
-- the `taskcmd-v1:`-prefixed one this row is keyed by. TypeScript hashes its own
-- `operationKey`, so hashing the prefixed form here would make every replay look
-- new. The comparison is total because the command succeeded: had this pre-state
-- not matched the locked row, the staleness gate would have refused it.
select is(
  (
    select request_fingerprint from public.undo_operations
    where user_id = '61111111-1111-4111-8111-111111111111'
      and operation_key = 'taskcmd-v1:pgtap-2e4-replay'
  ),
  public.task_command_fingerprint(
    '61111111-1111-4111-8111-111111111111',
    '61000013-1111-4111-8111-111111111111',
    pg_temp.taskcmd_iso(now()),
    pg_temp.taskcmd_new_pre_state('Tarefa de replay', 'todo'),
    jsonb_build_object('title', 'Tarefa de replay renomeada'),
    'task-command-policy-v1',
    'pgtap-2e4-replay'
  ),
  'the recorded fingerprint is the one task_command_fingerprint derives from the bare caller key and the verbatim observed pre-state'
);

-- 2E-PROVENANCE-001: the governing policy version is recorded, not only hashed ---
--
-- The assertion directly above proves the version reached the digest. A digest
-- attributes nothing: hashed only, there was no way to say from a stored operation
-- which policy decided it, which is exactly what 2E-PROVENANCE-001 requires of
-- every Phase 2E decision. The key sits on `after_state`, and the mandatory step-23
-- UPDATE copies that same object into `audit_logs.after_state`, so one write lands
-- the value on both the undo row and the audit row. Compared against the literal
-- the call passed, never against a re-read of the request.

select is(
  (
    select after_state ->> 'policy_version' from public.undo_operations
    where user_id = '61111111-1111-4111-8111-111111111111'
      and operation_key = 'taskcmd-v1:pgtap-2e4-replay'
  ),
  'task-command-policy-v1',
  'the stored operation records the policy version that governed it, so a decision is attributable without recomputing a digest'
);

-- 2E-UPDATE-014: undo of a column command --------------------------------------
--
-- Routed through `public.undo_operation`, so this also proves the registry entry
-- resolves and that the handler - not the router - marks the operation undone and
-- writes the audit row. The router does neither; a handler that forgot the first
-- would leave the row `available` and the undo silently replayable.

select is(
  public.undo_operation((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-complete'
  )),
  jsonb_build_object(
    'undone', true,
    'affected', 1,
    'reminders_restored', 2,
    'idempotent', false
  ),
  'undoing a completion restores one task row and re-creates both reminders it had closed'
);

select results_eq(
  $$ select status, title, completed_at, cancelled_at
     from public.tasks where id = '61000001-1111-4111-8111-111111111111' $$,
  $$ values ('todo'::text, 'Concluir relatorio'::text, null::timestamptz, null::timestamptz) $$,
  'the recorded scalar pre-state is put back, including the cleared completed_at'
);

-- Restored by close-and-insert, not by un-cancelling: only a new id gets a fresh
-- `dedupe_key`, so an id that has already notified can never notify again. The
-- cost is that the cancelled originals stay cancelled, which is why filtering on
-- `scheduled` selects exactly the two fresh rows - and `important` has to survive,
-- or the heartbeat's quiet-hours override silently changes meaning.
select results_eq(
  $$ select title, remind_at, important
     from public.reminders
     where task_id = '61000001-1111-4111-8111-111111111111'
       and status = 'scheduled'
     order by title $$,
  $$ values
       ('Lembrete dois'::text, now() + interval '5 hours', true),
       ('Lembrete um'::text, now() + interval '2 hours', false) $$,
  'and both reminders come back verbatim - title, instant and importance - as fresh rows with fresh ids'
);

select results_eq(
  $$ select status, undone_at is not null
     from public.undo_operations
     where user_id = '61111111-1111-4111-8111-111111111111'
       and operation_key = 'taskcmd-v1:pgtap-2e4-complete' $$,
  $$ values ('undone'::text, true) $$,
  'the handler marks the operation undone and stamps undone_at, which the router deliberately does not do'
);

select is(
  (
    select count(*)::integer from public.audit_logs
    where entity_id = '61000001-1111-4111-8111-111111111111'
      and action_type = 'operation_undone'
      and actor = 'user'
      and reason = 'User executed the stored compensating operation'
  ),
  1,
  'and writes its own operation_undone row naming the user who asked for it'
);

-- 2E-PROVENANCE-003, and the whole point of the transaction-local actor: the
-- compensating column write was performed by the system executing a stored
-- operation, while the row above records who asked. Together they make user-driven
-- and undo-driven transitions distinguishable in audit at the trigger layer, which
-- is what 2E-DESTRUCTIVE-007 needs in Slice 2E.5 without reopening the trigger.
select is(
  (
    select count(*)::integer from public.audit_logs
    where entity_id = '61000001-1111-4111-8111-111111111111'
      and action_type = 'task_updated'
      and actor = 'system'
  ),
  1,
  'while the co-firing trigger attributes the compensating write to system, distinguishing it from the user apply above'
);

-- Double undo is handled by the router before the registry lookup, and is a
-- success path rather than an error. `interpretation_id` is present-but-null for a
-- non-interpretation operation - pre-existing router behaviour this slice inherits.
select is(
  public.undo_operation((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-complete'
  )),
  jsonb_build_object(
    'undone', true,
    'affected', 0,
    'interpretation_id', null,
    'idempotent', true
  ),
  'a second undo is the router''s idempotent success path and no handler runs again'
);

-- 2E-UPDATE-015: undo of a relation command ------------------------------------
--
-- A separate handler rather than a branch, because "remove only the row this
-- operation created" is a different contract from "put the recorded fields back".
-- It restores no column and touches no reminder: neither appears in these actions'
-- changedFields, so restoring either would be undo inventing an effect the forward
-- operation never had.

select is(
  public.undo_operation((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-waiting'
  )),
  jsonb_build_object(
    'undone', true,
    'affected', 1,
    'reminders_restored', 0,
    'relation_removed', jsonb_build_object(
      'table', 'task_people',
      'id', '61000093-1111-4111-8111-111111111111',
      'role', 'waiting_on'
    ),
    'idempotent', false
  ),
  'undoing a relation command removes exactly one row and names the row it removed'
);

select results_eq(
  $$ select role from public.task_people
     where task_id = '6100000d-1111-4111-8111-111111111111'
     order by role $$,
  $$ values ('involved'::text) $$,
  'and it removes only the waiting_on row the operation created, leaving the involved link the user established earlier'
);

select is(
  (
    select count(*)::integer from public.audit_logs
    where entity_id = '6100000d-1111-4111-8111-111111111111'
      and action_type = 'operation_undone'
  ),
  1,
  'with its own operation_undone row, recorded against the task entity the operation named'
);

-- The ten-column undo guard, in the direction that must SUCCEED ------------------
--
-- Every undo refusal in this file is also satisfied by a guard that matches
-- nothing, so a widening that made the compensating UPDATE unsatisfiable would pass
-- all of them and break every real undo in the product. This is the control: a
-- command on a task nothing else has touched, whose ten recorded columns all still
-- hold what the forward operation left, must still compensate.
--
-- It is deliberately a `rename_task` rather than another `complete_task`. Every
-- undo above is a completion, so the status branch is the only forward branch whose
-- recorded `applied_state` has ever been exercised - and for a rename nine of those
-- ten keys fall through to `locked_task` instead, including the `completed_at` the
-- migration calls the trap. A branch that recorded any of them wrongly refuses
-- here, and nowhere else.

select public.apply_task_command(
  '61000025-1111-4111-8111-111111111111',
  'rename_task',
  jsonb_build_object('title', 'Tarefa de renome desfeito, novo nome'),
  pg_temp.taskcmd_pre_state('61000025-1111-4111-8111-111111111111'),
  pg_temp.taskcmd_iso(now()),
  'task-command-policy-v1',
  'pgtap-2e4-rename-undo'
);

select is(
  public.undo_operation((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-rename-undo'
  )),
  jsonb_build_object(
    'undone', true,
    'affected', 1,
    'reminders_restored', 0,
    'idempotent', false
  ),
  'undoing a rename nothing intervened on restores exactly one row and restores no reminder, because the rename closed none'
);

select results_eq(
  $$ select title, status, due_at
     from public.tasks where id = '61000025-1111-4111-8111-111111111111' $$,
  $$ values ('Tarefa de renome desfeito'::text, 'todo'::text, null::timestamptz) $$,
  'the superseded title is put back, and the columns the rename never touched are restored to the values they already held'
);

select is(
  (
    select status from public.undo_operations
    where user_id = '61111111-1111-4111-8111-111111111111'
      and operation_key = 'taskcmd-v1:pgtap-2e4-rename-undo'
  ),
  'undone',
  'and the operation is marked undone, so a compensation that already ran cannot run a second time against the state it produced'
);

-- 2E_UNDO_RESTORE_INTEGRITY: a guarded state that moved --------------------------
--
-- The restoration is guarded by the status the forward operation *produced*, not
-- the one it replaced, so a newer change is refused rather than silently discarded.
-- Setup is deliberately unasserted: if the apply had not landed, the assertion
-- below would report a missing operation instead.

select public.apply_task_command(
  '61000015-1111-4111-8111-111111111111',
  'complete_task',
  jsonb_build_object('status', 'completed'),
  pg_temp.taskcmd_pre_state('61000015-1111-4111-8111-111111111111'),
  pg_temp.taskcmd_iso(now()),
  'task-command-policy-v1',
  'pgtap-2e4-undo-moved'
);

update public.tasks set status = 'in_progress'
where id = '61000015-1111-4111-8111-111111111111';

select is(
  pg_temp.taskcmd_undo((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-undo-moved'
  )),
  'P0001:2E_UNDO_RESTORE_INTEGRITY',
  'an undo whose guarded status moved after the apply refuses rather than overwriting the newer state'
);

-- 2E-UNDO-004: undoing the OLDER of two commands on one task ---------------------
--
-- The most important assertion in this file, because it passed silently before the
-- guard was widened. The case above varies the one column the guard used to read, so
-- it passed under a status-only guard too; this one varies none of it. Two commands,
-- one task, undo the first: a rename (which moves no status), then a
-- `reschedule_due` (which sets `due_at` and arms a reminder), then the rename's own
-- undo. Under the shipped status-only guard the status still matched, so the
-- compensating UPDATE - which writes all ten scalars from `before_state` - matched
-- too, wrote `due_at = null` straight over the second command, left the reminder
-- that command armed `scheduled` on a task with no due date, and returned
-- `{"undone": true}`. Guarding one column while writing ten is precisely what
-- 2E-UPDATE-014 ("restores every field it changed") and 2E-UNDO-004 ("refuses when a
-- newer change would be silently discarded") forbid.
--
-- The refusal is only half the proof: the second assertion is what shows the newer
-- change survived rather than merely that something raised. Both applies are
-- unasserted setup, as above - had either failed, the undo lookup would report a
-- missing operation instead.

select public.apply_task_command(
  '61000024-1111-4111-8111-111111111111',
  'rename_task',
  jsonb_build_object('title', 'Tarefa de dois comandos, renomeada'),
  pg_temp.taskcmd_pre_state('61000024-1111-4111-8111-111111111111'),
  pg_temp.taskcmd_iso(now()),
  'task-command-policy-v1',
  'pgtap-2e4-older-rename'
);

select public.apply_task_command(
  '61000024-1111-4111-8111-111111111111',
  'reschedule_due',
  jsonb_build_object('dueAt', pg_temp.taskcmd_iso(now() + interval '8 days')),
  pg_temp.taskcmd_pre_state('61000024-1111-4111-8111-111111111111'),
  pg_temp.taskcmd_iso(now()),
  'task-command-policy-v1',
  'pgtap-2e4-older-reschedule'
);

select is(
  pg_temp.taskcmd_undo((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-older-rename'
  )),
  'P0001:2E_UNDO_RESTORE_INTEGRITY',
  'undoing the older of two commands is refused on a column the older one never wrote, because the guard is as wide as the ten-column restore'
);

select results_eq(
  $$ select title, due_at
     from public.tasks where id = '61000024-1111-4111-8111-111111111111' $$,
  $$ values (
       'Tarefa de dois comandos, renomeada'::text,
       now() + interval '8 days'
     ) $$,
  'and the newer command survives intact - the due date it set is still on the row, which is exactly what a status-only guard discarded in silence'
);

-- 2E_UNDO_REMINDER_INTEGRITY: recorded evidence that cannot be replayed ----------
--
-- Whatever the forward path records becomes a hard contract the undo enforces, so
-- the reachable failure is a recorded element missing a field the restore needs.
-- `->>` yields NULL for an absent key, so without this gate `public.reminders`
-- would surface a raw 23502 that no mapper case covers. The row is corrupted with
-- the fixture role's privileges because `authenticated` cannot write the undo
-- ledger at all - which is the same reason the RPC has to be SECURITY DEFINER.

select public.apply_task_command(
  '61000016-1111-4111-8111-111111111111',
  'complete_task',
  jsonb_build_object('status', 'completed'),
  pg_temp.taskcmd_pre_state('61000016-1111-4111-8111-111111111111'),
  pg_temp.taskcmd_iso(now()),
  'task-command-policy-v1',
  'pgtap-2e4-undo-reminder'
);

reset role;

update public.undo_operations
set before_state = jsonb_set(
  before_state,
  array['reminders_cancelled'],
  jsonb_build_array(jsonb_build_object(
    'id', '61000046-1111-4111-8111-111111111111',
    'remind_at', pg_temp.taskcmd_iso(now() + interval '1 hour'),
    'important', false
  ))
)
where user_id = '61111111-1111-4111-8111-111111111111'
  and operation_key = 'taskcmd-v1:pgtap-2e4-undo-reminder';

set local role authenticated;

select is(
  pg_temp.taskcmd_undo((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-undo-reminder'
  )),
  'P0001:2E_UNDO_REMINDER_INTEGRITY',
  'a recorded reminder missing the title the restore needs is refused with the declared code, not with a raw not-null violation'
);

-- The same token from a state the forward path can actually reach -----------------
--
-- The refusal above is the element-SHAPE gate, and it needs a hand-corrupted row
-- because the forward path cannot write a malformed element. On its own that left
-- `2E_UNDO_REMINDER_INTEGRITY` unraisable from any state a real operation can reach,
-- which for a declared member of a closed error vocabulary is the same defect as no
-- raise at all - and it is the identical objection the migration uses to reject its
-- own tautological count forms, so the file contradicted itself.
--
-- The post-condition below is read back from the table instead, and its cause needs
-- no privilege and no tampering: `authenticated` keeps INSERT on `public.reminders`
-- (PRD 14 permits it, 16.4 records it as residual risk), so an ordinary client can
-- add a live reminder between the forward close and the undo. That is the row
-- inserted here, as the fixture user's own role. What the undo would otherwise
-- produce is a restored pre-state on a task holding a live reminder no operation in
-- the chain ever disclosed; refusing is retryable and truthful.
--
-- The scoping matters as much as the check. Run unconditionally this count would
-- refuse the rename undo asserted further up, whose task legitimately held a live
-- reminder the rename never touched and whose recorded array is empty. It is scoped
-- by the recorded `after_state.reminders_reconciled`.

select public.apply_task_command(
  '61000026-1111-4111-8111-111111111111',
  'complete_task',
  jsonb_build_object('status', 'completed'),
  pg_temp.taskcmd_pre_state('61000026-1111-4111-8111-111111111111'),
  pg_temp.taskcmd_iso(now()),
  'task-command-policy-v1',
  'pgtap-2e4-undo-live-reminder'
);

insert into public.reminders (id, user_id, task_id, title, remind_at, important, status)
values (
  '61000048-1111-4111-8111-111111111111',
  '61111111-1111-4111-8111-111111111111',
  '61000026-1111-4111-8111-111111111111',
  'Lembrete intruso',
  now() + interval '4 hours',
  false,
  'scheduled'
);

select is(
  pg_temp.taskcmd_undo((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-undo-live-reminder'
  )),
  'P0001:2E_UNDO_REMINDER_INTEGRITY',
  'an undo that would leave the task holding a live reminder no operation in the chain disclosed is refused, from a state a plain client write reaches'
);

-- The evidence gate, on a shape it was documented to refuse and did not -----------
--
-- Every term of that gate reads `is distinct from` rather than `<>` for one reason:
-- `jsonb_typeof` is strict, so `jsonb_typeof(null)` is SQL NULL, `NULL <> 'object'`
-- is NULL, one NULL term makes the whole `or`-chain NULL unless another term is
-- already true, and plpgsql reads a NULL `if` condition as false. Written with `<>`
-- the gate therefore failed OPEN for exactly the null `before_state` its own comment
-- claimed it refused, and then restored `status = null` into a NOT NULL column - a
-- raw 23502 no mapper case covers, in place of this slice's declared code.
--
-- The row is emptied with the fixture role's privileges because `authenticated`
-- cannot write the undo ledger at all, which is the same reason the RPC has to be
-- SECURITY DEFINER. Nothing this migration writes can produce this shape; the point
-- is that the gate is the contract, and a contract that never fires is not one.

select public.apply_task_command(
  '61000027-1111-4111-8111-111111111111',
  'rename_task',
  jsonb_build_object('title', 'Tarefa sem evidencia, renomeada'),
  pg_temp.taskcmd_pre_state('61000027-1111-4111-8111-111111111111'),
  pg_temp.taskcmd_iso(now()),
  'task-command-policy-v1',
  'pgtap-2e4-undo-noevidence'
);

reset role;

update public.undo_operations
set before_state = null
where user_id = '61111111-1111-4111-8111-111111111111'
  and operation_key = 'taskcmd-v1:pgtap-2e4-undo-noevidence';

set local role authenticated;

select is(
  pg_temp.taskcmd_undo((
    select operation.id from public.undo_operations operation
    where operation.user_id = '61111111-1111-4111-8111-111111111111'
      and operation.operation_key = 'taskcmd-v1:pgtap-2e4-undo-noevidence'
  )),
  'P0001:2E_UNDO_RESTORE_INTEGRITY',
  'an operation carrying no before_state at all is refused at the evidence gate with the declared code, where the <> form would have proceeded to restore a null status'
);

-- Handler posture and registration ---------------------------------------------
--
-- Read as the fixture role: `private.undo_operation_handlers` is revoked from
-- every role and the `private` schema's USAGE is revoked from `authenticated`
-- (`202607170024:5-6`), which is exactly the property that makes the registry
-- unreachable from a client.
--
-- `undo_operation_routing.sql` already asserts these properties over *every*
-- registered handler, so these repeat them over this slice's two by name. That is
-- deliberate: the generic file's assertions are counted against a set it derives
-- from the registry, so a handler that was never registered would satisfy all of
-- them vacuously.

reset role;

select is(
  (
    select count(*)::integer
    from unnest(array[
      'undo_apply_task_command_fields',
      'undo_apply_task_command_relation'
    ]) as handler(name)
    where to_regprocedure('private.' || quote_ident(handler.name) || '(uuid, uuid)') is null
  ),
  0,
  'both handlers resolve at exactly the (uuid, uuid) signature the router routes through'
);

-- SECURITY INVOKER, by omitting the clause. Reached only through the definer
-- router they run with its privileges, so behaviour is identical - but a future
-- migration granting one by mistake would then meet the table grants it lacks
-- instead of gaining a cross-tenant write. Pinned to two rather than to "zero
-- definers", which zero resolved handlers would also satisfy.
select is(
  (
    select count(*)::integer
    from unnest(array[
      'undo_apply_task_command_fields',
      'undo_apply_task_command_relation'
    ]) as handler(name)
    join pg_proc procedure
      on procedure.oid = to_regprocedure(
        'private.' || quote_ident(handler.name) || '(uuid, uuid)'
      )::oid
    where not procedure.prosecdef
  ),
  2,
  'and both are SECURITY INVOKER, so an accidental grant could never become a cross-tenant write'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'undo_apply_task_command_fields',
      'undo_apply_task_command_relation'
    ]) as handler(name)
    join pg_proc procedure
      on procedure.oid = to_regprocedure(
        'private.' || quote_ident(handler.name) || '(uuid, uuid)'
      )::oid
    where 'search_path=""' = any(coalesce(procedure.proconfig, array[]::text[]))
  ),
  2,
  'and both pin an empty search_path, so every object they touch is schema-qualified'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'undo_apply_task_command_fields',
      'undo_apply_task_command_relation'
    ]) as handler(name)
    cross join unnest(array['public', 'anon', 'authenticated', 'service_role']) as grantee(role_name)
    where has_function_privilege(
      grantee.role_name,
      ('private.' || quote_ident(handler.name) || '(uuid, uuid)')::regprocedure,
      'execute'
    )
  ),
  0,
  'and neither is callable by any of the four roles: compensation is reachable only through the definer router'
);

-- Registering is structurally mandatory - `undo_operations_registered_handler`
-- refuses an insert naming an unregistered action_type, so without these rows the
-- RPC's reservation could never land. Both action_types are asserted by name
-- because one RPC records two of them, chosen from the taxonomy's undoStrategy.
select is(
  (
    select handler_function from private.undo_operation_handlers
    where action_type = 'apply_task_command'
  ),
  'undo_apply_task_command_fields',
  'the nine column actions route to the field-restoring handler'
);

select is(
  (
    select handler_function from private.undo_operation_handlers
    where action_type = 'apply_task_command_relation'
  ),
  'undo_apply_task_command_relation',
  'and the four relation actions route to the relation-removing one'
);

-- The audit trigger's own posture, which the slice changed the body of and must
-- not have changed the shape of. It has to stay SECURITY INVOKER: `authenticated`
-- retains its `audit_logs` INSERT grant (`202607170016:194-196` revoked only UPDATE
-- and DELETE), and that grant is what keeps a plain client-side task UPDATE working
-- at all - the very first assertions in this file.
select is(
  (select prosecdef from pg_proc where oid = 'public.audit_task_change()'::regprocedure),
  false,
  'audit_task_change is still SECURITY INVOKER, so a client-side UPDATE still audits under its own grants'
);

-- The trigger definition itself is deliberately not recreated: `create or replace
-- function` deploys the watched-column change with zero trigger churn, and an
-- `update of <columns>` list would have to enumerate all seven and would silently
-- stop auditing any column added later.
select has_trigger(
  'public',
  'tasks',
  'tasks_audit_changes',
  'and the trigger it backs is untouched, still firing on every insert or update of a task'
);

select * from finish();
rollback;
