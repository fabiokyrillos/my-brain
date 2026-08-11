-- Phase 2M, slice 2M.1 -- MIGRATION 1 OF TWO. The daily-cycle telemetry
-- vocabulary and the `calendar` surface.
--
-- THE FIRST OF THE TWO MIGRATIONS THIS PHASE IS AUTHORIZED TO SPEND
--
-- ADR-105 allocates `2 · NON-TRANSFERABLE`. This is number one: the event-name
-- CHECK, `private.validate_product_event_properties` and the surface CHECK,
-- widened together in one file. Number two is notification consent,
-- subscription and delivery, in slice 2M.4b, and it may not carry vocabulary.
-- A THIRD IS A STOP CONDITION, not a judgement call.
--
-- IT LANDS BEFORE ANY PRODUCER EXISTS, AND THAT ORDERING IS THE POINT
--
-- `202608080087` and `202608090089` are both extraordinary post-phase
-- corrections and both fixed the same defect from the opposite end: the
-- application declared a vocabulary the deployed database did not admit, every
-- emission was refused `22023` at the last real write path, inside producers
-- that wrap emission in `.catch(() => {})` -- and Phase 2K therefore reached
-- closeout with its telemetry entirely inert. `2M-METRICS-001` makes the
-- ordering a rule, and `src/lib/closeout/phase-2m-telemetry-guard.test.ts`
-- fails the build on a producer naming a name the chain does not admit.
--
-- So this migration ships with the application vocabulary and WITH NO PRODUCER.
-- The calendar surface, the planner, the review flow and the notification
-- settings arrive in later pull requests, after this one is merged, applied,
-- deployed and parity-verified.
--
-- THE QUESTIONS, STATED BEFORE THE NAMES
--
-- `2M-METRICS-005` refuses an event that answers no declared question, and
-- `2M-METRICS-003` refuses one no reader asks a question of. The four questions
-- this phase records, written down before a single name was chosen:
--
--   Q1. Is the calendar reached at all, and in which orientation?
--       -> `calendar_viewed`
--   Q2. How often is a plan made -- set or cleared, one item or many?
--       -> `day_planned`
--   Q3. How often does a review produce an action, and which action?
--       -> `day_review_opened` (the denominator) and
--          `day_review_action_applied` (the numerator)
--   Q4. How often is a notification silenced, and by which control? And do
--       people opt in and then revoke?
--       -> `notification_suppressed` and `notification_consent_changed`
--
-- Their single consumer is `scripts/phase-2m-daily-cycle-funnel.mjs`, read by
-- `scripts/phase-2m-daily-cycle-funnel-reader.mjs` through the owner's own
-- authenticated session. Six names, six answers, one reader. A seventh name
-- nothing reads would be SH.6's failure wearing this phase's label.
--
-- WHY ONE NEW SURFACE AND NOT TWO
--
-- OD-2M-2 signed `calendar` as its own surface rather than a fold into `work`,
-- and named exactly that one. The calendar, the daily planner and the day
-- review all live under `/app/calendar`, so all three attribute to it honestly.
-- The two notification events are emitted by the SERVER -- the Server Action
-- that writes a consent row, and the sender that decides not to send -- so they
-- carry `server`, which has been the attribution for server-emitted events
-- since `202607170024` (`src/features/agent/actions.ts:395`). Inventing a
-- `notifications` surface for an event no browser surface emits would be a
-- vocabulary entry that lies about where the event happened.
--
-- WHY THE PROPERTIES ARE SHAPED THE WAY THEY ARE
--
-- `2M-METRICS-004` refuses a key that could hold a title, a description, a
-- name, A DATE THE USER CHOSE, A TIME THE USER CHOSE, review text or any
-- free-form value. Every key below is a closed enum or a bounded integer.
--
-- There is deliberately NO DATE ANYWHERE. A calendar phase is exactly where a
-- `plannedDate` or an `anchorDate` property would feel harmless and would be a
-- behavioural fingerprint -- it says which days somebody works and which they
-- protect. `day_planned` records that a plan was made and how many items it
-- touched; it does not record which day.
--
-- WHY THE FUNCTION IS RE-DECLARED WHOLE
--
-- Postgres cannot extend a `case` arm in place, which is this repository's
-- established convention (`202607280061`, `202608060078`, `202608070081`,
-- `202608080086`, `202608090088`). The diff against `202608090088` is exactly
-- the lines these six events add -- and this file was ASSEMBLED from that
-- migration's own text rather than retyped, because a hand-copy of 280 lines is
-- how a pre-existing arm gets silently dropped.

