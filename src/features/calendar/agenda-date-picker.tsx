"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/components/ui";
import type { Locale } from "@/lib/preferences";
import {
  addLocalDays,
  addLocalMonths,
  compareLocalDates,
  daysInLocalMonth,
  formatLocalDate,
  localWeekdayIndex,
  parseLocalDate,
  startOfLocalMonth,
  type LocalDate,
} from "@/lib/time/local-day";

import { getAgendaHeaderCopy } from "./agenda-copy";

/**
 * Life Brain D.1 — the period label is a control that opens a month of days.
 *
 * The owner tapped the label expecting a calendar and got a `<p>` (`FEEDBACK_DONO_2026-11-05.md`
 * T2, V1 2:18); the arrows were the only way to move, one period at a time.
 *
 * ## Still links, still the URL
 *
 * Every day in the picker is a **link** to the same page anchored on that day,
 * built from `hrefTemplate` by replacing `AGENDA_DATE_TOKEN`. That keeps
 * OD-2M-6 A (no gesture, every control visible and keyboard-operable) and
 * `2M-CAL-004` (the URL is the state): choosing a day is navigating, the back
 * button works, and a server component can hand over a template where it could
 * not hand over a function.
 *
 * The only client state is **which month the picker shows**. Paging months
 * inside the picker is browsing, not choosing, so it does not navigate.
 *
 * ## The bound is the calendar's
 *
 * `min` and `max` are the navigation bound `2M-CAL-006` declares. A day outside
 * it is rendered as a number marked `aria-disabled`, never as a link — a link to
 * a date the page would clamp back to today is a link that lies.
 */

/** The placeholder a caller's URL carries where the chosen `YYYY-MM-DD` goes. */
export const AGENDA_DATE_TOKEN = "__AGENDA_DATE__";

export type DatePickerCell = {
  readonly date: string;
  readonly day: number;
  readonly selected: boolean;
  readonly today: boolean;
  readonly selectable: boolean;
};

/**
 * The month containing `view`, as Monday-first weeks of seven, with `null` for
 * the cells before the 1st and after the last day. Pure, so the grid's shape is
 * tested without a DOM.
 */
export function datePickerMonth({
  view,
  selected,
  today,
  min,
  max,
}: {
  readonly view: string;
  readonly selected: string;
  readonly today: string;
  readonly min: string;
  readonly max: string;
}): ReadonlyArray<ReadonlyArray<DatePickerCell | null>> {
  const anchor = parseLocalDate(view);
  const lower = parseLocalDate(min);
  const upper = parseLocalDate(max);
  if (anchor === null) return [];
  const first = startOfLocalMonth(anchor);
  const lead = localWeekdayIndex(first);
  const length = daysInLocalMonth(anchor);
  const cells: Array<DatePickerCell | null> = Array.from({ length: lead }, () => null);
  for (let offset = 0; offset < length; offset += 1) {
    const date = addLocalDays(first, offset);
    const key = formatLocalDate(date);
    cells.push({
      date: key,
      day: date.day,
      selected: key === selected,
      today: key === today,
      selectable: (lower === null || compareLocalDates(date, lower) >= 0)
        && (upper === null || compareLocalDates(date, upper) <= 0),
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_unused, index) => cells.slice(index * 7, index * 7 + 7));
}

/** A calendar date's own name, formatted at UTC noon so no zone can move it. */
function dayName(date: LocalDate, locale: Locale): string {
  const instant = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(instant);
}

function monthName(date: LocalDate, locale: Locale): string {
  const instant = new Date(Date.UTC(date.year, date.month - 1, 1, 12));
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(instant);
}

function sameMonth(a: LocalDate, b: LocalDate): boolean {
  return a.year === b.year && a.month === b.month;
}

export function AgendaDatePicker({
  className,
  hrefTemplate,
  label,
  locale,
  max,
  min,
  selected,
  today,
}: {
  readonly className?: string;
  /** The page's own URL with `AGENDA_DATE_TOKEN` where the date goes. */
  readonly hrefTemplate: string;
  /** The period the page shows — what the label said when it was a paragraph. */
  readonly label: string;
  readonly locale: Locale;
  /** The navigation bound, `YYYY-MM-DD`. */
  readonly max: string;
  readonly min: string;
  /** The anchor the page shows, `YYYY-MM-DD`. */
  readonly selected: string;
  readonly today: string;
}) {
  const copy = getAgendaHeaderCopy(locale).datePicker;
  const initial = parseLocalDate(selected) ?? parseLocalDate(today) ?? { year: 1970, month: 1, day: 1 };
  const [view, setView] = useState<LocalDate>(startOfLocalMonth(initial));
  const lower = parseLocalDate(min);
  const upper = parseLocalDate(max);
  const atFirst = lower !== null && sameMonth(view, lower);
  const atLast = upper !== null && sameMonth(view, upper);
  const weeks = datePickerMonth({ view: formatLocalDate(view), selected, today, min, max });
  const caption = monthName(view, locale);

  return (
    <>
      <details className={cn("agenda-date-picker", className)}>
        <summary aria-label={copy.open(label)} className="agenda-stepper-range agenda-date-trigger">
          <span>{label}</span>
          <ChevronDown aria-hidden="true" className="agenda-date-chevron" size={16} />
        </summary>
        <div aria-label={copy.label} className="agenda-date-panel" role="group">
          <div className="agenda-date-panel-head">
            <button
              aria-label={copy.previousMonth}
              className="ui-button ui-button--ghost ui-button--sm ui-icon-button"
              disabled={atFirst}
              onClick={() => setView(addLocalMonths(view, -1))}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="ui-button__icon" />
            </button>
            <span aria-hidden="true" className="agenda-date-month">{caption}</span>
            <button
              aria-label={copy.nextMonth}
              className="ui-button ui-button--ghost ui-button--sm ui-icon-button"
              disabled={atLast}
              onClick={() => setView(addLocalMonths(view, 1))}
              type="button"
            >
              <ChevronRight aria-hidden="true" className="ui-button__icon" />
            </button>
          </div>
          <table className="agenda-date-grid">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                {copy.weekdays.map((weekday, index) => (
                  // Single letters repeat (S, T, Q…), so the column index is the key.
                  <th aria-hidden="true" key={index} scope="col">{weekday}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, row) => (
                <tr key={row}>
                  {week.map((cell, column) => {
                    if (cell === null) return <td key={column} />;
                    const parsed = parseLocalDate(cell.date)!;
                    return (
                      <td data-today={cell.today ? "true" : undefined} key={cell.date}>
                        {cell.selectable ? (
                          <Link
                            aria-current={cell.selected ? "date" : undefined}
                            aria-label={dayName(parsed, locale)}
                            className="agenda-date-day"
                            href={hrefTemplate.replace(AGENDA_DATE_TOKEN, cell.date)}
                          >
                            {cell.day}
                          </Link>
                        ) : (
                          <span
                            aria-disabled="true"
                            className="agenda-date-day"
                            title={copy.outsideBound}
                          >
                            {cell.day}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {/* The stepper's announcement, kept: moving still says where it landed. */}
      <span aria-live="polite" className="sr-only">{label}</span>
    </>
  );
}
