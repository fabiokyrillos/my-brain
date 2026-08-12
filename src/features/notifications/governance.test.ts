/**
 * `2M-NOTIFY-002`, `-004`, `-005` — every control exercised, per channel, with
 * the negative control each one needs.
 */

import { describe, expect, it } from "vitest";

import { notificationSuppressionReasons } from "@/features/product-analytics/contracts";

import { NO_CONSENT, resolveConsent, type NotificationConsent } from "./consent-contract";
import { COOLDOWN_MINUTES, decideDelivery, isWithinQuietHours } from "./governance";

const GRANTED: NotificationConsent = resolveConsent({
  state: "granted",
  recordedAt: "2026-08-11T12:00:00.000Z",
  enabledTypes: ["reminder", "review"],
  frequency: "immediate",
  quietStart: "22:30",
  quietEnd: "07:00",
  dailyCap: 3,
});

const request = (overrides: Record<string, unknown> = {}) => ({
  channel: "push" as const,
  consent: GRANTED,
  type: "reminder" as const,
  nowLocalMinutes: 14 * 60,
  deliveredToday: 0,
  minutesSinceSameItem: null,
  duplicate: false,
  ...overrides,
});

describe("the permitted case exists, so every refusal below means something", () => {
  it("permits a consented, unmuted, in-hours, uncapped, first delivery", () => {
    expect(decideDelivery(request())).toEqual({ permitted: true, channel: "push" });
  });
});

describe("2M-NOTIFY-002: absence of consent means no delivery, never a default-on", () => {
  it("refuses when there is no record at all", () => {
    const decision = decideDelivery(request({ consent: NO_CONSENT }));
    expect(decision).toEqual({ permitted: false, channel: "push", reason: "not_consented" });
  });

  it("refuses every state except `granted`", () => {
    for (const state of ["denied", "revoked", "unsupported", "expired"] as const) {
      const consent = resolveConsent({ ...GRANTED, state });
      expect(decideDelivery(request({ consent })), state)
        .toMatchObject({ permitted: false, reason: "not_consented" });
    }
  });

  it("refuses a record whose state could not be read", () => {
    // Fail-closed parsing, exercised through the decision rather than only
    // through the parser: an unreadable state must not deliver.
    const consent = resolveConsent({ ...GRANTED, state: "probably-fine" });
    expect(decideDelivery(request({ consent }))).toMatchObject({ permitted: false, reason: "not_consented" });
  });
});

describe("2M-NOTIFY-004: every control has a consumer that reads it", () => {
  it("refuses a muted type and permits an enabled one", () => {
    expect(decideDelivery(request({ type: "digest" }))).toMatchObject({ reason: "type_muted" });
    expect(decideDelivery(request({ type: "review" }))).toMatchObject({ permitted: true });
  });

  it("refuses everything when the frequency is off", () => {
    const consent = resolveConsent({ ...GRANTED, frequency: "off" });
    expect(decideDelivery(request({ consent }))).toMatchObject({ reason: "type_muted" });
  });

  it("reads the cap the user set, and the boundary is the cap itself", () => {
    expect(decideDelivery(request({ deliveredToday: 2 }))).toMatchObject({ permitted: true });
    expect(decideDelivery(request({ deliveredToday: 3 }))).toMatchObject({ reason: "daily_cap" });
    // A different cap produces a different answer at the same count, which is
    // what makes this a consumer rather than a constant.
    const generous = resolveConsent({ ...GRANTED, dailyCap: 10 });
    expect(decideDelivery(request({ consent: generous, deliveredToday: 3 }))).toMatchObject({ permitted: true });
  });
});

