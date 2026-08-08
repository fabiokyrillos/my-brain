-- Phase 2J, slice 2J.7 -- three product events, and their consumer.
--
-- M1, the migration ADR-095 expected this slice to need. `product_events`
-- constrains `event_name` with a database CHECK and constrains each event's
-- PROPERTY KEYS with `private.validate_product_event_properties`, so there is no
-- application path that can record an event the database does not name. That is
-- also the privacy mechanism: `2J-METRICS-006` is enforced by the payload having
-- nowhere to put a transcript, a filename or a title -- not by writers promising
-- not to send one.
--
-- Three events, deliberately. `2J-METRICS-007` requires a CONSUMER before the
-- phase closes, because SH.6 shipped a producer with none and its quota refusals
-- recorded nothing for weeks while the code read as though they did. These three
-- are exactly what `scripts/phase-2j-experience-funnel-reader.mjs` asks
-- questions of; the larger set the PRD sketched would have declared names that
-- nothing would ever read.
--
-- The function is re-declared verbatim plus the new arms: Postgres cannot extend
-- a `case` arm in place, which is this repository's established convention
-- (`202607280061`, `202608060078`, `202608070081`). The diff against
-- `202608070081` is exactly the lines these three events add.

alter table public.product_events
  drop constraint if exists product_events_event_name_check;

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
    'question_resolved',
    'question_effect_previewed',
    'question_reinterpret_applied',
    'processing_retry_requested',
    'work_view_viewed',
    'task_status_changed',
    'candidate_edit_started',
    'candidate_edit_reset',
    'task_command_previewed',
    'task_command_disambiguated',
    'task_command_applied',
    'task_command_undone',
    'rate_limit_refused',
    -- Phase 2J slice 2J.7. Three, and the count is the point: `2J-METRICS-007`
    -- requires a consumer before close, and these are exactly what
    -- `scripts/phase-2j-experience-funnel-reader.mjs` reads. SH.6 shipped a
    -- producer with no consumer and its quota refusals recorded nothing for
    -- weeks while the code read as though they did.
    'capture_mode_selected',
    'voice_transcription_finished',
    'attention_item_resolved'
  ));

-- `drop constraint if exists` is fail-open. If the constraint's name were ever
-- not what this assumes, the DROP would no-op, the ADD would succeed under a
-- free name, the old vocabulary would survive, and every new event would fail at
-- a call site that wraps emission in `.catch(() => {})` -- silently, which is
-- exactly how SH.6's defect stayed invisible.
do $$
declare
  definition text;
begin
  select pg_get_constraintdef(oid)
    into definition
    from pg_constraint
   where conname = 'product_events_event_name_check'
     and conrelid = 'public.product_events'::regclass;

  if definition is null then
    raise exception 'product_events_event_name_check is absent after the swap';
  end if;

  if position('capture_mode_selected' in definition) = 0
     or position('voice_transcription_finished' in definition) = 0
     or position('attention_item_resolved' in definition) = 0 then
    raise exception 'the product_events vocabulary was not widened: %', definition;
  end if;

  -- Every pre-existing name must survive. A swap that widened the vocabulary by
  -- replacing it would pass the check above.
  if position('rate_limit_refused' in definition) = 0
     or position('capture_started' in definition) = 0
     or position('task_command_undone' in definition) = 0 then
    raise exception 'the product_events vocabulary lost a pre-existing name: %', definition;
  end if;
