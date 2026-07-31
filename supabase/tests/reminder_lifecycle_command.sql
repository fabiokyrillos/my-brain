-- Slice G5 — the reminder lifecycle command boundary (UX-12, DEC-6 option A,
-- DEC-7 option a), migration 202607310064.
--
-- The migration's own post-deploy block asserts the catalog state once, at apply
-- time. This suite asserts it again from an empty database on every CI run, and
-- then does the things a catalog read cannot: it exercises every allowed
-- transition, every refused one, the ownership boundary from a *second* owner's
-- point of view, the idempotency ledger in both directions, and the
-- authenticated direct-write denial that makes the RPC the only way in.
--
-- WHY THE DENIAL ASSERTIONS ARE NOT VACUOUS
-- ---------------------------------------------------------------------------
-- `update public.reminders` failing as `authenticated` proves nothing on its
-- own — it fails just as readily if the fixture row does not exist or belongs to
-- someone else. Section 8 therefore proves the row is *visible* to that same
-- role in that same transaction first (SELECT succeeds, returns the row), so the
-- only remaining explanation for the write refusal is the missing privilege.
--
-- WHY THERE ARE TWO OWNERS
-- ---------------------------------------------------------------------------
-- Section 5's "foreign reminder is indistinguishable from a missing one" claim
-- is satisfiable by an empty database unless the foreign row provably exists.
-- The stranger's reminder is inserted and asserted present before it is probed.
--
-- Written in pure ASCII, following the doctrine of
-- `phase_2e_task_command_matching.sql`.

begin;
select plan(52);

set local timezone to 'UTC';

-- Fixtures -------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c5000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'reminder-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c5000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'reminder-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- A task, so the task-linked refusal in section 4 has a real link to refuse on
-- rather than a hand-set column.
insert into public.tasks (id, user_id, title, status) values
  ('c5100001-0000-4000-8000-000000000001', 'c5000001-0000-4000-8000-000000000001',
   'Task owning a derived reminder', 'todo');

insert into public.reminders (id, user_id, task_id, title, remind_at, important, status) values
  -- 1: independent, scheduled -- the row most commands run against.
  ('c5200001-0000-4000-8000-000000000001', 'c5000001-0000-4000-8000-000000000001',
   null, 'Independent scheduled reminder', '2026-12-01T09:00:00+00:00', false, 'scheduled'),
  -- 2: independent, cancelled -- restore's only legal source state.
  ('c5200002-0000-4000-8000-000000000002', 'c5000001-0000-4000-8000-000000000001',
   null, 'Independent cancelled reminder', '2026-12-02T09:00:00+00:00', false, 'cancelled'),
  -- 3: independent, sent -- terminal, because its dedupe key is spent.
  ('c5200003-0000-4000-8000-000000000003', 'c5000001-0000-4000-8000-000000000001',
   null, 'Independent sent reminder', '2026-01-02T09:00:00+00:00', false, 'sent'),
  -- 4: task-linked, scheduled -- editable? no. Reschedulable? yes.
  ('c5200004-0000-4000-8000-000000000004', 'c5000001-0000-4000-8000-000000000001',
   'c5100001-0000-4000-8000-000000000001', 'Task-derived reminder',
   '2026-12-03T09:00:00+00:00', false, 'scheduled'),
  -- 5: the stranger's row, which must be indistinguishable from nonexistent.
  ('c5200005-0000-4000-8000-000000000005', 'c5000002-0000-4000-8000-000000000002',
   null, 'Stranger reminder', '2026-12-04T09:00:00+00:00', false, 'scheduled'),
  -- 6: independent, scheduled -- reserved for the idempotency section, so a
  -- replay assertion can never be satisfied by another section's leftovers.
  ('c5200006-0000-4000-8000-000000000006', 'c5000001-0000-4000-8000-000000000001',
   null, 'Idempotency subject', '2026-12-05T09:00:00+00:00', false, 'scheduled'),
  -- 7: independent, scheduled -- reserved for the undo section.
  ('c5200007-0000-4000-8000-000000000007', 'c5000001-0000-4000-8000-000000000001',
   null, 'Undo subject', '2026-12-06T09:00:00+00:00', true, 'scheduled');

