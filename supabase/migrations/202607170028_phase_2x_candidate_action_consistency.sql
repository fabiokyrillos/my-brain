-- Phase 2X Slice 2X.7: candidate provenance and safe task confirmation.
--
-- Today, a task candidate is identified only by (source_entry_id,
-- candidate_index). Once an entry has more than one interpretation version
-- (a correction or a reprocessing), candidate_index numbering restarts at 0
-- for the new version, but the OLD unique constraint on
-- (source_entry_id, candidate_index) still governs every insert regardless
-- of which interpretation the candidate actually came from. That means a
-- legitimately different candidate at the same index in a newer
-- interpretation can silently fail to materialize (ON CONFLICT DO NOTHING
-- against a stale row), and nothing at the database layer proves a
-- confirmed task, once created, actually came from the interpretation the
-- UI currently displays as current.
--
-- This migration adds explicit candidate provenance
-- (tasks.source_interpretation_id, tasks.operation_key), persists
-- entry_interpretations.is_record_only so record-only status survives past
-- the single correction call that sets it, and introduces
-- confirm_entry_task_candidates: a new RPC that only ever confirms
-- candidates belonging to the entry's current interpretation pointer,
-- rejects record-only interpretations outright, and is idempotent per
-- operation key. The existing confirm_entry_tasks RPC is preserved for
-- compatibility (no new consumer) with its externally observable behavior
-- unchanged; only its internal ON CONFLICT target is updated to match the
-- narrowed legacy partial index this migration introduces.
--
-- Three defects were caught only by exercising both functions as a real
-- authenticated role against the linked project's live REST gateway, not by
-- reasoning about the SQL alone:
--
-- 1. Both functions were declared SECURITY INVOKER, but `authenticated` has
--    no UPDATE grant on `entry_interpretations` (immutable, trigger
--    protected) and no INSERT grant on `undo_operations`/`audit_logs`
--    (append-only, written only through owning RPCs elsewhere in this
--    schema). Every other RPC in this schema that writes to those tables —
--    persist_entry_interpretation, correct_entry_interpretation,
--    undo_operation, and so on — is SECURITY DEFINER for exactly this
--    reason, with the same manual `current_user_id := auth.uid()` plus
--    `where user_id = current_user_id` ownership filtering used here. This
--    made confirm_entry_tasks fail outright for every real authenticated
--    caller (`permission denied for table entry_interpretations`, then
--    `permission denied for table undo_operations` once the first was
--    fixed) — a pre-existing defect in the already-shipped RPC, invisible
--    until now because nothing had exercised it end to end as
--    `authenticated` rather than as a superuser/test-harness role. Both
--    functions are now SECURITY DEFINER, matching the rest of the schema;
--    confirm_entry_tasks also gained the explicit
--    `grant ... to authenticated` / `revoke ... from public, anon` pair
--    every other RPC here already has (it was previously EXECUTE-able by
--    `anon`, harmless in practice only because it also checks
--    `auth.uid() is null` first).
-- 2. Independently, both functions took `for update` on the
--    `entry_interpretations` row they read. That lock was always
--    unnecessary — interpretations never change after creation, and the
--    `entries` row lock already serializes this function against a
--    concurrent correction/reprocess, since both take the same
--    `for update` on `entries` first — so it is simply removed rather than
--    kept and relying on SECURITY DEFINER to paper over the missing grant.
-- 3. `confirm_entry_task_candidates` originally signaled a stale
--    interpretation with SQLSTATE 40001 (serialization_failure), mirroring
--    `correct_entry_interpretation`'s existing optimistic-concurrency
--    convention. Direct testing against the linked project's live REST
--    gateway (bypassing the JS client and this repo's own code entirely)
--    showed that *any* request raising 40001 hangs until the platform's
--    own gateway timeout, including calls to the already-shipped
--    `correct_entry_interpretation`. This is a platform/pooler-level
--    behavior, not something introduced by this migration or specific to
--    this function — see DECISIONS.md and TODO.md for the follow-up this
--    warrants for the pre-existing Phase 2B path, which is out of scope
--    here. `confirm_entry_task_candidates` uses 55P03 instead (already
--    proven fast in production by `begin_entry_reprocessing`'s
--    "already being reprocessed" conflict).

-- 1. Persisted record-only status -------------------------------------------
alter table public.entry_interpretations
  add column is_record_only boolean not null default false;

-- 2. Candidate provenance on tasks -------------------------------------------
alter table public.tasks
  add column source_interpretation_id uuid,
  add column operation_key text;

alter table public.tasks
  add constraint tasks_operation_key_check
    check (operation_key is null or char_length(operation_key) between 8 and 240),
  add constraint tasks_source_interpretation_owner_fk
    foreign key (user_id, source_interpretation_id)
    references public.entry_interpretations (user_id, id);

create index tasks_source_interpretation_idx
  on public.tasks (user_id, source_interpretation_id)
  where source_interpretation_id is not null;
create index tasks_operation_key_idx
  on public.tasks (user_id, operation_key)
  where operation_key is not null;

-- Conservative backfill: only set provenance where it is unambiguous, i.e.
-- the entry has ever had exactly one interpretation. Entries with a
-- correction or reprocessing history keep source_interpretation_id null for
-- their pre-existing tasks rather than guessing which version produced
-- them; those tasks remain valid, provenance-less work items under the
-- legacy partial index below.
with single_interpretation_entry as (
  select entry_id, user_id, min(id::text)::uuid as interpretation_id
  from public.entry_interpretations
  group by entry_id, user_id
  having count(*) = 1
)
update public.tasks task
set source_interpretation_id = fixture.interpretation_id
from single_interpretation_entry fixture
where task.source_entry_id = fixture.entry_id
  and task.user_id = fixture.user_id
  and task.candidate_index is not null
  and task.source_interpretation_id is null;

-- 3. Replace the entry-wide uniqueness with interpretation-scoped uniqueness.
-- The old constraint blocked a legitimate candidate at the same index in a
-- newer interpretation from ever materializing. Legacy rows (no provenance)
-- keep the original entry-wide behavior; provenanced rows are now unique
-- per interpretation instead.
alter table public.tasks drop constraint tasks_source_entry_id_candidate_index_key;

create unique index tasks_legacy_source_entry_candidate_key
  on public.tasks (source_entry_id, candidate_index)
  where source_interpretation_id is null;
create unique index tasks_source_interpretation_candidate_key
  on public.tasks (source_interpretation_id, candidate_index)
  where source_interpretation_id is not null;

-- 4. Persist is_record_only on every interpretation-creating path -----------
create or replace function public.persist_entry_interpretation(
  p_entry_id uuid,
  p_extraction jsonb,
  p_model text,
  p_strategy_version text,
  p_prompt_version text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_service_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_entry public.entries%rowtype;
  parent_interpretation public.entry_interpretations%rowtype;
  interpretation_id uuid;
  next_version integer;
  interpreted_occurred_at timestamptz;
  trust jsonb;
  lifecycle_status text;
  overall_confidence numeric;
begin
  if p_service_user_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Service role required' using errcode = '42501';
    end if;
    current_user_id := p_service_user_id;
  else
    current_user_id := auth.uid();
  end if;
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_extraction) <> 'object'
    or jsonb_typeof(p_extraction -> 'concepts') <> 'array'
    or jsonb_typeof(p_extraction -> 'taskCandidates') <> 'array'
    or jsonb_typeof(coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb)) <> 'array'
  then
    raise exception 'Invalid extraction payload';
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;

  if owned_entry.current_interpretation_id is not null then
    select * into parent_interpretation
    from public.entry_interpretations
    where id = owned_entry.current_interpretation_id
      and entry_id = owned_entry.id
      and user_id = current_user_id;
  end if;

  interpreted_occurred_at := (p_extraction ->> 'occurredAt')::timestamptz;
  overall_confidence := least(1, greatest(0, coalesce((p_extraction ->> 'confidence')::numeric, 0)));
  trust := public.model_only_element_trust(overall_confidence);
  lifecycle_status := public.interpretation_lifecycle_status(
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb),
    trust,
    false
  );
  next_version := coalesce(parent_interpretation.version + 1, 1);

  insert into public.entry_interpretations (
    user_id, entry_id, version, parent_interpretation_id, origin,
    summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output,
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence,
    is_record_only
  ) values (
    current_user_id,
    p_entry_id,
    next_version,
    parent_interpretation.id,
    'ai_generated',
    p_extraction ->> 'summary',
    coalesce(array(select jsonb_array_elements_text(p_extraction -> 'concepts')), array[]::text[]),
    coalesce(p_extraction -> 'contexts', '[]'::jsonb),
    coalesce(p_extraction -> 'organizations', '[]'::jsonb),
    coalesce(p_extraction -> 'projects', '[]'::jsonb),
    coalesce(p_extraction -> 'people', '[]'::jsonb),
    p_extraction -> 'taskCandidates',
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb),
    overall_confidence,
    left(coalesce(nullif(trim(p_model), ''), 'unknown'), 160),
    left(coalesce(nullif(trim(p_strategy_version), ''), 'unknown'), 120),
    left(coalesce(nullif(trim(p_prompt_version), ''), 'unknown'), 120),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_extraction,
    jsonb_build_array(jsonb_build_object('value', interpreted_occurred_at, 'label', 'occurred_at')),
    '{"summary":"interpretation","concepts":"interpretation","occurredAt":"fact","entities":"interpretation"}'::jsonb,
    public.element_trust_scores(trust),
    public.element_trust_policies(trust),
    public.element_trust_evidence(trust),
    false
  ) returning id into interpretation_id;

  perform public.persist_resolved_entry_entities(
    current_user_id, p_entry_id, interpretation_id, p_extraction, interpreted_occurred_at
  );
  perform public.persist_interpretation_questions(
    current_user_id,
    p_entry_id,
    interpretation_id,
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb)
  );

  update public.entries
  set
    current_interpretation_id = interpretation_id,
    status = lifecycle_status,
    occurred_at = interpreted_occurred_at,
    is_retroactive = coalesce((p_extraction ->> 'isRetroactive')::boolean, false),
    processing_error = null,
    reprocessing_key = null,
    reprocessing_started_at = null,
    reprocessing_lease_expires_at = null
  where id = p_entry_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpreted',
    'entry',
    p_entry_id,
    'agent',
    jsonb_build_object(
      'interpretation_id', interpretation_id,
      'version', next_version,
      'origin', 'ai_generated',
      'confidence', overall_confidence,
      'status', lifecycle_status,
      'model', p_model,
      'strategy_version', p_strategy_version
    ),
    'Structured interpretation validated and appended',
    p_entry_id
  );

  return interpretation_id;
