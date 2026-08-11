"use client";

/**
 * The calendar surface (`2M-CAL-001` … `-011`).
 *
 * ## Every control is visible, labelled and keyboard-operable
 *
 * OD-2M-6 signed **option A**: no drag, no swipe, no pointer or touch gesture,
 * including one added "in preparation". So navigation, orientation and lane
 * visibility are **links** — not buttons with handlers, and certainly not
 * gestures. A link is keyboard-operable, screen-reader-addressable and
 * shareable for free, and it is what makes `2M-CAL-004`'s "the URL is the state"
 * true rather than aspirational: pressing *next week* changes the URL because
 * the control **is** the URL.
 *
 * There is deliberately no `onDrag`, `onTouchStart`, `onPointerDown` or
 * `onSwipe` anywhere in this feature, and `phase-2l-no-gesture-guard.test.ts` is
 * extended to name these files so one cannot appear later.
 *
 * ## Why the grid is a table on week, and a list on day and agenda
 *
 * `2M-ACCESS-002` requires the structure to be conveyed programmatically — *a
 * grid is a grid, a day is labelled*. A week genuinely is a two-dimensional
 * relation between seven days and their items, and a `<table>` says so to
 * assistive technology without a single `role`. A day and an agenda are lists,
 * and marking them up as a grid would describe a shape that is not there.
 */

import Link from "next/link";
import { useId } from "react";

import type { Locale } from "@/lib/preferences";

import type { TaskUndoHandler } from "@/features/operations/undo-affordance";
import type {
  TaskDetailCommandHandler,
  TaskDetailDateBounds,
} from "@/features/task-commands/task-detail-controls";

import type { CalendarProjection } from "./calendar-contracts";
import { CalendarItem } from "./calendar-item";
import {
  CALENDAR_LANES,
  DAYS_BY_ORIENTATION,
  boundState,
  calendarHref,
  isNarrowed,
  step,
  withLaneToggled,
  withOrientation,
  type CalendarOrientation,
  type CalendarQuery,
} from "./calendar-query";
import { getCalendarCopy } from "./copy";
import { addLocalDays, formatLocalDate, parseLocalDate, type LocalDate } from "@/lib/time/local-day";

/**
 * A column's label, rendered from the date's **own parts** rather than from an
 * instant in a zone.
 *
 * The projection has already decided which local day each item belongs to, so a
 * label only has to name a date that is already fixed. Formatting it at UTC noon
 * and in `UTC` is what guarantees the label can never disagree with the column
 * it sits on — a label formatted in the user's zone from an instant would be
 * one rounding away from saying "Sat" above Sunday's items.
 *
 * That is also why this takes no `timeZone`: there is no zone-dependent decision
 * left to make here, and a parameter would invite one.
 */
function formatDayLabel(date: string, locale: Locale): string {
  const parsed = parseLocalDate(date);
  if (!parsed) return date;
  const instant = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12));
  return new Intl.DateTimeFormat(locale, {
    weekday: "short", day: "2-digit", month: "short", timeZone: "UTC",
  }).format(instant);
}

