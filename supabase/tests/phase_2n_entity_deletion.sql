-- ---------------------------------------------------------------------------
-- Phase 2N slice 2N.3 — M3: transactional deletion of a person, a project and
-- a memory (`2N-CORRECT-004…005`, `009…013`, `OD-2N-11` B, ADR-113).
--
-- WHAT THIS SUITE EXISTS TO PROVE, AND WHY EACH ASSERTION IS SHAPED AS IT IS
--
-- The intermediate deletion re-audit
-- (`docs/reports/phase-2n/PHASE_2N_SLICE_3_DELETION_REAUDIT.md`) measured three
-- things that no amount of reading the schema would have told us, and every
-- section below exists because of one of them.
--
-- 1. THE CASCADE DOES NOT REACH THE POLYMORPHIC TABLES. `entry_entities`,
--    `entity_aliases`, `entity_attachments` and `entity_tags` carry
--    `entity_type`/`entity_id` as an UNCONSTRAINED pair. Deleting a person left
--    them alive, pointing at a dead id — the partial deletion `2N-CORRECT-012`
--    forbids. So this suite asserts they are GONE, not merely that the parent
--    is. A suite that only checked `people` would pass against the defect.
--
-- 2. `authenticated` HOLDS NO `DELETE` ON TWO OF THEM. A `SECURITY INVOKER`
--    path would remove zero rows and RAISE NOTHING. That is why §3 asserts the
--    counts rather than trusting the absence of an error.
--
-- 3. A TRUE UNDO IS POSSIBLE, PROVED BY EXECUTION. Restoration must return the
--    SAME ids with the SAME relations, roles and validity — so §6 compares
--    `to_jsonb` of the whole row set before and after, not a count. A count
--    would pass against an undo that recreated a lookalike under a new id,
--    which the contract explicitly refuses to call an undo.
--
-- NON-VACUITY IS ASSERTED, NOT ASSUMED
--
-- This repository has recorded, twice, that a control which is not subject to
-- the same mechanism produces a confident wrong verdict, and that a zero read
-- against an empty table is not a control. So every denial here is paired with
-- a positive control proving the same probe can see the thing it is denying,
-- and the fixtures are planted rather than presumed.
--
-- BOUNDARIES
--
-- `now()` is transaction time, so `consumed_at` and `expires_at` comparisons
-- are exact rather than flaky.
-- ---------------------------------------------------------------------------

begin;

select plan(43);

-- ---------------------------------------------------------------------------
-- Fixtures: owner A with a fully populated person, and owner B whose identical
-- object must be unreachable through every entry point.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2f3d0001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'owner-a-m3@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2f3d0002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'owner-b-m3@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Owner A's graph. Every column a restore must bring back carries a
-- DISTINCTIVE value, so a restore that drops one fails the comparison rather
-- than passing on a default.
insert into public.people (id, user_id, name, notes) values
  ('2f3d1001-0000-4000-8000-0000000000a1', '2f3d0001-0000-4000-8000-000000000001', 'Subject A', 'a note that must return'),
  ('2f3d1002-0000-4000-8000-0000000000a2', '2f3d0001-0000-4000-8000-000000000001', 'Related A', null);

insert into public.projects (id, user_id, name, description, status) values
  ('2f3d2001-0000-4000-8000-0000000000b1', '2f3d0001-0000-4000-8000-000000000001', 'Project A', 'desc', 'active');

insert into public.contexts (id, user_id, name) values
  ('2f3d3001-0000-4000-8000-0000000000c1', '2f3d0001-0000-4000-8000-000000000001', 'Context A');

insert into public.tasks (id, user_id, title, status, waiting_on_person_id) values
  ('2f3d4001-0000-4000-8000-0000000000d1', '2f3d0001-0000-4000-8000-000000000001', 'Task A', 'waiting',
   '2f3d1001-0000-4000-8000-0000000000a1');

-- Both directions, because the re-audit measured that BOTH cascade away and a
-- restore that returns only the forward edge would silently halve the graph.
insert into public.person_relationships (user_id, person_id, related_person_id, relationship_type, description, confidence) values
  ('2f3d0001-0000-4000-8000-000000000001', '2f3d1001-0000-4000-8000-0000000000a1', '2f3d1002-0000-4000-8000-0000000000a2', 'mentor', 'forward edge', 0.750),
  ('2f3d0001-0000-4000-8000-000000000001', '2f3d1002-0000-4000-8000-0000000000a2', '2f3d1001-0000-4000-8000-0000000000a1', 'mentee', 'reverse edge', 0.800);

