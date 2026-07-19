import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const credentials = getLinkedSupabaseCredentials();
const admin = createClient(credentials.url, credentials.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const disposablePrefixes = [
  "phase-2a-jobs-",
  "phase-2b-revisions-",
  "phase-2x-entry-jobs-",
  "phase-2x-events-",
  "phase-2x-daily-cycle-",
  "sprint-1-5-",
  "codex-",
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

for (const table of ["entries", "jobs", "attachments", "pending_questions", "tasks"]) {
  let orphanCount = 0;
  for (let offset = 0; ; offset += 1_000) {
    const result = await admin.from(table).select("user_id").range(offset, offset + 999);
    if (result.error) throw new Error(`${table}: ${result.error.code ?? "unknown"}`);
    orphanCount += result.data.filter((row) => row.user_id && !currentUserIds.has(row.user_id)).length;
    if (result.data.length < 1_000) break;
  }
  orphanCounts[table] = orphanCount;
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
  productEvents: "verified by the product-events owner token after Auth deletion",
  storageObjects,
  remoteSmokeObjects,
};

if (disposableUsers.length > 0 || Object.values(orphanCounts).some(Boolean) || remoteSmokeObjects > 0) {
  throw new Error("Disposable Phase 2X smoke data remains in the linked project");
}

console.log("Phase 2X cleanup verification passed:", result);
