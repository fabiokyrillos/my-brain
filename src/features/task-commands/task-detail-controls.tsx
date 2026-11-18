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

import React, { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { UniversalStateLine } from "@/features/experience/universal-state";
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
export type TaskDetailControlsVariant = "section" | "inline" | "preset" | "fields";

/*
 * `fields` is the task detail's frame since the page was recomposed (ADR-184).
 *
 * The detail said what a task is three times — a read-only list, a second list
 * of its relations, and twelve always-open forms two screens below, each
 * repeating the field it changed. Under `fields` there is one list: every row
 * is a fact with its value, and the row's one quiet verb opens **the same form
 * the other variants render**, in place, under the value it changes.
 *
 * The bar is the one `inline` and `preset` are held to, and it is the reason
 * this is a variant rather than a second component: it changes no control, no
 * eligibility and no intent. The caller says which verbs belong to which row
 * (`TaskDetailFact.actions`); a verb is offered only if it is also in
 * `controls`, which is still `detailControlsFor(status)`. Opening a row is
 * presentation state and nothing else — the form body, `submit`, the
 * per-action operation keys, the composition guard, the confirmation dialog
 * and the outcome region below are shared verbatim.
 */

/**
 * One row of the `fields` variant: a fact about the task, and the verbs that
 * change it.
 *
 * `value` is a node, not a string, because a relation is a link and the server
 * builds it (`task-facts.tsx`). `actions` names command verbs in the order they
 * are offered; it is a *placement*, never a permission.
 */
export type TaskDetailFact = {
  readonly id: string;
  readonly label: string;
  readonly value: ReactNode;
  /** Whether `value` is the wording for "nothing here" rather than a value. */
  readonly empty: boolean;
  /** Whether the row's control adds to a list rather than replacing a value. */
  readonly additive?: boolean;
  readonly actions: readonly TaskCommandAction[];
};

/**
 * The two verbs that are about the task's own words rather than one of its
 * facts. Under `fields` they sit above the list, beside the title they change.
 */
const TITLE_ACTIONS: readonly TaskCommandAction[] = ["rename_task", "append_note"];

/*
 * Life Brain D.1 — `preset` is a row whose value the surface already knows.
 *
 * Planejar is anchored on a day, so "plan this task" has exactly one answer:
 * this day. Rendering a date field (empty, unlabelled on a phone) and an
 * "Aplicar" under every task asked the owner to type what the page already
 * said. Under `preset`, a control whose action has a `defaultValues` entry
 * submits that value as a hidden field, and every control is one button with
 * the surface's own label (`submitLabels`). The same bar as `inline`: it changes
 * no control, no eligibility and no intent — the caller chooses the controls,
 * and every gate below (`buildDetailPatch`, `validateTaskCommand`,
 * `apply_task_command`) runs unchanged on the value it sends.
 */

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
  submitLabels,
  undoAction,
  renderResult = true,
  facts,
  heading,
  lead,
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
  /** Life Brain D.1. Under `preset`, the button's words per action. */
  submitLabels?: Partial<Record<TaskCommandAction, string>>;
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
  /** `fields` only. The rows, already ordered and formatted by the surface. */
  facts?: readonly TaskDetailFact[];
  /** `fields` only. The list's heading; the surface owns the word. */
  heading?: string;
  /**
   * `fields` only. What the surface places between the title's own verbs and
   * the list — on the task detail, Concluir/Aguardar.
   *
   * A slot rather than a sibling because the title verbs and the rows share one
   * open-row state and one outcome region, so they are one component, and the
   * status actions belong visually between the two.
   */
  lead?: ReactNode;
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
  /**
   * `fields` only: which row is open, or null. One at a time, because two open
   * editors are two unfinished thoughts and the page is meant to rest closed.
   *
   * Presentation state. It decides which already-eligible form is on screen and
   * can neither add a control nor send anything.
   */
  const [open, setOpen] = useState<string | null>(null);

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
    // The row closes on success: the page revalidates and the row's own value
    // is the confirmation. A refusal leaves it open, with what was typed.
    if (next.status === "applied") setOpen(null);
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
  const preset = variant === "preset";

  /**
   * One control's form — the only place a control is drawn, for every variant.
   *
   * `caption` is the verb printed under a valued control ("Mudar o prazo").
   * `fields` passes false: there the form sits under the row it edits, which
   * already says so.
   */
  function controlForm(control: DetailControl, caption: boolean) {
    const label = copy.actions[control.action];
    const inputId = `task-control-${control.action}`;
    const intent = control.destructive ? "request_cancel" : "apply";
    const options = control.relation === null ? null : relationOptions[control.relation];
    const proposed = defaultValues?.[control.action];
    // A relation control with nothing to point at is stated rather than
    // rendered as an empty `<select>` the user can only fail to use.
    const empty = options !== null && options.length === 0;

    return (
      <form action={formAction}>
        {hiddenFields(control.action, intent)}

        {preset ? (
          <>
            {proposed === undefined ? null : <input type="hidden" name="value" value={proposed} />}
            <button
              className={control.destructive ? "row-action row-action-destructive" : "row-action"}
              disabled={pending}
              type="submit"
            >
              {submitLabels?.[control.action] ?? label}
            </button>
          </>
        ) : null}

        {preset || control.field === null ? null : (
          <label htmlFor={inputId}>{copy.fields[control.field]}</label>
        )}

        {!preset && control.kind === "text" && control.field !== null ? (
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

        {!preset && control.kind === "date" ? (
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

        {!preset && control.kind === "choice" && control.choices !== null ? (
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

        {!preset && control.kind === "relation" && options !== null && control.relation !== null ? (
          empty ? (
            <UniversalStateLine description={copy.relationEmpty[control.relation]} locale={locale} state="empty" />
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

        {preset ? null : (
          <button
            className={control.destructive ? "row-action row-action-destructive" : "row-action"}
            disabled={pending || empty}
            type="submit"
          >
            {control.field === null || control.destructive ? label : copy.submit}
          </button>
        )}

        {preset || !caption || control.field === null || control.destructive ? null : (
          <span className="task-control-name">{label}</span>
        )}
      </form>
    );
  }

  /*
    One polite live region, announcing the pending phrase while a round is in
    flight and the outcome once it settles. `aria-busy` is what tells a
    screen reader the region is mid-update rather than empty.
  */
  const liveRegion = (
    <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
      {pending ? copy.pendingAnnouncement : state.announcement}
    </div>
  );

  const confirmDialog = (
    <ConfirmDialog
      cancelLabel={copy.confirm.cancel}
      description={copy.confirm.description}
      /*
        Nothing here for the owner to lose: the whole body is hidden inputs and
        buttons, so a tap outside means cancel and cancel means exactly what
        the cancel button means. Stated rather than defaulted — the prop is
        required so that a dialog which later gains an editable field has to
        answer this question again.
      */
      discard={null}
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
  );

  const resultRegion =
    state.status === "idle" || state.status === "awaiting_confirmation" || !renderResult ? null : (
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
    );

  if (variant === "fields") {
    return renderFields();
  }

  const Frame = framed ? "section" : "div";

  return (
    <Frame
      aria-label={copy.sectionTitle}
      className={framed
        ? "task-detail-section task-detail-controls"
        : preset
          ? "task-detail-controls task-detail-controls-inline task-detail-controls-preset"
          : "task-detail-controls task-detail-controls-inline"}
    >
      {framed ? <h2>{copy.sectionTitle}</h2> : null}
      {framed ? <p className="quiet-state">{copy.sectionHint}</p> : null}

      {liveRegion}

      <ul className="task-control-list">
        {controls.map((control) => (
          <li className="task-control" key={control.action}>{controlForm(control, true)}</li>
        ))}
      </ul>

      {confirmDialog}

      {resultRegion}
    </Frame>
  );

  /**
   * The `fields` frame. A function declaration below the return so the shared
   * pieces above read first; it closes over them and adds only the rows, the
   * disclosure and where things sit.
   */
  function renderFields() {
    const rows = facts ?? [];
    const claimed = new Set<TaskCommandAction>([...TITLE_ACTIONS, ...rows.flatMap((fact) => fact.actions)]);
    const titleControls = controls.filter((control) => TITLE_ACTIONS.includes(control.action));
    /*
      Whatever no row and no title verb claimed — today the cancellation, or the
      restoration of a cancelled task. Computed as a remainder rather than named,
      so a verb the taxonomy gains later still reaches this page instead of
      silently having nowhere to render.
    */
    const remaining = controls.filter((control) => !claimed.has(control.action));

    /**
     * The eligible controls placed on one row.
     *
     * A value-less verb on a row is that row's "clear" (`clear_due`,
     * `clear_planned`), and an empty row has nothing to clear — offering it
     * would be a button whose only outcome is "nothing changed".
     */
    const controlsOf = (fact: TaskDetailFact): readonly DetailControl[] =>
      fact.actions.flatMap((id) => {
        const control = controls.find((candidate) => candidate.action === id);
        if (control === undefined) return [];
        return fact.empty && control.kind === "immediate" ? [] : [control];
      });

    const toggleId = (key: string) => `task-fact-toggle-${key}`;
    const editorId = (key: string) => `task-fact-editor-${key}`;

    /** Closing by hand returns focus to the verb that opened the row. */
    const close = (key: string) => {
      setOpen(null);
      document.getElementById(toggleId(key))?.focus();
    };

    /**
     * Escape closes the row it is pressed in. Not during a composition: there
     * Escape belongs to the input method, which uses it to discard a candidate.
     */
    const closeOnEscape = (keys: readonly string[]) => (event: React.KeyboardEvent) => {
      if (event.key !== "Escape" || open === null || !keys.includes(open)) return;
      if (event.nativeEvent.isComposing || composing.current) return;
      event.stopPropagation();
      close(open);
    };

    const toggle = (key: string, text: string, name?: string) => (
      <button
        aria-controls={editorId(key)}
        aria-expanded={open === key}
        aria-label={name}
        className="task-fact-verb"
        id={toggleId(key)}
        onClick={() => setOpen((current) => (current === key ? null : key))}
        type="button"
      >
        {text}
      </button>
    );

    const editor = (key: string, editing: readonly DetailControl[]) => (
      <div className="task-fact-editor" id={editorId(key)}>
        {editing.map((control) => (
          <div className="task-fact-form" key={control.action}>{controlForm(control, false)}</div>
        ))}
        <button className="task-fact-verb" onClick={() => close(key)} type="button">
          {copy.rows.close}
        </button>
      </div>
    );

    const titleKeys = titleControls.map((control) => `title-${control.action}`);
    const openTitle = titleControls.find((control) => open === `title-${control.action}`);

    return (
      <div className="task-detail-controls task-detail-fields">
        {liveRegion}

        {titleControls.length ? (
          // The key handler is on the wrapper, not on a control: it only hears
          // Escape bubbling from the buttons and the form inside it.
          <div className="task-title-controls" onKeyDown={closeOnEscape(titleKeys)}>
            <div className="task-title-verbs">
              {titleControls.map((control) => (
                <React.Fragment key={control.action}>
                  {toggle(`title-${control.action}`, copy.actions[control.action])}
                </React.Fragment>
              ))}
            </div>
            {openTitle ? editor(`title-${openTitle.action}`, [openTitle]) : null}
          </div>
        ) : null}

        {lead}

        <section aria-label={heading ?? copy.sectionTitle} className="task-detail-section">
          <h2>{heading ?? copy.sectionTitle}</h2>

          {/* Above the rows, so the answer is met before the list it changed. */}
          {resultRegion}

          <dl className="task-facts">
            {rows.map((fact) => {
              const editing = controlsOf(fact);
              const key = `fact-${fact.id}`;
              const verb = fact.additive ? copy.rows.add : fact.empty ? copy.rows.set : copy.rows.change;
              return (
                <div className="task-fact" key={fact.id} onKeyDown={closeOnEscape([key])}>
                  <dt>{fact.label}</dt>
                  <dd>
                    <span className="task-fact-value" data-empty={fact.empty ? "true" : undefined}>
                      {fact.value}
                    </span>
                    {editing.length
                      ? toggle(key, verb, `${verb} ${fact.label.toLocaleLowerCase(locale)}`)
                      : null}
                    {editing.length && open === key ? editor(key, editing) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        {remaining.length ? (
          <div className="task-detail-endnote">
            {remaining.map((control) => (
              <div className="task-fact-form" key={control.action}>{controlForm(control, true)}</div>
            ))}
          </div>
        ) : null}

        {confirmDialog}
      </div>
    );
  }
}
