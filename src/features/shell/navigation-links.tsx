"use client";

import { type MouseEvent, type ReactNode } from "react";
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
import { useDismissableDisclosure } from "./use-dismissable-disclosure";

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

function closeMoreOnFollow(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

/**
 * The secondary destinations, behind one disclosure.
 *
 * Shared by both surfaces rather than written twice: the rail used to render all
 * five groups inline while the bar hid them behind `Mais`, so the `visibility`
 * field `capabilities.ts` already declares was honoured on one surface and
 * ignored on the other (UX-01).
 *
 * The Escape and outside-press behaviours come from
 * `useDismissableDisclosure`, which the account disclosure uses too — see that
 * module for why each exists.
 */
function NavigationOverflow({
  variant,
  active,
  label,
  children,
}: {
  variant: "side-more" | "mobile-more";
  active: boolean;
  label: string;
  children: ReactNode;
}) {
  const { ref, onKeyDown } = useDismissableDisclosure();

  return (
    <details className={`${variant}${active ? " active" : ""}`} onKeyDown={onKeyDown} ref={ref}>
      <summary aria-label={label}>
        <Menu size={20} aria-hidden="true" />
        <span>{label}</span>
      </summary>
      <div className={`${variant}-menu`}>{children}</div>
    </details>
  );
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
  account,
}: {
  locale: Locale;
  mobile?: boolean;
  /**
   * The account disclosure, injected by the shell so this module holds no Server
   * Action. Rendered only on the mobile surface, where the overflow panel is the
   * account area; the desktop rail mounts it in its own foot.
   */
  account?: ReactNode;
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
        onClick={options.closeMore ? closeMoreOnFollow : undefined}
      >
        <Icon size={options.capture ? 24 : options.compact ? 20 : 18} aria-hidden="true" />
        <span>{t.nav[key]}</span>
      </Link>
    );
  };

  const overflowActive = moreNavigationGroups
    .flatMap((group) => group.items)
    .some((key) => isNavigationActive(pathname, key));

  const overflowGroups = moreNavigationGroups.map((group) => (
    <div
      className={mobile ? "mobile-nav-group" : "nav-group"}
      role="group"
      aria-label={t.navGroups[group.key]}
      key={group.key}
    >
      <span className={mobile ? "mobile-nav-group-label" : "nav-group-label"} aria-hidden="true">
        {t.navGroups[group.key]}
      </span>
      <div className="nav-group-items">
        {group.items.map((key) => renderLink(key, { closeMore: true }))}
      </div>
    </div>
  ));

  if (!mobile) {
    return (
      <>
        <div className="nav-group nav-group-primary" role="group" aria-label={t.navGroups.primary}>
          <div className="nav-group-items">
            {primaryNavigationKeys.map((key) => renderLink(key))}
          </div>
        </div>
        {renderLink("capture", { capture: true })}
        <NavigationOverflow variant="side-more" active={overflowActive} label={t.nav.more}>
          {overflowGroups}
        </NavigationOverflow>
      </>
    );
  }

  return (
    <>
      {primaryNavigationKeys.slice(0, 2).map((key) => renderLink(key, { compact: true }))}
      {renderLink("capture", { capture: true })}
      {primaryNavigationKeys.slice(2).map((key) => renderLink(key, { compact: true }))}
      <NavigationOverflow variant="mobile-more" active={overflowActive} label={t.nav.more}>
        {/*
          First in the panel, spanning both columns. The brief's rule — reachable
          without scrolling through unrelated product destinations — is a
          placement decision, and putting the account block after five groups of
          secondary links would have buried the only way to leave the product
          under the things you do while inside it.
        */}
        {account ? <div className="mobile-nav-account">{account}</div> : null}
        {overflowGroups}
      </NavigationOverflow>
    </>
  );
}