-- The expected pre-state a caller echoes back. Built from the live row so the
-- happy-path assertions never encode a stale literal, and exposed as a helper so
-- the staleness test can deliberately pass a wrong one and mean it.
create function pg_temp.expected_state(p_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'status', reminder.status,
    'remindAt', to_char(reminder.remind_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'title', reminder.title,
    'important', reminder.important
  )
  from public.reminders as reminder
  where reminder.id = p_id;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"c5000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ---------------------------------------------------------------------------
-- Section 1 -- the grant posture this slice promised not to move (6)
-- ---------------------------------------------------------------------------
--
-- DEC-6 authorized the RPC *on condition* that Phase 2F's revocation survives.
-- These six assertions are the executable form of that condition.

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'update'),
  'authenticated still holds no UPDATE on public.reminders after Slice G5'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'delete'),
  'authenticated still holds no DELETE on public.reminders after Slice G5'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'select'),
  'authenticated keeps SELECT on public.reminders'
);
select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'insert'),
  'authenticated keeps INSERT on public.reminders, the Option C exception'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.reminders', 'select'),
  'anon still holds nothing on public.reminders'
);
select policies_are(
  'public',
  'reminders',
  array[
    'reminders_select_own', 'reminders_insert_own',
    'reminders_update_own', 'reminders_delete_own'
  ],
  'the four owner-scoped reminder policies are unchanged by Slice G5'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the RPC's own contract (5)
-- ---------------------------------------------------------------------------

select has_function(
  'public', 'apply_reminder_command_v1',
  array['uuid', 'jsonb', 'jsonb', 'text'],
  'public.apply_reminder_command_v1(uuid, jsonb, jsonb, text) exists'
);

select ok(
  (select procedure.prosecdef
   from pg_catalog.pg_proc as procedure
   join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'public' and procedure.proname = 'apply_reminder_command_v1'),
  'apply_reminder_command_v1 is SECURITY DEFINER'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    cross join unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
    where namespace.nspname = 'public'
      and procedure.proname = 'apply_reminder_command_v1'
      and lower(setting.value) in ('search_path=', 'search_path=""')
  ),
  'apply_reminder_command_v1 pins an empty search_path'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.apply_reminder_command_v1(uuid, jsonb, jsonb, text)', 'execute'),
  'authenticated may execute the reminder command boundary'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.apply_reminder_command_v1(uuid, jsonb, jsonb, text)', 'execute'),
  'anon may not execute the reminder command boundary'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- every allowed transition (12)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c5000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- snooze: remind_at moves forward, status stays scheduled, and -- the DEC-7
-- invariant -- the dormant literal is not written.
select is(
  public.apply_reminder_command_v1(
    'c5200001-0000-4000-8000-000000000001',
    '{"kind":"snooze","snoozeMinutes":60}'::jsonb,
    pg_temp.expected_state('c5200001-0000-4000-8000-000000000001'),
    'g5-snooze-000001'
  ) ->> 'status',
  'scheduled',
  'snooze leaves the reminder scheduled'
);
select ok(
  (select reminder.remind_at > now() + interval '55 minutes'
     and reminder.remind_at < now() + interval '65 minutes'
   from public.reminders as reminder
   where reminder.id = 'c5200001-0000-4000-8000-000000000001'),
  'snooze moved remind_at to roughly now() + 60 minutes'
);
select is(
  (select reminder.snoozed_until
   from public.reminders as reminder
   where reminder.id = 'c5200001-0000-4000-8000-000000000001'),
  null::timestamptz,
  'snooze leaves snoozed_until null -- the dormant column is not decorated (DEC-7)'
);

-- reschedule: an explicit absolute instant.
select is(
  public.apply_reminder_command_v1(
    'c5200001-0000-4000-8000-000000000001',
    '{"kind":"reschedule","remindAt":"2026-12-20T18:30:00+00:00"}'::jsonb,
    pg_temp.expected_state('c5200001-0000-4000-8000-000000000001'),
    'g5-reschedule-000001'
  ) ->> 'status',
  'scheduled',
  'reschedule leaves the reminder scheduled'
);
select is(
  (select reminder.remind_at
   from public.reminders as reminder
   where reminder.id = 'c5200001-0000-4000-8000-000000000001'),
  '2026-12-20T18:30:00+00:00'::timestamptz,
  'reschedule wrote the exact requested instant'
);

-- cancel.
select is(
  public.apply_reminder_command_v1(
    'c5200001-0000-4000-8000-000000000001',
    '{"kind":"cancel"}'::jsonb,
    pg_temp.expected_state('c5200001-0000-4000-8000-000000000001'),
    'g5-cancel-000001'
  ) ->> 'status',
  'cancelled',
  'cancel moves a scheduled reminder to cancelled'
);

-- restore, from the only legal source state, keeping remind_at verbatim.
select is(
  public.apply_reminder_command_v1(
    'c5200002-0000-4000-8000-000000000002',
    '{"kind":"restore"}'::jsonb,
    pg_temp.expected_state('c5200002-0000-4000-8000-000000000002'),
    'g5-restore-000001'
  ) ->> 'status',
  'scheduled',
  'restore moves a cancelled reminder back to scheduled'
);
select is(
  (select reminder.remind_at
   from public.reminders as reminder
   where reminder.id = 'c5200002-0000-4000-8000-000000000002'),
  '2026-12-02T09:00:00+00:00'::timestamptz,
  'restore keeps the recorded remind_at verbatim, per the 202607260058 precedent'
);

-- edit, on an independent reminder.
select is(
  public.apply_reminder_command_v1(
    'c5200002-0000-4000-8000-000000000002',
    '{"kind":"edit","title":"Renamed independent reminder","important":true}'::jsonb,
    pg_temp.expected_state('c5200002-0000-4000-8000-000000000002'),
    'g5-edit-000001'
  ) ->> 'title',
  'Renamed independent reminder',
  'edit rewrites the title of an independent reminder'
);
select ok(
  (select reminder.important
   from public.reminders as reminder
   where reminder.id = 'c5200002-0000-4000-8000-000000000002'),
  'edit rewrites importance'
);
select is(
  (select reminder.status
   from public.reminders as reminder
   where reminder.id = 'c5200002-0000-4000-8000-000000000002'),
  'scheduled',
  'edit does not move status'
);

-- A task-linked reminder is still reschedulable: only the *title* is derived.
select is(
  public.apply_reminder_command_v1(
    'c5200004-0000-4000-8000-000000000004',
    '{"kind":"reschedule","remindAt":"2026-12-21T08:00:00+00:00"}'::jsonb,
    pg_temp.expected_state('c5200004-0000-4000-8000-000000000004'),
    'g5-reschedule-linked-01'
  ) ->> 'status',
  'scheduled',
  'a task-linked reminder may still be rescheduled'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- every refusal (11)
-- ---------------------------------------------------------------------------

-- sent is terminal, in all three re-arming directions plus cancel.
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200003-0000-4000-8000-000000000003',
      '{"kind":"snooze","snoozeMinutes":60}'::jsonb,
      pg_temp.expected_state('c5200003-0000-4000-8000-000000000003'),
      'g5-refuse-sent-snooze1')$$,
  '55000',
  null,
  'a sent reminder cannot be snoozed -- its notification dedupe key is spent'
);
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200003-0000-4000-8000-000000000003',
      '{"kind":"reschedule","remindAt":"2026-12-22T08:00:00+00:00"}'::jsonb,
      pg_temp.expected_state('c5200003-0000-4000-8000-000000000003'),
      'g5-refuse-sent-resched1')$$,
  '55000',
  null,
  'a sent reminder cannot be rescheduled'
);
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200003-0000-4000-8000-000000000003',
      '{"kind":"restore"}'::jsonb,
      pg_temp.expected_state('c5200003-0000-4000-8000-000000000003'),
      'g5-refuse-sent-restore1')$$,
  '55000',
  null,
  'a sent reminder cannot be restored -- restore admits cancelled only'
);

