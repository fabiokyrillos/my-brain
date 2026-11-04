-- Life Brain LB-M1 (slice C.1, ADR-148; LIFE_DATA_MODEL.md §2 and §4).
--
-- A life area is a context with a kind from a closed vocabulary, one per area
-- per user, created on demand when the extraction is confident. Owner decision
-- LB-OD-6 (2026-11-04): widen `contexts.kind` rather than add a `life_areas`
-- table, because contexts are already linkable to entries and tasks through
-- junctions whose ownership is proved, and a new table would need two more.
--
-- Three things, in one migration because the plan allows three in total:
--
--  1. the vocabulary: `contexts.kind` admits eight areas beside work, personal
--     and custom; a partial unique index keeps one context per area. `work`
--     and `personal` are NOT in the index, because existing accounts may hold
--     several of each and this migration must apply over them unchanged;
--  2. `link_entry_life_area`, which the worker calls after it persists an
--     interpretation: it resolves (or creates) the area's context, links the
--     entry's CURRENT interpretation to it, and gives a health or finance entry
--     the default `private` sensitivity — never over a choice the owner made;
--  3. `set_entry_sensitivity`, the owner's override, which did not exist: until
--     now nothing in the product could write `entries.sensitivity` at all.
--
-- Not done here: recreating `persist_entry_interpretation`. The link is a
-- separate, non-blocking step after it, exactly like the embedding: an area
-- failure never destroys an interpretation.

-- 1. Vocabulary -----------------------------------------------------------------

alter table public.contexts drop constraint contexts_kind_check;
alter table public.contexts add constraint contexts_kind_check check (
  kind in (
    'work', 'personal', 'custom',
    'health', 'family', 'home', 'finance', 'travel', 'study', 'leisure', 'ideas'
  )
);

create unique index contexts_user_life_area_idx
  on public.contexts (user_id, kind)
  where kind in ('health', 'family', 'home', 'finance', 'travel', 'study', 'leisure', 'ideas');

-- 2. The area context ------------------------------------------------------------

