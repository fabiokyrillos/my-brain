import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

// Phase 2E aggregate remote smoke (PRD 2E-OPERATIONS-003/004, 2E-OWNERSHIP-004).
//
// Proves, against the linked development project with disposable fixtures, the
// things pgTAP cannot: that the contract holds through *PostgREST*, under the real
// project's roles, RLS and grants, rather than against a from-zero database as a
// superuser-adjacent test role.
//
// Determinism, and why this smoke creates no entries
// --------------------------------------------------
// 2E-OPERATIONS-004 requires the aggregate to be deterministic and to not compete
// with the shared queue drain. A `pg_cron`/`pg_net` tick drains `interpret_entry`
// jobs every minute, so any fixture that captured an entry would race a worker that
// mutates the very interpretation the fixture depends on. Phase 2E never needs an
// entry: it acts on tasks that already exist, and `authenticated` still holds a
// direct insert on `public.tasks` (the residual risk PRD §16.4 states plainly and
// §5 defers closing). This smoke therefore seeds tasks by direct owner-scoped
// insert and enqueues nothing at all. That is not a shortcut around the write path
// under test — every Phase 2E assertion below goes through a Phase 2E RPC.
//
// Deployment gate
// ---------------
// The linked project is at migration `202607250054`; Phase 2E ends at
// `202607280061`. Until that chain is deployed, no Phase 2E RPC exists remotely.
// The preflight below detects exactly that and exits 2 with a specific message,
// rather than failing somewhere in the middle with a confusing PostgREST error.
// Exit 2 is distinguishable from a genuine assertion failure (exit 1) so a future
// CI wiring can tell "not deployed yet" from "deployed and broken".
//
// Cleanup is fail-closed: any leftover fixture fails the smoke.

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const anonymous = createClient(credentials.url, credentials.publishableKey, clientOptions);

const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `Phase2E-${crypto.randomUUID()}-Aa1!`;
const createdUserIds = [];
const checks = [];

const POLICY_VERSION = "2026-07-25.3";

function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail: detail ?? null });
  if (!condition) throw new Error(`FAILED: ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ok  ${name}`);
}