-- restore refuses a scheduled row: it is not a no-op, it is a wrong transition.
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200004-0000-4000-8000-000000000004',
      '{"kind":"restore"}'::jsonb,
      pg_temp.expected_state('c5200004-0000-4000-8000-000000000004'),
      'g5-refuse-restore-sched')$$,
  '55000',
  null,
  'restore refuses an already-scheduled reminder'
);

-- edit refuses a task-linked reminder, with its own code, because "the task owns
-- this title" is a different fact from "wrong state".
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200004-0000-4000-8000-000000000004',
      '{"kind":"edit","title":"Hand-written title","important":true}'::jsonb,
      pg_temp.expected_state('c5200004-0000-4000-8000-000000000004'),
      'g5-refuse-edit-linked1')$$,
  '55000',
  null,
  'edit refuses a task-linked reminder, whose title apply_task_command derives'
);

-- Stale pre-state. The row really is scheduled; the caller claims it saw
-- something else, which is exactly the concurrent-heartbeat case.
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200004-0000-4000-8000-000000000004',
      '{"kind":"cancel"}'::jsonb,
      jsonb_build_object(
        'status', 'scheduled',
        'remindAt', '2020-01-01T00:00:00.000000+00',
        'title', 'Task-derived reminder',
        'important', false),
      'g5-refuse-stale-00001')$$,
  '55P03',
  null,
  'a stale expected pre-state is refused with 55P03, never 40001 (2C-UNDO-004)'
);

