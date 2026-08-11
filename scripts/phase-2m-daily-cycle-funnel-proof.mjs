/**
 * Phase 2M slice 2M.1 — the daily-cycle funnel's **hosted proof**
 * (`2M-METRICS-002`, `2M-METRICS-003`).
 *
 *   node scripts/phase-2m-daily-cycle-funnel-proof.mjs
 *
 * Proves, against the **deployed** project, that every event migration
 * `202608110090` admits can be written through the real authenticated writer and
 * then **read back by the consumer that ships with it** — not by a query this
 * file invents. It imports `readDailyCycleRows` from the reader and
 * `aggregateDailyCycleFunnel` from the funnel module, so what is proved here is
 * what `npm run measure:2m:funnel` will do.
 *
 * ## What this proves, and what it deliberately does not
 *
 * It proves the **writer** half and the **consumer** half. It does **not** prove
 * the producer half, because at this commit there is no producer: `2M-METRICS-001`
 * requires the migration to land before one exists, and it has. The corpus below
 * is written by this harness standing in for the calendar, the planner, the day
 * review and the notification sender, which arrive in slices 2M.1 part 2 through
 * 2M.4b. That gap is stated rather than smoothed — a harness is not a producer,
 * and recording it as one is how `R-09` gets violated with a green run.
 *
 * ## Why it is a separate file from the reader
 *
 * This one needs `service_role`, to create and destroy a disposable owner. The
 * reader must never have it: a measurement path that could read across owners
 * would be trusted rather than bounded, and `phase-2m-telemetry-guard.test.ts`
 * asserts the reader contains no such client. Keeping the admin client here is
 * what lets that assertion stay true and meaningful.
 *
 * ## Sessions without solving a CAPTCHA
 *
 * Turnstile has been enforced since SH.5, so `grant_type=password` answers
 * `captcha_failed` to every script. `admin/generate_link` mints a recovery token
 * and `verifyOtp` exchanges it — the path `sh5-password-policy-probe.mjs`
 * established.
 *
 * ## Side effects, stated
 *
 * Two disposable owners, created through the admin API because signup is closed
 * and must stay closed. Both are deleted in a `finally`, which cascades their
 * `product_events` rows away, and the run ends by **proving** zero residue
 * rather than asserting it. Their email prefix is `phase-2m-funnel-proof`.
 * Every event is written with `is_synthetic = true`.
 *
 * It prints no user content: counts and declared enum labels only — and there is
 * no user content to print, because no Phase 2M event has a key that could hold
 * any.
 */

import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";
import { aggregateDailyCycleFunnel, formatDailyCycleFunnel } from "./phase-2m-daily-cycle-funnel.mjs";
import { readDailyCycleRows } from "./phase-2m-daily-cycle-funnel-reader.mjs";

const APP_VERSION = "2m1-funnel-proof-1";
const EMAIL_PREFIX = "phase-2m-funnel-proof";

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function dataOrThrow(result, label) {
  if (result.error) throw new Error(`${label} (${result.error.code ?? result.error.message ?? "unknown"})`);
  return result.data;
}

/**
 * The designed corpus.
 *
 * Chosen so that **every aggregate the reader computes is non-trivial**: each
 * enum member that the report breaks out is exercised at least once where it
 * would otherwise be indistinguishable from zero, the two review scopes have
 * *different* action ratios, and `day_planned` covers both a single item and a
 * bulk one. A corpus of one event per name would prove writability and nothing
 * about the consumer.
 */