export function CalendarView({
  dateBounds,
  locale,
  projection,
  query,
  rescheduleAction,
  today,
  undoAction,
}: {
  /**
   * `2M-CAL-009`. The reschedule wiring, threaded from the route.
   *
   * Optional as a triple, and the three travel together: an item renders its
   * controls only when all three are present, so a caller cannot supply an
   * action without the bounds the picker needs, or bounds without an action to
   * send them to. Absent means a read-only calendar, which is what every
   * component test that is not about rescheduling mounts.
   */
  dateBounds?: TaskDetailDateBounds;
  locale: Locale;
  projection: CalendarProjection;
  query: CalendarQuery;
  rescheduleAction?: TaskDetailCommandHandler;
  today: LocalDate;
  undoAction?: TaskUndoHandler;
}) {
  const copy = getCalendarCopy(locale);
  const bound = boundState(query, today);
  const headingId = useId();
  const lanesId = useId();

  const rangeLabel = projection.days.length === 1
    ? formatDayLabel(projection.days[0].date, locale)
    : `${formatDayLabel(projection.days[0].date, locale)} – `
      + `${formatDayLabel(projection.days[projection.days.length - 1].date, locale)}`;

  const failed = projection.failedLanes.map((failure) => copy.lanes.names[failure.lane]).join(", ");
  const emptyMessage = isNarrowed(query) ? copy.states.emptyNarrowed : copy.states.empty;

  return (
    <section aria-labelledby={headingId} className="calendar">
      <header className="calendar-header">
        <h1 id={headingId}>{copy.title}</h1>
        <p className="calendar-description">{copy.description}</p>
      </header>

      {/* Orientation. Links, so the URL is the state and the keyboard works. */}
      <nav aria-label={copy.orientation.label} className="calendar-orientation">
        <ul>
          {(Object.keys(copy.orientation.options) as CalendarOrientation[]).map((orientation) => {
            const active = query.orientation === orientation;
            return (
              <li key={orientation}>
                <Link
                  aria-current={active ? "true" : undefined}
                  href={calendarHref(locale, withOrientation(query, orientation))}
                >
                  {copy.orientation.options[orientation]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Lane visibility. Same shape, same reasons. */}
      <nav aria-label={copy.lanes.label} className="calendar-lanes" id={lanesId}>
        <ul>
          {CALENDAR_LANES.map((lane) => {
            const shown = query.lanes.includes(lane);
            return (
              <li key={lane}>
                <Link
                  aria-pressed={shown ? "true" : "false"}
                  data-lane={lane}
                  href={calendarHref(locale, withLaneToggled(query, lane))}
                  title={copy.lanes.descriptions[lane]}
                >
                  {copy.lanes.names[lane]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Range navigation, bounded and saying so rather than going quiet. */}
      <nav aria-label={copy.navigation.previous} className="calendar-navigation">
        <Link
          aria-disabled={bound.atEarliest ? "true" : undefined}
          href={calendarHref(locale, step(query, -1, today))}
          rel="prev"
        >
          {copy.navigation.previous}
        </Link>
        <p aria-live="polite" className="calendar-range">{rangeLabel}</p>
        <Link href={calendarHref(locale, { ...query, anchor: today })}>{copy.navigation.today}</Link>
        <Link
          aria-disabled={bound.atLatest ? "true" : undefined}
          href={calendarHref(locale, step(query, 1, today))}
          rel="next"
        >
          {copy.navigation.next}
        </Link>
      </nav>

      {/* `2M-CAL-006`: reaching the bound is a visible state, not an empty grid. */}
      {bound.atEarliest ? <p className="calendar-bound" role="status">{copy.navigation.atEarliest}</p> : null}
      {bound.atLatest ? <p className="calendar-bound" role="status">{copy.navigation.atLatest}</p> : null}

      {/* `2M-CAL-011`: partial is its own state and names what is missing. */}
      {projection.failedLanes.length > 0 ? (
        <p className="calendar-partial" role="status">{copy.states.partial(failed)}</p>
      ) : null}

      <p aria-live="polite" className="calendar-summary">{copy.summary(projection.itemCount)}</p>

      {query.orientation === "week" ? (
        <table className="calendar-week">
          <caption className="visually-hidden">{rangeLabel}</caption>
          <thead>
            <tr>
              {projection.days.map((day) => (
                <th key={day.date} scope="col" data-today={day.isToday ? "true" : undefined}>
                  <span>{formatDayLabel(day.date, locale)}</span>
                  {day.isToday ? <span className="calendar-today">{copy.todayLabel}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {projection.days.map((day) => (
                <td key={day.date} data-today={day.isToday ? "true" : undefined}>
                  {day.items.length === 0 ? (
                    <p className="calendar-empty">{emptyMessage}</p>
                  ) : (
                    <ul className="calendar-day-items">
                      {day.items.map((item) => (
                        <CalendarItem
                          dateBounds={dateBounds}
                          item={item}
                          key={item.id}
                          locale={locale}
                          rescheduleAction={rescheduleAction}
                          timezone={projection.timezone}
                          undoAction={undoAction}
                        />
                      ))}
                    </ul>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ) : (
        <ol className="calendar-days">
          {projection.days.map((day) => (
            <li className="calendar-day" data-today={day.isToday ? "true" : undefined} key={day.date}>
              <h2>
                {formatDayLabel(day.date, locale)}
                {day.isToday ? <span className="calendar-today">{copy.todayLabel}</span> : null}
              </h2>
              {day.items.length === 0 ? (
                <p className="calendar-empty">{emptyMessage}</p>
              ) : (
                <ul className="calendar-day-items">
                  {day.items.map((item) => (
                    <CalendarItem
                      dateBounds={dateBounds}
                      item={item}
                      key={item.id}
                      locale={locale}
                      rescheduleAction={rescheduleAction}
                      timezone={projection.timezone}
                      undoAction={undoAction}
                    />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Exported for the route's metadata, so the title is written once. */
export function calendarRangeDates(query: CalendarQuery): readonly LocalDate[] {
  const span = DAYS_BY_ORIENTATION[query.orientation];
  return Array.from({ length: span }, (_unused, index) => addLocalDays(query.anchor, index));
}

export { formatLocalDate };
