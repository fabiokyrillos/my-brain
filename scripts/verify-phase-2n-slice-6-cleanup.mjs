/**
 * Phase 2N slice 2N.6 — zero fixture residue, with a control that discriminates.
 *
 * ## The rows this slice's fixtures leave that no earlier probe looks for
 *
 * 2N.6's journey plants relation rows — `person_relationships`, `person_projects`
 * and `person_contexts` — and one `audit_logs` row, because the surface's origin
 * proof reads that table. **None of the three relation tables carries a text
 * column a marker could be written into**, so there is nothing to `ilike`: the
 * residue can only be reached by joining through the `people` row that carries
 * the marker.
 *
 * A probe that silently failed to join would read **zero against a table full of
 * relations** and certify a clean database. So the control plants **two** marked
 * people and gives **one** of them a relationship, then requires the probe to
 * find exactly one. The discrimination proves the join; the count never could.
 *
 * ## The audit row is looked for directly, and that is deliberate
 *
 * `audit_logs.entity_id` carries **no foreign key** — it is a bare uuid. So a
 * probe reaching audit rows *through* the association would go blind the moment
 * the association was gone, and an audit row that outlived its subject is
 * precisely the residue worth naming. The journey writes the marker into
 * `reason` so this can be a direct read.
 *
 * ## Owner-scoped, never a global count
 *
 * Every assertion is on a marker unique to this slice's fixtures, or on the
 * `@example.com` domain RFC 2606 reserves. **No assertion is "the table is
 * empty"** — the owner's own relations are none of this script's business.
 *
 * Report-only for anything it did not create: it names residue and exits
 * non-zero. The only rows it removes are its own control fixtures, and the
 * `finally` block removes them after a deliberately failed run too — the second
 * half of "prove cleanup after a failure".
 *
 * Usage: `node scripts/verify-phase-2n-slice-6-cleanup.mjs`
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/** The marker `e2e/online-phase-2n-relations.spec.ts` writes into every name. */
const FIXTURE_MARKER = "2n6b73e5";

const ACCOUNT_PREFIXES = ["codex-2n6-"];

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
 * The probe this slice needs: relation rows reachable from a marked person.
 *
 * Two hops, because none of the three relation tables has text of its own. A
 * probe that looked only at the relation table would have to take a global
 * count, which is the wrong instrument and would report other owners' data.
 */
