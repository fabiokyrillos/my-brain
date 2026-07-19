-- Sprint 1.5: enforce relationship ownership, least-privilege writes, and
-- timezone-safe/lossless heartbeat evaluation without rewriting prior history.

alter function public.persist_entry_interpretation(uuid, jsonb, text, text, text, integer, integer)
  security definer;
alter function public.confirm_entry_tasks(uuid, integer[])
  security definer;
alter function public.undo_operation(uuid)
  security definer;

-- Composite ownership keys let every concrete relationship prove that the
-- referenced row belongs to the same user as the relationship itself.
alter table public.contexts add constraint contexts_user_id_id_key unique (user_id, id);
alter table public.organizations add constraint organizations_user_id_id_key unique (user_id, id);
alter table public.projects add constraint projects_user_id_id_key unique (user_id, id);
alter table public.people add constraint people_user_id_id_key unique (user_id, id);
alter table public.entries add constraint entries_user_id_id_key unique (user_id, id);
alter table public.entry_interpretations add constraint entry_interpretations_user_id_id_key unique (user_id, id);
alter table public.tasks add constraint tasks_user_id_id_key unique (user_id, id);
alter table public.conversations add constraint conversations_user_id_id_key unique (user_id, id);
alter table public.attachments add constraint attachments_user_id_id_key unique (user_id, id);
alter table public.tags add constraint tags_user_id_id_key unique (user_id, id);

alter table public.projects
  add constraint projects_organization_owner_fk
  foreign key (user_id, organization_id) references public.organizations (user_id, id);
alter table public.people
  add constraint people_organization_owner_fk
  foreign key (user_id, organization_id) references public.organizations (user_id, id);
alter table public.entry_interpretations
  add constraint entry_interpretations_entry_owner_fk
  foreign key (user_id, entry_id) references public.entries (user_id, id);
alter table public.entry_entities
  add constraint entry_entities_entry_owner_fk
  foreign key (user_id, entry_id) references public.entries (user_id, id),
  add constraint entry_entities_interpretation_owner_fk
  foreign key (user_id, interpretation_id) references public.entry_interpretations (user_id, id);
alter table public.tasks
  add constraint tasks_source_entry_owner_fk
  foreign key (user_id, source_entry_id) references public.entries (user_id, id),
  add constraint tasks_parent_owner_fk
  foreign key (user_id, parent_task_id) references public.tasks (user_id, id),
  add constraint tasks_waiting_person_owner_fk
  foreign key (user_id, waiting_on_person_id) references public.people (user_id, id);
alter table public.audit_logs
  add constraint audit_logs_source_entry_owner_fk
  foreign key (user_id, source_entry_id) references public.entries (user_id, id);
alter table public.memories
  add constraint memories_source_entry_owner_fk
  foreign key (user_id, source_entry_id) references public.entries (user_id, id),
  add constraint memories_person_owner_fk
  foreign key (user_id, person_id) references public.people (user_id, id),
  add constraint memories_project_owner_fk
  foreign key (user_id, project_id) references public.projects (user_id, id);
alter table public.entry_embeddings
  add constraint entry_embeddings_entry_owner_fk
  foreign key (user_id, entry_id) references public.entries (user_id, id);
alter table public.conversation_messages
  add constraint conversation_messages_conversation_owner_fk
  foreign key (user_id, conversation_id) references public.conversations (user_id, id);
alter table public.pending_questions
  add constraint pending_questions_entry_owner_fk
  foreign key (user_id, entry_id) references public.entries (user_id, id),
  add constraint pending_questions_interpretation_owner_fk
  foreign key (user_id, interpretation_id) references public.entry_interpretations (user_id, id);
alter table public.reminders
  add constraint reminders_task_owner_fk
  foreign key (user_id, task_id) references public.tasks (user_id, id),
  add constraint reminders_entry_owner_fk
  foreign key (user_id, entry_id) references public.entries (user_id, id);
