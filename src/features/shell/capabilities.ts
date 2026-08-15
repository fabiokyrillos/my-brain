import type { ProductState } from "@/features/daily-cycle/contracts";
import type { Locale } from "@/lib/preferences";

/**
 * What a row's state claims, and the one `2O-ACTIVATION-006` had to add.
 *
 * `operational` · `informative` · `advanced` — the capability is real and the
 * product says so, with or without a control behind a disclosure.
 *
 * `future` — **no behavioural consumer**. Nothing in the product reads the
 * column, so no control may exist for it (`R-24`), and the row records that.
 *
 * `uncontrolled` — **real consumers, and no authorized control.** This is the
 * distinction the registry could not previously express, and its absence is the
 * ambiguity `2O-ACTIVATION-006` exists to remove: `scheduled_reviews` sat at
 * `future` with empty evidence, so *"no review runs by schedule"* and *"the
 * scheduling preference has no consumer"* were both readable off one row, and
 * only one of them is true. `review-schedule.ts` reads all three review columns.
 *
 * The state is also what ADR-117 requires of `embedding_model` — *"real
 * consumers, no authorized control"*, never "no consumer", which would be false,
 * and never "inert", which it is not. That row belongs to `2O-AICONFIG-004` and
 * is not created here; the vocabulary it needs is.
 */
export type ProductCapabilityState =
  | "operational"
  | "informative"
  | "advanced"
  | "future"
  | "uncontrolled";
export type ProductCapabilitySurface = "shell" | "settings" | "reviews" | "transparency";

export type CapabilityDefinition = Readonly<{
  key: string;
  state: ProductCapabilityState;
  surface: ProductCapabilitySurface;
  consumerEvidence: readonly string[];
  visible: boolean;
  /**
   * The persisted columns this row governs, in the schema's own spelling.
   *
   * Added by `2O-ACTIVATION-007`. The registry's keys are product words —
   * `autonomy`, `reasoning_route` — and the columns are `autonomy_level` and
   * `reasoning_model`, so a guard asserting "the nine consumer-less columns are
   * recorded" could not resolve one to the other and would have passed
   * vacuously. This field is the anchor: `capability-registry-guard.test.ts`
   * checks every name here against the generated database types, and checks
   * every control the settings form renders against this list.
   *
   * Empty for rows that govern a surface rather than a preference.
   */
  columns: readonly string[];
}>;

