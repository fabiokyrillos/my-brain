"use client";

/**
 * Slice D2 — the eleven command verbs the task detail surface can offer, as
 * controls.
 *
 * Before this, `apply_task_command` served fifteen actions and the product
 * reached four of them by click; the other eleven existed only behind a
 * natural-language console (UX-05). Nothing here widens the write path: every
 * control submits to `applyTaskDetailCommand`, which resolves through
 * `list_task_command_candidates` and applies through `apply_task_command` —
 * the same two RPCs a Work click has used since Phase 2F.
 *
 * **The controls are not written here.** They arrive already derived from the
 * taxonomy by `detailControlsFor(status)`, which is what stops this component
 * offering a button whose only possible outcome is a refusal (2F-SURFACE-009).
 * This file decides how a `date` looks, not which verbs exist.
 *
 * **The destructive verb never renders its dialog first.** `cancel_task` sends
 * `request_cancel`, the server resolves the row and issues the confirmation
 * against *that* observation, and only then does the dialog open — carrying the
 * operation key and instant the digest was derived from. Opening the dialog
 * client-side and issuing at Confirm time would bind the token to whatever the
 * form said afterwards, which is the failure 2E-DESTRUCTIVE-003 names.
 */

import React, { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/preferences";

import { UndoAffordance, type TaskUndoHandler } from "@/features/operations/undo-affordance";

import { ConfirmDialog } from "./confirm-dialog";
import {
  idleTaskDetailCommandState,
  type TaskDetailCommandState,
} from "./detail-action-state";
import { getTaskDetailControlsCopy } from "./detail-controls-copy";
import type { DetailControl, DetailRelationKind } from "./detail-controls";
import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from "./schema";
import type { TaskCommandAction, TaskCommandPatchField } from "./taxonomy";

export type TaskDetailRelationOption = { readonly id: string; readonly label: string };

/** The caller's own entities, by the relation kind a control asks for. */
export type TaskDetailRelationOptions = Readonly<
  Record<DetailRelationKind, readonly TaskDetailRelationOption[]>
>;

export type TaskDetailCommandHandler = (
  state: TaskDetailCommandState,
  formData: FormData,
) => Promise<TaskDetailCommandState>;

/** The ±730-day window, computed server-side so hydration cannot disagree. */
export type TaskDetailDateBounds = { readonly min: string; readonly max: string };

/** A note is long-form; every other free-text field is a single line. */
const LONG_FIELDS: readonly TaskCommandPatchField[] = ["note"];

const MAX_LENGTH_BY_FIELD: Partial<Record<TaskCommandPatchField, number>> = {
  title: MAX_TITLE_LENGTH,
  note: MAX_NOTE_LENGTH,
};

/**
 * How the controls are framed, and nothing else.
 *
 * Added in Phase 2L so the Work list can mount these without a second copy
 * (`2L-EDIT-001`). `section` is the task detail's own frame — a landmark with
 * its own heading. `inline` is a row's, where the heading would put one `<h2>`
 * per task into the document outline and the hint would repeat fifty times.
 *
 * **It changes no control, no eligibility and no intent.** A variant that could
 * add or remove a verb would be the second copy this prop exists to avoid, so
 * everything below the frame is shared verbatim.
 */
export type TaskDetailControlsVariant = "section" | "inline";

/**
 * A value the *surface* proposes for a control, per action.
 *
 * `2M-REVIEW-003`. The day review's `carry_forward` is `set_planned` with the
 * next day already filled in, and its `follow_up` is `set_status` with `waiting`
 * already chosen — the user still presses the button, and can still change what
 * is in the field before doing so.
 *
 * **It changes no control, no eligibility and no intent**, which is the same bar
 * `variant` is held to. It fills an input's initial value, and every gate below
 * runs unchanged: `buildDetailPatch` re-checks the bounds, `validateTaskCommand`
 * re-checks the taxonomy, and `apply_task_command` re-checks the row. A preset a
 * policy would refuse is refused exactly as a typed one would be.
 */
export type TaskDetailControlDefaults = Partial<Record<TaskCommandAction, string>>;

export function TaskDetailControls({
  action,
  locale,
  taskId,
  title,
  controls,
  defaultValues,
  relationOptions,
  dateBounds,
  variant = "section",
  undoAction,
  renderResult = true,
}: {
  action: TaskDetailCommandHandler;
  locale: Locale;
  taskId: string;
  /** The rendered title. A resolution query hint only, never a gate. */
  title: string;
  controls: readonly DetailControl[];
  /** `2M-REVIEW-003`. Initial values a surface proposes; see the type's own note. */
  defaultValues?: TaskDetailControlDefaults;
  relationOptions: TaskDetailRelationOptions;
  dateBounds: TaskDetailDateBounds;
  variant?: TaskDetailControlsVariant;
  /** `2L-EDIT-008`. Injected like every other action this component calls. */
  undoAction?: TaskUndoHandler;
  /**
   * Whether the outcome is rendered *here*.
   *
   * `2M-CAL-010`. On a task detail the outcome belongs here, because the task is
   * still on the page after it changes. On a **date-partitioned** surface it
   * cannot live here at all: a successful `reschedule_due` moves the task to
   * another day, the revalidated calendar no longer lists it, and this whole
   * subtree unmounts at the exact moment there is something to undo. Such a
   * surface passes false and announces the outcome itself, from a component the
   * day's contents cannot unmount.
   */
  renderResult?: boolean;
}) {
  const copy = getTaskDetailControlsCopy(locale);
  const router = useRouter();
  const result = useRef<HTMLDivElement | null>(null);

  /**
   * The operation keys, one per action (2F-SURFACE-006).
   *
   * Held in a ref and minted lazily — **never in the render body**, where every
   * re-render would re-mint: `useActionState`'s pending→settled transition is a
   * re-render, and StrictMode double-renders in development.
   *
   * Scoped per action rather than per surface because one key carrying two
   * different request fingerprints is refused with `2E_IDEMPOTENCY_MISMATCH`.
   * The pair of calls a cancellation takes deliberately shares one key: the
   * confirmation is stored against `(user, operation key)` and the apply
   * resolves it by the same pair, so a second key would leave the issued row
   * unreachable.
   */
  const keys = useRef<Map<TaskCommandAction, string>>(new Map());

  /**
   * Whether the user dismissed the prompt the current round returned.
   *
   * Needed because `useActionState` state changes only by dispatching, so
   * "awaiting confirmation" cannot be cleared by closing the dialog — and
   * `router.refresh()` re-fetches the server tree while leaving client state
   * exactly as it was, so a dialog closed that way would immediately re-render
   * open. Cleared by the next dispatch, in `submit` below.
   */
  const [dismissed, setDismissed] = useState(false);

  /**
   * `2L-MOBILE-010` — whether an input method is mid-composition.
   *
   * A single-line `<input>` inside a `<form>` submits on Enter, and Enter is
   * also how an IME **commits** a candidate. On a Japanese, Chinese or Korean
   * keyboard the first Enter therefore means "that is the word I meant", and
   * submitting on it would send a half-typed value the user never chose.
   *
   * A ref rather than state: this is read inside an event handler and must not
   * cause a render — a re-render mid-composition is the other half of what this
   * requirement forbids.
   */
  const composing = useRef(false);
  const compositionProps = {
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: () => { composing.current = false; },
    onKeyDown: (event: React.KeyboardEvent) => {
      // `isComposing` is the platform's own answer where it exists; the ref is
      // the fallback for the browsers that only fire the composition events.
      if (event.key === "Enter" && (event.nativeEvent.isComposing || composing.current)) {
        event.preventDefault();
      }
    },
  };

  function operationKeyFor(id: TaskCommandAction): string {
    const existing = keys.current.get(id);
    if (existing !== undefined) return existing;
    const minted = crypto.randomUUID();
    keys.current.set(id, minted);
    return minted;
  }

  async function submit(
    state: TaskDetailCommandState,
    formData: FormData,
  ): Promise<TaskDetailCommandState> {
    // `2L-MOBILE-010`, the second half. `preventDefault` on the keydown stops
    // the common path; this stops every other one — a form submitted while a
    // composition is open carries a value the user has not finished choosing,
    // and the honest answer is to do nothing rather than to send it.
    if (composing.current) return state;
    const clicked = formData.get("action");
    if (typeof clicked !== "string") return state;
    const commandAction = clicked as TaskCommandAction;
    // Carried at submit time and **never rendered into markup**: a hidden input
    // holding a client-minted uuid would not match the value the server
    // rendered, and React would report a hydration mismatch.
    formData.set("operationKey", operationKeyFor(commandAction));
    // A new dispatch is what un-dismisses the prompt, rather than the arrival of
    // a new state object: two consecutive rounds can settle at equal states, and
    // keying this on the state's identity would leave the prompt suppressed for
    // a user who changed their mind twice.
    setDismissed(false);
    const next = await action(state, formData);
    // Rotated after every **terminal** outcome. `awaiting_confirmation` is not
    // one — the key it issued a confirmation against is the key the Confirm
    // call has to spend.
    if (next.status !== "idle" && next.status !== "awaiting_confirmation") {
      keys.current.delete(commandAction);
    }
    return next;
  }

  const [state, formAction, pending] = useActionState(submit, idleTaskDetailCommandState);

  // Focus lands on the outcome after every settled round, so a keyboard or
  // screen-reader user is told what happened. Deliberately not while a
  // confirmation is open: the dialog moves focus into itself, and stealing it
  // back would trap the user outside the prompt they are being asked about.
  useEffect(() => {
    if (state.status !== "idle" && state.status !== "awaiting_confirmation") {
      result.current?.focus();
    }
  }, [state]);

  const pendingConfirmation =
    state.status === "awaiting_confirmation" && !dismissed ? state.pending : null;

  /**
   * Abandons the issued confirmation rather than holding it open.
   *
   * The key is rotated, so asking to cancel again is a *new* request with a new
   * confirmation bound to a fresh observation. Reusing it would re-issue against
   * the same key — idempotent, and therefore bound to the instant of the
   * observation the user already walked away from.
   *
   * The abandoned row is left where it is. It is unconsumed, `apply_task_command`
   * is the only thing that can spend it, and it can only be spent by a request
   * whose seven values hash to the digest it stores — so an unspent confirmation
   * authorizes nothing.
   */
  function dismissConfirmation() {
    if (state.pending !== null) keys.current.delete(state.pending.action);
    setDismissed(true);
  }

  function hiddenFields(commandAction: TaskCommandAction, intent: string) {
    return (
      <>
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="action" value={commandAction} />
      </>
    );
  }

  const framed = variant === "section";
  const Frame = framed ? "section" : "div";

  return (
    <Frame
      aria-label={copy.sectionTitle}
      className={framed ? "task-detail-section task-detail-controls" : "task-detail-controls task-detail-controls-inline"}
    >
      {framed ? <h2>{copy.sectionTitle}</h2> : null}
      {framed ? <p className="quiet-state">{copy.sectionHint}</p> : null}

      {/*
        One polite live region, announcing the pending phrase while a round is in
        flight and the outcome once it settles. `aria-busy` is what tells a
        screen reader the region is mid-update rather than empty.
      */}
      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.pendingAnnouncement : state.announcement}
      </div>

      <ul className="task-control-list">
        {controls.map((control) => {
          const label = copy.actions[control.action];
          const inputId = `task-control-${control.action}`;
          const intent = control.destructive ? "request_cancel" : "apply";
          const options = control.relation === null ? null : relationOptions[control.relation];
          const proposed = defaultValues?.[control.action];
          // A relation control with nothing to point at is stated rather than
          // rendered as an empty `<select>` the user can only fail to use.
          const empty = options !== null && options.length === 0;

          return (
            <li className="task-control" key={control.action}>
              <form action={formAction}>
                {hiddenFields(control.action, intent)}

                {control.field === null ? null : (
                  <label htmlFor={inputId}>{copy.fields[control.field]}</label>
                )}

                {control.kind === "text" && control.field !== null ? (
                  LONG_FIELDS.includes(control.field) ? (
                    <textarea
                      defaultValue={proposed}
                      id={inputId}
                      maxLength={MAX_LENGTH_BY_FIELD[control.field]}
                      name="value"
                      rows={3}
                      {...compositionProps}
                    />
                  ) : (
                    <input
                      defaultValue={proposed}
                      id={inputId}
                      maxLength={MAX_LENGTH_BY_FIELD[control.field]}
                      name="value"
                      type="text"
                      {...compositionProps}
                    />
                  )
                ) : null}

                {control.kind === "date" ? (
                  // `type="date"` emits `YYYY-MM-DD`, which is exactly the one
                  // temporal shape `explicit_date` resolves — and it resolves it
                  // in the caller's own zone, so the control never sends an
                  // instant. The bounds mirror the lexicon's ±730 days, so a
                  // date it would decline cannot be picked in the first place.
                  <input
                    defaultValue={proposed}
                    id={inputId}
                    max={dateBounds.max}
                    min={dateBounds.min}
                    name="value"
                    type="date"
                  />
                ) : null}

                {control.kind === "choice" && control.choices !== null ? (
                  <select
                    defaultValue={proposed !== undefined && control.choices.includes(proposed) ? proposed : ""}
                    id={inputId}
                    name="value"
                  >
                    <option disabled value="">{copy.choosePlaceholder}</option>
                    {control.choices.map((choice) => (
                      <option key={choice} value={choice}>
                        {copy.choices[choice as keyof typeof copy.choices] ?? choice}
                      </option>
                    ))}
                  </select>
                ) : null}

                {control.kind === "relation" && options !== null && control.relation !== null ? (
                  empty ? (
                    <p className="quiet-state">{copy.relationEmpty[control.relation]}</p>
                  ) : (
                    // The **name** is submitted, never the id. It is resolved by
                    // `resolve_owned_entity_exact` inside the candidate query,
                    // so ownership is proven in the database rather than
                    // asserted by this form — and there is no path for the UI to
                    // smuggle an id it was not given.
                    <select defaultValue="" id={inputId} name="value">
                      <option disabled value="">{copy.choosePlaceholder}</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.label}>{option.label}</option>
                      ))}
                    </select>
                  )
                ) : null}

                <button
                  className={control.destructive ? "row-action row-action-destructive" : "row-action"}
                  disabled={pending || empty}
                  type="submit"
                >
                  {control.field === null || control.destructive ? label : copy.submit}
                </button>

                {control.field === null || control.destructive ? null : (
                  <span className="task-control-name">{label}</span>
                )}
              </form>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        cancelLabel={copy.confirm.cancel}
        description={copy.confirm.description}
        onClose={dismissConfirmation}
        open={pendingConfirmation !== null}
        title={copy.confirm.title}
      >
        {pendingConfirmation === null ? null : (
          <form action={formAction}>
            {hiddenFields(pendingConfirmation.action, "confirm_cancel")}
            {/*
              The instant the confirmation's digest was derived from. Sent back
              unchanged because `task_command_fingerprint` hashes it alongside
              the pre-state: a second instant derives a different digest, and
              the database refuses a cancellation the user genuinely confirmed.
            */}
            <input type="hidden" name="observedBefore" value={pendingConfirmation.observedBefore} />
            <p className="task-control-target">{pendingConfirmation.title}</p>
            <button className="row-action row-action-destructive" disabled={pending} type="submit">
              {copy.confirm.submit}
            </button>
          </form>
        )}
      </ConfirmDialog>

      {state.status === "idle" || state.status === "awaiting_confirmation" || !renderResult ? null : (
        <div
          aria-label={copy.resultRegionLabel}
          className="work-action-result"
          ref={result}
          // A named landmark rather than a bare `div`: a screen-reader user can
          // navigate back to the answer after moving away from it.
          role="region"
          tabIndex={-1}
        >
          <strong>{state.heading}</strong>
          <p>{state.detail}</p>
          {state.reason === null ? null : <p className="task-control-reason">{state.reason}</p>}
          {state.refreshable && (
            <button className="row-action" onClick={() => router.refresh()} type="button">
              {copy.refresh}
            </button>
          )}
          {/* `2L-EDIT-008`, the same affordance the Work list mounts. */}
          {undoAction ? <UndoAffordance action={undoAction} locale={locale} undo={state.undo} /> : null}
        </div>
      )}
    </Frame>
  );
}
