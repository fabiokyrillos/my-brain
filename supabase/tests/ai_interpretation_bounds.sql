-- Pre-Phase-2E hardening: database-side bounds on AI-produced interpretations
-- (migration 202607250053).
--
-- The primary validation lives in the worker
-- (supabase/functions/_shared/extraction-validation.ts, held to the Node Zod
-- source of truth by src/lib/ai/extraction-parity.test.ts and exercised by
-- supabase/functions/_shared/extraction-validation.test.ts in the Deno CI job).
-- This file proves the defense-in-depth layer behind it: that the database
-- refuses model output whose values would break a downstream domain object,
-- that it does NOT impose a second completeness contract, and that the
-- correction/undo path is deliberately out of scope.

begin;

select plan(21);

-- Structural guards ----------------------------------------------------------

select has_function(
  'private',
  'enforce_ai_interpretation_bounds',
  array[]::name[],
  'the AI interpretation bounds validator exists'
);

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'private.enforce_ai_interpretation_bounds()'::regprocedure $$,
  array[true],
  'the validator is security definer, so no writer role needs execute on it'
);

select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.enforce_ai_interpretation_bounds()'::regprocedure $$,
  array[true],
  'the validator has an explicit safe search path'
);

select is(
  (
    select count(*)::int
    from unnest(array['public', 'anon', 'authenticated', 'service_role']) as grantee(role_name)
    where has_function_privilege(
      grantee.role_name,
      'private.enforce_ai_interpretation_bounds()'::regprocedure,
      'execute'
    )
  ),
  0,
  'no role can call the validator directly'
);

select has_trigger(
  'public',
  'entry_interpretations',
  'entry_interpretations_ai_bounds',
  'the bounds trigger is installed on the interpretation table'
);

select ok(
  pg_get_triggerdef(
    (
      select oid from pg_trigger
      where tgrelid = 'public.entry_interpretations'::regclass
        and tgname = 'entry_interpretations_ai_bounds'
    )
  ) like '%BEFORE INSERT%',
  'the trigger runs before insert, so nothing invalid is ever stored'
);

select ok(
  pg_get_triggerdef(
    (
      select oid from pg_trigger
      where tgrelid = 'public.entry_interpretations'::regclass
        and tgname = 'entry_interpretations_ai_bounds'
    )
  ) not like '%UPDATE%',
  'the trigger never fires on update, so immutable history and undo restores stay untouched'
);

select ok(
  pg_get_triggerdef(
    (
      select oid from pg_trigger
      where tgrelid = 'public.entry_interpretations'::regclass
        and tgname = 'entry_interpretations_ai_bounds'
    )
  ) not like '%user_corrected%',
  'the trigger is scoped to the AI origins and excludes the correction path'
);

-- Fixture --------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'ab000001-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'ai-bounds-owner@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.entries (id, user_id, original_content, source, status, locale) values
  ('ab100001-0000-4000-8000-000000000001', 'ab000001-0000-4000-8000-000000000001', 'AI bounds fixture one', 'web', 'saved', 'en'),
  ('ab100002-0000-4000-8000-000000000002', 'ab000001-0000-4000-8000-000000000001', 'AI bounds fixture two', 'web', 'saved', 'en');

select set_config('request.jwt.claim.sub', 'ab000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create function pg_temp.ai_bounds_extraction(p_overrides jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'summary', 'AI bounds fixture summary',
    'concepts', jsonb_build_array('task'),
    'occurredAt', now()::text,
    'confidence', 0.9,
    'taskCandidates', jsonb_build_array(
      jsonb_build_object(
        'title', 'Candidate zero',
        'description', null,
        'dueAt', null,
        'waitingOn', null,
        'parentIndex', null,
        'confidence', 0.9,
        'explicit', true
      )
    ),
    'pendingQuestions', '[]'::jsonb
  ) || p_overrides;
$$;

-- Returns 'accepted', or `SQLSTATE:DETAIL` so each assertion names the exact
-- guard that refused the payload rather than just "it failed".
create function pg_temp.ai_bounds_persist(p_entry_id uuid, p_overrides jsonb)
returns text
language plpgsql
as $$
declare
  failure_detail text;
begin
  perform public.persist_entry_interpretation(
    p_entry_id,
    pg_temp.ai_bounds_extraction(p_overrides),
    'pgtap-model', 'pgtap-strategy', 'pgtap-prompt', 10, 5
  );
  return 'accepted';
exception when others then
  get stacked diagnostics failure_detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(nullif(failure_detail, ''), sqlerrm);
end;
$$;

-- Valid output still persists ------------------------------------------------

select is(
  pg_temp.ai_bounds_persist('ab100001-0000-4000-8000-000000000001', '{}'::jsonb),
  'accepted',
  'a valid extraction still persists unchanged'
);

