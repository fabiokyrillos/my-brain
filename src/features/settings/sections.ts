/**
 * Phase 2P slice 2P.5 — the Settings sections, as one closed contract (six
 * groups since Life Brain E.1; see `SETTINGS_SECTIONS`).
 *
 * `2P-SETTINGS-001` names them and `2P-SETTINGS-002` requires each to carry a
 * stable deep link. Both are properties of this module: the list is closed, the
 * href is derived from the key, and nothing else in the product may invent a
 * seventh by writing a URL.
 *
 * ## Why Geral has no slug
 *
 * `/app/settings` renders Geral, and there is deliberately **no redirect** from
 * the parent to a `general` child. A redirect would trap the back button —
 * leaving `/settings/general` backwards lands on `/settings`, which sends you
 * forward again — and `2P-SETTINGS-002` asks for back and forward to keep
 * meaning what they mean.
 *
 * `general` is nevertheless accepted as a section value, because a hand-typed
 * `/app/settings/general` should render the section rather than 404 on the one
 * name a reader could guess. Both URLs mount the same component, so they cannot
 * drift; `settingsSectionHref` emits the canonical one.
 *
 * ## What this module is not
 *
 * It holds no copy and reads nothing. The names live in `copy.ts` and the data
 * lives in each section's own loader, so a section can be reordered or renamed
 * without touching the routing contract.
 */

import type { Locale } from "@/lib/preferences";

/**
 * The six groups, in the order they are presented (Life Brain E.1, ADR-169).
 *
 * The owner's T4 feedback ("precisa ser redesenhada 1000%") and the mockups he
 * approved on 2026-11-14 (`docs/reports/life-brain/evidence/proposal-ajustes/`)
 * replaced 2P.5's eight sections with six groups named from the reader's side:
 * who the assistant is (`general`), when it may interrupt (`day`, which joins
 * Planejamento and Notificações), what it may do alone (`autonomy`), what it
 * uses and costs (`ai`), how it looks (`appearance`), and what it holds plus
 * the way out (`privacy`, which absorbed Conta) — still last.
 */
export const SETTINGS_SECTIONS = [
  "general",
  "day",
  "autonomy",
  "ai",
  "appearance",
  "privacy",
] as const;

/**
 * The 2P.5 slugs that no longer name a group, and the group each now lives in.
 *
 * Every one of them was a published deep link (`2P-SETTINGS-002`), so none may
 * start answering 404: `[section]/page.tsx` redirects each to its group.
 */
export const LEGACY_SETTINGS_SECTIONS = {
  assistant: "general",
  planning: "day",
  notifications: "day",
  account: "privacy",
} as const satisfies Readonly<Record<string, SettingsSectionKey>>;

type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number];

export type LegacySettingsSection = keyof typeof LEGACY_SETTINGS_SECTIONS;

export function legacySettingsTarget(value: unknown): SettingsSectionKey | null {
  if (typeof value !== "string" || !Object.hasOwn(LEGACY_SETTINGS_SECTIONS, value)) return null;
  return LEGACY_SETTINGS_SECTIONS[value as LegacySettingsSection];
}

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The section `/app/settings` itself renders. */
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "general";

/**
 * The panel element's id, shared by the page that renders it and the layout
 * component that moves focus to it.
 *
 * A literal in two files is two chances for one of them to be renamed alone,
 * and the failure would be silent: focus would simply stop following the
 * section, with nothing throwing and nothing logged.
 */
export const SETTINGS_PANEL_ID = "settings-panel";

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === "string" && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * The canonical href for a section.
 *
 * Geral resolves to the parent route; every other section to its own slug under
 * the single `[section]` dynamic segment. One segment rather than seven folders
 * is what lets revalidation name every section with one route pattern instead
 * of a list that has to be kept in step with this one.
 */
export function settingsSectionHref(locale: Locale, section: SettingsSection): string {
  return section === DEFAULT_SETTINGS_SECTION
    ? `/${locale}/app/settings`
    : `/${locale}/app/settings/${section}`;
}

/**
 * The href a group's row in the list of groups opens (Life Brain E.1).
 *
 * The same as `settingsSectionHref` except for the default group, which opens
 * its explicit `/general` slug: on a phone `/app/settings` IS the list of
 * groups, so a row pointing there would never open anything. Both URLs mount
 * the same component, so a desktop reader sees no difference.
 */
export function settingsGroupHref(locale: Locale, section: SettingsSection): string {
  return section === DEFAULT_SETTINGS_SECTION
    ? `/${locale}/app/settings/${section}`
    : settingsSectionHref(locale, section);
}

/**
 * Which section a pathname is in, or `null` if it is not a settings route.
 *
 * Accepts both `/app/settings` and `/app/settings/general` for Geral, matching
 * what the routes actually render. Query strings and fragments are stripped, so
 * a deep link carrying `?page=` still resolves.
 */
export function settingsSectionFromPath(pathname: string): SettingsSection | null {
  const pathOnly = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const match = pathOnly.match(/^\/(?:pt-BR|en)\/app\/settings(?:\/([^/]+))?$/);
  if (!match) return null;
  const slug = match[1];
  if (slug === undefined) return DEFAULT_SETTINGS_SECTION;
  // A 2P.5 slug resolves to the group it now lives in, so the rail and the
  // section nav still mark the right place during the redirect.
  return isSettingsSection(slug) ? slug : legacySettingsTarget(slug);
}

/**
 * The two route patterns that cover every section, in every locale.
 *
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`
 * requires the `'page'` type whenever the path carries a dynamic segment, and
 * both of these carry `[locale]`. Slice 2P.4 measured what happens without it:
 * the resolved path invalidates nothing under a dynamic segment, the client's
 * refresh request is answered with the previous render, and the owner concludes
 * their save did not land.
 *
 * Exported as data so the actions that must invalidate Settings cannot each
 * write their own string and drift from the route tree.
 */
export const SETTINGS_REVALIDATION_PATHS = [
  "/[locale]/app/settings",
  "/[locale]/app/settings/[section]",
] as const;
