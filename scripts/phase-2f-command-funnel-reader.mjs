/**
 * Phase 2F Slice 2F.5 — the command-funnel reader's runner (PRD 2F-MEASURE-001…006).
 *
 * Two modes, and they are not the same thing:
 *
 *   node scripts/phase-2f-command-funnel-reader.mjs --email … --password …
 *     Reads one owner's funnel through that owner's own authenticated session
 *     and prints the report and both evidence tiers. It **writes nothing**:
 *     measuring must not perturb what is measured, so this mode records no
 *     product event and touches no row.
 *
 *   node scripts/phase-2f-command-funnel-reader.mjs --proof
 *     The exclusion-mechanism proof (2F-MEASURE-002) against the deployed
 *     project. This mode **does** write: it creates two disposable owners, emits
 *     a designed corpus through the real `record_product_event`, asserts the
 *     reader's exact aggregates, and deletes both owners. The fixture rows
 *     belong to fixture users, so even a run killed mid-flight leaves nothing
 *     inside the real owner's range — owner-scoping puts them out of reach.
 *
 * Every measurement read is authenticated, never service-role. The service-role
 * key is used only for fixture lifecycle and for the one denial probe that
 * proves it cannot read events at all (PRD S5-S1, §18.14).
 *
 * Exit codes follow the standing remote-script convention: 0 pass, 1 assertion
 * failure, 2 "the deployed chain cannot answer this yet". Exit 2 is raised as a
 * tagged **throw**, never as a bare `process.exit`, so the cleanup block always
 * runs — a mid-run schema-cache miss must not be able to leave fixtures behind.
 */

import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";
import {
  COMMAND_FUNNEL_EVENT_NAMES,
  aggregateCommandFunnel,
  evaluateEvidenceTiers,
} from "./phase-2f-command-funnel.mjs";

const DEFAULT_WINDOW_DAYS = 14;
const PAGE_SIZE = 1000;
const PROOF_APP_VERSION = "2f5-funnel-proof-1";
const PROOF_ZONE = "America/Sao_Paulo";
/** Client/server clock skew tolerance for the proof's window end. */
const PROOF_WINDOW_MARGIN_MS = 60_000;

class NotDeployed extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 2;
  }
}

function argument(name) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0) {
    const next = process.argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`--${name} was given without a value`);
    }
    return next;
  }
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function assert(condition, label, detail) {
  if (!condition) throw new Error(`FAILED: ${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ok  ${label}`);
}

function dataOrThrow(result, label) {
  if (result.error) throw new Error(`${label} (${result.error.code ?? "unknown"})`);
  return result.data;
}

function isMissingRelation(error) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * One owner's `task_command_*` rows, by keyset pagination.
 *
 * Keyset rather than OFFSET, and ordered on `(created_at, id)` rather than
 * `created_at` alone, because `created_at` is not unique
 * (`202607170024_phase_2x_product_events.sql:50`) and Postgres gives no stable
 * order for tied rows across separate statements. With OFFSET, a tie straddling
 * a page boundary can return a row twice or not at all — and under-reporting a
 * gate is the failure mode that looks like a passing run. `id` is unique, so the
 * composite key is total and the walk is exhaustive by construction.
 */
