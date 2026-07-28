-- Phase 2E Slice 2E.7 — the command surface and its four product events.
--
-- PRD 2E-ANALYTICS-005: "Phase 2E adds its command surface value to all three
-- surface allowlists — `productSurfaces`, the `product_events` surface CHECK,
-- and the `p_surface` guard inside `record_product_event` — in the same
-- migration and commit as the first emitting code, with regenerated types."
-- Slice 2E.7 is that first emitting code, so all three move here, together.
--
-- Four event names arrive with it. They are chosen against PRD §18's questions
-- rather than against the code that happens to exist:
--
--   * `task_command_previewed`   — how often did a command match in one step,
--                                  go ambiguous, or match nothing at all?
--   * `task_command_disambiguated` — how often did the user's selection differ
--                                  from the top-ranked candidate?
--   * `task_command_applied`     — how often did a preview go stale, produce
--                                  `no_change`, or get refused?
--   * `task_command_undone`      — how often was an applied change reversed?
--
-- **Every band literal below is permanent.** 2E-ANALYTICS-002 required the band
-- vocabulary to be settled in the PRD-governed policy module before it reached
-- a CHECK constraint, and it was: `TASK_MATCH_SCORE_BANDS`
-- (`src/features/task-commands/match-policy.ts:179`) has held
-- `none/low/medium/high` since Slice 2E.2. The same is true of the outcome
-- vocabulary (`outcomes.ts:24`, PRD 2E-UX-001's twelve) and the evidence
-- vocabulary (`match-policy.ts:152`, 2E-MATCH-014's ten). Nothing here invents
-- a literal; every list is a transcription of one TypeScript already declares
-- and `contracts.test.ts` pins by exact equality.
--
-- **Content-free, enforced rather than intended.** 2E-ANALYTICS-001 bounds a
-- Phase 2E payload to seven categories, and every property validated below is
-- one of: a closed enum, a bounded integer, a boolean, a bounded subset of a
-- closed enum, or the policy version string. There is no free-text property on
-- any of the four events, so 2E-ANALYTICS-003's "no raw title, description,
-- command text, prompt, or entity id" is a property of the CHECK rather than of
-- the caller's good behaviour.
--
-- `private.validate_product_event_properties` and
-- `private.record_product_event` are re-declared **in full** from their current
-- bodies at `202607230050:1061-1197` and `202607230050:1201-1281`, because
-- `create or replace` replaces the whole body and a partial paste would silently
-- retire every branch it omitted. The surface CHECK is re-declared from
-- `202607230049:58-71` and the event-name CHECK from `202607230050:1032-1059`.
--
-- Generated types are unaffected: `surface`, `event_name` and `properties` are
-- `text`/`jsonb`, so their CHECK literals never appear in
-- `src/lib/supabase/database.types.ts`. The two private functions have all
-- grants revoked and are not in the exposed schema.
--
-- Rollback: stop routing to the `task_command` surface. No applied migration is
-- reverted, and no row written under the new literals becomes invalid —
-- narrowing a CHECK would fail against existing rows, which is why PRD §21
-- defines rollback as "stop routing to the new surface".

-- ---------------------------------------------------------------------------
-- 1. The surface allowlist, on the table.
-- ---------------------------------------------------------------------------

alter table public.product_events
  drop constraint product_events_surface_check;

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
    -- Slice 2E.7. The command console is its own surface rather than a fold
    -- into 'chat' or 'work': it mounts on both, and attributing it to either
    -- would make "how often is a command driven from the task surface" and
    -- "how often from chat" unanswerable. The distinction the console needs is
    -- carried as the `commandOrigin` property, which is a *category*, and the
    -- surface names the feature.
    'task_command'
  ));

-- ---------------------------------------------------------------------------
-- 2. The event-name allowlist, on the table.
-- ---------------------------------------------------------------------------

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
    'task_command_undone'
  ));

-- ---------------------------------------------------------------------------
-- 3. Three property validators the existing set does not cover.
-- ---------------------------------------------------------------------------

