"use client";

/**
 * The account and session surface (UX-26).
 *
 * Before this, the product had **no** sign-out action and no account surface on
 * any of its sixteen authenticated routes: the only way to leave was to clear
 * cookies by hand. That is the whole of what this closes.
 *
 * **One component, two mounts, one session model.** The desktop rail foot and the
 * mobile overflow panel render this same component with a different `variant`,
 * so the sign-out action, the pending handling, the failure state and the focus
 * behaviour exist once. Two implementations would be two chances for the mobile
 * surface to end a session the desktop surface does not, which for a session
 * control is the worst kind of divergence.
 *
 * **It is a disclosure, not a navigation destination.** Adding `Sair` as a
 * fifteenth primary link would have widened exactly the navigation UX-01 spent a
 * slice narrowing, and a permanent destination for a once-per-session action is
 * the wrong weight. Settings is reached from here as the *existing* destination
 * it already is — no new route.
 */

import { useActionState } from "react";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";

import { UniversalStateLine } from "@/features/experience/universal-state";
import { idleSignOutState, type SignOutState } from "@/features/auth/sign-out-state";
import type { Locale } from "@/lib/preferences";
import { getAccountCopy } from "./account-copy";
import type { AccountIdentity } from "./account-identity";
import { useDismissableDisclosure } from "./use-dismissable-disclosure";

export type SignOutHandler = (
  state: SignOutState,
  formData: FormData,
) => Promise<SignOutState>;

export function AccountMenu({
  locale,
  identity,
  signOut,
  variant = "rail",
}: {
  locale: Locale;
  /**
   * Null when the session went away between the proxy's check and the shell's
   * read. The surface still renders — a user whose session expired needs the way
   * out more than anyone, not less.
   */
  identity: AccountIdentity | null;
  signOut: SignOutHandler;
  /**
   * `header` since slice 2P.5 — the mobile top bar.
   *
   * A third mount rather than a third component, because the sentence at the
   * top of this file is the whole reason it is one component: two
   * implementations are two chances for one surface to end a session the other
   * does not. The variant changes the class and nothing else; the sign-out
   * action, the pending handling, the failure state and the focus behaviour are
   * defined once.
   */
  variant?: "rail" | "overflow" | "header";
}) {
  const copy = getAccountCopy(locale);
  const { ref, onKeyDown } = useDismissableDisclosure();
  const [state, formAction, pending] = useActionState(signOut, idleSignOutState);
  const displayName = identity?.displayName ?? copy.accountFallback;

  return (
    <details
      className={`account-menu account-menu-${variant}`}
      onKeyDown={onKeyDown}
      ref={ref}
    >
      {/*
        The accessible name carries the display name, so a screen-reader user
        hears *which* account this control belongs to rather than a generic
        "Your account" that would be identical on every account.
      */}
      <summary aria-label={`${copy.menuLabel}: ${displayName}`}>
        <span aria-hidden="true" className="account-avatar">
          <UserRound size={16} />
        </span>
        <span className="account-summary-text">
          <small>{copy.signedInAs}</small>
          <strong>{displayName}</strong>
        </span>
      </summary>

      <div aria-label={copy.panelLabel} className="account-menu-panel" role="group">
        <Link className="account-menu-item" href={`/${locale}/app/settings`}>
          <Settings size={16} aria-hidden="true" />
          <span>{copy.settings}</span>
        </Link>

        <form action={formAction}>
          <input type="hidden" name="locale" value={locale} />
          {/*
            `disabled` while pending is what prevents the double submission: a
            second sign-out on an already-cleared session is harmless at the
            provider, but it would race two redirects and can leave the user on a
            login page that then bounces.
          */}
          <button className="account-menu-item account-sign-out" disabled={pending} type="submit">
            <LogOut size={16} aria-hidden="true" />
            <span>{pending ? copy.signingOut : copy.signOut}</span>
          </button>
        </form>

        {/*
          One polite live region for the whole surface. It announces the pending
          phrase while the round is in flight and the failure once it settles —
          success never lands here, because a successful sign-out redirects and
          this tree is gone.
        */}
        <div aria-atomic="true" aria-busy={pending} aria-live="polite" className="sr-only" role="status">
          {pending ? copy.signingOut : state.status === "failed" ? state.message : ""}
        </div>

        {state.status === "failed" ? (
          /*
            `announce={false}`: the live region directly above already carries
            this exact sentence, and a second one reads it to a screen-reader
            user twice. The visible copy is the one that stays silent.
          */
          <UniversalStateLine
            announce={false}
            className="account-menu-error"
            description={state.message}
            locale={locale}
            state="error_recoverable"
          />
        ) : null}
      </div>
    </details>
  );
}
