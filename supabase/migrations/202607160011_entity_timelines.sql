create unique index person_projects_current_idx on public.person_projects (person_id, project_id) where valid_until is null;
create unique index person_contexts_current_idx on public.person_contexts (person_id, context_id) where valid_until is null;

create or replace function public.link_interpreted_entities()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.entity_type = 'person' then
    insert into public.person_projects (user_id, person_id, project_id, confidence)
    select new.user_id, new.entity_id, other.entity_id, least(new.confidence, other.confidence)
    from public.entry_entities other
    where other.interpretation_id = new.interpretation_id and other.entity_type = 'project'
    on conflict (person_id, project_id) where valid_until is null do nothing;
    insert into public.person_contexts (user_id, person_id, context_id, confidence)
    select new.user_id, new.entity_id, other.entity_id, least(new.confidence, other.confidence)
    from public.entry_entities other
    where other.interpretation_id = new.interpretation_id and other.entity_type = 'context'
    on conflict (person_id, context_id) where valid_until is null do nothing;
  elsif new.entity_type = 'project' then
    insert into public.person_projects (user_id, person_id, project_id, confidence)
    select new.user_id, other.entity_id, new.entity_id, least(new.confidence, other.confidence)
    from public.entry_entities other
    where other.interpretation_id = new.interpretation_id and other.entity_type = 'person'
    on conflict (person_id, project_id) where valid_until is null do nothing;
  elsif new.entity_type = 'context' then
    insert into public.person_contexts (user_id, person_id, context_id, confidence)
    select new.user_id, other.entity_id, new.entity_id, least(new.confidence, other.confidence)
    from public.entry_entities other
    where other.interpretation_id = new.interpretation_id and other.entity_type = 'person'
    on conflict (person_id, context_id) where valid_until is null do nothing;
  end if;
  return new;
end;
$$;
create trigger entry_entities_link_timelines after insert on public.entry_entities for each row execute function public.link_interpreted_entities();

insert into public.person_projects (user_id, person_id, project_id, confidence)
select person.user_id, person.entity_id, project.entity_id, least(person.confidence, project.confidence)
from public.entry_entities person
join public.entry_entities project on project.interpretation_id = person.interpretation_id and project.entity_type = 'project'
where person.entity_type = 'person'
on conflict (person_id, project_id) where valid_until is null do nothing;

insert into public.person_contexts (user_id, person_id, context_id, confidence)
select person.user_id, person.entity_id, context.entity_id, least(person.confidence, context.confidence)
from public.entry_entities person
join public.entry_entities context on context.interpretation_id = person.interpretation_id and context.entity_type = 'context'
where person.entity_type = 'person'
on conflict (person_id, context_id) where valid_until is null do nothing;
