-- Phase 2B: immutable interpretation revisions and trust foundation.

alter table public.entries drop constraint if exists entries_status_check;
update public.entries set status = case status
  when 'processing' then 'interpreting'
  when 'interpreted' then 'completed'
  when 'failed' then 'recoverable_error'
  else status
end;
alter table public.entries alter column status set default 'saved';
alter table public.entries add constraint entries_status_check check (status in (
  'saved',
  'interpreting',
  'awaiting_review',
  'partially_processed',
  'completed',
  'recoverable_error',
  'terminal_error',
  'reprocessing'
));

alter table public.entries
  add column current_interpretation_id uuid,
  add column reprocessing_key text,
  add column reprocessing_started_at timestamptz,
  add column reprocessing_lease_expires_at timestamptz;

alter table public.entry_interpretations
  add column parent_interpretation_id uuid,
  add column origin text not null default 'ai_generated',
  add column corrected_by uuid references auth.users(id) on delete set null,
  add column correction_reason text,
  add column operation_key text,
  add column extracted_dates jsonb not null default '[]'::jsonb,
  add column element_classifications jsonb not null default '{"summary":"interpretation","concepts":"interpretation","occurredAt":"fact","entities":"interpretation"}'::jsonb,
  add column element_confidence jsonb not null default '{}'::jsonb,
  add column element_policy jsonb not null default '{}'::jsonb,
  add column resolution_evidence jsonb not null default '{}'::jsonb;

alter table public.entry_interpretations
  add constraint entry_interpretations_origin_check check (origin in (
    'ai_generated', 'user_corrected', 'ai_reprocessed', 'question_resolved'
  )),
  add constraint entry_interpretations_corrected_by_owner_check check (corrected_by is null or corrected_by = user_id),
  add constraint entry_interpretations_correction_reason_check check (correction_reason is null or char_length(correction_reason) <= 500),
  add constraint entry_interpretations_operation_key_check check (operation_key is null or char_length(operation_key) between 8 and 240),
  add constraint entry_interpretations_extracted_dates_check check (jsonb_typeof(extracted_dates) = 'array'),
  add constraint entry_interpretations_classifications_check check (jsonb_typeof(element_classifications) = 'object'),
  add constraint entry_interpretations_element_confidence_check check (jsonb_typeof(element_confidence) = 'object'),
  add constraint entry_interpretations_element_policy_check check (jsonb_typeof(element_policy) = 'object'),
  add constraint entry_interpretations_resolution_evidence_check check (jsonb_typeof(resolution_evidence) = 'object'),
  add constraint entry_interpretations_owner_entry_id_key unique (user_id, entry_id, id),
  add constraint entry_interpretations_parent_owner_fk
    foreign key (user_id, entry_id, parent_interpretation_id)
    references public.entry_interpretations (user_id, entry_id, id);

create unique index entry_interpretations_operation_key_idx
  on public.entry_interpretations (user_id, entry_id, operation_key)
  where operation_key is not null;

update public.entries entry
set current_interpretation_id = (
  select interpretation.id
  from public.entry_interpretations interpretation
  where interpretation.user_id = entry.user_id and interpretation.entry_id = entry.id
  order by interpretation.version desc
  limit 1
);

alter table public.entries
  add constraint entries_current_interpretation_owner_fk
  foreign key (user_id, id, current_interpretation_id)
  references public.entry_interpretations (user_id, entry_id, id);

alter table public.undo_operations
  add column operation_key text,
  add column source_entry_id uuid,
  add column source_interpretation_id uuid,
  add column result_interpretation_id uuid;

alter table public.undo_operations
  add constraint undo_operations_operation_key_check check (operation_key is null or char_length(operation_key) between 8 and 260),
  add constraint undo_operations_source_entry_owner_fk
    foreign key (user_id, source_entry_id) references public.entries (user_id, id),
  add constraint undo_operations_source_interpretation_owner_fk
    foreign key (user_id, source_interpretation_id) references public.entry_interpretations (user_id, id),
  add constraint undo_operations_result_interpretation_owner_fk
    foreign key (user_id, result_interpretation_id) references public.entry_interpretations (user_id, id);

create unique index undo_operations_operation_key_idx
  on public.undo_operations (user_id, operation_key)
  where operation_key is not null;
create index undo_operations_entry_idx
  on public.undo_operations (user_id, source_entry_id, created_at desc)
  where source_entry_id is not null;

