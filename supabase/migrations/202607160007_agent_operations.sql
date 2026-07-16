alter table public.agent_preferences
  add column quiet_start time not null default '22:30',
  add column quiet_end time not null default '07:00',
  add column important_reminder_override boolean not null default true,
  add column max_followups_per_day smallint not null default 3 check (max_followups_per_day between 0 and 20),
  add column ai_provider text not null default 'openai',
  add column ai_model text not null default 'gpt-5.6-luna',
  add column privacy_default text not null default 'normal' check (privacy_default in ('normal','private','highly_sensitive'));

alter table public.agent_preferences drop constraint if exists agent_preferences_response_detail_check;
alter table public.agent_preferences add constraint agent_preferences_response_detail_check check (response_detail in ('short','balanced','detailed'));

create table public.pending_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  interpretation_id uuid not null references public.entry_interpretations(id) on delete cascade,
  candidate_index integer not null,
  question text not null check (char_length(question) between 1 and 1000),
  reason text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  status text not null default 'open' check (status in ('open','answered','dismissed','snoozed')),
  answer text,
  snoozed_until timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (interpretation_id, candidate_index)
);
create index pending_questions_user_status_idx on public.pending_questions (user_id, status, created_at desc);
create trigger pending_questions_updated_at before update on public.pending_questions for each row execute function public.set_updated_at();

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  entry_id uuid references public.entries(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  remind_at timestamptz not null,
  important boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled','sent','snoozed','cancelled')),
  snoozed_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_user_due_idx on public.reminders (user_id, status, remind_at);
create trigger reminders_updated_at before update on public.reminders for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  action_url text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'unread' check (status in ('unread','read','dismissed')),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_user_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_status_idx on public.notifications (user_id, status, created_at desc);

create table public.heartbeat_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running','completed','failed')),
  analyzed_items integer not null default 0,
  notifications_created integer not null default 0,
  silent boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index heartbeat_runs_user_started_idx on public.heartbeat_runs (user_id, started_at desc);

create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('daily','weekly_review','weekly_plan','monthly')),
  period_start date not null,
  period_end date not null,
  title text not null,
  content text not null,
  original_content text not null,
  status text not null default 'generated' check (status in ('generated','edited','outdated')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_type, period_start, period_end)
);
create index summaries_user_period_idx on public.summaries (user_id, period_type, period_end desc);
create trigger summaries_updated_at before update on public.summaries for each row execute function public.set_updated_at();

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','failed')),
  description text,
  extracted_text text,
  processing_error text,
  sensitivity text not null default 'normal' check (sensitivity in ('normal','private','highly_sensitive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attachments_user_created_idx on public.attachments (user_id, created_at desc);
create trigger attachments_updated_at before update on public.attachments for each row execute function public.set_updated_at();

create table public.entity_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  entity_type text not null check (entity_type in ('entry','task','project','person','conversation','reminder','decision','activity')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (attachment_id, entity_type, entity_id)
);
create index entity_attachments_user_entity_idx on public.entity_attachments (user_id, entity_type, entity_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  priority smallint not null default 5 check (priority between 0 and 10),
  idempotency_key text not null,
  error text,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index jobs_pending_idx on public.jobs (status, next_attempt_at, priority desc) where status in ('pending','failed');
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();

do $$
declare table_name text;
begin
  foreach table_name in array array['pending_questions','reminders','notifications','heartbeat_runs','summaries','attachments','entity_attachments','jobs'] loop
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

create or replace function public.normalize_pending_questions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare item jsonb; item_index integer := 0;
begin
  for item in select value from jsonb_array_elements(new.pending_questions)
  loop
    insert into public.pending_questions (user_id, entry_id, interpretation_id, candidate_index, question, reason, confidence)
    values (new.user_id, new.entry_id, new.id, item_index, item ->> 'question', item ->> 'reason', (item ->> 'confidence')::numeric)
    on conflict (interpretation_id, candidate_index) do nothing;
    item_index := item_index + 1;
  end loop;
  return new;
end;
$$;
create trigger interpretations_normalize_questions after insert on public.entry_interpretations for each row execute function public.normalize_pending_questions();

insert into public.pending_questions (user_id, entry_id, interpretation_id, candidate_index, question, reason, confidence)
select interpretation.user_id, interpretation.entry_id, interpretation.id, question.ordinality - 1,
  question.value ->> 'question', question.value ->> 'reason', (question.value ->> 'confidence')::numeric
from public.entry_interpretations interpretation
cross join lateral jsonb_array_elements(interpretation.pending_questions) with ordinality question(value, ordinality)
on conflict (interpretation_id, candidate_index) do nothing;

create or replace function public.create_due_task_reminder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.due_at is not null and new.status not in ('completed','cancelled') then
    insert into public.reminders (user_id, task_id, title, remind_at)
    values (new.user_id, new.id, new.title, greatest(now(), new.due_at - interval '1 hour'));
  end if;
  return new;
end;
$$;
create trigger tasks_create_due_reminder after insert on public.tasks for each row execute function public.create_due_task_reminder();

create or replace function public.run_user_heartbeat(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
  created_count integer := 0;
  affected integer := 0;
  analyzed_count integer := 0;
  local_time time;
  quiet_start_time time;
  quiet_end_time time;
  user_timezone text;
  in_quiet_hours boolean;
begin
  select profile.timezone, preferences.quiet_start, preferences.quiet_end
  into user_timezone, quiet_start_time, quiet_end_time
  from public.profiles profile
  join public.agent_preferences preferences on preferences.user_id = profile.user_id
  where profile.user_id = p_user_id;

  user_timezone := coalesce(user_timezone, 'America/Sao_Paulo');
  quiet_start_time := coalesce(quiet_start_time, '22:30');
  quiet_end_time := coalesce(quiet_end_time, '07:00');
  local_time := (now() at time zone user_timezone)::time;
  in_quiet_hours := case when quiet_start_time < quiet_end_time
    then local_time >= quiet_start_time and local_time < quiet_end_time
    else local_time >= quiet_start_time or local_time < quiet_end_time end;

  insert into public.heartbeat_runs (user_id) values (p_user_id) returning id into run_id;
  select count(*) into analyzed_count from public.tasks
  where user_id = p_user_id and status not in ('completed','cancelled');

  if in_quiet_hours then
    update public.heartbeat_runs set status = 'completed', analyzed_items = analyzed_count, silent = true,
      metadata = jsonb_build_object('quiet_hours', true), completed_at = now() where id = run_id;
    return jsonb_build_object('run_id', run_id, 'silent', true, 'notifications_created', 0);
  end if;

  insert into public.notifications (user_id, type, title, body, action_url, priority, dedupe_key)
  select p_user_id, 'task_overdue', 'Tarefa atrasada', task.title, '/pt-BR/app/tasks',
    case when task.manual_priority in ('urgent','high') then 'high' else 'normal' end,
    'overdue:' || task.id::text || ':' || current_date::text
  from public.tasks task
  where task.user_id = p_user_id and task.status not in ('completed','cancelled','deferred') and task.due_at < now()
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics affected = row_count; created_count := created_count + affected;

  insert into public.notifications (user_id, type, title, body, action_url, priority, dedupe_key)
  select p_user_id, 'task_stale', 'Tarefa sem movimento', task.title, '/pt-BR/app/tasks', 'normal',
    'stale:' || task.id::text || ':' || current_date::text
  from public.tasks task
  where task.user_id = p_user_id and task.status not in ('completed','cancelled','deferred','waiting') and task.due_at is null
    and task.updated_at < now() - make_interval(days => case task.manual_priority when 'urgent' then 0 when 'high' then 2 when 'low' then 15 else 7 end)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics affected = row_count; created_count := created_count + affected;

  insert into public.notifications (user_id, type, title, body, action_url, priority, dedupe_key)
  select p_user_id, 'reminder', 'Lembrete', reminder.title, '/pt-BR/app/reminders',
    case when reminder.important then 'high' else 'normal' end, 'reminder:' || reminder.id::text
  from public.reminders reminder
  where reminder.user_id = p_user_id and reminder.status = 'scheduled' and reminder.remind_at <= now()
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics affected = row_count; created_count := created_count + affected;

  update public.reminders set status = 'sent', sent_at = now()
  where user_id = p_user_id and status = 'scheduled' and remind_at <= now();

  update public.heartbeat_runs set status = 'completed', analyzed_items = analyzed_count,
    notifications_created = created_count, silent = created_count = 0,
    metadata = jsonb_build_object('quiet_hours', false), completed_at = now() where id = run_id;
  return jsonb_build_object('run_id', run_id, 'silent', created_count = 0, 'notifications_created', created_count);
exception when others then
  if run_id is not null then update public.heartbeat_runs set status = 'failed', error = sqlerrm, completed_at = now() where id = run_id; end if;
  raise;
end;
$$;
revoke all on function public.run_user_heartbeat(uuid) from public, anon, authenticated;
grant execute on function public.run_user_heartbeat(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-files', 'user-files', false, 26214400, array['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy user_files_select_own on storage.objects for select to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy user_files_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy user_files_update_own on storage.objects for update to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy user_files_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
