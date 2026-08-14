/**
 * Phase 2N slice 2N.5 — zero fixture residue, with a control that discriminates.
 *
 * ## The row this slice's fixtures leave that no earlier slice could
 *
 * 2N.5's journey plants rows in `entity_attachments`. That table has **no writer
 * in product code** — `authenticated` holds `SELECT` only, and the single insert
 * anywhere in the repository is M3's deletion undo restoring links that already
 * existed. So a row in it that is not a restoration **can only have come from a
 * harness**, which makes it the residue that matters here and the one an earlier
 * slice's probe would not have looked for.
 *
 * ## Why a marker check alone is vacuous, and what fixes it
 *
 * `entity_attachments` carries **no text column**. There is nothing to `ilike`,
 * so the residue can only be found by joining through the attachment that
 * carries the marker — and a probe that silently failed to join would read zero
 * against a table full of links. The control therefore plants **both** a linked
 * and an unlinked attachment under the same marker, and asserts the link probe
 * finds exactly one: the discrimination is what proves the join, not the count.
 *
 * ## Owner-scoped, never a global count
 *
 * Every assertion is on a marker unique to this slice's fixtures, or on the
 * `@example.com` domain RFC 2606 reserves. No assertion is "the table is empty".
 *
 * Report-only for anything it did not create: it names residue and exits
 * non-zero. The only rows it removes are its own control fixtures — and the
 * `finally` block removes them after a deliberately failed run too, which is the
 * second half of "prove cleanup after a failure".
 *
 * Usage: `node scripts/verify-phase-2n-slice-5-cleanup.mjs`
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/** The marker `e2e/online-phase-2n-library.spec.ts` writes into every name. */
const FIXTURE_MARKER = "2n5f41c8";

const ACCOUNT_PREFIXES = ["codex-2n5-"];

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();

const headers = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` };

const rest = (path, init = {}) =>
  fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, "content-type": "application/json", prefer: "return=representation", ...(init.headers ?? {}) },
  });

async function read(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`${path} read failed: ${response.status} ${await response.text()}`);
  return (await response.json()) ?? [];
}

async function countMatching(table, column, marker) {
  return (await read(`${table}?select=id&${column}=ilike.*${encodeURIComponent(marker)}*`)).length;
}

/**
 * The probe this slice needs: link rows reachable from a marked attachment.
 *
 * Two hops, because `entity_attachments` has no text of its own. A probe that
 * looked only at the link table would have to take a global count, which is the
 * wrong instrument and would report other owners' data.
 */
async function countLinksForMarkedAttachments(marker) {
  const attachments = await read(
    `attachments?select=id&original_name=ilike.*${encodeURIComponent(marker)}*`,
  );
  if (attachments.length === 0) return 0;
  const ids = attachments.map((row) => row.id).join(",");
  return (await read(`entity_attachments?select=id&attachment_id=in.(${ids})`)).length;
}

async function fixtureAccounts() {
  const response = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
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

console.log("\nPhase 2N slice 2N.5 — fixture residue\n");

console.log(`markers this slice's journey writes ("${FIXTURE_MARKER}")`);
record("attachments", await countMatching("attachments", "original_name", FIXTURE_MARKER), 0);
record("attachment_interpretations", await countMatching("attachment_interpretations", "description", FIXTURE_MARKER), 0);
record("people", await countMatching("people", "name", FIXTURE_MARKER), 0);
record("projects", await countMatching("projects", "name", FIXTURE_MARKER), 0);
record("entity_attachments reachable from a marked file", await countLinksForMarkedAttachments(FIXTURE_MARKER), 0);

console.log("\ndisposable accounts");
const accounts = await fixtureAccounts();
record(`accounts under ${ACCOUNT_PREFIXES.join(", ")}`, accounts.length, 0);
for (const email of accounts) console.log(`       residue: ${email}`);

// ---------------------------------------------------------------------------
// THE CONTROL. Everything above returns zero against an empty table too.
// ---------------------------------------------------------------------------
console.log("\ncontrol: the probe can see a planted link, and the cascade removes it");

