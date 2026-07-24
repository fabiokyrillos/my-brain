-- Phase 2D Slice 2D.4 (hardening): deadlock avoidance for the confirmed
-- reinterpretation consequence.
--
-- Migration 202607230050 applied resolve_pending_question_v3, which — for the
-- 'reinterpret' consequence — locks the owned entry row and then calls
-- public.enqueue_entry_reprocessing, which itself takes a per-(user, entry)
-- advisory lock BEFORE locking the entry row. A concurrent manual retry
-- (retryProcessingJob -> enqueue_entry_reprocessing) holds that advisory lock
-- while it waits for the entry row, so the two paths could deadlock (each
-- holding what the other needs). PostgreSQL would abort one with 40P01 — a
-- prompt, retryable error, never the gateway-hanging 40001 — but the deadlock
-- is avoidable entirely.
--
-- This forward-only migration re-creates resolve_pending_question_v3 verbatim
-- except that, when a reinterpretation will actually be enqueued, it acquires
-- the identical advisory lock BEFORE the entry row lock. Both paths then take
-- the advisory lock first, so one waits instead of deadlocking. The advisory
-- key matches enqueue_entry_reprocessing byte-for-byte. Nothing else changes:
-- same signature, grants, security posture, closed contract, audit, undo, and
-- return shape. resolve_pending_question_v1/_v2 and undo_operation are
-- untouched. Append-only: migration 202607230050 is never edited.

