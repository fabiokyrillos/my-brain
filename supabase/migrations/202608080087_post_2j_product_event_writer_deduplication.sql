-- POST-2J CORRECTION — the product-event writer stops keeping its own copy of
-- the vocabulary.
--
-- This is NOT a Phase 2J migration. Phase 2J closed at `2 allocated · 2 spent`
-- and that record stands. This is a deployment-defect repair, authorized by the
-- owner as an explicit amendment outside that budget, in the same class as
-- `202608070084` (a post-2H correction charged to no phase).
--
-- THE DEFECT, as measured on the deployed project rather than inferred.
-- `product_events` enforced its event-name vocabulary in THREE places:
--
--   1. `product_events_event_name_check`      — the table CHECK;
--   2. `private.validate_product_event_properties` — per-event property shape,
--      whose `else` arm refuses an unnamed event with `22023`;
--   3. `private.record_product_event`         — a hardcoded `not in (...)` list
--      in the writer's own body.
--
-- `202608080086` widened (1) and (2). Nothing has re-declared (3) since
-- `202607280061`, and both public writers delegate to it, so (3) refused first.
-- On hosted, with a control travelling the identical function and arguments and
-- being accepted, these were refused `22023 Unsupported product event`:
--
--   * `capture_mode_selected`, `voice_transcription_finished`,
--     `attention_item_resolved`  — Phase 2J's three, added by `202608080086`;
--   * `rate_limit_refused`       — Phase 2H's, added by `202608070081`, and so
--     silently unrecordable since that migration shipped.
--
-- Emission sites wrap the call in `.catch(() => {})`, so both losses were
-- invisible: the code reads as though it records. `2J-METRICS-007` read zero.
--
-- THE FIX IS DELETION, NOT SYNCHRONIZATION (owner decision, Option B of
-- `docs/reports/phase-2j/PHASE_2J_DEPLOYMENT.md` §5). Appending four names to
-- (3) would restore the behaviour and leave the defect: a third copy that the
-- next widening forgets again, exactly as the last two did. So (3)'s list is
-- removed and the vocabulary keeps exactly two enforcement points, which the
-- verification at the foot of this file proves agree with each other.
--
-- FAIL-CLOSED IS PRESERVED, AND THAT IS THE LOAD-BEARING CLAIM. Removing a
-- guard is only safe because the remaining ones are complete:
--
--   * the table CHECK still refuses an unnamed event (`23514`) — it is untouched
--     by this migration and remains a real enforcement point;
--   * `validate_product_event_properties` is a `case` whose `else` arm raises
--     `'Unsupported product event'` with errcode `22023` — the same message and
--     the same errcode the deleted gate raised, so a caller cannot tell the
--     difference;
--   * the validator is called for EVERY event, before the insert, and it covers
--     all thirty CHECK-declared names. The final block below proves that
--     coverage name-by-name rather than asserting it, because "the other guard
--     covers it" is precisely the assumption that failed here.
--
-- One ordering consequence, stated rather than discovered later: the deleted
-- gate ran before the surface/locale/viewport checks, and the validator runs
-- after them. A call that is wrong about BOTH the event name and the surface now
-- reports the surface first. Both are `22023` refusals of an invalid call; no
-- call that used to be accepted is refused, and no call that used to be refused
-- is accepted.
--
-- NOT CHANGED BY THIS MIGRATION: no table, no CHECK, no policy, no RLS, no
-- grant widening, no ownership boundary, no free-text property, no retention, no
-- cron, no second write path. The re-declaration preserves `security definer`,
-- `set search_path = ''`, the signature, the return shape, every other
-- validation, the idempotent `on conflict` and the `revoke` posture.

