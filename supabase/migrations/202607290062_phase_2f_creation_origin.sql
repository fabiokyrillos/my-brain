-- Phase 2F Slice 2F.3 — manual task-creation convergence.
--
-- ONE migration, one transaction (Supabase applies each file in one), doing
-- exactly three things and nothing else:
--
--   1. `private.task_command_creation_payload` admits ONE explicit bare-creation
--      action, `create_title_only`, whose expected patch-key set is EMPTY. The
--      seven qualifier actions keep their exact patch-key requirements
--      unchanged. No qualifier value is invented for the bare action.
--
--   2. `public.create_task_command` is dropped and recreated under the SAME name
--      with one trailing `p_created_by text default 'agent'`, bounded to the
--      column's own closed domain, replacing the hardcoded `'agent'` literal in
--      its INSERT. Not a `_v2`: a trailing defaulted parameter is a compatible
--      extension, every existing named-argument and positional call resolves,
--      and a versioned pair would leave two live creation write paths — which is
--      the opposite of this phase's invariant. The drop MUST precede the create
--      in the same transaction, or the two overloads raise `42725` on every call
--      (the ambiguity ADR-053 documents).
--
--   3. `private.undo_create_task_command` is replaced BODY-ONLY (same signature)
--      so its integrity guard accepts both valid origins instead of `'agent'`
--      alone. Every other condition and the declared `2E_UNDO_RESTORE_INTEGRITY`
--      contract are preserved, so a user-created task's undo is functional
--      rather than cosmetic.
--
-- PRD Revision 4.1 §6.5a records why the creation family had to be widened at
-- all: it admitted only seven *qualifier-bearing* actions and required an exact
-- patch-key match for each, so it could not represent the manual form's
-- title-only intent — and 2F-CREATE-002's origin change does not close that gap.
--
-- Naming: `create_task` was rejected. It already denotes the *confirmation kind*
-- in `task_command_confirmations.action` (`202607270060:20`), it is a member of
-- the pending-question consequence vocabulary, and it is a prefix of the
-- `create_task_command` undo `action_type`. Reusing it would put two different
-- `action` fields carrying the same literal with different meanings inside this
-- very function (see the confirmation gate below). `create_title_only` had zero
-- prior occurrences and is named for what it carries, exactly as the seven are.
-- It is a creation-family value only and is deliberately NOT a member of the
-- apply taxonomy, so neither `TASK_COMMAND_ACTIONS` nor the Work-surface
-- vocabulary is widened.
--
-- No grant is added, widened or narrowed. No new RPC. No second undo handler.

