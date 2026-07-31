-- Slice G5 — the reminder lifecycle command boundary (UX-12, DEC-6 option A,
-- DEC-7 option a).
--
-- WHAT THIS IS
-- -----------------------------------------------------------------------------
-- One narrow `SECURITY DEFINER` RPC — `public.apply_reminder_command_v1` — that
-- performs the five owner-initiated reminder transitions the owner authorized,
-- plus its registered undo handler. It is the *only* thing this migration adds.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- -----------------------------------------------------------------------------
-- DEC-6 authorized the boundary on the explicit condition that the Phase 2F
-- grant posture survives intact, and DEC-7 narrowed it further. So, by decision
-- and not by omission, this migration does **not**:
--
--   * re-grant `update` or `delete` on `public.reminders` to `authenticated` —
--     `202607300063:92` revokes them and asserts the revocation at deploy time,
--     and that assertion must keep passing after this migration lands;
--   * drop, alter or replace `public.run_user_heartbeat`,
--     `public.apply_task_command`, `public.list_task_command_candidates`,
--     `private.undo_apply_task_command` or `private.undo_create_task_command`;
--   * write `reminders.status = 'snoozed'`, or make any row reachable that
--     carries it. **The literal stays dormant** (2F-REMINDER-004), the Phase 2F
--     closeout census keeps measuring bucket 5 at zero, and the live-set
--     disagreement described below stays inert;
--   * expose a general `update_reminder` JSON patch. Each command admits its own
--     fields and no others, checked by exact key-set equality;
--   * delete anything. No `delete` against `public.reminders` exists anywhere in
--     the repository, and this migration does not become the first.
--
-- WHY SNOOZE MOVES `remind_at` INSTEAD OF SETTING `status = 'snoozed'`
-- -----------------------------------------------------------------------------
-- `reminders.snoozed_until` is read by nothing and written by nothing;
-- `run_user_heartbeat` (`202607170016:508-512`) fires on
-- `status = 'scheduled' and remind_at <= now()` and has no reactivation branch.
-- A row set to `'snoozed'` would therefore never fire again — the Phase 2F
-- closeout says so in an executable assertion
-- (`src/lib/closeout/phase-2f-census.test.ts:152`, *"never fire; no reactivation
-- path exists"*).
--
-- Worse, the two halves of the Phase 2E/2F reminder contract disagree about
-- whether `'snoozed'` is live:
--
--   * `apply_task_command`'s close half (`202607270060:1570`) and
--     `list_task_command_candidates` see `status = 'scheduled'` only;
--   * `private.undo_apply_task_command` (`202607270060:2047`) and
--     `private.undo_create_task_command` (`202607290062:753,767,780`) treat
--     `status in ('scheduled','snoozed')` as the live set.
--
-- That disagreement is harmless *only* because no `'snoozed'` row can exist.
-- Creating the first one would mean completing a task no longer cancels that
-- task's snoozed reminder while the undo handlers still count it — a behaviour
-- change in four bodies this slice is not authorized to touch. So snooze here is
-- a **schedule movement**: `remind_at` moves to a bounded future instant and the
-- row stays `scheduled`, which is the state the delivery engine already honours.
--
-- Snooze and reschedule consequently perform the same physical write. They stay
-- separate product actions, distinguished — as DEC-7 requires — by command kind,
-- by accepted input shape (snooze takes a bounded relative preset from `now()`;
-- reschedule takes an explicit absolute instant), by validation, by audit
-- `action_type`, and by UI affordance. `snoozed_until` is left null: writing it
-- to make a dormant column look used would be decoration, and nothing consumes
-- it.
--
-- WHY `sent` IS TERMINAL
-- -----------------------------------------------------------------------------
-- `run_user_heartbeat` keys delivery on `notifications.dedupe_key =
-- 'reminder:' || reminder.id` and inserts `on conflict … do nothing`. Once a
-- reminder has been delivered that key is spent **for that id, forever**. Moving
-- a `sent` row back to `scheduled` would therefore produce a row that the
-- heartbeat selects, fails to notify for, and immediately re-stamps `sent` — a
-- silent reminder. `202607270060:2038` states this exact property, and it is why
-- `apply_task_command`'s undo restores by close-and-insert rather than by
-- un-cancelling. Re-arming a delivered reminder is a *new* reminder, not a
-- lifecycle transition, so every command here refuses `sent`.
--
-- WHY `edit` IS RESTRICTED TO `task_id is null`
-- -----------------------------------------------------------------------------
-- `apply_task_command`'s insert half copies the **effective task title** into the
-- reminder it arms (`202607270060:1595-1596`), precisely so a rename cannot leave
-- the reminder contradicting the task. An owner edit of a task-linked reminder's
-- title would be silently discarded by the next command on that task. Editing the
-- title of a task-linked reminder is really "rename the task", which
-- `apply_task_command` already offers. So `edit` admits independent reminders
-- only, and the refusal is explicit rather than a surprise.
--
-- IDEMPOTENCY, AND WHY THIS SLICE SHIPS AN UNDO HANDLER
-- -----------------------------------------------------------------------------
-- The repository's operation-key discipline is `public.undo_operations`
-- (`202607230046:135-185`). Since `202607250052:764` a trigger
-- (`undo_operations_registered_handler`) refuses any row whose `action_type` has
-- no registered compensation handler, so *using the ledger requires shipping the
-- handler* — the two are not separable. That is a feature: it means this slice
-- cannot record an operation it could not reverse. `private.undo_apply_reminder
-- _command_v1` is registered below and restores the four scalars the forward path
-- writes, guarded on the state the forward path produced.
--
-- SQL HOUSE RULES OBSERVED HERE (each has cost this repository a CI round)
-- -----------------------------------------------------------------------------
--   * `search_path = ''`, so every reference is schema-qualified.
--   * `coalesce` / `nullif` / `greatest` / `least` are grammar special forms with
--     no `pg_proc` entry: they are written **unqualified**, and `pg_catalog.` in
--     front of one raises `42883` under an empty search_path.
--   * `POSITION(x IN y)` belongs to that same family and is the member this file
--     added to the list, having shipped the mistake once: qualifying it makes the
--     parser read an ordinary call whose argument list is `'x' in y`, and the
--     `42601` it raises names the *variable*, not the construct. Use
--     `pg_catalog.strpos(y, x)`, which is a real function.
--   * a bare `case … then … end` may not appear in an `if` condition (`42601`);
--     parenthesize or hoist.
--   * staleness raises **`55P03`, never `40001`** — 2C-UNDO-004 / migration 050:
--     `40001` makes the gateway hang.
--   * gate conditions use `is distinct from`, not `<>`: `jsonb_typeof` on an
--     absent key is NULL, and a NULL term makes an `or`-chain NULL, which plpgsql
--     treats as false — that is how a gate ships fail-open.

-- ---------------------------------------------------------------------------
-- 1. The command boundary
-- ---------------------------------------------------------------------------

create or replace function public.apply_reminder_command_v1(
  p_reminder_id uuid,
  p_command jsonb,
  p_expected_state jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text;
  internal_operation_key text;

  command_kind text;
  allowed_command_keys text[];
  snooze_minutes integer;
  requested_remind_at timestamptz;
  canonical_remind_at text;
  edited_title text;
  edited_important boolean;

  expected_status text;
  expected_remind_at timestamptz;
  expected_title text;
  expected_important boolean;

  reminder public.reminders%rowtype;
  eligible_statuses text[];
  target_status text;
  target_remind_at timestamptz;
  target_title text;
  target_important boolean;
  audit_action_type text;
  audit_reason text;

  canonical_request jsonb;
  canonical_fingerprint text;
  undo_id uuid;
  existing_operation public.undo_operations%rowtype;
  affected integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null
    or pg_catalog.char_length(normalized_key) not between 8 and 240
  then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  -- Namespaced so a key minted for another command family can never collide
  -- with one minted here. 12 + 240 = 252, inside undo_operations_operation_key
  -- _check's 8..260 bound (`202607170020:82`).
  internal_operation_key := 'reminder-v1:' || normalized_key;

  -- -------------------------------------------------------------------------
  -- Command shape. A closed discriminated union: `kind` selects the exact key
  -- set, and the key set is compared by count *and* by membership, so no
  -- command can smuggle a field belonging to another (DEC-6). This is the
  -- resolve_pending_question_v* shape (`202607230046:67-103`), not a patch.
  -- -------------------------------------------------------------------------
  if pg_catalog.jsonb_typeof(p_command) is distinct from 'object'
    or pg_catalog.octet_length(p_command::text) > 8192
    or not (p_command ? 'kind')
    or pg_catalog.jsonb_typeof(p_command -> 'kind') is distinct from 'string'
  then
    raise exception 'Invalid reminder command' using errcode = '22023';
  end if;

  command_kind := p_command ->> 'kind';

  case command_kind
    when 'snooze' then
      allowed_command_keys := array['kind', 'snoozeMinutes'];
      eligible_statuses := array['scheduled'];
      audit_action_type := 'reminder_snoozed';
      audit_reason := 'Owner postponed a scheduled reminder by a bounded relative preset';
    when 'reschedule' then
      allowed_command_keys := array['kind', 'remindAt'];
      eligible_statuses := array['scheduled'];
      audit_action_type := 'reminder_rescheduled';
      audit_reason := 'Owner moved a scheduled reminder to an explicit absolute instant';
    when 'cancel' then
      allowed_command_keys := array['kind'];
      eligible_statuses := array['scheduled'];
      audit_action_type := 'reminder_cancelled';
      audit_reason := 'Owner cancelled a scheduled reminder through the confirmed lifecycle transition';
    when 'restore' then
      allowed_command_keys := array['kind'];
      eligible_statuses := array['cancelled'];
      audit_action_type := 'reminder_restored';
      audit_reason := 'Owner restored a cancelled reminder to its recorded schedule';
    when 'edit' then
      allowed_command_keys := array['kind', 'title', 'important'];
      eligible_statuses := array['scheduled'];
      audit_action_type := 'reminder_edited';
      audit_reason := 'Owner edited the title or importance of an independent reminder';
    else
      raise exception 'Unsupported reminder command' using errcode = '22023';
  end case;

  -- Exact key-set equality in both directions. A missing required field and an
  -- unsupported extra one are the same refusal, which is what "reject
  -- unsupported fields" has to mean to be enforceable.
  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_object_keys(p_command) as command_key(key)
  ) is distinct from pg_catalog.cardinality(allowed_command_keys)
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_command) as command_key(key)
      where not (command_key.key = any (allowed_command_keys))
    )
  then
    raise exception 'Unsupported reminder command field' using errcode = '22023';
  end if;

  -- -------------------------------------------------------------------------
  -- Per-command value validation. Each branch reads only its own fields.
  -- -------------------------------------------------------------------------
  if command_kind = 'snooze' then
    -- A closed preset set, not a free integer. Relative offsets from `now()`
    -- need no timezone at all, which is why snooze takes this shape rather than
    -- an absolute instant: there is no browser-supplied offset to mistrust.
    if pg_catalog.jsonb_typeof(p_command -> 'snoozeMinutes') is distinct from 'number' then
      raise exception 'Invalid snooze interval' using errcode = '22023';
    end if;
    -- `jsonb_typeof` says 'number' for 60.5 too, and `'60.5'::integer` would
    -- surface a raw 22P02 to the product instead of this validated refusal.
    begin
      snooze_minutes := (p_command ->> 'snoozeMinutes')::integer;
    exception when others then
      raise exception 'Invalid snooze interval' using errcode = '22023';
    end;
    if snooze_minutes is null
      or not (snooze_minutes = any (array[15, 60, 180, 1440, 10080]))
    then
      raise exception 'Invalid snooze interval' using errcode = '22023';
    end if;
  elsif command_kind = 'reschedule' then
    -- An explicit-offset instant, exactly the shape
    -- `localDateTimeToOffsetInstant` produces from the profile timezone
    -- (`src/features/tasks/candidate-due-date.ts:29`). A bare local string is
    -- refused here rather than silently read in the server's zone.
    if pg_catalog.jsonb_typeof(p_command -> 'remindAt') is distinct from 'string'
      -- The offset's minute part is optional because the two producers disagree
      -- harmlessly: `localDateTimeToOffsetInstant` emits `+HH:MM`, while
      -- `to_char(..., 'OF')` -- which is what this function itself hands back --
      -- emits a bare `+HH` on a whole-hour offset. Both are valid ISO-8601 and
      -- both parse to the same instant.
      or (p_command ->> 'remindAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}(:[0-9]{2})?)$'
    then
      raise exception 'Invalid reminder instant' using errcode = '22023';
    end if;
    begin
      requested_remind_at := (p_command ->> 'remindAt')::timestamptz;
    exception when others then
      raise exception 'Invalid reminder instant' using errcode = '22023';
    end;
    if requested_remind_at is null
      or requested_remind_at <= pg_catalog.now()
      or requested_remind_at > pg_catalog.now() + interval '366 days'
    then
      raise exception 'Invalid reminder instant' using errcode = '22023';
    end if;
  elsif command_kind = 'edit' then
    if pg_catalog.jsonb_typeof(p_command -> 'title') is distinct from 'string'
      or pg_catalog.jsonb_typeof(p_command -> 'important') is distinct from 'boolean'
    then
      raise exception 'Invalid reminder edit' using errcode = '22023';
    end if;
    edited_title := pg_catalog.btrim(p_command ->> 'title');
    -- The column's own bound (`202607160007:38`), restated so a violation is a
    -- validated refusal instead of a raw 23514 surfacing to the product.
    if edited_title is null
      or pg_catalog.char_length(edited_title) not between 1 and 500
    then
      raise exception 'Invalid reminder edit' using errcode = '22023';
    end if;
    edited_important := (p_command ->> 'important')::boolean;
  end if;

  -- -------------------------------------------------------------------------
  -- Expected pre-state. Common to every command, so it is a parameter rather
  -- than a per-command field — it describes the row the caller was looking at,
  -- not the operation. All four scalars the surface renders are compared, not
  -- `status` alone: guarding one column while a sibling moved is exactly the
  -- hole 2E-UNDO-004 documents (`202607260058:152-163`).
  -- -------------------------------------------------------------------------
  if pg_catalog.jsonb_typeof(p_expected_state) is distinct from 'object'
    or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(p_expected_state) as state_key(key)
    ) is distinct from 4
    or pg_catalog.jsonb_typeof(p_expected_state -> 'status') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_expected_state -> 'title') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_expected_state -> 'important') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(p_expected_state -> 'remindAt') is distinct from 'string'
    or (p_expected_state ->> 'remindAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}(:[0-9]{2})?)$'
  then
    raise exception 'Invalid expected reminder state' using errcode = '22023';
  end if;
  expected_status := p_expected_state ->> 'status';
  expected_title := p_expected_state ->> 'title';
  expected_important := (p_expected_state ->> 'important')::boolean;
  begin
    expected_remind_at := (p_expected_state ->> 'remindAt')::timestamptz;
  exception when others then
    raise exception 'Invalid expected reminder state' using errcode = '22023';
  end;

  -- -------------------------------------------------------------------------
  -- Ownership. Proven in the database against `auth.uid()`, never from a
  -- caller-supplied user id. A reminder belonging to someone else and a
  -- reminder that does not exist raise the identical error, so the RPC cannot
  -- be used to probe for the existence of a foreign row.
  -- -------------------------------------------------------------------------
  select reminder_row.*
  into reminder
  from public.reminders as reminder_row
  where reminder_row.user_id = current_user_id
    and reminder_row.id = p_reminder_id;
  if reminder.id is null then
    raise exception 'Reminder not found' using errcode = 'P0002';
  end if;

  -- Canonical request fingerprint. `jsonb::text` is key-order canonical, so
  -- equal requests always hash identically and a replay is recognisable.
  canonical_request := pg_catalog.jsonb_build_object(
    'reminderId', p_reminder_id,
    'command', p_command,
    'expectedState', p_expected_state
  );
  canonical_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(canonical_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- -------------------------------------------------------------------------
  -- Reserve the owner-scoped operation key before any state write. A failed
  -- command rolls the reservation back atomically, so only successful
  -- operations are replayable. The reservation is also what the
  -- `undo_operations_registered_handler` trigger checks, which is why this
  -- migration must register a handler further down.
  -- -------------------------------------------------------------------------
  insert into public.undo_operations (
    user_id,
    action_type,
    entity_type,
    entity_ids,
    before_state,
    after_state,
    operation_key,
    request_fingerprint
  ) values (
    current_user_id,
    'apply_reminder_command_v1',
    'reminder',
    array[reminder.id],
    pg_catalog.jsonb_build_object(
      'reminder_id', reminder.id,
      'status', reminder.status,
      'remind_at', pg_catalog.to_char(reminder.remind_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
      'title', reminder.title,
      'important', reminder.important
    ),
    pg_catalog.jsonb_build_object(
      'reminder_id', reminder.id,
      'command_kind', command_kind,
      'request_fingerprint', canonical_fingerprint
    ),
    internal_operation_key,
    canonical_fingerprint
  )
  on conflict (user_id, operation_key) where operation_key is not null
  do nothing
  returning id into undo_id;

  if undo_id is null then
    select operation_row.*
    into existing_operation
    from public.undo_operations as operation_row
    where operation_row.user_id = current_user_id
      and operation_row.operation_key = internal_operation_key
    for update;
    if existing_operation.id is null
      or existing_operation.request_fingerprint is distinct from canonical_fingerprint
    then
      raise exception 'Operation key payload mismatch'
        using errcode = 'P0001', detail = 'G5_REMINDER_IDEMPOTENCY_MISMATCH';
    end if;
    -- Deterministic replay from the recorded result. The row is *not* re-read:
    -- a later legitimate change must not make a replay report a state this
    -- operation never produced.
    return pg_catalog.jsonb_build_object(
      'reminder_id', existing_operation.entity_ids[1],
      'command', existing_operation.after_state ->> 'command_kind',
      'status', existing_operation.after_state ->> 'applied_status',
      'remind_at', existing_operation.after_state ->> 'applied_remind_at',
      'title', existing_operation.after_state ->> 'applied_title',
      'important', (existing_operation.after_state ->> 'applied_important')::boolean,
      'undo_id', existing_operation.id,
      'idempotent', true
    );
  end if;

  -- -------------------------------------------------------------------------
  -- Re-read under a row lock. The pre-reservation read was unlocked, so the
  -- authoritative transition and staleness checks happen here. The heartbeat
  -- flips `scheduled` to `sent` on an hourly cron tick with no user act, so
  -- this window is real, not theoretical.
  -- -------------------------------------------------------------------------
  select reminder_row.*
  into reminder
  from public.reminders as reminder_row
  where reminder_row.user_id = current_user_id
    and reminder_row.id = p_reminder_id
  for update;
  if reminder.id is null then
    raise exception 'Reminder not found' using errcode = 'P0002';
  end if;

  -- Staleness before legality: if the row moved under the caller, the honest
  -- answer is "your view is out of date", not "that transition is illegal".
  if reminder.status is distinct from expected_status
    or reminder.remind_at is distinct from expected_remind_at
    or reminder.title is distinct from expected_title
    or reminder.important is distinct from expected_important
  then
    raise exception 'Reminder changed since it was read'
      using errcode = '55P03', detail = 'G5_REMINDER_STALE_STATE';
  end if;

  if not (reminder.status = any (eligible_statuses)) then
    raise exception 'Reminder transition is not allowed from this state'
      using errcode = '55000', detail = 'G5_REMINDER_TRANSITION_NOT_ALLOWED';
  end if;

  -- `edit` is the one command whose eligibility depends on a column other than
  -- `status`. Refused explicitly, with its own code, because "you cannot rename
  -- a reminder the task owns" is a different fact from "wrong state".
  if command_kind = 'edit' and reminder.task_id is not null then
    raise exception 'Reminder title is derived from its task'
      using errcode = '55000', detail = 'G5_REMINDER_EDIT_TASK_LINKED';
  end if;

  -- -------------------------------------------------------------------------
  -- Resolve the target row. Every command writes the same four columns, each
  -- defaulting to the value it already has, so a command can only move what it
  -- names.
  -- -------------------------------------------------------------------------
  target_status := reminder.status;
  target_remind_at := reminder.remind_at;
  target_title := reminder.title;
  target_important := reminder.important;

  if command_kind = 'snooze' then
    target_remind_at := pg_catalog.now() + pg_catalog.make_interval(mins => snooze_minutes);
  elsif command_kind = 'reschedule' then
    target_remind_at := requested_remind_at;
  elsif command_kind = 'cancel' then
    target_status := 'cancelled';
  elsif command_kind = 'restore' then
    -- `remind_at` is restored verbatim, past or not. That is the precedent
    -- `202607260058:141-150` sets deliberately for reminder restoration: a
    -- past-due `scheduled` reminder firing on the next tick is the state that
    -- existed. Unlike the `sent` case, this row's dedupe key was never spent,
    -- so it genuinely fires. A different time afterwards is a reschedule — an
    -- explicit second act, not a field smuggled into restore.
    target_status := 'scheduled';
  elsif command_kind = 'edit' then
    target_title := edited_title;
    target_important := edited_important;
  end if;

  canonical_remind_at := pg_catalog.to_char(target_remind_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF');

  -- The UPDATE re-states the pre-state in its WHERE clause. Redundant under the
  -- row lock and kept anyway: it makes the `affected <> 1` check below able to
  -- fail, which is the only thing that makes it evidence rather than decoration.
  update public.reminders
  set
    status = target_status,
    remind_at = target_remind_at,
    title = target_title,
    important = target_important
  where user_id = current_user_id
    and id = reminder.id
    and status = reminder.status
    and remind_at = reminder.remind_at
    and title = reminder.title
    and important = reminder.important;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Reminder transition failed'
      using errcode = 'P0001', detail = 'G5_REMINDER_TRANSITION_INTEGRITY';
  end if;

  -- Record what the command actually produced, so the undo handler can guard on
  -- it and a replay can report it without re-reading a row that may have moved
  -- since (`2E-UNDO-004`, same reasoning).
  update public.undo_operations
  set after_state = after_state || pg_catalog.jsonb_build_object(
    'applied_status', target_status,
    'applied_remind_at', canonical_remind_at,
    'applied_title', target_title,
    'applied_important', target_important
  )
  where id = undo_id and user_id = current_user_id;

  -- -------------------------------------------------------------------------
  -- Audit. `entity_type = 'reminder'` — `public.audit_logs.entity_type` carries
  -- no CHECK (`202607160003:132`), and `'reminder'` is already the vocabulary
  -- the rest of the schema uses for this entity. `reason` is English prose and
  -- is never rendered: Slice G4 derives localized History text from
  -- `action_type`/`entity_type` (UX-28).
  -- -------------------------------------------------------------------------
  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    before_state,
    after_state,
    reason
  ) values (
    current_user_id,
    audit_action_type,
    'reminder',
    reminder.id,
    'user',
    pg_catalog.jsonb_build_object(
      'status', reminder.status,
      'remind_at', pg_catalog.to_char(reminder.remind_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
      'title', reminder.title,
      'important', reminder.important
    ),
    pg_catalog.jsonb_build_object(
      'status', target_status,
      'remind_at', canonical_remind_at,
      'title', target_title,
      'important', target_important,
      'request_fingerprint', canonical_fingerprint
    ),
    audit_reason
  );

  return pg_catalog.jsonb_build_object(
    'reminder_id', reminder.id,
    'command', command_kind,
    'status', target_status,
    'remind_at', canonical_remind_at,
    'title', target_title,
    'important', target_important,
    'undo_id', undo_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.apply_reminder_command_v1(uuid, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.apply_reminder_command_v1(uuid, jsonb, jsonb, text)
  to authenticated;

comment on function public.apply_reminder_command_v1(uuid, jsonb, jsonb, text) is
  'Slice G5 (UX-12, DEC-6 option A, DEC-7 option a): the single owner-initiated reminder lifecycle boundary. Five named commands — snooze, reschedule, cancel, restore, edit — each admitting only its own fields by exact key-set equality, over a row whose ownership is proven against auth.uid() inside the database. Snooze is a bounded relative movement of remind_at with status left scheduled; the dormant snoozed literal is never written (DEC-7). sent is terminal because its notification dedupe key is spent. edit admits task_id is null only, because apply_task_command derives a task-linked reminder title. Idempotent on (user_id, operation_key), stale-refusing on all four rendered scalars with 55P03, audited, and reversible through the registered private.undo_apply_reminder_command_v1 handler. Adds no grant: authenticated keeps SELECT and INSERT on public.reminders and nothing more.';

-- ---------------------------------------------------------------------------
-- 2. The registered compensation handler
-- ---------------------------------------------------------------------------
--
-- Reached only through the `public.undo_operation` router, which resolves it
-- from `private.undo_operation_handlers`. The router itself is **not** replaced:
-- since `202607250052` adding an operation is one handler plus one registry row
-- (`:19-20`), which is why this migration does not restate a 600-line body it
-- does not change.

create or replace function private.undo_apply_reminder_command_v1(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  reminder public.reminders%rowtype;
  restored_status text;
  restored_remind_at timestamptz;
  restored_title text;
  restored_important boolean;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  -- Every handler refuses an action_type it does not own, so a registry mistake
  -- cannot make one handler compensate another's operation (`202607250052:37-38`).
  if operation.action_type <> 'apply_reminder_command_v1' then
    raise exception 'Unsupported undo operation'
      using errcode = 'P0001', detail = 'G5_REMINDER_UNDO_UNSUPPORTED';
  end if;

  -- Fail closed on the recorded evidence before touching a row. `applied_*` is
  -- written by the forward path only after its own integrity check passed, so
  -- its absence means there is nothing truthful to compensate.
  if pg_catalog.jsonb_typeof(operation.before_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'applied_status')
       is distinct from 'string'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'applied_remind_at')
       is distinct from 'string'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'applied_title')
       is distinct from 'string'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'applied_important')
       is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(operation.before_state -> 'status')
       is distinct from 'string'
    or pg_catalog.cardinality(operation.entity_ids) is distinct from 1
  then
    raise exception 'Reminder undo integrity check failed'
      using errcode = 'P0001', detail = 'G5_REMINDER_UNDO_INTEGRITY';
  end if;

  restored_status := operation.before_state ->> 'status';
  restored_remind_at := (operation.before_state ->> 'remind_at')::timestamptz;
  restored_title := operation.before_state ->> 'title';
  restored_important := (operation.before_state ->> 'important')::boolean;

  select reminder_row.*
  into reminder
  from public.reminders as reminder_row
  where reminder_row.user_id = p_user_id
    and reminder_row.id = operation.entity_ids[1]
  for update;
  if reminder.id is null then
    -- The row is gone. Only a cascade from tasks/entries/auth.users can do that,
    -- and there is nothing left to restore.
    raise exception 'Reminder not found' using errcode = 'P0002';
  end if;

  -- Guarded on all four columns the forward path wrote, against the state it
  -- produced — never on `status` alone. Undo must refuse when a newer change
  -- would be silently discarded (2E-UNDO-004): a snooze followed by an edit,
  -- then an undo of the snooze, leaves `status` untouched, so a status-only
  -- guard would match and the restore would quietly revert the edit too.
  -- The SQLSTATE is `55P03`, never the serialization-failure code 2C-UNDO-004
  -- banned in migration 050 — that one makes the gateway hang until timeout.
  -- Naming it in prose here is safe precisely because the post-deploy guard
  -- greps for the *raise* (`errcode = '…'`) rather than for the bare digits.
  update public.reminders
  set
    status = restored_status,
    remind_at = restored_remind_at,
    title = restored_title,
    important = restored_important
  where user_id = p_user_id
    and id = reminder.id
    and status = (operation.after_state ->> 'applied_status')
    and remind_at = (operation.after_state ->> 'applied_remind_at')::timestamptz
    and title = (operation.after_state ->> 'applied_title')
    and important = (operation.after_state ->> 'applied_important')::boolean;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Reminder changed since the operation was applied'
      using errcode = '55P03', detail = 'G5_REMINDER_UNDO_STALE';
  end if;

  -- `actor = 'system'`: the compensating write is performed by the system
  -- executing a stored operation. The router's own `operation_undone` row
  -- describes who asked for it.
  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason
  ) values (
    p_user_id,
    'reminder_command_undone',
    'reminder',
    reminder.id,
    'system',
    operation.after_state - 'request_fingerprint',
    pg_catalog.jsonb_build_object(
      'status', restored_status,
      'remind_at', operation.before_state ->> 'remind_at',
      'title', restored_title,
      'important', restored_important
    ),
    'Compensating restore of a reminder lifecycle command'
  );

  return pg_catalog.jsonb_build_object(
    'reminder_id', reminder.id,
    'restored_status', restored_status,
    'affected', affected
  );
end;
$$;

revoke all on function private.undo_apply_reminder_command_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

insert into private.undo_operation_handlers (action_type, handler_function, description) values
  ('apply_reminder_command_v1', 'undo_apply_reminder_command_v1',
   'Slice G5 reminder lifecycle: restore the four scalars the command wrote, guarded on the state it produced.')
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- 3. Post-deploy assertions
-- ---------------------------------------------------------------------------
--
-- Fail-closed: each raises and aborts the enclosing transaction, so a successful
-- apply *is* the proof. Written in the Phase 2F idiom, and deliberately
-- re-asserting the grant posture this slice promised not to move — a migration
-- that widened it by accident would otherwise land silently.

do $reminder_lifecycle_post_deploy$
declare
  denied text;
  retained text;
  rls_enabled boolean;
  rls_forced boolean;
  policy_count integer;
  bundle text;
  definition text;
  is_definer boolean;
begin
  -- 1. The Phase 2F revocation survives this migration untouched. This is the
  --    single most important assertion in the file: DEC-6 authorized the RPC
  --    *on condition* that this posture is preserved.
  for denied in select unnest(array['update', 'delete']) loop
    if pg_catalog.has_table_privilege('authenticated', 'public.reminders', denied) then
      raise exception 'authenticated regained % on public.reminders', denied;
    end if;
  end loop;

  -- 2. …and the two privileges the product needs are still there. A revocation
  --    that took SELECT with it would break every reminder surface while every
  --    denial assertion above still passed.
  for retained in select unnest(array['select', 'insert']) loop
    if not pg_catalog.has_table_privilege('authenticated', 'public.reminders', retained) then
      raise exception 'authenticated lost % on public.reminders', retained;
    end if;
  end loop;

  -- 3. `anon` still holds nothing.
  for denied in select unnest(array['select', 'insert', 'update', 'delete']) loop
    if pg_catalog.has_table_privilege('anon', 'public.reminders', denied) then
      raise exception 'anon holds % on public.reminders', denied;
    end if;
  end loop;

  -- 4. RLS is still enabled AND forced. `force` matters independently: without
  --    it the table owner bypasses every policy.
  select class.relrowsecurity, class.relforcerowsecurity
  into strict rls_enabled, rls_forced
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public' and class.relname = 'reminders';
  if not rls_enabled then
    raise exception 'row level security is not enabled on public.reminders';
  end if;
  if not rls_forced then
    raise exception 'row level security is not forced on public.reminders';
  end if;

  -- 5. The four owner-scoped policies still exist, including the two Phase 2F
  --    left present-but-unreachable (owner decision A5). This migration does not
  --    make them reachable: the RPC writes as its owner, not as the caller.
  select pg_catalog.count(*)
  into policy_count
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as class on class.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'reminders'
    and policy.polname in (
      'reminders_select_own', 'reminders_insert_own',
      'reminders_update_own', 'reminders_delete_own'
    );
  if policy_count <> 4 then
    raise exception 'expected the 4 owner-scoped policies on public.reminders, found %', policy_count;
  end if;

  -- 6. The new RPC is SECURITY DEFINER with a pinned empty search_path, and is
  --    executable by `authenticated` and by nobody else who should not have it.
  --    Read from the catalog columns rather than grepped out of
  --    `pg_get_functiondef`, whose rendering of a SET clause is a formatting
  --    detail that has changed across major versions.
  select procedure.prosecdef, pg_catalog.pg_get_functiondef(procedure.oid)
  into strict is_definer, definition
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'apply_reminder_command_v1';
  if not is_definer then
    raise exception 'public.apply_reminder_command_v1 is not security definer';
  end if;
  -- Both spellings are accepted because Postgres has rendered the empty value
  -- either way across versions; `supabase/tests/editable_candidate_confirmation
  -- .sql:42-43` uses the same tolerant pair for the same reason.
  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    cross join pg_catalog.unnest(
      coalesce(procedure.proconfig, array[]::text[])
    ) as setting(value)
    where namespace.nspname = 'public'
      and procedure.proname = 'apply_reminder_command_v1'
      and pg_catalog.lower(setting.value) in ('search_path=', 'search_path=""')
  ) then
    raise exception 'public.apply_reminder_command_v1 does not pin an empty search_path';
  end if;
  if not pg_catalog.has_function_privilege(
    'authenticated', 'public.apply_reminder_command_v1(uuid, jsonb, jsonb, text)', 'execute'
  ) then
    raise exception 'authenticated cannot execute public.apply_reminder_command_v1';
  end if;
  if pg_catalog.has_function_privilege(
    'anon', 'public.apply_reminder_command_v1(uuid, jsonb, jsonb, text)', 'execute'
  ) then
    raise exception 'anon can execute public.apply_reminder_command_v1';
  end if;

  -- 7. The dormant literal stays dormant (DEC-7, 2F-REMINDER-004). Grepping the
  --    function source is the enforceable form of "this slice never writes
  --    'snoozed'": a future edit that reintroduces it fails the deploy.
  if definition ~ '''snoozed''' then
    raise exception 'apply_reminder_command_v1 references the dormant snoozed status';
  end if;

  -- 8. The handler is registered, resolvable at the routed signature, and the
  --    two long-standing source guards still hold across the whole bundle —
  --    which now includes the handler added above, automatically
  --    (`202607250052:594-627`).
  if not exists (
    select 1 from private.undo_operation_handlers
    where action_type = 'apply_reminder_command_v1'
      and handler_function = 'undo_apply_reminder_command_v1'
  ) then
    raise exception 'apply_reminder_command_v1 has no registered undo handler';
  end if;
  if pg_catalog.to_regprocedure('private.undo_apply_reminder_command_v1(uuid, uuid)') is null then
    raise exception 'private.undo_apply_reminder_command_v1(uuid, uuid) does not exist';
  end if;

  bundle := private.undo_operation_definition_bundle();
  --
  -- `pg_catalog.strpos(haystack, needle)`, **not** `position(needle in haystack)`.
  --
  -- `POSITION(x IN y)` is a grammar special form, exactly like COALESCE, NULLIF,
  -- GREATEST and LEAST — the ones the header of this file warns about. Writing
  -- it as `pg_catalog.position('40001' in bundle)` makes the parser read an
  -- ordinary function call, where `'40001' in bundle` is not valid argument
  -- syntax, and the migration fails to apply with `42601` at the *variable* name
  -- rather than at the construct. This file shipped that once and CI caught it
  -- before any deploy. `strpos` is a plain function with a `pg_proc` entry, so
  -- it qualifies cleanly and says the same thing.
  --
  -- 2C-UNDO-004 (ADR-026): the needle is the **raise clause**, assembled below,
  -- and not the bare five characters of the code.
  --
  -- This shipped as the bare number once and failed the deploy, correctly
  -- reporting a bundle that does contain those characters — in prose. The
  -- router's own body discusses the code it stopped raising, so a substring
  -- match flags the documentation of the ban as a violation of it. Every prior
  -- migration in this family (`202607250052:793`, `202607260058:2139`,
  -- `202607260059:3102`, `202607270060:2940`) greps the raise, and the property
  -- being protected is "no handler *raises* it", so this one does too.
  if pg_catalog.strpos(bundle, 'errcode = ''40001''') > 0 then
    raise exception 'undo compensation still raises the gateway-hanging SQLSTATE 40001';
  end if;
  -- …and the conflict signal the ban replaced it with is still there, so this
  -- pair cannot be satisfied by a bundle that simply stopped signalling.
  if pg_catalog.strpos(bundle, '55P03') = 0 then
    raise exception 'undo compensation lost the 55P03 conflict signal';
  end if;
  -- The `greatest`/`least`/`coalesce`/`nullif` special forms cannot resolve
  -- qualified under an empty search_path (shipped three times: 202607220042,
  -- 202607220044, 202607220045). Lowered before matching, as `202607250052:802`
  -- does, so a mixed-case reintroduction cannot slip past.
  if pg_catalog.strpos(pg_catalog.lower(bundle), 'pg_catalog.greatest(') > 0
    or pg_catalog.strpos(pg_catalog.lower(bundle), 'pg_catalog.least(') > 0
  then
    raise exception 'undo compensation reintroduced an unresolvable pg_catalog.greatest/least lookup';
  end if;
end
$reminder_lifecycle_post_deploy$;
