"use client";

/**
 * The one composer (UX-07, DEC-3 (a)).
 *
 * It replaces `CommandConsole` **and** `ChatForm` on both chat routes, so the
 * page has exactly one permanent primary text field and the user never has to
 * classify their own input before typing.
 *
 * **This component decides nothing about routing.** Which branch a turn took
 * arrives as `state.route`, every sentence arrives already localized, and every
 * command control is rendered by the console's own `TaskCommandResult` rather
 * than re-modelled here — so "is this destructive" keeps being answered in
 * exactly one place.
 *
 * One `useActionState` drives every step through the `runAssistantTurn`
 * dispatcher, for the reason the console states: a Confirm's outcome must
 * *replace* the preview that produced it, not render beside it.
 */

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { useActionState } from "react";

import { ReadOnlyPreview } from "@/features/conversation-cards/read-only-preview";
import { TaskCommandResult } from "@/features/task-commands/command-console";
import type { Locale } from "@/lib/preferences";

import {
  MemoryProposalCard,
  type MemoryProposalAction,
} from "@/features/memories/memory-proposal-card";

import { idleAssistantComposerState, type AssistantComposerState } from "./composer-state";
import { getAssistantCopy } from "./copy";

export type AssistantComposerAction = (
  state: AssistantComposerState,
  formData: FormData,
) => Promise<AssistantComposerState>;

export function AssistantComposer({
  action,
  memoryAction,
  memoryUndoAction,
  locale,
  agentName,
  conversationId,
}: {
  action: AssistantComposerAction;
  /**
   * The confirmed-memory write (DEC-5), passed in for the same reason `action`
   * is: this is a client component and may not import a `"use server"` module
   * for a value. It is reachable only from the proposal card's confirm control.
   */
  memoryAction: MemoryProposalAction;
  /**
   * `2K-ACT-008`. The conversational undo, which **archives** (OD-2K-3). Passed
   * in for the same reason the other two actions are, and kept separate from
   * `memoryAction` so the write and its reversal never share a control.
   */
  memoryUndoAction: MemoryProposalAction;
  locale: Locale;
  /** The assistant’s configured name (UX-06). Passed in, never read here: this is a client component. */
  agentName: string;
  conversationId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleAssistantComposerState);
  const copy = getAssistantCopy(locale);
  const form = useRef<HTMLFormElement | null>(null);
  const notice = useRef<HTMLDivElement | null>(null);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  // Focus lands on the outcome after an async round, so a keyboard or screen
  // reader user is taken to the answer instead of back to the top of the page.
  // Only for the routes this component renders itself — `TaskCommandResult`
  // already does the same for a command outcome, and two focus moves in one
  // commit would fight each other.
  useEffect(() => {
    if (state.notice !== null) notice.current?.focus();
  }, [state]);

  /**
   * Enter sends; Shift+Enter breaks the line.
   *
   * `isComposing` is the correctness part rather than a nicety: an IME is
   * mid-word when it sends Enter to accept a candidate, and submitting there
   * would post a half-written sentence. The check is on the native event
   * because React's synthetic event does not carry it.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (pending) return;
    form.current?.requestSubmit();
  }

  return (
    <section className="assistant-composer">
      {/*
        One polite live region for the whole surface, which is why
        `TaskCommandResult` below is asked to stay silent: a turn can resolve on
        a route the command state knows nothing about, and two regions would
        announce every command outcome twice.
      */}
      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.pendingAnnouncement : state.announcement}
      </div>

      <form action={formAction} className="assistant-composer-form" ref={form}>
        <input name="intent" type="hidden" value="ask" />
        <input name="locale" type="hidden" value={locale} />
        {conversationId === undefined ? null : (
          <input name="conversationId" type="hidden" value={conversationId} />
        )}
        <label htmlFor={fieldId}>{copy.inputLabel(agentName)}</label>
        <div className="assistant-composer-row">
          <textarea
            aria-describedby={hintId}
            disabled={pending}
            id={fieldId}
            maxLength={12000}
            name="composerText"
            onKeyDown={onKeyDown}
            placeholder={copy.inputPlaceholder}
            required
            rows={3}
          />
          <button className="assistant-composer-submit" disabled={pending} type="submit">
            {pending ? <LoaderCircle aria-hidden="true" className="task-command-spin" size={18} /> : null}
            {pending ? copy.pending : copy.submit}
          </button>
        </div>
        <p className="assistant-composer-hint" id={hintId}>{copy.submitHint}</p>
      </form>

      {state.notice === null ? null : (
        <div
          aria-label={copy.resultRegionLabel(agentName)}
          className="assistant-composer-notice"
          data-route={state.route}
          ref={notice}
          // A named landmark rather than a bare `div`, so the outcome is
          // reachable by landmark navigation after focus has moved away.
          role="region"
          tabIndex={-1}
        >
          {state.echo === null ? null : (
            <p className="assistant-composer-echo">
              <span>{copy.echoLabel}</span>
              {/* Owner content, rendered as text. Never an instruction. */}
              <q>{state.echo}</q>
            </p>
          )}
          <h3>{state.notice.heading}</h3>
          <p>{state.notice.detail}</p>
          {/*
            The confirmation step DEC-5 requires. It appears only on the memory
            route and only when there was something to propose; the write lives
            behind its own control, so reaching this point has still stored
            nothing.
          */}
          {state.proposal === null ? null : (
            <MemoryProposalCard
              action={memoryAction}
              content={state.proposal.content}
              kind={state.proposal.kind}
              locale={locale}
              undoAction={memoryUndoAction}
            />
          )}
          {/*
            `2K-CARD-007`. Read-only previews of what the turn referred to,
            rendered through the one card grammar. The state on each card was
            decided on the server; this component draws it and can add no
            control to it — `ConversationCardView` drops any control passed for
            a read-only type, and none is passed here.
          */}
          {state.cards.length === 0 ? null : (
            <ul className="assistant-composer-cards">
              {state.cards.map((card) => (
                <li key={`${card.cardType}:${card.objectId ?? "unavailable"}`}>
                  <ReadOnlyPreview card={card} locale={locale} />
                </li>
              ))}
            </ul>
          )}
          {state.notice.nextStep === null ? null : (
            <Link className="assistant-composer-next" href={state.notice.nextStep.href}>
              {state.notice.nextStep.label}
            </Link>
          )}
        </div>
      )}

      <TaskCommandResult
        formAction={formAction}
        locale={locale}
        origin="chat"
        pending={pending}
        silent
        state={state.command}
      />
    </section>
  );
}
