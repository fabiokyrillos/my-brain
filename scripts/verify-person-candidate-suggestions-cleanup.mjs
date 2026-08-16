import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
const headers = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` };
const prefix = "codex-person-candidate-";

const usersResponse = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers });
if (!usersResponse.ok) throw new Error(`could not list users: ${usersResponse.status}`);
const users = ((await usersResponse.json()).users ?? []).filter((user) => user.email?.toLowerCase().startsWith(prefix));
for (const user of users) {
  const removed = await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers });
  if (!removed.ok) throw new Error(`could not remove ${user.email}: ${removed.status}`);
}

const verifyResponse = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers });
if (!verifyResponse.ok) throw new Error(`could not verify users: ${verifyResponse.status}`);
const remaining = ((await verifyResponse.json()).users ?? []).filter((user) => user.email?.toLowerCase().startsWith(prefix));
if (remaining.length > 0) throw new Error(`person candidate fixture accounts remain: ${remaining.map((user) => user.email).join(", ")}`);
console.log(`person candidate cleanup: PASS (${users.length} fixture account(s) removed)`);
