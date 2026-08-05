/**
 * How much text may reach a model — SH-QUOTA-007.
 *
 * ## What was actually wrong
 *
 * Every AI-bound action in this product already had a `.max()`. The defect was
 * not an unbounded input; it was that each bound was an anonymous literal at
 * its own call site, so nobody could answer "what does this product send to a
 * provider, at most?" without reading five files — and nothing failed when one
 * of them was raised. A bound nobody can enumerate is a bound nobody is
 * defending.
 *
 * So the numbers move here, the schemas read them, and
 * `ai-input-bounds.test.ts` names each one. Raising a limit is now a visible
 * edit to a file whose whole subject is limits.
 *
 * ## Why the numbers are what they are
 *
 * They are the values already in force. This slice does not change what the
 * product accepts — SH.6 is a hardening slice, and quietly tightening a limit
 * users are inside of would be a behaviour change smuggled in under a
 * refactor. `capture` is 12 000 because `capture_entry_async` enforces 12 000
 * in the database, and the parity test below is what keeps those two equal.
 */

export const AI_INPUT_BOUNDS = {
  /**
   * Free-text capture. Enforced twice on purpose: here, so the user gets a
   * field error, and in `capture_entry_async`, so a direct RPC call gets the
   * same answer.
   */
  captureContent: 12_000,

  /** One chat question. */
  chatQuestion: 12_000,

  /** One memory's content, which is also what gets embedded. */
  memoryContent: 4_000,

  /** An entity name typed into an inline create form, which is embedded. */
  entityName: 240,

  /** A task title carried by a work-surface action. */
  workItemTitle: 4_000,

  /**
   * File-derived text, bounded in the worker rather than here.
   *
   * `supabase/functions` cannot import this module — the `server-only` guard
   * throws under Deno — so `attachment.ts` carries the literal and the parity
   * test reads it back. Declared here anyway, because the point of this module
   * is that the full set is enumerable in one place.
   */
  fileExtractedText: 100_000,
  fileDescription: 4_000,
} as const;

export type AIInputBound = keyof typeof AI_INPUT_BOUNDS;
