#!/usr/bin/env node
/**
 * `2H-BACKUP-002` — the restore drill, as a procedure that can be run rather
 * than a paragraph that can be believed.
 *
 * ## The one thing this script exists to make impossible
 *
 * A restore drill is the most dangerous routine operation there is, because the
 * happy path and the catastrophe differ by one identifier. Restoring a backup
 * into the DISPOSABLE project proves recovery works. Restoring the same backup
 * into PRODUCTION overwrites live data with an older copy, and there is no undo
 * — the thing you would restore from is the thing you just replaced.
 *
 * So the production project reference is read from `supabase/.temp/project-ref`
 * — the repository's own record of which project is live — and any target equal
 * to it is refused before a single read happens. There is no flag that
 * overrides this. A drill that could be pointed at production is not a drill.
 *
 * ## What it verifies, and why counts alone are not enough
 *
 * A restore that produced an empty database would satisfy "the restore
 * completed". So the drill checks four things, and a failure in any one is a
 * failed drill:
 *
 *   1. **Row counts** for a named set of tables, against expectations supplied
 *      by the operator from the source project's own pre-drill census. Counts
 *      that are all zero fail; counts that merely differ are reported.
 *   2. **The migration chain**, because a restore that lands a database at an
 *      older schema head is a restore into a product the code cannot run.
 *   3. **RLS and grant posture**, because a physical restore can reproduce
 *      every row and still lose the boundary that keeps one user's rows away
 *      from another's. Forced RLS, a policy count, and the absence of a client
 *      grant on the tables that must not have one.
 *   4. **The destructive posture**, because a restored copy that arrived with
 *      retention sweeps scheduled would begin deleting on its own.
 *
 * ## RG-DEP-3 remains an owner action
 *
 * This script is the mechanism half. **Executing the drill is the owner's**,
 * and Phase 2H does not perform it: taking a backup, provisioning a disposable
 * project and restoring into it are provider operations with a cost and a
 * blast radius, and none is authorized here.
 *
 * Usage:
 *   node scripts/phase-2h-restore-drill.mjs --target <disposable-project-ref>
 *   node scripts/phase-2h-restore-drill.mjs --target <ref> --expect ./census.json
 *
 * `census.json` is the pre-drill row census taken from the SOURCE project:
 *   { "entries": 812, "tasks": 240, ... }
 */

import { readFileSync, readdirSync } from "node:fs";

const REPO = new URL("..", import.meta.url);

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const target = flag("--target");
const expectPath = flag("--expect");

if (!target) {
  console.error("A --target project ref is required. This script never guesses a target.");
  process.exit(2);
}

/**
 * The refusal, first, before anything reads or writes.
 *
 * Read from the repository's own record of the live project rather than from an
 * argument or an environment variable, because a value the caller supplies is a
 * value the caller can get wrong in exactly the direction that matters.
 */
const PRODUCTION_REF = (() => {
  try {
    return readFileSync(new URL("supabase/.temp/project-ref", REPO), "utf8").trim();
  } catch {
    return null;
  }
})();

if (!PRODUCTION_REF) {
  console.error(
    "supabase/.temp/project-ref is unreadable, so this script cannot prove the target is NOT production.",
  );
  console.error("Refusing to run. Link the project first (`npx supabase link`).");
  process.exit(2);
}

if (target === PRODUCTION_REF) {
  console.error("=".repeat(72));
  console.error("REFUSED: the target is the LINKED PRODUCTION PROJECT.");
  console.error("");
  console.error("A restore into production overwrites live data with an older copy, and the");
  console.error("thing you would restore from is the thing you just replaced. There is no");
  console.error("flag that overrides this refusal, by design.");
  console.error("");
  console.error(`  target      : ${target}`);
  console.error(`  production  : ${PRODUCTION_REF}`);
  console.error("=".repeat(72));
  process.exit(3);
}

const TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() ??
  (() => {
    try {
      return /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/m
        .exec(readFileSync(new URL(".env.local", REPO), "utf8"))?.[1]
        ?.trim();
    } catch {
      return null;
    }
  })();

if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is required (env or .env.local).");
  process.exit(2);
}

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${target}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

/** The local chain head, so the restored schema can be compared to the repo. */
const LOCAL_HEAD = (() => {
  const names = readdirSync(new URL("supabase/migrations", REPO))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return { head: names.at(-1)?.slice(0, 14) ?? null, count: names.length };
})();

/**
 * The tables whose counts are checked.
 *
 * User-owned content first, because those are the rows a restore exists to
 * bring back. The operational tables follow, because a restore that recovered
 * every entry and no audit trail is a partial recovery that would read as a
 * complete one.
 */
const COUNTED_TABLES = [
  "entries",
  "entry_interpretations",
  "tasks",
  "entities",
  "memories",
  "notifications",
  "jobs",
  "audit_logs",
  "ai_usage_events",
  "product_events",
];

/** Tables no client role may hold a direct grant on, restored or not. */
const NO_CLIENT_GRANT = ["audit_logs", "ai_usage_events", "product_events", "scheduled_job_health"];

