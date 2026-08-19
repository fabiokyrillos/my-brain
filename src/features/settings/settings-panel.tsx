import type { ReactNode } from "react";

import type { Locale } from "@/lib/preferences";
import { getSettingsCopy } from "./copy";
import { SETTINGS_PANEL_ID, type SettingsSection } from "./sections";

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
  children,
}: {
  locale: Locale;
  section: SettingsSection;
  children: ReactNode;
}) {
  const copy = getSettingsCopy(locale);
  const { name, summary } = copy.sections[section];

  return (
    <section
      aria-label={name}
      className="settings-panel"
      data-settings-section={section}
      id={SETTINGS_PANEL_ID}
      tabIndex={-1}
    >
      {/*
        One sentence saying what is in here, before the controls. It is a
        paragraph rather than a heading on purpose: it describes the section the
        reader just chose, and a second heading between the page title and the
        controls would push every control's own `<h2>` a level down for nothing.
      */}
      <p className="settings-panel-summary">{summary}</p>
      {children}
    </section>
  );
}
