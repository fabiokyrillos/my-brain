-- Phase 2P slice 2P.1: the central entry-lifecycle re-derivation contract.
--
-- Proves the contract migration 202608180098 introduces, and each of the six
-- defects that rejected candidate 202608170098:
--
--   1. both 'awaiting_review' AND 'partially_processed' are confirmable;
--   2. confirmation registers a handler-backed undo;
--   3. the terminal state is RE-DERIVED, never forced -- an entry with a real
--      decision left cannot be confirmed at all;
--   4. every audit row this contract writes carries entity_id;
--   5. 'reason' carries prose, not an operation key;
--   6. deduplication keys on (user_id, operation_key), not on the status --
--      a different key on an already-confirmed entry creates no second
--      confirmation, and the same key is a true replay.
--
-- It also proves the property the whole slice exists for: a resolution now
-- moves the entry's status, list_needs_attention agrees with the real state,
-- another owner is isolated, and none of it is vacuous.
--
-- And the two corrections CI forced, each with a two-sided control:
--
--   (a) the queue names the SPECIFIC decision that remains -- an open question,
--       an unconfirmed task candidate, an unresolved person candidate -- on
--       entries whose status is NOT 'completed'. Making the status truthful had
--       made those finer reasons LESS reachable, because they sat after the
--       generic status branch and were gated on 'completed'.
--   (b) a re-derivation preserves entries.updated_at (owner decision (i)), so
--       recalculating derived state cannot make an old entry look new or move
--       it up Needs You -- proved together with a negative control (an ordinary
--       status write is still stamped) and two positive controls (a real
--       content change is still stamped, even while the marker is set).

begin;

select plan(67);

-- Helpers --------------------------------------------------------------------

create function pg_temp.confirm(p_entry uuid, p_interpretation uuid, p_key text)
returns jsonb language plpgsql as $$
declare
  result jsonb;
  error_state text;
  error_detail text;
begin
  result := public.confirm_entry_interpretation(p_entry, p_interpretation, p_key);
  return result;
exception when others then
  get stacked diagnostics error_state = returned_sqlstate, error_detail = pg_exception_detail;
  return jsonb_build_object('__error__', true, 'sqlstate', error_state, 'detail', error_detail);
end;
$$;

create function pg_temp.undo(p_undo uuid)
returns jsonb language plpgsql as $$
declare
  result jsonb;
  error_state text;
begin
  result := public.undo_operation(p_undo);
  return result;
exception when others then
  get stacked diagnostics error_state = returned_sqlstate;
  return jsonb_build_object('__error__', true, 'sqlstate', error_state);
end;
$$;

create function pg_temp.entry_status(p_entry uuid)
returns text language sql as $$
  select status from public.entries where id = p_entry;
$$;

create function pg_temp.queue_reason(p_entry uuid)
returns text language sql as $$
  select reason from public.list_needs_attention(200, null, null) where entry_id = p_entry;
$$;

-- Structural posture ---------------------------------------------------------

select has_function(
  'public', 'confirm_entry_interpretation', array['uuid', 'uuid', 'text'],
  'the confirmation entry point exists with a text operation key'
);

select is(
  coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.confirm_entry_interpretation(uuid,uuid,text)')), false),
  true,
  'confirmation is SECURITY DEFINER'
);

select ok(
  coalesce((
    select exists (
      select 1 from unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
      where lower(setting.value) in ('search_path=', 'search_path=""')
    )
    from pg_proc procedure
    where procedure.oid = to_regprocedure('public.confirm_entry_interpretation(uuid,uuid,text)')
  ), false),
  'confirmation sets an explicit empty search_path'
);

select ok(
  has_function_privilege('authenticated', to_regprocedure('public.confirm_entry_interpretation(uuid,uuid,text)'), 'execute'),
  'authenticated can execute confirmation'
);

select ok(
  not has_function_privilege('anon', to_regprocedure('public.confirm_entry_interpretation(uuid,uuid,text)'), 'execute'),
  'anon cannot execute confirmation'
);

