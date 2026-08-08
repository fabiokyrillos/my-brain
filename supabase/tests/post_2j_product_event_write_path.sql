-- POST-2J CORRECTION — the test whose absence let a two-phase defect ship.
--
-- Every existing product-event test asserted artifacts in isolation: the CHECK
-- constraint contains a name, the validator's body contains a name, the writer
-- is `security definer`. All of them passed while the real write path refused
-- four legal events, because no test ever asked the only question that matters:
--
--   For EVERY event name the database declares supported, can the writer that
--   production actually calls accept a legal payload for it?
--
-- The vocabulary is derived from the CHECK constraint itself, never restated
-- here, so a future migration that widens the CHECK and forgets the writer or
-- the validator fails this file automatically rather than shipping silent.
--
-- Everything runs inside the transaction pgTAP rolls back, so no row survives.

begin;

select plan(19);

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('b7000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'post-2j-writer@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- The vocabulary, read from the database contract rather than written down.
create temporary table declared_event_names as
select distinct match[1] as event_name
  from (
    select pg_get_constraintdef(oid) as definition
      from pg_constraint
     where conname = 'product_events_event_name_check'
       and conrelid = 'public.product_events'::regclass
  ) constraint_row,
  lateral regexp_matches(constraint_row.definition, '''([a-z0-9_]+)''', 'g') as match;

-- One legal payload per event. This is the only hand-written list in the file,
-- and it cannot silently drift: the two set-difference assertions below require
-- it to match the derived vocabulary exactly in both directions, so adding a
-- CHECK value without adding a payload here fails, and so does the reverse.
--
-- `surface` is uniform. The writer validates surface against its own closed list
-- and does not couple surface to event name, so varying it here would test
-- nothing this file is about and would add a failure mode that is not the
-- subject.
create temporary table legal_payloads (
  event_name text primary key,
  surface text not null default 'server',
  properties jsonb not null
);

insert into legal_payloads (event_name, properties) values
  ('capture_started',              '{"captureSource":"home"}'),
  ('capture_save_succeeded',       '{"captureSource":"home","durationMs":1}'),
  ('capture_save_failed',          '{"captureSource":"home","durationMs":1,"failureKind":"validation"}'),
  ('capture_processing_enqueued',  '{"processingMode":"initial"}'),
  ('capture_processing_completed', '{"processingMode":"initial","durationMs":1,"outcome":"ready"}'),
  ('capture_processing_failed',    '{"processingMode":"initial","durationMs":1,"failureKind":"retryable"}'),
  ('needs_attention_viewed',       '{"itemCount":0}'),
  ('needs_attention_item_opened',  '{"attentionReason":"review_interpretation"}'),
  ('interpretation_review_viewed', '{}'),
  ('interpretation_corrected',     '{"fieldCount":1}'),
  ('technical_details_opened',     '{}'),
  ('task_candidates_presented',    '{"candidateCount":0}'),
  ('task_candidates_confirmed',    '{"candidateCount":1}'),
  ('question_answered_basic',      '{"origin":"typed"}'),
  ('question_resolved',            '{"kind":"deferred"}'),
  ('question_effect_previewed',    '{}'),
  ('question_reinterpret_applied', '{}'),
  ('processing_retry_requested',   '{"retrySource":"user"}'),
  ('work_view_viewed',             '{"workView":"today"}'),
  ('task_status_changed',          '{"fromStatus":"inbox","toStatus":"todo"}'),
  ('candidate_edit_started',       '{"candidateCount":1}'),
  ('candidate_edit_reset',         '{"editedFieldCount":1}'),
  ('task_command_previewed',       '{"commandOrigin":"chat","outcomeCategory":"applied","candidateCount":1,"scoreBand":"high","marginBand":"low","signalCategories":["status_match"],"oneStep":true,"requiresConfirmation":false,"policyVersion":"2026-07-28.1"}'),
  ('task_command_disambiguated',   '{"commandOrigin":"chat","candidateCount":2,"selectedRank":1,"policyVersion":"2026-07-28.1"}'),
  ('task_command_applied',         '{"commandOrigin":"chat","outcomeCategory":"applied","applyRoute":"direct","replayed":false,"policyVersion":"2026-07-28.1"}'),
  ('task_command_undone',          '{"commandOrigin":"chat","undoResult":"undone","policyVersion":"2026-07-28.1"}'),
  -- Phase 2H, `2H-RATE-003`, added to the CHECK by `202608070081` and refused by
  -- the writer from that day until the migration this file accompanies.
  ('rate_limit_refused',           '{"operation":"ai","failureKind":"rate_limited"}'),
  -- Phase 2J, added to the CHECK by `202608080086`, same story.
  ('capture_mode_selected',        '{"captureMode":"voice"}'),
  ('voice_transcription_finished', '{"outcome":"succeeded","draftEdited":false,"additionalSegment":false}'),
  ('attention_item_resolved',      '{"attentionReason":"retry_processing","resolutionAction":"retry","resolutionBucket":"under_5s"}');

-- The real writer, exercised exactly as production calls it, once per declared
-- name. Failures are collected rather than raised so the assertion can name
-- every broken event at once instead of only the first.
-- The OUT column is `checked_event`, NOT `event_name`: plpgsql substitutes
-- variables into queries by name, and an OUT parameter called `event_name`
-- would collide with the `event_name` columns of both tables joined below,
-- failing the whole file with an ambiguity error rather than a useful result.
create function pg_temp.write_every_declared_event(p_user uuid)
returns table(checked_event text, wrote boolean, failure text)
language plpgsql
as $$
declare
  candidate record;
  written uuid;
begin
  for candidate in
    select d.event_name as name, p.surface, p.properties
      from declared_event_names d
      join legal_payloads p on p.event_name = d.event_name
     order by d.event_name
  loop
    begin
      select w.event_id into written
        from public.record_product_event_for_user(
          p_user, candidate.name, candidate.surface, 'pt-BR', 'desktop', '0.0.0-pgtap',
          candidate.properties, null, null, null, gen_random_uuid(), true
        ) w;
      checked_event := candidate.name;
      wrote := written is not null;
      failure := null;
      return next;
    exception when others then
      checked_event := candidate.name;
      wrote := false;
      failure := SQLSTATE || ' ' || SQLERRM;
      return next;
    end;
  end loop;
end;
$$;

-- The service-role identity the worker/server writer requires.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- Non-vacuity. An assertion over an empty vocabulary passes while proving
-- nothing, which is the failure mode this whole file exists to prevent.
-- ---------------------------------------------------------------------------

select cmp_ok(
  (select count(*)::int from declared_event_names), '>=', 20,
  'the event vocabulary was actually extracted from the CHECK constraint'
);

select is_empty(
  $$ select control from (values
       ('capture_started'), ('work_view_viewed'), ('rate_limit_refused'),
       ('capture_mode_selected'), ('voice_transcription_finished'),
       ('attention_item_resolved')
     ) as controls(control)
     where control not in (select event_name from declared_event_names) $$,
  'the extracted vocabulary contains every known control, so the extraction is not silently partial'
);

-- ---------------------------------------------------------------------------
-- Completeness. These two are what fire when a future migration widens the
-- CHECK and forgets everything else.
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select event_name from declared_event_names
     except select event_name from legal_payloads $$,
  'every CHECK-declared event name has a legal payload in this test'
);

