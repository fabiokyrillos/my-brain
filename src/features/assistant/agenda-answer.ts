import "server-only";

/**
 * Life Brain B.1 (`LB-B-005`) — an agenda question, answered from the calendar
 * projection with **no model call**.
 *
 * ## One reading, not a second calendar
 *
 * The answer is `loadCalendarProjection` said in sentences. The lanes, the open
 * statuses, the owner-scoped reads, the per-lane failure isolation and the
 * derived sensitivity are all the projection's; this module chooses the window,
 * keeps three lanes and phrases what came back. A second query here would be a
 * second calendar that could disagree with the Agenda the owner opens next.
 *
 * ## What it reads, and what it cites
 *
 * Deadlines, intentions and reminders. Reviews are not things to do, and an
 * unconfirmed suggestion is the Brain's guess, so neither belongs in "o que
 * tenho amanhã". Every **task** is cited by the id the projection read under
 * the owner's session, so the answer can only cite rows that exist. A
 * **reminder** is said and not cited: `reminder` is not in the citation
 * vocabulary until B.2 (`LB-B-006`) decides it — see `AGENDA_REACH`.
 *
 * ## Sensitivity
 *
 * The calendar's rule, through `resolveCalendarContent`: a highly sensitive
 * title is withheld **in position** — the line stays, with its time and kind,
 * so the count is honest and the day does not look emptier than it is. The
 * persisted answer therefore never contains a title the Agenda would mask, and
 * `citations` carries references only (`2K-PRIVACY-003`).
 */