-- Returns the id of the owner's context for an area, creating it when none
-- exists. Order of resolution, each step deterministic:
--   a. a context already of that kind (for `work`, the oldest — accounts may
--      hold several);
--   b. a hand-made context with the area's default name and kind `custom` —
--      the owner already made "Saúde" before areas existed, so it is adopted
--      by giving it the kind, rather than duplicated beside it;
--   c. a new context with the localized default name.
-- A name held by a context of ANOTHER kind is returned as is and never
-- re-kinded: that context means something the owner decided.
create or replace function private.ensure_life_area_context(
  p_user_id uuid,
  p_kind text,
  p_locale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_id uuid;
  v_kind text;
begin
  v_name := case p_kind
    when 'health'  then case when p_locale = 'en' then 'Health'  else 'Saúde' end
    when 'family'  then case when p_locale = 'en' then 'Family'  else 'Família' end
    when 'home'    then case when p_locale = 'en' then 'Home'    else 'Casa' end
    when 'finance' then case when p_locale = 'en' then 'Finance' else 'Finanças' end
    when 'travel'  then case when p_locale = 'en' then 'Travel'  else 'Viagens' end
    when 'work'    then case when p_locale = 'en' then 'Work'    else 'Trabalho' end
    when 'study'   then case when p_locale = 'en' then 'Study'   else 'Estudos' end
    when 'leisure' then case when p_locale = 'en' then 'Leisure' else 'Lazer' end
    when 'ideas'   then case when p_locale = 'en' then 'Ideas'   else 'Ideias' end
    else null
  end;
  if v_name is null then
    raise exception 'Unknown life area' using errcode = '22023', detail = 'UNKNOWN_LIFE_AREA';
  end if;

  select id into v_id
  from public.contexts
  where user_id = p_user_id and kind = p_kind
  order by created_at, id
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select id, kind into v_id, v_kind
  from public.contexts
  where user_id = p_user_id and lower(name) = lower(v_name)
  for update;
  if v_id is not null then
    if v_kind = 'custom' then
      update public.contexts set kind = p_kind where id = v_id and user_id = p_user_id;
    end if;
    return v_id;
  end if;

  insert into public.contexts (user_id, name, kind)
  values (p_user_id, v_name, p_kind)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    -- A concurrent link created it between the reads and the insert.
    select id into v_id from public.contexts where user_id = p_user_id and kind = p_kind order by created_at, id limit 1;
  end if;
  return v_id;
end;
$$;

revoke all on function private.ensure_life_area_context(uuid, text, text)
  from public, anon, authenticated, service_role;

-- 3. The worker's link ------------------------------------------------------------

create or replace function public.link_entry_life_area(
  p_entry_id uuid,
  p_kind text,
  p_confidence numeric,
  p_locale text,
  p_service_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.entries%rowtype;
  v_context_id uuid;
  v_context_existed boolean;
  v_link_id uuid;
  v_sensitivity_before text;
  v_sensitivity_after text;
  v_owner_chose boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_service_user_id is null then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_entry_id is null then
    raise exception 'Entry is required' using errcode = '22023', detail = 'INVALID_LIFE_AREA_REQUEST';
  end if;
  if p_kind is null or p_kind not in ('health', 'family', 'home', 'finance', 'travel', 'work', 'study', 'leisure', 'ideas') then
    raise exception 'Unknown life area' using errcode = '22023', detail = 'UNKNOWN_LIFE_AREA';
  end if;
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception 'Confidence must be between 0 and 1' using errcode = '22023', detail = 'INVALID_LIFE_AREA_REQUEST';
  end if;

  select * into v_entry
  from public.entries
  where id = p_entry_id and user_id = p_service_user_id
  for update;
  if v_entry.id is null then
    raise exception 'Entry not found' using errcode = 'P0002', detail = 'ENTRY_NOT_FOUND';
  end if;

  -- LIFE_DATA_MODEL §2: the worker links at 0.6 or above. Asserted here as
  -- well as in the caller, so an unsure reading can never create an area.
  if p_confidence < 0.6 then
    return jsonb_build_object('linked', false, 'reason', 'low_confidence');
  end if;
  if v_entry.current_interpretation_id is null then
    return jsonb_build_object('linked', false, 'reason', 'no_current_interpretation');
  end if;

  v_context_existed := exists (
    select 1 from public.contexts where user_id = p_service_user_id and kind = p_kind
  );
  v_context_id := private.ensure_life_area_context(p_service_user_id, p_kind, p_locale);
  if v_context_id is null then
    return jsonb_build_object('linked', false, 'reason', 'no_context');
  end if;

  insert into public.entry_entities (user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence)
  select p_service_user_id, p_entry_id, v_entry.current_interpretation_id, 'context', v_context_id, c.name, round(p_confidence, 3)
  from public.contexts c
  where c.id = v_context_id and c.user_id = p_service_user_id
  on conflict (interpretation_id, entity_type, entity_id) do nothing
  returning id into v_link_id;

  -- The same interpretation linked again: nothing changed, nothing to audit.
  if v_link_id is null then
    return jsonb_build_object('linked', true, 'contextId', v_context_id, 'changed', false);
  end if;

  -- LIFE_DATA_MODEL §4: health and finance default to private — only from
  -- `normal`, and never after the owner has set a level themselves.
  v_sensitivity_before := v_entry.sensitivity;
  v_sensitivity_after := v_entry.sensitivity;
  v_owner_chose := exists (
    select 1 from public.audit_logs
    where user_id = p_service_user_id and source_entry_id = p_entry_id
      and action_type = 'entry_sensitivity_set' and actor = 'user'
  );
  if p_kind in ('health', 'finance') and v_entry.sensitivity = 'normal' and not v_owner_chose then
    update public.entries set sensitivity = 'private'
    where id = p_entry_id and user_id = p_service_user_id;
    v_sensitivity_after := 'private';
  end if;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_service_user_id, 'entry_life_area_linked', 'entry', p_entry_id, 'agent',
    jsonb_build_object('sensitivity', v_sensitivity_before),
    jsonb_build_object(
      'life_area', p_kind,
      'context_id', v_context_id,
      'context_created', not v_context_existed,
      'interpretation_id', v_entry.current_interpretation_id,
      'confidence', round(p_confidence, 3),
      'sensitivity', v_sensitivity_after
    ),
    'life_area_extraction', p_entry_id
  );

  return jsonb_build_object(
    'linked', true,
    'contextId', v_context_id,
    'changed', true,
    'sensitivity', v_sensitivity_after
  );
end;
$$;

revoke all on function public.link_entry_life_area(uuid, text, numeric, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.link_entry_life_area(uuid, text, numeric, text, uuid)
  to service_role;

-- 4. The owner's override ------------------------------------------------------------

create or replace function public.set_entry_sensitivity(
  p_entry_id uuid,
  p_sensitivity text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  v_before text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501', detail = 'AUTH_REQUIRED';
  end if;
  if p_entry_id is null or p_sensitivity is null
     or p_sensitivity not in ('normal', 'private', 'highly_sensitive') then
    raise exception 'Unknown sensitivity' using errcode = '22023', detail = 'INVALID_SENSITIVITY';
  end if;

  select sensitivity into v_before
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'Entry not found' using errcode = 'P0002', detail = 'ENTRY_NOT_FOUND';
  end if;

  if v_before is distinct from p_sensitivity then
    update public.entries set sensitivity = p_sensitivity
    where id = p_entry_id and user_id = current_user_id;
  end if;

  -- Audited even when unchanged: it records that the owner decided, which is
  -- what keeps a later reading from overriding the decision.
  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id, 'entry_sensitivity_set', 'entry', p_entry_id, 'user',
    jsonb_build_object('sensitivity', v_before),
    jsonb_build_object('sensitivity', p_sensitivity),
    'owner_choice', p_entry_id
  );

  return jsonb_build_object('entryId', p_entry_id, 'sensitivity', p_sensitivity, 'previous', v_before);
end;
$$;

revoke all on function public.set_entry_sensitivity(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_entry_sensitivity(uuid, text)
  to authenticated;
