-- Phase 2P slice 2P.4 -- per-category automation policy and calibration.
--
-- WHAT THIS FILE IS FOR
--
-- The whole slice is a refusal: six categories, none of them automatic, and a
-- gate that says no for a specific and legible reason. A suite that only
-- asserted refusals could be satisfied by a function that returns `false`
-- unconditionally, so section 6 makes the gate say YES under synthetic
-- calibration. Every `false` elsewhere is then a refusal rather than a
-- constant, and every threshold is proved to be load-bearing by moving one
-- input at a time across it.
--
-- The negative controls matter as much: an unknown state must degrade WITHOUT
-- raising (a refusal the owner cannot read is not fail-closed, it is a broken
-- screen), `retained` must produce no evidence at all, and another owner's
-- reviews must not calibrate this one.

-- ORDERING IS EXPLICIT, NOT INCIDENTAL. `now()` is transaction time, so every
-- row this file inserts carries the SAME default instant and "the 20 most
-- recent observations" would be decided by a random uuid tiebreak. Section 6
-- therefore dates its synthetic rows with explicit offsets, and the assertions
-- that depend on recency are deterministic because of it.

begin;
select plan(47);

-- ---------------------------------------------------------------------------
-- Fixtures -- two owners, one entry and one interpretation each.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('4a000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   '2p4-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('4a000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   '2p4-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (id, user_id, original_content, source, status, locale)
values
  ('4a00e001-0000-4000-8000-000000000001', '4a000001-0000-4000-8000-000000000001',
   'Comprar leite e ligar para a Ana', 'web', 'saved', 'pt-BR'),
  ('4a00e002-0000-4000-8000-000000000002', '4a000002-0000-4000-8000-000000000002',
   'Entrada do outro dono', 'web', 'saved', 'pt-BR');

insert into public.entry_interpretations (
  id, user_id, entry_id, version, model, strategy_version, prompt_version,
  confidence, raw_output, summary, task_candidates
) values
  ('4a001001-0000-4000-8000-000000000001', '4a000001-0000-4000-8000-000000000001',
   '4a00e001-0000-4000-8000-000000000001', 1, 'pgtap', 'v1', 'v1', 0.95, '{}'::jsonb,
   'Interpretacao do dono',
   '[{"title":"Comprar leite"},{"title":"Ligar para Ana"},{"title":"Revisar contrato"},{"title":"Adiado"}]'::jsonb),
  ('4a001002-0000-4000-8000-000000000002', '4a000002-0000-4000-8000-000000000002',
   '4a00e002-0000-4000-8000-000000000002', 1, 'pgtap', 'v1', 'v1', 0.95, '{}'::jsonb,
   'Interpretacao do outro dono',
   '[{"title":"Somente do outro dono"}]'::jsonb);

insert into public.tasks (id, user_id, title, status) values
  ('4a007001-0000-4000-8000-000000000001', '4a000001-0000-4000-8000-000000000001', 'Comprar leite', 'todo'),
  ('4a007002-0000-4000-8000-000000000002', '4a000001-0000-4000-8000-000000000001', 'Ligar para a Ana amanha', 'todo'),
  ('4a007003-0000-4000-8000-000000000003', '4a000002-0000-4000-8000-000000000002', 'Somente do outro dono', 'todo');

-- ---------------------------------------------------------------------------
-- 1. The shape the owner signed (7)
-- ---------------------------------------------------------------------------

select has_table('public', 'automation_category_policies', 'the per-category policy store exists');
select has_table('public', 'automation_calibration_observations', 'the calibration evidence store exists');

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.automation_category_policies'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%relation%'
      and pg_get_constraintdef(oid) like '%organization%'),
  1,
  'the six categories are a CHECK constraint, so a seventh is a visible schema change'
);

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.automation_category_policies'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%automatic\_when\_eligible%'),
  1,
  'the three states are a CHECK constraint'
);