end;
$$;

create or replace function public.correct_entry_interpretation(
  p_entry_id uuid,
  p_expected_version integer,
  p_patch jsonb,
  p_operation_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  current_interpretation public.entry_interpretations%rowtype;
  existing_interpretation public.entry_interpretations%rowtype;
  new_interpretation_id uuid;
  new_version integer;
  undo_id uuid;
  link jsonb;
  link_type text;
  link_id uuid;
  link_count integer;
  distinct_link_count integer;
  interpreted_occurred_at timestamptz;
  overall_confidence numeric;
  element_trust jsonb;
  lifecycle_status text;
  record_only boolean;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_operation_key is null or char_length(trim(p_operation_key)) not between 8 and 240 then
    raise exception 'Invalid operation key';
  end if;

  select * into existing_interpretation
  from public.entry_interpretations
  where user_id = current_user_id
    and entry_id = p_entry_id
    and operation_key = trim(p_operation_key);
  if existing_interpretation.id is not null then
    select id into undo_id
    from public.undo_operations
    where user_id = current_user_id
      and result_interpretation_id = existing_interpretation.id
      and action_type = 'correct_entry_interpretation'
    order by created_at desc
    limit 1;
    return jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', existing_interpretation.id,
      'version', existing_interpretation.version,
      'undo_id', undo_id,
      'status', (select status from public.entries where id = p_entry_id and user_id = current_user_id),
      'idempotent', true
    );
  end if;

  if jsonb_typeof(p_patch) <> 'object'
    or nullif(trim(p_patch ->> 'summary'), '') is null
    or char_length(p_patch ->> 'summary') > 2000
    or jsonb_typeof(p_patch -> 'concepts') <> 'array'
    or jsonb_array_length(p_patch -> 'concepts') not between 1 and 30
    or jsonb_typeof(p_patch -> 'extractedDates') <> 'array'
    or jsonb_array_length(p_patch -> 'extractedDates') > 30
    or jsonb_typeof(p_patch -> 'entityLinks') <> 'array'
    or jsonb_array_length(p_patch -> 'entityLinks') > 100
    or jsonb_typeof(p_patch -> 'classifications') <> 'object'
    or jsonb_typeof(p_patch -> 'pendingQuestions') <> 'array'
    or jsonb_array_length(p_patch -> 'pendingQuestions') > 30
  then
    raise exception 'Invalid interpretation patch';
  end if;
  if exists (
    select 1 from jsonb_each_text(p_patch -> 'classifications')
    where value not in ('fact', 'interpretation', 'inference', 'suggestion')
  ) then
    raise exception 'Invalid element classification';
  end if;
  if (select count(*) from jsonb_object_keys(p_patch -> 'classifications')) > 12 then
    raise exception 'Too many element classifications';
  end if;

  element_trust := p_patch -> 'elementTrust';
  perform public.validate_element_trust(element_trust);
  interpreted_occurred_at := (p_patch ->> 'occurredAt')::timestamptz;
  record_only := coalesce((p_patch ->> 'recordOnly')::boolean, false);
  select round(avg((value ->> 'score')::numeric), 3)
  into overall_confidence
  from jsonb_each(element_trust);

  select count(*), count(distinct (value ->> 'entityType') || ':' || (value ->> 'entityId'))
  into link_count, distinct_link_count
  from jsonb_array_elements(p_patch -> 'entityLinks');
  if link_count <> distinct_link_count then raise exception 'Duplicate entity link'; end if;

  for link in select value from jsonb_array_elements(p_patch -> 'entityLinks')
  loop
    link_type := link ->> 'entityType';
    if link_type not in ('context', 'organization', 'project', 'person') then
      raise exception 'Invalid entity type';
    end if;
    link_id := (link ->> 'entityId')::uuid;
    if not public.entity_is_owned(current_user_id, link_type, link_id) then
      raise exception 'Related entity does not belong to the entry owner' using errcode = '42501';
    end if;
    if nullif(trim(link ->> 'mention'), '') is null
      or char_length(link ->> 'mention') > 500
      or (link ->> 'confidence')::numeric not between 0 and 1
    then
      raise exception 'Invalid entity link evidence';
    end if;
  end loop;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.current_interpretation_id is null then
    raise exception 'Current interpretation not found' using errcode = 'P0002';
  end if;

  select * into current_interpretation
  from public.entry_interpretations
  where id = owned_entry.current_interpretation_id
    and user_id = current_user_id
    and entry_id = p_entry_id;
  if current_interpretation.id is null then raise exception 'Current interpretation not found' using errcode = 'P0002'; end if;
  if current_interpretation.version <> p_expected_version then
    raise exception 'Interpretation changed; reload before saving' using errcode = '40001';
  end if;

  new_version := current_interpretation.version + 1;
  lifecycle_status := public.interpretation_lifecycle_status(
    p_patch -> 'pendingQuestions', element_trust, record_only
  );

  insert into public.entry_interpretations (
    user_id, entry_id, version, parent_interpretation_id, origin, corrected_by,
    correction_reason, operation_key, summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output,
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence,
    is_record_only
  ) values (
    current_user_id,
    p_entry_id,
    new_version,
    current_interpretation.id,
    'user_corrected',
    current_user_id,
    nullif(left(trim(coalesce(p_reason, '')), 500), ''),
    trim(p_operation_key),
    trim(p_patch ->> 'summary'),
    array(select jsonb_array_elements_text(p_patch -> 'concepts')),
    current_interpretation.extracted_contexts,
    current_interpretation.extracted_organizations,
    current_interpretation.extracted_projects,
    current_interpretation.extracted_people,
    current_interpretation.task_candidates,
    p_patch -> 'pendingQuestions',
    overall_confidence,
    current_interpretation.model,
    current_interpretation.strategy_version,
    current_interpretation.prompt_version,
    0,
    0,
    current_interpretation.raw_output || jsonb_build_object(
      'summary', trim(p_patch ->> 'summary'),
      'concepts', p_patch -> 'concepts',
      'occurredAt', interpreted_occurred_at,
      'isRetroactive', interpreted_occurred_at < owned_entry.created_at,
      'pendingQuestions', p_patch -> 'pendingQuestions'
    ),
    p_patch -> 'extractedDates',
    p_patch -> 'classifications',
    public.element_trust_scores(element_trust),
    public.element_trust_policies(element_trust),
    public.element_trust_evidence(element_trust),
    record_only
  ) returning id into new_interpretation_id;

  for link in select value from jsonb_array_elements(p_patch -> 'entityLinks')
  loop
    insert into public.entry_entities (
      user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence
    ) values (
      current_user_id,
      p_entry_id,
      new_interpretation_id,
      link ->> 'entityType',
      (link ->> 'entityId')::uuid,
      trim(link ->> 'mention'),
      (link ->> 'confidence')::numeric
    );
  end loop;
  perform public.persist_interpretation_questions(
    current_user_id, p_entry_id, new_interpretation_id, p_patch -> 'pendingQuestions'
  );

  update public.entries
  set
    current_interpretation_id = new_interpretation_id,
    status = lifecycle_status,
    occurred_at = interpreted_occurred_at,
    is_retroactive = interpreted_occurred_at < created_at,
    processing_error = null
  where id = p_entry_id and user_id = current_user_id;

  insert into public.undo_operations (
    user_id, action_type, entity_type, entity_ids, before_state, after_state,
    operation_key, source_entry_id, source_interpretation_id, result_interpretation_id
  ) values (
    current_user_id,
    'correct_entry_interpretation',
    'entry_interpretation',
    array[new_interpretation_id],
    jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', current_interpretation.id,
      'version', current_interpretation.version
    ),
    jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', new_interpretation_id,
      'version', new_version
    ),
    'correction:' || trim(p_operation_key),
    p_entry_id,
    current_interpretation.id,
    new_interpretation_id
  ) returning id into undo_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpretation_corrected',
    'entry_interpretation',
    new_interpretation_id,
    'user',
    jsonb_build_object('interpretation_id', current_interpretation.id, 'version', current_interpretation.version),
    jsonb_build_object(
      'interpretation_id', new_interpretation_id,
      'version', new_version,
      'status', lifecycle_status,
      'record_only', record_only,
      'changed_fields', jsonb_build_array('summary', 'concepts', 'occurredAt', 'extractedDates', 'entityLinks', 'classifications', 'pendingQuestions')
    ),
    coalesce(nullif(left(trim(coalesce(p_reason, '')), 500), ''), 'User corrected an interpretation'),
    p_entry_id
  );

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'interpretation_id', new_interpretation_id,
    'version', new_version,
    'undo_id', undo_id,
    'status', lifecycle_status,
    'idempotent', false
  );
