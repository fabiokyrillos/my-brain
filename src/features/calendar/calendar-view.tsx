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

import { UniversalStateLine } from "@/features/experience/universal-state";
import type { Locale } from "@/lib/preferences";

import type { TaskUndoHandler } from "@/features/operations/undo-affordance";
import type { TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import type {
  TaskDetailCommandHandler,
  TaskDetailDateBounds,
} from "@/features/task-commands/task-detail-controls";

import { Badge, SegmentedControl, buttonVariants } from "@/components/ui";
import { SlidersHorizontal } from "lucide-react";

import { AgendaHeader, AgendaStepper } from "./agenda-header";
import { AGENDA_DATE_TOKEN } from "./agenda-date-picker";
import type { CalendarProjection } from "./calendar-contracts";
import { CalendarItem } from "./calendar-item";
import { CalendarOutcome } from "./calendar-outcome";
import {
  CALENDAR_LANES,
  CALENDAR_ORIENTATIONS,
  boundState,
  calendarBound,
  calendarHref,
  calendarHrefTemplate,
  isNarrowed,
  rangeDayCount,
  rangeStart,
  step,
  withLaneToggled,
  withOrientation,
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

/** Life Brain D.1 — the week column's short weekday ("seg."), from the date's own parts. */
function formatWeekdayLabel(date: string, locale: Locale): string {
  const parsed = parseLocalDate(date);
  if (!parsed) return date;
  const instant = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12));
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(instant);
}

/**
 * The month's own name, from the anchor's parts.
 *
 * Same UTC-noon trick as `formatDayLabel` and for the same reason: the date is
 * already fixed, so formatting it in any real zone risks a label that disagrees
 * with the grid it sits above.
 */
function formatMonthLabel(anchor: LocalDate, locale: Locale): string {
  const instant = new Date(Date.UTC(anchor.year, anchor.month - 1, 1, 12));
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(instant);
}

/**
 * How many items a month cell shows before it says *and more*.
 *
 * `2P-CALENDAR-001` requires cells that do not grow without limit and an overflow
 * that stays reachable. Three, declared here rather than written into the JSX,
 * because it is a product decision about how tall a six-row grid may get and the
 * test that asserts the overflow appears has to name the same number.
 */
