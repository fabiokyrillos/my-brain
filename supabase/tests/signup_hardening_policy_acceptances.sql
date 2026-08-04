-- Signup Hardening SH.4 -- versioned consent, executed.
--
-- SH-LEGAL-005 (the table, its grants and its append-only posture),
-- SH-LEGAL-006 (a version that is not current is refused at the boundary that
-- is actually open), SH-LEGAL-011 (the record is server-side and is the
-- enforcement point). Migration 202608040074.
--
-- The adversarial floor for this slice (plan sec. 3): version drift (T-28),
-- browser-only consent (T-29), a version change without re-acceptance (T-30),
-- and retention copy that contradicts what is retained (T-31 -- a repository
-- test, since the copy is TypeScript).
--
-- THE ATTACK THIS FILE EXISTS FOR
-- ---------------------------------------------------------------------------
-- `policy_acceptances` is directly insertable by `authenticated` -- SH-LEGAL-005
-- says so in those words -- so PostgREST is a real door, not a hypothetical one.
-- A client that could insert `version = '9999-12-31'` would pre-accept every
-- future policy it has never been shown, and no amount of Server Action
-- validation would stop it, because the Server Action is not the only door.
-- Section 3 is that attack, executed as the authenticated user.
--
-- Role juggling follows the SH.1/SH.3 suites: auth.role() reads the JWT claim,
-- so authenticated calls set the role AND the claims. Written in pure ASCII.

begin;
select plan(21);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures -- two accounts, so every own-row claim has a bystander to fail on
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('54000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'sh4-consenting@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('54000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'sh4-bystander@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- `private.current_policy_version` is executable by NO role -- which is correct,
-- and means the authenticated sections below cannot call it to build their own
-- fixtures. Hard-coding the date instead would silently rot at the next bump.
--
-- So the versions are captured HERE, as the session superuser, into
-- transaction-local settings that any role can read back. Deliberately NOT a
-- `pg_temp` helper function: after `set local role authenticated`, calling one
-- would need USAGE on this session's temp schema, which `authenticated` does
-- not hold -- the assertion would fail on a schema permission that looks
-- nothing like the thing it was testing.
select set_config('sh4.terms_version', private.current_policy_version('terms'), true);
select set_config('sh4.privacy_version', private.current_policy_version('privacy'), true);

-- ---------------------------------------------------------------------------
-- Section 1 -- the current version exists in SQL, for both documents (3)
-- ---------------------------------------------------------------------------
-- SH-LEGAL-004. The parity with the TypeScript constant is a repository test
-- (`version-parity.test.ts`); what belongs here is that SQL has an answer at
-- all, and only for the declared documents.

select isnt(
  private.current_policy_version('terms'),
  null,
  'the database knows the current version of the terms'
);

select isnt(
  private.current_policy_version('privacy'),
  null,
  'and of the privacy policy'
);

select is(
  private.current_policy_version('something_else'),
  null,
  'and of nothing else -- the document set is closed in SQL too'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the RPC records the current version and is idempotent (4)
-- ---------------------------------------------------------------------------
-- SH-LEGAL-006/008.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '54000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select public.record_policy_acceptance('terms', 'interposition') ->> 'recorded'),
  'true',
  'the first acceptance is recorded'
);

select is(
  (
    select version from public.policy_acceptances
    where user_id = '54000001-0000-4000-8000-000000000001' and document = 'terms'
  ),
  current_setting('sh4.terms_version'),
  'and it carries the CURRENT version -- which the caller never named'
);

select is(
  (select public.record_policy_acceptance('terms', 'interposition') ->> 'recorded'),
  'false',
  'a retried acceptance is the same fact, recorded once and reported as already held'
);

select is(
  (
    select count(*)::int from public.policy_acceptances
    where user_id = '54000001-0000-4000-8000-000000000001'
  ),
  1,
  'the retry wrote no second row'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the direct INSERT door, and the guard standing in it (4)
-- ---------------------------------------------------------------------------
-- SH-LEGAL-006, T-28/T-30. Executed as the authenticated user, through the
-- grant SH-LEGAL-005 deliberately leaves open.

select throws_ok(
  $$ insert into public.policy_acceptances (user_id, document, version, surface)
     values ('54000001-0000-4000-8000-000000000001', 'privacy', '9999-12-31', 'interposition') $$,
  '22023',
  null,
  'a client cannot pre-accept a future version it has never been shown'
);

select throws_ok(
  $$ insert into public.policy_acceptances (user_id, document, version, surface)
     values ('54000001-0000-4000-8000-000000000001', 'privacy', '2020-01-01', 'interposition') $$,
  '22023',
  null,
  'nor record acceptance of a superseded version'
);

select throws_ok(
  $$ insert into public.policy_acceptances (user_id, document, version, surface)
     values ('54000001-0000-4000-8000-000000000001', 'cookies', '2026-08-04', 'interposition') $$,
  '22023',
  null,
  'nor invent a document -- the BEFORE trigger fires ahead of the CHECK and names it first'
);

-- Non-vacuous: the same door, used correctly, works. Without this the three
-- refusals above would pass for a table nobody can insert into at all.
select lives_ok(
  $$ insert into public.policy_acceptances (user_id, document, version, surface)
     values (
       '54000001-0000-4000-8000-000000000001', 'privacy',
       current_setting('sh4.privacy_version'), 'interposition'
     ) $$,
  'the direct INSERT of the CURRENT version is accepted -- the guard is a version check, not a wall'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- own-row only, and append-only (5)
-- ---------------------------------------------------------------------------
-- SH-LEGAL-005, T-29.

select throws_ok(
  $$ insert into public.policy_acceptances (user_id, document, version, surface)
     values (
       '54000002-0000-4000-8000-000000000002', 'terms',
       current_setting('sh4.terms_version'), 'interposition'
     ) $$,
  '42501',
  null,
  'one account cannot record an acceptance on behalf of another'
);

select throws_ok(
  $$ update public.policy_acceptances set version = '2020-01-01'
     where user_id = '54000001-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'acceptances cannot be edited -- there is no UPDATE policy at all'
);

select throws_ok(
  $$ delete from public.policy_acceptances
     where user_id = '54000001-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'nor deleted -- an acceptance is a fact, not a preference'
);

select is(
  (select count(*)::int from public.policy_acceptances),
  2,
  'authenticated sees exactly its own two rows and nobody else''s'
);

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.policy_acceptances $$,
  '42501',
  null,
  'anon holds nothing on policy_acceptances'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 5 -- the RPC's own boundary (3)
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select public.record_policy_acceptance('terms', 'interposition') $$,
  '42501',
  null,
  'anon cannot execute the acceptance RPC'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000002-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '54000002-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.record_policy_acceptance('cookies', 'interposition') $$,
  '22023',
  null,
  'the RPC refuses an unknown document'
);

select throws_ok(
  $$ select public.record_policy_acceptance('terms', 'somewhere_else') $$,
  '22023',
  null,
  'and an unknown acceptance surface'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 6 -- the bystander is untouched, and the cascade still holds (2)
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::int from public.policy_acceptances
    where user_id = '54000002-0000-4000-8000-000000000002'
  ),
  0,
  'the bystander recorded nothing -- none of the refusals above leaked into it'
);

delete from auth.users where id = '54000001-0000-4000-8000-000000000001';

select is(
  (
    select count(*)::int from public.policy_acceptances
    where user_id = '54000001-0000-4000-8000-000000000001'
  ),
  0,
  'acceptances cascade with the account -- the table joins the deletion drill unasked'
);

select * from finish();
rollback;
