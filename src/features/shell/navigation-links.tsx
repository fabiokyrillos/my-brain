"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bell,
  BellRing,
  BrainCircuit,
  BriefcaseBusiness,
  CircleDollarSign,
  CircleHelp,
  Files,
  FolderKanban,
  History,
  Home,
  Inbox,
  Menu,
  MessageCircleMore,
  NotebookTabs,
  Plus,
  Settings,
  UsersRound,
  Wrench,
} from "lucide-react";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";
import {
  getLocaleSwitchHref,
  getNavigationHref,
  isNavigationActive,
  moreNavigationGroups,
  type NavigationKey,
  primaryNavigationKeys,
  type VisibleNavigationKey,
} from "./capabilities";

const icons = {
  home: Home,
  inbox: Inbox,
  work: BriefcaseBusiness,
  chat: MessageCircleMore,
  projects: FolderKanban,
  people: UsersRound,
  memories: BrainCircuit,
  files: Files,
  reviews: NotebookTabs,
  questions: CircleHelp,
  reminders: BellRing,
  history: History,
  costs: CircleDollarSign,
  settings: Settings,
  capture: Plus,
  notifications: Bell,
  jobs: Wrench,
} as const satisfies Record<NavigationKey, typeof Home>;

function closeMobileMore(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

function closeMobileMoreWithEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape" || !event.currentTarget.open) return;
  event.preventDefault();
  event.currentTarget.open = false;
  event.currentTarget.querySelector("summary")?.focus();
}

export function LocaleSwitchLink({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? `/${locale}/app`;
  const searchParams = useSearchParams();
  const targetLocale = locale === "pt-BR" ? "en" : "pt-BR";
  const t = getMessages(locale);

  return (
    <Link
      href={getLocaleSwitchHref(pathname, searchParams?.toString() ?? "", targetLocale)}
      aria-label={t.shell.switchLanguage}
    >
      {locale === "pt-BR" ? "EN" : "PT"}
    </Link>
  );
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
  const renderLink = (
    key: VisibleNavigationKey,
    options: { compact?: boolean; capture?: boolean; closeMore?: boolean } = {},
  ) => {
    const Icon = icons[key];
    const href = getNavigationHref(locale, key);
    const active = isNavigationActive(pathname, key);
    const className = options.capture
      ? `capture-fab${active ? " active" : ""}`
      : `${options.compact ? "mobile-primary-link" : "nav-item"}${active ? " active" : ""}`;

    return (
      <Link
        key={key}
        href={href}
        className={className}
        aria-current={active ? "page" : undefined}
        aria-label={options.capture ? t.nav.capture : undefined}
        onClick={options.closeMore ? closeMobileMore : undefined}
      >
        <Icon size={options.capture ? 24 : options.compact ? 20 : 18} aria-hidden="true" />
        <span>{t.nav[key]}</span>
      </Link>
    );
  };

  if (!mobile) {
    return (
      <>
        <div className="nav-group nav-group-primary" role="group" aria-label={t.navGroups.primary}>
          <div className="nav-group-items">
            {primaryNavigationKeys.map((key) => renderLink(key))}
          </div>
        </div>
        {renderLink("capture", { capture: true })}
        {moreNavigationGroups.map((group) => (
          <div className="nav-group" role="group" aria-label={t.navGroups[group.key]} key={group.key}>
            <span className="nav-group-label" aria-hidden="true">{t.navGroups[group.key]}</span>
            <div className="nav-group-items">
              {group.items.map((key) => renderLink(key))}
            </div>
          </div>
        ))}
      </>
    );
  }

  const overflowActive = moreNavigationGroups
    .flatMap((group) => group.items)
    .some((key) => isNavigationActive(pathname, key));

  return (
    <>
      {primaryNavigationKeys.slice(0, 2).map((key) => renderLink(key, { compact: true }))}
      {renderLink("capture", { capture: true })}
      {primaryNavigationKeys.slice(2).map((key) => renderLink(key, { compact: true }))}
      <details
        className={`mobile-more${overflowActive ? " active" : ""}`}
        onKeyDown={closeMobileMoreWithEscape}
      >
        <summary aria-label={t.nav.more}>
          <Menu size={20} aria-hidden="true" />
          <span>{t.nav.more}</span>
        </summary>
        <div className="mobile-more-menu">
          {moreNavigationGroups.map((group) => (
            <div
              className="mobile-nav-group"
              role="group"
              aria-label={t.navGroups[group.key]}
              key={group.key}
            >
              <span className="mobile-nav-group-label" aria-hidden="true">
                {t.navGroups[group.key]}
              </span>
              <div className="nav-group-items">
                {group.items.map((key) => renderLink(key, { closeMore: true }))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
