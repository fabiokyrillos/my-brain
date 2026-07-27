import { createClient } from "@supabase/supabase-js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dataOrThrow(result, label) {
  if (result.error) {
    throw new Error(
      `${label} (${result.error.code ?? "unknown"}): ${result.error.message}`,
    );
  }
  return result.data;
}

function requiredEnvironmentValue(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment value: ${names.join(" or ")}`);
}

function assertTaskCreationRaceEvidence(evidence) {
  assert(evidence.results.length === 2, "The race did not return two successful callers");

  const taskIds = new Set(evidence.results.map((result) => result.task_id));
  const undoIds = new Set(evidence.results.map((result) => result.undo_id));
  assert(taskIds.size === 1 && !taskIds.has(undefined), "Race callers returned different task ids");
  assert(undoIds.size === 1 && !undoIds.has(undefined), "Race callers returned different undo ids");
  assert(
    JSON.stringify(evidence.results.map((result) => result.idempotent).sort())
      === JSON.stringify([false, true]),
    "The race did not produce one creation and one idempotent replay",
  );

  const [taskId] = taskIds;
  const [undoId] = undoIds;
  assert(
    evidence.tasks.length === 1 && evidence.tasks[0].id === taskId,
    "Same-key race did not persist exactly one matching task",
  );
  assert(
    evidence.undoOperations.length === 1
      && evidence.undoOperations[0].id === undoId
      && evidence.undoOperations[0].action_type === "create_task_command"
      && evidence.undoOperations[0].status === "available"
      && evidence.undoOperations[0].entity_ids?.length === 1
      && evidence.undoOperations[0].entity_ids[0] === taskId,
    "Same-key race did not persist exactly one matching undo operation",
  );
  assert(
    evidence.liveReminders.length === 1
      && evidence.liveReminders[0].task_id === taskId
      && ["scheduled", "snoozed"].includes(evidence.liveReminders[0].status),
    "Same-key race did not persist exactly one live task reminder",
  );
  assert(
    evidence.commandAudits.length === 1
      && evidence.commandAudits[0].entity_id === taskId
      && evidence.commandAudits[0].action_type === "task_command_created"
      && evidence.commandAudits[0].actor === "user",
    "Same-key race did not persist exactly one task_command_created audit mutation",
  );
  assert(
    evidence.triggerAudits.length === 1
      && evidence.triggerAudits[0].entity_id === taskId
      && evidence.triggerAudits[0].action_type === "task_created"
      && evidence.triggerAudits[0].actor === "agent",
    "Same-key race did not persist exactly one task_created trigger audit",
  );
  assert(
    evidence.confirmations.length === 1
      && evidence.confirmations[0].id === evidence.issuedConfirmationId
      && evidence.confirmations[0].action === "create_task"
      && evidence.confirmations[0].status === "consumed"
      && typeof evidence.confirmations[0].consumed_at === "string",
    "Same-key race did not consume exactly one confirmation",
  );
}

function runEvidenceValidatorSelfTest() {
  const valid = {
    results: [
      { task_id: "task-1", undo_id: "undo-1", idempotent: false },
      { task_id: "task-1", undo_id: "undo-1", idempotent: true },
    ],
    tasks: [{ id: "task-1" }],
    undoOperations: [{
      id: "undo-1",
      action_type: "create_task_command",
      status: "available",
      entity_ids: ["task-1"],
    }],
    liveReminders: [{
      id: "reminder-1",
      task_id: "task-1",
      status: "scheduled",
    }],
    commandAudits: [{
      id: "audit-command-1",
      entity_id: "task-1",
      action_type: "task_command_created",
      actor: "user",
    }],
    triggerAudits: [{
      id: "audit-trigger-1",
      entity_id: "task-1",
      action_type: "task_created",
      actor: "agent",
    }],
    issuedConfirmationId: "confirmation-1",
    confirmations: [{
      id: "confirmation-1",
      action: "create_task",
      status: "consumed",
      consumed_at: "2026-07-27T12:00:00Z",
    }],
  };
  assertTaskCreationRaceEvidence(valid);

  const duplicateMutations = [
    (evidence) => evidence.tasks.push({ id: "task-2" }),
    (evidence) => evidence.undoOperations.push({ id: "undo-2" }),
    (evidence) => evidence.liveReminders.push({
      id: "reminder-2",
      task_id: "task-1",
    }),
    (evidence) => evidence.commandAudits.push({
      id: "audit-command-2",
      entity_id: "task-1",
    }),
    (evidence) => evidence.triggerAudits.push({
      id: "audit-trigger-2",
      entity_id: "task-1",
    }),
    (evidence) => evidence.confirmations.push({
      id: "confirmation-2",
      status: "consumed",
      consumed_at: "2026-07-27T12:00:01Z",
    }),
    (evidence) => {
      evidence.results[1].task_id = "task-2";
    },
  ];

  for (const mutate of duplicateMutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    let rejected = false;
    try {
      assertTaskCreationRaceEvidence(invalid);
    } catch {
      rejected = true;
    }
    assert(rejected, "The evidence validator accepted a duplicated race side effect");
  }

  console.log("race evidence validator self-test passed");
}

async function runTaskCreationRace() {
  const url = requiredEnvironmentValue("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const publicKey = requiredEnvironmentValue(
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
  const serviceRoleKey = requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");
  const clientOptions = {
    auth: { autoRefreshToken: false, persistSession: false },
  };
  const admin = createClient(url, serviceRoleKey, clientOptions);
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `phase-2e6-creation-race-${suffix}@example.test`;
  const password = `Phase2E6-${crypto.randomUUID()}-Aa1!`;
  const operationKey = crypto.randomUUID();
  const observedBefore = new Date().toISOString();
  const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  let userId;

  try {
    const created = dataOrThrow(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
      "create the disposable race user",
    );
    assert(created.user, "Auth did not return the disposable race user");
    userId = created.user.id;

    async function signedClient(sessionLabel) {
      const client = createClient(url, publicKey, clientOptions);
      dataOrThrow(
        await client.auth.signInWithPassword({ email, password }),
        `sign in race session ${sessionLabel}`,
      );
      return client;
    }

    const [firstSession, secondSession] = await Promise.all([
      signedClient("A"),
      signedClient("B"),
    ]);
    const args = {
      p_action: "reschedule_due",
      p_title_words: ["two-session", "creation", "race", suffix],
      p_patch: { dueAt },
      p_observed_before: observedBefore,
      p_policy_version: "task-command-policy-v1",
      p_operation_key: operationKey,
    };

    const confirmation = dataOrThrow(
      await firstSession.rpc("issue_task_command_creation_confirmation", args),
      "issue the exact creation confirmation",
    );
    assert(
      typeof confirmation?.confirmation_id === "string",
      "Creation confirmation did not return an id",
    );

    const responses = await Promise.all([
      firstSession.rpc("create_task_command", args),
      secondSession.rpc("create_task_command", args),
    ]);
    const results = responses.map((response, index) =>
      dataOrThrow(response, `create_task_command race caller ${index + 1}`));
    const taskId = results[0]?.task_id;
    assert(typeof taskId === "string", "The winning race result did not return a task id");

    const [
      tasksResult,
      undoResult,
      remindersResult,
      commandAuditsResult,
      triggerAuditsResult,
      confirmationsResult,
    ] = await Promise.all([
      firstSession
        .from("tasks")
        .select("id")
        .eq("operation_key", operationKey),
      firstSession
        .from("undo_operations")
        .select("id,action_type,status,entity_ids")
        .eq("operation_key", `taskcmd-v1:${operationKey}`),
      firstSession
        .from("reminders")
        .select("id,task_id,status")
        .eq("task_id", taskId)
        .in("status", ["scheduled", "snoozed"]),
      firstSession
        .from("audit_logs")
        .select("id,entity_id,action_type,actor")
        .eq("entity_id", taskId)
        .eq("action_type", "task_command_created"),
      firstSession
        .from("audit_logs")
        .select("id,entity_id,action_type,actor")
        .eq("entity_id", taskId)
        .eq("action_type", "task_created"),
      firstSession
        .from("task_command_confirmations")
        .select("id,action,status,consumed_at")
        .eq("operation_key", operationKey),
    ]);

    const evidence = {
      results,
      tasks: dataOrThrow(tasksResult, "read race task evidence"),
      undoOperations: dataOrThrow(undoResult, "read race undo evidence"),
      liveReminders: dataOrThrow(remindersResult, "read race reminder evidence"),
      commandAudits: dataOrThrow(
        commandAuditsResult,
        "read race command audit evidence",
      ),
      triggerAudits: dataOrThrow(
        triggerAuditsResult,
        "read race trigger audit evidence",
      ),
      issuedConfirmationId: confirmation.confirmation_id,
      confirmations: dataOrThrow(
        confirmationsResult,
        "read race confirmation evidence",
      ),
    };
    assertTaskCreationRaceEvidence(evidence);

    console.log(JSON.stringify({
      status: "passed",
      sessions: 2,
      taskId: results[0].task_id,
      undoId: results[0].undo_id,
      confirmationId: confirmation.confirmation_id,
      persisted: {
        tasks: evidence.tasks.length,
        undoOperations: evidence.undoOperations.length,
        liveReminders: evidence.liveReminders.length,
        commandAudits: evidence.commandAudits.length,
        triggerAudits: evidence.triggerAudits.length,
        consumedConfirmations: evidence.confirmations.length,
      },
    }, null, 2));
  } finally {
    if (userId) {
      const deletion = await admin.auth.admin.deleteUser(userId);
      if (deletion.error) {
        throw new Error(`delete the disposable race user: ${deletion.error.message}`);
      }
    }
  }
}

if (process.argv.includes("--self-test")) {
  runEvidenceValidatorSelfTest();
} else {
  await runTaskCreationRace();
}