-- CONTENT-MINIMAL, asserted structurally rather than promised in prose. The
-- only text columns permitted are the closed vocabularies and the two keys.
select is(
  (select coalesce(string_agg(column_name, ',' order by column_name), '')
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_calibration_observations'
      and data_type in ('text', 'character varying')),
  'category,observation_key,outcome,source_kind,subject_key',
  'the evidence table carries no free-text content column -- only vocabularies and keys'
);

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.automation_calibration_observations'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (user_id, entry_id, interpretation_id)%'),
  1,
  'ownership is proved by a composite foreign key, never by user_id alone'
);

select is(
  (select count(*)::int from private.automation_calibration_thresholds()),
  6,
  'every category has its own threshold row'
);

-- ---------------------------------------------------------------------------
-- 2. Fail-closed by construction (7)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.automation_category_policies),
  0,
  'the migration wrote no policy row for anybody -- absence is the default, not a stored value'
);

select is(
  (select count(*)::int
     from (values ('task'),('person'),('project'),('organization'),('memory'),('relation')) as c(name)
     where (private.automation_category_decision('4a000001-0000-4000-8000-000000000001', c.name) ->> 'eligible')::boolean),
  0,
  'with no policy row, not one of the six categories is eligible'
);

select is(
  private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'task') ->> 'reason',
  'suggest_only_by_owner',
  'an absent policy reads as suggest_only, never as automatic'
);

-- The exact value agent_preferences.autonomy_level actually holds today. It
-- must not be readable as consent, and the degradation must not raise: a
-- refusal the owner cannot see is a broken screen, not a safe default.
insert into public.automation_category_policies (user_id, category, state)
values ('4a000001-0000-4000-8000-000000000001', 'task', 'automatic_when_eligible');
alter table public.automation_category_policies drop constraint automation_category_policies_state_check;
update public.automation_category_policies set state = 'autonomous'
 where user_id = '4a000001-0000-4000-8000-000000000001' and category = 'task';

select lives_ok(
  $$select private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'task')$$,
  'an unrecognized stored state does not raise'
);

select is(
  private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'task') ->> 'reason',
  'suggest_only_by_owner',
  'the value autonomy_level holds today degrades to suggest_only rather than authorizing a write'
);

update public.automation_category_policies set state = 'automatic_when_eligible'
 where user_id = '4a000001-0000-4000-8000-000000000001' and category = 'task';
alter table public.automation_category_policies add constraint automation_category_policies_state_check
  check (state in ('disabled', 'suggest_only', 'automatic_when_eligible'));

select is(
  private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'task') ->> 'reason',
  'insufficient_calibration',
  'arming a category is not authorizing it -- an uncalibrated category still refuses'
);

select throws_ok(
  $$select private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'invoice')$$,
  'P0002',
  null,
  'an unknown category is refused rather than silently answered'
);

-- ---------------------------------------------------------------------------
-- 3. 2P-AUTONOMY-002: no score authorizes anything (2)
-- ---------------------------------------------------------------------------

-- Structural, not behavioural: there is nothing in the decision for a model
-- score to be compared against, so the requirement cannot regress by a
-- threshold being edited.
--
-- THE COMMENTS ARE STRIPPED BEFORE SCANNING, and that is the whole point. A
-- guard that forbids the WORD fails on the comment explaining why the call is
-- forbidden -- the migration says in prose that it does not read
-- autonomy_level, and a naive scan reads that sentence as the offence. This
-- forbids the act. Its non-vacuity control is the assertion immediately below.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
            ('private', 'automation_category_decision'),
            ('private', 'automation_calibration_summary'),
            ('private', 'automation_calibration_thresholds'),
            ('private', 'automation_category_has_producer'),
            ('public', 'automation_category_status'))
      and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~* '\m(confidence|autonomy_level|element_trust|element_policy)\M'),
  0,
  'no function in this contract reads a confidence score, autonomy_level or any element trust'
);

-- NON-VACUITY CONTROL for the scan above: the same stripped source, looking for
-- something that really is in the code, finds it. Without this, a scan that
-- silently matched nothing would pass forever.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'private'
    where p.proname like 'automation%'
      and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~* '\mautomation_calibration_thresholds\M'),
  1,
  'and the same scan does see real code -- exactly one function reads the thresholds'
);

