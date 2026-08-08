import type { ProductState } from "@/features/daily-cycle/contracts";
import type { Locale } from "@/lib/preferences";

export type ProductCapabilityState = "operational" | "informative" | "advanced" | "future";
export type ProductCapabilitySurface = "shell" | "settings" | "reviews" | "transparency";

export type CapabilityDefinition = Readonly<{
  key: string;
  state: ProductCapabilityState;
  surface: ProductCapabilitySurface;
  consumerEvidence: readonly string[];
  visible: boolean;
}>;

export const capabilityRegistry = [
  { key: "home_status", state: "informative", surface: "shell", consumerEvidence: ["loadInboxProjection", "loadAttentionProjection"], visible: true },
  { key: "timezone", state: "operational", surface: "settings", consumerEvidence: ["work-projection", "chat/actions", "agent/actions"], visible: true },
  { key: "response_style", state: "operational", surface: "settings", consumerEvidence: ["chat/actions", "agent/actions"], visible: true },
  { key: "quiet_hours", state: "operational", surface: "settings", consumerEvidence: ["claim_due_operations", "heartbeat"], visible: true },
  { key: "ai_routing", state: "advanced", surface: "settings", consumerEvidence: ["chat/actions", "process-jobs/entry", "process-jobs/attachment", "agent/actions"], visible: true },
  // Slice F1 gave it an input and consumers, so it stops being `future`. The
  // evidence is the accessor plus the surfaces that read through it — this row
  // is the honest record of that, and it was honest before, when it said the
  // column had no consumer at all.
  { key: "identity_names", state: "operational", surface: "settings", consumerEvidence: ["profile/agent-identity", "assistant/copy", "daily-cycle/copy", "shell/home-copy"], visible: true },
  { key: "locale_preference", state: "future", surface: "settings", consumerEvidence: [], visible: false },
  { key: "scheduled_reviews", state: "future", surface: "settings", consumerEvidence: [], visible: false },
  { key: "autonomy", state: "future", surface: "settings", consumerEvidence: [], visible: false },
  { key: "follow_up_intensity", state: "future", surface: "settings", consumerEvidence: [], visible: false },
  { key: "privacy_default", state: "future", surface: "settings", consumerEvidence: [], visible: false },
  { key: "reasoning_route", state: "future", surface: "settings", consumerEvidence: [], visible: false },
  { key: "background_route", state: "future", surface: "settings", consumerEvidence: [], visible: false },
  { key: "manual_reviews", state: "operational", surface: "reviews", consumerEvidence: ["generateReview"], visible: true },
  { key: "cost_transparency", state: "advanced", surface: "transparency", consumerEvidence: ["get_ai_cost_summary", "ai_usage_events"], visible: true },
  { key: "history_transparency", state: "advanced", surface: "transparency", consumerEvidence: ["audit_events"], visible: true },
] as const satisfies readonly CapabilityDefinition[];

export type CapabilityRegistryView = readonly CapabilityDefinition[];

export function getCapabilityRegistryView(surface: ProductCapabilitySurface): CapabilityRegistryView {
  return capabilityRegistry.filter((capability) => capability.surface === surface);
}

export function deriveHomeOperationalStatus({
  items,
  attentionCount,
  attentionHasNext,
}: {
  items: readonly { productState: ProductState }[];
  attentionCount: number;
  attentionHasNext: boolean;
}) {
  if (attentionCount > 0) {
    return { kind: "attention" as const, count: attentionCount, hasMore: attentionHasNext };
  }
  const organizingCount = items.filter((item) => item.productState === "organizing").length;
  if (organizingCount > 0) {
    return { kind: "organizing" as const, count: organizingCount, hasMore: false };
  }
  return { kind: "saved" as const, count: 0, hasMore: false };
}

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
  // `2J-HOJE-001`. `today` is an alias of **home**, not of Work. The word
  // labels this destination (`messages.nav.home` is "Hoje"/"Today"), so the URL
  // that spells it must highlight it -- and `/app/today` redirects here. The
  // alias moved rather than disappearing so the nav still resolves during the
  // redirect and any deep link keeps a truthful active state (`2J-HOJE-002`).
  { key: "home", route: "", group: "primary", visibility: "primary", nested: false, aliases: ["today"] },
  { key: "inbox", route: "inbox", group: "primary", visibility: "primary", nested: true, aliases: [] },
  // `2J-HOJE-001`. `today` left this alias list when `/app/today` stopped
  // resolving to Work: the word "Hoje" labels the `home` destination, so a URL
  // saying `today` that landed on a filtered task list was the collision the
  // slice exists to remove. `tasks` and `waiting` are unaffected -- both are
  // genuinely Work views and neither is the name of another destination.
  { key: "work", route: "work", group: "primary", visibility: "primary", nested: true, aliases: ["tasks", "waiting"] },
  { key: "chat", route: "chat", group: "primary", visibility: "primary", nested: true, aliases: [] },
  { key: "projects", route: "projects", group: "context", visibility: "more", nested: true, aliases: [] },
  { key: "people", route: "people", group: "context", visibility: "more", nested: true, aliases: [] },
  // EGC.1. Both tables predate every route in this list; what they never had was
  // a place. `nested: true` because each owns a detail page, so
  // `/app/organizations/<id>` has to keep the parent destination active rather
  // than clearing the highlight mid-navigation.
  { key: "organizations", route: "organizations", group: "context", visibility: "more", nested: true, aliases: [] },
  { key: "contexts", route: "contexts", group: "context", visibility: "more", nested: true, aliases: [] },
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

/**
 * The mobile bottom bar, as an ordered slot list (UX-14, DEC-1).
 *
 * **The list's length is the bar's column count and its middle element is the
 * capture control.** That is what makes exact centring a structural property
 * rather than a measurement that happens to come out right: five equal columns
 * put the third column's centre on the viewport's centre, and `capture` is the
 * third slot. `mobile-bar-centring.test.ts` pins both halves — odd length, and
 * `capture` at the midpoint — so a future edit that adds a sixth destination to
 * balance geometry fails instead of quietly decentring the button.
 *
 * Why these four destinations, and why `inbox` is not among them (owner decision,
 * 2026-07-30): Início is the attention and orientation surface, Trabalho is the
 * primary execution surface, Capturar is the central global action, Brain is the
 * primary assistant surface, and Mais is the overflow and account surface.
 * Registros is a complete archive and consultation surface rather than an
 * operational queue, so on a five-slot bar it belongs in overflow. Desktop is
 * unchanged: it still carries all four primary destinations.
 */
export const mobileBarSlots = ["home", "work", "capture", "chat", "more"] as const;

export type MobileBarSlot = (typeof mobileBarSlots)[number];

/** The index whose column centre coincides with the viewport centre. */
export const mobileBarCentreIndex = (mobileBarSlots.length - 1) / 2;

/**
 * Primary destinations the mobile bar does not carry, in their declared order.
 *
 * Derived rather than listed, so the mobile overflow follows the bar
 * automatically: change `mobileBarSlots` and whatever it drops appears here, and
 * therefore in the overflow panel, without a second edit that could be forgotten.
 */
export const mobileDemotedKeys = primaryNavigationKeys.filter(
  (key): key is Exclude<PrimaryNavigationCapability["key"], MobileBarSlot> =>
    !(mobileBarSlots as readonly string[]).includes(key),
);

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