create or replace function public.normalize_entity_alias(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select trim(regexp_replace(
    lower(translate(
      p_value,
      'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
      'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY'
    )),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

create table public.entity_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('context', 'organization', 'project', 'person')),
  entity_id uuid not null,
  alias text not null check (char_length(alias) between 1 and 160),
  normalized_alias text not null,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  unique (user_id, entity_type, entity_id, normalized_alias)
);

create index entity_aliases_lookup_idx
  on public.entity_aliases (user_id, entity_type, normalized_alias, valid_from, valid_to);
alter table public.entity_aliases enable row level security;
alter table public.entity_aliases force row level security;
create policy entity_aliases_select_own on public.entity_aliases
  for select to authenticated using ((select auth.uid()) = user_id);
create policy entity_aliases_insert_own on public.entity_aliases
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy entity_aliases_update_own on public.entity_aliases
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy entity_aliases_delete_own on public.entity_aliases
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.entity_aliases to authenticated;
revoke all on public.entity_aliases from anon;

create or replace function public.prepare_entity_alias()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.alias := trim(new.alias);
  new.normalized_alias := public.normalize_entity_alias(new.alias);
  if new.normalized_alias = '' then raise exception 'Alias must contain letters or numbers'; end if;
  return new;
end;
$$;

create trigger entity_aliases_prepare
before insert or update of alias on public.entity_aliases
for each row execute function public.prepare_entity_alias();
create trigger entity_aliases_updated_at
before update on public.entity_aliases
for each row execute function public.set_updated_at();
create trigger entity_aliases_validate_owner
before insert or update of user_id, entity_type, entity_id on public.entity_aliases
for each row execute function public.validate_polymorphic_entity_owner();

create or replace function public.reject_interpretation_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Interpretation versions are immutable' using errcode = '22000';
end;
$$;

create trigger entry_interpretations_protect_immutable
before update on public.entry_interpretations
for each row execute function public.reject_interpretation_update();

create or replace function public.validate_element_trust(p_element_trust jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare decision jsonb;
begin
  if jsonb_typeof(p_element_trust) <> 'object' or p_element_trust = '{}'::jsonb then
    raise exception 'Element trust must be a non-empty object';
  end if;
  for decision in select value from jsonb_each(p_element_trust)
  loop
    if jsonb_typeof(decision) <> 'object'
      or jsonb_typeof(decision -> 'signals') <> 'object'
      or jsonb_typeof(decision -> 'overrides') <> 'array'
      or jsonb_typeof(decision -> 'evidence') <> 'array'
      or (decision ->> 'policy') not in ('auto_apply', 'apply_and_flag', 'request_review', 'block_until_confirmation')
      or (decision ->> 'score')::numeric not between 0 and 1
      or jsonb_array_length(decision -> 'overrides') > 10
      or jsonb_array_length(decision -> 'evidence') > 12
    then
      raise exception 'Invalid element trust payload';
    end if;
  end loop;
end;
$$;

create or replace function public.element_trust_scores(p_element_trust jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value -> 'score'), '{}'::jsonb)
  from jsonb_each(p_element_trust);
$$;

create or replace function public.element_trust_policies(p_element_trust jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, to_jsonb(value ->> 'policy')), '{}'::jsonb)
  from jsonb_each(p_element_trust);
$$;

create or replace function public.element_trust_evidence(p_element_trust jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
    key,
    jsonb_build_object(
      'signals', value -> 'signals',
      'overrides', value -> 'overrides',
      'evidence', value -> 'evidence'
    )
  ), '{}'::jsonb)
  from jsonb_each(p_element_trust);
$$;

