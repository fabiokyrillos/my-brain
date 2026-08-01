-- BYOK Slice BYOK.2 — the resolvers.
--
-- Two functions and no consumer. BYOK.3 gives the synchronous one a caller,
-- BYOK.4 the asynchronous one. This migration adds no table, no column, no
-- policy and no grant on any table.
--
-- WHY NEITHER TAKES A user_id ARGUMENT
-- ---------------------------------------------------------------------------
-- BYOK-RESOLVER-001. A resolver that accepts an owner is a resolver that can be
-- asked for somebody else's credential, and every defence after that point is a
-- check somebody has to remember to write. These derive the owner
-- **structurally** instead:
--
--   * the synchronous one from `auth.uid()` -- the caller cannot choose it;
--   * the asynchronous one from `jobs.user_id` of the row it was handed -- the
--     worker cannot choose it either, and a job id is not a credential selector
--     because the job's owner is a fact about the row rather than an argument.
--
-- The absence is asserted against `pg_proc.proargnames`, so a future signature
-- change that adds one fails the suite rather than passing review.
--
-- WHY NEITHER DECRYPTS
-- ---------------------------------------------------------------------------
-- BYOK-RESOLVER-004. No SQL in this chain decrypts anything, and the master key
-- is not in this database to decrypt with (BYOK-MASTER-004). Both return the
-- sealed envelope; the runtime that holds the key opens it. That is what keeps a
-- database copy inert, and it is why `BYOK-RESOLVER-007` can accept, in writing,
-- that a user calling the synchronous resolver through PostgREST with their own
-- token receives their own ciphertext: it is their secret, they typed it, and
-- it is useless without a key the database has never seen. The AAD binding makes
-- it useless in any other account as well.
--
-- WHY BOTH RETURN ONLY `active`
-- ---------------------------------------------------------------------------
-- BYOK-RESOLVER-005. `invalid`, `removed` and absent collapse into one outcome --
-- no row -- so a resolver is never an oracle for another account's configuration
-- state.
--
-- ONE PRD CONTRADICTION, RESOLVED IN THE DIRECTION THE MATRIX EXECUTES
-- ---------------------------------------------------------------------------
-- BYOK-RESOLVER-006 says a job "the caller may not see" and a non-existent job
-- must raise the **same** `P0002`, so the function cannot probe row existence.
-- PRD §20 case 8 says a job owned by B returns **B's** credential, because the
-- worker legitimately processes B's jobs.
--
-- Both are satisfiable, because the two describe disjoint situations. The
-- function is granted to `service_role` alone, and `service_role` may see every
-- job -- so "a job the caller may not see" is the **empty set** for the only
-- caller that exists, and the sole remaining failure is "no such job row". Case
-- 8 therefore governs what a foreign job does, and `P0002` is reserved for a job
-- id that matches nothing. Recorded in the slice acceptance report rather than
-- resolved silently, because the two sentences do read as though they conflict.

