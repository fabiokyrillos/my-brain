/**
 * `2M-TIME-001`/`-002`/`-003` — **the** definition of a user's local day.
 *
 * ## Why this module exists
 *
 * Before it there were **three** implementations of "the user's local day" in
 * this repository, and two of them were wrong — in opposite directions, by the
 * same fixed-24-hour assumption:
 *
 * | Where | What it did | What went wrong |
 * |---|---|---|
 * | `today-priorities.ts` | `end = start + 24h` | on a 23-hour day the window **overshoots** into tomorrow; on a 25-hour day it **stops an hour early** |
 * | `work-projection.ts` | `startOfToday = startOfNextLocalDay − 24h` | the mirror image: today's **start** is an hour off on the same two days |
 * | `run_user_heartbeat` (SQL) | `local_date::timestamp at time zone tz` and `(local_date + 1)::…` | **correct** — Postgres resolves the wall clock to the right instant |
 *
 * Nothing had noticed, because each was asked a different question on a
 * different surface. A calendar day column and a notification about that day ask
 * the **same** question, so the disagreement had to be removed before either
 * shipped.
 *
 * **The SQL is the reference, and this module mirrors it.** The contract, quoted
 * from `202608040071_account_lifecycle_wiring.sql`:
 *
 * ```sql
 * local_now       := now() at time zone user_timezone;
 * local_date      := local_now::date;
 * local_day_start := local_date::timestamp at time zone user_timezone;
 * local_day_end   := (local_date + 1)::timestamp at time zone user_timezone;
 * ```
 *
 * A local day therefore runs from **the instant of local midnight today** to
 * **the instant of local midnight tomorrow**, and its length is whatever that
 * is: 23, 24 or 25 hours. `supabase/tests/local_day_contract.sql` asserts the
 * SQL side over the same instants this module's tests use, so the two are proved
 * to agree rather than assumed to.
 *
 * ## The case a fixed point alone gets wrong
 *
 * Resolving a wall-clock date to an instant is a fixed-point problem — the
 * offset depends on the instant, which depends on the offset. Iterating
 * converges almost everywhere, and **silently lands in the previous day** where
 * local midnight does not exist.
 *
 * It does not exist more often than one would like. `America/Santiago` springs
 * forward **at midnight**: on 2026-09-06 the local times 00:00–00:59 never
 * happen, and the naive fixed point resolves "start of 2026-09-06" to
 * `2026-09-05T23:00` local — a boundary inside the **previous** day, which would
 * put a task on the wrong date and a notification on the wrong day.
 *
 * So this resolves the two candidate offsets that bracket the instant, keeps
 * only the candidates whose local date is actually the requested one, and takes
 * the earliest:
 *
 * - **ordinary day** — both offsets agree, one candidate, taken;
 * - **spring forward at midnight** — the "after" candidate lands in the previous
 *   day and is **rejected**; the "before" candidate lands on the first instant
 *   that exists (01:00 local), which is when the day genuinely starts;
 * - **fall back across midnight** — midnight happens twice, both candidates are
 *   valid, and the **earlier** is the day's start, which is what "start" means.
 *
 * A candidate is never invented: if neither survives, the caller gets an error
 * rather than a plausible wrong answer.
 */

/** The two edges of one local day, as epoch milliseconds. `end` is exclusive. */
export type LocalDayBounds = {
  readonly start: number;
  readonly end: number;
};

/** Half a day, used only to bracket a transition — never as a day's length. */
const BRACKET_MS = 12 * 60 * 60 * 1000;

type ZonedParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
};

function zonedParts(instant: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/**
 * How far the zone's wall clock is from UTC at `instant`, as milliseconds.
 *
 * Positive east of Greenwich. Read **at the instant** rather than assumed, which
 * is the whole reason a transition is representable at all.
 */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
}

/**
 * The instant at which the local date `year-month-day` begins in `timeZone`.
 *
 * See the module comment for why this is not a fixed-point iteration.
 */
function startOfLocalDate(year: number, month: number, day: number, timeZone: string): number {
  const wallClock = Date.UTC(year, month - 1, day);
  const candidates = [
    wallClock - zoneOffsetMs(wallClock - BRACKET_MS, timeZone),
    wallClock - zoneOffsetMs(wallClock + BRACKET_MS, timeZone),
  ];
  const valid = candidates.filter((candidate) => {
    const parts = zonedParts(candidate, timeZone);
    return parts.year === year && parts.month === month && parts.day === day;
  });
  if (valid.length === 0) {
    throw new Error(`local date ${year}-${month}-${day} does not occur in ${timeZone}`);
  }
  return Math.min(...valid);
}

/**
 * Whether `value` names a zone this product will compute a day in.
 *
 * The `"/"` requirement is deliberate and predates this module: a bare `"EST"`
 * parses, and it is an abbreviation rather than a zone — it carries no DST rule,
 * so a day computed in it would be silently fixed-offset. `"UTC"` is the one
 * admitted exception.
 */
export function isSupportedTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  if (!value.includes("/") && value !== "UTC") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * The local day containing `now` in `timeZone`.
 *
 * A missing or unsupported zone is a **caller error** and throws. It is never
 * defaulted: `2M-TIME-003` requires that a day nobody could compute is reported
 * rather than answered, because the alternative is a silently wrong answer at
 * 23:00 — which is precisely when it matters.
 */
