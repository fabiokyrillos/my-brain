"use client";

/**
 * Life Brain C.3 (ADR-152) — the record's proposed events, and the ones it put
 * on the agenda.
 *
 * ## One tap decides (the person and task rows did this in ADR-184)
 *
 * This used to be a form: a checkbox per event, all of them checked, and one
 * "Pôr na agenda" under the list. Each event is now a question with its answer
 * beside it, and a tap writes that one event.
 *
 * Nothing about the write changed. `confirm_entry_event_candidates` takes any
 * list of one to twenty candidate indexes and inserts each on its own — an
 * event never refers to a sibling — so a single index is the request the form
 * sent with one box left checked: the same action, the same five fields. The
 * operation key is bound by the database to the indexes it was first used
 * with, so it is renewed after a success and whenever a different event is
 * tried after a failure; a retry of the same event replays the same key.
 *
 * *Agora não* writes nothing, as unchecking a box wrote nothing: there is no
 * server-side "declined" for an event, so the suggestion is only set aside for
 * this visit, and the label does not promise more than that.
 */

import { RotateCcw } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui";
import type { Locale } from "@/lib/preferences";
import { formatInstant } from "@/lib/time/instant-format";

import { getEventCopy } from "./copy";
import type { AgendaEvent, PendingEventCandidate } from "./entry-events";
import { idleEventActionState, type EventAction, type EventActionState } from "./state";

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