async function fetchOwnerRows(client, since) {
  const rows = [];
  let cursor = { createdAt: since, id: "00000000-0000-0000-0000-000000000000" };
  let pages = 0;
  for (;;) {
    const page = await client
      .from("product_events")
      .select("id, event_name, created_at, is_synthetic, properties")
      .in("event_name", COMMAND_FUNNEL_EVENT_NAMES)
      .or(`created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (page.error) {
      if (isMissingRelation(page.error)) {
        throw new NotDeployed(`public.product_events is not reachable: ${page.error.message}`);
      }
      throw new Error(`fetch product events (${page.error.code ?? "unknown"})`);
    }
    const batch = page.data ?? [];
    pages += 1;
    for (const row of batch) {
      rows.push({
        eventName: row.event_name,
        createdAt: row.created_at,
        isSynthetic: row.is_synthetic,
        properties: row.properties ?? {},
      });
    }
    if (batch.length < PAGE_SIZE) return { rows, pages };
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }
}

/**
 * The owner's own time zone, or a refusal.
 *
 * Production falls back to a default for a missing profile row
 * (`task-commands/actions.ts:214-224`) because a command still has to run. A
 * measurement must not: bucketing `activeDays` in the wrong zone can split one
 * local day into two across a UTC−3 midnight, and that accident *passes* a gate.
 * There is deliberately no `--time-zone` override — a gate whose bucketing the
 * caller chooses is not a gate.
 */
async function resolveTimeZone(client) {
  const profile = await client.from("profiles").select("timezone").maybeSingle();
  if (profile.error) throw new Error(`read profile time zone (${profile.error.code ?? "unknown"})`);
  const timeZone = profile.data?.timezone;
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    throw new Error(
      "The owner has no profile time zone; the reader refuses to assume one (PRD S5-R6)",
    );
  }
  return timeZone;
}

function print(report, evaluation) {
  if (flag("json")) {
    console.log(JSON.stringify({ report, evaluation }, null, 2));
    return;
  }
  console.log("");
  console.log(`Command funnel — reader ${report.readerVersion}, standard ${report.adr}`);
  console.log(`  window            ${report.window.start} .. ${report.window.end} (${report.window.days}d)`);
  console.log(`  time zone         ${report.timeZone}`);
  console.log(`  counting unit     ${report.countingUnit} (1-3 rounds per intent; some intents emit none)`);
  console.log(`  qualifying        ${report.qualifyingCommands}`);
  console.log(`  active days       ${report.activeDays}`);
  console.log(`  unsupported       ${report.unsupportedRefusals} (volume not measurable in production — see reachability)`);
  console.log(`  excluded          ${report.excludedSynthetic} synthetic, ${report.excludedOutOfWindow} out of window`);
  console.log(`  policy versions   ${JSON.stringify(report.policyVersions)}`);
  console.log(`  previewed         ${JSON.stringify(report.previewedByOrigin)}`);
  console.log(`  applied           ${JSON.stringify(report.appliedByOrigin)} (a superset: the Work direct-action path has no preview round)`);
  console.log(`  outcomes          ${JSON.stringify(report.outcomeDistribution)}`);
  console.log(`  refusal classes   ${JSON.stringify(report.refusalOutcomeClasses)}`);
  console.log(`  apply routes      ${JSON.stringify(report.appliedRoutesByOrigin)}`);
  console.log(`  undos             ${JSON.stringify(report.undoResultsByOrigin)}`);
  console.log(`  disambiguations   ${JSON.stringify(report.disambiguationsByOrigin)}`);
  console.log(`  rates             ${JSON.stringify(report.rates)}`);
  if (report.windowBoundarySkew > 0) {
    console.log(`  boundary skew     ${report.windowBoundarySkew} creation(s) whose offer predates the window`);
  }
  if (report.replayedCreations > 0) {
    console.log(`  replayed          ${report.replayedCreations} creation replay(s), not counted as creations`);
  }
  console.log(`  non-authorizing   ${report.nonAuthorizing.join(", ")}`);
  console.log("");
  console.log(`  spike tier        ${evaluation.spike.verdict}`);
  for (const [name, entry] of Object.entries(evaluation.spike.thresholds)) {
    const relation = entry.comparison === "at_most" ? "at most" : "at least";
    console.log(`    ${name.padEnd(20)} ${entry.measured} (${relation} ${entry.required}) ${entry.met ? "met" : "not met"}`);
  }
  console.log(`  planning tier     ${evaluation.planning.verdict}`);
  const gate = evaluation.planning.thresholds.rateGate;
  console.log(`    rate gate            no-match ${gate.measured.exact.noMatch}, to-creation ${gate.measured.exact.noMatchToCreation} — ${gate.met ? "met" : "not met"}`);
  console.log(`    distinct users       out of an owner-scoped reader's range; privileged read required`);
  if (evaluation.expiry) {
    console.log(`  expiry            go-live ${evaluation.expiry.goLive} + ${evaluation.expiry.horizonDays}d = ${evaluation.expiry.expiresOn}`);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Owner read
// ---------------------------------------------------------------------------

async function runOwnerRead(credentials, clientOptions) {
  const email = argument("email") ?? process.env.FUNNEL_OWNER_EMAIL;
  const password = argument("password") ?? process.env.FUNNEL_OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "An owner read needs that owner's own credentials: --email and --password "
      + "(or FUNNEL_OWNER_EMAIL / FUNNEL_OWNER_PASSWORD). The reader is owner-scoped by "
      + "RLS and never reads events with the service-role key.",
    );
  }

  // Arguments are validated before anything derived from them is computed, so a
  // typo produces the named diagnostic rather than a bare RangeError from
  // `Date`.
  const rawWindowDays = argument("window-days") ?? String(DEFAULT_WINDOW_DAYS);
  const windowDays = Number.parseInt(rawWindowDays, 10);
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new Error(`--window-days must be a positive integer, received: ${rawWindowDays}`);
  }
  const rawWindowEnd = argument("window-end") ?? new Date().toISOString();
  const windowEndMs = new Date(rawWindowEnd).getTime();
  if (Number.isNaN(windowEndMs)) {
    throw new Error(`--window-end must be a parseable instant, received: ${rawWindowEnd}`);
  }
  const goLive = argument("go-live") ?? null;

  const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
  dataOrThrow(await client.auth.signInWithPassword({ email, password }), "sign in owner");

  try {
    const timeZone = await resolveTimeZone(client);
    const since = new Date(windowEndMs - windowDays * 86400000).toISOString();
    const { rows, pages } = await fetchOwnerRows(client, since);
    const report = aggregateCommandFunnel({
      rows,
      timeZone,
      windowEnd: new Date(windowEndMs).toISOString(),
      windowDays,
    });
    const evaluation = evaluateEvidenceTiers(report, { goLive });

    if (!flag("json")) {
      console.log(`Fetched ${rows.length} row(s) across ${pages} page(s).`);
    }
    print(report, evaluation);
  } finally {
    await client.auth.signOut();
  }
}

// ---------------------------------------------------------------------------
// The exclusion-mechanism proof
// ---------------------------------------------------------------------------

/**
 * Refuse to start without a full local day ahead of the run.
 *
 * Every fixture event's `created_at` is `now()` — `product_events` accepts no
 * direct insert, so the proof cannot choose its own timestamps — which makes
 * `activeDays` exactly 1 unless the run straddles local midnight. Rather than
 * loosen the assertion to "1 or 2", which would stop proving anything, the run
 * refuses when local midnight is within half an hour and says why. Starting just
 * *after* midnight is fine and is not refused. Day bucketing itself is pure
 * arithmetic and is proven exactly in CI by `command-funnel.test.ts`.
 */
function localMinutesIntoDay() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PROOF_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return { hour, minute, minutesIntoDay: hour * 60 + minute };
}