import { loadCalendarProjection, requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import type { CalendarItemView, CalendarProjection } from "@/features/calendar/calendar-contracts";
import type { CalendarQuery } from "@/features/calendar/calendar-query";
import {
  AGENDA_REACH,
  buildCitationsEnvelope,
  supportKindForSource,
  type CitationsEnvelope,
  type PersistedSourceReference,
} from "@/features/conversation-sources/contracts";
import { resolveCalendarContent } from "@/features/sensitivity/task-derivation";
import type { Locale } from "@/lib/preferences";
import type { createClient } from "@/lib/supabase/server";
import { formatInstant } from "@/lib/time/instant-format";
import {
  addLocalDays,
  addLocalMonths,
  daysInLocalMonth,
  localDateOf,
  parseLocalDate,
  startOfLocalMonth,
  type LocalDate,
} from "@/lib/time/local-day";

import { getAgendaCopy, type AgendaLane, type AgendaPeriodPhrase } from "./agenda-copy";
import type { AgendaSpan } from "./agenda-intent";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const AGENDA_LANES: readonly AgendaLane[] = ["deadline", "intention", "reminder"];

/** Lines listed before the answer points at the Agenda for the rest. */
const MAX_LISTED_ITEMS = 15;

/** The envelope's own bound (`referenceSchema` … `.max(20)`). */
const MAX_CITED_TASKS = 20;

export type AgendaAnswer = {
  readonly content: string;
  readonly citations: CitationsEnvelope;
  readonly citedSourceIds: readonly string[];
};

/**
 * The window a span names, as the calendar's own query.
 *
 * `day_of_month` is the next date carrying that day, today included: "dia 12"
 * asked on the 31st is next month's 12th, and "dia 31" asked in a 30-day month
 * is the next month that has one. Two months ahead always has a 31st, so the
 * search is bounded and always lands.
 */
export function agendaQueryFor(span: AgendaSpan, today: LocalDate): CalendarQuery {
  const lanes = [...AGENDA_LANES];
  switch (span.kind) {
    case "day":
      return { orientation: "day", anchor: addLocalDays(today, span.offset), lanes };
    case "week":
      return { orientation: "week", anchor: addLocalDays(today, 7 * span.offset), lanes };
    case "month":
      return { orientation: "month", anchor: addLocalMonths(today, span.offset), lanes };
    case "day_of_month": {
      if (span.day >= today.day && span.day <= daysInLocalMonth(today)) {
        return { orientation: "day", anchor: { ...today, day: span.day }, lanes };
      }
      for (let ahead = 1; ahead <= 2; ahead += 1) {
        const month = addLocalMonths(startOfLocalMonth(today), ahead);
        if (span.day <= daysInLocalMonth(month)) {
          return { orientation: "day", anchor: { ...month, day: span.day }, lanes };
        }
      }
      throw new Error(`no month ahead has day ${span.day}`);
    }
  }
}

/**
 * A wall-clock date as a label, formatted at UTC noon in `UTC` — the same
 * reasoning as `calendar-view.tsx`'s `formatDayLabel`: the projection already
 * fixed which local day each item belongs to, so no zone decision is left and a
 * real zone could only round the label onto the wrong day.
 */
function formatLocalDateLabel(date: LocalDate, locale: Locale, options: Intl.DateTimeFormatOptions): string {
  const instant = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(instant);
}

function periodPhrase(span: AgendaSpan, rangeStart: LocalDate, locale: Locale): AgendaPeriodPhrase {
  const periods = getAgendaCopy(locale).periods;
  switch (span.kind) {
    case "day":
      return periods.day[span.offset];
    case "week":
      return periods.week[span.offset];
    case "month":
      return periods.month[span.offset];
    case "day_of_month":
      return periods.dayOfMonth(formatLocalDateLabel(rangeStart, locale, { day: "numeric", month: "long" }));
  }
}

function isAgendaLane(lane: string): lane is AgendaLane {
  return (AGENDA_LANES as readonly string[]).includes(lane);
}

/** `deadline:<uuid>` / `intention:<uuid>` → the task's id; anything else → `null`. */
function taskIdOf(item: CalendarItemView): string | null {
  if (item.lane !== "deadline" && item.lane !== "intention") return null;
  const [, id] = item.id.split(":");
  return id ?? null;
}

export function composeAgendaAnswer(input: {
  readonly span: AgendaSpan;
  readonly projection: CalendarProjection;
  readonly locale: Locale;
}): AgendaAnswer {
  const { span, projection, locale } = input;
  const copy = getAgendaCopy(locale);

  const failed = AGENDA_LANES.filter((lane) => projection.failedLanes.some((failure) => failure.lane === lane));
  if (failed.length === AGENDA_LANES.length) {
    // `2M-CAL-011`: a day nobody could read is reported, never answered as empty.
    throw new Error("the agenda could not be read");
  }

  // A month grid pads to whole weeks; the padding is not the month asked for.
  const days = projection.days.filter((day) => day.inPeriod);
  const items = days.flatMap((day) => day.items.filter((item) => isAgendaLane(item.lane)));
  const period = periodPhrase(span, projection.rangeStart, locale);
  const partial = failed.length === 0 ? null : copy.partial(copy.joinLanes(failed.map((lane) => copy.laneNames[lane])));

  const lines: string[] = [];
  if (items.length === 0) {
    lines.push(partial ?? copy.empty(period.after));
  } else {
    lines.push(copy.found(period.lead, items.length));
    const groupByDay = span.kind === "week" || span.kind === "month";
    let listed = 0;
    let masked = false;
    for (const day of days) {
      const dayItems = day.items.filter((item) => isAgendaLane(item.lane));
      if (dayItems.length === 0 || listed >= MAX_LISTED_ITEMS) continue;
      const date = parseLocalDate(day.date);
      if (groupByDay && date !== null) {
        lines.push(formatLocalDateLabel(date, locale, { weekday: "short", day: "numeric", month: "short" }));
      }
      for (const item of dayItems) {
        if (listed >= MAX_LISTED_ITEMS) break;
        const shown = item.title !== null && resolveCalendarContent(item.sensitivity, item.id).show;
        if (!shown) masked = true;
        const time = formatInstant(item.at, "time", locale, projection.timezone);
        const lane = copy.lanes[item.lane as AgendaLane];
        lines.push(`• ${[time, shown ? item.title : copy.maskedItem, lane].filter(Boolean).join(" · ")}`);
        listed += 1;
      }
    }
    if (items.length > listed) lines.push(copy.overflow(items.length - listed));
    if (masked) lines.push(copy.maskedNote);
    if (partial !== null) lines.push(partial);
  }

  const seen = new Set<string>();
  const sources: PersistedSourceReference[] = [];
  for (const item of items) {
    const taskId = taskIdOf(item);
    if (taskId === null || seen.has(taskId)) continue;
    seen.add(taskId);
    if (sources.length >= MAX_CITED_TASKS) break;
    sources.push({ id: `task:${taskId}`, type: "task", sourceId: taskId, support: supportKindForSource("task") });
  }

  return {
    content: lines.join("\n"),
    citations: buildCitationsEnvelope({
      retrievedAnyQualifyingSource: items.length > 0,
      sources,
      reach: AGENDA_REACH,
    }),
    citedSourceIds: sources.map((source) => source.id),
  };
}

/**
 * Reads the window the question names and answers it.
 *
 * The zone comes from `profiles` (`requireProfileTimeZone`), and it is asked for
 * twice on purpose: once here, to know which local day "amanhã" is, and once by
 * the projection itself, which refuses to take a zone from any caller
 * (`2M-TIME-003`). One small read is cheaper than a seam a page could misuse.
 */
export async function loadAgendaAnswer(
  supabase: SupabaseClient,
  input: { readonly userId: string; readonly locale: Locale; readonly span: AgendaSpan; readonly now: Date },
): Promise<AgendaAnswer> {
  const timezone = await requireProfileTimeZone(supabase, input.userId);
  const query = agendaQueryFor(input.span, localDateOf(input.now, timezone));
  const projection = await loadCalendarProjection(supabase, {
    userId: input.userId,
    locale: input.locale,
    query,
    now: input.now,
  });
  return composeAgendaAnswer({ span: input.span, projection, locale: input.locale });
}
