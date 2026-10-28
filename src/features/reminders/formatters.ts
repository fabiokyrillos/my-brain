import type { Locale } from "@/lib/preferences";

/**
 * The three zone-bound formatters every reminder surface renders through.
 *
 * Extracted from the list page when the detail page arrived. Inside one page,
 * building them once and passing the results down was already the rule — "one
 * formatter for the whole page, bound to the owner's zone", because twenty
 * rows constructing their own `Intl.DateTimeFormat` is twenty chances for one
 * of them to be built without `timeZone` and quietly render in the server's
 * zone instead. Two pages each doing their own construction is the same hazard
 * one level up, and `2R-TIME-005` asks for one authority rather than several.
 *
 * The results are plain strings on purpose. The row controls are a Client
 * Component and a function cannot cross that boundary, so what travels
 * downward is what these produced, never the formatters themselves.
 */
export type ReminderFormatters = {
  /** The instant, long date and short time, in the owner's zone. */
  readonly formatInstant: (iso: string) => string;
  /** The same instant as a `datetime-local` value, in the owner's zone. */
  readonly formatLocalInput: (iso: string) => string;
  /** The wall clock alone, `HH:MM`, for slice 2R.2's series time field. */
  readonly formatLocalTime: (iso: string) => string;
};

export function reminderFormatters(locale: Locale, timezone: string): ReminderFormatters {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  });

  /*
   * Built from `Intl` parts rather than through `formatInstantForDateTimeLocal`:
   * that helper's parser once accepted only instants whose seconds were
   * literally `:00` with no fractional part, while every reminder these
   * surfaces read carries whatever `now()` had, so calling it threw inside the
   * client render and took the page to its error boundary. The parser now
   * accepts the full stored grammar; this stays server-side because a throwing
   * parser has no business in client render.
   *
   * `en-CA` gives ISO-ordered date parts, so the pieces assemble without a
   * locale assumption, and `h23` keeps an `en` reader from receiving "08:30 PM"
   * in a field whose grammar admits one shape only.
   */
  const localInputFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const localParts = (iso: string) => {
    const parts = localInputFormatter.formatToParts(new Date(iso));
    return (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? "";
  };

  return {
    formatInstant: (iso: string) => formatter.format(new Date(iso)),
    formatLocalInput: (iso: string) => {
      const part = localParts(iso);
      return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
    },
    // The same parts as the input value, deliberately: a substring of another
    // value's result would be a dependency on that value's shape.
    formatLocalTime: (iso: string) => {
      const part = localParts(iso);
      return `${part("hour")}:${part("minute")}`;
    },
  };
}
