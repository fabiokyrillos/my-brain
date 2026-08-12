/**
 * `2M-REVIEW-006` — the end state of the five inert scheduling preferences, as
 * code rather than as a decision written down.
 *
 * ## What was inert, and what slice 2M.0 decided
 *
 * `2M-AUDIT-005` found five columns on `agent_preferences` that nothing read:
 * `daily_review_time`, `weekly_review_day`, `weekly_review_time`, `planning_day`
 * and `planning_time`. They were written by the settings payload — from their own
 * stored values, so they never actually changed — and read by nobody. The
 * declared end states are:
 *
 *  - **`daily_review_time`, `weekly_review_day`, `weekly_review_time` — given a
 *    consumer.** This module is it.
 *  - **`planning_day`, `planning_time` — retired from the interface.** Phase 2M's
 *    planning is a surface a user opens, not a scheduled event, so a control
 *    naming a *time* for it would describe behaviour the phase does not build.
 *    **Retiring a control is not deleting a column**: the columns stay, and
 *    `phase-2m-inert-preferences-guard.test.ts` asserts the interface offers
 *    neither.
 *
 * ## A consumer, and emphatically not a scheduler
 *
 * `2M-REVIEW-007` protects a promise the reviews surface makes in both locales:
 * *"nothing runs from a configured schedule."* That sentence has to stay true, so
 * what this module does with `daily_review_time` is **decide what the surface
 * says**, never decide when anything runs. There is no scheduler, no job, no timer and
 * no delivery here — the user's configured time becomes a sentence on a page the
 * user opened, and nothing else. The same guard that re-asserts the copy asserts
 * this module enqueues nothing.
 *
 * That is a genuine consumer under `R-24`: change `daily_review_time` and the
 * rendered sentence changes. It is not a control that changes nothing, and it is
 * not a schedule either.
 */

import type { LocalDate } from "@/lib/time/local-day";

/**
 * `HH:MM`, from a stored `time` column that may arrive as `HH:MM:SS`.
 *
 * Returns null rather than a default: a preference the surface could not read is
 * a preference the surface must not claim to be honouring.
 */
export function parseReviewTime(value: unknown): { readonly hour: number; readonly minute: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * The stored weekday, as `Date.getUTCDay()` numbers it: 0 is Sunday.
 *
 * `agent_preferences.weekly_review_day` is an integer column with no CHECK in the
 * application's reach, so a value outside 0–6 is possible and is refused rather
 * than modulo'd into a different day.
 */
export function parseReviewWeekday(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 0 && value <= 6 ? value : null;
}

export type ReviewScheduleReading = {
  /** `HH:MM` the user configured for the daily review, or null if unreadable. */
  readonly dailyAt: string | null;
  /** `HH:MM` for the weekly review, or null. */
  readonly weeklyAt: string | null;
  /** 0–6, Sunday-based, or null. */
  readonly weeklyWeekday: number | null;
  /**
   * Whether the user's own clock has passed the daily review time **today**.
   *
   * The only behavioural consequence in the whole module, and it is presentation:
   * past the configured time, the surface says the day is ready to be closed;
   * before it, it says when it will be. Nothing is triggered either way.
   */
  readonly dailyTimeReached: boolean;
  /** Whether today is the configured weekly review day. */
  readonly weeklyDayReached: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Read the three preferences against the user's own local day and clock.
 *
 * `nowLocalMinutes` is the minutes since local midnight *in the user's zone*,
 * computed by the caller from the one local-day contract — this module does no
 * zone arithmetic of its own, because a second implementation of "what time is it
 * where the user is" is the defect slice 2M.0 removed from two other places.
 */
export function readReviewSchedule(input: {
  readonly dailyReviewTime: unknown;
  readonly weeklyReviewTime: unknown;
  readonly weeklyReviewDay: unknown;
  readonly nowLocalMinutes: number;
  readonly today: LocalDate;
}): ReviewScheduleReading {
  const daily = parseReviewTime(input.dailyReviewTime);
  const weekly = parseReviewTime(input.weeklyReviewTime);
  const weekday = parseReviewWeekday(input.weeklyReviewDay);

  const todayWeekday = new Date(Date.UTC(input.today.year, input.today.month - 1, input.today.day)).getUTCDay();

  return Object.freeze({
    dailyAt: daily ? `${pad(daily.hour)}:${pad(daily.minute)}` : null,
    weeklyAt: weekly ? `${pad(weekly.hour)}:${pad(weekly.minute)}` : null,
    weeklyWeekday: weekday,
    dailyTimeReached: daily !== null && input.nowLocalMinutes >= daily.hour * 60 + daily.minute,
    weeklyDayReached: weekday !== null && weekday === todayWeekday,
  });
}