-- Values that would break a downstream domain object are refused ------------

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('summary', '   ')
  ),
  'P0001:AI_INTERPRETATION_SUMMARY_BOUNDS',
  'a blank summary is refused instead of silently nulling the interpretation in the UI'
);

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('summary', repeat('a', 2001))
  ),
  'P0001:AI_INTERPRETATION_SUMMARY_BOUNDS',
  'an over-length summary is refused instead of persisting verbatim'
);

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('taskCandidates', jsonb_build_array(
      jsonb_build_object('title', repeat('a', 241), 'confidence', 0.5)
    ))
  ),
  'P0001:AI_INTERPRETATION_CANDIDATE_TITLE_BOUNDS',
  'an over-length candidate title is refused before materialization can violate tasks_title_check'
);

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('taskCandidates', jsonb_build_array(
      jsonb_build_object('title', '   ', 'confidence', 0.5)
    ))
  ),
  'P0001:AI_INTERPRETATION_CANDIDATE_TITLE_BOUNDS',
  'a blank candidate title is refused'
);

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('taskCandidates', jsonb_build_array(
      jsonb_build_object('title', 'Candidate', 'dueAt', 'amanha de manha', 'confidence', 0.5)
    ))
  ),
  'P0001:AI_INTERPRETATION_CANDIDATE_DUE_AT',
  'a malformed dueAt is refused at the boundary instead of failing later at task materialization'
);

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('taskCandidates', jsonb_build_array(
      jsonb_build_object('title', 'Candidate', 'confidence', 1.5)
    ))
  ),
  'P0001:AI_INTERPRETATION_CANDIDATE_CONFIDENCE_BOUNDS',
  'an out-of-range candidate confidence is refused'
);

-- PostgreSQL caps a timestamptz UTC offset at ±15:59, so this is the boundary
-- the worker validator must mirror — and it is the one place where "the database
-- is at least as permissive as the worker" could have been violated. An offset
-- Zod's grammar allows (up to ±23:59) but PostgreSQL refuses would have been
-- accepted by the worker and then rejected here, burning the job's retry budget.
-- Both sides now stop at ±15:59; this assertion pins the database half.
select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('taskCandidates', jsonb_build_array(
      jsonb_build_object('title', 'Candidate', 'dueAt', '2026-07-31T12:00:00+18:00', 'confidence', 0.5)
    ))
  ),
  'P0001:AI_INTERPRETATION_CANDIDATE_DUE_AT',
  'a dueAt offset PostgreSQL cannot store is refused, and the worker refuses it first'
);

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('taskCandidates', jsonb_build_array(
      jsonb_build_object('title', 'Candidate', 'confidence', 0.5, 'parentIndex', -1)
    ))
  ),
  'P0001:AI_INTERPRETATION_CANDIDATE_PARENT_INDEX',
  'a negative parentIndex is refused'
);

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('pendingQuestions', jsonb_build_array(
      jsonb_build_object('question', '  ', 'reason', 'Motivo', 'confidence', 0.5)
    ))
  ),
  'P0001:AI_INTERPRETATION_QUESTION_BOUNDS',
  'a blank question is refused instead of being dropped while the status still counts it'
);

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('contexts', jsonb_build_array(
      jsonb_build_object('name', repeat('a', 161), 'confidence', 0.5, 'evidence', 'trecho', 'inferred', false)
    ))
  ),
  'P0001:AI_INTERPRETATION_MENTION_BOUNDS',
  'an over-length entity mention name is refused'
);

-- No second completeness contract -------------------------------------------
-- Which fields are required belongs to the worker validator and the provider
-- response schema, not to the database. A partial candidate — the exact shape
-- several existing pgTAP fixtures use — must still be accepted.

select is(
  pg_temp.ai_bounds_persist(
    'ab100002-0000-4000-8000-000000000002',
    jsonb_build_object('taskCandidates', jsonb_build_array(
      jsonb_build_object('title', 'Only a title')
    ))
  ),
  'accepted',
  'the database bounds present values without requiring a complete candidate'
);

-- The correction and undo path stays out of scope ---------------------------
-- Undo restores a historical snapshot verbatim, including one written before
-- these bounds existed, so re-validating it would make old revisions
-- un-undoable (ADR-018).

select lives_ok(
  $$
    insert into public.entry_interpretations (
      user_id, entry_id, version, origin, summary, concepts, confidence,
      model, strategy_version, prompt_version, raw_output,
      input_tokens, output_tokens
    ) values (
      'ab000001-0000-4000-8000-000000000001',
      'ab100002-0000-4000-8000-000000000002',
      99,
      'user_corrected',
      '   ',
      array[]::text[],
      0.5,
      'legacy', 'legacy', 'legacy', '{}'::jsonb,
      0, 0
    )
  $$,
  'a user_corrected snapshot is not re-validated, so undo can still restore pre-bounds history'
);

select * from finish();
rollback;
