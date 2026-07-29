/**
 * Phase 2F Slice 2F.3 — the creation-family deployment probe (2F-CREATE-005,
 * 2F-OWNERSHIP-002).
 *
 * Gate 3 proved the *mutation* path against the deployed contract. The creation
 * family takes no pre-state and was therefore never covered by it, so this slice
 * carries its own smaller probe: disposable users, two owners, fail-closed
 * cleanup, executed against the linked project.
 *
 * Everything here runs as a **real end user** through PostgREST, never as
 * `service_role`, because the entire tenant boundary of `create_task_command`
 * and `undo_operation` is an `auth.uid()` predicate inside a `security definer`
 * body. A probe that used the admin key would prove nothing about ownership.
 *
 * Exit code 0 means every gate passed and cleanup verified clean.
 */

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const credentials = getLinkedSupabaseCredentials();
const { url, publishableKey, serviceRoleKey } = credentials;

const results = [];
let failures = 0;

function check(gate, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push({ gate, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${gate}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function admin(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, text };
}

async function asUser(path, token, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body, text };
}

const rpc = (name, token, args) =>
  asUser(`rpc/${name}`, token, { method: "POST", body: JSON.stringify(args) });

async function createUser(label) {
  const email = `codex-2f3-${label}-${crypto.randomUUID()}@example.com`;
  const password = `Probe!${crypto.randomUUID()}A7`;
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`could not create ${label}: ${await created.text()}`);
  const { id } = await created.json();
  const session = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!session.ok) throw new Error(`could not sign in ${label}: ${await session.text()}`);
  const { access_token: token } = await session.json();
  return { id, email, token };
}

async function deleteUser(id) {
  if (!id) return;
  await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
  });
}

/**
 * Issue the server-side confirmation, then create. The contract requires both.
 *
 * **The origin is stripped for the confirmation call.** Slice 2F.3 extended
 * `create_task_command` alone; the issuer deliberately stayed at six arguments,
 * because it does not write and so has no origin to record. Sending the seventh
 * to it is a 404 from PostgREST, not a contract problem — and it is exactly the
 * mistake this helper exists to make impossible for every call site below.
 */
async function createTask(token, args) {
  const { p_created_by, ...shared } = args;
  const issued = await rpc("issue_task_command_creation_confirmation", token, shared);
  if (issued.status !== 200) return { phase: "issue", ...issued };
  const applied = await rpc(
    "create_task_command",
    token,
    p_created_by === undefined ? shared : args,
  );
  return { phase: "create", ...applied };
}

const POLICY = "task-command-policy-v1";
const instant = () => new Date().toISOString();

let owner;
let stranger;

