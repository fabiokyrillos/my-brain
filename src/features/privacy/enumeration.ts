import type { NavigationKey } from "@/features/shell/capabilities";

/**
 * The account's own enumeration — `2O-PRIVACY-002`, and the contract the census
 * (`2O-PRIVACY-001`) and the export (`2O-PRIVACY-004`) both read.
 *
 * ## What `2O-PRIVACY-002` actually asks, and what it cannot mean literally
 *
 * The requirement says this surface derives its categories *"from the same
 * enumeration the deletion path uses, so the two cannot disagree about what a
 * user owns."* The deletion path's enumeration is
 * `public.account_owned_row_counts`, and calling it from here is impossible in
 * three independent ways rather than one:
 *
 *  1. It raises `42501` unless `auth.role() = 'service_role'`.
 *  2. `202608040072` **revoked** it from `public`, `anon` and `authenticated`,
 *     and the same migration carries a postcondition that raises
 *     *"a deletion-executor function is reachable by a client role"* if the
 *     grant is ever restored. Granting it would fail the database CI job, not
 *     merely a policy review.
 *  3. Reading it from an authenticated path is named, verbatim, as a **stop
 *     condition** by ADR-118 Decision 9 — *"a service-role read on an
 *     authenticated path"*.
 *
 * **The owner resolved this rather than leaving it to be discovered.** The
 * authenticated surface counts under **the requesting user's own identity and
 * the existing RLS policies**; the categories below are an explicit, safe
 * **projection** of the same conceptual coverage; and an executable guard
 * (`privacy-enumeration-guard.test.ts`) compares the projection against the
 * real predicate the deletion enumeration scans. If a new `public` table with a
 * `user_id` column appears, the guard fails until it is either shown here or
 * withheld with a governed reason. No migration, no definer function, no new
 * grant and no service-role client are introduced anywhere in this path.
 *
 * That is what makes "the two cannot disagree" enforceable: the deletion
 * enumeration is a *runtime* predicate, this is its *projection*, and the guard
 * is the thing that stops them drifting.
 *
 * ## The predicate, stated once
 *
 * `account_owned_row_counts` enumerates, at run time:
 *
 * > every `information_schema` **BASE TABLE** in schema `public` carrying a
 * > column named `user_id`.
 *
 * Fifty tables satisfy it today. Forty-seven are readable by `authenticated`
 * under an owner-scoped `select` policy and are shown below. Three are not, and
 * each was revoked deliberately by an earlier hardening phase — they are listed
 * in {@link WITHHELD_TABLES} with the reason, because an exclusion nobody can
 * see is indistinguishable from an omission.
 */

/** A table the census counts and the export reads, under the owner's own RLS. */
export type EnumeratedTable = Readonly<{
  table: string;
  /**
   * Columns the export never writes, and why. Row completeness is unaffected:
   * every row is exported, and the archive states this list for the reader.
   * Two of the three reasons are secrecy — an archive is a file that leaves the
   * product, and a bearer credential inside one is a credential in the open.
   */
  withheldColumns?: readonly Readonly<{ column: string; reason: WithheldColumnReason }>[];
}>;

export type WithheldColumnReason = "secret" | "bearer-capability" | "derived-vector";

/** One user-facing answer to "what is stored about me". */
export type PrivacyCategory = Readonly<{
  key: PrivacyCategoryKey;
  tables: readonly EnumeratedTable[];
  /**
   * The surface that shows this category, when one exists. `null` is a real
   * answer rather than a missing one: `product_events` is owner-readable and
   * **no page renders it**, so the honest link is none, and the copy says the
   * export is where it can be seen. Inventing a page for it would be this slice
   * widening itself; pointing at a page that does not show it would be the
   * claim `2O-PRIVACY-001` exists to prevent.
   */
  surface: NavigationKey | null;
}>;

export const PRIVACY_CATEGORY_KEYS = [
  "entries",
  "work",
  "entities",
  "memories",
  "chat",
  "files",
  "reminders",
  "questions",
  "ai",
  "operations",
  "account",
  "usage",
] as const;

export type PrivacyCategoryKey = (typeof PRIVACY_CATEGORY_KEYS)[number];

