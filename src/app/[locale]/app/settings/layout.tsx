import type { ReactNode } from "react";

import { getSettingsCopy } from "@/features/settings/copy";
import { SettingsSectionFocus } from "@/features/settings/settings-section-focus";
import { SettingsSectionNav } from "@/features/settings/settings-section-nav";
import { isLocale } from "@/lib/preferences";

/**
 * The Settings shell — the page's one heading, the section navigation, and the
 * focus manager. Everything that must **survive** a section change lives here.
 *
 * ## Why the nav is in the layout rather than on each page
 *
 * A layout persists across navigations within its segment, so the nav renders
 * once for all eight sections. On a page it would remount on every change,
 * which loses focus, re-announces the whole list to a screen reader, and makes
 * the eight sections feel like eight different products rather than one surface
 * with eight views.
 *
 * `SettingsSectionFocus` has a harder dependency on the same fact: its whole
 * mechanism is a ref that distinguishes *arrived here* from *moved here*, and a
 * ref only survives if the component does.
 *
 * ## One `<h1>`, and the demotion that is deliberately not done
 *
 * This is the page's only heading. Every component mounted inside a section
 * keeps the `<h2>` it already had, so the outline is h1 → h2 → h3 — the same
 * rule `notifications/page-outline.test.ts` enforces on the other surface this
 * slice touches.
 *
 * A per-section `<h2>` would have forced thirteen components down to `<h3>`, and
 * every spec that selects a heading by level with them, to express something the
 * navigation already expresses: the active section carries `aria-current="page"`
 * and the panel carries the section's name as its accessible name.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";
  const copy = getSettingsCopy(locale);

  return (
    <div className="settings-page">
      <p className="eyebrow">{locale === "pt-BR" ? "PREFERÊNCIAS OPERACIONAIS" : "OPERATIONAL PREFERENCES"}</p>
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
      <div className="settings-layout">
        <SettingsSectionNav locale={locale} />
        {children}
      </div>
      <SettingsSectionFocus />
    </div>
  );
}
