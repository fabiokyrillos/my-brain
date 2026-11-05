import Link from "next/link";

import { ProtectedContent } from "@/features/operations/protected-content";
import { UniversalStateLine } from "@/features/experience/universal-state";
import { taskStatusLabel } from "@/features/vocabulary/copy";
import type { Locale } from "@/lib/preferences";
import { formatInstant } from "@/lib/time/instant-format";

import type { AreaEvents, AreaPerson, AreaRecord, AreaRecords, AreaTask } from "./area-page";
import { getAreaCopy } from "./copy";

/**
 * Life Brain C.4 (ADR-154) — the four sections an area of life's page adds:
 * next events (each trip with the records inside its period), the timeline of
 * records filed under the area, what is still open, and the people.
 *
 * Presentational: the data arrives already read and owner-scoped
 * (`area-page.ts`). Every piece of the owner's own text renders through
 * `ProtectedContent surface="area"`, so a `highly_sensitive` record keeps its
 * place in the timeline with its words withheld.
 */
export function AreaSections({
  locale,
  timeZone,
  events,
  records,
  tasks,
  people,
}: {
  locale: Locale;
  timeZone: string;
  events: AreaEvents;
  records: AreaRecords;
  tasks: readonly AreaTask[] | null;
  people: readonly AreaPerson[] | null;
}) {
  const copy = getAreaCopy(locale);

  return (
    <div className="area-sections">
      <section aria-labelledby="area-events-heading" className="area-section">
        <h2 id="area-events-heading">{copy.eventsHeading}</h2>
        {events.status === "failed" ? (
          <p className="area-quiet" role="note">{copy.eventsFailed}</p>
        ) : events.events.length ? (
          <ul className="area-list">
            {events.events.map((event) => (
              <li className="area-event" key={event.id}>
                <span className="area-event-title">
                  <ProtectedContent
                    href={event.sourceEntryId ? `/${locale}/app/inbox/${event.sourceEntryId}` : undefined}
                    locale={locale}
                    revealKey={`area-event-${event.id}`}
                    sensitivity={event.sensitivity}
                    surface="area"
                  >
                    {event.sourceEntryId ? <Link href={`/${locale}/app/inbox/${event.sourceEntryId}`}>{event.title}</Link> : event.title}
                  </ProtectedContent>
                </span>
                <span className="area-meta">{periodLabel(event, locale, timeZone, copy)}</span>
                {event.inPeriod.length ? (
                  <details className="area-in-period">
                    <summary>{copy.inPeriod(event.inPeriod.length)}</summary>
                    <RecordList locale={locale} prefix={`area-period-${event.id}`} records={event.inPeriod} timeZone={timeZone} />
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="area-quiet">{copy.eventsEmpty}</p>
        )}
      </section>

      <section aria-labelledby="area-timeline-heading" className="area-section">
        <h2 id="area-timeline-heading">
          {copy.timelineHeading}
          {records.status === "ok" && records.total > 0 ? (
            <span className="area-count">{copy.timelineCount(records.total)}{records.bounded ? "+" : ""}</span>
          ) : null}
        </h2>
        {records.status === "failed" ? (
          <p className="area-quiet" role="note">{copy.timelineFailed}</p>
        ) : records.records.length ? (
          <>
            <RecordList locale={locale} prefix="area-record" records={records.records} timeZone={timeZone} />
            {records.bounded || records.total > records.records.length ? <p className="area-quiet">{copy.timelineMore}</p> : null}
          </>
        ) : (
          <UniversalStateLine description={copy.timelineEmpty} locale={locale} state="empty" />
        )}
      </section>

      <div className="area-columns">
        <section aria-labelledby="area-pending-heading" className="area-section">
          <h2 id="area-pending-heading">{copy.pendingHeading}</h2>
          {tasks === null ? (
            <p className="area-quiet" role="note">{copy.pendingFailed}</p>
          ) : tasks.length ? (
            <ul className="area-list">
              {tasks.map((task) => (
                <li className="area-task" key={task.id}>
                  <ProtectedContent
                    href={`/${locale}/app/work/${task.id}`}
                    locale={locale}
                    revealKey={`area-task-${task.id}`}
                    sensitivity={task.sensitivity}
                    surface="area"
                  >
                    <Link href={`/${locale}/app/work/${task.id}`}>{task.title}</Link>
                  </ProtectedContent>
                  <span className="area-meta">{taskStatusLabel(locale, task.status)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="area-quiet">{copy.pendingEmpty}</p>
          )}
        </section>

        <section aria-labelledby="area-people-heading" className="area-section">
          <h2 id="area-people-heading">{copy.peopleHeading}</h2>
          {people === null ? (
            <p className="area-quiet" role="note">{copy.peopleFailed}</p>
          ) : people.length ? (
            <ul className="area-people">
              {people.map((person) => (
                <li key={person.id}>
                  <Link className="area-person" href={`/${locale}/app/people/${person.id}`}>{person.name}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="area-quiet">{copy.peopleEmpty}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function RecordList({
  records,
  locale,
  timeZone,
  prefix,
}: {
  records: readonly AreaRecord[];
  locale: Locale;
  timeZone: string;
  prefix: string;
}) {
  return (
    <ol className="area-timeline">
      {records.map((record) => {
        const href = `/${locale}/app/inbox/${record.id}`;
        return (
          <li className="area-record" key={record.id}>
            <time className="area-meta" dateTime={record.occurredAt}>
              {formatInstant(record.occurredAt, "day", locale, timeZone)}
            </time>
            <span className="area-record-text">
              <ProtectedContent href={href} locale={locale} revealKey={`${prefix}-${record.id}`} sensitivity={record.sensitivity} surface="area">
                <Link href={href}>{record.preview}</Link>
              </ProtectedContent>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function periodLabel(
  event: { readonly startsAt: string; readonly endsAt: string | null; readonly allDay: boolean },
  locale: Locale,
  timeZone: string,
  copy: ReturnType<typeof getAreaCopy>,
): string {
  const presentation = event.allDay ? "day" : "dayAndTime";
  const start = formatInstant(event.startsAt, presentation, locale, timeZone) ?? event.startsAt;
  const end = event.endsAt ? formatInstant(event.endsAt, presentation, locale, timeZone) : null;
  return [start, event.allDay && !end ? copy.allDay : null, end && end !== start ? copy.until(end) : null]
    .filter(Boolean)
    .join(" · ");
}
