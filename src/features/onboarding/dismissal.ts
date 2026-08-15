/**
 * `2O-ONBOARD-010` — the path can be dismissed, and dismissal is reversible.
 *
 * ## Why this is a cookie, and why it is not a column
 *
 * **It may not be a column.** `OD-2O-3` is signed **A**, `2O-ACTIVATION-002` is
 * therefore absolute — no stored onboarding step, cursor or flag — and ADR-118
 * Decision 9 makes *"onboarding needing persistence"* a **stop condition**. A
 * dismissal that reached the database would spend a migration nobody signed on
 * a decision the owner declined. So dismissal is per-browser state, and the
 * only question left was which kind.
 *
 * **It is a cookie rather than `localStorage`.** The panel is rendered by a
 * Server Component. A value the server cannot read forces the dismissed panel
 * to render and then be hidden by the client, which is a flash of exactly the
 * thing the owner asked to stop seeing; the alternative — an inline pre-paint
 * script — is the machinery `OD-2O-2` **A** signed for the *appearance*
 * preference, and reaching for it here would import a CSP question (`R-2O-27`)
 * that a cookie never raises. `httpOnly` also makes this strictly safer than
 * `localStorage`, which `R-2O-28` had to treat as attacker-controlled precisely
 * because any script on the origin can write it.
 *
 * `OD-2O-2` governs appearance and names no mechanism for dismissal, so this is
 * a choice within the slice rather than a reinterpretation of a signature.
 *
 * ## The cost, stated here rather than discovered later
 *
 * **Dismissal does not follow the account across devices, and on a shared
 * browser it is shared.** That is the same cost ADR-116 Decision 8 stated
 * plainly for the client-held appearance choice, and it is the price of
 * spending no migration. What *does* follow the account is the path's
 * progress — every step is derived — so `2O-ONBOARD-009` is unaffected: a
 * second device shows the same steps in the same states, merely still offering
 * them.
 *
 * ## It recognises rather than sanitises
 *
 * A cookie is whatever the client sends. Exactly one byte sequence means
 * dismissed and everything else means not dismissed — the shape `safeReturnPath`
 * took in slice 2O.1. The fallback direction is deliberate: failing toward
 * *offering* the path shows something harmless to someone who dismissed it,
 * while failing toward hiding would silently withdraw the offer from an owner
 * who never asked.
 */

/** The cookie's name. Product-prefixed so it cannot collide with Supabase's. */
export const ONBOARDING_DISMISSAL_COOKIE = "mb_onboarding";

/** The single value that means dismissed. Compared for equality, never parsed. */
export const ONBOARDING_DISMISSED_VALUE = "dismissed";

/** One year. Long enough to be a decision, short enough to lapse on a stale device. */
export const ONBOARDING_DISMISSAL_MAX_AGE = 60 * 60 * 24 * 365;

export function isDismissedValue(raw: string | undefined | null): boolean {
  return raw === ONBOARDING_DISMISSED_VALUE;
}

/**
 * The options both writes use.
 *
 * `httpOnly` because nothing in the browser reads this — the only reader is the
 * Server Component that decides whether to render. `sameSite: "lax"` because
 * the only writes are same-site form posts. `secure` off local HTTP so the
 * Playwright lane against `next start` behaves like production everywhere it
 * can and still works where it cannot.
 */
export function dismissalCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONBOARDING_DISMISSAL_MAX_AGE,
  };
}
