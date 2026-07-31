// Phase 2D Slice 2D.2 — deterministic snooze reactivation at read time.
//
// A `snoozed` pending question whose `snoozed_until` deadline has been
// reached is deterministically open again (the approved automatic
// `snoozed -> open` transition) with no sweep, cron, or worker. This
// PostgREST `or` filter is the single application-side definition of an
// actionable (open) pending question; `list_needs_attention` mirrors the
// same predicate in SQL, and `resolve_pending_question_v2` accepts the same
// reactivated questions.
export function actionablePendingQuestionFilter(now: Date = new Date()): string {
  return `status.eq.open,and(status.eq.snoozed,snoozed_until.lte.${now.toISOString()})`;
}

/**
 * Everything the filter above hides (Slice G1, UX-11).
 *
 * It lives here, next to its complement, because the two are only correct as a
 * pair: together they must cover all four `pending_questions` states exactly
 * once. UX-11's finding was that they did not — answering removed a question
 * from the only list that existed and put it nowhere, so a resolved question
 * was in neither. `question-outcome-projection.test.ts` asserts the partition
 * against every status the column's CHECK allows.
 *
 * A snoozed question whose deadline is still ahead belongs here as *deferred*.
 * It is not resolved, but it did leave the queue because the owner acted on it,
 * and that is the same disappearance the finding is about.
 */
export function resolvedPendingQuestionFilter(now: Date = new Date()): string {
  return `status.in.(answered,dismissed),and(status.eq.snoozed,snoozed_until.gt.${now.toISOString()})`;
}

/** The three ways a question leaves the queue. */
export const QUESTION_DISPOSITIONS = ["answered", "dismissed", "deferred"] as const;

export type QuestionDisposition = (typeof QUESTION_DISPOSITIONS)[number];

/**
 * Reads a stored status as what the owner did.
 *
 * Anything unrecognized reads as `deferred` rather than `answered`: claiming
 * someone answered a question they did not is the one error here with a cost.
 */
export function toQuestionDisposition(status: string): QuestionDisposition {
  if (status === "answered") return "answered";
  if (status === "dismissed") return "dismissed";
  return "deferred";
}
