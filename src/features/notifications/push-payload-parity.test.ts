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

  it("produces the SAME reminder content in both runtimes", () => {
    const locales: readonly NotificationLocale[] = ["pt-BR", "en"];
    let compared = 0;
    for (const locale of locales) {
      for (const type of notificationTypes as readonly NotificationType[]) {
        const reminderTitle = type === "reminder" ? "Consulta amanhã às 9" : undefined;
        const application = notificationCopy(locale, type, reminderTitle);
        const worker = buildWirePayload(type, locale, reminderTitle);
        expect(worker, `${locale}/${type}`).not.toBeNull();
        expect(application, `${locale}/${type} application`).not.toBeNull();
        if (worker === null || application === null) throw new Error(`missing payload for ${locale}/${type}`);
        expect(worker.title, `${locale}/${type} title`).toBe(application.title);
        expect(worker.body, `${locale}/${type} body`).toBe(application.body);
        compared += 1;
      }
    }
    // The comparison really ran over the whole matrix rather than over an empty
    // one, which is how this assertion would pass while proving nothing.
    expect(compared).toBe(8);
  });

  it("sends a destination the application also recognises, for every type", () => {
    for (const type of notificationTypes as readonly NotificationType[]) {
      const worker = buildWirePayload(type, "en", type === "reminder" ? "Call Ana" : undefined);
      if (worker === null) throw new Error(`missing payload for ${type}`);
      expect(
        (notificationDestinations as readonly string[]).some(
          (destination) => worker.destination === `/en${destination}`,
        ),
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
    }, "Comprar remédio");
    const worker = buildWirePayload("reminder", "pt-BR", "Comprar remédio");
    if (worker === null || application === null) throw new Error("missing reminder payload");
    expect(Object.keys(worker).sort()).toEqual(["body", "destination", "title", "type"]);
    expect(Object.keys(application).sort()).toEqual(["body", "destination", "title"]);
  });

  it("refuses an unknown type or locale rather than falling back to a default", () => {
    // A default here would mean a caller that got the type wrong still sends
    // something, and the something it sends is a notification of a kind the user
    // did not consent to.
    expect(buildWirePayload("recurrence", "en")).toBeNull();
    expect(buildWirePayload("reminder", "fr", "Comprar remédio")).toBeNull();
    expect(buildWirePayload(null, "en")).toBeNull();
    expect(buildWirePayload("reminder", "pt-BR", "   ")).toBeNull();
  });

  it("requires the resolved reminder title explicitly", () => {
    expect(buildWirePayload("reminder", "pt-BR")).toBeNull();
  });
});

/**
 * `NOTIFY-TAP-LANDS-ON-THE-LIST` — the target exists twice too.
 *
 * It is a third thing that can drift, and drifting costs the same as the
 * others did: a tap that opens the wrong record, or opens nothing while the
 * other copy says it should. Asserted by running BOTH implementations over the
 * same inputs and requiring the same answer, which is what the rest of this
 * file already does for copy, destinations, types and locales.
 */
describe("the item a reminder notification is about, in both implementations", () => {
  const REMINDER = "3f1a9c22-5d41-4c0e-9b77-2a6d8e0f41bc";
  const TASK = "7c2e4411-88aa-4f3b-9d10-5be6cf0a2d93";

  function both(subject: unknown) {
    const worker = buildWirePayload("reminder", "pt-BR", "Comprar remédio", subject);
    const app = serialiseNotificationPayload(
      { type: "reminder", destination: "/app/reminders", locale: "pt-BR" },
      "Comprar remédio",
      subject,
    );
    return { worker: worker?.target, app: app?.target };
  }

  it("prefers the task, because a reminder on a task is about the task's work", () => {
    const { worker, app } = both({ reminderId: REMINDER, taskId: TASK });
    expect(worker).toEqual({ kind: "task", id: TASK });
    expect(app).toEqual(worker);
  });

  it("falls back to the reminder, which now has a page of its own", () => {
    const { worker, app } = both({ reminderId: REMINDER, taskId: null });
    expect(worker).toEqual({ kind: "reminder", id: REMINDER });
    expect(app).toEqual(worker);
  });

  it("carries no target at all when neither id is usable", () => {
    // Not a failure: the payload simply says nothing, and every worker — old
    // or new — falls back to `destination`.
    const { worker, app } = both({ reminderId: "not-an-id", taskId: "../../admin" });
    expect(worker).toBeUndefined();
    expect(app).toBeUndefined();
  });

  it("carries no target for a kind that is not a reminder", () => {
    expect(buildWirePayload("review", "en", undefined, { taskId: TASK })?.target).toBeUndefined();
    expect(
      serialiseNotificationPayload(
        { type: "review", destination: "/app/reviews", locale: "en" },
        undefined,
        { taskId: TASK },
      )?.target,
    ).toBeUndefined();
  });

  it("leaves `destination` exactly as it was, so an older worker is unaffected", () => {
    // The field a cached service worker reads must not change shape when a
    // newer field appears beside it.
    expect(buildWirePayload("reminder", "pt-BR", "Comprar remédio", { taskId: TASK })?.destination)
      .toBe("/pt-BR/app/reminders");
  });
});
