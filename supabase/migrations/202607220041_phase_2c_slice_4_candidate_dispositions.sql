-- Phase 2C Slice 2C.4: candidate dispositions.
--
-- Candidate identity is owner + entry + interpretation + candidate index.
-- The ledger stores only terminal decision provenance; immutable suggestion
-- content remains solely in entry_interpretations.task_candidates.

alter table public.undo_operations
  add constraint undo_operations_user_id_id_key unique (user_id, id);

create table public.entry_task_candidate_resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null,
  interpretation_id uuid not null,
  candidate_index integer not null,
  disposition text not null,
  task_id uuid,
  undo_operation_id uuid,
  created_at timestamptz not null default now(),
  constraint entry_task_candidate_resolutions_candidate_index_check
    check (candidate_index between 0 and 2147483647),
  constraint entry_task_candidate_resolutions_disposition_check
    check (disposition in ('confirmed', 'rejected', 'retained', 'dismissed')),
  constraint entry_task_candidate_resolutions_task_shape_check
    check (
      (disposition = 'confirmed' and task_id is not null)
      or (disposition <> 'confirmed' and task_id is null)
    ),
  constraint entry_task_candidate_resolutions_identity_key
    unique (user_id, interpretation_id, candidate_index),
  constraint entry_task_candidate_resolutions_task_key
    unique (user_id, task_id),
  constraint entry_task_candidate_resolutions_interpretation_owner_fk
    foreign key (user_id, entry_id, interpretation_id)
    references public.entry_interpretations (user_id, entry_id, id)
    on delete cascade,
  constraint entry_task_candidate_resolutions_task_owner_fk
    foreign key (user_id, task_id)
    references public.tasks (user_id, id),
  constraint entry_task_candidate_resolutions_undo_owner_fk
    foreign key (user_id, undo_operation_id)
    references public.undo_operations (user_id, id)
);

create index entry_task_candidate_resolutions_user_entry_idx
  on public.entry_task_candidate_resolutions (
    user_id,
    entry_id,
    interpretation_id,
    candidate_index
  );
create index entry_task_candidate_resolutions_undo_idx
  on public.entry_task_candidate_resolutions (user_id, undo_operation_id)
  where undo_operation_id is not null;

alter table public.entry_task_candidate_resolutions enable row level security;
alter table public.entry_task_candidate_resolutions force row level security;

create policy entry_task_candidate_resolutions_select_own
  on public.entry_task_candidate_resolutions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.entry_task_candidate_resolutions
  from public, anon, authenticated;
grant select on table public.entry_task_candidate_resolutions
  to authenticated;

-- Existing active provenanced tasks are already confirmed lifecycle facts.
-- Fail closed before writing if any active provenanced task cannot be mapped
-- to an exact immutable candidate identity. Legacy provenance-less tasks
-- remain covered by the compatibility branch in Needs Attention.
do $candidate_resolution_backfill$
begin
  if exists (
    select 1
    from public.tasks as task_row
    where task_row.status <> 'cancelled'
      and task_row.source_interpretation_id is not null
      and (
        task_row.source_entry_id is null
        or task_row.candidate_index is null
        or task_row.candidate_index < 0
        or not exists (
          select 1
          from public.entry_interpretations as interpretation_row
          where interpretation_row.user_id = task_row.user_id
            and interpretation_row.entry_id = task_row.source_entry_id
            and interpretation_row.id = task_row.source_interpretation_id
            and task_row.candidate_index < pg_catalog.jsonb_array_length(
              interpretation_row.task_candidates
            )
        )
      )
  ) then
    raise exception 'Invalid active candidate task provenance before disposition backfill'
      using errcode = 'P0001', detail = '2C_INVALID_CANDIDATE_PROVENANCE';
  end if;
end;
$candidate_resolution_backfill$;

insert into public.entry_task_candidate_resolutions (
  user_id,
  entry_id,
  interpretation_id,
  candidate_index,
  disposition,
  task_id,
  undo_operation_id
)
select
  task_row.user_id,
  task_row.source_entry_id,
  task_row.source_interpretation_id,
  task_row.candidate_index,
  'confirmed',
  task_row.id,
  operation_row.id
from public.tasks as task_row
join public.entry_interpretations as interpretation_row
  on interpretation_row.user_id = task_row.user_id
 and interpretation_row.entry_id = task_row.source_entry_id
 and interpretation_row.id = task_row.source_interpretation_id
left join lateral (
  select undo_row.id
  from public.undo_operations as undo_row
  where undo_row.user_id = task_row.user_id
    and task_row.id = any(undo_row.entity_ids)
  order by undo_row.created_at desc, undo_row.id desc
  limit 1
) as operation_row on true
where task_row.source_entry_id is not null
  and task_row.source_interpretation_id is not null
  and task_row.candidate_index is not null
  and task_row.candidate_index >= 0
  and task_row.candidate_index < pg_catalog.jsonb_array_length(
    interpretation_row.task_candidates
  )
  and task_row.status <> 'cancelled'
on conflict (user_id, interpretation_id, candidate_index) do nothing;

do $candidate_resolution_postcondition$
begin
  if exists (
    select 1
    from public.tasks as task_row
    where task_row.status <> 'cancelled'
      and task_row.source_interpretation_id is not null
      and (
        select pg_catalog.count(*)
        from public.entry_task_candidate_resolutions as resolution_row
        where resolution_row.user_id = task_row.user_id
          and resolution_row.entry_id = task_row.source_entry_id
          and resolution_row.interpretation_id = task_row.source_interpretation_id
          and resolution_row.candidate_index = task_row.candidate_index
          and resolution_row.disposition = 'confirmed'
          and resolution_row.task_id = task_row.id
      ) <> 1
  ) then
    raise exception 'Candidate resolution backfill postcondition failed'
      using errcode = 'P0001', detail = '2C_CANDIDATE_RESOLUTION_POSTCONDITION';
  end if;

  if exists (
    select 1
    from public.tasks as task_row
    join public.entry_task_candidate_resolutions as resolution_row
      on resolution_row.user_id = task_row.user_id
     and resolution_row.task_id = task_row.id
    where task_row.status = 'cancelled'
  ) then
    raise exception 'Cancelled task received a candidate resolution during backfill'
      using errcode = 'P0001', detail = '2C_CANCELLED_TASK_RESOLUTION';
  end if;
end;
$candidate_resolution_postcondition$;