-- A boolean, checked as a *JSON* boolean rather than as a truthy value.
--
-- `require_product_event_enum` would accept the strings 'true'/'false', which
-- is a different type arriving under the same name — and 2E-ANALYTICS-001's
-- "one-step boolean" is a boolean. Written in the shape the two existing
-- helpers already use, down to the shared opaque message: a validator that
-- echoed the offending value would put a payload into a log line.
create or replace function private.require_product_event_boolean(
  p_properties jsonb,
  p_key text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (p_properties ? p_key) then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if jsonb_typeof(p_properties -> p_key) <> 'boolean' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_product_event_boolean(jsonb, text)
  from public, anon, authenticated, service_role;

-- A bounded array whose every member is drawn from a closed enum.
--
-- `signalCategories` is 2E-ANALYTICS-001's "signal categories": a subset of the
-- ten declared evidence labels. Validating it member-by-member is what keeps it
-- a set of *labels* — the alternative, accepting an array of text, is a
-- free-text property with extra steps, and the evidence label is the one place
-- a match could otherwise leak what it matched on.
--
-- Duplicates are refused as well as unknown members. The builder emits the
-- declared order without repeats, so a repeat means the payload did not come
-- from it.
create or replace function private.require_product_event_enum_array(
  p_properties jsonb,
  p_key text,
  p_allowed text[],
  p_maximum integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  member_count integer;
  distinct_count integer;
  unknown_member text;
begin
  if not (p_properties ? p_key) then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if jsonb_typeof(p_properties -> p_key) <> 'array' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  select count(*), count(distinct element)
  into member_count, distinct_count
  from jsonb_array_elements(p_properties -> p_key) as element;

  if member_count > p_maximum or member_count <> distinct_count then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  select element #>> '{}' into unknown_member
  from jsonb_array_elements(p_properties -> p_key) as element
  where jsonb_typeof(element) <> 'string' or not ((element #>> '{}') = any(p_allowed))
  limit 1;

  if found then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_product_event_enum_array(jsonb, text, text[], integer)
  from public, anon, authenticated, service_role;

-- The policy version, as a shape rather than as a literal.
--
-- 2E-ANALYTICS-001 requires the policy version on every Phase 2E event, and
-- §10.4 requires that version to be *bumped* whenever a weight, threshold,
-- margin or lexicon entry changes. Pinning today's value in a CHECK would make
-- every future bump a migration, and a forgotten one would reject live events;
-- pinning the shape keeps the constraint truthful across bumps while still
-- refusing free text. The pattern is `TASK_COMMAND_POLICY_VERSION`'s own
-- `YYYY-MM-DD.N` form (`taxonomy.ts:123`).
create or replace function private.require_product_event_policy_version(
  p_properties jsonb,
  p_key text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (p_properties ? p_key) then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if jsonb_typeof(p_properties -> p_key) <> 'string'
    or (p_properties ->> p_key) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_product_event_policy_version(jsonb, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The properties validator, re-declared in full from 202607230050:1061.
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
  end case;
end;
$$;

revoke all on function private.validate_product_event_properties(text, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The recorder, re-declared in full from 202607230050:1201.
-- ---------------------------------------------------------------------------

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
    'task_candidates_confirmed', 'question_answered_basic', 'question_resolved',
    'question_effect_previewed', 'question_reinterpret_applied',
    'processing_retry_requested',
    'work_view_viewed', 'task_status_changed', 'candidate_edit_started', 'candidate_edit_reset',
    'task_command_previewed', 'task_command_disambiguated', 'task_command_applied',
    'task_command_undone'
  ) then
    raise exception 'Unsupported product event' using errcode = '22023';
  end if;
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

revoke all on function private.record_product_event(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Post-deploy assertions.
-- ---------------------------------------------------------------------------
--
-- The pattern Slices 2E.5 and 2E.6 established, and which has caught a
-- deployment blocker in each of the last two slices: read the shipped catalog
-- back and refuse to finish if what landed is not what this file describes.
-- Every check below is one a partial paste or a stale `drop constraint` would
-- fail — which is the only failure mode of a `create or replace` that is
-- otherwise silent.

do $$
declare
  surface_definition text;
  event_definition text;
  validator_body text;
  recorder_body text;
  missing text;
begin
  select pg_get_constraintdef(oid) into surface_definition
  from pg_constraint
  where conrelid = 'public.product_events'::regclass
    and conname = 'product_events_surface_check';

  if surface_definition is null or surface_definition not like '%task_command%' then
    raise exception 'product_events_surface_check does not admit the task_command surface';
  end if;

  select pg_get_constraintdef(oid) into event_definition
  from pg_constraint
  where conrelid = 'public.product_events'::regclass
    and conname = 'product_events_event_name_check';

  if event_definition is null then
    raise exception 'product_events_event_name_check is missing';
  end if;

  foreach missing in array array[
    'task_command_previewed', 'task_command_disambiguated',
    'task_command_applied', 'task_command_undone'
  ] loop
    if event_definition not like '%' || missing || '%' then
      raise exception 'product_events_event_name_check does not admit %', missing;
    end if;
  end loop;

  -- The pre-existing twenty-two must survive the re-declaration. A CHECK that
  -- admits the four new names and dropped an old one would let this migration
  -- deploy and then reject live capture events.
  foreach missing in array array[
    'capture_started', 'capture_save_succeeded', 'capture_save_failed',
    'capture_processing_enqueued', 'capture_processing_completed', 'capture_processing_failed',
    'needs_attention_viewed', 'needs_attention_item_opened', 'interpretation_review_viewed',
    'interpretation_corrected', 'technical_details_opened', 'task_candidates_presented',
    'task_candidates_confirmed', 'question_answered_basic', 'question_resolved',
    'question_effect_previewed', 'question_reinterpret_applied', 'processing_retry_requested',
    'work_view_viewed', 'task_status_changed', 'candidate_edit_started', 'candidate_edit_reset'
  ] loop
    if event_definition not like '%' || missing || '%' then
      raise exception 'product_events_event_name_check lost the pre-existing event %', missing;
    end if;
  end loop;

  select pg_get_functiondef(oid) into validator_body
  from pg_proc
  where oid = 'private.validate_product_event_properties(text, jsonb)'::regprocedure;

  -- The four new branches, and one pre-existing branch from each of the two
  -- `case` statements, so a paste that kept the keys and lost the values (or
  -- the reverse) is caught rather than assumed impossible.
  foreach missing in array array[
    'task_command_previewed', 'task_command_disambiguated', 'task_command_applied',
    'task_command_undone', 'signalCategories', 'require_product_event_enum_array',
    'require_product_event_boolean', 'require_product_event_policy_version',
    'require_task_candidates_confirmed_edit_counts', 'attentionReason'
  ] loop
    if validator_body not like '%' || missing || '%' then
      raise exception 'validate_product_event_properties is missing %', missing;
    end if;
  end loop;

  select pg_get_functiondef(oid) into recorder_body
  from pg_proc
  where oid = 'private.record_product_event(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean)'::regprocedure;

  foreach missing in array array[
    'task_command_previewed', 'task_command_disambiguated', 'task_command_applied',
    'task_command_undone', 'task_command', 'assert_product_event_subject_owner'
  ] loop
    if recorder_body not like '%' || missing || '%' then
      raise exception 'record_product_event is missing %', missing;
    end if;
  end loop;

  -- Both private functions must remain unreachable to every client role.
  -- 2E-OWNERSHIP-003: no grant is widened, and a `create or replace` does not
  -- reset grants — but a future paste that used `create function` would.
  if has_function_privilege('authenticated', 'private.record_product_event(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean)', 'execute')
    or has_function_privilege('anon', 'private.record_product_event(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean)', 'execute')
    or has_function_privilege('authenticated', 'private.validate_product_event_properties(text, jsonb)', 'execute')
    or has_function_privilege('authenticated', 'private.require_product_event_enum_array(jsonb, text, text[], integer)', 'execute')
    or has_function_privilege('authenticated', 'private.require_product_event_boolean(jsonb, text)', 'execute')
    or has_function_privilege('authenticated', 'private.require_product_event_policy_version(jsonb, text)', 'execute') then
    raise exception 'a private product-event function is executable by a client role';
  end if;
end;
$$;
