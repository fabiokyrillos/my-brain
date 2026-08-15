import type { DayReviewSource } from "./contracts";
import type { DayReviewProjection } from "./day-review-projection";

/**
 * The one-line reading a closing owes, derived and never composed.
 *
 * ## Why this exists
 *
 * `2M-REVIEW-001` builds the review out of records that already exist, and the
 * surface renders them as five titled sections. That is complete and it is not a
 * *closing*: to answer "how did the day go" the reader had to count four lists
 * themselves. A closing states the day and then shows its parts.
 *
 * ## Why every number here is a count and not a judgement
 *
 * Each field is a length or a filter over the projection's own arrays. There is
 * no score, no "productive", no proportion and no target — `2M-REVIEW-002` says
 * the surface presents what is committed and intended *"without proposing
 * changes the user has not asked for"*, and a synthesis that graded the day
 * would be proposing the loudest change of all.
 *
 * ## Why `partial` is a field rather than a footnote
 *
 * A count over a source that failed to load is not a small count — it is an
 * unknown one, and the difference is the whole reason `sourceStates` exists.
 * `partial` names the sources that could not be read, so the surface can say
 * *these numbers are incomplete, and here is what is missing from them* rather
 * than printing "0 concluídas" for a query that never returned. A review that
 * says nothing happened when a read failed is lying; this is what stops it.
 */
export type DayReviewSynthesis = {
  /** Tasks whose completion falls in this day. */
  readonly completed: number;
  /**
   * Tasks the day committed to or intended that are **not** complete.
   *
   * De-duplicated by task id: a task planned for today *and* due today is one
   * pendência, and counting it twice would inflate every day that has both.
   */
  readonly open: number;
  readonly captured: number;
  /** Sources that could not be read, so the counts above are known to be partial. */
  readonly partial: readonly DayReviewSource[];
  /** True when every source was read and every count is zero. */
  readonly quiet: boolean;
};

/** The sources the three counts are computed from, in the order they are read. */
const COUNTED_SOURCES = ["completed", "planned", "due", "captured"] as const;

export function summarizeDayReview(projection: DayReviewProjection): DayReviewSynthesis {
  const openIds = new Set<string>();
  for (const item of [...projection.planned, ...projection.due]) {
    if (item.completedAt === null) openIds.add(item.taskId);
  }

  /*
    Only the sources the counts come from. `generated` is unreadable often
    enough — it is a separate table and a separate query — and naming it here
    would tell the reader their *counts* are partial because a stored review
    could not be fetched, which is not true of any number above.
  */
  const partial = COUNTED_SOURCES.filter(
    (source) => projection.sourceStates[source] === "unavailable",
  );

  const completed = projection.completed.length;
  const captured = projection.captured.length;

  return {
    completed,
    open: openIds.size,
    captured,
    partial,
    // A day is only *quiet* when nothing happened AND everything was read.
    // Without the second clause, four failed queries would render as a
    // peaceful day — the exact lie `2M-REVIEW-001` is written against.
    quiet: partial.length === 0 && completed === 0 && openIds.size === 0 && captured === 0,
  };
}
