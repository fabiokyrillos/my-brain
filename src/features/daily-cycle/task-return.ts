/**
 * `2M-CAL-008` / `2L-RETURN-001` — where Back goes from a task detail.
 *
 * ## Why this is a function and not three lines in the surface
 *
 * Because it is a *decision*, and a decision inside an async server component
 * that authenticates first can only be tested by standing up an authenticated
 * request. Extracted, it is a pure function over an untrusted string, which is
 * the only shape a security-relevant parser should have.
 *
 * ## The rule
 *
 * One `from` parameter serves both surfaces, discriminated by each payload's own
 * version literal. The calendar is asked first and answers `null` rather than a
 * default, so *"not a calendar return"* stays distinguishable from *"a malformed
 * calendar return"*. Anything that is neither — absent, malformed, stale,
 * hand-made, or a payload carrying a field that could authorize — lands on the
 * Work default, which is the pre-existing behaviour and the least surprising
 * place to be after pressing Back on a link that no longer parses.
 *
 * **Neither parser throws.** A return position is what a user reaches by
 * pressing Back, and an error page is the wrong answer to that.
 */

import { calendarReturnHref, parseCalendarPosition } from "@/features/calendar/calendar-position";
import { parseWorkPosition } from "@/features/operations/work-position";
import type { Locale } from "@/lib/preferences";

import { workHref } from "./work-query";

/**
 * Where Back goes **and what it is called**.
 *
 * The two are one decision. The deployment journey caught them apart: the href
 * had learned about the calendar and the label had not, so a link that returned
 * to the right day said "Trabalho". Resolving the destination here — from the
 * same parse, rather than by re-reading the string at the render site — is what
 * stops the two drifting again.
 */
export type TaskBackTarget = {
  readonly href: string;
  readonly destination: "calendar" | "work";
};

export function resolveTaskBackTarget(locale: Locale, from?: string | string[]): TaskBackTarget {
  const calendar = parseCalendarPosition(from);
  return calendar
    ? { href: calendarReturnHref(locale, calendar), destination: "calendar" }
    : { href: workHref(locale, parseWorkPosition(from)), destination: "work" };
}

export function resolveTaskBackHref(locale: Locale, from?: string | string[]): string {
  return resolveTaskBackTarget(locale, from).href;
}
