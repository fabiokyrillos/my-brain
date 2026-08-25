/**
 * Phase 2F cleanup verifier (`2F-OPERATIONS-004`, Slice 2F.6).
 *
 * Proves zero Phase 2F fixture residue in the deployed project, across every
 * owner-scoped table a Phase 2F remote proof touched, plus the storage bucket no
 * foreign key can clean.
 *
 * **Verification only, and write-free.** It deletes nothing, creates nothing, and
 * mints no fixture user. `2F-OPERATIONS-004`'s words are "proves zero fixture
 * residue"; turning that into a sweep would be a silent scope change, and
 * turning it into a fixture-minting posture prober — as the Slice 2F.6 draft
 * briefly proposed — would have made the phase's most explicitly read-only slice
 * the only one that writes to production, with a fixture reminder able to move
 * the very census buckets the closeout stop-gate reads (definitive Slice 2F.6
 * PRD §26 B3).
 *
 * What each check can prove, ranked honestly
 * ------------------------------------------
 * This matters more than the check list, because the house pattern has already
 * been burned by a verifier whose only executed branch was the absent-table one
 * (`verify-phase-2e-cleanup.mjs:42-45`, twice in the same file).
 *
 * Every table below carries `user_id … references auth.users(id) on delete
 * cascade`, so **an orphan row is structurally impossible** and a zero orphan
 * count is not a measurement. The orphan scan is kept for the one regression it
 * *can* detect — a foreign key dropped or left `NOT VALID` — and
 * `supabase/tests/phase_2f_task_write_grants.sql` asserts each of those cascades
 * in CI so the impossibility is guarded rather than asserted in prose.
 *
 * The load-bearing residue detectors are therefore:
 *
 *   1. **zero surviving fixture-prefix users in `auth.users`** — this is what
 *      actually fires when a run dies before its cleanup;
 *   2. **zero fixture objects in the `user-files` bucket** — storage is the one
 *      residue class no cascade removes (`docs/SECURITY.md:72` records it as a
 *      real category for this project);
 *   3. **per-table read reachability** — a successful read of zero rows is
 *      reported differently from a table that could not be reached at all, so
 *      "zero" can never mean "asked nothing".
 *
 * Two tables are unreadable by design, and that is asserted rather than tolerated
 * -----------------------------------------------------------------------------
 * `202607260059:258-261` revokes ALL on `public.task_command_confirmations` from
 * `service_role`, and `202607170024` does the same for `public.product_events`.
 * This verifier authenticates as `service_role`, so both reads must be refused.
 * If either **succeeds**, a grant has been widened and the run FAILS — silently
 * accepting either answer would turn a security posture into a coin flip.
 *
 * For `product_events` that refusal is also the Slice 2F.5 handover, taken
 * exactly as written (`PHASE_2F_SLICE_05_PRD.md` §22): direct event-row absence
 * after an owner's deletion is **not readable with any credential this
 * repository holds**. What is proven instead is a composition — the asserted
 * refusal above, plus zero surviving fixture owners, plus
 * `user_id references auth.users(id) on delete cascade` (`202607170024:10`)
 * asserted in CI pgTAP. That composition is stated; no stronger claim is made.
 *
 * Deferrals are proven to have held
 * ---------------------------------
 * A closeout that only counts rows cannot tell whether the phase quietly
 * delivered something it deferred. So the verifier reads PostgREST's own OpenAPI
 * definition — a plain GET, reaching no function and writing nothing — and
 * asserts that `create_reminder` and `create_task_command_v2` do **not** exist,
 * and that `ai_usage_events` carries no prompt/strategy-version column
 * (ADR-057). It also asserts the reopening gate is intact: the dry-run script is
 * present and no transcript of it exists.
 *
 * Usage: `npm run test:remote:2f:cleanup`
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Disposable-user email prefixes, read off the scripts that mint them rather
 * than guessed. Note `phase2f-gate3-` has **no hyphen** after `phase2f`
 * (`scripts/phase-2f-gate3-exact-title-reuse.mjs:73`) — a naive `phase-2f-`
 * prefix would miss the whole Gate 3 fixture population.
 *
 * The Phase 2C/2D/2E/2X prefixes are retained so a stray fixture from any
 * adjacent smoke is still caught rather than silently ignored.
 */
