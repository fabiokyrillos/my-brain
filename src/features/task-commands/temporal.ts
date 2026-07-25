import { resolveLocal, type WallTime } from "../../../supabase/functions/_shared/extraction-normalization";
import { TASK_COMMAND_POLICY_VERSION } from "./taxonomy";

/**
 * Deterministic resolution of a relative temporal phrase to an instant.
 *
 * PRD 2E-COMMAND-014/015/016. The model may report the phrase it saw; it never
 * produces the instant. During the Phase 2E Gate 1 cutover the production model
 * was measured returning bare, timezone-less dates for three of five deadlines,
 * which is exactly the output that must not reach a `timestamptz` column
 * unexamined — PostgreSQL would coerce `2026-07-27` to midnight UTC, which is
 * the previous evening for a Sao Paulo user.
 *
 * The local-wall-time-to-instant conversion is `resolveLocal` from the shared
 * worker module: one implementation, already proven against DST gaps,
 * non-calendar dates and unknown zones, rather than a second copy here.
 *
 * Everything outside the declared lexicon is `unsupported`, which the command
 * layer turns into a bounded clarification. Nothing is guessed.
 */

/**
 * The lexicon versions under the policy version rather than beside it.
 *
 * 2E-COMMAND-014 says the lexicon is versioned *under* §10.4's policy version,
 * and a second free-form constant is not that: two literals that merely happen
 * to read the same string can drift silently, and a review demonstrated exactly
 * that by moving one and watching every test still pass. One constant cannot
 * drift from itself.
 */
export const TEMPORAL_LEXICON_VERSION = TASK_COMMAND_POLICY_VERSION;

/**
 * A deadline stated as a day means the end of that day — the convention the
 * production model itself uses whenever it emits an offset at all.
 */
const END_OF_DAY = { hour: 23, minute: 59, second: 59 } as const;
const TIMES_OF_DAY = {
  morning: { hour: 9, minute: 0, second: 0 },
  afternoon: { hour: 14, minute: 0, second: 0 },
  evening: { hour: 20, minute: 0, second: 0 },
} as const;

/**
 * Guards against a typo becoming a date centuries away.
 *
 * Applied to explicit calendar dates as well as to relative offsets: an
 * explicit date is the *more* likely shape to carry a transcription typo, and
 * `tasks.due_at` is an unbounded `timestamptz`, so `9999-12-31` would persist
 * in silence. Symmetric, because back-dating an overdue item is legitimate.
 */
const MAX_RELATIVE_DAYS = 730;

export type TemporalResolution =
  | { status: "resolved"; instant: string; phrase: string }
  | { status: "unsupported"; phrase: string };

export type TemporalContext = {
  /**
   * Explicitly injected; this module never reads the ambient clock.
   *
   * A string must carry a timezone designator. Without one, `new Date(…)`
   * parses it in the *host's* zone, so the same command resolved on a machine
   * in Honolulu and one in UTC lands a full day apart — which is not the
   * "explicitly injected current instant" 2E-COMMAND-014 requires.
   */
  now: string | Date;
  timeZone: string;
  // No `locale`. Both lexicons are searched unconditionally — accepting a
  // Portuguese phrase in an English session is harmless, while inventing
  // meaning is not — so a locale field here would be a parameter no code reads.
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Weekday index by name, Monday-first.
 *
 * The week starts on Monday. That is the declared convention: the product is
 * Portuguese-first, and "fim da semana" reads as the weekend closing the
 * current week rather than as Saturday opening the next one.
 */
const WEEKDAYS: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
  segunda: 0, terca: 1, quarta: 2, quinta: 3, sexta: 4, sabado: 5, domingo: 6,
};

/** Accent folding plus punctuation collapse, so "amanhã" and "amanha" agree. */
function normalizePhrase(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The caller's local calendar day for `instant`, as a wall time at midnight. */
function localDayOf(instant: Date, timeZone: string): WallTime | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
  } catch {
    return null; // Unknown IANA identifier — never fall back to UTC.
  }
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (![year, month, day].every(Number.isFinite)) return null;
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

/** Day-of-week for a calendar date, Monday = 0. */
function weekdayIndex(day: WallTime): number {
  const utc = new Date(Date.UTC(2000, day.month - 1, day.day));
  utc.setUTCFullYear(day.year);
  return (utc.getUTCDay() + 6) % 7;
}

