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
select plan(73);

-- Contract: signature, security, grants ------------------------------------

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure,
    'execute'
  ),
  'authenticated may generate its own task candidates'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure,
    'execute'
  ),
  'anon may not (2E-OWNERSHIP-003)'
);

-- `security definer`, and pinned as such.
--
-- `security invoker` was written first, because 2E-MATCH-001 literally wants
-- RLS as an independent second wall. It cannot run: `202607170020:314` revokes
-- EXECUTE on `normalize_entity_alias` from `authenticated`, and its non-null
-- `proconfig` stops the planner inlining it, so every lexical decision in the
-- function would raise 42501 for the only role that calls it.
--
-- The consequence is that inside this function the `auth.uid()` predicate is
-- the whole wall. That is why the cross-owner cases below assert *absence* in
-- both directions, and why the null-caller case exists at all: under definer
-- they are the proof rather than a second opinion.
select is(
  (select prosecdef from pg_proc where oid =
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure),
  true,
  'the candidate query is SECURITY DEFINER, because normalize_entity_alias is not executable by authenticated'
);

-- Compared as text for the reason `phase_2e_task_command_ai_usage.sql` records:
-- `proconfig` is text[] and Postgres stores the empty value quoted.
select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid =
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure),
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
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure),
  array['p_eligible_statuses', 'p_title_query', 'p_project_hint', 'p_context_hint', 'p_person_hint', 'p_observed_before', 'p_limit', 'p_project_ref', 'p_context_ref', 'p_person_ref', 'task_id', 'owner_id', 'title', 'description', 'status', 'due_at', 'planned_at', 'manual_priority', 'completed_at', 'cancelled_at', 'intentional_no_due', 'no_due_reason', 'created_at', 'updated_at', 'project_ids', 'project_names', 'context_ids', 'context_names', 'person_ids', 'person_names', 'person_roles', 'project_hint_matched', 'context_hint_matched', 'person_hint_matched', 'last_audited_at', 'observed_before', 'prefilter_tier', 'token_overlap', 'query_token_count', 'effective_limit', 'project_ref_id', 'context_ref_id', 'person_ref_id', 'project_ref_name', 'context_ref_name', 'person_ref_name', 'scheduled_reminder_count', 'next_reminder_at'],
  'the catalog signature is the one the migration declares and the generated types describe'
);

select is(
  (select pronargdefaults from pg_proc where oid =
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure),
  9::smallint,
  'every argument except the eligible-status array carries a default: nine of them, after Slice 2E.3 appended the three relation references'
);

-- 2E-MATCH-008: the authoritative normalizer, pinned -----------------------
--
-- Written with unicode escapes rather than literal characters so a future
-- editor cannot silently re-encode NFC as NFD and change what is being
-- asserted — which is precisely the divergence rows three and four exist to
-- characterize.

select is(public.normalize_entity_alias(U&'Relat\00F3rio Final'), U&'relatorio final', 'corpus: western-european accents fold');
select is(public.normalize_entity_alias(U&'se\00F1or'), U&'senor', 'corpus: NFC n-tilde folds to n');
select is(public.normalize_entity_alias(U&'sen\0303or'), U&'sen or', 'corpus: the NFD spelling of the same word does not - it splits');
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
  ('41000009-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Acme'),
  -- A second owner's project with the *same* name. The output laterals filter
  -- on `r.user_id` and join on `p.user_id = tp.user_id`; nothing proved that
  -- until there was a same-named row on the other side of the boundary to
  -- confuse them.
  ('42000009-2222-4222-8222-222222222222', '42222222-2222-4222-8222-222222222222', 'Acme');

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

-- Slice 2E.3 fixtures ---------------------------------------------------------
--
-- Everything below exists for the three relation references and the reminder
-- projection, and every row of it is chosen so that no assertion above changes
-- value. No new task is created, so the eligible population stays the four
-- `todo` rows the wholly-metacharacter case pins at 4. No new project, context
-- or person is linked to a task that an assertion above already inspects,
-- except one person on task 41000006 under a role no assertion above reads -
-- and a relation hint reaches a candidate only through `task_projects`,
-- `task_contexts` or `task_people`, never through a reference.

