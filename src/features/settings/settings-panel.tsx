import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Locale } from "@/lib/preferences";
import { getSettingsCopy } from "./copy";
import { SETTINGS_PANEL_ID, settingsSectionHref, type SettingsSection } from "./sections";

/**
 * One section's content, as a named region that focus can land on.
 *
 * ## Why the panel is named and not headed
 *
 * The layout renders the page's one `<h1>Configurações</h1>`, and every
 * component mounted inside a section keeps the `<h2>` it already had. The
 * outline is h1 → h2 → h3, which is the rule
 * `notifications/page-outline.test.ts` already enforces on the other surface
 * this slice touches.
 *
 * A per-section `<h2>` would have forced thirteen components down to `<h3>`,
 * and every spec selecting a heading by level with them, to express something
 * the navigation already expresses: the active section is marked
 * `aria-current="page"` in the nav, and this element carries the same name for
 * anyone who arrives by focus rather than by reading the nav.
 *
 * ## `tabIndex={-1}`
 *
 * Programmatically focusable, never in the tab order — the same treatment
 * `app-shell.tsx` gives `<main>` so the skip link has somewhere to land.
 * `SettingsSectionFocus` is the only thing that focuses it, and only on a real
 * section change.
 */
export function SettingsPanel({
  locale,
  section,
  root = false,
  children,
}: {
  locale: Locale;
  section: SettingsSection;
  /**
   * Life Brain E.1: rendered at `/app/settings` itself. On a desktop that is
   * the default group beside the rail; on a phone it is the list of groups,
   * and the panel is hidden (`settings-extended.css`).
   */
  root?: boolean;
  children: ReactNode;
}) {
  const copy = getSettingsCopy(locale);
  const { name, summary } = copy.sections[section];

  return (
    <section
      aria-label={name}
      className="settings-panel"
      data-root={root ? "" : undefined}
      data-settings-section={section}
      id={SETTINGS_PANEL_ID}
      tabIndex={-1}
    >
      {/*
        Life Brain E.1: the phone's way back to the list of groups. Hidden on a
        desktop, where the list never left. It points at `/app/settings`, which
        on a phone shows the groups, rather than calling history.back(): a
        group opened from a notification has no list behind it.
      */}
      <Link className="settings-back" href={settingsSectionHref(locale, "general")}>
        <ChevronLeft aria-hidden="true" size={16} />
        {copy.back}
      </Link>
      {/*
        The group's name, as the panel's visible title. A paragraph styled as a
        title rather than a heading: the page's one `<h1>` is above, and every
        component inside keeps the `<h2>` it already had (see the layout).
      */}
      <p aria-hidden="true" className="settings-panel-title">{name}</p>
      <p className="settings-panel-summary">{summary}</p>
      {children}
    </section>
  );
}
