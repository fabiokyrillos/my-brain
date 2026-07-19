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

// persist_entry_interpretation always scores through model_only_element_trust,
// whose score never reaches the auto_apply threshold (see
// interpretation_lifecycle_status/model_only_element_trust in migration 020) —
// every AI-only interpretation therefore lands in awaiting_review, by design,
// never completed. Reaching a completed entry with actionable-but-unconfirmed
// candidates (the needs-attention "confirm_existing_candidates" case) requires
// a real correction with an explicit auto_apply element trust, exactly like a
// user resolving the review would produce.
async function moveToCompletedWithSameCandidates(client, entryId, expectedVersion, label) {
  return dataOrThrow(
    await client.rpc("correct_entry_interpretation", {
      p_entry_id: entryId,
      p_expected_version: expectedVersion,
      p_operation_key: `remote-daily-cycle:${label}:${suffix}`,
      p_patch: {
        summary: `Remote daily-cycle fixture, completed: ${label}`,
        concepts: ["task"],
        occurredAt: new Date().toISOString(),
        extractedDates: [],
        entityLinks: [],
        classifications: { summary: "interpretation", concepts: "interpretation", occurredAt: "fact", entities: "interpretation" },
        pendingQuestions: [],
        elementTrust: { summary: { score: 0.9, policy: "auto_apply", signals: {}, overrides: [], evidence: [] } },
        recordOnly: false,
      },
      p_reason: `Remote daily-cycle smoke: move ${label} to completed`,
    }),
    `correct ${label} to a completed, auto_apply interpretation`,
  );
}

