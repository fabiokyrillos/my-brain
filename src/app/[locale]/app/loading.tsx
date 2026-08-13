import { routeLoadingAnnouncements } from "@/features/shell/route-loading-copy";

/**
 * The streaming fallback for every authenticated route, including all four of
 * this phase's contextual surfaces (ADR-112 Decision 7a).
 *
 * ## What was wrong with it
 *
 * It announced `"Carregando página"` in **both** locales, so a screen reader set
 * to English announced Portuguese. PRD §4 obliges every surface this phase ships
 * or touches to declare its **loading** state in both locales, and this is the
 * one surface all of them share.
 *
 * ## Why it renders two announcements instead of choosing one
 *
 * It cannot choose. `loading.tsx` **takes no props** — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`:
 * "Loading UI components do not accept any parameters." There is no `params`
 * here and therefore no locale, and the answers that would manufacture one all
 * cost something the fallback cannot afford: `await headers()` makes an instant
 * loading state dynamic, and `"use client"` + `usePathname()` ships JavaScript
 * to render a skeleton.
 *
 * So both are rendered and the **document** decides. `app-shell.tsx` declares
 * `lang` on the frame this fallback streams into, and `navigation-performance.css`
 * hides the announcement that does not match. Content hidden with `display: none`
 * is absent from the accessibility tree, so exactly one string is announced —
 * and it is announced in a language the reader has been told about.
 *
 * The failure direction is deliberate: the rule *hides the non-matching* one
 * rather than *showing the matching* one, so a missing stylesheet or a missing
 * `lang` degrades to announcing both rather than to announcing nothing.
 *
 * ## The gate this must not weaken
 *
 * `[locale]/app/layout.tsx` awaits `requireUser` **above** the Suspense boundary
 * this file creates, because a `redirect()` raised below it is flushed after the
 * shell and degrades from a 307 into a client-side navigation. Nothing here
 * reads data, holds a client or renders anything conditional on a session, so
 * the gate is untouched: this markup is only ever reached by a request that has
 * already passed it.
 */
export default function AuthenticatedLoading() {
  return (
    <main aria-live="polite" className="route-loading" role="status">
      {routeLoadingAnnouncements.map(({ locale, text }) => (
        <span className="sr-only" data-route-loading-locale={locale} key={locale}>
          {text}
        </span>
      ))}
      <div className="route-loading-heading" data-loading-block />
      <div className="route-loading-summary" data-loading-block />
      <div className="route-loading-grid">
        <div className="route-loading-card" data-loading-block />
        <div className="route-loading-card" data-loading-block />
      </div>
    </main>
  );
}
