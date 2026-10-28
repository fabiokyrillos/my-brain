/**
 * The notification payload contract shared by the application and the push
 * sender.
 *
 * The owner later superseded Phase 2M's content-free reminder copy: a reminder
 * push should say which reminder fired. The trust boundary remains structural:
 * the external sender request carries only a reminder id, and the trusted
 * sender resolves the visible title by `(user_id, reminder_id)`.
 *
 * ## Why the destination is a route and not a URL
 *
 * `destination` is one of a closed set of app routes, never an arbitrary URL and
 * never one carrying an id. A destination like `/app/work/7f3c…` would leak a
 * record identifier into a push service's logs and into a lock screen's
 * accessibility tree — which is content, in the only sense that matters. The
 * user lands on the surface and finds the thing there, behind their session.
 *
 * The reminder title is trimmed and bounded before it reaches the OS. Other
 * notification kinds keep fixed generic copy. No description, related entity,
 * entry text or arbitrary caller-provided string is admitted.
 */

import { notificationTypes, type NotificationType } from "./consent-contract";

export type NotificationLocale = "pt-BR" | "en";

/**
 * Where a notification may send the user. A closed set of surfaces, and no ids.
 *
 * Each is a route that exists and that lists the thing the notification is
 * about. `2M-NOTIFY-006` forbids "no count that could identify an item"; a path
 * segment identifying one is the same leak with a different shape.
 */
export const notificationDestinations = [
  "/app",
  "/app/notifications",
  "/app/reminders",
  "/app/reviews",
] as const;
export type NotificationDestination = (typeof notificationDestinations)[number];

/**
 * The routing payload. Visible reminder content is resolved separately inside
 * the trusted sender rather than accepted from this caller-controlled object.
 *
 * `Readonly` and exact: TypeScript's excess-property check refuses an object
 * literal with a `title`, and `notification-payload-guard.test.ts` refuses the
 * type gaining one. There is deliberately no index signature, no `data` bag, no
 * `extra`, and no `string` field whose value a caller chooses.
 */
export type NotificationPayload = Readonly<{
  /** Which of the four kinds, so the copy can differ. Never which record. */
  type: NotificationType;
  destination: NotificationDestination;
  locale: NotificationLocale;
}>;

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
 * Build visible copy. Reminder text is explicit, trimmed and bounded; a missing
 * title fails closed instead of falling back to the old generic message.
 */
function boundedReminderTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  if (title.length === 0) return null;
  return title.length <= 240 ? title : `${title.slice(0, 239)}…`;
}

export function notificationCopy(
  locale: NotificationLocale,
  type: NotificationType,
  reminderTitle?: unknown,
): Readonly<{ title: string; body: string }> | null {
  if (type === "reminder") {
    const body = boundedReminderTitle(reminderTitle);
    if (body === null) return null;
    return Object.freeze({ title: COPY[locale].reminder.title, body });
  }
  return Object.freeze({ ...COPY[locale][type] });
}

/**
 * The only way to build a payload.
 *
 * It validates rather than trusts, and it **returns null** for anything outside
 * the two closed sets rather than falling back to a default. A default here
 * would mean a caller that got the type wrong still sends something — and the
 * something it sends is a notification the user did not consent to the kind of.
 */
export function buildNotificationPayload(input: {
  readonly type: unknown;
  readonly destination: unknown;
  readonly locale: unknown;
}): NotificationPayload | null {
  const type = (notificationTypes as readonly unknown[]).includes(input.type)
    ? (input.type as NotificationType)
    : null;
  const destination = (notificationDestinations as readonly unknown[]).includes(input.destination)
    ? (input.destination as NotificationDestination)
    : null;
  const locale = input.locale === "en" || input.locale === "pt-BR" ? input.locale : null;
  if (type === null || destination === null || locale === null) return null;
  return Object.freeze({ type, destination, locale });
}

/**
 * What actually goes on the wire, as the object a sender would serialise.
 *
 * Kept here rather than in the sender so the wire shape is testable **before a
 * sender exists**, which is the whole ordering this slice is built on: 2M.4b may
 * not invent a wire format, it consumes this one.
 */
export const notificationTargetKinds = ["task", "reminder"] as const;
export type NotificationTargetKind = (typeof notificationTargetKinds)[number];

export type NotificationTarget = Readonly<{
  kind: NotificationTargetKind;
  id: string;
}>;

/**
 * What the notification is ABOUT — `NOTIFY-TAP-LANDS-ON-THE-LIST`.
 *
 * The payload still does not choose a destination: that stays a function of
 * the kind, which is the property this module has held since 2M.4a. It may
 * name the ITEM, and the service worker builds the path from a kind it already
 * knows how to open.
 *
 * The task wins when there is one — a reminder attached to a task is about the
 * task's work, and that surface says more than the reminder row does. Ids are
 * shape-checked because what they become is a path segment on a device.
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
  return undefined;
}

export function serialiseNotificationPayload(
  payload: NotificationPayload,
  reminderTitle?: unknown,
  subject?: unknown,
): Readonly<{
  title: string;
  body: string;
  destination: string;
  target?: NotificationTarget;
}> | null {
  const copy = notificationCopy(payload.locale, payload.type, reminderTitle);
  if (copy === null) return null;
  const target = payload.type === "reminder" ? reminderTarget(subject) : undefined;
  return Object.freeze({
    title: copy.title,
    body: copy.body,
    destination: `/${payload.locale}${payload.destination}`,
    ...(target === undefined ? {} : { target }),
  });
}
