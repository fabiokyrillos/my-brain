create table public.contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  kind text not null default 'custom' check (kind in ('work', 'personal', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contexts_user_name_idx on public.contexts (user_id, lower(name));

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organizations_user_name_idx on public.organizations (user_id, lower(name));

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index projects_user_name_idx on public.projects (user_id, lower(name));
create index projects_user_status_idx on public.projects (user_id, status);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index people_user_name_idx on public.people (user_id, lower(name));

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_content text not null check (char_length(original_content) between 1 and 12000),
  source text not null default 'web' check (source in ('web', 'chat', 'whatsapp', 'gmail', 'calendar', 'import', 'api')),
  status text not null default 'processing' check (status in ('processing', 'interpreted', 'failed')),
  locale text not null default 'pt-BR' check (locale in ('pt-BR', 'en')),
  sensitivity text not null default 'normal' check (sensitivity in ('normal', 'private', 'highly_sensitive')),
  occurred_at timestamptz not null default now(),
  is_retroactive boolean not null default false,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index entries_user_occurred_idx on public.entries (user_id, occurred_at desc);
create index entries_user_status_idx on public.entries (user_id, status, created_at desc);

create table public.entry_interpretations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  summary text not null,
  concepts text[] not null default '{}',
  extracted_contexts jsonb not null default '[]'::jsonb,
  extracted_organizations jsonb not null default '[]'::jsonb,
  extracted_projects jsonb not null default '[]'::jsonb,
  extracted_people jsonb not null default '[]'::jsonb,
  task_candidates jsonb not null default '[]'::jsonb,
  pending_questions jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  model text not null,
  strategy_version text not null,
  prompt_version text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  raw_output jsonb not null,
  created_at timestamptz not null default now(),
  unique (entry_id, version)
);
create index entry_interpretations_user_entry_idx on public.entry_interpretations (user_id, entry_id, version desc);

create table public.entry_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  interpretation_id uuid not null references public.entry_interpretations(id) on delete cascade,
  entity_type text not null check (entity_type in ('context', 'organization', 'project', 'person')),
  entity_id uuid not null,
  mention text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (interpretation_id, entity_type, entity_id)
);
create index entry_entities_user_entry_idx on public.entry_entities (user_id, entry_id);
create index entry_entities_user_entity_idx on public.entry_entities (user_id, entity_type, entity_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_entry_id uuid references public.entries(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  candidate_index integer,
  title text not null check (char_length(title) between 1 and 240),
  description text,
  status text not null default 'inbox' check (status in ('inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled')),
  manual_priority text check (manual_priority in ('low', 'medium', 'high', 'urgent')),
  dynamic_priority numeric(7,3) not null default 0,
  due_at timestamptz,
  planned_at timestamptz,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  created_by text not null default 'user' check (created_by in ('user', 'agent')),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_entry_id, candidate_index)
);
create index tasks_user_status_due_idx on public.tasks (user_id, status, due_at);
create index tasks_user_updated_idx on public.tasks (user_id, updated_at desc);
create index tasks_user_source_idx on public.tasks (user_id, source_entry_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  actor text not null check (actor in ('user', 'agent', 'system')),
  before_state jsonb,
  after_state jsonb,
  reason text not null,
  source_entry_id uuid references public.entries(id) on delete set null,
  created_at timestamptz not null default now()
);
create index audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_user_entity_idx on public.audit_logs (user_id, entity_type, entity_id);

create table public.undo_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  entity_type text not null,
  entity_ids uuid[] not null default '{}',
  before_state jsonb,
  after_state jsonb not null,
  status text not null default 'available' check (status in ('available', 'undone', 'expired')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index undo_operations_user_status_idx on public.undo_operations (user_id, status, expires_at desc);

create or replace function public.protect_entry_original()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.original_content is distinct from new.original_content then
    raise exception 'Original entry content is immutable' using errcode = '22000';
  end if;
  return new;
end;
$$;
create trigger entries_protect_original before update on public.entries
for each row execute function public.protect_entry_original();

create trigger contexts_updated_at before update on public.contexts for each row execute function public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger people_updated_at before update on public.people for each row execute function public.set_updated_at();
create trigger entries_updated_at before update on public.entries for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'contexts','organizations','projects','people','entries','entry_interpretations',
    'entry_entities','tasks','audit_logs','undo_operations'
  ] loop
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
  candidate_index integer;
  created_task_id uuid;
  created_task_ids uuid[] := '{}';
  result_task_ids uuid[] := '{}';
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

  foreach candidate_index in array (select array_agg(distinct value order by value) from unnest(p_candidate_indexes) value)
  loop
    if candidate_index < 0 or candidate_index >= jsonb_array_length(interpretation.task_candidates) then
      raise exception 'Invalid task candidate index';
    end if;
    candidate := interpretation.task_candidates -> candidate_index;

    insert into public.tasks (
      user_id, source_entry_id, candidate_index, title, description, status,
      due_at, confidence, created_by
    ) values (
      current_user_id,
      p_entry_id,
      candidate_index,
      candidate ->> 'title',
      nullif(candidate ->> 'description', ''),
      case when candidate ->> 'waitingOn' is not null then 'waiting' else 'inbox' end,
      nullif(candidate ->> 'dueAt', '')::timestamptz,
      coalesce((candidate ->> 'confidence')::numeric, interpretation.confidence),
      'user'
    )
    on conflict (source_entry_id, candidate_index) do nothing
    returning id into created_task_id;

    if created_task_id is not null then created_task_ids := array_append(created_task_ids, created_task_id); end if;
    created_task_id := null;
  end loop;

  select coalesce(array_agg(id order by candidate_index), '{}') into result_task_ids
  from public.tasks
  where user_id = current_user_id
    and source_entry_id = p_entry_id
    and candidate_index = any(p_candidate_indexes);

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

create or replace function public.undo_operation(p_undo_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  operation public.undo_operations%rowtype;
  affected integer;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into operation from public.undo_operations
  where id = p_undo_id and user_id = current_user_id
  for update;

  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;
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
  else
    raise exception 'Unsupported undo operation';
  end if;

  update public.undo_operations set status = 'undone', undone_at = now() where id = operation.id;
  insert into public.audit_logs (user_id, action_type, entity_type, actor, before_state, after_state, reason)
  values (
    current_user_id, 'operation_undone', operation.entity_type, 'user', operation.after_state,
    jsonb_build_object('cancelled_entity_ids', to_jsonb(operation.entity_ids)),
    'User executed the stored compensating operation'
  );

  return jsonb_build_object('undone', true, 'affected', affected);
end;
$$;

grant execute on function public.confirm_entry_tasks(uuid, integer[]) to authenticated;
grant execute on function public.undo_operation(uuid) to authenticated;
revoke all on function public.confirm_entry_tasks(uuid, integer[]) from anon;
revoke all on function public.undo_operation(uuid) from anon;
