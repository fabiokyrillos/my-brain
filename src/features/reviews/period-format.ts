import type { ReviewPeriodWindow } from "@/features/day-review/period-window";
import type { Locale } from "@/lib/preferences";
import { formatLocalDate, type LocalDate } from "@/lib/time/local-day";

/**
 * The window's dates, in words, beside the period's name.
 *
 * ## Why the zone is `UTC` and that is not a bug
 *
 * The value being formatted is a **calendar date**, not an instant:
 * `window.startKey` is already `YYYY-MM-DD` in the owner's zone, decided by the
 * local-day contract. Re-interpreting it in a zone would shift it — a date
 * built as `2026-08-17T00:00:00Z` and rendered in `America/Sao_Paulo` prints as
 * the 16th. `UTC` here means "read these three numbers as themselves", which is
 * the same construction `review-presentation.ts` uses for `period_start` and
 * `period_end`, and for the same reason.
 *
 * ## Why a day says its weekday and a week does not
 *
 * A day review is read on the day it is about, so "quinta-feira" is the fastest
 * confirmation that the page is showing the right one. A week or a month is
 * identified by its span, and adding weekdays to both ends of a range makes it
 * longer without making it clearer.
 */
function toDate(date: LocalDate): Date {
  return new Date(`${formatLocalDate(date)}T00:00:00.000Z`);
}

function intl(locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", { ...options, timeZone: "UTC" });
}

export function formatReviewPeriodRange(window: ReviewPeriodWindow, locale: Locale): string {
  if (window.tab === "day") {
    return intl(locale, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
      .format(toDate(window.startDate));
  }

  if (window.tab === "month") {
    // A month names itself. Printing "01 de agosto — 31 de agosto de 2026" for a
    // span that is exactly one month says the same thing three times.
    return intl(locale, { month: "long", year: "numeric" }).format(toDate(window.startDate));
  }

  const format = intl(locale, { day: "2-digit", month: "long", year: "numeric" });
  return `${format.format(toDate(window.startDate))} — ${format.format(toDate(window.endDate))}`;
}