create or replace function public.guard_entry_task_candidate_terminal_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolution_interpretation_id uuid;
  linked_resolution public.entry_task_candidate_resolutions%rowtype;
  identity_resolution public.entry_task_candidate_resolutions%rowtype;
begin
  select resolution_row.*
  into linked_resolution
  from public.entry_task_candidate_resolutions as resolution_row
  where resolution_row.task_id = new.id
  limit 1;

  if linked_resolution.id is not null then
    if linked_resolution.disposition <> 'confirmed'
      or new.user_id is distinct from linked_resolution.user_id
      or new.source_entry_id is distinct from linked_resolution.entry_id
      or new.candidate_index is distinct from linked_resolution.candidate_index
      or (
        new.source_interpretation_id is not null
        and new.source_interpretation_id is distinct from linked_resolution.interpretation_id
      )
    then
      raise exception 'Candidate task provenance conflicts with its confirmed resolution'
        using errcode = 'P0001', detail = '2C_CANDIDATE_IDENTITY_DESYNC';
    end if;

    if tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id
        or new.source_entry_id is distinct from old.source_entry_id
        or new.source_interpretation_id is distinct from old.source_interpretation_id
        or new.candidate_index is distinct from old.candidate_index
      then
        raise exception 'Candidate task provenance conflicts with its confirmed resolution'
          using errcode = 'P0001', detail = '2C_CANDIDATE_IDENTITY_DESYNC';
      end if;
    end if;

    return new;
  end if;

  if new.status = 'cancelled' then
    return new;
  end if;

  if new.candidate_index is null then
    if new.source_interpretation_id is not null then
      raise exception 'Candidate task has invalid provenance'
        using errcode = 'P0001', detail = '2C_INVALID_CANDIDATE_PROVENANCE';
    end if;
    return new;
  end if;

  if new.source_entry_id is null or new.candidate_index < 0 then
    if new.source_interpretation_id is not null then
      raise exception 'Candidate task has invalid provenance'
        using errcode = 'P0001', detail = '2C_INVALID_CANDIDATE_PROVENANCE';
    end if;
    return new;
  end if;

  resolution_interpretation_id := new.source_interpretation_id;
  if resolution_interpretation_id is null then
    select entry_row.current_interpretation_id
    into resolution_interpretation_id
    from public.entries as entry_row
    where entry_row.user_id = new.user_id
      and entry_row.id = new.source_entry_id;
  end if;
  if resolution_interpretation_id is null then
    if new.source_interpretation_id is not null then
      raise exception 'Candidate task has invalid provenance'
        using errcode = 'P0001', detail = '2C_INVALID_CANDIDATE_PROVENANCE';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.entry_interpretations as interpretation_row
    where interpretation_row.user_id = new.user_id
      and interpretation_row.entry_id = new.source_entry_id
      and interpretation_row.id = resolution_interpretation_id
      and new.candidate_index < pg_catalog.jsonb_array_length(
        interpretation_row.task_candidates
      )
  ) then
    if new.source_interpretation_id is not null then
      raise exception 'Candidate task has invalid provenance'
        using errcode = 'P0001', detail = '2C_INVALID_CANDIDATE_PROVENANCE';
    end if;
    return new;
  end if;

  select resolution_row.*
  into identity_resolution
  from public.entry_task_candidate_resolutions as resolution_row
    where resolution_row.user_id = new.user_id
      and resolution_row.entry_id = new.source_entry_id
      and resolution_row.interpretation_id = resolution_interpretation_id
      and resolution_row.candidate_index = new.candidate_index;

  if identity_resolution.id is not null
    and (
      identity_resolution.disposition <> 'confirmed'
      or identity_resolution.task_id is distinct from new.id
    )
  then
    raise exception 'Candidate already has a terminal disposition'
      using errcode = 'P0001', detail = '2C_TERMINAL_DISPOSITION';
  end if;

  return new;
end;
$$;

create or replace function public.record_entry_task_candidate_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolution_interpretation_id uuid;
  linked_resolution public.entry_task_candidate_resolutions%rowtype;
begin
  if new.status = 'cancelled' or new.candidate_index is null then
    return new;
  end if;

  select resolution_row.*
  into linked_resolution
  from public.entry_task_candidate_resolutions as resolution_row
  where resolution_row.task_id = new.id
  limit 1;
  if linked_resolution.id is not null then
    return new;
  end if;

  resolution_interpretation_id := new.source_interpretation_id;
  if resolution_interpretation_id is null then
    select entry_row.current_interpretation_id
    into resolution_interpretation_id
    from public.entries as entry_row
    where entry_row.user_id = new.user_id
      and entry_row.id = new.source_entry_id;
  end if;
  if resolution_interpretation_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.entry_interpretations as interpretation_row
    where interpretation_row.user_id = new.user_id
      and interpretation_row.entry_id = new.source_entry_id
      and interpretation_row.id = resolution_interpretation_id
      and new.candidate_index < pg_catalog.jsonb_array_length(
        interpretation_row.task_candidates
      )
  ) then
    return new;
  end if;

  insert into public.entry_task_candidate_resolutions (
    user_id,
    entry_id,
    interpretation_id,
    candidate_index,
    disposition,
    task_id
  ) values (
    new.user_id,
    new.source_entry_id,
    resolution_interpretation_id,
    new.candidate_index,
    'confirmed',
    new.id
  );

  return new;
end;
$$;

revoke all on function public.guard_entry_task_candidate_terminal_resolution()
  from public, anon, authenticated;
revoke all on function public.record_entry_task_candidate_confirmation()
  from public, anon, authenticated;

create trigger tasks_guard_terminal_candidate_resolution
before insert or update of status, user_id, source_entry_id, source_interpretation_id, candidate_index on public.tasks
for each row execute function public.guard_entry_task_candidate_terminal_resolution();

create trigger tasks_record_candidate_confirmation
after insert or update of status, user_id, source_entry_id, source_interpretation_id, candidate_index on public.tasks
for each row execute function public.record_entry_task_candidate_confirmation();

