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

for (const table of ownedTables) {
  let orphanCount = 0;
  for (let offset = 0; ; offset += 1_000) {
    const result = await admin.from(table).select("user_id").range(offset, offset + 999);
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
  if (!missingTables.includes(table)) orphanCounts[table] = orphanCount;
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
  productEvents: "verified by the product-events owner token after Auth deletion",
  storageObjects,
  remoteSmokeObjects,
};

if (disposableUsers.length > 0 || Object.values(orphanCounts).some(Boolean) || remoteSmokeObjects > 0) {
  throw new Error(`Disposable Phase 2E smoke data remains in the linked project: ${JSON.stringify(result)}`);
}

console.log("Phase 2E cleanup verification passed:", result);
if (missingTables.length > 0) {
  console.log(
    `Note: ${missingTables.length} Phase 2E table(s) are absent because migrations `
    + "202607250055-202607280061 are not deployed. Re-run after deployment for full coverage.",
  );
}