/** The candidate indexes `decide` asked for, or nothing if the field is not such a list. */
function parseCandidateIndexes(value: FormDataEntryValue | null): number[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.every((item): item is number => Number.isInteger(item)) ? parsed : null;
  } catch {
    return null;
  }
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
  const operationKeyRef = useRef(operationKey);
  const submittedIndexesRef = useRef<string | null>(null);
  /** Confirmed here and not yet gone from `pending`, which only a refresh updates. */
  const [confirmedIndexes, setConfirmedIndexes] = useState<ReadonlySet<number>>(() => new Set());
  const [lastConfirmed, setLastConfirmed] = useState<readonly number[]>([]);
  const [setAsideIndexes, setSetAsideIndexes] = useState<ReadonlySet<number>>(() => new Set());
  /** Which confirmation the undo took back, so a later one is not mistaken for undone. */
  const [undoneId, setUndoneId] = useState<string | null>(null);

  async function confirm(previous: EventActionState, formData: FormData): Promise<EventActionState> {
    // `decide` is the only caller; the field is parsed again because a FormData
    // value is still an untrusted boundary.
    const candidateIndexes = parseCandidateIndexes(formData.get("candidateIndexes"));
    if (!candidateIndexes) return { status: "error", message: copy.nothingSelected, undoId: null };

    const serialized = JSON.stringify([...candidateIndexes].sort((a, b) => a - b));
    if (submittedIndexesRef.current !== null && submittedIndexesRef.current !== serialized) {
      operationKeyRef.current = crypto.randomUUID();
    }
    submittedIndexesRef.current = serialized;

    // Built from nothing, so no field can arrive that this function did not set.
    const request = new FormData();
    request.set("entryId", entryId);
    request.set("interpretationId", interpretationId);
    request.set("operationKey", operationKeyRef.current);
    request.set("locale", locale);
    request.set("candidateIndexes", serialized);

    const result = await action(previous, request);
    if (result.status === "success") {
      setConfirmedIndexes((current) => new Set([...current, ...candidateIndexes]));
      setLastConfirmed(candidateIndexes);
      operationKeyRef.current = crypto.randomUUID();
      submittedIndexesRef.current = null;
    }
    return result;
  }

  async function undo(previous: EventActionState, formData: FormData): Promise<EventActionState> {
    const result = await undoAction(previous, formData);
    if (result.status === "success") {
      const undoId = formData.get("undoId");
      setUndoneId(typeof undoId === "string" ? undoId : null);
      // The events are off the agenda again, so their questions are open again.
      setConfirmedIndexes((current) => new Set([...current].filter((index) => !lastConfirmed.includes(index))));
    }
    return result;
  }

  const [state, formAction, busy] = useActionState(confirm, idleEventActionState);
  const [undone, undoFormAction, undoing] = useActionState(undo, idleEventActionState);
  const [, startTransition] = useTransition();

  /** Puts ONE event on the agenda. The index list is built here, never read from the DOM. */
  function decide(candidate: PendingEventCandidate) {
    const formData = new FormData();
    formData.set("candidateIndexes", JSON.stringify([candidate.candidateIndex]));
    startTransition(() => formAction(formData));
  }

  const visible = pending.filter((candidate) => (
    !confirmedIndexes.has(candidate.candidateIndex) && !setAsideIndexes.has(candidate.candidateIndex)
  ));
  const confirmedEvents = onAgenda.filter((event) => event.status === "confirmed");
  const wasUndone = state.undoId !== null && state.undoId === undoneId;

  // Never an empty section: with nothing to ask, nothing on the agenda and
  // nothing to report, this draws nothing at all.
  if (visible.length === 0 && confirmedEvents.length === 0 && state.status === "idle") return null;

  return (
    <div aria-busy={busy}>
      {visible.length > 0 ? (
        <ul aria-label={copy.heading} className="record-question-list">
          {visible.map((candidate) => (
            <li key={candidate.candidateIndex}>
              <div aria-label={copy.decision(candidate.title)} className="record-question" role="group">
                <p className="record-question-text">{copy.question(candidate.title)}</p>
                <p className="record-question-meta">
                  {periodLabel(candidate, locale, timezone)}
                  {candidate.location ? ` · ${candidate.location}` : ""}
                </p>
                <div className="record-question-actions">
                  <Button disabled={busy} onClick={() => decide(candidate)} type="button">
                    {copy.confirm}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => setSetAsideIndexes((current) => new Set([...current, candidate.candidateIndex]))}
                    type="button"
                    variant="ghost"
                  >
                    {copy.notNow}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {state.status === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}
      {state.status === "success" || undone.status !== "idle" ? (
        <div className="confirmation-result">
          <p aria-live="polite" role="status">
            {wasUndone || undone.status === "error" ? undone.message : state.message}
          </p>
          {state.status === "success" && state.undoId && !wasUndone ? (
            <form action={undoFormAction} className="undo-action">
              <input name="undoId" type="hidden" value={state.undoId} />
              <input name="entryId" type="hidden" value={entryId} />
              <input name="locale" type="hidden" value={locale} />
              <Button icon={<RotateCcw />} loading={undoing} type="submit">
                {undoing ? copy.undoing : copy.undo}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {confirmedEvents.length > 0 ? (
        <ul aria-label={copy.onAgendaHeading} className="record-question-list">
          {confirmedEvents.map((event) => (
            <li className="record-question" key={event.id}>
              <p className="record-question-text">{copy.onAgenda(event.title)}</p>
              <p className="record-question-meta">{periodLabel(event, locale, timezone)}</p>
              <CancelEventButton
                action={cancelAction}
                entryId={entryId}
                eventId={event.id}
                label={copy.cancel(event.title)}
                locale={locale}
                text={copy.cancelShort}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CancelEventButton({
  action,
  entryId,
  eventId,
  label,
  locale,
  text,
}: {
  action: EventAction;
  entryId: string;
  eventId: string;
  /** The accessible name, which says WHICH event; it contains the visible text. */
  label: string;
  locale: Locale;
  text: string;
}) {
  const [state, formAction, busy] = useActionState(action, idleEventActionState);
  return (
    <form action={formAction} className="record-question-actions">
      <input name="entryId" type="hidden" value={entryId} />
      <input name="eventId" type="hidden" value={eventId} />
      <input name="locale" type="hidden" value={locale} />
      <Button aria-label={label} loading={busy} type="submit" variant="ghost">{text}</Button>
      {state.status === "error" ? <span role="alert">{state.message}</span> : null}
    </form>
  );
}
