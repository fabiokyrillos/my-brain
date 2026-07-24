// Phase 2D Slice 2D.3 — authenticated remote smoke for the read-only question
// source/effect preview and the deterministic suggested-answer inputs.
//
// Proves, against the linked development project with disposable fixtures:
//
//   * the source projection's exact owner-scoped reads succeed for the owner;
//   * a cross-owner read is non-disclosing (empty, indistinguishable from
//     "does not exist") for the question, its entry, and its interpretation;
//   * an anonymous read is denied;
//   * the owned domain context that feeds deterministic suggestions is stable
//     byte-for-byte across repeated reads (the generator itself is a pure
//     module proved by the unit suite — it performs no I/O at all);
//   * the whole preview path performs NO write: no pending_questions change,
//     no audit row, no undo operation, no job, no interpretation revision, and
//     no product event;
//   * the new analytics allowlist accepts only content-free payloads:
//     question_effect_previewed with {} from the `questions` surface, and
//     question_answered_basic with the bounded origin enum — while still
//     accepting the pre-cutover empty payload, proving the migration is
//     deployable and rollback-safe on its own;
//   * a suggestion-originated answer resolves exactly like a typed one through
//     the unchanged resolve_pending_question_v2 write shape;
//   * typed answers and the 2D.2 dispositions remain compatible;
//   * the immutable interpretation is byte-identical throughout.
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

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const anonymous = createClient(credentials.url, credentials.publishableKey, clientOptions);
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const fixturePrefix = `phase-2d-preview-${suffix}`;
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

