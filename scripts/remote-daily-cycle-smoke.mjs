import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function dataOrThrow(result, label) {
  if (result.error) {
    throw new Error(`${label} (${result.error.code ?? "unknown"}): ${result.error.message}`);
  }
  return result.data;
}

function fixtureExtraction(overrides = {}) {
  return {
    summary: "Remote daily-cycle candidate fixture",
    concepts: ["task"],
    occurredAt: new Date().toISOString(),
    confidence: 0.9,
    taskCandidates: [
      { title: "Candidate zero", confidence: 0.9 },
      { title: "Candidate one", confidence: 0.8 },
    ],
    pendingQuestions: [],
    ...overrides,
  };
}

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `DailyCycle-${crypto.randomUUID()}-Aa1!`;
const createdUsers = [];

async function createTestUser(index) {
  const user = dataOrThrow(
    await admin.auth.admin.createUser({
      email: `phase-2x-daily-cycle-${index}-${suffix}@example.test`,
      password,
      email_confirm: true,
    }),
    `create daily-cycle test user ${index}`,
  ).user;
  assert(user, `Daily-cycle test user ${index} was not returned`);
  createdUsers.push(user.id);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(
    await client.auth.signInWithPassword({ email: user.email, password }),
    `sign in daily-cycle test user ${index}`,
  );
  return { client, user };
}

async function captureFixtureEntry(client, label) {
  const key = `remote-daily-cycle-capture:${label}:${suffix}`;
  const capture = dataOrThrow(
    await client.rpc("capture_entry_async", {
      p_original_content: `Remote daily-cycle fixture: ${label}`,
      p_locale: "en",
      p_source: "web",
      p_idempotency_key: key,
    }),
    `capture daily-cycle fixture entry (${label})`,
  );
  assert(capture.status === "saved" && capture.entry_id, `Fixture capture for ${label} did not persist`);
  return capture.entry_id;
}

async function currentInterpretationId(client, entryId) {
  const entry = dataOrThrow(
    await client.from("entries").select("current_interpretation_id").eq("id", entryId).single(),
    "read current interpretation pointer",
  );
  assert(entry.current_interpretation_id, "Entry has no current interpretation pointer");
  return entry.current_interpretation_id;
}

