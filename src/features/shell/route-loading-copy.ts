/**
 * `2N-ACCESS-003`, `2N-ACCESS-005`, ADR-112 Decision 7a — the route loading
 * announcement, in both locales.
 *
 * ## Why this is a list and not a lookup
 *
 * Every other copy module in this repository exports `getXCopy(locale)`, because
 * every other consumer knows its locale. The route loading fallback does not:
 * an App Router `loading.tsx` **receives no parameters at all**, which
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
 * states as a flat fact ("Loading UI components do not accept any parameters").
 * There is no `params`, so there is no locale to look one up with.
 *
 * So the fallback renders **every** announcement and lets the document's own
 * `lang` decide which applies — `app-shell.tsx` declares it, and
 * `navigation-performance.css` hides the rest. That keeps the whole mechanism
 * inside the static shell: nothing is awaited, nothing reads `headers()`, no
 * client component hydrates, and the fallback stays instant. The alternatives
 * each cost something real — reading `headers()` makes the fallback dynamic, and
 * a `"use client"` boundary ships JavaScript to render a skeleton.
 *
 * The exported shape is therefore the whole set, ordered, so the component can
 * map over it and a test can assert both members exist and differ.
 */

import { locales, type Locale } from "@/lib/preferences";

export type RouteLoadingAnnouncement = {
  readonly locale: Locale;
  readonly text: string;
};

const announcements: Record<Locale, string> = {
  "pt-BR": "Carregando página",
  en: "Loading page",
};

/**
 * Every announcement, in `locales` order.
 *
 * Derived from `locales` rather than written out, so a third locale added to the
 * product cannot leave this behind silently — the record above stops
 * type-checking the moment `Locale` gains a member.
 */
export const routeLoadingAnnouncements: readonly RouteLoadingAnnouncement[] = locales.map(
  (locale) => ({ locale, text: announcements[locale] }),
);
