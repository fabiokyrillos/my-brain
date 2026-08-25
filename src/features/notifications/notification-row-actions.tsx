"use client";

/**
 * One notice's controls: **the primary action, and one compact menu.**
 *
 * ## What this component does not do
 *
 * It decides nothing. The verb set arrives already filtered by
 * `verbsForRow`, which asks `isEligibleStatus` — so a control whose only
 * possible outcome is a refusal is never rendered here, and the primary is
 * whichever verb the subject's own state put first (`2S-ACT-001`, `-005`).
 *
 * Every write is dispatched to an authority that already existed:
 * `applyWorkItemAction` for completion, `applyTaskDetailCommand` for
 * rescheduling, `markNotification` for the two message dispositions, and
 * `suppressNotificationSubject` — which is itself an adapter to the RPC slice
 * 2S.1 created. **Nothing here reimplements a transition** (`2S-TRUST-010`).
 *
 * ## Nothing from the database is rendered
 *
 * Refusals arrive as codes and are turned into sentences by `refusal-copy.ts`.
 * No SQLSTATE, no constraint name, no `error.message` reaches the screen. The
 * `ActionRefusal` union is closed and `refusalMessage` is total over it, so
 * there is no fall-through that could print raw text.
 */

import React, { useActionState, useEffect, useId, useRef, useState } from "react";