-- ---------------------------------------------------------------------------
-- 1. The event-name vocabulary.
-- ---------------------------------------------------------------------------

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
    'capture_mode_selected',
    'voice_transcription_finished',
    'attention_item_resolved',
    'conversation_answer_shown',
    'conversation_memory_resolved',
    'conversation_suggestion_shown',
    -- Phase 2M slice 2M.1. Six, and the count is the point again: each answers
    -- one of the four questions declared at the head of this file, and all six
    -- are read by `scripts/phase-2m-daily-cycle-funnel.mjs`.
    'calendar_viewed',
    'day_planned',
    'day_review_opened',
    'day_review_action_applied',
    'notification_consent_changed',
    'notification_suppressed'
  ));

-- `drop constraint if exists` is fail-open. If the constraint's name were ever
-- not what this assumes, the DROP would no-op, the ADD would succeed under a
-- free name, the old vocabulary would survive, and every new event would fail
-- at a call site that wraps emission in `.catch(() => {})` -- silently, which
-- is exactly how SH.6's defect stayed invisible.
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

  if position('calendar_viewed' in definition) = 0
     or position('day_planned' in definition) = 0
     or position('day_review_opened' in definition) = 0
     or position('day_review_action_applied' in definition) = 0
     or position('notification_consent_changed' in definition) = 0
     or position('notification_suppressed' in definition) = 0 then
    raise exception 'the product_events vocabulary was not widened: %', definition;
  end if;

  -- Every pre-existing name must survive. A swap that widened the vocabulary by
  -- replacing it would pass the check above.
  if position('rate_limit_refused' in definition) = 0
     or position('capture_started' in definition) = 0
     or position('task_command_undone' in definition) = 0
     or position('attention_item_resolved' in definition) = 0
     or position('voice_transcription_finished' in definition) = 0
     or position('conversation_answer_shown' in definition) = 0
     or position('conversation_memory_resolved' in definition) = 0
     or position('conversation_suggestion_shown' in definition) = 0 then
    raise exception 'the product_events vocabulary lost a pre-existing name: %', definition;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The property validator -- the key whitelist, which IS the privacy
