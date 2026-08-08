#!/usr/bin/env node
/**
 * `2I.0` gate **G-2I.2** — measure lexical search BEFORE deciding whether it
 * needs a migration.
 *
 * ## The rule this script exists to obey
 *
 * The owner's budget is **at most one migration, allocated to 2I.5 only, and
 * `1 allocated · 0 spent` is the preferred close.** The instruction is explicit:
 * *do not create FTS schema first and measure second.* So this script measures
 * **option A** — an RLS-bound `ILIKE` query over the columns that already exist
 * — against realistic per-owner volumes, and only a failure here justifies
 * option B.
 *
 * ## Why it is safe to run against the live project — and the trap avoided
 *
 * This seeds **thousands of rows into production tables**. It is safe for
 * exactly one reason, and the reason had to be designed rather than assumed.
 *
 * The first draft wrapped the work in `begin; … ` and relied on the Management
 * API **not** committing. That is a guess about someone else's transaction
 * handling, and if it were wrong the fixtures would persist in production —
 * a real data incident, caused by a benchmark.
 *
 * **So the whole body is a single `DO` block that ends by RAISING.** A `DO`
 * block is one statement and is atomic: when it raises, every insert, every
 * `alter table … disable trigger` and every `set_config` inside it is rolled
 * back by Postgres itself, regardless of how the caller manages transactions.
 * The measurements are carried **out in the exception message**, because an
 * exception is the one exit path that cannot leave data behind.
 *
 * The script then **verifies the rollback by reading the table back**, because
 * a safety property nobody checked is a claim.
 *
 * **RLS is left ON and is the thing being measured.** Queries run under
 * `set_config('role','authenticated')` with a JWT claim, so every predicate is
 * evaluated as the product will evaluate it. A benchmark run as `postgres`
 * would measure a query nobody issues.
 *
 * Usage:
 *   node scripts/phase-2i-search-benchmark.mjs
 *   node scripts/phase-2i-search-benchmark.mjs --scale 2
 */

import { readFileSync } from "node:fs";

import { managementQuery, resolveAccessToken } from "./backup-shared.mjs";

const REPO = new URL("..", import.meta.url);

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const scale = Number(flag("--scale", "1"));
if (!Number.isFinite(scale) || scale <= 0) {
  console.error("--scale must be a positive number");
  process.exit(2);
}

/**
 * Representative per-owner volumes for a heavy user after roughly two years.
 *
 * Deliberately **not** "millions of users" — the owner's instruction says not to
 * optimise for that, and search is per-owner under RLS anyway, so the number
 * that matters is one person's data, not the population.
 */
const VOLUME = {
  entries: Math.round(5000 * scale),
  tasks: Math.round(2000 * scale),
  memories: Math.round(1000 * scale),
  people: Math.round(300 * scale),
  projects: Math.round(100 * scale),
  organizations: Math.round(50 * scale),
  attachments: Math.round(500 * scale),
};

/** ~2 KB of filler per row, and ~20 KB of extracted text per attachment. */
const FILLER = "lorem ipsum dolor sit amet consectetur adipiscing elit ";

const token = resolveAccessToken(REPO);
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is required (env or .env.local).");
  process.exit(2);
}

const projectRef = (() => {
  try {
    return readFileSync(new URL("supabase/.temp/project-ref", REPO), "utf8").trim();
  } catch {
    return null;
  }
})();
if (!projectRef) {
  console.error("supabase/.temp/project-ref is unreadable. Link the project first.");
  process.exit(2);
}

/**
 * The candidate query, option A.
 *
 * One statement per domain, each owner-scoped **in the query** and each bound by
 * a per-domain limit. `unaccent` is deliberately NOT used: it is an extension
 * this database does not have, and reaching for it would already be option B.
 */