const CORPUS = [
  { name: "calendar_viewed", surface: "calendar", properties: { orientation: "day" } },
  { name: "calendar_viewed", surface: "calendar", properties: { orientation: "week" } },
  { name: "calendar_viewed", surface: "calendar", properties: { orientation: "week" } },
  { name: "calendar_viewed", surface: "calendar", properties: { orientation: "agenda" } },
  { name: "day_planned", surface: "calendar", properties: { operation: "set", itemCount: 1 } },
  { name: "day_planned", surface: "work", properties: { operation: "set", itemCount: 7 } },
  { name: "day_planned", surface: "calendar", properties: { operation: "cleared", itemCount: 2 } },
  { name: "day_review_opened", surface: "calendar", properties: { scope: "day" } },
  { name: "day_review_opened", surface: "calendar", properties: { scope: "day" } },
  { name: "day_review_opened", surface: "calendar", properties: { scope: "next_day" } },
  { name: "day_review_action_applied", surface: "calendar", properties: { scope: "day", actionKind: "reschedule" } },
  { name: "day_review_action_applied", surface: "calendar", properties: { scope: "day", actionKind: "carry_forward" } },
  { name: "notification_consent_changed", surface: "server", properties: { channel: "push", state: "granted" } },
  { name: "notification_consent_changed", surface: "server", properties: { channel: "push", state: "revoked" } },
  { name: "notification_suppressed", surface: "server", properties: { channel: "push", reason: "quiet_hours" } },
  { name: "notification_suppressed", surface: "server", properties: { channel: "push", reason: "quiet_hours" } },
  { name: "notification_suppressed", surface: "server", properties: { channel: "push", reason: "daily_cap" } },
];

/** What the reader must report for `CORPUS`, computed by hand from it. */
const EXPECTED = {
  considered: 17,
  unrecognised: 0,
  calendarTotal: 4,
  orientations: { day: 1, week: 2, agenda: 1 },
  planningTotal: 3,
  planningOperations: { set: 2, cleared: 1 },
  planningBulk: 2,
  itemsTouched: 10,
  reviewsOpened: { day: 2, next_day: 1 },
  reviewsActed: { day: 2, next_day: 0 },
  actionKinds: { carry_forward: 1, reschedule: 1, plan: 0, archive: 0, follow_up: 0 },
  consent: { granted: 1, denied: 0, revoked: 1, unsupported: 0, expired: 0 },
  suppressedTotal: 3,
  suppressed: { quiet_hours: 2, daily_cap: 1, cooldown: 0, duplicate: 0, not_consented: 0, type_muted: 0 },
};

const credentials = getLinkedSupabaseCredentials();
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `Phase-2M1-${crypto.randomUUID()}!`;
const createdUsers = [];

async function createDisposableOwner(label) {
  const email = `${EMAIL_PREFIX}-${label}-${suffix}@example.test`;
  const created = dataOrThrow(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    `create disposable owner ${label}`,
  ).user;
  assert(created, `disposable owner ${label} was not returned`);
  createdUsers.push(created.id);

  const link = dataOrThrow(
    await admin.auth.admin.generateLink({ type: "recovery", email }),
    `mint recovery token for ${label}`,
  );
  const hashedToken = link.properties?.hashed_token;
  assert(hashedToken, `no recovery token for ${label}`);

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  const verified = dataOrThrow(
    await client.auth.verifyOtp({ type: "recovery", token_hash: hashedToken }),
    `exchange recovery token for ${label}`,
  );
  assert(verified.session?.access_token, `no session for ${label}`);
  return { client, user: created };
}

async function write(client, event, label) {
  const response = dataOrThrow(
    await client.rpc("record_product_event", {
      p_event_name: event.name,
      p_surface: event.surface,
      p_locale: "pt-BR",
      p_viewport_class: "desktop",
      p_app_version: APP_VERSION,
      p_properties: event.properties,
      p_subject_type: null,
      p_subject_id: null,
      p_session_id: crypto.randomUUID(),
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: true,
    }),
    `${label}: record ${event.name}`,
  );
  assert(
    Array.isArray(response) && response.length === 1 && response[0].recorded === true,
    `${label}: ${event.name} on '${event.surface}' was not recorded`,
  );
  return response[0];
}