export function localDayBounds(now: Date, timeZone: string): LocalDayBounds {
  if (!isSupportedTimeZone(timeZone)) {
    throw new Error(`unsupported time zone: ${String(timeZone)}`);
  }
  const instant = now.getTime();
  if (!Number.isFinite(instant)) throw new Error("localDayBounds received an invalid Date");

  const today = zonedParts(instant, timeZone);
  const start = startOfLocalDate(today.year, today.month, today.day, timeZone);

  // Tomorrow's calendar date, obtained by arithmetic on the *date* rather than
  // on the instant — adding 24h to `start` is the very assumption this module
  // exists to remove.
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const end = startOfLocalDate(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    timeZone,
  );

  return { start, end };
}

/** The local day that begins immediately after the one containing `now`. */
export function startOfNextLocalDay(now: Date, timeZone: string): Date {
  return new Date(localDayBounds(now, timeZone).end);
}

/**
 * How long a local day is, in hours. 23, 24 or 25 — and the reason this is
 * exported is that a test asserting "24" everywhere is a test that would have
 * passed against both of the implementations this module replaced.
 */
export function localDayLengthHours(bounds: LocalDayBounds): number {
  return (bounds.end - bounds.start) / (60 * 60 * 1000);
}

/**
 * A calendar date the user can name, as three numbers rather than a `Date`.
 *
 * `2M-CAL-004` puts the anchor in the URL, and a URL says `2026-08-15` — a
 * *wall-clock date*, not an instant. Parsing it into a `Date` first would pick
 * an instant before anybody had said in which zone, which is the mistake this
 * whole module exists to stop being made a fourth time.
 */
export type LocalDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses `YYYY-MM-DD`, or returns `null`.
 *
 * Strict on purpose: `2026-8-5`, `2026-02-30` and `2026-13-01` are all refused
 * rather than coerced, because a calendar that silently rounded a malformed
 * anchor would answer a question the user did not ask — and `2M-CAL-005`
 * requires an unparseable parameter to resolve to the *declared default*, which
 * only the caller can supply.
 */
export function parseLocalDate(value: unknown): LocalDate | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Round-tripping through UTC rejects 2026-02-30 and 2026-04-31 without a
  // month-length table, and without touching a zone.
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  if (
    roundTrip.getUTCFullYear() !== year
    || roundTrip.getUTCMonth() + 1 !== month
    || roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** `YYYY-MM-DD`, the only form an anchor takes in a URL or in copy. */
export function formatLocalDate(date: LocalDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-`
    + `${String(date.day).padStart(2, "0")}`;
}

/** The calendar date `now` falls on, in `timeZone`. */
export function localDateOf(now: Date, timeZone: string): LocalDate {
  if (!isSupportedTimeZone(timeZone)) {
    throw new Error(`unsupported time zone: ${String(timeZone)}`);
  }
  const instant = now.getTime();
  if (!Number.isFinite(instant)) throw new Error("localDateOf received an invalid Date");
  const parts = zonedParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** `date` shifted by whole calendar days. Never by a fixed number of hours. */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Whether `a` is before `b`, comparing calendar dates rather than instants. */
export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/**
 * The bounds of a **named** local day — the calendar's unit of everything.
 *
 * This is `localDayBounds` asked about a date instead of about an instant, and
 * it shares `startOfLocalDate` with it rather than reimplementing the rule. That
 * matters: `phase-2m-local-day-guard.test.ts` fails the build on a fourth copy,
 * and a calendar that resolved its own day boundaries would be exactly that.
 *
 * A 23-hour day is 23 hours here too, and a date whose local midnight does not
 * exist starts at the first instant that does.
 */
export function localDayBoundsForDate(date: LocalDate, timeZone: string): LocalDayBounds {
  if (!isSupportedTimeZone(timeZone)) {
    throw new Error(`unsupported time zone: ${String(timeZone)}`);
  }
  const start = startOfLocalDate(date.year, date.month, date.day, timeZone);
  const next = addLocalDays(date, 1);
  const end = startOfLocalDate(next.year, next.month, next.day, timeZone);
  return { start, end };
}

/**
 * The bounds of a run of `dayCount` consecutive local days beginning at `date`.
 *
 * Composed from `localDayBoundsForDate` at both ends rather than multiplying a
 * day length, so a week containing a transition is 167 or 169 hours long and the
 * calendar's last column ends where the day genuinely does.
 */
export function localRangeBounds(
  date: LocalDate,
  dayCount: number,
  timeZone: string,
): LocalDayBounds {
  if (!Number.isInteger(dayCount) || dayCount < 1) {
    throw new Error(`localRangeBounds needs at least one day, received ${String(dayCount)}`);
  }
  return {
    start: localDayBoundsForDate(date, timeZone).start,
    end: localDayBoundsForDate(addLocalDays(date, dayCount - 1), timeZone).end,
  };
}

/**
 * The Monday-based week `date` belongs to.
 *
 * Monday rather than Sunday, and stated rather than assumed: the product's
 * locales are `pt-BR` and `en`, whose conventions disagree — and a week that
 * silently changed its first column with the locale would make a shared URL
 * describe two different ranges (`2M-CAL-004`). One rule, both locales.
 */
export function startOfLocalWeek(date: LocalDate): LocalDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  // `getUTCDay()` is 0 for Sunday; Monday-based offset puts Sunday six days in.
  const offset = (utc.getUTCDay() + 6) % 7;
  return addLocalDays(date, -offset);
}
