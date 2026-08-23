"use client";

import { CalendarSync, LoaderCircle, Repeat, Square } from "lucide-react";
import { useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import { getReminderCopy } from "./copy";
import { reminderSeriesOperationKey } from "./operation-key";
import type { ReminderViewModel } from "./projection";
import { useReminderSeriesCommand } from "./series-feedback";
import {
  DEFAULT_REMINDER_SERIES_SCOPE,
  REMINDER_SERIES_SCOPES,
  type ReminderSeriesScope,
} from "./series-schema";

/**
 * The scope question, on the row that raised it — `2R-SERIES-001` … `-009`.
 *
 * ## Nothing here decides what a scope means
 *
 * The control submits a **word from a closed set** — `occurrence` or `future` —
 * and `commandForScope` in `series-schema.ts` is the only place that turns it
 * into a command name. So a label reading *this one* cannot be wired to
 * `edit_future` by a later edit to this file: it has no command name to get
 * wrong. `2R-SURFACE`'s rule that no recurrence rule is reinterpreted in the
 * client holds for the same reason — the rule is never parsed here, and the new
 * instant is never computed here. The time field carries a wall clock and the
 * database resolves it in the owner's zone (`2R-TIME-006`, `-007`).
 *
 * ## The default is the narrower one, and it is a default rather than a decision
 *
 * `OD-2R-4` signed *this occurrence only* as the fallback, and
 * `DEFAULT_REMINDER_SERIES_SCOPE` is where that lives. It is pre-selected so the
 * safe answer costs no clicks — **and nothing is written until submit**, so a
 * pre-selection is not a mutation. The panel is closed until the owner opens it,
 * the radios sit inside the form, and the only thing that writes is the button
 * they press afterwards.
 *
 * ## Why a detached occurrence offers no scope at all
 *
 * It is no longer governed by the rule (`202608230101:619`), so *this and
 * future* would be a promise about a rule this row has left. It states that it
 * is detached instead, which is what makes `2R-SERIES-004` observable rather
 * than merely true: a later series edit not reclaiming it is only a fact the
 * owner can check if the row says it was pulled out.
 *
 * ## Ending asks first, and it is the only control here that does
 *
 * Ending is reversible — the RPC writes a ledger row and the banner offers the
 * undo — so the confirmation is not standing in for a missing compensation. It
 * is there because "end" is the one word on this row an owner could read as
 * "delete", which is the same reason `cancel` asks in `reminder-actions.tsx`.
 * The body says the history survives, because it does.
 */
export function ReminderSeriesControls({
  locale,
  reminder,
  anchorTimeValue,
}: {
  locale: Locale;
  reminder: ReminderViewModel;
  /**
   * The occurrence's wall clock as `HH:MM` in the owner's zone — **computed by
   * the server**, like every other instant this list renders.
   *
   * A client-side `toTimeString()` would read the browser's zone, which is
   * precisely the second timezone authority `2R-TIME-006` forbids and
   * `2R-TZ-SECOND-AUTHORITY` is still carried for.
   */
  anchorTimeValue: string;
}) {
  const { state, formAction, pending } = useReminderSeriesCommand();
  const copy = getReminderCopy(locale).series;
  const fieldId = useId();

  const [panel, setPanel] = useState<"edit" | "end" | null>(null);
  const [dismissed, setDismissed] = useState(state);

  const series = reminder.series;
  if (series === null) return null;

  // A success closes whatever this row had open; an error keeps it open so the
  // sentence in the banner still has its control beside it.
  const mine = state.seriesId === series.id;
  const openPanel = mine && state.status === "success" && dismissed !== state ? null : panel;

  const occurrence = {
    id: reminder.id,
    remindAt: reminder.remindAt,
    detached: series.detached,
  };

  const hidden = (intent: "occurrence" | "future" | "end") => (
    <>
      <input name="locale" type="hidden" value={locale} />
      <input name="seriesId" type="hidden" value={series.id} />
      <input
        name="operationKey"
        type="hidden"
        value={reminderSeriesOperationKey(series.id, intent, occurrence)}
      />
    </>
  );

  // An ended rule and a detached occurrence both keep the badge and lose the
  // controls. Rendering a disabled control for an operation that cannot happen
  // is the placeholder UX-12 refuses; absence says the same thing truthfully.
  const editable = series.active && !series.detached;

  return (
    <div className="reminder-series">
      <p className="reminder-series-facts">
        <span className="status-badge reminder-series-badge">
          <Repeat aria-hidden="true" size={12} /> {copy.badge}
        </span>
        {series.detached ? (
          <span className="status-badge reminder-series-detached">{copy.detachedBadge}</span>
        ) : null}
      </p>

      {series.detached ? <p className="reminder-series-hint">{copy.detachedHint}</p> : null}

      {editable ? (
        <>
          <div className="reminder-action-row">
            <button
              aria-expanded={openPanel === "edit"}
              className="reminder-button"
              onClick={() => {
                setDismissed(state);
                setPanel(openPanel === "edit" ? null : "edit");
              }}
              type="button"
            >
              <CalendarSync aria-hidden="true" size={14} />
              {copy.editLabel}
            </button>
            <button
              aria-expanded={openPanel === "end"}
              className="reminder-button danger"
              onClick={() => {
                setDismissed(state);
                setPanel(openPanel === "end" ? null : "end");
              }}
              type="button"
            >
              <Square aria-hidden="true" size={14} />
              {copy.endLabel}
            </button>
          </div>

          {/*
            `2R-SERIES-006`, stated where it is needed rather than discovered.

            Cancelling an occurrence is the Phase 2P control a few lines above
            this one, and it leaves the rule alone — the database materialises
            the next occurrence on the same transition. The sentence is here
            because the owner reading a row that says "Repeats" has no other way
            to know which of the two a cancel would reach.
          */}
          <p className="reminder-series-hint">{copy.occurrenceCancelNote}</p>
        </>
      ) : null}

      {openPanel === "edit" ? (
        <form action={formAction} className="reminder-panel">
          {hidden(
            // The intent that mints the key is the DEFAULT, not the radio's live
            // value: the key is a hidden field fixed at render, and reading a
            // control that has not been submitted yet would make it change under
            // the owner's cursor. The scope the RPC applies still comes from the
            // radio — `2R-SERIES-009` reports back what the database did.
            "occurrence",
          )}

          <fieldset className="reminder-scope">
            <legend>{copy.scopeLegend}</legend>
            <p className="reminder-series-hint">{copy.scopeHint}</p>
            {REMINDER_SERIES_SCOPES.map((scope: ReminderSeriesScope) => (
              <label
                className="reminder-checkbox"
                htmlFor={`${fieldId}-scope-${scope}`}
                key={scope}
              >
                <input
                  defaultChecked={scope === DEFAULT_REMINDER_SERIES_SCOPE}
                  disabled={pending}
                  id={`${fieldId}-scope-${scope}`}
                  name="scope"
                  type="radio"
                  value={scope}
                />
                {scope === "occurrence" ? copy.scopeOccurrence : copy.scopeFuture}
              </label>
            ))}
          </fieldset>

          <label htmlFor={`${fieldId}-series-title`}>
            {copy.titleLabel}
            <input
              defaultValue={reminder.title}
              disabled={pending}
              id={`${fieldId}-series-title`}
              maxLength={500}
              name="title"
              required
              type="text"
            />
          </label>

          <label htmlFor={`${fieldId}-series-time`}>
            {copy.timeLabel}
            <input
              defaultValue={anchorTimeValue}
              disabled={pending}
              id={`${fieldId}-series-time`}
              name="anchorTime"
              required
              type="time"
            />
          </label>

          <div className="reminder-panel-actions">
            <button className="reminder-button primary" disabled={pending} type="submit">
              {pending ? (
                <LoaderCircle aria-hidden="true" className="spin" size={14} />
              ) : null}
              {pending ? copy.working : copy.apply}
            </button>
            <button className="reminder-button" onClick={() => setPanel(null)} type="button">
              {copy.close}
            </button>
          </div>
        </form>
      ) : null}

      {openPanel === "end" ? (
        <form action={formAction} className="reminder-panel danger">
          {hidden("end")}
          {/* `end` travels as its own field rather than as a third scope: the
              scope set is what `2R-SERIES-001` offers for an EDIT, and adding a
              third member would put "end the whole thing" in the same control
              as "change this one". */}
          <input name="end" type="hidden" value="on" />
          <input name="scope" type="hidden" value={DEFAULT_REMINDER_SERIES_SCOPE} />
          <p className="reminder-panel-title">{copy.endConfirmTitle}</p>
          <p className="reminder-panel-body">{copy.endConfirmBody}</p>
          <div className="reminder-panel-actions">
            <button className="reminder-button danger" disabled={pending} type="submit">
              {pending ? copy.working : copy.endConfirmAccept}
            </button>
            <button className="reminder-button" onClick={() => setPanel(null)} type="button">
              {copy.endConfirmDismiss}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
