/**
 * `2O-NOTIFY-004`, `-006`, `-007` — consent, permission and delivery, as three
 * facts that cannot be collapsed.
 *
 * ## Why this is a type and not a paragraph
 *
 * `2O-NOTIFY-007`: *"consent, permission and delivery are three separate facts
 * and are never collapsed into one indicator."* Written as guidance, that
 * survives exactly as long as the next person who renders a green dot. Written
 * as three disjoint enums with no shared vocabulary, the collapse is not
 * available: there is no single value any surface can read to mean "on".
 *
 * The three answer genuinely different questions, and the product has all
 * three wrong-answer modes available to it:
 *
 * | Fact | Who decides | The lie it prevents |
 * |---|---|---|
 * | consent | the account, recorded in the database | "you asked for this" when they did not |
 * | permission | the browser, on the device in front of the reader | "the browser will allow it" when it refuses |
 * | delivery | the network, and nothing in this repository knows | **"it arrived"** |
 *
 * ## Delivery is a one-member union, on purpose
 *
 * `2O-NOTIFY-006`: *"no surface claims a notification was delivered."* The
 * honest encoding of that is not a careful sentence — it is a type with no
 * value meaning "delivered". `DeliveryFact` has exactly one member, so a
 * surface that wanted to claim delivery would have to widen this union, which
 * is a diff a reviewer sees.
 *
 * And the fact is currently true in the strongest sense: push is implemented,
 * hosted, **fails with HTTP 403 on a real iPhone**, and has **never been
 * executed on Android**. Slice 2O.6 does not resolve that and may not
 * (`OD-2O-11`); it states it.
 *
 * ## Permission has an `unknown`, and that is the point of separating them
 *
 * The server holds a consent record. It does **not** hold the browser's
 * permission — that lives on a device, can change in browser settings with no
 * notification to anything, and is only ever reported at the moment a client
 * chooses to report it. So `revoked` and `expired` resolve the permission fact
 * to `unknown` rather than guessing, because guessing is what produces a
 * surface that says "allowed" to a reader whose browser is refusing.
 */

import type { NotificationConsentState } from "./consent-contract";

/** What the ACCOUNT has said, from the record the product keeps. */
export const consentFacts = ["given", "withdrawn", "lapsed", "never_given"] as const;
export type ConsentFact = (typeof consentFacts)[number];

/** What the BROWSER has said, as far as anything server-side can know. */
export const permissionFacts = [
  "granted",
  /** Sticky. The browser will not prompt again from the page (T-07). */
  "denied",
  "never_asked",
  /** No Push API here, or the environment has no sender configured. */
  "unavailable",
  /** A record exists but says nothing about the browser in front of the reader. */
  "unknown",
] as const;
export type PermissionFact = (typeof permissionFacts)[number];

/**
 * What the NETWORK has said. One member.
 *
 * Widening this requires evidence of a delivery on real hardware, which this
 * repository does not have on any platform. See the module header.
 */
export const deliveryFacts = ["unproven"] as const;
export type DeliveryFact = (typeof deliveryFacts)[number];

export type NotificationThreeFacts = {
  readonly consent: ConsentFact;
  readonly permission: PermissionFact;
  readonly delivery: DeliveryFact;
};

/**
 * Derive the three facts from the one consent state the server can read.
 *
 * Total over `NotificationConsentState`, and deliberately written as a switch
 * with no default: a sixth state added to the contract fails to compile here
 * rather than silently resolving to whatever the fallback happened to be.
 */
export function deriveThreeFacts(state: NotificationConsentState): NotificationThreeFacts {
  switch (state) {
    case "granted":
      // The only state where consent is concluded from a real subscription
      // rather than asserted by a caller — `schema.ts` refuses a client that
      // claims `granted`.
      return { consent: "given", permission: "granted", delivery: "unproven" };
    case "denied":
      // `2O-NOTIFY-004`. The account never got as far as consenting, because
      // the browser refused first — and it will keep refusing from the page.
      // Distinct from `never_given` + `never_asked`, which is recoverable by
      // asking, and from `given` + `granted`, which is consent that may still
      // never arrive.
      return { consent: "never_given", permission: "denied", delivery: "unproven" };
    case "revoked":
      // The account withdrew. The browser permission may well still be
      // granted; nothing here knows, and saying "denied" would be an invention.
      return { consent: "withdrawn", permission: "unknown", delivery: "unproven" };
    case "expired":
      // The subscription lapsed, not the intent.
      return { consent: "lapsed", permission: "unknown", delivery: "unproven" };
    case "unsupported":
      return { consent: "never_given", permission: "unavailable", delivery: "unproven" };
  }
}

/**
 * `2O-NOTIFY-002` — may this state be offered the ask at a moment of value?
 *
 * Narrower than `mayRequestPermission`, and the two are different questions.
 * That one bounds whether the *prompt* may be raised at all; this bounds
 * whether an **invitation** may be shown on a surface the reader came to for
 * another reason. A reader whose browser has refused must not be invited to a
 * page whose only offer is a control that cannot work.
 */
export function mayInviteAtMomentOfValue(facts: NotificationThreeFacts): boolean {
  if (facts.permission === "denied" || facts.permission === "unavailable") return false;
  return facts.consent !== "given";
}
