-- Signup Hardening SH.0 -- the deletion-cascade drill (SH-DELETE-001), executed.
--
-- Gate SH-G0.2, the load-bearing all-implementation pre-code gate: no Signup
-- Hardening slice may design deletion until this file is green in CI, because
-- the census (SIGNUP_HARDENING_FINDINGS.md sec. 3.2) found the `auth.users`
-- cascade has NEVER been executed against a row-complete account, and 43
-- composite `NO ACTION` foreign keys sit in the delete's path. PostgreSQL
-- evaluates NO-ACTION checks and cascade deletes from the same trigger queue,
-- so the delete *should* succeed -- but "should" is exactly what this drill
-- replaces with "did". If the delete blocks, the failure here names the
-- constraint, and that is a valid finding, not a defeat: the remediation is an
-- owner-approved budget amendment, never a silent FK change.
--
-- WHAT "ROW-COMPLETE" MEANS, AND HOW IT STAYS TRUE
-- ---------------------------------------------------------------------------
-- `byok_residue.sql` proved zero residue for an account with rows in five
-- tables. This drill proves it for an account with at least one row in EVERY
-- user-owned table -- enumerated from the catalog at run time, not from a list
-- somebody maintains. Two independent detectors keep it honest:
--
--   1. The populator reports, by table name, every table it failed to insert
--      into ("fail by table name if any table cannot be populated").
--   2. The completeness scan reports, by table name, every runtime-enumerated
--      user-owned table that holds zero rows for the fixture -- so a table
--      added by a later slice that this populator does not know about fails
--      here, by name, without anybody having remembered to add it (T-32).
--
-- Two tables are populated by the system rather than by this file: `profiles`
-- and `agent_preferences` are seeded by the `handle_new_user` trigger on the
-- `auth.users` insert. If that trigger ever stops seeding them, detector 2
-- names them.
--
-- WHAT THIS DOES NOT COVER, SAID HERE RATHER THAN INFERRED
-- ---------------------------------------------------------------------------
-- The `public` schema only, keyed by a `user_id` column only -- the same two
-- limits `byok_residue.sql` declares. Storage objects under `user-files/<uid>/`
-- do NOT cascade (six live orphans from 2026-07-16 prove it); their deletion
-- is SH.2's executor, and their verifier is SH-DELETE-011. "Zero residue" here
-- means zero rows, not zero bytes in storage.
--
-- THE NEGATIVE CONTROL IS THE POINT
-- ---------------------------------------------------------------------------
-- A cascade that reached a second account would satisfy every zero-residue
-- assertion perfectly. So a bystander account is populated through the exact
-- same populator, and after the delete it must still be ROW-COMPLETE -- every
-- one of the enumerated tables still holding its rows -- not merely "have some
-- rows somewhere".
--
-- Written in pure ASCII, following `byok_residue.sql`.

begin;
select plan(20);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Scanner 1 -- residue: tables that still hold rows for a user
-- ---------------------------------------------------------------------------

create function pg_temp.sh_residue(p_user uuid)
returns text
language plpgsql
as $residue$
declare
  scanned record;
  survivors bigint;
  offenders text[] := array[]::text[];
begin
  for scanned in
    select columns.table_name
    from information_schema.columns as columns
    join information_schema.tables as tables
      on tables.table_schema = columns.table_schema
     and tables.table_name = columns.table_name
    where columns.table_schema = 'public'
      and columns.column_name = 'user_id'
      and tables.table_type = 'BASE TABLE'
    order by columns.table_name
  loop
    begin
      execute format('select count(*) from public.%I where user_id = $1', scanned.table_name)
        into survivors
        using p_user;
    exception when others then
      offenders := offenders || (scanned.table_name || '(unscannable)');
      continue;
    end;

    if survivors > 0 then
      offenders := offenders || (scanned.table_name || '(' || survivors || ')');
    end if;
  end loop;

  return array_to_string(offenders, ', ');
end;
$residue$;

-- ---------------------------------------------------------------------------
-- Scanner 2 -- completeness: enumerated tables that hold NO row for a user
-- ---------------------------------------------------------------------------
--
-- The complement of scanner 1, and the detector that makes the fixture
-- row-complete by proof instead of by intention. A user-owned table added
-- after this drill was written lands here by name.

create function pg_temp.sh_missing_rows(p_user uuid)
returns text
language plpgsql
as $missing$
declare
  scanned record;
  present bigint;
  missing text[] := array[]::text[];
