"use client";

/**
 * Writing a memory deliberately (`2P-MEMORY-001` … `-004`).
 *
 * ## What it replaces, and why the replacement is not a bigger field
 *
 * `/app/memories` mounted `InlineCreateForm`: one `<input maxLength={4000}>`
 * with an `sr-only` label, a placeholder reading *"Nova memória"*, and an Add
 * button. Four thousand characters through a control that shows about sixty,
 * with nothing on screen saying what a memory is for, and no step between typing
 * and storing.
 *
 * The requirement is not "make the field taller". It is that the flow **explains
 * what makes a memory durable**, lets the owner **review before saving**, and
 * gives them **undo after**. So this is two panes in one dialog — write, then
 * review — and a result that carries the undo.
 *
 * ## One writer, and it is not a new one
 *
 * This submits to `createProposedMemory`, the action the assistant composer
 * already uses. It was chosen over `createRecord` deliberately, and the
 * difference is not cosmetic: it is idempotent against a double submit, it
 * audits, and it **returns the created id** — without which there is nothing for
 * an undo control to act on. `createRecord`'s memory branch was a plain INSERT
 * that returned only a sentence, so it is deleted in the same change rather than
 * left dormant: two ways to write a memory is exactly the duplicated write path
 * this repository removes on sight.
 *
 * The undo is `undoProposedMemory`, which **archives** — OD-2K-3's signed
 * answer, delegating to `setMemoryLifecycle`. It does not delete, and the words
 * say archived rather than deleted, asserted negatively in both locales by
 * `undo.test.ts`.
 *
 * ## What it must not claim
 *
 * A memory written here has `source_entry_id = null`. The column is
 * `on delete set null`, so null is ambiguous and the list renders it
 * `unsourced` — never *"informed by you"*. This surface says the same thing:
 * there is no source record. Inventing an origin here would put the composer and
 * the list in disagreement about the same row, and the composer would be the one
 * that was wrong.
 *
 * `kind` is `fact` and is not offered. Ten literals is not a choice a person can
 * make about their own sentence, `createRecord` stored `fact` for every memory
 * written from this page, and preserving that is what `2P-MEMORY-004` means by
 * keeping the existing semantics. The optional validity and source `2P-MEMORY-002`
 * mentions are asked for **only when relevant**, and neither is relevant to a
 * sentence the owner is writing from scratch about what is true now: validity is
 * editable on the memory's own page, and a source does not exist.
 */

