/**
 * `2I-PALETTE-002` / `2I-PALETTE-004` / `2I-PALETTE-005` / `2I-PALETTE-007` —
 * the palette's **closed** action registry.
 *
 * ## The one design rule, and why it is a rule rather than a preference
 *
 * **There is no generic command executor.** Every action the palette can take
 * is enumerated here as data, and every one of them is either a *navigation*
 * (an href) or a *route to an existing surface that owns the write*. The
 * palette itself performs no mutation and holds no handler that could.
 *
 * The threat model calls this **T-2I-02** and rates it likelier than the search
 * oracle, for an uncomfortable reason: the generic version — a map of strings
 * to handlers, then handlers that take parameters, then a handler that writes —
 * is *better engineering* by every local measure. Less duplication, trivially
 * extensible. It is also a second write path into a product whose per-action
 * authorization, audit and undo all live on the first one.
 *
 * So the registry is **data, not behaviour**. An action names a destination.
 * Starting a task, a capture or a conversation means *going to the surface that
 * already does it*, with its existing preview and confirmation intact.
 *
 * ## User text is a query, never an instruction
 *
 * `2I-PALETTE-005`. What the user types filters this list. It is never parsed
 * into an operation, never interpolated into a handler name, and never reaches
 * a model — Phase 2I makes no model call at all.
 *
 * ## Absent, not disabled
 *
 * `2I-PALETTE-007`. An action the user cannot currently take is **omitted**,
 * and availability is computed from the same predicate the surface uses, so the
 * palette cannot disagree with the product. A listed-then-refused action
 * teaches the user the product is unreliable; worse, listing an action for a
 * lifecycle state the account is not in leaks that state.
 */

import type { Locale } from "@/lib/preferences";
import { getNavigationHref, navigationCapabilities, type NavigationKey } from "@/features/shell/capabilities";

/** What the action is for, which decides how it is grouped and labelled. */
export const PALETTE_ACTION_KINDS = ["navigate", "create", "search"] as const;
export type PaletteActionKind = (typeof PALETTE_ACTION_KINDS)[number];

/**
 * An action, as data.
 *
 * Note what is **absent**: there is no `handler`, no `run`, no `execute`. The
 * only thing an action can do is send the user somewhere. That absence is the
 * boundary, and `phase-2i-palette-guard.test.ts` asserts the type has no such
 * field.
 */
export type PaletteAction = {
  /** Stable, content-free id. Safe for telemetry — see `2I-METRIC-004`. */
  readonly id: string;
  readonly kind: PaletteActionKind;
  /** The destination. Every action is a navigation; none is a mutation. */
  readonly href: string;
  /** Localised label, supplied by the caller from the i18n layer. */
  readonly label: string;
  /** Extra words the query may match — never rendered as the label. */
  readonly keywords: readonly string[];
  /** The navigation key this action belongs to, when it has one. */
  readonly navigationKey?: NavigationKey;
};

export type PaletteAvailability = {
  /**
   * Whether the account may act at all.
   *
   * `false` for a suspended or deleting account. Create actions are then
   * **omitted** rather than shown and refused, and navigation is kept, because
   * reading is still permitted and hiding it would strand the user.
   */
  readonly canCreate: boolean;
};

export type PaletteLabels = {
  readonly nav: Readonly<Record<string, string>>;
  readonly createCapture: string;
  readonly createConversation: string;
  readonly createTask: string;
  readonly openSearch: string;
  readonly keywords: Readonly<Record<string, readonly string[]>>;
};

/**
 * Build the closed action list for one render.
 *
 * Navigation actions are derived from `capabilities.ts` rather than restated,
 * so a destination added tomorrow appears in the palette tomorrow with no
 * change here — and, more importantly, a destination **removed** cannot linger
 * in a second hard-coded list.
 */
export function buildPaletteActions({
  locale,
  labels,
  availability,
}: {
  locale: Locale;
  labels: PaletteLabels;
  availability: PaletteAvailability;
}): readonly PaletteAction[] {
  const actions: PaletteAction[] = [];

  for (const capability of navigationCapabilities) {
    // `context-only` destinations are reachable from their context, not from a
    // global list; surfacing `jobs` in the palette would be surfacing an
    // internal queue as a product destination.
    if (capability.visibility === "context-only") continue;

    const label = labels.nav[capability.key];
    if (!label) continue;

    actions.push({
      id: `navigate:${capability.key}`,
      kind: "navigate",
      href: getNavigationHref(locale, capability.key),
      label,
      keywords: labels.keywords[capability.key] ?? [],
      navigationKey: capability.key,
    });
  }

  // Create actions route to the surfaces that already own the write, with
  // their existing preview and confirmation. The palette adds no capability.
  if (availability.canCreate) {
    actions.push(
      {
        id: "create:capture",
        kind: "create",
        href: getNavigationHref(locale, "capture"),
        label: labels.createCapture,
        keywords: labels.keywords.capture ?? [],
        navigationKey: "capture",
      },
      {
        id: "create:conversation",
        kind: "create",
        href: getNavigationHref(locale, "chat"),
        label: labels.createConversation,
        keywords: labels.keywords.chat ?? [],
        navigationKey: "chat",
      },
      {
        // Routes to the composer, which owns `task-commands`' create-intent
        // path with preview and confirmation. The palette does not create a
        // task; it takes you to the thing that does.
        id: "create:task",
        kind: "create",
        href: getNavigationHref(locale, "chat"),
        label: labels.createTask,
        keywords: labels.keywords.task ?? [],
        navigationKey: "chat",
      },
    );
  }

  actions.push({
    id: "search:global",
    kind: "search",
    href: `/${locale}/app/search`,
    label: labels.openSearch,
    keywords: labels.keywords.search ?? [],
  });

  return actions;
}

/**
 * Filter by the typed query.
 *
 * Case- and accent-insensitive over label and keywords. **The query is data**:
 * it selects from a fixed list and is never interpreted.
 */
export function filterPaletteActions(
  actions: readonly PaletteAction[],
  query: string,
): readonly PaletteAction[] {
  const needle = normalise(query);
  if (needle === "") return actions;
  return actions.filter((action) => {
    if (normalise(action.label).includes(needle)) return true;
    return action.keywords.some((keyword) => normalise(keyword).includes(needle));
  });
}

/** Lowercase and strip diacritics, so `orgao` finds `Órgão`. */
export function normalise(value: string): string {
  return value
    .normalize("NFD")
    // Written as an escape, not as literal combining marks: the literal form
    // is invisible in most editors and survives a copy-paste only by luck.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
