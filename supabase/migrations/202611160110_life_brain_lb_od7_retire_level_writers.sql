-- Life Brain LB-M5 -- nothing in the database sets a sensitivity any more (ADR-180).
--
-- WHO AUTHORIZED IT
--
-- ADR-178 (E.8, LB-OD-7) made every sensitivity level show everywhere, in the
-- owner's words: "Não quero ter nada privado, ou com restrição." It left the
-- database as it was, because that slice was not authorized to write a
-- migration, and recorded the leftovers as an optional follow-up (Decision 4).
-- The owner authorized that follow-up on 16 November 2026, together with
-- applying it to the hosted project after its merge. This file is the whole of
-- it.
--
-- WHAT IT DOES
--
--  1. `link_entry_life_area` no longer stamps a newly linked health or finance
--     entry `private`. Everything else it does is unchanged: the same checks,
--     the same area context, the same link on the CURRENT interpretation, the
--     same audit row (its `sensitivity` before and after are now always equal)
--     and the same answer, whose `sensitivity` is the entry's own.
--  2. `set_entry_sensitivity` is dropped. E.8 removed its only consumer, the
--     record page's form, so nothing calls it.
--
-- WHAT IT DOES NOT DO
--
--  - It changes no row. An entry already `private` stays `private`; since
--    ADR-178 that level renders, searches and reaches the chat exactly like
--    `normal`, so rewriting the value would change nothing the owner sees.
--  - It keeps `entries/memories/attachments.sensitivity`, its CHECK and the
--    central contract in TypeScript, so a later decision can bring a level back
--    as data (ADR-178 Decision 3).
--  - The "two suggestion RPCs" ADR-178 Decision 4 named do not exist in SQL:
--    the `highly_sensitive` skip was the TypeScript derivation's `readable`,
--    which E.8 already made admit every level. There is nothing here to drop.
--
-- `create or replace` keeps the signature, so the worker deployed today calls
-- it unchanged; the grants are restated so the posture is read in this file.

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

  -- ADR-180: no area sets a sensitivity. The audit row keeps its shape, with
  -- the entry's level before and after, which are now always the same.
  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_service_user_id, 'entry_life_area_linked', 'entry', p_entry_id, 'agent',
    jsonb_build_object('sensitivity', v_entry.sensitivity),
    jsonb_build_object(
      'life_area', p_kind,
      'context_id', v_context_id,
      'context_created', not v_context_existed,
      'interpretation_id', v_entry.current_interpretation_id,
      'confidence', round(p_confidence, 3),
      'sensitivity', v_entry.sensitivity
    ),
    'life_area_extraction', p_entry_id
  );

  return jsonb_build_object(
    'linked', true,
    'contextId', v_context_id,
    'changed', true,
    'sensitivity', v_entry.sensitivity
  );
end;
$$;

revoke all on function public.link_entry_life_area(uuid, text, numeric, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.link_entry_life_area(uuid, text, numeric, text, uuid)
  to service_role;

drop function public.set_entry_sensitivity(uuid, text);