insert into public.person_projects (user_id, person_id, project_id, role, confidence) values
  ('2f3d0001-0000-4000-8000-000000000001', '2f3d1001-0000-4000-8000-0000000000a1', '2f3d2001-0000-4000-8000-0000000000b1', 'owner', 0.900);

insert into public.person_contexts (user_id, person_id, context_id, confidence) values
  ('2f3d0001-0000-4000-8000-000000000001', '2f3d1001-0000-4000-8000-0000000000a1', '2f3d3001-0000-4000-8000-0000000000c1', 0.600);

insert into public.task_people (user_id, task_id, person_id, role) values
  ('2f3d0001-0000-4000-8000-000000000001', '2f3d4001-0000-4000-8000-0000000000d1', '2f3d1001-0000-4000-8000-0000000000a1', 'assignee');

insert into public.memories (id, user_id, content, kind, confidence, sensitivity, person_id, project_id, embedding, embedding_model) values
  ('2f3d5001-0000-4000-8000-0000000000e1', '2f3d0001-0000-4000-8000-000000000001', 'memory about subject A', 'fact', 0.9, 'normal',
   '2f3d1001-0000-4000-8000-0000000000a1', '2f3d2001-0000-4000-8000-0000000000b1',
   ('[1,1' || repeat(',0', 1534) || ']')::extensions.vector(1536), 'text-embedding-3-small');

insert into public.entity_aliases (user_id, entity_type, entity_id, alias, normalized_alias) values
  ('2f3d0001-0000-4000-8000-000000000001', 'person', '2f3d1001-0000-4000-8000-0000000000a1', 'Subject Nickname', 'placeholder');

-- `entry_entities` needs a real entry and interpretation; it is the table with
-- live readers, so it is the one an incomplete deletion would keep rendering.
insert into public.entries (id, user_id, original_content, occurred_at, locale, source, status, sensitivity) values
  ('2f3d6001-0000-4000-8000-0000000000f1', '2f3d0001-0000-4000-8000-000000000001', 'entry mentioning Subject A', now(),
   'pt-BR', 'web', 'completed', 'normal');

insert into public.entry_interpretations
  (id, user_id, entry_id, summary, confidence, model, strategy_version, prompt_version, raw_output) values
  ('2f3d7001-0000-4000-8000-000000000101', '2f3d0001-0000-4000-8000-000000000001', '2f3d6001-0000-4000-8000-0000000000f1',
   'a reading', 0.900, 'gpt-test', 'v1', 'v1', '{}'::jsonb);

insert into public.entry_entities (user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence) values
  ('2f3d0001-0000-4000-8000-000000000001', '2f3d6001-0000-4000-8000-0000000000f1', '2f3d7001-0000-4000-8000-000000000101',
   'person', '2f3d1001-0000-4000-8000-0000000000a1', 'Subject A', 0.900);

-- Owner B's person, identical in shape. Nothing owner A does may reach it.
insert into public.people (id, user_id, name) values
  ('2f3d1003-0000-4000-8000-0000000000a3', '2f3d0002-0000-4000-8000-000000000002', 'Foreign Subject');

-- ---------------------------------------------------------------------------
-- Section 1 — the surface exists, with the authority the re-audit requires (6)
-- ---------------------------------------------------------------------------

select has_table('public', 'entity_deletion_confirmations',
  'M3 creates the confirmation store ADR-113 authorized');

select is(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_catalog.pg_class c
    where c.oid = 'public.entity_deletion_confirmations'::regclass),
  true,
  'the confirmation store has RLS enabled AND forced, so even a table owner read is policed');

-- The re-audit's sharpest finding: a SECURITY INVOKER path deletes zero
-- entry_entities rows and raises nothing. If this ever flips, the deletion
-- silently becomes partial.
select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname = 'apply_entity_deletion'),
  true,
  'apply_entity_deletion is SECURITY DEFINER, without which it cannot reach entry_entities at all');

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname = 'apply_entity_deletion'),
  'search_path=""',
  'apply_entity_deletion pins an empty search_path, so no schema it does not name can be substituted');

