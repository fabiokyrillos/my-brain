/**
 * `2M-CAL-008` — where the user was on the calendar when they opened an item.
 *
 * ## This is Phase 2L's contract, not a second one
 *
 * `2M-CAL-008` requires the return to use *"the return-continuity contract Phase
 * 2L shipped rather than a second one"*. The contract Phase 2L shipped is
 * `work-position.ts`, and it is a **mechanism** with four properties, not a data
 * shape:
 *
 *   1. the position travels **with the link, in the URL**, and nowhere else — no
 *      server state, no stored preference, no client cursor (`2L-RETURN-002`);
 *   2. it is a **versioned, `.strict()` payload** of navigation identifiers and
 *      closed vocabularies only;
 *   3. it **refuses rather than ignores** anything that could authorize, by name
 *      (`2L-RETURN-003`), reusing `POSITION_FORBIDDEN_FIELDS` rather than
 *      restating it; and
 *   4. it **fails to the declared default** rather than throwing, because a
 *      malformed return position is someone pressing Back.
 *
 * All four are reused here verbatim. What is *not* reused is `WorkPosition`'s
 * field list, and deliberately: a calendar position is not a Work query. Widening
 * `positionSchema` to carry an orientation and an anchor would put calendar state
 * inside the payload that describes a Work list, and every Work surface would
 * then have to ignore fields that mean nothing to it. Two vocabularies under one
 * mechanism is the honest shape; one vocabulary describing two surfaces is not.
 *
 * ## Why the version literal is the discriminator
 *
 * One `from` parameter serves both surfaces. A Work payload handed to this
 * parser fails at `v` and resolves to the calendar default; a calendar payload
 * handed to `parseWorkPosition` fails the same way and resolves to the Work
 * default. Neither can be coerced into the other, and neither throws — so a
 * stale or hand-made link lands somewhere sane instead of on an error page.
 */

import { z } from "zod";

import { POSITION_FORBIDDEN_FIELDS } from "@/features/operations/work-position";
import { formatLocalDate, parseLocalDate, type LocalDate } from "@/lib/time/local-day";

import {
  CALENDAR_LANES,
  CALENDAR_ORIENTATIONS,
  DEFAULT_CALENDAR_LANES,
  DEFAULT_ORIENTATION,
  calendarHref,
  type CalendarQuery,
} from "./calendar-query";

/** The version, so a payload from an older shape is refused rather than coerced. */
export const CALENDAR_POSITION_VERSION = "2026-08-11.1";

/**
 * Short keys because this travels in a URL — not to obscure it.
 *
 * `v` version, `o` orientation, `d` anchor date, `l` lanes. Every one is a
 * navigation identifier or a member of a closed vocabulary this module owns;
 * none is content, and none is a task, entry, reminder or entity id — a return
 * position that named a subject would be describing *what* the user was looking
 * at rather than *where*, and the subject is already in the path.
 */
const positionSchema = z
  .object({
    v: z.literal(CALENDAR_POSITION_VERSION),
    o: z.enum(CALENDAR_ORIENTATIONS),
    // `YYYY-MM-DD`, re-parsed through the calendar's own date contract below so
    // a syntactically valid but non-existent day cannot survive the parse.
    d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    l: z.array(z.enum(CALENDAR_LANES)).min(1).max(CALENDAR_LANES.length),
  })
  .strict();

export type CalendarPosition = z.infer<typeof positionSchema>;

/**
 * Re-exported so a reader of this file can see the refusal list without
 * following an import, and so the guard that asserts the two positions share one
 * list has a symbol to hold on to. It is the **same array**, never a copy.
 */
export { POSITION_FORBIDDEN_FIELDS };

export function toCalendarPosition(query: CalendarQuery): CalendarPosition {
  return {
    v: CALENDAR_POSITION_VERSION,
    o: query.orientation,
    d: formatLocalDate(query.anchor),
    l: [...query.lanes],
  };
}

export function serializeCalendarPosition(query: CalendarQuery): string {
  return Buffer.from(JSON.stringify(toCalendarPosition(query)), "utf8").toString("base64url");
}

/**
 * The declared default this parser falls back to.
 *
 * `today` is a parameter rather than a constant because "the calendar's default
 * position" is *today in the user's zone*, and `2M-TIME-003` makes the profile's
 * zone the only answer to which day that is. A module-level default would be the
 * host's today, which is wrong for eleven hours a day in São Paulo.
 */
export function defaultCalendarQuery(today: LocalDate): CalendarQuery {
  return { orientation: DEFAULT_ORIENTATION, anchor: today, lanes: DEFAULT_CALENDAR_LANES };
}

/**
 * Parses an untrusted string from a URL, or answers `null`.
 *
 * `null` rather than the default, because the caller has to be able to tell
 * *"this is a calendar return"* from *"this is not"* — a Work payload must not
 * silently become a calendar position pointing at today. The caller substitutes
 * its own default only after it has decided the surface.
 */
export function parseCalendarPosition(value: string | string[] | undefined): CalendarQuery | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsed = positionSchema.safeParse(decoded);
    if (!parsed.success) return null;
    const anchor = parseLocalDate(parsed.data.d);
    // A day that does not exist — `2026-02-30` — passes the regex and fails
    // here. The whole position is refused rather than repaired, because a
    // repaired anchor is a date the user never chose.
    if (!anchor) return null;
    return {
      orientation: parsed.data.o,
      anchor,
      // Re-ordered into the declared order so two payloads naming the same lanes
      // produce the same href, exactly as `parseLanes` does for the URL.
      lanes: CALENDAR_LANES.filter((lane) => parsed.data.l.includes(lane)),
    };
  } catch {
    return null;
  }
}

/** The href a parsed calendar return resolves to. */
export function calendarReturnHref(locale: string, query: CalendarQuery): string {
  return calendarHref(locale, query);
}
