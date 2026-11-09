-- Life Brain B.8 -- the model picks the day's suggestions; the sentence stays ours.
--
-- WHO AUTHORIZED IT
--
-- ADR-161 Decision 4 approved model-picked suggestions in principle and left
-- four questions. The owner answered them on 9 November 2026 by accepting the
-- recommendations, and authorized ONE migration for this slice: the per-day
-- cache and the telemetry `source` property, together. ADR-163 records it. It
-- is the whole of the authorization; a second migration is a stop condition.
--
-- WHAT THE CACHE HOLDS, AND WHAT IT CANNOT
--
-- One row per person. `picks` is at most three `{category, id}` pairs: a
-- category from the eight the derivation knows, and the id of a row the
-- derivation offered as a candidate. It holds NO TEXT. The sentence a chip shows
-- is still built from `copy.byCategory` at render time, from the row's current
-- name, so a model can choose which of the owner's own rows to suggest but can
-- never write a word the owner sees. The CHECK below and the writer's
-- validation hold that shape in the database, not only in TypeScript.
--
-- The row is overwritten when the day changes, so the table holds one row per
-- person and does not grow. It goes with the account (`on delete cascade`).
--
-- WHY A WRITER FUNCTION AND NOT A GRANT
--
-- `authenticated` may read its own row and nothing else. Writes go through
-- `public.record_conversation_suggestion_picks`, which takes the caller from
-- `auth.uid()`, never from an argument, and re-validates the payload. That is
-- the repository's convention for every user-owned table a server path writes.
--
-- THE TELEMETRY PROPERTY
--
-- `conversation_suggestion_shown` gains an optional `source`: `derived` or
-- `model`. Optional because the application deployed before this file sends
-- `{category}` alone and must keep recording. It names nothing. This file lands
-- BEFORE the producer that sends it (ADR-161 Decision 1, `2M-METRICS-001`).
--
-- WHY THE VALIDATOR IS RE-DECLARED WHOLE
--
-- Postgres cannot extend a `case` arm in place. The function below was
-- ASSEMBLED from `202611060108`'s own text, and the diff against it is exactly
-- the suggestion arm. The verification blocks at the end assert that no other
-- arm was lost.

create table public.conversation_suggestion_picks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  local_day date not null,
  picks jsonb not null,
  model text not null check (char_length(model) between 1 and 120),
  prompt_version text not null check (char_length(prompt_version) between 1 and 40),
  created_at timestamptz not null default now(),
  constraint conversation_suggestion_picks_shape_check check (
    jsonb_typeof(picks) = 'array' and jsonb_array_length(picks) between 0 and 3
  )
);

comment on table public.conversation_suggestion_picks is
  'Life Brain B.8: the model''s pick of today''s conversation suggestions, one row per person, overwritten daily. {category, id} pairs only; no text.';

alter table public.conversation_suggestion_picks enable row level security;
alter table public.conversation_suggestion_picks force row level security;

create policy conversation_suggestion_picks_select_own on public.conversation_suggestion_picks
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.conversation_suggestion_picks from public, anon, authenticated, service_role;
grant select on table public.conversation_suggestion_picks to authenticated;

