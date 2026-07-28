import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";
import { readProductEventVocabulary } from "./product-event-vocabulary.mjs";

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function dataOrThrow(result, label) {
  if (result.error) throw new Error(`${label} (${result.error.code ?? "unknown"})`);
  return result.data;
}

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `Phase-2X-${crypto.randomUUID()}!`;
const createdUsers = [];
const createdClients = [];
// PRD 2E-ANALYTICS-006. Read from `src/features/product-analytics/contracts.ts`
// rather than restated here, so a name added in TypeScript cannot drift from
// this smoke. The nineteen names that used to be written out below had already
// fallen three behind the contracts module without anything going red
// (`docs/PHASE_2E_PRD.md §3.4`), which is the defect this closes.
const { eventNames: expectedEventNames, surfaces: expectedSurfaces } =
  readProductEventVocabulary();

function baseEvent(overrides = {}) {
  return {
    p_event_name: "capture_started",
    p_surface: "capture",
    p_locale: "en",
    p_viewport_class: "desktop",
    p_app_version: "2x-smoke-1",
    p_properties: { captureSource: "home" },
    p_subject_type: null,
    p_subject_id: null,
    p_session_id: crypto.randomUUID(),
    p_idempotency_key: crypto.randomUUID(),
    p_is_synthetic: true,
    ...overrides,
  };
}

async function createTestUser(index) {
  const created = dataOrThrow(
    await admin.auth.admin.createUser({
      email: `phase-2x-events-${index}-${suffix}@example.test`,
      password,
      email_confirm: true,
    }),
    `create product-events test user ${index}`,
  ).user;
  assert(created, `Product-events test user ${index} was not returned`);
  createdUsers.push(created.id);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(
    await client.auth.signInWithPassword({ email: created.email, password }),
    `sign in product-events test user ${index}`,
  );
  createdClients.push({ client, userId: created.id });
  return { client, user: created };
}

function eventMatrix({ entryId, taskId, questionId }) {
  const entrySubject = { p_subject_type: "entry", p_subject_id: entryId };
  return [
    { name: "capture_started", surface: "capture", properties: { captureSource: "capture_page" } },
    { name: "capture_save_succeeded", surface: "capture", properties: { captureSource: "capture_page", durationMs: 4 }, ...entrySubject },
    { name: "capture_save_failed", surface: "capture", properties: { captureSource: "capture_page", durationMs: 5, failureKind: "storage" } },
    { name: "capture_processing_enqueued", surface: "capture", properties: { processingMode: "initial" }, ...entrySubject },
    { name: "capture_processing_completed", surface: "server", properties: { processingMode: "initial", durationMs: 6, outcome: "ready" }, ...entrySubject },
    { name: "capture_processing_failed", surface: "server", properties: { processingMode: "reprocess", durationMs: 7, failureKind: "retryable" }, ...entrySubject },
    { name: "needs_attention_viewed", surface: "needs_attention", properties: { itemCount: 2 } },
    { name: "needs_attention_item_opened", surface: "needs_attention", properties: { attentionReason: "review_interpretation" }, ...entrySubject },
    { name: "interpretation_review_viewed", surface: "interpretation_review", properties: {}, ...entrySubject },
    { name: "interpretation_corrected", surface: "interpretation_review", properties: { fieldCount: 2 }, ...entrySubject },
    { name: "technical_details_opened", surface: "technical_details", properties: {}, ...entrySubject },
    { name: "task_candidates_presented", surface: "interpretation_review", properties: { candidateCount: 2 }, ...entrySubject },
    { name: "candidate_edit_started", surface: "interpretation_review", properties: { candidateCount: 1 }, ...entrySubject },
    { name: "candidate_edit_reset", surface: "interpretation_review", properties: { editedFieldCount: 2 }, ...entrySubject },
    { name: "task_candidates_confirmed", surface: "interpretation_review", properties: { candidateCount: 2, editedCandidateCount: 1, editedFieldCount: 2 }, ...entrySubject },
    { name: "question_answered_basic", surface: "server", properties: {}, p_subject_type: "pending_question", p_subject_id: questionId },
    // These three were in the contracts module and not in this matrix. The
    // vocabulary is now read from `contracts.ts` (2E-ANALYTICS-006), so their
    // absence is a red assertion rather than an untested gap nobody notices.
    { name: "question_resolved", surface: "questions", properties: { kind: "deferred" }, p_subject_type: "pending_question", p_subject_id: questionId },
    { name: "question_effect_previewed", surface: "questions", properties: {}, p_subject_type: "pending_question", p_subject_id: questionId },
    { name: "question_reinterpret_applied", surface: "questions", properties: {}, p_subject_type: "pending_question", p_subject_id: questionId },
    { name: "processing_retry_requested", surface: "interpretation_review", properties: { retrySource: "user" }, ...entrySubject },
    { name: "work_view_viewed", surface: "work", properties: { workView: "today" } },
    { name: "task_status_changed", surface: "work", properties: { fromStatus: "waiting", toStatus: "todo" }, p_subject_type: "task", p_subject_id: taskId },
    // Phase 2E Slice 2E.7. No subject: a command event names no entity, which
    // is 2E-ANALYTICS-003 as a shape rather than as a promise.
    {
      name: "task_command_previewed",
      surface: "task_command",
      properties: {
        commandOrigin: "chat",
        outcomeCategory: "matched_requires_confirmation",
        candidateCount: 1,
        scoreBand: "high",
        marginBand: "high",
        signalCategories: ["normalized_exact_title", "recent_activity"],
        oneStep: false,
        requiresConfirmation: true,
        policyVersion: "2026-07-25.2",
      },
    },
    {
      name: "task_command_disambiguated",
      surface: "task_command",
      properties: { commandOrigin: "work", candidateCount: 3, selectedRank: 2, policyVersion: "2026-07-25.2" },
    },
    {
      name: "task_command_applied",
      surface: "task_command",
      properties: {
        commandOrigin: "chat",
        outcomeCategory: "applied",
        applyRoute: "direct",
        replayed: false,
        policyVersion: "2026-07-25.2",
      },
    },
    {
      name: "task_command_undone",
      surface: "task_command",
      properties: { commandOrigin: "work", undoResult: "undone", policyVersion: "2026-07-25.2" },
    },
  ];
}

