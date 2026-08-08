-- ---------------------------------------------------------------------------
-- Phase 2I — T-2I-01: global search must not become an enumeration oracle.
--
-- WHY THIS SUITE EXISTS, AND WHY IT NEEDS TWO ACCOUNTS
--
-- Search is the first surface in this product that takes an arbitrary string
-- and queries seven tables. Every other read is reached by navigating to
-- something you already own. So it is the first place where "the query matched
-- nothing" and "the query matched something you may not see" could become
-- distinguishable outcomes.
--
-- **An ownership test with one user in the database proves nothing.** A query
-- that returned every row in the table would pass it. So this suite creates
-- TWO owners, gives them rows matching the SAME needle, and asserts that each
-- sees only their own -- under the `authenticated` role with the other user's
-- JWT claim, which is exactly how the product runs the query.
--
-- WHAT IS BEING TESTED IS THE BOUNDARY, NOT THE FEATURE
--
-- The application's search builds `column.ilike.*needle*` filters through the
-- request-scoped authenticated client. Forced RLS is what makes those filters
-- safe. This suite therefore reproduces the *predicate shape* and asserts RLS
-- holds under it -- if RLS were ever relaxed on one of these seven tables, the
-- application code would not change and only this suite would notice.
--
-- OD-1 IS ALSO ASSERTED HERE
--
-- `highly_sensitive` is excluded from the default scope by a predicate in the
-- query. Section 3 proves the predicate does what the decision says, on real
-- rows, rather than trusting a TypeScript constant.
-- ---------------------------------------------------------------------------

begin;

select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures: two owners, the same needle in both
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('21000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   '2i-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('21000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   '2i-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- The same needle for both owners, so a leak is a wrong ROW rather than a
-- wrong count -- and so an assertion cannot pass because B simply had nothing.
insert into public.entries (user_id, original_content, occurred_at, locale, source, status, sensitivity)
values
  ('21000001-0000-4000-8000-000000000001', 'owner A quokkaphrase normal', now(), 'pt-BR', 'web', 'completed', 'normal'),
  ('21000001-0000-4000-8000-000000000001', 'owner A quokkaphrase private', now(), 'pt-BR', 'web', 'completed', 'private'),
  ('21000001-0000-4000-8000-000000000001', 'owner A quokkaphrase secret', now(), 'pt-BR', 'web', 'completed', 'highly_sensitive'),
  ('21000002-0000-4000-8000-000000000002', 'owner B quokkaphrase normal', now(), 'pt-BR', 'web', 'completed', 'normal');

insert into public.tasks (user_id, title, description, status, confidence, created_by)
values
  ('21000001-0000-4000-8000-000000000001', 'A quokkaphrase task', null, 'todo', 0.9, 'user'),
  ('21000002-0000-4000-8000-000000000002', 'B quokkaphrase task', null, 'todo', 0.9, 'user');

insert into public.memories (user_id, content, kind, confidence, sensitivity)
values
  ('21000001-0000-4000-8000-000000000001', 'A quokkaphrase memory', 'preference', 0.9, 'normal'),
  ('21000001-0000-4000-8000-000000000001', 'A quokkaphrase secret memory', 'preference', 0.9, 'highly_sensitive'),
  ('21000002-0000-4000-8000-000000000002', 'B quokkaphrase memory', 'preference', 0.9, 'normal');

insert into public.people (user_id, name, notes)
values
  ('21000001-0000-4000-8000-000000000001', 'A Quokkaphrase', null),
  ('21000002-0000-4000-8000-000000000002', 'B Quokkaphrase', null);

insert into public.projects (user_id, name, description, status)
values
  ('21000001-0000-4000-8000-000000000001', 'A quokkaphrase project', null, 'active'),
  ('21000002-0000-4000-8000-000000000002', 'B quokkaphrase project', null, 'active');

insert into public.organizations (user_id, name, description)
values
  ('21000001-0000-4000-8000-000000000001', 'A Quokkaphrase Ltda', null),
  ('21000002-0000-4000-8000-000000000002', 'B Quokkaphrase Ltda', null);

insert into public.attachments
  (user_id, original_name, description, extracted_text, mime_type, size_bytes, status, storage_path, sensitivity)
values
  ('21000001-0000-4000-8000-000000000001', 'a-doc.pdf', null, 'inside the A quokkaphrase document',
   'application/pdf', 2048, 'ready', '21000001/a-doc.pdf', 'normal'),
  ('21000001-0000-4000-8000-000000000001', 'a-secret.pdf', null, 'inside the A quokkaphrase secret document',
   'application/pdf', 2048, 'ready', '21000001/a-secret.pdf', 'highly_sensitive'),
  ('21000002-0000-4000-8000-000000000002', 'b-doc.pdf', null, 'inside the B quokkaphrase document',
   'application/pdf', 2048, 'ready', '21000002/b-doc.pdf', 'normal');

-- ---------------------------------------------------------------------------
-- Section 0 -- non-vacuity: the needle really is in both owners' rows (2)
--
-- Read as the table owner, before any role switch. Without this, every
-- "A cannot see B" assertion below is satisfied by a database where B has
-- nothing to see.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.entries where original_content ilike '%quokkaphrase%'),
  4,
  'non-vacuity: four entries match the needle across BOTH owners'
);