async function countRelationsForMarkedPeople(table, marker) {
  const people = await read(`people?select=id&name=ilike.*${encodeURIComponent(marker)}*`);
  if (people.length === 0) return 0;
  const ids = people.map((row) => row.id).join(",");
  return (await read(`${table}?select=id&person_id=in.(${ids})`)).length;
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

console.log("\nPhase 2N slice 2N.6 — fixture residue\n");

console.log(`markers this slice's journey writes ("${FIXTURE_MARKER}")`);
record("people", await countMatching("people", "name", FIXTURE_MARKER), 0);
record("projects", await countMatching("projects", "name", FIXTURE_MARKER), 0);
record("contexts", await countMatching("contexts", "name", FIXTURE_MARKER), 0);
record("organizations", await countMatching("organizations", "name", FIXTURE_MARKER), 0);
record("person_relationships (by description)", await countMatching("person_relationships", "description", FIXTURE_MARKER), 0);
record("person_projects (by role)", await countMatching("person_projects", "role", FIXTURE_MARKER), 0);
record("audit_logs (by reason)", await countMatching("audit_logs", "reason", FIXTURE_MARKER), 0);
record(
  "person_relationships reachable from a marked person",
  await countRelationsForMarkedPeople("person_relationships", FIXTURE_MARKER),
  0,
);
record(
  "person_projects reachable from a marked person",
  await countRelationsForMarkedPeople("person_projects", FIXTURE_MARKER),
  0,
);
record(
  "person_contexts reachable from a marked person",
  await countRelationsForMarkedPeople("person_contexts", FIXTURE_MARKER),
  0,
);

console.log("\ndisposable accounts");
const accounts = await fixtureAccounts();
record(`accounts under ${ACCOUNT_PREFIXES.join(", ")}`, accounts.length, 0);
for (const email of accounts) console.log(`       residue: ${email}`);

// ---------------------------------------------------------------------------
// THE CONTROL. Everything above returns zero against an empty table too.
// ---------------------------------------------------------------------------
console.log("\ncontrol: the probe can see a planted relation, and the cascade removes it");

const controlMarker = `residuecontrol2n6-${crypto.randomUUID()}`;
const controlEmail = `codex-2n6-control-${crypto.randomUUID()}@example.com`;
let controlUserId;

try {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ email: controlEmail, password: `Ctl!${crypto.randomUUID()}A7`, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`control account not created: ${created.status} ${await created.text()}`);
  controlUserId = (await created.json()).id;

  /*
    Two people under one marker: one that will carry a relationship and one that
    will not. That asymmetry is what proves the two-hop probe actually joins —
    a probe that ignored its `person_id` filter would report 2 here, and a probe
    that never reached the relation table would report 0.
  */
  const people = await rest("people", {
    method: "POST",
    body: JSON.stringify([
      { user_id: controlUserId, name: `related ${controlMarker}`, notes: null },
      { user_id: controlUserId, name: `lonely ${controlMarker}`, notes: null },
    ]),
  });
  if (!people.ok) throw new Error(`control people not created: ${people.status} ${await people.text()}`);
  const rows = await people.json();
  const relatedId = rows.find((row) => row.name.startsWith("related")).id;
  const lonelyId = rows.find((row) => row.name.startsWith("lonely")).id;

  const relationship = await rest("person_relationships", {
    method: "POST",
    body: JSON.stringify({
      user_id: controlUserId,
      person_id: relatedId,
      related_person_id: null,
      relationship_type: "colleague",
      description: `control ${controlMarker}`,
      confidence: 1,
    }),
  });
  if (!relationship.ok) {
    throw new Error(`control relationship not created: ${relationship.status} ${await relationship.text()}`);
  }

  /*
    And the audit row, which is the fixture the surface's origin proof reads.
    It is planted with the SERVICE ROLE, which is not what the product does —
    the product writes it as `authenticated` from its own Server Action. This
    proves the probe, not the write path, and nothing here should be read as
    evidence about how a real audit row arrives.
  */
  const audit = await rest("audit_logs", {
    method: "POST",
    body: JSON.stringify({
      user_id: controlUserId,
      action_type: "associate_person_project",
      entity_type: "person_project",
      entity_id: crypto.randomUUID(),
      actor: "user",
      after_state: {},
      reason: `control ${controlMarker}`,
    }),
  });
  if (!audit.ok) throw new Error(`control audit row not created: ${audit.status} ${await audit.text()}`);

  // The steps a marker-only check can never perform.
  record("probe FINDS both planted people", await countMatching("people", "name", controlMarker), 2);
  record(
    "relation probe FINDS exactly the related one",
    await countRelationsForMarkedPeople("person_relationships", controlMarker),
    1,
  );
  record(
    "relation probe IGNORES the unrelated one",
    await countRelationsForMarkedPeople("person_relationships", `lonely ${controlMarker}`),
    0,
  );
  record("audit probe FINDS the planted row", await countMatching("audit_logs", "reason", controlMarker), 1);

  // Named so an unused binding is not mistaken for a forgotten assertion: the
  // lonely person exists to be ignored, and its id is what proves it was real.
  if (!lonelyId) throw new Error("the control's second person was not created");

  const deleted = await fetch(`${url}/auth/v1/admin/users/${controlUserId}`, { method: "DELETE", headers });
  if (!deleted.ok) throw new Error(`control account not deleted: ${deleted.status}`);
  controlUserId = undefined;

  /*
    Deleting the ACCOUNT removed the DATA — what every spec's `afterAll` silently
    relies on and none of them checks. It matters more here than it looks:
    `audit_logs.entity_id` has no foreign key, so that row survives its subject
    and is removed only by the `auth.users` cascade.
  */
  record("cascade removes both people", await countMatching("people", "name", controlMarker), 0);
  record(
    "cascade removes the relationship",
    await countRelationsForMarkedPeople("person_relationships", controlMarker),
    0,
  );
  record("cascade removes the audit row", await countMatching("audit_logs", "reason", controlMarker), 0);
} finally {
  if (controlUserId) {
    await fetch(`${url}/auth/v1/admin/users/${controlUserId}`, { method: "DELETE", headers }).catch(() => {});
    console.log("  note: the control account was removed by the failure path");
  }
}

console.log("");
if (failures.length > 0) {
  console.error(`RESIDUE OR CONTROL FAILURE (${failures.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Zero residue, and the probe was proved able to find some.");
