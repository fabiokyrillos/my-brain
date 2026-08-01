-- BYOK Slice BYOK.1 — the credential store.
--
-- Two tables and no reader. No resolver, no adapter, no product surface, and no
-- provider change: BYOK.2 adds the resolvers, BYOK.3 the Node adapter and
-- Settings. This file is the contract those slices are written against, in the
-- Slice 2E.1 shape — schema first, consumers later.
--
-- WHAT IS DELIBERATELY ABSENT
-- ---------------------------------------------------------------------------
-- **No plaintext column, under any name** (BYOK-SCHEMA-002). The only key
-- material this table ever holds is `ciphertext`, sealed with AES-256-GCM under
-- a master key that lives in the application environment and is never in the
-- database (BYOK-MASTER-004). A database copy without that key is inert.
--
-- **No DELETE grant and no DELETE policy to any client role**
-- (BYOK-SCHEMA-004/005). Removal is a status transition that nulls the
-- ciphertext, not a row deletion — so "the user removed their key" and "the row
-- was never there" stay distinguishable in the owner's own history while being
-- indistinguishable to a resolver. Rows disappear exactly one way: the
-- `auth.users` cascade.
--
-- TWO RECORDED DEPARTURES FROM THE PRD, NEITHER SILENT
-- ---------------------------------------------------------------------------
-- 1. **An own-row INSERT policy exists.** BYOK-SCHEMA-004 enumerates `select`
--    and `update` policies; BYOK-SCHEMA-005 grants `select, insert, update`.
--    Under forced RLS those two do not cohere: a grant with no policy is dead
--    weight, and every INSERT would be refused by the policy layer after
--    passing the privilege layer. The policy is what makes SCHEMA-005's grant
--    mean what it says. Recorded in the slice acceptance report rather than
--    folded in as though the PRD had asked for it.
--
-- 2. **`fingerprint` stores `<prefix>:<6 hex>`, not bare hex.**
--    BYOK-FINGERPRINT-002 displays "sk-proj · a3f9c1", so the prefix must
--    survive the write; BYOK-SCHEMA-002's column list has nowhere else to put
--    it. Composing it into `fingerprint` under a CHECK keeps
--    BYOK-FINGERPRINT-004's allowlist closed **in the database** rather than in
--    application code — the same choice BYOK-SCHEMA-003 makes for `status`, and
--    for the same reason.
--
-- ONE CONFLICT THIS FILE DOES **NOT** RESOLVE
-- ---------------------------------------------------------------------------
-- BYOK-SCHEMA-007 fixes this table's columns at `(user_id, attempted_at,
-- outcome)`. Implementation-plan task 3.8 requires BYOK.3 to throttle
-- validation "per user **and per IP**" over this same table, and BYOK.3's
-- migration budget is **zero**. No column here can carry an IP, so as written
-- the two cannot both hold. This migration implements SCHEMA-007 exactly and
-- **does not** invent a column: expanding a governing document's schema inside
-- a branch is the move this repository refuses. The conflict is raised as an
-- owner decision required before BYOK.3 starts.

create table public.user_ai_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'openai',
  status text not null,
  ciphertext bytea,
  iv bytea,
  key_version smallint,
  fingerprint text,
  validated_at timestamptz,
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_ai_credentials_provider_check
    check (provider in ('openai')),

  -- BYOK-SCHEMA-003, closed set.
  constraint user_ai_credentials_status_check
    check (status in ('active', 'invalid', 'removed')),

  -- BYOK-SCHEMA-006. A closed vocabulary, so a provider message, a key
  -- substring or any free text cannot land here even by accident.
  constraint user_ai_credentials_last_failure_code_check
    check (
      last_failure_code is null
      or last_failure_code in (
        'invalid_key', 'insufficient_quota', 'rate_limited', 'revoked', 'unknown'
      )
    ),

  -- BYOK-SCHEMA-003's consistency rule, as a table CHECK rather than as
  -- application code. Three arms, one per status, and they are exhaustive
  -- because `status` is already closed above:
  --
  --   active  -- every field a decryption needs is present;
  --   removed -- the ciphertext and IV are gone, which is what makes removal a
  --              real erasure of key material and not a flag;
  --   invalid -- deliberately unconstrained on ciphertext. A key that the
  --              provider rejected is still a key the user pasted; keeping its
  --              ciphertext lets rotation compare fingerprints and detect a
  --              re-paste of the same dead key without asking them to type it
  --              again. It is never resolvable: BYOK-RESOLVER-005 returns rows
  --              only for `active`.
  constraint user_ai_credentials_status_shape_check
    check (
      (
        status = 'active'
        and ciphertext is not null
        and iv is not null
        and key_version is not null
        and fingerprint is not null
        and validated_at is not null
      )
      or (
        status = 'removed'
        and ciphertext is null
        and iv is null
      )
      or status = 'invalid'
    ),

  -- BYOK-CRYPTO-002: 96-bit IV, always. A row whose IV is any other length was
  -- not written by this system's crypto core.
  constraint user_ai_credentials_iv_length_check
    check (iv is null or pg_catalog.octet_length(iv) = 12),

  -- BYOK-CRYPTO-003: `ciphertext` is ciphertext ‖ 128-bit tag as one value, so
  -- the floor is the tag itself plus one byte. The ceiling is a sanity bound on
  -- an API key, not a security control -- the real length limit is validated at
  -- the boundary before encryption.
  constraint user_ai_credentials_ciphertext_length_check
    check (ciphertext is null or pg_catalog.octet_length(ciphertext) between 17 and 2048),

  -- BYOK-MASTER-009. Version 0 is not a version; a null means "no ciphertext".
  constraint user_ai_credentials_key_version_check
    check (key_version is null or key_version > 0),

  -- BYOK-FINGERPRINT-002/004. Closed prefix vocabulary, `unknown` fallback, six
  -- lowercase hex characters. No substring of the API key can satisfy this
  -- pattern, which is the point of BYOK-FINGERPRINT-003.
  constraint user_ai_credentials_fingerprint_check
    check (fingerprint is null or fingerprint ~ '^(sk-proj|sk|unknown):[0-9a-f]{6}$')
);

comment on table public.user_ai_credentials is
  'One encrypted provider credential per user. Ciphertext only; the master key lives in the application environment and never in this database.';

-- BYOK-SCHEMA-007. Append-only throttle evidence. No key material, no
-- fingerprint, no provider message -- three columns and an identity.
create table public.credential_validation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null,

  constraint credential_validation_attempts_outcome_check
    check (
      outcome in (
        'succeeded', 'invalid_key', 'insufficient_quota', 'rate_limited',
        'revoked', 'unknown'
      )
    )
);

comment on table public.credential_validation_attempts is
  'Append-only validation-attempt evidence for the BYOK throttle. Stores no key material and no fingerprint.';

-- The throttle reads "this owner's attempts since a cutoff", newest first.
create index credential_validation_attempts_user_time_idx
  on public.credential_validation_attempts (user_id, attempted_at desc);

alter table public.user_ai_credentials enable row level security;
alter table public.user_ai_credentials force row level security;
alter table public.credential_validation_attempts enable row level security;
alter table public.credential_validation_attempts force row level security;

create policy user_ai_credentials_select_own
  on public.user_ai_credentials
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- See "TWO RECORDED DEPARTURES" above: this policy is what makes
-- BYOK-SCHEMA-005's INSERT grant reachable at all.
create policy user_ai_credentials_insert_own
  on public.user_ai_credentials
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- `using` and `with check` both, so an UPDATE can neither reach another owner's
-- row nor move its own row to another owner.
create policy user_ai_credentials_update_own
  on public.user_ai_credentials
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy credential_validation_attempts_select_own
  on public.credential_validation_attempts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy credential_validation_attempts_insert_own
  on public.credential_validation_attempts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- BYOK-SCHEMA-005. Revoke first from every client role, then grant back exactly
-- what each needs. **No DELETE anywhere, and no UPDATE on the append-only
-- table** -- an attempt record that can be edited is not evidence.
revoke all on table public.user_ai_credentials from public, anon, authenticated;
revoke all on table public.credential_validation_attempts from public, anon, authenticated;

grant select, insert, update on table public.user_ai_credentials to authenticated;
grant select, insert on table public.credential_validation_attempts to authenticated;

-- `updated_at` is maintained by the database, not by whoever writes the row: a
-- rotation that forgot to set it would leave Settings reporting a stale time
-- for a credential that had just changed.
create or replace function public.touch_user_ai_credentials_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Schema-qualified: `search_path` is empty, and the repository's convention
  -- is to name `pg_catalog` explicitly rather than lean on its implicit entry.
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.touch_user_ai_credentials_updated_at()
  from public, anon, authenticated;

create trigger user_ai_credentials_touch_updated_at
before update on public.user_ai_credentials
for each row execute function public.touch_user_ai_credentials_updated_at();

-- Post-deploy assertion, in the `202607300063` shape: the posture this file
-- claims is read back out of the catalog at apply time, so a migration that
-- applied but produced the wrong privileges fails here rather than in
-- production. The pgTAP suite asserts the same posture from zero on every CI
-- run; this block asserts it once, against the database that just changed.
do $byok_credential_store_postcondition$
declare
  offending text;
begin
  if not (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.user_ai_credentials'::regclass
  ) then
    raise exception 'user_ai_credentials RLS is not enabled and forced'
      using errcode = 'P0001', detail = 'BYOK_RLS_NOT_FORCED';
  end if;

  if not (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.credential_validation_attempts'::regclass
  ) then
    raise exception 'credential_validation_attempts RLS is not enabled and forced'
      using errcode = 'P0001', detail = 'BYOK_RLS_NOT_FORCED';
  end if;

  -- Reported as the list of offenders rather than as a boolean, so a failure
  -- names the role and privilege that leaked instead of only saying one did.
  --
  -- **`public` is deliberately not in the role list.** It is a pseudo-role with
  -- no `pg_roles` entry, and `has_table_privilege('public', ...)` raises
  -- `role "public" does not exist` -- a postcondition that aborts the migration
  -- it was meant to verify. Nothing is lost by its absence: a privilege granted
  -- to PUBLIC is held by every actual role, so `anon` below detects it.
  select coalesce(string_agg(found.label, ', ' order by found.label), '')
  into offending
  from (
    select role_name || ':' || table_name || ':' || privilege as label
    from unnest(array['anon', 'authenticated']) as role_name,
         unnest(array[
           'public.user_ai_credentials',
           'public.credential_validation_attempts'
         ]) as table_name,
         unnest(array['delete']) as privilege
    where pg_catalog.has_table_privilege(role_name, table_name, privilege)

    union all

    select 'authenticated:public.credential_validation_attempts:update' as label
    where pg_catalog.has_table_privilege(
      'authenticated', 'public.credential_validation_attempts', 'update'
    )

    union all

    select 'anon:' || table_name || ':' || privilege as label
    from unnest(array[
           'public.user_ai_credentials',
           'public.credential_validation_attempts'
         ]) as table_name,
         unnest(array['select', 'insert', 'update']) as privilege
    where pg_catalog.has_table_privilege('anon', table_name, privilege)
  ) as found;

  if offending <> '' then
    raise exception 'BYOK credential store granted a privilege it must not: %', offending
      using errcode = 'P0001', detail = 'BYOK_UNEXPECTED_GRANT';
  end if;

  -- The positive control. Without it, a migration that revoked everything and
  -- granted nothing back would satisfy every assertion above while leaving the
  -- product unable to read its own credential row.
  if not (
    pg_catalog.has_table_privilege('authenticated', 'public.user_ai_credentials', 'select')
    and pg_catalog.has_table_privilege('authenticated', 'public.user_ai_credentials', 'insert')
    and pg_catalog.has_table_privilege('authenticated', 'public.user_ai_credentials', 'update')
    and pg_catalog.has_table_privilege('authenticated', 'public.credential_validation_attempts', 'select')
    and pg_catalog.has_table_privilege('authenticated', 'public.credential_validation_attempts', 'insert')
  ) then
    raise exception 'BYOK credential store is missing a privilege the product needs'
      using errcode = 'P0001', detail = 'BYOK_MISSING_GRANT';
  end if;
end;
$byok_credential_store_postcondition$;
