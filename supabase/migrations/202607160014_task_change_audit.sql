create or replace function public.audit_task_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (user_id, action_type, entity_type, entity_id, actor, after_state, reason, source_entry_id)
    values (
      new.user_id, 'task_created', 'task', new.id,
      case when new.created_by = 'agent' then 'agent' else 'user' end,
      jsonb_build_object('status', new.status, 'due_at', new.due_at, 'priority', new.manual_priority, 'source_entry_id', new.source_entry_id),
      'Task created', new.source_entry_id
    );
  elsif old.status is distinct from new.status or old.due_at is distinct from new.due_at
    or old.manual_priority is distinct from new.manual_priority or old.planned_at is distinct from new.planned_at
    or old.parent_task_id is distinct from new.parent_task_id then
    insert into public.audit_logs (user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id)
    values (
      new.user_id, 'task_updated', 'task', new.id, 'user',
      jsonb_build_object('status', old.status, 'due_at', old.due_at, 'priority', old.manual_priority, 'planned_at', old.planned_at, 'parent_task_id', old.parent_task_id),
      jsonb_build_object('status', new.status, 'due_at', new.due_at, 'priority', new.manual_priority, 'planned_at', new.planned_at, 'parent_task_id', new.parent_task_id),
      'Task state changed', new.source_entry_id
    );
  end if;
  return new;
end;
$$;
create trigger tasks_audit_changes after insert or update on public.tasks
for each row execute function public.audit_task_change();