try {
  const [{ client: owner }, { client: other }] = await Promise.all([
    createTestUser(1),
    createTestUser(2),
  ]);

  // --- COH-001/COH-011: a candidate is only actionable against the exact
  // interpretation the caller declares as current. ---------------------
  const entryId = await captureFixtureEntry(owner, "candidate-consistency");
  const interpretationV1 = dataOrThrow(
    await owner.rpc("persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: fixtureExtraction(),
      p_model: "gpt-test",
      p_strategy_version: "smoke-v1",
      p_prompt_version: "smoke-v1",
      p_input_tokens: 10,
      p_output_tokens: 10,
    }),
    "persist v1 interpretation",
  );
  assert(interpretationV1 === (await currentInterpretationId(owner, entryId)), "v1 interpretation did not become current");

  const staleExpectation = await owner.rpc("confirm_entry_task_candidates", {
    p_entry_id: entryId,
    p_expected_interpretation_id: crypto.randomUUID(),
    p_candidate_indexes: [0],
    p_operation_key: `remote-daily-cycle:stale:${suffix}`,
  });
  assert(staleExpectation.error?.code === "55P03", "Confirming against a fabricated interpretation id was not rejected as a version conflict");

  const badIndex = await owner.rpc("confirm_entry_task_candidates", {
    p_entry_id: entryId,
    p_expected_interpretation_id: interpretationV1,
    p_candidate_indexes: [99],
    p_operation_key: `remote-daily-cycle:bad-index:${suffix}`,
  });
  assert(badIndex.error?.code === "22023", "An out-of-range candidate index was not rejected");

  const v1OperationKey = `remote-daily-cycle:v1-candidate-zero:${suffix}`;
  const v1Confirm = dataOrThrow(
    await owner.rpc("confirm_entry_task_candidates", {
      p_entry_id: entryId,
      p_expected_interpretation_id: interpretationV1,
      p_candidate_indexes: [0],
      p_operation_key: v1OperationKey,
    }),
    "confirm v1 candidate zero",
  );
  assert(v1Confirm.idempotent === false && v1Confirm.task_ids?.length === 1, "Confirming a current candidate did not create exactly one task");

  const v1Replay = dataOrThrow(
    await owner.rpc("confirm_entry_task_candidates", {
      p_entry_id: entryId,
      p_expected_interpretation_id: interpretationV1,
      p_candidate_indexes: [0],
      p_operation_key: v1OperationKey,
    }),
    "replay v1 candidate zero confirmation",
  );
  assert(v1Replay.idempotent === true && v1Replay.task_ids?.length === 1, "Replaying the same operation key duplicated the task");

  // --- COH-002/COH-005: a correction invalidates the inherited candidate
  // at the same index, but the already-confirmed task survives. ---------
  const correctionKey = `remote-daily-cycle:correct-v2:${suffix}`;
  const correction = dataOrThrow(
    await owner.rpc("correct_entry_interpretation", {
      p_entry_id: entryId,
      p_expected_version: 1,
      p_operation_key: correctionKey,
      p_patch: {
        summary: "Corrected fixture",
        concepts: ["task"],
        occurredAt: new Date().toISOString(),
        extractedDates: [],
        entityLinks: [],
        classifications: { summary: "interpretation", concepts: "interpretation", occurredAt: "fact", entities: "interpretation" },
        pendingQuestions: [],
        elementTrust: { summary: { score: 0.9, policy: "auto_apply", signals: {}, overrides: [], evidence: [] } },
        recordOnly: false,
      },
      p_reason: "Remote daily-cycle smoke correction",
    }),
    "correct interpretation to v2",
  );
  const interpretationV2 = correction.interpretation_id;
  assert(interpretationV2 && interpretationV2 !== interpretationV1, "Correction did not append a new interpretation");
  assert(interpretationV2 === (await currentInterpretationId(owner, entryId)), "v2 interpretation did not become current");

  const v2OperationKey = `remote-daily-cycle:v2-candidate-zero:${suffix}`;
  const v2Confirm = dataOrThrow(
    await owner.rpc("confirm_entry_task_candidates", {
      p_entry_id: entryId,
      p_expected_interpretation_id: interpretationV2,
      p_candidate_indexes: [0],
      p_operation_key: v2OperationKey,
    }),
    "confirm v2 candidate zero",
  );
  assert(v2Confirm.idempotent === false, "The same candidate index in a newer interpretation was not independently confirmable");
  assert(v2Confirm.task_ids?.[0] !== v1Confirm.task_ids?.[0], "Confirming v2's candidate reused v1's task instead of creating a new one");

  const v1TaskAfterCorrection = dataOrThrow(
    await owner.from("tasks").select("status").eq("id", v1Confirm.task_ids[0]).single(),
    "read v1 task after correction",
  );
  assert(v1TaskAfterCorrection.status !== "cancelled", "A task confirmed before a correction did not survive the correction");

  // --- Concurrency: two racing confirmations for the same candidate under
  // the same interpretation must not create two tasks. ------------------
  const raceEntryId = await captureFixtureEntry(owner, "confirm-race");
  const raceInterpretationId = dataOrThrow(
    await owner.rpc("persist_entry_interpretation", {
      p_entry_id: raceEntryId,
      p_extraction: fixtureExtraction(),
      p_model: "gpt-test",
      p_strategy_version: "smoke-v1",
      p_prompt_version: "smoke-v1",
      p_input_tokens: 10,
      p_output_tokens: 10,
    }),
    "persist interpretation for the confirmation race fixture",
  );
  const raceResults = await Promise.all([
    owner.rpc("confirm_entry_task_candidates", {
      p_entry_id: raceEntryId,
      p_expected_interpretation_id: raceInterpretationId,
      p_candidate_indexes: [0],
      p_operation_key: `remote-daily-cycle:race-a:${suffix}`,
    }),
    owner.rpc("confirm_entry_task_candidates", {
      p_entry_id: raceEntryId,
      p_expected_interpretation_id: raceInterpretationId,
      p_candidate_indexes: [0],
      p_operation_key: `remote-daily-cycle:race-b:${suffix}`,
    }),
  ]);
  const raceValues = raceResults.map((result, index) => dataOrThrow(result, `confirmation race branch ${index}`));
  assert(raceValues[0].task_ids[0] === raceValues[1].task_ids[0], "A concurrent confirmation race produced two different tasks for the same candidate");
  const raceTasks = dataOrThrow(
    await owner.from("tasks").select("id").eq("source_interpretation_id", raceInterpretationId).eq("candidate_index", 0),
    "list tasks created by the confirmation race",
  );
  assert(raceTasks.length === 1, "A confirmation race under the same interpretation created more than one task");

  // --- COH-004: a record-only interpretation has zero actionable
  // candidates. ------------------------------------------------------
  const recordOnlyKey = `remote-daily-cycle:record-only:${suffix}`;
  const recordOnlyCorrection = dataOrThrow(
    await owner.rpc("correct_entry_interpretation", {
      p_entry_id: entryId,
      p_expected_version: 2,
      p_operation_key: recordOnlyKey,
      p_patch: {
        summary: "Record-only fixture",
        concepts: ["note"],
        occurredAt: new Date().toISOString(),
        extractedDates: [],
        entityLinks: [],
        classifications: { summary: "interpretation", concepts: "interpretation", occurredAt: "fact", entities: "interpretation" },
        pendingQuestions: [],
        elementTrust: { summary: { score: 0.9, policy: "auto_apply", signals: {}, overrides: [], evidence: [] } },
        recordOnly: true,
      },
      p_reason: "Remote daily-cycle smoke record-only correction",
    }),
    "correct interpretation to record-only",
  );
  const interpretationV3 = recordOnlyCorrection.interpretation_id;
  const persistedV3 = dataOrThrow(
    await owner.from("entry_interpretations").select("is_record_only").eq("id", interpretationV3).single(),
    "read persisted record-only flag",
  );
  assert(persistedV3.is_record_only === true, "A record-only correction did not persist is_record_only");
  const recordOnlyConfirm = await owner.rpc("confirm_entry_task_candidates", {
    p_entry_id: entryId,
    p_expected_interpretation_id: interpretationV3,
    p_candidate_indexes: [1],
    p_operation_key: `remote-daily-cycle:record-only-blocked:${suffix}`,
  });
  assert(recordOnlyConfirm.error?.code === "55000", "A record-only interpretation allowed a candidate to be confirmed");

  // --- Cross-user isolation. ------------------------------------------
  const crossUserConfirm = await other.rpc("confirm_entry_task_candidates", {
    p_entry_id: entryId,
    p_expected_interpretation_id: crypto.randomUUID(),
    p_candidate_indexes: [0],
    p_operation_key: `remote-daily-cycle:cross-user:${suffix}`,
  });
  assert(crossUserConfirm.error?.code === "P0002", "Cross-user confirmation disclosed or accepted another user's entry");

  // --- Undo frees the slot for a fresh, independent confirmation. -----
  const v2Undo = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: v2Confirm.undo_id }),
    "undo the v2 confirmation",
  );
  assert(v2Undo.undone === true, "Undoing the v2 confirmation did not report success");
  const v2TaskAfterUndo = dataOrThrow(
    await owner.from("tasks").select("status").eq("id", v2Confirm.task_ids[0]).single(),
    "read v2 task after undo",
  );
  assert(v2TaskAfterUndo.status === "cancelled", "Undoing the v2 confirmation did not cancel its task");
  const v1TaskAfterV2Undo = dataOrThrow(
    await owner.from("tasks").select("status").eq("id", v1Confirm.task_ids[0]).single(),
    "read v1 task after the unrelated v2 undo",
  );
  assert(v1TaskAfterV2Undo.status !== "cancelled", "Undoing the v2 confirmation incorrectly touched the unrelated v1 task");

  console.log("Remote daily-cycle smoke passed: current-interpretation binding, stale/out-of-range rejection, idempotent replay, correction survivability, concurrent confirmation race safety, record-only enforcement, cross-user isolation, and scoped undo.");
} finally {
  await Promise.all(createdUsers.map(async (userId) => {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) console.error(`Could not remove daily-cycle test user ${userId}: ${cleanup.error.code ?? "unknown"}`);
  }));
}