-- Command-shape refusals.
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200004-0000-4000-8000-000000000004',
      '{"kind":"obliterate"}'::jsonb,
      pg_temp.expected_state('c5200004-0000-4000-8000-000000000004'),
      'g5-refuse-unknown-kind1')$$,
  '22023',
  null,
  'an unnamed command is refused -- the union is closed'
);
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200004-0000-4000-8000-000000000004',
      '{"kind":"cancel","remindAt":"2026-12-22T08:00:00+00:00"}'::jsonb,
      pg_temp.expected_state('c5200004-0000-4000-8000-000000000004'),
      'g5-refuse-smuggled-fld1')$$,
  '22023',
  null,
  'cancel cannot smuggle a field belonging to reschedule'
);
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200004-0000-4000-8000-000000000004',
      '{"kind":"snooze","snoozeMinutes":7}'::jsonb,
      pg_temp.expected_state('c5200004-0000-4000-8000-000000000004'),
      'g5-refuse-bad-preset01')$$,
  '22023',
  null,
  'snooze admits only its closed preset set, not an arbitrary interval'
);
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200004-0000-4000-8000-000000000004',
      '{"kind":"reschedule","remindAt":"2020-01-01T00:00:00+00:00"}'::jsonb,
      pg_temp.expected_state('c5200004-0000-4000-8000-000000000004'),
      'g5-refuse-past-instant1')$$,
  '22023',
  null,
  'reschedule refuses an instant in the past'
);
-- A bare local date-time with no offset is refused rather than silently read in
-- the server's zone -- the DEC-6 "no unsafe browser-supplied offset" rule.
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200004-0000-4000-8000-000000000004',
      '{"kind":"reschedule","remindAt":"2026-12-22T08:00"}'::jsonb,
      pg_temp.expected_state('c5200004-0000-4000-8000-000000000004'),
      'g5-refuse-no-offset001')$$,
  '22023',
  null,
  'reschedule refuses an instant carrying no explicit UTC offset'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- ownership isolation (3)
-- ---------------------------------------------------------------------------

-- Non-vacuity: the stranger's row provably exists before it is probed. Read as
-- the table owner, because the owner-scoped select policy is precisely what
-- hides it from the caller under test.
reset role;
select is(
  (select count(*)::integer
   from public.reminders as reminder
   where reminder.id = 'c5200005-0000-4000-8000-000000000005'),
  1,
  'the stranger reminder exists, so the refusal below is not an empty-table artifact'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c5000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200005-0000-4000-8000-000000000005',
      '{"kind":"cancel"}'::jsonb,
      jsonb_build_object(
        'status', 'scheduled',
        'remindAt', '2026-12-04T09:00:00.000000+00',
        'title', 'Stranger reminder',
        'important', false),
      'g5-refuse-foreign-001')$$,
  'P0002',
  null,
  'a foreign reminder raises P0002 -- ownership is proven in the database'
);
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c52000ff-0000-4000-8000-0000000000ff',
      '{"kind":"cancel"}'::jsonb,
      jsonb_build_object(
        'status', 'scheduled',
        'remindAt', '2026-12-04T09:00:00.000000+00',
        'title', 'Nonexistent',
        'important', false),
      'g5-refuse-missing-001')$$,
  'P0002',
  null,
  'a nonexistent reminder raises the identical P0002 -- existence is not disclosed'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- the operation-key ledger (4)
-- ---------------------------------------------------------------------------

select is(
  public.apply_reminder_command_v1(
    'c5200006-0000-4000-8000-000000000006',
    '{"kind":"cancel"}'::jsonb,
    pg_temp.expected_state('c5200006-0000-4000-8000-000000000006'),
    'g5-idempotency-00001'
  ) ->> 'idempotent',
  'false',
  'the first application of an operation key is not a replay'
);

-- The same key with the same payload replays the recorded result. The expected
-- pre-state is deliberately re-read from the now-cancelled row -- no: it must be
-- byte-identical to the first call, or the fingerprint would differ and this
-- would be testing the mismatch branch instead. So it is pinned as a literal.
select is(
  public.apply_reminder_command_v1(
    'c5200006-0000-4000-8000-000000000006',
    '{"kind":"cancel"}'::jsonb,
    jsonb_build_object(
      'status', 'scheduled',
      'remindAt', '2026-12-05T09:00:00.000000+00',
      'title', 'Idempotency subject',
      'important', false),
    'g5-idempotency-00001'
  ) ->> 'idempotent',
  'true',
  'the same key with the same payload replays deterministically'
);
select is(
  public.apply_reminder_command_v1(
    'c5200006-0000-4000-8000-000000000006',
    '{"kind":"cancel"}'::jsonb,
    jsonb_build_object(
      'status', 'scheduled',
      'remindAt', '2026-12-05T09:00:00.000000+00',
      'title', 'Idempotency subject',
      'important', false),
    'g5-idempotency-00001'
  ) ->> 'status',
  'cancelled',
  'the replay reports the state the operation produced, not a re-read'
);

