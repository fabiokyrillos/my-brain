-- Phase 2P slice 2P.1 — one central lifecycle re-derivation contract.
--
-- WHAT IS BROKEN
--
-- public.interpretation_lifecycle_status is IMMUTABLE and reads only the
-- interpretation's own JSON. It takes no entry id and no owner id, so it can
-- never know what the owner has since resolved. Three functions call it, all
-- at write time. Twelve functions record the owner's resolutions and none of
-- them touch public.entries. An entry therefore keeps, forever, the status its
-- interpretation asked for on the day it was written, and
-- public.list_needs_attention returns 'review_interpretation' for
-- 'awaiting_review' and 'partially_processed' unconditionally, before any of
-- its finer predicates run. Measured on the hosted database: two of the
-- owner's three entries are held in Needs You with nothing left to decide.
--
-- WHY THIS IS NOT TWELVE PATCHES
--
-- The union of everything the twelve resolution functions write is four
-- tables: public.tasks, public.entry_task_candidate_resolutions,
-- public.pending_questions and public.entry_person_candidate_resolutions.
-- Binding the contract to those tables reaches every one of the twelve --
-- including the six the application never calls but 'authenticated' can still
-- reach through PostgREST, including the superseded versions, and including
-- direct DML -- from a single definition. A thirteenth resolution path added
-- later inherits the contract without being told it exists. Twelve copies of
-- the rule would have left six routes with the old behaviour and would have
-- been twelve places for the next divergence to start.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
-- It changes no existing grant, no RLS policy, no retention rule and no
-- EXECUTE privilege on any function that already exists. The two
-- service_role-only resolution functions stay service_role-only. Nothing in
-- private gains a grant. The one new privilege is EXECUTE on the new
-- public.confirm_entry_interpretation to 'authenticated', which is the
-- requirement's own object. It rewrites no status outside the three the
-- contract governs, so 'saved', 'interpreting', 'reprocessing',
-- 'recoverable_error', 'terminal_error' and 'awaiting_ai_configuration' keep
-- their existing authority untouched.
--
-- The rejected candidate 202608170098_confirm_entry_interpretation.sql is not
-- reused, not copied and not counted as delivery. Its six recorded defects are
-- each answered below: both statuses are accepted, the terminal state is
-- re-derived rather than forced, undo is registered against the handler
-- registry, audit rows carry entity_id, 'reason' carries prose only, and
-- deduplication uses the real unique key on (user_id, operation_key) rather
-- than the current status.

-- ---------------------------------------------------------------------------
-- 1. Normalizing the stored policy shape.
--
-- interpretation_lifecycle_status reads `value ->> 'policy'`, i.e. the nested
-- trust form {key: {policy: ...}} that model_only_element_trust produces.
-- entry_interpretations.element_policy stores the FLATTENED form
-- {key: "policy"}. Executing the deployed function on both shapes returns
-- 'completed' for the flattened one and 'awaiting_review' for the nested one,
-- so a re-derivation that fed the stored column straight back in would have
-- silently completed every entry in the product. This normalizes first, and
-- accepts either shape so an older row cannot change the answer.
-- ---------------------------------------------------------------------------

create or replace function private.normalized_element_trust(p_element_policy jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select pg_catalog.jsonb_object_agg(
        entry.key,
        case
          when pg_catalog.jsonb_typeof(entry.value) = 'object' then entry.value
          else pg_catalog.jsonb_build_object('policy', entry.value #>> '{}')
        end
      )
      from pg_catalog.jsonb_each(coalesce(p_element_policy, '{}'::jsonb)) as entry
    ),
    '{}'::jsonb
  );
$$;

