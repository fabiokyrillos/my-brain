-- Local/CI-only seed. Never applied to a linked project by `supabase db push`;
-- it runs only as the last step of `supabase db reset` against the local stack.
--
-- Purpose: make the pgTAP suite in `supabase/tests/` runnable. The suite is the
-- database-correctness gate (RLS, grants, RPC contracts, undo routing) and it
-- calls pgTAP assertions unqualified (`plan`, `has_function`, `policies_are`),
-- so pgTAP must be installed AND reachable on the default `search_path` of the
-- session `supabase test db` opens.
--
-- pgTAP is deliberately NOT created by a migration: it is a test harness, not
-- part of the product schema, and the linked project must not carry it.
--
-- `config.toml` already declares `[db.seed] sql_paths = ["./seed.sql"]`; this
-- file is that path. Keep it free of domain fixtures — every pgTAP file builds
-- and rolls back its own data, and `supabase db reset` must stay a truthful
-- proof that the migration chain applies to an empty database.

create extension if not exists pgtap with schema extensions;

-- Belt and braces: do not depend on the local image's default role search_path
-- for `extensions` to be visible. Database-level scope so the fresh sessions
-- pg_prove opens inherit it.
--
-- This does not weaken CI as a detector of unqualified-lookup bugs in product
-- code, which was the reason to check: `config.toml` already puts `extensions`
-- on the Data API's own search_path (`[api] extra_search_path`), so an API
-- session always had it, and every product function pins `search_path = ''`
-- explicitly — asserted per RPC by the pgTAP suite.
do $$
begin
  execute format(
    'alter database %I set search_path = %s',
    current_database(),
    '"$user", public, extensions'
  );
end
$$;
