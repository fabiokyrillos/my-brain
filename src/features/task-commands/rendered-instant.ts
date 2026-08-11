/**
 * Parsing the instants `apply_task_command` renders, which are not ISO 8601.
 *
 * ## The defect this was written for
 *
 * `202607260059` returns the undo window as
 * `to_char(undo_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`. Postgres's `OF`
 * emits the **shortest** offset it can: `+00` for UTC, `-03` for São Paulo,
 * `+05:30` only where the minutes are non-zero. ECMAScript's Date Time String
 * Format accepts `Z` or `±HH:mm` and nothing else, so:
 *
 *     Date.parse("2026-08-12T19:30:00.123456+00")     // NaN
 *     Date.parse("2026-08-12T19:30:00.123456+00:00")  // 1786563000123
 *
 * `UndoAffordance` gated its control on `Number.isFinite(Date.parse(expiresAt))`
 * and treated an unparseable expiry as "do not offer" — a fail-closed choice
 * that was right in principle and, because the value was *never* parseable in a
 * whole-hour zone, meant **the undo button has never rendered on any surface**.
 * Every `2E`/`2L` test that covered undo asserted the `undo_operations` row and
 * the `undo_operation` RPC, both of which work; none asserted the button. The
 * calendar's deployment journey is what finally looked at the DOM.
 *
 * Its own comment recorded the reasoning that hid it: *"the column is `not null`
 * with a default so this is unreachable through the database"*. True of the
 * column, and irrelevant — **what crosses the boundary is a rendering of the
 * column, and a rendering has its own contract.**
 *
 * ## Why this is fixed here and not in the RPC
 *
 * Because the RPC is not wrong. `apply.ts` already says so in the schema it
 * validates against: `renderedInstantSchema` is `z.string().min(1)`, with the
 * note that the shape *"is the function's rendering, not an ISO promise —
 * rendering it for a user is the surface's job"*. The surface's job includes
 * reading it. A migration would also be the wrong instrument for a client-side
 * parse, and this phase's two migrations are spoken for.
 */

/**
 * Epoch milliseconds for an instant as the command RPCs render it, or `NaN`.
 *
 * `NaN` for anything genuinely unreadable, so a caller can keep failing closed
 * — the behaviour was never wrong, only its input.
 */
export function parseRenderedInstant(value: string | null | undefined): number {
  if (typeof value !== "string" || value === "") return Number.NaN;
  // `+00` / `-03` → `+00:00` / `-03:00`. Anchored at the end and requiring
  // exactly two digits, so a value that already carries minutes, ends in `Z`,
  // or carries no offset at all is passed through untouched.
  return Date.parse(value.replace(/([+-]\d{2})$/, "$1:00"));
}