insert into public.projects (id, user_id, name) values
  -- Equality, not containment. A reference of 'Globex' must not resolve here,
  -- while `project_hint` would have matched it as a complete word.
  ('4100000a-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Globex Industries'),
  -- Written as an escape for the reason the corpus above is: the whole point of
  -- the assertion is that the accented spelling is what is stored, and an
  -- editor re-encoding it would silently make the test tautological.
  ('4100000b-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', U&'Or\00E7amento Anual'),
  -- Two owned projects that normalize to one name. `projects_user_name_idx` is
  -- on `(user_id, lower(name))`, and these two differ under `lower` while
  -- collapsing under `normalize_entity_alias` — which is exactly the ambiguity
  -- `resolve_owned_entity_exact` refuses to guess at.
  ('4100000c-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Duplicado'),
  ('4100000d-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', U&'Duplic\00E1do'),
  -- Owned only by the second user. The first user naming it must resolve
  -- nothing, rather than reaching across the owner boundary.
  ('4200000a-2222-4222-8222-222222222222', '42222222-2222-4222-8222-222222222222', 'Initech');

insert into public.contexts (id, user_id, name) values
  ('41000019-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Casa');

insert into public.people (id, user_id, name) values
  ('41000029-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Bruno Silva');

-- The person *is* on a task, under a role. A reference is the patch's, not the
-- task's, so it must resolve identically for a candidate that already holds
-- this person and for one that holds nobody at all.
insert into public.task_people (task_id, person_id, user_id, role) values
  ('41000006-1111-4111-8111-111111111111', '41000029-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'waiting_on');

-- Reminders on one task and none on another. The `sent` and `cancelled` rows
-- are deliberately *earlier* than both scheduled ones, so a projection that
-- forgot the status filter would report a different count **and** a different
-- next instant — a filter regression cannot pass by coincidence.
insert into public.reminders (id, user_id, task_id, title, remind_at, status) values
  ('41000031-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', '41000003-1111-4111-8111-111111111111', 'Comprar leite', now() + interval '2 hours', 'scheduled'),
  ('41000032-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', '41000003-1111-4111-8111-111111111111', 'Comprar leite de novo', now() + interval '5 hours', 'scheduled'),
  ('41000033-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', '41000003-1111-4111-8111-111111111111', 'Ja disparado', now() - interval '1 hour', 'sent'),
  ('41000034-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', '41000003-1111-4111-8111-111111111111', 'Ja cancelado', now() + interval '30 minutes', 'cancelled');

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
     array['todo'], U&'Relat\00F3rio final', null, null, null, now(), 25)
   where task_id = '41000001-1111-4111-8111-111111111111'),
  0,
  'the exact normalized title is tier 0, which is what sorts it ahead of the rest'
);

select is(
  (select prefilter_tier from public.list_task_command_candidates(
     array['todo'], U&'Relat\00F3rio final', null, null, null, now(), 25)
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

-- The other direction, and no direction at all -------------------------------

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"42222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 25)),
  1,
  'the second owner sees exactly its own matching task and none of the first owner''s'
);

-- Asserted as *absence*, matching the first direction. The count above already
-- implies it given these fixtures, but this file's header claims absence is
-- proven in both directions, and a count is not that claim. Under `security
-- definer` these assertions are the ownership proof rather than a second
-- opinion, so the two directions are held to the same standard.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 25)
   where owner_id <> '42222222-2222-4222-8222-222222222222'),
  0,
  'and no candidate it receives carries the first owner'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 25)
   where task_id = '41000001-1111-4111-8111-111111111111'),
  0,
  'the first owner''s identically-titled task is absent for the second owner too'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', null, null, null, now(), 25)),
  0,
  'and a caller with no identity gets nothing, rather than everything'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"41111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

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

-- The projected relations are the caller's own ------------------------------

select is(
  (select project_names from public.list_task_command_candidates(
     array['todo'], null, 'Acme', null, null, now(), 25)
   where task_id = '41000006-1111-4111-8111-111111111111'),
  array['Acme'],
  'the relation projection carries the caller''s project and not the identically-named one next door'
);

select is(
  (select project_ids from public.list_task_command_candidates(
     array['todo'], null, 'Acme', null, null, now(), 25)
   where task_id = '41000006-1111-4111-8111-111111111111'),
  array['41000009-1111-4111-8111-111111111111'::uuid],
  'and it is the caller''s project id, so a preview cannot link the wrong row'
);

-- The limit clamp, at the bounds the TypeScript layer raises outside of -------
--
-- `describeUnreachableCandidates` refuses an `effective_limit` outside [1,100],
-- so these are the values whose drift is an outage rather than a nuisance, and
-- only `p_limit = 1` was ever exercised.

select is(
  (select distinct effective_limit from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 0)),
  1,
  'a limit of zero clamps up to one rather than returning nothing'
);

select is(
  (select distinct effective_limit from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 101)),
  100,
  'a limit above the ceiling clamps down to one hundred'
);

select is(
  (select distinct effective_limit from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), null)),
  25,
  'and a null limit falls back to the declared default'
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

