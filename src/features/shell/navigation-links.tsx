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
  mobileBarSlots,
  mobileDemotedKeys,
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

  /*
   * `Mais` is active whenever the current destination lives behind it.
   *
   * On mobile that set is wider than on desktop: `mobileDemotedKeys` — today just
   * Registros — is on the rail but not on the bar, so a user reading Registros on
   * a phone must still see the disclosure that contains it marked active.
   * Computing this per surface rather than once is the whole of what keeps the
   * demotion from making a destination look unreachable while you are standing in
   * it.
   */
  const overflowKeys = [
    ...(mobile ? mobileDemotedKeys : []),
    ...moreNavigationGroups.flatMap((group) => group.items),
  ];
  const overflowActive = overflowKeys.some((key) => isNavigationActive(pathname, key));

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

  /*
   * The bar is rendered straight from `mobileBarSlots`, in order.
   *
   * Mapping the declared order rather than slicing `primaryNavigationKeys` around
   * a hardcoded midpoint is what keeps DOM order, visual order, keyboard order
   * and screen-reader order identical: there is one sequence, and the grid gives
   * each entry one column in that sequence. The previous `slice(0,2)` / `slice(2)`
   * split produced six children with the capture control third — which cannot be
   * centred in six columns, and is why exact centring was gated (UX-14).
   */
  return (
    <>
      {mobileBarSlots.map((slot) =>
        slot === "more" ? (
          <NavigationOverflow
            active={overflowActive}
            key="more"
            label={t.nav.more}
            variant="mobile-more"
          >
            {/*
              The account block is first and spans both columns: the way out of
              the product must not sit below the things you do inside it.
            */}
            {account ? <div className="mobile-nav-account">{account}</div> : null}
            {/*
              Then the destinations the bar demoted, before the secondary groups.
              Registros is a primary destination everywhere else, so inside `Mais`
              it is the first product destination rather than one more item in
              `Contexto` — and it needs no scrolling to reach.
            */}
            {mobileDemotedKeys.length ? (
              <div
                aria-label={t.navGroups.primary}
                className="mobile-nav-group mobile-nav-demoted"
                role="group"
              >
                <div className="nav-group-items">
                  {mobileDemotedKeys.map((key) => renderLink(key, { closeMore: true }))}
                </div>
              </div>
            ) : null}
            {overflowGroups}
          </NavigationOverflow>
        ) : (
          renderLink(slot, { compact: slot !== "capture", capture: slot === "capture" })
        ),
      )}
    </>
  );
}
