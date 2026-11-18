/**
 * The deletion request surface — SH-DELETE-002/010, SH-COPY-003.
 *
 * ## Why this is landing in SH.4
 *
 * SH.2 built and tested `requestAccountDeletion` and its copy, and merged them
 * with **no UI consumer** — its own acceptance record says so. SH-LEGAL-010
 * then requires the consent decline path to offer "sign-out and the deletion
 * surface", and a decline path pointing at a route that does not exist is not a
 * path. So the surface is built here, over an action that is already merged and
 * already unit-tested: no new server logic, no migration, and SH.2's
 * consumer-less contract gains its consumer.
 *
 * All four SH-COPY-003 claims are stated **before** the confirmation control is
 * reachable — irreversibility, what is removed, what the deletion log retains,
 * and the expected timeline — because a confirmation the reader has to scroll
 * past the consequences to reach is a confirmation of nothing.
 */

"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import type { Locale } from "@/lib/preferences";
import { requestAccountDeletion } from "./actions";
import { getDeletionCopy } from "./deletion-copy";
import { idleDeletionRequestState } from "./deletion-request-state";

/** Refusals the provider actually answered, which spend the single-use token. */
const CHALLENGE_SPENT = new Set(["password", "captcha-failed"]);

export function DeletionSurface({
  locale,
  captcha,
}: {
  locale: Locale;
  /**
   * The Turnstile widget, rendered by the **page** and passed in.
   *
   * Not imported here, and that is load-bearing rather than stylistic. This is
   * a client component; importing `TurnstileWidget` would pull it into the
   * client bundle, where `turnstileSiteKey(process.env)` reads the key through
   * a function parameter that Next cannot statically inline. The site key would
   * come back `undefined`, the widget would render nothing, no token would be
   * produced, and every deletion would be refused for a missing challenge —
   * the same silent, configuration-shaped failure the CSP bug in
   * `next.config.ts` describes. Rendering it on the server and handing it down
   * as a node keeps the key where it is resolvable.
   */
  captcha?: ReactNode;
}) {
  const copy = getDeletionCopy(locale);
  const [state, formAction, pending] = useActionState(
    requestAccountDeletion,
    idleDeletionRequestState,
  );

  if (state.status === "started") {
    return (
      <div className="auth-column">
        <h1>{copy.receiptTitle}</h1>
        <p className="auth-caption">{copy.receiptBody}</p>
      </div>
    );
  }

  return (
    <div className="auth-column">
      <h1>{copy.title}</h1>
      {/*
        Editorial calmo (ADR-180). The four SH-COPY-003 claims, every word of
        them, still ahead of the first control. They were four paragraphs run
        together in one grey block; now the one that cannot be taken back is
        said first, in the risk tone, and the other three — what goes, what
        stays, how long — are rows.
      */}
      <p className="auth-warning">{copy.irreversible}</p>
      <ul className="auth-facts">
        <li>{copy.removes}</li>
        <li>{copy.retains}</li>
        <li>{copy.timeline}</li>
      </ul>

      <form action={formAction} className="auth-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          {copy.confirmationLabel}
          <input autoComplete="off" maxLength={64} name="confirmation" required />
        </label>
        <label>
          {copy.passwordLabel}
          <input
            autoComplete="current-password"
            maxLength={256}
            name="password"
            required
            type="password"
          />
        </label>
        {captcha}
        {/* The one filled risk button in the product: this is the action that
            cannot be undone, and it looks like nothing else. */}
        <button className="auth-danger-action" disabled={pending} type="submit">
          {pending ? copy.submitting : copy.submit}
        </button>
      </form>

      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.submitting : state.status === "error" ? (state.message ?? "") : ""}
      </div>
      {state.status === "error" && state.message ? (
        <p className="form-alert" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "error" && state.code && CHALLENGE_SPENT.has(state.code) ? (
        <p className="form-hint">{copy.retryHint}</p>
      ) : null}
    </div>
  );
}
