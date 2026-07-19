import type { Locale } from "@/lib/preferences";

export type NavigationGroupKey =
  | "primary"
  | "context"
  | "reflection"
  | "organization"
  | "transparency"
  | "preferences"
  | "global"
  | "advanced";

export type NavigationVisibility = "primary" | "more" | "global" | "context-only";

export const navigationCapabilities = [
  { key: "home", route: "", group: "primary", visibility: "primary", nested: false, aliases: [] },
  { key: "inbox", route: "inbox", group: "primary", visibility: "primary", nested: true, aliases: [] },
  { key: "work", route: "work", group: "primary", visibility: "primary", nested: true, aliases: ["today", "tasks", "waiting"] },
  { key: "chat", route: "chat", group: "primary", visibility: "primary", nested: true, aliases: [] },
  { key: "projects", route: "projects", group: "context", visibility: "more", nested: true, aliases: [] },
  { key: "people", route: "people", group: "context", visibility: "more", nested: true, aliases: [] },
  { key: "memories", route: "memories", group: "context", visibility: "more", nested: false, aliases: [] },
  { key: "files", route: "files", group: "context", visibility: "more", nested: false, aliases: [] },
  { key: "reviews", route: "reviews", group: "reflection", visibility: "more", nested: false, aliases: [] },
  { key: "questions", route: "questions", group: "reflection", visibility: "more", nested: false, aliases: [] },
  { key: "reminders", route: "reminders", group: "organization", visibility: "more", nested: false, aliases: [] },
  { key: "history", route: "history", group: "transparency", visibility: "more", nested: false, aliases: [] },
  { key: "costs", route: "costs", group: "transparency", visibility: "more", nested: false, aliases: [] },
  { key: "settings", route: "settings", group: "preferences", visibility: "more", nested: false, aliases: [] },
  { key: "capture", route: "capture", group: "global", visibility: "global", nested: false, aliases: [] },
  { key: "notifications", route: "notifications", group: "global", visibility: "global", nested: false, aliases: [] },
  { key: "jobs", route: "jobs", group: "advanced", visibility: "context-only", nested: false, aliases: [] },
] as const satisfies readonly {
  key: string;
  route: string;
  group: NavigationGroupKey;
  visibility: NavigationVisibility;
  nested: boolean;
  aliases: readonly string[];
}[];

export type NavigationCapability = (typeof navigationCapabilities)[number];
export type NavigationKey = NavigationCapability["key"];
export type VisibleNavigationKey = Exclude<NavigationKey, "jobs">;
export type MoreNavigationGroupKey = Exclude<
  NavigationGroupKey,
  "primary" | "global" | "advanced"
>;

type PrimaryNavigationCapability = Extract<NavigationCapability, { visibility: "primary" }>;
type MoreNavigationCapability = Extract<NavigationCapability, { visibility: "more" }>;

export const primaryNavigationKeys = navigationCapabilities
  .filter(
    (capability): capability is PrimaryNavigationCapability =>
      capability.visibility === "primary",
  )
  .map((capability) => capability.key);

const moreNavigationGroupKeys = [
  "context",
  "reflection",
  "organization",
  "transparency",
  "preferences",
] as const satisfies readonly MoreNavigationGroupKey[];

const moreNavigationCapabilities = navigationCapabilities.filter(
  (capability): capability is MoreNavigationCapability => capability.visibility === "more",
);

export const moreNavigationGroups = moreNavigationGroupKeys.map((groupKey) => ({
  key: groupKey,
  items: moreNavigationCapabilities
    .filter((capability) => capability.group === groupKey)
    .map((capability) => capability.key),
}));

function capabilityFor(key: NavigationKey) {
  const capability = navigationCapabilities.find((item) => item.key === key);
  if (!capability) throw new Error(`Unknown navigation capability: ${key}`);
  return capability;
}

export function getNavigationHref(locale: Locale, key: NavigationKey) {
  const route = capabilityFor(key).route;
  return `/${locale}/app${route ? `/${route}` : ""}`;
}

export function getLocaleSwitchHref(
  pathname: string,
  searchParams: string,
  targetLocale: Locale,
) {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || `/${targetLocale}/app`;
  const localizedPath = /^\/(?:pt-BR|en)(?=\/|$)/.test(pathOnly)
    ? pathOnly.replace(/^\/(?:pt-BR|en)(?=\/|$)/, `/${targetLocale}`)
    : `/${targetLocale}/app`;
  const query = searchParams.replace(/^\?/, "");
  return `${localizedPath}${query ? `?${query}` : ""}`;
}

function routeMatches(currentRoute: string, candidate: string, nested: boolean) {
  if (!candidate) return currentRoute === "";
  return currentRoute === candidate || (nested && currentRoute.startsWith(`${candidate}/`));
}

export function classifyNavigationPath(pathname: string): NavigationCapability | null {
  const pathOnly = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const match = pathOnly.match(/^\/(?:pt-BR|en)\/app(?:\/(.*))?$/);
  if (!match) return null;
  const currentRoute = match[1] ?? "";

  for (const capability of navigationCapabilities) {
    if (routeMatches(currentRoute, capability.route, capability.nested)) return capability;
    if (capability.aliases.some((alias) => routeMatches(currentRoute, alias, false))) {
      return capability;
    }
  }

  return null;
}

export function isNavigationActive(pathname: string, key: NavigationKey) {
  return classifyNavigationPath(pathname)?.key === key;
}
