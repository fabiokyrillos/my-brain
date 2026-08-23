import {
  RECURRENCE_RULE_VERSION,
  type RecurrenceFrequency,
  type RecurrenceOrdinal,
  type RecurrenceRule,
  weekdayFromJsDay,
} from "./recurrence-rule";

/**
 * A rule derived from the date the owner already picked — `2R-SURFACE-001`.
 *
 * ## Why this exists, and what it is instead of
 *
 * The requirement is *"the existing modal gains the control **without becoming a
 * form**"*, and the plan makes turning it into one a stop condition. The obvious
 * control is not one control: a frequency picker, then seven weekday checkboxes
 * for `weekly`, a day-of-month number for `monthlyDay`, an ordinal plus a
 * weekday for `monthlyWeekday`, a month plus a day for `yearly`. That is five
 * more groups in a dialog that already has five, and it is a form.
 *
 * **Every one of those parameters is already on the screen.** The composer asks
 * for a date and time before it asks anything about repeating, so *"every week"*
 * means the weekday of that date, *"every month"* means its day, and *"every
 * year"* means its month and day. The control collapses to a **single select**
 * with five options and no new fields at all.
 *
 * That is also why the preview matters rather than being decoration: the owner
 * has to be able to see what was derived. `2R-SURFACE-002` shows the next three
 * occurrences before saving, which is where a wrong derivation becomes visible
 * while it is still free to change.
 *
 * ## Pure, and given a wall clock rather than an instant
 *
 * The input is the `datetime-local` value the composer already holds —
 * `YYYY-MM-DDTHH:mm` **in the owner's zone**, formatted server-side by the page's
 * one zone-bound formatter. So there is no timezone arithmetic here and none is
 * possible: `2R-TIME-006` forbids reading the browser's zone, and this function
 * has no way to reach it. The instants themselves are still the database's
 * (`2R-TIME-007`); this only decides which *pattern* was meant.
 */

/** What the select offers. `"none"` is first because not repeating is the default. */
export const RECURRENCE_CHOICES = [
  "none",
  "daily",
  "weekly",
  "monthlyDay",
  "monthlyWeekday",
  "yearly",
] as const;

export type RecurrenceChoice = (typeof RECURRENCE_CHOICES)[number];

export function isRecurrenceChoice(value: unknown): value is RecurrenceChoice {
  return typeof value === "string" && (RECURRENCE_CHOICES as readonly string[]).includes(value);
}

/** The wall clock the composer holds, split into the parts a rule needs. */
export type LocalAnchor = {
  readonly year: number;
  /** 1..12. */
  readonly month: number;
  /** 1..31. */
  readonly day: number;
  /** ISO-8601 weekday, 1 = Monday … 7 = Sunday. */
  readonly weekday: RecurrenceOrdinalWeekday;
};

type RecurrenceOrdinalWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Parses `YYYY-MM-DDTHH:mm` into its parts, or `null`.
 *
 * `Date.UTC` rather than `new Date(value)`: a bare `datetime-local` string is
 * parsed by the runtime as **local time**, which is the browser's zone — the one
 * authority `2R-TIME-006` forbids consulting. Reading the digits and asking a
 * UTC date for the weekday keeps the answer a property of the text.
 */
export function parseLocalAnchor(value: string): LocalAnchor | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  // A date the calendar does not have -- 31 April -- rolls forward, and the
  // roll is how it is detected rather than by a month-length table.
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return {
    year,
    month,
    day,
    weekday: weekdayFromJsDay(probe.getUTCDay()) as RecurrenceOrdinalWeekday,
  };
}

/**
 * Which occurrence of its weekday this date is, within its month.
 *
 * Returns `-1` — *last* — when no later date in the month falls on the same
 * weekday, **before** it returns a positional ordinal. The order matters: the
 * 29th of a 31-day month starting on a Monday is the fifth Monday, and
 * `RECURRENCE_ORDINALS` has no `5` on purpose (`recurrence-rule.ts:76-81`: a
 * fifth weekday exists in some months and not others, so a rule naming it would
 * silently skip months). Reading it as *last* is the meaning that survives every
 * month.
 */
export function ordinalWithinMonth(anchor: LocalAnchor): RecurrenceOrdinal {
  const daysInMonth = new Date(Date.UTC(anchor.year, anchor.month, 0)).getUTCDate();
  if (anchor.day + 7 > daysInMonth) return -1;
  const position = Math.ceil(anchor.day / 7);
  // 1..4 by construction: a day whose +7 stays inside the month is at most the
  // 24th of a 31-day month, so `ceil(24/7)` is 4.
  return position as RecurrenceOrdinal;
}

/**
 * The rule the choice means, given the date already chosen.
 *
 * `null` for `"none"`, which is the composer's way of saying this reminder does
 * not repeat — not an error, and deliberately not a rule with an empty pattern.
 */
export function deriveRecurrenceRule(
  choice: RecurrenceChoice,
  anchor: LocalAnchor,
): RecurrenceRule | null {
  const version = RECURRENCE_RULE_VERSION as 1;
  switch (choice) {
    case "none":
      return null;
    case "daily":
      return { version, frequency: "daily" };
    case "weekly":
      return { version, frequency: "weekly", weekdays: [anchor.weekday] };
    case "monthlyDay":
      return { version, frequency: "monthlyDay", day: anchor.day };
    case "monthlyWeekday":
      return {
        version,
        frequency: "monthlyWeekday",
        ordinal: ordinalWithinMonth(anchor),
        weekday: anchor.weekday,
      };
    case "yearly":
      return { version, frequency: "yearly", month: anchor.month, day: anchor.day };
  }
}

/** The five frequencies a choice can name, for a caller that needs the narrower type. */
export function frequencyOfChoice(choice: RecurrenceChoice): RecurrenceFrequency | null {
  return choice === "none" ? null : choice;
}
