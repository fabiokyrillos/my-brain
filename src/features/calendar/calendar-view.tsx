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

import { WorkModeTabs } from "@/features/daily-cycle/work-modes";
import type { CalendarProjection } from "./calendar-contracts";
import { CalendarItem } from "./calendar-item";
import { CalendarOutcome } from "./calendar-outcome";
import {
  CALENDAR_LANES,
  boundState,
  calendarHref,
  isNarrowed,
  rangeDayCount,
  rangeStart,
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
        {/*
          The label, made visible (`2P-CALENDAR-005`, owner report of 2026-08-20:
          *"filtros estranhos e pouco claros"*).

          It was already here as `aria-label`, so a screen reader has always been
          told what this row is and a sighted reader never was: thirteen
          identically-shaped pills in one band, with nothing saying which of them
          choose a period and which of them filter its contents.

          `aria-hidden` because the `<nav>` already carries the same string as
          its accessible name — rendering it visibly must not make a screen
          reader say it twice.
        */}
        <span aria-hidden="true" className="calendar-control-label">{copy.orientation.label}</span>
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
        <span aria-hidden="true" className="calendar-control-label">{copy.lanes.label}</span>
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
      </nav>
      </div>

      {/*
        Lembretes — a **destination**, and no longer dressed as a control.

        It used to be the last child of `.calendar-navigation`, inside the
        control band, which put a link to another page in the same row as
        *previous period*, *today* and *next period* and gave it the same pill.
        The owner's report of 2026-08-20 names the consequence twice over: the
        band reads as *"filtros estranhos"*, and Lembretes was so hard to find on
        a phone that this three-hop path — Trabalho → Calendário → here — was the
        only one they could locate.

        **This is no longer the product's only path to Lembretes**, and that is
        the other half of the fix: Hoje now offers it directly. What stays here
        is the contextual offer, which is truthful on the one surface that
        already draws reminders beside tasks — but it sits below the band, with
        the statements about the result, rather than among the ways to change it.

        `mobile-reachability-guard.test.ts` still requires this link to be
        unconditional, and it still is: it is outside every ternary on this page.
      */}
      <p className="calendar-destinations">
        <Link className="calendar-reminders-link" href={`/${locale}/app/reminders`}>
          {copy.navigation.allReminders}
        </Link>
      </p>

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
              <caption className="visually-hidden">{copy.month.gridLabel(rangeLabel)}</caption>
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
