-- Phase 2E Slice 2E.6 - no-match standalone task creation.
--
-- A no-match activity is a public.tasks row, not a new entity type. The three
-- candidate provenance columns stay null and created_by='agent'. Creation is
-- previewed read-only, explicitly confirmed through the shared single-use
-- ledger, reserved through undo_operations before any task lock/write, audited,
-- replay safe, and compensated by cancellation rather than physical deletion.

-- ---------------------------------------------------------------------------
-- Shared confirmation ledger: cancellation has a task subject, creation does not
-- ---------------------------------------------------------------------------

alter table public.task_command_confirmations
  alter column task_id drop not null;

alter table public.task_command_confirmations
  drop constraint task_command_confirmations_action_check;
alter table public.task_command_confirmations
  add constraint task_command_confirmations_action_check
  check (action in ('cancel_task', 'create_task'));

alter table public.task_command_confirmations
  add constraint task_command_confirmations_subject_check
  check (
    (action = 'cancel_task' and task_id is not null)
    or (action = 'create_task' and task_id is null)
  );

comment on table public.task_command_confirmations is
  'Phase 2E server-issued single-use confirmations. Cancellation rows carry a task subject; standalone creation rows deliberately do not. Every row is bound to auth.uid(), the normalized operation key and a server-derived request fingerprint, and no client role may write the ledger.';

-- ---------------------------------------------------------------------------
-- Canonical creation payload and fingerprint
-- ---------------------------------------------------------------------------

create or replace function private.task_command_creation_render_instant(
  p_instant timestamptz
)
returns text
language sql
stable
strict
set search_path = ''
as $$
  select pg_catalog.to_char(
    p_instant at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US'
  ) || 'Z';
$$;