create or replace function public.resolve_own_ai_credential()
returns table (
  ciphertext bytea,
  iv bytea,
  key_version smallint,
  status text,
  provider text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  -- BYOK-RESOLVER-002. A null identity is an authentication failure, not an
  -- empty result: "no credential" and "nobody asked" are different facts and a
  -- caller that cannot tell them apart will treat a broken session as a
  -- missing key.
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    credential.ciphertext,
    credential.iv,
    credential.key_version,
    credential.status,
    credential.provider
  from public.user_ai_credentials as credential
  where credential.user_id = current_user_id
    and credential.status = 'active';
end;
$$;

comment on function public.resolve_own_ai_credential() is
  'Returns the calling user''s ACTIVE credential envelope, ciphertext only. Owner comes from auth.uid(); there is no user_id argument and nothing here decrypts.';

create or replace function public.resolve_job_ai_credential(p_job_id uuid)
returns table (
  ciphertext bytea,
  iv bytea,
  key_version smallint,
  status text,
  provider text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  -- BYOK-RESOLVER-003. The owner is read from the row, never taken from the
  -- caller. `jobs.user_id` is `not null`, so a null here means no such row --
  -- which is the only failure this function has.
  select job.user_id
  into owner_id
  from public.jobs as job
  where job.id = p_job_id;

  if owner_id is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  return query
  select
    credential.ciphertext,
    credential.iv,
    credential.key_version,
    credential.status,
    credential.provider
  from public.user_ai_credentials as credential
  where credential.user_id = owner_id
    and credential.status = 'active';
end;
$$;

comment on function public.resolve_job_ai_credential(uuid) is
  'Returns the ACTIVE credential envelope of the job row''s owner, ciphertext only. Owner comes from jobs.user_id; there is no user_id argument and nothing here decrypts. service_role only.';

-- BYOK-RESOLVER-002/003, the grants.
--
-- `create function` grants EXECUTE to PUBLIC by default, so the revoke is not
-- decoration -- without it both functions are callable by every role that can
-- reach the database. `anon` and `authenticated` are named explicitly as well:
-- revoking from PUBLIC does not remove a privilege granted to a role directly,
-- and naming them makes the intent survive a future migration that grants one by
-- accident.
revoke all on function public.resolve_own_ai_credential()
  from public, anon, service_role;
grant execute on function public.resolve_own_ai_credential()
  to authenticated;

revoke all on function public.resolve_job_ai_credential(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_job_ai_credential(uuid)
  to service_role;

-- Post-deploy assertion, in the `202607300063` shape: the posture this file
-- claims is read back out of the catalog at apply time, so a migration that
-- applied but produced the wrong signature or the wrong privileges fails here
-- rather than in production. The pgTAP suite asserts the same posture from zero
-- on every CI run; this block asserts it once, against the database that just
-- changed.
do $byok_resolvers_postcondition$
declare
  offending text;
begin
  -- BYOK-RESOLVER-001, at apply time. `proargnames` is null for a function with
  -- no arguments, so the own-resolver is checked by argument count instead --
  -- a `coalesce` to an empty array would make "no arguments" and "one argument
  -- not called user_id" look the same.
  if (select pronargs from pg_catalog.pg_proc
        where oid = 'public.resolve_own_ai_credential()'::regprocedure) <> 0 then
    raise exception 'resolve_own_ai_credential must take no arguments'
      using errcode = 'P0001', detail = 'BYOK_RESOLVER_SIGNATURE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join pg_catalog.unnest(
      coalesce(procedure.proargnames, array[]::text[])
    ) as argument(name)
    where procedure.oid = 'public.resolve_job_ai_credential(uuid)'::regprocedure
      and argument.name ~* 'user_?id'
  ) then
    raise exception 'resolve_job_ai_credential must not take a user_id argument'
      using errcode = 'P0001', detail = 'BYOK_RESOLVER_SIGNATURE';
  end if;

  -- Both must be SECURITY DEFINER, and both must pin an empty search_path: a
  -- definer function that inherited the caller's search_path is the classic
  -- privilege-escalation shape.
  --
  -- The tolerant pair `('search_path=', 'search_path=""')` is not sloppiness --
  -- it is the form `202607310064:843` and `ai_interpretation_bounds.sql:33`
  -- already use, because PostgreSQL has stored the empty value both ways across
  -- versions. Asserting one spelling would fail the migration on the other, and
  -- it would fail it *while the function was correct*.
  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.oid in (
            'public.resolve_own_ai_credential()'::regprocedure,
            'public.resolve_job_ai_credential(uuid)'::regprocedure
          )
      and (
        not procedure.prosecdef
        or not exists (
          select 1
          from pg_catalog.unnest(
            coalesce(procedure.proconfig, array[]::text[])
          ) as setting(value)
          where pg_catalog.lower(setting.value) in ('search_path=', 'search_path=""')
        )
      )
  ) then
    raise exception 'a BYOK resolver is not SECURITY DEFINER with an empty search_path'
      using errcode = 'P0001', detail = 'BYOK_RESOLVER_SECURITY';
  end if;

  -- Reported as the list of offenders rather than as a boolean, so a failure
  -- names the role and function that leaked. `public` is deliberately absent
  -- from the role list: it is a pseudo-role with no `pg_roles` entry, and
  -- `has_function_privilege('public', ...)` raises rather than returning false.
  -- Nothing is lost -- a privilege granted to PUBLIC is held by every real role,
  -- so `anon` detects it.
  select coalesce(string_agg(found.label, ', ' order by found.label), '')
  into offending
  from (
    select role_name || ' can execute resolve_job_ai_credential' as label
    from unnest(array['anon', 'authenticated']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'public.resolve_job_ai_credential(uuid)', 'execute'
    )

    union all

    select role_name || ' can execute resolve_own_ai_credential' as label
    from unnest(array['anon', 'service_role']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'public.resolve_own_ai_credential()', 'execute'
    )
  ) as found;

  if offending <> '' then
    raise exception 'a BYOK resolver is reachable by a role it must not be: %', offending
      using errcode = 'P0001', detail = 'BYOK_RESOLVER_GRANT';
  end if;

  -- The positive control. Without it, a migration that revoked everything and
  -- granted nothing back would satisfy every assertion above while leaving both
  -- resolvers unreachable by the roles that need them.
  if not (
    pg_catalog.has_function_privilege(
      'authenticated', 'public.resolve_own_ai_credential()', 'execute'
    )
    and pg_catalog.has_function_privilege(
      'service_role', 'public.resolve_job_ai_credential(uuid)', 'execute'
    )
  ) then
    raise exception 'a BYOK resolver is unreachable by the role that needs it'
      using errcode = 'P0001', detail = 'BYOK_RESOLVER_MISSING_GRANT';
  end if;
end;
$byok_resolvers_postcondition$;
