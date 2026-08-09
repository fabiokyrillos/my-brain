-- ---------------------------------------------------------------------------
-- Phase 2K slice 2K.2 — the conversational memory undo ARCHIVES (OD-2K-3).
--
-- WHY THIS SUITE EXISTS
--
-- `2K-ACT-008` requires a **real, tested** undo for a memory confirmed from the
-- conversation, reusing the existing audited lifecycle transition — no new
-- column, no new RPC, no migration. The TypeScript side is covered by
-- `src/features/memories/undo.test.ts`, but the three properties that actually
-- make the undo trustworthy are database properties:
--
--   1. the row **survives** and keeps its provenance (OD-2K-3 forbids removal);
--   2. it leaves the **active window**, which is what withdraws it from use;
--   3. another owner cannot perform it, and the denial is **not vacuous**.
--
-- WHAT IT DELIBERATELY DOES NOT CLAIM
--
-- It does not assert that an archived memory stops being retrieved. That filter
-- lives in `chat/actions.ts` — `match_internal_knowledge` has never read
-- `valid_from`/`valid_until`, and teaching it to would cost a migration this
-- phase's budget does not have (OD-2K-C). What this suite pins is the **window
-- itself**, which is the value `isMemoryInForce` reads, so the page, the
-- retrieval and this test provably agree on one fact.
--
-- WHY THE POSITIVE CONTROL IS MANDATORY
--
-- "Owner B cannot archive owner A's memory" is satisfied by a database in which
-- nobody can archive anything — a revoked grant, a broken claim, a missing row.
-- Section 3 therefore archives owner A's own memory **as owner A**, in the same
-- transaction, and asserts it worked. Without it the denial is the failure this
-- repository records as "a control must not be exempt".
-- ---------------------------------------------------------------------------

begin;

select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures: two owners, one in-force memory each
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2c000011-0000-4000-8000-000000000011', 'authenticated', 'authenticated',
   'owner-a-2k2@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2c000012-0000-4000-8000-000000000012', 'authenticated', 'authenticated',
   'owner-b-2k2@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.memories (id, user_id, content, kind, confidence, sensitivity)
values
  ('2c00aa11-0000-4000-8000-0000000000a1', '2c000011-0000-4000-8000-000000000011',
   'owner A quokkaphrase memory', 'preference', 0.9, 'normal'),
  ('2c00bb12-0000-4000-8000-0000000000b2', '2c000012-0000-4000-8000-000000000012',
   'owner B quokkaphrase memory', 'preference', 0.9, 'normal');

-- ---------------------------------------------------------------------------
-- Section 0 — non-vacuity: both memories exist and are in force (2)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.memories where content like '%quokkaphrase%'),
  2,
  'non-vacuity: both owners have a memory to act on'
);

select is(
  (select count(*)::int from public.memories
   where content like '%quokkaphrase%'
     and (valid_from is null or valid_from <= now())
     and (valid_until is null or valid_until > now())),
  2,
  'non-vacuity: both memories start IN FORCE, so archiving is a real change'
);

-- ---------------------------------------------------------------------------
-- Section 1 — structural: there is no delete path, and RLS is forced (2)
--
-- OD-2K-3 says the undo archives because the product has never had a delete
-- path for a memory. That is a product decision rather than a limit —
-- `authenticated` DOES hold delete — so the decision is only real if the
-- lifecycle column exists to carry it.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_class
   where relname = 'memories'
     and relnamespace = 'public'::regnamespace
     and relrowsecurity and relforcerowsecurity),
  1,
  'memories has RLS ENABLED and FORCED, so ownership is the database''s answer'
);

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'memories'
     and column_name in ('valid_from', 'valid_until')),
  2,
  'the lifecycle window the undo stamps exists, so archival is a real transition'
);

-- ---------------------------------------------------------------------------
-- Section 2 — POSITIVE CONTROL: owner A archives its OWN memory (3)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"2c000011-0000-4000-8000-000000000011","role":"authenticated"}', true);
set local role authenticated;

update public.memories
   set valid_until = now(), updated_at = now()
 where id = '2c00aa11-0000-4000-8000-0000000000a1'
   and user_id = '2c000011-0000-4000-8000-000000000011';

select is(
  (select count(*)::int from public.memories
   where id = '2c00aa11-0000-4000-8000-0000000000a1' and valid_until is not null),
  1,
  'positive control: the owner can archive its own memory'
);

-- OD-2K-3's central claim, asserted rather than described: the row is still
-- there. An undo that removed it would fail this.
select is(
  (select content from public.memories where id = '2c00aa11-0000-4000-8000-0000000000a1'),
  'owner A quokkaphrase memory',
  'the row SURVIVES the undo, with its content intact — archival, not removal'
);

select is(
  (select count(*)::int from public.memories
   where id = '2c00aa11-0000-4000-8000-0000000000a1'
     and (valid_until is null or valid_until > now())),
  0,
  'and it has left the active window, which is what withdraws it from use'
);

-- ---------------------------------------------------------------------------
-- Section 3 — the boundary: owner A cannot archive owner B's memory (2)
-- ---------------------------------------------------------------------------

update public.memories
   set valid_until = now(), updated_at = now()
 where id = '2c00bb12-0000-4000-8000-0000000000b2';

select is(
  (select count(*)::int from public.memories
   where id = '2c00bb12-0000-4000-8000-0000000000b2' and valid_until is not null),
  0,
  'owner A''s archive touches none of owner B''s rows, even with no user_id predicate'
);

select is(
  (select count(*)::int from public.memories where content like '%owner B%'),
  0,
  'and owner A cannot even read owner B''s memory'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 4 — the undo of the undo is a real transition (2)
--
-- `2K-ACT-009` permits offering it only if the domain can prove it safe.
-- `setMemoryLifecycle`'s `restore` clears `valid_until`; this is that,
-- performed under the owner's own claim.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"2c000011-0000-4000-8000-000000000011","role":"authenticated"}', true);
set local role authenticated;

update public.memories
   set valid_until = null, updated_at = now()
 where id = '2c00aa11-0000-4000-8000-0000000000a1'
   and user_id = '2c000011-0000-4000-8000-000000000011';

select is(
  (select count(*)::int from public.memories
   where id = '2c00aa11-0000-4000-8000-0000000000a1'
     and (valid_until is null or valid_until > now())),
  1,
  'reactivation returns the memory to force, so the undo of the undo is provable'
);

select is(
  (select content from public.memories where id = '2c00aa11-0000-4000-8000-0000000000a1'),
  'owner A quokkaphrase memory',
  'and the round trip changed nothing about the memory itself'
);

reset role;

select * from finish();

rollback;
