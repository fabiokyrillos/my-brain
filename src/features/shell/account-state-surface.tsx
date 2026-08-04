/**
 * The dedicated non-active account surface (SH-LIFECYCLE-008).
 *
 * Rendered by the `/[locale]/account-state` route INSTEAD of any product
 * surface: no navigation, no product links, no data reads. The only action it
 * offers is sign-out (SH-LIFECYCLE-010) — the same Server Action the shell's
 * account menu uses, so the one escape hatch a non-active account keeps is the
 * one that is already tested to survive an expired session.
 *
 * A client component only because sign-out is a `useActionState` form, the
 * account-menu pattern. Everything it says comes from `lifecycle-copy.ts`;
 * the stored status enum is mapped to prose before it gets here.
 */

"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { idleSignOutState } from "@/features/auth/sign-out-state";
import type { Locale } from "@/lib/preferences";
import {
  type AccountStateKind,
  getLifecycleCopy,
  getSuspensionReasonLabel,
} from "./lifecycle-copy";

export function AccountStateSurface({
  locale,
  state,
  reasonCode = null,
}: {
  locale: Locale;
  state: AccountStateKind;
  /**
   * SH-COPY-002. The stored reason, rendered only as its public label and only
   * for a suspension — a `deleting` or `unknown` surface says nothing about why,
   * because there is nothing about why that belongs to the user there.
   */
  reasonCode?: string | null;
}) {
  const copy = getLifecycleCopy(locale);
  const stateCopy = copy.states[state];
  const [formState, formAction, pending] = useActionState(signOut, idleSignOutState);

  return (
    // `auth-stage`, not `auth-page`: SH.1 wrote a class name that exists in no
    // stylesheet, so this surface rendered its card without the centred
    // full-height stage. Found while building the sibling surfaces of SH.4.
    <main className="auth-stage">
      <div className="auth-card">
        <h1>{stateCopy.title}</h1>
        <p>{stateCopy.body}</p>
        {state === "suspended" ? <p>{getSuspensionReasonLabel(locale, reasonCode)}</p> : null}
        {state === "suspended" ? <p>{copy.suspendedReminders}</p> : null}
        <p>{stateCopy.nextStep}</p>

        <form action={formAction}>
          <input type="hidden" name="locale" value={locale} />
          <button className="button-primary" disabled={pending} type="submit">
            <LogOut aria-hidden="true" size={16} />
            <span>{pending ? copy.signingOut : copy.signOut}</span>
          </button>
        </form>

        <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
          {pending ? copy.signingOut : formState.status === "failed" ? formState.message : ""}
        </div>
        {formState.status === "failed" ? <p role="alert">{formState.message}</p> : null}
      </div>
    </main>
  );
}
