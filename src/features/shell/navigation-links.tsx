"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BellRing,
  BrainCircuit,
  CalendarDays,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  Files,
  FolderKanban,
  History,
  Home,
  Inbox,
  ListTodo,
  Menu,
  MessageCircleMore,
  NotebookTabs,
  Plus,
  Settings,
  UsersRound,
} from "lucide-react";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";

const icons = {
  home: Home,
  today: CalendarDays,
  inbox: Inbox,
  tasks: ListTodo,
  waiting: Clock3,
  projects: FolderKanban,
  people: UsersRound,
  reminders: BellRing,
  questions: CircleHelp,
  chat: MessageCircleMore,
  memories: BrainCircuit,
  reviews: NotebookTabs,
  files: Files,
  history: History,
  costs: CircleDollarSign,
  notifications: Bell,
  settings: Settings,
} as const;

type NavigationKey = keyof typeof icons;

const desktopItems: NavigationKey[] = [
  "home",
  "today",
  "inbox",
  "tasks",
  "waiting",
  "projects",
  "people",
  "reminders",
  "questions",
  "chat",
  "memories",
  "reviews",
  "files",
  "history",
  "costs",
  "settings",
];

const mobilePrimaryItems: NavigationKey[] = ["home", "today", "inbox", "tasks"];
const mobileMoreItems: NavigationKey[] = [
  "waiting",
  "projects",
  "people",
  "reminders",
  "questions",
  "chat",
  "memories",
  "reviews",
  "files",
  "history",
  "costs",
  "notifications",
  "settings",
];

function hrefFor(locale: Locale, key: NavigationKey) {
  return `/${locale}/app${key === "home" ? "" : `/${key}`}`;
}

function isActive(pathname: string, href: string, key: NavigationKey) {
  if (key === "home") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavigationLinks({
  locale,
  mobile = false,
}: {
  locale: Locale;
  mobile?: boolean;
}) {
  const pathname = usePathname() ?? `/${locale}/app`;
  const t = getMessages(locale);
  const renderLink = (key: NavigationKey, compact: boolean) => {
    const Icon = icons[key];
    const href = hrefFor(locale, key);
    const active = isActive(pathname, href, key);

    return (
      <Link
        key={key}
        href={href}
        className={`${compact ? "" : "nav-item"}${active ? " active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={compact ? 20 : 18} />
        <span>{t.nav[key]}</span>
      </Link>
    );
  };

  if (!mobile) return <>{desktopItems.map((key) => renderLink(key, false))}</>;

  const overflowActive = mobileMoreItems.some((key) => {
    const href = hrefFor(locale, key);
    return isActive(pathname, href, key);
  });

  return (
    <>
      {mobilePrimaryItems.map((key) => renderLink(key, true))}
      <Link
        href={`/${locale}/app/capture`}
        className="capture-fab"
        aria-label={t.nav.capture}
      >
        <Plus size={24} />
        <span>{t.nav.capture}</span>
      </Link>
      <details className={`mobile-more${overflowActive ? " active" : ""}`}>
        <summary aria-label={t.nav.more}>
          <Menu size={20} />
          <span>{t.nav.more}</span>
        </summary>
        <div className="mobile-more-menu">
          {mobileMoreItems.map((key) => renderLink(key, false))}
        </div>
      </details>
    </>
  );
}