function refuseNearLocalMidnight() {
  const { hour, minute, minutesIntoDay } = localMinutesIntoDay();
  if (minutesIntoDay > 1410) {
    throw new NotDeployed(
      `This proof pins activeDays to 1, and it is ${String(hour).padStart(2, "0")}:`
      + `${String(minute).padStart(2, "0")} in ${PROOF_ZONE} — a run straddling local `
      + "midnight would split the corpus across two days. Re-run after midnight.",
    );
  }
}

function previewedProperties(overrides) {
  return {
    commandOrigin: "chat",
    outcomeCategory: "previewed",
    candidateCount: 1,
    scoreBand: "high",
    marginBand: "high",
    signalCategories: ["normalized_exact_title"],
    oneStep: true,
    requiresConfirmation: false,
    policyVersion: "2026-07-25.3",
    ...overrides,
  };
}

/**
 * Owner A's designed corpus.
 *
 * Chosen so every measure has a distinct expected value — no two counters share
 * a number that a transposition could hide — and so both exclusion classes are
 * exercised: one `unsupported` row (out of the denominator, counted separately)
 * and one synthetic row (dropped entirely). The non-synthetic rows are the
 * minimum the assertions require; they belong to a disposable owner and leave
 * with it.
 */
const OWNER_A_CORPUS = [
  { name: "task_command_previewed", properties: previewedProperties({}) },
  {
    name: "task_command_previewed",
    properties: previewedProperties({
      outcomeCategory: "ambiguous", oneStep: false, candidateCount: 3,
    }),
  },
  { name: "task_command_previewed", properties: previewedProperties({ commandOrigin: "work" }) },
  {
    name: "task_command_previewed",
    properties: previewedProperties({ outcomeCategory: "unsupported", oneStep: false }),
  },
  { name: "task_command_previewed", synthetic: true, properties: previewedProperties({}) },
  {
    name: "task_command_previewed",
    properties: previewedProperties({ outcomeCategory: "still_unmatched", oneStep: false }),
  },
  {
    name: "task_command_previewed",
    properties: previewedProperties({ outcomeCategory: "creation_offered", oneStep: false }),
  },
  {
    name: "task_command_previewed",
    properties: previewedProperties({
      commandOrigin: "work", outcomeCategory: "creation_offered", oneStep: false,
    }),
  },
  {
    name: "task_command_disambiguated",
    properties: {
      commandOrigin: "chat", candidateCount: 3, selectedRank: 2, policyVersion: "2026-07-25.3",
    },
  },
  {
    name: "task_command_applied",
    properties: {
      commandOrigin: "chat", outcomeCategory: "applied", applyRoute: "direct",
      replayed: false, policyVersion: "2026-07-25.3",
    },
  },
  {
    name: "task_command_applied",
    properties: {
      commandOrigin: "chat", outcomeCategory: "applied", applyRoute: "created",
      replayed: false, policyVersion: "2026-07-25.3",
    },
  },
  // A replay of that creation: it created nothing, so the gate must not count it.
  {
    name: "task_command_applied",
    properties: {
      commandOrigin: "chat", outcomeCategory: "applied", applyRoute: "created",
      replayed: true, policyVersion: "2026-07-25.3",
    },
  },
  {
    name: "task_command_applied",
    properties: {
      commandOrigin: "work", outcomeCategory: "applied", applyRoute: "direct",
      replayed: false, policyVersion: "2026-07-25.3",
    },
  },
  {
    name: "task_command_undone",
    properties: { commandOrigin: "chat", undoResult: "undone", policyVersion: "2026-07-25.3" },
  },
  {
    name: "task_command_undone",
    properties: { commandOrigin: "work", undoResult: "expired", policyVersion: "2026-07-25.3" },
  },
];

