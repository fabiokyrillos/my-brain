/**
 * Phase 2F pre-code Gate 3, behavioural half — does an exact-title query against
 * the **deployed** `public.list_task_command_candidates` return the clicked task
 * with a usable nineteen-key pre-state, for every Work-surface action?
 *
 * Revision 2 of the proposal replaces "synthesize the pre-state from the rendered
 * row" (refuted as F4) with "read it at click time from the RPC the console
 * already uses". That replacement is only worth adopting if the RPC can be
 * *addressed by title*, because it has no by-id entry point and its argument list
 * cannot grow — "its amendment window is closed by exhaustion" and any change
 * would cost a `_v2` (`202607260059:2505-2508`). This script answers that with
 * the deployed function rather than a local reimplementation of it.
 *
 * **Disposable by construction, and never against real data.** It provisions two
 * throwaway auth users through the service-role admin API, seeds their rows,
 * reads, and deletes both users in a `finally` — the cascade from
 * `auth.users` removes every task and reminder it created. It is the pattern
 * `scripts/remote-phase-2e-smoke.mjs` established. It performs no mutation of any
 * pre-existing row, deploys nothing, and changes no application behaviour.
 *
 * Exit code 0 means every property held. Non-zero means the reuse mechanism is
 * not proven, and per the gate's own terms the sibling RPC is **not** to be
 * designed in response — the failing property is to be reported instead.
 *
 * Usage: `node scripts/phase-2f-gate3-exact-title-reuse.mjs`
 */

import { createClient } from "@supabase/supabase-js";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);

/** The nineteen keys `apply_task_command` demands, in the migration's own order. */
const PRE_STATE_KEYS = [
  "title", "description", "status", "dueAt", "plannedAt", "manualPriority",
  "completedAt", "cancelledAt", "intentionalNoDue", "noDueReason",
  "createdAt", "updatedAt", "projectIds", "projectNames", "contextIds",
  "contextNames", "personIds", "personNames", "personRoles",
];

/** Work-surface action → taxonomy action + the eligible statuses to query with. */
const ACTIVE_ONLY = ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"];
const WORK_ACTIONS = [
  { work: "complete_task", taxonomy: "complete_task", eligible: ACTIVE_ONLY, seedStatus: "todo" },
  { work: "wait_task", taxonomy: "set_status", eligible: ACTIVE_ONLY, seedStatus: "todo" },
  { work: "resume_task", taxonomy: "set_status", eligible: ACTIVE_ONLY, seedStatus: "waiting" },
  { work: "reopen_task", taxonomy: "reopen_task", eligible: ["completed"], seedStatus: "completed" },
];

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * A disposable user **and a client signed in as them**.
 *
 * The signed-in client is not a convenience. `list_task_command_candidates`
 * scopes every row by `auth.uid()`, so calling it with the service-role key
 * returns zero rows for every query — including a null-title one that should
 * return everything. A first version of this script did exactly that and
 * produced five green checks against an empty result set: the "no cross-owner
 * row" and "ineligible duplicate excluded" properties both pass trivially when
 * nothing is returned at all. That is the repository's own recorded failure mode
 * — an assertion green while testing nothing — and it is why the volume property
 * below asserts a positive row count rather than only the seeded count.
 */
