import type { ReviewTab } from "@/features/reviews/review-periods";
import {
  addLocalDays,
  daysInLocalMonth,
  formatLocalDate,
  localDayBoundsForDate,
  localRangeBounds,
  startOfLocalMonth,
  startOfLocalWeek,
  type LocalDate,
} from "@/lib/time/local-day";

/**
 * The span a tab reviews, **always in the owner's zone**.
 *
 * ## Why the projection needed this at all
 *
 * `loadDayReviewProjection` computed its own bounds with
 * `localDayBoundsForDate(day, timezone)` — correct, and correct only for a day.
 * The owner's decision asks each of Dia, Semana and Mês to show "a revisão do
 * período atual" with the same factual parts, so the projection needed a
 * *window* rather than a date. Everything else about it is unchanged: the same
 * five reads, the same per-source scoring, the same limits.
 *
 * ## Why every branch resolves through the local-day contract
 *
 * Three implementations of "what day is it where the owner is" have already been
 * found in this repository, two of them wrong in opposite directions. So no
 * branch here does arithmetic on an instant. Weeks come from `startOfLocalWeek`
 * (Monday-based, one convention for both locales, so a shared URL cannot mean two
 * ranges); months from `startOfLocalMonth` and `daysInLocalMonth`; and both ends
 * of every span from `localDayBoundsForDate`, composed by `localRangeBounds`.
 *
 * That composition is what makes a week containing a DST transition 167 or 169
 * hours rather than a multiple of 24, and what makes a period starting on a day
 * whose local midnight does not exist — `2026-09-06` in `America/Santiago`, where
 * the clock steps from 23:59 to 01:00 — begin at the first instant that does.
 */
export type ReviewPeriodWindow = {
  readonly tab: ReviewTab;
  /** The first instant covered, as an ISO string for the query's lower bound. */
  readonly startIso: string;
  /** The first instant **after** the span — every read is `>= start` and `< end`. */
  readonly endIso: string;
  /** `YYYY-MM-DD` in the owner's zone. Matches `summaries.period_start`. */
  readonly startKey: string;
  /** `YYYY-MM-DD` in the owner's zone, **inclusive**. Matches `summaries.period_end`. */
  readonly endKey: string;
  /** The first day of the span, for a calendar link's anchor. */
  readonly startDate: LocalDate;
  /** The last day of the span, inclusive. */
  readonly endDate: LocalDate;
};

/**
 * The span the given anchor day belongs to, for the given tab.
 *
 * `anchor` is the day the caller is reviewing — today for every tab, or tomorrow
 * for the Dia tab's `next_day` scope, which is the one place the product reviews
 * a day it is not currently in.
 */
export function reviewPeriodWindow(
  tab: ReviewTab,
  anchor: LocalDate,
  timezone: string,
): ReviewPeriodWindow {
  const startDate =
    tab === "day" ? anchor : tab === "week" ? startOfLocalWeek(anchor) : startOfLocalMonth(anchor);
  const dayCount = tab === "day" ? 1 : tab === "week" ? 7 : daysInLocalMonth(anchor);
  const endDate = addLocalDays(startDate, dayCount - 1);
  const bounds =
    dayCount === 1
      ? localDayBoundsForDate(startDate, timezone)
      : localRangeBounds(startDate, dayCount, timezone);

  return Object.freeze({
    tab,
    startIso: new Date(bounds.start).toISOString(),
    endIso: new Date(bounds.end).toISOString(),
    startKey: formatLocalDate(startDate),
    endKey: formatLocalDate(endDate),
    startDate,
    endDate,
  });
}

/**
 * Whether a stored review covers **the period running now**, matched on its
 * start alone.
 *
 * ## Why the end date is not compared, and why that is not a shortcut
 *
 * `reviewWindow` in `review-period.ts` sets `endDate` to **today**, not to the
 * last day of the span. The owner's own screenshot shows it: a weekly review
 * generated on Thursday is stored as `17/08/2026 — 20/08/2026`, a Monday to a
 * Thursday. So a stored review's `period_end` records *when it was written*,
 * while `period_start` records *which period it is about* — and only the second
 * one identifies the period.
 *
 * That asymmetry has a consequence worth stating plainly, because it shapes the
 * whole surface: `generateReview` upserts on
 * `(user_id, period_type, period_start, period_end)`, so regenerating **on a
 * different day of the same week** does not update the row — it inserts a new
 * one. A single week can therefore hold several weekly reviews, each a snapshot
 * taken on a different day. The newest is the current one; the rest are history,
 * and they are real history rather than duplicates.
 *
 * None of this is changed here. `generateReview` is explicitly untouched by this
 * unit; this is the read side learning to describe what the write side has
 * always done.
 */
export function belongsToCurrentPeriod(window: ReviewPeriodWindow, periodStart: string): boolean {
  return window.startKey === periodStart;
}