-- The same key with a different payload is a bug in the caller, not a replay.
select throws_ok(
  $$select public.apply_reminder_command_v1(
      'c5200006-0000-4000-8000-000000000006',
      '{"kind":"restore"}'::jsonb,
      pg_temp.expected_state('c5200006-0000-4000-8000-000000000006'),
      'g5-idempotency-00001')$$,
  'P0001',
  null,
  'the same key with a different payload raises G5_REMINDER_IDEMPOTENCY_MISMATCH'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- audit evidence (3)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer
   from public.audit_logs as entry
   where entry.user_id = 'c5000001-0000-4000-8000-000000000001'
     and entry.entity_type = 'reminder'
     and entry.entity_id = 'c5200001-0000-4000-8000-000000000001'),
  3,
  'the three commands applied to reminder 1 each wrote exactly one audit row'
);
-- Asserted as a set, not as "the newest row". Every insert in this suite lands
-- in one transaction, so `created_at` -- which defaults to `now()`, the
-- transaction timestamp -- is identical across all three and cannot order them.
select is(
  (select array_agg(entry.action_type order by entry.action_type)
   from public.audit_logs as entry
   where entry.entity_id = 'c5200001-0000-4000-8000-000000000001'),
  array['reminder_cancelled', 'reminder_rescheduled', 'reminder_snoozed'],
  'each command wrote its own named action_type, not a generic update'
);
select is(
  (select entry.actor
   from public.audit_logs as entry
   where entry.entity_id = 'c5200001-0000-4000-8000-000000000001'
   limit 1),
  'user',
  'an owner-initiated reminder transition is audited as actor = user'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- the RPC is the only way in (2)
-- ---------------------------------------------------------------------------
--
-- Non-vacuity first: the same role, in the same transaction, can read the row.
-- So the write refusal below can only be the missing privilege.

select is(
  (select count(*)::integer
   from public.reminders as reminder
   where reminder.id = 'c5200007-0000-4000-8000-000000000007'),
  1,
  'authenticated can read its own reminder, so the denial below is the grant'
);
select throws_ok(
  $$update public.reminders set status = 'cancelled'
    where id = 'c5200007-0000-4000-8000-000000000007'$$,
  '42501',
  null,
  'authenticated still cannot UPDATE public.reminders directly'
);

-- ---------------------------------------------------------------------------
-- Section 9 -- the registered compensation handler (4)
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select handlers.handler_function
   from private.undo_operation_handlers as handlers
   where handlers.action_type = 'apply_reminder_command_v1'),
  'undo_apply_reminder_command_v1',
  'the reminder command is registered in the undo handler registry'
);
select has_function(
  'private', 'undo_apply_reminder_command_v1',
  array['uuid', 'uuid'],
  'the registered handler exists at the routed signature'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c5000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Apply, then undo, and prove both scalars came back. The apply is itself an
-- assertion rather than a bare select: a non-TAP line in the middle of a suite
-- is output the harness has to guess about.
select is(
  public.apply_reminder_command_v1(
    'c5200007-0000-4000-8000-000000000007',
    '{"kind":"edit","title":"Temporarily renamed","important":false}'::jsonb,
    pg_temp.expected_state('c5200007-0000-4000-8000-000000000007'),
    'g5-undo-subject-00001'
  ) ->> 'title',
  'Temporarily renamed',
  'the undo subject was edited before it is compensated'
);

select is(
  (public.undo_operation(
     (select operation.id
      from public.undo_operations as operation
      where operation.operation_key = 'reminder-v1:g5-undo-subject-00001')
   ) is not null),
  true,
  'undo_operation routes the reminder command to its registered handler'
);
select is(
  (select reminder.title || '|' || reminder.important::text
   from public.reminders as reminder
   where reminder.id = 'c5200007-0000-4000-8000-000000000007'),
  'Undo subject|true',
  'the handler restored both scalars the edit wrote, not just the title'
);

-- ---------------------------------------------------------------------------
-- Section 10 -- the dormant literal stays dormant (1)
-- ---------------------------------------------------------------------------
--
-- DEC-7's invariant, asserted over everything this suite did: the Phase 2F
-- closeout census counts snoozed rows and must keep counting zero.

reset role;
select is(
  (select count(*)::integer
   from public.reminders as reminder
   where reminder.status = 'snoozed'),
  0,
  'no command in this suite produced a snoozed row (DEC-7, 2F-REMINDER-004)'
);

select * from finish();
rollback;