/** Owner B exists to make A's isolation falsifiable, so its corpus is minimal. */
const OWNER_B_CORPUS = [
  { name: "task_command_previewed", properties: previewedProperties({}) },
  { name: "task_command_previewed", properties: previewedProperties({ commandOrigin: "work" }) },
];

async function emit(client, corpus) {
  for (const event of corpus) {
    const recorded = await client.rpc("record_product_event", {
      p_event_name: event.name,
      p_surface: "task_command",
      p_locale: "en",
      p_viewport_class: "desktop",
      p_app_version: PROOF_APP_VERSION,
      p_properties: event.properties,
      p_subject_type: null,
      p_subject_id: null,
      p_session_id: crypto.randomUUID(),
      p_idempotency_key: crypto.randomUUID(),
      p_is_synthetic: event.synthetic === true,
    });
    if (recorded.error) {
      if (recorded.error.code === "PGRST202") {
        throw new NotDeployed(`record_product_event is absent: ${recorded.error.message}`);
      }
      throw new Error(`record ${event.name} (${recorded.error.code ?? "unknown"})`);
    }
    const rows = recorded.data;
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].recorded !== true) {
      throw new Error(`record ${event.name}: the recorder did not accept the payload`);
    }
  }
}

async function reportFor(client, windowEnd) {
  const since = new Date(new Date(windowEnd).getTime() - DEFAULT_WINDOW_DAYS * 86400000)
    .toISOString();
  const { rows } = await fetchOwnerRows(client, since);
  return aggregateCommandFunnel({
    rows,
    timeZone: PROOF_ZONE,
    windowEnd,
    windowDays: DEFAULT_WINDOW_DAYS,
  });
}