export const capabilityRegistry = [
  { key: "home_status", state: "informative", surface: "shell", consumerEvidence: ["loadInboxProjection", "loadAttentionProjection"], visible: true, columns: [] },
  { key: "timezone", state: "operational", surface: "settings", consumerEvidence: ["work-projection", "chat/actions", "agent/actions"], visible: true, columns: ["timezone"] },
  { key: "response_style", state: "operational", surface: "settings", consumerEvidence: ["chat/actions", "agent/actions"], visible: true, columns: ["personality", "tone", "response_detail"] },
  { key: "quiet_hours", state: "operational", surface: "settings", consumerEvidence: ["claim_due_operations", "heartbeat"], visible: true, columns: ["quiet_start", "quiet_end", "max_followups_per_day", "important_reminder_override"] },
  { key: "ai_routing", state: "advanced", surface: "settings", consumerEvidence: ["chat/actions", "process-jobs/entry", "process-jobs/attachment", "agent/actions"], visible: true, columns: ["ai_profile", "chat_model", "extraction_model", "review_model", "file_model"] },
  // Slice F1 gave it an input and consumers, so it stops being `future`. The
  // evidence is the accessor plus the surfaces that read through it — this row
  // is the honest record of that, and it was honest before, when it said the
  // column had no consumer at all.
  { key: "identity_names", state: "operational", surface: "settings", consumerEvidence: ["profile/agent-identity", "assistant/copy", "daily-cycle/copy", "shell/home-copy"], visible: true, columns: ["agent_name"] },
  /*
   * `columns: []` is deliberate, and it is what keeps `2O-ACTIVATION-007`'s
   * count at **nine** rather than ten: `profiles.locale` is not one of the nine
   * the requirement names, because the product's language comes from the route
   * rather than from the column.
   *
   * And `future` survives one apparent counter-example. `activation-view.ts`
   * reads `profiles.locale` — but `consumerEvidence` records **behavioural**
   * consumers, code whose output changes because of the stored value, and that
   * read only observes whether a value is *set*. Counting a read like that
   * would let any column acquire a consumer by being looked at.
   */
  { key: "locale_preference", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: [] },
  /*
   * `2O-ACTIVATION-006`. Disambiguated: the three review-time columns **have** a
   * consumer — `review-schedule.ts` reads all three and `/app/reviews` renders
   * the result — and have no control. `future` said the opposite of the first
   * half and was indistinguishable from the second.
   *
   * `visible: false` stays: `OD-2O-6` **A** signs controls for exactly these
   * three, and `2O-PREF-004` builds them in slice 2O.3. The row's final wording
   * is fixed by that outcome, as `2O-ACTIVATION-006` says; what changes here is
   * only that it stops being ambiguous.
   *
   * `/app/reviews` states *"nada é executado por horário configurado"*, and that
   * stays true — these columns say when the surface offers to close the day,
   * not when something runs.
   */
  { key: "scheduled_reviews", state: "uncontrolled", surface: "settings", consumerEvidence: ["day-review/review-schedule", "day-review-projection"], visible: false, columns: ["daily_review_time", "weekly_review_time", "weekly_review_day"] },
  { key: "autonomy", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["autonomy_level"] },
  { key: "follow_up_intensity", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["follow_up_intensity"] },
  { key: "privacy_default", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["privacy_default"] },
  { key: "reasoning_route", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["reasoning_model"] },
  { key: "background_route", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["background_model"] },
  /*
   * `2O-ACTIVATION-007`'s remaining four, which had no row at all.
   *
   * `OD-2O-7` **A** keeps the columns, offers no control, and guards the
   * absence. Recording them is the whole of the requirement: a column nobody has
   * written down is a column a future author gives a control to, having found no
   * record that its inertness was a decision.
   *
   * `privacy_preferences`, `quiet_periods` and `avatar_path` have zero
   * references outside the generated types. `ai_provider` is written on every
   * save — `buildSettingsPayload` sends the literal `"openai"` — and read by
   * nothing, which is inertness with a write path rather than inertness without
   * one, and is still no consumer.
   */
  { key: "privacy_preferences", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["privacy_preferences"] },
  { key: "quiet_periods", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["quiet_periods"] },
  { key: "avatar", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["avatar_path"] },
  { key: "ai_provider", state: "future", surface: "settings", consumerEvidence: [], visible: false, columns: ["ai_provider"] },
  { key: "manual_reviews", state: "operational", surface: "reviews", consumerEvidence: ["generateReview"], visible: true, columns: [] },
  { key: "cost_transparency", state: "advanced", surface: "transparency", consumerEvidence: ["get_ai_cost_summary", "ai_usage_events"], visible: true, columns: [] },
  { key: "history_transparency", state: "advanced", surface: "transparency", consumerEvidence: ["audit_events"], visible: true, columns: [] },
] as const satisfies readonly CapabilityDefinition[];

/**
 * The nine columns `2O-ACTIVATION-007` names, derived from the registry rather
 * than listed a second time.
 *
 * A row is one of the nine when it claims **no consumer at all** and governs at
 * least one column. Deriving it is the point: a second hand-written list would
 * be a second thing to keep true, and the guard would then be checking the list
 * against itself.
 */
export const consumerlessPreferenceColumns: readonly string[] = capabilityRegistry
  .filter((capability) => capability.state === "future" && capability.consumerEvidence.length === 0)
  .flatMap((capability) => capability.columns);

export type CapabilityRegistryView = readonly CapabilityDefinition[];

/**
 * The rows on one surface, **keeping their literal keys**.
 *
 * The signature is generic and the predicate is written out, and both are load-
 * bearing rather than decoration. Annotated as `CapabilityRegistryView` this
 * widened every `key` to `string`, so the only consumer had to cast before it
 * could look up its copy — and that cast is exactly what defeats the guarantee
 * `capability-copy.ts` exists for: **a row that becomes visible fails the build
 * until someone writes what it does.** A registry that can render a heading of
 * `undefined` is the failure `transparency/contracts.ts` refused, one surface
 * over.
 *
 * The predicate is explicit because the comparison is against a *parameter*.
 * TypeScript infers a predicate from `(c) => c.visible` — a literal boolean
 * field — but not from `c.surface === surface`, so without this the union kept
 * every surface's keys and the lookup failed on `home_status`. Caught by
 * `tsc`, which is the point.
 */
