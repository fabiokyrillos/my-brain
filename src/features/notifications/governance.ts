/**
 * `2M-NOTIFY-004`, `-005` and `-009` — the six controls that can decide **not**
 * to send, in one place, per channel.
 *
 * ## Why this is a module and not a chain of `if`s inside a sender
 *
 * `2M-NOTIFY-005`: *"quiet hours, the daily cap, the 24-hour per-item cooldown
 * and deduplication continue to hold on every channel, and are proved **on each
 * channel** rather than inherited by assumption from the in-app path."*
 *
 * The heartbeat already implements those controls for the in-app path, in SQL.
 * The tempting thing is to say push inherits them because it is triggered by the
 * same job — and that is precisely the assumption the requirement forbids, for a
 * concrete reason: the in-app row and the push are two deliveries, they can
 * succeed and fail independently, and a cap that counted only in-app rows would
 * let a user who capped themselves at three receive three rows and three pushes.
 *
 * So the decision is a **pure function over declared inputs**, testable without
 * a database, and it returns *which* control refused rather than a boolean.
 * `2M-NOTIFY-009` requires every delivery to be auditable — *what, to which
 * channel, why, when, under which consent* — and "why" is only answerable if the
 * refusal carries its own reason. The six reasons are exactly the six the
 * deployed validator admits, imported rather than restated.
 *
 * ## Order matters, and it is the order of what the user said
 *
 * Consent first, because nothing else is relevant without it. Then the type,
 * then the frequency, then quiet hours, then duplication, then the cooldown,
 * then the cap. The first refusal wins and the rest are not evaluated — a user
 * who has not consented should never produce a `daily_cap` record, which would
 * be the ledger reporting that they hit a ceiling they can never reach.
 *
 * ## Nothing here sends, schedules or persists
 *
 * There is no client, no fetch, no timer and no writer in this file. It decides;
 * 2M.4b's sender obeys. `phase-2m-notification-boundary-guard.test.ts` fails the
 * build if that stops being literally true.
 */

import {
  notificationSuppressionReasons,
  type NotificationChannel,
  type NotificationSuppressionReason,
} from "@/features/product-analytics/contracts";

import {
  consentPermitsDelivery,
  type NotificationConsent,
  type NotificationType,
} from "./consent-contract";

export { notificationSuppressionReasons };
export type { NotificationSuppressionReason };

export type DeliveryDecision =
  | Readonly<{ permitted: true; channel: NotificationChannel }>
  | Readonly<{ permitted: false; channel: NotificationChannel; reason: NotificationSuppressionReason }>;

export type DeliveryRequest = Readonly<{
  channel: NotificationChannel;
  consent: NotificationConsent;
  type: NotificationType;
  /** Minutes since local midnight, in the user's own zone, from the caller's clock. */
  nowLocalMinutes: number;
  /** Deliveries already made **on this channel** in the user's local day. */
  deliveredToday: number;
  /**
   * Minutes since the last delivery **for this same item**, or null when there
   * has been none. The caller identifies the item; this module never sees it.
   */
  minutesSinceSameItem: number | null;
  /** Whether an identical delivery is already in flight or recorded. */
  duplicate: boolean;
}>;

/** `2M-NOTIFY-005`'s 24-hour per-item cooldown, in minutes. */
export const COOLDOWN_MINUTES = 24 * 60;

/**
 * Whether a local clock reading falls inside the user's quiet period.
 *
 * **Wrapping is the normal case, not the edge case.** Quiet hours are almost
 * always 22:30–07:00, which wraps midnight, so a naive `start <= now && now < end`
 * is wrong for every realistic configuration — it would report the middle of the
 * night as loud and the middle of the afternoon as quiet. Exported because the
 * settings surface states the window back to the user and must agree with the
 * predicate that enforces it.
 */
export function isWithinQuietHours(
  nowLocalMinutes: number,
  quietStart: string | null,
  quietEnd: string | null,
): boolean {
  const parse = (value: string | null): number | null => {
    if (typeof value !== "string") return null;
    const match = /^(\d{2}):(\d{2})/.exec(value);
    if (match === null) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const start = parse(quietStart);
  const end = parse(quietEnd);
  // A window the product could not read is **not** quiet: refusing every
  // delivery on an unreadable preference would silence the product for a user
  // who never asked for silence, and the honest failure is the other way.
  if (start === null || end === null) return false;
  if (start === end) return false;
  return start < end
    ? nowLocalMinutes >= start && nowLocalMinutes < end
    : nowLocalMinutes >= start || nowLocalMinutes < end;
}

/**
 * The whole decision, for one channel, for one item.
 *
 * Returns the **first** refusal, which is why the order above is written down
 * rather than left to whoever edits this next.
 */
export function decideDelivery(request: DeliveryRequest): DeliveryDecision {
  const refuse = (reason: NotificationSuppressionReason): DeliveryDecision =>
    Object.freeze({ permitted: false, channel: request.channel, reason });

  if (!consentPermitsDelivery(request.consent.state)) return refuse("not_consented");
  if (!request.consent.enabledTypes.includes(request.type)) return refuse("type_muted");
  /*
   * `off` is a frequency and a refusal at once. It is reported as `type_muted`
   * rather than as a seventh reason, because the deployed vocabulary has six and
   * a seventh would be a migration — and because "the user turned this off" is
   * what both facts mean. The distinction between muting one type and turning
   * every type off is recoverable from the consent record, which the audit row
   * names.
   */
  if (request.consent.frequency === "off") return refuse("type_muted");
  if (isWithinQuietHours(request.nowLocalMinutes, request.consent.quietStart, request.consent.quietEnd)) {
    return refuse("quiet_hours");
  }
  if (request.duplicate) return refuse("duplicate");
  if (request.minutesSinceSameItem !== null && request.minutesSinceSameItem < COOLDOWN_MINUTES) {
    return refuse("cooldown");
  }
  // `>=`, not `>`. A cap of three means the fourth is refused, so a user who has
  // already had three has reached it — an off-by-one here is a user receiving
  // one more interruption per day than they asked for, every day.
  if (request.deliveredToday >= request.consent.dailyCap) return refuse("daily_cap");

  return Object.freeze({ permitted: true, channel: request.channel });
}
