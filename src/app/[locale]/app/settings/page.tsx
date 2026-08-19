import { getSettingsCopy } from "@/features/settings/copy";
import { DEFAULT_SETTINGS_SECTION } from "@/features/settings/sections";
import { SettingsPanel } from "@/features/settings/settings-panel";
import { SettingsSectionContent } from "@/features/settings/settings-section-content";
import { isLocale } from "@/lib/preferences";

/**
 * Geral, at `/app/settings` — the route everything in the product already links
 * to.
 *
 * ## Why this renders a section instead of redirecting to one
 *
 * A redirect to `/app/settings/general` would **trap the back button**: leaving
 * that URL backwards lands here, and here would send you forward again.
 * `2P-SETTINGS-002` asks for back and forward to be preserved, so the parent
 * route renders the default section rather than pointing at it.
 *
 * `/app/settings/general` still resolves, through the `[section]` segment, and
 * mounts the same two components with the same props — so the two URLs cannot
 * drift. `settingsSectionHref` emits this one, which is why every existing link
 * (`AccountMenu`, `AccountDataStrip`, the navigation registry) is untouched by
 * the whole reorganization.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";
  const copy = getSettingsCopy(locale);
  return { title: `${copy.sections[DEFAULT_SETTINGS_SECTION].name} · ${copy.title}` };
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";

  return (
    <SettingsPanel locale={locale} section={DEFAULT_SETTINGS_SECTION}>
      <SettingsSectionContent locale={locale} section={DEFAULT_SETTINGS_SECTION} />
    </SettingsPanel>
  );
}