create or replace function public.confirm_entry_task_candidates_v5(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_resolutions jsonb,
  p_candidate_edits jsonb,
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
  selected_indexes integer[];
  selected_indexes_json jsonb;
  confirmed_indexes integer[] := array[]::integer[];
  resolution_count integer;
  resolution_item jsonb;
  resolution_index_numeric numeric;
  resolution_index integer;
  resolution_disposition text;
  seen_resolution_indexes integer[] := array[]::integer[];
  canonical_resolutions jsonb := '[]'::jsonb;
  edit_count integer;
  edit_item jsonb;
  edit_changes jsonb;
  edit_index_numeric numeric;
  edit_index integer;
  seen_edit_indexes integer[] := array[]::integer[];
  owned_entry public.entries%rowtype;
  interpretation public.entry_interpretations%rowtype;
  candidate jsonb;
  selected_index integer;
  suggested_title text;
  suggested_description text;
  suggested_due_text text;
  suggested_due_at timestamptz;
  effective_title text;
  effective_description text;
  effective_due_text text;
  effective_due_at timestamptz;
  effective_planned_text text;
  effective_planned_at timestamptz;
  effective_manual_priority text;
  effective_intentional_no_due boolean;
  effective_no_due_reason text;
  effective_project_ids jsonb;
  effective_context_ids jsonb;
  effective_person_ids jsonb;
  effective_waiting_on_person_ids jsonb;
  effective_confidence numeric;
  canonical_changes jsonb;
  canonical_edits jsonb := '[]'::jsonb;
  effective_candidates jsonb := '[]'::jsonb;
  effective_candidate jsonb;
  canonical_request jsonb;
  canonical_fingerprint text;
  edited_title boolean := false;
  edited_description boolean := false;
  edited_due_at boolean := false;
  edited_planned_at boolean := false;
  edited_manual_priority boolean := false;
  edited_intentional_no_due boolean := false;
  edited_no_due_reason boolean := false;
  edited_project_ids boolean := false;
  edited_context_ids boolean := false;
  edited_person_ids boolean := false;
  edited_waiting_on_person_ids boolean := false;
  edited_fields jsonb := '[]'::jsonb;
  undo_id uuid;
  existing_operation public.undo_operations%rowtype;
  created_task_id uuid;
  created_task_ids uuid[] := array[]::uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'confirm-v5:' || normalized_key;

  if pg_catalog.jsonb_typeof(p_candidate_resolutions) is distinct from 'array' then
    raise exception 'Candidate resolutions must be an array' using errcode = '22023';
  end if;
  resolution_count := pg_catalog.jsonb_array_length(p_candidate_resolutions);
  if resolution_count not between 1 and 50
    or pg_catalog.octet_length(p_candidate_resolutions::text) > 131072
  then
    raise exception 'Candidate resolutions exceed the allowed bounds' using errcode = '22023';
  end if;

  for resolution_item in
    select item.value
    from pg_catalog.jsonb_array_elements(p_candidate_resolutions) as item(value)
  loop
    if pg_catalog.jsonb_typeof(resolution_item) is distinct from 'object'
      or not (resolution_item ? 'candidateIndex')
      or not (resolution_item ? 'disposition')
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(resolution_item) as resolution_key(key)
      ) <> 2
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(resolution_item) as resolution_key(key)
        where resolution_key.key not in ('candidateIndex', 'disposition')
      )
    then
      raise exception 'Invalid candidate resolution shape' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(resolution_item -> 'candidateIndex') is distinct from 'number' then
      raise exception 'Invalid candidate resolution index' using errcode = '22023';
    end if;
    begin
      resolution_index_numeric := (resolution_item ->> 'candidateIndex')::numeric;
    exception when others then
      raise exception 'Invalid candidate resolution index' using errcode = '22023';
    end;
    if resolution_index_numeric <> pg_catalog.trunc(resolution_index_numeric)
      or resolution_index_numeric < 0
      or resolution_index_numeric > 2147483647
    then
      raise exception 'Invalid candidate resolution index' using errcode = '22023';
    end if;
    resolution_index := resolution_index_numeric::integer;
    if resolution_index = any(seen_resolution_indexes) then
      raise exception 'Duplicate candidate resolution index' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(resolution_item -> 'disposition') is distinct from 'string'
      or (resolution_item ->> 'disposition') not in (
        'confirmed', 'rejected', 'retained', 'dismissed'
      )
    then
      raise exception 'Invalid candidate disposition' using errcode = '22023';
    end if;
    resolution_disposition := resolution_item ->> 'disposition';

    seen_resolution_indexes := pg_catalog.array_append(seen_resolution_indexes, resolution_index);
    if resolution_disposition = 'confirmed' then
      confirmed_indexes := pg_catalog.array_append(confirmed_indexes, resolution_index);
    end if;
  end loop;

  select pg_catalog.array_agg(selected.value order by selected.value)
  into selected_indexes
  from pg_catalog.unnest(seen_resolution_indexes) as selected(value);
  select coalesce(
    pg_catalog.array_agg(confirmed.value order by confirmed.value),
    array[]::integer[]
  )
  into confirmed_indexes
  from pg_catalog.unnest(confirmed_indexes) as confirmed(value);
  select coalesce(
    pg_catalog.jsonb_agg(selected.value order by selected.value),
    '[]'::jsonb
  )
  into selected_indexes_json
  from pg_catalog.unnest(selected_indexes) as selected(value);
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'candidateIndex', (item.value ->> 'candidateIndex')::integer,
      'disposition', item.value ->> 'disposition'
    )
    order by (item.value ->> 'candidateIndex')::integer
  )
  into canonical_resolutions
  from pg_catalog.jsonb_array_elements(p_candidate_resolutions) as item(value);

  if pg_catalog.jsonb_typeof(p_candidate_edits) is distinct from 'array' then
    raise exception 'Candidate edits must be an array' using errcode = '22023';
  end if;
  edit_count := pg_catalog.jsonb_array_length(p_candidate_edits);
  if edit_count > 50 or pg_catalog.octet_length(p_candidate_edits::text) > 131072 then
    raise exception 'Candidate edits exceed the allowed bounds' using errcode = '22023';
  end if;

  for edit_item in
    select item.value
    from pg_catalog.jsonb_array_elements(p_candidate_edits) as item(value)
  loop
    if pg_catalog.jsonb_typeof(edit_item) is distinct from 'object'
      or not (edit_item ? 'candidateIndex')
      or not (edit_item ? 'changes')
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(edit_item) as edit_key(key)
      ) <> 2
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(edit_item) as edit_key(key)
        where edit_key.key not in ('candidateIndex', 'changes')
      )
    then
      raise exception 'Invalid candidate edit shape' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(edit_item -> 'candidateIndex') is distinct from 'number' then
      raise exception 'Invalid candidate edit index' using errcode = '22023';
    end if;
    begin
      edit_index_numeric := (edit_item ->> 'candidateIndex')::numeric;
    exception when others then
      raise exception 'Invalid candidate edit index' using errcode = '22023';
    end;
    if edit_index_numeric <> pg_catalog.trunc(edit_index_numeric)
      or edit_index_numeric < 0
      or edit_index_numeric > 2147483647
    then
      raise exception 'Invalid candidate edit index' using errcode = '22023';
    end if;
    edit_index := edit_index_numeric::integer;
    if edit_index = any(seen_edit_indexes) then
      raise exception 'Duplicate candidate edit index' using errcode = '22023';
    end if;
    if not (edit_index = any(confirmed_indexes)) then
      raise exception 'Edit targets a non-confirmed candidate' using errcode = '22023';
    end if;
    seen_edit_indexes := pg_catalog.array_append(seen_edit_indexes, edit_index);

    edit_changes := edit_item -> 'changes';
    if pg_catalog.jsonb_typeof(edit_changes) is distinct from 'object'
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(edit_changes) as change_key(key)
        where change_key.key not in (
          'title', 'description', 'dueAt',
          'plannedAt', 'manualPriority', 'intentionalNoDue', 'noDueReason',
          'projectIds', 'contextIds', 'personIds', 'waitingOnPersonIds'
        )
      )
    then
      raise exception 'Invalid candidate changes shape' using errcode = '22023';
    end if;

    if edit_changes ? 'title' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'title') is distinct from 'string'
        or pg_catalog.char_length(pg_catalog.btrim(edit_changes ->> 'title')) not between 1 and 240
      then
        raise exception 'Invalid candidate title' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'description' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'description') not in ('string', 'null') then
        raise exception 'Invalid candidate description' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'description') = 'string'
        and pg_catalog.char_length(pg_catalog.btrim(edit_changes ->> 'description')) > 2000
      then
        raise exception 'Invalid candidate description' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'dueAt' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'dueAt') not in ('string', 'null') then
        raise exception 'Invalid candidate due date' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'dueAt') = 'string' then
        effective_due_text := pg_catalog.btrim(edit_changes ->> 'dueAt');
        if effective_due_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then
          raise exception 'Invalid candidate due date' using errcode = '22023';
        end if;
        begin
          perform effective_due_text::timestamptz;
        exception when others then
          raise exception 'Invalid candidate due date' using errcode = '22023';
        end;
      end if;
    end if;

    if edit_changes ? 'plannedAt' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'plannedAt') not in ('string', 'null') then
        raise exception 'Invalid candidate planned date' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'plannedAt') = 'string' then
        effective_planned_text := pg_catalog.btrim(edit_changes ->> 'plannedAt');
        if effective_planned_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then
          raise exception 'Invalid candidate planned date' using errcode = '22023';
        end if;
        begin
          perform effective_planned_text::timestamptz;
        exception when others then
          raise exception 'Invalid candidate planned date' using errcode = '22023';
        end;
      end if;
    end if;

    if edit_changes ? 'manualPriority' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'manualPriority') not in ('string', 'null') then
        raise exception 'Invalid candidate priority' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'manualPriority') = 'string'
        and (edit_changes ->> 'manualPriority') not in ('low', 'medium', 'high', 'urgent')
      then
        raise exception 'Invalid candidate priority' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'intentionalNoDue' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'intentionalNoDue') is distinct from 'boolean' then
        raise exception 'Invalid candidate no-due flag' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'noDueReason' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'noDueReason') not in ('string', 'null') then
        raise exception 'Invalid candidate no-due reason' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(edit_changes -> 'noDueReason') = 'string'
        and pg_catalog.char_length(pg_catalog.btrim(edit_changes ->> 'noDueReason')) > 2000
      then
        raise exception 'Invalid candidate no-due reason' using errcode = '22023';
      end if;
    end if;

    -- Four owned-relation arrays: projectIds, contextIds, personIds,
    -- waitingOnPersonIds. Each must be a bounded array of well-formed,
    -- distinct UUID strings; cross-owner/nonexistent targets are validated
    -- later, once every candidate's effective set is known.
    if edit_changes ? 'projectIds' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'projectIds') is distinct from 'array' then
        raise exception 'Invalid candidate project relations' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'projectIds') > 20 then
        raise exception 'Invalid candidate project relations' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'projectIds') as element(value)
        where pg_catalog.jsonb_typeof(element.value) is distinct from 'string'
      ) then
        raise exception 'Invalid candidate project relations' using errcode = '22023';
      end if;
      begin
        perform array(
          select (element.value)::uuid
          from pg_catalog.jsonb_array_elements_text(edit_changes -> 'projectIds') as element(value)
        );
      exception when others then
        raise exception 'Invalid candidate project relations' using errcode = '22023';
      end;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'projectIds') as element(value)
      ) <> (
        select pg_catalog.count(distinct element.value)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'projectIds') as element(value)
      ) then
        raise exception 'Duplicate candidate project relation' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'contextIds' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'contextIds') is distinct from 'array' then
        raise exception 'Invalid candidate context relations' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'contextIds') > 20 then
        raise exception 'Invalid candidate context relations' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'contextIds') as element(value)
        where pg_catalog.jsonb_typeof(element.value) is distinct from 'string'
      ) then
        raise exception 'Invalid candidate context relations' using errcode = '22023';
      end if;
      begin
        perform array(
          select (element.value)::uuid
          from pg_catalog.jsonb_array_elements_text(edit_changes -> 'contextIds') as element(value)
        );
      exception when others then
        raise exception 'Invalid candidate context relations' using errcode = '22023';
      end;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'contextIds') as element(value)
      ) <> (
        select pg_catalog.count(distinct element.value)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'contextIds') as element(value)
      ) then
        raise exception 'Duplicate candidate context relation' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'personIds' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'personIds') is distinct from 'array' then
        raise exception 'Invalid candidate person relations' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'personIds') > 20 then
        raise exception 'Invalid candidate person relations' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'personIds') as element(value)
        where pg_catalog.jsonb_typeof(element.value) is distinct from 'string'
      ) then
        raise exception 'Invalid candidate person relations' using errcode = '22023';
      end if;
      begin
        perform array(
          select (element.value)::uuid
          from pg_catalog.jsonb_array_elements_text(edit_changes -> 'personIds') as element(value)
        );
      exception when others then
        raise exception 'Invalid candidate person relations' using errcode = '22023';
      end;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'personIds') as element(value)
      ) <> (
        select pg_catalog.count(distinct element.value)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'personIds') as element(value)
      ) then
        raise exception 'Duplicate candidate person relation' using errcode = '22023';
      end if;
    end if;

    if edit_changes ? 'waitingOnPersonIds' then
      if pg_catalog.jsonb_typeof(edit_changes -> 'waitingOnPersonIds') is distinct from 'array' then
        raise exception 'Invalid candidate waiting-on relations' using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(edit_changes -> 'waitingOnPersonIds') > 20 then
        raise exception 'Invalid candidate waiting-on relations' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(edit_changes -> 'waitingOnPersonIds') as element(value)
        where pg_catalog.jsonb_typeof(element.value) is distinct from 'string'
      ) then
        raise exception 'Invalid candidate waiting-on relations' using errcode = '22023';
      end if;
      begin
        perform array(
          select (element.value)::uuid
          from pg_catalog.jsonb_array_elements_text(edit_changes -> 'waitingOnPersonIds') as element(value)
        );
      exception when others then
        raise exception 'Invalid candidate waiting-on relations' using errcode = '22023';
      end;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'waitingOnPersonIds') as element(value)
      ) <> (
        select pg_catalog.count(distinct element.value)
        from pg_catalog.jsonb_array_elements_text(edit_changes -> 'waitingOnPersonIds') as element(value)
      ) then
        raise exception 'Duplicate candidate waiting-on relation' using errcode = '22023';
      end if;
    end if;
  end loop;

  select interpretation_row.*
  into interpretation
  from public.entry_interpretations as interpretation_row
  where interpretation_row.user_id = current_user_id
    and interpretation_row.entry_id = p_entry_id
    and interpretation_row.id = p_expected_interpretation_id;
  if interpretation.id is null then
    raise exception 'Entry or interpretation not found' using errcode = 'P0002';
  end if;
  if interpretation.is_record_only then
    raise exception 'Interpretation is record-only' using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(selected_indexes) as selected(value)
    where selected.value >= pg_catalog.jsonb_array_length(interpretation.task_candidates)
  ) then
    raise exception 'Invalid task candidate index' using errcode = '22023';
  end if;

  foreach selected_index in array confirmed_indexes
  loop
    candidate := interpretation.task_candidates -> selected_index;
    suggested_title := pg_catalog.btrim(candidate ->> 'title');
    suggested_description := nullif(pg_catalog.btrim(candidate ->> 'description'), '');
    suggested_due_text := nullif(pg_catalog.btrim(candidate ->> 'dueAt'), '');
    suggested_due_at := null;
    if suggested_title is null or pg_catalog.char_length(suggested_title) not between 1 and 240
      or pg_catalog.char_length(suggested_description) > 2000
    then
      raise exception 'Invalid immutable candidate value' using errcode = '22023';
    end if;
    if suggested_due_text is not null then
      begin
        suggested_due_at := suggested_due_text::timestamptz;
      exception when others then
        raise exception 'Invalid immutable candidate due date' using errcode = '22023';
      end;
    end if;
    -- The AI extraction schema never proposes planned date, priority,
    -- no-due metadata, or any relation; the immutable suggestion baseline
    -- for these fields is always the neutral/empty state, so "reset" for
    -- them means "clear".

    select item.value -> 'changes'
    into edit_changes
    from pg_catalog.jsonb_array_elements(p_candidate_edits) as item(value)
    where (item.value ->> 'candidateIndex')::integer = selected_index
    limit 1;
    if not found then
      edit_changes := '{}'::jsonb;
    end if;

    effective_title := case
      when edit_changes ? 'title' then pg_catalog.btrim(edit_changes ->> 'title')
      else suggested_title
    end;
    effective_description := case
      when not (edit_changes ? 'description') then suggested_description
      when pg_catalog.jsonb_typeof(edit_changes -> 'description') = 'null' then null
      else nullif(pg_catalog.btrim(edit_changes ->> 'description'), '')
    end;
    effective_due_text := case
      when not (edit_changes ? 'dueAt') then suggested_due_text
      when pg_catalog.jsonb_typeof(edit_changes -> 'dueAt') = 'null' then null
      else pg_catalog.btrim(edit_changes ->> 'dueAt')
    end;
    effective_due_at := null;
    if effective_due_text is not null then
      begin
        effective_due_at := effective_due_text::timestamptz;
      exception when others then
        raise exception 'Invalid candidate due date' using errcode = '22023';
      end;
    end if;

    effective_planned_text := case
      when not (edit_changes ? 'plannedAt') then null
      when pg_catalog.jsonb_typeof(edit_changes -> 'plannedAt') = 'null' then null
      else pg_catalog.btrim(edit_changes ->> 'plannedAt')
    end;
    effective_planned_at := null;
    if effective_planned_text is not null then
      begin
        effective_planned_at := effective_planned_text::timestamptz;
      exception when others then
        raise exception 'Invalid candidate planned date' using errcode = '22023';
      end;
    end if;

    effective_manual_priority := case
      when not (edit_changes ? 'manualPriority') then null
      when pg_catalog.jsonb_typeof(edit_changes -> 'manualPriority') = 'null' then null
      else edit_changes ->> 'manualPriority'
    end;

    effective_intentional_no_due := case
      when not (edit_changes ? 'intentionalNoDue') then false
      else (edit_changes ->> 'intentionalNoDue')::boolean
    end;

    effective_no_due_reason := case
      when not (edit_changes ? 'noDueReason') then null
      when pg_catalog.jsonb_typeof(edit_changes -> 'noDueReason') = 'null' then null
      else nullif(pg_catalog.btrim(edit_changes ->> 'noDueReason'), '')
    end;

    if (effective_no_due_reason is null or effective_intentional_no_due)
        and (not effective_intentional_no_due or effective_due_at is null)
    then
      null;
    else
      raise exception 'Invalid candidate no-due state' using errcode = '22023';
    end if;

    -- Canonicalize each relation array: sorted, deduplicated text UUIDs.
    -- Sorting makes the replay fingerprint stable regardless of the order
    -- the client submitted IDs in.
    effective_project_ids := case
      when not (edit_changes ? 'projectIds') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(id.value order by id.value)
          from (
            select distinct element.value as value
            from pg_catalog.jsonb_array_elements_text(edit_changes -> 'projectIds') as element(value)
          ) as id
        ),
        '[]'::jsonb
      )
    end;
    effective_context_ids := case
      when not (edit_changes ? 'contextIds') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(id.value order by id.value)
          from (
            select distinct element.value as value
            from pg_catalog.jsonb_array_elements_text(edit_changes -> 'contextIds') as element(value)
          ) as id
        ),
        '[]'::jsonb
      )
    end;
    effective_person_ids := case
      when not (edit_changes ? 'personIds') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(id.value order by id.value)
          from (
            select distinct element.value as value
            from pg_catalog.jsonb_array_elements_text(edit_changes -> 'personIds') as element(value)
          ) as id
        ),
        '[]'::jsonb
      )
    end;
    effective_waiting_on_person_ids := case
      when not (edit_changes ? 'waitingOnPersonIds') then '[]'::jsonb
      else coalesce(
        (
          select pg_catalog.jsonb_agg(id.value order by id.value)
          from (
            select distinct element.value as value
            from pg_catalog.jsonb_array_elements_text(edit_changes -> 'waitingOnPersonIds') as element(value)
          ) as id
        ),
        '[]'::jsonb
      )
    end;

    effective_confidence := coalesce(
      (candidate ->> 'confidence')::numeric,
      interpretation.confidence
    );

    canonical_changes := '{}'::jsonb;
    if edit_changes ? 'title' and effective_title is distinct from suggested_title then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('title', effective_title);
      edited_title := true;
    end if;
    if edit_changes ? 'description'
      and effective_description is distinct from suggested_description
    then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('description', effective_description);
      edited_description := true;
    end if;
    if edit_changes ? 'dueAt' and effective_due_at is distinct from suggested_due_at then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('dueAt', effective_due_text);
      edited_due_at := true;
    end if;
    if edit_changes ? 'plannedAt' and effective_planned_at is distinct from null then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('plannedAt', effective_planned_text);
      edited_planned_at := true;
    end if;
    if edit_changes ? 'manualPriority' and effective_manual_priority is distinct from null then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('manualPriority', effective_manual_priority);
      edited_manual_priority := true;
    end if;
    if edit_changes ? 'intentionalNoDue' and effective_intentional_no_due is distinct from false then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('intentionalNoDue', effective_intentional_no_due);
      edited_intentional_no_due := true;
    end if;
    if edit_changes ? 'noDueReason' and effective_no_due_reason is distinct from null then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('noDueReason', effective_no_due_reason);
      edited_no_due_reason := true;
    end if;
    if effective_project_ids <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('projectIds', effective_project_ids);
      edited_project_ids := true;
    end if;
    if effective_context_ids <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('contextIds', effective_context_ids);
      edited_context_ids := true;
    end if;
    if effective_person_ids <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('personIds', effective_person_ids);
      edited_person_ids := true;
    end if;
    if effective_waiting_on_person_ids <> '[]'::jsonb then
      canonical_changes := canonical_changes || pg_catalog.jsonb_build_object('waitingOnPersonIds', effective_waiting_on_person_ids);
      edited_waiting_on_person_ids := true;
    end if;
    if canonical_changes <> '{}'::jsonb then
      canonical_edits := canonical_edits || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'candidateIndex', selected_index,
          'changes', canonical_changes
        )
      );
    end if;

    effective_candidates := effective_candidates || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'candidateIndex', selected_index,
        'title', effective_title,
        'description', effective_description,
        'dueAt', effective_due_text,
        'plannedAt', effective_planned_text,
        'manualPriority', effective_manual_priority,
        'intentionalNoDue', effective_intentional_no_due,
        'noDueReason', effective_no_due_reason,
        'projectIds', effective_project_ids,
        'contextIds', effective_context_ids,
        'personIds', effective_person_ids,
        'waitingOnPersonIds', effective_waiting_on_person_ids,
        'confidence', effective_confidence
      )
    );
  end loop;

  -- Validate every relation target across every candidate at once: owned by
  -- this user, or the whole materialization aborts atomically (2C-RELATIONS-004).
  -- No relation is ever resolved by label -- only by ID (2C-RELATIONS-003).
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value),
         pg_catalog.jsonb_array_elements_text(candidate_row.value -> 'projectIds') as project_ref(id)
    where not exists (
      select 1
      from public.projects as owned_project
      where owned_project.user_id = current_user_id
        and owned_project.id = project_ref.id::uuid
    )
  ) then
    raise exception 'Invalid or cross-owner project relation'
      using errcode = '22023', detail = '2C_INVALID_RELATION';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value),
         pg_catalog.jsonb_array_elements_text(candidate_row.value -> 'contextIds') as context_ref(id)
    where not exists (
      select 1
      from public.contexts as owned_context
      where owned_context.user_id = current_user_id
        and owned_context.id = context_ref.id::uuid
    )
  ) then
    raise exception 'Invalid or cross-owner context relation'
      using errcode = '22023', detail = '2C_INVALID_RELATION';
  end if;

  -- Fixed: parenthesize both '->' operands before '||' -- see header note.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(effective_candidates) as candidate_row(value),
         pg_catalog.jsonb_array_elements_text(
           (candidate_row.value -> 'personIds') || (candidate_row.value -> 'waitingOnPersonIds')
         ) as person_ref(id)
    where not exists (
      select 1
      from public.people as owned_person
      where owned_person.user_id = current_user_id
        and owned_person.id = person_ref.id::uuid
    )
  ) then
    raise exception 'Invalid or cross-owner person relation'
      using errcode = '22023', detail = '2C_INVALID_RELATION';
  end if;

  if edited_title then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('title');
  end if;
  if edited_description then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('description');
  end if;
  if edited_due_at then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('dueAt');
  end if;
  if edited_planned_at then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('plannedAt');
  end if;
  if edited_manual_priority then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('manualPriority');
  end if;
  if edited_intentional_no_due then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('intentionalNoDue');
  end if;
  if edited_no_due_reason then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('noDueReason');
  end if;
  if edited_project_ids then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('projectIds');
  end if;
  if edited_context_ids then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('contextIds');
  end if;
  if edited_person_ids then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('personIds');
  end if;
  if edited_waiting_on_person_ids then
    edited_fields := edited_fields || pg_catalog.jsonb_build_array('waitingOnPersonIds');
  end if;

  canonical_request := pg_catalog.jsonb_build_object(
    'entryId', p_entry_id,
    'interpretationId', p_expected_interpretation_id,
    'resolutions', canonical_resolutions,
    'candidateEdits', canonical_edits
  );
  canonical_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(canonical_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.undo_operations (
    user_id,
    action_type,
    entity_type,
    entity_ids,
    after_state,
    operation_key,
    source_entry_id,
    source_interpretation_id,
    request_fingerprint
  ) values (
    current_user_id,
    'confirm_entry_task_candidates_v5',
    'entry_task_candidate_resolution',
    array[]::uuid[],
    pg_catalog.jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', p_expected_interpretation_id,
      'task_ids', '[]'::jsonb,
      'candidate_indexes', selected_indexes_json,
      'resolutions', canonical_resolutions,
      'edited_fields', edited_fields
    ),
    internal_operation_key,
    p_entry_id,
    p_expected_interpretation_id,
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
        using errcode = 'P0001', detail = '2C_IDEMPOTENCY_MISMATCH';
    end if;
    return pg_catalog.jsonb_build_object(
      'task_ids', pg_catalog.to_jsonb(existing_operation.entity_ids),
      'undo_id', existing_operation.id,
      'idempotent', true
    );
  end if;

  select entry_row.*
  into owned_entry
  from public.entries as entry_row
  where entry_row.id = p_entry_id
    and entry_row.user_id = current_user_id
  for update;
  if owned_entry.id is null then
    raise exception 'Entry or interpretation not found' using errcode = 'P0002';
  end if;
  if owned_entry.current_interpretation_id is distinct from p_expected_interpretation_id then
    raise exception 'Interpretation is no longer current' using errcode = '55P03';
  end if;
  if interpretation.user_id is distinct from owned_entry.user_id
    or interpretation.entry_id is distinct from owned_entry.id
    or interpretation.id is distinct from owned_entry.current_interpretation_id
  then
    raise exception 'Entry or interpretation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.entry_task_candidate_resolutions as resolution_row
    where resolution_row.user_id = current_user_id
      and resolution_row.entry_id = p_entry_id
      and resolution_row.interpretation_id = interpretation.id
      and resolution_row.candidate_index = any(selected_indexes)
  ) then
    raise exception 'Candidate already has a terminal disposition'
      using errcode = 'P0001', detail = '2C_TERMINAL_DISPOSITION';
  end if;

  if exists (
    select 1
    from public.tasks as task_row
    where task_row.user_id = current_user_id
      and task_row.source_entry_id = p_entry_id
      and task_row.status <> 'cancelled'
      and task_row.candidate_index = any(selected_indexes)
      and (
        task_row.source_interpretation_id = interpretation.id
        or task_row.source_interpretation_id is null
      )
  ) then
    raise exception 'Candidate already materialized'
      using errcode = 'P0001', detail = '2C_ALREADY_MATERIALIZED';
  end if;

  for effective_candidate in
    select item.value
    from pg_catalog.jsonb_array_elements(effective_candidates) as item(value)
    order by (item.value ->> 'candidateIndex')::integer
  loop
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
      parent_task_id,
      waiting_on_person_id,
      no_due_reason,
      intentional_no_due
    ) values (
      current_user_id,
      p_entry_id,
      interpretation.id,
      (effective_candidate ->> 'candidateIndex')::integer,
      normalized_key,
      effective_candidate ->> 'title',
      effective_candidate ->> 'description',
      'inbox',
      effective_candidate ->> 'manualPriority',
      (effective_candidate ->> 'dueAt')::timestamptz,
      (effective_candidate ->> 'plannedAt')::timestamptz,
      (effective_candidate ->> 'confidence')::numeric,
      'user',
      null,
      null,
      effective_candidate ->> 'noDueReason',
      (effective_candidate ->> 'intentionalNoDue')::boolean
    )
    on conflict (source_interpretation_id, candidate_index)
      where source_interpretation_id is not null and status <> 'cancelled'
    do nothing
    returning id into created_task_id;

    if created_task_id is null then
      raise exception 'Candidate already materialized'
        using errcode = 'P0001', detail = '2C_ALREADY_MATERIALIZED';
    end if;
    created_task_ids := pg_catalog.array_append(created_task_ids, created_task_id);

    insert into public.task_projects (task_id, project_id, user_id)
    select created_task_id, project_ref.id::uuid, current_user_id
    from pg_catalog.jsonb_array_elements_text(effective_candidate -> 'projectIds') as project_ref(id)
    on conflict do nothing;

    insert into public.task_contexts (task_id, context_id, user_id)
    select created_task_id, context_ref.id::uuid, current_user_id
    from pg_catalog.jsonb_array_elements_text(effective_candidate -> 'contextIds') as context_ref(id)
    on conflict do nothing;

    insert into public.task_people (task_id, person_id, user_id, role)
    select created_task_id, person_ref.id::uuid, current_user_id, 'involved'
    from pg_catalog.jsonb_array_elements_text(effective_candidate -> 'personIds') as person_ref(id)
    on conflict do nothing;

    insert into public.task_people (task_id, person_id, user_id, role)
    select created_task_id, person_ref.id::uuid, current_user_id, 'waiting_on'
    from pg_catalog.jsonb_array_elements_text(effective_candidate -> 'waitingOnPersonIds') as person_ref(id)
    on conflict do nothing;

    created_task_id := null;
  end loop;

  update public.entry_task_candidate_resolutions
  set undo_operation_id = undo_id
  where user_id = current_user_id
    and task_id = any(created_task_ids);

  insert into public.entry_task_candidate_resolutions (
    user_id,
    entry_id,
    interpretation_id,
    candidate_index,
    disposition,
    task_id,
    undo_operation_id
  )
  select
    current_user_id,
    p_entry_id,
    interpretation.id,
    (resolution_row.value ->> 'candidateIndex')::integer,
    resolution_row.value ->> 'disposition',
    null,
    undo_id
  from pg_catalog.jsonb_array_elements(canonical_resolutions) as resolution_row(value)
  where resolution_row.value ->> 'disposition' <> 'confirmed';

  update public.undo_operations
  set
    entity_ids = created_task_ids,
    after_state = pg_catalog.jsonb_build_object(
      'entry_id', p_entry_id,
      'interpretation_id', interpretation.id,
      'task_ids', pg_catalog.to_jsonb(created_task_ids),
      'candidate_indexes', selected_indexes_json,
      'resolutions', canonical_resolutions,
      'edited_fields', edited_fields
    )
  where id = undo_id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    actor,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'confirm_entry_task_candidates_v5',
    'entry_task_candidate_resolution',
    'user',
    pg_catalog.jsonb_build_object(
      'task_ids', pg_catalog.to_jsonb(created_task_ids),
      'candidate_indexes', selected_indexes_json,
      'resolutions', canonical_resolutions,
      'edited_fields', edited_fields,
      'interpretation_id', interpretation.id,
      'request_fingerprint', canonical_fingerprint
    ),
    'User resolved task candidates from the current interpretation',
    p_entry_id
  );

  return pg_catalog.jsonb_build_object(
    'task_ids', pg_catalog.to_jsonb(created_task_ids),
    'undo_id', undo_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)
  to authenticated;

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
  resolution_affected integer := 0;
  expected_resolution_count integer := 0;
  result_affected integer := 0;
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

  if operation.action_type in (
    'confirm_entry_tasks',
    'confirm_entry_task_candidates',
    'confirm_entry_task_candidates_v5'
  ) then
    update public.tasks
    set status = 'cancelled', cancelled_at = now()
    where user_id = current_user_id
      and id = any(operation.entity_ids)
      and status <> 'cancelled';
    get diagnostics affected = row_count;

    delete from public.entry_task_candidate_resolutions as resolution_row
    where resolution_row.user_id = current_user_id
      and (
        resolution_row.undo_operation_id = operation.id
        or (
          pg_catalog.cardinality(operation.entity_ids) > 0
          and resolution_row.task_id = any(operation.entity_ids)
        )
    );
    get diagnostics resolution_affected = row_count;

    if operation.action_type = 'confirm_entry_task_candidates_v5' then
      if pg_catalog.jsonb_typeof(operation.after_state -> 'resolutions') is distinct from 'array' then
        raise exception 'Candidate resolution undo integrity check failed'
          using errcode = 'P0001', detail = '2C_UNDO_RESOLUTION_INTEGRITY';
      end if;
      expected_resolution_count := pg_catalog.jsonb_array_length(
        operation.after_state -> 'resolutions'
      );
      if resolution_affected <> expected_resolution_count then
        raise exception 'Candidate resolution undo integrity check failed'
          using errcode = 'P0001', detail = '2C_UNDO_RESOLUTION_INTEGRITY';
      end if;
    end if;

    result_affected := case
      when operation.action_type = 'confirm_entry_task_candidates_v5'
        then pg_catalog.greatest(affected, resolution_affected)
      else affected
    end;

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
      jsonb_build_object(
        'cancelled_entity_ids', to_jsonb(operation.entity_ids),
        'removed_candidate_resolution_count', resolution_affected
      ),
      'User executed the stored compensating operation'
    );
    return jsonb_build_object('undone', true, 'affected', result_affected, 'idempotent', false);
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

