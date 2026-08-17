-- Give awaiting-review entries a positive resolution path. Previously the UI
-- offered correction and reprocessing only, so a correct interpretation could
-- never leave Needs Attention without being changed.

create or replace function public.confirm_entry_interpretation(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_key is null then
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
    raise exception 'Interpretation is no longer current' using errcode = '55P03';
  end if;
  if owned_entry.status = 'completed' then
    return jsonb_build_object('entryId', owned_entry.id, 'idempotent', true);
  end if;
  if owned_entry.status <> 'awaiting_review' then
    raise exception 'Entry is not awaiting review' using errcode = '55P03';
  end if;

  update public.entries
  set status = 'completed', processing_error = null
  where id = owned_entry.id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'interpretation_confirmed',
    'entry',
    'user',
    jsonb_build_object('status', owned_entry.status, 'interpretation_id', owned_entry.current_interpretation_id),
    jsonb_build_object('status', 'completed', 'interpretation_id', owned_entry.current_interpretation_id),
    'operation:' || p_operation_key::text,
    owned_entry.id
  );

  return jsonb_build_object('entryId', owned_entry.id, 'idempotent', false);
end;
$$;

revoke all on function public.confirm_entry_interpretation(uuid, uuid, uuid) from public, anon;
grant execute on function public.confirm_entry_interpretation(uuid, uuid, uuid) to authenticated;
