/**
 * `NOTIFY-CONSENT-STATE-IS-SERVER-ONLY` — `granted` is two claims, and the
 * database holds only one of them.
 *
 * ## The defect
 *
 * `notification_consents.state` records what the **account** consented to.
 * Whether the **device** in front of the user can still receive anything is a
 * fact that lives only in that browser, and the two drift apart for ordinary
 * reasons: a reinstall, a cleared site, ITP evicting storage. On 2026-10-27 the
 * drift was measured — the owner reinstalled the PWA, the settings surface
 * reported alerts as active, and `push_subscriptions` still held nothing but
 * the row created on 2026-08-28 with its original endpoint.
 *
 * `PushControls` seeded its state from the stored consent and rendered the
 * enable control **only when that state was not `granted`**. So the surface
 * asserted that notifications were working while nothing could arrive, and
 * offered exactly one action: turn them off. The repair — off, then on again —
 * existed and no copy suggested it.
 *
 * ## Why the decision lives here and not in the component
 *
 * It is a pure function of two facts, and keeping it out of the component is
 * what makes it testable without a browser: jsdom has no push manager, so a
 * decision written inside the effect that reads one could only ever be
 * exercised through a stub of the thing it depends on. This module takes plain
 * values. The component's job is to read those two facts from the browser —
 * which it is the only file permitted to do — and render the answer.
 *
 * Reading raises no prompt. `2M-NOTIFY-003` constrains **requesting**
 * permission, not observing what the device already decided, and that
 * distinction is what makes a truthful surface possible at all: the alternative
 * to reading on load is continuing to guess from the server.
 */

import type { NotificationConsentState } from "./consent-contract";

/** The browser's own answer, in its own words. */
export type DevicePermission = "granted" | "denied" | "default";

/**
 * What this device reports about itself.
 *
 * `null` means *not read*, which is deliberately distinct from any value: the
 * first render happens before either fact exists, and a surface that treated
 * "unread" as "working" would reproduce the defect on every first paint.
 */
export type DeviceDeliveryFacts = Readonly<{
  permission: DevicePermission | null;
  hasSubscription: boolean | null;
}>;

/**
 * What the surface may honestly say.
 *
 * `device-silent` and `device-blocked` are split because the available repair
 * differs, and a control that cannot work must not be rendered (`R-24`):
 * a silent device can be fixed from this page with one click, a blocked one
 * only from the browser's own settings.
 */
export type DeliveryVerdict =
  | "not-granted"
  | "unknown"
  | "receiving"
  | "device-silent"
  | "device-blocked";

/** The facts before the browser has been asked anything. */
export const unreadDeviceFacts: DeviceDeliveryFacts = Object.freeze({
  permission: null,
  hasSubscription: null,
});

/**
 * Reconciles the stored consent against the device holding the screen.
 *
 * Total over its input space, and every verdict is reachable — asserted in the
 * companion test, because a verdict nothing can produce is a sentence nobody
 * can see.
 */
export function reconcileDeviceDelivery(
  consent: NotificationConsentState,
  device: DeviceDeliveryFacts,
): DeliveryVerdict {
  // A consent that is not granted is already telling the truth: the stored
  // state has its own sentence and the enable control is already offered.
  if (consent !== "granted") return "not-granted";

  // A half-read is not a read. Either fact alone can be true while the other is
  // what makes delivery impossible.
  if (device.permission === null || device.hasSubscription === null) return "unknown";

  // Permission is the binding fact, and it outranks the subscription: revoking
  // it in browser settings does not reliably drop the subscription object, so a
  // surviving subscription under a denial would otherwise read as working.
  if (device.permission === "denied") return "device-blocked";

  // `default` means this device was never asked — a click can still raise the
  // prompt, so it is repairable here rather than refused.
  if (device.permission !== "granted") return "device-silent";

  return device.hasSubscription ? "receiving" : "device-silent";
}
