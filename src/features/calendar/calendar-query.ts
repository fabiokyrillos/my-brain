/**
 * `2M-CAL-001` … `-007` — everything a user is looking at on the calendar, as a
 * value read from the URL.
 *
 * ## Why this module exists at all
 *
 * `2M-CAL-004` forbids stored per-user calendar view state: *"the complete
 * description of what a user is looking at — orientation, anchor date, lane
 * visibility and any filter — is in the URL"*. That is only enforceable if there
 * is one place that turns a URL into that description and back, so a link cannot
 * quietly drop a parameter and a page cannot quietly remember one. It is the
 * same shape `work-query.ts` has, deliberately: two contracts that behave alike
 * should read alike.
 *
 * ## Fail-closed means *narrower*, never wider — and here it also means *nearer*
 *
 * `2M-CAL-005` is the sharp one, and it has two halves the Work contract never
 * had to think about:
 *
 *   1. an unknown, malformed or out-of-range parameter resolves to the
 *      **declared default** and never to a wider **result set**; and
 *   2. never to a wider **date range** either.
 *
 * So `orientation` defaults to `day` — the narrowest of the three — rather than
 * to the week a designer would reach for. A malformed anchor resolves to
 * **today**, which is one day wide, rather than to the start of some range. And
 * a lane token the vocabulary does not know is **dropped**, which narrows;
 * only a lane list with nothing recognisable in it falls back to the declared
 * default set.
 *
 * ## Why the navigation bound is declared once, here
 *
 * `2M-CAL-006` requires the range to be explicitly bounded, the bound declared
 * in one place, and reaching it to be a **visible state** rather than an empty
 * grid. A calendar with no bound is a calendar a user can page into the year
 * 9999, issuing a database query per step and finding nothing — an empty grid
 * that says "no items" when the truthful answer is "you have left the part of
 * time this product models".
 *
 * ## What is deliberately absent
 *
 * No `?view=` and no `workView` value: OD-2L-2 A keeps Work at exactly three
 * views and `2M-CAL-001` puts the calendar on its own route, outside
 * `/app/work`. Nothing here can express a Work destination.
 */

import {
  addLocalDays,
  addLocalMonths,
  compareLocalDates,
  daysInLocalMonth,
  formatLocalDate,
  parseLocalDate,
  startOfLocalMonth,
  startOfLocalWeek,
  type LocalDate,
} from "@/lib/time/local-day";

/**
 * `2M-CAL-007`'s three orientations.
 *
 * **This is the canonical declaration.** `calendarOrientations` in
 * `product-analytics/contracts.ts` restates it for the telemetry payload, and
 * `calendar-query.test.ts` holds the two to exact equality — the same drift gate
 * the Phase 2E command vocabularies get, and for the same reason: an analytics
 * module must not import a feature module, and two lists that agree by
 * inspection are one refactor from disagreeing.
 */
/**
 * Slice 2P.7 adds a fourth, `month`, and it is **not** mirrored in the telemetry
 * vocabulary — see `2P-CALENDAR-MONTH-TELEMETRY` in `calendar-query.test.ts`.
 * The short version: the third copy of that list lives inside a deployed
 * validator, widening it needs a migration, and a migration is a stop condition.
 * `month` is a period the surface shows and the ledger does not hear about.
 */
export const CALENDAR_ORIENTATIONS = ["day", "week", "month", "agenda"] as const;
export type CalendarOrientation = (typeof CALENDAR_ORIENTATIONS)[number];

/**
 * The orientations whose span is a constant.
 *
 * `month` is deliberately outside this type rather than given a nominal 30, and
 * the exclusion is what makes the omission a compile error instead of a rounding
 * error: a month is 28, 29, 30 or 31 days sitting in a 4-, 5- or 6-week grid, so
 * anything that needs a length must ask `rangeDayCount` with the anchor in hand.
 */
export type FixedSpanOrientation = Exclude<CalendarOrientation, "month">;

/**
 * The five lanes `2M-CAL-002` names, over the five sources that already exist.
 *
 * Every one is a **read of something the product already stores**. There is no
 * sixth lane and no event entity — OD-2M-3 A refused one, and the
 * committed-versus-suggested distinction `2M-CAL-003` asks for is derivable from
 * which lane an item is in.
 */
export const CALENDAR_LANES = ["deadline", "intention", "reminder", "review", "suggestion"] as const;
export type CalendarLane = (typeof CALENDAR_LANES)[number];

/**
 * `2M-CAL-003` — committed, intended, suggested or recorded, **derived** from
 * the lane and never from a stored flag.
 *
 * Four values rather than the two the requirement's wording implies, because
 * collapsing them would be the lie: a deadline and a reminder are commitments, an
 * intention is a plan the user made and may change (OD-2M-3 A), an unconfirmed
 * extracted date is the product's *guess*, and a review is a record of a period
 * that has already happened. A calendar that painted an intention as a
 * commitment would be asserting exactly the reclassification OD-2M-3 refused.
 */