function addDays(day: WallTime, days: number): WallTime {
  const utc = new Date(Date.UTC(2000, day.month - 1, day.day));
  utc.setUTCFullYear(day.year);
  utc.setUTCDate(utc.getUTCDate() + days);
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

/** Whole days from `from` to `to`, positive when `to` is later. */
function daysBetween(from: WallTime, to: WallTime): number {
  const start = new Date(Date.UTC(2000, from.month - 1, from.day));
  start.setUTCFullYear(from.year);
  const end = new Date(Date.UTC(2000, to.month - 1, to.day));
  end.setUTCFullYear(to.year);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * The last calendar day of `day`'s month.
 *
 * Built from the first of the *following* month and stepped back, because
 * setting the year on a February base is a trap: `Date.UTC(2000, 2, 0)` is
 * 2000-02-29, and `setUTCFullYear(2026)` on a 29 February rolls forward to
 * 1 March, so the previous implementation returned **1 February** for "end of
 * the month" in every non-leap year — a due date up to 27 days in the past,
 * reported as `resolved`.
 */
function lastDayOfMonth(day: WallTime): WallTime {
  const firstOfNext = new Date(Date.UTC(2000, day.month % 12, 1));
  firstOfNext.setUTCFullYear(day.month === 12 ? day.year + 1 : day.year);
  firstOfNext.setUTCDate(0);
  return {
    year: firstOfNext.getUTCFullYear(),
    month: firstOfNext.getUTCMonth() + 1,
    day: firstOfNext.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

type DayRule = {
  day: WallTime;
  time: { hour: number; minute: number; second: number };
  /**
   * True for a phrase naming an hour but no day. "de manhã" said at 20:00 does
   * not mean 09:00 this morning, and does not certainly mean tomorrow either —
   * 2E-COMMAND-016 makes that a clarification rather than a guess.
   */
  ambiguousIfPast?: boolean;
};

/**
 * The declared lexicon (2E-COMMAND-014).
 *
 * An array rather than a chain of anonymous conditionals, so the supported
 * phrases can be enumerated — by a closure test, by the clarification copy that
 * has to tell the user what *is* accepted, and by documentation. Every entry
 * states its resolution rule, and both locales are searched: accepting a
 * Portuguese phrase from an English session is harmless, while inventing
 * meaning is not.
 */
export type TemporalLexiconEntry = {
  readonly id: string;
  /** The rule, in prose, as 2E-COMMAND-014 requires each entry to state. */
  readonly rule: string;
  readonly pattern: RegExp;
  readonly resolve: (today: WallTime, match: RegExpExecArray) => WallTime | null;
};

export const TEMPORAL_LEXICON: readonly TemporalLexiconEntry[] = [
  {
    id: "today",
    rule: "The caller's current local day.",
    pattern: /^(today|hoje)$/,
    resolve: (today) => today,
  },
  {
    id: "tomorrow",
    rule: "The day after the caller's current local day.",
    pattern: /^(tomorrow|amanha)$/,
    resolve: (today) => addDays(today, 1),
  },
  {
    id: "day_after_tomorrow",
    rule: "Two days after the caller's current local day.",
    pattern: /^(day after tomorrow|depois de amanha|depois amanha)$/,
    resolve: (today) => addDays(today, 2),
  },
  {
    id: "next_week",
    rule: "Monday of the week following the current one. The week starts on Monday.",
    pattern: /^(next week|proxima semana|semana que vem)$/,
    resolve: (today) => addDays(today, 7 - weekdayIndex(today)),
  },
  {
    id: "next_month",
    rule: "The first day of the following month. The day of the month is not preserved.",
    pattern: /^(next month|proximo mes|mes que vem)$/,
    resolve: (today) => addDays(lastDayOfMonth(today), 1),
  },
  {
    id: "end_of_month",
    rule: "The last calendar day of the current month.",
    pattern: /^(end of (the )?month|fim do mes|final do mes)$/,
    resolve: (today) => lastDayOfMonth(today),
  },
  {
    id: "end_of_week",
    rule: "The Sunday closing the current week. On a Sunday, that is today.",
    pattern: /^(end of (the )?week|fim da semana|final da semana)$/,
    resolve: (today) => addDays(today, 6 - weekdayIndex(today)),
  },
  {
    id: "relative_offset",
    rule: `N days or weeks after the current local day, bounded to ${MAX_RELATIVE_DAYS} days.`,
    // The leading "in"/"em" may already have been trimmed as a connector (it is
    // one in "in the morning"), so it is optional here.
    pattern: /^(?:(?:in|em) )?(\d{1,6}) (days?|dias?|weeks?|semanas?)$/,
    resolve: (today, match) => {
      const count = Number(match[1]);
      const days = /week|semana/.test(match[2]) ? count * 7 : count;
      if (!Number.isFinite(days) || days > MAX_RELATIVE_DAYS) return null;
      return addDays(today, days);
    },
  },
  {
    id: "weekday",
    rule:
      "A bare weekday is its next occurrence strictly in the future; \"next <weekday>\" "
      + "is that weekday in the week after the current one. A leading \"this\"/\"esta\" is "
      + "refused as ambiguous rather than silently dropped.",
    pattern: /^(next |proxima |proximo )?([a-z]+?)(?: feira)?$/,
    resolve: (today, match) => {
      const index = WEEKDAYS[match[2]];
      if (index === undefined) return null;
      const current = weekdayIndex(today);
      let delta = (index - current + 7) % 7;
      if (delta === 0) delta = 7;
      if (match[1]) {
        // "next <weekday>" is that weekday in the week after the current one,
        // which is a week beyond the next occurrence unless the next occurrence
        // already falls in the following week.
        const mondayOfNextWeek = 7 - current;
        if (delta < mondayOfNextWeek) delta += 7;
      }
      return addDays(today, delta);
    },
  },
  {
    id: "explicit_date",
    rule: `An ISO calendar date, bounded to ±${MAX_RELATIVE_DAYS} days around the current local day.`,
    pattern: ISO_DATE,
    resolve: (today, match) => {
      const day: WallTime = {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: 0,
        minute: 0,
        second: 0,
      };
      if (Math.abs(daysBetween(today, day)) > MAX_RELATIVE_DAYS) return null;
      return day;
    },
  },
];

/**
 * Connectors that exist only to attach a time-of-day word ("amanha DE manha",
 * "hoje A noite"). Trimmed from the ends rather than globally, because
 * "fim DO mes" needs its middle intact.
 *
 * Kept symmetric across the two languages: the list once held `esta/neste/nesta`
 * but not `este`, and since `sabado` and `domingo` are the two masculine
 * weekdays, the lexicon was split by grammatical gender.
 */
const CONNECTORS =
  /^(de|da|do|a|ao|as|no|na|em|para|pra|ate|at|in|on|the|this|esta|este|neste|nesta|pela|pelo)$/;

/** A determiner naming a week rather than an occurrence — ambiguous by itself. */
const WEEK_DETERMINERS = /^(this|esta|este|neste|nesta)$/;

function interpret(phrase: string, today: WallTime): DayRule | null {
  const time = (() => {
    if (/\b(morning|manha)\b/.test(phrase)) return TIMES_OF_DAY.morning;
    if (/\b(afternoon|tarde)\b/.test(phrase)) return TIMES_OF_DAY.afternoon;
    if (/\b(tonight|evening|noite)\b/.test(phrase)) return TIMES_OF_DAY.evening;
    return END_OF_DAY;
  })();

  let tokens = phrase
    .replace(/\b(tonight|morning|manha|afternoon|tarde|evening|noite)\b/g, " ")
    .split(/\s+/)
    .filter((token) => token !== "");

  // "this friday" said on a Saturday names a different week from "friday", so
  // dropping the determiner would answer a question the user did not ask.
  if (tokens.length === 2 && WEEK_DETERMINERS.test(tokens[0]) && WEEKDAYS[tokens[1]] !== undefined) {
    return null;
  }

  while (tokens.length > 0 && CONNECTORS.test(tokens[0])) tokens = tokens.slice(1);
  while (tokens.length > 0 && CONNECTORS.test(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1);
  const bare = tokens.join(" ");

  // "tonight" and a bare "this evening" name today at that hour.
  if (bare === "" && time !== END_OF_DAY) return { day: today, time, ambiguousIfPast: true };

  for (const entry of TEMPORAL_LEXICON) {
    const match = entry.pattern.exec(entry.id === "explicit_date" ? bare.replace(/ /g, "-") : bare);
    if (!match) continue;
    const day = entry.resolve(today, match);
    if (day === null) {
      // A family entry that matched the shape but not the rule (an offset past
      // the bound, an unknown weekday) must not fall through to a later entry
      // that would read the same tokens differently.
      return entry.id === "weekday" ? null : null;
    }
    return { day, time };
  }

  return null;
}

export function resolveTemporalPhrase(phrase: string, context: TemporalContext): TemporalResolution {
  const raw = typeof phrase === "string" ? phrase.trim() : "";
  if (raw === "") return { status: "unsupported", phrase: raw };

  // A complete instant is refused rather than trusted. 2E-COMMAND-016 says the
  // instant is never model-supplied, and the previous fast path returned the
  // caller's string before `resolveLocal` ever saw it — so `2026-13-45T99:99Z`
  // and `2026-02-30T12:00:00Z` were both reported `resolved`, and a model that
  // ignored the prompt could pin a Sao Paulo user to a Tokyo offset. The
  // lexicon owns resolution; a raw timestamp is a clarification.
  if (ISO_INSTANT.test(raw)) return { status: "unsupported", phrase: raw };

  const now = context.now instanceof Date
    ? context.now
    // A designator-less string is parsed in the host's zone, which would make
    // the same command resolve differently on different machines.
    : ISO_INSTANT.test(context.now) ? new Date(context.now) : new Date(Number.NaN);
  if (Number.isNaN(now.getTime())) return { status: "unsupported", phrase: raw };

  const today = localDayOf(now, context.timeZone);
  if (today === null) return { status: "unsupported", phrase: raw };

  const rule = interpret(normalizePhrase(raw), today);
  if (rule === null) return { status: "unsupported", phrase: raw };

  const instant = resolveLocal({ ...rule.day, ...rule.time }, context.timeZone);
  // resolveLocal returns null for a non-calendar date, a wall time that does
  // not exist in the zone, and an unknown zone — all fail closed here.
  if (instant === null) return { status: "unsupported", phrase: raw };

  if (rule.ambiguousIfPast && Date.parse(instant) <= now.getTime()) {
    return { status: "unsupported", phrase: raw };
  }

  return { status: "resolved", instant, phrase: raw };
}
