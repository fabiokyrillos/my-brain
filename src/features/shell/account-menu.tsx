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

import { Suspense, useActionState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Languages, LogOut, Settings, UserRound } from "lucide-react";

import { UniversalStateLine } from "@/features/experience/universal-state";
import { idleSignOutState, type SignOutState } from "@/features/auth/sign-out-state";
import type { Locale } from "@/lib/preferences";
import { getAccountCopy, languageRowLabel } from "./account-copy";
import type { AccountIdentity } from "./account-identity";
import { LocaleSwitchLink, SHELL_ICON_SIZE, SHELL_ICON_STROKE } from "./navigation-links";
import { useDismissableDisclosure } from "./use-dismissable-disclosure";

/** The panel's row icons: a size below the chrome's, the same stroke. */
const ROW_ICON = { size: 18, strokeWidth: SHELL_ICON_STROKE, "aria-hidden": true } as const;

/**
 * A followed row closes the panel it sits in.
 *
 * Both links navigate inside the same layout, and `open` is DOM state on a
 * `<details>` that survives the navigation — so without this the panel stayed
 * open over the page the owner had just asked for (and, for the language row,
 * over the same page redrawn in the other language).
 */
function closeOnFollow(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

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
   * does not. The variant changes the class and **where the name is drawn**,
   * and nothing else; the rows, the sign-out action, the pending handling, the
   * failure state and the focus behaviour are defined once.
   *
   * Where the name is drawn (Editorial calmo, slice 7): on the rail the control
   * has room for it, so it sits beside the avatar. In the top bar the control is
   * a 44px icon, one of three of the same family, so the name heads the panel it
   * opens instead. Once per mount either way — never both, which a screen reader
   * would hear twice.
   */
  variant?: "rail" | "overflow" | "header";
}) {
  const copy = getAccountCopy(locale);
  const { ref, onKeyDown } = useDismissableDisclosure();
  const [state, formAction, pending] = useActionState(signOut, idleSignOutState);
  const displayName = identity?.displayName ?? copy.accountFallback;
  const nameInPanel = variant === "header";
  const name = (
    <span className="account-summary-text">
      <small>{copy.signedInAs}</small>
      <strong>{displayName}</strong>
    </span>
  );
  /*
    The language row's two lines. The second names the other language in that
    language, and says so with `lang`, so it is pronounced as what it is.
  */
  const languageRow: ReactNode = (
    <>
      <Languages {...ROW_ICON} />
      <span className="account-menu-item-text">
        <span>{`${copy.language}: ${copy.currentLanguage}`}</span>
        <small>
          {`${copy.switchLanguageTo} `}
          <span lang={locale === "pt-BR" ? "en" : "pt-BR"}>{copy.otherLanguage}</span>
        </small>
      </span>
    </>
  );

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
          <UserRound size={SHELL_ICON_SIZE} strokeWidth={SHELL_ICON_STROKE} />
        </span>
        {nameInPanel ? null : name}
      </summary>

      <div aria-label={copy.panelLabel} className="account-menu-panel" role="group">
        {nameInPanel ? <div className="account-menu-identity">{name}</div> : null}

        <Link className="account-menu-item" href={`/${locale}/app/settings`} onClick={closeOnFollow}>
          <Settings {...ROW_ICON} />
          <span>{copy.settings}</span>
        </Link>

        {/*
          The locale switch, which was a bare "EN" in the top bar of every page.

          `LocaleSwitchLink` is still the one implementation: it keeps the
          pathname and the whole query, as `docs/ENGINEERING_STANDARDS.md`
          requires of a locale switch. It reads `useSearchParams()`, hence the
          boundary; the fallback is the same row, inert, so the panel does not
          change height when the link resolves.
        */}
        <Suspense fallback={<span aria-hidden="true" className="account-menu-item">{languageRow}</span>}>
          <LocaleSwitchLink
            className="account-menu-item"
            label={languageRowLabel(locale)}
            locale={locale}
            onClick={closeOnFollow}
          >
            {languageRow}
          </LocaleSwitchLink>
        </Suspense>

        <form action={formAction}>
          <input type="hidden" name="locale" value={locale} />
          {/*
            `disabled` while pending is what prevents the double submission: a
            second sign-out on an already-cleared session is harmless at the
            provider, but it would race two redirects and can leave the user on a
            login page that then bounces.
          */}
          <button className="account-menu-item account-sign-out" disabled={pending} type="submit">
            <LogOut {...ROW_ICON} />
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
