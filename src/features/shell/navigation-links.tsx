"use client";

import { type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bell,
  BellRing,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CircleDollarSign,
  CircleHelp,
  Files,
  FolderKanban,
  History,
  Home,
  Inbox,
  Layers,
  Library,
  Menu,
  MessageCircleMore,
  NotebookTabs,
  Plus,
  Settings,
  Share2,
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
  secondaryNavigationKeys,
  type VisibleNavigationKey,
} from "./capabilities";
import { useDismissableDisclosure } from "./use-dismissable-disclosure";
import { NavigationPendingIndicator } from "./navigation-pending";

const icons = {
  home: Home,
  inbox: Inbox,
  work: BriefcaseBusiness,
  /* Memória. `BrainCircuit` is already `memories`, and two destinations sharing
     a glyph in one rail is a rail you have to read twice. */
  library: Library,
  calendar: CalendarDays,
  chat: MessageCircleMore,
  projects: FolderKanban,
  people: UsersRound,
  organizations: Building2,
  contexts: Layers,
  memories: BrainCircuit,
  relations: Share2,
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

/**
 * The shell's line icons share one size and one stroke, so the top bar's three
 * controls, the rail and the bottom bar read as one family. 1.75 rather than
 * lucide's default 2: at 20px the default is the heaviest thing in the chrome.
 */
export const SHELL_ICON_SIZE = 20;
export const SHELL_ICON_STROKE = 1.75;

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
        <Menu size={variant === "side-more" ? 18 : SHELL_ICON_SIZE} strokeWidth={SHELL_ICON_STROKE} aria-hidden="true" />
        <span>{label}</span>
      </summary>
      <div className={`${variant}-menu`}>{children}</div>
    </details>
  );
}

/**
 * The top bar's notifications bell (UX-34).
 *
 * It is a navigation link on every page in the product, and it was the one that
 * never said when the owner had arrived at it — `AppShell` rendered it as a
 * plain `<Link>`, so a screen reader announced the same "Notificações, link" on
 * `/app/notifications` as everywhere else. Slice H's route sweep found it by
 * asserting that navigation marks the current destination on every route.
 *
 * It lives here rather than in `app-shell.tsx` because knowing "am I there" needs
 * the pathname, and `AppShell` is deliberately a server component with no data
 * access of its own.
 */
export function NotificationsLink({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "";
  const active = isNavigationActive(pathname, "notifications");
  const t = getMessages(locale);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={t.nav.notifications}
      className={`notification-link${active ? " active" : ""}`}
      href={`/${locale}/app/notifications`}
    >
      {/* The same size and stroke as the search and account controls beside it:
          the top bar's three controls are one family (Editorial calmo, slice 7). */}
      {active
        ? <BellRing size={SHELL_ICON_SIZE} strokeWidth={SHELL_ICON_STROKE} aria-hidden="true" />
        : <Bell size={SHELL_ICON_SIZE} strokeWidth={SHELL_ICON_STROKE} aria-hidden="true" />}
    </Link>
  );
}

/**
 * The one implementation of "the same page, in the other language".
 *
 * It preserves the pathname and the whole query (`getLocaleSwitchHref`), which
 * `docs/ENGINEERING_STANDARDS.md` requires of every locale switch. It reads
 * `useSearchParams()`, so whoever mounts it wraps it in a `<Suspense>`.
 *
 * It used to be a bare "EN" in the top bar of every page. A language is chosen
 * once, so since slice 7 of Editorial calmo it is a row of the account menu,
 * and this component draws whatever row its one caller hands it: the caller
 * owns the words and the class, this owns where the link goes.
 */
export function LocaleSwitchLink({
  locale,
  label,
  className,
  onClick,
  children,
}: {
  locale: Locale;
  /** The accessible name. It must contain the visible words (WCAG 2.5.3). */
  label: string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? `/${locale}/app`;
  const searchParams = useSearchParams();
  const targetLocale = locale === "pt-BR" ? "en" : "pt-BR";

  return (
    <Link
      href={getLocaleSwitchHref(pathname, searchParams?.toString() ?? "", targetLocale)}
      aria-label={label}
      className={className}
      hrefLang={targetLocale}
      onClick={onClick}
    >
      {children}
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
        onClick={options.closeMore ? closeMoreOnFollow : undefined}
      >
        <Icon
          size={options.capture ? 24 : options.compact ? SHELL_ICON_SIZE : 18}
          strokeWidth={SHELL_ICON_STROKE}
          aria-hidden="true"
        />
        <span>{t.nav[key]}</span>
        <NavigationPendingIndicator locale={locale} />
      </Link>
    );
  };

  /*
   * `Mais` is active whenever the current destination lives behind it.
   *
   * `mobileDemotedKeys` is empty by construction (every primary destination is
   * a slot), and the secondary pair is on the rail outside the disclosure, so
   * neither surface marks `Mais` for them. Kept per surface rather than once so
   * a future demotion cannot make a destination look unreachable while you are
   * standing in it.
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
        {/*
          Life Brain A.2: Registros and Trabalho, under a rule rather than a
          heading. Visible without opening anything, below capture so the
          rail reads question → action → queue (`INFORMATION_ARCHITECTURE.md`).
        */}
        <div className="nav-group nav-group-secondary" role="group" aria-label={t.navGroups.secondary}>
          <div className="nav-group-items">
            {secondaryNavigationKeys.map((key) => renderLink(key))}
          </div>
        </div>
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
   *
   * ## Slice 2P.5: five destinations, and no disclosure among them
   *
   * The fifth slot was `Mais`, and it held the account block, the destinations
   * the bar demoted, and the five secondary groups. It retired because the two
   * things that needed it no longer do: the account moved to the top bar, and
   * Perguntas became a link in Registros' header. Life Brain A.2 then changed
   * *which* four destinations the slots hold — `capabilities.ts` carries the
   * census and `mobile-reachability-guard` re-derives it on every run.
   *
   * `mobileDemotedKeys` is empty by construction now: every primary destination
   * is a slot. The map has no `more` arm because `MobileBarSlot` no longer has
   * that member, so a future edit that reintroduces the disclosure has to say so
   * in the type first.
   */
  return (
    <>
      {mobileBarSlots.map((slot) =>
        renderLink(slot, { compact: slot !== "capture", capture: slot === "capture" }),
      )}
    </>
  );
}