select is_empty(
  $$ select event_name from legal_payloads
     except select event_name from declared_event_names $$,
  'this test declares no payload for an event the database does not accept'
);

-- ---------------------------------------------------------------------------
-- THE ASSERTION. Every declared name, through the writer production calls.
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select checked_event || ' -> ' || coalesce(failure, 'no row returned')
       from pg_temp.write_every_declared_event('b7000001-0000-4000-8000-000000000001')
      where not wrote $$,
  'every CHECK-declared product event is writable through the real writer'
);

select cmp_ok(
  (select count(*)::int
     from pg_temp.write_every_declared_event('b7000001-0000-4000-8000-000000000001')
    where wrote),
  '=',
  (select count(*)::int from declared_event_names),
  'the write loop actually ran once per declared event and wrote each of them'
);

-- ---------------------------------------------------------------------------
-- The four events the defect refused, named individually so a regression
-- reports which contract broke rather than only that one did.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.record_product_event_for_user(
       'b7000001-0000-4000-8000-000000000001', 'rate_limit_refused', 'server', 'pt-BR', 'unknown',
       '0.0.0-pgtap', '{"operation":"ai","failureKind":"rate_limited"}'::jsonb,
       null, null, null, gen_random_uuid(), true) $$,
  '2H-RATE-003: rate_limit_refused is accepted by the real writer'
);

select lives_ok(
  $$ select public.record_product_event_for_user(
       'b7000001-0000-4000-8000-000000000001', 'capture_mode_selected', 'capture', 'pt-BR', 'desktop',
       '0.0.0-pgtap', '{"captureMode":"voice"}'::jsonb,
       null, null, null, gen_random_uuid(), true) $$,
  'Phase 2J: capture_mode_selected is accepted by the real writer'
);

select lives_ok(
  $$ select public.record_product_event_for_user(
       'b7000001-0000-4000-8000-000000000001', 'voice_transcription_finished', 'capture', 'pt-BR', 'mobile',
       '0.0.0-pgtap', '{"outcome":"succeeded","draftEdited":false,"additionalSegment":false}'::jsonb,
       null, null, null, gen_random_uuid(), true) $$,
  'Phase 2J: voice_transcription_finished is accepted by the real writer'
);

select lives_ok(
  $$ select public.record_product_event_for_user(
       'b7000001-0000-4000-8000-000000000001', 'attention_item_resolved', 'needs_attention', 'en', 'desktop',
       '0.0.0-pgtap', '{"attentionReason":"retry_processing","resolutionAction":"retry","resolutionBucket":"under_5s"}'::jsonb,
       null, null, null, gen_random_uuid(), true) $$,
  'Phase 2J: attention_item_resolved is accepted by the real writer'
);

