-- Phase 2E Slice 2E.2 — deterministic candidate generation (PRD §13.2).
--
-- `list_task_command_candidates` is where the "confident wrong match" risk of
-- PRD §20 is either closed or shipped. Every claim the TypeScript matcher makes
-- rests on this function having ordered before it truncated, having filtered on
-- the action's own eligible statuses, and having used the authoritative
-- normalizer — none of which a Vitest test can observe, because all three
-- happen in SQL.
--
-- The normalizer corpus below is 2E-MATCH-008's. It is duplicated verbatim in
-- `src/features/task-commands/normalizer-divergence.test.ts`, and that test
-- fails if the two files disagree — so these are the *authoritative* values in
-- both places, proven here against the real function.

begin;
select plan(32);

-- Contract: signature, security, grants ------------------------------------

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer)'::regprocedure,
    'execute'
  ),
  'authenticated may generate its own task candidates'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer)'::regprocedure,
    'execute'
  ),
  'anon may not (2E-OWNERSHIP-003)'
);

-- 2E-MATCH-001 requires ownership enforced three times *independently*. Under
-- SECURITY DEFINER the RLS layer is not independent of the predicate layer,
-- because the definer owns the tables. This assertion is what keeps the
-- three-layer claim honest.
select is(
  (select prosecdef from pg_proc where oid =
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer)'::regprocedure),
  false,
  'the candidate query runs as the caller, so forced RLS is a real second wall'
);

-- Compared as text for the reason `phase_2e_task_command_ai_usage.sql` records:
-- `proconfig` is text[] and Postgres stores the empty value quoted.
select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid =
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer)'::regprocedure),
  'search_path=""',
  'and still pins an empty search_path'
);

-- The signature, pinned against the catalog ---------------------------------
--
-- `src/lib/supabase/database.types.ts` was hand-written for this function,
-- because `supabase gen types typescript` cannot run on a workstation without
-- Docker and refuses to run in this job without an access token it has no
-- business holding. 2E-OPERATIONS-002 still wants parity proven by content
-- comparison, so it is proven three ways: the migration declares the signature,
-- `database-types-parity.test.ts` checks the generated types against that
-- declaration, and this assertion checks both against what Postgres actually
-- built. `proargnames` is the input parameters in declaration order followed by
-- the RETURNS TABLE columns in declaration order.

select is(
  (select proargnames from pg_proc where oid =
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer)'::regprocedure),
  array['p_eligible_statuses', 'p_title_query', 'p_project_hint', 'p_context_hint', 'p_person_hint', 'p_observed_before', 'p_limit', 'task_id', 'owner_id', 'title', 'description', 'status', 'due_at', 'planned_at', 'manual_priority', 'completed_at', 'cancelled_at', 'intentional_no_due', 'no_due_reason', 'created_at', 'updated_at', 'project_ids', 'project_names', 'context_ids', 'context_names', 'person_ids', 'person_names', 'person_roles', 'project_hint_matched', 'context_hint_matched', 'person_hint_matched', 'last_audited_at', 'observed_before', 'prefilter_tier', 'token_overlap', 'query_token_count', 'effective_limit'],
  'the catalog signature is the one the migration declares and the generated types describe'
);

select is(
  (select pronargdefaults from pg_proc where oid =
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer)'::regprocedure),
  6::smallint,
  'every argument except the eligible-status array carries a default'
);

-- 2E-MATCH-008: the authoritative normalizer, pinned -----------------------
--
-- Written with unicode escapes rather than literal characters so a future
-- editor cannot silently re-encode NFC as NFD and change what is being
-- asserted — which is precisely the divergence rows three and four exist to
-- characterize.

select is(public.normalize_entity_alias(U&'Relat\00F3rio Final'), U&'relatorio final', 'corpus: western-european accents fold');
select is(public.normalize_entity_alias(U&'se\00F1or'), U&'senor', 'corpus: NFC n-tilde folds to n');
select is(public.normalize_entity_alias(U&'sen\0303or'), U&'sen or', 'corpus: the NFD spelling of the same word does not — it splits');
select is(public.normalize_entity_alias(U&'\0178'), U&'', 'corpus: U+0178 is absent from the translate map and normalizes away entirely');
select is(public.normalize_entity_alias(U&'\0142\00F3d\017A'), U&'od', 'corpus: diacritics outside Latin-1 are dropped, not folded');
select is(public.normalize_entity_alias(U&'caf\00E9'), U&'cafe', 'corpus: NFC e-acute folds to e');
select is(public.normalize_entity_alias(U&'!!!'), U&'', 'corpus: a wholly punctuation name normalizes to the empty string');
select is(public.normalize_entity_alias(U&'\00DDY'), U&'yy', 'corpus: uppercase Y-acute folds and lowercases');

