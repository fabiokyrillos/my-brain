/**
 * Reminder alerts carry the owner-visible reminder title and no caller-supplied
 * description or related-record content. Other alert types remain generic.
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

describe("the reminder push says which reminder fired", () => {
  it("serialises to exactly three fields", () => {
    const payload = buildNotificationPayload({ type: "reminder", destination: "/app/reminders", locale: "pt-BR" })!;
    expect(Object.keys(serialiseNotificationPayload(payload, "Consulta amanhã")!).sort())
      .toEqual(["body", "destination", "title"]);
  });

  it("renders the reminder title instead of hiding it behind generic copy", () => {
    const first = buildNotificationPayload({ type: "reminder", destination: "/app/reminders", locale: "en" })!;
    expect(serialiseNotificationPayload(first, "Take the medication")).toEqual({
      title: "Reminder",
      body: "Take the medication",
      destination: "/app/reminders",
    });
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

  it("refuses a reminder without a usable title", () => {
    const payload = buildNotificationPayload({ type: "reminder", destination: "/app/reminders", locale: "pt-BR" })!;
    expect(serialiseNotificationPayload(payload, "   ")).toBeNull();
  });
});

describe("the content-bearing reminder contract stays bounded", () => {
  it("trims and bounds the reminder title before it reaches the OS", () => {
    const copy = notificationCopy("pt-BR", "reminder", `  ${"a".repeat(300)}  `)!;
    expect(copy.title).toBe("Lembrete");
    expect(copy.body.length).toBe(240);
    expect(copy.body.endsWith("…")).toBe(true);
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