begin
  for scanned in
    select columns.table_name
    from information_schema.columns as columns
    join information_schema.tables as tables
      on tables.table_schema = columns.table_schema
     and tables.table_name = columns.table_name
    where columns.table_schema = 'public'
      and columns.column_name = 'user_id'
      and tables.table_type = 'BASE TABLE'
    order by columns.table_name
  loop
    begin
      execute format('select count(*) from public.%I where user_id = $1', scanned.table_name)
        into present
        using p_user;
    exception when others then
      missing := missing || (scanned.table_name || '(unscannable)');
      continue;
    end;

    if present = 0 then
      missing := missing || scanned.table_name;
    end if;
  end loop;

  return array_to_string(missing, ', ');
end;
$missing$;

-- ---------------------------------------------------------------------------
-- The populator -- one row in every insertable user-owned table
-- ---------------------------------------------------------------------------
--
-- Each table gets its own exception arm so a single refusal cannot abort the
-- transaction into pgTAP's useless "Bad plan" -- a failure returns as
-- 'table: <reason>' and the assertion on the report names it. The populator
-- deliberately does NOT insert into `profiles` or `agent_preferences`: the
-- `handle_new_user` trigger owns those, and scanner 2 proves it did its job.
--
-- Trigger interplay, chosen rather than stumbled into:
--   * `entry_entities` rows are all `project`-typed, so
--     `link_interpreted_entities` finds no person-typed sibling and inserts
--     nothing behind our back; `person_projects`/`person_contexts` are
--     populated directly instead.
--   * tasks carry no `due_at` and no `candidate_index`, so neither the
--     due-reminder trigger nor the candidate-confirmation trigger fires;
--     `reminders` and `entry_task_candidate_resolutions` are populated
--     directly.
--   * interpretations carry `pending_questions = '[]'`, so the normalizer
--     inserts nothing; `pending_questions` is populated directly.
--   * `undo_operations.action_type` must be a registered handler
--     (`private.undo_operation_handlers`), so the fixture uses the shipped
--     `correct_entry_interpretation`.

create function pg_temp.sh_populate(
  p_user uuid,
  p_tag text,
  p_ciphertext bytea,
  p_iv bytea
)
returns text
language plpgsql
as $populate$
declare
  v_org uuid := gen_random_uuid();
  v_ctx uuid := gen_random_uuid();
  v_proj uuid := gen_random_uuid();
  v_person uuid := gen_random_uuid();
  v_tag_id uuid := gen_random_uuid();
  v_entry uuid := gen_random_uuid();
  v_interp uuid := gen_random_uuid();
  v_task uuid := gen_random_uuid();
  v_task2 uuid := gen_random_uuid();
  v_conv uuid := gen_random_uuid();
  v_att uuid := gen_random_uuid();
  failures text[] := array[]::text[];