let exitCode = 0;
try {
  const owner = await createDisposableOwner("owner");
  const stranger = await createDisposableOwner("stranger");
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // ---------------------------------------------------------------------
  // 1. The writer half. Every declared event, on the surface it will carry.
  // ---------------------------------------------------------------------
  for (const event of CORPUS) await write(owner.client, event, "owner");

  // A row belonging to somebody else, so the consumer's RLS bound is proved
  // by a row that EXISTS and must not be read — never by an empty database.
  await write(stranger.client, { name: "calendar_viewed", surface: "calendar", properties: { orientation: "day" } }, "stranger");

  // ---------------------------------------------------------------------
  // 2. Negative controls, through the same writer, on a valid surface.
  // ---------------------------------------------------------------------
  const undeclaredName = await owner.client.rpc("record_product_event", {
    p_event_name: "calendar_day_viewed", p_surface: "calendar", p_locale: "pt-BR",
    p_viewport_class: "desktop", p_app_version: APP_VERSION, p_properties: {},
    p_subject_type: null, p_subject_id: null, p_session_id: crypto.randomUUID(),
    p_idempotency_key: crypto.randomUUID(), p_is_synthetic: true,
  });
  assert(undeclaredName.error?.code === "22023", "an undeclared event name was not refused");

  const undeclaredSurface = await owner.client.rpc("record_product_event", {
    p_event_name: "calendar_viewed", p_surface: "planner", p_locale: "pt-BR",
    p_viewport_class: "desktop", p_app_version: APP_VERSION, p_properties: { orientation: "day" },
    p_subject_type: null, p_subject_id: null, p_session_id: crypto.randomUUID(),
    p_idempotency_key: crypto.randomUUID(), p_is_synthetic: true,
  });
  assert(undeclaredSurface.error?.code === "22023", "an undeclared surface was not refused");

  // The one that matters most for this phase: a user-chosen DATE has nowhere
  // to go, on a valid event and a valid surface, so the refusal cannot be
  // explained by any other gate.
  const plantedDate = await owner.client.rpc("record_product_event", {
    p_event_name: "day_planned", p_surface: "calendar", p_locale: "pt-BR",
    p_viewport_class: "desktop", p_app_version: APP_VERSION,
    p_properties: { operation: "set", itemCount: 1, plannedDate: "2026-08-12" },
    p_subject_type: null, p_subject_id: null, p_session_id: crypto.randomUUID(),
    p_idempotency_key: crypto.randomUUID(), p_is_synthetic: true,
  });
  assert(plantedDate.error?.code === "22023", "a user-chosen date was not refused");

  const outOfEnum = await owner.client.rpc("record_product_event", {
    p_event_name: "calendar_viewed", p_surface: "calendar", p_locale: "pt-BR",
    p_viewport_class: "desktop", p_app_version: APP_VERSION, p_properties: { orientation: "month" },
    p_subject_type: null, p_subject_id: null, p_session_id: crypto.randomUUID(),
    p_idempotency_key: crypto.randomUUID(), p_is_synthetic: true,
  });
  assert(outOfEnum.error?.code === "22023", "an out-of-enum orientation was not refused");

  // Idempotency: the same key twice records once.
  const replayKey = crypto.randomUUID();
  const replayPayload = {
    p_event_name: "day_review_opened", p_surface: "calendar", p_locale: "pt-BR",
    p_viewport_class: "desktop", p_app_version: APP_VERSION, p_properties: { scope: "next_day" },
    p_subject_type: null, p_subject_id: null, p_session_id: crypto.randomUUID(),
    p_idempotency_key: replayKey, p_is_synthetic: true,
  };
  const firstWrite = dataOrThrow(await owner.client.rpc("record_product_event", replayPayload), "replay 1");
  const secondWrite = dataOrThrow(await owner.client.rpc("record_product_event", replayPayload), "replay 2");
  assert(firstWrite[0].recorded === true, "the first write of a replayed key was not recorded");
  assert(secondWrite[0].recorded === false, "a replayed idempotency key recorded twice");
  assert(firstWrite[0].event_id === secondWrite[0].event_id, "a replay returned a different event id");

  // ---------------------------------------------------------------------
  // 3. The consumer half, through the reader's own code path.
  // ---------------------------------------------------------------------
  const rows = await readDailyCycleRows(owner.client, since);
  const summary = aggregateDailyCycleFunnel(rows);

  // The replay above adds one `day_review_opened{next_day}` beyond the corpus,
  // and it is accounted for explicitly rather than by loosening an assertion.
  assert(summary.considered === EXPECTED.considered + 1, `considered ${summary.considered}, expected ${EXPECTED.considered + 1}`);
  assert(summary.unrecognised === EXPECTED.unrecognised, `unrecognised ${summary.unrecognised}`);
  assert(summary.calendar.total === EXPECTED.calendarTotal, `calendar.total ${summary.calendar.total}`);
  for (const [key, value] of Object.entries(EXPECTED.orientations)) {
    assert(summary.calendar.orientations[key] === value, `orientation ${key} ${summary.calendar.orientations[key]}`);
  }
  assert(summary.planning.total === EXPECTED.planningTotal, `planning.total ${summary.planning.total}`);
  for (const [key, value] of Object.entries(EXPECTED.planningOperations)) {
    assert(summary.planning.operations[key] === value, `operation ${key} ${summary.planning.operations[key]}`);
  }
  assert(summary.planning.bulk === EXPECTED.planningBulk, `bulk ${summary.planning.bulk}`);
  assert(summary.planning.itemsTouched === EXPECTED.itemsTouched, `itemsTouched ${summary.planning.itemsTouched}`);
  assert(summary.reviews.opened.day === EXPECTED.reviewsOpened.day, `opened.day ${summary.reviews.opened.day}`);
  assert(
    summary.reviews.opened.next_day === EXPECTED.reviewsOpened.next_day + 1,
    `opened.next_day ${summary.reviews.opened.next_day}`,
  );
  assert(summary.reviews.acted.day === EXPECTED.reviewsActed.day, `acted.day ${summary.reviews.acted.day}`);
  assert(summary.reviews.acted.next_day === EXPECTED.reviewsActed.next_day, `acted.next_day ${summary.reviews.acted.next_day}`);
  for (const [key, value] of Object.entries(EXPECTED.actionKinds)) {
    assert(summary.reviews.actionKinds[key] === value, `actionKind ${key} ${summary.reviews.actionKinds[key]}`);
  }
  for (const [key, value] of Object.entries(EXPECTED.consent)) {
    assert(summary.notifications.consent[key] === value, `consent ${key} ${summary.notifications.consent[key]}`);
  }
  assert(summary.notifications.suppressedTotal === EXPECTED.suppressedTotal, `suppressedTotal ${summary.notifications.suppressedTotal}`);
  for (const [key, value] of Object.entries(EXPECTED.suppressed)) {
    assert(summary.notifications.suppressed[key] === value, `suppressed ${key} ${summary.notifications.suppressed[key]}`);
  }

  // The RLS bound, proved against a row that exists: the stranger wrote a
  // `calendar_viewed{day}` and the owner's total for `day` is still 1.
  assert(summary.calendar.orientations.day === 1, "the consumer read another owner's calendar row");

  const strangerRows = await readDailyCycleRows(stranger.client, since);
  assert(strangerRows.length === 1, `the stranger sees ${strangerRows.length} rows, not their own one`);

  console.log("Phase 2M daily-cycle funnel proof passed against the deployed project.");
  console.log("");
  console.log(formatDailyCycleFunnel(summary));
  console.log("");
  console.log(JSON.stringify({
    declaredEvents: 6,
    corpusRows: CORPUS.length + 1,
    ownerVisibleRows: rows.length,
    controls: [
      "undeclared-event-name", "undeclared-surface", "planted-date",
      "out-of-enum-value", "idempotent-replay", "RLS-bound-against-a-real-row",
    ],
    producerHalf: "NOT PROVED HERE - no product producer exists yet, by 2M-METRICS-001",
  }, null, 2));
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  for (const id of createdUsers) {
    const cleanup = await admin.auth.admin.deleteUser(id);
    if (cleanup.error) {
      exitCode = 1;
      console.error(`could not remove disposable owner ${id}: ${cleanup.error.message}`);
    }
  }
  // Zero residue, PROVED owner-scoped rather than by a global count:
  // `product_events` is unreadable to `service_role`, so the honest evidence is
  // that no owner of those rows survives.
  let page = 1;
  const survivors = [];
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      exitCode = 1;
      console.error(`could not verify residue: ${error.message}`);
      break;
    }
    survivors.push(...data.users.filter((user) => (user.email ?? "").startsWith(EMAIL_PREFIX)).map((user) => user.email));
    if (data.users.length < 200) break;
    page += 1;
  }
  if (survivors.length > 0) {
    exitCode = 1;
    console.error(`residue: ${survivors.length} disposable owner(s) survived: ${survivors.join(", ")}`);
  } else {
    console.log("zero residue: no disposable owner survives, so none of their rows can.");
  }
}

process.exit(exitCode);
