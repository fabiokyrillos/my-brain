import { describe, expect, it } from "vitest";

import { decodeVapidPublicKey, readSubscriptionFields } from "./push-encoding";
import { notificationPreferencesSchema, pushSubscriptionSchema, reportableConsentStateSchema } from "./schema";

/**
 * The two pure pieces of the browser subscription flow, and the schema that
 * guards the boundary between them and the database.
 *
 * These are together because they are the same claim from two sides: what the
 * browser hands over is untrusted, and every field of it is either validated
 * into a known shape or refused. Neither can be exercised by a component test —
 * one needs a real `PushManager`, the other needs a real form — so both are
 * extracted and proved here.
 */

/** A real 65-byte P-256 point, base64url. RFC 8291 section 5's receiver key. */
const REAL_KEY =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";

describe("2M-NOTIFY-011: the VAPID public key decodes or is honestly refused", () => {
  it("decodes a real key to the 65 bytes subscribe() wants", () => {
    const bytes = decodeVapidPublicKey(REAL_KEY);
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(65);
    // An uncompressed P-256 point always begins `0x04`. Getting this wrong is
    // how base64url decoded as base64 fails: same length, different bytes.
    expect(bytes![0]).toBe(0x04);
  });

  it("handles the base64url alphabet rather than corrupting it", () => {
    // `-` and `_` are where base64url differs from base64, and this key contains
    // both. Feeding it to `atob` unconverted throws or silently yields other
    // bytes, and the symptom would be a push service rejecting the subscription
    // three layers away with an unrelated-looking error.
    expect(REAL_KEY.includes("-") && REAL_KEY.includes("_")).toBe(true);
    const bytes = decodeVapidPublicKey(REAL_KEY)!;
    const roundTrip = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(roundTrip).toBe(REAL_KEY);
  });

  it("returns null for every unusable configuration rather than throwing", () => {
    // Each of these is a real state the settings page must render honestly: the
    // variable unset, set to a placeholder, or set to something truncated. An
    // exception here would take the whole settings page down instead.
    for (const value of [null, undefined, "", "   ", "changeme", "not base64!!", REAL_KEY.slice(0, 40)]) {
      expect(decodeVapidPublicKey(value), String(value)).toBeNull();
    }
  });

  it("refuses a well-formed key of the wrong length", () => {
    // 87 base64url characters that decode to something other than 65 bytes is
    // the case a naive length check on the STRING would let through.
    const wrongLength = btoa(String.fromCharCode(...new Uint8Array(64)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeVapidPublicKey(wrongLength.padEnd(85, "A"))).toBeNull();
  });
});

describe("2M-NOTIFY-011: a half-built subscription is refused, not stored", () => {
  const subscription = (json: Record<string, unknown>) => ({ toJSON: () => json });

  it("narrows a complete subscription to exactly three fields", () => {
    const fields = readSubscriptionFields(
      subscription({
        endpoint: "https://push.example.test/abc",
        keys: { p256dh: "key", auth: "secret" },
        expirationTime: null,
      }),
    );
    expect(fields).toEqual({ endpoint: "https://push.example.test/abc", p256dh: "key", auth: "secret" });
    // `expirationTime` is dropped rather than forwarded: the Server Action's
    // schema would refuse an unknown key, and silently passing one would make
    // the failure a 400 the user cannot act on.
    expect(Object.keys(fields!).sort()).toEqual(["auth", "endpoint", "p256dh"]);
  });

  it("returns null when any field is missing or empty", () => {
    // The browser's own type says these are optional and they genuinely can be
    // absent on a subscription that failed halfway. Storing one would be consent
    // that silently never delivers.
    for (const json of [
      { keys: { p256dh: "key", auth: "secret" } },
      { endpoint: "https://push.example.test/abc", keys: { auth: "secret" } },
      { endpoint: "https://push.example.test/abc", keys: { p256dh: "key" } },
      { endpoint: "", keys: { p256dh: "key", auth: "secret" } },
      { endpoint: "https://push.example.test/abc", keys: {} },
      { endpoint: "https://push.example.test/abc" },
    ]) {
      expect(readSubscriptionFields(subscription(json)), JSON.stringify(json)).toBeNull();
    }
  });
});

describe("2M-NOTIFY-011: the schema refuses what the database would refuse", () => {
  const valid = { endpoint: "https://push.example.test/abc-endpoint", p256dh: "0123456789abcdef", auth: "01234567" };

  it("accepts a real subscription", () => {
    expect(pushSubscriptionSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a non-https endpoint before the database has to", () => {
    // The endpoint is a URL the SERVER will later POST to, so an unvalidated one
    // is a request-forgery primitive with a user id attached. Both layers refuse
    // it, and neither is redundant: this one produces a typed refusal the
    // surface can render in the user's language.
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "http://push.example.test/abc-endpoint" }).success)
      .toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "javascript:alert(1)" }).success).toBe(false);
  });

  it("bounds every field the way the column does", () => {
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "https://a.test" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...valid, p256dh: "short" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...valid, auth: "tiny" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: `https://push.test/${"a".repeat(2100)}` }).success)
      .toBe(false);
  });

  it("refuses `granted` as a client-reported state", () => {
    // Consent is CONCLUDED from a real subscription, never asserted by a caller.
    // A schema that accepted `granted` here would let a page claim consent it
    // never obtained; the database refuses it a second time.
    expect(reportableConsentStateSchema.safeParse("granted").success).toBe(false);
    expect(reportableConsentStateSchema.safeParse("revoked").success).toBe(false);
    for (const state of ["denied", "unsupported", "expired"]) {
      expect(reportableConsentStateSchema.safeParse(state).success, state).toBe(true);
    }
  });

  it("bounds the daily cap to the existing column's own range", () => {
    const preferences = {
      enabledTypes: ["reminder"],
      frequency: "immediate",
      quietStart: "22:30",
      quietEnd: "07:00",
      dailyCap: 3,
    };
    expect(notificationPreferencesSchema.safeParse(preferences).success).toBe(true);
    // `agent_preferences.max_followups_per_day` is checked 0..20, and this path
    // must not offer a value the column would refuse.
    expect(notificationPreferencesSchema.safeParse({ ...preferences, dailyCap: 21 }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ ...preferences, dailyCap: -1 }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ ...preferences, dailyCap: 1.5 }).success).toBe(false);
    // Zero is a MEANINGFUL choice, not an empty one: it means "none today".
    expect(notificationPreferencesSchema.safeParse({ ...preferences, dailyCap: 0 }).success).toBe(true);
  });

  it("accepts an empty type list, because muting everything is a real choice", () => {
    expect(notificationPreferencesSchema.safeParse({
      enabledTypes: [],
      frequency: "off",
      quietStart: "00:00",
      quietEnd: "23:59",
      dailyCap: 0,
    }).success).toBe(true);
  });

  it("refuses an undeclared type and a malformed clock time", () => {
    const preferences = {
      enabledTypes: ["reminder"],
      frequency: "immediate",
      quietStart: "22:30",
      quietEnd: "07:00",
      dailyCap: 3,
    };
    expect(notificationPreferencesSchema.safeParse({ ...preferences, enabledTypes: ["recurrence"] }).success)
      .toBe(false);
    expect(notificationPreferencesSchema.safeParse({ ...preferences, frequency: "hourly" }).success).toBe(false);
    for (const time of ["24:00", "7:00", "22:60", "22h30", ""]) {
      expect(notificationPreferencesSchema.safeParse({ ...preferences, quietStart: time }).success, time).toBe(false);
    }
  });
});