create or replace function private.record_product_event(
  p_user_id uuid,
  p_event_name text,
  p_surface text,
  p_locale text,
  p_viewport_class text,
  p_app_version text,
  p_properties jsonb,
  p_subject_type text,
  p_subject_id uuid,
  p_session_id uuid,
  p_idempotency_key uuid,
  p_is_synthetic boolean
)
returns table(event_id uuid, recorded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_event_id uuid;
begin
  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22004';
  end if;
  -- The event-name allowlist that stood here is deliberately gone. The table
  -- CHECK and `private.validate_product_event_properties` are the vocabulary,
  -- and the validator's `else` arm raises the identical
  -- `'Unsupported product event'` / `22023` this block used to raise.
  if p_surface not in (
    'home', 'capture', 'inbox', 'needs_attention', 'interpretation_review',
    'technical_details', 'work', 'questions', 'server', 'task_command'
  ) then
    raise exception 'Unsupported product surface' using errcode = '22023';
  end if;
  if p_locale not in ('pt-BR', 'en') then
    raise exception 'Unsupported product locale' using errcode = '22023';
  end if;
  if p_viewport_class not in ('mobile', 'desktop', 'unknown') then
    raise exception 'Unsupported viewport class' using errcode = '22023';
  end if;
  if p_app_version is null or p_app_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' then
    raise exception 'Invalid application version' using errcode = '22023';
  end if;
  if p_idempotency_key is null or p_is_synthetic is null then
    raise exception 'Product event idempotency and synthetic flags are required' using errcode = '22004';
  end if;

  perform private.validate_product_event_properties(p_event_name, p_properties);
  perform private.assert_product_event_subject_owner(p_user_id, p_subject_type, p_subject_id);

  insert into public.product_events (
    user_id, event_name, surface, locale, viewport_class, app_version, properties,
    subject_type, subject_id, session_id, idempotency_key, is_synthetic
  ) values (
    p_user_id, p_event_name, p_surface, p_locale, p_viewport_class, p_app_version, p_properties,
    p_subject_type, p_subject_id, p_session_id, p_idempotency_key, p_is_synthetic
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    select id into inserted_event_id
    from public.product_events
    where user_id = p_user_id and idempotency_key = p_idempotency_key;

    return query select inserted_event_id, false;
  else
    return query select inserted_event_id, true;
  end if;
end;
$$;

-- Unchanged posture, restated because a `create or replace` is silent about it.
revoke all on function private.record_product_event(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Post-deploy assertions. Ordered AFTER the re-declaration, never before — the
-- ordering defect `202608080085` carried in its first draft, where the check ran
-- against the old function and aborted the migration it existed to protect.
-- ---------------------------------------------------------------------------

do $$
declare
  recorder_body text;
begin
  select pg_get_functiondef(oid)
    into recorder_body
    from pg_proc
   where proname = 'record_product_event'
     and pronamespace = 'private'::regnamespace
   limit 1;

  if recorder_body is null then
    raise exception 'private.record_product_event is absent; the ledger has no writer';
  end if;

  -- The duplication is gone. These two names existed in the writer ONLY inside
  -- the deleted gate, so their presence would mean a partial paste left it.
  if position('task_command_undone' in recorder_body) > 0
     or position('capture_started' in recorder_body) > 0 then
    raise exception
      'private.record_product_event still enumerates event names; the redundant gate was not removed';
  end if;

  -- Everything else must have survived the re-declaration. A "fix" that removed
  -- the gate by removing the validation around it would pass the check above.
  if position('validate_product_event_properties' in recorder_body) = 0 then
    raise exception 'the writer no longer validates event properties';
  end if;
  if position('assert_product_event_subject_owner' in recorder_body) = 0 then
    raise exception 'the writer no longer asserts subject ownership';
  end if;
  if position('Unsupported product surface' in recorder_body) = 0
     or position('Unsupported product locale' in recorder_body) = 0
     or position('Unsupported viewport class' in recorder_body) = 0
     or position('Invalid application version' in recorder_body) = 0
     or position('Product event idempotency and synthetic flags are required' in recorder_body) = 0 then
    raise exception 'the writer lost one of its non-vocabulary guards';
  end if;
  if position('on conflict (user_id, idempotency_key) do nothing' in recorder_body) = 0 then
    raise exception 'the writer lost its idempotent insert';
  end if;

  -- The security boundary is unchanged.
  if not (select prosecdef from pg_proc
           where proname = 'record_product_event'
             and pronamespace = 'private'::regnamespace limit 1) then
    raise exception 'private.record_product_event is no longer security definer';
  end if;
  if not (select 'search_path=""' = any(coalesce(proconfig, array[]::text[]))
            from pg_proc
           where proname = 'record_product_event'
             and pronamespace = 'private'::regnamespace limit 1) then
    raise exception 'private.record_product_event lost its empty search_path';
  end if;
end $$;

-- The invariant this defect existed for want of: the CHECK and the validator
-- are ONE vocabulary. Every name the table declares legal must be a name the
-- validator can shape-check, or the writer would refuse a name the table
-- accepts — which is the bug being repaired, one layer up.
--
-- This is a name-by-name proof, not a count. A count matches while two lists
-- disagree by one name in each direction, which is exactly the shape a partial
-- widening produces.
do $$
declare
  validator_body text;
  declared_names text[];
  missing text[] := array[]::text[];
  name text;
begin
  select pg_get_functiondef(oid)
    into validator_body
    from pg_proc
   where proname = 'validate_product_event_properties'
     and pronamespace = 'private'::regnamespace
   limit 1;

  if validator_body is null then
    raise exception 'private.validate_product_event_properties is absent';
  end if;

  -- The constraint is selected in a subquery rather than joined laterally in
  -- place: a bare `from pg_constraint, lateral regexp_matches(...)` applies the
  -- WHERE only after the join, so the extraction would run over every
  -- constraint in the catalog to produce the one row that is wanted.
  select array_agg(distinct match[1])
    into declared_names
    from (
      select pg_get_constraintdef(oid) as definition
        from pg_constraint
       where conname = 'product_events_event_name_check'
         and conrelid = 'public.product_events'::regclass
    ) constraint_row,
    lateral regexp_matches(constraint_row.definition, '''([a-z0-9_]+)''', 'g') as match;

  -- Non-vacuity: an empty or truncated extraction would make the loop below
  -- assert nothing at all. The floor is deliberately loose — the named controls
  -- immediately after are the real assertion, and a floor pinned to today's
  -- exact count would fail the day a name is legitimately retired.
  if declared_names is null or array_length(declared_names, 1) < 20 then
    raise exception
      'the event-name vocabulary could not be read from the CHECK constraint (got %); this assertion would otherwise pass vacuously',
      coalesce(array_length(declared_names, 1), 0);
  end if;
  if not ('rate_limit_refused' = any(declared_names))
     or not ('capture_mode_selected' = any(declared_names))
     or not ('voice_transcription_finished' = any(declared_names))
     or not ('attention_item_resolved' = any(declared_names))
     or not ('capture_started' = any(declared_names)) then
    raise exception 'the extracted vocabulary is missing a known control; the extraction is wrong';
  end if;

  foreach name in array declared_names loop
    if position('''' || name || '''' in validator_body) = 0 then
      missing := missing || name;
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception
      'these CHECK-declared event names are unknown to the property validator, so the writer would refuse them: %',
      array_to_string(missing, ', ');
  end if;
end $$;