export const DISPOSABLE_PREFIXES = Object.freeze([
  // Phase 2F.
  "phase-2f5-funnel-", // phase-2f-command-funnel-reader.mjs:457
  "phase-2f5-baseline-", // end-to-end-match-baseline.remote.test.ts:232
  "codex-2f3-", // phase-2f3-creation-probe.mjs:73
  "phase2f-gate3-", // phase-2f-gate3-exact-title-reuse.mjs:73
  // Inherited.
  "phase-2e-command-",
  "phase-2e-owner-a-",
  "phase-2e-owner-b-",
  "phase-2e6-creation-race-",
  "phase-2d-resolution-",
  "phase-2d-preview-",
  "phase-2d-reinterpret-",
  "phase-2c-integration-",
  "phase-2c-ui-",
  "phase-2a-jobs-",
  "phase-2b-revisions-",
  "phase-2x-entry-jobs-",
  "phase-2x-events-",
  "phase-2x-daily-cycle-",
  "sprint-1-5-",
  "codex-",
]);

/**
 * Owner-scoped tables scanned. The union of the Phase 2E verifier's list, the
 * residue tables named by the Slice 2F.3 and 2F.4 acceptance records, and the
 * Slice 2F.5 handover.
 */
export const SCANNED_TABLES = Object.freeze([
  "entries",
  "entry_interpretations",
  "jobs",
  "attachments",
  "pending_questions",
  "tasks",
  "projects",
  "contexts",
  "people",
  "task_projects",
  "task_contexts",
  "task_people",
  "task_dependencies",
  "entry_task_candidate_resolutions",
  "entry_person_candidate_resolutions",
  "reminders",
  "undo_operations",
  "ai_usage_events",
  // Posture-protected: scanned so the refusal is asserted, never for orphans.
  "task_command_confirmations",
  "product_events",
  // Added by BYOK.1 (`202608010065`). Scanned rather than excused, because these
  // are the two tables where residue would matter most: a surviving
  // `user_ai_credentials` row is a surviving *ciphertext*, and a surviving
  // `credential_validation_attempts` row is a surviving record that a deleted
  // account tried to configure one. Both cascade from `auth.users`, so a
  // non-zero count here means the cascade broke.
  //
  // This is not BYOK-DELETE-002's zero-secret residue verifier — that one is
  // BYOK.6's, and it checks more than row counts. This is the existing
  // owner-scoped sweep learning about two new tables, which is exactly what the
  // partition guard in `phase-2f-cleanup.test.ts` exists to force.
  "user_ai_credentials",
  "credential_validation_attempts",
]);

/**
 * Tables deliberately **not** scanned, each with its reason and cascade anchor.
 *
 * Written down rather than omitted, because the house pattern's habit of
 * recording its exclusions (`verify-phase-2e-cleanup.mjs:26-31`) is why they
 * survived review — silence reads as oversight and the next reader cannot tell
 * which it is.
 */