-- The central contract is private: no role may reach it directly, so there is
-- exactly one authority and no second path into the status column.
select ok(
  not has_function_privilege('authenticated', to_regprocedure('private.entry_lifecycle_state(uuid,uuid)'), 'execute'),
  'authenticated cannot execute the central lifecycle contract directly'
);

select ok(
  not has_function_privilege('authenticated', to_regprocedure('private.rederive_entry_lifecycle(uuid,uuid)'), 'execute'),
  'authenticated cannot execute the re-derivation directly'
);

select ok(
  not has_function_privilege('service_role', to_regprocedure('private.entry_pending_decisions(uuid,uuid)'), 'execute'),
  'service_role cannot execute the pending-decision census directly'
);

-- Defect 2: a registered undo handler exists.
select is(
  (select handler_function from private.undo_operation_handlers where action_type = 'confirm_entry_interpretation'),
  'undo_confirm_entry_interpretation',
  'confirmation is registered in the undo handler registry'
);

-- Every route reaches the contract: all four tables the twelve resolution
-- functions write carry the trigger, and they all run the same function.
select is(
  (
    select count(*)::int from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and p.proname = 'rederive_entry_lifecycle_from_row'
      and c.relname in ('tasks', 'entry_task_candidate_resolutions', 'pending_questions', 'entry_person_candidate_resolutions')
  ),
  4,
  'all four resolution tables re-derive through one trigger function'
);

-- Fixtures -------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2ba00001-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase-2p1-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2ba00002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase-2p1-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claim.sub', '2ba00001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.entries (id, user_id, original_content, source, status, locale) values
  ('2ba10001-0000-4000-8000-000000000001', '2ba00001-0000-4000-8000-000000000001', 'Phase 2P1 settled fixture', 'web', 'saved', 'en'),
  ('2ba10002-0000-4000-8000-000000000002', '2ba00001-0000-4000-8000-000000000001', 'Phase 2P1 open-question fixture', 'web', 'saved', 'en'),
  ('2ba10003-0000-4000-8000-000000000003', '2ba00001-0000-4000-8000-000000000001', 'Phase 2P1 unconfirmed-candidate fixture', 'web', 'saved', 'en'),
  ('2ba10005-0000-4000-8000-000000000005', '2ba00001-0000-4000-8000-000000000001', 'Phase 2P1 person-candidate fixture', 'web', 'saved', 'en');

insert into public.entries (id, user_id, original_content, source, status, locale) values
  ('2ba10004-0000-4000-8000-000000000004', '2ba00002-0000-4000-8000-000000000002', 'Phase 2P1 other-owner fixture', 'web', 'saved', 'en');

-- Settled entry: no candidates, no questions, no people. Its ONLY pending
-- class is the element policy, which is exactly the class no resolution action
-- can ever clear -- so it is the entry the positive confirmation act exists for.
select public.persist_entry_interpretation(
  '2ba10001-0000-4000-8000-000000000001',
  jsonb_build_object(
    'summary', 'Phase 2P1 settled', 'concepts', jsonb_build_array('lifecycle'),
    'occurredAt', now()::text, 'confidence', 0.9,
    'taskCandidates', '[]'::jsonb,
    'pendingQuestions', '[]'::jsonb
  ),
  'pgtap-fixture', 'pgtap', 'pgtap', 0, 0
);

-- Entry with a genuinely open question.
select public.persist_entry_interpretation(
  '2ba10002-0000-4000-8000-000000000002',
  jsonb_build_object(
    'summary', 'Phase 2P1 open question', 'concepts', jsonb_build_array('lifecycle'),
    'occurredAt', now()::text, 'confidence', 0.6,
    'taskCandidates', '[]'::jsonb,
    'pendingQuestions', jsonb_build_array(
      jsonb_build_object('question', 'Qual é o prazo?', 'reason', 'Nenhum prazo foi mencionado.', 'confidence', 0.5)
    )
  ),
  'pgtap-fixture', 'pgtap', 'pgtap', 0, 0
);