export const PRIVACY_CATEGORIES: readonly PrivacyCategory[] = [
  {
    key: "entries",
    surface: "history",
    tables: [
      { table: "entries" },
      { table: "entry_interpretations" },
      { table: "entry_entities" },
      { table: "entry_task_candidate_resolutions" },
      {
        table: "entry_embeddings",
        withheldColumns: [{ column: "embedding", reason: "derived-vector" }],
      },
    ],
  },
  {
    key: "work",
    surface: "work",
    tables: [
      { table: "tasks" },
      { table: "task_contexts" },
      { table: "task_dependencies" },
      { table: "task_people" },
      { table: "task_projects" },
      { table: "task_command_confirmations" },
    ],
  },
  {
    key: "entities",
    surface: "relations",
    tables: [
      { table: "people" },
      { table: "projects" },
      { table: "contexts" },
      { table: "organizations" },
      { table: "tags" },
      { table: "entity_aliases" },
      { table: "entity_tags" },
      { table: "person_contexts" },
      { table: "person_projects" },
      { table: "person_relationships" },
      { table: "entity_deletion_confirmations" },
    ],
  },
  { key: "memories", surface: "memories", tables: [{ table: "memories" }, { table: "summaries" }] },
  {
    key: "chat",
    surface: "chat",
    tables: [{ table: "conversations" }, { table: "conversation_messages" }],
  },
  {
    key: "files",
    surface: "files",
    tables: [
      { table: "attachments" },
      { table: "attachment_interpretations" },
      { table: "entity_attachments" },
    ],
  },
  {
    key: "reminders",
    surface: "reminders",
    tables: [
      { table: "reminders" },
      { table: "notifications" },
      { table: "notification_deliveries" },
      { table: "notification_consents" },
      {
        table: "push_subscriptions",
        /*
         * `endpoint`, `auth` and `p256dh` are jointly a **usable push
         * capability**: anyone holding the triple can deliver a notification to
         * that device without the account. They are the user's own data and the
         * row is still exported — the count, the state, the failure count and
         * the dates all appear — but the three fields that make the archive
         * itself an actuator do not.
         */
        withheldColumns: [
          { column: "endpoint", reason: "bearer-capability" },
          { column: "auth", reason: "bearer-capability" },
          { column: "p256dh", reason: "bearer-capability" },
        ],
      },
    ],
  },
  { key: "questions", surface: "questions", tables: [{ table: "pending_questions" }] },
  {
    key: "ai",
    surface: "costs",
    tables: [
      { table: "ai_usage_events" },
      {
        table: "user_ai_credentials",
        /*
         * `2O-AICONFIG-006` promises the key is encrypted at rest and **never
         * returned to the browser**. An export is delivered to the browser. The
         * row is exported so the account can see a credential exists, when it
         * was validated and its fingerprint; the ciphertext and its IV are not,
         * because writing them into a downloadable file is the same disclosure
         * the claim refuses, performed once instead of continuously.
         */
        withheldColumns: [
          { column: "ciphertext", reason: "secret" },
          { column: "iv", reason: "secret" },
        ],
      },
      { table: "credential_validation_attempts" },
    ],
  },
  {
    key: "operations",
    surface: "jobs",
    tables: [
      { table: "jobs" },
      { table: "audit_logs" },
      { table: "undo_operations" },
      { table: "heartbeat_runs" },
    ],
  },
  {
    key: "account",
    surface: "settings",
    tables: [
      { table: "profiles" },
      { table: "agent_preferences" },
      { table: "account_lifecycle" },
      { table: "policy_acceptances" },
    ],
  },
  { key: "usage", surface: null, tables: [{ table: "product_events" }] },
];

/**
 * Tables inside the deletion enumeration that this surface deliberately does
 * **not** count or export, each with the reason and the change that created it.
 *
 * All three were revoked from `authenticated` by an earlier hardening phase, so
 * a read here would be refused by the database rather than merely unwise — and
 * `2O-PRIVACY-010`'s companion rule applies: a refused read is never rendered
 * as a count of zero. Rather than render three permanent "unreadable" rows, the
 * surface states the exclusion and its reason once.
 *
 * **They are abuse-prevention counters, and their readability is the control.**
 * `account_deletion_attempts` and `rate_limit_events` are throttling state: an
 * account that can read its own attempt counters can measure the ceiling it is
 * being held to and time its next attempt against it. `error_events` is the
 * operator error sink. None of them is content the account authored.
 *
 * Restoring any of them to `authenticated` is a grant, which ADR-118 Decision 7
 * forbids for this phase — so this list is a **record of an existing boundary**,
 * never a preference this slice chose.
 */
export const WITHHELD_TABLES: readonly Readonly<{
  table: string;
  reason: "throttle-counter" | "operator-error-sink";
  revokedBy: string;
}>[] = [
  {
    table: "account_deletion_attempts",
    reason: "throttle-counter",
    revokedBy: "202608070079_phase_2h_deletion_recovery.sql",
  },
  {
    table: "error_events",
    reason: "operator-error-sink",
    revokedBy: "202608070080_phase_2h_error_sink_and_deadman.sql",
  },
  {
    table: "rate_limit_events",
    reason: "throttle-counter",
    revokedBy: "202608070081_phase_2h_rate_limiting.sql",
  },
];

/** Every table this surface reads, flattened. The export's own scope. */
export const ENUMERATED_TABLES: readonly EnumeratedTable[] = PRIVACY_CATEGORIES.flatMap(
  (category) => category.tables,
);

/**
 * The projection's full coverage of the deletion enumeration — shown plus
 * withheld. This is the set `privacy-enumeration-guard.test.ts` pins against the
 * predicate, and the set the export declares as its scope.
 */
export const ENUMERATION_COVERAGE: readonly string[] = [
  ...ENUMERATED_TABLES.map((entry) => entry.table),
  ...WITHHELD_TABLES.map((entry) => entry.table),
];

export function categoryFor(key: PrivacyCategoryKey): PrivacyCategory {
  const category = PRIVACY_CATEGORIES.find((candidate) => candidate.key === key);
  if (!category) throw new Error(`unknown privacy category: ${key}`);
  return category;
}