--    mechanism, and the per-key value checks.
-- ---------------------------------------------------------------------------

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
    -- Phase 2K slice 2K.8. The key whitelist is the privacy mechanism, exactly
    -- as it is above: there is no key here that could hold a question, an
    -- answer, a source excerpt, a person's name or a project's name. So
    -- `2K-METRICS-002` holds because the payload has nowhere to put text --
    -- not because writers promise not to send any.
    when 'conversation_answer_shown' then
      allowed_keys := array['evidence', 'explained'];
    when 'conversation_memory_resolved' then
      allowed_keys := array['outcome'];
    when 'conversation_suggestion_shown' then
      allowed_keys := array['category'];
    -- Phase 2M slice 2M.1. Same mechanism, one field further: there is no key
    -- here that could hold a task title, a reminder title, a review's text, a
    -- person, a project -- OR A DATE OR A TIME THE USER CHOSE, which is the
    -- shape a calendar phase would reach for first and the shape
    -- `2M-METRICS-004` names explicitly.
    when 'calendar_viewed' then
      allowed_keys := array['orientation'];
    when 'day_planned' then
      allowed_keys := array['operation', 'itemCount'];
    when 'day_review_opened' then
      allowed_keys := array['scope'];
    when 'day_review_action_applied' then
      allowed_keys := array['scope', 'actionKind'];
    when 'notification_consent_changed' then
      allowed_keys := array['channel', 'state'];
    when 'notification_suppressed' then
      allowed_keys := array['channel', 'reason'];
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
    -- Phase 2K slice 2K.8.
    when 'conversation_answer_shown' then
      -- The envelope's own three-value state, never a count. Slice 2K.0
      -- measured that an empty citation array is produced BOTH by "nothing was
      -- retrieved" AND by "retrieved and the model cited none", so a count here
      -- would report the wrong fact half the time. `unknown` is the honest
      -- value for a message written before the envelope existed.
      perform private.require_product_event_enum(p_properties, 'evidence', array['evidenced', 'no_qualifying_evidence', 'unknown']);
      -- A BOOLEAN BY EXISTENCE: whether anything was excluded at all, never how
      -- much. T-2K-04 records that a rate is a count over repeated queries, so
      -- the disclosure reaching the ledger is bounded exactly as the one
      -- reaching the user is.
      perform private.require_product_event_boolean(p_properties, 'explained');
    when 'conversation_memory_resolved' then
      -- `undone` is the ARCHIVAL undo (OD-2K-3). The vocabulary says `undone`
      -- and never `deleted`, for the same reason the copy does: the row
      -- survives, and a ledger that said otherwise would be the comfortable lie
      -- the decision exists to forbid.
      perform private.require_product_event_enum(p_properties, 'outcome', array['accepted', 'no_change', 'failed', 'undone']);
    when 'conversation_suggestion_shown' then
      -- The category and NOTHING else. OD-2K-4 permits a suggestion to name a
      -- person or project on screen and forbids that name from ever entering
      -- telemetry; this array is the enforcement, and `hasExactKeys` above is
      -- what stops a name arriving under another key.
      perform private.require_product_event_enum(p_properties, 'category', array['person', 'project']);
    -- Phase 2M slice 2M.1.
    when 'calendar_viewed' then
      -- Q1. The three orientations `2M-CAL-007` declares, and nothing else.
      -- Not the anchor date, not the visible lanes, not the item count: a
      -- calendar's anchor date is the single most fingerprinting value this
      -- phase could record, and it answers no declared question.
      perform private.require_product_event_enum(p_properties, 'orientation', array['day', 'week', 'agenda']);
    when 'day_planned' then
      -- Q2. Whether an intention was set or removed, and how many items one
      -- action touched. `cleared` exists because `2M-PLAN-002` closes the
      -- `clear_planned` asymmetry, and a funnel that could not see a removal
      -- would report planning as monotonic when it is not.
      perform private.require_product_event_enum(p_properties, 'operation', array['set', 'cleared']);
      -- Bounded by OD-2L-4's selection ceiling of 50. One is the single-item
      -- case; the ceiling is the bulk case's maximum. A count of affected items
      -- is not a date and identifies nothing.
      perform private.require_product_event_integer(p_properties, 'itemCount', 1, 50);
    when 'day_review_opened' then
      -- Q3, denominator. `2M-REVIEW-001` and `-002` are two flows, and the
      -- question is asked of each separately -- a next-day review that never
      -- produces an action is a different fact from a daily one that does not.
      perform private.require_product_event_enum(p_properties, 'scope', array['day', 'next_day']);
    when 'day_review_action_applied' then
      -- Q3, numerator. The five operations `2M-REVIEW-003` enumerates, by the
      -- names the requirement uses, so the funnel and the requirement cannot
      -- drift apart.
      perform private.require_product_event_enum(p_properties, 'scope', array['day', 'next_day']);
      perform private.require_product_event_enum(p_properties, 'actionKind', array[
        'carry_forward', 'reschedule', 'plan', 'archive', 'follow_up'
      ]);
    when 'notification_consent_changed' then
      -- Q4. A closed enum of one for the channel, for the reason
      -- `rate_limit_refused.failureKind` is: `push` is the name of THIS
      -- control, and widening it later would mean the event had started
      -- reporting a different one. `2M-NOTIFY-005` requires the governance
      -- controls proved PER CHANNEL rather than inherited, and a channel-less
      -- event could not support that reading.
      perform private.require_product_event_enum(p_properties, 'channel', array['push']);
      -- `2M-NOTIFY-010`'s five distinguishable states, exactly. `expired` is
      -- recorded here rather than as a suppression reason: a subscription that
      -- expired is a consent-state transition, and recording it twice would
      -- make the funnel's numerator and denominator disagree.
      perform private.require_product_event_enum(p_properties, 'state', array[
        'granted', 'denied', 'revoked', 'unsupported', 'expired'
      ]);
    when 'notification_suppressed' then
      perform private.require_product_event_enum(p_properties, 'channel', array['push']);
      -- The six controls that can decide not to send, named individually.
      -- "Silenced" is not one number: a user who set quiet hours and a user who
      -- hit the daily cap have said different things, and `2M-NOTIFY-004`'s
      -- claim that every control has a consumer is only checkable if the ledger
      -- can tell them apart.
      perform private.require_product_event_enum(p_properties, 'reason', array[
        'quiet_hours', 'daily_cap', 'cooldown', 'duplicate', 'not_consented', 'type_muted'
      ]);
  end case;