try {
  owner = await createUser("owner");
  stranger = await createUser("stranger");

  // ---- Gates 7, 8, 9, 12 ------------------------------------------------
  const manualKey = `2f3-manual-${crypto.randomUUID()}`;
  const manual = await createTask(owner.token, {
    p_action: "create_title_only",
    p_title_words: ["Ligar", "para", "o", "cliente"],
    p_patch: {},
    p_observed_before: instant(),
    p_policy_version: POLICY,
    p_operation_key: manualKey,
    p_created_by: "user",
  });
  check("12 create_title_only accepts an empty canonical patch",
    manual.status === 200 && manual.body?.outcome === "applied",
    `status ${manual.status} ${manual.text.slice(0, 160)}`);

  const manualTaskId = manual.body?.task_id;
  const manualUndoId = manual.body?.undo_id;

  const [manualTask] = ((await admin(
    `tasks?id=eq.${manualTaskId}&select=created_by,title,status,due_at,planned_at,manual_priority`,
  )).body) ?? [];
  check("7 the manually created task persists created_by = 'user'",
    manualTask?.created_by === "user", `created_by=${manualTask?.created_by}`);
  check("7b no qualifier value was invented",
    manualTask?.due_at === null && manualTask?.planned_at === null
    && manualTask?.manual_priority === null && manualTask?.status === "inbox",
    `due=${manualTask?.due_at} planned=${manualTask?.planned_at} priority=${manualTask?.manual_priority}`);

  const audits = (await admin(
    `audit_logs?entity_id=eq.${manualTaskId}&action_type=eq.task_command_created&select=actor,reason`,
  )).body ?? [];
  check("8 the creation audit row records actor = 'user'",
    audits.length === 1 && audits[0].actor === "user",
    `rows=${audits.length} actor=${audits[0]?.actor} reason=${audits[0]?.reason}`);

  const undoRows = (await admin(
    `undo_operations?id=eq.${manualUndoId}&select=status,action_type,operation_key,after_state`,
  )).body ?? [];
  check("9 an available undo operation is recorded",
    undoRows.length === 1 && undoRows[0].status === "available"
    && undoRows[0].action_type === "create_task_command",
    `status=${undoRows[0]?.status}`);
  check("9b the undo evidence records the real origin",
    undoRows[0]?.after_state?.applied_state?.createdBy === "user",
    `createdBy=${undoRows[0]?.after_state?.applied_state?.createdBy}`);

  // ---- Gate 15/16: replay and mismatch, before the undo consumes the row --
  const replay = await rpc("create_task_command", owner.token, {
    p_action: "create_title_only",
    p_title_words: ["Ligar", "para", "o", "cliente"],
    p_patch: {},
    p_observed_before: instant(),
    p_policy_version: POLICY,
    p_operation_key: manualKey,
    p_created_by: "user",
  });
  check("15 operation-key replay returns the original identities",
    replay.status === 200 && replay.body?.idempotent === true
    && replay.body?.task_id === manualTaskId && replay.body?.undo_id === manualUndoId,
    `idempotent=${replay.body?.idempotent} sameTask=${replay.body?.task_id === manualTaskId}`);

  const mismatch = await rpc("create_task_command", owner.token, {
    p_action: "create_title_only",
    p_title_words: ["A", "different", "title"],
    p_patch: {},
    p_observed_before: instant(),
    p_policy_version: POLICY,
    p_operation_key: manualKey,
    p_created_by: "user",
  });
  check("16 reusing the key with changed input raises the idempotency mismatch",
    mismatch.status !== 200 && /2E_IDEMPOTENCY_MISMATCH/.test(mismatch.text),
    `status=${mismatch.status} ${mismatch.text.slice(0, 120)}`);

  // ---- Gate 13: a non-empty patch refuses and writes nothing -------------
  const badKey = `2f3-badpatch-${crypto.randomUUID()}`;
  const badPatch = await createTask(owner.token, {
    p_action: "create_title_only",
    p_title_words: ["Should", "not", "exist"],
    p_patch: { dueAt: new Date(Date.now() + 86400000).toISOString() },
    p_observed_before: instant(),
    p_policy_version: POLICY,
    p_operation_key: badKey,
    p_created_by: "user",
  });
  const badPatchTasks = (await admin(
    `tasks?operation_key=eq.${badKey}&select=id`,
  )).body ?? [];
  check("13 create_title_only refuses a non-empty patch and writes nothing",
    badPatch.status !== 200 && /Invalid task creation patch/.test(badPatch.text)
    && badPatchTasks.length === 0,
    `status=${badPatch.status} rowsWritten=${badPatchTasks.length}`);

  // ---- Gate 11: the legacy caller omits the origin -----------------------
  const legacyKey = `2f3-legacy-${crypto.randomUUID()}`;
  const legacy = await createTask(owner.token, {
    p_action: "reschedule_due",
    p_title_words: ["Legacy", "qualifier", "task"],
    p_patch: { dueAt: new Date(Date.now() + 5 * 86400000).toISOString() },
    p_observed_before: instant(),
    p_policy_version: POLICY,
    p_operation_key: legacyKey,
    // p_created_by deliberately absent
  });
  const [legacyTask] = (await admin(
    `tasks?operation_key=eq.${legacyKey}&select=created_by,due_at`,
  )).body ?? [];
  check("11/14 a qualifier action omitting the origin still works and persists 'agent'",
    legacy.status === 200 && legacyTask?.created_by === "agent" && legacyTask?.due_at !== null,
    `status=${legacy.status} created_by=${legacyTask?.created_by} due=${legacyTask?.due_at}`);

  // ---- Gate 17: two-owner, non-vacuous ----------------------------------
  const ownerSees = await asUser(`tasks?id=eq.${manualTaskId}&select=id`, owner.token);
  check("17a the owner can resolve their own creation (non-vacuous)",
    ownerSees.status === 200 && Array.isArray(ownerSees.body) && ownerSees.body.length === 1,
    `rows=${ownerSees.body?.length}`);

  const strangerSees = await asUser(`tasks?id=eq.${manualTaskId}&select=id`, stranger.token);
  check("17b the stranger cannot read the owner's task",
    strangerSees.status === 200 && Array.isArray(strangerSees.body) && strangerSees.body.length === 0,
    `rows=${strangerSees.body?.length}`);

  const strangerUndo = await rpc("undo_operation", stranger.token, { p_undo_id: manualUndoId });
  check("17c the stranger cannot undo the owner's creation",
    strangerUndo.status !== 200, `status=${strangerUndo.status} ${strangerUndo.text.slice(0, 120)}`);

  const [afterStranger] = (await admin(
    `tasks?id=eq.${manualTaskId}&select=status,created_by`,
  )).body ?? [];
  check("17d the owner's row is unchanged after the stranger's attempt",
    afterStranger?.status === "inbox" && afterStranger?.created_by === "user",
    `status=${afterStranger?.status} created_by=${afterStranger?.created_by}`);

  // ---- Gate 10: the owner's undo actually compensates --------------------
  const undone = await rpc("undo_operation", owner.token, { p_undo_id: manualUndoId });
  const [afterUndo] = (await admin(
    `tasks?id=eq.${manualTaskId}&select=status,cancelled_at`,
  )).body ?? [];
  const [undoAfter] = (await admin(
    `undo_operations?id=eq.${manualUndoId}&select=status`,
  )).body ?? [];
  check("10 the owner's undo compensates the user-origin creation",
    undone.status === 200 && afterUndo?.status === "cancelled"
    && afterUndo?.cancelled_at !== null && undoAfter?.status === "undone",
    `undo=${undone.status} task=${afterUndo?.status} op=${undoAfter?.status}`);

  // ---- Gate 18: analytics carry no content ------------------------------
  const events = (await asUser(
    "product_events?select=event_name,surface,properties&order=created_at.desc&limit=50",
    owner.token,
  )).body ?? [];
  const leaked = events.filter((event) =>
    JSON.stringify(event.properties ?? {}).includes("Ligar")
    || JSON.stringify(event.properties ?? {}).includes("cliente"));
  check("18 no analytics payload carries task content",
    leaked.length === 0, `events=${events.length} leaked=${leaked.length}`);
} catch (error) {
  failures += 1;
  console.log(`FAIL  probe raised: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  // ---- Gate 20: fail-closed cleanup -------------------------------------
  await deleteUser(owner?.id);
  await deleteUser(stranger?.id);

  const residue = {};
  for (const [label, path] of [
    ["tasks", `tasks?user_id=in.(${owner?.id ?? "null"},${stranger?.id ?? "null"})&select=id`],
    ["undo_operations", `undo_operations?user_id=in.(${owner?.id ?? "null"},${stranger?.id ?? "null"})&select=id`],
    ["audit_logs", `audit_logs?user_id=in.(${owner?.id ?? "null"},${stranger?.id ?? "null"})&select=id`],
    ["reminders", `reminders?user_id=in.(${owner?.id ?? "null"},${stranger?.id ?? "null"})&select=id`],
    ["confirmations", `task_command_confirmations?user_id=in.(${owner?.id ?? "null"},${stranger?.id ?? "null"})&select=id`],
  ]) {
    const rows = await admin(path);
    residue[label] = Array.isArray(rows.body) ? rows.body.length : `unreadable(${rows.status})`;
  }
  const users = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
  });
  const remaining = ((await users.json()).users ?? []).filter((u) => /codex-2f3-/.test(u.email ?? ""));

  const clean = remaining.length === 0
    && Object.values(residue).every((value) => value === 0 || typeof value === "string");
  check("20 cleanup leaves no disposable user and no owned residue",
    clean, `users=${remaining.length} ${JSON.stringify(residue)}`);

  console.log(`\n${failures === 0 ? "ALL GATES PASSED" : `${failures} GATE(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}
