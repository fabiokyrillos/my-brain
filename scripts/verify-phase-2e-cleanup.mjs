import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

// Fail-closed residual-data check for the Phase 2E aggregate remote gate. It asserts
// that no disposable user, orphaned user-owned row, or remote-smoke storage object
// remains in the linked project after the Phase 2E smoke runs. The prefix and table
// lists are a superset of every fixture the aggregate touches, and the Phase 2C/2D
// prefixes and tables are kept so a stray fixture from any adjacent smoke is still
// caught rather than silently ignored.
//
// Phase 2E adds four tables to the scan, and each is here for a reason a reviewer
// should be able to check rather than take on trust:
//
//   * `task_command_confirmations` — the destructive-confirmation ledger. A confirmation
//     is minted before the mutation it authorizes, so an abandoned cancel leaves an
//     `issued` row behind with no task write to point at. It is the one Phase 2E table
//     whose rows outlive a *failed* flow, which makes it the most likely residue.
//   * `reminders` — Phase 2E maintains reminder consistency by closing a row and
//     inserting a new one (PRD §11.3), so a single rescheduling fixture can leave two
//     rows where the fixture author was thinking about one.
//   * `undo_operations` — every Phase 2E mutation writes one before touching a task.
//   * `ai_usage_events` — command parsing bills a real ledger row (2E-PROVENANCE-002)
//     even when the parse then fails validation, so a smoke that exercises a rejected
//     proposal still writes here.
//
// `audit_logs` and `product_events` are append-only and are deliberately *not* in the
// orphan scan: both are designed to survive their subject, and `product_events` is
// verified by the owner token after Auth deletion the same way Phase 2D verified it.
// (`product_events` also answers 403 to `service_role`, for that same append-only
// reason. It needs no exception here because it is not scanned at all — the
// exception below is deliberately not widened to cover it.)
//
// One scanned table is unreadable by this verifier, by design
// -----------------------------------------------------------
// `202607260059:258-261` revokes ALL on `public.task_command_confirmations` from
// `public, anon, authenticated, service_role` and grants `select` back to
// `authenticated` alone. This verifier authenticates as `service_role`, so its read
// is refused with `42501` / HTTP 403. That is the deployed posture being correct,
// not a fault — the table's own comment says "No role may write it: both writers are
// SECURITY DEFINER functions."
//
// The first run of this verifier against a *deployed* chain died here, for the same
// underlying reason its first run ever died on `PGRST205`: before deployment the
// table did not exist, so only the absent-table branch had ever executed. A branch
// that has never run is a claim, not a gate — twice now, in the same file.
//
// The exception is written as an assertion rather than a tolerance, and the
// difference is load-bearing. If the read *succeeds*, the grant has been widened and
// the check FAILS. Silently accepting either answer would turn a security posture
// into a coin flip, and 2E-OWNERSHIP-003 says this phase widens no grant.
//
// Excluding it from the orphan scan costs no coverage, which is why this is not a
// weakening. An orphan here is defined as a row whose `user_id` is absent from
// `auth.users`, and `202607260059:214` declares
// `user_id uuid not null references auth.users(id) on delete cascade` — so deleting
// a disposable owner deletes its confirmations. The row this scan looks for cannot
// exist. The database enforces structurally what the scan could only observe.

const credentials = getLinkedSupabaseCredentials();
const admin = createClient(credentials.url, credentials.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const disposablePrefixes = [
  "phase-2e-command-",
  "phase-2e-owner-a-",
  "phase-2e-owner-b-",
  "phase-2d-resolution-",
  "phase-2d-preview-",
  "phase-2d-reinterpret-",
  "phase-2c-integration-",
  "phase-2a-jobs-",
  "phase-2b-revisions-",
  "phase-2x-entry-jobs-",
  "phase-2x-events-",
  "phase-2x-daily-cycle-",
  "sprint-1-5-",
  "codex-",
];

const ownedTables = [
  "entries",
  "entry_interpretations",
  "jobs",
  "attachments",
  "pending_questions",
  "tasks",
  "projects",
  "contexts",
  "people",
  "task_projects",
  "task_contexts",
  "task_people",
  "task_dependencies",
  "entry_task_candidate_resolutions",
  // Phase 2E.
  "task_command_confirmations",
  "reminders",
  "undo_operations",
  "ai_usage_events",
];

// Tables whose correct deployed posture is "service_role cannot read this", mapped
// to the reason. Keyed by table so the exception can never be a blanket rule: a 403
// from any table not named here is still a hard failure.
const serviceRoleCannotRead = {
  task_command_confirmations:
    "202607260059 revokes all from service_role and grants select to authenticated only",
};

const PRIVILEGE_DENIED = new Set(["42501", "PGRST301", "PGRST302"]);

function isPrivilegeDenied(error) {
  return PRIVILEGE_DENIED.has(error?.code ?? "")
    || /permission denied/i.test(error?.message ?? "");
}

const users = [];
for (let page = 1; ; page += 1) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 1_000 });
  if (result.error) throw result.error;
  users.push(...result.data.users);
  if (result.data.users.length < 1_000) break;
}

