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
import { useId, useMemo, useState } from "react";

import type { Locale } from "@/lib/preferences";

import type { TaskUndoHandler } from "@/features/operations/undo-affordance";
import type { TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import type {
  TaskDetailCommandHandler,
  TaskDetailDateBounds,
} from "@/features/task-commands/task-detail-controls";

import { WorkModeTabs } from "@/features/daily-cycle/work-modes";
import type { CalendarProjection } from "./calendar-contracts";
import { CalendarItem } from "./calendar-item";
import { CalendarOutcome } from "./calendar-outcome";
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

  /**
   * `2M-CAL-010`. The outcome of the last applied command, held **here**.
   *
   * Not in the item that applied it: a successful reschedule moves the task off
   * the day being viewed, the revalidated projection drops it, and the item —
   * with any outcome and undo inside it — unmounts. `calendar-outcome.tsx` has
   * the full account.
   *
   * **Recorded by wrapping the action, not by a callback from the control.**
   * The first attempt reported from an effect inside `TaskDetailControls`; it
   * never fired, because React applies the settled state and the revalidated
   * tree together, so the subtree is already gone when effects run. A component
   * cannot report its own outcome if the outcome is what removes it. Wrapping
   * the action puts the recording in a closure owned by *this* component, which
   * the day's contents cannot unmount, and it happens before React is told
   * anything.
   */
  const [outcome, setOutcome] = useState<TaskDetailCommandState | null>(null);
  const recordingAction = useMemo<TaskDetailCommandHandler | undefined>(() => {
    if (!rescheduleAction) return undefined;
    return async (state, formData) => {
      const next = await rescheduleAction(state, formData);
      // `awaiting_confirmation` is not an outcome — it is a question, and no
      // scheduling verb can even reach it (nothing that moves a date is
      // destructive). Announcing it would be announcing a prompt as an answer.
      if (next.status !== "idle" && next.status !== "awaiting_confirmation") setOutcome(next);
      return next;
    };
  }, [rescheduleAction]);

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

      {/*
        `02-arquitetura-e-rotas.md` makes Calendário a **mode of Trabalho**: it
        answers *when* about the rows Lista answers *what* about. The tab strip
        is what makes that relationship visible, and it navigates — the route
        stays exactly where it was, per the consolidation table's compatibility
        rule that no existing URL dies at this step.
      */}
      <WorkModeTabs active="calendar" locale={locale} />

      {/*
        The three control rows, in one band.

        Orientation, lanes and navigation were three stacked rows above the
        grid. They answer one question between them — *which slice of time am I
        looking at, and which of it* — and `03-componentes.md` puts the controls
        that scope a view in one band above it rather than in a stack that
        competes with it.

        **The three status regions below are deliberately not in the band.** The
        bound notice, the partial-read notice and the summary are statements
        about the result rather than ways to change it, and two of them are live
        regions; folding a live region into a row of navigation is how an
        announcement ends up read as a control.

        Nothing about the controls changed: still links, still the URL, still
        keyboard-operable, still no gesture anywhere.
      */}
      <div className="calendar-toolbar">
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
                  /*
                    No `aria-pressed`. It is only valid on `role="button"`, and
                    axe flagged all five of these on the live page — a link that
                    claims to be a toggle button is an invalid ARIA attribute,
                    not a shortcut. The state belongs in the accessible name, so
                    it is a visually hidden word inside the link: screen readers
                    hear "Prazos, mostrando", pointer users see the same chip,
                    and the element stays a real link that can be opened in a new
                    tab. OD-2M-6 A is unaffected — the control is still the URL.
                  */
                  /*
                    `data-shown`, and it is not cosmetic.

                    Removing the invalid `aria-pressed` also removed the only
                    thing `calendar.css` keyed the *visible* off-state off —
                    `.calendar-lanes a[aria-pressed="false"]` stopped matching
                    anything, and a hidden lane lost its dashed edge and its
                    reduced opacity. What remained was a `sr-only` word: correct
                    for a screen reader and **nothing at all** for a sighted
                    user, which is `2M-ACCESS-005` failed in the opposite
                    direction from the one it was written for. The state is
                    carried by a data attribute, which no ARIA rule governs.
                  */
                  data-lane={lane}
                  data-shown={shown ? "true" : "false"}
                  href={calendarHref(locale, withLaneToggled(query, lane))}
                  title={copy.lanes.descriptions[lane]}
                >
                  {copy.lanes.names[lane]}
                  <span className="sr-only">{shown ? copy.lanes.stateShown : copy.lanes.stateHidden}</span>
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
        {/*
          The one link in the product that reaches Lembretes unconditionally.

          `/app/reminders` was reachable **only** from a calendar item that *is*
          a reminder, or from an entry outcome that produced one — so an account
          with no reminder had no path to the surface at all, and a route
          reachable only once it has content is not reachable. It sits here
          because this is the surface that already draws reminders beside tasks,
          which makes "see all of them" a truthful offer rather than a menu entry
          smuggled into a control band.
        */}
        <Link className="calendar-reminders-link" href={`/${locale}/app/reminders`}>
          {copy.navigation.allReminders}
        </Link>
      </nav>
      </div>

      {/* `2M-CAL-006`: reaching the bound is a visible state, not an empty grid. */}
      {bound.atEarliest ? <p className="calendar-bound" role="status">{copy.navigation.atEarliest}</p> : null}
      {bound.atLatest ? <p className="calendar-bound" role="status">{copy.navigation.atLatest}</p> : null}

      {/* `2M-CAL-011`: partial is its own state and names what is missing. */}
      {projection.failedLanes.length > 0 ? (
        <p className="calendar-partial" role="status">{copy.states.partial(failed)}</p>
      ) : null}

      <p aria-live="polite" className="calendar-summary">{copy.summary(projection.itemCount)}</p>

      {/*
        Above the days, not inside one: the day the operation was performed on
        may no longer be the day the task is in, and the answer belongs to
        neither — it belongs to the calendar.
      */}
      <CalendarOutcome locale={locale} outcome={outcome} undoAction={undoAction} />

      {query.orientation === "week" ? (
        /*
          The scroll container is the **table's parent**, not the table.

          `overflow-x` needs a block box, and the previous rule got one by
          putting `display:block` on the `<table>` itself. That replaces the
          table box with a block box and hands the rows to an anonymous table
          wrapper, so `table-layout: fixed` was inert and the seven columns were
          sized by their contents: a week with one busy Tuesday rendered as one
          wide column and six narrow ones, on every viewport, and `min-width`
          was the only thing keeping them legible.

          With the overflow on a wrapper the table is a table again — seven
          equal columns that line up with their headers, and a container that
          scrolls only when the viewport is narrower than the grid's own floor.
          The `<table>`, `<thead>`, `<th scope="col">` and `<caption>` are
          untouched, so `2M-ACCESS-002` is unchanged.
        */
        <div className="calendar-week-scroll">
          <table className="calendar-week">
            <caption className="visually-hidden">{rangeLabel}</caption>
            <thead>
              <tr>
                {projection.days.map((day) => (
                  <th key={day.date} scope="col" data-today={day.isToday ? "true" : undefined}>
                    <span className="calendar-week-day">{formatDayLabel(day.date, locale)}</span>
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
                            rescheduleAction={recordingAction}
                            timezone={projection.timezone}
                          />
                        ))}
                      </ul>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
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
                      rescheduleAction={recordingAction}
                      timezone={projection.timezone}
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