-- Entry with an unconfirmed task candidate and nothing else.
select public.persist_entry_interpretation(
  '2ba10003-0000-4000-8000-000000000003',
  jsonb_build_object(
    'summary', 'Phase 2P1 unconfirmed candidate', 'concepts', jsonb_build_array('lifecycle'),
    'occurredAt', now()::text, 'confidence', 0.9,
    'taskCandidates', jsonb_build_array(jsonb_build_object('title', 'Decidir depois', 'confidence', 0.9)),
    'pendingQuestions', '[]'::jsonb
  ),
  'pgtap-fixture', 'pgtap', 'pgtap', 0, 0
);

-- Entry whose only remaining decision is a person candidate.
select public.persist_entry_interpretation(
  '2ba10005-0000-4000-8000-000000000005',
  jsonb_build_object(
    'summary', 'Phase 2P1 person candidate', 'concepts', jsonb_build_array('lifecycle'),
    'occurredAt', now()::text, 'confidence', 0.9,
    'taskCandidates', '[]'::jsonb,
    'pendingQuestions', '[]'::jsonb,
    'people', jsonb_build_array(jsonb_build_object('name', 'Alex', 'confidence', 0.8, 'inferred', false))
  ),
  'pgtap-fixture', 'pgtap', 'pgtap', 0, 0
);

select set_config('request.jwt.claim.sub', '2ba00002-0000-4000-8000-000000000002', true);
select public.persist_entry_interpretation(
  '2ba10004-0000-4000-8000-000000000004',
  jsonb_build_object(
    'summary', 'Phase 2P1 other owner', 'concepts', jsonb_build_array('lifecycle'),
    'occurredAt', now()::text, 'confidence', 0.9,
    'taskCandidates', '[]'::jsonb, 'pendingQuestions', '[]'::jsonb
  ),
  'pgtap-fixture', 'pgtap', 'pgtap', 0, 0
);
select set_config('request.jwt.claim.sub', '2ba00001-0000-4000-8000-000000000001', true);

create temporary table phase2p1_refs on commit drop as
select
  (select current_interpretation_id from public.entries where id = '2ba10001-0000-4000-8000-000000000001') as settled_interpretation,
  (select current_interpretation_id from public.entries where id = '2ba10002-0000-4000-8000-000000000002') as question_interpretation,
  (select current_interpretation_id from public.entries where id = '2ba10003-0000-4000-8000-000000000003') as candidate_interpretation,
  (select current_interpretation_id from public.entries where id = '2ba10004-0000-4000-8000-000000000004') as other_interpretation,
  (select current_interpretation_id from public.entries where id = '2ba10005-0000-4000-8000-000000000005') as person_interpretation,
  (select id from public.pending_questions where entry_id = '2ba10002-0000-4000-8000-000000000002') as question_id;

-- Non-vacuity of the fixtures themselves: the defect's starting condition must
-- really exist, or every assertion below would pass on an empty premise.
select is(
  pg_temp.entry_status('2ba10001-0000-4000-8000-000000000001'),
  'awaiting_review',
  'PRE-STATE: a settled entry is nonetheless written as awaiting_review'
);

select is(
  pg_temp.entry_status('2ba10002-0000-4000-8000-000000000002'),
  'partially_processed',
  'PRE-STATE: an entry with an open question is written as partially_processed'
);

select is(
  pg_temp.queue_reason('2ba10001-0000-4000-8000-000000000001'),
  'review_interpretation',
  'PRE-STATE: the settled entry is in Needs You on the status branch'
);

-- The central census ---------------------------------------------------------

select is(
  private.entry_pending_decisions('2ba00001-0000-4000-8000-000000000001', '2ba10002-0000-4000-8000-000000000002'),
  array['open_question', 'element_policy'],
  'an open question and the element policy are both reported as pending'
);

