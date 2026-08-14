/**
 * Phase 2N slice 2N.4 — zero fixture residue, with a control that is not vacuous.
 *
 * ## What is different here, and why it needs its own control
 *
 * 2N.3's script proved the probe can see a planted memory and that deleting the
 * account removes it. This slice's fixtures are memories too — but they are
 * memories **with a validity window**, and the projection that reads them
 * filters on `valid_from is not null and valid_until is not null` in SQL.
 *
 * That makes a marker-only check doubly vacuous here. It would return zero
 * against an empty table, as always; and a probe that read only `content` would
 * also return zero if the *columns this slice writes* were never written at all
 * — which is precisely the fixture shape whose residue matters, because
 * `memories.valid_from` has no writer anywhere in the product and a row carrying
 * one can only have come from a test.
 *
 * So the control plants a memory **with an inverted window**, asserts the probe
 * finds it **by that window and not only by its text**, then deletes only the
 * account and asserts it is gone.
 *
 * ## Owner-scoped, never a global count
 *
 * Every assertion is on a marker unique to this slice's fixtures, or on the
 * `@example.com` domain RFC 2606 reserves. No assertion is "the table is empty":
 * `product_events` is unreadable to `service_role`, and a global count would be
 * the wrong instrument even where it can be taken.
 *
 * Report-only for anything it did not create: it names residue and exits
 * non-zero. The only rows it removes are its own control fixtures — and the
 * `finally` block removes them after a deliberately failed run too, which is the
 * second half of "prove cleanup after a failure".
 *
 * Usage: `node scripts/verify-phase-2n-slice-4-cleanup.mjs`
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/** The markers `e2e/online-phase-2n-conflicts.spec.ts` writes, verbatim. */
const MEMORY_MARKERS = [
  "Memoria 2n4 com janela invertida a71f0c",
  "Memoria 2n4 com janela coerente 3e92bd",
  "Memoria 2n4 de outra conta 5c40ae",
];

const ACCOUNT_PREFIXES = ["codex-2n4-"];

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

/**
 * The probe that matters for this slice: rows carrying BOTH halves of a window.
 *
 * Scoped to the marker as well, so it can never report another owner's data —
 * and so a stray row from some future feature that legitimately writes
 * `valid_from` does not become this script's problem.
 */
async function countWindowed(marker) {
  const response = await fetch(
    `${url}/rest/v1/memories?select=id,valid_from,valid_until&content=ilike.*${encodeURIComponent(marker)}*`
      + "&valid_from=not.is.null&valid_until=not.is.null",
    { headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!response.ok) throw new Error(`windowed read failed: ${response.status} ${await response.text()}`);
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

console.log("\nPhase 2N slice 2N.4 — fixture residue\n");

console.log("markers this slice's journey writes");
for (const marker of MEMORY_MARKERS) {
  record(`memories ~ "${marker}"`, await countMatching("memories", "content", marker), 0);
  record(`  ...and none carries a validity window`, await countWindowed(marker), 0);
}

console.log("\ndisposable accounts");
const accounts = await fixtureAccounts();
record(`accounts under ${ACCOUNT_PREFIXES.join(", ")}`, accounts.length, 0);
for (const email of accounts) console.log(`       residue: ${email}`);

// ---------------------------------------------------------------------------
// THE CONTROL. Everything above returns zero against an empty table too.
// ---------------------------------------------------------------------------
console.log("\ncontrol: the probe can see a windowed memory, and the cascade removes it");

const controlMarker = `residuecontrol2n4-${crypto.randomUUID()}`;
const controlEmail = `codex-2n4-control-${crypto.randomUUID()}@example.com`;
let controlUserId;

try {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
    body: JSON.stringify({ email: controlEmail, password: `Ctl!${crypto.randomUUID()}A7`, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`control account not created: ${created.status} ${await created.text()}`);
  controlUserId = (await created.json()).id;

  /*
    Planted with the SAME fault the journey plants — an inverted window — so the
    control is subject to the same mechanism as the thing it certifies. A
    control that planted a plain memory would leave `countWindowed` untested,
    and `countWindowed` is the probe that discriminates here.

    This insert is also a live re-assertion of the measured asymmetry: it
    succeeds because `public.memories` carries no validity CHECK. If a later
    migration adds one, this fails loudly rather than quietly certifying an
    empty set.
  */
  const seeded = await rest("memories", {
    method: "POST",
    body: JSON.stringify({
      user_id: controlUserId,
      content: `control ${controlMarker}`,
      kind: "fact",
      sensitivity: "normal",
      valid_from: "2026-09-01T12:00:00.000Z",
      valid_until: "2026-08-01T12:00:00.000Z",
    }),
  });
  if (!seeded.ok) throw new Error(`control memory not created: ${seeded.status} ${await seeded.text()}`);

  // A second row WITHOUT a window, so the windowed probe is proved to
  // discriminate rather than simply to match the marker. Without this, a
  // `countWindowed` that silently ignored its filter would still read 1.
  const plain = await rest("memories", {
    method: "POST",
    body: JSON.stringify({
      user_id: controlUserId,
      content: `controlplain ${controlMarker}`,
      kind: "fact",
      sensitivity: "normal",
      valid_from: null,
      valid_until: null,
    }),
  });
  if (!plain.ok) throw new Error(`control plain memory not created: ${plain.status} ${await plain.text()}`);

  // The steps a marker-only check can never perform.
  record("probe FINDS both planted memories", await countMatching("memories", "content", controlMarker), 2);
  record("windowed probe FINDS the inverted one", await countWindowed(`control ${controlMarker}`), 1);
  record("windowed probe IGNORES the one with no window", await countWindowed(`controlplain ${controlMarker}`), 0);

  const deleted = await fetch(`${url}/auth/v1/admin/users/${controlUserId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!deleted.ok) throw new Error(`control account not deleted: ${deleted.status}`);
  controlUserId = undefined;

  // Deleting the ACCOUNT removed the DATA — what every spec's `afterAll`
  // silently relies on and none of them checks.
  record("cascade removes both memories with the account", await countMatching("memories", "content", controlMarker), 0);
  record("cascade removes the windowed one", await countWindowed(`control ${controlMarker}`), 0);
} finally {
  if (controlUserId) {
    // The control must not become the residue. This is also the "cleanup after
    // a deliberately failed run" proof: throw anywhere above and the account
    // still goes.
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
