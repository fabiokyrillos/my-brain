import { describe, expect, it } from "vitest";

import {
  reconcileDeviceDelivery,
  unreadDeviceFacts,
  type DeliveryVerdict,
  type DeviceDeliveryFacts,
} from "./device-reconciliation";

/**
 * `NOTIFY-CONSENT-STATE-IS-SERVER-ONLY` — the defect this module exists to fix.
 *
 * `notification_consents.state` says what the ACCOUNT consented to. It cannot
 * say whether the device in front of the user still holds a subscription, and
 * on 2026-10-27 that difference was measured: the owner reinstalled the PWA,
 * the settings page reported alerts as active, and `push_subscriptions` still
 * held only the row created on 2026-08-28 with its original endpoint. The
 * product asserted notifications were working while nothing could arrive, and
 * offered only "turn them off".
 *
 * So `granted` is two different claims, and only one of them is in the
 * database. This module is the reconciliation, kept out of the component on
 * purpose: the decision is a pure function of two facts, and the component's
 * job is to read them from the browser and render the answer.
 */

const granted: DeviceDeliveryFacts = { permission: "granted", hasSubscription: true };

describe("a consent that is not granted is already honest", () => {
  it("defers to the stored state for every non-granted consent", () => {
    // The existing copy already says something distinct for each of these, and
    // the enable control is already offered. There is nothing to reconcile:
    // the surface is not claiming to deliver.
    for (const consent of ["denied", "unsupported", "revoked", "expired"] as const) {
      expect(reconcileDeviceDelivery(consent, granted)).toBe("not-granted");
      expect(reconcileDeviceDelivery(consent, unreadDeviceFacts)).toBe("not-granted");
    }
  });
});

describe("an unread device asserts nothing", () => {
  it("is unknown before the browser has been read", () => {
    /*
     * The first render happens before any device fact exists, and the honest
     * answer there is "not yet known" rather than either claim. Defaulting to
     * `receiving` would reproduce the defect on every first paint; defaulting
     * to `device-silent` would accuse a working device of being broken and
     * flash a repair notice at someone who needs none.
     */
    expect(reconcileDeviceDelivery("granted", unreadDeviceFacts)).toBe("unknown");
  });

  it("is unknown when only one of the two facts could be read", () => {
    // A half-read is not a read. Either fact alone can be true while the other
    // is what makes delivery impossible.
    expect(reconcileDeviceDelivery("granted", { permission: "granted", hasSubscription: null }))
      .toBe("unknown");
    expect(reconcileDeviceDelivery("granted", { permission: null, hasSubscription: true }))
      .toBe("unknown");
  });
});

describe("a granted consent is reconciled against the device", () => {
  it("reports the measured defect as repairable here", () => {
    /*
     * THE REGRESSION. Account consent granted, browser permission still
     * granted, and no subscription on the device — which is exactly what a
     * reinstall or a cleared site leaves behind. The browser will not prompt
     * again, so re-subscribing from this surface genuinely works, which is why
     * this verdict is distinct from `device-blocked`.
     */
    expect(reconcileDeviceDelivery("granted", { permission: "granted", hasSubscription: false }))
      .toBe("device-silent");
  });

  it("reports a browser that has not been asked yet as repairable here too", () => {
    // `default` means the prompt was never answered on this device — a click
    // can still raise it, so the repair is offered rather than refused.
    expect(reconcileDeviceDelivery("granted", { permission: "default", hasSubscription: false }))
      .toBe("device-silent");
  });

  it("separates a blocked browser, which this surface cannot repair", () => {
    /*
     * A denial is sticky and often unrecoverable without the user digging
     * through browser settings (T-07). Offering a button that will silently
     * resolve to "denied" again would be a control that cannot work, which
     * `R-24` refuses. The two must stay distinguishable so the copy can say
     * where the fix actually lives.
     */
    expect(reconcileDeviceDelivery("granted", { permission: "denied", hasSubscription: false }))
      .toBe("device-blocked");
  });

  it("still reports a blocked browser when a stale subscription survives", () => {
    // The combination is real: revoking permission in browser settings does not
    // always drop the subscription object. Permission is the binding fact.
    expect(reconcileDeviceDelivery("granted", { permission: "denied", hasSubscription: true }))
      .toBe("device-blocked");
  });

  it("confirms delivery only when both facts agree", () => {
    expect(reconcileDeviceDelivery("granted", granted)).toBe("receiving");
  });
});

describe("the verdict is total", () => {
  it("returns one of the five verdicts for every combination", () => {
    /*
     * Non-vacuity in the other direction: the function is exercised across its
     * whole input space, so no combination falls through to `undefined` and no
     * verdict below is unreachable. Five consents × four permissions × three
     * subscription readings.
     */
    const verdicts: readonly DeliveryVerdict[] = [
      "not-granted",
      "unknown",
      "receiving",
      "device-silent",
      "device-blocked",
    ];
    const seen = new Set<DeliveryVerdict>();
    let combinations = 0;
    for (const consent of ["granted", "denied", "unsupported", "revoked", "expired"] as const) {
      for (const permission of ["granted", "denied", "default", null] as const) {
        for (const hasSubscription of [true, false, null] as const) {
          const verdict = reconcileDeviceDelivery(consent, { permission, hasSubscription });
          expect(verdicts).toContain(verdict);
          seen.add(verdict);
          combinations += 1;
        }
      }
    }
    expect(combinations).toBe(60);
    // Every verdict is reachable; one that never appears would be a branch
    // nothing can produce and a copy nobody can see.
    expect(seen.size).toBe(verdicts.length);
  });
});