revoke all on function private.task_command_creation_render_instant(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.task_command_creation_payload(
  p_user_id uuid,
  p_action text,
  p_title_words text[],
  p_patch jsonb,
  p_observed_before text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  iso_instant_pattern constant text :=
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$';
  expected_patch_keys text[];
  actual_patch_keys text[];
  canonical_title text;
  observed_at timestamptz;
  due_at timestamptz;
  planned_at timestamptz;
  manual_priority text;
  relation_type text;
  relation_key text;
  relation_reference text;
  relation_id uuid;
  relation_name text;
  person_role text;
begin
  if p_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_action not in (
    'reschedule_due',
    'set_planned',
    'set_priority',
    'assign_project',
    'assign_context',
    'assign_person',
    'set_waiting_on'
  ) then
    raise exception 'Invalid task creation action' using errcode = '22023';
  end if;

  if p_title_words is null
    or pg_catalog.cardinality(p_title_words) not between 1 and 12
    or exists (
      select 1
      from pg_catalog.unnest(p_title_words) as supplied(word)
      where supplied.word is null
        or pg_catalog.btrim(supplied.word) = ''
        or pg_catalog.char_length(pg_catalog.btrim(supplied.word)) > 160
    )
  then
    raise exception 'Invalid task creation title' using errcode = '22023';
  end if;

  select pg_catalog.string_agg(
    pg_catalog.btrim(supplied.word), ' ' order by supplied.ordinality
  )
  into canonical_title
  from pg_catalog.unnest(p_title_words) with ordinality as supplied(word, ordinality);

  if canonical_title is null
    or pg_catalog.char_length(canonical_title) not between 1 and 240
  then
    raise exception 'Invalid task creation title' using errcode = '22023';
  end if;

  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Task creation patch must be an object' using errcode = '22023';
  end if;

  expected_patch_keys := case p_action
    when 'reschedule_due' then array['dueAt']
    when 'set_planned' then array['plannedAt']
    when 'set_priority' then array['priority']
    when 'assign_project' then array['projectRef']
    when 'assign_context' then array['contextRef']
    when 'assign_person' then array['personRef']
    when 'set_waiting_on' then array['personRef']
  end;
  select pg_catalog.array_agg(patch_key order by patch_key)
  into actual_patch_keys
  from pg_catalog.jsonb_object_keys(p_patch) as patch_key;
  if actual_patch_keys is distinct from expected_patch_keys then
    raise exception 'Invalid task creation patch' using errcode = '22023';
  end if;

  if p_observed_before is null or p_observed_before !~ iso_instant_pattern then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end if;
  begin
    observed_at := p_observed_before::timestamptz;
  exception when others then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end;

  if p_action = 'reschedule_due' then
    if pg_catalog.jsonb_typeof(p_patch -> 'dueAt') <> 'string'
      or (p_patch ->> 'dueAt') !~ iso_instant_pattern
    then
      raise exception 'Invalid task creation due date' using errcode = '22023';
    end if;
    begin
      due_at := (p_patch ->> 'dueAt')::timestamptz;
    exception when others then
      raise exception 'Invalid task creation due date' using errcode = '22023';
    end;
  elsif p_action = 'set_planned' then
    if pg_catalog.jsonb_typeof(p_patch -> 'plannedAt') <> 'string'
      or (p_patch ->> 'plannedAt') !~ iso_instant_pattern
    then
      raise exception 'Invalid task creation planned date' using errcode = '22023';
    end if;
    begin
      planned_at := (p_patch ->> 'plannedAt')::timestamptz;
    exception when others then
      raise exception 'Invalid task creation planned date' using errcode = '22023';
    end;
  elsif p_action = 'set_priority' then
    if pg_catalog.jsonb_typeof(p_patch -> 'priority') <> 'string'
      or not ((p_patch ->> 'priority') = any(array['low', 'medium', 'high', 'urgent']))
    then
      raise exception 'Invalid task creation priority' using errcode = '22023';
    end if;
    manual_priority := p_patch ->> 'priority';
  else
    relation_type := case p_action
      when 'assign_project' then 'project'
      when 'assign_context' then 'context'
      else 'person'
    end;
    relation_key := case relation_type
      when 'project' then 'projectRef'
      when 'context' then 'contextRef'
      else 'personRef'
    end;
    if pg_catalog.jsonb_typeof(p_patch -> relation_key) is distinct from 'string' then
      raise exception 'Relation reference did not resolve'
        using errcode = '22023', detail = '2E_INVALID_RELATION';
    end if;
    relation_reference := p_patch ->> relation_key;
    if relation_reference is null
      or pg_catalog.btrim(relation_reference) = ''
      or pg_catalog.char_length(relation_reference) > (
        case relation_type
          when 'context' then 120
          else 160
        end
      )
    then
      raise exception 'Relation reference did not resolve'
        using errcode = '22023', detail = '2E_INVALID_RELATION';
    end if;

    relation_id := public.resolve_owned_entity_exact(
      p_user_id,
      relation_type,
      relation_reference,
      observed_at
    );
    if relation_id is null then
      raise exception 'Relation reference did not resolve'
        using errcode = '22023', detail = '2E_INVALID_RELATION';
    end if;

    if relation_type = 'project' then
      select entity.name into relation_name
      from public.projects as entity
      where entity.id = relation_id and entity.user_id = p_user_id;
    elsif relation_type = 'context' then
      select entity.name into relation_name
      from public.contexts as entity
      where entity.id = relation_id and entity.user_id = p_user_id;
    else
      select entity.name into relation_name
      from public.people as entity
      where entity.id = relation_id and entity.user_id = p_user_id;
      person_role := case p_action
        when 'set_waiting_on' then 'waiting_on'
        else 'involved'
      end;
    end if;
    if relation_name is null then
      raise exception 'Relation reference did not resolve'
        using errcode = '22023', detail = '2E_INVALID_RELATION';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'title', canonical_title,
    'status', 'inbox',
    'dueAt', private.task_command_creation_render_instant(due_at),
    'plannedAt', private.task_command_creation_render_instant(planned_at),
    'manualPriority', manual_priority,
    'relationType', relation_type,
    'relationId', relation_id,
    'relationName', relation_name,
    'personRole', person_role
  );
end;
$$;

revoke all on function private.task_command_creation_payload(uuid, text, text[], jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function private.task_command_creation_fingerprint(
  p_user_id uuid,
  p_action text,
  p_canonical_payload jsonb,
  p_policy_version text,
  p_operation_key text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'ownerId', p_user_id,
          'action', p_action,
          'canonicalPayload', p_canonical_payload,
          'policyVersion', p_policy_version,
          'operationKey', p_operation_key
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function private.task_command_creation_fingerprint(uuid, text, jsonb, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.task_command_creation_relations(
  p_user_id uuid,
  p_task_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'projectIds', coalesce((
      select pg_catalog.jsonb_agg(relation.project_id order by relation.project_id)
      from public.task_projects as relation
      where relation.user_id = p_user_id and relation.task_id = p_task_id
    ), '[]'::jsonb),
    'contextIds', coalesce((
      select pg_catalog.jsonb_agg(relation.context_id order by relation.context_id)
      from public.task_contexts as relation
      where relation.user_id = p_user_id and relation.task_id = p_task_id
    ), '[]'::jsonb),
    'people', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('personId', relation.person_id, 'role', relation.role)
        order by relation.person_id, relation.role
      )
      from public.task_people as relation
      where relation.user_id = p_user_id and relation.task_id = p_task_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.task_command_creation_relations(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One creation family, read by the predicate and both pre-task locking doors
-- ---------------------------------------------------------------------------

create or replace function private.is_task_creation_action(
  p_action_type text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select p_action_type = any(array[
    'confirm_entry_tasks',
    'confirm_entry_task_candidates',
    'confirm_entry_task_candidates_v5',
    'confirm_entry_task_candidates_v6',
    'create_task_command'
  ]);
$$;

revoke all on function private.is_task_creation_action(text)
  from public, anon, authenticated, service_role;

create or replace function private.task_creation_undone(
  p_user_id uuid,
  p_task_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.undo_operations as creation
    where creation.user_id = p_user_id
      and creation.status = 'undone'
      and private.is_task_creation_action(creation.action_type)
      and p_task_id = any(creation.entity_ids)
  );
$$;

revoke all on function private.task_creation_undone(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.apply_task_command(
  p_task_id uuid,
  p_action text,
  p_patch jsonb,
  p_pre_state jsonb,
  p_observed_before text,
  p_policy_version text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- One regex for every instant this function validates. `202607220044:367-399`
  -- repeats the literal at each site; a single constant cannot drift between the
  -- pre-state gate and the patch bounds, which have to agree or a value accepted
  -- by one is refused by the other.
  iso_instant_pattern constant text :=
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$';
  non_terminal_statuses constant text[] :=
    array['inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred'];

  -- The actions served by the one shared status UPDATE at step 21, declared once
  -- because five separate places have to agree about the same list: the delta
  -- against the claimed pre-state (step 11), the delta against the locked row
  -- (step 19), the write itself (step 21), and the two terminal-timestamp
  -- expressions of the recorded `applied_state` (step 23).
  --
  -- Slice 2E.4 wrote that list out at each of those five sites and its own
  -- comment named the hazard: "each branch mirrors the matching branch of step 21
  -- term for term, so adding an action there means adding it here". Slice 2E.5
  -- adds two actions, and getting any one of the five wrong is silent and severe
  -- — a missed step 21 sends `cancel_task` into the relation branch, and a missed
  -- step 23 records a `cancelled_at` the row does not hold, which makes the
  -- ten-column undo guard refuse every cancel-undo forever. One constant, five
  -- readers, no drift.
  status_writing_actions constant text[] := array[
    'complete_task', 'reopen_task', 'set_status', 'cancel_task', 'restore_task'
  ];

  current_user_id uuid := auth.uid();
  normalized_key text;
  internal_operation_key text;
  canonical_fingerprint text;

  -- The §11.2 taxonomy for this action, resolved once. `taxonomy.ts` is the
  -- executable form of that table in TypeScript; these five values are the part
  -- of it the write path needs, and they are set in one place so no branch below
  -- re-derives "can this action touch this task".
  action_eligible_statuses text[];
  allowed_patch_keys text[];
  required_patch_keys text[];
  allowed_status_values text[];
  action_target_status text;
  action_touches_reminders boolean := false;
  -- PRD §11.2's Confirmation column, resolved from the taxonomy like every other
  -- policy value rather than by naming the action at the gate. `cancel_task` is
  -- the only row that carries it today.
  --
  -- Setting this is **necessary but not sufficient** for a second destructive
  -- action: `public.task_command_confirmations`' `action` CHECK and
  -- `public.issue_task_command_confirmation`'s own closed action list both name
  -- `cancel_task` literally, so an action that set this without widening those
  -- two would be permanently unappliable — gated here, and refused a
  -- confirmation there. Both are deliberate: the CHECK is the structural floor
  -- and the issuance list is what stops a caller minting a row no apply can
  -- consume. A second destructive action is a three-place change, and this is
  -- the place that is easy to find.
  action_requires_confirmation boolean := false;
  action_undo_strategy text;
  action_undo_action_type text;

  claimed_title text;
  claimed_description text;
  claimed_status text;
  claimed_due_at timestamptz;
  claimed_planned_at timestamptz;
  claimed_manual_priority text;
  claimed_completed_at timestamptz;
  claimed_cancelled_at timestamptz;
  claimed_intentional_no_due boolean;
  claimed_no_due_reason text;
  claimed_created_at timestamptz;
  claimed_updated_at timestamptz;

  patch_status text;
  patch_title text;
  patch_description text;
  patch_due_at timestamptz;
  patch_planned_at timestamptz;
  patch_manual_priority text;
  patch_intentional_no_due boolean;
  patch_no_due_reason text;
  patch_project_id uuid;
  patch_context_id uuid;
  patch_person_id uuid;
  patch_person_role text;

  has_delta boolean := false;
  locked_task public.tasks%rowtype;
  existing_operation public.undo_operations%rowtype;
  undo_id uuid;
  undo_expires_at timestamptz;
  undo_before_state jsonb;
  undo_after_state jsonb;
  -- The ten scalar columns as step 21 left them, which is what the undo handler
  -- guards its compensating UPDATE on. Built at step 23 rather than declared with
  -- a value, because every input to it is only known once the row is locked.
  undo_applied_state jsonb;

  effective_status text;
  effective_title text;
  effective_due_at timestamptz;

  reminders_cancelled_count integer := 0;
  reminders_cancelled_json jsonb := '[]'::jsonb;
  reminder_created_id uuid;

  -- The confirmation this call consumed, recorded on the undo row and the audit
  -- row so an applied destructive command carries the identity of the evidence
  -- that authorized it. Null for every action the taxonomy does not gate.
  consumed_confirmation_id uuid;
  confirmation_consumed integer := 0;

  relation_table text;
  relation_target_id uuid;
  relation_role text;
  affected integer := 0;
begin
  -- 1. Caller ------------------------------------------------------------------
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- 2. Action ------------------------------------------------------------------
  -- The closed enum first (2E-COMMAND-002), then the taxonomy. Slice 2E.5 added
  -- the two branches Slice 2E.4 left as a refusal, so the `case` below now covers
  -- all fifteen members of the enum and its `else` is unreachable while the two
  -- lists agree. It is kept as the fail-closed terminator for the state where
  -- they do not — an action admitted to the enum with no policy behind it — and
  -- it raises the same bare `22023` this step already gives an unknown action.
  -- The token that used to sit there is retired, and is deliberately not named
  -- anywhere inside this body: the post-deploy block greps the shipped function
  -- definitions for it, so a mention in prose would fail the deployment that
  -- retires it. A declared token no reachable state can raise is the defect this
  -- file rejects twice elsewhere.
  if p_action is null or p_action not in (
    'complete_task', 'reopen_task', 'set_status', 'cancel_task', 'restore_task',
    'rename_task', 'append_note', 'reschedule_due', 'clear_due', 'set_planned',
    'set_priority', 'assign_project', 'assign_context', 'assign_person',
    'set_waiting_on'
  ) then
    raise exception 'Invalid task command action' using errcode = '22023';
  end if;

  -- `complete_task`, `reopen_task`, `cancel_task` and `restore_task` carry
  -- `status` in their patch even though the destination is read from the taxonomy
  -- and never from the patch, and it is required rather than merely allowed. Two
  -- independent reasons, both load-bearing:
  --
  --   * The canonical patch is what `task_command_fingerprint` hashed at preview
  --     time, and `buildCanonicalPatch`
  --     (`src/features/task-commands/preview.ts:413-426`) writes
  --     `draft.status = policy.targetStatus` whenever the taxonomy declares one.
  --     Refusing the key would make the fingerprint the preview computed
  --     unreachable and both actions unappliable; accepting a patch *without* it
  --     would hash a different object and never match a stored replay.
  --   * `applied_patch` is the only record of what the caller *asked for*, as
  --     against `applied_state`, which records what the row ended up holding. An
  --     absent `status` would leave the first silent about a transition that
  --     demonstrably happened, and the two are read for different questions in
  --     Slice 2E.5's destructive-confirmation audit. (This bullet used to say the
  --     undo handler guards on `applied_patch ->> 'status'`; it does not any more.
  --     A one-column guard over a ten-column restore discarded a newer change in
  --     silence, so the guard now reads all ten columns out of `applied_state`.)
  --
  -- The key is admitted with a single allowed value — the taxonomy's own
  -- destination, resolved below — so it cannot become a second route to a
  -- transition another action guards. `set_status` is the only action whose
  -- destination is genuinely taken from the patch, and its allowed values are the
  -- six non-terminal, so `cancelled` and `completed` stay reachable only through
  -- the actions that declare them.
  case p_action
    when 'complete_task' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'completed';
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'reopen_task' then
      action_eligible_statuses := array['completed'];
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'todo';
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'set_status' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_undo_strategy := 'restore_fields';
    -- The two destructive verbs, in PRD §11.2's own order. Both are shaped
    -- exactly like `complete_task`/`reopen_task`: the destination comes from the
    -- taxonomy, the patch may only restate it, and the shared status UPDATE at
    -- step 21 already writes `cancelled_at` when and only when entering
    -- `cancelled` and clears it when leaving — which is why neither needs a write
    -- path of its own. `202607260058:1232-1234` reserved exactly this.
    --
    -- `cancel_task` is eligible only from the six non-terminal statuses, so
    -- cancelling an already-completed task is not offered: admitting it would
    -- force this action to clear `completed_at` and force `restore_task` to guess
    -- which status to return to (PRD §11.2).
    when 'cancel_task' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'cancelled';
      action_touches_reminders := true;
      -- The only row of §11.2 whose Confirmation column says "required".
      action_requires_confirmation := true;
      action_undo_strategy := 'restore_fields';
    -- `restore_task` requires no confirmation: §11.2 marks it non-destructive
    -- with "Confirmation: no". Its deliberateness is `oneStepEligible: false`,
    -- which is a match-layer property (`matching.ts:620-625`) and not something
    -- this function can observe — an RPC cannot tell how many controls the user
    -- pressed. What it can enforce, and does below, is that a task whose creation
    -- was undone never comes back through it (2E-DESTRUCTIVE-009).
    when 'restore_task' then
      action_eligible_statuses := array['cancelled'];
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'todo';
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'rename_task' then
      action_eligible_statuses := array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed'
      ];
      allowed_patch_keys := array['title'];
      required_patch_keys := array['title'];
      action_undo_strategy := 'restore_fields';
    when 'append_note' then
      action_eligible_statuses := array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed'
      ];
      allowed_patch_keys := array['description'];
      required_patch_keys := array['description'];
      action_undo_strategy := 'restore_fields';
    when 'reschedule_due' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['dueAt', 'intentionalNoDue', 'noDueReason'];
      required_patch_keys := array['dueAt'];
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'clear_due' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['dueAt'];
      required_patch_keys := array['dueAt'];
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'set_planned' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['plannedAt'];
      required_patch_keys := array['plannedAt'];
      action_undo_strategy := 'restore_fields';
    when 'set_priority' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['manualPriority'];
      required_patch_keys := array['manualPriority'];
      action_undo_strategy := 'restore_fields';
    when 'assign_project' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['projectId'];
      required_patch_keys := array['projectId'];
      action_undo_strategy := 'remove_added_relation';
    when 'assign_context' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['contextId'];
      required_patch_keys := array['contextId'];
      action_undo_strategy := 'remove_added_relation';
    when 'assign_person' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['personId', 'personRole'];
      required_patch_keys := array['personId', 'personRole'];
      patch_person_role := 'involved';
      action_undo_strategy := 'remove_added_relation';
    when 'set_waiting_on' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['personId', 'personRole'];
      required_patch_keys := array['personId', 'personRole'];
      patch_person_role := 'waiting_on';
      action_undo_strategy := 'remove_added_relation';
    else
      -- Unreachable while the enum above and this `case` list the same fifteen
      -- actions, which `supabase/tests/phase_2e_task_command_apply.sql` asserts
      -- by reading both out of the catalog. Kept as the terminator anyway:
      -- without it, an action added to the enum and forgotten here would fall
      -- through with null policy arrays and be validated against nothing.
      raise exception 'Invalid task command action' using errcode = '22023';
  end case;

  if action_target_status is not null then
    allowed_status_values := array[action_target_status];
  else
    allowed_status_values := non_terminal_statuses;
  end if;

  action_undo_action_type := case
    when action_undo_strategy = 'remove_added_relation' then 'apply_task_command_relation'
    else 'apply_task_command'
  end;

  -- 3. Operation key -----------------------------------------------------------
  -- `undo_operations_operation_key_check` bounds the stored key at 8..260
  -- (`202607170020:81-82`), and the prefix is 11 characters, so the caller bound
  -- is 240 exactly as `202607220044:182-190` reserves the difference for
  -- `'confirm-v6:'`. `btrim` is correct here and only here: the POSIX form
  -- `202607230047:85-90` forward-fixed is for free text, and an operation key is
  -- not free text.
  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'taskcmd-v1:' || normalized_key;

  -- 4. Policy version ----------------------------------------------------------
  -- Validated through `btrim` but hashed raw: `buildFingerprintPayload`
  -- (`src/features/task-commands/fingerprint.ts:79-154`) sends
  -- `preview.policyVersion` verbatim, and normalizing it here would make the
  -- value this function hashes differ from the value the preview hashed.
  if p_policy_version is null
    or pg_catalog.char_length(pg_catalog.btrim(p_policy_version)) not between 1 and 64
  then
    raise exception 'Invalid task command policy version' using errcode = '22023';
  end if;

  -- 5. Observed-before ---------------------------------------------------------
  -- Regex first, then a guarded cast, following `202607220044:367-399`. The cast
  -- is *validation only* — the text is what reaches the fingerprint, verbatim.
  -- Casting it back to `timestamptz` for hashing would make two callers in two
  -- zones derive two identities for one request and every replay look new, which
  -- is precisely the latent bug `202607250057:34-39` declines to copy.
  if p_observed_before is null or p_observed_before !~ iso_instant_pattern then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end if;
  begin
    perform p_observed_before::timestamptz;
  exception when others then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end;

  -- 6. Pre-state ---------------------------------------------------------------
  -- Closed-object validation in the `202607220044:206-220` shape: an object, an
  -- exact key count, and an EXISTS for any key outside the allow-list. Unknown
  -- keys are rejected, never ignored — the nineteen keys are `TaskPreState`
  -- (`src/features/task-commands/matching.ts:61-81`), which is what the preview
  -- observed and what the fingerprint hashed.
  if p_pre_state is null or pg_catalog.jsonb_typeof(p_pre_state) <> 'object' then
    raise exception 'Task command pre-state must be an object' using errcode = '22023';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_pre_state)) <> 19
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_pre_state) as pre_state_key(key_name)
      where not (pre_state_key.key_name = any(array[
        'title', 'description', 'status', 'dueAt', 'plannedAt', 'manualPriority',
        'completedAt', 'cancelledAt', 'intentionalNoDue', 'noDueReason',
        'createdAt', 'updatedAt', 'projectIds', 'projectNames', 'contextIds',
        'contextNames', 'personIds', 'personNames', 'personRoles'
      ]))
    )
  then
    raise exception 'Task command pre-state must carry exactly the observed fields'
      using errcode = '22023';
  end if;

  -- Every cast is guarded, so a malformed claim is a validation failure rather
  -- than a `22P02` escaping to a client whose mapper has no case for it.
  begin
    claimed_title := p_pre_state ->> 'title';
    claimed_description := p_pre_state ->> 'description';
    claimed_status := p_pre_state ->> 'status';
    claimed_due_at := (p_pre_state ->> 'dueAt')::timestamptz;
    claimed_planned_at := (p_pre_state ->> 'plannedAt')::timestamptz;
    claimed_manual_priority := p_pre_state ->> 'manualPriority';
    claimed_completed_at := (p_pre_state ->> 'completedAt')::timestamptz;
    claimed_cancelled_at := (p_pre_state ->> 'cancelledAt')::timestamptz;
    claimed_intentional_no_due := (p_pre_state ->> 'intentionalNoDue')::boolean;
    claimed_no_due_reason := p_pre_state ->> 'noDueReason';
    claimed_created_at := (p_pre_state ->> 'createdAt')::timestamptz;
    claimed_updated_at := (p_pre_state ->> 'updatedAt')::timestamptz;
  exception when others then
    raise exception 'Task command pre-state carries a value of the wrong type'
      using errcode = '22023';
  end;

  if claimed_title is null
    or claimed_status is null
    or claimed_intentional_no_due is null
    or claimed_created_at is null
    or claimed_updated_at is null
  then
    raise exception 'Task command pre-state is missing a required value'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_pre_state -> 'projectIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'contextIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'personIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'personRoles') <> 'array'
    or pg_catalog.jsonb_array_length(p_pre_state -> 'personIds')
       <> pg_catalog.jsonb_array_length(p_pre_state -> 'personRoles')
  then
    raise exception 'Task command pre-state relation arrays are malformed'
      using errcode = '22023';
  end if;

  -- 7. Patch key set -----------------------------------------------------------
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Task command patch must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_patch) as patch_key(key_name)
    where not (patch_key.key_name = any(allowed_patch_keys))
  ) then
    raise exception 'Task command patch carries a field this action does not allow'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(required_patch_keys) as required_key(key_name)
    where not (p_patch ? required_key.key_name)
  ) then
    raise exception 'Task command patch is missing a required field'
      using errcode = '22023';
  end if;

  -- 8. Patch values, against the ACTION's own allowed targets -------------------
  -- 2E-COMMAND-008 validates against the action's declared set, not the
  -- table-wide domain. The table CHECKs are the floor, not the contract.
  if p_patch ? 'status' then
    patch_status := p_patch ->> 'status';
    if pg_catalog.jsonb_typeof(p_patch -> 'status') <> 'string'
      or not (patch_status = any(allowed_status_values))
    then
      raise exception 'Invalid task command status' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'title' then
    patch_title := p_patch ->> 'title';
    if pg_catalog.jsonb_typeof(p_patch -> 'title') <> 'string'
      or pg_catalog.char_length(patch_title) not between 1 and 240
    then
      raise exception 'Invalid task command title' using errcode = '22023';
    end if;
  end if;

  -- `append_note` writes this verbatim. The concatenation is computed by
  -- `buildTaskCommandPreview`, which is what the user saw and what the
  -- fingerprint hashed, so re-deriving it here would be a second copy of a
  -- domain rule that could disagree with the preview.
  --
  -- **100000, not the note's 2000.** This value is not a note — it is
  -- `pre.description || E'\n\n' || note`, built by `buildCanonicalPatch`
  -- (`src/features/task-commands/preview.ts:429-437`). 2E-COMMAND-008's
  -- "description ≤ 2000" governs the fragment the model may emit, and
  -- `MAX_NOTE_LENGTH` (`src/features/task-commands/schema.ts:34`) already refuses a
  -- longer one at the parse boundary. Bounding the *result* at 2000 was written and
  -- is the defect this replaces: it made a task whose notes already totalled 2000
  -- characters unable to take another legal note ever again, and it did so after
  -- the preview had already offered a one-step apply — the RPC then refused a
  -- payload the user was told would land. The alternative fix, refusing the append
  -- in the preview with a new declared refusal, was rejected: silently making a
  -- legal note unappliable on a long task is a worse product outcome than an
  -- unbounded description.
  --
  -- And it is genuinely unbounded: `tasks.description` is bare `text` with no CHECK
  -- (`202607160003:110`), unlike `title`, so this is the only ceiling that exists on
  -- the column and repeated appends accumulate without one. 100000 is kept finite
  -- only so a definer function cannot be turned into a way to write megabyte rows —
  -- it is about fifty maximum-length notes, past any plausible note history, and the
  -- request already carries this text twice, here and inside `p_pre_state`.
  if p_patch ? 'description' then
    patch_description := p_patch ->> 'description';
    if pg_catalog.jsonb_typeof(p_patch -> 'description') <> 'string'
      or pg_catalog.char_length(patch_description) > 100000
    then
      raise exception 'Invalid task command description' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'dueAt' then
    if p_action = 'clear_due' then
      if pg_catalog.jsonb_typeof(p_patch -> 'dueAt') <> 'null' then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end if;
    else
      if pg_catalog.jsonb_typeof(p_patch -> 'dueAt') <> 'string'
        or (p_patch ->> 'dueAt') !~ iso_instant_pattern
      then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end if;
      begin
        patch_due_at := (p_patch ->> 'dueAt')::timestamptz;
      exception when others then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end;
    end if;
  end if;

  if p_patch ? 'plannedAt' then
    if pg_catalog.jsonb_typeof(p_patch -> 'plannedAt') <> 'string'
      or (p_patch ->> 'plannedAt') !~ iso_instant_pattern
    then
      raise exception 'Invalid task command planned date' using errcode = '22023';
    end if;
    begin
      patch_planned_at := (p_patch ->> 'plannedAt')::timestamptz;
    exception when others then
      raise exception 'Invalid task command planned date' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'manualPriority' then
    patch_manual_priority := p_patch ->> 'manualPriority';
    if pg_catalog.jsonb_typeof(p_patch -> 'manualPriority') <> 'string'
      or not (patch_manual_priority = any(array['low', 'medium', 'high', 'urgent']))
    then
      raise exception 'Invalid task command priority' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'intentionalNoDue' then
    if pg_catalog.jsonb_typeof(p_patch -> 'intentionalNoDue') <> 'boolean' then
      raise exception 'Invalid task command no-due flag' using errcode = '22023';
    end if;
    patch_intentional_no_due := (p_patch ->> 'intentionalNoDue')::boolean;
  end if;

  if p_patch ? 'noDueReason' then
    if pg_catalog.jsonb_typeof(p_patch -> 'noDueReason') not in ('null', 'string') then
      raise exception 'Invalid task command no-due reason' using errcode = '22023';
    end if;
    patch_no_due_reason := p_patch ->> 'noDueReason';
  end if;

  -- 2E-UPDATE-012, first half: the canonical patch must be internally consistent
  -- before it ever reaches `tasks_no_due_consistency_check`
  -- (`202607210036:36-41`), so the user gets a declared reason code rather than a
  -- raw `23514` they cannot act on.
  if (patch_due_at is not null and coalesce(patch_intentional_no_due, false))
    or (patch_no_due_reason is not null and not coalesce(patch_intentional_no_due, false))
  then
    raise exception 'Due date conflicts with the intentional no-due flag'
      using errcode = '22023', detail = '2E_DUE_CONSISTENCY';
  end if;

  if p_patch ? 'projectId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'projectId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_project_id := (p_patch ->> 'projectId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'contextId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'contextId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_context_id := (p_patch ->> 'contextId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'personId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'personId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_person_id := (p_patch ->> 'personId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  -- The role is not the caller's to choose: `assign_person` and `set_waiting_on`
  -- are otherwise byte-identical policies, and the role is the only thing that
  -- distinguishes them. It was set from the taxonomy above; the patch may only
  -- restate it.
  if p_patch ? 'personRole' then
    if (p_patch ->> 'personRole') is distinct from patch_person_role then
      raise exception 'Invalid task command person role' using errcode = '22023';
    end if;
  end if;

  -- 9. Unlocked ownership probe -------------------------------------------------
  -- Before the reservation and before any lock, so `no_change` and a
  -- cross-owner payload both resolve without burning an operation key.
  -- 2E-OWNERSHIP-002: a command naming another owner's task is indistinguishable
  -- from one naming a nonexistent task, so both land on this single message.
  if not exists (
    select 1
    from public.tasks as owned_task
    where owned_task.id = p_task_id
      and owned_task.user_id = current_user_id
  ) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  -- 10. Relation-reference ownership -------------------------------------------
  -- `202607220044:919-1001` proves ownership of every referenced entity with an
  -- EXISTS probe rather than trusting the caller or relying on the composite FK's
  -- error, and it does so *before* the reservation: a payload naming another
  -- owner's project must not burn an operation key. The composite owner FKs
  -- (`task_projects_project_owner_fk` and siblings, `202607170016:90-101`) remain
  -- the structural backstop that satisfies 2E-UPDATE-016 by construction.
  if patch_project_id is not null and not exists (
    select 1
    from public.projects as owned_project
    where owned_project.id = patch_project_id
      and owned_project.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;
  if patch_context_id is not null and not exists (
    select 1
    from public.contexts as owned_context
    where owned_context.id = patch_context_id
      and owned_context.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;
  if patch_person_id is not null and not exists (
    select 1
    from public.people as owned_person
    where owned_person.id = patch_person_id
      and owned_person.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;

  -- 11. Canonical delta against the CLAIMED pre-state --------------------------
  -- 2E-UPDATE-009 requires `no_change` to write nothing at all, and the
  -- reservation is the first write, so this decision has to happen here — before
  -- it, and before any lock. The claim is unverified at this point; the outcome
  -- writes nothing, so the worst case is a mis-informed answer to a caller whose
  -- own preview already decided `no_change` authoritatively.
  effective_status := coalesce(action_target_status, patch_status, claimed_status);
  effective_due_at := case when p_patch ? 'dueAt' then patch_due_at else claimed_due_at end;

  case
    when p_action = any(status_writing_actions) then
      has_delta := claimed_status is distinct from effective_status;
    when p_action = 'rename_task' then
      has_delta := claimed_title is distinct from patch_title;
    when p_action = 'append_note' then
      has_delta := claimed_description is distinct from patch_description;
    when p_action in ('reschedule_due', 'clear_due') then
      has_delta := claimed_due_at is distinct from effective_due_at
        or (p_patch ? 'intentionalNoDue'
            and claimed_intentional_no_due is distinct from patch_intentional_no_due)
        or (p_patch ? 'noDueReason'
            and claimed_no_due_reason is distinct from patch_no_due_reason);
    when p_action = 'set_planned' then
      has_delta := claimed_planned_at is distinct from patch_planned_at;
    when p_action = 'set_priority' then
      has_delta := claimed_manual_priority is distinct from patch_manual_priority;
    when p_action = 'assign_project' then
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'projectIds') as held(project_id)
        where held.project_id = patch_project_id::text
      ) into has_delta;
    when p_action = 'assign_context' then
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'contextIds') as held(context_id)
        where held.context_id = patch_context_id::text
      ) into has_delta;
    else
      -- `assign_person` and `set_waiting_on`. The pre-state carries `personIds`
      -- and `personRoles` as parallel arrays, so "already held" is a positional
      -- join, not a membership test: the same person may be linked twice under
      -- two different roles.
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'personIds')
          with ordinality as held(person_id, held_position)
        join pg_catalog.jsonb_array_elements_text(p_pre_state -> 'personRoles')
          with ordinality as held_role(person_role, role_position)
          on held_role.role_position = held.held_position
        where held.person_id = patch_person_id::text
          and held_role.person_role = patch_person_role
      ) into has_delta;
  end case;

  if not has_delta then
    return pg_catalog.jsonb_build_object(
      'outcome', 'no_change',
      'task_id', p_task_id,
      'action', p_action,
      'undo_id', null,
      'idempotent', false,
      'request_fingerprint', null,
      'reminders_cancelled', 0,
      'reminder_created_id', null,
      'undo_expires_at', null
    );
  end if;

  -- 12. Fingerprint ------------------------------------------------------------
  -- Never hand-rolled here: `public.task_command_fingerprint`
  -- (`202607250057:59-94`) is the one canonicalizer, and TypeScript never hashes.
  -- The seven arguments must be exactly what `buildFingerprintPayload` sent, or
  -- replay detection breaks. Two of them are traps: `p_owner_id` is *not* a
  -- caller argument and comes from `auth.uid()`, and the last argument is the
  -- BTRIMMED caller key — not `internal_operation_key`. TypeScript hashes its own
  -- `operationKey`, so this function must hash the same value it received, and
  -- the `'taskcmd-v1:'` prefix exists only to namespace the stored row.
  canonical_fingerprint := public.task_command_fingerprint(
    current_user_id,
    p_task_id,
    p_observed_before,
    p_pre_state,
    p_patch,
    p_policy_version,
    normalized_key
  );

  -- 13. Reservation — the FIRST write ------------------------------------------
  -- `after_state` is a placeholder in its final shape, patched by the mandatory
  -- UPDATE at step 23 once the task has been locked and the write has happened.
  -- `before_state`, `expires_at`, `status` and the `source_*` columns are left to
  -- the table defaults, exactly as `202607220044:1108-1138` leaves them.
  insert into public.undo_operations (
    user_id,
    action_type,
    entity_type,
    entity_ids,
    after_state,
    operation_key,
    request_fingerprint
  ) values (
    current_user_id,
    action_undo_action_type,
    'task',
    array[p_task_id],
    pg_catalog.jsonb_build_object(
      'task_id', p_task_id,
      'action', p_action,
      'undo_strategy', action_undo_strategy,
      'policy_version', p_policy_version,
      'request_fingerprint', canonical_fingerprint,
      'applied_patch', p_patch,
      'reminders_cancelled_count', 0,
      'reminders_reconciled', action_touches_reminders,
      'reminder_created_id', null,
      -- Placeholder, like the rest of this object. The real value is known only
      -- after step 14b consumes the row, which cannot happen before this
      -- reservation exists — the reservation is what proves this call is not a
      -- replay, and a replay must consume nothing.
      'confirmation_id', null,
      -- The one key that cannot carry even a placeholder value: it describes the
      -- ten columns after step 21, and the row is not locked yet. Recorded null so
      -- the reservation keeps the same key set as the patched row, and so a row
      -- that somehow reached a handler unpatched fails that handler's closed
      -- evidence gate instead of being restored against a state nobody observed.
      'applied_state', null,
      'relation', null
    ),
    internal_operation_key,
    canonical_fingerprint
  )
  on conflict (user_id, operation_key) where operation_key is not null
  do nothing
  returning id, expires_at into undo_id, undo_expires_at;

  -- 14. Replay -----------------------------------------------------------------
  -- Reconstructed entirely from the stored `after_state`: re-reading the task
  -- would return post-hoc state and make the replay untruthful, which is why
  -- every field the success return needs was persisted up front. Returns before
  -- any task lock, so a replay neither serializes against a concurrent command
  -- nor re-evaluates the staleness gate. Vanished-row and fingerprint-mismatch
  -- collapse into one error on purpose (`202607220044:1140-1158`): the caller
  -- learns that this key does not describe this payload, and nothing more.
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
        using errcode = 'P0001', detail = '2E_IDEMPOTENCY_MISMATCH';
    end if;
    return pg_catalog.jsonb_build_object(
      'outcome', 'applied',
      'task_id', existing_operation.after_state -> 'task_id',
      'action', existing_operation.after_state -> 'action',
      'undo_id', existing_operation.id,
      'idempotent', true,
      'request_fingerprint', existing_operation.after_state -> 'request_fingerprint',
      'reminders_cancelled', existing_operation.after_state -> 'reminders_cancelled_count',
      'reminder_created_id', existing_operation.after_state -> 'reminder_created_id',
      'undo_expires_at', pg_catalog.to_char(
        existing_operation.expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.USOF'
      )
    );
  end if;

  -- 14b. Confirmation (2E-DESTRUCTIVE-002, -003, -004) --------------------------
  -- One statement is the whole gate, and that is the design rather than a
  -- shortcut. A read-then-write pair was written first and rejected: two halves
  -- can disagree after a later edit, and the read half would have had to be
  -- re-checked under a lock anyway. Here every binding 2E-DESTRUCTIVE-002 names
  -- is a predicate of the same UPDATE that consumes the row, so "valid" and
  -- "unused" are established atomically and a caller cannot be told its evidence
  -- was accepted by one half and rejected by the other.
  --
  --   * `user_id` is `auth.uid()`, never an argument. Another owner's
  --     confirmation is simply not matched, which makes it indistinguishable
  --     from none at all (2E-OWNERSHIP-002).
  --   * `operation_key` is the *btrimmed caller key*, which is what the digest
  --     was computed over on both sides.
  --   * `request_fingerprint` is the value THIS function derived at step 12 from
  --     the seven arguments. It is never read from the request. A confirmation
  --     issued for a different payload therefore does not match, which is
  --     2E-DESTRUCTIVE-003 — "a changed proposal invalidates prior confirmation".
  --   * `status = 'issued'` is the single-use property, and it is what makes the
  --     UPDATE its own concurrency control: a second consumer blocks on the row
  --     lock, re-evaluates after the first commits, matches nothing, and is
  --     refused.
  --   * `task_id` and `action` are re-asserted even though the digest already
  --     covers them, so the row cannot be pointed at a different subject by any
  --     future edit that loosens the digest.
  --
  -- **Placed after the replay branch, deliberately.** An exact resubmission
  -- returns from the stored `after_state` above and never arrives here, so a
  -- replay consumes nothing and 2E-UPDATE-005 holds. Placing this before the
  -- reservation — where the ownership and relation probes sit — would refuse the
  -- second delivery of a request that had already succeeded, because its
  -- confirmation is by then legitimately spent.
  --
  -- **And inside the same transaction as the mutation** (2E-UPDATE-004). Every
  -- raise below this line rolls the consumption back with everything else, so a
  -- `2E_TRANSITION_INTEGRITY` loss does not cost the user the confirmation they
  -- already gave; the retry finds the row still `issued`. Consuming in a separate
  -- transaction was the alternative and would have made a lost race indefinitely
  -- expensive to a user, for no security gain.
  if action_requires_confirmation then
    update public.task_command_confirmations as confirmation
    set status = 'consumed', consumed_at = pg_catalog.now()
    where confirmation.user_id = current_user_id
      and confirmation.operation_key = normalized_key
      and confirmation.status = 'issued'
      and confirmation.request_fingerprint = canonical_fingerprint
      and confirmation.task_id = p_task_id
      and confirmation.action = p_action
    returning confirmation.id into consumed_confirmation_id;
    get diagnostics confirmation_consumed = row_count;

    if confirmation_consumed <> 1 then
      raise exception 'Destructive action requires server-issued confirmation'
        using errcode = 'P0001', detail = '2E_CONFIRMATION_REQUIRED';
    end if;
  end if;

  -- 15. Audit actor ------------------------------------------------------------
  -- Set before the task write so `audit_task_change` reads it when it co-fires.
  -- `'user'` is truthful for every apply: PRD §23.7 records that "one-step apply"
  -- is the least-friction outcome, not an unattended write. Set explicitly
  -- rather than relying on the trigger's default, so this function's intent is
  -- legible and a test can pin it. `is_local => true` keeps it from leaking
  -- across a pooled connection into an unrelated later transaction.
  perform pg_catalog.set_config('app.audit_actor', 'user', true);

  -- 15b. The creation-undo collision, restore_task's door (2E-DESTRUCTIVE-009) --
  -- A task whose originating creation operation has itself been undone is
  -- deleted, and `restore_task` is one of the three doors §13.6 requires the same
  -- guard to close. Without this, the escape hatch cancellation ships with
  -- becomes a resurrection hatch for a task the user deleted by undoing its
  -- creation.
  --
  -- **The `for update` is load-bearing and its position is load-bearing.**
  -- Without it the predicate is a snapshot read, and `private.undo_confirm_entry_tasks`
  -- committing between it and this transaction's commit would let the restore
  -- land on a task that was deleted concurrently. With it, this transaction
  -- blocks on `public.undo_operation`'s own `for update` of the same row
  -- (`202607250052:654-657`) and re-reads the committed `undone` status.
  --
  -- It runs **before** step 16 locks the task, and that ordering is not
  -- cosmetic: `public.undo_operation` takes `undo_operations` and then writes
  -- `public.tasks`, so acquiring the task first here would give the two paths
  -- opposite orders and a deadlock. Every reader of the creation family in this
  -- phase locks it before the task, for that reason.
  --
  -- The lock covers the family regardless of `status`, while the refusal reads
  -- only `undone` rows through the shared predicate: locking only the `undone`
  -- ones would leave an `available` row free to become `undone` underneath.
  if p_action = 'restore_task' then
    perform 1
    from public.undo_operations as creation
    where creation.user_id = current_user_id
      and private.is_task_creation_action(creation.action_type)
      and p_task_id = any(creation.entity_ids)
    for update;

    if private.task_creation_undone(current_user_id, p_task_id) then
      raise exception 'Task creation was undone'
        using errcode = '55P03', detail = '2E_CREATION_UNDONE';
    end if;
  end if;

  -- 16. Lock -------------------------------------------------------------------
  select task_row.*
  into locked_task
  from public.tasks as task_row
  where task_row.id = p_task_id
    and task_row.user_id = current_user_id
  for update;
  if locked_task.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  -- 17. Typed staleness gate (2E-UPDATE-003) -----------------------------------
  if locked_task.title is distinct from claimed_title
    or locked_task.description is distinct from claimed_description
    or locked_task.status is distinct from claimed_status
    or locked_task.due_at is distinct from claimed_due_at
    or locked_task.planned_at is distinct from claimed_planned_at
    or locked_task.manual_priority is distinct from claimed_manual_priority
    or locked_task.completed_at is distinct from claimed_completed_at
    or locked_task.cancelled_at is distinct from claimed_cancelled_at
    or locked_task.intentional_no_due is distinct from claimed_intentional_no_due
    or locked_task.no_due_reason is distinct from claimed_no_due_reason
    or locked_task.created_at is distinct from claimed_created_at
    or locked_task.updated_at is distinct from claimed_updated_at
  then
    raise exception 'Task changed since the preview' using errcode = '55P03';
  end if;

  -- 18. Eligibility against the LOCKED status ----------------------------------
  if not (locked_task.status = any(action_eligible_statuses)) then
    raise exception 'Action is not allowed from the current status'
      using errcode = 'P0001', detail = '2E_INELIGIBLE_STATUS';
  end if;

  -- No candidate-slot guard here, and the absence is deliberate --------------
  -- `202607220040:13-19` made candidate identity unique only over non-cancelled
  -- rows, so a cancelled task releases its slot and returning it to an active
  -- status looks like it could collide with a task that took the slot meanwhile.
  -- It cannot, and the reason is a trigger rather than an RPC:
  -- `public.record_entry_task_candidate_confirmation`
  -- (`202607220041:299-364`) fires `after insert or update` on `public.tasks`
  -- and writes a `'confirmed'` row into `public.entry_task_candidate_resolutions`
  -- for every active task carrying valid candidate provenance. That row is keyed
  -- `unique (user_id, interpretation_id, candidate_index)`
  -- (`202607220041:29-30`), it survives the task's cancellation — nothing deletes
  -- it but `private.undo_confirm_entry_tasks` — and
  -- `confirm_entry_task_candidates_v6`'s terminal-disposition gate
  -- (`202607220044:1179-1189`) reads it. So re-confirming the candidate of a
  -- task this RPC cancelled is refused with `2C_TERMINAL_DISPOSITION`, and the
  -- duplicate that would take the slot can never exist.
  --
  -- The one path that *does* free the slot is a creation-undo, because that is
  -- what deletes the resolution rows (`202607250052:317-325`) — and that is
  -- precisely the path step 15b already refuses with `2E_CREATION_UNDONE`, before
  -- the row is even locked. The slot check would therefore have been subsumed by
  -- a guard that runs earlier, and a declared token no reachable state can raise
  -- is the defect this phase rejects twice elsewhere and codifies in ADR-049.
  --
  -- An earlier revision of this slice shipped that guard, a second private
  -- predicate, a `unique_violation` trap on both status writes and a declared
  -- `2E_CANDIDATE_REMATERIALIZED`, on the strength of a reading of
  -- `202607220044:1357-1358` — "records a resolution row only for a disposition
  -- other than `'confirmed'`" — which is true of the RPC and false of the system,
  -- because the trigger writes the confirmed rows the RPC does not. An
  -- adversarial review of the shipped code found it. All of it is removed rather
  -- than kept as defence in depth.

  -- 19. Delta against the locked row -------------------------------------------
  -- Defence in depth for the scalar actions: step 17 has proven claimed ==
  -- locked, so this cannot differ. It is *not* redundant for the four relation
  -- actions, whose state is not on `public.tasks` and is therefore absent from
  -- the gate by design; for them this is the authoritative locked re-check, and a
  -- relation that appeared since the observation is a conflict rather than a
  -- silent success.
  effective_status := coalesce(action_target_status, patch_status, locked_task.status);
  effective_title := coalesce(patch_title, locked_task.title);
  effective_due_at := case when p_patch ? 'dueAt' then patch_due_at else locked_task.due_at end;

  case
    when p_action = any(status_writing_actions) then
      has_delta := locked_task.status is distinct from effective_status;
    when p_action = 'rename_task' then
      has_delta := locked_task.title is distinct from patch_title;
    when p_action = 'append_note' then
      has_delta := locked_task.description is distinct from patch_description;
    when p_action in ('reschedule_due', 'clear_due') then
      has_delta := locked_task.due_at is distinct from effective_due_at
        or (p_patch ? 'intentionalNoDue'
            and locked_task.intentional_no_due is distinct from patch_intentional_no_due)
        or (p_patch ? 'noDueReason'
            and locked_task.no_due_reason is distinct from patch_no_due_reason);
    when p_action = 'set_planned' then
      has_delta := locked_task.planned_at is distinct from patch_planned_at;
    when p_action = 'set_priority' then
      has_delta := locked_task.manual_priority is distinct from patch_manual_priority;
    when p_action = 'assign_project' then
      select not exists (
        select 1
        from public.task_projects as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.project_id = patch_project_id
      ) into has_delta;
    when p_action = 'assign_context' then
      select not exists (
        select 1
        from public.task_contexts as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.context_id = patch_context_id
      ) into has_delta;
    else
      -- `assign_person` and `set_waiting_on`, the only two branches step 2's
      -- exhaustive taxonomy `case` can still leave here.
      select not exists (
        select 1
        from public.task_people as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.person_id = patch_person_id
          and held.role = patch_person_role
      ) into has_delta;
  end case;

  if not has_delta then
    raise exception 'Task command transition failed'
      using errcode = 'P0001', detail = '2E_TRANSITION_INTEGRITY';
  end if;

  -- 20. Due consistency against the LOCKED row (2E-UPDATE-012) -----------------
  -- The patch was already proven internally consistent at step 8. What is left
  -- is the row's own flag: a due date landing on an intentionally-undated task
  -- requires the canonical patch to clear both flags atomically, and if it does
  -- not, the caller gets a declared code instead of `tasks_no_due_consistency_check`
  -- surfacing as a raw `23514`.
  if effective_due_at is not null
    and locked_task.intentional_no_due
    and not (
      p_patch ? 'intentionalNoDue'
      and patch_intentional_no_due = false
      and p_patch ? 'noDueReason'
      and pg_catalog.jsonb_typeof(p_patch -> 'noDueReason') = 'null'
    )
  then
    raise exception 'Due date conflicts with the intentional no-due flag'
      using errcode = '22023', detail = '2E_DUE_CONSISTENCY';
  end if;

  -- 21. The domain write --------------------------------------------------------
  -- Every column UPDATE is guarded on the status the evidence recorded, and the
  -- affected count is escalated rather than ignored — the `202607230047:209-221`
  -- optimistic-guard shape. `completed_at` and `cancelled_at` are written on
  -- every status transition, set when and only when entering that status and
  -- cleared when leaving it, mirroring `persistTaskStatus`
  -- (`src/features/operations/actions.ts:148-152`) so the two paths cannot
  -- disagree. One statement serves `complete_task`, `reopen_task` and
  -- `set_status`, which is also how Slice 2E.5 admits `cancel_task` and
  -- `restore_task` without adding a write path.
  if p_action = any(status_writing_actions) then
    update public.tasks
    set
      status = effective_status,
      completed_at = case when effective_status = 'completed' then pg_catalog.now() else null end,
      cancelled_at = case when effective_status = 'cancelled' then pg_catalog.now() else null end
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'rename_task' then
    update public.tasks
    set title = patch_title
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'append_note' then
    update public.tasks
    set description = patch_description
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action in ('reschedule_due', 'clear_due') then
    update public.tasks
    set
      due_at = effective_due_at,
      intentional_no_due = case
        when p_patch ? 'intentionalNoDue' then patch_intentional_no_due
        else locked_task.intentional_no_due
      end,
      no_due_reason = case
        when p_patch ? 'noDueReason' then patch_no_due_reason
        else locked_task.no_due_reason
      end
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'set_planned' then
    update public.tasks
    set planned_at = patch_planned_at
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'set_priority' then
    update public.tasks
    set manual_priority = patch_manual_priority
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  else
    -- The relation actions. `user_id` is written on the row and the composite
    -- owner FKs make a cross-owner relation unrepresentable, so 2E-UPDATE-016
    -- holds by construction rather than by this predicate. The
    -- `on conflict do nothing` is the second idempotency layer
    -- (`202607220044:1249-1257`) and its silent miss is escalated: the
    -- already-linked case is `no_change`, decided at step 11 and re-proven at
    -- step 19, so reaching a conflict here means a row appeared between them.
    if p_action = 'assign_project' then
      relation_table := 'task_projects';
      relation_role := null;
      insert into public.task_projects (task_id, project_id, user_id)
      values (p_task_id, patch_project_id, current_user_id)
      on conflict (task_id, project_id) do nothing
      returning project_id into relation_target_id;
    elsif p_action = 'assign_context' then
      relation_table := 'task_contexts';
      relation_role := null;
      insert into public.task_contexts (task_id, context_id, user_id)
      values (p_task_id, patch_context_id, current_user_id)
      on conflict (task_id, context_id) do nothing
      returning context_id into relation_target_id;
    else
      relation_table := 'task_people';
      relation_role := patch_person_role;
      insert into public.task_people (task_id, person_id, user_id, role)
      values (p_task_id, patch_person_id, current_user_id, patch_person_role)
      on conflict (task_id, person_id, role) do nothing
      returning person_id into relation_target_id;
    end if;
    affected := case when relation_target_id is null then 0 else 1 end;
  end if;

  if affected <> 1 then
    raise exception 'Task command transition failed'
      using errcode = 'P0001', detail = '2E_TRANSITION_INTEGRITY';
  end if;

  -- 22. Reminder reconciliation (§11.3, 2E-UPDATE-011) --------------------------
  if action_touches_reminders then
    -- Close EVERY scheduled row, not one. `reminders` has no unique constraint on
    -- `task_id`, so several scheduled rows are legal, and Slice 2E.3 verified
    -- that a task written before Phase 2E may already hold a live one — which is
    -- why the close half runs first for `reopen_task` too, or reopening could
    -- leave two live reminders. `remind_at` is recorded as an explicitly
    -- formatted string rather than `to_jsonb(timestamptz)`, which renders through
    -- the session `TimeZone` GUC that `set search_path = ''` does not pin.
    with closed as (
      update public.reminders
      set status = 'cancelled'
      where task_id = p_task_id
        and user_id = current_user_id
        and status = 'scheduled'
      returning id, title, remind_at, important
    )
    select
      pg_catalog.count(*)::integer,
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', closed.id,
            'title', closed.title,
            'remind_at', pg_catalog.to_char(closed.remind_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
            'important', closed.important
          )
          order by closed.id
        ),
        '[]'::jsonb
      )
    into reminders_cancelled_count, reminders_cancelled_json
    from closed;

    -- Insert exactly one fresh row when a future due date survives the patch.
    -- The condition is only that the due date is in the future: a full hour of
    -- lead is deliberately NOT required, because "move it to 5pm" typed at
    -- 4:30pm must still produce a reminder, at `now()`. The title is the
    -- *effective* one, so a rename cannot leave the reminder text contradicting
    -- the task; `reminders.title` allows 1..500 against `tasks.title`'s 240, so
    -- copying is always safe. `case when a >= b then a else b end` reproduces
    -- `create_due_task_reminder`'s `greatest(...)` — that special form cannot be
    -- resolved as a `pg_catalog` function under an empty search_path.
    if effective_due_at is not null
      and effective_due_at > pg_catalog.now()
      and effective_status not in ('completed', 'cancelled')
    then
      insert into public.reminders (user_id, task_id, title, remind_at)
      values (
        current_user_id,
        p_task_id,
        effective_title,
        case
          when pg_catalog.now() >= effective_due_at - interval '1 hour'
            then pg_catalog.now()
          else effective_due_at - interval '1 hour'
        end
      )
      returning id into reminder_created_id;
    end if;

    -- One postcondition read back from the table, rather than two comparisons of
    -- a value against itself. Both earlier forms were written and rejected as
    -- structurally unprovokable, which for a declared member of a closed error
    -- vocabulary is the same defect as a missing raise: `jsonb_agg` emits exactly
    -- one element per input row, so `jsonb_array_length(...) <> count(*)` over
    -- that single `closed` CTE could never differ, and `returning id into` on a
    -- plain INSERT against a `gen_random_uuid()` primary key
    -- (`202607160007:33-48`) could never yield NULL.
    --
    -- This has independent provenance on each side: after reconciliation the task
    -- must hold exactly the one reminder this command created, or none when it
    -- created none. The reachable cause is a direct client write —
    -- `authenticated` still holds INSERT and UPDATE on `public.reminders`
    -- (`202607160007:152-166`), which PRD §14 permits and §16.4 records as
    -- residual risk — committing between the close and here, which would leave
    -- the task holding a live reminder this command never disclosed closing.
    -- `rejected_conflict`, retryable, is the truthful answer to that: a retry
    -- closes the newcomer too.
    -- The `case` is parenthesized because plpgsql reads an `if` condition by
    -- scanning for the first `then` at paren-depth zero
    -- (`read_sql_expression(K_THEN)`), so a bare `case … when … then … end` in
    -- this position ends the condition at the `case`'s own `then`. The rest of
    -- the expression is then parsed as statements and the function fails to
    -- create with `42601 syntax error at end of input` — which is exactly how
    -- this line first reached CI. The parentheses put the inner `then` at
    -- depth one, where the scanner ignores it.
    if (
      select pg_catalog.count(*)::integer
      from public.reminders as live_reminder
      where live_reminder.task_id = p_task_id
        and live_reminder.user_id = current_user_id
        and live_reminder.status = 'scheduled'
    ) <> (case when reminder_created_id is null then 0 else 1 end) then
      raise exception 'Task command reminder reconciliation failed'
        using errcode = 'P0001', detail = '2E_REMINDER_INTEGRITY';
    end if;
  end if;

  -- 23. Patch the reservation — mandatory ---------------------------------------
  -- The reservation carried placeholders because the task had not been locked
  -- yet. Forget this UPDATE and undo restores nothing while the recorded
  -- `after_state` claims otherwise. Whatever is recorded here becomes a hard
  -- contract the handlers enforce (`202607220045:85-96` is the precedent), so
  -- under-recording makes undo unconditionally fail. The WHERE clause re-asserts
  -- `user_id`: inside a definer function it is the only tenant boundary.
  undo_before_state := pg_catalog.jsonb_build_object(
    'task_id', p_task_id,
    'action', p_action,
    'status', locked_task.status,
    'title', locked_task.title,
    'description', locked_task.description,
    'due_at', pg_catalog.to_char(locked_task.due_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'planned_at', pg_catalog.to_char(locked_task.planned_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'manual_priority', locked_task.manual_priority,
    'completed_at', pg_catalog.to_char(locked_task.completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'cancelled_at', pg_catalog.to_char(locked_task.cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'intentional_no_due', locked_task.intentional_no_due,
    'no_due_reason', locked_task.no_due_reason,
    'reminders_cancelled', reminders_cancelled_json
  );

  -- The post-forward scalar state, which is the evidence the undo guard needs and
  -- the one thing `before_state` cannot supply. Every value here is what step 21
  -- actually wrote, re-derived from the same inputs rather than read back with a
  -- second SELECT: a re-read would also pick up a concurrent committed write and
  -- record it as this command's own effect, which is the opposite of what the guard
  -- is for. Each branch mirrors the matching branch of step 21 term for term, and
  -- the two terminal timestamps now read `status_writing_actions` rather than a
  -- fourth hand-copy of that list — `completed_at` is the trap: a `rename_task` on
  -- a completed task leaves `effective_status = 'completed'` while the timestamp is
  -- untouched, so the guard is the action, not the status.
  --
  -- `pg_catalog.now()` is `transaction_timestamp()`, fixed for the whole
  -- transaction, so re-evaluating it here yields the identical instant step 21
  -- stored. Instants are formatted exactly as `before_state` formats them and never
  -- with `to_jsonb(timestamptz)`, which renders through the session `TimeZone` GUC
  -- that `set search_path = ''` does not pin; `timestamptz` is microsecond-resolution
  -- and `US` renders all six digits, so the text round-trips back to the stored value
  -- bit for bit and the handler can compare it against a typed column.
  --
  -- Recorded for the relation actions too, where every key falls through to
  -- `locked_task` because their patch touches no column of `public.tasks`. That is
  -- truthful — the relation handler restores no scalar and never reads this — and it
  -- keeps step 23 free of a branch that would have to be kept in step with step 21.
  undo_applied_state := pg_catalog.jsonb_build_object(
    'status', effective_status,
    'title', effective_title,
    'description', case
      when p_action = 'append_note' then patch_description
      else locked_task.description
    end,
    'due_at', pg_catalog.to_char(effective_due_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'planned_at', pg_catalog.to_char(
      case when p_action = 'set_planned' then patch_planned_at else locked_task.planned_at end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    'manual_priority', case
      when p_action = 'set_priority' then patch_manual_priority
      else locked_task.manual_priority
    end,
    'completed_at', pg_catalog.to_char(
      case
        when not (p_action = any(status_writing_actions))
          then locked_task.completed_at
        when effective_status = 'completed' then pg_catalog.now()
        else null::timestamptz
      end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    'cancelled_at', pg_catalog.to_char(
      case
        when not (p_action = any(status_writing_actions))
          then locked_task.cancelled_at
        when effective_status = 'cancelled' then pg_catalog.now()
        else null::timestamptz
      end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    -- These two repeat step 21's own expressions verbatim, keyed on the patch and
    -- not on the action, because that is how step 21 writes them and only
    -- `reschedule_due` may carry either key.
    'intentional_no_due', case
      when p_patch ? 'intentionalNoDue' then patch_intentional_no_due
      else locked_task.intentional_no_due
    end,
    'no_due_reason', case
      when p_patch ? 'noDueReason' then patch_no_due_reason
      else locked_task.no_due_reason
    end
  );

  undo_after_state := pg_catalog.jsonb_build_object(
    'task_id', p_task_id,
    'action', p_action,
    'undo_strategy', action_undo_strategy,
    -- 2E-PROVENANCE-001: the policy version that governed this decision, durably
    -- recorded rather than only hashed into the fingerprint. It reaches
    -- `audit_logs.after_state` through the same object at step 24.
    'policy_version', p_policy_version,
    'request_fingerprint', canonical_fingerprint,
    'applied_patch', p_patch,
    'reminders_cancelled_count', reminders_cancelled_count,
    -- Whether step 22 ran at all, which is what scopes the undo's reminder
    -- post-condition. Derived from the taxonomy here so the handler does not have to
    -- carry a second copy of "which actions touch reminders".
    'reminders_reconciled', action_touches_reminders,
    'reminder_created_id', reminder_created_id,
    -- 2E-DESTRUCTIVE-007's other half. The audit trigger says *who* performed the
    -- write; this says *what authorized it*. A `task_command_applied` row for
    -- `cancel_task` carrying a confirmation id is evidence the database issued
    -- and consumed confirmation for exactly this payload, and it reaches
    -- `audit_logs.after_state` through the same object at step 24. Null for the
    -- thirteen actions the taxonomy does not gate, which is truthful rather than
    -- absent.
    'confirmation_id', consumed_confirmation_id,
    'applied_state', undo_applied_state,
    'relation', case
      when relation_table is null then null::jsonb
      else pg_catalog.jsonb_build_object(
        'table', relation_table,
        'id', relation_target_id,
        'role', relation_role
      )
    end
  );

  update public.undo_operations
  set
    before_state = undo_before_state,
    after_state = undo_after_state
  where id = undo_id and user_id = current_user_id;

  -- 24. audit_logs — the last write ---------------------------------------------
  -- `audit_task_change` co-fires on step 21's UPDATE and writes its own
  -- `task_updated` row with the actor set at step 15, so an applied column
  -- command leaves two rows: this one, which names the operation and carries the
  -- whole before/after payload, and the trigger's, which is what every other
  -- writer of `public.tasks` already produces. That is exactly the pair
  -- `confirm_entry_task_candidates_v6` produces with its trigger `task_created`
  -- row. `reason` is NOT NULL and `source_entry_id` is genuinely absent: a
  -- Phase 2E command has no originating entry (2E-UNDO-005).
  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    before_state,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'task_command_applied',
    'task',
    p_task_id,
    'user',
    undo_before_state,
    undo_after_state,
    'User applied a natural-language task command',
    null
  );

  -- 25. Return -----------------------------------------------------------------
  return pg_catalog.jsonb_build_object(
    'outcome', 'applied',
    'task_id', p_task_id,
    'action', p_action,
    'undo_id', undo_id,
    'idempotent', false,
    'request_fingerprint', canonical_fingerprint,
    'reminders_cancelled', reminders_cancelled_count,
    'reminder_created_id', reminder_created_id,
    'undo_expires_at', pg_catalog.to_char(undo_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')
  );
end;
$$;

create or replace function private.undo_apply_task_command_fields(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  -- Never named `task_id`: `public.reminders` and the three relation tables all
  -- carry a column of that name, and plpgsql's default `variable_conflict =
  -- error` turns such a reference into a runtime ambiguity failure rather than
  -- silently preferring one meaning.
  target_task_id uuid;
  -- The ten scalar columns as the forward UPDATE left them, recorded at the RPC's
  -- step 23. This is the evidence the compensating UPDATE is guarded on; there is no
  -- `expected_status` any more, because guarding one column while writing ten let a
  -- second command's effect be discarded in silence.
  applied_state jsonb;
  recorded_reminders jsonb;
  reminders_restored integer := 0;
  live_reminders integer := 0;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'apply_task_command' then
    raise exception 'Unsupported undo operation' using errcode = 'P0001';
  end if;

  -- Fail closed on the recorded evidence before touching a row. Everything below
  -- restores *from* `before_state` and guards *on* `after_state -> 'applied_state'`,
  -- so an absent or non-object either one means the forward operation's step-23
  -- patch never ran and there is nothing truthful to restore — refusing is the only
  -- honest answer (`202607220045:85-96`).
  --
  -- Every term is `is distinct from`, never `<>`. `jsonb_typeof` is strict and `->`
  -- on an absent key is SQL NULL, so `jsonb_typeof(x -> 'k') <> 'array'` evaluates
  -- to NULL for precisely the shape it is written to refuse; one NULL term makes the
  -- whole `or`-chain NULL unless some other term is already true, and plpgsql treats
  -- a NULL `if` condition as false. That is how this gate first shipped fail-open
  -- for a null `before_state` and for a missing `reminders_cancelled` — the two
  -- shapes the paragraph above claims it refuses — while the element-shape gate
  -- further down already used the correct idiom for the identical reason.
  -- `cardinality(NULL)` is NULL as well, so that term needs it too.
  --
  -- `applied_state` and `reminders_reconciled` are *required*, not defaulted. An
  -- operation recorded before they existed can be neither guarded nor reconciled
  -- truthfully, and refusing it is strictly better than silently falling back to a
  -- status-only guard over a ten-column write. No such row exists anywhere: this
  -- migration has never been applied to the linked project, so this is a contract
  -- statement rather than a compatibility shim.
  if pg_catalog.jsonb_typeof(operation.before_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.before_state -> 'reminders_cancelled')
       is distinct from 'array'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'applied_state')
       is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'reminders_reconciled')
       is distinct from 'boolean'
    -- Slice 2E.5. The recorded action decides whether the creation-undo guard
    -- below applies, so an operation that does not carry one cannot be
    -- compensated safely: `->>` on an absent key is SQL NULL, and a NULL
    -- action would silently take the un-guarded path for a row that might well
    -- be a cancel. Required, not defaulted, for the same reason `applied_state`
    -- and `reminders_reconciled` are.
    or pg_catalog.jsonb_typeof(operation.after_state -> 'action')
       is distinct from 'string'
    or pg_catalog.cardinality(operation.entity_ids) is distinct from 1
  then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  target_task_id := operation.entity_ids[1];
  applied_state := operation.after_state -> 'applied_state';
  recorded_reminders := operation.before_state -> 'reminders_cancelled';

  -- 2E-DESTRUCTIVE-008: the cancel/creation-undo collision -------------------
  -- "A task whose originating creation operation has itself been undone ... is
  -- treated as deleted: a cancel-undo targeting it refuses with `55P03` and a
  -- declared detail code."
  --
  -- **Why the cancel-undo is the one field-undo that needs this, exhaustively.**
  -- `private.undo_confirm_entry_tasks` compensates a creation by cancelling,
  -- with `and status <> 'cancelled'` (`202607250052:310-314`), so on a task the
  -- user had already cancelled it changes nothing at all. The ten scalars
  -- therefore still equal the `applied_state` the cancel recorded, the guard
  -- below passes, and the restore would write `status = 'todo'` — a deleted task
  -- resurrected by a control the product legitimately offers. Every *other*
  -- action's undo is already refused by that same guard, because a creation-undo
  -- forces the row to `cancelled` while their `applied_state.status` is
  -- something else, and `cancel_task` is the only action in PRD §11.2 whose
  -- target status is `cancelled` — `set_status` is bounded to the six
  -- non-terminal precisely so it cannot be a second route. The pgTAP suite
  -- asserts that reasoning rather than trusting it, by proving a non-cancel
  -- field-undo on a creation-undone task is refused by the ten-column guard.
  --
  -- **The `for update` and its position.** Without the lock this is a snapshot
  -- read and a concurrent creation-undo committing afterwards would let the
  -- restore land anyway. With it, this blocks on `public.undo_operation`'s own
  -- `for update` of that row (`202607250052:654-657`) and then sees `undone`. It
  -- runs before the compensating UPDATE touches `public.tasks`, so this handler
  -- takes `undo_operations` before `public.tasks` exactly as its own router
  -- does; the reverse order against a concurrent creation-undo is a deadlock.
  -- The lock covers the family regardless of status while the refusal reads only
  -- `undone` rows, because locking only the `undone` ones would leave an
  -- `available` row free to become one underneath.
  if operation.after_state ->> 'action' is not distinct from 'cancel_task' then
    perform 1
    from public.undo_operations as creation
    where creation.user_id = p_user_id
      and private.is_task_creation_action(creation.action_type)
      and target_task_id = any(creation.entity_ids)
    for update;

    if private.task_creation_undone(p_user_id, target_task_id) then
      raise exception 'Task creation was undone'
        using errcode = '55P03', detail = '2E_CREATION_UNDONE';
    end if;
  end if;

  -- There is no candidate-slot guard here either, for the reason the forward
  -- path records at step 18b: `public.record_entry_task_candidate_confirmation`
  -- writes a `'confirmed'` resolution row for every active candidate task, that
  -- row survives cancellation, and `2C_TERMINAL_DISPOSITION` therefore refuses
  -- the re-confirmation that would take the slot. The only path that frees it is
  -- a creation-undo, which the guard directly above already refuses.

  -- The compensating column write is performed by the system executing a stored
  -- operation, which is what the trigger row describes; the `operation_undone`
  -- row below describes who *asked* for it (`actor = 'user'`). Together they make
  -- user-driven and undo-driven transitions distinguishable in audit at the
  -- trigger layer, which is what 2E-DESTRUCTIVE-007 needs in Slice 2E.5 without
  -- reopening `audit_task_change` again.
  perform pg_catalog.set_config('app.audit_actor', 'system', true);

  -- Guarded on all ten columns this SET list writes, against the state the forward
  -- operation *produced* — not on `status` alone. Undo must refuse when a newer
  -- change would be silently discarded (2E-UPDATE-014, 2E-UNDO-004), and a
  -- status-only guard did not: two commands on one task (a rename, then a
  -- `reschedule_due`) followed by an undo of the *first* left the status untouched,
  -- so the guard matched, the restore wrote `due_at = null` on top of the second
  -- command, and the reminder that command armed stayed `scheduled` on a task with
  -- no due date — reported as `{"undone": true}`.
  --
  -- This is the forward path's twelve-column staleness gate (step 17) in the
  -- compensating direction, and the same shape for the same reason: every term is
  -- `is not distinct from`, because nine of the ten columns are nullable and `=`
  -- would make a NULL column never match and refuse every undo of a task that has
  -- one. `created_at` and `updated_at` are the two the forward gate has and this one
  -- does not: neither is restored here, and `updated_at` moves for any write to any
  -- column outside these ten (`tasks_updated_at`, `202607160003:180`), so guarding
  -- on it would refuse undos that would discard nothing at all.
  --
  -- Narrowing the SET list to the columns the recorded action touches is the other
  -- way to close the same hole, and it is rejected: withdrawn decision D17 makes the
  -- forward status branch write `completed_at` and `cancelled_at` unconditionally,
  -- so a narrowed restore would strand a `completed_at` the forward path cleared.
  update public.tasks
  set
    status = operation.before_state ->> 'status',
    title = operation.before_state ->> 'title',
    description = operation.before_state ->> 'description',
    due_at = (operation.before_state ->> 'due_at')::timestamptz,
    planned_at = (operation.before_state ->> 'planned_at')::timestamptz,
    manual_priority = operation.before_state ->> 'manual_priority',
    completed_at = (operation.before_state ->> 'completed_at')::timestamptz,
    cancelled_at = (operation.before_state ->> 'cancelled_at')::timestamptz,
    intentional_no_due = coalesce(
      (operation.before_state ->> 'intentional_no_due')::boolean,
      false
    ),
    no_due_reason = operation.before_state ->> 'no_due_reason'
  where user_id = p_user_id
    and id = target_task_id
    and status is not distinct from applied_state ->> 'status'
    and title is not distinct from applied_state ->> 'title'
    and description is not distinct from applied_state ->> 'description'
    and due_at is not distinct from (applied_state ->> 'due_at')::timestamptz
    and planned_at is not distinct from (applied_state ->> 'planned_at')::timestamptz
    and manual_priority is not distinct from applied_state ->> 'manual_priority'
    and completed_at is not distinct from (applied_state ->> 'completed_at')::timestamptz
    and cancelled_at is not distinct from (applied_state ->> 'cancelled_at')::timestamptz
    and intentional_no_due
        is not distinct from (applied_state ->> 'intentional_no_due')::boolean
    and no_due_reason is not distinct from applied_state ->> 'no_due_reason';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  -- Reminders are restored by the same close-and-insert mechanism the forward
  -- path used (2E-UPDATE-014). Un-cancelling the recorded ids would be safe only
  -- while the heartbeat keeps selecting `status = 'scheduled'`; inserting fresh
  -- rows is safe under every ordering, because a notification keyed
  -- `'reminder:' || id` makes an id that has already fired unable to fire again.
  -- The recorded `remind_at` is restored verbatim even when it is now past: a
  -- past-due scheduled reminder firing on the next tick is the state that
  -- existed. The cost is dead rows, and that is accepted.
  if operation.after_state ->> 'reminder_created_id' is not null then
    update public.reminders
    set status = 'cancelled'
    where user_id = p_user_id
      and id = (operation.after_state ->> 'reminder_created_id')::uuid
      and status in ('scheduled', 'snoozed');
    -- Deliberately no count check: the heartbeat may already have sent this row,
    -- and a sent reminder is history that undo does not rewrite (ADR-018).
  end if;

  -- Fail closed on the recorded element *shape* before inserting. This is not the
  -- reminder post-condition — that one is below, read back from the table — and the
  -- two are kept apart because they refuse different things. `jsonb_array_elements`
  -- yields exactly one row per element and the evidence gate above already proved
  -- the value is an array, so `reminders_restored <> jsonb_array_length(recorded_reminders)`
  -- compared the array's length against itself: it was written, and rejected as
  -- structurally unprovokable, which for a declared member of the closed `2E_*`
  -- vocabulary is the same defect as no raise at all.
  --
  -- What is genuinely reachable is a recorded element that does not carry the four
  -- fields the forward path writes. `->>` yields NULL for a non-object and for an
  -- absent key, so `public.reminders` would surface a raw `23502` — or a `22007`
  -- out of the instant cast — that no mapper case covers, instead of this slice's
  -- declared code. Whatever the forward path records becomes a hard contract the
  -- undo enforces (`202607220045:85-96`); this states that contract where it can
  -- still refuse cheaply. `is distinct from` on every term, for the reason the
  -- evidence gate above now spells out at length: `jsonb_typeof` of an absent key is
  -- SQL NULL and `NULL <> 'string'` is NULL, so `<>` would let exactly the malformed
  -- element this exists to catch pass straight through. This gate had that idiom
  -- right from the first commit, which is how the evidence gate above — written with
  -- `<>` and documented as fail-closed — was found not to be.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(recorded_reminders) as recorded(value)
    where pg_catalog.jsonb_typeof(recorded.value) is distinct from 'object'
      or pg_catalog.jsonb_typeof(recorded.value -> 'title') is distinct from 'string'
      or pg_catalog.jsonb_typeof(recorded.value -> 'remind_at') is distinct from 'string'
      or pg_catalog.jsonb_typeof(recorded.value -> 'important') is distinct from 'boolean'
  ) then
    raise exception 'Task command undo reminder integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
  end if;

  insert into public.reminders (user_id, task_id, title, remind_at, important)
  select
    p_user_id,
    target_task_id,
    recorded.value ->> 'title',
    (recorded.value ->> 'remind_at')::timestamptz,
    coalesce((recorded.value ->> 'important')::boolean, false)
  from pg_catalog.jsonb_array_elements(recorded_reminders) as recorded(value);
  get diagnostics reminders_restored = row_count;

  -- The reminder post-condition, read back from the table — the forward path's own
  -- shape (its step 22), which this handler was missing. The element gate above
  -- refuses malformed *evidence*, and the forward path cannot write malformed
  -- evidence, so on its own it left `2E_UNDO_REMINDER_INTEGRITY` unraisable from any
  -- state a real operation can reach. That is the identical objection step 22 uses
  -- to reject its own tautological count form, so the file was inconsistent with
  -- itself: a declared member of a closed error vocabulary that no reachable state
  -- can provoke is the same defect as a missing raise.
  --
  -- The expected count is exact, not approximate. The forward reconciliation closed
  -- EVERY `scheduled` row and recorded each one, this handler cancelled the single
  -- row that reconciliation created and re-inserted exactly the recorded ones, and
  -- nothing else in the product inserts a reminder for an existing task —
  -- `create_due_task_reminder` is `after insert on public.tasks` only
  -- (`202607160007:209`), so neither UPDATE above can have added one. What is
  -- reachable on the other side is the direct client write `authenticated` can still
  -- perform, because it keeps INSERT and UPDATE on `public.reminders`
  -- (`202607160007:152-166`, permitted by PRD §14 and recorded as residual risk in
  -- §16.4), committing between the forward close and here: that leaves the task
  -- holding a live reminder no operation in this chain ever disclosed, on top of a
  -- pre-state the undo has just restored. Refusing is retryable and truthful.
  --
  -- Scoped to operations that actually reconciled reminders, from the recorded
  -- `reminders_reconciled` rather than from a second copy of the taxonomy. Run
  -- unconditionally it would refuse the undo of a `rename_task` or an `append_note`
  -- on a task legitimately holding a live reminder neither ever touched: those
  -- actions record an empty array, so the comparison would be against zero.
  if (operation.after_state ->> 'reminders_reconciled')::boolean then
    select pg_catalog.count(*)::integer
    into live_reminders
    from public.reminders as live_reminder
    where live_reminder.task_id = target_task_id
      and live_reminder.user_id = p_user_id
      and live_reminder.status = 'scheduled';
    if live_reminders
      is distinct from pg_catalog.jsonb_array_length(recorded_reminders)
    then
      raise exception 'Task command undo reminder integrity check failed'
        using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
    end if;
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = pg_catalog.now()
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    target_task_id,
    'user',
    operation.after_state,
    pg_catalog.jsonb_build_object(
      'task_id', target_task_id,
      'restored_status', operation.before_state ->> 'status',
      'reminders_restored', reminders_restored
    ),
    'User executed the stored compensating operation',
    operation.source_entry_id
  );

  return pg_catalog.jsonb_build_object(
    'undone', true,
    'affected', affected,
    'reminders_restored', reminders_restored,
    'idempotent', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Read-only creation preview
-- ---------------------------------------------------------------------------

create or replace function public.preview_task_command_creation(
  p_action text,
  p_title_words text[],
  p_patch jsonb,
  p_observed_before text,
  p_policy_version text,
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
  normalized_policy text;
  canonical_payload jsonb;
  canonical_fingerprint text;
  due_at timestamptz;
  reminder_at timestamptz;
  reminder_timing text := 'none';
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
  normalized_policy := pg_catalog.btrim(p_policy_version);
  if normalized_policy is null
    or pg_catalog.char_length(normalized_policy) not between 1 and 64
  then
    raise exception 'Invalid task command policy version' using errcode = '22023';
  end if;

  canonical_payload := private.task_command_creation_payload(
    current_user_id, p_action, p_title_words, p_patch, p_observed_before
  );
  canonical_fingerprint := private.task_command_creation_fingerprint(
    current_user_id, p_action, canonical_payload, normalized_policy, normalized_key
  );

  if canonical_payload ->> 'dueAt' is not null then
    due_at := (canonical_payload ->> 'dueAt')::timestamptz;
    reminder_at := greatest(pg_catalog.now(), due_at - interval '1 hour');
    reminder_timing := case
      when due_at - interval '1 hour' <= pg_catalog.now() then 'at_creation'
      else 'one_hour_before_due'
    end;
  end if;

  return pg_catalog.jsonb_build_object(
    'outcome', 'creation_offered',
    'will_mutate', false,
    'action', p_action,
    'title', canonical_payload ->> 'title',
    'status', 'inbox',
    'canonical_payload', canonical_payload,
    'request_fingerprint', canonical_fingerprint,
    'requires_confirmation', true,
    'reversible', true,
    'undo_window_hours', 24,
    'reminder', pg_catalog.jsonb_build_object(
      'will_create', due_at is not null,
      'remind_at', private.task_command_creation_render_instant(reminder_at),
      'timing', reminder_timing
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-issued creation confirmation
-- ---------------------------------------------------------------------------

create or replace function public.issue_task_command_creation_confirmation(
  p_action text,
  p_title_words text[],
  p_patch jsonb,
  p_observed_before text,
  p_policy_version text,
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
  normalized_policy text;
  canonical_payload jsonb;
  canonical_fingerprint text;
  confirmation_id uuid;
  existing_confirmation public.task_command_confirmations%rowtype;
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
  normalized_policy := pg_catalog.btrim(p_policy_version);
  if normalized_policy is null
    or pg_catalog.char_length(normalized_policy) not between 1 and 64
  then
    raise exception 'Invalid task command policy version' using errcode = '22023';
  end if;

  canonical_payload := private.task_command_creation_payload(
    current_user_id, p_action, p_title_words, p_patch, p_observed_before
  );
  canonical_fingerprint := private.task_command_creation_fingerprint(
    current_user_id, p_action, canonical_payload, normalized_policy, normalized_key
  );

  insert into public.task_command_confirmations (
    user_id, task_id, action, operation_key, request_fingerprint
  ) values (
    current_user_id, null, 'create_task', normalized_key, canonical_fingerprint
  )
  on conflict (user_id, operation_key) do nothing
  returning id into confirmation_id;

  if confirmation_id is not null then
    return pg_catalog.jsonb_build_object(
      'confirmation_id', confirmation_id,
      'action', 'create_task',
      'command_action', p_action,
      'request_fingerprint', canonical_fingerprint,
      'status', 'issued',
      'replayed', false
    );
  end if;

  select confirmation.*
  into existing_confirmation
  from public.task_command_confirmations as confirmation
  where confirmation.user_id = current_user_id
    and confirmation.operation_key = normalized_key
  for update;

  if existing_confirmation.id is null
    or existing_confirmation.request_fingerprint is distinct from canonical_fingerprint
    or existing_confirmation.task_id is not null
    or existing_confirmation.action is distinct from 'create_task'
  then
    raise exception 'Operation key payload mismatch'
      using errcode = 'P0001', detail = '2E_IDEMPOTENCY_MISMATCH';
  end if;

  return pg_catalog.jsonb_build_object(
    'confirmation_id', existing_confirmation.id,
    'action', existing_confirmation.action,
    'command_action', p_action,
    'request_fingerprint', existing_confirmation.request_fingerprint,
    'status', existing_confirmation.status,
    'replayed', true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirmed, replay-safe standalone creation
-- ---------------------------------------------------------------------------

create or replace function public.create_task_command(
  p_action text,
  p_title_words text[],
  p_patch jsonb,
  p_observed_before text,
  p_policy_version text,
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
  normalized_policy text;
  internal_operation_key text;
  canonical_payload jsonb;
  canonical_fingerprint text;
  existing_operation public.undo_operations%rowtype;
  undo_id uuid;
  undo_expires_at timestamptz;
  consumed_confirmation_id uuid;
  confirmation_consumed integer := 0;
  created_task_id uuid;
  relation_type text;
  relation_id uuid;
  person_role text;
  reminder_created_id uuid;
  reminder_count integer := 0;
  reminder_state jsonb;
  applied_state jsonb;
  relation_state jsonb;
  undo_after_state jsonb;
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
  internal_operation_key := 'taskcmd-v1:' || normalized_key;
  normalized_policy := pg_catalog.btrim(p_policy_version);
  if normalized_policy is null
    or pg_catalog.char_length(normalized_policy) not between 1 and 64
  then
    raise exception 'Invalid task command policy version' using errcode = '22023';
  end if;

  canonical_payload := private.task_command_creation_payload(
    current_user_id, p_action, p_title_words, p_patch, p_observed_before
  );
  canonical_fingerprint := private.task_command_creation_fingerprint(
    current_user_id, p_action, canonical_payload, normalized_policy, normalized_key
  );

  -- Reservation. This is the first write and the first lockable row.
  insert into public.undo_operations (
    user_id,
    action_type,
    entity_type,
    entity_ids,
    after_state,
    operation_key,
    request_fingerprint
  ) values (
    current_user_id,
    'create_task_command',
    'task',
    '{}'::uuid[],
    pg_catalog.jsonb_build_object(
      'task_id', null,
      'action', p_action,
      'canonical_payload', canonical_payload,
      'policy_version', normalized_policy,
      'request_fingerprint', canonical_fingerprint,
      'confirmation_id', null,
      'reminder_created_id', null,
      'reminder_state', null,
      'applied_state', null,
      'relations', null
    ),
    internal_operation_key,
    canonical_fingerprint
  )
  on conflict (user_id, operation_key) where operation_key is not null
  do nothing
  returning id, expires_at into undo_id, undo_expires_at;

  if undo_id is null then
    select operation.*
    into existing_operation
    from public.undo_operations as operation
    where operation.user_id = current_user_id
      and operation.operation_key = internal_operation_key
    for update;

    if existing_operation.id is null
      or existing_operation.action_type is distinct from 'create_task_command'
      or existing_operation.request_fingerprint is distinct from canonical_fingerprint
      or existing_operation.after_state ->> 'action' is distinct from p_action
    then
      raise exception 'Operation key payload mismatch'
        using errcode = 'P0001', detail = '2E_IDEMPOTENCY_MISMATCH';
    end if;

    return pg_catalog.jsonb_build_object(
      'outcome', 'applied',
      'task_id', existing_operation.after_state -> 'task_id',
      'action', existing_operation.after_state -> 'action',
      'undo_id', existing_operation.id,
      'idempotent', true,
      'request_fingerprint', existing_operation.after_state -> 'request_fingerprint',
      'reminder_created_id', existing_operation.after_state -> 'reminder_created_id',
      'undo_expires_at', pg_catalog.to_char(
        existing_operation.expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.USOF'
      ),
      'creation_undone', existing_operation.status = 'undone'
    );
  end if;

  -- Confirmation. Replay returned above, so a legitimate retry never consumes.
  update public.task_command_confirmations as confirmation
  set status = 'consumed', consumed_at = pg_catalog.now()
  where confirmation.user_id = current_user_id
    and confirmation.operation_key = normalized_key
    and confirmation.status = 'issued'
    and confirmation.request_fingerprint = canonical_fingerprint
    and confirmation.task_id is null
    and confirmation.action = 'create_task'
  returning confirmation.id into consumed_confirmation_id;
  get diagnostics confirmation_consumed = row_count;
  if confirmation_consumed <> 1 then
    raise exception 'Task creation requires server-issued confirmation'
      using errcode = 'P0001', detail = '2E_CONFIRMATION_REQUIRED';
  end if;

  insert into public.tasks (
    user_id,
    source_entry_id,
    source_interpretation_id,
    candidate_index,
    operation_key,
    title,
    description,
    status,
    manual_priority,
    due_at,
    planned_at,
    confidence,
    created_by,
    intentional_no_due,
    no_due_reason
  ) values (
    current_user_id,
    null,
    null,
    null,
    normalized_key,
    canonical_payload ->> 'title',
    null,
    'inbox',
    canonical_payload ->> 'manualPriority',
    (canonical_payload ->> 'dueAt')::timestamptz,
    (canonical_payload ->> 'plannedAt')::timestamptz,
    1,
    'agent',
    false,
    null
  )
  returning id into created_task_id;

  relation_type := canonical_payload ->> 'relationType';
  relation_id := (canonical_payload ->> 'relationId')::uuid;
  person_role := canonical_payload ->> 'personRole';
  if relation_type = 'project' then
    insert into public.task_projects (user_id, task_id, project_id)
    values (current_user_id, created_task_id, relation_id);
  elsif relation_type = 'context' then
    insert into public.task_contexts (user_id, task_id, context_id)
    values (current_user_id, created_task_id, relation_id);
  elsif relation_type = 'person' then
    insert into public.task_people (user_id, task_id, person_id, role)
    values (current_user_id, created_task_id, relation_id, person_role);
  end if;

  select
    pg_catalog.count(*)::integer,
    (pg_catalog.array_agg(reminder.id order by reminder.id))[1],
    (
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', reminder.id,
          'title', reminder.title,
          'remindAt', private.task_command_creation_render_instant(reminder.remind_at),
          'important', reminder.important
        )
        order by reminder.id
      )
    ) -> 0
  into reminder_count, reminder_created_id, reminder_state
  from public.reminders as reminder
  where reminder.user_id = current_user_id
    and reminder.task_id = created_task_id
    and reminder.status = 'scheduled';

  if (canonical_payload ->> 'dueAt' is null and reminder_count <> 0)
    or (canonical_payload ->> 'dueAt' is not null and reminder_count <> 1)
  then
    raise exception 'Task creation reminder integrity check failed'
      using errcode = 'P0001', detail = '2E_REMINDER_INTEGRITY';
  end if;

  applied_state := pg_catalog.jsonb_build_object(
    'title', canonical_payload ->> 'title',
    'description', null,
    'status', 'inbox',
    'dueAt', canonical_payload -> 'dueAt',
    'plannedAt', canonical_payload -> 'plannedAt',
    'manualPriority', canonical_payload -> 'manualPriority',
    'createdBy', 'agent',
    'sourceEntryId', null,
    'sourceInterpretationId', null,
    'candidateIndex', null,
    'operationKey', normalized_key,
    'intentionalNoDue', false,
    'noDueReason', null
  );
  relation_state := private.task_command_creation_relations(
    current_user_id, created_task_id
  );
  undo_after_state := pg_catalog.jsonb_build_object(
    'task_id', created_task_id,
    'action', p_action,
    'canonical_payload', canonical_payload,
    'policy_version', normalized_policy,
    'request_fingerprint', canonical_fingerprint,
    'confirmation_id', consumed_confirmation_id,
    'reminder_created_id', reminder_created_id,
    'reminder_state', reminder_state,
    'applied_state', applied_state,
    'relations', relation_state
  );

  update public.undo_operations
  set
    entity_ids = array[created_task_id],
    after_state = undo_after_state
  where id = undo_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    before_state,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'task_command_created',
    'task',
    created_task_id,
    'user',
    null,
    undo_after_state,
    'User confirmed a natural-language task creation',
    null
  );

  return pg_catalog.jsonb_build_object(
    'outcome', 'applied',
    'task_id', created_task_id,
    'action', p_action,
    'undo_id', undo_id,
    'idempotent', false,
    'request_fingerprint', canonical_fingerprint,
    'reminder_created_id', reminder_created_id,
    'undo_expires_at', pg_catalog.to_char(
      undo_expires_at,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    'creation_undone', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Creation compensation: cancel the task and its exact still-live reminder
-- ---------------------------------------------------------------------------

create or replace function private.undo_create_task_command(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  target_task public.tasks%rowtype;
  expected_state jsonb;
  expected_relations jsonb;
  current_relations jsonb;
  reminder_evidence jsonb;
  reminder_row public.reminders%rowtype;
  live_reminder_ids uuid[] := array[]::uuid[];
  legitimate_cancel boolean := false;
  affected integer := 0;
  reminder_cancelled integer := 0;
begin
  select stored.*
  into operation
  from public.undo_operations as stored
  where stored.id = p_undo_id and stored.user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'create_task_command'
    or pg_catalog.cardinality(operation.entity_ids) <> 1
    or pg_catalog.jsonb_typeof(operation.after_state -> 'applied_state') <> 'object'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'relations') <> 'object'
  then
    raise exception 'Task creation undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  select task.*
  into target_task
  from public.tasks as task
  where task.user_id = p_user_id
    and task.id = operation.entity_ids[1]
  for update;
  if target_task.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  expected_state := operation.after_state -> 'applied_state';
  expected_relations := operation.after_state -> 'relations';
  current_relations := private.task_command_creation_relations(
    p_user_id, target_task.id
  );

  legitimate_cancel := target_task.status = 'cancelled'
    and target_task.cancelled_at is not null
    and exists (
      select 1
      from public.undo_operations as cancellation
      where cancellation.user_id = p_user_id
        and cancellation.action_type = 'apply_task_command'
        and cancellation.status = 'available'
        and cancellation.after_state ->> 'action' = 'cancel_task'
        and target_task.id = any(cancellation.entity_ids)
    );

  if target_task.title is distinct from expected_state ->> 'title'
    or target_task.description is not null
    or (
      not legitimate_cancel
      and (
        target_task.status is distinct from 'inbox'
        or target_task.cancelled_at is not null
      )
    )
    or target_task.due_at is distinct from (expected_state ->> 'dueAt')::timestamptz
    or target_task.planned_at is distinct from (expected_state ->> 'plannedAt')::timestamptz
    or target_task.manual_priority is distinct from expected_state ->> 'manualPriority'
    or target_task.created_by is distinct from 'agent'
    or target_task.source_entry_id is not null
    or target_task.source_interpretation_id is not null
    or target_task.candidate_index is not null
    or target_task.operation_key is distinct from expected_state ->> 'operationKey'
    or target_task.intentional_no_due is distinct from false
    or target_task.no_due_reason is not null
    or current_relations is distinct from expected_relations
  then
    raise exception 'Task creation undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  reminder_evidence := operation.after_state -> 'reminder_state';

  -- The task row is already locked. Lock every existing reminder row next in
  -- deterministic id order, then derive the complete live set. The task lock
  -- blocks FK-backed inserts while these row locks prevent a non-live reminder
  -- from being concurrently changed to snoozed during reconciliation.
  perform reminder.id
  from public.reminders as reminder
  where reminder.user_id = p_user_id
    and reminder.task_id = target_task.id
  order by reminder.id
  for update;

  select coalesce(
    pg_catalog.array_agg(reminder.id order by reminder.id),
    array[]::uuid[]
  )
  into live_reminder_ids
  from public.reminders as reminder
  where reminder.user_id = p_user_id
    and reminder.task_id = target_task.id
    and reminder.status in ('scheduled', 'snoozed');

  if reminder_evidence is not null and pg_catalog.jsonb_typeof(reminder_evidence) <> 'null' then
    select reminder.*
    into reminder_row
    from public.reminders as reminder
    where reminder.id = (reminder_evidence ->> 'id')::uuid
      and reminder.user_id = p_user_id
      and reminder.task_id = target_task.id
    for update;
    if reminder_row.id is null then
      raise exception 'Task creation undo reminder integrity check failed'
        using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
    end if;
    if reminder_row.status in ('scheduled', 'snoozed') then
      if reminder_row.title is distinct from reminder_evidence ->> 'title'
        or reminder_row.remind_at is distinct from (reminder_evidence ->> 'remindAt')::timestamptz
        or reminder_row.important is distinct from
          (reminder_evidence ->> 'important')::boolean
        or live_reminder_ids is distinct from array[reminder_row.id]
      then
        raise exception 'Task creation undo reminder integrity check failed'
          using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
      end if;
      update public.reminders
      set status = 'cancelled', updated_at = pg_catalog.now()
      where id = reminder_row.id
        and status in ('scheduled', 'snoozed');
      get diagnostics reminder_cancelled = row_count;
      if reminder_cancelled <> 1 then
        raise exception 'Task creation undo reminder integrity check failed'
          using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
      end if;
    elsif pg_catalog.cardinality(live_reminder_ids) <> 0 then
      raise exception 'Task creation undo reminder integrity check failed'
        using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
    end if;
  elsif pg_catalog.cardinality(live_reminder_ids) <> 0 then
    raise exception 'Task creation undo reminder integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
  end if;

  perform pg_catalog.set_config('app.audit_actor', 'system', true);
  if not legitimate_cancel then
    update public.tasks
    set status = 'cancelled', cancelled_at = pg_catalog.now()
    where id = target_task.id and user_id = p_user_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Task creation undo integrity check failed'
        using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
    end if;
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = pg_catalog.now()
  where id = operation.id and user_id = p_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor,
    before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'operation_undone',
    'task',
    target_task.id,
    'user',
    operation.after_state,
    pg_catalog.jsonb_build_object(
      'task_id', target_task.id,
      'creation_undone', true,
      'reminder_cancelled', reminder_cancelled
    ),
    'User executed the stored compensating operation',
    null
  );

  return pg_catalog.jsonb_build_object(
    'undone', true,
    'affected', affected,
    'reminders_cancelled', reminder_cancelled,
    'idempotent', false
  );
end;
$$;

insert into private.undo_operation_handlers (
  action_type, handler_function, description
) values (
  'create_task_command',
  'undo_create_task_command',
  'Phase 2E.6 standalone task creation: cancel the exact created task and its still-live reminder after verifying recorded scalar and relation state.'
)
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- Grants and comments
-- ---------------------------------------------------------------------------

revoke all on function public.preview_task_command_creation(text, text[], jsonb, text, text, text)
  from public, anon;
grant execute on function public.preview_task_command_creation(text, text[], jsonb, text, text, text)
  to authenticated;

revoke all on function public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)
  from public, anon;
grant execute on function public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)
  to authenticated;

revoke all on function public.create_task_command(text, text[], jsonb, text, text, text)
  from public, anon;
grant execute on function public.create_task_command(text, text[], jsonb, text, text, text)
  to authenticated;

revoke all on function private.undo_create_task_command(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function public.preview_task_command_creation(text, text[], jsonb, text, text, text) is
  'Phase 2E.6 read-only standalone-task creation preview. Derives the bounded title, resolves owned relations at observed_before, returns the canonical payload and truthful reminder effect, and never writes.';
comment on function public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text) is
  'Phase 2E.6 server-issued, single-use standalone creation confirmation, bound to owner, command action, canonical payload, policy version and normalized operation key.';
comment on function public.create_task_command(text, text[], jsonb, text, text, text) is
  'Phase 2E.6 confirmed standalone task creation. Reserves undo_operations before confirmation consumption and task insertion, creates inbox work with null candidate provenance and created_by agent, reuses the task insert reminder trigger, audits, and returns exact active-or-undone replay state.';
comment on function private.undo_create_task_command(uuid, uuid) is
  'Phase 2E.6 compensating creation handler. Verifies the recorded scalar, relation and reminder state, cancels the task and exact still-live reminder, and marks the creation undone so every resurrection door stays closed.';

-- ---------------------------------------------------------------------------
-- Fail-closed post-deploy assertions
-- ---------------------------------------------------------------------------

do $$
declare
  preview_body text;
  issuer_body text;
  create_body text;
  undo_body text;
  apply_body text;
  field_undo_body text;
  predicate_body text;
  family_body text;
  bundle text;
  function_name text;
  is_definer boolean;
  definer_config text;
  writable text;
begin
  preview_body := pg_catalog.pg_get_functiondef(
    'public.preview_task_command_creation(text, text[], jsonb, text, text, text)'::regprocedure
  );
  issuer_body := pg_catalog.pg_get_functiondef(
    'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)'::regprocedure
  );
  create_body := pg_catalog.pg_get_functiondef(
    'public.create_task_command(text, text[], jsonb, text, text, text)'::regprocedure
  );
  undo_body := pg_catalog.pg_get_functiondef(
    'private.undo_create_task_command(uuid, uuid)'::regprocedure
  );
  apply_body := pg_catalog.pg_get_functiondef(
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure
  );
  field_undo_body := pg_catalog.pg_get_functiondef(
    'private.undo_apply_task_command_fields(uuid, uuid)'::regprocedure
  );
  predicate_body := pg_catalog.pg_get_functiondef(
    'private.task_creation_undone(uuid, uuid)'::regprocedure
  );
  family_body := pg_catalog.pg_get_functiondef(
    'private.is_task_creation_action(text)'::regprocedure
  );
  bundle := pg_catalog.concat_ws(
    E'\n',
    preview_body,
    issuer_body,
    create_body,
    undo_body,
    apply_body,
    field_undo_body,
    predicate_body,
    family_body
  );

  if position('errcode = ''40001''' in bundle) > 0 then
    raise exception 'Slice 2E.6 reintroduced the gateway-hanging SQLSTATE'
      using errcode = 'P0001';
  end if;

  if position('private.is_task_creation_action(creation.action_type)' in predicate_body) = 0
    or position('private.is_task_creation_action(creation.action_type)' in apply_body) = 0
    or position('private.is_task_creation_action(creation.action_type)' in field_undo_body) = 0
    or position('''create_task_command''' in family_body) = 0
  then
    raise exception 'the creation family is not centralized across all three readers'
      using errcode = 'P0001';
  end if;

  if position('insert into public.undo_operations' in create_body) = 0
    or position('update public.task_command_confirmations' in create_body) = 0
    or position('insert into public.tasks' in create_body) = 0
    or position('insert into public.undo_operations' in create_body)
       > position('update public.task_command_confirmations' in create_body)
    or position('update public.task_command_confirmations' in create_body)
       > position('insert into public.tasks' in create_body)
  then
    raise exception 'create_task_command lost reservation-confirmation-task lock order'
      using errcode = 'P0001';
  end if;

  if position('''creation_undone'', existing_operation.status = ''undone''' in create_body) = 0
    or position('''idempotent'', true' in create_body) = 0
  then
    raise exception 'create_task_command lost exact replay-after-undo semantics'
      using errcode = 'P0001';
  end if;

  if position('source_entry_id' in create_body) = 0
    or position('source_interpretation_id' in create_body) = 0
    or position('candidate_index' in create_body) = 0
    or position('''agent''' in create_body) = 0
    or position('''inbox''' in create_body) = 0
  then
    raise exception 'create_task_command lost standalone provenance or inbox semantics'
      using errcode = 'P0001';
  end if;

  if position('insert into public.reminders' in create_body) > 0
    or not exists (
      select 1
      from pg_catalog.pg_trigger
      where tgrelid = 'public.tasks'::regclass
        and tgname = 'tasks_create_due_reminder'
        and not tgisinternal
    )
  then
    raise exception 'standalone creation stopped reusing create_due_task_reminder'
      using errcode = 'P0001';
  end if;

  if position('detail = ''2E_CONFIRMATION_REQUIRED''' in create_body) = 0
    or position('detail = ''2E_IDEMPOTENCY_MISMATCH''' in create_body) = 0
    or position('detail = ''2E_UNDO_RESTORE_INTEGRITY''' in undo_body) = 0
    or position('detail = ''2E_UNDO_REMINDER_INTEGRITY''' in undo_body) = 0
  then
    raise exception 'a reachable Slice 2E.6 failure lost its declared detail'
      using errcode = 'P0001';
  end if;

  foreach function_name in array array[
    'public.preview_task_command_creation(text, text[], jsonb, text, text, text)',
    'public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)',
    'public.create_task_command(text, text[], jsonb, text, text, text)'
  ]
  loop
    select procedure.prosecdef, pg_catalog.array_to_string(procedure.proconfig, ',')
    into is_definer, definer_config
    from pg_catalog.pg_proc as procedure
    where procedure.oid = function_name::regprocedure;
    if not is_definer or definer_config is distinct from 'search_path=""' then
      raise exception '% lost SECURITY DEFINER or empty search_path', function_name
        using errcode = 'P0001';
    end if;
    if not pg_catalog.has_function_privilege('authenticated', function_name, 'execute')
      or pg_catalog.has_function_privilege('anon', function_name, 'execute')
    then
      raise exception '% has incorrect client grants', function_name
        using errcode = 'P0001';
    end if;
  end loop;

  select pg_catalog.string_agg(
    client_role.name || ':' || privilege.name,
    ', ' order by client_role.name, privilege.name
  )
  into writable
  from pg_catalog.unnest(array['anon', 'authenticated', 'service_role']) as client_role(name)
  cross join pg_catalog.unnest(array['insert', 'update', 'delete']) as privilege(name)
  where pg_catalog.has_table_privilege(
    client_role.name,
    'public.task_command_confirmations',
    privilege.name
  );
  if writable is not null then
    raise exception 'the shared confirmation ledger became client-writable: %', writable
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from private.undo_operation_handlers
    where action_type = 'create_task_command'
      and handler_function = 'undo_create_task_command'
  ) then
    raise exception 'create_task_command is not registered to its undo handler'
      using errcode = 'P0001';
  end if;
end
$$;
