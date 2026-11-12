import type { CalendarDayView, CalendarItemView } from "./calendar-contracts";

/**
 * Life Brain D.3 (ADR-167) — a multi-day event is one bar in a week row.
 *
 * The projection puts an event on every local day it covers
 * (`event:<row>:<date>`), which is right for the day view and the chat's
 * agenda, and wrong for a grid: a trip from Tuesday to Thursday read as three
 * trips. For a run of consecutive days (a week, or one row of a month) this
 * regroups each event that occupies **more than one** of them into a bar —
 * `columns` wide, starting where it starts in the row — and takes its daily
 * occurrences out of the cells. Bars that overlap stack into lanes; bars that
 * do not share one. Nothing else moves.
 *
 * The bar's item is the event's **first** occurrence in the row, rendered by the
 * same `CalendarItem` (so `ProtectedContent` still masks it). Pure, so the shape
 * is tested without a DOM.
 */

export type SpanCell =
  | { readonly kind: "gap"; readonly columns: number }
  | {
      readonly kind: "bar";
      readonly columns: number;
      readonly item: CalendarItemView;
      /** The event also covers the day before this row's first column. */
      readonly continuesBefore: boolean;
      /** …or the day after its last. */
      readonly continuesAfter: boolean;
    };

/** The event row an occurrence id belongs to, or `null` for any other item. */
function eventRow(id: string): string | null {
  const match = /^event:([^:]+):/.exec(id);
  return match ? match[1] : null;
}

export function spanRows(
  days: readonly CalendarDayView[],
  /** Every item in the projection, to tell whether a bar continues outside the row. */
  everything: readonly { readonly id: string }[] = days.flatMap((day) => day.items),
): { readonly lanes: readonly (readonly SpanCell[])[]; readonly days: readonly CalendarDayView[] } {
  const columnsByRow = new Map<string, { first: number; last: number; item: CalendarItemView }>();
  days.forEach((day, column) => {
    for (const item of day.items) {
      const row = eventRow(item.id);
      if (row === null) continue;
      const seen = columnsByRow.get(row);
      if (seen) seen.last = column;
      else columnsByRow.set(row, { first: column, last: column, item });
    }
  });
  const multi = [...columnsByRow.entries()].filter(([, run]) => run.last > run.first);
  if (multi.length === 0) return { lanes: [], days };

  const occurrences = new Map<string, Set<string>>();
  for (const { id } of everything) {
    const row = eventRow(id);
    if (row === null) continue;
    occurrences.set(row, (occurrences.get(row) ?? new Set()).add(id.slice(id.lastIndexOf(":") + 1)));
  }

  // Greedy lane assignment, in order of start column then length.
  const ordered = [...multi].sort(([, a], [, b]) => (a.first - b.first) || ((b.last - b.first) - (a.last - a.first)));
  const laneEnds: number[] = [];
  const placed: { lane: number; first: number; last: number; row: string; item: CalendarItemView }[] = [];
  for (const [row, run] of ordered) {
    let lane = laneEnds.findIndex((end) => end < run.first);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(run.last);
    } else {
      laneEnds[lane] = run.last;
    }
    placed.push({ lane, ...run, row });
  }

  const firstDate = days[0]?.date ?? "";
  const lastDate = days[days.length - 1]?.date ?? "";
  const lanes = laneEnds.map((_end, lane) => {
    const cells: SpanCell[] = [];
    let column = 0;
    for (const bar of placed.filter((candidate) => candidate.lane === lane).sort((a, b) => a.first - b.first)) {
      if (bar.first > column) cells.push({ kind: "gap", columns: bar.first - column });
      const dates = [...(occurrences.get(bar.row) ?? [])];
      cells.push({
        kind: "bar",
        columns: bar.last - bar.first + 1,
        item: bar.item,
        continuesBefore: bar.first === 0 && dates.some((date) => date < firstDate),
        continuesAfter: bar.last === days.length - 1 && dates.some((date) => date > lastDate),
      });
      column = bar.last + 1;
    }
    if (column < days.length) cells.push({ kind: "gap", columns: days.length - column });
    return cells;
  });

  const barred = new Set(multi.map(([row]) => row));
  return {
    lanes,
    days: days.map((day) => ({ ...day, items: day.items.filter((item) => !barred.has(eventRow(item.id) ?? "")) })),
  };
}
