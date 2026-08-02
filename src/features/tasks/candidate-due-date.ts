const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
// The upstream contract — `storableInstant` in `src/lib/ai/extraction-schema.ts`
// and `dueAtSchema` in `./candidate-edit-contract.ts`, both
// `z.string().datetime({ offset: true })` — permits any seconds value and
// optional fractional seconds. This reader accepts exactly that grammar. It
// used to demand `:00` seconds, which meant a model-produced end-of-day due
// date such as `...T23:59:59-03:00` passed every validated boundary and then
// threw here, taking the whole entry detail route down through the error
// boundary. The seconds are read only to be discarded: a datetime-local control
// has minute precision, and truncating to the minute never moves the wall clock.
const OFFSET_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;
const EXPLICIT_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const MINUTE_IN_MILLISECONDS = 60_000;
const SEARCH_WINDOW_MINUTES = 24 * 60;

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/**
 * Why a candidate due date could not be shown, when it could not be shown.
 *
 * `missing-offset` covers every representation that names no instant at all —
 * a date-only value, a local date-time, a SQL-style timestamp. Such a value
 * cannot be rendered without inventing an offset, so it is refused rather than
 * guessed at.
 */
export type CandidateDueDateReason = "missing-offset" | "malformed-instant";

export type CandidateDueDateState =
  | { readonly status: "absent" }
  | { readonly status: "valid"; readonly localValue: string }
  | { readonly status: "unreadable"; readonly reason: CandidateDueDateReason };

/**
 * The candidate due date as a datetime-local control can show it.
 *
 * One optional field carrying a legacy or malformed representation must not be
 * able to take down an entry, so the failure is a value the caller renders, not
 * an exception it has to catch. An unusable timezone still throws: that is a
 * configuration defect rather than a defect in the candidate's own data.
 */
export function describeInstantForDateTimeLocal(
  instant: string | null | undefined,
  timezone: string,
): CandidateDueDateState {
  const formatter = createTimezoneFormatter(timezone);

  if (!instant) {
    return { status: "absent" };
  }

  if (!declaresOffset(instant)) {
    return { status: "unreadable", reason: "missing-offset" };
  }

  try {
    return {
      status: "valid",
      localValue: formatDateTimeParts(formatter, parseOffsetInstant(instant)),
    };
  } catch {
    return { status: "unreadable", reason: "malformed-instant" };
  }
}

export function formatInstantForDateTimeLocal(
  instant: string | null | undefined,
  timezone: string,
): string {
  const formatter = createTimezoneFormatter(timezone);

  if (!instant) {
    return "";
  }

  const instantMilliseconds = parseOffsetInstant(instant);
  return formatDateTimeParts(formatter, instantMilliseconds);
}

export function localDateTimeToOffsetInstant(
  localValue: string | null | undefined,
  timezone: string,
): string | null {
  const formatter = createTimezoneFormatter(timezone);

  if (!localValue) {
    return null;
  }

  const requestedParts = parseLocalDateTime(localValue);
  const wallTimeMilliseconds = createUtcTimestamp(requestedParts);
  const matchingInstants: number[] = [];

  for (
    let minuteOffset = -SEARCH_WINDOW_MINUTES;
    minuteOffset <= SEARCH_WINDOW_MINUTES;
    minuteOffset += 1
  ) {
    const candidateMilliseconds = wallTimeMilliseconds
      + minuteOffset * MINUTE_IN_MILLISECONDS;
    const candidateParts = getDateTimeParts(formatter, candidateMilliseconds);

    if (dateTimePartsEqual(candidateParts, requestedParts)) {
      matchingInstants.push(candidateMilliseconds);

      if (matchingInstants.length > 1) {
        throw new Error(
          "Local date-time is ambiguous because it falls in a timezone overlap",
        );
      }
    }
  }

  const matchingInstant = matchingInstants[0];
  if (matchingInstant === undefined) {
    throw new Error(
      "Local date-time is nonexistent because it falls in a timezone gap",
    );
  }

  const utcOffsetMinutes = Math.round(
    (wallTimeMilliseconds - matchingInstant) / MINUTE_IN_MILLISECONDS,
  );

  return `${localValue}:00${formatUtcOffset(utcOffsetMinutes)}`;
}

