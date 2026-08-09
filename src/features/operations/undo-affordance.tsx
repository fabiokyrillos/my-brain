"use client";

/**
 * `2L-EDIT-008`/`-009` — undo, offered where the operation was performed.
 *
 * ## What was already there, and what was missing
 *
 * The reversal itself has existed since Phase 2E: `undo_operations` rows with a
 * 24-hour expiry, a `public.undo_operation` router, an owner-scoped re-read that
 * distinguishes *spent* from *expired* without widening the SQL error
 * vocabulary, and a tested Server Action. **One surface offered it**: the
 * natural-language console. A user who completed a task by pressing the button
 * on its own row was told "Done" and nothing else, while the operation stayed
 * reversible for a day.
 *
 * So this component adds no mechanism. It is the affordance the mechanism never
 * had, on the two surfaces that actually perform the operations.
 *
 * ## Three properties that are structural rather than remembered
 *
 * **It cannot offer undo for an irreversible operation.** The offer is `null`
 * unless `apply_task_command` returned an `undoId`, and it returns one exactly
 * when it wrote an undo row — never for a `no_change`, which 2E-UPDATE-009
 * requires to write nothing at all. There is no branch here that could decide
 * otherwise.
 *
 * **It disappears rather than fails once spent or expired.** `expiresAt` comes
 * from the row, so the control stops being rendered at the moment the router
 * would start refusing. That is a courtesy, not the control: the router
 * re-reads the row and refuses regardless of what this component believed.
 *
 * **It states the window and never merges it with recovery.** "You can undo
 * this for 24 hours" and "you can recover this afterwards" describe different
 * mechanisms, and copy that says the first when only the second is true is a
 * false promise. The two sentences live apart in `copy.ts` and there is no
 * string they could be assembled from.
 */

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { idleTaskUndoState, type TaskUndoOffer, type TaskUndoState } from "@/features/task-commands/task-undo-state";
import type { Locale } from "@/lib/preferences";

import { getWorkCopy } from "./copy";

export type TaskUndoHandler = (
  state: TaskUndoState,
  formData: FormData,
) => Promise<TaskUndoState>;

export function UndoAffordance({
  action,
  locale,
  now,
  undo,
}: {
  action: TaskUndoHandler;
  locale: Locale;
  /**
   * Injected rather than read from the ambient clock, so the boundary case —
   * an offer that expires between render and click — is testable at the
   * boundary, which is the only place it is interesting.
   */
  now?: Date;
  undo: TaskUndoOffer | null;
}) {
  const copy = getWorkCopy(locale).undo;
  const router = useRouter();
  const result = useRef<HTMLDivElement | null>(null);
  const [state, formAction, pending] = useActionState(action, idleTaskUndoState);

  // The list behind the control still shows the state the operation produced,
  // so a successful reversal has to invalidate it — otherwise the user is told
  // "Undone" above a row that still reads as completed.
  useEffect(() => {
    if (state.status === "undone") router.refresh();
  }, [state.status, router]);

  useEffect(() => {
    if (state.status !== "idle") result.current?.focus();
  }, [state.status]);

  const expiry = undo ? Date.parse(undo.expiresAt) : Number.NaN;
  const instant = (now ?? new Date()).getTime();
  // An unparseable expiry stops the offer rather than extending it: the column
  // is `not null` with a default so this is unreachable through the database,
  // and refusing to offer is the failure that costs the user nothing.
  const offerable = undo !== null && Number.isFinite(expiry) && expiry > instant;

  if (!offerable && state.status === "idle") return null;

  return (
    <div className="work-undo">
      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.pending : state.announcement}
      </div>

      {offerable && state.status === "idle" ? (
        <form action={formAction}>
          <input type="hidden" name="undoId" value={undo.undoId} />
          <input type="hidden" name="locale" value={locale} />
          <button className="row-action work-undo-button" disabled={pending} type="submit">
            <RotateCcw size={13} aria-hidden="true" /> {copy.label}
          </button>
          <p className="work-undo-window">{copy.window}</p>
        </form>
      ) : null}

      {state.status === "idle" ? null : (
        <div
          aria-label={copy.regionLabel}
          className="work-undo-result"
          ref={result}
          role="region"
          tabIndex={-1}
        >
          <p>{state.message}</p>
        </div>
      )}
    </div>
  );
}
