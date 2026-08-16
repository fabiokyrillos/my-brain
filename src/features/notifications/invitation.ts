/**
 * `2O-NOTIFY-002` — when the invitation may appear, and how it is dismissed.
 *
 * ## "A moment when the user has just seen why it is useful, and never on first
 * arrival"
 *
 * The weak reading is a timer or a visit counter. Both are proxies, and both
 * can fire on an account that has never done the thing notifications are for.
 *
 * The reading taken here is that **the value is the condition**: the
 * invitation appears on the reminders surface only when the account has at
 * least one reminder still waiting to fire. That is not a proxy for
 * demonstrated value — it *is* the value, stated as a predicate. It also makes
 * *"never on first arrival"* structural rather than a rule somebody has to
 * remember: a new account has no pending reminders, so there is nothing that
 * could show it one.
 *
 * ## It invites; it does not ask
 *
 * The browser prompt is raised in exactly one file in this repository and this
 * is not it (`phase-2m-push-boundary-guard.test.ts` enforces that with an
 * allowlist of three application files). The invitation is a **link** to the
 * surface that explains the benefit, the payload promise, the bounds and how
 * to stop — because `2O-NOTIFY-003` requires the ask to state all of those,
 * and a banner cannot state them without becoming the settings page.
 *
 * So the ordering `2M-NOTIFY-003` established survives intact: explanation
 * first, on the page the reader navigated to, prompt only after an explicit
 * click there.
 */

/** Product-prefixed, so it cannot collide with Supabase's cookies. */
export const NOTIFICATION_INVITE_COOKIE = "mb_notify_invite";

/** The single value that means dismissed. Compared for equality, never parsed. */
export const NOTIFICATION_INVITE_DISMISSED_VALUE = "dismissed";

/** One year, matching the onboarding dismissal this follows. */
export const NOTIFICATION_INVITE_MAX_AGE = 60 * 60 * 24 * 365;

export function isInviteDismissedValue(raw: string | undefined | null): boolean {
  return raw === NOTIFICATION_INVITE_DISMISSED_VALUE;
}

/**
 * The cookie options, matching `onboarding/dismissal.ts` deliberately.
 *
 * `httpOnly` because the only reader is a Server Component; `lax` because the
 * only write is a same-site form post; `secure` off local HTTP so the
 * Playwright lane against `next start` behaves like production where it can.
 */
export function inviteCookieOptions(): {
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
    maxAge: NOTIFICATION_INVITE_MAX_AGE,
  };
}

/**
 * Whether the invitation may be rendered at all.
 *
 * Both halves are required and neither is sufficient. `hasDemonstratedValue`
 * is the moment; `mayInvite` (from `three-facts.ts`) is whether an invitation
 * could lead anywhere — a browser that has refused must not be sent to a page
 * whose only offer is a control that cannot work.
 */
export function shouldOfferInvitation(input: {
  readonly hasDemonstratedValue: boolean;
  readonly mayInvite: boolean;
  readonly dismissed: boolean;
}): boolean {
  if (input.dismissed) return false;
  if (!input.hasDemonstratedValue) return false;
  return input.mayInvite;
}