-- `_` is the other LIKE wildcard, and the more dangerous of the two here: it
-- matches exactly one character, so an unescaped `rel_rio` would match the
-- normalized `relatorio`-free titles at token level without looking like a
-- wildcard to a reviewer skimming the hint.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'rel_rio', null, null, null, now(), 25)),
  0,
  'a LIKE single-character wildcard is a token boundary, not a match of one character'
);

-- Backslash is LIKE's default escape character, so it is the one metacharacter
-- that can raise rather than merely over-match. Built with `chr(92)` rather
-- than written as a literal: a scripted edit to this file turned an escape into
-- a NUL byte twice, and Postgres rejects a NUL (22021) by aborting the whole
-- file, which silently voids every assertion in it.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'rel' || chr(92) || 'rio', null, null, null, now(), 25)),
  0,
  'an embedded backslash neither escapes nor matches'
);

-- A *trailing* backslash is the 22025 case: `like '% relatorio\ %'` would raise
-- `invalid escape sequence` and take the whole query with it. Normalization
-- removes it before any pattern is built, so the hint behaves exactly as the
-- same hint without it - two tasks whose normalized titles carry `relatorio` as
-- a complete word.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'relatorio' || chr(92), null, null, null, now(), 25)),
  2,
  'a trailing backslash cannot raise 22025, and the hint still matches on its own terms'
);

-- A hint made only of metacharacters normalizes to the empty string, which is
-- the documented no-hint path: every eligible task of the *caller* becomes a
-- candidate and the overflow flag is what says the truncation was arbitrary.
-- What it must not do is reach further than an absent hint would - across the
-- eligible statuses, or across the owner boundary.
-- Pinned to 4, not merely compared against the null-hint call: two counts
-- compared against each other are both satisfied by zero, so the assertion
-- survived the function regressing to returning nothing at all.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], '%_' || chr(92), null, null, null, now(), 25)),
  4,
  'a wholly-metacharacter hint returns the caller''s four eligible tasks, exactly as an absent hint does'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], '%_' || chr(92), null, null, null, now(), 25)),
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 25)),
  'and it is the same set an absent hint produces, never a wider one'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], '%', null, null, null, now(), 25)
   where owner_id <> '41111111-1111-4111-8111-111111111111'),
  0,
  'and a bare wildcard still reaches nothing the caller does not own'
);

-- Determinism survives the metacharacters: the same hint twice returns the same
-- rows in the same order, which is what 2E-MATCH-003 promises before truncation.
-- `array_agg` without its own ORDER BY preserves the order rows arrive in, so
-- comparing two aggregations compares the two executions' orderings.
select is(
  (select array_agg(task_id) from public.list_task_command_candidates(
     array['todo'], 'relatorio' || chr(92), null, null, null, now(), 25)),
  (select array_agg(task_id) from public.list_task_command_candidates(
     array['todo'], 'relatorio' || chr(92), null, null, null, now(), 25)),
  'and the order is identical across executions of the same escaped hint'
);

-- 2E-PREVIEW-003: the reminders a transition would actually touch -------------
--
-- `due_at is not null` is not a substitute for this, because
-- `create_due_task_reminder` fires only `after insert on public.tasks` — a due
-- date set by any later UPDATE leaves no reminder — and `authenticated` may
-- delete reminders directly. A preview that promises to cancel a reminder that
-- does not exist is inventing an effect, not disclosing one.
--
-- `comprar leite` is an exact normalized title, and no other eligible task
-- shares a token with it, so the call below returns exactly one row and the
-- scalar subqueries are total.

select is(
  (select scheduled_reminder_count from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25)),
  2,
  'only scheduled reminders are counted: the sent and the cancelled row are inert and are not disclosed'
);

select is(
  (select next_reminder_at from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25)),
  now() + interval '2 hours',
  'and the next instant is the earliest scheduled one, never the earlier sent or cancelled row'
);

-- The zero case, asserted before the null case on purpose: a `where task_id`
-- filter that matched nothing would make the null assertion below pass
-- vacuously, and this one - over the same call and the same filter - is what
-- proves the row is there to have a null.
select is(
  (select scheduled_reminder_count from public.list_task_command_candidates(
     array['todo'], 'enviar fatura', null, null, null, now(), 25)
   where task_id = '41000006-1111-4111-8111-111111111111'),
  0,
  'a task with no reminder at all reports zero rather than null'
);

select is(
  (select next_reminder_at from public.list_task_command_candidates(
     array['todo'], 'enviar fatura', null, null, null, now(), 25)
   where task_id = '41000006-1111-4111-8111-111111111111'),
  null::timestamptz,
  'and its next instant is null, so a preview cannot promise to cancel a reminder that does not exist'
);