-- ---------------------------------------------------------------------------
-- 4. The producer (8)
-- ---------------------------------------------------------------------------

insert into public.entry_task_candidate_resolutions
  (user_id, entry_id, interpretation_id, candidate_index, disposition, task_id)
values ('4a000001-0000-4000-8000-000000000001', '4a00e001-0000-4000-8000-000000000001',
        '4a001001-0000-4000-8000-000000000001', 0, 'confirmed', '4a007001-0000-4000-8000-000000000001');

select is(
  (select outcome from public.automation_calibration_observations
    where user_id = '4a000001-0000-4000-8000-000000000001'
      and subject_key = 'task_candidate:4a001001-0000-4000-8000-000000000001:0'),
  'approved',
  'confirming a candidate unchanged is an approval'
);

insert into public.entry_task_candidate_resolutions
  (user_id, entry_id, interpretation_id, candidate_index, disposition, task_id)
values ('4a000001-0000-4000-8000-000000000001', '4a00e001-0000-4000-8000-000000000001',
        '4a001001-0000-4000-8000-000000000001', 1, 'confirmed', '4a007002-0000-4000-8000-000000000002');

select is(
  (select outcome from public.automation_calibration_observations
    where user_id = '4a000001-0000-4000-8000-000000000001'
      and subject_key = 'task_candidate:4a001001-0000-4000-8000-000000000001:1'),
  'corrected',
  'confirming a candidate whose title the owner changed is a CORRECTION, not an approval'
);

insert into public.entry_task_candidate_resolutions
  (user_id, entry_id, interpretation_id, candidate_index, disposition)
values ('4a000001-0000-4000-8000-000000000001', '4a00e001-0000-4000-8000-000000000001',
        '4a001001-0000-4000-8000-000000000001', 2, 'dismissed');

select is(
  (select outcome from public.automation_calibration_observations
    where user_id = '4a000001-0000-4000-8000-000000000001'
      and subject_key = 'task_candidate:4a001001-0000-4000-8000-000000000001:2'),
  'rejected',
  'dismissing a candidate is a rejection'
);

-- NEGATIVE CONTROL: a deferral is not a verdict. Counting `retained` as
-- approval would be treating absence of review as approval.
insert into public.entry_task_candidate_resolutions
  (user_id, entry_id, interpretation_id, candidate_index, disposition)
values ('4a000001-0000-4000-8000-000000000001', '4a00e001-0000-4000-8000-000000000001',
        '4a001001-0000-4000-8000-000000000001', 3, 'retained');

select is(
  (select count(*)::int from public.automation_calibration_observations
    where user_id = '4a000001-0000-4000-8000-000000000001'
      and subject_key = 'task_candidate:4a001001-0000-4000-8000-000000000001:3'),
  0,
  'a RETAINED candidate produces no evidence at all -- a deferral is not a verdict'
);

select is(
  (select count(*)::int from public.automation_calibration_observations
    where user_id = '4a000001-0000-4000-8000-000000000001' and category = 'task'),
  3,
  'four resolutions produced exactly three observations'
);

-- Replay: the producer re-invoked for the same source row changes nothing.
select lives_ok(
  $$select private.record_automation_calibration_observation(
      '4a000001-0000-4000-8000-000000000001', 'task', 'approved', 'task_candidate',
      'task_candidate:4a001001-0000-4000-8000-000000000001:0',
      (select 'task_resolution:' || id::text from public.entry_task_candidate_resolutions
        where user_id = '4a000001-0000-4000-8000-000000000001'
          and interpretation_id = '4a001001-0000-4000-8000-000000000001' and candidate_index = 0),
      '4a00e001-0000-4000-8000-000000000001', '4a001001-0000-4000-8000-000000000001',
      '4a007001-0000-4000-8000-000000000001')$$,
  'replaying the producer for the same source row does not raise'
);

select is(
  (select count(*)::int from public.automation_calibration_observations
    where user_id = '4a000001-0000-4000-8000-000000000001' and category = 'task'),
  3,
  'and it inserts nothing -- the producer is idempotent on the source row identity'
);