select is(
  private.entry_pending_decisions('2ba00001-0000-4000-8000-000000000001', '2ba10003-0000-4000-8000-000000000003'),
  array['task_candidate', 'element_policy'],
  'an unconfirmed task candidate is reported as pending'
);

select is(
  private.entry_pending_decisions('2ba00001-0000-4000-8000-000000000001', '2ba10005-0000-4000-8000-000000000005'),
  array['person_candidate', 'element_policy'],
  'an unresolved person candidate is reported as pending'
);

select is(
  private.entry_lifecycle_state('2ba00001-0000-4000-8000-000000000001', '2ba10002-0000-4000-8000-000000000002'),
  'partially_processed',
  'an open question derives partially_processed'
);

select is(
  private.entry_lifecycle_state('2ba00001-0000-4000-8000-000000000001', '2ba10003-0000-4000-8000-000000000003'),
  'awaiting_review',
  'an unconfirmed candidate derives awaiting_review'
);

-- The contract declines authority over states it was not given.
update public.entries set status = 'terminal_error' where id = '2ba10003-0000-4000-8000-000000000003';
select is(
  private.entry_lifecycle_state('2ba00001-0000-4000-8000-000000000001', '2ba10003-0000-4000-8000-000000000003'),
  null,
  'the contract governs no entry outside the three lifecycle states'
);
update public.entries set status = 'awaiting_review' where id = '2ba10003-0000-4000-8000-000000000003';

select is(
  private.entry_lifecycle_state('2ba00001-0000-4000-8000-000000000001', '2ba10004-0000-4000-8000-000000000004'),
  null,
  'the contract returns nothing for an entry the caller does not own'
);

-- The queue says exactly what remains (2P-ATTENTION-004) ----------------------
--
-- Making the status truthful made the FINER reasons less reachable, not more:
-- they were gated on status = 'completed' and sequenced after the generic
-- status branch, so an entry with one unconfirmed candidate became
-- 'awaiting_review' and reported the generic 'review_interpretation'. The three
-- assertions below are the whole of that correction, each on an entry whose
-- status is NOT 'completed'.

select is(
  pg_temp.queue_reason('2ba10002-0000-4000-8000-000000000002'),
  'answer_existing_question',
  'a partially_processed entry with an open question says so, not review_interpretation'
);

select is(
  pg_temp.queue_reason('2ba10003-0000-4000-8000-000000000003'),
  'confirm_existing_candidates',
  'an awaiting_review entry with an unconfirmed task candidate says so'
);

-- Owner decision (slice 2P.1): an unresolved person candidate is a real pending
-- decision. It reports the deployed finer reason whose copy already reads
-- "decide about the suggestions" in both locales -- never the generic one, and
-- without adding a sixth value to the five-name vocabulary that
-- needs_attention_item_opened validates inside the database.
select is(
  pg_temp.queue_reason('2ba10005-0000-4000-8000-000000000005'),
  'confirm_existing_candidates',
  'an unresolved person candidate reports the specific reason, not review_interpretation'
);

-- Defect 3: a real decision cannot be confirmed away ---------------------------

select is(
  (select pg_temp.confirm('2ba10003-0000-4000-8000-000000000003', refs.candidate_interpretation, 'phase2p1-candidate-key') ->> 'sqlstate'
   from phase2p1_refs refs),
  '55P03',
  'an entry with an unconfirmed candidate refuses confirmation'
);

select is(
  (select pg_temp.confirm('2ba10003-0000-4000-8000-000000000003', refs.candidate_interpretation, 'phase2p1-candidate-key2') ->> 'detail'
   from phase2p1_refs refs),
  'task_candidate',
  'the refusal names the class that remains, and names only it'
);

select is(
  (select pg_temp.confirm('2ba10002-0000-4000-8000-000000000002', refs.question_interpretation, 'phase2p1-question-key') ->> 'sqlstate'
   from phase2p1_refs refs),
  '55P03',
  'an entry with an open question refuses confirmation'
);

