-- Signup Hardening SH.5 -- the auth abuse ledger and its ceilings, executed.
--
-- SH-THROTTLE-001 (closed vocabularies, hash-only shapes), SH-THROTTLE-002
-- (ceilings enforced in the database), SH-THROTTLE-004 (30-day retention,
-- scheduler-only), SH-THROTTLE-006 (the lockout matrix), SH-THROTTLE-007 (no
-- plaintext of a non-existing account). Migration 202608040075, ADR-080.
--
-- WHAT THIS FILE IS GUARDING AGAINST
-- ---------------------------------------------------------------------------
-- ADR-080 grants `anon` EXECUTE on the claim -- the first anonymous EXECUTE
-- grant in this database -- because every event here happens before there is a
-- session. That makes the function itself the trust boundary, so the hostile
-- caller is not hypothetical and sections 4 to 6 are written as that caller:
-- `set local role anon`, no claims, exactly what an attacker holding the
-- public anon key can reach.
--
-- Role juggling follows the SH.1/SH.3/SH.4 suites. The claim reads no JWT
-- claim at all -- deliberately, since it has no session to read -- so `anon`
-- sections set the role and nothing else. Written in pure ASCII.
--
-- NOT COVERED HERE, AND SAID SO RATHER THAN IMPLIED
-- ---------------------------------------------------------------------------
-- Genuine concurrency. A pgTAP file is one session, so "two concurrent claims
-- at the boundary admit exactly one" cannot be proven here -- section 5 proves
-- the sequential ceiling, which is a necessary but not sufficient condition.
-- SH-THROTTLE-002's concurrency half is a deployed script, and until that
-- script has run the advisory-lock claim is argued rather than demonstrated.

begin;
select plan(46);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Section 1 -- the table exists in the shape SH-THROTTLE-001 describes (10)
-- ---------------------------------------------------------------------------

select has_table('public', 'auth_event_attempts', 'the abuse ledger exists');

select has_column('public', 'auth_event_attempts', 'kind', 'kind exists');
select has_column('public', 'auth_event_attempts', 'identifier_hash', 'identifier_hash exists');
select has_column('public', 'auth_event_attempts', 'ip_hash', 'ip_hash exists');
select has_column('public', 'auth_event_attempts', 'attempted_at', 'attempted_at exists');
select has_column('public', 'auth_event_attempts', 'outcome', 'outcome exists');

-- SH-THROTTLE-007 as a schema property: the columns that would make this a
-- directory of addresses must not exist at all. Asserting their absence is the
-- point -- a later slice that adds `email` breaks this by name.
select hasnt_column('public', 'auth_event_attempts', 'email',
  'SH-THROTTLE-007: no address column');
select hasnt_column('public', 'auth_event_attempts', 'identifier',
  'SH-THROTTLE-007: no plaintext identifier column');
select hasnt_column('public', 'auth_event_attempts', 'ip_address',
  'SH-THROTTLE-007: no raw address column');
select hasnt_column('public', 'auth_event_attempts', 'user_agent',
  'SH-THROTTLE-007: no free-text fingerprint column');

-- ---------------------------------------------------------------------------
-- Section 2 -- the closed door (6)
-- ---------------------------------------------------------------------------

select is(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class where oid = 'public.auth_event_attempts'::regclass),
  true,
  'RLS is enabled and forced'
);

select is(
  (select count(*)::int from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'auth_event_attempts'
     and policyname = 'auth_event_attempts_no_client_access'),
  1,
  'the explicit no-client-access policy exists'
);

-- Every privilege, every client role. Checking the two that seem likely is how
-- a TRUNCATE grant survives a review.
select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
        unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as privilege
   where has_table_privilege(role_name::name, 'public.auth_event_attempts', privilege)),
  0,
  'no client role holds any privilege on the ledger'
);

select is(
  has_function_privilege('anon',
    'public.claim_auth_event_slot(text, text, text, integer, integer, interval)', 'execute'),
  true,
  'ADR-080: anon can claim, because every event predates the session'
);

select is(
  (select count(*)::int
   from unnest(array[
     'public.claim_auth_event_slot(text, text, text, integer, integer, interval)',
     'public.finalize_auth_event_attempt(uuid, text)'
   ]) as signature
   where has_function_privilege('service_role', signature, 'execute')),
  0,
  'service_role can neither claim nor finalize -- a grant would bypass a ceiling'
);

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
        unnest(array[
          'public.prune_auth_event_attempts()',
          'private.auth_event_ceiling_cap()'
        ]) as signature
   where has_function_privilege(role_name::name, signature, 'execute')),
  0,
  'SH-THROTTLE-004: the sweep and the cap are executable by nobody'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the CHECK vocabularies refuse what they must (6)
-- ---------------------------------------------------------------------------
-- Written as the owner, straight at the table, because a CHECK is a property of
-- the column rather than of the caller.

