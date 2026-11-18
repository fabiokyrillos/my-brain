"use client";

import { LoaderCircle } from "lucide-react";

import type { Locale } from "@/lib/preferences";

import { getReminderCopy } from "./copy";
import { useReminderCommand } from "./feedback";
import type { ReminderAction } from "./lifecycle";
import { reminderOperationKey } from "./operation-key";
import type { ReminderViewModel } from "./projection";

/**
 * A reminder's lifecycle commands, as the pieces two surfaces share (UX-12).
 *
 * ## Only what the state accepts
 *
 * Every control is rendered from `reminder.actions`, which the projection
 * derived from the same state machine the RPC enforces. UX-12 asks for two
 * things that are easy to conflate and are not the same: *do not render actions
 * the current state cannot accept*, and *do not render disabled placeholders for
 * unsupported operations*. A disabled "Reactivate" on a delivered reminder would
 * satisfy the first and violate the second — it advertises a capability that
 * does not exist and gives the owner nothing to do about it. So an unavailable
 * action is simply absent, and the status hint says why in a sentence.
 *
 * ## One verb on the row, the rest on the reminder's page (ADR-180)
 *
 * Life Brain D.1 cut the card from ~18 controls to three and a menu. The list
 * is now rows, and a row has **one** verb — the state's most likely one: an
 * hour's snooze in one tap, or Reactivate. The row's title is the link to the
 * reminder's own page, where its facts are one list and each is changed in
 * place (`reminder-detail.tsx`): reschedule, the other snooze durations, edit,
 * cancel and the rule's controls all live there. Which actions exist is still
 * `reminder.actions` alone — the page moves controls, it never adds one.
 *
 * ## No live region here
 *
 * There is exactly one on the page, in `ReminderFeedbackBanner`. A second one
 * carrying the same sentence would make a screen reader announce every outcome
 * twice, and — since rows unmount on cancel and restore — a row's copy would
 * sometimes be torn down mid-announcement while the page's finished.
 * `ReminderInlineFeedback` is the visual echo beside the control, already
 * announced elsewhere.
 */

/** The hidden half of every command form: who, what, and the state it was read in. */
export function ReminderCommandFields({
  action,
  locale,
  reminder,
}: {
  action: ReminderAction;
  locale: Locale;
  reminder: ReminderViewModel;
}) {
  return (
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
}

/**
 * The one verb a reminder offers without opening anything.
 *
 * `scheduled` → an hour's snooze; `cancelled` → Reactivate; anything else has
 * none, and the component renders nothing rather than a dead control.
 */
export function ReminderRowVerb({
  locale,
  reminder,
  tone = "quiet",
}: {
  locale: Locale;
  reminder: ReminderViewModel;
  /** `quiet` is the list's text verb; `button` is the page's bordered one. */
  tone?: "quiet" | "button";
}) {
  // The action state is owned above the list, not here: `cancel` and `restore`
  // unmount this component in the same commit that would have delivered their
  // outcome. See `feedback.tsx` for the whole reasoning.
  const { formAction, pending } = useReminderCommand();
  const copy = getReminderCopy(locale);
  const action: ReminderAction | null = reminder.actions.includes("snooze")
    ? "snooze"
    : reminder.actions.includes("restore")
      ? "restore"
      : null;
  if (action === null) return null;

  return (
    <form action={formAction} className="reminder-row-verb">
      <ReminderCommandFields action={action} locale={locale} reminder={reminder} />
      {action === "snooze" ? <input name="snoozeMinutes" type="hidden" value={60} /> : null}
      <button
        className={tone === "button" ? "reminder-button" : "reminder-verb"}
        disabled={pending}
        type="submit"
      >
        {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : null}
        {action === "snooze" ? copy.card.snoozeQuick : copy.actionLabel.restore}
      </button>
    </form>
  );
}

/** The outcome of this reminder's last command, beside the control that sent it. */
export function ReminderInlineFeedback({ reminderId }: { reminderId: string }) {
  const { state, pending } = useReminderCommand();
  if (state.reminderId !== reminderId || state.status === "idle" || pending) return null;
  return (
    <p className={`reminder-feedback ${state.status === "error" ? "error" : "success"}`}>
      {state.message}
    </p>
  );
}