const SQL = `
do $bench$
declare
  owner_id uuid;
  t0 timestamptz;
  n bigint;
  filler text := repeat('${FILLER}', 36);
  big text := repeat('${FILLER}', 360);
  result jsonb := '[]'::jsonb;
  procedure_note text := '';
begin
  select id into owner_id from auth.users order by created_at limit 1;
  if owner_id is null then raise exception 'no user to own fixtures'; end if;

  -- Quota triggers would refuse these volumes. Disabling is transactional, so
  -- the rollback re-arms them regardless of how this block exits.
  alter table public.entries disable trigger user;
  alter table public.attachments disable trigger user;

  t0 := clock_timestamp();
  insert into public.entries (user_id, original_content, occurred_at, locale, source, status, sensitivity)
  select owner_id,
         filler || ' marker' || g || case when g % 997 = 0 then ' zeldapepper' else '' end,
         now() - (g || ' minutes')::interval, 'pt-BR', 'web', 'completed',
         case when g % 50 = 0 then 'highly_sensitive' when g % 7 = 0 then 'private' else 'normal' end
  from generate_series(1, ${VOLUME.entries}) g;
  result := result || jsonb_build_object('step', 'seed', 'detail', 'entries', 'rows', ${VOLUME.entries}, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  insert into public.tasks (user_id, title, description, status, confidence, created_by)
  select owner_id, 'task ' || g || case when g % 499 = 0 then ' zeldapepper' else '' end,
         filler, 'todo', 0.9, 'user'
  from generate_series(1, ${VOLUME.tasks}) g;

  insert into public.memories (user_id, content, kind, confidence, sensitivity)
  select owner_id, filler || ' mem' || g || case when g % 251 = 0 then ' zeldapepper' else '' end,
         'preference', 0.9,
         case when g % 40 = 0 then 'highly_sensitive' when g % 6 = 0 then 'private' else 'normal' end
  from generate_series(1, ${VOLUME.memories}) g;

  insert into public.people (user_id, name, notes)
  select owner_id, 'Person ' || g || case when g % 97 = 0 then ' Zeldapepper' else '' end, filler
  from generate_series(1, ${VOLUME.people}) g;

  insert into public.projects (user_id, name, description, status)
  select owner_id, 'Project ' || g || case when g % 41 = 0 then ' Zeldapepper' else '' end, filler, 'active'
  from generate_series(1, ${VOLUME.projects}) g;

  insert into public.organizations (user_id, name, description)
  select owner_id, 'Company ' || g || case when g % 17 = 0 then ' Zeldapepper' else '' end, filler
  from generate_series(1, ${VOLUME.organizations}) g;

  t0 := clock_timestamp();
  insert into public.attachments
    (user_id, original_name, description, extracted_text, mime_type, size_bytes, status, storage_path, sensitivity)
  select owner_id, 'document-' || g || '.pdf', filler,
         big || ' doc' || g || case when g % 89 = 0 then ' zeldapepper' else '' end,
         'application/pdf', 4096, 'ready', 'bench/' || gen_random_uuid() || '.pdf',
         case when g % 30 = 0 then 'highly_sensitive' else 'normal' end
  from generate_series(1, ${VOLUME.attachments}) g;
  result := result || jsonb_build_object('step', 'seed', 'detail', 'attachments (extracted_text ~20KB each)', 'rows', ${VOLUME.attachments}, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  -- EXECUTE, because plpgsql will not accept ANALYZE as a plain statement.
  execute 'analyze public.entries'; execute 'analyze public.tasks';
  execute 'analyze public.memories'; execute 'analyze public.people';
  execute 'analyze public.projects'; execute 'analyze public.organizations';
  execute 'analyze public.attachments';

  -- RLS is the thing being measured, so the queries run as the product runs
  -- them. A benchmark run as postgres would measure a query nobody issues.
  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ---- option A: ILIKE over existing columns, owner-scoped, per-domain bound
  t0 := clock_timestamp();
  select count(*) into n from (
    select id from public.entries
      where original_content ilike '%zeldapepper%' and sensitivity <> 'highly_sensitive' limit 20) s;
  result := result || jsonb_build_object('step', 'A.entries', 'detail', 'original_content', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select id from public.tasks
      where title ilike '%zeldapepper%' or description ilike '%zeldapepper%' limit 20) s;
  result := result || jsonb_build_object('step', 'A.tasks', 'detail', 'title+description', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select id from public.memories
      where content ilike '%zeldapepper%' and sensitivity <> 'highly_sensitive' limit 20) s;
  result := result || jsonb_build_object('step', 'A.memories', 'detail', 'content', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select id from public.people
      where name ilike '%zeldapepper%' or notes ilike '%zeldapepper%' limit 20) s;
  result := result || jsonb_build_object('step', 'A.people', 'detail', 'name+notes', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select id from public.projects
      where name ilike '%zeldapepper%' or description ilike '%zeldapepper%' limit 20) s;
  result := result || jsonb_build_object('step', 'A.projects', 'detail', 'name+description', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  t0 := clock_timestamp();
  select count(*) into n from (
    select id from public.organizations
      where name ilike '%zeldapepper%' or description ilike '%zeldapepper%' limit 20) s;
  result := result || jsonb_build_object('step', 'A.organizations', 'detail', 'name+description', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  -- The one that decides it: 20 KB of extracted text per row.
  t0 := clock_timestamp();
  select count(*) into n from (
    select id from public.attachments
      where (original_name ilike '%zeldapepper%' or description ilike '%zeldapepper%'
             or extracted_text ilike '%zeldapepper%')
        and sensitivity <> 'highly_sensitive' limit 20) s;
  result := result || jsonb_build_object('step', 'A.attachments', 'detail', 'original_name+description+extracted_text', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  -- All seven as one round trip, which is what the product will actually do.
  t0 := clock_timestamp();
  -- Each branch parenthesised: LIMIT binds to the whole UNION otherwise, which
  -- is both a syntax error here and the wrong query if it parsed.
  select count(*) into n from (
    (select id::text from public.entries where original_content ilike '%zeldapepper%' and sensitivity <> 'highly_sensitive' limit 20)
    union all (select id::text from public.tasks where title ilike '%zeldapepper%' or description ilike '%zeldapepper%' limit 20)
    union all (select id::text from public.memories where content ilike '%zeldapepper%' and sensitivity <> 'highly_sensitive' limit 20)
    union all (select id::text from public.people where name ilike '%zeldapepper%' or notes ilike '%zeldapepper%' limit 20)
    union all (select id::text from public.projects where name ilike '%zeldapepper%' or description ilike '%zeldapepper%' limit 20)
    union all (select id::text from public.organizations where name ilike '%zeldapepper%' or description ilike '%zeldapepper%' limit 20)
    union all (select id::text from public.attachments where (original_name ilike '%zeldapepper%' or description ilike '%zeldapepper%' or extracted_text ilike '%zeldapepper%') and sensitivity <> 'highly_sensitive' limit 20)
  ) s;
  result := result || jsonb_build_object('step', 'A.ALL', 'detail', 'seven domains, one round trip', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  -- A prefix query, the common case when someone types a name.
  t0 := clock_timestamp();
  select count(*) into n from (
    select id from public.people where name ilike 'Person 2%' limit 20) s;
  result := result || jsonb_build_object('step', 'A.prefix', 'detail', 'people.name prefix', 'rows', n, 'ms', round((extract(milliseconds from clock_timestamp() - t0))::numeric,1));

  perform set_config('role', 'postgres', true);

  select count(*) into n from public.entries where user_id = owner_id;
  result := result || jsonb_build_object('step', 'scale', 'detail', 'entries owned by the fixture owner', 'rows', n, 'ms', null);

  -- THE ONLY EXIT. Raising is what guarantees every insert above is rolled
  -- back, whatever the caller does with transactions -- a DO block is one
  -- statement and is atomic. The results ride out in the message because an
  -- exception is the one exit path that cannot leave data behind.
  raise exception 'PHASE_2I_BENCHMARK %', result::text using errcode = 'P0001';
end;
$bench$;
`;

