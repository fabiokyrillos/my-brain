import Link from "next/link";

import { UniversalStateLine } from "@/features/experience/universal-state";

import type { Locale } from "@/lib/preferences";

import { ReminderInlineFeedback, ReminderRowVerb } from "./reminder-actions";
import { getReminderCopy } from "./copy";
import { groupReminders, type ReminderGroupKey } from "./grouping";
import { REMINDER_VIEWS, type ReminderView, type ReminderViewModel } from "./projection";

/**
 * The reminders list (UX-12, UX-21, UX-22; recomposed under ADR-180).
 *
 * A server component: everything here is text the server already knows how to
 * render, and only the row's one verb is interactive. Dates are formatted by
 * the caller's formatters so the whole page uses one authority bound to one
 * timezone, rather than each row constructing its own `Intl` instance with
 * whatever zone the runtime happens to have.
 *
 * ## The row: when · what · one caption · one verb
 *
 * The list was a stack of cards, each with a schedule line, a subject line, a
 * "repeats" strip, three buttons and a status pill — eight reminders took
 * seven phone screens. It is now the Agenda's own row grammar, because
 * Lembretes is the Agenda's third lens: sections by **when** (what passed its
 * hour, today, tomorrow, the next days, further out), the hour in a column of
 * tabular figures, the reminder's words in the reading face as the row's link,
 * one caption (that it is important, how it repeats, what it is tied to), and
 * the one verb the state most likely wants.
 *
 * Everything else a reminder can do is one tap away, on its own page
 * (`reminder-detail.tsx`) — which is where a notification already lands.
 *
 * ## What a row still says to everyone
 *
 * The state is a localized label, never the column value (UX-21), and the
 * hour's meaning follows the state ("next reminder" vs "delivered at"). Both
 * are in the row for a screen reader; on screen the section's heading and its
 * one note say them once for all its rows instead of once per row.
 */
export function ReminderList({
  reminders,
  locale,
  formatInstant,
  formatLocalTime,
  formatLocalDay,
  formatDayLabel,
  now,
}: {
  reminders: readonly ReminderViewModel[];
  locale: Locale;
  formatInstant: (iso: string) => string;
  /** The wall clock as `HH:MM` in the owner's zone — the row's time column. */
  formatLocalTime: (iso: string) => string;
  /** The owner's calendar day, `YYYY-MM-DD` — what the sections are cut by. */
  formatLocalDay: (iso: string) => string;
  /** The short day stamp a row carries when its section spans several days. */
  formatDayLabel: (iso: string, now: Date) => string;
  /** The request's instant: "today" is read from it, in the owner's zone. */
  now: Date;
}) {
  const copy = getReminderCopy(locale);
  const today = formatLocalDay(now.toISOString());
  const groups = groupReminders(reminders, today, formatLocalDay);

  /** What one line under the heading says for every row of the section. */
  const noteOf = (key: ReminderGroupKey): string | null => {
    if (key === "late") return copy.overdueNote;
    if (key === "delivered") return copy.statusHint.sent;
    if (key === "cancelled") return copy.statusHint.cancelled;
    if (key === "inactive") return copy.statusHint.snoozed;
    return null;
  };

  return (
    <div className="reminder-groups">
      {groups.map((group) => {
        const note = noteOf(group.key);
        return (
          <section
            aria-labelledby={`reminder-group-${group.key}`}
            className="reminder-group"
            data-group={group.key}
            key={group.key}
          >
            <h2 className="reminder-group-heading" id={`reminder-group-${group.key}`}>
              {copy.list.group[group.key]}
              <span className="reminder-group-count">{group.reminders.length}</span>
            </h2>
            {note === null ? null : <p className="reminder-group-note">{note}</p>}
            <ul className="reminder-rows">
              {group.reminders.map((reminder) => {
                // The delivery once it has fired; the schedule otherwise.
                const instant = reminder.status === "sent" && reminder.sentAt !== null
                  ? reminder.sentAt
                  : reminder.remindAt;
                const showDay = group.key !== "tomorrow" && formatLocalDay(instant) !== today;
                return (
                  <li
                    className={`reminder-row ${reminder.status}`}
                    // The anchor the History subject link targets. Without it
                    // that link would reach the list and leave the reader to
                    // find the row.
                    id={`reminder-${reminder.id}`}
                    key={reminder.id}
                  >
                    <p className="reminder-row-when">
                      <span className="sr-only">
                        {/* The label is the state's, not a constant: "next
                            reminder" over a delivered row would be the same lie
                            the raw status badge told. */}
                        {reminder.hasPendingDelivery
                          ? copy.nextDelivery
                          : reminder.status === "sent"
                            ? copy.deliveredAt
                            : copy.scheduleWas}
                        :{" "}
                        <span>{formatInstant(instant)}</span>
                      </span>
                      {showDay ? (
                        <span aria-hidden="true" className="reminder-row-day">{formatDayLabel(instant, now)}</span>
                      ) : null}
                      <span aria-hidden="true" className="reminder-row-time">{formatLocalTime(instant)}</span>
                    </p>

                    <div className="reminder-row-main">
                      <Link className="reminder-row-title" href={`/${locale}/app/reminders/${reminder.id}`}>
                        {reminder.title}
                      </Link>
                      <p className="reminder-row-caption">
                        {/* A localized label, never the column value. The
                            database vocabulary stays in the database (UX-21). */}
                        <span className="sr-only">{copy.statusLabel[reminder.status]}</span>
                        {reminder.important ? (
                          <span className="reminder-important">{copy.list.important}</span>
                        ) : null}
                        {/* `2R-SURFACE-003`: that it repeats, and how — the
                            sentence arrives built; a rule that did not parse
                            says only that it repeats. */}
                        {reminder.series === null ? null : (
                          <span className="reminder-row-repeats">
                            {reminder.series.description ?? copy.series.badge}
                          </span>
                        )}
                        {reminder.link === null ? null : (
                          <span className="reminder-row-subject">
                            {copy.list.linked[reminder.link.kind](reminder.link.label)}
                          </span>
                        )}
                      </p>
                    </div>

                    <ReminderRowVerb locale={locale} reminder={reminder} />
                    <ReminderInlineFeedback reminderId={reminder.id} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
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
 *
 * ADR-180: it is one quiet line at the foot of the list, not a row of pills
 * above it. The page opens on what is coming; what was delivered or cancelled
 * is bookkeeping, one tap away.
 */
export function ReminderViewNav({
  locale,
  current,
  label,
  labels,
}: {
  locale: Locale;
  current: ReminderView;
  /** The line's own word ("Mostrar"), which is also the navigation's name. */
  label?: string;
  labels: Readonly<Record<ReminderView, string>>;
}) {
  return (
    <nav aria-label={label ?? labels.all} className="reminder-views">
      {label === undefined ? null : <span aria-hidden="true" className="reminder-views-label">{label}</span>}
      {REMINDER_VIEWS.map((view) => (
        <Link
          aria-current={view === current ? "page" : undefined}
          className="reminder-view"
          href={`/${locale}/app/reminders?view=${view}`}
          key={view}
        >
          {labels[view]}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The empty state, which differs by view: nothing yet vs nothing in this view.
 *
 * A line, not a block (ADR-180): the masthead's caption already says there is
 * no reminder, so this says only what to do about it.
 */
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
    <UniversalStateLine
      className="reminder-empty"
      description={view === "pending" || view === "all" ? copy.emptyBody(agentName) : copy.statusHint[
        view === "cancelled" ? "cancelled" : "sent"
      ]}
      locale={locale}
      state="empty"
    />
  );
}
