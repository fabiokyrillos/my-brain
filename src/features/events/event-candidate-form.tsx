"use client";

/**
 * Life Brain C.3 (ADR-152) — the record's proposed events, and the ones it put
 * on the agenda.
 *
 * The same shape as the task candidates on this page: every candidate is
 * offered checked, nothing is written until the owner presses one button, the
 * answer is announced with an undo, and an event already on the agenda can be
 * cancelled from where it came from. Links and forms only; no gesture.
 */

import { CalendarPlus, RotateCcw, X } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui";
import type { Locale } from "@/lib/preferences";
import { formatInstant } from "@/lib/time/instant-format";

import { getEventCopy } from "./copy";
import type { AgendaEvent, PendingEventCandidate } from "./entry-events";
import { idleEventActionState, type EventAction } from "./state";

type Period = { readonly startsAt: string; readonly endsAt: string | null; readonly allDay: boolean };

function periodLabel(period: Period, locale: Locale, timezone: string): string {
  const copy = getEventCopy(locale);
  const start = formatInstant(period.startsAt, period.allDay ? "day" : "dayAndTime", locale, timezone) ?? period.startsAt;
  const end = period.endsAt === null
    ? null
    : formatInstant(period.endsAt, period.allDay ? "day" : "dayAndTime", locale, timezone);
  return [start, period.allDay && end === null ? copy.allDay : null, end && end !== start ? copy.until(end) : null]
    .filter(Boolean)
    .join(" · ");
}

export function EventCandidateForm({
  action,
  cancelAction,
  undoAction,
  entryId,
  interpretationId,
  operationKey,
  locale,
  timezone,
  pending,
  onAgenda,
}: {
  action: EventAction;
  cancelAction: EventAction;
  undoAction: EventAction;
  entryId: string;
  interpretationId: string;
  operationKey: string;
  locale: Locale;
  timezone: string;
  pending: readonly PendingEventCandidate[];
  onAgenda: readonly AgendaEvent[];
}) {
  const copy = getEventCopy(locale);
  const [state, formAction, busy] = useActionState(action, idleEventActionState);
  const [undone, undoFormAction, undoing] = useActionState(undoAction, idleEventActionState);
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set(pending.map((candidate) => candidate.candidateIndex)),
  );
  const confirmedEvents = onAgenda.filter((event) => event.status === "confirmed");

  if (pending.length === 0 && confirmedEvents.length === 0 && state.status === "idle") return null;

  return (
    <section aria-label={copy.heading} className="event-candidates">
      {pending.length > 0 ? (
        <form action={formAction} className="event-candidates-form">
          <h3>{copy.heading}</h3>
          <p className="event-candidates-lead">{copy.lead}</p>
          <input name="entryId" type="hidden" value={entryId} />
          <input name="interpretationId" type="hidden" value={interpretationId} />
          <input name="operationKey" type="hidden" value={operationKey} />
          <input name="locale" type="hidden" value={locale} />
          <input name="candidateIndexes" type="hidden" value={JSON.stringify([...selected].sort((a, b) => a - b))} />
          <ul className="event-candidates-list">
            {pending.map((candidate) => (
              <li key={candidate.candidateIndex}>
                <label className="event-candidate">
                  <input
                    checked={selected.has(candidate.candidateIndex)}
                    disabled={busy}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(candidate.candidateIndex);
                      else next.delete(candidate.candidateIndex);
                      setSelected(next);
                    }}
                    type="checkbox"
                  />
                  <span className="event-candidate-text">
                    <strong>{candidate.title}</strong>
                    <small>
                      {periodLabel(candidate, locale, timezone)}
                      {candidate.location ? ` · ${candidate.location}` : ""}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button disabled={selected.size === 0} icon={<CalendarPlus />} loading={busy} type="submit" variant="primary">
            {busy ? copy.confirming : copy.confirm}
          </Button>
        </form>
      ) : null}

      <div aria-live="polite" role="status">
        {state.status !== "idle" && undone.status !== "success" ? <p>{state.message}</p> : null}
        {undone.status !== "idle" ? <p>{undone.message}</p> : null}
      </div>
      {state.status === "success" && state.undoId && undone.status !== "success" ? (
        <form action={undoFormAction}>
          <input name="undoId" type="hidden" value={state.undoId} />
          <input name="entryId" type="hidden" value={entryId} />
          <input name="locale" type="hidden" value={locale} />
          <Button icon={<RotateCcw />} loading={undoing} size="sm" type="submit" variant="ghost">
            {undoing ? copy.undoing : copy.undo}
          </Button>
        </form>
      ) : null}

      {confirmedEvents.length > 0 ? (
        <div className="event-agenda">
          <h3>{copy.onAgendaHeading}</h3>
          <ul className="event-candidates-list">
            {confirmedEvents.map((event) => (
              <li className="event-agenda-item" key={event.id}>
                <span className="event-candidate-text">
                  <strong>{event.title}</strong>
                  <small>{periodLabel(event, locale, timezone)}</small>
                </span>
                <CancelEventButton action={cancelAction} entryId={entryId} eventId={event.id} label={copy.cancel(event.title)} locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function CancelEventButton({
  action,
  entryId,
  eventId,
  label,
  locale,
}: {
  action: EventAction;
  entryId: string;
  eventId: string;
  label: string;
  locale: Locale;
}) {
  const [state, formAction, busy] = useActionState(action, idleEventActionState);
  return (
    <form action={formAction}>
      <input name="entryId" type="hidden" value={entryId} />
      <input name="eventId" type="hidden" value={eventId} />
      <input name="locale" type="hidden" value={locale} />
      <Button aria-label={label} icon={<X />} loading={busy} size="sm" title={label} type="submit" variant="ghost" />
      {state.status === "error" ? <span role="alert">{state.message}</span> : null}
    </form>
  );
}