alter table public.entity_attachments
  add constraint entity_attachments_attachment_owner_fk
  foreign key (user_id, attachment_id) references public.attachments (user_id, id);
alter table public.person_relationships
  add constraint person_relationships_person_owner_fk
  foreign key (user_id, person_id) references public.people (user_id, id),
  add constraint person_relationships_related_person_owner_fk
  foreign key (user_id, related_person_id) references public.people (user_id, id);
alter table public.person_contexts
  add constraint person_contexts_person_owner_fk
  foreign key (user_id, person_id) references public.people (user_id, id),
  add constraint person_contexts_context_owner_fk
  foreign key (user_id, context_id) references public.contexts (user_id, id);
alter table public.person_projects
  add constraint person_projects_person_owner_fk
  foreign key (user_id, person_id) references public.people (user_id, id),
  add constraint person_projects_project_owner_fk
  foreign key (user_id, project_id) references public.projects (user_id, id);
alter table public.task_people
  add constraint task_people_task_owner_fk
  foreign key (user_id, task_id) references public.tasks (user_id, id),
  add constraint task_people_person_owner_fk
  foreign key (user_id, person_id) references public.people (user_id, id);
alter table public.task_projects
  add constraint task_projects_task_owner_fk
  foreign key (user_id, task_id) references public.tasks (user_id, id),
  add constraint task_projects_project_owner_fk
  foreign key (user_id, project_id) references public.projects (user_id, id);
alter table public.task_contexts
  add constraint task_contexts_task_owner_fk
  foreign key (user_id, task_id) references public.tasks (user_id, id),
  add constraint task_contexts_context_owner_fk
  foreign key (user_id, context_id) references public.contexts (user_id, id);
alter table public.task_dependencies
  add constraint task_dependencies_task_owner_fk
  foreign key (user_id, task_id) references public.tasks (user_id, id),
  add constraint task_dependencies_dependency_owner_fk
  foreign key (user_id, depends_on_task_id) references public.tasks (user_id, id);
alter table public.entity_tags
  add constraint entity_tags_tag_owner_fk
  foreign key (user_id, tag_id) references public.tags (user_id, id);
alter table public.attachment_interpretations
  add constraint attachment_interpretations_attachment_owner_fk
  foreign key (user_id, attachment_id) references public.attachments (user_id, id);

