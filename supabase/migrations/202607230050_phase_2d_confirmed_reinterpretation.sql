-- Phase 2D Slice 2D.4: confirmed consequence / reinterpretation.
--
-- Extends the single long-lived versioned resolution RPC family
-- (resolve_pending_question_vN, ADR-033 decision 2) with
-- resolve_pending_question_v3. The closed discriminated p_resolution keeps
-- every Slice 2D.1/2D.2 kind byte-compatible and adds exactly one approved
-- extension: an OPTIONAL, closed-enum `consequence` on the `answer` kind.
--
--   { "kind": "answer",       "answer": <trimmed 1-4000 chars>,
--                             "consequence": "none" | "reinterpret" }   -- optional
--   { "kind": "deferred",     "snoozedUntil": <explicit-offset future instant> }
--   { "kind": "dismissed" }
--   { "kind": "not_relevant" }
--
-- The consequence enum is closed and database-validated (PRD 2D-ACTION-002):
-- there is no arbitrary action object, no free-form payload, no JSON blob,
-- and no hidden metadata. An unknown consequence value, or a `consequence`
-- key on any non-answer kind, rejects with 22023 before any mutation. An
-- absent consequence normalizes to 'none' and hashes identically to an
-- explicit "none", so replay stays deterministic either way.
--
-- `reinterpret` reuses the deployed owner-scoped reprocessing path
-- (public.enqueue_entry_reprocessing -> the existing interpret_entry job ->
-- the deployed process-jobs worker, PRD 2D-ACTION-003). Phase 2D adds no
-- interpretation engine, queue, worker, scheduler, secret, or Edge Function.
-- Because the reprocessing operation key is derived deterministically from
-- the resolution's own canonical fingerprint, the consequence is idempotent
-- per operation key and can never double-apply on replay or concurrency
-- (2D-ACTION-004). The consequence NEVER runs merely because an answer
-- exists: it is applied only when the caller explicitly submits
-- `"consequence": "reinterpret"`.
--
-- Reinterpretation is strictly additive to interpretation history: the
-- worker appends a new immutable interpretation revision through the
-- existing path. No historical interpretation is mutated, overwritten, or
-- deleted; the immutable pending_questions JSON is never touched.
--
-- Audit distinguishes three independently replay-safe events:
--   1. answer persisted        -> action_type 'resolve_pending_question_v3'
--   2. consequence confirmed   -> action_type 'question_consequence_confirmed'
--                                 (emitted only when a consequence was applied)
--   3. reinterpretation created-> action_type 'entry_reprocessing_enqueued'
--                                 (written by enqueue_entry_reprocessing itself)
-- No audit row is duplicated and no provenance is dropped.
--
-- resolve_pending_question_v1 and resolve_pending_question_v2 remain
-- unchanged and callable (rollout/rollback safety); their namespaces stay
-- isolated ('resolve-v1:', 'resolve-v2:', 'resolve-v3:'), so reservations
-- can never collide across versions.
--
-- Every earlier guarantee carries over unchanged: SECURITY DEFINER, empty
-- search_path, qualified references, no dynamic SQL, execute granted to
-- authenticated only; auth.uid() identity with non-disclosing cross-owner
-- denial (P0002); stale safety under an owner entry lock (55P03);
-- single-winner concurrency (loser observes 55000); canonical SHA-256 replay
-- fingerprint on the reserved undo operation (replay returns the original
-- result; same key + different payload raises P0001 /
-- 2D_IDEMPOTENCY_MISMATCH); atomic state + consequence + audit + undo.

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