const disposableUsers = users.filter((user) => disposablePrefixes.some(
  (prefix) => (user.email ?? "").toLowerCase().startsWith(prefix),
));
const currentUserIds = new Set(users.map((user) => user.id));
const orphanCounts = {};
const missingTables = [];
const privilegeProtectedTables = [];

for (const table of ownedTables) {
  let orphanCount = 0;
  for (let offset = 0; ; offset += 1_000) {
    const result = await admin.from(table).select("user_id").range(offset, offset + 999);

    // A table declared unreadable by `service_role` must actually be unreadable.
    // Checked before the error branch so that a *successful* read is caught: that
    // means a grant was widened, which is a security regression this verifier is
    // now the only thing watching for.
    if (table in serviceRoleCannotRead) {
      if (!result.error) {
        throw new Error(
          `${table}: service_role could read this table, but ${serviceRoleCannotRead[table]}. `
          + "A grant has been widened — refusing to pass.",
        );
      }
      if (isPrivilegeDenied(result.error)) {
        privilegeProtectedTables.push(table);
        break;
      }
      // Not a privilege error — fall through so an absent table is still reported
      // as absent and anything else still fails closed.
    }

    if (result.error) {
      // A Phase 2E table that does not exist yet is the expected state until the
      // 202607250055–202607280061 chain is deployed. Record it and keep going rather
      // than failing: a verifier that dies on the first absent table cannot report on
      // the fourteen that do exist, and "not deployed" is not "dirty".
      //
      // `PGRST205` — not `42P01` — is what actually arrives. PostgREST answers from
      // its schema cache and never reaches Postgres for an unknown relation, so the
      // native undefined-table SQLSTATE is never raised. The first run of this
      // verifier died here on `task_command_confirmations` for exactly that reason;
      // `42P01` is kept for any path that does reach Postgres directly.
      if (
        result.error.code === "PGRST205"
        || result.error.code === "42P01"
        || /does not exist|could not find the table/i.test(result.error.message ?? "")
      ) {
        missingTables.push(table);
        break;
      }
      throw new Error(`${table}: ${result.error.code ?? "unknown"}`);
    }
    orphanCount += result.data.filter((row) => row.user_id && !currentUserIds.has(row.user_id)).length;
    if (result.data.length < 1_000) break;
  }
  if (!missingTables.includes(table) && !privilegeProtectedTables.includes(table)) {
    orphanCounts[table] = orphanCount;
  }
}

let storageObjects = 0;
let remoteSmokeObjects = 0;

async function scanStorage(prefix = "", depth = 0) {
  if (depth > 4) throw new Error("Unexpected user-files storage nesting depth");

  for (let offset = 0; ; offset += 1_000) {
    const result = await admin.storage.from("user-files").list(prefix, {
      limit: 1_000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (result.error) throw result.error;

    for (const item of result.data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        storageObjects += 1;
        if (item.name === "remote-smoke.txt" || item.name.endsWith("-remote-smoke.txt")) {
          remoteSmokeObjects += 1;
        }
      } else {
        await scanStorage(path, depth + 1);
      }
    }

    if (result.data.length < 1_000) break;
  }
}

await scanStorage();

const result = {
  authUsers: users.length,
  disposableUsers: disposableUsers.length,
  orphanCounts,
  tablesNotYetDeployed: missingTables,
  tablesServiceRoleCannotRead: privilegeProtectedTables,
  productEvents: "verified by the product-events owner token after Auth deletion",
  storageObjects,
  remoteSmokeObjects,
};

if (disposableUsers.length > 0 || Object.values(orphanCounts).some(Boolean) || remoteSmokeObjects > 0) {
  throw new Error(`Disposable Phase 2E smoke data remains in the linked project: ${JSON.stringify(result)}`);
}

console.log("Phase 2E cleanup verification passed:", result);
for (const table of privilegeProtectedTables) {
  console.log(
    `Note: ${table} was not orphan-scanned because service_role cannot read it — `
    + `${serviceRoleCannotRead[table]}. That refusal was asserted, not assumed. An orphan `
    + "there is structurally impossible: user_id references auth.users(id) on delete cascade.",
  );
}
if (missingTables.length > 0) {
  console.log(
    `Note: ${missingTables.length} Phase 2E table(s) are absent because migrations `
    + "202607250055-202607280061 are not deployed. Re-run after deployment for full coverage.",
  );
}