select throws_ok(
  $$insert into public.auth_event_attempts (kind) values ('password_change')$$,
  23514,
  null,
  'kind is a closed set'
);

select throws_ok(
  $$insert into public.auth_event_attempts (kind, outcome) values ('signup', 'maybe')$$,
  23514,
  null,
  'outcome is a closed set'
);

-- The shape CHECK is what stops a raw address being written by a future caller
-- that skipped the helper. Both spellings an accident would produce:
select throws_ok(
  $$insert into public.auth_event_attempts (kind, identifier_hash)
    values ('signup', 'victim@example.test')$$,
  23514,
  null,
  'SH-THROTTLE-007: an address cannot be stored in identifier_hash'
);

select throws_ok(
  $$insert into public.auth_event_attempts (kind, ip_hash) values ('signup', '203.0.113.7')$$,
  23514,
  null,
  'a raw IP cannot be stored in ip_hash'
);

-- Uppercase hex is not what the helper emits, so it is not accepted: two
-- spellings of one digest would be two buckets, which is the silent
-- ceiling-defeat that BYOK-SCHEMA-010's canonicalization exists to prevent.
select throws_ok(
  $$insert into public.auth_event_attempts (kind, identifier_hash)
    values ('signup', 'AAAA1111AAAA1111AAAA1111AAAA1111AAAA1111AAAA1111AAAA1111AAAA1111')$$,
  23514,
  null,
  'an uppercase digest is refused -- one digest must be one bucket'
);

select lives_ok(
  $$insert into public.auth_event_attempts (kind, identifier_hash, ip_hash)
    values ('signup', null, null)$$,
  'both hashes may be null -- an unattributable attempt is still counted'
);

delete from public.auth_event_attempts;

-- ---------------------------------------------------------------------------
-- Section 4 -- the hostile anonymous caller cannot widen its own ceiling (8)
-- ---------------------------------------------------------------------------
-- ADR-080 Decision 2: ceilings are caller-supplied, so the function must refuse
-- values that would make the ceiling meaningless. Everything here runs as the
-- attacker.

set local role anon;

select throws_ok(
  $$select public.claim_auth_event_slot('signup', null, null, 2147483647, 5, interval '1 day')$$,
  22023,
  'Invalid ceiling',
  'a ceiling above the cap is refused'
);

select throws_ok(
  $$select public.claim_auth_event_slot('signup', null, null, 5, 2147483647, interval '1 day')$$,
  22023,
  'Invalid ceiling',
  'the IP ceiling is capped too, not only the identifier one'
);

select throws_ok(
  $$select public.claim_auth_event_slot('signup', null, null, 0, 5, interval '1 day')$$,
  22023,
  'Invalid ceiling',
  'a zero ceiling is refused'
);

select throws_ok(
  $$select public.claim_auth_event_slot('signup', null, null, null, 5, interval '1 day')$$,
  22023,
  'Ceilings are required',
  'a null ceiling is refused rather than defaulted'
);

-- A window wide enough to be meaningless is the same bypass as a ceiling high
-- enough to be meaningless.
select throws_ok(
  $$select public.claim_auth_event_slot('signup', null, null, 5, 5, interval '400 days')$$,
  22023,
  'Invalid window',
  'an unbounded window is refused'
);

select throws_ok(
  $$select public.claim_auth_event_slot('signup', null, null, 5, 5, interval '0')$$,
  22023,
  'Invalid window',
  'a zero window is refused'
);

select throws_ok(
  $$select public.claim_auth_event_slot('logout', null, null, 5, 5, interval '1 day')$$,
  22023,
  'Invalid auth event kind',
  'an unknown kind is refused'
);