// capture_entry_async atomically enqueues an interpret_entry job alongside
// the entry; the deployed worker always claims and completes that exact job
// in the same cycle it calls persist_entry_interpretation. This smoke calls
// persist_entry_interpretation directly (a real fixture shortcut used
// throughout this file), which leaves the job at its default "pending"
// status unless something settles it — and list_needs_attention correctly
// treats a still-pending interpret_entry job as "organizing" regardless of
// entries.status, exactly like the daily-cycle lifecycle mapper already does
// for Inbox/Home. Settling the job here reproduces what the real worker
// guarantees, using the service-role client since claim/complete are
// service_role-only.
async function settleInterpretEntryJob(userId, entryId, label) {
  const jobRow = dataOrThrow(
    await admin
      .from("jobs")
      .select("id")
      .eq("type", "interpret_entry")
      .eq("user_id", userId)
      .eq("payload->>entry_id", entryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    `find the interpret_entry job for ${label}`,
  );
  const workerId = `remote-daily-cycle-smoke-worker:${suffix}`;
  const claimed = dataOrThrow(
    await admin.rpc("claim_entry_interpretation_job", {
      p_job_id: jobRow.id,
      p_user_id: userId,
      p_worker_id: workerId,
      p_lease_seconds: 120,
    }),
    `claim the interpret_entry job for ${label}`,
  );
  assert(claimed?.id === jobRow.id, `Could not claim the interpret_entry job for ${label}`);
  const completed = dataOrThrow(
    await admin.rpc("complete_job", { p_job_id: jobRow.id, p_worker_id: workerId, p_result: {} }),
    `complete the interpret_entry job for ${label}`,
  );
  assert(completed?.id === jobRow.id, `Could not complete the interpret_entry job for ${label}`);
}

try {
  const [{ client: owner, user: ownerUser }, { client: other, user: otherUser }] = await Promise.all([
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

  // --- Slice 2X.10: the Needs Attention queue (list_needs_attention) reads
  // real captured/interpreted/confirmed state, not injected booleans. -------
  const attentionEntryId = await captureFixtureEntry(owner, "needs-attention-candidates");
  dataOrThrow(
    await owner.rpc("persist_entry_interpretation", {
      p_entry_id: attentionEntryId,
      p_extraction: fixtureExtraction(),
      p_model: "gpt-test",
      p_strategy_version: "smoke-v1",
      p_prompt_version: "smoke-v1",
      p_input_tokens: 10,
      p_output_tokens: 10,
    }),
    "persist interpretation for the needs-attention fixture",
  );
  await settleInterpretEntryJob(ownerUser.id, attentionEntryId, "attention-candidates");
  const attentionCompletion = await moveToCompletedWithSameCandidates(owner, attentionEntryId, 1, "attention-candidates");
  const attentionInterpretationId = attentionCompletion.interpretation_id;

  const listOwnerAttention = async () => dataOrThrow(
    await owner.rpc("list_needs_attention", { p_limit: 50, p_cursor_occurred_at: null, p_cursor_entry_id: null }),
    "list needs-attention queue as owner",
  );
  const findAttentionRow = (rows, id) => rows.find((candidateRow) => candidateRow.entry_id === id);

  const beforeConfirmStart = Date.now();
  const beforeConfirm = await listOwnerAttention();
  const beforeConfirmElapsedMs = Date.now() - beforeConfirmStart;
  assert(beforeConfirmElapsedMs < 5000, `list_needs_attention took ${beforeConfirmElapsedMs}ms, expected a bounded response`);
  const qualifyingRow = findAttentionRow(beforeConfirm, attentionEntryId);
  assert(qualifyingRow?.reason === "confirm_existing_candidates", "an entry with unconfirmed current-interpretation candidates did not appear in the needs-attention queue");
  assert(qualifyingRow.current_interpretation_id === attentionInterpretationId, "the queued row did not carry the current interpretation id for candidate-confirmation binding");

  dataOrThrow(
    await owner.rpc("confirm_entry_task_candidates", {
      p_entry_id: attentionEntryId,
      p_expected_interpretation_id: attentionInterpretationId,
      p_candidate_indexes: [0],
      p_operation_key: `remote-daily-cycle:attention-partial:${suffix}`,
    }),
    "partially confirm the needs-attention fixture's candidates",
  );
  const afterPartialConfirm = await listOwnerAttention();
  assert(
    findAttentionRow(afterPartialConfirm, attentionEntryId)?.reason === "confirm_existing_candidates",
    "an entry with one of two current candidates confirmed was removed from the queue instead of remaining actionable",
  );

  dataOrThrow(
    await owner.rpc("confirm_entry_task_candidates", {
      p_entry_id: attentionEntryId,
      p_expected_interpretation_id: attentionInterpretationId,
      p_candidate_indexes: [1],
      p_operation_key: `remote-daily-cycle:attention-final:${suffix}`,
    }),
    "confirm the needs-attention fixture's remaining candidate",
  );
  const afterFullConfirm = await listOwnerAttention();
  assert(
    findAttentionRow(afterFullConfirm, attentionEntryId) === undefined,
    "an entry with every current candidate confirmed was not resolved out of the needs-attention queue (NY-013)",
  );

  // --- Cross-user isolation for the aggregated queue itself, not just a
  // single RPC call. ----------------------------------------------------
  const otherAttentionEntryId = await captureFixtureEntry(other, "needs-attention-other-owner");
  dataOrThrow(
    await other.rpc("persist_entry_interpretation", {
      p_entry_id: otherAttentionEntryId,
      p_extraction: fixtureExtraction(),
      p_model: "gpt-test",
      p_strategy_version: "smoke-v1",
      p_prompt_version: "smoke-v1",
      p_input_tokens: 10,
      p_output_tokens: 10,
    }),
    "persist interpretation for the other-owner needs-attention fixture",
  );
  await settleInterpretEntryJob(otherUser.id, otherAttentionEntryId, "attention-other-owner");
  await moveToCompletedWithSameCandidates(other, otherAttentionEntryId, 1, "attention-other-owner");
  const ownerAttentionAfterOtherCapture = await listOwnerAttention();
  assert(
    findAttentionRow(ownerAttentionAfterOtherCapture, otherAttentionEntryId) === undefined,
    "the owner's needs-attention queue leaked another owner's entry",
  );
  const otherAttentionRows = dataOrThrow(
    await other.rpc("list_needs_attention", { p_limit: 50, p_cursor_occurred_at: null, p_cursor_entry_id: null }),
    "list needs-attention queue as the other owner",
  );
  assert(
    findAttentionRow(otherAttentionRows, otherAttentionEntryId)?.reason === "confirm_existing_candidates",
    "the other owner's own needs-attention entry did not appear in their own queue",
  );
  assert(
    findAttentionRow(otherAttentionRows, attentionEntryId) === undefined,
    "the other owner's needs-attention queue leaked the first owner's entry",
  );

  // --- Deterministic keyset pagination across a real, larger fixture set. -
  for (let index = 0; index < 3; index += 1) {
    const paginationEntryId = await captureFixtureEntry(owner, `needs-attention-pagination-${index}`);
    dataOrThrow(
      await owner.rpc("persist_entry_interpretation", {
        p_entry_id: paginationEntryId,
        p_extraction: fixtureExtraction(),
        p_model: "gpt-test",
        p_strategy_version: "smoke-v1",
        p_prompt_version: "smoke-v1",
        p_input_tokens: 10,
        p_output_tokens: 10,
      }),
      `persist interpretation for needs-attention pagination fixture ${index}`,
    );
    await settleInterpretEntryJob(ownerUser.id, paginationEntryId, `attention-pagination-${index}`);
  }
  const paginationPageOne = dataOrThrow(
    await owner.rpc("list_needs_attention", { p_limit: 2, p_cursor_occurred_at: null, p_cursor_entry_id: null }),
    "load the first needs-attention pagination page",
  );
  assert(paginationPageOne.length === 2, "the first keyset page did not honor the requested limit");
  const cursorRow = paginationPageOne[paginationPageOne.length - 1];
  const paginationPageTwo = dataOrThrow(
    await owner.rpc("list_needs_attention", {
      p_limit: 50,
      p_cursor_occurred_at: cursorRow.occurred_at,
      p_cursor_entry_id: cursorRow.entry_id,
    }),
    "load the next needs-attention pagination page",
  );
  const pageOneIds = new Set(paginationPageOne.map((pageRow) => pageRow.entry_id));
  const overlap = paginationPageTwo.filter((pageRow) => pageOneIds.has(pageRow.entry_id));
  assert(overlap.length === 0, "consecutive keyset pages returned an overlapping/duplicated row");

  console.log("Remote daily-cycle smoke passed: current-interpretation binding, stale/out-of-range rejection, idempotent replay, correction survivability, concurrent confirmation race safety, record-only enforcement, cross-user isolation, scoped undo, and the needs-attention queue's real qualification/resolution/isolation/pagination behavior.");
} finally {
  await Promise.all(createdUsers.map(async (userId) => {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) {
      console.error(`Could not remove daily-cycle test user ${userId}: ${cleanup.error.code ?? "unknown"}`);
      process.exitCode = 1;
    }
  }));
}