-- Person candidates: the resolved name differing is the owner correcting an
-- identity, which is exactly the signal 2P-AUTONOMY-006 needs.
insert into public.people (id, user_id, name)
values ('4a00b001-0000-4000-8000-000000000001', '4a000001-0000-4000-8000-000000000001', 'Ana Souza');
insert into public.entry_person_candidate_resolutions
  (interpretation_id, candidate_index, user_id, entry_id, disposition, original_name, resolved_name, person_id, operation_key)
values ('4a001001-0000-4000-8000-000000000001', 0, '4a000001-0000-4000-8000-000000000001',
        '4a00e001-0000-4000-8000-000000000001', 'confirmed', 'Ana', 'Ana Souza',
        '4a00b001-0000-4000-8000-000000000001', gen_random_uuid());

select is(
  (select outcome from public.automation_calibration_observations
    where user_id = '4a000001-0000-4000-8000-000000000001' and category = 'person'),
  'corrected',
  'a person confirmed under a different name is a correction'
);

-- ---------------------------------------------------------------------------
-- 6. Isolation, append-only and the undo signal (6)
-- ---------------------------------------------------------------------------

insert into public.entry_task_candidate_resolutions
  (user_id, entry_id, interpretation_id, candidate_index, disposition, task_id)
values ('4a000002-0000-4000-8000-000000000002', '4a00e002-0000-4000-8000-000000000002',
        '4a001002-0000-4000-8000-000000000002', 0, 'confirmed', '4a007003-0000-4000-8000-000000000003');

select is(
  (private.automation_calibration_summary('4a000001-0000-4000-8000-000000000001', 'task') ->> 'reviewed')::int,
  3,
  'the other owner review does not calibrate this owner'
);

select is(
  (private.automation_calibration_summary('4a000002-0000-4000-8000-000000000002', 'task') ->> 'reviewed')::int,
  1,
  'and the other owner sees only their own -- so the previous assertion is isolation, not emptiness'
);

select is(
  (private.automation_calibration_summary('4a000001-0000-4000-8000-000000000001', 'person') ->> 'reviewed')::int,
  1,
  'a category is measured separately and inherits nothing from another'
);

select throws_ok(
  $$update public.automation_calibration_observations set outcome = 'approved'
     where user_id = '4a000001-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'the evidence is append-only: an update is refused'
);