-- Extend undo_operation with the resolve_pending_question_v3 restore branch
-- and forward-fix the residual gateway-hanging SQLSTATE.
--
-- Reproduced from migration 202607230048 otherwise (same signature, same
-- grants, every pre-existing branch — v1, v2, the confirmation family, and
-- the interpretation-correction compensation — unchanged) except for two
-- deliberate changes:
--
-- (1) HARD GATE 2C-UNDO-004 / ADR-026. The 'Cannot undo after a newer
--     interpretation revision' conflict raised SQLSTATE 40001, which Slice
--     2X.7 independently proved hangs any request until the platform
--     gateway timeout (reproduced against the already-published
--     correct_entry_interpretation with no application code involved).
--     Migration 202607180029 forward-fixed correct_entry_interpretation to
--     55P03 but explicitly left undo_operation's own distinct 40001 raise
--     as a documented residual. Slice 2D.4 makes the reinterpretation undo
--     path reachable from the question surface, so the residual is closed
--     here the same way: the conflict signal becomes 55P03. No ownership
--     check, snapshot, compensation, audit row, or return shape changes.
--
-- (2) The new resolve_pending_question_v3 branch restores the exact prior
--     open state (open, cleared answer/answered_at/snoozed_until) guarded by
--     the status the resolution evidence says it left behind, and
--     compensates the confirmed consequence. Compensation removes the
--     queued reinterpretation *work item* when it has not been claimed;
--     it never deletes, rewrites, or resurrects an interpretation revision.
--     Undo restores pointers, never history: if the worker already produced
--     a new immutable revision, that revision stays, the entry pointer is
--     left alone, and the audit records truthfully that the reinterpretation
--     had already been produced.

