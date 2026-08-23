-- Phase 2R slice 2R.2 -- scope, cancellation and single-consumption undo.
--
-- WHAT THIS SUITE IS FOR, AND WHY IT IS NOT AN APPENDIX TO THE 2R.1 ONE
-- ---------------------------------------------------------------------------
-- `phase_2r_reminder_recurrence.sql` proves what each series command does to the
-- database: detach leaves the rule alone, edit_future moves it from this point,
-- ending destroys no history, and each undo restores. Slice 2R.2 adds two facts
-- that suite does not assert and could not have, because neither is a property
-- of a single command:
--
--   1. `2R-SERIES-006` -- cancelling ONE occurrence is not cancelling the
--      series. That path is Phase 2P's `apply_reminder_command_v1`, not a series
--      command at all, so it sits outside the other suite's subject entirely.
--   2. `2R-SERIES-007` -- the undo is SINGLE-CONSUMPTION. "Undo restores" and
--      "undo cannot be spent twice" are different claims, and only the first was
--      proved. This one presses the button a second time.
--
-- A separate file rather than more assertions in that one: `plan(83)` would have
-- to be renumbered, and a slice's evidence being its own file is what lets the
-- acceptance record point at it.
--
-- WHY THE SECOND PRESS IS THE ASSERTION AND THE FIRST IS ONLY THE CONTROL
-- ---------------------------------------------------------------------------
-- A suite that pressed undo once and read the row back would pass just as
-- readily against a handler that leaves its ledger row open -- which is exactly
-- the defect `2R-UNDO-LEDGER-NOT-CLOSED` names, and exactly how it survived
-- Phase 2P's own tests. So each undo below is pressed TWICE, with the ledger
-- row read in between.
--
-- WHY TWO INHERITED DEFECTS ARE ASSERTED RATHER THAN LEFT UNMENTIONED
-- ---------------------------------------------------------------------------
-- Section 3 asserts that Phase 2P's `undo_apply_reminder_command_v1` does NOT
-- close its ledger row (`2R-UNDO-LEDGER-NOT-CLOSED`), and that cancelling an
-- attached occurrence cannot be reversed at all -- not by that undo and not by
-- the `restore` command, because the replacement already holds the one live slot
-- (`2R-OCCURRENCE-CANCEL-IRREVERSIBLE`). Both are **pinned remainders**, not
-- endorsements: together they are why no control in slice 2R.2 offers an undo
-- through the Phase 2P path and why the cancel confirmation says the occurrence
-- cannot be reactivated before it asks. Pinning them means the day somebody
-- repairs either, this file fails and the closing record has to move with it. A
-- remainder nothing asserts is a remainder that gets absorbed.
--
-- The second one was found by rehearsing this very file against a real database.
-- Its first draft asserted that the undo restores; it does not.
--
-- WHY THERE IS NO `\gset` HERE
-- ---------------------------------------------------------------------------
-- No suite in this directory uses one, so it is an unproven mechanism in this
-- harness, and a slice whose predecessor lost seven CI rounds to mechanisms that
-- worked everywhere except from empty is not the place to try it. Values are
-- derived back out of the database by helper, the way `pg_temp.owned_series()`
-- does in the 2R.1 suite -- which also means every assertion reads the state
-- that is actually stored rather than one this file remembered.
--
-- Written in pure ASCII, following `phase_2r_reminder_recurrence.sql`.

begin;
select plan(26);

set local timezone to 'UTC';

-- Fixtures -------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d2000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'scope-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d2000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'scope-stranger@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- UPDATE, not INSERT: `on_auth_user_created` already wrote the profile row, so
-- an explicit insert collides on `profiles_pkey`.
update public.profiles set timezone = 'America/New_York'
  where user_id = 'd2000001-0000-4000-8000-000000000001';
update public.profiles set timezone = 'America/Sao_Paulo'
  where user_id = 'd2000002-0000-4000-8000-000000000002';

-- Helpers --------------------------------------------------------------------
--
-- All created HERE, before any `set local role`: `authenticated` has no TEMP
-- privilege on the database, so a helper declared after the switch fails on its
-- own CREATE and the failure names the wrong subject.

create function pg_temp.the_series() returns uuid
language sql stable as $$
  select series.id from public.reminder_series as series
  where series.user_id = 'd2000001-0000-4000-8000-000000000001' limit 1;
$$;

create function pg_temp.live_occurrence() returns public.reminders
language sql stable as $$
  select occurrence.* from public.reminders as occurrence
  where occurrence.series_id = pg_temp.the_series()
    and occurrence.detached_at is null
    and occurrence.status = 'scheduled'
  limit 1;