select is(
  pg_temp.entry_status('2ba10002-0000-4000-8000-000000000002'),
  'partially_processed',
  'a refused confirmation changes nothing'
);

select is(
  (select count(*)::int from public.undo_operations where action_type = 'confirm_entry_interpretation'),
  0,
  'a refused confirmation records no undo operation'
);

-- A resolution now moves the status --------------------------------------------

select is(
  (select public.resolve_pending_question_v3(refs.question_id, jsonb_build_object('kind', 'answer', 'answer', 'na sexta'), 'phase2p1-answer') is not null
   from phase2p1_refs refs),
  true,
  'the question resolves through the deployed v3 path'
);

select is(
  pg_temp.entry_status('2ba10002-0000-4000-8000-000000000002'),
  'awaiting_review',
  'THE DEFECT IS FIXED: answering the question moved the entry off partially_processed'
);

select is(
  private.entry_pending_decisions('2ba00001-0000-4000-8000-000000000001', '2ba10002-0000-4000-8000-000000000002'),
  array['element_policy'],
  'only the element policy remains once the question is answered'
);

-- The same, through a version the application never calls. This is the whole
-- point of binding the contract to tables: v1 is still granted to
-- authenticated, and it must not be a route with the old behaviour.
select is(
  (select public.resolve_entry_person_candidates(
     '2ba10005-0000-4000-8000-000000000005', refs.person_interpretation,
     jsonb_build_array(jsonb_build_object('candidateIndex', 0, 'disposition', 'rejected')),
     '2ba20001-0000-4000-8000-000000000001'::uuid) is not null
   from phase2p1_refs refs),
  true,
  'the person candidate resolves through the deployed path'
);

select is(
  private.entry_pending_decisions('2ba00001-0000-4000-8000-000000000001', '2ba10005-0000-4000-8000-000000000005'),
  array['element_policy'],
  'resolving the person candidate clears it from the census'
);

-- Confirmation, and both accepted statuses -------------------------------------

select is(
  (select pg_temp.confirm('2ba10001-0000-4000-8000-000000000001', refs.settled_interpretation, 'phase2p1-settled-key') ->> 'status'
   from phase2p1_refs refs),
  'completed',
  'DEFECT 1a: an awaiting_review entry with nothing left confirms to completed'
);

select is(
  pg_temp.entry_status('2ba10001-0000-4000-8000-000000000001'),
  'completed',
  'the settled entry really is completed'
);

select is(
  pg_temp.queue_reason('2ba10001-0000-4000-8000-000000000001'),
  null,
  'the settled entry has left Needs You'
);

-- Defect 1b: the status 098 refused. The entry reached partially_processed
-- from a question, and the question is now answered.
update public.entries set status = 'partially_processed' where id = '2ba10002-0000-4000-8000-000000000002';
select is(
  (select pg_temp.confirm('2ba10002-0000-4000-8000-000000000002', refs.question_interpretation, 'phase2p1-answered-key') ->> 'status'
   from phase2p1_refs refs),
  'completed',
  'DEFECT 1b: a partially_processed entry with nothing left also confirms'
);

select is(
  pg_temp.queue_reason('2ba10002-0000-4000-8000-000000000002'),
  null,
  'the answered entry has left Needs You too'
);

-- Defects 4 and 5: the audit row ------------------------------------------------

select is(
  (select entity_id from public.audit_logs
   where action_type = 'interpretation_confirmed' and source_entry_id = '2ba10001-0000-4000-8000-000000000001'),
  '2ba10001-0000-4000-8000-000000000001'::uuid,
  'DEFECT 4: the confirmation audit row points at the entry'
);

select ok(
  (select reason not like '%operation:%' and reason not like '%phase2p1-settled-key%'
   from public.audit_logs
   where action_type = 'interpretation_confirmed' and source_entry_id = '2ba10001-0000-4000-8000-000000000001'),
  'DEFECT 5: the audit reason is prose, and carries no operation key'
);

