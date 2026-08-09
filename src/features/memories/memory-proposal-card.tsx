"use client";

/**
 * The confirmation DEC-5 requires (UX-10), inside Phase 2K's card grammar.
 *
 * "Lembre disso sempre" must produce a **proposed** memory that persists only
 * once the owner accepts it. This card is that step, and its whole design is
 * about making the pre-write state unmistakable:
 *
 * - The heading and the "nothing has been saved yet" line are supplied by the
 *   composer's notice region, which already owns them, so the two cannot drift
 *   into saying different things about the same turn.
 * - The proposed text is **editable** — and under OD-2K-1 it is the *only*
 *   thing editable here. `kind` remains a preselected suggestion the owner may
 *   change, because it was never a decision the system made on their behalf;
 *   confidence, provenance, ownership, lifecycle state and every other memory
 *   field are not reachable from this card at all.
 * - Discarding is local and immediate: nothing was written, so there is nothing
 *   to undo and no round-trip to make (`2K-ACT-002`).
 *
 * ## The card grammar, and the honest asymmetry (`2K-CARD-006`, `2K-ACT-006`)
 *
 * A memory create has **no pre-state**, so there are no deltas and this card
 * renders no before/after table. Inventing an empty one to look like the task
 * card would be decoration claiming to be disclosure. What it does share is the
 * state vocabulary: the outcome arrives as a `MemoryProposalState` status and
 * is mapped by `memoryProposalCardState` — exhaustively, server-side in spirit
 * and in one place — onto `requires_confirmation`, `accepted`, `no_change` or
 * `failed`.
 *
 * `duplicate` becoming `no_change` rather than `accepted` is the load-bearing
 * one: the sentence is kept, but **this turn created nothing**, which is also
 * why the undo is withheld for it. Archiving a memory this turn did not create
 * would act on something the owner never asked about.
 *
 * ## The undo says what it does (`2K-ACT-008/009`, OD-2K-3)
 *
 * It **archives**. The row survives, provenance is preserved, and the memory
 * leaves active use — including retrieval, because `chat/actions.ts` filters on
 * the same `isMemoryInForce` window. The card states that in words, claims no
 * 24-hour window it does not have, and `undo.test.ts` asserts negatively in
 * both locales that none of this copy says deleted.
 */

