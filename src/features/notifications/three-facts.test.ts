/**
 * `2O-NOTIFY-004`, `-006`, `-007`.
 *
 * The assertions that matter are the ones about what the model **cannot**
 * express, so each is paired with a positive control — an absence claim over
 * an empty domain is the failure mode this whole family exists to prevent.
 */

import { describe, expect, it } from "vitest";

import { notificationConsentStates } from "./consent-contract";
import {
  consentFacts,
  deliveryFacts,
  deriveThreeFacts,
  mayInviteAtMomentOfValue,
  permissionFacts,
} from "./three-facts";

describe("2O-NOTIFY-007: the guard has a domain to be exhaustive over", () => {
  it("reads the real consent-state set", () => {
    expect(notificationConsentStates.length).toBe(5);
    expect([...notificationConsentStates].sort()).toEqual([
      "denied",
      "expired",
      "granted",
      "revoked",
      "unsupported",
    ]);
  });
});

describe("2O-NOTIFY-006: no value in the model means delivered", () => {
  it("keeps delivery a one-member union", () => {
    expect([...deliveryFacts]).toEqual(["unproven"]);
  });

  it("resolves every consent state to an unproven delivery", () => {
    for (const state of notificationConsentStates) {
      expect(
        deriveThreeFacts(state).delivery,
        `${state} claims something about delivery`,
      ).toBe("unproven");
    }
  });

  it("cannot say delivered even when consent and permission are both satisfied", () => {
    // The one state where a surface would be most tempted to conclude it.
    const facts = deriveThreeFacts("granted");
    expect(facts.consent).toBe("given");
    expect(facts.permission).toBe("granted");
    expect(facts.delivery).toBe("unproven");
    // Push fails with HTTP 403 on a real iPhone and has never run on Android.
    // `granted` is the state in which that is true and least visible.
  });
});

describe("2O-NOTIFY-007: the three facts do not share a vocabulary", () => {
  it("gives each fact its own values, so none can stand in for another", () => {
    /*
     * The collapse this prevents is a single boolean or a shared enum: with one
     * vocabulary a surface can render one indicator and call it "notifications:
     * on". Overlapping members would let that happen by accident.
     */
    const consent = new Set<string>(consentFacts);
    const permission = new Set<string>(permissionFacts);
    const delivery = new Set<string>(deliveryFacts);

    const shared = [...consent].filter((value) => permission.has(value));
    expect(shared, `consent and permission share: ${shared.join(", ")}`).toEqual([]);
    expect([...delivery].filter((value) => consent.has(value) || permission.has(value))).toEqual([]);

    // Non-vacuity: the three sets are non-empty, so "they do not overlap" is
    // not true merely because there is nothing in them.
    expect(consent.size).toBeGreaterThan(1);
    expect(permission.size).toBeGreaterThan(1);
    expect(delivery.size).toBe(1);
  });

  it("never resolves the three to one answer", () => {
    // Every state produces at least two distinct answers across the facts,
    // which is what "not one indicator" means operationally.
    for (const state of notificationConsentStates) {
      const facts = deriveThreeFacts(state);
      const values = new Set([facts.consent, facts.permission, facts.delivery]);
      expect(values.size, `${state} collapses to a single value`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("2O-NOTIFY-004: denied is its own state, distinct from both neighbours", () => {
  it("separates denied from not-yet-asked and from consented-but-undelivered", () => {
    const denied = deriveThreeFacts("denied");
    const consentedUndelivered = deriveThreeFacts("granted");
    const unsupported = deriveThreeFacts("unsupported");

    expect(denied.permission).toBe("denied");
    // Not the same as never having asked: `unsupported` also never asked, and
    // the two need different recovery text — one is fixable on this device.
    expect(denied).not.toEqual(unsupported);
    expect(unsupported.permission).toBe("unavailable");
    // Not the same as consented and waiting.
    expect(denied).not.toEqual(consentedUndelivered);
    expect(consentedUndelivered.permission).toBe("granted");
  });

  it("never reports a browser permission the server cannot know", () => {
    // `revoked` and `expired` are records about the ACCOUNT. Reporting a
    // permission from them would be an invention about a device.
    expect(deriveThreeFacts("revoked").permission).toBe("unknown");
    expect(deriveThreeFacts("expired").permission).toBe("unknown");
    // …and the control: the two states that DO know, say so.
    expect(deriveThreeFacts("granted").permission).toBe("granted");
    expect(deriveThreeFacts("denied").permission).toBe("denied");
  });

  it("keeps the account's own answer separate from the browser's", () => {
    const revoked = deriveThreeFacts("revoked");
    expect(revoked.consent).toBe("withdrawn");
    expect(revoked.permission).toBe("unknown");
    const expired = deriveThreeFacts("expired");
    expect(expired.consent).toBe("lapsed");
    // Withdrawn and lapsed are different facts about the account, and
    // collapsing them re-prompts a reader who deliberately turned it off.
    expect(revoked.consent).not.toBe(expired.consent);
  });
});

describe("2O-NOTIFY-002: an invitation is refused where it could only fail", () => {
  it("never invites a browser that has refused, or one that cannot", () => {
    expect(mayInviteAtMomentOfValue(deriveThreeFacts("denied"))).toBe(false);
    expect(mayInviteAtMomentOfValue(deriveThreeFacts("unsupported"))).toBe(false);
  });

  it("never invites an account that already consented", () => {
    expect(mayInviteAtMomentOfValue(deriveThreeFacts("granted"))).toBe(false);
  });

  it("does invite the two states where asking can still work", () => {
    // The positive control. Without it "we never invite" passes trivially,
    // which is also what a broken predicate looks like.
    expect(mayInviteAtMomentOfValue(deriveThreeFacts("revoked"))).toBe(true);
    expect(mayInviteAtMomentOfValue(deriveThreeFacts("expired"))).toBe(true);
  });
});
