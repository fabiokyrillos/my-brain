/**
 * When is a memory *in force*? (UX-10)
 *
 * `memories` has carried `valid_from` and `valid_until` since
 * `202607160006_chat_memory.sql:16-17` and nothing has ever read them. They are
 * the only lifecycle the table models, so this module makes them mean something
 * rather than adding a `status` column DEC-4's posture would not authorize.
 *
 * The vocabulary is deliberately three words, not two:
 *
 * - `scheduled` — `valid_from` is still in the future. The memory exists and is
 *   not yet true. Collapsing this into "active" would tell the owner the
 *   assistant is using something it is not.
 * - `active` — in force now. This is the only state the assistant retrieves.
 * - `archived` — `valid_until` has passed. The row is intact and auditable; it
 *   simply stopped being true. **This is what "archive" means here — never a
 *   physical delete**, which would destroy the provenance the surface exists to
 *   show.
 *
 * Pure and synchronous. The clock is a parameter, never `Date.now()`, so the
 * boundary cases below are testable rather than flaky at midnight.
 */

export const MEMORY_LIFECYCLE_STATES = ["scheduled", "active", "archived"] as const;

export type MemoryLifecycleState = (typeof MEMORY_LIFECYCLE_STATES)[number];

/** The two nullable timestamps, exactly as the row carries them. */
export type MemoryValidity = {
  readonly valid_from: string | null;
  readonly valid_until: string | null;
};

/**
 * Parse a timestamp the database produced, or `null`.
 *
 * A column that is `timestamptz` cannot hold an unparseable value, but the row
 * arrives here as JSON over PostgREST and this function decides whether the
 * assistant may *use* a memory. An `Invalid Date` compared with `<=` is always
 * false, which would silently promote a malformed row to `active`. Treating it
 * as absent instead keeps a data fault from becoming a retrieval decision.
 */
function instant(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * `archived` wins over `scheduled`.
 *
 * A row whose whole validity window is in the past is over, and saying
 * "starts later" about it would be false. The order of these two checks is the
 * behaviour, so it is asserted directly in the tests.
 *
 * Both boundaries are inclusive of the instant they name: a memory becomes
 * active *at* `valid_from` and stops being active *at* `valid_until`.
 */
export function memoryLifecycleState(validity: MemoryValidity, now: Date): MemoryLifecycleState {
  const at = now.getTime();
  const until = instant(validity.valid_until);
  if (until !== null && until <= at) return "archived";
  const from = instant(validity.valid_from);
  if (from !== null && from > at) return "scheduled";
  return "active";
}

/**
 * The single predicate the assistant's retrieval is allowed to ask.
 *
 * Exported separately from the state so the chat filter cannot drift from the
 * badge the owner reads on the Memories page: both call this, and a memory the
 * page calls archived is one the assistant provably cannot cite.
 */
export function isMemoryInForce(validity: MemoryValidity, now: Date): boolean {
  return memoryLifecycleState(validity, now) === "active";
}
