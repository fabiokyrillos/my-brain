alter function public.run_user_heartbeat(uuid) rename to run_user_heartbeat_unbounded;

create or replace function public.run_user_heartbeat(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  run_id uuid;
  daily_cap integer;
  allow_important boolean;
  quiet_hours boolean;
  kept_count integer;
begin
  result := public.run_user_heartbeat_unbounded(p_user_id);
  run_id := (result ->> 'run_id')::uuid;
  select preferences.max_followups_per_day, preferences.important_reminder_override
  into daily_cap, allow_important
  from public.agent_preferences preferences where preferences.user_id = p_user_id;
  daily_cap := coalesce(daily_cap, 3);
  allow_important := coalesce(allow_important, true);
  select coalesce((metadata ->> 'quiet_hours')::boolean, false) into quiet_hours
  from public.heartbeat_runs where id = run_id;

  if quiet_hours and allow_important then
    insert into public.notifications (user_id, type, title, body, action_url, priority, dedupe_key)
    select p_user_id, 'reminder', 'Lembrete importante', reminder.title, '/pt-BR/app/reminders', 'high', 'reminder:' || reminder.id::text
    from public.reminders reminder
    where reminder.user_id = p_user_id and reminder.status = 'scheduled' and reminder.important and reminder.remind_at <= now()
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    update public.reminders set status = 'sent', sent_at = now()
    where user_id = p_user_id and status = 'scheduled' and important and remind_at <= now();
  end if;

  with ranked as (
    select notification.id, row_number() over (order by
      case notification.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,
      notification.created_at asc) as position
    from public.notifications notification
    where notification.user_id = p_user_id and notification.status = 'unread' and notification.created_at >= date_trunc('day', now())
  )
  update public.notifications notification set status = 'dismissed'
  from ranked where notification.id = ranked.id and ranked.position > daily_cap;

  select count(*) into kept_count from public.notifications
  where user_id = p_user_id and status = 'unread' and created_at >= date_trunc('day', now());
  update public.heartbeat_runs set notifications_created = kept_count, silent = kept_count = 0
  where id = run_id;
  return jsonb_build_object('run_id', run_id, 'silent', kept_count = 0, 'notifications_created', kept_count);
end;
$$;
revoke all on function public.run_user_heartbeat(uuid) from public, anon, authenticated;
grant execute on function public.run_user_heartbeat(uuid) to service_role;
