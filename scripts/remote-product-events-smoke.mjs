import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

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
  return { client, user: created };
}

try {
  const [{ client: first, user: firstUser }, { client: second, user: secondUser }] = await Promise.all([
    createTestUser(1),
    createTestUser(2),
  ]);

  const idempotencyKey = crypto.randomUUID();
  const ownEvent = dataOrThrow(
    await first.rpc("record_product_event", baseEvent({ p_idempotency_key: idempotencyKey })),
    "record allowlisted product event",
  );
  assert(Array.isArray(ownEvent) && ownEvent.length === 1 && ownEvent[0].recorded === true, "Allowlisted event was not recorded");

  const duplicatedEvent = dataOrThrow(
    await first.rpc("record_product_event", baseEvent({ p_idempotency_key: idempotencyKey })),
    "deduplicate product event",
  );
  assert(
    Array.isArray(duplicatedEvent)
      && duplicatedEvent.length === 1
      && duplicatedEvent[0].recorded === false
      && duplicatedEvent[0].event_id === ownEvent[0].event_id,
    "Product event idempotency did not return the existing event",
  );

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
    await first.from("product_events").select("user_id,event_name,id").order("created_at", { ascending: true }),
    "read owner-isolated product events",
  );
  assert(
    firstVisibleEvents.length === 1 && firstVisibleEvents.every((event) => event.user_id === firstUser.id),
    "Product-events RLS leaked another user row or duplicated rows",
  );

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
      }),
    }),
    "record service-role worker event",
  );
  assert(Array.isArray(workerEvent) && workerEvent.length === 1 && workerEvent[0].recorded === true, "Service-role worker event was not recorded");

  const ownerWorkerEvent = dataOrThrow(
    await first.from("product_events").select("id,is_synthetic").eq("id", workerEvent[0].event_id).single(),
    "read owner worker product event",
  );
  assert(ownerWorkerEvent.is_synthetic === true, "Synthetic smoke traffic was not marked for cleanup");

  console.log("Remote product-events smoke passed: allowlist, forbidden payloads, idempotency, subject ownership, RLS, service-role worker control, and disposable cleanup.");
} finally {
  await Promise.all(createdUsers.map(async (userId) => {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) console.error(`Could not remove product-events test user ${userId}: ${cleanup.error.code ?? "unknown"}`);
  }));
}
