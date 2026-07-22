import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dataOrThrow(result, label) {
  if (result.error) {
    throw new Error(`${label} (${result.error.code ?? "unknown"}): ${result.error.message}`);
  }
  return result.data;
}

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const fixturePrefix = `phase-2c-integration-${suffix}`;
const password = `Phase2C-${crypto.randomUUID()}-Aa1!`;
const createdUserIds = [];
const countedTables = [
  "profiles",
  "entries",
  "entry_interpretations",
  "tasks",
  "undo_operations",
  "audit_logs",
  "pending_questions",
  "jobs",
  "projects",
  "contexts",
  "people",
  "task_projects",
  "task_contexts",
  "task_people",
  "entry_task_candidate_resolutions",
];

function extraction(label, candidateCount = 2) {
  return {
    summary: `Phase 2C integration smoke: ${label}`,
    concepts: ["task"],
    occurredAt: "2026-07-19T12:00:00Z",
    confidence: 0.9,
    taskCandidates: [
      {
        title: `${fixturePrefix} candidate zero`,
        description: "Original description zero",
        dueAt: "2026-08-01T12:00:00-03:00",
        waitingOn: null,
        parentIndex: null,
        confidence: 0.9,
        explicit: true,
      },
      {
        title: `${fixturePrefix} candidate one`,
        description: "Original description one",
        dueAt: null,
        waitingOn: null,
        parentIndex: null,
        confidence: 0.8,
        explicit: true,
      },
      {
        title: `${fixturePrefix} candidate two`,
        description: "Original description two",
        dueAt: null,
        waitingOn: null,
        parentIndex: null,
        confidence: 0.75,
        explicit: true,
      },
      {
        title: `${fixturePrefix} candidate three`,
        description: "Original description three",
        dueAt: null,
        waitingOn: null,
        parentIndex: null,
        confidence: 0.7,
        explicit: true,
      },
    ].slice(0, candidateCount),
    pendingQuestions: [],
  };
}

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    users.push(...result.data.users);
    if (result.data.users.length < 1000) return users;
  }
}

async function tableCounts() {
  const entries = await Promise.all(countedTables.map(async (table) => {
    const result = await admin.from(table).select("*", { count: "exact", head: true });
    if (result.error) throw new Error(`count ${table}: ${result.error.message}`);
    return [table, result.count ?? 0];
  }));
  return Object.fromEntries(entries);
}

async function environmentSnapshot() {
  return {
    authUserIds: (await listAllUsers()).map((user) => user.id).sort(),
    tableCounts: await tableCounts(),
  };
}

async function createTestUser(label = "owner") {
  const email = `${fixturePrefix}-${label}@example.test`;
  const user = dataOrThrow(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    "create Phase 2C integration user",
  ).user;
  assert(user, "Phase 2C integration user was not returned");
  createdUserIds.push(user.id);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(
    await client.auth.signInWithPassword({ email, password }),
    "sign in Phase 2C integration user",
  );
  dataOrThrow(
    await client.from("profiles").update({ timezone: "America/New_York" }).eq("user_id", user.id),
    "set Phase 2C integration profile timezone",
  );
  return { client, user };
}

async function createFixture(client, label, candidateCount = 2) {
  const captured = dataOrThrow(
    await client.rpc("capture_entry_async", {
      p_original_content: `Phase 2C integration smoke: ${fixturePrefix}:${label}`,
      p_locale: "en",
      p_source: "web",
      p_idempotency_key: `${fixturePrefix}:capture:${label}`,
    }),
    `capture ${label}`,
  );
  assert(captured.entry_id, `${label} capture returned no entry`);

  const interpretationId = dataOrThrow(
    await client.rpc("persist_entry_interpretation", {
      p_entry_id: captured.entry_id,
      p_extraction: extraction(label, candidateCount),
      p_model: "gpt-test",
      p_strategy_version: "phase-2c-integration-smoke",
      p_prompt_version: "phase-2c-integration-smoke",
      p_input_tokens: 10,
      p_output_tokens: 10,
    }),
    `persist ${label} interpretation`,
  );
  assert(interpretationId, `${label} persistence returned no interpretation`);
  return { entryId: captured.entry_id, interpretationId };
}