async function runProof(credentials, clientOptions) {
  refuseNearLocalMidnight();

  const admin = createClient(credentials.url, credentials.serviceRoleKey, clientOptions);
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = `Phase-2F5-${crypto.randomUUID()}!`;
  const createdUsers = [];
  const sessions = [];

  async function createOwner(label) {
    const created = dataOrThrow(
      await admin.auth.admin.createUser({
        email: `phase-2f5-funnel-${label}-${suffix}@example.test`,
        password,
        email_confirm: true,
      }),
      `create funnel owner ${label}`,
    ).user;
    if (!created) throw new Error(`funnel owner ${label} was not returned`);
    createdUsers.push(created.id);
    const client = createClient(credentials.url, credentials.publishableKey, clientOptions);
    dataOrThrow(
      await client.auth.signInWithPassword({ email: created.email, password }),
      `sign in funnel owner ${label}`,
    );
    sessions.push(client);
    return { client, user: created };
  }

  let cleanupProven = false;
  try {
    console.log("Phase 2F Slice 2F.5 — command-funnel exclusion-mechanism proof");
    console.log("This mode writes disposable fixtures and deletes them; the reader itself writes nothing.");
    console.log("");

    const ownerA = await createOwner("a");
    const ownerB = await createOwner("b");

    // The owner's own profile time zone must exist before the reader will read.
    // Asserted as resolvable rather than equal to a particular value: the column
    // default is schema, not this slice's contract.
    const zoneA = await resolveTimeZone(ownerA.client);
    assert(typeof zoneA === "string" && zoneA.length > 0,
      "Fixture owner carries a resolvable profile time zone", zoneA);

    await emit(ownerA.client, OWNER_A_CORPUS);
    await emit(ownerB.client, OWNER_B_CORPUS);

    const windowEnd = new Date(Date.now() + PROOF_WINDOW_MARGIN_MS).toISOString();
    const reportA = await reportFor(ownerA.client, windowEnd);
    const reportB = await reportFor(ownerB.client, windowEnd);

    // 2F-OWNERSHIP-001's standing lesson: assert presence before absence, or a
    // zero-row bug passes the isolation check without anything going red.
    assert(reportA.qualifyingCommands === 6, "Owner A sees its own six qualifying rounds",
      `saw ${reportA.qualifyingCommands}`);
    assert(reportB.qualifyingCommands === 2, "Owner B sees its own two qualifying rounds",
      `saw ${reportB.qualifyingCommands}`);
    assert(reportA.previewedByOrigin.chat === 4 && reportA.previewedByOrigin.work === 2,
      "Owner A's origin split is exact", JSON.stringify(reportA.previewedByOrigin));
    assert(reportB.previewedByOrigin.chat === 1 && reportB.previewedByOrigin.work === 1,
      "Owner B's origin split is exact", JSON.stringify(reportB.previewedByOrigin));

    // Isolation, in both directions. A's totals already exclude B's rows: any
    // leak would have made the exact counts above fail. This states it directly.
    const foreignA = dataOrThrow(
      await ownerA.client.from("product_events").select("id").eq("user_id", ownerB.user.id),
      "owner A reads owner B's events",
    );
    assert(foreignA.length === 0, "Owner A cannot read owner B's events",
      `${foreignA.length} row(s) leaked`);
    const foreignB = dataOrThrow(
      await ownerB.client.from("product_events").select("id").eq("user_id", ownerA.user.id),
      "owner B reads owner A's events",
    );
    assert(foreignB.length === 0, "Owner B cannot read owner A's events",
      `${foreignB.length} row(s) leaked`);

    assert(reportA.unsupportedRefusals === 1,
      "The unsupported refusal is counted outside the denominator",
      `saw ${reportA.unsupportedRefusals}`);
    assert(reportA.outcomeDistribution.unsupported === 0,
      "The unsupported row is absent from the qualifying distribution");
    assert(reportA.refusalOutcomeClasses.unsupported === 1,
      "The refusal breakdown reports the unsupported refusal rather than a contradictory zero",
      JSON.stringify(reportA.refusalOutcomeClasses));
    assert(reportA.excludedSynthetic === 1, "The synthetic row is excluded",
      `saw ${reportA.excludedSynthetic}`);
    assert(reportA.activeDays === 1, "Active days are bucketed in the owner's own zone",
      `saw ${reportA.activeDays}`);
    assert(
      Object.values(reportA.outcomeDistribution).reduce((a, b) => a + b, 0)
        === reportA.qualifyingCommands,
      "The outcome distribution partitions the qualifying population exactly",
    );
    assert(reportA.rates.noMatch === 0.333 && reportA.rates.previewNoMatch === 0.5,
      "The final-outcome no-match rate subtracts the offer that became a creation",
      JSON.stringify(reportA.rates));
    assert(reportA.rates.noMatchToCreation === 0.167,
      "The no-match-to-creation rate is measured from applyRoute", JSON.stringify(reportA.rates));
    assert(reportA.replayedCreations === 1 && reportA.counts.created === 1,
      "A replayed creation is reported and not counted as a creation",
      `created ${reportA.counts.created}, replayed ${reportA.replayedCreations}`);
    assert(reportA.windowBoundarySkew === 0, "No creation crossed the window boundary");
    assert(
      reportA.appliedRoutesByOrigin.chat.direct === 1
        && reportA.appliedRoutesByOrigin.chat.created === 2
        && reportA.appliedRoutesByOrigin.work.direct === 1,
      "Applies are cross-tabulated by origin",
      JSON.stringify(reportA.appliedRoutesByOrigin),
    );
    assert(reportA.appliedByOrigin.chat === 3 && reportA.appliedByOrigin.work === 1,
      "The applied population is reported raw beside the previewed one",
      JSON.stringify(reportA.appliedByOrigin));
    assert(
      reportA.undoResultsByOrigin.chat.undone === 1
        && reportA.undoResultsByOrigin.work.expired === 1,
      "Undos are cross-tabulated by origin", JSON.stringify(reportA.undoResultsByOrigin),
    );
    assert(reportA.disambiguationsByOrigin.chat === 1
      && reportA.disambiguationsByOrigin.work === 0,
      "Disambiguations are cross-tabulated by origin");
    assert(Object.keys(reportA.policyVersions).length === 1
      && reportA.policyVersions["2026-07-25.3"] === 14,
      "Every counted row is attributed to the policy version that produced it",
      JSON.stringify(reportA.policyVersions));
    assert(reportA.distinctUsers === null && reportA.privilegedReadRequired === true,
      "The distinct-user count is reported as out of range, never inferred as one");

    const evaluationA = evaluateEvidenceTiers(reportA, { goLive: "2026-07-29" });
    assert(evaluationA.spike.verdict === "not_met",
      "Six rounds do not meet the spike tier", evaluationA.spike.verdict);
    assert(evaluationA.planning.verdict === "not_met",
      "Six rounds do not meet the planning tier", evaluationA.planning.verdict);
    assert(evaluationA.expiry.expiresOn === "2026-10-27",
      "The expiry is computed from go-live", evaluationA.expiry.expiresOn);

    // Anonymous denial.
    const anonymous = createClient(credentials.url, credentials.publishableKey, clientOptions);
    const anonRead = await anonymous.from("product_events").select("id").limit(1);
    assert(
      Boolean(anonRead.error) || (anonRead.data ?? []).length === 0,
      "An anonymous caller reads no product event",
      anonRead.error ? anonRead.error.code : `${(anonRead.data ?? []).length} row(s)`,
    );

    // Service-role denial. PRD §18.14: the fact the cascade proof's shape
    // depends on, executed rather than assumed. A dashboard grant would never
    // appear in the migration chain, so the chain's text is not evidence.
    const serviceRead = await admin.from("product_events").select("id").limit(1);
    assert(Boolean(serviceRead.error),
      "The service-role key cannot read product events",
      serviceRead.error ? serviceRead.error.code : `${(serviceRead.data ?? []).length} row(s)`);

    // Cascade. A's own positive count is already asserted above, so the
    // pre-condition is non-vacuous. Deletion is asserted, and re-authentication
    // is proven to fail. The foreign key's delete action itself is proven as
    // schema truth in CI (`supabase/tests/product_events.sql`) — no credential
    // this repository holds can read an event row once its owner is gone, and
    // that residual is recorded in the PRD rather than papered over.
    for (const client of sessions) await client.auth.signOut();
    for (const userId of createdUsers) {
      const removed = await admin.auth.admin.deleteUser(userId);
      assert(!removed.error, `Fixture owner ${userId.slice(0, 8)} is deleted`,
        removed.error ? removed.error.message : undefined);
    }
    const reauth = createClient(credentials.url, credentials.publishableKey, clientOptions);
    const denied = await reauth.auth.signInWithPassword({
      email: ownerA.user.email,
      password,
    });
    assert(Boolean(denied.error), "A deleted owner cannot authenticate again",
      denied.error ? denied.error.code : "sign-in succeeded");

    const survivors = [];
    for (const userId of createdUsers) {
      const still = await admin.auth.admin.getUserById(userId);
      if (still.data?.user) survivors.push(userId);
    }
    assert(survivors.length === 0, "No fixture owner survives the run", survivors.join(", "));
    cleanupProven = true;

    console.log("");
    console.log(JSON.stringify({
      status: "passed",
      controls: [
        "owner-scoping", "cross-owner-isolation", "anonymous-denial", "service-role-denial",
        "synthetic-exclusion", "unsupported-exclusion", "final-outcome-no-match",
        "replay-exclusion", "policy-version-attribution", "origin-cross-tabulation",
        "distinct-user-out-of-range", "tier-evaluation", "expiry", "cascade-deletion",
        "fail-closed-cleanup",
      ],
      ownerA: reportA,
      ownerB: {
        qualifyingCommands: reportB.qualifyingCommands,
        previewedByOrigin: reportB.previewedByOrigin,
      },
      evaluation: evaluationA,
    }, null, 2));
  } finally {
    // Fail-closed: anything this run created and did not prove gone is a failure,
    // not a warning. Deleting twice is harmless; leaving one behind is not. This
    // block runs even for an exit-2 condition, because exit 2 is a throw.
    if (!cleanupProven) {
      const residue = [];
      for (const userId of createdUsers) {
        const removed = await admin.auth.admin.deleteUser(userId);
        if (removed.error) residue.push(`${userId}: ${removed.error.message}`);
      }
      if (residue.length > 0) {
        console.error(`FAILED: ${residue.length} funnel fixture owner(s) survived the run`);
        for (const line of residue) console.error(`  ${line}`);
        process.exitCode = 1;
      }
    }
  }
}

async function main() {
  // Resolved inside the guarded path so a credential failure produces the
  // documented diagnostic rather than a raw stack trace. `linked-supabase.mjs`
  // never puts key material in an error.
  const credentials = getLinkedSupabaseCredentials();
  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  if (flag("proof")) await runProof(credentials, clientOptions);
  else await runOwnerRead(credentials, clientOptions);
}

try {
  await main();
} catch (error) {
  const exitCode = error instanceof NotDeployed ? 2 : 1;
  const label = exitCode === 2 ? "NOT DEPLOYED" : "ERROR";
  console.error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(process.exitCode === 1 ? 1 : exitCode);
}
