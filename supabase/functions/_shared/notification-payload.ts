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

/**
 * What the notification is ABOUT — `NOTIFY-TAP-LANDS-ON-THE-LIST`.
 *
 * The payload still may not choose a destination; that is the property
 * `DESTINATION_FOR_TYPE` above exists to hold, and it is unchanged. What the
 * payload may now do is name the ITEM, and the service worker — which owns the
 * destination vocabulary — builds the path from a kind it already knows how to
 * open. A caller cannot steer a tap to an arbitrary surface by naming an id
 * any more than it could by naming a type.
 *
 * `destination` is kept beside it, exactly as before, and that is deliberate:
 * a service worker cached on a device updates when the device chooses to, so
 * an older one ignores `target`, reads `destination` and behaves as it does
 * today. The new field can only add precision, never break a tap.
 */
export const notificationTargetKinds = ["task", "reminder"] as const;
export type NotificationTargetKind = (typeof notificationTargetKinds)[number];

export type NotificationTarget = Readonly<{
  kind: NotificationTargetKind;
  /** An owner-scoped record id. Opaque here; the surface it opens enforces access. */
  id: string;
}>;

export type WirePayload = Readonly<{
  title: string;
  body: string;
  destination: `/${NotificationLocale}${NotificationDestination}`;
  type: NotificationType;
  /** Present for reminders only; absent for every other kind. */
  target?: NotificationTarget;
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

/**
 * Which record a reminder notification is about.
 *
 * The task wins when there is one, because a reminder attached to a task is
 * about the task's work and that surface says more than the reminder row
 * does. With no task the reminder itself is the subject, and it now has a page
 * of its own to be the subject on.
 *
 * Both ids are shape-checked rather than trusted: they arrive from a database
 * read, but what they become is a path segment on a device, and a value that
 * becomes a path is validated at every boundary it crosses.
 */
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reminderTarget(subject: unknown): NotificationTarget | undefined {
  if (subject === null || typeof subject !== "object") return undefined;
  const { reminderId, taskId } = subject as Record<string, unknown>;
  if (typeof taskId === "string" && RECORD_ID.test(taskId)) {
    return Object.freeze({ kind: "task" as const, id: taskId });
  }
  if (typeof reminderId === "string" && RECORD_ID.test(reminderId)) {
    return Object.freeze({ kind: "reminder" as const, id: reminderId });
  }
  // No usable id is not a failure: the payload simply carries no target and
  // every worker, old and new, falls back to `destination`.
  return undefined;
}

export function buildWirePayload(
  type: unknown,
  locale: unknown,
  reminderTitle?: unknown,
  subject?: unknown,
): WirePayload | null {
  if (!isNotificationType(type) || !isNotificationLocale(locale)) return null;
  const copy = COPY[locale][type];
  const body = type === "reminder" ? boundedReminderTitle(reminderTitle) : copy.body;
  if (body === null) return null;
  const target = type === "reminder" ? reminderTarget(subject) : undefined;
  return Object.freeze({
    title: copy.title,
    body,
    destination: `/${locale}${DESTINATION_FOR_TYPE[type]}`,
    type,
    ...(target === undefined ? {} : { target }),
  });
}
