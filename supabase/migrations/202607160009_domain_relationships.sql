alter table public.tasks
  add column waiting_on_person_id uuid references public.people(id) on delete set null,
  add column no_due_reason text,
  add column intentional_no_due boolean not null default false;

create table public.person_relationships (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade, related_person_id uuid references public.people(id) on delete cascade,
  relationship_type text not null, description text, valid_from timestamptz not null default now(), valid_until timestamptz,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1), created_at timestamptz not null default now()
);
create index person_relationships_user_person_idx on public.person_relationships (user_id, person_id, valid_until);

create table public.person_contexts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade, context_id uuid not null references public.contexts(id) on delete cascade,
  valid_from timestamptz not null default now(), valid_until timestamptz, confidence numeric(4,3) not null default 1,
  created_at timestamptz not null default now(), unique (person_id, context_id, valid_from)
);
create table public.person_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  role text, valid_from timestamptz not null default now(), valid_until timestamptz, confidence numeric(4,3) not null default 1,
  created_at timestamptz not null default now(), unique (person_id, project_id, valid_from)
);
create index person_projects_user_person_idx on public.person_projects (user_id, person_id, valid_until);

create table public.task_people (
  task_id uuid not null references public.tasks(id) on delete cascade, person_id uuid not null references public.people(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role text not null default 'involved' check (role in ('requester','involved','assignee','waiting_on')),
  created_at timestamptz not null default now(), primary key (task_id, person_id, role)
);
create table public.task_projects (
  task_id uuid not null references public.tasks(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), primary key (task_id, project_id)
);
create table public.task_contexts (
  task_id uuid not null references public.tasks(id) on delete cascade, context_id uuid not null references public.contexts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), primary key (task_id, context_id)
);
create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade, depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  dependency_type text not null default 'blocks' check (dependency_type in ('blocks','requires','related')),
  created_at timestamptz not null default now(), unique (task_id, depends_on_task_id), check (task_id <> depends_on_task_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80), color text, created_at timestamptz not null default now()
);
create unique index tags_user_name_idx on public.tags (user_id, lower(name));
create table public.entity_tags (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade, entity_type text not null,
  entity_id uuid not null, created_at timestamptz not null default now(), unique (tag_id, entity_type, entity_id)
);
create index entity_tags_user_entity_idx on public.entity_tags (user_id, entity_type, entity_id);

do $$
declare table_name text;
begin
  foreach table_name in array array['person_relationships','person_contexts','person_projects','task_people','task_projects','task_contexts','task_dependencies','tags','entity_tags'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name || '_delete_own', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('revoke all on public.%I from anon', table_name);
  end loop;
end;
$$;

create or replace function public.confirm_entry_tasks(p_entry_id uuid, p_candidate_indexes integer[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid(); interpretation public.entry_interpretations%rowtype;
  candidate jsonb; selected_index integer; created_task_id uuid; child_task_id uuid; parent_task_id uuid;
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
    select id into child_task_id from public.tasks where user_id = current_user_id and source_entry_id = p_entry_id and candidate_index = selected_index;
    if candidate ->> 'parentIndex' is not null then
      select id into parent_task_id from public.tasks where user_id = current_user_id and source_entry_id = p_entry_id and candidate_index = (candidate ->> 'parentIndex')::integer;
      if parent_task_id is not null then update public.tasks set parent_task_id = parent_task_id where id = child_task_id; end if;
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
    parent_task_id := null;
  end loop;

  select coalesce(array_agg(public.tasks.id order by public.tasks.candidate_index), array[]::uuid[]) into result_task_ids
  from public.tasks where user_id = current_user_id and source_entry_id = p_entry_id and candidate_index = any(p_candidate_indexes);
  if coalesce(array_length(created_task_ids,1),0)>0 then
    insert into public.undo_operations(user_id,action_type,entity_type,entity_ids,after_state) values(current_user_id,'confirm_entry_tasks','task',created_task_ids,jsonb_build_object('entry_id',p_entry_id,'task_ids',to_jsonb(created_task_ids))) returning id into undo_id;
    insert into public.audit_logs(user_id,action_type,entity_type,actor,after_state,reason,source_entry_id) values(current_user_id,'tasks_confirmed','task','user',jsonb_build_object('task_ids',to_jsonb(created_task_ids),'candidate_indexes',to_jsonb(p_candidate_indexes)),'User confirmed task candidates with normalized relationships',p_entry_id);
  end if;
  return jsonb_build_object('task_ids',to_jsonb(result_task_ids),'undo_id',undo_id);
end;
$$;
