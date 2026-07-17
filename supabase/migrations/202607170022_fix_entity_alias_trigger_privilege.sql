-- Keep alias normalization internal while allowing the authenticated table
-- insert to execute its trigger through the migration-owning function role.

create or replace function public.prepare_entity_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.alias := trim(new.alias);
  new.normalized_alias := public.normalize_entity_alias(new.alias);
  if new.normalized_alias = '' then raise exception 'Alias must contain letters or numbers'; end if;
  return new;
end;
$$;

revoke all on function public.prepare_entity_alias() from public, anon, authenticated;