select is(
  (select count(*)::int from public.audit_logs
   where action_type = 'entry_lifecycle_rederived' and entity_id is null),
  0,
  'every re-derivation audit row carries entity_id'
);

select ok(
  (select bool_and(before_state ? 'status' and after_state ? 'status' and not (after_state ? 'summary'))
   from public.audit_logs where action_type = 'entry_lifecycle_rederived'),
  'the re-derivation audit trail is content-minimal: statuses only'
);

-- Defect 6: deduplication on a true key ------------------------------------------

select is(
  (select pg_temp.confirm('2ba10001-0000-4000-8000-000000000001', refs.settled_interpretation, 'phase2p1-settled-key') ->> 'idempotent'
   from phase2p1_refs refs),
  'true',
  'DEFECT 6a: replaying the SAME key is idempotent'
);

select is(
  (select pg_temp.confirm('2ba10001-0000-4000-8000-000000000001', refs.settled_interpretation, 'phase2p1-different-key') ->> 'idempotent'
   from phase2p1_refs refs),
  'true',
  'DEFECT 6b: a DIFFERENT key on the same confirmed entry creates no second confirmation'
);

select is(
  (select count(*)::int from public.undo_operations
   where action_type = 'confirm_entry_interpretation' and source_entry_id = '2ba10001-0000-4000-8000-000000000001'),
  1,
  'exactly one confirmation exists for the entry, across three calls'
);

select is(
  (select count(*)::int from public.audit_logs
   where action_type = 'interpretation_confirmed' and source_entry_id = '2ba10001-0000-4000-8000-000000000001'),
  1,
  'replay duplicates no audit row'
);

select is(
  (select pg_temp.confirm('2ba10002-0000-4000-8000-000000000002', refs.question_interpretation, 'phase2p1-settled-key') ->> 'sqlstate'
   from phase2p1_refs refs),
  '22023',
  'a key already used for another entry is refused, not silently accepted'
);

-- Optimistic concurrency ----------------------------------------------------------

select is(
  (select pg_temp.confirm('2ba10003-0000-4000-8000-000000000003', refs.settled_interpretation, 'phase2p1-stale-key') ->> 'sqlstate'
   from phase2p1_refs refs),
  '55P03',
  'a stale expected interpretation is refused with 55P03, never 40001'
);

select ok(
  (select not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.proname in ('confirm_entry_interpretation', 'undo_confirm_entry_interpretation',
                         'rederive_entry_lifecycle', 'entry_pending_decisions')
       -- The ACT, not the word: pg_get_functiondef includes the body's own
       -- comments, and this contract has one explaining why 40001 is
       -- forbidden. Scanning for the string fails on the explanation.
       and pg_get_functiondef(p.oid) ~ 'errcode\s*=\s*''40001'''
   )),
  'no function in this contract raises SQLSTATE 40001'
);

-- Cross-owner isolation ------------------------------------------------------------

select is(
  (select pg_temp.confirm('2ba10004-0000-4000-8000-000000000004', refs.other_interpretation, 'phase2p1-cross-owner') ->> 'sqlstate'
   from phase2p1_refs refs),
  'P0002',
  'one owner cannot confirm another owner`s entry'
);

select is(
  pg_temp.entry_status('2ba10004-0000-4000-8000-000000000004'),
  'awaiting_review',
  'the other owner`s entry is untouched'
);

select is(
  (select count(*)::int from public.undo_operations
   where user_id = '2ba00002-0000-4000-8000-000000000002'),
  0,
  'no undo operation was written for the other owner'
);

-- Defect 2: a true undo ---------------------------------------------------------------

select is(
  (select pg_temp.undo((select id from public.undo_operations
     where action_type = 'confirm_entry_interpretation'
       and source_entry_id = '2ba10001-0000-4000-8000-000000000001')) ->> 'undone'),
  'true',
  'DEFECT 2: the confirmation is undoable through the deployed registry'
);

