/**
 * Phase 2P slice 2P.5 — the eight Settings sections, as one closed contract.
 *
 * `2P-SETTINGS-001` names them and `2P-SETTINGS-002` requires each to carry a
 * stable deep link. Both are properties of this module: the list is closed, the
 * href is derived from the key, and nothing else in the product may invent a
 * ninth by writing a URL.
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
 * The eight, in the order they are presented.
 *
 * The order is the reading order the owner signed: what the product is set to
 * do (Geral, Assistente), what it is allowed to use (IA), when it acts
 * (Planejamento, Notificações), what it holds (Privacidade e dados), how it
 * looks (Aparência), and the way out (Conta) — last, because everything above
 * it is something you came here to change and this is where you go when you are
 * done.
 */
export const SETTINGS_SECTIONS = [
  "general",
  "assistant",
  "ai",
  "planning",
  "notifications",
  "privacy",
  "appearance",
  "account",
] as const;

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
  return isSettingsSection(slug) ? slug : null;
}

/**
 * The two route patterns that cover all eight sections, in every locale.
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
