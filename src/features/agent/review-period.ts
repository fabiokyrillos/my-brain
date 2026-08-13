import {
  formatLocalDate,
  localDateOf,
  localDayBounds,
  localDayBoundsForDate,
  startOfLocalWeek,
} from "@/lib/time/local-day";

/**
 * `LDC-AGENT-002` — the review's period, as a value rather than as five
 * expressions buried in a Server Action.
 *
 * ## Why this module exists at all
 *
 * The window itself was already corrected: Unit 4b moved `generateReview` off
 * `setHours(0, 0, 0, 0)`, `getDay()`, `getDate()`, `getFullYear()` and
 * `getMonth()` — seven reads of the *host's* calendar, which on a server is
 * UTC — and onto the contract. What it could not do is make that correction
 * **provable**, because `actions.ts` carries `"use server"`: every export there
 * must be an async Server Action, so the period computation could not be
 * exported, could not be called with a fixed `now`, and could only be tested by
 * a test that re-wrote the same expressions and compared them to themselves.
 *
 * A test that mirrors the implementation proves the mirror. Unit 5 needed a
 * proof that could *fail*, so the computation moved here — unchanged, and that
 * is the point: this is an extraction, not a second correction. The behaviour
 * ADR-111 Decision 6 signed is the behaviour below, and
 * `review-period.test.ts` is the first thing in the repository able to
 * contradict it.
 *
 * ## The one deliberate behaviour change, restated where it happens
 *
 * A daily review generated at 22:00 in São Paulo now covers **that** day. It
 * used to cover tomorrow, because 22:00 in São Paulo is 01:00 UTC and the host's
 * calendar had already turned over. The same reasoning applies a week and a
 * month at a time: an owner in `Pacific/Auckland` asking for a monthly review on
 * the 1st at 09:00 local is asking on the *previous* month's last day in UTC,
 * and used to get it.
 *
 * **No stored summary is rewritten, reprocessed or back-dated.** This decides
 * what a *new* review covers and what dates it is labelled with; it reads
 * nothing and writes nothing.
 */

/** The four periods `generateReview` accepts, as its own schema defines them. */
export type ReviewPeriod = "daily" | "weekly_review" | "weekly_plan" | "monthly";

export type ReviewWindow = {
  /** The first instant the review covers — the query's lower bound. */
  readonly start: Date;
  /** `period_start`, as the owner's local date. */
  readonly startDate: string;
  /** `period_end`, as the owner's local date. */
  readonly endDate: string;
};

/**
 * The period `now` falls in, decided entirely in `timeZone`.
 *
 * Weeks are Monday-based through `startOfLocalWeek`, which is the contract's own
 * rule and matches the `(getDay() + 6) % 7` this replaced — one convention, so
 * the two locales cannot disagree about where a week starts. Months take day 1
 * of the owner's current local month.
 *
 * Every branch resolves through `localDayBounds`/`localDayBoundsForDate`, so a
 * period beginning on a day whose local midnight does not exist — `2026-09-06`
 * in `America/Santiago`, where the clock steps from 23:59 to 01:00 — starts at
 * the first instant that *does*, rather than at an instant in the previous day.
 *
 * Throws on an unusable zone, which is `local-day.ts`'s posture and the right
 * one here: a review is a computed period, and a period nobody could compute
 * must be reported rather than answered. Callers resolve the zone through
 * `resolveOwnerTimeZone` first, so the throw is unreachable from the product.
 */
export function reviewWindow(
  now: Date,
  timeZone: string,
  period: ReviewPeriod,
): ReviewWindow {
  const today = localDateOf(now, timeZone);
  const start = new Date(
    period === "daily"
      ? localDayBounds(now, timeZone).start
      : period.startsWith("weekly")
        ? localDayBoundsForDate(startOfLocalWeek(today), timeZone).start
        : localDayBoundsForDate({ ...today, day: 1 }, timeZone).start,
  );
  return {
    start,
    startDate: formatLocalDate(localDateOf(start, timeZone)),
    endDate: formatLocalDate(today),
  };
}