import { LoaderCircle, Plus, Undo2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/features/task-commands/confirm-dialog";
import type { Locale } from "@/lib/preferences";

import { getMemoryCopy } from "./copy";
import { idleMemoryProposalState, type MemoryProposalState } from "./edit-state";

export type MemoryProposalAction = (
  state: MemoryProposalState,
  formData: FormData,
) => Promise<MemoryProposalState>;

export function MemoryComposer({
  createAction,
  locale,
  undoAction,
}: {
  /** `createProposedMemory` — the single memory writer, reused unchanged. */
  createAction: MemoryProposalAction;
  locale: Locale;
  /** `undoProposedMemory` — archives, never deletes (OD-2K-3). */
  undoAction: MemoryProposalAction;
}) {
  const copy = getMemoryCopy(locale);
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  /**
   * Controlled, and that is the point rather than a detail.
   *
   * The review pane must show **exactly** what will be stored, and an
   * uncontrolled textarea that is unmounted to show the review would take its
   * value with it. React also resets an uncontrolled form once a Server Action
   * completes, so a refused save would erase what the owner wrote — the failure
   * this repository recorded as *"a form action resets uncontrolled input"*.
   */
  const [draft, setDraft] = useState("");
  const [emptyDraft, setEmptyDraft] = useState(false);

  const [createState, create, creating] = useActionState(createAction, idleMemoryProposalState);
  const [undoState, undo, undoing] = useActionState(undoAction, idleMemoryProposalState);

  /**
   * The last round that completed, whichever form ran it.
   *
   * Held rather than derived from whichever state is non-idle: once the create
   * state leaves `idle` it never returns, so a derivation would go on rendering
   * the creation message after an undo had replaced it. Compared by object
   * identity, because `useActionState` returns a fresh object per round and a
   * re-render must not re-close a dialog the owner has since reopened.
   */
  const [outcome, setOutcome] = useState<MemoryProposalState>(idleMemoryProposalState);
  const lastCreate = useRef<MemoryProposalState>(createState);
  const lastUndo = useRef<MemoryProposalState>(undoState);
  useEffect(() => {
    for (const [state, previous] of [
      [createState, lastCreate],
      [undoState, lastUndo],
    ] as Array<[MemoryProposalState, React.RefObject<MemoryProposalState>]>) {
      if (state === previous.current) continue;
      previous.current = state;
      if (state.status === "idle") continue;
      setOutcome(state);
      // A stored memory — new or the duplicate that already held the sentence —
      // closes the dialog. There is nothing left to review, and the result and
      // its undo are on the page behind it.
      if (state.status === "success" || state.status === "duplicate") {
        setOpen(false);
        setReviewing(false);
        setDraft("");
      }
    }
  }, [createState, undoState]);

  const pending = creating || undoing;
  /**
   * `2K-ACT-008`. The undo is offered while the id is live and withdrawn once it
   * has been used — an undo control that stays after archiving would invite a
   * second press with nothing left to reverse.
   */
  const undoable = outcome.status === "success" && outcome.memoryId !== null && undoState.status === "idle";

  return (
    <div className="memory-compose">
      <button
        className="memory-compose-open"
        onClick={() => { setOpen(true); setEmptyDraft(false); }}
        type="button"
      >
        <Plus aria-hidden="true" size={16} />
        {copy.composeOpen}
      </button>

      {/*
        The outcome survives the dialog closing. Announcing a save and then
        destroying the only evidence of it — and the undo attached to it — would
        leave a screen-reader user with nothing to return to and no way back.
      */}
      <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {open || outcome.status === "idle" ? "" : outcome.message}
      </div>

      {!open && outcome.status !== "idle" ? (
        <div className="memory-compose-outcome" data-memory-outcome={outcome.status}>
          <p>{outcome.message}</p>
          {undoable ? (
            <form action={undo}>
              <input name="locale" type="hidden" value={locale} />
              <input name="memoryId" type="hidden" value={outcome.memoryId ?? ""} />
              <button className="task-command-secondary" disabled={pending} type="submit">
                {undoing ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Undo2 aria-hidden="true" size={16} />}
                {undoing ? copy.composeUndoing : copy.composeUndo}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        cancelLabel={copy.composeClose}
        className="task-command-dialog-form"
        description={copy.composeDescription}
        idPrefix="memory-compose-dialog"
        onClose={() => { setOpen(false); setReviewing(false); setEmptyDraft(false); }}
        open={open}
        title={copy.composeTitle}
      >
        <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
          {creating ? copy.saving : createState.status === "idle" ? "" : createState.message}
        </div>

        {reviewing ? (
          <form action={create}>
            <input name="locale" type="hidden" value={locale} />
            {/* `fact` for the reason the module header records: it is what this
                page has always stored, and `2P-MEMORY-004` asks the flow to
                preserve the existing semantics rather than to introduce a
                ten-way choice about the owner's own sentence. */}
            <input name="kind" type="hidden" value="fact" />
            {/* Reaches the audit reason and nothing else. */}
            <input name="origin" type="hidden" value="memories" />
            <input name="content" type="hidden" value={draft} />

            <p className="task-command-dialog-note">{copy.composeReviewHeading}</p>
            {/*
              The exact string that will be stored, rendered rather than
              summarized. `white-space: pre-wrap` keeps the owner's own line
              breaks, so what they read here is what the row will hold.
            */}
            <p className="task-command-dialog-review" data-memory-review="true">{draft}</p>
            <p className="task-command-dialog-note" data-memory-provenance="none">
              {copy.composeProvenanceNone}
            </p>

            <div className="task-command-dialog-actions">
              <button className="task-command-primary" disabled={pending} type="submit">
                {creating ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
                {creating ? copy.saving : copy.composeSubmit}
              </button>
              <button
                className="task-command-secondary"
                disabled={pending}
                onClick={() => setReviewing(false)}
                type="button"
              >
                {copy.composeBack}
              </button>
            </div>
          </form>
        ) : (
          /*
            A `<form>` with no action: the write happens from the review pane, so
            this one only advances. It stays a form so Enter behaves and the
            label/field association is ordinary — `onSubmit` rather than a button
            handler, because a keyboard user pressing Enter in the field expects
            to move on rather than nothing to happen.
          */
          <form onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() === "") { setEmptyDraft(true); return; }
            setEmptyDraft(false);
            setReviewing(true);
          }}>
            <label htmlFor="memory-compose-content">
              {copy.composeFieldLabel}
              <textarea
                autoComplete="off"
                id="memory-compose-content"
                maxLength={4000}
                name="content"
                onChange={(event) => setDraft(event.target.value)}
                placeholder={copy.composePlaceholder}
                rows={6}
                value={draft}
              />
            </label>

            <div className="task-command-dialog-actions">
              <button className="task-command-primary" type="submit">
                {copy.composeReviewStep}
              </button>
              <button
                className="task-command-secondary"
                onClick={() => { setOpen(false); setReviewing(false); setEmptyDraft(false); }}
                type="button"
              >
                {copy.composeCancel}
              </button>
            </div>

            {emptyDraft ? (
              <p className="entity-edit-feedback error" role="alert">{copy.composeEmpty}</p>
            ) : null}
          </form>
        )}

        {createState.status === "error" ? (
          <p className="entity-edit-feedback error" role="alert">{createState.message}</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