export const CALENDAR_COMMITMENTS = ["committed", "intended", "suggested", "recorded"] as const;
export type CalendarCommitment = (typeof CALENDAR_COMMITMENTS)[number];

export const COMMITMENT_BY_LANE: Record<CalendarLane, CalendarCommitment> = {
  deadline: "committed",
  intention: "intended",
  reminder: "committed",
  review: "recorded",
  suggestion: "suggested",
};

/** How many days each fixed orientation spans. Agenda is a fortnight, forward-looking. */
export const DAYS_BY_ORIENTATION: Record<FixedSpanOrientation, number> = {
  day: 1,
  week: 7,
  agenda: 14,
};

/**
 * How many days the given position actually shows.
 *
 * For the three fixed orientations this is the constant above. For `month` it is
 * the **grid**, not the month: whole weeks from the Monday on or before the
 * first to the Sunday on or after the last, which is 28, 35 or 42 days. Whole
 * weeks because a month drawn as a ragged seven-column table would put the same
 * weekday in two columns, and 28 is reachable — a February beginning on a Monday
 * in a non-leap year is exactly four weeks, and an implementation that always
 * padded to 35 would draw a phantom week.
 */
export function rangeDayCount(query: CalendarQuery): number {
  if (query.orientation !== "month") return DAYS_BY_ORIENTATION[query.orientation];
  const first = rangeStart(query);
  const monthStart = startOfLocalMonth(query.anchor);
  const lead = daysBetween(first, monthStart);
  return Math.ceil((lead + daysInLocalMonth(query.anchor)) / 7) * 7;
}

/** Whole days from `from` to `to`, both wall-clock dates. Never a duration in hours. */
function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

/**
 * The anchor one period earlier or later, before the bound is applied.
 *
 * Split out because `month` moves by a month and the other three move by their
 * span, and both `step` and `boundState` need the same answer — two call sites
 * computing "the next position" independently is how a *next* control and the
 * *this is the last one* message come to disagree.
 */
function shiftAnchor(query: CalendarQuery, direction: -1 | 1): LocalDate {
  return query.orientation === "month"
    ? addLocalMonths(query.anchor, direction)
    : addLocalDays(query.anchor, direction * DAYS_BY_ORIENTATION[query.orientation]);
}

/**
 * The navigation bound, declared **once** (`2M-CAL-006`).
 *
 * A year either side of today. Chosen rather than inherited: `reminders` and
 * `tasks` carry no retention limit, so a bound is a product decision about how
 * far a *timeline* is worth walking, not a data limit. It is symmetric because
 * looking back a year at what a period contained is as legitimate as looking
 * forward a year at what is committed.
 */
export const CALENDAR_BOUND_DAYS = 365;

export type CalendarQuery = {
  readonly orientation: CalendarOrientation;
  readonly anchor: LocalDate;
  readonly lanes: readonly CalendarLane[];
};

/** The declared defaults, in one place, so "the default" is never a guess. */
export const DEFAULT_CALENDAR_LANES: readonly CalendarLane[] = CALENDAR_LANES;

/**
 * `2M-CAL-007` — the mobile default, chosen deliberately and recorded here
 * rather than in a component.
 *
 * `day` on a narrow viewport. A seven-column grid at 375 px gives each day
 * roughly 45 px, which cannot hold a masked title, a lane marker and a
 * reschedule control without either horizontal scroll (`2M-MOBILE-001` forbids
 * it) or targets below the minimum (`2M-MOBILE-002` forbids that). `day` is also
 * the narrowest range, so it is what a fail-closed default resolves to anyway —
 * the mobile choice and the safety choice agree, which is worth stating because
 * they will not always.
 */
export const MOBILE_DEFAULT_ORIENTATION: CalendarOrientation = "day";
export const DEFAULT_ORIENTATION: CalendarOrientation = "day";

type Param = string | string[] | undefined;

/**
 * One value, or the declared default.
 *
 * A repeated parameter (`?orientation=day&orientation=week`) arrives as an array
 * and resolves to the default rather than to its first element: two values is a
 * malformed request, and picking one would be guessing which the user meant.
 */
