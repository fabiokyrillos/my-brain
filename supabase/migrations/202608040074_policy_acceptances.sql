-- Signup Hardening SH.4 -- versioned consent, recorded server-side.
--
-- SH-LEGAL-005 (the table and its append-only client posture), SH-LEGAL-006
-- (a validated write path that cannot record a version that is not current),
-- SH-LEGAL-008/009/011 (the record is the enforcement point, and a version bump
-- re-interposes), SH-EXPOSURE-008. ADR-079.
--
-- WHY THE CURRENT VERSION LIVES IN SQL AS WELL AS IN TYPESCRIPT
-- ---------------------------------------------------------------------------
-- SH-LEGAL-004 makes the version a single repository constant, and
-- `src/features/legal/versions.ts` is that constant: rendering, acceptance and
-- enforcement all read it. But a constant only TypeScript knows is a constant
-- PostgREST does not enforce -- and `policy_acceptances` is directly insertable
-- by `authenticated` (SH-LEGAL-005 says so in those words). Without a database
-- guard, a client could insert `{"document":"terms","version":"9999-12-31"}`
-- and pre-accept every future policy it has never seen. That is the attack this
-- file exists to make impossible, and no amount of Server Action validation
-- closes it, because the Server Action is not the only door.
--
-- So the version is stated in both places and pinned to itself:
-- `private.current_policy_version` holds it, a BEFORE INSERT trigger refuses
-- anything else, and `src/features/legal/version-parity.test.ts` compares the
-- two literals in both directions -- the `extraction-parity.test.ts` pattern,
-- for the same reason it exists there.
--
-- **Consequence, stated rather than discovered:** bumping a policy version is a
-- migration plus the constant change in the same commit. That is not a cost we
-- are absorbing reluctantly; a policy version bump is a deliberate legal event
-- that re-interposes consent for every existing account, and making it a
-- reviewed schema change is the right weight for it. ADR-079 records this.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- ---------------------------------------------------------------------------
-- It does not decide any legal fact. The operator identity, the contact
-- address, the governing law and the jurisdiction are **named placeholders** in
-- `src/features/legal/placeholders.ts`, awaiting owner values (SH-LEGAL-002/003),
-- and both documents carry the "requires professional legal review before
-- commercial launch" banner (SH-LEGAL-013). The mechanism is complete; the
-- content is honestly labelled as draft.

-- ---------------------------------------------------------------------------
-- 1. The current version, in SQL
-- ---------------------------------------------------------------------------
--
-- `private`, so no role reaches it directly and the only thing that can consult
-- it is the trigger and the RPC below, both of which are DEFINER.

create or replace function private.current_policy_version(p_document text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_document
    when 'terms' then '2026-08-04'
    when 'privacy' then '2026-08-04'
  end;
$$;

revoke all on function private.current_policy_version(text)
  from public, anon, authenticated, service_role;

comment on function private.current_policy_version(text) is
  'SH-LEGAL-004/006. The current version of each policy document, in SQL. Pinned to src/features/legal/versions.ts in both directions by version-parity.test.ts -- two surfaces cannot disagree about the current version, which is the whole of SH-LEGAL-004.';

-- ---------------------------------------------------------------------------
-- 2. The acceptance record -- SH-LEGAL-005
-- ---------------------------------------------------------------------------

create table public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null,
  version text not null,
  surface text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- Closed sets, all three. A document, a surface or a version shape outside
  -- these is refused by the database rather than by the caller's good manners.
  constraint policy_acceptances_document_check
    check (document in ('terms', 'privacy')),
  constraint policy_acceptances_surface_check
    check (surface in ('signup', 'interposition')),
  -- Dated versions, so ordering is readable by a human and by a machine
  -- without a separate scheme to learn.
  constraint policy_acceptances_version_check
    check (version ~ '^\d{4}-\d{2}-\d{2}$'),

  -- One acceptance per account per document per version. A second click, a
  -- double submit or a retried action is the same fact, not a second one.
  constraint policy_acceptances_unique_acceptance
    unique (user_id, document, version)
);

comment on table public.policy_acceptances is
  'SH-LEGAL-005. Who accepted which policy document at which version, and on which surface. Append-only for clients: authenticated may INSERT its own row and SELECT its own rows, never UPDATE or DELETE. The consent gate reads THIS TABLE, never a cookie or client state (SH-LEGAL-011) -- clearing browser state changes nothing about enforcement.';

create index policy_acceptances_user_document_idx
  on public.policy_acceptances (user_id, document, version);

alter table public.policy_acceptances enable row level security;
alter table public.policy_acceptances force row level security;

create policy policy_acceptances_select_own on public.policy_acceptances
  for select to authenticated using ((select auth.uid()) = user_id);

-- INSERT own-row only. No UPDATE policy and no DELETE policy exist at all, so
-- with forced RLS both are refused for every client role -- the append-only
-- posture is the absence of a policy rather than a revoke somebody could undo.
create policy policy_acceptances_insert_own on public.policy_acceptances
  for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.policy_acceptances from public, anon, authenticated;
