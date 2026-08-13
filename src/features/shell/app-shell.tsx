import { Suspense } from "react";
import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { CommandPalette } from "@/features/palette/command-palette";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";
import { AccountMenu } from "./account-menu";
import type { AccountIdentity } from "./account-identity";
import { LocaleSwitchLink, NavigationLinks, NotificationsLink } from "./navigation-links";

/**
 * Pure presentation over the shell's two navigations and its account surface.
 *
 * `identity` is a **prop, not a read**. The layout resolves it, so this component
 * keeps no data access and its jsdom gate needs no Supabase double — the
 * discipline `docs/ENGINEERING_STANDARDS.md` states as "components coordinate
 * rendering and interaction only".
 */
export function AppShell({
  locale,
  identity = null,
  children,
}: {
  locale: Locale;
  identity?: AccountIdentity | null;
  children: React.ReactNode;
}) {
  const t = getMessages(locale);
  // One element, mounted twice. See `account-menu.tsx` for why the two surfaces
  // may not have separate session models.
  const account = (variant: "rail" | "overflow") => (
    <AccountMenu identity={identity} locale={locale} signOut={signOut} variant={variant} />
  );

  return (
    /*
     * `lang` is declared here, and it is load-bearing rather than decorative
     * (`2N-ACCESS-003`, `2N-ACCESS-005`, ADR-112 Decision 7a).
     *
     * The root layout hardcodes `<html lang="pt-BR">` for every locale, because
     * `src/app/layout.tsx` sits **above** `[locale]` and so never receives the
     * segment. This is the first element below that point which knows the
     * locale, so it is the first place the document can tell the truth about
     * what language it is in — which a screen reader uses to pick a voice.
     *
     * It is also what makes `loading.tsx` localisable at all. An App Router
     * `loading.tsx` **receives no props** — `node_modules/next/dist/docs/01-app/
     * 03-api-reference/03-file-conventions/loading.md` states it outright:
     * "Loading UI components do not accept any parameters." It has no `params`,
     * so no locale. But it renders as this element's descendant, so the
     * `[lang]` selectors in `navigation-performance.css` can resolve which of
     * its two announcements applies, with no client JavaScript, no `headers()`
     * read, and nothing awaited that would delay an instant fallback.
     */
    <div className="app-frame" lang={locale}>
      <aside className="side-rail">
        <Link href={`/${locale}/app`} className="brand" aria-label="My Brain">
          <span className="brand-mark">B</span>
          <span>My Brain</span>
        </Link>
        <nav aria-label={t.shell.mainNavigation} className="side-nav">
          <NavigationLinks locale={locale} />
        </nav>
        {/*
          The rail foot, which `globals.css` has styled as `.rail-footer` since
          before this slice and which nothing rendered — the account surface is
          what it was reserved for (UX-26).
        */}
        <div className="rail-footer">{account("rail")}</div>
      </aside>
      <div className="main-stage">
        <header className="top-bar">
          <div className="top-actions">
            {/*
              `2I-PALETTE-001`: an explicit control, not a keyboard secret.
              Ctrl/Cmd+K works from anywhere, but a palette reachable only by a
              shortcut is a desktop power-user toy — and on mobile there is no
              shortcut at all, so the button IS the entry point.
            */}
            <CommandPalette locale={locale} />
            <Suspense fallback={<span aria-hidden="true">{locale === "pt-BR" ? "EN" : "PT"}</span>}>
              <LocaleSwitchLink locale={locale} />
            </Suspense>
            {/* A client component, because marking the current destination
                needs the pathname and this shell reads nothing (UX-34). */}
            <NotificationsLink locale={locale} />
          </div>
        </header>
        <main>{children}</main>
      </div>
      <nav aria-label={t.shell.mobileNavigation} className="bottom-nav">
        {/*
          Injected into the overflow panel rather than added as a sixth bar item:
          the bar holds four destinations and capture, and it is placed *first*
          inside the panel so it is reachable without scrolling past the secondary
          product destinations.
        */}
        <NavigationLinks account={account("overflow")} locale={locale} mobile />
      </nav>
    </div>
  );
}
