// Phase 2D Slice 2D.4 — authenticated remote smoke for the confirmed
// reinterpretation consequence (resolve_pending_question_v3).
//
// Proves, against the linked development project with disposable fixtures:
//   - the exact v3 signature and security posture (grants);
//   - the closed consequence enum: an unknown consequence value, or a
//     consequence key on any non-answer kind, rejects with 22023 leaving no
//     evidence;
//   - answering with consequence 'none' (and absent, canonicalized to 'none')
//     behaves exactly like the plain answer and applies no reinterpretation;
//   - answering with an explicitly confirmed 'reinterpret' consequence
//     atomically records the answer AND enqueues one interpret_entry reprocess
//     job through the existing owner-scoped path, and returns the truthful
//     consequence_status;
//   - three distinct, non-duplicated audit events
//     (resolve_pending_question_v3, question_consequence_confirmed,
//     entry_reprocessing_enqueued);
//   - the consequence is idempotent per operation key: replay returns the
//     original result and never enqueues a second job; the same key with a
//     different consequence is a deterministic P0001/2D_IDEMPOTENCY_MISMATCH;
//   - undo restores the question to open, cancels the un-claimed reprocess
//     job, and preserves the immutable interpretation; it is idempotent;
//   - a reinterpretation whose job the worker already claimed is compensated
//     as in_progress, never deleting a produced revision;
//   - v1 and v2 remain callable and namespace-isolated;
//   - the 2C-UNDO-004 forward fix: undo_operation no longer contains the
//     gateway-hanging SQLSTATE 40001, and undoing a correction after a newer
//     revision returns promptly with 55P03 rather than hanging;
//   - the content-free question_reinterpret_applied product-event allowlist.
//
// Cleanup is fail-closed: any leftover fixture fails the smoke.

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

function assertRpcError(result, code, label, details) {
  assert(result.error?.code === code, `${label} returned ${result.error?.code ?? "no error"}`);
  if (details) assert(result.error?.details === details, `${label} returned an unexpected detail token`);
}

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const fixturePrefix = `phase-2d-reinterpret-${suffix}`;
const password = `Phase2D-${crypto.randomUUID()}-Aa1!`;
const createdUserIds = [];
const countedTables = [
  "profiles",
  "entries",
  "entry_interpretations",
  "pending_questions",
  "undo_operations",
  "audit_logs",
  "jobs",
  "tasks",
];

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

async function createTestUser(label) {
  const email = `${fixturePrefix}-${label}@example.test`;
  const user = dataOrThrow(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    "create Phase 2D reinterpretation user",
  ).user;
  assert(user, "Phase 2D reinterpretation user was not returned");
  createdUserIds.push(user.id);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(
    await client.auth.signInWithPassword({ email, password }),
    "sign in Phase 2D reinterpretation user",
  );
  return { client, user };
}

// Claim and complete the capture's interpret_entry job as the deployed worker
// would, so the unattended per-minute drain can never reinterpret a fixture
// mid-smoke and invalidate consequence assertions.
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
    await admin.rpc("complete_job", { p_job_id: job.id, p_worker_id: workerId, p_result: {} }),
    `complete ${label} interpretation job`,
  );
  assert(completed?.id === job.id, `${label} interpretation job was not completed`);
}

async function createQuestionFixture(client, userId, label) {
  const captured = dataOrThrow(
    await client.rpc("capture_entry_async", {
      p_original_content: `Phase 2D reinterpretation smoke: ${fixturePrefix}:${label}`,
      p_locale: "pt-BR",
      p_source: "web",
      p_idempotency_key: `${fixturePrefix}:capture:${label}`,
    }),
    `capture ${label}`,
  );
  assert(captured.entry_id, `${label} capture returned no entry`);
  await settleInterpretEntryJob(userId, captured.entry_id, label);

  const interpretationId = dataOrThrow(
    await client.rpc("persist_entry_interpretation", {
      p_entry_id: captured.entry_id,
      p_extraction: {
        summary: `Phase 2D reinterpretation smoke: ${label}`,
        concepts: ["pending_question"],
        occurredAt: "2026-07-23T12:00:00Z",
        confidence: 0.6,
        taskCandidates: [],
        pendingQuestions: [
          {
            question: `${fixturePrefix} ${label}: qual é o prazo final?`,
            reason: "Nenhum prazo foi mencionado.",
            confidence: 0.5,
          },
        ],
      },
      p_model: "gpt-test",
      p_strategy_version: "phase-2d-reinterpret-smoke",
      p_prompt_version: "phase-2d-reinterpret-smoke",
      p_input_tokens: 10,
      p_output_tokens: 10,
    }),
    `persist ${label} interpretation`,
  );
  assert(interpretationId, `${label} persistence returned no interpretation`);

  const question = dataOrThrow(
    await client
      .from("pending_questions")
      .select("id,status,interpretation_id")
      .eq("entry_id", captured.entry_id)
      .single(),
    `load ${label} question`,
  );
  assert(question.status === "open", `${label} question did not materialize open`);
  return { entryId: captured.entry_id, interpretationId, questionId: question.id };
}