export const DELIBERATELY_NOT_SCANNED = Object.freeze({
  audit_logs: "append-only and designed to survive its subject; cascades from auth.users at 202607160003:130",
  notifications: "worker/heartbeat-owned, not a Phase 2F fixture target; cascades at 202607160007:52",
  notification_suppressions: "Phase 2S owner-written silence, read by the heartbeat and never a Phase 2F fixture target; cascades at 202608240102:80",
  heartbeat_runs: "heartbeat-owned per-tick record; cascades at 202607160007:68",
  memories: "no Phase 2F proof writes it; cascades at 202607160006:5",
  entry_embeddings: "no Phase 2F proof writes it; cascades at 202607160006:28",
  conversations: "no Phase 2F proof writes it; cascades at 202607160006:42",
  conversation_messages: "chat-only, no Phase 2F proof writes it; cascades at 202607160006:54",
  profiles: "identity row created by handle_new_user, not an independent fixture; cascades at 202607160001:8",
  agent_preferences: "same; cascades at 202607160001:18",
  organizations: "no Phase 2F proof writes it; cascades at 202607160003:14",
  entry_entities: "polymorphic entry link, written only by the interpretation worker; cascades at 202607160003:90",
  summaries: "review-generation output, no Phase 2F proof writes it; cascades at 202607160007:82",
  entity_attachments: "polymorphic attachment link, no Phase 2F proof writes it; cascades at 202607160007:120",
  person_relationships: "Phase 1 knowledge graph, untouched by this phase; cascades at 202607160009:7",
  person_contexts: "same; cascades at 202607160009:15",
  person_projects: "same; cascades at 202607160009:21",
  tags: "no Phase 2F proof writes it; cascades at 202607160009:49",
  entity_tags: "polymorphic tag link, no Phase 2F proof writes it; cascades at 202607160009:54",
  attachment_interpretations: "attachment worker output, no Phase 2F proof writes it; cascades at 202607160012:3",
  entity_aliases: "Phase 2B alias store, no Phase 2F proof writes it; cascades at 202607170020:118",
  account_lifecycle:
    "SH.1 state row seeded by handle_new_user, one per account like profiles, not an independent fixture; cascades at 202608040070:40",
  policy_acceptances:
    "SH.4 consent record written only by the account itself through record_policy_acceptance; no Phase 2F proof writes it; cascades at 202608040074:74",
  account_deletion_attempts:
    "2H.1 recovery state seeded by the lifecycle trigger only while an account is deleting, and unreadable by service_role by design, so this sweep could not count it even if it wanted to; cascades at 202608070079:57",
  error_events:
    "2H.2 error sink. Owner-scoped only incidentally -- user_id is nullable and records who was affected, never who is at fault -- and unreadable by service_role, so this sweep cannot count it; cascades at 202608070080:59",
  rate_limit_events:
    "2H.3 rate limiter state. Expiring admission decisions written only by consume_rate_limit_slot, unreadable by service_role by design (a role that could read or delete it could mint slots), so this sweep cannot count it; cascades at 202608070081:186",
  notification_consents:
    "2M.4b push consent. Written only by the account itself through the four validated SECURITY DEFINER RPCs (authenticated has SELECT and no write policy at all); no Phase 2F proof writes it; cascades at 202608120092:83",
  push_subscriptions:
    "2M.4b browser subscription. Same posture and same writers as the consent above -- a row exists only because the owner pressed a control and their browser returned a subscription; no Phase 2F proof writes it; cascades at 202608120092:133",
  notification_deliveries:
    "2M.4b content-free delivery audit. Written only by the leased sender through begin_push_delivery/finish_push_delivery, and the ONE table here with its own retention window (90 days, private.retention_windows, swept by a function granted to no role); no Phase 2F proof writes it; cascades at 202608120092:184",
  reminder_series:
    "Phase 2R slice 2R.1 recurrence model. Written ONLY through create_reminder_series_v1 and apply_reminder_series_command_v1 -- authenticated holds SELECT and nothing else, so there is no write for a Phase 2F fixture to make and no Phase 2F proof makes one; cascades at 202608230101:488",
});

/** Tables whose correct deployed posture is "service_role cannot read this", with the reason. */
export const SERVICE_ROLE_CANNOT_READ = Object.freeze({
  task_command_confirmations:
    "202607260059:258-261 revokes all from service_role and grants select to authenticated alone",
  product_events:
    "202607170024 keeps the behaviour ledger private: service_role holds no select, which is why event-row absence after an owner's deletion is unreadable with any credential this repository holds",
});

