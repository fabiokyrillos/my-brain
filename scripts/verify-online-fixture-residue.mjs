/**
 * Zero fixture residue, measured rather than asserted.
 *
 * Every `e2e/online-*.spec.ts` creates a disposable account in `beforeAll` and
 * deletes it in `afterAll`. That is the claim; this is the check. It matters
 * more than it looks: a spec that fails *between* those hooks — a worker
 * crash, an interrupted run, a `beforeAll` that threw after the account was
 * created — leaves an account behind, and a hosted project quietly accumulating
 * abandoned users is both a privacy surface and a slow corruption of every
 * count anyone takes from it.
 *
 * **Report-only, deliberately.** It names what it found and exits non-zero; it
 * removes nothing. Deleting accounts on a deployed project is an operator
 * action with an operator's authorization behind it, and a script that both
 * detects and destroys is one bad predicate away from being the incident.
 * `scripts/account-lifecycle-admin.mjs` is where removal lives.
 *
 * Usage: `npm run verify:online-residue`
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/**
 * What a fixture account looks like.
 *
 * `@example.com` is reserved by RFC 2606 and can never be a real address, which
 * is why every online spec uses it and why it is safe to treat a match as
 * disposable. A real account cannot land here by accident.
 */
const FIXTURE_DOMAIN = "@example.com";

export function isFixtureAccount(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(FIXTURE_DOMAIN);
}

async function listUsers(url, serviceRoleKey) {
  const users = [];
  // Paginated: a residue check that reads only the first page would report zero
  // for exactly the situation it exists to catch.
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(
      `${url}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!response.ok) {
      throw new Error(`admin/users refused: ${response.status}`);
    }
    const body = await response.json();
    const batch = Array.isArray(body?.users) ? body.users : [];
    users.push(...batch);
    if (batch.length === 0) break;
  }
  return users;
}

export async function main() {
  const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
  const users = await listUsers(url, serviceRoleKey);
  const residue = users.filter((user) => isFixtureAccount(user?.email));

  console.log(`accounts on the project : ${users.length}`);
  console.log(`fixture residue         : ${residue.length}`);
  for (const user of residue) {
    // The id and the creation time, never anything else about the account.
    console.log(`  - ${user.id} created ${user.created_at}`);
  }

  if (residue.length > 0) {
    console.error(
      "\nAbandoned fixture accounts remain. They are not removed here on purpose —"
      + "\nremoval is an operator action (scripts/account-lifecycle-admin.mjs).",
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nzero fixture residue");
}

await main();