async function confirm(client, fixture, label, indexes, edits, operationKey = crypto.randomUUID()) {
  return client.rpc("confirm_entry_task_candidates_v2", {
    p_entry_id: fixture.entryId,
    p_expected_interpretation_id: fixture.interpretationId,
    p_candidate_indexes: indexes,
    p_candidate_edits: edits,
    p_operation_key: operationKey,
  }).then((result) => ({ ...result, operationKey }));
}

async function confirmV3(client, fixture, label, indexes, edits, operationKey = crypto.randomUUID()) {
  return client.rpc("confirm_entry_task_candidates_v3", {
    p_entry_id: fixture.entryId,
    p_expected_interpretation_id: fixture.interpretationId,
    p_candidate_indexes: indexes,
    p_candidate_edits: edits,
    p_operation_key: operationKey,
  }).then((result) => ({ ...result, operationKey }));
}

async function confirmV4(client, fixture, label, indexes, edits, operationKey = crypto.randomUUID()) {
  return client.rpc("confirm_entry_task_candidates_v4", {
    p_entry_id: fixture.entryId,
    p_expected_interpretation_id: fixture.interpretationId,
    p_candidate_indexes: indexes,
    p_candidate_edits: edits,
    p_operation_key: operationKey,
  }).then((result) => ({ ...result, operationKey }));
}

async function resolveV5(client, fixture, resolutions, edits, operationKey = crypto.randomUUID()) {
  return client.rpc("confirm_entry_task_candidates_v5", {
    p_entry_id: fixture.entryId,
    p_expected_interpretation_id: fixture.interpretationId,
    p_candidate_resolutions: resolutions,
    p_candidate_edits: edits,
    p_operation_key: operationKey,
  }).then((result) => ({ ...result, operationKey }));
}

async function taskRows(client, taskIds) {
  return dataOrThrow(
    await client
      .from("tasks")
      .select("id,candidate_index,title,description,due_at,status,source_interpretation_id,planned_at,manual_priority,intentional_no_due,no_due_reason")
      .in("id", taskIds)
      .order("candidate_index", { ascending: true }),
    "read materialized task rows",
  );
}

async function taskRelations(client, taskId) {
  const [projects, contexts, people] = await Promise.all([
    dataOrThrow(await client.from("task_projects").select("project_id").eq("task_id", taskId), "read task_projects"),
    dataOrThrow(await client.from("task_contexts").select("context_id").eq("task_id", taskId), "read task_contexts"),
    dataOrThrow(await client.from("task_people").select("person_id,role").eq("task_id", taskId), "read task_people"),
  ]);
  return {
    projectIds: projects.map((row) => row.project_id).sort(),
    contextIds: contexts.map((row) => row.context_id).sort(),
    personIds: people.filter((row) => row.role === "involved").map((row) => row.person_id).sort(),
    waitingOnPersonIds: people.filter((row) => row.role === "waiting_on").map((row) => row.person_id).sort(),
  };
}

async function correct(client, fixture, label, operationKey = crypto.randomUUID()) {
  return client.rpc("correct_entry_interpretation", {
    p_entry_id: fixture.entryId,
    p_expected_version: 1,
    p_operation_key: operationKey,
    p_patch: {
      summary: `Phase 2C corrected fixture: ${label}`,
      concepts: ["task"],
      occurredAt: "2026-07-19T12:00:00Z",
      extractedDates: [],
      entityLinks: [],
      classifications: {
        summary: "interpretation",
        concepts: "interpretation",
        occurredAt: "fact",
        entities: "interpretation",
      },
      pendingQuestions: [],
      elementTrust: {
        summary: {
          score: 0.9,
          policy: "auto_apply",
          signals: {},
          overrides: [],
          evidence: [],
        },
      },
      recordOnly: false,
    },
    p_reason: `Phase 2C integration smoke correction: ${label}`,
  });
}