-- DELETE IS GOVERNED BY GRANTS, NOT BY THE TRIGGER, AND THIS IS WHY.
--
-- The first cut of this file asserted that a DELETE was refused, and the
-- trigger that made it pass ALSO refused the `auth.users` cascade -- so no
-- account could be deleted. CI caught it; the hosted dry run did not, because
-- it never deleted a user.
--
-- `authenticated` holds SELECT and nothing else, so no client can delete a row.
-- That is where deletion is governed on every other append-only table here, and
-- the cascade stays the complete cleanup story.
select ok(
  not has_table_privilege('authenticated', 'public.automation_calibration_observations', 'DELETE')
  and not has_table_privilege('authenticated', 'public.automation_calibration_observations', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.automation_calibration_observations', 'INSERT'),
  'no client can delete, update or insert evidence -- SELECT is the only privilege authenticated holds'
);

-- And the cascade really does clean up, proved rather than assumed. This is the
-- assertion whose absence let the defect through.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '4a000003-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  '2p4-cascade@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.automation_category_policies (user_id, category, state)
values ('4a000003-0000-4000-8000-000000000003', 'task', 'disabled');
insert into public.automation_calibration_observations
  (user_id, category, outcome, source_kind, subject_key, observation_key)
values ('4a000003-0000-4000-8000-000000000003', 'task', 'approved', 'task_candidate',
        'cascade-subject', 'cascade-observation');

select lives_ok(
  $$delete from auth.users where id = '4a000003-0000-4000-8000-000000000003'$$,
  'deleting an account is NOT blocked by the append-only trigger -- the cascade is a delete, and 2H.2 already paid for forgetting that'
);

select is(
  (select count(*)::int from public.automation_calibration_observations
    where user_id = '4a000003-0000-4000-8000-000000000003')
  + (select count(*)::int from public.automation_category_policies
    where user_id = '4a000003-0000-4000-8000-000000000003'),
  0,
  'and both tables really went with the account -- the cascade is the whole cleanup story'
);

-- The owner taking an acceptance back is a distinct signal, and it is
-- reachable today: undoing a candidate confirmation is an existing action.
insert into public.undo_operations (
  id, user_id, action_type, entity_type, entity_ids, after_state,
  operation_key, source_entry_id, source_interpretation_id
) values (
  '4a00d001-0000-4000-8000-000000000001', '4a000001-0000-4000-8000-000000000001',
  'confirm_entry_task_candidates_v6', 'entry', '{}'::uuid[], '{}'::jsonb,
  'pgtap-2p4-acceptance', '4a00e001-0000-4000-8000-000000000001',
  '4a001001-0000-4000-8000-000000000001'
);
update public.undo_operations set status = 'undone', undone_at = now()
 where id = '4a00d001-0000-4000-8000-000000000001';

select is(
  (select outcome from public.automation_calibration_observations
    where user_id = '4a000001-0000-4000-8000-000000000001'
      and subject_key = 'acceptance_undone:4a00d001-0000-4000-8000-000000000001'),
  'undone',
  'undoing an acceptance records the undo as its own distinct signal'
);

-- ---------------------------------------------------------------------------
-- 7. NON-VACUITY: the gate can say yes, and each condition is load-bearing (7)
--
-- Nothing here is undone by an UPDATE, because section 6 just proved the table
-- refuses one. Each condition is moved by inserting a different dataset.
-- ---------------------------------------------------------------------------

-- 60 synthetic approvals, dated STRICTLY NEWER than section 6's undo so the
-- twenty-observation block window contains no undo. Explicit offsets, because
-- every default instant in this transaction is identical.
insert into public.automation_calibration_observations
  (user_id, category, outcome, source_kind, subject_key, observation_key, observed_at)
select '4a000001-0000-4000-8000-000000000001', 'task', 'approved', 'task_candidate',
       'synthetic:' || g::text, 'synthetic:' || g::text, now() + (g || ' seconds')::interval
from generate_series(1, 60) as g;

select is(
  private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'task') ->> 'reason',
  'automatic',
  'NON-VACUITY: with an armed policy and sufficient calibration the gate says YES'
);

select is(
  (private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'task') ->> 'eligible')::boolean,
  true,
  'and eligible is genuinely true, so every refusal in this file is a refusal'
);

-- A recent undo outranks the aggregate: 61 approvals do not outvote one
-- reversal the owner performed a moment ago.
insert into public.automation_calibration_observations
  (user_id, category, outcome, source_kind, subject_key, observation_key, observed_at)
values ('4a000001-0000-4000-8000-000000000001', 'task', 'undone', 'acceptance_undone',
        'synthetic-undo', 'synthetic-undo', now() + '3600 seconds'::interval);

select is(
  private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'task') ->> 'reason',
  'blocked_by_recent_undo',
  'a recent undo blocks a category the aggregate would otherwise permit'
);

-- Disabling is immediate and outranks every measurement.
update public.automation_category_policies set state = 'disabled'
 where user_id = '4a000001-0000-4000-8000-000000000001' and category = 'task';

select is(
  private.automation_category_decision('4a000001-0000-4000-8000-000000000001', 'task') ->> 'reason',
  'automation_disabled_by_owner',
  'disabling a category is immediate and outranks the calibration'
);

-- NO INHERITANCE, with both numbers in view: a fully calibrated `task` grants
-- `person` nothing.
select is(
  (private.automation_calibration_summary('4a000001-0000-4000-8000-000000000001', 'person') ->> 'reviewed')::int,
  1,
  'person still reads one reviewed subject while task reads sixty-five -- no category inherits another'
);

-- FRESHNESS, proved in both directions on a second owner so nothing has to be
-- rewritten. Ninety approvals, all outside the window: the sample and the
-- precision are both sufficient and the category still refuses.
insert into public.automation_category_policies (user_id, category, state)
values ('4a000002-0000-4000-8000-000000000002', 'person', 'automatic_when_eligible');

