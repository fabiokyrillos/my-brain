/**
 * The consent interposition — SH-LEGAL-008/009/010.
 *
 * One surface for two cases, because they are the same case: an account with no
 * acceptance row for the current version of a document. Which sentence it opens
 * with is the only difference, and that is decided by whether the account has
 * ever accepted anything — not by a separate flag that could get out of step.
 *
 * Declining is a real path (SH-LEGAL-010), not a dead end and not a dark
 * pattern: sign-out and the deletion surface are both offered, in plain words,
 * on the same screen as the accept button. The decline itself is recorded
 * content-free — which here means it is not recorded at all, because there is
 * nothing to record: an account that does not accept simply has no acceptance
 * row, and inventing a "declined" row would store a fact about a person who
 * declined to give us facts.
 *
 * A Client Component only because acceptance is a `useActionState` form — the
 * account-menu and account-state pattern.
 */

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { idleSignOutState } from "@/features/auth/sign-out-state";
import type { Locale } from "@/lib/preferences";
import { acceptPolicies } from "./actions";
import { getLegalCopy } from "./copy";
import { idleConsentState } from "./consent-state";
import { getLegalDocument } from "./documents";
import { legalDocumentPath, POLICY_DOCUMENTS } from "./versions";

export function ConsentSurface({
  locale,
  hasAcceptedBefore,
}: {
  locale: Locale;
  /** False on a first session, true when a version bump re-interposed. */
  hasAcceptedBefore: boolean;
}) {
  const copy = getLegalCopy(locale).interposition;
  const [state, formAction, pending] = useActionState(acceptPolicies, idleConsentState);
  const [signOutState, signOutAction, signingOut] = useActionState(signOut, idleSignOutState);

  return (
    <div className="auth-card">
      <h1>{copy.title}</h1>
      <p>{hasAcceptedBefore ? copy.updatedBody : copy.firstSessionBody}</p>

      <p>{copy.readFirst}</p>
      <ul>
        {POLICY_DOCUMENTS.map((document) => (
          <li key={document}>
            <Link href={legalDocumentPath(locale, document)}>
              {getLegalDocument(locale, document).title}
            </Link>
          </li>
        ))}
      </ul>

      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />
        <button className="button-primary" disabled={pending} type="submit">
          {pending ? copy.accepting : copy.accept}
        </button>
      </form>

      <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
        {pending ? copy.accepting : state.status === "failed" ? state.message : ""}
      </div>
      {state.status === "failed" ? <p role="alert">{state.message}</p> : null}

      <h2>{copy.declineTitle}</h2>
      <p>{copy.declineBody}</p>
      <form action={signOutAction}>
        <input type="hidden" name="locale" value={locale} />
        <button className="secondary-button" disabled={signingOut} type="submit">
          {copy.declineSignOut}
        </button>
      </form>
      {signOutState.status === "failed" ? <p role="alert">{signOutState.message}</p> : null}
      <p>
        {/*
          `/account/delete`, NOT `/app/settings` — SH-LEGAL-010.

          Everything under `app/` runs the consent gate, so a decline path
          pointing there sends the one user who cannot pass that gate straight
          back to this screen. The deletion surface was deliberately placed
          outside `app/` for exactly this caller; this link is what makes that
          placement do anything.
        */}
        <Link href={`/${locale}/account/delete`}>{copy.declineDelete}</Link>
      </p>
    </div>
  );
}
