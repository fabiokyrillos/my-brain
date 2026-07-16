create or replace function public.confirm_entry_tasks(
  p_entry_id uuid,
  p_candidate_indexes integer[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  interpretation public.entry_interpretations%rowtype;
  candidate jsonb;
  selected_index integer;
  created_task_id uuid;
  created_task_ids uuid[] := array[]::uuid[];
  result_task_ids uuid[] := array[]::uuid[];
  undo_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(array_length(p_candidate_indexes, 1), 0) = 0 then raise exception 'Select at least one task'; end if;

  select * into interpretation
  from public.entry_interpretations
  where entry_id = p_entry_id and user_id = current_user_id
  order by version desc
  limit 1
  for update;

  if interpretation.id is null then raise exception 'Interpretation not found' using errcode = 'P0002'; end if;

  foreach selected_index in array (select array_agg(distinct value order by value) from unnest(p_candidate_indexes) value)
  loop
    if selected_index < 0 or selected_index >= jsonb_array_length(interpretation.task_candidates) then
      raise exception 'Invalid task candidate index';
    end if;
    candidate := interpretation.task_candidates -> selected_index;

    insert into public.tasks (
      user_id, source_entry_id, candidate_index, title, description, status,
      due_at, confidence, created_by
    ) values (
      current_user_id,
      p_entry_id,
      selected_index,
      candidate ->> 'title',
      nullif(candidate ->> 'description', ''),
      case when candidate ->> 'waitingOn' is not null then 'waiting' else 'inbox' end,
      nullif(candidate ->> 'dueAt', '')::timestamptz,
      coalesce((candidate ->> 'confidence')::numeric, interpretation.confidence),
      'user'
    )
    on conflict on constraint tasks_source_entry_id_candidate_index_key do nothing
    returning id into created_task_id;

    if created_task_id is not null then created_task_ids := array_append(created_task_ids, created_task_id); end if;
    created_task_id := null;
  end loop;

  select coalesce(array_agg(public.tasks.id order by public.tasks.candidate_index), array[]::uuid[])
  into result_task_ids
  from public.tasks
  where public.tasks.user_id = current_user_id
    and public.tasks.source_entry_id = p_entry_id
    and public.tasks.candidate_index = any(p_candidate_indexes);

  if coalesce(array_length(created_task_ids, 1), 0) > 0 then
    insert into public.undo_operations (user_id, action_type, entity_type, entity_ids, after_state)
    values (
      current_user_id, 'confirm_entry_tasks', 'task', created_task_ids,
      jsonb_build_object('entry_id', p_entry_id, 'task_ids', to_jsonb(created_task_ids))
    ) returning id into undo_id;

    insert into public.audit_logs (
      user_id, action_type, entity_type, actor, after_state, reason, source_entry_id
    ) values (
      current_user_id, 'tasks_confirmed', 'task', 'user',
      jsonb_build_object('task_ids', to_jsonb(created_task_ids), 'candidate_indexes', to_jsonb(p_candidate_indexes)),
      'User confirmed task candidates from an interpreted entry', p_entry_id
    );
  end if;

  return jsonb_build_object('task_ids', to_jsonb(result_task_ids), 'undo_id', undo_id);
end;
$$;