insert into public.automation_calibration_observations
  (user_id, category, outcome, source_kind, subject_key, observation_key, observed_at)
select '4a000002-0000-4000-8000-000000000002', 'person', 'approved', 'person_candidate',
       'stale:' || g::text, 'stale:' || g::text, now() - ((200 + g) || ' days')::interval
from generate_series(1, 90) as g;

select is(
  private.automation_category_decision('4a000002-0000-4000-8000-000000000002', 'person') ->> 'reason',
  'insufficient_calibration',
  'ninety approvals at perfect precision still refuse when none of them is recent'
);

insert into public.automation_calibration_observations
  (user_id, category, outcome, source_kind, subject_key, observation_key, observed_at)
select '4a000002-0000-4000-8000-000000000002', 'person', 'approved', 'person_candidate',
       'fresh:' || g::text, 'fresh:' || g::text, now() + (g || ' seconds')::interval
from generate_series(1, 10) as g;

select is(
  private.automation_category_decision('4a000002-0000-4000-8000-000000000002', 'person') ->> 'reason',
  'automatic',
  'and the same dataset with ten recent subjects is permitted -- freshness is load-bearing in both directions'
);

-- ---------------------------------------------------------------------------
-- 8. The control, its audit and its undo (5)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from private.undo_operation_handlers
    where action_type = 'set_automation_category_policy'
      and handler_function = 'undo_set_automation_category_policy'),
  1,
  'the policy change is registered in the deployed undo handler registry'
);

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'private'
    where p.proname = 'undo_set_automation_category_policy'),
  1,
  'and the handler function it names really exists'
);

-- The undo refuses when the category moved since, rather than overwriting a
-- newer decision with an older one.
insert into public.undo_operations (
  id, user_id, action_type, entity_type, entity_ids, before_state, after_state, operation_key
) values (
  '4a00d002-0000-4000-8000-000000000002', '4a000001-0000-4000-8000-000000000001',
  'set_automation_category_policy', 'automation_category_policy', '{}'::uuid[],
  '{"category":"memory","state":null}'::jsonb,
  '{"category":"memory","state":"automatic_when_eligible"}'::jsonb,
  'pgtap-2p4-policy-stale'
);

select throws_ok(
  $$select private.undo_set_automation_category_policy(
      '4a000001-0000-4000-8000-000000000001', '4a00d002-0000-4000-8000-000000000002')$$,
  '55P03',
  null,
  'the undo refuses when the category no longer holds the state the operation produced'
);

-- And it restores "no row" rather than a default that would look like a choice.
insert into public.automation_category_policies (user_id, category, state)
values ('4a000001-0000-4000-8000-000000000001', 'memory', 'automatic_when_eligible');

select lives_ok(
  $$select private.undo_set_automation_category_policy(
      '4a000001-0000-4000-8000-000000000001', '4a00d002-0000-4000-8000-000000000002')$$,
  'the undo runs once the recorded state is the state that is really there'
);

select is(
  (select count(*)::int from public.automation_category_policies
    where user_id = '4a000001-0000-4000-8000-000000000001' and category = 'memory'),
  0,
  'a policy that had no row before is restored to having no row, not to a default'
);

-- ---------------------------------------------------------------------------
-- 9. Grants -- least privilege, and nothing existing changed (0 counted here,
--    the census in signup_hardening_grant_census.sql owns the whole picture)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('automation_category_policies', 'automation_calibration_observations')
      and grantee = 'authenticated'
      and privilege_type <> 'SELECT'),
  0,
  'authenticated holds SELECT and nothing else on either new table'
);

-- The SELECT policy must NAME `authenticated`. A policy with no role list
-- applies to PUBLIC, which is not evidence that the owner can read their own
-- rows -- and `phase_2o_privacy_enumeration.sql` fails on exactly that, which
-- is how the first cut of this migration was caught.
select is(
  (select count(*)::int from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('automation_category_policies', 'automation_calibration_observations')
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)),
  2,
  'both tables carry an owner-scoped SELECT policy that names authenticated'
);

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'private'
    where p.proname like '%automation%'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'nothing in private is executable by authenticated'
);

select * from finish();
rollback;
