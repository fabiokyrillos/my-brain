-- BYOK Slice BYOK.4, migration 1 of 2 — the awaiting-AI-configuration lifecycle.
--
-- `BYOK-SCHEMA-008`, `BYOK-CAPTURE-001`/`002`/`003`.
--
-- WHAT THIS FILE IS FOR
-- ---------------------------------------------------------------------------
-- Until now, capture had one shape: write the entry, enqueue the job, return.
-- With per-user credentials that shape has a hole in it. A user who has not
-- configured a key would get an entry marked `saved`, a job that can never
-- succeed, and an Inbox that says "organizing" about work nobody is doing. The
-- honest answer is a **state**, not an error and not a refusal:
--
--   * the entry is stored, because the user typed it and losing their words to
--     a configuration gap is the one outcome that is never acceptable
--     (`BYOK-CAPTURE-001`, `BYOK-DEC-5`);
--   * no job is enqueued, because there is nothing that could run it
--     (`BYOK-CAPTURE-003`);
--   * the status says exactly that, so every surface can render it and offer the
--     one action that helps (`BYOK-CAPTURE-002`).
--
-- WHY THE CONSTRAINT IS REPLACED RATHER THAN ALTERED
-- ---------------------------------------------------------------------------
-- PostgreSQL has no `alter constraint … check`, so a CHECK gains a member by
-- being dropped and re-added. That is the precedent `202607170020:3-11` set for
-- this exact column, and following it keeps the two migrations comparable.
--
-- WHY A CAPTURE IDEMPOTENCY COLUMN APPEARS HERE
-- ---------------------------------------------------------------------------
-- This is the part of the change that is easy to miss, and it is not scope
-- creep — it is the hole the rest of the migration would otherwise open.
--
-- `capture_entry_async` has always been idempotent, and the mechanism was the
-- **job row**: the idempotency key lived in `jobs.idempotency_key`, and a replay
-- found the existing job and returned its entry. Remove the job — which is
-- precisely what `BYOK-CAPTURE-003` requires — and the replay has nothing to
-- find, so a double-submitted capture from a user with no key would write the
-- entry twice.
--
-- So the key moves onto the entry, where it is true in both branches. The
-- partial unique index enforces it at the database rather than inside the
-- function, because a `select`-then-`insert` inside one transaction is a race
-- the advisory lock narrows but does not close for two different keys landing on
-- the same row. Existing rows keep `null` and are excluded from the index.
--
-- WHY THE CHECK IS `not exists (… status = 'active')` RATHER THAN A JOIN
-- ---------------------------------------------------------------------------
-- `BYOK-RESOLVER-005`'s reading, applied here: `invalid`, `removed` and absent
-- are one outcome. A user whose key was rejected is in exactly the same product
-- state as a user who never configured one, and writing the predicate as
-- "an active row exists" rather than "a row exists" is what makes those two
-- collapse without a second branch to keep in step.

-- ---------------------------------------------------------------------------
-- 1. The status literal.
-- ---------------------------------------------------------------------------

alter table public.entries drop constraint if exists entries_status_check;
alter table public.entries add constraint entries_status_check check (status in (
  'saved',
  'interpreting',
  'awaiting_review',
  'partially_processed',
  'completed',
  'recoverable_error',
  'terminal_error',
  'reprocessing',
  -- BYOK-SCHEMA-008. The entry is stored and nothing is running for it,
  -- because the account has no usable AI credential.
  'awaiting_ai_configuration'
));

-- ---------------------------------------------------------------------------
-- 2. Capture idempotency, on the entry.
-- ---------------------------------------------------------------------------

alter table public.entries
  add column if not exists capture_idempotency_key text;

comment on column public.entries.capture_idempotency_key is
  'The capture idempotency key, when this entry was created by capture_entry_async. Nullable: rows created before BYOK.4 and rows created by any other path carry null. Uniqueness is per user and enforced by entries_capture_idempotency_key_idx.';

create unique index if not exists entries_capture_idempotency_key_idx
  on public.entries (user_id, capture_idempotency_key)
  where capture_idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- 3. `capture_entry_async`, credential-aware.