const controlMarker = `residuecontrol2n5-${crypto.randomUUID()}`;
const controlEmail = `codex-2n5-control-${crypto.randomUUID()}@example.com`;
let controlUserId;

try {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ email: controlEmail, password: `Ctl!${crypto.randomUUID()}A7`, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`control account not created: ${created.status} ${await created.text()}`);
  controlUserId = (await created.json()).id;

  const person = await rest("people", {
    method: "POST",
    body: JSON.stringify({ user_id: controlUserId, name: `control ${controlMarker}`, notes: null }),
  });
  if (!person.ok) throw new Error(`control person not created: ${person.status} ${await person.text()}`);
  const personId = (await person.json())[0].id;

  /*
    Two attachments under one marker: one that will carry a link and one that
    will not. That asymmetry is what proves the two-hop probe actually joins —
    a probe that ignored its `attachment_id` filter would report 2 here, and a
    probe that never reached the link table would report 0.
  */
  const files = await rest("attachments", {
    method: "POST",
    body: JSON.stringify([
      {
        user_id: controlUserId,
        storage_path: `${controlUserId}/linked-${controlMarker}`,
        original_name: `linked ${controlMarker}`,
        mime_type: "application/pdf",
        size_bytes: 1024,
        status: "ready",
        sensitivity: "normal",
      },
      {
        user_id: controlUserId,
        storage_path: `${controlUserId}/plain-${controlMarker}`,
        original_name: `plain ${controlMarker}`,
        mime_type: "application/pdf",
        size_bytes: 1024,
        status: "ready",
        sensitivity: "normal",
      },
    ]),
  });
  if (!files.ok) throw new Error(`control attachments not created: ${files.status} ${await files.text()}`);
  const rows = await files.json();
  const linkedId = rows.find((row) => row.original_name.startsWith("linked")).id;

  /*
    The insert that only the service role can perform. It is also a live
    re-assertion of the slice's load-bearing measurement: `authenticated` holds
    no INSERT here, and the ownership trigger validates that the person belongs
    to the same owner. If a later migration changed either, this fails loudly
    rather than quietly certifying an empty set.
  */
  const link = await rest("entity_attachments", {
    method: "POST",
    body: JSON.stringify({
      user_id: controlUserId,
      attachment_id: linkedId,
      entity_type: "person",
      entity_id: personId,
    }),
  });
  if (!link.ok) throw new Error(`control link not created: ${link.status} ${await link.text()}`);

  // The steps a marker-only check can never perform.
  record("probe FINDS both planted attachments", await countMatching("attachments", "original_name", controlMarker), 2);
  record("link probe FINDS exactly the linked one", await countLinksForMarkedAttachments(controlMarker), 1);
  record("link probe IGNORES the unlinked one", await countLinksForMarkedAttachments(`plain ${controlMarker}`), 0);
  record("person probe FINDS the planted person", await countMatching("people", "name", controlMarker), 1);

  const deleted = await fetch(`${url}/auth/v1/admin/users/${controlUserId}`, { method: "DELETE", headers });
  if (!deleted.ok) throw new Error(`control account not deleted: ${deleted.status}`);
  controlUserId = undefined;

  // Deleting the ACCOUNT removed the DATA — what every spec's `afterAll`
  // silently relies on and none of them checks. `entity_attachments` cascades
  // twice over: from `auth.users` and from `attachments`.
  record("cascade removes both attachments", await countMatching("attachments", "original_name", controlMarker), 0);
  record("cascade removes the link", await countLinksForMarkedAttachments(controlMarker), 0);
  record("cascade removes the person", await countMatching("people", "name", controlMarker), 0);
} finally {
  if (controlUserId) {
    // The control must not become the residue. This is also the "cleanup after
    // a deliberately failed run" proof: throw anywhere above and the account
    // still goes.
    await fetch(`${url}/auth/v1/admin/users/${controlUserId}`, { method: "DELETE", headers });
    console.log("  (control account removed after a failure)");
  }
}

console.log("");
if (failures.length) {
  console.error(`FAILED: ${failures.length} check(s) — ${failures.join("; ")}\n`);
  process.exit(1);
}
console.log("zero fixture residue, with a non-vacuous control\n");
