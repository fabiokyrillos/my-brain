create table public.attachment_interpretations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  version integer not null default 1,
  description text not null,
  extracted_text text,
  task_candidates jsonb not null default '[]'::jsonb,
  extracted_people jsonb not null default '[]'::jsonb,
  extracted_projects jsonb not null default '[]'::jsonb,
  extracted_dates jsonb not null default '[]'::jsonb,
  model text not null,
  raw_output jsonb not null,
  created_at timestamptz not null default now(),
  unique (attachment_id, version)
);
create index attachment_interpretations_user_attachment_idx on public.attachment_interpretations (user_id, attachment_id, version desc);
alter table public.attachment_interpretations enable row level security;
alter table public.attachment_interpretations force row level security;
create policy attachment_interpretations_select_own on public.attachment_interpretations for select to authenticated using ((select auth.uid()) = user_id);
create policy attachment_interpretations_insert_own on public.attachment_interpretations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy attachment_interpretations_update_own on public.attachment_interpretations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy attachment_interpretations_delete_own on public.attachment_interpretations for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.attachment_interpretations to authenticated;
revoke all on public.attachment_interpretations from anon;

create or replace function public.claim_attachment_job(p_job_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare claimed public.jobs%rowtype;
begin
  select * into claimed from public.jobs
  where id = p_job_id and user_id = p_user_id and type = 'process_attachment'
    and status in ('pending','failed') and attempts < max_attempts and next_attempt_at <= now()
  for update skip locked;
  if claimed.id is null then return null; end if;
  update public.jobs set status = 'running', attempts = attempts + 1, started_at = now(), error = null
  where id = claimed.id returning * into claimed;
  return to_jsonb(claimed);
end;
$$;
revoke all on function public.claim_attachment_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_attachment_job(uuid, uuid) to service_role;