-- ---------------------------------------------------------------------------
--
-- Same signature, same grants, same advisory lock, same validation, same return
-- shape. Two things are new: the replay path looks at the entry as well as the
-- job, and the job insert is conditional. Everything is still one transaction,
-- so the `BYOK-CAPTURE-003` atomicity guarantee is the one the function already
-- had rather than a new promise.

create or replace function public.capture_entry_async(
  p_original_content text,
  p_locale text,
  p_source text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_content text := btrim(coalesce(p_original_content, ''));
  normalized_key text := btrim(coalesce(p_idempotency_key, ''));
  job_key text;
  existing_job public.jobs%rowtype;
  existing_entry public.entries%rowtype;
  created_entry public.entries%rowtype;
  has_active_credential boolean;
  entry_status text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if char_length(normalized_content) not between 1 and 12000 then
    raise exception 'Invalid entry content' using errcode = '22023';
  end if;
  if p_locale is null or p_locale not in ('pt-BR', 'en') then
    raise exception 'Invalid entry locale' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('web', 'chat', 'whatsapp', 'gmail', 'calendar', 'import', 'api') then
    raise exception 'Invalid entry source' using errcode = '22023';
  end if;
  if char_length(normalized_key) not between 8 and 200 then
    raise exception 'Invalid capture idempotency key' using errcode = '22023';
  end if;

  job_key := 'entry-capture:' || normalized_key;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':' || job_key, 0)
  );

  select * into existing_job
  from public.jobs
  where user_id = current_user_id and idempotency_key = job_key;

  if existing_job.id is not null then
    if existing_job.type <> 'interpret_entry'
      or not private.is_valid_entry_interpretation_job_payload(existing_job.payload)
      or existing_job.payload ->> 'mode' <> 'initial'
    then
      raise exception 'Capture idempotency key conflicts with another operation' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'entry_id', existing_job.payload ->> 'entry_id',
      'status', 'saved',
      'replayed', true
    );
  end if;

  -- The second replay path, and the reason the column above exists. A capture
  -- that stored an entry without a job leaves no `jobs` row to recognise, so the
  -- entry is what carries the key.
  select * into existing_entry
  from public.entries
  where user_id = current_user_id and capture_idempotency_key = normalized_key;

  if existing_entry.id is not null then
    return jsonb_build_object(
      'entry_id', existing_entry.id,
      'status', 'saved',
      'replayed', true
    );
  end if;

  -- BYOK-CAPTURE-003. Read once, inside the transaction, and decide both the
  -- status and the job from the same answer -- so a key that is removed between
  -- the two would have to break this transaction's isolation to produce an
  -- entry that claims to be processing with no job behind it.
  select exists (
    select 1
    from public.user_ai_credentials as credential
    where credential.user_id = current_user_id
      and credential.status = 'active'
  ) into has_active_credential;

  entry_status := case when has_active_credential then 'saved' else 'awaiting_ai_configuration' end;

  insert into public.entries (
    user_id,
    original_content,
    source,
    status,
    locale,
    capture_idempotency_key
  ) values (
    current_user_id,
    normalized_content,
    p_source,
    entry_status,
    p_locale,
    normalized_key
  ) returning * into created_entry;

  if has_active_credential then
    insert into public.jobs (
      user_id,
      type,
      payload,
      idempotency_key
    ) values (
      current_user_id,
      'interpret_entry',
      jsonb_build_object(
        'entry_id', created_entry.id,
        'mode', 'initial'
      ),
      job_key
    );
  end if;

  -- The audit row is written in both branches, because "the entry was captured
  -- and nothing was queued" is exactly the kind of automatic decision
  -- ENGINEERING_STANDARDS requires to be auditable. Only the action type and the
  -- reason differ.
  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    case when has_active_credential
      then 'entry_processing_enqueued'
      else 'entry_awaiting_ai_configuration'
    end,
    'entry',
    created_entry.id,
    'user',
    jsonb_build_object('mode', 'initial', 'enqueued', has_active_credential),
    case when has_active_credential
      then 'Entry capture persisted and interpretation queued'
      else 'Entry capture persisted; no interpretation queued because the account has no active AI credential'
    end,
    created_entry.id
  );

  return jsonb_build_object(
    'entry_id', created_entry.id,
    'status', 'saved',
    'replayed', false
  );
