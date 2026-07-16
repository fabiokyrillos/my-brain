-- Accounts created before the Phase 1 identity migration need their owned rows.
insert into public.profiles (user_id, display_name, locale, timezone)
select
  id,
  coalesce(raw_user_meta_data ->> 'display_name', ''),
  'pt-BR',
  'America/Sao_Paulo'
from auth.users
on conflict (user_id) do nothing;

insert into public.agent_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;
