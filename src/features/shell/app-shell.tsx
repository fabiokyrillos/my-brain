import { Suspense } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";
import { LocaleSwitchLink, NavigationLinks } from "./navigation-links";

export function AppShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = getMessages(locale);

  return (
    <div className="app-frame">
      <aside className="side-rail">
        <Link href={`/${locale}/app`} className="brand" aria-label="My Brain">
          <span className="brand-mark">B</span>
          <span>My Brain</span>
        </Link>
        <nav aria-label={t.shell.mainNavigation} className="side-nav">
          <NavigationLinks locale={locale} />
        </nav>
      </aside>
      <div className="main-stage">
        <header className="top-bar">
          <div className="top-actions">
            <Suspense fallback={<span aria-hidden="true">{locale === "pt-BR" ? "EN" : "PT"}</span>}>
              <LocaleSwitchLink locale={locale} />
            </Suspense>
            <Link
              href={`/${locale}/app/notifications`}
              className="notification-link"
              aria-label={t.nav.notifications}
            >
              <Bell size={19} aria-hidden="true" />
            </Link>
          </div>
        </header>
        <main>{children}</main>
      </div>
      <nav aria-label={t.shell.mobileNavigation} className="bottom-nav">
        <NavigationLinks locale={locale} mobile />
      </nav>
    </div>
  );
}