select is(
  pg_temp.entry_status('2ba10001-0000-4000-8000-000000000001'),
  'awaiting_review',
  'undo restores the real prior state by re-deriving it'
);

select is(
  private.entry_pending_decisions('2ba00001-0000-4000-8000-000000000001', '2ba10001-0000-4000-8000-000000000001'),
  array['element_policy'],
  'undo fabricates no unresolved decision -- only the policy returns'
);

select is(
  pg_temp.queue_reason('2ba10001-0000-4000-8000-000000000001'),
  'review_interpretation',
  'the undone entry is back in Needs You, truthfully'
);

select is(
  (select pg_temp.confirm('2ba10001-0000-4000-8000-000000000001', refs.settled_interpretation, 'phase2p1-reconfirm-key') ->> 'status'
   from phase2p1_refs refs),
  'completed',
  'the entry can be confirmed again after an undo'
);

-- Owner decision (i): a re-derivation preserves entries.updated_at -----------------------
--
-- A change of DERIVED state alone must not make an old entry look new, and must
-- not move it to the top of Needs You. Every assertion here has to plant its own
-- instant, because pgTAP runs in ONE transaction and public.set_updated_at
-- writes now(), which is transaction time -- so inside this file every ordinary
-- write lands on the identical timestamp and "did it advance?" is unanswerable
-- without a planted past value. Planting is done with the timestamp trigger
-- disabled, the same technique needs_attention_projection.sql already uses, and
-- re-enabled immediately: it is a fixture device and never the product contract.

create function pg_temp.stamp(p_entry uuid)
returns timestamptz language sql as $$
  select updated_at from public.entries where id = p_entry;
$$;

-- NEGATIVE CONTROL, first: the exception is not a property of the SHAPE of the
-- write. A direct status-only update, by anyone, is still stamped -- so the
-- contract has not been globally weakened and set_updated_at still governs
-- every write that is not this one re-derivation.
alter table public.entries disable trigger entries_updated_at;
update public.entries set status = 'awaiting_review', updated_at = now() - interval '9 days'
where id = '2ba10001-0000-4000-8000-000000000001';
alter table public.entries enable trigger entries_updated_at;
update public.entries set status = 'partially_processed'
where id = '2ba10001-0000-4000-8000-000000000001';
select is(
  pg_temp.stamp('2ba10001-0000-4000-8000-000000000001'),
  now(),
  'NEGATIVE CONTROL: a direct status-only write still advances updated_at'
);

-- The exception itself, on a status that genuinely moves.
alter table public.entries disable trigger entries_updated_at;
update public.entries set status = 'awaiting_review', updated_at = now() - interval '9 days'
where id = '2ba10001-0000-4000-8000-000000000001';
alter table public.entries enable trigger entries_updated_at;
select is(
  private.rederive_entry_lifecycle(
    '2ba00001-0000-4000-8000-000000000001', '2ba10001-0000-4000-8000-000000000001'
  ),
  'completed',
  'NON-VACUITY: the re-derivation really moves this status, so preservation is not a no-op'
);
select is(
  pg_temp.stamp('2ba10001-0000-4000-8000-000000000001'),
  now() - interval '9 days',
  'OWNER DECISION (i): a re-derivation preserves entries.updated_at exactly'
);

-- POSITIVE CONTROLS: a real change of the owner's content still advances the
-- instant, and does so even while the marker names this very entry -- because
-- the trigger independently requires that status is the ONLY column that moved.
alter table public.entries disable trigger entries_updated_at;
update public.entries set updated_at = now() - interval '9 days'
where id = '2ba10001-0000-4000-8000-000000000001';
alter table public.entries enable trigger entries_updated_at;
select set_config('my_brain.lifecycle_rederivation_entry', '2ba10001-0000-4000-8000-000000000001', true);
update public.entries set locale = 'pt-BR' where id = '2ba10001-0000-4000-8000-000000000001';
select is(
  pg_temp.stamp('2ba10001-0000-4000-8000-000000000001'),
  now(),
  'POSITIVE CONTROL: a real content change advances updated_at even with the marker set'
);

