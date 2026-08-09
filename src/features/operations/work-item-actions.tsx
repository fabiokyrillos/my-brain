"use client";

/**
 * The Work status controls, as one component with two mounts.
 *
 * Extracted from `task-list.tsx` when the task detail surface arrived (Slice
 * D1). The alternative — a second copy of the button cluster on the detail page
 * — would have duplicated the operation-key discipline, the idempotency
 * handling and the outcome rendering that 2F-SURFACE-006 and 2F-SURFACE-011
 * exist to guarantee. Two copies of that is two chances to get it wrong; there
 * is one, and both surfaces mount it.
 *
 * Every behaviour below is carried over unchanged from the list implementation.
 */

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, RotateCcw } from "lucide-react";
import type { WorkItemView } from "@/features/daily-cycle/contracts";
import { isWorkSurfaceAction, type WorkSurfaceAction } from "@/features/task-commands/taxonomy";
import type { Locale } from "@/lib/preferences";
import { UndoAffordance, type TaskUndoHandler } from "./undo-affordance";
import { idleWorkItemActionState, type WorkItemActionState } from "./work-action-state";
import { getWorkActionsCopy } from "./work-actions-copy";

const actionIcon: Record<WorkSurfaceAction, typeof Check> = {
  complete_task: Check,
  wait_task: Clock3,
  resume_task: Clock3,
  reopen_task: RotateCcw,
};

export type WorkItemActionHandler = (
  state: WorkItemActionState,
  formData: FormData,
) => Promise<WorkItemActionState>;

export function WorkItemActions({
  action,
  locale,
  task,
  undoAction,
}: {
  action: WorkItemActionHandler;
  locale: Locale;
  task: WorkItemView;
  /**
   * `2L-EDIT-008`. Injected, for the same reason `action` is: this is a Client
   * Component and the Server Action module carries the `server-only` guard.
   *
   * Optional, so the mounts that predate the affordance keep working unchanged
   * — an absent handler means no control, never a control that fails.
   */
  undoAction?: TaskUndoHandler;
}) {
  const copy = getWorkActionsCopy(locale);
  const router = useRouter();
  const result = useRef<HTMLDivElement | null>(null);

  /**
   * The operation keys, one per **(row, action)** pair (2F-SURFACE-006).
   *
   * Held in a ref and minted lazily — **never in the render body**, where every
   * re-render would re-mint: `useActionState`'s pending→settled transition is a
   * re-render, and StrictMode double-renders in development.
   *
   * Scoped per action rather than per row because one key carrying two different
   * request fingerprints is refused with `2E_IDEMPOTENCY_MISMATCH` — a
   * legitimate second action on the same row would fail for a reason the user
   * cannot see or act on.
   */
  const keys = useRef<Map<WorkSurfaceAction, string>>(new Map());
  function operationKeyFor(id: WorkSurfaceAction): string {
    const existing = keys.current.get(id);
    if (existing !== undefined) return existing;
    const minted = crypto.randomUUID();
    keys.current.set(id, minted);
    return minted;
  }

  async function submit(state: WorkItemActionState, formData: FormData): Promise<WorkItemActionState> {
    const clicked = formData.get("action");
    if (!isWorkSurfaceAction(clicked)) return state;
    // Carried into the request at submit time and **never rendered into
    // markup**: a hidden input holding a client-minted uuid would not match the
    // value the server rendered, and React would report a hydration mismatch.
    formData.set("operationKey", operationKeyFor(clicked));
    const next = await action(state, formData);
    // Rotated after **every** terminal outcome, not only success. A refused
    // apply aborts the transaction and rolls back the operation-key
    // reservation, so no key is burned by a refusal and reuse would also be
    // safe. Rotating unconditionally is the simpler invariant to hold.
    if (next.status !== "idle") keys.current.delete(clicked);
    return next;
  }

  const [state, formAction, pending] = useActionState(submit, idleWorkItemActionState);

  // Focus lands on the outcome after every round, so a keyboard or screen-reader
  // user is told what happened instead of being left on a button whose label no
  // longer describes the row.
  useEffect(() => {
    if (state.status !== "idle") result.current?.focus();
  }, [state]);

  return (
    <>
      {/*
        One polite live region, announcing the pending phrase while a round is in
        flight and the outcome once it settles. `aria-busy` is what tells a
        screen reader the region is mid-update rather than empty.
      */}
      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.pendingAnnouncement : state.announcement}
      </div>

      <div className="row-actions">
        {task.availableActions.flatMap((available) => {
          // 2F-SURFACE-009: the projection derives availability from the task's
          // status and the taxonomy decides eligibility for that status; a
          // button rendered outside its declared eligible statuses would be
          // offering a refusal.
          if (!isWorkSurfaceAction(available.id)) return [];
          const Icon = actionIcon[available.id];
          return [
            <form action={formAction} key={available.id}>
              <input type="hidden" name="taskId" value={task.taskId} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="title" value={task.title} />
              <input type="hidden" name="action" value={available.id} />
              <button className="row-action" disabled={pending} type="submit">
                <Icon size={13} /> {copy.actions[available.id]}
              </button>
            </form>,
          ];
        })}
      </div>

      {state.status === "idle" ? null : (
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
          {state.title === null ? null : <p className="work-action-title">{state.title}</p>}
          {state.refreshable && (
            <button className="row-action" onClick={() => router.refresh()} type="button">
              {copy.refresh}
            </button>
          )}
          {/*
            `2L-EDIT-008`. Offered inside the outcome region, because "this
            happened" and "you can take it back" are one thought — and because
            an undo control floating outside the result would have no announced
            relationship to the operation it reverses.
          */}
          {undoAction ? <UndoAffordance action={undoAction} locale={locale} undo={state.undo} /> : null}
        </div>
      )}
    </>
  );
}
