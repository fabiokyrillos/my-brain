create extension if not exists pg_cron with schema extensions;

create or replace function public.run_all_heartbeats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare user_record record; processed integer := 0;
begin
  for user_record in select id from auth.users
  loop
    perform public.run_user_heartbeat(user_record.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;
revoke all on function public.run_all_heartbeats() from public, anon, authenticated;
grant execute on function public.run_all_heartbeats() to service_role;

create or replace function public.request_heartbeat()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return public.run_user_heartbeat(current_user_id);
end;
$$;
grant execute on function public.request_heartbeat() to authenticated;
revoke all on function public.request_heartbeat() from anon;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'my-brain-hourly-heartbeat';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('my-brain-hourly-heartbeat', '0 * * * *', 'select public.run_all_heartbeats()');
end;
$$;

create or replace function public.mark_historical_summaries_outdated()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'interpreted' and new.is_retroactive and (old.status is distinct from new.status or old.occurred_at is distinct from new.occurred_at) then
    update public.summaries set status = 'outdated'
    where user_id = new.user_id and new.occurred_at::date between period_start and period_end and status <> 'outdated';
  end if;
  return new;
end;
$$;
create trigger entries_mark_summaries_outdated after update on public.entries
for each row execute function public.mark_historical_summaries_outdated();