-- Fixtures ------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('41111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'match-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('42222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'match-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.projects (id, user_id, name) values
  ('41000009-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Acme');

insert into public.tasks (id, user_id, title, status, created_at) values
  ('41000001-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', U&'Relat\00F3rio final', 'todo', now() - interval '5 days'),
  ('41000002-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', U&'Enviar relat\00F3rio', 'todo', now() - interval '4 days'),
  ('41000003-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Comprar leite', 'todo', now() - interval '3 days'),
  ('41000004-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', U&'Tarefa conclu\00EDda', 'completed', now() - interval '2 days'),
  ('41000005-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Tarefa cancelada', 'cancelled', now() - interval '2 days'),
  ('41000006-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Enviar fatura', 'todo', now() - interval '1 day'),
  ('42000001-2222-4222-8222-222222222222', '42222222-2222-4222-8222-222222222222', U&'Relat\00F3rio final', 'todo', now() - interval '5 days');

insert into public.task_projects (task_id, project_id, user_id) values
  ('41000006-1111-4111-8111-111111111111', '41000009-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111');

-- One historical state change, older than the rows `tasks_audit_changes` just
-- wrote for every insert above.
insert into public.audit_logs (user_id, action_type, entity_type, entity_id, actor, reason, created_at) values
  ('41111111-1111-4111-8111-111111111111', 'task_updated', 'task', '41000003-1111-4111-8111-111111111111', 'user', 'fixture', now() - interval '2 days');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"41111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

-- 2E-MATCH-001: ownership ---------------------------------------------------

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 25)),
  2,
  'only the caller''s two matching tasks are candidates'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 25)
   where owner_id <> '41111111-1111-4111-8111-111111111111'),
  0,
  'no candidate carries another owner'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 25)
   where task_id = '42000001-2222-4222-8222-222222222222'),
  0,
  'the other owner''s identically-titled task is not merely outranked, it is absent'
);

-- 2E-MATCH-003: ordered before truncation -----------------------------------

select is(
  (select prefilter_tier from public.list_task_command_candidates(
     array['todo'], U&'Relat F3rio final', null, null, null, now(), 25)
   where task_id = '41000001-1111-4111-8111-111111111111'),
  0,
  'the exact normalized title is tier 0, which is what sorts it ahead of the rest'
);

select is(
  (select prefilter_tier from public.list_task_command_candidates(
     array['todo'], U&'Relat F3rio final', null, null, null, now(), 25)
   where task_id = '41000002-1111-4111-8111-111111111111'),
  2,
  'and a token-only match is tier 2, so truncation can never prefer it'
);

-- 2E-MATCH-002: eligibility is the action''s, not the table''s ---------------

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['completed'], 'tarefa', null, null, null, now(), 25)),
  1,
  'reopen_task''s eligible set ranks the completed task and not the cancelled one'
);

select is(
  (select task_id from public.list_task_command_candidates(
     array['cancelled'], 'tarefa', null, null, null, now(), 25)),
  '41000005-1111-4111-8111-111111111111'::uuid,
  'restore_task is the only action for which a cancelled task is ranked'
);

-- 2E-MATCH-004: overflow is detectable --------------------------------------

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 1)),
  2,
  'a limit of one returns two rows, so the caller can tell the set was truncated'
);

select is(
  (select distinct effective_limit from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 1)),
  1,
  'and the limit actually applied is reported, not assumed'
);

-- Relation hints qualify as well as score -----------------------------------

select is(
  (select task_id from public.list_task_command_candidates(
     array['todo'], null, 'Acme', null, null, now(), 25)),
  '41000006-1111-4111-8111-111111111111'::uuid,
  'a project hint reaches a task no lexical signal connects to the command'
);

-- Relations travel with their ids -------------------------------------------
--
-- 2E-PREVIEW-005 must detect "assigning a relation the task already holds", and
-- comparing names in TypeScript would mean re-normalizing them there.

select is(
  (select project_ids from public.list_task_command_candidates(
     array['todo'], null, 'Acme', null, null, now(), 25)),
  array['41000009-1111-4111-8111-111111111111'::uuid],
  'a candidate carries the ids of its relations, not only their names'
);

-- The counts the TypeScript scorer is not allowed to re-derive ---------------

select is(
  (select distinct query_token_count from public.list_task_command_candidates(
     array['todo'], U&'Relat\00F3rio final', null, null, null, now(), 25)),
  2,
  'the hint''s token count comes from the authoritative normalizer'
);

select is(
  (select token_overlap from public.list_task_command_candidates(
     array['todo'], U&'Relat\00F3rio final', null, null, null, now(), 25)
   where task_id = '41000002-1111-4111-8111-111111111111'),
  1,
  'and so does each candidate''s overlap with it'
);

-- 2E-MATCH-006: recency excludes the current command ------------------------

select is(
  (select last_audited_at from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25)
   where task_id = '41000003-1111-4111-8111-111111111111'),
  now() - interval '2 days',
  'audit rows at or after the injected instant are excluded, so a command cannot see its own writes'
);

select is(
  (select last_audited_at from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now() + interval '1 minute', 25)
   where task_id = '41000003-1111-4111-8111-111111111111'),
  now(),
  'and move the instant forward and the newer row is visible'
);

-- Fail closed ---------------------------------------------------------------

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo', 'not_a_status'], U&'relat\00F3rio', null, null, null, now(), 25)),
  2,
  'a status outside the eight literals is dropped rather than widening candidacy'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array[]::text[], U&'relat\00F3rio', null, null, null, now(), 25)),
  0,
  'an empty eligible set yields no candidates at all'
);

-- The hint cannot widen its own pattern -------------------------------------
--
-- `normalize_entity_alias` replaces every non-alphanumeric run with a space, so
-- a `%` in a model-supplied hint becomes a token boundary rather than a
-- wildcard. Without that, one character would match every task the user owns.

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'rel%rio', null, null, null, now(), 25)),
  0,
  'a LIKE metacharacter in a hint matches nothing instead of everything'
);

select * from finish();
rollback;
