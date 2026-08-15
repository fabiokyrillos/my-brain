import Link from "next/link";
import type { Locale } from "@/lib/preferences";

/**
 * Lista · Calendário · Planejar — the three ways of looking at the same work.
 *
 * `02-arquitetura-e-rotas.md` makes Calendário and Planejar **modes of
 * Trabalho** rather than destinations of their own: they answer *when* about the
 * rows Lista answers *what* about, and the previous navigation made them look
 * like three unrelated places.
 *
 * ## Why the URLs do not change
 *
 * The consolidation table is explicit — *Calendário e Planejar tornam-se abas —
 * mantenha as URLs como aliases das abas* — and the compatibility rule under it
 * is that no existing URL dies at this step. So this is a tab strip whose tabs
 * are `<Link>`s to `/app/work`, `/app/calendar` and `/app/calendar/plan`. Every
 * bookmark, redirect and deep link keeps working, the browser's back button
 * keeps meaning what it meant, and each mode keeps its own server-rendered
 * loader instead of becoming client state that a refresh would lose.
 *
 * `aria-current="page"` rather than `role="tablist"`: these navigate to separate
 * documents. Announcing them as tabs would promise a panel that swaps in place,
 * which is exactly what does not happen — and `03-componentes.md` says tabs are
 * anchored in the URL for this reason.
 */
export type WorkMode = "list" | "calendar" | "plan";

const COPY = {
  "pt-BR": { label: "Modos de Trabalho", list: "Lista", calendar: "Calendário", plan: "Planejar" },
  en: { label: "Work modes", list: "List", calendar: "Calendar", plan: "Plan" },
} as const satisfies Record<Locale, { label: string; list: string; calendar: string; plan: string }>;

export function WorkModeTabs({
  locale,
  active,
  /**
   * The Lista tab's href, so returning to the list from Calendário keeps the
   * view, filters and grouping the user had. Without it, every trip through the
   * calendar would silently reset their narrowing to the default.
   */
  listHref,
}: {
  locale: Locale;
  active: WorkMode;
  listHref?: string;
}) {
  const copy = COPY[locale];
  const modes: readonly { readonly id: WorkMode; readonly href: string; readonly label: string }[] = [
    { id: "list", href: listHref ?? `/${locale}/app/work`, label: copy.list },
    { id: "calendar", href: `/${locale}/app/calendar`, label: copy.calendar },
    { id: "plan", href: `/${locale}/app/calendar/plan`, label: copy.plan },
  ];

  return (
    <nav aria-label={copy.label} className="work-modes">
      {modes.map((mode) => (
        <Link
          aria-current={mode.id === active ? "page" : undefined}
          className="work-mode"
          href={mode.href}
          key={mode.id}
        >
          {mode.label}
        </Link>
      ))}
    </nav>
  );
}
