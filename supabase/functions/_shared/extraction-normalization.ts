// Deterministic widening of the two instant fields the provider is free to
// under-specify, applied between `JSON.parse` and `validateExtraction`.
//
// The response schema handed to the provider declares `occurredAt` and `dueAt`
// as bare strings, and OpenAI Structured Outputs does not enforce JSON Schema
// `format`, so nothing at the provider boundary makes a timezone designator
// mandatory. Sampling the production model with the production prompt returned
// a bare `"2026-07-27"` for three of five non-null deadlines. Those entries
// failed permanently: a deterministic prompt reproduces the same output, so
// every retry spends the budget on an error retrying cannot fix.
//
// A bare local date, or a local date-time with no designator, is unambiguous
// once the IANA timezone is known — the same timezone the prompt already
// supplies to the model. Resolving it here is deterministic application logic,
// not a second interpretation of the entry. Everything else is returned
// untouched so `validateExtraction` still rejects it: this widens exactly two
// shapes and rescues nothing that is genuinely malformed.
//
// The prompt now also states the required format explicitly (see
// EXTRACTION_PROMPT_VERSION), so this is the second line of defence rather
// than the only one.

/** `2026-07-27` — a local calendar day with no time and no designator. */
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-07-27T14:30` / `…T14:30:00` — a local wall time with no designator. */
const LOCAL_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, "0");
}

/**
 * The wall-clock fields treated as if they were UTC.
 *
 * Built through `setUTCFullYear` because `Date.UTC` maps years 0–99 to
 * 1900+year, which would silently relocate an instant the source-of-truth
 * schema accepts. A day that does not exist in the target year (`2026-02-29`)
 * rolls over here and is caught by the round-trip check in `resolveLocal`.
 */
function asIfUtc(wall: WallTime): Date {
  const date = new Date(
    Date.UTC(2000, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second),
  );
  date.setUTCFullYear(wall.year);
  return date;
}

/**
 * Minutes east of UTC observed in `timeZone` at `instant`, or null when the
 * zone identifier is not one the runtime knows.
 */
function offsetMinutesAt(timeZone: string, instant: Date): number | null {
  let name: string | undefined;
  try {
    name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value;
  } catch {
    return null; // Unknown IANA identifier — never fall back to UTC.
  }
  if (name === undefined) return null;
  if (name === "GMT" || name === "UTC") return 0;
  const match = /^(?:GMT|UTC)([+-])(\d{2}):(\d{2})$/.exec(name);
  if (!match) return null;
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -magnitude : magnitude;
}

/** The wall-clock fields `instant` actually shows in `timeZone`. */
function wallTimeIn(timeZone: string, instant: Date): WallTime | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      era: "short",
    }).formatToParts(instant);
  } catch {
    return null;
  }
  const read = (type: string) => parts.find((part) => part.type === type)?.value;
  const era = read("era");
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const hour = Number(read("hour"));
  const minute = Number(read("minute"));
  const second = Number(read("second"));
  if ([year, month, day, hour, minute, second].some((value) => !Number.isFinite(value))) {
    return null;
  }
  // A BC year formats as a positive number, which would compare equal to the
  // AD year of the same magnitude.
  if (era !== undefined && era !== "AD") return null;
  return { year, month, day, hour, minute, second };
}

function sameWallTime(left: WallTime, right: WallTime): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
    && left.hour === right.hour && left.minute === right.minute && left.second === right.second;
}

function formatOffset(minutes: number): string {
  if (minutes === 0) return "Z";
  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${pad(Math.trunc(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

/**
 * The instant a wall time denotes in `timeZone`, rendered with that zone's
 * offset — or null when the wall time does not exist there.
 *
 * The offset is what the answer depends on and what the answer determines, so
 * it is resolved in two passes and then verified: a first guess dated from the
 * wall time read as UTC, a correction using the offset actually in force at the
 * resulting instant, and a formatting round-trip that must reproduce the
 * requested wall time exactly. The round-trip is what rejects a
 * spring-forward gap (`02:15` on a day the clock jumps `02:00`→`02:30`) and a
 * non-calendar date (`2026-02-30`) without either being special-cased —
 * inventing an instant for those would move a deadline silently.
 */
function resolveLocal(wall: WallTime, timeZone: string): string | null {
  const asUtc = asIfUtc(wall);
  if (Number.isNaN(asUtc.getTime())) return null;

  const firstGuess = offsetMinutesAt(timeZone, asUtc);
  if (firstGuess === null) return null;
  let offset = firstGuess;
  let instant = new Date(asUtc.getTime() - offset * 60_000);

  const corrected = offsetMinutesAt(timeZone, instant);
  if (corrected === null) return null;
  if (corrected !== offset) {
    offset = corrected;
    instant = new Date(asUtc.getTime() - offset * 60_000);
  }

  const observed = wallTimeIn(timeZone, instant);
  if (observed === null || !sameWallTime(observed, wall)) return null;

  const finalOffset = offsetMinutesAt(timeZone, instant);
  if (finalOffset === null || finalOffset !== offset) return null;

  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`
    + `T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`
    + formatOffset(offset);
}

/**
 * `value` widened to an instant when it is one of the two under-specified
 * shapes, otherwise `value` unchanged.
 *
 * `endOfDay` distinguishes the two fields: a deadline written as a day means
 * the end of that day — the convention the model itself uses whenever it does
 * emit a designator (`2026-07-26T23:59:59-03:00`) — while an occurrence
 * written as a day means the day began.
 */
function normalizeInstant(value: unknown, timeZone: string, endOfDay: boolean): unknown {
  if (typeof value !== "string") return value;

  const bareDate = BARE_DATE.exec(value);
  if (bareDate) {
    const resolved = resolveLocal({
      year: Number(bareDate[1]),
      month: Number(bareDate[2]),
      day: Number(bareDate[3]),
      hour: endOfDay ? 23 : 0,
      minute: endOfDay ? 59 : 0,
      second: endOfDay ? 59 : 0,
    }, timeZone);
    return resolved ?? value;
  }

  const localDateTime = LOCAL_DATETIME.exec(value);
  if (localDateTime) {
    const resolved = resolveLocal({
      year: Number(localDateTime[1]),
      month: Number(localDateTime[2]),
      day: Number(localDateTime[3]),
      hour: Number(localDateTime[4]),
      minute: Number(localDateTime[5]),
      second: localDateTime[6] === undefined ? 0 : Number(localDateTime[6]),
    }, timeZone);
    return resolved ?? value;
  }

  return value;
}

/**
 * A copy of the parsed extraction with `occurredAt` and every
 * `taskCandidates[].dueAt` widened to instants where they were under-specified.
 *
 * Total and non-mutating: any input shape is accepted and anything unrecognised
 * is passed through for `validateExtraction` to reject.
 */
export function normalizeExtractionInstants(input: unknown, timeZone: string): unknown {
  if (!isPlainObject(input)) return input;

  const output: Record<string, unknown> = { ...input };

  if ("occurredAt" in output) {
    output.occurredAt = normalizeInstant(output.occurredAt, timeZone, false);
  }

  if (Array.isArray(output.taskCandidates)) {
    output.taskCandidates = output.taskCandidates.map((candidate) => {
      if (!isPlainObject(candidate) || !("dueAt" in candidate)) return candidate;
      return { ...candidate, dueAt: normalizeInstant(candidate.dueAt, timeZone, true) };
    });
  }

  return output;
}