create or replace function public.interpretation_lifecycle_status(
  p_pending_questions jsonb,
  p_element_trust jsonb,
  p_record_only boolean default false
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_array_length(coalesce(p_pending_questions, '[]'::jsonb)) > 0 then
    return 'partially_processed';
  end if;
  if coalesce(p_record_only, false) then return 'completed'; end if;
  if exists (
    select 1 from jsonb_each(coalesce(p_element_trust, '{}'::jsonb))
    where value ->> 'policy' in ('request_review', 'block_until_confirmation')
  ) then
    return 'awaiting_review';
  end if;
  return 'completed';
end;
$$;

create or replace function public.model_only_element_trust(p_model_confidence numeric)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized numeric := least(1, greatest(0, coalesce(p_model_confidence, 0)));
  score numeric;
  decision jsonb;
begin
  score := round((normalized * 0.20 + 0.05)::numeric, 3);
  decision := jsonb_build_object(
    'score', score,
    'policy', case when score >= 0.55 then 'request_review' else 'block_until_confirmation' end,
    'signals', jsonb_build_object(
      'modelConfidence', normalized,
      'candidateMargin', 0,
      'entityExactness', 0,
      'semanticSimilarity', 0,
      'dateClarity', 0,
      'contextConsistency', 0,
      'reversibility', 1,
      'autonomyAllowed', 0,
      'correctionHistoryAgreement', 0
    ),
    'overrides', jsonb_build_array('insufficient_evidence'),
    'evidence', jsonb_build_array('model_confidence_only', 'missing_deterministic_signals')
  );
  return jsonb_build_object(
    'summary', decision,
    'concepts', decision,
    'occurredAt', decision,
    'extractedDates', decision,
    'entities', decision
  );
end;
$$;

revoke all on function public.normalize_entity_alias(text) from public, anon, authenticated;
revoke all on function public.validate_element_trust(jsonb) from public, anon, authenticated;
revoke all on function public.element_trust_scores(jsonb) from public, anon, authenticated;
revoke all on function public.element_trust_policies(jsonb) from public, anon, authenticated;
revoke all on function public.element_trust_evidence(jsonb) from public, anon, authenticated;
revoke all on function public.interpretation_lifecycle_status(jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.model_only_element_trust(numeric) from public, anon, authenticated;

create or replace function public.resolve_owned_entity_exact(
  p_user_id uuid,
  p_entity_type text,
  p_name text,
  p_occurred_at timestamptz
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized text := public.normalize_entity_alias(p_name);
  candidate_count integer;
  candidate_id uuid;
begin
  if normalized = '' or p_entity_type not in ('context', 'organization', 'project', 'person') then return null; end if;

  with owned_candidates as (
    select context.id
    from public.contexts context
    where p_entity_type = 'context'
      and context.user_id = p_user_id
      and public.normalize_entity_alias(context.name) = normalized
    union
    select organization.id
    from public.organizations organization
    where p_entity_type = 'organization'
      and organization.user_id = p_user_id
      and public.normalize_entity_alias(organization.name) = normalized
    union
    select project.id
    from public.projects project
    where p_entity_type = 'project'
      and project.user_id = p_user_id
      and public.normalize_entity_alias(project.name) = normalized
    union
    select person.id
    from public.people person
    where p_entity_type = 'person'
      and person.user_id = p_user_id
      and public.normalize_entity_alias(person.name) = normalized
    union
    select alias.entity_id
    from public.entity_aliases alias
    where alias.user_id = p_user_id
      and alias.entity_type = p_entity_type
      and alias.normalized_alias = normalized
      and (alias.valid_from is null or alias.valid_from <= p_occurred_at)
      and (alias.valid_to is null or alias.valid_to >= p_occurred_at)
  )
  select count(distinct id), min(id::text)::uuid
  into candidate_count, candidate_id
  from owned_candidates;

  if candidate_count = 1 then return candidate_id; end if;
  return null;
end;
$$;

create or replace function public.persist_resolved_entry_entities(
  p_user_id uuid,
  p_entry_id uuid,
  p_interpretation_id uuid,
  p_extraction jsonb,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  descriptor record;
  entity_item jsonb;
  resolved_id uuid;
begin
  for descriptor in
    select * from (values
      ('context'::text, 'contexts'::text),
      ('organization'::text, 'organizations'::text),
      ('project'::text, 'projects'::text),
      ('person'::text, 'people'::text)
    ) value(entity_type, json_key)
  loop
    for entity_item in
      select value from jsonb_array_elements(coalesce(p_extraction -> descriptor.json_key, '[]'::jsonb))
    loop
      resolved_id := public.resolve_owned_entity_exact(
        p_user_id,
        descriptor.entity_type,
        entity_item ->> 'name',
        p_occurred_at
      );
      if resolved_id is not null then
        insert into public.entry_entities (
          user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence
        ) values (
          p_user_id,
          p_entry_id,
          p_interpretation_id,
          descriptor.entity_type,
          resolved_id,
          left(coalesce(nullif(entity_item ->> 'name', ''), 'resolved entity'), 500),
          least(1, greatest(0, coalesce((entity_item ->> 'confidence')::numeric, 0)))
        ) on conflict (interpretation_id, entity_type, entity_id) do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.persist_interpretation_questions(
  p_user_id uuid,
  p_entry_id uuid,
  p_interpretation_id uuid,
  p_questions jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.pending_questions (
    user_id, entry_id, interpretation_id, candidate_index, question, reason, confidence
  )
  select
    p_user_id,
    p_entry_id,
    p_interpretation_id,
    question.ordinality - 1,
    left(question.value ->> 'question', 1000),
    left(question.value ->> 'reason', 1000),
    least(1, greatest(0, coalesce((question.value ->> 'confidence')::numeric, 0)))
  from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) with ordinality question(value, ordinality)
  where nullif(trim(question.value ->> 'question'), '') is not null
    and nullif(trim(question.value ->> 'reason'), '') is not null
  on conflict (interpretation_id, candidate_index) do nothing;
$$;

revoke all on function public.resolve_owned_entity_exact(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.persist_resolved_entry_entities(uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.persist_interpretation_questions(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.begin_entry_interpretation(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into owned_entry from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.status not in ('saved', 'recoverable_error') then
    raise exception 'Entry cannot begin interpretation from its current state' using errcode = '55000';
  end if;
  update public.entries
  set status = 'interpreting', processing_error = null
  where id = p_entry_id and user_id = current_user_id;
  return jsonb_build_object('entry_id', p_entry_id, 'status', 'interpreting');
end;
$$;

create or replace function public.fail_entry_interpretation(
  p_entry_id uuid,
  p_error text,
  p_terminal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  safe_error text := left(regexp_replace(coalesce(nullif(trim(p_error), ''), 'Interpretation unavailable. The original was preserved.'), '[\r\n\t]+', ' ', 'g'), 500);
  next_status text := case when coalesce(p_terminal, false) then 'terminal_error' else 'recoverable_error' end;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into owned_entry from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  update public.entries
  set status = next_status, processing_error = safe_error
  where id = p_entry_id and user_id = current_user_id;
  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpretation_failed',
    'entry',
    p_entry_id,
    'system',
    jsonb_build_object('status', next_status),
    'Interpretation failed; bounded user-safe error persisted',
    p_entry_id
  );
  return jsonb_build_object('entry_id', p_entry_id, 'status', next_status, 'error', safe_error);
end;
$$;

grant execute on function public.begin_entry_interpretation(uuid) to authenticated;
grant execute on function public.fail_entry_interpretation(uuid, text, boolean) to authenticated;
revoke all on function public.begin_entry_interpretation(uuid) from public, anon;
revoke all on function public.fail_entry_interpretation(uuid, text, boolean) from public, anon;

create or replace function public.persist_entry_interpretation(
  p_entry_id uuid,
  p_extraction jsonb,
  p_model text,
  p_strategy_version text,
  p_prompt_version text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  parent_interpretation public.entry_interpretations%rowtype;
  interpretation_id uuid;
  next_version integer;
  occurred_at timestamptz;
  trust jsonb;
  lifecycle_status text;
  overall_confidence numeric;
begin
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

  occurred_at := (p_extraction ->> 'occurredAt')::timestamptz;
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
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence
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
    jsonb_build_array(jsonb_build_object('value', occurred_at, 'label', 'occurred_at')),
    '{"summary":"interpretation","concepts":"interpretation","occurredAt":"fact","entities":"interpretation"}'::jsonb,
    public.element_trust_scores(trust),
    public.element_trust_policies(trust),
    public.element_trust_evidence(trust)
  ) returning id into interpretation_id;

  perform public.persist_resolved_entry_entities(
    current_user_id, p_entry_id, interpretation_id, p_extraction, occurred_at
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
    occurred_at = occurred_at,
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

grant execute on function public.persist_entry_interpretation(uuid, jsonb, text, text, text, integer, integer) to authenticated;
revoke all on function public.persist_entry_interpretation(uuid, jsonb, text, text, text, integer, integer) from public, anon;

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
  occurred_at timestamptz;
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
  occurred_at := (p_patch ->> 'occurredAt')::timestamptz;
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
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence
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
      'occurredAt', occurred_at,
      'isRetroactive', occurred_at < owned_entry.created_at,
      'pendingQuestions', p_patch -> 'pendingQuestions'
    ),
    p_patch -> 'extractedDates',
    p_patch -> 'classifications',
    public.element_trust_scores(element_trust),
    public.element_trust_policies(element_trust),
    public.element_trust_evidence(element_trust)
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
    occurred_at = occurred_at,
    is_retroactive = occurred_at < created_at,
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

grant execute on function public.correct_entry_interpretation(uuid, integer, jsonb, text, text) to authenticated;
revoke all on function public.correct_entry_interpretation(uuid, integer, jsonb, text, text) from public, anon;

create or replace function public.begin_entry_reprocessing(
  p_entry_id uuid,
  p_operation_key text,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  bounded_lease integer := least(900, greatest(60, coalesce(p_lease_seconds, 300)));
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_operation_key is null or char_length(trim(p_operation_key)) not between 8 and 200 then
    raise exception 'Invalid reprocessing operation key';
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.status = 'reprocessing'
    and owned_entry.reprocessing_key = trim(p_operation_key)
    and owned_entry.reprocessing_lease_expires_at > now()
  then
    return jsonb_build_object(
      'entry_id', p_entry_id,
      'status', 'reprocessing',
      'lease_expires_at', owned_entry.reprocessing_lease_expires_at,
      'idempotent', true
    );
  end if;
  if owned_entry.status = 'reprocessing'
    and owned_entry.reprocessing_lease_expires_at > now()
  then
    raise exception 'Entry is already being reprocessed' using errcode = '55P03';
  end if;

  update public.entries
  set
    status = 'reprocessing',
    processing_error = null,
    reprocessing_key = trim(p_operation_key),
    reprocessing_started_at = now(),
    reprocessing_lease_expires_at = now() + make_interval(secs => bounded_lease)
  where id = p_entry_id and user_id = current_user_id
  returning * into owned_entry;

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'status', owned_entry.status,
    'lease_expires_at', owned_entry.reprocessing_lease_expires_at,
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
  p_element_trust jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  parent_interpretation public.entry_interpretations%rowtype;
  existing_interpretation public.entry_interpretations%rowtype;
  new_interpretation_id uuid;
  new_version integer;
  occurred_at timestamptz;
  lifecycle_status text;
  overall_confidence numeric;
  stored_operation_key text := 'reprocess:' || trim(coalesce(p_operation_key, ''));
begin
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
  occurred_at := (p_extraction ->> 'occurredAt')::timestamptz;
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
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence
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
    jsonb_build_array(jsonb_build_object('value', occurred_at, 'label', 'occurred_at')),
    '{"summary":"interpretation","concepts":"interpretation","occurredAt":"fact","entities":"interpretation"}'::jsonb,
    public.element_trust_scores(p_element_trust),
    public.element_trust_policies(p_element_trust),
    public.element_trust_evidence(p_element_trust)
  ) returning id into new_interpretation_id;

  perform public.persist_resolved_entry_entities(
    current_user_id, p_entry_id, new_interpretation_id, p_extraction, occurred_at
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
    occurred_at = occurred_at,
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

create or replace function public.fail_entry_reprocessing(
  p_entry_id uuid,
  p_operation_key text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  safe_error text := left(regexp_replace(coalesce(nullif(trim(p_error), ''), 'Reprocessing unavailable. The original was preserved.'), '[\r\n\t]+', ' ', 'g'), 500);
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.status = 'recoverable_error' and owned_entry.reprocessing_key = trim(p_operation_key) then
    return jsonb_build_object('entry_id', p_entry_id, 'status', 'recoverable_error', 'idempotent', true);
  end if;
  if owned_entry.status <> 'reprocessing'
    or owned_entry.reprocessing_key is distinct from trim(p_operation_key)
    or owned_entry.reprocessing_lease_expires_at <= now()
  then
    raise exception 'Reprocessing lease is not owned or has expired' using errcode = '55P03';
  end if;

  update public.entries
  set
    status = 'recoverable_error',
    processing_error = safe_error,
    reprocessing_started_at = null,
    reprocessing_lease_expires_at = null
  where id = p_entry_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_reprocessing_failed',
    'entry',
    p_entry_id,
    'system',
    jsonb_build_object('status', 'recoverable_error'),
    'Reprocessing failed; bounded user-safe error persisted',
    p_entry_id
  );

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'status', 'recoverable_error',
    'error', safe_error,
    'idempotent', false
  );
end;
$$;

grant execute on function public.begin_entry_reprocessing(uuid, text, integer) to authenticated;
grant execute on function public.persist_reprocessed_entry_interpretation(uuid, text, jsonb, text, text, text, integer, integer, jsonb) to authenticated;
grant execute on function public.fail_entry_reprocessing(uuid, text, text) to authenticated;
revoke all on function public.begin_entry_reprocessing(uuid, text, integer) from public, anon;
revoke all on function public.persist_reprocessed_entry_interpretation(uuid, text, jsonb, text, text, text, integer, integer, jsonb) from public, anon;
revoke all on function public.fail_entry_reprocessing(uuid, text, text) from public, anon;

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

  if operation.action_type = 'confirm_entry_tasks' then
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
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence
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
    source_interpretation.resolution_evidence
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

grant execute on function public.undo_operation(uuid) to authenticated;
revoke all on function public.undo_operation(uuid) from public, anon;

revoke all on function public.prepare_entity_alias() from public, anon, authenticated;
revoke all on function public.reject_interpretation_update() from public, anon, authenticated;
