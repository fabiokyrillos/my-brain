-- Forward fix for Phase 2C Slice 2C.4 legacy provenance enrichment.
--
-- Migration 041 is already applied. Replace only the exact current terminal
-- resolution guard so a linked legacy task may move once from null provenance
-- to the interpretation already recorded by its confirmed resolution.
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
        or (
          new.source_interpretation_id is distinct from old.source_interpretation_id
          and not (
            old.source_interpretation_id is null
            and new.source_interpretation_id is not distinct from linked_resolution.interpretation_id
          )
        )
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
