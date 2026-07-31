/**
 * Calendar-day boundaries in a named timezone, as UTC instants.
 *
 * A date filter is entered as a calendar day — "from 1 August" — and compared
 * against `timestamptz` columns. Treating that day as a UTC boundary would put
 * the cut in the wrong place for every user who is not on UTC: someone in
 * São Paulo asking for "1 August" would miss their own evening of 31 July and
 * gain three hours of 2 August.
 *
 * The offset is resolved by asking `Intl` what the wall clock reads at a
 * candidate instant and correcting, which converges in one pass everywhere and
 * in two across a DST transition. The loop is bounded at three either way.
 */

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
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

function timezoneOffsetAt(instant: number, timezone: string) {
  const parts = zonedParts(new Date(instant), timezone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    instant
  );
}

/**
 * Midnight starting `year-month-day` in `timezone`, as a UTC instant.
 *
 * `day` may overflow its month — `localDayStart(2026, 8, 32, tz)` is 1 September
 * — which is how the exclusive end of a range is built without month-length
 * arithmetic at the call site.
 */
export function localDayStart(
  year: number,
  month: number,
  day: number,
  timezone: string,
): Date {
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const candidate = target - timezoneOffsetAt(instant, timezone);
    if (candidate === instant) break;
    instant = candidate;
  }
  return new Date(instant);
}

/** Midnight starting the given `YYYY-MM-DD`, or null if it is not a real date. */
export function localDayStartFromIsoDate(date: string, timezone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const start = localDayStart(year, month, day, timezone);
  if (Number.isNaN(start.getTime())) return null;
  // Rejects 31 February, which `Date.UTC` would silently roll into March.
  const parts = zonedParts(start, timezone);
  if (parts.year !== year || parts.month !== month || parts.day !== day) return null;
  return start;
}

/**
 * Midnight *after* the given `YYYY-MM-DD` — the exclusive end of an inclusive
 * "to this day" filter, so the whole of the chosen day is included.
 */
export function localDayEndExclusive(date: string, timezone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  if (!localDayStartFromIsoDate(date, timezone)) return null;
  return localDayStart(Number(match[1]), Number(match[2]), Number(match[3]) + 1, timezone);
}
