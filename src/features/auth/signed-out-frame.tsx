import type { ReactNode } from "react";

import type { Locale } from "@/lib/preferences";

import { SignedOutHeader } from "./signed-out-header";

/**
 * The frame of every page that stands outside the product shell (Editorial
 * calmo, ADR-180): the five under `/auth`, and the three an account is sent to
 * instead of the product — consent, account-state and account deletion.
 *
 * One column: the product's mark and the other language at the top, then the
 * page. The three gates used to stand on a shadowed card over a tinted wash
 * (`.auth-stage`, `.auth-card`), which was the last place that drawing
 * survived; they are the same column now, so being asked to accept the terms
 * or told an account is suspended reads as the product speaking, not as a
 * dialog from somewhere else.
 *
 * `lang` is declared here because the root layout hardcodes `pt-BR` and this is
 * the first element that knows the locale — the same reason and pattern as
 * `app-shell.tsx` and the entry page.
 *
 * A server component, so it is mounted by the route and never by the client
 * surfaces it frames.
 */
export function SignedOutFrame({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <div className="auth-shell" lang={locale}>
      <SignedOutHeader locale={locale} />
      <main className="auth-main">{children}</main>
    </div>
  );
}