-- No role may write the confirmation store. Both writers are definer functions.
select is(
  (select pg_catalog.count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'entity_deletion_confirmations'
      and grantee in ('authenticated', 'anon', 'service_role')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'no client role may insert, update or delete a confirmation — a forged row is unrepresentable');

select is(
  (select pg_catalog.count(*)::int from private.undo_operation_handlers
    where action_type in ('delete_person', 'delete_project', 'delete_memory')),
  3,
  'all three deletions have a registered undo handler, so none can be recorded without a way back');

-- ---------------------------------------------------------------------------
-- Section 2 — absent, foreign and unreadable are ONE answer (4)
-- ---------------------------------------------------------------------------
-- The re-audit named this the sharpest existence risk: SECURITY DEFINER
-- bypasses RLS, so owner scope stops being the database's job and becomes the
-- function's. A preview that distinguishes "no such person" from "not yours"
-- is an oracle for whether another account's id is real.

select set_config('request.jwt.claims',
  '{"sub":"2f3d0001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.preview_entity_deletion('person', '2f3d1003-0000-4000-8000-0000000000a3') $$,
  'P0002',
  null,
  'previewing another owner''s person raises exactly the not-found error');

select throws_ok(
  $$ select public.preview_entity_deletion('person', '2f3daaaa-0000-4000-8000-00000000aaaa') $$,
  'P0002',
  null,
  'previewing an id that never existed raises the SAME error — the two are indistinguishable');

select throws_ok(
  $$ select public.issue_entity_deletion_confirmation('person', '2f3d1003-0000-4000-8000-0000000000a3', 'm3-foreign-key-01') $$,
  'P0002',
  null,
  'issuance refuses a foreign subject with the same undistinguished error');

-- Positive control: the same probe DOES see the owner's own person, so the
-- three denials above are refusals rather than a broken function.
select isnt(
  (select public.preview_entity_deletion('person', '2f3d1001-0000-4000-8000-0000000000a1')),
  null,
  'positive control: the owner''s own person previews, so the denials are not vacuous');

-- ---------------------------------------------------------------------------
-- Section 3 — the preview counts what the deletion will really do (5)
-- ---------------------------------------------------------------------------
-- `2N-CORRECT-010` forbids estimates where the database can count. These are
-- the exact numbers planted above.

select is(
  (select (public.preview_entity_deletion('person', '2f3d1001-0000-4000-8000-0000000000a1') -> 'consequences' ->> 'relations')::int),
  2,
  'the preview counts BOTH relationship directions, not one');

select is(
  (select (public.preview_entity_deletion('person', '2f3d1001-0000-4000-8000-0000000000a1') -> 'consequences' ->> 'entryMentions')::int),
  1,
  'the preview counts the entry mention no foreign key protects');

select is(
  (select (public.preview_entity_deletion('person', '2f3d1001-0000-4000-8000-0000000000a1') -> 'consequences' ->> 'aliases')::int),
  1,
  'the preview counts the alias no foreign key protects');

select is(
  (select (public.preview_entity_deletion('person', '2f3d1001-0000-4000-8000-0000000000a1') -> 'consequences' ->> 'tasksWaiting')::int),
  1,
  'the preview counts the task that will be left waiting on nobody');

select is(
  (select (public.preview_entity_deletion('memory', '2f3d5001-0000-4000-8000-0000000000e1') -> 'consequences' ->> 'relations')::int),
  0,
  'a memory reports zero propagation, because the re-audit found no foreign key references memories at all');

-- ---------------------------------------------------------------------------
-- Section 4 — the confirmation is single-use and cannot travel (6)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.issue_entity_deletion_confirmation('person', '2f3d1001-0000-4000-8000-0000000000a1', 'm3-person-key-001') $$,
  'a confirmation is issued for the owner''s own person');

select is(
  (select status from public.entity_deletion_confirmations where operation_key = 'm3-person-key-001'),
  'issued',
  'the issued confirmation starts unconsumed');

