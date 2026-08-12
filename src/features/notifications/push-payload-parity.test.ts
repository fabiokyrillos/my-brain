import { describe, expect, it } from "vitest";

import {
  notificationCopy,
  notificationDestinations,
  serialiseNotificationPayload,
  type NotificationLocale,
} from "./payload";
import { notificationTypes, type NotificationType } from "./consent-contract";
import {
  buildWirePayload,
  isNotificationLocale,
  isNotificationType,
  notificationDestinations as workerDestinations,
  notificationLocales as workerLocales,
  notificationTypes as workerTypes,
} from "../../../supabase/functions/_shared/notification-payload";

/**
 * `2M-NOTIFY-006`/`-007` — the wire payload exists twice, and this is what stops
 * the two copies drifting.
 *
 * ## Why there are two
 *
 * `payload.ts` is the source of truth and slice 2M.4a signed it: *"2M.4b may not
 * invent a wire format, it consumes this one."* But the sender runs in Deno on
 * the Edge Runtime, which cannot import `src/` — the `server-only` guard throws
 * outside a bundler — so the contract has a second, runtime-neutral
 * implementation under `supabase/functions/_shared/`. This is the identical
 * situation `src/lib/ai/extraction-parity.test.ts` exists for, and it is
 * enforced the identical way.
 *
 * ## What drift would actually cost
 *
 * A locale that fell out of sync is a Portuguese user receiving an English lock
 * screen. A destination that fell out of sync is a tap that opens a route which
 * no longer exists. A **type** that fell out of sync is worse than either: the
 * sender would refuse a kind the consent record still offers, so the user would
 * mute nothing, consent to everything, and silently receive less than they
 * asked for — with no error anywhere.
 *
 * This is behavioural rather than textual: both implementations are called and
 * their outputs compared, so a copy that was reformatted still passes and a copy
 * whose words changed does not.
 */

describe("2M-NOTIFY-006: the sender's payload copy matches the application's", () => {
  it("agrees on every type, in both directions", () => {
    expect([...workerTypes]).toEqual([...notificationTypes]);
    for (const type of notificationTypes) expect(isNotificationType(type), type).toBe(true);
    // Non-vacuity: the predicate really discriminates, so the loop above is not
    // passing against a function that returns true for anything.
    expect(isNotificationType("recurrence")).toBe(false);
  });

  it("agrees on every locale", () => {
    expect([...workerLocales]).toEqual(["pt-BR", "en"]);
    for (const locale of workerLocales) expect(isNotificationLocale(locale), locale).toBe(true);
    expect(isNotificationLocale("fr")).toBe(false);
  });

  it("agrees on the closed set of destinations", () => {
    expect([...workerDestinations].sort()).toEqual([...notificationDestinations].sort());
  });

  it("produces the SAME title and body for every locale and every type", () => {
    const locales: readonly NotificationLocale[] = ["pt-BR", "en"];
    let compared = 0;
    for (const locale of locales) {
      for (const type of notificationTypes as readonly NotificationType[]) {
        const application = notificationCopy(locale, type);
        const worker = buildWirePayload(type, locale);
        expect(worker, `${locale}/${type}`).not.toBeNull();
        expect(worker!.title, `${locale}/${type} title`).toBe(application.title);
        expect(worker!.body, `${locale}/${type} body`).toBe(application.body);
        compared += 1;
      }
    }
    // The comparison really ran over the whole matrix rather than over an empty
    // one, which is how this assertion would pass while proving nothing.
    expect(compared).toBe(8);
  });

  it("sends a destination the application also recognises, for every type", () => {
    for (const type of notificationTypes as readonly NotificationType[]) {
      const worker = buildWirePayload(type, "en");
      expect(
        (notificationDestinations as readonly string[]).includes(worker!.destination),
        `${type} destination`,
      ).toBe(true);
    }
  });

  it("carries exactly the fields the application's wire shape declares, and no more", () => {
    // `serialiseNotificationPayload` is the shape 2M.4a signed. The worker adds
    // `type` — which the service worker uses as the notification TAG, and which
    // is a closed vocabulary rather than content — and nothing else. A fifth key
    // appearing here would be a field with somewhere to put a title.
    const application = serialiseNotificationPayload({
      type: "reminder",
      destination: "/app/reminders",
      locale: "pt-BR",
    });
    const worker = buildWirePayload("reminder", "pt-BR");
    expect(Object.keys(worker!).sort()).toEqual(["body", "destination", "title", "type"]);
    expect(Object.keys(application).sort()).toEqual(["body", "destination", "title"]);
  });

  it("refuses an unknown type or locale rather than falling back to a default", () => {
    // A default here would mean a caller that got the type wrong still sends
    // something, and the something it sends is a notification of a kind the user
    // did not consent to.
    expect(buildWirePayload("recurrence", "en")).toBeNull();
    expect(buildWirePayload("reminder", "fr")).toBeNull();
    expect(buildWirePayload(null, "en")).toBeNull();
  });

  it("has no parameter through which a record's text could arrive", () => {
    // The structural half of `2M-NOTIFY-007`, asserted about the worker copy the
    // same way the boundary guard asserts it about the application's.
    expect(buildWirePayload.length).toBe(2);
  });
});
