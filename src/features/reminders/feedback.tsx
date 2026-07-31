"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useActionState } from "react";

import { IDLE_REMINDER_ACTION_STATE, type ReminderActionState } from "./action-state";
import { applyReminderCommand } from "./actions";

/**
 * The one action state for the whole reminders list (UX-12).
 *
 * ## Why the state cannot live in the row
 *
 * The row is the obvious owner, and it works for snooze, reschedule and edit —
 * those leave the reminder in the current view, so the component survives the
 * revalidation and keeps its result.
 *
 * It fails for the two transitions that matter most. `cancel` moves a reminder
 * out of the pending view and `restore` moves it out of the cancelled one, so
 * `revalidatePath` re-renders a list the row is no longer in. React applies the
 * new state and the new tree in the same commit, which means the row unmounts
 * *instead of* re-rendering with its outcome: the success sentence is never
 * shown, and the live region is torn down before a screen reader announces
 * anything. Publishing the result upward from the row does not fix it either —
 * the effect that would publish belongs to the component that just unmounted.
 * That version was written, and this is what replaced it.
 *
 * So the state is owned here, above the list, where nothing a transition does
 * can unmount it. The only signal left is `state.reminderId`, which is what
 * keeps one row's message from appearing under another.
 *
 * ## What sharing one action costs, and why it is acceptable
 *
 * Every control on the page now submits the same `formAction`, so `pending`
 * disables all of them while any one is in flight. That is a real change and it
 * is the right one: a single owner issues a single transition at a time, and two
 * concurrent writes against different rows would race the same revalidation.
 * The row identity travels in the form's hidden fields, so the shared action
 * still applies to exactly the reminder whose control was pressed.
 */

type ReminderCommandContext = {
  readonly state: ReminderActionState;
  readonly formAction: (payload: FormData) => void;
  readonly pending: boolean;
};

const Context = createContext<ReminderCommandContext | null>(null);

export function ReminderFeedbackProvider({ children }: { children: ReactNode }) {
  const [state, formAction, pending] = useActionState(
    applyReminderCommand,
    IDLE_REMINDER_ACTION_STATE,
  );
  return (
    <Context.Provider value={{ state, formAction, pending }}>{children}</Context.Provider>
  );
}

/**
 * Throws outside a provider rather than returning null.
 *
 * The row controls are useless without an action to submit to, so a missing
 * provider is a wiring mistake that should fail loudly in development rather
 * than render buttons that do nothing.
 */
export function useReminderCommand(): ReminderCommandContext {
  const context = useContext(Context);
  if (context === null) {
    throw new Error("ReminderActions must be rendered inside ReminderFeedbackProvider");
  }
  return context;
}

export function ReminderFeedbackBanner({
  label,
  working,
}: {
  label: string;
  working: string;
}) {
  const { state, pending } = useReminderCommand();

  return (
    <div
      aria-atomic="true"
      aria-busy={pending}
      aria-label={label}
      aria-live="polite"
      className="reminder-page-feedback"
      role="status"
    >
      {/* The container renders even when empty: a live region has to exist
          before its text arrives, or the change that fills it is not a change
          to announce. */}
      {pending ? (
        <p className="reminder-feedback">{working}</p>
      ) : state.status === "idle" ? null : (
        <p className={`reminder-feedback ${state.status === "error" ? "error" : "success"}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}