create or replace function public.resolve_pending_question_v3(
  p_question_id uuid,
  p_resolution jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text;
  internal_operation_key text;
  resolution_kind text;
  result_resolution text;
  normalized_answer text;
  normalized_consequence text := 'none';
  consequence_status text := 'none';
  reprocess_operation_key text;
  reprocess_result jsonb;
  snoozed_until_value timestamptz;
  canonical_snoozed_until text;
  allowed_resolution_keys text[];
  question public.pending_questions%rowtype;
  owned_entry public.entries%rowtype;
  canonical_request jsonb;
  canonical_fingerprint text;
  reservation_state jsonb;
  undo_id uuid;
  existing_operation public.undo_operations%rowtype;
  affected integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'resolve-v3:' || normalized_key;

  -- Closed, discriminated resolution payload: the discriminant decides the
  -- exact permitted key set; anything else — unknown kind, unknown key,
  -- missing key, wrong type, oversized payload — rejects before any write.
  if pg_catalog.jsonb_typeof(p_resolution) is distinct from 'object'
    or pg_catalog.octet_length(p_resolution::text) > 32768
    or not (p_resolution ? 'kind')
    or pg_catalog.jsonb_typeof(p_resolution -> 'kind') is distinct from 'string'
  then
    raise exception 'Invalid resolution shape' using errcode = '22023';
  end if;
  resolution_kind := p_resolution ->> 'kind';

  case resolution_kind
    when 'answer' then
      -- `consequence` is optional, so the permitted key set depends on
      -- whether it was supplied; both spellings canonicalize identically.
      allowed_resolution_keys := case
        when p_resolution ? 'consequence' then array['kind', 'answer', 'consequence']
        else array['kind', 'answer']
      end;
      result_resolution := 'answered';
    when 'deferred' then
      allowed_resolution_keys := array['kind', 'snoozedUntil'];
      result_resolution := 'deferred';
    when 'dismissed' then
      allowed_resolution_keys := array['kind'];
      result_resolution := 'dismissed';
    when 'not_relevant' then
      allowed_resolution_keys := array['kind'];
      result_resolution := 'not_relevant';
    else
      raise exception 'Unknown resolution kind' using errcode = '22023';
  end case;

  if (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(p_resolution) as resolution_key(key)
    ) <> pg_catalog.cardinality(allowed_resolution_keys)
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_resolution) as resolution_key(key)
      where not (resolution_key.key = any(allowed_resolution_keys))
    )
  then
    raise exception 'Invalid resolution shape' using errcode = '22023';
  end if;

  if resolution_kind = 'answer' then
    if pg_catalog.jsonb_typeof(p_resolution -> 'answer') is distinct from 'string' then
      raise exception 'Invalid answer' using errcode = '22023';
    end if;
    -- POSIX whitespace boundary trim (migration 202607230047 precedent):
    -- btrim(text) trims spaces only, which would let a newline/tab-only
    -- answer through the emptiness check.
    normalized_answer := pg_catalog.regexp_replace(
      p_resolution ->> 'answer',
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    );
    if normalized_answer is null
      or pg_catalog.char_length(normalized_answer) not between 1 and 4000
    then
      raise exception 'Invalid answer' using errcode = '22023';
    end if;

    -- Closed consequence enum. Unknown values reject before any mutation.
    if p_resolution ? 'consequence' then
      if pg_catalog.jsonb_typeof(p_resolution -> 'consequence') is distinct from 'string' then
        raise exception 'Invalid consequence' using errcode = '22023';
      end if;
      normalized_consequence := p_resolution ->> 'consequence';
      if normalized_consequence not in ('none', 'reinterpret') then
        raise exception 'Invalid consequence' using errcode = '22023';
      end if;
    end if;
  end if;

  if resolution_kind = 'deferred' then
    -- Closed instant shape: an explicit-offset ISO-8601 instant only. A
    -- naive local date-time is ambiguous (its meaning would depend on the
    -- session timezone) and is rejected; the application converts wall
    -- times using the persisted profile timezone before calling.
    if pg_catalog.jsonb_typeof(p_resolution -> 'snoozedUntil') is distinct from 'string'
      or (p_resolution ->> 'snoozedUntil') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    then
      raise exception 'Invalid deferral instant' using errcode = '22023';
    end if;
    begin
      snoozed_until_value := (p_resolution ->> 'snoozedUntil')::timestamptz;
    exception when others then
      raise exception 'Invalid deferral instant' using errcode = '22023';
    end;
    -- Bounded, strictly-future deferral window (366 days covers leap
    -- years); an unbounded far-future defer would be an untruthful
    -- dismissal. Mirrors the application contract.
    if snoozed_until_value is null
      or snoozed_until_value <= pg_catalog.now()
      or snoozed_until_value > pg_catalog.now() + interval '366 days'
    then
      raise exception 'Invalid deferral instant' using errcode = '22023';
    end if;
    -- Canonical UTC millisecond form, identical to ECMAScript
    -- Date.prototype.toISOString(), so equal deferral commands always hash
    -- identically regardless of the submitted offset representation.
    canonical_snoozed_until := pg_catalog.to_char(
      snoozed_until_value at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );
  end if;

  -- Owner-scoped lookup before any evidence is written. A missing or
  -- cross-owner question is indistinguishable (P0002) by design.
  select question_row.*
  into question
  from public.pending_questions as question_row
  where question_row.user_id = current_user_id
    and question_row.id = p_question_id;
  if question.id is null then
    raise exception 'Pending question not found' using errcode = 'P0002';
  end if;

  -- Canonical request fingerprint over the normalized command. jsonb::text
  -- is key-order canonical, so equal commands always hash identically. The
  -- normalized consequence always participates for the answer kind, so an
  -- answer-only and an answer-plus-reinterpret command under the same
  -- operation key are a deterministic mismatch, never a silent replay.
  canonical_request := case resolution_kind
    when 'answer' then pg_catalog.jsonb_build_object(
      'questionId', p_question_id,
      'kind', resolution_kind,
      'answer', normalized_answer,
      'consequence', normalized_consequence
    )
    when 'deferred' then pg_catalog.jsonb_build_object(
      'questionId', p_question_id,
      'kind', resolution_kind,
      'snoozedUntil', canonical_snoozed_until
    )
    else pg_catalog.jsonb_build_object(
      'questionId', p_question_id,
      'kind', resolution_kind
    )
  end;
  canonical_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(canonical_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- Deterministic, bounded reprocessing operation key derived from the
  -- resolution's own canonical fingerprint (64 chars, inside the 8..200
  -- bound enqueue_entry_reprocessing enforces). Replaying the identical
  -- resolution therefore addresses the identical reprocessing job, so the
  -- consequence can never be applied twice.
  reprocess_operation_key := 'qr3-' || pg_catalog.substr(canonical_fingerprint, 1, 60);

  reservation_state := pg_catalog.jsonb_build_object(
    'question_id', question.id,
    'entry_id', question.entry_id,
    'interpretation_id', question.interpretation_id,
    'resolution', result_resolution,
    'consequence', normalized_consequence,
    'request_fingerprint', canonical_fingerprint
  );
  if resolution_kind = 'deferred' then
    reservation_state := reservation_state
      || pg_catalog.jsonb_build_object('snoozed_until', canonical_snoozed_until);
  end if;
  if normalized_consequence = 'reinterpret' then
    reservation_state := reservation_state
      || pg_catalog.jsonb_build_object(
        'reprocess_job_key',
        'entry-reprocess:' || question.entry_id::text || ':' || reprocess_operation_key
      );
  end if;

  -- Reserve the owner-scoped operation key. On replay the reserved row's
  -- fingerprint decides between deterministic replay and mismatch. A failed
  -- resolution rolls this reservation back atomically, so only successful
  -- operations are replayable.
  insert into public.undo_operations (
    user_id,
    action_type,
    entity_type,
    entity_ids,
    after_state,
    operation_key,
    source_entry_id,
    source_interpretation_id,
    request_fingerprint
  ) values (
    current_user_id,
    'resolve_pending_question_v3',
    'pending_question',
    array[question.id],
    reservation_state,
    internal_operation_key,
    question.entry_id,
    question.interpretation_id,
    canonical_fingerprint
  )
  on conflict (user_id, operation_key) where operation_key is not null
  do nothing
  returning id into undo_id;

  if undo_id is null then
    select operation_row.*
    into existing_operation
    from public.undo_operations as operation_row
    where operation_row.user_id = current_user_id
      and operation_row.operation_key = internal_operation_key
    for update;
    if existing_operation.id is null
      or existing_operation.request_fingerprint is distinct from canonical_fingerprint
    then
      raise exception 'Operation key payload mismatch'
        using errcode = 'P0001', detail = '2D_IDEMPOTENCY_MISMATCH';
    end if;
    return pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'resolution', existing_operation.after_state ->> 'resolution',
      'consequence', coalesce(existing_operation.after_state ->> 'consequence', 'none'),
      'consequence_status', case
        when coalesce(existing_operation.after_state ->> 'consequence', 'none') = 'reinterpret'
          then 'reinterpretation_queued'
        else 'none'
      end,
      'undo_id', existing_operation.id,
      'idempotent', true
    ) || case
      when existing_operation.after_state ? 'snoozed_until'
        then pg_catalog.jsonb_build_object(
          'snoozed_until', existing_operation.after_state ->> 'snoozed_until'
        )
      else '{}'::jsonb
    end;
  end if;

  -- Deadlock avoidance: take enqueue's per-(user, entry) advisory lock
  -- BEFORE the entry row lock, but only when a reinterpretation will
  -- actually be enqueued, so this RPC and a concurrent manual retry both
  -- acquire the advisory lock first. The key matches
  -- enqueue_entry_reprocessing byte-for-byte.
  if normalized_consequence = 'reinterpret' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        current_user_id::text || ':entry-reprocess:' || question.entry_id::text,
        0
      )
    );
  end if;

  -- Owner entry lock serializes concurrent resolutions and interpretation
  -- revisions for this entry; the stale check runs under it. (Migration
  -- 202607230051 additionally takes enqueue's advisory lock before this row
  -- lock for the reinterpret consequence, to avoid a lock-ordering deadlock
  -- with a concurrent manual retry.)
  select entry_row.*
  into owned_entry
  from public.entries as entry_row
  where entry_row.id = question.entry_id
    and entry_row.user_id = current_user_id
  for update;
  if owned_entry.id is null then
    raise exception 'Pending question not found' using errcode = 'P0002';
  end if;
  if owned_entry.current_interpretation_id is distinct from question.interpretation_id then
    raise exception 'Interpretation is no longer current' using errcode = '55P03';
  end if;

  -- Re-read the question under the entry lock: the pre-reservation read was
  -- unlocked, so the authoritative open check happens here. A snoozed
  -- question whose snoozed_until has been reached is deterministically open
  -- again (automatic snoozed -> open); a still-snoozed or terminal question
  -- is not resolvable.
  select question_row.*
  into question
  from public.pending_questions as question_row
  where question_row.user_id = current_user_id
    and question_row.id = p_question_id
  for update;
  if question.id is null then
    raise exception 'Pending question not found' using errcode = 'P0002';
  end if;
  if not (
    question.status = 'open'
    or (
      question.status = 'snoozed'
      and question.snoozed_until is not null
      and question.snoozed_until <= pg_catalog.now()
    )
  ) then
    raise exception 'Question is not open' using errcode = '55000';
  end if;

  if resolution_kind = 'answer' then
    update public.pending_questions
    set
      status = 'answered',
      answer = normalized_answer,
      answered_at = now(),
      snoozed_until = null
    where user_id = current_user_id
      and id = question.id
      and status = question.status;
  elsif resolution_kind = 'deferred' then
    update public.pending_questions
    set
      status = 'snoozed',
      answer = null,
      answered_at = null,
      snoozed_until = snoozed_until_value
    where user_id = current_user_id
      and id = question.id
      and status = question.status;
  else
    update public.pending_questions
    set
      status = 'dismissed',
      answer = null,
      answered_at = null,
      snoozed_until = null
    where user_id = current_user_id
      and id = question.id
      and status = question.status;
  end if;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Pending question resolution transition failed'
      using errcode = 'P0001', detail = '2D_RESOLUTION_TRANSITION_INTEGRITY';
  end if;

  -- Audit event 1 of 3: the answer/disposition was persisted. It records the
  -- consequence the command asked for as provenance; the confirmation event
  -- below is what proves a consequence was actually applied.
  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    before_state,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'resolve_pending_question_v3',
    'pending_question',
    question.id,
    'user',
    pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'interpretation_id', question.interpretation_id,
      'status', question.status
    ) || case
      when question.snoozed_until is not null
        then pg_catalog.jsonb_build_object(
          'snoozed_until', pg_catalog.to_char(
            question.snoozed_until at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        )
      else '{}'::jsonb
    end,
    pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'interpretation_id', question.interpretation_id,
      'resolution', result_resolution,
      'consequence', normalized_consequence,
      'request_fingerprint', canonical_fingerprint
    ) || case
      when resolution_kind = 'deferred'
        then pg_catalog.jsonb_build_object('snoozed_until', canonical_snoozed_until)
      else '{}'::jsonb
    end,
    case resolution_kind
      when 'answer' then 'User answered a pending question through the versioned resolution transition'
      when 'deferred' then 'User deferred a pending question through the versioned resolution transition'
      when 'dismissed' then 'User dismissed a pending question through the versioned resolution transition'
      else 'User marked a pending question not relevant through the versioned resolution transition'
    end,
    question.entry_id
  );

  -- The confirmed consequence. It runs only for an explicitly submitted
  -- `reinterpret`, inside the same transaction as the resolution, through
  -- the already deployed owner-scoped reprocessing path. The advisory lock
  -- and entry row lock enqueue_entry_reprocessing takes are already held by
  -- this transaction, so no new lock ordering is introduced.
  if normalized_consequence = 'reinterpret' then
    begin
      reprocess_result := public.enqueue_entry_reprocessing(
        question.entry_id,
        reprocess_operation_key
      );
    exception
      -- Reprocessing is already queued/running for this entry, or the
      -- derived key collides with an unrelated operation. Either way the
      -- consequence cannot be applied truthfully, so the whole resolution
      -- fails with a distinct, sanitized token and writes nothing. 55P03 is
      -- deliberately NOT reused here: it already means "stale
      -- interpretation" on this contract.
      when sqlstate '55P03' or sqlstate '23505' then
        raise exception 'Reinterpretation is not available for this record'
          using errcode = 'P0001', detail = '2D_CONSEQUENCE_UNAVAILABLE';
    end;
    if coalesce(reprocess_result ->> 'status', '') <> 'queued' then
      raise exception 'Reinterpretation is not available for this record'
        using errcode = 'P0001', detail = '2D_CONSEQUENCE_UNAVAILABLE';
    end if;
    consequence_status := 'reinterpretation_queued';

    -- Audit event 2 of 3: the consequence was confirmed and applied. Audit
    -- event 3 (the reinterpretation itself, action_type
    -- 'entry_reprocessing_enqueued') is written by
    -- enqueue_entry_reprocessing, so no provenance is duplicated here.
    insert into public.audit_logs (
      user_id,
      action_type,
      entity_type,
      entity_id,
      actor,
      before_state,
      after_state,
      reason,
      source_entry_id
    ) values (
      current_user_id,
      'question_consequence_confirmed',
      'pending_question',
      question.id,
      'user',
      pg_catalog.jsonb_build_object(
        'question_id', question.id,
        'interpretation_id', question.interpretation_id,
        'consequence', 'none'
      ),
      pg_catalog.jsonb_build_object(
        'question_id', question.id,
        'interpretation_id', question.interpretation_id,
        'consequence', normalized_consequence,
        'consequence_status', consequence_status,
        'request_fingerprint', canonical_fingerprint
      ),
      'User explicitly confirmed the bounded reinterpretation consequence for a resolved question',
      question.entry_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'question_id', question.id,
    'resolution', result_resolution,
    'consequence', normalized_consequence,
    'consequence_status', consequence_status,
    'undo_id', undo_id,
    'idempotent', false
  ) || case
    when resolution_kind = 'deferred'
      then pg_catalog.jsonb_build_object('snoozed_until', canonical_snoozed_until)
    else '{}'::jsonb
  end;
end;
$$;

revoke all on function public.resolve_pending_question_v3(uuid, jsonb, text)
  from public, anon;
grant execute on function public.resolve_pending_question_v3(uuid, jsonb, text)
  to authenticated;
