/**
 * The wire payload, in the runtime that actually sends it.
 *
 * ## Why this is a second copy, and why that is not a licence to differ
 *
 * `src/features/notifications/payload.ts` is the source of truth for this
 * contract and slice 2M.4a signed it: *"2M.4b may not invent a wire format, it
 * consumes this one."* But `src/` cannot be imported from Deno — the same
 * `server-only` boundary that forced `process-jobs/entry.ts` to carry its own
 * copy of the extraction prompt — so the sender needs the contract in a form the
 * Edge Runtime can load.
 *
 * This repository already has the answer to that shape: a second implementation
 * plus a **parity test that fails the build when the two disagree**, exactly as
 * `src/lib/ai/extraction-parity.test.ts` does for extraction.
 * `src/features/notifications/push-payload-parity.test.ts` reads this file and
 * asserts every string, every destination and every type against the app's own,
 * so a copy that drifts is a red build rather than a lock screen in the wrong
 * language.
 *
 * ## The content prohibition survives the copy
 *
 * `2M-NOTIFY-007` requires the prohibition to be structural, and it still is
 * here: `buildWirePayload` takes a type, a destination and a locale, all
 * validated against closed sets, and there is no parameter a task title could
 * arrive through. The sender holds a `dedupe_hash` and a user id and nothing
 * else that could be interpolated — it never reads a task, a reminder or an
 * entry, so there is no content in its process to leak.
 */

export const notificationTypes = ["reminder", "follow_up", "review", "digest"] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const notificationDestinations = [
  "/app",
  "/app/notifications",
  "/app/reminders",
  "/app/reviews",
] as const;
export type NotificationDestination = (typeof notificationDestinations)[number];

export const notificationLocales = ["pt-BR", "en"] as const;
export type NotificationLocale = (typeof notificationLocales)[number];

/**
 * One sentence per locale per type, saying that something is waiting and
 * nothing about what. Byte-identical to `payload.ts`'s `COPY`, and the parity
 * test is what keeps it so.
 */
const COPY: Record<NotificationLocale, Record<NotificationType, { title: string; body: string }>> = {
  "pt-BR": {
    reminder: { title: "Você tem um lembrete", body: "Abra o app para ver qual." },
    follow_up: { title: "Há algo para acompanhar", body: "Abra o app para ver o quê." },
    review: { title: "Sua revisão está pronta", body: "Abra o app para lê-la." },
    digest: { title: "Você tem um resumo", body: "Abra o app para vê-lo." },
  },
  en: {
    reminder: { title: "You have a reminder", body: "Open the app to see which." },
    follow_up: { title: "There is something to follow up", body: "Open the app to see what." },
    review: { title: "Your review is ready", body: "Open the app to read it." },
    digest: { title: "You have a summary", body: "Open the app to see it." },
  },
};

/**
 * The default destination per type.
 *
 * A caller may not choose freely: the destination is a function of the KIND,
 * so there is no request field through which a sender could be steered to an
 * arbitrary surface. `/app/notifications` is the fallback because it is the
 * surface that lists everything.
 */
const DESTINATION_FOR_TYPE: Record<NotificationType, NotificationDestination> = {
  reminder: "/app/reminders",
  follow_up: "/app/notifications",
  review: "/app/reviews",
  digest: "/app",
};

export type WirePayload = Readonly<{
  title: string;
  body: string;
  destination: NotificationDestination;
  type: NotificationType;
}>;

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (notificationTypes as readonly string[]).includes(value);
}

export function isNotificationLocale(value: unknown): value is NotificationLocale {
  return typeof value === "string" && (notificationLocales as readonly string[]).includes(value);
}

/**
 * The only way this runtime builds a payload.
 *
 * Returns `null` rather than falling back to a default for an unknown type or
 * locale: a default here would mean a caller that got the type wrong still
 * sends something, and the something it sends is a notification of a kind the
 * user did not consent to.
 */
export function buildWirePayload(type: unknown, locale: unknown): WirePayload | null {
  if (!isNotificationType(type) || !isNotificationLocale(locale)) return null;
  const copy = COPY[locale][type];
  return Object.freeze({
    title: copy.title,
    body: copy.body,
    destination: DESTINATION_FOR_TYPE[type],
    type,
  });
}
