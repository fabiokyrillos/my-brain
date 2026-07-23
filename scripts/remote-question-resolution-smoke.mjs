// Phase 2D — authenticated remote smoke for the versioned pending-question
// resolution family (resolve_pending_question_v1 + _v2).
//
// Slice 2D.1 section proves, against the linked development project with
// disposable fixtures: owner success with canonical trimming, deterministic
// replay, idempotency mismatch, non-open rejection, stale-interpretation
// rejection, concurrent single-winner behavior, cross-owner/missing
// indistinguishability, anonymous denial, atomic audit + undo evidence,
// exact-prior-state undo with idempotent repetition, post-undo
// resolvability, legacy answer-path compatibility, and immutable
// interpretation evidence.
//
// Slice 2D.2 section proves the disposition contract on the same guarantees:
// closed-shape rejection for the deferred/dismissed/not_relevant kinds,
// deferral-instant validation, deferral with deterministic replay/mismatch,
// still-snoozed rejection, deterministic snooze reactivation (Needs
// Attention queue convergence + RPC-time resolvability), guarded undo that
// can never clobber a newer resolution, terminal dismissal and distinct
// not_relevant history, stale rejection, v1/v2 operation-key namespace
// isolation, and the content-free question_resolved event allowlist.
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
const fixturePrefix = `phase-2d-resolution-${suffix}`;
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
    "create Phase 2D resolution user",
  ).user;
  assert(user, "Phase 2D resolution user was not returned");
  createdUserIds.push(user.id);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(
    await client.auth.signInWithPassword({ email, password }),
    "sign in Phase 2D resolution user",
  );
  return { client, user };
}

// Claim and complete the capture's interpret_entry job as the deployed worker
// would, so the unattended per-minute drain can never reinterpret a fixture
// mid-smoke and invalidate stale-sensitive assertions.
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
      p_original_content: `Phase 2D resolution smoke: ${fixturePrefix}:${label}`,
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
        summary: `Phase 2D resolution smoke: ${label}`,
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
      p_strategy_version: "phase-2d-resolution-smoke",
      p_prompt_version: "phase-2d-resolution-smoke",
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

async function resolve(client, questionId, answer, operationKey = crypto.randomUUID(), resolution) {
  return client.rpc("resolve_pending_question_v1", {
    p_question_id: questionId,
    p_resolution: resolution ?? { kind: "answer", answer },
    p_operation_key: operationKey,
  }).then((result) => ({ ...result, operationKey }));
}

async function questionRow(client, questionId) {
  return dataOrThrow(
    await client
      .from("pending_questions")
      .select("id,status,answer,answered_at,interpretation_id")
      .eq("id", questionId)
      .single(),
    "read question row",
  );
}

const before = await environmentSnapshot();
let smokeSummary;