end;
$$;

create or replace function public.persist_reprocessed_entry_interpretation(
  p_entry_id uuid,
  p_operation_key text,
  p_extraction jsonb,
  p_model text,
  p_strategy_version text,
  p_prompt_version text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_element_trust jsonb,
  p_service_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  owned_entry public.entries%rowtype;
  parent_interpretation public.entry_interpretations%rowtype;
  existing_interpretation public.entry_interpretations%rowtype;
  new_interpretation_id uuid;
  new_version integer;
  interpreted_occurred_at timestamptz;
  lifecycle_status text;
  overall_confidence numeric;
  stored_operation_key text := 'reprocess:' || trim(coalesce(p_operation_key, ''));
begin
  if p_service_user_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Service role required' using errcode = '42501';
    end if;
    current_user_id := p_service_user_id;
  else
    current_user_id := auth.uid();
  end if;
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_operation_key is null or char_length(trim(p_operation_key)) not between 8 and 200 then
    raise exception 'Invalid reprocessing operation key';
  end if;

  select * into existing_interpretation
  from public.entry_interpretations
  where user_id = current_user_id
    and entry_id = p_entry_id
    and operation_key = stored_operation_key;
  if existing_interpretation.id is not null then
    return jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', existing_interpretation.id,
      'version', existing_interpretation.version,
      'origin', existing_interpretation.origin,
      'status', (select status from public.entries where id = p_entry_id and user_id = current_user_id),
      'idempotent', true
    );
  end if;

  if jsonb_typeof(p_extraction) <> 'object'
    or jsonb_typeof(p_extraction -> 'concepts') <> 'array'
    or jsonb_typeof(p_extraction -> 'taskCandidates') <> 'array'
    or jsonb_typeof(coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb)) <> 'array'
  then
    raise exception 'Invalid extraction payload';
  end if;
  perform public.validate_element_trust(p_element_trust);
  interpreted_occurred_at := (p_extraction ->> 'occurredAt')::timestamptz;
  select round(avg((value ->> 'score')::numeric), 3)
  into overall_confidence
  from jsonb_each(p_element_trust);
  lifecycle_status := public.interpretation_lifecycle_status(
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb), p_element_trust, false
  );

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.status <> 'reprocessing'
    or owned_entry.reprocessing_key is distinct from trim(p_operation_key)
    or owned_entry.reprocessing_lease_expires_at <= now()
  then
    raise exception 'Reprocessing lease is not owned or has expired' using errcode = '55P03';
  end if;
  if owned_entry.current_interpretation_id is not null then
    select * into parent_interpretation
    from public.entry_interpretations
    where id = owned_entry.current_interpretation_id
      and user_id = current_user_id
      and entry_id = p_entry_id;
  end if;
  new_version := coalesce(parent_interpretation.version + 1, 1);

  insert into public.entry_interpretations (
    user_id, entry_id, version, parent_interpretation_id, origin, operation_key,
    summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output,
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence,
    is_record_only
  ) values (
    current_user_id,
    p_entry_id,
    new_version,
    parent_interpretation.id,
    'ai_reprocessed',
    stored_operation_key,
    p_extraction ->> 'summary',
    coalesce(array(select jsonb_array_elements_text(p_extraction -> 'concepts')), array[]::text[]),
    coalesce(p_extraction -> 'contexts', '[]'::jsonb),
    coalesce(p_extraction -> 'organizations', '[]'::jsonb),
    coalesce(p_extraction -> 'projects', '[]'::jsonb),
    coalesce(p_extraction -> 'people', '[]'::jsonb),
    p_extraction -> 'taskCandidates',
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb),
    overall_confidence,
    left(coalesce(nullif(trim(p_model), ''), 'unknown'), 160),
    left(coalesce(nullif(trim(p_strategy_version), ''), 'unknown'), 120),
    left(coalesce(nullif(trim(p_prompt_version), ''), 'unknown'), 120),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_extraction,
    jsonb_build_array(jsonb_build_object('value', interpreted_occurred_at, 'label', 'occurred_at')),
    '{"summary":"interpretation","concepts":"interpretation","occurredAt":"fact","entities":"interpretation"}'::jsonb,
    public.element_trust_scores(p_element_trust),
    public.element_trust_policies(p_element_trust),
    public.element_trust_evidence(p_element_trust),
    false
  ) returning id into new_interpretation_id;

  perform public.persist_resolved_entry_entities(
    current_user_id, p_entry_id, new_interpretation_id, p_extraction, interpreted_occurred_at
  );
  perform public.persist_interpretation_questions(
    current_user_id,
    p_entry_id,
    new_interpretation_id,
    coalesce(p_extraction -> 'pendingQuestions', '[]'::jsonb)
  );

  update public.entries
  set
    current_interpretation_id = new_interpretation_id,
    status = lifecycle_status,
    occurred_at = interpreted_occurred_at,
    is_retroactive = coalesce((p_extraction ->> 'isRetroactive')::boolean, false),
    processing_error = null,
    reprocessing_key = null,
    reprocessing_started_at = null,
    reprocessing_lease_expires_at = null
  where id = p_entry_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_reprocessed',
    'entry_interpretation',
    new_interpretation_id,
    'agent',
    case when parent_interpretation.id is null then null else jsonb_build_object(
      'interpretation_id', parent_interpretation.id, 'version', parent_interpretation.version
    ) end,
    jsonb_build_object(
      'interpretation_id', new_interpretation_id,
      'version', new_version,
      'origin', 'ai_reprocessed',
      'status', lifecycle_status,
      'model', p_model
    ),
    'User-requested AI reprocessing appended a new interpretation',
    p_entry_id
  );

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'interpretation_id', new_interpretation_id,
    'version', new_version,
    'origin', 'ai_reprocessed',
    'status', lifecycle_status,
    'idempotent', false
  );