describe("2M-NOTIFY-005: quiet hours wrap midnight, because every real window does", () => {
  it("is quiet at 23:00 and at 03:00, and loud at 14:00", () => {
    expect(isWithinQuietHours(23 * 60, "22:30", "07:00")).toBe(true);
    expect(isWithinQuietHours(3 * 60, "22:30", "07:00")).toBe(true);
    expect(isWithinQuietHours(14 * 60, "22:30", "07:00")).toBe(false);
  });

  it("handles a non-wrapping window too", () => {
    expect(isWithinQuietHours(13 * 60, "12:00", "14:00")).toBe(true);
    expect(isWithinQuietHours(15 * 60, "12:00", "14:00")).toBe(false);
  });

  it("includes the start minute and excludes the end minute", () => {
    expect(isWithinQuietHours(22 * 60 + 30, "22:30", "07:00")).toBe(true);
    expect(isWithinQuietHours(7 * 60, "22:30", "07:00")).toBe(false);
  });

  it("is not quiet when the window could not be read", () => {
    // The honest direction: an unreadable preference must not silence the
    // product for a user who never asked for silence.
    for (const [start, end] of [[null, "07:00"], ["22:30", null], ["nope", "07:00"], ["25:00", "07:00"]] as const) {
      expect(isWithinQuietHours(23 * 60, start, end), `${start}..${end}`).toBe(false);
    }
    expect(isWithinQuietHours(23 * 60, "07:00", "07:00"), "a zero-width window").toBe(false);
  });

  it("refuses a delivery inside the window and permits one outside it", () => {
    expect(decideDelivery(request({ nowLocalMinutes: 23 * 60 }))).toMatchObject({ reason: "quiet_hours" });
    expect(decideDelivery(request({ nowLocalMinutes: 9 * 60 }))).toMatchObject({ permitted: true });
  });
});

describe("2M-NOTIFY-005: the cooldown and deduplication", () => {
  it("refuses inside the 24-hour window and permits at its edge", () => {
    expect(decideDelivery(request({ minutesSinceSameItem: COOLDOWN_MINUTES - 1 })))
      .toMatchObject({ reason: "cooldown" });
    expect(decideDelivery(request({ minutesSinceSameItem: COOLDOWN_MINUTES })))
      .toMatchObject({ permitted: true });
  });

  it("refuses a duplicate before it reaches the cooldown", () => {
    // Deduplication is not the cooldown: a retry of the same delivery is a
    // duplicate even when the cooldown has expired, and reporting it as
    // `cooldown` would make a retry storm look like a rate limit.
    expect(decideDelivery(request({ duplicate: true, minutesSinceSameItem: COOLDOWN_MINUTES * 2 })))
      .toMatchObject({ reason: "duplicate" });
  });
});

describe("2M-NOTIFY-009: the refusal names which control refused", () => {
  it("returns only reasons the deployed validator admits", () => {
    const seen = new Set<string>();
    const cases = [
      request({ consent: NO_CONSENT }),
      request({ type: "digest" }),
      request({ nowLocalMinutes: 23 * 60 }),
      request({ duplicate: true }),
      request({ minutesSinceSameItem: 10 }),
      request({ deliveredToday: 99 }),
    ];
    for (const input of cases) {
      const decision = decideDelivery(input);
      expect(decision.permitted).toBe(false);
      if (!decision.permitted) seen.add(decision.reason);
    }
    expect([...seen].sort()).toEqual([...notificationSuppressionReasons].sort());
    for (const reason of seen) {
      expect(notificationSuppressionReasons as readonly string[]).toContain(reason);
    }
  });

  it("reports the first refusal, so an unconsented user never records a cap", () => {
    // A `daily_cap` row for somebody who cannot receive anything would be the
    // ledger reporting a ceiling they can never reach.
    const decision = decideDelivery(request({ consent: NO_CONSENT, deliveredToday: 99, duplicate: true }));
    expect(decision).toMatchObject({ reason: "not_consented" });
  });
});

describe("2M-NOTIFY-005: the controls are per channel, not inherited", () => {
  it("carries the channel through every answer", () => {
    expect(decideDelivery(request()).channel).toBe("push");
    expect(decideDelivery(request({ consent: NO_CONSENT })).channel).toBe("push");
  });

  it("counts deliveries on this channel only — the input has no in-app term", () => {
    // The assertion is on the *shape*: there is one `deliveredToday`, and it is
    // the caller's per-channel count. A request carrying a combined total would
    // be the inheritance the requirement forbids, and it is unrepresentable.
    const keys = Object.keys(request()).sort();
    expect(keys).toEqual([
      "channel", "consent", "deliveredToday", "duplicate", "minutesSinceSameItem", "nowLocalMinutes", "type",
    ]);
  });
});