-- ---------------------------------------------------------------------------
-- Fail-closed. Deleting a duplicate guard is only safe if the remaining ones
-- still refuse everything they refused before.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.record_product_event_for_user(
       'b7000001-0000-4000-8000-000000000001', 'voice_transcript_captured', 'capture', 'pt-BR', 'desktop',
       '0.0.0-pgtap', '{}'::jsonb, null, null, null, gen_random_uuid(), true) $$,
  '22023',
  'Unsupported product event',
  'an undeclared event name is still refused, with the same errcode and message the deleted gate raised'
);

select throws_ok(
  $$ select public.record_product_event_for_user(
       'b7000001-0000-4000-8000-000000000001', 'work_view_viewed', 'server', 'pt-BR', 'desktop',
       '0.0.0-pgtap', '{"workView":"nowhere"}'::jsonb, null, null, null, gen_random_uuid(), true) $$,
  '22023',
  'Invalid product event property',
  'an out-of-enum property value is still refused for a supported event'
);

select throws_ok(
  $$ select public.record_product_event_for_user(
       'b7000001-0000-4000-8000-000000000001', 'voice_transcription_finished', 'capture', 'pt-BR', 'mobile',
       '0.0.0-pgtap',
       '{"outcome":"succeeded","draftEdited":false,"additionalSegment":false,"transcript":"texto falado"}'::jsonb,
       null, null, null, gen_random_uuid(), true) $$,
  '22023',
  'Unsupported product event property',
  'a free-text property is still refused: the payload has nowhere to put content'
);

-- ---------------------------------------------------------------------------
-- Identity and ownership. The authenticated path derives its owner from the
-- session, and the service-role path is not reachable from one.
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b7000001-0000-4000-8000-000000000001"}',
  true
);

select lives_ok(
  $$ select public.record_product_event(
       'capture_mode_selected', 'capture', 'pt-BR', 'desktop', '0.0.0-pgtap',
       '{"captureMode":"text"}'::jsonb, null, null, null,
       'b7000002-0000-4000-8000-000000000002'::uuid, true) $$,
  'the authenticated writer accepts a Phase 2J event under a real session identity'
);

select results_eq(
  $$ select user_id from public.product_events
      where idempotency_key = 'b7000002-0000-4000-8000-000000000002' $$,
  $$ values ('b7000001-0000-4000-8000-000000000001'::uuid) $$,
  'the authenticated write is owned by the session identity, not by an argument'
);

select throws_ok(
  $$ select public.record_product_event_for_user(
       'b7000001-0000-4000-8000-000000000001', 'capture_mode_selected', 'capture', 'pt-BR', 'desktop',
       '0.0.0-pgtap', '{"captureMode":"voice"}'::jsonb, null, null, null, gen_random_uuid(), true) $$,
  '42501',
  'Service role required',
  'the service-role writer is still unreachable from an authenticated session'
);

-- ---------------------------------------------------------------------------
-- NON-VACUITY OF THE ASSERTION ITSELF.
--
-- The five assertions above would all pass against a writer that never had the
-- defect, which says nothing about whether they can SEE the defect. So the
-- historical shape is planted here and the same calls are re-run: if the stale
-- gate returns, these must fail. The definition is captured first and restored
-- after, and the whole file is inside a transaction that rolls back regardless.
-- ---------------------------------------------------------------------------

create temporary table corrected_writer_definition as
select pg_get_functiondef(
  'private.record_product_event(uuid,text,text,text,text,text,jsonb,text,uuid,uuid,uuid,boolean)'::regprocedure
) as definition;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- `202607280061`'s gate, verbatim, wrapped around a body that otherwise just
-- delegates nothing: it only has to reproduce the refusal to prove detection.
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
as $stale$
begin
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
  -- A non-null id on the accepted path. Returning `null::uuid` here would make
  -- the harness score EVERY event as unwritten (it reads `event_id is not null`),
  -- so the count assertion below would read 30 instead of 4 and the non-vacuity
  -- proof would be measuring the fixture rather than the gate.
  return query select gen_random_uuid(), true;
end;
$stale$;

select isnt_empty(
  $$ select checked_event || ' -> ' || coalesce(failure, 'no row returned')
       from pg_temp.write_every_declared_event('b7000001-0000-4000-8000-000000000001')
      where not wrote $$,
  'NON-VACUITY: with the historical gate restored, the completeness assertion above fails as it must'
);

select is(
  (select count(*)::int
     from pg_temp.write_every_declared_event('b7000001-0000-4000-8000-000000000001')
    where not wrote),
  4,
  'NON-VACUITY: the historical gate refuses exactly the four events it was measured refusing on hosted'
);

-- Restore, and prove the restore worked rather than assuming it.
do $$
begin
  execute (select definition from corrected_writer_definition);
end $$;

select is_empty(
  $$ select checked_event from pg_temp.write_every_declared_event('b7000001-0000-4000-8000-000000000001')
      where not wrote $$,
  'the corrected writer is restored and accepts every declared event again'
);

select * from finish();
rollback;