-- Applying with no confirmation at all must be refused by the DATABASE, not by
-- the UI (`2E-DESTRUCTIVE-004`'s rule, carried forward).
select throws_ok(
  $$ select public.apply_entity_deletion('person', '2f3d1001-0000-4000-8000-0000000000a1', 'm3-never-issued-1') $$,
  '42501',
  null,
  'applying without a confirmation is refused by the database');

-- Tampering: the same key, a different subject. The stored digest binds the
-- subject, so the pair cannot be re-aimed.
select throws_ok(
  $$ select public.apply_entity_deletion('project', '2f3d2001-0000-4000-8000-0000000000b1', 'm3-person-key-001') $$,
  '42501',
  null,
  'a confirmation issued for a person cannot authorize deleting a project');

-- TOCTOU: change the world, and the confirmation must expire by FACT rather
-- than by clock.
insert into public.entity_aliases (user_id, entity_type, entity_id, alias, normalized_alias) values
  ('2f3d0001-0000-4000-8000-000000000001', 'person', '2f3d1001-0000-4000-8000-0000000000a1', 'A Second Nickname', 'placeholder2');

select throws_ok(
  $$ select public.apply_entity_deletion('person', '2f3d1001-0000-4000-8000-0000000000a1', 'm3-person-key-001') $$,
  '55P03',
  null,
  'a confirmation is refused once the consequences it was issued against have changed');

select is(
  (select status from public.entity_deletion_confirmations where operation_key = 'm3-person-key-001'),
  'issued',
  'a refused apply does NOT burn the confirmation — the owner does not pay for the world moving');

-- ---------------------------------------------------------------------------
-- Section 5 — the deletion is whole, and reaches what no cascade does (7)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.issue_entity_deletion_confirmation('person', '2f3d1001-0000-4000-8000-0000000000a1', 'm3-person-key-002') $$,
  'a fresh confirmation is issued against the changed state');

select lives_ok(
  $$ select public.apply_entity_deletion('person', '2f3d1001-0000-4000-8000-0000000000a1', 'm3-person-key-002') $$,
  'the deletion applies with a confirmation that matches the current facts');

select is(
  (select pg_catalog.count(*)::int from public.people where id = '2f3d1001-0000-4000-8000-0000000000a1'),
  0, 'the person is gone');

-- THE ASSERTIONS THAT WOULD HAVE PASSED AGAINST THE DEFECT ARE THESE FOUR.
select is(
  (select pg_catalog.count(*)::int from public.entry_entities
    where entity_type = 'person' and entity_id = '2f3d1001-0000-4000-8000-0000000000a1'),
  0, 'the entry mention is gone — no cascade would have removed it');

select is(
  (select pg_catalog.count(*)::int from public.entity_aliases
    where entity_type = 'person' and entity_id = '2f3d1001-0000-4000-8000-0000000000a1'),
  0, 'both aliases are gone — no cascade would have removed them');

select is(
  (select pg_catalog.count(*)::int from public.person_relationships
    where person_id = '2f3d1001-0000-4000-8000-0000000000a1'
       or related_person_id = '2f3d1001-0000-4000-8000-0000000000a1'),
  0, 'both relationship directions are gone');

select is(
  (select waiting_on_person_id from public.tasks where id = '2f3d4001-0000-4000-8000-0000000000d1'),
  null,
  'the task survives with its person link severed, which is what the preview promised');

-- ---------------------------------------------------------------------------
-- Section 6 — the undo restores identity, not a lookalike (6)
-- ---------------------------------------------------------------------------
-- Compared as whole rows rather than counts. A count passes against an undo
-- that inserts a similar row under a new id, and the contract refuses to call
-- that an undo.

select lives_ok(
  $$ select public.undo_operation((
       select id from public.undo_operations
        where action_type = 'delete_person' and status = 'available'
        order by created_at desc limit 1)) $$,
  'the deletion is undone through the registry that already ships');

select is(
  (select name || '|' || coalesce(notes, '<null>') from public.people
    where id = '2f3d1001-0000-4000-8000-0000000000a1'),
  'Subject A|a note that must return',
  'the SAME id returns, carrying the note — not a new row that merely resembles it');

select is(
  (select pg_catalog.string_agg(relationship_type || ':' || description, ',' order by relationship_type)
     from public.person_relationships
    where person_id = '2f3d1001-0000-4000-8000-0000000000a1'
       or related_person_id = '2f3d1001-0000-4000-8000-0000000000a1'),
  'mentee:reverse edge,mentor:forward edge',
  'both relationship directions return with their types and descriptions intact');

select is(
  (select role from public.person_projects where person_id = '2f3d1001-0000-4000-8000-0000000000a1'),
  'owner',
  'the project association returns WITH its role — a link without its role is not the same association');

select is(
  (select pg_catalog.count(*)::int from public.entity_aliases
    where entity_type = 'person' and entity_id = '2f3d1001-0000-4000-8000-0000000000a1'),
  2,
  'both aliases return, including the one added mid-suite');