import { Check, LoaderCircle, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";

import { ConversationCardView } from "@/features/conversation-cards/card";
import { unavailableCard } from "@/features/conversation-cards/contracts";
import type { Locale } from "@/lib/preferences";

import { getMemoryCopy } from "./copy";
import { idleMemoryProposalState, type MemoryProposalState } from "./edit-state";
import { MEMORY_KINDS, type MemoryKind } from "./schema";
import {
  MEMORY_UNDO_REVERSAL,
  MEMORY_UNDO_TRANSITION,
  memoryProposalCardState,
  memoryUndoIsOffered,
  memoryUndoIsReversible,
} from "./undo";

export type MemoryProposalAction = (
  state: MemoryProposalState,
  formData: FormData,
) => Promise<MemoryProposalState>;

/**
 * The card the memory outcome is drawn in.
 *
 * Built from `unavailableCard("memory")` and then given its state and reversal,
 * because the builder is the one place a card's shape is declared and there is
 * no object to preview: a proposal has no id until it is confirmed, and the
 * confirmed row's content is already on screen in the field above.
 */
function memoryCard(status: MemoryProposalState["status"]) {
  return {
    ...unavailableCard("memory"),
    state: memoryProposalCardState(status),
    reversal: status === "success" ? MEMORY_UNDO_REVERSAL : ({ kind: "none" } as const),
  };
}

export function MemoryProposalCard({
  action,
  undoAction,
  content,
  kind,
  locale,
}: {
  action: MemoryProposalAction;
  /**
   * `2K-ACT-008`. Passed in for the same reason `action` is: this is a client
   * component and may not import a `"use server"` module for a value. It
   * delegates to `setMemoryLifecycle`, so there is no second write path.
   */
  undoAction: MemoryProposalAction;
  content: string;
  kind: MemoryKind;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(action, idleMemoryProposalState);
  const [undone, undoFormAction, undoPending] = useActionState(undoAction, idleMemoryProposalState);
  const copy = getMemoryCopy(locale);
  const fieldId = useId();
  const [discarded, setDiscarded] = useState(false);

  if (discarded) {
    return (
      <div className="memory-proposal memory-proposal-closed" role="status">
        <p>{copy.proposalDiscarded}</p>
      </div>
    );
  }

  /**
   * A finished round replaces the card with its outcome.
   *
   * `duplicate` lands here too, and is presented as a **no change** rather than
   * as a success: the sentence the owner asked to keep is kept, and the only
   * useful thing to do with the fact that it already was is to point at the
   * row. Reporting it as a failure would invite a retry that must never
   * succeed; reporting it as a creation would claim a write that never happened.
   */
  if (state.status === "success" || state.status === "duplicate") {
    // The undo's own round replaces the reversal disclosure once it has run:
    // an archived memory is no longer offering to be archived.
    const resolved = undone.status === "success" ? undone : state;
    const archived = undone.status === "success";

    return (
      <div className="memory-proposal memory-proposal-closed">
        <ConversationCardView
          card={archived ? { ...memoryCard("success"), state: "undone" } : memoryCard(state.status)}
          locale={locale}
        />
        <div aria-atomic="true" aria-live="polite" role="status">
          <p>{resolved.message}</p>
        </div>
        {state.memoryId ? (
          <Link className="memory-proposal-link" href={`/${locale}/app/memories/${state.memoryId}`}>
            {copy.proposalView}
          </Link>
        ) : null}

        {/*
          `2K-ACT-008`: reachable from the conversation that created the memory,
          and offered only when this turn actually created one. A duplicate
          created nothing, so there is nothing here to undo.
        */}
        {memoryUndoIsOffered(state) ? (
          <form action={undoFormAction} className="memory-proposal-undo">
            <input name="locale" type="hidden" value={locale} />
            <input name="memoryId" type="hidden" value={state.memoryId ?? ""} />
            <input
              name="transition"
              type="hidden"
              value={archived && memoryUndoIsReversible() ? "restore" : MEMORY_UNDO_TRANSITION}
            />
            <p className="memory-proposal-undo-note">{copy.conversationalUndoNote}</p>
            <button disabled={undoPending} type="submit">
              {undoPending ? (
                <LoaderCircle aria-hidden="true" className="spin" size={15} />
              ) : (
                <Undo2 aria-hidden="true" size={15} />
              )}
              {undoPending
                ? copy.conversationalUndoing
                : archived
                  ? copy.conversationalRestore
                  : copy.conversationalUndo}
            </button>
          </form>
        ) : null}

        {undone.status === "error" ? (
          <p className="entity-edit-feedback error">{undone.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="memory-proposal">
      <input name="locale" type="hidden" value={locale} />

      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.proposalConfirming : state.status === "error" ? state.message : ""}
      </div>

      <ConversationCardView card={memoryCard(state.status)} locale={locale} />

      <label htmlFor={`${fieldId}-content`}>
        {copy.contentLabel}
        {/* `aria-label` for the reason `memory-edit-form.tsx` records: React
            renders the value as a child text node, so the wrapping label would
            otherwise name this field "Memória" plus the whole proposed text. */}
        <textarea
          aria-label={copy.contentLabel}
          defaultValue={content}
          disabled={pending}
          id={`${fieldId}-content`}
          maxLength={4000}
          name="content"
          required
          rows={3}
        />
      </label>

      <label htmlFor={`${fieldId}-kind`}>
        {copy.kindLabel}
        <select defaultValue={kind} disabled={pending} id={`${fieldId}-kind`} name="kind">
          {MEMORY_KINDS.map((option) => (
            <option key={option} value={option}>{copy.kinds[option]}</option>
          ))}
        </select>
      </label>

      <div className="memory-proposal-actions">
        <button className="memory-proposal-confirm" disabled={pending} type="submit">
          {pending ? (
            <LoaderCircle aria-hidden="true" className="spin" size={15} />
          ) : (
            <Check aria-hidden="true" size={15} />
          )}
          {pending ? copy.proposalConfirming : copy.proposalConfirm}
        </button>
        {/* Discarding needs no server round-trip precisely because nothing was
            written. Saying so with a purely local control is the clearest
            possible evidence of the invariant (`2K-ACT-002`). */}
        <button
          className="memory-proposal-discard"
          disabled={pending}
          onClick={() => setDiscarded(true)}
          type="button"
        >
          <X aria-hidden="true" size={15} />
          {copy.proposalDiscard}
        </button>
      </div>

      {state.status === "error" ? (
        <p className="entity-edit-feedback error">{state.message}</p>
      ) : null}
    </form>
  );
}
