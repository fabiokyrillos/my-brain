/**
 * Phase 2N slice 2N.3 — zero fixture residue, with a control that is not vacuous.
 *
 * ## Why this script exists rather than a query
 *
 * The obvious check is "count the rows matching each fixture marker; expect
 * zero". Run against this project it returns zero for every marker — and it
 * returns zero **whether or not the cleanup worked**, because `public.memories`
 * currently holds no rows at all. An assertion satisfied by an empty table is
 * satisfied by a broken probe, a revoked grant and a typo in the marker, and
 * this repository has already recorded what that costs: a control that is not
 * subject to the same mechanism produces a confident wrong verdict.
 *
 * So this does a **round trip**, and the round trip is the point:
 *
 *   1. create a disposable account and give it a memory carrying a marker that
 *      exists nowhere else;
 *   2. **assert the probe FINDS it** — this is the non-vacuity proof, and it is
 *      the step a marker-only check can never perform;
 *   3. delete **only the account**;
 *   4. assert the probe now finds nothing — which proves the `on delete
 *      cascade` really removes the owned rows, not merely the login.
 *
 * Step 4 is also the answer to "prove cleanup after a deliberately failed run":
 * every online spec relies on that cascade in `afterAll`, and a spec that dies
 * between hooks leaves the account for `verify:online-residue` to name. What
 * neither of those proves is that removing the account removes the DATA. This
 * does.
 *
 * ## Owner-scoped, never a global count
 *
 * Every assertion is on a marker unique to this slice's fixtures, or on the
 * `@example.com` domain RFC 2606 reserves. No assertion is "the table is
 * empty" — `product_events` is unreadable to `service_role` and a global count
 * would be the wrong instrument even where it can be taken.
 *
 * Report-only for anything it did not create: it names residue and exits
 * non-zero. The only rows it removes are its own control fixtures.
 *
 * Usage: `node scripts/verify-phase-2n-slice-3-cleanup.mjs`
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/** The markers `e2e/online-phase-2n-knowledge.spec.ts` writes, verbatim. */
const MEMORY_MARKERS = [
  "Revisao mensal combinada d41f7a",
  "Acordo antigo sem registro b93c15",
  "Memoria 2n3 que sera arquivada",
  "Memoria 2n3 que permanece em vigor",
];
const ENTRY_MARKERS = ["Conversa sobre revisao mensal 7c2e88", "Registro 2n3 que sera apagado a05f31"];
/** `phase_2n_validity_aware_retrieval.sql` is transactional and rolls back; a hit here means it did not. */
const PGTAP_MARKER = "vigenciaphrase";
const ACCOUNT_PREFIXES = ["codex-2n0-", "codex-2n1-", "codex-2n2-", "codex-2n3-", "codex-memories-"];

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();

const rest = (path, init = {}) =>
  fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });

async function countMatching(table, column, marker) {
  const response = await fetch(
    `${url}/rest/v1/${table}?select=id&${column}=ilike.*${encodeURIComponent(marker)}*`,
    { headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!response.ok) throw new Error(`${table} read failed: ${response.status} ${await response.text()}`);
  return ((await response.json()) ?? []).length;
}

async function fixtureAccounts() {
  const response = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) throw new Error(`admin/users failed: ${response.status}`);
  const users = (await response.json())?.users ?? [];
  return users
    .map((user) => user?.email)
    .filter((email) => typeof email === "string")
    .filter((email) => ACCOUNT_PREFIXES.some((prefix) => email.toLowerCase().startsWith(prefix)));
}

const failures = [];
const record = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${actual} (expected ${expected})`);
  if (!ok) failures.push(label);
};

console.log("\nPhase 2N slice 2N.3 — fixture residue\n");

console.log("markers this slice's journeys write");
for (const marker of MEMORY_MARKERS) {
  record(`memories ~ "${marker}"`, await countMatching("memories", "content", marker), 0);
}
for (const marker of ENTRY_MARKERS) {
  record(`entries ~ "${marker}"`, await countMatching("entries", "original_content", marker), 0);
}
record(
  `memories ~ "${PGTAP_MARKER}" (the pgTAP suite must have rolled back)`,
  await countMatching("memories", "content", PGTAP_MARKER),
  0,
);

console.log("\ndisposable accounts");
const accounts = await fixtureAccounts();
record(`accounts under ${ACCOUNT_PREFIXES.join(", ")}`, accounts.length, 0);
for (const email of accounts) console.log(`       residue: ${email}`);

// ---------------------------------------------------------------------------
// THE CONTROL. Everything above returns zero against an empty table too.
// ---------------------------------------------------------------------------
console.log("\ncontrol: the probe can see residue, and the cascade removes it");

const controlMarker = `residuecontrol-${crypto.randomUUID()}`;
const controlEmail = `codex-2n3-control-${crypto.randomUUID()}@example.com`;
let controlUserId;

try {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
    body: JSON.stringify({ email: controlEmail, password: `Ctl!${crypto.randomUUID()}A7`, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`control account not created: ${created.status} ${await created.text()}`);
  controlUserId = (await created.json()).id;

  const seeded = await rest("memories", {
    method: "POST",
    body: JSON.stringify({
      user_id: controlUserId,
      content: `control ${controlMarker}`,
      kind: "fact",
      sensitivity: "normal",
    }),
  });
  if (!seeded.ok) throw new Error(`control memory not created: ${seeded.status} ${await seeded.text()}`);

  // The step a marker-only check cannot perform.
  record("probe FINDS a planted memory", await countMatching("memories", "content", controlMarker), 1);

  const deleted = await fetch(`${url}/auth/v1/admin/users/${controlUserId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!deleted.ok) throw new Error(`control account not deleted: ${deleted.status}`);
  controlUserId = undefined;

  // Deleting the ACCOUNT removed the DATA — which is what every spec's
  // `afterAll` silently relies on.
  record("cascade removes it with the account", await countMatching("memories", "content", controlMarker), 0);
} finally {
  if (controlUserId) {
    // The control must not become the residue.
    await fetch(`${url}/auth/v1/admin/users/${controlUserId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    });
    console.log("  (control account removed after a failure)");
  }
}

console.log("");
if (failures.length) {
  console.error(`FAILED: ${failures.length} check(s) — ${failures.join("; ")}\n`);
  process.exit(1);
}
console.log("zero fixture residue, with a non-vacuous control\n");