end;
$$;

-- The validator must agree with the constraint. Ordered AFTER the
-- re-declaration, never before -- the ordering defect `202608080085` carried in
-- its first draft, where the check ran against the old function and aborted the
-- migration it existed to protect.
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

  if position('calendar_viewed' in body) = 0
     or position('day_planned' in body) = 0
     or position('day_review_opened' in body) = 0
     or position('day_review_action_applied' in body) = 0
     or position('notification_consent_changed' in body) = 0
     or position('notification_suppressed' in body) = 0 then
    raise exception 'the property validator does not know the six Phase 2M events';
  end if;

  if position('task_command_undone' in body) = 0
     or position('attention_item_resolved' in body) = 0
     or position('rate_limit_refused' in body) = 0
     or position('conversation_answer_shown' in body) = 0
     or position('conversation_suggestion_shown' in body) = 0 then
    raise exception 'the property validator lost a pre-existing event during re-declaration';
  end if;
end $$;

-- `2M-METRICS-002`, and the check that caught `202608080087`'s defect a phase
-- late: the two live gates must name the SAME vocabulary.
--
-- Asserted name-by-name from the constraint rather than from a list written
-- here, so this cannot pass by comparing a hardcoded set against itself. It
-- REFUSES TO RUN VACUOUSLY: an empty or implausibly short extraction raises
-- rather than reporting agreement.
do $$
declare
  definition text;
  body text;
  declared text[];
  name text;
  missing text[] := array[]::text[];