revoke all on function public.undo_operation(uuid) from public, anon;
grant execute on function public.undo_operation(uuid) to authenticated;

create or replace function public.guard_v2_confirmed_interpretation_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origin = 'user_corrected'
    and new.parent_interpretation_id is not null
    and exists (
      select 1
      from public.undo_operations as operation_row
      join public.tasks as task_row
        on task_row.id = any(operation_row.entity_ids)
       and task_row.user_id = operation_row.user_id
      where operation_row.user_id = new.user_id
        and operation_row.source_entry_id = new.entry_id
        and operation_row.source_interpretation_id = new.parent_interpretation_id
        and (
          (
            operation_row.action_type = 'confirm_entry_task_candidates'
            and (
              operation_row.operation_key like 'confirm-v2:%'
              or operation_row.operation_key like 'confirm-v3:%'
              or operation_row.operation_key like 'confirm-v4:%'
            )
          )
          or (
            operation_row.action_type = 'confirm_entry_task_candidates_v5'
            and operation_row.operation_key like 'confirm-v5:%'
          )
        )
        and task_row.status <> 'cancelled'
    )
  then
    raise exception 'Interpretation changed; reload before saving'
      using errcode = '55P03';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_v2_confirmed_interpretation_correction()
  from public, anon, authenticated;

