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
 * Reminder content is an explicit later owner decision. Only a title resolved
 * inside the trusted sender may enter this builder; the external request
 * carries a reminder id and cannot supply text. Other kinds retain fixed copy.
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
 * Fixed copy for non-reminder kinds and the fixed heading for reminders.
 * Byte-identical to `payload.ts`'s `COPY`, enforced by the parity test.
 */
const COPY: Record<NotificationLocale, Record<NotificationType, { title: string; body: string }>> = {
  "pt-BR": {
    reminder: { title: "Lembrete", body: "" },
    follow_up: { title: "Há algo para acompanhar", body: "Abra o app para ver o quê." },
    review: { title: "Sua revisão está pronta", body: "Abra o app para lê-la." },
    digest: { title: "Você tem um resumo", body: "Abra o app para vê-lo." },
  },
  en: {
    reminder: { title: "Reminder", body: "" },
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
  destination: `/${NotificationLocale}${NotificationDestination}`;
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
function boundedReminderTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  if (title.length === 0) return null;
  return title.length <= 240 ? title : `${title.slice(0, 239)}…`;
}

export function buildWirePayload(type: unknown, locale: unknown, reminderTitle?: unknown): WirePayload | null {
  if (!isNotificationType(type) || !isNotificationLocale(locale)) return null;
  const copy = COPY[locale][type];
  const body = type === "reminder" ? boundedReminderTitle(reminderTitle) : copy.body;
  if (body === null) return null;
  return Object.freeze({
    title: copy.title,
    body,
    destination: `/${locale}${DESTINATION_FOR_TYPE[type]}`,
    type,
  });
}