alter table public.entries disable trigger entries_updated_at;
update public.entries set status = 'awaiting_review', updated_at = now() - interval '9 days'
where id = '2ba10001-0000-4000-8000-000000000001';
alter table public.entries enable trigger entries_updated_at;
update public.entries set status = 'partially_processed', locale = 'en'
where id = '2ba10001-0000-4000-8000-000000000001';
select is(
  pg_temp.stamp('2ba10001-0000-4000-8000-000000000001'),
  now(),
  'POSITIVE CONTROL: a change that moves status AND content is stamped, marker or not'
);
select set_config('my_brain.lifecycle_rederivation_entry', '', true);

-- And the consequence the owner asked to be proved: recalculating only the
-- lifecycle leaves the queue in the order it was already in.
alter table public.entries disable trigger entries_updated_at;
update public.entries set status = 'partially_processed', updated_at = now() - interval '2 days'
where id = '2ba10005-0000-4000-8000-000000000005';
alter table public.entries enable trigger entries_updated_at;
alter table public.entries disable trigger entries_updated_at;
update public.entries set status = 'partially_processed', updated_at = now() - interval '3 days'
where id = '2ba10003-0000-4000-8000-000000000003';
alter table public.entries enable trigger entries_updated_at;

select is(
  (
    select array_agg(queue.entry_id order by queue.occurred_at desc, queue.entry_id desc)
    from public.list_needs_attention(200, null, null) as queue
    where queue.entry_id in (
      '2ba10003-0000-4000-8000-000000000003', '2ba10005-0000-4000-8000-000000000005'
    )
  ),
  array['2ba10005-0000-4000-8000-000000000005', '2ba10003-0000-4000-8000-000000000003']::uuid[],
  'ORDERING BASELINE: the queue lists the more recently touched entry first'
);

select is(
  private.rederive_entry_lifecycle(
    '2ba00001-0000-4000-8000-000000000001', '2ba10003-0000-4000-8000-000000000003'
  ),
  'awaiting_review',
  'NON-VACUITY: re-deriving the OLDER entry really changes its status'
);

select is(
  (
    select array_agg(queue.entry_id order by queue.occurred_at desc, queue.entry_id desc)
    from public.list_needs_attention(200, null, null) as queue
    where queue.entry_id in (
      '2ba10003-0000-4000-8000-000000000003', '2ba10005-0000-4000-8000-000000000005'
    )
  ),
  array['2ba10005-0000-4000-8000-000000000005', '2ba10003-0000-4000-8000-000000000003']::uuid[],
  'ORDERING: recalculating only the lifecycle does not move the entry up the queue'
);

-- Non-vacuity of the contract itself ----------------------------------------------------

-- If the re-derivation could not move a status, every "the defect is fixed"
-- assertion above would pass on a coincidence. Plant a wrong status and prove
-- the contract corrects it.
update public.entries set status = 'partially_processed' where id = '2ba10001-0000-4000-8000-000000000001';
select is(
  private.rederive_entry_lifecycle('2ba00001-0000-4000-8000-000000000001', '2ba10001-0000-4000-8000-000000000001'),
  'completed',
  'NON-VACUITY: the re-derivation really rewrites a wrong status'
);

-- And it must refuse to move one it does not govern.
update public.entries set status = 'interpreting' where id = '2ba10001-0000-4000-8000-000000000001';
select is(
  private.rederive_entry_lifecycle('2ba00001-0000-4000-8000-000000000001', '2ba10001-0000-4000-8000-000000000001'),
  'interpreting',
  'NON-VACUITY: and it leaves an ungoverned status exactly as it found it'
);

select * from finish();
rollback;