function one<T extends string>(value: Param, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * The lanes, in the declared order, from a comma-separated list.
 *
 * Unknown tokens are **dropped**, which narrows. Only a list with nothing
 * recognisable in it — including an empty string and a repeated parameter —
 * resolves to the declared default set. The result is always in
 * `CALENDAR_LANES` order and never contains a duplicate, so two URLs that name
 * the same lanes describe the same state.
 */
export function parseLanes(value: Param): readonly CalendarLane[] {
  if (typeof value !== "string") return DEFAULT_CALENDAR_LANES;
  const requested = new Set(value.split(",").map((token) => token.trim()));
  const recognised = CALENDAR_LANES.filter((lane) => requested.has(lane));
  return recognised.length > 0 ? recognised : DEFAULT_CALENDAR_LANES;
}

/**
 * The anchor, or **today** — never a date outside the declared bound.
 *
 * `today` is the user's local today, which is why this needs the zone: a browser
 * in one place and a profile in another must agree, and `2M-TIME-003` makes the
 * profile's zone the only answer.
 */
export function parseAnchor(value: Param, today: LocalDate): LocalDate {
  const parsed = parseLocalDate(typeof value === "string" ? value : null);
  if (!parsed) return today;
  return isWithinBound(parsed, today) ? parsed : today;
}

/** Whether `date` is inside the declared navigation bound around `today`. */
export function isWithinBound(date: LocalDate, today: LocalDate): boolean {
  const earliest = addLocalDays(today, -CALENDAR_BOUND_DAYS);
  const latest = addLocalDays(today, CALENDAR_BOUND_DAYS);
  return compareLocalDates(date, earliest) >= 0 && compareLocalDates(date, latest) <= 0;
}

export function parseCalendarQuery(
  params: Record<string, Param>,
  today: LocalDate,
): CalendarQuery {
  return {
    orientation: one(params.orientation, CALENDAR_ORIENTATIONS, DEFAULT_ORIENTATION),
    anchor: parseAnchor(params.date, today),
    lanes: parseLanes(params.lanes),
  };
}

/**
 * The query as link parameters — **defaults omitted**.
 *
 * Omitting them keeps one description of one state: `?date=2026-08-15` and
 * `?date=2026-08-15&orientation=day&lanes=deadline,intention,reminder,review,suggestion`
 * would otherwise be two URLs for the same page. The anchor is **never** omitted,
 * because "today" is not a stable description — a link shared at 23:50 must
 * still name the day it was about at 00:10.
 */
export function toCalendarQueryParams(query: CalendarQuery): Record<string, string> {
  const params: Record<string, string> = { date: formatLocalDate(query.anchor) };
  if (query.orientation !== DEFAULT_ORIENTATION) params.orientation = query.orientation;
  if (query.lanes.length !== CALENDAR_LANES.length) params.lanes = query.lanes.join(",");
  return params;
}

/** The href a link to this exact position uses. */
export function calendarHref(locale: string, query: CalendarQuery): string {
  const search = new URLSearchParams(toCalendarQueryParams(query)).toString();
  return search ? `/${locale}/app/calendar?${search}` : `/${locale}/app/calendar`;
}

/**
 * The anchor one step earlier or later, **clamped to the bound**.
 *
 * Clamped rather than refused, so the control still moves the user to the last
 * position that exists instead of doing nothing — and `atBound` below is what
 * lets the surface say why it stopped (`2M-CAL-006`).
 */
export function step(query: CalendarQuery, direction: -1 | 1, today: LocalDate): CalendarQuery {
  const candidate = shiftAnchor(query, direction);
  return { ...query, anchor: isWithinBound(candidate, today) ? candidate : query.anchor };
}

/** Which ends of the declared bound this position is sitting on. */
export function boundState(query: CalendarQuery, today: LocalDate): {
  readonly atEarliest: boolean;
  readonly atLatest: boolean;
} {
  return {
    atEarliest: !isWithinBound(shiftAnchor(query, -1), today),
    atLatest: !isWithinBound(shiftAnchor(query, 1), today),
  };
}

/**
 * The first day the given orientation shows, given its anchor.
 *
 * `week` snaps to Monday so that a week is a *week* rather than seven days
 * starting wherever the user happened to click; `day` and `agenda` start at the
 * anchor, because an agenda is "the next fortnight from here" and snapping it
 * would move the user somewhere they did not ask to go.
 */
export function rangeStart(query: CalendarQuery): LocalDate {
  if (query.orientation === "week") return startOfLocalWeek(query.anchor);
  // A month snaps twice: to its own first day, then back to that day's Monday,
  // so the grid's columns are weekdays rather than offsets from the first.
  if (query.orientation === "month") return startOfLocalWeek(startOfLocalMonth(query.anchor));
  return query.anchor;
}

/**
 * Switching orientation **preserves the anchor** (`2M-CAL-007`).
 *
 * A function rather than a spread at the call site, so the property is asserted
 * once and cannot be broken by a surface that decides to "helpfully" jump to
 * today when the user changes the shape of the view.
 */
export function withOrientation(
  query: CalendarQuery,
  orientation: CalendarOrientation,
): CalendarQuery {
  return { ...query, orientation };
}

/** Toggling one lane. Turning the last one off is refused: an empty calendar is not a state. */
export function withLaneToggled(query: CalendarQuery, lane: CalendarLane): CalendarQuery {
  const next = query.lanes.includes(lane)
    ? query.lanes.filter((member) => member !== lane)
    : CALENDAR_LANES.filter((member) => member === lane || query.lanes.includes(member));
  return next.length > 0 ? { ...query, lanes: next } : query;
}

/** Whether the query narrows anything — what "filtered empty" means. */
export function isNarrowed(query: CalendarQuery): boolean {
  return query.lanes.length !== CALENDAR_LANES.length;
}
