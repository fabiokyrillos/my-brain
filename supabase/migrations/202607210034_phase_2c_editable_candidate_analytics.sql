-- Issue #3 fast-follow: enable database persistence for the editable-candidate
-- analytics events already instrumented at the application layer (commit
-- b2cd44a). Additive only: extends the existing product_events allowlist
-- contract from migration 202607170024; no other table, RPC, or grant model
-- changes. The legacy confirm_entry_task_candidates(_v2) RPCs, undo, and
-- idempotency behavior are untouched.

-- 1. Allow the two new event names at the table boundary.
alter table public.product_events
  drop constraint product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    'capture_started',
    'capture_save_succeeded',
    'capture_save_failed',
    'capture_processing_enqueued',
    'capture_processing_completed',
    'capture_processing_failed',
    'needs_attention_viewed',
    'needs_attention_item_opened',
    'interpretation_review_viewed',
    'interpretation_corrected',
    'technical_details_opened',
    'task_candidates_presented',
    'task_candidates_confirmed',
    'question_answered_basic',
    'processing_retry_requested',
    'work_view_viewed',
    'task_status_changed',
    'candidate_edit_started',
    'candidate_edit_reset'
  ));

-- 2. Cross-field bound for task_candidates_confirmed's optional edit counts:
-- editedCandidateCount in [0, candidateCount]; editedFieldCount in
-- [0, editedCandidateCount * 3] (there are exactly 3 editable candidate
-- fields: title, description, dueAt). This single bound also enforces
-- "editedCandidateCount = 0 implies editedFieldCount = 0" and
-- "editedFieldCount > 0 implies editedCandidateCount > 0" as corollaries.
-- Both properties are optional together, preserving legacy callers that send
-- only candidateCount; supplying exactly one of the pair is rejected.
create or replace function private.require_task_candidates_confirmed_edit_counts(
  p_properties jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_edited_candidate_count boolean := p_properties ? 'editedCandidateCount';
  has_edited_field_count boolean := p_properties ? 'editedFieldCount';
  candidate_count numeric;
  edited_candidate_count numeric;
  edited_field_count numeric;
begin
  if not has_edited_candidate_count and not has_edited_field_count then
    return;
  end if;

  -- NULL-safe presence check: jsonb_typeof(missing key) is SQL NULL, and
  -- `NULL <> 'number'` is NULL (not TRUE), so a naive type-only check below
  -- would silently accept a payload supplying only one of the pair. Require
  -- both keys present (or both absent, already handled above) explicitly.
  if has_edited_candidate_count <> has_edited_field_count then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if jsonb_typeof(p_properties -> 'candidateCount') <> 'number'
    or jsonb_typeof(p_properties -> 'editedCandidateCount') <> 'number'
    or jsonb_typeof(p_properties -> 'editedFieldCount') <> 'number' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if (p_properties ->> 'candidateCount') !~ '^[0-9]+$'
    or (p_properties ->> 'editedCandidateCount') !~ '^[0-9]+$'
    or (p_properties ->> 'editedFieldCount') !~ '^[0-9]+$' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  candidate_count := (p_properties ->> 'candidateCount')::numeric;
  edited_candidate_count := (p_properties ->> 'editedCandidateCount')::numeric;
  edited_field_count := (p_properties ->> 'editedFieldCount')::numeric;

  if edited_candidate_count < 0 or edited_candidate_count > candidate_count then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if edited_field_count < 0 or edited_field_count > edited_candidate_count * 3 then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_task_candidates_confirmed_edit_counts(jsonb)
  from public, anon, authenticated, service_role;

-- 3. Extend the per-event property allowlist/validation: the two new events,
-- plus task_candidates_confirmed's optional editedCandidateCount/
-- editedFieldCount. Every other event branch is reproduced byte-for-byte
-- from migration 202607170024 (create or replace, same signature, no
-- behavior change to any existing event).
create or replace function private.validate_product_event_properties(
  p_event_name text,
  p_properties jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed_keys text[];
  unknown_key text;
begin
  if p_properties is null or jsonb_typeof(p_properties) <> 'object' then
    raise exception 'Product event properties must be an object' using errcode = '22023';
  end if;

  case p_event_name
    when 'capture_started' then
      allowed_keys := array['captureSource'];
    when 'capture_save_succeeded' then
      allowed_keys := array['captureSource', 'durationMs'];
    when 'capture_save_failed' then
      allowed_keys := array['captureSource', 'durationMs', 'failureKind'];
    when 'capture_processing_enqueued' then
      allowed_keys := array['processingMode'];
    when 'capture_processing_completed' then
      allowed_keys := array['processingMode', 'durationMs', 'outcome'];
    when 'capture_processing_failed' then
      allowed_keys := array['processingMode', 'durationMs', 'failureKind'];
    when 'needs_attention_viewed' then
      allowed_keys := array['itemCount'];
    when 'needs_attention_item_opened' then
      allowed_keys := array['attentionReason'];
    when 'interpretation_review_viewed', 'technical_details_opened', 'question_answered_basic' then
      allowed_keys := array[]::text[];
    when 'interpretation_corrected' then
      allowed_keys := array['fieldCount'];
    when 'task_candidates_presented' then
      allowed_keys := array['candidateCount'];
    when 'candidate_edit_started' then
      allowed_keys := array['candidateCount'];
    when 'candidate_edit_reset' then
      allowed_keys := array['editedFieldCount'];
    when 'task_candidates_confirmed' then
      allowed_keys := array['candidateCount', 'editedCandidateCount', 'editedFieldCount'];
    when 'processing_retry_requested' then
      allowed_keys := array['retrySource'];
    when 'work_view_viewed' then
      allowed_keys := array['workView'];
    when 'task_status_changed' then
      allowed_keys := array['fromStatus', 'toStatus'];
    else
      raise exception 'Unsupported product event' using errcode = '22023';
  end case;

  select key into unknown_key
  from jsonb_object_keys(p_properties) as key
  where not (key = any(allowed_keys))
  limit 1;

  if unknown_key is not null then
    raise exception 'Unsupported product event property' using errcode = '22023';
  end if;

  case p_event_name
    when 'capture_started' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
    when 'capture_save_succeeded' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
    when 'capture_save_failed' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'failureKind', array['validation', 'session', 'storage', 'unknown']);
    when 'capture_processing_enqueued' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
    when 'capture_processing_completed' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'outcome', array['ready', 'needs_attention']);
    when 'capture_processing_failed' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'failureKind', array['retryable', 'terminal']);
    when 'needs_attention_viewed' then
      perform private.require_product_event_integer(p_properties, 'itemCount', 0, 1000);
    when 'needs_attention_item_opened' then
      perform private.require_product_event_enum(p_properties, 'attentionReason', array[
        'review_interpretation',
        'confirm_existing_candidates',
        'answer_existing_question',
        'retry_processing',
        'resolve_consistency'
      ]);
    when 'interpretation_review_viewed', 'technical_details_opened', 'question_answered_basic' then
      null;
    when 'interpretation_corrected' then
      perform private.require_product_event_integer(p_properties, 'fieldCount', 1, 30);
    when 'task_candidates_presented' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
    when 'candidate_edit_started' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 1, 1);
    when 'candidate_edit_reset' then
      perform private.require_product_event_integer(p_properties, 'editedFieldCount', 1, 3);
    when 'task_candidates_confirmed' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 1, 100);
      perform private.require_task_candidates_confirmed_edit_counts(p_properties);
    when 'processing_retry_requested' then
      perform private.require_product_event_enum(p_properties, 'retrySource', array['user', 'worker']);
    when 'work_view_viewed' then
      perform private.require_product_event_enum(p_properties, 'workView', array['today', 'all', 'waiting']);
    when 'task_status_changed' then
      perform private.require_product_event_enum(p_properties, 'fromStatus', array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled'
      ]);
      perform private.require_product_event_enum(p_properties, 'toStatus', array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled'
      ]);
  end case;
end;
$$;

revoke all on function private.validate_product_event_properties(text, jsonb)
  from public, anon, authenticated, service_role;

-- 4. private.record_product_event's own event-name guard duplicates the
-- table constraint's allowlist (defense in depth ahead of the insert); add
-- the two new names there too. Reproduced byte-for-byte from migration
-- 202607170024 otherwise (same signature, same ownership/validation order).
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
  if p_event_name not in (
    'capture_started', 'capture_save_succeeded', 'capture_save_failed',
    'capture_processing_enqueued', 'capture_processing_completed', 'capture_processing_failed',
    'needs_attention_viewed', 'needs_attention_item_opened', 'interpretation_review_viewed',
    'interpretation_corrected', 'technical_details_opened', 'task_candidates_presented',
    'task_candidates_confirmed', 'question_answered_basic', 'processing_retry_requested',
    'work_view_viewed', 'task_status_changed', 'candidate_edit_started', 'candidate_edit_reset'
  ) then
    raise exception 'Unsupported product event' using errcode = '22023';
  end if;
  if p_surface not in (
    'home', 'capture', 'inbox', 'needs_attention', 'interpretation_review',
    'technical_details', 'work', 'server'
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

revoke all on function private.record_product_event(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
