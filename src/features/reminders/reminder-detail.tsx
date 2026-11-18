"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import type { ReminderActionState } from "./action-state";
import { getReminderCopy } from "./copy";
import { useReminderCommand } from "./feedback";
import { SNOOZE_PRESET_MINUTES, type ReminderAction } from "./lifecycle";
import type { ReminderViewModel } from "./projection";
import {
  ReminderCommandFields,
  ReminderInlineFeedback,
  ReminderRowVerb,
} from "./reminder-actions";
import { ReminderSeriesControls } from "./series-controls";
import { useReminderSeriesOutcomes } from "./series-feedback";

/**
 * One reminder, as a page (ADR-180; the precedent is the task page, ADR-185).
 *
 * The page a notification tap opens used to render the list's card — one row of
 * a list, under a heading that said "Lembrete". It is now the reminder itself:
 * its text is the page's subject, in the reading face; under it, what state it
 * is in and the one verb that state most likely wants; then its facts as **one
 * list** — when it fires, how it repeats, what it is tied to — each changed in
 * place by the control that already existed, opened under the row it changes.
 * What ends something (the rule, the reminder) waits at the foot, in the risk
 * tone, and still asks first.
 *
 * ## What did not change
 *
 * Every form below posts the same fields to the same two actions through the
 * same two providers. Which controls exist is `reminder.actions` and the
 * series' own state, exactly as before; this file arranges them.
 *
 * ## Cancellation is the only two-step transition
 *
 * `requiresConfirmation` in `lifecycle.ts` says so. Snooze, reschedule, restore
 * and edit apply directly after validation: each is reversible through the same
 * boundary. Cancel ends a pending delivery, so it asks first — and the
 * confirmation body says the row survives and can be reactivated, because
 * "cancel" is the one word here an owner could reasonably read as "delete".
 *
 * ## The disclosure state is derived, not held
 *
 * `useActionState` returns a fresh object per round, so comparing *which state
 * object* is current closes an editor on success with no effect resetting it.
 *
 * ## The page re-reads itself after a command
 *
 * The actions revalidate the **list's** path, and a Server Function's
 * `revalidatePath` updates the UI only "if viewing the affected path" — this
 * page is `/reminders/<id>`, not `/reminders`. Left at that, a snooze here
 * would leave the old hour on screen and the next command would carry a stale
 * expected state. So a success asks the router for this route again. The
 * effect is keyed to the outcome objects, which are new per round, so it runs
 * once per command and never because of its own refresh.
 *
 * ## Strings, never formatters
 *
 * Every instant arrives **already formatted by the server**, in the owner's
 * zone: a function cannot cross into a Client Component, and a client-side
 * format would read the browser's zone — the second timezone authority
 * `2R-TIME-006` forbids.
 */