create or replace function public.undo_operation(p_undo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  operation public.undo_operations%rowtype;
  owned_entry public.entries%rowtype;
  source_interpretation public.entry_interpretations%rowtype;
  current_interpretation public.entry_interpretations%rowtype;
  undo_interpretation_id uuid;
  undo_version integer;
  affected integer := 0;
  resolution_affected integer := 0;
  expected_resolution_count integer := 0;
  result_affected integer := 0;
  restored_status text;
  restored_occurred_at timestamptz;
  expected_question_status text;
  consequence_kind text;
  consequence_compensation text := 'not_applicable';
  consequence_job public.jobs%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = current_user_id
  for update;
  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;

  if operation.status = 'undone' then
    return jsonb_build_object(
      'undone', true,
      'affected', 0,
      'interpretation_id', operation.after_state ->> 'undo_interpretation_id',
      'idempotent', true
    );
  end if;
  if operation.status <> 'available' then raise exception 'Undo operation is no longer available'; end if;
  if operation.expires_at < now() then
    update public.undo_operations set status = 'expired' where id = operation.id;
    raise exception 'Undo operation expired';
  end if;

  if operation.action_type = 'resolve_pending_question_v1' then
    update public.pending_questions
    set status = 'open', answer = null, answered_at = null
    where user_id = current_user_id
      and id = any(operation.entity_ids)
      and status = 'answered';
    get diagnostics affected = row_count;

    if affected <> pg_catalog.cardinality(operation.entity_ids) then
      raise exception 'Pending question undo integrity check failed'
        using errcode = 'P0001', detail = '2D_UNDO_RESTORE_INTEGRITY';
    end if;

    update public.undo_operations
    set status = 'undone', undone_at = now()
    where id = operation.id;

    insert into public.audit_logs (
      user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
    ) values (
      current_user_id,
      'operation_undone',
      operation.entity_type,
      operation.entity_ids[1],
      'user',
      operation.after_state,
      jsonb_build_object(
        'question_id', operation.entity_ids[1],
        'restored_status', 'open'
      ),
      'User executed the stored compensating operation',
      operation.source_entry_id
    );

    return jsonb_build_object('undone', true, 'affected', affected, 'idempotent', false);
  end if;

  if operation.action_type in ('resolve_pending_question_v2', 'resolve_pending_question_v3') then
    -- The resolution evidence names the state the transition left behind;
    -- restoring is only legal from exactly that state.
    expected_question_status := case operation.after_state ->> 'resolution'
      when 'answered' then 'answered'
      when 'deferred' then 'snoozed'
      when 'dismissed' then 'dismissed'
      when 'not_relevant' then 'dismissed'
      else null
    end;
    if expected_question_status is null then
      raise exception 'Pending question undo integrity check failed'
        using errcode = 'P0001', detail = '2D_UNDO_RESTORE_INTEGRITY';
    end if;

    consequence_kind := coalesce(operation.after_state ->> 'consequence', 'none');

    -- Serialize consequence compensation against a concurrent resolution or
    -- reinterpretation of the same entry. v1/v2 operations carry no
    -- consequence and keep their existing lock-free restore path.
    if consequence_kind = 'reinterpret' and operation.source_entry_id is not null then
      select * into owned_entry
      from public.entries
      where id = operation.source_entry_id and user_id = current_user_id
      for update;
      if owned_entry.id is null then
        raise exception 'Entry not found' using errcode = 'P0002';
      end if;
    end if;

    update public.pending_questions
    set status = 'open', answer = null, answered_at = null, snoozed_until = null
    where user_id = current_user_id
      and id = any(operation.entity_ids)
      and status = expected_question_status;
    get diagnostics affected = row_count;

    if affected <> pg_catalog.cardinality(operation.entity_ids) then
      raise exception 'Pending question undo integrity check failed'
        using errcode = 'P0001', detail = '2D_UNDO_RESTORE_INTEGRITY';
    end if;

    -- Compensate the confirmed consequence. The reinterpretation work item
    -- is addressed by the deterministic idempotency key the resolution
    -- recorded, so compensation can never touch an unrelated job.
    if consequence_kind = 'reinterpret' then
      if coalesce(operation.after_state ->> 'reprocess_job_key', '') = '' then
        raise exception 'Pending question undo integrity check failed'
          using errcode = 'P0001', detail = '2D_UNDO_CONSEQUENCE_INTEGRITY';
      end if;

      select * into consequence_job
      from public.jobs
      where user_id = current_user_id
        and idempotency_key = operation.after_state ->> 'reprocess_job_key'
      for update;

      if consequence_job.id is null then
        consequence_compensation := 'reprocessing_missing';
      elsif consequence_job.status in ('pending', 'failed') then
        -- Never claimed (or failed without producing a revision): removing
        -- the queued work item restores the exact pre-consequence state.
        -- jobs is an operational work queue, not append-only evidence; the
        -- audit and undo rows remain the durable history.
        delete from public.jobs where id = consequence_job.id;
        consequence_compensation := 'reprocessing_cancelled';
      elsif consequence_job.status = 'running' then
        consequence_compensation := 'reprocessing_in_progress';
      else
        consequence_compensation := 'reprocessing_' || consequence_job.status;
      end if;
    end if;

    update public.undo_operations
    set status = 'undone', undone_at = now()
    where id = operation.id;

    insert into public.audit_logs (
      user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
    ) values (
      current_user_id,
      'operation_undone',
      operation.entity_type,
      operation.entity_ids[1],
      'user',
      operation.after_state,
      jsonb_build_object(
        'question_id', operation.entity_ids[1],
        'restored_status', 'open',
        'consequence', consequence_kind,
        'consequence_compensation', consequence_compensation
      ),
      'User executed the stored compensating operation',
      operation.source_entry_id
    );

    return jsonb_build_object(
      'undone', true,
      'affected', affected,
      'consequence', consequence_kind,
      'consequence_compensation', consequence_compensation,
      'idempotent', false
    );
  end if;

  if operation.action_type in (
    'confirm_entry_tasks',
    'confirm_entry_task_candidates',
    'confirm_entry_task_candidates_v5',
    'confirm_entry_task_candidates_v6'
  ) then
    update public.tasks
    set status = 'cancelled', cancelled_at = now()
    where user_id = current_user_id
      and id = any(operation.entity_ids)
      and status <> 'cancelled';
    get diagnostics affected = row_count;

    delete from public.entry_task_candidate_resolutions as resolution_row
    where resolution_row.user_id = current_user_id
      and (
        resolution_row.undo_operation_id = operation.id
        or (
          pg_catalog.cardinality(operation.entity_ids) > 0
          and resolution_row.task_id = any(operation.entity_ids)
        )
    );
    get diagnostics resolution_affected = row_count;

    if operation.action_type in (
      'confirm_entry_task_candidates_v5',
      'confirm_entry_task_candidates_v6'
    ) then
      if pg_catalog.jsonb_typeof(operation.after_state -> 'resolutions') is distinct from 'array' then
        raise exception 'Candidate resolution undo integrity check failed'
          using errcode = 'P0001', detail = '2C_UNDO_RESOLUTION_INTEGRITY';
      end if;
      expected_resolution_count := pg_catalog.jsonb_array_length(
        operation.after_state -> 'resolutions'
      );
      if resolution_affected <> expected_resolution_count then
        raise exception 'Candidate resolution undo integrity check failed'
          using errcode = 'P0001', detail = '2C_UNDO_RESOLUTION_INTEGRITY';
      end if;
    end if;

    result_affected := case
      when operation.action_type in (
        'confirm_entry_task_candidates_v5',
        'confirm_entry_task_candidates_v6'
      )
        then case
          when affected >= resolution_affected then affected
          else resolution_affected
        end
      else affected
    end;

    update public.undo_operations
    set status = 'undone', undone_at = now()
    where id = operation.id;
    insert into public.audit_logs (
      user_id, action_type, entity_type, actor, before_state, after_state, reason
    ) values (
      current_user_id,
      'operation_undone',
      operation.entity_type,
      'user',
      operation.after_state,
      jsonb_build_object(
        'cancelled_entity_ids', to_jsonb(operation.entity_ids),
        'removed_candidate_resolution_count', resolution_affected
      ),
      'User executed the stored compensating operation'
    );
    return jsonb_build_object('undone', true, 'affected', result_affected, 'idempotent', false);
  end if;

  if operation.action_type <> 'correct_entry_interpretation' then
    raise exception 'Unsupported undo operation';
  end if;

  select * into owned_entry
  from public.entries
  where id = operation.source_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  if owned_entry.current_interpretation_id is distinct from operation.result_interpretation_id then
    -- 2C-UNDO-004 forward fix (ADR-026 pattern): SQLSTATE 40001 hangs the
    -- request until the platform gateway timeout. 55P03 is the conflict
    -- signal every other RPC in this project already uses.
    raise exception 'Cannot undo after a newer interpretation revision' using errcode = '55P03';
  end if;

  select * into source_interpretation
  from public.entry_interpretations
  where id = operation.source_interpretation_id
    and entry_id = owned_entry.id
    and user_id = current_user_id;
  select * into current_interpretation
  from public.entry_interpretations
  where id = owned_entry.current_interpretation_id
    and entry_id = owned_entry.id
    and user_id = current_user_id;
  if source_interpretation.id is null or current_interpretation.id is null then
    raise exception 'Undo interpretation snapshot not found' using errcode = 'P0002';
  end if;

  undo_version := current_interpretation.version + 1;
  insert into public.entry_interpretations (
    user_id, entry_id, version, parent_interpretation_id, origin, corrected_by,
    correction_reason, operation_key, summary, concepts,
    extracted_contexts, extracted_organizations, extracted_projects, extracted_people,
    task_candidates, pending_questions, confidence, model, strategy_version,
    prompt_version, input_tokens, output_tokens, raw_output,
    extracted_dates, element_classifications, element_confidence, element_policy, resolution_evidence,
    is_record_only
  ) values (
    current_user_id,
    owned_entry.id,
    undo_version,
    current_interpretation.id,
    'user_corrected',
    current_user_id,
    'Undo interpretation correction',
    'undo:' || operation.id::text,
    source_interpretation.summary,
    source_interpretation.concepts,
    source_interpretation.extracted_contexts,
    source_interpretation.extracted_organizations,
    source_interpretation.extracted_projects,
    source_interpretation.extracted_people,
    source_interpretation.task_candidates,
    source_interpretation.pending_questions,
    source_interpretation.confidence,
    source_interpretation.model,
    source_interpretation.strategy_version,
    source_interpretation.prompt_version,
    0,
    0,
    source_interpretation.raw_output,
    source_interpretation.extracted_dates,
    source_interpretation.element_classifications,
    source_interpretation.element_confidence,
    source_interpretation.element_policy,
    source_interpretation.resolution_evidence,
    source_interpretation.is_record_only
  ) returning id into undo_interpretation_id;

  insert into public.entry_entities (
    user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence
  )
  select
    current_user_id,
    owned_entry.id,
    undo_interpretation_id,
    entity_type,
    entity_id,
    mention,
    confidence
  from public.entry_entities
  where user_id = current_user_id and interpretation_id = source_interpretation.id;
  perform public.persist_interpretation_questions(
    current_user_id,
    owned_entry.id,
    undo_interpretation_id,
    source_interpretation.pending_questions
  );

  restored_status := case
    when jsonb_array_length(source_interpretation.pending_questions) > 0 then 'partially_processed'
    when exists (
      select 1 from jsonb_each_text(source_interpretation.element_policy)
      where value in ('request_review', 'block_until_confirmation')
    ) then 'awaiting_review'
    else 'completed'
  end;
  begin
    restored_occurred_at := (source_interpretation.raw_output ->> 'occurredAt')::timestamptz;
  exception when others then
    restored_occurred_at := owned_entry.occurred_at;
  end;

  update public.entries
  set
    current_interpretation_id = undo_interpretation_id,
    status = restored_status,
    occurred_at = restored_occurred_at,
    is_retroactive = coalesce((source_interpretation.raw_output ->> 'isRetroactive')::boolean, false),
    processing_error = null
  where id = owned_entry.id and user_id = current_user_id;

  update public.undo_operations
  set
    status = 'undone',
    undone_at = now(),
    after_state = after_state || jsonb_build_object(
      'undo_interpretation_id', undo_interpretation_id,
      'undo_version', undo_version
    )
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id,
    'entry_interpretation_correction_undone',
    'entry_interpretation',
    undo_interpretation_id,
    'user',
    jsonb_build_object('interpretation_id', current_interpretation.id, 'version', current_interpretation.version),
    jsonb_build_object(
      'interpretation_id', undo_interpretation_id,
      'version', undo_version,
      'restored_from_interpretation_id', source_interpretation.id
    ),
    'User appended a compensating interpretation revision',
    owned_entry.id
  );

  return jsonb_build_object(
    'undone', true,
    'affected', 1,
    'interpretation_id', undo_interpretation_id,
    'version', undo_version,
    'status', restored_status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.undo_operation(uuid) from public, anon;
grant execute on function public.undo_operation(uuid) to authenticated;

-- Fail-closed structural proof of the 2C-UNDO-004 hard gate, mirroring the
-- assertion migration 202607180029 added for correct_entry_interpretation.
do $$
begin
  if position('errcode = ''40001''' in pg_get_functiondef('public.undo_operation(uuid)'::regprocedure)) > 0 then
    raise exception 'undo_operation still raises the gateway-hanging SQLSTATE 40001';
  end if;
end;
$$;

-- Product analytics: allow the approved Slice 2D.4 event,
-- question_reinterpret_applied. It is boolean-by-existence — it carries NO
-- properties at all, so it reveals only that a resolution applied the
-- bounded reinterpretation consequence, never the question, answer,
-- interpretation, entry, job id, or any free text. Additive extension of
-- the migration 202607170024 contract, following the
-- 202607210034/202607220038/202607220044/202607230048/202607230049
-- precedent: table CHECK constraint, per-event property allowlist, and
-- record_product_event's defense-in-depth name guard; every other branch
-- reproduced byte-for-byte.

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
    'candidate_edit_reset'
  ));

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
  end case;
end;
$$;

revoke all on function private.validate_product_event_properties(text, jsonb)
  from public, anon, authenticated, service_role;

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
    'work_view_viewed', 'task_status_changed', 'candidate_edit_started', 'candidate_edit_reset'
  ) then
    raise exception 'Unsupported product event' using errcode = '22023';
  end if;
  if p_surface not in (
    'home', 'capture', 'inbox', 'needs_attention', 'interpretation_review',
    'technical_details', 'work', 'questions', 'server'
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
