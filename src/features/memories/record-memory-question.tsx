"use client";

/**
 * Life Brain C.2 (ADR-151) — "Guardar isto como memória?" on a record's page.
 *
 * The record page asks every suggestion the same way (ADR-184): a question, its
 * answers beside it, and whatever can be adjusted behind one link. This is the
 * memory proposal in that shape. The conversation keeps `MemoryProposalCard`,
 * whose card grammar belongs to a chat turn; the two share the action, the
 * fields, the outcome mapping and the undo, and nothing here is a second write
 * path.
 *
 * - *Guardar memória* sends what the card's form sent: `locale`, `origin`,
 *   `sourceEntryId`, `content`, `kind`. Unadjusted, `content` and `kind` are the
 *   proposal's own.
 * - *Descartar* is local, for the reason the card gives (`2K-ACT-002`): nothing
 *   was written, so there is nothing to take back and no round-trip to make.
 * - *Ajustar* reveals the text and the kind — the only two things editable
 *   under OD-2K-1 — and the question then quotes the text a tap would keep.
 * - The undo **archives** and says so (`2K-ACT-008/009`, OD-2K-3); a duplicate
 *   created nothing this turn, so it is offered no undo.
 */

import { Undo2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { ConversationMemoryResolved } from "@/features/product-analytics/interaction-events";
import type { Locale } from "@/lib/preferences";

import { getMemoryCopy } from "./copy";
import { idleMemoryProposalState } from "./edit-state";
import type { MemoryProposalAction } from "./memory-proposal-card";
import { MEMORY_KINDS, type MemoryKind } from "./schema";
import { MEMORY_UNDO_TRANSITION, memoryUndoIsOffered, memoryUndoIsReversible } from "./undo";

function isMemoryKind(value: string): value is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(value);
}

export function RecordMemoryQuestion({
  action,
  undoAction,
  content: proposedContent,
  kind: proposedKind,
  locale,
  sourceEntryId,
}: {
  action: MemoryProposalAction;
  /** Passed in: a client component may not import a `"use server"` module for a value. */
  undoAction: MemoryProposalAction;
  content: string;
  kind: MemoryKind;
  locale: Locale;
  sourceEntryId: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleMemoryProposalState);
  const [undone, undoFormAction, undoPending] = useActionState(undoAction, idleMemoryProposalState);
  const [, startTransition] = useTransition();
  const copy = getMemoryCopy(locale);
  const fieldId = useId();
  const [content, setContent] = useState(proposedContent);
  const [kind, setKind] = useState<MemoryKind>(proposedKind);
  const [adjusting, setAdjusting] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  /** Keeps the memory. The request is built here, never read from the DOM. */
  function keep() {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("origin", "record");
    formData.set("sourceEntryId", sourceEntryId);
    formData.set("content", content);
    formData.set("kind", kind);
    startTransition(() => formAction(formData));
  }

  if (discarded) {
    return <p className="record-quiet-note" role="status">{copy.proposalDiscarded}</p>;
  }

  /*
    A finished round replaces the question with its outcome. `duplicate` lands
    here too, as the card has it: the sentence is kept, this turn created
    nothing, and the only useful thing to do is point at the row.
  */
  if (state.status === "success" || state.status === "duplicate") {
    const archived = undone.status === "success";
    const resolved = archived ? undone : state;

    return (
      <div className="confirmation-result">
        <p aria-atomic="true" aria-live="polite" role="status">{resolved.message}</p>
        {state.memoryId ? (
          <Link className="record-question-link" href={`/${locale}/app/memories/${state.memoryId}`}>
            {copy.proposalView}
          </Link>
        ) : null}
        {memoryUndoIsOffered(state) ? (
          <form action={undoFormAction} className="undo-action">
            <input name="locale" type="hidden" value={locale} />
            <input name="memoryId" type="hidden" value={state.memoryId ?? ""} />
            <input
              name="transition"
              type="hidden"
              value={archived && memoryUndoIsReversible() ? "restore" : MEMORY_UNDO_TRANSITION}
            />
            <Button icon={<Undo2 />} loading={undoPending} type="submit">
              {undoPending
                ? copy.conversationalUndoing
                : archived
                  ? copy.conversationalRestore
                  : copy.conversationalUndo}
            </Button>
            <span>{copy.conversationalUndoNote}</span>
          </form>
        ) : null}
        {undone.status === "error" ? <p className="form-error" role="alert">{undone.message}</p> : null}
        {/* `2K-METRICS-002`: what became of the proposal, as the card reports it. */}
        <ConversationMemoryResolved
          locale={locale === "en" ? "en" : "pt-BR"}
          outcome={archived ? "undone" : state.status === "duplicate" ? "no_change" : "accepted"}
        />
      </div>
    );
  }

  const edited = content.trim() !== proposedContent.trim();
  const adjustId = `${fieldId}-adjust`;

  return (
    <div aria-busy={pending} aria-label={copy.recordProposalHeading} className="record-question" role="group">
      <p className="record-question-text">{copy.recordProposalHeading}</p>
      <p className="record-question-meta">
        {/* The record's own text is the page's headline; it is repeated here
            only once the owner has made it something else. */}
        {edited && content.trim() ? `“${content.trim()}” · ` : ""}
        {copy.kindLabel}: {copy.kinds[kind]}
      </p>
      <div className="record-question-actions">
        <Button disabled={pending || !content.trim()} onClick={keep} type="button">
          {pending ? copy.proposalConfirming : copy.proposalConfirm}
        </Button>
        <Button disabled={pending} onClick={() => setDiscarded(true)} type="button" variant="ghost">
          {copy.proposalDiscard}
        </Button>
        <Button
          aria-controls={adjustId}
          aria-expanded={adjusting}
          disabled={pending}
          onClick={() => setAdjusting((open) => !open)}
          type="button"
          variant="link"
        >
          {copy.recordProposalAdjust}
        </Button>
      </div>
      {/* Always in the document, so `aria-controls` has a target; hidden until
          asked for, so the row at rest is a question and its answers. */}
      <div className="record-question-more" hidden={!adjusting} id={adjustId}>
        <label htmlFor={`${fieldId}-content`}>{copy.contentLabel}</label>
        <textarea
          disabled={pending}
          id={`${fieldId}-content`}
          maxLength={4000}
          onChange={(event) => setContent(event.target.value)}
          rows={3}
          value={content}
        />
        <label htmlFor={`${fieldId}-kind`}>{copy.kindLabel}</label>
        <select
          disabled={pending}
          id={`${fieldId}-kind`}
          onChange={(event) => { if (isMemoryKind(event.target.value)) setKind(event.target.value); }}
          value={kind}
        >
          {MEMORY_KINDS.map((option) => (
            <option key={option} value={option}>{copy.kinds[option]}</option>
          ))}
        </select>
      </div>
      {state.status === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}
    </div>
  );
}