revoke all on function private.normalized_element_trust(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE CENTRAL CONTRACT: which real decisions are still open.
--
-- Returns NULL when the entry is not in a lifecycle state this contract
-- governs -- that is how it declines authority it was not given, rather than
-- acquiring it by omission. Otherwise it returns the classes of decision that
-- genuinely remain, and an empty array means genuinely nothing remains.
--
-- The open-question and unconfirmed-candidate predicates are deliberately the
-- same ones public.list_needs_attention already computes, so the queue and the
-- status can no longer disagree about what "unresolved" means.
-- ---------------------------------------------------------------------------

create or replace function private.entry_pending_decisions(p_user_id uuid, p_entry_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owned_entry public.entries%rowtype;
  interpretation public.entry_interpretations%rowtype;
  decisions text[] := array[]::text[];
begin
  if p_user_id is null or p_entry_id is null then
    return null;
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = p_user_id;
  if owned_entry.id is null then
    return null;
  end if;

  -- Everything else belongs to capture, the worker or the error lifecycle.
  if owned_entry.status not in ('awaiting_review', 'partially_processed', 'completed') then
    return null;
  end if;
  if owned_entry.current_interpretation_id is null then
    return null;
  end if;

  select * into interpretation
  from public.entry_interpretations
  where id = owned_entry.current_interpretation_id
    and entry_id = owned_entry.id
    and user_id = p_user_id;
  if interpretation.id is null then
    return null;
  end if;

  -- (a) An open question, or a snoozed one past its deadline.
  if exists (
    select 1
    from public.pending_questions as question
    where question.user_id = p_user_id
      and question.entry_id = p_entry_id
      and (
        question.status = 'open'
        or (
          question.status = 'snoozed'
          and question.snoozed_until is not null
          and question.snoozed_until <= pg_catalog.now()
        )
      )
  ) then
    decisions := decisions || 'open_question'::text;
  end if;

  -- A record-only interpretation asks for nothing else. An open question is
  -- still an open question, which is why this sits after (a) and before the
  -- rest rather than at the top.
  if coalesce(interpretation.is_record_only, false) then
    return decisions;
  end if;

  -- (b) A task candidate with neither a live task nor a resolution row, for
  -- the CURRENT interpretation.
  if exists (
    select 1
    from pg_catalog.generate_series(
      0,
      pg_catalog.jsonb_array_length(coalesce(interpretation.task_candidates, '[]'::jsonb)) - 1
    ) as slot(idx)
    where not exists (
      select 1
      from public.tasks as task
      where task.user_id = p_user_id
        and task.source_entry_id = p_entry_id
        and task.candidate_index = slot.idx
        and task.status <> 'cancelled'
        and (
          task.source_interpretation_id = owned_entry.current_interpretation_id
          or task.source_interpretation_id is null
        )
    )
    and not exists (
      select 1
      from public.entry_task_candidate_resolutions as resolution
      where resolution.user_id = p_user_id
        and resolution.entry_id = p_entry_id
        and resolution.interpretation_id = owned_entry.current_interpretation_id
        and resolution.candidate_index = slot.idx
    )
  ) then
    decisions := decisions || 'task_candidate'::text;
  end if;

  -- (c) A person candidate with no resolution row for the current
  -- interpretation.
  if exists (
    select 1
    from pg_catalog.generate_series(
      0,
      pg_catalog.jsonb_array_length(coalesce(interpretation.extracted_people, '[]'::jsonb)) - 1
    ) as slot(idx)
    where not exists (
      select 1
      from public.entry_person_candidate_resolutions as resolution
      where resolution.user_id = p_user_id
        and resolution.entry_id = p_entry_id
        and resolution.interpretation_id = owned_entry.current_interpretation_id
        and resolution.candidate_index = slot.idx
    )
  ) then
    decisions := decisions || 'person_candidate'::text;
  end if;

  -- (d) An element policy that demands review, with no live owner
  -- confirmation for THIS interpretation. This is the only class no
  -- resolution action can clear, because it names elements of the
  -- interpretation as a whole -- which is why the positive confirmation act
  -- below has to exist at all.
  if public.interpretation_lifecycle_status(
       '[]'::jsonb,
       private.normalized_element_trust(interpretation.element_policy),
       false
     ) = 'awaiting_review'
     and not exists (
       select 1
       from public.undo_operations as operation
       where operation.user_id = p_user_id
         and operation.action_type = 'confirm_entry_interpretation'
         and operation.source_entry_id = p_entry_id
         and operation.source_interpretation_id = owned_entry.current_interpretation_id
         and operation.status <> 'undone'
     )
  then
    decisions := decisions || 'element_policy'::text;
  end if;

  return decisions;
end;
$$;

revoke all on function private.entry_pending_decisions(uuid, uuid) from public, anon, authenticated;

-- The single mapping from "what remains" to "what the entry's status is".
-- Every route reaches this and no route carries a second copy of it.
create or replace function private.entry_lifecycle_state(p_user_id uuid, p_entry_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  decisions text[];
begin
  decisions := private.entry_pending_decisions(p_user_id, p_entry_id);
  if decisions is null then
    return null;
  end if;
  if 'open_question' = any(decisions) then
    return 'partially_processed';
  end if;
  if pg_catalog.cardinality(decisions) > 0 then
    return 'awaiting_review';
  end if;
  return 'completed';
end;
$$;

revoke all on function private.entry_lifecycle_state(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2b. THE ONE NARROW EXCEPTION: a re-derivation preserves entries.updated_at.
--
-- Owner decision, slice 2P.1: a change of DERIVED state alone must not make an
-- old entry look new, and must not silently move it to the top of "Needs You".
-- public.list_needs_attention orders by entries.updated_at, and
-- public.set_updated_at writes now(), which is TRANSACTION time -- so without
-- this, resolving one decision would both re-rank that entry and collapse
-- every entry re-derived in the same transaction onto a single timestamp,
-- destroying the queue's deterministic order.
--
-- Real changes of content keep stamping updated_at exactly as they do today.
-- The exception is built so that it cannot be widened by accident:
--
--   * public.set_updated_at is NOT modified. Every other table, and every
--     other update of public.entries, keeps today's behaviour.
--   * No trigger is ever disabled, so there is no window in which another
--     session's write escapes the timestamp rule.
--   * The marker is a TRANSACTION-LOCAL setting (set_config(..., true)). It is
--     invisible to other sessions, dies with the transaction and does not
--     survive a rollback -- which is what makes it safe under concurrency,
--     where a table flag or an advisory lock would not be.
--   * It carries the ENTRY ID rather than a boolean, and the trigger compares
--     it against the row it is deciding about. A marker somehow left set could
--     therefore only ever concern the one entry already being concluded about.
--   * rederive_entry_lifecycle restores the previous marker value immediately
--     after its update, so no state leaks forward to a later operation in the
--     same transaction.
--   * AND the trigger independently requires that `status` is the ONLY column
--     that changed. A real content change is therefore still stamped even if
--     both mechanisms above were defeated. The comparison is written over the
--     whole row rather than column by column, so a column added later is
--     protected without anyone remembering to add it here.
--
-- PostgreSQL fires BEFORE ROW triggers in name order, and this name sorts
-- after entries_updated_at, so it runs last and sees what set_updated_at wrote.
-- ---------------------------------------------------------------------------

create or replace function private.preserve_updated_at_on_rederivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Not this entry's re-derivation: leave the stamp exactly as written.
  if pg_catalog.current_setting('my_brain.lifecycle_rederivation_entry', true)
     is distinct from new.id::text
  then
    return new;
  end if;
  -- Nothing derived actually moved.
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- Something other than the derived state moved: that is a real change.
  if (pg_catalog.to_jsonb(new) - 'status' - 'updated_at')
     is distinct from (pg_catalog.to_jsonb(old) - 'status' - 'updated_at')
  then
    return new;
  end if;
  new.updated_at := old.updated_at;
  return new;
end;
$$;

revoke all on function private.preserve_updated_at_on_rederivation() from public, anon, authenticated;

drop trigger if exists entries_zz_preserve_updated_at_on_rederivation on public.entries;
create trigger entries_zz_preserve_updated_at_on_rederivation
before update on public.entries
for each row execute function private.preserve_updated_at_on_rederivation();

-- ---------------------------------------------------------------------------
-- 3. Applying the contract.
--
-- Locks the entry first, so two concurrent resolutions serialize on the row
-- they both conclude about rather than racing to write different answers.
-- Writes only when the status actually changes, so a replay produces no second
-- audit row. Touches no column other than status -- and, per 2b, not even the
-- timestamp that would otherwise follow from touching it.
-- ---------------------------------------------------------------------------

create or replace function private.rederive_entry_lifecycle(p_user_id uuid, p_entry_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
  next_status text;
  previous_marker text;
begin
  if p_user_id is null or p_entry_id is null then
    return null;
  end if;

  select entry.status into previous_status
  from public.entries as entry
  where entry.id = p_entry_id and entry.user_id = p_user_id
  for update;
  if previous_status is null then
    return null;
  end if;

  next_status := private.entry_lifecycle_state(p_user_id, p_entry_id);
  if next_status is null or next_status = previous_status then
    return previous_status;
  end if;

  -- Marked, written, unmarked. The marker is transaction-local and names this
  -- entry, and the previous value is restored rather than cleared so a nested
  -- re-derivation could not strand it. See 2b.
  previous_marker := pg_catalog.current_setting('my_brain.lifecycle_rederivation_entry', true);
  perform pg_catalog.set_config('my_brain.lifecycle_rederivation_entry', p_entry_id::text, true);

  update public.entries
  set status = next_status
  where id = p_entry_id and user_id = p_user_id;

  perform pg_catalog.set_config(
    'my_brain.lifecycle_rederivation_entry', coalesce(previous_marker, ''), true
  );

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor,
    before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'entry_lifecycle_rederived',
    'entry',
    p_entry_id,
    'system',
    pg_catalog.jsonb_build_object('status', previous_status),
    pg_catalog.jsonb_build_object('status', next_status),
    'Entry lifecycle re-derived from the decisions that genuinely remain',
    p_entry_id
  );

  return next_status;
end;
$$;

revoke all on function private.rederive_entry_lifecycle(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reaching every route.
--
-- One trigger function for all four tables. The owner and entry columns are
-- read out of the row as jsonb rather than by name, because the four tables
-- disagree ('entry_id' on three, 'source_entry_id' on tasks) and two copies of
-- the function would be two places for them to drift.
-- ---------------------------------------------------------------------------

create or replace function private.rederive_entry_lifecycle_from_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  old_entry uuid;
  new_entry uuid;
begin
  if tg_op <> 'INSERT' then
    old_row := pg_catalog.to_jsonb(old);
    old_entry := coalesce(old_row ->> 'entry_id', old_row ->> 'source_entry_id')::uuid;
    perform private.rederive_entry_lifecycle((old_row ->> 'user_id')::uuid, old_entry);
  end if;

  if tg_op <> 'DELETE' then
    new_row := pg_catalog.to_jsonb(new);
    new_entry := coalesce(new_row ->> 'entry_id', new_row ->> 'source_entry_id')::uuid;
    -- On UPDATE the old branch already concluded about this entry unless the
    -- row moved to a different owner or a different entry.
    if tg_op = 'INSERT'
       or (new_row ->> 'user_id') is distinct from (old_row ->> 'user_id')
       or new_entry is distinct from old_entry
    then
      perform private.rederive_entry_lifecycle((new_row ->> 'user_id')::uuid, new_entry);
    end if;
  end if;

  return null;
end;
$$;

revoke all on function private.rederive_entry_lifecycle_from_row() from public, anon, authenticated;

drop trigger if exists tasks_rederive_entry_lifecycle on public.tasks;
create trigger tasks_rederive_entry_lifecycle
after insert or update or delete on public.tasks
for each row execute function private.rederive_entry_lifecycle_from_row();

drop trigger if exists entry_task_candidate_resolutions_rederive_entry_lifecycle
  on public.entry_task_candidate_resolutions;
create trigger entry_task_candidate_resolutions_rederive_entry_lifecycle
after insert or update or delete on public.entry_task_candidate_resolutions
for each row execute function private.rederive_entry_lifecycle_from_row();

drop trigger if exists pending_questions_rederive_entry_lifecycle on public.pending_questions;
create trigger pending_questions_rederive_entry_lifecycle
after insert or update or delete on public.pending_questions
for each row execute function private.rederive_entry_lifecycle_from_row();

drop trigger if exists entry_person_candidate_resolutions_rederive_entry_lifecycle
  on public.entry_person_candidate_resolutions;
create trigger entry_person_candidate_resolutions_rederive_entry_lifecycle
after insert or update or delete on public.entry_person_candidate_resolutions
for each row execute function private.rederive_entry_lifecycle_from_row();

-- ---------------------------------------------------------------------------
-- 5. The positive act.
--
-- The element-policy class names the interpretation as a whole, so no
-- resolution action can ever clear it and an entry carrying it would stay in
-- Needs You even with every question answered and every candidate confirmed.
-- This is the owner saying "I read it and it is right" -- and nothing more. It
-- refuses while any OTHER decision remains, so it can never be used to hide an
-- unanswered question.
--
-- p_operation_key is text, matching every other operation key in this schema
-- and the 8..260 character constraint on undo_operations. It deduplicates
-- through the real unique index undo_operations_operation_key_idx on
-- (user_id, operation_key) -- never through the current status.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_entry_interpretation(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  existing public.undo_operations%rowtype;
  decisions text[];
  blocking text[];
  undo_id uuid;
  resulting_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_key is null
     or pg_catalog.char_length(p_operation_key) < 8
     or pg_catalog.char_length(p_operation_key) > 260
  then
    raise exception 'Operation key is required' using errcode = '22023';
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  if owned_entry.current_interpretation_id is distinct from p_expected_interpretation_id then
    -- 55P03, never 40001: SQLSTATE 40001 hangs the gateway (ADR/migration 050).
    raise exception 'Interpretation is no longer current' using errcode = '55P03';
  end if;

  -- Replay of THIS key. Keyed on the key, so a different key on an already
  -- confirmed entry is not silently answered as if it were this one.
  select * into existing
  from public.undo_operations
  where user_id = current_user_id and operation_key = p_operation_key;
  if existing.id is not null then
    if existing.action_type <> 'confirm_entry_interpretation'
       or existing.source_entry_id is distinct from p_entry_id
       or existing.source_interpretation_id is distinct from p_expected_interpretation_id
    then
      raise exception 'Operation key belongs to a different operation' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
      'entryId', owned_entry.id,
      'undoId', existing.id,
      'status', owned_entry.status,
      'idempotent', true
    );
  end if;

  decisions := private.entry_pending_decisions(current_user_id, p_entry_id);
  if decisions is null then
    raise exception 'Entry lifecycle is not confirmable' using errcode = '55P03';
  end if;

  blocking := array(select unnest(decisions) except select 'element_policy');
  if pg_catalog.cardinality(blocking) > 0 then
    raise exception 'Unresolved decisions remain'
      using errcode = '55P03',
            detail = pg_catalog.array_to_string(blocking, ',');
  end if;

  -- A live confirmation already exists for this interpretation under a
  -- different key. Concurrency and replay must not produce a second one.
  select * into existing
  from public.undo_operations
  where user_id = current_user_id
    and action_type = 'confirm_entry_interpretation'
    and source_entry_id = p_entry_id
    and source_interpretation_id = p_expected_interpretation_id
    and status <> 'undone';
  if existing.id is not null then
    return pg_catalog.jsonb_build_object(
      'entryId', owned_entry.id,
      'undoId', existing.id,
      'status', owned_entry.status,
      'idempotent', true
    );
  end if;

  insert into public.undo_operations (
    user_id, action_type, entity_type, entity_ids,
    before_state, after_state,
    operation_key, source_entry_id, source_interpretation_id
  ) values (
    current_user_id,
    'confirm_entry_interpretation',
    'entry',
    array[p_entry_id],
    pg_catalog.jsonb_build_object('status', owned_entry.status, 'confirmed', false),
    pg_catalog.jsonb_build_object('status', 'completed', 'confirmed', true),
    p_operation_key,
    p_entry_id,
    p_expected_interpretation_id
  )
  returning id into undo_id;

  resulting_status := private.rederive_entry_lifecycle(current_user_id, p_entry_id);

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor,
    before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'interpretation_confirmed',
    'entry',
    p_entry_id,
    'user',
    pg_catalog.jsonb_build_object(
      'status', owned_entry.status,
      'interpretation_id', owned_entry.current_interpretation_id
    ),
    pg_catalog.jsonb_build_object(
      'status', resulting_status,
      'interpretation_id', owned_entry.current_interpretation_id
    ),
    'User confirmed the interpretation had nothing left to decide',
    p_entry_id
  );

  return pg_catalog.jsonb_build_object(
    'entryId', owned_entry.id,
    'undoId', undo_id,
    'status', resulting_status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.confirm_entry_interpretation(uuid, uuid, text) from public, anon;
grant execute on function public.confirm_entry_interpretation(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A true undo.
--
-- It restores the prior state by RE-DERIVING it, not by reimposing a
-- remembered snapshot. If the owner resolved something else in between, the
-- restored state is the truthful one rather than a stale one, and no
-- unresolved decision is fabricated.
-- ---------------------------------------------------------------------------

create or replace function private.undo_confirm_entry_interpretation(p_user_id uuid, p_undo_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  restored_status text;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'confirm_entry_interpretation' then
    raise exception 'Unsupported undo operation';
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = pg_catalog.now()
  where id = operation.id;

  restored_status := private.rederive_entry_lifecycle(p_user_id, operation.source_entry_id);

  -- The confirmation really has to be gone. A handler that reported success
  -- while the entry stayed completed would be worse than no undo at all.
  if restored_status is null
     or exists (
       select 1
       from public.undo_operations as live
       where live.user_id = p_user_id
         and live.action_type = 'confirm_entry_interpretation'
         and live.source_entry_id = operation.source_entry_id
         and live.source_interpretation_id = operation.source_interpretation_id
         and live.status <> 'undone'
     )
  then
    raise exception 'Entry confirmation undo integrity check failed'
      using errcode = 'P0001', detail = '2P_UNDO_RESTORE_INTEGRITY';
  end if;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor,
    before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    operation.source_entry_id,
    'user',
    operation.after_state,
    pg_catalog.jsonb_build_object('status', restored_status, 'confirmed', false),
    'User executed the stored compensating operation',
    operation.source_entry_id
  );

  return pg_catalog.jsonb_build_object('undone', true, 'affected', 1, 'idempotent', false);
end;
$$;

revoke all on function private.undo_confirm_entry_interpretation(uuid, uuid) from public, anon, authenticated;

insert into private.undo_operation_handlers (action_type, handler_function, description)
values (
  'confirm_entry_interpretation',
  'undo_confirm_entry_interpretation',
  'Withdraws the owner''s interpretation confirmation and re-derives the entry lifecycle from the decisions that genuinely remain.'
)
on conflict (action_type) do update
  set handler_function = excluded.handler_function,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- 7. Aligning the queue with the contract.
--
-- Until now entries.status could never move, so the branch
--   entry_status in ('awaiting_review','partially_processed') -> review_interpretation
-- was only ever reached by an entry nobody had touched, and the finer reasons
-- below it were gated on status = 'completed'. Making the status truthful makes
-- those finer reasons LESS reachable, not more: an entry with one unconfirmed
-- candidate is now correctly 'awaiting_review', and the generic branch would
-- swallow 'confirm_existing_candidates'. The entry never wrongly LEAVES the
-- queue -- it stays under a less specific reason -- but that is a regression
-- against 2P-ATTENTION-004, "the entry states exactly what remains unresolved".
--
-- The correction, authorized by the owner inside this same migration:
--
--   * the finer predicates are evaluated BEFORE the generic status branch;
--   * they no longer depend on status = 'completed', but on the three statuses
--     this contract actually governs -- the same gate private.entry_pending_
--     decisions uses, so the queue and the status cannot disagree;
--   * review_interpretation therefore now means exactly one thing: only the
--     interpretation-wide confirmation is left, i.e. exactly what
--     public.confirm_entry_interpretation exists to clear;
--   * an unresolved person candidate is a real pending decision (owner
--     decision, slice 2P.1) and reports 'confirm_existing_candidates' -- the
--     deployed reason whose copy in both locales already reads "decide about
--     the suggestions / choose what should happen to each pending suggestion",
--     which is precisely this. It is NOT routed to review_interpretation,
--     which would be the generic reason this section exists to stop, and it
--     does NOT need a sixth reason: the five-value vocabulary that
--     needs_attention_item_opened validates inside the database is unchanged.
--
-- Nothing else about the projection changes: same signature, same grants, same
-- ordering, same keyset, same error and job branches, same predicates.
-- ---------------------------------------------------------------------------

create or replace function public.list_needs_attention(
  p_limit integer default 21,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_entry_id uuid default null
)
returns table (
  entry_id uuid,
  reason text,
  occurred_at timestamptz,
  current_interpretation_id uuid,
  job_id uuid,
  open_question_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with scoped_user as (
    select auth.uid() as id
  ),
  bound as (
    select least(greatest(coalesce(p_limit, 21), 1), 200) as lim
  ),
  candidate_entries as (
    select e.id
    from public.entries e, scoped_user u
    where e.user_id = u.id
      and e.status in ('awaiting_review', 'partially_processed', 'recoverable_error', 'terminal_error')
    union
    select e.id
    from public.entries e
    join public.entry_interpretations ei on ei.id = e.current_interpretation_id
    cross join scoped_user u
    where e.user_id = u.id
      and e.status = 'completed'
      and ei.is_record_only = false
      and jsonb_array_length(coalesce(ei.task_candidates, '[]'::jsonb)) > 0
    union
    -- 2P.1: a completed entry whose people were never resolved. Unreachable
    -- through the product today, because confirm_entry_interpretation refuses
    -- while any other decision remains -- kept so the queue agrees with the
    -- contract without depending on that fact staying true.
    select e.id
    from public.entries e
    join public.entry_interpretations ei on ei.id = e.current_interpretation_id
    cross join scoped_user u
    where e.user_id = u.id
      and e.status = 'completed'
      and ei.is_record_only = false
      and exists (
        select 1
        from generate_series(0, jsonb_array_length(coalesce(ei.extracted_people, '[]'::jsonb)) - 1) as person_slot(idx)
        where not exists (
          select 1 from public.entry_person_candidate_resolutions as person_resolution
          where person_resolution.user_id = e.user_id
            and person_resolution.entry_id = e.id
            and person_resolution.interpretation_id = e.current_interpretation_id
            and person_resolution.candidate_index = person_slot.idx
        )
      )
    union
    select e.id
    from public.entries e
    cross join scoped_user u
    where e.user_id = u.id
      and e.status = 'completed'
      and exists (
        select 1 from public.pending_questions pq
        where pq.user_id = u.id and pq.entry_id = e.id
          -- widened (Slice 2D.2): open, or snoozed past its deadline
          and (
            pq.status = 'open'
            or (pq.status = 'snoozed' and pq.snoozed_until is not null and pq.snoozed_until <= now())
          )
      )
    union
    select e.id
    from public.entries e
    cross join scoped_user u
    where e.user_id = u.id
      and e.status = 'saved'
      and exists (
        select 1
        from public.jobs j
        where j.user_id = u.id
          and j.type = 'interpret_entry'
          and (j.payload ->> 'entry_id')::uuid = e.id
          and (
            j.status = 'completed'
            or j.status not in ('pending', 'running', 'failed', 'completed', 'exhausted')
          )
      )
  ),
  latest_job as (
    select distinct on (j.user_id, (j.payload ->> 'entry_id'))
      (j.payload ->> 'entry_id')::uuid as entry_id,
      j.id as job_id,
      j.status as job_status,
      j.next_attempt_at as job_retry_at
    from public.jobs j, scoped_user u
    where j.user_id = u.id
      and j.type = 'interpret_entry'
      and (j.payload ->> 'entry_id')::uuid in (select id from candidate_entries)
    order by j.user_id, (j.payload ->> 'entry_id'), j.created_at desc
  ),
  facts as (
    select
      e.id as entry_id,
      e.status as entry_status,
      e.updated_at as entry_updated_at,
      e.current_interpretation_id,
      lj.job_id,
      lj.job_status,
      lj.job_retry_at,
      coalesce(ei.is_record_only, false) as record_only,
      jsonb_array_length(coalesce(ei.task_candidates, '[]'::jsonb)) as candidate_count,
      exists (
        select 1 from public.pending_questions pq
        where pq.user_id = e.user_id and pq.entry_id = e.id
          -- widened (Slice 2D.2): open, or snoozed past its deadline
          and (
            pq.status = 'open'
            or (pq.status = 'snoozed' and pq.snoozed_until is not null and pq.snoozed_until <= now())
          )
      ) as has_open_question,
      (
        -- uuid has no min() aggregate; order+limit picks the oldest open
        -- question deterministically instead.
        select pq.id from public.pending_questions pq
        where pq.user_id = e.user_id and pq.entry_id = e.id
          -- widened (Slice 2D.2): open, or snoozed past its deadline
          and (
            pq.status = 'open'
            or (pq.status = 'snoozed' and pq.snoozed_until is not null and pq.snoozed_until <= now())
          )
        order by pq.created_at, pq.id
        limit 1
      ) as open_question_id,
      exists (
        select 1
        from generate_series(0, jsonb_array_length(coalesce(ei.task_candidates, '[]'::jsonb)) - 1) as candidate_slot(idx)
        where not exists (
          select 1 from public.tasks t
          where t.user_id = e.user_id
            and t.source_entry_id = e.id
            and t.candidate_index = candidate_slot.idx
            and t.status <> 'cancelled'
            and (
              t.source_interpretation_id = e.current_interpretation_id
              or t.source_interpretation_id is null
            )
        )
        and not exists (
          select 1
          from public.entry_task_candidate_resolutions as resolution_row
          where resolution_row.user_id = e.user_id
            and resolution_row.entry_id = e.id
            and resolution_row.interpretation_id = e.current_interpretation_id
            and resolution_row.candidate_index = candidate_slot.idx
        )
      ) as has_unconfirmed_candidate,
      -- 2P.1: the same predicate private.entry_pending_decisions uses for its
      -- 'person_candidate' class, so the queue and the status agree.
      exists (
        select 1
        from generate_series(0, jsonb_array_length(coalesce(ei.extracted_people, '[]'::jsonb)) - 1) as person_slot(idx)
        where not exists (
          select 1
          from public.entry_person_candidate_resolutions as person_resolution
          where person_resolution.user_id = e.user_id
            and person_resolution.entry_id = e.id
            and person_resolution.interpretation_id = e.current_interpretation_id
            and person_resolution.candidate_index = person_slot.idx
        )
      ) as has_unresolved_person_candidate
    from public.entries e
    left join public.entry_interpretations ei on ei.id = e.current_interpretation_id
    left join latest_job lj on lj.entry_id = e.id
    where e.id in (select id from candidate_entries)
  ),
  resolved as (
    select
      f.entry_id,
      f.current_interpretation_id,
      f.job_id,
      f.open_question_id,
      f.entry_updated_at as occurred_at,
      case
        when f.job_status is not null and f.job_status not in ('pending', 'running', 'failed', 'completed', 'exhausted')
          then 'resolve_consistency'
        when f.entry_status = 'terminal_error' or f.job_status = 'exhausted'
          then 'retry_processing'
        when f.job_status in ('pending', 'running')
          then null
        when f.job_status = 'failed' and f.job_retry_at is not null and f.job_retry_at > now()
          then null
        when f.entry_status in ('interpreting', 'reprocessing')
          then null
        when f.entry_status = 'recoverable_error'
          then 'retry_processing'
        -- 2P.1: the finer reasons come FIRST, and are gated on the three
        -- statuses this contract governs rather than on 'completed' alone.
        when f.entry_status in ('awaiting_review', 'partially_processed', 'completed')
          and f.has_open_question
          then 'answer_existing_question'
        when f.entry_status in ('awaiting_review', 'partially_processed', 'completed')
          and not f.record_only
          and f.candidate_count > 0
          and f.has_unconfirmed_candidate
          then 'confirm_existing_candidates'
        when f.entry_status in ('awaiting_review', 'partially_processed', 'completed')
          and not f.record_only
          and f.has_unresolved_person_candidate
          then 'confirm_existing_candidates'
        -- 2P.1: reached only when every finer decision is resolved, so it now
        -- means exactly "the interpretation itself is still unconfirmed".
        when f.entry_status in ('awaiting_review', 'partially_processed')
          then 'review_interpretation'
        when f.entry_status = 'saved' and f.job_status = 'completed'
          then 'resolve_consistency'
        else null
      end as reason
    from facts f
  )
  select r.entry_id, r.reason, r.occurred_at, r.current_interpretation_id, r.job_id, r.open_question_id
  from resolved r, bound b
  where r.reason is not null
    and (
      p_cursor_occurred_at is null
      or (r.occurred_at, r.entry_id) < (p_cursor_occurred_at, p_cursor_entry_id)
    )
  order by r.occurred_at desc, r.entry_id desc
  limit (select lim from bound);
$$;

grant execute on function public.list_needs_attention(integer, timestamptz, uuid) to authenticated;
revoke all on function public.list_needs_attention(integer, timestamptz, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 8. The entries the defect already stranded.
--
-- The triggers only fire when something changes, and an entry with nothing
-- left to resolve will never be changed again -- so without this the two
-- stranded hosted entries would stay in Needs You forever. This re-derives
-- once, in place, through the same contract. It deletes nothing, it moves no
-- entry the contract does not govern, and each move it makes writes its own
-- audit row.
-- ---------------------------------------------------------------------------

do $$
declare
  stranded record;
begin
  for stranded in
    select entry.user_id, entry.id
    from public.entries as entry
    where entry.status in ('awaiting_review', 'partially_processed')
    order by entry.user_id, entry.id
  loop
    perform private.rederive_entry_lifecycle(stranded.user_id, stranded.id);
  end loop;
end;
$$;