export function getCapabilityRegistryView<S extends ProductCapabilitySurface>(
  surface: S,
): readonly Extract<(typeof capabilityRegistry)[number], { surface: S }>[] {
  return capabilityRegistry.filter(
    (capability): capability is Extract<(typeof capabilityRegistry)[number], { surface: S }> =>
      capability.surface === surface,
  );
}

export function deriveHomeOperationalStatus({
  items,
  attentionCount,
  attentionHasNext,
  conflictCount,
}: {
  items: readonly { productState: ProductState }[];
  attentionCount: number;
  attentionHasNext: boolean;
  /**
   * `2N-CONFLICT-004`. Derived memory conflicts, folded into the same count.
   *
   * **Required, not optional.** The `saved` branch below says *"Nada pendente.
   * Tudo salvo."* — a categorical claim about the whole product. A conflict the
   * owner has not resolved is pending by definition, so a Hoje that reached that
   * sentence while one existed would be making the queue's silence into a
   * statement. An optional parameter would let a future caller omit it and
   * reintroduce exactly that, without the compiler noticing.
   */
  conflictCount: number;
}) {
  const pending = attentionCount + conflictCount;
  if (pending > 0) {
    return { kind: "attention" as const, count: pending, hasMore: attentionHasNext };
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
  /*
   * Brain — the fourth primary destination (`02-arquitetura-e-rotas.md`).
   *
   * `2I-SHELL-001` pinned the four primary destinations as a delivered baseline
   * *and said why*: to stop a later slice changing them quietly. This is the
   * opposite of quietly. The approved handoff names the four by hand — Hoje ·
   * Registros · Trabalho · Brain — and the redesign's authorization covers
   * information architecture, which is exactly the decision that comment was
   * holding for an owner to make.
   *
   * The route stays `library`. Renaming the URL would break every existing link
   * for a change that is entirely about what the destination is *called* and
   * where it sits — the same move `home`/"Hoje" and `inbox`/"Registros" already
   * made, and the compatibility rule says no URL dies at this step.
   *
   * `nested: false`: `/app/library` has no sub-route. The lenses it opens are
   * separate destinations with their own keys below, so each keeps its own
   * active state rather than borrowing this one.
   */
  { key: "library", route: "library", group: "primary", visibility: "primary", nested: false, aliases: [] },
  /*
   * Conversar leaves the primary rail.
   *
   * Not a demotion of the feature — the route, the grounding, the citations and
   * every action are untouched. The architecture places it *inside* Brain as the
   * Conversas lens, and the rail holds four destinations, so it moves to the
   * `context` group beside the other lenses Brain opens. It is still one click
   * from the rail, and `mobileBarSlots` still carries it.
   */
  { key: "chat", route: "chat", group: "context", visibility: "more", nested: true, aliases: [] },
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
  /*
   * `2N-RELATION-006`, slice 2N.6. The relations surface — a list of every link
   * the Brain holds, and a secondary drawing of the part it can explain.
   *
   * `more` rather than `primary`, and that is the requirement rather than
   * restraint this time: `2N-RELATION-006` says the graph *"is never primary
   * navigation"*, and `2I-SHELL-001` pins the four primary destinations as a
   * delivered baseline. `calendar` above took the same position in Phase 2M and
   * recorded promotion as an owner decision; this one is the same, with a signed
   * ceiling on top of it.
   *
   * In the `context` group beside `people`, `projects`, `organizations` and
   * `contexts`, because those four are exactly the node types it draws.
   *
   * `nested: false` — the surface has no sub-route. It is one page, and both of
   * its presentations live on it.
   */
  { key: "relations", route: "relations", group: "context", visibility: "more", nested: false, aliases: [] },
  { key: "reviews", route: "reviews", group: "reflection", visibility: "more", nested: false, aliases: [] },
  { key: "questions", route: "questions", group: "reflection", visibility: "more", nested: false, aliases: [] },
  /*
   * `2M-CAL-001`. Its own destination, outside `/app/work` and **not** a
   * `workView` value — OD-2L-2 A keeps Work at exactly three views, so a
   * calendar reachable as a Work tab is the thing that decision refused.
   *
   * In the `organization` group beside `reminders`, and `more` rather than
   * `primary`, which is a **deliberate restraint rather than a ranking**.
   * `2I-SHELL-001` pins the four primary destinations as a delivered baseline
   * and exists to stop a later slice changing them quietly; `2M-CAL-001`
   * requires a route and says nothing about prominence. Promoting a destination
   * into the desktop rail and the mobile overflow is an information-architecture
   * decision this phase was not authorized to make, so it is left to the owner
   * and recorded as a residual rather than taken unilaterally.
   *
   * `nested: true` because the daily planner is a sub-route (slice 2M.2), so
   * `/app/calendar/...` keeps this destination active rather than clearing the
   * highlight mid-navigation. The day review is **not** one of them: slice 2M.3
   * put it on `/app/reviews`, the surface reviews already had, so it keeps the
   * `reviews` destination highlighted and needs nothing here.
   */
  { key: "calendar", route: "calendar", group: "organization", visibility: "more", nested: true, aliases: [] },
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
 * **Registros returns to the bar**, reversing the 2026-07-30 owner decision that
 * put it in overflow. That decision reasoned Registros was "a complete archive
 * and consultation surface rather than an operational queue" — which was true of
 * the surface as it then was, and is not true of the surface the redesign
 * delivers. `02-arquitetura-e-rotas.md` states the requirement directly:
 * *Registros volta para a barra — é a fila de decisão, e não pode viver em
 * overflow.* Its default view is now the decision queue, so the premise of the
 * old decision is gone with it.
 *
 * ## The one place this bar departs from the handoff, and the exact size of it
 *
 * The handoff's bar is `Hoje · Registros · [Capturar] · Trabalho · Brain`, and
 * it adds that *"Mais" deixa de existir*. The first four slots are exactly that.
 * The fifth is still `more`, and the reason has changed shape twice — so it is
 * written here as a **census with a release condition** rather than as a
 * paragraph that has to be re-argued each time.
 *
 * The 2026-08-14 version of this comment said `more` was the only route to
 * **fourteen** destinations. That was true then. Brain's lenses, Trabalho's
 * modes, Hoje's closing section and Ajustes → Dados e IA have since absorbed
 * twelve of them, and each has a named in-product path that
 * `mobile-reachability-guard.test.ts` re-derives from the components on every
 * run:
 *
 * | destination | reached from |
 * | --- | --- |
 * | chat, projects, people, organizations, contexts, memories, files, relations | Brain's lens strip and overview |
 * | calendar (and the planner) | Trabalho's mode tabs |
 * | reviews | Hoje, unconditionally |
 * | reminders | the calendar's control band, unconditionally |
 * | history, costs, jobs | Ajustes → Dados e IA, and jobs also from a failure on `/app/files` |
 *
 * **Two things are left, and the first of them is the account.** `AccountMenu`
 * is mounted in exactly two places: the desktop rail's foot, and the mobile
 * overflow panel. On a phone the top bar carries the palette, the locale switch
 * and notifications — no avatar, no profile chip. So retiring `more` today would
 * take Ajustes with it, and with Ajustes the whole of Dados e IA, and
 * **sign-out**. That is not a destination being one tap further away; it is the
 * way out of the product disappearing.
 *
 * **The second is `questions`, and this row is a correction.** An earlier
 * version of this table claimed Hoje reached it. Hoje's only link to
 * `/app/questions` sits inside `{view.openQuestion ? … : null}`, and the other
 * in-product path — `conversational-questions.tsx` — returns `null` on an empty
 * list. So an owner with no open question has no path to Perguntas but the
 * disclosure, which is the same shape Lembretes had before this part fixed it.
 * It is left as a **stated dependency rather than patched with a new link**: the
 * handoff makes Perguntas a *view of Registros* rather than a destination Hoje
 * advertises, and adding a permanent control to the cockpit to make this census
 * true would be arranging the product around its own bookkeeping.
 *
 * `02-arquitetura-e-rotas.md` already specifies the fix — *Conta e ajustes ·
 * Avatar no cabeçalho* on mobile. It is not built here because moving the
 * account surface changes the shell on both viewports, and this initiative's
 * last delimited part is not where the way out of the product gets rebuilt
 * unvalidated.
 *
 * **The release condition, stated so nobody has to rediscover it:** when
 * `AccountMenu` is mounted somewhere a phone can reach without the disclosure,
 * the fifth slot becomes `library` and this comment shrinks to nothing. The
 * guard fails the moment that census changes, in either direction — a
 * destination losing its path, or the account gaining one.
 */
export const mobileBarSlots = ["home", "inbox", "capture", "work", "more"] as const;

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