export function ReminderDetail({
  anchorTimeValue,
  locale,
  reminder,
  remindAtLocalValue,
  whenValue,
}: {
  /** The occurrence's wall clock, `HH:MM`, for the rule's time field. */
  anchorTimeValue: string;
  locale: Locale;
  reminder: ReminderViewModel;
  /** The instant as a `datetime-local` value in the owner's zone. */
  remindAtLocalValue: string;
  /** The instant this state is about (the delivery once sent), formatted. */
  whenValue: string;
}) {
  const { state, formAction, pending } = useReminderCommand();
  const copy = getReminderCopy(locale);
  const fieldId = useId();

  const [panel, setPanel] = useState<"reschedule" | "edit" | "cancel" | null>(null);
  const [dismissed, setDismissed] = useState<ReminderActionState | null>(null);

  // A success for this reminder closes whatever was open; an error keeps it
  // open so the sentence sits next to the control that produced it.
  const mine = state.reminderId === reminder.id;
  const openPanel = mine && state.status === "success" && dismissed !== state ? null : panel;
  const toggle = (next: "reschedule" | "edit" | "cancel") => {
    setDismissed(state);
    setPanel(openPanel === next ? null : next);
  };

  const has = (action: ReminderAction) => reminder.actions.includes(action);

  const router = useRouter();
  const [seriesOutcome, undoOutcome] = useReminderSeriesOutcomes();
  useEffect(() => {
    if (state.status === "success" && state.reminderId === reminder.id) router.refresh();
  }, [state, reminder.id, router]);
  useEffect(() => {
    if (seriesOutcome.status === "success") router.refresh();
  }, [seriesOutcome, router]);
  useEffect(() => {
    if (undoOutcome.status === "success") router.refresh();
  }, [undoOutcome, router]);

  // The label is the state's, not a constant: "next reminder" over a delivered
  // row would be the same lie the raw status badge once told.
  const whenLabel = reminder.hasPendingDelivery
    ? copy.nextDelivery
    : reminder.status === "sent"
      ? copy.deliveredAt
      : copy.scheduleWas;

  // A scheduled reminder's hint ("vai disparar no horário") repeats the row
  // under it; the other states need theirs, and a passed hour says so.
  const note = reminder.overdue
    ? copy.overdueNote
    : reminder.status === "scheduled"
      ? null
      : copy.statusHint[reminder.status];

  return (
    <article
      className={`reminder-detail ${reminder.status}`}
      // The anchor the History subject link targets.
      id={`reminder-${reminder.id}`}
    >
      <header className="reminder-detail-head">
        {/* The way out matters more here than on most pages: someone who
            arrived by tapping a notification has no history to go back through. */}
        <Link className="reminder-detail-back" href={`/${locale}/app/reminders`}>
          <ChevronLeft aria-hidden="true" size={16} />
          {copy.detail.backToList}
        </Link>
        <h1 className="reminder-detail-title">{reminder.title}</h1>
        <p className="reminder-detail-state">
          {/* A localized label, never the column value (UX-21). */}
          <span className="reminder-state">{copy.statusLabel[reminder.status]}</span>
          {reminder.important ? <span className="reminder-important">{copy.list.important}</span> : null}
        </p>
        {note === null ? null : (
          <p className="reminder-detail-note" data-tone={reminder.overdue ? "attention" : undefined}>
            {note}
          </p>
        )}

        {has("snooze") || has("restore") || has("edit") ? (
          <div className="reminder-detail-verbs">
            <ReminderRowVerb locale={locale} reminder={reminder} tone="button" />
            {has("edit") ? (
              <button
                aria-expanded={openPanel === "edit"}
                className="reminder-fact-verb"
                onClick={() => toggle("edit")}
                type="button"
              >
                {copy.actionLabel.edit}
              </button>
            ) : null}
          </div>
        ) : null}

        {openPanel === "edit" ? (
          <form action={formAction} className="reminder-panel reminder-fact-editor">
            <ReminderCommandFields action="edit" locale={locale} reminder={reminder} />
            <label htmlFor={`${fieldId}-title`}>
              {copy.editTitleLabel}
              <input
                defaultValue={reminder.title}
                disabled={pending}
                id={`${fieldId}-title`}
                maxLength={500}
                name="title"
                required
                type="text"
              />
            </label>
            <label className="reminder-checkbox" htmlFor={`${fieldId}-important`}>
              <input
                defaultChecked={reminder.important}
                disabled={pending}
                id={`${fieldId}-important`}
                name="important"
                type="checkbox"
              />
              {copy.editImportantLabel}
            </label>
            <div className="reminder-panel-actions">
              <button className="reminder-button primary" disabled={pending} type="submit">
                {pending ? copy.working : copy.submit}
              </button>
              <button className="reminder-button" onClick={() => setPanel(null)} type="button">
                {copy.close}
              </button>
            </div>
          </form>
        ) : null}

        <ReminderInlineFeedback reminderId={reminder.id} />
      </header>

      <section aria-labelledby={`${fieldId}-facts`} className="reminder-detail-section">
        <h2 className="reminder-group-heading" id={`${fieldId}-facts`}>{copy.detail.factsHeading}</h2>
        <dl className="reminder-facts">
          <div className="reminder-fact">
            <dt>{whenLabel}</dt>
            <dd>
              <span className="reminder-fact-value">{whenValue}</span>
              {has("reschedule") ? (
                <button
                  aria-expanded={openPanel === "reschedule"}
                  className="reminder-fact-verb"
                  onClick={() => toggle("reschedule")}
                  type="button"
                >
                  {copy.actionLabel.reschedule}
                </button>
              ) : null}
              {openPanel === "reschedule" ? (
                <div className="reminder-fact-editor">
                  <form action={formAction} className="reminder-panel">
                    <ReminderCommandFields action="reschedule" locale={locale} reminder={reminder} />
                    <label htmlFor={`${fieldId}-remind-at`}>
                      {copy.proposedSchedule}
                      <input
                        defaultValue={remindAtLocalValue}
                        disabled={pending}
                        id={`${fieldId}-remind-at`}
                        name="remindAtLocal"
                        required
                        type="datetime-local"
                      />
                    </label>
                    <div className="reminder-panel-actions">
                      <button className="reminder-button primary" disabled={pending} type="submit">
                        {pending ? copy.working : copy.submit}
                      </button>
                      <button className="reminder-button" onClick={() => setPanel(null)} type="button">
                        {copy.close}
                      </button>
                    </div>
                  </form>
                  {/* The other way to move it: by a duration instead of to an hour. */}
                  {has("snooze") ? (
                    <form action={formAction} className="reminder-snooze">
                      <ReminderCommandFields action="snooze" locale={locale} reminder={reminder} />
                      <label className="reminder-inline-label" htmlFor={`${fieldId}-snooze`}>
                        {copy.card.snoozeFor}
                      </label>
                      <select
                        className="reminder-select"
                        defaultValue={180}
                        disabled={pending}
                        id={`${fieldId}-snooze`}
                        name="snoozeMinutes"
                      >
                        {SNOOZE_PRESET_MINUTES.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {copy.snoozePreset[minutes]}
                          </option>
                        ))}
                      </select>
                      <button className="reminder-button" disabled={pending} type="submit">
                        {copy.actionLabel.snooze}
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </dd>
          </div>

          <div className="reminder-fact">
            <dt>{copy.detail.repeat}</dt>
            <dd>
              {/* Absent — not disabled — for a reminder that carries no rule. */}
              {reminder.series === null ? (
                <span className="reminder-fact-value" data-empty="true">{copy.detail.noRepeat}</span>
              ) : (
                <ReminderSeriesControls
                  anchorTimeValue={anchorTimeValue}
                  locale={locale}
                  part="fact"
                  reminder={reminder}
                />
              )}
            </dd>
          </div>

          <div className="reminder-fact">
            <dt>{copy.detail.subject}</dt>
            <dd>
              {reminder.link === null ? (
                // Which absence it means (Life Brain B.7): no linked subject,
                // which is not the same as "does not repeat", the row above.
                <span className="reminder-fact-value" data-empty="true">{copy.independent}</span>
              ) : (
                <Link className="reminder-fact-link" href={reminder.link.href}>
                  {copy.list.linked[reminder.link.kind](reminder.link.label)}
                </Link>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <footer className="reminder-detail-foot">
        {/* The per-reminder audit trail (UX-12's "history where practical"). */}
        <Link className="reminder-history-link" href={reminder.historyHref}>
          {copy.historyLink}
        </Link>

        {reminder.series === null ? null : (
          <ReminderSeriesControls
            anchorTimeValue={anchorTimeValue}
            locale={locale}
            part="end"
            reminder={reminder}
          />
        )}

        {has("cancel") ? (
          <button
            aria-expanded={openPanel === "cancel"}
            className="reminder-risk-verb"
            onClick={() => toggle("cancel")}
            type="button"
          >
            {copy.actionLabel.cancel}
          </button>
        ) : null}

        {openPanel === "cancel" ? (
          <form action={formAction} className="reminder-panel danger">
            <ReminderCommandFields action="cancel" locale={locale} reminder={reminder} />
            <p className="reminder-panel-title">{copy.cancelConfirmTitle}</p>
            {/*
              Two bodies, chosen by a fact rather than hedged into one sentence —
              slice 2R.2, `2R-SERIES-008`.

              For an attached occurrence of an active rule, cancelling
              materialises the replacement, the replacement takes the one live
              slot `reminders_one_live_occurrence_per_series` allows, and
              `restore` is then refused by that index. So `cancelConfirmBody`'s
              promise that the row "can be reactivated later" is false for
              exactly this shape, and the operation has to name itself before it
              asks.
            */}
            <p className="reminder-panel-body">
              {reminder.series !== null && reminder.series.active && !reminder.series.detached
                ? copy.cancelConfirmBodySeries
                : copy.cancelConfirmBody}
            </p>
            <div className="reminder-panel-actions">
              <button className="reminder-button danger" disabled={pending} type="submit">
                {pending ? copy.working : copy.cancelConfirmAccept}
              </button>
              <button className="reminder-button" onClick={() => setPanel(null)} type="button">
                {copy.cancelConfirmDismiss}
              </button>
            </div>
          </form>
        ) : null}
      </footer>
    </article>
  );
}
