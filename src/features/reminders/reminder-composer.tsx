"use client";

/**
 * Creating a reminder deliberately (`2P-REMINDER-001` … `-004`).
 *
 * ## What it replaces
 *
 * `/app/reminders` mounted `ReminderForm` **inline in the page header**: three
 * controls and a submit button, permanently open above the list, written as one
 * line of JSX carrying locale ternaries. It offered a title, a `datetime-local`
 * and an *important* checkbox with no grouping, no explanation of what a
 * reminder is, no link, and no step between typing and writing.
 *
 * `2P-REMINDER-001` asks the header for a single action rather than a form, and
 * `2P-REMINDER-002` asks the dialog to group **content; date and time;
 * importance; an optional link; then save and cancel, in that order**. That
 * order is the DOM order below, and `reminder-composer.test.tsx` asserts it by
 * position rather than by presence — a test that only checked the five groups
 * existed would pass on any arrangement of them.
 *
 * ## The fourth consumer of `ConfirmDialog`, not a fifth dialog
 *
 * Focus in, Tab trapped, Escape out, focus restored — all of it already exists
 * and is already tested. Writing another one would mean re-proving four
 * behaviours and getting one of them subtly wrong. `idPrefix` is passed because
 * a page can hold this dialog and a row's cancel dialog at once, and two
 * dialogs sharing generated ids do not throw — they silently give
 * `aria-labelledby` the wrong element.
 *
 * ## Openness is derived from `pending`, never closed by an effect
 *
 * Slice 2P.6 found this the hard way in a browser and nowhere below it: closing
 * a dialog while its own transition is still applying unmounts the `<form>` that
 * dispatched the action, and React never lowers `pending` — the row is written,
 * the server is silent, and the dialog is frozen on *Criando…* forever.
 *
 * This surface is **not** protected by the accident that spared the memory
 * composer. `createReminder` revalidates with real route patterns, so its
 * response does carry a re-render to apply. The derivation is therefore load
 * bearing here rather than precautionary.
 *
 * ## No recurrence, and no shape that could be mistaken for one
 *
 * `reminders` has no column for it, so the owner corrected `2P-REMINDER-002` and
 * recurrence became the named remainder `2P-REMINDER-RECURRENCE`. There is no
 * control, no disabled control, no "coming soon", and no placeholder inviting
 * the owner to write a rule into the title.
 */

