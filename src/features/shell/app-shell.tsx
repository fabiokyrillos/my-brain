import Link from "next/link";
import { Bell, CircleUserRound } from "lucide-react";
import type { Locale } from "@/lib/preferences";
import { NavigationLinks } from "./navigation-links";

export function AppShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const pt = locale === "pt-BR";
  return (
    <div className="app-frame">
      <aside className="side-rail">
        <Link href={`/${locale}/app`} className="brand" aria-label="My Brain"><span className="brand-mark">B</span><span>My Brain</span></Link>
        <nav aria-label={pt ? "Navegação principal" : "Main navigation"} className="side-nav"><NavigationLinks locale={locale}/></nav>
        <div className="rail-footer"><Link href={`/${locale}/app/settings`} className="profile-chip"><CircleUserRound size={22}/><span><strong>{pt ? "Seu perfil" : "Your profile"}</strong><small>Brain ativo</small></span></Link></div>
      </aside>
      <div className="main-stage">
        <header className="top-bar"><span className="status-dot">Brain atento</span><div className="top-actions"><Link href={pt ? "/en/app" : "/pt-BR/app"}>{pt ? "EN" : "PT"}</Link><Link href={`/${locale}/app/notifications`} className="notification-link" aria-label={pt ? "Notificações" : "Notifications"}><Bell size={19}/></Link></div></header>
        <main>{children}</main>
      </div>
      <nav aria-label={pt ? "Navegação móvel" : "Mobile navigation"} className="bottom-nav"><NavigationLinks locale={locale} mobile/></nav>
    </div>
  );
}
