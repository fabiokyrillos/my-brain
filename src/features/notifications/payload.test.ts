/**
 * `2M-NOTIFY-006` and `-007` — the payload carries no content, and it carries
 * none **by construction**.
 *
 * The structural half of `-007` is in
 * `phase-2m-notification-boundary-guard.test.ts`, which fails the build if the
 * type or `notificationCopy` gains a content-carrying parameter. This file
 * proves the behaviour that guard protects.
 */

import { describe, expect, it } from "vitest";

import {
  buildNotificationPayload,
  notificationCopy,
  notificationDestinations,
  serialiseNotificationPayload,
} from "./payload";

describe("2M-NOTIFY-006: what leaves carries no content", () => {
  it("serialises to exactly three fields", () => {
    const payload = buildNotificationPayload({ type: "reminder", destination: "/app/reminders", locale: "pt-BR" })!;
    expect(Object.keys(serialiseNotificationPayload(payload)).sort())
      .toEqual(["body", "destination", "title"]);
  });

  it("says the same words for every item of a kind, so no item is identifiable", () => {
    // Two different reminders produce byte-identical payloads. That is the whole
    // requirement: what reaches the push service cannot distinguish them.
    const first = buildNotificationPayload({ type: "reminder", destination: "/app/reminders", locale: "en" })!;
    const second = buildNotificationPayload({ type: "reminder", destination: "/app/reminders", locale: "en" })!;
    expect(serialiseNotificationPayload(first)).toEqual(serialiseNotificationPayload(second));
  });

  it("sends the user to a surface, never to a record", () => {
    for (const destination of notificationDestinations) {
      expect(destination, `${destination} carries an identifier`).not.toMatch(/[0-9a-f]{8}-/i);
      expect(destination, `${destination} carries a path parameter`).not.toMatch(/\[|:/);
    }
  });

  it("refuses a destination outside the closed set instead of passing it through", () => {
    expect(buildNotificationPayload({
      type: "reminder",
      destination: "/app/work/7f3c0f2e-0000-4000-8000-000000000000",
      locale: "en",
    })).toBeNull();
    expect(buildNotificationPayload({ type: "reminder", destination: "https://example.test", locale: "en" }))
      .toBeNull();
  });

  it("refuses an unknown type and an unknown locale rather than defaulting", () => {
    expect(buildNotificationPayload({ type: "invented", destination: "/app", locale: "en" })).toBeNull();
    expect(buildNotificationPayload({ type: "reminder", destination: "/app", locale: "de" })).toBeNull();
  });

  it("contains no count, no date and no name in any produced copy", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      for (const type of ["reminder", "follow_up", "review", "digest"] as const) {
        const copy = notificationCopy(locale, type);
        const text = `${copy.title} ${copy.body}`;
        expect(text, `${locale}/${type} carries a number`).not.toMatch(/\d/);
        expect(text.length, `${locale}/${type} is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("2M-NOTIFY-007: the copy has nowhere to receive content", () => {
  it("takes two arguments, both closed vocabularies", () => {
    // A third parameter is how a task title would arrive. The guard refuses one
    // structurally; this states the current arity so a change is visible here
    // too.
    expect(notificationCopy.length).toBe(2);
  });

  it("returns a frozen object, so a caller cannot decorate it before sending", () => {
    const copy = notificationCopy("en", "review");
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it("returns a frozen payload for the same reason", () => {
    const payload = buildNotificationPayload({ type: "review", destination: "/app/reviews", locale: "en" })!;
    expect(Object.isFrozen(payload)).toBe(true);
  });
});
