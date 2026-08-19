import { notFound } from "next/navigation";

import { getSettingsCopy } from "@/features/settings/copy";
import { isSettingsSection } from "@/features/settings/sections";
import { SettingsPanel } from "@/features/settings/settings-panel";
import { SettingsSectionContent } from "@/features/settings/settings-section-content";
import { isLocale } from "@/lib/preferences";

/**
 * The other seven sections, behind one dynamic segment.
 *
 * ## One segment rather than seven folders
 *
 * Seven route files would mean seven near-identical pages, and — the part that
 * actually decides it — seven literal paths for every action that has to
 * invalidate Settings, in two locales, kept in step with a list living
 * somewhere else. One segment means one route pattern:
 * `revalidatePath("/[locale]/app/settings/[section]", "page")` matches all
 * seven, in both locales, and comes from the routing contract rather than from
 * a transcription.
 *
 * ## An unknown slug is a 404, not a fallback
 *
 * `isSettingsSection` is the same predicate the nav and the resolver use, and a
 * slug it refuses reaches `notFound()`. Rendering Geral for an unrecognised
 * name would make the URL stop describing what is on screen, which is the one
 * property `2P-SETTINGS-002` is about.
 *
 * `general` is accepted here as well as at the parent route: a hand-typed
 * `/app/settings/general` should render the section rather than 404 on the one
 * name a reader could guess. Both mount this same pair of components.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; section: string }> }) {
  const { locale: rawLocale, section } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "pt-BR";
  const copy = getSettingsCopy(locale);
  if (!isSettingsSection(section)) return { title: copy.title };
  return { title: `${copy.sections[section].name} · ${copy.title}` };
}

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}) {
  const { locale: rawLocale, section } = await params;
  if (!isLocale(rawLocale)) notFound();
  if (!isSettingsSection(section)) notFound();

  return (
    <SettingsPanel locale={rawLocale} section={section}>
      <SettingsSectionContent locale={rawLocale} section={section} />
    </SettingsPanel>
  );
}