begin
  begin
    insert into public.organizations (id, user_id, name)
    values (v_org, p_user, 'Drill org ' || p_tag);
  exception when others then failures := failures || ('organizations: ' || sqlerrm); end;

  begin
    insert into public.contexts (id, user_id, name)
    values (v_ctx, p_user, 'Drill context ' || p_tag);
  exception when others then failures := failures || ('contexts: ' || sqlerrm); end;

  begin
    insert into public.projects (id, user_id, organization_id, name)
    values (v_proj, p_user, v_org, 'Drill project ' || p_tag);
  exception when others then failures := failures || ('projects: ' || sqlerrm); end;

  begin
    insert into public.people (id, user_id, organization_id, name)
    values (v_person, p_user, v_org, 'Drill person ' || p_tag);
  exception when others then failures := failures || ('people: ' || sqlerrm); end;

  begin
    insert into public.tags (id, user_id, name)
    values (v_tag_id, p_user, 'drill-tag-' || p_tag);
  exception when others then failures := failures || ('tags: ' || sqlerrm); end;

  begin
    insert into public.entries (id, user_id, original_content, source, status, locale)
    values (v_entry, p_user, 'Drill entry for account ' || p_tag, 'web', 'saved', 'pt-BR');
  exception when others then failures := failures || ('entries: ' || sqlerrm); end;

  begin
    insert into public.entry_interpretations (
      id, user_id, entry_id, version, model, strategy_version, prompt_version,
      confidence, raw_output, summary, task_candidates
    ) values (
      v_interp, p_user, v_entry, 1, 'pgtap-drill', 'v1', 'v1',
      0.9, '{}'::jsonb, 'Drill interpretation ' || p_tag,
      '[{"title":"Drill candidate"}]'::jsonb
    );
  exception when others then failures := failures || ('entry_interpretations: ' || sqlerrm); end;

  begin
    insert into public.entry_embeddings (user_id, entry_id, content, embedding, model)
    values (
      p_user, v_entry, 'Drill embedding ' || p_tag,
      ('[' || array_to_string(array_fill(0, array[1536]), ',') || ']')::extensions.vector(1536),
      'pgtap-drill'
    );
  exception when others then failures := failures || ('entry_embeddings: ' || sqlerrm); end;

  begin
    insert into public.entry_entities (
      user_id, entry_id, interpretation_id, entity_type, entity_id, mention, confidence
    ) values (p_user, v_entry, v_interp, 'project', v_proj, 'Drill project ' || p_tag, 0.9);
  exception when others then failures := failures || ('entry_entities: ' || sqlerrm); end;

  begin
    insert into public.pending_questions (
      user_id, entry_id, interpretation_id, candidate_index, question, reason, confidence
    ) values (p_user, v_entry, v_interp, 0, 'Drill question ' || p_tag || '?', 'Drill reason', 0.5);
  exception when others then failures := failures || ('pending_questions: ' || sqlerrm); end;

  begin
    insert into public.entry_task_candidate_resolutions (
      user_id, entry_id, interpretation_id, candidate_index, disposition
    ) values (p_user, v_entry, v_interp, 0, 'dismissed');
  exception when others then failures := failures || ('entry_task_candidate_resolutions: ' || sqlerrm); end;

  begin
    insert into public.tasks (id, user_id, title) values (v_task, p_user, 'Drill task ' || p_tag);
    insert into public.tasks (id, user_id, title) values (v_task2, p_user, 'Drill task 2 ' || p_tag);
  exception when others then failures := failures || ('tasks: ' || sqlerrm); end;

  begin
    insert into public.task_people (task_id, person_id, user_id, role)
    values (v_task, v_person, p_user, 'involved');
  exception when others then failures := failures || ('task_people: ' || sqlerrm); end;

  begin
    insert into public.task_projects (task_id, project_id, user_id)
    values (v_task, v_proj, p_user);
  exception when others then failures := failures || ('task_projects: ' || sqlerrm); end;

  begin
    insert into public.task_contexts (task_id, context_id, user_id)
    values (v_task, v_ctx, p_user);
  exception when others then failures := failures || ('task_contexts: ' || sqlerrm); end;

  begin
    insert into public.task_dependencies (user_id, task_id, depends_on_task_id)
    values (p_user, v_task, v_task2);
  exception when others then failures := failures || ('task_dependencies: ' || sqlerrm); end;

  begin
    insert into public.reminders (user_id, task_id, title, remind_at)
    values (p_user, v_task, 'Drill reminder ' || p_tag, now() + interval '1 hour');
  exception when others then failures := failures || ('reminders: ' || sqlerrm); end;

  begin
    insert into public.notifications (user_id, type, title, body)
    values (p_user, 'heartbeat', 'Drill notification ' || p_tag, 'Drill body');
  exception when others then failures := failures || ('notifications: ' || sqlerrm); end;

  begin
    insert into public.heartbeat_runs (user_id, status, completed_at)
    values (p_user, 'completed', now());
  exception when others then failures := failures || ('heartbeat_runs: ' || sqlerrm); end;

  begin
    insert into public.summaries (
      user_id, period_type, period_start, period_end, title, content, original_content
    ) values (
      p_user, 'daily', current_date, current_date,
      'Drill summary ' || p_tag, 'Drill content', 'Drill content'
    );
  exception when others then failures := failures || ('summaries: ' || sqlerrm); end;

  begin
    insert into public.conversations (id, user_id, title)
    values (v_conv, p_user, 'Drill conversation ' || p_tag);
  exception when others then failures := failures || ('conversations: ' || sqlerrm); end;

  begin
    insert into public.conversation_messages (user_id, conversation_id, role, content)
    values (p_user, v_conv, 'user', 'Drill message ' || p_tag);
  exception when others then failures := failures || ('conversation_messages: ' || sqlerrm); end;

  begin
    insert into public.memories (user_id, content)
    values (p_user, 'Drill memory ' || p_tag);
  exception when others then failures := failures || ('memories: ' || sqlerrm); end;

  begin
    insert into public.attachments (
      id, user_id, storage_path, original_name, mime_type, size_bytes
    ) values (
      v_att, p_user, p_user::text || '/drill-' || p_tag || '.pdf',
      'drill.pdf', 'application/pdf', 1024
    );
  exception when others then failures := failures || ('attachments: ' || sqlerrm); end;

  begin
    insert into public.attachment_interpretations (
      user_id, attachment_id, description, model, raw_output
    ) values (p_user, v_att, 'Drill attachment interpretation', 'pgtap-drill', '{}'::jsonb);
  exception when others then failures := failures || ('attachment_interpretations: ' || sqlerrm); end;

  begin
    insert into public.entity_attachments (user_id, attachment_id, entity_type, entity_id)
    values (p_user, v_att, 'task', v_task);
  exception when others then failures := failures || ('entity_attachments: ' || sqlerrm); end;

  begin
    insert into public.entity_tags (user_id, tag_id, entity_type, entity_id)
    values (p_user, v_tag_id, 'project', v_proj);
  exception when others then failures := failures || ('entity_tags: ' || sqlerrm); end;

  begin
    insert into public.entity_aliases (
      user_id, entity_type, entity_id, alias, normalized_alias
    ) values (p_user, 'project', v_proj, 'Drill ' || p_tag, 'drill ' || lower(p_tag));
  exception when others then failures := failures || ('entity_aliases: ' || sqlerrm); end;

  begin
    insert into public.person_relationships (user_id, person_id, relationship_type)
    values (p_user, v_person, 'colleague');
  exception when others then failures := failures || ('person_relationships: ' || sqlerrm); end;

  begin
    insert into public.person_contexts (user_id, person_id, context_id)
    values (p_user, v_person, v_ctx);
  exception when others then failures := failures || ('person_contexts: ' || sqlerrm); end;

  begin
    insert into public.person_projects (user_id, person_id, project_id)
    values (p_user, v_person, v_proj);
  exception when others then failures := failures || ('person_projects: ' || sqlerrm); end;

  -- SH.4. The version is NOT written literally here: the row must satisfy
  -- `private.enforce_current_policy_version`, and a literal would make the
  -- drill fail on the next policy bump for a reason that has nothing to do
  -- with cascading. Reading the current version is what keeps this arm honest.
  begin
    insert into public.policy_acceptances (user_id, document, version, surface)
    values (p_user, 'terms', private.current_policy_version('terms'), 'interposition');
  exception when others then failures := failures || ('policy_acceptances: ' || sqlerrm); end;

  begin
    insert into public.jobs (user_id, type, payload, idempotency_key)
    values (
      p_user, 'interpret_entry',
      jsonb_build_object('entry_id', v_entry, 'mode', 'initial'),
      'sh0-drill-' || p_tag
    );
  exception when others then failures := failures || ('jobs: ' || sqlerrm); end;

  begin
    insert into public.user_ai_credentials (
      user_id, status, ciphertext, iv, key_version, fingerprint, validated_at
    ) values (p_user, 'active', p_ciphertext, p_iv, 1, 'sk-proj:aaaaaa', now());
  exception when others then failures := failures || ('user_ai_credentials: ' || sqlerrm); end;

  begin
    insert into public.credential_validation_attempts (user_id, outcome, ip_hash)
    values (p_user, 'succeeded', repeat('a', 64));
  exception when others then failures := failures || ('credential_validation_attempts: ' || sqlerrm); end;

  begin
    insert into public.ai_usage_events (
      user_id, operation, model, input_tokens, output_tokens, cost_status, cost_usd
    ) values (p_user, 'chat', 'pgtap-drill', 1, 1, 'unpriced', null);
  exception when others then failures := failures || ('ai_usage_events: ' || sqlerrm); end;

  begin
    insert into public.audit_logs (
      user_id, action_type, entity_type, entity_id, actor, after_state, reason
    ) values (
      p_user, 'create_organization', 'organization', v_org, 'user',
      '{"name":"Drill org"}'::jsonb, 'Cascade drill fixture'
    );
  exception when others then failures := failures || ('audit_logs: ' || sqlerrm); end;

  begin
    insert into public.undo_operations (
      user_id, action_type, entity_type, entity_ids, after_state
    ) values (
      p_user, 'correct_entry_interpretation', 'entry_interpretation',
      array[]::uuid[], '{}'::jsonb
    );
  exception when others then failures := failures || ('undo_operations: ' || sqlerrm); end;

  begin
    insert into public.product_events (
      user_id, event_name, surface, locale, viewport_class, app_version,
      properties, idempotency_key
    ) values (
      p_user, 'work_view_viewed', 'work', 'en', 'desktop', 'sh0-drill',
      '{}'::jsonb, gen_random_uuid()
    );
  exception when others then failures := failures || ('product_events: ' || sqlerrm); end;

  begin
    insert into public.task_command_confirmations (
      user_id, task_id, action, operation_key, request_fingerprint, status
    ) values (
      p_user, v_task, 'cancel_task', 'sh0-drill-' || p_tag, repeat('0', 64), 'issued'
    );
  exception when others then failures := failures || ('task_command_confirmations: ' || sqlerrm); end;

  -- 2H.1's recovery row. Inserted DIRECTLY rather than by transitioning the
  -- account to `deleting`, because the transition would block every insert
  -- above it through the SH.1 predicates and the drill's whole subject is a
  -- row-complete account. The row this creates is the one an account carries
  -- while its deletion is being retried, and what the drill proves about it is
  -- the only thing that matters here: it cascades with `auth.users` and takes
  -- nothing of the bystander's with it.
  begin
    insert into public.account_deletion_attempts (user_id) values (p_user);
  exception when others then failures := failures || ('account_deletion_attempts: ' || sqlerrm); end;

  -- 2H.2's error sink. Inserted directly rather than through
  -- `record_error_event`, because that function attributes the row to
  -- `auth.uid()` and this populator runs without a session -- the row would
  -- land unowned and the drill would then report the table as empty for an
  -- account that is supposed to be row-complete.
  begin
    insert into public.error_events (surface, operation, reason, correlation_id, user_id)
    values ('server_action', 'capture_entry', 'provider_error', gen_random_uuid(), p_user);
  exception when others then failures := failures || ('error_events: ' || sqlerrm); end;

  -- 2H.3's limiter state. Inserted directly rather than through
  -- `consume_rate_limit_slot`, because that function is the admission decision
  -- and calling it here would make the fixture depend on the ceiling rather
  -- than on the row existing. What the drill needs is one owned row, so the
  -- cascade has something to take.
  begin
    insert into public.rate_limit_events (user_id, bucket, outcome)
    values (p_user, 'ai', 'admitted');
  exception when others then failures := failures || ('rate_limit_events: ' || sqlerrm); end;

  return array_to_string(failures, ' | ');
