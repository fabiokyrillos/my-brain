-- Life Brain LB-M1 (slice C.1, ADR-148): life areas are contexts.
--
-- Pins the widened `contexts.kind` vocabulary, the one-context-per-area index,
-- the area link the worker writes, the area's default sensitivity, the owner's
-- override of it, and the boundaries around all three: service role only for
-- the worker's RPC, owner only for the override, no cross-user reach, and
-- idempotence when the same interpretation is linked twice.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Structure -------------------------------------------------------------------

select has_function('private', 'ensure_life_area_context', array['uuid', 'text', 'text']);
select has_function('public', 'link_entry_life_area', array['uuid', 'text', 'numeric', 'text', 'uuid']);
select has_function('public', 'set_entry_sensitivity', array['uuid', 'text']);
select has_index('public', 'contexts', 'contexts_user_life_area_idx', 'one context per life area per user');

select ok(
  (select prosecdef from pg_proc where oid = 'public.link_entry_life_area(uuid,text,numeric,text,uuid)'::regprocedure),
  'the area link runs as definer'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.link_entry_life_area(uuid,text,numeric,text,uuid)'::regprocedure),
  'the area link pins an empty search_path'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.set_entry_sensitivity(uuid,text)'::regprocedure),
  'the sensitivity override pins an empty search_path'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'private.ensure_life_area_context(uuid,text,text)'::regprocedure),
  'the area resolver pins an empty search_path'
);
select ok(
  not has_function_privilege('authenticated', 'public.link_entry_life_area(uuid,text,numeric,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.link_entry_life_area(uuid,text,numeric,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.link_entry_life_area(uuid,text,numeric,text,uuid)', 'execute'),
  'only the service role may link an area'
);
select ok(
  has_function_privilege('authenticated', 'public.set_entry_sensitivity(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.set_entry_sensitivity(uuid,text)', 'execute'),
  'an authenticated owner may set a sensitivity; anon may not'
);
select ok(
  not has_function_privilege('authenticated', 'private.ensure_life_area_context(uuid,text,text)', 'execute')
  and not has_function_privilege('service_role', 'private.ensure_life_area_context(uuid,text,text)', 'execute'),
  'the area resolver is reachable only through the link'
);

-- Fixtures ----------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'area-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'area-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (id, user_id, original_content, source, status, locale) values
  ('e1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'Fui no cardiologista hoje.', 'web', 'completed', 'pt-BR'),
  ('e2222222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111', 'Comprei passagem para Lisboa.', 'web', 'completed', 'pt-BR'),
  ('e3333333-3333-4333-8333-333333333333', 'a2222222-2222-4222-8222-222222222222', 'Paguei a conta de luz.', 'web', 'completed', 'pt-BR');

insert into public.entry_interpretations (
  id, user_id, entry_id, version, model, strategy_version, prompt_version, confidence, raw_output, summary
) values
  ('f1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111', 1, 'pgtap-test', 'v1', 'v1', 0.9, '{}'::jsonb, 'Consulta'),
  ('f2222222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222', 1, 'pgtap-test', 'v1', 'v1', 0.9, '{}'::jsonb, 'Viagem'),
  ('f3333333-3333-4333-8333-333333333333', 'a2222222-2222-4222-8222-222222222222', 'e3333333-3333-4333-8333-333333333333', 1, 'pgtap-test', 'v1', 'v1', 0.9, '{}'::jsonb, 'Conta');

update public.entries set current_interpretation_id = 'f1111111-1111-4111-8111-111111111111' where id = 'e1111111-1111-4111-8111-111111111111';
update public.entries set current_interpretation_id = 'f2222222-2222-4222-8222-222222222222' where id = 'e2222222-2222-4222-8222-222222222222';
update public.entries set current_interpretation_id = 'f3333333-3333-4333-8333-333333333333' where id = 'e3333333-3333-4333-8333-333333333333';

-- The vocabulary ------------------------------------------------------------------

select lives_ok(
  $$ insert into public.contexts (user_id, name, kind) values ('a2222222-2222-4222-8222-222222222222', 'Casa', 'home') $$,
  'the widened vocabulary admits a life area'
);
select throws_ok(
  $$ insert into public.contexts (user_id, name, kind) values ('a2222222-2222-4222-8222-222222222222', 'Bichos', 'pets') $$,
  '23514',
  null,
  'a kind outside the closed vocabulary is refused'
);
select throws_ok(
  $$ insert into public.contexts (user_id, name, kind) values ('a2222222-2222-4222-8222-222222222222', 'Lar', 'home') $$,
  '23505',
  null,
  'a second context of the same area is refused'
);
select lives_ok(
  $$ insert into public.contexts (user_id, name, kind) values
       ('a2222222-2222-4222-8222-222222222222', 'Trabalho A', 'work'),
       ('a2222222-2222-4222-8222-222222222222', 'Trabalho B', 'work') $$,
  'work and personal keep allowing several contexts, as they always did'
);

-- The worker's link ------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select public.link_entry_life_area('e1111111-1111-4111-8111-111111111111', 'health', 0.9, 'pt-BR', 'a1111111-1111-4111-8111-111111111111') $$,
  '42501',
  null,
  'an authenticated caller cannot link an area, even on its own entry'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (public.link_entry_life_area('e1111111-1111-4111-8111-111111111111', 'health', 0.9, 'pt-BR', 'a1111111-1111-4111-8111-111111111111') ->> 'linked')::boolean,
  true,
  'a confident health reading links the entry'
);
select is(
  (select name || ':' || kind from public.contexts where user_id = 'a1111111-1111-4111-8111-111111111111' and kind = 'health'),
  'Saúde:health',
  'the area is created on demand with its localized name'
);
select is(
  (select count(*)::int from public.entry_entities
   where entry_id = 'e1111111-1111-4111-8111-111111111111' and entity_type = 'context'
     and interpretation_id = 'f1111111-1111-4111-8111-111111111111'),
  1,
  'the link is on the entry''s current interpretation'
);
select is(
  (select sensitivity from public.entries where id = 'e1111111-1111-4111-8111-111111111111'),
  'private',
  'a health entry defaults to private'
);