$$;

-- The one section 3 cancels outside the rule. `scheduled` in the predicate, so
-- it names the row that is still armed rather than one an earlier assertion
-- already cancelled.
create function pg_temp.detached_occurrence() returns public.reminders
language sql stable as $$
  select occurrence.* from public.reminders as occurrence
  where occurrence.series_id = pg_temp.the_series()
    and occurrence.detached_at is not null
    and occurrence.status = 'scheduled'
  limit 1;
$$;

/*
 * The four scalars `apply_reminder_command_v1` compares, spelled the way its
 * regex demands.
 *
 * `.US` rather than a truncation to whole seconds: the RPC compares an equality
 * against the stored instant, so dropping a fractional part the row happened to
 * carry would be refused as "stale" and would name the wrong cause. The
 * `+00` suffix is what the pattern accepts and what `to_char(..., 'OF')`
 * produces for UTC.
 */
create function pg_temp.expected_state(p_reminder uuid) returns jsonb
language sql stable as $$
  select pg_catalog.jsonb_build_object(
    'status', occurrence.status,
    'title', occurrence.title,
    'important', occurrence.important,
    'remindAt', pg_catalog.to_char(
      occurrence.remind_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'
    ) || '+00'
  )
  from public.reminders as occurrence where occurrence.id = p_reminder;
$$;

/*
 * The ledger, read from OUTSIDE the client role -- and that is the point.
 *
 * `security definer`, so section 4 can hand the stranger the owner's real undo
 * id. Without it the stranger's own RLS would hide the row, the probe would
 * evaluate to NULL, and `undo_operation(null)` raises the SAME "Undo operation
 * not found" the assertion is looking for. The test would pass while proving
 * nothing -- a denial assertion satisfied by an empty result, which is the
 * vacuity `phase_2r_reminder_recurrence.sql` section 6 exists to avoid.
 *
 * This is a probe, not a product path: it lives in `pg_temp` and dies with the
 * transaction.
 */
create function pg_temp.undo_id(p_key text) returns uuid
language sql stable security definer as $$
  select operation.id from public.undo_operations as operation
  where operation.operation_key = p_key;
$$;

create function pg_temp.ledger_status(p_key text) returns text
language sql stable security definer as $$
  select operation.status from public.undo_operations as operation
  where operation.operation_key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Section 1 -- 2R-SERIES-006: cancelling one occurrence (6)
-- ---------------------------------------------------------------------------
--
-- The whole requirement is that the two nouns are different, so every assertion
-- here is about what did NOT happen to the rule.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- The command call is inside the assertion rather than beside it, the shape
-- section 8 of the 2R.1 suite uses: a bare `select` would put a result row into
-- the TAP stream.
select isnt(
  public.create_reminder_series_v1(
    '{"version":1,"frequency":"daily"}'::jsonb, 'Tomar o remedio', false, null,
    (now() at time zone 'America/New_York')::date, 9, 0, 'phase2r2-create-0001'
  ) ->> 'series_id',
  null,
  'the fixture series exists, with one live occurrence to cancel'
);

select is(
  public.apply_reminder_command_v1(
    (pg_temp.live_occurrence()).id,
    '{"kind":"cancel"}'::jsonb,
    pg_temp.expected_state((pg_temp.live_occurrence()).id),
    'phase2r2-cancel-0001'
  ) ->> 'status',
  'cancelled',
  '2R-SERIES-006: the occurrence itself is cancelled'
);

select is(
  (select series.status from public.reminder_series as series
   where series.id = pg_temp.the_series()),
  'active',
  '2R-SERIES-006: and the SERIES is untouched -- still active'
);

select is(
  (select pg_catalog.count(*)::integer from public.reminders as occurrence
   where occurrence.series_id = pg_temp.the_series()
     and occurrence.detached_at is null
     and occurrence.status = 'scheduled'),
  1,
  '2R-SERIES-006: the next occurrence was materialised -- the rule kept going'
);

select ok(
  (pg_temp.live_occurrence()).remind_at > (
    select pg_catalog.max(occurrence.remind_at) from public.reminders as occurrence
    where occurrence.series_id = pg_temp.the_series() and occurrence.status = 'cancelled'
  ),
  'and the replacement is LATER than the one that was cancelled, not a repeat of it'
);