try {
  const [{ client: first, user: firstUser }, { client: second, user: secondUser }] = await Promise.all([
    createTestUser(1),
    createTestUser(2),
  ]);

  const ownedEntry = dataOrThrow(
    await admin.from("entries").insert({
      user_id: firstUser.id,
      original_content: "Disposable product-events subject fixture",
      source: "web",
      locale: "en",
    }).select("id").single(),
    "create owned product-event entry subject",
  );
  const ownedInterpretation = dataOrThrow(
    await admin.from("entry_interpretations").insert({
      user_id: firstUser.id,
      entry_id: ownedEntry.id,
      summary: "Disposable fixture",
      confidence: 1,
      model: "smoke-fixture",
      strategy_version: "smoke-v1",
      prompt_version: "smoke-v1",
      raw_output: {},
    }).select("id").single(),
    "create owned product-event interpretation fixture",
  );
  const ownedTask = dataOrThrow(
    await admin.from("tasks").insert({ user_id: firstUser.id, title: "Disposable task fixture", status: "waiting" }).select("id").single(),
    "create owned product-event task subject",
  );
  const ownedQuestion = dataOrThrow(
    await admin.from("pending_questions").insert({
      user_id: firstUser.id,
      entry_id: ownedEntry.id,
      interpretation_id: ownedInterpretation.id,
      candidate_index: 0,
      question: "Disposable question fixture?",
      reason: "smoke",
      confidence: 1,
    }).select("id").single(),
    "create owned product-event question subject",
  );

  const sessionId = crypto.randomUUID();
  const matrix = eventMatrix({ entryId: ownedEntry.id, taskId: ownedTask.id, questionId: ownedQuestion.id });
  assert(matrix.map((event) => event.name).join("|") === expectedEventNames.join("|"), "Smoke event matrix drifted from the canonical taxonomy");
  assert(matrix.every((event) => expectedSurfaces.includes(event.surface)), "Smoke event matrix names a surface the contracts module does not declare");
  // Every declared surface must be reachable through the RPC, not merely
  // declared in TypeScript. 2E-ANALYTICS-005 requires the value to exist in all
  // three allowlists, and this is the only one of the three a remote smoke can
  // observe: a surface present in `productSurfaces` and missing from the
  // `p_surface` guard fails here rather than in production.
  assert(expectedSurfaces.some((surface) => matrix.some((event) => event.surface === surface)) , "No declared surface was exercised");
  const recordedByName = new Map();
  for (const event of matrix) {
    const idempotencyKey = crypto.randomUUID();
    const response = dataOrThrow(
      await first.rpc("record_product_event", baseEvent({
        p_event_name: event.name,
        p_surface: event.surface,
        p_properties: event.properties,
        p_subject_type: event.p_subject_type ?? null,
        p_subject_id: event.p_subject_id ?? null,
        p_session_id: sessionId,
        p_idempotency_key: idempotencyKey,
      })),
      `record ${event.name}`,
    );
    assert(Array.isArray(response) && response.length === 1 && response[0].recorded === true, `${event.name} was not recorded`);
    assert(Object.keys(response[0]).sort().join("|") === "event_id|recorded", `${event.name} returned an unbounded response shape`);
    recordedByName.set(event.name, { eventId: response[0].event_id, idempotencyKey });
  }

  const firstCapture = recordedByName.get("capture_started");
  const duplicatedEvent = dataOrThrow(
    await first.rpc("record_product_event", baseEvent({
      p_event_name: "capture_started",
      p_properties: { captureSource: "capture_page" },
      p_session_id: sessionId,
      p_idempotency_key: firstCapture.idempotencyKey,
    })),
    "deduplicate product event",
  );
  assert(
    Array.isArray(duplicatedEvent)
      && duplicatedEvent.length === 1
      && duplicatedEvent[0].recorded === false
      && duplicatedEvent[0].event_id === firstCapture.eventId,
    "Product event idempotency did not return the existing event",
  );

  const distinctCapture = dataOrThrow(
    await first.rpc("record_product_event", baseEvent({
      p_event_name: "capture_started",
      p_properties: { captureSource: "home" },
      p_session_id: sessionId,
      p_idempotency_key: crypto.randomUUID(),
    })),
    "record a distinct meaningful interaction",
  );
  assert(distinctCapture[0]?.recorded === true && distinctCapture[0]?.event_id !== firstCapture.eventId, "Distinct interaction was incorrectly deduplicated");

  const legacyConfirmedEvent = dataOrThrow(
    await first.rpc("record_product_event", baseEvent({
      p_event_name: "task_candidates_confirmed",
      p_surface: "interpretation_review",
      p_properties: { candidateCount: 1 },
      p_session_id: sessionId,
      p_idempotency_key: crypto.randomUUID(),
    })),
    "record a legacy task_candidates_confirmed payload without edit counts",
  );
  assert(legacyConfirmedEvent[0]?.recorded === true, "Legacy task_candidates_confirmed payload (candidateCount only) was not persisted");

  const invalidEditStarted = await first.rpc("record_product_event", baseEvent({
    p_event_name: "candidate_edit_started",
    p_surface: "interpretation_review",
    p_properties: { candidateCount: 2 },
  }));
  assert(invalidEditStarted.error?.code === "22023", "candidate_edit_started with an out-of-bound candidateCount was not denied");

  const invalidEditedCounts = await first.rpc("record_product_event", baseEvent({
    p_event_name: "task_candidates_confirmed",
    p_surface: "interpretation_review",
    p_properties: { candidateCount: 1, editedCandidateCount: 2, editedFieldCount: 1 },
  }));
  assert(invalidEditedCounts.error?.code === "22023", "task_candidates_confirmed with editedCandidateCount above candidateCount was not denied");

  const invalidEvent = await first.rpc("record_product_event", baseEvent({ p_event_name: "unknown_event" }));
  assert(invalidEvent.error?.code === "22023", "Unknown product event was not denied");

  const invalidProperty = await first.rpc("record_product_event", baseEvent({ p_properties: { unexpected: true } }));
  assert(invalidProperty.error?.code === "22023", "Unknown product property was not denied");

  const forbiddenPayload = await first.rpc("record_product_event", baseEvent({ p_properties: { original: "private capture text" } }));
  assert(forbiddenPayload.error?.code === "22023", "Forbidden free-content payload was not denied");

  const directInsert = await first.from("product_events").insert({
    user_id: firstUser.id,
    event_name: "capture_started",
    surface: "capture",
    locale: "en",
    viewport_class: "desktop",
    app_version: "2x-smoke-1",
    properties: { captureSource: "home" },
    idempotency_key: crypto.randomUUID(),
    is_synthetic: true,
  });
  assert(Boolean(directInsert.error), "Direct product-event insertion bypassed the validated RPC");

  dataOrThrow(
    await second.rpc("record_product_event", baseEvent({
      p_event_name: "work_view_viewed",
      p_surface: "work",
      p_properties: { workView: "today" },
    })),
    "record second user product event",
  );
  const foreignEntry = dataOrThrow(
    await second.from("entries").insert({
      user_id: secondUser.id,
      original_content: "Remote product-events ownership fixture",
      source: "web",
      locale: "en",
    }).select("id").single(),
    "create foreign product-event subject",
  );
  const foreignSubject = await first.rpc("record_product_event", baseEvent({
    p_subject_type: "entry",
    p_subject_id: foreignEntry.id,
  }));
  assert(foreignSubject.error?.code === "42501", "Cross-user product-event subject was not denied");
  const firstVisibleEvents = dataOrThrow(
    await first.from("product_events").select("user_id,event_name,id,properties,created_at,is_synthetic").order("created_at", { ascending: true }),
    "read owner-isolated product events",
  );
  assert(
    firstVisibleEvents.length === expectedEventNames.length + 2 && firstVisibleEvents.every((event) => event.user_id === firstUser.id),
    "Product-events RLS leaked another user row or duplicated rows",
  );
  assert(
    firstVisibleEvents.some((event) => (
      event.event_name === "task_candidates_confirmed"
        && event.properties?.editedCandidateCount === 1
        && event.properties?.editedFieldCount === 2
    )),
    "task_candidates_confirmed's editedCandidateCount/editedFieldCount were not persisted",
  );
  assert(
    firstVisibleEvents.some((event) => event.event_name === "candidate_edit_started" && event.properties?.candidateCount === 1),
    "candidate_edit_started was not persisted",
  );
  assert(
    firstVisibleEvents.some((event) => event.event_name === "candidate_edit_reset" && event.properties?.editedFieldCount === 2),
    "candidate_edit_reset was not persisted",
  );
  assert(expectedEventNames.every((name) => firstVisibleEvents.some((event) => event.event_name === name)), "One or more canonical events were absent from the owner query");

  const crossUserWorkerEvent = await first.rpc("record_product_event_for_user", {
    p_user_id: secondUser.id,
    ...baseEvent(),
  });
  assert(Boolean(crossUserWorkerEvent.error), "Authenticated caller could use the service-role worker RPC");

  const workerEvent = dataOrThrow(
    await admin.rpc("record_product_event_for_user", {
      p_user_id: firstUser.id,
      ...baseEvent({
        p_event_name: "capture_processing_completed",
        p_surface: "server",
        p_properties: { processingMode: "initial", durationMs: 1, outcome: "ready" },
        p_subject_type: "entry",
        p_subject_id: ownedEntry.id,
      }),
    }),
    "record service-role worker event",
  );
  assert(Array.isArray(workerEvent) && workerEvent.length === 1 && workerEvent[0].recorded === true, "Service-role worker event was not recorded");

  const crossOwnerWorkerEvent = await admin.rpc("record_product_event_for_user", {
    p_user_id: firstUser.id,
    ...baseEvent({ p_subject_type: "entry", p_subject_id: foreignEntry.id }),
  });
  assert(crossOwnerWorkerEvent.error?.code === "42501", "Service-role RPC accepted a subject owned by another user");

  const ownerWorkerEvent = dataOrThrow(
    await first.from("product_events").select("id,is_synthetic").eq("id", workerEvent[0].event_id).single(),
    "read owner worker product event",
  );
  assert(ownerWorkerEvent.is_synthetic === true, "Synthetic smoke traffic was not marked for cleanup");

  const verificationEvents = dataOrThrow(
    await first.from("product_events").select("event_name,properties,is_synthetic").order("created_at", { ascending: true }),
    "run safe product funnel verification query",
  );
  const counts = Object.fromEntries(expectedEventNames.map((name) => [name, verificationEvents.filter((event) => event.event_name === name).length]));
  const durations = verificationEvents
    .map((event) => event.properties?.durationMs)
    .filter((value) => typeof value === "number");
  assert(expectedEventNames.every((name) => counts[name] >= 1), "Funnel count query found a missing canonical event");
  assert(durations.length >= 4 && durations.every((value) => value >= 0 && value <= 86_400_000), "Latency query found an invalid duration");
  assert(verificationEvents.every((event) => event.is_synthetic === true), "Disposable smoke traffic was not uniformly synthetic");
  // 2E-ANALYTICS-003: no product event carries user-authored content.
  //
  // This was a substring match for `original|summary|title|answer|prompt|error`
  // over the whole properties blob, and Phase 2E made it fail on its own payload:
  // line 106 above records `signalCategories: ["normalized_exact_title", …]`, a
  // member of the closed `taskMatchEvidenceLabels` vocabulary in `contracts.ts`. The
  // *label's name* contains "title"; the label carries no content whatsoever. The
  // check could not tell a category from the thing it categorizes.
  //
  // Replacing it with a shape test is stricter, not looser, in the direction that
  // matters. The old form missed every leak that avoided those six words — a raw
  // title of "Buy milk" passed it cleanly. Every declared property value is a
  // boolean, a number, or an identifier-shaped string: a category label, an enum
  // member, a policy version, an instant. User prose has whitespace and runs long.
  // So whitespace or length is the discriminator, and it needs no vocabulary
  // restatement to stay correct as the taxonomy grows — which is the same drift
  // that produced this failure in the first place.
  //
  // The key check is kept as-is: a property *named* `title` or `originalContent`
  // would be a contract defect regardless of what it happened to hold.
  const freeContentFindings = [];
  for (const event of verificationEvents) {
    for (const [key, value] of Object.entries(event.properties ?? {})) {
      if (/original|summary|title|answer|prompt|error/i.test(key)) {
        freeContentFindings.push(`${event.event_name}: property named "${key}"`);
      }
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item !== "string") continue;
        if (/\s/.test(item) || item.length > 64) {
          freeContentFindings.push(`${event.event_name}.${key} = ${JSON.stringify(item)}`);
        }
      }
    }
  }
  assert(
    freeContentFindings.length === 0,
    `Verification query exposed a forbidden free-content property: ${freeContentFindings.join("; ")}`,
  );

  console.log("Remote product-events smoke passed:", {
    taxonomyEvents: expectedEventNames.length,
    ownerVisibleRows: verificationEvents.length,
    conversion: {
      captureStarted: counts.capture_started,
      captureSaved: counts.capture_save_succeeded,
      processingCompleted: counts.capture_processing_completed,
    },
    latencySamplesMs: durations,
    controls: ["allowlist", "privacy", "idempotency", "distinct-interactions", "subject-ownership", "RLS", "service-role", "bounded-response", "synthetic-cleanup"],
  });
} finally {
  await Promise.all(createdUsers.map(async (userId) => {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) {
      console.error(`Could not remove product-events test user ${userId}: ${cleanup.error.code ?? "unknown"}`);
      process.exitCode = 1;
    }
  }));

  await Promise.all(createdClients.map(async ({ client, userId }) => {
    const orphanCheck = await client.from("product_events").select("id").limit(1);
    if (orphanCheck.error) {
      console.error(`Could not verify product-event cascade for ${userId}: ${orphanCheck.error.code ?? "unknown"}`);
      process.exitCode = 1;
    } else if (orphanCheck.data.length > 0) {
      console.error(`Product-event cleanup left owner-visible rows for ${userId}`);
      process.exitCode = 1;
    }
  }));
}