-- The patch's relation references (2E-PREVIEW-005) ---------------------------
--
-- These are what the command wants to *assign*, resolved through
-- `resolve_owned_entity_exact` so that 2E-PREVIEW-005 can compare ids rather
-- than re-normalizing names in TypeScript — the divergence 2E-MATCH-008
-- characterizes and `normalizer-divergence.test.ts` forbids structurally.
--
-- Every call below uses the single-row `comprar leite` hint, so a scalar
-- subquery is total, and the cases that expect null are written as counts
-- instead: a scalar subquery over zero rows is also null, which would make the
-- interesting assertions pass for the wrong reason.

select is(
  (select project_ref_id from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'ORCAMENTO ANUAL', null, null)),
  '4100000b-1111-4111-8111-111111111111'::uuid,
  'a reference resolves through the authoritative normalizer, so an unaccented uppercase reference finds the accented stored name'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'Globex', null, null)
   where project_ref_id is null),
  1,
  'a reference is equality and never containment: Globex does not resolve to the project named Globex Industries'
);

select is(
  (select project_ref_id from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'globex industries', null, null)),
  '4100000a-1111-4111-8111-111111111111'::uuid,
  'and the whole name does resolve, so the null above is exactness rather than a missing project'
);

select is(
  (select project_ref_id from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'Acme', null, null)),
  '41000009-1111-4111-8111-111111111111'::uuid,
  'a reference resolves to the caller''s own project, never to the identically-named one the second owner has'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'Initech', null, null)
   where project_ref_id is null),
  1,
  'and a project only the second owner has resolves to nothing for the first'
);

-- `resolve_owned_entity_exact` is exact-or-nothing by construction: it counts
-- `distinct id` across the owned union and returns a row only when the count is
-- one (`202607170020:374-379`). Null therefore means "no owned entity of that
-- name, *or* more than one", and the preview says so truthfully rather than
-- picking the lower uuid.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'Duplicado', null, null)
   where project_ref_id is null),
  1,
  'two owned projects that normalize to one name resolve to nothing rather than to whichever sorts first'
);

select is(
  (select context_ref_id from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     null, 'casa', null)),
  '41000019-1111-4111-8111-111111111111'::uuid,
  'a context reference resolves on the same terms, against the 120-character column'
);

select is(
  (select person_ref_id from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     null, null, 'BRUNO SILVA')),
  '41000029-1111-4111-8111-111111111111'::uuid,
  'a person reference resolves for a candidate that holds no person at all'
);

select is(
  (select person_ref_id from public.list_task_command_candidates(
     array['todo'], 'enviar fatura', null, null, null, now(), 25,
     null, null, 'Bruno Silva')
   where task_id = '41000006-1111-4111-8111-111111111111'),
  '41000029-1111-4111-8111-111111111111'::uuid,
  'and identically for the candidate that already holds that person as waiting_on: the reference is the patch''s, not the task''s'
);

-- Query-scalar, like `observed_before` and `effective_limit`. A result set
-- whose rows disagree is a broken contract, and `candidates.ts` refuses it on
-- exactly that ground - so the count is pinned to four rather than compared
-- against zero disagreements, which zero rows would also satisfy.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 25,
     'orcamento anual', 'Casa', 'Bruno Silva')
   where project_ref_id = '4100000b-1111-4111-8111-111111111111'::uuid
     and context_ref_id = '41000019-1111-4111-8111-111111111111'::uuid
     and person_ref_id = '41000029-1111-4111-8111-111111111111'::uuid),
  4,
  'the three references are query-scalar: every one of the caller''s four candidates carries the same resolved ids'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 25)
   where project_ref_id is null and context_ref_id is null and person_ref_id is null),
  4,
  'and an omitted reference is null on every row rather than an accidental resolution'
);

-- The resolved entity's stored name (2E-PREVIEW-002) ------------------------
--
-- The id alone cannot name the thing the preview is about to add. A review
-- proved `relationAfter` was looking the resolved id up in the arrays of
-- relations the task *already holds*, so the name resolved only in the
-- `no_change` case and the real addition rendered a bare "+1".
--
-- What these assert is that the *stored* name comes back, not the caller's
-- reference text. `normalize_entity_alias` folds case, accents and punctuation,
-- so an unaccented uppercase reference legitimately resolves an accented
-- mixed-case project - and echoing the typing back would confirm something the
-- database does not hold. The accented fixture is what makes the two
-- distinguishable, and it is written with unicode escapes for the reason the
-- corpus above is: an editor re-encoding the character would silently make the
-- assertion tautological.