select is(
  (select pg_catalog.count(*)::integer from public.reminders as occurrence
   where occurrence.series_id = pg_temp.the_series()),
  2,
  'cancelling destroyed no history: the cancelled occurrence is still there'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- 2R-SERIES-007: the series undo spends exactly once (7)
-- ---------------------------------------------------------------------------

select isnt(
  public.apply_reminder_series_command_v1(
    pg_temp.the_series(), '{"kind":"detach_occurrence"}'::jsonb, 'phase2r2-detach-0001'
  ) ->> 'undo_id',
  null,
  'a reversible series operation hands back a ledger row -- which is what the surface offers'
);

select is(
  pg_temp.ledger_status('series-cmd-v1:phase2r2-detach-0001'),
  'available',
  'and the row is available before anybody spends it'
);

select is(
  public.undo_operation(pg_temp.undo_id('series-cmd-v1:phase2r2-detach-0001')) ->> 'scope',
  'occurrence',
  'the first press compensates, and reports the scope it compensated'
);

-- THE ASSERTION THIS SUITE EXISTS FOR. A handler that restores correctly and
-- leaves this 'available' passes every "undo restores" test ever written.
select is(
  pg_temp.ledger_status('series-cmd-v1:phase2r2-detach-0001'),
  'undone',
  '2R-SERIES-007: the handler CLOSED its ledger row'
);

select is(
  (public.undo_operation(pg_temp.undo_id('series-cmd-v1:phase2r2-detach-0001'))
    ->> 'idempotent')::boolean,
  true,
  'so a second press reaches the router idempotent branch instead of compensating again'
);

select is(
  (public.undo_operation(pg_temp.undo_id('series-cmd-v1:phase2r2-detach-0001'))
    ->> 'affected')::integer,
  0,
  'and it changes nothing -- affected is zero, not one'
);

select is(
  (select pg_catalog.count(*)::integer from public.reminders as occurrence
   where occurrence.series_id = pg_temp.the_series()
     and occurrence.detached_at is not null),
  0,
  'the state after three presses is the state after one: the detach is reversed exactly once'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- two inherited defects, both pinned (8)
-- ---------------------------------------------------------------------------
--
-- `2R-OCCURRENCE-CANCEL-IRREVERSIBLE` -- found by rehearsing this file.
--
-- Cancelling an ATTACHED occurrence fires the materialisation trigger, and the
-- replacement takes the one live slot
-- `reminders_one_live_occurrence_per_series` permits. Restoring the cancelled
-- row would be a SECOND live occurrence, so the index refuses it -- and it
-- refuses the ledger undo and the `restore` command alike, with a bare `23505`
-- neither `outcomes.ts` nor any caller was declaring. Cancelling one occurrence
-- of a live series is therefore IRREVERSIBLE in practice.
--
-- The first draft of this suite asserted that this undo restores. It does not,
-- and rehearsing the file against a real database is what said so.
--
-- Slice 2R.2's answer is code-only and in three parts: the surface withholds
-- `restore` on exactly this shape, the confirmation says the occurrence cannot
-- be reactivated before it asks (`2R-SERIES-008`), and `23505` on this
-- constraint is mapped to a sentence rather than reported as a mystery. Making
-- the reversal actually work means standing the replacement down in the same
-- transaction, which is DDL on a deployed function -- a second migration, which
-- this phase has not allocated.
--
-- `2R-UNDO-LEDGER-NOT-CLOSED` -- the older one, and the last two assertions.
--
-- Phase 2P's `undo_apply_reminder_command_v1` restores the four scalars and
-- never touches `public.undo_operations.status`, so its row stays spendable for
-- the full 24 hours. It is asserted on the DETACHED occurrence, because that is
-- the case where the undo actually succeeds -- which is what makes "and the row
-- is still available" a statement about the handler rather than about a write
-- that never happened.
--
-- WHEN EITHER IS REPAIRED THE MATCHING ASSERTION IS THE ONE TO INVERT, and the
-- closing record's remainder list moves with it. That is the point of pinning
-- them rather than leaving them unmentioned.

select isnt(
  public.apply_reminder_command_v1(
    (pg_temp.live_occurrence()).id,
    '{"kind":"cancel"}'::jsonb,
    pg_temp.expected_state((pg_temp.live_occurrence()).id),
    'phase2r2-cancel-0002'
  ) ->> 'undo_id',
  null,
  'the Phase 2P command records a ledger row for an occurrence, exactly as it always did'
);

select throws_ok(
  $$select public.undo_operation(
      (select operation.id from public.undo_operations as operation
       where operation.operation_key = 'reminder-v1:phase2r2-cancel-0002'))$$,
  '23505',
  'duplicate key value violates unique constraint "reminders_one_live_occurrence_per_series"',
  'REMAINDER 2R-OCCURRENCE-CANCEL-IRREVERSIBLE: the undo cannot restore it -- the replacement holds the slot'
);

select throws_ok(
  $$select public.apply_reminder_command_v1(
      (select occurrence.id from public.reminders as occurrence
       where occurrence.status = 'cancelled' and occurrence.detached_at is null
       order by occurrence.remind_at limit 1),
      '{"kind":"restore"}'::jsonb,
      (select pg_catalog.jsonb_build_object(
         'status', occurrence.status, 'title', occurrence.title,
         'important', occurrence.important,
         'remindAt', pg_catalog.to_char(
           occurrence.remind_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00')
       from public.reminders as occurrence
       where occurrence.status = 'cancelled' and occurrence.detached_at is null
       order by occurrence.remind_at limit 1),
      'phase2r2-restore-0001')$$,
  '23505',
  'duplicate key value violates unique constraint "reminders_one_live_occurrence_per_series"',
  'and neither can the restore command -- so the surface must not offer either'
);

select is(
  pg_temp.ledger_status('reminder-v1:phase2r2-cancel-0002'),
  'available',
  'the refused undo spent nothing, so the row is exactly as it was'
);

-- The detached case: the materialisation trigger skips a detached row, so no
-- replacement is ever created for it and the index has nothing to refuse. The
-- very same handler then succeeds -- which is the two-sided control that keeps
-- the two assertions above from reading as "reminder undo is broken", and which
-- is also the only case where "the row is left open" is a statement about the
-- handler rather than about a write that never happened.
select isnt(
  public.apply_reminder_series_command_v1(
    pg_temp.the_series(), '{"kind":"detach_occurrence"}'::jsonb, 'phase2r2-detach-0002'
  ) ->> 'undo_id',
  null,
  'a second occurrence is detached, to be cancelled outside the rule'
);

select is(
  public.apply_reminder_command_v1(
    (pg_temp.detached_occurrence()).id,
    '{"kind":"cancel"}'::jsonb,
    pg_temp.expected_state((pg_temp.detached_occurrence()).id),
    'phase2r2-det-cancel-01'
  ) ->> 'status',
  'cancelled',
  'cancelling a detached occurrence materialises nothing, so the live slot stays free'
);

select is(
  public.undo_operation(pg_temp.undo_id('reminder-v1:phase2r2-det-cancel-01'))
    ->> 'restored_status',
  'scheduled',
  'and there the SAME Phase 2P handler restores -- the failure above is narrow, not general'
);

select is(
  pg_temp.ledger_status('reminder-v1:phase2r2-det-cancel-01'),
  'available',
  'REMAINDER 2R-UNDO-LEDGER-NOT-CLOSED: but even on success it leaves the row OPEN'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the owner boundary, from the stranger side (5)
-- ---------------------------------------------------------------------------
--
-- "A stranger cannot spend this" is satisfiable by a row that does not exist, so
-- the owner row is proved present and unspent first.

select is(
  public.apply_reminder_series_command_v1(
    pg_temp.the_series(), '{"kind":"end_series"}'::jsonb, 'phase2r2-end-00000001'
  ) ->> 'scope',
  'series',
  'the owner ends the series through the command boundary'
);

select is(
  pg_temp.ledger_status('series-cmd-v1:phase2r2-end-00000001'),
  'available',
  'and its ledger row provably exists, unspent, before the stranger probes it'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d2000002-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  pg_catalog.format(
    'select public.undo_operation(%L::uuid)',
    pg_temp.undo_id('series-cmd-v1:phase2r2-end-00000001')
  ),
  'P0002',
  'Undo operation not found',
  '2R-TRUST: a stranger cannot spend the owner undo -- and is not told it exists'
);

select throws_ok(
  pg_catalog.format(
    'select public.apply_reminder_series_command_v1(%L::uuid, ''{"kind":"end_series"}''::jsonb, ''phase2r2-stranger-01'')',
    pg_temp.the_series()
  ),
  -- `P0002`, not `22023`.
  --
  -- The command's other refusals are validation ones and carry `22023`, so this
  -- assertion was written with that code and rehearsing the file is what said
  -- otherwise: "not found" is the *existence* refusal and shares its SQLSTATE
  -- with `undo_operation`'s, which is the right pairing: the two say the same
  -- thing to a stranger, and they should not be told apart by a code either.
  'P0002',
  'Series not found',
  'nor reach the series itself through the command boundary'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d2000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  pg_temp.ledger_status('series-cmd-v1:phase2r2-end-00000001'),
  'available',
  'and the refused attempt spent nothing: the owner row is still theirs to use'
);

select * from finish();
rollback;