-- SH-THROTTLE-007 at the function boundary, not only at the column: a caller
-- that passes an address must be refused BEFORE anything is counted or stored.
select throws_ok(
  $$select public.claim_auth_event_slot('signup', 'victim@example.test', null, 5, 5, interval '1 day')$$,
  22023,
  'Invalid identifier hash',
  'SH-THROTTLE-007: an address is refused by the function, before storage'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 5 -- the ceiling actually refuses (7)
-- ---------------------------------------------------------------------------

-- `ok(... is not null)` rather than `isnt(..., null)`: pgTAP's isnt takes
-- `anyelement`, and an untyped NULL leaves the polymorphic type undecidable, so
-- that spelling fails to resolve instead of failing the assertion.

set local role anon;

select ok(
  public.claim_auth_event_slot(
    'recovery',
    repeat('a', 64), repeat('b', 64), 2, 10, interval '1 day'
  ) is not null,
  'the first claim under the ceiling succeeds'
);

select ok(
  public.claim_auth_event_slot(
    'recovery',
    repeat('a', 64), repeat('b', 64), 2, 10, interval '1 day'
  ) is not null,
  'the second claim, still under the ceiling, succeeds'
);

select throws_ok(
  $$select public.claim_auth_event_slot(
      'recovery', repeat('a', 64), repeat('b', 64), 2, 10, interval '1 day')$$,
  'P0001',
  'Auth event ceiling reached',
  'the third claim is refused at the identifier ceiling'
);

-- The IP ceiling is a separate refusal, reached with a fresh identifier so the
-- identifier ceiling cannot be what fires.
select throws_ok(
  $$select public.claim_auth_event_slot(
      'recovery', repeat('c', 64), repeat('b', 64), 5, 2, interval '1 day')$$,
  'P0001',
  'Auth event ceiling reached',
  'the IP ceiling refuses independently of the identifier ceiling'
);

-- SH-THROTTLE-006, the lockout matrix. Burning an identifier's recovery bucket
-- must not disable its OTHER paths -- otherwise identifier-stuffing locks a
-- real owner out of their own account, which is the attack the requirement
-- names.
select ok(
  public.claim_auth_event_slot(
    'signin_failure',
    repeat('a', 64), repeat('b', 64), 2, 10, interval '1 day'
  ) is not null,
  'SH-THROTTLE-006: a spent recovery ceiling leaves sign-in available'
);

select ok(
  public.claim_auth_event_slot(
    'signup', repeat('a', 64), repeat('b', 64), 2, 10, interval '1 day'
  ) is not null,
  'each kind counts in its own bucket'
);

reset role;

-- A window that has already closed frees the bucket, which is what makes the
-- ceiling a rate and not a lifetime quota.
--
-- The aged rows are inserted directly, and that is not incidental. `now()` is
-- TRANSACTION start time, so every row this file writes through the claim
-- carries the same attempted_at -- shrinking the window to a microsecond would
-- still match all of them and would prove the opposite of what it looked like
-- it proved. Backdating the rows is the only way to put anything genuinely
-- outside the window inside one transaction.
insert into public.auth_event_attempts (kind, identifier_hash, ip_hash, attempted_at)
values
  ('recovery', repeat('9', 64), repeat('b', 64), now() - interval '2 days'),
  ('recovery', repeat('9', 64), repeat('b', 64), now() - interval '2 days');

set local role anon;

select ok(
  public.claim_auth_event_slot(
    'recovery', repeat('9', 64), null, 2, 10, interval '1 day'
  ) is not null,
  'attempts older than the window do not count against it'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 6 -- finalize is one-way and silent (5)
-- ---------------------------------------------------------------------------

delete from public.auth_event_attempts;

select set_config(
  'sh5.attempt_id',
  (select public.claim_auth_event_slot(
     'signup', repeat('d', 64), null, 5, 5, interval '1 day')::text),
  true
);

select is(
  (select outcome from public.auth_event_attempts
   where id = current_setting('sh5.attempt_id')::uuid),
  'unknown',
  'a claimed slot starts provisional, so a crash cannot earn free attempts'
);

set local role anon;

select lives_ok(
  $$select public.finalize_auth_event_attempt(
      current_setting('sh5.attempt_id')::uuid, 'succeeded')$$,
  'the claimant can finalize its own attempt'
);

select throws_ok(
  $$select public.finalize_auth_event_attempt(
      current_setting('sh5.attempt_id')::uuid, 'unknown')$$,
  22023,
  'Invalid outcome',
  'the provisional value is a starting state, not a settable outcome'
);

-- A foreign id, a missing id and an already-finalized row are ONE outcome to
-- the caller, so this cannot be used to probe which attempts exist.
select lives_ok(
  $$select public.finalize_auth_event_attempt(
      '00000000-0000-4000-8000-000000000000'::uuid, 'refused')$$,
  'finalizing an id that does not exist is silent'
);

reset role;

select is(
  (select outcome from public.auth_event_attempts
   where id = current_setting('sh5.attempt_id')::uuid),
  'succeeded',
  'finalize is one-way: the second call did not move it back'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- retention is bounded and swept by the scheduler alone (4)
-- ---------------------------------------------------------------------------

delete from public.auth_event_attempts;

insert into public.auth_event_attempts (kind, identifier_hash, attempted_at) values
  ('signup', repeat('e', 64), now() - interval '31 days'),
  ('signup', repeat('f', 64), now() - interval '30 days' - interval '1 second'),
  ('signup', repeat('0', 64), now() - interval '29 days'),
  ('signup', repeat('1', 64), now());

select is(
  public.prune_auth_event_attempts(),
  2,
  'SH-THROTTLE-004: the sweep removes exactly what is past the window'
);

select is(
  (select count(*)::int from public.auth_event_attempts),
  2,
  'and leaves exactly what is inside it'
);

select is(
  (select count(*)::int from public.auth_event_attempts
   where attempted_at < now() - interval '30 days'),
  0,
  'nothing older than the window survives'
);

set local role anon;

select throws_ok(
  $$select public.prune_auth_event_attempts()$$,
  42501,
  null,
  'a client role cannot sweep -- deleting rows here resets ceilings'
);

reset role;

select * from finish();
rollback;