end;
$$;

create or replace function public.undo_operation(p_undo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  operation public.undo_operations%rowtype;
  owned_entry public.entries%rowtype;
  source_interpretation public.entry_interpretations%rowtype;
  current_interpretation public.entry_interpretations%rowtype;
  undo_interpretation_id uuid;
  undo_version integer;
  affected integer := 0;
  restored_status text;
  restored_occurred_at timestamptz;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = current_user_id
  for update;
  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;

  if operation.status = 'undone' then
    return jsonb_build_object(
      'undone', true,
      'affected', 0,
      'interpretation_id', operation.after_state ->> 'undo_interpretation_id',
      'idempotent', true
    );
  end if;
  if operation.status <> 'available' then raise exception 'Undo operation is no longer available'; end if;
  if operation.expires_at < now() then
    update public.undo_operations set status = 'expired' where id = operation.id;
    raise exception 'Undo operation expired';
  end if;

  if operation.action_type in ('confirm_entry_tasks', 'confirm_entry_task_candidates') then
    update public.tasks
    set status = 'cancelled', cancelled_at = now()
    where user_id = current_user_id and id = any(operation.entity_ids) and status <> 'cancelled';
    get diagnostics affected = row_count;

    update public.undo_operations
    set status = 'undone', undone_at = now()
    where id = operation.id;
    insert into public.audit_logs (
      user_id, action_type, entity_type, actor, before_state, after_state, reason
    ) values (
      current_user_id,
      'operation_undone',
      operation.entity_type,
      'user',
      operation.after_state,
      jsonb_build_object('cancelled_entity_ids', to_jsonb(operation.entity_ids)),
      'User executed the stored compensating operation'
    );
    return jsonb_build_object('undone', true, 'affected', affected, 'idempotent', false);
  end if;

  if operation.action_type <> 'correct_entry_interpretation' then
    raise exception 'Unsupported undo operation';
  end if;

  select * into owned_entry
  from public.entries
  where id = operation.source_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.current_interpretation_id is distinct from operation.result_interpretation_id then
    raise exception 'Cannot undo after a newer interpretation revision' using errcode = '40001';
  end if;

  select * into source_interpretation
  from public.entry_interpretations
  where id = operation.source_interpretation_id
    and entry_id = owned_entry.id
    and user_id = current_user_id;
  select * into current_interpretation
  from public.entry_interpretations
  where id = owned_entry.current_interpretation_id
    and entry_id = owned_entry.id
    and user_id = current_user_id;
  if source_interpretation.id is null or current_interpretation.id is null then
    raise exception 'Undo interpretation snapshot not found' using errcode = 'P0002';
  end if;

  undo_version := current_interpretation.version + 1;
  insert into public.entry_interpretations (
    user_id, entry_id, version, parent_interpretation_id, origin, corrected_by,
    correction_reason, operation_key, summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output,
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence,
    is_record_only
  ) values (
    current_user_id,
    owned_entry.id,
    undo_version,
    current_interpretation.id,
    'user_corrected',
    current_user_id,
    'Undo interpretation correction',
    'undo:' || operation.id::text,
    source_interpretation.summary,
    source_interpretation.concepts,
    source_interpretation.extracted_contexts,
    source_interpretation.extracted_organizations,
    source_interpretation.extracted_projects,
    source_interpretation.extracted_people,
    source_interpretation.task_candidates,
    source_interpretation.pending_questions,
    source_interpretation.confidence,
    source_interpretation.model,
    source_interpretation.strategy_version,
    source_interpretation.prompt_version,
    0,
    0,
    source_interpretation.raw_output,
    source_interpretation.extracted_dates,
    source_interpretation.element_classifications,
    source_interpretation.element_confidence,
    source_interpretation.element_policy,
    source_interpretation.resolution_evidence,
    source_interpretation.is_record_only
  ) returning id into undo_interpretation_id;

  insert into public.entry_entities (
    user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence
  )
  select
    current_user_id,
    owned_entry.id,
    undo_interpretation_id,
    entity_type,
    entity_id,
    mention,
    confidence
  from public.entry_entities
  where user_id = current_user_id and interpretation_id = source_interpretation.id;
  perform public.persist_interpretation_questions(
    current_user_id,
    owned_entry.id,
    undo_interpretation_id,
    source_interpretation.pending_questions
  );

  restored_status := case
    when jsonb_array_length(source_interpretation.pending_questions) > 0 then 'partially_processed'
    when exists (
      select 1 from jsonb_each_text(source_interpretation.element_policy)
      where value in ('request_review', 'block_until_confirmation')
    ) then 'awaiting_review'
    else 'completed'
  end;
  begin
    restored_occurred_at := (source_interpretation.raw_output ->> 'occurredAt')::timestamptz;
  exception when others then
    restored_occurred_at := owned_entry.occurred_at;
  end;

  update public.entries
  set
    current_interpretation_id = undo_interpretation_id,
    status = restored_status,
    occurred_at = restored_occurred_at,
    is_retroactive = coalesce((source_interpretation.raw_output ->> 'isRetroactive')::boolean, false),
    processing_error = null
  where id = owned_entry.id and user_id = current_user_id;

  update public.undo_operations
  set
    status = 'undone',
    undone_at = now(),
    after_state = after_state || jsonb_build_object(
      'undo_interpretation_id', undo_interpretation_id,
      'undo_version', undo_version
    )
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpretation_correction_undone',
    'entry_interpretation',
    undo_interpretation_id,
    'user',
    jsonb_build_object('interpretation_id', current_interpretation.id, 'version', current_interpretation.version),
    jsonb_build_object(
      'interpretation_id', undo_interpretation_id,
      'version', undo_version,
      'restored_from_interpretation_id', source_interpretation.id
    ),
    'User appended a compensating interpretation revision',
    owned_entry.id
  );

  return jsonb_build_object(
    'undone', true,
    'affected', 1,
    'interpretation_id', undo_interpretation_id,
    'version', undo_version,
    'status', restored_status,
    'idempotent', false
  );
