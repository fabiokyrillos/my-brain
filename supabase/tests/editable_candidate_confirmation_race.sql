begin;

select plan(6);

select has_function(
  'public',
  'guard_v2_confirmed_interpretation_correction',
  array[]::text[],
  'v2 confirmation installs the correction-race guard'
);
select results_eq(
  $$
    select prosecdef
    from pg_proc
    where oid = to_regprocedure('public.guard_v2_confirmed_interpretation_correction()')
  $$,
  array[true],
  'the correction-race guard is security definer'
);
select results_eq(
  $$
    select 'search_path=""' = any(proconfig)
    from pg_proc
    where oid = to_regprocedure('public.guard_v2_confirmed_interpretation_correction()')
  $$,
  array[true],
  'the correction-race guard has an empty search path'
);
select has_trigger(
  'public',
  'entry_interpretations',
  'entry_interpretations_guard_v2_confirmation_correction',
  'user corrections execute the v2 confirmation guard'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '2c300001-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'phase-2c-race@example.test',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select set_config('request.jwt.claim.sub', '2c300001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.entries (
  id, user_id, original_content, source, status, locale
) values (
  '2c310001-0000-4000-8000-000000000001',
  '2c300001-0000-4000-8000-000000000001',
  'Phase 2C correction race fixture',
  'web',
  'saved',
  'en'
);

select public.persist_entry_interpretation(
  '2c310001-0000-4000-8000-000000000001',
  jsonb_build_object(
    'summary', 'Phase 2C correction race fixture',
    'concepts', jsonb_build_array('task'),
    'occurredAt', '2026-07-19T12:00:00.000Z',
    'confidence', 0.9,
    'contexts', '[]'::jsonb,
    'organizations', '[]'::jsonb,
    'projects', '[]'::jsonb,
    'people', '[]'::jsonb,
    'taskCandidates', jsonb_build_array(
      jsonb_build_object(
        'title', 'Race candidate',
        'description', null,
        'dueAt', null,
        'waitingOn', null,
        'parentIndex', null,
        'confidence', 0.9
      )
    ),
    'pendingQuestions', '[]'::jsonb
  ),
  'gpt-test',
  'strategy-1',
  'prompt-1',
  10,
  10
);

create temporary table phase2c_race_confirmation as
select public.confirm_entry_task_candidates_v2(
  '2c310001-0000-4000-8000-000000000001',
  (
    select current_interpretation_id
    from public.entries
    where id = '2c310001-0000-4000-8000-000000000001'
  ),
  array[0],
  '[]'::jsonb,
  'pgtap:phase2c:race-confirmation'
) as result;

select throws_ok(
  $$
    select public.correct_entry_interpretation(
      '2c310001-0000-4000-8000-000000000001',
      1,
      jsonb_build_object(
        'summary', 'Blocked correction',
        'concepts', jsonb_build_array('task'),
        'occurredAt', '2026-07-19T12:00:00.000Z',
        'extractedDates', '[]'::jsonb,
        'entityLinks', '[]'::jsonb,
        'classifications', jsonb_build_object(
          'summary', 'interpretation',
          'concepts', 'interpretation',
          'occurredAt', 'fact',
          'entities', 'interpretation'
        ),
        'pendingQuestions', '[]'::jsonb,
        'elementTrust', jsonb_build_object(
          'summary', jsonb_build_object(
            'score', 0.9,
            'policy', 'auto_apply',
            'signals', '{}'::jsonb,
            'overrides', '[]'::jsonb,
            'evidence', '[]'::jsonb
          )
        ),
        'recordOnly', false
      ),
      'pgtap:phase2c:race-correction-blocked',
      'race test'
    )
  $$,
  '55P03',
  'Interpretation changed; reload before saving',
  'an active v2 confirmation wins against a waiting correction'
);

select public.undo_operation((result ->> 'undo_id')::uuid)
from phase2c_race_confirmation;

select lives_ok(
  $$
    select public.correct_entry_interpretation(
      '2c310001-0000-4000-8000-000000000001',
      1,
      jsonb_build_object(
        'summary', 'Correction after undo',
        'concepts', jsonb_build_array('task'),
        'occurredAt', '2026-07-19T12:00:00.000Z',
        'extractedDates', '[]'::jsonb,
        'entityLinks', '[]'::jsonb,
        'classifications', jsonb_build_object(
          'summary', 'interpretation',
          'concepts', 'interpretation',
          'occurredAt', 'fact',
          'entities', 'interpretation'
        ),
        'pendingQuestions', '[]'::jsonb,
        'elementTrust', jsonb_build_object(
          'summary', jsonb_build_object(
            'score', 0.9,
            'policy', 'auto_apply',
            'signals', '{}'::jsonb,
            'overrides', '[]'::jsonb,
            'evidence', '[]'::jsonb
          )
        ),
        'recordOnly', false
      ),
      'pgtap:phase2c:race-correction-after-undo',
      'race test after undo'
    )
  $$,
  'undoing the v2 confirmation releases the correction boundary'
);

select * from finish();
rollback;
