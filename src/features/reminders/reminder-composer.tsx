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
 * position rather than by presence — a test that only checked the groups existed
 * would pass on any arrangement of them.
 *
 * Slice 2R.3 inserts **repetition** between date-and-time and importance, so
 * there are six. The insertion point is not free: every parameter the rule needs
 * comes from the date above it, and a group that depended on a field two groups
 * away would be a dependency the owner has to infer.
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
 * ## Recurrence, and why it is one select rather than a form
 *
 * This block used to read *"no recurrence, and no shape that could be mistaken
 * for one"*, and that was correct for as long as `reminders` had no column for
 * it: the owner corrected `2P-REMINDER-002` and recurrence became the named
 * remainder `2P-REMINDER-RECURRENCE`. **ADR-132 Decision 1 lifted that refusal
 * for reminders**, `202608230101` shipped the model, and slice 2R.3 adds the
 * control.
 *
 * It is one `<select>`, plus one grouped day picker that appears **only for
 * `weekly`** — which is `2R-SURFACE-001`'s *"without becoming a form"*, and the
 * plan makes turning this dialog into one a stop condition.
 *
 * The first version had no picker at all: every parameter came from the date the
 * owner had already entered, so *every week* meant the weekday of that date. The
 * owner's device checkpoint found the cost of that — repeating on Monday,
 * Wednesday and Friday would have taken **three reminders**, while the model had
 * always stored an array. So `weekly` gained the days, and nothing else did:
 * `monthlyDay`, `monthlyWeekday` and `yearly` still take their parameters from
 * the date above, and `reminder-composer.test.tsx` compares the field list
 * before and after each choice to keep it that way.
 *
 * `recurrence-derivation.ts` holds the reading; this file submits a word and a
 * set of numbers, and knows nothing about rules.
 *
 * The preview beside it is not decoration. It is how the owner checks what was
 * derived, which is what makes a control this small honest — and its dates come
 * from the database (`2R-TIME-007`), never from this component.
 */

import { BellPlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/features/task-commands/confirm-dialog";
import type { Locale } from "@/lib/preferences";

import { IDLE_REMINDER_CREATION_STATE, type ReminderCreationState } from "./action-state";
import { getReminderCopy } from "./copy";
import { RECURRENCE_CHOICES, parseLocalAnchor } from "./recurrence-derivation";
import { previewReminderSeries } from "./series-actions";
import { IDLE_REMINDER_SERIES_PREVIEW } from "./series-action-state";
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

  /**
   * The recurrence choice, and the preview it asks for — slice 2R.3.
   *
   * `choice` is controlled because two other things read it: whether the preview
   * block renders at all, and — through the action — which RPC the save reaches.
   * An uncontrolled select would leave the first of those to a `ref` and the
   * second to chance.
   *
   * The preview has its **own** `useActionState`. Sharing the create action's
   * would mean a preview leaving `state.status === "success"` behind, which is
   * the signal the dialog closes on: asking for the next three dates would shut
   * the dialog in the owner's face.
   */
  const [choice, setChoice] = useState<string>("none");
  const [preview, previewAction, previewPending] = useActionState(
    previewReminderSeries,
    IDLE_REMINDER_SERIES_PREVIEW,
  );

  /**
   * `2R-SURFACE-008` — controlled, because React empties the rest.
   *
   * **React resets an uncontrolled form once a Server Action completes**, so a
   * refused save erased everything the owner had typed: title, instant and all.
   * This repository has the defect recorded as *"a form action resets
   * uncontrolled input"* and `memory-composer.tsx` solved it the same way — but
   * this surface still had it, and it took `2R-SURFACE-008` asking the question
   * to find out. The requirement is *"after a refused save the fields still hold
   * their values"*, and before this they held nothing.
   *
   * Cleared when the dialog **opens** rather than when it closes, so a dismissal
   * still discards the draft (`2P-REMINDER-004`) while a refusal keeps it. Those
   * two are easy to conflate and the difference is the whole requirement.
   */
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");

  /**
   * The weekdays for a weekly rule — **derived, not seeded by an effect**.
   *
   * ## The two states this collapses into one
   *
   * The obvious version holds an array plus a `touched` boolean and syncs the
   * array from the date in a `useEffect`. That is the shape this repository has
   * recorded three times as the version that flickers, and the linter refuses it
   * outright: *avoid calling setState() directly within an effect*.
   *
   * So `chosen` is **nullable, and the null is the meaning**: `null` is *the
   * owner has not answered*, and any array is *they have*. The effective value
   * is derived per render, which means the date can change as often as it likes
   * and there is no moment where the two disagree.
   *
   * **`null` follows the date**, because `2R-SURFACE-001`'s property has to
   * survive the fix — the date already on screen supplies the parameter — and
   * the checkpoint asked for exactly that: *pre-selecionar o dia correspondente
   * à data inicial*. The moment a box is ticked the derivation stops following,
   * so changing the time cannot silently reinstate a day they just removed.
   */
  const [chosenWeekdays, setChosenWeekdays] = useState<readonly number[] | null>(null);
  const anchorWeekday = parseLocalAnchor(when)?.weekday ?? null;
  const weekdays = chosenWeekdays
    ?? (anchorWeekday === null ? [] : [anchorWeekday]);

  /**
   * The form, submitted **by this component** rather than by React — and that is
   * the whole of the second device checkpoint's first finding.
   *
   * ## What was measured
   *
   * `<form action={fn}>` makes React reset the form once the action settles, and
   * the reset returns every control to its `defaultChecked` / `defaultValue`.
   * React restores a *controlled* text input afterwards; it does **not** restore
   * a controlled `checked`, and it does not restore a `<select>`'s value. So the
   * instrumented round trip read:
   *
   * ```
   * before the preview   .checked = 1,3,5
   * FormData -> preview  weekdays = [1,3,5]     <- the preview was always right
   * after the response   .checked = 1
   * FormData -> save     weekdays = [1]         <- and the save was always wrong
   * ```
   *
   * The owner reported it as *"os dias ficam visualmente desmarcados"*. It was
   * never only visual: the dialog showed three days, previewed three days, and
   * the next save carried one, because `deriveRecurrenceRule` reads an empty set
   * as *the owner said nothing* and falls back to the anchor's own weekday. A
   * field that lies about what will be saved is exactly what `2R-SURFACE-008`
   * exists to prevent. The same reset silently untucked `important`.
   *
   * ## Why the fix is one line up here rather than seven workarounds down there
   *
   * This file used to carry a `useEffect` that pushed `choice` back into the
   * `<select>` after every render, because that element had the same problem.
   * Extending that shape to seven checkboxes and a tickbox would be **four more
   * places where the DOM is corrected behind React's back** — the *"duplicação
   * de autoridade entre DOM, estado React e servidor"* the checkpoint's contract
   * forbids in terms.
   *
   * So the reset is removed instead of being papered over. `onSubmit` gives the
   * `FormData` to `useActionState`'s dispatch directly; React only resets a form
   * it submitted itself, so nothing is reset and nothing needs restoring. The
   * `<select>` workaround is **deleted** rather than joined, and constraint
   * validation still runs — `onSubmit` fires only for a valid form.
   */
  /**
   * The form node, for the preview — which reads the very fields this form
   * holds rather than duplicating them into hidden inputs that could drift.
   */
  const formRef = useRef<HTMLFormElement | null>(null);

  const changed = round !== null && state !== round ? state : null;
  const outcome = changed ?? IDLE_REMINDER_CREATION_STATE;
  const created = changed?.status === "success";
  // Closed once the write has landed **and** the transition has settled. The
  // `!pending` half is the whole lesson of slice 2P.6.
  const open = round !== null && !dismissed && !(created && !pending);

  /**
   * The list refresh, **outside the transition that governs the dialog**.
   *
   * `createReminder` deliberately issues no `revalidatePath`; its docstring
   * carries the measurements. The short version: a working revalidation on this
   * route puts the page's re-render inside the action's own transition, and that
   * transition intermittently never settles — server answered 200, nothing
   * logged anywhere, `pending` stuck true, dialog frozen on *Criando…*. The hang
   * is not this slice's (it reproduces with 2P.7's own loader stubbed out), but
   * shipping into it would be.
   *
   * Refreshing here cannot reproduce it, and the reason is structural rather
   * than lucky: this runs only once `pending` is already false and the dialog is
   * already closed, so nothing the refresh does can hold either of them open. If
   * the refresh itself is slow the worst case is a list that updates late, which
   * is a degradation rather than a control that cannot be dismissed.
   *
   * Keyed on the created id and remembered in a ref, so a re-render caused by
   * the refresh cannot trigger a second one.
   */
  const router = useRouter();
  const refreshed = useRef<string | null>(null);
  const createdId = created ? changed?.reminderId ?? null : null;
  useEffect(() => {
    if (createdId === null || pending) return;
    if (refreshed.current === createdId) return;
    refreshed.current = createdId;
    router.refresh();
  }, [createdId, pending, router]);

  return (
    <div className="reminder-compose">
      <button
        className="reminder-compose-open"
        onClick={() => {
          setRound(state);
          setDismissed(false);
          /*
            A fresh dialog is a fresh draft.

            Cleared on OPEN rather than on close, and the two are not the same
            rule: a dismissal must discard what was typed (`2P-REMINDER-004`)
            while a refused save must keep it (`2R-SURFACE-008`). Clearing here
            satisfies both, because a refusal never passes through this handler.
          */
          setTitle("");
          setWhen("");
          setChoice("none");
          setChosenWeekdays(null);
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
        /*
          A write in flight closes nothing and cancels nothing. The fields are
          already disabled while `pending`; without this the cancel button and a
          tap outside would still dismiss the dialog mid-transition, which is
          the shape slice 2P.6 froze on.
        */
        busy={pending}
        /*
          This dialog holds a title, an instant, a rule, a tickbox and a link —
          everything the owner has said. So an outside tap asks first, and asks
          only when there is something to ask about.
        */
        discard={{
          confirmLabel: copy.creation.discardConfirm,
          prompt: copy.creation.discardPrompt,
          resumeLabel: copy.creation.discardResume,
        }}
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

        <form
          onSubmit={(event) => {
            /*
              The browser has already refused an invalid form by the time this
              runs, so `required` is still enforced; what changes is only who
              dispatches — and therefore that React does not reset afterwards.

              `startTransition` is not decoration: a dispatch React did not
              route through its own submission reports `pending` **only** from
              inside one. Without it the dialog never shows *Criando…*, never
              disables its fields, and — because `open` is derived from
              `pending` — loses the guard that slice 2P.6 exists for. The
              suite said so directly the first time this was written without it.

              The payload is read before the transition opens, because
              `currentTarget` is null by the time a deferred callback runs.
            */
            event.preventDefault();
            const payload = new FormData(event.currentTarget);
            startTransition(() => submit(payload));
          }}
          ref={formRef}
        >
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
              onChange={(event) => setTitle(event.target.value)}
              required
              type="text"
              value={title}
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
              onChange={(event) => setWhen(event.target.value)}
              required
              type="datetime-local"
              value={when}
            />
          </label>

          {/*
            3 — repetition (slice 2R.3, `2R-SURFACE-001`).

            **One select, and no new fields**, which is what keeps this a control
            rather than a form — the stop condition the plan names. Every
            parameter a rule needs is already above: *every week* means the
            weekday of the date just chosen, *every month* its day, *every year*
            its month and day. `recurrence-derivation.ts` is where that reading
            lives, and this component does not know it — it submits a word.

            Immediately after date and time on purpose. The group depends on that
            field, and a dependency the owner has to infer from two screens apart
            is one they will get wrong.
          */}
          <label htmlFor="reminder-compose-field-recurrence">
            <span className="reminder-compose-label">{copy.creation.recurrenceLabel}</span>
            <span className="reminder-compose-hint">{copy.creation.recurrenceHint}</span>
            <select
              disabled={pending}
              id="reminder-compose-field-recurrence"
              name="recurrence"
              onChange={(event) => setChoice(event.target.value)}
              value={choice}
            >
              {RECURRENCE_CHOICES.map((option) => (
                <option key={option} value={option}>
                  {copy.creation.recurrenceOption[option]}
                </option>
              ))}
            </select>
          </label>

          {/*
            The weekday picker — the owner device checkpoint's first finding.

            *"Para repetir segunda, quarta e sexta, eu teria de criar três
            lembretes."* The model never required that: `weekdays` has always
            been an array and the RPC has always stored it. The surface offered
            one day, and that was the whole gap.

            **It appears only for `weekly`**, which is what keeps the dialog a
            control rather than a form — the same rule the preview follows. The
            other four frequencies need no days and are given none.

            Checkboxes rather than toggle buttons: the state of a checkbox is
            programmatically determinable without an `aria-pressed` contract to
            get wrong, and it is what a screen reader already knows how to
            announce. The compact face is CSS, so the accessible object stays a
            checkbox while the visual is a seven-across row of targets.

            Each carries `aria-label` with the full weekday name, because *Seg*
            is a face, not a name.
          */}
          {choice !== "weekly" ? null : (
            <fieldset className="reminder-compose-weekdays">
              <legend>{copy.creation.weekdaysLegend}</legend>
              <span className="reminder-compose-hint">{copy.creation.weekdaysHint}</span>
              <div className="reminder-compose-weekday-row">
                {copy.creation.weekdayShort.map((face, index) => {
                  const iso = index + 1;
                  return (
                    <label
                      className="reminder-compose-weekday"
                      htmlFor={`reminder-compose-weekday-${iso}`}
                      key={iso}
                    >
                      <input
                        aria-label={copy.creation.weekdayLong[index]}
                        checked={weekdays.includes(iso)}
                        disabled={pending}
                        id={`reminder-compose-weekday-${iso}`}
                        name="weekdays"
                        onChange={(event) => {
                          // `weekdays` rather than `chosenWeekdays`: the first
                          // tick has to start from what is on screen, which is
                          // the derived seed, not from an empty set.
                          setChosenWeekdays(event.target.checked
                            ? [...weekdays, iso].sort((left, right) => left - right)
                            : weekdays.filter((day) => day !== iso));
                        }}
                        type="checkbox"
                        value={String(iso)}
                      />
                      <span aria-hidden="true">{face}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {/*
            `2R-SURFACE-002` — the next occurrences, before saving.

            It reads the very fields this form holds, so it takes its payload
            from the form element rather than duplicating them into hidden
            inputs that could drift.

            **Not a submit button, and not `formAction`.** Both routed the
            preview through React's own submission, which reset the form the
            moment the preview came back — the defect the round trip above
            measured. A plain button dispatching the action itself leaves every
            control exactly as the owner left it.

            It also restores a claim this file made and did not honour: the
            title is `required`, so previewing before naming a reminder was
            refused by constraint validation and the preview simply never ran.
            Nothing here writes, so there is nothing to guard, and now nothing
            to validate either.
          */}
          {choice === "none" ? null : (
            <div className="reminder-compose-preview">
              <button
                className="reminder-button"
                disabled={pending || previewPending}
                onClick={() => {
                  const form = formRef.current;
                  if (form === null) return;
                  // Same transition rule as the save above: without it
                  // `previewPending` never rises and the button never says
                  // *Calculando…*.
                  const payload = new FormData(form);
                  startTransition(() => previewAction(payload));
                }}
                type="button"
              >
                {previewPending ? copy.creation.previewPending : copy.creation.previewLabel}
              </button>

              {/*
                The region exists before it has anything to say. A live region
                created together with its first sentence is a new element rather
                than a changed one, and a screen reader announces nothing at all.
              */}
              <div
                aria-atomic="true"
                aria-busy={previewPending}
                aria-label={copy.creation.previewRegionLabel}
                aria-live="polite"
                className="reminder-compose-preview-result"
                role="status"
              >
                {preview.status === "error" ? (
                  <p className="reminder-compose-error">{preview.message}</p>
                ) : preview.status === "ready" ? (
                  <>
                    {preview.description === null ? null : (
                      <p className="reminder-compose-preview-rule">{preview.description}</p>
                    )}
                    {preview.occurrences.length === 0 ? (
                      <p className="reminder-compose-hint">{preview.message}</p>
                    ) : (
                      <>
                        <p className="reminder-compose-label">{copy.creation.previewHeading}</p>
                        <ul className="reminder-compose-preview-list">
                          {preview.occurrences.map((occurrence) => (
                            <li key={occurrence}>{occurrence}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* 4 — importance. */}
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

          {/* 5 — the optional link. */}
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

          {/* 6 — save. Cancel is `ConfirmDialog`'s own, rendered after this. */}
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