// Per-owner evidence footprint, used to prove the preview path writes nothing.
// `product_events` is deliberately unreadable by `service_role` (grants are
// revoked; only `authenticated` may select its own rows under RLS), so that one
// is counted through the owner's own session.
async function ownerFootprint(ownerClient, userId) {
  const adminTables = ["audit_logs", "undo_operations", "jobs", "entry_interpretations", "tasks"];
  const counts = await Promise.all(adminTables.map(async (table) => {
    const result = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (result.error) throw new Error(`count ${table} for owner: ${result.error.message}`);
    return [table, result.count ?? 0];
  }));
  const events = await ownerClient
    .from("product_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (events.error) throw new Error(`count product_events for owner: ${events.error.message}`);
  return Object.fromEntries([...counts, ["product_events", events.count ?? 0]]);
}

async function createTestUser(label) {
  const email = `${fixturePrefix}-${label}@example.test`;
  const user = dataOrThrow(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    "create Phase 2D preview user",
  ).user;
  assert(user, "Phase 2D preview user was not returned");
  createdUserIds.push(user.id);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(
    await client.auth.signInWithPassword({ email, password }),
    "sign in Phase 2D preview user",
  );
  return { client, user };
}

// Settle the capture's interpret_entry job as the deployed worker would, so the
// unattended per-minute drain can never reinterpret a fixture mid-smoke.
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

// A "quem ...?" question plus owned people/project candidates — the exact shape
// the deterministic generator turns into bounded person suggestions.
async function createPreviewFixture(client, userId, label) {
  const captured = dataOrThrow(
    await client.rpc("capture_entry_async", {
      p_original_content: `Phase 2D preview smoke: ${fixturePrefix}:${label}`,
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
        summary: `Phase 2D preview smoke: ${label}`,
        concepts: ["pending_question"],
        occurredAt: "2026-07-23T12:00:00Z",
        confidence: 0.6,
        taskCandidates: [],
        people: [
          { name: "Ana Prado", confidence: 0.9, evidence: "com a Ana Prado", inferred: false },
          { name: "Bruno Lima", confidence: 0.8, evidence: "e o Bruno Lima", inferred: false },
        ],
        projects: [
          { name: "Aurora", confidence: 0.9, evidence: "escopo do Aurora", inferred: false },
        ],
        pendingQuestions: [
          {
            question: "Quem ficou responsável pela entrega?",
            reason: "O registro não diz quem assume a entrega.",
            confidence: 0.5,
          },
        ],
      },
      p_model: "gpt-test",
      p_strategy_version: "phase-2d-preview-smoke",
      p_prompt_version: "phase-2d-preview-smoke",
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

// Exactly the three owner-scoped SELECTs `loadQuestionPreviews` issues.
async function readSourceProjection(client, userId, questionId) {
  const questions = dataOrThrow(
    await client
      .from("pending_questions")
      .select("id,entry_id,interpretation_id,candidate_index,question,reason")
      .eq("user_id", userId)
      .in("id", [questionId]),
    "projection: read pending question",
  );
  if (questions.length === 0) return { questions, entries: [], interpretations: [] };
  const entries = dataOrThrow(
    await client
      .from("entries")
      .select("id,original_content,created_at,occurred_at,current_interpretation_id")
      .eq("user_id", userId)
      .in("id", questions.map((row) => row.entry_id)),
    "projection: read source entry",
  );
  const interpretations = dataOrThrow(
    await client
      .from("entry_interpretations")
      .select("id,entry_id,version,summary,created_at,extracted_people,extracted_projects,extracted_organizations,extracted_contexts")
      .eq("user_id", userId)
      .in("id", questions.map((row) => row.interpretation_id)),
    "projection: read source interpretation",
  );
  return { questions, entries, interpretations };
}

const before = await environmentSnapshot();
let smokeSummary;
let caseCount = 0;
function pass() {
  caseCount += 1;
}

try {
  const { client: owner, user: ownerUser } = await createTestUser("owner");
  const { client: otherOwner, user: otherUser } = await createTestUser("other");

  const fixture = await createPreviewFixture(owner, ownerUser.id, "main");
  const interpretationBefore = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("pending_questions,extracted_people,extracted_projects")
      .eq("id", fixture.interpretationId)
      .single(),
    "snapshot immutable interpretation",
  );

  const footprintBefore = await ownerFootprint(owner, ownerUser.id);

  // --- 1. Owner reads the bounded source projection --------------------------
  const projection = await readSourceProjection(owner, ownerUser.id, fixture.questionId);
  assert(projection.questions.length === 1, "owner could not read the question source");
  assert(projection.entries.length === 1, "owner could not read the source entry");
  assert(projection.interpretations.length === 1, "owner could not read the source interpretation");
  assert(
    projection.interpretations[0].entry_id === projection.entries[0].id,
    "source interpretation provenance is inconsistent with its entry",
  );
  assert(
    projection.entries[0].current_interpretation_id === projection.questions[0].interpretation_id,
    "the fixture question is not bound to the entry's current interpretation",
  );
  assert(
    projection.questions[0].question === "Quem ficou responsável pela entrega?",
    "source projection returned an unexpected question",
  );
  pass();

  // --- 2. Cross-owner reads are empty and non-disclosing ---------------------
  const crossOwner = await readSourceProjection(otherOwner, otherUser.id, fixture.questionId);
  assert(crossOwner.questions.length === 0, "a cross-owner read disclosed the question");
  const crossOwnerForgedScope = dataOrThrow(
    await otherOwner
      .from("pending_questions")
      .select("id")
      .eq("user_id", ownerUser.id)
      .in("id", [fixture.questionId]),
    "cross-owner forged-scope read",
  );
  assert(crossOwnerForgedScope.length === 0, "a forged user_id filter disclosed another owner's question");
  const crossOwnerEntry = dataOrThrow(
    await otherOwner.from("entries").select("id").in("id", [fixture.entryId]),
    "cross-owner entry read",
  );
  assert(crossOwnerEntry.length === 0, "a cross-owner read disclosed the source entry");
  const crossOwnerInterpretation = dataOrThrow(
    await otherOwner.from("entry_interpretations").select("id").in("id", [fixture.interpretationId]),
    "cross-owner interpretation read",
  );
  assert(crossOwnerInterpretation.length === 0, "a cross-owner read disclosed the source interpretation");
  const missingQuestion = dataOrThrow(
    await otherOwner.from("pending_questions").select("id").in("id", [crypto.randomUUID()]),
    "cross-owner missing-question read",
  );
  assert(
    JSON.stringify(missingQuestion) === JSON.stringify(crossOwnerForgedScope),
    "a non-owned question is distinguishable from a missing one",
  );
  pass();

  // --- 3. Anonymous reads are denied ----------------------------------------
  const anonymousQuestions = await anonymous
    .from("pending_questions")
    .select("id")
    .in("id", [fixture.questionId]);
  assert(
    anonymousQuestions.error != null || (anonymousQuestions.data ?? []).length === 0,
    "an anonymous client read the question source",
  );
  const anonymousEntries = await anonymous.from("entries").select("id").in("id", [fixture.entryId]);
  assert(
    anonymousEntries.error != null || (anonymousEntries.data ?? []).length === 0,
    "an anonymous client read the source entry",
  );
  pass();

  // --- 4. Owned suggestion context is byte-stable across repeated reads ------
  const repeated = await readSourceProjection(owner, ownerUser.id, fixture.questionId);
  assert(
    JSON.stringify(repeated) === JSON.stringify(projection),
    "the owned suggestion/source context changed between identical reads",
  );
  const peopleNames = (projection.interpretations[0].extracted_people ?? []).map((entity) => entity.name);
  assert(
    JSON.stringify(peopleNames) === JSON.stringify(["Ana Prado", "Bruno Lima"]),
    "the owned person context did not survive persistence in a deterministic order",
  );
  pass();

  // --- 5. The whole preview path wrote nothing ------------------------------
  const questionAfterPreview = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("id,status,answer,answered_at,snoozed_until,interpretation_id")
      .eq("id", fixture.questionId)
      .single(),
    "re-read question after preview",
  );
  assert(questionAfterPreview.status === "open", "the preview changed the question status");
  assert(questionAfterPreview.answer === null, "the preview wrote an answer");
  assert(questionAfterPreview.answered_at === null, "the preview wrote answered_at");
  assert(questionAfterPreview.snoozed_until === null, "the preview wrote a snooze deadline");
  const footprintAfterPreview = await ownerFootprint(owner, ownerUser.id);
  assert(
    JSON.stringify(footprintAfterPreview) === JSON.stringify(footprintBefore),
    `the preview path created evidence rows: ${JSON.stringify(footprintBefore)} -> ${JSON.stringify(footprintAfterPreview)}`,
  );
  pass();

  // --- 6. question_effect_previewed is allowlisted and strictly content-free --
  const previewEvent = dataOrThrow(
    await owner.rpc("record_product_event", {
      p_event_name: "question_effect_previewed",
      p_surface: "questions",
      p_locale: "pt-BR",
      p_viewport_class: "desktop",
      p_app_version: "smoke",
      p_properties: {},
      p_subject_type: "pending_question",
      p_subject_id: fixture.questionId,
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: true,
    }),
    "record question_effect_previewed",
  );
  assert(previewEvent?.[0]?.recorded === true, "question_effect_previewed was not recorded");
  for (const properties of [
    { kind: "reinterpret" },
    { question: "Quem ficou responsável pela entrega?" },
    { suggestionId: "person:ana-prado" },
  ]) {
    const rejected = await owner.rpc("record_product_event", {
      p_event_name: "question_effect_previewed",
      p_surface: "questions",
      p_locale: "pt-BR",
      p_viewport_class: "desktop",
      p_app_version: "smoke",
      p_properties: properties,
      p_subject_type: "pending_question",
      p_subject_id: fixture.questionId,
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: true,
    });
    assert(
      rejected.error?.code === "22023",
      `question_effect_previewed accepted the property payload ${JSON.stringify(properties)}`,
    );
  }
  const unknownSurface = await owner.rpc("record_product_event", {
    p_event_name: "question_effect_previewed",
    p_surface: "chat",
    p_locale: "pt-BR",
    p_viewport_class: "desktop",
    p_app_version: "smoke",
    p_properties: {},
    p_subject_type: "pending_question",
    p_subject_id: fixture.questionId,
    p_idempotency_key: crypto.randomUUID(),
    p_is_synthetic: true,
  });
  assert(unknownSurface.error?.code === "22023", "an unallowlisted product surface was accepted");
  pass();

  // --- 7. question_answered_basic origin is a bounded enum, and optional -----
  for (const origin of ["typed", "suggested"]) {
    const accepted = dataOrThrow(
      await owner.rpc("record_product_event", {
        p_event_name: "question_answered_basic",
        p_surface: "server",
        p_locale: "pt-BR",
        p_viewport_class: "unknown",
        p_app_version: "smoke",
        p_properties: { origin },
        p_subject_type: "pending_question",
        p_subject_id: fixture.questionId,
        p_idempotency_key: crypto.randomUUID(),
        p_is_synthetic: true,
      }),
      `record question_answered_basic origin=${origin}`,
    );
    assert(accepted?.[0]?.recorded === true, `question_answered_basic origin=${origin} was not recorded`);
  }
  // Backward compatibility / rollback safety: the pre-cutover empty payload.
  const legacyPayload = dataOrThrow(
    await owner.rpc("record_product_event", {
      p_event_name: "question_answered_basic",
      p_surface: "server",
      p_locale: "pt-BR",
      p_viewport_class: "unknown",
      p_app_version: "smoke",
      p_properties: {},
      p_subject_type: "pending_question",
      p_subject_id: fixture.questionId,
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: true,
    }),
    "record legacy empty question_answered_basic",
  );
  assert(legacyPayload?.[0]?.recorded === true, "the pre-cutover empty answer payload was rejected");
  for (const properties of [
    { origin: "person:ana-prado" },
    { origin: "suggested", suggestionId: "person:ana-prado" },
    { origin: "suggested", answer: "Ana Prado" },
    { suggestionValue: "Ana Prado" },
  ]) {
    const rejected = await owner.rpc("record_product_event", {
      p_event_name: "question_answered_basic",
      p_surface: "server",
      p_locale: "pt-BR",
      p_viewport_class: "unknown",
      p_app_version: "smoke",
      p_properties: properties,
      p_subject_type: "pending_question",
      p_subject_id: fixture.questionId,
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: true,
    });
    assert(
      rejected.error?.code === "22023",
      `question_answered_basic accepted ${JSON.stringify(properties)}`,
    );
  }
  const storedEvents = dataOrThrow(
    await owner
      .from("product_events")
      .select("event_name,properties")
      .eq("user_id", ownerUser.id)
      .eq("is_synthetic", true),
    "read stored preview product events",
  );
  const serializedEvents = JSON.stringify(storedEvents);
  assert(!serializedEvents.includes("Ana Prado"), "a product event persisted suggestion content");
  assert(!serializedEvents.includes("Quem ficou"), "a product event persisted question content");
  assert(!serializedEvents.includes("person:"), "a product event persisted a suggestion id");
  pass();

  // --- 8. A suggestion-originated answer resolves like any other answer ------
  const suggestedOperationKey = `${fixturePrefix}-suggested`;
  const suggestedResult = dataOrThrow(
    await owner.rpc("resolve_pending_question_v2", {
      p_question_id: fixture.questionId,
      // The canonical value of the presented `person:ana-prado` option. The
      // write shape is identical to a typed answer — provenance never enters it.
      p_resolution: { kind: "answer", answer: "Ana Prado" },
      p_operation_key: suggestedOperationKey,
    }),
    "resolve with a suggestion-originated answer",
  );
  assert(suggestedResult.resolution === "answered", "the suggestion-originated answer did not resolve");
  assert(suggestedResult.undo_id, "the suggestion-originated answer registered no undo operation");
  assert(suggestedResult.idempotent === false, "the first suggestion-originated answer replayed");
  const suggestedRow = dataOrThrow(
    await owner.from("pending_questions").select("status,answer").eq("id", fixture.questionId).single(),
    "read the suggestion-originated answer row",
  );
  assert(suggestedRow.status === "answered", "the question did not become answered");
  assert(suggestedRow.answer === "Ana Prado", "the persisted answer is not the suggestion's canonical value");
  const replay = dataOrThrow(
    await owner.rpc("resolve_pending_question_v2", {
      p_question_id: fixture.questionId,
      p_resolution: { kind: "answer", answer: "Ana Prado" },
      p_operation_key: suggestedOperationKey,
    }),
    "replay the suggestion-originated answer",
  );
  assert(replay.idempotent === true, "the suggestion-originated replay was not idempotent");
  assert(replay.undo_id === suggestedResult.undo_id, "the replay returned a different undo operation");
  const mismatch = await owner.rpc("resolve_pending_question_v2", {
    p_question_id: fixture.questionId,
    p_resolution: { kind: "answer", answer: "Bruno Lima" },
    p_operation_key: suggestedOperationKey,
  });
  assert(mismatch.error?.code === "P0001", "the operation-key mismatch was not rejected");
  assert(mismatch.error?.details === "2D_IDEMPOTENCY_MISMATCH", "the mismatch token changed");
  // The audit row records the resolution, never the suggestion.
  const auditRows = dataOrThrow(
    await admin
      .from("audit_logs")
      .select("action_type,actor,reason,entity_type,entity_id,before_state,after_state")
      .eq("user_id", ownerUser.id),
    "read resolution audit rows",
  );
  assert(auditRows.length >= 1, "the suggestion-originated answer wrote no audit row");
  assert(
    !JSON.stringify(auditRows).includes("person:"),
    "an audit row recorded a suggestion id",
  );
  dataOrThrow(
    await owner.rpc("undo_operation", { p_undo_id: suggestedResult.undo_id }),
    "undo the suggestion-originated answer",
  );
  const restored = dataOrThrow(
    await owner
      .from("pending_questions")
      .select("status,answer,answered_at")
      .eq("id", fixture.questionId)
      .single(),
    "read the restored question",
  );
  assert(restored.status === "open", "undo did not restore the question to open");
  assert(restored.answer === null, "undo did not clear the answer");
  assert(restored.answered_at === null, "undo did not clear answered_at");
  pass();

  // --- 9. Typed answers and 2D.2 dispositions remain compatible -------------
  const typedFixture = await createPreviewFixture(owner, ownerUser.id, "typed");
  const typedResult = dataOrThrow(
    await owner.rpc("resolve_pending_question_v2", {
      p_question_id: typedFixture.questionId,
      p_resolution: { kind: "answer", answer: "Uma resposta digitada livremente" },
      p_operation_key: `${fixturePrefix}-typed`,
    }),
    "resolve with a typed answer",
  );
  assert(typedResult.resolution === "answered", "the typed answer did not resolve");
  const legacyV1Fixture = await createPreviewFixture(owner, ownerUser.id, "legacy");
  const legacyV1 = dataOrThrow(
    await owner.rpc("resolve_pending_question_v1", {
      p_question_id: legacyV1Fixture.questionId,
      p_resolution: { kind: "answer", answer: "Resposta pelo contrato legado" },
      p_operation_key: `${fixturePrefix}-legacy-v1`,
    }),
    "resolve through the preserved v1 contract",
  );
  assert(legacyV1.resolution === "answered", "resolve_pending_question_v1 stopped working");

  const dismissFixture = await createPreviewFixture(owner, ownerUser.id, "dismiss");
  const dismissed = dataOrThrow(
    await owner.rpc("resolve_pending_question_v2", {
      p_question_id: dismissFixture.questionId,
      p_resolution: { kind: "dismissed" },
      p_operation_key: `${fixturePrefix}-dismiss`,
    }),
    "dismiss a question",
  );
  assert(dismissed.resolution === "dismissed", "the dismissal disposition regressed");

  const notRelevantFixture = await createPreviewFixture(owner, ownerUser.id, "notrelevant");
  const notRelevant = dataOrThrow(
    await owner.rpc("resolve_pending_question_v2", {
      p_question_id: notRelevantFixture.questionId,
      p_resolution: { kind: "not_relevant" },
      p_operation_key: `${fixturePrefix}-notrelevant`,
    }),
    "mark a question not relevant",
  );
  assert(notRelevant.resolution === "not_relevant", "the not_relevant disposition regressed");

  const deferFixture = await createPreviewFixture(owner, ownerUser.id, "defer");
  const deferred = dataOrThrow(
    await owner.rpc("resolve_pending_question_v2", {
      p_question_id: deferFixture.questionId,
      p_resolution: {
        kind: "deferred",
        snoozedUntil: new Date(Date.now() + 86_400_000).toISOString(),
      },
      p_operation_key: `${fixturePrefix}-defer`,
    }),
    "defer a question",
  );
  assert(deferred.resolution === "deferred", "the deferral disposition regressed");

  // The closed write shape still rejects a smuggled provenance key.
  const forgedShape = await owner.rpc("resolve_pending_question_v2", {
    p_question_id: typedFixture.questionId,
    p_resolution: { kind: "answer", answer: "Ana Prado", origin: "suggested" },
    p_operation_key: `${fixturePrefix}-forged-shape`,
  });
  assert(forgedShape.error?.code === "22023", "the closed resolution payload accepted a provenance key");
  const forgedSuggestionKey = await owner.rpc("resolve_pending_question_v2", {
    p_question_id: typedFixture.questionId,
    p_resolution: { kind: "answer", answer: "Ana Prado", suggestionId: "person:ana-prado" },
    p_operation_key: `${fixturePrefix}-forged-suggestion`,
  });
  assert(forgedSuggestionKey.error?.code === "22023", "the closed resolution payload accepted a suggestion id");
  pass();

  // --- 10. The immutable interpretation never changed -----------------------
  const interpretationAfter = dataOrThrow(
    await owner
      .from("entry_interpretations")
      .select("pending_questions,extracted_people,extracted_projects")
      .eq("id", fixture.interpretationId)
      .single(),
    "re-read the immutable interpretation",
  );
  assert(
    JSON.stringify(interpretationAfter) === JSON.stringify(interpretationBefore),
    "the immutable interpretation changed during the preview cycle",
  );
  pass();

  smokeSummary = {
    cases: caseCount,
    fixturePrefix,
    preExistingAuthUsers: before.authUserIds.length,
    preExistingTableCounts: before.tableCounts,
  };
} finally {
  await Promise.all(createdUserIds.map(async (userId) => {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error) throw new Error(`delete Phase 2D preview user: ${result.error.message}`);
  }));
}

const after = await environmentSnapshot();
const remainingUsers = (await listAllUsers()).filter((user) => user.email?.startsWith(fixturePrefix));
const remainingEntries = await admin
  .from("entries")
  .select("id", { count: "exact", head: true })
  .like("original_content", `Phase 2D preview smoke: ${fixturePrefix}%`);
if (remainingEntries.error) throw remainingEntries.error;

assert(remainingUsers.length === 0, "Disposable Phase 2D preview Auth user remained after cleanup");
assert((remainingEntries.count ?? 0) === 0, "Disposable Phase 2D preview entries remained after cleanup");
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