try {
  const { client: owner, user: ownerUser } = await createTestUser("owner");
  const { client: otherOwner } = await createTestUser("other");

  // --- Owner success with canonical trimming --------------------------------
  const mainFixture = await createQuestionFixture(owner, ownerUser.id, "main");
  const interpretationBefore = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("pending_questions")
      .eq("id", mainFixture.interpretationId)
      .single(),
    "snapshot immutable interpretation questions",
  );

  // Closed-shape rejections leave no state or evidence behind.
  assertRpcError(
    await resolve(owner, mainFixture.questionId, "", `${fixturePrefix}-invalid-empty`),
    "22023",
    "empty answer",
  );
  assertRpcError(
    await resolve(owner, mainFixture.questionId, "   \n\t  ", `${fixturePrefix}-invalid-whitespace`),
    "22023",
    "whitespace-only answer",
  );
  assertRpcError(
    await resolve(owner, mainFixture.questionId, "a".repeat(4001), `${fixturePrefix}-invalid-overlong`),
    "22023",
    "overlong answer",
  );
  assertRpcError(
    await resolve(owner, mainFixture.questionId, null, `${fixturePrefix}-invalid-kind`, {
      kind: "deferred",
      answer: "amanhã",
    }),
    "22023",
    "unknown resolution kind",
  );
  assertRpcError(
    await resolve(owner, mainFixture.questionId, null, `${fixturePrefix}-invalid-extra`, {
      kind: "answer",
      answer: "ok",
      consequence: "reinterpret",
    }),
    "22023",
    "unknown resolution key",
  );
  assertRpcError(
    await resolve(owner, mainFixture.questionId, "ok", "short"),
    "22023",
    "malformed operation key",
  );
  const invalidEvidence = await admin
    .from("undo_operations")
    .select("id", { count: "exact", head: true })
    .like("operation_key", `resolve-v1:${fixturePrefix}-invalid-%`);
  if (invalidEvidence.error) throw invalidEvidence.error;
  assert((invalidEvidence.count ?? 0) === 0, "Rejected resolutions left reserved evidence behind");

  // Cross-owner and missing questions are indistinguishable.
  const crossOwnerAttempt = await resolve(
    otherOwner,
    mainFixture.questionId,
    "cross owner",
    `${fixturePrefix}-cross-owner`,
  );
  assertRpcError(crossOwnerAttempt, "P0002", "cross-owner resolution");
  const missingAttempt = await resolve(
    owner,
    crypto.randomUUID(),
    "missing question",
    `${fixturePrefix}-missing`,
  );
  assertRpcError(missingAttempt, "P0002", "missing question resolution");
  assert(
    crossOwnerAttempt.error.message === missingAttempt.error.message,
    "Cross-owner denial is distinguishable from a missing question",
  );

  // Anonymous denial.
  const anonymous = createClient(credentials.url, credentials.publishableKey, clientOptions);
  const anonymousAttempt = await anonymous.rpc("resolve_pending_question_v1", {
    p_question_id: mainFixture.questionId,
    p_resolution: { kind: "answer", answer: "anon" },
    p_operation_key: `${fixturePrefix}-anonymous`,
  });
  assert(anonymousAttempt.error, "Anonymous resolution did not fail");

  // Owner answer succeeds atomically.
  const answered = await resolve(
    owner,
    mainFixture.questionId,
    "  Sexta-feira às 14h  ",
    `${fixturePrefix}-success`,
  );
  const answeredResult = dataOrThrow(answered, "owner answer");
  assert(answeredResult.resolution === "answered", "Answer did not report the answered resolution");
  assert(answeredResult.idempotent === false, "First answer reported a replay");
  assert(typeof answeredResult.undo_id === "string" && answeredResult.undo_id.length > 0, "Answer returned no undo id");

  const answeredRow = await questionRow(owner, mainFixture.questionId);
  assert(answeredRow.status === "answered", "Question row did not move to answered");
  assert(answeredRow.answer === "Sexta-feira às 14h", "Stored answer is not the trimmed canonical text");
  assert(answeredRow.answered_at !== null, "Answered timestamp was not set");

  // Deterministic replay: same key, canonically equal payload.
  const replayed = dataOrThrow(
    await resolve(owner, mainFixture.questionId, "Sexta-feira às 14h", `${fixturePrefix}-success`),
    "replay answer",
  );
  assert(replayed.idempotent === true, "Replay was not idempotent");
  assert(replayed.undo_id === answeredResult.undo_id, "Replay returned a different undo id");

  // Same key, different payload: deterministic mismatch.
  assertRpcError(
    await resolve(owner, mainFixture.questionId, "Uma resposta diferente", `${fixturePrefix}-success`),
    "P0001",
    "idempotency mismatch",
    "2D_IDEMPOTENCY_MISMATCH",
  );

  // A second resolution under a fresh key observes the non-open question.
  assertRpcError(
    await resolve(owner, mainFixture.questionId, "Second writer", `${fixturePrefix}-second`),
    "55000",
    "non-open rejection",
  );

  // Audit and undo evidence.
  const auditRows = dataOrThrow(
    await admin
      .from("audit_logs")
      .select("entity_id,actor,after_state")
      .eq("action_type", "resolve_pending_question_v1")
      .eq("entity_id", mainFixture.questionId),
    "read resolution audit rows",
  );
  assert(auditRows.length === 1, `Expected exactly one audit row, saw ${auditRows.length}`);
  assert(auditRows[0].actor === "user", "Audit actor is not the user");
  assert(auditRows[0].after_state?.resolution === "answered", "Audit row does not record the resolution kind");
  assert(
    /^[0-9a-f]{64}$/.test(auditRows[0].after_state?.request_fingerprint ?? ""),
    "Audit row does not carry a SHA-256 request fingerprint",
  );
  const undoRows = dataOrThrow(
    await admin
      .from("undo_operations")
      .select("id,action_type,entity_type,operation_key,request_fingerprint,status")
      .eq("operation_key", `resolve-v1:${fixturePrefix}-success`),
    "read resolution undo rows",
  );
  assert(undoRows.length === 1, "Expected exactly one namespaced undo operation");
  assert(undoRows[0].id === answeredResult.undo_id, "Undo row does not match the returned undo id");
  assert(undoRows[0].action_type === "resolve_pending_question_v1", "Undo row action type drifted");
  assert(undoRows[0].entity_type === "pending_question", "Undo row entity type drifted");
  assert(
    undoRows[0].request_fingerprint === auditRows[0].after_state.request_fingerprint,
    "Undo and audit fingerprints disagree",
  );

  // Undo restores the exact prior state and repeats idempotently.
  const undone = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: answeredResult.undo_id }),
    "undo answer",
  );
  assert(undone.undone === true && undone.affected === 1 && undone.idempotent === false, "Undo result drifted");
  const restoredRow = await questionRow(owner, mainFixture.questionId);
  assert(restoredRow.status === "open", "Undo did not restore the open status");
  assert(restoredRow.answer === null && restoredRow.answered_at === null, "Undo did not clear answer state");
  const undoneAgain = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: answeredResult.undo_id }),
    "repeat undo",
  );
  assert(undoneAgain.idempotent === true && undoneAgain.affected === 0, "Repeated undo was not an idempotent no-op");

  // The restored question is answerable again under a new key.
  const reanswered = dataOrThrow(
    await resolve(owner, mainFixture.questionId, "Resposta definitiva", `${fixturePrefix}-reanswer`),
    "re-answer after undo",
  );
  assert(reanswered.idempotent === false, "Post-undo resolution replayed unexpectedly");

  // Immutable interpretation evidence is untouched by the whole cycle.
  const interpretationAfter = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("pending_questions")
      .eq("id", mainFixture.interpretationId)
      .single(),
    "re-read immutable interpretation questions",
  );
  assert(
    JSON.stringify(interpretationAfter.pending_questions)
      === JSON.stringify(interpretationBefore.pending_questions),
    "Immutable interpretation pending_questions changed",
  );

  // --- Stale interpretation --------------------------------------------------
  const staleFixture = await createQuestionFixture(owner, ownerUser.id, "stale");
  dataOrThrow(
    await owner.rpc("correct_entry_interpretation", {
      p_entry_id: staleFixture.entryId,
      p_expected_version: 1,
      p_operation_key: crypto.randomUUID(),
      p_patch: {
        summary: `Phase 2D corrected fixture: ${fixturePrefix}`,
        concepts: ["raw_record"],
        occurredAt: "2026-07-23T12:00:00Z",
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
          summary: { score: 0.9, policy: "auto_apply", signals: {}, overrides: [], evidence: [] },
        },
        recordOnly: false,
      },
      p_reason: "Phase 2D resolution smoke supersession",
    }),
    "supersede stale fixture interpretation",
  );
  assertRpcError(
    await resolve(owner, staleFixture.questionId, "Stale answer", `${fixturePrefix}-stale`),
    "55P03",
    "stale interpretation rejection",
  );
  const staleRow = await questionRow(owner, staleFixture.questionId);
  assert(staleRow.status === "open" && staleRow.answer === null, "Stale rejection wrote to the question row");
  const staleEvidence = await admin
    .from("undo_operations")
    .select("id", { count: "exact", head: true })
    .eq("operation_key", `resolve-v1:${fixturePrefix}-stale`);
  if (staleEvidence.error) throw staleEvidence.error;
  assert((staleEvidence.count ?? 0) === 0, "Stale rejection left reserved evidence behind");

  // --- Concurrent single winner ----------------------------------------------
  const raceFixture = await createQuestionFixture(owner, ownerUser.id, "race");
  const raceClientA = createClient(credentials.url, credentials.publishableKey, clientOptions);
  const raceClientB = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(
    await raceClientA.auth.signInWithPassword({
      email: `${fixturePrefix}-owner@example.test`,
      password,
    }),
    "sign in race client A",
  );
  dataOrThrow(
    await raceClientB.auth.signInWithPassword({
      email: `${fixturePrefix}-owner@example.test`,
      password,
    }),
    "sign in race client B",
  );
  const [raceA, raceB] = await Promise.all([
    resolve(raceClientA, raceFixture.questionId, "Race writer A", `${fixturePrefix}-race-a`),
    resolve(raceClientB, raceFixture.questionId, "Race writer B", `${fixturePrefix}-race-b`),
  ]);
  const raceWinners = [raceA, raceB].filter((result) => !result.error);
  const raceLosers = [raceA, raceB].filter((result) => result.error);
  assert(raceWinners.length === 1, `Expected exactly one race winner, saw ${raceWinners.length}`);
  assert(raceLosers.length === 1 && raceLosers[0].error.code === "55000", "Race loser did not observe the non-open question");
  const raceRow = await questionRow(owner, raceFixture.questionId);
  assert(raceRow.status === "answered", "Race fixture did not settle answered");
  const raceEvidence = await admin
    .from("undo_operations")
    .select("operation_key")
    .in("operation_key", [`resolve-v1:${fixturePrefix}-race-a`, `resolve-v1:${fixturePrefix}-race-b`]);
  if (raceEvidence.error) throw raceEvidence.error;
  assert(raceEvidence.data.length === 1, "The losing race resolution left reserved evidence behind");

  // --- Legacy answer path stays compatible until cutover ----------------------
  const legacyFixture = await createQuestionFixture(owner, ownerUser.id, "legacy");
  const legacyUpdate = dataOrThrow(
    await owner
      .from("pending_questions")
      .update({
        status: "answered",
        answer: "Legacy path answer",
        answered_at: new Date().toISOString(),
      })
      .eq("id", legacyFixture.questionId)
      .eq("user_id", ownerUser.id)
      .eq("status", "open")
      .select("id,status")
      .maybeSingle(),
    "legacy plain update answer",
  );
  assert(legacyUpdate?.status === "answered", "Legacy owner-scoped answer path is no longer callable");

  // ===========================================================================
  // Phase 2D Slice 2D.2 — dispositions through resolve_pending_question_v2.
  // ===========================================================================
  const resolveV2 = (client, questionId, resolution, operationKey = crypto.randomUUID()) =>
    client.rpc("resolve_pending_question_v2", {
      p_question_id: questionId,
      p_resolution: resolution,
      p_operation_key: operationKey,
    }).then((result) => ({ ...result, operationKey }));
  const canonicalFutureInstant = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
  const listQueue = async (client) => dataOrThrow(
    await client.rpc("list_needs_attention", { p_limit: 100 }),
    "list needs attention",
  );

  // --- Closed-shape rejection (v2) -------------------------------------------
  const deferFixture = await createQuestionFixture(owner, ownerUser.id, "defer");
  const deferInterpretationBefore = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("pending_questions")
      .eq("id", deferFixture.interpretationId)
      .single(),
    "snapshot defer immutable interpretation questions",
  );
  assertRpcError(
    await resolveV2(owner, deferFixture.questionId, { kind: "reinterpret" }, `${fixturePrefix}-v2-invalid-kind`),
    "22023",
    "v2 unknown resolution kind",
  );
  assertRpcError(
    await resolveV2(owner, deferFixture.questionId, { kind: "deferred" }, `${fixturePrefix}-v2-invalid-missing`),
    "22023",
    "v2 deferral without instant",
  );
  assertRpcError(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "deferred", snoozedUntil: canonicalFutureInstant(3_600_000), answer: "extra" },
      `${fixturePrefix}-v2-invalid-extra`,
    ),
    "22023",
    "v2 deferral with foreign key",
  );
  assertRpcError(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "deferred", snoozedUntil: "2020-01-01T00:00:00Z" },
      `${fixturePrefix}-v2-invalid-past`,
    ),
    "22023",
    "v2 past deferral instant",
  );
  assertRpcError(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "deferred", snoozedUntil: "2027-01-01 10:00:00" },
      `${fixturePrefix}-v2-invalid-naive`,
    ),
    "22023",
    "v2 naive offset-less instant",
  );
  assertRpcError(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "deferred", snoozedUntil: canonicalFutureInstant(400 * 86_400_000) },
      `${fixturePrefix}-v2-invalid-beyond`,
    ),
    "22023",
    "v2 deferral beyond the bounded window",
  );
  assertRpcError(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "dismissed", answer: "conteúdo" },
      `${fixturePrefix}-v2-invalid-terminal-content`,
    ),
    "22023",
    "v2 terminal disposition carrying content",
  );
  assertRpcError(
    await resolveV2(owner, deferFixture.questionId, { kind: "dismissed" }, "short"),
    "22023",
    "v2 malformed operation key",
  );
  const v2InvalidEvidence = await admin
    .from("undo_operations")
    .select("id", { count: "exact", head: true })
    .like("operation_key", `resolve-v2:${fixturePrefix}-v2-invalid-%`);
  if (v2InvalidEvidence.error) throw v2InvalidEvidence.error;
  assert((v2InvalidEvidence.count ?? 0) === 0, "Rejected v2 payloads left reserved evidence behind");

  // --- Ownership and anonymity (v2) ------------------------------------------
  const v2CrossOwner = await resolveV2(
    otherOwner,
    deferFixture.questionId,
    { kind: "dismissed" },
    `${fixturePrefix}-v2-cross-owner`,
  );
  assertRpcError(v2CrossOwner, "P0002", "v2 cross-owner disposition");
  const v2Missing = await resolveV2(
    owner,
    crypto.randomUUID(),
    { kind: "dismissed" },
    `${fixturePrefix}-v2-missing`,
  );
  assertRpcError(v2Missing, "P0002", "v2 missing question disposition");
  assert(
    v2CrossOwner.error.message === v2Missing.error.message,
    "v2 cross-owner denial is distinguishable from a missing question",
  );
  const v2Anonymous = await anonymous.rpc("resolve_pending_question_v2", {
    p_question_id: deferFixture.questionId,
    p_resolution: { kind: "dismissed" },
    p_operation_key: `${fixturePrefix}-v2-anonymous`,
  });
  assert(v2Anonymous.error, "Anonymous v2 disposition did not fail");

  // --- Needs Attention baseline: open question keeps its completed entry -----
  const completedEntry = await admin
    .from("entries")
    .update({ status: "completed" })
    .eq("id", deferFixture.entryId)
    .eq("user_id", ownerUser.id)
    .select("id,status")
    .single();
  if (completedEntry.error) throw completedEntry.error;
  const queueBaseline = await listQueue(owner);
  const baselineItem = queueBaseline.find((item) => item.entry_id === deferFixture.entryId);
  assert(
    baselineItem?.reason === "answer_existing_question"
      && baselineItem?.open_question_id === deferFixture.questionId,
    "Open question did not keep its completed entry in the Needs Attention queue",
  );

  // --- Defer: success, replay, mismatch ---------------------------------------
  const deferInstant = canonicalFutureInstant(30 * 60_000);
  const deferred = dataOrThrow(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "deferred", snoozedUntil: deferInstant },
      `${fixturePrefix}-v2-defer`,
    ),
    "owner deferral",
  );
  assert(deferred.resolution === "deferred", "Deferral did not report the deferred resolution");
  assert(deferred.snoozed_until === deferInstant, "Deferral did not echo the canonical UTC instant");
  assert(deferred.idempotent === false, "First deferral reported a replay");
  const deferredRow = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("id,status,answer,answered_at,snoozed_until")
      .eq("id", deferFixture.questionId)
      .single(),
    "read deferred question row",
  );
  assert(deferredRow.status === "snoozed", "Question row did not move to snoozed");
  assert(
    new Date(deferredRow.snoozed_until).toISOString() === deferInstant,
    "Stored snoozed_until is not the validated instant",
  );
  const deferAudit = dataOrThrow(
    await admin
      .from("audit_logs")
      .select("after_state,before_state")
      .eq("action_type", "resolve_pending_question_v2")
      .eq("entity_id", deferFixture.questionId),
    "read deferral audit rows",
  );
  assert(deferAudit.length === 1, `Expected exactly one deferral audit row, saw ${deferAudit.length}`);
  assert(
    deferAudit[0].after_state?.resolution === "deferred"
      && deferAudit[0].after_state?.snoozed_until === deferInstant
      && deferAudit[0].before_state?.status === "open",
    "Deferral audit evidence drifted",
  );
  const deferReplay = dataOrThrow(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "deferred", snoozedUntil: deferInstant },
      `${fixturePrefix}-v2-defer`,
    ),
    "replay deferral",
  );
  assert(
    deferReplay.idempotent === true
      && deferReplay.undo_id === deferred.undo_id
      && deferReplay.snoozed_until === deferInstant,
    "Deferral replay drifted",
  );
  assertRpcError(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "deferred", snoozedUntil: canonicalFutureInstant(2 * 3_600_000) },
      `${fixturePrefix}-v2-defer`,
    ),
    "P0001",
    "deferral idempotency mismatch",
    "2D_IDEMPOTENCY_MISMATCH",
  );

  // --- Still-snoozed questions are not resolvable and leave the queue ---------
  assertRpcError(
    await resolveV2(owner, deferFixture.questionId, { kind: "dismissed" }, `${fixturePrefix}-v2-early`),
    "55000",
    "still-snoozed rejection",
  );
  const queueWhileSnoozed = await listQueue(owner);
  assert(
    !queueWhileSnoozed.some((item) => item.entry_id === deferFixture.entryId),
    "A deferred question did not leave the Needs Attention queue",
  );

  // --- Deterministic reactivation ---------------------------------------------
  const elapsed = await admin
    .from("pending_questions")
    .update({ snoozed_until: new Date(Date.now() - 3_600_000).toISOString() })
    .eq("id", deferFixture.questionId)
    .eq("user_id", ownerUser.id)
    .select("id")
    .single();
  if (elapsed.error) throw elapsed.error;
  const queueReactivated = await listQueue(owner);
  const reactivatedItem = queueReactivated.find((item) => item.entry_id === deferFixture.entryId);
  assert(
    reactivatedItem?.reason === "answer_existing_question"
      && reactivatedItem?.open_question_id === deferFixture.questionId,
    "A snoozed question past its deadline did not return to the Needs Attention queue",
  );
  const reactivatedAnswer = dataOrThrow(
    await resolveV2(
      owner,
      deferFixture.questionId,
      { kind: "answer", answer: "  Resposta reativada  " },
      `${fixturePrefix}-v2-reactivated-answer`,
    ),
    "answer reactivated question",
  );
  assert(reactivatedAnswer.resolution === "answered", "Reactivated question was not answerable");
  const reactivatedRow = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("status,answer,snoozed_until")
      .eq("id", deferFixture.questionId)
      .single(),
    "read reactivated question row",
  );
  assert(
    reactivatedRow.status === "answered"
      && reactivatedRow.answer === "Resposta reativada"
      && reactivatedRow.snoozed_until === null,
    "Reactivated resolution did not settle answered with a cleared snooze deadline",
  );
  const reactivatedAudit = dataOrThrow(
    await admin
      .from("audit_logs")
      .select("before_state")
      .eq("action_type", "resolve_pending_question_v2")
      .eq("entity_id", deferFixture.questionId)
      .filter("after_state->>resolution", "eq", "answered"),
    "read reactivated audit row",
  );
  assert(
    reactivatedAudit.length === 1 && reactivatedAudit[0].before_state?.status === "snoozed",
    "The audit evidence does not record the automatic snoozed-to-open reactivation",
  );

  // --- Guarded undo: a superseded deferral cannot clobber the newer answer ----
  const supersededUndo = await owner.rpc("undo_operation", { p_undo_id: deferred.undo_id });
  assert(
    supersededUndo.error?.details === "2D_UNDO_RESTORE_INTEGRITY",
    "Undoing the superseded deferral did not fail with the integrity guard",
  );
  const guardedRow = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("status,answer")
      .eq("id", deferFixture.questionId)
      .single(),
    "read guarded question row",
  );
  assert(
    guardedRow.status === "answered" && guardedRow.answer === "Resposta reativada",
    "The guarded undo touched the newer answer",
  );
  const reactivatedUndo = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: reactivatedAnswer.undo_id }),
    "undo reactivated answer",
  );
  assert(reactivatedUndo.undone === true && reactivatedUndo.affected === 1, "Reactivated answer undo drifted");
  const restoredDeferRow = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("status,answer,answered_at,snoozed_until")
      .eq("id", deferFixture.questionId)
      .single(),
    "read restored defer question row",
  );
  assert(
    restoredDeferRow.status === "open"
      && restoredDeferRow.answer === null
      && restoredDeferRow.answered_at === null
      && restoredDeferRow.snoozed_until === null,
    "The undone v2 answer did not restore the exact open state",
  );

  // --- Dismiss: terminal semantics, replay, undo, redismissal -----------------
  const dismissFixture = await createQuestionFixture(owner, ownerUser.id, "dismiss");
  const dismissed = dataOrThrow(
    await resolveV2(owner, dismissFixture.questionId, { kind: "dismissed" }, `${fixturePrefix}-success`),
    "owner dismissal",
  );
  assert(dismissed.resolution === "dismissed", "Dismissal did not report the dismissed resolution");
  assert(dismissed.idempotent === false, "The v1-consumed raw key replayed under the v2 namespace");
  const namespaceEvidence = dataOrThrow(
    await admin
      .from("undo_operations")
      .select("operation_key,action_type")
      .in("operation_key", [`resolve-v1:${fixturePrefix}-success`, `resolve-v2:${fixturePrefix}-success`]),
    "read namespace evidence",
  );
  assert(
    namespaceEvidence.length === 2,
    "The v1 and v2 namespaces do not hold independent reservations for the same raw key",
  );
  const dismissedRow = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("status,answer")
      .eq("id", dismissFixture.questionId)
      .single(),
    "read dismissed question row",
  );
  assert(dismissedRow.status === "dismissed" && dismissedRow.answer === null, "Dismissal row state drifted");
  assertRpcError(
    await resolveV2(owner, dismissFixture.questionId, { kind: "not_relevant" }, `${fixturePrefix}-v2-terminal`),
    "55000",
    "terminal-to-terminal rejection",
  );
  assertRpcError(
    await resolveV2(
      owner,
      dismissFixture.questionId,
      { kind: "answer", answer: "tarde demais" },
      `${fixturePrefix}-v2-terminal-answer`,
    ),
    "55000",
    "terminal answer rejection",
  );
  const dismissReplay = dataOrThrow(
    await resolveV2(owner, dismissFixture.questionId, { kind: "dismissed" }, `${fixturePrefix}-success`),
    "replay dismissal",
  );
  assert(dismissReplay.idempotent === true && dismissReplay.undo_id === dismissed.undo_id, "Dismissal replay drifted");
  const dismissUndo = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: dismissed.undo_id }),
    "undo dismissal",
  );
  assert(dismissUndo.affected === 1, "Dismissal undo drifted");
  const restoredDismissRow = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("status")
      .eq("id", dismissFixture.questionId)
      .single(),
    "read restored dismiss question row",
  );
  assert(restoredDismissRow.status === "open", "The undone dismissal did not restore the open state");

  // --- Not relevant: distinct truthful history over the dismissed status ------
  const notRelevant = dataOrThrow(
    await resolveV2(owner, dismissFixture.questionId, { kind: "not_relevant" }, `${fixturePrefix}-v2-not-relevant`),
    "owner not-relevant resolution",
  );
  assert(notRelevant.resolution === "not_relevant", "not_relevant did not report its distinct resolution kind");
  const notRelevantRow = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("status")
      .eq("id", dismissFixture.questionId)
      .single(),
    "read not-relevant question row",
  );
  assert(notRelevantRow.status === "dismissed", "not_relevant did not reuse the dismissed status");
  const notRelevantEvidence = dataOrThrow(
    await admin
      .from("undo_operations")
      .select("after_state")
      .eq("operation_key", `resolve-v2:${fixturePrefix}-v2-not-relevant`),
    "read not-relevant undo evidence",
  );
  assert(
    notRelevantEvidence.length === 1 && notRelevantEvidence[0].after_state?.resolution === "not_relevant",
    "The evidence does not label the not-relevant outcome distinctly",
  );
  const notRelevantUndo = dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: notRelevant.undo_id }),
    "undo not-relevant resolution",
  );
  assert(notRelevantUndo.affected === 1, "not-relevant undo drifted");

  // --- Stale deferral ----------------------------------------------------------
  assertRpcError(
    await resolveV2(
      owner,
      staleFixture.questionId,
      { kind: "deferred", snoozedUntil: canonicalFutureInstant(86_400_000) },
      `${fixturePrefix}-v2-stale`,
    ),
    "55P03",
    "stale deferral rejection",
  );
  const staleV2Evidence = await admin
    .from("undo_operations")
    .select("id", { count: "exact", head: true })
    .eq("operation_key", `resolve-v2:${fixturePrefix}-v2-stale`);
  if (staleV2Evidence.error) throw staleV2Evidence.error;
  assert((staleV2Evidence.count ?? 0) === 0, "Stale v2 rejection left reserved evidence behind");

  // --- question_resolved allowlist: bounded kind only, content-free ------------
  const resolvedEvent = dataOrThrow(
    await owner.rpc("record_product_event", {
      p_event_name: "question_resolved",
      p_surface: "server",
      p_locale: "pt-BR",
      p_viewport_class: "unknown",
      p_app_version: "smoke",
      p_properties: { kind: "deferred" },
      p_subject_type: "pending_question",
      p_subject_id: dismissFixture.questionId,
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: true,
    }),
    "record question_resolved with a bounded kind",
  );
  assert(resolvedEvent?.[0]?.recorded === true, "question_resolved with a bounded kind was not recorded");
  const contentEvent = await owner.rpc("record_product_event", {
    p_event_name: "question_resolved",
    p_surface: "server",
    p_locale: "pt-BR",
    p_viewport_class: "unknown",
    p_app_version: "smoke",
    p_properties: { kind: "dismissed", question: "free text" },
    p_subject_type: "pending_question",
    p_subject_id: dismissFixture.questionId,
    p_idempotency_key: crypto.randomUUID(),
    p_is_synthetic: true,
  });
  assert(contentEvent.error?.code === "22023", "question_resolved accepted a content property");
  const badKindEvent = await owner.rpc("record_product_event", {
    p_event_name: "question_resolved",
    p_surface: "server",
    p_locale: "pt-BR",
    p_viewport_class: "unknown",
    p_app_version: "smoke",
    p_properties: { kind: "answered" },
    p_subject_type: "pending_question",
    p_subject_id: dismissFixture.questionId,
    p_idempotency_key: crypto.randomUUID(),
    p_is_synthetic: true,
  });
  assert(badKindEvent.error?.code === "22023", "question_resolved accepted a kind outside the bounded enum");

  // --- Immutable interpretation evidence after the disposition cycle ----------
  const deferInterpretationAfter = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("pending_questions")
      .eq("id", deferFixture.interpretationId)
      .single(),
    "re-read defer immutable interpretation questions",
  );
  assert(
    JSON.stringify(deferInterpretationAfter.pending_questions)
      === JSON.stringify(deferInterpretationBefore.pending_questions),
    "Immutable interpretation pending_questions changed during the disposition cycle",
  );

  smokeSummary = {
    cases: 28,
    fixturePrefix,
    preExistingAuthUsers: before.authUserIds.length,
    preExistingTableCounts: before.tableCounts,
  };
} finally {
  await Promise.all(createdUserIds.map(async (userId) => {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error) throw new Error(`delete Phase 2D resolution user: ${result.error.message}`);
  }));
}

const after = await environmentSnapshot();
const remainingUsers = (await listAllUsers()).filter((user) => user.email?.startsWith(fixturePrefix));
const remainingEntries = await admin
  .from("entries")
  .select("id", { count: "exact", head: true })
  .like("original_content", `Phase 2D resolution smoke: ${fixturePrefix}%`);
if (remainingEntries.error) throw remainingEntries.error;

assert(remainingUsers.length === 0, "Disposable Phase 2D Auth user remained after cleanup");
assert((remainingEntries.count ?? 0) === 0, "Disposable Phase 2D entries remained after cleanup");
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