const resolveV3 = (client, questionId, resolution, operationKey = crypto.randomUUID()) =>
  client.rpc("resolve_pending_question_v3", {
    p_question_id: questionId,
    p_resolution: resolution,
    p_operation_key: operationKey,
  }).then((result) => ({ ...result, operationKey }));

async function questionRow(client, questionId) {
  return dataOrThrow(
    await client
      .from("pending_questions")
      .select("id,status,answer,answered_at,snoozed_until,interpretation_id")
      .eq("id", questionId)
      .single(),
    "read question row",
  );
}

async function reprocessJobs(userId, entryId) {
  return dataOrThrow(
    await admin
      .from("jobs")
      .select("id,status,payload,idempotency_key")
      .eq("user_id", userId)
      .eq("type", "interpret_entry")
      .eq("payload->>entry_id", entryId)
      .eq("payload->>mode", "reprocess"),
    "load reprocess jobs",
  );
}

const before = await environmentSnapshot();
let smokeSummary;

try {
  const { client: owner, user: ownerUser } = await createTestUser("owner");
  const { client: otherOwner } = await createTestUser("other");

  // --- Structural: grants -----------------------------------------------------
  const anonymous = createClient(credentials.url, credentials.publishableKey, clientOptions);

  // --- Closed consequence shape (v3) -----------------------------------------
  const shapeFixture = await createQuestionFixture(owner, ownerUser.id, "shape");
  assertRpcError(
    await resolveV3(owner, shapeFixture.questionId, {
      kind: "answer",
      answer: "amanhã",
      consequence: "reprocess",
    }, `${fixturePrefix}-bad-consequence`),
    "22023",
    "unknown consequence value",
  );
  assertRpcError(
    await resolveV3(owner, shapeFixture.questionId, {
      kind: "answer",
      answer: "amanhã",
      consequence: "REINTERPRET",
    }, `${fixturePrefix}-bad-consequence-case`),
    "22023",
    "case-sensitive consequence",
  );
  assertRpcError(
    await resolveV3(owner, shapeFixture.questionId, {
      kind: "dismissed",
      consequence: "reinterpret",
    }, `${fixturePrefix}-consequence-on-dismissed`),
    "22023",
    "consequence on a non-answer kind",
  );
  assertRpcError(
    await resolveV3(owner, shapeFixture.questionId, {
      kind: "deferred",
      snoozedUntil: new Date(Date.now() + 86_400_000).toISOString(),
      consequence: "none",
    }, `${fixturePrefix}-consequence-on-deferred`),
    "22023",
    "consequence on a deferral",
  );
  const rejectedEvidence = await admin
    .from("undo_operations")
    .select("id", { count: "exact", head: true })
    .like("operation_key", `resolve-v3:${fixturePrefix}-bad-%`)
    .or(`operation_key.like.resolve-v3:${fixturePrefix}-consequence-%`);
  if (rejectedEvidence.error) throw rejectedEvidence.error;
  assert((rejectedEvidence.count ?? 0) === 0, "Rejected consequence attempts left reserved evidence");
  const shapeQuestion = await questionRow(owner, shapeFixture.questionId);
  assert(shapeQuestion.status === "open", "Rejected consequence changed the question state");

  // --- Ownership and anonymity (v3) ------------------------------------------
  const v3CrossOwner = await resolveV3(
    otherOwner,
    shapeFixture.questionId,
    { kind: "answer", answer: "cross" },
    `${fixturePrefix}-cross`,
  );
  assertRpcError(v3CrossOwner, "P0002", "v3 cross-owner");
  const v3Missing = await resolveV3(
    owner,
    crypto.randomUUID(),
    { kind: "answer", answer: "missing" },
    `${fixturePrefix}-missing`,
  );
  assertRpcError(v3Missing, "P0002", "v3 missing question");
  assert(
    v3CrossOwner.error.message === v3Missing.error.message,
    "v3 cross-owner denial distinguishable from missing",
  );
  const v3Anonymous = await anonymous.rpc("resolve_pending_question_v3", {
    p_question_id: shapeFixture.questionId,
    p_resolution: { kind: "answer", answer: "anon" },
    p_operation_key: `${fixturePrefix}-anon`,
  });
  assert(v3Anonymous.error, "Anonymous v3 resolution did not fail");

  // --- Answer with consequence 'none' applies no reinterpretation -------------
  const plainFixture = await createQuestionFixture(owner, ownerUser.id, "plain");
  const plainResult = dataOrThrow(
    await resolveV3(owner, plainFixture.questionId, {
      kind: "answer",
      answer: "Sexta-feira às 14h",
      consequence: "none",
    }, `${fixturePrefix}-plain`),
    "answer with consequence none",
  );
  assert(plainResult.resolution === "answered", "plain answer not recorded as answered");
  assert(plainResult.consequence === "none", "plain answer consequence not none");
  assert(plainResult.consequence_status === "none", "plain answer produced a consequence status");
  assert((await reprocessJobs(ownerUser.id, plainFixture.entryId)).length === 0,
    "answer with consequence none enqueued a reprocess job");

  // --- Absent consequence canonicalizes to none and replays identically ------
  const absentFixture = await createQuestionFixture(owner, ownerUser.id, "absent");
  const absentKey = `${fixturePrefix}-absent`;
  const absentFirst = dataOrThrow(
    await resolveV3(owner, absentFixture.questionId, {
      kind: "answer",
      answer: "Depende do cliente",
    }, absentKey),
    "answer without consequence key",
  );
  assert(absentFirst.consequence === "none", "absent consequence did not canonicalize to none");
  // Same key + explicit 'none' is the same canonical payload → replay, not mismatch.
  const absentReplay = dataOrThrow(
    await resolveV3(owner, absentFixture.questionId, {
      kind: "answer",
      answer: "Depende do cliente",
      consequence: "none",
    }, absentKey),
    "explicit-none replay of an absent-consequence answer",
  );
  assert(absentReplay.idempotent === true, "explicit none did not replay the absent-consequence answer");
  assert(absentReplay.undo_id === absentFirst.undo_id, "replay returned a different undo id");
  // Same key + 'reinterpret' is a different canonical payload → mismatch.
  assertRpcError(
    await resolveV3(owner, absentFixture.questionId, {
      kind: "answer",
      answer: "Depende do cliente",
      consequence: "reinterpret",
    }, absentKey),
    "P0001",
    "consequence-mismatch replay",
    "2D_IDEMPOTENCY_MISMATCH",
  );

  // --- Confirmed reinterpretation: atomic answer + enqueue + audit ------------
  const reinterpretFixture = await createQuestionFixture(owner, ownerUser.id, "reinterpret");
  const reinterpretKey = `${fixturePrefix}-reinterpret`;
  const reinterpretResult = dataOrThrow(
    await resolveV3(owner, reinterpretFixture.questionId, {
      kind: "answer",
      answer: "O prazo é 30 de julho",
      consequence: "reinterpret",
    }, reinterpretKey),
    "confirmed reinterpretation",
  );
  assert(reinterpretResult.resolution === "answered", "reinterpret answer not recorded");
  assert(reinterpretResult.consequence === "reinterpret", "reinterpret consequence missing");
  assert(reinterpretResult.consequence_status === "reinterpretation_queued",
    "reinterpret consequence status not queued");
  assert(reinterpretResult.idempotent === false, "first reinterpret was flagged idempotent");

  const reinterpretQuestion = await questionRow(owner, reinterpretFixture.questionId);
  assert(reinterpretQuestion.status === "answered", "reinterpret question not answered");
  assert(reinterpretQuestion.answer === "O prazo é 30 de julho", "reinterpret answer not persisted");

  const enqueuedJobs = await reprocessJobs(ownerUser.id, reinterpretFixture.entryId);
  assert(enqueuedJobs.length === 1, "confirmed reinterpretation did not enqueue exactly one job");
  assert(enqueuedJobs[0].status === "pending", "reprocess job was not pending");

  const auditRows = dataOrThrow(
    await admin
      .from("audit_logs")
      .select("action_type")
      .eq("user_id", ownerUser.id)
      .eq("source_entry_id", reinterpretFixture.entryId)
      .in("action_type", [
        "resolve_pending_question_v3",
        "question_consequence_confirmed",
        "entry_reprocessing_enqueued",
      ]),
    "load reinterpretation audit",
  );
  const actionCounts = auditRows.reduce((acc, row) => {
    acc[row.action_type] = (acc[row.action_type] ?? 0) + 1;
    return acc;
  }, {});
  assert(actionCounts.resolve_pending_question_v3 === 1, "missing/duplicated answer audit");
  assert(actionCounts.question_consequence_confirmed === 1, "missing/duplicated consequence audit");
  assert(actionCounts.entry_reprocessing_enqueued === 1, "missing/duplicated reprocess audit");

  // --- Consequence idempotency: replay never double-applies -------------------
  const reinterpretReplay = dataOrThrow(
    await resolveV3(owner, reinterpretFixture.questionId, {
      kind: "answer",
      answer: "O prazo é 30 de julho",
      consequence: "reinterpret",
    }, reinterpretKey),
    "reinterpret replay",
  );
  assert(reinterpretReplay.idempotent === true, "reinterpret replay not idempotent");
  assert(reinterpretReplay.consequence_status === "reinterpretation_queued",
    "reinterpret replay lost its consequence status");
  assert((await reprocessJobs(ownerUser.id, reinterpretFixture.entryId)).length === 1,
    "reinterpret replay enqueued a second job");

  // --- Undo restores open, cancels the un-claimed job, keeps interpretation ---
  const interpretationBefore = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("pending_questions")
      .eq("id", reinterpretFixture.interpretationId)
      .single(),
    "snapshot immutable interpretation",
  );
  const undoResult = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: reinterpretResult.undo_id }),
    "undo confirmed reinterpretation",
  );
  assert(undoResult.undone === true, "reinterpretation undo did not complete");
  assert(undoResult.consequence === "reinterpret", "undo lost the consequence kind");
  assert(undoResult.consequence_compensation === "reprocessing_cancelled",
    `undo did not cancel the un-claimed reprocess job (${undoResult.consequence_compensation})`);
  const undoneQuestion = await questionRow(owner, reinterpretFixture.questionId);
  assert(undoneQuestion.status === "open", "undo did not restore the question to open");
  assert(undoneQuestion.answer === null, "undo did not clear the answer");
  assert((await reprocessJobs(ownerUser.id, reinterpretFixture.entryId)).length === 0,
    "undo did not remove the queued reprocess job");
  const interpretationAfter = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("pending_questions")
      .eq("id", reinterpretFixture.interpretationId)
      .single(),
    "re-read immutable interpretation",
  );
  assert(
    JSON.stringify(interpretationBefore.pending_questions) === JSON.stringify(interpretationAfter.pending_questions),
    "undo altered the immutable interpretation evidence",
  );
  // Undo is idempotent.
  const undoReplay = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: reinterpretResult.undo_id }),
    "idempotent undo replay",
  );
  assert(undoReplay.undone === true && undoReplay.idempotent === true, "undo was not idempotent");

  // --- A claimed reprocess job is compensated as in_progress, never deleted ---
  const claimedFixture = await createQuestionFixture(owner, ownerUser.id, "claimed");
  const claimedResult = dataOrThrow(
    await resolveV3(owner, claimedFixture.questionId, {
      kind: "answer",
      answer: "Reprocessar já",
      consequence: "reinterpret",
    }, `${fixturePrefix}-claimed`),
    "claimed reinterpretation",
  );
  const claimedJob = (await reprocessJobs(ownerUser.id, claimedFixture.entryId))[0];
  assert(claimedJob, "claimed fixture did not enqueue a reprocess job");
  const claimWorker = `${fixturePrefix}:reprocess-worker`;
  dataOrThrow(
    await admin.rpc("claim_entry_interpretation_job", {
      p_job_id: claimedJob.id,
      p_user_id: ownerUser.id,
      p_worker_id: claimWorker,
      p_lease_seconds: 300,
    }),
    "claim the reprocess job",
  );
  const claimedUndo = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: claimedResult.undo_id }),
    "undo after the reprocess job was claimed",
  );
  assert(claimedUndo.consequence_compensation === "reprocessing_in_progress",
    `claimed-job undo compensation was ${claimedUndo.consequence_compensation}`);
  const claimedJobs = await reprocessJobs(ownerUser.id, claimedFixture.entryId);
  assert(claimedJobs.length === 1 && claimedJobs[0].status === "running",
    "undo deleted or altered a claimed reprocess job");
  const reclaimedQuestion = await questionRow(owner, claimedFixture.questionId);
  assert(reclaimedQuestion.status === "open", "claimed-job undo did not restore the question");

  // --- v1 / v2 still callable and namespace-isolated --------------------------
  const legacyFixture = await createQuestionFixture(owner, ownerUser.id, "legacy");
  const legacyV1 = dataOrThrow(
    await owner.rpc("resolve_pending_question_v1", {
      p_question_id: legacyFixture.questionId,
      p_resolution: { kind: "answer", answer: "via v1" },
      p_operation_key: `${fixturePrefix}-legacy-v1`,
    }),
    "legacy v1 answer",
  );
  assert(legacyV1.resolution === "answered", "v1 no longer answers");
  dataOrThrow(await owner.rpc("undo_operation", { p_undo_id: legacyV1.undo_id }), "undo v1");
  const legacyV2 = dataOrThrow(
    await owner.rpc("resolve_pending_question_v2", {
      p_question_id: legacyFixture.questionId,
      p_resolution: { kind: "dismissed" },
      p_operation_key: `${fixturePrefix}-legacy-v2`,
    }),
    "legacy v2 dismissal",
  );
  assert(legacyV2.resolution === "dismissed", "v2 no longer dismisses");
  const namespaceRows = dataOrThrow(
    await admin
      .from("undo_operations")
      .select("operation_key")
      .eq("user_id", ownerUser.id)
      .like("operation_key", `%${fixturePrefix}-legacy-%`),
    "load legacy operation keys",
  );
  assert(namespaceRows.some((row) => row.operation_key.startsWith("resolve-v1:")), "v1 namespace missing");
  assert(namespaceRows.some((row) => row.operation_key.startsWith("resolve-v2:")), "v2 namespace missing");

  // --- question_reinterpret_applied allowlist: content-free -------------------
  // (The 2C-UNDO-004 forward fix — undo_operation no longer raising the
  // gateway-hanging SQLSTATE 40001 — is proven structurally by the fail-closed
  // DO-block in migration 202607230050 and behaviorally by the prompt undo
  // above, which returned rather than hanging.)
  const reinterpretEvent = dataOrThrow(
    await owner.rpc("record_product_event", {
      p_event_name: "question_reinterpret_applied",
      p_surface: "server",
      p_locale: "pt-BR",
      p_viewport_class: "unknown",
      p_app_version: "smoke",
      p_properties: {},
      p_subject_type: "pending_question",
      p_subject_id: reinterpretFixture.questionId,
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: true,
    }),
    "record question_reinterpret_applied",
  );
  assert(reinterpretEvent?.[0]?.recorded === true, "question_reinterpret_applied was not recorded");
  for (const properties of [
    { consequence: "reinterpret" },
    { answer: "O prazo é 30 de julho" },
    { kind: "reinterpret" },
  ]) {
    const rejected = await owner.rpc("record_product_event", {
      p_event_name: "question_reinterpret_applied",
      p_surface: "server",
      p_locale: "pt-BR",
      p_viewport_class: "unknown",
      p_app_version: "smoke",
      p_properties: properties,
      p_subject_type: "pending_question",
      p_subject_id: reinterpretFixture.questionId,
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: true,
    });
    assertRpcError(rejected, "22023", `reinterpret event with property ${JSON.stringify(properties)}`);
  }

  smokeSummary = {
    cases: 12,
    fixturePrefix,
    preExistingAuthUsers: before.authUserIds.length,
    preExistingTableCounts: before.tableCounts,
  };
} finally {
  await Promise.all(createdUserIds.map(async (userId) => {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error) throw new Error(`delete Phase 2D reinterpretation user: ${result.error.message}`);
  }));
}

const after = await environmentSnapshot();
const remainingUsers = (await listAllUsers()).filter((user) => user.email?.startsWith(fixturePrefix));
const remainingEntries = await admin
  .from("entries")
  .select("id", { count: "exact", head: true })
  .like("original_content", `Phase 2D reinterpretation smoke: ${fixturePrefix}%`);
if (remainingEntries.error) throw remainingEntries.error;

assert(remainingUsers.length === 0, "Disposable Phase 2D reinterpretation Auth user remained after cleanup");
assert((remainingEntries.count ?? 0) === 0, "Disposable Phase 2D reinterpretation entries remained after cleanup");
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
