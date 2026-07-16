create or replace function public.confirm_entry_tasks(p_entry_id uuid, p_candidate_indexes integer[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid(); interpretation public.entry_interpretations%rowtype;
  candidate jsonb; selected_index integer; created_task_id uuid; child_task_id uuid; candidate_parent_id uuid;
  created_task_ids uuid[] := array[]::uuid[]; result_task_ids uuid[] := array[]::uuid[]; undo_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(array_length(p_candidate_indexes, 1), 0) = 0 then raise exception 'Select at least one task'; end if;
  select * into interpretation from public.entry_interpretations where entry_id = p_entry_id and user_id = current_user_id order by version desc limit 1 for update;
  if interpretation.id is null then raise exception 'Interpretation not found' using errcode = 'P0002'; end if;

  foreach selected_index in array (select array_agg(distinct value order by value) from unnest(p_candidate_indexes) value)
  loop
    if selected_index < 0 or selected_index >= jsonb_array_length(interpretation.task_candidates) then raise exception 'Invalid task candidate index'; end if;
    candidate := interpretation.task_candidates -> selected_index;
    insert into public.tasks (user_id, source_entry_id, candidate_index, title, description, status, due_at, confidence, created_by)
    values (current_user_id, p_entry_id, selected_index, candidate ->> 'title', nullif(candidate ->> 'description',''),
      case when candidate ->> 'waitingOn' is not null then 'waiting' else 'inbox' end,
      nullif(candidate ->> 'dueAt','')::timestamptz, coalesce((candidate ->> 'confidence')::numeric, interpretation.confidence), 'user')
    on conflict on constraint tasks_source_entry_id_candidate_index_key do nothing returning id into created_task_id;
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