end;
$$;

comment on function public.capture_entry_async(text, text, text, text) is
  'Persists one captured entry and, when the caller has an ACTIVE AI credential, its interpret_entry job -- atomically. With no active credential the entry is stored in awaiting_ai_configuration and no job is created (BYOK-CAPTURE-001/002/003).';

-- ---------------------------------------------------------------------------
-- 4. Returning an entry to the awaiting state, from the worker.
-- ---------------------------------------------------------------------------
--
-- The other half of `BYOK-CAPTURE-002`. An entry can also reach the awaiting
-- state *after* being queued: enqueued while the account had a key, run after it
-- was removed. `fail_entry_interpretation` would mark that entry an error and
-- offer the user a retry, which is a retry that cannot succeed and which hides
-- the one action that can.
--
-- Deliberately narrow. It sets one column, only when the entry is not already
-- finished, and it is granted to `service_role` alone -- there is no user-facing
-- verb here, because a user cannot put their own entry into this state on
-- purpose and a surface offering it would only be a way to lose an
-- interpretation.

create or replace function public.mark_entry_awaiting_ai_configuration(
  p_entry_id uuid,
  p_service_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_entry public.entries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_entry_id is null or p_service_user_id is null then
    raise exception 'Entry and owner are required' using errcode = '22023';
  end if;

  -- Both, always. The row id alone is not proof of ownership, and the worker is
  -- the one caller that can name a row it does not own.
  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = p_service_user_id
  for update;

  if owned_entry.id is null then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;

  -- An entry that already carries an interpretation is not awaiting anything:
  -- a later credential failure on a *reprocessing* job must not erase the
  -- understanding the user already has.
  if owned_entry.current_interpretation_id is not null
    or owned_entry.status in ('completed', 'awaiting_review', 'partially_processed')
  then
    return false;
  end if;

  -- `updated_at` is not set here: `entries_updated_at` is a BEFORE UPDATE
  -- trigger (`202607160003:179`) and setting the column by hand would be
  -- overwritten by it anyway.
  update public.entries
  set status = 'awaiting_ai_configuration',
      reprocessing_key = null,
      reprocessing_started_at = null,
      reprocessing_lease_expires_at = null
  where id = owned_entry.id;

  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    before_state,
    after_state,
    reason,
    source_entry_id
  ) values (
    p_service_user_id,
    'entry_awaiting_ai_configuration',
    'entry',
    owned_entry.id,
    'system',
    jsonb_build_object('status', owned_entry.status),
    jsonb_build_object('status', 'awaiting_ai_configuration'),
    'Interpretation could not run because the account has no usable AI credential',
    owned_entry.id
  );

  return true;
end;
$$;

comment on function public.mark_entry_awaiting_ai_configuration(uuid, uuid) is
  'Returns an entry to awaiting_ai_configuration after a credential-configuration job failure. service_role only; ownership proven by (id, user_id); refuses to overwrite an entry that already has an interpretation.';

