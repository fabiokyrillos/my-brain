create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  locale text not null default 'pt-BR' check (locale in ('pt-BR','en')),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agent_name text not null default 'Brain' check (char_length(agent_name) between 1 and 60),
  personality text not null default 'direct',
  tone text not null default 'informal',
  autonomy_level text not null default 'autonomous',
  follow_up_intensity text not null default 'balanced' check (follow_up_intensity in ('calm','balanced','insistent','custom')),
  daily_review_time time not null default '22:00',
  weekly_review_day smallint not null default 5 check (weekly_review_day between 0 and 6),
  weekly_review_time time not null default '19:00',
  planning_day smallint not null default 1 check (planning_day between 0 and 6),
  planning_time time not null default '08:00',
  quiet_periods jsonb not null default '[]'::jsonb,
  response_detail text not null default 'short' check (response_detail in ('short','detailed')),
  privacy_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_locale_idx on public.profiles (locale);
create index profiles_updated_at_idx on public.profiles (updated_at desc);
create index agent_preferences_updated_at_idx on public.agent_preferences (updated_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger agent_preferences_updated_at before update on public.agent_preferences for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.agent_preferences (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.agent_preferences enable row level security;
alter table public.agent_preferences force row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy profiles_delete_own on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);
create policy agent_preferences_select_own on public.agent_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy agent_preferences_insert_own on public.agent_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy agent_preferences_update_own on public.agent_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agent_preferences_delete_own on public.agent_preferences for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles, public.agent_preferences to authenticated;
revoke all on public.profiles, public.agent_preferences from anon;
