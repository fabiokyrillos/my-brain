import Link from "next/link";
import type { Locale } from "@/lib/preferences";
import type { HistoryCopy } from "./copy";
import type { HistoryEvent } from "./event";
import { subjectHref } from "./subject-route";

/**
 * The history list (UX-13, UX-21, UX-28).
 *
 * Each row answers who acted, what happened, to which object, what changed, and
 * when — using only what the row can prove. Nothing here reads a raw column:
 * the sentence, the change values and the item-type label all arrive already
 * localized from `describeHistoryEvent`, and `audit_logs.reason` is not passed
 * to this component at all.
 *
 * ## Two rows for one operation is not a bug (UX-27)
 *
 * A confirmed task leaves both a `task_created` row from the `tasks_audit_changes`
 * trigger and a `tasks_confirmed` row from the RPC. They are different facts at
 * different altitudes — the row-level state change, and the named user
 * operation — and the migration that introduced the pair says so explicitly
 * (`202607260058:1552-1558`). They have distinct action types, so they now read
 * as two distinct sentences instead of the same prettified token twice. There is
 * no shared operation key on `audit_logs` to group them by, and grouping on
 * "same second, similar text" would be a heuristic that silently hides real
 * rows from an audit trail. So both are shown, each saying what it is.
 */
export function HistoryList({
  events,
  copy,
  locale,
  formatDateTime,
}: {
  events: readonly HistoryEvent[];
  copy: HistoryCopy;
  locale: Locale;
  formatDateTime: (iso: string) => string;
}) {
  return (
    <ol className="history-list">
      {events.map((event) => {
        // Only a subject that was actually loaded gets a link. "Linkable kind"
        // alone would point a deleted task's row at a 404.
        const href =
          event.subject === "resolved"
            ? subjectHref(event.entityType, event.entityId, locale)
            : null;
        return (
          <li className="history-event" key={event.id}>
            <span aria-hidden="true" className="history-dot" />
            <div className="history-event-body">
              <p className="history-sentence">{event.sentence}</p>

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

              <p className="history-meta">
                {event.entityType !== null ? (
                  <span className="history-kind">{copy.entityTypes[event.entityType]}</span>
                ) : null}
                <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
                {href !== null ? (
                  <Link className="history-subject-link" href={href}>
                    {copy.subject.open}
                  </Link>
                ) : null}
                {event.subject === "unavailable" ? (
                  <span className="history-subject-gone">{copy.subject.unavailable}</span>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