import { UndoAffordance, type TaskUndoHandler } from "@/features/operations/undo-affordance";
import type { WorkItemActionState } from "@/features/operations/work-action-state";
import type { TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import type { TaskUndoOffer } from "@/features/task-commands/task-undo-state";
import type { Locale } from "@/lib/preferences";

import { getNotificationActionCopy } from "./action-copy";
import { refusalMessage, type ActionRefusal } from "./refusal-copy";
import type { NotificationRowView } from "./row-projection";
import type { NotificationSubject } from "./subject";
import { getVerbCopy, type VerbDefinition, type VerbId } from "./verbs";

export type MarkHandler = (formData: FormData) => Promise<void>;
export type WorkHandler = (state: WorkItemActionState, formData: FormData) => Promise<WorkItemActionState>;
export type DetailHandler = (state: TaskDetailCommandState, formData: FormData) => Promise<TaskDetailCommandState>;
export type SuppressHandler = (input: unknown, locale?: unknown) => Promise<
  | Readonly<{ ok: true; suppressionId: string | null; undo: TaskUndoOffer | null; replaced: boolean }>
  | Readonly<{ ok: false; code: string }>
>;

/**
 * The five authorities a notice's verbs dispatch to, carried as one bundle.
 *
 * Every one of them **existed before Phase 2S** — `2S-TRUST-010`, whose wording
 * makes a new writer a stop condition rather than a finding. Grouping them here
 * is not tidiness: a surface that wants the verbs has to accept exactly this
 * set, so it cannot quietly substitute a sixth destination of its own.
 *
 * They arrive as props because these are Server Actions and the row is a Client
 * Component — the same boundary `TaskDetailSurface` crosses when it mounts
 * `WorkItemActions`.
 */
export type NotificationVerbHandlers = {
  readonly markAction: MarkHandler;
  readonly suppressAction: SuppressHandler;
  readonly workAction: WorkHandler;
  readonly detailAction: DetailHandler;
  readonly undoAction: TaskUndoHandler;
};

/**
 * **The one mount point for a notice's verbs**, taking the projection's own row.
 *
 * `2S-ACT-011` requires the verb set and its copy to be read from one source
 * and to be *equal* across `/app/notifications` and the attention surface. One
 * shared `verbs.ts` is necessary and not sufficient: two surfaces could each
 * call `NotificationRowActions` and pass different things into `primaryVerb` and
 * `menuVerbs` — one of them filtered, re-sorted, or assembled by hand — and the
 * shared vocabulary would be intact while the rendered rows disagreed.
 *
 * So neither surface builds those props. Both hand over the whole
 * `NotificationRowView` that `projectNotificationRows` produced, and the mapping
 * from row to controls happens **here, once**. A surface that wanted a different
 * verb set would have to stop using this function, which is a visible change and
 * the thing `phase-2s-verb-authority.test.ts` looks for.
 */
export function NotificationVerbs({
  row,
  locale,
  handlers,
}: {
  row: NotificationRowView;
  locale: Locale;
  handlers: NotificationVerbHandlers;
}) {
  return (
    <NotificationRowActions
      detailAction={handlers.detailAction}
      locale={locale}
      markAction={handlers.markAction}
      menuVerbs={row.menuVerbs}
      notificationId={row.notification.id}
      primaryVerb={row.primaryVerb}
      subject={row.subject}
      subjectLabel={row.subjectLabel}
      suppressAction={handlers.suppressAction}
      undoAction={handlers.undoAction}
      workAction={handlers.workAction}
    />
  );
}

/**
 * What one round comes to rest at. Flat, and carrying no database text.
 *
 * ONE sentence, not a visible one and an announced one. The two nodes were
 * merged into a single live region, so two fields here would be two things that
 * could disagree about what just happened -- and only one of them would ever be
 * heard.
 */
type RowState = {
  readonly status: "idle" | "applied" | "failed";
  readonly message: string;
  readonly undo: TaskUndoOffer | null;
};

const IDLE: RowState = { status: "idle", message: "", undo: null };

/**
 * What can actually take focus inside the panel.
 *
 * `input:not([type="hidden"])` is the whole point, and it cost two wrong
 * diagnoses to find: the panel carries a hidden input naming the verb, a plain
 * `input` selector matched THAT first, and a hidden input cannot be focused --
 * so focus silently stayed on the body while everything else looked correct.
 */
const FOCUSABLE = 'button, input:not([type="hidden"]), select, textarea, [href]';

export function NotificationRowActions({
  locale,
  notificationId,
  subject,
  subjectLabel,
  primaryVerb,
  menuVerbs,
  markAction,
  suppressAction,
  workAction,
  detailAction,
  undoAction,
}: {
  locale: Locale;
  notificationId: string;
  subject: NotificationSubject | null;
  subjectLabel: string;
  primaryVerb: VerbDefinition | null;
  menuVerbs: readonly VerbDefinition[];
  markAction: MarkHandler;
  suppressAction: SuppressHandler;
  workAction: WorkHandler;
  detailAction: DetailHandler;
  undoAction: TaskUndoHandler;
}) {
  const verbCopy = getVerbCopy(locale);
  const copy = getNotificationActionCopy(locale);
  const menuId = useId();
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** The verb waiting on its own inline panel — a date, a reason, or a question. */
  const [panelVerb, setPanelVerb] = useState<VerbDefinition | null>(null);

  /**
   * The operation keys, one per verb, held in a ref and minted lazily.
   *
   * **Never in the render body**: `useActionState`'s pending→settled transition
   * is a re-render and StrictMode double-renders in development, so a key
   * minted during render would differ between the two and the idempotency check
   * would refuse a legitimate action. This is the discipline
   * `work-item-actions.tsx` already carries, reproduced because the same
   * hazard applies.
   */
  const keys = useRef<Map<VerbId, string>>(new Map());
  function operationKeyFor(id: VerbId): string {
    const existing = keys.current.get(id);
    if (existing !== undefined) return existing;
    const minted = crypto.randomUUID();
    keys.current.set(id, minted);
    return minted;
  }

  function refused(code: ActionRefusal): RowState {
    const message = refusalMessage(locale, code);
    return { status: "failed", message, undo: null };
  }

  async function submit(_previous: RowState, formData: FormData): Promise<RowState> {
    const verbId = String(formData.get("verb") ?? "") as VerbId;
    const verb = [primaryVerb, ...menuVerbs].find((candidate) => candidate?.id === verbId);
    if (!verb) return IDLE;

    try {
      if (verb.scope === "message") {
        const payload = new FormData();
        payload.set("locale", locale);
        payload.set("notificationId", notificationId);
        payload.set("status", verb.id === "mark_read" ? "read" : "dismissed");
        await markAction(payload);
        const message = copy.applied[verb.id];
        // No undo offered: `markNotification` writes no compensation row, and a
        // control that reported success while restoring nothing is exactly what
        // `2S-TRUST-013` refuses.
        return { status: "applied", message, undo: null };
      }

      if (verb.scope === "cadence") {
        if (!subject) return refused("SUPPRESSION_SUBJECT_MISSING");
        const result = await suppressAction(
          {
            entityType: subject.subjectType,
            entityId: subject.subjectId,
            scope: verb.id === "silence_until" ? "until" : "forever",
            suppressedUntil:
              verb.id === "silence_until" ? toInstant(formData.get("until")) : undefined,
            reason: String(formData.get("reason") ?? ""),
          },
          locale,
        );
        if (!result.ok) return refused(result.code as ActionRefusal);
        const message = copy.applied[verb.id];
        return { status: "applied", message, undo: result.undo };
      }

      // scope === "task": dispatch to the authority that already owns the
      // transition. `2S-ACT-003` / `-004`.
      if (!subject || subject.subjectType !== "task") return refused("invalid");

      if (verb.id === "complete_task") {
        const payload = new FormData();
        payload.set("locale", locale);
        payload.set("taskId", subject.subjectId);
        payload.set("action", "complete_task");
        payload.set("title", subjectLabel);
        payload.set("operationKey", operationKeyFor(verb.id));
        const next = await workAction(idleWork(), payload);
        // Rotated after every terminal outcome, matching the Work surface: a
        // refusal rolls back the reservation, so no key is burned.
        if (next.status !== "idle") keys.current.delete(verb.id);
        if (next.status === "applied") {
          return {
            status: "applied",
            // The authority's own sentence. `announcement` and `detail` differ there
            // because it has two nodes; here there is one, so the visible
            // sentence is the announced one and cannot drift from it.
            message: next.detail || next.announcement,
            // Straight from the database's own answer, never constructed here.
            undo: next.undo,
          };
        }
        // `refreshable` is the authority's own word for "you are looking at a
        // stale row" — surfaced as the reload `2S-ACT-008` asks for.
        return refused(next.refreshable ? "stale" : "failed");
      }

      // reschedule_due, through the task-detail command path.
      const payload = new FormData();
      payload.set("locale", locale);
      payload.set("taskId", subject.subjectId);
      payload.set("action", "reschedule_due");
      payload.set("dueAt", String(formData.get("dueAt") ?? ""));
      payload.set("operationKey", operationKeyFor(verb.id));
      const next = await detailAction(idleDetail(), payload);
      if (next.status !== "idle") keys.current.delete(verb.id);
      if (next.status === "applied") {
        return { status: "applied", message: next.detail || next.announcement, undo: next.undo ?? null };
      }
      return refused(next.refreshable ? "stale" : "failed");
    } catch {
      /*
       * A thrown Server Action — a network fault, or `requireSupabaseSuccess`
       * raising. `2S-ACT-008`: the row survives with its content intact and the
       * reason is shown. Nothing about the exception is rendered.
       */
      return refused("failed");
    }
  }

  const [state, formAction, pending] = useActionState(submit, IDLE);

  /**
   * Focus enters the question once it is really on the page.
   *
   * Three attempts, and the way each failed is worth keeping:
   *
   * 1. `queueMicrotask` from the click handler — the panel did not exist yet,
   *    because React had not rendered it when the handler returned.
   * 2. A **callback ref** on the form — it fired, and focus still did not land.
   *    A parent's ref runs before the node is connected to the document, and an
   *    element outside the document cannot take focus.
   * 3. An effect with a plain `input` selector — it ran, the node was
   *    connected, and focus *still* did not land: the panel's first `input` is
   *    the **hidden** field naming the verb, and a hidden input cannot be
   *    focused. Hence `FOCUSABLE`.
   *
   * An effect sets no state, so it cannot cascade; it depends on the panel's
   * identity, so a re-render while the question is open does not steal focus
   * back from wherever the owner has tabbed to.
   */
  const openPanelId = panelVerb && state.status !== "applied" ? panelVerb.id : null;
  useEffect(() => {
    if (!openPanelId) return;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  }, [openPanelId]);

  /*
   * ONE ANNOUNCEABLE NODE, AND IT IS THE VISIBLE ONE.
   *
   * The first version of this component had two: an `sr-only` `role="status"`
   * carrying the announcement, and a separate visible `<p>` carrying the same
   * sentence. That did **not** produce two announcements — the visible `<p>`
   * had no `role` and no `aria-live`, so nothing announced it — but it did put
   * the same text in the accessibility tree twice, where a reader navigating
   * the row meets it once as a status and again as ordinary content.
   *
   * So the visible paragraph **is** the live region now. One node, one source:
   *
   * - **It exists before the result does.** Always rendered, empty at rest. A
   *   region mounted at the same moment its text arrives is a region screen
   *   readers do not announce — a defect this repository has already paid for.
   *   `:empty` collapses it to zero height in CSS, which keeps it out of the
   *   layout without `display:none` or `visibility:hidden`, either of which
   *   would take it out of the accessibility tree and break the announcement.
   * - **Pending never announces success.** While a round is in flight the text
   *   is the pending phrase and `aria-busy` is true; the outcome replaces it
   *   when it settles.
   * - **Each outcome is announced once.** `aria-atomic` means the region is
   *   read as a whole on change, and there is exactly one change per round.
   * - **A new action replaces the previous announcement** rather than appending
   *   to it, because the node's whole content is the current sentence.
   *
   * Focus is deliberately NOT moved on settle. `WorkItemActions` moves it to
   * its outcome; here the outcome is beside controls the owner may want to use
   * again, and a row that grabs focus on every round would be a row that
   * fights the keyboard.
   */
  const announcement = pending ? copy.pendingAnnouncement : state.message;

  /*
   * OPENNESS IS DERIVED, NOT SET FROM AN EFFECT.
   *
   * A settled round should return the row to one primary plus one trigger. The
   * obvious way to do that is a `useEffect` that calls `setPanelVerb(null)` —
   * and it is wrong twice: it is a cascading render, and this repository has
   * already shipped a dialog that closed mid-transition and froze because its
   * openness was stored rather than derived.
   *
   * So the applied outcome simply wins over the stored intent. No effect, no
   * second render, and no state that can disagree with the round it belongs to.
   */
  const settled = state.status === "applied";
  const activePanel = settled ? null : panelVerb;
  const isMenuOpen = settled ? false : menuOpen;

  /** `2S-ACCESS-006`: focus returns to the trigger that opened the menu. */
  function closeMenu() {
    setMenuOpen(false);
    menuTrigger.current?.focus({ preventScroll: true });
  }

  /**
   * Focus, for the panel that asks before dismissing.
   *
   * The contract is narrow and worth stating: while the question is open, Tab
   * stays inside it, and closing it — by answering, by cancelling, or with
   * Escape — puts focus back on the control that opened it. That control is the
   * **menu trigger**, not the menu item: the item was inside a menu this panel
   * closed, so returning focus there would return it to something no longer on
   * screen.
   */
  const panel = useRef<HTMLFormElement | null>(null);

  function focusables(): HTMLElement[] {
    if (!panel.current) return [];
    return [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((element) => !element.hasAttribute("disabled"));
  }

  function openPanel(verb: VerbDefinition) {
    setPanelVerb(verb);
    setMenuOpen(false);
    // Focus is moved by the effect below, not here: the panel does not exist in
    // the DOM until React has rendered it, so a `queueMicrotask` scheduled from
    // this handler finds `panel.current` still null. Measured, not assumed —
    // the first version did exactly that and the focus test caught it.
  }

  function closePanel() {
    setPanelVerb(null);
    menuTrigger.current?.focus({ preventScroll: true });
  }

  /** Keeps Tab inside the open question, and lets Escape cancel it. */
  function trapFocus(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusables();
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function renderVerbButton(verb: VerbDefinition, className: string) {
    const needsPanel = verb.confirm || verb.id === "silence_until" || verb.id === "silence_subject" || verb.id === "reschedule_task";
    if (needsPanel) {
      return (
        <button
          aria-label={verbCopy[verb.id].accessibleName(subjectLabel)}
          className={className}
          disabled={pending}
          key={verb.id}
          onClick={() => openPanel(verb)}
          type="button"
        >
          {verbCopy[verb.id].label}
        </button>
      );
    }
    return (
      <form action={formAction} key={verb.id}>
        <input name="verb" type="hidden" value={verb.id} />
        <button
          aria-label={verbCopy[verb.id].accessibleName(subjectLabel)}
          className={className}
          /* `2S-ACT-007`: disabled while pending, so a second click cannot
             produce a second write. The operation key is the real defence —
             this is the one the owner can see. */
          disabled={pending}
          type="submit"
        >
          {verbCopy[verb.id].label}
        </button>
      </form>
    );
  }

  return (
    <div className="notification-row-actions">

      {primaryVerb ? renderVerbButton(primaryVerb, "row-action notification-primary-action") : null}

      {/*
        ESCAPE IS HEARD HERE, NOT ON THE LIST, AND THE DIFFERENCE IS A REAL
        DEFECT THIS SLICE SHIPPED FOR THREE COMMITS.

        The handler used to sit on the `<ul role="menu">`. Opening the menu
        leaves focus on the **trigger**, which is the list's SIBLING — so the
        keydown never reached the list and Escape did nothing. A menu a
        keyboard user can open and cannot close is the whole of what
        `2S-ACCESS-006` is about, and every one of the panel's four focus
        tests passed the entire time, because they test the panel.

        On the container, both ways in are covered: a keydown on the trigger
        and a keydown on any item bubble to the same place.
      */}
      {menuVerbs.length ? (
        <div
          className="notification-verb-menu"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !isMenuOpen) return;
            event.stopPropagation();
            closeMenu();
          }}
        >
          <button
            aria-controls={menuId}
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={copy.menuLabel(subjectLabel)}
            className="row-action notification-menu-trigger"
            disabled={pending}
            onClick={() => setMenuOpen((open) => !open)}
            ref={menuTrigger}
            type="button"
          >
            {copy.menuTrigger}
          </button>
          {isMenuOpen ? (
            <ul
              className="notification-verb-menu-list"
              id={menuId}
              role="menu"
            >
              {menuVerbs.map((verb) => (
                <li key={verb.id} role="none">
                  <div role="menuitem" tabIndex={-1}>
                    {renderVerbButton(verb, "notification-verb-menu-item")}
                    <span className="notification-verb-meaning">{verbCopy[verb.id].meaning}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {activePanel ? (
        <form action={formAction} className="notification-verb-panel" onKeyDown={trapFocus} ref={panel}>
          <input name="verb" type="hidden" value={activePanel.id} />
          <p className="notification-verb-panel-meaning">{verbCopy[activePanel.id].meaning}</p>

          {activePanel.confirm ? (
            /* `2S-ACT-010`: the question is in the same panel and names what is
               lost. Cancelling leaves everything unchanged — it only closes the
               panel, and no request was made. */
            <p className="notification-verb-panel-question">{copy.confirmQuestion[activePanel.id]}</p>
          ) : null}

          {activePanel.id === "silence_until" ? (
            <label className="notification-verb-panel-field">
              {copy.untilLabel}
              <input name="until" required type="date" />
            </label>
          ) : null}

          {activePanel.id === "reschedule_task" ? (
            <label className="notification-verb-panel-field">
              {copy.dueLabel}
              <input name="dueAt" required type="date" />
            </label>
          ) : null}

          {activePanel.scope === "cadence" ? (
            <label className="notification-verb-panel-field">
              {copy.reasonLabel}
              <input maxLength={400} name="reason" type="text" />
            </label>
          ) : null}

          <div className="notification-verb-panel-controls">
            <button className="row-action" disabled={pending} type="submit">
              {activePanel.confirm ? copy.confirmAction : copy.applyAction}
            </button>
            <button
              className="row-action"
              disabled={pending}
              onClick={closePanel}
              type="button"
            >
              {copy.cancelAction}
            </button>
          </div>
        </form>
      ) : null}

      {/*
        The outcome, and the row survives it. A failure leaves the notice and
        its menu exactly where they were — `2S-ACT-008` — so this is a message
        beside the controls rather than a replacement for them.
      */}
      <p
        aria-atomic="true"
        aria-busy={pending}
        aria-live="polite"
        className="notification-row-outcome"
        data-status={pending ? "pending" : state.status}
        role="status"
      >
        {announcement}
      </p>

      {/*
        `2S-ACT-009`: offered only where the database returned a real
        compensation. `undo` is null for both message dispositions, so no
        control appears for them at all.
      */}
      <UndoAffordance action={undoAction} locale={locale} undo={state.undo} />
    </div>
  );
}

/** `HTML date` gives `YYYY-MM-DD`; the RPC takes an instant. */
function toInstant(value: FormDataEntryValue | null): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function idleWork(): WorkItemActionState {
  return {
    status: "idle", taskId: null, action: null, title: null,
    heading: "", detail: "", announcement: "", refreshable: false, retryable: false, undo: null,
  };
}

/**
 * Written out in full rather than cast.
 *
 * An `as TaskDetailCommandState` over a partial object would compile today and
 * stay compiling if the state gained a field — which is exactly the drift this
 * slice is supposed to be careful about. Spelled out, a new field is a type
 * error here, which is where it should be.
 */
function idleDetail(): TaskDetailCommandState {
  return {
    status: "idle",
    action: null,
    heading: "",
    detail: "",
    reason: null,
    announcement: "",
    pending: null,
    refreshable: false,
    retryable: false,
    undo: null,
  };
}