/**
 * Whether the value even attempts to name an instant.
 *
 * A date-only value, a bare local date-time and a SQL-style timestamp all say
 * nothing about an offset, and the difference matters: those cannot be shown
 * without inventing one, whereas a value that declares an offset badly is
 * simply malformed. The search is confined to the time half so the `-` in a
 * date such as `2026-08-08` is never mistaken for an offset sign.
 */
function declaresOffset(value: string): boolean {
  const timeSeparatorIndex = value.indexOf("T");
  return timeSeparatorIndex >= 0
    && /[Z+-]/.test(value.slice(timeSeparatorIndex + 1));
}

function createTimezoneFormatter(timezone: string): Intl.DateTimeFormat {
  if (timezone !== "UTC" && !timezone.includes("/")) {
    throw new Error("Invalid IANA timezone");
  }

  try {
    return new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
      calendar: "iso8601",
      numberingSystem: "latn",
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    throw new Error("Invalid IANA timezone");
  }
}

function parseLocalDateTime(localValue: string): DateTimeParts {
  const match = LOCAL_DATE_TIME_PATTERN.exec(localValue);
  if (!match) {
    throw new Error("Invalid local date-time format");
  }

  const parts = matchToDateTimeParts(match);
  createUtcTimestamp(parts);
  return parts;
}

function parseOffsetInstant(instant: string): number {
  if (!EXPLICIT_OFFSET_PATTERN.test(instant)) {
    throw new Error("Instant requires an explicit UTC offset");
  }

  const match = OFFSET_INSTANT_PATTERN.exec(instant);
  if (!match) {
    throw new Error("Invalid offset-bearing instant format");
  }

  const parts = matchToDateTimeParts(match);
  const localMilliseconds = createUtcTimestamp(parts);

  // Seconds are discarded rather than carried, but an impossible seconds field
  // still means the whole instant is malformed and must not be shown.
  if (Number(match[6]) > 59) {
    throw new Error("Invalid offset-bearing instant");
  }

  const isUtc = match[7] === "Z";
  const offsetHours = isUtc ? 0 : Number(match[9]);
  const offsetMinutes = isUtc ? 0 : Number(match[10]);

  if (offsetHours > 23 || offsetMinutes > 59) {
    throw new Error("Invalid offset-bearing instant");
  }

  const offsetSign = isUtc ? 0 : match[8] === "+" ? 1 : -1;
  const totalOffsetMinutes = offsetSign * (offsetHours * 60 + offsetMinutes);
  const instantMilliseconds = localMilliseconds
    - totalOffsetMinutes * MINUTE_IN_MILLISECONDS;

  if (!Number.isFinite(new Date(instantMilliseconds).getTime())) {
    throw new Error("Invalid offset-bearing instant");
  }

  return instantMilliseconds;
}

function matchToDateTimeParts(match: RegExpExecArray): DateTimeParts {
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function createUtcTimestamp(parts: DateTimeParts): number {
  if (parts.year < 1) {
    throw new Error("Invalid Gregorian date-time value");
  }

  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, 0, 0);

  if (
    date.getUTCFullYear() !== parts.year
    || date.getUTCMonth() !== parts.month - 1
    || date.getUTCDate() !== parts.day
    || date.getUTCHours() !== parts.hour
    || date.getUTCMinutes() !== parts.minute
  ) {
    throw new Error("Invalid Gregorian date-time value");
  }

  return date.getTime();
}

function getDateTimeParts(
  formatter: Intl.DateTimeFormat,
  instantMilliseconds: number,
): DateTimeParts {
  const parts: DateTimeParts = {
    year: Number.NaN,
    month: Number.NaN,
    day: Number.NaN,
    hour: Number.NaN,
    minute: Number.NaN,
  };

  for (const part of formatter.formatToParts(new Date(instantMilliseconds))) {
    switch (part.type) {
      case "year":
      case "month":
      case "day":
      case "hour":
      case "minute":
        parts[part.type] = Number(part.value);
        break;
    }
  }

  if (Object.values(parts).some((value) => !Number.isInteger(value))) {
    throw new Error("Unable to format date-time in the requested timezone");
  }

  return parts;
}

function formatDateTimeParts(
  formatter: Intl.DateTimeFormat,
  instantMilliseconds: number,
): string {
  const parts = getDateTimeParts(formatter, instantMilliseconds);

  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`
    + `T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function dateTimePartsEqual(
  left: DateTimeParts,
  right: DateTimeParts,
): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${sign}${pad(hours)}:${pad(minutes)}`;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}