const expected = (() => {
  if (!expectPath) return null;
  try {
    return JSON.parse(readFileSync(expectPath, "utf8"));
  } catch (failure) {
    console.error(`--expect could not be read: ${failure.message}`);
    process.exit(2);
  }
})();

console.log("=".repeat(72));
console.log("PHASE 2H RESTORE DRILL -- 2H-BACKUP-002");
console.log(`target      : ${target}   (NOT the linked production project)`);
console.log(`production  : ${PRODUCTION_REF}   (refused as a target)`);
console.log(`repo chain  : head ${LOCAL_HEAD.head}, ${LOCAL_HEAD.count} migrations`);
console.log("=".repeat(72));

const findings = [];
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
  if (!ok) findings.push(name);
}

// ---------------------------------------------------------------- 1. counts
console.log("\n1. ROW COUNTS");
const counts = {};
for (const table of COUNTED_TABLES) {
  try {
    const rows = await query(`select count(*)::bigint as n from public.${table}`);
    counts[table] = Number(rows[0]?.n ?? 0);
  } catch (failure) {
    counts[table] = null;
    check(`${table} is readable`, false, failure.message);
  }
}
for (const [table, value] of Object.entries(counts)) {
  if (value === null) continue;
  const want = expected?.[table];
  if (want === undefined) {
    console.log(`      ${table.padEnd(24)} ${value}`);
  } else {
    check(`${table} matches the pre-drill census`, value === want, `restored ${value}, expected ${want}`);
  }
}
// A restore into an empty database satisfies "the restore completed".
const total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
check("the restored database is not empty", total > 0, `${total} rows across ${COUNTED_TABLES.length} tables`);

// ------------------------------------------------------------- 2. migrations
console.log("\n2. MIGRATION CHAIN");
try {
  const rows = await query(
    "select version from supabase_migrations.schema_migrations order by version desc limit 1",
  );
  const restoredHead = rows[0]?.version ?? null;
  const all = await query("select count(*)::int as n from supabase_migrations.schema_migrations");
  check(
    "the restored head equals the repository head",
    restoredHead === LOCAL_HEAD.head,
    `restored ${restoredHead}, repository ${LOCAL_HEAD.head}`,
  );
  check(
    "the restored chain has the same number of migrations",
    Number(all[0]?.n) === LOCAL_HEAD.count,
    `restored ${all[0]?.n}, repository ${LOCAL_HEAD.count}`,
  );
} catch (failure) {
  check("the migration chain is readable", false, failure.message);
}

// ------------------------------------------------------------- 3. RLS/grants
console.log("\n3. RLS AND GRANT POSTURE");
try {
  const unforced = await query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relrowsecurity = false or c.relforcerowsecurity = false)
    order by c.relname
  `);
  check(
    "every public table has RLS enabled AND forced",
    unforced.length === 0,
    unforced.length ? unforced.map((row) => row.relname).join(", ") : "all forced",
  );

  const policies = await query(
    "select count(*)::int as n from pg_policies where schemaname = 'public'",
  );
  // A restore that lost every policy would pass a "no unforced table" check on
  // an empty policy set: forced RLS with no policy denies everyone, which is
  // safe but is not a working product and is not what was backed up.
  check("policies survived the restore", Number(policies[0]?.n) > 20, `${policies[0]?.n} policies`);

  const grants = await query(`
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and table_name in (${NO_CLIENT_GRANT.map((name) => `'${name}'`).join(", ")})
  `);
  check(
    "no client role holds a direct grant on an append-only table",
    grants.length === 0,
    grants.length ? JSON.stringify(grants) : "none",
  );
} catch (failure) {
  check("the RLS and grant posture is readable", false, failure.message);
}

// -------------------------------------------------------- 4. destructive posture
console.log("\n4. DESTRUCTIVE POSTURE OF THE RESTORED COPY");
try {
  const jobs = await query("select jobname, schedule, command from cron.job order by jobname");
  const sweeps = jobs.filter((job) => /prune_/i.test(job.command ?? ""));
  console.log(`      ${jobs.length} scheduled job(s) in the restored copy`);
  for (const job of jobs) console.log(`      ${String(job.jobname).padEnd(38)} ${job.schedule}`);
  // A restored copy that arrived with sweeps scheduled starts deleting on its
  // own, against data an operator is still comparing to the source.
  check(
    "no retention sweep is scheduled in the restored copy beyond the two authorized attempt prunes",
    sweeps.every((job) =>
      ["byok-prune-validation-attempts", "sh-prune-auth-event-attempts"].includes(job.jobname),
    ),
    sweeps.map((job) => job.jobname).join(", ") || "none",
  );
} catch (failure) {
  check("the cron catalog is readable", false, failure.message);
}

console.log("\n" + "=".repeat(72));
if (findings.length === 0) {
  console.log("DRILL PASSED. Record this transcript against RG-DEP-3.");
  console.log("The disposable project should now be DELETED -- it holds a full copy of");
  console.log("production data and every hour it survives is an hour of extra exposure.");
} else {
  console.log(`DRILL FAILED on ${findings.length} check(s):`);
  for (const finding of findings) console.log(`  - ${finding}`);
  console.log("A failed drill is a finding about recovery, not about this script.");
}
console.log("=".repeat(72));
process.exit(findings.length === 0 ? 0 : 1);
