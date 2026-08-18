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
  initialText,
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
  /**
   * `2P-CHAT-005`. A starting sentence, seeded on first mount only.
   *
   * Set when the owner arrived from a contextual page through "ask about this".
   * It is **a seed, not a submission**: the field is still uncontrolled, the
   * owner edits or clears it, and only an explicit send does anything — the same
   * rule the capture composer follows for a transcript.
   *
   * Seeding stops the moment a turn resolves, which is what `state.route` gates
   * below. Without that, a failed turn would restore the owner's own text from
   * `echo` and then a re-render would put the seed back over it.
   */
  initialText?: string;
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
   * What the field holds again after a turn that failed.
   *
   * `<form action={…}>` resets the form once its action settles — correct after
   * a turn that landed somewhere, and destructive after one that did not: a
   * knowledge answer that failed, or a submission refused for being too long,
   * cleared the box and left the user to retype what they had written. The
   * routes that carry a failure hand back `echo`, which is the owner's own text,
   * so the field is restored from it.
   *
   * **Only on those two routes.** `memory_intent` also carries an echo and
   * renders it in the notice as a quotation, so restoring there would put the
   * same sentence on screen twice and make the composer look un-submitted. A
   * `command` turn carries no echo at all, because the preview already shows the
   * task it resolved.
   *
   * `key` rather than `defaultValue` alone: an uncontrolled `<textarea>` keeps
   * its DOM value across re-renders, so a changed default would not be applied.
   * Keying on the route and the echo makes React mount a fresh field with the
   * restored text, and leaves a *successful* turn's empty field untouched.
   */
  const restored = state.route === "knowledge_failed" || state.route === "invalid"
    ? state.echo
    : null;

  /**
   * `2P-CHAT-005`. The seed, and why it is `idle`-only.
   *
   * `idle` is the one route that means "nothing has been submitted yet". On every
   * other route the owner has acted, and re-seeding would either overwrite the
   * text a failed turn just restored or refill a field they deliberately
   * emptied. Ordered *after* `restored` in the value below for the same reason:
   * a restored echo is the owner's own words and always wins.
   */
  const seeded = state.route === "idle" && initialText ? initialText : null;
  const initial = restored ?? seeded ?? "";

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
            defaultValue={initial}
            disabled={pending}
            id={fieldId}
            key={
              restored !== null
                ? `restored:${restored.length}:${state.route}`
                : seeded !== null
                  ? `seeded:${seeded.length}`
                  : "empty"
            }
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