end;
$$;

-- 5. Legacy confirm_entry_tasks: preserved for compatibility, no new
-- consumer. Only its ON CONFLICT target changes, to match the narrowed
-- partial index; external behavior for existing callers is unchanged.
create or replace function public.confirm_entry_tasks(p_entry_id uuid, p_candidate_indexes integer[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid(); interpretation public.entry_interpretations%rowtype;
  candidate jsonb; selected_index integer; created_task_id uuid; child_task_id uuid; candidate_parent_id uuid;
  created_task_ids uuid[] := array[]::uuid[]; result_task_ids uuid[] := array[]::uuid[]; undo_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(array_length(p_candidate_indexes, 1), 0) = 0 then raise exception 'Select at least one task'; end if;
  select * into interpretation from public.entry_interpretations where entry_id = p_entry_id and user_id = current_user_id order by version desc limit 1;
  if interpretation.id is null then raise exception 'Interpretation not found' using errcode = 'P0002'; end if;

  foreach selected_index in array (select array_agg(distinct value order by value) from unnest(p_candidate_indexes) value)
  loop
    if selected_index < 0 or selected_index >= jsonb_array_length(interpretation.task_candidates) then raise exception 'Invalid task candidate index'; end if;
    candidate := interpretation.task_candidates -> selected_index;
    insert into public.tasks (user_id, source_entry_id, candidate_index, title, description, status, due_at, confidence, created_by)
    values (current_user_id, p_entry_id, selected_index, candidate ->> 'title', nullif(candidate ->> 'description',''),
      case when candidate ->> 'waitingOn' is not null then 'waiting' else 'inbox' end,
      nullif(candidate ->> 'dueAt','')::timestamptz, coalesce((candidate ->> 'confidence')::numeric, interpretation.confidence), 'user')
    on conflict (source_entry_id, candidate_index) where source_interpretation_id is null do nothing returning id into created_task_id;
    if created_task_id is not null then created_task_ids := array_append(created_task_ids, created_task_id); end if; created_task_id := null;
  end loop;

  foreach selected_index in array p_candidate_indexes
  loop
    candidate := interpretation.task_candidates -> selected_index;
    select task.id into child_task_id from public.tasks task where task.user_id = current_user_id and task.source_entry_id = p_entry_id and task.candidate_index = selected_index;
    if candidate ->> 'parentIndex' is not null then
      select task.id into candidate_parent_id from public.tasks task where task.user_id = current_user_id and task.source_entry_id = p_entry_id and task.candidate_index = (candidate ->> 'parentIndex')::integer;
      if candidate_parent_id is not null then update public.tasks task set parent_task_id = candidate_parent_id where task.id = child_task_id; end if;
    end if;
    insert into public.task_people (task_id, person_id, user_id)
      select child_task_id, entity.entity_id, current_user_id from public.entry_entities entity where entity.interpretation_id = interpretation.id and entity.entity_type = 'person'
      on conflict do nothing;
    insert into public.task_projects (task_id, project_id, user_id)
      select child_task_id, entity.entity_id, current_user_id from public.entry_entities entity where entity.interpretation_id = interpretation.id and entity.entity_type = 'project'
      on conflict do nothing;
    insert into public.task_contexts (task_id, context_id, user_id)
      select child_task_id, entity.entity_id, current_user_id from public.entry_entities entity where entity.interpretation_id = interpretation.id and entity.entity_type = 'context'
      on conflict do nothing;
    candidate_parent_id := null;
  end loop;

  select coalesce(array_agg(task.id order by task.candidate_index), array[]::uuid[]) into result_task_ids
  from public.tasks task where task.user_id = current_user_id and task.source_entry_id = p_entry_id and task.candidate_index = any(p_candidate_indexes);
  if coalesce(array_length(created_task_ids,1),0)>0 then
    insert into public.undo_operations(user_id,action_type,entity_type,entity_ids,after_state) values(current_user_id,'confirm_entry_tasks','task',created_task_ids,jsonb_build_object('entry_id',p_entry_id,'task_ids',to_jsonb(created_task_ids))) returning id into undo_id;
    insert into public.audit_logs(user_id,action_type,entity_type,actor,after_state,reason,source_entry_id) values(current_user_id,'tasks_confirmed','task','user',jsonb_build_object('task_ids',to_jsonb(created_task_ids),'candidate_indexes',to_jsonb(p_candidate_indexes)),'User confirmed task candidates with normalized relationships',p_entry_id);
  end if;
  return jsonb_build_object('task_ids',to_jsonb(result_task_ids),'undo_id',undo_id);
end;
$$;

grant execute on function public.confirm_entry_tasks(uuid, integer[]) to authenticated;
revoke all on function public.confirm_entry_tasks(uuid, integer[]) from public, anon;

-- 6. New RPC: confirm only candidates from the current interpretation ------
create or replace function public.confirm_entry_task_candidates(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_indexes integer[],
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
  interpretation public.entry_interpretations%rowtype;
  candidate jsonb;
  selected_index integer;
  created_task_id uuid;
  child_task_id uuid;
  candidate_parent_id uuid;
  created_task_ids uuid[] := array[]::uuid[];
  result_task_ids uuid[] := array[]::uuid[];
  undo_id uuid;
  normalized_key text;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(array_length(p_candidate_indexes, 1), 0) = 0 then
    raise exception 'Select at least one task' using errcode = '22023';
  end if;
  if p_operation_key is null or char_length(trim(p_operation_key)) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  normalized_key := trim(p_operation_key);

  select coalesce(array_agg(id order by candidate_index), array[]::uuid[])
  into result_task_ids
  from public.tasks
  where user_id = current_user_id and operation_key = normalized_key;
  if coalesce(array_length(result_task_ids, 1), 0) > 0 then
    select id into undo_id
    from public.undo_operations
    where user_id = current_user_id and operation_key = 'confirm:' || normalized_key
    order by created_at desc
    limit 1;
    return jsonb_build_object('task_ids', to_jsonb(result_task_ids), 'undo_id', undo_id, 'idempotent', true);
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.current_interpretation_id is null
    or owned_entry.current_interpretation_id <> p_expected_interpretation_id
  then
    raise exception 'Interpretation is no longer current' using errcode = '55P03';
  end if;

  select * into interpretation
  from public.entry_interpretations
  where id = owned_entry.current_interpretation_id
    and user_id = current_user_id
    and entry_id = p_entry_id;
  if interpretation.id is null then raise exception 'Interpretation not found' using errcode = 'P0002'; end if;
  if interpretation.is_record_only then
    raise exception 'Interpretation is record-only; no candidate is actionable' using errcode = '55000';
  end if;

  foreach selected_index in array (select array_agg(distinct value order by value) from unnest(p_candidate_indexes) value)
  loop
    if selected_index < 0 or selected_index >= jsonb_array_length(interpretation.task_candidates) then
      raise exception 'Invalid task candidate index' using errcode = '22023';
    end if;
    candidate := interpretation.task_candidates -> selected_index;

    insert into public.tasks (
      user_id, source_entry_id, source_interpretation_id, candidate_index, operation_key,
      title, description, status, due_at, confidence, created_by
    ) values (
      current_user_id, p_entry_id, interpretation.id, selected_index, normalized_key,
      candidate ->> 'title',
      nullif(candidate ->> 'description', ''),
      case when candidate ->> 'waitingOn' is not null then 'waiting' else 'inbox' end,
      nullif(candidate ->> 'dueAt', '')::timestamptz,
      coalesce((candidate ->> 'confidence')::numeric, interpretation.confidence),
      'user'
    )
    on conflict (source_interpretation_id, candidate_index) where source_interpretation_id is not null
    do nothing
    returning id into created_task_id;

    if created_task_id is not null then created_task_ids := array_append(created_task_ids, created_task_id); end if;
    created_task_id := null;
  end loop;

  foreach selected_index in array p_candidate_indexes
  loop
    candidate := interpretation.task_candidates -> selected_index;
    select task.id into child_task_id
    from public.tasks task
    where task.user_id = current_user_id
      and task.source_interpretation_id = interpretation.id
      and task.candidate_index = selected_index;
    if candidate ->> 'parentIndex' is not null then
      select task.id into candidate_parent_id
      from public.tasks task
      where task.user_id = current_user_id
        and task.source_interpretation_id = interpretation.id
        and task.candidate_index = (candidate ->> 'parentIndex')::integer;
      if candidate_parent_id is not null then
        update public.tasks task set parent_task_id = candidate_parent_id where task.id = child_task_id;
      end if;
    end if;
    insert into public.task_people (task_id, person_id, user_id)
      select child_task_id, entity.entity_id, current_user_id
      from public.entry_entities entity
      where entity.interpretation_id = interpretation.id and entity.entity_type = 'person'
      on conflict do nothing;
    insert into public.task_projects (task_id, project_id, user_id)
      select child_task_id, entity.entity_id, current_user_id
      from public.entry_entities entity
      where entity.interpretation_id = interpretation.id and entity.entity_type = 'project'
      on conflict do nothing;
    insert into public.task_contexts (task_id, context_id, user_id)
      select child_task_id, entity.entity_id, current_user_id
      from public.entry_entities entity
      where entity.interpretation_id = interpretation.id and entity.entity_type = 'context'
      on conflict do nothing;
    candidate_parent_id := null;
  end loop;

  select coalesce(array_agg(task.id order by task.candidate_index), array[]::uuid[])
  into result_task_ids
  from public.tasks task
  where task.user_id = current_user_id
    and task.source_interpretation_id = interpretation.id
    and task.candidate_index = any(p_candidate_indexes);

  if coalesce(array_length(created_task_ids, 1), 0) > 0 then
    insert into public.undo_operations (
      user_id, action_type, entity_type, entity_ids, after_state,
      operation_key, source_entry_id, source_interpretation_id
    ) values (
      current_user_id, 'confirm_entry_task_candidates', 'task', created_task_ids,
      jsonb_build_object('entry_id', p_entry_id, 'interpretation_id', interpretation.id, 'task_ids', to_jsonb(created_task_ids)),
      'confirm:' || normalized_key, p_entry_id, interpretation.id
    ) returning id into undo_id;

    insert into public.audit_logs (
      user_id, action_type, entity_type, actor, after_state, reason, source_entry_id
    ) values (
      current_user_id, 'tasks_confirmed', 'task', 'user',
      jsonb_build_object(
        'task_ids', to_jsonb(created_task_ids),
        'candidate_indexes', to_jsonb(p_candidate_indexes),
        'interpretation_id', interpretation.id
      ),
      'User confirmed task candidates from the current interpretation', p_entry_id
    );
  end if;

  return jsonb_build_object('task_ids', to_jsonb(result_task_ids), 'undo_id', undo_id, 'idempotent', false);
end;
$$;

grant execute on function public.confirm_entry_task_candidates(uuid, uuid, integer[], text) to authenticated;
revoke all on function public.confirm_entry_task_candidates(uuid, uuid, integer[], text) from public, anon;
