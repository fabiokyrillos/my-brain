"use client";

import { useActionState } from "react";

import type { Locale } from "@/lib/preferences";

import { signOutEverywhere } from "./actions";
import { idleGlobalSignOutState } from "./contracts";
import { getPrivacyCopy } from "./copy";

/**
 * *"Sign out everywhere"* — `2O-PRIVACY-009`, `OD-2O-5` **A**.
 *
 * Distinct from `AccountMenu`'s sign-out, which ends **this** session. Both stay:
 * ending the session you are in is the common errand and belongs in the menu;
 * revoking every session is a data-control action and belongs on the page about
 * your data. Neither is a device list — `OD-2O-5` **B** would have needed a
 * service-role read on an authenticated path, and the owner signed **A** for
 * exactly that reason.
 */
export function GlobalSignOut({ locale }: { locale: Locale }) {
  const copy = getPrivacyCopy(locale);
  const [state, formAction, pending] = useActionState(signOutEverywhere, idleGlobalSignOutState);

  return (
    <form action={formAction} className="privacy-sessions">
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" disabled={pending}>
        {copy.sessions.action}
      </button>
      {state.status === "failed" ? <p role="alert">{state.message}</p> : null}
    </form>
  );
}
