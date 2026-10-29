/**
 * The message `public/sw.js` sends an open page when it cannot navigate it.
 *
 * ## Why the page has to do the navigating
 *
 * The click handler resolves a path and then tries `WindowClient.navigate()`.
 * That call is unimplemented in WebKit, and the specification requires it to
 * reject for a client the worker does not control, so on an iPhone with the app
 * open it never moves the page. The handler used to fall back to `focus()`
 * alone, which brought the app to the front **at whatever page it was already
 * showing** and discarded the path the tap had just resolved — measured on the
 * owner's device on 2026-10-29 with an authorized delivery.
 *
 * Client-side routing belongs to the page, so the worker hands the path over
 * and the page performs the navigation.
 *
 * ## Why this module has no directive, and why the parsing lives here
 *
 * `navigate-on-notification-tap.tsx` carries `"use client"`, which marks the
 * whole module as client code. Keeping the contract and its parser in a
 * directive-free module means the parity test can read them without pulling
 * React in, and the refusals can be tested as a pure function — the same lesson
 * `features/notifications/destination.ts` records about being callable from
 * both sides.
 *
 * ## Why the message is re-validated at all
 *
 * The sender is our own worker, which makes it tempting to trust. It is still a
 * boundary, and this repository validates every boundary. Next's documentation
 * for `useRouter` states the stake directly: *"You must not send untrusted or
 * unsanitized URLs to `router.push` or `router.replace`, as this can open your
 * site to cross-site scripting (XSS) vulnerabilities. For example,
 * `javascript:` URLs sent to `router.push` or `router.replace` will be executed
 * in the context of your page."*
 *
 * `isOwnerScopedDestination` is already the product's whitelist for exactly
 * this question — a stored string that is about to become a navigation
 * performed on the owner's behalf — so it is reused rather than reinvented. It
 * bounds the path to `/{locale}/app/…`, and each page still enforces its own
 * access. ADR-142's property survives: the message may name a place inside a
 * surface the product already serves, and it may not choose anything else.
 */

import { isOwnerScopedDestination } from "@/features/notifications/destination";

/**
 * Duplicated as a literal in `public/sw.js`, which is a classic script and
 * cannot import this module. `navigate-message.test.ts` fails if the two
 * copies ever disagree.
 */
export const NAVIGATE_MESSAGE_TYPE = "my-brain/navigate";

/** The destination to navigate to, or `null` for anything else. */
export function parseNavigateMessage(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const message = data as { type?: unknown; destination?: unknown };
  if (message.type !== NAVIGATE_MESSAGE_TYPE) return null;
  if (typeof message.destination !== "string") return null;
  return isOwnerScopedDestination(message.destination) ? message.destination : null;
}
