/**
 * `2M-TIME-005` and `2M-TIME-006` — how a **stored instant** is rendered, in one
 * place.
 *
 * ## The two requirements this module is the executable form of
 *
 * `2M-TIME-006`: *"an instant rendered on two surfaces renders identically, and
 * a test proves it for at least the calendar, the planner, the task detail and
 * the notification list."*
 *
 * `2M-TIME-005`: *"a user changing their timezone produces a defined, tested
 * result on every dated surface, and no stored value is silently rewritten by
 * the change."*
 *
 * Those are the same requirement seen from two sides. A surface that renders an
 * instant identically to its neighbour is one that took the zone from the same
 * place; a surface that responds to a timezone change is one that took the zone
 * from *the profile* rather than from the host. The failure mode is a single
 * omitted option: `new Intl.DateTimeFormat(locale, { timeStyle: "short" })`
 * silently formats in the host's zone — UTC on a server, wherever the device is
 * in a browser — and produces a page whose times are wrong by hours and whose
 * wrongness moves depending on where it was rendered.
 *
 * **This is not hypothetical here.** The notification list did exactly that:
 * `new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" })`
 * with no `timeZone`, three routes from a calendar that had passed the owner's
 * zone into every formatter since slice 2M.1. Changing the timezone in settings
 * changed the calendar, the planner, the reminders page and the task detail —
 * and left the notification list rendering the host's clock.
 *
 * ## Why the zone is a required parameter and not an optional one
 *
 * Every function here takes `timeZone` positionally and none defaults it. A
 * default would be a value some surface would eventually accept without meaning
 * to, and the defaulted value — the host zone — is precisely the wrong answer.
 * `2M-TIME-003` already made `profiles.timezone` the only answer; this module
 * makes forgetting to ask a type error rather than a rendering difference nobody
 * notices until a user travels.
 *
 * ## What it does not do
 *
 * It does not convert, store, or round-trip anything. **No stored value is
 * rewritten by a timezone change** — that is `2M-TIME-005`'s second clause, and
 * it holds because this module is pure presentation: the instant goes in as the
 * ISO string the database returned and comes out as characters. Nothing here has
 * a writer, and `instant-format.test.ts` proves the input string is unchanged
 * after formatting it in two zones.
 */

/**
 * The presentations a stored instant is allowed to take.
 *
 * A closed set rather than free `Intl` options, because "which fields does this
 * surface show" is a product decision and three surfaces inventing three
 * near-identical option bags is how `2M-TIME-006` gets violated by accident.
 *
 * `day` deliberately carries **no clock component at all** — it is what
 * `planned_at` renders as, and OD-2M-3 A says an intention is a day the user
 * chose and not a time they reserved.
 */
export type InstantPresentation =
  /** The calendar day, in the user's zone. No hour, ever. */
  | "day"
  /** The clock time only, 24-hour, for a surface already grouped by day. */
  | "time"
  /** Both, for a list that is not grouped by day — the notification list. */
  | "dayAndTime";

/**
 * `hourCycle: "h23"` on every presentation that shows a clock, in both locales.
 *
 * Not a stylistic choice: `pt-BR` defaults to a 24-hour clock and `en` to a
 * 12-hour one, so an instant rendered on the calendar in one locale and on the
 * notification list in the other would disagree about what "8:30" means — which
 * is the divergence `2M-TIME-006` names, arriving through the locale rather than
 * through the zone.
 *
 * `dateStyle`/`timeStyle` may not be combined with individual component options,
 * so `time` uses components and the two that show a date use the styles. The
 * clock is `h23` either way, which is what keeps them comparable.
 */
const OPTIONS: Record<InstantPresentation, Intl.DateTimeFormatOptions> = {
  day: { dateStyle: "medium" },
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  dayAndTime: { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" },
};

/**
 * One stored instant, as characters, in the owner's zone.
 *
 * Returns `null` for anything that is not a parseable instant, so a caller
 * cannot get a plausible-looking wrong date out of a broken value — the same
 * refusal `plannedLocalDate` makes one layer down, for the same reason.
 */
export function formatInstant(
  instant: string | null | undefined,
  presentation: InstantPresentation,
  locale: string,
  timeZone: string,
): string | null {
  if (typeof instant !== "string" || instant === "") return null;
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { ...OPTIONS[presentation], timeZone }).format(parsed);
}

/**
 * A bound formatter, for a page that renders many instants the same way.
 *
 * The reminders page already had this shape and its comment says why: twenty
 * rows building their own `Intl.DateTimeFormat` is twenty chances for one of
 * them to be built without the zone. Offered here so a surface adopting the
 * contract does not have to rediscover it.
 */
export function instantFormatter(
  presentation: InstantPresentation,
  locale: string,
  timeZone: string,
): (instant: string | null | undefined) => string | null {
  const formatter = new Intl.DateTimeFormat(locale, { ...OPTIONS[presentation], timeZone });
  return (instant) => {
    if (typeof instant !== "string" || instant === "") return null;
    const parsed = new Date(instant);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatter.format(parsed);
  };
}
