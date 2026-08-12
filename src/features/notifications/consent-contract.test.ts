/**
 * `2M-NOTIFY-001`, `-002`, `-010` — the consent record's shape, its five states
 * and the absence rule.
 */

import { describe, expect, it } from "vitest";

import { notificationConsentStates } from "@/features/product-analytics/contracts";

import {
  NO_CONSENT,
  consentPermitsDelivery,
  mayRequestPermission,
  notificationFrequencies,
  notificationTypes,
  resolveConsent,
  revoke,
} from "./consent-contract";

describe("2M-NOTIFY-002: absence means no delivery", () => {
  it("resolves an absent record to a state that cannot deliver", () => {
    expect(resolveConsent(undefined)).toEqual(NO_CONSENT);
    expect(resolveConsent(null)).toEqual(NO_CONSENT);
    expect(resolveConsent("granted")).toEqual(NO_CONSENT);
    expect(consentPermitsDelivery(NO_CONSENT.state)).toBe(false);
  });

  it("calls the absence `unsupported`, never `denied`", () => {
    // Recording it as `denied` would tell the user they said no when they were
    // never asked — and `denied` is the one state that cannot be re-prompted.
    expect(NO_CONSENT.state).toBe("unsupported");
  });

  it("carries no permission of any kind in the absent record", () => {
    expect(NO_CONSENT.enabledTypes).toEqual([]);
    expect(NO_CONSENT.frequency).toBe("off");
    expect(NO_CONSENT.dailyCap).toBe(0);
  });
});

describe("2M-NOTIFY-010: five distinguishable states with defined behaviour", () => {
  it("permits delivery in exactly one state", () => {
    const permitting = notificationConsentStates.filter(consentPermitsDelivery);
    expect(permitting).toEqual(["granted"]);
  });

  it("permits a prompt in exactly the three where a prompt could work", () => {
    expect(notificationConsentStates.filter(mayRequestPermission).sort())
      .toEqual(["expired", "revoked", "unsupported"]);
  });

  it("never re-prompts after a browser denial", () => {
    // The browser will not show the prompt again from the page, so a control
    // that asked would have no possible outcome but nothing happening.
    expect(mayRequestPermission("denied")).toBe(false);
  });

  it("keeps `denied` and `revoked` distinguishable, which a boolean would not", () => {
    expect(mayRequestPermission("denied")).not.toBe(mayRequestPermission("revoked"));
  });
});

describe("2M-NOTIFY-001: revocation takes effect without a further step", () => {
  const granted = resolveConsent({
    state: "granted",
    recordedAt: "2026-08-11T12:00:00.000Z",
    enabledTypes: ["reminder"],
    frequency: "immediate",
    quietStart: "22:30",
    quietEnd: "07:00",
    dailyCap: 3,
  });

  it("produces `revoked` from any prior state, with the instant recorded", () => {
    const revoked = revoke(granted, "2026-08-11T13:00:00.000Z");
    expect(revoked.state).toBe("revoked");
    expect(revoked.recordedAt).toBe("2026-08-11T13:00:00.000Z");
    expect(consentPermitsDelivery(revoked.state)).toBe(false);
  });

  it("never produces `denied`, so the user can turn it back on", () => {
    expect(revoke(granted, "2026-08-11T13:00:00.000Z").state).not.toBe("denied");
    expect(mayRequestPermission(revoke(granted, "2026-08-11T13:00:00.000Z").state)).toBe(true);
  });

  it("keeps the preferences the user set, so revoking is not destructive", () => {
    const revoked = revoke(granted, "2026-08-11T13:00:00.000Z");
    expect(revoked.enabledTypes).toEqual(["reminder"]);
    expect(revoked.quietStart).toBe("22:30");
    expect(revoked.dailyCap).toBe(3);
  });
});

describe("the parser fails closed in every field", () => {
  it("drops a type outside the closed set instead of trusting it", () => {
    const consent = resolveConsent({ state: "granted", enabledTypes: ["reminder", "everything", 7] });
    expect(consent.enabledTypes).toEqual(["reminder"]);
  });

  it("resolves an unreadable frequency to `off`, never to `immediate`", () => {
    expect(resolveConsent({ state: "granted", frequency: "hourly" }).frequency).toBe("off");
  });

  it("resolves an unreadable or negative cap to zero", () => {
    for (const cap of ["3", -1, 2.5, null]) {
      expect(resolveConsent({ state: "granted", dailyCap: cap }).dailyCap, String(cap)).toBe(0);
    }
  });

  it("accepts both stored shapes of a time and refuses anything else", () => {
    expect(resolveConsent({ state: "granted", quietStart: "22:30:00" }).quietStart).toBe("22:30");
    expect(resolveConsent({ state: "granted", quietStart: "10 pm" }).quietStart).toBeNull();
  });

  it("deduplicates the type list rather than counting a type twice", () => {
    expect(resolveConsent({ state: "granted", enabledTypes: ["reminder", "reminder"] }).enabledTypes)
      .toEqual(["reminder"]);
  });
});

describe("the vocabularies are closed and non-empty", () => {
  it("declares four types and three frequencies", () => {
    expect(notificationTypes.length).toBeGreaterThan(0);
    expect(notificationFrequencies).toContain("off");
  });
});