/** RPCs that must NOT exist, because the phase deferred or refused them. */
export const RPCS_THAT_MUST_NOT_EXIST = Object.freeze({
  create_reminder:
    "2F-REMINDER-001 (owner decision 3, Option C): no reminder-authoring RPC is introduced by this phase",
  create_task_command_v2:
    "2F-CREATE-002: the creation contract was extended by drop-and-recreate under the same name, never versioned — a _v2 would leave two live creation write paths",
});

/**
 * `record_ai_usage`'s argument set, which ADR-057 says is unchanged through Phase
 * 2F ("`record_ai_usage`'s signature is unchanged through Phase 2F (PRD §12)").
 *
 * This is the leg the definitive PRD's F21(a) requires and the design review
 * ordered *in place of* a guessed column name: no provenance column name was ever
 * declared anywhere, so asserting the absence of one would pass for the wrong
 * reason. PostgREST's OpenAPI body schema publishes the exact parameter names, so
 * the signature can be pinned by observation rather than by guesswork — and
 * closing `2E-COMMAND-012` necessarily changes this set, because ADR-053
 * establishes that every route to persisted provenance runs through a function
 * signature change.
 */
export const RECORD_AI_USAGE_ARGUMENTS = Object.freeze([
  "p_cached_input_tokens",
  "p_input_tokens",
  "p_model",
  "p_operation",
  "p_output_tokens",
  "p_provider_request_id",
  "p_reasoning_tokens",
  "p_source_id",
  "p_source_type",
  "p_user_id",
]);

/**
 * A secondary heuristic over `ai_usage_events`'s live column set, kept beside the
 * signature pin and **labelled as a heuristic**: a provenance column could be
 * named anything, so this catches the plausible names and is not the check F21
 * rests on.
 */
export const AI_USAGE_PROVENANCE_PATTERN = /(prompt|strategy).*version|version.*(prompt|strategy)/i;

const PRIVILEGE_DENIED = new Set(["42501", "PGRST301", "PGRST302"]);
const TABLE_ABSENT = new Set(["PGRST205", "42P01"]);

export function isPrivilegeDenied(error) {
  return PRIVILEGE_DENIED.has(error?.code ?? "")
    || /permission denied/i.test(error?.message ?? "");
}

export function isTableAbsent(error) {
  return TABLE_ABSENT.has(error?.code ?? "")
    || /does not exist|could not find the table/i.test(error?.message ?? "");
}

/**
 * Rows whose owner is gone. Exported and pure so CI can prove it detects an
 * orphan — the live scan cannot, because the cascade forbids the row.
 */
export function findOrphanRows(rows, knownUserIds) {
  return rows.filter((row) => row.user_id && !knownUserIds.has(row.user_id));
}

/** Fixture users still present, matched by the prefixes above. Never used to delete. */
export function findDisposableUsers(users, prefixes = DISPOSABLE_PREFIXES) {
  return users.filter((user) => prefixes.some(
    (prefix) => (user.email ?? "").toLowerCase().startsWith(prefix),
  ));
}

export function isFixtureStorageObject(name) {
  return name === "remote-smoke.txt" || name.endsWith("-remote-smoke.txt");
}

/** Every file name at or below `dir`, basenames only. Absent directory reads as empty. */
function reportNamesUnder(dir) {
  if (!existsSync(dir)) return [];
  const names = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) names.push(...reportNamesUnder(join(dir, entry.name)));
    else names.push(entry.name);
  }
  return names;
}

/** The ADR-057 reopening gate: the dry-run script present, no transcript of it recorded. */
export function readProvenanceReopeningGate(root = REPOSITORY_ROOT) {
  const script = "scripts/phase-2f-gate1-record-ai-usage-dry-run.sql";
  // Recursive: `docs/reports/` is a per-phase taxonomy, and a transcript filed
  // under the phase that reopens the work must still open this gate.
  const transcripts = reportNamesUnder(join(root, "docs/reports"))
    .filter((name) => /record[-_]?ai[-_]?usage.*dry[-_]?run/i.test(name));
  return {
    scriptPresent: existsSync(join(root, script)),
    script,
    transcripts,
  };
}

