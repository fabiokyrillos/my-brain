/**
 * `2M-NOTIFY-006` and `-007` — what leaves the application, and why it cannot
 * carry anything else.
 *
 * ## The requirement, and the word "construction"
 *
 * *"Any payload that leaves the application's control carries **no content**: no
 * task title, no reminder title, no description, no person, no project, no entry
 * text, no count that could identify an item. It carries `notificationCopy(locale)`
 * and a destination, and nothing else."*
 *
 * And then `-007`: *"the content prohibition is enforced **by construction** —
 * the payload type has nowhere to put content — and a guard fails the build if a
 * content-carrying parameter is added."*
 *
 * So this is not a sanitizer. A sanitizer is a function somebody can forget to
 * call, and the failure is silent and irreversible: the content is already on a
 * third party's server by the time anyone notices. Instead the payload type has
 * **three fields, all closed vocabularies or a bounded path**, and there is no
 * builder that accepts a string from a task, a reminder or an entry. A caller
 * holding a task title has nowhere to put it.
 *
 * ## Why the destination is a route and not a URL
 *
 * `destination` is one of a closed set of app routes, never an arbitrary URL and
 * never one carrying an id. A destination like `/app/work/7f3c…` would leak a
 * record identifier into a push service's logs and into a lock screen's
 * accessibility tree — which is content, in the only sense that matters. The
 * user lands on the surface and finds the thing there, behind their session.
 *
 * ## What the user actually sees
 *
 * One sentence per locale, per type, saying that something is waiting and
 * nothing about what. That is a genuine product cost and it is the signed
 * trade: OD-2M-4 option B authorized push **content-free**, so the lock screen
 * says "you have a reminder waiting" and the app says which one, behind
 * authentication, where the in-app rows already live (`2M-NOTIFY-008`).
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
 * The complete payload. **Three fields, and nowhere to put a fourth.**
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
 * The words a notification carries, **derived from the type and the locale and
 * from nothing else**.
 *
 * The signature is the enforcement: there is no parameter a record's text could
 * arrive through, so no call site can interpolate one. `2M-NOTIFY-007`'s guard
 * asserts exactly that about this function's parameter list, because a future
 * `notificationCopy(locale, type, taskTitle)` would satisfy every test about the
 * *payload* while defeating the requirement entirely.
 */
export function notificationCopy(
  locale: NotificationLocale,
  type: NotificationType,
): Readonly<{ title: string; body: string }> {
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
export function serialiseNotificationPayload(payload: NotificationPayload): Readonly<{
  title: string;
  body: string;
  destination: string;
}> {
  const copy = notificationCopy(payload.locale, payload.type);
  return Object.freeze({ title: copy.title, body: copy.body, destination: payload.destination });
}
