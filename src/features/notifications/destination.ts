/**
 * Whether a stored `action_url` is somewhere this product may send the owner.
 *
 * ## Why this is its own module, and what it cost to learn
 *
 * It lived in `notice-open-control.tsx`, which carries `"use client"`. That
 * marks the whole **module** as client code, so `attention-notice-row.tsx` — a
 * Server Component — could not call it: React refuses with *"Attempted to call
 * isOwnerScopedDestination() from the server but isOwnerScopedDestination is on
 * the client"*, and `/app` fell into its error boundary for **every owner with
 * an unanswered notice**.
 *
 * Nothing caught it. jsdom renders a Server Component and a Client Component as
 * the same function in the same bundle, so every component test passed; the
 * boundary exists only when Next draws it, which is why this repository already
 * records that **the RSC boundary is only tested in production**.
 *
 * The predicate is pure — no hooks, no DOM, no I/O — so the fix is not to move
 * the caller but to stop the function claiming a side it does not need. A
 * module with no directive is usable from both.
 *
 * ## Why a whitelist of shape, not a blacklist of schemes
 *
 * `notifications.action_url` is a **stored string**. The heartbeat writes
 * `/{locale}/app/…` into it, but a row is data and data is untrusted: an
 * absolute URL, a protocol-relative `//host`, or a `javascript:` payload in that
 * column would otherwise become a navigation the product performed on the
 * owner's behalf.
 *
 * The set of things that are not `/{locale}/app/…` is unbounded, and every
 * blacklist of an unbounded set is a blacklist with a hole in it. So:
 *
 * - it must be a path, which excludes `https://…` and `mailto:`;
 * - it must not start with `//`, which a browser reads as protocol-relative and
 *   which is the classic way a "path" turns out to be another origin;
 * - its first segment must be a locale this product serves, and its second must
 *   be `app` — the authenticated tree. `/pt-BR/auth/…` is refused too: nothing
 *   about a notice belongs on a sign-in route.
 */

import { isLocale } from "@/lib/preferences";

export function isOwnerScopedDestination(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  // `\` is a path separator to some browsers, so a leading `/\` is `//` wearing
  // a different hat.
  if (value.startsWith("/\\")) return false;
  const [, localeSegment, section] = value.split("/");
  return isLocale(localeSegment) && section === "app";
}