/**
 * PostgREST's own OpenAPI definition: the authoritative list of exposed tables,
 * their columns, and the RPC paths. A plain GET — it reaches no function and
 * writes nothing, which is why it is the right instrument for proving an
 * absence.
 */
export async function readOpenApiSchema(url, serviceRoleKey) {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) {
    throw new Error(
      `PostgREST did not serve its OpenAPI definition (HTTP ${response.status}). `
      + "The deferral checks cannot observe the schema, so this run refuses to pass.",
    );
  }
  const spec = await response.json();
  const definitions = spec.definitions ?? {};
  const paths = spec.paths ?? {};
  const rpcArguments = {};
  for (const [path, methods] of Object.entries(paths)) {
    if (!path.startsWith("/rpc/")) continue;
    const body = (methods?.post?.parameters ?? []).find((parameter) => parameter?.in === "body");
    if (body?.schema?.properties) {
      rpcArguments[path.slice("/rpc/".length)] = Object.keys(body.schema.properties).sort();
    }
  }
  return {
    rpcNames: new Set(Object.keys(paths).filter((p) => p.startsWith("/rpc/")).map((p) => p.slice("/rpc/".length))),
    rpcArguments,
    columnsByTable: Object.fromEntries(
      Object.entries(definitions).map(([table, def]) => [table, Object.keys(def.properties ?? {})]),
    ),
  };
}

async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1_000 });
    if (result.error) throw result.error;
    users.push(...result.data.users);
    if (result.data.users.length < 1_000) break;
  }
  return users;
}

