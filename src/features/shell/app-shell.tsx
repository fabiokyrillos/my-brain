import Link from "next/link";
import { Bell, CalendarDays, CircleUserRound, Clock3, FolderKanban, Home, Inbox, ListTodo, Plus, Settings, UsersRound } from "lucide-react";
import type { Locale } from "@/lib/preferences";
import { getMessages } from "@/i18n/messages";

const icons = { home: Home, today: CalendarDays, inbox: Inbox, tasks: ListTodo, waiting: Clock3, projects: FolderKanban, people: UsersRound, settings: Settings };

export function AppShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = getMessages(locale);
  const items = ["home", "today", "inbox", "tasks", "waiting", "projects", "people", "settings"] as const;
  return (
    <div className="app-frame">
      <aside className="side-rail">
        <Link href={`/${locale}/app`} className="brand" aria-label="My Brain"><span className="brand-mark">B</span><span>My Brain</span></Link>
        <nav aria-label={locale === "pt-BR" ? "Navegação principal" : "Main navigation"} className="side-nav">
          {items.map((key) => { const Icon = icons[key]; return <Link key={key} href={`/${locale}/app${key === "home" ? "" : `/${key}`}`} className={key === "home" ? "nav-item active" : "nav-item"}><Icon size={18}/><span>{t.nav[key]}</span></Link>; })}
        </nav>
        <div className="rail-footer"><Link href={`/${locale}/app/settings`} className="profile-chip"><CircleUserRound size={22}/><span><strong>Seu perfil</strong><small>Brain ativo</small></span></Link></div>
      </aside>
      <div className="main-stage">
        <header className="top-bar"><span className="status-dot">Brain atento</span><div className="top-actions"><Link href={locale === "pt-BR" ? "/en/app" : "/pt-BR/app"}>{locale === "pt-BR" ? "EN" : "PT"}</Link><button aria-label={locale === "pt-BR" ? "Notificações" : "Notifications"}><Bell size={19}/></button></div></header>
        <main>{children}</main>
      </div>
      <nav aria-label={locale === "pt-BR" ? "Navegação móvel" : "Mobile navigation"} className="bottom-nav">
        {items.slice(0, 4).map((key) => { const Icon = icons[key]; return <Link key={key} href={`/${locale}/app${key === "home" ? "" : `/${key}`}`}><Icon size={20}/><span>{t.nav[key]}</span></Link>; })}
        <Link href={`/${locale}/app/capture`} className="capture-fab" aria-label={t.nav.capture}><Plus size={24}/><span>{t.nav.capture}</span></Link>
      </nav>
    </div>
  );
}