select is(
  (select project_ref_name from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'ORCAMENTO ANUAL', null, null)),
  U&'Or\00E7amento Anual',
  'the stored name comes back for the resolved project, not the unaccented uppercase reference the caller sent'
);

select is(
  (select context_ref_name from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     null, 'casa', null)),
  'Casa',
  'and for the resolved context, with its stored capitalization rather than the lowercase reference'
);

select is(
  (select person_ref_name from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     null, null, 'BRUNO SILVA')),
  'Bruno Silva',
  'and for the resolved person, likewise'
);

-- A name exists exactly when its id does. Written as a count over the whole
-- result set rather than as a scalar subquery, because a scalar subquery over
-- zero rows is also null and would satisfy the claim for the wrong reason.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 25)
   where project_ref_name is null and context_ref_name is null and person_ref_name is null),
  4,
  'an omitted reference carries no name either, on every row'
);

-- The unresolvable case, and the one that matters most: `Duplicado` names two
-- owned projects that collapse under the authoritative normalizer, so
-- `resolve_owned_entity_exact` returns nothing. A preview must be unable to
-- label a relation it could not identify, so the name has to be null alongside
-- the id rather than naming whichever row sorts first.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'Duplicado', null, null)
   where project_ref_id is null and project_ref_name is null),
  1,
  'an ambiguous reference resolves to neither an id nor a name'
);

-- A project only the second owner has. The name subqueries carry their own
-- `user_id = ri.owner_id` predicate on top of the owner-scoped resolver, and
-- `sql-reachability.test.ts` anchors that; what is observable *through* this
-- function is that a caller naming someone else's project is told nothing about
-- it - neither its id nor its name.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], 'comprar leite', null, null, null, now(), 25,
     'Initech', null, null)
   where project_ref_name is null),
  1,
  'and a project only the second owner has yields no name for the first, rather than the name of a row it does not own'
);

-- Query-scalar exactly as the three ids are: resolved once by the `refs` CTE and
-- cross-joined onto every row. `candidates.ts` refuses a set whose rows disagree
-- about one, so a per-row name would make the TypeScript layer reject legal
-- result sets. Pinned to four rather than compared against zero disagreements,
-- which zero rows would also satisfy.
select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 25,
     'orcamento anual', 'Casa', 'Bruno Silva')
   where project_ref_name = U&'Or\00E7amento Anual'
     and context_ref_name = 'Casa'
     and person_ref_name = 'Bruno Silva'),
  4,
  'the three names are query-scalar: every one of the caller''s four candidates carries the same stored names'
);

-- 2E-MATCH-003 under the amendment: the references changed nothing -----------
--
-- This is the assertion the whole amendment rests on. `writesRelation` exists
-- in `matching.ts` because the relation a command is *adding* must never boost
-- the task that already holds it, and a review proved that defect reached a
-- one-step apply. So the references must reach neither candidacy nor ordering:
-- the same call with and without them returns the same rows in the same order.
--
-- The hinted call is the probe that matters. Its project reference is 'Acme',
-- which is precisely the relation task 41000006 already holds, and 'Bruno
-- Silva' is the person task 41000006 already holds as waiting_on - so a leak
-- into the tier or into the hit-count tiebreak would move that row.

select is(
  (select array_agg(task_id) from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', 'Acme', null, null, now(), 25)),
  (select array_agg(task_id) from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', 'Acme', null, null, now(), 25,
     'Acme', 'Casa', 'Bruno Silva')),
  'supplying the three references changes neither the row set nor the row order of a hinted call'
);

-- Pinned against a literal, not only against the other call: two aggregations
-- compared to each other are both satisfied by null, so the invariance above
-- would survive the function regressing to returning nothing.
select is(
  (select array_agg(task_id) from public.list_task_command_candidates(
     array['todo'], U&'relat\00F3rio', 'Acme', null, null, now(), 25,
     'Acme', 'Casa', 'Bruno Silva')),
  array[
    '41000002-1111-4111-8111-111111111111'::uuid,
    '41000001-1111-4111-8111-111111111111'::uuid,
    '41000006-1111-4111-8111-111111111111'::uuid
  ],
  'and the order it is invariant under is the declared one: both tier-1 title matches, newest first, then the project-hint-only tier 2'
);

select is(
  (select array_agg(task_id) from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 25)),
  (select array_agg(task_id) from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 25,
     'Acme', 'Casa', 'Bruno Silva')),
  'and the hintless call, where every eligible task is a candidate, is invariant under them too'
);

select * from finish();
rollback;