console.log(`Phase 2I search benchmark — option A (ILIKE, existing schema, RLS-bound)`);
console.log(`project ${projectRef} · scale ${scale}`);
console.log(
  `volumes: ${Object.entries(VOLUME).map(([k, v]) => `${k}=${v}`).join(" ")}`,
);
console.log("everything runs inside ONE transaction and is ROLLED BACK\n");

/**
 * The benchmark ALWAYS throws — the raise is the designed exit. So a resolved
 * promise is the alarming case: it would mean the DO block returned without
 * raising, which is the only way the fixtures could have been committed.
 */
let rows = null;

try {
  await managementQuery(token, projectRef, SQL, { errorLimit: 60000 });
  console.error("!! The benchmark did NOT raise. That is the one outcome that could leave data behind.");
  process.exitCode = 1;
} catch (failure) {
  // The payload arrives inside the API's own JSON error envelope, so every
  // quote in it is backslash-escaped. Locating the marker and slicing to the
  // last `]` is more robust than a regex that has to guess the terminator --
  // the first attempt guessed `\n` and silently reported "failed before it
  // could report" for a run that had in fact completed.
  const at = failure.message.indexOf("PHASE_2I_BENCHMARK");
  const end = failure.message.lastIndexOf("]");
  if (at !== -1 && end > at) {

    const payload = failure.message.slice(at + "PHASE_2I_BENCHMARK".length, end + 1).trim();
    try {
      rows = JSON.parse(payload.replace(/\\"/g, '"'));
    } catch (parseFailure) {
      console.error(`could not parse the benchmark payload: ${parseFailure.message}`);
      console.error(payload.slice(0, 400));
      process.exitCode = 1;
    }
  } else {
    console.error(`benchmark failed before it could report: ${failure.message.slice(0, 600)}`);
    console.error("\nThe DO block is atomic, so nothing persisted.");
    process.exitCode = 1;
  }
} finally {
  // The API runs the whole body in one implicit transaction and our own
  // `begin`/no-commit leaves it unfinished, so the server rolls it back. Assert
  // it rather than trust it.
  try {
    const check = await managementQuery(
      token,
      projectRef,
      "select count(*)::int as n from public.attachments where storage_path like 'bench/%'",
    );
    const leaked = Number(check[0]?.n ?? -1);
    console.log(leaked === 0
      ? "\nrollback verified: 0 benchmark rows persisted"
      : `\n!! ROLLBACK DID NOT HAPPEN: ${leaked} benchmark attachment(s) persist. Investigate immediately.`);
    if (leaked !== 0) process.exitCode = 1;
  } catch (checkFailure) {
    console.error(`\n!! could not verify rollback: ${checkFailure.message}`);
    process.exitCode = 1;
  }
}

if (Array.isArray(rows)) {
  console.log("step             detail                                              rows       ms");
  console.log("-".repeat(88));
  for (const row of rows) {
    console.log(
      `${String(row.step).padEnd(16)} ${String(row.detail).padEnd(50)} ${String(row.rows ?? "").padStart(6)} ${String(row.ms ?? "").padStart(8)}`,
    );
  }
  const all = rows.find((row) => row.step === "A.ALL");
  const perDomain = rows.filter((row) => /^A\./.test(String(row.step)) && row.step !== "A.ALL" && row.step !== "A.prefix");
  const slowest = perDomain.reduce((worst, row) => (Number(row.ms) > Number(worst?.ms ?? -1) ? row : worst), null);

  console.log("-".repeat(88));
  console.log("\nDECISION INPUT — two candidate shapes, both zero-migration\n");

  if (all) {
    const ms = Number(all.ms);
    console.log(`  SEQUENTIAL  one UNION round trip ....... ${ms} ms  ${ms <= 300 ? "PASS" : "FAIL"} (budget 300 ms)`);
  }
  if (slowest) {
    const ms = Number(slowest.ms);
    // The shape the requirements already imply: per-domain bounds
    // (2I-SEARCH-006) and per-domain partial failure (2I-SEARCH-007) only mean
    // anything if the domains are queried independently. Issued concurrently,
    // wall clock is the slowest domain, not the sum.
    console.log(`  PARALLEL    slowest single domain ...... ${ms} ms  ${ms <= 300 ? "PASS" : "FAIL"} (budget 300 ms)   [${slowest.step}]`);
    console.log("\n  The PARALLEL shape is what 2I-SEARCH-006 (per-domain bounds) and");
    console.log("  2I-SEARCH-007 (per-domain partial failure) already require: those");
    console.log("  requirements are meaningless unless each domain is queried on its own.");
    console.log("  So the sequential number is informational; the parallel one decides.\n");
    console.log(
      ms <= 300
        ? "  => ZERO-MIGRATION SEARCH IS VIABLE. Do not spend the migration.\n"
          + "     Record the revisit threshold: re-run this benchmark when any single\n"
          + "     owner passes ~10k entries or ~1k attachments carrying extracted_text."
        : "  => the parallel shape also fails. Option B (FTS + indexes) is justified.",
    );
  }
}
