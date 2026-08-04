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

import { useActionState } from "react";
import type { Locale } from "@/lib/preferences";
import { requestAccountDeletion } from "./actions";
import { getDeletionCopy } from "./deletion-copy";
import { idleDeletionRequestState } from "./deletion-request-state";

export function DeletionSurface({ locale }: { locale: Locale }) {
  const copy = getDeletionCopy(locale);
  const [state, formAction, pending] = useActionState(
    requestAccountDeletion,
    idleDeletionRequestState,
  );

  if (state.status === "started") {
    return (
      <div className="auth-card">
        <h1>{copy.receiptTitle}</h1>
        <p>{copy.receiptBody}</p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>{copy.title}</h1>
      <p>{copy.irreversible}</p>
      <p>{copy.removes}</p>
      <p>{copy.retains}</p>
      <p>{copy.timeline}</p>

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
        <button disabled={pending} type="submit">
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
    </div>
  );
}
