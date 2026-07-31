"use client";

import { CalendarClock, Clock, LoaderCircle, Pencil, RotateCcw, X } from "lucide-react";
import { useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import type { ReminderActionState } from "./action-state";
import { getReminderCopy } from "./copy";
import { useReminderCommand } from "./feedback";
import { SNOOZE_PRESET_MINUTES, type ReminderAction } from "./lifecycle";
import { reminderOperationKey } from "./operation-key";
import type { ReminderViewModel } from "./projection";

/**
 * The row's lifecycle controls (UX-12).
 *
 * ## Only what the state accepts
 *
 * Every control below is rendered from `reminder.actions`, which the projection
 * derived from the same state machine the RPC enforces. UX-12 asks for two
 * things that are easy to conflate and are not the same: *do not render actions
 * the current state cannot accept*, and *do not render disabled placeholders for
 * unsupported operations*. A disabled "Reactivate" on a delivered reminder would
 * satisfy the first and violate the second — it advertises a capability that
 * does not exist and gives the owner nothing to do about it. So an unavailable
 * action is simply absent, and the status hint says why in a sentence.
 *
 * ## Cancellation is the only two-step transition
 *
 * `requiresConfirmation` in `lifecycle.ts` says so, and this is the whole of the
 * implementation of that rule. Snooze, reschedule, restore and edit apply
 * directly after validation: each is reversible through the same boundary
 * (restore undoes cancel, reschedule undoes snooze), so a confirmation step on
 * them would be friction without a fact behind it. Cancel ends a pending
 * delivery, so it asks first — and the confirmation body says the row survives
 * and can be reactivated, because "cancel" is the one word here an owner could
 * reasonably read as "delete".
 *
 * ## The disclosure state is derived, not held
 *
 * `useActionState` returns a fresh object per round, so comparing *which state
 * object* is current closes a panel on success with no effect resetting it —
 * the reasoning `entity-edit-form.tsx` records in full and `memory-edit-form.tsx`
 * reuses. An `open` boolean plus a `useEffect` that clears it is the version
 * that flickers.
 */
export function ReminderActions({
  reminder,
  locale,
  currentScheduleLabel,
  remindAtLocalValue,
}: {
  reminder: ReminderViewModel;
  locale: Locale;
  /**
   * The current schedule, **already formatted by the server**.
   *
   * A `(iso: string) => string` formatter would be the obvious prop here, and it
   * is the one thing that cannot cross this boundary: `reminder-list.tsx` is a
   * Server Component, and React refuses to serialize a function into a Client
   * Component. Shipping that threw at request time and rendered the page's error
   * boundary — invisible to the jsdom component tests, which render both halves
   * as ordinary components with no RSC boundary between them.
   *
   * Passing the finished string also keeps one formatter, bound to one timezone,
   * for the whole page, which is what the route already builds.
   */
  currentScheduleLabel: string;
  /**
   * The same instant as `YYYY-MM-DDTHH:mm` in the owner's timezone, for the
   * `datetime-local` input — **also computed by the server**.
   *
   * The obvious client-side call is `formatInstantForDateTimeLocal`, and it
   * throws for most real reminders: its parser requires seconds to be literally
   * `:00` with no fractional part (`candidate-due-date.ts:2`), while every
   * instant this surface writes or reads carries whatever `now()` had —
   * `2026-07-31T14:37:12.345678+00:00`. Opening the reschedule panel on a
   * just-snoozed reminder therefore threw inside render and took the page to its
   * error boundary. Formatting server-side removes the throwing parser from the
   * client entirely rather than widening a regex two other features depend on.
   */
  remindAtLocalValue: string;
}) {
  // The action state is owned above the list, not here: `cancel` and `restore`
  // unmount this component in the same commit that would have delivered their
  // outcome. See `feedback.tsx` for the whole reasoning.
  const { state, formAction, pending } = useReminderCommand();
  const copy = getReminderCopy(locale);
  const fieldId = useId();

  const [panel, setPanel] = useState<"reschedule" | "edit" | "cancel" | null>(null);
  const [dismissed, setDismissed] = useState<ReminderActionState | null>(null);

  // A success for *this* row closes whatever was open; an error keeps it open so
  // the sentence sits next to the control that produced it.
  const mine = state.reminderId === reminder.id;
  const openPanel = mine && state.status === "success" && dismissed !== state ? null : panel;

  const hidden = (action: ReminderAction) => (
    <>
      <input name="locale" type="hidden" value={locale} />
      <input name="reminderId" type="hidden" value={reminder.id} />
      <input name="action" type="hidden" value={action} />
      <input name="expectedState" type="hidden" value={JSON.stringify(reminder.expectedState)} />
      <input
        name="operationKey"
        type="hidden"
        value={reminderOperationKey(reminder.id, action, reminder.expectedState)}
      />
    </>
  );

  const has = (action: ReminderAction) => reminder.actions.includes(action);

  return (
    <div className="reminder-actions">
      {/*
        No live region here.

        There is exactly one on the page, in `ReminderFeedbackBanner`. A second
        one carrying the same sentence would make a screen reader announce every
        outcome twice, and — since these rows unmount on cancel and restore — the
        row's copy would sometimes be torn down mid-announcement while the page's
        finished. One region, above the list, is both the accessible answer and
        the only one that survives a transition.

        The inline paragraph below is deliberately *not* live: it is the visual
        echo next to the control, already announced elsewhere.
      */}
      <div className="reminder-action-row">
        {has("snooze") ? (
          <form action={formAction} className="reminder-snooze">
            {hidden("snooze")}
            <label className="reminder-inline-label" htmlFor={`${fieldId}-snooze`}>
              {copy.actionLabel.snooze}
            </label>
            <select
              className="reminder-select"
              defaultValue={60}
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
              {pending ? (
                <LoaderCircle aria-hidden="true" className="spin" size={14} />
              ) : (
                <Clock aria-hidden="true" size={14} />
              )}
              {copy.actionLabel.snooze}
            </button>
          </form>
        ) : null}

        {has("reschedule") ? (
          <button
            aria-expanded={openPanel === "reschedule"}
            className="reminder-button"
            onClick={() => {
              setDismissed(state);
              setPanel(openPanel === "reschedule" ? null : "reschedule");
            }}
            type="button"
          >
            <CalendarClock aria-hidden="true" size={14} />
            {copy.actionLabel.reschedule}
          </button>
        ) : null}

        {has("edit") ? (
          <button
            aria-expanded={openPanel === "edit"}
            className="reminder-button"
            onClick={() => {
              setDismissed(state);
              setPanel(openPanel === "edit" ? null : "edit");
            }}
            type="button"
          >
            <Pencil aria-hidden="true" size={14} />
            {copy.actionLabel.edit}
          </button>
        ) : null}

        {has("restore") ? (
          <form action={formAction}>
            {hidden("restore")}
            <button className="reminder-button primary" disabled={pending} type="submit">
              {pending ? (
                <LoaderCircle aria-hidden="true" className="spin" size={14} />
              ) : (
                <RotateCcw aria-hidden="true" size={14} />
              )}
              {copy.actionLabel.restore}
            </button>
          </form>
        ) : null}

        {has("cancel") ? (
          <button
            aria-expanded={openPanel === "cancel"}
            className="reminder-button danger"
            onClick={() => {
              setDismissed(state);
              setPanel(openPanel === "cancel" ? null : "cancel");
            }}
            type="button"
          >
            <X aria-hidden="true" size={14} />
            {copy.actionLabel.cancel}
          </button>
        ) : null}
      </div>

      {openPanel === "reschedule" ? (
        <form action={formAction} className="reminder-panel">
          {hidden("reschedule")}
          {/* Current and proposed are stated side by side, because "what it is
              now" is the fact the owner needs to decide the new value. */}
          <p className="reminder-panel-current">
            {copy.currentSchedule}: <strong>{currentScheduleLabel}</strong>
          </p>
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
      ) : null}

      {openPanel === "edit" ? (
        <form action={formAction} className="reminder-panel">
          {hidden("edit")}
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

      {openPanel === "cancel" ? (
        <form action={formAction} className="reminder-panel danger">
          {hidden("cancel")}
          <p className="reminder-panel-title">{copy.cancelConfirmTitle}</p>
          <p className="reminder-panel-body">{copy.cancelConfirmBody}</p>
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

      {mine && state.status !== "idle" && !pending ? (
        <p className={`reminder-feedback ${state.status === "error" ? "error" : "success"}`}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