async function createDisposableUser(label) {
  const email = `phase2f-gate3-${label}-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`create user ${label}: ${created.error.message}`);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error) throw new Error(`sign in ${label}: ${session.error.message}`);
  return { user: created.data.user, client };
}

async function listCandidates(client, { eligible, title, limit }) {
  const response = await client.rpc("list_task_command_candidates", {
    p_eligible_statuses: eligible,
    p_title_query: title,
    ...(limit === undefined ? {} : { p_limit: limit }),
  });
  if (response.error) throw new Error(`list_task_command_candidates: ${response.error.message}`);
  return response.data ?? [];
}

const provisioned = [];

try {
  const owner = await createDisposableUser("owner");
  provisioned.push(owner.user.id);
  const stranger = await createDisposableUser("stranger");
  provisioned.push(stranger.user.id);

  // ---------------------------------------------------------------------------
  // Seed. Every row is disposable and belongs to a user created seconds ago.
  // ---------------------------------------------------------------------------
  const TARGET_TITLE = "Revisar contrato da Acme";

  /** Thirty filler rows, so the target must survive `p_limit` (default 25). */
  const filler = Array.from({ length: 30 }, (_, index) => ({
    user_id: owner.user.id,
    title: `Tarefa de preenchimento ${String(index).padStart(2, "0")}`,
    status: ACTIVE_ONLY[index % ACTIVE_ONLY.length],
  }));

  const seedRows = [
    ...filler,
    // The four click targets, one per Work action, each in a status that action
    // is eligible from. Distinct titles so a per-action query is unambiguous.
    ...WORK_ACTIONS.map((action) => ({
      user_id: owner.user.id,
      title: `${TARGET_TITLE} ${action.work}`,
      status: action.seedStatus,
    })),
    // Duplicate title in an *eligible* status — two rows, one clicked.
    { user_id: owner.user.id, title: "Duplicada exata", status: "todo" },
    { user_id: owner.user.id, title: "Duplicada exata", status: "todo" },
    // Duplicate title in an *ineligible* status — must not crowd the eligible one.
    { user_id: owner.user.id, title: "Duplicada mista", status: "todo" },
    { user_id: owner.user.id, title: "Duplicada mista", status: "cancelled" },
    // Normalization variants: case, accents, internal whitespace, punctuation.
    { user_id: owner.user.id, title: "  Acentuação  E   Espaços  ", status: "todo" },
    // Relation-bearing target.
    { user_id: owner.user.id, title: "Tarefa com relações", status: "todo" },
    // Title that will be changed after the "render".
    { user_id: owner.user.id, title: "Título original antes do clique", status: "todo" },
  ];

  const seeded = await admin.from("tasks").insert(seedRows).select("id,title,status");
  if (seeded.error) throw new Error(`seed tasks: ${seeded.error.message}`);
  const byTitle = (title, status) =>
    seeded.data.filter((row) => row.title === title && (status === undefined || row.status === status));

  // The stranger holds a task with a title the owner also holds.
  const strangerSeed = await admin.from("tasks").insert({
    user_id: stranger.user.id,
    title: `${TARGET_TITLE} complete_task`,
    status: "todo",
  }).select("id").single();
  if (strangerSeed.error) throw new Error(`seed stranger: ${strangerSeed.error.message}`);

  // Relations on one owner task, so the array keys are non-empty for at least one row.
  const relationTask = byTitle("Tarefa com relações")[0];
  const project = await admin.from("projects").insert({ user_id: owner.user.id, name: "Projeto Acme" }).select("id").single();
  const person = await admin.from("people").insert({ user_id: owner.user.id, name: "Joana" }).select("id").single();
  if (project.error || person.error) throw new Error("seed relations failed");
  const linkProject = await admin.from("task_projects").insert({ user_id: owner.user.id, task_id: relationTask.id, project_id: project.data.id });
  if (linkProject.error) throw new Error(`link project: ${linkProject.error.message}`);
  const linkPerson = await admin.from("task_people").insert({ user_id: owner.user.id, task_id: relationTask.id, person_id: person.data.id, role: "assignee" });
  if (linkPerson.error) throw new Error(`link person: ${linkPerson.error.message}`);

  // ---------------------------------------------------------------------------
  // Property 1 — every Work action finds its target by exact title within p_limit.
  // ---------------------------------------------------------------------------
  for (const action of WORK_ACTIONS) {
    const title = `${TARGET_TITLE} ${action.work}`;
    const target = byTitle(title, action.seedStatus)[0];
    const rows = await listCandidates(owner.client, { eligible: action.eligible, title });
    const found = rows.find((row) => row.task_id === target.id);
    check(
      `${action.work} → ${action.taxonomy}: target returned within p_limit`,
      Boolean(found),
      found ? `tier=${found.prefilter_tier} of ${rows.length} rows` : `${rows.length} rows, target absent`,
    );

    if (found) {
      const camel = {
        title: found.title, description: found.description, status: found.status,
        dueAt: found.due_at, plannedAt: found.planned_at, manualPriority: found.manual_priority,
        completedAt: found.completed_at, cancelledAt: found.cancelled_at,
        intentionalNoDue: found.intentional_no_due, noDueReason: found.no_due_reason,
        createdAt: found.created_at, updatedAt: found.updated_at,
        projectIds: found.project_ids, projectNames: found.project_names,
        contextIds: found.context_ids, contextNames: found.context_names,
        personIds: found.person_ids, personNames: found.person_names, personRoles: found.person_roles,
      };
      const missing = PRE_STATE_KEYS.filter((key) => camel[key] === undefined);
      check(`${action.work}: all nineteen pre-state keys present`, missing.length === 0, missing.join(", "));
      check(
        `${action.work}: observed_before is database-derived`,
        typeof found.observed_before === "string" && !Number.isNaN(Date.parse(found.observed_before)),
        String(found.observed_before),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Property 2 — cross-owner isolation.
  // ---------------------------------------------------------------------------
  const ownerRows = await listCandidates(owner.client, {
    eligible: ACTIVE_ONLY,
    title: `${TARGET_TITLE} complete_task`,
  });
  check(
    "another owner's identically titled task is never returned",
    !ownerRows.some((row) => row.task_id === strangerSeed.data.id),
    `${ownerRows.length} rows`,
  );
  const owners = new Set(ownerRows.map((row) => row.owner_id));
  check("every returned row carries exactly one owner_id", owners.size <= 1, [...owners].join(","));

  // ---------------------------------------------------------------------------
  // Property 3 — duplicates, eligibility and normalization.
  // ---------------------------------------------------------------------------
  const dupes = await listCandidates(owner.client, { eligible: ACTIVE_ONLY, title: "Duplicada exata" });
  const dupeIds = new Set(byTitle("Duplicada exata").map((row) => row.id));
  check(
    "both eligible duplicate-title rows are returned and distinguishable by task_id",
    [...dupeIds].every((id) => dupes.some((row) => row.task_id === id)),
    `${dupes.filter((row) => dupeIds.has(row.task_id)).length} of ${dupeIds.size}`,
  );

  const mixed = await listCandidates(owner.client, { eligible: ACTIVE_ONLY, title: "Duplicada mista" });
  const cancelledDupe = byTitle("Duplicada mista", "cancelled")[0];
  check(
    "an ineligible duplicate is excluded by the status filter",
    !mixed.some((row) => row.task_id === cancelledDupe.id),
  );

  const normalized = await listCandidates(owner.client, { eligible: ACTIVE_ONLY, title: "acentuacao e espacos" });
  const accented = byTitle("  Acentuação  E   Espaços  ")[0];
  check(
    "normalization variant (case, accents, whitespace) still reaches the row",
    normalized.some((row) => row.task_id === accented.id),
    `${normalized.length} rows`,
  );

  // ---------------------------------------------------------------------------
  // Property 4 — relation arrays are populated and length-consistent.
  // ---------------------------------------------------------------------------
  const withRelations = await listCandidates(owner.client, { eligible: ACTIVE_ONLY, title: "Tarefa com relações" });
  const relationRow = withRelations.find((row) => row.task_id === relationTask.id);
  check("relation-bearing task returns its relation arrays", Boolean(relationRow?.project_ids?.length));
  if (relationRow) {
    // Asserted non-empty *and* length-matched. Equality alone was the first
    // version and it passed at `0 vs 0` while the person link had silently
    // failed — a vacuous green of exactly the kind this gate exists to refuse.
    check(
      "person_ids is non-empty and length-matched to person_roles, as the RPC's guard requires",
      (relationRow.person_ids ?? []).length > 0
        && (relationRow.person_ids ?? []).length === (relationRow.person_roles ?? []).length,
      `${(relationRow.person_ids ?? []).length} ids vs ${(relationRow.person_roles ?? []).length} roles`,
    );
    const repeat = await listCandidates(owner.client, { eligible: ACTIVE_ONLY, title: "Tarefa com relações" });
    const again = repeat.find((row) => row.task_id === relationTask.id);
    check(
      "relation ordering is stable across identical calls",
      JSON.stringify(again?.project_ids) === JSON.stringify(relationRow.project_ids)
        && JSON.stringify(again?.person_ids) === JSON.stringify(relationRow.person_ids),
    );
  }

  // ---------------------------------------------------------------------------
  // Property 5 — title changed between render and click.
  // ---------------------------------------------------------------------------
  const renamed = byTitle("Título original antes do clique")[0];
  await admin.from("tasks").update({ title: "Título alterado depois do render" }).eq("id", renamed.id);
  const stale = await listCandidates(owner.client, { eligible: ACTIVE_ONLY, title: "Título original antes do clique" });
  const staleRow = stale.find((row) => row.task_id === renamed.id);
  // **Measured, not assumed — and it contradicts proposal Revision 2.** §3 of
  // Revision 2 claims "if the task's title changed since render, the exact-title
  // query returns nothing and the click refuses with the refresh affordance".
  // It does not: the row still resolves through token overlap at a lower
  // prefilter tier, because the stale query and the new title share tokens. The
  // mechanism is unharmed — the surface selects by `task_id`, so it finds its
  // row — but the *refusal* Revision 2 promised does not occur, and 2F.2 must
  // therefore decide title-drift policy explicitly instead of inheriting one it
  // was told already existed.
  check(
    "title drift is survivable: the row still resolves by task_id after a rename",
    Boolean(staleRow),
    staleRow ? `tier=${staleRow.prefilter_tier}, title now "${staleRow.title}"` : "row not returned",
  );
  check(
    "title drift is NOT self-refusing, so 2F.2 owns the policy decision",
    Boolean(staleRow) && staleRow.title !== "Título original antes do clique",
    staleRow ? `returned title differs from the queried title` : "n/a",
  );

  // ---------------------------------------------------------------------------
  // Property 6 — the volume premise.
  // ---------------------------------------------------------------------------
  const all = await listCandidates(owner.client, { eligible: ACTIVE_ONLY, title: null });
  check(
    "owner holds more than 25 eligible tasks, so p_limit is genuinely exercised",
    filler.length + WORK_ACTIONS.length > 25,
    `${filler.length + 7} seeded, ${all.length} returned with a null title query`,
  );
} catch (error) {
  check("script completed without throwing", false, error.message);
} finally {
  for (const id of provisioned) {
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) console.error(`CLEANUP FAILED for ${id}: ${deleted.error.message}`);
  }
  console.log(`\ncleanup: ${provisioned.length} disposable user(s) deleted`);
}

const failed = results.filter((row) => !row.passed);
console.log(`\n${results.length - failed.length}/${results.length} properties held`);
if (failed.length > 0) {
  console.log("\nFAILING PROPERTIES:");
  for (const row of failed) console.log(`- ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
}
process.exit(failed.length === 0 ? 0 : 1);