create or replace function public.record_conversation_suggestion_picks(
  p_local_day date,
  p_picks jsonb,
  p_model text,
  p_prompt_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  pick jsonb;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_local_day is null or p_picks is null or jsonb_typeof(p_picks) <> 'array' then
    raise exception 'Invalid suggestion picks' using errcode = '22023';
  end if;

  if jsonb_array_length(p_picks) > 3 then
    raise exception 'Invalid suggestion picks' using errcode = '22023';
  end if;

  -- Each pick is exactly {category, id}: a known category and a uuid. Any other
  -- key -- a sentence, a name, a reason -- is refused, so the cache can never
  -- become a channel for model text.
  for pick in select value from jsonb_array_elements(p_picks) loop
    if jsonb_typeof(pick) <> 'object'
       or (select count(*) from jsonb_object_keys(pick)) <> 2
       or not (pick ? 'category' and pick ? 'id')
       or jsonb_typeof(pick -> 'category') <> 'string'
       or jsonb_typeof(pick -> 'id') <> 'string'
       or not ((pick ->> 'category') = any (array[
         'overdue_task', 'due_today', 'reminder_soon', 'birthday_soon',
         'open_question', 'unreviewed_entry', 'person', 'project'
       ]))
       or (pick ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid suggestion picks' using errcode = '22023';
    end if;
  end loop;

  insert into public.conversation_suggestion_picks as existing
    (user_id, local_day, picks, model, prompt_version, created_at)
  values
    (caller, p_local_day, p_picks, p_model, p_prompt_version, now())
  on conflict (user_id) do update
    set local_day = excluded.local_day,
        picks = excluded.picks,
        model = excluded.model,
        prompt_version = excluded.prompt_version,
        created_at = excluded.created_at;
end;
$$;

revoke all on function public.record_conversation_suggestion_picks(date, jsonb, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_conversation_suggestion_picks(date, jsonb, text, text)
  to authenticated;

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
      -- Life Brain B.8 (ADR-163): `source` says whether the model or the date
      -- rules chose the suggestion. Two words, naming nothing.
      allowed_keys := array['category', 'source'];
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
      -- Life Brain B.7. EIGHT names now, and the six new ones are the reason
      -- this file exists: the derivation showed six dated categories on screen
      -- and this array admitted two, so every dated emission was refused
      -- `22023` at the write path -- inside a producer that wraps emission in
      -- `.catch(() => {})`. Silent, which is exactly how `202608080087` and
      -- `202608090089` happened.
      --
      -- OD-2K-4 permits a suggestion to NAME a person, a project, a task or a
      -- reminder on screen and forbids that name from ever entering telemetry.
      -- This array and `hasExactKeys` are that prohibition: a category is a
      -- closed word chosen from eight, the key whitelist above admits
      -- `category` and nothing else, and there is therefore nowhere in the
      -- payload for a title to travel.
      --
      -- WHAT A DATED CATEGORY DISCLOSES, SAID PLAINLY
      --
      -- `person` and `project` disclose that the account has one. The six added
      -- here disclose a STATE: that something was overdue, due today, coming up,
      -- unanswered or unreviewed when the surface rendered. That is the fact the
      -- funnel has to know to answer whether the suggestions were worth showing,
      -- it is bounded by the eight words below, and it names nothing. The
      -- SUBJECT never reaches here -- a `highly_sensitive` row is dropped from
      -- the derivation before it can be shown, so it is never counted either.
      --
      -- The order is `SUGGESTION_CATEGORIES`'s own, which is the derivation's
      -- precedence order, so the two vocabularies read the same way round.
      perform private.require_product_event_enum(p_properties, 'category', array[
        'overdue_task', 'due_today', 'reminder_soon', 'birthday_soon',
        'open_question', 'unreviewed_entry', 'person', 'project'
      ]);
      -- Optional: the application deployed before B.8 sends `{category}` alone
      -- and must keep recording. When present, a closed two-word enum.
      if p_properties ? 'source' then
        perform private.require_product_event_enum(p_properties, 'source', array['derived', 'model']);
      end if;
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
-- The eight names must be IN the function, and the function must still know
-- every event it knew before. Ordered AFTER the re-declaration, never before --
-- the ordering defect `202608080085` carried in its first draft, where the
-- check ran against the old function and aborted the migration it existed to
-- protect.
do $$
declare
  body text;
  arm text;
  at integer;
  admitted text[];
  expected text[] := array[
    'overdue_task', 'due_today', 'reminder_soon', 'birthday_soon',
    'open_question', 'unreviewed_entry', 'person', 'project'
  ];
  name text;
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

  -- THIS ARM'S ARRAY, bounded at both ends, and both bounds matter.
  --
  -- The left bound, because `'person'` and `'project'` appear in other arms of
  -- this chain, so a whole-body `position()` would report agreement for a
  -- widening that never happened.
  --
  -- The right bound, because the arm's array is followed immediately by
  -- `when 'calendar_viewed' then` and its comment: a fixed-width window reaches
  -- into them and counts a ninth name, which is a VERIFICATION BLOCK ABORTING
  -- A CORRECT MIGRATION. A first draft of this file did exactly that.
  at := position('require_product_event_enum(p_properties, ''category''' in body);
  if at = 0 then
    raise exception 'refusing to run vacuously: the category enum call is absent from the validator';
  end if;
  arm := substring(body from at);

  at := position('array[' in arm);
  if at = 0 then
    raise exception 'the category enum does not take an array literal: %', left(arm, 120);
  end if;
  arm := substring(arm from at);

  at := position(']' in arm);
  if at = 0 then
    raise exception 'the category array is unterminated: %', left(arm, 120);
  end if;
  arm := left(arm, at);

  select array_agg(match[1])
    into admitted
    from regexp_matches(arm, '''([a-z_]+)''', 'g') as match;

  if admitted is null or array_length(admitted, 1) <> 8 then
    raise exception 'the category enum admits % names, expected 8: %',
      coalesce(array_length(admitted, 1), 0), admitted;
  end if;

  foreach name in array expected loop
    if not (name = any(admitted)) then
      raise exception 'the category enum does not admit %: %', name, admitted;
    end if;
  end loop;

  -- Pre-existing events must survive a whole re-declaration. These five span
  -- the four phases that wrote arms before this one.
  if position('rate_limit_refused' in body) = 0
     or position('task_command_undone' in body) = 0
     or position('attention_item_resolved' in body) = 0
     or position('conversation_answer_shown' in body) = 0
     or position('notification_suppressed' in body) = 0 then
    raise exception 'the property validator lost a pre-existing event during re-declaration';
  end if;
end $$;

-- `2M-METRICS-002`, and the check that caught `202608080087`'s defect a phase
-- late: the two live gates must name the SAME vocabulary. A re-declaration that
-- dropped a `when` arm the CHECK still declares is the exact failure, and it
-- would otherwise be invisible until the first refused emission.
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

  if declared is null or array_length(declared, 1) < 39 then
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

-- B.8's own checks, after the re-declaration: the `source` arm is present and
-- closed, the cache table is owner-only, and the writer cannot be reached by
-- `anon`. Each refuses to run vacuously.
do $$
declare
  body text;
  arm text;
  at integer;
begin
  select pg_get_functiondef(oid) into body
    from pg_proc
   where proname = 'validate_product_event_properties'
     and pronamespace = 'private'::regnamespace
   limit 1;

  if position('array[''category'', ''source'']' in body) = 0 then
    raise exception 'conversation_suggestion_shown does not admit the source key';
  end if;

  at := position('require_product_event_enum(p_properties, ''source''' in body);
  if at = 0 then
    raise exception 'the source enum call is absent from the validator';
  end if;
  arm := substring(body from at for 120);
  if position('''derived''' in arm) = 0 or position('''model''' in arm) = 0 then
    raise exception 'the source enum does not admit derived and model: %', arm;
  end if;

  if not exists (
    select 1 from pg_class
     where oid = 'public.conversation_suggestion_picks'::regclass
       and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'conversation_suggestion_picks must have forced row level security';
  end if;

  if has_table_privilege('authenticated', 'public.conversation_suggestion_picks', 'INSERT')
     or has_table_privilege('authenticated', 'public.conversation_suggestion_picks', 'UPDATE')
     or has_table_privilege('authenticated', 'public.conversation_suggestion_picks', 'DELETE')
     or has_table_privilege('anon', 'public.conversation_suggestion_picks', 'SELECT') then
    raise exception 'conversation_suggestion_picks grants more than an owner read';
  end if;

  if has_function_privilege('anon', 'public.record_conversation_suggestion_picks(date, jsonb, text, text)', 'EXECUTE') then
    raise exception 'anon can execute record_conversation_suggestion_picks';
  end if;
end $$;