grant select, insert on public.policy_acceptances to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The version guard -- SH-LEGAL-006, at the boundary that is actually open
-- ---------------------------------------------------------------------------

create or replace function private.enforce_current_policy_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  expected := private.current_policy_version(new.document);

  if expected is null then
    raise exception 'Unknown policy document %', new.document
      using errcode = '22023', detail = 'POLICY_DOCUMENT_UNKNOWN';
  end if;

  if new.version is distinct from expected then
    -- One message for "too old" and "not yet published" alike: the caller does
    -- not need to know which, and a message that distinguished them would tell
    -- a prober what versions exist.
    raise exception 'Policy version % is not the current version for %', new.version, new.document
      using errcode = '22023', detail = 'POLICY_VERSION_NOT_CURRENT';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_current_policy_version()
  from public, anon, authenticated, service_role;

create trigger policy_acceptances_enforce_current_version
before insert on public.policy_acceptances
for each row execute function private.enforce_current_policy_version();

-- ---------------------------------------------------------------------------
-- 4. The write path the app uses -- SH-LEGAL-006/008
-- ---------------------------------------------------------------------------
--
-- It takes **no version parameter**. That is the design, not an omission: a
-- caller that cannot name a version cannot name a wrong one, so the entire
-- class of stale-and-forged-version bugs is absent from the app boundary rather
-- than defended against there. The trigger above still guards the direct
-- INSERT that SH-LEGAL-005 leaves open.
--
-- Idempotent: a retried action, a double submit or a second tab records the
-- same fact once and reports it as already recorded.

create or replace function public.record_policy_acceptance(
  p_document text,
  p_surface text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  expected text;
  inserted_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  expected := private.current_policy_version(p_document);
  if expected is null then
    raise exception 'Unknown policy document %', p_document
      using errcode = '22023', detail = 'POLICY_DOCUMENT_UNKNOWN';
  end if;
  if p_surface is null or p_surface not in ('signup', 'interposition') then
    raise exception 'Unknown acceptance surface'
      using errcode = '22023', detail = 'POLICY_SURFACE_UNKNOWN';
  end if;

  insert into public.policy_acceptances (user_id, document, version, surface)
  values (current_user_id, p_document, expected, p_surface)
  on conflict (user_id, document, version) do nothing
  returning id into inserted_id;

  return jsonb_build_object(
    'document', p_document,
    'version', expected,
    'recorded', inserted_id is not null
  );
end;
$$;

revoke all on function public.record_policy_acceptance(text, text) from public, anon;
grant execute on function public.record_policy_acceptance(text, text) to authenticated;

comment on function public.record_policy_acceptance(text, text) is
  'SH-LEGAL-006/008. Records the CALLER''s acceptance of the CURRENT version of one document. Takes no version parameter -- a caller that cannot name a version cannot name a wrong one. Idempotent.';

-- ---------------------------------------------------------------------------
-- 5. Postconditions -- SH-EXPOSURE-008
-- ---------------------------------------------------------------------------

do $postcondition$
declare
  offender text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'policy_acceptances'
      and class.relrowsecurity
      and class.relforcerowsecurity
  ) then
    raise exception 'policy_acceptances does not force row level security';
  end if;

  -- The append-only posture as a catalog fact: exactly two policies, both of
  -- them read-or-append, and none for UPDATE or DELETE.
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'policy_acceptances'
      and cmd not in ('SELECT', 'INSERT')
  ) then
    raise exception 'policy_acceptances carries a policy that is not select or insert';
  end if;

  for offender in
    select proc.proname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where (namespace.nspname, proc.proname) in (
      ('private', 'current_policy_version'),
      ('private', 'enforce_current_policy_version'),
      ('public', 'record_policy_acceptance')
    )
    and (
      not proc.prosecdef
      or proc.proconfig is null
      or not (proc.proconfig @> array['search_path=""'])
    )
  loop
    raise exception 'function % is not definer-with-empty-search-path', offender;
  end loop;

  if pg_catalog.has_table_privilege('authenticated', 'public.policy_acceptances', 'update')
    or pg_catalog.has_table_privilege('authenticated', 'public.policy_acceptances', 'delete')
    or pg_catalog.has_table_privilege('anon', 'public.policy_acceptances', 'select')
    or pg_catalog.has_table_privilege('anon', 'public.policy_acceptances', 'insert')
  then
    raise exception 'policy_acceptances grants more than select-and-append to a client role';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.record_policy_acceptance(text, text)', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.record_policy_acceptance(text, text)', 'execute')
  then
    raise exception 'record_policy_acceptance is not reachable by exactly the authenticated role';
  end if;

  -- The version function answers for both documents and for nothing else.
  if private.current_policy_version('terms') is null
    or private.current_policy_version('privacy') is null
    or private.current_policy_version('something_else') is not null
  then
    raise exception 'current_policy_version does not answer for exactly the two documents';
  end if;
end;
$postcondition$;
