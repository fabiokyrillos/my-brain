-- Phase 2C.1 forward fix: a user correction must not supersede an
-- interpretation while tasks from a v2 confirmation remain active.
--
-- Both confirmation and correction serialize on entries, but confirmation
-- intentionally does not replace the current interpretation pointer. Without
-- this guard, a correction waiting behind a successful confirmation could
-- resume and also commit, leaving active tasks sourced from an interpretation
-- that was no longer current. Legacy confirmations remain compatible because
-- only the confirm-v2 operation namespace participates in this boundary.

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
        and operation_row.action_type = 'confirm_entry_task_candidates'
        and operation_row.operation_key like 'confirm-v2:%'
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

create trigger entry_interpretations_guard_v2_confirmation_correction
before insert on public.entry_interpretations
for each row
when (new.origin = 'user_corrected')
execute function public.guard_v2_confirmed_interpretation_correction();