import { BellPlus, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";

import { ConfirmDialog } from "@/features/task-commands/confirm-dialog";
import type { Locale } from "@/lib/preferences";

import { IDLE_REMINDER_CREATION_STATE, type ReminderCreationState } from "./action-state";
import { getReminderCopy } from "./copy";
import type { ReminderTaskOption } from "./task-options";

export type ReminderCreationHandler = (
  state: ReminderCreationState,
  formData: FormData,
) => Promise<ReminderCreationState>;

export function ReminderComposer({
  action,
  locale,
  taskOptions,
}: {
  action: ReminderCreationHandler;
  locale: Locale;
  /** The owner's own open tasks, already classified — see `task-options.ts`. */
  taskOptions: readonly ReminderTaskOption[];
}) {
  const copy = getReminderCopy(locale);
  const [state, submit, pending] = useActionState(action, IDLE_REMINDER_CREATION_STATE);

  /**
   * The state the dialog opened over, plus whether the owner has dismissed it.
   *
   * `round` is a snapshot rather than a boolean, so *"has anything happened
   * since I opened?"* is answered by comparing values instead of by an effect
   * watching for a change. Opening twice over the same successful result
   * therefore does not immediately re-close.
   */
  const [round, setRound] = useState<ReminderCreationState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const changed = round !== null && state !== round ? state : null;
  const outcome = changed ?? IDLE_REMINDER_CREATION_STATE;
  const created = changed?.status === "success";
  // Closed once the write has landed **and** the transition has settled. The
  // `!pending` half is the whole lesson of slice 2P.6.
  const open = round !== null && !dismissed && !(created && !pending);

  return (
    <div className="reminder-compose">
      <button
        className="reminder-compose-open"
        onClick={() => {
          setRound(state);
          setDismissed(false);
        }}
        type="button"
      >
        <BellPlus aria-hidden="true" size={16} />
        {copy.creation.open}
      </button>

      {/*
        The result lives outside the dialog, because the dialog is gone by the
        time it is worth reading — the same placement the memory composer uses,
        and for the same reason.
      */}
      {!open && outcome.status !== "idle" ? (
        <p
          className={outcome.status === "error" ? "reminder-compose-error" : "reminder-compose-result"}
          role="status"
        >
          {outcome.message}
        </p>
      ) : null}

      <ConfirmDialog
        cancelLabel={copy.creation.cancel}
        /*
          The shared modifier slice 2P.6 added for exactly this case: a dialog
          whose content is a real form rather than one submit button. Reusing it
          is the point — a `reminder-compose-dialog` of my own would be a fourth
          near-copy of the same twelve declarations.
        */
        className="task-command-dialog-form"
        description={copy.creation.description}
        idPrefix="reminder-compose"
        onClose={() => setDismissed(true)}
        open={open}
        title={copy.creation.title}
      >
        {/*
          The progress region, and **only** progress.

          It carried the refusal too at first, and the refusal is also rendered
          visibly at the foot of the form — so the same sentence was in the
          accessibility tree twice and a screen reader read it twice. The visible
          one announces itself through `role="alert"` below; this one says what
          the button cannot, which is that something is happening at all.
        */}
        <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
          {pending ? copy.creation.saving : ""}
        </div>

        <form action={submit}>
          <input name="locale" type="hidden" value={locale} />

          {/* 1 — content. */}
          <label htmlFor="reminder-compose-field-content">
            <span className="reminder-compose-label">{copy.creation.contentLabel}</span>
            <span className="reminder-compose-hint">{copy.creation.contentHint}</span>
            <input
              disabled={pending}
              id="reminder-compose-field-content"
              maxLength={500}
              name="title"
              required
              type="text"
            />
          </label>

          {/* 2 — date and time. */}
          <label htmlFor="reminder-compose-field-when">
            <span className="reminder-compose-label">{copy.creation.whenLabel}</span>
            {/*
              The zone is stated rather than offered. The value is a wall clock
              with no offset, and the server resolves it against
              `profiles.timezone` — never the browser's, which is what
              `remindAtLocal` is named for.
            */}
            <span className="reminder-compose-hint">{copy.creation.whenHint}</span>
            <input
              disabled={pending}
              id="reminder-compose-field-when"
              name="remindAtLocal"
              required
              type="datetime-local"
            />
          </label>

          {/* 3 — importance. */}
          <label className="reminder-compose-check" htmlFor="reminder-compose-field-important">
            <input
              disabled={pending}
              id="reminder-compose-field-important"
              name="important"
              type="checkbox"
              value="on"
            />
            <span>{copy.creation.importantLabel}</span>
          </label>

          {/* 4 — the optional link. */}
          <label htmlFor="reminder-compose-field-task">
            <span className="reminder-compose-label">{copy.creation.linkLabel}</span>
            <span className="reminder-compose-hint">{copy.creation.linkHint}</span>
            <select disabled={pending} id="reminder-compose-field-task" name="taskId">
              {/* Empty is the default, and it is a real choice rather than a
                  prompt: a reminder with no subject is the ordinary kind. */}
              <option value="">{copy.creation.linkNone}</option>
              {taskOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          {/* 5 — save. Cancel is `ConfirmDialog`'s own, rendered after this. */}
          <button className="task-command-primary" disabled={pending} type="submit">
            {pending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
            {pending ? copy.creation.saving : copy.creation.save}
          </button>

          {outcome.status === "error" ? (
            <p className="reminder-compose-error" role="alert">{outcome.message}</p>
          ) : null}
        </form>
      </ConfirmDialog>
    </div>
  );
}