-- ---------------------------------------------------------------------------
-- 1. Canonical creation payload — admit the bare action
-- ---------------------------------------------------------------------------

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

  -- `create_title_only` is the explicit bare-creation intent (Phase 2F, PRD
  -- Rev 4.1 §6.5a). The seven below are unchanged and still qualifier-bearing.
  if p_action not in (
    'create_title_only',
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
    when 'create_title_only' then array[]::text[]
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
  -- **`array_agg` over zero rows returns NULL, not an empty array.** Without the
  -- coalesce, `{}` for the bare action would compare `null is distinct from
  -- array[]::text[]` — true — and the one action whose patch must be empty would
  -- be the one action that could never be called. The coalesce changes nothing
  -- for the seven: an empty patch still yields `{}`, which is still distinct
  -- from every non-empty expected array, so each of them still refuses it.
  -- Bare `coalesce`, not `pg_catalog.coalesce`: it is a SQL construct with no
  -- `pg_proc` entry, so the qualified form cannot resolve under
  -- `set search_path = ''` and the migration would fail to apply. The 2F.1
  -- grammar-trap guard caught exactly this in the first draft of this file,
  -- which is what that guard exists for.
  if coalesce(actual_patch_keys, array[]::text[])
    is distinct from expected_patch_keys
  then
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

  -- The bare action carries no positive value at all, so it takes no branch:
  -- `due_at`, `planned_at`, `manual_priority`, `relation_*` and `person_role`
  -- all stay null and the canonical payload below renders them as nulls. This
  -- explicit branch is what keeps `create_title_only` out of the relation `else`
  -- below, where it would demand a relation reference it never carries.
  if p_action = 'create_title_only' then
    null;
  elsif p_action = 'reschedule_due' then
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

-- ---------------------------------------------------------------------------
-- 2. create_task_command — drop and recreate with the origin parameter
-- ---------------------------------------------------------------------------
--
-- The drop is unconditional and precedes the create in this same transaction.
-- `create or replace` cannot add a parameter, and `create function` alongside
-- the old one would leave TWO overloads whose calls differ only in a defaulted
-- trailing argument — every existing six-argument call would then raise `42725`
-- (ambiguous function call). ADR-053 documents that failure mode; this ordering
-- is what makes it unreachable.

drop function public.create_task_command(text, text[], jsonb, text, text, text);

create function public.create_task_command(
  p_action text,
  p_title_words text[],
  p_patch jsonb,
  p_observed_before text,
  p_policy_version text,
  p_operation_key text,
  -- Phase 2F Slice 2F.3. Trailing and defaulted, so every pre-existing caller —
  -- named-argument or positional — resolves to exactly the behaviour it had.
  -- Bounded to `tasks_created_by_check`'s own closed domain (`202607160003:117`)
  -- rather than to a new type: the column already constrains it, and a second
  -- vocabulary here would be a copy that can drift.
  p_created_by text default 'agent'
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

  -- Refused before any write, and refused as an invalid *value* rather than
  -- silently coerced: a caller that asked for an origin the column forbids has a
  -- defect, and defaulting it away would persist a provenance nobody chose.
  if p_created_by is null or p_created_by not in ('user', 'agent') then
    raise exception 'Invalid task creation origin' using errcode = '22023';
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
  -- Note that `confirmation.action` is the *confirmation kind* and its only
  -- other value is `'cancel_task'`; it is not `p_action`. That collision is why
  -- the bare creation action is named `create_title_only` and not `create_task`.
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
    -- Was the literal 'agent' (`202607270060:2514`). This one substitution is
    -- the whole of 2F-CREATE-002's write-side change.
    p_created_by,
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
    -- Was the literal 'agent'. The undo handler restores from this record, so a
    -- hardcoded origin here would make the undo evidence describe a task that
    -- was never created.
    'createdBy', p_created_by,
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
    -- Already `'user'` before this migration: the actor is who asked, and both
    -- origins are asked for by the same authenticated human. 2F-CREATE-002's
    -- audit-actor half was therefore already satisfied by the deployed function.
    'user',
    null,
    undo_after_state,
    -- The reason must describe what actually happened. A manually created task
    -- was not "a natural-language task creation", and recording it as one would
    -- make the audit trail wrong about its own origin.
    case p_action
      when 'create_title_only' then 'User created a task directly'
      else 'User confirmed a natural-language task creation'
    end,
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
-- 3. undo_create_task_command — body only, same signature
-- ---------------------------------------------------------------------------
--
-- `create or replace`, not drop-and-recreate: the signature is unchanged, and
-- the handler is referenced by `private.undo_handlers`, whose registry row must
-- keep pointing at it.

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
    -- **Phase 2F Slice 2F.3 — the one clause that changes.** It was
    -- `target_task.created_by is distinct from 'agent'` (`202607270060:2722`),
    -- which made a user-created task's undo raise `2E_UNDO_RESTORE_INTEGRITY`
    -- and so made 2F-CREATE-002's "fully functional undo" unreachable.
    --
    -- Two conditions replace it, not one. The first is the bounded-domain
    -- refusal the PRD specifies. The second preserves what the original clause
    -- was actually *for*: every neighbouring clause proves the row still matches
    -- what was recorded at creation, and a bare domain test would accept every
    -- task ever created, turning this line into a no-op. `applied_state` now
    -- carries the real origin, so comparing against it keeps the guard
    -- meaningful for both origins — and remains correct for every pre-migration
    -- undo row, all of which recorded `'agent'`.
    or target_task.created_by not in ('user', 'agent')
    or target_task.created_by is distinct from expected_state ->> 'createdBy'
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

-- ---------------------------------------------------------------------------
-- 4. Privileges and comments for the recreated signature
-- ---------------------------------------------------------------------------
--
-- `drop function` took the old signature's grants with it, so they are reissued
-- verbatim — the same posture `202607270060:2867-2870` established, no wider.
-- `undo_create_task_command` was replaced rather than dropped, so its grants
-- survive; the revoke below is restated for symmetry and is a no-op.

revoke all on function public.create_task_command(text, text[], jsonb, text, text, text, text)
  from public, anon;
grant execute on function public.create_task_command(text, text[], jsonb, text, text, text, text)
  to authenticated;

revoke all on function private.undo_create_task_command(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function public.create_task_command(text, text[], jsonb, text, text, text, text) is
  'Phase 2E.6 standalone-task creation, extended in Phase 2F Slice 2F.3 with a trailing p_created_by origin (default ''agent'', bounded to (''user'',''agent'')) so manual creation persists ''user'' provenance with functional undo. Consumes a server-issued confirmation, is operation-key idempotent, and records a compensable undo.';

-- ---------------------------------------------------------------------------
-- 5. Post-deploy assertions
-- ---------------------------------------------------------------------------

do $post_deploy$
declare
  create_definition text;
  payload_definition text;
  undo_definition text;
  overloads integer;
  arguments integer;
  defaults integer;
  qualifier text;
begin
  -- Exactly one function of this name, and therefore exactly one callable
  -- signature: the `42725` ambiguity the drop-before-create ordering prevents.
  select pg_catalog.count(*)
  into overloads
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'create_task_command';
  if overloads <> 1 then
    raise exception 'expected exactly one public.create_task_command, found %', overloads;
  end if;

  select procedure.pronargs, procedure.pronargdefaults
  into strict arguments, defaults
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'create_task_command';
  if arguments <> 7 then
    raise exception 'expected create_task_command to take 7 arguments, found %', arguments;
  end if;

  -- **This is what makes every pre-existing six-argument call still resolve**,
  -- and it is asserted rather than demonstrated for a reason: `regprocedure`
  -- resolves a signature by *exact* argument types and ignores defaults
  -- entirely, so `create_task_command(text, text[], jsonb, text, text, text)`
  -- would fail to look up even though a six-argument *call* resolves fine. One
  -- function, seven parameters, one default is the whole condition; a six-arg
  -- `::regprocedure` probe here would fail the migration for the wrong reason.
  if defaults <> 1 then
    raise exception 'expected exactly one defaulted argument, found %', defaults;
  end if;

  create_definition := pg_catalog.pg_get_functiondef(
    'public.create_task_command(text, text[], jsonb, text, text, text, text)'::regprocedure
  );
  payload_definition := pg_catalog.pg_get_functiondef(
    'private.task_command_creation_payload(uuid, text, text[], jsonb, text)'::regprocedure
  );
  undo_definition := pg_catalog.pg_get_functiondef(
    'private.undo_create_task_command(uuid, uuid)'::regprocedure
  );

  -- The origin is bounded, defaulted, and actually written.
  if create_definition not like '%p_created_by text DEFAULT ''agent''%' then
    raise exception 'create_task_command lost its defaulted origin parameter';
  end if;
  if create_definition not like '%p_created_by not in (''user'', ''agent'')%' then
    raise exception 'create_task_command lost its bounded origin domain';
  end if;
  -- The INSERT writes the parameter. Asserted positively rather than by looking
  -- for the absence of the old literal: `'agent'` legitimately survives in the
  -- parameter default and the domain check, so an absence test would be either
  -- false-positive or so narrowly anchored to whitespace that a reformat breaks it.
  if create_definition not like '%    p_created_by,
    false,
    null
  )
  returning id into created_task_id;%' then
    raise exception 'create_task_command does not write p_created_by into tasks.created_by';
  end if;
  if create_definition not like '%''createdBy'', p_created_by,%' then
    raise exception 'the undo evidence does not record the real creation origin';
  end if;

  -- The bare action exists and its expected patch-key set is empty.
  if payload_definition not like '%''create_title_only''%' then
    raise exception 'the creation payload does not admit create_title_only';
  end if;
  if payload_definition not like '%when ''create_title_only'' then array[]::text[]%' then
    raise exception 'create_title_only does not declare an empty expected patch-key set';
  end if;
  if payload_definition not like '%coalesce(actual_patch_keys, array[]::text[])%' then
    raise exception 'the patch-key comparison would refuse an empty patch as NULL';
  end if;

  -- Every qualifier action still demands its own exact key. This is the
  -- assertion that would fail if the bare action had been added by making empty
  -- patches valid everywhere.
  foreach qualifier in array array[
    'when ''reschedule_due'' then array[''dueAt'']',
    'when ''set_planned'' then array[''plannedAt'']',
    'when ''set_priority'' then array[''priority'']',
    'when ''assign_project'' then array[''projectRef'']',
    'when ''assign_context'' then array[''contextRef'']',
    'when ''assign_person'' then array[''personRef'']',
    'when ''set_waiting_on'' then array[''personRef'']'
  ] loop
    if payload_definition not like '%' || qualifier || '%' then
      raise exception 'a qualifier action lost its exact patch-key requirement: %', qualifier;
    end if;
  end loop;

  -- The undo guard accepts both valid origins and nothing wider.
  if undo_definition not like '%created_by not in (''user'', ''agent'')%' then
    raise exception 'the creation-undo guard does not bound the origin domain';
  end if;
  if undo_definition like '%created_by is distinct from ''agent''%' then
    raise exception 'the creation-undo guard still refuses every non-agent origin';
  end if;
  if undo_definition not like '%2E_UNDO_RESTORE_INTEGRITY%' then
    raise exception 'the creation-undo guard lost its declared error contract';
  end if;

  -- Grants unchanged: authenticated executes, nobody wider.
  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_task_command(text, text[], jsonb, text, text, text, text)'::regprocedure,
    'execute'
  ) then
    raise exception 'authenticated cannot execute the recreated create_task_command';
  end if;
  if pg_catalog.has_function_privilege(
    'anon',
    'public.create_task_command(text, text[], jsonb, text, text, text, text)'::regprocedure,
    'execute'
  ) then
    raise exception 'anon can execute create_task_command';
  end if;
  if pg_catalog.has_function_privilege(
    'authenticated',
    'private.undo_create_task_command(uuid, uuid)'::regprocedure,
    'execute'
  ) then
    raise exception 'authenticated can execute the private undo handler directly';
  end if;

  -- The registry still routes the action type at this handler.
  if not exists (
    select 1
    from private.undo_handlers as handler
    where handler.action_type = 'create_task_command'
      and handler.handler_function = 'private.undo_create_task_command'
  ) then
    raise exception 'the creation-undo handler registry row is missing or re-pointed';
  end if;
end;
$post_deploy$;
