import Link from "next/link";
import type { Locale } from "@/lib/preferences";
import type { HistoryCopy } from "./copy";
import type { HistoryEvent } from "./event";
import { subjectHref } from "./subject-route";

/**
 * The history, as a logbook (UX-13, UX-21, UX-28; Editorial calmo, ADR-180).
 *
 * A day is a heading over a rule; under it, one row per event. A row is the
 * sentence saying who did what to which object, in the reading face, over one
 * caption: the kind of item and the hour. The day is said once, by the heading,
 * instead of on every row.
 *
 * **The row is the link.** Where the object can still be opened, the whole row
 * goes to it; the separate "Abrir" button under each sentence is gone. Only a
 * subject that was actually loaded gets a link — "linkable kind" alone would
 * point a deleted task's row at a 404 — and a row whose object is gone says so
 * in its caption.
 *
 * Nothing here reads a raw column: the sentence, the change values and the
 * item-type label all arrive already localized from `describeHistoryEvent`,
 * and `audit_logs.reason` is not passed to this component at all. The grouping
 * reads nothing either: two events share a day when `formatDay` gives them the
 * same label, and the caller builds that formatter in the reader's own zone.
 *
 * The entity pages mount the same rows under "O que mudou recentemente" without
 * `formatDay`: a handful of changes to one object are a plain list, and each
 * row's stamp is then the whole date.
 *
 * ## Two rows for one operation is not a bug (UX-27)
 *
 * A confirmed task leaves both a `task_created` row from the `tasks_audit_changes`
 * trigger and a `tasks_confirmed` row from the RPC. They are different facts at
 * different altitudes — the row-level state change, and the named user
 * operation — and the migration that introduced the pair says so explicitly
 * (`202607260058:1552-1558`). They have distinct action types, so they read as
 * two distinct sentences. There is no shared operation key on `audit_logs` to
 * group them by, and grouping on "same second, similar text" would be a
 * heuristic that silently hides real rows from an audit trail. So both are
 * shown, each saying what it is.
 */
export function HistoryList({
  events,
  copy,
  locale,
  formatDay,
  formatDateTime,
}: {
  events: readonly HistoryEvent[];
  copy: HistoryCopy;
  locale: Locale;
  /**
   * The event's day, as its heading reads; also what groups the rows. Omitted,
   * the events are one list with no headings.
   */
  formatDay?: (iso: string) => string;
  /** The row's stamp: the hour under a day heading, the whole date without one. */
  formatDateTime: (iso: string) => string;
}) {
  const rows = (items: readonly HistoryEvent[]) => (
          <ol className="history-list">
            {items.map((event) => {
              const href =
                event.subject === "resolved"
                  ? subjectHref(event.entityType, event.entityId, locale)
                  : null;
              const body = (
                <>
                  <span className="history-sentence">{event.sentence}</span>

                  {event.changes.length ? (
                    <dl className="history-changes">
                      {event.changes.map((change) => (
                        <div className="history-change" key={change.field}>
                          <dt>{change.label}</dt>
                          <dd>
                            <span className="history-change-from">{change.from}</span>
                            <span aria-hidden="true"> → </span>
                            <span className="history-change-to">{change.to}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  <span className="history-meta">
                    {event.entityType !== null ? (
                      <span className="history-kind">{copy.entityTypes[event.entityType]}</span>
                    ) : null}
                    <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
                    {event.subject === "unavailable" ? (
                      <span>{copy.subject.unavailable}</span>
                    ) : null}
                  </span>
                </>
              );
              return (
                <li className="history-event" data-actor={event.actor} key={event.id}>
                  {href !== null ? (
                    <Link className="history-event-link" href={href}>
                      {body}
                    </Link>
                  ) : (
                    <div className="history-event-body">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
  );

  if (!formatDay) return rows(events);

  return (
    <div className="history-days">
      {groupByDay(events, formatDay).map((day) => (
        <section aria-label={day.label} className="history-day" key={day.events[0].id}>
          <h2 className="history-day-title">{day.label}</h2>
          {rows(day.events)}
        </section>
      ))}
    </div>
  );
}

type HistoryDay = { readonly label: string; readonly events: HistoryEvent[] };

/** Consecutive events of one day, in the order they arrived. Never re-sorted. */
function groupByDay(events: readonly HistoryEvent[], formatDay: (iso: string) => string): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const event of events) {
    const label = formatDay(event.occurredAt);
    const current = days[days.length - 1];
    if (current && current.label === label) current.events.push(event);
    else days.push({ label, events: [event] });
  }
  return days;
}
