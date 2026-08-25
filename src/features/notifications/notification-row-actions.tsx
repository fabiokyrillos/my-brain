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

import { useActionState, useId, useRef, useState } from "react";

import { UndoAffordance, type TaskUndoHandler } from "@/features/operations/undo-affordance";
import type { WorkItemActionState } from "@/features/operations/work-action-state";
import type { TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import type { TaskUndoOffer } from "@/features/task-commands/task-undo-state";
import type { Locale } from "@/lib/preferences";

import { getNotificationActionCopy } from "./action-copy";
import { refusalMessage, type ActionRefusal } from "./refusal-copy";
import type { NotificationSubject } from "./subject";
import { getVerbCopy, type VerbDefinition, type VerbId } from "./verbs";

export type MarkHandler = (formData: FormData) => Promise<void>;
export type WorkHandler = (state: WorkItemActionState, formData: FormData) => Promise<WorkItemActionState>;
export type DetailHandler = (state: TaskDetailCommandState, formData: FormData) => Promise<TaskDetailCommandState>;
export type SuppressHandler = (input: unknown, locale?: unknown) => Promise<
  | Readonly<{ ok: true; suppressionId: string | null; undo: TaskUndoOffer | null; replaced: boolean }>
  | Readonly<{ ok: false; code: string }>
>;

/** What one round comes to rest at. Flat, and carrying no database text. */
type RowState = {
  readonly status: "idle" | "applied" | "failed";
  readonly message: string;
  readonly announcement: string;
  readonly undo: TaskUndoOffer | null;
};

const IDLE: RowState = { status: "idle", message: "", announcement: "", undo: null };

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
    return { status: "failed", message, announcement: message, undo: null };
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
        return { status: "applied", message, announcement: message, undo: null };
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
        return { status: "applied", message, announcement: message, undo: result.undo };
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
            message: next.detail,
            announcement: next.announcement,
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
        return { status: "applied", message: next.detail, announcement: next.announcement, undo: next.undo ?? null };
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

  /*
   * The live region EXISTS BEFORE the result does, and is never conditionally
   * rendered. A region mounted at the same moment its text arrives is a region
   * screen readers do not announce — the defect this repository has already
   * paid for once.
   */
  const announcement = pending ? copy.pendingAnnouncement : state.announcement;

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

  function renderVerbButton(verb: VerbDefinition, className: string) {
    const needsPanel = verb.confirm || verb.id === "silence_until" || verb.id === "silence_subject" || verb.id === "reschedule_task";
    if (needsPanel) {
      return (
        <button
          aria-label={verbCopy[verb.id].accessibleName(subjectLabel)}
          className={className}
          disabled={pending}
          key={verb.id}
          onClick={() => { setPanelVerb(verb); closeMenu(); }}
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
      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>

      {primaryVerb ? renderVerbButton(primaryVerb, "row-action notification-primary-action") : null}

      {menuVerbs.length ? (
        <div className="notification-verb-menu">
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
              onKeyDown={(event) => { if (event.key === "Escape") closeMenu(); }}
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
        <form action={formAction} className="notification-verb-panel">
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
              onClick={() => setPanelVerb(null)}
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
      {state.status !== "idle" ? (
        <p className="notification-row-outcome" data-status={state.status}>{state.message}</p>
      ) : null}

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