end;
$populate$;

-- ---------------------------------------------------------------------------
-- Fixtures -- two accounts, populated by the same populator
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('5d000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'sh0-drill-doomed@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('5d000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'sh0-drill-bystander@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- ---------------------------------------------------------------------------
-- Section 1 -- population and completeness calibration (9)
-- ---------------------------------------------------------------------------

select is(
  pg_temp.sh_populate(
    '5d000001-0000-4000-8000-000000000001', 'doomed',
    '\xdd01020304050607080910111213141516'::bytea,
    '\xdd0102030405060708091011'::bytea
  ),
  '',
  'every insertable user-owned table accepts a fixture row for the doomed account -- failures name the table'
);

select is(
  pg_temp.sh_populate(
    '5d000002-0000-4000-8000-000000000002', 'bystander',
    '\xee01020304050607080910111213141516'::bytea,
    '\xee0102030405060708091011'::bytea
  ),
  '',
  'every insertable user-owned table accepts a fixture row for the bystander account -- failures name the table'
);

-- The census counted 41 user-owned tables at head 202608010069. The floor, not
-- an exact pin: a later slice adding a table must join the drill (the
-- completeness scan below forces that), not update this number first.
select cmp_ok(
  (
    select count(*)::int
    from information_schema.columns as columns
    join information_schema.tables as tables
      on tables.table_schema = columns.table_schema
     and tables.table_name = columns.table_name
    where columns.table_schema = 'public'
      and columns.column_name = 'user_id'
      and tables.table_type = 'BASE TABLE'
  ),
  '>=',
  41,
  'the runtime enumeration covers at least the 41 user-owned tables the census recorded'
);

select is(
  pg_temp.sh_missing_rows('5d000001-0000-4000-8000-000000000001'),
  '',
  'ROW-COMPLETE: every runtime-enumerated user-owned table holds a row for the doomed account -- a table added later fails here by name'
);

select is(
  pg_temp.sh_missing_rows('5d000002-0000-4000-8000-000000000002'),
  '',
  'the bystander account is row-complete through the same populator'
);

select isnt(
  pg_temp.sh_residue('5d000001-0000-4000-8000-000000000001'),
  '',
  'the residue scanner finds rows for a live account, so its silence later means something'
);

-- Three named reaches: the trigger-seeded table, a composite-FK carrier, and
-- the credential store -- so a scanner defect cannot hide behind the report.
select ok(
  pg_temp.sh_residue('5d000001-0000-4000-8000-000000000001') like '%profiles%',
  'the handle_new_user trigger seeded profiles (and the scanner reaches it)'
);
select ok(
  pg_temp.sh_residue('5d000001-0000-4000-8000-000000000001') like '%entry_task_candidate_resolutions%',
  'the scanner reaches a table held by composite NO ACTION foreign keys'
);
select ok(
  pg_temp.sh_residue('5d000001-0000-4000-8000-000000000001') like '%user_ai_credentials%',
  'the scanner reaches the credential store'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the delete (2)
-- ---------------------------------------------------------------------------
--
-- THE assertion of the drill. 43 composite NO ACTION foreign keys sit in this
-- statement's path; if any of them blocks a bulk cascade, this is where the
-- initiative finds out -- as a named constraint in CI, not as a support
-- ticket after a real deletion.

select lives_ok(
  $$ delete from auth.users where id = '5d000001-0000-4000-8000-000000000001' $$,
  'deleting a ROW-COMPLETE account is not blocked by any owned row or composite foreign key'
);

select is(
  (select count(*)::int from auth.users where id = '5d000001-0000-4000-8000-000000000001'),
  0,
  'the account itself is gone'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- zero survivors, anywhere (5)
-- ---------------------------------------------------------------------------

select is(
  pg_temp.sh_residue('5d000001-0000-4000-8000-000000000001'),
  '',
  'SH-DELETE-001: zero surviving rows across every runtime-enumerated user-owned table'
);

select is(
  (select count(*)::int from public.profiles
   where user_id = '5d000001-0000-4000-8000-000000000001'),
  0,
  'the trigger-seeded profile is gone'
);
select is(
  (select count(*)::int from public.entry_task_candidate_resolutions
   where user_id = '5d000001-0000-4000-8000-000000000001'),
  0,
  'the composite-FK resolution row is gone'
);
select is(
  (select count(*)::int from public.jobs
   where user_id = '5d000001-0000-4000-8000-000000000001'),
  0,
  'no queued job survives to be claimed for an account that is gone'
);

-- Bytes, not rows: a row that survived with its material moved would still be
-- residue, and a column scan for the exact fixture bytes catches a copy.
select is(
  (
    select count(*)::int from public.user_ai_credentials
    where ciphertext = '\xdd01020304050607080910111213141516'::bytea
       or iv = '\xdd0102030405060708091011'::bytea
  ),
  0,
  'the deleted account''s ciphertext and IV exist nowhere in the credential table'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- the negative control (4)
-- ---------------------------------------------------------------------------
--
-- Not "the bystander still has rows" -- the bystander is still ROW-COMPLETE:
-- every enumerated table still holds its rows after the neighbouring cascade.

select is(
  pg_temp.sh_missing_rows('5d000002-0000-4000-8000-000000000002'),
  '',
  'the bystander account is still row-complete in every enumerated table -- the cascade was scoped'
);

select is(
  (select count(*)::int from auth.users where id = '5d000002-0000-4000-8000-000000000002'),
  1,
  'the bystander account itself survives'
);

select is(
  (
    select encode(ciphertext, 'hex') from public.user_ai_credentials
    where user_id = '5d000002-0000-4000-8000-000000000002'
  ),
  'ee01020304050607080910111213141516',
  'the bystander''s ciphertext is byte-for-byte what it was'
);

select is(
  (
    select original_content from public.entries
    where user_id = '5d000002-0000-4000-8000-000000000002'
  ),
  'Drill entry for account bystander',
  'the bystander''s entry content is untouched'
);

select * from finish();
rollback;
