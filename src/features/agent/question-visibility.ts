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
