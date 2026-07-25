import { resolveLocal, type WallTime } from "../../../supabase/functions/_shared/extraction-normalization";

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

/** Bumped whenever a phrase, its resolution rule, or the week convention changes. */
export const TEMPORAL_LEXICON_VERSION = "2026-07-25.1";

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

/** Guards against a typo becoming a date centuries away. */
const MAX_RELATIVE_DAYS = 730;

export type TemporalResolution =
  | { status: "resolved"; instant: string; phrase: string }
  | { status: "unsupported"; phrase: string };

export type TemporalContext = {
  /** Explicitly injected; this module never reads the ambient clock. */
  now: string | Date;
  timeZone: string;
  locale: "pt-BR" | "en";
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

function lastDayOfMonth(day: WallTime): WallTime {
  const utc = new Date(Date.UTC(2000, day.month, 0));
  utc.setUTCFullYear(day.year);
  // Date.UTC(y, month, 0) is the last day of `month` when month is 1-based.
  const end = new Date(Date.UTC(2000, day.month, 0));
  end.setUTCFullYear(day.year);
  return { year: day.year, month: day.month, day: end.getUTCDate(), hour: 0, minute: 0, second: 0 };
}

type DayRule = { day: WallTime; time: { hour: number; minute: number; second: number } };

/**
 * The declared lexicon. Both locales are searched: accepting a Portuguese
 * phrase from an English session is harmless, while inventing meaning is not.
 */
function interpret(phrase: string, today: WallTime): DayRule | null {
  const time = (() => {
    if (/\b(morning|manha)\b/.test(phrase)) return TIMES_OF_DAY.morning;
    if (/\b(afternoon|tarde)\b/.test(phrase)) return TIMES_OF_DAY.afternoon;
    if (/\b(tonight|evening|noite)\b/.test(phrase)) return TIMES_OF_DAY.evening;
    return END_OF_DAY;
  })();
  // Only the time-of-day words are removed, plus the connectors that exist
  // solely to attach them ("amanha DE manha", "hoje A noite"). Connectors are
  // trimmed from the ends rather than globally, because "fim DO mes" needs its
  // middle intact.
  const CONNECTORS = /^(de|da|do|a|at|in|on|the|this|esta|neste|nesta|pela|pelo)$/;
  let tokens = phrase
    .replace(/\b(tonight|morning|manha|afternoon|tarde|evening|noite)\b/g, " ")
    .split(/\s+/)
    .filter((token) => token !== "");
  while (tokens.length > 0 && CONNECTORS.test(tokens[0])) tokens = tokens.slice(1);
  while (tokens.length > 0 && CONNECTORS.test(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1);
  const bare = tokens.join(" ");

  // "tonight" and a bare "this evening" name today at that hour.
  if (bare === "" && time !== END_OF_DAY) return { day: today, time };
  if (/^(today|hoje)$/.test(bare)) return { day: today, time };
  if (/^(tomorrow|amanha)$/.test(bare)) return { day: addDays(today, 1), time };
  if (/^(day after tomorrow|depois de amanha|depois amanha)$/.test(bare)) {
    return { day: addDays(today, 2), time };
  }
  if (/^(next week|proxima semana|semana que vem)$/.test(bare)) {
    // Monday of the following week.
    return { day: addDays(today, 7 - weekdayIndex(today)), time };
  }
  if (/^(next month|proximo mes|mes que vem)$/.test(bare)) {
    const first = { ...today, day: 1 };
    const nextMonth = addDays(lastDayOfMonth(first), 1);
    return { day: nextMonth, time };
  }
  if (/^(end of (the )?month|fim do mes|final do mes)$/.test(bare)) {
    return { day: lastDayOfMonth(today), time };
  }
  if (/^(end of (the )?week|fim da semana|final da semana)$/.test(bare)) {
    // Sunday closing the current week.
    return { day: addDays(today, 6 - weekdayIndex(today)), time };
  }

  // The leading "in"/"em" may already have been trimmed as a connector (it is
  // one in "in the morning"), so it is optional here.
  const relative = /^(?:(?:in|em) )?(\d{1,6}) (days?|dias?|weeks?|semanas?)$/.exec(bare);
  if (relative) {
    const count = Number(relative[1]);
    const days = /week|semana/.test(relative[2]) ? count * 7 : count;
    if (!Number.isFinite(days) || days > MAX_RELATIVE_DAYS) return null;
    return { day: addDays(today, days), time };
  }

  const weekday = /^(next |proxima |proximo )?([a-z]+?)(?: feira)?$/.exec(bare);
  if (weekday) {
    const index = WEEKDAYS[weekday[2]];
    if (index !== undefined) {
      const current = weekdayIndex(today);
      // A bare weekday is the next occurrence strictly in the future, so
      // "saturday" on a Saturday means the one a week away, not today.
      let delta = (index - current + 7) % 7;
      if (delta === 0) delta = 7;
      if (weekday[1]) {
        // "next <weekday>" is that weekday in the week after the current one,
        // which is a week beyond the next occurrence unless the next occurrence
        // already falls in the following week.
        const mondayOfNextWeek = 7 - current;
        if (delta < mondayOfNextWeek) delta += 7;
      }
      return { day: addDays(today, delta), time };
    }
  }

  const explicit = ISO_DATE.exec(bare.replace(/ /g, "-"));
  if (explicit) {
    return {
      day: {
        year: Number(explicit[1]),
        month: Number(explicit[2]),
        day: Number(explicit[3]),
        hour: 0,
        minute: 0,
        second: 0,
      },
      time,
    };
  }

  return null;
}

export function resolveTemporalPhrase(phrase: string, context: TemporalContext): TemporalResolution {
  const raw = typeof phrase === "string" ? phrase.trim() : "";
  if (raw === "") return { status: "unsupported", phrase: raw };

  // An already-complete instant is the caller's own precision; keep it.
  if (ISO_INSTANT.test(raw)) return { status: "resolved", instant: raw, phrase: raw };

  const now = context.now instanceof Date ? context.now : new Date(context.now);
  if (Number.isNaN(now.getTime())) return { status: "unsupported", phrase: raw };

  const today = localDayOf(now, context.timeZone);
  if (today === null) return { status: "unsupported", phrase: raw };

  const rule = interpret(normalizePhrase(raw), today);
  if (rule === null) return { status: "unsupported", phrase: raw };

  const instant = resolveLocal({ ...rule.day, ...rule.time }, context.timeZone);
  // resolveLocal returns null for a non-calendar date, a wall time that does
  // not exist in the zone, and an unknown zone — all fail closed here.
  if (instant === null) return { status: "unsupported", phrase: raw };

  return { status: "resolved", instant, phrase: raw };
}