end $$;

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
    when 'rate_limit_refused' then
      allowed_keys := array['operation', 'failureKind'];
    when 'needs_attention_viewed' then
      allowed_keys := array['itemCount'];
    when 'needs_attention_item_opened' then
      allowed_keys := array['attentionReason'];
    when 'interpretation_review_viewed', 'technical_details_opened',
      'question_effect_previewed', 'question_reinterpret_applied' then
      allowed_keys := array[]::text[];
    when 'question_answered_basic' then
      allowed_keys := array['origin'];
    when 'question_resolved' then
      allowed_keys := array['kind'];
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
    when 'task_command_previewed' then
      allowed_keys := array[
        'commandOrigin', 'outcomeCategory', 'candidateCount', 'scoreBand',
        'marginBand', 'signalCategories', 'oneStep', 'requiresConfirmation',
        'policyVersion'
      ];
    when 'task_command_disambiguated' then
      allowed_keys := array['commandOrigin', 'candidateCount', 'selectedRank', 'policyVersion'];
    when 'task_command_applied' then
      allowed_keys := array[
        'commandOrigin', 'outcomeCategory', 'applyRoute', 'replayed', 'policyVersion'
      ];
    when 'task_command_undone' then
      allowed_keys := array['commandOrigin', 'undoResult', 'policyVersion'];
    -- Phase 2J slice 2J.7. The key whitelist is the privacy mechanism: there is
    -- no key here that could hold a transcript, a filename, a task title or an
    -- entry, so `2J-METRICS-006` is enforced by the payload having nowhere to
    -- put text rather than by writers promising not to send any.
    when 'capture_mode_selected' then
      allowed_keys := array['captureMode'];
    when 'voice_transcription_finished' then
      allowed_keys := array['outcome', 'draftEdited', 'additionalSegment'];
    when 'attention_item_resolved' then
      allowed_keys := array['attentionReason', 'resolutionAction', 'resolutionBucket'];
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
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global', 'composer']);
    when 'capture_save_succeeded' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global', 'composer']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
    when 'capture_save_failed' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global', 'composer']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      -- `'quota'` joins the four SH.6 shipped a producer for and no consumer of
      -- (ADR-084). The other four are unchanged, so no recorded event is
      -- invalidated by this line.
      perform private.require_product_event_enum(p_properties, 'failureKind', array['validation', 'session', 'storage', 'unknown', 'quota']);
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
    when 'rate_limit_refused' then
      -- The two buckets PRD §14.2 signs a ceiling for, named exactly as
      -- `rate_limit_events.bucket` names them, so an operator reading the ledger
      -- and an analyst reading the funnel are talking about the same thing.
      perform private.require_product_event_enum(p_properties, 'operation', array['ai', 'upload']);
      -- 2H-RATE-003's literal. Distinct from SH.5's throttle, SH.6's `quota`,
      -- the lifecycle refusals, CAPTCHA and storage -- a reader must be able to
      -- tell which control refused.
      perform private.require_product_event_enum(p_properties, 'failureKind', array['rate_limited']);
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
    when 'interpretation_review_viewed', 'technical_details_opened',
      'question_effect_previewed', 'question_reinterpret_applied' then
      null;
    when 'question_answered_basic' then
      -- Optional by design: the pre-cutover application sends {} and must keep
      -- recording. When present, the value is a closed two-item enum.
      if p_properties ? 'origin' then
        perform private.require_product_event_enum(p_properties, 'origin', array['typed', 'suggested']);
      end if;
    when 'question_resolved' then
      perform private.require_product_event_enum(p_properties, 'kind', array['deferred', 'dismissed', 'not_relevant']);
    when 'interpretation_corrected' then
      perform private.require_product_event_integer(p_properties, 'fieldCount', 1, 30);
    when 'task_candidates_presented' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
    when 'candidate_edit_started' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 1, 1);
    when 'candidate_edit_reset' then
      perform private.require_product_event_integer(p_properties, 'editedFieldCount', 1, 13);
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
    when 'task_command_previewed' then
      perform private.require_product_event_enum(p_properties, 'commandOrigin', array['chat', 'work']);
      -- PRD 2E-UX-001's twelve, in the order the requirement lists them, plus
      -- `previewed`. That thirteenth is the one preview *disposition* the
      -- outcome vocabulary deliberately excludes (`outcomes.ts:53-67`), because
      -- a preview waiting for the user has not come to rest -- and it is
      -- precisely where a one-step-eligible match belongs. Folding it onto
      -- another category would make PRD 18's first question, how often a
      -- command matched in one step, unanswerable from this event.
      perform private.require_product_event_enum(p_properties, 'outcomeCategory', array[
        'applied', 'no_change', 'ambiguous', 'ambiguous_overflow',
        'matched_requires_confirmation', 'clarification_requested', 'still_unmatched',
        'creation_offered', 'unsupported', 'rejected_stale', 'rejected_conflict', 'refused',
        'previewed'
      ]);
      -- Ceiling of 100 rather than of `TASK_MATCH_LIMITS.ranked`: the constant
      -- is a presentation cap that a policy change may raise, and a CHECK that
      -- tracked it would start rejecting truthful counts the day it moved.
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
      perform private.require_product_event_enum(p_properties, 'scoreBand', array['none', 'low', 'medium', 'high']);
      perform private.require_product_event_enum(p_properties, 'marginBand', array['none', 'low', 'medium', 'high']);
      -- 2E-MATCH-014's ten evidence labels. Bounded at ten because a set has no
      -- eleventh member to report.
      perform private.require_product_event_enum_array(p_properties, 'signalCategories', array[
        'normalized_exact_title', 'normalized_title_phrase', 'normalized_token_overlap',
        'referenced_project', 'referenced_context', 'referenced_person', 'status_match',
        'temporal_proximity', 'temporal_proximity_near', 'recent_activity'
      ], 10);
      perform private.require_product_event_boolean(p_properties, 'oneStep');
      perform private.require_product_event_boolean(p_properties, 'requiresConfirmation');
      perform private.require_product_event_policy_version(p_properties, 'policyVersion');
    when 'task_command_disambiguated' then
      perform private.require_product_event_enum(p_properties, 'commandOrigin', array['chat', 'work']);
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
      -- Zero means "the pick was not in the ranked list", which is a real state
      -- when a candidate went ineligible between listing and selection
      -- (2E-DISAMBIG-005). A rank is a position, never an identity.
      perform private.require_product_event_integer(p_properties, 'selectedRank', 0, 100);
      perform private.require_product_event_policy_version(p_properties, 'policyVersion');
    when 'task_command_applied' then
      perform private.require_product_event_enum(p_properties, 'commandOrigin', array['chat', 'work']);
      perform private.require_product_event_enum(p_properties, 'outcomeCategory', array[
        'applied', 'no_change', 'ambiguous', 'ambiguous_overflow',
        'matched_requires_confirmation', 'clarification_requested', 'still_unmatched',
        'creation_offered', 'unsupported', 'rejected_stale', 'rejected_conflict', 'refused'
      ]);
      perform private.require_product_event_enum(p_properties, 'applyRoute', array['direct', 'confirmed', 'created']);
      perform private.require_product_event_boolean(p_properties, 'replayed');
      perform private.require_product_event_policy_version(p_properties, 'policyVersion');
    when 'task_command_undone' then
      perform private.require_product_event_enum(p_properties, 'commandOrigin', array['chat', 'work']);
      perform private.require_product_event_enum(p_properties, 'undoResult', array['undone', 'unavailable', 'expired', 'refused']);
      perform private.require_product_event_policy_version(p_properties, 'policyVersion');
    when 'capture_mode_selected' then
      perform private.require_product_event_enum(p_properties, 'captureMode', array['text', 'attachment', 'voice']);
    when 'voice_transcription_finished' then
      perform private.require_product_event_enum(p_properties, 'outcome', array['succeeded', 'failed']);
      perform private.require_product_event_boolean(p_properties, 'draftEdited');
      perform private.require_product_event_boolean(p_properties, 'additionalSegment');
    when 'attention_item_resolved' then
      perform private.require_product_event_enum(p_properties, 'attentionReason', array['retry_processing']);
      perform private.require_product_event_enum(p_properties, 'resolutionAction', array['retry', 'bulk_retry']);
      -- A BUCKET, never a duration. A millisecond count says when somebody was
      -- at their desk and how fast they read; three coarse buckets answer "was
      -- this quick?" and answer nothing else.
      perform private.require_product_event_enum(p_properties, 'resolutionBucket', array['under_5s', 'under_60s', 'over_60s']);
  end case;
end;
$$;

-- The validator must agree with the constraint. Ordered AFTER the
-- re-declaration, never before -- the same ordering defect `202608080085`
-- carried in its first draft, where the check ran against the old function and
-- aborted the migration it existed to protect.
do $$
declare
  body text;
begin
  select pg_get_functiondef(oid)
    into body
    from pg_proc
   where proname = 'validate_product_event_properties'
     and pronamespace = 'private'::regnamespace
   limit 1;

  if body is null then
    raise exception 'private.validate_product_event_properties is absent';
  end if;

  if position('capture_mode_selected' in body) = 0
     or position('voice_transcription_finished' in body) = 0
     or position('attention_item_resolved' in body) = 0 then
    raise exception 'the property validator does not know the three Phase 2J events';
  end if;

  if position('task_command_undone' in body) = 0 then
    raise exception 'the property validator lost a pre-existing event during re-declaration';
  end if;
end $$;
