-- Forward-fix for Phase 2D Slice 2D.1, discovered by the dedicated remote
-- resolution smoke immediately after migration 202607230046 was applied
-- (migration 046 itself left unedited, per this project's append-only
-- convention — the same pattern as forward-fixes 202607220042/202607220045).
--
-- Migration 046 normalized the answer with pg_catalog.btrim(text), which
-- trims ASCII spaces only. A payload whose answer was newline/tab whitespace
-- (e.g. "\n\t") therefore survived the emptiness check and was persisted,
-- diverging from the application contract's full-whitespace trim and from
-- the approved rule that a whitespace-only answer is rejected before any
-- mutation. The fix normalizes with a POSIX [[:space:]] boundary trim so
-- space, tab, newline, carriage return, form feed, and vertical tab all
-- count as trimmable whitespace. The canonical fingerprint keeps hashing
-- the normalized answer, so canonicalization stays self-consistent.
-- Reproduced byte-for-byte from migration 046 otherwise (same signature,
-- same grants, same behavior contract).

create or replace function public.resolve_pending_question_v1(
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
  normalized_answer text;
  question public.pending_questions%rowtype;
  owned_entry public.entries%rowtype;
  canonical_request jsonb;
  canonical_fingerprint text;
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
  internal_operation_key := 'resolve-v1:' || normalized_key;

  -- Closed, discriminated resolution payload. Slice 2D.1 accepts exactly
  -- { "kind": "answer", "answer": <text> } — no other key, kind, nesting,
  -- or type is valid. Later versions of this family widen the shape.
  if pg_catalog.jsonb_typeof(p_resolution) is distinct from 'object'
    or pg_catalog.octet_length(p_resolution::text) > 32768
    or not (p_resolution ? 'kind')
    or not (p_resolution ? 'answer')
    or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(p_resolution) as resolution_key(key)
    ) <> 2
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_resolution) as resolution_key(key)
      where resolution_key.key not in ('kind', 'answer')
    )
  then
    raise exception 'Invalid resolution shape' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_resolution -> 'kind') is distinct from 'string' then
    raise exception 'Invalid resolution kind' using errcode = '22023';
  end if;
  resolution_kind := p_resolution ->> 'kind';
  if resolution_kind <> 'answer' then
    raise exception 'Unknown resolution kind' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_resolution -> 'answer') is distinct from 'string' then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;
  -- POSIX whitespace boundary trim: btrim(text) trims spaces only, which
  -- would let a newline/tab-only answer through the emptiness check.
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
  -- is key-order canonical, so equal commands always hash identically.
  canonical_request := pg_catalog.jsonb_build_object(
    'questionId', p_question_id,
    'kind', resolution_kind,
    'answer', normalized_answer
  );
  canonical_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(canonical_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

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
    'resolve_pending_question_v1',
    'pending_question',
    array[question.id],
    pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'entry_id', question.entry_id,
      'interpretation_id', question.interpretation_id,
      'resolution', 'answered',
      'request_fingerprint', canonical_fingerprint
    ),
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
      'resolution', 'answered',
      'undo_id', existing_operation.id,
      'idempotent', true
    );
  end if;

  -- Owner entry lock serializes concurrent resolutions and interpretation
  -- revisions for this entry; the stale check runs under it.
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
  -- unlocked, so the authoritative open check happens here.
  select question_row.*
  into question
  from public.pending_questions as question_row
  where question_row.user_id = current_user_id
    and question_row.id = p_question_id
  for update;
  if question.id is null then
    raise exception 'Pending question not found' using errcode = 'P0002';
  end if;
  if question.status <> 'open' then
    raise exception 'Question is not open' using errcode = '55000';
  end if;

  update public.pending_questions
  set
    status = 'answered',
    answer = normalized_answer,
    answered_at = now()
  where user_id = current_user_id
    and id = question.id
    and status = 'open';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Pending question answer transition failed'
      using errcode = 'P0001', detail = '2D_ANSWER_TRANSITION_INTEGRITY';
  end if;

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
    'resolve_pending_question_v1',
    'pending_question',
    question.id,
    'user',
    pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'interpretation_id', question.interpretation_id,
      'status', 'open'
    ),
    pg_catalog.jsonb_build_object(
      'question_id', question.id,
      'interpretation_id', question.interpretation_id,
      'resolution', 'answered',
      'request_fingerprint', canonical_fingerprint
    ),
    'User answered a pending question through the versioned resolution transition',
    question.entry_id
  );

  return pg_catalog.jsonb_build_object(
    'question_id', question.id,
    'resolution', 'answered',
    'undo_id', undo_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.resolve_pending_question_v1(uuid, jsonb, text)
  from public, anon;
grant execute on function public.resolve_pending_question_v1(uuid, jsonb, text)
  to authenticated;
