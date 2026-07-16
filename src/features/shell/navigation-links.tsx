"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, BrainCircuit, CalendarDays, CircleHelp, Clock3, Files, FolderKanban, History, Home, Inbox, ListTodo, MessageCircleMore, NotebookTabs, Plus, Settings, UsersRound } from "lucide-react";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";

const icons = { home: Home, today: CalendarDays, inbox: Inbox, tasks: ListTodo, waiting: Clock3, projects: FolderKanban, people: UsersRound, reminders: BellRing, questions: CircleHelp, chat: MessageCircleMore, memories: BrainCircuit, reviews: NotebookTabs, files: Files, history: History, settings: Settings };
const items = ["home", "today", "inbox", "tasks", "waiting", "projects", "people", "reminders", "questions", "chat", "memories", "reviews", "files", "history", "settings"] as const;

function hrefFor(locale: Locale, key: typeof items[number]) {
  return `/${locale}/app${key === "home" ? "" : `/${key}`}`;
}

function isActive(pathname: string, href: string, key: typeof items[number]) {
  if (key === "home") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavigationLinks({ locale, mobile = false }: { locale: Locale; mobile?: boolean }) {
  const pathname = usePathname() ?? `/${locale}/app`;
  const t = getMessages(locale);
  const visible = mobile ? items.slice(0, 4) : items;

  return <>
    {visible.map((key) => {
      const Icon = icons[key];
      const href = hrefFor(locale, key);
      return <Link key={key} href={href} className={`${mobile ? "" : "nav-item"}${isActive(pathname, href, key) ? " active" : ""}`} aria-current={isActive(pathname, href, key) ? "page" : undefined}><Icon size={mobile ? 20 : 18}/><span>{t.nav[key]}</span></Link>;
    })}
    {mobile && <Link href={`/${locale}/app/capture`} className="capture-fab" aria-label={t.nav.capture}><Plus size={24}/><span>{t.nav.capture}</span></Link>}
  </>;
}