select is(
  (public.link_entry_life_area('e1111111-1111-4111-8111-111111111111', 'health', 0.9, 'pt-BR', 'a1111111-1111-4111-8111-111111111111') ->> 'linked')::boolean,
  true,
  'linking the same interpretation again is a no-op that still answers'
);
select is(
  (select count(*)::int from public.entry_entities where entry_id = 'e1111111-1111-4111-8111-111111111111' and entity_type = 'context')
  || ':' ||
  (select count(*)::int from public.contexts where user_id = 'a1111111-1111-4111-8111-111111111111' and kind = 'health'),
  '1:1',
  'idempotent: one link and one area context'
);

select is(
  (public.link_entry_life_area('e2222222-2222-4222-8222-222222222222', 'travel', 0.5, 'pt-BR', 'a1111111-1111-4111-8111-111111111111') ->> 'reason'),
  'low_confidence',
  'an unsure reading links nothing'
);
select is(
  (select count(*)::int from public.contexts where user_id = 'a1111111-1111-4111-8111-111111111111' and kind = 'travel'),
  0,
  'and creates no area'
);

select is(
  (public.link_entry_life_area('e2222222-2222-4222-8222-222222222222', 'travel', 0.8, 'en', 'a1111111-1111-4111-8111-111111111111') ->> 'linked')::boolean,
  true,
  'a confident travel reading links'
);
select is(
  (select sensitivity from public.entries where id = 'e2222222-2222-4222-8222-222222222222'),
  'normal',
  'travel does not change the sensitivity'
);

select throws_ok(
  $$ select public.link_entry_life_area('e3333333-3333-4333-8333-333333333333', 'finance', 0.9, 'pt-BR', 'a1111111-1111-4111-8111-111111111111') $$,
  'P0002',
  null,
  'another user''s entry cannot be linked'
);
select throws_ok(
  $$ select public.link_entry_life_area('e1111111-1111-4111-8111-111111111111', 'pets', 0.9, 'pt-BR', 'a1111111-1111-4111-8111-111111111111') $$,
  '22023',
  null,
  'an unknown area is refused by name'
);
select is(
  (select count(*)::int from public.audit_logs
   where user_id = 'a1111111-1111-4111-8111-111111111111' and action_type = 'entry_life_area_linked' and actor = 'agent'),
  2,
  'every new link is audited as the agent''s, and the no-op is not'
);
reset role;

-- The owner's override ------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(
  (public.set_entry_sensitivity('e1111111-1111-4111-8111-111111111111', 'normal') ->> 'sensitivity'),
  'normal',
  'the owner can lower the area default'
);
select throws_ok(
  $$ select public.set_entry_sensitivity('e3333333-3333-4333-8333-333333333333', 'normal') $$,
  'P0002',
  null,
  'the owner cannot reach another user''s entry'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.link_entry_life_area('e1111111-1111-4111-8111-111111111111', 'health', 0.9, 'pt-BR', 'a1111111-1111-4111-8111-111111111111');
select is(
  (select sensitivity from public.entries where id = 'e1111111-1111-4111-8111-111111111111'),
  'normal',
  'a later reading never overrides the owner''s own choice'
);
reset role;

select is(
  (select count(*)::int from public.audit_logs
   where user_id = 'a1111111-1111-4111-8111-111111111111' and action_type = 'entry_sensitivity_set' and actor = 'user'),
  1,
  'the owner''s change is audited as the owner''s'
);

select * from finish();
rollback;