revoke all on function public.mark_entry_awaiting_ai_configuration(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_entry_awaiting_ai_configuration(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Post-deploy assertions.
-- ---------------------------------------------------------------------------
--
-- The `202607300063` / `202608010066` shape: the posture this file claims is
-- read back out of the catalog at apply time, so a migration that applied but
-- produced the wrong constraint, the wrong index or the wrong privileges fails
-- here rather than in production.

do $byok_awaiting_postcondition$
declare
  offending text;
  missing_literal text;
begin
  -- The literal is admitted, and the eight that were already there survive.
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'entries_status_check'
      and conrelid = 'public.entries'::regclass
      and pg_catalog.pg_get_constraintdef(oid) like '%awaiting_ai_configuration%'
  ) then
    raise exception 'entries_status_check does not admit awaiting_ai_configuration'
      using errcode = 'P0001', detail = 'BYOK_ENTRY_STATUS';
  end if;

  for missing_literal in
    select unnest(array[
      'saved', 'interpreting', 'awaiting_review', 'partially_processed',
      'completed', 'recoverable_error', 'terminal_error', 'reprocessing'
    ])
  loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint
      where conname = 'entries_status_check'
        and conrelid = 'public.entries'::regclass
        and pg_catalog.pg_get_constraintdef(oid) like '%''' || missing_literal || '''%'
    ) then
      raise exception 'entries_status_check lost the % literal', missing_literal
        using errcode = 'P0001', detail = 'BYOK_ENTRY_STATUS';
    end if;
  end loop;

  -- The index must be unique, partial, and scoped by user -- a global unique
  -- index on the key alone would let one user's capture collide with another's.
  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'entries'
      and indexname = 'entries_capture_idempotency_key_idx'
      and indexdef like 'CREATE UNIQUE INDEX%'
      and indexdef like '%user_id%'
      and indexdef like '%WHERE%'
  ) then
    raise exception 'entries_capture_idempotency_key_idx is missing or not a partial unique index on (user_id, key)'
      using errcode = 'P0001', detail = 'BYOK_CAPTURE_IDEMPOTENCY';
  end if;

  if (select prosecdef from pg_catalog.pg_proc
        where oid = 'public.mark_entry_awaiting_ai_configuration(uuid, uuid)'::regprocedure) is distinct from true
  then
    raise exception 'mark_entry_awaiting_ai_configuration must be SECURITY DEFINER'
      using errcode = 'P0001', detail = 'BYOK_AWAITING_SECURITY';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join pg_catalog.unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
    where procedure.oid = 'public.mark_entry_awaiting_ai_configuration(uuid, uuid)'::regprocedure
      and pg_catalog.lower(setting.value) in ('search_path=', 'search_path=""')
  ) then
    raise exception 'mark_entry_awaiting_ai_configuration must pin an empty search_path'
      using errcode = 'P0001', detail = 'BYOK_AWAITING_SECURITY';
  end if;

  select coalesce(string_agg(found.label, ', ' order by found.label), '')
  into offending
  from (
    select role_name || ' can execute mark_entry_awaiting_ai_configuration' as label
    from unnest(array['anon', 'authenticated']) as role_name
    where pg_catalog.has_function_privilege(
      role_name, 'public.mark_entry_awaiting_ai_configuration(uuid, uuid)', 'execute'
    )
  ) as found;

  if offending <> '' then
    raise exception 'mark_entry_awaiting_ai_configuration is reachable by a role it must not be: %', offending
      using errcode = 'P0001', detail = 'BYOK_AWAITING_GRANT';
  end if;

  -- The positive control, so a revoke-everything migration also fails.
  if not pg_catalog.has_function_privilege(
    'service_role', 'public.mark_entry_awaiting_ai_configuration(uuid, uuid)', 'execute'
  ) then
    raise exception 'mark_entry_awaiting_ai_configuration is unreachable by service_role'
      using errcode = 'P0001', detail = 'BYOK_AWAITING_MISSING_GRANT';
  end if;

  -- capture_entry_async kept its signature and its grant posture. A replacement
  -- that dropped the `authenticated` grant would leave capture broken for every
  -- user, and it would do it silently.
  if not pg_catalog.has_function_privilege(
    'authenticated', 'public.capture_entry_async(text, text, text, text)', 'execute'
  ) then
    raise exception 'capture_entry_async is unreachable by authenticated'
      using errcode = 'P0001', detail = 'BYOK_CAPTURE_GRANT';
  end if;

  if pg_catalog.has_function_privilege(
    'anon', 'public.capture_entry_async(text, text, text, text)', 'execute'
  ) then
    raise exception 'capture_entry_async is reachable by anon'
      using errcode = 'P0001', detail = 'BYOK_CAPTURE_GRANT';
  end if;
end;
$byok_awaiting_postcondition$;