create or replace function public.entity_is_owned(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_entity_type
    when 'context' then exists (select 1 from public.contexts where user_id = p_user_id and id = p_entity_id)
    when 'organization' then exists (select 1 from public.organizations where user_id = p_user_id and id = p_entity_id)
    when 'entry' then exists (select 1 from public.entries where user_id = p_user_id and id = p_entity_id)
    when 'task' then exists (select 1 from public.tasks where user_id = p_user_id and id = p_entity_id)
    when 'project' then exists (select 1 from public.projects where user_id = p_user_id and id = p_entity_id)
    when 'person' then exists (select 1 from public.people where user_id = p_user_id and id = p_entity_id)
    when 'conversation' then exists (select 1 from public.conversations where user_id = p_user_id and id = p_entity_id)
    when 'reminder' then exists (select 1 from public.reminders where user_id = p_user_id and id = p_entity_id)
    else false
  end;
end;
$$;
revoke all on function public.entity_is_owned(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.validate_polymorphic_entity_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.entity_is_owned(new.user_id, new.entity_type, new.entity_id) then
    raise exception 'Referenced entity does not belong to the relationship owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_polymorphic_entity_owner() from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from public.entry_entities row
    where not public.entity_is_owned(row.user_id, row.entity_type, row.entity_id)
  ) then
    raise exception 'Existing entry_entities contain an ownership violation';
  end if;
  if exists (
    select 1 from public.entity_attachments row
    where not public.entity_is_owned(row.user_id, row.entity_type, row.entity_id)
  ) then
    raise exception 'Existing entity_attachments contain an ownership violation';
  end if;
  if exists (
    select 1 from public.entity_tags row
    where not public.entity_is_owned(row.user_id, row.entity_type, row.entity_id)
  ) then
    raise exception 'Existing entity_tags contain an ownership violation';
  end if;
end;
$$;

create trigger entry_entities_validate_owner
before insert or update of user_id, entity_type, entity_id on public.entry_entities
for each row execute function public.validate_polymorphic_entity_owner();
create trigger entity_attachments_validate_owner
before insert or update of user_id, entity_type, entity_id on public.entity_attachments
for each row execute function public.validate_polymorphic_entity_owner();
create trigger entity_tags_validate_owner
before insert or update of user_id, entity_type, entity_id on public.entity_tags
for each row execute function public.validate_polymorphic_entity_owner();

-- Keep direct user access only where the current application has a legitimate
-- command. Service-role workers and validated definer RPCs retain their work.
drop policy if exists audit_logs_update_own on public.audit_logs;
drop policy if exists audit_logs_delete_own on public.audit_logs;
revoke update, delete on public.audit_logs from authenticated;

drop policy if exists undo_operations_insert_own on public.undo_operations;
drop policy if exists undo_operations_update_own on public.undo_operations;
drop policy if exists undo_operations_delete_own on public.undo_operations;
revoke insert, update, delete on public.undo_operations from authenticated;

drop policy if exists entry_interpretations_insert_own on public.entry_interpretations;
drop policy if exists entry_interpretations_update_own on public.entry_interpretations;
drop policy if exists entry_interpretations_delete_own on public.entry_interpretations;
revoke insert, update, delete on public.entry_interpretations from authenticated;

drop policy if exists entry_entities_insert_own on public.entry_entities;
drop policy if exists entry_entities_update_own on public.entry_entities;
drop policy if exists entry_entities_delete_own on public.entry_entities;
revoke insert, update, delete on public.entry_entities from authenticated;

drop policy if exists entry_embeddings_delete_own on public.entry_embeddings;
revoke delete on public.entry_embeddings from authenticated;

drop policy if exists conversation_messages_update_own on public.conversation_messages;
drop policy if exists conversation_messages_delete_own on public.conversation_messages;
revoke update, delete on public.conversation_messages from authenticated;

drop policy if exists summaries_delete_own on public.summaries;
revoke delete on public.summaries from authenticated;

drop policy if exists heartbeat_runs_insert_own on public.heartbeat_runs;
drop policy if exists heartbeat_runs_update_own on public.heartbeat_runs;
drop policy if exists heartbeat_runs_delete_own on public.heartbeat_runs;
revoke insert, update, delete on public.heartbeat_runs from authenticated;

drop policy if exists jobs_update_own on public.jobs;
drop policy if exists jobs_delete_own on public.jobs;
revoke update, delete on public.jobs from authenticated;

drop policy if exists attachments_update_own on public.attachments;
drop policy if exists attachments_delete_own on public.attachments;
revoke update, delete on public.attachments from authenticated;

drop policy if exists entity_attachments_insert_own on public.entity_attachments;
drop policy if exists entity_attachments_update_own on public.entity_attachments;
drop policy if exists entity_attachments_delete_own on public.entity_attachments;
revoke insert, update, delete on public.entity_attachments from authenticated;

drop policy if exists attachment_interpretations_insert_own on public.attachment_interpretations;
drop policy if exists attachment_interpretations_update_own on public.attachment_interpretations;
drop policy if exists attachment_interpretations_delete_own on public.attachment_interpretations;
revoke insert, update, delete on public.attachment_interpretations from authenticated;

drop policy if exists notifications_insert_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;
revoke insert, delete on public.notifications from authenticated;

drop policy if exists pending_questions_insert_own on public.pending_questions;
drop policy if exists pending_questions_delete_own on public.pending_questions;
revoke insert, delete on public.pending_questions from authenticated;

create or replace function public.save_profile_settings(
  p_profile jsonb,
  p_preferences jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.profiles (user_id, display_name, locale, timezone)
  values (
    current_user_id,
    p_profile ->> 'displayName',
    p_profile ->> 'locale',
    p_profile ->> 'timezone'
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    locale = excluded.locale,
    timezone = excluded.timezone;

  insert into public.agent_preferences (
    user_id,
    agent_name,
    follow_up_intensity,
    daily_review_time,
    personality,
    tone,
    autonomy_level,
    weekly_review_day,
    weekly_review_time,
    planning_day,
    planning_time,
    quiet_start,
    quiet_end,
    important_reminder_override,
    max_followups_per_day,
    response_detail,
    ai_provider,
    ai_model,
    ai_profile,
    chat_model,
    extraction_model,
    reasoning_model,
    review_model,
    file_model,
    background_model,
    embedding_model,
    privacy_default
  )
  values (
    current_user_id,
    p_preferences ->> 'agentName',
    p_preferences ->> 'followUpIntensity',
    (p_preferences ->> 'dailyReviewTime')::time,
    p_preferences ->> 'personality',
    p_preferences ->> 'tone',
    p_preferences ->> 'autonomyLevel',
    (p_preferences ->> 'weeklyReviewDay')::smallint,
    (p_preferences ->> 'weeklyReviewTime')::time,
    (p_preferences ->> 'planningDay')::smallint,
    (p_preferences ->> 'planningTime')::time,
    (p_preferences ->> 'quietStart')::time,
    (p_preferences ->> 'quietEnd')::time,
    (p_preferences ->> 'importantReminderOverride')::boolean,
    (p_preferences ->> 'maxFollowupsPerDay')::integer,
    p_preferences ->> 'responseDetail',
    p_preferences ->> 'aiProvider',
    p_preferences ->> 'extractionModel',
    p_preferences ->> 'aiProfile',
    p_preferences ->> 'chatModel',
    p_preferences ->> 'extractionModel',
    p_preferences ->> 'reasoningModel',
    p_preferences ->> 'reviewModel',
    p_preferences ->> 'fileModel',
    p_preferences ->> 'backgroundModel',
    p_preferences ->> 'embeddingModel',
    p_preferences ->> 'privacyDefault'
  )
  on conflict (user_id) do update set
    agent_name = excluded.agent_name,
    follow_up_intensity = excluded.follow_up_intensity,
    daily_review_time = excluded.daily_review_time,
    personality = excluded.personality,
    tone = excluded.tone,
    autonomy_level = excluded.autonomy_level,
    weekly_review_day = excluded.weekly_review_day,
    weekly_review_time = excluded.weekly_review_time,
    planning_day = excluded.planning_day,
    planning_time = excluded.planning_time,
    quiet_start = excluded.quiet_start,
    quiet_end = excluded.quiet_end,
    important_reminder_override = excluded.important_reminder_override,
    max_followups_per_day = excluded.max_followups_per_day,
    response_detail = excluded.response_detail,
    ai_provider = excluded.ai_provider,
    ai_model = excluded.ai_model,
    ai_profile = excluded.ai_profile,
    chat_model = excluded.chat_model,
    extraction_model = excluded.extraction_model,
    reasoning_model = excluded.reasoning_model,
    review_model = excluded.review_model,
    file_model = excluded.file_model,
    background_model = excluded.background_model,
    embedding_model = excluded.embedding_model,
    privacy_default = excluded.privacy_default;
end;
$$;
revoke all on function public.save_profile_settings(jsonb, jsonb) from public, anon;
grant execute on function public.save_profile_settings(jsonb, jsonb) to authenticated;

create or replace function public.run_user_heartbeat(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
  created_count integer := 0;
  analyzed_count integer := 0;
  delivered_today integer := 0;
  available_slots integer := 0;
  user_timezone text := 'America/Sao_Paulo';
  user_locale text := 'pt-BR';
  quiet_start_time time := '22:30';
  quiet_end_time time := '07:00';
  daily_cap integer := 3;
  allow_important boolean := true;
  local_now timestamp;
  local_date date;
  local_day_start timestamptz;
  local_day_end timestamptz;
  in_quiet_hours boolean;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('my-brain-heartbeat:' || p_user_id::text, 0)) then
    return jsonb_build_object('skipped', true, 'reason', 'already-running');
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  select
    coalesce(profile.timezone, 'America/Sao_Paulo'),
    coalesce(profile.locale, 'pt-BR'),
    coalesce(preferences.quiet_start, '22:30'),
    coalesce(preferences.quiet_end, '07:00'),
    coalesce(preferences.max_followups_per_day, 3),
    coalesce(preferences.important_reminder_override, true)
  into
    user_timezone,
    user_locale,
    quiet_start_time,
    quiet_end_time,
    daily_cap,
    allow_important
  from auth.users heartbeat_user
  left join public.profiles profile on profile.user_id = heartbeat_user.id
  left join public.agent_preferences preferences on preferences.user_id = heartbeat_user.id
  where heartbeat_user.id = p_user_id;

  local_now := now() at time zone user_timezone;
  local_date := local_now::date;
  local_day_start := local_date::timestamp at time zone user_timezone;
  local_day_end := (local_date + 1)::timestamp at time zone user_timezone;
  in_quiet_hours := case
    when quiet_start_time < quiet_end_time
      then local_now::time >= quiet_start_time and local_now::time < quiet_end_time
    else local_now::time >= quiet_start_time or local_now::time < quiet_end_time
  end;

  insert into public.heartbeat_runs (user_id, metadata)
  values (
    p_user_id,
    jsonb_build_object(
      'quiet_hours', in_quiet_hours,
      'timezone', user_timezone,
      'locale', user_locale,
      'local_date', local_date
    )
  )
  returning id into run_id;

  select count(*) into analyzed_count
  from public.tasks
  where user_id = p_user_id and status not in ('completed', 'cancelled');

  select count(*) into delivered_today
  from public.notifications
  where user_id = p_user_id
    and created_at >= local_day_start
    and created_at < local_day_end;
  available_slots := greatest(daily_cap - delivered_today, 0);

  with candidates as (
    select
      'task_overdue'::text as type,
      case when user_locale = 'en' then 'Overdue task' else 'Tarefa atrasada' end as title,
      task.title as body,
      case when user_locale = 'en' then '/en/app/tasks' else '/pt-BR/app/tasks' end as action_url,
      case when task.manual_priority in ('urgent', 'high') then 'high' else 'normal' end as priority,
      'overdue:' || task.id::text || ':' || local_date::text as dedupe_key,
      task.due_at as event_time,
      case when task.manual_priority = 'urgent' then 4 when task.manual_priority = 'high' then 3 else 2 end as rank
    from public.tasks task
    where not in_quiet_hours
      and task.user_id = p_user_id
      and task.status not in ('completed', 'cancelled', 'deferred')
      and task.due_at < now()

    union all

    select
      'task_stale',
      case when user_locale = 'en' then 'Task without movement' else 'Tarefa sem movimento' end,
      task.title,
      case when user_locale = 'en' then '/en/app/tasks' else '/pt-BR/app/tasks' end,
      'normal',
      'stale:' || task.id::text || ':' || local_date::text,
      task.updated_at,
      1
    from public.tasks task
    where not in_quiet_hours
      and task.user_id = p_user_id
      and task.status not in ('completed', 'cancelled', 'deferred', 'waiting')
      and task.due_at is null
      and task.updated_at < now() - make_interval(
        days => case task.manual_priority when 'urgent' then 0 when 'high' then 2 when 'low' then 15 else 7 end
      )

    union all

    select
      'reminder',
      case
        when user_locale = 'en' and reminder.important then 'Important reminder'
        when user_locale = 'en' then 'Reminder'
        when reminder.important then 'Lembrete importante'
        else 'Lembrete'
      end,
      reminder.title,
      case when user_locale = 'en' then '/en/app/reminders' else '/pt-BR/app/reminders' end,
      case when reminder.important then 'high' else 'normal' end,
      'reminder:' || reminder.id::text,
      reminder.remind_at,
      case when reminder.important then 3 else 2 end
    from public.reminders reminder
    where reminder.user_id = p_user_id
      and reminder.status = 'scheduled'
      and reminder.remind_at <= now()
      and (not in_quiet_hours or (allow_important and reminder.important))
  ), pending as (
    select candidate.*
    from candidates candidate
    where not exists (
      select 1 from public.notifications notification
      where notification.user_id = p_user_id
        and notification.dedupe_key = candidate.dedupe_key
    )
    and not exists (
      select 1 from public.notifications notification
      where candidate.type in ('task_overdue', 'task_stale')
        and notification.user_id = p_user_id
        and notification.created_at > now() - interval '24 hours'
        and notification.dedupe_key like
          split_part(candidate.dedupe_key, ':', 1) || ':' ||
          split_part(candidate.dedupe_key, ':', 2) || ':%'
    )
  ), limited as (
    select pending.*
    from pending
    order by rank desc, event_time asc, dedupe_key
    limit available_slots
  ), inserted as (
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      action_url,
      priority,
      dedupe_key
    )
    select p_user_id, type, title, body, action_url, priority, dedupe_key
    from limited
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    returning dedupe_key
  )
  select count(*) into created_count from inserted;

  update public.reminders reminder
  set status = 'sent', sent_at = now()
  where reminder.user_id = p_user_id
    and reminder.status = 'scheduled'
    and exists (
      select 1 from public.notifications notification
      where notification.user_id = p_user_id
        and notification.dedupe_key = 'reminder:' || reminder.id::text
    );

  update public.heartbeat_runs
  set
    status = 'completed',
    analyzed_items = analyzed_count,
    notifications_created = created_count,
    silent = created_count = 0,
    completed_at = now()
  where id = run_id;

  return jsonb_build_object(
    'run_id', run_id,
    'silent', created_count = 0,
    'notifications_created', created_count,
    'remaining_slots', greatest(available_slots - created_count, 0),
    'local_date', local_date
  );
exception when others then
  insert into public.heartbeat_runs (
    user_id,
    status,
    error,
    completed_at,
    metadata
  ) values (
    p_user_id,
    'failed',
    'heartbeat execution failed (' || sqlstate || ')',
    now(),
    jsonb_build_object('failure_code', sqlstate)
  );
  return jsonb_build_object(
    'failed', true,
    'failure_code', sqlstate
  );
end;
$$;
revoke all on function public.run_user_heartbeat(uuid) from public, anon, authenticated;
grant execute on function public.run_user_heartbeat(uuid) to service_role;

create or replace function public.run_all_heartbeats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_record record;
  heartbeat_result jsonb;
  processed integer := 0;
begin
  for user_record in select id from auth.users
  loop
    begin
      heartbeat_result := public.run_user_heartbeat(user_record.id);
      if coalesce((heartbeat_result ->> 'failed')::boolean, false) then
        raise warning 'Heartbeat failed for user % with code %', user_record.id, heartbeat_result ->> 'failure_code';
      else
        processed := processed + 1;
      end if;
    exception when others then
      raise warning 'Heartbeat failed for user %: %', user_record.id, sqlerrm;
    end;
  end loop;
  return processed;
end;
$$;
revoke all on function public.run_all_heartbeats() from public, anon, authenticated;
grant execute on function public.run_all_heartbeats() to service_role;

drop function if exists public.run_user_heartbeat_unbounded(uuid);