async function scanStorage(admin, prefix = "", depth = 0, acc = { objects: 0, fixtures: 0 }) {
  if (depth > 4) throw new Error("Unexpected user-files storage nesting depth");
  for (let offset = 0; ; offset += 1_000) {
    const result = await admin.storage.from("user-files").list(prefix, {
      limit: 1_000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (result.error) throw result.error;
    for (const item of result.data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        acc.objects += 1;
        if (isFixtureStorageObject(item.name)) acc.fixtures += 1;
      } else {
        await scanStorage(admin, path, depth + 1, acc);
      }
    }
    if (result.data.length < 1_000) break;
  }
  return acc;
}

export async function verifyPhase2fCleanup({ root = REPOSITORY_ROOT, log = console.log } = {}) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const credentials = getLinkedSupabaseCredentials();
  const admin = createClient(credentials.url, credentials.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(credentials.url, credentials.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Every external helper below is wrapped, because throwing out of this function
  // discards the whole report — the per-table row counts, the posture results and
  // every `fail()` already recorded — after the work that produced them has
  // already completed. F25 requires the summary to name every checked category
  // and B1 requires unknown state to be a *reported* failure, not a stack trace.
  // Errors are also sanitised rather than re-raised: an error object's properties
  // can carry a live service-role key (`scripts/linked-supabase.mjs:60-70`).
  const sanitise = (error) => {
    const code = error?.code ?? error?.name ?? "unknown";
    const message = String(error?.message ?? "").slice(0, 200);
    return message ? `${code} — ${message}` : code;
  };

  // ---- fixture users: detector 1 ----
  let users = [];
  let usersRead = true;
  try {
    users = await listAllUsers(admin);
  } catch (error) {
    usersRead = false;
    fail(`auth.users could not be listed (${sanitise(error)}), so the load-bearing fixture-user detector did not run`);
  }
  const disposableUsers = findDisposableUsers(users);
  const knownUserIds = new Set(users.map((user) => user.id));
  if (usersRead && users.length === 0) {
    fail("auth.users reported zero users. A project with no users cannot be the deployed project; refusing to report a clean result against a credential that reaches nothing.");
  }
  if (disposableUsers.length > 0) {
    fail(
      `${disposableUsers.length} fixture user(s) survive in auth.users. This is the detector that `
      + "actually fires when a remote run dies before its cleanup. They are REPORTED, not deleted.",
    );
  }

  // ---- per-table scan: detector 3, plus the posture assertions ----
  const tables = {};
  for (const table of SCANNED_TABLES) {
    const posture = SERVICE_ROLE_CANNOT_READ[table];
    let rowsRead = 0;
    let orphans = 0;
    let state = "read";
    for (let offset = 0; ; offset += 1_000) {
      const result = await admin.from(table).select("user_id").range(offset, offset + 999);

      if (posture) {
        if (!result.error) {
          state = "READABLE — GRANT WIDENED";
          fail(
            `${table}: service_role could read this table, but ${posture}. A grant has been widened; `
            + "refusing to pass.",
          );
          break;
        }
        if (isPrivilegeDenied(result.error)) {
          state = "refused (asserted)";
          break;
        }
        // Not a privilege error — fall through so absence is still reported as absence.
      }

      if (result.error) {
        if (isTableAbsent(result.error)) {
          state = "ABSENT";
          fail(
            `${table}: absent from the deployed project. Every table in this list is required by the `
            + "deployed Phase 2C/2E/2F contracts, so absence is a failure, not a note.",
          );
          break;
        }
        fail(`${table}: unexpected read failure ${result.error.code ?? "unknown"} — ${result.error.message ?? ""}`);
        state = "ERROR";
        break;
      }

      rowsRead += result.data.length;
      orphans += findOrphanRows(result.data, knownUserIds).length;
      if (result.data.length < 1_000) break;
    }
    if (orphans > 0) {
      fail(
        `${table}: ${orphans} orphan row(s) whose owner is absent from auth.users. This is only `
        + "reachable if the on-delete-cascade foreign key was dropped or left NOT VALID.",
      );
    }
    tables[table] = { state, rowsRead: state === "read" ? rowsRead : null, orphans: state === "read" ? orphans : null };
  }

  // ---- anon holds nothing: write-free live posture check ----
  const anonPosture = {};
  for (const table of ["tasks", "reminders"]) {
    const anonRead = await anon.from(table).select("id").limit(1);
    const adminRead = await admin.from(table).select("id").limit(1);
    // Positive control first: the same table IS reachable with privilege, so the
    // anon refusal below cannot be an artefact of an unreachable table.
    if (adminRead.error) {
      fail(`${table}: service_role could not read it, so the anon denial below would be vacuous — ${adminRead.error.code ?? ""}`);
      anonPosture[table] = "control failed";
      continue;
    }
    if (!anonRead.error) {
      fail(
        `${table}: the anon role read it. anon must hold nothing on tasks or reminders `
        + "(2F-REVOKE-006), and 202607160003:196/202607160007:163 revoke all from it.",
      );
      anonPosture[table] = "READ — GRANT WIDENED";
    } else {
      anonPosture[table] = `denied (${anonRead.error.code ?? "error"})`;
    }
  }

  // ---- storage: detector 2 ----
  let storage = { objects: null, fixtures: null };
  try {
    storage = await scanStorage(admin);
  } catch (error) {
    fail(`the user-files storage scan did not complete (${sanitise(error)}), so detector 2 did not run`);
  }
  if (storage.fixtures > 0) {
    fail(
      `${storage.fixtures} fixture storage object(s) remain in the user-files bucket. Storage is the one `
      + "residue class no foreign key removes.",
    );
  }

  // ---- deferrals held ----
  let schema = { rpcNames: new Set(), rpcArguments: {}, columnsByTable: {} };
  try {
    schema = await readOpenApiSchema(credentials.url, credentials.serviceRoleKey);
  } catch (error) {
    fail(`PostgREST's schema could not be read (${sanitise(error)}), so no deferral check ran`);
  }
  const absentRpcs = {};
  for (const [name, reason] of Object.entries(RPCS_THAT_MUST_NOT_EXIST)) {
    const present = schema.rpcNames.has(name);
    absentRpcs[name] = present ? "PRESENT — DEFERRAL BROKEN" : "absent (asserted)";
    if (present) fail(`RPC ${name} exists in the deployed project, but ${reason}`);
  }
  if (schema.rpcNames.size === 0) {
    fail("PostgREST reported no RPC paths at all, so the absence assertions above would be vacuous.");
  }
  if (!schema.rpcNames.has("create_task_command")) {
    fail("PostgREST does not expose create_task_command, which the deployed Phase 2F contract requires — the absence assertions above cannot be trusted against a schema this different.");
  }

  // F21(a) — the signature pin, which is the leg that cannot pass for the wrong
  // reason. Closing 2E-COMMAND-012 necessarily changes this argument set (ADR-053:
  // every route to persisted provenance runs through a function signature change),
  // so an unchanged set is real evidence that the deferral held.
  const recordAiUsageArguments = schema.rpcArguments.record_ai_usage;
  if (!recordAiUsageArguments) {
    fail(
      "PostgREST published no body schema for /rpc/record_ai_usage, so its signature could not be "
      + "observed and ADR-057's deferral cannot be confirmed by this run.",
    );
  } else {
    const expected = [...RECORD_AI_USAGE_ARGUMENTS].sort();
    if (recordAiUsageArguments.join(",") !== expected.join(",")) {
      const added = recordAiUsageArguments.filter((name) => !expected.includes(name));
      const removed = expected.filter((name) => !recordAiUsageArguments.includes(name));
      fail(
        `record_ai_usage's signature changed — added [${added.join(", ")}], removed [${removed.join(", ")}]. `
        + "ADR-057 defers AI provenance past Phase 2F and states this signature is unchanged through it; "
        + "any change here means either provenance landed or the closeout's account of it is stale.",
      );
    }
  }

  const aiUsageColumns = schema.columnsByTable.ai_usage_events;
  let provenanceColumns = [];
  if (!aiUsageColumns) {
    fail("PostgREST's definition for ai_usage_events is missing, so the secondary column heuristic cannot run.");
  } else {
    provenanceColumns = aiUsageColumns.filter((column) => AI_USAGE_PROVENANCE_PATTERN.test(column));
    if (provenanceColumns.length > 0) {
      fail(
        `ai_usage_events carries ${provenanceColumns.join(", ")}, but AI provenance (2E-COMMAND-012) is `
        + "deferred past Phase 2F by ADR-057 and no Phase 2F migration may add it.",
      );
    }
  }

  const reopeningGate = readProvenanceReopeningGate(root);
  if (!reopeningGate.scriptPresent) {
    fail(`${reopeningGate.script} is absent, but ADR-057 preserves it as the provenance reopening gate.`);
  }
  if (reopeningGate.transcripts.length > 0) {
    fail(
      `a record_ai_usage dry-run transcript exists (${reopeningGate.transcripts.join(", ")}), which means `
      + "ADR-057's reopening gate has been executed — provenance is no longer merely deferred, and this "
      + "closeout's account of it is stale.",
    );
  }

  const report = {
    project: credentials.url,
    executedAt: new Date().toISOString(),
    authUsers: users.length,
    disposableUsers: disposableUsers.length,
    tables,
    deliberatelyNotScanned: Object.keys(DELIBERATELY_NOT_SCANNED),
    anonPosture,
    storageObjects: storage.objects,
    fixtureStorageObjects: storage.fixtures,
    absentRpcs,
    recordAiUsageArgumentCount: recordAiUsageArguments ? recordAiUsageArguments.length : null,
    aiUsageProvenanceColumns: provenanceColumns,
    provenanceReopeningGate: {
      scriptPresent: reopeningGate.scriptPresent,
      transcripts: reopeningGate.transcripts.length,
    },
    failures,
  };

  log("# Phase 2F cleanup verification (2F-OPERATIONS-004)\n");
  log(`Project: ${report.project}`);
  log(`Executed: ${report.executedAt}`);
  log("This verifier writes nothing, deletes nothing, and mints no fixture user.\n");

  log("## Detector 1 — fixture users in auth.users (load-bearing)\n");
  log(`total users: ${report.authUsers} · fixture-prefix survivors: ${report.disposableUsers}`);
  log(`prefixes checked (${DISPOSABLE_PREFIXES.length}): ${DISPOSABLE_PREFIXES.join(", ")}\n`);

  log("## Detector 2 — user-files storage objects (load-bearing)\n");
  log(`objects: ${report.storageObjects} · fixture objects: ${report.fixtureStorageObjects}\n`);

  log("## Detector 3 — per-table read reachability, and the orphan scan\n");
  log("An orphan is structurally impossible under each table's on-delete-cascade foreign key, so a zero");
  log("here is not a measurement; it detects a dropped or NOT VALID key. `rows` proves the read happened.\n");
  const width = Math.max(...SCANNED_TABLES.map((t) => t.length));
  for (const table of SCANNED_TABLES) {
    const entry = report.tables[table];
    const detail = entry.state === "read"
      ? `rows=${entry.rowsRead} orphans=${entry.orphans}`
      : entry.state;
    log(`  ${table.padEnd(width)}  ${detail}`);
  }

  log("\n## Deliberately not scanned, and why\n");
  for (const [table, reason] of Object.entries(DELIBERATELY_NOT_SCANNED)) {
    log(`  ${table.padEnd(width)}  ${reason}`);
  }

  log("\n## Posture assertions\n");
  for (const [table, reason] of Object.entries(SERVICE_ROLE_CANNOT_READ)) {
    log(`  service_role on ${table}: ${report.tables[table].state} — ${reason}`);
  }
  for (const [table, state] of Object.entries(report.anonPosture)) {
    log(`  anon on ${table}: ${state} (asserted after a privileged positive control on the same table)`);
  }

  log("\n## Deferrals proven to have held\n");
  for (const [name, state] of Object.entries(report.absentRpcs)) {
    log(`  rpc ${name}: ${state}`);
  }
  log(`  record_ai_usage signature: ${recordAiUsageArguments
    ? `${recordAiUsageArguments.length} arguments, unchanged (asserted against ADR-057's stated posture)`
    : "UNREADABLE"}`);
  log(`  ai_usage_events provenance columns (secondary heuristic): ${provenanceColumns.length === 0 ? "none" : provenanceColumns.join(", ")}`);
  log(`  ADR-057 reopening gate: script ${reopeningGate.scriptPresent ? "present" : "MISSING"}, transcripts ${reopeningGate.transcripts.length}`);

  log("\n## What this run cannot observe\n");
  log("  product_events row absence after an owner's deletion — unreadable with any credential this");
  log("  repository holds. Proven instead as: the asserted service_role refusal above, plus zero");
  log("  surviving fixture owners, plus `user_id references auth.users(id) on delete cascade`");
  log("  (202607170024:10) asserted in CI pgTAP. No stronger claim is made.\n");

  log(`\nRESULT: ${failures.length === 0 ? "CLEAN — zero Phase 2F fixture residue" : `${failures.length} FINDING(S)`}`);
  if (failures.length > 0) {
    for (const [index, message] of failures.entries()) log(`  ${index + 1}. ${message}`);
  }
  log(`\nMACHINE-READABLE: ${JSON.stringify(report)}`);

  return report;
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const report = await verifyPhase2fCleanup();
  if (report.failures.length > 0) process.exitCode = 1;
}
