"use client";

/**
 * The confirmation DEC-5 requires (UX-10).
 *
 * "Lembre disso sempre" must produce a **proposed** memory that persists only
 * once the owner accepts it. This card is that step, and its whole design is
 * about making the pre-write state unmistakable:
 *
 * - The heading and the "nothing has been saved yet" line are supplied by the
 *   composer's notice region, which already owns them, so the two cannot drift
 *   into saying different things about the same turn.
 * - The proposed text is **editable**. A proposal the owner cannot correct is a
 *   confirmation in name only — they would either accept a sentence that is
 *   slightly wrong or abandon the turn.
 * - The kind is a preselected suggestion, never a decision, for the same reason.
 * - Discarding is local and immediate: nothing was written, so there is nothing
 *   to undo and no round-trip to make.
 *
 * The confirm control posts to `createProposedMemory`, which re-validates the
 * payload rather than trusting that a proposal produced it.
 */

import { Check, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";

import type { Locale } from "@/lib/preferences";

import { getMemoryCopy } from "./copy";
import { idleMemoryProposalState, type MemoryProposalState } from "./edit-state";
import { MEMORY_KINDS, type MemoryKind } from "./schema";

export type MemoryProposalAction = (
  state: MemoryProposalState,
  formData: FormData,
) => Promise<MemoryProposalState>;

export function MemoryProposalCard({
  action,
  content,
  kind,
  locale,
}: {
  action: MemoryProposalAction;
  content: string;
  kind: MemoryKind;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(action, idleMemoryProposalState);
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
   * `duplicate` lands here too, and is presented as a success: the sentence the
   * owner asked to keep is kept, and the only useful thing to do with the fact
   * that it already was is to point at the row. Reporting it as a failure would
   * invite a retry that must never succeed.
   */
  if (state.status === "success" || state.status === "duplicate") {
    return (
      <div className="memory-proposal memory-proposal-closed">
        <div aria-atomic="true" aria-live="polite" role="status">
          <p>{state.message}</p>
        </div>
        {state.memoryId ? (
          <Link className="memory-proposal-link" href={`/${locale}/app/memories/${state.memoryId}`}>
            {copy.proposalView}
          </Link>
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

      <label htmlFor={`${fieldId}-content`}>
        {copy.contentLabel}
        <textarea
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
            possible evidence of the invariant. */}
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