begin
  select pg_get_constraintdef(oid) into definition
    from pg_constraint
   where conname = 'product_events_event_name_check'
     and conrelid = 'public.product_events'::regclass;

  select pg_get_functiondef(oid) into body
    from pg_proc
   where proname = 'validate_product_event_properties'
     and pronamespace = 'private'::regnamespace
   limit 1;

  select array_agg(distinct match[1])
    into declared
    from regexp_matches(definition, '''([a-z_]+)''', 'g') as match;

  if declared is null or array_length(declared, 1) < 36 then
    raise exception 'refusing to run vacuously: extracted % names from the CHECK',
      coalesce(array_length(declared, 1), 0);
  end if;

  foreach name in array declared loop
    if position('''' || name || '''' in body) = 0 then
      missing := missing || name;
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception 'the CHECK declares names the validator does not know: %', missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The surface vocabulary. OD-2M-2 signed `calendar` as its own.
--
-- `product_events_surface_check` has been the ONLY declaration of this
-- vocabulary since `202608090089` deleted the writer's copy. That is why this
-- widening is one constraint rather than two places, and section 4 asserts the
-- property still holds afterwards.
-- ---------------------------------------------------------------------------

alter table public.product_events
  drop constraint if exists product_events_surface_check;

alter table public.product_events
  add constraint product_events_surface_check check (surface in (
    'home',
    'capture',
    'inbox',
    'needs_attention',
    'interpretation_review',
    'technical_details',
    'work',
    'questions',
    'server',
    'task_command',
    'conversation',
    -- Phase 2M slice 2M.1, OD-2M-2. Its own surface rather than a fold into
    -- `work`: OD-2L-2 A keeps Work at exactly three views, so a calendar
    -- attributed to `work` would make "did anyone open the calendar"
    -- unanswerable from the ledger AND would describe it as a Work view, which
    -- is the thing that decision refused.
    --
    -- The daily planner and the day review are sub-routes of `/app/calendar`
    -- and attribute here too. The notification events are emitted by the
    -- server and carry `server`.
    'calendar'
  ));

do $$
declare
  definition text;
begin
  select pg_get_constraintdef(oid) into definition
    from pg_constraint
   where conname = 'product_events_surface_check'
     and conrelid = 'public.product_events'::regclass;

  if definition is null then
    raise exception 'product_events_surface_check is absent after the swap';
  end if;
  if position('calendar' in definition) = 0 then
    raise exception 'the surface vocabulary was not widened: %', definition;
  end if;
  -- Every pre-existing surface must survive. A swap that widened by replacing
  -- would pass the check above.
  if position('conversation' in definition) = 0
     or position('task_command' in definition) = 0
     or position('needs_attention' in definition) = 0
     or position('interpretation_review' in definition) = 0
     or position('home' in definition) = 0
     or position('server' in definition) = 0 then
    raise exception 'the surface vocabulary lost a pre-existing name: %', definition;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The writer is NOT re-declared, and that is the assertion.
--
-- `202608080087` deleted its event-name copy and `202608090089` deleted its
-- surface copy. This migration widens both vocabularies WITHOUT touching
-- `private.record_product_event`, which is only possible because those two
-- corrections were made. Asserting it here is what stops the next widening from
-- quietly reintroducing a copy "for symmetry".
-- ---------------------------------------------------------------------------

do $$
declare
  recorder_body text;
  definition text;
  declared text[];
  name text;
  leaked text[] := array[]::text[];
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

  -- No event-name copy.
  if position('task_command_undone' in recorder_body) > 0
     or position('capture_started' in recorder_body) > 0
     or position('calendar_viewed' in recorder_body) > 0
     or position('notification_suppressed' in recorder_body) > 0 then
    raise exception 'private.record_product_event enumerates event names again';
  end if;

  -- No surface copy -- checked name-by-name from the catalog, and refusing to
  -- run vacuously.
  select pg_get_constraintdef(oid) into definition
    from pg_constraint
   where conname = 'product_events_surface_check'
     and conrelid = 'public.product_events'::regclass;

  select array_agg(distinct match[1]) into declared
    from regexp_matches(definition, '''([a-z_]+)''', 'g') as match;

  if declared is null or array_length(declared, 1) < 12 then
    raise exception 'refusing to run vacuously: extracted % surfaces from the CHECK',
      coalesce(array_length(declared, 1), 0);
  end if;

  foreach name in array declared loop
    if position('''' || name || '''' in recorder_body) > 0 then
      leaked := leaked || name;
    end if;
  end loop;

  if array_length(leaked, 1) > 0 then
    raise exception 'the writer names declared surfaces again: %', leaked;
  end if;

  -- Everything the writer is FOR must have survived. A migration that satisfied
  -- the checks above by emptying the function would pass them all.
  if position('validate_product_event_properties' in recorder_body) = 0 then
    raise exception 'the writer no longer validates event properties';
  end if;
  if position('assert_product_event_subject_owner' in recorder_body) = 0 then
    raise exception 'the writer no longer asserts subject ownership';
  end if;
  if position('Unsupported product locale' in recorder_body) = 0
     or position('Unsupported viewport class' in recorder_body) = 0
     or position('Invalid application version' in recorder_body) = 0
     or position('Product event idempotency and synthetic flags are required' in recorder_body) = 0 then
    raise exception 'the writer lost one of its non-vocabulary guards';
  end if;
  if position('Unsupported product surface' in recorder_body) = 0
     or position('product_events_surface_check' in recorder_body) = 0 then
    raise exception 'the writer no longer translates a surface violation into its documented refusal';
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

-- ---------------------------------------------------------------------------
-- 5. RLS, grants and the table's posture are untouched by this migration, and
--    that is asserted rather than assumed. A vocabulary widening that also
--    loosened who can read the ledger would be a privacy change wearing a
--    telemetry label.
-- ---------------------------------------------------------------------------

do $$
declare
  policy_count int;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.product_events'::regclass) then
    raise exception 'product_events lost row-level security';
  end if;
  if not (select relforcerowsecurity from pg_class where oid = 'public.product_events'::regclass) then
    raise exception 'product_events lost forced row-level security';
  end if;

  select count(*) into policy_count
    from pg_policies
   where schemaname = 'public' and tablename = 'product_events';
  if policy_count = 0 then
    raise exception 'product_events has no policy left';
  end if;

  -- The ledger is append-only to its owner and unreadable to `service_role`:
  -- neither may have gained a privilege here.
  if has_table_privilege('service_role', 'public.product_events', 'select') then
    raise exception 'service_role gained SELECT on product_events';
  end if;
  if has_table_privilege('service_role', 'public.product_events', 'delete') then
    raise exception 'service_role gained DELETE on product_events';
  end if;
  if has_table_privilege('authenticated', 'public.product_events', 'update')
     or has_table_privilege('authenticated', 'public.product_events', 'delete') then
    raise exception 'the append-only ledger became mutable to authenticated';
  end if;
end $$;