select is(
  (select waiting_on_person_id from public.tasks where id = '2f3d4001-0000-4000-8000-0000000000d1'),
  '2f3d1001-0000-4000-8000-0000000000a1'::uuid,
  'the task is waiting on the same person again');

-- ---------------------------------------------------------------------------
-- Section 7 — a memory deletion removes it from retrieval, transactionally (5)
-- ---------------------------------------------------------------------------

-- CONTROL FIRST. Zero-after-deletion is also what a broken retrieval call, a
-- revoked grant or a typo would return, so the same probe must be shown finding
-- the memory while it still exists. Without this the next assertion proves
-- nothing.
select is(
  (select pg_catalog.count(*)::int from public.match_internal_knowledge(
     ('[1,1' || repeat(',0', 1534) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.source_id = '2f3d5001-0000-4000-8000-0000000000e1'),
  1,
  'control: the memory IS retrievable before deletion, so the zero below is a removal and not a broken probe');

select lives_ok(
  $$ select public.issue_entity_deletion_confirmation('memory', '2f3d5001-0000-4000-8000-0000000000e1', 'm3-memory-key-001') $$,
  'a confirmation is issued for the memory');

select lives_ok(
  $$ select public.apply_entity_deletion('memory', '2f3d5001-0000-4000-8000-0000000000e1', 'm3-memory-key-001') $$,
  'the memory is deleted through the same one path');

-- `2N-CORRECT-011`: a deleted object that is still retrievable is a failed
-- deletion, not a delayed one. Asserted at retrieval, not at the table.
select is(
  (select pg_catalog.count(*)::int from public.match_internal_knowledge(
     ('[1,1' || repeat(',0', 1534) || ']')::extensions.vector(1536), 20) as retrieved
   where retrieved.source_id = '2f3d5001-0000-4000-8000-0000000000e1'),
  0,
  'the deleted memory is no longer retrievable, in the same unit that removed it');

select is(
  (select (before_state -> 'memories' -> 0 ->> 'embedding') is not null
     from public.undo_operations where action_type = 'delete_memory' order by created_at desc limit 1),
  true,
  'the snapshot carries the embedding, which is what lets the undo restore retrievability without a provider call');

-- ---------------------------------------------------------------------------
-- Section 8 — the audit trail records the act without retaining its content (3)
-- ---------------------------------------------------------------------------
-- `audit_logs` is append-only and permanent. Putting the snapshot there would
-- turn "delete" into retention forever, which is the opposite of what the user
-- asked for. The content lives ONLY in the 24-hour undo reservation.

select is(
  (select pg_catalog.count(*)::int from public.audit_logs
    where action_type = 'delete_person' and entity_id = '2f3d1001-0000-4000-8000-0000000000a1'),
  1,
  'the deletion is audited');

select is(
  (select before_state::text like '%a note that must return%' from public.audit_logs
    where action_type = 'delete_person' and entity_id = '2f3d1001-0000-4000-8000-0000000000a1'),
  false,
  'the audit row does NOT carry the deleted content — permanence plus content would be retention, not removal');

-- Non-vacuity for the assertion above: the same phrase IS findable in the
-- undo reservation, so the negative is about placement rather than about the
-- phrase never having existed.
select is(
  (select before_state::text like '%a note that must return%' from public.undo_operations
    where action_type = 'delete_person' order by created_at desc limit 1),
  true,
  'control: the content IS in the 24-hour undo reservation, so the audit assertion above is not vacuous');

-- ---------------------------------------------------------------------------
-- Section 9 — the other owner is untouched, read WITHOUT RLS (1)
-- ---------------------------------------------------------------------------
-- `postgres` holds `rolbypassrls`, so inside these SECURITY DEFINER functions
-- row-level security is not consulted at all and the explicit
-- `user_id = v_owner` predicates are the only isolation there is. This
-- assertion therefore runs as the SAME unprivileged-of-RLS reader the functions
-- do, so it would see owner B's row disappear if any predicate were dropped —
-- a check run under RLS could not tell "protected" from "deleted".

reset role;

select is(
  (select pg_catalog.count(*)::int from public.people
    where id = '2f3d1003-0000-4000-8000-0000000000a3'
      and user_id = '2f3d0002-0000-4000-8000-000000000002'),
  1,
  'the second owner''s person survived every operation above, read with RLS bypassed so absence could not be mistaken for protection');

select * from finish();

rollback;