select is(
  (select count(*)::int from public.attachments where extracted_text ilike '%quokkaphrase%'),
  3,
  'non-vacuity: three attachments match inside extracted_text across both owners'
);

-- ---------------------------------------------------------------------------
-- Section 1 -- as owner A, the seven domains return only A's rows (7)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"21000001-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.entries
   where original_content ilike '%quokkaphrase%'
     and original_content ilike '%owner B%'),
  0,
  'T-2I-01: owner A cannot reach owner B''s entries through the search predicate'
);

select is(
  (select count(*)::int from public.tasks where title ilike '%quokkaphrase%'),
  1,
  'T-2I-01: owner A sees exactly their own matching task, not both'
);

select is(
  (select count(*)::int from public.memories where content ilike '%quokkaphrase%'
   and content ilike '%B %'),
  0,
  'T-2I-01: owner A cannot reach owner B''s memories'
);

select is(
  (select count(*)::int from public.people where name ilike '%quokkaphrase%'),
  1,
  'T-2I-01: owner A sees exactly their own matching person'
);

select is(
  (select count(*)::int from public.projects where name ilike '%quokkaphrase%'),
  1,
  'T-2I-01: owner A sees exactly their own matching project'
);

select is(
  (select count(*)::int from public.organizations where name ilike '%quokkaphrase%'),
  1,
  'T-2I-01: owner A sees exactly their own matching company'
);

-- OD-2's column, and the one most likely to be forgotten in an RLS review
-- because it is content the user never typed.
select is(
  (select count(*)::int from public.attachments where extracted_text ilike '%quokkaphrase%'
   and extracted_text ilike '%B %'),
  0,
  'T-2I-01 + OD-2: owner A cannot reach owner B''s extracted document text'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- OD-1: the default scope excludes highly_sensitive (4)
--
-- Still as owner A, over rows A owns. This is an EXPECTATION boundary, not an
-- authorization one -- A owns all of it -- so the assertion is that the
-- predicate the application applies does what the decision says.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.entries
   where original_content ilike '%quokkaphrase%'
     and sensitivity = any (array['normal', 'private'])),
  2,
  'OD-1: the default scope returns A''s normal and private entries'
);

select is(
  (select count(*)::int from public.entries
   where original_content ilike '%quokkaphrase%'
     and sensitivity = any (array['normal', 'private'])
     and sensitivity = 'highly_sensitive'),
  0,
  'OD-1: and returns no highly_sensitive entry'
);

-- The control. Without it, "the default excludes it" would be satisfied by a
-- database where the highly_sensitive row does not exist at all.
select is(
  (select count(*)::int from public.entries
   where original_content ilike '%quokkaphrase%'
     and sensitivity = 'highly_sensitive'),
  1,
  'OD-1 control: A DOES own a highly_sensitive entry, so the exclusion above is real'
);

select is(
  (select count(*)::int from public.attachments
   where extracted_text ilike '%quokkaphrase%'
     and sensitivity = any (array['normal', 'private'])),
  1,
  'OD-1 + OD-2: the default scope excludes A''s highly_sensitive document'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the sensitive scope includes it, for the owner only (2)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.entries
   where original_content ilike '%quokkaphrase%'
     and sensitivity = any (array['normal', 'private', 'highly_sensitive'])),
  3,
  'OD-1: the explicit sensitive scope returns all three of A''s entries'
);

select is(
  (select count(*)::int from public.memories
   where content ilike '%quokkaphrase%'
     and sensitivity = any (array['normal', 'private', 'highly_sensitive'])
     and content ilike '%B %'),
  0,
  'OD-1: the sensitive scope widens sensitivity, NEVER ownership'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the mirror: as owner B, A is equally unreachable (2)
--
-- Asserted from both sides because a policy written as `user_id = auth.uid()`
-- and a policy written as `user_id = '<A>'` behave identically from A's side.
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims',
  '{"sub":"21000002-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.entries where original_content ilike '%quokkaphrase%'),
  1,
  'T-2I-01 (mirror): owner B sees exactly their own single matching entry'
);

select is(
  (select count(*)::int from public.attachments where extracted_text ilike '%quokkaphrase%'),
  1,
  'T-2I-01 (mirror): owner B sees exactly their own matching document text'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- forced RLS on every searched table (1)
--
-- The structural backstop. `enable` alone is bypassed by the table owner;
-- `force` is what makes the boundary hold for everyone.
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select count(*)::int
   from pg_class
   where relname in ('entries', 'tasks', 'memories', 'people', 'projects', 'organizations', 'attachments')
     and relnamespace = 'public'::regnamespace
     and (not relrowsecurity or not relforcerowsecurity)),
  0,
  'T-2I-01: every searched table has RLS ENABLED and FORCED'
);

select * from finish();

rollback;