async function settleInterpretEntryJob(userId, entryId, label) {
  const job = dataOrThrow(
    await admin
      .from("jobs")
      .select("id")
      .eq("type", "interpret_entry")
      .eq("user_id", userId)
      .eq("payload->>entry_id", entryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    `find ${label} interpretation job`,
  );
  const workerId = `${fixturePrefix}:worker`;
  const claimed = dataOrThrow(
    await admin.rpc("claim_entry_interpretation_job", {
      p_job_id: job.id,
      p_user_id: userId,
      p_worker_id: workerId,
      p_lease_seconds: 120,
    }),
    `claim ${label} interpretation job`,
  );
  assert(claimed?.id === job.id, `${label} interpretation job was not claimed`);
  const completed = dataOrThrow(
    await admin.rpc("complete_job", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_result: {},
    }),
    `complete ${label} interpretation job`,
  );
  assert(completed?.id === job.id, `${label} interpretation job was not completed`);
}

function assertRpcError(result, code, label, details) {
  assert(result.error?.code === code, `${label} returned ${result.error?.code ?? "no error"}`);
  if (details) assert(result.error?.details === details, `${label} returned an unexpected detail token`);
}

const before = await environmentSnapshot();
let smokeSummary;

try {
  const { client: owner, user } = await createTestUser();

  const noEditFixture = await createFixture(owner, "no-edit");
  const noEdit = dataOrThrow(
    await confirm(owner, noEditFixture, "no-edit", [0], []),
    "confirm without edits",
  );
  const [noEditTask] = await taskRows(owner, noEdit.task_ids);
  assert(noEditTask.title === `${fixturePrefix} candidate zero`, "No-edit title drifted");

  const titleFixture = await createFixture(owner, "title-edit");
  const titleEdit = dataOrThrow(
    await confirm(owner, titleFixture, "title-edit", [0], [
      { candidateIndex: 0, changes: { title: `${fixturePrefix} edited title` } },
    ]),
    "confirm title edit",
  );
  const [titleTask] = await taskRows(owner, titleEdit.task_ids);
  assert(titleTask.title === `${fixturePrefix} edited title`, "Title edit was not materialized");

  const descriptionFixture = await createFixture(owner, "description-clear");
  const descriptionClear = dataOrThrow(
    await confirm(owner, descriptionFixture, "description-clear", [0], [
      { candidateIndex: 0, changes: { description: null } },
    ]),
    "confirm description clear",
  );
  const [descriptionTask] = await taskRows(owner, descriptionClear.task_ids);
  assert(descriptionTask.description === null, "Description clear was not materialized");

  const dueFixture = await createFixture(owner, "due-edit");
  const editedDueAt = "2026-08-02T10:30:00-04:00";
  const dueEdit = dataOrThrow(
    await confirm(owner, dueFixture, "due-edit", [0], [
      { candidateIndex: 0, changes: { dueAt: editedDueAt } },
    ]),
    "confirm due-date edit",
  );
  const [dueTask] = await taskRows(owner, dueEdit.task_ids);
  assert(new Date(dueTask.due_at).getTime() === new Date(editedDueAt).getTime(), "Due-date edit was not materialized");

  const multiFixture = await createFixture(owner, "multiple-partial-edits");
  const multiKey = crypto.randomUUID();
  const multiEdits = [{
    candidateIndex: 1,
    changes: { title: `${fixturePrefix} edited second candidate` },
  }];
  const multi = dataOrThrow(
    await confirm(owner, multiFixture, "multiple-partial-edits", [0, 1], multiEdits, multiKey),
    "confirm multiple candidates with partial edits",
  );
  const multiRows = await taskRows(owner, multi.task_ids);
  assert(multiRows.length === 2, "Multiple confirmation did not create two tasks");
  assert(multiRows[0].title === `${fixturePrefix} candidate zero`, "Unedited candidate changed");
  assert(multiRows[1].title === `${fixturePrefix} edited second candidate`, "Partial edit was not applied");

  const replay = dataOrThrow(
    await confirm(owner, multiFixture, "multiple-replay", [0, 1], multiEdits, multiKey),
    "replay same confirmation",
  );
  assert(replay.idempotent === true, "Same-key replay was not idempotent");
  assert(JSON.stringify(replay.task_ids) === JSON.stringify(multi.task_ids), "Replay returned different task ids");

  const mismatch = await confirm(owner, multiFixture, "multiple-mismatch", [0, 1], [
    { candidateIndex: 1, changes: { title: `${fixturePrefix} mismatched title` } },
  ], multiKey);
  assertRpcError(mismatch, "P0001", "Same-key changed-payload retry", "2C_IDEMPOTENCY_MISMATCH");

  const immutableInterpretation = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("task_candidates")
      .eq("id", multiFixture.interpretationId)
      .single(),
    "read immutable interpretation candidates",
  );
  assert(
    immutableInterpretation.task_candidates[1].title === `${fixturePrefix} candidate one`,
    "Confirmation mutated the immutable interpretation candidate",
  );

  const audit = dataOrThrow(
    await owner
      .from("audit_logs")
      .select("action_type,after_state,reason")
      .eq("source_entry_id", multiFixture.entryId)
      .eq("action_type", "tasks_confirmed")
      .single(),
    "read confirmation audit",
  );
  assert(audit.after_state?.edited_fields?.includes("title"), "Audit omitted the edited title field");
  assert(!JSON.stringify(audit).includes("Original description"), "Audit leaked candidate description content");

  const staleFixture = await createFixture(owner, "stale-interpretation");
  dataOrThrow(await correct(owner, staleFixture, "stale-interpretation"), "correct stale fixture");
  const stale = await confirm(owner, staleFixture, "stale-interpretation", [0], []);
  assertRpcError(stale, "55P03", "Stale interpretation confirmation");

  const contentionFixture = await createFixture(owner, "correction-contention");
  const contentionConfirmation = dataOrThrow(
    await confirm(owner, contentionFixture, "correction-contention", [0], []),
    "confirm contention fixture",
  );
  const blockedCorrection = await correct(owner, contentionFixture, "blocked-correction");
  assertRpcError(blockedCorrection, "55P03", "Correction after active v2 confirmation");
  const undone = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: contentionConfirmation.undo_id }),
    "undo v2 confirmation",
  );
  assert(undone.undone === true, "Undo did not report success");
  const [undoneTask] = await taskRows(owner, contentionConfirmation.task_ids);
  assert(undoneTask.status === "cancelled", "Undo did not cancel the confirmed task");
  const postUndoCorrection = dataOrThrow(
    await correct(owner, contentionFixture, "post-undo-correction"),
    "correct after undo",
  );
  assert(postUndoCorrection.interpretation_id, "Correction remained blocked after undo");

  const attentionFixture = await createFixture(owner, "needs-attention");
  await settleInterpretEntryJob(user.id, attentionFixture.entryId, "needs-attention");
  const attentionCurrent = dataOrThrow(
    await correct(owner, attentionFixture, "needs-attention"),
    "move needs-attention fixture to completed",
  );
  const attentionProjection = async () => dataOrThrow(
    await owner.rpc("list_needs_attention", {
      p_limit: 50,
      p_cursor_occurred_at: null,
      p_cursor_entry_id: null,
    }),
    "read Needs Attention projection",
  );
  const beforePartial = await attentionProjection();
  assert(
    beforePartial.some((row) => row.entry_id === attentionFixture.entryId && row.reason === "confirm_existing_candidates"),
    "Actionable fixture was missing from Needs Attention",
  );
  dataOrThrow(
    await owner.rpc("confirm_entry_task_candidates_v2", {
      p_entry_id: attentionFixture.entryId,
      p_expected_interpretation_id: attentionCurrent.interpretation_id,
      p_candidate_indexes: [0],
      p_candidate_edits: [],
      p_operation_key: crypto.randomUUID(),
    }),
    "partially confirm Needs Attention fixture",
  );
  const afterPartial = await attentionProjection();
  assert(
    afterPartial.some((row) => row.entry_id === attentionFixture.entryId && row.reason === "confirm_existing_candidates"),
    "Partial confirmation incorrectly resolved Needs Attention",
  );
  dataOrThrow(
    await owner.rpc("confirm_entry_task_candidates_v2", {
      p_entry_id: attentionFixture.entryId,
      p_expected_interpretation_id: attentionCurrent.interpretation_id,
      p_candidate_indexes: [1],
      p_candidate_edits: [],
      p_operation_key: crypto.randomUUID(),
    }),
    "finish Needs Attention fixture",
  );
  const afterComplete = await attentionProjection();
  assert(
    !afterComplete.some((row) => row.entry_id === attentionFixture.entryId),
    "Complete confirmation did not resolve Needs Attention",
  );

  // Slice 2C.2: planning, priority, and no-due semantics (v3 RPC).
  const planningFixture = await createFixture(owner, "v3-planning");
  const editedPlannedAt = "2026-08-05T09:00:00-03:00";
  const planningConfirm = dataOrThrow(
    await confirmV3(owner, planningFixture, "v3-planning", [0], [
      { candidateIndex: 0, changes: { plannedAt: editedPlannedAt, manualPriority: "urgent" } },
    ]),
    "confirm v3 planned date and priority edit",
  );
  const [planningTask] = await taskRows(owner, planningConfirm.task_ids);
  assert(new Date(planningTask.planned_at).getTime() === new Date(editedPlannedAt).getTime(), "Planned-date edit was not materialized");
  assert(planningTask.manual_priority === "urgent", "Priority edit was not materialized");
  assert(planningTask.due_at !== null, "Planned-date edit incorrectly cleared the untouched due date");

  const noDueFixture = await createFixture(owner, "v3-no-due");
  const noDueConfirm = dataOrThrow(
    await confirmV3(owner, noDueFixture, "v3-no-due", [1], [
      { candidateIndex: 1, changes: { intentionalNoDue: true, noDueReason: `${fixturePrefix} someday` } },
    ]),
    "confirm v3 intentional no-due edit",
  );
  const [noDueTask] = await taskRows(owner, noDueConfirm.task_ids);
  assert(noDueTask.intentional_no_due === true, "Intentional no-due flag was not materialized");
  assert(noDueTask.no_due_reason === `${fixturePrefix} someday`, "No-due reason was not materialized");
  assert(noDueTask.due_at === null, "Intentional no-due did not leave the due date null");

  const conflictFixture = await createFixture(owner, "v3-conflict");
  const conflict = await confirmV3(owner, conflictFixture, "v3-conflict", [0], [
    { candidateIndex: 0, changes: { intentionalNoDue: true } },
  ]);
  assertRpcError(conflict, "22023", "Intentional no-due with an effective due date");

  const raceFixture = await createFixture(owner, "v3-race");
  const raceConfirm = dataOrThrow(
    await confirmV3(owner, raceFixture, "v3-race", [0], []),
    "confirm v3 race fixture",
  );
  const blockedV3Correction = await correct(owner, raceFixture, "blocked-v3-correction");
  assertRpcError(blockedV3Correction, "55P03", "Correction after active v3 confirmation");
  const undoneV3 = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: raceConfirm.undo_id }),
    "undo v3 confirmation",
  );
  assert(undoneV3.undone === true, "Undo of a v3 confirmation did not report success");
  const postUndoV3Correction = dataOrThrow(
    await correct(owner, raceFixture, "post-undo-v3-correction"),
    "correct after v3 undo",
  );
  assert(postUndoV3Correction.interpretation_id, "Correction remained blocked after v3 undo");

  const legacyDefaultsFixture = await createFixture(owner, "v2-still-defaults");
  const legacyDefaultsConfirm = dataOrThrow(
    await confirm(owner, legacyDefaultsFixture, "v2-still-defaults", [0], []),
    "confirm legacy v2 fixture after Slice 2C.2",
  );
  const [legacyDefaultsTask] = await taskRows(owner, legacyDefaultsConfirm.task_ids);
  assert(
    legacyDefaultsTask.manual_priority === null
      && legacyDefaultsTask.planned_at === null
      && legacyDefaultsTask.intentional_no_due === false
      && legacyDefaultsTask.no_due_reason === null,
    "A v2 confirmation no longer leaves planning/priority/no-due fields at their defaults",
  );

  // Slice 2C.3: owned relations (project, context, person, waiting-on; v4 RPC).
  const ownedProject = dataOrThrow(
    await owner.from("projects").insert({ user_id: user.id, name: `${fixturePrefix} project` }).select("id").single(),
    "create owned project fixture",
  );
  const ownedContext = dataOrThrow(
    await owner.from("contexts").insert({ user_id: user.id, name: `${fixturePrefix} context` }).select("id").single(),
    "create owned context fixture",
  );
  const ownedPersonA = dataOrThrow(
    await owner.from("people").insert({ user_id: user.id, name: `${fixturePrefix} person A` }).select("id").single(),
    "create owned person A fixture",
  );
  const ownedPersonB = dataOrThrow(
    await owner.from("people").insert({ user_id: user.id, name: `${fixturePrefix} person B` }).select("id").single(),
    "create owned person B fixture",
  );

  const relationsFixture = await createFixture(owner, "v4-relations");
  const relationsConfirm = dataOrThrow(
    await confirmV4(owner, relationsFixture, "v4-relations", [0], [
      {
        candidateIndex: 0,
        changes: {
          projectIds: [ownedProject.id],
          contextIds: [ownedContext.id],
          personIds: [ownedPersonA.id],
          waitingOnPersonIds: [ownedPersonB.id],
        },
      },
    ]),
    "confirm v4 owned relations edit",
  );
  const relations = await taskRelations(owner, relationsConfirm.task_ids[0]);
  assert(JSON.stringify(relations.projectIds) === JSON.stringify([ownedProject.id]), "Project relation was not materialized");
  assert(JSON.stringify(relations.contextIds) === JSON.stringify([ownedContext.id]), "Context relation was not materialized");
  assert(JSON.stringify(relations.personIds) === JSON.stringify([ownedPersonA.id]), "Person relation was not materialized");
  assert(JSON.stringify(relations.waitingOnPersonIds) === JSON.stringify([ownedPersonB.id]), "Waiting-on relation was not materialized");

  const { client: otherOwner } = await createTestUser("other-owner");
  const otherProject = dataOrThrow(
    await otherOwner.from("projects").insert({ user_id: (await otherOwner.auth.getUser()).data.user.id, name: `${fixturePrefix} other project` }).select("id").single(),
    "create cross-owner project fixture",
  );

  const crossOwnerFixture = await createFixture(owner, "v4-cross-owner");
  const crossOwnerAttempt = await confirmV4(owner, crossOwnerFixture, "v4-cross-owner", [0], [
    { candidateIndex: 0, changes: { projectIds: [otherProject.id] } },
  ]);
  assertRpcError(crossOwnerAttempt, "22023", "Cross-owner project relation", "2C_INVALID_RELATION");
  const crossOwnerTaskCountResult = await owner
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("source_interpretation_id", crossOwnerFixture.interpretationId);
  if (crossOwnerTaskCountResult.error) throw new Error(`count tasks after cross-owner rejection: ${crossOwnerTaskCountResult.error.message}`);
  assert((crossOwnerTaskCountResult.count ?? 0) === 0, "Cross-owner attempt created a task");

  const mixedFixture = await createFixture(owner, "v4-mixed-abort");
  const mixedAttempt = await confirmV4(owner, mixedFixture, "v4-mixed-abort", [0, 1], [
    { candidateIndex: 0, changes: { projectIds: [ownedProject.id] } },
    { candidateIndex: 1, changes: { projectIds: [otherProject.id] } },
  ]);
  assertRpcError(mixedAttempt, "22023", "Mixed valid/invalid relation edit", "2C_INVALID_RELATION");
  const mixedTaskCountResult = await owner
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("source_interpretation_id", mixedFixture.interpretationId);
  if (mixedTaskCountResult.error) throw new Error(`count tasks after mixed valid/invalid rejection: ${mixedTaskCountResult.error.message}`);
  assert((mixedTaskCountResult.count ?? 0) === 0, "A partially-invalid multi-candidate confirmation was not fully atomic");

  const legacyV3RelationsFixture = await createFixture(owner, "v3-still-no-relations");
  const legacyV3RelationsConfirm = dataOrThrow(
    await confirmV3(owner, legacyV3RelationsFixture, "v3-still-no-relations", [0], []),
    "confirm legacy v3 fixture after Slice 2C.3",
  );
  const legacyV3Relations = await taskRelations(owner, legacyV3RelationsConfirm.task_ids[0]);
  assert(
    legacyV3Relations.projectIds.length === 0
      && legacyV3Relations.contextIds.length === 0
      && legacyV3Relations.personIds.length === 0
      && legacyV3Relations.waitingOnPersonIds.length === 0,
    "A v3 confirmation unexpectedly materialized relations",
  );

  // Slice 2C.4: one atomic mixed batch records all terminal dispositions,
  // materializes only confirmations, and remains fully undoable/reconfirmable.
  const v5BaseFixture = await createFixture(owner, "v5-mixed-dispositions", 4);
  await settleInterpretEntryJob(user.id, v5BaseFixture.entryId, "v5-mixed-dispositions");
  const v5Current = dataOrThrow(
    await correct(owner, v5BaseFixture, "v5-mixed-dispositions"),
    "move v5 disposition fixture to completed",
  );
  const v5Fixture = {
    entryId: v5BaseFixture.entryId,
    interpretationId: v5Current.interpretation_id,
  };
  const v5Resolutions = [
    { candidateIndex: 0, disposition: "confirmed" },
    { candidateIndex: 1, disposition: "rejected" },
    { candidateIndex: 2, disposition: "retained" },
    { candidateIndex: 3, disposition: "dismissed" },
  ];
  const v5Edits = [{
    candidateIndex: 0,
    changes: { title: `${fixturePrefix} v5 confirmed task` },
  }];
  const v5OperationKey = crypto.randomUUID();
  const v5Resolution = dataOrThrow(
    await resolveV5(owner, v5Fixture, v5Resolutions, v5Edits, v5OperationKey),
    "resolve v5 mixed disposition batch",
  );
  assert(v5Resolution.idempotent === false, "First v5 mixed batch was reported as a replay");
  assert(v5Resolution.task_ids.length === 1, "V5 mixed batch did not create exactly one task");
  const [v5Task] = await taskRows(owner, v5Resolution.task_ids);
  assert(v5Task.candidate_index === 0, "V5 created a task for a non-confirmed disposition");
  assert(v5Task.title === `${fixturePrefix} v5 confirmed task`, "V5 confirmed edit was not materialized");
  const v5Rows = dataOrThrow(
    await owner
      .from("entry_task_candidate_resolutions")
      .select("candidate_index,disposition,task_id,undo_operation_id")
      .eq("entry_id", v5Fixture.entryId)
      .eq("interpretation_id", v5Fixture.interpretationId)
      .order("candidate_index", { ascending: true }),
    "read v5 candidate disposition rows",
  );
  assert(v5Rows.length === 4, "V5 mixed batch did not persist four disposition rows");
  assert(
    JSON.stringify(v5Rows.map(({ candidate_index, disposition }) => ({ candidate_index, disposition })))
      === JSON.stringify([
        { candidate_index: 0, disposition: "confirmed" },
        { candidate_index: 1, disposition: "rejected" },
        { candidate_index: 2, disposition: "retained" },
        { candidate_index: 3, disposition: "dismissed" },
      ]),
    "V5 disposition rows did not preserve the canonical mixed outcomes",
  );
  assert(v5Rows[0].task_id === v5Task.id, "Confirmed disposition did not reference its task");
  assert(v5Rows.slice(1).every((row) => row.task_id === null), "Non-confirmed disposition referenced a task");
  assert(v5Rows.every((row) => row.undo_operation_id === v5Resolution.undo_id), "V5 disposition rows did not share the batch undo operation");

  const v5Replay = dataOrThrow(
    await resolveV5(owner, v5Fixture, v5Resolutions, v5Edits, v5OperationKey),
    "replay v5 mixed disposition batch",
  );
  assert(v5Replay.idempotent === true, "Same-key v5 replay was not idempotent");
  assert(JSON.stringify(v5Replay.task_ids) === JSON.stringify(v5Resolution.task_ids), "V5 replay returned different task ids");
  const v5TerminalRetry = await resolveV5(owner, v5Fixture, v5Resolutions, v5Edits);
  assertRpcError(v5TerminalRetry, "P0001", "V5 terminal disposition retry", "2C_TERMINAL_DISPOSITION");
  const afterV5Resolution = await attentionProjection();
  assert(
    !afterV5Resolution.some((row) => row.entry_id === v5Fixture.entryId),
    "Fully resolved v5 fixture remained actionable in Needs Attention",
  );

  const v5Undo = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: v5Resolution.undo_id }),
    "undo v5 mixed disposition batch",
  );
  assert(v5Undo.undone === true, "V5 undo did not report success");
  const [v5UndoneTask] = await taskRows(owner, v5Resolution.task_ids);
  assert(v5UndoneTask.status === "cancelled", "V5 undo did not cancel the confirmed task");
  const v5RowsAfterUndo = dataOrThrow(
    await owner
      .from("entry_task_candidate_resolutions")
      .select("id")
      .eq("entry_id", v5Fixture.entryId)
      .eq("interpretation_id", v5Fixture.interpretationId),
    "read v5 dispositions after undo",
  );
  assert(v5RowsAfterUndo.length === 0, "V5 undo did not remove terminal disposition rows");
  const afterV5Undo = await attentionProjection();
  assert(
    afterV5Undo.some((row) => row.entry_id === v5Fixture.entryId && row.reason === "confirm_existing_candidates"),
    "V5 undo did not restore candidates to pending Needs Attention",
  );

  const v5Reconfirmation = dataOrThrow(
    await resolveV5(owner, v5Fixture, [{ candidateIndex: 0, disposition: "confirmed" }], []),
    "reconfirm v5 candidate after undo",
  );
  assert(v5Reconfirmation.task_ids.length === 1, "V5 reconfirmation after undo did not create one task");
  const [v5ReconfirmedTask] = await taskRows(owner, v5Reconfirmation.task_ids);
  assert(v5ReconfirmedTask.status !== "cancelled", "V5 reconfirmation after undo created an inactive task");
  assert(v5ReconfirmedTask.candidate_index === 0, "V5 reconfirmation changed candidate identity");

  smokeSummary = {
    cases: 24,
    fixturePrefix,
    preExistingAuthUsers: before.authUserIds.length,
    preExistingTableCounts: before.tableCounts,
  };
} finally {
  await Promise.all(createdUserIds.map(async (userId) => {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error) throw new Error(`delete Phase 2C integration user: ${result.error.message}`);
  }));
}

const after = await environmentSnapshot();
const remainingUsers = (await listAllUsers()).filter((user) => user.email?.startsWith(fixturePrefix));
const remainingEntries = await admin
  .from("entries")
  .select("id", { count: "exact", head: true })
  .like("original_content", `Phase 2C integration smoke: ${fixturePrefix}%`);
if (remainingEntries.error) throw remainingEntries.error;

assert(remainingUsers.length === 0, "Disposable Phase 2C Auth user remained after cleanup");
assert((remainingEntries.count ?? 0) === 0, "Disposable Phase 2C entries remained after cleanup");
assert(
  JSON.stringify(after.authUserIds) === JSON.stringify(before.authUserIds),
  "Pre-existing Auth users changed during the smoke",
);
assert(
  JSON.stringify(after.tableCounts) === JSON.stringify(before.tableCounts),
  "Pre-existing table counts changed during the smoke",
);

console.log(JSON.stringify({
  status: "passed",
  ...smokeSummary,
  cleanup: {
    remainingPrefixedUsers: remainingUsers.length,
    remainingPrefixedEntries: remainingEntries.count ?? 0,
    authUsersPreserved: true,
    tableCountsPreserved: true,
  },
}, null, 2));
