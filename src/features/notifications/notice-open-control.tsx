"use client";

/**
 * *Abrir* — the one control on an attention-surface notice that is not a verb.
 *
 * `2S-ATTENTION-006`: *"Opening a notice from home marks it seen. The row's
 * state moves, and the assertion reads the row after the interaction."*
 *
 * ## Why it is a form and not a link with an `onClick`
 *
 * The obvious shape is `<a href={…} onClick={fireAndForget}>`, and it is the
 * shape this repository already uses for **analytics** on the attention rows.
 * It is wrong here, and the difference is the point: an analytics event that
 * loses a race with navigation costs a row in a table nobody is waiting on. A
 * **state change** that loses that race leaves the owner looking at a notice
 * they just opened, still unread — which is exactly the defect this whole phase
 * exists to end.
 *
 * So the write is **awaited**, and the navigation is the statement after it.
 *
 * ## It creates no authority
 *
 * `2S-TRUST-010`. The write is `markNotification` — the same Server Action the
 * *Lida* verb dispatches to, taken from the same `NOTIFICATION_VERB_HANDLERS`
 * bundle, sending the same `status="read"`. This component chooses *when*,
 * never *what*.
 *
 * ## A notice already read is opened without a write
 *
 * `R-24`, the rule the verb list already carries: a control whose only possible
 * outcome is a no-op should not perform it.
 *
 * ## The destination is checked before it is followed, and the check lives elsewhere
 *
 * `isOwnerScopedDestination` is in `destination.ts`, a module with **no
 * directive**, and that is not tidiness. It used to be exported from here — and
 * `"use client"` marks the whole MODULE, so the Server Component that renders
 * this control could not call it. `/app` fell into its error boundary for every
 * owner with an unanswered notice, and no test saw it, because jsdom renders
 * both kinds of component as the same function in the same bundle.
 *
 * This module does **not** re-export it either, and the first draft of the fix
 * did. A re-export keeps every old import compiling, which sounds like kindness
 * and is really the same trap left open: the predicate would still be reachable
 * *through a client module*, and the next server component to reach for it
 * would reach the same way the last one did. `src/lib/closeout/rsc-boundary-guard.test.ts`
 * would catch it — but a guard is the second line, not the first.
 *
 * A destination that fails the check renders **no control at all** rather than
 * a control that refuses when pressed — an affordance for something that cannot
 * happen is the "controle falso" the direction forbids.
 */

import { useRouter } from "next/navigation";
import { useActionState, useRef } from "react";

import type { Locale } from "@/lib/preferences";

import { getNotificationActionCopy } from "./action-copy";
import type { MarkHandler } from "./notification-row-actions";
import { refusalMessage } from "./refusal-copy";

type OpenState = { readonly status: "idle" | "failed"; readonly message: string };

const IDLE: OpenState = { status: "idle", message: "" };

export function NoticeOpenControl({
  locale,
  notificationId,
  href,
  subjectLabel,
  alreadySeen,
  markAction,
}: {
  locale: Locale;
  notificationId: string;
  href: string;
  /** Carried into the accessible name, so twenty rows are twenty destinations. */
  subjectLabel: string;
  alreadySeen: boolean;
  markAction: MarkHandler;
}) {
  const router = useRouter();
  const copy = getNotificationActionCopy(locale);

  /**
   * THE DISABLED ATTRIBUTE IS NOT THE DEFENCE, AND NEITHER IS AN IN-FLIGHT FLAG.
   *
   * Two versions of this failed the owner's own control, and each failure said
   * something true:
   *
   * 1. `disabled` guards the BUTTON, not the FORM. A `form.requestSubmit()` —
   *    which a script, an extension, or a browser that treats the two
   *    differently can produce — reaches the action with the button disabled,
   *    and the first version performed a second write from it.
   * 2. An "is a round in flight?" ref did not help either, because React
   *    **queues** actions rather than running them concurrently: the second
   *    dispatch ran *after* the first settled, when the flag was already clear.
   *
   * So the guard is about what HAPPENED, not about what is happening. A notice
   * this control has already opened is not opened again — no second write, no
   * second navigation — and a FAILED round leaves both flags down, because a
   * control that could never be pressed again is the other half of "stuck".
   *
   * Refs rather than state, for the reason `work-item-actions.tsx` mints its
   * operation keys in one: a re-render must not reset them, and setting state
   * inside the action that owns them would be a cascading render.
   */
  const wrote = useRef(false);
  const opened = useRef(false);

  const [state, formAction, pending] = useActionState<OpenState, FormData>(async (previous) => {
    if (opened.current) return previous;
    try {
      if (!alreadySeen && !wrote.current) {
        const payload = new FormData();
        payload.set("locale", locale);
        payload.set("notificationId", notificationId);
        payload.set("status", "read");
        await markAction(payload);
        wrote.current = true;
      }
    } catch {
      /*
       * A THROWN WRITE MUST NOT STRAND THE CONTROL, and must not navigate.
       *
       * Letting the action reject leaves `useActionState` pending, and — worse —
       * a `finally` that navigated anyway would send the owner to a page while
       * the notice they opened stayed unread and nothing said so. Returning a
       * settled failure ends the pending state, keeps the row where it is, and
       * says why in a closed-set sentence carrying nothing from the exception.
       */
      return { status: "failed" as const, message: refusalMessage(locale, "failed") };
    }
    opened.current = true;
    router.push(href);
    return IDLE;
  }, IDLE);

  return (
    <form action={formAction} className="notice-open-form">
      <button
        aria-label={copy.openLabel(subjectLabel)}
        className="row-action notice-open-control"
        /*
         * `2S-ACT-007`'s discipline, applied to this control: disabled while the
         * round is in flight, so a second press cannot produce a second write.
         */
        disabled={pending}
        type="submit"
      >
        {copy.openAction}
      </button>
      {/*
        The refusal, in the row rather than instead of it. Always rendered so
        the region exists before it has anything to say — the same contract the
        verbs' outcome region carries, and for the same reason.
      */}
      <p
        aria-atomic="true"
        aria-live="polite"
        className="notice-open-outcome"
        data-status={pending ? "pending" : state.status}
        role="status"
      >
        {state.message}
      </p>
    </form>
  );
}