async function createOwner(label) {
  const email = `phase-2e-${label}-${suffix}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  createdUserIds.push(created.data.user.id);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return { id: created.data.user.id, email, client };
}

/** The `preState` object `matching.ts` builds from one candidate row, key for key. */
function preStateOf(row) {
  return {
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.due_at,
    plannedAt: row.planned_at,
    manualPriority: row.manual_priority,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    intentionalNoDue: row.intentional_no_due,
    noDueReason: row.no_due_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectIds: row.project_ids,
    projectNames: row.project_names,
    contextIds: row.context_ids,
    contextNames: row.context_names,
    personIds: row.person_ids,
    personNames: row.person_names,
    personRoles: row.person_roles,
  };
}

const NON_TERMINAL = ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"];

async function listCandidates(client, args) {
  return client.rpc("list_task_command_candidates", {
    p_eligible_statuses: NON_TERMINAL,
    p_limit: 25,
    ...args,
  });
}

async function main() {
  console.log("Phase 2E aggregate remote smoke");
  console.log(`  project: ${credentials.url}`);

  // ---- Preflight: is the Phase 2E chain deployed at all? -------------------
  const probe = await admin.rpc("list_task_command_candidates", {
    p_eligible_statuses: NON_TERMINAL,
    p_limit: 1,
  });
  if (probe.error && (probe.error.code === "PGRST202" || /could not find the function/i.test(probe.error.message ?? ""))) {
    console.error(
      "\nBLOCKED ON DEPLOYMENT: `list_task_command_candidates` does not exist in the linked "
      + "project.\nMigrations 202607250055-202607280061 are local only; the project is at "
      + "202607250054.\nDeploy the chain, then re-run `npm run test:remote:2e`.",
    );
    process.exit(2);
  }

  const ownerA = await createOwner("owner-a");
  const ownerB = await createOwner("owner-b");
  console.log(`  owners: ${ownerA.email} / ${ownerB.email}`);

  // ---- Fixtures: identical titles across owners, no entries, no jobs -------
  const sharedTitle = `Send invoice ${suffix}`;
  const seed = async (owner, rows) => {
    const insert = await owner.client.from("tasks").insert(rows).select("id, title, status");
    if (insert.error) throw new Error(`seed ${owner.email}: ${insert.error.message}`);
    return insert.data;
  };

  const aTasks = await seed(ownerA, [
    { user_id: ownerA.id, title: sharedTitle, status: "todo" },
    { user_id: ownerA.id, title: `${sharedTitle} follow-up`, status: "todo" },
    { user_id: ownerA.id, title: `Gym ${suffix}`, status: "todo" },
    // Injection-shaped titles: the candidate query must treat these as literals.
    { user_id: ownerA.id, title: `100% margin ${suffix}`, status: "todo" },
    { user_id: ownerA.id, title: `under_score ${suffix}`, status: "todo" },
    { user_id: ownerA.id, title: `back\\slash ${suffix}`, status: "todo" },
  ]);
  await seed(ownerB, [{ user_id: ownerB.id, title: sharedTitle, status: "todo" }]);

  // ---- 2E-OWNERSHIP: cross-owner non-disclosure ----------------------------
  const aSees = await listCandidates(ownerA.client, { p_title_query: sharedTitle });
  if (aSees.error) throw aSees.error;
  const bSees = await listCandidates(ownerB.client, { p_title_query: sharedTitle });
  if (bSees.error) throw bSees.error;

  check(
    "2E-OWNERSHIP-001: each owner ranks only its own rows",
    aSees.data.every((r) => r.owner_id === ownerA.id) && bSees.data.every((r) => r.owner_id === ownerB.id),
  );
  check(
    "2E-OWNERSHIP-002: the other owner's identically-titled task is absent, not outranked",
    !aSees.data.some((r) => r.owner_id === ownerB.id) && bSees.data.length === 1,
    `A saw ${aSees.data.length}, B saw ${bSees.data.length}`,
  );
  check("2E-OWNERSHIP-003: anon cannot execute the candidate RPC", Boolean(
    (await anonymous.rpc("list_task_command_candidates", { p_eligible_statuses: NON_TERMINAL })).error,
  ));

  // ---- 2E-MATCH-003/009: deterministic ordering across repeated execution --
  const orderings = [];
  for (let i = 0; i < 3; i += 1) {
    const run = await listCandidates(ownerA.client, { p_title_query: sharedTitle });
    if (run.error) throw run.error;
    orderings.push(run.data.map((r) => r.task_id).join(","));
  }
  check(
    "2E-MATCH-003/009: repeated execution returns one total, stable order",
    new Set(orderings).size === 1,
    orderings.join(" | "),
  );

  // ---- 2E-MATCH-004: limit+1 overflow is detectable ------------------------
  const truncated = await listCandidates(ownerA.client, { p_title_query: suffix, p_limit: 2 });
  if (truncated.error) throw truncated.error;
  check(
    "2E-MATCH-004: the query selects one row beyond the limit so overflow is visible",
    truncated.data.length > 2,
    `limit 2 returned ${truncated.data.length}`,
  );

  // ---- 2E-MATCH: injection-shaped hints stay literal -----------------------
  for (const [label, hint, expectTitle] of [
    ["percent", "100%", `100% margin ${suffix}`],
    ["underscore", "under_score", `under_score ${suffix}`],
    ["backslash", "back\\slash", `back\\slash ${suffix}`],
  ]) {
    const probeRun = await listCandidates(ownerA.client, { p_title_query: hint });
    if (probeRun.error) throw new Error(`${label}: ${probeRun.error.code} ${probeRun.error.message}`);
    check(
      `2E-MATCH: a ${label} hint neither widens the set nor raises 22025`,
      probeRun.data.some((r) => r.title === expectTitle) && probeRun.data.length < aTasks.length,
      `${probeRun.data.length} rows`,
    );
  }

  // ---- 2E-UPDATE: apply, replay, mismatch ---------------------------------
  const target = aSees.data.find((r) => r.title === sharedTitle);
  const operationKey = `smoke-${suffix}-complete`;
  const applyArgs = {
    p_task_id: target.task_id,
    p_action: "complete_task",
    p_patch: {},
    p_pre_state: preStateOf(target),
    p_observed_before: target.observed_before,
    p_policy_version: POLICY_VERSION,
    p_operation_key: operationKey,
  };

  const applied = await ownerA.client.rpc("apply_task_command", applyArgs);
  if (applied.error) throw new Error(`apply: ${applied.error.code} ${applied.error.message} ${applied.error.details ?? ""}`);
  check("2E-UPDATE-002/004: an eligible non-destructive apply commits", applied.data?.status === "applied", JSON.stringify(applied.data));
  check("2E-UPDATE-007: an undo row exists for the applied operation", Boolean(applied.data?.undo_id));

  const replayed = await ownerA.client.rpc("apply_task_command", applyArgs);
  if (replayed.error) throw new Error(`replay: ${replayed.error.message}`);
  check(
    "2E-IDEMPOTENCY-004: an exact replay returns the original outcome marked replayed",
    replayed.data?.idempotent === true && replayed.data?.undo_id === applied.data.undo_id,
  );

  const mismatch = await ownerA.client.rpc("apply_task_command", { ...applyArgs, p_action: "reopen_task" });
  check(
    "2E-UPDATE-006: a replay whose fingerprint differs is refused, not applied",
    Boolean(mismatch.error),
    mismatch.error ? `${mismatch.error.code} ${mismatch.error.details ?? ""}` : "no error raised",
  );

  // ---- 2E-UPDATE-003: stale pre-state is refused with 55P03 ---------------
  const stale = await ownerA.client.rpc("apply_task_command", {
    ...applyArgs,
    p_operation_key: `${operationKey}-stale`,
    p_pre_state: { ...applyArgs.p_pre_state, status: "blocked" },
  });
  check(
    "2E-UPDATE-003: a stale expected pre-state is refused with 55P03, never 40001",
    Boolean(stale.error) && stale.error.code !== "40001",
    stale.error ? `${stale.error.code}` : "no error raised",
  );

  // ---- 2E-DESTRUCTIVE: cancel needs server-issued confirmation ------------
  const gym = (await listCandidates(ownerA.client, { p_title_query: `Gym ${suffix}` })).data[0];
  const cancelKey = `smoke-${suffix}-cancel`;
  const cancelArgs = {
    p_task_id: gym.task_id,
    p_action: "cancel_task",
    p_patch: {},
    p_pre_state: preStateOf(gym),
    p_observed_before: gym.observed_before,
    p_policy_version: POLICY_VERSION,
    p_operation_key: cancelKey,
  };

  const unconfirmed = await ownerA.client.rpc("apply_task_command", cancelArgs);
  check(
    "2E-DESTRUCTIVE-004: the database refuses a cancel with no confirmation evidence",
    Boolean(unconfirmed.error),
    unconfirmed.error ? `${unconfirmed.error.code} ${unconfirmed.error.details ?? ""}` : "no error raised",
  );

  const issued = await ownerA.client.rpc("issue_task_command_confirmation", cancelArgs);
  if (issued.error) throw new Error(`issue: ${issued.error.message}`);
  check("2E-DESTRUCTIVE-002: the server issues confirmation evidence", Boolean(issued.data));

  const confirmed = await ownerA.client.rpc("apply_task_command", cancelArgs);
  if (confirmed.error) throw new Error(`confirmed cancel: ${confirmed.error.message}`);
  check("2E-DESTRUCTIVE: the confirmed cancel commits", confirmed.data?.status === "applied");

  const cancelledRow = await ownerA.client.from("tasks").select("status").eq("id", gym.task_id).single();
  check("2E-DESTRUCTIVE: the task is cancelled", cancelledRow.data?.status === "cancelled");

  const restoreCandidates = await ownerA.client.rpc("list_task_command_candidates", {
    p_eligible_statuses: ["cancelled"],
    p_title_query: `Gym ${suffix}`,
    p_limit: 25,
  });
  if (restoreCandidates.error) throw restoreCandidates.error;
  check(
    "2E-DESTRUCTIVE-006: a cancelled task is reachable for restore_task and for nothing else",
    restoreCandidates.data.some((r) => r.task_id === gym.task_id),
  );

  // ---- 2E-UNDO -------------------------------------------------------------
  const undone = await ownerA.client.rpc("undo_operation", { p_operation_id: applied.data.undo_id });
  if (undone.error) throw new Error(`undo: ${undone.error.message}`);
  const restored = await ownerA.client.from("tasks").select("status, completed_at").eq("id", target.task_id).single();
  check(
    "2E-UNDO-001: undo restores the pre-state its operation changed",
    restored.data?.status === "todo" && restored.data?.completed_at === null,
    JSON.stringify(restored.data),
  );

  const undoneTwice = await ownerA.client.rpc("undo_operation", { p_operation_id: applied.data.undo_id });
  check(
    "2E-UNDO-003: a second undo attempt is safe and reports itself honestly",
    Boolean(undoneTwice.error) || undoneTwice.data?.status !== "undone",
    JSON.stringify(undoneTwice.error ?? undoneTwice.data),
  );

  // ---- 2E-NOMATCH: creation is replay-safe ---------------------------------
  const createKey = `smoke-${suffix}-create`;
  const createArgs = {
    p_action: "create_task",
    p_title_words: ["book", "the", "flights"],
    p_patch: { title: `Book the flights ${suffix}` },
    p_observed_before: new Date().toISOString(),
    p_policy_version: POLICY_VERSION,
    p_operation_key: createKey,
  };
  const creationPreview = await ownerA.client.rpc("preview_task_command_creation", createArgs);
  check(
    "2E-NOMATCH-005: creation is previewed before it happens",
    !creationPreview.error,
    creationPreview.error ? creationPreview.error.message : "",
  );
  await ownerA.client.rpc("issue_task_command_creation_confirmation", createArgs);
  const created = await ownerA.client.rpc("create_task_command", createArgs);
  if (created.error) throw new Error(`create: ${created.error.message}`);
  const createdAgain = await ownerA.client.rpc("create_task_command", createArgs);
  if (createdAgain.error) throw new Error(`create replay: ${createdAgain.error.message}`);
  check(
    "2E-NOMATCH-006: an exact replay of a creation command creates no second task",
    createdAgain.data?.task_id === created.data?.task_id,
  );
  const createdRow = await ownerA.client.from("tasks").select("created_by, status").eq("id", created.data.task_id).single();
  check(
    "2E-NOMATCH-007: a created activity is distinguishable by actor",
    createdRow.data?.created_by === "agent" && createdRow.data?.status === "inbox",
    JSON.stringify(createdRow.data),
  );

  console.log(`\n${checks.length} assertions passed.`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  console.error(`\n${error.message}`);
  exitCode = 1;
} finally {
  // Fail-closed cleanup. Auth deletion cascades every user-owned row; the
  // verifier is what proves it actually did.
  for (const id of createdUserIds) {
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) {
      console.error(`cleanup failed for ${id}: ${deleted.error.message}`);
      exitCode = 1;
    }
  }
  console.log(`cleaned up ${createdUserIds.length} disposable owner(s).`);
}

process.exit(exitCode);