-- Phase 2X Slice 2X.10 hotfix: fix a name-collision bug in
-- list_needs_attention's has_unconfirmed_candidate check.
--
-- Migration 202607180030 computed has_unconfirmed_candidate as:
--
--   exists (
--     select 1
--     from generate_series(0, ... - 1) as candidate_index
--     where not exists (
--       select 1 from public.tasks t
--       where ... and t.candidate_index = candidate_index and ...
--     )
--   )
--
-- The outer generate_series alias is named candidate_index â€” the same name
-- as public.tasks's own candidate_index column. Inside the inner correlated
-- subquery (from public.tasks t), the bare, unqualified candidate_index on
-- the right-hand side of "t.candidate_index = candidate_index" resolves
-- against the *innermost* scope first, i.e. tasks itself, not the outer
-- generate_series value. The comparison silently became
-- "t.candidate_index = t.candidate_index" (always true) instead of
-- "t.candidate_index = <the outer loop's index>".
--
-- Effect, confirmed live against the linked project before this fix: as soon
-- as ANY task existed for an entry, the inner NOT EXISTS became false for
-- *every* generate_series value, so has_unconfirmed_candidate went false
-- even when a different candidate index on the same current interpretation
-- was still genuinely unconfirmed. Confirming one of two candidates
-- incorrectly removed the entry from the Needs Attention queue entirely,
-- instead of leaving it listed until the remaining candidate was resolved
-- (NY-004/NY-013).
--
-- Fix: name the generate_series output as a two-part alias
-- (candidate_slot(idx)) that cannot collide with any table's own column
-- name, and reference it explicitly as candidate_slot.idx. Every other
-- predicate, the function signature, security definer, search_path, grants,
-- and the supporting index from migration 030 are unchanged.

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
    select e.id
    from public.entries e
    cross join scoped_user u
    where e.user_id = u.id
      and e.status = 'completed'
      and exists (
        select 1 from public.pending_questions pq
        where pq.user_id = u.id and pq.entry_id = e.id and pq.status = 'open'
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
        where pq.user_id = e.user_id and pq.entry_id = e.id and pq.status = 'open'
      ) as has_open_question,
      (
        -- uuid has no min() aggregate; order+limit picks the oldest open
        -- question deterministically instead.
        select pq.id from public.pending_questions pq
        where pq.user_id = e.user_id and pq.entry_id = e.id and pq.status = 'open'
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
      ) as has_unconfirmed_candidate
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
        when f.entry_status in ('awaiting_review', 'partially_processed')
          then 'review_interpretation'
        when f.entry_status = 'completed' and f.has_open_question
          then 'answer_existing_question'
        when f.entry_status = 'completed'
          and f.candidate_count > 0
          and not f.record_only
          and f.has_unconfirmed_candidate
          then 'confirm_existing_candidates'
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
