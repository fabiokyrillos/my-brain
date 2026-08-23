"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useActionState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";

import type { Locale } from "@/lib/preferences";

import { getReminderCopy } from "./copy";
import {
  IDLE_REMINDER_SERIES_STATE,
  type ReminderSeriesActionState,
} from "./series-action-state";
import { applyReminderSeriesCommand, undoReminderSeriesOperation } from "./series-actions";

/**
 * The one series-command state for the whole reminders list — slice 2R.2.
 *
 * ## Why it is here and not in the row, for a second reason
 *
 * `feedback.tsx` records the first: `cancel` and `restore` move a reminder out
 * of the current view, so a row that owned its own state would unmount in the
 * same commit that should have shown its outcome.
 *
 * The series commands have that problem and one more. `end_series` cancels the
 * live occurrence, so after `revalidatePath` the row is gone from the pending
 * view — **and with it would go the undo button**. That is not a cosmetic loss:
 * it is the affordance disappearing at the exact moment the owner is most
 * likely to want it, on the one operation whose consequences are widest. An
 * undo control that the successful operation deletes is not an undo control.
 *
 * So the state lives above the list, where nothing a transition does can
 * unmount it, and the offer is rendered in the banner rather than in the row.
 *
 * ## The offer is the id, and the id comes from the database
 *
 * `ReminderSeriesActionState.undoId` is non-null exactly when
 * `apply_reminder_series_command_v1` wrote a ledger row. There is no branch here
 * that decides an operation is reversible — which is how `2R-SERIES-008` is
 * enforced structurally rather than remembered: an operation with no real
 * compensation arrives with no id and therefore cannot be given a button.
 *
 * ## Why `undoneFor` holds a state object rather than a boolean
 *
 * `useActionState` returns a fresh object per round, so *which* command state
 * the current undo result belongs to is expressible by identity. A boolean
 * would be cleared by an effect, and an effect that clears a flag is the
 * version that flickers — the reasoning `reminder-actions.tsx` and
 * `entity-edit-form.tsx` already record.
 */

type ReminderSeriesContext = {
  readonly state: ReminderSeriesActionState;
  readonly formAction: (payload: FormData) => void;
  readonly pending: boolean;
};

const Context = createContext<ReminderSeriesContext | null>(null);

type UndoContext = {
  readonly undoState: ReminderSeriesActionState;
  readonly undoAction: (payload: FormData) => void;
  readonly undoPending: boolean;
  readonly undoneFor: ReminderSeriesActionState | null;
  readonly markUndone: (state: ReminderSeriesActionState) => void;
};

const UndoBridge = createContext<UndoContext | null>(null);

export function ReminderSeriesProvider({ children }: { children: ReactNode }) {
  const [state, formAction, pending] = useActionState(
    applyReminderSeriesCommand,
    IDLE_REMINDER_SERIES_STATE,
  );
  const [undoState, undoAction, undoPending] = useActionState(
    undoReminderSeriesOperation,
    IDLE_REMINDER_SERIES_STATE,
  );
  const [undoneFor, setUndoneFor] = useState<ReminderSeriesActionState | null>(null);

  return (
    <Context.Provider value={{ state, formAction, pending }}>
      <UndoBridge.Provider
        value={{ undoState, undoAction, undoPending, undoneFor, markUndone: setUndoneFor }}
      >
        {children}
      </UndoBridge.Provider>
    </Context.Provider>
  );
}

/**
 * Throws outside a provider rather than returning null, for the reason
 * `useReminderCommand` throws: a control with no action to submit to is a wiring
 * mistake, and a button that silently does nothing is the worst way to find it.
 */
export function useReminderSeriesCommand(): ReminderSeriesContext {
  const context = useContext(Context);
  if (context === null) {
    throw new Error("ReminderSeriesControls must be rendered inside ReminderSeriesProvider");
  }
  return context;
}

function useReminderSeriesUndo(): UndoContext {
  const context = useContext(UndoBridge);
  if (context === null) {
    throw new Error("ReminderSeriesBanner must be rendered inside ReminderSeriesProvider");
  }
  return context;
}

/**
 * `2R-SERIES-009` and `-007` — what was applied, and the one chance to reverse it.
 *
 * The live region **renders whether or not it has anything to say**. A region
 * that appears along with its first sentence is a new element rather than a
 * changed one, and a screen reader announces nothing at all — the defect
 * `a-conditional-live-region-is-never-announced` records, avoided here the same
 * way `ReminderFeedbackBanner` avoids it.
 *
 * The undo button sits **outside** that region. Inside, every re-render of the
 * button's own label would be announced as if it were an outcome.
 */
export function ReminderSeriesBanner({ locale }: { locale: Locale }) {
  const { state, pending } = useReminderSeriesCommand();
  const { undoState, undoAction, undoPending, undoneFor, markUndone } = useReminderSeriesUndo();
  const copy = getReminderCopy(locale).series;

  // The undo result belongs to the command round it was pressed on. A newer
  // command therefore shows its own offer rather than the previous round's
  // outcome, and the previous outcome does not follow it down the page.
  const settled = undoneFor === state;
  const offer = state.status === "success" && state.undoId !== null && !settled
    ? state.undoId
    : null;

  return (
    <div className="reminder-series-feedback">
      <div
        aria-atomic="true"
        aria-busy={pending || undoPending}
        aria-label={copy.resultRegionLabel}
        aria-live="polite"
        className="reminder-series-live"
        role="status"
      >
        {pending ? (
          <p className="reminder-feedback">{copy.working}</p>
        ) : undoPending ? (
          <p className="reminder-feedback">{copy.undoPending}</p>
        ) : settled && undoState.status !== "idle" ? (
          <p
            className={`reminder-feedback ${undoState.status === "error" ? "error" : "success"}`}
          >
            {undoState.message}
          </p>
        ) : state.status === "idle" ? null : (
          <p className={`reminder-feedback ${state.status === "error" ? "error" : "success"}`}>
            {state.message}
          </p>
        )}
      </div>

      {offer === null ? null : (
        <form
          action={undoAction}
          className="reminder-series-undo"
          onSubmit={() => markUndone(state)}
        >
          <input name="locale" type="hidden" value={locale} />
          <input name="undoId" type="hidden" value={offer} />
          <button className="reminder-button" disabled={undoPending} type="submit">
            {undoPending ? (
              <LoaderCircle aria-hidden="true" className="spin" size={14} />
            ) : (
              <RotateCcw aria-hidden="true" size={14} />
            )}
            {copy.undoLabel}
          </button>
        </form>
      )}
    </div>
  );
}