export const MONTH_CELL_ITEM_LIMIT = 3;

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
  const hiddenLanes = CALENDAR_LANES.length - query.lanes.length;

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

  /**
   * A month names itself; every other orientation names its edges.
   *
   * *"27 jul – 6 set"* is a truthful description of the grid and a useless
   * description of the period — it names two months the user did not select and
   * omits the one they did. The grid's leading and trailing days are context, so
   * the label is the anchor's own month.
   */
  const rangeLabel = query.orientation === "month"
    ? formatMonthLabel(query.anchor, locale)
    : projection.days.length === 1
      ? formatDayLabel(projection.days[0].date, locale)
      : `${formatDayLabel(projection.days[0].date, locale)} – `
        + `${formatDayLabel(projection.days[projection.days.length - 1].date, locale)}`;

  /**
   * The grid, as rows of seven.
   *
   * The projection guarantees a whole number of weeks beginning on a Monday
   * (`rangeDayCount`), so this is a regrouping rather than a computation — no
   * padding, no missing cell, and no second opinion about where a week starts.
   */
  const weeks = query.orientation === "month"
    ? Array.from(
      { length: Math.ceil(projection.days.length / 7) },
      (_unused, index) => projection.days.slice(index * 7, index * 7 + 7),
    )
    : [];

  /** The month's own days that have something in them — the phone's list. */
  const monthDaysWithItems = query.orientation === "month"
    ? projection.days.filter((day) => day.inPeriod && day.items.length > 0)
    : [];

  const failed = projection.failedLanes.map((failure) => copy.lanes.names[failure.lane]).join(", ");
  const emptyMessage = isNarrowed(query) ? copy.states.emptyNarrowed : copy.states.empty;

  return (
    /*
      `.content-page` — the page container every other route in the product has
      had, and this one did not.

      Measured on a real iPhone and on desktop before it was added:
      `getComputedStyle(main).paddingLeft` was **`0px`**, so the title, the
      description, the summary and the month grid all sat flush against the
      viewport edge; the grid and the reminders link ran **past** the right edge
      at 1280px; and the last row of content sat behind the bottom bar, because
      nothing reserved the space the bar occupies.

      None of that was a calendar bug. `CalendarView` rendered `<section>`
      straight into `<main>`, and `main` has no padding — every other surface
      wraps in `.content-page`, which supplies `max-width`,
      `padding: 58px var(--gutter) 130px` and the mobile override beneath it. The
      omission is the whole of "elementos e textos muito próximos das bordas",
      "aparência de interface inacabada" and the horizontal overflow, and it is
      one wrapper rather than a sweep of margins.
    */
    <div className="content-page calendar-page">
    <section aria-labelledby={headingId} className="calendar">
      {/*
        Life Brain A.4 (`LB-A-007`). One compact header for the Agenda's three
        lenses, with the date stepper in its action slot, replacing the title,
        the description, the "Lista · Calendário · Planejar" strip and a
        navigation row of their own. The stepper keeps the bounded range: at
        either edge it is still a link and the bound notice below says why.

        Lembretes is a lens now, in the lens control under the title — the
        unconditional path to `/app/reminders` that the "Todos os lembretes"
        link used to be (`mobile-reachability-guard`).
      */}
      <AgendaHeader
        headingId={headingId}
        lens="calendar"
        locale={locale}
        actions={(
          <AgendaStepper
            className="calendar-navigation"
            locale={locale}
            next={{ href: calendarHref(locale, step(query, 1, today)), label: copy.navigation.next, disabled: bound.atLatest }}
            picker={{
              hrefTemplate: calendarHrefTemplate(locale, query, AGENDA_DATE_TOKEN),
              ...calendarBound(today),
              selected: formatLocalDate(query.anchor),
              today: formatLocalDate(today),
            }}
            previous={{ href: calendarHref(locale, step(query, -1, today)), label: copy.navigation.previous, disabled: bound.atEarliest }}
            rangeClassName="calendar-range"
            rangeLabel={rangeLabel}
            today={{ href: calendarHref(locale, { ...query, anchor: today }), label: copy.navigation.today }}
          />
        )}
      />

      {/*
        Orientation and lanes, in one band (`03-componentes.md`): which slice of
        time, and which of it. Orientation is the one selection control
        (Dia · Semana · Mês · Lista); the lanes wait behind one ghost button
        with the number hidden, open by default when something is hidden — a
        narrowing you cannot see is a calendar that lies about what it holds.

        **The status regions below stay out of the band.** The bound notice,
        the partial-read notice and the summary are statements about the
        result, and two of them are live regions; folding a live region into a
        row of controls is how an announcement ends up read as a control.

        Still links, still the URL, still keyboard-operable, no gesture.
      */}
      <div className="calendar-toolbar">
        <SegmentedControl
          className="calendar-orientation"
          label={copy.orientation.label}
          options={CALENDAR_ORIENTATIONS.map((orientation) => ({
            value: orientation,
            label: copy.orientation.options[orientation],
            href: calendarHref(locale, withOrientation(query, orientation)),
          }))}
          size="sm"
          value={query.orientation}
        />

        <details className="calendar-filters" open={hiddenLanes > 0}>
          <summary
            aria-label={hiddenLanes > 0 ? copy.lanes.hiddenLabel(hiddenLanes) : undefined}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <SlidersHorizontal aria-hidden="true" className="ui-button__icon" />
            <span className="ui-button__label">{copy.lanes.label}</span>
            {hiddenLanes > 0 ? <Badge aria-hidden="true" size="sm" tone="accent">{hiddenLanes}</Badge> : null}
          </summary>
          {/* Lane visibility: links, so the URL is the state. */}
          <nav aria-label={copy.lanes.label} className="calendar-lanes" id={lanesId}>
            <ul>
              {CALENDAR_LANES.map((lane) => {
                const shown = query.lanes.includes(lane);
                return (
                  <li key={lane}>
                    <Link
                      /*
                        No `aria-pressed`: it is only valid on `role="button"`,
                        and axe flagged all five on the live page. The state is a
                        visually hidden word in the accessible name ("Prazos,
                        mostrando") and `data-shown` for the eye, so a hidden lane
                        looks hidden as well as sounding hidden (`2M-ACCESS-005`).
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
        </details>
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

      {query.orientation === "month" ? (
        /*
          `2P-CALENDAR-001` — a real month, drawn twice.

          **Both representations are rendered, and CSS chooses.** The grid is a
          `<table>` for the same reason the week is one: a month genuinely is a
          two-dimensional relation between weekdays and weeks, and a real table
          says so to assistive technology without a single `role`. The list below
          it is the same days as prose.

          Which one a viewport gets is decided in `calendar.css`, not here. A
          JavaScript viewport test would make the server and the client disagree
          on the first paint, and the requirement's *"a plain list must not be
          declared a month view"* is honoured by the selected period staying
          `month` in the URL either way — the phone gets a different presentation
          of the month, never a different period.

          The list is also the **text alternative** the requirement asks for. It
          is not `sr-only`: hiding it from sighted users would make the accessible
          route the worse one, which is the failure `2M-ACCESS-005` was written
          against one control down.
        */
        <>
          <div className="calendar-month-scroll">
            <table className="calendar-month">
              <caption className="sr-only">{copy.month.gridLabel(rangeLabel)}</caption>
              <thead>
                <tr>
                  {copy.month.weekdays.map((weekday) => (
                    <th key={weekday} scope="col">{weekday}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week[0].date}>
                    {week.map((day) => {
                      const parsed = parseLocalDate(day.date);
                      const shown = day.items.slice(0, MONTH_CELL_ITEM_LIMIT);
                      const overflow = day.items.length - shown.length;
                      return (
                        <td
                          data-outside={day.inPeriod ? undefined : "true"}
                          data-today={day.isToday ? "true" : undefined}
                          key={day.date}
                        >
                          {/*
                            The day number is a link into the day view, carrying
                            the lanes: `2P-CALENDAR-001`'s "opens a day preserving
                            context". It is `withOrientation` on the same query
                            rather than a fresh one, so a narrowed calendar stays
                            narrowed on arrival.
                          */}
                          <Link
                            className="calendar-month-daynumber"
                            href={calendarHref(locale, {
                              ...withOrientation(query, "day"),
                              anchor: parsed ?? query.anchor,
                            })}
                          >
                            {parsed ? parsed.day : day.date}
                            {day.inPeriod ? null : (
                              <span className="sr-only"> ({copy.month.outside})</span>
                            )}
                          </Link>
                          {/*
                            Today, carried by a word rather than by a fill.
                            `2P-CALENDAR-001` forbids colour as the only marker,
                            and this is the same `calendar-today` chip the day,
                            week and agenda views already use.
                          */}
                          {day.isToday ? <span className="calendar-today">{copy.todayLabel}</span> : null}
                          {shown.length > 0 ? (
                            <ul className="calendar-day-items">
                              {shown.map((item) => (
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
                          ) : null}
                          {/*
                            The overflow, reachable rather than merely counted.
                            A cell that said "+4" and did nothing would be the
                            bound made visible and the content made unreachable.
                          */}
                          {overflow > 0 ? (
                            <Link
                              className="calendar-month-more"
                              href={calendarHref(locale, {
                                ...withOrientation(query, "day"),
                                anchor: parsed ?? query.anchor,
                              })}
                            >
                              {copy.month.more(overflow)}
                            </Link>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="calendar-month-list">
            <h2>{copy.month.listHeading}</h2>
            {monthDaysWithItems.length === 0 ? (
              <UniversalStateLine
                className="calendar-empty"
                description={emptyMessage}
                locale={locale}
                state="empty"
              />
            ) : (
              <ol className="calendar-days">
                {monthDaysWithItems.map((day) => (
                  <li className="calendar-day" data-today={day.isToday ? "true" : undefined} key={day.date}>
                    <h3>
                      {formatDayLabel(day.date, locale)}
                      {day.isToday ? <span className="calendar-today">{copy.todayLabel}</span> : null}
                    </h3>
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
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      ) : query.orientation === "week" ? (
        /*
          Life Brain D.1 — the week at a glance (T2: "como se fosse no Google
          Calendar, que você realmente vê a semana").

          Still a `<table>` (`2M-ACCESS-002`): seven equal columns that fit the
          viewport at every width, with no horizontal scroll and no floor that
          forces one. Each column holds **compact** lines — time, title, lane —
          and its heading is a link into that day, where the full cards and their
          controls live. An empty week says so once, above the grid; an empty
          column is an empty column.
        */
        <>
          {projection.itemCount === 0 ? (
            <UniversalStateLine className="calendar-empty" description={emptyMessage} locale={locale} state="empty" />
          ) : null}
          <div className="calendar-week-scroll">
            <table className="calendar-week">
              <caption className="sr-only">{rangeLabel}</caption>
              <thead>
                <tr>
                  {projection.days.map((day) => {
                    const parsed = parseLocalDate(day.date);
                    return (
                      <th key={day.date} scope="col" data-today={day.isToday ? "true" : undefined}>
                        <Link
                          aria-label={formatDayLabel(day.date, locale)}
                          className="calendar-week-head"
                          href={calendarHref(locale, { ...withOrientation(query, "day"), anchor: parsed ?? query.anchor })}
                        >
                          <span className="calendar-week-weekday">{formatWeekdayLabel(day.date, locale)}</span>
                          <span className="calendar-week-day">{parsed ? parsed.day : day.date}</span>
                        </Link>
                        {day.isToday ? <span className="calendar-today">{copy.todayLabel}</span> : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {projection.days.map((day) => (
                    <td key={day.date} data-today={day.isToday ? "true" : undefined}>
                      {day.items.length === 0 ? null : (
                        <ul className="calendar-day-items">
                          {day.items.map((item) => (
                            <CalendarItem
                              density="compact"
                              item={item}
                              key={item.id}
                              locale={locale}
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
        </>
      ) : (
        <ol className="calendar-days">
          {projection.days.map((day) => (
            <li className="calendar-day" data-today={day.isToday ? "true" : undefined} key={day.date}>
              <h2>
                {formatDayLabel(day.date, locale)}
                {day.isToday ? <span className="calendar-today">{copy.todayLabel}</span> : null}
              </h2>
              {day.items.length === 0 ? (
                <UniversalStateLine className="calendar-empty" description={emptyMessage} locale={locale} state="empty" />
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
    </div>
  );
}

/** Exported for the route's metadata, so the title is written once. */
export function calendarRangeDates(query: CalendarQuery): readonly LocalDate[] {
  const span = rangeDayCount(query);
  const first = rangeStart(query);
  return Array.from({ length: span }, (_unused, index) => addLocalDays(first, index));
}

export { formatLocalDate };
