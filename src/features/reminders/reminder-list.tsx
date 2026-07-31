import { BellRing, CalendarClock, FileText, History, ListTodo } from "lucide-react";
import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import { ReminderActions } from "./reminder-actions";
import { getReminderCopy } from "./copy";
import { REMINDER_VIEWS, type ReminderView, type ReminderViewModel } from "./projection";

/**
 * The reminders list (UX-12, UX-21, UX-22).
 *
 * A server component: everything here is text the server already knows how to
 * render, and only the lifecycle controls need to be interactive. Dates are
 * formatted by the caller's `formatInstant` so the whole page uses one formatter
 * bound to one timezone, rather than each row constructing its own `Intl`
 * instance with whatever zone the runtime happens to have.
 *
 * ## What each row now says that it did not
 *
 * The old row printed the title, a date, an `important` badge and
 * `{item.status}` — the raw database enum, in English, to both locales. It said
 * nothing about *what happens next*, which for a reminder is the only question.
 * Each row now carries a localized status label, the sentence that explains what
 * that status means for delivery, the next effective reminder time under a label
 * that changes with the state ("next reminder" vs "delivered at"), the linked
 * task or record where one exists, and a link into the audit trail for that one
 * reminder.
 */
export function ReminderList({
  reminders,
  locale,
  timezone,
  formatInstant,
}: {
  reminders: readonly ReminderViewModel[];
  locale: Locale;
  timezone: string;
  formatInstant: (iso: string) => string;
}) {
  const copy = getReminderCopy(locale);

  return (
    <div className="list-stack">
      {reminders.map((reminder) => (
        <article
          className={`list-row reminder-row ${reminder.status}`}
          // The anchor the History subject link targets. Without it that link
          // would reach the list and leave the reader to find the row.
          id={`reminder-${reminder.id}`}
          key={reminder.id}
        >
          <div className="list-row-main">
            <strong>{reminder.title}</strong>

            <p className="reminder-schedule">
              <CalendarClock aria-hidden="true" size={14} />
              <span>
                {/* The label is the state's, not a constant: printing "next
                    reminder" over a delivered row would be the same lie the raw
                    status badge told. */}
                {reminder.hasPendingDelivery
                  ? copy.nextDelivery
                  : reminder.status === "sent"
                    ? copy.deliveredAt
                    : copy.scheduleWas}
                :{" "}
                <strong>
                  {formatInstant(
                    reminder.status === "sent" && reminder.sentAt !== null
                      ? reminder.sentAt
                      : reminder.remindAt,
                  )}
                </strong>
              </span>
            </p>

            {reminder.overdue ? (
              <p className="reminder-overdue">{copy.overdueNote}</p>
            ) : null}

            <p className="reminder-status-hint">{copy.statusHint[reminder.status]}</p>

            <p className="reminder-subject">
              {reminder.link === null ? (
                <span className="reminder-subject-none">{copy.independent}</span>
              ) : (
                <Link className="reminder-subject-link" href={reminder.link.href}>
                  {reminder.link.kind === "task" ? (
                    <ListTodo aria-hidden="true" size={14} />
                  ) : (
                    <FileText aria-hidden="true" size={14} />
                  )}
                  <span className="reminder-subject-kind">
                    {reminder.link.kind === "task" ? copy.linkedTask : copy.linkedEntry}
                  </span>
                  <span>{reminder.link.label}</span>
                </Link>
              )}
              <Link className="reminder-history-link" href={reminder.historyHref}>
                <History aria-hidden="true" size={14} />
                {copy.historyLink}
              </Link>
            </p>

            <ReminderActions
              formatInstant={formatInstant}
              locale={locale}
              reminder={reminder}
              timezone={timezone}
            />
          </div>

          <div className="list-meta">
            {reminder.important ? (
              <span className="status-badge">{copy.importantBadge}</span>
            ) : null}
            {/* A localized label, never `{item.status}`. The database vocabulary
                stays in the database (UX-21). */}
            <span className={`status-badge reminder-${reminder.status}`}>
              {copy.statusLabel[reminder.status]}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * The view selector.
 *
 * Plain links, not a form and not a client component: each view is a distinct,
 * shareable, back-button-addressable URL, which is what a filter over a
 * paginated list should be. `aria-current="page"` is what tells a screen-reader
 * user which one they are on — a CSS class alone would not.
 */
export function ReminderViewNav({
  locale,
  current,
  labels,
}: {
  locale: Locale;
  current: ReminderView;
  labels: Readonly<Record<ReminderView, string>>;
}) {
  return (
    <nav aria-label={labels.all} className="reminder-views">
      {REMINDER_VIEWS.map((view) => (
        <Link
          aria-current={view === current ? "page" : undefined}
          className={`reminder-view ${view === current ? "active" : ""}`}
          href={`/${locale}/app/reminders?view=${view}`}
          key={view}
        >
          {labels[view]}
        </Link>
      ))}
    </nav>
  );
}

/** The empty state, which differs by view: nothing yet vs nothing in this view. */
export function ReminderEmptyState({
  locale,
  agentName,
  view,
}: {
  locale: Locale;
  agentName: string;
  view: ReminderView;
}) {
  const copy = getReminderCopy(locale);
  return (
    <div className="empty-list">
      <BellRing size={30} />
      <strong>{copy.emptyTitle}</strong>
      <p>{view === "pending" || view === "all" ? copy.emptyBody(agentName) : copy.statusHint[
        view === "cancelled" ? "cancelled" : "sent"
      ]}</p>
    </div>
  );
}
